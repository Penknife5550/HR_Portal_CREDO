/**
 * „Stellenbezeichnung statt Stellenbeschreibung" (Aenderung 1, 09/2026).
 *
 * Die Fuehrungskraft traegt in den Einstellungsmodalitaeten und im
 * Vertragsdaten-Formular der Verlaengerung ein, ALS WAS die Person beschaeftigt
 * wird. Fachlich ist das ein Titel, keine Beschreibung. Entschieden am
 * 21.09.2026: ueberall derselbe Begriff, ein einzeiliges Feld, hoechstens
 * 200 Zeichen. Der technische Name `stellenbeschreibung` bleibt (Spalte,
 * JSON-Export, Word-Platzhalter, Mandanten-Konfiguration).
 *
 * Statt eines Quelltext-Scans nach dem alten Wort (der an den bewusst
 * erklaerenden Kommentaren scheitern wuerde) pruefen die Tests hier das
 * VERHALTEN: was die Schemata melden, was Registry und Katalog anzeigen, was
 * die Mailvorlagen schreiben und was die Startmigration an gespeicherten
 * Mandanten-Labels aendert.
 */

import { FELD_BEZEICHNUNGEN } from "@/lib/formular-fehler";
import {
  STELLENBEZEICHNUNG_MAX_LAENGE,
  alsEinzeiligeStellenbezeichnung,
} from "@/lib/stellenbezeichnung";
import { SUP_STEP_CONFIG, supStep1Schema } from "@/lib/validations/supervisor-data";
import { renewalDataSchema } from "@/lib/validations/contract-end";
import {
  CONTRACT_END_FIELD_REGISTRY,
  ContractEndFieldHelper,
  getDefaultContractEndFieldConfig,
  resolveContractEndFieldConfig,
} from "@/lib/contract-end-fields";
import {
  ONBOARDING_PLACEHOLDERS,
  VERTRAGSVERLAENGERUNG_PLACEHOLDERS,
} from "@/lib/placeholder-catalog";
import { DEFAULT_EMAIL_TEMPLATES } from "@/lib/default-email-templates";

// seed-check.js ist reines JS (im Container gibt es kein tsx). Dank des
// `require.main === module`-Guards startet beim Laden kein Entrypoint.
const seedCheck = require("../../../prisma/seed-check.js");

const BEGRIFF = "Stellenbezeichnung";

// =============================================
// Die Einzeilen-Umwandlung
// =============================================
describe("alsEinzeiligeStellenbezeichnung", () => {
  it("macht aus Zeilenumbruechen „, “", () => {
    expect(alsEinzeiligeStellenbezeichnung("Lehrkraft\nMathematik")).toBe(
      "Lehrkraft, Mathematik",
    );
    // Windows- und alte Mac-Umbrueche ebenso.
    expect(alsEinzeiligeStellenbezeichnung("Lehrkraft\r\nMathematik\rPhysik")).toBe(
      "Lehrkraft, Mathematik, Physik",
    );
  });

  it("laesst Leerzeilen und Leerraum am Umbruch nicht als „, , “ stehen", () => {
    expect(alsEinzeiligeStellenbezeichnung("Lehrkraft \n\n  Mathematik\n")).toBe(
      "Lehrkraft, Mathematik",
    );
  });

  it("laesst einen einzeiligen Wert unveraendert", () => {
    expect(alsEinzeiligeStellenbezeichnung("Lehrkraft für Mathematik")).toBe(
      "Lehrkraft für Mathematik",
    );
    // Auch Leerraum am Rand bleibt — die Funktion repariert nur, was das
    // Eingabefeld zerstoeren wuerde.
    expect(alsEinzeiligeStellenbezeichnung(" Lehrkraft ")).toBe(" Lehrkraft ");
  });

  it("kuerzt NICHT — ein zu langer Bestandswert bleibt sichtbar zu lang", () => {
    const lang = "x".repeat(250);
    expect(alsEinzeiligeStellenbezeichnung(lang)).toBe(lang);
  });

  it("liefert fuer fehlende Werte einen leeren Text", () => {
    expect(alsEinzeiligeStellenbezeichnung(null)).toBe("");
    expect(alsEinzeiligeStellenbezeichnung(undefined)).toBe("");
    expect(alsEinzeiligeStellenbezeichnung(42)).toBe("");
  });
});

