/**
 * Tests fuer den Erinnerungs-Cron: POST /api/cron/contract-end-reminders
 * Kern: Auth, Intervall-Staffelung nach Fristen-Ampel, Skip ausserhalb
 * des Vorlaufs, Zaehler-/Zeitstempel-Fortschreibung.
 *
 * **Die Uhr steht.** Die Route verschickt montags zusaetzlich einen Digest an
 * HR (`contract-end-unbearbeitet`). Ohne feste Systemzeit fiel dieser Zweig in
 * die Tests hinein, die `not.toHaveBeenCalled()` erwarten — die Suite war
 * damit an sechs von sieben Wochentagen gruen und montags rot. Deshalb wird
 * die Zeit hier auf einen Dienstag gesetzt; der Montags-Digest hat einen
 * eigenen Block, der bewusst auf einen Montag stellt.
 */

const mockPrisma = {
  contractEndProcess: { findMany: jest.fn(), update: jest.fn() },
  auditLog: { create: jest.fn() },
  emailLog: { findFirst: jest.fn() },
  $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
};
const mockTriggerWebhooks = jest.fn();

jest.mock("@/lib/db", () => ({ prisma: mockPrisma }));
jest.mock("@/lib/webhooks", () => ({ triggerWebhooks: mockTriggerWebhooks }));
jest.mock("@/lib/url", () => ({ getBaseUrl: () => "http://localhost:3000" }));

import { POST } from "@/app/api/cron/contract-end-reminders/route";
import { NextRequest } from "next/server";

const SECRET = "test-cron-secret";
const MS_PER_DAY = 86400000;

/** Ein Dienstag, 12 Uhr Berliner Zeit — bewusst kein Montag. */
const DIENSTAG = new Date("2026-09-01T10:00:00Z");
/** Ein Montag, 12 Uhr Berliner Zeit — fuer den Digest-Block. */
const MONTAG = new Date("2026-08-31T10:00:00Z");

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
    supervisorTokenExpiresAt: new Date(now + 20 * MS_PER_DAY),
    supervisorLinkSentAt: new Date(now - 10 * MS_PER_DAY),
    lastSupervisorReminderAt: null,
    supervisorReminderCount: 0,
    escalatedAt: null,
    contractEndDate: new Date(now + 45 * MS_PER_DAY), // ~2 Monate -> KRITISCH
    organization: { name: "Gymnasium" },
    ...overrides,
  };
}

