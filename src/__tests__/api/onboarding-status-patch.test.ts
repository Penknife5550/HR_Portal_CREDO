/**
 * Tests: Statusaenderung durch HR (PATCH /api/onboarding/[id])
 *
 * Frueher liess der Server jeden der acht Status zu; nur die Oberflaeche
 * schraenkte den Knopf „Als geprüft markieren" ein — und zeigte ihn im
 * festhaengenden Fall trotz fehlendem Fragebogen. Jetzt prueft der Server die
 * Uebergaenge selbst (Entscheidung 21.09.2026):
 *   REVIEWED  nur bei bereitZurPruefung
 *   COMPLETED nur aus REVIEWED
 *   EXPIRED   jederzeit
 *   INVITED…SUPERVISOR_SUBMITTED gar nicht von Hand (abgeleitet)
 *
 * Paket A3 (Ausstattung & Zugaenge, Feinplan S19, E-A19): COMPLETED mit
 * offenen Ausstattungs- oder Hinweis-Aufgaben nur mit `bestaetigt: true`,
 * sonst 409 AUSSTATTUNG_OFFEN samt Liste — gezaehlt NACH dem bedingten
 * Update, in derselben Transaktion; das WHERE des Updates bleibt unveraendert.
 * EXPIRED setzt `expiredAt` (F12).
 *
 * Paket A4 (Feinplan S27, G10): EXPIRED gibt jedem noch ausgegebenen Stueck
 * ohne Austrittsbezug die Loeschfrist „drei Jahre ab Ende des Berliner Jahres
 * von `expiredAt`“ — nach dem bedingten Update, im selben Commit, Protokoll
 * `ausgabenMitFrist`. Ohne Ausgaben nur die Zaehlung.
 */

const mockPrisma = {
  onboardingProcess: {
    findUnique: jest.fn(),
    updateMany: jest.fn(),
  },
  // Paket A3 (S19): offene Ausstattungs- und Hinweis-Aufgaben beim Abschluss.
  checklistItem: { findMany: jest.fn() },
  // Stellennamen der Liste in der 409 (Einstellungen → Abteilungen).
  departmentConfig: { findMany: jest.fn() },
  auditLog: { create: jest.fn() },
  userOrgAssignment: { findUnique: jest.fn() },
  // Paket A4 (S27, G10): Frist bei der Absage samt Austrittsbezuegen (G28).
  ausgabe: { count: jest.fn(), findMany: jest.fn(), updateMany: jest.fn() },
  offboardingChecklistItem: { findMany: jest.fn() },
  returnItem: { findMany: jest.fn() },
  offboardingProcess: { findMany: jest.fn() },
  $transaction: jest.fn(),
};
const mockSession = jest.fn();

jest.mock("@/lib/db", () => ({ prisma: mockPrisma }));
jest.mock("@/lib/auth", () => ({ getSession: () => mockSession() }));
jest.mock("@/lib/encryption", () => ({ decrypt: (v: string) => v }));

import { PATCH } from "@/app/api/onboarding/[id]/route";
import { NextRequest } from "next/server";
import { abschlussOffenMeldung } from "@/lib/ausstattung";

const ADMIN = {
  userId: "u-admin",
  email: "leitung@credo.example",
  role: "HR_LEITUNG",
  firstName: "L",
  lastName: "H",
};
const ZEIT = new Date("2026-09-18T09:00:00Z");

