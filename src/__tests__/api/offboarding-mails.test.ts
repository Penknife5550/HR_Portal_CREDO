/**
 * Tests: Offboarding-Mails — vom Aufrufer bis zum gerenderten Text
 *
 * Der Fehler, den diese Datei festnagelt, war kein Fehler EINER Stelle: Die
 * Vorlagen sprachen von {{vorname}}, {{austrittsdatum}}, {{abteilung}},
 * {{aufgabe}}, die Aufrufer schickten employeeName, lastWorkingDay,
 * departmentName, itemTitle — und extractVariables kannte fuer beide Seiten
 * die jeweils falschen Namen. Jede Stelle fuer sich sah richtig aus; leer
 * blieb die Mail erst im Zusammenspiel. Deshalb pruefen die Tests hier das
 * Zusammenspiel: Der echte Aufrufer laeuft, der Payload wird am Dispatcher
 * abgegriffen und durch den ECHTEN Mailer mit der ECHTEN Standardvorlage
 * gerendert.
 *
 * Aufrufer seit Paket 1b:
 *   - Die vier Mails der Abteilungsaufgaben (zugewiesen, Erinnerung, Aufgabe
 *     erledigt, Abteilung abgeschlossen) entstehen in den Dienstfunktionen
 *     (src/lib/abteilungsaufgaben-dienst.ts, abteilungsaufgaben-uebergaenge.ts).
 *     Die Routen reichen nur noch durch; getrieben werden deshalb die
 *     Dienstfunktionen, auf der kleinen In-Memory-Datenbank
 *     (src/__tests__/hilfen/abteilungs-fake-db.ts).
 *   - offboarding-created und -completed laufen weiter ueber den Service bzw.
 *     die PATCH-Route. Die Methoden, die die Fake-Datenbank dafuer nicht
 *     kennt, haengt diese Datei unten an (so will es die Test-Hilfe).
 *
 * Geprueft wird je Ereignis und Aufrufer:
 *   - kein Platzhalter der Vorlage bleibt leer (ausser in Bedingungsbloecken,
 *     die gerade dafuer da sind),
 *   - nichts Rohes ("{{...}}") landet in der Mail,
 *   - die Werte stimmen (Name, TT.MM.JJJJ, Abteilung, Aufgabe, Zaehler),
 *   - der Magic Link zeigt auf /offboarding-tasks/<token>,
 *   - der Beispiel-Payload im Katalog (Testversand) ist genau das, was der
 *     Dienst baut.
 */

const mockGetSession = jest.fn();
const mockTriggerWebhooks = jest.fn();

jest.mock("@/lib/db", () => ({
  prisma: jest.requireActual("../hilfen/abteilungs-fake-db").fakePrisma,
}));
jest.mock("@/lib/auth", () => ({ getSession: mockGetSession }));
jest.mock("@/lib/webhooks", () => ({ triggerWebhooks: mockTriggerWebhooks }));
jest.mock("@/lib/encryption", () => ({
  encrypt: (v: string) => v,
  decrypt: (v: string) => v,
  isEncryptionConfigured: () => false,
}));

import { NextRequest } from "next/server";
import { db, dbLeeren, fakePrisma, naechsteId, neuerLink, type Zeile } from "../hilfen/abteilungs-fake-db";
import { renderEventEmail } from "@/lib/mailer";
import { DEFAULT_EMAIL_TEMPLATES } from "@/lib/default-email-templates";
import {
  EVENT_CATALOG,
  OFFBOARDING_ABTEILUNG_BEISPIEL_AUFGABEN,
  OFFBOARDING_ABTEILUNG_BEISPIEL_KOMMENTAR,
} from "@/lib/events";
import { createOffboardingProcess } from "@/lib/offboarding";
import { offboardingMailFelder } from "@/lib/offboarding-mail";
import {
  aufgabenlisteMailFelder,
  kommentarMailFelder,
  stufeBerechnen,
  stufenMailFelder,
} from "@/lib/abteilungsaufgaben";
import { abteilungsAktionAusfuehren, erinnerungenSenden } from "@/lib/abteilungsaufgaben-dienst";
import { aufgabeImPortalAendern, oeffentlicheAufgabeAendern } from "@/lib/abteilungsaufgaben-uebergaenge";
import type { SessionPayload } from "@/lib/permissions";
import { PATCH as patchVorgang } from "@/app/api/offboarding/[id]/route";

// =============================================
// Fake-Datenbank: was createOffboardingProcess und die PATCH-Route brauchen
// =============================================

type Tabelle = Record<string, jest.Mock>;
const fp = fakePrisma as Record<string, Tabelle>;

fp.offboardingProcess.count = jest.fn(async () => 0);
fp.offboardingProcess.create = jest.fn(async ({ data }: { data: Zeile }) => {
  const v: Zeile = { id: VORGANG_ID, ...data, organization: ORG };
  db.vorgaenge.push(v);
  return structuredClone(v);
});
fp.offboardingProcess.update = jest.fn(async ({ where, data }: { where: Zeile; data: Zeile }) => {
  const v = db.vorgaenge.find((x) => x.id === where.id);
  if (!v) throw new Error("Vorgang fehlt");
  Object.assign(v, data);
  return structuredClone(v);
});
fp.offboardingExitData = { create: jest.fn(async () => ({})), upsert: jest.fn(async () => ({})) };
fp.checklistTemplate = { findFirst: jest.fn(async () => null) };
fp.offboardingChecklistItem.createMany = jest.fn(async () => ({ count: 0 }));

