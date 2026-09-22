/**
 * Tests: Abteilungsaufgaben im Offboarding — Datenbankteil
 * (src/lib/abteilungsaufgaben-dienst.ts, src/lib/abteilungsaufgaben-uebergaenge.ts)
 *
 * Statt jede Prisma-Abfrage einzeln zu mocken, laeuft hier eine kleine
 * In-Memory-Datenbank (src/__tests__/hilfen/abteilungs-fake-db.ts), die genau
 * die Abfrageformen der beiden Dateien versteht (where mit Gleichheit,
 * not/in/notIn, bedingtes updateMany, increment, select-Projektion). So
 * pruefen die Tests Zustaende ("Token unveraendert",
 * "lastReminderAt nicht gesetzt") statt Aufrufparameter. Das Sperrverhalten
 * von Postgres bildet der Fake nicht nach — geprueft wird die Reihenfolge
 * (erst sperren, dann aendern) und die Bedingung der Updates.
 */

type MailErgebnis = { status: "SENT" | "FAILED" | "SKIPPED"; detail?: string; recipient?: string } | null;
let mailErgebnis: (event: string, payload: Zeile) => MailErgebnis = (_e, p) => ({
  status: "SENT",
  recipient: String(p.email ?? "hr@example.org"),
});
const mockTrigger = jest.fn(async (event: string, payload: Zeile) => mailErgebnis(event, payload));

jest.mock("@/lib/db", () => ({
  prisma: jest.requireActual("../hilfen/abteilungs-fake-db").fakePrisma,
}));
jest.mock("@/lib/webhooks", () => ({ triggerWebhooks: (e: string, p: Zeile) => mockTrigger(e, p) }));

import { db, dbLeeren, fakePrisma, naechsteId, neuerLink, type Zeile } from "../hilfen/abteilungs-fake-db";
import {
  abteilungsAktionAusfuehren,
  abteilungsUebersichtLaden,
  erinnerungenSenden,
  faelligkeitenVerschieben,
  fuehrungskraftAdresseFreigegeben,
  fuehrungskraftErmitteln,
  letztenArbeitstagSperren,
} from "@/lib/abteilungsaufgaben-dienst";
import {
  aufgabeImPortalAendern,
  oeffentlicheAufgabeAendern,
  oeffentlicheAufgabenLaden,
} from "@/lib/abteilungsaufgaben-uebergaenge";
import { MELDUNGEN, VORLAGE_DEAKTIVIERT_DETAIL } from "@/lib/abteilungsaufgaben";
import type { SessionPayload } from "@/lib/permissions";
import type { Prisma } from "@prisma/client";

// =============================================
// Testdaten
// =============================================

const BASIS = "https://hr.example.org";
const TAG = 86_400_000;
const JETZT = new Date("2027-07-20T08:00:00.000Z");
const tage = (n: number) => new Date(JETZT.getTime() + n * TAG);

const HR: SessionPayload = {
  userId: "u-hr",
  email: "hr@example.org",
  role: "HR_SACHBEARBEITER",
  firstName: "Erika",
  lastName: "Sachbearbeiter",
};

function vorgang(teil: Zeile = {}): Zeile {
  return {
    id: "off-1",
    displayId: "OFF-2027-GYM-014",
    organizationId: "org-1",
    status: "HANDOVER_PHASE",
    employeeFirstName: "Max",
    employeeLastName: "Mustermann",
    lastWorkingDay: new Date("2027-07-31T00:00:00.000Z"),
    supervisorEmail: null,
    supervisorName: null,
    organization: { name: "FES Minden", mandantNumber: "01" },
    zeugnisBewertung: null,
    contractEnd: null,
    ...teil,
  };
}

function aufgabe(teil: Zeile): Zeile {
  return {
    id: `i-${naechsteId()}`,
    offboardingId: "off-1",
    title: "Aufgabe",
    category: "Phase 5: Letzter Tag",
    orderIndex: naechsteId(),
    description: null,
    assigneeDepartment: "IT",
    isCompleted: false,
    completedAt: null,
    completedById: null,
    dueDate: new Date("2027-07-31T00:00:00.000Z"),
    notes: null,
    abteilungKommentar: null,
    abteilungKommentarAm: null,
    ...teil,
  };
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

function link(teil: Zeile = {}): Zeile {
  return neuerLink({
    offboardingId: "off-1",
    departmentKey: "IT",
    departmentName: "IT-Abteilung",
    email: "it@example.org",
    token: "tok-it",
    expiresAt: tage(60),
    sentAt: tage(-10),
    lastSendStatus: "SENT",
    ...teil,
  });
}

function aktion(rohBody: unknown, session: SessionPayload = HR, jetzt = JETZT) {
  return abteilungsAktionAusfuehren({ offboardingId: "off-1", rohBody, session, jetzt });
}

function mails(event: string): Zeile[] {
  return mockTrigger.mock.calls.filter((c) => c[0] === event).map((c) => c[1]);
}

function linkVon(key: string): Zeile {
  const l = db.links.find((x) => x.departmentKey === key);
  if (!l) throw new Error(`kein Link fuer ${key}`);
  return l;
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.NEXT_PUBLIC_APP_URL = BASIS;
  dbLeeren();
  db.vorgaenge = [vorgang()];
  db.konfigs = [konfig()];
  mailErgebnis = (_e, p) => ({ status: "SENT", recipient: String(p.email ?? "hr@example.org") });
});

// =============================================
// Abteilungen informieren
// =============================================