function patch(body: unknown) {
  return PATCH(
    new NextRequest("http://localhost:3000/api/onboarding/ob1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: "ob1" }) },
  );
}

function vorgang(teil: Record<string, unknown> = {}) {
  return {
    id: "ob1",
    organizationId: "org1",
    status: "SUBMITTED",
    submittedAt: ZEIT,
    supervisorSubmittedAt: null,
    supervisorToken: null,
    personalData: { currentStep: 12, isComplete: true },
    supervisorData: null,
    ...teil,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSession.mockResolvedValue(ADMIN);
  // Erster Aufruf: der Vorgang zur Pruefung; zweiter: die Antwort nach dem Schreiben.
  mockPrisma.onboardingProcess.findUnique.mockResolvedValue(vorgang());
  mockPrisma.onboardingProcess.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.checklistItem.findMany.mockResolvedValue([]);
  mockPrisma.departmentConfig.findMany.mockResolvedValue([]);
  mockPrisma.auditLog.create.mockResolvedValue({});
  // A4 (S27): ohne Ausgaben — die bestehenden Faelle bleiben, wie sie waren.
  mockPrisma.ausgabe.count.mockResolvedValue(0);
  mockPrisma.ausgabe.findMany.mockResolvedValue([]);
  mockPrisma.ausgabe.updateMany.mockImplementation(async ({ where }: { where: { id: string | { in: string[] } } }) => ({
    count: typeof where.id === "string" ? 1 : where.id.in.length,
  }));
  mockPrisma.offboardingChecklistItem.findMany.mockResolvedValue([]);
  mockPrisma.returnItem.findMany.mockResolvedValue([]);
  mockPrisma.offboardingProcess.findMany.mockResolvedValue([]);
  mockPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
    fn(mockPrisma),
  );
});

