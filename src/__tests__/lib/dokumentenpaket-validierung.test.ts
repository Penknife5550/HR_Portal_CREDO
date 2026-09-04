/**
 * Tests: Zod-Schemas des Dokumentenpaket-Versands
 * (src/lib/validations/dokumentenpaket.ts)
 *
 * Ohne Datenbank und ohne Server-Bezug — geprueft wird die Form der Anfrage.
 * Die Bestaetigungspflicht fuer sensible Vorlagen gehoert NICHT hierher: Sie
 * haengt am Platzhalter-Katalog und wird von der Versandroute mit 409
 * beantwortet (Baustein 5/7).
 */

import {
  PAKET_MODULE,
  MAX_POSITIONEN_VERSAND,
  MAX_POSITIONEN_KONFIG,
  paketPositionSchema,
  setPaketAuswahlSchema,
  pruefePaketSchema,
  versendePaketSchema,
} from "@/lib/validations/dokumentenpaket";

const UUID_A = "11111111-1111-4111-8111-111111111111";
const UUID_B = "22222222-2222-4222-8222-222222222222";

function position(art: "PDF" | "VORLAGE", id: string) {
  return { art, id };
}

describe("Module", () => {
  it("laesst die vier Vorgangsmodule zu", () => {
    for (const modul of ["ONBOARDING", "OFFBOARDING", "VERBEAMTUNG", "VERTRAGSVERLAENGERUNG"]) {
      const r = versendePaketSchema.safeParse({
        modul,
        refId: UUID_A,
        positionen: [position("PDF", UUID_B)],
        empfaenger: "max@example.org",
      });
      expect(r.success).toBe(true);
    }
  });

  it("schliesst BEM aus — die versiegelte Akte hat einen eigenen Weg", () => {
    expect(PAKET_MODULE).not.toContain("BEM");
    const r = versendePaketSchema.safeParse({
      modul: "BEM",
      refId: UUID_A,
      positionen: [position("PDF", UUID_B)],
      empfaenger: "max@example.org",
    });
    expect(r.success).toBe(false);
  });

  it("weist unbekannte Module zurueck", () => {
    const r = pruefePaketSchema.safeParse({
      modul: "PHANTASIE",
      refId: UUID_A,
      positionen: [position("PDF", UUID_B)],
    });
    expect(r.success).toBe(false);
  });
});

describe("Position", () => {
  it("kennt genau zwei Arten", () => {
    expect(paketPositionSchema.safeParse(position("PDF", UUID_A)).success).toBe(true);
    expect(paketPositionSchema.safeParse(position("VORLAGE", UUID_A)).success).toBe(true);
    expect(paketPositionSchema.safeParse({ art: "WORD", id: UUID_A }).success).toBe(false);
  });

  it("verlangt eine UUID", () => {
    expect(paketPositionSchema.safeParse({ art: "PDF", id: "42" }).success).toBe(false);
  });

  it("nimmt die Bestaetigung nur als Wahrheitswert entgegen", () => {
    expect(
      paketPositionSchema.safeParse({ art: "VORLAGE", id: UUID_A, bestaetigt: true }).success,
    ).toBe(true);
    expect(
      paketPositionSchema.safeParse({ art: "VORLAGE", id: UUID_A, bestaetigt: "ja" }).success,
    ).toBe(false);
  });
});

describe("Doppelte Positionen", () => {
  it("weist dieselbe Quelle zweimal zurueck", () => {
    const r = versendePaketSchema.safeParse({
      modul: "ONBOARDING",
      refId: UUID_A,
      positionen: [position("VORLAGE", UUID_B), position("VORLAGE", UUID_B)],
      empfaenger: "max@example.org",
    });
    expect(r.success).toBe(false);
    expect(r.success === false && r.error.issues[0]?.message).toMatch(/mehrfach/);
  });

  it("unterscheidet dabei die Art", () => {
    const r = versendePaketSchema.safeParse({
      modul: "ONBOARDING",
      refId: UUID_A,
      positionen: [position("PDF", UUID_B), position("VORLAGE", UUID_B)],
      empfaenger: "max@example.org",
    });
    expect(r.success).toBe(true);
  });

  it("gilt auch fuer die Konfiguration des Standardpakets", () => {
    const r = setPaketAuswahlSchema.safeParse({
      modul: "ONBOARDING",
      positionen: [position("PDF", UUID_A), position("PDF", UUID_A)],
    });
    expect(r.success).toBe(false);
  });
});

