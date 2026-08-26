/**
 * Pruefsumme ueber die abgesendeten Fragebogen-Angaben.
 *
 * Die Wahrheitsversicherung ersetzt die Unterschrift. Ohne Bezug auf einen
 * konkreten Datenstand bestaetigt sie aber nur sich selbst — spaetere
 * Aenderungen waeren nicht von den urspruenglich bestaetigten Angaben zu
 * unterscheiden. Die Pruefsumme stellt diesen Bezug her: Sie wird beim Absenden
 * gebildet und laesst sich jederzeit gegen den gespeicherten Stand nachrechnen.
 *
 * Zwei Festlegungen, die dafuer noetig sind:
 *
 * 1. **Klartext, nicht Chiffrat.** IBAN, SV-Nummer und Steuer-ID liegen
 *    AES-GCM-verschluesselt mit zufaelligem IV in der Datenbank; dasselbe
 *    Klartextwort ergibt bei jeder Verschluesselung ein anderes Chiffrat. Ueber
 *    das Chiffrat gebildet waere die Pruefsumme schon nach einem folgenlosen
 *    Neuspeichern verletzt.
 *
 * 2. **Ausschlussliste statt Einschlussliste.** Erfasst wird alles ausser den
 *    hier genannten Meta-Feldern. Ein spaeter ergaenztes Angabenfeld wandert
 *    damit automatisch in die Pruefsumme, statt still herauszufallen.
 */

import crypto from "crypto";

/**
 * Felder, die nicht zu den Angaben gehoeren: technische Kennungen, der
 * Bearbeitungsstand und die Nachweise der Erklaerung selbst. Letztere muessen
 * draussen bleiben, sonst haengt die Pruefsumme von ihrem eigenen Ergebnis ab.
 */
const NICHT_TEIL_DER_ANGABEN = new Set([
  "id",
  "onboardingId",
  "createdAt",
  "updatedAt",
  "currentStep",
  "isComplete",
  "dsgvoAccepted",
  "dsgvoAcceptedAt",
  "erklaerungAccepted",
  "erklaerungAcceptedAt",
  "erklaerungOrt",
  "erklaerungIp",
  "erklaerungUserAgent",
  "erklaerungVersion",
  "erklaerungPruefsumme",
  // Wird separat und in fester Reihenfolge angehaengt.
  "children",
]);

export interface KindFuerPruefsumme {
  firstName?: string | null;
  lastName?: string | null;
  birthDate?: Date | string | null;
  taxAllowance?: boolean | null;
}

/** Ein Wert in der Form, in der er in die Pruefsumme eingeht. */
function normalisiere(wert: unknown): unknown {
  if (wert === null || wert === undefined) return null;
  if (wert instanceof Date) return wert.toISOString();
  if (typeof wert === "number" && Number.isNaN(wert)) return null;
  return wert;
}

/**
 * Kanonische Darstellung der Angaben: Schluessel alphabetisch, Kinder nach
 * Geburtsdatum und Vorname. Ohne feste Reihenfolge haenge die Pruefsumme sonst
 * an der Reihenfolge, in der die Datenbank die Zeilen liefert.
 */
export function kanonischeAngaben(
  angaben: Record<string, unknown>,
  kinder: KindFuerPruefsumme[] = []
): string {
  const gefiltert: Record<string, unknown> = {};
  for (const schluessel of Object.keys(angaben).sort()) {
    if (NICHT_TEIL_DER_ANGABEN.has(schluessel)) continue;
    gefiltert[schluessel] = normalisiere(angaben[schluessel]);
  }

  const kinderKanonisch = kinder
    .map((k) => ({
      birthDate: normalisiere(k.birthDate),
      firstName: k.firstName ?? null,
      lastName: k.lastName ?? null,
      taxAllowance: k.taxAllowance ?? null,
    }))
    .sort((a, b) => {
      const datum = String(a.birthDate ?? "").localeCompare(String(b.birthDate ?? ""));
      if (datum !== 0) return datum;
      return String(a.firstName ?? "").localeCompare(String(b.firstName ?? ""));
    });

  return JSON.stringify({ angaben: gefiltert, kinder: kinderKanonisch });
}

/**
 * SHA-256 ueber die kanonische Darstellung, als Hex-Zeichenkette.
 *
 * Die Werte muessen im **Klartext** uebergeben werden — verschluesselte Felder
 * also vorher entschluesseln.
 */
export function berechnePruefsumme(
  angaben: Record<string, unknown>,
  kinder: KindFuerPruefsumme[] = []
): string {
  return crypto
    .createHash("sha256")
    .update(kanonischeAngaben(angaben, kinder), "utf8")
    .digest("hex");
}

/** Kurzform fuer die Anzeige: die ersten und letzten acht Zeichen. */
export function pruefsummeKurz(pruefsumme: string | null | undefined): string {
  if (!pruefsumme || pruefsumme.length < 20) return pruefsumme ?? "—";
  return `${pruefsumme.slice(0, 8)}…${pruefsumme.slice(-8)}`;
}
