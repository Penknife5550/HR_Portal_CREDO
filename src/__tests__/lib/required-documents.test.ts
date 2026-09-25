import {
  ARBEITSERLAUBNIS_HINWEIS,
  AUFENTHALTSTITEL_HINWEIS,
  DOCUMENT_TYPE_LABELS,
  MASERNSCHUTZ_HINWEIS,
  NACHFORDERUNG_HINWEISE,
  NACHREICHBARE_PFLICHTEN,
  NACHREICHEN_FOLGEN_HINWEIS,
  PFLICHT_HINWEISE,
  PKV_NACHWEIS_HINWEIS,
  SCHRIFTFORM_DOKUMENTTYPEN,
  SELECTABLE_DOCUMENT_TYPES,
  SENSIBEL_SPERRGRUND_TEXTE,
  SENSIBLE_DOKUMENTTYPEN,
  computeMissingRequiredDocuments,
  documentTypeLabel,
  effektivePflichtDokumente,
  fehlendeNachreichbareDokumente,
  istNachreichbar,
  nachreichbarePflichtDokumente,
  offeneNachweise,
  PFLICHT_DOKUMENTE_OHNE_VORLAGE,
  pflichtDokumenteAusVorlage,
  pflichtEingabenAusVorgang,
  sensibelAnforderbar,
  sperrendePflichtDokumente,
  type PflichtEingaben,
  type PflichtQuelle,
} from "@/lib/required-documents";
import { masernschutzPflichtig } from "@/lib/masernschutz";

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

// =============================================
// Paket 4: eine Quelle fuer Kasten und Server
// =============================================

/**
 * Die beiden Bloecke, die `pflichtEingabenAusVorgang` abloest — woertlich so,
 * wie sie bis Paket 4 inline standen. Sie sind hier eingefroren, damit der Test
 * gegen das alte Verhalten prueft und nicht gegen sich selbst.
 */
type AltPersonalData = {
  birthDate?: unknown;
  rvEntscheidung?: string | null;
  aufenthaltstitelErforderlich?: boolean | null;
  healthInsuranceType?: string | null;
  children?: unknown[];
} | null;

/** Absendezweig, src/app/api/fragebogen/[token]/route.ts (bis Paket 4). */
function alterServerBlock(
  requiredDocs: string[],
  childCount: number,
  onboarding: { personalData: AltPersonalData; organization: { type: string | null } },
): PflichtEingaben {
  return {
    required: requiredDocs,
    hasChildren: childCount > 0,
    rvEntscheidung: onboarding.personalData?.rvEntscheidung ?? null,
    masernschutzPflichtig: masernschutzPflichtig({
      geburtsdatum: onboarding.personalData?.birthDate,
      organisationstyp: onboarding.organization.type,
    }),
    aufenthaltstitelErforderlich:
      onboarding.personalData?.aufenthaltstitelErforderlich ?? null,
    healthInsuranceType: onboarding.personalData?.healthInsuranceType ?? null,
  };
}

/** Kasten „Offene Nachweise", detail-content.tsx (bis Paket 4). */
function alterKasten(data: {
  requiredDocuments?: string[] | null;
  personalData: (AltPersonalData & { children: unknown[] }) | null;
  organization: { type?: string | null };
  documents: { type: string }[];
}): string[] {
  const pd = data.personalData;
  return fehlendeNachreichbareDokumente({
    required: data.requiredDocuments ?? [],
    hasChildren: (pd?.children.length ?? 0) > 0,
    rvEntscheidung: pd?.rvEntscheidung ?? null,
    masernschutzPflichtig: masernschutzPflichtig({
      geburtsdatum: pd?.birthDate,
      organisationstyp: data.organization.type,
    }),
    aufenthaltstitelErforderlich: pd?.aufenthaltstitelErforderlich ?? null,
    healthInsuranceType: pd?.healthInsuranceType ?? null,
    uploadedTypes: data.documents.map((d) => d.type),
  });
}

