/**
 * Tests fuer /api/contract-end (POST – Anlage + displayId-Format)
 */

const mockGetSession = jest.fn();
const mockPrisma = {
  contractEndProcess: { findUnique: jest.fn(), count: jest.fn(), create: jest.fn() },
  organization: { findUnique: jest.fn() },
  auditLog: { create: jest.fn() },
  $transaction: jest.fn(),
};
const mockTriggerWebhooks = jest.fn();
const mockCanAccessProcess = jest.fn();

jest.mock("@/lib/auth", () => ({ getSession: mockGetSession }));
jest.mock("@/lib/db", () => ({ prisma: mockPrisma }));
jest.mock("@/lib/webhooks", () => ({ triggerWebhooks: mockTriggerWebhooks }));
jest.mock("@/lib/permissions", () => ({
  PROCESS_CREATE_ROLES: ["SUPER_ADMIN", "HR_LEITUNG", "HR_SACHBEARBEITER", "EINRICHTUNGSLEITUNG"],
  PORTAL_ROLES: ["SUPER_ADMIN", "HR_LEITUNG", "HR_SACHBEARBEITER", "EINRICHTUNGSLEITUNG", "VORGESETZTER"],
  canAccessProcess: mockCanAccessProcess,
  orgFilter: jest.fn().mockResolvedValue({}),
}));

import { POST } from "@/app/api/contract-end/route";
import { NextRequest } from "next/server";

function createRequest(body?: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost:3000/api/contract-end", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

const validBody = {
  employeeEmail: "max.mustermann@example.org",
  employeeFirstName: "Max",
  employeeLastName: "Mustermann",
  organizationId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  contractEndDate: "2026-12-31",
};

const mockOrg = {
  id: validBody.organizationId,
  name: "CREDO Gymnasium",
  shortName: "GYM",
  mandantNumber: "100",
  type: "GYMNASIUM",
};

describe("API /api/contract-end POST", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSession.mockResolvedValue({ userId: "u1", role: "HR_LEITUNG" });
    mockCanAccessProcess.mockResolvedValue(true);
  });

  it("401 ohne Session", async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await POST(createRequest(validBody));
    expect(res.status).toBe(401);
  });

  it("400 bei fehlenden Pflichtfeldern", async () => {
    const res = await POST(createRequest({ employeeEmail: "x@example.org" }));
    expect(res.status).toBe(400);
  });

  it("400 bei ungueltigem contractEndDate", async () => {
    const res = await POST(createRequest({ ...validBody, contractEndDate: "31.12.2026" }));
    expect(res.status).toBe(400);
  });

  it("404 wenn Organisation fehlt", async () => {
    mockPrisma.organization.findUnique.mockResolvedValue(null);
    const res = await POST(createRequest(validBody));
    expect(res.status).toBe(404);
  });

  it("403 wenn kein Org-Zugriff (Multi-Tenant-Scope)", async () => {
    mockPrisma.organization.findUnique.mockResolvedValue(mockOrg);
    mockCanAccessProcess.mockResolvedValue(false);
    const res = await POST(createRequest(validBody));
    expect(res.status).toBe(403);
  });

  it("201 + displayId im Format VE-YYYY-XXX-NNN + Event", async () => {
    mockPrisma.organization.findUnique.mockResolvedValue(mockOrg);
    mockPrisma.contractEndProcess.count.mockResolvedValue(0);
    const created = {
      id: "ce1",
      displayId: `VE-${new Date().getFullYear()}-GYM-001`,
      employeeFirstName: "Max",
      employeeLastName: "Mustermann",
      employeeEmail: validBody.employeeEmail,
      contractEndDate: new Date("2026-12-31"),
      organization: mockOrg,
    };
    mockPrisma.contractEndProcess.findUnique
      .mockResolvedValueOnce(null) // displayId noch frei (Service)
      .mockResolvedValueOnce(created); // Ergebnis-Reload (Route)
    mockPrisma.$transaction.mockImplementation(
      async (fn: (tx: typeof mockPrisma) => Promise<unknown>) => fn(mockPrisma),
    );
    mockPrisma.contractEndProcess.create.mockResolvedValue(created);
    mockPrisma.auditLog.create.mockResolvedValue({});
    mockTriggerWebhooks.mockResolvedValue(undefined);

    const res = await POST(createRequest(validBody));
    expect(res.status).toBe(201);

    const createCall = mockPrisma.contractEndProcess.create.mock.calls[0][0];
    expect(createCall.data.displayId).toMatch(/^VE-\d{4}-[A-Z0-9]+-\d{3}$/);
    expect(mockTriggerWebhooks).toHaveBeenCalledWith("contract-end-created", expect.any(Object));
  });
});
