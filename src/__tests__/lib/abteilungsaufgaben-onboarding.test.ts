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
 *
 * Arbeitsort (E-A10, Feinplan S5, letzter Block): Die Empfaenger ALLER
 * Abteilungsaufgaben — auch der aus der Checklisten-Vorlage — werden am
 * Arbeitsort aufgeloest; die Mandantenpruefung bleibt an organizationId. Die
 * Fake-DB kennt `arbeitsortId` nicht eigens: Fehlt das Feld an der Zeile, gilt
 * die Einrichtung.
 *
 * Ausstattung & Zugaenge (Paket A3, Feinplan S12, letzter Block): Faelligkeit
 * der Ausstattungsaufgaben mit „Eilt“ (Regel 14) und das Anheben vor einer
 * Zuweisungsmail (F22) — Informieren und Erneut senden heben noch nicht
 * zugestellte, verstrichene Aufgaben auf heute an, Erinnern nie,
 * Vorlagenaufgaben nie. Anlegen und Nachholen selbst: ausstattung-aufgaben.test.ts.
 * Seit S13: „(eilt)“ in der Aufgabenliste und die erste Erinnerung mit einer
 * eilenden Aufgabe hoechstens WARNING (eiltDeckeln, Lauf und Knopf); die
 * Positivliste der Zuweisungsmail kennt `angaben*` und `arbeitsort`.
 * Seit S14 (Block „Uebersicht“): Die Uebersicht gibt Herkunft, „mit
 * Bemerkung“ und „entfällt“ an die Zeilen und die Beschriftungen der Angaben
 * fuer den Satz im Dialog — nie Werte oder Texte.
 * Seit S17 (letzte Bloecke): „Nachtrag senden“ (Regel 10, F7 — auch nur mit
 * „Entfällt“, gleicher Token, Sperrzeit, leere Liste 409, nur gelesene
 * Eintraege markiert, Datenbankfehler als Warnung, „Erneut senden“ nimmt die
 * Eintraege mit) und der Waechter in der Uebersicht (Regel 15).
 * Seit S19 (letzter Block): die Absage nach EXPIRED (E-A20) — nur bei
 * EXPIRED, nur informierte Stellen, an `link.email` (F16), mit den erledigten
 * Aufgaben ohne Entfallene (F17), ohne Link-Felder, `abgesagtAm` nur bei SENT
 * (F13), zweiter Klick 409 BEREITS_ABGESAGT, und ihr Stand in der Uebersicht.
 * Seit A4, S27 (G10): Die Absage nennt je Stelle die noch ausgegebenen Stuecke
 * (`ausgaben_liste*`, `hat_ausgaben`) — nur die eigenen, ohne Link-Felder,
 * Positivliste der Payload.
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

