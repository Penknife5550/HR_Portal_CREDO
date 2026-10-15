/**
 * CREDO HR-Portal – pauschale Sperrpunkte der Offboarding-Vorlagen
 * (Ausstattung & Zugaenge, Paket A4; Feinplan G25, Entscheidung E-A32
 * „umformulieren“).
 *
 * Worum es geht: Seit A4 bekommt die ausgebende Stelle beim Austritt je Stueck,
 * das das Portal als ausgegeben kennt, eine eigene Ruecknahme- bzw.
 * Sperraufgabe. Daneben stehen in den Offboarding-Vorlagen weiter die
 * pauschalen Punkte („Rueckgabe aller Arbeitsmittel“, „IT-Zugaenge sperren“ …).
 *
 * Ihre TITEL bleiben: Titel stehen in Betreffzeilen, Statistiken und der
 * Warnung „ähnlicher Vorlagenpunkt“, und ein „Weitere …“ laese sich falsch,
 * solange der Katalog nichts abfragt. Die Punkte bekommen stattdessen einen
 * Hinweis fuer die Stelle (`description`, steht auf der Link-Seite und in der
 * Mail an die Abteilung), der in beiden Faellen stimmt.
 *
 * Zwei Leser:
 *   - prisma/seed.ts legt neue Datenbanken mit Hinweis an
 *     (`mitSperrpunktHinweisen`);
 *   - prisma/seed-check.js traegt ihn im Bestand nach (einmalige Migration
 *     OFFBOARDING_SPERRPUNKTE_V1). Dort steht die Tabelle und die Regel als
 *     JS-KOPIE, weil es im Container kein tsx gibt.
 *     src/__tests__/lib/offboarding-sperrpunkte-migration.test.ts haelt beide
 *     Fassungen gleich – wer hier etwas aendert, aendert es dort mit.
 *
 * Laufende Vorgaenge behalten ihre Kopie (`OffboardingChecklistItem`). Den
 * Wortlaut darf die Personalabteilung nach dem Pilot in den Vorlagen selbst
 * aendern: Seed und Migration fassen nur Punkte mit unveraendertem Titel und
 * leerer Beschreibung an.
 *
 * Bewusst eine eigene Datei (nicht `ausgaben.ts`, das fast jeder Schritt von A4
 * aendert) und ohne jeden Import: prisma/seed.ts buendelt sie beim Build mit
 * esbuild. Rein und client-sicher.
 */

/** Der Hinweis an den pauschalen Sperrpunkten (Wortlaut G25). */
export const SPERRPUNKT_HINWEIS =
  "Gemeint ist alles, was nicht als eigene Aufgabe unter „Ausstattung & Zugänge“ steht – " +
  "was das Portal als ausgegeben kennt, bekommt eine eigene Rücknahme- bzw. Sperraufgabe.";

/**
 * Titel des Vorlagenpunkts → Hinweis. Die Titel stehen so (mit ae/oe/ue) in den
 * Offboarding-Vorlagen von prisma/seed.ts; verglichen wird EXAKT.
 *
 * „IT-Abteilung über Austritt informieren“ (HR) gehoert bewusst nicht dazu: Das
 * ist kein Sperrpunkt, sondern eine Aufgabe der Personalabteilung.
 */
export const SPERRPUNKT_HINWEISE: Readonly<Record<string, string>> = Object.freeze({
  // Standard-Offboarding und Bildungseinrichtung
  "Rueckgabe aller Arbeitsmittel": SPERRPUNKT_HINWEIS,
  "IT-Zugaenge zur Sperrung vorbereiten": SPERRPUNKT_HINWEIS,
  "IT-Zugaenge und E-Mail-Konto sperren": SPERRPUNKT_HINWEIS,
  "Physische Zugaenge entziehen (Schlüssel, Karten)": SPERRPUNKT_HINWEIS,
  // Beamte
  "Rueckgabe Dienstausweis und Arbeitsmittel": SPERRPUNKT_HINWEIS,
  "IT-Zugaenge und Dienstmail sperren": SPERRPUNKT_HINWEIS,
  "Physische Zugaenge entziehen": SPERRPUNKT_HINWEIS,
  // Minijob
  "Arbeitsmittel zurueckgeben": SPERRPUNKT_HINWEIS,
  "IT-Zugaenge sperren (falls vorhanden)": SPERRPUNKT_HINWEIS,
  "Schlüssel / Zugangskarten einziehen": SPERRPUNKT_HINWEIS,
});

/**
 * Offboarding-Vorlage? Dieselbe Regel wie `istOffboardingVorlagenName`
 * (src/lib/abteilungsaufgaben.ts) – hier ohne Import, damit der Seed nicht die
 * halbe Abteilungslogik samt Mail-Layout mitbuendelt. Der Test haelt beide
 * gleich.
 */
function istOffboardingVorlage(vorlagenName: string | null | undefined): boolean {
  return (vorlagenName ?? "").trim().startsWith("Offboarding:");
}

/**
 * Leer heisst: `null`, `""` oder nur Leerraum – so speichert der Editor
 * („"" / nur Leerzeichen = null“, `checklistenPunktSchema`).
 */
export function beschreibungLeer(beschreibung: string | null | undefined): boolean {
  return (beschreibung ?? "").trim() === "";
}

/**
 * Der Hinweis, den ein Vorlagenpunkt bekommt – oder `null`, wenn er keinen
 * bekommt. Nur, wenn alle drei gelten:
 *   - die Vorlage ist eine Offboarding-Vorlage (Name beginnt mit „Offboarding:“);
 *   - der Titel steht EXAKT so in `SPERRPUNKT_HINWEISE` (ein geaenderter Titel
 *     heisst: HR hat den Punkt gepflegt);
 *   - die Beschreibung ist leer (eine gepflegte bleibt).
 */
export function sperrpunktHinweis(
  vorlagenName: string | null | undefined,
  punkt: { title: string | null | undefined; description?: string | null },
): string | null {
  if (!istOffboardingVorlage(vorlagenName)) return null;
  const titel = punkt.title ?? "";
  if (!Object.prototype.hasOwnProperty.call(SPERRPUNKT_HINWEISE, titel)) return null;
  if (!beschreibungLeer(punkt.description)) return null;
  return SPERRPUNKT_HINWEISE[titel];
}

/**
 * Fuer prisma/seed.ts: dieselben Punkte, die pauschalen Sperrpunkte mit
 * Hinweis. Alles andere bleibt, wie es ist; die Eingabe wird nicht veraendert.
 */
export function mitSperrpunktHinweisen<T extends { title: string; description?: string | null }>(
  vorlagenName: string,
  punkte: readonly T[],
): T[] {
  return punkte.map((punkt) => {
    const hinweis = sperrpunktHinweis(vorlagenName, punkt);
    return hinweis === null ? punkt : { ...punkt, description: hinweis };
  });
}
