/**
 * GET /api/personalstamm/pruefen — der Block „Zu prüfen" der Ansicht
 * „Personen" (Self-Service S0, Bauvorgabe E8).
 *
 * Zugriff nur fuer die drei HR-Rollen (authHandler, ohne SERVICE), die
 * Hinweisfarbe rot/gelb/null und das Zusammenfassen der Lauf-Meldungen je
 * Vertrag und Grundcode samt Abraeumen durch einen spaeteren Lauf.
 */

const mockGetSession = jest.fn();
const mockPrisma = {
  employee: { count: jest.fn(), findMany: jest.fn() },
  auditLog: { findMany: jest.fn(), findFirst: jest.fn() },
};

jest.mock("@/lib/auth", () => ({ getSession: mockGetSession }));
jest.mock("@/lib/db", () => ({ prisma: mockPrisma }));

import { NextRequest } from "next/server";
import { GET } from "@/app/api/personalstamm/pruefen/route";
import { ANMELDUNG_ABGEWIESEN_ACTION, PERSONALSTAMM_ACTIONS } from "@/lib/constants";
import { meldungenZusammenfassen, personalstammPruefen } from "@/lib/personalstamm/pruefen";

const HR = {
  userId: "hr1",
  email: "hr@credo-gruppe.de",
  role: "HR_SACHBEARBEITER",
  firstName: "H",
  lastName: "S",
};

const JETZT = new Date("2026-10-17T10:00:00.000Z");

interface Zeile {
  createdAt: Date;
  details: unknown;
}

let laeufe: Zeile[];
let abgewiesene: Zeile[];

function lauf(iso: string, meldungen: { schluessel: string; code: string }[]): Zeile {
  return { createdAt: new Date(iso), details: { zahlen: {}, meldungen } };
}

async function aufrufen() {
  const res = await GET(new NextRequest("http://localhost:3000/api/personalstamm/pruefen"), {
    params: Promise.resolve({}),
  });
  return { status: res.status, body: await res.json() };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetSession.mockResolvedValue(HR);
  laeufe = [];
  abgewiesene = [];
  mockPrisma.employee.count.mockResolvedValue(0);
  mockPrisma.employee.findMany.mockResolvedValue([]);
  mockPrisma.auditLog.findMany.mockImplementation(async ({ where }: { where: { action: string } }) =>
    where.action === PERSONALSTAMM_ACTIONS.LAUF ? laeufe : abgewiesene,
  );
  mockPrisma.auditLog.findFirst.mockImplementation(async () =>
    laeufe.length ? { createdAt: laeufe[0].createdAt } : null,
  );
});

describe("Zugriff", () => {
  it("401 ohne Sitzung, ohne die Datenbank zu fragen", async () => {
    mockGetSession.mockResolvedValue(null);
    const { status } = await aufrufen();
    expect(status).toBe(401);
    expect(mockPrisma.employee.count).not.toHaveBeenCalled();
  });

  it.each(["SERVICE", "EINRICHTUNGSLEITUNG", "VORGESETZTER", "BEM_BEAUFTRAGTER"])(
    "403 fuer %s",
    async (role) => {
      mockGetSession.mockResolvedValue({ ...HR, role });
      const { status } = await aufrufen();
      expect(status).toBe(403);
      expect(mockPrisma.auditLog.findMany).not.toHaveBeenCalled();
    },
  );

  it.each(["SUPER_ADMIN", "HR_LEITUNG", "HR_SACHBEARBEITER"])("200 fuer %s", async (role) => {
    mockGetSession.mockResolvedValue({ ...HR, role });
    const { status, body } = await aufrufen();
    expect(status).toBe(200);
    expect(body.data).toEqual({
      nichtGeliefert: { anzahl: 0, personen: [] },
      meldungen: [],
      abgewieseneAnmeldungen: [],
      letzterLauf: null,
      hinweis: null,
    });
  });
});

