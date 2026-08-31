/**
 * Tests: der Arbeitgeberteil des RV-Antrags
 * (/api/onboarding/[id]/rv-fristen — GET + PATCH)
 *
 * Schwerpunkt sind die beiden Stellen, an denen die Route eigene Verantwortung
 * traegt: die **Umrechnung gespeicherter Werte in Kalendertage** — dort kam der
 * Zeitzonenfehler durch die Hintertuer zurueck — und die **Protokollierung**,
 * weil diese Daten die Beitragspflicht verschieben und nach § 8 Abs. 2 Nr. 4a
 * BVV in die Entgeltunterlagen gehen.
 */

const mockPrisma = {
  onboardingProcess: { findUnique: jest.fn() },
  personalData: { update: jest.fn() },
  auditLog: { create: jest.fn() },
};
const mockGetSession = jest.fn();

jest.mock("@/lib/db", () => ({ prisma: mockPrisma }));
jest.mock("@/lib/auth", () => ({ getSession: mockGetSession }));

import { GET, PATCH } from "@/app/api/onboarding/[id]/rv-fristen/route";
import { NextRequest } from "next/server";

const ID = "11111111-1111-1111-1111-111111111111";

function ctx() {
  return { params: Promise.resolve({ id: ID }) };
}

function getReq(): NextRequest {
  return new NextRequest(`http://localhost:3000/api/onboarding/${ID}/rv-fristen`);
}

