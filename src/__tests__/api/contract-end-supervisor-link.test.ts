/**
 * Tests fuer Strang A: POST /api/contract-end/[id]/supervisor-link
 * Kern: Der Magic-Link geht per Mail an die Fuehrungskraft — die Antwort an HR
 * traegt weder den Token noch den fertigen Link.
 */

const mockGetSession = jest.fn();
const mockCanAccessProcess = jest.fn();
const mockPrisma = {
  contractEndProcess: { findUnique: jest.fn(), update: jest.fn() },
  contractRenewalData: { upsert: jest.fn() },
  auditLog: { create: jest.fn() },
};
const mockTriggerWebhooks = jest.fn();

/** Steht fuer den Schluessel des Magic-Links — darf in keiner Antwort auftauchen. */
const mockToken = "geheimer-magic-link-token";
const mockAblauf = new Date("2026-11-01T00:00:00.000Z");

jest.mock("@/lib/auth", () => ({
  getSession: mockGetSession,
  generateToken: () => mockToken,
  getTokenExpiryDate: () => mockAblauf,
}));
jest.mock("@/lib/db", () => ({ prisma: mockPrisma }));
jest.mock("@/lib/permissions", () => ({
  HR_EDIT_ROLES: ["SUPER_ADMIN", "HR_LEITUNG", "HR_SACHBEARBEITER"],
  canAccessProcess: mockCanAccessProcess,
}));
jest.mock("@/lib/webhooks", () => ({ triggerWebhooks: mockTriggerWebhooks }));

import { POST } from "@/app/api/contract-end/[id]/supervisor-link/route";
import { NextRequest } from "next/server";

function req(body: Record<string, unknown> = { supervisorEmail: "leitung@example.org" }): NextRequest {
  return new NextRequest("http://localhost:3000/api/contract-end/ce1/supervisor-link", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
const params = () => Promise.resolve({ id: "ce1" });

const vorgang = {
  id: "ce1",
  displayId: "VE-2026-GYM-001",
  organizationId: "org1",
  status: "ANGELEGT",
  employeeFirstName: "Max",
  employeeLastName: "Mustermann",
  contractEndDate: new Date("2026-12-31T00:00:00.000Z"),
  organization: { id: "org1", name: "Gymnasium", mandantNumber: "100" },
};

describe("POST /api/contract-end/[id]/supervisor-link", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSession.mockResolvedValue({ userId: "u1", role: "HR_LEITUNG" });
    mockCanAccessProcess.mockResolvedValue(true);
    mockPrisma.contractEndProcess.findUnique.mockResolvedValue(vorgang);
    mockPrisma.contractEndProcess.update.mockResolvedValue({
      ...vorgang,
      status: "ANFRAGE_VORGESETZTER",
      supervisorEmail: "leitung@example.org",
      supervisorToken: mockToken,
      supervisorTokenExpiresAt: mockAblauf,
    });
    mockPrisma.contractRenewalData.upsert.mockResolvedValue({});
    mockPrisma.auditLog.create.mockResolvedValue({});
    mockTriggerWebhooks.mockResolvedValue(undefined);
  });

  it("401 ohne Session, 403 ohne HR-Rolle, 400 ohne gültige Adresse", async () => {
    mockGetSession.mockResolvedValueOnce(null);
    expect((await POST(req(), { params: params() })).status).toBe(401);

    mockGetSession.mockResolvedValueOnce({ userId: "u1", role: "VORGESETZTER" });
    expect((await POST(req(), { params: params() })).status).toBe(403);

    expect((await POST(req({ supervisorEmail: "keine-adresse" }), { params: params() })).status).toBe(400);
    expect(mockTriggerWebhooks).not.toHaveBeenCalled();
  });

  it("201: die Antwort trägt weder Token noch Link, das Ablaufdatum bleibt", async () => {
    const res = await POST(req(), { params: params() });
    expect(res.status).toBe(201);
    const json = await res.json();

    expect(json).not.toHaveProperty("supervisorToken");
    expect(json).not.toHaveProperty("formularLink");
    expect(JSON.stringify(json)).not.toContain(mockToken);
    expect(json).toEqual({
      id: "ce1",
      supervisorEmail: "leitung@example.org",
      employeeName: "Max Mustermann",
      supervisorTokenExpiresAt: mockAblauf.toISOString(),
    });
  });

  it("der Link geht weiterhin per Mail an die Führungskraft", async () => {
    await POST(req(), { params: params() });

    expect(mockPrisma.contractEndProcess.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "ce1" },
        data: expect.objectContaining({
          supervisorEmail: "leitung@example.org",
          supervisorToken: mockToken,
          status: "ANFRAGE_VORGESETZTER",
        }),
      }),
    );
    expect(mockTriggerWebhooks).toHaveBeenCalledWith(
      "contract-end-supervisor-link",
      expect.objectContaining({
        supervisorEmail: "leitung@example.org",
        formularLink: expect.stringContaining(`/vertrag-formular/${mockToken}`),
      }),
    );
  });
});
