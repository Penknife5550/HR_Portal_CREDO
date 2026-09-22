/**
 * CREDO HR-Portal – Standardtext einer E-Mail-Vorlage
 *
 * Warum es diese Datei gibt: Eine in der Datenbank gespeicherte Vorlage
 * (EmailTemplate) ueberschreibt den Code-Default VOLLSTAENDIG
 * (resolveEventTemplate in mailer.ts). Das genuegt schon, wenn jemand nur
 * einen Empfaenger in Kopie eingetragen und dabei den Text unveraendert
 * mitgespeichert hat. Aendert ein Update danach den Standardtext — etwa
 * „Stellenbeschreibung“ → „Stellenbezeichnung“ —, kommt die Aenderung bei
 * diesem Event nie an. Hier liegen die zwei Bausteine, mit denen die
 * Einstellungen das sichtbar machen und beheben:
 *
 *   1. `weichtVomStandardAb` — steht in der gespeicherten Fassung ein anderer
 *      Text als im aktuellen Standard? (Kennzeichen in der Vorlagenliste)
 *   2. `standardFassung` — der aktuelle Standardtext in genau der Form, in
 *      der ihn auch das Speichern ablegt. (Aktion „Text auf Standard
 *      zuruecksetzen“)
 *
 * Bewusst NUR Betreff, HTML und Plaintext (plus die Variablenliste fuer den
 * Editor): Empfaengerfelder und Aktiv-Schalter sind Konfiguration, kein Text.
 * HR-interne Events haben keinen Empfaenger-Default (events.ts, to: "") — ein
 * Zuruecksetzen, das das An-Feld mitnaehme, liesse diese Mails ab sofort
 * still als SKIPPED liegen.
 */

import { DEFAULT_EMAIL_TEMPLATES } from "@/lib/default-email-templates";

/** Die Textfelder, die das Zuruecksetzen ersetzt und der Vergleich prueft. */
export const STANDARD_TEXT_FELDER = ["subject", "bodyHtml", "bodyText"] as const;
export type StandardTextFeld = (typeof STANDARD_TEXT_FELDER)[number];

export interface VorlagenText {
  subject: string;
  bodyHtml: string;
  bodyText: string | null;
}

export interface StandardFassung extends VorlagenText {
  variables: { key: string; description: string }[];
}

/**
 * Normalisiert einen Vorlagentext fuer den Vergleich.
 *
 * Was als „gleich“ gilt, richtet sich danach, was das Speichern ohnehin
 * veraendert, ohne dass jemand etwas am Text getan haette:
 *   - PUT /api/settings/email-templates/[id] schneidet Anfang und Ende ab
 *     (`trim`), und ein leerer Plaintext wird dort zu `null`.
 *   - Zeilenenden koennen je nach Browser/Betriebssystem als CRLF ankommen.
 *   - Leerzeichen am Zeilenende sind in HTML wie im Plaintext unsichtbar.
 *
 * Alles andere — auch zusaetzliche Leerzeilen oder geaenderte Einrueckung
 * mitten im Text — zaehlt als Abweichung. Lieber einmal zu oft „weicht ab“
 * anzeigen als eine tatsaechliche Textaenderung verschlucken; der Hinweis
 * kostet einen Blick, eine verschluckte Abweichung einen falschen Mailtext.
 */
export function normalisiereVorlagenText(text: string | null | undefined): string {
  return (text ?? "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((zeile) => zeile.trimEnd())
    .join("\n")
    .trim();
}

/**
 * Liefert die Felder, in denen die gespeicherte Fassung vom Standard abweicht
 * (in fester Reihenfolge subject, bodyHtml, bodyText). Leer = gleich.
 */
export function abweichendeFelder(
  gespeichert: VorlagenText,
  standard: VorlagenText
): StandardTextFeld[] {
  return STANDARD_TEXT_FELDER.filter(
    (feld) => normalisiereVorlagenText(gespeichert[feld]) !== normalisiereVorlagenText(standard[feld])
  );
}

export function weichtVomStandardAb(gespeichert: VorlagenText, standard: VorlagenText): boolean {
  return abweichendeFelder(gespeichert, standard).length > 0;
}

/**
 * Aktueller Standardtext eines Events in der Form, in der ihn auch das
 * Speichern ablegt (getrimmt, leerer Plaintext als `null`). So ist eine
 * zurueckgesetzte Vorlage Zeichen fuer Zeichen dieselbe, als haette jemand
 * den Standard im Editor geoeffnet und unveraendert gespeichert.
 *
 * `null`, wenn es fuer das Event keinen Code-Default gibt — dann gibt es
 * auch nichts, worauf zurueckgesetzt werden koennte.
 */
export function standardFassung(event: string): StandardFassung | null {
  const vorlage = DEFAULT_EMAIL_TEMPLATES.find((t) => t.event === event);
  if (!vorlage) return null;
  return {
    subject: vorlage.subject.trim(),
    bodyHtml: vorlage.bodyHtml.trim(),
    bodyText: vorlage.bodyText?.trim() || null,
    variables: vorlage.variables,
  };
}
