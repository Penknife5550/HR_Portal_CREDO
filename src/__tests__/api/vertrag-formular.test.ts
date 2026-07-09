/**
 * Tests fuer das oeffentliche Vorgesetzten-Formular:
 * /api/vertrag-formular/[token] (GET Vorbefuellung, POST Vorstand-Frage)
 */

const mockTx = {
  contractRenewalData: { upsert: jest.fn() },
  contractEndProcess: { update: jest.fn() },
  auditLog: { create: jest.fn() },
};
const mockPrisma = {
  contractEndProcess: { findFirst: jest.fn() },
  organization: { findMany: jest.fn() },
  $transaction: jest.fn(async (fn: (tx: typeof mockTx) => Promise<void>) => fn(mockTx)),
};

jest.mock("@/lib/db", () => ({ prisma: mockPrisma }));
jest.mock("@/lib/rate-limit", () => ({
  tokenRateLimiter: { check: () => ({ allowed: true }) },
  getClientIp: () => "127.0.0.1",
}));

import { GET, POST } from "@/app/api/vertrag-formular/[token]/route";
import { NextRequest } from "next/server";

const TOKEN = "test-token-1234567890";
const MS_PER_DAY = 86400000;

function getReq(): NextRequest {
  return new NextRequest(`http://localhost:3000/api/vertrag-formular/${TOKEN}`);
}
function postReq(body: Record<string, unknown>): NextRequest {
  return new NextRequest(`http://localhost:3000/api/vertrag-formular/${TOKEN}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
const params = () => Promise.resolve({ token: TOKEN });

function vorgang(overrides: Record<string, unknown> = {}) {
  return {
    id: "ce1",
    displayId: "VE-2026-GYM-001",
    status: "ANFRAGE_VORGESETZTER",
    decision: "OFFEN",
    employeeFirstName: "Max",
    employeeLastName: "Mustermann",
    contractStartDate: new Date("2025-01-01"),
    contractEndDate: new Date("2026-12-31"),
    supervisorToken: TOKEN,
    supervisorTokenExpiresAt: new Date(Date.now() + 10 * MS_PER_DAY),
    supervisorRespondedAt: null,
    supervisorDeclineReason: null,
    currentPosition: "Lehrer",
    currentEntgeltgruppe: "E13",
    currentStufe: "3",
    currentWochenstunden: 25.5,
    dokubitDaten: { probezeitDauer: "6", probezeitEinheit: "Monate" },
    organization: {
      id: "org1",
      name: "Gymnasium",
      mandantNumber: "712",
      contractEndFieldConfig: null,
    },
    renewalData: null,
    ...overrides,
  };
}

const UEBERNAHME_BODY = {
  decision: "UEBERNAHME",
  vertragsbeginn: "2027-01-01",
  wochenstunden: 25.5,
};

describe("GET /api/vertrag-formular/[token]", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.contractEndProcess.findFirst.mockResolvedValue(vorgang());
    mockPrisma.organization.findMany.mockResolvedValue([]);
  });

  it("liefert die Vorbefuellung aus current*-Feldern + DokuBit-Probezeit", async () => {
    const res = await GET(getReq(), { params: params() });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.vorbefuellung).toEqual(
      expect.objectContaining({
        wochenstunden: 25.5,
        entgeltgruppe: "E13",
        stufe: "3",
        stellenbeschreibung: "Lehrer",
        probezeitMonate: 6,
        vertragsbeginn: "2027-01-01", // Tag nach dem Vertragsende
      }),
    );
  });

  it("Vorbefuellung enthaelt KEINE Adress-/Geburtsdaten (Datenminimierung)", async () => {
    mockPrisma.contractEndProcess.findFirst.mockResolvedValue(
      vorgang({
        dokubitDaten: { strasse: "Musterweg 1", geburtsdatum: "1990-01-01", plz: "32425" },
      }),
    );
    const json = await (await GET(getReq(), { params: params() })).json();
    expect(JSON.stringify(json.vorbefuellung)).not.toContain("Musterweg");
    expect(JSON.stringify(json.vorbefuellung)).not.toContain("1990");
  });
});

describe("POST /api/vertrag-formular/[token] — Vorstand-Frage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.contractEndProcess.findFirst.mockResolvedValue(vorgang());
    mockTx.contractRenewalData.upsert.mockResolvedValue({});
    mockTx.contractEndProcess.update.mockResolvedValue({});
    mockTx.auditLog.create.mockResolvedValue({});
  });

  it("400 bei UEBERNAHME ohne Antwort auf die Vorstand-Frage", async () => {
    const res = await POST(postReq(UEBERNAHME_BODY), { params: params() });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("Vorstand");
    expect(mockTx.contractEndProcess.update).not.toHaveBeenCalled();
  });

  it("400 bei vorstandAbgestimmt=true ohne Vermerk", async () => {
    const res = await POST(
      postReq({ ...UEBERNAHME_BODY, vorstandAbgestimmt: true }),
      { params: params() },
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("Abstimmung");
  });

  it("speichert vorstandAbgestimmt=false (rot markiert, keine Blockade)", async () => {
    const res = await POST(
      postReq({ ...UEBERNAHME_BODY, vorstandAbgestimmt: false }),
      { params: params() },
    );
    expect(res.status).toBe(200);
    expect(mockTx.contractEndProcess.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "RUECKMELDUNG_UEBERNAHME",
          vorstandAbgestimmt: false,
          vorstandAbstimmungVermerk: null,
        }),
      }),
    );
  });

  it("speichert Ja + Vermerk und auditiert beides", async () => {
    const res = await POST(
      postReq({
        ...UEBERNAHME_BODY,
        vorstandAbgestimmt: true,
        vorstandAbstimmungVermerk: "Hr. Mustermann (Vorstand), 05.07.2026",
      }),
      { params: params() },
    );
    expect(res.status).toBe(200);
    expect(mockTx.contractEndProcess.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          vorstandAbgestimmt: true,
          vorstandAbstimmungVermerk: "Hr. Mustermann (Vorstand), 05.07.2026",
        }),
      }),
    );
    expect(mockTx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "SUPERVISOR_DECISION_UEBERNAHME",
          details: expect.objectContaining({ vorstandAbgestimmt: true }),
        }),
      }),
    );
  });

  it("keine Pflicht, wenn der Mandant das Feld ausgeblendet hat", async () => {
    mockPrisma.contractEndProcess.findFirst.mockResolvedValue(
      vorgang({
        organization: {
          id: "org1",
          name: "Gymnasium",
          mandantNumber: "712",
          contractEndFieldConfig: [
            { name: "vorstandAbstimmung", visible: false, required: false, label: "x" },
          ],
        },
      }),
    );
    const res = await POST(postReq(UEBERNAHME_BODY), { params: params() });
    expect(res.status).toBe(200);
  });

  it("KEINE_UEBERNAHME braucht keine Vorstand-Antwort", async () => {
    const res = await POST(
      postReq({ decision: "KEINE_UEBERNAHME", declineReason: "Stelle entfällt" }),
      { params: params() },
    );
    expect(res.status).toBe(200);
  });
});
