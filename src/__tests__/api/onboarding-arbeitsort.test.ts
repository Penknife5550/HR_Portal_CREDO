/**
 * Tests: Arbeitsort am Onboarding-Vorgang aendern (E-A10, Feinplan S5)
 * (PATCH /api/onboarding/[id]/arbeitsort → arbeitsortAendern in
 * src/lib/onboarding-arbeitsort.ts)
 *
 * Was hier festgehalten ist:
 *   1. ZUGRIFF — nur HR_EDIT_ROLES (403); der Mandant ist der ARBEITGEBER
 *      (canAccessProcess mit organizationId, nie mit dem Arbeitsort); unbekannt
 *      und fremd ergeben dieselbe 404 — beim Vorgang „Vorgang nicht gefunden“,
 *      beim neuen Arbeitsort „Organisation nicht gefunden“ (auch fuer eine
 *      ID, die keine UUID ist: kein 400).
 *   2. SPERRE — ab dem Modalitaeten-Link oder einem HR-Status 409
 *      LINK_ERZEUGT, vorab gelesen UND im bedingten UPDATE (Wettlauf).
 *   3. SPEICHERN — gleich der Einrichtung wird null; ohne echte Aenderung kein
 *      Schreiben und kein Protokoll; sonst UPDATE und Protokoll
 *      ONBOARDING_ARBEITSORT_GEAENDERT { von, nach } in EINER Transaktion.
 */

const mockTx = {
  onboardingProcess: { updateMany: jest.fn() },
  auditLog: { create: jest.fn() },
};
const mockPrisma = {
  onboardingProcess: { findUnique: jest.fn() },
  organization: { findUnique: jest.fn() },
  $transaction: jest.fn(),
};
const mockSession = jest.fn();
const mockZugriff = jest.fn();

jest.mock("@/lib/db", () => ({ prisma: mockPrisma }));
jest.mock("@/lib/auth", () => ({ getSession: () => mockSession() }));
jest.mock("@/lib/permissions", () => ({
  ...jest.requireActual("@/lib/permissions"),
  canAccessProcess: (...a: unknown[]) => mockZugriff(...a),
}));

import { NextRequest } from "next/server";
import { PATCH } from "@/app/api/onboarding/[id]/arbeitsort/route";
import { MELDUNGEN as ABTEILUNGS_MELDUNGEN } from "@/lib/abteilungsaufgaben";
import { AUSSTATTUNG_AUDIT, MELDUNGEN } from "@/lib/ausstattung";

// =============================================
// Testdaten
// =============================================

const HR = {
  userId: "u-hr",
  email: "hr@example.org",
  role: "HR_SACHBEARBEITER",
  firstName: "Erika",
  lastName: "Sachbearbeiter",
};

const GRUNDSCHULE = { id: "org2", name: "FES Grundschule Nord", type: "GRUNDSCHULE" };

function vorgang(teil: Record<string, unknown> = {}) {
  return {
    id: "onb-1",
    organizationId: "org1",
    arbeitsortId: null,
    status: "INVITED",
    supervisorToken: null,
    ...teil,
  };
}

function aendern(body: unknown, roh?: string) {
  const req = new NextRequest("http://localhost:3000/api/onboarding/onb-1/arbeitsort", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: roh ?? JSON.stringify(body),
  });
  return PATCH(req, { params: Promise.resolve({ id: "onb-1" }) });
}

beforeEach(() => {
  jest.resetAllMocks();
  mockSession.mockResolvedValue(HR);
  mockZugriff.mockResolvedValue(true);
  mockPrisma.onboardingProcess.findUnique.mockResolvedValue(vorgang());
  mockPrisma.organization.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) =>
    where.id === GRUNDSCHULE.id ? GRUNDSCHULE : null,
  );
  mockPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(mockTx));
  mockTx.onboardingProcess.updateMany.mockResolvedValue({ count: 1 });
  mockTx.auditLog.create.mockResolvedValue({});
});

// =============================================
// 1. Zugriff
// =============================================

