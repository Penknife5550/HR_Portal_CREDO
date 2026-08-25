/**
 * Tests fuer das Einstellungsmodalitaeten-Formular des Vorgesetzten:
 * /api/modalitaeten/[token]
 *
 * Schwerpunkt: Befristung ohne festes Enddatum (Zweckbefristung) und die
 * Behandlung leerer Datumsfelder (leerer String darf NIE an Prisma gehen).
 */

const mockPrisma = {
  supervisorData: { upsert: jest.fn(), update: jest.fn() },
  onboardingProcess: { update: jest.fn() },
  auditLog: { create: jest.fn() },
  organization: { findMany: jest.fn() },
};
const mockValidate = jest.fn();

jest.mock("@/lib/db", () => ({ prisma: mockPrisma }));
jest.mock("@/lib/auth", () => ({
  validateSupervisorToken: (...args: unknown[]) => mockValidate(...args),
}));
jest.mock("@/lib/rate-limit", () => ({
  tokenRateLimiter: { check: () => ({ allowed: true }) },
  getClientIp: () => "127.0.0.1",
}));
jest.mock("@/lib/n8n", () => ({ triggerN8nWebhook: jest.fn() }));

import { POST, PUT } from "@/app/api/modalitaeten/[token]/route";
import { NextRequest } from "next/server";

const TOKEN = "supervisor-token-1234567890";
const params = () => Promise.resolve({ token: TOKEN });