describe("informieren", () => {
  beforeEach(() => {
    db.aufgaben = [
      aufgabe({ title: "IT-Zugänge sperren", assigneeDepartment: "IT" }),
      aufgabe({ title: "Schlüssel einsammeln", assigneeDepartment: "FACILITY", dueDate: new Date("2027-07-30T00:00:00Z") }),
      aufgabe({ title: "Übergabe", assigneeDepartment: "VORGESETZTER" }),
      aufgabe({ title: "Zeugnis", assigneeDepartment: "HR" }),
    ];
    db.konfigs.push(konfig({ departmentKey: "FACILITY", departmentName: "Facility Management", email: "fm@example.org" }));
  });

  it("schreibt IT und Facility, meldet die fehlende Führungskraft und protokolliert", async () => {
    const r = await aktion(undefined);
    expect(r.status).toBe(201);
    expect(r.body.meldung).toBe("2 Abteilungen informiert: IT-Abteilung, Facility Management.");
    expect(r.body.hinweis).toBe(
      "Nicht informiert: Führungskraft (keine Führungskraft hinterlegt – bitte im Tab Übersicht eintragen).",
    );
    expect(r.body.error).toBeUndefined();

    const it_ = linkVon("IT");
    expect(it_).toMatchObject({ lastSendStatus: "SENT", zugestelltAn: "it@example.org" });
    expect(it_.sentAt).toEqual(JETZT);
    expect(it_.lastSentAt).toEqual(JETZT);
    // Gueltig bis: jetzt + 90 Tage (spaeteste Faelligkeit + 30 liegt frueher)
    expect((it_.expiresAt as Date).toISOString()).toBe(tage(90).toISOString());

    const [payload] = mails("offboarding-department-assigned").filter((p) => p.departmentKey === "IT");
    expect(payload).toMatchObject({
      offboardingId: "off-1",
      employeeName: "Max Mustermann",
      austrittsdatum: "31.07.2027",
      abteilung: "IT-Abteilung",
      email: "it@example.org",
      taskCount: 1,
      token: it_.token,
      magicLink: `${BASIS}/offboarding-tasks/${it_.token}`,
      link: `${BASIS}/offboarding-tasks/${it_.token}`,
      anzahl_aufgaben: 1,
      aufgabenliste: "- IT-Zugänge sperren – fällig 31.07.2027",
      naechste_faelligkeit: "31.07.2027",
      erneut_gesendet: "",
      neuer_link: "",
      ist_fuehrungskraft: "",
    });
    expect(mails("offboarding-department-assigned")).toHaveLength(2);
    expect(db.audits).toContainEqual(
      expect.objectContaining({
        action: "DEPARTMENT_LINKS_SENT",
        userId: "u-hr",
        details: {
          versendet: [
            { departmentKey: "IT", email: "it@example.org", status: "SENT" },
            { departmentKey: "FACILITY", email: "fm@example.org", status: "SENT" },
          ],
          uebersprungen: [{ departmentKey: "VORGESETZTER", grund: "KEINE_FUEHRUNGSKRAFT" }],
        },
      }),
    );
  });

  it("der zweite Aufruf behaelt den Token der informierten Abteilung und schreibt nur an die neue", async () => {
    await aktion({});
    const tokenVorher = linkVon("IT").token;
    mockTrigger.mockClear();

    db.aufgaben.push(aufgabe({ title: "Postfach löschen", assigneeDepartment: "DSB" }));
    db.konfigs.push(konfig({ departmentKey: "DSB", departmentName: "Datenschutz", email: "dsb@example.org" }));

    const r = await aktion({ aktion: "informieren" });
    expect(r.status).toBe(201);
    expect(r.body.meldung).toBe("1 Abteilung informiert: Datenschutz.");
    expect(mails("offboarding-department-assigned").map((p) => p.departmentKey)).toEqual(["DSB"]);
    expect(linkVon("IT").token).toBe(tokenVorher);
  });

  it("ein Klick ohne jeden Versandversuch schreibt kein 'Abteilungen informiert' ins Protokoll", async () => {
    await aktion(undefined);
    const vorher = db.audits.length;
    const r = await aktion(undefined);
    expect(r.status).toBe(409);
    expect(r.body.error).toBe(
      "Es wurde niemand informiert. Führungskraft: keine Führungskraft hinterlegt – bitte im Tab Übersicht eintragen.",
    );
    expect(db.audits).toHaveLength(vorher);
  });

  it("ist nichts versendbar, kommt 409 mit den Namen der Abteilungen", async () => {
    db.konfigs = [];
    const r = await aktion(undefined);
    expect(r.status).toBe(409);
    expect(r.body.error).toBe(
      "Es wurde niemand informiert. IT-Abteilung: keine aktive Adresse hinterlegt (Einstellungen → Abteilungen). Facility Management: keine aktive Adresse hinterlegt (Einstellungen → Abteilungen). Führungskraft: keine Führungskraft hinterlegt – bitte im Tab Übersicht eintragen.",
    );
    expect(mockTrigger).not.toHaveBeenCalled();
    expect(db.links).toHaveLength(0);
  });

  it("SMTP-Fehler: sentAt bleibt null, FAILED am Link, 502 — und der naechste Klick versucht es erneut", async () => {
    db.aufgaben = db.aufgaben.filter((a) => a.assigneeDepartment === "IT");
    mailErgebnis = () => ({ status: "FAILED", detail: "SMTP-Server nicht erreichbar" });
    const r = await aktion(undefined);
    expect(r.status).toBe(502);
    expect(linkVon("IT")).toMatchObject({ sentAt: null, lastSendStatus: "FAILED", lastSendDetail: "SMTP-Server nicht erreichbar" });
    const tokenVorher = linkVon("IT").token;

    mailErgebnis = (_e, p) => ({ status: "SENT", recipient: String(p.email) });
    const r2 = await aktion(undefined);
    expect(r2.status).toBe(201);
    expect(linkVon("IT")).toMatchObject({ lastSendStatus: "SENT", lastSendDetail: null, token: tokenVorher });
    expect(linkVon("IT").sentAt).toEqual(JETZT);
  });

  it("deaktivierte Portal-Vorlage + aktiver Webhook: gilt als uebergeben (WEBHOOK), kein Dauer-Neuversand", async () => {
    db.aufgaben = db.aufgaben.filter((a) => a.assigneeDepartment === "IT");
    db.webhooks = [{ event: "offboarding-department-assigned", isActive: true }];
    mailErgebnis = () => ({ status: "SKIPPED", detail: VORLAGE_DEAKTIVIERT_DETAIL });
    const r = await aktion(undefined);
    expect(r.status).toBe(201);
    expect(linkVon("IT")).toMatchObject({ lastSendStatus: "WEBHOOK", zugestelltAn: null });
    expect(linkVon("IT").sentAt).toEqual(JETZT);
    expect(r.body.hinweis).toContain("Webhook");

    mockTrigger.mockClear();
    const r2 = await aktion(undefined);
    expect(r2.status).toBe(409);
    expect(mockTrigger).not.toHaveBeenCalled();
  });

  it("deaktivierte Vorlage ohne Webhook: sichtbar nicht versendet (409)", async () => {
    db.aufgaben = db.aufgaben.filter((a) => a.assigneeDepartment === "IT");
    mailErgebnis = () => ({ status: "SKIPPED", detail: VORLAGE_DEAKTIVIERT_DETAIL });
    const r = await aktion(undefined);
    expect(r.status).toBe(409);
    expect(linkVon("IT")).toMatchObject({ sentAt: null, lastSendStatus: "SKIPPED" });
  });

  it("VORGESETZTER geht an die Führungskraft des Vorgangs, sonst an die aus der Zeugnis-Bewertung", async () => {
    db.aufgaben = db.aufgaben.filter((a) => a.assigneeDepartment === "VORGESETZTER");
    db.konfigs.push(konfig({ departmentKey: "VORGESETZTER", email: "alle@example.org" }));
    db.vorgaenge = [vorgang({ zeugnisBewertung: { supervisorEmail: "zeugnis@example.org", supervisorName: "Z" } })];
    await aktion(undefined);
    expect(mails("offboarding-department-assigned")[0]).toMatchObject({
      email: "zeugnis@example.org",
      abteilung: "Führungskraft",
      ist_fuehrungskraft: "ja",
    });

    db.links = [];
    mockTrigger.mockClear();
    db.vorgaenge = [vorgang({ supervisorEmail: "leitung@example.org", zeugnisBewertung: { supervisorEmail: "zeugnis@example.org", supervisorName: null } })];
    await aktion(undefined);
    expect(mails("offboarding-department-assigned")[0].email).toBe("leitung@example.org");
  });
});

// =============================================
// Rechte, Status, Sperre
// =============================================

describe("Rechte, Vorgangsstatus und Sperre", () => {
  beforeEach(() => {
    db.aufgaben = [aufgabe({ assigneeDepartment: "IT" })];
  });

  it("Rolle ausserhalb von HR_EDIT_ROLES: 403", async () => {
    const r = await aktion(undefined, { ...HR, role: "VORGESETZTER" });
    expect(r).toEqual({ status: 403, body: { error: "Keine Berechtigung" } });
  });

  it("unbekannter Vorgang: 404 'Offboarding-Vorgang nicht gefunden'", async () => {
    // HR_EDIT_ROLES sind heute alle global; canAccessProcess ist hier das
    // Netz fuer spaeter (derselbe Text wie unbekannt). Den Mandanten-404 mit
    // einer beschraenkten Rolle prueft der Portal-Test unten (CHECKLIST_ROLES).
    db.vorgaenge = [];
    expect(await aktion(undefined)).toEqual({ status: 404, body: { error: MELDUNGEN.VORGANG_NICHT_GEFUNDEN } });
  });

  it("EINRICHTUNGSLEITUNG darf nicht versenden (nicht in HR_EDIT_ROLES): 403", async () => {
    db.zuweisungen = [{ userId: "u-hr", organizationId: "org-1" }];
    expect((await aktion(undefined, { ...HR, role: "EINRICHTUNGSLEITUNG" })).status).toBe(403);
  });

  it("COMPLETED und CANCELLED: 409, kein Versand", async () => {
    db.vorgaenge = [vorgang({ status: "COMPLETED" })];
    expect(await aktion(undefined)).toEqual({
      status: 409,
      body: { error: MELDUNGEN.HR_VORGANG_ABGESCHLOSSEN, grund: "VORGANG_ABGESCHLOSSEN" },
    });
    db.vorgaenge = [vorgang({ status: "CANCELLED" })];
    expect((await aktion(undefined)).body.error).toBe(MELDUNGEN.HR_VORGANG_ABGEBROCHEN);
    expect(mockTrigger).not.toHaveBeenCalled();
  });

  it("ungueltige Aktion: 400", async () => {
    expect((await aktion({ aktion: "alles-loeschen" })).status).toBe(400);
  });

  it("zwei parallele Aufrufe: einer versendet, der andere bekommt 409 'Der Versand läuft bereits.'", async () => {
    let freigeben: () => void = () => {};
    const warten = new Promise<void>((r) => (freigeben = r));
    mockTrigger.mockImplementationOnce(async (_e: string, p: Zeile) => {
      await warten;
      return { status: "SENT", recipient: String(p.email) };
    });
    const erster = aktion(undefined);
    await new Promise((r) => setTimeout(r, 10));
    const zweiter = await aktion(undefined);
    freigeben();
    expect(zweiter).toEqual({ status: 409, body: { error: MELDUNGEN.VERSAND_LAEUFT } });
    expect((await erster).status).toBe(201);
    // Danach ist die Sperre wieder frei.
    expect((await aktion(undefined)).status).toBe(409); // nichts mehr offen zu informieren
  });

  it("eine Ausnahme mitten im Versand gibt die Sperre trotzdem frei", async () => {
    const upsert = (fakePrisma.offboardingDepartmentLink as { upsert: jest.Mock }).upsert;
    upsert.mockImplementationOnce(async () => {
      throw new Error("Verbindung zur Datenbank verloren");
    });
    await expect(aktion(undefined)).rejects.toThrow("Verbindung zur Datenbank verloren");
    // Ohne finally stuende hier "Der Versand läuft bereits." — fuer immer.
    const r = await aktion(undefined);
    expect(r.status).toBe(201);
  });
});

