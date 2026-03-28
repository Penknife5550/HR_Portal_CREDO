/**
 * Tests fuer offboarding helpers
 * src/app/(portal)/dashboard/offboarding/[id]/helpers.ts
 */

import {
  formatDate,
  formatCurrency,
  formatBoolean,
  STATUS_TRANSITIONS,
  CHECKLIST_PHASE_LABELS,
} from "@/app/(portal)/dashboard/offboarding/[id]/helpers";

describe("Offboarding Helper-Funktionen", () => {
  describe("formatDate", () => {
    it("sollte ein gueltiges Datum im Format DD.MM.YYYY zurueckgeben", () => {
      const result = formatDate("2025-06-15T00:00:00.000Z");
      expect(result).toBe("15.06.2025");
    });

    it("sollte bei null den Fallback-Strich zurueckgeben", () => {
      expect(formatDate(null)).toBe("\u2014");
    });

    it("sollte bei leerem String den Fallback-Strich zurueckgeben", () => {
      expect(formatDate("")).toBe("\u2014");
    });
  });

  describe("formatCurrency", () => {
    it("sollte eine Zahl als Euro-Betrag formatieren", () => {
      const result = formatCurrency(1234.56);
      // de-DE Format: 1.234,56 €
      expect(result).toContain("1.234,56");
      expect(result).toContain("€");
    });

    it("sollte einen String-Wert als Zahl parsen", () => {
      const result = formatCurrency("999.99");
      expect(result).toContain("999,99");
      expect(result).toContain("€");
    });

    it("sollte bei null den Fallback-Strich zurueckgeben", () => {
      expect(formatCurrency(null)).toBe("\u2014");
    });

    it("sollte bei ungueltigem String den Fallback-Strich zurueckgeben", () => {
      expect(formatCurrency("kein-betrag")).toBe("\u2014");
    });

    it("sollte 0 korrekt formatieren", () => {
      const result = formatCurrency(0);
      expect(result).toContain("0,00");
      expect(result).toContain("€");
    });
  });

  describe("formatBoolean", () => {
    it("sollte true als 'Ja' zurueckgeben", () => {
      expect(formatBoolean(true)).toBe("Ja");
    });

    it("sollte false als 'Nein' zurueckgeben", () => {
      expect(formatBoolean(false)).toBe("Nein");
    });

    it("sollte bei null den Fallback-Strich zurueckgeben", () => {
      expect(formatBoolean(null)).toBe("\u2014");
    });

    it("sollte bei undefined den Fallback-Strich zurueckgeben", () => {
      expect(formatBoolean(undefined)).toBe("\u2014");
    });
  });

  describe("STATUS_TRANSITIONS", () => {
    it("sollte alle erwarteten Status enthalten", () => {
      const expectedStatuses = [
        "INITIATED",
        "NOTICE_PERIOD",
        "HANDOVER_PHASE",
        "FINAL_SETTLEMENT",
        "COMPLETED",
        "CANCELLED",
      ];
      expect(Object.keys(STATUS_TRANSITIONS).sort()).toEqual(
        expectedStatuses.sort()
      );
    });

    it("sollte fuer INITIATED gueltige Uebergaenge definieren", () => {
      expect(STATUS_TRANSITIONS.INITIATED).toContain("NOTICE_PERIOD");
      expect(STATUS_TRANSITIONS.INITIATED).toContain("CANCELLED");
    });

    it("sollte fuer COMPLETED keine weiteren Uebergaenge haben", () => {
      expect(STATUS_TRANSITIONS.COMPLETED).toHaveLength(0);
    });

    it("sollte fuer CANCELLED keine weiteren Uebergaenge haben", () => {
      expect(STATUS_TRANSITIONS.CANCELLED).toHaveLength(0);
    });

    it("sollte nur auf bekannte Status verweisen", () => {
      const allStatuses = Object.keys(STATUS_TRANSITIONS);
      for (const [, targets] of Object.entries(STATUS_TRANSITIONS)) {
        for (const target of targets) {
          expect(allStatuses).toContain(target);
        }
      }
    });
  });

  describe("CHECKLIST_PHASE_LABELS", () => {
    it("sollte 6 Phasen enthalten", () => {
      expect(Object.keys(CHECKLIST_PHASE_LABELS)).toHaveLength(6);
    });
  });
});
