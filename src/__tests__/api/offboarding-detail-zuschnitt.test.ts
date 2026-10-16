/**
 * `GET /api/offboarding/[id]` — Datenzuschnitt je Rolle (Befund 16.10.2026).
 *
 * Die Route prueft gegen `PORTAL_ROLES` und bleibt dabei: Die Ansicht ist
 * ausdruecklich auch zum Lesen gebaut (`canEdit`, `NUR_HR_TABS` in
 * `(portal)/dashboard/offboarding/[id]/types.ts`), eine Beschraenkung auf
 * HR_EDIT_ROLES wuerde diesen Zugang zerstoeren. Was einzelne Rollen nicht
 * sehen sollen, faellt deshalb FELDWEISE weg. Drei Dinge:
 *
 *   1. `auditLogs` — das Protokoll des Vorgangs. Die Offboarding-Ansicht hat
 *      gar keinen Protokoll-Reiter; es war reine Fracht in der Antwort.
 *   2. `exitData.severancePay` — die Abfindung, mit AES-256-GCM verschluesselt
 *      wie IBAN und Steuer-ID. Entschluesselt nur fuer `FINANCIAL_ROLES`
 *      (Entscheidung vom 16.10.2026; erste Verwendung dieser Liste im Code).
 *   3. Der Aufgaben-Link der Abteilungen — ein Zugang OHNE Anmeldung. Er
 *      steckt an drei Stellen; `ohneLinkSchluessel` nimmt alle drei
 *      (eigene Tests in `src/__tests__/lib/abteilungs-link-schluessel.test.ts`).
 *
 * Unveraendert bleiben die internen Notizen samt Urheber: Entscheidung des
 * Projektverantwortlichen vom 16.10.2026 — die Fuehrungskraft darf mitlesen.
 * Der Test haelt das fest, damit es nicht als Versehen „korrigiert" wird.
 *
 * WARUM EIGENE DATEI. `offboarding-einstellung.test.ts` prueft dieselbe Route,
 * aber seine Attrappe ignoriert `include` und gibt die Vorgabezeile zurueck —
 * sie kann „nicht abgefragt" und „leer" nicht unterscheiden und waere fuer
 * diese Zusicherung ein Scheinschutz. Die Attrappe hier ist include-treu.
 */

const mockGetSession = jest.fn();
const mockCanAccessProcess = jest.fn();
const mockPrisma = {
  offboardingProcess: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  departmentConfig: { findMany: jest.fn() },
  user: { findMany: jest.fn() },
  auditLog: { create: jest.fn() },
  onboardingProcess: { findMany: jest.fn(), findUnique: jest.fn() },
  ausgabe: { findMany: jest.fn() },
  returnItem: { findMany: jest.fn() },
  organization: { findMany: jest.fn() },
};

jest.mock("@/lib/db", () => ({ prisma: mockPrisma }));
jest.mock("@/lib/auth", () => ({ getSession: () => mockGetSession() }));
// `decrypt` als Identitaet: Der Klartext IST der gespeicherte Wert. So zeigt
// der Test den Unterschied zwischen „entschluesselt ausgeliefert" und „weg".
jest.mock("@/lib/encryption", () => ({ decrypt: (v: string) => v, encrypt: (v: string) => v }));
// Die ECHTEN Rollenlisten, nur `canAccessProcess` als Attrappe. Eine Kopie der
// Listen bliebe gruen, wenn jemand HR_EDIT_ROLES oder FINANCIAL_ROLES aendert.
jest.mock("@/lib/permissions", () => {
  const echt = jest.requireActual("@/lib/permissions");
  return { ...echt, canAccessProcess: (...a: unknown[]) => mockCanAccessProcess(...a) };
});

import { GET } from "@/app/api/offboarding/[id]/route";
import { NextRequest } from "next/server";
import { FINANCIAL_ROLES, HR_EDIT_ROLES, PORTAL_ROLES } from "@/lib/permissions";

const ID = "off-a";
const TOKEN = "geheimer-abteilungs-token-0815";
const ABFINDUNG = "18500,00";

const laden = () =>
  GET(new NextRequest(`https://hr.example.org/api/offboarding/${ID}`), {
    params: Promise.resolve({ id: ID }),
  });

/** Die Relationen, die das `include` der Route anfordern kann. */
const RELATIONEN: Record<string, unknown> = {
  organization: { id: "org-fv", name: "Förderverein FES" },
  exitData: { id: "ex-a", severancePay: ABFINDUNG },
  checklistItems: [
    { id: "auf-1", title: "Zugang sperren", category: "IT", assignee: "IT", orderIndex: 0, completedAt: null, completedById: null, dueDate: null },
  ],
  returnItems: [],
  documents: [],
  notes: [{ id: "n-1", text: "Intern: Gespräch läuft", createdBy: { firstName: "Hilde", lastName: "Reich" } }],
  departmentLinks: [
    {
      id: "lnk-it",
      offboardingId: ID,
      departmentKey: "IT",
      token: TOKEN,
      sentAt: new Date("2027-07-01T08:00:00.000Z"),
      lastSentAt: null,
      expiresAt: new Date("2027-09-01T08:00:00.000Z"),
      firstOpenedAt: null,
      lastOpenedAt: null,
      openCount: 3,
      lastReminderAt: null,
      reminderCount: 0,
      allTasksComplete: false,
      completedAt: null,
      lastSendStatus: "SENT",
      lastSendDetail: null,
      entwertetGrund: null,
    },
  ],
  auditLogs: [{ id: "aud-1", action: "STATUS_CHANGED", userId: "u1", details: {}, createdAt: new Date("2027-07-02T08:00:00.000Z") }],
  zeugnisBewertung: null,
  contractEnd: null,
};

