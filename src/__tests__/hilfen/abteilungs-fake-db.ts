/**
 * Test-Hilfe: kleine In-Memory-Datenbank fuer die Abteilungsaufgaben (Paket 1b,
 * erweitert um das Onboarding in Paket 5)
 *
 * Versteht genau die Abfrageformen von src/lib/abteilungsaufgaben-dienst.ts,
 * src/lib/abteilungsaufgaben-uebergaenge.ts und
 * src/lib/abteilungsaufgaben-onboarding.ts: where mit Gleichheit,
 * not/in/notIn, zusammengesetzte Schluessel offboardingId_departmentKey und
 * onboardingId_departmentKey, bedingtes updateMany, increment,
 * select-Projektion (flach), include offboarding/onboarding am Link, include
 * der Relationen am Vorgang (GET/PATCH /api/offboarding/[id]),
 * offboardingProcess.update/updateMany, $transaction (ruft die Funktion mit
 * demselben Objekt auf).
 *
 * Onboarding (Paket 5): Tabellen `onboardingVorgaenge` (Zeilen tragen
 * personalData, supervisorData und organization direkt) und
 * `onboardingAufgaben` (ChecklistItem, Zustaendigkeit in `assignee`). Die
 * Links beider Module liegen in `links` (offboardingId ODER onboardingId).
 *
 * Ausstattung & Zugaenge (Paket A2/A3, seit S10): `ausstattungZeilen`
 * (OnboardingAusstattung), `ausstattungAufgaben` (OnboardingAusstattungAufgabe,
 * Schluessel `ausstattungId_option`), `stellenHinweise`
 * (OnboardingStellenHinweis, Schluessel `onboardingId_departmentKey`),
 * `ausstattungAenderungen` (OnboardingAusstattungAenderung), dazu der Katalog
 * (`ausstattungsPositionen`, `ausstattungsAusblendungen`, nur lesend) und
 * `checklistItem.create/delete/deleteMany`. Leer als Vorgabe — bestehende
 * Faelle bleiben unveraendert. Eindeutigkeit wie im Schema (P2002) und die
 * Kaskaden (Aufgabe geloescht → Verknuepfung weg, Hinweis behaelt die Zeile
 * mit `checklistItemId: null`; Zeile geloescht → Verknuepfungen weg) bildet
 * der Fake nach. `smtpConfig` liefert `replyToEmail` aus `db.replyToEmail`.
 *
 * Ausstattung & Zugaenge, Stufe 2 (Paket A4, seit S24): `ausgaben` (Ausgabe,
 * eine Zeile je Stueck) mit `ersetztDurchId @unique` und SetNull beim Loeschen,
 * dazu `checklistItem.findFirst` und `ausstattungsPosition.findUnique`. Die
 * Austrittsbezuege (`returnItem`, Offboarding-Aufgaben mit `ausgabeId`) kennt
 * der Fake noch nicht – Tests, die sie brauchen, geben
 * `austrittsBezuegeLaden` einen eigenen Mock (S29 haengt `returnItem` an).
 * Seit S25 liest `offboardingProcess.findMany` auch Austritte per ID ohne
 * Statusfilter (`where: { id: { in } }`): Die Link-Seite fragt die Bindung
 * ueber `linkAusgabenLaden` selbst ab, dort greift kein Modul-Mock. Eine
 * Offboarding-Aufgabe mit `ausgabeId` und `herkunft` in `aufgaben` ergibt den
 * Bezug; `returnItem.findMany` haengt die Testdatei an (bis S29).
 *
 * Einbinden (Pfad relativ zur Testdatei):
 *
 *   import { db, fakePrisma, dbLeeren } from "../hilfen/abteilungs-fake-db";
 *   jest.mock("@/lib/db", () => ({
 *     prisma: jest.requireActual("../hilfen/abteilungs-fake-db").fakePrisma,
 *   }));
 *
 * Braucht ein Test weitere Methoden (z. B. departmentConfig.create), haengt er
 * sie IN SEINER DATEI an `fakePrisma` an. Das Sperrverhalten von Postgres
 * bildet der Fake nicht nach.
 *
 * Die Helfer passt/anwenden/projizieren/sortieren sind exportiert, damit die
 * Fake-Datenbank von Paket 4 (unterlagen-fake-db.ts) dieselben Regeln nutzt —
 * ihr Verhalten ist dadurch unveraendert.
 */

export type Zeile = Record<string, unknown>;