/** Alle Kombinationen, die fuer eine der Regeln einen Unterschied machen. */
function pflichtMatrix() {
  const faelle: {
    required: string[] | null | undefined;
    kinder: number;
    orgTyp: string | null;
    pd: (AltPersonalData & { children: unknown[] }) | null;
    vorhanden: string[];
  }[] = [];
  const pds: ((AltPersonalData & { children: unknown[] }) | null)[] = [null];
  for (const birthDate of [null, "1965-04-01", "1990-05-03", new Date("1990-05-03T00:00:00Z")]) {
    for (const rvEntscheidung of [null, "BEFREIUNG_BEANTRAGT", "KEINE_BEFREIUNG"]) {
      for (const aufenthaltstitelErforderlich of [null, true, false]) {
        for (const healthInsuranceType of [null, "privat", "gesetzlich"]) {
          pds.push({ birthDate, rvEntscheidung, aufenthaltstitelErforderlich, healthInsuranceType, children: [] });
        }
      }
    }
  }
  for (const required of [
    null,
    undefined,
    [],
    ["GEBURTSURKUNDE_EIGEN", "GEBURTSURKUNDE_KIND"],
    ["GEBURTSURKUNDE_EIGEN", "MASERNSCHUTZ", "AUFENTHALTSTITEL", "FUEHRUNGSZEUGNIS"],
  ]) {
    for (const kinder of [0, 2]) {
      for (const orgTyp of [null, "GYMNASIUM", "KITA", "VERWALTUNG"]) {
        for (const pd of pds) {
          for (const vorhanden of [[], ["MASERNSCHUTZ", "PKV_NACHWEIS"], ["AUFENTHALTSTITEL"]]) {
            faelle.push({ required, kinder, orgTyp, pd, vorhanden });
          }
        }
      }
    }
  }
  return faelle;
}

describe("pflichtEingabenAusVorgang", () => {
  it("liefert fuer den Server genau den alten Block des Absendezweigs — ueber die ganze Matrix", () => {
    let geprueft = 0;
    for (const f of pflichtMatrix()) {
      // Der Server hat immer eine Liste: `vorlage?.requiredDocuments ?? [...]`.
      if (!Array.isArray(f.required)) continue;
      const alt = alterServerBlock(f.required, f.kinder, {
        personalData: f.pd,
        organization: { type: f.orgTyp },
      });
      const neu = pflichtEingabenAusVorgang({
        required: f.required,
        anzahlKinder: f.kinder,
        organisationstyp: f.orgTyp,
        personalData: f.pd,
      });
      expect(neu).toEqual(alt);
      geprueft++;
    }
    expect(geprueft).toBeGreaterThan(1000);
  });

  it("uebernimmt die Liste des Servers unveraendert — auch eine leere, ohne Rueckfall", () => {
    // Der Rueckfall auf die Geburtsurkunden gehoert zum Laden der Vorlage
    // (`??`), nicht hierher: Eine Vorlage mit leerer Liste bleibt leer.
    const quelle: PflichtQuelle = { required: [], anzahlKinder: 1, organisationstyp: null };
    expect(pflichtEingabenAusVorgang(quelle).required).toEqual([]);
    const liste = ["GEBURTSURKUNDE_EIGEN"];
    expect(pflichtEingabenAusVorgang({ ...quelle, required: liste }).required).toEqual(liste);
  });

  it("macht wie der Kasten aus einer fehlenden Liste die leere Liste", () => {
    for (const required of [null, undefined]) {
      expect(
        pflichtEingabenAusVorgang({ required, anzahlKinder: 0, organisationstyp: "GYMNASIUM" }).required,
      ).toEqual([]);
    }
  });

  it("ohne personalData: keine Selbstauskunft, kein Masernschutz", () => {
    expect(
      pflichtEingabenAusVorgang({
        required: ["GEBURTSURKUNDE_EIGEN"],
        anzahlKinder: 0,
        organisationstyp: "GYMNASIUM",
        personalData: null,
      }),
    ).toEqual({
      required: ["GEBURTSURKUNDE_EIGEN"],
      hasChildren: false,
      rvEntscheidung: null,
      masernschutzPflichtig: false,
      aufenthaltstitelErforderlich: null,
      healthInsuranceType: null,
    });
  });

  it("wertet den Masernschutz mit derselben Regel aus wie masernschutz.ts", () => {
    const pd = { birthDate: "1990-05-03" };
    expect(
      pflichtEingabenAusVorgang({ required: [], anzahlKinder: 0, organisationstyp: "GYMNASIUM", personalData: pd })
        .masernschutzPflichtig,
    ).toBe(true);
    // Verwaltung ist keine Gemeinschaftseinrichtung, 1965 vor der Stichtagsgrenze.
    expect(
      pflichtEingabenAusVorgang({ required: [], anzahlKinder: 0, organisationstyp: "VERWALTUNG", personalData: pd })
        .masernschutzPflichtig,
    ).toBe(false);
    expect(
      pflichtEingabenAusVorgang({
        required: [],
        anzahlKinder: 0,
        organisationstyp: "GYMNASIUM",
        personalData: { birthDate: "1965-04-01" },
      }).masernschutzPflichtig,
    ).toBe(false);
  });
});

