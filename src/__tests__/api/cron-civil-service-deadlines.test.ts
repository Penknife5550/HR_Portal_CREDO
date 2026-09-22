/**
 * Tests fuer /api/cron/civil-service-deadlines (POST = Sammelmail Cron)
 * Fokus: Auth, leerer Branch, topSeverity-Aggregation, truncated-Flag
 */

const mockPrisma = {
  civilServiceDocument: {
    findMany: jest.fn(),
    update: jest.fn(),
  },
  civilServiceProcess: {
    findMany: jest.fn(),
  },
  civilServiceChecklistItem: {
    updateMany: jest.fn(),
  },
};
const mockTriggerWebhooks = jest.fn();

jest.mock("@/lib/db", () => ({
  prisma: mockPrisma,
}));
jest.mock("@/lib/webhooks", () => ({
  triggerWebhooks: mockTriggerWebhooks,
}));

import { POST } from "@/app/api/cron/civil-service-deadlines/route";
import { NextRequest } from "next/server";

function createRequest(authHeader?: string): NextRequest {
  return new NextRequest(
    "http://localhost:3000/api/cron/civil-service-deadlines",
    {
      method: "POST",
      headers: authHeader ? { Authorization: authHeader } : {},
    }
  );
}

const TEST_SECRET = "test-cron-secret-1234567890";