// =============================================
// Einstellungsmodalitaeten (Onboarding)
// =============================================
describe("Einstellungsmodalitaeten — Schritt 1", () => {
  const BASIS = {
    betriebsstaette: "Kingsleyallee 6",
    stellenbeschreibung: "Lehrkraft für Mathematik und Physik",
    vertragsbeginn: "2026-09-01",
    befristet: false,
    befristungsart: "",
    vertragsende: "",
    befristungZweck: "",
    vertragsendeVoraussichtlich: "",
    befristungSachgrund: "",
  };

  function meldungen(wert: unknown): string[] {
    const ergebnis = supStep1Schema.safeParse({ ...BASIS, stellenbeschreibung: wert });
    if (ergebnis.success) return [];
    return ergebnis.error.issues
      .filter((i) => i.path.join(".") === "stellenbeschreibung")
      .map((i) => i.message);
  }

  it("meldet ein leeres Feld mit dem neuen Begriff am richtigen Pfad", () => {
    expect(meldungen("")).toEqual(["Stellenbezeichnung ist erforderlich."]);
  });

  it("nimmt genau 200 Zeichen und weist 201 ab", () => {
    expect(STELLENBEZEICHNUNG_MAX_LAENGE).toBe(200);
    expect(meldungen("x".repeat(200))).toEqual([]);
    expect(meldungen("x".repeat(201))).toEqual(["Bitte maximal 200 Zeichen."]);
  });

  it("zeigt im Kartenkopf den neuen Begriff und die Betriebsstätte mit Umlaut", () => {
    expect(SUP_STEP_CONFIG[0].description).toBe(
      "Betriebsstätte, Stellenbezeichnung, Vertragsdaten",
    );
    // Die Schritttitel bleiben — die Komponententests haengen daran.
    expect(SUP_STEP_CONFIG[0].title).toBe("Stelle & Vertrag");
    expect(SUP_STEP_CONFIG[3].title).toBe("Zusätzliche Angaben");
  });
});

// =============================================
// Vertragsverlaengerung (Vertragsende, Strang A)
// =============================================
describe("Vertragsdaten-Formular — Registry und Pruefung", () => {
  it("fuehrt das Feld unter dem neuen Begriff, der Feldname bleibt", () => {
    const def = CONTRACT_END_FIELD_REGISTRY.find((d) => d.name === "stellenbeschreibung");
    expect(def?.label).toBe(BEGRIFF);
    expect(def?.label).toBe(FELD_BEZEICHNUNGEN.stellenbeschreibung);
  });

  it("zeigt ohne gespeicherte Konfiguration den neuen Begriff", () => {
    const standard = getDefaultContractEndFieldConfig().find(
      (f) => f.name === "stellenbeschreibung",
    );
    expect(standard?.label).toBe(BEGRIFF);
    expect(
      resolveContractEndFieldConfig(null).find((f) => f.name === "stellenbeschreibung")?.label,
    ).toBe(BEGRIFF);
    // missingRequired() im Formular meldet genau dieses Label als Pflichtfeld.
    expect(new ContractEndFieldHelper(null).getLabel("stellenbeschreibung")).toBe(BEGRIFF);
  });

  it("laesst ein eigenes Mandanten-Label samt Sichtbarkeit und Pflicht stehen", () => {
    const feld = resolveContractEndFieldConfig([
      { name: "stellenbeschreibung", label: "Tätigkeit", visible: false, required: true },
    ]).find((f) => f.name === "stellenbeschreibung");
    expect(feld).toEqual({
      name: "stellenbeschreibung",
      label: "Tätigkeit",
      visible: false,
      required: true,
    });
  });

  it("liest ein gespeichertes Alt-Label unveraendert — deshalb die Startmigration", () => {
    // Bewusst KEINE Lese-Regel: Sie machte „Stellenbeschreibung" als bewusst
    // gewaehltes Label unmoeglich und bliebe als Dauer-Sondercode stehen.
    // Den gespeicherten alten Standard ersetzt einmalig seed-check.js.
    const feld = resolveContractEndFieldConfig([
      { name: "stellenbeschreibung", label: "Stellenbeschreibung", visible: true, required: false },
    ]).find((f) => f.name === "stellenbeschreibung");
    expect(feld?.label).toBe("Stellenbeschreibung");
  });

  it("nimmt serverseitig genau 200 Zeichen und weist 201 deutsch mit Feldnamen ab", () => {
    expect(renewalDataSchema.safeParse({ stellenbeschreibung: "x".repeat(200) }).success).toBe(
      true,
    );
    const zuLang = renewalDataSchema.safeParse({ stellenbeschreibung: "x".repeat(201) });
    expect(zuLang.success).toBe(false);
    if (zuLang.success) return;
    // Die Route zeigt nur errors[0].message — ohne Feldnamen stuende dort
    // ein Satz ohne Bezug.
    expect(zuLang.error.errors[0].message).toBe(
      "Stellenbezeichnung: Bitte maximal 200 Zeichen.",
    );
  });
});

