/**
 * CREDO HR-Portal – n8n Webhook Integration (Rueckwaertskompatibilitaet)
 *
 * triggerN8nWebhook delegiert an den Event-Dispatcher (lib/webhooks.ts):
 *   1. E-Mail-Versand per SMTP (primaerer Kanal)
 *   2. DB-konfigurierte Webhooks als optionaler Zusatzkanal (z.B. n8n)
 */

export type { WebhookEvent } from "@/lib/webhooks";
export { triggerWebhooks as triggerN8nWebhook } from "@/lib/webhooks";
