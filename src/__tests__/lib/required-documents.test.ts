import {
  ARBEITSERLAUBNIS_HINWEIS,
  AUFENTHALTSTITEL_HINWEIS,
  MASERNSCHUTZ_HINWEIS,
  NACHREICHEN_FOLGEN_HINWEIS,
  PFLICHT_HINWEISE,
  PKV_NACHWEIS_HINWEIS,
  SELECTABLE_DOCUMENT_TYPES,
  computeMissingRequiredDocuments,
  documentTypeLabel,
  effektivePflichtDokumente,
  fehlendeNachreichbareDokumente,
  istNachreichbar,
  nachreichbarePflichtDokumente,
  sperrendePflichtDokumente,
} from "@/lib/required-documents";

describe("computeMissingRequiredDocuments", () => {
  it("meldet fehlende Pflichtdokumente", () => {
    const missing = computeMissingRequiredDocuments({
      required: ["GEBURTSURKUNDE_EIGEN", "SV_AUSWEIS"],
      uploadedTypes: ["GEBURTSURKUNDE_EIGEN"],
      hasChildren: false,
    });
    expect(missing).toEqual(["SV_AUSWEIS"]);
  });

  it("verlangt GEBURTSURKUNDE_KIND nur, wenn Kinder vorhanden sind", () => {
    const ohneKinder = computeMissingRequiredDocuments({
      required: ["GEBURTSURKUNDE_KIND"],
      uploadedTypes: [],
      hasChildren: false,
    });
    expect(ohneKinder).toEqual([]);

    const mitKindern = computeMissingRequiredDocuments({
      required: ["GEBURTSURKUNDE_KIND"],
      uploadedTypes: [],
      hasChildren: true,
    });
    expect(mitKindern).toEqual(["GEBURTSURKUNDE_KIND"]);
  });

  it("gibt leeres Array zurueck, wenn alle Pflichtdokumente vorliegen", () => {
    const missing = computeMissingRequiredDocuments({
      required: ["GEBURTSURKUNDE_EIGEN", "GEBURTSURKUNDE_KIND"],
      uploadedTypes: ["GEBURTSURKUNDE_EIGEN", "GEBURTSURKUNDE_KIND"],
      hasChildren: true,
    });
    expect(missing).toEqual([]);
  });

  it("liefert deutsche Labels", () => {
    expect(documentTypeLabel("GEBURTSURKUNDE_EIGEN")).toBe(
      "Kopie Ihrer Geburtsurkunde",
    );
    expect(documentTypeLabel("UNBEKANNT")).toBe("UNBEKANNT");
  });
});

/**
 * Der Masernschutz-Nachweis ist der erste Fall einer Pflicht, die NICHT sperrt
 * (Entscheidung 07.09.2026). Die Tests hier halten beide Haelften fest: dass er
 * ueberhaupt zur Pflicht wird, und dass er trotzdem niemanden aufhaelt.
 *
 * Die Regel selbst (Geburtsjahr, Einrichtungstyp) steht in
 * src/lib/masernschutz.ts und wird dort geprueft. Hier kommt sie nur noch als
 * Wahrheitswert an.
 */
