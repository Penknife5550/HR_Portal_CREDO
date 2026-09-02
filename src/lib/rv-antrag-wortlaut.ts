/**
 * Der amtliche Wortlaut der beiden Antragsanlagen — Seiten 8 und 9 der
 * Checkliste der Minijob-Zentrale, Fassung 30. Juni 2026.
 *
 * Warum der Text hier steht und nicht im Renderer: Er ist der eigentliche
 * Gegenstand. Das Layout darf sich aendern, der Wortlaut nicht. Beides in einer
 * Datei zu mischen hiesse, bei jeder Layoutaenderung den Rechtstext anzufassen.
 *
 * **Nachbildung, kein Original.** Wir drucken den Vordruck nach, statt die
 * amtliche Seite zu stempeln — der Vordruck verlangt die Betriebsnummer des
 * Arbeitgebers, die nur das Portal kennt. Das Merkblatt selbst sagt, der Antrag
 * sei „möglichst mit dem beiliegenden Formular" zu stellen; eine zwingende Form
 * gibt es also nicht. Damit die Nachbildung erkennbar bleibt, traegt jedes Blatt
 * eine Herkunftszeile, und `rv-antrag-wortlaut.test.ts` haelt jeden Satz
 * zeichengenau gegen die abgelegte Textfassung
 * (docs/module/minijob/anlagen-wortlaut-2026-06-30.txt).
 *
 * Die Minijob-Zentrale hat zwischen dem 26.05. und dem 30.06.2026 zweimal
 * nachgelegt. Kommt eine neue Fassung, aendert sich `FASSUNG`, die Textfassung
 * im docs-Ordner wird neu erzeugt, und der Test zeigt, welche Saetze abweichen.
 */

/** Stand der amtlichen Fassung, aus der dieser Wortlaut stammt. */
export const FASSUNG = "2026-06-30";

/** Wie der Stand auf dem Blatt erscheint — so wie im Original. */
export const FASSUNG_ANZEIGE = "Stand: 30. Juni 2026";

export type AntragsArt = "BEFREIUNG" | "AUFHEBUNG";

export interface AntragsWortlaut {
  /** Ueberschrift des Vordrucks. */
  titel: string;
  /** Die Erklaerung des Beschaeftigten, Absatz fuer Absatz. */
  absaetze: string[];
  /** Beschriftung der Eingangszeile im Arbeitgeberteil. */
  eingangZeile: { vor: string; nach: string };
  /** Beschriftung der Wirkungszeile im Arbeitgeberteil. */
  wirkungZeile: string;
  /**
   * Im Original fest eingedruckte Ziffern im Wirkungs-Datumsfeld.
   *
   * Beim Aufhebungsantrag stehen "0" und "1" schwarz im Vordruck: Die Aufhebung
   * kann nur zum Monatsersten wirken. Das ist Vordruck, nicht Vorbefuellung —
   * genau das Detail, das eine Nachbildung als Erstes verliert.
   */
  wirkungVorgedruckt: string;
  /** Der Hinweis an den Arbeitgeber am Fuss des Blattes. */
  hinweis: string;
}

const UNTERSCHRIFT_LEGENDE_AN =
  "(Unterschrift der Arbeitnehmerin/des Arbeitnehmers bzw. bei Minderjährigen " +
  "Unterschrift der gesetzlichen Vertreterin/des gesetzlichen Vertreters)";

const UNTERSCHRIFT_LEGENDE_AG =
  "(Unterschrift der Arbeitgeberin/des Arbeitgebers)";

/** Beschriftungen, die auf beiden Blaettern gleich lauten. */
export const GEMEINSAM = {
  anlage: "Anlage",
  rubrikArbeitnehmer: "Arbeitnehmer/-in:",
  rubrikArbeitgeber: "Arbeitgeber/-in:",
  name: "Name:",
  vorname: "Vorname:",
  rentenversicherungsnummer: "Rentenversicherungsnummer:",
  betriebsnummer: "Betriebsnummer:",
  ortDatum: "(Ort, Datum)",
  legendeArbeitnehmer: UNTERSCHRIFT_LEGENDE_AN,
  legendeArbeitgeber: UNTERSCHRIFT_LEGENDE_AG,
  hinweisUeberschrift: "Hinweis für den Arbeitgeber:",
  /** Beschriftung unter den acht Kaestchen eines Datumsfelds. */
  datumsBeschriftung: ["T", "T", "M", "M", "J", "J", "J", "J"],
} as const;

