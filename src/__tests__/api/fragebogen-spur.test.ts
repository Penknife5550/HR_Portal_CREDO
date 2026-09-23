/**
 * Tests: die Fragebogen-Spur in GET und PUT /api/fragebogen/[token]
 *
 * Zwei Stellen aus Paket 1 (parallele Spuren), die sonst kein Test erreicht:
 *
 * 1. GET liefert `mitarbeiterAbgesendet`. An diesem Feld — nicht am Status —
 *    entscheidet die Seite, ob sie die Karte „bereits eingereicht" zeigt
 *    (src/app/fragebogen/[token]/page.tsx). Fehlt es oder folgt es wieder dem
 *    Status, sieht Anna nach der Abgabe der Fuehrungskraft „bereits
 *    eingereicht", obwohl ihr Fragebogen bei Schritt 4 steht.
 * 2. PUT wechselt INVITED → IN_PROGRESS nur BEDINGT (`updateMany` mit
 *    `status: "INVITED", submittedAt: null`). Das ist die eine erlaubte
 *    Ausnahme von „Status nie direkt setzen" (CLAUDE.md). Ein Rueckbau auf das
 *    fruehere unbedingte `update` schriebe IN_PROGRESS ueber eine parallele
 *    Abgabe (Lost Update) — die drei uebrigen PUT-Suiten stehen alle auf
 *    IN_PROGRESS und fuehren den Zweig nie aus.
 */

const mockPrisma = {
  onboardingProcess: { update: jest.fn(), updateMany: jest.fn() },
  personalData: { findUnique: jest.fn(), upsert: jest.fn() },
  formTemplate: { findUnique: jest.fn() },
  child: { deleteMany: jest.fn(), createMany: jest.fn() },
  beschaeftigungsAngabe: { deleteMany: jest.fn(), create: jest.fn() },
  $transaction: jest.fn(),
};
const mockValidate = jest.fn();

jest.mock("@/lib/db", () => ({ prisma: mockPrisma }));
jest.mock("@/lib/auth", () => ({
  validateMagicToken: (...args: unknown[]) => mockValidate(...args),
}));
jest.mock("@/lib/rate-limit", () => ({
  tokenRateLimiter: { check: () => ({ allowed: true }) },
  getClientIp: () => "203.0.113.7",
  getClientIpOrNull: () => "203.0.113.7",
}));
jest.mock("@/lib/n8n", () => ({ triggerN8nWebhook: jest.fn() }));
jest.mock("@/lib/encryption", () => ({
  encrypt: (v: string) => v,
  decrypt: (v: string) => v,
  isEncryptionConfigured: () => true,
}));

import { GET, PUT } from "@/app/api/fragebogen/[token]/route";
import { NextRequest } from "next/server";

const TOKEN = "magic-token-1234567890";
const params = () => Promise.resolve({ token: TOKEN });
const ABGABE = new Date("2026-09-18T09:00:00Z");

function vorgang(teil: Record<string, unknown> = {}) {
  return {
    id: "ob1",
    status: "IN_PROGRESS",
    email: "anna.beispiel@example.org",
    questionnaireType: "STANDARD",
    formTemplateSnapshot: null,
    submittedAt: null,
    personalData: { currentStep: 4, isComplete: false, bornAfter1971: null },
    organization: {
      name: "FES Gymnasium",
      mandantNumber: "10",
      type: "SCHULE",
      betriebsnummer: null,
    },
    ...teil,
  };
}

function getReq(): NextRequest {
  return new NextRequest(`http://localhost:3000/api/fragebogen/${TOKEN}`);
}

