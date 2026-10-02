/**
 * Tests fuer die Anfrage an die Fuehrungskraft (Strang A):
 * POST /api/contract-end/[id]/supervisor-link
 * Kern: in welchen Status eine (neue) Anfrage moeglich ist, und dass eine neue
 * Anfrage die alte Rueckmeldung zuruecksetzt.
 *
 * Die Statusliste liegt in src/lib/contract-end-status.ts (dieselbe liest der
 * Test des Prozess-Adapters). Hier steht ausgeschrieben, was die Route tut.
 */

const mockGetSession = jest.fn();
const mockCanAccessProcess = jest.fn();
const mockPrisma = {
  contractEndProcess: { findUnique: jest.fn(), update: jest.fn() },
  contractRenewalData: { upsert: jest.fn() },
  auditLog: { create: jest.fn() },
};
const mockTriggerWebhooks = jest.fn();

jest.mock("@/lib/auth", () => ({
  getSession: mockGetSession,
  generateToken: () => "token-neu",
  getTokenExpiryDate: () => new Date("2026-07-01T00:00:00.000Z"),
}));
jest.mock("@/lib/db", () => ({ prisma: mockPrisma }));
jest.mock("@/lib/permissions", () => ({
  HR_EDIT_ROLES: ["SUPER_ADMIN", "HR_LEITUNG", "HR_SACHBEARBEITER"],
  canAccessProcess: mockCanAccessProcess,
}));
jest.mock("@/lib/webhooks", () => ({ triggerWebhooks: mockTriggerWebhooks }));

import { POST } from "@/app/api/contract-end/[id]/supervisor-link/route";
import { CONTRACT_END_UEBERGAENGE } from "@/lib/contract-end-status";
import { NextRequest } from "next/server";

function req(body: unknown = { supervisorEmail: "leitung@example.org" }): NextRequest {
  return new NextRequest("http://localhost:3000/api/contract-end/ce1/supervisor-link", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
const params = () => Promise.resolve({ id: "ce1" });

function vorgang(overrides: Record<string, unknown> = {}) {
  return {
    id: "ce1",
    displayId: "VE-2026-GYM-001",
    organizationId: "org1",
    status: "ANGELEGT",
    employeeFirstName: "Max",
    employeeLastName: "Mustermann",
    contractEndDate: new Date("2026-12-31T00:00:00.000Z"),
    organization: { name: "Gymnasium", mandantNumber: "100" },
    ...overrides,
  };
}

const GESPERRT = [
  "ENTSCHEIDUNG_KEINE_UEBERNAHME",
  "VERTRAG_ERSTELLT",
  "VERTRAG_UNTERSCHRIEBEN",
  "ABGESCHLOSSEN",
  "STORNIERT",
];
const MOEGLICH = [
  "ANGELEGT",
  "ANFRAGE_VORGESETZTER",
  "ENTSCHEIDUNG_UEBERNAHME",
  "RUECKMELDUNG_UEBERNAHME",
  "RUECKMELDUNG_KEINE_UEBERNAHME",
];

describe("POST /api/contract-end/[id]/supervisor-link", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSession.mockResolvedValue({ userId: "u1", role: "HR_LEITUNG" });
    mockCanAccessProcess.mockResolvedValue(true);
    mockPrisma.contractEndProcess.findUnique.mockResolvedValue(vorgang());
    mockPrisma.contractEndProcess.update.mockResolvedValue({ id: "ce1" });
    mockPrisma.contractRenewalData.upsert.mockResolvedValue({});
    mockPrisma.auditLog.create.mockResolvedValue({});
    mockTriggerWebhooks.mockResolvedValue(undefined);
  });

  it("401 ohne Session, 403 ohne HR-Rolle, 403 ohne Org-Scope, 404 unbekannt", async () => {
    mockGetSession.mockResolvedValueOnce(null);
    expect((await POST(req(), { params: params() })).status).toBe(401);

    mockGetSession.mockResolvedValueOnce({ userId: "u1", role: "VORGESETZTER" });
    expect((await POST(req(), { params: params() })).status).toBe(403);

    mockCanAccessProcess.mockResolvedValueOnce(false);
    expect((await POST(req(), { params: params() })).status).toBe(403);

    mockPrisma.contractEndProcess.findUnique.mockResolvedValueOnce(null);
    expect((await POST(req(), { params: params() })).status).toBe(404);

    expect(mockPrisma.contractEndProcess.update).not.toHaveBeenCalled();
    expect(mockTriggerWebhooks).not.toHaveBeenCalled();
  });

  it("400 bei ungültiger Adresse — nichts geschrieben", async () => {
    const res = await POST(req({ supervisorEmail: "keine-adresse" }), { params: params() });
    expect(res.status).toBe(400);
    expect(mockPrisma.contractEndProcess.update).not.toHaveBeenCalled();
  });

  it("die beiden Listen decken jeden Status des Moduls ab", () => {
    expect([...GESPERRT, ...MOEGLICH].sort()).toEqual(Object.keys(CONTRACT_END_UEBERGAENGE).sort());
  });

  it.each(GESPERRT)("400 im Status %s — nichts geschrieben, keine Mail", async (status) => {
    mockPrisma.contractEndProcess.findUnique.mockResolvedValue(vorgang({ status }));
    const res = await POST(req(), { params: params() });

    expect(res.status).toBe(400);
    expect(mockPrisma.contractEndProcess.update).not.toHaveBeenCalled();
    expect(mockPrisma.contractRenewalData.upsert).not.toHaveBeenCalled();
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
    expect(mockTriggerWebhooks).not.toHaveBeenCalled();
  });

  it.each(MOEGLICH)("201 aus dem Status %s — neuer Link, alte Rückmeldung zurückgesetzt, Mail", async (status) => {
    mockPrisma.contractEndProcess.findUnique.mockResolvedValue(vorgang({ status }));
    const res = await POST(req(), { params: params() });

    expect(res.status).toBe(201);
    expect(mockPrisma.contractEndProcess.update).toHaveBeenCalledWith({
      where: { id: "ce1" },
      data: expect.objectContaining({
        supervisorEmail: "leitung@example.org",
        supervisorToken: "token-neu",
        status: "ANFRAGE_VORGESETZTER",
        decision: "OFFEN",
        supervisorRespondedAt: null,
        supervisorDeclineReason: null,
        lastSupervisorReminderAt: null,
        supervisorReminderCount: 0,
        escalatedAt: null,
        vorstandAbgestimmt: null,
        vorstandAbstimmungVermerk: null,
      }),
    });
    expect(mockTriggerWebhooks).toHaveBeenCalledWith(
      "contract-end-supervisor-link",
      expect.objectContaining({
        supervisorEmail: "leitung@example.org",
        formularLink: expect.stringContaining("/vertrag-formular/token-neu"),
      }),
    );
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "SUPERVISOR_LINK_CREATED" }) }),
    );
  });
});