import {
  db,
  dbLeeren,
  fakePrisma,
  naechsteId,
  neueAusgabe,
  neueAusstattungsZeile,
  neuerLink,
  type Zeile,
} from "../hilfen/abteilungs-fake-db";
import {
  faelligkeitenSetzen,
  onboardingAbteilungenLaden,
  onboardingAbteilungsAktionAusfuehren,
  onboardingAbteilungsUebersichtLaden,
  onboardingAusstattungNachholenIn,
  onboardingErinnerungenSenden,
} from "@/lib/abteilungsaufgaben-onboarding";
import {
  oeffentlicheAufgabenLaden,
  oeffentlicheOnboardingAufgabeAendern,
  oeffentlicheOnboardingAufgabenLaden,
  onboardingAufgabeImPortalAendern,
} from "@/lib/abteilungsaufgaben-uebergaenge";
import { MELDUNGEN } from "@/lib/abteilungsaufgaben";
import { AUSSTATTUNG_AUDIT } from "@/lib/ausstattung";
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
    // Paket A3 (S14): Spalten mit den Standardwerten des Schemas — der Link-
    // PATCH schaltet nur mit `entfaelltAm: null` im WHERE um.
    herkunft: null,
    eilt: false,
    entfaelltAm: null,
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
        // Wie das `include` der Detailroute: alle Spalten, seit A3 auch diese.
        herkunft: a.herkunft as string | null,
        entfaelltAm: a.entfaelltAm as Date | null,
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
      // Paket A3 (S13): Angaben der Stelle (Regel 7) und Arbeitsort (F15).
      "angaben", "angaben_html", "arbeitsort",
      // Paket A3 (S17): Nachtrag (Regel 10, F7) und der Merker der Aufgabenliste.
      "nachtrag", "nachtrag_liste", "nachtrag_liste_html", "hat_offene_aufgaben",
    ]);
    for (const p of mails("onboarding-department-assigned")) {
      expect(Object.keys(p).filter((k) => !erlaubt.has(k))).toEqual([]);
      expect(JSON.stringify(p)).not.toContain("anna.privat@example.org");
      // Kein Token im Payload (anders als im Offboarding) — der Link genuegt.
      expect(p).not.toHaveProperty("token");
      // Im Onboarding stehen Angaben und Arbeitsort immer da, ohne Inhalt als "".
      expect(p).toMatchObject({ angaben: "", angaben_html: "", arbeitsort: "" });
      // Ebenso der Nachtrag (bei der Erstmail leer) und der Merker der Liste.
      expect(p).toMatchObject({ nachtrag: "", nachtrag_liste: "", nachtrag_liste_html: "", hat_offene_aufgaben: "ja" });
    }
  });

  it("ohne Ausstattungsaufgaben fragt der Versand keine Bemerkungen ab (S13, Feinplan 1.7)", async () => {
    const verknuepfungen = (fakePrisma.onboardingAusstattungAufgabe as { findMany: jest.Mock }).findMany;
    verknuepfungen.mockClear();

    await aktion(undefined);

    expect(verknuepfungen).not.toHaveBeenCalled();
    // Die Liste sieht aus wie vor Paket A3: kein „(eilt)“, keine Bemerkungszeile.
    const [it] = mails("onboarding-department-assigned").filter((p) => p.departmentKey === "IT");
    expect(it.aufgabenliste).toBe("- Konto anlegen – fällig 24.09.2026\n  M365");
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

  // ---- Paket A3 (S14): Kennzeichen und Satz fuer den Dialog (Mockup 6.4) ----

  function ausstattungFuerDialog(): void {
    db.ausstattungZeilen = [
      neueAusstattungsZeile({ id: "aus-ipad", onboardingId: "onb-1", departmentKey: "IT", art: "JA_NEIN", bezeichnung: "Dienst-iPad", quelle: "FUEHRUNGSKRAFT", bemerkung: "Mit Stift", bemerkungQuelle: "FUEHRUNGSKRAFT" }),
      neueAusstattungsZeile({ id: "aus-tel", onboardingId: "onb-1", departmentKey: "IT", art: "JA_NEIN", bezeichnung: "Telefon", quelle: "FUEHRUNGSKRAFT" }),
      neueAusstattungsZeile({ onboardingId: "onb-1", departmentKey: "FACILITY", art: "ANGABE", angabeSchluessel: "UNTERRICHTSFAECHER", bezeichnung: "Unterrichtsfächer", angabe: "Chemie, Sport", sichtbarFuer: ["IT"], quelle: "FUEHRUNGSKRAFT" }),
    ];
    db.stellenHinweise = [
      { onboardingId: "onb-1", departmentKey: "IT", text: "Bitte mit Dockingstation", quelle: "FUEHRUNGSKRAFT", checklistItemId: "i-hin", gesehenAm: null, inhaltGeleertAm: null },
    ];
    db.onboardingAufgaben = [
      aufgabe({ id: "i-konto", title: "Konto anlegen", assignee: "IT", relativeDueDays: -7 }),
      aufgabe({ id: "i-ipad", title: "Dienst-iPad bereitstellen", assignee: "IT", herkunft: "AUSSTATTUNG", relativeDueDays: -5 }),
      aufgabe({ id: "i-tel", title: "Telefon bereitstellen", assignee: "IT", herkunft: "AUSSTATTUNG" }),
      aufgabe({ id: "i-hin", title: "Hinweis der Führungskraft beachten", assignee: "IT", herkunft: "HINWEIS" }),
      aufgabe({ id: "i-weg", title: "Parkplatz bereitstellen", assignee: "IT", herkunft: "AUSSTATTUNG", isCompleted: true, completedAt: tage(-1), entfaelltAm: tage(-1) }),
    ];
    db.ausstattungAufgaben = [
      { ausstattungId: "aus-ipad", option: "", checklistItemId: "i-ipad", createdAt: tage(-2) },
      { ausstattungId: "aus-tel", option: "", checklistItemId: "i-tel", createdAt: tage(-2) },
    ];
  }

  it("Ausstattung: Vorschau zaehlt Herkunft und Bemerkung, `gesamt` ohne Entfallene, Satz-Daten nur als Beschriftung", async () => {
    db.konfigs = [konfig()];
    ausstattungFuerDialog();
    const u = await uebersicht();
    const it_ = u.abteilungen.zeilen.find((z) => z.departmentKey === "IT")!;
    expect(it_.informierbar).toBe(true);
    expect(it_.vorschau).toMatchObject({ ausstattung: 3, mitBemerkung: 1 });
    // 4 zaehlende Aufgaben (die entfallene nicht), alle offen.
    expect(it_.aufgaben).toMatchObject({ gesamt: 4, offen: 4 });
    expect(u.abteilungen.ausstattungSicht).toEqual({
      stellen: {
        IT: { angaben: ["Unterrichtsfächer"], hinweis: true },
        FACILITY: { angaben: ["Unterrichtsfächer"], hinweis: false },
      },
    });
    // Nie Werte, Bemerkungen oder Hinweistexte — die Uebersicht geht an PORTAL_ROLES (1.11).
    const text = JSON.stringify(u.abteilungen);
    expect(text).not.toContain("Chemie");
    expect(text).not.toContain("Mit Stift");
    expect(text).not.toContain("Dockingstation");
  });

  it("niemand informierbar: kein Satz und keine Abfrage der Angaben", async () => {
    db.konfigs = [konfig()];
    ausstattungFuerDialog();
    db.links = [link()]; // IT schon informiert
    const fp = fakePrisma as unknown as Record<string, Record<string, jest.Mock>>;
    fp.onboardingStellenHinweis.findMany.mockClear();
    const u = await uebersicht();
    expect(u.abteilungen.informierbar).toBe(0);
    expect(u.abteilungen.ausstattungSicht).toBeNull();
    // angabenJeStelleLaden liest Angaben UND Hinweise — die Hinweise liest sonst niemand hier.
    expect(fp.onboardingStellenHinweis.findMany).not.toHaveBeenCalled();
  });

  it("GET /abteilungen liest Herkunft und „entfällt“ mit", async () => {
    db.konfigs = [konfig()];
    ausstattungFuerDialog();
    const ok = await onboardingAbteilungenLaden({ onboardingId: "onb-1", session: HR, jetzt: JETZT });
    const a = ok.body.abteilungen as { zeilen: { departmentKey: string; vorschau: unknown; aufgaben: unknown }[] };
    const it_ = a.zeilen.find((z) => z.departmentKey === "IT")!;
    expect(it_.vorschau).toMatchObject({ ausstattung: 3, mitBemerkung: 1 });
    expect(it_.aufgaben).toMatchObject({ gesamt: 4 });
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

  it("Abteilung fertig: `anzahl_aufgaben` zaehlt entfallene Aufgaben nicht mit (F2)", async () => {
    db.onboardingAufgaben.push(
      aufgabe({
        id: "i-weg",
        title: "Spind bereitstellen",
        assignee: "IT",
        herkunft: "AUSSTATTUNG",
        isCompleted: true,
        completedAt: tage(-1),
        completedById: "u-hr",
        entfaelltAm: tage(-1),
      }),
    );
    await oeffentlicheOnboardingAufgabeAendern("tok-it", "i-1", { isCompleted: true }, JETZT);
    await oeffentlicheOnboardingAufgabeAendern("tok-it", "i-2", { isCompleted: true }, JETZT);
    const fertig = mails("onboarding-department-completed");
    expect(fertig).toHaveLength(1);
    expect(fertig[0]).toMatchObject({ anzahl_aufgaben: 2 });
  });

  it("sperrt in der Transaktion ZUERST den Vorgang (bedingt auf „laufend“), dann den Link (E-A19)", async () => {
    const fp = fakePrisma as unknown as Record<string, Record<string, jest.Mock>>;
    const r = await oeffentlicheOnboardingAufgabeAendern("tok-it", "i-1", { isCompleted: true }, JETZT);
    expect(r.status).toBe(200);

    const vorgangSperre = fp.onboardingProcess.updateMany;
    expect(vorgangSperre).toHaveBeenCalledWith({
      where: { id: "onb-1", status: { notIn: ["COMPLETED", "EXPIRED"] } },
      data: { updatedAt: JETZT },
    });
    const linkSperre = fp.offboardingDepartmentLink.updateMany;
    expect(vorgangSperre.mock.invocationCallOrder[0]).toBeLessThan(linkSperre.mock.invocationCallOrder[0]);
    expect(linkSperre.mock.invocationCallOrder[0]).toBeLessThan(fp.checklistItem.updateMany.mock.invocationCallOrder[0]);
  });

  it.each([
    ["COMPLETED", 409, MELDUNGEN.VORGANG_ABGESCHLOSSEN_NUR_LESEN],
    ["EXPIRED", 410, MELDUNGEN.VORGANG_NICHT_MEHR_AKTIV],
  ])(
    "Vorgang zwischen Lesen und Transaktion %s: „wieder öffnen“ schreibt nichts (%s)",
    async (status, code, meldung) => {
      // Die Stelle hat i-1 erledigt; HR schliesst ab, waehrend ihr Klick „wieder
      // öffnen“ unterwegs ist — der Lesestand vor der Transaktion ist veraltet.
      Object.assign(db.onboardingAufgaben[0], { isCompleted: true, completedAt: tage(-1) });
      (fakePrisma.$transaction as jest.Mock).mockImplementationOnce(async (fn: (tx: unknown) => unknown) => {
        db.onboardingVorgaenge[0].status = status;
        return fn(fakePrisma);
      });

      const r = await oeffentlicheOnboardingAufgabeAendern("tok-it", "i-1", { isCompleted: false, comment: "doch nicht" }, JETZT);

      expect(r).toEqual({ status: code, body: { error: meldung } });
      expect(db.onboardingAufgaben[0]).toMatchObject({ isCompleted: true, completedAt: tage(-1), abteilungKommentar: null });
      expect(db.audits).toEqual([]);
      expect(mockTrigger).not.toHaveBeenCalled();
    },
  );

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

// =============================================
// Arbeitsort (E-A10, Feinplan S5)
// =============================================

describe("Arbeitsort: Empfaenger am Arbeitsort, Mandant bleibt die Einrichtung", () => {
  const HAUSMEISTER_ZENTRAL = "hausmeister@example.org";
  const HAUSMEISTER_GYM = "hausmeister.gym@example.org";
  const HAUSMEISTER_GS = "hausmeister.gs@example.org";

  beforeEach(() => {
    // Foerderverein-Fall: Arbeitgeber org-1, die Person arbeitet an der
    // Grundschule org-2. Die Aufgabe stammt aus der Checklisten-VORLAGE.
    db.onboardingVorgaenge = [vorgang({ arbeitsortId: "org-2" })];
    db.konfigs = [
      konfig({ departmentKey: "FACILITY", departmentName: "Hausmeister", email: HAUSMEISTER_ZENTRAL }),
      konfig({ departmentKey: "FACILITY", departmentName: "Hausmeister Gymnasium", email: HAUSMEISTER_GYM, organizationId: "org-1" }),
      konfig({ departmentKey: "FACILITY", departmentName: "Hausmeister Grundschule", email: HAUSMEISTER_GS, organizationId: "org-2" }),
    ];
    db.onboardingAufgaben = [
      aufgabe({ title: "Schlüssel ausgeben", assignee: "FACILITY", templateItemId: "ti-1", relativeDueDays: -3 }),
    ];
  });

  it("die Vorlagenaufgabe geht an die Stelle des Arbeitsorts — Link, Mail und Name", async () => {
    const r = await aktion(undefined);

    expect(r.status).toBe(201);
    expect(linkVon("FACILITY")).toMatchObject({
      email: HAUSMEISTER_GS,
      departmentName: "Hausmeister Grundschule",
      onboardingId: "onb-1",
      sentAt: JETZT,
    });
    const [payload] = mails("onboarding-department-assigned");
    expect(payload).toMatchObject({ email: HAUSMEISTER_GS, abteilung: "Hausmeister Grundschule" });
    // Die Einrichtung im Mailtext bleibt der Arbeitgeber (Mandant).
    expect(payload.einrichtung).toBe("FES Minden");
    expect(JSON.stringify(mockTrigger.mock.calls)).not.toContain(HAUSMEISTER_GYM);
  });

  it("ohne Eintrag am Arbeitsort gilt der zentrale — nie der der Einrichtung", async () => {
    db.konfigs = db.konfigs.filter((k) => k.organizationId !== "org-2");

    await aktion(undefined);

    expect(linkVon("FACILITY").email).toBe(HAUSMEISTER_ZENTRAL);
  });

  it("ohne Arbeitsort bleibt alles bei der Einrichtung (Bestand)", async () => {
    db.onboardingVorgaenge = [vorgang()];

    await aktion(undefined);

    expect(linkVon("FACILITY").email).toBe(HAUSMEISTER_GYM);
  });

  it("Karte und Dialog (GET /abteilungen) zeigen den Empfaenger am Arbeitsort", async () => {
    const r = await onboardingAbteilungenLaden({ onboardingId: "onb-1", session: HR, jetzt: JETZT });

    expect(r.status).toBe(200);
    const [zeile] = (r.body.abteilungen as { zeilen: Zeile[] }).zeilen;
    expect(zeile).toMatchObject({ departmentKey: "FACILITY", email: HAUSMEISTER_GS, informierbar: true });
  });

  it("der taegliche Lauf erinnert am Arbeitsort — die Adresse der Einrichtung gilt dort als geaendert", async () => {
    db.onboardingAufgaben = [aufgabe({ title: "Schlüssel ausgeben", assignee: "FACILITY", dueDate: tage(-2) })];
    db.links = [
      link({ departmentKey: "FACILITY", departmentName: "Hausmeister Grundschule", email: HAUSMEISTER_GS, token: "tok-fac" }),
    ];

    const e = await onboardingErinnerungenSenden(JETZT);
    expect(e.remindersProcessed).toBe(1);
    expect(mails("onboarding-department-reminder")[0]).toMatchObject({ email: HAUSMEISTER_GS });

    mockTrigger.mockClear();
    db.links = [
      link({ departmentKey: "FACILITY", departmentName: "Hausmeister Gymnasium", email: HAUSMEISTER_GYM, token: "tok-fac" }),
    ];
    const e2 = await onboardingErinnerungenSenden(JETZT);
    expect(e2.remindersProcessed).toBe(0);
    expect(e2.uebersprungen[0]).toMatchObject({ departmentKey: "FACILITY", grund: "ADRESSE_GEAENDERT" });
    expect(mockTrigger).not.toHaveBeenCalled();
  });

  it("Mandantenpruefung bleibt an organizationId: Zuordnung NUR zum Arbeitsort genuegt nicht", async () => {
    const leitung: SessionPayload = { ...HR, userId: "u-leitung", role: "EINRICHTUNGSLEITUNG" };
    db.zuweisungen = [{ userId: "u-leitung", organizationId: "org-2" }];

    expect(await onboardingAbteilungenLaden({ onboardingId: "onb-1", session: leitung, jetzt: JETZT })).toEqual({
      status: 404,
      body: { error: MELDUNGEN.ONBOARDING_VORGANG_NICHT_GEFUNDEN },
    });
    const portal = await onboardingAufgabeImPortalAendern({
      onboardingId: "onb-1",
      itemId: db.onboardingAufgaben[0].id as string,
      rohBody: { notes: "Notiz" },
      session: leitung,
      jetzt: JETZT,
    });
    expect(portal).toEqual({ status: 404, body: { error: MELDUNGEN.ONBOARDING_VORGANG_NICHT_GEFUNDEN } });

    // Mit Zuordnung zum Arbeitgeber dagegen schon — der Arbeitsort spielt dafuer keine Rolle.
    db.zuweisungen = [{ userId: "u-leitung", organizationId: "org-1" }];
    const ok = await onboardingAbteilungenLaden({ onboardingId: "onb-1", session: leitung, jetzt: JETZT });
    expect(ok.status).toBe(200);
    expect((ok.body.abteilungen as { zeilen: Zeile[] }).zeilen[0].email).toBe(HAUSMEISTER_GS);
  });
});

// =============================================
// Ausstattung & Zugaenge (Paket A3, S12): Faelligkeit, „Eilt“, Anheben beim Versand (F22)
// =============================================

describe("Ausstattung: Faelligkeit mit „Eilt“ und Anheben beim Versand (Regel 14, F22)", () => {
  const ABGABE = new Date("2026-09-15T08:00:00.000Z");
  /** Zehn Tage nach der Abgabe — die Frist der iPad-Aufgabe (Beginn − 7 = 24.09.) ist verstrichen. */
  const SPAETER = new Date("2026-09-25T08:00:00.000Z");
  const tag = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

  /** Ja/Nein an die IT, Vertragsbeginn − 7 Tage. */
  function ipadZeile(teil: Zeile = {}): Zeile {
    return neueAusstattungsZeile({
      id: "aus-ipad",
      onboardingId: "onb-1",
      positionId: "pos-ipad",
      departmentKey: "IT",
      art: "JA_NEIN",
      bezeichnung: "Dienst-iPad (Lernmittel)",
      aufgabeTitel: "Dienst-iPad (Lernmittel) bereitstellen",
      relativeDueDays: -7,
      quelle: "FUEHRUNGSKRAFT",
      ...teil,
    });
  }

  /** Eine schon angelegte Ausstattungsaufgabe samt Verknuepfung (angelegt mit der Abgabe). */
  function ipadAufgabe(teil: Zeile = {}): Zeile {
    const a = aufgabe({
      id: "i-ipad",
      title: "Dienst-iPad (Lernmittel) bereitstellen",
      category: "Ausstattung & Zugänge",
      orderIndex: -100000,
      assignee: "IT",
      relativeDueDays: -7,
      dueDate: tag("2026-09-24"),
      herkunft: "AUSSTATTUNG",
      eilt: false,
      entfaelltAm: null,
      createdAt: ABGABE,
      ...teil,
    });
    db.ausstattungAufgaben.push({ ausstattungId: "aus-ipad", option: "", checklistItemId: a.id, createdAt: ABGABE });
    return a;
  }

  const ipad = () => db.onboardingAufgaben.find((a) => a.id === "i-ipad") as Zeile;
  const angehoben = () => db.audits.filter((a) => a.action === AUSSTATTUNG_AUDIT.FAELLIGKEIT_ANGEHOBEN);

  beforeEach(() => {
    db.onboardingVorgaenge = [vorgang({ supervisorSubmittedAt: ABGABE })];
    db.ausstattungZeilen = [ipadZeile()];
  });

  it("faelligkeitenSetzen: Ausstattung nie vor heute und mit „Eilt“ — Vorlagenaufgaben unveraendert", async () => {
    db.onboardingAufgaben = [
      // `eilt: undefined` als Merker: Bleibt das Feld unberuehrt, steht danach
      // weiter undefined (die Vorlage traegt seit S14 sonst den Standardwert false).
      aufgabe({ id: "i-vorlage", title: "Konto anlegen", relativeDueDays: -7, eilt: undefined }),
      aufgabe({ id: "i-aus", title: "Dienst-iPad (Lernmittel) bereitstellen", relativeDueDays: -7, herkunft: "AUSSTATTUNG", eilt: false }),
      aufgabe({ id: "i-hinweis", title: "Hinweis der Führungskraft beachten", relativeDueDays: -7, herkunft: "HINWEIS", eilt: false }),
      aufgabe({ id: "i-spaet", title: "Parkplatz", relativeDueDays: 5, herkunft: "AUSSTATTUNG", eilt: false }),
    ];

    const r = await faelligkeitenSetzen(fakePrisma as unknown as Prisma.TransactionClient, "onb-1", { jetzt: SPAETER });

    expect(r.gesetzt).toBe(4);
    const nach = (id: string) => db.onboardingAufgaben.find((a) => a.id === id) as Zeile;
    // Vorlage: regulaer, auch wenn verstrichen — und ohne „Eilt“ (Feld unberuehrt).
    expect(nach("i-vorlage").dueDate).toEqual(tag("2026-09-24"));
    expect(nach("i-vorlage").eilt).toBeUndefined();
    expect(nach("i-aus")).toMatchObject({ dueDate: tag("2026-09-25"), eilt: true });
    expect(nach("i-hinweis")).toMatchObject({ dueDate: tag("2026-09-25"), eilt: true });
    expect(nach("i-spaet")).toMatchObject({ dueDate: tag("2026-10-06"), eilt: false });
    expect(db.audits).toEqual([
      expect.objectContaining({
        action: "CHECKLIST_DUE_DATES_SET",
        details: { gesetzt: 4, vertragsbeginn: BEGINN.toISOString(), eilt: 2 },
      }),
    ]);
  });

  it("Information 10 Tage nach der Abgabe: die verstrichene Ausstattungsaufgabe ist heute faellig und eilt", async () => {
    // Mit der Abgabe angelegt (Frist 24.09. lag da noch in der Zukunft).
    await onboardingAusstattungNachholenIn(fakePrisma as unknown as Prisma.TransactionClient, "onb-1", { jetzt: ABGABE });
    const angelegt = db.onboardingAufgaben.find((a) => a.herkunft === "AUSSTATTUNG") as Zeile;
    expect(angelegt).toMatchObject({ dueDate: tag("2026-09-24"), eilt: false });
    angelegt.createdAt = ABGABE; // die Fake-DB stempelt sonst mit der echten Uhr
    // Daneben eine Vorlagenaufgabe derselben Stelle, ebenso verstrichen.
    db.onboardingAufgaben.push(aufgabe({ id: "i-vorlage", title: "Konto anlegen", relativeDueDays: -7, dueDate: tag("2026-09-24") }));

    const r = await aktion(undefined, HR, SPAETER);

    expect(r.status).toBe(201);
    expect(angelegt).toMatchObject({ dueDate: tag("2026-09-25"), eilt: true });
    // Vorlagenaufgaben werden nie angehoben.
    expect(db.onboardingAufgaben.find((a) => a.id === "i-vorlage")?.dueDate).toEqual(tag("2026-09-24"));
    expect(angehoben()).toEqual([
      expect.objectContaining({
        userId: "u-hr",
        onboardingId: "onb-1",
        processType: "ONBOARDING",
        details: { anzahl: 1, stellen: ["IT"] },
      }),
    ]);
    // Die Mail kennt schon die neue Frist (angehoben VOR dem Laden des Kontexts)
    // und kennzeichnet sie mit „(eilt)“ (S13) — die Vorlagenaufgabe nicht.
    const [p] = mails("onboarding-department-assigned");
    expect(String(p.aufgabenliste)).toContain("Dienst-iPad (Lernmittel) bereitstellen – fällig 25.09.2026 (eilt)");
    expect(String(p.aufgabenliste_html)).toContain("Dienst-iPad (Lernmittel) bereitstellen – fällig 25.09.2026 (eilt)</li>");
    expect(String(p.aufgabenliste)).toContain("Konto anlegen – fällig 24.09.2026\n");
    expect(String(p.aufgabenliste)).not.toContain("24.09.2026 (eilt)");

    // Erste Erinnerung (S13, eiltDeckeln): rechnerisch eine Eskalation (die
    // aelteste Aufgabe ist sieben Tage ueberfaellig) — wegen der eilenden
    // Aufgabe aber nur WARNING. Auch dort steht „(eilt)“ in der Liste.
    mockTrigger.mockClear();
    const erste = await onboardingErinnerungenSenden(new Date("2026-10-01T06:00:00.000Z"));
    expect(erste.details).toEqual([expect.objectContaining({ departmentKey: "IT", level: "WARNING", status: "SENT" })]);
    const [erinnerung] = mails("onboarding-department-reminder");
    expect(erinnerung).toMatchObject({ level: "WARNING", ist_warnung: "ja", ist_eskalation: "", tage_ueberfaellig: "7" });
    expect(String(erinnerung.aufgabenliste)).toContain("fällig 25.09.2026 (eilt)");
    expect(linkVon("IT").reminderCount).toBe(1);

    // Ab der zweiten Erinnerung eskaliert es wie sonst auch.
    mockTrigger.mockClear();
    const zweite = await onboardingErinnerungenSenden(new Date("2026-10-06T06:00:00.000Z"));
    expect(zweite.details).toEqual([expect.objectContaining({ departmentKey: "IT", level: "ESCALATION" })]);
  });

  it("Knopf „Erinnern“: die erste Erinnerung mit eilender Aufgabe ist hoechstens WARNING", async () => {
    db.onboardingAufgaben = [ipadAufgabe({ dueDate: tag("2026-09-25"), eilt: true })];
    db.links = [link({ sentAt: SPAETER, lastSentAt: SPAETER, reminderCount: 0 })];

    const r = await aktion({ aktion: "erinnern", departmentKey: "IT" }, HR, new Date("2026-10-01T08:00:00.000Z"));

    expect(r.status).toBe(201);
    const [p] = mails("onboarding-department-reminder");
    expect(p).toMatchObject({ level: "WARNING", ist_warnung: "ja", ist_eskalation: "" });
    expect(db.audits).toContainEqual(
      expect.objectContaining({ action: "DEPARTMENT_REMINDER_SENT", details: expect.objectContaining({ level: "WARNING" }) }),
    );
  });

  it("„Erneut senden“ fuer eine Stelle, die die Aufgabe schon bekommen hat: die Frist bleibt", async () => {
    db.onboardingAufgaben = [ipadAufgabe()];
    db.links = [link({ sentAt: tage(-6), lastSentAt: tage(-6) })]; // 16.09., nach der Anlage am 15.09.

    const r = await aktion({ aktion: "erneut-senden", departmentKey: "IT" }, HR, SPAETER);

    expect(r.status).toBe(201);
    expect(ipad()).toMatchObject({ dueDate: tag("2026-09-24"), eilt: false });
    expect(angehoben()).toEqual([]);
  });

  it("„Erneut senden“ hebt an, was nach dem letzten Versand dazukam", async () => {
    db.onboardingAufgaben = [ipadAufgabe({ createdAt: tage(-3) })]; // 19.09., nach dem Versand am 16.09.
    db.links = [link({ sentAt: tage(-6), lastSentAt: tage(-6) })];

    const r = await aktion({ aktion: "erneut-senden", departmentKey: "IT" }, HR, SPAETER);

    expect(r.status).toBe(201);
    expect(ipad()).toMatchObject({ dueDate: tag("2026-09-25"), eilt: true });
    expect(angehoben()).toHaveLength(1);
  });

  it("„Erinnern“ hebt nie an — auch keine noch nicht zugestellte Aufgabe", async () => {
    db.onboardingAufgaben = [ipadAufgabe()];
    db.links = [link({ sentAt: tage(-8), lastSentAt: tage(-8) })]; // 14.09., VOR der Anlage

    const r = await aktion({ aktion: "erinnern", departmentKey: "IT" }, HR, SPAETER);

    expect(r.status).toBe(201);
    expect(mails("onboarding-department-reminder")).toHaveLength(1);
    expect(ipad()).toMatchObject({ dueDate: tag("2026-09-24"), eilt: false });
    expect(angehoben()).toEqual([]);
  });

  it("erledigte und entfallene Aufgaben werden nicht angehoben", async () => {
    db.onboardingAufgaben = [
      ipadAufgabe({ isCompleted: true, completedAt: tage(-1), entfaelltAm: tage(-1) }),
      aufgabe({
        id: "i-erledigt",
        title: "Parkplatz bereitstellen",
        relativeDueDays: -7,
        dueDate: tag("2026-09-24"),
        herkunft: "AUSSTATTUNG",
        eilt: false,
        entfaelltAm: null,
        isCompleted: true,
        createdAt: ABGABE,
      }),
      aufgabe({ id: "i-offen", title: "Konto anlegen", relativeDueDays: -7, dueDate: tag("2026-09-24") }),
    ];

    await aktion(undefined, HR, SPAETER);

    expect(ipad()).toMatchObject({ dueDate: tag("2026-09-24"), eilt: false });
    expect(db.onboardingAufgaben.find((a) => a.id === "i-erledigt")).toMatchObject({ dueDate: tag("2026-09-24"), eilt: false });
    expect(angehoben()).toEqual([]);
  });

  it("scheitert das Nachholen, setzt der Rueckfall die Faelligkeiten und der Versand laeuft", async () => {
    const stumm = jest.spyOn(console, "error").mockImplementation(() => {});
    db.onboardingAufgaben = [aufgabe({ id: "i-vorlage", title: "Konto anlegen", relativeDueDays: -7 })];
    (fakePrisma.onboardingAusstattung as { findMany: jest.Mock }).findMany.mockRejectedValueOnce(
      Object.assign(new Error("Verbindung verloren"), { code: "P1017" }),
    );

    const r = await aktion(undefined, HR, SPAETER);

    expect(r.status).toBe(201);
    expect(db.onboardingAufgaben.find((a) => a.id === "i-vorlage")?.dueDate).toEqual(tag("2026-09-24"));
    expect(stumm).toHaveBeenCalledWith(expect.stringContaining("Ausstattung nicht nachgeholt"), "P1017");
    stumm.mockRestore();
  });
});

// =============================================
// Nachtrag senden und Waechter (Paket A3, S17; Regeln 10 und 15, F7)
// =============================================

describe("Nachtrag senden (Regel 10, F7)", () => {
  const tag = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

  /** Ein noch nicht gesendeter Eintrag der Aenderungsliste der IT. */
  function eintrag(art: string, titel: string, teil: Zeile = {}): Zeile {
    return {
      id: `aen-${naechsteId()}`,
      onboardingId: "onb-1",
      departmentKey: "IT",
      art,
      titel,
      erfasstAm: tage(-1),
      gesendetAm: null,
      ...teil,
    };
  }

  const nachtrag = (jetzt = JETZT) => aktion({ aktion: "nachtrag", departmentKey: "IT" }, HR, jetzt);
  const nachtragAudits = () => db.audits.filter((a) => a.action === "DEPARTMENT_NACHTRAG_SENT");
  const offeneEintraege = () => db.ausstattungAenderungen.filter((e) => e.gesendetAm == null);
  const uebersprungen = (body: Record<string, unknown>) =>
    (body.data as { uebersprungen: { departmentKey: string; grund: string }[] }).uebersprungen;

  beforeEach(() => {
    // Informiert vor fuenf Tagen — keine Sperrzeit.
    db.links = [link()];
    db.onboardingAufgaben = [
      aufgabe({ id: "i-konto", title: "Konto anlegen", relativeDueDays: -7, dueDate: tag("2026-09-24") }),
      aufgabe({
        id: "i-laptop",
        title: "Dienst-Laptop/PC bereitstellen",
        category: "Ausstattung & Zugänge",
        herkunft: "AUSSTATTUNG",
        dueDate: tag("2026-09-27"),
        createdAt: tage(-1),
      }),
    ];
  });

  it("nur „Entfällt“ und keine offene Aufgabe: geht trotzdem hinaus — gleicher Token, ohne Aufgabenliste", async () => {
    db.onboardingAufgaben = [
      aufgabe({
        id: "i-ipad",
        title: "Dienst-iPad (Lernmittel) bereitstellen",
        herkunft: "AUSSTATTUNG",
        dueDate: tag("2026-09-24"),
        isCompleted: true,
        completedAt: tage(-1),
        completedById: "u-hr",
        entfaelltAm: tage(-1),
      }),
    ];
    db.links = [link({ allTasksComplete: true, completedAt: tage(-1) })];
    db.ausstattungAenderungen = [eintrag("ENTFAELLT", "Dienst-iPad (Lernmittel) bereitstellen")];
    const sentAtVorher = linkVon("IT").sentAt;

    const r = await nachtrag();

    expect(r.status).toBe(201);
    expect(r.body.meldung).toBe("Nachtrag an IT-Abteilung gesendet. Der Link ist unverändert.");
    const [p] = mails("onboarding-department-assigned");
    expect(p).toMatchObject({
      nachtrag: "ja",
      nachtrag_liste: "Entfällt: Dienst-iPad (Lernmittel) bereitstellen",
      hat_offene_aufgaben: "",
      // Der Nachtrag nennt nur Offenes — keine Rueckfall-Liste mit Erledigtem.
      aufgabenliste: "",
      aufgabenliste_html: "",
      anzahl_aufgaben: 0,
      taskCount: 0,
      erneut_gesendet: "",
      neuer_link: "",
      link: `${BASIS}/onboarding-tasks/tok-it`,
    });
    // Gleicher Token, `sentAt` bleibt, `lastSentAt` neu, Gueltigkeit verlaengert.
    expect(linkVon("IT")).toMatchObject({
      token: "tok-it",
      sentAt: sentAtVorher,
      lastSentAt: JETZT,
      lastSendStatus: "SENT",
      expiresAt: tage(90),
    });
    expect(db.ausstattungAenderungen[0].gesendetAm).toEqual(JETZT);
    expect(nachtragAudits()).toEqual([
      expect.objectContaining({
        userId: "u-hr",
        onboardingId: "onb-1",
        processType: "ONBOARDING",
        details: {
          departmentKey: "IT",
          email: "it@example.org",
          status: "SENT",
          neuerLink: false,
          neu: 0,
          geaendert: 0,
          entfaellt: 1,
        },
      }),
    ]);
    // Im Protokoll stehen nur Anzahlen, nie Titel.
    expect(JSON.stringify(nachtragAudits())).not.toContain("Dienst-iPad");
  });

  it("fasst zusammen (NEU+ENTFAELLT faellt weg), nennt die offenen Aufgaben und markiert ALLE gelesenen Eintraege", async () => {
    db.ausstattungAenderungen = [
      eintrag("NEU", "Dienst-Laptop/PC bereitstellen", { erfasstAm: tage(-3) }),
      eintrag("GEAENDERT", "Zugang einrichten: WebUntis", { erfasstAm: tage(-2) }),
      eintrag("NEU", "Parkplatz bereitstellen", { erfasstAm: tage(-2) }),
      eintrag("ENTFAELLT", "Parkplatz bereitstellen", { erfasstAm: tage(-1) }),
    ];

    const r = await nachtrag();

    expect(r.status).toBe(201);
    const [p] = mails("onboarding-department-assigned");
    expect(p).toMatchObject({
      nachtrag: "ja",
      nachtrag_liste: "Neu: Dienst-Laptop/PC bereitstellen\nGeändert: Zugang einrichten: WebUntis",
      hat_offene_aufgaben: "ja",
      anzahl_aufgaben: 2,
    });
    expect(String(p.nachtrag_liste_html)).toContain("<strong>Neu:</strong> Dienst-Laptop/PC bereitstellen");
    expect(String(p.nachtrag_liste)).not.toContain("Parkplatz");
    // Auch die sich aufhebenden Eintraege gelten als gesendet — sonst stuenden
    // sie ewig offen und ein spaeteres NEU haette eine falsche Vorgeschichte.
    expect(offeneEintraege()).toEqual([]);
    expect(nachtragAudits()[0].details).toMatchObject({ neu: 1, geaendert: 1, entfaellt: 0 });
  });

  it("Sperrzeit: 409, keine Mail, die Eintraege bleiben offen", async () => {
    db.links = [link({ lastSentAt: new Date(JETZT.getTime() - 3 * 60_000) })];
    db.ausstattungAenderungen = [eintrag("NEU", "Dienst-Laptop/PC bereitstellen")];

    const r = await nachtrag();

    expect(r.status).toBe(409);
    expect(uebersprungen(r.body)).toEqual([expect.objectContaining({ departmentKey: "IT", grund: "SPERRZEIT" })]);
    expect(r.body.error).toBe(r.body.meldung);
    expect(String(r.body.meldung)).toMatch(/^Nachtrag senden nicht möglich\. IT-Abteilung: vor weniger als 10 Minuten/);
    expect(mockTrigger).not.toHaveBeenCalled();
    expect(offeneEintraege()).toHaveLength(1);
  });

  it.each([
    ["keine Eintraege", [] as string[]],
    ["nur sich aufhebende Eintraege (NEU+ENTFAELLT)", ["NEU", "ENTFAELLT"]],
    ["alles schon gesendet", ["GESENDET"]],
  ])("leere Liste (%s): 409 KEIN_NACHTRAG, keine Mail", async (_fall, arten) => {
    db.ausstattungAenderungen = arten.map((art, i) =>
      art === "GESENDET"
        ? eintrag("NEU", "Dienst-Laptop/PC bereitstellen", { gesendetAm: tage(-1) })
        : eintrag(art, "Parkplatz bereitstellen", { erfasstAm: tage(-3 + i) }),
    );

    const r = await nachtrag();

    expect(r.status).toBe(409);
    expect(uebersprungen(r.body)).toEqual([expect.objectContaining({ departmentKey: "IT", grund: "KEIN_NACHTRAG" })]);
    expect(r.body.meldung).toBe(
      "Nachtrag senden nicht möglich. IT-Abteilung: seit der letzten E-Mail nichts geändert – kein Nachtrag nötig.",
    );
    expect(mockTrigger).not.toHaveBeenCalled();
    expect(nachtragAudits()).toEqual([]);
  });

  it("nie zugestellter Link: 409 NICHT_INFORMIERT — „Erneut senden“ nimmt die Eintraege mit", async () => {
    db.links = [link({ sentAt: null, lastSendStatus: "FAILED", lastSendDetail: "Timeout" })];
    db.ausstattungAenderungen = [eintrag("NEU", "Dienst-Laptop/PC bereitstellen")];

    const r = await nachtrag();

    expect(r.status).toBe(409);
    expect(uebersprungen(r.body)).toEqual([expect.objectContaining({ grund: "NICHT_INFORMIERT" })]);
    expect(mockTrigger).not.toHaveBeenCalled();
  });

  it("markiert nur die gelesenen Eintraege — ein waehrend des Versands geschriebener bleibt offen", async () => {
    db.ausstattungAenderungen = [eintrag("NEU", "Dienst-Laptop/PC bereitstellen")];
    mailErgebnis = (_e, p) => {
      // Waehrend die Mail hinausgeht, schreibt jemand einen neuen Eintrag.
      db.ausstattungAenderungen.push(eintrag("NEU", "Parkplatz bereitstellen", { id: "aen-spaet", erfasstAm: JETZT }));
      return { status: "SENT", recipient: String(p.email) };
    };

    const r = await nachtrag();

    expect(r.status).toBe(201);
    expect(db.ausstattungAenderungen.find((e) => e.titel === "Dienst-Laptop/PC bereitstellen")?.gesendetAm).toEqual(JETZT);
    expect(offeneEintraege().map((e) => e.id)).toEqual(["aen-spaet"]);
  });

  it("Datenbankfehler beim Markieren: 201 mit Warnung „bitte nicht erneut senden“, nie 500", async () => {
    const stumm = jest.spyOn(console, "error").mockImplementation(() => {});
    db.ausstattungAenderungen = [eintrag("NEU", "Dienst-Laptop/PC bereitstellen")];
    (fakePrisma.onboardingAusstattungAenderung as { updateMany: jest.Mock }).updateMany.mockRejectedValueOnce(
      new Error("Verbindung verloren"),
    );

    const r = await nachtrag();

    expect(r.status).toBe(201);
    expect(String(r.body.hinweis)).toContain("bitte nicht erneut senden");
    expect(String(r.body.hinweis)).toContain("IT-Abteilung");
    expect(mails("onboarding-department-assigned")).toHaveLength(1);
    expect(offeneEintraege()).toHaveLength(1);
    stumm.mockRestore();
  });

  it("„Erneut senden“ nimmt die offenen Eintraege mit und markiert sie (F7)", async () => {
    db.ausstattungAenderungen = [eintrag("NEU", "Dienst-Laptop/PC bereitstellen")];

    const r = await aktion({ aktion: "erneut-senden", departmentKey: "IT" }, HR, JETZT);

    expect(r.status).toBe(201);
    const [p] = mails("onboarding-department-assigned");
    expect(p).toMatchObject({
      erneut_gesendet: "ja",
      nachtrag: "ja",
      nachtrag_liste: "Neu: Dienst-Laptop/PC bereitstellen",
      hat_offene_aufgaben: "ja",
    });
    expect(offeneEintraege()).toEqual([]);
    // Danach gibt es keinen Nachtrag mehr zu senden.
    const danach = await nachtrag(new Date(JETZT.getTime() + 11 * 60_000));
    expect(danach.status).toBe(409);
    expect(uebersprungen(danach.body)).toEqual([expect.objectContaining({ grund: "KEIN_NACHTRAG" })]);
  });

  it("scheitert die Mail, bleiben die Eintraege offen (F7: nur bei SENT)", async () => {
    db.ausstattungAenderungen = [eintrag("NEU", "Dienst-Laptop/PC bereitstellen")];
    mailErgebnis = () => ({ status: "FAILED", detail: "SMTP-Server nicht erreichbar" });

    const r = await nachtrag();

    expect(r.status).toBe(502);
    expect(offeneEintraege()).toHaveLength(1);
    // Der Link bleibt zugestellt (gleicher Token): `sentAt` steht weiter.
    expect(linkVon("IT").sentAt).toEqual(tage(-5));
    expect(linkVon("IT").token).toBe("tok-it");
  });

  it("Adresse seit der Information geaendert: Nachtrag mit neuem Link an die neue Adresse", async () => {
    db.konfigs = [konfig({ email: "it-neu@example.org" })];
    db.ausstattungAenderungen = [eintrag("NEU", "Dienst-Laptop/PC bereitstellen")];

    const r = await nachtrag();

    expect(r.status).toBe(201);
    expect(r.body.meldung).toBe(
      "Nachtrag mit neuem Link an IT-Abteilung (neue Adresse it-neu@example.org) gesendet. Der bisherige Link ist ungültig.",
    );
    const [p] = mails("onboarding-department-assigned");
    expect(p).toMatchObject({ email: "it-neu@example.org", neuer_link: "ja", nachtrag: "ja" });
    expect(linkVon("IT").token).not.toBe("tok-it");
    expect(db.audits.map((a) => a.action)).toEqual(
      expect.arrayContaining(["DEPARTMENT_LINK_RENEWED", "DEPARTMENT_NACHTRAG_SENT"]),
    );
    expect(nachtragAudits()[0].details).toMatchObject({ neuerLink: true });
    expect(offeneEintraege()).toEqual([]);
  });

  it("F22: eine nach dem letzten Versand angelegte, verstrichene Ausstattungsaufgabe wird angehoben und eilt", async () => {
    db.onboardingAufgaben.push(
      aufgabe({
        id: "i-schluessel",
        title: "Schlüssel ausgeben: Haupteingang",
        herkunft: "AUSSTATTUNG",
        dueDate: tag("2026-09-20"),
        createdAt: tage(-1),
      }),
    );
    db.ausstattungAenderungen = [eintrag("NEU", "Schlüssel ausgeben: Haupteingang")];

    const r = await nachtrag();

    expect(r.status).toBe(201);
    expect(db.onboardingAufgaben.find((a) => a.id === "i-schluessel")).toMatchObject({
      dueDate: tag("2026-09-22"),
      eilt: true,
    });
    const [p] = mails("onboarding-department-assigned");
    expect(String(p.aufgabenliste)).toContain("Schlüssel ausgeben: Haupteingang – fällig 22.09.2026 (eilt)");
  });

  it("Rolle ohne Bearbeitungsrecht: 403 — der Nachtrag ist eine HR-Aktion", async () => {
    db.ausstattungAenderungen = [eintrag("NEU", "Dienst-Laptop/PC bereitstellen")];
    const r = await aktion({ aktion: "nachtrag", departmentKey: "IT" }, { ...HR, role: "VORGESETZTER" });
    expect(r.status).toBe(403);
    expect(mockTrigger).not.toHaveBeenCalled();
  });
});

describe("Waechter und Nachtrag in der Uebersicht (Regeln 10 und 15)", () => {
  /** Ein offener Eintrag der Aenderungsliste der IT. */
  const offenerEintrag = (titel: string): Zeile => ({
    id: `aen-${naechsteId()}`,
    onboardingId: "onb-1",
    departmentKey: "IT",
    art: "NEU",
    titel,
    erfasstAm: tage(-1),
    gesendetAm: null,
  });

  beforeEach(() => {
    db.konfigs = [
      konfig(),
      konfig({ departmentKey: "FACILITY", departmentName: "Facility Management", email: "fm@example.org" }),
    ];
  });

  it("nicht informierte Stelle mit Frist in weniger als 7 Tagen: rot; mit Frist in 9 Tagen: nichts", async () => {
    db.onboardingAufgaben = [
      // Vertragsbeginn 01.10. − 7 = 24.09. (zwei Tage nach JETZT) — Vorschau-Faelligkeit.
      aufgabe({ assignee: "IT", relativeDueDays: -7 }),
      // 01.10. + 0 = neun Tage nach JETZT.
      aufgabe({ assignee: "FACILITY", relativeDueDays: 0 }),
    ];

    const u = await uebersicht();
    const it = u.abteilungen.zeilen.find((z) => z.departmentKey === "IT")!;
    const fm = u.abteilungen.zeilen.find((z) => z.departmentKey === "FACILITY")!;
    expect(it.anzeige).toMatchObject({
      hinweis: "Früheste Fälligkeit 24.09.2026 – Stelle noch nicht informiert",
      hinweisTon: "rot",
    });
    expect(fm.anzeige.hinweisTon).toBeUndefined();
    expect(fm.anzeige.hinweis).toBeNull();
    // Ohne Eintraege kein Nachtrag — die Felder stehen trotzdem da (Onboarding).
    expect(it.nachtrag).toBeNull();
    expect(it.aktionen).toMatchObject({ nachtrag: false, nachtragGesperrt: false });
  });

  it("informierte Stelle mit offenem Nachtrag: Knopf, Zeile „Nach der Information geändert“ und Waechter", async () => {
    db.onboardingAufgaben = [aufgabe({ assignee: "IT", relativeDueDays: -7, dueDate: new Date("2026-09-24T00:00:00.000Z") })];
    db.links = [link()];
    db.ausstattungAenderungen = [offenerEintrag("Dienst-Laptop/PC bereitstellen")];

    const it = (await uebersicht()).abteilungen.zeilen[0];

    expect(it.aktionen).toMatchObject({ nachtrag: true, nachtragGesperrt: false });
    expect(it.nachtrag).toEqual({
      anzahl: 1,
      text: "Nach der Information geändert: „Dienst-Laptop/PC bereitstellen“ hinzugefügt. Die Stelle erfährt davon erst mit „Nachtrag senden“.",
    });
    expect(it.anzeige).toMatchObject({
      hinweis: "Früheste Fälligkeit 24.09.2026 – Nachtrag noch nicht gesendet",
      hinweisTon: "rot",
    });

    // Ohne Eintrag: informiert, nichts offen — kein Waechter.
    db.ausstattungAenderungen = [];
    const ohne = (await uebersicht()).abteilungen.zeilen[0];
    expect(ohne.anzeige.hinweisTon).toBeUndefined();
    expect(ohne.nachtrag).toBeNull();
  });

  it("abgeschlossener Vorgang: weder Waechter noch Nachtrag", async () => {
    db.onboardingVorgaenge = [vorgang({ status: "COMPLETED" })];
    db.onboardingAufgaben = [aufgabe({ assignee: "IT", relativeDueDays: -7, dueDate: new Date("2026-09-24T00:00:00.000Z") })];
    db.links = [link()];
    db.ausstattungAenderungen = [offenerEintrag("Dienst-Laptop/PC bereitstellen")];

    const it = (await uebersicht()).abteilungen.zeilen[0];

    expect(it.anzeige.hinweisTon).toBeUndefined();
    expect(it.nachtrag).toBeNull();
    expect(it.aktionen).toMatchObject({ nachtrag: false, nachtragGesperrt: false });
  });

  it("vor der ersten Information fragt die Uebersicht die Aenderungsliste nicht ab", async () => {
    const findMany = (fakePrisma.onboardingAusstattungAenderung as { findMany: jest.Mock }).findMany;
    findMany.mockClear();
    db.onboardingAufgaben = [aufgabe({ assignee: "IT", relativeDueDays: -7 })];

    await uebersicht();

    expect(findMany).not.toHaveBeenCalled();
  });
});

// =============================================
// Absage an die Stellen (Paket A3, S19; E-A20, F13, F16, F17)
// =============================================

describe("Absage nach EXPIRED (E-A20)", () => {
  const EVENT = "onboarding-department-abgesagt";
  const absage = (jetzt = JETZT, session: SessionPayload = HR) => aktion({ aktion: "absage" }, session, jetzt);
  const absageAudits = () => db.audits.filter((a) => a.action === "DEPARTMENT_ABSAGE_SENT");
  const uebersprungen = (body: Record<string, unknown>) =>
    (body.data as { uebersprungen: { departmentKey: string; grund: string }[] }).uebersprungen;

  beforeEach(() => {
    db.onboardingVorgaenge = [vorgang({ status: "EXPIRED" })];
    // Die IT hat ihre Adresse seit der Information geaendert — die Absage geht
    // trotzdem an die Adresse, die informiert wurde (F16).
    db.konfigs = [
      konfig({ email: "it-neu@example.org" }),
      konfig({ departmentKey: "FACILITY", departmentName: "Facility Management", email: "fm@example.org" }),
      konfig({ departmentKey: "VERWALTUNG", departmentName: "Verwaltung / Sekretariat", email: "vw@example.org" }),
    ];
    db.links = [
      link(),
      // Nach einem gescheiterten „Link erneuern“: sentAt null, aber die Stelle hat eine aeltere Mail.
      link({
        departmentKey: "FACILITY",
        departmentName: "Facility Management",
        email: "fm@example.org",
        token: "tok-fm",
        sentAt: null,
        lastSentAt: tage(-6),
        lastSendStatus: "FAILED",
      }),
      // Nie zugestellt: Die Stelle hat nichts bekommen, also auch keine Absage.
      link({
        departmentKey: "VERWALTUNG",
        departmentName: "Verwaltung / Sekretariat",
        email: "vw@example.org",
        token: "tok-vw",
        sentAt: null,
        lastSentAt: null,
        lastSendStatus: "FAILED",
      }),
    ];
    db.onboardingAufgaben = [
      aufgabe({ id: "i-konto", title: "Konto anlegen", isCompleted: true, completedAt: tage(-3), relativeDueDays: -7 }),
      aufgabe({
        id: "i-laptop",
        title: "Dienst-Laptop/PC bereitstellen",
        category: "Ausstattung & Zugänge",
        herkunft: "AUSSTATTUNG",
        isCompleted: true,
        completedAt: tage(-2),
      }),
      // Entfallen (F2: formal erledigt) — gehoert NICHT in die Absage.
      aufgabe({
        id: "i-ipad",
        title: "Dienst-iPad (Lernmittel) bereitstellen",
        category: "Ausstattung & Zugänge",
        herkunft: "AUSSTATTUNG",
        isCompleted: true,
        completedAt: tage(-1),
        completedById: "u-hr",
        entfaelltAm: tage(-1),
      }),
      aufgabe({ id: "i-wlan", title: "WLAN-Zugang einrichten" }),
      aufgabe({ id: "i-schluessel", title: "Schlüssel ausgeben", assignee: "FACILITY" }),
      aufgabe({ id: "i-fach", title: "Fach im Lehrerzimmer", assignee: "VERWALTUNG" }),
    ];
  });

  it("nur bei EXPIRED — laufend und abgeschlossen: 409 NICHT_ABGESAGT, keine Mail", async () => {
    for (const status of ["SUPERVISOR_SUBMITTED", "REVIEWED", "COMPLETED"]) {
      db.onboardingVorgaenge = [vorgang({ status })];
      const r = await absage();
      expect({ status, antwort: r }).toEqual({
        status,
        antwort: { status: 409, body: { error: MELDUNGEN.ABSAGE_NUR_ABGELAUFEN, grund: "NICHT_ABGESAGT" } },
      });
    }
    expect(mockTrigger).not.toHaveBeenCalled();
    expect(absageAudits()).toEqual([]);
  });

  it("nur informierte Stellen, je eine Mail an `link.email` — nie an die heute aufgeloeste Adresse", async () => {
    const r = await absage();

    expect(r.status).toBe(201);
    expect(r.body.meldung).toBe("Absage an 2 Stellen gesendet: IT-Abteilung, Facility Management.");
    const p = mails(EVENT);
    expect(p.map((x) => [x.departmentKey, x.email])).toEqual([
      ["IT", "it@example.org"],
      ["FACILITY", "fm@example.org"],
    ]);
    // Keine andere Mail — und nichts an die nie informierte Verwaltung.
    expect(mockTrigger.mock.calls.map((c) => c[0])).toEqual([EVENT, EVENT]);
  });

  it("Adresswechsel, Mail an die neue Adresse gescheitert: die Absage geht an die zuletzt zugestellte (F16)", async () => {
    // Laufender Vorgang: IT wurde an it@example.org informiert; HR schickt nach
    // dem Adresswechsel (Konfig: it-neu@…) „Erneut senden“ — die Mail scheitert.
    db.onboardingVorgaenge = [vorgang()];
    Object.assign(linkVon("IT"), { zugestelltAn: "it@example.org" });
    mailErgebnis = (_e, p) =>
      p.email === "it-neu@example.org"
        ? { status: "FAILED", detail: "SMTP-Server nicht erreichbar" }
        : { status: "SENT", recipient: String(p.email) };
    const erneut = await aktion({ aktion: "erneut-senden", departmentKey: "IT" });
    expect(erneut.status).not.toBe(201);
    // `zuweisungSenden` schrieb die neue Adresse VOR dem Versand an den Link.
    expect(linkVon("IT")).toMatchObject({ email: "it-neu@example.org", zugestelltAn: "it@example.org" });

    // Danach bricht HR ab und sagt den Stellen ab.
    db.onboardingVorgaenge = [vorgang({ status: "EXPIRED" })];
    mockTrigger.mockClear();
    mailErgebnis = (_e, p) => ({ status: "SENT", recipient: String(p.email) });
    const r = await absage(tage(1));

    expect(r.status).toBe(201);
    expect(mails(EVENT).map((x) => [x.departmentKey, x.email])).toEqual([
      ["IT", "it@example.org"],
      ["FACILITY", "fm@example.org"],
    ]);
    // Bericht und Protokoll nennen dieselbe Adresse; am Link bleibt alles, wie es war.
    expect((r.body.data as { versendet: { departmentKey: string; email: string }[] }).versendet).toEqual([
      expect.objectContaining({ departmentKey: "IT", email: "it@example.org" }),
      expect.objectContaining({ departmentKey: "FACILITY", email: "fm@example.org" }),
    ]);
    expect((absageAudits()[0].details as { versendet: Zeile[] }).versendet[0]).toMatchObject({
      departmentKey: "IT",
      email: "it@example.org",
    });
    expect(linkVon("IT").email).toBe("it-neu@example.org");
  });

  it("Payload: ohne Link-Felder, mit den erledigten Aufgaben aus Vorlage und Ausstattung — ohne Entfallene", async () => {
    await absage();
    const [it, fm] = mails(EVENT);

    for (const feld of ["link", "magicLink", "token", "expiresAt", "aufgabenliste", "aufgabenliste_html", "taskCount"]) {
      expect({ feld, drin: feld in it }).toEqual({ feld, drin: false });
    }
    expect(it).toMatchObject({
      departmentKey: "IT",
      departmentName: "IT-Abteilung",
      abteilung: "IT-Abteilung",
      mitarbeiter_name: "Anna Beispiel",
      displayId: "ONB-2026-031",
      vertragsbeginn: "01.10.2026",
      erledigte_liste: "- Konto anlegen\n- Dienst-Laptop/PC bereitstellen",
      anzahl_erledigt: 2,
      hat_erledigte: "ja",
      ist_fuehrungskraft: "",
    });
    expect(String(it.erledigte_liste_html)).toContain("<li style=\"margin:0 0 4px;\">Dienst-Laptop/PC bereitstellen</li>");
    expect(String(it.erledigte_liste)).not.toContain("iPad");
    // Datensparsamkeit: die private Adresse der Person steht nirgends.
    expect(JSON.stringify([it, fm])).not.toContain("anna.privat@example.org");
    // Facility hat noch nichts erledigt: Merker leer, Liste leer.
    expect(fm).toMatchObject({ erledigte_liste: "", erledigte_liste_html: "", anzahl_erledigt: 0, hat_erledigte: "" });
  });

  // ---------------------------------------------
  // A4, S27 (G10): Die Absage nennt die Ausgaben der Stelle.
  // ---------------------------------------------

  /** Ein Stueck, das eine Stelle laut Portal ausgegeben hat (Fake-DB-Zeile). */
  function ausgabe(teil: Zeile): Zeile {
    return neueAusgabe({
      onboardingId: "onb-1",
      checklistItemId: "i-laptop",
      organizationId: "org-1",
      departmentKey: "IT",
      bezeichnung: "Dienst-Laptop/PC",
      kennungLabel: "Inventarnummer",
      kennung: "FES-NB-0412",
      rueckgabeKategorie: "IT_HARDWARE",
      beiAustritt: "RUECKGABE",
      quelle: "LINK",
      uebergebenAm: new Date("2026-09-18T00:00:00.000Z"),
      ...teil,
    });
  }

  it("mit Ausgaben: jede Stelle liest nur ihre eigenen, noch ausgegebenen Stücke samt Kennung", async () => {
    db.ausgaben = [
      ausgabe({}),
      // Zugang (SPERREN) ohne Kennung: „eingerichtet“, frueher uebergeben → zuerst.
      ausgabe({
        bezeichnung: "Zugänge: Dienst-E-Mail",
        kennung: null,
        kennungLabel: null,
        rueckgabeKategorie: null,
        beiAustritt: "SPERREN",
        uebergebenAm: new Date("2026-09-16T00:00:00.000Z"),
      }),
      // Schon zurueckgenommen — gehoert nicht in die Absage.
      ausgabe({ kennung: "FES-NB-0001", zustand: "ZURUECK" }),
      // Bestand aus einem abgeschlossenen Austritt (VERBLEIBT) ist noch ausgegeben.
      ausgabe({ bezeichnung: "Dienst-iPad (Lernmittel)", kennung: "FES-IPAD-7", zustand: "VERBLEIBT", quelle: "HR" }),
      // Die Gebaeudewirtschaft: ein Schluessel mit „&“ (maskiert im HTML).
      ausgabe({
        checklistItemId: "i-schluessel",
        departmentKey: "FACILITY",
        bezeichnung: "Schlüssel: Haupteingang",
        kennungLabel: "Schlüsselnummer",
        kennung: "S-12 & 13",
        rueckgabeKategorie: "SCHLUESSEL",
      }),
      // Die nie informierte Verwaltung bekommt keine Absage — auch nicht ihrer Stuecke wegen.
      ausgabe({ departmentKey: "VERWALTUNG", bezeichnung: "Kopierkarte", kennung: "K-1" }),
      // Ein anderer Vorgang: nie.
      ausgabe({ onboardingId: "onb-2", kennung: "FREMD-1" }),
    ];

    const r = await absage();

    expect(r.status).toBe(201);
    const [it, fm] = mails(EVENT);
    expect(it).toMatchObject({
      departmentKey: "IT",
      ausgaben_liste:
        "Zugänge: Dienst-E-Mail · eingerichtet 16.09.2026\n" +
        "Dienst-Laptop/PC · FES-NB-0412 · übergeben 18.09.2026\n" +
        "Dienst-iPad (Lernmittel) · FES-IPAD-7 · übergeben 18.09.2026",
      ausgaben_liste_html:
        "Zugänge: Dienst-E-Mail · eingerichtet 16.09.2026<br>" +
        "Dienst-Laptop/PC · FES-NB-0412 · übergeben 18.09.2026<br>" +
        "Dienst-iPad (Lernmittel) · FES-IPAD-7 · übergeben 18.09.2026",
      hat_ausgaben: "ja",
    });
    expect(fm).toMatchObject({
      departmentKey: "FACILITY",
      ausgaben_liste: "Schlüssel: Haupteingang · S-12 & 13 · übergeben 18.09.2026",
      ausgaben_liste_html: "Schlüssel: Haupteingang · S-12 &amp; 13 · übergeben 18.09.2026",
      hat_ausgaben: "ja",
    });
    // Nur die eigenen Stuecke: keine fremde Kennung, kein zurueckgenommenes Stueck.
    expect(JSON.stringify(it)).not.toMatch(/S-12|FES-NB-0001|K-1|FREMD-1/);
    expect(JSON.stringify(fm)).not.toMatch(/FES-NB|FES-IPAD|K-1|FREMD-1/);
    // Die Absage aendert an den Ausgaben nichts (die Frist setzt der Statuswechsel, G10).
    expect(db.ausgaben.map((a) => a.zustand)).toEqual([
      "AUSGEGEBEN",
      "AUSGEGEBEN",
      "ZURUECK",
      "VERBLEIBT",
      "AUSGEGEBEN",
      "AUSGEGEBEN",
      "AUSGEGEBEN",
    ]);
    // Kein Protokolleintrag mit Kennungen.
    expect(JSON.stringify(absageAudits())).not.toMatch(/FES-NB|S-12/);
  });

  it("ohne Ausgaben: die drei Felder stehen trotzdem da, leer", async () => {
    await absage();
    for (const p of mails(EVENT)) {
      expect(p).toMatchObject({ ausgaben_liste: "", ausgaben_liste_html: "", hat_ausgaben: "" });
    }
  });

  it("Positivliste der Payload: nichts ausser diesen Schlüsseln — ohne Link-Felder, ohne Token", async () => {
    db.ausgaben = [ausgabe({})];
    await absage();

    const erlaubt = new Set([
      "onboardingId", "displayId", "vorname", "nachname", "mitarbeiter_name", "employeeName",
      "organization", "organizationName", "einrichtung", "mandantNumber", "contractStartDate", "vertragsbeginn",
      "arbeitsort", "departmentKey", "departmentName", "abteilung", "email",
      "erledigte_liste", "erledigte_liste_html", "anzahl_erledigt", "hat_erledigte",
      // A4, S27 (G10): die noch ausgegebenen Stuecke der Stelle.
      "ausgaben_liste", "ausgaben_liste_html", "hat_ausgaben",
      "ist_fuehrungskraft",
    ]);
    expect(mails(EVENT)).toHaveLength(2);
    for (const p of mails(EVENT)) {
      expect(Object.keys(p).filter((k) => !erlaubt.has(k))).toEqual([]);
      expect(JSON.stringify(p)).not.toContain("anna.privat@example.org");
    }
  });

  it("der zweite Klick fragt die Ausgaben nicht mehr ab", async () => {
    expect((await absage()).status).toBe(201);
    const findMany = (fakePrisma.ausgabe as { findMany: jest.Mock }).findMany;
    findMany.mockClear();

    const zweiter = await absage(new Date(JETZT.getTime() + 60_000));

    expect(zweiter.status).toBe(409);
    expect(findMany).not.toHaveBeenCalled();
  });

  it("`abgesagtAm` nur bei SENT — FAILED laesst einen neuen Versuch zu, der nur die fehlende Stelle anschreibt", async () => {
    mailErgebnis = (_e, p) =>
      p.email === "fm@example.org"
        ? { status: "FAILED", detail: "SMTP-Server nicht erreichbar" }
        : { status: "SENT", recipient: String(p.email) };

    const r = await absage();

    expect(r.status).toBe(201);
    expect(r.body.hinweis).toBe(
      "Absage nicht zugestellt: Facility Management (Versand fehlgeschlagen: SMTP-Server nicht erreichbar).",
    );
    expect(linkVon("IT").abgesagtAm).toEqual(JETZT);
    expect(linkVon("FACILITY").abgesagtAm ?? null).toBeNull();

    // Der naechste Klick schickt nur noch an Facility.
    mockTrigger.mockClear();
    mailErgebnis = (_e, p) => ({ status: "SENT", recipient: String(p.email) });
    const danach = await absage(tage(1));
    expect(danach.status).toBe(201);
    expect(mails(EVENT).map((x) => x.departmentKey)).toEqual(["FACILITY"]);
    expect(uebersprungen(danach.body)).toEqual([expect.objectContaining({ departmentKey: "IT", grund: "BEREITS_ABGESAGT" })]);
    expect(linkVon("IT").abgesagtAm).toEqual(JETZT);
    expect(linkVon("FACILITY").abgesagtAm).toEqual(tage(1));
  });

  it("SKIPPED (Vorlage aus) setzt keinen Merker — auch mit aktivem Webhook keine Zustellung", async () => {
    db.webhooks = [{ event: EVENT, isActive: true }];
    mailErgebnis = () => ({ status: "SKIPPED", detail: "E-Mail-Vorlage ist deaktiviert" });

    const r = await absage();

    expect(r.status).toBe(409);
    expect(linkVon("IT").abgesagtAm ?? null).toBeNull();
    expect(linkVon("FACILITY").abgesagtAm ?? null).toBeNull();
    expect(uebersprungen(r.body).map((e) => e.grund)).toEqual(["MAIL_NICHT_VERSENDET", "MAIL_NICHT_VERSENDET"]);
  });

  it("zweiter Klick: 409 BEREITS_ABGESAGT je Stelle, keine zweite Mail", async () => {
    expect((await absage()).status).toBe(201);
    mockTrigger.mockClear();

    const zweiter = await absage(new Date(JETZT.getTime() + 60_000));

    expect(zweiter.status).toBe(409);
    expect(zweiter.body.meldung).toBe(MELDUNGEN.ABSAGE_BEREITS_GESENDET);
    expect(uebersprungen(zweiter.body)).toEqual([
      expect.objectContaining({ departmentKey: "IT", grund: "BEREITS_ABGESAGT" }),
      expect.objectContaining({ departmentKey: "FACILITY", grund: "BEREITS_ABGESAGT" }),
    ]);
    expect(mockTrigger).not.toHaveBeenCalled();
    // Ein Klick ohne Versuch schreibt kein Protokoll.
    expect(absageAudits()).toHaveLength(1);
  });

  it("keine informierte Stelle: 409 mit eigener Meldung, kein Protokoll", async () => {
    db.links = db.links.filter((l) => l.departmentKey === "VERWALTUNG");
    const r = await absage();
    expect(r.status).toBe(409);
    expect(r.body.meldung).toBe(MELDUNGEN.ABSAGE_NIEMAND_INFORMIERT);
    expect(mockTrigger).not.toHaveBeenCalled();
    expect(absageAudits()).toEqual([]);
  });

  it("Protokoll DEPARTMENT_ABSAGE_SENT mit Stelle, Adresse, Status und Anzahl — nie Titeln", async () => {
    await absage();
    const [audit] = absageAudits();
    expect(audit).toMatchObject({ userId: "u-hr", onboardingId: "onb-1", processType: "ONBOARDING" });
    expect(audit.details).toEqual({
      versendet: [
        { departmentKey: "IT", email: "it@example.org", status: "SENT", erledigt: 2 },
        { departmentKey: "FACILITY", email: "fm@example.org", status: "SENT", erledigt: 0 },
      ],
      uebersprungen: [],
    });
    expect(JSON.stringify(audit.details)).not.toMatch(/Konto|Laptop/);
  });

  it("laesst Token, Link, Aufgaben und Faelligkeiten unberuehrt und holt nichts nach", async () => {
    const vorher = structuredClone(db.onboardingAufgaben);
    await absage();
    expect(linkVon("IT")).toMatchObject({ token: "tok-it", sentAt: tage(-5), lastSentAt: tage(-5), lastSendStatus: "SENT" });
    expect(linkVon("FACILITY")).toMatchObject({ token: "tok-fm", sentAt: null, lastSendStatus: "FAILED" });
    expect(db.onboardingAufgaben).toEqual(vorher);
    expect(db.audits.map((a) => a.action)).toEqual(["DEPARTMENT_ABSAGE_SENT"]);
  });

  it("Rolle ohne Bearbeitungsrecht: 403", async () => {
    expect((await absage(JETZT, { ...HR, role: "VORGESETZTER" })).status).toBe(403);
    expect(mockTrigger).not.toHaveBeenCalled();
  });

  it("Uebersicht: `absage` nur bei EXPIRED mit informierter Stelle; nach dem Versand „gesendet“", async () => {
    const vorher = (await uebersicht()).abteilungen.absage;
    expect(vorher).toEqual({ moeglich: true, stellen: ["IT-Abteilung", "Facility Management"], gesendetAm: null });

    await absage();
    const danach = (await uebersicht()).abteilungen.absage;
    expect(danach).toEqual({ moeglich: false, stellen: [], gesendetAm: JETZT.toISOString() });

    // Laufender Vorgang: kein Schluessel (die bestehenden toEqual-Vergleiche bleiben gueltig).
    db.onboardingVorgaenge = [vorgang()];
    expect((await uebersicht()).abteilungen).not.toHaveProperty("absage");
    // Abgelaufen, aber nie jemand informiert: ebenfalls kein Block.
    db.onboardingVorgaenge = [vorgang({ status: "EXPIRED" })];
    db.links = db.links.filter((l) => l.departmentKey === "VERWALTUNG");
    expect((await uebersicht()).abteilungen).not.toHaveProperty("absage");
  });
});