describe("REVIEWED — nur wenn bereit zur Pruefung", () => {
  it("geht bei eingereichtem Fragebogen ohne Vorgesetzten-Link", async () => {
    const res = await patch({ status: "REVIEWED" });
    expect(res.status).toBe(200);
    const arg = mockPrisma.onboardingProcess.updateMany.mock.calls[0][0];
    expect(arg.data).toMatchObject({ status: "REVIEWED", reviewedById: "u-admin" });
    expect(arg.data.reviewedAt).toBeInstanceOf(Date);
  });

  it("geht, wenn beides eingereicht ist", async () => {
    mockPrisma.onboardingProcess.findUnique.mockResolvedValue(
      vorgang({
        status: "SUPERVISOR_SUBMITTED",
        supervisorToken: "t",
        supervisorSubmittedAt: ZEIT,
      }),
    );
    expect((await patch({ status: "REVIEWED" })).status).toBe(200);
  });

  it("409 ohne eingereichten Fragebogen — auch wenn die Modalitaeten da sind", async () => {
    // Genau der festhaengende Fall, in dem die Oberflaeche den Knopf zeigte.
    mockPrisma.onboardingProcess.findUnique.mockResolvedValue(
      vorgang({
        status: "SUPERVISOR_SUBMITTED",
        submittedAt: null,
        personalData: { currentStep: 4, isComplete: false },
        supervisorToken: "t",
        supervisorSubmittedAt: ZEIT,
      }),
    );
    const res = await patch({ status: "REVIEWED" });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain("Personalfragebogen");
    expect(mockPrisma.onboardingProcess.updateMany).not.toHaveBeenCalled();
  });

  it("409, wenn ein Vorgesetzten-Link besteht, die Modalitaeten aber fehlen", async () => {
    mockPrisma.onboardingProcess.findUnique.mockResolvedValue(
      vorgang({ status: "SUPERVISOR_PENDING", supervisorToken: "t" }),
    );
    const res = await patch({ status: "REVIEWED" });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain("Einstellungsmodalitäten");
  });

  it("schreibt bedingt auf den gelesenen Stand — ein Rennen ergibt 409 statt einer veralteten Entscheidung", async () => {
    mockPrisma.onboardingProcess.updateMany.mockResolvedValue({ count: 0 });
    const res = await patch({ status: "REVIEWED" });
    expect(res.status).toBe(409);
    const arg = mockPrisma.onboardingProcess.updateMany.mock.calls[0][0];
    expect(arg.where).toEqual({
      id: "ob1",
      status: "SUBMITTED",
      submittedAt: ZEIT,
      supervisorSubmittedAt: null,
      supervisorToken: null,
    });
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("protokolliert den Wechsel im selben Commit", async () => {
    await patch({ status: "REVIEWED" });
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mockPrisma.auditLog.create.mock.calls[0][0].data).toMatchObject({
      action: "STATUS_CHANGED",
      details: { from: "SUBMITTED", to: "REVIEWED" },
    });
  });
});

describe("COMPLETED — nur aus REVIEWED", () => {
  it("geht aus REVIEWED", async () => {
    mockPrisma.onboardingProcess.findUnique.mockResolvedValue(vorgang({ status: "REVIEWED" }));
    const res = await patch({ status: "COMPLETED" });
    expect(res.status).toBe(200);
    expect(mockPrisma.onboardingProcess.updateMany.mock.calls[0][0].data.completedAt).toBeInstanceOf(
      Date,
    );
  });

  it.each(["SUBMITTED", "SUPERVISOR_SUBMITTED", "IN_PROGRESS"])("409 aus %s", async (status) => {
    mockPrisma.onboardingProcess.findUnique.mockResolvedValue(vorgang({ status }));
    expect((await patch({ status: "COMPLETED" })).status).toBe(409);
    expect(mockPrisma.onboardingProcess.updateMany).not.toHaveBeenCalled();
  });
});

describe("EXPIRED — jederzeit", () => {
  it.each(["INVITED", "IN_PROGRESS", "SUPERVISOR_PENDING", "REVIEWED"])("geht aus %s", async (status) => {
    mockPrisma.onboardingProcess.findUnique.mockResolvedValue(vorgang({ status }));
    expect((await patch({ status: "EXPIRED" })).status).toBe(200);
  });

  it("setzt `expiredAt` (F12, Grundlage der Löschfrist) — und zählt keine Ausstattung", async () => {
    mockPrisma.onboardingProcess.findUnique.mockResolvedValue(vorgang({ status: "REVIEWED" }));
    mockPrisma.checklistItem.findMany.mockResolvedValue([{ title: "Dienst-iPad (Lernmittel) bereitstellen", assignee: "IT" }]);
    const res = await patch({ status: "EXPIRED" });
    expect(res.status).toBe(200);
    const { data } = mockPrisma.onboardingProcess.updateMany.mock.calls[0][0];
    expect(Object.keys(data).sort()).toEqual(["expiredAt", "status"]);
    expect(data.status).toBe("EXPIRED");
    expect(data.expiredAt).toBeInstanceOf(Date);
    // Offene Ausstattung haelt einen Abbruch nicht auf (dafuer gibt es die Absage, E-A20).
    expect(mockPrisma.checklistItem.findMany).not.toHaveBeenCalled();
  });
});

describe("EXPIRED mit ausgegebenen Stücken: Frist bei der Absage (A4, S27, G10)", () => {
  // 01.01.2028, 00:30 Uhr in Berlin — in UTC noch der 31.12.2027. Das
  // BERLINER Jahr der Absage zaehlt: drei Jahre ab Jahresende = 1.1.2032.
  const ABSAGE = new Date("2027-12-31T23:30:00.000Z");
  const FRIST = new Date("2031-12-31T23:00:00.000Z");
  const NUR_DATUM_FAELSCHEN = [
    "hrtime",
    "nextTick",
    "performance",
    "queueMicrotask",
    "requestAnimationFrame",
    "cancelAnimationFrame",
    "requestIdleCallback",
    "cancelIdleCallback",
    "setImmediate",
    "clearImmediate",
    "setInterval",
    "clearInterval",
    "setTimeout",
    "clearTimeout",
  ] as const;
  const VERMERKT = new Date("2027-11-02T09:00:00.000Z");

  /** Die aktiven Stuecke, wie sie nach der Sperre gelesen werden. */
  let frisch: { id: string; zustand: string; zustandAm: Date }[];
  /** Wird gerade die Transaktion ausgefuehrt? (Frist im selben Commit) */
  let inTransaktion: boolean;
  let fristInTransaktion: boolean[];

  /** Die Schreibaufrufe, die eine Frist setzen (die Sperre schreibt nur `updatedAt`). */
  const fristUpdates = () =>
    mockPrisma.ausgabe.updateMany.mock.calls
      .map((c) => c[0] as { where: Record<string, unknown>; data: Record<string, unknown> })
      .filter((arg) => "loeschenAb" in arg.data);
  const sperren = () =>
    mockPrisma.ausgabe.updateMany.mock.calls
      .map((c) => c[0] as { where: { id: string }; data: Record<string, unknown> })
      .filter((arg) => "updatedAt" in arg.data);

  beforeEach(() => {
    jest.useFakeTimers({ now: ABSAGE, doNotFake: [...NUR_DATUM_FAELSCHEN] });
    mockPrisma.onboardingProcess.findUnique.mockResolvedValue(vorgang({ status: "REVIEWED" }));
    frisch = [
      // frei: keine Bezuege
      { id: "ag-frei", zustand: "AUSGEGEBEN", zustandAm: VERMERKT },
      // gebunden: Ruecknahmeaufgabe eines laufenden Austritts
      { id: "ag-laufend", zustand: "AUSGEGEBEN", zustandAm: VERMERKT },
      // frei: nur eine Rueckgabe eines ABGEBROCHENEN Austritts (G28)
      { id: "ag-abgebrochen", zustand: "AUSGEGEBEN", zustandAm: VERMERKT },
      // Bestand der Person aus einem abgeschlossenen Austritt: ohne Frist (G20)
      { id: "ag-verbleibt", zustand: "VERBLEIBT", zustandAm: VERMERKT },
    ];
    mockPrisma.ausgabe.count.mockResolvedValue(4);
    mockPrisma.ausgabe.findMany.mockImplementation(async ({ select }: { select: Record<string, boolean> }) =>
      select.zustand ? frisch : frisch.map(({ id }) => ({ id })),
    );
    mockPrisma.offboardingChecklistItem.findMany.mockResolvedValue([
      { ausgabeId: "ag-laufend", offboardingId: "off-laufend" },
    ]);
    mockPrisma.returnItem.findMany.mockResolvedValue([
      { ausgabeId: "ag-abgebrochen", offboardingId: "off-abgebrochen" },
      { ausgabeId: "ag-verbleibt", offboardingId: "off-alt" },
    ]);
    mockPrisma.offboardingProcess.findMany.mockResolvedValue([
      { id: "off-laufend", status: "NOTICE_PERIOD", displayId: "OFF-2027-01", organizationId: "org1" },
      { id: "off-abgebrochen", status: "CANCELLED", displayId: "OFF-2027-02", organizationId: "org1" },
      { id: "off-alt", status: "COMPLETED", displayId: "OFF-2026-07", organizationId: "org1" },
    ]);
    inTransaktion = false;
    fristInTransaktion = [];
    mockPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => {
      inTransaktion = true;
      try {
        return await fn(mockPrisma);
      } finally {
        inTransaktion = false;
      }
    });
    mockPrisma.ausgabe.updateMany.mockImplementation(
      async ({ where, data }: { where: { id: string | { in: string[] } }; data: Record<string, unknown> }) => {
        if ("loeschenAb" in data) fristInTransaktion.push(inTransaktion);
        return { count: typeof where.id === "string" ? 1 : where.id.in.length };
      },
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("setzt `loeschenAb` aller aktiven Stücke ohne Austrittsbezug auf drei Jahre ab Ende des Berliner Jahres von `expiredAt`", async () => {
    const res = await patch({ status: "EXPIRED" });

    expect(res.status).toBe(200);
    const { data } = mockPrisma.onboardingProcess.updateMany.mock.calls[0][0];
    expect(data.expiredAt).toEqual(ABSAGE);
    // Genau EIN Update: frei und nur von einem abgebrochenen Austritt bezogen.
    // Gebunden (laufender Austritt) und VERBLEIBT bleiben ohne Frist.
    expect(fristUpdates()).toEqual([
      { where: { id: { in: ["ag-frei", "ag-abgebrochen"] }, zustand: "AUSGEGEBEN" }, data: { loeschenAb: FRIST } },
    ]);
    // Der Zustand und sein Zeitpunkt bleiben (1.2: „AUSGEGEBEN → AUSGEGEBEN mit Frist“).
    expect(Object.keys(fristUpdates()[0].data)).toEqual(["loeschenAb"]);
    expect(mockPrisma.auditLog.create.mock.calls[0][0].data).toMatchObject({
      action: "STATUS_CHANGED",
      details: { from: "REVIEWED", to: "EXPIRED", ausgabenMitFrist: 2 },
    });
  });

  it("nur aktive Stücke werden gezählt und gelesen — Endzustände behalten ihre Frist; geschrieben wird bedingt auf den gelesenen Zustand", async () => {
    // Zwischen dem ersten Lesen und der Sperre wurde ein Stueck zurueckgenommen.
    frisch[0] = { id: "ag-frei", zustand: "ZURUECK", zustandAm: ABSAGE };

    await patch({ status: "EXPIRED" });

    const aktiv = { onboardingId: "ob1", zustand: { in: ["AUSGEGEBEN", "VERBLEIBT"] } };
    expect(mockPrisma.ausgabe.count.mock.calls[0][0]).toEqual({ where: aktiv });
    expect(mockPrisma.ausgabe.findMany.mock.calls[0][0]).toEqual({ where: aktiv, select: { id: true } });
    expect(fristUpdates()).toEqual([
      { where: { id: { in: ["ag-abgebrochen"] }, zustand: "AUSGEGEBEN" }, data: { loeschenAb: FRIST } },
    ]);
    expect(mockPrisma.auditLog.create.mock.calls[0][0].data.details).toEqual({
      from: "REVIEWED",
      to: "EXPIRED",
      ausgabenMitFrist: 1,
    });
  });

  it("im selben Commit, NACH dem bedingten Statuswechsel; die Stücke werden gesperrt, bevor ihre Bezüge gelesen werden", async () => {
    await patch({ status: "EXPIRED" });

    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(fristInTransaktion).toEqual([true]);
    // Sperre je Stueck, nach `id` sortiert (G24).
    expect(sperren().map((s) => s.where.id)).toEqual(["ag-abgebrochen", "ag-frei", "ag-laufend", "ag-verbleibt"]);

    const reihenfolge = (fn: jest.Mock) => fn.mock.invocationCallOrder[0];
    const ausgabeUpdates = mockPrisma.ausgabe.updateMany.mock.invocationCallOrder;
    const status = reihenfolge(mockPrisma.onboardingProcess.updateMany);
    const zaehlen = reihenfolge(mockPrisma.ausgabe.count);
    const ersteSperre = ausgabeUpdates[0];
    const bezuege = reihenfolge(mockPrisma.offboardingChecklistItem.findMany);
    const frist = ausgabeUpdates[ausgabeUpdates.length - 1];
    const protokoll = reihenfolge(mockPrisma.auditLog.create);
    expect([status, zaehlen, ersteSperre, bezuege, frist, protokoll]).toEqual(
      [status, zaehlen, ersteSperre, bezuege, frist, protokoll].slice().sort((a, b) => a - b),
    );
  });

  it("hat sich der Vorgang bewegt (409), wird keine Ausgabe gezählt und keine Frist geschrieben", async () => {
    mockPrisma.onboardingProcess.updateMany.mockResolvedValue({ count: 0 });

    const res = await patch({ status: "EXPIRED" });

    expect(res.status).toBe(409);
    expect(mockPrisma.ausgabe.count).not.toHaveBeenCalled();
    expect(mockPrisma.ausgabe.updateMany).not.toHaveBeenCalled();
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("scheitert das Protokoll, scheitert die Transaktion mit — die Frist steht nur im selben Commit", async () => {
    mockPrisma.auditLog.create.mockRejectedValue(new Error("DB weg"));
    const fehler = jest.spyOn(console, "error").mockImplementation(() => {});

    const res = await patch({ status: "EXPIRED" });

    expect(res.status).toBe(500);
    // Geschrieben wurde nur INNERHALB der (zurueckgerollten) Transaktion.
    expect(fristInTransaktion).toEqual([true]);
    fehler.mockRestore();
  });

  it("ohne Ausgaben keine zusätzliche Abfrage außer der Zählung; das Protokoll bleibt wie bisher", async () => {
    mockPrisma.ausgabe.count.mockResolvedValue(0);

    const res = await patch({ status: "EXPIRED" });

    expect(res.status).toBe(200);
    expect(mockPrisma.ausgabe.count).toHaveBeenCalledTimes(1);
    for (const fn of [
      mockPrisma.ausgabe.findMany,
      mockPrisma.ausgabe.updateMany,
      mockPrisma.offboardingChecklistItem.findMany,
      mockPrisma.returnItem.findMany,
      mockPrisma.offboardingProcess.findMany,
    ]) {
      expect(fn).not.toHaveBeenCalled();
    }
    expect(mockPrisma.auditLog.create.mock.calls[0][0].data.details).toEqual({ from: "REVIEWED", to: "EXPIRED" });
  });

  it("alle Stücke gebunden: keine Frist, kein `ausgabenMitFrist` im Protokoll", async () => {
    frisch = [frisch[1]];
    mockPrisma.ausgabe.count.mockResolvedValue(1);

    await patch({ status: "EXPIRED" });

    expect(fristUpdates()).toEqual([]);
    expect(mockPrisma.auditLog.create.mock.calls[0][0].data.details).toEqual({ from: "REVIEWED", to: "EXPIRED" });
  });

  it("REVIEWED und COMPLETED fassen keine Ausgabe an", async () => {
    mockPrisma.onboardingProcess.findUnique.mockResolvedValue(vorgang());
    expect((await patch({ status: "REVIEWED" })).status).toBe(200);
    mockPrisma.onboardingProcess.findUnique.mockResolvedValue(vorgang({ status: "REVIEWED" }));
    expect((await patch({ status: "COMPLETED" })).status).toBe(200);
    expect(mockPrisma.ausgabe.count).not.toHaveBeenCalled();
    expect(mockPrisma.ausgabe.updateMany).not.toHaveBeenCalled();
  });
});

describe("COMPLETED mit offenen Ausstattungs- und Hinweis-Aufgaben (E-A19)", () => {
  // Arbeitsort Grundschule: Dort hat Facility einen eigenen Eintrag — die
  // Liste nennt die Stelle wie die Karte (am Arbeitsort, nicht an org1).
  const KONFIGS = [
    { departmentKey: "IT", departmentName: "IT-Abteilung", email: "it@example.org", organizationId: null, isActive: true },
    { departmentKey: "FACILITY", departmentName: "Facility Management", email: "fm@example.org", organizationId: null, isActive: true },
    { departmentKey: "FACILITY", departmentName: "Hausmeister Grundschule", email: "hm@example.org", organizationId: "org-gs", isActive: true },
  ];
  const OFFEN = [
    { title: "Dienst-iPad (Lernmittel) bereitstellen", assignee: "IT" },
    { title: "Hinweis der Führungskraft beachten", assignee: "FACILITY" },
    // Ein Zeilenumbruch im Titel (freie Position von HR) wird in der Liste ein Leerzeichen.
    { title: "Kopierkarte\nbereitstellen", assignee: "HR" },
  ];

  beforeEach(() => {
    mockPrisma.onboardingProcess.findUnique.mockResolvedValue(vorgang({ status: "REVIEWED", arbeitsortId: "org-gs" }));
    mockPrisma.checklistItem.findMany.mockResolvedValue(OFFEN);
    mockPrisma.departmentConfig.findMany.mockResolvedValue(KONFIGS);
  });

  it("ohne Bestätigung: 409 AUSSTATTUNG_OFFEN mit Titel und Stelle, kein Protokoll", async () => {
    const res = await patch({ status: "COMPLETED" });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: abschlussOffenMeldung(3),
      grund: "AUSSTATTUNG_OFFEN",
      offen: [
        { titel: "Dienst-iPad (Lernmittel) bereitstellen", stelle: "IT-Abteilung" },
        { titel: "Hinweis der Führungskraft beachten", stelle: "Hausmeister Grundschule" },
        { titel: "Kopierkarte bereitstellen", stelle: "Personalabteilung" },
      ],
    });
    expect(abschlussOffenMeldung(3)).toBe(
      "Aus „Ausstattung & Zugänge“ sind noch 3 Aufgaben offen. Nach dem Abschluss können die Stellen sie nicht mehr abhaken – abschließen nur mit Bestätigung.",
    );
    // Die Ausnahme rollt den Statuswechsel zurueck: kein Protokoll, kein Neuladen.
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
    expect(mockPrisma.onboardingProcess.findUnique).toHaveBeenCalledTimes(1);
  });

  it("gezählt wird NACH dem bedingten Update, in derselben Transaktion — das WHERE bleibt unverändert", async () => {
    await patch({ status: "COMPLETED" });
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    const [update] = mockPrisma.onboardingProcess.updateMany.mock.invocationCallOrder;
    const [zaehlen] = mockPrisma.checklistItem.findMany.mock.invocationCallOrder;
    expect(update).toBeLessThan(zaehlen);
    expect(mockPrisma.onboardingProcess.updateMany.mock.calls[0][0].where).toEqual({
      id: "ob1",
      status: "REVIEWED",
      submittedAt: ZEIT,
      supervisorSubmittedAt: null,
      supervisorToken: null,
    });
    // Nur Ausstattungs- und Hinweis-Aufgaben, nur offene (Entfallene sind isCompleted, F2).
    expect(mockPrisma.checklistItem.findMany.mock.calls[0][0]).toMatchObject({
      where: { onboardingId: "ob1", herkunft: { not: null }, isCompleted: false },
      select: { title: true, assignee: true },
    });
  });

  it("mit Bestätigung: 200, und das Protokoll nennt die Zahl der offen gebliebenen Aufgaben", async () => {
    const res = await patch({ status: "COMPLETED", bestaetigt: true });
    expect(res.status).toBe(200);
    expect(mockPrisma.onboardingProcess.updateMany.mock.calls[0][0].data).toMatchObject({ status: "COMPLETED" });
    expect(mockPrisma.auditLog.create.mock.calls[0][0].data).toMatchObject({
      action: "STATUS_CHANGED",
      details: { from: "REVIEWED", to: "COMPLETED", offeneAusstattung: 3 },
    });
  });

  it("ohne offene Ausstattung genügt der erste Klick; das Protokoll bleibt wie bisher", async () => {
    mockPrisma.checklistItem.findMany.mockResolvedValue([]);
    const res = await patch({ status: "COMPLETED" });
    expect(res.status).toBe(200);
    expect(mockPrisma.auditLog.create.mock.calls[0][0].data.details).toEqual({ from: "REVIEWED", to: "COMPLETED" });
    expect(mockPrisma.departmentConfig.findMany).not.toHaveBeenCalled();
  });

  it("`bestaetigt: false` gilt wie keine Bestätigung", async () => {
    expect((await patch({ status: "COMPLETED", bestaetigt: false })).status).toBe(409);
  });

  it("ein anderer Wert als true/false für `bestaetigt` ist ungültig (400)", async () => {
    const res = await patch({ status: "COMPLETED", bestaetigt: "ja" });
    expect(res.status).toBe(400);
    expect(mockPrisma.onboardingProcess.findUnique).not.toHaveBeenCalled();
  });

  it("hat sich der Vorgang bewegt, bleibt es bei 409 „gerade geändert“ — gezählt wird dann nicht", async () => {
    mockPrisma.onboardingProcess.updateMany.mockResolvedValue({ count: 0 });
    const res = await patch({ status: "COMPLETED" });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain("gerade geändert");
    expect(mockPrisma.checklistItem.findMany).not.toHaveBeenCalled();
  });

  it("REVIEWED zählt nichts — die Rückfrage gilt nur dem Abschluss", async () => {
    mockPrisma.onboardingProcess.findUnique.mockResolvedValue(vorgang());
    expect((await patch({ status: "REVIEWED" })).status).toBe(200);
    expect(mockPrisma.checklistItem.findMany).not.toHaveBeenCalled();
  });
});

describe("Abgeleitete Status und Eingaben", () => {
  it.each(["INVITED", "IN_PROGRESS", "SUBMITTED", "SUPERVISOR_PENDING", "SUPERVISOR_SUBMITTED"])(
    "%s ist nicht von Hand setzbar (400)",
    async (status) => {
      const res = await patch({ status });
      expect(res.status).toBe(400);
      expect(mockPrisma.onboardingProcess.findUnique).not.toHaveBeenCalled();
    },
  );

  it("weist einen unbekannten Status ab", async () => {
    const res = await patch({ status: "ERFUNDEN" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Ungültiger Status-Wert");
  });

  it("weist einen fehlenden Status ab", async () => {
    expect((await patch({})).status).toBe(400);
  });

  it("antwortet 404 fuer einen unbekannten Vorgang", async () => {
    mockPrisma.onboardingProcess.findUnique.mockResolvedValue(null);
    expect((await patch({ status: "EXPIRED" })).status).toBe(404);
  });

  it("verlangt HR-Bearbeitungsrechte", async () => {
    mockSession.mockResolvedValue({ ...ADMIN, role: "EINRICHTUNGSLEITUNG" });
    expect((await patch({ status: "REVIEWED" })).status).toBe(403);
  });
});
