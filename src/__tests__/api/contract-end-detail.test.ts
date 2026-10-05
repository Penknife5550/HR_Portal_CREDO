/**
 * Tests fuer /api/contract-end/[id] (GET – Einzelvorgang, PATCH – Aktualisieren)
 * Kern: Die Antwort traegt den Vorgang OHNE supervisorToken (Schluessel des
 * Magic-Links der Fuehrungskraft), das Ablaufdatum bleibt.
 */

const mockGetSession = jest.fn();
const mockCanAccessProcess = jest.fn();
const mockPrisma = {
  contractEndProcess: { findUnique: jest.fn(), update: jest.fn() },
  auditLog: { create: jest.fn() },
};

jest.mock("@/lib/auth", () => ({ getSession: mockGetSession }));
jest.mock("@/lib/db", () => ({ prisma: mockPrisma }));
jest.mock("@/lib/permissions", () => ({
  PORTAL_ROLES: ["SUPER_ADMIN", "HR_LEITUNG", "HR_SACHBEARBEITER", "EINRICHTUNGSLEITUNG", "VORGESETZTER"],
  HR_EDIT_ROLES: ["SUPER_ADMIN", "HR_LEITUNG", "HR_SACHBEARBEITER"],
  canAccessProcess: mockCanAccessProcess,
}));

import { GET, PATCH } from "@/app/api/contract-end/[id]/route";
import { NextRequest } from "next/server";

/** Steht fuer den Schluessel des Magic-Links — darf in keiner Antwort auftauchen. */
const GEHEIM = "geheimer-magic-link-token";
const ABLAUF = "2026-11-01T00:00:00.000Z";

const params = () => Promise.resolve({ id: "ce1" });

function getRequest(): NextRequest {
  return new NextRequest("http://localhost:3000/api/contract-end/ce1");
}

function patchRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost:3000/api/contract-end/ce1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function vorgang(overrides: Record<string, unknown> = {}) {
  return {
    id: "ce1",
    displayId: "VE-2026-GYM-001",
    organizationId: "org1",
    status: "ANFRAGE_VORGESETZTER",
    decision: "OFFEN",
    employeeFirstName: "Max",
    employeeLastName: "Mustermann",
    supervisorEmail: "leitung@example.org",
    supervisorToken: GEHEIM,
    supervisorTokenExpiresAt: new Date(ABLAUF),
    supervisorLinkSentAt: new Date("2026-10-01T08:00:00.000Z"),
    mavStatus: null,
    organization: { id: "org1", name: "Gymnasium", mandantNumber: "100" },
    renewalData: null,
    ...overrides,
  };
}

describe("GET /api/contract-end/[id]", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSession.mockResolvedValue({ userId: "u1", role: "HR_LEITUNG" });
    mockCanAccessProcess.mockResolvedValue(true);
    mockPrisma.contractEndProcess.findUnique.mockResolvedValue(
      vorgang({ offboarding: null, auditLogs: [] }),
    );
  });

  it("401 ohne Session, 403 ohne Portal-Rolle, 404 unbekannt, 403 fremder Mandant", async () => {
    mockGetSession.mockResolvedValueOnce(null);
    expect((await GET(getRequest(), { params: params() })).status).toBe(401);

    mockGetSession.mockResolvedValueOnce({ userId: "u1", role: "SERVICE" });
    expect((await GET(getRequest(), { params: params() })).status).toBe(403);

    mockPrisma.contractEndProcess.findUnique.mockResolvedValueOnce(null);
    expect((await GET(getRequest(), { params: params() })).status).toBe(404);

    mockCanAccessProcess.mockResolvedValueOnce(false);
    const res = await GET(getRequest(), { params: params() });
    expect(res.status).toBe(403);
    expect(JSON.stringify(await res.json())).not.toContain(GEHEIM);
  });

  // Die Route laesst alle PORTAL_ROLES zu, also auch die nur lesenden (die
  // heute noch am Mandanten-Gate der Middleware scheitern, src/lib/mandanten-gate.ts).
  it.each(["HR_LEITUNG", "EINRICHTUNGSLEITUNG", "VORGESETZTER"])(
    "200 für %s: Vorgang ohne supervisorToken",
    async (role) => {
      mockGetSession.mockResolvedValue({ userId: "u1", role });

      const res = await GET(getRequest(), { params: params() });
      expect(res.status).toBe(200);
      const json = await res.json();

      expect(json).not.toHaveProperty("supervisorToken");
      expect(JSON.stringify(json)).not.toContain(GEHEIM);
    },
  );

  it("das Ablaufdatum des Links und der Rest des Vorgangs bleiben in der Antwort", async () => {
    const res = await GET(getRequest(), { params: params() });
    const json = await res.json();

    // supervisorTokenExpiresAt braucht die Oberflaeche (Prozess-Adapter
    // Vertragsende) — nur der Schluessel selbst faellt weg.
    expect(json.supervisorTokenExpiresAt).toBe(ABLAUF);
    expect(json).toMatchObject({
      id: "ce1",
      displayId: "VE-2026-GYM-001",
      status: "ANFRAGE_VORGESETZTER",
      supervisorEmail: "leitung@example.org",
      supervisorLinkSentAt: "2026-10-01T08:00:00.000Z",
      organization: { id: "org1", name: "Gymnasium" },
      renewalData: null,
      offboarding: null,
      auditLogs: [],
    });
  });
});

describe("PATCH /api/contract-end/[id]", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSession.mockResolvedValue({ userId: "u1", role: "HR_LEITUNG" });
    mockCanAccessProcess.mockResolvedValue(true);
    mockPrisma.contractEndProcess.findUnique.mockResolvedValue(vorgang());
    mockPrisma.contractEndProcess.update.mockResolvedValue(vorgang({ mavStatus: "ANGEHOERT" }));
    mockPrisma.auditLog.create.mockResolvedValue({});
  });

  it("403 für nur lesende Rollen", async () => {
    mockGetSession.mockResolvedValue({ userId: "u1", role: "VORGESETZTER" });
    const res = await PATCH(patchRequest({ mavStatus: "ANGEHOERT" }), { params: params() });
    expect(res.status).toBe(403);
    expect(mockPrisma.contractEndProcess.update).not.toHaveBeenCalled();
  });

  it("200: die Antwort trägt den aktualisierten Vorgang ohne supervisorToken", async () => {
    const res = await PATCH(patchRequest({ mavStatus: "ANGEHOERT" }), { params: params() });
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json).not.toHaveProperty("supervisorToken");
    expect(JSON.stringify(json)).not.toContain(GEHEIM);
    expect(json).toMatchObject({
      id: "ce1",
      mavStatus: "ANGEHOERT",
      supervisorEmail: "leitung@example.org",
      supervisorTokenExpiresAt: ABLAUF,
    });

    // Am Schreiben aendert sich nichts
    expect(mockPrisma.contractEndProcess.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "ce1" },
        data: expect.objectContaining({ mavStatus: "ANGEHOERT" }),
      }),
    );
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "CONTRACT_END_UPDATED" }),
      }),
    );
  });
});
