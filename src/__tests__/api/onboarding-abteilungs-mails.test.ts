/**
 * Tests: Onboarding-Abteilungsmails — vom Aufrufer bis zum gerenderten Text
 * (Paket 5)
 *
 * Gegenstueck zu src/__tests__/api/offboarding-mails.test.ts. Geprueft wird
 * dasselbe Zusammenspiel: Der ECHTE Aufrufer laeuft (Dienstfunktionen auf der
 * kleinen In-Memory-Datenbank, src/__tests__/hilfen/abteilungs-fake-db.ts),
 * der Payload wird am Dispatcher abgegriffen und durch den ECHTEN Mailer mit
 * der ECHTEN Standardvorlage gerendert.
 *
 * Warum nicht die Vorlagen allein pruefen: Der Fehler, den Paket 1b aufdeckte,
 * lag nie in EINER Datei — Vorlage, Aufrufer und extractVariables benutzten je
 * verschiedene Feldnamen, und jede Stelle sah fuer sich richtig aus. Leer
 * blieb die Mail erst im Zusammenspiel.
 *
 * Zusaetzlich zu Paket 1b haengt hier die DATENSPARSAMKEIT mit dran:
 *   - Die private Adresse der Person (OnboardingProcess.email) darf in keinem
 *     Payload und in keiner Mail auftauchen.
 *   - Stellenbezeichnung, Betriebsstaette und die Adresse der Fuehrungskraft
 *     stehen NUR in der Zuweisungsmail und NUR bei Schluesseln, denen
 *     ONBOARDING_ZUSATZFELDER sie erlaubt (Buchhaltung bekommt keine).
 *   - {{mitarbeiter_name}} ist nie leer und nie eine Adresse.
 */

type MailErgebnis = { status: "SENT" | "FAILED" | "SKIPPED"; detail?: string; recipient?: string };
const mockTriggerWebhooks = jest.fn();

jest.mock("@/lib/db", () => ({
  prisma: jest.requireActual("../hilfen/abteilungs-fake-db").fakePrisma,
}));
jest.mock("@/lib/webhooks", () => ({ triggerWebhooks: mockTriggerWebhooks }));

import { db, dbLeeren, naechsteId, neuerLink, type Zeile } from "../hilfen/abteilungs-fake-db";
import { renderEventEmail } from "@/lib/mailer";
import { DEFAULT_EMAIL_TEMPLATES } from "@/lib/default-email-templates";
import {
  EVENT_CATALOG,
  ONBOARDING_ABTEILUNG_BEISPIEL_AUFGABEN,
  ONBOARDING_ABTEILUNG_BEISPIEL_KOMMENTAR,
} from "@/lib/events";
import { onboardingAbteilungsMailFelder } from "@/lib/onboarding-abteilung-mail";
import {
  aufgabenlisteMailFelder,
  kommentarMailFelder,
  stufeBerechnen,
  stufenMailFelder,
  zusatzWerte,
} from "@/lib/abteilungsaufgaben";
import {
  onboardingAbteilungsAktionAusfuehren,
  onboardingErinnerungenSenden,
} from "@/lib/abteilungsaufgaben-onboarding";
import {
  oeffentlicheOnboardingAufgabeAendern,
  onboardingAufgabeImPortalAendern,
} from "@/lib/abteilungsaufgaben-uebergaenge";
import type { SessionPayload } from "@/lib/permissions";

// =============================================
// Testdaten — die Geschichte aus dem Katalog (src/lib/events.ts)
// =============================================

const BASIS = "https://hr.example.org";

const VORGANG_ID = "00000000-0000-0000-0000-000000000005";
const ORG = { name: "FES Minden", mandantNumber: "01" };
const ORG_ID = "org-1";

/** Die private Adresse der Person — darf NIRGENDS hinausgehen. */
const PRIVATE_ADRESSE = "anna.privat@example.org";

const T_INFORMIERT = new Date("2026-09-22T08:00:00.000Z");
const T_ERINNERT = new Date("2026-09-26T06:00:00.000Z");
const T_ERLEDIGT = new Date("2026-09-28T10:14:00.000Z");
const T_FERTIG = new Date("2026-10-01T09:30:00.000Z");
const MINUTE = 60_000;

const [KONTO, NOTEBOOK, WLAN] = ONBOARDING_ABTEILUNG_BEISPIEL_AUFGABEN;

const SESSION: SessionPayload = {
  userId: "u-1",
  email: "admin@example.org",
  role: "SUPER_ADMIN",
  firstName: "Erika",
  lastName: "Sachbearbeiter",
};

/** Ein Onboarding-Vorgang, wie ihn Dienst und Uebergaenge lesen. */
function vorgang(teil: Zeile = {}): Zeile {
  return {
    id: VORGANG_ID,
    displayId: "ONB-2026-031",
    organizationId: ORG_ID,
    status: "SUPERVISOR_SUBMITTED",
    firstName: "Anna",
    lastName: "Beispiel",
    // Steht am Vorgang, gehoert aber in keine Abteilungsmail.
    email: PRIVATE_ADRESSE,
    supervisorEmail: "a.leitung@example.org",
    supervisorSubmittedAt: new Date("2026-09-20T09:00:00.000Z"),
    personalData: { firstName: "Anna", lastName: "Beispiel" },
    supervisorData: {
      isComplete: true,
      vertragsbeginn: new Date("2026-10-01T00:00:00.000Z"),
      stellenbeschreibung: "Lehrkraft Sek. I",
      betriebsstaette: "Minden, Hauptstandort",
    },
    organization: ORG,
    ...teil,
  };
}

