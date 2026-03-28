/**
 * Tests fuer /api/offboarding Route
 * Unit-Tests fuer Validierungslogik (ohne Datenbank)
 */

// Mocks muessen VOR dem Import definiert werden
const mockGetSession = jest.fn();
const mockPrisma = {
  offboardingProcess: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    count: jest.fn(),
    groupBy: jest.fn(),
    create: jest.fn(),
  },
  organization: {
    findUnique: jest.fn(),
  },
  checklistTemplate: {
    findFirst: jest.fn(),
  },
  offboardingExitData: {
    create: jest.fn(),
  },
  offboardingChecklistItem: {
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

import { POST, GET } from "@/app/api/offboarding/route";
import { NextRequest } from "next/server";

// Helper: NextRequest mit JSON-Body erstellen
function createRequest(
  method: string,
  body?: Record<string, unknown>,
  url = "http://localhost:3000/api/offboarding"
): NextRequest {
  if (method === "POST" && body) {
    return new NextRequest(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }
  return new NextRequest(url, { method });
}

// Gueltige Testdaten fuer POST
const validBody = {
  employeeEmail: "max.mustermann@credo.de",
  employeeFirstName: "Max",
  employeeLastName: "Mustermann",
  organizationId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  exitType: "KUENDIGUNG_ARBEITNEHMER",
  lastWorkingDay: "2025-12-31",
};

describe("API /api/offboarding", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSession.mockResolvedValue({ userId: "test-user-id" });
  });

  describe("POST – Validierung", () => {
    it("sollte 401 zurueckgeben wenn nicht authentifiziert", async () => {
      mockGetSession.mockResolvedValue(null);

      const req = createRequest("POST", validBody);
      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(401);
      expect(data.error).toBe("Nicht authentifiziert");
    });

    it("sollte 400 zurueckgeben wenn Pflichtfelder fehlen", async () => {
      const req = createRequest("POST", {
        employeeEmail: "test@example.com",
        // Alle anderen Pflichtfelder fehlen
      });
      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      // Zod gibt "Required" als Fehlermeldung fuer fehlende Felder
      expect(data.error).toBeDefined();
      expect(typeof data.error).toBe("string");
    });

    it("sollte 400 zurueckgeben bei ungueltiger E-Mail", async () => {
      const req = createRequest("POST", {
        ...validBody,
        employeeEmail: "keine-email",
      });
      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toContain("E-Mail");
    });

    it("sollte 400 zurueckgeben bei ungueltiger privater E-Mail", async () => {
      const req = createRequest("POST", {
        ...validBody,
        employeePrivateEmail: "ungueltig",
      });
      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toContain("E-Mail");
    });

    it("sollte 400 zurueckgeben bei ungueltigem exitType", async () => {
      const req = createRequest("POST", {
        ...validBody,
        exitType: "UNBEKANNTER_TYP",
      });
      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(400);
    });

    it("sollte 400 zurueckgeben bei ungueltiger organizationId (kein UUID)", async () => {
      const req = createRequest("POST", {
        ...validBody,
        organizationId: "kein-uuid",
      });
      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toContain("Einrichtungs-ID");
    });

    it("sollte 404 zurueckgeben wenn Organisation nicht existiert", async () => {
      mockPrisma.organization.findUnique.mockResolvedValue(null);

      const req = createRequest("POST", validBody);
      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(404);
      expect(data.error).toContain("Organisation nicht gefunden");
    });
  });

  describe("POST – DisplayId-Format", () => {
    it("sollte eine displayId im Format OFF-YYYY-XXX-NNN generieren", async () => {
      const mockOrg = {
        id: validBody.organizationId,
        name: "CREDO Gymnasium",
        shortName: "GYM",
        mandantNumber: "100",
        type: "GYMNASIUM",
      };

      mockPrisma.organization.findUnique.mockResolvedValue(mockOrg);
      mockPrisma.offboardingProcess.count.mockResolvedValue(5);
      mockPrisma.offboardingProcess.findUnique
        .mockResolvedValueOnce(null) // displayId existiert nicht -> OK
        .mockResolvedValueOnce({
          id: "created-id",
          displayId: `OFF-${new Date().getFullYear()}-GYM-006`,
          employeeEmail: validBody.employeeEmail,
          employeeFirstName: "Max",
          employeeLastName: "Mustermann",
          exitType: validBody.exitType,
          lastWorkingDay: new Date("2025-12-31"),
          organization: mockOrg,
        });
      mockPrisma.checklistTemplate.findFirst.mockResolvedValue(null);
      mockPrisma.$transaction.mockImplementation(
        async (fn: (tx: typeof mockPrisma) => Promise<unknown>) => {
          return fn(mockPrisma as unknown as typeof mockPrisma);
        }
      );
      mockPrisma.offboardingProcess.create.mockResolvedValue({
        id: "created-id",
        displayId: `OFF-${new Date().getFullYear()}-GYM-006`,
        employeeEmail: validBody.employeeEmail,
        employeeFirstName: "Max",
        employeeLastName: "Mustermann",
        exitType: validBody.exitType,
        lastWorkingDay: new Date("2025-12-31"),
        organization: mockOrg,
      });
      mockPrisma.offboardingExitData.create.mockResolvedValue({});
      mockPrisma.auditLog.create.mockResolvedValue({});
      mockTriggerWebhooks.mockResolvedValue(undefined);

      const req = createRequest("POST", validBody);
      const res = await POST(req);

      expect(res.status).toBe(201);

      // Pruefen, dass die displayId das richtige Format hat
      const createCall =
        mockPrisma.offboardingProcess.create.mock.calls[0][0];
      const generatedDisplayId = createCall.data.displayId;
      expect(generatedDisplayId).toMatch(/^OFF-\d{4}-[A-Z0-9]+-\d{3}$/);
    });
  });

  describe("GET – Authentifizierung", () => {
    it("sollte 401 zurueckgeben wenn nicht authentifiziert", async () => {
      mockGetSession.mockResolvedValue(null);

      const req = createRequest(
        "GET",
        undefined,
        "http://localhost:3000/api/offboarding"
      );
      const res = await GET(req);
      const data = await res.json();

      expect(res.status).toBe(401);
      expect(data.error).toBe("Nicht authentifiziert");
    });
  });
});
