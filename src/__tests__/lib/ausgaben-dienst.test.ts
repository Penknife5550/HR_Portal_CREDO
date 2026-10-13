/**
 * Tests: Ausgaben in der Karte „Ausstattung & Zugänge“ (Feinplan A4, S24)
 *
 * src/lib/ausgaben-dienst.ts (`ausgabenAktionAusfuehren`) samt Schreiber
 * (src/lib/ausgaben-schreiben.ts) und Lesen (src/lib/ausgaben-daten.ts) gegen
 * die In-Memory-Datenbank (src/__tests__/hilfen/abteilungs-fake-db.ts, seit
 * S24 mit der Tabelle `ausgabe`). Abgedeckt: Vermerk an offener und an
 * erledigter Aufgabe, entfallen bzw. ohne `beiAustritt` (409), Grenzen und
 * Datum (400), jeder Status (auch COMPLETED und EXPIRED, G7), Tausch DEFEKT
 * und VERLOREN mit Frist und `ersetztDurchId`, „zurückgenommen“, Entfernen,
 * die Bindung an einen Austritt nach G28 (Bezug NACH der Sperre gelesen,
 * Vorgangsnummer nur mit Zugriff), fremder Mandant, Protokoll ohne Kennung,
 * die Loeschmerker und die Uebersicht der Karte (Ausgaben je Aufgabe,
 * Protokollzeile G19).
 *
 * Die Austrittsbezuege (Offboarding-Aufgaben und Rueckgaben mit `ausgabeId`)
 * kennt die Fake-DB nicht: `austrittsBezuegeLaden` laeuft hier ECHT, aber
 * gegen einen eigenen kleinen mockPrisma (`mockBezugDb`). Der Fake rollt bei
 * einer Ausnahme nicht zurueck – Abweisungen werden daran geprueft, dass VOR
 * dem ersten Schreiben abgewiesen wird.
 *
 * Seit S29 kennt die Fake-DB Rueckgaben und Ausgabe-Aufgaben des Austritts:
 * Der Fall „echter Ablauf“ leitet `mockBezugDb` auf sie um und laesst die
 * Zuordnung eines zweiten Austritts (src/lib/offboarding-ausgaben.ts) echt
 * schreiben – danach antwortet die Karte 409 AUSGABE_IM_AUSTRITT.
 */

const mockBezugDb = {
  offboardingChecklistItem: { findMany: jest.fn() },
  returnItem: { findMany: jest.fn() },
  offboardingProcess: { findMany: jest.fn() },
};

jest.mock("@/lib/db", () => ({
  prisma: jest.requireActual("../hilfen/abteilungs-fake-db").fakePrisma,
}));
jest.mock("@/lib/webhooks", () => ({ triggerWebhooks: jest.fn() }));
jest.mock("@/lib/permissions", () => {
  const echt = jest.requireActual("@/lib/permissions");
  return { ...echt, canAccessProcess: jest.fn(echt.canAccessProcess) };
});
jest.mock("@/lib/ausgaben-daten", () => {
  const echt = jest.requireActual("@/lib/ausgaben-daten");
  return {
    ...echt,
    austrittsBezuegeLaden: jest.fn((_db: unknown, ids: string[], opts: unknown) =>
      echt.austrittsBezuegeLaden(mockBezugDb, ids, opts),
    ),
  };
});

import type { Prisma } from "@prisma/client";
import {
  db,
  dbLeeren,
  fakePrisma,
  neueAusgabe,
  neueAusstattungsZeile,
  neueOffboardingAufgabe,
  neueOnboardingAufgabe,
  neueRueckgabe,
  passt,
  projizieren,
  type Zeile,
} from "../hilfen/abteilungs-fake-db";
import { ausgabenAktionAusfuehren } from "@/lib/ausgaben-dienst";
import { einstellungAktionAusfuehren } from "@/lib/offboarding-ausgaben";
import { austrittsBezuegeLaden } from "@/lib/ausgaben-daten";
import { ausstattungKarteLaden } from "@/lib/ausstattung-dienst";
import { MELDUNGEN as ABTEILUNGS_MELDUNGEN } from "@/lib/abteilungsaufgaben";
import { AUSGABEN_AUDIT, MELDUNGEN_AUSGABEN, type AusgabenAufgabeAnzeige } from "@/lib/ausgaben";
import type { AusstattungsUebersicht } from "@/lib/ausstattung";
import { canAccessProcess, type SessionPayload } from "@/lib/permissions";

type FakeTabelle = Record<string, jest.Mock>;
const fp = fakePrisma as unknown as Record<string, FakeTabelle>;
const echtRechte = jest.requireActual<typeof import("@/lib/permissions")>("@/lib/permissions");
const echtDaten = jest.requireActual<typeof import("@/lib/ausgaben-daten")>("@/lib/ausgaben-daten");
const mockZugriff = canAccessProcess as jest.Mock;

// Der Katalogausschnitt der Uebersicht liest die Einrichtungsart des Arbeitsorts;
// der Reiter „Rückgaben“ (S29) die Namen der Einrichtungen.
fp.organization = {
  findUnique: jest.fn(async () => ({ type: "GYMNASIUM" })),
  findMany: jest.fn(async () => [{ id: "org-1", name: "FES Gymnasium" }]),
};
// Das juengste UEBERGABEPROTOKOLL (G19) – Dokumente kennt der Fake nicht.
let mockDokumente: Zeile[] = [];
fp.document = {
  findFirst: jest.fn(async ({ where }: { where: Zeile }) => {
    const passend = mockDokumente.filter((d) => passt(d, where));
    passend.sort((a, b) => (b.uploadedAt as Date).getTime() - (a.uploadedAt as Date).getTime());
    return passend[0] ? { uploadedAt: passend[0].uploadedAt } : null;
  }),
};

/** 15.02.2027, 10:00 Uhr in Berlin. */
const JETZT = new Date("2027-02-15T09:00:00.000Z");
const tag = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

const HR: SessionPayload = {
  userId: "u-hr",
  email: "hr@example.org",
  role: "HR_SACHBEARBEITER",
  firstName: "Anna",
  lastName: "Peters",
};

const KENNUNG = "FES-IPAD-0412";

function vorgang(teil: Zeile = {}): Zeile {
  return {
    id: "onb-1",
    displayId: "ONB-2027-GYM-0007",
    organizationId: "org-1",
    arbeitsortId: null,
    questionnaireType: "STANDARD",
    processType: "EINSTELLUNG",
    status: "SUPERVISOR_SUBMITTED",
    createdAt: new Date("2027-01-05T09:00:00.000Z"),
    supervisorSubmittedAt: new Date("2027-01-14T09:00:00.000Z"),
    supervisorData: { isComplete: true, mitAusstattung: true, vertragsbeginn: tag("2027-02-01") },
    ausgabenGeloeschtAm: null,
    ...teil,
  };
}

/** Zeilen der Ausstattung: iPad (Rueckgabe, Einrichtung), Schluessel (Rueckgabe, zentral), Zugaenge (Sperren), Parkplatz (nichts). */
function zeilen(): Zeile[] {
  return [
    neueAusstattungsZeile({
      id: "aus-ipad",
      onboardingId: "onb-1",
      positionId: "pos-ipad",
      departmentKey: "IT",
      art: "JA_NEIN",
      bezeichnung: "Dienst-iPad (Lernmittel)",
      aufgabeTitel: "Dienst-iPad (Lernmittel) bereitstellen",
      quelle: "FUEHRUNGSKRAFT",
      beiAustritt: "RUECKGABE",
      rueckgabeKategorie: "IT_HARDWARE",
      ausgabeKennung: "Inventarnummer",
    }),
    neueAusstattungsZeile({
      id: "aus-schluessel",
      onboardingId: "onb-1",
      positionId: "pos-schluessel",
      departmentKey: "FACILITY",
      art: "AUSWAHL",
      bezeichnung: "Schlüssel",
      aufgabeTitel: "Schlüssel ausgeben",
      auswahl: ["Haupteingang", "Lehrerzimmer"],
      quelle: "FUEHRUNGSKRAFT",
      beiAustritt: "RUECKGABE",
      rueckgabeKategorie: "SCHLUESSEL",
      ausgabeKennung: "Schlüsselnummer",
    }),
    neueAusstattungsZeile({
      id: "aus-zugang",
      onboardingId: "onb-1",
      positionId: "pos-zugang",
      departmentKey: "IT",
      art: "JA_NEIN",
      bezeichnung: "Zugänge (Portal, E-Mail)",
      aufgabeTitel: "Zugänge (Portal, E-Mail) bereitstellen",
      quelle: "FUEHRUNGSKRAFT",
      beiAustritt: "SPERREN",
    }),
    neueAusstattungsZeile({
      id: "aus-park",
      onboardingId: "onb-1",
      positionId: "pos-park",
      departmentKey: "FACILITY",
      art: "JA_NEIN",
      bezeichnung: "Parkplatz",
      aufgabeTitel: "Parkplatz bereitstellen",
      quelle: "FUEHRUNGSKRAFT",
      beiAustritt: "NICHTS",
    }),
  ];
}