// =============================================
// Erneut senden, Erinnern, Link erneuern
// =============================================

describe("erneut-senden", () => {
  beforeEach(() => {
    db.aufgaben = [aufgabe({ assigneeDepartment: "IT" })];
    db.links = [link()];
  });

  it("behaelt Token und sentAt, setzt lastSentAt; die Mail traegt erneut_gesendet 'ja'", async () => {
    const r = await aktion({ aktion: "erneut-senden", departmentKey: "IT" });
    expect(r.status).toBe(201);
    expect(r.body.meldung).toBe("E-Mail an IT-Abteilung erneut gesendet. Der Link ist unverändert.");
    expect(linkVon("IT")).toMatchObject({ token: "tok-it", sentAt: tage(-10), lastSentAt: JETZT });
    expect(mails("offboarding-department-assigned")[0]).toMatchObject({ erneut_gesendet: "ja", neuer_link: "" });
    expect(db.audits.map((a) => a.action)).toEqual(["DEPARTMENT_LINK_RESENT"]);
  });

  it("geaenderte Adresse in den Einstellungen: neuer Token an die neue Adresse, Protokoll LINK_RENEWED", async () => {
    db.konfigs = [konfig({ email: "it-neu@example.org" })];
    const r = await aktion({ aktion: "erneut-senden", departmentKey: "IT" });
    expect(r.status).toBe(201);
    expect(r.body.meldung).toContain("neue Adresse it-neu@example.org");
    expect(linkVon("IT").token).not.toBe("tok-it");
    expect(linkVon("IT").email).toBe("it-neu@example.org");
    expect(mails("offboarding-department-assigned")[0]).toMatchObject({ neuer_link: "ja", erneut_gesendet: "" });
    expect(db.audits).toContainEqual(
      expect.objectContaining({
        action: "DEPARTMENT_LINK_RENEWED",
        details: expect.objectContaining({ grund: "ADRESSE_GEAENDERT", emailAlt: "it@example.org", emailNeu: "it-neu@example.org" }),
      }),
    );
  });

  it("Sperrzeit: vor 3 Minuten gesendet → 409, keine Mail", async () => {
    db.links = [link({ lastSentAt: new Date(JETZT.getTime() - 3 * 60_000) })];
    const r = await aktion({ aktion: "erneut-senden", departmentKey: "IT" });
    expect(r.status).toBe(409);
    expect(r.body.error).toContain("vor weniger als 10 Minuten");
    expect(mockTrigger).not.toHaveBeenCalled();
  });

  it("ohne Link: 409 noch nicht informiert", async () => {
    db.links = [];
    const r = await aktion({ aktion: "erneut-senden", departmentKey: "IT" });
    expect(r.status).toBe(409);
    expect(r.body.error).toBe("Erneut senden nicht möglich. IT-Abteilung: noch nicht informiert.");
  });

  it("nie zugestellter Link (FAILED): ist fuer die Empfaengerin die Erstmail", async () => {
    db.links = [link({ sentAt: null, lastSendStatus: "FAILED" })];
    const r = await aktion({ aktion: "erneut-senden", departmentKey: "IT" });
    expect(r.status).toBe(201);
    // Nie etwas zugestellt (lastSentAt null) → kein Hinweis auf einen alten Link.
    expect(mails("offboarding-department-assigned")[0]).toMatchObject({ erneut_gesendet: "", neuer_link: "" });
    expect(linkVon("IT").sentAt).toEqual(JETZT);
  });

  it("keine Aktion ohne aufloesbaren Empfaenger: 409 mit Grund, keine Mail", async () => {
    db.konfigs = [konfig({ isActive: false })];
    const r = await aktion({ aktion: "erneut-senden", departmentKey: "IT" });
    expect(r.status).toBe(409);
    expect(r.body.error).toContain("Abteilung ist deaktiviert");
    expect(mockTrigger).not.toHaveBeenCalled();
  });
});

describe("erinnern (Knopf)", () => {
  beforeEach(() => {
    db.aufgaben = [aufgabe({ assigneeDepartment: "IT", dueDate: tage(-1), title: "Konto sperren" })];
  });

  it("abgelaufener Link wird mit gleichem Token verlaengert; Stufe wie im Cron (WARNING)", async () => {
    db.links = [link({ expiresAt: tage(-2), reminderCount: 1 })];
    const r = await aktion({ action: "remind", departmentKey: "IT" });
    expect(r.status).toBe(201);
    expect(r.body.meldung).toBe("Erinnerung an IT-Abteilung gesendet.");
    const l = linkVon("IT");
    expect(l.token).toBe("tok-it");
    expect((l.expiresAt as Date).getTime()).toBe(tage(90).getTime());
    expect(l).toMatchObject({ lastReminderAt: JETZT, reminderCount: 2, lastSendStatus: "SENT" });
    expect(mails("offboarding-reminder")[0]).toMatchObject({
      level: "WARNING",
      ist_warnung: "ja",
      ist_ueberfaellig: "ja",
      ueberfaellige_aufgaben: "1",
      tage_ueberfaellig: "1",
      reminderCount: 2,
      offene_aufgaben: 1,
      totalOpenItems: 1,
      aufgabenliste: "- Konto sperren – fällig 19.07.2027",
      magicLink: `${BASIS}/offboarding-tasks/tok-it`,
    });
    expect(db.audits).toContainEqual(
      expect.objectContaining({ action: "DEPARTMENT_REMINDER_SENT", details: expect.objectContaining({ level: "WARNING", status: "SENT" }) }),
    );
  });

  it("alles erledigt: 409", async () => {
    db.links = [link({ allTasksComplete: true })];
    const r = await aktion({ aktion: "erinnern", departmentKey: "IT" });
    expect(r.status).toBe(409);
    expect(r.body.error).toContain("alle Aufgaben sind erledigt");
  });

  it("nicht informiert (sentAt null): 409", async () => {
    db.links = [link({ sentAt: null })];
    expect((await aktion({ aktion: "erinnern", departmentKey: "IT" })).status).toBe(409);
  });

  it("SMTP-Fehler: kein Merker, 502", async () => {
    db.links = [link()];
    mailErgebnis = () => ({ status: "FAILED", detail: "Timeout" });
    const r = await aktion({ aktion: "erinnern", departmentKey: "IT" });
    expect(r.status).toBe(502);
    expect(linkVon("IT")).toMatchObject({ lastReminderAt: null, reminderCount: 0, lastSendStatus: "FAILED" });
  });

  it("geaenderte Adresse: statt Erinnerung die Zuweisung mit neuem Link an die neue Adresse", async () => {
    db.links = [link()];
    db.konfigs = [konfig({ email: "it-neu@example.org" })];
    const r = await aktion({ aktion: "erinnern", departmentKey: "IT" });
    expect(r.status).toBe(201);
    expect(mails("offboarding-reminder")).toHaveLength(0);
    expect(mails("offboarding-department-assigned")[0]).toMatchObject({ email: "it-neu@example.org", neuer_link: "ja" });
  });
});