/** Die flachen Felder des Vorgangs. */
const VORGANG = {
  id: ID,
  displayId: "OFF-2027-FV-001",
  organizationId: "org-fv",
  arbeitsortId: null,
  status: "INITIATED",
  exitType: "KUENDIGUNG_ARBEITNEHMER",
  onboardingId: null,
  weitereBeschaeftigung: null,
  employeeFirstName: "Anna",
  employeeLastName: "Schmidt",
  employeeEmail: "a.schmidt@fes-minden.de",
  employeePrivateEmail: "anna.privat@example.org",
  employeePersonalNr: null,
  lastWorkingDay: new Date("2027-07-31T00:00:00.000Z"),
  supervisorEmail: "leitung@example.org",
  supervisorName: "Lea Leitung",
};

/**
 * Include-treue Attrappe: Eine Relation steht nur dann in der Zeile, wenn sie
 * im `include` steht — wie bei Prisma. Genau das macht `auditLogs === undefined`
 * zu einem Beleg: Die Abfrage hat sie nicht geholt. Eine Attrappe, die die
 * Relation unabhaengig vom `include` herausgibt, koennte das nicht zeigen.
 */
function findUniqueWiePrisma() {
  mockPrisma.offboardingProcess.findUnique.mockImplementation(
    async (args: { include?: Record<string, unknown> }) => {
      const zeile: Record<string, unknown> = structuredClone(VORGANG);
      for (const [name, wert] of Object.entries(RELATIONEN)) {
        if (args?.include?.[name]) zeile[name] = structuredClone(wert);
      }
      return zeile;
    },
  );
}

/** Das `include` der Vorgangsabfrage. */
const include = () => mockPrisma.offboardingProcess.findUnique.mock.calls[0][0].include;

describe("GET /api/offboarding/[id] – Datenzuschnitt je Rolle", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSession.mockResolvedValue({ userId: "u1", role: "HR_LEITUNG" });
    mockCanAccessProcess.mockResolvedValue(true);
    findUniqueWiePrisma();
    mockPrisma.departmentConfig.findMany.mockResolvedValue([
      { id: "dc-it", departmentKey: "IT", name: "IT", email: "it@example.org", organizationId: null, isActive: true },
    ]);
    mockPrisma.user.findMany.mockResolvedValue([]);
    mockPrisma.onboardingProcess.findMany.mockResolvedValue([]);
  });

  it("HR: Protokoll abgefragt, Abfindung entschluesselt, Link samt Schluessel", async () => {
    const res = await laden();
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(include()).toHaveProperty("auditLogs");
    expect(body.auditLogs).toHaveLength(1);
    expect(body.exitData.severancePay).toBe(ABFINDUNG);
    expect(body.departmentLinks[0].token).toBe(TOKEN);
    expect(body.departmentLinks[0].url).toContain(TOKEN);
    expect(body.abteilungen.zeilen.find((z: { departmentKey: string }) => z.departmentKey === "IT")?.link?.url).toContain(TOKEN);
  });

  describe.each(PORTAL_ROLES.filter((r: string) => !HR_EDIT_ROLES.includes(r)))("%s", (rolle: string) => {
    beforeEach(() => {
      mockGetSession.mockResolvedValue({ userId: "u2", role: rolle });
    });

    it("das Protokoll wird GAR NICHT abgefragt und steht nicht in der Antwort", async () => {
      const body = await (await laden()).json();
      expect(include()).not.toHaveProperty("auditLogs");
      expect(body.auditLogs).toBeUndefined();
    });

    it("der Link-Schluessel ist an allen drei Stellen weg, der Stand bleibt", async () => {
      const body = await (await laden()).json();
      const zeile = body.abteilungen.zeilen.find((z: { departmentKey: string }) => z.departmentKey === "IT");

      expect(body.departmentLinks[0].token).toBeUndefined();
      expect(body.departmentLinks[0].url).toBeUndefined();
      expect(zeile?.link?.url).toBeUndefined();
      // Auch nicht in einem Feld, das wir nicht bedacht haben.
      expect(JSON.stringify(body)).not.toContain(TOKEN);

      // Der Stand bleibt lesbar: informiert, wie oft geoeffnet, Gueltigkeit.
      expect(body.departmentLinks[0].id).toBe("lnk-it");
      expect(body.departmentLinks[0].sentAt).toBe("2027-07-01T08:00:00.000Z");
      expect(body.departmentLinks[0].openCount).toBe(3);
      expect(zeile?.link?.id).toBe("lnk-it");
      expect(zeile?.link?.sentAt).toBe("2027-07-01T08:00:00.000Z");
    });

    it("die internen Notizen samt Urheber bleiben — so entschieden", async () => {
      const body = await (await laden()).json();
      expect(body.notes).toHaveLength(1);
      expect(body.notes[0].createdBy).toEqual({ firstName: "Hilde", lastName: "Reich" });
    });
  });

  describe("Abfindung: nur FINANCIAL_ROLES", () => {
    it.each(FINANCIAL_ROLES)("%s sieht sie entschluesselt", async (rolle) => {
      mockGetSession.mockResolvedValue({ userId: "u3", role: rolle });
      const body = await (await laden()).json();
      expect(body.exitData.severancePay).toBe(ABFINDUNG);
    });

    it.each(PORTAL_ROLES.filter((r: string) => !FINANCIAL_ROLES.includes(r)))(
      "%s sieht sie nicht — auch nicht verschluesselt",
      async (rolle) => {
        mockGetSession.mockResolvedValue({ userId: "u4", role: rolle });
        const body = await (await laden()).json();
        expect(body.exitData.severancePay).toBeNull();
        expect(JSON.stringify(body)).not.toContain(ABFINDUNG);
      },
    );
  });
});
