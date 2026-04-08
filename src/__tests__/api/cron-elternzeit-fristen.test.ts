/**
 * Tests fuer /api/cron/elternzeit-fristen (POST = Sammelmail Cron)
 * Fokus: Auth, Eskalations-Idempotenz, Webhook-Trigger.
 */

const mockPrisma = {
  elternzeitProzess: {
    findMany: jest.fn(),
  },
  elternzeitFrist: {
    findMany: jest.fn(),
    update: jest.fn(),
  },
};
const mockTriggerWebhooks = jest.fn();
const mockSyncElternzeitFristen = jest.fn();

jest.mock("@/lib/db", () => ({ prisma: mockPrisma }));
jest.mock("@/lib/webhooks", () => ({
  triggerWebhooks: mockTriggerWebhooks,
}));
jest.mock("@/lib/elternzeit-fristen", () => {
  const actual = jest.requireActual("@/lib/elternzeit-fristen");
  return {
    ...actual,
    syncElternzeitFristen: mockSyncElternzeitFristen,
  };
});

import { POST } from "@/app/api/cron/elternzeit-fristen/route";
import { NextRequest } from "next/server";

const TEST_SECRET = "test-cron-secret-1234567890ABCDEF";

function createRequest(authHeader?: string): NextRequest {
  return new NextRequest(
    "http://localhost:3000/api/cron/elternzeit-fristen",
    {
      method: "POST",
      headers: authHeader ? { Authorization: authHeader } : {},
    },
  );
}

describe("API /api/cron/elternzeit-fristen POST", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.CRON_SECRET = TEST_SECRET;
    mockPrisma.elternzeitProzess.findMany.mockResolvedValue([]);
    mockPrisma.elternzeitFrist.findMany.mockResolvedValue([]);
    mockPrisma.elternzeitFrist.update.mockResolvedValue({});
    mockSyncElternzeitFristen.mockResolvedValue(undefined);
    mockTriggerWebhooks.mockResolvedValue(undefined);
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  describe("Auth", () => {
    it("CRON_SECRET nicht gesetzt → 500", async () => {
      delete process.env.CRON_SECRET;
      const res = await POST(createRequest(`Bearer ${TEST_SECRET}`));
      expect(res.status).toBe(500);
    });

    it("CRON_SECRET zu kurz (< 24 Zeichen) → 500", async () => {
      process.env.CRON_SECRET = "kurz";
      const res = await POST(createRequest("Bearer kurz"));
      expect(res.status).toBe(500);
    });

    it("Korrektes Bearer-Token → 200", async () => {
      const res = await POST(createRequest(`Bearer ${TEST_SECRET}`));
      expect(res.status).toBe(200);
    });

    it("Falsches Token → 401", async () => {
      const res = await POST(createRequest("Bearer falsch-aber-lang-genug-1234"));
      expect(res.status).toBe(401);
    });

    it("Header fehlt → 401", async () => {
      const res = await POST(createRequest());
      expect(res.status).toBe(401);
    });
  });

  describe("Eskalations-Logik", () => {
    const baseFrist = {
      id: "frist-1",
      elternzeitId: "ez-1",
      fristTyp: "ANTRAGSFRIST_VORL",
      bezeichnung: "Test",
      beschreibung: null,
      faelligAm: new Date(Date.now() + 5 * 86400000), // in 5 Tagen → URGENT
      erledigtAm: null,
      letzteSeverity: null,
      letzteWarnungAm: null,
      elternzeit: {
        id: "ez-1",
        displayId: "EZ-001",
        employeeFirstName: "Anna",
        employeeLastName: "Test",
        employeeEmail: "anna@test.de",
        status: "ANGELEGT",
      },
    };

    it("Severity gestiegen (null → URGENT) → Webhook + Update", async () => {
      mockPrisma.elternzeitFrist.findMany.mockResolvedValue([baseFrist]);
      const res = await POST(createRequest(`Bearer ${TEST_SECRET}`));
      expect(res.status).toBe(200);
      expect(mockPrisma.elternzeitFrist.update).toHaveBeenCalledTimes(1);
      expect(mockTriggerWebhooks).toHaveBeenCalledWith(
        "elternzeit-frist-eskaliert",
        expect.objectContaining({ severity: "URGENT" }),
      );
    });

    it("Severity gleich (URGENT → URGENT) → kein Webhook (Idempotenz)", async () => {
      mockPrisma.elternzeitFrist.findMany.mockResolvedValue([
        { ...baseFrist, letzteSeverity: "URGENT" },
      ]);
      const res = await POST(createRequest(`Bearer ${TEST_SECRET}`));
      expect(res.status).toBe(200);
      expect(mockPrisma.elternzeitFrist.update).not.toHaveBeenCalled();
      expect(mockTriggerWebhooks).not.toHaveBeenCalled();
    });

    it("Eskalation INFO → URGENT → Webhook", async () => {
      mockPrisma.elternzeitFrist.findMany.mockResolvedValue([
        { ...baseFrist, letzteSeverity: "INFO" },
      ]);
      const res = await POST(createRequest(`Bearer ${TEST_SECRET}`));
      expect(res.status).toBe(200);
      expect(mockTriggerWebhooks).toHaveBeenCalled();
    });

    it("Severity gesunken (URGENT → INFO durch Termin-Verschiebung) → kein Webhook", async () => {
      mockPrisma.elternzeitFrist.findMany.mockResolvedValue([
        {
          ...baseFrist,
          letzteSeverity: "URGENT",
          faelligAm: new Date(Date.now() + 30 * 86400000), // INFO
        },
      ]);
      const res = await POST(createRequest(`Bearer ${TEST_SECRET}`));
      expect(res.status).toBe(200);
      expect(mockTriggerWebhooks).not.toHaveBeenCalled();
    });
  });

  describe("Fehler-Isolation", () => {
    it("Fehler in einer Eskalation bricht den Cron nicht ab", async () => {
      mockPrisma.elternzeitFrist.findMany.mockResolvedValue([
        {
          id: "frist-1",
          elternzeitId: "ez-1",
          fristTyp: "ANTRAGSFRIST_VORL",
          bezeichnung: "Test",
          beschreibung: null,
          faelligAm: new Date(Date.now() + 1 * 86400000),
          erledigtAm: null,
          letzteSeverity: null,
          letzteWarnungAm: null,
          elternzeit: {
            id: "ez-1",
            displayId: "EZ-001",
            employeeFirstName: "Anna",
            employeeLastName: "Test",
            employeeEmail: "a@b.de",
            status: "ANGELEGT",
          },
        },
        {
          id: "frist-2",
          elternzeitId: "ez-2",
          fristTyp: "BR_GENEHMIGUNG",
          bezeichnung: "Test 2",
          beschreibung: null,
          faelligAm: new Date(Date.now() + 1 * 86400000),
          erledigtAm: null,
          letzteSeverity: null,
          letzteWarnungAm: null,
          elternzeit: {
            id: "ez-2",
            displayId: "EZ-002",
            employeeFirstName: "Bob",
            employeeLastName: "Test",
            employeeEmail: "b@b.de",
            status: "ANGELEGT",
          },
        },
      ]);
      // Erste Update wirft, zweite ok
      mockPrisma.elternzeitFrist.update
        .mockRejectedValueOnce(new Error("DB-Fehler"))
        .mockResolvedValueOnce({});

      const res = await POST(createRequest(`Bearer ${TEST_SECRET}`));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.eskalationsFehler).toBe(1);
      expect(body.data.eskalationen).toBe(1);
    });
  });
});
