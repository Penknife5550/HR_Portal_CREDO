/**
 * Tests: Loeschfristen der Ausgaben (Ausstattung & Zugaenge, Stufe 2 –
 * Feinplan A4, S35: G20, G24, 1.11)
 *
 *   src/lib/ausgaben-lauf.ts – `ausgabenLoeschen` (Block im Lauf
 *   „Aufbewahrung erzeugter Dokumente“): Kandidaten, Sperren in der
 *   Reihenfolge G24, Menge nach den Sperren, Protokolle, Zaehler ohne Frist,
 *   Probelauf; dazu `ausgabenLoeschenIn` (ausgaben-schreiben.ts).
 *
 * Eigener `mockPrisma` mit kleiner In-Memory-Datenbank (Feinplan Abschnitt 3:
 * Die Fake-DB der Abteilungsaufgaben kennt Datumsvergleiche und
 * Relationsfilter nicht). Sie versteht die Abfrageformen des Laufs – `lte`,
 * `lt`, `not: null`, `OR`, `documents: { some }` am Vorgang –, bildet SetNull
 * beim Loeschen einer Ausgabe nach (Rueckgabe-Zeile, Offboarding-Aufgabe,
 * Tausch-Verweis) und rollt eine Transaktion bei einer Ausnahme zurueck wie
 * Postgres. Die uebrigen Bedingungen liest sie mit `passt` aus
 * src/__tests__/hilfen/abteilungs-fake-db.ts. Die Reihenfolge der Aufrufe
 * steht in `invocationCallOrder` der jest-Funktionen.
 *
 * Dateien loescht der Test nicht: `dateiLoeschen` und
 * `deleteUploadedDirIfEmpty` sind Spies (Pfade und Wurzeln werden geprueft,
 * das Verhalten von `dateiLoeschen` selbst steht in den Tests von Paket 4).
 * Die Sperre der Einstellung ist die ECHTE (`vorgangSperrenIn`). Am Ende
 * liest `rueckgabenUebersichtLaden` den Reiter „Rückgaben“ aus derselben
 * Datenbank – der Merker an der Ausstattungsaufgabe haelt sie aus
 * `ohneVermerk` heraus.
 */

import path from "path";
import {
  anwenden,
  neueAusgabe,
  neueAusstattungsZeile,
  neueOffboardingAufgabe,
  neueOnboardingAufgabe,
  neueRueckgabe,
  passt,
  projizieren,
  sortieren,
  type Zeile,
} from "../hilfen/abteilungs-fake-db";

const mockCanAccessProcess = jest.fn();
const mockDateiLoeschen = jest.fn();
const mockOrdnerLoeschen = jest.fn();

// =============================================
// In-Memory-Datenbank
// =============================================

const TABELLEN = [
  "austritte",
  "einstellungen",
  "ausgaben",
  "rueckgaben",
  "aufgaben",
  "onboardingAufgaben",
  "zeilen",
  "verknuepfungen",
  "dokumente",
  "offDokumente",
  "erzeugt",
  "vorlagen",
  "links",
  "konfigs",
  "orgs",
  "audits",
] as const;
type Name = (typeof TABELLEN)[number];

const stand = {} as Record<Name, Zeile[]>;
function leeren() {
  for (const t of TABELLEN) stand[t] = [];
}
leeren();

/** Relationsfilter am Vorgang (`documents: { some }`), die der Lauf fuer die Protokoll-Kandidaten schreibt. */
const RELATIONEN: Partial<Record<Name, Record<string, (z: Zeile) => Zeile[]>>> = {
  einstellungen: { documents: (z) => stand.dokumente.filter((d) => d.onboardingId === z.id) },
  austritte: { documents: (z) => stand.offDokumente.filter((d) => d.offboardingId === z.id) },
};

const VERGLEICHE = ["lt", "lte", "gt", "gte"] as const;

/**
 * Ein Datum – ohne `instanceof`: Nach dem Zurueckrollen (`structuredClone`)
 * stammen die Dates aus einem anderen Realm als der Test.
 */
const istDatum = (w: unknown): w is Date => Object.prototype.toString.call(w) === "[object Date]";

/** `passt` aus der Fake-DB, dazu Datumsvergleiche, `OR` und die Relationsfilter oben. */
function passtLauf(name: Name | null, z: Zeile, where?: Zeile): boolean {
  if (!where) return true;
  const rest: Zeile = {};
  for (const [k, bed] of Object.entries(where)) {
    if (bed === undefined) continue;
    if (k === "OR") {
      if (!(bed as Zeile[]).some((w) => passtLauf(name, z, w))) return false;
      continue;
    }
    const relation = name ? RELATIONEN[name]?.[k] : undefined;
    if (relation) {
      const { some } = bed as { some?: Zeile };
      if (some && !relation(z).some((x) => passtLauf(null, x, some))) return false;
      continue;
    }
    if (bed && typeof bed === "object" && !istDatum(bed) && VERGLEICHE.some((op) => op in (bed as Zeile))) {
      const wert = z[k];
      if (!istDatum(wert)) return false;
      const b = bed as Partial<Record<(typeof VERGLEICHE)[number], Date>>;
      const t = wert.getTime();
      if (b.lt && !(t < b.lt.getTime())) return false;
      if (b.lte && !(t <= b.lte.getTime())) return false;
      if (b.gt && !(t > b.gt.getTime())) return false;
      if (b.gte && !(t >= b.gte.getTime())) return false;
      continue;
    }
    rest[k] = bed;
  }
  return passt(z, rest);
}

type Args = { where?: Zeile; select?: Zeile; orderBy?: unknown; take?: number; data?: Zeile };

function tabelle(name: Name, opts: { neu?: (d: Zeile) => Zeile; nachLoeschen?: (weg: Zeile[]) => void } = {}) {
  const treffer = (where?: Zeile) => stand[name].filter((z) => passtLauf(name, z, where));
  return {
    findMany: jest.fn(async (a: Args = {}) => {
      const r = sortieren(treffer(a.where), a.orderBy).map((z) => projizieren(z, a.select));
      return a.take === undefined ? r : r.slice(0, a.take);
    }),
    findUnique: jest.fn(async (a: Args) => {
      const z = treffer(a.where)[0];
      return z ? projizieren(z, a.select) : null;
    }),
    findFirst: jest.fn(async (a: Args = {}) => {
      const z = treffer(a.where)[0];
      return z ? projizieren(z, a.select) : null;
    }),
    count: jest.fn(async (a: Args = {}) => treffer(a.where).length),
    create: jest.fn(async (a: Args) => {
      const z = (opts.neu ?? ((d: Zeile) => ({ ...d })))(a.data ?? {});
      stand[name].push(z);
      return structuredClone(z);
    }),
    updateMany: jest.fn(async (a: Args) => {
      const t = treffer(a.where);
      t.forEach((z) => anwenden(z, a.data ?? {}));
      return { count: t.length };
    }),
    deleteMany: jest.fn(async (a: Args = {}) => {
      const t = treffer(a.where);
      stand[name] = stand[name].filter((z) => !t.includes(z));
      opts.nachLoeschen?.(t);
      return { count: t.length };
    }),
  };
}

