import {
  MASERNSCHUTZ_HINWEIS,
  computeMissingRequiredDocuments,
  documentTypeLabel,
  effektivePflichtDokumente,
  fehlendeNachreichbareDokumente,
  istNachreichbar,
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
