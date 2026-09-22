/**
 * Tests: Statusaenderung durch HR (PATCH /api/onboarding/[id])
 *
 * Frueher liess der Server jeden der acht Status zu; nur die Oberflaeche
 * schraenkte den Knopf „Als geprüft markieren" ein — und zeigte ihn im
 * festhaengenden Fall trotz fehlendem Fragebogen. Jetzt prueft der Server die
 * Uebergaenge selbst (Entscheidung 21.09.2026):
 *   REVIEWED  nur bei bereitZurPruefung
 *   COMPLETED nur aus REVIEWED
 *   EXPIRED   jederzeit
 *   INVITED…SUPERVISOR_SUBMITTED gar nicht von Hand (abgeleitet)
 */

const mockPrisma = {
  onboardingProcess: {
    findUnique: jest.fn(),
    updateMany: jest.fn(),
  },
  auditLog: { create: jest.fn() },
  userOrgAssignment: { findUnique: jest.fn() },
  $transaction: jest.fn(),
};
const mockSession = jest.fn();

jest.mock("@/lib/db", () => ({ prisma: mockPrisma }));
jest.mock("@/lib/auth", () => ({ getSession: () => mockSession() }));
jest.mock("@/lib/encryption", () => ({ decrypt: (v: string) => v }));

import { PATCH } from "@/app/api/onboarding/[id]/route";
import { NextRequest } from "next/server";

const ADMIN = {
  userId: "u-admin",
  email: "leitung@credo.example",
  role: "HR_LEITUNG",
  firstName: "L",
  lastName: "H",
};
const ZEIT = new Date("2026-09-18T09:00:00Z");

function patch(body: unknown) {
  return PATCH(
    new NextRequest("http://localhost:3000/api/onboarding/ob1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: "ob1" }) },
  );
}

function vorgang(teil: Record<string, unknown> = {}) {
  return {
    id: "ob1",
    organizationId: "org1",
    status: "SUBMITTED",
    submittedAt: ZEIT,
    supervisorSubmittedAt: null,
    supervisorToken: null,
    personalData: { currentStep: 12, isComplete: true },
    supervisorData: null,
    ...teil,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSession.mockResolvedValue(ADMIN);
  // Erster Aufruf: der Vorgang zur Pruefung; zweiter: die Antwort nach dem Schreiben.
  mockPrisma.onboardingProcess.findUnique.mockResolvedValue(vorgang());
  mockPrisma.onboardingProcess.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.auditLog.create.mockResolvedValue({});
  mockPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
    fn(mockPrisma),
  );
});