const mockPrisma = {
  offboardingProcess: tabelle("austritte"),
  onboardingProcess: tabelle("einstellungen"),
  // SetNull wie im Schema: Rueckgabe-Zeile, Offboarding-Aufgabe und Tausch-Verweis.
  ausgabe: tabelle("ausgaben", {
    neu: neueAusgabe,
    nachLoeschen: (weg) => {
      const ids = new Set(weg.map((a) => a.id));
      for (const r of stand.rueckgaben) if (ids.has(r.ausgabeId)) r.ausgabeId = null;
      for (const a of stand.aufgaben) if (ids.has(a.ausgabeId)) a.ausgabeId = null;
      for (const a of stand.ausgaben) if (ids.has(a.ersetztDurchId)) a.ersetztDurchId = null;
    },
  }),
  returnItem: tabelle("rueckgaben", { neu: neueRueckgabe }),
  offboardingChecklistItem: tabelle("aufgaben", { neu: neueOffboardingAufgabe }),
  checklistItem: tabelle("onboardingAufgaben", { neu: neueOnboardingAufgabe }),
  onboardingAusstattung: tabelle("zeilen"),
  onboardingAusstattungAufgabe: tabelle("verknuepfungen"),
  document: tabelle("dokumente"),
  offboardingDocument: tabelle("offDokumente"),
  generatedDocument: tabelle("erzeugt"),
  documentTemplate: tabelle("vorlagen"),
  offboardingDepartmentLink: tabelle("links"),
  departmentConfig: tabelle("konfigs"),
  organization: tabelle("orgs"),
  auditLog: {
    create: jest.fn(async ({ data }: { data: Zeile }) => {
      stand.audits.push(structuredClone(data));
      return data;
    }),
  },
  // Wie Postgres: Eine Ausnahme rollt alles zurueck.
  $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>): Promise<unknown> => {
    const vorher = structuredClone(stand);
    try {
      return await fn(mockPrisma);
    } catch (err) {
      Object.assign(stand, vorher);
      throw err;
    }
  }),
};

jest.mock("@/lib/db", () => ({ prisma: mockPrisma }));
jest.mock("@/lib/permissions", () => {
  const echt = jest.requireActual("@/lib/permissions");
  return { ...echt, canAccessProcess: (...a: unknown[]) => mockCanAccessProcess(...a) };
});
jest.mock("@/lib/file-upload", () => {
  const echt = jest.requireActual("@/lib/file-upload");
  return {
    ...echt,
    dateiLoeschen: (...a: unknown[]) => mockDateiLoeschen(...a),
    deleteUploadedDirIfEmpty: (...a: unknown[]) => mockOrdnerLoeschen(...a),
  };
});

import { ausgabenLoeschen, leeresAusgabenErgebnis } from "@/lib/ausgaben-lauf";
import { rueckgabenUebersichtLaden, type AustrittFuerEinstellung } from "@/lib/offboarding-ausgaben";
import {
  AUSGABEN_AUDIT,
  PROTOKOLL_SYSTEM_VORLAGEN,
  ausgabeLoeschenAb,
  ausgabeZustandDaten,
} from "@/lib/ausgaben";
import type { SessionPayload } from "@/lib/permissions";

// seed-check.js laeuft im Container als reines JS; dank des
// `require.main === module`-Guards laedt es hier ohne Datenbank.
const seedCheck = require("../../../prisma/seed-check.js");

// =============================================
// Testdaten
// =============================================

/** 15.09.2027, 03:15 Uhr in Berlin – die Standardzeit des Laufs. */
const JETZT = new Date("2027-09-15T01:15:00.000Z");
const tag = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

const E_ID = "onb-1";
const A_ID = "off-a";
const B_ID = "off-b";

const HR: SessionPayload = {
  userId: "u-hr",
  email: "hr@example.org",
  role: "HR_SACHBEARBEITER",
  firstName: "Erika",
  lastName: "Sachbearbeiter",
};

/** Zurueckgegeben am 10.03.2027 → Frist ab Beginn des 10.09.2027 (faellig). */
const ZURUECK_AM = new Date("2027-03-10T10:00:00.000Z");
const FAELLIG = ausgabeLoeschenAb({ zustand: "ZURUECK", zustandAm: ZURUECK_AM })!;
/** Fehlt seit 10.03.2027 → 1.1.2031 (nicht faellig). */
const FEHLT_FRIST = ausgabeLoeschenAb({ zustand: "FEHLT", zustandAm: ZURUECK_AM })!;

const KENNUNGEN = ["FES-IPAD-0412", "GS-114"];

function einstellung(teil: Zeile = {}): Zeile {
  return {
    id: E_ID,
    displayId: "2027-GYM-007",
    organizationId: "org-gym",
    arbeitsortId: null,
    processType: "EINSTELLUNG",
    status: "COMPLETED",
    email: "anna.privat@example.org",
    firstName: "Anna",
    lastName: "Schmidt",
    personalData: null,
    supervisorData: { vertragsbeginn: tag("2027-02-01"), ausgabenAngeboten: true },
    ausgabenGeloeschtAm: null,
    updatedAt: new Date("2027-04-01T08:00:00.000Z"),
    ...teil,
  };
}

function austritt(teil: Zeile = {}): Zeile {
  return {
    id: A_ID,
    displayId: "OFF-2027-GYM-014",
    organizationId: "org-gym",
    arbeitsortId: null,
    status: "COMPLETED",
    exitType: "KUENDIGUNG_ARBEITNEHMER",
    lastWorkingDay: tag("2027-03-31"),
    onboardingId: E_ID,
    weitereBeschaeftigung: false,
    employeeFirstName: "Anna",
    employeeLastName: "Schmidt",
    employeeEmail: "a.schmidt@fes-minden.de",
    employeePrivateEmail: null,
    ausgabenGeloeschtAm: null,
    updatedAt: new Date("2027-04-01T08:00:00.000Z"),
    ...teil,
  };
}

