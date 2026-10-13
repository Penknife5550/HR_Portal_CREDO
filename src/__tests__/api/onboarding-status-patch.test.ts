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
