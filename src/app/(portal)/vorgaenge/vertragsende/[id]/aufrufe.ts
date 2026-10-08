/**
 * Neue Detailseite Vertragsende: die Aufrufe der Schnittstellen.
 *
 * DIESELBEN Aufrufe wie die alte Ansicht (`dashboard/contract-end/[id]/
 * contract-end-detail-content.tsx`) — Methode, Adresse, Körper. Der Pilot
 * ändert keine Fachlogik; ein Test hält die Tabelle gegen die alte Datei.
 * Neu ist nur „stornieren" (P-F2): Die Route kann es seit jeher
 * (`CONTRACT_END_UEBERGAENGE`), die alte Ansicht bot es nicht an.
 *
 * `aufrufen` wirft nie: Es liefert entweder die Antwort oder den Fehlertext
 * der Route (sonst einen festen Ersatztext), damit der Dialog ihn zeigen kann.
 *
 * Versandergebnis (seit 10/2026): `/supervisor-link` und `/reminder` nennen in
 * ihrer Antwort `mailStatus` — bei Erfolg SENT oder WEBHOOK (Vorlage im Portal
 * aus, ein aktiver Webhook uebernimmt), bei 502/409 FAILED bzw. SKIPPED.
 * `aufrufen` reicht ihn in BEIDEN Ergebnissen durch, wenn die Antwort einen
 * hat. Ein Fehler MIT `mailStatus` heisst: Die Route hat gespeichert, nur die
 * Mail ging nicht hinaus (bei der Anfrage: neuer Link gespeichert, ein
 * frueherer tot) — die Seite muss dann neu laden.
 */

export type AufrufArt =
  | "anfrage-senden"
  | "erinnern"
  | "offboarding-anlegen"
  | "vertrag-erfassen"
  | "abschliessen"
  | "stornieren"
  | "mav-setzen";

export interface Aufruf {
  url: string;
  method: "POST" | "PATCH";
  /** Ohne Körper (`/reminder`, `/nicht-uebernehmen`) auch ohne `Content-Type`. */
  body?: Record<string, string>;
  /** Text, wenn die Route keinen eigenen Fehler nennt. */
  ersatzFehler: string;
}

export interface AufrufWerte {
  /** Nur „anfrage-senden" (auch „Anfrage neu senden"). */
  supervisorEmail?: string;
  /** Nur „mav-setzen". */
  mavStatus?: string;
}

export function vertragsendeAufruf(art: AufrufArt, id: string, werte: AufrufWerte = {}): Aufruf {
  const basis = `/api/contract-end/${id}`;
  switch (art) {
    case "anfrage-senden":
      return {
        url: `${basis}/supervisor-link`,
        method: "POST",
        body: { supervisorEmail: werte.supervisorEmail ?? "" },
        ersatzFehler: "Link konnte nicht versendet werden.",
      };
    case "erinnern":
      return { url: `${basis}/reminder`, method: "POST", ersatzFehler: "Erinnerung konnte nicht versendet werden." };
    case "offboarding-anlegen":
      return { url: `${basis}/nicht-uebernehmen`, method: "POST", ersatzFehler: "Offboarding konnte nicht angelegt werden." };
    case "vertrag-erfassen":
      return { url: basis, method: "PATCH", body: { status: "VERTRAG_UNTERSCHRIEBEN" }, ersatzFehler: "Status konnte nicht geändert werden." };
    case "abschliessen":
      return { url: basis, method: "PATCH", body: { status: "ABGESCHLOSSEN" }, ersatzFehler: "Status konnte nicht geändert werden." };
    case "stornieren":
      return { url: basis, method: "PATCH", body: { status: "STORNIERT" }, ersatzFehler: "Status konnte nicht geändert werden." };
    case "mav-setzen":
      return {
        url: basis,
        method: "PATCH",
        body: { mavStatus: werte.mavStatus ?? "" },
        ersatzFehler: "MAV-Status konnte nicht gesetzt werden.",
      };
  }
}

/**
 * Ergebnis eines Aufrufs. `mailStatus` nur, wenn die Antwort einen nennt
 * (siehe Kopf) — sonst fehlt das Feld ganz.
 */
export type AufrufErgebnis =
  | { ok: true; daten: unknown; mailStatus?: string }
  | { ok: false; fehler: string; mailStatus?: string };

export const VERBINDUNGSFEHLER = "Verbindungsfehler. Bitte erneut versuchen.";

/** `mailStatus` einer Antwort als Text, sonst `undefined` — die Antworten sind `unknown`. */
export function mailStatusAus(daten: unknown): string | undefined {
  if (!daten || typeof daten !== "object" || Array.isArray(daten)) return undefined;
  const wert = (daten as { mailStatus?: unknown }).mailStatus;
  return typeof wert === "string" && wert.trim() !== "" ? wert.trim() : undefined;
}

export async function aufrufen(aufruf: Aufruf): Promise<AufrufErgebnis> {
  try {
    const res = await fetch(aufruf.url, {
      method: aufruf.method,
      ...(aufruf.body
        ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(aufruf.body) }
        : {}),
    });
    const daten: unknown = await res.json().catch(() => null);
    const mailStatus = mailStatusAus(daten);
    const mitStatus = mailStatus ? { mailStatus } : {};
    if (!res.ok) {
      const fehler =
        daten && typeof daten === "object" && typeof (daten as { error?: unknown }).error === "string"
          ? (daten as { error: string }).error
          : aufruf.ersatzFehler;
      return { ok: false, fehler: fehler || aufruf.ersatzFehler, ...mitStatus };
    }
    return { ok: true, daten, ...mitStatus };
  } catch {
    return { ok: false, fehler: VERBINDUNGSFEHLER };
  }
}

// =============================================
// Meldungen nach erfolgreichem Versand
// =============================================

/** Zusatz, wenn ein Webhook statt der Portal-Mail die Nachricht uebernahm. */
const WEBHOOK_ZUSATZ = "(die E-Mail-Vorlage im Portal ist ausgeschaltet)";

/**
 * Meldung nach „Anfrage senden" bzw. „Anfrage neu senden". WEBHOOK: Das Portal
 * hat keine Mail geschickt, sondern das Ereignis an den Webhook gegeben — das
 * sagt die Meldung, statt „gesendet" zu behaupten. SENT, fehlend (aelterer
 * Server) oder unbekannt: wie bisher.
 */
export function anfrageMeldung(an: string, neu: boolean, mailStatus: string | undefined): string {
  if (mailStatus === "WEBHOOK") {
    return `${neu ? "Neue Anfrage" : "Anfrage"} für ${an} an den Webhook weitergegeben ${WEBHOOK_ZUSATZ}.`;
  }
  return neu ? `Neue Anfrage an ${an} gesendet.` : `Anfrage an ${an} gesendet.`;
}

/** Meldung nach „Erinnerung senden" — dieselbe Regel wie `anfrageMeldung`. */
export function erinnerungMeldung(mailStatus: string | undefined): string {
  if (mailStatus === "WEBHOOK") return `Erinnerung an den Webhook weitergegeben ${WEBHOOK_ZUSATZ}.`;
  return "Erinnerung an die Führungskraft gesendet.";
}