function patchReq(body: unknown): NextRequest {
  return new NextRequest(`http://localhost:3000/api/onboarding/${ID}/rv-fristen`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Ein `@db.Date`-Wert, so wie Prisma ihn liefert: UTC-Mitternacht. */
function datumsSpalte(tag: string): Date {
  return new Date(`${tag}T00:00:00.000Z`);
}

function vorgang(
  overrides: { personalData?: Record<string, unknown> } & Record<string, unknown> = {}
) {
  // personalData bewusst herausgeloest: Ein nachgestelltes `...overrides` wuerde
  // den zusammengefuehrten Teilbaum wieder komplett ersetzen — und damit
  // stillschweigend die Entscheidung entfernen, um die es hier geht.
  const { personalData, ...rest } = overrides;
  return {
    id: ID,
    organization: {
      id: "org1",
      name: "Berufskolleg Minden",
      betriebsnummer: "12345678" as string | null,
      entgeltabrechnungTag: 25 as number | null,
    },
    supervisorData: { vertragsbeginn: datumsSpalte("2026-01-01") },
    ...rest,
    personalData: {
      rvEntscheidung: "BEFREIUNG_BEANTRAGT",
      rvEntscheidungAm: new Date("2026-08-05T09:00:00.000Z"),
      rvAntragEingangAm: null as Date | null,
      rvWirkungAb: null as Date | null,
      rvMeldungAm: null as Date | null,
      rvBearbeitetAm: null as Date | null,
      rvBearbeitetVonId: null as string | null,
      ...personalData,
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetSession.mockResolvedValue({ userId: "u1", role: "HR_SACHBEARBEITER" });
  mockPrisma.personalData.update.mockResolvedValue({});
  mockPrisma.auditLog.create.mockResolvedValue({});
});

describe("Zugang", () => {
  it("weist ohne Sitzung ab", async () => {
    mockGetSession.mockResolvedValue(null);
    expect((await GET(getReq(), ctx())).status).toBe(401);
    expect((await PATCH(patchReq({}), ctx())).status).toBe(401);
  });

  it("lässt eine reine Leserolle lesen, aber nicht schreiben", async () => {
    // EINRICHTUNGSLEITUNG steht in PORTAL_ROLES, aber nicht in HR_EDIT_ROLES.
    // (Die Route führte hier früher "VIEWER" — eine Rolle, die es im Schema
    // gar nicht gibt.)
    mockGetSession.mockResolvedValue({ userId: "u2", role: "EINRICHTUNGSLEITUNG" });
    mockPrisma.onboardingProcess.findUnique.mockResolvedValue(vorgang());
    expect((await GET(getReq(), ctx())).status).toBe(200);
    expect(
      (await PATCH(patchReq({ antragEingangAm: "2026-08-10" }), ctx())).status
    ).toBe(403);
  });

  it("meldet einen unbekannten Vorgang", async () => {
    mockPrisma.onboardingProcess.findUnique.mockResolvedValue(null);
    expect((await GET(getReq(), ctx())).status).toBe(404);
  });
});

describe("Vorschläge", () => {
  it("berechnet Wirkung und Meldefrist aus dem Eingangsdatum", async () => {
    mockPrisma.onboardingProcess.findUnique.mockResolvedValue(
      vorgang({ personalData: { rvAntragEingangAm: datumsSpalte("2026-08-05") } })
    );
    const j = await (await GET(getReq(), ctx())).json();

    expect(j.data.vorschlag.wirkungAb.datum).toBe("2026-08-01");
    // Abrechnungstag 25 liegt vor der Sechs-Wochen-Grenze (16.09.).
    expect(j.data.vorschlag.meldefrist.datum).toBe("2026-08-25");
    expect(j.data.vorschlag.meldefrist.quelle).toBe("ENTGELTABRECHNUNG");
    expect(j.data.vorschlag.meldefrist.unvollstaendig).toBe(false);
  });

  it("weist die Meldefrist als unvollständig aus, wenn der Abrechnungstag fehlt", async () => {
    const v = vorgang({
      personalData: { rvAntragEingangAm: datumsSpalte("2026-08-05") },
    });
    v.organization.entgeltabrechnungTag = null;
    mockPrisma.onboardingProcess.findUnique.mockResolvedValue(v);
    const j = await (await GET(getReq(), ctx())).json();

    expect(j.data.vorschlag.meldefrist.quelle).toBe("SECHS_WOCHEN");
    expect(j.data.vorschlag.meldefrist.unvollstaendig).toBe(true);
  });

  it("schiebt die Wirkung bei versäumter Meldefrist nach hinten", async () => {
    mockPrisma.onboardingProcess.findUnique.mockResolvedValue(
      vorgang({
        personalData: {
          rvAntragEingangAm: datumsSpalte("2026-03-05"),
          rvMeldungAm: datumsSpalte("2026-04-20"), // nach dem 25.03.
        },
      })
    );
    const j = await (await GET(getReq(), ctx())).json();

    expect(j.data.vorschlag.verspaetet).toBe(true);
    expect(j.data.vorschlag.wirkungAb.datum).toBe("2026-06-01");
  });

  it("liefert für die übrigen Wege keine Fristen", async () => {
    mockPrisma.onboardingProcess.findUnique.mockResolvedValue(
      vorgang({ personalData: { rvEntscheidung: "KEINE_BEFREIUNG" } })
    );
    const j = await (await GET(getReq(), ctx())).json();

    expect(j.data.vorschlag.wirkungAb).toBeNull();
    expect(j.data.vorschlag.meldefrist).toBeNull();
  });
});

describe("Die Systemgrenze zur Zeitzone", () => {
  it("rechnet den Entscheidungs-Zeitstempel über Berlin um", async () => {
    // `rvEntscheidungAm` ist ein echter Zeitstempel, keine date-Spalte. Wird er
    // mit toISOString().slice(0,10) gelesen, liefert er bei einer Absendung am
    // Monatsersten kurz nach Mitternacht den Vormonat — und die Aufhebung
    // wirkte einen vollen Monat zu früh. Genau dieser Fall.
    mockPrisma.onboardingProcess.findUnique.mockResolvedValue(
      vorgang({
        personalData: {
          rvEntscheidung: "AUFHEBUNG_BEANTRAGT",
          // 01.09.2026, 00:30 Uhr Berliner Zeit
          rvEntscheidungAm: new Date("2026-08-31T22:30:00.000Z"),
          rvAntragEingangAm: null, // elektronisch erklärt, kein Papiereingang
        },
      })
    );
    const j = await (await GET(getReq(), ctx())).json();

    expect(j.data.entscheidungAm).toBe("2026-09-01");
    expect(j.data.vorschlag.wirkungAb.datum).toBe("2026-10-01");
  });

  it("liest date-Spalten unverändert", async () => {
    mockPrisma.onboardingProcess.findUnique.mockResolvedValue(
      vorgang({ personalData: { rvAntragEingangAm: datumsSpalte("2026-08-05") } })
    );
    const j = await (await GET(getReq(), ctx())).json();
    expect(j.data.erfasst.antragEingangAm).toBe("2026-08-05");
  });
});

describe("Speichern", () => {
  it("nimmt gültige Datumsangaben entgegen", async () => {
    mockPrisma.onboardingProcess.findUnique.mockResolvedValue(vorgang());
    const res = await PATCH(patchReq({ antragEingangAm: "2026-08-10" }), ctx());

    expect(res.status).toBe(200);
    expect(mockPrisma.personalData.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { onboardingId: ID },
        data: expect.objectContaining({
          rvAntragEingangAm: new Date("2026-08-10T00:00:00Z"),
          rvBearbeitetVonId: "u1",
        }),
      })
    );
  });

  it("löscht ein Datum bei leerem Wert", async () => {
    mockPrisma.onboardingProcess.findUnique.mockResolvedValue(vorgang());
    await PATCH(patchReq({ wirkungAb: "" }), ctx());

    expect(mockPrisma.personalData.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ rvWirkungAb: null }),
      })
    );
  });

  it("weist ungültige Datumsangaben ab", async () => {
    mockPrisma.onboardingProcess.findUnique.mockResolvedValue(vorgang());
    for (const kaputt of ["2026-02-30", "10.08.2026", "morgen", 42]) {
      const res = await PATCH(patchReq({ antragEingangAm: kaputt }), ctx());
      expect(res.status).toBe(400);
    }
    expect(mockPrisma.personalData.update).not.toHaveBeenCalled();
  });

  it("lehnt eine Meldung vor dem Antragseingang ab", async () => {
    // Keine Rechtsfrage, sondern Arithmetik: Man kann nichts melden, was noch
    // nicht eingegangen ist. Ohne die Prüfung entstünden Fristen, die vor ihrem
    // eigenen Beginn enden.
    mockPrisma.onboardingProcess.findUnique.mockResolvedValue(
      vorgang({
        personalData: { rvAntragEingangAm: datumsSpalte("2026-08-10") },
      })
    );
    const res = await PATCH(patchReq({ meldungAm: "2026-08-01" }), ctx());

    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("nicht vor dem Eingang");
    expect(mockPrisma.personalData.update).not.toHaveBeenCalled();
  });

  it("protokolliert die Änderung mit altem und neuem Wert", async () => {
    // Diese Daten wandern in die Entgeltunterlagen und damit in die
    // Betriebsprüfung. Ein Protokoll, das nur den neuen Wert kennt, sagt nicht,
    // was geändert wurde.
    mockPrisma.onboardingProcess.findUnique.mockResolvedValue(
      vorgang({
        personalData: { rvAntragEingangAm: datumsSpalte("2026-08-05") },
      })
    );
    await PATCH(patchReq({ antragEingangAm: "2026-08-12" }), ctx());

    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "RV_FRISTEN_UPDATED",
          onboardingId: ID,
          userId: "u1",
          details: expect.objectContaining({
            vorher: expect.objectContaining({ antragEingangAm: "2026-08-05" }),
            nachher: expect.objectContaining({ antragEingangAm: "2026-08-12" }),
          }),
        }),
      })
    );
  });

  it("speichert nichts, wenn kein Feld übergeben wurde", async () => {
    mockPrisma.onboardingProcess.findUnique.mockResolvedValue(vorgang());
    const res = await PATCH(patchReq({ irgendwas: "x" }), ctx());
    expect(res.status).toBe(400);
    expect(mockPrisma.personalData.update).not.toHaveBeenCalled();
  });

  it("meldet einen Vorgang ohne Angaben", async () => {
    mockPrisma.onboardingProcess.findUnique.mockResolvedValue({
      ...vorgang(),
      personalData: null,
    });
    const res = await PATCH(patchReq({ antragEingangAm: "2026-08-10" }), ctx());
    expect(res.status).toBe(409);
  });
});
