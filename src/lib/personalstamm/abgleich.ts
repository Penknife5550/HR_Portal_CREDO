/**
 * Stammabgleich aus DokuBit (Self-Service, Paket S0).
 *
 * n8n liest nachts [DokuBit].[dbo].[dokubitmitarbeiter] und schickt Stapel an
 * POST /api/webhooks/personalstamm; die Route reicht sie an
 * `personalstammAbgleichen` durch. Regeln (Bauvorgabe S0 mit Nachtrag v3
 * „Die Adresse ist die Person"):
 *
 * - **Eine Zeile ist ein Vertrag** und wird genau eine `Employment`-Zeile,
 *   eindeutig ueber Mandant + Abrechnungskreis + MANR
 *   (`@@unique([mandantNumber, abrechnungskreis, personalNumber])`). Die MANR
 *   allein ist kein Personenschluessel.
 * - **Die dienstliche Adresse ist die Person** (getrimmt, kleingeschrieben).
 *   Ein Personendatensatz wird nie auf einen anderen Menschen umgeschrieben:
 *   Steht bei einem laufenden Vertrag eine andere Adresse, wandert der Vertrag
 *   zur Person mit dieser Adresse; gibt es sie nicht, wird sie angelegt. Nach
 *   einer Heirat mit neuer Adresse gibt es also zwei Datensaetze, der alte wird
 *   inaktiv. Nie ueber den Namen und nie ueber `Employee.personalNumber` (dort
 *   steht die LOGA-Nummer; sie wird hier weder gelesen noch geschrieben).
 * - **Der Name folgt DokuBit nur im Konsens** (Heirat bei gleicher Adresse):
 *   wenn die Person vor dem Lauf mindestens einen laufenden verwalteten Vertrag
 *   hat und jeder davon im Stapel mit ihrer Adresse und seinem gespeicherten
 *   Beginn kommt (sonst ist der Schluessel vermutlich neu vergeben) — alle
 *   Zeilen einer Adresse tragen dann denselben Namen — und nur ein neuer Vor-
 *   ODER Nachname; ein ganz anderer Name ist ein anderer Mensch. Eine Zeile
 *   ohne oder mit ungueltiger Adresse aendert nie einen Namen. Zieht im selben
 *   Lauf ein Vertrag der Person zu einer neuen Adresse, folgt der Name am
 *   verbliebenen Datensatz erst im naechsten Lauf (Stand vor dem Lauf).
 * - **Ausnahme Anschluss nach dem Ende, nur mit Nachweis** (Entscheidungen
 *   R2 und F vom 17.10.2026): Hat eine DokuBit-Person vor dem Lauf keinen
 *   laufenden Vertrag, benennt eine LAUFENDE Zeile mit gleichem Vornamen sie
 *   um und haengt ihren Vertrag an — aber nur, wenn im selben Stapel unter
 *   derselben Adresse die Zeile eines ihrer Vertraege kommt, die ihn
 *   hoechstens PERSONALSTAMM_ANSCHLUSS_TAGE vor heute enden laesst und seinen
 *   gespeicherten Beginn nennt (sonst ist der Schluessel neu vergeben). Diese
 *   Zeile traegt dann den neuen Namen (eine Adresse, ein Name), DokuBit fuehrt
 *   ihn also auch am alten Vertrag. Sie selbst wird in diesem Lauf noch
 *   gemeldet; ab dem naechsten passt der Name.
 * - **Im Zweifel nichts zuordnen**, sondern melden (Grundcodes in
 *   src/lib/constants.ts): Adresse mit mehreren Namen im Stapel, mehrere
 *   Personen mit der Adresse, von Hand oder aus einer anderen Quelle gefuehrte
 *   Person, anderer Name ohne Konsens oder Nachweis, keine oder eine ungueltige
 *   Adresse. Ein bekannter Vertrag bleibt dann, wo er ist, und ein Zweifel
 *   verschafft nie Zugang (Entscheidung P2 vom 17.10.2026): Ein Ende kommt
 *   immer an, aber nur das Ende; ein laufender Vertrag wird aufgefrischt (die
 *   Stunden nur, wenn die Zeile seinen gespeicherten Beginn nennt), sein
 *   Ende aber nie verlaengert oder entfristet und sein Beginn nie geaendert;
 *   ein gespeichert nicht laufender bleibt unberuehrt, auch wenn die Zeile ihn
 *   laufen laesst.
 * - **Ein Vertrag laeuft**, solange `vertragsende` leer ist oder heute bzw.
 *   spaeter liegt — „heute" als Berliner Kalendertag, nie der UTC-Tag.
 *   `vertragsende` ist autoritativ: null (unbefristet) ueberschreibt ein altes
 *   Ende. „Leere Felder loeschen nichts" gilt nur fuer die Stunden.
 * - **Aktiv ist eine DokuBit-Person**, solange einer ihrer VERWALTETEN
 *   Vertraege (Abrechnungskreis und MANR gesetzt) laeuft. Gerechnet wird
 *   einmal am Ende des Stapels, fuer jede Person, die einen Vertrag bekommen,
 *   verloren oder aufgefrischt hat, und fuer jede, deren Adresse in einer
 *   verarbeiteten Zeile steht (so endet ein Schutz mit seinem Grund). Nicht
 *   stillgelegt wird, wessen Adresse UND Name im Stapel bei einer laufenden,
 *   nur wegen eines Zweifelsfalls nicht zugeordneten Zeile standen — ihr
 *   eigener Anschluss, nicht der eines anderen mit derselben Adresse. Ein
 *   leerer oder halber Stapel legt nie jemanden still, eine fehlerhafte Zeile
 *   allein auch nicht. Scheitert aber der laufende Anschluss an einem Fehler
 *   (Format, Mandant, Ausnahme), waehrend der Vorgaenger beendet ankommt, wird
 *   stillgelegt; der Lauf nach der Behebung reaktiviert.
 *
 * Ablauf: Ein Vorlauf prueft alle Zeilen und liest den Stand vor dem Lauf
 * (Personen je Adresse, bekannte und laufende Vertraege). Zeilen mit
 * doppeltem Schluessel werden nicht verarbeitet, auch wenn einer der
 * Zwillinge einen Formatfehler hat. Danach sequenziell je
 * Zeile eine interaktive Transaktion, Zeilen BEKANNTER Vertraege zuerst.
 * Eine Ausnahme kostet nur ihre Zeile (`INTERNER_FEHLER`), der naechste Lauf
 * holt sie nach. Scheitert der Vorlauf, sind alle Zeilen `INTERNER_FEHLER`.
 * Gleichzeitige Aufrufe laufen nacheinander (ein Prozess): Sonst saehen zwei
 * Laeufe denselben Stand und legten etwa fuer einen umziehenden Vertrag
 * zweimal dieselbe Person an.
 *
 * Jeder Aufruf schreibt genau einen AuditLog `PERSONALSTAMM_LAUF` mit Zahlen
 * und Meldungen (Vertragsschluessel + Grundcode) — ohne Namen und ohne
 * Adressen. In die Konsole kommen nur Zeilenindex und Fehlerkennung, nie
 * Datenwerte.
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  IMPORT_QUELLE_MANUELL,
  PERSONALSTAMM_ACTIONS,
  PERSONALSTAMM_ANSCHLUSS_TAGE,
  PERSONALSTAMM_PROCESS_TYPE,
  PERSONALSTAMM_QUELLE,
  type PersonalstammGrundcode,
  type PersonalstammZeilenstatus,
} from "@/lib/constants";
import { ablaufKalendertag, heuteInBerlin, kalendertagAlsDatum, tageSpaeter, type Kalendertag } from "@/lib/kalendertag";
import { fehlerKennung } from "@/lib/fehler-kennung";
import {
  personalstammEintragSchema,
  schluesselAusRohzeile,
  vertragsSchluessel,
  type PersonalstammEintrag,
} from "@/lib/validations/personalstamm";

export { vertragsSchluessel };

export interface PersonalstammZeilenErgebnis {
  index: number;
  status: PersonalstammZeilenstatus;
  schluessel?: string; // "742|AK|MANR"
  code?: PersonalstammGrundcode;
  feld?: string; // nur bei FORMATFEHLER: Pfad, ohne Wert
}

export interface PersonalstammZahlen {
  zeilen: number;
  angelegt: number;
  aktualisiert: number;
  unveraendert: number;
  uebersprungen: number;
  stillgelegt: number;
  reaktiviert: number;
  zweifelsfall: number;
  fehler: number;
}

export interface PersonalstammStapelErgebnis {
  success: boolean; // fehler === 0
  summary: PersonalstammZahlen;
  results: PersonalstammZeilenErgebnis[];
}

type Db = Prisma.TransactionClient;

/** Vom Abgleich verwaltet = Vertragsschluessel gesetzt. */
const VERWALTET = { abrechnungskreis: { not: null }, personalNumber: { not: null } } as const;