function ausgabe(teil: Zeile): Zeile {
  return neueAusgabe({
    onboardingId: E_ID,
    organizationId: "org-gym",
    quelle: "LINK",
    beiAustritt: "RUECKGABE",
    departmentKey: "IT",
    bezeichnung: "Dienst-iPad (Lernmittel)",
    uebergebenAm: tag("2027-02-01"),
    createdAt: new Date("2027-02-01T10:00:00.000Z"),
    ...teil,
  });
}

/** iPad, am 10.03.2027 zurueck – faellig. */
const IPAD = (teil: Zeile = {}) =>
  ausgabe({
    id: "ag-ipad",
    checklistItemId: "i-ipad",
    kennungLabel: "Inventarnummer",
    kennung: KENNUNGEN[0],
    rueckgabeKategorie: "IT_HARDWARE",
    zustand: "ZURUECK",
    zustandAm: ZURUECK_AM,
    loeschenAb: FAELLIG,
    ...teil,
  });

/** Schluessel, fehlt seit 10.03.2027 – Frist erst 1.1.2031. */
const SCHLUESSEL = (teil: Zeile = {}) =>
  ausgabe({
    id: "ag-schl",
    checklistItemId: "i-schl",
    departmentKey: "FACILITY",
    bezeichnung: "Schlüssel: Haupteingang",
    kennungLabel: "Schlüsselnummer",
    kennung: KENNUNGEN[1],
    rueckgabeKategorie: "SCHLUESSEL",
    zustand: "FEHLT",
    zustandAm: ZURUECK_AM,
    loeschenAb: FEHLT_FRIST,
    ...teil,
  });

/** Ausstattungsaufgabe der Einstellung samt Zeile und Verknuepfung, mit Kommentar der Stelle. */
function ausstattungsAufgabe(id: string, departmentKey: string, kommentar: string | null) {
  const zeile = `aus-${id}`;
  stand.zeilen.push(
    neueAusstattungsZeile({
      id: zeile,
      onboardingId: E_ID,
      departmentKey,
      art: "JA_NEIN",
      bezeichnung: id,
      beiAustritt: "RUECKGABE",
    }),
  );
  stand.onboardingAufgaben.push(
    neueOnboardingAufgabe({
      id,
      onboardingId: E_ID,
      title: `${id} bereitstellen`,
      category: "Ausstattung",
      assignee: departmentKey,
      herkunft: "AUSSTATTUNG",
      isCompleted: true,
      completedAt: new Date("2027-02-01T10:00:00.000Z"),
      abteilungKommentar: kommentar,
      abteilungKommentarAm: kommentar ? new Date("2027-02-01T10:00:00.000Z") : null,
    }),
  );
  stand.verknuepfungen.push({ checklistItemId: id, ausstattungId: zeile, option: "" });
}

/** Ein Austritt bezieht eine Ausgabe: Ruecknahmeaufgabe und Rueckgabe-Zeile (mit Kopie der Kennung). */
function beziehtAusgabe(
  offboardingId: string,
  ausgabeId: string,
  teil: { rueckgabe?: Zeile; aufgabe?: Zeile } = {},
): void {
  stand.aufgaben.push(
    neueOffboardingAufgabe({
      id: `o-${offboardingId}-${ausgabeId}`,
      offboardingId,
      title: "Stück zurücknehmen",
      category: "Ausstattung",
      assigneeDepartment: "IT",
      herkunft: "AUSGABE",
      ausgabeId,
      isCompleted: true,
      abteilungKommentar: "Gerät zurück, Hülle fehlt",
      abteilungKommentarAm: new Date("2027-03-10T10:00:00.000Z"),
      ...teil.aufgabe,
    }),
  );
  stand.rueckgaben.push(
    neueRueckgabe({
      id: `r-${offboardingId}-${ausgabeId}`,
      offboardingId,
      category: "IT_HARDWARE",
      itemName: "Stück",
      ausgabeId,
      serialNumber: "KOPIE",
      condition: "Kratzer am Rand",
      notes: "Hülle fehlt",
      zustand: "ZURUECK",
      isReturned: true,
      ...teil.rueckgabe,
    }),
  );
}

/** Einstellung mit iPad (faellig) und Schluessel (nicht faellig), beide im Austritt A. */
function grundstand(): void {
  stand.einstellungen.push(einstellung());
  stand.austritte.push(austritt());
  ausstattungsAufgabe("i-ipad", "IT", "iPad FES-IPAD-0412 übergeben");
  ausstattungsAufgabe("i-schl", "FACILITY", "Schlüssel GS-114 übergeben");
  stand.ausgaben.push(IPAD(), SCHLUESSEL());
  beziehtAusgabe(A_ID, "ag-ipad", { rueckgabe: { serialNumber: KENNUNGEN[0] } });
  beziehtAusgabe(A_ID, "ag-schl", {
    rueckgabe: { serialNumber: KENNUNGEN[1], zustand: "FEHLT", isReturned: false, condition: null, notes: "verloren" },
    aufgabe: { assigneeDepartment: "FACILITY", abteilungKommentar: "Schlüssel GS-114 fehlt" },
  });
  // Folgeaufgabe „Schließung prüfen“ zum Schluessel.
  stand.aufgaben.push(
    neueOffboardingAufgabe({
      id: "o-folge",
      offboardingId: A_ID,
      title: "Schließung prüfen: Schlüssel: Haupteingang",
      assigneeDepartment: "FACILITY",
      herkunft: "AUSGABE_FEHLT",
      ausgabeId: "ag-schl",
      abteilungKommentar: "Zylinder getauscht",
      abteilungKommentarAm: new Date("2027-03-12T10:00:00.000Z"),
    }),
  );
  // Von HR erfasst, ohne Ausgabe – bleibt immer, wie sie ist.
  stand.rueckgaben.push(
    neueRueckgabe({
      id: "r-manuell",
      offboardingId: A_ID,
      category: "SONSTIGES",
      itemName: "Parkkarte",
      serialNumber: "P-7",
      notes: "von HR erfasst",
    }),
  );
}

const zeile = (t: Name, id: string) => stand[t].find((z) => z.id === id) as Zeile;
const auditsGeloescht = () => stand.audits.filter((a) => a.action === AUSGABEN_AUDIT.AUSGABEN_GELOESCHT);