describe("Zugriff", () => {
  it("verlangt eine Anmeldung", async () => {
    mockSession.mockResolvedValue(null);
    expect((await aendern({ arbeitsortId: "org2" })).status).toBe(401);
  });

  it.each(["EINRICHTUNGSLEITUNG", "VORGESETZTER", "SERVICE"])("verweigert %s (403) und liest nichts", async (role) => {
    mockSession.mockResolvedValue({ ...HR, role });

    const res = await aendern({ arbeitsortId: "org2" });

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Keine Berechtigung" });
    expect(mockPrisma.onboardingProcess.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("antwortet 404 fuer einen unbekannten Vorgang", async () => {
    mockPrisma.onboardingProcess.findUnique.mockResolvedValue(null);

    const res = await aendern({ arbeitsortId: "org2" });

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: ABTEILUNGS_MELDUNGEN.ONBOARDING_VORGANG_NICHT_GEFUNDEN });
  });

  it("antwortet 404 mit demselben Text fuer einen Vorgang eines fremden Mandanten", async () => {
    mockZugriff.mockImplementation(async (_s: unknown, orgId: string) => orgId !== "org1");

    const res = await aendern({ arbeitsortId: "org2" });

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: ABTEILUNGS_MELDUNGEN.ONBOARDING_VORGANG_NICHT_GEFUNDEN });
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("prueft den Mandanten am Arbeitgeber — nie am gespeicherten Arbeitsort", async () => {
    mockPrisma.onboardingProcess.findUnique.mockResolvedValue(vorgang({ arbeitsortId: "org3" }));

    expect((await aendern({ arbeitsortId: "org2" })).status).toBe(200);

    expect(mockZugriff.mock.calls[0]).toEqual([HR, "org1"]);
    expect(mockZugriff.mock.calls.map((c) => c[1])).toEqual(["org1", "org2"]);
    expect(mockPrisma.onboardingProcess.findUnique).toHaveBeenCalledWith({
      where: { id: "onb-1" },
      select: { id: true, organizationId: true, arbeitsortId: true, status: true, supervisorToken: true },
    });
  });

  it("antwortet 404 „Organisation nicht gefunden“ fuer einen unbekannten Arbeitsort — auch ohne UUID-Form (kein 400)", async () => {
    const res = await aendern({ arbeitsortId: "org-2" });

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: MELDUNGEN.ORGANISATION_NICHT_GEFUNDEN });
    expect(MELDUNGEN.ORGANISATION_NICHT_GEFUNDEN).toBe("Organisation nicht gefunden");
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("antwortet 404 mit demselben Text fuer einen fremden Arbeitsort", async () => {
    mockZugriff.mockImplementation(async (_s: unknown, orgId: string) => orgId === "org1");

    const res = await aendern({ arbeitsortId: "org2" });

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: MELDUNGEN.ORGANISATION_NICHT_GEFUNDEN });
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });
});

// =============================================
// Eingabe
// =============================================

describe("Eingabe", () => {
  it("weist kaputtes JSON ab (400) — nie „wie Einrichtung“", async () => {
    const res = await aendern(undefined, '{ "arbeitsortId": ');
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: ABTEILUNGS_MELDUNGEN.UNGUELTIGE_EINGABE });
    expect(mockPrisma.onboardingProcess.findUnique).not.toHaveBeenCalled();
  });

  it("weist einen leeren Body ab (400) — kein stilles Zuruecksetzen", async () => {
    const res = await aendern(undefined, "");
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: ABTEILUNGS_MELDUNGEN.UNGUELTIGE_EINGABE });
    expect(mockPrisma.onboardingProcess.findUnique).not.toHaveBeenCalled();
  });

  it.each<[string, unknown]>([
    ["Feld fehlt", {}],
    ["Zahl", { arbeitsortId: 7 }],
    // Postgres scheiterte an einem NUL-Zeichen in findUnique (22021) → frueher 500 samt Stacktrace.
    ["NUL-Zeichen", { arbeitsortId: "\u0000" }],
    ["ueberlange ID", { arbeitsortId: "x".repeat(65) }],
  ])("weist ab: %s", async (_fall, body) => {
    const res = await aendern(body);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: MELDUNGEN.ARBEITSORT_UNGUELTIG });
    expect(mockPrisma.organization.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });
});

// =============================================
// 2. Sperre ab dem Modalitaeten-Link
// =============================================