function aufgabe(id: string, teil: Zeile = {}): Zeile {
  return neueOnboardingAufgabe({
    id,
    onboardingId: "onb-1",
    title: id,
    category: "Ausstattung & Zugänge",
    herkunft: "AUSSTATTUNG",
    assignee: "IT",
    ...teil,
  });
}

function aufgaben(): Zeile[] {
  return [
    aufgabe("i-ipad", { title: "Dienst-iPad (Lernmittel) bereitstellen" }),
    aufgabe("i-haupt", { title: "Schlüssel ausgeben: Haupteingang", assignee: "FACILITY" }),
    aufgabe("i-lehrer", { title: "Schlüssel ausgeben: Lehrerzimmer", assignee: "FACILITY" }),
    aufgabe("i-zugang", { title: "Zugänge (Portal, E-Mail) bereitstellen" }),
    aufgabe("i-park", { title: "Parkplatz bereitstellen", assignee: "FACILITY" }),
    // Ein Vorlagenpunkt ohne Ausstattung
    aufgabe("i-vorlage", { title: "Arbeitsvertrag ablegen", herkunft: null, assignee: "HR" }),
  ];
}

function verknuepfungen(): Zeile[] {
  return [
    { ausstattungId: "aus-ipad", option: "", checklistItemId: "i-ipad", createdAt: new Date() },
    { ausstattungId: "aus-schluessel", option: "Haupteingang", checklistItemId: "i-haupt", createdAt: new Date() },
    { ausstattungId: "aus-schluessel", option: "Lehrerzimmer", checklistItemId: "i-lehrer", createdAt: new Date() },
    { ausstattungId: "aus-zugang", option: "", checklistItemId: "i-zugang", createdAt: new Date() },
    { ausstattungId: "aus-park", option: "", checklistItemId: "i-park", createdAt: new Date() },
  ];
}

/** Eine vorhandene Ausgabe (iPad, ueber den Link vermerkt). */
function ausgabe(teil: Zeile = {}): Zeile {
  return neueAusgabe({
    id: "ag-ipad",
    onboardingId: "onb-1",
    checklistItemId: "i-ipad",
    organizationId: "org-1",
    zentral: false,
    departmentKey: "IT",
    bezeichnung: "Dienst-iPad (Lernmittel)",
    kennungLabel: "Inventarnummer",
    kennung: KENNUNG,
    rueckgabeKategorie: "IT_HARDWARE",
    beiAustritt: "RUECKGABE",
    quelle: "LINK",
    uebergebenAm: tag("2027-01-28"),
    zustandAm: new Date("2027-01-28T10:00:00.000Z"),
    ...teil,
  });
}

/** Ein verlorener Schluessel: Ausgabe am Haupteingang (FACILITY, Kategorie SCHLUESSEL). */
function schluesselAusgabe(teil: Zeile = {}): Zeile {
  return ausgabe({
    id: "ag-schl",
    checklistItemId: "i-haupt",
    zentral: true,
    departmentKey: "FACILITY",
    bezeichnung: "Schlüssel: Haupteingang",
    kennungLabel: "Schlüsselnummer",
    kennung: "GS-114",
    rueckgabeKategorie: "SCHLUESSEL",
    ...teil,
  });
}

// ---- Austrittsbezuege (mockBezugDb) ----

const bezugsDaten: { aufgaben: Zeile[]; rueckgaben: Zeile[]; austritte: Zeile[] } = {
  aufgaben: [],
  rueckgaben: [],
  austritte: [],
};

/** Ein Austritt bezieht die Ausgabe ueber eine Rueckgabe-Zeile und eine Ruecknahmeaufgabe. */
function austrittBezieht(ausgabeId: string, austritt: { id: string; status: string; displayId?: string; organizationId?: string }) {
  bezugsDaten.austritte.push({
    id: austritt.id,
    status: austritt.status,
    displayId: austritt.displayId ?? `OFF-2027-GYM-${austritt.id}`,
    organizationId: austritt.organizationId ?? "org-1",
  });
  bezugsDaten.rueckgaben.push({ ausgabeId, offboardingId: austritt.id });
  bezugsDaten.aufgaben.push({ ausgabeId, offboardingId: austritt.id, herkunft: "AUSGABE" });
}

function aktion(body: unknown, session: SessionPayload = HR) {
  return ausgabenAktionAusfuehren({ onboardingId: "onb-1", rohBody: body, session, jetzt: JETZT });
}

const audits = (action: string) => db.audits.filter((a) => a.action === action);
const ausgabeMit = (id: string) => db.ausgaben.find((a) => a.id === id);

/** Die Ausgaben-Felder einer Aufgabe in der Uebersicht der Antwort. */
function anzeige(u: unknown, checklistItemId: string): Partial<AusgabenAufgabeAnzeige> | undefined {
  const uebersicht = u as AusstattungsUebersicht;
  return uebersicht.gruppen
    .flatMap((g) => g.zeilen)
    .flatMap((z) => z.aufgaben)
    .find((a) => a.checklistItemId === checklistItemId);
}

beforeEach(() => {
  jest.clearAllMocks();
  dbLeeren();
  db.onboardingVorgaenge = [vorgang()];
  db.ausstattungZeilen = zeilen();
  db.onboardingAufgaben = aufgaben();
  db.ausstattungAufgaben = verknuepfungen();
  db.ausstattungsPositionen = [
    { id: "pos-ipad", organizationId: "org-1" },
    { id: "pos-schluessel", organizationId: null },
    { id: "pos-zugang", organizationId: null },
    { id: "pos-park", organizationId: "org-1" },
  ];
  db.konfigs = [
    { departmentKey: "IT", departmentName: "IT-Abteilung", email: "it@example.org", organizationId: null, isActive: true },
    { departmentKey: "FACILITY", departmentName: "Hausmeister", email: "fm@example.org", organizationId: null, isActive: true },
  ];
  mockDokumente = [];
  bezugsDaten.aufgaben = [];
  bezugsDaten.rueckgaben = [];
  bezugsDaten.austritte = [];
  mockBezugDb.offboardingChecklistItem.findMany.mockImplementation(async ({ where, select }: { where: Zeile; select: Zeile }) =>
    bezugsDaten.aufgaben.filter((a) => passt(a, where)).map((a) => projizieren(a, select)),
  );
  mockBezugDb.returnItem.findMany.mockImplementation(async ({ where, select }: { where: Zeile; select: Zeile }) =>
    bezugsDaten.rueckgaben.filter((r) => passt(r, where)).map((r) => projizieren(r, select)),
  );
  mockBezugDb.offboardingProcess.findMany.mockImplementation(async ({ where, select }: { where: Zeile; select: Zeile }) =>
    bezugsDaten.austritte.filter((o) => passt(o, where)).map((o) => projizieren(o, select)),
  );
  mockZugriff.mockReset();
  mockZugriff.mockImplementation(echtRechte.canAccessProcess);
});

// =============================================
// Pruefreihenfolge
// =============================================

