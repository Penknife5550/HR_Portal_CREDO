/**
 * Tests fuer BEM E3 — Checklisten-Vorlage + Validierungs-Schemas.
 * Reine Logik, keine DB.
 */

import { getBemCheckliste } from "@/lib/bem-checkliste-template";
import {
  createGespraechSchema,
  updateGespraechSchema,
  createMassnahmeSchema,
  updateMassnahmeSchema,
} from "@/lib/validations/bem";

describe("bem-checkliste-template", () => {
  it("liefert pro Gespraechstyp eine nicht-leere, unerledigte Checkliste", () => {
    for (const typ of [
      "ERSTGESPRAECH",
      "FOLGEGESPRAECH",
      "GEDAECHTNISPROTOKOLL",
    ] as const) {
      const ck = getBemCheckliste(typ);
      expect(ck.length).toBeGreaterThan(0);
      expect(ck.every((c) => c.erledigt === false)).toBe(true);
      expect(ck.every((c) => typeof c.titel === "string" && c.titel.length > 0)).toBe(
        true,
      );
    }
  });

  it("liefert unterschiedliche Inhalte je Typ", () => {
    const erst = getBemCheckliste("ERSTGESPRAECH").map((c) => c.titel);
    const folge = getBemCheckliste("FOLGEGESPRAECH").map((c) => c.titel);
    expect(erst).not.toEqual(folge);
  });
});

describe("createGespraechSchema", () => {
  it("akzeptiert ein minimales Gespraech (nur Typ)", () => {
    const r = createGespraechSchema.safeParse({ typ: "ERSTGESPRAECH" });
    expect(r.success).toBe(true);
  });

  it("lehnt unbekannten Typ ab", () => {
    const r = createGespraechSchema.safeParse({ typ: "SMALLTALK" });
    expect(r.success).toBe(false);
  });

  it("akzeptiert Teilnehmer + Checkliste + Datum (YYYY-MM-DD)", () => {
    const r = createGespraechSchema.safeParse({
      typ: "ERSTGESPRAECH",
      datum: "2026-06-08",
      teilnehmer: [{ name: "Elena Bergen", rolle: "BEM-Beauftragte" }],
      checkliste: [{ titel: "Einwilligung liegt vor", erledigt: true }],
      notizen: "Vertraulicher Text",
    });
    expect(r.success).toBe(true);
  });

  it("lehnt Teilnehmer ohne Namen ab", () => {
    const r = createGespraechSchema.safeParse({
      typ: "ERSTGESPRAECH",
      teilnehmer: [{ name: "" }],
    });
    expect(r.success).toBe(false);
  });

  it("updateGespraechSchema akzeptiert leeres Objekt (Teil-Update)", () => {
    expect(updateGespraechSchema.safeParse({}).success).toBe(true);
  });
});

describe("createMassnahmeSchema", () => {
  it("verlangt eine Beschreibung", () => {
    const r = createMassnahmeSchema.safeParse({ kategorie: "TECHNISCH" });
    expect(r.success).toBe(false);
  });

  it("akzeptiert eine gueltige Massnahme", () => {
    const r = createMassnahmeSchema.safeParse({
      kategorie: "ORGANISATORISCH",
      beschreibung: "Stufenweise Wiedereingliederung nach Hamburger Modell",
      zustaendig: "HR",
      frist: "2026-07-01",
    });
    expect(r.success).toBe(true);
  });

  it("lehnt unbekannte Kategorie ab", () => {
    const r = createMassnahmeSchema.safeParse({
      kategorie: "SONSTIGES",
      beschreibung: "x",
    });
    expect(r.success).toBe(false);
  });

  it("updateMassnahmeSchema validiert den Status-Enum", () => {
    expect(
      updateMassnahmeSchema.safeParse({ status: "UMGESETZT" }).success,
    ).toBe(true);
    expect(
      updateMassnahmeSchema.safeParse({ status: "ERLEDIGT" }).success,
    ).toBe(false);
  });
});