// =============================================
// Testdaten
// =============================================

const BASIS = "https://hr.example.org";

/** Wie im Katalog-Beispiel (OFFBOARDING_BEISPIEL in src/lib/events.ts). */
const VORGANG_ID = "00000000-0000-0000-0000-000000000002";
const ORG = { id: "org-1", name: "FES Minden", mandantNumber: "01" };

/**
 * Die Zeitpunkte der Beispiel-Geschichte in events.ts
 * (OFFBOARDING_ABTEILUNG_BEISPIEL_AUFGABEN): informiert, erinnert, eine
 * Aufgabe erledigt, Abteilung fertig.
 */
const T_INFORMIERT = new Date("2026-08-17T08:00:00.000Z");
const T_ERINNERT = new Date("2026-08-30T06:00:00.000Z");
const T_ERLEDIGT = new Date("2026-08-31T10:14:00.000Z");
const T_FERTIG = new Date("2026-09-01T09:30:00.000Z");
const MINUTE = 60_000;

const [LAPTOP, ZUGAENGE, POSTFACH] = OFFBOARDING_ABTEILUNG_BEISPIEL_AUFGABEN;

const SESSION: SessionPayload = {
  userId: "u-1",
  email: "admin@example.org",
  role: "SUPER_ADMIN",
  firstName: "Erika",
  lastName: "Sachbearbeiter",
};

/** Ein Vorgang, wie ihn Dienst, Service und Route aus der Datenbank lesen. */
function vorgang(teil: Zeile = {}): Zeile {
  return {
    id: VORGANG_ID,
    displayId: "OFF-2026-GYM-001",
    employeeEmail: "max.mustermann@example.org",
    employeeFirstName: "Max",
    employeeLastName: "Mustermann",
    employeePrivateEmail: null,
    organizationId: ORG.id,
    exitType: "KUENDIGUNG_ARBEITNEHMER",
    // So speichert die Anlage-Route den Tag: new Date("2026-08-31")
    lastWorkingDay: new Date("2026-08-31T00:00:00.000Z"),
    status: "HANDOVER_PHASE",
    supervisorEmail: null,
    supervisorName: null,
    zeugnisBewertung: null,
    contractEnd: null,
    organization: ORG,
    ...teil,
  };
}

function aufgabe(teil: Zeile): Zeile {
  return {
    id: `i-${naechsteId()}`,
    offboardingId: VORGANG_ID,
    title: "Aufgabe",
    category: "Phase 5: Letzter Tag",
    orderIndex: naechsteId(),
    description: null,
    assigneeDepartment: "IT",
    isCompleted: false,
    completedAt: null,
    completedById: null,
    dueDate: new Date("2026-08-31T00:00:00.000Z"),
    notes: null,
    abteilungKommentar: null,
    abteilungKommentarAm: null,
    ...teil,
  };
}

/** Die IT-Aufgaben aus dem Katalog-Beispiel als Datenbankzeilen. */
function beispielAufgaben(erledigt: string[] = []): Zeile[] {
  return OFFBOARDING_ABTEILUNG_BEISPIEL_AUFGABEN.map((a, i) =>
    aufgabe({
      id: a.id,
      title: a.title,
      orderIndex: i,
      dueDate: a.dueDate ? new Date(a.dueDate) : null,
      isCompleted: erledigt.includes(a.id),
      completedAt: erledigt.includes(a.id) ? T_ERINNERT : null,
    }),
  );
}

function konfig(teil: Zeile = {}): Zeile {
  return {
    departmentKey: "IT",
    departmentName: "IT-Abteilung",
    email: "it@example.org",
    organizationId: null,
    isActive: true,
    ...teil,
  };
}

/** Der Link der IT, wie ihn "Abteilungen informieren" am 17.08. hinterlassen hat. */
function itLink(teil: Zeile = {}): Zeile {
  return neuerLink({
    offboardingId: VORGANG_ID,
    departmentKey: "IT",
    departmentName: "IT-Abteilung",
    email: "it@example.org",
    token: "tok-it",
    expiresAt: new Date("2026-11-15T08:00:00.000Z"),
    sentAt: T_INFORMIERT,
    lastSentAt: T_INFORMIERT,
    lastSendStatus: "SENT",
    zugestelltAn: "it@example.org",
    ...teil,
  });
}

function linkVon(key: string): Zeile {
  const l = db.links.find((x) => x.departmentKey === key);
  if (!l) throw new Error(`kein Link fuer ${key}`);
  return l;
}

function aktion(rohBody: unknown, jetzt: Date) {
  return abteilungsAktionAusfuehren({ offboardingId: VORGANG_ID, rohBody, session: SESSION, jetzt });
}

function beispiel(event: string): Record<string, unknown> {
  const def = EVENT_CATALOG.find((d) => d.event === event);
  if (!def) throw new Error(`Kein Katalog-Eintrag fuer ${event}`);
  return def.samplePayload;
}

/** Token und Link sind je Lauf zufaellig bzw. haengen an APP_URL — alles andere muss gleich sein. */
function ohneLinkFelder(payload: Record<string, unknown>): Record<string, unknown> {
  const kopie = { ...payload };
  delete kopie.token;
  delete kopie.magicLink;
  delete kopie.link;
  return kopie;
}

