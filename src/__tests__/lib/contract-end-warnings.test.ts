/**
 * Unit-Tests fuer die rechtlichen HR-Warnungen (Vertragsende):
 *   B1 getSignatureWarning       — Entfristungsfalle §15 Abs.5 TzBfG
 *   B2 getKettenbefristungWarning — Kettenbefristung §14 Abs.2 TzBfG
 */

import {
  getSignatureWarning,
  getKettenbefristungWarning,
} from "@/lib/contract-end-warnings";

const NOW = new Date("2026-06-01T12:00:00Z");
const IN_DAYS = (d: number) => new Date(NOW.getTime() + d * 86400000);

describe("B1: getSignatureWarning (Entfristungsfalle)", () => {
  const base = {
    decision: "UEBERNAHME",
    status: "RUECKMELDUNG_UEBERNAHME",
    contractSignedReturnedAt: null,
    now: NOW,
  };

  it("null, wenn keine Uebernahme entschieden ist", () => {
    expect(
      getSignatureWarning({ ...base, decision: "OFFEN", contractEndDate: IN_DAYS(10) }),
    ).toBeNull();
    expect(
      getSignatureWarning({
        ...base,
        decision: "KEINE_UEBERNAHME",
        contractEndDate: IN_DAYS(10),
      }),
    ).toBeNull();
  });

  it("null, wenn der Status nicht mehr offen ist (z.B. bereits unterschrieben)", () => {
    expect(
      getSignatureWarning({
        ...base,
        status: "VERTRAG_UNTERSCHRIEBEN",
        contractEndDate: IN_DAYS(10),
      }),
    ).toBeNull();
    expect(
      getSignatureWarning({ ...base, status: "ABGESCHLOSSEN", contractEndDate: IN_DAYS(10) }),
    ).toBeNull();
  });

  it("null, wenn der unterschriebene Ruecklauf vorliegt", () => {
    expect(
      getSignatureWarning({
        ...base,
        contractSignedReturnedAt: IN_DAYS(-1),
        contractEndDate: IN_DAYS(10),
      }),
    ).toBeNull();
  });

  it("warnt scharf, wenn das Vertragsende in <= 30 Tagen liegt", () => {
    const w = getSignatureWarning({ ...base, contractEndDate: IN_DAYS(10) });
    expect(w).not.toBeNull();
    expect(w!.warn).toBe(true);
    expect(w!.daysLeft).toBe(10);
    expect(w!.overdue).toBe(false);
  });

  it("liefert die Warnung unscharf (warn=false), wenn noch >30 Tage bleiben", () => {
    const w = getSignatureWarning({ ...base, contractEndDate: IN_DAYS(90) });
    expect(w).not.toBeNull();
    expect(w!.warn).toBe(false);
    expect(w!.daysLeft).toBe(90);
  });

  it("markiert ueberschrittenes Vertragsende als overdue (Weiterarbeit -> unbefristet!)", () => {
    const w = getSignatureWarning({ ...base, contractEndDate: IN_DAYS(-5) });
    expect(w).not.toBeNull();
    expect(w!.warn).toBe(true);
    expect(w!.overdue).toBe(true);
    expect(w!.daysLeft).toBeLessThan(0);
  });

  it("gilt auch im Status VERTRAG_ERSTELLT (Vertrag erzeugt, aber nicht zurueck)", () => {
    const w = getSignatureWarning({
      ...base,
      status: "VERTRAG_ERSTELLT",
      contractEndDate: IN_DAYS(5),
    });
    expect(w).not.toBeNull();
    expect(w!.warn).toBe(true);
  });
});

describe("B2: getKettenbefristungWarning (§14 TzBfG)", () => {
  it("null bei Befristung MIT Sachgrund oder unbekannter Art", () => {
    expect(
      getKettenbefristungWarning({
        befristungsart: "MIT_SACHGRUND",
        bisherigeBefristungMonate: 48,
        bisherigeVerlaengerungen: 5,
      }),
    ).toBeNull();
    expect(
      getKettenbefristungWarning({
        befristungsart: null,
        bisherigeBefristungMonate: 48,
        bisherigeVerlaengerungen: 5,
      }),
    ).toBeNull();
  });

  it("null, solange sachgrundlos unter beiden Grenzen", () => {
    expect(
      getKettenbefristungWarning({
        befristungsart: "SACHGRUNDLOS",
        bisherigeBefristungMonate: 23,
        bisherigeVerlaengerungen: 2,
      }),
    ).toBeNull();
  });

  it("warnt ab 24 Monaten sachgrundloser Befristung", () => {
    const w = getKettenbefristungWarning({
      befristungsart: "SACHGRUNDLOS",
      bisherigeBefristungMonate: 24,
      bisherigeVerlaengerungen: 0,
    });
    expect(w).not.toBeNull();
    expect(w!.warn).toBe(true);
    expect(w!.reason).toContain("24 Monate");
  });

  it("warnt ab der 3. Verlaengerung", () => {
    const w = getKettenbefristungWarning({
      befristungsart: "SACHGRUNDLOS",
      bisherigeBefristungMonate: 12,
      bisherigeVerlaengerungen: 3,
    });
    expect(w).not.toBeNull();
    expect(w!.reason).toContain("3 Verlängerungen");
  });

  it("nennt beide Gruende, wenn beide Grenzen gerissen sind", () => {
    const w = getKettenbefristungWarning({
      befristungsart: "SACHGRUNDLOS",
      bisherigeBefristungMonate: 30,
      bisherigeVerlaengerungen: 4,
    });
    expect(w).not.toBeNull();
    expect(w!.reason).toContain("24 Monate");
    expect(w!.reason).toContain("3 Verlängerungen");
  });

  it("behandelt fehlende Historie (null) als 0 — keine Warnung", () => {
    expect(
      getKettenbefristungWarning({
        befristungsart: "SACHGRUNDLOS",
        bisherigeBefristungMonate: null,
        bisherigeVerlaengerungen: null,
      }),
    ).toBeNull();
  });
});