const BEFREIUNG: AntragsWortlaut = {
  titel:
    "Antrag auf Befreiung von der Rentenversicherungspflicht bei einer " +
    "geringfügig entlohnten Beschäftigung nach § 6 Abs. 1b Sozialgesetzbuch " +
    "Sechstes Buch (SGB VI)",
  absaetze: [
    "Hiermit beantrage ich die Befreiung von der Versicherungspflicht in der " +
      "Rentenversicherung im Rahmen meiner geringfügig entlohnten Beschäftigung " +
      "und verzichte damit auf den Erwerb von Pflichtbeitragszeiten. Ich habe die " +
      "Hinweise auf dem „Merkblatt über die möglichen Folgen einer Befreiung von " +
      "der Rentenversicherungspflicht“ zur Kenntnis genommen.",
    "Mir ist bekannt, dass der Befreiungsantrag für alle von mir zeitgleich " +
      "ausgeübten geringfügig entlohnten Beschäftigungen gilt und grundsätzlich " +
      "für die Dauer der Beschäftigungen bindend ist. Ich verpflichte mich, alle " +
      "weiteren Arbeitgeber/-innen, bei denen ich eine geringfügig entlohnte " +
      "Beschäftigung ausübe, über diesen Befreiungsantrag zu informieren.",
  ],
  eingangZeile: {
    vor: "Der Befreiungsantrag ist am",
    nach: "bei mir eingegangen.",
  },
  wirkungZeile: "Die Befreiung wirkt ab",
  wirkungVorgedruckt: "",
  hinweis:
    "Der Befreiungsantrag ist nach § 8 Abs. 2 Nr. 4a " +
    "Beitragsverfahrensverordnung (BVV) zu den Entgeltunterlagen zu nehmen und " +
    "nicht an die Minijob-Zentrale zu senden.",
};

const AUFHEBUNG: AntragsWortlaut = {
  titel:
    "Antrag auf Aufhebung der Befreiung von der Rentenversicherungspflicht bei " +
    "einer geringfügig entlohnten Beschäftigung nach § 6 Abs. 6 Sozialgesetzbuch " +
    "Sechstes Buch (SGB VI)",
  absaetze: [
    // Im Original stehen diese beiden Saetze ohne Leerzeile untereinander.
    "Hiermit beantrage ich die Aufhebung der Befreiung von der " +
      "Versicherungspflicht in der Rentenversicherung im Rahmen meiner " +
      "geringfügig entlohnten Beschäftigung. Der Antrag auf Aufhebung der " +
      "Befreiung ist für die Dauer der Beschäftigungen bindend.\n" +
      "Die Befreiung gilt als aufgehoben, wenn die nach § 28i Satz 5 SGB IV " +
      "zuständige Einzugsstelle nicht innerhalb eines Monats nach Eingang der " +
      "Meldung des Arbeitgebers nach § 28a SGB IV dem Antrag auf Aufhebung des/r " +
      "Beschäftigten widerspricht.",
    "Mir ist bekannt, dass die einmalige Aufhebung der Befreiung von der " +
      "Rentenversicherungspflicht erst ab Beginn des Kalendermonats, der auf den " +
      "Monat meiner Antragstellung folgt wirkt und für alle von mir zeitgleich " +
      "ausgeübten geringfügig entlohnten Beschäftigungen gilt und für die Dauer " +
      "der Beschäftigungen bindend ist; eine Rücknahme ist nicht möglich. Ich " +
      "verpflichte mich, alle weiteren Arbeitgeber/-innen, bei denen ich eine " +
      "geringfügig entlohnte Beschäftigung ausübe, über diese Aufhebung der " +
      "Befreiung von der Rentenversicherungspflicht zu informieren.",
  ],
  eingangZeile: {
    vor: "Der Aufhebungsantrag ist am",
    nach: "bei mir eingegangen.",
  },
  wirkungZeile: "Die Aufhebung der Befreiung wirkt ab",
  wirkungVorgedruckt: "01",
  hinweis:
    "Der Aufhebungsantrag ist nach § 8 Abs. 2 Nr. 4a " +
    "Beitragsverfahrensverordnung (BVV) zu den Entgeltunterlagen zu nehmen und " +
    "nicht an die Minijob-Zentrale zu senden.",
};

export const ANTRAGS_WORTLAUT: Record<AntragsArt, AntragsWortlaut> = {
  BEFREIUNG,
  AUFHEBUNG,
};

/**
 * Die Herkunftszeile auf jedem Blatt.
 *
 * Ohne sie sieht das Blatt aus wie das amtliche Original. Wer es spaeter in der
 * Akte findet, soll erkennen koennen, woher es stammt und auf welchem Stand es
 * beruht.
 */
export const HERKUNFT =
  "Nachbildung des amtlichen Vordrucks der Minijob-Zentrale (Anlage zur " +
  "Checkliste für geringfügig entlohnte oder kurzfristig Beschäftigte, " +
  "Stand 30.06.2026). Inhaltlich unverändert.";

/** Welche Entscheidung aus Schritt 11 zu welchem Antrag fuehrt. */
export function antragsArtFuerEntscheidung(
  rvEntscheidung: string | null | undefined
): AntragsArt | null {
  if (rvEntscheidung === "BEFREIUNG_BEANTRAGT") return "BEFREIUNG";
  if (rvEntscheidung === "AUFHEBUNG_BEANTRAGT") return "AUFHEBUNG";
  return null;
}

/** Dateiname des erzeugten PDF. */
export function dateiname(art: AntragsArt, nachname: string): string {
  const teil = art === "BEFREIUNG" ? "Befreiungsantrag" : "Aufhebungsantrag";
  const name = nachname.replace(/[^A-Za-zÄÖÜäöüß-]/g, "") || "Antrag";
  return `RV-${teil}-${name}.pdf`;
}
