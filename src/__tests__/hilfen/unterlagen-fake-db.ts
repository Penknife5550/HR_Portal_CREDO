/**
 * Test-Hilfe: kleine In-Memory-Datenbank fuer „Unterlagen nachfordern" (Paket 4)
 *
 * Versteht genau die Abfrageformen von src/lib/unterlagen-dienst.ts und
 * src/lib/unterlagen-onboarding.ts: where mit Gleichheit, not/in/notIn (ueber
 * `passt` aus abteilungs-fake-db.ts), dazu gte/gt/lt/lte und den
 * Relationsfilter `nachforderung: {…}`; select-Projektion mit den
 * geschachtelten Relationen der Nachforderung (positionen → dateien,
 * entschiedenVon; links; angefordertVon); verschachteltes
 * `positionen: { create: [...] }`; bedingtes updateMany und deleteMany; die
 * drei Unique-Regeln (laufendSchluessel, (nachforderungId, typ), tokenHash) als
 * Fehler mit Code P2002 — wie Prisma.
 *
 * Was der Fake NICHT kann (Feinplanung 13): kein Rollback, keine Zeilensperre,
 * keine echte Nebenlaeufigkeit. `$transaction` ruft die Funktion mit
 * demselben Objekt auf. Die Tests pruefen deshalb zusaetzlich die REIHENFOLGE
 * der Aufrufe (`udb.aufrufe`: "tabelle.methode" je Aufruf) — erst sperren,
 * dann zaehlen, bedingtes updateMany vor dem Schreiben. `udb.vorTransaktion`
 * laeuft zu Beginn jeder Transaktion (z. B. „HR setzt gerade EXPIRED").
 *
 * Einbinden (Pfad relativ zur Testdatei):
 *
 *   jest.mock("@/lib/db", () => ({
 *     prisma: jest.requireActual("../hilfen/unterlagen-fake-db").fakePrisma,
 *   }));
 *   import { udb, udbLeeren, fakePrisma } from "../hilfen/unterlagen-fake-db";
 */

import { randomUUID } from "crypto";
import { anwenden, passt, projizieren, sortieren, type Zeile } from "./abteilungs-fake-db";

export type { Zeile };

export const udb: {
  /** OnboardingProcess-Zeilen; organization, employee, personalData und documents stehen direkt daran. */
  vorgaenge: Zeile[];
  /** FormTemplate-Zeilen (questionnaireType, requiredDocuments). */
  formularVorlagen: Zeile[];
  /** Employee-Zeilen (id, email) — die Adresse der Personalakte als zweiter Vorschlag. */
  personalakten: Zeile[];
  nachforderungen: Zeile[];
  positionen: Zeile[];
  dateien: Zeile[];
  links: Zeile[];
  audits: Zeile[];
  users: Zeile[];
  /** EmailTemplate-Zeilen (gespeicherte Vorlagen; sonst gilt der Code-Standard). */
  emailVorlagen: Zeile[];
  zuweisungen: Zeile[];
  smtp: { allowedRecipientDomains: string; replyToEmail: string };
  /** Protokoll aller Aufrufe als "tabelle.methode" in Reihenfolge. */
  aufrufe: string[];
  /** Laeuft zu Beginn jeder Transaktion. */
  vorTransaktion: (() => void) | null;
} = {
  vorgaenge: [],
  formularVorlagen: [],
  personalakten: [],
  nachforderungen: [],
  positionen: [],
  dateien: [],
  links: [],
  audits: [],
  users: [],
  emailVorlagen: [],
  zuweisungen: [],
  smtp: { allowedRecipientDomains: "", replyToEmail: "" },
  aufrufe: [],
  vorTransaktion: null,
};

type Auswahl = { select?: Zeile; where?: Zeile; orderBy?: unknown };

/** Wie Prisma: verletzte Eindeutigkeit mit Code P2002 und dem Feld in `meta.target`. */
export function eindeutigkeitsFehler(ziel: string[]): Error {
  const fehler = new Error(`Unique constraint failed on the fields: (${ziel.join(", ")})`) as Error & {
    code: string;
    meta: { target: string[] };
  };
  fehler.name = "PrismaClientKnownRequestError";
  fehler.code = "P2002";
  fehler.meta = { target: ziel };
  return fehler;
}

