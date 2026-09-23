/**
 * Tests: Abteilungsaufgaben im Onboarding — Datenbankteil (Paket 5)
 * (src/lib/abteilungsaufgaben-onboarding.ts und die Onboarding-Wege in
 * src/lib/abteilungsaufgaben-uebergaenge.ts)
 *
 * Wie in Paket 1b laeuft hier die kleine In-Memory-Datenbank
 * (src/__tests__/hilfen/abteilungs-fake-db.ts) statt einzelner Prisma-Mocks.
 * Geprueft werden Zustaende (Faelligkeit gesetzt, Token unveraendert, kein
 * zweiter Versand) und die Payloads der Mails — besonders die
 * Datensparsamkeit: Was die Abteilung nicht sehen darf, steht auch nicht im
 * Payload.
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
  faelligkeitenSetzen,
  onboardingAbteilungenLaden,
  onboardingAbteilungsAktionAusfuehren,
  onboardingAbteilungsUebersichtLaden,
  onboardingErinnerungenSenden,
} from "@/lib/abteilungsaufgaben-onboarding";
import {
  oeffentlicheAufgabenLaden,
  oeffentlicheOnboardingAufgabeAendern,
  oeffentlicheOnboardingAufgabenLaden,
  onboardingAufgabeImPortalAendern,
} from "@/lib/abteilungsaufgaben-uebergaenge";
import { MELDUNGEN } from "@/lib/abteilungsaufgaben";
import type { SessionPayload } from "@/lib/permissions";
import type { Prisma } from "@prisma/client";

// =============================================
// Testdaten
// =============================================

const BASIS = "https://hr.example.org";
const TAG = 86_400_000;
const JETZT = new Date("2026-09-22T08:00:00.000Z");
const BEGINN = new Date("2026-10-01T00:00:00.000Z");
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
    id: "onb-1",
    displayId: "ONB-2026-031",
    organizationId: "org-1",
    status: "SUPERVISOR_SUBMITTED",
    firstName: "Anna",
    lastName: "Beispiel",
    email: "anna.privat@example.org",
    supervisorEmail: "a.leitung@example.org",
    supervisorSubmittedAt: tage(-2),
    personalData: { firstName: "Anna", lastName: "Beispiel" },
    supervisorData: {
      isComplete: true,
      vertragsbeginn: BEGINN,
      stellenbeschreibung: "Lehrkraft Sek. I",
      betriebsstaette: "Minden, Hauptstandort",
    },
    organization: { name: "FES Minden", mandantNumber: "01" },
    ...teil,
  };
}

function aufgabe(teil: Zeile): Zeile {
  return {
    id: `i-${naechsteId()}`,
    onboardingId: "onb-1",
    templateItemId: null,
    title: "Aufgabe",
    category: "Vor Arbeitsbeginn",
    orderIndex: naechsteId(),
    description: null,
    assignee: "IT",
    relativeDueDays: null,
    isCompleted: false,
    completedAt: null,
    completedById: null,
    dueDate: null,
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
    onboardingId: "onb-1",
    departmentKey: "IT",
    departmentName: "IT-Abteilung",
    email: "it@example.org",
    token: "tok-it",
    expiresAt: tage(60),
    sentAt: tage(-5),
    lastSentAt: tage(-5),
    lastSendStatus: "SENT",
    ...teil,
  });
}

function aktion(rohBody: unknown, session: SessionPayload = HR, jetzt = JETZT) {
  return onboardingAbteilungsAktionAusfuehren({ onboardingId: "onb-1", rohBody, session, jetzt });
}

function mails(event: string): Zeile[] {
  return mockTrigger.mock.calls.filter((c) => c[0] === event).map((c) => c[1]);
}

function linkVon(key: string): Zeile {
  const l = db.links.find((x) => x.departmentKey === key);
  if (!l) throw new Error(`kein Link fuer ${key}`);
  return l;
}

/** Uebersicht wie GET /api/onboarding/[id] sie baut. */
async function uebersicht(jetzt = JETZT) {
  const v = db.onboardingVorgaenge[0];
  return onboardingAbteilungsUebersichtLaden(
    {
      id: v.id as string,
      organizationId: v.organizationId as string,
      status: v.status as string,
      supervisorEmail: v.supervisorEmail as string | null,
      supervisorSubmittedAt: v.supervisorSubmittedAt as Date | null,
      supervisorData: v.supervisorData as { isComplete?: boolean; vertragsbeginn?: Date | null } | null,
      checklistItems: db.onboardingAufgaben.map((a) => ({
        id: a.id as string,
        title: a.title as string,
        description: a.description as string | null,
        assignee: a.assignee as string | null,
        isCompleted: a.isCompleted as boolean,
        dueDate: a.dueDate as Date | null,
        relativeDueDays: a.relativeDueDays as number | null,
        completedById: a.completedById as string | null,
      })),
      departmentLinks: db.links as never[],
    },
    jetzt,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.NEXT_PUBLIC_APP_URL = BASIS;
  dbLeeren();
  db.onboardingVorgaenge = [vorgang()];
  db.konfigs = [konfig()];
  mailErgebnis = (_e, p) => ({ status: "SENT", recipient: String(p.email ?? "hr@example.org") });
});