describe("Hinweis", () => {
  it("rot, sobald eine aktive DokuBit-Person nicht geliefert wurde — auch wenn es Meldungen gibt", async () => {
    mockPrisma.employee.count.mockResolvedValue(2);
    mockPrisma.employee.findMany.mockResolvedValue([
      { id: "e1", firstName: "Anna", lastName: "Alt", lastSyncAt: new Date("2026-10-15T02:30:00.000Z") },
      { id: "e2", firstName: "Bernd", lastName: "Nie", lastSyncAt: null },
    ]);
    laeufe = [lauf("2026-10-17T02:30:00.000Z", [{ schluessel: "742|01|1001", code: "MAIL_FEHLT" }])];

    const { body } = await aufrufen();

    expect(body.data.hinweis).toBe("rot");
    expect(body.data.nichtGeliefert).toEqual({
      anzahl: 2,
      personen: [
        { id: "e1", name: "Anna Alt", lastSyncAt: "2026-10-15T02:30:00.000Z" },
        { id: "e2", name: "Bernd Nie", lastSyncAt: null },
      ],
    });
    expect(body.data.letzterLauf).toBe("2026-10-17T02:30:00.000Z");
  });

  it("gelb bei Meldungen ohne nicht Gelieferte", async () => {
    laeufe = [lauf("2026-10-17T02:30:00.000Z", [{ schluessel: "742|01|1001", code: "MAIL_FEHLT" }])];
    const { body } = await aufrufen();
    expect(body.data.hinweis).toBe("gelb");
  });

  it("gelb bei abgewiesenen Anmeldungen, je Adresse zusammengefasst", async () => {
    abgewiesene = [
      { createdAt: new Date("2026-10-16T08:00:00.000Z"), details: { email: "X@fes-minden.de " } },
      { createdAt: new Date("2026-10-15T08:00:00.000Z"), details: { email: "x@fes-minden.de" } },
      { createdAt: new Date("2026-10-14T08:00:00.000Z"), details: { email: "y@fes-minden.de" } },
    ];
    const { body } = await aufrufen();
    expect(body.data.hinweis).toBe("gelb");
    expect(body.data.abgewieseneAnmeldungen).toEqual([
      { email: "x@fes-minden.de", anzahl: 2, zuletzt: "2026-10-16T08:00:00.000Z" },
      { email: "y@fes-minden.de", anzahl: 1, zuletzt: "2026-10-14T08:00:00.000Z" },
    ]);
  });

  it("null, wenn nichts zu pruefen ist — ein Lauf ohne Meldungen zaehlt nicht", async () => {
    laeufe = [lauf("2026-10-17T02:30:00.000Z", [])];
    const { body } = await aufrufen();
    expect(body.data.hinweis).toBeNull();
    expect(body.data.letzterLauf).toBe("2026-10-17T02:30:00.000Z");
  });
});

describe("Abfragen", () => {
  it("nicht geliefert: aktiv, Quelle DOKUBIT, lastSyncAt aelter als 26 Stunden oder leer", async () => {
    await personalstammPruefen({ jetzt: JETZT });
    const where = mockPrisma.employee.count.mock.calls[0][0].where;
    expect(where).toEqual({
      isActive: true,
      importSource: "DOKUBIT",
      OR: [{ lastSyncAt: { lt: new Date("2026-10-16T08:00:00.000Z") } }, { lastSyncAt: null }],
    });
    expect(mockPrisma.employee.findMany.mock.calls[0][0]).toMatchObject({ where, take: 50 });
  });

  it("Meldungen der letzten 24 Stunden, abgewiesene Anmeldungen der letzten 14 Tage", async () => {
    await personalstammPruefen({ jetzt: JETZT });
    const wheres = mockPrisma.auditLog.findMany.mock.calls.map((c) => c[0].where);
    expect(wheres).toContainEqual({
      action: PERSONALSTAMM_ACTIONS.LAUF,
      createdAt: { gte: new Date("2026-10-16T10:00:00.000Z") },
    });
    expect(wheres).toContainEqual({
      action: ANMELDUNG_ABGEWIESEN_ACTION,
      createdAt: { gte: new Date("2026-10-03T10:00:00.000Z") },
    });
  });

  it("letzter Lauf ohne Zeitfenster — sonst hiesse ein seit Tagen stehender Abgleich „noch keiner gelaufen“", async () => {
    await personalstammPruefen({ jetzt: JETZT });
    const { where, orderBy } = mockPrisma.auditLog.findFirst.mock.calls[0][0];
    expect(where).toEqual({ action: PERSONALSTAMM_ACTIONS.LAUF });
    expect(orderBy).toEqual({ createdAt: "desc" });
  });
});

