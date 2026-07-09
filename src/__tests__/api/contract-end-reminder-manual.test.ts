/**
 * Tests fuer den manuellen Erinnerungs-Button:
 * POST /api/contract-end/[id]/reminder
 * Kern: Auth/Scope, Status-/Voraussetzungs-Guards, abgelaufener Token,
 * Happy Path via gemeinsamem Helfer (Event + Zaehler + Audit).
 */

const mockGetSession = jest.fn();
const mockCanAccessProcess = jest.fn();
const mockPrisma = {
  contractEndProcess: { findUnique: jest.fn(), update: jest.fn() },
  auditLog: { create: jest.fn() },
};
const mockTriggerWebhooks = jest.fn();

jest.mock("@/lib/auth", () => ({ getSession: mockGetSession }));
jest.mock("@/lib/db", () => ({ prisma: mockPrisma }));
jest.mock("@/lib/permissions", () => ({
  HR_EDIT_ROLES: ["SUPER_ADMIN", "HR_LEITUNG", "HR_SACHBEARBEITER"],
  canAccessProcess: mockCanAccessProcess,
}));
jest.mock("@/lib/webhooks", () => ({ triggerWebhooks: mockTriggerWebhooks }));
jest.mock("@/lib/url", () => ({ getBaseUrl: () => "http://localhost:3000" }));

import { POST } from "@/app/api/contract-end/[id]/reminder/route";
import { NextRequest } from "next/server";

const MS_PER_DAY = 86400000;

function req(): NextRequest {
  return new NextRequest("http://localhost:3000/api/contract-end/ce1/reminder", {
    method: "POST",
  });
}
const params = () => Promise.resolve({ id: "ce1" });

function vorgang(overrides: Record<string, unknown> = {}) {
  const now = Date.now();
  return {
    id: "ce1",
    displayId: "VE-2026-GYM-001",
    organizationId: "org1",
    status: "ANFRAGE_VORGESETZTER",
    employeeFirstName: "Max",
    employeeLastName: "Mustermann",
    supervisorEmail: "leitung@example.org",
    supervisorToken: "token-abc",
    supervisorTokenExpiresAt: new Date(now + 10 * MS_PER_DAY),
    supervisorLinkSentAt: new Date(now - 5 * MS_PER_DAY),
    lastSupervisorReminderAt: null,
    supervisorReminderCount: 0,
    contractEndDate: new Date(now + 45 * MS_PER_DAY),
    organization: { name: "Gymnasium" },
    ...overrides,
  };
}

describe("POST /api/contract-end/[id]/reminder", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSession.mockResolvedValue({ userId: "u1", role: "HR_LEITUNG" });
    mockCanAccessProcess.mockResolvedValue(true);
    mockPrisma.contractEndProcess.findUnique.mockResolvedValue(vorgang());
    mockPrisma.contractEndProcess.update.mockResolvedValue({});
    mockPrisma.auditLog.create.mockResolvedValue({});
    mockTriggerWebhooks.mockResolvedValue(undefined);
  });

  it("401 ohne Session, 403 ohne HR-Rolle, 403 ohne Org-Scope", async () => {
    mockGetSession.mockResolvedValueOnce(null);
    expect((await POST(req(), { params: params() })).status).toBe(401);

    mockGetSession.mockResolvedValueOnce({ userId: "u1", role: "SERVICE" });
    expect((await POST(req(), { params: params() })).status).toBe(403);

    mockCanAccessProcess.mockResolvedValueOnce(false);
    expect((await POST(req(), { params: params() })).status).toBe(403);
  });

  it("404 bei unbekanntem Vorgang", async () => {
    mockPrisma.contractEndProcess.findUnique.mockResolvedValue(null);
    expect((await POST(req(), { params: params() })).status).toBe(404);
  });

  it("409 wenn keine offene Anfrage (falscher Status)", async () => {
    mockPrisma.contractEndProcess.findUnique.mockResolvedValue(
      vorgang({ status: "RUECKMELDUNG_UEBERNAHME" }),
    );
    expect((await POST(req(), { params: params() })).status).toBe(409);
    expect(mockTriggerWebhooks).not.toHaveBeenCalled();
  });

  it("409 wenn noch keine Anfrage versendet wurde", async () => {
    mockPrisma.contractEndProcess.findUnique.mockResolvedValue(
      vorgang({ supervisorEmail: null, supervisorToken: null, supervisorLinkSentAt: null }),
    );
    expect((await POST(req(), { params: params() })).status).toBe(409);
  });

  it("409 mit Hinweis bei abgelaufenem Token", async () => {
    mockPrisma.contractEndProcess.findUnique.mockResolvedValue(
      vorgang({ supervisorTokenExpiresAt: new Date(Date.now() - MS_PER_DAY) }),
    );
    const res = await POST(req(), { params: params() });
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toContain("abgelaufen");
    expect(mockTriggerWebhooks).not.toHaveBeenCalled();
  });

  it("Happy Path: Event mit bestehendem Link, Zaehler hochgezaehlt, Audit manuell", async () => {
    const res = await POST(req(), { params: params() });
    expect(res.status).toBe(200);

    expect(mockTriggerWebhooks).toHaveBeenCalledWith(
      "contract-end-supervisor-reminder",
      expect.objectContaining({
        supervisorEmail: "leitung@example.org",
        link: expect.stringContaining("/vertrag-formular/token-abc"),
      }),
    );
    expect(mockPrisma.contractEndProcess.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "ce1" },
        data: expect.objectContaining({ supervisorReminderCount: { increment: 1 } }),
      }),
    );
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "SUPERVISOR_REMINDER_SENT",
          details: expect.objectContaining({ manuell: true }),
        }),
      }),
    );
  });
});