function aufgabe(teil: Zeile): Zeile {
  return {
    id: `i-${naechsteId()}`,
    onboardingId: VORGANG_ID,
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

/** Die IT-Aufgaben aus dem Katalog-Beispiel als Datenbankzeilen. */
function beispielAufgaben(erledigt: string[] = []): Zeile[] {
  return ONBOARDING_ABTEILUNG_BEISPIEL_AUFGABEN.map((a, i) =>
    aufgabe({
      id: a.id,
      title: a.title,
      description: a.description,
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

/** Der Link der IT, wie ihn "Abteilungen informieren" am 22.09. hinterlassen hat. */
function itLink(teil: Zeile = {}): Zeile {
  return neuerLink({
    onboardingId: VORGANG_ID,
    departmentKey: "IT",
    departmentName: "IT-Abteilung",
    email: "it@example.org",
    token: "tok-it",
    expiresAt: new Date("2026-12-21T08:00:00.000Z"),
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
  return onboardingAbteilungsAktionAusfuehren({ onboardingId: VORGANG_ID, rohBody, session: SESSION, jetzt });
}

function beispiel(event: string): Record<string, unknown> {
  const def = EVENT_CATALOG.find((d) => d.event === event);
  if (!def) throw new Error(`Kein Katalog-Eintrag fuer ${event}`);
  return def.samplePayload;
}

/** Der Link haengt an einem zufaelligen Token — alles andere muss gleich sein. */
function ohneLinkFelder(payload: Record<string, unknown>): Record<string, unknown> {
  const kopie = { ...payload };
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
  const { rendered } = renderEventEmail({ ...standardVorlage(event), ...LEERE_EMPFAENGER }, event, payload, {
    overrideTo: "hr@example.org",
  });
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

/** Die Grundpruefung, die fuer jede Onboarding-Abteilungsmail gilt. */
function pruefeVollstaendig(event: string, payload: Record<string, unknown>) {
  expect({ event, leer: leerePlatzhalter(event, payload) }).toEqual({ event, leer: [] });
  const mail = rendere(event, payload);
  for (const teil of [mail.subject, mail.html, mail.text ?? ""]) {
    expect(teil).not.toMatch(/\{\{/);
    expect(teil).not.toContain("Invalid Date");
    expect(teil).not.toContain("undefined");
    // Datensparsamkeit: die private Adresse steht in keiner Abteilungsmail.
    expect(teil).not.toContain(PRIVATE_ADRESSE);
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

const alteUmgebung = { ...process.env };

beforeEach(() => {
  jest.clearAllMocks();
  dbLeeren();
  process.env.NEXT_PUBLIC_APP_URL = BASIS;
  // Wie sendEventEmail bei Erfolg: SENT an die Adresse aus dem Payload.
  mockTriggerWebhooks.mockImplementation(
    async (_event: string, payload: Record<string, unknown>): Promise<MailErgebnis> => ({
      status: "SENT",
      recipient: String(payload.email ?? "hr@example.org"),
    }),
  );
});

afterAll(() => {
  process.env = alteUmgebung;
});

// =============================================
// onboarding-department-assigned
// =============================================

describe("onboarding-department-assigned (onboardingAbteilungsAktionAusfuehren)", () => {
  beforeEach(() => {
    db.onboardingVorgaenge = [vorgang()];
    db.konfigs = [konfig()];
    db.onboardingAufgaben = [
      ...beispielAufgaben(),
      // Personalabteilung arbeitet im Portal und bekommt keinen Link.
      aufgabe({ title: "Personalakte anlegen", assignee: "HR" }),
    ];
  });

  it("Erstmail: genau der Beispiel-Payload aus dem Katalog; Liste, Hinweis, Gültigkeit und Link stimmen", async () => {
    const r = await aktion(undefined, T_INFORMIERT);
    expect(r.status).toBe(201);

    const payload = payloadVon("onboarding-department-assigned");
    const token = linkVon("IT").token as string;
    expect(payload.magicLink).toBe(`${BASIS}/onboarding-tasks/${token}`);
    expect(payload.link).toBe(`${BASIS}/onboarding-tasks/${token}`);
    expect(ohneLinkFelder(payload)).toEqual(ohneLinkFelder(beispiel("onboarding-department-assigned")));
    // Datensparsamkeit: kein Token im Payload (anders als im Offboarding),
    // keine private Adresse.
    expect(payload).not.toHaveProperty("token");
    expect(JSON.stringify(payload)).not.toContain(PRIVATE_ADRESSE);

    const mail = pruefeVollstaendig("onboarding-department-assigned", payload);
    expect(mail.subject).toBe("Onboarding-Aufgaben für IT-Abteilung: Dienstbeginn 01.10.2026 (FES Minden)");
    expect(mail.html).toContain(`href="${BASIS}/onboarding-tasks/${token}"`);
    expect(mail.html).not.toContain("/offboarding-tasks/");
    // Liste im HTML maskiert, der Hinweis als graue zweite Zeile.
    expect(mail.html).toContain(
      '<li style="margin:0 0 4px;">Benutzerkonto und E-Mail-Adresse anlegen – fällig 24.09.2026' +
        '<br><span style="color:#6b7280;font-size:13px;">Konto in der Schulverwaltung und in Microsoft 365 anlegen</span></li>',
    );
    expect(mail.html).toContain('<li style="margin:0 0 4px;">Notebook &amp; Zubehör bereitstellen – fällig 01.10.2026</li>');
    expect(mail.html).not.toContain("Notebook & Zubehör");
    // Klartext: Hinweis eingerueckt unter dem Titel.
    expect(mail.text).toContain(
      [
        "- Benutzerkonto und E-Mail-Adresse anlegen – fällig 24.09.2026",
        "  Konto in der Schulverwaltung und in Microsoft 365 anlegen",
        "- Notebook & Zubehör bereitstellen – fällig 01.10.2026",
        "- WLAN-Zugang einrichten",
      ].join("\n"),
    );
    for (const teil of [mail.html, mail.text ?? ""]) {
      expect(teil).toContain("Anna Beispiel");
      // Dienstbeginn, nie Austritt.
      expect(teil).not.toMatch(/Austritt|letzter Arbeitstag/i);
      // Erstmail: keiner der Bedingungssaetze.
      expect(teil).not.toContain("erneut gesendet");
      expect(teil).not.toContain("Dies ist ein neuer Link");
    }
    expect(mail.html).toContain("ist bis 21.12.2026 gültig");
    expect(mail.text).toContain("Gültig bis 21.12.2026");
    expect(mail.text).toContain("Vertragsbeginn: 01.10.2026");
    expect(mail.text).toContain("Vorgangsnummer: ONB-2026-031");
    expect(mail.text).toContain(`Aufgaben öffnen: ${BASIS}/onboarding-tasks/${token}`);
  });

  it("Infobox: IT sieht Stellenbezeichnung, Betriebsstätte und Ansprechpartner", async () => {
    await aktion(undefined, T_INFORMIERT);
    const mail = pruefeVollstaendig(
      "onboarding-department-assigned",
      payloadVon("onboarding-department-assigned"),
    );
    for (const teil of [mail.html, mail.text ?? ""]) {
      expect(teil).toContain("Stellenbezeichnung");
      expect(teil).toContain("Lehrkraft Sek. I");
      expect(teil).toContain("Betriebsstätte");
      expect(teil).toContain("Minden, Hauptstandort");
      expect(teil).toContain("Ansprechpartner (Führungskraft)");
      expect(teil).toContain("a.leitung@example.org");
    }
  });

  it("Buchhaltung bekommt KEINE Zusatzangaben — weder im Payload noch in der Mail", async () => {
    db.konfigs.push(konfig({ departmentKey: "BUCHHALTUNG", departmentName: "Buchhaltung", email: "buha@example.org" }));
    db.onboardingAufgaben.push(
      aufgabe({ title: "Bezüge anlegen", assignee: "BUCHHALTUNG", dueDate: new Date("2026-09-25T00:00:00.000Z") }),
    );

    await aktion(undefined, T_INFORMIERT);
    const buha = payloadsVon("onboarding-department-assigned").find((p) => p.departmentKey === "BUCHHALTUNG")!;
    // Nicht erlaubte Felder fehlen GANZ (auch nicht als "").
    expect(buha).not.toHaveProperty("stellenbezeichnung");
    expect(buha).not.toHaveProperty("betriebsstaette");
    expect(buha).not.toHaveProperty("ansprechpartner_email");

    const mail = pruefeVollstaendig("onboarding-department-assigned", buha);
    for (const teil of [mail.html, mail.text ?? ""]) {
      expect(teil).not.toContain("Stellenbezeichnung");
      expect(teil).not.toContain("Lehrkraft Sek. I");
      expect(teil).not.toContain("Betriebsstätte");
      expect(teil).not.toContain("Minden, Hauptstandort");
      expect(teil).not.toContain("a.leitung@example.org");
    }
  });

  it("Führungskraft: Stellenbezeichnung und Betriebsstätte, aber nicht die eigene Adresse als Angabe", async () => {
    db.onboardingAufgaben.push(
      aufgabe({
        title: "Einarbeitungsplan erstellen",
        assignee: "VORGESETZTER",
        dueDate: new Date("2026-09-29T00:00:00.000Z"),
      }),
    );

    await aktion(undefined, T_INFORMIERT);
    const alle = payloadsVon("onboarding-department-assigned");
    const fk = alle.find((p) => p.departmentKey === "VORGESETZTER")!;
    expect(fk).toMatchObject({
      abteilung: "Führungskraft",
      email: "a.leitung@example.org",
      ist_fuehrungskraft: "ja",
      stellenbezeichnung: "Lehrkraft Sek. I",
      betriebsstaette: "Minden, Hauptstandort",
      aufgabenliste: "- Einarbeitungsplan erstellen – fällig 29.09.2026",
    });
    expect(fk).not.toHaveProperty("ansprechpartner_email");

    const mail = pruefeVollstaendig("onboarding-department-assigned", fk);
    expect(mail.subject).toBe("Onboarding-Aufgaben für Führungskraft: Dienstbeginn 01.10.2026 (FES Minden)");
    // {{abteilung}} steht nie im Satzsubjekt oder hinter einer Praeposition
    // ohne Artikel ("Für Datenschutzbeauftragte/r sind …" waere falsch) —
    // der Satz spricht die Empfaenger mit "Sie" an.
    expect(mail.html).toContain("Folgende Aufgaben sind für Sie vorgesehen (zuständig: Führungskraft):");
    expect(mail.text).toContain("Folgende Aufgaben sind für Sie vorgesehen (zuständig: Führungskraft):");
    // Die Fuehrungskraft ist eine Person, keine Abteilung: eigener Satz,
    // und der Link geht "innerhalb Ihres Bereichs" weiter, nicht "Ihrer Abteilung".
    for (const teil of [mail.html, mail.text ?? ""]) {
      expect(teil).toContain("weil Sie im Onboarding-Vorgang als Führungskraft eingetragen sind");
      expect(teil).not.toContain("Ihrer Abteilung");
    }
    for (const teil of [mail.html, mail.text ?? ""]) {
      // Ihre eigene Adresse steht ihr nicht als "Ansprechpartner" gegenueber.
      expect(teil).not.toContain("Ansprechpartner (Führungskraft)");
    }
  });

  it("Erneut senden: Satz „erneut gesendet, Link unverändert“ — bei der Erstmail fehlt er", async () => {
    await aktion(undefined, T_INFORMIERT);
    const r = await aktion(
      { aktion: "erneut-senden", departmentKey: "IT" },
      new Date(T_INFORMIERT.getTime() + 11 * MINUTE),
    );
    expect(r.status).toBe(201);

    const [erst, erneut] = payloadsVon("onboarding-department-assigned");
    expect(erneut).toMatchObject({ erneut_gesendet: "ja", neuer_link: "", link: erst.link });
    const mail = pruefeVollstaendig("onboarding-department-assigned", erneut);
    for (const teil of [mail.html, mail.text ?? ""]) {
      expect(teil).toContain("Diese Nachricht wurde erneut gesendet. Der Link ist unverändert.");
      expect(teil).not.toContain("Dies ist ein neuer Link");
    }
    expect(rendere("onboarding-department-assigned", erst).text).not.toContain("erneut gesendet");
  });

  it("Link erneuern: neuer Link und der Hinweis, dass der alte nicht mehr gilt", async () => {
    await aktion(undefined, T_INFORMIERT);
    const r = await aktion({ aktion: "link-erneuern", departmentKey: "IT" }, new Date(T_INFORMIERT.getTime() + MINUTE));
    expect(r.status).toBe(201);

    const [erst, neu] = payloadsVon("onboarding-department-assigned");
    expect(neu).toMatchObject({ neuer_link: "ja", erneut_gesendet: "" });
    expect(neu.link).not.toBe(erst.link);
    const mail = pruefeVollstaendig("onboarding-department-assigned", neu);
    for (const teil of [mail.html, mail.text ?? ""]) {
      expect(teil).toContain("Dies ist ein neuer Link. Ein früher versendeter Link ist nicht mehr gültig.");
      expect(teil).not.toContain("erneut gesendet");
    }
  });

  it("ohne bekannten Namen steht die neutrale Bezeichnung — nie die private Adresse", async () => {
    db.onboardingVorgaenge = [vorgang({ firstName: null, lastName: null, personalData: null })];

    await aktion(undefined, T_INFORMIERT);
    const payload = payloadVon("onboarding-department-assigned");
    expect(payload).toMatchObject({
      mitarbeiter_name: "die neue Mitarbeiterin / den neuen Mitarbeiter",
      employeeName: "die neue Mitarbeiterin / den neuen Mitarbeiter",
      vorname: "",
      nachname: "",
    });

    const mail = pruefeVollstaendig("onboarding-department-assigned", payload);
    // Im HTML steht der Name fett — deshalb der Satz nur im Textteil am Stueck.
    expect(mail.text).toContain(
      "Bitte bereiten Sie den Dienstbeginn für die neue Mitarbeiterin / den neuen Mitarbeiter am 01.10.2026",
    );
    expect(mail.html).toContain("<strong>die neue Mitarbeiterin / den neuen Mitarbeiter</strong> am 01.10.2026");
    // Der Name faellt NIE auf eine Adresse zurueck: in der Anrede steht kein @.
    const anrede = (mail.text ?? "").split("\n").find((z) => z.startsWith("Bitte bereiten Sie")) ?? "";
    expect(anrede).not.toContain("@");
    expect(mail.subject).not.toContain("@");
  });

  it("maskiert eine Stellenbezeichnung mit Markup im HTML, laesst sie im Textteil roh", async () => {
    db.onboardingVorgaenge = [
      vorgang({
        supervisorData: {
          isComplete: true,
          vertragsbeginn: new Date("2026-10-01T00:00:00.000Z"),
          stellenbeschreibung: '<a href="https://boese.example.org">Lehrkraft</a>',
          betriebsstaette: "Minden & Umgebung",
        },
      }),
    ];

    await aktion(undefined, T_INFORMIERT);
    const mail = pruefeVollstaendig(
      "onboarding-department-assigned",
      payloadVon("onboarding-department-assigned"),
    );
    expect(mail.html).toContain("&lt;a href=&quot;https://boese.example.org&quot;&gt;Lehrkraft&lt;/a&gt;");
    expect(mail.html).not.toContain('<a href="https://boese.example.org"');
    expect(mail.html).toContain("Minden &amp; Umgebung");
    expect(mail.text).toContain('Stellenbezeichnung: <a href="https://boese.example.org">Lehrkraft</a>');
    expect(mail.text).toContain("Betriebsstätte: Minden & Umgebung");
  });
});

// =============================================
// onboarding-department-reminder — Knopf "Erinnern" und taeglicher Lauf
// =============================================

describe("onboarding-department-reminder (onboardingErinnerungenSenden und Knopf „Erinnern“)", () => {
  beforeEach(() => {
    db.onboardingVorgaenge = [vorgang()];
    db.konfigs = [konfig()];
    db.onboardingAufgaben = beispielAufgaben();
    db.links = [itLink()];
  });

  it("täglicher Lauf, Stufe WARNING: genau der Beispiel-Payload; Überfällig-Kasten mit Anzahl und Tagen", async () => {
    const e = await onboardingErinnerungenSenden(T_ERINNERT);
    expect(e).toMatchObject({ remindersProcessed: 1, errors: 0 });

    const payload = payloadVon("onboarding-department-reminder");
    expect(payload.magicLink).toBe(`${BASIS}/onboarding-tasks/tok-it`);
    expect(payload.link).toBe(`${BASIS}/onboarding-tasks/tok-it`);
    expect(ohneLinkFelder(payload)).toEqual(ohneLinkFelder(beispiel("onboarding-department-reminder")));
    // Die Erinnerung braucht die Zusatzangaben nicht — sie stehen auch nicht drin.
    expect(payload).not.toHaveProperty("stellenbezeichnung");
    expect(payload).not.toHaveProperty("betriebsstaette");
    expect(payload).not.toHaveProperty("ansprechpartner_email");

    const mail = pruefeVollstaendig("onboarding-department-reminder", payload);
    expect(mail.subject).toBe("Erinnerung: Onboarding-Aufgaben für IT-Abteilung – Dienstbeginn 01.10.2026");
    expect(mail.html).toContain(">Überfällig</span>");
    expect(mail.html).not.toContain(">Erinnerung</span>");
    expect(mail.html).not.toContain("Dringend");
    for (const teil of [mail.html, mail.text ?? ""]) {
      expect(teil).toContain("1 Aufgabe(n) sind überfällig, die älteste seit 2 Tag(en).");
      // Es gibt keine HR-Eskalation — die Mail behauptet auch keine.
      expect(teil).not.toMatch(/Personalabteilung (wird|wurde|ist) (informiert|benachrichtigt)/);
    }
    // Der Link wurde beim Erinnern verlaengert (vorher 21.12.).
    expect(mail.html).toContain("ist bis 25.12.2026 gültig");
    expect(mail.text).toContain("Gültig bis 25.12.2026");
    expect(mail.text).toContain(
      "Bitte denken Sie an die offenen Aufgaben für Anna Beispiel (Dienstbeginn 01.10.2026). Für Sie sind noch 3 Aufgabe(n) offen (zuständig: IT-Abteilung):",
    );
    expect(mail.text).toContain("- Notebook & Zubehör bereitstellen – fällig 01.10.2026");
    expect(mail.html).toContain("Notebook &amp; Zubehör bereitstellen");
  });

  it("Knopf „Erinnern“, Stufe INFO: Badge „Erinnerung“, kein Überfällig-Kasten — gleicher Aufbau wie der Lauf", async () => {
    // 22.09.: Benutzerkonto in zwei Tagen faellig, nichts ueberfaellig.
    const r = await aktion({ aktion: "erinnern", departmentKey: "IT" }, new Date("2026-09-22T09:00:00.000Z"));
    expect(r.status).toBe(201);

    const payload = payloadVon("onboarding-department-reminder");
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
    expect(schluessel(payload)).toEqual(schluessel(beispiel("onboarding-department-reminder")));

    const mail = pruefeVollstaendig("onboarding-department-reminder", payload);
    expect(mail.html).toContain(">Erinnerung</span>");
    for (const teil of [mail.html, mail.text ?? ""]) {
      expect(teil).not.toContain("überfällig");
      expect(teil).not.toContain("Überfällig");
    }
  });

  it("Stufe ESCALATION: Betreff beginnt mit „Dringend – “, roter Kasten nennt Anzahl und älteste Überfälligkeit", async () => {
    // 02.10.: Benutzerkonto seit 8 Tagen, Notebook seit 1 Tag ueberfaellig.
    const r = await aktion({ aktion: "erinnern", departmentKey: "IT" }, new Date("2026-10-02T08:00:00.000Z"));
    expect(r.status).toBe(201);

    const payload = payloadVon("onboarding-department-reminder");
    expect(payload).toMatchObject({ level: "ESCALATION", ist_eskalation: "ja", ist_warnung: "", ist_info: "" });

    const mail = pruefeVollstaendig("onboarding-department-reminder", payload);
    expect(mail.subject).toBe(
      "Dringend – Erinnerung: Onboarding-Aufgaben für IT-Abteilung – Dienstbeginn 01.10.2026",
    );
    expect(mail.text?.startsWith("Dringend – Erinnerung:")).toBe(true);
    expect(mail.html).toContain(">Dringend: überfällig</span>");
    expect(mail.html).not.toContain(">Überfällig</span>");
    expect(mail.html).not.toContain(">Erinnerung</span>");
    for (const teil of [mail.html, mail.text ?? ""]) {
      expect(teil).toContain("2 Aufgabe(n) sind überfällig, die älteste seit 8 Tag(en).");
    }
  });

  it("Erinnerung an die Führungskraft: derselbe Text trägt auch sie", async () => {
    db.onboardingAufgaben.push(
      aufgabe({
        title: "Einarbeitungsplan erstellen",
        assignee: "VORGESETZTER",
        dueDate: new Date("2026-09-24T00:00:00.000Z"),
      }),
    );
    db.links.push(
      itLink({
        departmentKey: "VORGESETZTER",
        departmentName: "Führungskraft",
        email: "a.leitung@example.org",
        token: "tok-fk",
      }),
    );

    await onboardingErinnerungenSenden(T_ERINNERT);
    const fk = payloadsVon("onboarding-department-reminder").find((p) => p.departmentKey === "VORGESETZTER")!;
    expect(fk).toMatchObject({ ist_fuehrungskraft: "ja", abteilung: "Führungskraft" });
    const mail = pruefeVollstaendig("onboarding-department-reminder", fk);
    expect(mail.subject).toBe("Erinnerung: Onboarding-Aufgaben für Führungskraft – Dienstbeginn 01.10.2026");
    expect(mail.text).toContain("Für Sie sind noch 1 Aufgabe(n) offen (zuständig: Führungskraft):");
    expect(mail.text).not.toContain("Ihre Abteilung");
    // Die Fuehrungskraft ist eine Person — kein "innerhalb Ihrer Abteilung".
    expect(mail.text).not.toContain("Ihrer Abteilung");
    expect(mail.html).not.toContain("Ihrer Abteilung");
  });
});

// =============================================
// onboarding-task-completed — nur ueber den Link der Abteilung
// =============================================

describe("onboarding-task-completed", () => {
  beforeEach(() => {
    db.onboardingVorgaenge = [vorgang()];
    db.konfigs = [konfig()];
    db.onboardingAufgaben = [
      ...beispielAufgaben(),
      aufgabe({ title: "Schlüssel und Ausweis vorbereiten", assignee: "FACILITY" }),
      aufgabe({ title: "Personalakte anlegen", assignee: "HR" }),
      aufgabe({ title: "Arbeitsvertrag ausfertigen", assignee: "HR" }),
    ];
    db.links = [itLink()];
  });

  const perLink = (itemId: string, body: unknown, jetzt = T_ERLEDIGT) =>
    oeffentlicheOnboardingAufgabeAendern("tok-it", itemId, body, jetzt);

  it("Link der Abteilung: genau der Beispiel-Payload; Kommentar im HTML maskiert, im Text roh", async () => {
    const r = await perLink(KONTO.id, { isCompleted: true, comment: ONBOARDING_ABTEILUNG_BEISPIEL_KOMMENTAR });
    expect(r.status).toBe(200);

    const payload = payloadVon("onboarding-task-completed");
    expect(payload).toEqual(beispiel("onboarding-task-completed"));
    // Kein Empfaengerfeld: HR steht im An-Feld der Vorlage.
    expect(payload).not.toHaveProperty("email");
    expect(JSON.stringify(payload)).not.toContain(PRIVATE_ADRESSE);

    const mail = pruefeVollstaendig("onboarding-task-completed", payload);
    expect(mail.subject).toBe("Onboarding-Aufgabe erledigt: Benutzerkonto und E-Mail-Adresse anlegen (IT-Abteilung)");
    expect(mail.html).toContain("Kommentar der Abteilung:");
    expect(mail.html).toContain("Konto angelegt &amp; Postfach eingerichtet.<br>Das Notebook kommt nächste Woche.");
    expect(mail.text).toContain(
      "Kommentar der Abteilung: Konto angelegt & Postfach eingerichtet.\nDas Notebook kommt nächste Woche.",
    );
    // Die Zustaendigkeit steht in einer Label-Zeile, nicht im Satzsubjekt
    // ("Verwaltung / Sekretariat hat …" braeuchte einen Artikel).
    expect(mail.text).toContain(
      "Die Aufgabe „Benutzerkonto und E-Mail-Adresse anlegen“ für Anna Beispiel wurde als erledigt markiert.",
    );
    expect(mail.text).toContain("Zuständigkeit: IT-Abteilung");
    expect(mail.html).toContain("Zuständigkeit");
    expect(mail.text).toContain("Erledigt über: Link der Abteilung");
    expect(mail.text).toContain("Vertragsbeginn: 01.10.2026");
    expect(mail.text).toContain("Noch offen im Vorgang: 5 Aufgabe(n)");
  });

  it("<script> im Kommentar: im HTML nur maskiert, im Text roh", async () => {
    await perLink(KONTO.id, { isCompleted: true, comment: "Erledigt <script>alert(1)</script>\nZweite Zeile" });

    const mail = pruefeVollstaendig("onboarding-task-completed", payloadVon("onboarding-task-completed"));
    expect(mail.html).toContain("Erledigt &lt;script&gt;alert(1)&lt;/script&gt;<br>Zweite Zeile");
    expect(mail.html).not.toContain("<script>");
    expect(mail.text).toContain("Kommentar der Abteilung: Erledigt <script>alert(1)</script>\nZweite Zeile");
  });

  it("ohne Kommentar: kein Kommentar-Kasten", async () => {
    await perLink(KONTO.id, { isCompleted: true });

    const payload = payloadVon("onboarding-task-completed");
    expect(payload).toMatchObject({ kommentar: "", kommentar_text: "" });
    const mail = pruefeVollstaendig("onboarding-task-completed", payload);
    expect(mail.html).not.toContain("Kommentar");
    expect(mail.text).not.toContain("Kommentar");
  });

  it("zweimal „erledigt“ über den Link ergibt genau eine Mail", async () => {
    await perLink(KONTO.id, { isCompleted: true });
    await perLink(KONTO.id, { isCompleted: true }, new Date(T_ERLEDIGT.getTime() + MINUTE));
    expect(payloadsVon("onboarding-task-completed")).toHaveLength(1);
  });

  it("„Erledigt über: Link der Führungskraft“, wenn die Aufgabe der Führungskraft gehört", async () => {
    db.onboardingAufgaben.push(
      aufgabe({ id: "i-fk", title: "Einarbeitungsplan erstellen", assignee: "VORGESETZTER" }),
    );
    db.links.push(
      itLink({
        departmentKey: "VORGESETZTER",
        departmentName: "Führungskraft",
        email: "a.leitung@example.org",
        token: "tok-fk",
      }),
    );

    await oeffentlicheOnboardingAufgabeAendern("tok-fk", "i-fk", { isCompleted: true }, T_ERLEDIGT);
    const payload = payloadVon("onboarding-task-completed");
    expect(payload).toMatchObject({ erledigt_ueber: "Link der Führungskraft", abteilung: "Führungskraft" });
    const mail = pruefeVollstaendig("onboarding-task-completed", payload);
    expect(mail.text).toContain("Erledigt über: Link der Führungskraft");
  });

  it("Abhaken im Portal meldet HR nichts (Entscheidung Paket 5)", async () => {
    const r = await onboardingAufgabeImPortalAendern({
      onboardingId: VORGANG_ID,
      itemId: KONTO.id,
      rohBody: { isCompleted: true },
      session: SESSION,
      jetzt: T_ERLEDIGT,
    });
    expect(r.status).toBe(200);
    expect(payloadsVon("onboarding-task-completed")).toHaveLength(0);
  });
});

// =============================================
// onboarding-department-completed
// =============================================

describe("onboarding-department-completed", () => {
  beforeEach(() => {
    db.onboardingVorgaenge = [vorgang()];
    db.konfigs = [konfig()];
    db.onboardingAufgaben = beispielAufgaben([KONTO.id, WLAN.id]);
    db.links = [itLink({ lastReminderAt: T_ERINNERT, reminderCount: 1 })];
  });

  it("genau einmal bei der letzten Aufgabe über den Link; Payload = Beispiel aus dem Katalog", async () => {
    const r = await oeffentlicheOnboardingAufgabeAendern("tok-it", NOTEBOOK.id, { isCompleted: true }, T_FERTIG);
    expect(r.status).toBe(200);

    const payload = payloadVon("onboarding-department-completed");
    expect(payload).toEqual(beispiel("onboarding-department-completed"));

    // Noch einmal "erledigt" (die andere Seite eines Doppelklicks): keine zweite Bestaetigung.
    await oeffentlicheOnboardingAufgabeAendern(
      "tok-it",
      NOTEBOOK.id,
      { isCompleted: true },
      new Date(T_FERTIG.getTime() + MINUTE),
    );
    expect(payloadsVon("onboarding-department-completed")).toHaveLength(1);

    const mail = pruefeVollstaendig("onboarding-department-completed", payload);
    expect(mail.subject).toBe("Danke – alle Onboarding-Aufgaben für IT-Abteilung erledigt (ONB-2026-031)");
    expect(mail.text).toContain(
      "Vielen Dank. Alle 3 Ihnen zugewiesenen Aufgaben (IT-Abteilung) zum Dienstbeginn am 01.10.2026 in FES Minden sind erledigt.",
    );
    expect(mail.text).toContain("Die Personalabteilung sieht Ihre Rückmeldung im Portal.");
    expect(mail.text).not.toContain("Ihrer Abteilung");
  });

  it("Abhaken im Portal bestätigt der Abteilung nichts", async () => {
    await onboardingAufgabeImPortalAendern({
      onboardingId: VORGANG_ID,
      itemId: NOTEBOOK.id,
      rohBody: { isCompleted: true },
      session: SESSION,
      jetzt: T_FERTIG,
    });
    expect(linkVon("IT").allTasksComplete).toBe(true);
    expect(payloadsVon("onboarding-department-completed")).toHaveLength(0);
  });
});

// =============================================
// Mailer: Rohtexte im HTML-Teil (Paket 5 ergaenzt drei Namen)
// =============================================

describe("Mailer — aufgabe, stellenbezeichnung und betriebsstaette im HTML maskiert, im Text roh", () => {
  // Eine Vorlage, wie ein Admin sie im Editor schreiben koennte.
  const adminVorlage = {
    subject: "Betreff {{aufgabe}}",
    bodyHtml: "<p>{{aufgabe}}</p><div>{{stellenbezeichnung}}</div><span>{{betriebsstaette}}</span>",
    bodyText: "{{aufgabe}}\n{{stellenbezeichnung}}\n{{betriebsstaette}}",
    ...LEERE_EMPFAENGER,
  };
  const payload = {
    aufgabe: "<b>Konto</b> anlegen",
    stellenbezeichnung: '<a href="https://boese.example.org">Lehrkraft</a>',
    betriebsstaette: "Minden & Umgebung",
  };

  it.each(["onboarding-department-assigned", "onboarding-task-completed"])("%s", (event) => {
    const { rendered } = renderEventEmail(adminVorlage, event, payload, { overrideTo: "hr@example.org" });
    expect(rendered).not.toBeNull();
    const { html, text, subject } = rendered!;

    expect(html).toContain("<p>&lt;b&gt;Konto&lt;/b&gt; anlegen</p>");
    expect(html).toContain("<div>&lt;a href=&quot;https://boese.example.org&quot;&gt;Lehrkraft&lt;/a&gt;</div>");
    expect(html).toContain("<span>Minden &amp; Umgebung</span>");
    expect(html).not.toContain("<b>");
    expect(html).not.toContain('<a href="https://boese.example.org"');

    // Textteil und Betreff bleiben roh.
    expect(text).toBe(
      '<b>Konto</b> anlegen\n<a href="https://boese.example.org">Lehrkraft</a>\nMinden & Umgebung',
    );
    expect(subject).toBe("Betreff <b>Konto</b> anlegen");
  });
});

// =============================================
// Katalog: Beispiel-Payloads fuer den Testversand
// =============================================

describe("Beispiel-Payloads (Testversand) der vier Onboarding-Abteilungsmails", () => {
  const ereignisse = [
    "onboarding-department-assigned",
    "onboarding-department-reminder",
    "onboarding-task-completed",
    "onboarding-department-completed",
  ];

  it.each(ereignisse)("%s rendert mit dem Beispiel ohne leere Platzhalter", (event) => {
    pruefeVollstaendig(event, beispiel(event));
  });

  it("jedes der vier Ereignisse hat Katalog-Eintrag und Standardvorlage mit gleichem Namen", () => {
    for (const event of ereignisse) {
      const def = EVENT_CATALOG.find((d) => d.event === event);
      expect({ event, gefunden: Boolean(def) }).toEqual({ event, gefunden: true });
      expect({ event, group: def!.group, wired: def!.wired }).toEqual({ event, group: "Onboarding", wired: true });
      expect(standardVorlage(event).name).toBe(def!.name);
    }
  });

  it("nur onboarding-task-completed hat kein An-Feld (HR-Postfach in der Vorlage)", () => {
    const ohneEmpfaenger = ereignisse.filter(
      (e) => EVENT_CATALOG.find((d) => d.event === e)!.defaultRecipients.to === "",
    );
    expect(ohneEmpfaenger).toEqual(["onboarding-task-completed"]);
    expect(beispiel("onboarding-task-completed")).not.toHaveProperty("email");
  });

  it("der gemeinsame Teil entspricht dem, was onboardingAbteilungsMailFelder liefert", () => {
    // Der Katalog schreibt die Felder ab (er laeuft auch im Browser und kann
    // onboardingAbteilungsMailFelder nicht aufrufen). Dieser Test haelt beide gleich.
    const echt = onboardingAbteilungsMailFelder({
      id: VORGANG_ID,
      displayId: "ONB-2026-031",
      firstName: "Anna",
      lastName: "Beispiel",
      personalData: { firstName: "Anna", lastName: "Beispiel" },
      organization: ORG,
      supervisorData: { vertragsbeginn: new Date("2026-10-01T00:00:00.000Z") },
    });
    for (const event of ereignisse) {
      expect({ event, felder: beispiel(event) }).toMatchObject({ event, felder: echt });
    }
  });

  it("Aufgabenliste (Klartext und HTML) = aufgabenlisteMailFelder(Beispielaufgaben)", () => {
    const echt = aufgabenlisteMailFelder(ONBOARDING_ABTEILUNG_BEISPIEL_AUFGABEN);
    expect(beispiel("onboarding-department-assigned")).toMatchObject(echt);
    expect(beispiel("onboarding-department-reminder")).toMatchObject(echt);
  });

  it("Zusatzangaben = zusatzWerte(\"IT\", …) und stehen nur in der Zuweisungsmail", () => {
    const echt = zusatzWerte("IT", {
      stellenbezeichnung: "Lehrkraft Sek. I",
      betriebsstaette: "Minden, Hauptstandort",
      fuehrungskraftEmail: "a.leitung@example.org",
    });
    expect(beispiel("onboarding-department-assigned")).toMatchObject(echt);
    for (const event of ereignisse.filter((e) => e !== "onboarding-department-assigned")) {
      for (const feld of Object.keys(echt)) {
        expect({ event, feld, drin: feld in beispiel(event) }).toEqual({ event, feld, drin: false });
      }
    }
  });

  it("Kommentar = kommentarMailFelder(Beispielkommentar), maskiert mit <br>", () => {
    const echt = kommentarMailFelder(ONBOARDING_ABTEILUNG_BEISPIEL_KOMMENTAR);
    expect(echt.kommentar).toContain("&amp;");
    expect(echt.kommentar).toContain("<br>");
    expect(beispiel("onboarding-task-completed")).toMatchObject(echt);
  });

  it("Stufenfelder der Erinnerung = stufenMailFelder(stufeBerechnen(...)) am 26.09.2026", () => {
    const stufe = stufeBerechnen(ONBOARDING_ABTEILUNG_BEISPIEL_AUFGABEN, T_ERINNERT);
    expect(stufe.level).toBe("WARNING");
    expect(beispiel("onboarding-department-reminder")).toMatchObject(stufenMailFelder(stufe, "WARNING"));
  });

  it("Testversand der Erinnerung zeigt jede Stufe ohne Rohtext", () => {
    const basis = beispiel("onboarding-department-reminder");
    const stufen: Array<[string, Date, string]> = [
      ["INFO", new Date("2026-09-22T09:00:00.000Z"), ">Erinnerung</span>"],
      ["WARNING", T_ERINNERT, ">Überfällig</span>"],
      ["ESCALATION", new Date("2026-10-02T08:00:00.000Z"), ">Dringend: überfällig</span>"],
    ];
    for (const [level, jetzt, badge] of stufen) {
      const stufe = stufeBerechnen(ONBOARDING_ABTEILUNG_BEISPIEL_AUFGABEN, jetzt);
      expect(stufe.level).toBe(level);
      const mail = pruefeVollstaendig("onboarding-department-reminder", {
        ...basis,
        ...stufenMailFelder(stufe, stufe.level!),
      });
      expect({ level, badge: mail.html.includes(badge) }).toEqual({ level, badge: true });
      expect(mail.subject.startsWith("Dringend – ")).toBe(level === "ESCALATION");
    }
  });

  it("kein Beispiel-Payload nennt eine private Adresse oder eine fremde Domain", () => {
    for (const event of ereignisse) {
      for (const [feld, wert] of Object.entries(beispiel(event))) {
        if (typeof wert === "string" && wert.includes("@")) {
          expect({ event, feld, wert }).toEqual({ event, feld, wert: expect.stringMatching(/@example\.org/) });
        }
      }
    }
  });
});
