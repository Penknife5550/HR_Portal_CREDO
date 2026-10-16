/**
 * Tests fuer /api/contract-end/[id] (GET – Einzelvorgang, PATCH – Aktualisieren)
 * Kern: Die Antwort traegt den Vorgang OHNE supervisorToken (Schluessel des
 * Magic-Links der Fuehrungskraft), das Ablaufdatum bleibt. Dazu traegt GET den
 * Namen der im Formular gewaehlten Betriebsstaette (`betriebsstaetteName`).
 */

const mockGetSession = jest.fn();
const mockCanAccessProcess = jest.fn();
const mockPrisma = {
  contractEndProcess: { findUnique: jest.fn(), update: jest.fn() },
  organization: { findUnique: jest.fn() },
  auditLog: { create: jest.fn() },
};

jest.mock("@/lib/auth", () => ({ getSession: mockGetSession }));
jest.mock("@/lib/db", () => ({ prisma: mockPrisma }));
// Die ECHTEN Rollenlisten, nur `canAccessProcess` als Attrappe (Hausmuster aus
// offboarding-einstellung.test.ts). Eine Kopie der Listen im Test bliebe gruen,
// wenn jemand `HR_EDIT_ROLES` in `permissions.ts` erweitert — also genau im
// gefaehrlichen Fall.
jest.mock("@/lib/permissions", () => {
  const echt = jest.requireActual("@/lib/permissions");
  return { ...echt, canAccessProcess: (...a: unknown[]) => mockCanAccessProcess(...a) };
});

import { GET, PATCH } from "@/app/api/contract-end/[id]/route";
import { NextRequest } from "next/server";
import { HR_EDIT_ROLES, PORTAL_ROLES } from "@/lib/permissions";

/** Portal-Rollen ohne Bearbeitungsrecht — aus der Quelle abgeleitet. */
const NICHT_HR = PORTAL_ROLES.filter((r: string) => !HR_EDIT_ROLES.includes(r));

/** Steht fuer den Schluessel des Magic-Links — darf in keiner Antwort auftauchen. */
const GEHEIM = "geheimer-magic-link-token";
const ABLAUF = "2026-11-01T00:00:00.000Z";

const params = () => Promise.resolve({ id: "ce1" });

function getRequest(): NextRequest {
  return new NextRequest("http://localhost:3000/api/contract-end/ce1");
}

function patchRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost:3000/api/contract-end/ce1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function vorgang(overrides: Record<string, unknown> = {}) {
  return {
    id: "ce1",
    displayId: "VE-2026-GYM-001",
    organizationId: "org1",
    status: "ANFRAGE_VORGESETZTER",
    decision: "OFFEN",
    employeeFirstName: "Max",
    employeeLastName: "Mustermann",
    supervisorEmail: "leitung@example.org",
    supervisorToken: GEHEIM,
    supervisorTokenExpiresAt: new Date(ABLAUF),
    supervisorLinkSentAt: new Date("2026-10-01T08:00:00.000Z"),
    mavStatus: null,
    organization: { id: "org1", name: "Gymnasium", mandantNumber: "100" },
    renewalData: null,
    ...overrides,
  };
}