/** Laeuft am Kalendertag `heute` (E3): `isActive` und kein Ende vor heute. */
function laeuftAm(heute: Kalendertag) {
  return { isActive: true, OR: [{ endDate: null }, { endDate: { gte: kalendertagAlsDatum(heute) } }] };
}

/** Was der Abgleich von einer Person liest — bewusst ohne `personalNumber` (LOGA). */
const PERSON_FELDER = {
  id: true,
  firstName: true,
  lastName: true,
  importSource: true,
  importedAt: true,
} as const;
type Person = Prisma.EmployeeGetPayload<{ select: typeof PERSON_FELDER }>;

const VERTRAG_FELDER = {
  id: true,
  employeeId: true,
  organizationId: true,
  startDate: true,
  endDate: true,
  workingHoursWeek: true,
  isActive: true,
} as const;
type Vertrag = Prisma.EmploymentGetPayload<{ select: typeof VERTRAG_FELDER }>;

type Wechsel = "stillgelegt" | "reaktiviert";

/** Eine Zeile, die verarbeitet wird: gueltig, oder nur ihre Adresse ist ungueltig (dann ohne Adresse). */
interface Zeile {
  index: number;
  eintrag: PersonalstammEintrag;
  adresseUngueltig: boolean;
}

/** Stand vor dem Lauf (Vorlauf) und was der Lauf nachfuehrt. */
interface Stapel {
  /** Vertragsschluessel → seine Zeile; nur verarbeitete Zeilen (Schluessel dort eindeutig). */
  zeileJeSchluessel: Map<string, PersonalstammEintrag>;
  /** Vertragsschluessel → Person, an der der bekannte Vertrag vor dem Lauf haengt, und sein Beginn. */
  vertragVorher: Map<string, { personId: string; beginn: Kalendertag | null }>;
  /** Adresse → Namen („vorname|nachname") aller lesbaren Zeilen mit dieser Adresse, auch fehlerhafter. */
  namenJeAdresse: Map<string, Set<string>>;
  /** Adresse → Personen mit dieser Adresse; im Lauf um angelegte Personen ergaenzt. */
  personenJeAdresse: Map<string, string[]>;
  /** Person → Schluessel ihrer laufenden verwalteten Vertraege vor dem Lauf. */
  laufendVorher: Map<string, string[]>;
  /** Adresse → Namen laufender Zeilen, die wegen eines Zweifelsfalls niemandem zugeordnet wurden. */
  offeneLaufende: Map<string, Set<string>>;
}