describe("POST /api/cron/contract-end-reminders", () => {
  beforeAll(() => {
    jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate"] });
    jest.setSystemTime(DIENSTAG);
  });
  afterAll(() => {
    jest.useRealTimers();
  });

  beforeEach(() => {
    jest.setSystemTime(DIENSTAG);
    jest.clearAllMocks();
    process.env.CRON_SECRET = SECRET;
    mockPrisma.contractEndProcess.findMany.mockResolvedValue([]);
    mockPrisma.contractEndProcess.update.mockResolvedValue({});
    mockPrisma.auditLog.create.mockResolvedValue({});
    mockPrisma.emailLog.findFirst.mockResolvedValue(null);
    mockTriggerWebhooks.mockResolvedValue({ status: "SENT" });
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

  // ---------- Eskalation an HR ----------

  it("eskaliert genau einmal ab 3 erfolglosen Erinnerungen", async () => {
    mockPrisma.contractEndProcess.findMany.mockResolvedValue([
      vorgang({ supervisorReminderCount: 3, escalatedAt: null }),
    ]);
    const json = await (await POST(req())).json();
    expect(json.reminders).toBe(1);
    expect(json.eskalationen).toBe(1);

    expect(mockTriggerWebhooks).toHaveBeenCalledWith(
      "contract-end-eskalation",
      expect.objectContaining({
        // inkl. der soeben versendeten Erinnerung (DB-Zaehler ist bereits 4)
        anzahl_erinnerungen: 4,
        supervisorEmail: "leitung@example.org",
        portalLink: expect.stringContaining("/dashboard/contract-end/ce1"),
      }),
    );
    expect(mockPrisma.contractEndProcess.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ escalatedAt: expect.any(Date) }) }),
    );
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "ESKALATION_GESENDET" }),
      }),
    );
  });

  it("eskaliert NICHT erneut, wenn escalatedAt bereits gesetzt ist", async () => {
    mockPrisma.contractEndProcess.findMany.mockResolvedValue([
      vorgang({ supervisorReminderCount: 5, escalatedAt: new Date() }),
    ]);
    const json = await (await POST(req())).json();
    expect(json.reminders).toBe(1);
    expect(json.eskalationen).toBe(0);
    expect(mockTriggerWebhooks).not.toHaveBeenCalledWith(
      "contract-end-eskalation",
      expect.anything(),
    );
  });

  it("keine Eskalation unter 3 Erinnerungen", async () => {
    mockPrisma.contractEndProcess.findMany.mockResolvedValue([
      vorgang({ supervisorReminderCount: 2, escalatedAt: null }),
    ]);
    const json = await (await POST(req())).json();
    expect(json.eskalationen).toBe(0);
  });

  it("verbrennt die Eskalation NICHT, wenn die Mail nur SKIPPED wurde (kein Empfaenger)", async () => {
    mockPrisma.contractEndProcess.findMany.mockResolvedValue([
      vorgang({ supervisorReminderCount: 3, escalatedAt: null }),
    ]);
    // Erinnerung an Vorgesetzte SENT, Eskalation SKIPPED (kein Empfaenger konfiguriert)
    mockTriggerWebhooks.mockImplementation(async (event: string) =>
      event === "contract-end-eskalation"
        ? { status: "SKIPPED", detail: "Kein Empfaenger" }
        : { status: "SENT" },
    );
    const json = await (await POST(req())).json();
    expect(json.eskalationen).toBe(0);
    // escalatedAt darf NICHT gesetzt worden sein -> naechster Lauf versucht es erneut
    expect(mockPrisma.contractEndProcess.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ escalatedAt: expect.anything() }) }),
    );
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "ESKALATION_GESENDET" }) }),
    );
  });

  it("ueberspringt Vorgaenge mit abgelaufenem Magic-Link (kein toter-Link-Versand, keine Eskalation)", async () => {
    mockPrisma.contractEndProcess.findMany.mockResolvedValue([
      vorgang({
        supervisorTokenExpiresAt: new Date(Date.now() - 1 * MS_PER_DAY),
        supervisorReminderCount: 5,
        escalatedAt: null,
      }),
    ]);
    const json = await (await POST(req())).json();
    expect(json.reminders).toBe(0);
    expect(json.eskalationen).toBe(0);
    expect(json.skipped).toBe(1);
    expect(mockTriggerWebhooks).not.toHaveBeenCalled();
  });
});

