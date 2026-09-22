/**
 * Tests: Offboarding-Mails — vom Aufrufer bis zum gerenderten Text
 *
 * Der Fehler, den diese Datei festnagelt, war kein Fehler EINER Stelle: Die
 * Vorlagen sprachen von {{vorname}}, {{austrittsdatum}}, {{abteilung}},
 * {{aufgabe}}, die Aufrufer schickten employeeName, lastWorkingDay,
 * departmentName, itemTitle — und extractVariables kannte fuer beide Seiten
 * die jeweils falschen Namen. Jede Stelle fuer sich sah richtig aus; leer
 * blieb die Mail erst im Zusammenspiel. Deshalb pruefen die Tests hier das
 * Zusammenspiel: Die echte Route bzw. der echte Service laeuft (Prisma
 * gemockt), der Payload wird am Dispatcher abgegriffen und durch den ECHTEN
 * Mailer mit der ECHTEN Standardvorlage gerendert.
 *
 * Geprueft wird je Ereignis und Aufrufer:
 *   - kein Platzhalter der Vorlage bleibt leer (ausser in Bedingungsbloecken,
 *     die gerade dafuer da sind),
 *   - nichts Rohes ("{{...}}") landet in der Mail,
 *   - die Werte stimmen (Name, TT.MM.JJJJ, Abteilung, Aufgabe, Zaehler),
 *   - der Magic Link zeigt auf /offboarding-tasks/<token>.
 */

const mockGetSession = jest.fn();
const mockTriggerWebhooks = jest.fn();

const mockPrisma = {
  offboardingProcess: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  offboardingChecklistItem: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
    createMany: jest.fn(),
  },
  offboardingDepartmentLink: {
    findUnique: jest.fn(),
    upsert: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  offboardingExitData: { create: jest.fn(), upsert: jest.fn() },
  departmentConfig: { findMany: jest.fn() },
  checklistTemplate: { findFirst: jest.fn() },
  auditLog: { create: jest.fn() },
  $transaction: jest.fn(),
};

jest.mock("@/lib/db", () => ({ prisma: mockPrisma }));
jest.mock("@/lib/auth", () => ({ getSession: mockGetSession }));
jest.mock("@/lib/webhooks", () => ({ triggerWebhooks: mockTriggerWebhooks }));
jest.mock("@/lib/encryption", () => ({
  encrypt: (v: string) => v,
  decrypt: (v: string) => v,
  isEncryptionConfigured: () => false,
}));

import { NextRequest } from "next/server";
import { renderEventEmail } from "@/lib/mailer";
import { DEFAULT_EMAIL_TEMPLATES } from "@/lib/default-email-templates";
import { EVENT_CATALOG } from "@/lib/events";
import { createOffboardingProcess } from "@/lib/offboarding";
import { offboardingMailFelder } from "@/lib/offboarding-mail";
import { PATCH as patchVorgang } from "@/app/api/offboarding/[id]/route";
import { POST as postAbteilungsLinks } from "@/app/api/offboarding/[id]/department-links/route";
import { PATCH as patchChecklistePortal } from "@/app/api/offboarding/[id]/checklist/[itemId]/route";
import { PATCH as patchAufgabeMagicLink } from "@/app/api/offboarding-tasks/[token]/[itemId]/route";
import { POST as cronErinnerungen } from "@/app/api/cron/offboarding-reminders/route";

// =============================================
// Hilfen
// =============================================

const BASIS = "https://hr.example.org";
const CRON_SECRET = "test-cron-secret-offboarding-mails";

const ORG = { id: "org-1", name: "FES Minden", mandantNumber: "01" };

/** So liegt ein Vorgang nach `include: { organization: true }` vor. */
function vorgang(ueberschreibung: Record<string, unknown> = {}) {
  return {
    id: "off-1",
    displayId: "OFF-2026-GYM-001",
    employeeEmail: "max.mustermann@example.org",
    employeeFirstName: "Max",
    employeeLastName: "Mustermann",
    employeePrivateEmail: null,
    organizationId: ORG.id,
    exitType: "KUENDIGUNG_ARBEITNEHMER",
    // So speichert die Anlage-Route den Tag: new Date("2026-08-31")
    lastWorkingDay: new Date("2026-08-31T00:00:00.000Z"),
    status: "FINAL_SETTLEMENT",
    organization: ORG,
    ...ueberschreibung,
  };
}