/** invocationCallOrder aller Aufrufe von `fn`, deren erstes Argument `filter` erfuellt. */
function aufrufe(fn: jest.Mock, filter: (arg: Zeile) => boolean = () => true): number[] {
  return fn.mock.calls.flatMap((c, i) => (filter((c[0] ?? {}) as Zeile) ? [fn.mock.invocationCallOrder[i]] : []));
}
const setztMerker = (a: Zeile) => !!a.data && "ausgabenGeloeschtAm" in (a.data as Zeile);

beforeEach(() => {
  jest.clearAllMocks();
  leeren();
  mockCanAccessProcess.mockResolvedValue(true);
  mockDateiLoeschen.mockResolvedValue("geloescht");
  mockOrdnerLoeschen.mockResolvedValue(true);
});

// =============================================
// Grenzen und Menge
// =============================================

describe("ausgabenLoeschen – Grenze und Menge (G20, 1.11)", () => {
  it("Grenze genau am Tag: faellig ab dem Beginn des Berliner Tages, am Vortag nicht", async () => {
    // Frist ab Beginn des 15.09.2027 (Berlin) bzw. des 16.09.2027.
    const heute = ausgabeLoeschenAb({ zustand: "ZURUECK", zustandAm: new Date("2027-03-15T10:00:00.000Z") })!;
    const morgen = ausgabeLoeschenAb({ zustand: "ZURUECK", zustandAm: new Date("2027-03-16T10:00:00.000Z") })!;
    expect(heute.toISOString()).toBe("2027-09-14T22:00:00.000Z");
    stand.einstellungen.push(einstellung());
    stand.ausgaben.push(IPAD({ id: "ag-heute", loeschenAb: heute }), IPAD({ id: "ag-morgen", loeschenAb: morgen }));

    // 14.09.2027, 23:59:59 Berlin – noch nichts.
    const vortag = await ausgabenLoeschen({ jetzt: new Date("2027-09-14T21:59:59.999Z") });
    expect(vortag.geloescht).toBe(0);

    // Genau zum Fristbeginn – geloescht; die Frist von morgen bleibt.
    const r = await ausgabenLoeschen({ jetzt: heute });
    expect(r.geloescht).toBe(1);
    expect(stand.ausgaben.map((a) => a.id)).toEqual(["ag-morgen"]);
  });

  it("VERBLEIBT und AUSGEGEBEN ohne Frist bleiben; AUSGEGEBEN mit Frist aus Abschluss bzw. Absage faellt", async () => {
    stand.einstellungen.push(einstellung(), einstellung({ id: "onb-2", status: "EXPIRED" }));
    const abschluss = ausgabeZustandDaten("AUSGEGEBEN", new Date("2023-05-01T10:00:00.000Z"), {
      austrittAbgeschlossenAm: new Date("2023-06-30T10:00:00.000Z"),
    });
    const absage = ausgabeZustandDaten("AUSGEGEBEN", new Date("2023-05-01T10:00:00.000Z"), {
      vorgangEingestelltAm: new Date("2023-08-01T10:00:00.000Z"),
    });
    expect(abschluss.loeschenAb?.toISOString()).toBe("2026-12-31T23:00:00.000Z"); // 1.1.2027
    stand.ausgaben.push(
      IPAD({ id: "ag-verbleibt", zustand: "VERBLEIBT", loeschenAb: null }),
      IPAD({ id: "ag-ausgegeben", zustand: "AUSGEGEBEN", loeschenAb: null }),
      IPAD({ id: "ag-abschluss", ...abschluss }),
      IPAD({ id: "ag-absage", onboardingId: "onb-2", checklistItemId: null, ...absage }),
    );

    const r = await ausgabenLoeschen({ jetzt: JETZT });
    expect(r.geloescht).toBe(2);
    expect(r.fehler).toBe(0);
    expect(stand.ausgaben.map((a) => a.id).sort()).toEqual(["ag-ausgegeben", "ag-verbleibt"]);
  });

  it("Kopie in ReturnItem und Kommentare geleert – nur fuer die geloeschte Ausgabe", async () => {
    grundstand();
    const r = await ausgabenLoeschen({ jetzt: JETZT });

    expect(r).toMatchObject({ geloescht: 1, rueckgabenGeleert: 1, fehler: 0 });
    expect(stand.ausgaben.map((a) => a.id)).toEqual(["ag-schl"]);
    // Rueckgabe-Zeile des iPads: Kopie weg, die Zeile bleibt (FK jetzt null).
    expect(zeile("rueckgaben", "r-off-a-ag-ipad")).toMatchObject({
      ausgabeId: null,
      serialNumber: null,
      condition: null,
      notes: null,
      itemName: "Stück",
      zustand: "ZURUECK",
    });
    // Ruecknahmeaufgabe des iPads: Kommentar der Stelle weg.
    expect(zeile("aufgaben", "o-off-a-ag-ipad")).toMatchObject({ abteilungKommentar: null, abteilungKommentarAm: null });
    // Onboarding-Ausstattungsaufgabe ohne verbleibende Ausgabe: Kommentar weg, Merker gesetzt.
    expect(zeile("onboardingAufgaben", "i-ipad")).toMatchObject({
      abteilungKommentar: null,
      abteilungKommentarAm: null,
      ausgabenGeloeschtAm: JETZT,
    });
    // Der Schluessel (nicht faellig) behaelt alles.
    expect(zeile("rueckgaben", "r-off-a-ag-schl")).toMatchObject({ serialNumber: "GS-114", notes: "verloren" });
    expect(zeile("aufgaben", "o-off-a-ag-schl").abteilungKommentar).toBe("Schlüssel GS-114 fehlt");
    expect(zeile("aufgaben", "o-folge").abteilungKommentar).toBe("Zylinder getauscht");
    expect(zeile("onboardingAufgaben", "i-schl")).toMatchObject({
      abteilungKommentar: "Schlüssel GS-114 übergeben",
      ausgabenGeloeschtAm: null,
    });
    // Von HR erfasste Zeile ohne Ausgabe: unberuehrt.
    expect(zeile("rueckgaben", "r-manuell")).toMatchObject({ serialNumber: "P-7", notes: "von HR erfasst" });
    // Der Schluessel lebt weiter – kein Merker an Einstellung und Austritt.
    expect(zeile("einstellungen", E_ID).ausgabenGeloeschtAm).toBeNull();
    expect(zeile("austritte", A_ID).ausgabenGeloeschtAm).toBeNull();
  });

  it("Ausstattungsaufgabe mit weiterer Ausgabe: Kommentar bleibt, Merker kommt trotzdem", async () => {
    grundstand();
    stand.ausgaben.push(IPAD({ id: "ag-ipad-2", zustand: "AUSGEGEBEN", loeschenAb: null, kennung: "FES-IPAD-0999" }));
    await ausgabenLoeschen({ jetzt: JETZT });
    expect(zeile("onboardingAufgaben", "i-ipad")).toMatchObject({
      abteilungKommentar: "iPad FES-IPAD-0412 übergeben",
      ausgabenGeloeschtAm: JETZT,
    });
  });

  it("Sperrreihenfolge G24: Austritte (nach id) → Einstellung → Aufgaben → Ausgaben → ReturnItem → Merker", async () => {
    stand.einstellungen.push(einstellung());
    stand.austritte.push(austritt({ id: B_ID }), austritt());
    ausstattungsAufgabe("i-ipad", "IT", "iPad übergeben");
    stand.ausgaben.push(IPAD());
    // B bezog das Stueck frueher (abgeschlossen, verbleibt), A spaeter.
    beziehtAusgabe(B_ID, "ag-ipad", { rueckgabe: { zustand: "VERBLEIBT", isReturned: false } });
    beziehtAusgabe(A_ID, "ag-ipad");

    const r = await ausgabenLoeschen({ jetzt: JETZT });
    expect(r.geloescht).toBe(1);

    const sperreA = aufrufe(mockPrisma.offboardingProcess.updateMany, (a) => (a.where as Zeile).id === A_ID && !setztMerker(a));
    const sperreB = aufrufe(mockPrisma.offboardingProcess.updateMany, (a) => (a.where as Zeile).id === B_ID && !setztMerker(a));
    const sperreE = aufrufe(mockPrisma.onboardingProcess.updateMany, (a) => !setztMerker(a));
    const kommentare = aufrufe(mockPrisma.offboardingChecklistItem.updateMany);
    const ausstattung = aufrufe(mockPrisma.checklistItem.updateMany);
    const loeschen = aufrufe(mockPrisma.ausgabe.deleteMany);
    const rueckgaben = aufrufe(mockPrisma.returnItem.updateMany);
    const merker = [
      ...aufrufe(mockPrisma.onboardingProcess.updateMany, setztMerker),
      ...aufrufe(mockPrisma.offboardingProcess.updateMany, setztMerker),
    ];

    expect(sperreA).toHaveLength(1);
    expect(sperreB).toHaveLength(1);
    expect(sperreE).toHaveLength(1);
    expect(merker).toHaveLength(3); // Einstellung, A, B
    const kette = [sperreA[0], sperreB[0], sperreE[0], ...kommentare, ...ausstattung, ...loeschen, ...rueckgaben];
    expect([...kette].sort((x, y) => x - y)).toEqual(kette);
    expect(Math.max(...kette)).toBeLessThan(Math.min(...merker));
    // Die Austritte werden unabhaengig vom Status gesperrt – ohne Bedingung ausser der id.
    expect(mockPrisma.offboardingProcess.updateMany.mock.calls[0][0]).toEqual({
      where: { id: A_ID },
      data: { updatedAt: JETZT },
    });
    // Beide Endstatus zugelassen (G24: auch COMPLETED und EXPIRED).
    expect(mockPrisma.onboardingProcess.updateMany.mock.calls[0][0]).toEqual({
      where: { id: E_ID, status: { notIn: [] } },
      data: { updatedAt: JETZT },
    });
    expect(zeile("einstellungen", E_ID).ausgabenGeloeschtAm).toEqual(JETZT);
    expect(zeile("austritte", A_ID).ausgabenGeloeschtAm).toEqual(JETZT);
    expect(zeile("austritte", B_ID).ausgabenGeloeschtAm).toEqual(JETZT);
  });

  it("die Menge wird NACH den Sperren gelesen: nicht mehr faellig → Kopie und Kommentare bleiben", async () => {
    grundstand();
    const original = mockPrisma.offboardingProcess.updateMany.getMockImplementation()!;
    // Kurz vor der Sperre oeffnet die Stelle die Rueckgabe wieder (Gleichlauf: wieder AUSGEGEBEN, ohne Frist).
    mockPrisma.offboardingProcess.updateMany.mockImplementationOnce(async (a: Args) => {
      Object.assign(zeile("ausgaben", "ag-ipad"), ausgabeZustandDaten("AUSGEGEBEN", JETZT));
      return original(a);
    });

    const r = await ausgabenLoeschen({ jetzt: JETZT });
    expect(r).toMatchObject({ geloescht: 0, rueckgabenGeleert: 0, fehler: 0 });
    expect(stand.ausgaben.map((a) => a.id).sort()).toEqual(["ag-ipad", "ag-schl"]);
    expect(zeile("rueckgaben", "r-off-a-ag-ipad")).toMatchObject({ serialNumber: KENNUNGEN[0], notes: "Hülle fehlt" });
    expect(zeile("aufgaben", "o-off-a-ag-ipad").abteilungKommentar).toBe("Gerät zurück, Hülle fehlt");
    expect(zeile("onboardingAufgaben", "i-ipad")).toMatchObject({
      abteilungKommentar: "iPad FES-IPAD-0412 übergeben",
      ausgabenGeloeschtAm: null,
    });
    expect(mockPrisma.ausgabe.deleteMany).not.toHaveBeenCalled();
    expect(auditsGeloescht()).toHaveLength(0);
  });

  it("bezieht inzwischen ein nicht gesperrter Austritt die Ausgabe, faellt sie fuer diesen Lauf heraus", async () => {
    grundstand();
    stand.austritte.push(austritt({ id: "off-c", status: "IN_PROGRESS" }));
    const original = mockPrisma.onboardingProcess.updateMany.getMockImplementation()!;
    // Eine Zuordnung von C kam vor der Sperre der Einstellung durch.
    mockPrisma.onboardingProcess.updateMany.mockImplementationOnce(async (a: Args) => {
      beziehtAusgabe("off-c", "ag-ipad");
      return original(a);
    });

    const r = await ausgabenLoeschen({ jetzt: JETZT });
    expect(r.geloescht).toBe(0);
    expect(zeile("ausgaben", "ag-ipad")).toBeDefined();
    expect(zeile("rueckgaben", "r-off-a-ag-ipad").serialNumber).toBe(KENNUNGEN[0]);

    // Der naechste Lauf liest C vor den Sperren mit und loescht.
    const naechster = await ausgabenLoeschen({ jetzt: JETZT });
    expect(naechster.geloescht).toBe(1);
    expect(zeile("rueckgaben", "r-off-c-ag-ipad").serialNumber).toBeNull();
  });

  it("Ausgabe ohne Herkunft: einzeln, nur ihre Austritte gesperrt, kein Merker an einer Einstellung", async () => {
    stand.austritte.push(austritt({ onboardingId: null }));
    stand.ausgaben.push(IPAD({ onboardingId: null, checklistItemId: null }));
    beziehtAusgabe(A_ID, "ag-ipad");

    const r = await ausgabenLoeschen({ jetzt: JETZT });
    expect(r.geloescht).toBe(1);
    expect(mockPrisma.onboardingProcess.updateMany).not.toHaveBeenCalled();
    expect(zeile("austritte", A_ID).ausgabenGeloeschtAm).toEqual(JETZT);
    expect(auditsGeloescht().map((a) => a.offboardingId ?? a.onboardingId)).toEqual([A_ID]);
  });
});

