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
 *
 * Die drei Mails der Nachforderung an die Person (Paket 4, zweite begruendete
 * Ausnahme): Sie tragen den persoenlichen Upload-Link, einen Zugang zur
 * Personalakte. triggerWebhooks reichte die Payload samt Link an jede frei
 * konfigurierte Webhook-URL weiter — deshalb ruft der Dienst sendEventEmail
 * direkt. Die beiden HR-Mails der Nachforderung (vollstaendig, Frist
 * verstrichen) laufen dagegen ueber den Dispatcher und stehen NICHT hier.
 *
 * Die BEM-Fristenerinnerung (dritte begruendete Ausnahme, Zeitplaner 09/2026):
 * Empfaenger sind nur die im Fall freigegebenen Beauftragten; Fallnummer und
 * Fristart gehoeren an keine frei konfigurierbare Webhook-URL.
 *
 * Die individuelle E-Mail aus einem Vorgang (Paket 3, 10/2026): dieselbe
 * Begruendung wie beim Dokumentenpaket — Anhaenge, die HR vom eigenen PC
 * waehlt, und eine im Dialog gewaehlte Adresse (overrideTo). Ein Test haelt
 * individuelle-mail-dienst.ts gegen diese Liste.
 *
 * Die Mails der Onboarding-Abteilungsaufgaben (Ausstattung & Zugaenge, Paket
 * A3, Entscheidung E-A16, Feinplan F1/F18): Die Payload traegt den Link der
 * Stelle (Zugang zur Aufgabenseite), kuenftig auch Bemerkungen und Angaben
 * zur Ausstattung — nichts davon gehoert an eine frei konfigurierbare
 * Webhook-URL. Anders als die vier Ausnahmen oben laufen diese Mails WEITER
 * ueber triggerWebhooks; der Dispatcher laesst fuer jedes Ereignis dieser
 * Liste seinen Webhook-Schritt aus (`webhooksGesperrt`). Die Liste ist damit
 * nicht nur Anzeigetext, sondern eine wirksame Sperre — auch fuer kuenftige
 * Aufrufer. Im Versandkern der Abteilungsaufgaben liefert `webhookAktiv` fuer
 * diese Ereignisse `false`: Die WEBHOOK-Regel („SKIPPED bei aktivem Webhook
 * zaehlt als zugestellt") gilt nur noch im Offboarding. Die Offboarding-
 * Abteilungsereignisse stehen bewusst NICHT hier. Ebenso gesperrt sind die
 * Sammelmail an HR `onboarding-ausstattung-offen` (E-A18, F18): Sie nennt die
 * offenen Ausstattungsaufgaben mit Stelle und Namen der Person — und die
 * Absage `onboarding-department-abgesagt` (E-A20, F18): Sie nennt die schon
 * erledigten Aufgaben einer Stelle samt Namen der Person (ohne Link).
 */
const DOKUMENTENPAKET_HINWEIS =
  "Webhooks auf dieses Ereignis feuern nicht: Das Dokumentenpaket wird mit Anhängen direkt per SMTP versendet, ohne Webhook-Aufruf.";

const BEM_HINWEIS =
  "Webhooks auf dieses Ereignis feuern nicht: BEM-Fälle sind vertraulich, die Erinnerung geht nur direkt per SMTP an die im Fall freigegebenen Beauftragten.";

const UNTERLAGEN_HINWEIS =
  "Webhooks auf dieses Ereignis feuern nicht: Die Mail enthält den persönlichen Upload-Link und wird deshalb direkt per SMTP versendet, ohne Webhook-Aufruf.";

const INDIVIDUELLE_MAIL_HINWEIS =
  "Webhooks auf dieses Ereignis feuern nicht: Die individuelle E-Mail wird mit ihren Anhängen direkt per SMTP versendet, ohne Webhook-Aufruf.";

const AUSSTATTUNG_HINWEIS =
  "Webhooks auf dieses Ereignis feuern nicht: Die Mail enthält den Link der Stelle bzw. Angaben zur Ausstattung und wird deshalb nur per SMTP versendet.";

export const EVENTS_OHNE_WEBHOOK: Readonly<Record<string, string>> = {
  "individuelle-mail": INDIVIDUELLE_MAIL_HINWEIS,
  "onboarding-department-assigned": AUSSTATTUNG_HINWEIS,
  "onboarding-department-reminder": AUSSTATTUNG_HINWEIS,
  "onboarding-task-completed": AUSSTATTUNG_HINWEIS,
  "onboarding-department-completed": AUSSTATTUNG_HINWEIS,
  // Absage an die informierten Stellen (E-A20, F18): erledigte Aufgaben samt Person.
  "onboarding-department-abgesagt": AUSSTATTUNG_HINWEIS,
  // Sammelmail an HR (E-A18, F18): Titel und Stellen der offenen Ausstattung.
  "onboarding-ausstattung-offen": AUSSTATTUNG_HINWEIS,
  "onboarding-starter-packet-sent": DOKUMENTENPAKET_HINWEIS,
  "offboarding-documents-sent": DOKUMENTENPAKET_HINWEIS,
  "civil-service-documents-sent": DOKUMENTENPAKET_HINWEIS,
  "contract-renewal-documents-sent": DOKUMENTENPAKET_HINWEIS,
  "unterlagen-angefordert": UNTERLAGEN_HINWEIS,
  "unterlagen-erinnerung": UNTERLAGEN_HINWEIS,
  "unterlage-zurueckgewiesen": UNTERLAGEN_HINWEIS,
  "bem-frist-erinnerung": BEM_HINWEIS,
};

/**
 * Feuern Webhooks auf dieses Ereignis nie? Wirksam an zwei Stellen: In
 * triggerWebhooks entfaellt der Webhook-Schritt (die Mail geht unveraendert
 * hinaus), und der Versandkern der Abteilungsaufgaben wertet ein SKIPPED nie
 * als „an Webhook uebergeben" (WEBHOOK-Regel nur im Offboarding).
 *
 * Eigene Eigenschaft statt `EVENTS_OHNE_WEBHOOK[event]`: Ein Name wie
 * "toString" faende sonst die geerbte Methode des Objekts.
 */
export function webhooksGesperrt(event: string): boolean {
  return Object.prototype.hasOwnProperty.call(EVENTS_OHNE_WEBHOOK, event);
}

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