// =============================================
// Voraussetzung und Rechte
// =============================================

describe("Voraussetzung: eingereichte Modalitaeten", () => {
  beforeEach(() => {
    db.onboardingAufgaben = [aufgabe({ title: "Konto anlegen", relativeDueDays: -7 })];
  });

  it("nur zwischengespeicherter Vertragsbeginn: 409, kein Versand, keine Faelligkeit", async () => {
    db.onboardingVorgaenge = [vorgang({ status: "IN_PROGRESS", supervisorSubmittedAt: null, supervisorData: { isComplete: false, vertragsbeginn: BEGINN } })];
    const r = await aktion(undefined);
    expect(r.status).toBe(409);
    expect(r.body).toEqual({ error: MELDUNGEN.MODALITAETEN_FEHLEN, grund: "MODALITAETEN_FEHLEN" });
    expect(mockTrigger).not.toHaveBeenCalled();
    expect(db.onboardingAufgaben[0].dueDate).toBeNull();
  });

  it("eingereicht ohne Vertragsbeginn: 409 mit eigenem Grund", async () => {
    db.onboardingVorgaenge = [vorgang({ supervisorData: { isComplete: true, vertragsbeginn: null } })];
    const r = await aktion(undefined);
    expect(r.status).toBe(409);
    expect(r.body).toEqual({ error: MELDUNGEN.VERTRAGSBEGINN_FEHLT, grund: "VERTRAGSBEGINN_FEHLT" });
  });

  it("abgeschlossen und abgelaufen: 409 mit eigenem Text", async () => {
    db.onboardingVorgaenge = [vorgang({ status: "COMPLETED" })];
    expect((await aktion(undefined)).body).toEqual({
      error: MELDUNGEN.HR_VORGANG_ABGESCHLOSSEN,
      grund: "VORGANG_ABGESCHLOSSEN",
    });
    db.onboardingVorgaenge = [vorgang({ status: "EXPIRED" })];
    expect((await aktion(undefined)).body).toEqual({
      error: MELDUNGEN.HR_VORGANG_ABGELAUFEN,
      grund: "VORGANG_ABGESCHLOSSEN",
    });
  });

  it("Rolle ohne Bearbeitungsrecht 403; unbekannter oder fremder Vorgang 404 mit gleichem Text", async () => {
    expect((await aktion(undefined, { ...HR, role: "VORGESETZTER" })).status).toBe(403);
    const fremd = await onboardingAbteilungsAktionAusfuehren({
      onboardingId: "gibt-es-nicht",
      rohBody: undefined,
      session: HR,
      jetzt: JETZT,
    });
    expect(fremd).toEqual({ status: 404, body: { error: MELDUNGEN.ONBOARDING_VORGANG_NICHT_GEFUNDEN } });
    // Mandantenbeschraenkte Rollen scheitern hier schon an HR_EDIT_ROLES (403);
    // die Mandantenpruefung mit 404 zeigt der Lese-Weg unten (GET /abteilungen).
  });
});

// =============================================
// Faelligkeiten
// =============================================

