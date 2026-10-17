/**
 * Test-Hilfe: kleine In-Memory-Datenbank fuer den Stammabgleich aus DokuBit
 * (Self-Service, Paket S0)
 *
 * Versteht genau die Abfrageformen von src/lib/personalstamm/abgleich.ts:
 * where mit Gleichheit (auch null), `not` (auch `{ not: null }`), `in`, `gte`
 * (Datum), `OR` und den zusammengesetzten Schluessel
 * `mandantNumber_abrechnungskreis_personalNumber`; select-Projektion (flach),
 * `take`; `findUnique`/`findFirst`/`findMany`/`count`/`create`/`update` auf
 * employee, employment, organization (nur lesend) und auditLog (nur create).
 * Eine unbekannte Bedingung wirft — so faellt eine neue Abfrageform im
 * Abgleich sofort auf, statt still alles zu treffen (etwa eine Abfrage mit
 * `mode: "insensitive"`, die der Abgleich nicht mehr stellt).
 *
 * Wie Postgres: Die Eindeutigkeit des Vertrags (Mandant + Abrechnungskreis +
 * MANR, NULL kollidiert nicht) wirft P2002, ein fehlendes Update-Ziel P2025,
 * ein NUL-Zeichen (U+0000) in einem Text oder JSON-Wert — gelesen wie
 * geschrieben — 22021, ein einzelnes UTF-16-Surrogat `InvalidArg` (wie
 * Prisma). Neue Zeilen bekommen die Standardwerte des Schemas
 * (`isActive: true`, `personalNumber: null` usw.).
 *
 * `$transaction(fn)` ruft die Funktion mit demselben Objekt auf und rollt bei
 * einer Ausnahme zurueck (Schnappschuss der Tabellen) — wie die interaktive
 * Transaktion von Prisma. Sperren und echte Nebenlaeufigkeit bildet der Fake
 * nicht nach.
 *
 * Einbinden (Pfad relativ zur Testdatei):
 *
 *   jest.mock("@/lib/db", () => ({
 *     prisma: jest.requireActual("../hilfen/personalstamm-fake-db").fakePrisma,
 *   }));
 *   import { pdb, pdbLeeren, fakePrisma } from "../hilfen/personalstamm-fake-db";
 */

export type Zeile = Record<string, unknown>;

export const pdb: {
  /** Employee-Zeilen. */
  personen: Zeile[];
  /** Employment-Zeilen. */
  anstellungen: Zeile[];
  /** Organization-Zeilen (nur gelesen). */
  organisationen: Zeile[];
  /** AuditLog-Zeilen. */
  audits: Zeile[];
} = { personen: [], anstellungen: [], organisationen: [], audits: [] };

let idZaehler = 0;

export function pdbLeeren(): void {
  pdb.personen = [];
  pdb.anstellungen = [];
  pdb.organisationen = [];
  pdb.audits = [];
}

/** Employee mit den Standardwerten des Schemas. */
export function neuePerson(data: Zeile): Zeile {
  const jetzt = new Date();
  return {
    id: `p-${++idZaehler}`,
    personalNumber: null,
    firstName: "",
    lastName: "",
    email: null,
    privateEmail: null,
    dateOfBirth: null,
    phone: null,
    importSource: null,
    importedAt: null,
    lastSyncAt: null,
    isActive: true,
    createdAt: jetzt,
    updatedAt: jetzt,
    ...data,
  };
}

/** Employment mit den Standardwerten des Schemas (ohne Schluessel = Bestandsanstellung). */
export function neueAnstellung(data: Zeile): Zeile {
  const jetzt = new Date();
  return {
    id: `a-${++idZaehler}`,
    position: null,
    department: null,
    contractType: null,
    workingHoursWeek: null,
    startDate: null,
    endDate: null,
    mandantNumber: null,
    abrechnungskreis: null,
    personalNumber: null,
    isActive: true,
    createdAt: jetzt,
    updatedAt: jetzt,
    ...data,
  };
}

/** Mandant mit der ID `org-<nummer>`. */
export function neueOrganisation(mandantNumber: string): Zeile {
  return { id: `org-${mandantNumber}`, mandantNumber, name: `Mandant ${mandantNumber}`, isActive: true };
}

function gleich(a: unknown, b: unknown): boolean {
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  return a === b;
}

function passt(zeile: Zeile, where: Record<string, unknown> | undefined): boolean {
  if (!where) return true;
  for (const [k, bed] of Object.entries(where)) {
    if (bed === undefined) continue;
    if (k === "mandantNumber_abrechnungskreis_personalNumber") {
      const b = bed as Zeile;
      const teile = { mandantNumber: b.mandantNumber, abrechnungskreis: b.abrechnungskreis, personalNumber: b.personalNumber };
      if (!passt(zeile, teile)) return false;
      continue;
    }
    if (k === "OR") {
      if (!(bed as Zeile[]).some((teil) => passt(zeile, teil))) return false;
      continue;
    }
    if (bed !== null && typeof bed === "object" && !(bed instanceof Date)) {
      const b = bed as Zeile;
      if ("not" in b) {
        if (b.not === null ? zeile[k] == null : gleich(zeile[k], b.not)) return false;
        continue;
      }
      if ("in" in b) {
        if (!(b.in as unknown[]).some((wert) => gleich(zeile[k], wert))) return false;
        continue;
      }
      if ("gte" in b) {
        // Nur Datumswerte (wie `endDate`); null erfuellt `gte` nie — wie in SQL.
        const zeit = (v: unknown) => (Object.prototype.toString.call(v) === "[object Date]" ? (v as Date).getTime() : NaN);
        if (!(zeit(zeile[k]) >= zeit(b.gte))) return false;
        continue;
      }
      throw new Error(`Fake versteht die Bedingung fuer ${k} nicht`);
    }
    if (!gleich(zeile[k] ?? null, bed)) return false;
  }
  return true;
}