describe("link-erneuern", () => {
  it("neuer Token, Oeffnungszaehler zurueck, Protokoll mit Grund HR", async () => {
    db.aufgaben = [aufgabe({ assigneeDepartment: "IT" })];
    db.links = [link({ openCount: 3, firstOpenedAt: tage(-5), lastOpenedAt: tage(-1), lastSentAt: new Date(JETZT.getTime() - 60_000) })];
    const r = await aktion({ aktion: "link-erneuern", departmentKey: "IT" });
    expect(r.status).toBe(201);
    const l = linkVon("IT");
    expect(l.token).not.toBe("tok-it");
    expect(l).toMatchObject({ openCount: 0, firstOpenedAt: null, lastOpenedAt: null, sentAt: tage(-10) });
    expect(mails("offboarding-department-assigned")[0]).toMatchObject({ neuer_link: "ja", token: l.token });
    expect(db.audits).toContainEqual(
      expect.objectContaining({ action: "DEPARTMENT_LINK_RENEWED", details: expect.objectContaining({ grund: "HR" }) }),
    );
  });

  it("scheitert die Mail mit dem neuen Link: sentAt null, Zeile rot, 'Erneut senden' ist dann eine Erstmail", async () => {
    db.aufgaben = [aufgabe({ assigneeDepartment: "IT" })];
    db.links = [link()];
    mailErgebnis = () => ({ status: "FAILED", detail: "SMTP-Server nicht erreichbar" });
    const r = await aktion({ aktion: "link-erneuern", departmentKey: "IT" });
    expect(r.status).toBe(502);
    expect(r.body.error).toContain("Der bisherige Link von IT-Abteilung ist ungültig");
    const l = linkVon("IT");
    expect(l.token).not.toBe("tok-it");
    // lastSentAt haelt die fruehere Zustellung fest (Bestandslink: aus sentAt).
    expect(l).toMatchObject({ sentAt: null, lastSendStatus: "FAILED", lastSentAt: tage(-10) });

    // Die Karte zeigt den Fehlschlag rot — nicht "Informiert am …".
    const u = await abteilungsUebersichtLaden(
      {
        ...(db.vorgaenge[0] as { id: string; organizationId: string; status: string; lastWorkingDay: Date }),
        checklistItems: db.aufgaben as never,
        departmentLinks: db.links as never,
      },
      JETZT,
    );
    expect(u.abteilungen.zeilen[0].anzeige).toMatchObject({ status: "FEHLGESCHLAGEN", farbe: "rot" });
    expect(u.abteilungen.zeilen[0].aktionen).toMatchObject({ erneutSenden: true, erinnern: false });

    // Der Cron erinnert nicht mit einem Link, den niemand bekommen hat.
    mockTrigger.mockClear();
    expect((await erinnerungenSenden(JETZT)).details).toHaveLength(0);

    // "Erneut senden" behauptet nicht "Der Link ist unverändert" — und sagt
    // dazu, dass der Link aus der frueheren Mail nicht mehr gilt (die Abteilung
    // hat die Mail vom ersten Versand noch, deren Link jetzt "Ungültiger Link" meldet).
    mailErgebnis = (_e, p) => ({ status: "SENT", recipient: String(p.email) });
    const r2 = await aktion({ aktion: "erneut-senden", departmentKey: "IT" });
    expect(r2.status).toBe(201);
    expect(mails("offboarding-department-assigned")[0]).toMatchObject({
      erneut_gesendet: "",
      neuer_link: "ja",
      token: l.token,
    });
    expect(linkVon("IT").sentAt).toEqual(JETZT);
  });

  it("nach gescheitertem Link erneuern traegt auch 'Abteilungen informieren' den Hinweis auf den neuen Link", async () => {
    db.aufgaben = [aufgabe({ assigneeDepartment: "IT" })];
    db.links = [link({ lastSentAt: tage(-10) })];
    mailErgebnis = () => ({ status: "FAILED", detail: "SMTP-Server nicht erreichbar" });
    expect((await aktion({ aktion: "link-erneuern", departmentKey: "IT" })).status).toBe(502);
    const neuerToken = linkVon("IT").token;

    mockTrigger.mockClear();
    mailErgebnis = (_e, p) => ({ status: "SENT", recipient: String(p.email) });
    const r = await aktion(undefined);
    expect(r.status).toBe(201);
    expect(mails("offboarding-department-assigned")[0]).toMatchObject({ neuer_link: "ja", token: neuerToken });
    // Die Meldung an HR spricht nicht von einer "neuen Adresse".
    expect(r.body.meldung).toBe("1 Abteilung informiert: IT-Abteilung.");
  });

  it("erledigte Abteilung: 409 'alle Aufgaben sind erledigt', der Token bleibt, keine Mail", async () => {
    db.aufgaben = [aufgabe({ assigneeDepartment: "IT", isCompleted: true, completedAt: tage(-1) })];
    db.links = [link({ allTasksComplete: true, completedAt: tage(-1) })];
    const r = await aktion({ aktion: "link-erneuern", departmentKey: "IT" });
    expect(r.status).toBe(409);
    expect(r.body.error).toBe("Link erneuern nicht möglich. IT-Abteilung: alle Aufgaben sind erledigt.");
    expect(linkVon("IT").token).toBe("tok-it");
    expect(mockTrigger).not.toHaveBeenCalled();
  });

  it("alle Aufgaben umgehaengt (Abteilung ohne Aufgaben): 409 statt einer Mail mit leerer Liste", async () => {
    db.aufgaben = [aufgabe({ assigneeDepartment: "FACILITY" })];
    db.links = [link()];
    const r = await aktion({ aktion: "link-erneuern", departmentKey: "IT" });
    expect(r.status).toBe(409);
    expect(mockTrigger).not.toHaveBeenCalled();
  });

  it("ohne aufloesbaren Empfaenger: 409, der alte Link bleibt gueltig", async () => {
    db.aufgaben = [aufgabe({ assigneeDepartment: "IT" })];
    db.links = [link()];
    db.konfigs = [];
    const r = await aktion({ aktion: "link-erneuern", departmentKey: "IT" });
    expect(r.status).toBe(409);
    expect(linkVon("IT").token).toBe("tok-it");
  });
});

// =============================================
// Datenbankfehler NACH dem Versand
// =============================================