function req(method: "PUT" | "POST", body: Record<string, unknown>): NextRequest {
  return new NextRequest(`http://localhost:3000/api/modalitaeten/${TOKEN}`, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function onboarding(supervisorData: Record<string, unknown> | null = null) {
  return {
    valid: true,
    onboarding: {
      id: "ob1",
      email: "neu@example.de",
      supervisorEmail: "chef@example.de",
      organization: { name: "Christliche Familienhilfe Minden e. V." },
      supervisorData,
    },
  };
}

/** Schritt 1 so, wie ihn das Formular sendet (alle Felder, auch leere). */
const STEP1 = {
  betriebsstaette: "Kingsleyallee 6",
  stellenbeschreibung: "Sozialpaedagogische Familienhilfe",
  vertragsbeginn: "2026-09-01",
  befristet: false,
  befristungsart: "" as const,
  vertragsende: "",
  befristungZweck: "",
  vertragsendeVoraussichtlich: "",
  befristungSachgrund: "",
  currentStep: 1,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockValidate.mockResolvedValue(onboarding());
  mockPrisma.supervisorData.upsert.mockResolvedValue({});
  mockPrisma.supervisorData.update.mockResolvedValue({});
  mockPrisma.onboardingProcess.update.mockResolvedValue({});
  mockPrisma.auditLog.create.mockResolvedValue({});
});

function savedData() {
  return mockPrisma.supervisorData.upsert.mock.calls[0][0].update as Record<string, unknown>;
}

describe("PUT – leere Datumsfelder", () => {
  it("speichert ein leeres Vertragsende als null statt als leerem String", async () => {
    const res = await PUT(req("PUT", STEP1), { params: params() });

    expect(res.status).toBe(200);
    // Regression: "" an einer DateTime-Spalte liess Prisma scheitern -> 500,
    // der "Weiter"-Button blieb ohne Meldung wirkungslos.
    expect(savedData().vertragsende).toBeNull();
    expect(savedData().vertragsbeginn).toEqual(new Date("2026-09-01"));
  });

  it("speichert ein leeres optionales Ende der Zweckbefristung als null", async () => {
    // Dieser Pfad haengt allein an der Datumsnormalisierung: Der Aufraeum-Block
    // fasst vertragsendeVoraussichtlich im ZWECK-Zweig NICHT an.
    const res = await PUT(
      req("PUT", {
        ...STEP1,
        befristet: true,
        befristungsart: "ZWECK",
        befristungZweck: "Ende der Kostenzusage des Jugendamtes",
        vertragsendeVoraussichtlich: "",
      }),
      { params: params() }
    );

    expect(res.status).toBe(200);
    expect(savedData().vertragsendeVoraussichtlich).toBeNull();
  });

  it("speichert einen leeren Vertragsbeginn als null", async () => {
    // Ebenfalls nur durch die Datumsnormalisierung abgedeckt
    const res = await PUT(req("PUT", { ...STEP1, vertragsbeginn: "" }), { params: params() });

    expect(res.status).toBe(200);
    expect(savedData().vertragsbeginn).toBeNull();
  });

  it("lehnt ein unplausibles Datum mit 400 statt mit einem Serverfehler ab", async () => {
    const res = await PUT(req("PUT", { ...STEP1, vertragsbeginn: "31.09.2026" }), {
      params: params(),
    });

    expect(res.status).toBe(400);
    expect(mockPrisma.supervisorData.upsert).not.toHaveBeenCalled();
  });
});

describe("PUT – Zweckbefristung", () => {
  it("speichert Zweck und voraussichtliches Ende ohne festes Vertragsende", async () => {
    const res = await PUT(
      req("PUT", {
        ...STEP1,
        befristet: true,
        befristungsart: "ZWECK",
        befristungZweck: "Ende der Kostenzusage des Jugendamtes",
        vertragsendeVoraussichtlich: "2027-08-31",
        befristungSachgrund: "projektbezogen",
      }),
      { params: params() }
    );

    expect(res.status).toBe(200);
    expect(savedData()).toMatchObject({
      befristet: true,
      befristungsart: "ZWECK",
      befristungZweck: "Ende der Kostenzusage des Jugendamtes",
      befristungSachgrund: "projektbezogen",
      vertragsende: null,
    });
    expect(savedData().vertragsendeVoraussichtlich).toEqual(new Date("2027-08-31"));
  });

  it("verwirft Zweck-Felder, wenn ein festes Enddatum gewaehlt wurde", async () => {
    await PUT(
      req("PUT", {
        ...STEP1,
        befristet: true,
        befristungsart: "KALENDER",
        vertragsende: "2027-08-31",
        befristungZweck: "alter Text",
        vertragsendeVoraussichtlich: "2027-12-31",
      }),
      { params: params() }
    );

    expect(savedData()).toMatchObject({
      befristungsart: "KALENDER",
      befristungZweck: null,
      vertragsendeVoraussichtlich: null,
    });
    expect(savedData().vertragsende).toEqual(new Date("2027-08-31"));
  });

  it("raeumt alle Befristungsfelder auf, wenn der Haken entfernt wird", async () => {
    await PUT(req("PUT", { ...STEP1, befristet: false }), { params: params() });

    expect(savedData()).toMatchObject({
      befristet: false,
      befristungsart: null,
      vertragsende: null,
      befristungZweck: null,
      vertragsendeVoraussichtlich: null,
      befristungSachgrund: null,
    });
  });

  it("laesst spaetere Schritte unberuehrt (kein Ueberschreiben der Befristung)", async () => {
    await PUT(req("PUT", { wochenstunden: 30, currentStep: 2 }), { params: params() });

    expect(savedData()).toEqual({ wochenstunden: 30, currentStep: 2 });
  });
});

describe("POST – Absenden", () => {
  it("blockiert eine kalendermaessige Befristung ohne Vertragsende", async () => {
    mockValidate.mockResolvedValue(
      onboarding({ befristet: true, befristungsart: "KALENDER", vertragsende: null })
    );

    const res = await POST(req("POST", {}), { params: params() });

    expect(res.status).toBe(400);
    expect(mockPrisma.onboardingProcess.update).not.toHaveBeenCalled();
  });

  it("blockiert eine Zweckbefristung ohne Beschreibung", async () => {
    mockValidate.mockResolvedValue(
      onboarding({ befristet: true, befristungsart: "ZWECK", befristungZweck: "  " })
    );

    const res = await POST(req("POST", {}), { params: params() });

    expect(res.status).toBe(400);
    expect(mockPrisma.onboardingProcess.update).not.toHaveBeenCalled();
  });

  it("laesst eine vollstaendige Zweckbefristung ohne Enddatum durch", async () => {
    mockValidate.mockResolvedValue(
      onboarding({
        befristet: true,
        befristungsart: "ZWECK",
        befristungZweck: "Ende der Kostenzusage des Jugendamtes",
        vertragsende: null,
      })
    );

    const res = await POST(req("POST", {}), { params: params() });

    expect(res.status).toBe(200);
    expect(mockPrisma.onboardingProcess.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "SUPERVISOR_SUBMITTED" }) })
    );
  });

  it("laesst einen unbefristeten Vertrag durch", async () => {
    mockValidate.mockResolvedValue(onboarding({ befristet: false }));

    const res = await POST(req("POST", {}), { params: params() });

    expect(res.status).toBe(200);
  });
});