describe("Masernschutz als bedingte Pflicht", () => {
  const VORLAGE = ["GEBURTSURKUNDE_EIGEN"];

  it("entsteht, obwohl die Vorlage den Typ gar nicht kennt", () => {
    // Wie beim Befreiungsantrag: Keine Vorlage fuehrt MASERNSCHUTZ in
    // requiredDocuments. Eine Regel, die die Liste nur durchsiebt, erzeugt die
    // Pflicht nie.
    expect(VORLAGE).not.toContain("MASERNSCHUTZ");
    const pflicht = effektivePflichtDokumente({
      required: VORLAGE,
      hasChildren: false,
      masernschutzPflichtig: true,
    });
    expect(pflicht).toContain("MASERNSCHUTZ");
  });

  it("faellt ohne Pflicht wieder heraus, auch wenn HR ihn angehakt hat", () => {
    // Der Typ ist im Vorlagen-Editor waehlbar. Von einer Verwaltungskraft ein
    // Attest zu verlangen, waere ein Gesundheitsdatum ohne Rechtsgrundlage.
    const mitMasern = [...VORLAGE, "MASERNSCHUTZ"];
    for (const wert of [false, undefined]) {
      expect(
        effektivePflichtDokumente({
          required: mitMasern,
          hasChildren: false,
          masernschutzPflichtig: wert,
        }),
      ).not.toContain("MASERNSCHUTZ");
    }
  });

  it("steht genau einmal in der Liste", () => {
    const pflicht = effektivePflichtDokumente({
      required: [...VORLAGE, "MASERNSCHUTZ"],
      hasChildren: false,
      masernschutzPflichtig: true,
    });
    expect(pflicht.filter((t) => t === "MASERNSCHUTZ")).toHaveLength(1);
  });

  it("sperrt das Absenden nicht — das ist der Unterschied zum Befreiungsantrag", () => {
    // Der Kern der Entscheidung: Ohne Nachweis geht der Fragebogen trotzdem
    // weg, sonst haengen Bankverbindung und Steuer-ID mit fest. Der
    // Befreiungsantrag daneben sperrt weiterhin.
    const eingaben = {
      required: VORLAGE,
      uploadedTypes: ["GEBURTSURKUNDE_EIGEN"],
      hasChildren: false,
      masernschutzPflichtig: true,
      rvEntscheidung: "BEFREIUNG_BEANTRAGT",
    };
    expect(computeMissingRequiredDocuments(eingaben)).toEqual(["RV_BEFREIUNG"]);
    expect(istNachreichbar("MASERNSCHUTZ")).toBe(true);
    expect(istNachreichbar("RV_BEFREIUNG")).toBe(false);
    expect(sperrendePflichtDokumente(eingaben)).not.toContain("MASERNSCHUTZ");
  });

  it("wird trotzdem als fehlend gemeldet — nur eben nachreichbar", () => {
    // Ohne diese zweite Liste waere die Nachreichbarkeit ein stilles
    // Fallenlassen der Pflicht: Niemand mahnt, niemand meldet.
    const fehlt = fehlendeNachreichbareDokumente({
      required: VORLAGE,
      uploadedTypes: ["GEBURTSURKUNDE_EIGEN"],
      hasChildren: false,
      masernschutzPflichtig: true,
    });
    expect(fehlt).toEqual(["MASERNSCHUTZ"]);
  });

  it("meldet nichts mehr, sobald der Nachweis vorliegt", () => {
    const eingaben = {
      required: VORLAGE,
      uploadedTypes: ["GEBURTSURKUNDE_EIGEN", "MASERNSCHUTZ"],
      hasChildren: false,
      masernschutzPflichtig: true,
    };
    expect(fehlendeNachreichbareDokumente(eingaben)).toEqual([]);
    expect(computeMissingRequiredDocuments(eingaben)).toEqual([]);
  });

  it("meldet nichts, wenn gar keine Pflicht besteht", () => {
    expect(
      fehlendeNachreichbareDokumente({
        required: VORLAGE,
        uploadedTypes: [],
        hasChildren: false,
        masernschutzPflichtig: false,
      }),
    ).toEqual([]);
  });

  it("erklärt im Hinweis beides: die Pflicht und das Nachreichen", () => {
    // Fehlt eine der beiden Haelften, wirkt der Nachweis entweder freiwillig
    // (und kommt nie) oder wie eine Sperre (und die Person bricht ab).
    expect(MASERNSCHUTZ_HINWEIS).toContain("31.12.1970");
    expect(MASERNSCHUTZ_HINWEIS).toMatch(/nachreichen/i);
    expect(MASERNSCHUTZ_HINWEIS).toContain("Gesundheitsamt");
  });
});