// =============================================
// Merker und Reiter „Rückgaben“
// =============================================

describe("Merker der Ausstattungsaufgabe (G20) – nie wieder „ohne Vermerk“", () => {
  it("nach dem Lauf steht die Aufgabe nicht mehr in `ohneVermerk` (rueckgabenUebersichtLaden)", async () => {
    stand.einstellungen.push(einstellung());
    stand.austritte.push(austritt());
    stand.orgs.push({ id: "org-gym", name: "FES Gymnasium" });
    ausstattungsAufgabe("i-ipad", "IT", "iPad übergeben");
    stand.ausgaben.push(IPAD());
    beziehtAusgabe(A_ID, "ag-ipad");
    const uebersicht = () =>
      rueckgabenUebersichtLaden(projizieren(zeile("austritte", A_ID)) as unknown as AustrittFuerEinstellung, HR);

    expect((await uebersicht())?.lage).toBe("AUSGABEN");

    await ausgabenLoeschen({ jetzt: JETZT });
    expect(zeile("onboardingAufgaben", "i-ipad").ausgabenGeloeschtAm).toEqual(JETZT);
    const danach = await uebersicht();
    expect(danach?.ohneVermerk).toEqual([]);
    expect(danach?.lage).toBe("GELOESCHT");

    // Gegenprobe: ohne Merker forderte der Reiter „Als ausgegeben übernehmen“.
    zeile("onboardingAufgaben", "i-ipad").ausgabenGeloeschtAm = null;
    const ohneMerker = await uebersicht();
    expect(ohneMerker?.ohneVermerk.map((e) => e.checklistItemId)).toEqual(["i-ipad"]);
  });
});