export const db: {
  vorgaenge: Zeile[];
  aufgaben: Zeile[];
  links: Zeile[];
  konfigs: Zeile[];
  webhooks: Zeile[];
  audits: Zeile[];
  users: Zeile[];
  domains: string;
  zuweisungen: Zeile[];
  /** Paket 5: OnboardingProcess-Zeilen. */
  onboardingVorgaenge: Zeile[];
  /** Paket 5: ChecklistItem-Zeilen (Onboarding). */
  onboardingAufgaben: Zeile[];
  /** Paket A2: OnboardingAusstattung-Zeilen. */
  ausstattungZeilen: Zeile[];
  /** Paket A3: OnboardingAusstattungAufgabe (Verknuepfung Zeile/Option → ChecklistItem). */
  ausstattungAufgaben: Zeile[];
  /** Paket A2: OnboardingStellenHinweis-Zeilen. */
  stellenHinweise: Zeile[];
  /** Paket A3: OnboardingAusstattungAenderung (Nachtragsliste). */
  ausstattungAenderungen: Zeile[];
  /** Paket A1: Katalog (AusstattungsPosition), nur lesend. */
  ausstattungsPositionen: Zeile[];
  /** Paket A1: AusstattungsAusblendung, nur lesend. */
  ausstattungsAusblendungen: Zeile[];
  /** Paket A4 (S24): Ausgabe-Zeilen (eine je Stueck). */
  ausgaben: Zeile[];
  /** SmtpConfig.replyToEmail (HR-Postfach). */
  replyToEmail: string | null;
} = {
  vorgaenge: [],
  aufgaben: [],
  links: [],
  konfigs: [],
  webhooks: [],
  audits: [],
  users: [],
  domains: "",
  zuweisungen: [],
  onboardingVorgaenge: [],
  onboardingAufgaben: [],
  ausstattungZeilen: [],
  ausstattungAufgaben: [],
  stellenHinweise: [],
  ausstattungAenderungen: [],
  ausstattungsPositionen: [],
  ausstattungsAusblendungen: [],
  ausgaben: [],
  replyToEmail: null,
};

let idZaehler = 0;

/** Fortlaufende Nummer fuer Test-IDs (Aufgaben, Links). */
export function naechsteId(): number {
  return ++idZaehler;
}

function gleich(a: unknown, b: unknown): boolean {
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  return a === b;
}

export function passt(zeile: Zeile, where: Record<string, unknown> | undefined): boolean {
  if (!where) return true;
  for (const [k, bed] of Object.entries(where)) {
    if (bed === undefined) continue;
    if (k === "offboardingId_departmentKey") {
      const b = bed as { offboardingId: string; departmentKey: string };
      if (zeile.offboardingId !== b.offboardingId || zeile.departmentKey !== b.departmentKey) return false;
      continue;
    }
    if (k === "onboardingId_departmentKey") {
      const b = bed as { onboardingId: string; departmentKey: string };
      if (zeile.onboardingId !== b.onboardingId || zeile.departmentKey !== b.departmentKey) return false;
      continue;
    }
    if (k === "ausstattungId_option") {
      const b = bed as { ausstattungId: string; option: string };
      if (zeile.ausstattungId !== b.ausstattungId || zeile.option !== b.option) return false;
      continue;
    }
    if (k === "userId_organizationId") return false;
    if (bed !== null && typeof bed === "object" && !(bed instanceof Date)) {
      const b = bed as Record<string, unknown>;
      if ("not" in b) {
        if (b.not === null ? zeile[k] == null : gleich(zeile[k], b.not)) return false;
        continue;
      }
      if ("in" in b) {
        if (!(b.in as unknown[]).includes(zeile[k])) return false;
        continue;
      }
      if ("notIn" in b) {
        if ((b.notIn as unknown[]).includes(zeile[k])) return false;
        continue;
      }
      if ("some" in b) continue; // nur Vorgaenge — unten gesondert
      throw new Error(`Fake versteht die Bedingung fuer ${k} nicht`);
    }
    if (!gleich(zeile[k], bed)) return false;
  }
  return true;
}

export function anwenden(zeile: Zeile, data: Record<string, unknown>) {
  for (const [k, v] of Object.entries(data)) {
    if (v !== null && typeof v === "object" && !(v instanceof Date) && "increment" in (v as object)) {
      zeile[k] = (zeile[k] as number) + (v as { increment: number }).increment;
    } else {
      zeile[k] = v;
    }
  }
  if (!("updatedAt" in data)) zeile.updatedAt = new Date();
}

export function projizieren(zeile: Zeile, select?: Record<string, unknown>): Zeile {
  if (!select) return structuredClone(zeile);
  const r: Zeile = {};
  for (const [k, v] of Object.entries(select)) {
    if (v === true) r[k] = structuredClone(zeile[k]);
    else if (v && typeof v === "object" && !("where" in (v as object))) r[k] = structuredClone(zeile[k]);
  }
  return r;
}