function istVergleich(bed: unknown): bed is { gte?: unknown; gt?: unknown; lt?: unknown; lte?: unknown } {
  return (
    bed !== null &&
    typeof bed === "object" &&
    !(bed instanceof Date) &&
    ["gte", "gt", "lt", "lte"].some((k) => k in (bed as object))
  );
}

function wert(x: unknown): number | string {
  return x instanceof Date ? x.getTime() : (x as number | string);
}

/** `passt` plus Vergleiche und der Relationsfilter `nachforderung`. */
export function passtU(zeile: Zeile, where: Zeile | undefined): boolean {
  if (!where) return true;
  const rest: Zeile = {};
  for (const [k, bed] of Object.entries(where)) {
    if (bed === undefined) continue;
    if (k === "nachforderung") {
      const n = udb.nachforderungen.find((x) => x.id === zeile.nachforderungId);
      if (!n || !passtU(n, bed as Zeile)) return false;
      continue;
    }
    if (istVergleich(bed)) {
      if (zeile[k] == null) return false;
      const w = wert(zeile[k]);
      if (bed.gte !== undefined && !(w >= wert(bed.gte))) return false;
      if (bed.gt !== undefined && !(w > wert(bed.gt))) return false;
      if (bed.lte !== undefined && !(w <= wert(bed.lte))) return false;
      if (bed.lt !== undefined && !(w < wert(bed.lt))) return false;
      continue;
    }
    rest[k] = bed;
  }
  return passt(zeile, rest);
}

/**
 * `projizieren` klont mit `structuredClone` — das legt Dates im Realm von Node
 * an, nicht in dem des Tests, und `instanceof Date` (etwa in
 * `ablaufKalendertag`) schlaegt dann fehl. Hier wird rekursiv zurueck in
 * Dates DIESES Realms gebaut; zugleich ist das Ergebnis eine tiefe Kopie.
 */
export function realmSicher<T>(wert: T): T {
  if (wert === null || typeof wert !== "object") return wert;
  if (Object.prototype.toString.call(wert) === "[object Date]") {
    return new Date((wert as unknown as Date).getTime()) as unknown as T;
  }
  if (Array.isArray(wert)) return wert.map((x) => realmSicher(x)) as unknown as T;
  return Object.fromEntries(Object.entries(wert as Zeile).map(([k, v]) => [k, realmSicher(v)])) as T;
}

/** `projizieren` aus abteilungs-fake-db.ts, mit Dates im Realm des Tests. */
function proj(zeile: Zeile, select?: Zeile): Zeile {
  return realmSicher(projizieren(zeile, select));
}

function flach(select: Zeile | undefined): Zeile | undefined {
  if (!select) return undefined;
  return Object.fromEntries(Object.entries(select).filter(([, v]) => v === true));
}

function benutzer(id: unknown, auswahl: unknown): Zeile | null {
  const u = udb.users.find((x) => x.id === id);
  return u ? proj(u, (auswahl as Auswahl).select) : null;
}

function dateiAusgabe(d: Zeile, select?: Zeile): Zeile {
  return proj(d, flach(select));
}

function positionAusgabe(p: Zeile, select?: Zeile): Zeile {
  if (!select) return realmSicher(p);
  const r = proj(p, flach(select));
  if (select.dateien) {
    const s = select.dateien as Auswahl;
    r.dateien = sortieren(
      udb.dateien.filter((d) => d.positionId === p.id && passtU(d, s.where)),
      s.orderBy,
    ).map((d) => dateiAusgabe(d, s.select));
  }
  if (select.entschiedenVon) r.entschiedenVon = benutzer(p.entschiedenVonId, select.entschiedenVon);
  return r;
}

function nachforderungAusgabe(n: Zeile, select?: Zeile): Zeile {
  if (!select) return realmSicher(n);
  const r = proj(n, flach(select));
  if (select.positionen) {
    const s = select.positionen as Auswahl;
    r.positionen = sortieren(
      udb.positionen.filter((p) => p.nachforderungId === n.id && passtU(p, s.where)),
      s.orderBy,
    ).map((p) => positionAusgabe(p, s.select));
  }
  if (select.links) {
    const s = select.links as Auswahl;
    r.links = sortieren(
      udb.links.filter((l) => l.nachforderungId === n.id && passtU(l, s.where)),
      s.orderBy,
    ).map((l) => proj(l, flach(s.select)));
  }
  if (select.dateien) {
    const s = select.dateien as Auswahl;
    r.dateien = udb.dateien
      .filter((d) => d.nachforderungId === n.id && passtU(d, s.where))
      .map((d) => dateiAusgabe(d, s.select));
  }
  if (select.angefordertVon) r.angefordertVon = benutzer(n.angefordertVonId, select.angefordertVon);
  return r;
}

