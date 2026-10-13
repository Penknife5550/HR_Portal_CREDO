/**
 * Tests: Karte „Ausstattung & Zugänge“ — die Aktionen von HR (Feinplan S15)
 *
 * src/lib/ausstattung-dienst.ts (`ausstattungAktionAusfuehren`,
 * `ausstattungKarteLaden`) gegen die kleine In-Memory-Datenbank
 * (src/__tests__/hilfen/abteilungs-fake-db.ts). Abgedeckt: Pruefreihenfolge
 * (403, 400, 404, 409 Endstatus, 409 ohne Modalitaeten — unabhaengig von
 * `mitAusstattung` —, 409 Versandsperre), Hinzufuegen aus dem Katalog und
 * frei (Regel 11), Streichen und Abwaehlen vor und nach der Information
 * (F2), Wiederaufnahme statt Neuanlage (F23), Regel 9 (erledigte Aufgabe),
 * Stellenwechsel mit Aenderungsliste fuer beide Stellen und beiden Links
 * (mit Tagesangabe neue Faelligkeit wie F23, ohne sie Anhebung beim Versand
 * an die neue Stelle, F22), Faelligkeit von Hand ohne „Eilt“ (R14), Herkunft
 * der Bemerkung (Regel 8), die Hinweise (E-A14, F20) und ein Protokoll ohne
 * Freitext. Seit S23 (A4): der Merker `ausgabenAngeboten` beim Speichern des
 * Schritts (`fuehrungskraftWahlSpeichernIn`) und bei der Abgabe
 * (`ausgabenAngebotenBeiAbgabeIn`) sowie „Beim Austritt“ an einer freien
 * Position.
 *
 * Der Fake rollt bei einer Ausnahme NICHT zurueck — Abweisungen werden
 * deshalb daran geprueft, dass VOR dem ersten Schreiben abgewiesen wird. Die
 * Sperrreihenfolge pruefen die Tests ueber die Aufrufreihenfolge der Mocks.
 */

jest.mock("@/lib/db", () => ({
  prisma: jest.requireActual("../hilfen/abteilungs-fake-db").fakePrisma,
}));
jest.mock("@/lib/webhooks", () => ({ triggerWebhooks: jest.fn() }));

import type { Prisma } from "@prisma/client";
import {
  db,
  dbLeeren,
  fakePrisma,
  neueAusstattungsZeile,
  neueOnboardingAufgabe,
  neuerLink,
  neuerStellenHinweis,
  type Zeile,
} from "../hilfen/abteilungs-fake-db";
import {
  ausgabenAngebotenBeiAbgabeIn,
  ausstattungAktionAusfuehren,
  ausstattungKarteLaden,
  fuehrungskraftWahlSpeichernIn,
} from "@/lib/ausstattung-dienst";
import { onboardingAusstattungNachholenIn } from "@/lib/abteilungsaufgaben-onboarding";
import { versandSperreFreigeben, versandSperreNehmen } from "@/lib/abteilungsaufgaben-dienst";
import { oeffentlicheOnboardingAufgabenLaden } from "@/lib/abteilungsaufgaben-uebergaenge";
import { ABTEILUNGS_AUDIT, MELDUNGEN as ABTEILUNGS_MELDUNGEN } from "@/lib/abteilungsaufgaben";
import {
  AUSSTATTUNG_AUDIT,
  AUSSTATTUNG_KATEGORIE,
  HINWEIS_AUFGABE_TITEL,
  MELDUNGEN,
  type AusstattungsUebersicht,
} from "@/lib/ausstattung";
import type { SessionPayload } from "@/lib/permissions";

type FakeTabelle = Record<string, jest.Mock>;
const fp = fakePrisma as unknown as Record<string, FakeTabelle>;
const tx = fakePrisma as unknown as Prisma.TransactionClient;

// Der Katalogausschnitt liest die Einrichtungsart des Arbeitsorts.
fp.organization = { findUnique: jest.fn(async () => ({ type: "GYMNASIUM" })) };
// SupervisorData kennt der Fake nicht — fuer den Merker `ausgabenAngeboten` (S23) genuegt ein Spion.
fp.supervisorData = { update: jest.fn(async () => ({})), updateMany: jest.fn(async () => ({ count: 1 })) };

const JETZT = new Date("2026-09-22T08:00:00.000Z");
const BEGINN = new Date("2026-10-01T00:00:00.000Z");
const tag = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

const HR: SessionPayload = {
  userId: "u-hr",
  email: "hr@example.org",
  role: "HR_SACHBEARBEITER",
  firstName: "Anna",
  lastName: "Peters",
};

function vorgang(teil: Zeile = {}): Zeile {
  return {
    id: "onb-1",
    displayId: "ONB-2026-031",
    organizationId: "org-1",
    arbeitsortId: null,
    questionnaireType: "STANDARD",
    processType: "EINSTELLUNG",
    status: "SUPERVISOR_SUBMITTED",
    firstName: "Lena",
    lastName: "Brandt",
    supervisorEmail: "a.leitung@example.org",
    supervisorSubmittedAt: new Date("2026-09-20T08:00:00.000Z"),
    supervisorData: { isComplete: true, mitAusstattung: true, vertragsbeginn: BEGINN },
    organization: { name: "FES Minden", mandantNumber: "01" },
    ...teil,
  };
}

function katalogPosition(teil: Zeile): Zeile {
  return {
    organizationId: null,
    einrichtungsarten: [],
    angabeSchluessel: null,
    hinweisFuehrungskraft: null,
    hinweisStelle: null,
    optionen: [],
    vorausgewaehlt: false,
    vorausgewaehlteOptionen: [],
    bemerkungAnbieten: true,
    bemerkungPlatzhalter: null,
    aufgabeTitel: null,
    defaultDueDays: -5,
    personengruppen: [],
    sichtbarFuer: [],
    entgeltrelevant: false,
    ausgabeKennung: null,
    rueckgabeKategorie: null,
    beiAustritt: null,
    vorschlagSchluessel: null,
    isActive: true,
    orderIndex: 0,
    ...teil,
  };
}

const KATALOG = [
  katalogPosition({ id: "pos-ipad", departmentKey: "IT", art: "JA_NEIN", bezeichnung: "Dienst-iPad (Lernmittel)", orderIndex: 2 }),
  katalogPosition({ id: "pos-laptop", departmentKey: "IT", art: "JA_NEIN", bezeichnung: "Dienst-Laptop / PC", orderIndex: 3 }),
  katalogPosition({
    id: "pos-schluessel",
    departmentKey: "FACILITY",
    art: "AUSWAHL",
    bezeichnung: "Schlüssel",
    optionen: ["Haupteingang", "Lehrerzimmer", "Fachraum Chemie"],
    aufgabeTitel: "Schlüssel ausgeben",
    defaultDueDays: -7,
    orderIndex: 1,
  }),
  katalogPosition({
    id: "pos-faecher",
    departmentKey: "FACILITY",
    art: "ANGABE",
    angabeSchluessel: "UNTERRICHTSFAECHER",
    bezeichnung: "Unterrichtsfächer",
    bemerkungAnbieten: false,
    defaultDueDays: null,
    sichtbarFuer: ["IT"],
  }),
];

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

function link(departmentKey: string, teil: Zeile = {}): Zeile {
  return neuerLink({
    onboardingId: "onb-1",
    departmentKey,
    departmentName: departmentKey === "IT" ? "IT-Abteilung" : "Facility Management",
    email: `${departmentKey.toLowerCase()}@example.org`,
    token: `tok-${departmentKey}`,
    expiresAt: new Date("2026-12-01T00:00:00.000Z"),
    sentAt: new Date("2026-09-21T08:00:00.000Z"),
    lastSentAt: new Date("2026-09-21T08:00:00.000Z"),
    lastSendStatus: "SENT",
    ...teil,
  });
}

