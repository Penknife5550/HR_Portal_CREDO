/**
 * Tests fuer den Erinnerungs-Cron: POST /api/cron/contract-end-reminders
 * Kern: Auth, Intervall-Staffelung nach Fristen-Ampel, Skip ausserhalb
 * des Vorlaufs, Zaehler-/Zeitstempel-Fortschreibung.
 */

const mockPrisma = {
  contractEndProcess: { findMany: jest.fn(), update: jest.fn() },
  auditLog: { create: jest.fn() },
};
const mockTriggerWebhooks = jest.fn();

jest.mock("@/lib/db", () => ({ prisma: mockPrisma }));
jest.mock("@/lib/webhooks", () => ({ triggerWebhooks: mockTriggerWebhooks }));
jest.mock("@/lib/url", () => ({ getBaseUrl: () => "http://localhost:3000" }));

import { POST } from "@/app/api/cron/contract-end-reminders/route";
import { NextRequest } from "next/server";

const SECRET = "test-cron-secret";
const MS_PER_DAY = 86400000;

function req(token: string | null = SECRET): NextRequest {
  return new NextRequest("http://localhost:3000/api/cron/contract-end-reminders", {
    method: "POST",
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

/** Basis-Vorgang: KRITISCH (Ende in ~45 Tagen), Anfrage vor `tageOffen` Tagen. */
function vorgang(overrides: Record<string, unknown> = {}) {
  const now = Date.now();
  return {
    id: "ce1",
    displayId: "VE-2026-GYM-001",
    employeeFirstName: "Max",
    employeeLastName: "Mustermann",
    supervisorEmail: "leitung@example.org",
    supervisorToken: "token-abc",
    supervisorLinkSentAt: new Date(now - 10 * MS_PER_DAY),
    lastSupervisorReminderAt: null,
    supervisorReminderCount: 0,
    contractEndDate: new Date(now + 45 * MS_PER_DAY), // ~2 Monate -> KRITISCH
    organization: { name: "Gymnasium" },
    ...overrides,
  };
}

describe("POST /api/cron/contract-end-reminders", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.CRON_SECRET = SECRET;
    mockPrisma.contractEndProcess.findMany.mockResolvedValue([]);
    mockPrisma.contractEndProcess.update.mockResolvedValue({});
    mockPrisma.auditLog.create.mockResolvedValue({});
    mockTriggerWebhooks.mockResolvedValue(undefined);
  });

  it("401 ohne/mit falschem Secret", async () => {
    expect((await POST(req(null))).status).toBe(401);
    expect((await POST(req("falsch"))).status).toBe(401);
  });

  it("erinnert bei KRITISCH nach >=3 Tagen ohne Antwort und schreibt Zaehler fort", async () => {
    mockPrisma.contractEndProcess.findMany.mockResolvedValue([vorgang()]);
    const res = await POST(req());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.reminders).toBe(1);

    expect(mockTriggerWebhooks).toHaveBeenCalledWith(
      "contract-end-supervisor-reminder",
      expect.objectContaining({
        supervisorEmail: "leitung@example.org",
        dringlichkeit: "Kritisch",
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
        data: expect.objectContaining({ action: "SUPERVISOR_REMINDER_SENT" }),
      }),
    );
  });

  it("ueberspringt, wenn die letzte Erinnerung juenger als das Intervall ist", async () => {
    mockPrisma.contractEndProcess.findMany.mockResolvedValue([
      vorgang({ lastSupervisorReminderAt: new Date(Date.now() - 1 * MS_PER_DAY) }),
    ]);
    const json = await (await POST(req())).json();
    expect(json.reminders).toBe(0);
    expect(json.skipped).toBe(1);
    expect(mockTriggerWebhooks).not.toHaveBeenCalled();
  });

  it("WARNUNG (3-6 Monate) erinnert erst nach 7 Tagen", async () => {
    const now = Date.now();
    mockPrisma.contractEndProcess.findMany.mockResolvedValue([
      // Ende in ~4 Monaten -> WARNUNG; Anfrage vor 5 Tagen -> unter 7-Tage-Intervall
      vorgang({
        contractEndDate: new Date(now + 120 * MS_PER_DAY),
        supervisorLinkSentAt: new Date(now - 5 * MS_PER_DAY),
      }),
    ]);
    const json = await (await POST(req())).json();
    expect(json.reminders).toBe(0);
    expect(json.skipped).toBe(1);
  });

  it("AUSSERHALB (>12 Monate) erinnert nie", async () => {
    mockPrisma.contractEndProcess.findMany.mockResolvedValue([
      vorgang({
        contractEndDate: new Date(Date.now() + 400 * MS_PER_DAY),
        supervisorLinkSentAt: new Date(Date.now() - 60 * MS_PER_DAY),
      }),
    ]);
    const json = await (await POST(req())).json();
    expect(json.reminders).toBe(0);
    expect(json.skipped).toBe(1);
    expect(mockTriggerWebhooks).not.toHaveBeenCalled();
  });

  it("Fehler bei EINEM Vorgang stoppt die anderen nicht", async () => {
    mockPrisma.contractEndProcess.findMany.mockResolvedValue([
      vorgang({ id: "ce-kaputt" }),
      vorgang({ id: "ce-ok", supervisorToken: "token-ok" }),
    ]);
    mockPrisma.contractEndProcess.update
      .mockRejectedValueOnce(new Error("DB kaputt"))
      .mockResolvedValue({});
    const json = await (await POST(req())).json();
    expect(json.errors).toBe(1);
    expect(json.reminders).toBe(1);
  });
});