describe("offeneNachweise", () => {
  it("rechnet wie der alte Kasten — ueber die ganze Matrix", () => {
    let geprueft = 0;
    for (const f of pflichtMatrix()) {
      const pd = f.pd ? { ...f.pd, children: new Array(f.kinder).fill({}) } : null;
      const data = {
        requiredDocuments: f.required,
        personalData: pd,
        organization: { type: f.orgTyp },
        documents: f.vorhanden.map((type) => ({ type })),
      };
      const neu = offeneNachweise(
        pflichtEingabenAusVorgang({
          required: data.requiredDocuments,
          anzahlKinder: pd?.children.length ?? 0,
          organisationstyp: data.organization.type,
          personalData: pd,
        }),
        data.documents.map((d) => d.type),
      );
      expect(neu).toEqual(alterKasten(data));
      geprueft++;
    }
    expect(geprueft).toBeGreaterThan(1000);
  });

  it("nennt nur nachreichbare Pflichten ohne Dokument", () => {
    const eingaben = pflichtEingabenAusVorgang({
      required: ["GEBURTSURKUNDE_EIGEN"],
      anzahlKinder: 0,
      organisationstyp: "GYMNASIUM",
      personalData: {
        birthDate: "1990-05-03",
        rvEntscheidung: "BEFREIUNG_BEANTRAGT",
        aufenthaltstitelErforderlich: true,
        healthInsuranceType: "privat",
      },
    });
    expect(offeneNachweise(eingaben, [])).toEqual([
      "MASERNSCHUTZ",
      "AUFENTHALTSTITEL",
      "ARBEITSERLAUBNIS",
      "PKV_NACHWEIS",
    ]);
    // Die Geburtsurkunde und der Befreiungsantrag sperren das Absenden — nach
    // der Abgabe liegen sie also vor; offen koennen nur nachreichbare sein.
    for (const typ of offeneNachweise(eingaben, [])) {
      expect(NACHREICHBARE_PFLICHTEN).toContain(typ);
    }
    expect(offeneNachweise(eingaben, ["MASERNSCHUTZ", "AUFENTHALTSTITEL"])).toEqual([
      "ARBEITSERLAUBNIS",
      "PKV_NACHWEIS",
    ]);
  });
});

// =============================================
// Paket 4: vertrauliche Arten und Schriftform (Entscheidungen E-1, E-4)
// =============================================

describe("SENSIBLE_DOKUMENTTYPEN und SCHRIFTFORM_DOKUMENTTYPEN", () => {
  it("sensibel sind genau die fuenf aus E-1", () => {
    expect([...SENSIBLE_DOKUMENTTYPEN].sort()).toEqual(
      ["ARBEITSERLAUBNIS", "AUFENTHALTSTITEL", "FUEHRUNGSZEUGNIS", "MASERNSCHUTZ", "SB_AUSWEIS"],
    );
  });

  it("Schriftform haben genau die vier aus E-4", () => {
    expect([...SCHRIFTFORM_DOKUMENTTYPEN].sort()).toEqual(
      ["ARBEITSVERTRAG", "BAV_VERTRAG", "RV_BEFREIUNG", "VL_VERTRAG"],
    );
  });

  it("beide Listen nennen nur Arten, die es gibt, und ueberschneiden sich nicht", () => {
    for (const typ of [...SENSIBLE_DOKUMENTTYPEN, ...SCHRIFTFORM_DOKUMENTTYPEN]) {
      expect(DOCUMENT_TYPE_LABELS[typ]).toBeDefined();
      expect(SELECTABLE_DOCUMENT_TYPES).toContain(typ);
    }
    expect(SENSIBLE_DOKUMENTTYPEN.filter((t) => SCHRIFTFORM_DOKUMENTTYPEN.includes(t))).toEqual([]);
  });
});

