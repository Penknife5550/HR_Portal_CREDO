/**
 * Tests fuer AP 8: die bedingte Upload-Pflicht und die Sperre vor der
 * Antragserzeugung.
 *
 * Der wichtigste Test in dieser Datei ist der, der pruefen, dass die AUFHEBUNG
 * **keinen** Upload verlangt. Direkt neben der neuen Regel steht im Code eine
 * Pruefung, die bewusst beide Antragsarten umfasst (die Versicherungsnummer) —
 * sie ist die naheliegendste Vorlage zum Abschreiben und waere hier falsch:
 * § 6 Abs. 6 SGB VI laesst die elektronische Erklaerung ausdruecklich zu.
 */

import {
  computeMissingRequiredDocuments,
  effektivePflichtDokumente,
  documentTypeLabel,
  RV_BEFREIUNG_HINWEIS,
} from "@/lib/required-documents";
import {
  antragVerfuegbar,
  pruefeAntragMoeglich,
} from "@/lib/minijob-antrag";

const VORLAGE = ["GEBURTSURKUNDE_EIGEN", "GEBURTSURKUNDE_KIND"];

describe("Der Befreiungsantrag wird zur Pflicht", () => {
  it("nur bei der Entscheidung für die Befreiung", () => {
    const pflicht = effektivePflichtDokumente({
      required: VORLAGE,
      hasChildren: false,
      rvEntscheidung: "BEFREIUNG_BEANTRAGT",
    });
    expect(pflicht).toContain("RV_BEFREIUNG");
  });

  it("nicht bei der Aufhebung — sie darf elektronisch erklärt werden", () => {
    // Das ist der Kern: Ein erzwungener Ausdruck waere hinzuerfundene
    // Foermlichkeit und wuerde die elektronische Erklaerung entwerten.
    const pflicht = effektivePflichtDokumente({
      required: VORLAGE,
      hasChildren: false,
      rvEntscheidung: "AUFHEBUNG_BEANTRAGT",
    });
    expect(pflicht).not.toContain("RV_BEFREIUNG");
  });

  it("nicht bei den übrigen Wegen", () => {
    for (const wert of [
      "KEINE_BEFREIUNG",
      "RENTENVERSICHERUNGSFREI",
      null,
      undefined,
    ]) {
      const pflicht = effektivePflichtDokumente({
        required: VORLAGE,
        hasChildren: false,
        rvEntscheidung: wert,
      });
      expect(pflicht).not.toContain("RV_BEFREIUNG");
    }
  });

  it("entsteht, obwohl die Vorlage den Typ gar nicht kennt", () => {
    // RV_BEFREIUNG steht in FormTemplate.requiredDocuments der MINIJOB-Vorlage
    // nicht. Eine Regel, die die Liste nur durchsiebt, erzeugt die Pflicht nie.
    expect(VORLAGE).not.toContain("RV_BEFREIUNG");
    expect(
      effektivePflichtDokumente({
        required: VORLAGE,
        hasChildren: false,
        rvEntscheidung: "BEFREIUNG_BEANTRAGT",
      })
    ).toContain("RV_BEFREIUNG");
  });

  it("verschwindet wieder, wenn HR den Typ fest angehakt hat", () => {
    // Im Vorlagen-Editor laesst sich RV_BEFREIUNG unbedingt setzen. Dann duerfte
    // er trotzdem nicht jeden treffen — auch nicht den, der versichert bleibt.
    const mitRv = [...VORLAGE, "RV_BEFREIUNG"];
    expect(
      effektivePflichtDokumente({
        required: mitRv,
        hasChildren: false,
        rvEntscheidung: "KEINE_BEFREIUNG",
      })
    ).not.toContain("RV_BEFREIUNG");
  });

  it("steht genau einmal in der Liste", () => {
    const mitRv = [...VORLAGE, "RV_BEFREIUNG"];
    const pflicht = effektivePflichtDokumente({
      required: mitRv,
      hasChildren: false,
      rvEntscheidung: "BEFREIUNG_BEANTRAGT",
    });
    expect(pflicht.filter((t) => t === "RV_BEFREIUNG")).toHaveLength(1);
  });
});

describe("Die bestehende Kinder-Regel bleibt unberührt", () => {
  it("verlangt die Geburtsurkunde der Kinder nur mit Kindern", () => {
    expect(
      effektivePflichtDokumente({ required: VORLAGE, hasChildren: false })
    ).not.toContain("GEBURTSURKUNDE_KIND");
    expect(
      effektivePflichtDokumente({ required: VORLAGE, hasChildren: true })
    ).toContain("GEBURTSURKUNDE_KIND");
  });
});