describe("Prüfreihenfolge (403 → 400 → 404)", () => {
  it.each(["VORGESETZTER", "EINRICHTUNGSLEITUNG", "SERVICE"])("%s → 403, ohne den Vorgang zu lesen", async (role) => {
    const r = await aktion({ aktion: "vermerken", checklistItemId: "i-ipad", stuecke: [{}] }, { ...HR, role });
    expect(r).toEqual({ status: 403, body: { error: "Keine Berechtigung" } });
    expect(fp.onboardingProcess.findUnique).not.toHaveBeenCalled();
    expect(db.ausgaben).toEqual([]);
  });

  it.each([
    ["kein Objekt", undefined, ABTEILUNGS_MELDUNGEN.UNGUELTIGE_EINGABE],
    ["unbekannte Aktion", { aktion: "loeschen" }, "Unbekannte Aktion."],
    ["11 Stück", { aktion: "vermerken", checklistItemId: "i-ipad", stuecke: Array.from({ length: 11 }, () => ({})) }, MELDUNGEN_AUSGABEN.ZU_VIELE_STUECKE],
    ["kein Stück", { aktion: "vermerken", checklistItemId: "i-ipad", stuecke: [] }, MELDUNGEN_AUSGABEN.KEIN_STUECK],
    ["Kennung mit spitzer Klammer", { aktion: "vermerken", checklistItemId: "i-ipad", stuecke: [{ kennung: "<b>1</b>" }] }, MELDUNGEN_AUSGABEN.KENNUNG_UNGUELTIG],
    ["Datum ohne Rückprobe", { aktion: "vermerken", checklistItemId: "i-ipad", stuecke: [{ uebergebenAm: "2027-02-31" }] }, MELDUNGEN_AUSGABEN.DATUM_UNGUELTIG],
    ["Tausch ohne Grund", { aktion: "tauschen", ausgabeId: "ag-ipad" }, MELDUNGEN_AUSGABEN.TAUSCH_GRUND_FEHLT],
    ["Korrektur ohne Feld", { aktion: "korrigieren", ausgabeId: "ag-ipad" }, MELDUNGEN_AUSGABEN.KORREKTUR_LEER],
  ])("Zod 400: %s, nichts geschrieben", async (_name, body, meldung) => {
    db.ausgaben = [ausgabe()];
    const r = await aktion(body);
    expect(r).toEqual({ status: 400, body: { error: meldung } });
    expect(db.ausgaben).toHaveLength(1);
    expect(fp.onboardingProcess.updateMany).not.toHaveBeenCalled();
  });

  it("404 mit demselben Text für einen unbekannten und einen fremden Vorgang", async () => {
    const unbekannt = await ausgabenAktionAusfuehren({
      onboardingId: "gibt-es-nicht",
      rohBody: { aktion: "vermerken", checklistItemId: "i-ipad", stuecke: [{}] },
      session: HR,
      jetzt: JETZT,
    });
    mockZugriff.mockResolvedValue(false);
    const fremd = await aktion({ aktion: "vermerken", checklistItemId: "i-ipad", stuecke: [{}] });
    expect(unbekannt).toEqual({ status: 404, body: { error: ABTEILUNGS_MELDUNGEN.ONBOARDING_VORGANG_NICHT_GEFUNDEN } });
    expect(fremd).toEqual(unbekannt);
    expect(db.ausgaben).toEqual([]);
  });

  it("404 für eine Aufgabe bzw. Ausgabe eines anderen Vorgangs", async () => {
    db.onboardingVorgaenge.push(vorgang({ id: "onb-2" }));
    db.onboardingAufgaben.push(aufgabe("i-fremd", { onboardingId: "onb-2" }));
    db.ausgaben = [ausgabe({ id: "ag-fremd", onboardingId: "onb-2", checklistItemId: "i-fremd" })];

    const r1 = await aktion({ aktion: "vermerken", checklistItemId: "i-fremd", stuecke: [{}] });
    expect(r1).toEqual({ status: 404, body: { error: ABTEILUNGS_MELDUNGEN.AUFGABE_NICHT_GEFUNDEN } });
    for (const body of [
      { aktion: "korrigieren", ausgabeId: "ag-fremd", kennung: "X" },
      { aktion: "tauschen", ausgabeId: "ag-fremd", grund: "DEFEKT" },
      { aktion: "zurueckgenommen", ausgabeId: "ag-fremd", zustand: "ZURUECK" },
      { aktion: "entfernen", ausgabeId: "ag-unbekannt" },
    ]) {
      expect(await aktion(body)).toEqual({ status: 404, body: { error: MELDUNGEN_AUSGABEN.AUSGABE_NICHT_GEFUNDEN } });
    }
    expect(db.ausgaben).toHaveLength(1);
    expect(ausgabeMit("ag-fremd")?.zustand).toBe("AUSGEGEBEN");
    // Die fremde Ausgabe wurde nie gesperrt (erst pruefen, dann sperren).
    expect(fp.ausgabe.updateMany).not.toHaveBeenCalled();
  });
});

// =============================================
// Vermerken (G4)
// =============================================