describe("GET /api/contract-end/[id]", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSession.mockResolvedValue({ userId: "u1", role: "HR_LEITUNG" });
    mockCanAccessProcess.mockResolvedValue(true);
    mockPrisma.contractEndProcess.findUnique.mockResolvedValue(
      vorgang({ offboarding: null, auditLogs: [] }),
    );
  });

  it("401 ohne Session, 403 ohne Portal-Rolle, 404 unbekannt, 403 fremder Mandant", async () => {
    mockGetSession.mockResolvedValueOnce(null);
    expect((await GET(getRequest(), { params: params() })).status).toBe(401);

    mockGetSession.mockResolvedValueOnce({ userId: "u1", role: "SERVICE" });
    expect((await GET(getRequest(), { params: params() })).status).toBe(403);

    mockPrisma.contractEndProcess.findUnique.mockResolvedValueOnce(null);
    expect((await GET(getRequest(), { params: params() })).status).toBe(404);

    mockCanAccessProcess.mockResolvedValueOnce(false);
    const res = await GET(getRequest(), { params: params() });
    expect(res.status).toBe(403);
    expect(JSON.stringify(await res.json())).not.toContain(GEHEIM);
  });

  // Die Route laesst alle PORTAL_ROLES zu, also auch die nur lesenden (die
  // heute noch am Mandanten-Gate der Middleware scheitern, src/lib/mandanten-gate.ts).
  it.each(["HR_LEITUNG", "EINRICHTUNGSLEITUNG", "VORGESETZTER"])(
    "200 für %s: Vorgang ohne supervisorToken",
    async (role) => {
      mockGetSession.mockResolvedValue({ userId: "u1", role });

      const res = await GET(getRequest(), { params: params() });
      expect(res.status).toBe(200);
      const json = await res.json();

      expect(json).not.toHaveProperty("supervisorToken");
      expect(JSON.stringify(json)).not.toContain(GEHEIM);
    },
  );

  it("das Ablaufdatum des Links und der Rest des Vorgangs bleiben in der Antwort", async () => {
    const res = await GET(getRequest(), { params: params() });
    const json = await res.json();

    // supervisorTokenExpiresAt braucht die Oberflaeche (Prozess-Adapter
    // Vertragsende) — nur der Schluessel selbst faellt weg.
    expect(json.supervisorTokenExpiresAt).toBe(ABLAUF);
    expect(json).toMatchObject({
      id: "ce1",
      displayId: "VE-2026-GYM-001",
      status: "ANFRAGE_VORGESETZTER",
      supervisorEmail: "leitung@example.org",
      supervisorLinkSentAt: "2026-10-01T08:00:00.000Z",
      organization: { id: "org1", name: "Gymnasium" },
      renewalData: null,
      offboarding: null,
      auditLogs: [],
    });
    // Ohne Vertragsdaten gibt es nichts nachzuschlagen.
    expect(mockPrisma.organization.findUnique).not.toHaveBeenCalled();
  });

  // Das Protokoll des Vorgangs zeigt, WAS HR wann geaendert hat (`action`,
  // `details`, `userId` — keine Namen, die Route laedt den Benutzer nicht mit).
  // Bis zum 16.10.2026 ging es an jede Portal-Rolle, also auch an
  // Einrichtungsleitung und Fuehrungskraft. Hier liest es ohnehin keine
  // Ansicht; es lag nur in der Antwort.
  describe("Protokoll (auditLogs) nur fuer HR_EDIT_ROLES", () => {
    /**
     * Attrappe, die sich wie Prisma verhaelt: Die Relation steht nur in der
     * Zeile, wenn sie im `include` steht. Nur so laesst sich die ANTWORT
     * zusichern und nicht bloss die Abfrage — eine include-blinde Attrappe
     * liesse die Umstellung „zweite Abfrage, Ergebnis in die Antwort mischen"
     * unbemerkt durchgehen.
     */
    function findUniqueWiePrisma() {
      mockPrisma.contractEndProcess.findUnique.mockImplementation(
        (args: { include?: Record<string, unknown> }) => {
          const zeile = vorgang({
            offboarding: null,
            auditLogs: [{ id: "a1", action: "STATUS_CHANGED", userId: "u1" }],
          }) as Record<string, unknown>;
          if (!args?.include?.auditLogs) delete zeile.auditLogs;
          return Promise.resolve(zeile);
        },
      );
    }

    const include = () => mockPrisma.contractEndProcess.findUnique.mock.calls[0][0].include;

    it.each(HR_EDIT_ROLES)("%s: das Protokoll wird abgefragt und ausgeliefert", async (rolle) => {
      mockGetSession.mockResolvedValue({ userId: "u1", role: rolle });
      findUniqueWiePrisma();

      const res = await GET(getRequest(), { params: params() });
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.auditLogs).toHaveLength(1);
      expect(include().auditLogs).toEqual({ orderBy: { createdAt: "desc" }, take: 20 });
    });

    it.each(NICHT_HR)(
      "%s: das Protokoll wird GAR NICHT abgefragt UND steht nicht in der Antwort",
      async (rolle) => {
        mockGetSession.mockResolvedValue({ userId: "u2", role: rolle });
        findUniqueWiePrisma();

        const res = await GET(getRequest(), { params: params() });
        const json = await res.json();

        // Der Vorgang selbst bleibt lesbar — nur das Protokoll faellt weg.
        expect(res.status).toBe(200);
        expect(json.id).toBe("ce1");
        expect(include()).not.toHaveProperty("auditLogs");
        expect(json.auditLogs).toBeUndefined();
      },
    );
  });

  describe("Betriebsstätte der Vertragsdaten", () => {
    const ORG_ID = "7c1e2d3f-4a5b-4c6d-8e9f-0a1b2c3d4e5f";
    /** Vertragsdaten, wie das Formular der Führungskraft sie speichert: Auswahl als Id, Freitext leer. */
    const vertragsdaten = (teil: Record<string, unknown> = {}) => ({
      id: "rd1",
      contractEndId: "ce1",
      vertragsbeginn: new Date("2026-12-01T00:00:00.000Z"),
      entgeltgruppe: "E 9b",
      betriebsstaette: null,
      betriebsstaetteOrgId: ORG_ID,
      isComplete: true,
      ...teil,
    });

    it("mit gewählter Betriebsstätte: ihr Name als renewalData.betriebsstaetteName, die übrigen Felder bleiben", async () => {
      mockPrisma.contractEndProcess.findUnique.mockResolvedValue(
        vorgang({ offboarding: null, auditLogs: [], renewalData: vertragsdaten() }),
      );
      mockPrisma.organization.findUnique.mockResolvedValue({ name: "Gesamtschule Minden" });

      const res = await GET(getRequest(), { params: params() });
      expect(res.status).toBe(200);
      const json = await res.json();

      expect(mockPrisma.organization.findUnique).toHaveBeenCalledWith({ where: { id: ORG_ID }, select: { name: true } });
      expect(json.renewalData).toEqual({
        id: "rd1",
        contractEndId: "ce1",
        vertragsbeginn: "2026-12-01T00:00:00.000Z",
        entgeltgruppe: "E 9b",
        betriebsstaette: null,
        betriebsstaetteOrgId: ORG_ID,
        isComplete: true,
        betriebsstaetteName: "Gesamtschule Minden",
      });
      // Der Schluessel des Links bleibt trotzdem draussen.
      expect(json).not.toHaveProperty("supervisorToken");
      expect(JSON.stringify(json)).not.toContain(GEHEIM);
    });

    it("ohne gewählte Betriebsstätte: betriebsstaetteName null, keine Abfrage; der Freitext (Altbestand) bleibt", async () => {
      for (const betriebsstaetteOrgId of [null, ""]) {
        mockPrisma.organization.findUnique.mockClear();
        mockPrisma.contractEndProcess.findUnique.mockResolvedValue(
          vorgang({ offboarding: null, auditLogs: [], renewalData: vertragsdaten({ betriebsstaetteOrgId, betriebsstaette: "Minden" }) }),
        );
        const json = await (await GET(getRequest(), { params: params() })).json();
        expect(json.renewalData).toMatchObject({ betriebsstaette: "Minden", betriebsstaetteName: null });
        expect(mockPrisma.organization.findUnique).not.toHaveBeenCalled();
      }
    });

    it("Betriebsstätte inzwischen gelöscht: betriebsstaetteName null", async () => {
      mockPrisma.contractEndProcess.findUnique.mockResolvedValue(
        vorgang({ offboarding: null, auditLogs: [], renewalData: vertragsdaten() }),
      );
      mockPrisma.organization.findUnique.mockResolvedValue(null);
      const json = await (await GET(getRequest(), { params: params() })).json();
      expect(json.renewalData.betriebsstaetteName).toBeNull();
    });
  });
});