function putReq(body: Record<string, unknown>): NextRequest {
  return new NextRequest(`http://localhost:3000/api/fragebogen/${TOKEN}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.personalData.findUnique.mockResolvedValue(null);
  mockPrisma.personalData.upsert.mockResolvedValue({ id: "pd1" });
  mockPrisma.formTemplate.findUnique.mockResolvedValue({
    stepsConfig: null,
    requiredDocuments: [],
  });
  mockPrisma.onboardingProcess.update.mockResolvedValue({});
  mockPrisma.onboardingProcess.updateMany.mockResolvedValue({ count: 1 });
});

// =============================================
// GET — mitarbeiterAbgesendet
// =============================================
describe("GET: mitarbeiterAbgesendet", () => {
  async function laden(teil: Record<string, unknown>) {
    mockValidate.mockResolvedValue({ valid: true, onboarding: vorgang(teil) });
    const res = await GET(getReq(), { params: params() });
    expect(res.status).toBe(200);
    return res.json();
  }

  it("ist false, wenn nur die Führungskraft abgesendet hat (Status SUPERVISOR_SUBMITTED)", async () => {
    const daten = await laden({
      status: "SUPERVISOR_SUBMITTED",
      submittedAt: null,
      personalData: { currentStep: 4, isComplete: false },
    });

    expect(daten.status).toBe("SUPERVISOR_SUBMITTED");
    expect(daten.mitarbeiterAbgesendet).toBe(false);
  });

  it("ist true, sobald die Person selbst abgesendet hat (submittedAt)", async () => {
    const daten = await laden({
      status: "SUPERVISOR_PENDING",
      submittedAt: ABGABE,
      personalData: { currentStep: 12, isComplete: true },
    });

    expect(daten.mitarbeiterAbgesendet).toBe(true);
  });

  it("ist true im Altfall ohne Zeitstempel, aber mit isComplete", async () => {
    const daten = await laden({
      status: "SUBMITTED",
      submittedAt: null,
      personalData: { currentStep: 12, isComplete: true },
    });

    expect(daten.mitarbeiterAbgesendet).toBe(true);
  });

  it("liest auch nach der eigenen Abgabe (allowSubmitted)", async () => {
    await laden({ submittedAt: ABGABE });

    expect(mockValidate).toHaveBeenCalledWith(TOKEN, { allowSubmitted: true });
  });
});

// =============================================
// PUT — bedingter Wechsel INVITED → IN_PROGRESS
// =============================================
describe("PUT: Status beim ersten Speichern", () => {
  async function speichern(teil: Record<string, unknown>) {
    mockValidate.mockResolvedValue({ valid: true, onboarding: vorgang(teil) });
    const res = await PUT(putReq({ currentStep: 1 }), { params: params() });
    expect(res.status).toBe(200);
  }

  it("wechselt INVITED nur bedingt — WHERE auf INVITED und offenen Fragebogen", async () => {
    await speichern({ status: "INVITED", personalData: null });

    expect(mockPrisma.onboardingProcess.updateMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.onboardingProcess.updateMany).toHaveBeenCalledWith({
      where: { id: "ob1", status: "INVITED", submittedAt: null },
      data: { status: "IN_PROGRESS" },
    });
  });

  it("setzt den Status nie per unbedingtem update (kein Lost Update über eine parallele Abgabe)", async () => {
    await speichern({ status: "INVITED", personalData: null });

    for (const [aufruf] of mockPrisma.onboardingProcess.update.mock.calls) {
      expect(aufruf.data).not.toHaveProperty("status");
    }
  });

  it("fasst den Status bei IN_PROGRESS gar nicht an", async () => {
    await speichern({ status: "IN_PROGRESS" });

    expect(mockPrisma.onboardingProcess.updateMany).not.toHaveBeenCalled();
    expect(mockPrisma.onboardingProcess.update).not.toHaveBeenCalled();
  });

  it("fasst den Status auch dann nicht an, wenn die Führungskraft schon abgesendet hat", async () => {
    // Altstand vor der Heil-Migration: Die Person darf weiter speichern, ihr
    // Speichern darf den (falschen) Status aber nicht zurueckdrehen — das
    // erledigt allein der Abgleich.
    await speichern({ status: "SUPERVISOR_SUBMITTED" });

    expect(mockPrisma.onboardingProcess.updateMany).not.toHaveBeenCalled();
  });
});