describe("Vermerken (G4)", () => {
  it("an einer OFFENEN Aufgabe: zwei Stück mit Kennung und Datum, Antwort mit der neuen Übersicht", async () => {
    const r = await aktion({
      aktion: "vermerken",
      checklistItemId: "i-ipad",
      stuecke: [{ kennung: ` ${KENNUNG} `, uebergebenAm: "2027-02-10" }, { kennung: "FES-IPAD-0413" }],
    });

    expect(r.status).toBe(200);
    expect(r.body.meldung).toBe(MELDUNGEN_AUSGABEN.VERMERKT(2));
    expect(db.ausgaben).toHaveLength(2);
    expect(db.ausgaben[0]).toMatchObject({
      onboardingId: "onb-1",
      checklistItemId: "i-ipad",
      organizationId: "org-1",
      zentral: false,
      departmentKey: "IT",
      bezeichnung: "Dienst-iPad (Lernmittel)",
      kennungLabel: "Inventarnummer",
      kennung: KENNUNG,
      rueckgabeKategorie: "IT_HARDWARE",
      beiAustritt: "RUECKGABE",
      quelle: "HR",
      erfasstVonId: "u-hr",
      uebergebenAm: tag("2027-02-10"),
      zustand: "AUSGEGEBEN",
      zustandAm: JETZT,
      loeschenAb: null,
    });
    // Ohne Datum: der heutige Berliner Tag.
    expect(db.ausgaben[1]).toMatchObject({ kennung: "FES-IPAD-0413", uebergebenAm: tag("2027-02-15") });
    // Die Aufgabe bleibt offen – der Vermerk ist getrennt vom Abhaken (E-A30).
    expect(db.onboardingAufgaben.find((a) => a.id === "i-ipad")?.isCompleted).toBe(false);

    const ipad = anzeige(r.body.data, "i-ipad");
    expect(ipad?.ausgaben?.map((a) => a.kennung)).toEqual([KENNUNG, "FES-IPAD-0413"]);
    expect(ipad).toMatchObject({ ausgabeMoeglich: true, ausgabeArt: "RUECKGABE", kennungLabel: "Inventarnummer", schluessel: false });
  });

  it("an einer ERLEDIGTEN Aufgabe; der Schlüssel einer zentralen Position am Arbeitsort, Stelle der Aufgabe", async () => {
    db.onboardingVorgaenge = [vorgang({ arbeitsortId: "org-gs" })];
    db.onboardingAufgaben.find((a) => a.id === "i-haupt")!.isCompleted = true;

    const r = await aktion({ aktion: "vermerken", checklistItemId: "i-haupt", stuecke: [{ kennung: "GS-114" }] });

    expect(r.status).toBe(200);
    expect(db.ausgaben).toHaveLength(1);
    expect(db.ausgaben[0]).toMatchObject({
      bezeichnung: "Schlüssel: Haupteingang",
      organizationId: "org-gs",
      zentral: true,
      departmentKey: "FACILITY",
      rueckgabeKategorie: "SCHLUESSEL",
      kennungLabel: "Schlüsselnummer",
    });
  });

  it("ein Zugang (SPERREN) wird ebenso vermerkt – ohne Rückgabekategorie", async () => {
    const r = await aktion({ aktion: "vermerken", checklistItemId: "i-zugang", stuecke: [{}] });
    expect(r.status).toBe(200);
    expect(db.ausgaben[0]).toMatchObject({ beiAustritt: "SPERREN", rueckgabeKategorie: null, kennung: null, zentral: true });
    // Ein Zugang wird eingerichtet, nicht übergeben (G4) – dieselben Wörter wie Knopf und Dialog.
    expect(r.body.meldung).toBe("Einrichtung vermerkt.");
  });

  it("Korrigieren und Entfernen an einem Zugang melden den Einrichtungsvermerk", async () => {
    db.ausgaben = [ausgabe({ id: "ag-zugang", checklistItemId: "i-zugang", beiAustritt: "SPERREN", rueckgabeKategorie: null })];
    const korrigiert = await aktion({ aktion: "korrigieren", ausgabeId: "ag-zugang", kennung: "max.mustermann" });
    expect(korrigiert.body.meldung).toBe("Einrichtungsvermerk korrigiert.");
    const entfernt = await aktion({ aktion: "entfernen", ausgabeId: "ag-zugang" });
    expect(entfernt.body.meldung).toBe("Einrichtungsvermerk entfernt.");
    expect(db.ausgaben).toEqual([]);
  });

  it.each([
    ["COMPLETED", {}],
    ["EXPIRED", {}],
  ])("bei Status %s erlaubt (G7: HR trägt nach)", async (status) => {
    db.onboardingVorgaenge = [vorgang({ status })];
    const r = await aktion({ aktion: "vermerken", checklistItemId: "i-ipad", stuecke: [{ kennung: KENNUNG }] });
    expect(r.status).toBe(200);
    expect(db.ausgaben).toHaveLength(1);
    // Die Karte ist NUR_LESEN, die Ausgaben bleiben bearbeitbar.
    const u = r.body.data as AusstattungsUebersicht;
    expect(u.zustand).toBe("NUR_LESEN");
    expect(u.ausgabenBearbeitbar).toBe(true);
    expect(anzeige(u, "i-ipad")?.ausgaben?.[0].aktionen).toEqual({
      korrigieren: true,
      tauschen: true,
      zurueckgenommen: true,
      entfernen: true,
    });
  });

  it("an einer entfallenen Aufgabe → 409 AUFGABE_ENTFAELLT, nichts geschrieben", async () => {
    db.onboardingAufgaben.find((a) => a.id === "i-lehrer")!.entfaelltAm = tag("2027-02-01");
    const r = await aktion({ aktion: "vermerken", checklistItemId: "i-lehrer", stuecke: [{}] });
    expect(r).toEqual({ status: 409, body: { error: MELDUNGEN_AUSGABEN.AUFGABE_ENTFAELLT, grund: "AUFGABE_ENTFAELLT" } });
    expect(db.ausgaben).toEqual([]);
  });

  it.each([
    ["Zeile ohne Rückgabe (NICHTS)", "i-park"],
    ["Vorlagenpunkt ohne Ausstattung", "i-vorlage"],
  ])("%s → 409 KEINE_AUSGABE", async (_name, id) => {
    const r = await aktion({ aktion: "vermerken", checklistItemId: id, stuecke: [{}] });
    expect(r).toEqual({ status: 409, body: { error: MELDUNGEN_AUSGABEN.KEINE_AUSGABE, grund: "KEINE_AUSGABE" } });
    expect(db.ausgaben).toEqual([]);
  });

  it("Zeile ganz ohne `beiAustritt` (A4 nicht eingeschaltet) → 409 KEINE_AUSGABE", async () => {
    db.ausstattungZeilen.find((z) => z.id === "aus-ipad")!.beiAustritt = null;
    const r = await aktion({ aktion: "vermerken", checklistItemId: "i-ipad", stuecke: [{}] });
    expect(r.status).toBe(409);
    expect(r.body.grund).toBe("KEINE_AUSGABE");
  });

  it.each([
    ["Datum morgen", "2027-02-16", MELDUNGEN_AUSGABEN.DATUM_IN_ZUKUNFT],
    ["mehr als 365 Tage vor dem Anlegen", "2026-01-04", MELDUNGEN_AUSGABEN.DATUM_ZU_FRUEH],
  ])("%s → 400, nichts geschrieben", async (_name, datum, meldung) => {
    const r = await aktion({ aktion: "vermerken", checklistItemId: "i-ipad", stuecke: [{ uebergebenAm: datum }] });
    expect(r).toEqual({ status: 400, body: { error: meldung } });
    expect(db.ausgaben).toEqual([]);
  });

  it("die Grenze aktiver Stücke je Aufgabe (20) zählt nach der Sperre; zurückgenommene zählen nicht", async () => {
    db.ausgaben = [
      ...Array.from({ length: 18 }, (_, i) => ausgabe({ id: `ag-a${i}`, kennung: null })),
      ausgabe({ id: "ag-zurueck", zustand: "ZURUECK" }),
    ];
    const zuViel = await aktion({ aktion: "vermerken", checklistItemId: "i-ipad", stuecke: [{}, {}, {}] });
    expect(zuViel).toEqual({ status: 400, body: { error: MELDUNGEN_AUSGABEN.ZU_VIELE_AKTIVE } });
    expect(db.ausgaben).toHaveLength(19);
    // Der Vorgang war gesperrt, bevor gezaehlt wurde.
    expect(fp.onboardingProcess.updateMany.mock.invocationCallOrder[0]).toBeLessThan(fp.ausgabe.count.mock.invocationCallOrder[0]);

    const genau = await aktion({ aktion: "vermerken", checklistItemId: "i-ipad", stuecke: [{}, {}] });
    expect(genau.status).toBe(200);
    expect(db.ausgaben).toHaveLength(21);
  });

  it("setzt die Löschmerker an Einstellung und Aufgabe zurück (1.11)", async () => {
    db.onboardingVorgaenge = [vorgang({ ausgabenGeloeschtAm: new Date("2027-01-31T02:00:00.000Z") })];
    db.onboardingAufgaben.find((a) => a.id === "i-ipad")!.ausgabenGeloeschtAm = new Date("2027-01-31T02:00:00.000Z");
    db.onboardingAufgaben.find((a) => a.id === "i-haupt")!.ausgabenGeloeschtAm = new Date("2027-01-31T02:00:00.000Z");

    const r = await aktion({ aktion: "vermerken", checklistItemId: "i-ipad", stuecke: [{}] });

    expect(r.status).toBe(200);
    expect(db.onboardingVorgaenge[0].ausgabenGeloeschtAm).toBeNull();
    expect(db.onboardingAufgaben.find((a) => a.id === "i-ipad")?.ausgabenGeloeschtAm).toBeNull();
    // Nur die Aufgabe des Vermerks.
    expect(db.onboardingAufgaben.find((a) => a.id === "i-haupt")?.ausgabenGeloeschtAm).not.toBeNull();
  });

  it("Protokoll AUSGABE_VERMERKT mit Anzahl und `mitKennung` – nie die Kennung selbst (G22)", async () => {
    await aktion({ aktion: "vermerken", checklistItemId: "i-ipad", stuecke: [{ kennung: KENNUNG }, {}] });
    const [eintrag] = audits(AUSGABEN_AUDIT.AUSGABE_VERMERKT);
    expect(eintrag).toMatchObject({
      userId: "u-hr",
      onboardingId: "onb-1",
      processType: "ONBOARDING",
      details: { checklistItemId: "i-ipad", departmentKey: "IT", anzahl: 2, mitKennung: true, ueber: "PORTAL" },
    });
    expect((eintrag.details as { ausgabeIds: string[] }).ausgabeIds).toHaveLength(2);
    expect(JSON.stringify(db.audits)).not.toContain(KENNUNG);
  });
});

// =============================================
// Tauschen (G7)
// =============================================