describe("faelligkeitenSetzen", () => {
  it("Vertragsbeginn + Tage, nur einmal, ohne Tagesangabe ohne Frist, Handwert bleibt", async () => {
    db.onboardingAufgaben = [
      aufgabe({ id: "i-1", relativeDueDays: -7 }),
      aufgabe({ id: "i-2", relativeDueDays: 0 }),
      aufgabe({ id: "i-3", relativeDueDays: null }),
      aufgabe({ id: "i-4", relativeDueDays: 5, dueDate: new Date("2026-12-24T00:00:00.000Z") }),
    ];
    const r = await faelligkeitenSetzen(fakePrisma as unknown as Prisma.TransactionClient, "onb-1", { userId: "u-hr" });
    expect(r.gesetzt).toBe(2);
    expect((db.onboardingAufgaben[0].dueDate as Date).toISOString()).toBe("2026-09-24T00:00:00.000Z");
    expect((db.onboardingAufgaben[1].dueDate as Date).toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(db.onboardingAufgaben[2].dueDate).toBeNull();
    expect((db.onboardingAufgaben[3].dueDate as Date).toISOString()).toBe("2026-12-24T00:00:00.000Z");
    expect(db.audits).toEqual([
      expect.objectContaining({
        action: "CHECKLIST_DUE_DATES_SET",
        onboardingId: "onb-1",
        processType: "ONBOARDING",
        details: { gesetzt: 2, vertragsbeginn: BEGINN.toISOString() },
      }),
    ]);

    // Zweiter Lauf: nichts mehr zu tun, kein zweiter Protokolleintrag.
    const zweiter = await faelligkeitenSetzen(fakePrisma as unknown as Prisma.TransactionClient, "onb-1");
    expect(zweiter.gesetzt).toBe(0);
    expect(db.audits).toHaveLength(1);
  });

  it("ohne eingereichte Modalitaeten passiert nichts", async () => {
    db.onboardingVorgaenge = [vorgang({ supervisorSubmittedAt: null, supervisorData: { isComplete: false, vertragsbeginn: BEGINN } })];
    db.onboardingAufgaben = [aufgabe({ relativeDueDays: -7 })];
    const r = await faelligkeitenSetzen(fakePrisma as unknown as Prisma.TransactionClient, "onb-1");
    expect(r).toEqual({ gesetzt: 0, vertragsbeginn: null });
    expect(db.onboardingAufgaben[0].dueDate).toBeNull();
    expect(db.audits).toHaveLength(0);
  });

  // Befund der Durchsicht: Frueher hing die Einmaligkeit allein an
  // `dueDate: null`. Loeschte HR eine Frist von Hand, fand der naechste Lauf
  // die Zeile wieder (relativeDueDays stand ja noch da) und schrieb die Frist
  // zurueck — samt Ueberfaelligkeit und Erinnerungsmail an die Abteilung.
  it("eine von Hand ENTFERNTE Frist kommt nicht zurueck", async () => {
    db.onboardingAufgaben = [aufgabe({ id: "i-1", assignee: "IT", relativeDueDays: -7 })];
    db.links = [link()];
    db.users = [{ id: "u-hr", firstName: "Erika", lastName: "Sachbearbeiter" }];

    await faelligkeitenSetzen(fakePrisma as unknown as Prisma.TransactionClient, "onb-1");
    expect((db.onboardingAufgaben[0].dueDate as Date).toISOString()).toBe("2026-09-24T00:00:00.000Z");

    const r = await onboardingAufgabeImPortalAendern({
      onboardingId: "onb-1",
      itemId: "i-1",
      rohBody: { dueDate: null },
      session: HR,
      jetzt: JETZT,
    });
    expect(r.status).toBe(200);
    expect(db.onboardingAufgaben[0].dueDate).toBeNull();
    // Die Tagesangabe faellt mit weg — das ist der eigentliche Riegel.
    expect(db.onboardingAufgaben[0].relativeDueDays).toBeNull();

    const nachher = await faelligkeitenSetzen(fakePrisma as unknown as Prisma.TransactionClient, "onb-1");
    expect(nachher.gesetzt).toBe(0);
    expect(db.onboardingAufgaben[0].dueDate).toBeNull();
  });

  it("eine von Hand GESETZTE Frist laesst die Tagesangabe stehen", async () => {
    db.onboardingAufgaben = [aufgabe({ id: "i-1", assignee: "IT", relativeDueDays: -7 })];
    db.links = [link()];
    const r = await onboardingAufgabeImPortalAendern({
      onboardingId: "onb-1",
      itemId: "i-1",
      rohBody: { dueDate: "2026-09-30" },
      session: HR,
      jetzt: JETZT,
    });
    expect(r.status).toBe(200);
    expect((db.onboardingAufgaben[0].dueDate as Date).toISOString()).toBe("2026-09-30T00:00:00.000Z");
    expect(db.onboardingAufgaben[0].relativeDueDays).toBe(-7);
  });
});

// =============================================
// Abteilungen informieren
// =============================================

describe("informieren", () => {
  beforeEach(() => {
    db.onboardingAufgaben = [
      aufgabe({ title: "Konto anlegen", assignee: "IT", relativeDueDays: -7, description: "M365" }),
      aufgabe({ title: "Einarbeitungsplan", assignee: "VORGESETZTER", relativeDueDays: 5 }),
      aufgabe({ title: "Vertrag", assignee: "HR", relativeDueDays: -14 }),
      aufgabe({ title: "Gehalt", assignee: "BUCHHALTUNG", relativeDueDays: 0 }),
    ];
  });

  it("setzt die Faelligkeiten, schreibt IT und Führungskraft an und ueberspringt HR sowie Buchhaltung", async () => {
    const r = await aktion(undefined);
    expect(r.status).toBe(201);
    expect(r.body.meldung).toBe("2 Abteilungen informiert: IT-Abteilung, Führungskraft.");
    expect(r.body.hinweis).toBe("Nicht informiert: Buchhaltung (keine aktive Adresse hinterlegt (Einstellungen → Abteilungen)).");

    expect((db.onboardingAufgaben[0].dueDate as Date).toISOString()).toBe("2026-09-24T00:00:00.000Z");
    const it = linkVon("IT");
    expect(it).toMatchObject({ onboardingId: "onb-1", offboardingId: null, sentAt: JETZT, lastSendStatus: "SENT" });
    const fk = linkVon("VORGESETZTER");
    expect(fk.email).toBe("a.leitung@example.org");
    expect(fk.departmentName).toBe("Führungskraft");

    const [payload] = mails("onboarding-department-assigned").filter((p) => p.departmentKey === "IT");
    expect(payload).toMatchObject({
      onboardingId: "onb-1",
      displayId: "ONB-2026-031",
      mitarbeiter_name: "Anna Beispiel",
      einrichtung: "FES Minden",
      vertragsbeginn: "01.10.2026",
      abteilung: "IT-Abteilung",
      email: "it@example.org",
      taskCount: 1,
      anzahl_aufgaben: 1,
      aufgabenliste: "- Konto anlegen – fällig 24.09.2026\n  M365",
      naechste_faelligkeit: "24.09.2026",
      erneut_gesendet: "",
      neuer_link: "",
      ist_fuehrungskraft: "",
      magicLink: `${BASIS}/onboarding-tasks/${it.token}`,
      link: `${BASIS}/onboarding-tasks/${it.token}`,
    });
    expect(db.audits).toContainEqual(
      expect.objectContaining({ action: "DEPARTMENT_LINKS_SENT", onboardingId: "onb-1", processType: "ONBOARDING" }),
    );
  });

  it("Datensparsamkeit: nur erlaubte Felder je Schluessel, nie die private Adresse", async () => {
    await aktion(undefined);
    const [it] = mails("onboarding-department-assigned").filter((p) => p.departmentKey === "IT");
    const [fk] = mails("onboarding-department-assigned").filter((p) => p.departmentKey === "VORGESETZTER");

    expect(it.stellenbezeichnung).toBe("Lehrkraft Sek. I");
    expect(it.betriebsstaette).toBe("Minden, Hauptstandort");
    expect(it.ansprechpartner_email).toBe("a.leitung@example.org");
    expect(fk.stellenbezeichnung).toBe("Lehrkraft Sek. I");
    expect(fk.betriebsstaette).toBe("Minden, Hauptstandort");
    expect(fk).not.toHaveProperty("ansprechpartner_email");
    expect(fk.ist_fuehrungskraft).toBe("ja");

    // Positivliste: nichts im Payload ausser diesen Schluesseln.
    const erlaubt = new Set([
      "onboardingId", "displayId", "vorname", "nachname", "mitarbeiter_name", "employeeName",
      "organization", "organizationName", "einrichtung", "mandantNumber", "contractStartDate", "vertragsbeginn",
      "departmentKey", "departmentName", "abteilung", "email", "expiresAt", "taskCount", "magicLink", "link",
      "aufgabenliste", "aufgabenliste_html", "anzahl_aufgaben", "naechste_faelligkeit",
      "erneut_gesendet", "neuer_link", "ist_fuehrungskraft",
      "stellenbezeichnung", "betriebsstaette", "ansprechpartner_email",
    ]);
    for (const p of mails("onboarding-department-assigned")) {
      expect(Object.keys(p).filter((k) => !erlaubt.has(k))).toEqual([]);
      expect(JSON.stringify(p)).not.toContain("anna.privat@example.org");
      // Kein Token im Payload (anders als im Offboarding) — der Link genuegt.
      expect(p).not.toHaveProperty("token");
    }
  });

  it("der zweite Klick informiert nur neue Abteilungen und behaelt den Token", async () => {
    await aktion(undefined);
    const tokenVorher = linkVon("IT").token;
    mockTrigger.mockClear();

    db.onboardingAufgaben.push(aufgabe({ title: "Datenschutz", assignee: "DSB", relativeDueDays: 7 }));
    db.konfigs.push(konfig({ departmentKey: "DSB", departmentName: "Datenschutz", email: "dsb@example.org" }));

    const r = await aktion({ aktion: "informieren" });
    expect(r.status).toBe(201);
    expect(mails("onboarding-department-assigned").map((p) => p.departmentKey)).toEqual(["DSB"]);
    expect(linkVon("IT").token).toBe(tokenVorher);
    const [dsb] = mails("onboarding-department-assigned");
    expect(dsb.stellenbezeichnung).toBe("Lehrkraft Sek. I");
    expect(dsb).not.toHaveProperty("betriebsstaette");
  });

  it("zwei gleichzeitige Aufrufe: einer sendet, einer bekommt 409", async () => {
    const [a, b] = await Promise.all([aktion(undefined), aktion(undefined)]);
    const stati = [a.status, b.status].sort();
    expect(stati).toEqual([201, 409]);
    expect([a, b].some((r) => r.body.error === MELDUNGEN.VERSAND_LAEUFT)).toBe(true);
  });
});

// =============================================
// Uebersicht
// =============================================

describe("Uebersicht", () => {
  it("vor dem Versand: Vorschau-Faelligkeiten, Bezugsdatum und Vorschau je Zeile", async () => {
    db.onboardingAufgaben = [aufgabe({ id: "i-1", title: "Konto anlegen", assignee: "IT", relativeDueDays: -7 })];
    const u = await uebersicht();
    expect(u.abteilungen.modul).toBe("ONBOARDING");
    expect(u.abteilungen.bezugsdatum).toBe(BEGINN.toISOString());
    expect(u.abteilungen.gesperrt).toBeNull();
    expect(u.checklistItems[0].faelligAm).toBe("2026-09-24T00:00:00.000Z");
    expect(u.abteilungen.zeilen[0]).toMatchObject({
      departmentKey: "IT",
      email: "it@example.org",
      informierbar: true,
      aufgaben: { gesamt: 1, offen: 1, naechsteFaelligkeit: "2026-09-24T00:00:00.000Z" },
    });
    expect(u.abteilungen.zeilen[0].vorschau?.aufgaben).toEqual([
      { id: "i-1", title: "Konto anlegen", dueDate: "2026-09-24T00:00:00.000Z", description: null },
    ]);
    expect(u.fuehrungskraft).toEqual({ email: "a.leitung@example.org", name: null, quelle: "VORGANG" });
  });

  it("ohne Modalitaeten: gesperrt, kein Bezugsdatum, keine Vorschau-Faelligkeit", async () => {
    db.onboardingVorgaenge = [vorgang({ supervisorSubmittedAt: null, supervisorData: { isComplete: false, vertragsbeginn: BEGINN } })];
    db.onboardingAufgaben = [aufgabe({ assignee: "IT", relativeDueDays: -7 })];
    const u = await uebersicht();
    expect(u.abteilungen.gesperrt).toEqual({ grund: "MODALITAETEN_FEHLEN", text: MELDUNGEN.MODALITAETEN_FEHLEN });
    expect(u.abteilungen.bezugsdatum).toBeNull();
    expect(u.abteilungen.informierbar).toBe(0);
    expect(u.checklistItems[0].faelligAm).toBeNull();
  });

  it("GET /abteilungen: Rolle, Mandant und Inhalt", async () => {
    db.onboardingAufgaben = [aufgabe({ assignee: "IT", relativeDueDays: 0 })];
    const ok = await onboardingAbteilungenLaden({ onboardingId: "onb-1", session: HR, jetzt: JETZT });
    expect(ok.status).toBe(200);
    expect((ok.body.abteilungen as { zeilen: unknown[] }).zeilen).toHaveLength(1);
    expect(ok.body.fuehrungskraft).toEqual({ email: "a.leitung@example.org", name: null, quelle: "VORGANG" });
    const fremd = await onboardingAbteilungenLaden({ onboardingId: "weg", session: HR });
    expect(fremd).toEqual({ status: 404, body: { error: MELDUNGEN.ONBOARDING_VORGANG_NICHT_GEFUNDEN } });
    const ohneRolle = await onboardingAbteilungenLaden({ onboardingId: "onb-1", session: { ...HR, role: "SERVICE" } });
    expect(ohneRolle.status).toBe(403);
    // Fremder Mandant: dieselbe 404 wie ein unbekannter Vorgang (die Rolle
    // EINRICHTUNGSLEITUNG sieht nur zugewiesene Einrichtungen, db.zuweisungen ist leer).
    const fremderMandant = await onboardingAbteilungenLaden({
      onboardingId: "onb-1",
      session: { ...HR, role: "EINRICHTUNGSLEITUNG" },
    });
    expect(fremderMandant).toEqual({ status: 404, body: { error: MELDUNGEN.ONBOARDING_VORGANG_NICHT_GEFUNDEN } });
  });
});

// =============================================
// Oeffentliche Seite
// =============================================

describe("oeffentliche Onboarding-Seite", () => {
  beforeEach(() => {
    db.onboardingAufgaben = [
      aufgabe({ id: "i-1", title: "Konto anlegen", assignee: "IT", description: "M365", dueDate: tage(2), notes: "HR-intern" }),
      aufgabe({ id: "i-2", title: "Geraet", assignee: "IT", dueDate: tage(5) }),
      aufgabe({ id: "i-9", title: "Fremd", assignee: "VORGESETZTER" }),
    ];
    db.links = [link()];
  });

  it("GET: eigene Aufgaben mit Hinweis, Zusatzfelder je Schluessel, ohne interne Notiz", async () => {
    const r = await oeffentlicheOnboardingAufgabenLaden("tok-it", JETZT);
    expect(r.status).toBe(200);
    const data = r.body.data as Zeile;
    expect(data.modul).toBe("ONBOARDING");
    expect(data.vorgang).toEqual({
      vorgangsnummer: "ONB-2026-031",
      mitarbeiterName: "Anna Beispiel",
      einrichtung: "FES Minden",
      bezugsdatum: BEGINN.toISOString(),
    });
    expect(data.zusatz).toEqual({
      stellenbezeichnung: "Lehrkraft Sek. I",
      betriebsstaette: "Minden, Hauptstandort",
      ansprechpartner_email: "a.leitung@example.org",
    });
    const aufgaben = data.aufgaben as Zeile[];
    expect(aufgaben).toHaveLength(2);
    expect(aufgaben[0]).toMatchObject({ title: "Konto anlegen", description: "M365" });
    expect(aufgaben[0]).not.toHaveProperty("notes");
    expect(aufgaben[0]).not.toHaveProperty("completedById");
    expect(JSON.stringify(data)).not.toContain("HR-intern");
    expect(JSON.stringify(data)).not.toContain("anna.privat@example.org");
    expect(linkVon("IT")).toMatchObject({ openCount: 1, firstOpenedAt: JETZT });
  });

  it("ohne Namen steht „Name folgt“, Buchhaltung sieht keine Zusatzfelder", async () => {
    db.onboardingVorgaenge = [vorgang({ firstName: null, lastName: null, personalData: null })];
    db.links = [link({ departmentKey: "BUCHHALTUNG", departmentName: "Buchhaltung", token: "tok-bu" })];
    db.onboardingAufgaben = [aufgabe({ assignee: "BUCHHALTUNG" })];
    const r = await oeffentlicheOnboardingAufgabenLaden("tok-bu", JETZT);
    const data = r.body.data as Zeile;
    expect((data.vorgang as Zeile).mitarbeiterName).toBe(MELDUNGEN.NAME_FOLGT);
    expect(data.zusatz).toEqual({});
  });

  it("abgelaufener Vorgang 410 mit eigenem Text, abgeschlossener nur lesend, abgelaufener Link 410", async () => {
    db.onboardingVorgaenge = [vorgang({ status: "EXPIRED" })];
    expect(await oeffentlicheOnboardingAufgabenLaden("tok-it", JETZT)).toEqual({
      status: 410,
      body: { error: MELDUNGEN.VORGANG_NICHT_MEHR_AKTIV },
    });
    db.onboardingVorgaenge = [vorgang({ status: "COMPLETED" })];
    const r = await oeffentlicheOnboardingAufgabenLaden("tok-it", JETZT);
    expect((r.body.data as Zeile).readOnly).toBe(true);
    expect((await oeffentlicheOnboardingAufgabeAendern("tok-it", "i-1", { isCompleted: true }, JETZT)).status).toBe(409);

    db.onboardingVorgaenge = [vorgang()];
    db.links = [link({ expiresAt: tage(-1) })];
    expect((await oeffentlicheOnboardingAufgabenLaden("tok-it", JETZT)).status).toBe(410);
  });

  it("ein Token des anderen Moduls ist „Ungültiger Link“ — in beide Richtungen", async () => {
    expect(await oeffentlicheAufgabenLaden("tok-it", JETZT)).toEqual({
      status: 404,
      body: { error: MELDUNGEN.LINK_UNGUELTIG },
    });
    db.vorgaenge = [{ id: "off-1", displayId: "OFF-1", status: "INITIATED", employeeFirstName: "Max", employeeLastName: "Muster", lastWorkingDay: tage(10), organization: { name: "FES", mandantNumber: "01" } }];
    db.links.push(neuerLink({ offboardingId: "off-1", departmentKey: "IT", departmentName: "IT", email: "it@example.org", token: "tok-off", expiresAt: tage(30), sentAt: tage(-1) }));
    expect((await oeffentlicheOnboardingAufgabenLaden("tok-off", JETZT)).status).toBe(404);
    expect((await oeffentlicheAufgabenLaden("tok-off", JETZT)).status).toBe(200);
  });

  it("Abhaken: Kommentar, Mail an HR (ohne email-Feld), Abteilung fertig genau einmal", async () => {
    const r1 = await oeffentlicheOnboardingAufgabeAendern("tok-it", "i-1", { isCompleted: true, comment: "Konto <b>da</b>" }, JETZT);
    expect(r1.status).toBe(200);
    expect(db.onboardingAufgaben[0]).toMatchObject({
      isCompleted: true,
      completedById: null,
      abteilungKommentar: "Konto <b>da</b>",
      notes: "HR-intern",
    });
    const erledigt = mails("onboarding-task-completed");
    expect(erledigt).toHaveLength(1);
    expect(erledigt[0]).toMatchObject({
      aufgabe: "Konto anlegen",
      abteilung: "IT-Abteilung",
      erledigt_ueber: "Link der Abteilung",
      kommentar: "Konto &lt;b&gt;da&lt;/b&gt;",
      kommentar_text: "Konto <b>da</b>",
      offene_aufgaben: 2,
      offene_aufgaben_abteilung: 1,
    });
    expect(erledigt[0]).not.toHaveProperty("email");
    expect(mails("onboarding-department-completed")).toHaveLength(0);

    // Zweiter Haken auf dieselbe Aufgabe: keine zweite Mail.
    await oeffentlicheOnboardingAufgabeAendern("tok-it", "i-1", { isCompleted: true }, JETZT);
    expect(mails("onboarding-task-completed")).toHaveLength(1);

    // Letzte Aufgabe der Abteilung: Bestaetigung genau einmal.
    await oeffentlicheOnboardingAufgabeAendern("tok-it", "i-2", { isCompleted: true }, JETZT);
    const fertig = mails("onboarding-department-completed");
    expect(fertig).toHaveLength(1);
    expect(fertig[0]).toMatchObject({ abteilung: "IT-Abteilung", email: "it@example.org", anzahl_aufgaben: 2 });
    expect(linkVon("IT")).toMatchObject({ allTasksComplete: true, completedAt: JETZT });
    expect(db.audits.map((a) => a.action)).toContain("DEPARTMENT_TASKS_COMPLETED");
    expect(db.audits.every((a) => a.processType === "ONBOARDING" || a.processType === undefined)).toBe(true);
  });

  it("fremde Aufgabe und kaputter Body: 404 bzw. 400", async () => {
    expect((await oeffentlicheOnboardingAufgabeAendern("tok-it", "i-9", { isCompleted: true }, JETZT)).status).toBe(404);
    expect(await oeffentlicheOnboardingAufgabeAendern("tok-it", "i-1", undefined, JETZT)).toEqual({
      status: 400,
      body: { error: MELDUNGEN.UNGUELTIGE_EINGABE },
    });
  });
});

// =============================================
// Portal
// =============================================

describe("Portal-PATCH im Onboarding", () => {
  beforeEach(() => {
    db.onboardingAufgaben = [
      aufgabe({ id: "i-1", title: "Konto anlegen", assignee: "IT", dueDate: tage(2) }),
      aufgabe({ id: "i-2", title: "Geraet", assignee: "IT" }),
    ];
    db.links = [link()];
    db.users = [{ id: "u-hr", firstName: "Erika", lastName: "Sachbearbeiter" }];
  });

  const patch = (itemId: string, rohBody: unknown, session: SessionPayload = HR) =>
    onboardingAufgabeImPortalAendern({ onboardingId: "onb-1", itemId, rohBody, session, jetzt: JETZT });

  it("HR hakt ab: Urheber, Fortschritt, Abteilungsstatus — aber KEINE Mail", async () => {
    const r1 = await patch("i-1", { isCompleted: true });
    expect(r1.status).toBe(200);
    const r2 = await patch("i-2", { isCompleted: true });
    expect((r2.body.progress as Zeile)).toEqual({ total: 2, completed: 2, allCompleted: true });
    expect((r2.body.item as Zeile).erledigtVon).toEqual({ art: "PORTAL", name: "Erika Sachbearbeiter" });
    expect(linkVon("IT")).toMatchObject({ allTasksComplete: true });
    expect(mockTrigger).not.toHaveBeenCalled();
    expect(db.audits.map((a) => a.action)).toContain("CHECKLIST_ITEM_UPDATED");
  });

  it("Umhaengen berechnet beide Abteilungen neu; unbekannter Schluessel 400", async () => {
    db.konfigs.push(konfig({ departmentKey: "VERWALTUNG", departmentName: "Verwaltung", email: "sek@example.org" }));
    db.links.push(link({ departmentKey: "VERWALTUNG", departmentName: "Verwaltung", email: "sek@example.org", token: "tok-vw", allTasksComplete: true, completedAt: tage(-1) }));
    await patch("i-1", { assignee: "VERWALTUNG" });
    expect(db.onboardingAufgaben[0].assignee).toBe("VERWALTUNG");
    expect(linkVon("VERWALTUNG")).toMatchObject({ allTasksComplete: false, completedAt: null });
    const r = await patch("i-2", { assignee: "GIBTESNICHT" });
    expect(r.status).toBe(400);
    expect(String(r.body.error)).toContain("Unbekannte Zuständigkeit");
  });

  it("abgelaufener Vorgang: Status/Zuordnung 409, Notiz geht weiter", async () => {
    db.onboardingVorgaenge = [vorgang({ status: "EXPIRED" })];
    expect((await patch("i-1", { isCompleted: true })).status).toBe(409);
    expect((await patch("i-1", { notes: "Nur eine Notiz" })).status).toBe(200);
    expect(db.onboardingAufgaben[0].notes).toBe("Nur eine Notiz");
  });

  it("Rolle, Vorgang und Eintrag: 403 / 404 / 404", async () => {
    expect((await patch("i-1", { isCompleted: true }, { ...HR, role: "BEM_BEAUFTRAGTER" })).status).toBe(403);
    expect(
      (await onboardingAufgabeImPortalAendern({ onboardingId: "weg", itemId: "i-1", rohBody: { notes: "x" }, session: HR })).body,
    ).toEqual({ error: MELDUNGEN.ONBOARDING_VORGANG_NICHT_GEFUNDEN });
    expect((await patch("gibt-es-nicht", { notes: "x" })).body).toEqual({ error: MELDUNGEN.EINTRAG_NICHT_GEFUNDEN });
  });
});

// =============================================
// Taeglicher Lauf
// =============================================

describe("onboardingErinnerungenSenden", () => {
  beforeEach(() => {
    db.onboardingAufgaben = [aufgabe({ title: "Konto anlegen", assignee: "IT", dueDate: tage(-2) })];
    db.links = [link({ sentAt: tage(-6), lastSentAt: tage(-6) })];
  });

  it("erinnert mit Stufe und Merker; die Mail heisst onboarding-department-reminder", async () => {
    const e = await onboardingErinnerungenSenden(JETZT);
    expect(e.remindersProcessed).toBe(1);
    expect(e.details[0]).toMatchObject({ onboardingId: "onb-1", displayId: "ONB-2026-031", departmentKey: "IT", level: "WARNING", status: "SENT" });
    const [p] = mails("onboarding-department-reminder");
    expect(p).toMatchObject({
      abteilung: "IT-Abteilung",
      email: "it@example.org",
      ist_ueberfaellig: "ja",
      tage_ueberfaellig: "2",
      offene_aufgaben: 1,
      vertragsbeginn: "01.10.2026",
      mitarbeiter_name: "Anna Beispiel",
    });
    expect(linkVon("IT")).toMatchObject({ reminderCount: 1, lastReminderAt: JETZT });
    expect(db.audits.map((a) => a.action)).toContain("ONBOARDING_DEPARTMENT_REMINDER_SENT");
  });

  it("abgeschlossene und abgelaufene Vorgaenge bleiben aus", async () => {
    db.onboardingVorgaenge = [vorgang({ status: "COMPLETED" })];
    expect((await onboardingErinnerungenSenden(JETZT)).remindersProcessed).toBe(0);
    db.onboardingVorgaenge = [vorgang({ status: "EXPIRED" })];
    expect((await onboardingErinnerungenSenden(JETZT)).remindersProcessed).toBe(0);
    expect(mockTrigger).not.toHaveBeenCalled();
  });

  it("nie informierte Links und fertige Abteilungen bleiben aus; geaenderte Adresse wird vermerkt", async () => {
    db.links = [link({ sentAt: null, lastSentAt: null })];
    expect((await onboardingErinnerungenSenden(JETZT)).remindersProcessed).toBe(0);

    db.links = [link({ sentAt: tage(-6), lastSentAt: tage(-6), email: "alt@example.org" })];
    const e = await onboardingErinnerungenSenden(JETZT);
    expect(e.remindersProcessed).toBe(0);
    expect(e.uebersprungen[0]).toMatchObject({ onboardingId: "onb-1", departmentKey: "IT", grund: "ADRESSE_GEAENDERT" });
    expect(linkVon("IT")).toMatchObject({ lastSendStatus: "SKIPPED", token: "tok-it" });
    expect(mockTrigger).not.toHaveBeenCalled();
  });
});
