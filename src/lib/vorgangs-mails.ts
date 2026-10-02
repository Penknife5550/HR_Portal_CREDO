/**
 * Mailprotokoll je Vorgang (Reiter „E-Mails“ in den Vorgangsmodulen).
 *
 * Rein und client-sicher. Das Versandprotokoll (`EmailLog`) kannte bisher
 * keinen Vorgang; seit 09/2026 traegt jede Zeile `vorgangTyp`/`vorgangId`.
 * Gesetzt werden sie an EINER Stelle — `sendEventEmail` (mailer.ts) leitet den
 * Bezug mit `vorgangBezugAusPayload` aus dem Payload ab. So muss keine der
 * rund hundert Aufrufstellen etwas davon wissen, und eine neue Mail landet
 * automatisch im Reiter, sobald ihr Payload die Vorgangs-ID traegt.
 *
 * Regeln:
 *  - Nur die Schluessel in VORGANG_SCHLUESSEL zaehlen, in dieser Reihenfolge.
 *    Ein Payload mit zwei Bezuegen (etwa Offboarding mit Vertragsende-Bezug)
 *    gehoert zum ersten Treffer.
 *  - Ein Event kann seinen Bezug ausdruecklich festlegen (EVENT_BEZUG), wenn
 *    die ID dort unter einem mehrdeutigen Schluessel steht (`processId`).
 *  - Sonst `modul` + `refId` (Unterlagen). Wer `sendEventEmail` direkt ruft
 *    und den Bezug nicht im Payload traegt, gibt ihn als Option `bezug` mit
 *    (Dokumentenpaket).
 *  - Sammelmails ueber mehrere Vorgaenge (Verbeamtungs-Fristen, „unbearbeitete
 *    Vertragsenden“, Bericht eines automatischen Laufs) haben keinen Bezug und
 *    stehen nur im allgemeinen Versandprotokoll.
 *  - BEM NIE: Die Faelle sind eine versiegelte Akte; auch HR sieht sie nur mit
 *    Freigabe. `bemFallId` wird bewusst nicht ausgewertet (BEM hat sein
 *    eigenes Kommunikationsprotokoll im Fall).
 *  - Test-Versand NIE (Beispiel-IDs aus dem Katalog).
 *
 * Aeltere Zeilen (vor 09/2026) haben keinen Bezug und stehen nur im
 * allgemeinen Versandprotokoll. Alles wird nach 90 Tagen geloescht.
 */

import { getEventDefinition } from "@/lib/events";

export type VorgangTyp = "ONBOARDING" | "OFFBOARDING" | "CIVIL_SERVICE" | "CONTRACT_END" | "ELTERNZEIT" | "MUTTERSCHUTZ";

export interface VorgangBezug {
  vorgangTyp: VorgangTyp;
  vorgangId: string;
}

/** Payload-Schluessel → Vorgangsart, in Prioritaetsreihenfolge. */
export const VORGANG_SCHLUESSEL: ReadonlyArray<readonly [string, VorgangTyp]> = [
  ["onboardingId", "ONBOARDING"],
  ["offboardingId", "OFFBOARDING"],
  ["civilServiceId", "CIVIL_SERVICE"],
  ["contractEndId", "CONTRACT_END"],
  ["elternzeitId", "ELTERNZEIT"],
  ["mutterschutzId", "MUTTERSCHUTZ"],
];

/**
 * Events, deren Vorgangs-ID unter einem mehrdeutigen Schluessel steht:
 * Event → [Schluessel, Vorgangsart].
 */
export const EVENT_BEZUG: Readonly<Record<string, readonly [string, VorgangTyp]>> = {};

/**
 * Modulnamen aus Dokumentenpaket und Unterlagen (Payload-Feld `modul` bzw.
 * Option `modul`) → Vorgangsart. Die Vertragsverlaengerung ist kein eigener
 * Vorgang: ihre `refId` ist die ID des Vertragsende-Vorgangs.
 */
export const MODUL_ZU_VORGANGSTYP: Readonly<Record<string, VorgangTyp>> = {
  ONBOARDING: "ONBOARDING",
  OFFBOARDING: "OFFBOARDING",
  VERBEAMTUNG: "CIVIL_SERVICE",
  CIVIL_SERVICE: "CIVIL_SERVICE",
  VERTRAGSENDE: "CONTRACT_END",
  CONTRACT_END: "CONTRACT_END",
  VERTRAGSVERLAENGERUNG: "CONTRACT_END",
  ELTERNZEIT: "ELTERNZEIT",
  MUTTERSCHUTZ: "MUTTERSCHUTZ",
};

