/**
 * Tests: Fristen-Ampel Vertragsende (src/lib/contract-end-fristen.ts)
 * Grenzfaelle der n8n-Staffelung: KRITISCH 1-2 / WARNUNG 3-6 / BEOBACHTEN 7-12.
 */

import {
  getContractEndCategory,
  monthsUntilContractEnd,
} from "@/lib/contract-end-fristen";

describe("Fristen-Ampel Vertragsende", () => {
  const now = new Date("2026-01-01T00:00:00.000Z");
  const inDays = (d: number) => new Date(now.getTime() + d * 86_400_000);

  it("rechnet verbleibende Monate aufgerundet (wie der n8n-Flow)", () => {
    expect(monthsUntilContractEnd(inDays(30), now)).toBe(1);
    expect(monthsUntilContractEnd(inDays(60), now)).toBe(2);
    expect(monthsUntilContractEnd(inDays(-5), now)).toBe(0);
  });

  it("kategorisiert nach der Staffelung 1-2 / 3-6 / 7-12", () => {
    expect(getContractEndCategory(inDays(30), now)).toBe("KRITISCH"); // ~1 Monat
    expect(getContractEndCategory(inDays(60), now)).toBe("KRITISCH"); // ~2 Monate
    expect(getContractEndCategory(inDays(90), now)).toBe("WARNUNG"); // ~3 Monate
    expect(getContractEndCategory(inDays(180), now)).toBe("WARNUNG"); // ~6 Monate
    expect(getContractEndCategory(inDays(210), now)).toBe("BEOBACHTEN"); // ~7 Monate
    expect(getContractEndCategory(inDays(360), now)).toBe("BEOBACHTEN"); // ~12 Monate
  });

  it("liefert AUSSERHALB fuer >12 Monate und bereits abgelaufene Vertraege", () => {
    expect(getContractEndCategory(inDays(400), now)).toBe("AUSSERHALB");
    expect(getContractEndCategory(inDays(-5), now)).toBe("AUSSERHALB");
  });
});
