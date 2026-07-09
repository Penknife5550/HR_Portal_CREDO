/**
 * Tests fuer den n8n-Webhook-Eingang: POST /api/webhooks/contract-end
 * Kern: Auth (CRON_SECRET), Anlage, Idempotenz (B8), Update bei
 * Vertragsaenderung (B9), Mehrfach-Erkennung, Batch-Fehlertoleranz.
 */

const mockPrisma = {
  organization: { findUnique: jest.fn() },
  contractEndProcess: { findFirst: jest.fn(), update: jest.fn() },
  employee: { findUnique: jest.fn() },
  auditLog: { create: jest.fn() },
  $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
};
const mockCreateContractEnd = jest.fn();

jest.mock("@/lib/db", () => ({ prisma: mockPrisma }));
jest.mock("@/lib/contract-end", () => ({
  createContractEndProcess: mockCreateContractEnd,
}));

import { POST } from "@/app/api/webhooks/contract-end/route";
import { NextRequest } from "next/server";

const SECRET = "test-cron-secret";

function req(body: unknown, token: string | null = SECRET): NextRequest {
  return new NextRequest("http://localhost:3000/api/webhooks/contract-end", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

const ORG = { id: "org1", name: "Gymnasium", shortName: "GYM", mandantNumber: "712" };

const EINTRAG = {
  personalNr: "12345",
  vorname: "Max",
  nachname: "Mustermann",
  email: "max@example.org",
  mandantNummer: "712",
  vertragsende: "2026-12-31",
  vertragsbeginn: "2025-01-01",
};

describe("POST /api/webhooks/contract-end", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.CRON_SECRET = SECRET;
    mockPrisma.organization.findUnique.mockResolvedValue(ORG);
    mockPrisma.contractEndProcess.findFirst.mockResolvedValue(null);
    mockPrisma.employee.findUnique.mockResolvedValue(null);
    mockPrisma.contractEndProcess.update.mockResolvedValue({});
    mockPrisma.auditLog.create.mockResolvedValue({});
    mockCreateContractEnd.mockResolvedValue({ id: "ce1", displayId: "VE-2026-GYM-001" });
  });

  // ---------- Auth ----------

  it("401 ohne Authorization-Header", async () => {
    const res = await POST(req(EINTRAG, null));
    expect(res.status).toBe(401);
    expect(mockCreateContractEnd).not.toHaveBeenCalled();
  });

  it("401 bei falschem Secret", async () => {
    const res = await POST(req(EINTRAG, "falsches-secret"));
    expect(res.status).toBe(401);
  });

  it("500 wenn CRON_SECRET nicht konfiguriert ist", async () => {
    delete process.env.CRON_SECRET;
    const res = await POST(req(EINTRAG));
    expect(res.status).toBe(500);
  });

  // ---------- Anlage ----------

  it("legt einen neuen Vorgang an (source N8N) inkl. Vorausfuell-Feldern", async () => {
    const res = await POST(
      req({
        ...EINTRAG,
        aktuellePosition: "Lehrer",
        aktuelleEntgeltgruppe: "E13",
        aktuelleWochenstunden: 25.5,
        befristungsart: "SACHGRUNDLOS",
        bisherigeBefristungMonate: 12,
        bisherigeVerlaengerungen: 1,
      }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.summary).toEqual({ angelegt: 1, aktualisiert: 0, unveraendert: 0, fehler: 0 });
    expect(json.results[0].displayId).toBe("VE-2026-GYM-001");

    expect(mockCreateContractEnd).toHaveBeenCalledTimes(1);
    const arg = mockCreateContractEnd.mock.calls[0][0];
    expect(arg.source).toBe("N8N");
    expect(arg.employeePersonalNr).toBe("12345");
    expect(arg.currentPosition).toBe("Lehrer");
    expect(arg.currentEntgeltgruppe).toBe("E13");
    expect(arg.currentWochenstunden).toBe(25.5);
    expect(arg.befristungsart).toBe("SACHGRUNDLOS");
    expect(arg.bisherigeBefristungMonate).toBe(12);
  });

  it("verknuepft die Personalakte per Personalnummer, wenn vorhanden", async () => {
    mockPrisma.employee.findUnique.mockResolvedValue({ id: "emp1" });
    await POST(req(EINTRAG));
    expect(mockPrisma.employee.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { personalNumber: "12345" } }),
    );
    expect(mockCreateContractEnd.mock.calls[0][0].employeeId).toBe("emp1");
  });

  it("Eintrag-Fehler bei unbekanntem Mandanten (kein Abbruch)", async () => {
    mockPrisma.organization.findUnique.mockResolvedValue(null);
    const res = await POST(req(EINTRAG));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.results[0].status).toBe("fehler");
    expect(json.results[0].fehler).toContain("712");
    expect(mockCreateContractEnd).not.toHaveBeenCalled();
  });

  // ---------- Idempotenz (B8) ----------

  it("meldet 'unveraendert' bei offenem Vorgang mit gleichem Vertragsende", async () => {
    mockPrisma.contractEndProcess.findFirst.mockResolvedValue({
      id: "ce-alt",
      displayId: "VE-2026-GYM-007",
      contractEndDate: new Date("2026-12-31"),
    });
    const res = await POST(req(EINTRAG));
    const json = await res.json();
    expect(json.summary.unveraendert).toBe(1);
    expect(json.results[0].displayId).toBe("VE-2026-GYM-007");
    expect(mockCreateContractEnd).not.toHaveBeenCalled();
    // kein B9-Update (Transaktion) noetig
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("frischt beim idempotenten Treffer die Vorausfuell-Felder auf", async () => {
    mockPrisma.contractEndProcess.findFirst.mockResolvedValue({
      id: "ce-alt",
      displayId: "VE-2026-GYM-007",
      contractEndDate: new Date("2026-12-31"),
    });
    await POST(req({ ...EINTRAG, aktuelleStufe: "3" }));
    expect(mockPrisma.contractEndProcess.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "ce-alt" },
        data: expect.objectContaining({ currentStufe: "3" }),
      }),
    );
  });

  it("dedupliziert per Personalnummer im selben Mandanten", async () => {
    mockPrisma.contractEndProcess.findFirst.mockResolvedValue({
      id: "ce-alt",
      displayId: "VE-2026-GYM-007",
      contractEndDate: new Date("2026-12-31"),
    });
    await POST(req(EINTRAG));
    expect(mockPrisma.contractEndProcess.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: "org1",
          employeePersonalNr: "12345",
          status: { notIn: ["ABGESCHLOSSEN", "STORNIERT"] },
        }),
      }),
    );
  });

  it("legt NEU an, wenn nur abgeschlossene Vorgaenge existieren (neue Befristung)", async () => {
    // findFirst filtert Endstadien bereits aus -> liefert null
    mockPrisma.contractEndProcess.findFirst.mockResolvedValue(null);
    const res = await POST(req(EINTRAG));
    const json = await res.json();
    expect(json.summary.angelegt).toBe(1);
    expect(mockCreateContractEnd).toHaveBeenCalledTimes(1);
  });

  // ---------- Vertragsaenderung (B9) ----------

  it("aktualisiert das Vertragsende statt neu anzulegen und auditiert", async () => {
    mockPrisma.contractEndProcess.findFirst.mockResolvedValue({
      id: "ce-alt",
      displayId: "VE-2026-GYM-007",
      contractEndDate: new Date("2026-08-31"),
    });
    const res = await POST(req(EINTRAG)); // neues Ende: 2026-12-31
    const json = await res.json();
    expect(json.summary.aktualisiert).toBe(1);
    expect(mockCreateContractEnd).not.toHaveBeenCalled();

    expect(mockPrisma.contractEndProcess.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "ce-alt" },
        data: expect.objectContaining({ contractEndDate: new Date("2026-12-31") }),
      }),
    );
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "CONTRACT_END_UPDATED_BY_WEBHOOK",
          contractEndId: "ce-alt",
        }),
      }),
    );
  });

  // ---------- Mehrfach-Erkennung ----------

  it("markiert Mehrfacheinstellung und haelt sie im Audit fest", async () => {
    const res = await POST(req({ ...EINTRAG, personalMandanten: ["712", "737"] }));
    const json = await res.json();
    expect(json.results[0].mehrfach).toBe(true);
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "CONTRACT_END_MEHRFACH_ERKANNT" }),
      }),
    );
  });

  it("kein Mehrfach-Flag bei nur einer Mandanten-Zuordnung", async () => {
    const res = await POST(req({ ...EINTRAG, personalMandanten: ["712"] }));
    const json = await res.json();
    expect(json.results[0].mehrfach).toBe(false);
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });

  // ---------- Batch ----------

  it("verarbeitet einen Batch und laesst kaputte Zeilen den Rest nicht stoppen", async () => {
    const res = await POST(
      req([
        EINTRAG,
        { vorname: "Kaputt" }, // unvollstaendig -> Validierungsfehler
        { ...EINTRAG, personalNr: "99999", vorname: "Erika", nachname: "Musterfrau" },
      ]),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.summary).toEqual({ angelegt: 2, aktualisiert: 0, unveraendert: 0, fehler: 1 });
    expect(json.results[1].status).toBe("fehler");
    expect(mockCreateContractEnd).toHaveBeenCalledTimes(2);
  });

  it("400 bei leerem Batch und bei ueberschrittener Batch-Groesse", async () => {
    expect((await POST(req([]))).status).toBe(400);
    const zuViele = Array.from({ length: 201 }, () => EINTRAG);
    expect((await POST(req(zuViele))).status).toBe(400);
  });

  it("400 bei unlesbarem Body", async () => {
    const bad = new NextRequest("http://localhost:3000/api/webhooks/contract-end", {
      method: "POST",
      headers: { authorization: `Bearer ${SECRET}` },
      body: "kein json",
    });
    expect((await POST(bad)).status).toBe(400);
  });
});
