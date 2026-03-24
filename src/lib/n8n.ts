/**
 * CREDO HR-Portal – n8n Webhook Integration
 *
 * Rueckwaertskompatibilitaet: triggerN8nWebhook delegiert jetzt an
 * den einheitlichen Webhook-Dispatcher (lib/webhooks.ts), der:
 *   1. n8n via ENV auslöst
 *   2. alle DB-konfigurierten Webhooks auslöst
 *   3. SMTP als Fallback nutzt wenn alle Kanaele fehlschlagen
 */

export type { WebhookEvent } from "@/lib/webhooks";
export { triggerWebhooks as triggerN8nWebhook } from "@/lib/webhooks";