export function sortieren(zeilen: Zeile[], orderBy?: unknown): Zeile[] {
  if (!orderBy) return zeilen;
  const felder = (Array.isArray(orderBy) ? orderBy : [orderBy]).map((o) => Object.keys(o as object)[0]);
  return [...zeilen].sort((a, b) => {
    for (const f of felder) {
      const x = a[f] as string | number;
      const y = b[f] as string | number;
      if (x < y) return -1;
      if (x > y) return 1;
    }
    return 0;
  });
}

/** Link-Zeile mit den Standardwerten des Schemas (Paket-1b-Spalten inklusive). */
export function neuerLink(data: Zeile): Zeile {
  return {
    id: `l-${naechsteId()}`,
    // Genau eines von beiden setzt der Aufrufer (Paket 5: eine Tabelle, zwei Module).
    offboardingId: null,
    onboardingId: null,
    sentAt: null,
    lastSentAt: null,
    lastSendStatus: null,
    lastSendDetail: null,
    zugestelltAn: null,
    firstOpenedAt: null,
    lastOpenedAt: null,
    openCount: 0,
    lastReminderAt: null,
    reminderCount: 0,
    allTasksComplete: false,
    completedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...data,
  };
}

/**
 * `include` am Vorgang (GET/PATCH /api/offboarding/[id]): Relationen aus den
 * Tabellen dazusetzen. Was der Fake nicht als Tabelle fuehrt (Dokumente,
 * Notizen, Rueckgaben, Protokoll), kommt leer; exitData, organization,
 * zeugnisBewertung und contractEnd stehen direkt an der Vorgangszeile.
 */
function vorgangMitInclude(v: Zeile, include: Record<string, unknown>): Zeile {
  const r = structuredClone(v);
  for (const k of Object.keys(include)) {
    if (!include[k]) continue;
    if (k === "checklistItems") {
      r.checklistItems = sortieren(
        db.aufgaben.filter((a) => a.offboardingId === v.id),
        [{ orderIndex: "asc" }, { category: "asc" }],
      ).map((a) => structuredClone(a));
    } else if (k === "departmentLinks") {
      r.departmentLinks = db.links.filter((l) => l.offboardingId === v.id).map((l) => structuredClone(l));
    } else if (["returnItems", "documents", "notes", "auditLogs"].includes(k)) {
      r[k] = [];
    } else {
      r[k] = structuredClone(v[k] ?? null);
    }
  }
  return r;
}

/**
 * select am Onboarding-Vorgang: flache Felder und die direkt an der Zeile
 * stehenden Relationen (personalData, supervisorData, organization) wie
 * `projizieren`; `checklistItems` und `departmentLinks` aus ihren Tabellen.
 * Ohne select die ganze Zeile.
 */
function onboardingProjektion(v: Zeile, select?: Record<string, unknown>): Zeile {
  if (!select) return structuredClone(v);
  const r = projizieren(v, select);
  if (select.checklistItems) {
    const s = select.checklistItems as { select?: Zeile };
    r.checklistItems = sortieren(
      db.onboardingAufgaben.filter((a) => a.onboardingId === v.id),
      [{ orderIndex: "asc" }, { category: "asc" }],
    ).map((a) => projizieren(a, s.select));
  }
  if (select.departmentLinks) {
    r.departmentLinks = db.links.filter((l) => l.onboardingId === v.id).map((l) => structuredClone(l));
  }
  return r;
}

// =============================================
// Ausstattung & Zugaenge (seit S10): Tabellen samt Eindeutigkeit und Kaskaden
// =============================================

/** Wie Prisma bei einer verletzten Eindeutigkeit (P2002). */
function eindeutigkeitVerletzt(felder: string): Error {
  return Object.assign(new Error(`Unique constraint failed on the fields: (${felder})`), { code: "P2002" });
}

/** Wie Prisma, wenn die Zeile zu update/delete fehlt (P2025). */
function zeileFehlt(): Error {
  return Object.assign(new Error("Record not found."), { code: "P2025" });
}

/** Neue ChecklistItem-Zeile (Onboarding) mit den Standardwerten des Schemas. */
export function neueOnboardingAufgabe(data: Zeile): Zeile {
  return {
    id: `i-${naechsteId()}`,
    templateItemId: null,
    title: "",
    description: null,
    category: "",
    orderIndex: 0,
    assignee: null,
    relativeDueDays: null,
    isCompleted: false,
    completedAt: null,
    completedById: null,
    dueDate: null,
    notes: null,
    abteilungKommentar: null,
    abteilungKommentarAm: null,
    herkunft: null,
    eilt: false,
    entfaelltAm: null,
    ausgabenGeloeschtAm: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...data,
  };
}