/**
 * Aufenthaltstitel und Arbeitserlaubnis — gemeldet von der
 * Personalsachbearbeiterin (07.09.2026): Fuer Personen ausserhalb der EU fehlen
 * die beiden Nachweise vollstaendig, und zwar fuer ALLE Einstellungsarten.
 *
 * Die Pflicht haengt an der SELBSTAUSKUNFT aus Schritt 1, nicht an
 * `nationality`. Das Feld ist Freitext ohne Laenderliste; bei Doppelstaatlern
 * steht dort "deutsch/tuerkisch". Diese Tests halten fest, dass die Regel
 * ausschliesslich auf der Antwort aufsetzt.
 */
describe("Aufenthaltstitel und Arbeitserlaubnis als bedingte Pflicht", () => {
  const VORLAGE = ["GEBURTSURKUNDE_EIGEN"];

  it("entstehen beide, obwohl die Vorlage sie gar nicht kennt", () => {
    const pflicht = effektivePflichtDokumente({
      required: VORLAGE,
      hasChildren: false,
      aufenthaltstitelErforderlich: true,
    });
    expect(pflicht).toContain("AUFENTHALTSTITEL");
    expect(pflicht).toContain("ARBEITSERLAUBNIS");
  });

  it("fallen bei Nein wieder heraus, auch wenn HR sie angehakt hat", () => {
    // Der Aufenthaltsstatus laesst auf die ethnische Herkunft schliessen. Eine
    // im Vorlagen-Editor gesetzte Pflicht darf ihn nicht bei jeder deutschen
    // Bewerberin abfragen.
    const mitTitel = [...VORLAGE, "AUFENTHALTSTITEL", "ARBEITSERLAUBNIS"];
    const pflicht = effektivePflichtDokumente({
      required: mitTitel,
      hasChildren: false,
      aufenthaltstitelErforderlich: false,
    });
    expect(pflicht).not.toContain("AUFENTHALTSTITEL");
    expect(pflicht).not.toContain("ARBEITSERLAUBNIS");
  });

  it("entstehen NICHT, solange die Frage unbeantwortet ist", () => {
    // null/undefined heisst "noch nicht gefragt". Eine Pflicht daraus zu machen
    // hiesse, jemanden an einer Forderung haengen zu lassen, die er nie gesehen
    // hat — der Fragebogen zeigt die Frage erst in Schritt 1.
    for (const wert of [null, undefined]) {
      const pflicht = effektivePflichtDokumente({
        required: [...VORLAGE, "AUFENTHALTSTITEL"],
        hasChildren: false,
        aufenthaltstitelErforderlich: wert,
      });
      expect(pflicht).not.toContain("AUFENTHALTSTITEL");
      expect(pflicht).not.toContain("ARBEITSERLAUBNIS");
    }
  });

  it("stehen genau einmal in der Liste, auch wenn die Vorlage sie fuehrt", () => {
    const pflicht = effektivePflichtDokumente({
      required: [...VORLAGE, "AUFENTHALTSTITEL", "ARBEITSERLAUBNIS"],
      hasChildren: false,
      aufenthaltstitelErforderlich: true,
    });
    expect(pflicht.filter((t) => t === "AUFENTHALTSTITEL")).toHaveLength(1);
    expect(pflicht.filter((t) => t === "ARBEITSERLAUBNIS")).toHaveLength(1);
  });

  it("sperren das Absenden nicht — der Titel liegt oft bei der Behörde", () => {
    // Entscheidung 08.09.2026: Das Risiko entsteht bei der Beschaeftigung, nicht
    // beim Ausfuellen. Waehrend einer Verlaengerung liegt der Titel im Original
    // bei der Auslaenderbehoerde; eine Sperre waere dann durch nichts aufzuheben.
    const eingaben = {
      required: VORLAGE,
      uploadedTypes: ["GEBURTSURKUNDE_EIGEN"],
      hasChildren: false,
      aufenthaltstitelErforderlich: true,
    };
    expect(istNachreichbar("AUFENTHALTSTITEL")).toBe(true);
    expect(istNachreichbar("ARBEITSERLAUBNIS")).toBe(true);
    expect(computeMissingRequiredDocuments(eingaben)).toEqual([]);
    expect(sperrendePflichtDokumente(eingaben)).not.toContain("AUFENTHALTSTITEL");
  });

  it("werden trotzdem als fehlend gemeldet — nur eben nachreichbar", () => {
    const fehlt = fehlendeNachreichbareDokumente({
      required: VORLAGE,
      uploadedTypes: ["GEBURTSURKUNDE_EIGEN"],
      hasChildren: false,
      aufenthaltstitelErforderlich: true,
    });
    expect(fehlt).toEqual(["AUFENTHALTSTITEL", "ARBEITSERLAUBNIS"]);
  });

  it("melden nichts mehr, sobald beide Nachweise vorliegen", () => {
    expect(
      fehlendeNachreichbareDokumente({
        required: VORLAGE,
        uploadedTypes: [
          "GEBURTSURKUNDE_EIGEN",
          "AUFENTHALTSTITEL",
          "ARBEITSERLAUBNIS",
        ],
        hasChildren: false,
        aufenthaltstitelErforderlich: true,
      }),
    ).toEqual([]);
  });
});

