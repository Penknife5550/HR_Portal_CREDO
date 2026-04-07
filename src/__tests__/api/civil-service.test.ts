/**
 * Tests fuer /api/civil-service Route (POST = Verbeamtungsvorgang anlegen)
 * Fokus: psi-created Webhook-Trigger
 */

const mockGetSession = jest.fn();
const mockPrisma = {
  organization: {
    findUnique: jest.fn(),
  },
  civilServiceProcess: {
    count: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
  },
  civilServicePhase: {
    createMany: jest.fn(),
  },
  civilServiceChecklistItem: {
    createMany: jest.fn(),
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

import { POST } from "@/app/api/civil-service/route";
import { NextRequest } from "next/server";

function createRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost:3000/api/civil-service", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const validBody = {
  employeeFirstName: "Anna",
  employeeLastName: "Lehrerin",
  employeeEmail: "anna.lehrerin@credo.de",
  organizationId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  targetStartDate: "2026-08-01",
};

const mockOrg = {
  id: validBody.organizationId,
  name: "FES Minden",
  shortName: "FES",
  mandantNumber: "1001",
};

const mockCreated = {
  id: "psi-created-id",
  displayId: "PSI-2026-FES-001",
  employeeFirstName: "Anna",
  employeeLastName: "Lehrerin",
  employeeEmail: "anna.lehrerin@credo.de",
  organizationId: mockOrg.id,
  targetStartDate: new Date("2026-08-01"),
};

describe("API /api/civil-service POST", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSession.mockResolvedValue({ userId: "user-1", role: "HR_LEITUNG" });
    mockPrisma.organization.findUnique.mockResolvedValue(mockOrg);
    mockPrisma.civilServiceProcess.count.mockResolvedValue(0);
    mockPrisma.civilServiceProcess.findUnique
      .mockResolvedValueOnce(null) // displayId-Eindeutigkeitscheck
      .mockResolvedValueOnce({ ...mockCreated, organization: mockOrg }); // Final-Result
    mockPrisma.$transaction.mockImplementation(
      async (fn: (tx: typeof mockPrisma) => Promise<unknown>) => fn(mockPrisma)
    );
    mockPrisma.civilServiceProcess.create.mockResolvedValue({
      ...mockCreated,
      organization: mockOrg,
    });
    mockPrisma.civilServicePhase.createMany.mockResolvedValue({ count: 11 });
    mockPrisma.civilServiceChecklistItem.createMany.mockResolvedValue({ count: 30 });
    mockPrisma.auditLog.create.mockResolvedValue({});
    mockTriggerWebhooks.mockResolvedValue(undefined);
  });

  it("sollte 401 zurueckgeben wenn nicht authentifiziert", async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await POST(createRequest(validBody));
    expect(res.status).toBe(401);
  });

  it("sollte 403 zurueckgeben fuer Nicht-HR-Rolle", async () => {
    mockGetSession.mockResolvedValue({ userId: "u", role: "VIEWER" });
    const res = await POST(createRequest(validBody));
    expect(res.status).toBe(403);
  });

  it("sollte 404 zurueckgeben wenn Organisation nicht existiert", async () => {
    mockPrisma.organization.findUnique.mockResolvedValue(null);
    const res = await POST(createRequest(validBody));
    expect(res.status).toBe(404);
  });

  it("sollte triggerWebhooks(\"psi-created\") nach erfolgreicher Erstellung aufrufen", async () => {
    const res = await POST(createRequest(validBody));

    expect(res.status).toBe(201);
    expect(mockTriggerWebhooks).toHaveBeenCalledTimes(1);

    const [event, payload] = mockTriggerWebhooks.mock.calls[0];
    expect(event).toBe("psi-created");
    expect(payload).toMatchObject({
      civilServiceId: mockCreated.id,
      displayId: "PSI-2026-FES-001",
      employeeName: "Anna Lehrerin",
      employeeEmail: "anna.lehrerin@credo.de",
      organization: "FES Minden",
      mandantNumber: "1001",
      targetStartDate: expect.any(String),
    });
  });

  it("sollte targetStartDate als ISO-String uebergeben", async () => {
    await POST(createRequest(validBody));
    const payload = mockTriggerWebhooks.mock.calls[0][1];
    expect(payload.targetStartDate).toBe(new Date("2026-08-01").toISOString());
  });

  it("sollte targetStartDate als null uebergeben wenn nicht gesetzt", async () => {
    mockPrisma.civilServiceProcess.create.mockResolvedValue({
      ...mockCreated,
      targetStartDate: null,
      organization: mockOrg,
    });
    const { targetStartDate: _, ...bodyWithoutDate } = validBody;
    void _;
    await POST(createRequest(bodyWithoutDate));
    const payload = mockTriggerWebhooks.mock.calls[0][1];
    expect(payload.targetStartDate).toBeNull();
  });

  it("sollte 201 zurueckgeben auch wenn triggerWebhooks fehlschlaegt (defensiv)", async () => {
    // triggerWebhooks ist im Live-Code "wirft nie", aber wir testen den Vertrag:
    // selbst wenn er werfen wuerde, darf der User-Response nicht kippen.
    // Da der Aufruf mit "void" gemacht wird, wartet der Code nicht darauf.
    mockTriggerWebhooks.mockRejectedValue(new Error("Webhook ist down"));

    const res = await POST(createRequest(validBody));
    expect(res.status).toBe(201);
  });
});
