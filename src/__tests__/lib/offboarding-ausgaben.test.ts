/**
 * Tests: Rueckgabe-Vorschlag, Ruecknahme- und Sperraufgaben im Offboarding
 * (Ausstattung & Zugaenge, Stufe 2 – Feinplan A4, S29: G13, G14, G24, G26)
 *
 *   src/lib/offboarding-ausgaben.ts – `einstellungAktionAusfuehren` (zuordnen
 *   mit Uebernahme, aktualisieren, ohne-vermerk, loesen),
 *   `einstellungVorschlaegeLaden` (Vorschau samt Rueckgabe-Vorschlag) und der
 *   Reiter „Rückgaben“ (Antwort `data`).
 *
 * Eigene kleine In-Memory-Datenbank (Feinplan Abschnitt 3: die Fake-DB der
 * Abteilungsaufgaben ist fuer die Link- und Portalwege gedacht): Sie versteht
 * die bedingten `updateMany`/`deleteMany`, `createMany … skipDuplicates` mit
 * den Unique-Indizes des Schemas (Offboarding-Aufgabe
 * `[offboardingId, ausgabeId, herkunft]`, Rueckgabe `[offboardingId,
 * ausgabeId]`, NULL kollidiert nicht), rollt eine Transaktion bei einer
 * Ausnahme zurueck wie Postgres und haelt die Reihenfolge der Aufrufe fest
 * (`invocationCallOrder`). Die Bedingungen liest sie mit `passt` aus
 * src/__tests__/hilfen/abteilungs-fake-db.ts (dieselben Regeln). Die
 * Kandidatenabfrage der Vorschlaege (Relationsfilter) liefert eine leere
 * Liste – sie ist in offboarding-einstellung.test.ts geprueft.
 *
 * Die Versandsperre ist die ECHTE aus src/lib/abteilungsaufgaben-dienst.ts.
 *
 * Seit S30 (G15 bis G17): der Gleichlauf von Ausgabe, Ruecknahmeaufgabe und
 * Rueckgabe-Zeile auf allen drei Wegen – Link der Stelle
 * (`oeffentlicheAufgabeAendern`), Portal-PATCH (`aufgabeImPortalAendern`) und
 * Reiter „Rückgaben“ (`rueckgabeAendern`) – samt Folgeaufgabe „Schließung
 * prüfen“, Bindung (G28) und Sperrreihenfolge (G24). Dafuer kennt die
 * Test-Datenbank am Link das `include` des Austritts.
 */

const mockCanAccessProcess = jest.fn();
const mockTriggerWebhooks = jest.fn();

import {
  anwenden,
  neueAusgabe,
  neueAusstattungsZeile,
  neueOffboardingAufgabe,
  neueOnboardingAufgabe,
  neueRueckgabe,
  neuerLink,
  passt,
  projizieren,
  sortieren,
  type Zeile,
} from "../hilfen/abteilungs-fake-db";

// =============================================
// In-Memory-Datenbank
// =============================================

const stand: {
  austritte: Zeile[];
  einstellungen: Zeile[];
  links: Zeile[];
  aufgaben: Zeile[];
  rueckgaben: Zeile[];
  ausgaben: Zeile[];
  zeilen: Zeile[];
  onboardingAufgaben: Zeile[];
  verknuepfungen: Zeile[];
  positionen: Zeile[];
  konfigs: Zeile[];
  orgs: Zeile[];
  audits: Zeile[];
} = {
  austritte: [],
  einstellungen: [],
  links: [],
  aufgaben: [],
  rueckgaben: [],
  ausgaben: [],
  zeilen: [],
  onboardingAufgaben: [],
  verknuepfungen: [],
  positionen: [],
  konfigs: [],
  orgs: [],
  audits: [],
};

type Tabellenname = keyof typeof stand;

function p2002(felder: string): Error {
  return Object.assign(new Error(`Unique constraint failed on the fields: (${felder})`), { code: "P2002" });
}

/** Eine Tabelle mit den Methoden, die die Dienste brauchen. `eindeutig` liefert den Unique-Schluessel (null = keiner). */
function tabelle(name: Tabellenname, opts: { neu?: (d: Zeile) => Zeile; eindeutig?: (z: Zeile) => string | null } = {}) {
  const zeilen = () => stand[name];
  const neu = opts.neu ?? ((d: Zeile) => ({ ...d }));
  const schluesselBelegt = (x: Zeile, ohne?: Zeile) => {
    const k = opts.eindeutig?.(x);
    return k !== null && k !== undefined && zeilen().some((z) => z !== ohne && opts.eindeutig?.(z) === k);
  };
  return {
    findMany: jest.fn(async (args: { where?: Zeile; select?: Zeile; orderBy?: unknown } = {}) =>
      sortieren(zeilen().filter((z) => passt(z, args.where)), args.orderBy).map((z) => projizieren(z, args.select)),
    ),
    findUnique: jest.fn(async ({ where, select }: { where: Zeile; select?: Zeile }) => {
      const z = zeilen().find((x) => passt(x, where));
      return z ? projizieren(z, select) : null;
    }),
    findFirst: jest.fn(async ({ where, select }: { where?: Zeile; select?: Zeile } = {}) => {
      const z = zeilen().find((x) => passt(x, where));
      return z ? projizieren(z, select) : null;
    }),
    count: jest.fn(async ({ where }: { where?: Zeile } = {}) => zeilen().filter((z) => passt(z, where)).length),
    create: jest.fn(async ({ data, select }: { data: Zeile; select?: Zeile }) => {
      const z = neu(data);
      if (schluesselBelegt(z)) throw p2002(name);
      zeilen().push(z);
      return projizieren(z, select);
    }),
    createMany: jest.fn(async ({ data, skipDuplicates }: { data: Zeile[]; skipDuplicates?: boolean }) => {
      let count = 0;
      for (const d of data) {
        const z = neu(d);
        if (schluesselBelegt(z)) {
          if (skipDuplicates) continue;
          throw p2002(name);
        }
        zeilen().push(z);
        count += 1;
      }
      return { count };
    }),
    update: jest.fn(async ({ where, data }: { where: Zeile; data: Zeile }) => {
      const z = zeilen().find((x) => passt(x, where));
      if (!z) throw Object.assign(new Error("Record not found."), { code: "P2025" });
      anwenden(z, data);
      return structuredClone(z);
    }),
    updateMany: jest.fn(async ({ where, data }: { where?: Zeile; data: Zeile }) => {
      const treffer = zeilen().filter((z) => passt(z, where));
      treffer.forEach((z) => anwenden(z, data));
      return { count: treffer.length };
    }),
    deleteMany: jest.fn(async ({ where }: { where?: Zeile } = {}) => {
      const treffer = zeilen().filter((z) => passt(z, where));
      stand[name] = zeilen().filter((z) => !treffer.includes(z));
      return { count: treffer.length };
    }),
  };
}

