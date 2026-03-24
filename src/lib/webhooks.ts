/**
 * CREDO HR-Portal – Einheitlicher Webhook-Dispatcher
 *
 * Alle Webhooks werden ausschliesslich ueber die Datenbank konfiguriert
 * und im Admin-Portal (Einstellungen → Webhooks) verwaltet.
 *
 * Ablauf:
 * 1. Aktive DB-Webhooks fuer das Event laden und ausfuehren
 * 2. SMTP-Fallback falls kein Webhook erfolgreich war
 *
 * Keine Umgebungsvariablen fuer Webhooks – alles laeuft ueber die DB.
 */

import { prisma } from "@/lib/db";
import { sendEmailFallback } from "@/lib/mailer";
import { decrypt } from "@/lib/encryption";

// Bekannte Event-Typen (erweiterbar)
export type WebhookEvent =
  | "onboarding-created"
  | "questionnaire-completed"
  | "supervisor-link-created"
  | "supervisor-completed"
  | (string & Record<never, never>); // erlaubt zukuenftige Events als Strings

const MAX_RETRIES = 3;
const TIMEOUT_MS = 10_000;

// =============================================
// Haupt-Funktion: Alle Kanaele ausloesen
// =============================================
export async function triggerWebhooks(
  event: WebhookEvent,
  payload: Record<string, unknown>
): Promise<void> {
  const results: boolean[] = [];

  // DB-konfigurierte Webhooks laden und ausfuehren
  try {
    const dbWebhooks = await prisma.webhookConfig.findMany({
      where: { event, isActive: true },
    });

    if (dbWebhooks.length === 0) {
      console.warn(`[Webhooks] Keine aktiven Webhooks fuer "${event}" konfiguriert`);
    }

    for (const webhook of dbWebhooks) {
      const success = await sendToWebhook(webhook.url, buildHeaders(webhook), payload);
      results.push(success);
    }
  } catch (dbError) {
    console.error(`[Webhooks] DB-Webhooks fuer "${event}" konnten nicht geladen werden:`, dbError);
  }

  // SMTP-Fallback: nur wenn kein Kanal erfolgreich war
  const anySuccess = results.some(Boolean);
  if (!anySuccess) {
    console.warn(`[Webhooks] Kein Webhook fuer "${event}" erfolgreich – versuche SMTP-Fallback`);
    await sendEmailFallback(event, payload).catch((err) =>
      console.error("[Webhooks] SMTP-Fallback fehlgeschlagen:", err)
    );
  }
}

// =============================================
// Auth-Header fuer DB-Webhooks aufbauen
// =============================================
function buildHeaders(webhook: {
  authType: string;
  authHeader: string | null;
  authValue: string | null;
}): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const decryptedValue = webhook.authValue ? decrypt(webhook.authValue) : null;

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
// HTTP-Versand mit Retry und Timeout
// =============================================
async function sendToWebhook(
  url: string,
  headers: Record<string, string>,
  payload: Record<string, unknown>
): Promise<boolean> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (response.ok) return true;

      console.warn(
        `[Webhooks] ${url} Versuch ${attempt}/${MAX_RETRIES}: HTTP ${response.status}`
      );
    } catch (error) {
      console.warn(
        `[Webhooks] ${url} Versuch ${attempt}/${MAX_RETRIES}:`,
        error instanceof Error ? error.message : error
      );
    }

    if (attempt < MAX_RETRIES) {
      await new Promise((r) => setTimeout(r, attempt * 2_000));
    }
  }

  console.error(`[Webhooks] ${url} endgueltig fehlgeschlagen nach ${MAX_RETRIES} Versuchen.`);
  return false;
}

// =============================================
// Test-Funktion fuer einen einzelnen Webhook (Admin-Portal)
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
