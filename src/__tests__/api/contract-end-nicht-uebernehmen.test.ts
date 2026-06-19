/**
 * Tests fuer Strang B: POST /api/contract-end/[id]/nicht-uebernehmen
 * Kern: genau EIN Offboarding (BEFRISTUNGSENDE), Idempotenz/Doppelklick-Schutz.
 */

const mockGetSession = jest.fn();
const mockPrisma = {
  contractEndProcess: { findUnique: jest.fn(), updateMany: jest.fn(), update: jest.fn() },
  auditLog: { create: jest.fn() },
};
const mockCanAccessProcess = jest.fn();
const mockCreateOffboarding = jest.fn();

jest.mock("@/lib/auth", () => ({ getSession: mockGetSession }));
jest.mock("@/lib/db", () => ({ prisma: mockPrisma }));
jest.mock("@/lib/permissions", () => ({
  HR_EDIT_ROLES: ["SUPER_ADMIN", "HR_LEITUNG", "HR_SACHBEARBEITER"],
  canAccessProcess: mockCanAccessProcess,
}));
jest.mock("@/lib/offboarding", () => ({ createOffboardingProcess: mockCreateOffboarding }));

import { POST } from "@/app/api/contract-end/[id]/nicht-uebernehmen/route";
import { NextRequest } from "next/server";

function req(): NextRequest {
  return new NextRequest("http://localhost:3000/api/contract-end/ce1/nicht-uebernehmen", {
    method: "POST",
  });
}
const params = () => Promise.resolve({ id: "ce1" });

const ceBase = {
  id: "ce1",
  displayId: "VE-2026-GYM-001",
  organizationId: "org1",
  organization: { id: "org1", name: "Gymnasium", shortName: "GYM", mandantNumber: "100", type: "GYMNASIUM" },
  employeeEmail: "max@example.org",
  employeeFirstName: "Max",
  employeeLastName: "Mustermann",
  employeePersonalNr: null,
  employeeId: null,
  contractEndDate: new Date("2026-12-31"),
  offboardingId: null,
};

describe("Strang B: nicht-uebernehmen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSession.mockResolvedValue({ userId: "u1", role: "HR_LEITUNG" });
    mockCanAccessProcess.mockResolvedValue(true);
  });

  it("401 ohne Session", async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await POST(req(), { params: params() });
    expect(res.status).toBe(401);
  });

  it("409 wenn bereits ein Offboarding verknuepft ist (Idempotenz)", async () => {
    mockPrisma.contractEndProcess.findUnique.mockResolvedValue({ ...ceBase, offboardingId: "off-x" });
    const res = await POST(req(), { params: params() });
    expect(res.status).toBe(409);
    expect(mockCreateOffboarding).not.toHaveBeenCalled();
  });

  it("409 wenn der Claim ins Leere greift (parallel bereits entschieden)", async () => {
    mockPrisma.contractEndProcess.findUnique.mockResolvedValue(ceBase);
    mockPrisma.contractEndProcess.updateMany.mockResolvedValue({ count: 0 });
    const res = await POST(req(), { params: params() });
    expect(res.status).toBe(409);
    expect(mockCreateOffboarding).not.toHaveBeenCalled();
  });

  it("legt genau EIN Offboarding (BEFRISTUNGSENDE) an und verknuepft es", async () => {
    mockPrisma.contractEndProcess.findUnique.mockResolvedValue(ceBase);
    mockPrisma.contractEndProcess.updateMany.mockResolvedValue({ count: 1 });
    mockCreateOffboarding.mockResolvedValue({ id: "off1", displayId: "OFF-2026-GYM-004" });
    mockPrisma.contractEndProcess.update.mockResolvedValue({
      id: "ce1",
      offboarding: { id: "off1", displayId: "OFF-2026-GYM-004", status: "INITIATED" },
    });
    mockPrisma.auditLog.create.mockResolvedValue({});

    const res = await POST(req(), { params: params() });
    expect(res.status).toBe(201);

    expect(mockCreateOffboarding).toHaveBeenCalledTimes(1);
    const arg = mockCreateOffboarding.mock.calls[0][0];
    expect(arg.exitType).toBe("BEFRISTUNGSENDE");
    expect(arg.lastWorkingDay).toEqual(ceBase.contractEndDate);
    expect(arg.employeeEmail).toBe("max@example.org");

    // Verknuepfung + Status gesetzt
    expect(mockPrisma.contractEndProcess.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "ce1" },
        data: expect.objectContaining({
          offboardingId: "off1",
          status: "ENTSCHEIDUNG_KEINE_UEBERNAHME",
        }),
      }),
    );
  });
});
