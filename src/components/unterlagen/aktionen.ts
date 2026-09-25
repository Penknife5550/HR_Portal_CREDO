/**
 * Gemeinsame Client-Helfer von Karte und Dialogen „Unterlagen nachfordern"
 * (Paket 4, modulneutral)
 *
 * Karte (nachforderung-karte.tsx), Dialog „Unterlagen nachfordern…"
 * (nachforderung-dialog.tsx) und Pruef-Dialoge (pruef-dialoge.tsx) brauchen
 * dieselben kleinen Bausteine: den Aufruf samt Auswertung der Antwort, die
 * Meldungsaufbereitung, den heutigen Tag eines Frist-Dialogs und die Pruefung
 * einer Adresse (Vergleich, Format, Texte).
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
import { EMAIL_PATTERN } from "@/lib/constants";
import { heuteInBerlin, tageSpaeter } from "@/lib/kalendertag";
import { FRIST_MIN_TAGE, MELDUNGEN, type FristGrenzen, type Kalendertag } from "@/lib/unterlagen";

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
// Der heutige Tag eines Frist-Dialogs (KO-K3)
// =============================================

/**
 * Heute fuer einen Dialog mit Frist („Unterlagen nachfordern…", „Frist
 * ändern…", „Zurückweisen…"): der Tag des Servers beim Bauen der Uebersicht
 * (morgen ist die frueheste Frist, EP-5 — also `min − 1`), aber NIE frueher
 * als der Berliner Tag im Browser. Steht die Seite ueber Mitternacht offen,
 * ist der Tag des Servers von gestern: Das Feld liesse dann eine Frist zu,
 * die der Server mit 400 FRIST_ZU_FRUEH ablehnt, und der Info-Satz sagte eine
 * Vorab-Erinnerung zu, die der Lauf nie verschickt. Kalendertage
 * (JJJJ-MM-TT) vergleichen sich als Text. Die Feldgrenzen baut jeder Dialog
 * daraus mit `fristGrenzen(heute)`.
 */
export function dialogHeute(serverGrenzen: FristGrenzen | null, jetzt: Date = new Date()): Kalendertag {
  const browser = heuteInBerlin(jetzt);
  const server = serverGrenzen ? tageSpaeter(serverGrenzen.min, -FRIST_MIN_TAGE) : null;
  return server && server > browser ? server : browser;
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

/** Die Texte der Adresspruefung in beiden Adressdialogen („Unterlagen nachfordern…", „Link erneut senden"). */
export const ADRESS_TEXTE = {
  EMAIL_FEHLT: "Bitte geben Sie eine E-Mail-Adresse an.",
  EMAIL_UNGUELTIG: "Bitte geben Sie eine gültige E-Mail-Adresse an.",
  NICHT_FREIGEGEBEN_KURZ: "Diese Adresse ist nicht freigegeben.",
} as const;

/**
 * Das Format einer Adresse, bevor Freigabe und Abweichung zaehlen — dasselbe
 * Muster wie der Dokumentenpaket-Dialog (`EMAIL_PATTERN`). Sonst liesse ein
 * Dialog „anna.beispiel@" durch, und der Server antwortete 400.
 *
 * @returns der Grund, oder null bei einer Adresse in gueltiger Form
 */
export function adressFormatFehler(adresse: string): string | null {
  const wert = adresse.trim();
  if (!wert) return ADRESS_TEXTE.EMAIL_FEHLT;
  return EMAIL_PATTERN.test(wert) ? null : ADRESS_TEXTE.EMAIL_UNGUELTIG;
}