interface Rahmen {
  jetzt: Date;
  heute: Kalendertag;
  stapel: Stapel;
}

/** Eine Zeile in ihrer Transaktion. */
interface Vorgang {
  tx: Db;
  e: PersonalstammEintrag;
  vertrag: Vertrag | null;
  organizationId: string;
  laeuft: boolean;
  rahmen: Rahmen;
}

interface Protokolleintrag {
  action: string;
  details: Prisma.InputJsonObject;
}

/** Ergebnis einer Zeile, bevor es gezaehlt wird. */
interface Ausgang {
  status: PersonalstammZeilenstatus;
  code?: PersonalstammGrundcode;
  feld?: string;
  /** Im Zweifels- oder Fehlerfall trotzdem etwas geaendert — zaehlt zusaetzlich als „aktualisiert". */
  aufgefrischt?: boolean;
  /** Personen, die einen Vertrag bekommen, verloren oder aufgefrischt haben. */
  betroffen?: string[];
  /** In der Zeile angelegte Person — erst nach dem Commit ins Verzeichnis. */
  neuePerson?: { id: string; email: string };
  /** Laufende Zeile, die wegen eines Zweifelsfalls niemandem zugeordnet wurde. */
  offeneAdresse?: string;
}

/** Rein: laeuft der Vertrag am Kalendertag `heute`? (`vertragsende` = letzter Arbeitstag, `YYYY-MM-DD`) */
export function vertragLaeuft(vertragsende: string | null, heute: string): boolean {
  return vertragsende === null || vertragsende >= heute;
}

/** Ende des vorigen Aufrufs — der naechste beginnt erst danach (siehe Kopfkommentar). */
let vorigerLauf: Promise<unknown> = Promise.resolve();

export function personalstammAbgleichen(
  eintraege: unknown[],
  opts: { jetzt?: Date } = {},
): Promise<PersonalstammStapelErgebnis> {
  const lauf = vorigerLauf.then(() => stapelAbgleichen(eintraege, opts));
  vorigerLauf = lauf.catch(() => undefined);
  return lauf;
}

async function stapelAbgleichen(eintraege: unknown[], opts: { jetzt?: Date }): Promise<PersonalstammStapelErgebnis> {
  const jetzt = opts.jetzt ?? new Date();
  const heute = heuteInBerlin(jetzt);
  const zahlen: PersonalstammZahlen = {
    zeilen: eintraege.length,
    angelegt: 0,
    aktualisiert: 0,
    unveraendert: 0,
    uebersprungen: 0,
    stillgelegt: 0,
    reaktiviert: 0,
    zweifelsfall: 0,
    fehler: 0,
  };
  const results: PersonalstammZeilenErgebnis[] = [];
  const personenMeldungen: { schluessel: string; code: PersonalstammGrundcode }[] = [];

  let vorlauf: Awaited<ReturnType<typeof stapelLesen>> | undefined;
  try {
    vorlauf = await stapelLesen(eintraege, heute);
  } catch (err) {
    console.error("[Personalstamm] Vorlauf fehlgeschlagen:", fehlerKennung(err));
  }

  if (!vorlauf) {
    eintraege.forEach((raw, index) =>
      results.push({ index, status: "fehler", schluessel: schluesselAusRohzeile(raw) ?? undefined, code: "INTERNER_FEHLER" }),
    );
  } else {
    results.push(...vorlauf.abgewiesen);
    const rahmen: Rahmen = { jetzt, heute, stapel: vorlauf.stapel };
    const betroffen = new Set<string>();

    // Sequenziell, kein Promise.all (siehe Kopfkommentar).
    for (const zeile of vorlauf.zeilen) {
      let ausgang: Ausgang;
      try {
        ausgang = await prisma.$transaction((tx) => zeileAbgleichen(tx, zeile, rahmen));
      } catch (err) {
        // Nur Index und Kennung — das Fehlerobjekt kann Datenwerte tragen.
        console.error(`[Personalstamm] Zeile ${zeile.index} fehlgeschlagen:`, fehlerKennung(err));
        ausgang = { status: "fehler", code: "INTERNER_FEHLER" };
      }
      // Erst nach dem Commit nachfuehren — eine zurueckgerollte Zeile hinterlaesst nichts.
      ausgang.betroffen?.forEach((id) => betroffen.add(id));
      if (ausgang.neuePerson) rahmen.stapel.personenJeAdresse.set(ausgang.neuePerson.email, [ausgang.neuePerson.id]);
      if (ausgang.offeneAdresse) {
        const name = nameNormal(zeile.eintrag.vorname, zeile.eintrag.nachname);
        mengeErgaenzen(rahmen.stapel.offeneLaufende, ausgang.offeneAdresse, name);
      }
      // Wer ueber seine Adresse im Stapel steht, wird neu bewertet — auch wenn seine eigene Zeile
      // nicht mehr kommt (so endet ein Schutz vor Stilllegung mit seinem Grund).
      const { email } = zeile.eintrag;
      if (email) rahmen.stapel.personenJeAdresse.get(email)?.forEach((id) => betroffen.add(id));
      if (ausgang.aufgefrischt) zahlen.aktualisiert++;
      results.push({
        index: zeile.index,
        status: ausgang.status,
        schluessel: vertragsSchluessel(zeile.eintrag),
        code: ausgang.code,
        feld: ausgang.feld,
      });
    }

    // Aktiv-Status einmal je Person am Ende — so flattert er innerhalb eines Stapels nicht.
    for (const personId of betroffen) {
      try {
        const wechsel = await aktivStatusAbgleichen(personId, rahmen);
        if (wechsel) zahlen[wechsel]++;
      } catch (err) {
        console.error("[Personalstamm] Aktiv-Status fehlgeschlagen:", fehlerKennung(err));
        zahlen.fehler++;
        personenMeldungen.push({ schluessel: "person", code: "INTERNER_FEHLER" });
      }
    }
  }

  results.sort((a, b) => a.index - b.index);
  for (const r of results) zahlen[r.status]++;

  // Nur Schluessel und Grundcode — keine Namen, keine Adressen.
  const meldungen = [
    ...results.flatMap((r) => (r.code ? [{ schluessel: r.schluessel ?? `zeile:${r.index}`, code: r.code }] : [])),
    ...personenMeldungen,
  ];
  await laufProtokollieren(zahlen, meldungen);

  return { success: zahlen.fehler === 0, summary: zahlen, results };
}