describe("sensibelAnforderbar", () => {
  const LEER = { pflicht: [], vorhanden: [], severelyDisabled: null, organisationstyp: "GYMNASIUM" };

  it("nicht sensible Arten sind immer anforderbar", () => {
    for (const typ of ["SV_AUSWEIS", "ARBEITSVERTRAG", "RV_BEFREIUNG", "PKV_NACHWEIS", "ZEUGNIS"]) {
      expect(sensibelAnforderbar(typ, LEER)).toEqual({ ok: true });
      expect(sensibelAnforderbar(typ, { ...LEER, organisationstyp: "KITA" })).toEqual({ ok: true });
    }
  });

  it.each(["MASERNSCHUTZ", "AUFENTHALTSTITEL", "ARBEITSERLAUBNIS", "FUEHRUNGSZEUGNIS"])(
    "%s nur als Pflicht oder wenn schon vorhanden",
    (typ) => {
      expect(sensibelAnforderbar(typ, LEER)).toEqual({
        ok: false,
        grund: "NICHT_PFLICHT",
        text: SENSIBEL_SPERRGRUND_TEXTE.NICHT_PFLICHT,
      });
      expect(sensibelAnforderbar(typ, { ...LEER, pflicht: [typ] })).toEqual({ ok: true });
      // Der verlaengerte Nachweis: Pflicht ist er nicht mehr, aber er liegt vor.
      expect(sensibelAnforderbar(typ, { ...LEER, vorhanden: [typ] })).toEqual({ ok: true });
      // Eine ANDERE Art in Pflicht oder Bestand hilft nicht.
      expect(
        sensibelAnforderbar(typ, { ...LEER, pflicht: ["SV_AUSWEIS"], vorhanden: ["ZEUGNIS"] }).ok,
      ).toBe(false);
    },
  );

  it("das Fuehrungszeugnis ist bei Kitas gesperrt — auch als Pflicht und wenn es vorliegt", () => {
    const kita = { ...LEER, organisationstyp: "KITA" };
    for (const stand of [kita, { ...kita, pflicht: ["FUEHRUNGSZEUGNIS"] }, { ...kita, vorhanden: ["FUEHRUNGSZEUGNIS"] }]) {
      expect(sensibelAnforderbar("FUEHRUNGSZEUGNIS", stand)).toEqual({
        ok: false,
        grund: "FUEHRUNGSZEUGNIS_KITA",
        text: SENSIBEL_SPERRGRUND_TEXTE.FUEHRUNGSZEUGNIS_KITA,
      });
    }
    expect(SENSIBEL_SPERRGRUND_TEXTE.FUEHRUNGSZEUGNIS_KITA).toContain("§ 72a Abs. 5 SGB VIII");
    // Die uebrigen sensiblen Arten gelten bei Kitas wie ueberall.
    expect(sensibelAnforderbar("MASERNSCHUTZ", { ...kita, pflicht: ["MASERNSCHUTZ"] })).toEqual({ ok: true });
  });

  it("den SB-Ausweis nur mit der Angabe „schwerbehindert“ oder wenn er vorliegt — Pflicht allein genuegt nicht", () => {
    // Der Typ ist in jeder Vorlage frei anhakbar; eine angehakte Vorlage
    // holte sonst Gesundheitsdaten von allen ein.
    const nurPflicht = { ...LEER, pflicht: ["SB_AUSWEIS"] };
    expect(sensibelAnforderbar("SB_AUSWEIS", nurPflicht)).toEqual({
      ok: false,
      grund: "SB_AUSWEIS_OHNE_ANGABE",
      text: SENSIBEL_SPERRGRUND_TEXTE.SB_AUSWEIS_OHNE_ANGABE,
    });
    expect(sensibelAnforderbar("SB_AUSWEIS", { ...LEER, severelyDisabled: false }).ok).toBe(false);
    expect(sensibelAnforderbar("SB_AUSWEIS", { ...LEER, severelyDisabled: undefined }).ok).toBe(false);
    expect(sensibelAnforderbar("SB_AUSWEIS", { ...LEER, severelyDisabled: true })).toEqual({ ok: true });
    expect(sensibelAnforderbar("SB_AUSWEIS", { ...LEER, vorhanden: ["SB_AUSWEIS"] })).toEqual({ ok: true });
  });

  it("verlangt Organisationstyp und Schwerbehinderung ausdruecklich — sonst meldet tsc die Luecke", () => {
    // Ohne organisationstyp griffe die Kita-Sperre nicht; der Schluessel ist
    // deshalb Pflicht, auch wenn er `undefined` tragen darf.
    const ohneTyp = { pflicht: ["FUEHRUNGSZEUGNIS"], vorhanden: [], severelyDisabled: null };
    // @ts-expect-error — organisationstyp fehlt
    sensibelAnforderbar("FUEHRUNGSZEUGNIS", ohneTyp);
    const ohneAngabe = { pflicht: [], vorhanden: [], organisationstyp: "KITA" };
    // @ts-expect-error — severelyDisabled fehlt
    sensibelAnforderbar("SB_AUSWEIS", ohneAngabe);
    // Ausdruecklich uebergeben ist die Kita-Sperre wirksam.
    expect(sensibelAnforderbar("FUEHRUNGSZEUGNIS", { ...ohneTyp, organisationstyp: "KITA" }).ok).toBe(false);
  });

  it("zusammen mit den Pflichtregeln: der Aufenthaltstitel wird erst mit der Selbstauskunft anforderbar", () => {
    const pflicht = (aufenthaltstitelErforderlich: boolean | null) =>
      effektivePflichtDokumente(
        pflichtEingabenAusVorgang({
          // Auch eine Vorlage, die den Titel anhakt, macht ihn nicht zur Pflicht.
          required: ["GEBURTSURKUNDE_EIGEN", "AUFENTHALTSTITEL"],
          anzahlKinder: 0,
          organisationstyp: "GYMNASIUM",
          personalData: { aufenthaltstitelErforderlich },
        }),
      );
    for (const antwort of [null, false]) {
      expect(sensibelAnforderbar("AUFENTHALTSTITEL", { ...LEER, pflicht: pflicht(antwort) }).ok).toBe(false);
    }
    expect(sensibelAnforderbar("AUFENTHALTSTITEL", { ...LEER, pflicht: pflicht(true) }).ok).toBe(true);
    expect(sensibelAnforderbar("ARBEITSERLAUBNIS", { ...LEER, pflicht: pflicht(true) }).ok).toBe(true);
  });
});

