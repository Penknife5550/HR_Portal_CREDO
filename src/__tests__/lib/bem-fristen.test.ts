/**
 * Tests fuer das BEM-Fristen-System (reine Logik, keine DB).
 */

import {
  berechneSeverity,
  verbleibendeTage,
  berechneBemFristTemplates,
  type BemFristSnapshot,
} from "@/lib/bem-fristen";

const HEUTE = new Date("2026-06-08T12:00:00Z");
function inTagen(n: number): Date {
  const d = new Date(HEUTE);
  d.setDate(d.getDate() + n);
  return d;
}

describe("berechneSeverity", () => {
  it("stuft nach verbleibenden Tagen ein", () => {
    expect(berechneSeverity(inTagen(-1), HEUTE)).toBe("OVERDUE");
    expect(berechneSeverity(inTagen(3), HEUTE)).toBe("URGENT");
    expect(berechneSeverity(inTagen(10), HEUTE)).toBe("WARNING");
    expect(berechneSeverity(inTagen(30), HEUTE)).toBe("INFO");
  });

  it("verbleibendeTage rechnet vorzeichenrichtig", () => {
    expect(verbleibendeTage(inTagen(5), HEUTE)).toBe(5);
    expect(verbleibendeTage(inTagen(-3), HEUTE)).toBe(-3);
  });
});

function snapshot(over: Partial<BemFristSnapshot>): BemFristSnapshot {
  return {
    status: "ANGELEGT",
    createdAt: HEUTE,
    anlassFehlzeitenAb: null,
    einladungAm: null,
    datenschutzAm: null,
    erstgespraechAm: null,
    aufbewahrungBis: null,
    gespraeche: [],
    massnahmen: [],
    ...over,
  };
}

describe("berechneBemFristTemplates", () => {
  it("ANGELEGT -> Einladungs-Frist", () => {
    const t = berechneBemFristTemplates(snapshot({ status: "ANGELEGT" }));
    expect(t.map((x) => x.typ)).toContain("EINLADUNG");
  });

  it("EINLADUNG_VERSENDET -> Einwilligungs-Frist", () => {
    const t = berechneBemFristTemplates(
      snapshot({ status: "EINLADUNG_VERSENDET", einladungAm: HEUTE }),
    );
    expect(t.map((x) => x.typ)).toContain("EINWILLIGUNG");
    expect(t.map((x) => x.typ)).not.toContain("EINLADUNG");
  });

  it("EINWILLIGUNG_ERTEILT -> Erstgespraech-Frist", () => {
    const t = berechneBemFristTemplates(
      snapshot({ status: "EINWILLIGUNG_ERTEILT", datenschutzAm: HEUTE }),
    );
    expect(t.map((x) => x.typ)).toContain("ERSTGESPRAECH");
  });

  it("MASSNAHMEN_LAUFEN -> Evaluation aus offener Massnahme", () => {
    const t = berechneBemFristTemplates(
      snapshot({
        status: "MASSNAHMEN_LAUFEN",
        massnahmen: [{ status: "LAEUFT", evaluationAm: inTagen(20) }],
      }),
    );
    expect(t.map((x) => x.typ)).toContain("EVALUATION");
  });

  it("Aufbewahrungsende-Frist sobald aufbewahrungBis gesetzt", () => {
    const t = berechneBemFristTemplates(
      snapshot({ status: "ABGESCHLOSSEN", aufbewahrungBis: inTagen(365) }),
    );
    expect(t.map((x) => x.typ)).toContain("AUFBEWAHRUNGSENDE");
  });

  it("GELOESCHT erzeugt keine Aufbewahrungs-Frist", () => {
    const t = berechneBemFristTemplates(
      snapshot({ status: "GELOESCHT", aufbewahrungBis: inTagen(-1) }),
    );
    expect(t).toHaveLength(0);
  });
});