/** Genau ein Lauf-Eintrag je Aufruf; scheitert er, ein zweiter nur mit den Zahlen. Wirft nie. */
async function laufProtokollieren(
  zahlen: PersonalstammZahlen,
  meldungen: { schluessel: string; code: PersonalstammGrundcode }[],
): Promise<void> {
  for (const details of [{ zahlen: { ...zahlen }, meldungen }, { zahlen: { ...zahlen } }]) {
    try {
      await prisma.auditLog.create({
        data: { userId: null, processType: PERSONALSTAMM_PROCESS_TYPE, action: PERSONALSTAMM_ACTIONS.LAUF, details },
      });
      return;
    } catch (err) {
      console.error("[Personalstamm] Lauf-Protokoll fehlgeschlagen:", fehlerKennung(err));
    }
  }
}

/**
 * Vorlauf: jede Rohzeile pruefen und locker lesen, doppelte Schluessel
 * abweisen; aus der Datenbank das Personenverzeichnis nach Adresse, die
 * bekannten Vertraege und die laufenden Vertraege der Personen mit einer
 * Adresse des Stapels — alles vor der ersten Zeile.
 */
async function stapelLesen(
  eintraege: unknown[],
  heute: Kalendertag,
): Promise<{ stapel: Stapel; zeilen: Zeile[]; abgewiesen: PersonalstammZeilenErgebnis[] }> {
  const stapel: Stapel = {
    zeileJeSchluessel: new Map(),
    vertragVorher: new Map(),
    namenJeAdresse: new Map(),
    personenJeAdresse: new Map(),
    laufendVorher: new Map(),
    offeneLaufende: new Map(),
  };

  const geprueft = eintraege.map((raw, index) => ({ index, pruefung: zeilePruefen(raw), locker: lockerLesen(raw) }));
  // Aus ALLEN lesbaren Zeilen: Eine Zeile mit Formatfehler darf weder die Sperre fuer geteilte
  // Adressen noch die fuer doppelte Schluessel umgehen.
  const anzahl = new Map<string, number>();
  for (const { locker } of geprueft) {
    if (locker.email) mengeErgaenzen(stapel.namenJeAdresse, locker.email, locker.name);
    if (locker.schluessel) anzahl.set(locker.schluessel, (anzahl.get(locker.schluessel) ?? 0) + 1);
  }

  const abgewiesen: PersonalstammZeilenErgebnis[] = [];
  const zeilen: Zeile[] = [];
  for (const { index, pruefung, locker } of geprueft) {
    const schluessel = locker.schluessel ?? undefined;
    if (schluessel && anzahl.get(schluessel)! > 1) {
      // Zwei Zeilen fuer einen Vertrag: Welche gilt, ist nicht zu entscheiden — keine wird verarbeitet.
      abgewiesen.push({ index, status: "fehler", schluessel, code: "FORMATFEHLER", feld: "schluessel" });
    } else if ("feld" in pruefung) {
      abgewiesen.push({ index, status: "fehler", schluessel, code: "FORMATFEHLER", feld: pruefung.feld });
    } else {
      zeilen.push({ index, ...pruefung });
      stapel.zeileJeSchluessel.set(vertragsSchluessel(pruefung.eintrag), pruefung.eintrag);
    }
  }
  if (zeilen.length === 0) return { stapel, zeilen, abgewiesen };

  // Personenverzeichnis: Adresse (getrimmt, klein) → Personen. Kein ILIKE.
  const personen = await prisma.employee.findMany({
    where: { email: { not: null } },
    select: { id: true, email: true },
  });
  for (const p of personen) {
    const adresse = adresseNormal(p.email);
    if (adresse) stapel.personenJeAdresse.set(adresse, [...(stapel.personenJeAdresse.get(adresse) ?? []), p.id]);
  }

  const schluesselVon = (v: { mandantNumber: string | null; abrechnungskreis: string | null; personalNumber: string | null }) =>
    vertragsSchluessel({
      mandantNummer: v.mandantNumber ?? "",
      abrechnungskreis: v.abrechnungskreis ?? "",
      personalNr: v.personalNumber ?? "",
    });
  const felder = { employeeId: true, mandantNumber: true, abrechnungskreis: true, personalNumber: true } as const;

  const kandidaten = await prisma.employment.findMany({
    where: { personalNumber: { in: [...new Set(zeilen.map((z) => z.eintrag.personalNr))] }, abrechnungskreis: { not: null } },
    select: { ...felder, startDate: true },
  });
  for (const v of kandidaten) {
    const schluessel = schluesselVon(v);
    if (stapel.zeileJeSchluessel.has(schluessel)) {
      stapel.vertragVorher.set(schluessel, { personId: v.employeeId, beginn: ablaufKalendertag(v.startDate) });
    }
  }

  const ids = new Set(zeilen.flatMap((z) => (z.eintrag.email ? (stapel.personenJeAdresse.get(z.eintrag.email) ?? []) : [])));
  if (ids.size > 0) {
    const laufende = await prisma.employment.findMany({
      where: { employeeId: { in: [...ids] }, ...VERWALTET, ...laeuftAm(heute) },
      select: felder,
    });
    for (const v of laufende) {
      stapel.laufendVorher.set(v.employeeId, [...(stapel.laufendVorher.get(v.employeeId) ?? []), schluesselVon(v)]);
    }
  }

  // Bekannte zuerst: Ihre Zeile legt bei neuer Adresse die Person an, an die
  // neue Vertraege derselben Adresse danach anschliessen.
  const istBekannt = (z: Zeile) => stapel.vertragVorher.has(vertragsSchluessel(z.eintrag));
  return { stapel, zeilen: [...zeilen.filter(istBekannt), ...zeilen.filter((z) => !istBekannt(z))], abgewiesen };
}