// =============================================
// Protokolle (1.11, Schritt 4)
// =============================================

const UPLOADS = path.join(process.cwd(), "uploads");
const ERZEUGT = (ordner: string, datei: string) => path.join(UPLOADS, "brief-vorlagen-generiert", ordner, datei);

/** Hochgeladene und erzeugte Protokolle von Einstellung und Austritt, dazu Dokumente, die bleiben muessen. */
function protokolle(): void {
  stand.vorlagen.push(
    { id: "tpl-ueb", isSystem: true, ...PROTOKOLL_SYSTEM_VORLAGEN.UEBERGABE },
    { id: "tpl-ueb-duplikat", isSystem: true, ...PROTOKOLL_SYSTEM_VORLAGEN.UEBERGABE },
    { id: "tpl-rueck", isSystem: true, ...PROTOKOLL_SYSTEM_VORLAGEN.RUECKGABE },
    { id: "tpl-brief", isSystem: false, modul: "ONBOARDING", originalName: "Begruessung.docx" },
  );
  stand.dokumente.push(
    { id: "dok-ueb", onboardingId: E_ID, type: "UEBERGABEPROTOKOLL", filePath: `uploads/${E_ID}/dok-ueb.pdf` },
    { id: "dok-vertrag", onboardingId: E_ID, type: "ARBEITSVERTRAG", filePath: `uploads/${E_ID}/vertrag.pdf` },
  );
  stand.offDokumente.push(
    {
      id: "odok-rueck",
      offboardingId: A_ID,
      type: "RUECKGABEPROTOKOLL",
      filePath: `uploads/offboarding/${A_ID}/rueckgabe.pdf`,
    },
    { id: "odok-zeugnis", offboardingId: A_ID, type: "ZEUGNIS", filePath: `uploads/offboarding/${A_ID}/zeugnis.pdf` },
  );
  stand.erzeugt.push(
    {
      id: "g-ueb",
      templateId: "tpl-ueb",
      modul: "ONBOARDING",
      refId: E_ID,
      pfadDocx: ERZEUGT("g1", "Uebergabe.docx"),
      pfadPdf: ERZEUGT("g1", "Uebergabe.pdf"),
    },
    {
      id: "g-ueb-duplikat",
      templateId: "tpl-ueb-duplikat",
      modul: "ONBOARDING",
      refId: E_ID,
      pfadDocx: ERZEUGT("g2", "Uebergabe.docx"),
      pfadPdf: null,
    },
    {
      id: "g-rueck",
      templateId: "tpl-rueck",
      modul: "OFFBOARDING",
      refId: A_ID,
      pfadDocx: ERZEUGT("g3", "Rueckgabe.docx"),
      pfadPdf: null,
    },
    // Bleiben: andere Vorlage desselben Vorgangs, dieselbe Vorlage eines anderen Vorgangs.
    { id: "g-brief", templateId: "tpl-brief", modul: "ONBOARDING", refId: E_ID, pfadDocx: ERZEUGT("g4", "B.docx"), pfadPdf: null },
    { id: "g-fremd", templateId: "tpl-ueb", modul: "ONBOARDING", refId: "onb-9", pfadDocx: ERZEUGT("g5", "U.docx"), pfadPdf: null },
  );
  stand.einstellungen.push(einstellung({ id: "onb-9", ausgabenGeloeschtAm: null }));
}

