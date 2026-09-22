/**
 * CREDO HR-Portal – Ereignisliste fuer die Einstellungen (client-sicher)
 *
 * Abgeleitet aus dem Event-Katalog (src/lib/events.ts). Genutzt vom Reiter
 * „Webhooks“ (Gruppen, Auswahl im Dialog) und vom Event-Filter im
 * Versandprotokoll.
 *
 * Warum abgeleitet statt hart kodiert: Die fruehere Liste WEBHOOK_EVENTS in
 * einstellungen-content.tsx war von Hand gepflegt und veraltete mit jedem
 * neuen Modul — es fehlten u.a. alle Vertragsende-Ereignisse, die
 * Ablaufwarnungen befristeter Nachweise und die Dokumentenpaket-Ereignisse,
 * dafuer standen drei Ereignisse darin, die das Portal nie ausloest. Webhooks
 * auf fehlende Ereignisse waren im Reiter unsichtbar, und das Versandprotokoll
 * liess sich nicht danach filtern. Jetzt erscheint jedes Katalog-Event
 * automatisch, und nur diese.
 *
 * Client-sicher: importiert nur events.ts, und das kommt ohne eigene Imports
 * aus (reine Daten). NICHT von hier aus mailer.ts, webhooks.ts oder
 * dokumentenpaket.ts importieren — die ziehen Prisma und nodemailer ins
 * Browser-Bundle.
 */

import { EVENT_CATALOG, EVENT_GROUP_ORDER, type EventGroup } from "@/lib/events";

/**
 * Ereignisse, auf die ein Webhook zwar angelegt werden kann, aber nie feuert —
 * mit dem Grund, den die Oberflaeche anzeigt.
 *
 * Die vier Dokumentenpaket-Ereignisse: dokumentenpaket.ts ruft sendEventEmail
 * DIREKT statt ueber den Dispatcher triggerWebhooks. Der Dispatcher reicht
 * weder Anhaenge noch die abweichende Empfaengeradresse durch; ihn dafuer zu
 * erweitern hiesse, bis zu 15 MB Personalunterlagen an eine frei
 * konfigurierbare Webhook-URL zu schicken (bewusste Ausnahme, siehe
 * CLAUDE.md, Abschnitt „Dokumente & Starterpaket“). Ein Test gleicht diese
 * Liste mit den Events in dokumentenpaket.ts ab — kommt dort ein Modul hinzu,
 * faellt er auf.
 */
const DOKUMENTENPAKET_HINWEIS =
  "Webhooks auf dieses Ereignis feuern nicht: Das Dokumentenpaket wird mit Anhängen direkt per SMTP versendet, ohne Webhook-Aufruf.";

export const EVENTS_OHNE_WEBHOOK: Readonly<Record<string, string>> = {
  "onboarding-starter-packet-sent": DOKUMENTENPAKET_HINWEIS,
  "offboarding-documents-sent": DOKUMENTENPAKET_HINWEIS,
  "civil-service-documents-sent": DOKUMENTENPAKET_HINWEIS,
  "contract-renewal-documents-sent": DOKUMENTENPAKET_HINWEIS,
};

export interface EreignisOption {
  /** Technischer Event-Name (== WebhookConfig.event / EmailLog.event) */
  value: string;
  /** Anzeigename wie unter Einstellungen → E-Mail-Vorlagen */
  label: string;
  group: EventGroup;
  /** false = im Katalog definiert, wird aber von keiner Stelle ausgeloest */
  wired: boolean;
  /** Gesetzt, wenn Webhooks auf dieses Ereignis nie feuern (mit Grund) */
  webhookHinweis: string | null;
}

export interface EreignisGruppe {
  group: EventGroup;
  events: EreignisOption[];
}

/**
 * Alle Katalog-Events, geordnet nach EVENT_GROUP_ORDER und innerhalb einer
 * Gruppe in Katalog-Reihenfolge (die fachlich sortiert ist: Einladung vor
 * Erinnerung vor Abschluss).
 */
export const EREIGNIS_GRUPPEN: EreignisGruppe[] = EVENT_GROUP_ORDER.map((group) => ({
  group,
  events: EVENT_CATALOG.filter((def) => def.group === group).map((def) => ({
    value: def.event,
    label: def.name,
    group: def.group,
    wired: def.wired,
    webhookHinweis: EVENTS_OHNE_WEBHOOK[def.event] ?? null,
  })),
})).filter((gruppe) => gruppe.events.length > 0);

/** Flache Liste in derselben Reihenfolge wie EREIGNIS_GRUPPEN. */
export const EREIGNIS_OPTIONEN: EreignisOption[] = EREIGNIS_GRUPPEN.flatMap((g) => g.events);

const optionNachEvent = new Map(EREIGNIS_OPTIONEN.map((o) => [o.value, o]));

/** Option zu einem Event-Namen; `undefined` fuer Events ausserhalb des Katalogs. */
export function ereignisOption(event: string | null | undefined): EreignisOption | undefined {
  return event ? optionNachEvent.get(event) : undefined;
}

/**
 * Beschriftung fuer eine Auswahlliste: Name, bei nie ausgeloesten Events mit
 * Zusatz — so faellt es schon beim Auswaehlen auf, nicht erst beim Warten auf
 * den ersten Aufruf.
 */
export function ereignisOptionLabel(option: EreignisOption): string {
  return option.wired ? option.label : `${option.label} (wird nie ausgelöst)`;
}