function schluessel(payload: Record<string, unknown>): string[] {
  return Object.keys(payload).sort();
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

function payloadsVon(event: string): Record<string, unknown>[] {
  return mockTriggerWebhooks.mock.calls.filter((c) => c[0] === event).map((c) => c[1]);
}

/** Payload des (einzigen) Aufrufs fuer dieses Ereignis. */
function payloadVon(event: string): Record<string, unknown> {
  const aufrufe = payloadsVon(event);
  expect({ event, anzahl: aufrufe.length }).toEqual({ event, anzahl: 1 });
  return aufrufe[0];
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
  dbLeeren();
  process.env.NEXT_PUBLIC_APP_URL = BASIS;
  mockGetSession.mockResolvedValue(SESSION);
  // Wie sendEventEmail bei Erfolg: SENT an die Adresse aus dem Payload.
  mockTriggerWebhooks.mockImplementation(async (_event: string, payload: Record<string, unknown>) => ({
    status: "SENT",
    recipient: String(payload.email ?? "hr@example.org"),
  }));
});

afterAll(() => {
  process.env = alteUmgebung;
});

// =============================================
// offboarding-created
// =============================================

describe("offboarding-created (Service createOffboardingProcess)", () => {
  it("fuellt Name, Austrittsdatum und Einrichtung", async () => {
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
      offboardingId: VORGANG_ID,
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
  async function abschliessen() {
    db.vorgaenge = [vorgang({ status: "FINAL_SETTLEMENT" })];
    const res = await patchVorgang(
      jsonRequest(`${BASIS}/api/offboarding/${VORGANG_ID}`, "PATCH", { status: "COMPLETED" }),
      { params: Promise.resolve({ id: VORGANG_ID }) },
    );
    expect(res.status).toBe(200);
    return payloadVon("offboarding-completed");
  }

  it("nennt Name, Austrittsdatum und Einrichtung — das Datum fehlte bisher ganz", async () => {
    const payload = await abschliessen();
    expect(payload).toMatchObject({
      employeeEmail: "max.mustermann@example.org",
      completedAt: (db.vorgaenge[0].completedAt as Date).toISOString(),
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
    db.aufgaben = [aufgabe({}), aufgabe({}), aufgabe({ assigneeDepartment: "HR" }), aufgabe({ isCompleted: true })];
    const payload = await abschliessen();
    expect(payload).toMatchObject({ offene_aufgaben_beim_abschluss: "3" });
    const mail = pruefeVollstaendig("offboarding-completed", payload);
    expect(mail.text).toContain("Beim Abschluss waren noch 3 Aufgabe(n) der Checkliste offen");
    expect(mail.text).not.toContain("Alle Aufgaben");
  });

  it("zeigt ohne offene Aufgaben keinen Hinweis", async () => {
    db.aufgaben = [aufgabe({ isCompleted: true })];
    const payload = await abschliessen();
    expect(payload).toMatchObject({ offene_aufgaben_beim_abschluss: "" });
    const mail = pruefeVollstaendig("offboarding-completed", payload);
    expect(mail.text).not.toContain("Hinweis");
    expect(mail.text).not.toContain("Alle Aufgaben");
  });
});

// =============================================
// offboarding-department-assigned
// =============================================

describe("offboarding-department-assigned (abteilungsAktionAusfuehren)", () => {
  beforeEach(() => {
    db.vorgaenge = [vorgang()];
    db.konfigs = [konfig()];
    db.aufgaben = [
      ...beispielAufgaben(),
      // Personalabteilung arbeitet im Portal und bekommt keinen Link.
      aufgabe({ title: "Arbeitszeugnis erstellen", assigneeDepartment: "HR" }),
    ];
  });

  it("Erstmail: genau der Beispiel-Payload aus dem Katalog; Liste, Gültigkeit und Link stimmen", async () => {
    const r = await aktion(undefined, T_INFORMIERT);
    expect(r.status).toBe(201);

    const payload = payloadVon("offboarding-department-assigned");
    const token = linkVon("IT").token as string;
    expect(payload.token).toBe(token);
    expect(payload.magicLink).toBe(`${BASIS}/offboarding-tasks/${token}`);
    expect(payload.link).toBe(`${BASIS}/offboarding-tasks/${token}`);
    expect(ohneLinkFelder(payload)).toEqual(ohneLinkFelder(beispiel("offboarding-department-assigned")));

    const mail = pruefeVollstaendig("offboarding-department-assigned", payload);
    expect(mail.subject).toBe(
      "Offboarding-Aufgaben für IT-Abteilung: Max Mustermann (letzter Arbeitstag 31.08.2026)",
    );
    expect(mail.html).toContain(`href="${BASIS}/offboarding-tasks/${token}"`);
    expect(mail.html).not.toContain("/offboarding/abteilung/");
    // Liste im HTML maskiert und als Aufzaehlung, im Text als Zeilen.
    expect(mail.html).toContain(
      '<li style="margin:0 0 4px;">Laptop &amp; Zubehör zurücknehmen – fällig 28.08.2026</li>',
    );
    expect(mail.html).not.toContain("Laptop & Zubehör");
    expect(mail.text).toContain(
      [
        "- Laptop & Zubehör zurücknehmen – fällig 28.08.2026",
        "- IT-Zugänge und E-Mail-Konto sperren – fällig 31.08.2026",
        "- Postfach an die Schulleitung weiterleiten",
      ].join("\n"),
    );
    for (const teil of [mail.html, mail.text ?? ""]) {
      expect(teil).toContain("ist bis 15.11.2026 gültig");
      expect(teil).toContain("(zuständig: IT-Abteilung)");
      expect(teil).not.toContain("Ihrer Abteilung");
      // Erstmail: keiner der Bedingungssaetze
      expect(teil).not.toContain("erneut gesendet");
      expect(teil).not.toContain("Dies ist ein neuer Link");
      expect(teil).not.toContain("als Führungskraft eingetragen");
    }
    expect(mail.text).toContain("Letzter Arbeitstag: 31.08.2026");
    expect(mail.text).toContain("Vorgangsnummer: OFF-2026-GYM-001");
    expect(mail.text).toContain(`Aufgaben öffnen und abhaken: ${BASIS}/offboarding-tasks/${token}`);
  });

  it("Erneut senden: Satz „erneut gesendet, Link unverändert“ — bei der Erstmail fehlt er", async () => {
    await aktion(undefined, T_INFORMIERT);
    const r = await aktion(
      { aktion: "erneut-senden", departmentKey: "IT" },
      new Date(T_INFORMIERT.getTime() + 11 * MINUTE),
    );
    expect(r.status).toBe(201);

    const [erst, erneut] = payloadsVon("offboarding-department-assigned");
    expect(erneut).toMatchObject({ erneut_gesendet: "ja", neuer_link: "", link: erst.link });
    const mail = pruefeVollstaendig("offboarding-department-assigned", erneut);
    for (const teil of [mail.html, mail.text ?? ""]) {
      expect(teil).toContain("Diese Nachricht wurde erneut gesendet. Der Link ist unverändert.");
      expect(teil).not.toContain("Dies ist ein neuer Link");
    }
    expect(rendere("offboarding-department-assigned", erst).text).not.toContain("erneut gesendet");
  });

  it("Link erneuern: neuer Link und der Hinweis, dass der alte nicht mehr gilt", async () => {
    await aktion(undefined, T_INFORMIERT);
    const r = await aktion({ aktion: "link-erneuern", departmentKey: "IT" }, new Date(T_INFORMIERT.getTime() + MINUTE));
    expect(r.status).toBe(201);

    const [erst, neu] = payloadsVon("offboarding-department-assigned");
    expect(neu).toMatchObject({ neuer_link: "ja", erneut_gesendet: "" });
    expect(neu.link).not.toBe(erst.link);
    const mail = pruefeVollstaendig("offboarding-department-assigned", neu);
    for (const teil of [mail.html, mail.text ?? ""]) {
      expect(teil).toContain("Dies ist ein neuer Link. Ein früher versendeter Link ist nicht mehr gültig.");
      expect(teil).not.toContain("erneut gesendet");
    }
  });

  it("Führungskraft als Empfängerin: eigener Satz, kein „Ihrer Abteilung“, kein fehlender Artikel", async () => {
    db.vorgaenge = [vorgang({ supervisorEmail: "leitung@example.org", supervisorName: "Anna Leitung" })];
    db.aufgaben.push(
      aufgabe({
        title: "Übergabegespräch führen",
        assigneeDepartment: "VORGESETZTER",
        dueDate: new Date("2026-08-24T00:00:00.000Z"),
      }),
    );

    const r = await aktion(undefined, T_INFORMIERT);
    expect(r.status).toBe(201);

    const alle = payloadsVon("offboarding-department-assigned");
    const fk = alle.find((p) => p.departmentKey === "VORGESETZTER")!;
    const it_ = alle.find((p) => p.departmentKey === "IT")!;
    expect(fk).toMatchObject({
      abteilung: "Führungskraft",
      email: "leitung@example.org",
      ist_fuehrungskraft: "ja",
      aufgabenliste: "- Übergabegespräch führen – fällig 24.08.2026",
    });
    expect(schluessel(fk)).toEqual(schluessel(it_));

    const mail = pruefeVollstaendig("offboarding-department-assigned", fk);
    expect(mail.subject).toBe(
      "Offboarding-Aufgaben für Führungskraft: Max Mustermann (letzter Arbeitstag 31.08.2026)",
    );
    for (const teil of [mail.html, mail.text ?? ""]) {
      expect(teil).toContain("sind folgende Aufgaben für Sie vorgesehen (zuständig: Führungskraft):");
      expect(teil).toContain("weil Sie im Austrittsvorgang als Führungskraft eingetragen sind");
      expect(teil).not.toContain("Ihrer Abteilung");
      expect(teil).not.toMatch(/(für|bei) (Führungskraft|IT-Abteilung) (vorgesehen|noch)/);
    }
    // Der Satz fuer die Fuehrungskraft steht NUR in ihrer Mail.
    expect(rendere("offboarding-department-assigned", it_).text).not.toContain("als Führungskraft eingetragen");
  });
});

// =============================================
// offboarding-reminder — Knopf "Erinnern" und taeglicher Lauf
// =============================================

describe("offboarding-reminder (erinnerungenSenden und Knopf „Erinnern“)", () => {
  beforeEach(() => {
    db.vorgaenge = [vorgang()];
    db.konfigs = [konfig()];
    db.aufgaben = beispielAufgaben();
    db.links = [itLink()];
  });

  it("täglicher Lauf, Stufe WARNING: genau der Beispiel-Payload; Überfällig-Kasten mit Anzahl und Tagen", async () => {
    const e = await erinnerungenSenden(T_ERINNERT);
    expect(e).toMatchObject({ remindersProcessed: 1, errors: 0 });

    const payload = payloadVon("offboarding-reminder");
    expect(payload.magicLink).toBe(`${BASIS}/offboarding-tasks/tok-it`);
    expect(payload.link).toBe(`${BASIS}/offboarding-tasks/tok-it`);
    expect(ohneLinkFelder(payload)).toEqual(ohneLinkFelder(beispiel("offboarding-reminder")));

    const mail = pruefeVollstaendig("offboarding-reminder", payload);
    expect(mail.subject).toBe("Erinnerung: Offboarding-Aufgaben für IT-Abteilung (Max Mustermann)");
    expect(mail.html).toContain(">Überfällig</span>");
    expect(mail.html).not.toContain(">Erinnerung</span>");
    expect(mail.html).not.toContain("Dringend");
    for (const teil of [mail.html, mail.text ?? ""]) {
      expect(teil).toContain("1 Aufgabe(n) sind überfällig, die älteste seit 2 Tag(en).");
      expect(teil).toContain("ist bis 28.11.2026 gültig");
      // Es gibt keine HR-Eskalation — die Mail behauptet auch keine.
      expect(teil).not.toMatch(/Personalabteilung (wird|wurde|ist) (informiert|benachrichtigt)/);
    }
    expect(mail.text).toContain(
      "Für den Austritt von Max Mustermann am 31.08.2026 sind für Sie noch 3 Aufgabe(n) offen (zuständig: IT-Abteilung):",
    );
    expect(mail.text).toContain("- Laptop & Zubehör zurücknehmen – fällig 28.08.2026");
    expect(mail.html).toContain("Laptop &amp; Zubehör zurücknehmen");
  });

  it("Knopf „Erinnern“, Stufe INFO: Badge „Erinnerung“, kein Überfällig-Kasten — gleicher Aufbau wie der Lauf", async () => {
    // 26.08.: Laptop in zwei Tagen faellig, nichts ueberfaellig.
    const r = await aktion({ aktion: "erinnern", departmentKey: "IT" }, new Date("2026-08-26T08:00:00.000Z"));
    expect(r.status).toBe(201);

    const payload = payloadVon("offboarding-reminder");
    expect(payload).toMatchObject({
      level: "INFO",
      ist_info: "ja",
      ist_warnung: "",
      ist_eskalation: "",
      ist_ueberfaellig: "",
      ueberfaellige_aufgaben: "",
      tage_ueberfaellig: "",
    });
    // Knopf und Lauf (Beispiel = Lauf, siehe oben) liefern dieselben Schluessel.
    expect(schluessel(payload)).toEqual(schluessel(beispiel("offboarding-reminder")));

    const mail = pruefeVollstaendig("offboarding-reminder", payload);
    expect(mail.subject).toBe("Erinnerung: Offboarding-Aufgaben für IT-Abteilung (Max Mustermann)");
    expect(mail.html).toContain(">Erinnerung</span>");
    for (const teil of [mail.html, mail.text ?? ""]) {
      expect(teil).not.toContain("überfällig");
      expect(teil).not.toContain("Überfällig");
    }
  });

  it("Stufe ESCALATION: Betreff beginnt mit „Dringend – “, roter Kasten nennt Anzahl und älteste Überfälligkeit", async () => {
    // 02.09.: Laptop seit 5 Tagen, Zugaenge seit 2 Tagen ueberfaellig.
    const r = await aktion({ aktion: "erinnern", departmentKey: "IT" }, new Date("2026-09-02T08:00:00.000Z"));
    expect(r.status).toBe(201);

    const payload = payloadVon("offboarding-reminder");
    expect(payload).toMatchObject({ level: "ESCALATION", ist_eskalation: "ja", ist_warnung: "", ist_info: "" });

    const mail = pruefeVollstaendig("offboarding-reminder", payload);
    expect(mail.subject).toBe("Dringend – Erinnerung: Offboarding-Aufgaben für IT-Abteilung (Max Mustermann)");
    expect(mail.text?.startsWith("Dringend – Erinnerung:")).toBe(true);
    expect(mail.html).toContain(">Dringend: überfällig</span>");
    expect(mail.html).not.toContain(">Überfällig</span>");
    expect(mail.html).not.toContain(">Erinnerung</span>");
    for (const teil of [mail.html, mail.text ?? ""]) {
      expect(teil).toContain("2 Aufgabe(n) sind überfällig, die älteste seit 5 Tag(en).");
    }
  });

  it("Erinnerung an die Führungskraft: derselbe Text trägt auch sie", async () => {
    db.vorgaenge = [vorgang({ supervisorEmail: "leitung@example.org" })];
    db.aufgaben.push(
      aufgabe({ title: "Übergabegespräch führen", assigneeDepartment: "VORGESETZTER", dueDate: new Date("2026-08-28T00:00:00.000Z") }),
    );
    db.links.push(
      itLink({ departmentKey: "VORGESETZTER", departmentName: "Führungskraft", email: "leitung@example.org", token: "tok-fk" }),
    );

    await erinnerungenSenden(T_ERINNERT);
    const fk = payloadsVon("offboarding-reminder").find((p) => p.departmentKey === "VORGESETZTER")!;
    expect(fk).toMatchObject({ ist_fuehrungskraft: "ja", abteilung: "Führungskraft" });
    const mail = pruefeVollstaendig("offboarding-reminder", fk);
    expect(mail.subject).toBe("Erinnerung: Offboarding-Aufgaben für Führungskraft (Max Mustermann)");
    expect(mail.text).toContain("sind für Sie noch 1 Aufgabe(n) offen (zuständig: Führungskraft):");
    expect(mail.text).not.toContain("Ihre Abteilung");
  });
});

// =============================================
// offboarding-task-completed — Link der Abteilung und Portal
// =============================================

describe("offboarding-task-completed", () => {
  beforeEach(() => {
    db.vorgaenge = [vorgang()];
    db.konfigs = [konfig()];
    db.aufgaben = [
      ...beispielAufgaben(),
      aufgabe({ title: "Schlüssel einsammeln", assigneeDepartment: "FACILITY" }),
      aufgabe({ title: "Arbeitszeugnis erstellen", assigneeDepartment: "HR" }),
      aufgabe({ title: "Resturlaub abrechnen", assigneeDepartment: "HR" }),
    ];
    db.links = [itLink()];
  });

  const perLink = (itemId: string, body: unknown, jetzt = T_ERLEDIGT) =>
    oeffentlicheAufgabeAendern("tok-it", itemId, body, jetzt);
  const imPortal = (itemId: string, body: unknown) =>
    aufgabeImPortalAendern({ offboardingId: VORGANG_ID, itemId, rohBody: body, session: SESSION, jetzt: T_ERLEDIGT });

  it("Link der Abteilung: genau der Beispiel-Payload; Kommentar im HTML maskiert, im Text roh", async () => {
    const r = await perLink(ZUGAENGE.id, { isCompleted: true, comment: OFFBOARDING_ABTEILUNG_BEISPIEL_KOMMENTAR });
    expect(r.status).toBe(200);

    const payload = payloadVon("offboarding-task-completed");
    expect(payload).toEqual(beispiel("offboarding-task-completed"));
    expect(payload).not.toHaveProperty("email");

    const mail = pruefeVollstaendig("offboarding-task-completed", payload);
    expect(mail.subject).toBe("Aufgabe erledigt: IT-Zugänge und E-Mail-Konto sperren (Max Mustermann)");
    expect(mail.html).toContain("Kommentar der Abteilung:");
    expect(mail.html).toContain("Konto gesperrt &amp; Abwesenheitsnotiz eingerichtet.<br>Der Laptop fehlt noch.");
    expect(mail.text).toContain(
      "Kommentar der Abteilung: Konto gesperrt & Abwesenheitsnotiz eingerichtet.\nDer Laptop fehlt noch.",
    );
    expect(mail.text).toContain("Abteilung: IT-Abteilung");
    expect(mail.text).toContain("Erledigt über: Link der Abteilung");
    expect(mail.text).toContain("Noch offen im Vorgang: 5 Aufgabe(n)");
    expect(mail.html).toContain("Link der Abteilung");
  });

  it("<script> im Kommentar: im HTML nur maskiert, im Text roh", async () => {
    await perLink(ZUGAENGE.id, { isCompleted: true, comment: "Erledigt <script>alert(1)</script>\nZweite Zeile" });

    const mail = pruefeVollstaendig("offboarding-task-completed", payloadVon("offboarding-task-completed"));
    expect(mail.html).toContain("Erledigt &lt;script&gt;alert(1)&lt;/script&gt;<br>Zweite Zeile");
    expect(mail.html).not.toContain("<script>");
    expect(mail.text).toContain("Kommentar der Abteilung: Erledigt <script>alert(1)</script>\nZweite Zeile");
  });

  it("ohne Kommentar: kein Kommentar-Kasten, keine leere Zeile", async () => {
    await perLink(ZUGAENGE.id, { isCompleted: true });

    const payload = payloadVon("offboarding-task-completed");
    expect(payload).toMatchObject({ kommentar: "", kommentar_text: "" });
    const mail = pruefeVollstaendig("offboarding-task-completed", payload);
    expect(mail.html).not.toContain("Kommentar");
    expect(mail.text).not.toContain("Kommentar");
    expect(mail.text).toContain("Noch offen im Vorgang: 5 Aufgabe(n)\n\nCREDO HR-Portal");
  });

  it("zweimal „erledigt“ über den Link ergibt genau eine Mail", async () => {
    await perLink(ZUGAENGE.id, { isCompleted: true });
    await perLink(ZUGAENGE.id, { isCompleted: true }, new Date(T_ERLEDIGT.getTime() + MINUTE));
    expect(payloadsVon("offboarding-task-completed")).toHaveLength(1);
  });

  it("Portal, Aufgabe der IT: dieselbe Vorlage mit „Erledigt über: Portal“, dazu die alten Portal-Felder", async () => {
    const r = await imPortal(ZUGAENGE.id, { isCompleted: true });
    expect(r.status).toBe(200);

    const payload = payloadVon("offboarding-task-completed");
    expect(payload).toMatchObject({
      erledigt_ueber: "Portal",
      taskId: ZUGAENGE.id,
      taskTitle: ZUGAENGE.title,
      taskCategory: "Phase 5: Letzter Tag",
      completedById: SESSION.userId,
    });
    // Alle Felder des Link-Wegs (= Beispiel) sind auch hier da.
    expect(schluessel(payload)).toEqual(
      schluessel({ ...beispiel("offboarding-task-completed"), taskId: 1, taskTitle: 1, taskCategory: 1, completedById: 1 }),
    );
    const mail = pruefeVollstaendig("offboarding-task-completed", payload);
    expect(mail.text).toContain("Erledigt über: Portal");
    expect(mail.text).toContain("Abteilung: IT-Abteilung");
  });

  it("Portal, Aufgabe der Personalabteilung oder ohne Zuständigkeit: keine Mail (früher „Keine Abteilung zugeordnet“)", async () => {
    const hr = db.aufgaben.find((a) => a.assigneeDepartment === "HR")!;
    db.aufgaben.push(aufgabe({ id: "ohne", title: "Sonstiges", assigneeDepartment: null }));

    expect((await imPortal(hr.id as string, { isCompleted: true })).status).toBe(200);
    expect((await imPortal("ohne", { isCompleted: true })).status).toBe(200);
    expect(payloadsVon("offboarding-task-completed")).toHaveLength(0);

    const v = standardVorlage("offboarding-task-completed");
    expect(JSON.stringify(v)).not.toContain("Keine Abteilung zugeordnet");
  });
});

// =============================================
// offboarding-department-completed
// =============================================

describe("offboarding-department-completed", () => {
  beforeEach(() => {
    db.vorgaenge = [vorgang()];
    db.konfigs = [konfig()];
    db.aufgaben = beispielAufgaben([ZUGAENGE.id, POSTFACH.id]);
    db.links = [itLink({ lastReminderAt: T_ERINNERT, reminderCount: 1 })];
  });

  it("genau einmal bei der letzten Aufgabe über den Link; Payload = Beispiel aus dem Katalog", async () => {
    const r = await oeffentlicheAufgabeAendern("tok-it", LAPTOP.id, { isCompleted: true }, T_FERTIG);
    expect(r.status).toBe(200);

    const payload = payloadVon("offboarding-department-completed");
    expect(payload).toEqual(beispiel("offboarding-department-completed"));

    // Noch einmal "erledigt" (die andere Seite eines Doppelklicks): keine zweite Bestaetigung.
    await oeffentlicheAufgabeAendern("tok-it", LAPTOP.id, { isCompleted: true }, new Date(T_FERTIG.getTime() + MINUTE));
    expect(payloadsVon("offboarding-department-completed")).toHaveLength(1);

    const mail = pruefeVollstaendig("offboarding-department-completed", payload);
    expect(mail.subject).toBe("Offboarding-Aufgaben erledigt: Max Mustermann");
    expect(mail.text).toContain("alle Ihnen zugewiesenen Aufgaben (IT-Abteilung) erledigt");
    expect(mail.text).not.toContain("Ihrer Abteilung");
    expect(mail.html).toContain("FES Minden");
  });

  it("Abhaken im Portal bestätigt der Abteilung nichts", async () => {
    await aufgabeImPortalAendern({
      offboardingId: VORGANG_ID,
      itemId: LAPTOP.id,
      rohBody: { isCompleted: true },
      session: SESSION,
      jetzt: T_FERTIG,
    });
    expect(linkVon("IT").allTasksComplete).toBe(true);
    expect(payloadsVon("offboarding-department-completed")).toHaveLength(0);
  });

  it("neutraler Text für Abteilung und Führungskraft; englische Platzhalter bleiben", () => {
    const v = standardVorlage("offboarding-department-completed");
    expect(v.subject).toBe("Offboarding-Aufgaben erledigt: {{employeeName}}");
    expect(v.bodyText).toBe(
      [
        "Offboarding-Aufgaben erledigt: {{employeeName}}",
        "",
        "Vielen Dank. Im Rahmen des Offboardings von {{employeeName}} sind alle Ihnen zugewiesenen Aufgaben ({{departmentName}}) erledigt.",
        "",
        "Es sind keine weiteren Schritte Ihrerseits erforderlich.",
        "",
        "CREDO HR-Portal",
      ].join("\n"),
    );
    expect(v.bodyHtml).toContain("{{organizationName}}");
    expect(v.bodyHtml).toContain("(<strong>{{departmentName}}</strong>)");
    expect(v.bodyHtml).not.toContain("Ihrer Abteilung");
  });
});

// =============================================
// Mailer: Rohtexte im HTML-Teil
// =============================================

describe("Mailer — kommentar_text und aufgabenliste im HTML maskiert, im Text roh", () => {
  // Eine Vorlage, wie ein Admin sie im Editor schreiben koennte: die Rohtexte
  // auch im HTML. Daraus darf kein Markup werden.
  const adminVorlage = {
    subject: "Betreff {{kommentar_text}}",
    bodyHtml: "<p>{{kommentar_text}}</p><div>{{aufgabenliste}}</div><p>{{kommentar}}</p>{{aufgabenliste_html}}",
    bodyText: "{{kommentar_text}}\n{{aufgabenliste}}",
    ...LEERE_EMPFAENGER,
  };
  const payload = {
    kommentar_text: "<script>alert(1)</script>",
    aufgabenliste: "- <b>Titel</b> – fällig 28.08.2026",
    // die schon maskierten Geschwister, wie der Dienst sie baut
    kommentar: kommentarMailFelder("<i>schon</i> maskiert").kommentar,
    aufgabenliste_html: aufgabenlisteMailFelder([{ title: "A & B", dueDate: null }]).aufgabenliste_html,
  };

  it.each(["offboarding-task-completed", "offboarding-department-assigned"])("%s", (event) => {
    const { rendered } = renderEventEmail(adminVorlage, event, payload, { overrideTo: "hr@example.org" });
    expect(rendered).not.toBeNull();
    const { html, text, subject } = rendered!;

    expect(html).toContain("<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>");
    expect(html).toContain("<div>- &lt;b&gt;Titel&lt;/b&gt; – fällig 28.08.2026</div>");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<b>");
    // Schon maskierte Felder werden NICHT ein zweites Mal maskiert.
    expect(html).toContain("<p>&lt;i&gt;schon&lt;/i&gt; maskiert</p>");
    expect(html).toContain('<li style="margin:0 0 4px;">A &amp; B</li>');
    expect(html).not.toContain("&amp;lt;");
    expect(html).not.toContain("&amp;amp;");

    // Textteil und Betreff bleiben roh.
    expect(text).toBe("<script>alert(1)</script>\n- <b>Titel</b> – fällig 28.08.2026");
    expect(subject).toBe("Betreff <script>alert(1)</script>");
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
    expect(mail.text).toContain("Für den Austritt von Max Mustermann am 31.08.2026");
    expect(mail.text).toContain("noch 4 Aufgabe(n) offen");
    expect(mail.text).toContain(`${BASIS}/offboarding-tasks/x`);
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
    pruefeVollstaendig(event, beispiel(event));
  });

  it("der gemeinsame Offboarding-Teil entspricht dem, was offboardingMailFelder liefert", () => {
    // Der Katalog schreibt die Felder ab (er laeuft auch im Browser und kann
    // offboardingMailFelder nicht aufrufen). Dieser Test haelt beide gleich.
    const echt = offboardingMailFelder({
      id: VORGANG_ID,
      displayId: "OFF-2026-GYM-001",
      employeeFirstName: "Max",
      employeeLastName: "Mustermann",
      lastWorkingDay: new Date("2026-08-31T00:00:00.000Z"),
      organization: { name: "FES Minden", mandantNumber: "01" },
    });
    for (const event of ereignisse.filter((e) => e.startsWith("offboarding-") && e !== "offboarding-documents-sent")) {
      expect({ event, felder: beispiel(event) }).toMatchObject({ event, felder: echt });
    }
  });

  it("Aufgabenliste (Klartext und HTML) = aufgabenlisteMailFelder(Beispielaufgaben)", () => {
    const echt = aufgabenlisteMailFelder(OFFBOARDING_ABTEILUNG_BEISPIEL_AUFGABEN);
    expect(beispiel("offboarding-department-assigned")).toMatchObject(echt);
    expect(beispiel("offboarding-reminder")).toMatchObject(echt);
  });

  it("Kommentar = kommentarMailFelder(Beispielkommentar), maskiert mit <br>", () => {
    const echt = kommentarMailFelder(OFFBOARDING_ABTEILUNG_BEISPIEL_KOMMENTAR);
    expect(echt.kommentar).toContain("&amp;");
    expect(echt.kommentar).toContain("<br>");
    expect(beispiel("offboarding-task-completed")).toMatchObject(echt);
  });

  it("Stufenfelder der Erinnerung = stufenMailFelder(stufeBerechnen(...)) am 30.08.2026", () => {
    const stufe = stufeBerechnen(OFFBOARDING_ABTEILUNG_BEISPIEL_AUFGABEN, T_ERINNERT);
    expect(stufe.level).toBe("WARNING");
    expect(beispiel("offboarding-reminder")).toMatchObject(stufenMailFelder(stufe, "WARNING"));
  });

  it("Testversand der Erinnerung zeigt jede Stufe ohne Rohtext", () => {
    const basis = beispiel("offboarding-reminder");
    const stufen: Array<[string, Date, string]> = [
      ["INFO", new Date("2026-08-26T08:00:00.000Z"), ">Erinnerung</span>"],
      ["WARNING", T_ERINNERT, ">Überfällig</span>"],
      ["ESCALATION", new Date("2026-09-02T08:00:00.000Z"), ">Dringend: überfällig</span>"],
    ];
    for (const [level, jetzt, badge] of stufen) {
      const stufe = stufeBerechnen(OFFBOARDING_ABTEILUNG_BEISPIEL_AUFGABEN, jetzt);
      expect(stufe.level).toBe(level);
      const mail = pruefeVollstaendig("offboarding-reminder", {
        ...basis,
        ...stufenMailFelder(stufe, stufe.level!),
      });
      expect({ level, badge: mail.html.includes(badge) }).toEqual({ level, badge: true });
      expect(mail.subject.startsWith("Dringend – ")).toBe(level === "ESCALATION");
    }
  });
});