/**
 * Zod-Pruefung einer Rohzeile. Scheitert NUR die Adresse, bleibt der Vertrag
 * lesbar (ohne Adresse, mit Kennzeichen): Das Vertragsende einer Kuendigung
 * muss auch dann ankommen.
 */
function zeilePruefen(
  raw: unknown,
): { eintrag: PersonalstammEintrag; adresseUngueltig: boolean } | { feld: string | undefined } {
  const geprueft = personalstammEintragSchema.safeParse(raw);
  if (geprueft.success) return { eintrag: geprueft.data, adresseUngueltig: false };
  const { issues } = geprueft.error;
  if (issues.every((i) => i.path[0] === "email")) {
    const ohneAdresse = personalstammEintragSchema.safeParse({ ...(raw as object), email: null });
    if (ohneAdresse.success) return { eintrag: ohneAdresse.data, adresseUngueltig: true };
  }
  return { feld: issues[0]?.path.join(".") || undefined };
}

/** Locker gelesen, auch aus einer Zeile mit Formatfehler: Schluessel, Adresse und Name, soweit lesbar. */
function lockerLesen(raw: unknown): { schluessel: string | null; email: string | null; name: string } {
  const r = raw !== null && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return { schluessel: schluesselAusRohzeile(raw), email: adresseNormal(r.email), name: nameNormal(r.vorname, r.nachname) };
}

/** Eine gueltige oder nur in der Adresse ungueltige Zeile in ihrer Transaktion (V2). */
async function zeileAbgleichen(tx: Db, zeile: Zeile, rahmen: Rahmen): Promise<Ausgang> {
  const e = zeile.eintrag;
  const organisation = await tx.organization.findUnique({
    where: { mandantNumber: e.mandantNummer },
    select: { id: true },
  });
  if (!organisation) return { status: "fehler", code: "MANDANT_UNBEKANNT" };

  const vertrag = await tx.employment.findUnique({
    where: {
      mandantNumber_abrechnungskreis_personalNumber: {
        mandantNumber: e.mandantNummer,
        abrechnungskreis: e.abrechnungskreis,
        personalNumber: e.personalNr,
      },
    },
    select: VERTRAG_FELDER,
  });
  const v: Vorgang = {
    tx,
    e,
    vertrag,
    organizationId: organisation.id,
    laeuft: vertragLaeuft(e.vertragsende, rahmen.heute),
    rahmen,
  };

  if (zeile.adresseUngueltig) return nurAuffrischen(v, "FORMATFEHLER");
  // Ein beendeter Vertrag, den das Portal nie kannte, wird nicht angelegt.
  if (!vertrag && !v.laeuft) return { status: "uebersprungen" };
  // Ohne Adresse keine Zuordnung — der Name fuehrt nie zusammen.
  if (e.email === null) return nurAuffrischen(v, "MAIL_FEHLT");

  const adresse = e.email;
  // Eine Adresse mit mehreren Namen im Stapel kann ein geteiltes Postfach sein.
  if ((rahmen.stapel.namenJeAdresse.get(adresse)?.size ?? 0) > 1) return nurAuffrischen(v, "EMAIL_ANDERER_NAME", adresse);

  const ids = rahmen.stapel.personenJeAdresse.get(adresse) ?? [];
  if (ids.length > 1) return nurAuffrischen(v, "EMAIL_MEHRDEUTIG", adresse);
  if (ids.length === 0) return v.laeuft ? neuePersonAnlegen(v, adresse) : nurAuffrischen(v);

  const person = await tx.employee.findUnique({ where: { id: ids[0] }, select: PERSON_FELDER });
  if (!person) throw new Error("Person aus dem Verzeichnis fehlt");
  if (person.importSource === IMPORT_QUELLE_MANUELL) return nurAuffrischen(v, "MANUELLER_DATENSATZ", adresse);
  if (!vomAbgleichGefuehrt(person.importSource)) return nurAuffrischen(v, "FREMDE_QUELLE", adresse);

  // Anderer Name: nur im Konsens und nur ein neuer Vor- ODER Nachname (Heirat), oder als
  // Anschluss nach dem Ende mit Nachweis; sonst gehoert die Adresse vermutlich einem anderen
  // Menschen (Altbestand: nie).
  const umbenennen = !gleicherName(person, e);
  const umbenennenErlaubt =
    umbenennen &&
    ((person.importSource === PERSONALSTAMM_QUELLE &&
      namensteilBleibt(person, e) &&
      imKonsens(rahmen.stapel, person.id, adresse)) ||
      anschlussNachEnde(v, person, adresse));
  if (umbenennen && !umbenennenErlaubt) return nurAuffrischen(v, "EMAIL_ANDERER_NAME", adresse);
  // Ein beendeter Vertrag einer anderen Person bleibt, wo er ist.
  if (vertrag && vertrag.employeeId !== person.id && !v.laeuft) return nurAuffrischen(v);
  return zurPerson(v, person, umbenennen);
}

