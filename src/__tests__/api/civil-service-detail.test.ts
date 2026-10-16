/**
 * Tests fuer GET /api/civil-service/[id] — Zuschnitt des Protokolls je Rolle.
 *
 * Warum es diese Datei gibt: Bis zum 16.10.2026 lieferte die Route das
 * Protokoll des Vorgangs (`auditLogs`) an JEDE Portal-Rolle aus, und der Reiter
 * „Protokoll“ der Detailseite zeigte es ungefiltert an — anders als der Reiter
 * „E-Mails“, der von Anfang an auf HR_EDIT_ROLES beschraenkt war. Das Protokoll
 * nennt handelnde Personen und zeigt, was HR wann geaendert hat.
 *
 * Nicht erreichbar war das bisher nur durch zwei Umstaende AUSSERHALB dieser
 * Route: Die beiden mandantenbeschraenkten Rollen lassen sich nicht vergeben,
 * und das Mandanten-Gate der Middleware verweigert ihnen jeden API-Pfad ausser
 * `/api/auth` (src/lib/mandanten-gate.ts). Beide Umstaende sollen sich aendern —
 * die Allowlist ist ausdruecklich als Arbeitsliste gedacht. Dieser Test haelt
 * den Zuschnitt fest, damit der Eintrag in die Allowlist nicht der Moment wird,
 * in dem das Protokoll hinausgeht.
 */

const mockGetSession = jest.fn();
const mockCanAccessProcess = jest.fn();
const mockPrisma = {
  civilServiceProcess: { findUnique: jest.fn(), update: jest.fn() },
  auditLog: { create: jest.fn() },
};

jest.mock("@/lib/auth", () => ({ getSession: mockGetSession }));
jest.mock("@/lib/db", () => ({ prisma: mockPrisma }));
// Hausmuster (wie offboarding-einstellung.test.ts): die ECHTEN Rollenlisten,
// nur `canAccessProcess` als Attrappe. Eine Kopie der Listen im Test waere
// genau die Stelle, die den Ernstfall verfehlt — wer `HR_EDIT_ROLES` in
// `permissions.ts` um eine Rolle erweitert, soll HIER rot werden, nicht erst
// im Betrieb.
jest.mock("@/lib/permissions", () => {
  const echt = jest.requireActual("@/lib/permissions");
  return { ...echt, canAccessProcess: (...a: unknown[]) => mockCanAccessProcess(...a) };
});

import { GET } from "@/app/api/civil-service/[id]/route";
import { NextRequest } from "next/server";
import { HR_EDIT_ROLES, PORTAL_ROLES } from "@/lib/permissions";

/** Portal-Rollen, die NICHT bearbeiten duerfen — aus der Quelle abgeleitet. */
const NICHT_HR = PORTAL_ROLES.filter((r: string) => !HR_EDIT_ROLES.includes(r));

const params = () => Promise.resolve({ id: "psi1" });
const request = () => new NextRequest("http://localhost:3000/api/civil-service/psi1");

const PROTOKOLL = [
  { id: "a1", action: "STATUS_CHANGED", userId: "u1", createdAt: new Date("2026-10-01T08:00:00.000Z") },
];

function vorgang(overrides: Record<string, unknown> = {}) {
  return {
    id: "psi1",
    displayId: "PSI-2026-GYM-001",
    organizationId: "org1",
    status: "ASSESSMENT_PENDING",
    employeeFirstName: "Max",
    employeeLastName: "Mustermann",
    organization: { id: "org1", name: "Gymnasium", mandantNumber: "100" },
    phases: [],
    assessments: [],
    boardDecisions: [],
    documents: [],
    checklistItems: [],
    auditLogs: PROTOKOLL,
    ...overrides,
  };
}

/** Das `include` der einzigen findUnique-Abfrage dieses Aufrufs. */
function include(): Record<string, unknown> {
  return mockPrisma.civilServiceProcess.findUnique.mock.calls[0][0].include;
}

/**
 * Attrappe, die sich wie Prisma verhaelt: Eine Relation steht nur dann in der
 * Zeile, wenn sie im `include` steht.
 *
 * Das ist der Unterschied zwischen einem Test und einem Scheintest. Eine
 * Attrappe, die `auditLogs` unabhaengig vom `include` herausgibt, kann die
 * ANTWORT nicht zusichern — sie belegt nur, wie die Abfrage aussah. Hier traegt
 * die Zeile das Protokoll also absichtlich IMMER, und erst die Attrappe
 * entfernt es, wenn es nicht abgefragt wurde. Fiele die Schranke der Route weg,
 * kaeme es wirklich in der Antwort an, und der Test wird rot.
 */