/**
 * Nachweis der privaten Krankenversicherung — das Gegenstueck zur
 * Mitgliedsbescheinigung der gesetzlichen Kasse, das bisher fehlte.
 */
describe("PKV-Nachweis als bedingte Pflicht", () => {
  const VORLAGE = ["KK_BESCHEINIGUNG"];

  it("entsteht bei privat Versicherten", () => {
    const pflicht = effektivePflichtDokumente({
      required: VORLAGE,
      hasChildren: false,
      healthInsuranceType: "privat",
    });
    expect(pflicht).toContain("PKV_NACHWEIS");
  });

  it("entsteht bei gesetzlich, leerem und unbekanntem Wert nicht", () => {
    for (const wert of ["gesetzlich", "", null, undefined, "sonstiges"]) {
      expect(
        effektivePflichtDokumente({
          required: [...VORLAGE, "PKV_NACHWEIS"],
          hasChildren: false,
          healthInsuranceType: wert,
        }),
      ).not.toContain("PKV_NACHWEIS");
    }
  });

  it("laesst die Mitgliedsbescheinigung der gesetzlichen Kasse unberuehrt", () => {
    // Die beiden sind Gegenstuecke, aber die eine Regel darf die andere nicht
    // ersetzen: KK_BESCHEINIGUNG steht in der Vorlagen-Konfiguration und bleibt
    // dort, wo HR sie angehakt hat.
    const pflicht = effektivePflichtDokumente({
      required: VORLAGE,
      hasChildren: false,
      healthInsuranceType: "privat",
    });
    expect(pflicht).toContain("KK_BESCHEINIGUNG");
  });

  it("sperrt das Absenden nicht, wird aber angemahnt", () => {
    const eingaben = {
      required: VORLAGE,
      uploadedTypes: ["KK_BESCHEINIGUNG"],
      hasChildren: false,
      healthInsuranceType: "privat",
    };
    expect(computeMissingRequiredDocuments(eingaben)).toEqual([]);
    expect(fehlendeNachreichbareDokumente(eingaben)).toEqual(["PKV_NACHWEIS"]);
  });
});

/**
 * Die Hinweise sind kein Beiwerk: Ohne sie wirkt eine nachreichbare Pflicht
 * entweder freiwillig (und kommt nie) oder wie eine Sperre (und die Person
 * bricht ab).
 */