/** Wahl der Fuehrungskraft: Ja/Nein an die IT. */
function ipad(teil: Zeile = {}): Zeile {
  return neueAusstattungsZeile({
    id: "aus-ipad",
    onboardingId: "onb-1",
    positionId: "pos-ipad",
    departmentKey: "IT",
    art: "JA_NEIN",
    bezeichnung: "Dienst-iPad (Lernmittel)",
    aufgabeTitel: "Dienst-iPad (Lernmittel) bereitstellen",
    relativeDueDays: -5,
    reihenfolge: 2,
    quelle: "FUEHRUNGSKRAFT",
    bemerkung: "Mit Stift und Hülle",
    bemerkungQuelle: "FUEHRUNGSKRAFT",
    ...teil,
  });
}

/** Wahl der Fuehrungskraft: Auswahl an Facility, je Option eine Aufgabe. */
function schluessel(teil: Zeile = {}): Zeile {
  return neueAusstattungsZeile({
    id: "aus-schluessel",
    onboardingId: "onb-1",
    positionId: "pos-schluessel",
    departmentKey: "FACILITY",
    art: "AUSWAHL",
    bezeichnung: "Schlüssel",
    aufgabeTitel: "Schlüssel ausgeben",
    relativeDueDays: -7,
    reihenfolge: 1,
    auswahl: ["Haupteingang", "Lehrerzimmer"],
    quelle: "FUEHRUNGSKRAFT",
    ...teil,
  });
}

function hinweis(departmentKey: string, text: string, teil: Zeile = {}): Zeile {
  return neuerStellenHinweis({ onboardingId: "onb-1", departmentKey, text, quelle: "FUEHRUNGSKRAFT", ...teil });
}

/** Die Aufgaben anlegen wie nach der Abgabe der Modalitaeten. */
async function nachgeholt(): Promise<void> {
  await onboardingAusstattungNachholenIn(tx, "onb-1", { userId: null, jetzt: JETZT });
  jest.clearAllMocks();
  db.audits = [];
}

function aktion(body: unknown, session: SessionPayload = HR) {
  return ausstattungAktionAusfuehren({ onboardingId: "onb-1", rohBody: body, session, jetzt: JETZT });
}

const aufgabe = (titel: string) => db.onboardingAufgaben.find((a) => a.title === titel);
const ausstattungsAufgaben = () => db.onboardingAufgaben.filter((a) => a.herkunft != null);
const eintraege = () => db.ausstattungAenderungen.map((e) => [e.departmentKey, e.art, e.titel]);
const audits = (action: string) => db.audits.filter((a) => a.action === action);

beforeEach(() => {
  jest.clearAllMocks();
  dbLeeren();
  db.onboardingVorgaenge = [vorgang()];
  db.ausstattungsPositionen = KATALOG.map((p) => structuredClone(p));
  db.konfigs = [konfig(), konfig({ departmentKey: "FACILITY", departmentName: "Facility Management", email: "fm@example.org" })];
});

// =============================================
// Pruefreihenfolge (403 → 400 → 404 → 409)
// =============================================

describe("Prüfreihenfolge", () => {
  it.each(["VORGESETZTER", "EINRICHTUNGSLEITUNG", "SERVICE"])("%s → 403, ohne den Vorgang zu lesen (Regel 16)", async (role) => {
    const r = await aktion({ aktion: "streichen", ausstattungId: "aus-ipad" }, { ...HR, role });
    expect(r).toEqual({ status: 403, body: { error: "Keine Berechtigung" } });
    expect(fp.onboardingProcess.findUnique).not.toHaveBeenCalled();
  });

  it.each([
    ["kein Objekt", undefined, ABTEILUNGS_MELDUNGEN.UNGUELTIGE_EINGABE],
    ["unbekannte Aktion", { aktion: "loeschen" }, "Unbekannte Aktion."],
    ["frei UND positionId", { aktion: "hinzufuegen", positionId: "pos-ipad", frei: { departmentKey: "IT", bezeichnung: "x" } }, MELDUNGEN.KARTE_POSITION_ODER_FREI],
    // Regel 11: je Eintrag aus NICHT_ERLAUBTE_STELLEN, frei, im Stellenwechsel und am Hinweis
    ["frei nach MITARBEITER", { aktion: "hinzufuegen", frei: { departmentKey: "MITARBEITER", bezeichnung: "Laptop" } }, MELDUNGEN.STELLE_NICHT_ERLAUBT],
    ["frei nach VORGESETZTER", { aktion: "hinzufuegen", frei: { departmentKey: "VORGESETZTER", bezeichnung: "Laptop" } }, MELDUNGEN.STELLE_NICHT_ERLAUBT],
    ["Stellenwechsel nach VORGESETZTER", { aktion: "aendern", ausstattungId: "aus-ipad", departmentKey: "VORGESETZTER" }, MELDUNGEN.STELLE_NICHT_ERLAUBT],
    ["Stellenwechsel nach MITARBEITER", { aktion: "aendern", ausstattungId: "aus-ipad", departmentKey: "MITARBEITER" }, MELDUNGEN.STELLE_NICHT_ERLAUBT],
    ["Hinweis an MITARBEITER", { aktion: "hinweis-aendern", departmentKey: "MITARBEITER", hinweis: "x" }, MELDUNGEN.STELLE_NICHT_ERLAUBT],
    ["freie Bezeichnung über 120 Zeichen", { aktion: "hinzufuegen", frei: { departmentKey: "IT", bezeichnung: "x".repeat(121) } }, MELDUNGEN.KARTE_FREI_ZU_LANG],
    ["Hinweis ohne Text und Fälligkeit", { aktion: "hinweis-aendern", departmentKey: "IT" }, MELDUNGEN.KARTE_HINWEIS_ODER_FAELLIG],
    ["Datum ohne Rückprobe", { aktion: "hinweis-aendern", departmentKey: "IT", dueDate: "2026-02-31" }, MELDUNGEN.KARTE_DATUM_UNGUELTIG],
    ["Ändern ohne Feld", { aktion: "aendern", ausstattungId: "aus-ipad" }, MELDUNGEN.MINDESTENS_EIN_FELD],
  ])("Zod 400: %s", async (_name, body, meldung) => {
    db.ausstattungZeilen = [ipad()];
    const r = await aktion(body);
    expect(r).toEqual({ status: 400, body: { error: meldung } });
    expect(db.ausstattungZeilen).toHaveLength(1);
    expect(db.onboardingAufgaben).toEqual([]);
  });

  it("404 für einen unbekannten Vorgang (fremder Mandant: derselbe Text, Route-Test)", async () => {
    const r = await ausstattungAktionAusfuehren({
      onboardingId: "gibt-es-nicht",
      rohBody: { aktion: "hinweis-gesehen", departmentKey: "IT" },
      session: HR,
      jetzt: JETZT,
    });
    expect(r).toEqual({ status: 404, body: { error: ABTEILUNGS_MELDUNGEN.ONBOARDING_VORGANG_NICHT_GEFUNDEN } });
  });

  it.each([
    ["COMPLETED", MELDUNGEN.KARTE_ABGESCHLOSSEN],
    ["EXPIRED", MELDUNGEN.KARTE_ABGELAUFEN],
  ])("%s → 409 VORGANG_ABGESCHLOSSEN (Regel 13), nichts geschrieben", async (status, meldung) => {
    db.onboardingVorgaenge = [vorgang({ status })];
    const r = await aktion({ aktion: "hinzufuegen", positionId: "pos-laptop" });
    expect(r).toEqual({ status: 409, body: { error: meldung, grund: "VORGANG_ABGESCHLOSSEN" } });
    expect(db.ausstattungZeilen).toEqual([]);
    expect(fp.onboardingProcess.updateMany).not.toHaveBeenCalled();
  });

  it("vor der Abgabe der Modalitäten → 409 MODALITAETEN_FEHLEN (E-A11)", async () => {
    db.onboardingVorgaenge = [
      vorgang({ status: "IN_PROGRESS", supervisorSubmittedAt: null, supervisorData: { isComplete: false, mitAusstattung: true } }),
    ];
    const r = await aktion({ aktion: "hinzufuegen", positionId: "pos-laptop" });
    expect(r).toEqual({ status: 409, body: { error: MELDUNGEN.KARTE_MODALITAETEN_FEHLEN, grund: "MODALITAETEN_FEHLEN" } });
    expect(db.ausstattungZeilen).toEqual([]);
  });

  it("nach der Abgabe auch ohne den Schritt im Formular (`mitAusstattung = false`, Bestand) erlaubt", async () => {
    db.onboardingVorgaenge = [
      vorgang({ supervisorData: { isComplete: true, mitAusstattung: false, vertragsbeginn: BEGINN } }),
    ];
    const r = await aktion({ aktion: "hinzufuegen", positionId: "pos-laptop" });
    expect(r.status).toBe(200);
    expect(db.ausstattungZeilen).toHaveLength(1);
  });

  it("Versand läuft (dieselbe Sperre wie „Abteilungen informieren“, F6) → 409, nichts geschrieben", async () => {
    const bereich = { modul: "ONBOARDING" as const, vorgangId: "onb-1" };
    expect(versandSperreNehmen(bereich)).toBe(true);
    try {
      const r = await aktion({ aktion: "hinzufuegen", positionId: "pos-laptop" });
      expect(r).toEqual({ status: 409, body: { error: MELDUNGEN.KARTE_VERSAND_LAEUFT, grund: "VERSAND_LAEUFT" } });
      expect(db.ausstattungZeilen).toEqual([]);
    } finally {
      versandSperreFreigeben(bereich);
    }
    // Die Karte gibt die Sperre selbst wieder frei — auch nach einer Abweisung.
    await aktion({ aktion: "hinweis-gesehen", departmentKey: "IT" });
    expect(versandSperreNehmen(bereich)).toBe(true);
    versandSperreFreigeben(bereich);
  });
});