const mockPrisma = {
  offboardingProcess: tabelle("austritte"),
  onboardingProcess: {
    ...tabelle("einstellungen"),
    // Relationsfilter der Kandidatenabfrage kann die Test-DB nicht.
    findMany: jest.fn(async () => [] as Zeile[]),
  },
  offboardingDepartmentLink: {
    ...tabelle("links"),
    // Seit S30: Link samt Austritt zum Token (Link-Seite der Stelle) – `include` liest den Austritt aus der Tabelle.
    findUnique: jest.fn(
      async ({ where, select, include }: { where: Zeile; select?: Zeile; include?: Record<string, unknown> }) => {
        const l = stand.links.find((x) => passt(x, where));
        if (!l) return null;
        const r = projizieren(l, select);
        if (include?.offboarding) r.offboarding = structuredClone(stand.austritte.find((a) => a.id === l.offboardingId) ?? null);
        if (include?.onboarding) r.onboarding = null;
        return r;
      },
    ),
  },
  offboardingChecklistItem: tabelle("aufgaben", {
    neu: neueOffboardingAufgabe,
    eindeutig: (z) => (z.ausgabeId && z.herkunft ? `${z.offboardingId}|${z.ausgabeId}|${z.herkunft}` : null),
  }),
  returnItem: tabelle("rueckgaben", {
    neu: neueRueckgabe,
    eindeutig: (z) => (z.ausgabeId ? `${z.offboardingId}|${z.ausgabeId}` : null),
  }),
  ausgabe: tabelle("ausgaben", { neu: neueAusgabe }),
  onboardingAusstattung: tabelle("zeilen"),
  checklistItem: tabelle("onboardingAufgaben"),
  onboardingAusstattungAufgabe: tabelle("verknuepfungen"),
  ausstattungsPosition: tabelle("positionen"),
  departmentConfig: tabelle("konfigs"),
  organization: tabelle("orgs"),
  offboardingDocument: { findMany: jest.fn(async () => [] as Zeile[]) },
  // Seit S30: Urheber-Namen im Portal-PATCH (nur, wenn jemand anderes abgehakt hat).
  user: { findUnique: jest.fn(async () => null) },
  auditLog: {
    create: jest.fn(async ({ data }: { data: Zeile }) => {
      stand.audits.push(data);
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
jest.mock("@/lib/webhooks", () => ({ triggerWebhooks: (...a: unknown[]) => mockTriggerWebhooks(...a) }));
jest.mock("@/lib/permissions", () => {
  const echt = jest.requireActual("@/lib/permissions");
  return { ...echt, canAccessProcess: (...a: unknown[]) => mockCanAccessProcess(...a) };
});

import { einstellungAktionAusfuehren, einstellungVorschlaegeLaden, rueckgabeAendern } from "@/lib/offboarding-ausgaben";
import { aufgabeImPortalAendern, oeffentlicheAufgabeAendern } from "@/lib/abteilungsaufgaben-uebergaenge";
import type { RueckgabeAendernInput } from "@/lib/validations/offboarding";
import {
  offboardingVersandBereich,
  versandSperreFreigeben,
  versandSperreNehmen,
} from "@/lib/abteilungsaufgaben-dienst";
import { ABTEILUNGS_AUDIT, MELDUNGEN } from "@/lib/abteilungsaufgaben";
import { AUSSTATTUNG_KATEGORIE, ORDER_BASIS } from "@/lib/ausstattung";
import { AUSGABEN_AUDIT, MELDUNGEN_AUSGABEN, RUECKNAHME_TEXTE } from "@/lib/ausgaben";
import { ausgabeOhneVermerkAnlegenIn } from "@/lib/ausgaben-schreiben";
import type { SessionPayload } from "@/lib/permissions";

// =============================================
// Testdaten
// =============================================

/** 20.07.2027, 12:00 Uhr in Berlin. */
const JETZT = new Date("2027-07-20T10:00:00.000Z");
const tag = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

const A_ID = "off-a";
const B_ID = "off-b";
const E_ID = "onb-1";

const HR: SessionPayload = {
  userId: "u-hr",
  email: "hr@example.org",
  role: "HR_SACHBEARBEITER",
  firstName: "Erika",
  lastName: "Sachbearbeiter",
};

const KENNUNGEN = ["FES-IPAD-0412", "GS-114", "DA-77"];

function austritt(teil: Zeile = {}): Zeile {
  return {
    id: A_ID,
    displayId: "OFF-2027-GYM-014",
    organizationId: "org-gym",
    arbeitsortId: null,
    status: "HANDOVER_PHASE",
    exitType: "KUENDIGUNG_ARBEITNEHMER",
    lastWorkingDay: tag("2027-07-31"),
    onboardingId: null,
    weitereBeschaeftigung: null,
    employeeFirstName: "Anna",
    employeeLastName: "Schmidt",
    employeeEmail: "a.schmidt@fes-minden.de",
    employeePrivateEmail: null,
    updatedAt: new Date("2027-07-01T08:00:00.000Z"),
    ...teil,
  };
}

function einstellung(teil: Zeile = {}): Zeile {
  return {
    id: E_ID,
    displayId: "2027-GYM-007",
    organizationId: "org-gym",
    arbeitsortId: null,
    processType: "EINSTELLUNG",
    status: "COMPLETED",
    expiredAt: null,
    email: "anna.privat@example.org",
    firstName: "Anna",
    lastName: "Schmidt",
    personalData: null,
    supervisorData: { vertragsbeginn: tag("2027-02-01"), ausgabenAngeboten: true },
    updatedAt: new Date("2027-02-01T08:00:00.000Z"),
    ...teil,
  };
}

function ausgabe(teil: Zeile): Zeile {
  return neueAusgabe({
    onboardingId: E_ID,
    organizationId: "org-gym",
    zentral: false,
    quelle: "LINK",
    beiAustritt: "RUECKGABE",
    uebergebenAm: tag("2027-01-28"),
    zustandAm: new Date("2027-01-28T10:00:00.000Z"),
    createdAt: new Date("2027-01-28T10:00:00.000Z"),
    ...teil,
  });
}

/** iPad (IT, Einrichtung), Schluessel (Gebaeudewirtschaft der Einrichtung), Dienstausweis (zentral), Zugaenge (zentral, SPERREN). */
const IPAD = (teil: Zeile = {}) =>
  ausgabe({
    id: "ag-ipad",
    checklistItemId: "i-ipad",
    departmentKey: "IT",
    bezeichnung: "Dienst-iPad (Lernmittel)",
    kennungLabel: "Inventarnummer",
    kennung: "FES-IPAD-0412",
    rueckgabeKategorie: "IT_HARDWARE",
    ...teil,
  });
const SCHLUESSEL = (teil: Zeile = {}) =>
  ausgabe({
    id: "ag-schl",
    checklistItemId: "i-schl",
    departmentKey: "FACILITY",
    bezeichnung: "Schlüssel: Haupteingang",
    kennungLabel: "Schlüsselnummer",
    kennung: "GS-114",
    rueckgabeKategorie: "SCHLUESSEL",
    uebergebenAm: tag("2027-01-30"),
    createdAt: new Date("2027-01-30T10:00:00.000Z"),
    ...teil,
  });
const AUSWEIS = (teil: Zeile = {}) =>
  ausgabe({
    id: "ag-ausweis",
    checklistItemId: "i-ausweis",
    departmentKey: "VERWALTUNG",
    bezeichnung: "Dienstausweis",
    zentral: true,
    kennung: "DA-77",
    rueckgabeKategorie: null,
    uebergebenAm: tag("2027-01-31"),
    createdAt: new Date("2027-01-31T10:00:00.000Z"),
    ...teil,
  });
const ZUGANG = (teil: Zeile = {}) =>
  ausgabe({
    id: "ag-zugang",
    checklistItemId: "i-zugang",
    departmentKey: "IT",
    bezeichnung: "Zugänge (Portal, E-Mail)",
    zentral: true,
    beiAustritt: "SPERREN",
    kennung: null,
    uebergebenAm: tag("2027-02-01"),
    createdAt: new Date("2027-02-01T10:00:00.000Z"),
    ...teil,
  });

/** Ein Austritt bezieht eine Ausgabe (Ruecknahmeaufgabe und Rueckgabe-Zeile). */
function beziehtAusgabe(offboardingId: string, ausgabeId: string, teil: { rueckgabe?: Zeile; aufgabe?: Zeile } = {}) {
  stand.aufgaben.push(
    neueOffboardingAufgabe({
      offboardingId,
      title: "Stück zurücknehmen",
      category: AUSSTATTUNG_KATEGORIE,
      assigneeDepartment: "IT",
      herkunft: "AUSGABE",
      ausgabeId,
      ...teil.aufgabe,
    }),
  );
  stand.rueckgaben.push(
    neueRueckgabe({ offboardingId, category: "IT_HARDWARE", itemName: "Stück", ausgabeId, ...teil.rueckgabe }),
  );
}

function link(teil: Zeile = {}): Zeile {
  return neuerLink({
    offboardingId: A_ID,
    departmentKey: "IT",
    departmentName: "IT-Abteilung",
    email: "it@example.org",
    token: "tok-it",
    expiresAt: new Date("2027-07-25T10:00:00.000Z"),
    sentAt: new Date("2027-07-01T08:00:00.000Z"),
    lastSentAt: new Date("2027-07-01T08:00:00.000Z"),
    lastSendStatus: "SENT",
    ...teil,
  });
}

function aktion(body: unknown, session: SessionPayload = HR) {
  return einstellungAktionAusfuehren({ offboardingId: A_ID, rohBody: body, session, jetzt: JETZT });
}

const zuordnen = (teil: Zeile = {}) => aktion({ aktion: "zuordnen", onboardingId: E_ID, ...teil });

/** Wie zuordnen, aber der Ausgangsstand ist schon zugeordnet (fuer aktualisieren, ohne-vermerk, loesen). */
function zugeordnet(teil: Zeile = {}) {
  stand.austritte = [austritt({ onboardingId: E_ID, weitereBeschaeftigung: false, ...teil })];
}

const austrittVon = (id = A_ID) => stand.austritte.find((a) => a.id === id) as Zeile;
const aufgabenVon = (id = A_ID) => stand.aufgaben.filter((a) => a.offboardingId === id && a.herkunft != null);
const rueckgabenVon = (id = A_ID) => stand.rueckgaben.filter((r) => r.offboardingId === id && r.ausgabeId != null);
const auditsVon = (action: string) => stand.audits.filter((a) => a.action === action);
const ausgabeMit = (id: string) => stand.ausgaben.find((a) => a.id === id) as Zeile;
const reihenfolge = (m: jest.Mock) => m.mock.invocationCallOrder[0];

beforeEach(() => {
  jest.clearAllMocks();
  stand.austritte = [austritt()];
  stand.einstellungen = [einstellung()];
  stand.links = [];
  stand.aufgaben = [];
  stand.rueckgaben = [];
  stand.ausgaben = [IPAD(), SCHLUESSEL(), AUSWEIS(), ZUGANG()];
  // Ausstattung der Einstellung: ein Laptop, abgehakt, aber ohne Uebergabevermerk.
  stand.zeilen = [
    neueAusstattungsZeile({
      id: "aus-laptop",
      onboardingId: E_ID,
      positionId: "pos-laptop",
      departmentKey: "IT",
      art: "JA_NEIN",
      bezeichnung: "Dienst-Laptop/PC",
      aufgabeTitel: "Dienst-Laptop/PC bereitstellen",
      quelle: "FUEHRUNGSKRAFT",
      beiAustritt: "RUECKGABE",
      rueckgabeKategorie: "IT_HARDWARE",
      ausgabeKennung: "Inventarnummer",
    }),
  ];
  stand.onboardingAufgaben = [
    neueOnboardingAufgabe({
      id: "i-laptop",
      onboardingId: E_ID,
      title: "Dienst-Laptop/PC bereitstellen",
      category: AUSSTATTUNG_KATEGORIE,
      herkunft: "AUSSTATTUNG",
      assignee: "IT",
      isCompleted: true,
      // 03.02.2027, 10:00 Uhr in Berlin
      completedAt: new Date("2027-02-03T09:00:00.000Z"),
    }),
  ];
  stand.verknuepfungen = [{ ausstattungId: "aus-laptop", option: "", checklistItemId: "i-laptop", createdAt: new Date() }];
  stand.positionen = [{ id: "pos-laptop", organizationId: "org-gym" }];
  stand.konfigs = [
    { departmentKey: "IT", departmentName: "IT-Abteilung", email: "it@example.org", organizationId: null, isActive: true },
    { departmentKey: "FACILITY", departmentName: "Hausmeister Gymnasium", email: "fm@example.org", organizationId: "org-gym", isActive: true },
    { departmentKey: "VERWALTUNG", departmentName: "Sekretariat", email: "sek@example.org", organizationId: null, isActive: true },
  ];
  stand.orgs = [
    { id: "org-gym", name: "FES Gymnasium" },
    { id: "org-gs", name: "FES Grundschule" },
    { id: "org-fv", name: "Förderverein FES" },
  ];
  stand.audits = [];
  mockCanAccessProcess.mockResolvedValue(true);
});

// =============================================
// Zuordnen mit Rueckgabe-Vorschlag (G13, G14)
// =============================================

describe("Zuordnen übernimmt den Rückgabe-Vorschlag (E-A35, G13, G14)", () => {
  it("ohne weitere Beschäftigung: alles aus der Einrichtung und die zentralen – Gegenstände mit Rückgabe, Zugang nur als Sperraufgabe", async () => {
    const r = await zuordnen();
    expect(r.status).toBe(200);
    expect(r.body.meldung).toBe("Einstellung 2027-GYM-007 zugeordnet. 3 Rückgaben und 1 Sperraufgabe übernommen.");

    expect(aufgabenVon().map((a) => [a.ausgabeId, a.assigneeDepartment, a.title])).toEqual([
      ["ag-ipad", "IT", "Dienst-iPad (Lernmittel) zurücknehmen"],
      ["ag-schl", "FACILITY", "Schlüssel: Haupteingang zurücknehmen"],
      ["ag-ausweis", "VERWALTUNG", "Dienstausweis zurücknehmen"],
      ["ag-zugang", "IT", "Zugänge (Portal, E-Mail) sperren"],
    ]);
    // SPERREN bekommt keine Rueckgabe-Zeile.
    expect(rueckgabenVon().map((x) => [x.ausgabeId, x.category, x.itemName, x.serialNumber, x.zustand, x.isReturned])).toEqual([
      ["ag-ipad", "IT_HARDWARE", "Dienst-iPad (Lernmittel)", "FES-IPAD-0412", null, false],
      ["ag-schl", "SCHLUESSEL", "Schlüssel: Haupteingang", "GS-114", null, false],
      ["ag-ausweis", "SONSTIGES", "Dienstausweis", "DA-77", null, false],
    ]);
    // Der Zustand der Ausgaben aendert sich durch die Uebernahme nicht.
    for (const a of stand.ausgaben) expect(a.zustand).toBe("AUSGEGEBEN");
    expect(mockTriggerWebhooks).not.toHaveBeenCalled();
  });

  it("Titel und Beschreibung tragen nie die Kennung (G14, G21); Kategorie, Reihenfolge und Herkunft", async () => {
    await zuordnen();
    const texte = JSON.stringify(aufgabenVon().map((a) => [a.title, a.description]));
    for (const k of KENNUNGEN) expect(texte).not.toContain(k);
    const ipad = aufgabenVon().find((a) => a.ausgabeId === "ag-ipad") as Zeile;
    expect(ipad).toMatchObject({
      description: RUECKNAHME_TEXTE.beschreibungRueckgabe,
      category: AUSSTATTUNG_KATEGORIE,
      orderIndex: ORDER_BASIS,
      herkunft: "AUSGABE",
      isCompleted: false,
    });
    expect(aufgabenVon().find((a) => a.ausgabeId === "ag-zugang")).toMatchObject({
      description: RUECKNAHME_TEXTE.beschreibungSperren,
      orderIndex: ORDER_BASIS + 3,
    });
    // Auch das Protokoll nennt keine Kennung.
    const protokoll = JSON.stringify(stand.audits);
    for (const k of KENNUNGEN) expect(protokoll).not.toContain(k);
  });

  it("Fälligkeit = später von letztem Arbeitstag und heute (Berliner Kalendertag)", async () => {
    await zuordnen();
    expect(aufgabenVon().map((a) => (a.dueDate as Date).toISOString())).toEqual(
      Array(4).fill("2027-07-31T00:00:00.000Z"),
    );

    // Letzter Arbeitstag schon vorbei: faellig heute.
    stand.austritte = [austritt({ lastWorkingDay: tag("2027-07-10") })];
    stand.aufgaben = [];
    stand.rueckgaben = [];
    await zuordnen();
    expect(aufgabenVon().map((a) => (a.dueDate as Date).toISOString())).toEqual(
      Array(4).fill("2027-07-20T00:00:00.000Z"),
    );
  });

  it("mit weiterer Beschäftigung: zentrale nur als Hinweis – ohne Aufgabe und ohne Rückgabe", async () => {
    const r = await zuordnen({ weitereBeschaeftigung: true });
    expect(r.status).toBe(200);
    expect(aufgabenVon().map((a) => a.ausgabeId)).toEqual(["ag-ipad", "ag-schl"]);
    expect(rueckgabenVon().map((x) => x.ausgabeId)).toEqual(["ag-ipad", "ag-schl"]);

    const data = r.body.data as Record<string, any>;
    expect(data.vorschlag.hinweisZentral.map((h: Zeile) => [h.ausgabeId, h.stelle, h.text])).toEqual([
      ["ag-ausweis", "Sekretariat", "übergeben 31.01.2027 · Sekretariat"],
      ["ag-zugang", "IT-Abteilung", "eingerichtet 01.02.2027 · IT-Abteilung"],
    ]);
    // Was schon uebernommen ist, steht nicht mehr im Vorschlag.
    expect(data.vorschlag.rueckgaben).toEqual([]);
    expect(auditsVon(AUSGABEN_AUDIT.RUECKGABEN_VORGESCHLAGEN)[0].details).toMatchObject({
      rueckgaben: 2,
      sperraufgaben: 0,
      hinweise: 2,
      herausgefallen: 0,
      auswahl: false,
    });
  });

  it("Einstellung mit Arbeitsort an einer anderen Einrichtung (Zweitbeschäftigung): Ausgabe nur als Hinweis; einzeln übernehmbar", async () => {
    stand.einstellungen = [einstellung({ organizationId: "org-fv", arbeitsortId: "org-gs" })];
    stand.ausgaben = [IPAD({ organizationId: "org-gs" })];
    const r = await zuordnen();
    expect(r.status).toBe(200);
    expect(aufgabenVon()).toEqual([]);
    expect(rueckgabenVon()).toEqual([]);
    const data = r.body.data as Record<string, any>;
    expect(data.vorschlag.hinweisAndereEinrichtung).toEqual([
      expect.objectContaining({ ausgabeId: "ag-ipad", einrichtung: "FES Grundschule", kennung: "FES-IPAD-0412" }),
    ]);
    // Arbeitsort wird nicht uebernommen (andere Einrichtung, G12).
    expect(austrittVon().arbeitsortId).toBeNull();

    // HR uebernimmt den Hinweis einzeln.
    const einzeln = await aktion({ aktion: "aktualisieren", ausgabeIds: ["ag-ipad"] });
    expect(einzeln.status).toBe(200);
    expect(einzeln.body.meldung).toBe("1 Rückgabe übernommen.");
    expect(aufgabenVon().map((a) => a.ausgabeId)).toEqual(["ag-ipad"]);
    expect(auditsVon(AUSGABEN_AUDIT.RUECKGABEN_AKTUALISIERT)[0].details).toMatchObject({ rueckgaben: 1, auswahl: true });
  });

  it("OGS-Kraft (Förderverein, Arbeitsort Grundschule): Arbeitsort übernommen, Ausgabe am Arbeitsort vorgeschlagen", async () => {
    stand.austritte = [austritt({ organizationId: "org-fv" })];
    stand.einstellungen = [einstellung({ organizationId: "org-fv", arbeitsortId: "org-gs" })];
    stand.ausgaben = [IPAD({ organizationId: "org-gs" })];
    expect((await zuordnen()).status).toBe(200);
    expect(austrittVon().arbeitsortId).toBe("org-gs");
    expect(aufgabenVon().map((a) => a.ausgabeId)).toEqual(["ag-ipad"]);
  });

  it("Auswahl `uebernehmen`: genau diese Stücke; eine fremde Ausgabe = 404, nichts geschrieben (Rollback)", async () => {
    let r = await zuordnen({ uebernehmen: ["ag-ipad"] });
    expect(r.status).toBe(200);
    expect(aufgabenVon().map((a) => a.ausgabeId)).toEqual(["ag-ipad"]);
    expect(auditsVon(AUSGABEN_AUDIT.RUECKGABEN_VORGESCHLAGEN)[0].details).toMatchObject({ auswahl: true, rueckgaben: 1 });

    stand.austritte = [austritt()];
    stand.aufgaben = [];
    stand.rueckgaben = [];
    stand.audits = [];
    stand.ausgaben.push(IPAD({ id: "ag-fremd", onboardingId: "onb-anders" }));
    r = await zuordnen({ uebernehmen: ["ag-ipad", "ag-fremd"] });
    expect(r).toEqual({ status: 404, body: { error: MELDUNGEN_AUSGABEN.AUSGABE_NICHT_GEFUNDEN } });
    expect(austrittVon().onboardingId).toBeNull();
    expect(stand.aufgaben).toEqual([]);
    expect(stand.audits).toEqual([]);
  });

  it("eine inzwischen ERSETZTE Ausgabe fällt nach der Sperre still heraus und wird gezählt", async () => {
    const echt = mockPrisma.ausgabe.updateMany.getMockImplementation()!;
    mockPrisma.ausgabe.updateMany.mockImplementation(async (args: { where?: Zeile; data: Zeile }) => {
      // Ein Tausch committet, bevor diese Transaktion die Ausgabe sperrt.
      if (args.where?.id === "ag-ipad") ausgabeMit("ag-ipad").zustand = "ERSETZT";
      return echt(args);
    });
    try {
      const r = await zuordnen();
      expect(r.status).toBe(200);
      expect(r.body.meldung).toBe(
        "Einstellung 2027-GYM-007 zugeordnet. 2 Rückgaben und 1 Sperraufgabe übernommen. 1 Stück hat sich inzwischen geändert und wurde nicht übernommen.",
      );
      expect(aufgabenVon().map((a) => a.ausgabeId)).not.toContain("ag-ipad");
      expect(auditsVon(AUSGABEN_AUDIT.RUECKGABEN_VORGESCHLAGEN)[0].details).toMatchObject({ herausgefallen: 1 });
    } finally {
      mockPrisma.ausgabe.updateMany.mockImplementation(echt);
    }
  });

  it("ein abgebrochener Austritt gibt seine Stücke frei (G28)", async () => {
    stand.austritte.push(austritt({ id: B_ID, displayId: "OFF-2027-GYM-009", status: "CANCELLED", onboardingId: E_ID }));
    beziehtAusgabe(B_ID, "ag-ipad");
    expect((await zuordnen()).status).toBe(200);
    expect(aufgabenVon().map((a) => a.ausgabeId)).toContain("ag-ipad");
  });

  it("zweiter Austritt nach einem abgeschlossenen mit VERBLEIBT: das Stück wird übernommen (bleibt VERBLEIBT, offen); ein offen gebliebenes AUSGEGEBEN nicht", async () => {
    stand.ausgaben = [IPAD({ zustand: "VERBLEIBT" }), SCHLUESSEL()];
    stand.austritte.push(austritt({ id: B_ID, displayId: "OFF-2027-GYM-009", status: "COMPLETED", onboardingId: E_ID }));
    beziehtAusgabe(B_ID, "ag-ipad", { rueckgabe: { zustand: "VERBLEIBT" }, aufgabe: { isCompleted: true } });
    beziehtAusgabe(B_ID, "ag-schl", { aufgabe: { assigneeDepartment: "FACILITY" } });

    const r = await zuordnen();
    expect(r.status).toBe(200);
    expect(aufgabenVon().map((a) => [a.ausgabeId, a.isCompleted])).toEqual([["ag-ipad", false]]);
    expect(rueckgabenVon().map((x) => [x.ausgabeId, x.zustand, x.isReturned])).toEqual([["ag-ipad", null, false]]);
    expect(ausgabeMit("ag-ipad").zustand).toBe("VERBLEIBT");
    // Der Schluessel gehoert weiter dem abgeschlossenen Austritt – ohne Kennung, mit Nummer (Zugriff).
    const data = r.body.data as Record<string, any>;
    expect(data.vorschlag.schonImAustritt).toEqual([
      { offboardingId: B_ID, displayId: "OFF-2027-GYM-009", anzahl: 1, text: "1 Stück läuft im Austritt OFF-2027-GYM-009." },
    ]);
  });

  it("schon informierte Stelle: Link verlängert (gleicher Token), wieder offen und protokolliert – ohne Mail", async () => {
    stand.links = [link({ allTasksComplete: true, completedAt: new Date("2027-07-10T08:00:00.000Z") })];
    // Die Vorlagenaufgabe der IT ist erledigt – deshalb war die Stelle fertig.
    stand.aufgaben = [
      neueOffboardingAufgabe({ offboardingId: A_ID, title: "Postfach umleiten", assigneeDepartment: "IT", isCompleted: true }),
    ];
    expect((await zuordnen()).status).toBe(200);
    const it = stand.links[0];
    expect(it).toMatchObject({ token: "tok-it", allTasksComplete: false, completedAt: null });
    // gueltigBis: max(heute + 90 Tage, spaeteste Faelligkeit + 30 Tage)
    expect((it.expiresAt as Date).toISOString()).toBe("2027-10-18T10:00:00.000Z");
    expect(auditsVon(ABTEILUNGS_AUDIT.ABTEILUNG_WIEDER_OFFEN)).toEqual([
      expect.objectContaining({
        offboardingId: A_ID,
        details: { departmentKey: "IT", linkId: it.id, ueber: "RUECKGABEN" },
      }),
    ]);
    expect(mockTriggerWebhooks).not.toHaveBeenCalled();
    // Arbeitsort: schon informiert, aber ohnehin keiner.
    expect(austrittVon().arbeitsortId).toBeNull();
  });

  it("Sperrreihenfolge (G24): Austritt → Einstellung → Links → Ausgaben → neue Zeilen", async () => {
    stand.links = [link()];
    await zuordnen();
    const austrittSperre = reihenfolge(mockPrisma.offboardingProcess.updateMany);
    const einstellungSperre = reihenfolge(mockPrisma.onboardingProcess.updateMany);
    const linkSperre = reihenfolge(mockPrisma.offboardingDepartmentLink.updateMany);
    const ausgabeSperre = reihenfolge(mockPrisma.ausgabe.updateMany);
    const aufgabenNeu = reihenfolge(mockPrisma.offboardingChecklistItem.createMany);
    const rueckgabenNeu = reihenfolge(mockPrisma.returnItem.createMany);
    expect(austrittSperre).toBeLessThan(einstellungSperre);
    expect(einstellungSperre).toBeLessThan(linkSperre);
    expect(linkSperre).toBeLessThan(ausgabeSperre);
    expect(ausgabeSperre).toBeLessThan(aufgabenNeu);
    expect(aufgabenNeu).toBeLessThan(rueckgabenNeu);
    // Ausgaben nach `id` gesperrt (zwei Transaktionen sperren gleich).
    const gesperrt = mockPrisma.ausgabe.updateMany.mock.calls.map((c) => String(c[0].where?.id));
    expect(gesperrt).toEqual([...gesperrt].sort());
    // `skipDuplicates` als Netz.
    expect(mockPrisma.offboardingChecklistItem.createMany).toHaveBeenCalledWith(expect.objectContaining({ skipDuplicates: true }));
    expect(mockPrisma.returnItem.createMany).toHaveBeenCalledWith(expect.objectContaining({ skipDuplicates: true }));
  });

  it("der Reiter nach dem Zuordnen: Zeilen mit Stelle und Übergabe, Sperraufgaben, Stepper, Protokoll, Lösen-Rückfrage", async () => {
    const r = await zuordnen();
    const data = r.body.data as Record<string, any>;
    expect(data.lage).toBe("AUSGABEN");
    expect(data.zeilen.find((z: Zeile) => z.ausgabeId === "ag-ipad")).toMatchObject({
      itemName: "Dienst-iPad (Lernmittel)",
      kategorieLabel: "IT-Hardware",
      serialNumber: "FES-IPAD-0412",
      kennungLabel: "Inventarnummer",
      zustand: null,
      zustandLabel: "offen",
      vorgeschlagen: true,
      stelle: "IT-Abteilung",
      uebergabe: "übergeben 28.01.2027 · IT-Abteilung",
      aktionen: { korrigieren: true, loeschen: false },
    });
    expect(data.sperraufgaben).toEqual([
      expect.objectContaining({
        departmentKey: "IT",
        text: "Sperraufgaben zum letzten Arbeitstag – IT-Abteilung, über den Offboarding-Link: Zugänge (Portal, E-Mail)",
        offen: 1,
      }),
    ]);
    expect(data.offen).toHaveLength(4);
    expect(data.schritt.erledigt).toBe(false);
    expect(data.protokoll).toMatchObject({ noetig: true, text: "Unterschriebenes Rückgabeprotokoll: fehlt" });
    expect(data.loesen).toEqual({
      aufgaben: 4,
      informierteStellen: 0,
      rueckfrage: MELDUNGEN_AUSGABEN.LOESEN_RUECKFRAGE(4, 0),
      sperrGrund: null,
    });
    expect(data.aktionen).toEqual({ zuordnen: false, loesen: true, aktualisieren: true, ohneVermerk: true });
    expect(data.ohneVermerk).toEqual([{ checklistItemId: "i-laptop", titel: "Dienst-Laptop/PC bereitstellen", erledigtAm: "2027-02-03" }]);
  });
});

// =============================================
// Rueckgaben aktualisieren (G13)
// =============================================

describe("Rückgaben aktualisieren", () => {
  it("ein zweites Aktualisieren legt nichts doppelt an", async () => {
    expect((await zuordnen()).status).toBe(200);
    const vorher = { aufgaben: aufgabenVon().length, rueckgaben: rueckgabenVon().length };
    jest.clearAllMocks();

    const r = await aktion({ aktion: "aktualisieren" });
    expect(r.status).toBe(200);
    expect(r.body.meldung).toBe(MELDUNGEN_AUSGABEN.NICHTS_NEU);
    expect({ aufgaben: aufgabenVon().length, rueckgaben: rueckgabenVon().length }).toEqual(vorher);
    expect(mockPrisma.offboardingChecklistItem.createMany).not.toHaveBeenCalled();
    expect(auditsVon(AUSGABEN_AUDIT.RUECKGABEN_AKTUALISIERT)).toEqual([]);
  });

  it("holt ein später vermerktes Stück nach", async () => {
    stand.ausgaben = [IPAD()];
    expect((await zuordnen()).status).toBe(200);
    stand.ausgaben.push(SCHLUESSEL());
    const r = await aktion({ aktion: "aktualisieren" });
    expect(r.body.meldung).toBe("1 Rückgabe übernommen.");
    expect(aufgabenVon().map((a) => [a.ausgabeId, a.orderIndex])).toEqual([
      ["ag-ipad", ORDER_BASIS],
      ["ag-schl", ORDER_BASIS + 1],
    ]);
  });

  it("gespeicherter Merker: keine zentralen; mit `weitereBeschaeftigung: false` im Body werden sie übernommen und der Merker gespeichert", async () => {
    expect((await zuordnen({ weitereBeschaeftigung: true })).status).toBe(200);
    expect(austrittVon().weitereBeschaeftigung).toBe(true);

    let r = await aktion({ aktion: "aktualisieren" });
    expect(r.body.meldung).toBe(MELDUNGEN_AUSGABEN.NICHTS_NEU);
    expect(aufgabenVon().map((a) => a.ausgabeId)).toEqual(["ag-ipad", "ag-schl"]);
    // Rueckfrage der Karte vor dem Aendern des Merkers (Review A4c): genau das, was danach uebernommen wird.
    let wechsel = (r.body.data as Record<string, any>).merkerWechsel;
    expect(wechsel.nach).toBe(false);
    expect(wechsel.uebernimmt.map((s: { ausgabeId: string }) => s.ausgabeId)).toEqual(["ag-ausweis", "ag-zugang"]);
    expect(JSON.stringify(wechsel)).not.toContain("@");

    r = await aktion({ aktion: "aktualisieren", weitereBeschaeftigung: false });
    expect(r.status).toBe(200);
    expect(r.body.meldung).toBe(
      `1 Rückgabe und 1 Sperraufgabe übernommen. ${MELDUNGEN_AUSGABEN.MERKER_GESPEICHERT(false)}`,
    );
    expect(austrittVon().weitereBeschaeftigung).toBe(false);
    expect(aufgabenVon().map((a) => a.ausgabeId)).toEqual(["ag-ipad", "ag-schl", "ag-ausweis", "ag-zugang"]);
    // Zurueck auf „ja“ uebernaehme nichts mehr (die zentralen sind schon da und bleiben).
    wechsel = (r.body.data as Record<string, any>).merkerWechsel;
    expect(wechsel).toEqual({ nach: true, uebernimmt: [] });
    expect(auditsVon(AUSGABEN_AUDIT.RUECKGABEN_AKTUALISIERT)[0]).toMatchObject({
      offboardingId: A_ID,
      onboardingId: E_ID,
      details: { rueckgaben: 1, sperraufgaben: 1, weitereBeschaeftigungGeaendert: true, weitereBeschaeftigung: false },
    });
  });

  it("ohne Zuordnung 409; abgeschlossener Austritt 409 VORGANG_ABGESCHLOSSEN", async () => {
    let r = await aktion({ aktion: "aktualisieren" });
    expect(r).toEqual({ status: 409, body: { error: MELDUNGEN_AUSGABEN.KEINE_ZUORDNUNG, grund: "KEINE_ZUORDNUNG" } });
    zugeordnet({ status: "COMPLETED" });
    r = await aktion({ aktion: "aktualisieren" });
    expect(r.body).toEqual({ error: MELDUNGEN_AUSGABEN.VORGANG_ABGESCHLOSSEN, grund: "VORGANG_ABGESCHLOSSEN" });
    expect(stand.aufgaben).toEqual([]);
  });
});

// =============================================
// Als ausgegeben uebernehmen (G13)
// =============================================

describe("„Als ausgegeben übernehmen“ (ohne Vermerk)", () => {
  beforeEach(() => {
    stand.ausgaben = [];
    zugeordnet();
  });

  it("legt die Ausgabe mit dem Erledigt-Tag an (HR, ohne Kennung) und übernimmt sie in den Austritt", async () => {
    const r = await aktion({ aktion: "ohne-vermerk", checklistItemIds: ["i-laptop"] });
    expect(r.status).toBe(200);
    expect(r.body.meldung).toBe("1 Aufgabe als ausgegeben übernommen. 1 Rückgabe übernommen.");
    expect(stand.ausgaben).toEqual([
      expect.objectContaining({
        onboardingId: E_ID,
        checklistItemId: "i-laptop",
        organizationId: "org-gym",
        departmentKey: "IT",
        bezeichnung: "Dienst-Laptop/PC",
        kennungLabel: "Inventarnummer",
        kennung: null,
        rueckgabeKategorie: "IT_HARDWARE",
        beiAustritt: "RUECKGABE",
        quelle: "HR",
        erfasstVonId: HR.userId,
        uebergebenAm: tag("2027-02-03"),
        zustand: "AUSGEGEBEN",
        loeschenAb: null,
      }),
    ]);
    const neu = stand.ausgaben[0];
    expect(aufgabenVon()).toEqual([expect.objectContaining({ ausgabeId: neu.id, title: "Dienst-Laptop/PC zurücknehmen" })]);
    expect(rueckgabenVon()).toEqual([expect.objectContaining({ ausgabeId: neu.id, category: "IT_HARDWARE" })]);
    expect(auditsVon(AUSGABEN_AUDIT.AUSGABE_UEBERNOMMEN)[0]).toMatchObject({
      offboardingId: A_ID,
      onboardingId: E_ID,
      details: { anzahl: 1, checklistItemIds: ["i-laptop"], ausgabeIds: [neu.id], uebersprungen: 0 },
    });
    // Die Einstellung wird nach dem Austritt gesperrt – bei jedem Status.
    expect(reihenfolge(mockPrisma.offboardingProcess.updateMany)).toBeLessThan(
      reihenfolge(mockPrisma.onboardingProcess.updateMany),
    );
    expect(mockPrisma.onboardingProcess.updateMany).toHaveBeenCalledWith({
      where: { id: E_ID, status: { notIn: [] } },
      data: { updatedAt: JETZT },
    });
  });

  it("ein zweites Mal: die Aufgabe hat jetzt einen Vermerk und wird übersprungen", async () => {
    await aktion({ aktion: "ohne-vermerk", checklistItemIds: ["i-laptop"] });
    jest.clearAllMocks();
    const r = await aktion({ aktion: "ohne-vermerk", checklistItemIds: ["i-laptop"] });
    expect(r.status).toBe(200);
    expect(r.body.meldung).toBe(MELDUNGEN_AUSGABEN.OHNE_VERMERK_UEBERSPRUNGEN(1));
    expect(stand.ausgaben).toHaveLength(1);
    expect(stand.audits.filter((a) => a.action === AUSGABEN_AUDIT.AUSGABE_UEBERNOMMEN)).toHaveLength(1);
  });

  it("nach der Absage trägt das neue Stück die Frist der Absage (G10)", async () => {
    stand.einstellungen = [einstellung({ status: "EXPIRED", expiredAt: new Date("2027-03-01T08:00:00.000Z") })];
    expect((await aktion({ aktion: "ohne-vermerk", checklistItemIds: ["i-laptop"] })).status).toBe(200);
    // drei Jahre ab Ende des Berliner Jahres 2027 → Beginn des 01.01.2031 in Berlin
    expect((stand.ausgaben[0].loeschenAb as Date).toISOString()).toBe("2030-12-31T23:00:00.000Z");
  });
});

// =============================================
// Loesen (G11)
// =============================================

describe("Lösen nach der Übernahme", () => {
  async function zugeordnetMitUebernahme() {
    stand.links = [link()];
    stand.aufgaben = [
      neueOffboardingAufgabe({ id: "t-it", offboardingId: A_ID, title: "Postfach umleiten", assigneeDepartment: "IT", isCompleted: true }),
    ];
    stand.rueckgaben = [neueRueckgabe({ id: "r-hand", offboardingId: A_ID, category: "SONSTIGES", itemName: "Parkkarte" })];
    expect((await zuordnen()).status).toBe(200);
    jest.clearAllMocks();
    stand.audits = [];
  }

  it("entfernt Ausgabe-Aufgaben und -Rückgaben, lässt Ausgaben, Vorlagen- und Handzeilen; die informierte Stelle ist danach fertig – ohne Mail", async () => {
    await zugeordnetMitUebernahme();
    const ausgabenVorher = structuredClone(stand.ausgaben);

    const r = await aktion({ aktion: "loesen" });
    expect(r.status).toBe(200);
    expect(aufgabenVon()).toEqual([]);
    expect(rueckgabenVon()).toEqual([]);
    expect(stand.aufgaben.map((a) => a.id)).toEqual(["t-it"]);
    expect(stand.rueckgaben.map((x) => x.id)).toEqual(["r-hand"]);
    expect(stand.ausgaben.map((a) => [a.id, a.zustand, a.kennung])).toEqual(
      ausgabenVorher.map((a) => [a.id, a.zustand, a.kennung]),
    );
    expect(stand.links[0]).toMatchObject({ allTasksComplete: true });
    expect(auditsVon(ABTEILUNGS_AUDIT.ABTEILUNG_FERTIG)).toEqual([
      expect.objectContaining({ details: expect.objectContaining({ departmentKey: "IT", ueber: "RUECKGABEN" }) }),
    ]);
    expect(mockTriggerWebhooks).not.toHaveBeenCalled();
    expect(auditsVon(AUSGABEN_AUDIT.EINSTELLUNG_GELOEST)[0].details).toEqual({
      geloeschteAufgaben: 4,
      geloeschteRueckgaben: 3,
      informierteStellen: 1,
      arbeitsortZurueckgesetzt: false,
    });
    expect(austrittVon()).toMatchObject({ onboardingId: null, weitereBeschaeftigung: null });
  });

  it("409 LOESEN_GESPERRT bei erledigter Ausgabe-Aufgabe bzw. Rückgabe mit Zustand – ohne Änderung", async () => {
    for (const vorbereiten of [
      () => ((aufgabenVon().find((a) => a.ausgabeId === "ag-zugang") as Zeile).isCompleted = true),
      () => ((rueckgabenVon().find((x) => x.ausgabeId === "ag-ipad") as Zeile).zustand = "FEHLT"),
      // Altbestand: `isReturned` ohne Zustand zaehlt als Zustand (G16).
      () => ((rueckgabenVon().find((x) => x.ausgabeId === "ag-ipad") as Zeile).isReturned = true),
    ]) {
      stand.austritte = [austritt()];
      stand.aufgaben = [];
      stand.rueckgaben = [];
      await zugeordnetMitUebernahme();
      vorbereiten();
      const vorher = structuredClone({ a: stand.aufgaben, r: stand.rueckgaben, o: stand.austritte });
      const r = await aktion({ aktion: "loesen" });
      expect(r).toEqual({ status: 409, body: { error: MELDUNGEN_AUSGABEN.LOESEN_GESPERRT, grund: "LOESEN_GESPERRT" } });
      expect({ a: stand.aufgaben, r: stand.rueckgaben, o: stand.austritte }).toEqual(vorher);
      expect(stand.audits).toEqual([]);
    }
  });

  it("der Reiter nennt den Sperrgrund vorher", async () => {
    await zugeordnetMitUebernahme();
    (rueckgabenVon()[0] as Zeile).zustand = "ZURUECK";
    const r = await aktion({ aktion: "aktualisieren" });
    const data = r.body.data as Record<string, any>;
    expect(data.loesen.sperrGrund).toBe(MELDUNGEN_AUSGABEN.LOESEN_GESPERRT);
    expect(data.aktionen.loesen).toBe(false);
  });

  it("Arbeitsort nur ohne informierte Stelle zurück", async () => {
    // Informiert: bleibt.
    stand.links = [link()];
    zugeordnet({ arbeitsortId: "org-gs" });
    expect((await aktion({ aktion: "loesen" })).status).toBe(200);
    expect(austrittVon().arbeitsortId).toBe("org-gs");

    // Nicht informiert: zurueck.
    stand.links = [];
    zugeordnet({ arbeitsortId: "org-gs" });
    expect((await aktion({ aktion: "loesen" })).status).toBe(200);
    expect(austrittVon().arbeitsortId).toBeNull();
  });

  it("Sperrreihenfolge (G24): Austritt → Links → Aufgaben → Rückgaben", async () => {
    await zugeordnetMitUebernahme();
    await aktion({ aktion: "loesen" });
    const austrittSperre = reihenfolge(mockPrisma.offboardingProcess.updateMany);
    const linkSperre = reihenfolge(mockPrisma.offboardingDepartmentLink.updateMany);
    const aufgabenWeg = reihenfolge(mockPrisma.offboardingChecklistItem.deleteMany);
    const rueckgabenWeg = reihenfolge(mockPrisma.returnItem.deleteMany);
    expect(austrittSperre).toBeLessThan(linkSperre);
    expect(linkSperre).toBeLessThan(aufgabenWeg);
    expect(aufgabenWeg).toBeLessThan(rueckgabenWeg);
    // Bedingt auf „offen“ – ein gleichzeitiger Haken bliebe stehen und fuehrte zum Rollback.
    expect(mockPrisma.offboardingChecklistItem.deleteMany).toHaveBeenCalledWith({
      where: { offboardingId: A_ID, herkunft: { in: ["AUSGABE", "AUSGABE_FEHLT"] }, isCompleted: false },
    });
    expect(mockPrisma.returnItem.deleteMany).toHaveBeenCalledWith({
      where: { offboardingId: A_ID, ausgabeId: { not: null }, zustand: null, isReturned: false },
    });
  });
});

// =============================================
// Versandsperre (G26)
// =============================================

describe("Versandsperre des Austritts (G26)", () => {
  it.each([
    ["aktualisieren", { aktion: "aktualisieren" }],
    ["loesen", { aktion: "loesen" }],
    ["ohne-vermerk", { aktion: "ohne-vermerk", checklistItemIds: ["i-laptop"] }],
  ])("%s während eines laufenden Versands: 409 VERSAND_LAEUFT, nichts geschrieben", async (_name, body) => {
    zugeordnet();
    const bereich = offboardingVersandBereich(A_ID);
    expect(versandSperreNehmen(bereich)).toBe(true);
    try {
      const r = await aktion(body);
      expect(r).toEqual({ status: 409, body: { error: MELDUNGEN.VERSAND_LAEUFT, grund: "VERSAND_LAEUFT" } });
      expect(mockPrisma.offboardingProcess.updateMany).not.toHaveBeenCalled();
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    } finally {
      versandSperreFreigeben(bereich);
    }
    // Danach wieder frei.
    expect((await aktion(body)).status).toBe(200);
  });
});

// =============================================
// Vorschau im Dialog (GET /einstellung?vorschau=…)
// =============================================

describe("Vorschau: Rückgabe-Vorschlag vor der Bestätigung", () => {
  const lesen = (query: Record<string, string>) =>
    einstellungVorschlaegeLaden({ offboardingId: A_ID, query, session: HR });

  it("nennt Rückgaben, Sperraufgaben und Hinweise – mit dem Merker aus dem Dialog; schreibt nichts", async () => {
    let r = await lesen({ vorschau: E_ID });
    expect(r.status).toBe(200);
    let vorschau = (r.body.data as Record<string, any>).vorschau;
    expect(vorschau.weitereBeschaeftigung).toBe(false);
    expect(vorschau.rueckgaben.rueckgaben.map((a: Zeile) => a.ausgabeId)).toEqual(["ag-ipad", "ag-schl", "ag-ausweis"]);
    expect(vorschau.rueckgaben.sperraufgaben.map((a: Zeile) => a.ausgabeId)).toEqual(["ag-zugang"]);
    expect(vorschau.rueckgaben.rueckgaben[0]).toMatchObject({
      bezeichnung: "Dienst-iPad (Lernmittel)",
      kennung: "FES-IPAD-0412",
      stelle: "IT-Abteilung",
      einrichtung: "FES Gymnasium",
    });

    r = await lesen({ vorschau: E_ID, weitereBeschaeftigung: "true" });
    vorschau = (r.body.data as Record<string, any>).vorschau;
    expect(vorschau.weitereBeschaeftigung).toBe(true);
    expect(vorschau.rueckgaben.rueckgaben.map((a: Zeile) => a.ausgabeId)).toEqual(["ag-ipad", "ag-schl"]);
    expect(vorschau.rueckgaben.hinweisZentral.map((a: Zeile) => a.ausgabeId)).toEqual(["ag-ausweis", "ag-zugang"]);

    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockPrisma.offboardingProcess.updateMany).not.toHaveBeenCalled();
    expect(stand.audits).toEqual([]);
  });

  it("Stücke, die ein anderer Austritt bindet, ohne Kennung; die Nummer nur mit Zugriff", async () => {
    stand.austritte.push(austritt({ id: B_ID, displayId: "OFF-2027-FV-0001", organizationId: "org-fv", status: "COMPLETED" }));
    beziehtAusgabe(B_ID, "ag-ipad");
    mockCanAccessProcess.mockImplementation(async (_s: unknown, org: string) => org !== "org-fv");
    const r = await lesen({ vorschau: E_ID });
    const vorschau = (r.body.data as Record<string, any>).vorschau;
    expect(vorschau.rueckgaben.schonImAustritt).toEqual([
      { offboardingId: B_ID, displayId: null, anzahl: 1, text: "1 Stück läuft in einem anderen Austritt." },
    ]);
    expect(JSON.stringify(vorschau.rueckgaben.schonImAustritt)).not.toContain("FES-IPAD-0412");
    expect(vorschau.rueckgaben.rueckgaben.map((a: Zeile) => a.ausgabeId)).not.toContain("ag-ipad");
  });
});

// =============================================
// Schreiber: „Als ausgegeben übernehmen“ nur von HR (G2, G3)
// =============================================

describe("ausgabeOhneVermerkAnlegenIn", () => {
  const basis = {
    onboardingId: E_ID,
    checklistItemId: "i-laptop",
    organizationId: "org-gym",
    zentral: false,
    departmentKey: "IT",
    bezeichnung: "Dienst-Laptop/PC",
    kennungLabel: null,
    rueckgabeKategorie: "IT_HARDWARE",
    beiAustritt: "RUECKGABE" as const,
  };

  it("ein Stück ohne Kennung mit dem Erledigt-Tag; ohne HR-Konto bzw. über den Link: Programmfehler, nichts geschrieben", async () => {
    stand.ausgaben = [];
    const id = await ausgabeOhneVermerkAnlegenIn(
      mockPrisma as never,
      { ...basis, quelle: "HR", erfasstVonId: HR.userId },
      "2027-02-03",
      JETZT,
    );
    expect(stand.ausgaben).toEqual([
      expect.objectContaining({ id, kennung: null, quelle: "HR", uebergebenAm: tag("2027-02-03"), zustand: "AUSGEGEBEN" }),
    ]);
    await expect(
      ausgabeOhneVermerkAnlegenIn(mockPrisma as never, { ...basis, quelle: "LINK", erfasstVonId: null }, "2027-02-03", JETZT),
    ).rejects.toThrow(/nur von HR/);
    await expect(
      ausgabeOhneVermerkAnlegenIn(mockPrisma as never, { ...basis, quelle: "HR", erfasstVonId: null }, "2027-02-03", JETZT),
    ).rejects.toThrow(/nur von HR/);
    expect(stand.ausgaben).toHaveLength(1);
  });
});

// =============================================
// Gleichlauf: ein Stueck, drei Zeilen, ein Stand (S30, G15 bis G17)
// =============================================

describe("Gleichlauf auf drei Wegen (S30, G15 bis G17)", () => {
  /** 22.07.2027, 12:00 Uhr in Berlin – zwei Tage nach JETZT. */
  const SPAETER = new Date("2027-07-22T10:00:00.000Z");
  /** Beginn des 01.01.2031 in Berlin: FEHLT im Jahr 2027 → drei Jahre ab Jahresende (G20). */
  const DREI_JAHRE = "2030-12-31T23:00:00.000Z";
  /** Beginn des 20.01.2028 in Berlin: sechs Monate nach dem 20.07.2027 (G20). */
  const SECHS_MONATE = "2028-01-19T23:00:00.000Z";

  const aufgabeZu = (ausgabeId: string, herkunft = "AUSGABE", offboardingId = A_ID) =>
    stand.aufgaben.find((a) => a.offboardingId === offboardingId && a.ausgabeId === ausgabeId && a.herkunft === herkunft) as Zeile;
  const rueckgabeZu = (ausgabeId: string, offboardingId = A_ID) =>
    stand.rueckgaben.find((r) => r.offboardingId === offboardingId && r.ausgabeId === ausgabeId) as Zeile;
  const folgen = () => stand.aufgaben.filter((a) => a.herkunft === "AUSGABE_FEHLT");

  const perLink = (token: string, itemId: string, body: unknown, jetzt = JETZT) =>
    oeffentlicheAufgabeAendern(token, itemId, body, jetzt);
  const imPortal = (itemId: string, body: unknown, jetzt = JETZT) =>
    aufgabeImPortalAendern({ offboardingId: A_ID, itemId, rohBody: body, session: HR, jetzt });
  const imReiter = (rueckgabeId: string, eingabe: Record<string, unknown>, jetzt = JETZT, offboardingId = A_ID) =>
    rueckgabeAendern({
      offboardingId,
      eingabe: { itemId: rueckgabeId, ...eingabe } as RueckgabeAendernInput,
      session: HR,
      jetzt,
    });

  /** Frisch zugeordnet und uebernommen: IT, Gebaeudewirtschaft und Sekretariat sind informiert. */
  async function mitRueckgaben() {
    stand.austritte = [austritt({ organization: { name: "FES Gymnasium", mandantNumber: "737" } })];
    stand.aufgaben = [];
    stand.rueckgaben = [];
    stand.ausgaben = [IPAD(), SCHLUESSEL(), AUSWEIS(), ZUGANG()];
    stand.links = [
      link({ departmentKey: "IT", token: "tok-it" }),
      link({ departmentKey: "FACILITY", departmentName: "Hausmeister Gymnasium", email: "fm@example.org", token: "tok-fm" }),
      link({ departmentKey: "VERWALTUNG", departmentName: "Sekretariat", email: "sek@example.org", token: "tok-vw" }),
    ];
    expect((await zuordnen()).status).toBe(200);
    jest.clearAllMocks();
    stand.audits = [];
  }

  /** Der Stand eines Stuecks auf seinen drei Zeilen (und die Folgeaufgabe). */
  function standVon(ausgabeId: string) {
    const a = ausgabeMit(ausgabeId);
    const r = rueckgabeZu(ausgabeId);
    const f = aufgabeZu(ausgabeId, "AUSGABE_FEHLT");
    return {
      ausgabe: { zustand: a.zustand, loeschenAb: (a.loeschenAb as Date | null)?.toISOString() ?? null },
      aufgabe: { isCompleted: aufgabeZu(ausgabeId).isCompleted },
      rueckgabe: r ? { zustand: r.zustand, isReturned: r.isReturned } : null,
      folge: f
        ? {
            isCompleted: f.isCompleted,
            assigneeDepartment: f.assigneeDepartment,
            title: f.title,
            dueDate: (f.dueDate as Date).toISOString(),
          }
        : null,
      folgen: folgen().length,
    };
  }

  type Weg = "Link" | "Portal" | "Reiter";
  const WEGE: Weg[] = ["Link", "Portal", "Reiter"];

  /** Setzt einen Rueckgabezustand auf dem gewaehlten Weg (der Link ist der der ausgebenden Stelle). */
  function setzen(weg: Weg, ausgabeId: string, zustand: string | null, token = "tok-fm", jetzt = JETZT) {
    if (weg === "Link") {
      return perLink(token, aufgabeZu(ausgabeId).id as string, zustand ? { isCompleted: true, zustand } : { isCompleted: false }, jetzt);
    }
    if (weg === "Portal") {
      return imPortal(aufgabeZu(ausgabeId).id as string, zustand ? { zustand } : { isCompleted: false }, jetzt);
    }
    return imReiter(rueckgabeZu(ausgabeId).id as string, { zustand }, jetzt);
  }

  beforeEach(async () => {
    await mitRueckgaben();
  });

  it("„fehlt“ an einem Schlüssel: alle drei Wege ergeben denselben Stand – samt Frist und Folgeaufgabe", async () => {
    const ergebnisse: Record<string, unknown> = {};
    for (const weg of WEGE) {
      if (weg !== "Link") await mitRueckgaben();
      const r = await setzen(weg, "ag-schl", "FEHLT");
      expect({ weg, status: r.status }).toEqual({ weg, status: 200 });
      ergebnisse[weg] = standVon("ag-schl");
    }
    const erwartet = {
      ausgabe: { zustand: "FEHLT", loeschenAb: DREI_JAHRE },
      aufgabe: { isCompleted: true },
      rueckgabe: { zustand: "FEHLT", isReturned: false },
      folge: {
        isCompleted: false,
        assigneeDepartment: "FACILITY",
        title: "Schließung prüfen: Schlüssel: Haupteingang",
        dueDate: "2027-07-20T00:00:00.000Z",
      },
      folgen: 1,
    };
    expect(ergebnisse).toEqual({ Link: erwartet, Portal: erwartet, Reiter: erwartet });
    // Die Kennung steht nie im Titel der Folgeaufgabe (G21).
    expect(aufgabeZu("ag-schl", "AUSGABE_FEHLT").title).not.toContain("GS-114");
    expect(auditsVon(AUSGABEN_AUDIT.AUSGABE_ZUSTAND_GEAENDERT)).toEqual([
      expect.objectContaining({
        offboardingId: A_ID,
        details: { ausgabeId: "ag-schl", von: "AUSGEGEBEN", nach: "FEHLT", ueber: "RUECKGABEN", folgeaufgabe: "ANLEGEN" },
      }),
    ]);
  });

  it("abhaken OHNE Zustand heißt ZURUECK – über den Link und im Portal (der Haken im Reiter Checkliste schickt nur `isCompleted`)", async () => {
    let r = await perLink("tok-it", aufgabeZu("ag-ipad").id as string, { isCompleted: true });
    expect(r.status).toBe(200);
    r = await imPortal(aufgabeZu("ag-schl").id as string, { isCompleted: true });
    expect(r.status).toBe(200);
    for (const id of ["ag-ipad", "ag-schl"]) {
      expect(standVon(id)).toEqual({
        ausgabe: { zustand: "ZURUECK", loeschenAb: SECHS_MONATE },
        aufgabe: { isCompleted: true },
        rueckgabe: { zustand: "ZURUECK", isReturned: true },
        folge: null,
        folgen: 0,
      });
    }
    // Ueber den Link ohne Urheber, im Portal mit HR (wie bisher).
    expect(aufgabeZu("ag-ipad")).toMatchObject({ completedById: null });
    expect(aufgabeZu("ag-schl")).toMatchObject({ completedById: HR.userId });
    expect(rueckgabeZu("ag-ipad")).toMatchObject({ returnedToId: null });
    expect(rueckgabeZu("ag-schl")).toMatchObject({ returnedToId: HR.userId });
    // Ein Zugang abgehakt heisst „gesperrt“ (ZURUECK), ohne Rueckgabe-Zeile.
    r = await perLink("tok-it", aufgabeZu("ag-zugang").id as string, { isCompleted: true });
    expect(r.status).toBe(200);
    expect(ausgabeMit("ag-zugang").zustand).toBe("ZURUECK");
    expect((r.body.data as Record<string, any>).aufgabe.ausgabe).toMatchObject({ art: "SPERREN", zustandLabel: "gesperrt", auswahl: [] });
  });

  it("die Link-Seite zeigt Kennung, Zustand und die drei Knöpfe an der eigenen Aufgabe – `herkunft` und `ausgabeId` gehen nicht hinaus", async () => {
    const r = await perLink("tok-it", aufgabeZu("ag-ipad").id as string, { isCompleted: true, zustand: "BESCHAEDIGT" });
    const aufgabe = (r.body.data as Record<string, any>).aufgabe;
    expect(aufgabe.ausgabe).toEqual({
      art: "RUECKGABE",
      kennungLabel: "Inventarnummer",
      kennung: "FES-IPAD-0412",
      uebergebenAm: "2027-01-28",
      zustand: "BESCHAEDIGT",
      zustandLabel: "beschädigt zurück",
      auswahl: [
        { zustand: "ZURUECK", label: "Zurückerhalten" },
        { zustand: "BESCHAEDIGT", label: "Beschädigt zurückerhalten" },
        { zustand: "FEHLT", label: "Fehlt" },
      ],
    });
    expect(aufgabe).not.toHaveProperty("herkunft");
    expect(aufgabe).not.toHaveProperty("ausgabeId");
    expect(rueckgabeZu("ag-ipad")).toMatchObject({ zustand: "BESCHAEDIGT", isReturned: true });
  });

  it("Wiederöffnen setzt AUSGEGEBEN (ohne Frist) und löscht die OFFENE Folgeaufgabe – auf jedem Weg", async () => {
    for (const weg of WEGE) {
      await mitRueckgaben();
      expect((await imPortal(aufgabeZu("ag-schl").id as string, { zustand: "FEHLT" })).status).toBe(200);
      expect(folgen()).toHaveLength(1);
      const r = await setzen(weg, "ag-schl", null);
      expect({ weg, status: r.status }).toEqual({ weg, status: 200 });
      expect({ weg, stand: standVon("ag-schl") }).toEqual({
        weg,
        stand: {
          ausgabe: { zustand: "AUSGEGEBEN", loeschenAb: null },
          aufgabe: { isCompleted: false },
          rueckgabe: { zustand: null, isReturned: false },
          folge: null,
          folgen: 0,
        },
      });
    }
  });

  it("„verbleibt“ und danach „offen“: AUSGEGEBEN (nicht VERBLEIBT) – auf jedem Weg (G15, Review A4c)", async () => {
    for (const weg of WEGE) {
      await mitRueckgaben();
      expect((await imPortal(aufgabeZu("ag-schl").id as string, { zustand: "VERBLEIBT" })).status).toBe(200);
      expect(ausgabeMit("ag-schl")).toMatchObject({ zustand: "VERBLEIBT", loeschenAb: null });
      const r = await setzen(weg, "ag-schl", null);
      expect({ weg, status: r.status }).toEqual({ weg, status: 200 });
      expect({ weg, stand: standVon("ag-schl") }).toEqual({
        weg,
        stand: {
          ausgabe: { zustand: "AUSGEGEBEN", loeschenAb: null },
          aufgabe: { isCompleted: false },
          rueckgabe: { zustand: null, isReturned: false },
          folge: null,
          folgen: 0,
        },
      });
    }
    // Auch ein Zugang (ohne Rückgabe-Zeile) über den Link: wieder offen = AUSGEGEBEN.
    await mitRueckgaben();
    expect((await imPortal(aufgabeZu("ag-zugang").id as string, { zustand: "VERBLEIBT" })).status).toBe(200);
    expect((await perLink("tok-it", aufgabeZu("ag-zugang").id as string, { isCompleted: false })).status).toBe(200);
    expect(ausgabeMit("ag-zugang").zustand).toBe("AUSGEGEBEN");
  });

  it("eine ERLEDIGTE Folgeaufgabe bleibt beim Wiederöffnen stehen (Nachweis der Prüfung)", async () => {
    await imPortal(aufgabeZu("ag-schl").id as string, { zustand: "FEHLT" });
    const folge = aufgabeZu("ag-schl", "AUSGABE_FEHLT");
    expect((await imPortal(folge.id as string, { isCompleted: true })).status).toBe(200);
    expect((await imPortal(aufgabeZu("ag-schl").id as string, { isCompleted: false })).status).toBe(200);
    expect(folgen()).toEqual([expect.objectContaining({ id: folge.id, isCompleted: true })]);
    expect(ausgabeMit("ag-schl").zustand).toBe("AUSGEGEBEN");
  });

  it.each(WEGE)(
    "%s: FEHLT → „Schließung prüfen“ erledigt → ZURUECK → wieder FEHLT öffnet DIESELBE Folgeaufgabe – fällig heute, ohne Erledigung und Kommentar, kein P2002",
    async (weg) => {
      expect((await setzen(weg, "ag-schl", "FEHLT")).status).toBe(200);
      const folge = aufgabeZu("ag-schl", "AUSGABE_FEHLT");
      // Die Gebaeudewirtschaft prueft und kommentiert ueber ihren Link.
      const geprueft = await perLink("tok-fm", folge.id as string, { isCompleted: true, comment: "Zylinder getauscht" });
      expect(geprueft.status).toBe(200);
      expect(aufgabeZu("ag-schl", "AUSGABE_FEHLT")).toMatchObject({ isCompleted: true, abteilungKommentar: "Zylinder getauscht" });

      // Der Schluessel kommt doch zurueck – ein reiner Zustandswechsel an der erledigten Aufgabe.
      expect((await setzen(weg, "ag-schl", "ZURUECK")).status).toBe(200);
      expect(standVon("ag-schl")).toMatchObject({ ausgabe: { zustand: "ZURUECK" }, folge: { isCompleted: true }, folgen: 1 });

      // … und fehlt wieder (zwei Tage spaeter).
      const r = await setzen(weg, "ag-schl", "FEHLT", "tok-fm", SPAETER);
      expect(r.status).toBe(200);
      expect(folgen()).toHaveLength(1);
      expect(aufgabeZu("ag-schl", "AUSGABE_FEHLT")).toMatchObject({
        id: folge.id,
        isCompleted: false,
        completedAt: null,
        completedById: null,
        abteilungKommentar: null,
        abteilungKommentarAm: null,
      });
      expect((aufgabeZu("ag-schl", "AUSGABE_FEHLT").dueDate as Date).toISOString()).toBe("2027-07-22T00:00:00.000Z");
      expect(mockPrisma.offboardingChecklistItem.create).toHaveBeenCalledTimes(1);
      // Offen beim Abschluss zaehlt sie wieder (E-A33).
      const reiter = await aktion({ aktion: "aktualisieren" });
      expect((reiter.body.data as Record<string, any>).offen).toEqual(
        expect.arrayContaining([{ titel: "Schließung prüfen: Schlüssel: Haupteingang", stelle: "Hausmeister Gymnasium" }]),
      );
    },
  );

  it("„bzw. Wiederöffnen“: FEHLT → Folgeaufgabe erledigt → wieder öffnen → FEHLT öffnet dieselbe Zeile über den Link", async () => {
    const schl = aufgabeZu("ag-schl").id as string;
    await perLink("tok-fm", schl, { isCompleted: true, zustand: "FEHLT" });
    const folge = aufgabeZu("ag-schl", "AUSGABE_FEHLT");
    await perLink("tok-fm", folge.id as string, { isCompleted: true });
    expect((await perLink("tok-fm", schl, { isCompleted: false })).status).toBe(200);
    expect((await perLink("tok-fm", schl, { isCompleted: true, zustand: "FEHLT" })).status).toBe(200);
    expect(folgen()).toEqual([expect.objectContaining({ id: folge.id, isCompleted: false })]);
  });

  it("„fehlt“ an einem Gegenstand, der kein Schlüssel ist: keine Folgeaufgabe, der FACILITY-Link wird nicht gesperrt", async () => {
    expect((await imPortal(aufgabeZu("ag-ipad").id as string, { zustand: "FEHLT" })).status).toBe(200);
    expect(folgen()).toEqual([]);
    expect(ausgabeMit("ag-ipad")).toMatchObject({ zustand: "FEHLT" });
    const gesperrt = mockPrisma.offboardingDepartmentLink.updateMany.mock.calls.map((c) => c[0].where?.departmentKey);
    expect(gesperrt).not.toContain("FACILITY");
  });

  it("FACILITY-Link in der Sperrliste – vor der Ausgabe (G24), auch wenn eine andere Stelle den Schlüssel ausgab; FEHLT setzen und verlassen", async () => {
    // Das Sekretariat gab den Schluessel aus – ueber die Schliessung entscheidet trotzdem die Gebaeudewirtschaft (E-A33).
    stand.austritte = [austritt()];
    stand.aufgaben = [];
    stand.rueckgaben = [];
    stand.ausgaben = [SCHLUESSEL({ departmentKey: "VERWALTUNG" })];
    expect((await zuordnen()).status).toBe(200);
    jest.clearAllMocks();

    await imPortal(aufgabeZu("ag-schl").id as string, { zustand: "FEHLT" });
    // `.mock` jedes Mal frisch lesen – clearAllMocks ersetzt das Objekt.
    const linkAufrufe = () => mockPrisma.offboardingDepartmentLink.updateMany.mock;
    const gesperrt = () => linkAufrufe().calls.map((c) => c[0].where?.departmentKey);
    expect(gesperrt().slice(0, 2)).toEqual(["FACILITY", "VERWALTUNG"]);
    expect(linkAufrufe().invocationCallOrder[0]).toBeLessThan(reihenfolge(mockPrisma.ausgabe.updateMany));
    expect(aufgabeZu("ag-schl", "AUSGABE_FEHLT")).toMatchObject({ assigneeDepartment: "FACILITY", isCompleted: false });
    expect(aufgabeZu("ag-schl")).toMatchObject({ assigneeDepartment: "VERWALTUNG", isCompleted: true });

    // Verlassen: wieder oeffnen sperrt FACILITY ebenfalls (die offene Folgeaufgabe wird geloescht).
    jest.clearAllMocks();
    await imPortal(aufgabeZu("ag-schl").id as string, { isCompleted: false });
    expect(gesperrt()).toContain("FACILITY");
    expect(folgen()).toEqual([]);

    // Ohne Wechsel von bzw. zu FEHLT (ZURUECK) bleibt die Gebaeudewirtschaft ungesperrt.
    jest.clearAllMocks();
    await imPortal(aufgabeZu("ag-schl").id as string, { isCompleted: true });
    expect(gesperrt()).toContain("VERWALTUNG");
    expect(gesperrt()).not.toContain("FACILITY");
  });

  it("Sperrreihenfolge im Reiter (G24): Austritt → Links → Ausgabe → Aufgabe → Ausgabe → Rückgabe → Folgeaufgabe", async () => {
    await imReiter(rueckgabeZu("ag-schl").id as string, { zustand: "FEHLT" });
    const austrittSperre = reihenfolge(mockPrisma.offboardingProcess.updateMany);
    const linkSperre = reihenfolge(mockPrisma.offboardingDepartmentLink.updateMany);
    const [ausgabeSperre, ausgabeWechsel] = mockPrisma.ausgabe.updateMany.mock.invocationCallOrder;
    const aufgabe = reihenfolge(mockPrisma.offboardingChecklistItem.updateMany);
    const rueckgabe = reihenfolge(mockPrisma.returnItem.updateMany);
    const folge = reihenfolge(mockPrisma.offboardingChecklistItem.create);
    expect(austrittSperre).toBeLessThan(linkSperre);
    expect(linkSperre).toBeLessThan(ausgabeSperre);
    expect(ausgabeSperre).toBeLessThan(aufgabe);
    expect(aufgabe).toBeLessThan(ausgabeWechsel);
    expect(ausgabeWechsel).toBeLessThan(rueckgabe);
    expect(rueckgabe).toBeLessThan(folge);
    // Der Austritt bedingt auf „nicht CANCELLED“; die Aufgabe im Reiter mit HR als Urheber, ohne Mail.
    expect(mockPrisma.offboardingProcess.updateMany).toHaveBeenCalledWith({
      where: { id: A_ID, status: { not: "CANCELLED" } },
      data: { updatedAt: JETZT },
    });
    expect(aufgabeZu("ag-schl")).toMatchObject({ isCompleted: true, completedById: HR.userId });
    expect(mockTriggerWebhooks).not.toHaveBeenCalled();
  });

  it("ein gleichzeitiger zweiter Weg findet den Stand nach der Sperre – ein zweites „erledigt“ überschreibt „beschädigt“ nicht", async () => {
    const ipad = aufgabeZu("ag-ipad");
    const echt = mockPrisma.offboardingProcess.updateMany.getMockImplementation()!;
    // Waehrend der Portal-PATCH auf die Sperre des Austritts wartet, committet der Link der IT „beschädigt“.
    mockPrisma.offboardingProcess.updateMany.mockImplementationOnce(async (args: { where?: Zeile; data: Zeile }) => {
      Object.assign(ipad, { isCompleted: true, completedAt: JETZT });
      Object.assign(ausgabeMit("ag-ipad"), { zustand: "BESCHAEDIGT" });
      Object.assign(rueckgabeZu("ag-ipad"), { zustand: "BESCHAEDIGT", isReturned: true });
      return echt(args);
    });
    const r = await imPortal(ipad.id as string, { isCompleted: true });
    expect(r.status).toBe(200);
    expect(standVon("ag-ipad")).toMatchObject({
      ausgabe: { zustand: "BESCHAEDIGT" },
      rueckgabe: { zustand: "BESCHAEDIGT", isReturned: true },
    });
    expect(auditsVon(AUSGABEN_AUDIT.AUSGABE_ZUSTAND_GEAENDERT)).toEqual([]);
  });

  it("`zustand` an einer Aufgabe ohne Gegenstand → 400: Sperraufgabe über den Link, Folgeaufgabe, „fehlt“ an einem Zugang im Portal", async () => {
    let r = await perLink("tok-it", aufgabeZu("ag-zugang").id as string, { isCompleted: true, zustand: "ZURUECK" });
    expect(r).toEqual({ status: 400, body: { error: MELDUNGEN_AUSGABEN.ZUSTAND_NICHT_MOEGLICH } });
    r = await imPortal(aufgabeZu("ag-zugang").id as string, { zustand: "FEHLT" });
    expect(r).toEqual({ status: 400, body: { error: MELDUNGEN_AUSGABEN.ZUGANG_NUR_GESPERRT } });
    // „verbleibt“ an einem Zugang setzt HR (die Person behaelt ihr Konto).
    r = await imPortal(aufgabeZu("ag-zugang").id as string, { zustand: "VERBLEIBT" });
    expect(r.status).toBe(200);
    expect(ausgabeMit("ag-zugang")).toMatchObject({ zustand: "VERBLEIBT", loeschenAb: null });

    await imPortal(aufgabeZu("ag-schl").id as string, { zustand: "FEHLT" });
    r = await imPortal(aufgabeZu("ag-schl", "AUSGABE_FEHLT").id as string, { zustand: "ZURUECK" });
    expect(r).toEqual({ status: 400, body: { error: MELDUNGEN_AUSGABEN.ZUSTAND_NICHT_MOEGLICH } });
  });

  it("Kennung im Reiter zieht die Ausgabe mit; an einem nicht mehr ausgegebenen Stück 409 – im Protokoll nie die Kennung", async () => {
    let r = await imReiter(rueckgabeZu("ag-ipad").id as string, { serialNumber: "FES-IPAD-0413" });
    expect(r.status).toBe(200);
    expect(rueckgabeZu("ag-ipad").serialNumber).toBe("FES-IPAD-0413");
    expect(ausgabeMit("ag-ipad").kennung).toBe("FES-IPAD-0413");
    expect(JSON.stringify(stand.audits)).not.toContain("FES-IPAD-041");
    expect(auditsVon("RETURN_ITEM_UPDATED")[0].details).toEqual({
      returnItemId: rueckgabeZu("ag-ipad").id,
      category: "IT_HARDWARE",
      geaenderteFelder: ["serialNumber"],
    });

    await imReiter(rueckgabeZu("ag-ipad").id as string, { zustand: "ZURUECK" });
    r = await imReiter(rueckgabeZu("ag-ipad").id as string, { serialNumber: "FES-IPAD-9999" });
    expect(r).toEqual({ status: 409, body: { error: MELDUNGEN_AUSGABEN.NICHT_AUSGEGEBEN, grund: "NICHT_AUSGEGEBEN" } });
    expect(ausgabeMit("ag-ipad").kennung).toBe("FES-IPAD-0413");
    expect(rueckgabeZu("ag-ipad").serialNumber).toBe("FES-IPAD-0413");
  });

  it("Reiter: zwei Zustandswechsel auf demselben gelesenen Stand – der zweite ist 409, nichts geschrieben", async () => {
    const zeile = rueckgabeZu("ag-ipad");
    const echt = mockPrisma.returnItem.findFirst.getMockImplementation()!;
    mockPrisma.returnItem.findFirst.mockImplementationOnce(async (args?: { where?: Zeile; select?: Zeile }) => {
      const gelesen = await echt(args);
      // Ein anderer Weg committet „fehlt“, nachdem dieser Aufruf gelesen hat.
      Object.assign(zeile, { zustand: "FEHLT" });
      return gelesen;
    });
    const r = await imReiter(zeile.id as string, { zustand: "ZURUECK" });
    expect(r).toEqual({ status: 409, body: { error: MELDUNGEN_AUSGABEN.RUECKGABE_INZWISCHEN_GEAENDERT } });
    expect(ausgabeMit("ag-ipad").zustand).toBe("AUSGEGEBEN");
    expect(aufgabeZu("ag-ipad").isCompleted).toBe(false);
  });

  describe("Bindung (G28)", () => {
    /** A ist abgeschlossen und hat das iPad mit „verbleibt“ freigegeben. */
    function abgeschlossenMitVerbleibt() {
      stand.austritte = [austritt({ status: "COMPLETED", onboardingId: E_ID, completedAt: new Date("2027-07-15T08:00:00.000Z") })];
      stand.aufgaben = [];
      stand.rueckgaben = [];
      stand.ausgaben = [IPAD({ zustand: "VERBLEIBT" })];
      beziehtAusgabe(A_ID, "ag-ipad", { rueckgabe: { zustand: "VERBLEIBT" }, aufgabe: { isCompleted: true } });
    }

    it("ein anderer laufender Austritt hat das Stück übernommen: A bekommt 409 AUSGABE_IM_AUSTRITT (Nummer mit Zugriff) – im Reiter und im Portal", async () => {
      abgeschlossenMitVerbleibt();
      stand.austritte.push(austritt({ id: B_ID, displayId: "OFF-2027-GYM-020", onboardingId: E_ID }));
      beziehtAusgabe(B_ID, "ag-ipad");
      const vorher = structuredClone({ a: stand.ausgaben, r: stand.rueckgaben, t: stand.aufgaben });

      let r = await imReiter(rueckgabeZu("ag-ipad").id as string, { zustand: "ZURUECK" });
      expect(r).toEqual({
        status: 409,
        body: { error: MELDUNGEN_AUSGABEN.AUSGABE_IM_AUSTRITT("OFF-2027-GYM-020"), grund: "AUSGABE_IM_AUSTRITT" },
      });
      r = await imPortal(aufgabeZu("ag-ipad").id as string, { zustand: "ZURUECK" });
      expect(r.status).toBe(409);
      expect(r.body.grund).toBe("AUSGABE_IM_AUSTRITT");
      expect({ a: stand.ausgaben, r: stand.rueckgaben, t: stand.aufgaben }).toEqual(vorher);

      // Der laufende Austritt B darf (VERBLEIBT heisst dort „offen“).
      r = await imReiter(rueckgabeZu("ag-ipad", B_ID).id as string, { zustand: "ZURUECK" }, JETZT, B_ID);
      expect(r.status).toBe(200);
      expect(ausgabeMit("ag-ipad").zustand).toBe("ZURUECK");
    });

    it.each(WEGE)(
      "%s: B übernimmt nach A (verbleibt) – auch nach dem ersten Wechsel in B gehen Wiederöffnen und ein anderer Zustand (Review A4c)",
      async (weg) => {
        abgeschlossenMitVerbleibt();
        stand.austritte.push(
          austritt({
            id: B_ID,
            displayId: "OFF-2027-GYM-020",
            onboardingId: E_ID,
            organization: { name: "FES Gymnasium", mandantNumber: "737" },
          }),
        );
        beziehtAusgabe(B_ID, "ag-ipad");
        stand.links = [link({ offboardingId: B_ID, departmentKey: "IT", token: "tok-b-it" })];
        const aufgabeB = aufgabeZu("ag-ipad", "AUSGABE", B_ID).id as string;
        const inB = (zustand: string | null) => {
          if (weg === "Link") return perLink("tok-b-it", aufgabeB, zustand ? { isCompleted: true, zustand } : { isCompleted: false });
          if (weg === "Portal") {
            return aufgabeImPortalAendern({
              offboardingId: B_ID,
              itemId: aufgabeB,
              rohBody: zustand ? { zustand } : { isCompleted: false },
              session: HR,
              jetzt: JETZT,
            });
          }
          return imReiter(rueckgabeZu("ag-ipad", B_ID).id as string, { zustand }, JETZT, B_ID);
        };

        // Fehlklick der Stelle: „Zurückerhalten“ statt „Fehlt“ …
        expect((await inB("ZURUECK")).status).toBe(200);
        expect(ausgabeMit("ag-ipad").zustand).toBe("ZURUECK");
        // … lässt sich korrigieren: wieder öffnen und „fehlt“ – kein 409 mit der Nummer von A.
        let r = await inB(null);
        expect({ status: r.status, body: r.status === 200 ? null : r.body }).toEqual({ status: 200, body: null });
        expect(ausgabeMit("ag-ipad").zustand).toBe("AUSGEGEBEN");
        r = await inB("FEHLT");
        expect(r.status).toBe(200);
        expect(ausgabeMit("ag-ipad").zustand).toBe("FEHLT");
        // Ein direkter Wechsel an der erledigten Aufgabe geht ebenso.
        r = await inB("BESCHAEDIGT");
        expect(r.status).toBe(200);
        expect(ausgabeMit("ag-ipad").zustand).toBe("BESCHAEDIGT");
        // A bindet das Stück nicht wieder: Sein Reiter bekommt weiter 409 – B führt es.
        r = await imReiter(rueckgabeZu("ag-ipad").id as string, { zustand: "ZURUECK" });
        expect(r.body.grund).toBe("AUSGABE_IM_AUSTRITT");
        expect(rueckgabeZu("ag-ipad")).toMatchObject({ zustand: "VERBLEIBT" });
      },
    );

    it("Zugang (ohne Rückgabe-Zeile): B übernimmt nach A – der jüngste Bezug gilt, auch nach dem ersten Wechsel in B (Review A4c)", async () => {
      stand.austritte = [
        austritt({ status: "COMPLETED", onboardingId: E_ID, completedAt: new Date("2027-07-15T08:00:00.000Z") }),
        austritt({ id: B_ID, displayId: "OFF-2027-GYM-020", onboardingId: E_ID }),
      ];
      stand.aufgaben = [];
      stand.rueckgaben = [];
      stand.ausgaben = [ZUGANG({ zustand: "VERBLEIBT" })];
      const sperraufgabe = (offboardingId: string, teil: Zeile) =>
        neueOffboardingAufgabe({
          offboardingId,
          title: "Zugänge (Portal, E-Mail) sperren",
          category: AUSSTATTUNG_KATEGORIE,
          assigneeDepartment: "IT",
          herkunft: "AUSGABE",
          ausgabeId: "ag-zugang",
          ...teil,
        });
      // A sperrte nicht („verbleibt“), B übernahm das Stück danach.
      stand.aufgaben.push(sperraufgabe(A_ID, { isCompleted: true, createdAt: new Date("2027-06-01T08:00:00.000Z") }));
      stand.aufgaben.push(sperraufgabe(B_ID, { createdAt: new Date("2027-07-16T08:00:00.000Z") }));
      const aufgabeB = aufgabeZu("ag-zugang", "AUSGABE", B_ID).id as string;
      const inB = (body: unknown) =>
        aufgabeImPortalAendern({ offboardingId: B_ID, itemId: aufgabeB, rohBody: body, session: HR, jetzt: JETZT });

      expect((await inB({ isCompleted: true })).status).toBe(200);
      expect(ausgabeMit("ag-zugang").zustand).toBe("ZURUECK");
      expect((await inB({ isCompleted: false })).status).toBe(200);
      expect(ausgabeMit("ag-zugang").zustand).toBe("AUSGEGEBEN");
      expect((await inB({ zustand: "ENTFAELLT" })).status).toBe(200);
      expect(ausgabeMit("ag-zugang").zustand).toBe("ENTFAELLT");
    });

    it("mit „verbleibt“ freigegeben und von keinem anderen gebunden: Zustand 409 AUSGABE_FREIGEGEBEN, die Kennung bleibt korrigierbar", async () => {
      abgeschlossenMitVerbleibt();
      let r = await imReiter(rueckgabeZu("ag-ipad").id as string, { zustand: "ZURUECK" });
      expect(r).toEqual({ status: 409, body: { error: MELDUNGEN_AUSGABEN.AUSGABE_FREIGEGEBEN, grund: "AUSGABE_FREIGEGEBEN" } });
      expect(ausgabeMit("ag-ipad").zustand).toBe("VERBLEIBT");

      // `ausgabenZeile` bietet `korrigieren` im eigenen abgeschlossenen Austritt auch an einem VERBLEIBT-Stueck an.
      r = await imReiter(rueckgabeZu("ag-ipad").id as string, { serialNumber: "FES-IPAD-0499" });
      expect(r.status).toBe(200);
      expect(ausgabeMit("ag-ipad")).toMatchObject({ zustand: "VERBLEIBT", kennung: "FES-IPAD-0499" });
      expect(rueckgabeZu("ag-ipad")).toMatchObject({ zustand: "VERBLEIBT", serialNumber: "FES-IPAD-0499" });
    });

    it("späte Rückgabe im Reiter eines abgeschlossenen Austritts (offen gebliebenes AUSGEGEBEN): geht, sechs Monate Frist; wieder offen = Frist des Abschlusses", async () => {
      stand.austritte = [austritt({ status: "COMPLETED", onboardingId: E_ID, completedAt: new Date("2027-07-15T08:00:00.000Z") })];
      stand.aufgaben = [];
      stand.rueckgaben = [];
      stand.ausgaben = [IPAD({ loeschenAb: new Date(DREI_JAHRE) })];
      beziehtAusgabe(A_ID, "ag-ipad");

      let r = await imReiter(rueckgabeZu("ag-ipad").id as string, { zustand: "ZURUECK" });
      expect(r.status).toBe(200);
      expect(standVon("ag-ipad")).toMatchObject({
        ausgabe: { zustand: "ZURUECK", loeschenAb: SECHS_MONATE },
        aufgabe: { isCompleted: true },
        rueckgabe: { zustand: "ZURUECK", isReturned: true },
      });

      r = await imReiter(rueckgabeZu("ag-ipad").id as string, { zustand: null });
      expect(r.status).toBe(200);
      expect(standVon("ag-ipad").ausgabe).toEqual({ zustand: "AUSGEGEBEN", loeschenAb: DREI_JAHRE });
    });

    it("abgebrochener Austritt: Reiter 409; ein ERSETZT-Stück ist endgültig (409 NICHT_AUSGEGEBEN)", async () => {
      stand.austritte = [austritt({ onboardingId: E_ID, status: "CANCELLED" })];
      let r = await imReiter(rueckgabeZu("ag-ipad").id as string, { zustand: "ZURUECK" });
      expect(r).toEqual({ status: 409, body: { error: MELDUNGEN_AUSGABEN.RUECKGABEN_ABGEBROCHEN } });

      stand.austritte = [austritt({ onboardingId: E_ID })];
      Object.assign(ausgabeMit("ag-ipad"), { zustand: "ERSETZT" });
      r = await imReiter(rueckgabeZu("ag-ipad").id as string, { zustand: "ZURUECK" });
      expect(r).toEqual({ status: 409, body: { error: MELDUNGEN_AUSGABEN.NICHT_AUSGEGEBEN, grund: "NICHT_AUSGEGEBEN" } });
      expect(rueckgabeZu("ag-ipad")).toMatchObject({ zustand: null, isReturned: false });
    });
  });
});