// =============================================
// Brief-Vorlagen: Katalog
// =============================================
describe("Variablenkatalog der Brief-Vorlagen", () => {
  it.each([
    ["ONBOARDING", ONBOARDING_PLACEHOLDERS],
    ["VERTRAGSVERLAENGERUNG", VERTRAGSVERLAENGERUNG_PLACEHOLDERS],
  ])("%s: Schluessel {stellenbeschreibung} bleibt, Beschriftung ist neu", (_modul, katalog) => {
    const eintraege = katalog.filter((p) => p.key === "stellenbeschreibung");
    // Genau EIN Eintrag, kein Alias {stellenbezeichnung} (Entscheidung 21.09.).
    expect(eintraege).toHaveLength(1);
    expect(eintraege[0].label).toBe(BEGRIFF);
    expect(katalog.some((p) => p.key === "stellenbezeichnung")).toBe(false);
    // Nicht sensibel — die Versandbestaetigung bleibt davon unberuehrt.
    expect(eintraege[0].sensitive).toBeFalsy();
  });
});

// =============================================
// Mailvorlagen (Code-Defaults)
// =============================================
describe("Mailvorlagen an die Fuehrungskraft", () => {
  function vorlage(event: string) {
    const t = DEFAULT_EMAIL_TEMPLATES.find((v) => v.event === event);
    if (!t) throw new Error(`Vorlage ${event} fehlt`);
    return t;
  }

  it.each(["supervisor-link-created", "contract-end-supervisor-link"])(
    "%s nennt die Stellenbezeichnung, nicht mehr die Stellenbeschreibung",
    (event) => {
      const t = vorlage(event);
      for (const teil of [t.subject, t.bodyHtml, t.bodyText]) {
        expect(teil).not.toContain("Stellenbeschreibung");
      }
      expect(t.bodyHtml).toContain(BEGRIFF);
      expect(t.bodyText).toContain(BEGRIFF);
    },
  );

  it("supervisor-link-created behaelt den Hinweis auf den Arbeitsvertrag", () => {
    const t = vorlage("supervisor-link-created");
    expect(t.bodyHtml).toContain("› Stellenbezeichnung (wird in den Arbeitsvertrag übernommen)");
    expect(t.bodyText).toContain("- Stellenbezeichnung (wird in den Arbeitsvertrag übernommen)");
  });

  it("contract-end-supervisor-link setzt die Verlaengerung nicht mehr voraus", () => {
    // Die Fuehrungskraft entscheidet selbst (Ja/Nein). Der alte Satz
    // „Da der/die Mitarbeiter:in weiterbeschäftigt werden soll …" nahm das
    // Ergebnis vorweg.
    const t = vorlage("contract-end-supervisor-link");
    for (const teil of [t.subject, t.bodyHtml, t.bodyText]) {
      expect(teil).not.toContain("weiterbeschäftigt werden soll, bitten wir");
      expect(teil).not.toContain("bitte Vertragsdaten erfassen");
    }
    for (const teil of [t.bodyHtml, t.bodyText]) {
      expect(teil).toContain("Bitte entscheiden Sie über die Weiterbeschäftigung");
      expect(teil).toContain("Bei „Nein“ genügt eine kurze Begründung.");
    }
    expect(t.subject).toContain("Ihre Entscheidung erbeten");
    // Der Link bleibt dieselbe Variable wie bisher.
    expect(t.bodyHtml).toContain("{{link}}");
    expect(t.bodyText).toContain("{{link}}");
  });
});