// =============================================
// Paket 4: Hinweise bei der Nachforderung (10.1, Regel N4)
// =============================================

describe("NACHFORDERUNG_HINWEISE", () => {
  it("kein Text spricht vom Fragebogen, vom Nachreichen oder vom Gesundheitsamt", () => {
    // Die Person wird nach der Abgabe um die Unterlage GEBETEN; „Sie koennen
    // den Fragebogen auch ohne ihn absenden" ist dann falsch.
    for (const [typ, text] of Object.entries(NACHFORDERUNG_HINWEISE)) {
      expect({ typ, fragebogen: /fragebogen/i.test(text) }).toEqual({ typ, fragebogen: false });
      expect({ typ, nachreich: /nachreich/i.test(text) }).toEqual({ typ, nachreich: false });
      expect({ typ, amt: /gesundheitsamt|absenden/i.test(text) }).toEqual({ typ, amt: false });
    }
  });

  it("gibt es fuer jede Art, die im Fragebogen einen Hinweis hat — mit eigenem Text", () => {
    expect(Object.keys(NACHFORDERUNG_HINWEISE).sort()).toEqual(Object.keys(PFLICHT_HINWEISE).sort());
    for (const typ of NACHREICHBARE_PFLICHTEN) {
      expect(NACHFORDERUNG_HINWEISE[typ]).toBeTruthy();
    }
    for (const [typ, text] of Object.entries(NACHFORDERUNG_HINWEISE)) {
      expect(text).not.toBe(PFLICHT_HINWEISE[typ]);
    }
  });

  it("uebernimmt die Beispieltexte der Feinplanung", () => {
    expect(NACHFORDERUNG_HINWEISE.MASERNSCHUTZ).toContain("Seite Ihres Impfpasses mit den Masern-Impfungen");
    expect(NACHFORDERUNG_HINWEISE.AUFENTHALTSTITEL).toContain("Vorder- und Rückseite");
    expect(NACHFORDERUNG_HINWEISE.AUFENTHALTSTITEL).toContain("Ablaufdatum");
    expect(NACHFORDERUNG_HINWEISE.PKV_NACHWEIS).toContain("keine Beitragsübersicht und nicht den Vertrag");
  });

  it("Arbeitserlaubnis: behauptet nicht, der Aufenthaltstitel genuege (N4)", () => {
    // Die Pflichtregel verlangt beide Arten. Steht die Erlaubnis auf dem Titel,
    // laedt die Person dieselbe Karte zu dieser Position hoch.
    const text = NACHFORDERUNG_HINWEISE.ARBEITSERLAUBNIS;
    expect(text).not.toMatch(/genügt|reicht|nicht nötig|nicht erforderlich|entfällt|müssen .* nicht/i);
    expect(text).toMatch(/laden Sie/);
    expect(text).toContain("dieselbe Karte");
  });

  it("drei der Texte gehoeren zu sensiblen Arten — die Mail darf sie nicht zeigen (E-2)", () => {
    // Haelt die Aussage im Docblock fest: Wer die Liste der Mail baut, muss
    // bei diesen Arten den Hinweis weglassen, nicht nur das Label.
    expect(
      Object.keys(NACHFORDERUNG_HINWEISE).filter((t) => SENSIBLE_DOKUMENTTYPEN.includes(t)).sort(),
    ).toEqual(["ARBEITSERLAUBNIS", "AUFENTHALTSTITEL", "MASERNSCHUTZ"]);
  });
});

