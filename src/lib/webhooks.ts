/**
 * CREDO HR-Portal – Event-Dispatcher (E-Mail primaer, Webhooks optional)
 *
 * Ablauf:
 * 1. E-Mail-Versand per SMTP (primaerer Kanal) — Vorlage + Empfaenger aus
 *    EmailTemplate/Event-Katalog, jeder Versuch wird im EmailLog protokolliert
 * 2. Aktive DB-Webhooks fuer das Event ZUSAETZLICH ausfuehren (z.B. fuer
 *    n8n-Automatisierungen) — sie sind kein Ersatz fuer den E-Mail-Versand
 *
 * Alle Webhooks werden ausschliesslich ueber die Datenbank konfiguriert
 * und im Admin-Portal (Einstellungen → Webhooks) verwaltet.
 *
 * Wichtige Eigenschaften:
 * - **Wirft NIEMALS** nach aussen (Vertrag: alle Aufrufer duerfen ohne try/catch arbeiten)
 * - Webhooks werden parallel via Promise.allSettled ausgefuehrt
 * - SSRF-Schutz: Hostnamen werden vor dem Versand auf private/loopback IPs geprueft
 * - URL-Logs sind redacted (keine Query-Parameter mit Tokens)
 */

import { prisma } from "@/lib/db";
import { sendEventEmail } from "@/lib/mailer";
import { decrypt } from "@/lib/encryption";
import { isPublicHostname, redactUrlForLog } from "@/lib/url";

// Bekannte Event-Typen (erweiterbar)
export type WebhookEvent =
  // Onboarding
  | "onboarding-created"
  | "questionnaire-completed"
  | "supervisor-link-created"
  | "supervisor-completed"
  | "employee-reminder"
  | "supervisor-reminder"
  // Offboarding
  | "offboarding-created"
  | "offboarding-completed"
  | "offboarding-department-assigned"
  | "offboarding-department-completed"
  | "offboarding-task-completed"
  | "offboarding-task-overdue"
  | "offboarding-reminder"
  // Verbeamtung (Phase A)
  | "psi-created"
  | "psi-phase-completed"
  | "psi-completed"
  | "psi-deadline-warning"
  // Verbeamtung — Beurteilungs-Workflow (Phase 4 + 5)
  | "psi-assessment-requested"
  | "psi-assessment-completed"
  | "psi-assessment-released"
  | "psi-assessment-acknowledged"
  | "psi-assessment-archived"
  // Erweiterbar
  | (string & Record<never, never>);

const MAX_RETRIES = 3;
const TIMEOUT_MS = 10_000;

// =============================================
// Haupt-Funktion: E-Mail primaer, Webhooks zusaetzlich
// VERTRAG: Wirft NIEMALS — alle Fehler werden geloggt und geschluckt.
// =============================================
export async function triggerWebhooks(
  event: WebhookEvent,
  payload: Record<string, unknown>
): Promise<void> {
  try {
    // 1. Primaerer Kanal: E-Mail per SMTP
    //    sendEventEmail wirft nicht und protokolliert jedes Ergebnis im EmailLog
    await sendEventEmail(event, payload);

    // 2. Zusatzkanal: DB-konfigurierte Webhooks (unabhaengig vom E-Mail-Ergebnis)
    try {
      const dbWebhooks = await prisma.webhookConfig.findMany({
        where: { event, isActive: true },
      });

      if (dbWebhooks.length > 0) {
        // Parallele Ausfuehrung via Promise.allSettled
        // Vorteil: ein langsamer Webhook blockiert die anderen nicht
        const settled = await Promise.allSettled(
          dbWebhooks.map((webhook) =>
            sendToWebhook(webhook.url, buildHeaders(webhook), payload)
          )
        );
        for (const s of settled) {
          if (s.status === "rejected") {
            console.error(
              `[Webhooks] Unerwartete Exception bei "${event}":`,
              s.reason instanceof Error ? s.reason.message : s.reason
            );
          }
        }
      }
    } catch (dbError) {
      console.error(
        `[Webhooks] DB-Webhooks für "${event}" konnten nicht geladen werden:`,
        dbError instanceof Error ? dbError.message : dbError
      );
    }
  } catch (unexpected) {
    // Letzte Sicherung — sollte nie greifen, aber garantiert "wirft niemals"
    console.error(
      `[Webhooks] Unerwarteter Fehler in triggerWebhooks für "${event}":`,
      unexpected instanceof Error ? unexpected.message : unexpected
    );
  }
}

