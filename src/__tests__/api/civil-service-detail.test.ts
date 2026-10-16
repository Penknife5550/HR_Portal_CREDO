/**
 * Tests fuer GET /api/civil-service/[id] — die Verbeamtung ist reine HR-Arbeit.
 *
 * ZWEI SCHRITTE AN EINEM TAG, und der zweite hebt den ersten auf. Das gehoert
 * aufgeschrieben, weil die Begruendung sonst verloren geht:
 *
 * 1. Am 16.10.2026 fiel auf, dass die Route das Protokoll des Vorgangs
 *    (`auditLogs`) an JEDE Portal-Rolle gab. Erster Schritt: Das Protokoll kam
 *    nur noch mit HR_EDIT_ROLES ins `include` (Commit c8b9c6e); GET blieb bei
 *    `PORTAL_ROLES`. Diese Datei sicherte damals zu, dass eine Nicht-HR-Rolle
 *    den Vorgang weiter LESEN darf, nur ohne Protokoll.
 * 2. Die Durchsicht dieser Korrektur zeigte, dass das Protokoll gar nicht das
 *    Empfindlichste war: Die Antwort trug vier Arten lebender
 *    Magic-Link-Schluessel (`applicationToken`, je Beurteilung `token`,
 *    `employeeAckToken`, `verifyToken`), die vollstaendige dienstliche
 *    Beurteilung samt Gegenaeusserung, `acknowledgedByEmployeeIp` und
 *    Art.-9-Daten (amtsaerztliche Untersuchung, Gemeinde-Mitgliedschaft samt
 *    Freitext). Dazu hatten vier Unterrouten des Moduls GAR KEINE
 *    Rollenpruefung. Entscheidung des Projektverantwortlichen vom 16.10.2026:
 *    Die Verbeamtung ist reine HR-Arbeit — GET prueft `HR_EDIT_ROLES`.
 *
 * Damit sichert diese Datei das Gegenteil von vorher zu: **403 fuer jede Rolle
 * ohne Bearbeitungsrecht**, und der Vorgang wird dabei nicht einmal abgefragt.
 * Die Zusicherung aus Schritt 1 (Lesen erlaubt, Protokoll weg) war kein Fehler,
 * sondern der Stand von zwei Stunden — sie ist hier bewusst ersetzt.
 *
 * Eine Leseansicht fuer Nicht-HR ist eine PRODUKTentscheidung, keine
 * Reparatur. Wer sie beauftragt, schneidet vorher Tokens, Beurteilung und
 * Art.-9-Felder zu (Muster: `ohneVorgesetztenToken`, `ohneLinkSchluessel`) —
 * und aendert dann diese Tests mit Absicht, nicht aus Versehen.
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

  describe("Nur HR darf lesen", () => {
    it.each(HR_EDIT_ROLES)("%s: 200 mit dem Vorgang samt Protokoll", async (rolle) => {
      mockGetSession.mockResolvedValue({ userId: "u1", role: rolle });

      const res = await GET(request(), { params: params() });
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.id).toBe("psi1");
      expect(json.auditLogs).toHaveLength(1);
      expect(include().auditLogs).toEqual({ orderBy: { createdAt: "desc" }, take: 10 });
    });

    it.each(NICHT_HR)("%s: 403 — und der Vorgang wird nicht einmal abgefragt", async (rolle) => {
      mockGetSession.mockResolvedValue({ userId: "u2", role: rolle });

      const res = await GET(request(), { params: params() });

      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: "Keine Berechtigung" });
      // Entscheidend: Die Schranke sitzt VOR der Datenbank. Nichts von den
      // Tokens, der Beurteilung oder den Art.-9-Feldern wird geladen.
      expect(mockPrisma.civilServiceProcess.findUnique).not.toHaveBeenCalled();
      expect(mockCanAccessProcess).not.toHaveBeenCalled();
    });

    it("auch eine unbekannte Rolle kommt nicht durch", async () => {
      mockGetSession.mockResolvedValue({ userId: "u9", role: "BEM_BEAUFTRAGTER" });
      const res = await GET(request(), { params: params() });
      expect(res.status).toBe(403);
      expect(mockPrisma.civilServiceProcess.findUnique).not.toHaveBeenCalled();
    });

    it("die Antwort fuer HR traegt weiterhin die Tokens — das ist gewollt und der Grund fuer die Schranke", async () => {
      // Kein Zuschnitt in der Antwort: Die Verbeamtung liefert HR alles, was sie
      // braucht (die Oberflaeche verwaltet die Magic Links selbst). Genau
      // deshalb MUSS die Rollenschranke oben halten — es gibt kein Feld-Sieb
      // als zweites Netz. Dieser Test macht die Abhaengigkeit sichtbar.
      mockPrisma.civilServiceProcess.findUnique.mockImplementation(
        (args: { include?: Record<string, unknown> }) => {
          const z: Record<string, unknown> = { ...vorgang(), applicationToken: "lebender-token" };
          if (!args?.include?.auditLogs) delete z.auditLogs;
          return Promise.resolve(z);
        },
      );
      const json = await (await GET(request(), { params: params() })).json();
      expect(json.applicationToken).toBe("lebender-token");
    });
  });
});