/** Neue Ausgabe (A4) mit den Standardwerten des Schemas. */
export function neueAusgabe(data: Zeile): Zeile {
  return {
    id: `ag-${naechsteId()}`,
    employeeId: null,
    onboardingId: null,
    checklistItemId: null,
    zentral: false,
    kennungLabel: null,
    kennung: null,
    rueckgabeKategorie: null,
    erfasstVonId: null,
    zustand: "AUSGEGEBEN",
    zustandAm: new Date(),
    ersetztDurchId: null,
    loeschenAb: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...data,
  };
}

/** Neue OnboardingAusstattung-Zeile mit den Standardwerten des Schemas. */
export function neueAusstattungsZeile(data: Zeile): Zeile {
  return {
    id: `aus-${naechsteId()}`,
    positionId: null,
    angabeSchluessel: null,
    aufgabeTitel: "",
    hinweisStelle: null,
    relativeDueDays: null,
    sichtbarFuer: [],
    ausgabeKennung: null,
    rueckgabeKategorie: null,
    beiAustritt: null,
    reihenfolge: 0,
    auswahl: [],
    angabe: null,
    bemerkung: null,
    bemerkungQuelle: null,
    erfasstVonId: null,
    gestrichenAm: null,
    inhaltGeleertAm: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...data,
  };
}

/** Neuer OnboardingStellenHinweis mit den Standardwerten des Schemas. */
export function neuerStellenHinweis(data: Zeile): Zeile {
  return {
    checklistItemId: null,
    gesehenAm: null,
    inhaltGeleertAm: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...data,
  };
}

/** Neue OnboardingAusstattungAufgabe (Verknuepfung) mit den Standardwerten des Schemas. */
function neueAusstattungsAufgabe(data: Zeile): Zeile {
  return { option: "", createdAt: new Date(), ...data };
}

/** Neue OnboardingAusstattungAenderung mit den Standardwerten des Schemas. */
function neueAusstattungsAenderung(data: Zeile): Zeile {
  return { id: `aen-${naechsteId()}`, erfasstAm: new Date(), gesendetAm: null, ...data };
}

/**
 * Eine Tabelle mit den Methoden, die die Ausstattung braucht:
 * findMany/findUnique/findFirst/count/create/createMany/update/updateMany/
 * delete/deleteMany. `pruefen` wirft P2002, `nachLoeschen` bildet Kaskaden
 * nach. Die Zeilen liest sie bei jedem Aufruf frisch aus `db` (dbLeeren
 * ersetzt die Arrays).
 */
function tabelle(opts: {
  zeilen: () => Zeile[];
  ersetzen: (zeilen: Zeile[]) => void;
  neu: (data: Zeile) => Zeile;
  pruefen?: (kandidat: Zeile, ohne?: Zeile) => void;
  nachLoeschen?: (geloescht: Zeile[]) => void;
}) {
  const finden = (where: Zeile) => opts.zeilen().find((x) => passt(x, where));
  const loeschen = (treffer: Zeile[]) => {
    opts.ersetzen(opts.zeilen().filter((x) => !treffer.includes(x)));
    opts.nachLoeschen?.(treffer);
  };
  return {
    findMany: jest.fn(async (args: { where?: Zeile; select?: Zeile; orderBy?: unknown } = {}) =>
      sortieren(opts.zeilen().filter((x) => passt(x, args.where)), args.orderBy).map((x) => projizieren(x, args.select)),
    ),
    findUnique: jest.fn(async ({ where, select }: { where: Zeile; select?: Zeile }) => {
      const x = finden(where);
      return x ? projizieren(x, select) : null;
    }),
    findFirst: jest.fn(async ({ where, select }: { where?: Zeile; select?: Zeile } = {}) => {
      const x = opts.zeilen().find((z) => passt(z, where));
      return x ? projizieren(x, select) : null;
    }),
    count: jest.fn(async ({ where }: { where?: Zeile } = {}) => opts.zeilen().filter((x) => passt(x, where)).length),
    create: jest.fn(async ({ data, select }: { data: Zeile; select?: Zeile }) => {
      const x = opts.neu(data);
      opts.pruefen?.(x);
      opts.zeilen().push(x);
      return projizieren(x, select);
    }),
    createMany: jest.fn(async ({ data }: { data: Zeile[] | Zeile }) => {
      const liste = Array.isArray(data) ? data : [data];
      for (const d of liste) {
        const x = opts.neu(d);
        opts.pruefen?.(x);
        opts.zeilen().push(x);
      }
      return { count: liste.length };
    }),
    update: jest.fn(async ({ where, data, select }: { where: Zeile; data: Zeile; select?: Zeile }) => {
      const x = finden(where);
      if (!x) throw zeileFehlt();
      const kandidat = { ...x };
      anwenden(kandidat, data);
      opts.pruefen?.(kandidat, x);
      anwenden(x, data);
      return projizieren(x, select);
    }),
    updateMany: jest.fn(async ({ where, data }: { where?: Zeile; data: Zeile }) => {
      const treffer = opts.zeilen().filter((x) => passt(x, where));
      treffer.forEach((x) => anwenden(x, data));
      return { count: treffer.length };
    }),
    delete: jest.fn(async ({ where }: { where: Zeile }) => {
      const x = finden(where);
      if (!x) throw zeileFehlt();
      loeschen([x]);
      return structuredClone(x);
    }),
    deleteMany: jest.fn(async ({ where }: { where?: Zeile } = {}) => {
      const treffer = opts.zeilen().filter((x) => passt(x, where));
      loeschen(treffer);
      return { count: treffer.length };
    }),
  };
}