describe("Meldungen zusammenfassen", () => {
  it("je Schluessel und Code einmal, mit Anzahl, letztem Zeitpunkt und Beschriftung", async () => {
    laeufe = [
      lauf("2026-10-17T02:30:00.000Z", [
        { schluessel: "742|01|1001", code: "MAIL_FEHLT" },
        { schluessel: "719|02|77", code: "MANDANT_UNBEKANNT" },
      ]),
      lauf("2026-10-16T14:00:00.000Z", [{ schluessel: "742|01|1001", code: "MAIL_FEHLT" }]),
    ];
    const { body } = await aufrufen();
    expect(body.data.meldungen).toEqual([
      {
        schluessel: "719|02|77",
        code: "MANDANT_UNBEKANNT",
        label: "Mandant im Portal unbekannt",
        anzahl: 1,
        zuletzt: "2026-10-17T02:30:00.000Z",
      },
      {
        schluessel: "742|01|1001",
        code: "MAIL_FEHLT",
        label: "Vertrag ohne dienstliche Adresse",
        anzahl: 2,
        zuletzt: "2026-10-17T02:30:00.000Z",
      },
    ]);
  });

  it("derselbe Code fuer verschiedene Vertraege bleibt getrennt", () => {
    const ergebnis = meldungenZusammenfassen([
      lauf("2026-10-17T02:30:00.000Z", [
        { schluessel: "742|01|1001", code: "EMAIL_MEHRDEUTIG" },
        { schluessel: "742|02|1001", code: "EMAIL_MEHRDEUTIG" },
      ]),
    ]);
    expect(ergebnis.map((m) => m.schluessel)).toEqual(["742|01|1001", "742|02|1001"]);
  });

  it("ein Code, den der juengste Lauf mit diesem Vertrag nicht mehr nennt, entfaellt", () => {
    // Der Vertrag lief spaeter mit einem anderen Grund durch: Die doppelte
    // Person ist bereinigt, jetzt passt nur noch der Name nicht.
    const ergebnis = meldungenZusammenfassen([
      lauf("2026-10-16T14:00:00.000Z", [{ schluessel: "742|01|1001", code: "EMAIL_MEHRDEUTIG" }]),
      lauf("2026-10-17T02:30:00.000Z", [{ schluessel: "742|01|1001", code: "EMAIL_ANDERER_NAME" }]),
    ]);
    expect(ergebnis.map((m) => m.code)).toEqual(["EMAIL_ANDERER_NAME"]);
  });

  it("ein Vertrag, der im juengsten Lauf nicht vorkam, bleibt stehen", () => {
    const ergebnis = meldungenZusammenfassen([
      lauf("2026-10-17T02:30:00.000Z", [{ schluessel: "719|02|77", code: "MAIL_FEHLT" }]),
      lauf("2026-10-16T14:00:00.000Z", [{ schluessel: "742|01|1001", code: "EMAIL_ANDERER_NAME" }]),
    ]);
    expect(ergebnis.map((m) => `${m.schluessel}/${m.code}`)).toEqual([
      "719|02|77/MAIL_FEHLT",
      "742|01|1001/EMAIL_ANDERER_NAME",
    ]);
  });

  it("Zeilen ohne lesbaren Schluessel werden je Lauf gefuehrt, nie ueber Laeufe zusammengezaehlt", () => {
    // Index 5 im einen Stapel ist eine andere DokuBit-Zeile als Index 5 im naechsten.
    const ergebnis = meldungenZusammenfassen([
      lauf("2026-10-17T02:30:00.000Z", [{ schluessel: "zeile:5", code: "FORMATFEHLER" }]),
      lauf("2026-10-17T02:31:00.000Z", [{ schluessel: "zeile:5", code: "FORMATFEHLER" }]),
    ]);
    expect(ergebnis.map((m) => [m.schluessel, m.anzahl, m.zuletzt])).toEqual([
      ["zeile:5", 1, "2026-10-17T02:31:00.000Z"],
      ["zeile:5", 1, "2026-10-17T02:30:00.000Z"],
    ]);
  });

  it("Unlesbares im Protokoll wird uebergangen, ein unbekannter Code bleibt roh lesbar", () => {
    const ergebnis = meldungenZusammenfassen([
      { createdAt: new Date("2026-10-17T02:30:00.000Z"), details: null },
      { createdAt: new Date("2026-10-17T02:31:00.000Z"), details: { meldungen: "kaputt" } },
      {
        createdAt: new Date("2026-10-17T02:32:00.000Z"),
        details: { meldungen: [null, { schluessel: 5 }, { schluessel: "zeile:3", code: "GIBT_ES_NICHT" }] },
      },
    ]);
    expect(ergebnis).toEqual([
      {
        schluessel: "zeile:3",
        code: "GIBT_ES_NICHT",
        label: "GIBT_ES_NICHT",
        anzahl: 1,
        zuletzt: "2026-10-17T02:32:00.000Z",
      },
    ]);
  });
});
