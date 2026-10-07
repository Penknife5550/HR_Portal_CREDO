/**
 * Tests fuer Strang A: POST /api/contract-end/[id]/supervisor-link
 * Kern: Der Magic-Link geht per Mail an die Fuehrungskraft — die Antwort an HR
 * traegt weder den Token noch den fertigen Link.
 *
 * Seit 10/2026 zusaetzlich:
 *  - Nach der Antwort der Fuehrungskraft (RUECKMELDUNG_*) keine neue Anfrage;
 *    der Statuswechsel ist an den Status gebunden (gleichzeitige Antwort → 409).
 *  - Gesendet ist nur, was hinausging: FAILED → 502, SKIPPED → 409, beide mit
 *    `mailStatus`, und `supervisorLinkSentAt` geht zurueck auf null.
 */

import { ContractEndStatus } from "@prisma/client";

const mockGetSession = jest.fn();
const mockCanAccessProcess = jest.fn();
const mockPrisma = {
  contractEndProcess: { findUnique: jest.fn(), updateMany: jest.fn() },
  contractRenewalData: { upsert: jest.fn() },
  auditLog: { create: jest.fn() },
  webhookConfig: { count: jest.fn() },
  $transaction: jest.fn(),
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

function vorgang(overrides: Record<string, unknown> = {}) {
  return {
    id: "ce1",
    displayId: "VE-2026-GYM-001",
    organizationId: "org1",
    status: "ANGELEGT",
    supervisorLinkSentAt: null,
    employeeFirstName: "Max",
    employeeLastName: "Mustermann",
    contractEndDate: new Date("2026-12-31T00:00:00.000Z"),
    organization: { id: "org1", name: "Gymnasium", mandantNumber: "100" },
    ...overrides,
  };
}

/** Nach der Antwort der Fuehrungskraft und nach dem Ende des Strangs: 400. */
const GESPERRT = [
  "RUECKMELDUNG_UEBERNAHME",
  "RUECKMELDUNG_KEINE_UEBERNAHME",
  "ENTSCHEIDUNG_KEINE_UEBERNAHME",
  "VERTRAG_ERSTELLT",
  "VERTRAG_UNTERSCHRIEBEN",
  "ABGESCHLOSSEN",
  "STORNIERT",
];
/** Hier darf HR (erneut) anfragen. ENTSCHEIDUNG_UEBERNAHME = Alt-Bestand. */
const MOEGLICH = ["ANGELEGT", "ANFRAGE_VORGESETZTER", "ENTSCHEIDUNG_UEBERNAHME"];

/**
 * Die Rueckstellung „nicht zugestellt" — der zweite updateMany-Aufruf. Der
 * Standardvorgang steht auf ANGELEGT (erste Anfrage), also auch der Status.
 */
const RUECKSTELLUNG = {
  where: { id: "ce1", supervisorToken: mockToken },
  data: { supervisorLinkSentAt: null, status: "ANGELEGT" },
};

describe("POST /api/contract-end/[id]/supervisor-link", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSession.mockResolvedValue({ userId: "u1", role: "HR_LEITUNG" });
    mockCanAccessProcess.mockResolvedValue(true);
    mockPrisma.contractEndProcess.findUnique.mockResolvedValue(vorgang());
    mockPrisma.contractEndProcess.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.contractRenewalData.upsert.mockResolvedValue({});
    mockPrisma.auditLog.create.mockResolvedValue({});
    mockPrisma.webhookConfig.count.mockResolvedValue(0);
    mockPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(mockPrisma));
    mockTriggerWebhooks.mockResolvedValue({ status: "SENT", recipient: "leitung@example.org" });
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
      mailStatus: "SENT",
    });
  });

  it("der Link geht weiterhin per Mail an die Führungskraft", async () => {
    await POST(req(), { params: params() });

    expect(mockPrisma.contractEndProcess.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "ce1", status: { notIn: GESPERRT } },
        data: expect.objectContaining({
          supervisorEmail: "leitung@example.org",
          supervisorToken: mockToken,
          supervisorLinkSentAt: expect.any(Date),
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
    // Zugestellt: nichts wird zurueckgestellt
    expect(mockPrisma.contractEndProcess.updateMany).toHaveBeenCalledTimes(1);
  });

  // ---------- Befund 2: keine neue Anfrage nach der Antwort ----------

  it("die beiden Listen decken jeden Status des Moduls ab", () => {
    expect([...GESPERRT, ...MOEGLICH].sort()).toEqual(Object.values(ContractEndStatus).sort());
  });

  it.each(GESPERRT)("400 im Status %s — nichts geschrieben, keine Mail", async (status) => {
    mockPrisma.contractEndProcess.findUnique.mockResolvedValue(vorgang({ status }));
    const res = await POST(req(), { params: params() });

    expect(res.status).toBe(400);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockPrisma.contractEndProcess.updateMany).not.toHaveBeenCalled();
    expect(mockPrisma.contractRenewalData.upsert).not.toHaveBeenCalled();
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
    expect(mockTriggerWebhooks).not.toHaveBeenCalled();
  });

  it.each(["RUECKMELDUNG_UEBERNAHME", "RUECKMELDUNG_KEINE_UEBERNAHME"])(
    "%s: die Meldung sagt, dass die Führungskraft schon geantwortet hat (kein Statuscode im Text)",
    async (status) => {
      mockPrisma.contractEndProcess.findUnique.mockResolvedValue(vorgang({ status }));
      const json = await (await POST(req(), { params: params() })).json();

      expect(json.error).toContain("bereits geantwortet");
      expect(json.error).toContain("Seite neu");
      expect(json.error).not.toContain(status);
    },
  );

  it.each(MOEGLICH)("201 aus dem Status %s — neuer Link, alte Rückmeldung zurückgesetzt, Mail", async (status) => {
    mockPrisma.contractEndProcess.findUnique.mockResolvedValue(vorgang({ status }));
    const res = await POST(req(), { params: params() });

    expect(res.status).toBe(201);
    expect(mockPrisma.contractEndProcess.updateMany).toHaveBeenCalledWith({
      where: { id: "ce1", status: { notIn: GESPERRT } },
      data: expect.objectContaining({
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
    expect(mockPrisma.contractRenewalData.upsert).toHaveBeenCalledWith({
      where: { contractEndId: "ce1" },
      update: {},
      create: { contractEndId: "ce1" },
    });
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "SUPERVISOR_LINK_CREATED" }) }),
    );
    expect(mockTriggerWebhooks).toHaveBeenCalledTimes(1);
  });

  it("409, wenn die Führungskraft zwischen Prüfen und Speichern antwortet — nichts weiter geschrieben, keine Mail", async () => {
    // Gelesen: Anfrage offen. Beim Speichern ist der Status schon RUECKMELDUNG_*.
    mockPrisma.contractEndProcess.findUnique.mockResolvedValue(vorgang({ status: "ANFRAGE_VORGESETZTER" }));
    mockPrisma.contractEndProcess.updateMany.mockResolvedValueOnce({ count: 0 });

    const res = await POST(req(), { params: params() });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain("Seite neu");
    expect(mockPrisma.contractRenewalData.upsert).not.toHaveBeenCalled();
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
    expect(mockTriggerWebhooks).not.toHaveBeenCalled();
  });

  // ---------- Befund 1: gesendet ist nur, was hinausging ----------

  it("502 bei gescheitertem Versand: Anfrage gilt als nicht gesendet, Grund in der Meldung", async () => {
    mockTriggerWebhooks.mockResolvedValue({ status: "FAILED", detail: "connect ECONNREFUSED 10.0.0.1:587." });

    const res = await POST(req(), { params: params() });
    expect(res.status).toBe(502);
    const json = await res.json();

    expect(json.mailStatus).toBe("FAILED");
    expect(json.error).toContain("konnte nicht versendet werden: connect ECONNREFUSED 10.0.0.1:587.");
    expect(json.error).toContain("gilt als nicht gesendet");
    // Erste Anfrage: kein frueherer Link, also kein Satz darueber
    expect(json.error).not.toContain("zuvor versendete Link");
    expect(JSON.stringify(json)).not.toContain(mockToken);
    expect(mockPrisma.contractEndProcess.updateMany).toHaveBeenLastCalledWith(RUECKSTELLUNG);
  });

  it("bei erneuter Anfrage nennt die Meldung, dass der frühere Link nicht mehr gilt", async () => {
    mockPrisma.contractEndProcess.findUnique.mockResolvedValue(
      vorgang({ status: "ANFRAGE_VORGESETZTER", supervisorLinkSentAt: new Date("2026-09-01T08:00:00Z") }),
    );
    mockTriggerWebhooks.mockResolvedValue({ status: "FAILED", detail: "Timeout" });

    const json = await (await POST(req(), { params: params() })).json();
    expect(json.error).toContain("Der zuvor versendete Link gilt nicht mehr.");
    // Erneute Anfrage: Der Status bleibt ANFRAGE_VORGESETZTER, nur der Versand gilt nicht
    expect(mockPrisma.contractEndProcess.updateMany).toHaveBeenLastCalledWith({
      where: { id: "ce1", supervisorToken: mockToken },
      data: { supervisorLinkSentAt: null },
    });
  });

  it("409 bei deaktivierter Vorlage ohne Webhook: nicht gesendet, lesbarer Grund", async () => {
    mockTriggerWebhooks.mockResolvedValue({ status: "SKIPPED", detail: "E-Mail-Vorlage ist deaktiviert" });

    const res = await POST(req(), { params: params() });
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.mailStatus).toBe("SKIPPED");
    expect(json.error).toContain("Vorlage deaktiviert");
    expect(json.error).toContain("E-Mail-Vorlage");
    expect(mockPrisma.webhookConfig.count).toHaveBeenCalledWith({
      where: { event: "contract-end-supervisor-link", isActive: true },
    });
    expect(mockPrisma.contractEndProcess.updateMany).toHaveBeenLastCalledWith(RUECKSTELLUNG);
  });

  it("409 ohne Empfänger in der Vorlage — ohne Webhook-Abfrage", async () => {
    mockTriggerWebhooks.mockResolvedValue({ status: "SKIPPED", detail: "Kein Empfaenger konfiguriert" });

    const res = await POST(req(), { params: params() });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain("kein Empfänger in der E-Mail-Vorlage");
    expect(mockPrisma.webhookConfig.count).not.toHaveBeenCalled();
    expect(mockPrisma.contractEndProcess.updateMany).toHaveBeenLastCalledWith(RUECKSTELLUNG);
  });

  it("201 mit WEBHOOK, wenn die Vorlage aus ist und ein aktiver Webhook das Event übernimmt", async () => {
    mockTriggerWebhooks.mockResolvedValue({ status: "SKIPPED", detail: "E-Mail-Vorlage ist deaktiviert" });
    mockPrisma.webhookConfig.count.mockResolvedValue(1);

    const res = await POST(req(), { params: params() });
    expect(res.status).toBe(201);
    expect((await res.json()).mailStatus).toBe("WEBHOOK");
    expect(mockPrisma.contractEndProcess.updateMany).toHaveBeenCalledTimes(1);
  });

  it("kein Ergebnis vom Dispatcher zählt als nicht zugestellt (502)", async () => {
    mockTriggerWebhooks.mockResolvedValue(null);

    const res = await POST(req(), { params: params() });
    expect(res.status).toBe(502);
    expect(mockPrisma.contractEndProcess.updateMany).toHaveBeenLastCalledWith(RUECKSTELLUNG);
  });
});