describe("Tauschen (G7)", () => {
  it("DEFEKT: die alte wird ERSETZT (6 Monate), die neue AUSGEGEBEN an derselben Aufgabe, ersetztDurchId zeigt auf sie", async () => {
    db.ausgaben = [ausgabe()];
    const r = await aktion({ aktion: "tauschen", ausgabeId: "ag-ipad", grund: "DEFEKT", neu: { kennung: "FES-IPAD-0999" } });

    expect(r.status).toBe(200);
    expect(r.body.meldung).toBe(MELDUNGEN_AUSGABEN.GETAUSCHT("DEFEKT"));
    expect(db.ausgaben).toHaveLength(2);
    const alt = ausgabeMit("ag-ipad")!;
    const neu = db.ausgaben.find((a) => a.id !== "ag-ipad")!;
    expect(alt).toMatchObject({ zustand: "ERSETZT", zustandAm: JETZT, ersetztDurchId: neu.id });
    // 15.02.2027 + 6 Monate = 15.08.2027, 00:00 Uhr in Berlin (Sommerzeit)
    expect((alt.loeschenAb as Date).toISOString()).toBe("2027-08-14T22:00:00.000Z");
    expect(neu).toMatchObject({
      zustand: "AUSGEGEBEN",
      loeschenAb: null,
      checklistItemId: "i-ipad",
      departmentKey: "IT",
      organizationId: "org-1",
      bezeichnung: "Dienst-iPad (Lernmittel)",
      kennung: "FES-IPAD-0999",
      quelle: "HR",
      erfasstVonId: "u-hr",
      uebergebenAm: tag("2027-02-15"),
    });
    expect(audits(AUSGABEN_AUDIT.AUSGABE_GETAUSCHT)[0].details).toMatchObject({
      alt: "ag-ipad",
      neu: neu.id,
      grund: "DEFEKT",
      zustandAlt: "ERSETZT",
    });
    expect(JSON.stringify(db.audits)).not.toContain("FES-IPAD-0999");
  });

  it("VERLOREN: die alte FEHLT (drei Jahre ab Jahresende), ersetztDurchId gesetzt; ein Schlüssel bringt den Hinweis zur Gebäudewirtschaft", async () => {
    db.ausgaben = [schluesselAusgabe()];
    const r = await aktion({ aktion: "tauschen", ausgabeId: "ag-schl", grund: "VERLOREN", neu: { kennung: "GS-115" } });

    expect(r.status).toBe(200);
    expect(r.body.meldung).toBe(MELDUNGEN_AUSGABEN.GEBAEUDEWIRTSCHAFT_INFORMIEREN);
    const alt = ausgabeMit("ag-schl")!;
    const neu = db.ausgaben.find((a) => a.id !== "ag-schl")!;
    expect(alt).toMatchObject({ zustand: "FEHLT", ersetztDurchId: neu.id });
    // FEHLT im Jahr 2027 → 1.1.2031, 00:00 Uhr in Berlin
    expect((alt.loeschenAb as Date).toISOString()).toBe("2030-12-31T23:00:00.000Z");
    expect(neu).toMatchObject({ zustand: "AUSGEGEBEN", rueckgabeKategorie: "SCHLUESSEL", zentral: true, kennung: "GS-115" });
    // Keine Aufgabe an die Gebaeudewirtschaft (ohne Austritt, G7).
    expect(db.onboardingAufgaben).toHaveLength(aufgaben().length);
  });

  it("VERLOREN ohne Schlüssel: Meldung ohne Hinweis", async () => {
    db.ausgaben = [ausgabe()];
    const r = await aktion({ aktion: "tauschen", ausgabeId: "ag-ipad", grund: "VERLOREN" });
    expect(r.body.meldung).toBe(MELDUNGEN_AUSGABEN.GETAUSCHT("VERLOREN"));
    expect(ausgabeMit("ag-ipad")?.zustand).toBe("FEHLT");
  });

  it("eine durch einen abgeschlossenen Austritt freigegebene VERBLEIBT-Ausgabe lässt sich tauschen", async () => {
    db.ausgaben = [ausgabe({ zustand: "VERBLEIBT" })];
    austrittBezieht("ag-ipad", { id: "off-1", status: "COMPLETED" });
    const r = await aktion({ aktion: "tauschen", ausgabeId: "ag-ipad", grund: "DEFEKT" });
    expect(r.status).toBe(200);
    expect(ausgabeMit("ag-ipad")?.zustand).toBe("ERSETZT");
  });

  it("an einem nicht mehr aktiven Stück → 409 NICHT_AUSGEGEBEN", async () => {
    db.ausgaben = [ausgabe({ zustand: "ZURUECK" })];
    const r = await aktion({ aktion: "tauschen", ausgabeId: "ag-ipad", grund: "DEFEKT" });
    expect(r).toEqual({ status: 409, body: { error: MELDUNGEN_AUSGABEN.NICHT_AUSGEGEBEN, grund: "NICHT_AUSGEGEBEN" } });
    expect(db.ausgaben).toHaveLength(1);
  });

  it("ein Datum der neuen Ausgabe in der Zukunft → 400, nichts geschrieben", async () => {
    db.ausgaben = [ausgabe()];
    const r = await aktion({ aktion: "tauschen", ausgabeId: "ag-ipad", grund: "DEFEKT", neu: { uebergebenAm: "2027-03-01" } });
    expect(r).toEqual({ status: 400, body: { error: MELDUNGEN_AUSGABEN.DATUM_IN_ZUKUNFT } });
    expect(ausgabeMit("ag-ipad")?.zustand).toBe("AUSGEGEBEN");
    expect(db.ausgaben).toHaveLength(1);
  });

  it("ein Zugang (SPERREN) lässt sich nicht tauschen → 400, nichts geschrieben (1.2: ein Zugang „fehlt“ nie)", async () => {
    db.ausgaben = [ausgabe({ id: "ag-zugang", checklistItemId: "i-zugang", beiAustritt: "SPERREN", rueckgabeKategorie: null })];
    for (const grund of ["VERLOREN", "DEFEKT"]) {
      const r = await aktion({ aktion: "tauschen", ausgabeId: "ag-zugang", grund });
      expect(r).toEqual({ status: 400, body: { error: MELDUNGEN_AUSGABEN.ZUGANG_KEIN_TAUSCH } });
    }
    expect(db.ausgaben).toHaveLength(1);
    expect(ausgabeMit("ag-zugang")).toMatchObject({ zustand: "AUSGEGEBEN", loeschenAb: null, ersetztDurchId: null });
    expect(audits(AUSGABEN_AUDIT.AUSGABE_GETAUSCHT)).toEqual([]);
    // Die Karte bietet den Tausch an einem Zugang gar nicht erst an.
    const u = (await aktion({ aktion: "korrigieren", ausgabeId: "ag-zugang", kennung: "x" })).body.data;
    expect(anzeige(u, "i-zugang")?.ausgaben?.[0].aktionen).toEqual({
      korrigieren: true,
      tauschen: false,
      zurueckgenommen: true,
      entfernen: true,
    });
  });
});

// =============================================
// Nach der Absage (G10): neue Stuecke mit der Frist der Absage
// =============================================

describe("Nach der Absage (EXPIRED): neue Stücke tragen die Frist der Absage (G10)", () => {
  /** Angelegt im November 2026, abgesagt am 15.12.2026 – heute ist der 15.02.2027. */
  const ABGESAGT = new Date("2026-12-15T10:00:00.000Z");
  /** Drei Jahre ab Ende des Berliner Jahres 2026 → 1.1.2030, 00:00 Uhr in Berlin. */
  const FRIST_ABSAGE = "2029-12-31T23:00:00.000Z";
  /** Drei Jahre ab Ende von 2027 (dem Jahr von JETZT) → 1.1.2031. */
  const FRIST_2027 = "2030-12-31T23:00:00.000Z";
  const iso = (d: unknown) => (d instanceof Date ? d.toISOString() : d);

  beforeEach(() => {
    db.onboardingVorgaenge = [
      vorgang({ status: "EXPIRED", createdAt: new Date("2026-11-02T09:00:00.000Z"), expiredAt: ABGESAGT }),
    ];
  });

  it("Vermerk: jedes neue Stück bekommt `loeschenAb` = drei Jahre ab Ende des Jahres der Absage", async () => {
    const r = await aktion({ aktion: "vermerken", checklistItemId: "i-ipad", stuecke: [{ kennung: KENNUNG }, {}] });
    expect(r.status).toBe(200);
    expect(db.ausgaben).toHaveLength(2);
    for (const a of db.ausgaben) {
      expect(a).toMatchObject({ zustand: "AUSGEGEBEN", zustandAm: JETZT });
      expect(iso(a.loeschenAb)).toBe(FRIST_ABSAGE);
    }
  });

  it("Tausch DEFEKT: die alte ERSETZT (6 Monate), die neue AUSGEGEBEN mit der Frist der Absage", async () => {
    // So hinterlaesst die Absage ein ausgegebenes Stueck (`ausgabenFristBeiAbsageIn`).
    db.ausgaben = [ausgabe({ loeschenAb: new Date(FRIST_ABSAGE) })];
    const r = await aktion({ aktion: "tauschen", ausgabeId: "ag-ipad", grund: "DEFEKT", neu: { kennung: "FES-IPAD-0999" } });
    expect(r.status).toBe(200);
    const alt = ausgabeMit("ag-ipad")!;
    const neu = db.ausgaben.find((a) => a.id !== "ag-ipad")!;
    expect(alt).toMatchObject({ zustand: "ERSETZT", ersetztDurchId: neu.id });
    expect(iso(alt.loeschenAb)).toBe("2027-08-14T22:00:00.000Z");
    expect(neu).toMatchObject({ zustand: "AUSGEGEBEN", kennung: "FES-IPAD-0999" });
    expect(iso(neu.loeschenAb)).toBe(FRIST_ABSAGE);
  });

  it("Tausch VERLOREN eines Schlüssels: die alte FEHLT (ab heute), die neue mit der Frist der Absage", async () => {
    db.ausgaben = [schluesselAusgabe({ loeschenAb: new Date(FRIST_ABSAGE) })];
    const r = await aktion({ aktion: "tauschen", ausgabeId: "ag-schl", grund: "VERLOREN", neu: { kennung: "GS-115" } });
    expect(r.body.meldung).toBe(MELDUNGEN_AUSGABEN.GEBAEUDEWIRTSCHAFT_INFORMIEREN);
    expect(iso(ausgabeMit("ag-schl")!.loeschenAb)).toBe(FRIST_2027);
    expect(iso(db.ausgaben.find((a) => a.id !== "ag-schl")!.loeschenAb)).toBe(FRIST_ABSAGE);
  });

  it("Altfall ohne `expiredAt` (abgesagt vor F12): Anker ist der Vermerk selbst – später, nie früher gelöscht", async () => {
    db.onboardingVorgaenge = [vorgang({ status: "EXPIRED", expiredAt: null })];
    await aktion({ aktion: "vermerken", checklistItemId: "i-ipad", stuecke: [{}] });
    expect(iso(db.ausgaben[0].loeschenAb)).toBe(FRIST_2027);
  });

  it("Status und Absage werden NACH der Sperre des Vorgangs gelesen – eine gleichzeitige Absage kommt an", async () => {
    // Beim Lesen vor der Transaktion laeuft der Vorgang noch …
    db.onboardingVorgaenge = [vorgang()];
    const echt = fp.onboardingProcess.updateMany.getMockImplementation()!;
    fp.onboardingProcess.updateMany.mockImplementationOnce(async (args: unknown) => {
      // … die Absage committet, waehrend die Karte auf die Sperre des Vorgangs wartet.
      Object.assign(db.onboardingVorgaenge[0], { status: "EXPIRED", expiredAt: new Date("2027-02-15T08:30:00.000Z") });
      return echt(args);
    });
    const r = await aktion({ aktion: "vermerken", checklistItemId: "i-ipad", stuecke: [{}] });
    expect(r.status).toBe(200);
    expect(iso(db.ausgaben[0].loeschenAb)).toBe(FRIST_2027);
  });

  it("laufend und abgeschlossen: neue Stücke ohne Frist (AUSGEGEBEN, G20)", async () => {
    for (const status of ["SUPERVISOR_SUBMITTED", "COMPLETED"]) {
      db.ausgaben = [ausgabe()];
      db.onboardingVorgaenge = [vorgang({ status })];
      await aktion({ aktion: "vermerken", checklistItemId: "i-ipad", stuecke: [{}] });
      await aktion({ aktion: "tauschen", ausgabeId: "ag-ipad", grund: "DEFEKT" });
      const neue = db.ausgaben.filter((a) => a.zustand === "AUSGEGEBEN");
      expect(neue).toHaveLength(2);
      for (const a of neue) expect(a.loeschenAb).toBeNull();
    }
  });
});