describe("API /api/cron/civil-service-deadlines POST", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.CRON_SECRET = TEST_SECRET;
    mockPrisma.civilServiceDocument.findMany.mockResolvedValue([]);
    mockPrisma.civilServiceProcess.findMany.mockResolvedValue([]);
    mockPrisma.civilServiceChecklistItem.updateMany.mockResolvedValue({
      count: 0,
    });
    mockTriggerWebhooks.mockResolvedValue(undefined);
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  describe("Auth", () => {
    it("sollte 500 zurueckgeben wenn CRON_SECRET nicht gesetzt", async () => {
      delete process.env.CRON_SECRET;
      const res = await POST(createRequest(`Bearer ${TEST_SECRET}`));
      expect(res.status).toBe(500);
    });

    it("sollte 401 ohne Authorization-Header", async () => {
      const res = await POST(createRequest());
      expect(res.status).toBe(401);
    });

    it("sollte 401 bei falschem Bearer-Token", async () => {
      const res = await POST(createRequest("Bearer falsches-secret-1234567890"));
      expect(res.status).toBe(401);
    });

    it("sollte 200 bei korrektem Bearer-Token", async () => {
      const res = await POST(createRequest(`Bearer ${TEST_SECRET}`));
      expect(res.status).toBe(200);
    });
  });

  describe("Webhook-Trigger", () => {
    it("sollte KEIN Webhook feuern wenn keine Warnungen", async () => {
      const res = await POST(createRequest(`Bearer ${TEST_SECRET}`));
      expect(res.status).toBe(200);
      expect(mockTriggerWebhooks).not.toHaveBeenCalled();
    });

    it("sollte Webhook feuern wenn Warnungen vorhanden", async () => {
      // Eine abgelaufene Amtsarzt-Untersuchung erzeugt eine OVERDUE-Warnung
      mockPrisma.civilServiceDocument.findMany.mockImplementation(
        async ({ where }: { where: { documentType?: unknown } }) => {
          if (
            where.documentType &&
            typeof where.documentType === "object" &&
            "in" in where.documentType
          ) {
            // amtsarzt-Block
            return [
              {
                id: "doc-1",
                documentType: "AMTSARZT_PROBE",
                expiresAt: new Date(Date.now() - 10 * 86400000), // vor 10 Tagen abgelaufen
                process: {
                  id: "psi-1",
                  displayId: "PSI-2026-FES-001",
                  employeeFirstName: "Anna",
                  employeeLastName: "Lehrerin",
                },
              },
            ];
          }
          return []; // br-genehmigung-Block
        }
      );
      mockPrisma.civilServiceDocument.update.mockResolvedValue({});

      const res = await POST(createRequest(`Bearer ${TEST_SECRET}`));
      expect(res.status).toBe(200);
      expect(mockTriggerWebhooks).toHaveBeenCalledTimes(1);

      const [event, payload] = mockTriggerWebhooks.mock.calls[0];
      expect(event).toBe("psi-deadline-warning");
      expect(payload).toMatchObject({
        topSeverity: "OVERDUE",
        bySeverity: { OVERDUE: 1, URGENT: 0, WARNING: 0 },
        totalWarnings: 1,
        shownWarnings: 1,
        truncated: false,
        omittedCount: 0,
      });
      expect(Array.isArray(payload.warnings)).toBe(true);
      expect(payload.warnings).toHaveLength(1);
    });

    it("liefert der Mail die einzelnen Hinweise — dringendste zuerst, maskiert und mit deutscher Stufe", async () => {
      // Zwei Hinweise aus verschiedenen Pruefungen: Die Vorwarnung (Amtsarzt,
      // Block A) entsteht im Cron VOR der ueberfaelligen BR-Genehmigung
      // (Block D). In der Mail muss die Ueberfaellige trotzdem oben stehen.
      mockPrisma.civilServiceDocument.findMany.mockImplementation(
        async ({ where }: { where: { documentType?: unknown } }) => {
          if (
            where.documentType &&
            typeof where.documentType === "object" &&
            "in" in where.documentType
          ) {
            return [
              {
                id: "doc-a",
                documentType: "AMTSARZT_PROBE",
                expiresAt: new Date(Date.now() + 45 * 86400000),
                process: {
                  id: "psi-a",
                  displayId: "PSI-2026-FES-001",
                  employeeFirstName: "Anna",
                  employeeLastName: "<Lehrerin>",
                },
              },
            ];
          }
          return [
            {
              id: "doc-br",
              documentType: "BR_ANTRAG_PROBE",
              uploadedAt: new Date(Date.now() - 70 * 86400000),
              process: {
                id: "psi-b",
                displayId: "PSI-2026-FES-002",
                employeeFirstName: "Bernd",
                employeeLastName: "Beispiel",
                documents: [],
              },
            },
          ];
        }
      );

      const res = await POST(createRequest(`Bearer ${TEST_SECRET}`));
      expect(res.status).toBe(200);

      const payload = mockTriggerWebhooks.mock.calls[0][1];
      expect(payload.warnings.map((w: { displayId: string }) => w.displayId)).toEqual([
        "PSI-2026-FES-002",
        "PSI-2026-FES-001",
      ]);
      expect(payload).toMatchObject({
        topSeverity: "OVERDUE",
        hoechste_dringlichkeit: "Überfällig",
        anzahl_vorgaenge: 2,
        anzahl_ueberfaellig: 1,
        anzahl_vorwarnung: 1,
        weitere_warnungen: "",
      });
      const zeilen = payload.warnungen_liste.split("\n");
      expect(zeilen[0]).toMatch(/^- \[Überfällig\] PSI-2026-FES-002 · Bernd Beispiel: BR-Genehmigung überfällig\. BR-Antrag eingereicht am \d{2}\.\d{2}\.\d{4}/);
      expect(payload.warnungen_liste).toContain("[Vorwarnung] PSI-2026-FES-001 · Anna <Lehrerin>");
      expect(payload.warnungen_liste_html).toContain("Anna &lt;Lehrerin&gt;");
      expect(payload.warnungen_liste_html).toContain("/dashboard/civil-service/psi-b");
    });

    it("sollte truncated=true setzen wenn mehr als 50 Warnungen", async () => {
      // 60 abgelaufene Amtsarzt-Dokumente erzeugen 60 OVERDUE-Warnungen
      const fakeDocs = Array.from({ length: 60 }, (_, i) => ({
        id: `doc-${i}`,
        documentType: "AMTSARZT_PROBE",
        expiresAt: new Date(Date.now() - 10 * 86400000),
        process: {
          id: `psi-${i}`,
          displayId: `PSI-2026-FES-${String(i + 1).padStart(3, "0")}`,
          employeeFirstName: "Anna",
          employeeLastName: `Nr${i}`,
        },
      }));
      mockPrisma.civilServiceDocument.findMany.mockImplementation(
        async ({ where }: { where: { documentType?: unknown } }) => {
          if (
            where.documentType &&
            typeof where.documentType === "object" &&
            "in" in where.documentType
          ) {
            return fakeDocs;
          }
          return [];
        }
      );
      mockPrisma.civilServiceDocument.update.mockResolvedValue({});

      const res = await POST(createRequest(`Bearer ${TEST_SECRET}`));
      expect(res.status).toBe(200);

      const payload = mockTriggerWebhooks.mock.calls[0][1];
      expect(payload.totalWarnings).toBe(60);
      expect(payload.shownWarnings).toBe(50);
      expect(payload.truncated).toBe(true);
      expect(payload.omittedCount).toBe(10);
      expect(payload.warnings).toHaveLength(50);
    });
  });
});