/** Kaskaden beim Loeschen von ChecklistItems: Verknuepfung weg, Hinweis behaelt die Zeile (SetNull). */
function aufgabenGeloescht(geloescht: Zeile[]): void {
  const ids = new Set(geloescht.map((a) => a.id));
  db.ausstattungAufgaben = db.ausstattungAufgaben.filter((v) => !ids.has(v.checklistItemId));
  for (const h of db.stellenHinweise) if (ids.has(h.checklistItemId)) h.checklistItemId = null;
}

const ausstattungsTabellen = {
  onboardingAusstattung: tabelle({
    zeilen: () => db.ausstattungZeilen,
    ersetzen: (z) => (db.ausstattungZeilen = z),
    neu: neueAusstattungsZeile,
    // @@unique([onboardingId, positionId]) — NULL kollidiert nicht (Postgres)
    pruefen: (x, ohne) => {
      if (x.positionId == null) return;
      const doppelt = db.ausstattungZeilen.some(
        (z) => z !== ohne && z.onboardingId === x.onboardingId && z.positionId === x.positionId,
      );
      if (doppelt) throw eindeutigkeitVerletzt("onboardingId,positionId");
    },
    nachLoeschen: (geloescht) => {
      const ids = new Set(geloescht.map((z) => z.id));
      db.ausstattungAufgaben = db.ausstattungAufgaben.filter((v) => !ids.has(v.ausstattungId));
    },
  }),
  onboardingAusstattungAufgabe: tabelle({
    zeilen: () => db.ausstattungAufgaben,
    ersetzen: (z) => (db.ausstattungAufgaben = z),
    neu: neueAusstattungsAufgabe,
    // @@id([ausstattungId, option]) und checklistItemId @unique
    pruefen: (x, ohne) => {
      for (const v of db.ausstattungAufgaben) {
        if (v === ohne) continue;
        if (v.ausstattungId === x.ausstattungId && v.option === x.option) {
          throw eindeutigkeitVerletzt("ausstattungId,option");
        }
        if (v.checklistItemId === x.checklistItemId) throw eindeutigkeitVerletzt("checklistItemId");
      }
    },
  }),
  onboardingStellenHinweis: tabelle({
    zeilen: () => db.stellenHinweise,
    ersetzen: (z) => (db.stellenHinweise = z),
    neu: neuerStellenHinweis,
    // @@id([onboardingId, departmentKey]) und checklistItemId @unique
    pruefen: (x, ohne) => {
      for (const h of db.stellenHinweise) {
        if (h === ohne) continue;
        if (h.onboardingId === x.onboardingId && h.departmentKey === x.departmentKey) {
          throw eindeutigkeitVerletzt("onboardingId,departmentKey");
        }
        if (x.checklistItemId != null && h.checklistItemId === x.checklistItemId) {
          throw eindeutigkeitVerletzt("checklistItemId");
        }
      }
    },
  }),
  onboardingAusstattungAenderung: tabelle({
    zeilen: () => db.ausstattungAenderungen,
    ersetzen: (z) => (db.ausstattungAenderungen = z),
    neu: neueAusstattungsAenderung,
  }),
  ausstattungsPosition: {
    findMany: jest.fn(async ({ where, select }: { where?: Zeile; select?: Zeile } = {}) =>
      db.ausstattungsPositionen.filter((x) => passt(x, where)).map((x) => projizieren(x, select)),
    ),
    // Seit S24 (A4): Ist die Position zentral? (`vermerkZielLadenIn`)
    findUnique: jest.fn(async ({ where, select }: { where: Zeile; select?: Zeile }) => {
      const x = db.ausstattungsPositionen.find((p) => passt(p, where));
      return x ? projizieren(x, select) : null;
    }),
  },
  // Seit S24 (A4): Ausgaben. ersetztDurchId @unique; beim Loeschen zeigt eine
  // Vorgaengerin nicht mehr ins Leere (SetNull, Relation „AusgabeTausch“).
  ausgabe: tabelle({
    zeilen: () => db.ausgaben,
    ersetzen: (z) => (db.ausgaben = z),
    neu: neueAusgabe,
    pruefen: (x, ohne) => {
      if (x.ersetztDurchId == null) return;
      if (db.ausgaben.some((a) => a !== ohne && a.ersetztDurchId === x.ersetztDurchId)) {
        throw eindeutigkeitVerletzt("ersetztDurchId");
      }
    },
    nachLoeschen: (geloescht) => {
      const ids = new Set(geloescht.map((a) => a.id));
      for (const a of db.ausgaben) if (ids.has(a.ersetztDurchId)) a.ersetztDurchId = null;
    },
  }),
  ausstattungsAusblendung: {
    findMany: jest.fn(async ({ where, select }: { where?: Zeile; select?: Zeile } = {}) =>
      db.ausstattungsAusblendungen.filter((x) => passt(x, where)).map((x) => projizieren(x, select)),
    ),
  },
};