describe("Sperre", () => {
  it("409 LINK_ERZEUGT, sobald der Modalitaeten-Link erzeugt ist — nichts gelesen, nichts geschrieben", async () => {
    mockPrisma.onboardingProcess.findUnique.mockResolvedValue(vorgang({ supervisorToken: "mod-token" }));

    const res = await aendern({ arbeitsortId: "org2" });

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: MELDUNGEN.ARBEITSORT_LINK_ERZEUGT, grund: "LINK_ERZEUGT" });
    expect(mockPrisma.organization.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockTx.auditLog.create).not.toHaveBeenCalled();
  });

  it.each(["REVIEWED", "COMPLETED", "EXPIRED"])("409 LINK_ERZEUGT bei HR-Status %s, auch ohne Link", async (status) => {
    mockPrisma.onboardingProcess.findUnique.mockResolvedValue(vorgang({ status }));

    const res = await aendern({ arbeitsortId: "org2" });

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: MELDUNGEN.ARBEITSORT_VORGANG_GEPRUEFT, grund: "LINK_ERZEUGT" });
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("schreibt bedingt — wird der Link dazwischen erzeugt (count 0), 409 und kein Protokoll", async () => {
    mockTx.onboardingProcess.updateMany.mockResolvedValue({ count: 0 });

    const res = await aendern({ arbeitsortId: "org2" });

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: MELDUNGEN.ARBEITSORT_LINK_ERZEUGT, grund: "LINK_ERZEUGT" });
    expect(mockTx.onboardingProcess.updateMany).toHaveBeenCalledWith({
      where: { id: "onb-1", supervisorToken: null, status: { notIn: ["REVIEWED", "COMPLETED", "EXPIRED"] } },
      data: { arbeitsortId: "org2" },
    });
    expect(mockTx.auditLog.create).not.toHaveBeenCalled();
  });
});

// =============================================
// 3. Speichern und Protokoll
// =============================================

describe("Speichern", () => {
  it("speichert einen abweichenden Arbeitsort und protokolliert { von, nach } im selben Commit", async () => {
    const res = await aendern({ arbeitsortId: " org2 " });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      data: { arbeitsortId: "org2", arbeitsort: GRUNDSCHULE, geaendert: true },
    });
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mockTx.onboardingProcess.updateMany).toHaveBeenCalledWith({
      where: { id: "onb-1", supervisorToken: null, status: { notIn: ["REVIEWED", "COMPLETED", "EXPIRED"] } },
      data: { arbeitsortId: "org2" },
    });
    expect(mockTx.auditLog.create).toHaveBeenCalledWith({
      data: {
        userId: "u-hr",
        onboardingId: "onb-1",
        processType: "ONBOARDING",
        action: AUSSTATTUNG_AUDIT.ARBEITSORT_GEAENDERT,
        details: { von: null, nach: "org2" },
      },
    });
    expect(AUSSTATTUNG_AUDIT.ARBEITSORT_GEAENDERT).toBe("ONBOARDING_ARBEITSORT_GEAENDERT");
    expect(mockTx.onboardingProcess.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      mockTx.auditLog.create.mock.invocationCallOrder[0],
    );
  });

  it.each<[string, unknown]>([
    ["null", { arbeitsortId: null }],
    ["leer", { arbeitsortId: "" }],
    ["die Einrichtung selbst", { arbeitsortId: "org1" }],
  ])("setzt zurueck auf „wie Einrichtung“ (null): %s", async (_fall, body) => {
    mockPrisma.onboardingProcess.findUnique.mockResolvedValue(vorgang({ arbeitsortId: "org2" }));

    const res = await aendern(body);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { arbeitsortId: null, arbeitsort: null, geaendert: true } });
    expect(mockTx.onboardingProcess.updateMany.mock.calls[0][0].data).toEqual({ arbeitsortId: null });
    expect(mockTx.auditLog.create.mock.calls[0][0].data.details).toEqual({ von: "org2", nach: null });
    // Die Einrichtung selbst muss nicht noch einmal gesucht werden.
    expect(mockPrisma.organization.findUnique).not.toHaveBeenCalled();
  });

  it("ohne echte Aenderung: 200, kein Schreiben, kein Protokoll", async () => {
    mockPrisma.onboardingProcess.findUnique.mockResolvedValue(vorgang({ arbeitsortId: "org2" }));

    const res = await aendern({ arbeitsortId: "org2" });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      data: { arbeitsortId: "org2", arbeitsort: GRUNDSCHULE, geaendert: false },
    });
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("„wie Einrichtung“ bleibt „wie Einrichtung“ ohne Schreiben", async () => {
    const res = await aendern({ arbeitsortId: "org1" });

    expect(res.status).toBe(200);
    expect((await res.json()).data.geaendert).toBe(false);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("antwortet 500 ohne Details, wenn die Datenbank scheitert", async () => {
    mockTx.auditLog.create.mockRejectedValue(new Error("DB weg"));
    const fehler = jest.spyOn(console, "error").mockImplementation(() => {});

    const res = await aendern({ arbeitsortId: "org2" });

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Interner Serverfehler" });
    fehler.mockRestore();
  });
});