describe("Was noch fehlt", () => {
  it("meldet den Antrag, solange er nicht hochgeladen ist", () => {
    const fehlt = computeMissingRequiredDocuments({
      required: VORLAGE,
      uploadedTypes: ["GEBURTSURKUNDE_EIGEN"],
      hasChildren: false,
      rvEntscheidung: "BEFREIUNG_BEANTRAGT",
    });
    expect(fehlt).toEqual(["RV_BEFREIUNG"]);
  });

  it("meldet nichts mehr, sobald er hochgeladen ist", () => {
    const fehlt = computeMissingRequiredDocuments({
      required: VORLAGE,
      uploadedTypes: ["GEBURTSURKUNDE_EIGEN", "RV_BEFREIUNG"],
      hasChildren: false,
      rvEntscheidung: "BEFREIUNG_BEANTRAGT",
    });
    expect(fehlt).toEqual([]);
  });

  it("greift auch, wenn die Vorlage gar keine Pflichtdokumente führt", () => {
    // Genau der Fall, den der frühere Guard `if (requiredDocs.length > 0)`
    // lautlos uebersprungen haette.
    const fehlt = computeMissingRequiredDocuments({
      required: [],
      uploadedTypes: [],
      hasChildren: false,
      rvEntscheidung: "BEFREIUNG_BEANTRAGT",
    });
    expect(fehlt).toEqual(["RV_BEFREIUNG"]);
  });
});

describe("Die Beschriftung sagt, worauf es ankommt", () => {
  it("nennt die Unterschrift", () => {
    expect(documentTypeLabel("RV_BEFREIUNG")).toContain("Unterschrieben");
  });

  it("erklärt, warum ein Häkchen nicht genügt", () => {
    expect(RV_BEFREIUNG_HINWEIS).toContain("Schriftform");
    expect(RV_BEFREIUNG_HINWEIS).toContain("unterschriebenen");
    // Diesen Satz liest der Beschaeftigte — ohne Paragrafen.
    expect(RV_BEFREIUNG_HINWEIS).not.toMatch(/§|SGB/);
  });
});

describe("Sperre vor der Antragserzeugung", () => {
  const vollstaendig = {
    rvEntscheidung: "BEFREIUNG_BEANTRAGT",
    mandantName: "Berufskolleg Minden",
    betriebsnummer: "12345678",
  };

  it("lässt den Antrag durch, wenn alles vorliegt", () => {
    const p = pruefeAntragMoeglich(vollstaendig);
    expect(p.erlaubt).toBe(true);
    if (p.erlaubt) expect(p.art).toBe("BEFREIUNG");
    expect(antragVerfuegbar(vollstaendig)).toBe(true);
  });

  it("blockiert ohne Betriebsnummer — statt leer zu drucken", () => {
    // Ein amtlicher Antrag mit leerem Pflichtfeld sieht vollstaendig aus und
    // ist es nicht. In den Entgeltunterlagen ist er dann wertlos.
    for (const leer of [null, undefined, "", "   "]) {
      const p = pruefeAntragMoeglich({ ...vollstaendig, betriebsnummer: leer });
      expect(p.erlaubt).toBe(false);
      if (!p.erlaubt) {
        expect(p.grund).toContain("Berufskolleg Minden");
        expect(p.grund).toContain("Betriebsnummer");
      }
    }
  });

  it("blockiert auch die Aufhebung ohne Betriebsnummer", () => {
    // Dass die Aufhebung keinen Upload braucht, heisst nicht, dass ihr Formular
    // unvollstaendig sein darf — der Arbeitgeberteil ist auf beiden Blaettern gleich.
    const p = pruefeAntragMoeglich({
      rvEntscheidung: "AUFHEBUNG_BEANTRAGT",
      mandantName: "Kita Minden",
      betriebsnummer: null,
    });
    expect(p.erlaubt).toBe(false);
  });

  it("blockiert, wenn gar kein Antrag vorgesehen ist", () => {
    for (const wert of ["KEINE_BEFREIUNG", "RENTENVERSICHERUNGSFREI", null]) {
      const p = pruefeAntragMoeglich({ ...vollstaendig, rvEntscheidung: wert });
      expect(p.erlaubt).toBe(false);
    }
  });

  it("weist eine Antragsart ab, die nicht zur Entscheidung passt", () => {
    // Sonst liesse sich ueber den URL-Parameter ein Formular erzeugen, das zur
    // Akte nicht passt.
    const p = pruefeAntragMoeglich(vollstaendig, "AUFHEBUNG");
    expect(p.erlaubt).toBe(false);
  });

  it("blockiert ohne Mandantennamen", () => {
    const p = pruefeAntragMoeglich({ ...vollstaendig, mandantName: "" });
    expect(p.erlaubt).toBe(false);
  });

  it("verlangt keine Rentenversicherungsnummer", () => {
    // Bewusst: Das ist die eigene Angabe des Beschaeftigten, und er haelt beim
    // Unterschreiben ohnehin einen Stift. Ihn am Ausdruck zu hindern, waere
    // Bevormundung — und das Absenden prueft die Nummer ohnehin.
    expect(pruefeAntragMoeglich(vollstaendig).erlaubt).toBe(true);
  });
});
