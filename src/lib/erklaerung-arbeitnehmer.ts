/**
 * Wortlaut der Wahrheitsversicherung im Personalfragebogen — versioniert.
 *
 * Der Text stand bisher fest im Markup des Zusammenfassungs-Schritts. Damit war
 * im Streitfall nicht belegbar, *was* der Beschaeftigte eigentlich bestaetigt
 * hat: Wird die Formulierung spaeter geaendert, aendert sie sich rueckwirkend
 * fuer jede bereits abgegebene Erklaerung mit.
 *
 * Deshalb liegt jede Fassung hier mit eigener Version. Am Vorgang wird die
 * Version gespeichert, die beim Absenden galt, und das PDF druckt genau diese
 * Fassung — nicht die aktuelle.
 *
 * **Bestehende Fassungen nie aendern.** Wer den Wortlaut anpassen will, legt
 * eine neue Fassung an und setzt sie ans Ende der Liste. Alte Fassungen bleiben
 * stehen, solange es Vorgaenge gibt, die sich darauf berufen — praktisch also
 * dauerhaft.
 */

export interface ErklaerungsAbschnitt {
  text: string;
  /** Aufzaehlung unter dem Absatz. */
  punkte?: string[];
}

export interface ErklaerungsFassung {
  /** Stabile Kennung. Wird am Vorgang gespeichert. */
  version: string;
  /** Ab wann diese Fassung ausgeliefert wurde (ISO-Datum). */
  gueltigAb: string;
  titel: string;
  abschnitte: ErklaerungsAbschnitt[];
  /** Text neben dem Haken. */
  bestaetigung: string;
  /** Hinweis darauf, dass der Haken die Unterschrift ersetzt. */
  unterschriftsersatz: string;
}

/**
 * Alle je ausgelieferten Fassungen, aelteste zuerst.
 */
export const ERKLAERUNGS_FASSUNGEN: readonly ErklaerungsFassung[] = [
  {
    version: "2026-08-25",
    gueltigAb: "2026-08-25",
    titel: "Erklärung des Arbeitnehmers",
    abschnitte: [
      {
        text:
          "Ich versichere, dass die vorstehenden Angaben der Wahrheit entsprechen " +
          "und ich keine Angaben wissentlich verschwiegen habe.",
      },
      {
        text:
          "Mir ist bekannt, dass unwahre oder unvollständige Angaben einen " +
          "wichtigen Grund für eine außerordentliche Kündigung des " +
          "Arbeitsverhältnisses darstellen können.",
      },
      {
        // Neu gegenüber der bisherigen Oberfläche: Die Erläuterungen der
        // Minijob-Checkliste verlangen diese Belehrung ausdrücklich.
        text:
          "Mir ist bekannt, dass ich zu diesen Angaben gesetzlich verpflichtet " +
          "bin und dass unrichtige, unvollständige oder verspätete Angaben eine " +
          "Ordnungswidrigkeit darstellen können, die mit einem Bußgeld belegt " +
          "wird (§ 28o und § 111 Abs. 1 Nr. 4 SGB IV).",
      },
      {
        text:
          "Ich verpflichte mich, meinem Arbeitgeber unverzüglich mitzuteilen, " +
          "wenn sich Änderungen bei den vorstehenden Angaben ergeben, " +
          "insbesondere bei:",
        punkte: [
          "Änderung des Familienstandes oder der Anschrift",
          "Änderung der Bankverbindung",
          "Änderung der Krankenkasse",
          "Änderung der Steuerklasse",
          "Geburt eines Kindes",
          "Aufnahme oder Beendigung einer weiteren Beschäftigung",
          "Änderung bei der Schwerbehinderung",
        ],
      },
      {
        text:
          "Mir ist bekannt, dass die Mitteilungspflicht auch nach Beendigung des " +
          "Arbeitsverhältnisses für laufende Abrechnungszeiträume fortbesteht.",
      },
    ],
    bestaetigung: "Ich bestätige die vorstehende Erklärung.",
    unterschriftsersatz:
      "Diese Bestätigung ersetzt Ihre handschriftliche Unterschrift auf dem " +
      "Personalfragebogen. Zeitpunkt, Ort und Herkunft der Abgabe werden " +
      "zusammen mit einer Prüfsumme über Ihre Angaben gespeichert.",
  },
];

/** Die Fassung, die neuen Erklaerungen zugrunde gelegt wird. */
export const AKTUELLE_ERKLAERUNG: ErklaerungsFassung =
  ERKLAERUNGS_FASSUNGEN[ERKLAERUNGS_FASSUNGEN.length - 1];

/**
 * Fassung zu einer gespeicherten Version.
 *
 * `undefined` bedeutet: Diese Version kennen wir nicht. Das darf beim Absenden
 * zur Ablehnung fuehren, beim Anzeigen eines Altvorgangs dagegen nicht — dort
 * wird stattdessen vermerkt, dass der Wortlaut nicht mehr vorliegt.
 */
export function getErklaerung(
  version: string | null | undefined
): ErklaerungsFassung | undefined {
  if (!version) return undefined;
  return ERKLAERUNGS_FASSUNGEN.find((f) => f.version === version);
}

/** Kennt das System diese Version? */
export function istBekannteErklaerung(version: string | null | undefined): boolean {
  return getErklaerung(version) !== undefined;
}

/**
 * Der Wortlaut als Fliesstext — fuer den PDF-Export und fuer Pruefzwecke.
 */
export function erklaerungAlsText(fassung: ErklaerungsFassung): string {
  return fassung.abschnitte
    .map((a) => {
      if (!a.punkte || a.punkte.length === 0) return a.text;
      return `${a.text}\n${a.punkte.map((p) => `– ${p}`).join("\n")}`;
    })
    .join("\n\n");
}