describe("Versand", () => {
  it("verlangt mindestens eine Position", () => {
    const r = versendePaketSchema.safeParse({
      modul: "ONBOARDING",
      refId: UUID_A,
      positionen: [],
      empfaenger: "max@example.org",
    });
    expect(r.success).toBe(false);
  });

  it("begrenzt die Zahl der Anhaenge", () => {
    const zuViele = Array.from({ length: MAX_POSITIONEN_VERSAND + 1 }, (_, i) =>
      position("PDF", "11111111-1111-4111-8111-" + String(i).padStart(12, "0")),
    );
    const r = versendePaketSchema.safeParse({
      modul: "ONBOARDING",
      refId: UUID_A,
      positionen: zuViele,
      empfaenger: "max@example.org",
    });
    expect(r.success).toBe(false);
  });

  it("verlangt eine gueltige Empfaengeradresse", () => {
    for (const empfaenger of ["", "kein-at-zeichen", "a@b"]) {
      const r = versendePaketSchema.safeParse({
        modul: "ONBOARDING",
        refId: UUID_A,
        positionen: [position("PDF", UUID_B)],
        empfaenger,
      });
      expect(r.success).toBe(false);
    }
  });

  it("nimmt eine optionale Nachricht und begrenzt ihre Laenge", () => {
    const basis = {
      modul: "ONBOARDING",
      refId: UUID_A,
      positionen: [position("PDF", UUID_B)],
      empfaenger: "max@example.org",
    };
    expect(versendePaketSchema.safeParse({ ...basis, nachricht: "Willkommen!" }).success).toBe(true);
    expect(versendePaketSchema.safeParse({ ...basis }).success).toBe(true);
    expect(
      versendePaketSchema.safeParse({ ...basis, nachricht: "x".repeat(2001) }).success,
    ).toBe(false);
  });
});

describe("Vorpruefung", () => {
  it("kommt ohne Empfaenger aus — sie laeuft auch vor dem Aendern der Adresse", () => {
    const r = pruefePaketSchema.safeParse({
      modul: "ONBOARDING",
      refId: UUID_A,
      positionen: [position("VORLAGE", UUID_B)],
    });
    expect(r.success).toBe(true);
  });
});

describe("Standardpaket", () => {
  it("faellt ohne Modul auf Onboarding zurueck", () => {
    const r = setPaketAuswahlSchema.safeParse({ positionen: [] });
    expect(r.success).toBe(true);
    expect(r.success && r.data.modul).toBe("ONBOARDING");
  });

  it("erlaubt ein leeres Paket — ein Mandant darf nichts markiert haben", () => {
    expect(setPaketAuswahlSchema.safeParse({ modul: "ONBOARDING", positionen: [] }).success).toBe(
      true,
    );
  });

  it("ignoriert die Bestaetigung, die nur beim Versand zaehlt", () => {
    const r = setPaketAuswahlSchema.safeParse({
      modul: "ONBOARDING",
      positionen: [{ art: "VORLAGE", id: UUID_A, bestaetigt: true }],
    });
    expect(r.success).toBe(true);
    expect(r.success && r.data.positionen[0]).toEqual({ art: "VORLAGE", id: UUID_A });
  });

  it("laesst mehr Positionen zu als ein einzelner Versand", () => {
    expect(MAX_POSITIONEN_KONFIG).toBeGreaterThan(MAX_POSITIONEN_VERSAND);
  });
});