// =============================================
// Zuruecknehmen, Korrigieren, Entfernen
// =============================================

describe("Zurückgenommen (ohne Austritt)", () => {
  it("FEHLT: Frist drei Jahre ab Jahresende; ein Schlüssel bringt den Hinweis", async () => {
    db.ausgaben = [schluesselAusgabe()];
    const r = await aktion({ aktion: "zurueckgenommen", ausgabeId: "ag-schl", zustand: "FEHLT" });
    expect(r.status).toBe(200);
    expect(r.body.meldung).toBe(MELDUNGEN_AUSGABEN.GEBAEUDEWIRTSCHAFT_INFORMIEREN);
    expect(ausgabeMit("ag-schl")).toMatchObject({ zustand: "FEHLT", zustandAm: JETZT });
    expect((ausgabeMit("ag-schl")!.loeschenAb as Date).toISOString()).toBe("2030-12-31T23:00:00.000Z");
    expect(audits(AUSGABEN_AUDIT.AUSGABE_ZURUECKGENOMMEN)[0].details).toMatchObject({ ausgabeId: "ag-schl", zustand: "FEHLT" });
  });

  it("ZURUECK bzw. BESCHAEDIGT: sechs Monate; ohne Schlüssel kein Hinweis", async () => {
    db.ausgaben = [ausgabe(), ausgabe({ id: "ag-2", zustand: "VERBLEIBT" })];
    const r = await aktion({ aktion: "zurueckgenommen", ausgabeId: "ag-ipad", zustand: "BESCHAEDIGT" });
    expect(r.body.meldung).toBe(MELDUNGEN_AUSGABEN.ZURUECKGENOMMEN("beschädigt zurück"));
    expect((ausgabeMit("ag-ipad")!.loeschenAb as Date).toISOString()).toBe("2027-08-14T22:00:00.000Z");
    // auch von VERBLEIBT aus
    expect((await aktion({ aktion: "zurueckgenommen", ausgabeId: "ag-2", zustand: "ZURUECK" })).status).toBe(200);
    expect(ausgabeMit("ag-2")?.zustand).toBe("ZURUECK");
  });

  it("ein Zugang kommt nur als „gesperrt“ zurück", async () => {
    db.ausgaben = [ausgabe({ id: "ag-zugang", checklistItemId: "i-zugang", beiAustritt: "SPERREN", rueckgabeKategorie: null })];
    const falsch = await aktion({ aktion: "zurueckgenommen", ausgabeId: "ag-zugang", zustand: "FEHLT" });
    expect(falsch).toEqual({ status: 400, body: { error: MELDUNGEN_AUSGABEN.ZUGANG_NUR_GESPERRT } });
    expect(ausgabeMit("ag-zugang")?.zustand).toBe("AUSGEGEBEN");
    const richtig = await aktion({ aktion: "zurueckgenommen", ausgabeId: "ag-zugang", zustand: "ZURUECK" });
    // Dieselben Wörter wie der Dialog („Sperrung vermerken“), nicht „Rücknahme vermerkt: gesperrt.“
    expect(richtig.body.meldung).toBe("Sperrung vermerkt.");
    expect(ausgabeMit("ag-zugang")?.zustand).toBe("ZURUECK");
  });

  it("an einem Endzustand → 409 NICHT_AUSGEGEBEN", async () => {
    db.ausgaben = [ausgabe({ zustand: "ERSETZT" })];
    const r = await aktion({ aktion: "zurueckgenommen", ausgabeId: "ag-ipad", zustand: "ZURUECK" });
    expect(r.status).toBe(409);
    expect(r.body.grund).toBe("NICHT_AUSGEGEBEN");
  });
});

describe("Korrigieren", () => {
  it("Kennung und Datum; der Zustand und die Frist bleiben; Protokoll nennt nur die Feldnamen", async () => {
    db.ausgaben = [ausgabe()];
    const r = await aktion({ aktion: "korrigieren", ausgabeId: "ag-ipad", kennung: "FES-IPAD-0500", uebergebenAm: "2027-01-29" });
    expect(r.status).toBe(200);
    expect(r.body.meldung).toBe("Übergabevermerk korrigiert.");
    expect(ausgabeMit("ag-ipad")).toMatchObject({ kennung: "FES-IPAD-0500", uebergebenAm: tag("2027-01-29"), zustand: "AUSGEGEBEN", loeschenAb: null });
    expect(audits(AUSGABEN_AUDIT.AUSGABE_KORRIGIERT)[0].details).toEqual({ ausgabeId: "ag-ipad", felder: ["kennung", "uebergebenAm"] });
    expect(JSON.stringify(db.audits)).not.toContain("FES-IPAD-0500");
  });

  it("Kennung leeren; gleiche Werte → „Keine Änderung.“ ohne Protokoll", async () => {
    db.ausgaben = [ausgabe()];
    const gleich = await aktion({ aktion: "korrigieren", ausgabeId: "ag-ipad", kennung: KENNUNG, uebergebenAm: "2027-01-28" });
    expect(gleich.body.meldung).toBe(MELDUNGEN_AUSGABEN.KEINE_AENDERUNG);
    expect(db.audits).toEqual([]);
    await aktion({ aktion: "korrigieren", ausgabeId: "ag-ipad", kennung: "" });
    expect(ausgabeMit("ag-ipad")?.kennung).toBeNull();
  });

  it("eine durch einen abgeschlossenen Austritt freigegebene VERBLEIBT-Ausgabe lässt sich korrigieren", async () => {
    db.ausgaben = [ausgabe({ zustand: "VERBLEIBT" })];
    austrittBezieht("ag-ipad", { id: "off-1", status: "COMPLETED" });
    const r = await aktion({ aktion: "korrigieren", ausgabeId: "ag-ipad", kennung: "NEU-1" });
    expect(r.status).toBe(200);
    expect(ausgabeMit("ag-ipad")?.kennung).toBe("NEU-1");
  });
});

describe("Entfernen", () => {
  it("ein irrtümlicher Vermerk ohne Austrittsbezug verschwindet (auch ein Link-Vermerk)", async () => {
    db.ausgaben = [ausgabe()];
    const r = await aktion({ aktion: "entfernen", ausgabeId: "ag-ipad" });
    expect(r.status).toBe(200);
    expect(r.body.meldung).toBe("Übergabevermerk entfernt.");
    expect(db.ausgaben).toEqual([]);
    expect(audits(AUSGABEN_AUDIT.AUSGABE_ENTFERNT)[0].details).toMatchObject({ ausgabeId: "ag-ipad", ueber: "PORTAL", quelle: "LINK" });
  });

  it("VERBLEIBT ist kein Irrtum mehr → 409 NICHT_AUSGEGEBEN", async () => {
    db.ausgaben = [ausgabe({ zustand: "VERBLEIBT" })];
    const r = await aktion({ aktion: "entfernen", ausgabeId: "ag-ipad" });
    expect(r.body.grund).toBe("NICHT_AUSGEGEBEN");
    expect(db.ausgaben).toHaveLength(1);
  });

  it("die Nachfolgerin eines Tauschs: die Vorgängerin zeigt danach nicht ins Leere", async () => {
    db.ausgaben = [ausgabe({ zustand: "ERSETZT", ersetztDurchId: "ag-neu" }), ausgabe({ id: "ag-neu", kennung: "X" })];
    expect((await aktion({ aktion: "entfernen", ausgabeId: "ag-neu" })).status).toBe(200);
    expect(ausgabeMit("ag-ipad")?.ersetztDurchId).toBeNull();
  });
});

// =============================================
// Bindung an einen Austritt (G28)
// =============================================