describe("pflichtDokumenteAusVorlage (ein Rueckfall fuer alle Server-Leser)", () => {
  it("ohne Vorlage: die beiden Geburtsurkunden — wie der Standard der Spalte", () => {
    expect(pflichtDokumenteAusVorlage(null)).toEqual(["GEBURTSURKUNDE_EIGEN", "GEBURTSURKUNDE_KIND"]);
    expect(pflichtDokumenteAusVorlage(undefined)).toEqual([...PFLICHT_DOKUMENTE_OHNE_VORLAGE]);
  });

  it("mit Vorlage: deren Liste unveraendert — auch eine LEERE bleibt leer (?? statt ||)", () => {
    const liste = ["SV_AUSWEIS", "MASERNSCHUTZ"];
    expect(pflichtDokumenteAusVorlage({ requiredDocuments: liste })).toBe(liste);
    expect(pflichtDokumenteAusVorlage({ requiredDocuments: [] })).toEqual([]);
  });

  it("der Rueckfall ist eine Kopie: ein Aufrufer kann die Konstante nicht veraendern", () => {
    const a = pflichtDokumenteAusVorlage(null) as string[];
    a.push("SONSTIGES");
    expect(pflichtDokumenteAusVorlage(null)).toEqual(["GEBURTSURKUNDE_EIGEN", "GEBURTSURKUNDE_KIND"]);
  });

  it("die drei Server-Leser schreiben den Rueckfall nicht mehr selbst", () => {
    // Stand bis Paket 4: dreimal `?? ["GEBURTSURKUNDE_EIGEN", "GEBURTSURKUNDE_KIND"]`.
    const fs = jest.requireActual<typeof import("fs")>("fs");
    const path = jest.requireActual<typeof import("path")>("path");
    for (const datei of [
      "src/app/api/fragebogen/[token]/route.ts",
      "src/app/api/onboarding/[id]/route.ts",
      "src/lib/unterlagen-onboarding.ts",
    ]) {
      const quelle = fs.readFileSync(path.join(process.cwd(), datei), "utf8");
      expect({ datei, rueckfall: /\?\?\s*\[\s*"GEBURTSURKUNDE_EIGEN"/.test(quelle) }).toEqual({ datei, rueckfall: false });
      expect(quelle).toContain("pflichtDokumenteAusVorlage(");
    }
  });
});