/** Nachforderung mit den Standardwerten des Schemas. */
export function neueNachforderung(data: Zeile): Zeile {
  const jetzt = new Date();
  return {
    id: randomUUID(),
    modul: "ONBOARDING",
    onboardingId: null,
    status: "LAUFEND",
    laufendSchluessel: null,
    empfaenger: "",
    empfaengerVorgang: null,
    empfaengerAbweichend: false,
    frist: new Date("2026-10-05T00:00:00.000Z"),
    nachricht: null,
    reduziert: false,
    angefordertVonId: null,
    angefordertAm: jetzt,
    erinnertFuerFrist: null,
    erinnertStufe: null,
    fristGemeldetFuer: null,
    vollstaendigSeit: null,
    vollstaendigGemeldetAm: null,
    hrMeldungStatus: null,
    hrMeldungDetail: null,
    uploadsGesamt: 0,
    erledigtAm: null,
    zurueckgezogenAm: null,
    zurueckgezogenVonId: null,
    createdAt: jetzt,
    updatedAt: jetzt,
    ...data,
  };
}

/** Position mit den Standardwerten des Schemas. */
export function neuePosition(data: Zeile): Zeile {
  const jetzt = new Date();
  return {
    id: randomUUID(),
    reihenfolge: 0,
    typ: null,
    bezeichnung: "Unterlage",
    hinweis: null,
    originalErforderlich: false,
    sensibel: false,
    fristpflichtig: false,
    status: "ANGEFORDERT",
    einreichungen: 0,
    gueltigBisAngabe: null,
    angefordertAm: jetzt,
    uebermitteltAm: null,
    begruendung: null,
    entfaelltNotiz: null,
    entschiedenAm: null,
    entschiedenVonId: null,
    createdAt: jetzt,
    updatedAt: jetzt,
    ...data,
  };
}

/** Datei mit den Standardwerten des Schemas. */
export function neueDatei(data: Zeile): Zeile {
  const jetzt = new Date();
  return {
    id: randomUUID(),
    status: "ENTWURF",
    anzeigeName: "scan.pdf",
    speicherPfad: null,
    mimeType: "application/pdf",
    groesse: 1000,
    sha256: "0".repeat(64),
    pdfHinweise: null,
    einreichungNr: null,
    hochgeladenAm: jetzt,
    uebermitteltAm: null,
    entschiedenAm: null,
    begruendung: null,
    uebernahmeZiel: null,
    uebernommenId: null,
    uebernommenAm: null,
    loeschenAb: null,
    dateiGeloeschtAm: null,
    createdAt: jetzt,
    updatedAt: jetzt,
    ...data,
  };
}

/** Link mit den Standardwerten des Schemas. */
export function neuerUnterlagenLink(data: Zeile): Zeile {
  return {
    id: randomUUID(),
    tokenHash: randomUUID().replace(/-/g, "").padEnd(64, "0"),
    gueltigBis: new Date("2026-10-19T00:00:00.000Z"),
    anlass: "ANFORDERUNG",
    positionId: null,
    empfaenger: "",
    mailStatus: "AUSSTEHEND",
    mailDetail: null,
    messageId: null,
    gesendetAm: null,
    nachholVersuche: 0,
    entwertetAm: null,
    entwertetGrund: null,
    erstelltVonId: null,
    createdAt: new Date(),
    ...data,
  };
}

function positionAnlegen(data: Zeile): Zeile {
  if (
    data.typ != null &&
    udb.positionen.some((p) => p.nachforderungId === data.nachforderungId && p.typ === data.typ)
  ) {
    throw eindeutigkeitsFehler(["nachforderungId", "typ"]);
  }
  const p = neuePosition(data);
  udb.positionen.push(p);
  return p;
}