// =============================================
// Hinzufuegen
// =============================================

describe("Hinzufügen", () => {
  it("aus dem Katalog: Zeile von HR, Aufgabe angelegt samt Fälligkeit, Antwort mit der neuen Übersicht", async () => {
    const r = await aktion({ aktion: "hinzufuegen", positionId: "pos-laptop", bemerkung: "Mit Dockingstation" });

    expect(r.status).toBe(200);
    expect(r.body.meldung).toBe(MELDUNGEN.KARTE_HINZUGEFUEGT);
    expect(db.ausstattungZeilen[0]).toMatchObject({
      positionId: "pos-laptop",
      departmentKey: "IT",
      quelle: "HR",
      erfasstVonId: "u-hr",
      bemerkung: "Mit Dockingstation",
      bemerkungQuelle: "HR",
      aufgabeTitel: "Dienst-Laptop / PC bereitstellen",
    });
    expect(ausstattungsAufgaben()).toEqual([
      expect.objectContaining({
        title: "Dienst-Laptop / PC bereitstellen",
        category: AUSSTATTUNG_KATEGORIE,
        assignee: "IT",
        herkunft: "AUSSTATTUNG",
        dueDate: tag("2026-09-26"),
        eilt: false,
      }),
    ]);
    const u = r.body.data as AusstattungsUebersicht;
    expect(u.gruppen[0].zeilen[0]).toMatchObject({ bezeichnung: "Dienst-Laptop / PC", quelle: "HR" });
    expect(u.gruppen[0].zeilen[0].aufgaben).toHaveLength(1);
    // Die Stelle ist nicht informiert: kein Eintrag in der Aenderungsliste.
    expect(db.ausstattungAenderungen).toEqual([]);
  });

  it("Auswahl: je Option eine Aufgabe; ohne Option bzw. mit fremder Option 400", async () => {
    expect(await aktion({ aktion: "hinzufuegen", positionId: "pos-schluessel" })).toEqual({
      status: 400,
      body: { error: MELDUNGEN.KARTE_AUSWAHL_LEER },
    });
    expect(await aktion({ aktion: "hinzufuegen", positionId: "pos-schluessel", auswahl: ["Tresor"] })).toEqual({
      status: 400,
      body: { error: MELDUNGEN.KARTE_OPTION_UNBEKANNT },
    });
    expect(db.ausstattungZeilen).toEqual([]);

    const r = await aktion({ aktion: "hinzufuegen", positionId: "pos-schluessel", auswahl: ["Lehrerzimmer", "Haupteingang"] });
    expect(r.status).toBe(200);
    // Reihenfolge wie im Katalog.
    expect(db.ausstattungZeilen[0].auswahl).toEqual(["Haupteingang", "Lehrerzimmer"]);
    expect(ausstattungsAufgaben().map((a) => a.title)).toEqual([
      "Schlüssel ausgeben: Haupteingang",
      "Schlüssel ausgeben: Lehrerzimmer",
    ]);
  });

  it("frei: immer Ja/Nein, ans Ende sortiert, ohne Hinweis für die Stelle", async () => {
    const r = await aktion({
      aktion: "hinzufuegen",
      frei: { departmentKey: "VERWALTUNG", bezeichnung: "Namensschild für die Tür", relativeDueDays: -3 },
    });

    expect(r.status).toBe(200);
    expect(db.ausstattungZeilen[0]).toMatchObject({
      positionId: null,
      departmentKey: "VERWALTUNG",
      art: "JA_NEIN",
      bezeichnung: "Namensschild für die Tür",
      aufgabeTitel: "Namensschild für die Tür bereitstellen",
      hinweisStelle: null,
      relativeDueDays: -3,
      quelle: "HR",
    });
    expect(ausstattungsAufgaben()).toEqual([
      expect.objectContaining({ title: "Namensschild für die Tür bereitstellen", assignee: "VERWALTUNG", description: null }),
    ]);
  });

  it("frei mit Auswahl oder Angabe → 400; unbekannte Stelle → 400", async () => {
    expect(
      await aktion({ aktion: "hinzufuegen", frei: { departmentKey: "IT", bezeichnung: "Tablet" }, auswahl: ["A"] }),
    ).toEqual({ status: 400, body: { error: MELDUNGEN.KARTE_PASST_NICHT_ZUR_ART } });
    const r = await aktion({ aktion: "hinzufuegen", frei: { departmentKey: "HAUSTECHNIK", bezeichnung: "Tablet" } });
    expect(r.status).toBe(400);
    expect(String(r.body.error)).toContain("Unbekannte Zuständigkeit „HAUSTECHNIK“");
    expect(db.ausstattungZeilen).toEqual([]);
  });

  it("Position außerhalb des Katalogs dieses Vorgangs → 400; schon gewählt → 409 BEREITS_VORHANDEN", async () => {
    db.ausstattungsPositionen.find((p) => p.id === "pos-laptop")!.isActive = false;
    expect(await aktion({ aktion: "hinzufuegen", positionId: "pos-laptop" })).toEqual({
      status: 400,
      body: { error: MELDUNGEN.POSITION_NICHT_IM_KATALOG },
    });
    db.ausstattungZeilen = [ipad()];
    expect(await aktion({ aktion: "hinzufuegen", positionId: "pos-ipad" })).toEqual({
      status: 409,
      body: { error: MELDUNGEN.POSITION_BEREITS_GEWAEHLT, grund: "BEREITS_VORHANDEN" },
    });
  });

  it("informierte Stelle: Eintrag NEU — genau einer, obwohl Karte und Nachholen ihn melden", async () => {
    db.links = [link("IT")];
    const r = await aktion({ aktion: "hinzufuegen", positionId: "pos-laptop" });
    expect(r.body.meldung).toBe(`${MELDUNGEN.KARTE_HINZUGEFUEGT} ${MELDUNGEN.KARTE_NACHTRAG_FOLGT}`);
    expect(eintraege()).toEqual([["IT", "NEU", "Dienst-Laptop / PC bereitstellen"]]);
  });

  it("Angabe: Wert Pflicht, keine Bemerkung", async () => {
    expect(await aktion({ aktion: "hinzufuegen", positionId: "pos-faecher" })).toEqual({
      status: 400,
      body: { error: MELDUNGEN.KARTE_ANGABE_LEER },
    });
    expect(
      await aktion({ aktion: "hinzufuegen", positionId: "pos-faecher", angabe: "Chemie", bemerkung: "nein" }),
    ).toEqual({ status: 400, body: { error: MELDUNGEN.ANGABE_OHNE_BEMERKUNG } });
    const r = await aktion({ aktion: "hinzufuegen", positionId: "pos-faecher", angabe: "Chemie, Sport" });
    expect(r.status).toBe(200);
    expect(db.ausstattungZeilen[0]).toMatchObject({ art: "ANGABE", angabe: "Chemie, Sport", sichtbarFuer: ["IT"] });
    // Eine Angabe wird keine Aufgabe.
    expect(ausstattungsAufgaben()).toEqual([]);
  });
});