describe("Bindung an einen Austritt (G28)", () => {
  const AKTIONEN = [
    ["korrigieren", { aktion: "korrigieren", ausgabeId: "ag-ipad", kennung: "X" }],
    ["tauschen", { aktion: "tauschen", ausgabeId: "ag-ipad", grund: "DEFEKT" }],
    ["zurueckgenommen", { aktion: "zurueckgenommen", ausgabeId: "ag-ipad", zustand: "ZURUECK" }],
    ["entfernen", { aktion: "entfernen", ausgabeId: "ag-ipad" }],
  ] as const;

  it.each(AKTIONEN)("laufender Austritt → %s 409 AUSGABE_IM_AUSTRITT mit Vorgangsnummer, nichts geschrieben", async (_name, body) => {
    db.ausgaben = [ausgabe()];
    austrittBezieht("ag-ipad", { id: "off-1", status: "NOTICE_PERIOD", displayId: "OFF-2027-GYM-0003" });
    const r = await aktion(body);
    expect(r).toEqual({
      status: 409,
      body: { error: MELDUNGEN_AUSGABEN.AUSGABE_IM_AUSTRITT("OFF-2027-GYM-0003"), grund: "AUSGABE_IM_AUSTRITT" },
    });
    expect(db.ausgaben).toHaveLength(1);
    expect(ausgabeMit("ag-ipad")).toMatchObject({ zustand: "AUSGEGEBEN", kennung: KENNUNG });
    expect(db.audits).toEqual([]);
  });

  it("der Bezug wird NACH der Sperre der Ausgabe gelesen (G24)", async () => {
    db.ausgaben = [ausgabe()];
    austrittBezieht("ag-ipad", { id: "off-1", status: "INITIATED" });
    await aktion({ aktion: "entfernen", ausgabeId: "ag-ipad" });
    const sperre = fp.ausgabe.updateMany.mock.invocationCallOrder[0];
    expect(sperre).toBeGreaterThan(fp.onboardingProcess.updateMany.mock.invocationCallOrder[0]);
    expect(mockBezugDb.returnItem.findMany.mock.invocationCallOrder[0]).toBeGreaterThan(sperre);
    expect(mockBezugDb.offboardingChecklistItem.findMany.mock.invocationCallOrder[0]).toBeGreaterThan(sperre);
  });

  it("offenes AUSGEGEBEN aus einem abgeschlossenen Austritt bleibt gebunden → 409", async () => {
    db.ausgaben = [ausgabe()];
    austrittBezieht("ag-ipad", { id: "off-1", status: "COMPLETED" });
    for (const [, body] of AKTIONEN) expect((await aktion(body)).body.grund).toBe("AUSGABE_IM_AUSTRITT");
  });

  it("Bezug nur zu einem abgebrochenen Austritt: frei", async () => {
    db.ausgaben = [ausgabe()];
    austrittBezieht("ag-ipad", { id: "off-1", status: "CANCELLED" });
    expect((await aktion({ aktion: "entfernen", ausgabeId: "ag-ipad" })).status).toBe(200);
    expect(db.ausgaben).toEqual([]);
  });

  it("die Vorgangsnummer nur mit Zugriff auf den Austritt, sonst „in einem anderen Austritt“", async () => {
    db.ausgaben = [ausgabe()];
    austrittBezieht("ag-ipad", { id: "off-1", status: "NOTICE_PERIOD", displayId: "OFF-2027-FV-0001", organizationId: "org-fremd" });
    mockZugriff.mockImplementation(async (_s: SessionPayload, org: string) => org !== "org-fremd");
    const r = await aktion({ aktion: "korrigieren", ausgabeId: "ag-ipad", kennung: "X" });
    expect(r.body).toEqual({ error: MELDUNGEN_AUSGABEN.AUSGABE_IM_AUSTRITT(null), grund: "AUSGABE_IM_AUSTRITT" });
    expect(JSON.stringify(r.body)).not.toContain("OFF-2027-FV-0001");
  });

  it("echter Ablauf (S29): VERBLEIBT aus dem abgeschlossenen ersten Austritt lässt sich korrigieren; übernimmt sie ein zweiter, laufender Austritt, ergibt dieselbe Aktion 409", async () => {
    // Die Bezuege liest der Dienst hier aus der Fake-DB – also aus genau dem,
    // was die Uebernahme des zweiten Austritts wirklich schreibt.
    mockBezugDb.offboardingChecklistItem.findMany.mockImplementation((args: unknown) => fp.offboardingChecklistItem.findMany(args));
    mockBezugDb.returnItem.findMany.mockImplementation((args: unknown) => fp.returnItem.findMany(args));
    mockBezugDb.offboardingProcess.findMany.mockImplementation((args: unknown) => fp.offboardingProcess.findMany(args));
    const austritt = (teil: Zeile): Zeile => ({
      displayId: "OFF-2027-GYM-0001",
      organizationId: "org-1",
      arbeitsortId: null,
      status: "INITIATED",
      exitType: "VERSETZUNG",
      lastWorkingDay: tag("2027-03-31"),
      onboardingId: null,
      weitereBeschaeftigung: null,
      employeeFirstName: "Mia",
      employeeLastName: "Muster",
      employeeEmail: "mia@example.org",
      employeePrivateEmail: null,
      ...teil,
    });
    db.ausgaben = [ausgabe({ zustand: "VERBLEIBT" })];
    // Erster Austritt (Versetzung) ist abgeschlossen: das iPad verbleibt.
    db.vorgaenge = [
      austritt({ id: "off-1", status: "COMPLETED", onboardingId: "onb-1", weitereBeschaeftigung: true }),
      austritt({ id: "off-2", displayId: "OFF-2027-GYM-0002", exitType: "KUENDIGUNG_ARBEITNEHMER" }),
    ];
    db.aufgaben = [
      neueOffboardingAufgabe({ offboardingId: "off-1", title: "Dienst-iPad (Lernmittel) zurücknehmen", assigneeDepartment: "IT", herkunft: "AUSGABE", ausgabeId: "ag-ipad", isCompleted: true }),
    ];
    db.rueckgaben = [
      neueRueckgabe({ offboardingId: "off-1", category: "IT_HARDWARE", itemName: "Dienst-iPad (Lernmittel)", ausgabeId: "ag-ipad", zustand: "VERBLEIBT" }),
    ];

    // 1. Frei (G28: VERBLEIBT gibt mit dem Abschluss frei) – die Karte korrigiert.
    expect((await aktion({ aktion: "korrigieren", ausgabeId: "ag-ipad", kennung: "NEU-1" })).status).toBe(200);

    // 2. Der zweite Austritt ordnet dieselbe Einstellung zu – der echte Dienst legt Aufgabe und Rueckgabe an.
    const z = await einstellungAktionAusfuehren({
      offboardingId: "off-2",
      rohBody: { aktion: "zuordnen", onboardingId: "onb-1" },
      session: HR,
      jetzt: JETZT,
    });
    expect(z.status).toBe(200);
    expect(db.aufgaben.filter((a) => a.offboardingId === "off-2").map((a) => a.ausgabeId)).toEqual(["ag-ipad"]);
    expect(db.rueckgaben.filter((r) => r.offboardingId === "off-2")).toEqual([
      expect.objectContaining({ ausgabeId: "ag-ipad", serialNumber: "NEU-1", zustand: null }),
    ]);
    expect(ausgabeMit("ag-ipad")?.zustand).toBe("VERBLEIBT");

    // 3. Dieselbe Aktion der Karte: jetzt bindet der laufende zweite Austritt.
    const r = await aktion({ aktion: "korrigieren", ausgabeId: "ag-ipad", kennung: "NEU-2" });
    expect(r).toEqual({
      status: 409,
      body: { error: MELDUNGEN_AUSGABEN.AUSGABE_IM_AUSTRITT("OFF-2027-GYM-0002"), grund: "AUSGABE_IM_AUSTRITT" },
    });
    expect(ausgabeMit("ag-ipad")?.kennung).toBe("NEU-1");
  });

  it("die Karte zeigt den Sperrgrund an der gebundenen Ausgabe", async () => {
    db.ausgaben = [ausgabe()];
    austrittBezieht("ag-ipad", { id: "off-1", status: "INITIATED", displayId: "OFF-2027-GYM-0003" });
    const r = await ausstattungKarteLaden({ onboardingId: "onb-1", session: HR, jetzt: JETZT });
    const stueck = anzeige(r.body.data, "i-ipad")?.ausgaben?.[0];
    expect(stueck).toMatchObject({ gebunden: true, sperrGrund: MELDUNGEN_AUSGABEN.AUSGABE_IM_AUSTRITT("OFF-2027-GYM-0003") });
    expect(stueck?.aktionen).toEqual({ korrigieren: false, tauschen: false, zurueckgenommen: false, entfernen: false });
  });
});

// =============================================
// Uebersicht der Karte (G7, G19, G20)
// =============================================