describe("Hinweistexte der neuen Pflichten", () => {
  it("erklaeren beim Aufenthaltstitel das Ablaufdatum und das Nachreichen", () => {
    expect(AUFENTHALTSTITEL_HINWEIS).toMatch(/Ablaufdatum/);
    expect(AUFENTHALTSTITEL_HINWEIS).toMatch(/nachreichen/i);
  });

  it("nennen bei der Arbeitserlaubnis zuerst den haeufigsten Fall", () => {
    // Meist steht die Erlaubnis auf dem Titel selbst. Wer das nicht liest, sucht
    // ein Papier, das er nie bekommen hat.
    expect(ARBEITSERLAUBNIS_HINWEIS).toMatch(/Erwerbstätigkeit gestattet/);
    expect(ARBEITSERLAUBNIS_HINWEIS).toMatch(/nachreichen/i);
  });

  it("verlangen beim PKV-Nachweis nicht die ganze Police", () => {
    expect(PKV_NACHWEIS_HINWEIS).toMatch(/nicht nötig/);
    expect(PKV_NACHWEIS_HINWEIS).toMatch(/nachreichen/i);
  });

  it("sagen vor dem Absenden alle drei Folgen des Nachreichens", () => {
    // Der Satz steht unmittelbar vor dem verbindlichen Absenden und muss drei
    // Fragen beantworten. Faellt eine weg, entsteht genau der Schaden, den sie
    // verhindern soll: Abbruch vor dem freien Knopf, Nachreichbarkeit als
    // Erlass missverstanden, oder eine Unterlage, die „nachher ueber den Link"
    // kommen sollte und nie kommt.
    expect(NACHREICHEN_FOLGEN_HINWEIS).toMatch(
      /Sie können den Fragebogen absenden/,
    );
    expect(NACHREICHEN_FOLGEN_HINWEIS).toContain("Nachweis offen");
    expect(NACHREICHEN_FOLGEN_HINWEIS).toMatch(
      /nach dem Absenden nichts mehr hochladen/,
    );
  });

  it("sind ueber PFLICHT_HINWEISE erreichbar — die Oberflaeche verzweigt nicht selbst", () => {
    expect(PFLICHT_HINWEISE.AUFENTHALTSTITEL).toBe(AUFENTHALTSTITEL_HINWEIS);
    expect(PFLICHT_HINWEISE.ARBEITSERLAUBNIS).toBe(ARBEITSERLAUBNIS_HINWEIS);
    expect(PFLICHT_HINWEISE.PKV_NACHWEIS).toBe(PKV_NACHWEIS_HINWEIS);
    expect(PFLICHT_HINWEISE.MASERNSCHUTZ).toBe(MASERNSCHUTZ_HINWEIS);
    // Ein Typ ohne Erklaerung ist der Regelfall und kein Fehler.
    expect(PFLICHT_HINWEISE.GEBURTSURKUNDE_EIGEN).toBeUndefined();
  });
});

describe("Anzeige und Vorlagen-Editor kennen die neuen Typen", () => {
  it("liefert deutsche Labels", () => {
    expect(documentTypeLabel("AUFENTHALTSTITEL")).toBe("Aufenthaltstitel");
    expect(documentTypeLabel("ARBEITSERLAUBNIS")).toBe(
      "Arbeitserlaubnis / Zusatzblatt",
    );
    expect(documentTypeLabel("PKV_NACHWEIS")).toBe(
      "Nachweis private Krankenversicherung",
    );
  });

  it("bietet sie im Vorlagen-Editor an", () => {
    // VALID_DOCUMENT_TYPES der Vorlagen-Route wird aus DOCUMENT_TYPE_LABELS
    // gebildet — ohne diesen Eintrag waeren sie speicherbar, aber nicht
    // anklickbar.
    for (const typ of ["AUFENTHALTSTITEL", "ARBEITSERLAUBNIS", "PKV_NACHWEIS"]) {
      expect(SELECTABLE_DOCUMENT_TYPES).toContain(typ);
    }
  });
});

/**
 * Die Regeln duerfen sich nicht gegenseitig ausloeschen. Frueher stand je Typ
 * ein eigenes `if` im Filter; seit es eine gemeinsame Menge ist, muss der Fall
 * "alles gleichzeitig" abgesichert sein.
 */