describe("Protokolle mit der letzten Ausgabe des Vorgangs (1.11, Schritt 4)", () => {
  /** Einstellung und Austritt mit nur dem (faelligen) iPad. */
  function nurIpad(): void {
    stand.einstellungen.push(einstellung());
    stand.austritte.push(austritt());
    ausstattungsAufgabe("i-ipad", "IT", null);
    stand.ausgaben.push(IPAD());
    beziehtAusgabe(A_ID, "ag-ipad");
    protokolle();
  }

  it("hochgeladene und erzeugte Protokolle beider System-Vorlagen fallen, Datei vor Zeile; andere Dokumente bleiben", async () => {
    nurIpad();
    const r = await ausgabenLoeschen({ jetzt: JETZT });

    expect(r).toMatchObject({ geloescht: 1, protokolleGeloescht: 2, erzeugteProtokolleGeloescht: 3, fehler: 0 });
    expect(stand.dokumente.map((d) => d.id)).toEqual(["dok-vertrag"]);
    expect(stand.offDokumente.map((d) => d.id)).toEqual(["odok-zeugnis"]);
    expect(stand.erzeugt.map((g) => g.id).sort()).toEqual(["g-brief", "g-fremd"]);

    // Je Datei die Wurzel des Vorgangs (nie `uploads` als Ganzes).
    expect(mockDateiLoeschen).toHaveBeenCalledWith(path.resolve(process.cwd(), `uploads/${E_ID}/dok-ueb.pdf`), [
      path.join(UPLOADS, E_ID),
    ]);
    expect(mockDateiLoeschen).toHaveBeenCalledWith(
      path.resolve(process.cwd(), `uploads/offboarding/${A_ID}/rueckgabe.pdf`),
      [path.join(UPLOADS, "offboarding", A_ID)],
    );
    expect(mockDateiLoeschen).toHaveBeenCalledWith(ERZEUGT("g1", "Uebergabe.pdf"), [
      path.join(UPLOADS, "brief-vorlagen-generiert"),
    ]);
    expect(mockOrdnerLoeschen).toHaveBeenCalledWith(path.join(UPLOADS, "brief-vorlagen-generiert", "g1"));
    expect(mockDateiLoeschen).toHaveBeenCalledTimes(6);

    // Datei zuerst, dann die Zeile.
    const datei = (teil: string) => aufrufe(mockDateiLoeschen, () => true).filter((_, i) =>
      String(mockDateiLoeschen.mock.calls[i][0]).includes(teil),
    );
    expect(datei("dok-ueb")[0]).toBeLessThan(aufrufe(mockPrisma.document.deleteMany)[0]);
    expect(datei("rueckgabe.pdf")[0]).toBeLessThan(aufrufe(mockPrisma.offboardingDocument.deleteMany)[0]);
    expect(Math.max(...datei(`${path.sep}g1${path.sep}`))).toBeLessThan(
      aufrufe(mockPrisma.generatedDocument.deleteMany, (a) => (a.where as Zeile).id === "g-ueb")[0],
    );
  });

  it("nur ohne verbleibende Ausgabe: ein weiterlebendes Stueck haelt die Protokolle beider Vorgaenge", async () => {
    nurIpad();
    stand.ausgaben.push(SCHLUESSEL());
    beziehtAusgabe(A_ID, "ag-schl");

    const r = await ausgabenLoeschen({ jetzt: JETZT });
    expect(r).toMatchObject({ geloescht: 1, protokolleGeloescht: 0, erzeugteProtokolleGeloescht: 0 });
    expect(stand.dokumente).toHaveLength(2);
    expect(stand.offDokumente).toHaveLength(2);
    expect(stand.erzeugt).toHaveLength(5);
    expect(mockDateiLoeschen).not.toHaveBeenCalled();
  });

  it("ein Merker aus frueherer Zeit zaehlt nicht, solange eine Ausgabe da ist (neuer Vermerk)", async () => {
    stand.einstellungen.push(einstellung({ ausgabenGeloeschtAm: new Date("2027-01-01T03:15:00.000Z") }));
    stand.ausgaben.push(IPAD({ zustand: "AUSGEGEBEN", loeschenAb: null }));
    protokolle();

    const r = await ausgabenLoeschen({ jetzt: JETZT });
    expect(r.protokolleGeloescht).toBe(0);
    expect(stand.dokumente.map((d) => d.id)).toContain("dok-ueb");
  });

  it("idempotent: eine stehengebliebene Datei loescht der naechste Lauf – samt Zeile", async () => {
    nurIpad();
    mockDateiLoeschen.mockImplementation(async (pfad: string) => (pfad.includes("dok-ueb") ? "fehler" : "geloescht"));

    const erster = await ausgabenLoeschen({ jetzt: JETZT });
    expect(erster).toMatchObject({ protokolleGeloescht: 1, fehler: 1 });
    expect(stand.dokumente.map((d) => d.id)).toContain("dok-ueb");
    expect(zeile("einstellungen", E_ID).ausgabenGeloeschtAm).toEqual(JETZT);

    mockDateiLoeschen.mockResolvedValue("fehlte");
    const zweiter = await ausgabenLoeschen({ jetzt: new Date("2027-09-16T01:15:00.000Z") });
    expect(zweiter).toMatchObject({ geloescht: 0, protokolleGeloescht: 1, erzeugteProtokolleGeloescht: 0, fehler: 0 });
    expect(stand.dokumente.map((d) => d.id)).toEqual(["dok-vertrag"]);

    // Ein dritter Lauf findet nichts mehr.
    const dritter = await ausgabenLoeschen({ jetzt: new Date("2027-09-17T01:15:00.000Z") });
    expect(dritter).toMatchObject({ protokolleGeloescht: 0, erzeugteProtokolleGeloescht: 0, fehler: 0 });
  });

  it("eine erzeugte Datei, die nicht geloescht werden kann, laesst die Zeile stehen", async () => {
    nurIpad();
    mockDateiLoeschen.mockImplementation(async (pfad: string) => (pfad.endsWith("Uebergabe.pdf") ? "fehler" : "geloescht"));
    const r = await ausgabenLoeschen({ jetzt: JETZT });
    expect(r.fehler).toBe(1);
    expect(stand.erzeugt.map((g) => g.id)).toContain("g-ueb");
    expect(mockOrdnerLoeschen).not.toHaveBeenCalledWith(path.join(UPLOADS, "brief-vorlagen-generiert", "g1"));
  });
});

// =============================================
// Zaehler, Fehler, Protokoll, Probelauf
// =============================================

