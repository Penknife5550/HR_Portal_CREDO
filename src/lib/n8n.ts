/**
 * CREDO HR-Portal – n8n Webhook Integration
 *
 * Zentrale Funktion fuer alle ausgehenden n8n-Webhook-Aufrufe.
 * - Liest N8N_WEBHOOK_BASE_URL und N8N_API_KEY aus der Umgebung
 * - Sendet JSON-Payload mit optionalem API-Key-Header
 * - Retry mit exponentiellem Backoff (3 Versuche)
 * - Nicht-blockierend: Fehler werden geloggt, aber nicht geworfen
 */

type WebhookEvent =
  | "onboarding-created"
  | "questionnaire-completed"
  | "supervisor-link-created"
  | "supervisor-completed";

const MAX_RETRIES = 3;
const TIMEOUT_MS = 10000;

export async function triggerN8nWebhook(
  event: WebhookEvent,
  payload: Record<string, unknown>
): Promise<void> {
  const baseUrl = process.env.N8N_WEBHOOK_BASE_URL;
  if (!baseUrl) return;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  const apiKey = process.env.N8N_API_KEY;
  if (apiKey) {
    headers["X-API-Key"] = apiKey;
  }

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(`${baseUrl}/${event}`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (response.ok) return;

      console.error(
        `n8n Webhook ${event} Versuch ${attempt}/${MAX_RETRIES}: HTTP ${response.status}`
      );
    } catch (error) {
      console.error(
        `n8n Webhook ${event} Versuch ${attempt}/${MAX_RETRIES}:`,
        error instanceof Error ? error.message : error
      );
    }

    if (attempt < MAX_RETRIES) {
      await new Promise((r) => setTimeout(r, attempt * 2000));
    }
  }

  console.error(
    `n8n Webhook ${event} ENDGUELTIG fehlgeschlagen nach ${MAX_RETRIES} Versuchen. Payload:`,
    JSON.stringify(payload)
  );
}