describe("Mehrere bedingte Pflichten gleichzeitig", () => {
  it("erzeugt alle fuenf nebeneinander", () => {
    const pflicht = effektivePflichtDokumente({
      required: ["GEBURTSURKUNDE_EIGEN", "GEBURTSURKUNDE_KIND"],
      hasChildren: true,
      rvEntscheidung: "BEFREIUNG_BEANTRAGT",
      masernschutzPflichtig: true,
      aufenthaltstitelErforderlich: true,
      healthInsuranceType: "privat",
    });
    expect(pflicht).toEqual([
      "GEBURTSURKUNDE_EIGEN",
      "GEBURTSURKUNDE_KIND",
      "RV_BEFREIUNG",
      "MASERNSCHUTZ",
      "AUFENTHALTSTITEL",
      "ARBEITSERLAUBNIS",
      "PKV_NACHWEIS",
    ]);
  });

  it("nennt dieselben vier als nachreichbar, ohne den Bestand zu kennen", () => {
    // Die Zusammenfassung kuendigt an, WAS nachgereicht werden darf; sie hat
    // die Dokumentenliste nicht (die ist lokaler Zustand der Upload-Karte).
    // Deshalb eine eigene Funktion ohne `uploadedTypes` — und deshalb muss sie
    // dieselbe Antwort geben wie die Luecken-Fassung bei leerem Bestand.
    const eingaben = {
      required: ["GEBURTSURKUNDE_EIGEN"],
      hasChildren: false,
      rvEntscheidung: "BEFREIUNG_BEANTRAGT",
      masernschutzPflichtig: true,
      aufenthaltstitelErforderlich: true,
      healthInsuranceType: "privat",
    };
    expect(nachreichbarePflichtDokumente(eingaben)).toEqual([
      "MASERNSCHUTZ",
      "AUFENTHALTSTITEL",
      "ARBEITSERLAUBNIS",
      "PKV_NACHWEIS",
    ]);
    expect(nachreichbarePflichtDokumente(eingaben)).toEqual(
      fehlendeNachreichbareDokumente({ ...eingaben, uploadedTypes: [] }),
    );
    // Der Befreiungsantrag gehoert NICHT dazu — er sperrt.
    expect(nachreichbarePflichtDokumente(eingaben)).not.toContain(
      "RV_BEFREIUNG",
    );
  });

  it("meldet als nachreichbar nichts, wo keine Pflicht besteht", () => {
    expect(
      nachreichbarePflichtDokumente({
        required: ["GEBURTSURKUNDE_EIGEN", "MASERNSCHUTZ", "AUFENTHALTSTITEL"],
        hasChildren: false,
        masernschutzPflichtig: false,
        aufenthaltstitelErforderlich: false,
        healthInsuranceType: "gesetzlich",
      }),
    ).toEqual([]);
  });

  it("laesst nur den Befreiungsantrag sperren", () => {
    // Das ist die Kernaussage der Entscheidung: Vier nachreichbare Pflichten
    // halten niemanden auf, die Schriftform-Pflicht schon.
    const eingaben = {
      required: ["GEBURTSURKUNDE_EIGEN"],
      uploadedTypes: [],
      hasChildren: false,
      rvEntscheidung: "BEFREIUNG_BEANTRAGT",
      masernschutzPflichtig: true,
      aufenthaltstitelErforderlich: true,
      healthInsuranceType: "privat",
    };
    expect(computeMissingRequiredDocuments(eingaben)).toEqual([
      "GEBURTSURKUNDE_EIGEN",
      "RV_BEFREIUNG",
    ]);
    expect(fehlendeNachreichbareDokumente(eingaben)).toEqual([
      "MASERNSCHUTZ",
      "AUFENTHALTSTITEL",
      "ARBEITSERLAUBNIS",
      "PKV_NACHWEIS",
    ]);
  });
});