/**
 * Konsens fuer das Umbenennen: Die Person hatte vor dem Lauf mindestens einen
 * laufenden verwalteten Vertrag, und jeder davon kommt im Stapel mit ihrer
 * Adresse (deren Zeilen tragen alle denselben Namen) und seinem gespeicherten
 * Beginn — nennt die Zeile einen anderen, ist der Schluessel vermutlich neu
 * vergeben (anderer Mensch). Steht die Zeile im Stapel, kennt `vertragVorher`
 * den Vertrag (gleicher Schluessel, gleiche MANR); fehlt er dort, kein Konsens.
 */
function imKonsens(stapel: Stapel, personId: string, adresse: string): boolean {
  const laufende = stapel.laufendVorher.get(personId) ?? [];
  return (
    laufende.length > 0 &&
    laufende.every((k) => {
      const z = stapel.zeileJeSchluessel.get(k);
      return z?.email === adresse && z.vertragsbeginn === stapel.vertragVorher.get(k)?.beginn;
    })
  );
}

/**
 * Anschluss nach dem Ende (Entscheidungen R2 und F vom 17.10.2026): Die
 * DokuBit-Person hat vor dem Lauf keinen laufenden verwalteten Vertrag, der
 * Vorname bleibt (Heirat aendert den Nachnamen), die Zeile laeuft — und als
 * Nachweis steht im Stapel unter derselben Adresse die Zeile eines ihrer
 * Vertraege, die ihn hoechstens PERSONALSTAMM_ANSCHLUSS_TAGE vor heute enden
 * laesst. Weil vorher geprueft ist, dass alle Zeilen der Adresse denselben
 * Namen tragen, nennt DokuBit den neuen Namen damit auch am alten Vertrag.
 * Die Zeile muss den gespeicherten Beginn nennen: Mit anderem Beginn ist der
 * Schluessel neu vergeben, die Zeile beschreibt den Vertrag eines anderen
 * Menschen (einen Beginn aendert kein Zweifel, siehe `vertragsAenderung`).
 * Das Ende steht in dieser Zeile (`vertragsende` ist autoritativ und kommt im
 * Zweifel immer an): Gelesen werden nur Stapel und Stand vor dem Lauf, die
 * Reihenfolge der Zeilen spielt keine Rolle.
 */
function anschlussNachEnde(v: Vorgang, person: Person, adresse: string): boolean {
  const { stapel, heute } = v.rahmen;
  if (
    !v.laeuft ||
    person.importSource !== PERSONALSTAMM_QUELLE ||
    textNormal(person.firstName) !== textNormal(v.e.vorname) ||
    stapel.laufendVorher.has(person.id)
  ) {
    return false;
  }
  const grenze = tageSpaeter(heute, -PERSONALSTAMM_ANSCHLUSS_TAGE);
  return [...stapel.zeileJeSchluessel].some(([schluessel, z]) => {
    const vorher = stapel.vertragVorher.get(schluessel);
    return (
      vorher?.personId === person.id &&
      vorher.beginn === z.vertragsbeginn &&
      z.email === adresse &&
      z.vertragsende !== null &&
      z.vertragsende >= grenze &&
      z.vertragsende < heute
    );
  });
}

/**
 * Einen bekannten Vertrag nur auffrischen — er bleibt bei seiner Person, kein
 * Name wird geaendert. Mit `code` ein Zweifelsfall (FORMATFEHLER: Fehler); mit
 * `adresse` steht eine laufende Zeile ohne Zuordnung fuer den Schutz vor
 * falscher Stilllegung. Ein unbekannter Vertrag bleibt unangetastet.
 *
 * Ein Zweifel verschafft nie Zugang (P2): Laeuft die Zeile, der gespeicherte
 * Vertrag aber nicht (E3), bleibt er, wie er ist — kein Reaktivieren, kein
 * neues Ende, keine Stunden. Sonst aendert ein Zweifel nur, was keinen Zugang
 * verschafft (`vertragsAenderung`); ein Ende kommt immer an. Ohne `code`
 * laeuft die Zeile nie, dort greift das nicht.
 */
async function nurAuffrischen(v: Vorgang, code?: PersonalstammGrundcode, adresse?: string): Promise<Ausgang> {
  const status = code === undefined ? undefined : code === "FORMATFEHLER" ? "fehler" : "zweifelsfall";
  const feld = code === "FORMATFEHLER" ? "email" : undefined;
  const offeneAdresse = v.laeuft ? adresse : undefined;
  if (!v.vertrag) return { status: status ?? "unveraendert", code, feld, offeneAdresse };

  const personId = v.vertrag.employeeId;
  const gespeichertLaufend = v.vertrag.isActive && vertragLaeuft(ablaufKalendertag(v.vertrag.endDate), v.rahmen.heute);
  if (v.laeuft && !gespeichertLaufend) return { status: status ?? "unveraendert", code, feld, betroffen: [personId], offeneAdresse };
  const aufgefrischt = await vertragSchreiben(v, v.vertrag, personId, code !== undefined);
  await lastSyncSetzen(v.tx, personId, v.rahmen.jetzt);
  if (status) return { status, code, feld, aufgefrischt, betroffen: [personId], offeneAdresse };
  return { status: aufgefrischt ? "aktualisiert" : "unveraendert", betroffen: [personId] };
}

