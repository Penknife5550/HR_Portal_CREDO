/**
 * Gemeinsame Client-Helfer von Karte und Dialogen „Unterlagen nachfordern"
 * (Paket 4, modulneutral)
 *
 * Karte (nachforderung-karte.tsx), Dialog „Unterlagen nachfordern…"
 * (nachforderung-dialog.tsx) und Pruef-Dialoge (pruef-dialoge.tsx) brauchen
 * dieselben kleinen Bausteine: die Basis der HR-Routen, den Aufruf samt
 * Auswertung der Antwort, die Meldungsaufbereitung und den Adressvergleich.
 * Sie stehen hier, damit keine Komponente eine andere nur wegen eines Helfers
 * importiert — frueher holte sich der Dialog den Aufruf aus der Karte und den
 * Adressvergleich aus den Pruef-Dialogen, waehrend die Karte die Pruef-Dialoge
 * importiert (Ringimport).
 *
 * Rein bis auf `fetch` in `unterlagenAktionSenden`, ohne React. Werte aus dem
 * Server-Code gibt es hier nicht: nur die reinen Regeln (src/lib/unterlagen.ts)
 * und ein Typ der Abteilungskarte.
 */

import type { AktionsMeldung } from "@/components/abteilungsaufgaben/abteilungen-karte";
import { MELDUNGEN } from "@/lib/unterlagen";

// =============================================
// Typen
// =============================================

/**
 * Meldung der letzten Aktion. `erfolg`/`fehler` zeigt `AktionsMeldungen`
 * (gruen/rot); `warnung` ist gelb: gespeichert, aber die Mail an die Person
 * ist nicht (sicher) angekommen.
 */
export type UnterlagenMeldung = AktionsMeldung | { art: "warnung"; meldung: string; hinweis: string | null };

export interface UnterlagenAktionsErgebnis {
  /** HTTP-Status; `null` bei einem Verbindungsfehler (dann kam keine Antwort). */
  status: number | null;
  /**
   * Hat der Server die Aktion ausgefuehrt? 2xx — und bei „Link erneut senden"
   * auch 502/409 mit Mailergebnis: Der neue Link steht dann, nur die Mail kam
   * nicht an. Sonst (400, 403, 404, 409 ohne Mail, 429) hat sich nichts geaendert.
   */
  ausgefuehrt: boolean;
  meldung: UnterlagenMeldung;
}

// =============================================
// Basis der HR-Routen
// =============================================

/**
 * Basis der HR-Routen je Modul — dieselbe wie `apiBasis` im Modul-Baustein
 * (src/lib/unterlagen-onboarding.ts, Server). Nur noch Rueckfall fuer eine
 * Uebersicht ohne `apiBasis` (die Route liefert sie seit Schritt 10 mit
 * Bearbeitungsrecht immer); Stufe 2 braucht hier also keinen Eintrag mehr.
 */
const API_BASIS: Readonly<Record<string, (vorgangId: string) => string>> = {
  ONBOARDING: (id) => `/api/onboarding/${id}/unterlagen`,
};

export function unterlagenApiBasis(modul: string, vorgangId: string): string | null {
  return API_BASIS[modul]?.(vorgangId) ?? null;
}

// =============================================
// Meldungen
// =============================================

function text(wert: unknown): string | null {
  return typeof wert === "string" && wert.trim() ? wert.trim() : null;
}

/** Mehrere Saetze zu einem, ohne leere Teile und ohne denselben Satz zweimal. */
export function saetze(...teile: Array<string | null | undefined>): string {
  return Array.from(new Set(teile.map((t) => t?.trim()).filter((t): t is string => !!t))).join(" ");
}

/**
 * Macht aus der Antwort einer HR-Aktion die Meldung (rein, getestet). Texte
 * kommen nur vom Server (`meldung`, `warnung`, `error`, `hinweis`, gebaut von
 * `aktionsTexte`); erfunden wird keiner, ausser fuer den Fall, dass gar keiner
 * kam.
 *
 * - 2xx ohne Warnung: gruen.
 * - 2xx mit `mail.status` FAILED: rot — gespeichert, aber die Person hat
 *   nichts bekommen (der Lauf holt nach).
 * - 2xx mit Warnung sonst (SKIPPED, N2 „versendet, aber nicht gespeichert"):
 *   gelb.
 * - „Link erneut senden" 502/409 MIT Mailergebnis: ausgefuehrt, FAILED rot,
 *   SKIPPED gelb.
 * - Jeder andere Fehler: rot, mit `hinweis` des Servers (etwa der Grund, warum
 *   eine vertrauliche Art nicht uebernommen werden kann).
 */
export function unterlagenAntwortAuswerten(status: number, daten: unknown): UnterlagenAktionsErgebnis {
  const d = (daten && typeof daten === "object" ? daten : {}) as Record<string, unknown>;
  const mail = d.mail && typeof d.mail === "object" ? (d.mail as Record<string, unknown>) : null;
  const mailStatus = text(mail?.status);
  const meldung = text(d.meldung);
  const warnung = text(d.warnung);
  const fehler = text(d.error);
  const hinweis = text(d.hinweis);
  const ok = status >= 200 && status < 300;

  if (ok) {
    if (mailStatus === "FAILED") {
      const satz = saetze(meldung, warnung ?? MELDUNGEN.MAIL_NICHT_ZUGESTELLT);
      return { status, ausgefuehrt: true, meldung: { art: "fehler", meldung: satz, hinweis } };
    }
    if (warnung || mailStatus === "SKIPPED") {
      const satz = saetze(meldung, warnung ?? "Die E-Mail an die Person wurde nicht versendet.");
      return { status, ausgefuehrt: true, meldung: { art: "warnung", meldung: satz, hinweis } };
    }
    return { status, ausgefuehrt: true, meldung: { art: "erfolg", meldung: meldung ?? "Gespeichert.", hinweis } };
  }

  if (mailStatus === "FAILED" || mailStatus === "SKIPPED") {
    const satz = saetze(fehler ?? meldung, warnung);
    return {
      status,
      ausgefuehrt: true,
      meldung: { art: mailStatus === "FAILED" ? "fehler" : "warnung", meldung: satz, hinweis },
    };
  }

  return {
    status,
    ausgefuehrt: false,
    meldung: {
      art: "fehler",
      meldung: fehler ?? meldung ?? `Die Aktion ist fehlgeschlagen (Status ${status}).`,
      hinweis,
    },
  };
}

/** Ruft eine HR-Route mit JSON und wertet die Antwort aus. Wirft nie. */
export async function unterlagenAktionSenden(url: string, body: unknown): Promise<UnterlagenAktionsErgebnis> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return {
      status: null,
      ausgefuehrt: false,
      meldung: { art: "fehler", meldung: "Verbindungsfehler. Bitte versuchen Sie es erneut.", hinweis: null },
    };
  }
  const daten = await res.json().catch(() => null);
  return unterlagenAntwortAuswerten(res.status, daten);
}

// =============================================
// Adressen
// =============================================

/**
 * Dieselbe Regel wie `gleicheAdresse` (src/lib/validations/onboarding.ts):
 * Gross- und Kleinschreibung und Leerraum am Rand zaehlen nicht. Nicht von dort
 * importiert — die Datei zoege die Zod-Schemas des Fragebogens in den Browser.
 */
export function adresseGleich(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}
