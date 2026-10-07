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

export type AufrufErgebnis = { ok: true; daten: unknown } | { ok: false; fehler: string };

export const VERBINDUNGSFEHLER = "Verbindungsfehler. Bitte erneut versuchen.";

export async function aufrufen(aufruf: Aufruf): Promise<AufrufErgebnis> {
  try {
    const res = await fetch(aufruf.url, {
      method: aufruf.method,
      ...(aufruf.body
        ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(aufruf.body) }
        : {}),
    });
    const daten: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const fehler =
        daten && typeof daten === "object" && typeof (daten as { error?: unknown }).error === "string"
          ? (daten as { error: string }).error
          : aufruf.ersatzFehler;
      return { ok: false, fehler: fehler || aufruf.ersatzFehler };
    }
    return { ok: true, daten };
  } catch {
    return { ok: false, fehler: VERBINDUNGSFEHLER };
  }
}