/** Niemand hat die Adresse, die Zeile laeuft: Person anlegen; ein bekannter Vertrag wandert zu ihr. */
async function neuePersonAnlegen(v: Vorgang, adresse: string): Promise<Ausgang> {
  const neu = await v.tx.employee.create({
    data: {
      firstName: v.e.vorname,
      lastName: v.e.nachname,
      email: adresse,
      importSource: PERSONALSTAMM_QUELLE,
      importedAt: v.rahmen.jetzt,
      lastSyncAt: v.rahmen.jetzt,
    },
    select: { id: true },
  });
  const neuePerson = { id: neu.id, email: adresse };
  if (!v.vertrag) {
    await vertragAnlegen(v, neu.id);
    return { status: "angelegt", betroffen: [neu.id], neuePerson };
  }
  await vertragSchreiben(v, v.vertrag, neu.id);
  return { status: "aktualisiert", betroffen: [v.vertrag.employeeId, neu.id], neuePerson };
}

/**
 * Genau eine Person mit der Adresse, DokuBit oder Altbestand mit gleichem
 * Namen: Altbestand uebernehmen, im Konsens oder als Anschluss umbenennen,
 * dann den Vertrag bei ihr anlegen, auffrischen oder zu ihr umhaengen.
 */
async function zurPerson(v: Vorgang, person: Person, umbenennen: boolean): Promise<Ausgang> {
  const aenderung: Prisma.EmployeeUpdateInput = {};
  const protokoll: Protokolleintrag[] = [];
  if (person.importSource === null) {
    // Altbestand: ab jetzt vom Abgleich verwaltet.
    aenderung.importSource = PERSONALSTAMM_QUELLE;
    if (!person.importedAt) aenderung.importedAt = v.rahmen.jetzt;
    protokoll.push({ action: PERSONALSTAMM_ACTIONS.PERSON_UEBERNOMMEN, details: { employeeId: person.id } });
  }
  if (umbenennen) {
    aenderung.firstName = v.e.vorname;
    aenderung.lastName = v.e.nachname;
    // Ohne Namen: das Protokoll soll keine Personendaten sammeln.
    protokoll.push({ action: PERSONALSTAMM_ACTIONS.NAME_GEAENDERT, details: { employeeId: person.id } });
  }
  await v.tx.employee.update({
    where: { id: person.id },
    data: { ...aenderung, lastSyncAt: v.rahmen.jetzt },
    select: { id: true }, // nicht die ganze Zeile zuruecklesen (personalNumber)
  });
  await protokollieren(v.tx, protokoll);

  if (!v.vertrag) {
    await vertragAnlegen(v, person.id);
    return { status: "angelegt", betroffen: [person.id] };
  }
  const vertragGeaendert = await vertragSchreiben(v, v.vertrag, person.id);
  const geaendert = vertragGeaendert || Object.keys(aenderung).length > 0;
  return { status: geaendert ? "aktualisiert" : "unveraendert", betroffen: [v.vertrag.employeeId, person.id] };
}

/**
 * Den Vertrag auffrischen (`zweifel`: nur so weit, wie P2 erlaubt) und, wenn
 * `employeeId` eine andere Person ist, zu ihr umhaengen (Eintrag
 * VERTRAG_UMGEZOGEN, ohne Namen und Adressen). true = etwas geaendert.
 */
async function vertragSchreiben(v: Vorgang, vertrag: Vertrag, employeeId: string, zweifel = false): Promise<boolean> {
  const aenderung = vertragsAenderung(vertrag, v, zweifel);
  if (employeeId !== vertrag.employeeId) aenderung.employeeId = employeeId;
  if (Object.keys(aenderung).length === 0) return false;

  await v.tx.employment.update({ where: { id: vertrag.id }, data: aenderung });
  if (aenderung.employeeId) {
    await protokollieren(v.tx, [
      {
        action: PERSONALSTAMM_ACTIONS.VERTRAG_UMGEZOGEN,
        details: { schluessel: vertragsSchluessel(v.e), vonEmployeeId: vertrag.employeeId, nachEmployeeId: employeeId },
      },
    ]);
  }
  return true;
}

/** `lastSyncAt` der Person, an der der Vertrag haengt — nicht bei Hand- oder Fremdquelle. */
async function lastSyncSetzen(tx: Db, personId: string, jetzt: Date): Promise<void> {
  const person = await tx.employee.findUnique({ where: { id: personId }, select: { importSource: true } });
  if (!person) throw new Error("Person zum Vertrag fehlt");
  if (!vomAbgleichGefuehrt(person.importSource)) return;
  await tx.employee.update({ where: { id: personId }, data: { lastSyncAt: jetzt }, select: { id: true } });
}

async function vertragAnlegen(v: Vorgang, employeeId: string): Promise<void> {
  await v.tx.employment.create({
    data: {
      employeeId,
      organizationId: v.organizationId,
      mandantNumber: v.e.mandantNummer,
      abrechnungskreis: v.e.abrechnungskreis,
      personalNumber: v.e.personalNr,
      startDate: kalendertagAlsDatum(v.e.vertragsbeginn),
      endDate: v.e.vertragsende === null ? null : kalendertagAlsDatum(v.e.vertragsende),
      workingHoursWeek: v.e.teilzeitstunden,
      isActive: v.laeuft,
    },
  });
}

/**
 * Nur die Felder, die sich wirklich aendern — sonst bliebe „unveraendert" nie
 * stehen. `mandantNumber` ist Teil des Schluessels, ueber den der Vertrag
 * gefunden wurde, und kann sich hier nicht aendern.
 *
 * Im Zweifel (P2) nur, was keinen Zugang verschafft: Beendet die Zeile den
 * Vertrag, nur Ende und Aktiv-Stand. Laeuft sie (dann laeuft auch der
 * gespeicherte, siehe `nurAuffrischen`), die Stunden und ein frueheres Ende,
 * nie ein spaeteres oder leeres — sonst hielte ein neu vergebener Schluessel
 * die Vorgaengerin ueber ihr Ende hinaus aktiv. Den Beginn aendert ein Zweifel
 * nie: An ihm erkennen `anschlussNachEnde` und `imKonsens` den alten Vertrag.
 * Mit anderem Beginn beschreibt die Zeile vermutlich den Vertrag eines
 * anderen Menschen: dann auch keine Stunden und keine Organisation.
 */