/**
 * Kopie einer (flachen) Zeile. Bewusst NICHT `structuredClone`: Unter Jest
 * stammen dessen Date-Objekte aus einem anderen Realm, `instanceof Date` im
 * Abgleich (`ablaufKalendertag`) waere dann falsch — anders als bei Prisma.
 */
function kopie(zeile: Zeile): Zeile {
  const r: Zeile = {};
  for (const [k, v] of Object.entries(zeile)) {
    r[k] = Object.prototype.toString.call(v) === "[object Date]" ? new Date((v as Date).getTime()) : v;
  }
  return r;
}

function projizieren(zeile: Zeile, select?: Record<string, unknown>): Zeile {
  const voll = kopie(zeile);
  if (!select) return voll;
  return Object.fromEntries(Object.keys(select).filter((k) => select[k] === true).map((k) => [k, voll[k]]));
}

function anwenden(zeile: Zeile, data: Zeile): void {
  Object.assign(zeile, data);
  if (!("updatedAt" in data)) zeile.updatedAt = new Date();
}

/** Wie Prisma bei einer verletzten Eindeutigkeit. */
function eindeutigkeitVerletzt(): Error {
  return Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
}

/** Wie Prisma, wenn die Zeile zum Update fehlt. */
function zeileFehlt(): Error {
  return Object.assign(new Error("Record not found."), { code: "P2025" });
}

/**
 * Wie Postgres: NUL in Text (22021) oder jsonb (22P05) wird abgelehnt — hier
 * einheitlich 22021. Wie Prisma 6.9: ein einzelnes UTF-16-Surrogat in einem
 * Argument scheitert schon vor der Datenbank (`InvalidArg`).
 */
function ohneNul(wert: unknown): void {
  if (typeof wert === "string" && wert.includes("\u0000")) {
    throw Object.assign(new Error("invalid byte sequence for encoding UTF8: 0x00"), { code: "22021" });
  }
  if (typeof wert === "string" && /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(wert)) {
    throw Object.assign(new Error("unexpected end of hex escape"), { code: "InvalidArg" });
  }
  if (wert !== null && typeof wert === "object") Object.values(wert).forEach(ohneNul);
}

type Args = { where?: Zeile; select?: Zeile; data?: Zeile; take?: number };

/** Lesende und schreibende Methoden einer Tabelle (`create` mit Standardwerten und Pruefung). */
function tabelle(liste: () => Zeile[], neu: (data: Zeile) => Zeile, pruefen?: (z: Zeile) => void) {
  const finde = (where?: Zeile) => {
    ohneNul(where);
    return liste().find((z) => passt(z, where));
  };
  return {
    findUnique: jest.fn(async ({ where, select }: Args) => {
      const z = finde(where);
      return z ? projizieren(z, select) : null;
    }),
    findFirst: jest.fn(async ({ where, select }: Args) => {
      const z = finde(where);
      return z ? projizieren(z, select) : null;
    }),
    findMany: jest.fn(async ({ where, select, take }: Args = {}) => {
      ohneNul(where);
      return liste()
        .filter((z) => passt(z, where))
        .slice(0, take ?? Infinity)
        .map((z) => projizieren(z, select));
    }),
    count: jest.fn(async ({ where }: Args = {}) => {
      ohneNul(where);
      return liste().filter((z) => passt(z, where)).length;
    }),
    create: jest.fn(async ({ data, select }: Args) => {
      ohneNul(data);
      const z = neu(data ?? {});
      pruefen?.(z);
      liste().push(z);
      return projizieren(z, select);
    }),
    update: jest.fn(async ({ where, data, select }: Args) => {
      ohneNul(data);
      const z = finde(where);
      if (!z) throw zeileFehlt();
      const probe = { ...z, ...data };
      pruefen?.(probe);
      anwenden(z, data ?? {});
      return projizieren(z, select);
    }),
  };
}

/** `@@unique([mandantNumber, abrechnungskreis, personalNumber])` — NULL kollidiert nicht. */
function vertragEindeutig(z: Zeile): void {
  if (z.mandantNumber == null || z.abrechnungskreis == null || z.personalNumber == null) return;
  const doppelt = pdb.anstellungen.some(
    (a) =>
      a.id !== z.id &&
      a.mandantNumber === z.mandantNumber &&
      a.abrechnungskreis === z.abrechnungskreis &&
      a.personalNumber === z.personalNumber,
  );
  if (doppelt) throw eindeutigkeitVerletzt();
}

export const fakePrisma = {
  employee: tabelle(() => pdb.personen, neuePerson),
  employment: tabelle(() => pdb.anstellungen, neueAnstellung, vertragEindeutig),
  organization: tabelle(() => pdb.organisationen, (data) => ({ ...data })),
  auditLog: tabelle(
    () => pdb.audits,
    (data) => ({ id: `log-${++idZaehler}`, createdAt: new Date(), ...data }),
  ),
  $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>): Promise<unknown> => {
    const sicherung = {
      personen: pdb.personen.map(kopie),
      anstellungen: pdb.anstellungen.map(kopie),
      organisationen: pdb.organisationen.map(kopie),
      audits: pdb.audits.map(kopie),
    };
    try {
      return await fn(fakePrisma);
    } catch (err) {
      Object.assign(pdb, sicherung);
      throw err;
    }
  }),
};