const LEERE_EMPFAENGER = {
  recipientTo: "",
  recipientCc: "",
  recipientBcc: "",
  recipientReplyTo: "",
};

function standardVorlage(event: string) {
  const vorlage = DEFAULT_EMAIL_TEMPLATES.find((t) => t.event === event);
  if (!vorlage) throw new Error(`Keine Standardvorlage fuer ${event}`);
  return vorlage;
}

function rendere(event: string, payload: Record<string, unknown>) {
  const { rendered } = renderEventEmail(
    { ...standardVorlage(event), ...LEERE_EMPFAENGER },
    event,
    payload,
    { overrideTo: "hr@example.org" },
  );
  if (!rendered) throw new Error(`Nichts gerendert fuer ${event}`);
  return rendered;
}

/**
 * Platzhalter, die ausserhalb von Bedingungsbloecken stehen. Innerhalb eines
 * {{#x}}...{{/x}} darf ein Wert leer sein — der Block faellt dann weg, und
 * genau dafuer ist er da.
 */
function pflichtPlatzhalter(event: string): string[] {
  const v = standardVorlage(event);
  const text = [v.subject, v.bodyHtml, v.bodyText ?? ""]
    .join("\n")
    .replace(/\{\{#(\w+)\}\}[\s\S]*?\{\{\/\1\}\}/g, "");
  return [...new Set([...text.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]))];
}

/** Welche Pflicht-Platzhalter ergaeben mit diesem Payload einen leeren Text? */
function leerePlatzhalter(event: string, payload: Record<string, unknown>): string[] {
  return pflichtPlatzhalter(event).filter((name) => {
    const { rendered } = renderEventEmail(
      { subject: `{{${name}}}`, bodyHtml: "-", bodyText: null, ...LEERE_EMPFAENGER },
      event,
      payload,
      { overrideTo: "hr@example.org" },
    );
    return (rendered?.subject ?? "").trim() === "";
  });
}

/** Die Grundpruefung, die fuer jede Offboarding-Mail gilt. */
function pruefeVollstaendig(event: string, payload: Record<string, unknown>) {
  expect({ event, leer: leerePlatzhalter(event, payload) }).toEqual({ event, leer: [] });
  const mail = rendere(event, payload);
  for (const teil of [mail.subject, mail.html, mail.text ?? ""]) {
    expect(teil).not.toMatch(/\{\{/);
    expect(teil).not.toContain("Invalid Date");
    expect(teil).not.toContain("undefined");
  }
  return mail;
}

/** Payload des (einzigen) Aufrufs fuer dieses Ereignis. */
function payloadVon(event: string): Record<string, unknown> {
  const aufrufe = mockTriggerWebhooks.mock.calls.filter((c) => c[0] === event);
  expect({ event, anzahl: aufrufe.length }).toEqual({ event, anzahl: 1 });
  return aufrufe[0][1];
}

function jsonRequest(url: string, method: string, body?: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(url, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

const alteUmgebung = { ...process.env };

beforeEach(() => {
  jest.clearAllMocks();
  process.env.NEXT_PUBLIC_APP_URL = BASIS;
  process.env.CRON_SECRET = CRON_SECRET;
  mockGetSession.mockResolvedValue({
    userId: "u-1",
    email: "admin@example.org",
    role: "SUPER_ADMIN",
    firstName: "S",
    lastName: "A",
  });
  mockTriggerWebhooks.mockResolvedValue(null);
  mockPrisma.auditLog.create.mockResolvedValue({});
});

afterAll(() => {
  process.env = alteUmgebung;
});

// =============================================
// offboarding-created
// =============================================

describe("offboarding-created (Service createOffboardingProcess)", () => {
  it("fuellt Name, Austrittsdatum und Einrichtung", async () => {
    mockPrisma.offboardingProcess.count.mockResolvedValue(0);
    mockPrisma.offboardingProcess.findUnique.mockResolvedValue(null);
    mockPrisma.checklistTemplate.findFirst.mockResolvedValue(null);
    mockPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(mockPrisma));
    mockPrisma.offboardingProcess.create.mockResolvedValue(vorgang({ status: "INITIATED" }));
    mockPrisma.offboardingExitData.create.mockResolvedValue({});

    await createOffboardingProcess({
      organization: { ...ORG, type: "GYMNASIUM", shortName: "GYM" },
      employeeEmail: "max.mustermann@example.org",
      employeeFirstName: "Max",
      employeeLastName: "Mustermann",
      exitType: "KUENDIGUNG_ARBEITNEHMER",
      lastWorkingDay: new Date("2026-08-31T00:00:00.000Z"),
      initiatedById: "u-1",
    });

    const payload = payloadVon("offboarding-created");
    // Bestehende Webhook-Felder bleiben erhalten.
    expect(payload).toMatchObject({
      offboardingId: "off-1",
      employeeEmail: "max.mustermann@example.org",
      employeeName: "Max Mustermann",
      organization: "FES Minden",
      mandantNumber: "01",
      exitType: "KUENDIGUNG_ARBEITNEHMER",
      lastWorkingDay: "2026-08-31T00:00:00.000Z",
    });

    const mail = pruefeVollstaendig("offboarding-created", payload);
    expect(mail.subject).toBe("Neuer Offboarding-Vorgang: Max Mustermann");
    expect(mail.text).toContain("Austrittsdatum: 31.08.2026");
    expect(mail.text).toContain("Einrichtung: FES Minden");
  });
});

// =============================================
// offboarding-completed
// =============================================

describe("offboarding-completed (PATCH /api/offboarding/[id])", () => {
  it("nennt Name, Austrittsdatum und Einrichtung — das Datum fehlte bisher ganz", async () => {
    mockPrisma.offboardingProcess.findUnique.mockResolvedValue(vorgang());
    mockPrisma.offboardingProcess.update.mockResolvedValue(
      vorgang({ status: "COMPLETED", completedAt: new Date("2026-09-01T10:00:00.000Z") }),
    );

    const res = await patchVorgang(
      jsonRequest(`${BASIS}/api/offboarding/off-1`, "PATCH", { status: "COMPLETED" }),
      { params: Promise.resolve({ id: "off-1" }) },
    );
    expect(res.status).toBe(200);

    const payload = payloadVon("offboarding-completed");
    expect(payload).toMatchObject({
      employeeEmail: "max.mustermann@example.org",
      completedAt: "2026-09-01T10:00:00.000Z",
    });

    const mail = pruefeVollstaendig("offboarding-completed", payload);
    expect(mail.subject).toBe("Offboarding abgeschlossen: Max Mustermann");
    expect(mail.text).toContain("Austrittsdatum: 31.08.2026");
    expect(mail.text).toContain("Einrichtung: FES Minden");
  });

  // Abschluss ist fuer SUPER_ADMIN/HR_LEITUNG auch mit offener Checkliste
  // moeglich. Die Mail darf deshalb nie pauschal "Alle Aufgaben sind erledigt"
  // behaupten, sondern nennt offene Aufgaben nur, wenn es welche gibt.
  it("nennt offene Aufgaben beim Abschluss und behauptet nie pauschal, alles sei erledigt", async () => {
    mockPrisma.offboardingProcess.findUnique.mockResolvedValue(vorgang());
    mockPrisma.offboardingProcess.update.mockResolvedValue(
      vorgang({ status: "COMPLETED", completedAt: new Date("2026-09-01T10:00:00.000Z") }),
    );
    mockPrisma.offboardingChecklistItem.count.mockResolvedValue(3);

    const res = await patchVorgang(
      jsonRequest(`${BASIS}/api/offboarding/off-1`, "PATCH", { status: "COMPLETED" }),
      { params: Promise.resolve({ id: "off-1" }) },
    );
    expect(res.status).toBe(200);

    const payload = payloadVon("offboarding-completed");
    expect(payload).toMatchObject({ offene_aufgaben_beim_abschluss: "3" });
    const mail = pruefeVollstaendig("offboarding-completed", payload);
    expect(mail.text).toContain("Beim Abschluss waren noch 3 Aufgabe(n) der Checkliste offen");
    expect(mail.text).not.toContain("Alle Aufgaben");
  });

  it("zeigt ohne offene Aufgaben keinen Hinweis", async () => {
    mockPrisma.offboardingProcess.findUnique.mockResolvedValue(vorgang());
    mockPrisma.offboardingProcess.update.mockResolvedValue(
      vorgang({ status: "COMPLETED", completedAt: new Date("2026-09-01T10:00:00.000Z") }),
    );
    mockPrisma.offboardingChecklistItem.count.mockResolvedValue(0);

    const res = await patchVorgang(
      jsonRequest(`${BASIS}/api/offboarding/off-1`, "PATCH", { status: "COMPLETED" }),
      { params: Promise.resolve({ id: "off-1" }) },
    );
    expect(res.status).toBe(200);

    const payload = payloadVon("offboarding-completed");
    expect(payload).toMatchObject({ offene_aufgaben_beim_abschluss: "" });
    const mail = pruefeVollstaendig("offboarding-completed", payload);
    expect(mail.text).not.toContain("Hinweis");
    expect(mail.text).not.toContain("Alle Aufgaben");
  });
});

// =============================================
// offboarding-department-assigned
// =============================================

describe("offboarding-department-assigned (POST department-links)", () => {
  it("fuellt Abteilung, Name und Datum und verlinkt /offboarding-tasks/<token>", async () => {
    mockPrisma.offboardingProcess.findUnique.mockResolvedValue(vorgang());
    mockPrisma.offboardingChecklistItem.findMany.mockResolvedValue([
      { id: "i-1", assigneeDepartment: "IT" },
      { id: "i-2", assigneeDepartment: "IT" },
      // Personalabteilung arbeitet im Portal und bekommt keinen Link.
      { id: "i-3", assigneeDepartment: "HR" },
    ]);
    mockPrisma.departmentConfig.findMany.mockResolvedValue([
      {
        departmentKey: "IT",
        departmentName: "IT-Abteilung",
        email: "it@example.org",
        organizationId: null,
      },
    ]);
    mockPrisma.offboardingDepartmentLink.upsert.mockImplementation(
      async ({ create }: { create: Record<string, unknown> }) => ({ id: "l-1", ...create }),
    );

    const res = await postAbteilungsLinks(
      jsonRequest(`${BASIS}/api/offboarding/off-1/department-links`, "POST"),
      { params: Promise.resolve({ id: "off-1" }) },
    );
    expect(res.status).toBe(201);

    const payload = payloadVon("offboarding-department-assigned");
    const token = payload.token as string;
    expect(token).toBeTruthy();
    expect(payload.magicLink).toBe(`${BASIS}/offboarding-tasks/${token}`);
    expect(payload).toMatchObject({
      departmentKey: "IT",
      departmentName: "IT-Abteilung",
      email: "it@example.org",
      taskCount: 2,
      organizationName: "FES Minden",
    });

    const mail = pruefeVollstaendig("offboarding-department-assigned", payload);
    expect(mail.subject).toBe("Offboarding-Aufgaben für IT-Abteilung: Max Mustermann");
    expect(mail.html).toContain(`href="${BASIS}/offboarding-tasks/${token}"`);
    expect(mail.html).not.toContain("/offboarding/abteilung/");
    expect(mail.text).toContain("Austrittsdatum: 31.08.2026");
  });
});

// =============================================
// offboarding-reminder — Knopf im Portal
// =============================================

describe("offboarding-reminder (POST department-links { action: 'remind' })", () => {
  it("nennt die offenen Aufgaben der Abteilung und verlinkt die richtige Seite", async () => {
    mockPrisma.offboardingProcess.findUnique.mockResolvedValue(vorgang());
    mockPrisma.offboardingDepartmentLink.findUnique.mockResolvedValue({
      id: "l-1",
      departmentKey: "IT",
      departmentName: "IT-Abteilung",
      email: "it@example.org",
      token: "tok-knopf",
    });
    mockPrisma.offboardingDepartmentLink.update.mockResolvedValue({ id: "l-1", reminderCount: 2 });
    mockPrisma.offboardingChecklistItem.count.mockResolvedValue(3);

    const res = await postAbteilungsLinks(
      jsonRequest(`${BASIS}/api/offboarding/off-1/department-links`, "POST", {
        action: "remind",
        departmentKey: "IT",
      }),
      { params: Promise.resolve({ id: "off-1" }) },
    );
    expect(res.status).toBe(200);

    // Gezaehlt wird: offen UND dieser Abteilung zugeordnet.
    expect(mockPrisma.offboardingChecklistItem.count).toHaveBeenCalledWith({
      where: { offboardingId: "off-1", assigneeDepartment: "IT", isCompleted: false },
    });

    const payload = payloadVon("offboarding-reminder");
    expect(payload.magicLink).toBe(`${BASIS}/offboarding-tasks/tok-knopf`);
    expect(payload).toMatchObject({ reminderCount: 2, offene_aufgaben: 3, totalOpenItems: 3 });

    const mail = pruefeVollstaendig("offboarding-reminder", payload);
    expect(mail.subject).toBe("Erinnerung: Offene Aufgaben für Max Mustermann");
    expect(mail.text).toContain("Offene Aufgaben Ihrer Abteilung: 3");
    expect(mail.text).toContain("Austrittsdatum: 31.08.2026");
    expect(mail.text).toContain(`${BASIS}/offboarding-tasks/tok-knopf`);
  });

  it("antwortet mit 404, wenn es fuer die Abteilung keinen Link gibt (der Knopf zeigt den Fehler)", async () => {
    mockPrisma.offboardingProcess.findUnique.mockResolvedValue(vorgang());
    mockPrisma.offboardingDepartmentLink.findUnique.mockResolvedValue(null);

    const res = await postAbteilungsLinks(
      jsonRequest(`${BASIS}/api/offboarding/off-1/department-links`, "POST", {
        action: "remind",
        departmentKey: "IT",
      }),
      { params: Promise.resolve({ id: "off-1" }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBeTruthy();
    expect(mockTriggerWebhooks).not.toHaveBeenCalled();
  });
});

// =============================================
// offboarding-reminder — Cron
// =============================================

describe("offboarding-reminder (Cron /api/cron/offboarding-reminders)", () => {
  it("fuellt dieselbe Vorlage wie der Knopf und verlinkt /offboarding-tasks/<token>", async () => {
    const vorZweiTagen = new Date(Date.now() - 2 * 86400000);
    mockPrisma.offboardingProcess.findMany.mockResolvedValue([
      {
        ...vorgang({ status: "HANDOVER_PHASE" }),
        organization: { name: ORG.name },
        departmentLinks: [
          {
            id: "l-1",
            departmentKey: "IT",
            departmentName: "IT-Abteilung",
            email: "it@example.org",
            token: "tok-cron",
            allTasksComplete: false,
            lastReminderAt: null,
            reminderCount: 0,
          },
        ],
        checklistItems: [
          { id: "i-1", title: "Laptop zurückgeben", dueDate: vorZweiTagen, assigneeDepartment: "IT" },
          { id: "i-2", title: "Konten sperren", dueDate: null, assigneeDepartment: "IT" },
        ],
      },
    ]);
    mockPrisma.offboardingDepartmentLink.update.mockResolvedValue({});

    const res = await cronErinnerungen(
      jsonRequest(`${BASIS}/api/cron/offboarding-reminders`, "POST", undefined, {
        Authorization: `Bearer ${CRON_SECRET}`,
      }),
    );
    expect(res.status).toBe(200);

    const payload = payloadVon("offboarding-reminder");
    expect(payload.magicLink).toBe(`${BASIS}/offboarding-tasks/tok-cron`);
    expect(payload).toMatchObject({
      level: "WARNING",
      totalOpenItems: 2,
      offene_aufgaben: 2,
      // Webhook-Felder von vorher bleiben.
      einrichtung: "FES Minden",
      organization: "FES Minden",
      employeeFirstName: "Max",
    });

    const mail = pruefeVollstaendig("offboarding-reminder", payload);
    expect(mail.text).toContain("Offene Aufgaben Ihrer Abteilung: 2");
    expect(mail.html).not.toContain("/offboarding/abteilung/");
  });
});

// =============================================
// offboarding-task-completed — zwei Aufrufer
// =============================================

describe("offboarding-task-completed", () => {
  it("Portal-Checkliste: fuellt Aufgabe, Abteilung und offene Aufgaben im Vorgang", async () => {
    mockPrisma.offboardingChecklistItem.findUnique.mockResolvedValue({ id: "i-7", offboardingId: "off-1" });
    mockPrisma.offboardingChecklistItem.update.mockResolvedValue({
      id: "i-7",
      title: "Schlüssel abgeben",
      category: "RUECKGABE",
      assigneeDepartment: "FACILITY",
    });
    mockPrisma.offboardingProcess.findUnique.mockResolvedValue(vorgang());
    mockPrisma.offboardingChecklistItem.count.mockImplementation(
      async ({ where }: { where: { isCompleted?: boolean } }) =>
        where.isCompleted === false ? 5 : where.isCompleted === true ? 3 : 8,
    );
    mockPrisma.offboardingChecklistItem.findMany.mockResolvedValue([{ isCompleted: true }]);
    mockPrisma.offboardingDepartmentLink.updateMany.mockResolvedValue({ count: 1 });

    const res = await patchChecklistePortal(
      jsonRequest(`${BASIS}/api/offboarding/off-1/checklist/i-7`, "PATCH", { isCompleted: true }),
      { params: Promise.resolve({ id: "off-1", itemId: "i-7" }) },
    );
    expect(res.status).toBe(200);

    const payload = payloadVon("offboarding-task-completed");
    // Alte Webhook-Felder bleiben, die neuen kommen dazu.
    expect(payload).toMatchObject({
      taskId: "i-7",
      taskTitle: "Schlüssel abgeben",
      taskCategory: "RUECKGABE",
      completedById: "u-1",
      itemId: "i-7",
      itemTitle: "Schlüssel abgeben",
      departmentKey: "FACILITY",
      departmentName: "Facility Management",
      offene_aufgaben: 5,
    });

    const mail = pruefeVollstaendig("offboarding-task-completed", payload);
    expect(mail.subject).toBe("Aufgabe erledigt: Schlüssel abgeben (Max Mustermann)");
    expect(mail.text).toContain("Abteilung: Facility Management");
    expect(mail.text).toContain("Noch offen im Vorgang: 5 Aufgabe(n)");
  });

  it("Portal-Checkliste ohne Abteilung: die Mail sagt das ausdruecklich statt leer zu bleiben", async () => {
    mockPrisma.offboardingChecklistItem.findUnique.mockResolvedValue({ id: "i-8", offboardingId: "off-1" });
    mockPrisma.offboardingChecklistItem.update.mockResolvedValue({
      id: "i-8",
      title: "Zeugnis erstellen",
      category: "DOKUMENTE",
      assigneeDepartment: null,
    });
    mockPrisma.offboardingProcess.findUnique.mockResolvedValue(vorgang());
    // 0 ist ein Wert: "0 Aufgabe(n)" und kein leeres Feld.
    mockPrisma.offboardingChecklistItem.count.mockResolvedValue(0);

    const res = await patchChecklistePortal(
      jsonRequest(`${BASIS}/api/offboarding/off-1/checklist/i-8`, "PATCH", { isCompleted: true }),
      { params: Promise.resolve({ id: "off-1", itemId: "i-8" }) },
    );
    expect(res.status).toBe(200);

    const mail = pruefeVollstaendig("offboarding-task-completed", payloadVon("offboarding-task-completed"));
    expect(mail.text).toContain("Abteilung: Keine Abteilung zugeordnet");
    expect(mail.text).toContain("Noch offen im Vorgang: 0 Aufgabe(n)");
  });

  it("Magic Link der Abteilung: fuellt dieselbe Vorlage; bei der letzten Aufgabe folgt die Bestaetigung", async () => {
    mockPrisma.offboardingDepartmentLink.findUnique.mockResolvedValue({
      id: "l-1",
      token: "tok-abt",
      offboardingId: "off-1",
      departmentKey: "IT",
      departmentName: "IT-Abteilung",
      email: "it@example.org",
      expiresAt: new Date(Date.now() + 86400000),
    });
    mockPrisma.offboardingChecklistItem.findUnique.mockResolvedValue({
      id: "i-1",
      offboardingId: "off-1",
      assigneeDepartment: "IT",
    });
    mockPrisma.offboardingChecklistItem.update.mockResolvedValue({ id: "i-1", title: "Laptop zurückgeben" });
    mockPrisma.offboardingProcess.findUnique.mockResolvedValue(vorgang());
    mockPrisma.offboardingChecklistItem.count.mockResolvedValue(2);
    mockPrisma.offboardingChecklistItem.findMany.mockResolvedValue([{ isCompleted: true }]);
    mockPrisma.offboardingDepartmentLink.update.mockResolvedValue({
      id: "l-1",
      completedAt: new Date("2026-08-20T09:00:00.000Z"),
    });

    const res = await patchAufgabeMagicLink(
      jsonRequest(`${BASIS}/api/offboarding-tasks/tok-abt/i-1`, "PATCH", { isCompleted: true }, {
        "x-forwarded-for": "203.0.113.7",
      }),
      { params: Promise.resolve({ token: "tok-abt", itemId: "i-1" }) },
    );
    expect(res.status).toBe(200);

    const erledigt = payloadVon("offboarding-task-completed");
    expect(erledigt).toMatchObject({ itemTitle: "Laptop zurückgeben", offene_aufgaben: 2 });
    const mail = pruefeVollstaendig("offboarding-task-completed", erledigt);
    expect(mail.subject).toBe("Aufgabe erledigt: Laptop zurückgeben (Max Mustermann)");
    expect(mail.text).toContain("Abteilung: IT-Abteilung");
    expect(mail.text).toContain("Noch offen im Vorgang: 2 Aufgabe(n)");

    const abteilungFertig = payloadVon("offboarding-department-completed");
    expect(abteilungFertig).toMatchObject({
      email: "it@example.org",
      completedAt: "2026-08-20T09:00:00.000Z",
    });
    const bestaetigung = pruefeVollstaendig("offboarding-department-completed", abteilungFertig);
    expect(bestaetigung.subject).toBe(
      "Offboarding-Aufgaben Ihrer Abteilung abgeschlossen: Max Mustermann",
    );
    expect(bestaetigung.text).toContain("der Abteilung IT-Abteilung");
  });
});

// =============================================
// Aliase im Mailer: alte Payloads und gespeicherte Vorlagen
// =============================================

describe("extractVariables — Aliase fuer die englischen Feldnamen", () => {
  it("fuellt die Vorlage auch aus dem Payload, wie ihn die Portal-Checkliste frueher sendete", () => {
    // Genau so sah der Payload vor der Reparatur aus. Er steht hier fuer
    // alles, was nicht ueber offboardingMailFelder entsteht.
    const alt = {
      offboardingId: "off-1",
      displayId: "OFF-2026-GYM-001",
      employeeName: "Max Mustermann",
      taskId: "i-7",
      taskTitle: "Schlüssel abgeben",
      departmentName: "Facility Management",
      totalOpenItems: 0,
      organizationName: "FES Minden",
    };
    const mail = rendere("offboarding-task-completed", alt);
    // Nur der ganze Name ist bekannt: er landet vollstaendig in {{vorname}}.
    expect(mail.subject).toContain("Aufgabe erledigt: Schlüssel abgeben (Max Mustermann");
    expect(mail.text).toContain("Abteilung: Facility Management");
    expect(mail.text).toContain("Noch offen im Vorgang: 0 Aufgabe(n)");
    expect(mail.html).toContain("FES Minden");
  });

  it("macht aus lastWorkingDay ein deutsches Datum in deutscher Zeit", () => {
    const mail = rendere("offboarding-reminder", {
      employeeFirstName: "Max",
      employeeLastName: "Mustermann",
      lastWorkingDay: "2026-08-30T22:00:00.000Z",
      totalOpenItems: 4,
      magicLink: `${BASIS}/offboarding-tasks/x`,
    });
    expect(mail.text).toContain("Austrittsdatum: 31.08.2026");
    expect(mail.text).toContain("Offene Aufgaben Ihrer Abteilung: 4");
  });
});

// =============================================
// offboarding-documents-sent: Datum nicht zweimal umwandeln
// =============================================

describe("offboarding-documents-sent — Austrittsdatum", () => {
  const basisPayload = {
    refId: "off-1",
    displayId: "OFF-2026-GYM-001",
    email: "max.mustermann@example.org",
    vorname: "Max",
    nachname: "Mustermann",
    organization: "FES Minden",
    einrichtung: "FES Minden",
    anzahlDokumente: 1,
    dokumentenliste: "1. Arbeitszeugnis",
    dokumentenliste_html: "<ol><li>Arbeitszeugnis</li></ol>",
    nachricht: "",
    nachricht_html: "",
    sachbearbeiter_name: "Erika Sachbearbeiter",
  };

  it("reicht ein formatiertes Datum unveraendert durch (vorher: Invalid Date)", () => {
    const mail = rendere("offboarding-documents-sent", { ...basisPayload, austrittsdatum: "31.12.2026" });
    expect(mail.text).toContain("Ihr Arbeitsverhältnis endet zum 31.12.2026.");
    expect(mail.html).not.toContain("Invalid Date");
  });

  it("vertauscht Tag und Monat nicht (vorher: 01.08. wurde zum 8. Januar)", () => {
    const mail = rendere("offboarding-documents-sent", { ...basisPayload, austrittsdatum: "01.08.2026" });
    expect(mail.text).toContain("endet zum 01.08.2026.");
  });

  it("laesst den Satz weg, wenn kein Datum hinterlegt ist", () => {
    const mail = rendere("offboarding-documents-sent", { ...basisPayload, austrittsdatum: "" });
    expect(mail.text).not.toContain("endet zum");
    expect(mail.text).not.toMatch(/\{\{/);
  });
});

// =============================================
// Katalog: Beispiel-Payloads fuer den Testversand
// =============================================

describe("Beispiel-Payloads (Testversand) der reparierten Vorlagen", () => {
  const ereignisse = [
    "offboarding-created",
    "offboarding-department-assigned",
    "offboarding-task-completed",
    "offboarding-department-completed",
    "offboarding-reminder",
    "offboarding-completed",
    "offboarding-documents-sent",
    "psi-deadline-warning",
  ];

  it.each(ereignisse)("%s rendert mit dem Beispiel ohne leere Platzhalter", (event) => {
    const def = EVENT_CATALOG.find((d) => d.event === event);
    expect(def).toBeDefined();
    pruefeVollstaendig(event, def!.samplePayload);
  });

  it("der gemeinsame Offboarding-Teil entspricht dem, was offboardingMailFelder liefert", () => {
    // Der Katalog schreibt die Felder ab (er laeuft auch im Browser und kann
    // offboardingMailFelder nicht aufrufen). Dieser Test haelt beide gleich.
    const echt = offboardingMailFelder({
      id: "00000000-0000-0000-0000-000000000002",
      displayId: "OFF-2026-GYM-001",
      employeeFirstName: "Max",
      employeeLastName: "Mustermann",
      lastWorkingDay: new Date("2026-08-31T00:00:00.000Z"),
      organization: { name: "FES Minden", mandantNumber: "01" },
    });
    for (const event of ereignisse.filter((e) => e.startsWith("offboarding-") && e !== "offboarding-documents-sent")) {
      const def = EVENT_CATALOG.find((d) => d.event === event)!;
      expect({ event, felder: def.samplePayload }).toMatchObject({ event, felder: echt });
    }
  });
});