// =============================================
// Auth-Header für DB-Webhooks aufbauen
// Wirft niemals — bei Decrypt-Fehler wird der Webhook ohne Auth-Header gesendet
// und der Empfaenger wird ihn (idealerweise) ablehnen.
// =============================================
function buildHeaders(webhook: {
  authType: string;
  authHeader: string | null;
  authValue: string | null;
}): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };

  let decryptedValue: string | null = null;
  if (webhook.authValue) {
    try {
      decryptedValue = decrypt(webhook.authValue);
    } catch (err) {
      console.error(
        "[Webhooks] Konnte Auth-Wert nicht entschluesseln (Schlüssel rotiert oder Ciphertext korrupt):",
        err instanceof Error ? err.message : err
      );
      decryptedValue = null;
    }
  }

  switch (webhook.authType) {
    case "api_key":
      if (webhook.authHeader && decryptedValue) {
        headers[webhook.authHeader] = decryptedValue;
      }
      break;
    case "bearer":
      if (decryptedValue) {
        headers["Authorization"] = `Bearer ${decryptedValue}`;
      }
      break;
    case "basic":
      if (webhook.authHeader && decryptedValue) {
        const encoded = Buffer.from(
          `${webhook.authHeader}:${decryptedValue}`
        ).toString("base64");
        headers["Authorization"] = `Basic ${encoded}`;
      }
      break;
  }

  return headers;
}

// =============================================
// HTTP-Versand mit Retry, Timeout und SSRF-Schutz
// =============================================
async function sendToWebhook(
  url: string,
  headers: Record<string, string>,
  payload: Record<string, unknown>
): Promise<boolean> {
  const safeUrl = redactUrlForLog(url);

  // SSRF-Schutz: Hostname pruefen, bevor wir tatsaechlich anfragen
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    console.error(`[Webhooks] Ungueltige URL: ${safeUrl}`);
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    console.error(`[Webhooks] Unerlaubtes Protokoll bei ${safeUrl}`);
    return false;
  }
  // In Entwicklung erlauben wir explizit localhost-Endpunkte
  const allowPrivate = process.env.WEBHOOK_ALLOW_PRIVATE === "1";
  if (!allowPrivate) {
    const isPublic = await isPublicHostname(parsed.hostname);
    if (!isPublic) {
      console.error(
        `[Webhooks] SSRF-Schutz: Webhook-URL ${safeUrl} zeigt auf eine private/loopback Adresse — wird abgelehnt.`
      );
      return false;
    }
  }

  // Body einmal aufbauen — bei zirkulaeren Strukturen werfen, aber Fehler fangen
  let body: string;
  try {
    body = JSON.stringify(payload);
  } catch (err) {
    console.error(
      `[Webhooks] Payload-Serialisierung fehlgeschlagen für ${safeUrl}:`,
      err instanceof Error ? err.message : err
    );
    return false;
  }

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers,
        body,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (response.ok) return true;

      console.warn(
        `[Webhooks] ${safeUrl} Versuch ${attempt}/${MAX_RETRIES}: HTTP ${response.status}`
      );
    } catch (error) {
      console.warn(
        `[Webhooks] ${safeUrl} Versuch ${attempt}/${MAX_RETRIES}:`,
        error instanceof Error ? error.message : error
      );
    }

    if (attempt < MAX_RETRIES) {
      await new Promise((r) => setTimeout(r, attempt * 2_000));
    }
  }

  console.error(`[Webhooks] ${safeUrl} endgültig fehlgeschlagen nach ${MAX_RETRIES} Versuchen.`);
  return false;
}

// =============================================
// Test-Funktion für einen einzelnen Webhook (Admin-Portal)
// =============================================
export async function testWebhook(webhookId: string): Promise<{
  success: boolean;
  statusCode?: number;
  error?: string;
  durationMs: number;
}> {
  const webhook = await prisma.webhookConfig.findUnique({
    where: { id: webhookId },
  });

  if (!webhook) {
    return { success: false, error: "Webhook nicht gefunden", durationMs: 0 };
  }

  const headers = buildHeaders(webhook);
  const testPayload = {
    event: webhook.event,
    test: true,
    timestamp: new Date().toISOString(),
    source: "CREDO HR-Portal Test",
  };

  const start = Date.now();
  try {
    const response = await fetch(webhook.url, {
      method: "POST",
      headers,
      body: JSON.stringify(testPayload),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    return {
      success: response.ok,
      statusCode: response.status,
      error: response.ok ? undefined : `HTTP ${response.status}: ${response.statusText}`,
      durationMs: Date.now() - start,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unbekannter Fehler",
      durationMs: Date.now() - start,
    };
  }
}
