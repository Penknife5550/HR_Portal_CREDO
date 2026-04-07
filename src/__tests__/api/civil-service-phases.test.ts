/**
 * Tests fuer /api/civil-service/[id]/phases (PATCH = Phase aktualisieren)
 * Fokus: psi-phase-completed Webhook + Idempotenz
 */

const mockGetSession = jest.fn();
const mockPrisma = {
  civilServiceProcess: {
    findUnique: jest.fn(),
  },
  civilServicePhase: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  auditLog: {
    create: jest.fn(),
  },
};
const mockTriggerWebhooks = jest.fn();

jest.mock("@/lib/auth", () => ({
  getSession: mockGetSession,
}));
jest.mock("@/lib/db", () => ({
  prisma: mockPrisma,
}));
jest.mock("@/lib/webhooks", () => ({
  triggerWebhooks: mockTriggerWebhooks,
}));

import { PATCH } from "@/app/api/civil-service/[id]/phases/route";
import { NextRequest } from "next/server";

function createRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost:3000/api/civil-service/psi-1/phases", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const params = { params: Promise.resolve({ id: "psi-1" }) };

const baseProcess = {
  id: "psi-1",
  displayId: "PSI-2026-FES-001",
  employeeFirstName: "Anna",
  employeeLastName: "Lehrerin",
  organization: { name: "FES Minden", mandantNumber: "1001" },
};

const basePhasePending = {
  id: "phase-1",
  processId: "psi-1",
  phaseKey: "AMTSARZT_PROBE",
  phaseName: "Amtsaerztliche Untersuchung (Probe)",
  status: "PENDING",
  startedAt: null,
  completedAt: null,
};

describe("API /api/civil-service/[id]/phases PATCH", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSession.mockResolvedValue({ userId: "user-1", role: "HR_LEITUNG" });
    mockPrisma.civilServiceProcess.findUnique.mockResolvedValue(baseProcess);
    mockPrisma.civilServicePhase.findUnique.mockResolvedValue(basePhasePending);
    mockPrisma.civilServicePhase.update.mockResolvedValue({
      ...basePhasePending,
      status: "COMPLETED",
      completedAt: new Date("2026-04-07T10:30:00Z"),
    });
    mockPrisma.auditLog.create.mockResolvedValue({});
    mockTriggerWebhooks.mockResolvedValue(undefined);
  });

  it("sollte psi-phase-completed feuern wenn PENDING -> COMPLETED", async () => {
    const res = await PATCH(
      createRequest({ phaseKey: "AMTSARZT_PROBE", status: "COMPLETED" }),
      params
    );

    expect(res.status).toBe(200);
    expect(mockTriggerWebhooks).toHaveBeenCalledTimes(1);
    const [event, payload] = mockTriggerWebhooks.mock.calls[0];
    expect(event).toBe("psi-phase-completed");
    expect(payload).toMatchObject({
      civilServiceId: "psi-1",
      displayId: "PSI-2026-FES-001",
      employeeName: "Anna Lehrerin",
      phaseKey: "AMTSARZT_PROBE",
      phaseName: "Amtsaerztliche Untersuchung (Probe)",
    });
    expect(payload.completedAt).toEqual(expect.any(String));
  });

  it("sollte KEIN Webhook feuern wenn Phase bereits COMPLETED war (Idempotenz)", async () => {
    mockPrisma.civilServicePhase.findUnique.mockResolvedValue({
      ...basePhasePending,
      status: "COMPLETED",
      completedAt: new Date("2026-04-01T10:00:00Z"),
    });

    const res = await PATCH(
      createRequest({ phaseKey: "AMTSARZT_PROBE", status: "COMPLETED" }),
      params
    );

    expect(res.status).toBe(200);
    expect(mockTriggerWebhooks).not.toHaveBeenCalled();
  });

  it("sollte completedAt NICHT ueberschreiben wenn Phase bereits COMPLETED war", async () => {
    const originalCompletedAt = new Date("2026-04-01T10:00:00Z");
    mockPrisma.civilServicePhase.findUnique.mockResolvedValue({
      ...basePhasePending,
      status: "COMPLETED",
      completedAt: originalCompletedAt,
    });

    await PATCH(
      createRequest({ phaseKey: "AMTSARZT_PROBE", status: "COMPLETED" }),
      params
    );

    const updateCall = mockPrisma.civilServicePhase.update.mock.calls[0][0];
    expect(updateCall.data).not.toHaveProperty("completedAt");
  });

  it("sollte KEIN Webhook feuern bei status=IN_PROGRESS", async () => {
    await PATCH(
      createRequest({ phaseKey: "AMTSARZT_PROBE", status: "IN_PROGRESS" }),
      params
    );
    expect(mockTriggerWebhooks).not.toHaveBeenCalled();
  });

  it("sollte KEIN Webhook feuern bei status=BLOCKED", async () => {
    await PATCH(
      createRequest({
        phaseKey: "AMTSARZT_PROBE",
        status: "BLOCKED",
        blockedReason: "Wartet auf Amtsarzt-Termin",
      }),
      params
    );
    expect(mockTriggerWebhooks).not.toHaveBeenCalled();
  });

  it("sollte 401 zurueckgeben wenn nicht authentifiziert", async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await PATCH(
      createRequest({ phaseKey: "AMTSARZT_PROBE", status: "COMPLETED" }),
      params
    );
    expect(res.status).toBe(401);
  });
});