/** Bezug aus Modulname und Vorgangs-ID (Dokumentenpaket, Unterlagen). */
export function bezugAusModul(modul: unknown, refId: unknown): VorgangBezug | null {
  const typ = typeof modul === "string" ? MODUL_ZU_VORGANGSTYP[modul] : undefined;
  const id = alsId(refId);
  return typ && id ? { vorgangTyp: typ, vorgangId: id } : null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function alsId(wert: unknown): string | null {
  return typeof wert === "string" && UUID.test(wert) ? wert : null;
}

export function vorgangBezugAusPayload(event: string, payload: Record<string, unknown>): VorgangBezug | null {
  const fest = EVENT_BEZUG[event];
  if (fest) {
    const id = alsId(payload[fest[0]]);
    return id ? { vorgangTyp: fest[1], vorgangId: id } : null;
  }
  for (const [schluessel, typ] of VORGANG_SCHLUESSEL) {
    const id = alsId(payload[schluessel]);
    if (id) return { vorgangTyp: typ, vorgangId: id };
  }
  // Unterlagen nachfordern (Stufe 2: jedes Modul) traegt `modul` + `refId`.
  return bezugAusModul(payload.modul, payload.refId);
}

// ---------------------------------------------
// Module (URL-Segment der Route ↔ Vorgangsart)
// ---------------------------------------------

/** URL-Segment in /api/vorgaenge/[modul]/[id]/mails — die englischen Modulnamen der Schnittstellen (nicht die der Seiten, src/lib/adressen.ts). */
export const VORGANGS_MODULE: Readonly<Record<string, VorgangTyp>> = {
  onboarding: "ONBOARDING",
  offboarding: "OFFBOARDING",
  "civil-service": "CIVIL_SERVICE",
  "contract-end": "CONTRACT_END",
  elternzeit: "ELTERNZEIT",
  mutterschutz: "MUTTERSCHUTZ",
};

// ---------------------------------------------
// Zeilen fuer den Reiter
// ---------------------------------------------

export interface VorgangsMailZeile {
  id: string;
  zeitpunkt: string;
  event: string;
  ereignisName: string;
  status: string;
  statusText: string;
  betreff: string;
  empfaenger: string;
  cc: string | null;
  bcc: string | null;
  /** Grund bei FAILED/SKIPPED (Text des Mailers). */
  grund: string | null;
  /** Anhaenge bei SENT (Vermerk des Mailers, z. B. beim Dokumentenpaket). */
  anhang: string | null;
}

export interface VorgangsMailAntwort {
  eintraege: VorgangsMailZeile[];
  hinweis: string;
}

export const MAIL_STATUS_TEXTE: Record<string, string> = {
  SENT: "versendet",
  FAILED: "fehlgeschlagen",
  SKIPPED: "nicht versendet",
};

export const VORGANGS_MAIL_HINWEIS =
  "Aus dem Versandprotokoll, neueste zuerst. Einträge werden nach 90 Tagen gelöscht. Mails, die vor Einführung dieses Reiters verschickt wurden, stehen nur unter Einstellungen → Versandprotokoll.";

/** Hoechstens so viele Zeilen je Vorgang. */
export const VORGANGS_MAIL_LIMIT = 300;

export function mailZeileBauen(log: {
  id: string;
  createdAt: Date;
  event: string;
  status: string;
  subject: string;
  recipient: string;
  cc: string | null;
  bcc: string | null;
  detail: string | null;
}): VorgangsMailZeile {
  const gesendet = log.status === "SENT";
  return {
    id: log.id,
    zeitpunkt: log.createdAt.toISOString(),
    event: log.event,
    ereignisName: getEventDefinition(log.event)?.name ?? log.event,
    status: log.status,
    statusText: MAIL_STATUS_TEXTE[log.status] ?? log.status,
    betreff: log.subject,
    empfaenger: log.recipient,
    cc: log.cc || null,
    bcc: log.bcc || null,
    grund: gesendet ? null : log.detail || null,
    anhang: gesendet ? log.detail || null : null,
  };
}