// =============================================
// Streichen, Abwaehlen, Wiederaufnahme (F2, F23)
// =============================================

describe("Streichen", () => {
  it("vor der Information: Zeile UND Aufgaben weg — keine verwaiste Ausstattungsaufgabe", async () => {
    db.ausstattungZeilen = [ipad(), schluessel()];
    await nachgeholt();
    expect(ausstattungsAufgaben()).toHaveLength(3);

    const r = await aktion({ aktion: "streichen", ausstattungId: "aus-schluessel" });

    expect(r.status).toBe(200);
    expect(r.body.meldung).toBe(MELDUNGEN.KARTE_ENTFERNT);
    expect(db.ausstattungZeilen.map((z) => z.id)).toEqual(["aus-ipad"]);
    expect(ausstattungsAufgaben().map((a) => a.title)).toEqual(["Dienst-iPad (Lernmittel) bereitstellen"]);
    expect(db.ausstattungAufgaben.map((v) => v.ausstattungId)).toEqual(["aus-ipad"]);
    // Erst die Aufgaben, dann die Zeile (sonst bliebe die Aufgabe verwaist stehen).
    expect(fp.checklistItem.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(
      fp.onboardingAusstattung.delete.mock.invocationCallOrder[0],
    );
    expect(audits(AUSSTATTUNG_AUDIT.HR_GESTRICHEN)).toEqual([
      expect.objectContaining({
        userId: "u-hr",
        onboardingId: "onb-1",
        processType: "ONBOARDING",
        details: expect.objectContaining({ ausstattungId: "aus-schluessel", entfernt: true, aufgaben: 2 }),
      }),
    ]);
  });

  it("nach der Information: Zeile bleibt mit gestrichenAm, Aufgabe entfällt (F2), Eintrag ENTFAELLT", async () => {
    db.ausstattungZeilen = [ipad()];
    await nachgeholt();
    db.links = [link("IT")];
    const id = aufgabe("Dienst-iPad (Lernmittel) bereitstellen")?.id;

    const r = await aktion({ aktion: "streichen", ausstattungId: "aus-ipad" });

    expect(r.status).toBe(200);
    expect(r.body.meldung).toBe(`${MELDUNGEN.KARTE_GESTRICHEN} ${MELDUNGEN.KARTE_NACHTRAG_FOLGT}`);
    expect(db.ausstattungZeilen[0].gestrichenAm).toEqual(JETZT);
    expect(db.onboardingAufgaben.find((a) => a.id === id)).toMatchObject({
      entfaelltAm: JETZT,
      isCompleted: true,
      completedAt: JETZT,
      completedById: "u-hr",
    });
    expect(eintraege()).toEqual([["IT", "ENTFAELLT", "Dienst-iPad (Lernmittel) bereitstellen"]]);
    // Keine offene Aufgabe mehr: Die Abteilung gilt als fertig (F2).
    expect(db.links[0]).toMatchObject({ allTasksComplete: true });
    // Sperrreihenfolge Vorgang → Links → Aufgaben → Ausstattung.
    const vorgangSperre = fp.onboardingProcess.updateMany.mock.invocationCallOrder[0];
    const linkSperre = fp.offboardingDepartmentLink.updateMany.mock.invocationCallOrder[0];
    const aufgabeEntfaellt = fp.checklistItem.updateMany.mock.invocationCallOrder[0];
    const zeileGestrichen = fp.onboardingAusstattung.update.mock.invocationCallOrder[0];
    expect(vorgangSperre).toBeLessThan(linkSperre);
    expect(linkSperre).toBeLessThan(aufgabeEntfaellt);
    expect(aufgabeEntfaellt).toBeLessThan(zeileGestrichen);
  });

  it("mit erledigter Aufgabe → 409 AUFGABE_ERLEDIGT, nichts geändert", async () => {
    db.ausstattungZeilen = [ipad()];
    await nachgeholt();
    Object.assign(aufgabe("Dienst-iPad (Lernmittel) bereitstellen")!, { isCompleted: true, completedAt: JETZT });

    const r = await aktion({ aktion: "streichen", ausstattungId: "aus-ipad" });

    expect(r).toEqual({ status: 409, body: { error: MELDUNGEN.AUFGABE_ERLEDIGT, grund: "AUFGABE_ERLEDIGT" } });
    expect(db.ausstattungZeilen[0].gestrichenAm).toBeNull();
    expect(aufgabe("Dienst-iPad (Lernmittel) bereitstellen")?.entfaelltAm).toBeNull();
  });

  it("schon gestrichen → 409 GESTRICHEN; fremde Zeile → 404", async () => {
    db.ausstattungZeilen = [ipad({ gestrichenAm: tag("2026-09-21") }), schluessel({ onboardingId: "onb-anderer" })];
    expect(await aktion({ aktion: "streichen", ausstattungId: "aus-ipad" })).toEqual({
      status: 409,
      body: { error: MELDUNGEN.POSITION_GESTRICHEN, grund: "GESTRICHEN" },
    });
    expect(await aktion({ aktion: "streichen", ausstattungId: "aus-schluessel" })).toEqual({
      status: 404,
      body: { error: MELDUNGEN.POSITION_NICHT_GEFUNDEN },
    });
  });

  it("erneutes Hinzufügen einer gestrichenen Position nimmt sie samt ihrer Aufgabe wieder auf (F23)", async () => {
    db.ausstattungZeilen = [ipad()];
    await nachgeholt();
    db.links = [link("IT")];
    await aktion({ aktion: "streichen", ausstattungId: "aus-ipad" });
    const vorher = ausstattungsAufgaben();
    expect(vorher).toHaveLength(1);

    const r = await aktion({ aktion: "hinzufuegen", positionId: "pos-ipad" });

    expect(r.status).toBe(200);
    expect(r.body.meldung).toBe(`${MELDUNGEN.KARTE_WIEDER_AUFGENOMMEN} ${MELDUNGEN.KARTE_NACHTRAG_FOLGT}`);
    // Dieselbe Zeile, dieselbe Aufgabe — keine zweite.
    expect(db.ausstattungZeilen).toHaveLength(1);
    expect(db.ausstattungZeilen[0]).toMatchObject({ id: "aus-ipad", gestrichenAm: null, quelle: "FUEHRUNGSKRAFT" });
    expect(ausstattungsAufgaben()).toHaveLength(1);
    expect(ausstattungsAufgaben()[0]).toMatchObject({
      id: vorher[0].id,
      entfaelltAm: null,
      isCompleted: false,
      completedAt: null,
      completedById: null,
      // Faelligkeit neu nach Regel 14 (Beginn − 5 Tage liegt noch vor uns).
      dueDate: tag("2026-09-26"),
      eilt: false,
    });
    expect(eintraege()).toEqual([
      ["IT", "ENTFAELLT", "Dienst-iPad (Lernmittel) bereitstellen"],
      ["IT", "NEU", "Dienst-iPad (Lernmittel) bereitstellen"],
    ]);
    // Wieder offen: Die fertige Abteilung ist wieder offen.
    expect(db.links[0]).toMatchObject({ allTasksComplete: false });
  });
});

describe("Ändern", () => {
  it("Option abwählen vor der Information: Aufgabe gelöscht", async () => {
    db.ausstattungZeilen = [schluessel()];
    await nachgeholt();

    const r = await aktion({ aktion: "aendern", ausstattungId: "aus-schluessel", auswahl: ["Haupteingang"] });

    expect(r.status).toBe(200);
    expect(db.ausstattungZeilen[0].auswahl).toEqual(["Haupteingang"]);
    expect(ausstattungsAufgaben().map((a) => a.title)).toEqual(["Schlüssel ausgeben: Haupteingang"]);
    expect(db.ausstattungAufgaben.map((v) => v.option)).toEqual(["Haupteingang"]);
    expect(db.ausstattungAenderungen).toEqual([]);
  });

  it("Option abwählen nach der Information: Aufgabe entfällt; wieder anwählen öffnet dieselbe Aufgabe (F23)", async () => {
    db.ausstattungZeilen = [schluessel()];
    await nachgeholt();
    db.links = [link("FACILITY")];
    const lehrer = aufgabe("Schlüssel ausgeben: Lehrerzimmer");

    await aktion({ aktion: "aendern", ausstattungId: "aus-schluessel", auswahl: ["Haupteingang"] });
    expect(lehrer && db.onboardingAufgaben.find((a) => a.id === lehrer.id)).toMatchObject({
      isCompleted: true,
      entfaelltAm: JETZT,
    });
    expect(eintraege()).toEqual([["FACILITY", "ENTFAELLT", "Schlüssel ausgeben: Lehrerzimmer"]]);

    const r = await aktion({ aktion: "aendern", ausstattungId: "aus-schluessel", auswahl: ["Haupteingang", "Lehrerzimmer"] });

    expect(r.status).toBe(200);
    expect(ausstattungsAufgaben()).toHaveLength(2);
    expect(db.onboardingAufgaben.find((a) => a.id === lehrer?.id)).toMatchObject({
      isCompleted: false,
      entfaelltAm: null,
      assignee: "FACILITY",
    });
    expect(eintraege()).toEqual([
      ["FACILITY", "ENTFAELLT", "Schlüssel ausgeben: Lehrerzimmer"],
      ["FACILITY", "NEU", "Schlüssel ausgeben: Lehrerzimmer"],
    ]);
  });

  it("eine neue Option bekommt eine neue Aufgabe (Nachholen), eine erledigte lässt sich nicht abwählen", async () => {
    db.ausstattungZeilen = [schluessel()];
    await nachgeholt();
    Object.assign(aufgabe("Schlüssel ausgeben: Haupteingang")!, { isCompleted: true, completedAt: JETZT });

    expect(await aktion({ aktion: "aendern", ausstattungId: "aus-schluessel", auswahl: ["Lehrerzimmer"] })).toEqual({
      status: 409,
      body: { error: MELDUNGEN.AUFGABE_ERLEDIGT, grund: "AUFGABE_ERLEDIGT" },
    });
    expect(db.ausstattungZeilen[0].auswahl).toEqual(["Haupteingang", "Lehrerzimmer"]);

    const r = await aktion({
      aktion: "aendern",
      ausstattungId: "aus-schluessel",
      auswahl: ["Haupteingang", "Lehrerzimmer", "Fachraum Chemie"],
    });
    expect(r.status).toBe(200);
    expect(aufgabe("Schlüssel ausgeben: Fachraum Chemie")).toMatchObject({ assignee: "FACILITY", herkunft: "AUSSTATTUNG" });
  });

  it("Bemerkung der Führungskraft, von HR geändert → BEIDE; Eintrag GEAENDERT bei informierter Stelle", async () => {
    db.ausstattungZeilen = [ipad()];
    await nachgeholt();
    db.links = [link("IT")];

    const r = await aktion({ aktion: "aendern", ausstattungId: "aus-ipad", bemerkung: "Mit Stift, ohne Hülle" });

    expect(r.status).toBe(200);
    expect(db.ausstattungZeilen[0]).toMatchObject({ bemerkung: "Mit Stift, ohne Hülle", bemerkungQuelle: "BEIDE" });
    expect(eintraege()).toEqual([["IT", "GEAENDERT", "Dienst-iPad (Lernmittel) bereitstellen"]]);
    const u = r.body.data as AusstattungsUebersicht;
    expect(u.gruppen[0].zeilen[0].bemerkung).toEqual({
      text: "Mit Stift, ohne Hülle",
      label: "Bemerkung der Führungskraft, ergänzt durch die Personalabteilung",
    });
  });

  it("dieselbe Bemerkung noch einmal: keine Änderung, kein Protokoll", async () => {
    db.ausstattungZeilen = [ipad()];
    const r = await aktion({ aktion: "aendern", ausstattungId: "aus-ipad", bemerkung: "  Mit Stift und Hülle " });
    expect(r.status).toBe(200);
    expect(r.body.meldung).toBe(MELDUNGEN.KARTE_UNVERAENDERT);
    expect(audits(AUSSTATTUNG_AUDIT.HR_GEAENDERT)).toEqual([]);
    expect(db.ausstattungZeilen[0].bemerkungQuelle).toBe("FUEHRUNGSKRAFT");
  });

  it("Stellenwechsel: Aufgabe zieht mit, Einträge für beide Stellen, beide Links neu berechnet", async () => {
    db.ausstattungZeilen = [ipad()];
    await nachgeholt();
    db.links = [link("IT"), link("FACILITY", { allTasksComplete: true, completedAt: tag("2026-09-21") })];
    const id = aufgabe("Dienst-iPad (Lernmittel) bereitstellen")?.id;

    const r = await aktion({ aktion: "aendern", ausstattungId: "aus-ipad", departmentKey: "FACILITY" });

    expect(r.status).toBe(200);
    expect(db.ausstattungZeilen[0].departmentKey).toBe("FACILITY");
    expect(db.onboardingAufgaben.find((a) => a.id === id)?.assignee).toBe("FACILITY");
    expect(eintraege()).toEqual([
      ["IT", "ENTFAELLT", "Dienst-iPad (Lernmittel) bereitstellen"],
      ["FACILITY", "NEU", "Dienst-iPad (Lernmittel) bereitstellen"],
    ]);
    // IT hat nichts Offenes mehr, Facility wieder etwas.
    expect(db.links.find((l) => l.departmentKey === "IT")).toMatchObject({ allTasksComplete: true });
    expect(db.links.find((l) => l.departmentKey === "FACILITY")).toMatchObject({ allTasksComplete: false, completedAt: null });
    expect(audits(ABTEILUNGS_AUDIT.ABTEILUNG_FERTIG).map((a) => (a.details as Zeile).departmentKey)).toEqual(["IT"]);
    expect(audits(ABTEILUNGS_AUDIT.ABTEILUNG_WIEDER_OFFEN).map((a) => (a.details as Zeile).departmentKey)).toEqual([
      "FACILITY",
    ]);
    // Beide Links gesperrt, bevor eine Aufgabe umgehaengt wurde.
    const gesperrt = fp.offboardingDepartmentLink.updateMany.mock.calls
      .slice(0, 2)
      .map((c) => (c[0] as { where: Zeile }).where.departmentKey);
    expect(gesperrt).toEqual(["FACILITY", "IT"]);
  });

  it("Stellenwechsel: mit Tagesangabe neue Fälligkeit wie F23 — nie vor heute, sonst „Eilt“", async () => {
    // Vertragsbeginn 24.09.: regulaer 19.09. (−5), am 22.09. also verstrichen.
    db.onboardingVorgaenge = [
      vorgang({ supervisorData: { isComplete: true, mitAusstattung: true, vertragsbeginn: tag("2026-09-24") } }),
    ];
    db.ausstattungZeilen = [ipad()];
    await nachgeholt();
    db.links = [link("IT"), link("FACILITY")];
    // Stand wie bei IT laengst zugestellt: Frist 19.09., nie angehoben.
    const ipadAufgabe = aufgabe("Dienst-iPad (Lernmittel) bereitstellen")!;
    Object.assign(ipadAufgabe, { dueDate: tag("2026-09-19"), eilt: false, createdAt: new Date("2026-09-15T08:00:00.000Z") });

    const r = await aktion({ aktion: "aendern", ausstattungId: "aus-ipad", departmentKey: "FACILITY" });

    expect(r.status).toBe(200);
    // Fuer Facility ist sie neu: nicht ueberfaellig hinaus, sondern heute und „Eilt“.
    expect(db.onboardingAufgaben.find((a) => a.id === ipadAufgabe.id)).toMatchObject({
      assignee: "FACILITY",
      dueDate: tag("2026-09-22"),
      eilt: true,
      relativeDueDays: -5,
    });
  });

  it("Stellenwechsel ohne Tagesangabe: Fälligkeit bleibt — der Versand an die neue Stelle hebt sie an (F22, offener Eintrag NEU)", async () => {
    // Freie Position ohne Tagesangabe, Frist von Hand 23.09., IT laengst informiert.
    db.ausstattungZeilen = [
      neueAusstattungsZeile({
        id: "aus-frei",
        onboardingId: "onb-1",
        departmentKey: "IT",
        art: "JA_NEIN",
        bezeichnung: "Funkgerät",
        aufgabeTitel: "Funkgerät bereitstellen",
        relativeDueDays: null,
        reihenfolge: 99,
        quelle: "HR",
      }),
    ];
    await nachgeholt();
    db.links = [link("IT"), link("FACILITY")];
    const frei = aufgabe("Funkgerät bereitstellen")!;
    Object.assign(frei, { dueDate: tag("2026-09-23"), createdAt: new Date("2026-09-15T08:00:00.000Z") });

    await aktion({ aktion: "aendern", ausstattungId: "aus-frei", departmentKey: "FACILITY" });
    expect(db.onboardingAufgaben.find((a) => a.id === frei.id)).toMatchObject({
      assignee: "FACILITY",
      dueDate: tag("2026-09-23"),
      eilt: false,
    });
    expect(eintraege()).toContainEqual(["FACILITY", "NEU", "Funkgerät bereitstellen"]);

    // Drei Tage spaeter „Nachtrag senden“ an Facility: Die Aufgabe ist aelter
    // als deren letzter Versand (21.09.), Facility bekommt sie aber erst jetzt.
    const SPAETER = new Date("2026-09-25T08:00:00.000Z");
    await onboardingAusstattungNachholenIn(tx, "onb-1", { userId: "u-hr", jetzt: SPAETER, versandAn: ["FACILITY"] });
    expect(db.onboardingAufgaben.find((a) => a.id === frei.id)).toMatchObject({ dueDate: tag("2026-09-25"), eilt: true });
    expect(audits(AUSSTATTUNG_AUDIT.FAELLIGKEIT_ANGEHOBEN).map((a) => a.details)).toEqual([
      { anzahl: 1, stellen: ["FACILITY"] },
    ]);

    // Nach dem Nachtrag (Eintraege gesendet) gilt sie als zugestellt: Ein
    // spaeteres „Erneut senden“ setzt die verstrichene Frist nicht zurueck.
    for (const e of db.ausstattungAenderungen) e.gesendetAm = SPAETER;
    Object.assign(db.links.find((l) => l.departmentKey === "FACILITY")!, { lastSentAt: SPAETER });
    const NOCH_SPAETER = new Date("2026-09-28T08:00:00.000Z");
    await onboardingAusstattungNachholenIn(tx, "onb-1", { userId: "u-hr", jetzt: NOCH_SPAETER, versandAn: ["FACILITY"] });
    expect(db.onboardingAufgaben.find((a) => a.id === frei.id)).toMatchObject({ dueDate: tag("2026-09-25") });
  });

  it("Stellenwechsel: die alte Stelle sieht an ihrer entfallenen Aufgabe keine Bemerkung mehr (Regel 8)", async () => {
    db.ausstattungZeilen = [schluessel({ bemerkung: "Zugang ohne Stufen", bemerkungQuelle: "FUEHRUNGSKRAFT" })];
    await nachgeholt();
    db.links = [link("FACILITY"), link("IT")];

    // Facility informiert: Lehrerzimmer abgewaehlt (entfaellt dort), dann geht die Position an die IT.
    expect((await aktion({ aktion: "aendern", ausstattungId: "aus-schluessel", auswahl: ["Haupteingang"] })).status).toBe(200);
    expect((await aktion({ aktion: "aendern", ausstattungId: "aus-schluessel", departmentKey: "IT" })).status).toBe(200);
    expect(aufgabe("Schlüssel ausgeben: Lehrerzimmer")).toMatchObject({ assignee: "FACILITY", isCompleted: true });
    expect(aufgabe("Schlüssel ausgeben: Haupteingang")).toMatchObject({ assignee: "IT", isCompleted: false });
    // Spaeter ergaenzt HR die Bemerkung — sie gilt nur noch der IT.
    expect(
      (await aktion({ aktion: "aendern", ausstattungId: "aus-schluessel", bemerkung: "Zugang ohne Stufen, Rampe hinten" })).status,
    ).toBe(200);

    const facility = await oeffentlicheOnboardingAufgabenLaden("tok-FACILITY", JETZT);
    expect(facility.status).toBe(200);
    const fmAufgaben = (facility.body.data as { aufgaben: Zeile[] }).aufgaben;
    expect(fmAufgaben.find((a) => a.title === "Schlüssel ausgeben: Lehrerzimmer")).toMatchObject({
      entfaellt: true,
      bemerkung: null,
    });
    expect(JSON.stringify(facility.body)).not.toContain("Zugang ohne Stufen");

    const itSeite = await oeffentlicheOnboardingAufgabenLaden("tok-IT", JETZT);
    const itAufgaben = (itSeite.body.data as { aufgaben: Zeile[] }).aufgaben;
    expect(itAufgaben.find((a) => a.title === "Schlüssel ausgeben: Haupteingang")).toMatchObject({
      entfaellt: false,
      bemerkung: { text: "Zugang ohne Stufen, Rampe hinten" },
    });
  });

  it("Stellenwechsel mit erledigter Aufgabe → 409", async () => {
    db.ausstattungZeilen = [ipad()];
    await nachgeholt();
    Object.assign(aufgabe("Dienst-iPad (Lernmittel) bereitstellen")!, { isCompleted: true, completedAt: JETZT });
    expect(await aktion({ aktion: "aendern", ausstattungId: "aus-ipad", departmentKey: "FACILITY" })).toMatchObject({
      status: 409,
      body: { grund: "AUFGABE_ERLEDIGT" },
    });
  });

  it("Fälligkeit je Option; `null` räumt auch die Tagesangabe ab — kein Eintrag, „Eilt“ fällt (R14)", async () => {
    db.ausstattungZeilen = [schluessel()];
    await nachgeholt();
    db.links = [link("FACILITY")];
    // Beide beim Versand angehoben — eine Frist von Hand ist es nicht mehr.
    for (const a of ausstattungsAufgaben()) Object.assign(a, { dueDate: tag("2026-09-22"), eilt: true });

    const r = await aktion({
      aktion: "aendern",
      ausstattungId: "aus-schluessel",
      faelligkeiten: [
        { option: "Haupteingang", dueDate: "2026-09-28" },
        { option: "Lehrerzimmer", dueDate: null },
      ],
    });

    expect(r.status).toBe(200);
    expect(aufgabe("Schlüssel ausgeben: Haupteingang")).toMatchObject({
      dueDate: tag("2026-09-28"),
      relativeDueDays: -7,
      eilt: false,
    });
    expect(aufgabe("Schlüssel ausgeben: Lehrerzimmer")).toMatchObject({ dueDate: null, relativeDueDays: null, eilt: false });
    expect(db.ausstattungAenderungen).toEqual([]);
  });

  it("Felder, die nicht zur Art passen → 400", async () => {
    db.ausstattungZeilen = [ipad()];
    expect(await aktion({ aktion: "aendern", ausstattungId: "aus-ipad", auswahl: ["A"] })).toEqual({
      status: 400,
      body: { error: MELDUNGEN.KARTE_PASST_NICHT_ZUR_ART },
    });
    expect(await aktion({ aktion: "aendern", ausstattungId: "aus-ipad", angabe: "x" })).toEqual({
      status: 400,
      body: { error: MELDUNGEN.KARTE_PASST_NICHT_ZUR_ART },
    });
  });
});

// =============================================
// Hinweise an Stellen (E-A14, F20)
// =============================================

describe("Hinweise", () => {
  it("zur Kenntnis genommen: nur gesehenAm, kein Eintrag; ein zweites Mal ohne Protokoll", async () => {
    db.stellenHinweise = [hinweis("IT", "Bitte Mac statt PC")];
    await nachgeholt();
    db.links = [link("IT")];

    const r = await aktion({ aktion: "hinweis-gesehen", departmentKey: "IT" });
    expect(r.status).toBe(200);
    expect(db.stellenHinweise[0].gesehenAm).toEqual(JETZT);
    expect(db.ausstattungAenderungen).toEqual([]);
    await aktion({ aktion: "hinweis-gesehen", departmentKey: "IT" });
    expect(audits(AUSSTATTUNG_AUDIT.HINWEIS_GESEHEN)).toHaveLength(1);
    expect(await aktion({ aktion: "hinweis-gesehen", departmentKey: "FACILITY" })).toEqual({
      status: 404,
      body: { error: MELDUNGEN.HINWEIS_NICHT_GEFUNDEN },
    });
  });

  it("als Position übernehmen: Position angelegt, gesehen, die Hinweis-Aufgabe bleibt unverändert", async () => {
    db.stellenHinweise = [hinweis("IT", "Bitte Mac statt PC")];
    await nachgeholt();
    const hinweisAufgabe = { ...aufgabe(HINWEIS_AUFGABE_TITEL) };

    const r = await aktion({
      aktion: "hinweis-uebernehmen",
      departmentKey: "IT",
      frei: { departmentKey: "IT", bezeichnung: "MacBook Air" },
    });

    expect(r.status).toBe(200);
    expect(r.body.meldung).toBe(MELDUNGEN.KARTE_HINWEIS_UEBERNOMMEN);
    expect(db.ausstattungZeilen[0]).toMatchObject({ bezeichnung: "MacBook Air", quelle: "HR" });
    expect(aufgabe("MacBook Air bereitstellen")).toBeDefined();
    expect(aufgabe(HINWEIS_AUFGABE_TITEL)).toEqual(hinweisAufgabe);
    expect(db.stellenHinweise[0]).toMatchObject({ text: "Bitte Mac statt PC", gesehenAm: JETZT });
    expect(audits(AUSSTATTUNG_AUDIT.HINWEIS_UEBERNOMMEN)).toHaveLength(1);
  });

  it("neu von HR: quelle HR, Aufgabe angelegt (Fälligkeit −7 Tage, F20)", async () => {
    const r = await aktion({ aktion: "hinweis-aendern", departmentKey: "FACILITY", hinweis: "Spind im Keller" });

    expect(r.status).toBe(200);
    expect(db.stellenHinweise).toEqual([
      expect.objectContaining({ departmentKey: "FACILITY", text: "Spind im Keller", quelle: "HR" }),
    ]);
    const a = aufgabe(HINWEIS_AUFGABE_TITEL);
    expect(a).toMatchObject({ assignee: "FACILITY", herkunft: "HINWEIS", dueDate: tag("2026-09-24") });
    expect(db.stellenHinweise[0].checklistItemId).toBe(a?.id);
  });

  it("Text der Führungskraft geändert → BEIDE, Eintrag GEAENDERT", async () => {
    db.stellenHinweise = [hinweis("IT", "Bitte Mac statt PC")];
    await nachgeholt();
    db.links = [link("IT")];

    await aktion({ aktion: "hinweis-aendern", departmentKey: "IT", hinweis: "Bitte Mac statt PC, mit Dock" });

    expect(db.stellenHinweise[0]).toMatchObject({ text: "Bitte Mac statt PC, mit Dock", quelle: "BEIDE" });
    expect(eintraege()).toEqual([["IT", "GEAENDERT", HINWEIS_AUFGABE_TITEL]]);
  });

  it("entfernt vor der Information: Aufgabe und Zeile weg", async () => {
    db.stellenHinweise = [hinweis("IT", "Bitte Mac statt PC")];
    await nachgeholt();

    const r = await aktion({ aktion: "hinweis-aendern", departmentKey: "IT", hinweis: "" });

    expect(r.body.meldung).toBe(MELDUNGEN.KARTE_HINWEIS_ENTFERNT);
    expect(db.stellenHinweise).toEqual([]);
    expect(ausstattungsAufgaben()).toEqual([]);
  });

  it("entfernt nach der Information: Text \"\", Aufgabe entfällt, Eintrag ENTFAELLT — wieder gefüllt öffnet sie wieder", async () => {
    db.stellenHinweise = [hinweis("IT", "Bitte Mac statt PC")];
    await nachgeholt();
    db.links = [link("IT")];
    const id = aufgabe(HINWEIS_AUFGABE_TITEL)?.id;

    await aktion({ aktion: "hinweis-aendern", departmentKey: "IT", hinweis: "" });
    expect(db.stellenHinweise[0]).toMatchObject({ text: "", checklistItemId: id });
    expect(aufgabe(HINWEIS_AUFGABE_TITEL)).toMatchObject({ isCompleted: true, entfaelltAm: JETZT });
    expect(eintraege()).toEqual([["IT", "ENTFAELLT", HINWEIS_AUFGABE_TITEL]]);

    const r = await aktion({ aktion: "hinweis-aendern", departmentKey: "IT", hinweis: "Doch ein Mac" });

    expect(r.status).toBe(200);
    expect(db.stellenHinweise[0]).toMatchObject({ text: "Doch ein Mac", quelle: "HR", checklistItemId: id });
    expect(ausstattungsAufgaben()).toHaveLength(1);
    expect(aufgabe(HINWEIS_AUFGABE_TITEL)).toMatchObject({ id, isCompleted: false, entfaelltAm: null });
    expect(eintraege()).toEqual([
      ["IT", "ENTFAELLT", HINWEIS_AUFGABE_TITEL],
      ["IT", "NEU", HINWEIS_AUFGABE_TITEL],
    ]);
  });

  it("erledigte Hinweis-Aufgabe: Ändern, Entfernen und Fälligkeit → 409", async () => {
    db.stellenHinweise = [hinweis("IT", "Bitte Mac statt PC")];
    await nachgeholt();
    Object.assign(aufgabe(HINWEIS_AUFGABE_TITEL)!, { isCompleted: true, completedAt: JETZT });

    for (const body of [
      { hinweis: "Anders" },
      { hinweis: "" },
      { dueDate: "2026-09-28" },
    ]) {
      expect(await aktion({ aktion: "hinweis-aendern", departmentKey: "IT", ...body })).toEqual({
        status: 409,
        body: { error: MELDUNGEN.AUFGABE_ERLEDIGT, grund: "AUFGABE_ERLEDIGT" },
      });
    }
    expect(db.stellenHinweise[0].text).toBe("Bitte Mac statt PC");
  });

  it("Fälligkeit der Hinweis-Aufgabe setzen; `null` räumt die Tagesangabe ab — „Eilt“ fällt beide Male (R14)", async () => {
    db.stellenHinweise = [hinweis("IT", "Bitte Mac statt PC")];
    await nachgeholt();
    Object.assign(aufgabe(HINWEIS_AUFGABE_TITEL)!, { dueDate: tag("2026-09-22"), eilt: true });

    await aktion({ aktion: "hinweis-aendern", departmentKey: "IT", dueDate: "2026-09-28" });
    expect(aufgabe(HINWEIS_AUFGABE_TITEL)).toMatchObject({ dueDate: tag("2026-09-28"), relativeDueDays: -7, eilt: false });

    Object.assign(aufgabe(HINWEIS_AUFGABE_TITEL)!, { eilt: true });
    await aktion({ aktion: "hinweis-aendern", departmentKey: "IT", dueDate: null });
    expect(aufgabe(HINWEIS_AUFGABE_TITEL)).toMatchObject({ dueDate: null, relativeDueDays: null, eilt: false });
    expect(db.ausstattungAenderungen).toEqual([]);
  });
});

// =============================================
// Protokoll und Karte laden
// =============================================

// =============================================
// A4 (S23): Merker ausgabenAngeboten, „Beim Austritt“ an der freien Position
// =============================================

describe("A4: Merker ausgabenAngeboten (E-A36)", () => {
  const FORMULAR_VORGANG = {
    id: "onb-1",
    organizationId: "org-1",
    arbeitsortId: null,
    questionnaireType: "STANDARD",
    processType: "EINSTELLUNG",
  };

  it("Speichern des Schritts: true, sobald der Ausschnitt eine Position mit RUECKGABE oder SPERREN führt", async () => {
    db.ausstattungsPositionen.find((p) => p.id === "pos-laptop")!.beiAustritt = "RUECKGABE";
    db.ausstattungsPositionen.find((p) => p.id === "pos-laptop")!.rueckgabeKategorie = "IT_HARDWARE";
    // Gewaehlt ist nur das iPad — es zaehlt, was angeboten war.
    await fuehrungskraftWahlSpeichernIn(tx, FORMULAR_VORGANG, { ausstattung: [{ positionId: "pos-ipad", gewaehlt: true }] }, JETZT);
    expect(fp.supervisorData.update).toHaveBeenCalledWith({
      where: { onboardingId: "onb-1" },
      data: { ausstattungGespeichertAm: JETZT, ausgabenAngeboten: true },
    });
  });

  it("Speichern des Schritts: false ohne solche Position (NICHTS, leer, Angabe zählen nicht)", async () => {
    db.ausstattungsPositionen.find((p) => p.id === "pos-laptop")!.beiAustritt = "NICHTS";
    await fuehrungskraftWahlSpeichernIn(tx, FORMULAR_VORGANG, { ausstattung: [] }, JETZT);
    expect(fp.supervisorData.update).toHaveBeenCalledWith({
      where: { onboardingId: "onb-1" },
      data: { ausstattungGespeichertAm: JETZT, ausgabenAngeboten: false },
    });
  });

  it("ohne Eingabe zur Ausstattung: nichts geschrieben, auch kein Merker", async () => {
    await fuehrungskraftWahlSpeichernIn(tx, FORMULAR_VORGANG, {}, JETZT);
    expect(fp.supervisorData.update).not.toHaveBeenCalled();
  });

  it("Abgabe: nur mit mitAusstattung und nur solange der Merker null ist — sonst ohne Abfrage", async () => {
    db.ausstattungsPositionen.find((p) => p.id === "pos-ipad")!.beiAustritt = "SPERREN";
    // Ohne den Schritt bleibt er null.
    for (const supervisorData of [null, { mitAusstattung: false, ausgabenAngeboten: null }, { mitAusstattung: null }]) {
      await ausgabenAngebotenBeiAbgabeIn(tx, { ...FORMULAR_VORGANG, supervisorData });
    }
    // Schon gesetzt (der Schritt wurde gespeichert): bleibt.
    await ausgabenAngebotenBeiAbgabeIn(tx, { ...FORMULAR_VORGANG, supervisorData: { mitAusstattung: true, ausgabenAngeboten: false } });
    expect(fp.supervisorData.updateMany).not.toHaveBeenCalled();
    expect(fp.ausstattungsPosition.findMany).not.toHaveBeenCalled();

    await ausgabenAngebotenBeiAbgabeIn(tx, { ...FORMULAR_VORGANG, supervisorData: { mitAusstattung: true, ausgabenAngeboten: null } });
    expect(fp.supervisorData.updateMany).toHaveBeenCalledWith({
      where: { onboardingId: "onb-1", ausgabenAngeboten: null },
      data: { ausgabenAngeboten: true },
    });
  });
});

describe("A4: „Beim Austritt“ an der freien Position (G8)", () => {
  it("frei mit RUECKGABE und Kategorie: die Momentaufnahme trägt beides, ohne Kennungsbeschriftung", async () => {
    const r = await aktion({
      aktion: "hinzufuegen",
      frei: { departmentKey: "IT", bezeichnung: "Dokumentenkamera", beiAustritt: "RUECKGABE", rueckgabeKategorie: "IT_HARDWARE" },
    });
    expect(r.status).toBe(200);
    expect(db.ausstattungZeilen[0]).toMatchObject({
      positionId: null,
      beiAustritt: "RUECKGABE",
      rueckgabeKategorie: "IT_HARDWARE",
      ausgabeKennung: null,
    });
  });

  it("frei mit SPERREN; ohne Angabe bleibt alles leer wie bisher", async () => {
    await aktion({ aktion: "hinzufuegen", frei: { departmentKey: "IT", bezeichnung: "VPN-Zugang", beiAustritt: "SPERREN" } });
    await aktion({ aktion: "hinzufuegen", frei: { departmentKey: "IT", bezeichnung: "Headset" } });
    expect(db.ausstattungZeilen.map((z) => [z.bezeichnung, z.beiAustritt, z.rueckgabeKategorie])).toEqual([
      ["VPN-Zugang", "SPERREN", null],
      ["Headset", null, null],
    ]);
  });

  it("RUECKGABE ohne Kategorie → 400 aus derselben Regel wie im Katalog, nichts geschrieben", async () => {
    const r = await aktion({ aktion: "hinzufuegen", frei: { departmentKey: "IT", bezeichnung: "Tablet", beiAustritt: "RUECKGABE" } });
    expect(r).toEqual({ status: 400, body: { error: MELDUNGEN.RUECKGABEKATEGORIE_FEHLT } });
    expect(db.ausstattungZeilen).toEqual([]);
  });
});

describe("Protokoll und Karte", () => {
  it("das Protokoll nennt IDs, Schlüssel, Titel und Längen — nie Bemerkung, Angabe oder Hinweis", async () => {
    db.links = [link("IT")];
    await aktion({ aktion: "hinzufuegen", positionId: "pos-laptop", bemerkung: "Geheime Bemerkung" });
    await aktion({ aktion: "hinzufuegen", positionId: "pos-faecher", angabe: "Religion" });
    await aktion({ aktion: "hinweis-aendern", departmentKey: "IT", hinweis: "Geheimer Hinweis" });

    const text = JSON.stringify(db.audits);
    expect(text).not.toContain("Geheime Bemerkung");
    expect(text).not.toContain("Religion");
    expect(text).not.toContain("Geheimer Hinweis");
    expect(audits(AUSSTATTUNG_AUDIT.HR_HINZUGEFUEGT)[0].details).toMatchObject({
      positionId: "pos-laptop",
      departmentKey: "IT",
      bezeichnung: "Dienst-Laptop / PC",
      bemerkungLaenge: "Geheime Bemerkung".length,
    });
    expect(audits(AUSSTATTUNG_AUDIT.HINWEIS_GEAENDERT)[0].details).toMatchObject({
      departmentKey: "IT",
      art: "NEU",
      laenge: "Geheimer Hinweis".length,
    });
  });

  it("ausstattungKarteLaden: nur HR, 404 für unbekannt, sonst die Übersicht", async () => {
    db.ausstattungZeilen = [ipad()];
    expect(
      await ausstattungKarteLaden({ onboardingId: "onb-1", session: { ...HR, role: "SERVICE" }, jetzt: JETZT }),
    ).toEqual({ status: 403, body: { error: "Keine Berechtigung" } });
    expect(await ausstattungKarteLaden({ onboardingId: "nix", session: HR, jetzt: JETZT })).toEqual({
      status: 404,
      body: { error: ABTEILUNGS_MELDUNGEN.ONBOARDING_VORGANG_NICHT_GEFUNDEN },
    });
    const r = await ausstattungKarteLaden({ onboardingId: "onb-1", session: HR, jetzt: JETZT });
    expect(r.status).toBe(200);
    const u = (r.body as { data: AusstattungsUebersicht }).data;
    expect(u.zustand).toBe("BEARBEITBAR");
    // Reihenfolge der Abteilungskarte (IT vor Facility), dann orderIndex.
    expect(u.hinzufuegbar.map((h) => h.positionId)).toEqual(["pos-laptop", "pos-faecher", "pos-schluessel"]);
    // Laden schreibt nichts.
    expect(fp.onboardingProcess.updateMany).not.toHaveBeenCalled();
    expect(db.onboardingAufgaben).toEqual([]);
  });

  it("eine Vorlagenaufgabe bleibt unberührt", async () => {
    db.onboardingAufgaben = [
      neueOnboardingAufgabe({ id: "i-konto", onboardingId: "onb-1", title: "Konto anlegen", assignee: "IT" }),
    ];
    db.ausstattungZeilen = [ipad()];
    await nachgeholt();
    db.links = [link("IT")];
    const vorlage = structuredClone(db.onboardingAufgaben.find((a) => a.id === "i-konto"));

    await aktion({ aktion: "streichen", ausstattungId: "aus-ipad" });

    expect(db.onboardingAufgaben.find((a) => a.id === "i-konto")).toEqual(vorlage);
  });
});