function vertragsAenderung(vertrag: Vertrag, v: Vorgang, zweifel = false): Prisma.EmploymentUncheckedUpdateInput {
  const { e } = v;
  const aenderung: Prisma.EmploymentUncheckedUpdateInput = {};
  if (vertrag.isActive !== v.laeuft) aenderung.isActive = v.laeuft;
  if (!zweifel && ablaufKalendertag(vertrag.startDate) !== e.vertragsbeginn) {
    aenderung.startDate = kalendertagAlsDatum(e.vertragsbeginn);
  }
  // Autoritativ: null (unbefristet) ueberschreibt ein vorhandenes Ende — im Zweifel nie verlaengern.
  const ende = ablaufKalendertag(vertrag.endDate);
  const verlaengert = e.vertragsende === null || (ende !== null && e.vertragsende > ende);
  if (ende !== e.vertragsende && !(zweifel && v.laeuft && verlaengert)) {
    aenderung.endDate = e.vertragsende === null ? null : kalendertagAlsDatum(e.vertragsende);
  }
  if (zweifel && (!v.laeuft || ablaufKalendertag(vertrag.startDate) !== e.vertragsbeginn)) return aenderung;
  // Leere Stunden loeschen nichts.
  if (e.teilzeitstunden !== null && vertrag.workingHoursWeek !== e.teilzeitstunden) {
    aenderung.workingHoursWeek = e.teilzeitstunden;
  }
  if (vertrag.organizationId !== v.organizationId) aenderung.organizationId = v.organizationId;
  return aenderung;
}

/**
 * Aktiv-Status einer betroffenen Person nach E3, einmal am Ende des Stapels;
 * nur fuer DokuBit-Personen. Nicht stillgelegt wird, wessen Adresse und Name
 * im Stapel bei einer laufenden, wegen eines Zweifelsfalls nicht zugeordneten
 * Zeile standen — ihr eigener Anschluss; die Zeile ist schon gemeldet. Die
 * Zeile eines anderen Namens mit derselben Adresse (Nachfolger, geteiltes
 * Postfach) schuetzt nicht. Schreiben in eigener Transaktion.
 */
async function aktivStatusAbgleichen(personId: string, rahmen: Rahmen): Promise<Wechsel | undefined> {
  const person = await prisma.employee.findUnique({
    where: { id: personId },
    select: { email: true, firstName: true, lastName: true, importSource: true, isActive: true },
  });
  if (person?.importSource !== PERSONALSTAMM_QUELLE) return undefined;

  const laufende = await prisma.employment.count({
    where: { employeeId: personId, ...VERWALTET, ...laeuftAm(rahmen.heute) },
  });
  const sollAktiv = laufende > 0;
  if (sollAktiv === person.isActive) return undefined;
  const adresse = adresseNormal(person.email);
  const eigeneOffen = adresse && rahmen.stapel.offeneLaufende.get(adresse)?.has(nameNormal(person.firstName, person.lastName));
  if (!sollAktiv && eigeneOffen) return undefined;

  await prisma.$transaction(async (tx) => {
    await tx.employee.update({ where: { id: personId }, data: { isActive: sollAktiv }, select: { id: true } });
    await protokollieren(tx, [
      {
        action: sollAktiv ? PERSONALSTAMM_ACTIONS.REAKTIVIERT : PERSONALSTAMM_ACTIONS.STILLGELEGT,
        details: { employeeId: personId },
      },
    ]);
  });
  return sollAktiv ? "reaktiviert" : "stillgelegt";
}

async function protokollieren(tx: Db, eintraege: Protokolleintrag[]): Promise<void> {
  for (const eintrag of eintraege) {
    await tx.auditLog.create({
      data: { userId: null, processType: PERSONALSTAMM_PROCESS_TYPE, action: eintrag.action, details: eintrag.details },
    });
  }
}

/** Vom Abgleich gefuehrt: DokuBit oder Altbestand (Quelle leer). */
function vomAbgleichGefuehrt(quelle: string | null): boolean {
  return quelle === null || quelle === PERSONALSTAMM_QUELLE;
}

/** Vergleichsform einer Adresse: getrimmt, klein; leer oder kein Text → null. */
function adresseNormal(email: unknown): string | null {
  return (typeof email === "string" && email.trim().toLowerCase()) || null;
}

/** Vergleichsform eines Namensteils: getrimmt, klein; kein Text → "". */
function textNormal(wert: unknown): string {
  return typeof wert === "string" ? wert.trim().toLowerCase() : "";
}

/** Vergleichsform eines Namens: „vorname|nachname", getrimmt, klein. */
function nameNormal(vorname: unknown, nachname: unknown): string {
  return `${textNormal(vorname)}|${textNormal(nachname)}`;
}

function gleicherName(person: Pick<Person, "firstName" | "lastName">, e: PersonalstammEintrag): boolean {
  return nameNormal(person.firstName, person.lastName) === nameNormal(e.vorname, e.nachname);
}

/** Vor- oder Nachname bleibt (Heirat: neuer Nachname) — ein ganz anderer Name ist ein anderer Mensch. */
function namensteilBleibt(person: Pick<Person, "firstName" | "lastName">, e: PersonalstammEintrag): boolean {
  return textNormal(person.firstName) === textNormal(e.vorname) || textNormal(person.lastName) === textNormal(e.nachname);
}

function mengeErgaenzen(map: Map<string, Set<string>>, schluessel: string, wert: string): void {
  if (!map.has(schluessel)) map.set(schluessel, new Set());
  map.get(schluessel)!.add(wert);
}