describe("ohneFristAelterDreiJahre (1.11, Schritt 6)", () => {
  it("zaehlt nur aktive Ausgaben ohne Frist mit uebergebenAm vor heute minus drei Jahren", async () => {
    stand.einstellungen.push(einstellung());
    stand.ausgaben.push(
      IPAD({ id: "a1", zustand: "AUSGEGEBEN", loeschenAb: null, uebergebenAm: tag("2024-09-14") }),
      IPAD({ id: "a2", zustand: "VERBLEIBT", loeschenAb: null, uebergebenAm: tag("2020-01-01") }),
      // genau drei Jahre – noch nicht „aelter“
      IPAD({ id: "a3", zustand: "AUSGEGEBEN", loeschenAb: null, uebergebenAm: tag("2024-09-15") }),
      // mit Frist (Abschluss) bzw. zurueck – zaehlen nicht
      IPAD({ id: "a4", zustand: "AUSGEGEBEN", loeschenAb: FEHLT_FRIST, uebergebenAm: tag("2020-01-01") }),
      IPAD({ id: "a5", zustand: "ZURUECK", loeschenAb: FEHLT_FRIST, uebergebenAm: tag("2020-01-01") }),
      IPAD({ id: "a6", zustand: "ERSETZT", loeschenAb: null, uebergebenAm: tag("2020-01-01") }),
    );
    const r = await ausgabenLoeschen({ jetzt: JETZT });
    expect(r.ohneFristAelterDreiJahre).toBe(2);
    expect(r.geloescht).toBe(0);
  });
});

describe("Fehler, Protokoll und Probelauf", () => {
  it("ein Fehler je Vorgang zaehlt `fehler`, die uebrigen laufen weiter – in die Konsole nur die Kennung", async () => {
    const log = jest.spyOn(console, "error").mockImplementation(() => {});
    stand.einstellungen.push(einstellung(), einstellung({ id: "onb-2" }));
    stand.ausgaben.push(
      IPAD({ id: "ag-1", loeschenAb: new Date("2027-01-01T00:00:00.000Z"), checklistItemId: null }),
      IPAD({ id: "ag-2", onboardingId: "onb-2", checklistItemId: null }),
    );
    mockPrisma.onboardingProcess.updateMany.mockImplementationOnce(async () => {
      throw Object.assign(new Error("Verbindung zu anna.privat@example.org verloren"), { code: "P1001" });
    });

    const r = await ausgabenLoeschen({ jetzt: JETZT });
    expect(r).toMatchObject({ geloescht: 1, fehler: 1 });
    expect(stand.ausgaben.map((a) => a.id)).toEqual(["ag-1"]);
    const ausgabe = JSON.stringify(log.mock.calls);
    expect(ausgabe).toContain("P1001");
    expect(ausgabe).not.toContain("anna.privat");
    log.mockRestore();
  });

  it("Protokoll AUSGABEN_GELOESCHT je Vorgang – nur Anzahlen, ohne Konto, nie Kennung oder Name", async () => {
    grundstand();
    await ausgabenLoeschen({ jetzt: JETZT });

    const audits = auditsGeloescht();
    expect(audits.map((a) => [a.processType, a.onboardingId ?? a.offboardingId])).toEqual([
      ["ONBOARDING", E_ID],
      ["OFFBOARDING", A_ID],
    ]);
    for (const a of audits) {
      expect(a.userId).toBeNull();
      expect(Object.keys(a.details as Zeile).sort()).toEqual([
        "anzahl",
        "erzeugteProtokolle",
        "kommentareGeleert",
        "protokolle",
        "rueckgabenGeleert",
      ]);
      for (const wert of Object.values(a.details as Zeile)) expect(typeof wert).toBe("number");
    }
    // Einstellung: 1 Ausgabe, 1 Rueckgabe, 2 Kommentare (Ruecknahmeaufgabe + Ausstattungsaufgabe).
    expect(audits[0].details).toEqual({
      anzahl: 1,
      rueckgabenGeleert: 1,
      kommentareGeleert: 2,
      protokolle: 0,
      erzeugteProtokolle: 0,
    });
    expect(audits[1].details).toEqual({
      anzahl: 1,
      rueckgabenGeleert: 1,
      kommentareGeleert: 1,
      protokolle: 0,
      erzeugteProtokolle: 0,
    });
    const text = JSON.stringify(stand.audits);
    for (const verboten of [...KENNUNGEN, "Anna", "Schmidt", "iPad", "anna.privat"]) expect(text).not.toContain(verboten);
  });

  it("Probelauf: zaehlt nur – keine Sperre, kein Schreiben, keine Datei", async () => {
    grundstand();
    stand.ausgaben.push(IPAD({ id: "ag-alt", zustand: "AUSGEGEBEN", loeschenAb: null, uebergebenAm: tag("2020-01-01") }));
    protokolle();
    const vorher = structuredClone(stand);

    const r = await ausgabenLoeschen({ jetzt: JETZT, dryRun: true });
    expect(r).toEqual({ aufbewahrungMonate: 6, verjaehrungJahre: 3, wuerdeLoeschen: 1, ohneFristAelterDreiJahre: 1 });
    expect(stand).toEqual(vorher);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    for (const t of Object.values(mockPrisma)) {
      if (t && typeof t === "object") {
        for (const m of ["updateMany", "deleteMany", "create"] as const) {
          const fn = (t as Record<string, jest.Mock | undefined>)[m];
          if (fn) expect(fn).not.toHaveBeenCalled();
        }
      }
    }
    expect(mockDateiLoeschen).not.toHaveBeenCalled();
  });

  it("leeresAusgabenErgebnis: Kopf mit den Fristen, alle Zaehler 0", () => {
    expect(leeresAusgabenErgebnis()).toEqual({
      aufbewahrungMonate: 6,
      verjaehrungJahre: 3,
      geloescht: 0,
      rueckgabenGeleert: 0,
      protokolleGeloescht: 0,
      erzeugteProtokolleGeloescht: 0,
      ohneFristAelterDreiJahre: 0,
      fehler: 0,
    });
  });
});

describe("System-Vorlagen der Protokolle: dieselben Schluessel wie im Seed-Check", () => {
  it("PROTOKOLL_SYSTEM_VORLAGEN = Eintraege aus SYSTEM_VORLAGEN (prisma/seed-check.js)", () => {
    const eintrag = (s: { modul: string; originalName: string }) =>
      (seedCheck.SYSTEM_VORLAGEN as { modul: string; originalName: string; datei: string }[]).find(
        (v) => v.modul === s.modul && v.originalName === s.originalName,
      );
    expect(eintrag(PROTOKOLL_SYSTEM_VORLAGEN.UEBERGABE)).toBeDefined();
    expect(eintrag(PROTOKOLL_SYSTEM_VORLAGEN.RUECKGABE)).toBeDefined();
    expect(eintrag(PROTOKOLL_SYSTEM_VORLAGEN.UEBERGABE)?.datei).toBe("uebergabeprotokoll-ausstattung.docx");
    expect(eintrag(PROTOKOLL_SYSTEM_VORLAGEN.RUECKGABE)?.datei).toBe("rueckgabeprotokoll-ausstattung.docx");
  });
});