describe("REVIEWED — nur wenn bereit zur Pruefung", () => {
  it("geht bei eingereichtem Fragebogen ohne Vorgesetzten-Link", async () => {
    const res = await patch({ status: "REVIEWED" });
    expect(res.status).toBe(200);
    const arg = mockPrisma.onboardingProcess.updateMany.mock.calls[0][0];
    expect(arg.data).toMatchObject({ status: "REVIEWED", reviewedById: "u-admin" });
    expect(arg.data.reviewedAt).toBeInstanceOf(Date);
  });

  it("geht, wenn beides eingereicht ist", async () => {
    mockPrisma.onboardingProcess.findUnique.mockResolvedValue(
      vorgang({
        status: "SUPERVISOR_SUBMITTED",
        supervisorToken: "t",
        supervisorSubmittedAt: ZEIT,
      }),
    );
    expect((await patch({ status: "REVIEWED" })).status).toBe(200);
  });

  it("409 ohne eingereichten Fragebogen — auch wenn die Modalitaeten da sind", async () => {
    // Genau der festhaengende Fall, in dem die Oberflaeche den Knopf zeigte.
    mockPrisma.onboardingProcess.findUnique.mockResolvedValue(
      vorgang({
        status: "SUPERVISOR_SUBMITTED",
        submittedAt: null,
        personalData: { currentStep: 4, isComplete: false },
        supervisorToken: "t",
        supervisorSubmittedAt: ZEIT,
      }),
    );
    const res = await patch({ status: "REVIEWED" });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain("Personalfragebogen");
    expect(mockPrisma.onboardingProcess.updateMany).not.toHaveBeenCalled();
  });

  it("409, wenn ein Vorgesetzten-Link besteht, die Modalitaeten aber fehlen", async () => {
    mockPrisma.onboardingProcess.findUnique.mockResolvedValue(
      vorgang({ status: "SUPERVISOR_PENDING", supervisorToken: "t" }),
    );
    const res = await patch({ status: "REVIEWED" });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain("Einstellungsmodalitäten");
  });

  it("schreibt bedingt auf den gelesenen Stand — ein Rennen ergibt 409 statt einer veralteten Entscheidung", async () => {
    mockPrisma.onboardingProcess.updateMany.mockResolvedValue({ count: 0 });
    const res = await patch({ status: "REVIEWED" });
    expect(res.status).toBe(409);
    const arg = mockPrisma.onboardingProcess.updateMany.mock.calls[0][0];
    expect(arg.where).toEqual({
      id: "ob1",
      status: "SUBMITTED",
      submittedAt: ZEIT,
      supervisorSubmittedAt: null,
      supervisorToken: null,
    });
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("protokolliert den Wechsel im selben Commit", async () => {
    await patch({ status: "REVIEWED" });
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mockPrisma.auditLog.create.mock.calls[0][0].data).toMatchObject({
      action: "STATUS_CHANGED",
      details: { from: "SUBMITTED", to: "REVIEWED" },
    });
  });
});

describe("COMPLETED — nur aus REVIEWED", () => {
  it("geht aus REVIEWED", async () => {
    mockPrisma.onboardingProcess.findUnique.mockResolvedValue(vorgang({ status: "REVIEWED" }));
    const res = await patch({ status: "COMPLETED" });
    expect(res.status).toBe(200);
    expect(mockPrisma.onboardingProcess.updateMany.mock.calls[0][0].data.completedAt).toBeInstanceOf(
      Date,
    );
  });

  it.each(["SUBMITTED", "SUPERVISOR_SUBMITTED", "IN_PROGRESS"])("409 aus %s", async (status) => {
    mockPrisma.onboardingProcess.findUnique.mockResolvedValue(vorgang({ status }));
    expect((await patch({ status: "COMPLETED" })).status).toBe(409);
    expect(mockPrisma.onboardingProcess.updateMany).not.toHaveBeenCalled();
  });
});

describe("EXPIRED — jederzeit", () => {
  it.each(["INVITED", "IN_PROGRESS", "SUPERVISOR_PENDING", "REVIEWED"])("geht aus %s", async (status) => {
    mockPrisma.onboardingProcess.findUnique.mockResolvedValue(vorgang({ status }));
    expect((await patch({ status: "EXPIRED" })).status).toBe(200);
  });
});

describe("Abgeleitete Status und Eingaben", () => {
  it.each(["INVITED", "IN_PROGRESS", "SUBMITTED", "SUPERVISOR_PENDING", "SUPERVISOR_SUBMITTED"])(
    "%s ist nicht von Hand setzbar (400)",
    async (status) => {
      const res = await patch({ status });
      expect(res.status).toBe(400);
      expect(mockPrisma.onboardingProcess.findUnique).not.toHaveBeenCalled();
    },
  );

  it("weist einen unbekannten Status ab", async () => {
    const res = await patch({ status: "ERFUNDEN" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Ungültiger Status-Wert");
  });

  it("weist einen fehlenden Status ab", async () => {
    expect((await patch({})).status).toBe(400);
  });

  it("antwortet 404 fuer einen unbekannten Vorgang", async () => {
    mockPrisma.onboardingProcess.findUnique.mockResolvedValue(null);
    expect((await patch({ status: "EXPIRED" })).status).toBe(404);
  });

  it("verlangt HR-Bearbeitungsrechte", async () => {
    mockSession.mockResolvedValue({ ...ADMIN, role: "EINRICHTUNGSLEITUNG" });
    expect((await patch({ status: "REVIEWED" })).status).toBe(403);
  });
});