export const fakePrisma: Record<string, unknown> = {
  offboardingProcess: {
    findUnique: jest.fn(
      async ({ where, select, include }: { where: Zeile; select?: Zeile; include?: Record<string, unknown> }) => {
        const v = db.vorgaenge.find((x) => passt(x, where));
        if (!v) return null;
        return include ? vorgangMitInclude(v, include) : projizieren(v, select);
      },
    ),
    findMany: jest.fn(async ({ where, select }: { where: Record<string, Zeile>; select: Record<string, Zeile> }) => {
      // Seit S25 (A4): Austritte per ID ohne Statusfilter (`austrittsBezuegeLaden`
      // auf der Link-Seite) – einfache Bedingungen, flache Projektion.
      if (!where.status) return db.vorgaenge.filter((v) => passt(v, where)).map((v) => projizieren(v, select));
      const status = where.status as { notIn: string[] };
      const links = select.departmentLinks as { where: Zeile } | undefined;
      const aufgaben = select.checklistItems as { where: Zeile } | undefined;
      return db.vorgaenge
        .filter((v) => !status.notIn.includes(v.status as string))
        .filter((v) => db.links.some((l) => l.offboardingId === v.id && l.sentAt != null && !l.allTasksComplete))
        .map((v) => ({
          ...projizieren(v, select),
          ...(links
            ? {
                departmentLinks: db.links
                  .filter((l) => l.offboardingId === v.id && passt(l, links.where))
                  .map((l) => structuredClone(l)),
              }
            : {}),
          ...(aufgaben
            ? {
                checklistItems: sortieren(
                  db.aufgaben.filter((a) => a.offboardingId === v.id && passt(a, aufgaben.where)),
                  [{ orderIndex: "asc" }, { category: "asc" }],
                ).map((a) => structuredClone(a)),
              }
            : {}),
        }));
    }),
    update: jest.fn(
      async ({ where, data, include }: { where: Zeile; data: Zeile; include?: Record<string, unknown> }) => {
        const v = db.vorgaenge.find((x) => passt(x, where));
        if (!v) throw new Error("Vorgang fehlt");
        anwenden(v, data);
        return include ? vorgangMitInclude(v, include) : structuredClone(v);
      },
    ),
    updateMany: jest.fn(async ({ where, data }: { where: Zeile; data: Zeile }) => {
      const treffer = db.vorgaenge.filter((v) => passt(v, where));
      treffer.forEach((v) => anwenden(v, data));
      return { count: treffer.length };
    }),
  },
  offboardingChecklistItem: {
    findMany: jest.fn(async ({ where, select, orderBy }: { where: Zeile; select?: Zeile; orderBy?: unknown }) =>
      sortieren(db.aufgaben.filter((a) => passt(a, where)), orderBy).map((a) => projizieren(a, select)),
    ),
    findUnique: jest.fn(async ({ where, select }: { where: Zeile; select?: Zeile }) => {
      const a = db.aufgaben.find((x) => passt(x, where));
      return a ? projizieren(a, select) : null;
    }),
    count: jest.fn(async ({ where }: { where: Zeile }) => db.aufgaben.filter((a) => passt(a, where)).length),
    update: jest.fn(async ({ where, data }: { where: Zeile; data: Zeile }) => {
      const a = db.aufgaben.find((x) => passt(x, where));
      if (!a) throw new Error("Aufgabe fehlt");
      anwenden(a, data);
      return structuredClone(a);
    }),
    updateMany: jest.fn(async ({ where, data }: { where: Zeile; data: Zeile }) => {
      const treffer = db.aufgaben.filter((a) => passt(a, where));
      treffer.forEach((a) => anwenden(a, data));
      return { count: treffer.length };
    }),
  },
  offboardingDepartmentLink: {
    findMany: jest.fn(async ({ where, select }: { where: Zeile; select?: Zeile }) =>
      db.links.filter((l) => passt(l, where)).map((l) => projizieren(l, select)),
    ),
    findUnique: jest.fn(
      async ({
        where,
        select,
        include,
      }: {
        where: Zeile;
        select?: Zeile;
        include?: { offboarding?: unknown; onboarding?: unknown };
      }) => {
        const l = db.links.find((x) => passt(x, where));
        if (!l) return null;
        const r = projizieren(l, select);
        if (include?.offboarding) {
          r.offboarding = structuredClone(db.vorgaenge.find((v) => v.id === l.offboardingId)) ?? null;
        }
        if (include?.onboarding) {
          r.onboarding = structuredClone(db.onboardingVorgaenge.find((v) => v.id === l.onboardingId)) ?? null;
        }
        return r;
      },
    ),
    upsert: jest.fn(async ({ where, create }: { where: Zeile; create: Zeile }) => {
      const vorhanden = db.links.find((x) => passt(x, where));
      if (vorhanden) return structuredClone(vorhanden);
      const l = neuerLink(create);
      db.links.push(l);
      return structuredClone(l);
    }),
    update: jest.fn(async ({ where, data }: { where: Zeile; data: Zeile }) => {
      const l = db.links.find((x) => passt(x, where));
      if (!l) throw new Error("Link fehlt");
      anwenden(l, data);
      return structuredClone(l);
    }),
    updateMany: jest.fn(async ({ where, data }: { where: Zeile; data: Zeile }) => {
      const treffer = db.links.filter((l) => passt(l, where));
      treffer.forEach((l) => anwenden(l, data));
      return { count: treffer.length };
    }),
  },
  // ---- Paket 5: Onboarding ----
  onboardingProcess: {
    findUnique: jest.fn(async ({ where, select }: { where: Zeile; select?: Record<string, unknown> }) => {
      const v = db.onboardingVorgaenge.find((x) => passt(x, where));
      return v ? onboardingProjektion(v, select) : null;
    }),
    findMany: jest.fn(async ({ where, select }: { where: Record<string, Zeile>; select?: Record<string, unknown> }) => {
      const status = where.status as { notIn: string[] } | undefined;
      const some = (where.departmentLinks as { some?: Zeile } | undefined)?.some;
      return db.onboardingVorgaenge
        .filter((v) => !status || !status.notIn.includes(v.status as string))
        .filter((v) => !some || db.links.some((l) => l.onboardingId === v.id && passt(l, some)))
        .map((v) => onboardingProjektion(v, select));
    }),
    update: jest.fn(async ({ where, data }: { where: Zeile; data: Zeile }) => {
      const v = db.onboardingVorgaenge.find((x) => passt(x, where));
      if (!v) throw new Error("Onboarding-Vorgang fehlt");
      anwenden(v, data);
      return structuredClone(v);
    }),
    updateMany: jest.fn(async ({ where, data }: { where: Zeile; data: Zeile }) => {
      const treffer = db.onboardingVorgaenge.filter((v) => passt(v, where));
      treffer.forEach((v) => anwenden(v, data));
      return { count: treffer.length };
    }),
  },
  checklistItem: {
    findMany: jest.fn(async ({ where, select, orderBy }: { where: Zeile; select?: Zeile; orderBy?: unknown }) =>
      sortieren(db.onboardingAufgaben.filter((a) => passt(a, where)), orderBy).map((a) => projizieren(a, select)),
    ),
    findUnique: jest.fn(
      async ({ where, select, include }: { where: Zeile; select?: Zeile; include?: { completedBy?: unknown } }) => {
        const a = db.onboardingAufgaben.find((x) => passt(x, where));
        if (!a) return null;
        const r = projizieren(a, select);
        if (include?.completedBy) {
          const u = db.users.find((x) => x.id === a.completedById);
          r.completedBy = u ? { firstName: u.firstName, lastName: u.lastName } : null;
        }
        return r;
      },
    ),
    count: jest.fn(async ({ where }: { where: Zeile }) => db.onboardingAufgaben.filter((a) => passt(a, where)).length),
    // Seit S24 (A4): die Aufgabe eines Vermerks (`vermerkZielLadenIn`).
    findFirst: jest.fn(async ({ where, select }: { where?: Zeile; select?: Zeile } = {}) => {
      const a = db.onboardingAufgaben.find((x) => passt(x, where));
      return a ? projizieren(a, select) : null;
    }),
    update: jest.fn(async ({ where, data }: { where: Zeile; data: Zeile }) => {
      const a = db.onboardingAufgaben.find((x) => passt(x, where));
      if (!a) throw new Error("Onboarding-Aufgabe fehlt");
      anwenden(a, data);
      return structuredClone(a);
    }),
    updateMany: jest.fn(async ({ where, data }: { where: Zeile; data: Zeile }) => {
      const treffer = db.onboardingAufgaben.filter((a) => passt(a, where));
      treffer.forEach((a) => anwenden(a, data));
      return { count: treffer.length };
    }),
    // Seit S10 (fuer A3): Ausstattungsaufgaben anlegen und loeschen, mit den
    // Kaskaden des Schemas (aufgabenGeloescht).
    create: jest.fn(async ({ data, select }: { data: Zeile; select?: Zeile }) => {
      const a = neueOnboardingAufgabe(data);
      db.onboardingAufgaben.push(a);
      return projizieren(a, select);
    }),
    delete: jest.fn(async ({ where }: { where: Zeile }) => {
      const a = db.onboardingAufgaben.find((x) => passt(x, where));
      if (!a) throw zeileFehlt();
      db.onboardingAufgaben = db.onboardingAufgaben.filter((x) => x !== a);
      aufgabenGeloescht([a]);
      return structuredClone(a);
    }),
    deleteMany: jest.fn(async ({ where }: { where?: Zeile } = {}) => {
      const treffer = db.onboardingAufgaben.filter((a) => passt(a, where));
      db.onboardingAufgaben = db.onboardingAufgaben.filter((a) => !treffer.includes(a));
      aufgabenGeloescht(treffer);
      return { count: treffer.length };
    }),
  },
  ...ausstattungsTabellen,
  departmentConfig: {
    findMany: jest.fn(async () => db.konfigs.map((k) => structuredClone(k))),
  },
  webhookConfig: {
    count: jest.fn(async ({ where }: { where: Zeile }) => db.webhooks.filter((w) => passt(w, where)).length),
  },
  auditLog: {
    create: jest.fn(async ({ data }: { data: Zeile }) => {
      db.audits.push(data);
      return data;
    }),
  },
  user: {
    findMany: jest.fn(async ({ where }: { where: Zeile }) => db.users.filter((u) => passt(u, where))),
    findUnique: jest.fn(async ({ where }: { where: Zeile }) => db.users.find((u) => passt(u, where)) ?? null),
  },
  smtpConfig: {
    findUnique: jest.fn(async () => ({ allowedRecipientDomains: db.domains, replyToEmail: db.replyToEmail })),
  },
  userOrgAssignment: {
    findUnique: jest.fn(async ({ where }: { where: { userId_organizationId: Zeile } }) =>
      db.zuweisungen.find(
        (z) =>
          z.userId === where.userId_organizationId.userId &&
          z.organizationId === where.userId_organizationId.organizationId,
      ) ?? null,
    ),
  },
};
fakePrisma.$transaction = jest.fn(async (fn: (tx: unknown) => unknown) => fn(fakePrisma));

/** Alle Tabellen leeren (in beforeEach aufrufen). */
export function dbLeeren(): void {
  db.vorgaenge = [];
  db.aufgaben = [];
  db.links = [];
  db.konfigs = [];
  db.webhooks = [];
  db.audits = [];
  db.users = [];
  db.domains = "";
  db.zuweisungen = [];
  db.onboardingVorgaenge = [];
  db.onboardingAufgaben = [];
  db.ausstattungZeilen = [];
  db.ausstattungAufgaben = [];
  db.stellenHinweise = [];
  db.ausstattungAenderungen = [];
  db.ausstattungsPositionen = [];
  db.ausstattungsAusblendungen = [];
  db.ausgaben = [];
  db.replyToEmail = null;
}
