/**
 * Tests: Onboarding-Erinnerungen (POST /api/cron/reminders)
 *
 * Drei Fehler, die hier belegt behoben sind:
 *   1. Der Link in der Vorgesetzten-Erinnerung fuehrte auf /vorgesetzter/<token>
 *      — eine Seite, die es nicht gibt (404). Richtig ist /modalitaeten/<token>.
 *   2. Die Fuehrungskraft wurde nur bei Status SUPERVISOR_PENDING erinnert,
 *      also erst nach dem Fragebogen. Im parallelen Ablauf entsteht der Link
 *      oft frueher — sie bekam dann nie eine Erinnerung.
 *   3. Der Merker „zuletzt erinnert" wurde auch gesetzt, wenn die Mail gar
 *      nicht rausging. Jetzt bei SENT und SKIPPED (Vorlage aus — ein neuer
 *      Versuch aendert nichts, sonst liefe die Erinnerung samt Webhook
 *      taeglich), aber nicht bei FAILED (der naechste Lauf versucht es erneut).
 *
 * Dazu aus dem Review von Paket 1:
 *   4. Bestandslinks ohne `supervisorLinkSentAt` rechnen ab dem aus dem Ablauf
 *      zurueckgerechneten Erzeugungszeitpunkt, nicht ab der Einladung der
 *      Person — sonst kam gleich nach dem Deploy „seit 23 Tagen offen" zu
 *      einem zwei Tage alten Link.
 *   5. Ohne bekannten Namen steht in der Vorgesetzten-Erinnerung die neutrale
 *      Bezeichnung, nie die private E-Mail-Adresse der Person.
 */

const mockPrisma = {
  onboardingProcess: { findMany: jest.fn(), update: jest.fn() },
  auditLog: { create: jest.fn() },
  emailLog: { deleteMany: jest.fn() },
};
const mockTriggerWebhooks = jest.fn();

jest.mock("@/lib/db", () => ({ prisma: mockPrisma }));
jest.mock("@/lib/webhooks", () => ({ triggerWebhooks: mockTriggerWebhooks }));
jest.mock("@/lib/url", () => ({ getBaseUrl: () => "https://hr.example" }));

import { POST } from "@/app/api/cron/reminders/route";
import { MITARBEITER_NEUTRAL } from "@/lib/onboarding-spuren";
import { NextRequest } from "next/server";

const SECRET = "test-cron-secret";
const TAG = 86_400_000;