describe("Übersicht der Karte", () => {
  async function karte() {
    const r = await ausstattungKarteLaden({ onboardingId: "onb-1", session: HR, jetzt: JETZT });
    expect(r.status).toBe(200);
    return r.body.data as AusstattungsUebersicht;
  }

  it("Ausgaben-Felder nur an Aufgaben mit RUECKGABE/SPERREN; „Übergabe nicht vermerkt“ nur bei erledigter Aufgabe", async () => {
    db.onboardingAufgaben.find((a) => a.id === "i-lehrer")!.isCompleted = true;
    const u = await karte();
    expect(anzeige(u, "i-park")).not.toHaveProperty("ausgaben");
    expect(anzeige(u, "i-ipad")).toMatchObject({ ausgabeMoeglich: true, ausgaben: [], ausgabenHinweis: null, vermerken: true });
    expect(anzeige(u, "i-lehrer")).toMatchObject({
      schluessel: true,
      kennungLabel: "Schlüsselnummer",
      ausgabenHinweis: { text: MELDUNGEN_AUSGABEN.UEBERGABE_NICHT_VERMERKT, ton: "gelb" },
    });
    expect(anzeige(u, "i-zugang")).toMatchObject({ ausgabeArt: "SPERREN", kennungLabel: "Kennung", schluessel: false });
    expect(u.ausgabenBearbeitbar).toBe(true);
  });

  it("ohne `beiAustritt` an allen Zeilen (A4 aus): keine Ausgaben-Abfrage, keine neuen Felder", async () => {
    for (const z of db.ausstattungZeilen) z.beiAustritt = null;
    const u = await karte();
    expect(fp.ausgabe.findMany).not.toHaveBeenCalled();
    expect(anzeige(u, "i-ipad")).not.toHaveProperty("ausgabeMoeglich");
    expect(u.protokoll).toBeNull();
  });

  it("nach der Löschung: grauer Satz statt gelber Aufforderung", async () => {
    const aufgabeIpad = db.onboardingAufgaben.find((a) => a.id === "i-ipad")!;
    aufgabeIpad.isCompleted = true;
    aufgabeIpad.ausgabenGeloeschtAm = new Date("2027-01-31T02:00:00.000Z");
    const u = await karte();
    expect(anzeige(u, "i-ipad")?.ausgabenHinweis).toEqual({ text: MELDUNGEN_AUSGABEN.AUSGABEN_GELOESCHT, ton: "grau" });
  });

  it("Protokoll: „fehlt“ bzw. „hochgeladen am …“ (jüngstes), nur bei aktiven Ausgaben mit RUECKGABE", async () => {
    // Nur ein Zugang (SPERREN) und ein zurückgegebenes Stück: keine Zeile.
    db.ausgaben = [
      ausgabe({ id: "ag-zugang", checklistItemId: "i-zugang", beiAustritt: "SPERREN", rueckgabeKategorie: null }),
      ausgabe({ id: "ag-alt", zustand: "ZURUECK" }),
    ];
    expect((await karte()).protokoll).toBeNull();
    expect(fp.document.findFirst).not.toHaveBeenCalled();

    db.ausgaben.push(ausgabe());
    expect((await karte()).protokoll).toEqual({
      art: "UEBERGABE",
      noetig: true,
      hochgeladenAm: null,
      text: MELDUNGEN_AUSGABEN.PROTOKOLL_FEHLT("UEBERGABE"),
    });

    mockDokumente = [
      { onboardingId: "onb-1", type: "UEBERGABEPROTOKOLL", uploadedAt: new Date("2027-02-01T09:00:00.000Z") },
      { onboardingId: "onb-1", type: "UEBERGABEPROTOKOLL", uploadedAt: new Date("2027-02-10T09:00:00.000Z") },
    ];
    expect((await karte()).protokoll).toMatchObject({
      hochgeladenAm: "2027-02-10T09:00:00.000Z",
      text: MELDUNGEN_AUSGABEN.PROTOKOLL_HOCHGELADEN("UEBERGABE", "10.02.2027"),
    });
  });
});

// =============================================
// austrittsBezuegeLaden (ausgaben-daten.ts, eigener mockPrisma)
// =============================================

describe("austrittsBezuegeLaden (G28)", () => {
  const dbMock = mockBezugDb as unknown as Prisma.TransactionClient;

  it("je Ausgabe die beziehenden Austritte – über Rückgabe ODER Aufgabe, jeder einmal", async () => {
    austrittBezieht("ag-1", { id: "off-1", status: "INITIATED", displayId: "OFF-1" });
    bezugsDaten.austritte.push({ id: "off-2", status: "CANCELLED", displayId: "OFF-2", organizationId: "org-1" });
    bezugsDaten.aufgaben.push({ ausgabeId: "ag-1", offboardingId: "off-2", herkunft: "AUSGABE_FEHLT" });
    // Eine Vorlagen-Aufgabe zaehlt nicht (Herkunft im WHERE).
    bezugsDaten.austritte.push({ id: "off-3", status: "INITIATED", displayId: "OFF-3", organizationId: "org-1" });
    bezugsDaten.aufgaben.push({ ausgabeId: "ag-1", offboardingId: "off-3", herkunft: null });

    const bezuege = await echtDaten.austrittsBezuegeLaden(dbMock, ["ag-1", "ag-2"], { session: HR });
    expect(bezuege.get("ag-1")).toEqual([
      { offboardingId: "off-1", status: "INITIATED", displayId: "OFF-1" },
      { offboardingId: "off-2", status: "CANCELLED", displayId: "OFF-2" },
    ]);
    expect(bezuege.has("ag-2")).toBe(false);
  });

  it("ohne Sitzung bzw. ohne Zugriff keine Vorgangsnummer", async () => {
    austrittBezieht("ag-1", { id: "off-1", status: "INITIATED", displayId: "OFF-1", organizationId: "org-fremd" });
    expect((await echtDaten.austrittsBezuegeLaden(dbMock, ["ag-1"])).get("ag-1")?.[0].displayId).toBeNull();
    mockZugriff.mockImplementation(async (_s: SessionPayload, org: string) => org !== "org-fremd");
    expect((await echtDaten.austrittsBezuegeLaden(dbMock, ["ag-1"], { session: HR })).get("ag-1")?.[0].displayId).toBeNull();
  });

  it("je Bezug der eigene Stand (Rückgabe-Zeile mit Zustand) und `abgeloest`, wenn ein späterer Austritt das Stück bezieht (Review A4c)", async () => {
    const frueh = new Date("2027-06-01T08:00:00.000Z");
    const spaet = new Date("2027-07-16T08:00:00.000Z");
    bezugsDaten.austritte.push(
      { id: "off-a", status: "COMPLETED", displayId: "OFF-A", organizationId: "org-1" },
      { id: "off-b", status: "HANDOVER_PHASE", displayId: "OFF-B", organizationId: "org-1" },
    );
    // A gab das Stück mit „verbleibt“ frei, B übernahm es später (offene Zeile).
    bezugsDaten.rueckgaben.push(
      { ausgabeId: "ag-1", offboardingId: "off-a", zustand: "VERBLEIBT", isReturned: false, createdAt: frueh },
      { ausgabeId: "ag-1", offboardingId: "off-b", zustand: null, isReturned: false, createdAt: spaet },
    );
    bezugsDaten.aufgaben.push(
      { ausgabeId: "ag-1", offboardingId: "off-a", herkunft: "AUSGABE", createdAt: frueh },
      { ausgabeId: "ag-1", offboardingId: "off-b", herkunft: "AUSGABE", createdAt: spaet },
      // Ein Zugang ohne Zeile: nur die Reihenfolge der Aufgaben.
      { ausgabeId: "ag-2", offboardingId: "off-a", herkunft: "AUSGABE", createdAt: frueh },
      { ausgabeId: "ag-2", offboardingId: "off-b", herkunft: "AUSGABE", createdAt: spaet },
    );

    const bezuege = await echtDaten.austrittsBezuegeLaden(dbMock, ["ag-1", "ag-2"], { session: HR });
    expect(bezuege.get("ag-1")).toEqual([
      { offboardingId: "off-a", status: "COMPLETED", displayId: "OFF-A", eigenerStand: "VERBLEIBT", abgeloest: true },
      { offboardingId: "off-b", status: "HANDOVER_PHASE", displayId: "OFF-B" },
    ]);
    expect(bezuege.get("ag-2")).toEqual([
      { offboardingId: "off-a", status: "COMPLETED", displayId: "OFF-A", abgeloest: true },
      { offboardingId: "off-b", status: "HANDOVER_PHASE", displayId: "OFF-B" },
    ]);
  });

  it("ohne Ausgaben keine Abfrage", async () => {
    expect((await echtDaten.austrittsBezuegeLaden(dbMock, [])).size).toBe(0);
    expect(mockBezugDb.returnItem.findMany).not.toHaveBeenCalled();
    expect(mockBezugDb.offboardingProcess.findMany).not.toHaveBeenCalled();
  });

  it("der Dienst nutzt genau diese Funktion (Mock greift)", () => {
    expect(jest.isMockFunction(austrittsBezuegeLaden)).toBe(true);
  });
});