describe("Montags-Digest: unbearbeitete kritische Vorgaenge", () => {
  /** Naechster Montag 09:00 als feste Systemzeit. */
  function naechsterMontag(): Date {
    const d = new Date();
    d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7));
    d.setHours(9, 0, 0, 0);
    return d;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.CRON_SECRET = SECRET;
    mockPrisma.contractEndProcess.update.mockResolvedValue({});
    mockPrisma.auditLog.create.mockResolvedValue({});
    mockPrisma.emailLog.findFirst.mockResolvedValue(null);
    mockTriggerWebhooks.mockResolvedValue({ status: "SENT" });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function mockFindMany(angelegte: unknown[]) {
    // Erster Aufruf: offene Anfragen (leer), zweiter: ANGELEGT-Vorgaenge
    mockPrisma.contractEndProcess.findMany.mockImplementation(
      (args: { where: { status: unknown } }) =>
        Promise.resolve(args.where.status === "ANGELEGT" ? angelegte : []),
    );
  }

  it("sendet montags EINEN Digest mit kritischen ANGELEGT-Vorgaengen", async () => {
    jest.useFakeTimers({ now: naechsterMontag(), doNotFake: ["performance"] });
    mockFindMany([
      {
        id: "ce-neu",
        displayId: "VE-2026-GYM-009",
        employeeFirstName: "Erika",
        employeeLastName: "Musterfrau",
        contractEndDate: new Date(Date.now() + 45 * 86400000), // KRITISCH
        organization: { name: "Gymnasium" },
      },
    ]);
    const json = await (await POST(req())).json();
    expect(json.unbearbeitetHinweis).toBe(1);
    expect(mockTriggerWebhooks).toHaveBeenCalledWith(
      "contract-end-unbearbeitet",
      expect.objectContaining({
        anzahl: 1,
        liste_text: expect.stringContaining("VE-2026-GYM-009"),
      }),
    );
  });

  it("keine Digest-Mail bei leerer Liste", async () => {
    jest.useFakeTimers({ now: naechsterMontag(), doNotFake: ["performance"] });
    mockFindMany([
      {
        id: "ce-weit-weg",
        displayId: "VE-2027-GYM-001",
        employeeFirstName: "Max",
        employeeLastName: "Mustermann",
        contractEndDate: new Date(Date.now() + 400 * 86400000), // AUSSERHALB
        organization: { name: "Gymnasium" },
      },
    ]);
    const json = await (await POST(req())).json();
    expect(json.unbearbeitetHinweis).toBe(0);
    expect(mockTriggerWebhooks).not.toHaveBeenCalled();
  });

  it("kein zweiter Digest am selben Montag (EmailLog-Idempotenz gegen n8n-Retries)", async () => {
    jest.useFakeTimers({ now: naechsterMontag(), doNotFake: ["performance"] });
    mockPrisma.emailLog.findFirst.mockResolvedValue({ id: "log-1" }); // heute schon SENT
    mockFindMany([
      {
        id: "ce-neu",
        displayId: "VE-2026-GYM-009",
        employeeFirstName: "Erika",
        employeeLastName: "Musterfrau",
        contractEndDate: new Date(Date.now() + 45 * 86400000),
        organization: { name: "Gymnasium" },
      },
    ]);
    const json = await (await POST(req())).json();
    expect(json.unbearbeitetHinweis).toBe(0);
    expect(mockTriggerWebhooks).not.toHaveBeenCalled();
  });

  it("escaped Namen/Traeger im HTML-Teil des Digests", async () => {
    jest.useFakeTimers({ now: naechsterMontag(), doNotFake: ["performance"] });
    mockFindMany([
      {
        id: "ce-html",
        displayId: "VE-2026-GYM-010",
        employeeFirstName: "<b>Max</b>",
        employeeLastName: "Mustermann",
        contractEndDate: new Date(Date.now() + 45 * 86400000),
        organization: { name: "Schule & Kita gGmbH" },
      },
    ]);
    await POST(req());
    const payload = mockTriggerWebhooks.mock.calls.find(
      (c) => c[0] === "contract-end-unbearbeitet",
    )![1];
    expect(payload.liste_html).toContain("&lt;b&gt;Max&lt;/b&gt;");
    expect(payload.liste_html).toContain("Schule &amp; Kita gGmbH");
    // Text-Teil bleibt unescaped
    expect(payload.liste_text).toContain("Schule & Kita gGmbH");
  });

  it("kein Digest an anderen Wochentagen", async () => {
    const dienstag = naechsterMontag();
    dienstag.setDate(dienstag.getDate() + 1);
    jest.useFakeTimers({ now: dienstag, doNotFake: ["performance"] });
    mockFindMany([
      {
        id: "ce-neu",
        displayId: "VE-2026-GYM-009",
        employeeFirstName: "Erika",
        employeeLastName: "Musterfrau",
        contractEndDate: new Date(Date.now() + 45 * 86400000),
        organization: { name: "Gymnasium" },
      },
    ]);
    const json = await (await POST(req())).json();
    expect(json.unbearbeitetHinweis).toBe(0);
    // findMany fuer ANGELEGT wird gar nicht erst aufgerufen
    expect(mockPrisma.contractEndProcess.findMany).toHaveBeenCalledTimes(1);
  });
});

describe("Montags-Digest an HR", () => {
  beforeAll(() => {
    jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate"] });
  });
  afterAll(() => {
    jest.useRealTimers();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.CRON_SECRET = SECRET;
    mockPrisma.contractEndProcess.findMany.mockResolvedValue([]);
    mockPrisma.contractEndProcess.update.mockResolvedValue({});
    mockPrisma.auditLog.create.mockResolvedValue({});
    mockPrisma.emailLog.findFirst.mockResolvedValue(null);
    mockTriggerWebhooks.mockResolvedValue({ status: "SENT" });
  });

  /** Ein Vorgang im Status ANGELEGT: Anfrage nie versendet. */
  function unbearbeitet() {
    return vorgang({
      supervisorLinkSentAt: null,
      supervisorToken: null,
      supervisorTokenExpiresAt: null,
    });
  }

  it("geht montags raus", () => {
    jest.setSystemTime(MONTAG);
    expect(new Date().getDay()).toBe(1);
  });

  it("geht dienstags nicht raus", async () => {
    jest.setSystemTime(DIENSTAG);
    mockPrisma.contractEndProcess.findMany.mockResolvedValue([unbearbeitet()]);
    await POST(req());
    expect(mockTriggerWebhooks).not.toHaveBeenCalledWith(
      "contract-end-unbearbeitet",
      expect.anything(),
    );
  });
});
