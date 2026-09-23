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

function passt(zeile: Zeile, where: Record<string, unknown> | undefined): boolean {
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

function anwenden(zeile: Zeile, data: Record<string, unknown>) {
  for (const [k, v] of Object.entries(data)) {
    if (v !== null && typeof v === "object" && !(v instanceof Date) && "increment" in (v as object)) {
      zeile[k] = (zeile[k] as number) + (v as { increment: number }).increment;
    } else {
      zeile[k] = v;
    }
  }
  if (!("updatedAt" in data)) zeile.updatedAt = new Date();
}

function projizieren(zeile: Zeile, select?: Record<string, unknown>): Zeile {
  if (!select) return structuredClone(zeile);
  const r: Zeile = {};
  for (const [k, v] of Object.entries(select)) {
    if (v === true) r[k] = structuredClone(zeile[k]);
    else if (v && typeof v === "object" && !("where" in (v as object))) r[k] = structuredClone(zeile[k]);
  }
  return r;
}

function sortieren(zeilen: Zeile[], orderBy?: unknown): Zeile[] {
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
        [{ category: "asc" }, { orderIndex: "asc" }],
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
      [{ category: "asc" }, { orderIndex: "asc" }],
    ).map((a) => projizieren(a, s.select));
  }
  if (select.departmentLinks) {
    r.departmentLinks = db.links.filter((l) => l.onboardingId === v.id).map((l) => structuredClone(l));
  }
  return r;
}

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
                  [{ category: "asc" }, { orderIndex: "asc" }],
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
  },
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
    findUnique: jest.fn(async () => ({ allowedRecipientDomains: db.domains })),
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
}