// =============================================
// Startmigration: gespeicherte Mandanten-Labels
// =============================================
type Eintrag = Record<string, unknown>;
type Org = {
  id: string;
  mandantNumber: string;
  name: string;
  contractEndFieldConfig: unknown;
};
type Plan = {
  zuSchreiben: { id: string; mandantNumber: string; name: string; contractEndFieldConfig: Eintrag[] }[];
  eigeneLabels: { id: string; mandantNumber: string; name: string; label: string }[];
};
const plane: (orgs: Org[]) => Plan = seedCheck.planeStellenbezeichnungLabels;

function org(konfig: unknown, nummer = "712"): Org {
  return { id: "org-" + nummer, mandantNumber: nummer, name: "Mandant " + nummer, contractEndFieldConfig: konfig };
}

/** So speichert die Konfigurationsmaske: IMMER alle Felder mit Label. */
function gespeicherteMaske(label: string): Eintrag[] {
  return getDefaultContractEndFieldConfig().map((f) =>
    f.name === "stellenbeschreibung" ? { ...f, label } : { ...f },
  );
}

describe("planeStellenbezeichnungLabels (prisma/seed-check.js)", () => {
  it("haelt Merker und neuen Begriff mit dem TypeScript-Stand zusammen", () => {
    expect(seedCheck.STELLENBEZEICHNUNG_LABEL_MARKER).toBe(
      "VERTRAGSENDE_LABEL_STELLENBEZEICHNUNG_V1",
    );
    expect(seedCheck.STELLENBEZEICHNUNG_ALTES_LABEL).toBe("Stellenbeschreibung");
    // Die JS-Konstante ist ein Duplikat (kein tsx im Container) — laeuft sie
    // der zentralen Quelle davon, schriebe die Migration einen dritten Begriff.
    expect(seedCheck.STELLENBEZEICHNUNG_NEUES_LABEL).toBe(FELD_BEZEICHNUNGEN.stellenbeschreibung);
  });

  it("ersetzt den gespeicherten alten Standard und laesst alles andere unveraendert", () => {
    const vorher = gespeicherteMaske("Stellenbeschreibung");
    const { zuSchreiben, eigeneLabels } = plane([org(vorher)]);

    expect(eigeneLabels).toHaveLength(0);
    expect(zuSchreiben).toHaveLength(1);
    const nachher = zuSchreiben[0].contractEndFieldConfig;
    // Gleiche Laenge, gleiche Reihenfolge, nur das eine Label anders.
    expect(nachher).toHaveLength(vorher.length);
    nachher.forEach((eintrag, i) => {
      if (eintrag.name === "stellenbeschreibung") {
        expect(eintrag).toEqual({ ...vorher[i], label: "Stellenbezeichnung" });
      } else {
        expect(eintrag).toEqual(vorher[i]);
      }
    });
  });

  it("erkennt den alten Standard auch mit Leerraum am Rand", () => {
    const { zuSchreiben } = plane([
      org([{ name: "stellenbeschreibung", label: "  Stellenbeschreibung ", visible: true, required: true }]),
    ]);
    expect(zuSchreiben[0].contractEndFieldConfig).toEqual([
      { name: "stellenbeschreibung", label: "Stellenbezeichnung", visible: true, required: true },
    ]);
  });

  it("laesst ein eigenes Label stehen und meldet es", () => {
    const { zuSchreiben, eigeneLabels } = plane([org(gespeicherteMaske("Tätigkeit"), "742")]);
    expect(zuSchreiben).toHaveLength(0);
    expect(eigeneLabels).toEqual([
      { id: "org-742", mandantNumber: "742", name: "Mandant 742", label: "Tätigkeit" },
    ]);
  });

  it("ersetzt nur exakt den alten Standard, keine aehnlichen Schreibweisen", () => {
    // Die Regel ist bewusst eng: Alles ausser dem Standard gilt als gewollt.
    const { zuSchreiben, eigeneLabels } = plane([
      org([{ name: "stellenbeschreibung", label: "stellenbeschreibung", visible: true, required: false }]),
    ]);
    expect(zuSchreiben).toHaveLength(0);
    expect(eigeneLabels.map((e) => e.label)).toEqual(["stellenbeschreibung"]);
  });

  it("fasst das gleichlautende Label eines ANDEREN Feldes nicht an", () => {
    const konfig = [{ name: "zusatzvereinbarungen", label: "Stellenbeschreibung", visible: true, required: false }];
    const { zuSchreiben, eigeneLabels } = plane([org(konfig)]);
    expect(zuSchreiben).toHaveLength(0);
    expect(eigeneLabels).toHaveLength(0);
  });

  it("schreibt nichts, wenn schon der neue Begriff, ein leeres Label oder gar keines gespeichert ist", () => {
    const { zuSchreiben, eigeneLabels } = plane([
      org(gespeicherteMaske("Stellenbezeichnung"), "712"),
      org([{ name: "stellenbeschreibung", label: "", visible: true, required: false }], "719"),
      org([{ name: "stellenbeschreibung", visible: true, required: false }], "721"),
    ]);
    expect(zuSchreiben).toHaveLength(0);
    expect(eigeneLabels).toHaveLength(0);
  });

  it("uebergeht Mandanten ohne (gueltige) gespeicherte Konfiguration", () => {
    const { zuSchreiben, eigeneLabels } = plane([
      org(null, "712"),
      org({ name: "stellenbeschreibung", label: "Stellenbeschreibung" }, "719"),
      org([null, "kaputt", 42], "721"),
    ]);
    expect(zuSchreiben).toHaveLength(0);
    expect(eigeneLabels).toHaveLength(0);
  });

  it("veraendert die Eingabe nicht (geschrieben wird eine Kopie)", () => {
    const vorher = gespeicherteMaske("Stellenbeschreibung");
    const kopie = JSON.parse(JSON.stringify(vorher));
    plane([org(vorher)]);
    expect(vorher).toEqual(kopie);
  });

  it("plant je Mandant getrennt", () => {
    const { zuSchreiben, eigeneLabels } = plane([
      org(gespeicherteMaske("Stellenbeschreibung"), "712"),
      org(gespeicherteMaske("Tätigkeit"), "719"),
      org(null, "721"),
      org(gespeicherteMaske("Stellenbeschreibung"), "737"),
    ]);
    expect(zuSchreiben.map((e) => e.mandantNumber)).toEqual(["712", "737"]);
    expect(eigeneLabels.map((e) => e.mandantNumber)).toEqual(["719"]);
  });

  it("ergibt nach der Migration beim Lesen den neuen Begriff", () => {
    // Das eigentliche Ziel: Formular und Maske zeigen danach „Stellenbezeichnung".
    const { zuSchreiben } = plane([org(gespeicherteMaske("Stellenbeschreibung"))]);
    const gelesen = resolveContractEndFieldConfig(zuSchreiben[0].contractEndFieldConfig);
    expect(gelesen.find((f) => f.name === "stellenbeschreibung")?.label).toBe(BEGRIFF);
  });
});