function protokolliert<A extends unknown[], R>(name: string, fn: (...args: A) => R): jest.Mock<R, A> {
  return jest.fn((...args: A) => {
    udb.aufrufe.push(name);
    return fn(...args);
  });
}

type Args = { where?: Zeile; data?: Zeile; select?: Zeile; orderBy?: unknown };

export const fakePrisma: Record<string, unknown> = {
  onboardingProcess: {
    findUnique: protokolliert("onboardingProcess.findUnique", async ({ where, select }: Args) => {
      const v = udb.vorgaenge.find((x) => passtU(x, where));
      return v ? proj(v, select) : null;
    }),
    updateMany: protokolliert("onboardingProcess.updateMany", async ({ where, data }: Args) => {
      const treffer = udb.vorgaenge.filter((v) => passtU(v, where));
      treffer.forEach((v) => anwenden(v, data ?? {}));
      return { count: treffer.length };
    }),
  },
  formTemplate: {
    findUnique: protokolliert("formTemplate.findUnique", async ({ where, select }: Args) => {
      const f = udb.formularVorlagen.find((x) => passtU(x, where));
      return f ? proj(f, select) : null;
    }),
  },
  employee: {
    findUnique: protokolliert("employee.findUnique", async ({ where, select }: Args) => {
      const e = udb.personalakten.find((x) => passtU(x, where));
      return e ? proj(e, select) : null;
    }),
  },
  unterlagenNachforderung: {
    create: protokolliert("unterlagenNachforderung.create", async ({ data, select }: Args) => {
      const { positionen, ...kopf } = data ?? {};
      if (
        kopf.laufendSchluessel != null &&
        udb.nachforderungen.some((n) => n.laufendSchluessel === kopf.laufendSchluessel)
      ) {
        throw eindeutigkeitsFehler(["laufendSchluessel"]);
      }
      const n = neueNachforderung(kopf);
      udb.nachforderungen.push(n);
      for (const p of ((positionen as { create?: Zeile[] } | undefined)?.create ?? [])) {
        positionAnlegen({ ...p, nachforderungId: n.id });
      }
      return nachforderungAusgabe(n, select);
    }),
    findFirst: protokolliert("unterlagenNachforderung.findFirst", async ({ where, select }: Args) => {
      const n = udb.nachforderungen.find((x) => passtU(x, where));
      return n ? nachforderungAusgabe(n, select) : null;
    }),
    findUnique: protokolliert("unterlagenNachforderung.findUnique", async ({ where, select }: Args) => {
      const n = udb.nachforderungen.find((x) => passtU(x, where));
      return n ? nachforderungAusgabe(n, select) : null;
    }),
    findMany: protokolliert("unterlagenNachforderung.findMany", async ({ where, select, orderBy }: Args) =>
      sortieren(udb.nachforderungen.filter((n) => passtU(n, where)), orderBy).map((n) =>
        nachforderungAusgabe(n, select),
      ),
    ),
    updateMany: protokolliert("unterlagenNachforderung.updateMany", async ({ where, data }: Args) => {
      const treffer = udb.nachforderungen.filter((n) => passtU(n, where));
      for (const n of treffer) {
        const schluessel = data?.laufendSchluessel;
        if (
          schluessel != null &&
          udb.nachforderungen.some((x) => x !== n && x.laufendSchluessel === schluessel)
        ) {
          throw eindeutigkeitsFehler(["laufendSchluessel"]);
        }
        anwenden(n, data ?? {});
      }
      return { count: treffer.length };
    }),
  },
  unterlagenPosition: {
    create: protokolliert("unterlagenPosition.create", async ({ data, select }: Args) =>
      positionAusgabe(positionAnlegen(data ?? {}), select),
    ),
    findMany: protokolliert("unterlagenPosition.findMany", async ({ where, select, orderBy }: Args) =>
      sortieren(udb.positionen.filter((p) => passtU(p, where)), orderBy).map((p) => positionAusgabe(p, select)),
    ),
    updateMany: protokolliert("unterlagenPosition.updateMany", async ({ where, data }: Args) => {
      const treffer = udb.positionen.filter((p) => passtU(p, where));
      treffer.forEach((p) => anwenden(p, data ?? {}));
      return { count: treffer.length };
    }),
  },
  unterlagenDatei: {
    findMany: protokolliert("unterlagenDatei.findMany", async ({ where, select, orderBy }: Args) =>
      sortieren(udb.dateien.filter((d) => passtU(d, where)), orderBy).map((d) => dateiAusgabe(d, select)),
    ),
    updateMany: protokolliert("unterlagenDatei.updateMany", async ({ where, data }: Args) => {
      const treffer = udb.dateien.filter((d) => passtU(d, where));
      treffer.forEach((d) => anwenden(d, data ?? {}));
      return { count: treffer.length };
    }),
    deleteMany: protokolliert("unterlagenDatei.deleteMany", async ({ where }: Args) => {
      const vorher = udb.dateien.length;
      udb.dateien = udb.dateien.filter((d) => !passtU(d, where));
      return { count: vorher - udb.dateien.length };
    }),
  },
  unterlagenLink: {
    create: protokolliert("unterlagenLink.create", async ({ data, select }: Args) => {
      if (udb.links.some((l) => l.tokenHash === data?.tokenHash)) throw eindeutigkeitsFehler(["tokenHash"]);
      const l = neuerUnterlagenLink(data ?? {});
      udb.links.push(l);
      return proj(l, flach(select));
    }),
    findUnique: protokolliert("unterlagenLink.findUnique", async ({ where, select }: Args) => {
      const l = udb.links.find((x) => passtU(x, where));
      return l ? proj(l, flach(select)) : null;
    }),
    findMany: protokolliert("unterlagenLink.findMany", async ({ where, select, orderBy }: Args) =>
      sortieren(udb.links.filter((l) => passtU(l, where)), orderBy).map((l) => proj(l, flach(select))),
    ),
    updateMany: protokolliert("unterlagenLink.updateMany", async ({ where, data }: Args) => {
      const treffer = udb.links.filter((l) => passtU(l, where));
      treffer.forEach((l) => {
        anwenden(l, data ?? {});
        // Links haben kein updatedAt — anwenden setzt es sonst.
        delete l.updatedAt;
      });
      return { count: treffer.length };
    }),
  },
  auditLog: {
    create: protokolliert("auditLog.create", async ({ data }: Args) => {
      udb.audits.push(realmSicher(data ?? {}));
      return data;
    }),
  },
  user: {
    findUnique: protokolliert("user.findUnique", async ({ where, select }: Args) => {
      const u = udb.users.find((x) => passtU(x, where));
      return u ? proj(u, select) : null;
    }),
  },
  smtpConfig: {
    findUnique: protokolliert("smtpConfig.findUnique", async ({ select }: Args) =>
      proj({ id: "default", ...udb.smtp }, select),
    ),
  },
  emailTemplate: {
    findUnique: protokolliert("emailTemplate.findUnique", async ({ where }: Args) => {
      const t = udb.emailVorlagen.find((x) => passtU(x, where));
      return t ? realmSicher(t) : null;
    }),
  },
  emailLog: {
    create: protokolliert("emailLog.create", async ({ data }: Args) => data),
  },
  userOrgAssignment: {
    findUnique: protokolliert(
      "userOrgAssignment.findUnique",
      async ({ where }: { where: { userId_organizationId: Zeile } }) =>
        udb.zuweisungen.find(
          (z) =>
            z.userId === where.userId_organizationId.userId &&
            z.organizationId === where.userId_organizationId.organizationId,
        ) ?? null,
    ),
  },
};

fakePrisma.$transaction = jest.fn(async (fn: (tx: unknown) => unknown) => {
  udb.aufrufe.push("$transaction");
  udb.vorTransaktion?.();
  return fn(fakePrisma);
});

/** Alle Tabellen leeren (in beforeEach aufrufen). */
export function udbLeeren(): void {
  udb.vorgaenge = [];
  udb.formularVorlagen = [];
  udb.personalakten = [];
  udb.nachforderungen = [];
  udb.positionen = [];
  udb.dateien = [];
  udb.links = [];
  udb.audits = [];
  udb.users = [];
  udb.emailVorlagen = [];
  udb.zuweisungen = [];
  udb.smtp = { allowedRecipientDomains: "", replyToEmail: "" };
  udb.aufrufe = [];
  udb.vorTransaktion = null;
}