function req(token: string | null = SECRET): NextRequest {
  return new NextRequest("http://localhost:3000/api/cron/reminders", {
    method: "POST",
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

function tageZurueck(n: number) {
  return new Date(Date.now() - n * TAG);
}

function tageVoraus(n: number) {
  return new Date(Date.now() + n * TAG);
}

function vgVorgang(teil: Record<string, unknown> = {}) {
  return {
    id: "ob1",
    displayId: "2026-GYM-014",
    status: "IN_PROGRESS",
    email: "anna.privat@example.org",
    firstName: "Anna",
    lastName: "Beispiel",
    invitedAt: tageZurueck(20),
    supervisorToken: "vg-token",
    supervisorEmail: "schulleitung@fes.example",
    supervisorSubmittedAt: null,
    supervisorLinkSentAt: tageZurueck(9),
    // 30 Tage Gueltigkeit ab dem Link vor 9 Tagen.
    supervisorTokenExpiresAt: tageVoraus(21),
    lastSupervisorReminderAt: null,
    organization: { name: "FES Gymnasium" },
    personalData: { firstName: null, lastName: null },
    supervisorData: { isComplete: false },
    ...teil,
  };
}

function maVorgang(teil: Record<string, unknown> = {}) {
  return {
    id: "ob2",
    displayId: "2026-GYM-015",
    status: "IN_PROGRESS",
    email: "bert@example.org",
    firstName: null,
    lastName: null,
    token: "ma-token",
    invitedAt: tageZurueck(10),
    organization: { name: "FES Gymnasium" },
    personalData: { firstName: "Bert", lastName: "Muster" },
    ...teil,
  };
}

/** Die WHERE-Bedingungen der beiden Abfragen: [Mitarbeitende, Vorgesetzte]. */
function abfragen() {
  return mockPrisma.onboardingProcess.findMany.mock.calls.map((c) => c[0].where);
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.CRON_SECRET = SECRET;
  mockPrisma.onboardingProcess.findMany.mockResolvedValue([]);
  mockPrisma.onboardingProcess.update.mockResolvedValue({});
  mockPrisma.auditLog.create.mockResolvedValue({});
  mockPrisma.emailLog.deleteMany.mockResolvedValue({ count: 0 });
  mockTriggerWebhooks.mockResolvedValue({ status: "SENT" });
});

describe("Zugriff", () => {
  it("verlangt das Cron-Geheimnis", async () => {
    expect((await POST(req("falsch"))).status).toBe(401);
    expect(mockPrisma.onboardingProcess.findMany).not.toHaveBeenCalled();
  });
});

describe("Mitarbeiter-Erinnerung", () => {
  it("erinnert nur, wenn der Fragebogen offen UND der Link noch gueltig ist", async () => {
    await POST(req());
    const [ma] = abfragen();
    expect(ma.submittedAt).toBeNull();
    expect(ma.status).toEqual({ in: ["INVITED", "IN_PROGRESS"] });
    // Frueher ging die Erinnerung auch mit einem toten Link hinaus.
    expect(ma.tokenExpiresAt.gt).toBeInstanceOf(Date);
    expect(ma.tokenExpiresAt.gt.getTime()).toBeGreaterThan(Date.now() - 60_000);
  });

  it("setzt den Merker und protokolliert nur bei tatsaechlich versendeter Mail", async () => {
    mockPrisma.onboardingProcess.findMany
      .mockResolvedValueOnce([maVorgang()])
      .mockResolvedValueOnce([]);

    const res = await POST(req());
    const daten = await res.json();

    expect(daten.employeeReminders).toBe(1);
    expect(mockPrisma.onboardingProcess.update).toHaveBeenCalledWith({
      where: { id: "ob2" },
      data: { lastEmployeeReminderAt: expect.any(Date) },
    });
    expect(mockPrisma.auditLog.create.mock.calls[0][0].data.action).toBe(
      "EMPLOYEE_REMINDER_SENT",
    );
  });

  it("laesst den Merker bei FAILED stehen — der naechste Lauf versucht es erneut", async () => {
    mockTriggerWebhooks.mockResolvedValue({ status: "FAILED" });
    mockPrisma.onboardingProcess.findMany
      .mockResolvedValueOnce([maVorgang()])
      .mockResolvedValueOnce([]);

    const daten = await (await POST(req())).json();

    expect(daten.employeeReminders).toBe(0);
    expect(daten.notSent).toBe(1);
    expect(mockPrisma.onboardingProcess.update).not.toHaveBeenCalled();
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("setzt den Merker bei SKIPPED (Vorlage deaktiviert), protokolliert aber keine Erinnerung", async () => {
    // Ohne Merker liefe die Erinnerung taeglich: triggerWebhooks feuert die
    // DB-Webhooks unabhaengig vom Mailergebnis, und jeder Lauf schriebe einen
    // SKIPPED-Eintrag ins Versandprotokoll.
    mockTriggerWebhooks.mockResolvedValue({ status: "SKIPPED", detail: "E-Mail-Vorlage ist deaktiviert" });
    mockPrisma.onboardingProcess.findMany
      .mockResolvedValueOnce([maVorgang()])
      .mockResolvedValueOnce([]);

    const daten = await (await POST(req())).json();

    expect(daten.employeeReminders).toBe(0);
    expect(daten.notSent).toBe(1);
    expect(mockPrisma.onboardingProcess.update).toHaveBeenCalledWith({
      where: { id: "ob2" },
      data: { lastEmployeeReminderAt: expect.any(Date) },
    });
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("laesst den Merker stehen, wenn der Dispatcher gar kein Ergebnis liefert", async () => {
    mockTriggerWebhooks.mockResolvedValue(null);
    mockPrisma.onboardingProcess.findMany
      .mockResolvedValueOnce([maVorgang()])
      .mockResolvedValueOnce([]);

    const daten = await (await POST(req())).json();

    expect(daten.notSent).toBe(1);
    expect(mockPrisma.onboardingProcess.update).not.toHaveBeenCalled();
  });
});

describe("Vorgesetzten-Erinnerung", () => {
  it("erinnert unabhaengig vom Fragebogen — kein Status SUPERVISOR_PENDING mehr im Filter", async () => {
    await POST(req());
    const [, vg] = abfragen();
    expect(vg.status).toEqual({ notIn: ["REVIEWED", "COMPLETED", "EXPIRED"] });
    expect(vg.supervisorToken).toEqual({ not: null });
    expect(vg.supervisorEmail).toEqual({ not: null });
    expect(vg.supervisorSubmittedAt).toBeNull();
    expect(vg.supervisorTokenExpiresAt.gt).toBeInstanceOf(Date);
  });

  it("rechnet die 7 Tage ab letzter Erinnerung, sonst ab dem Link, sonst ab dem zurueckgerechneten Link", async () => {
    await POST(req());
    const [, vg] = abfragen();
    expect(vg.OR).toEqual([
      { lastSupervisorReminderAt: { lt: expect.any(Date) } },
      { lastSupervisorReminderAt: null, supervisorLinkSentAt: { lt: expect.any(Date) } },
      {
        lastSupervisorReminderAt: null,
        supervisorLinkSentAt: null,
        invitedAt: { lt: expect.any(Date) },
        supervisorTokenExpiresAt: { lt: expect.any(Date) },
      },
    ]);
  });

  it("Bestandslink ohne supervisorLinkSentAt: faellig erst, wenn Ablauf minus 30 Tage vor der 7-Tage-Schwelle liegt", async () => {
    const vorher = Date.now();
    await POST(req());
    const [, vg] = abfragen();
    const bestand = vg.OR[2];

    // Schwelle = jetzt - 7 Tage; Erzeugung < Schwelle, also Ablauf < Schwelle + 30 Tage = jetzt + 23 Tage.
    const grenze = bestand.supervisorTokenExpiresAt.lt.getTime();
    expect(grenze).toBeGreaterThanOrEqual(vorher + 23 * TAG - 60_000);
    expect(grenze).toBeLessThanOrEqual(Date.now() + 23 * TAG + 60_000);
  });

  it("richtet die Rueckrechnung nach MAGIC_LINK_EXPIRY_HOURS", async () => {
    const alt = process.env.MAGIC_LINK_EXPIRY_HOURS;
    process.env.MAGIC_LINK_EXPIRY_HOURS = "168"; // 7 Tage
    try {
      const vorher = Date.now();
      await POST(req());
      const [, vg] = abfragen();
      // Schwelle + 7 Tage = jetzt.
      const grenze = vg.OR[2].supervisorTokenExpiresAt.lt.getTime();
      expect(Math.abs(grenze - vorher)).toBeLessThan(60_000);
    } finally {
      if (alt === undefined) delete process.env.MAGIC_LINK_EXPIRY_HOURS;
      else process.env.MAGIC_LINK_EXPIRY_HOURS = alt;
    }
  });

  it("verlinkt auf /modalitaeten/ — nicht auf die 404-Seite /vorgesetzter/", async () => {
    mockPrisma.onboardingProcess.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([vgVorgang()]);

    await POST(req());

    const [ereignis, nutzlast] = mockTriggerWebhooks.mock.calls[0];
    expect(ereignis).toBe("supervisor-reminder");
    expect(nutzlast.modalitaetenLink).toBe("https://hr.example/modalitaeten/vg-token");
    expect(nutzlast.supervisor_link).toBe("https://hr.example/modalitaeten/vg-token");
    expect(JSON.stringify(nutzlast)).not.toContain("/vorgesetzter/");
  });

  it("zaehlt die offenen Tage ab dem Link, nicht ab der Einladung der Person", async () => {
    mockPrisma.onboardingProcess.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([vgVorgang()]);

    await POST(req());

    expect(mockTriggerWebhooks.mock.calls[0][1].tage_offen).toBe(9);
  });

  it("zaehlt bei einem Bestandslink die Tage ab dem zurueckgerechneten Link, nicht ab der Einladung", async () => {
    // Eingeladen vor 23 Tagen, Link vor 3 Tagen erzeugt (vor dem Deploy, also
    // ohne supervisorLinkSentAt): Ablauf in 27 Tagen.
    mockPrisma.onboardingProcess.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        vgVorgang({
          invitedAt: tageZurueck(23),
          supervisorLinkSentAt: null,
          supervisorTokenExpiresAt: tageVoraus(27),
          lastSupervisorReminderAt: tageZurueck(8),
        }),
      ]);

    await POST(req());

    expect(mockTriggerWebhooks.mock.calls[0][1].tage_offen).toBe(3);
  });

  it("rechnet nie vor die Einladung zurueck", async () => {
    // Die Gueltigkeit wurde seitdem verlaengert o. ae.: Die Rueckrechnung
    // laege vor der Einladung — dann gilt die Einladung.
    mockPrisma.onboardingProcess.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        vgVorgang({
          invitedAt: tageZurueck(10),
          supervisorLinkSentAt: null,
          supervisorTokenExpiresAt: tageVoraus(5),
          lastSupervisorReminderAt: tageZurueck(8),
        }),
      ]);

    await POST(req());

    expect(mockTriggerWebhooks.mock.calls[0][1].tage_offen).toBe(10);
  });

  it("nimmt den Namen am Vorgang, solange der Fragebogen noch keinen hat", async () => {
    mockPrisma.onboardingProcess.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([vgVorgang()]);

    await POST(req());

    expect(mockTriggerWebhooks.mock.calls[0][1].mitarbeiter_name).toBe("Anna Beispiel");
  });

  it("nennt ohne bekannten Namen die neutrale Bezeichnung — nie die private Adresse der Person", async () => {
    mockPrisma.onboardingProcess.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        vgVorgang({ firstName: null, lastName: null, personalData: null }),
      ]);

    await POST(req());

    const nutzlast = mockTriggerWebhooks.mock.calls[0][1];
    expect(nutzlast.mitarbeiter_name).toBe(MITARBEITER_NEUTRAL);
    expect(nutzlast.mitarbeiter_name).not.toContain("@");
    // Auch sonst nirgends in der Nutzlast (Webhooks bekommen sie ganz).
    expect(JSON.stringify(nutzlast)).not.toContain("anna.privat@example.org");
  });

  it("setzt den Merker bei FAILED nicht", async () => {
    mockTriggerWebhooks.mockResolvedValue({ status: "FAILED" });
    mockPrisma.onboardingProcess.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([vgVorgang()]);

    const daten = await (await POST(req())).json();

    expect(daten.supervisorReminders).toBe(0);
    expect(daten.notSent).toBe(1);
    expect(mockPrisma.onboardingProcess.update).not.toHaveBeenCalled();
  });

  it("setzt den Merker bei SKIPPED, ohne eine Erinnerung zu protokollieren", async () => {
    mockTriggerWebhooks.mockResolvedValue({ status: "SKIPPED" });
    mockPrisma.onboardingProcess.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([vgVorgang()]);

    const daten = await (await POST(req())).json();

    expect(daten.supervisorReminders).toBe(0);
    expect(daten.notSent).toBe(1);
    expect(mockPrisma.onboardingProcess.update).toHaveBeenCalledWith({
      where: { id: "ob1" },
      data: { lastSupervisorReminderAt: expect.any(Date) },
    });
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("setzt Merker und Protokoll bei versendeter Mail", async () => {
    mockPrisma.onboardingProcess.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([vgVorgang()]);

    const daten = await (await POST(req())).json();

    expect(daten.supervisorReminders).toBe(1);
    expect(mockPrisma.onboardingProcess.update).toHaveBeenCalledWith({
      where: { id: "ob1" },
      data: { lastSupervisorReminderAt: expect.any(Date) },
    });
    expect(mockPrisma.auditLog.create.mock.calls[0][0].data.action).toBe(
      "SUPERVISOR_REMINDER_SENT",
    );
  });

  it("ueberspringt den Altfall mit abgesendeten Modalitaeten ohne Zeitstempel", async () => {
    mockPrisma.onboardingProcess.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([vgVorgang({ supervisorData: { isComplete: true } })]);

    await POST(req());

    expect(mockTriggerWebhooks).not.toHaveBeenCalled();
  });
});