function findUniqueWiePrisma(zeile: Record<string, unknown> = vorgang()) {
  mockPrisma.civilServiceProcess.findUnique.mockImplementation(
    (args: { include?: Record<string, unknown> }) => {
      const ergebnis: Record<string, unknown> = { ...zeile };
      for (const relation of ["phases", "assessments", "boardDecisions", "documents", "checklistItems", "auditLogs", "organization"]) {
        if (!args?.include?.[relation]) delete ergebnis[relation];
      }
      return Promise.resolve(ergebnis);
    },
  );
}

describe("GET /api/civil-service/[id]", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSession.mockResolvedValue({ userId: "u1", role: "HR_LEITUNG" });
    mockCanAccessProcess.mockResolvedValue(true);
    findUniqueWiePrisma();
  });

  it("401 ohne Session, 403 ohne Portal-Rolle, 404 unbekannt, 403 fremder Mandant", async () => {
    mockGetSession.mockResolvedValueOnce(null);
    expect((await GET(request(), { params: params() })).status).toBe(401);

    mockGetSession.mockResolvedValueOnce({ userId: "u9", role: "BEM_BEAUFTRAGTER" });
    expect((await GET(request(), { params: params() })).status).toBe(403);

    mockPrisma.civilServiceProcess.findUnique.mockResolvedValueOnce(null);
    expect((await GET(request(), { params: params() })).status).toBe(404);

    mockCanAccessProcess.mockResolvedValueOnce(false);
    expect((await GET(request(), { params: params() })).status).toBe(403);
  });

  describe("Protokoll (auditLogs) nur fuer HR_EDIT_ROLES", () => {
    it.each(HR_EDIT_ROLES)("%s: das Protokoll wird abgefragt und ausgeliefert", async (rolle) => {
      mockGetSession.mockResolvedValue({ userId: "u1", role: rolle });

      const res = await GET(request(), { params: params() });
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.auditLogs).toHaveLength(1);
      expect(include().auditLogs).toEqual({ orderBy: { createdAt: "desc" }, take: 10 });
    });

    it.each(NICHT_HR)(
      "%s: das Protokoll wird GAR NICHT abgefragt UND steht nicht in der Antwort",
      async (rolle) => {
        mockGetSession.mockResolvedValue({ userId: "u2", role: rolle });
        // Die Datenbank-Attrappe TRAEGT Protokollzeilen und gibt sie unabhaengig
        // vom `include` heraus. Genau deshalb wird BEIDES zugesichert: dass die
        // Abfrage sie nicht holt, UND dass die Antwort sie nicht enthaelt. Nur
        // die Abfrage zu pruefen liesse eine Umstellung „zweite Abfrage, Ergebnis
        // in die Antwort mischen" gruen durchgehen.
        findUniqueWiePrisma();

        const res = await GET(request(), { params: params() });
        const json = await res.json();

        // Der Vorgang selbst bleibt lesbar; nur das Protokoll faellt weg.
        expect(res.status).toBe(200);
        expect(json.id).toBe("psi1");
        expect(json.displayId).toBe("PSI-2026-GYM-001");
        expect(include()).not.toHaveProperty("auditLogs");
        expect(json.auditLogs).toBeUndefined();
      },
    );

    it("der uebrige Datenzuschnitt bleibt fuer alle Rollen gleich", async () => {
      mockGetSession.mockResolvedValue({ userId: "u2", role: "VORGESETZTER" });
      await GET(request(), { params: params() });
      const ohneHr = Object.keys(include()).sort();

      jest.clearAllMocks();
      mockGetSession.mockResolvedValue({ userId: "u1", role: "HR_LEITUNG" });
      mockCanAccessProcess.mockResolvedValue(true);
      findUniqueWiePrisma();
      await GET(request(), { params: params() });
      const mitHr = Object.keys(include()).sort();

      // Genau EIN Unterschied, und zwar das Protokoll.
      expect(mitHr.filter((k) => !ohneHr.includes(k))).toEqual(["auditLogs"]);
      expect(ohneHr.filter((k) => !mitHr.includes(k))).toEqual([]);
    });
  });
});