describe("PATCH /api/contract-end/[id]", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSession.mockResolvedValue({ userId: "u1", role: "HR_LEITUNG" });
    mockCanAccessProcess.mockResolvedValue(true);
    mockPrisma.contractEndProcess.findUnique.mockResolvedValue(vorgang());
    mockPrisma.contractEndProcess.update.mockResolvedValue(vorgang({ mavStatus: "ANGEHOERT" }));
    mockPrisma.auditLog.create.mockResolvedValue({});
  });

  it("403 für nur lesende Rollen", async () => {
    mockGetSession.mockResolvedValue({ userId: "u1", role: "VORGESETZTER" });
    const res = await PATCH(patchRequest({ mavStatus: "ANGEHOERT" }), { params: params() });
    expect(res.status).toBe(403);
    expect(mockPrisma.contractEndProcess.update).not.toHaveBeenCalled();
  });

  it("200: die Antwort trägt den aktualisierten Vorgang ohne supervisorToken", async () => {
    const res = await PATCH(patchRequest({ mavStatus: "ANGEHOERT" }), { params: params() });
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json).not.toHaveProperty("supervisorToken");
    expect(JSON.stringify(json)).not.toContain(GEHEIM);
    expect(json).toMatchObject({
      id: "ce1",
      mavStatus: "ANGEHOERT",
      supervisorEmail: "leitung@example.org",
      supervisorTokenExpiresAt: ABLAUF,
    });

    // Am Schreiben aendert sich nichts, und PATCH schlaegt keine Betriebsstaette nach
    expect(mockPrisma.organization.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.contractEndProcess.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "ce1" },
        data: expect.objectContaining({ mavStatus: "ANGEHOERT" }),
      }),
    );
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "CONTRACT_END_UPDATED" }),
      }),
    );
  });
});
