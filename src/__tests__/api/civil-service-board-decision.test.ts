/**
 * Tests fuer /api/civil-service/[id]/board-decision (POST = Beiratsentscheidung)
 * Fokus: psi-completed Webhook nur bei LIFETIME + POSITIVE
 */

const mockGetSession = jest.fn();
const mockPrisma = {
  civilServiceProcess: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  civilServiceBoardDecision: {
    create: jest.fn(),
  },
  auditLog: {
    create: jest.fn(),
  },
  $transaction: jest.fn(),
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

import { POST } from "@/app/api/civil-service/[id]/board-decision/route";
import { NextRequest } from "next/server";

function createRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest(
    "http://localhost:3000/api/civil-service/psi-1/board-decision",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

const params = { params: Promise.resolve({ id: "psi-1" }) };

const baseProcess = {
  id: "psi-1",
  status: "LIFETIME_PENDING",
  displayId: "PSI-2026-FES-001",
  employeeEmail: "anna.lehrerin@credo.de",
  employeeFirstName: "Anna",
  employeeLastName: "Lehrerin",
  organization: { name: "FES Minden", mandantNumber: "1001" },
};

describe("API /api/civil-service/[id]/board-decision POST", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSession.mockResolvedValue({ userId: "user-1", role: "HR_LEITUNG" });
    mockPrisma.civilServiceProcess.findUnique.mockResolvedValue(baseProcess);
    mockPrisma.civilServiceBoardDecision.create.mockResolvedValue({
      id: "dec-1",
    });
    mockPrisma.civilServiceProcess.update.mockResolvedValue({});
    mockPrisma.auditLog.create.mockResolvedValue({});
    mockPrisma.$transaction.mockImplementation(
      async (fn: (tx: typeof mockPrisma) => Promise<unknown>) => fn(mockPrisma)
    );
    mockTriggerWebhooks.mockResolvedValue(undefined);
  });

  it("sollte psi-completed feuern bei LIFETIME + POSITIVE", async () => {
    const res = await POST(
      createRequest({
        decisionType: "LIFETIME",
        result: "POSITIVE",
        decisionDate: "2026-07-15",
      }),
      params
    );

    expect(res.status).toBe(201);
    expect(mockTriggerWebhooks).toHaveBeenCalledTimes(1);
    const [event, payload] = mockTriggerWebhooks.mock.calls[0];
    expect(event).toBe("psi-completed");
    expect(payload).toMatchObject({
      civilServiceId: "psi-1",
      displayId: "PSI-2026-FES-001",
      employeeName: "Anna Lehrerin",
      organization: "FES Minden",
      decisionType: "LIFETIME",
      decisionDate: "2026-07-15",
    });
    expect(payload.completedAt).toEqual(expect.any(String));
  });

  it("sollte KEIN psi-completed feuern bei LIFETIME + NEGATIVE", async () => {
    const res = await POST(
      createRequest({
        decisionType: "LIFETIME",
        result: "NEGATIVE",
        decisionDate: "2026-07-15",
      }),
      params
    );

    expect(res.status).toBe(201);
    expect(mockTriggerWebhooks).not.toHaveBeenCalled();
  });

  it("sollte KEIN psi-completed feuern bei LIFETIME + POSTPONED", async () => {
    const res = await POST(
      createRequest({
        decisionType: "LIFETIME",
        result: "POSTPONED",
        decisionDate: "2026-07-15",
      }),
      params
    );

    expect(res.status).toBe(201);
    expect(mockTriggerWebhooks).not.toHaveBeenCalled();
  });

  it("sollte KEIN psi-completed feuern bei PROBE + POSITIVE (nur Phasen-Wechsel)", async () => {
    mockPrisma.civilServiceProcess.findUnique.mockResolvedValue({
      ...baseProcess,
      status: "BOARD_PENDING",
    });

    const res = await POST(
      createRequest({
        decisionType: "PROBE",
        result: "POSITIVE",
        decisionDate: "2026-04-15",
      }),
      params
    );

    expect(res.status).toBe(201);
    expect(mockTriggerWebhooks).not.toHaveBeenCalled();
  });

  it("sollte 400 bei falschem Status (LIFETIME nur in LIFETIME_PENDING)", async () => {
    mockPrisma.civilServiceProcess.findUnique.mockResolvedValue({
      ...baseProcess,
      status: "DRAFT",
    });

    const res = await POST(
      createRequest({
        decisionType: "LIFETIME",
        result: "POSITIVE",
        decisionDate: "2026-07-15",
      }),
      params
    );

    expect(res.status).toBe(400);
    expect(mockTriggerWebhooks).not.toHaveBeenCalled();
  });
});