describe("Datenbankfehler nach erfolgreichem Versand", () => {
  let logFehler: jest.SpyInstance;
  beforeEach(() => {
    db.aufgaben = [aufgabe({ assigneeDepartment: "IT", title: "Konto sperren" })];
    logFehler = jest.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => logFehler.mockRestore());

  const ergebnisUpdateScheitert = () =>
    (fakePrisma.offboardingDepartmentLink as { update: jest.Mock }).update.mockImplementationOnce(async () => {
      throw new Error("Verbindung zur Datenbank verloren");
    });

  it("informieren: 201 statt 500, lauter Hinweis 'nicht erneut senden', Protokoll trotzdem", async () => {
    // Ohne Link: upsert legt an, das erste update ist das Ergebnis nach dem Versand.
    ergebnisUpdateScheitert();
    const r = await aktion(undefined);
    expect(r.status).toBe(201);
    expect(r.body.meldung).toBe("1 Abteilung informiert: IT-Abteilung.");
    expect(r.body.hinweis).toBe(
      "Achtung: Die E-Mail an IT-Abteilung ist versendet, das Ergebnis konnte aber nicht gespeichert werden. Die Übersicht zeigt den Versand deshalb nicht – bitte nicht erneut senden.",
    );
    expect(mails("offboarding-department-assigned")).toHaveLength(1);
    expect(db.audits.map((a) => a.action)).toEqual(["DEPARTMENT_LINKS_SENT"]);
    expect(logFehler).toHaveBeenCalled();
  });

  it("erinnern: 201 mit Warnung; ohne gespeicherten Merker", async () => {
    // Ablauf weit genug hinten: kein Verlaengern vorher, das erste update ist das Ergebnis.
    db.links = [link({ expiresAt: tage(200) })];
    ergebnisUpdateScheitert();
    const r = await aktion({ aktion: "erinnern", departmentKey: "IT" });
    expect(r.status).toBe(201);
    expect(r.body.hinweis).toContain("bitte nicht erneut senden");
    expect(mails("offboarding-reminder")).toHaveLength(1);
    expect(linkVon("IT")).toMatchObject({ lastReminderAt: null, reminderCount: 0 });
  });

  it("scheitert die Mail UND das Speichern, bleibt es beim Fehler (nichts wurde versendet)", async () => {
    mailErgebnis = () => ({ status: "FAILED", detail: "SMTP" });
    ergebnisUpdateScheitert();
    await expect(aktion(undefined)).rejects.toThrow("Verbindung zur Datenbank verloren");
  });
});

// =============================================
// Taeglicher Lauf
// =============================================

describe("erinnerungenSenden (Cron)", () => {
  beforeEach(() => {
    db.aufgaben = [aufgabe({ assigneeDepartment: "IT", dueDate: tage(-4) })];
    db.links = [link()];
  });

  it("ESCALATION mit eigenen Merkern; SENT setzt Merker und Protokoll", async () => {
    const e = await erinnerungenSenden(JETZT);
    expect(e).toMatchObject({ remindersProcessed: 1, errors: 0, uebersprungen: [] });
    expect(e.details[0]).toMatchObject({ departmentKey: "IT", level: "ESCALATION", status: "SENT" });
    expect(mails("offboarding-reminder")[0]).toMatchObject({ ist_eskalation: "ja", ist_ueberfaellig: "ja", tage_ueberfaellig: "4" });
    expect(linkVon("IT")).toMatchObject({ lastReminderAt: JETZT, reminderCount: 1 });
    expect(db.audits[0]).toMatchObject({ action: "OFFBOARDING_REMINDER_SENT", userId: null });
  });

  it("FAILED setzt lastReminderAt nicht, SKIPPED setzt ihn", async () => {
    mailErgebnis = () => ({ status: "FAILED", detail: "SMTP" });
    await erinnerungenSenden(JETZT);
    expect(linkVon("IT").lastReminderAt).toBeNull();

    mailErgebnis = () => ({ status: "SKIPPED", detail: VORLAGE_DEAKTIVIERT_DETAIL });
    await erinnerungenSenden(JETZT);
    expect(linkVon("IT").lastReminderAt).toEqual(JETZT);
    expect(linkVon("IT").lastSendStatus).toBe("SKIPPED");
  });

  it("geaenderte Adresse: keine Mail, kein neuer Token, Vermerk am Link", async () => {
    db.konfigs = [konfig({ email: "it-neu@example.org" })];
    const e = await erinnerungenSenden(JETZT);
    expect(mockTrigger).not.toHaveBeenCalled();
    expect(e.uebersprungen).toEqual([
      expect.objectContaining({ departmentKey: "IT", grund: "ADRESSE_GEAENDERT", detail: "Adresse geändert, bitte Link erneuern" }),
    ]);
    expect(linkVon("IT")).toMatchObject({
      token: "tok-it",
      lastSendStatus: "SKIPPED",
      lastSendDetail: "Adresse geändert, bitte Link erneuern",
      lastReminderAt: null,
    });
  });

  it("deaktivierte Abteilung bekommt keine Erinnerung", async () => {
    db.konfigs = [konfig({ isActive: false })];
    const e = await erinnerungenSenden(JETZT);
    expect(mockTrigger).not.toHaveBeenCalled();
    expect(e.uebersprungen[0].grund).toBe("ABTEILUNG_INAKTIV");
  });

  it("nie informierte Links, fertige Abteilungen und abgeschlossene Vorgaenge bleiben still", async () => {
    db.links = [link({ sentAt: null })];
    expect((await erinnerungenSenden(JETZT)).details).toHaveLength(0);
    db.links = [link({ allTasksComplete: true })];
    expect((await erinnerungenSenden(JETZT)).details).toHaveLength(0);
    db.links = [link()];
    db.vorgaenge = [vorgang({ status: "COMPLETED" })];
    expect((await erinnerungenSenden(JETZT)).details).toHaveLength(0);
    expect(mockTrigger).not.toHaveBeenCalled();
  });

  it("die erste Erinnerung kommt nicht direkt nach der Erstmail", async () => {
    db.aufgaben = [aufgabe({ assigneeDepartment: "IT", dueDate: tage(2) })];
    db.links = [link({ sentAt: tage(-1) })];
    expect((await erinnerungenSenden(JETZT)).details).toHaveLength(0);
  });

  it("liest Link und Aufgaben erst unter der Sperre frisch — nicht den Stand vom Beginn des Laufs", async () => {
    // Zwischen der Kandidatenabfrage und der Verarbeitung waehlt HR "Link
    // erneuern": neuer Token, gerade eben zugestellt.
    const kandidaten = (fakePrisma.offboardingProcess as { findMany: jest.Mock }).findMany;
    const echt = kandidaten.getMockImplementation()!;
    kandidaten.mockImplementationOnce(async (arg: unknown) => {
      const r = await echt(arg);
      Object.assign(linkVon("IT"), { token: "tok-neu", lastSentAt: JETZT, lastSendStatus: "SENT" });
      return r;
    });
    const e = await erinnerungenSenden(JETZT);
    // Frisch gelesen: gerade zugestellt → heute keine Erinnerung (und nie mit "tok-it").
    expect(e.details).toHaveLength(0);
    expect(mockTrigger).not.toHaveBeenCalled();
  });

  it("laeuft fuer den Vorgang gerade eine HR-Aktion, bleibt er heute aus — und HR bekommt waehrend des Laufs 409", async () => {
    // 1. HR-Aktion haelt die Sperre, der Lauf ueberspringt den Vorgang.
    let freigeben: () => void = () => {};
    const warten = new Promise<void>((r) => (freigeben = r));
    mockTrigger.mockImplementationOnce(async (_e: string, p: Zeile) => {
      await warten;
      return { status: "SENT", recipient: String(p.email) };
    });
    db.links = [link({ lastSentAt: tage(-10) })];
    const hr = aktion({ aktion: "erneut-senden", departmentKey: "IT" });
    await new Promise((r) => setTimeout(r, 10));
    const info = jest.spyOn(console, "info").mockImplementation(() => {});
    const e = await erinnerungenSenden(JETZT);
    info.mockRestore();
    expect(e).toMatchObject({ remindersProcessed: 0, errors: 0, details: [] });
    freigeben();
    expect((await hr).status).toBe(201);
    expect(mails("offboarding-reminder")).toHaveLength(0);

    // 2. Der Lauf haelt die Sperre, "Erinnern" aus dem Portal bekommt 409.
    mockTrigger.mockClear();
    db.links = [link()];
    let laufFrei: () => void = () => {};
    const laufWarten = new Promise<void>((r) => (laufFrei = r));
    mockTrigger.mockImplementationOnce(async (_e: string, p: Zeile) => {
      await laufWarten;
      return { status: "SENT", recipient: String(p.email) };
    });
    const lauf = erinnerungenSenden(JETZT);
    await new Promise((r) => setTimeout(r, 10));
    expect(await aktion({ aktion: "erinnern", departmentKey: "IT" })).toEqual({
      status: 409,
      body: { error: MELDUNGEN.VERSAND_LAEUFT },
    });
    laufFrei();
    expect((await lauf).remindersProcessed).toBe(1);
    expect(mails("offboarding-reminder")).toHaveLength(1);
  });

  it("versendet, aber Merker nicht gespeichert: zaehlt als Fehler, der Lauf geht weiter", async () => {
    db.links = [link({ expiresAt: tage(200) })];
    const logFehler = jest.spyOn(console, "error").mockImplementation(() => {});
    (fakePrisma.offboardingDepartmentLink as { update: jest.Mock }).update.mockImplementationOnce(async () => {
      throw new Error("Verbindung zur Datenbank verloren");
    });
    const e = await erinnerungenSenden(JETZT);
    logFehler.mockRestore();
    expect(e).toMatchObject({ remindersProcessed: 1, errors: 1 });
    expect(e.details[0]).toMatchObject({ status: "SENT" });
  });
});

// =============================================
// Oeffentliche Seite
// =============================================

describe("oeffentlicheAufgabenLaden", () => {
  beforeEach(() => {
    db.aufgaben = [
      aufgabe({ id: "i-a", assigneeDepartment: "IT", notes: "HR-intern: Rücksprache", abteilungKommentar: "Konto gesperrt" }),
      aufgabe({ id: "i-b", assigneeDepartment: "FACILITY", isCompleted: true }),
    ];
    db.links = [link()];
  });

  it("liefert nur die eigenen Aufgaben, ohne interne Notiz und ohne Fremdfortschritt; zaehlt das Oeffnen", async () => {
    const r = await oeffentlicheAufgabenLaden("tok-it", JETZT);
    expect(r.status).toBe(200);
    const data = r.body.data as Record<string, unknown>;
    expect(data).toMatchObject({
      abteilung: { key: "IT", name: "IT-Abteilung" },
      vorgang: { vorgangsnummer: "OFF-2027-GYM-014", mitarbeiterName: "Max Mustermann", einrichtung: "FES Minden" },
      readOnly: false,
      fortschritt: { gesamt: 1, erledigt: 0, prozent: 0 },
    });
    const aufgaben = data.aufgaben as Zeile[];
    expect(aufgaben).toHaveLength(1);
    expect(aufgaben[0]).not.toHaveProperty("notes");
    expect(aufgaben[0]).not.toHaveProperty("completedById");
    expect(aufgaben[0]).toMatchObject({ abteilungKommentar: "Konto gesperrt" });
    expect(JSON.stringify(r.body)).not.toContain("HR-intern");
    expect(linkVon("IT")).toMatchObject({ openCount: 1, firstOpenedAt: JETZT, lastOpenedAt: JETZT });
  });

  it("COMPLETED: nur lesend; CANCELLED: 410; abgelaufen: 410; unbekannt: 404", async () => {
    db.vorgaenge = [vorgang({ status: "COMPLETED" })];
    expect(((await oeffentlicheAufgabenLaden("tok-it", JETZT)).body.data as Zeile).readOnly).toBe(true);
    db.vorgaenge = [vorgang({ status: "CANCELLED" })];
    expect(await oeffentlicheAufgabenLaden("tok-it", JETZT)).toEqual({
      status: 410,
      body: { error: MELDUNGEN.VORGANG_ABGEBROCHEN },
    });
    db.vorgaenge = [vorgang()];
    db.links = [link({ expiresAt: tage(-1) })];
    expect((await oeffentlicheAufgabenLaden("tok-it", JETZT)).status).toBe(410);
    expect((await oeffentlicheAufgabenLaden("gibt-es-nicht", JETZT)).status).toBe(404);
  });
});

describe("oeffentlicheAufgabeAendern", () => {
  beforeEach(() => {
    db.aufgaben = [
      aufgabe({ id: "i-1", assigneeDepartment: "IT", title: "Konto sperren", notes: "HR-intern" }),
      aufgabe({ id: "i-2", assigneeDepartment: "IT", title: "Postfach weiterleiten" }),
      aufgabe({ id: "i-9", assigneeDepartment: "FACILITY" }),
    ];
    db.links = [link()];
  });

  const aendern = (itemId: string, body: unknown, token = "tok-it") => oeffentlicheAufgabeAendern(token, itemId, body, JETZT);

  it("Kommentar landet in abteilungKommentar, die HR-Notiz bleibt; Protokoll nur mit Laenge", async () => {
    const r = await aendern("i-1", { comment: "Konto <b>gesperrt</b>" });
    expect(r.status).toBe(200);
    const a = db.aufgaben.find((x) => x.id === "i-1")!;
    expect(a).toMatchObject({ abteilungKommentar: "Konto <b>gesperrt</b>", abteilungKommentarAm: JETZT, notes: "HR-intern" });
    expect(db.audits).toEqual([
      expect.objectContaining({ action: "ABTEILUNGSAUFGABE_KOMMENTIERT", userId: null, details: expect.objectContaining({ laenge: 21 }) }),
    ]);
    expect(JSON.stringify(db.audits)).not.toContain("gesperrt");
    expect(mockTrigger).not.toHaveBeenCalled();
  });

  it("Wiederoeffnen mit comment null laesst den Kommentar stehen", async () => {
    db.aufgaben[0].isCompleted = true;
    db.aufgaben[0].abteilungKommentar = "erledigt";
    const r = await aendern("i-1", { isCompleted: false, comment: null });
    expect(r.status).toBe(200);
    expect(db.aufgaben[0]).toMatchObject({ isCompleted: false, abteilungKommentar: "erledigt" });
    expect(db.audits.map((x) => x.action)).toContain("ABTEILUNGSAUFGABE_WIEDER_GEOEFFNET");
  });

  it("kaputter Body und 1001 Zeichen: 400", async () => {
    expect(await aendern("i-1", undefined)).toEqual({ status: 400, body: { error: MELDUNGEN.UNGUELTIGE_EINGABE } });
    expect((await aendern("i-1", { comment: "x".repeat(1001) })).status).toBe(400);
  });

  it("zweimal 'erledigt' ergibt genau eine Mail an HR — mit maskiertem Kommentar", async () => {
    db.aufgaben[0].abteilungKommentar = "Zeile 1\n<script>";
    await aendern("i-1", { isCompleted: true });
    await aendern("i-1", { isCompleted: true });
    const erledigt = mails("offboarding-task-completed");
    expect(erledigt).toHaveLength(1);
    expect(erledigt[0]).toMatchObject({
      aufgabe: "Konto sperren",
      abteilung: "IT-Abteilung",
      erledigt_ueber: "Link der Abteilung",
      offene_aufgaben: 2,
      offene_aufgaben_abteilung: 1,
      kommentar: "Zeile 1<br>&lt;script&gt;",
      kommentar_text: "Zeile 1\n<script>",
    });
    expect(erledigt[0]).not.toHaveProperty("email");
    expect(db.aufgaben[0]).toMatchObject({ isCompleted: true, completedAt: JETZT, completedById: null });
    expect(db.audits.filter((a) => a.action === "ABTEILUNGSAUFGABE_ERLEDIGT")).toHaveLength(1);
  });

  it("die letzte Aufgabe loest 'Abteilung abgeschlossen' genau einmal aus; erst gesperrt, dann geaendert", async () => {
    db.aufgaben[1].isCompleted = true;
    const r = await aendern("i-1", { isCompleted: true });
    expect(r.body.data).toMatchObject({ allTasksComplete: true, fortschritt: { gesamt: 2, erledigt: 2, prozent: 100 } });
    expect(linkVon("IT")).toMatchObject({ allTasksComplete: true, completedAt: JETZT });
    const fertig = mails("offboarding-department-completed");
    expect(fertig).toHaveLength(1);
    expect(fertig[0]).toMatchObject({
      email: "it@example.org",
      abteilung: "IT-Abteilung",
      anzahl_aufgaben: 2,
      ist_fuehrungskraft: "",
    });
    expect(db.audits.map((a) => a.action)).toContain("DEPARTMENT_TASKS_COMPLETED");

    const linkSperre = (fakePrisma.offboardingDepartmentLink as { updateMany: jest.Mock }).updateMany.mock
      .invocationCallOrder[0];
    const aufgabeUpdate = (fakePrisma.offboardingChecklistItem as { updateMany: jest.Mock }).updateMany.mock
      .invocationCallOrder[0];
    expect(linkSperre).toBeLessThan(aufgabeUpdate);

    // Ein spaeter PATCH (die andere Seite des Rennens) findet die Abteilung schon fertig.
    await aendern("i-2", { isCompleted: true });
    expect(mails("offboarding-department-completed")).toHaveLength(1);
  });

  it("Aufgaben der Führungskraft: 'Link der Führungskraft' an HR, Bestätigung mit ist_fuehrungskraft", async () => {
    db.aufgaben = [aufgabe({ id: "i-f", assigneeDepartment: "VORGESETZTER", title: "Übergabe" })];
    db.links = [
      link({ departmentKey: "VORGESETZTER", departmentName: "Führungskraft", email: "chef@example.org", token: "tok-fk" }),
    ];
    await aendern("i-f", { isCompleted: true }, "tok-fk");
    expect(mails("offboarding-task-completed")[0]).toMatchObject({ erledigt_ueber: "Link der Führungskraft" });
    expect(mails("offboarding-department-completed")[0]).toMatchObject({
      email: "chef@example.org",
      ist_fuehrungskraft: "ja",
    });
  });

  it("Wiederoeffnen macht die Abteilung wieder offen", async () => {
    db.aufgaben[0].isCompleted = true;
    db.aufgaben[1].isCompleted = true;
    db.links = [link({ allTasksComplete: true, completedAt: tage(-1) })];
    await aendern("i-2", { isCompleted: false });
    expect(linkVon("IT")).toMatchObject({ allTasksComplete: false, completedAt: null });
    expect(db.audits.map((a) => a.action)).toContain("DEPARTMENT_TASKS_REOPENED");
  });

  it("hat HR die Aufgabe waehrend des Wartens auf die Sperre umgehaengt: 404, nichts geaendert", async () => {
    const sperre = (fakePrisma.offboardingDepartmentLink as { updateMany: jest.Mock }).updateMany;
    sperre.mockImplementationOnce(async () => {
      // Der Portal-PATCH committet, waehrend dieser Aufruf an der Sperre wartet.
      db.aufgaben[0].assigneeDepartment = "FACILITY";
      return { count: 1 };
    });
    const r = await aendern("i-1", { isCompleted: true, comment: "erledigt" });
    expect(r).toEqual({ status: 404, body: { error: MELDUNGEN.AUFGABE_NICHT_GEFUNDEN } });
    expect(db.aufgaben[0]).toMatchObject({ isCompleted: false, abteilungKommentar: null });
    expect(db.audits).toHaveLength(0);
    expect(mockTrigger).not.toHaveBeenCalled();
  });

  it("scheitert nach dem Commit das Zaehlen fuer die Mail, bleibt die Antwort 200", async () => {
    const zaehlen = (fakePrisma.offboardingChecklistItem as { count: jest.Mock }).count;
    const fehlerNachCommit = jest.spyOn(console, "error").mockImplementation(() => {});
    // Erster count-Aufruf nach dem Commit ist offeneImVorgang (fuer die Mail an HR).
    const echt = zaehlen.getMockImplementation()!;
    let aufrufe = 0;
    zaehlen.mockImplementation(async (arg: { where: Zeile }) => {
      aufrufe++;
      // Die ersten beiden zaehlen in der Transaktion (gesamt, offen), der dritte ist nach dem Commit.
      if (aufrufe === 3) throw new Error("Verbindung weg");
      return echt(arg);
    });
    try {
      const r = await aendern("i-1", { isCompleted: true });
      expect(r.status).toBe(200);
      expect(db.aufgaben[0].isCompleted).toBe(true);
      expect(fehlerNachCommit).toHaveBeenCalled();
    } finally {
      zaehlen.mockImplementation(echt);
      fehlerNachCommit.mockRestore();
    }
  });

  it("COMPLETED: 409, CANCELLED: 410, fremde Aufgabe: 404", async () => {
    db.vorgaenge = [vorgang({ status: "COMPLETED" })];
    expect(await aendern("i-1", { isCompleted: true })).toEqual({
      status: 409,
      body: { error: MELDUNGEN.VORGANG_ABGESCHLOSSEN_NUR_LESEN },
    });
    db.vorgaenge = [vorgang({ status: "CANCELLED" })];
    expect((await aendern("i-1", { isCompleted: true })).status).toBe(410);
    db.vorgaenge = [vorgang()];
    expect(await aendern("i-9", { isCompleted: true })).toEqual({
      status: 404,
      body: { error: MELDUNGEN.AUFGABE_NICHT_GEFUNDEN },
    });
    expect(mockTrigger).not.toHaveBeenCalled();
  });
});

// =============================================
// Portal (M9)
// =============================================

describe("aufgabeImPortalAendern", () => {
  const aendern = (itemId: string, body: unknown, session: SessionPayload = HR) =>
    aufgabeImPortalAendern({ offboardingId: "off-1", itemId, rohBody: body, session, jetzt: JETZT });

  beforeEach(() => {
    db.aufgaben = [
      aufgabe({ id: "x", assigneeDepartment: "IT", title: "Laptop" }),
      aufgabe({ id: "y", assigneeDepartment: "IT", isCompleted: true }),
      aufgabe({ id: "f", assigneeDepartment: "FACILITY", isCompleted: true }),
      aufgabe({ id: "h", assigneeDepartment: "HR", title: "Zeugnis" }),
    ];
    db.links = [
      link(),
      link({ departmentKey: "FACILITY", departmentName: "Facility Management", email: "fm@example.org", token: "tok-fm", allTasksComplete: true, completedAt: tage(-2) }),
    ];
    db.konfigs.push(konfig({ departmentKey: "FACILITY", email: "fm@example.org" }));
  });

  it("Umhaengen von IT nach FACILITY berechnet beide Links neu — ohne Bestaetigung an die Abteilung", async () => {
    const r = await aendern("x", { assigneeDepartment: "FACILITY" });
    expect(r.status).toBe(200);
    expect(linkVon("IT")).toMatchObject({ allTasksComplete: true, completedAt: JETZT });
    expect(linkVon("FACILITY")).toMatchObject({ allTasksComplete: false, completedAt: null });
    expect(mockTrigger).not.toHaveBeenCalled();
    expect(db.audits).toContainEqual(
      expect.objectContaining({
        action: "CHECKLIST_ITEM_UPDATED",
        details: expect.objectContaining({ assigneeDepartment: { von: "IT", nach: "FACILITY" } }),
      }),
    );
  });

  it("unbekannter Schluessel: 400; fremder Mandant: 404; Rolle ausserhalb CHECKLIST_ROLES: 403", async () => {
    expect((await aendern("x", { assigneeDepartment: "EMPFANG" })).status).toBe(400);
    const fremd = await aendern("x", { isCompleted: true }, { ...HR, role: "EINRICHTUNGSLEITUNG" });
    expect(fremd).toEqual({ status: 404, body: { error: MELDUNGEN.VORGANG_NICHT_GEFUNDEN } });
    db.zuweisungen = [{ userId: "u-hr", organizationId: "org-1" }];
    expect((await aendern("h", { notes: "zugewiesen" }, { ...HR, role: "EINRICHTUNGSLEITUNG" })).status).toBe(200);
    expect((await aendern("x", { isCompleted: true }, { ...HR, role: "BEM_BEAUFTRAGTER" })).status).toBe(403);
    expect((await aendern("gibt-es-nicht", { isCompleted: true })).status).toBe(404);
  });

  it("eigener Schluessel aus den Einstellungen ist bekannt", async () => {
    db.konfigs.push(konfig({ departmentKey: "EMPFANG" }));
    expect((await aendern("x", { assigneeDepartment: "EMPFANG" })).status).toBe(200);
  });

  it("HR hakt eine HR-Aufgabe ab: keine Mail; eine IT-Aufgabe: Mail 'erledigt über Portal'", async () => {
    await aendern("h", { isCompleted: true });
    expect(mockTrigger).not.toHaveBeenCalled();

    const r = await aendern("x", { isCompleted: true });
    expect(r.status).toBe(200);
    expect((r.body.item as Zeile).erledigtVon).toEqual({ art: "PORTAL", name: "Erika Sachbearbeiter" });
    expect(r.body.progress).toEqual({ total: 4, completed: 4, allCompleted: true });
    expect(mails("offboarding-task-completed")[0]).toMatchObject({
      erledigt_ueber: "Portal",
      taskId: "x",
      taskTitle: "Laptop",
      completedById: "u-hr",
      abteilung: "IT-Abteilung",
    });
    expect(mails("offboarding-department-completed")).toHaveLength(0);
    expect(linkVon("IT").allTasksComplete).toBe(true);
    expect(db.aufgaben.find((a) => a.id === "x")).toMatchObject({ completedById: "u-hr" });
  });

  it("abgebrochener Vorgang: Status aendern 409, Notiz geht", async () => {
    db.vorgaenge = [vorgang({ status: "CANCELLED" })];
    expect((await aendern("x", { isCompleted: true })).status).toBe(409);
    expect((await aendern("x", { notes: "Nachtrag" })).status).toBe(200);
    expect(db.aufgaben.find((a) => a.id === "x")!.notes).toBe("Nachtrag");
  });
});

// =============================================
// Fristen, Uebersicht, Fuehrungskraft
// =============================================

describe("faelligkeitenVerschieben", () => {
  it("verschiebt nur offene Aufgaben und verlaengert betroffene Links", async () => {
    db.aufgaben = [
      aufgabe({ id: "o", dueDate: new Date("2027-07-29T00:00:00Z") }),
      aufgabe({ id: "e", isCompleted: true, dueDate: new Date("2027-07-29T00:00:00Z") }),
      aufgabe({ id: "n", dueDate: null }),
    ];
    db.links = [link({ expiresAt: tage(10) })];
    const f = await faelligkeitenVerschieben(
      fakePrisma as unknown as Prisma.TransactionClient,
      "off-1",
      new Date("2027-07-31T00:00:00Z"),
      new Date("2027-12-31T00:00:00Z"),
      JETZT,
    );
    expect(f).toEqual({ verschoben: 1, verlaengert: 1 });
    expect((db.aufgaben[0].dueDate as Date).toISOString()).toBe("2027-12-29T00:00:00.000Z");
    expect((db.aufgaben[1].dueDate as Date).toISOString()).toBe("2027-07-29T00:00:00.000Z");
    expect((linkVon("IT").expiresAt as Date).toISOString()).toBe("2028-01-28T00:00:00.000Z");

    // Sperr-Reihenfolge wie beim Abhaken: erst die Links, dann die Aufgaben.
    const linkSperre = (fakePrisma.offboardingDepartmentLink as { updateMany: jest.Mock }).updateMany.mock
      .invocationCallOrder[0];
    const aufgabeUpdate = (fakePrisma.offboardingChecklistItem as { update: jest.Mock }).update.mock
      .invocationCallOrder[0];
    expect(linkSperre).toBeLessThan(aufgabeUpdate);
  });

  it("ungueltiges Datum: Fehler statt 'Invalid Date' in den Faelligkeiten", async () => {
    db.aufgaben = [aufgabe({ id: "o" })];
    await expect(
      faelligkeitenVerschieben(
        fakePrisma as unknown as Prisma.TransactionClient,
        "off-1",
        new Date("2027-07-31T00:00:00Z"),
        new Date("kein Datum"),
        JETZT,
      ),
    ).rejects.toThrow("ungueltiges Datum");
    expect((db.aufgaben[0].dueDate as Date).toISOString()).toBe("2027-07-31T00:00:00.000Z");
  });

  it("gleicher Tag: nichts zu tun", async () => {
    const d = new Date("2027-07-31T00:00:00Z");
    expect(await faelligkeitenVerschieben(fakePrisma as unknown as Prisma.TransactionClient, "off-1", d, d, JETZT)).toEqual({
      verschoben: 0,
      verlaengert: 0,
    });
  });

  it.each(["COMPLETED", "CANCELLED"])(
    "%s: Faelligkeiten ruecken mit, der Link wird aber NICHT verlaengert",
    async (status) => {
      db.vorgaenge = [vorgang({ status })];
      db.aufgaben = [aufgabe({ id: "o", dueDate: new Date("2027-07-29T00:00:00Z") })];
      db.links = [link({ expiresAt: tage(10) })];
      const f = await faelligkeitenVerschieben(
        fakePrisma as unknown as Prisma.TransactionClient,
        "off-1",
        new Date("2027-07-31T00:00:00Z"),
        new Date("2027-12-31T00:00:00Z"),
        JETZT,
      );
      expect(f).toEqual({ verschoben: 1, verlaengert: 0 });
      expect((db.aufgaben[0].dueDate as Date).toISOString()).toBe("2027-12-29T00:00:00.000Z");
      expect(linkVon("IT").expiresAt).toEqual(tage(10));
    },
  );
});

describe("letztenArbeitstagSperren", () => {
  it("sperrt die Zeile (UPDATE) und liest DANACH den gespeicherten Tag", async () => {
    const tx = fakePrisma as unknown as Prisma.TransactionClient;
    const vorgaenge = fakePrisma.offboardingProcess as { updateMany: jest.Mock; findUnique: jest.Mock };
    // Ein anderer PATCH hat den Tag schon geaendert, waehrend dieser an der Sperre wartete.
    vorgaenge.updateMany.mockImplementationOnce(async () => {
      db.vorgaenge[0].lastWorkingDay = new Date("2027-08-30T00:00:00.000Z");
      return { count: 1 };
    });
    expect(await letztenArbeitstagSperren(tx, "off-1")).toEqual(new Date("2027-08-30T00:00:00.000Z"));
    expect(vorgaenge.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      vorgaenge.findUnique.mock.invocationCallOrder[0],
    );
    expect(await letztenArbeitstagSperren(tx, "off-x")).toBeNull();
  });
});

describe("abteilungsUebersichtLaden", () => {
  it("liefert URL vom Server, Anzeige, Urheber und Führungskraft mit Quelle", async () => {
    db.users = [{ id: "u-7", firstName: "Erika", lastName: "Sachbearbeiter" }];
    const l = link();
    const u = await abteilungsUebersichtLaden(
      {
        id: "off-1",
        organizationId: "org-1",
        status: "HANDOVER_PHASE",
        lastWorkingDay: new Date("2027-07-31T00:00:00Z"),
        supervisorEmail: null,
        supervisorName: null,
        zeugnisBewertung: { supervisorEmail: "leitung@example.org", supervisorName: "Anna Leitung" },
        contractEnd: null,
        checklistItems: [
          { id: "a", assigneeDepartment: "IT", isCompleted: true, dueDate: null, completedById: null },
          { id: "b", assigneeDepartment: "HR", isCompleted: true, dueDate: null, completedById: "u-7" },
          { id: "c", assigneeDepartment: "VORGESETZTER", isCompleted: false, dueDate: null, completedById: null },
        ],
        departmentLinks: [l as never],
      },
      JETZT,
    );
    expect(u.departmentLinks[0]).toMatchObject({ url: `${BASIS}/offboarding-tasks/tok-it`, anzeige: { status: "INFORMIERT" } });
    expect(u.checklistItems.map((i) => i.erledigtVon)).toEqual([
      { art: "LINK", name: "IT-Abteilung" },
      { art: "PORTAL", name: "Erika Sachbearbeiter" },
      null,
    ]);
    expect(u.fuehrungskraft).toEqual({ email: "leitung@example.org", name: "Anna Leitung", quelle: "ZEUGNIS" });
    expect(u.abteilungen.zeilen.map((z) => z.departmentKey)).toEqual(["IT", "VORGESETZTER"]);
    expect(u.abteilungen).toMatchObject({ informierbar: 1, niemandInformiert: false, vorgangAbgeschlossen: false });
    expect(u.abteilungen.zeilen[1]).toMatchObject({ fuehrungskraftName: "Anna Leitung", email: "leitung@example.org" });
  });
});

describe("Führungskraft", () => {
  it("Vorgang vor Zeugnis-Bewertung vor Vertragsende", () => {
    expect(
      fuehrungskraftErmitteln({
        supervisorEmail: " ",
        zeugnisBewertung: null,
        contractEnd: { supervisorEmail: "ve@example.org" },
      }),
    ).toEqual({ email: "ve@example.org", name: null, quelle: "VERTRAGSENDE" });
    expect(fuehrungskraftErmitteln({})).toEqual({ email: null, name: null, quelle: null });
  });

  it("Freigabeliste: leer = frei, sonst Domain pruefen; bekannte Adressen sind immer erlaubt", async () => {
    expect(await fuehrungskraftAdresseFreigegeben("wer@freemail.example")).toBe(true);
    db.domains = "fes-minden.de";
    expect(await fuehrungskraftAdresseFreigegeben("wer@freemail.example")).toBe(false);
    expect(await fuehrungskraftAdresseFreigegeben("leitung@fes-minden.de")).toBe(true);
    expect(await fuehrungskraftAdresseFreigegeben("Wer@Freemail.example", ["wer@freemail.example"])).toBe(true);
  });
});
