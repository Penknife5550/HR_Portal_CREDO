/**
 * CREDO HR-Portal – Ausstattung & Zugaenge, Stufe 2 (Paket A4): Ausgaben in
 * der Karte „Ausstattung & Zugänge“ (HR, Feinplan A4 G7, S24)
 *
 *   ausgabenAktionAusfuehren   POST /api/onboarding/[id]/ausgaben (nur HR_EDIT_ROLES)
 *
 * HR traegt nach und tauscht – auch nach dem Abschluss (COMPLETED) und nach
 * der Absage (EXPIRED): Plan „Übergabe erst nach Abschluss → HR trägt nach“,
 * E-A30 „ergänzen und tauschen“. Die Aktionen (`ausgabenAktionSchema`):
 *
 *   vermerken        { checklistItemId, stuecke }   1 bis 10 Stueck an einer Ausstattungsaufgabe
 *   korrigieren      { ausgabeId, kennung?, uebergebenAm? }
 *   tauschen         { ausgabeId, grund: DEFEKT|VERLOREN, neu }
 *   zurueckgenommen  { ausgabeId, zustand: ZURUECK|BESCHAEDIGT|FEHLT }  ohne Austritt
 *   entfernen        { ausgabeId }                   irrtuemlich vermerkt
 *
 * Regeln, die beim Aendern gelten muessen:
 *   1. Pruefreihenfolge: 403 (nicht HR_EDIT_ROLES – auch nie SERVICE) → Zod
 *      400 → 404 (Vorgang unbekannt ODER fremder Mandant, derselbe Text) →
 *      in der Transaktion 404 (Aufgabe bzw. Ausgabe unbekannt oder aus einem
 *      anderen Vorgang) → 409 KEINE_AUSGABE / AUFGABE_ENTFAELLT /
 *      AUSGABE_IM_AUSTRITT / NICHT_AUSGEGEBEN bzw. 400 (`vermerkPruefen`).
 *   2. Bei JEDEM Status (`vorgangSperrenIn` mit `auch: COMPLETED, EXPIRED`),
 *      ohne Versandsperre, ohne Aenderungsliste (R10: der Ausgabevermerk ist
 *      kein Inhaltsfeld), ohne Mail.
 *   3. Sperrreihenfolge (G24): Onboarding → Ausgaben (nach `id`). Erst NACH
 *      der Sperre der Ausgabe werden Zustand und Austrittsbezug gelesen; ist
 *      das Stueck an einen Austritt gebunden (G28: laufend immer, abgeschlossen
 *      ausser VERBLEIBT, abgebrochen nie), aendert es nur der Austritt → 409
 *      AUSGABE_IM_AUSTRITT, die Vorgangsnummer nur bei Zugriff auf ihn. Kein
 *      Onboarding-Weg sperrt oder schreibt eine Offboarding-Zeile.
 *   4. Geschrieben wird `ausgaben` nur ueber src/lib/ausgaben-schreiben.ts (G3);
 *      jeder Zustand kommt mit seiner Loeschfrist (`ausgabeZustandDaten`).
 *      Ist die Einstellung abgesagt (EXPIRED), bekommt auch ein danach
 *      vermerktes oder eingetauschtes Stueck die Frist der Absage (G10: drei
 *      Jahre ab Ende des Jahres von `expiredAt`) – Status und `expiredAt`
 *      werden dafuer NACH der Sperre des Vorgangs gelesen (`absageZeitpunktIn`).
 *   4a. Getauscht werden nur Gegenstaende (RUECKGABE): Ein Zugang (SPERREN)
 *      wird gesperrt und neu eingerichtet → 400 `ZUGANG_KEIN_TAUSCH`; sonst
 *      setzte „verloren“ ihn auf FEHLT, was „zurückgenommen“ ausschliesst.
 *   5. Ein verlorener Schluessel ohne Austritt (Tausch VERLOREN,
 *      „zurückgenommen“ FEHLT bei Kategorie SCHLUESSEL) erzeugt KEINE Aufgabe:
 *      Die Antwort traegt `meldung` = „Bitte die Gebäudewirtschaft wegen der
 *      Schließung informieren.“ (bei COMPLETED/EXPIRED erreichte eine Aufgabe
 *      die Stelle nicht mehr).
 *   6. Protokoll ohne Inhalte (G22): IDs, Zustaende, Stellen-Schluessel,
 *      Anzahlen – die Kennung nur als `mitKennung`, nie im Wortlaut.
 *   7. Die Antwort ist die neue Uebersicht der Karte (`ausstattungUebersichtLaden`).
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { canAccessProcess, HR_EDIT_ROLES, type SessionPayload } from "@/lib/permissions";
import { MELDUNGEN as ABTEILUNGS_MELDUNGEN, type DienstAntwort } from "@/lib/abteilungsaufgaben";
import { vorgangSperrenIn } from "@/lib/abteilungsaufgaben-onboarding";
import { ausstattungUebersichtLaden } from "@/lib/ausstattung-dienst";
import {
  AUSGABE_AKTIV,
  AUSGABEN_AUDIT,
  MELDUNGEN_AUSGABEN,
  ausgabeBasis,
  ausgabeKalendertag,
  ausgabeZustandLabel,
  bindenderAustritt,
  vermerkPruefen,
  vermerkStuecke,
  vermerkZielGrund,
  type VermerkGrund,
} from "@/lib/ausgaben";
import {
  ausgabeEntfernenIn,
  ausgabeKorrigierenIn,
  ausgabeTauschenIn,
  ausgabeZustandIn,
  ausgabenAnlegenIn,
  ausgabenSperrenIn,
} from "@/lib/ausgaben-schreiben";
import {
  aktiveAusgabenZaehlen,
  ausgabeLaden,
  austrittsBezuegeLaden,
  vermerkZielLadenIn,
  type AusgabeDaten,
} from "@/lib/ausgaben-daten";
import { berlinerKalendertag } from "@/lib/kalendertag";
import { ausgabenAktionSchema, type AusgabenAktionInput } from "@/lib/validations/ausgaben";

type Db = Prisma.TransactionClient;

/**
 * Was Dienst und Uebersicht vom Vorgang brauchen – nie Fragebogen-Angaben,
 * Tokens oder Adressen. `createdAt` ist der Bezug der Rueckwirkung (G4:
 * Uebergabedatum hoechstens 365 Tage vor dem Anlegen).
 */
const VORGANG_AUSWAHL = {
  id: true,
  organizationId: true,
  arbeitsortId: true,
  status: true,
  createdAt: true,
  questionnaireType: true,
  processType: true,
  supervisorSubmittedAt: true,
  supervisorData: { select: { isComplete: true, mitAusstattung: true, vertragsbeginn: true } },
} as const satisfies Prisma.OnboardingProcessSelect;

type AusgabenVorgang = Prisma.OnboardingProcessGetPayload<{ select: typeof VORGANG_AUSWAHL }>;

const KEINE_BERECHTIGUNG: DienstAntwort = { status: 403, body: { error: "Keine Berechtigung" } };

function vorgangNichtGefunden(): DienstAntwort {
  return { status: 404, body: { error: ABTEILUNGS_MELDUNGEN.ONBOARDING_VORGANG_NICHT_GEFUNDEN } };
}

/** Eine Abweisung IN der Transaktion: wirft (Rollback), die Antwort geht unveraendert hinaus. */
class AusgabeAbgewiesen extends Error {
  constructor(readonly antwort: DienstAntwort) {
    super(String(antwort.body.error ?? "abgewiesen"));
    this.name = "AusgabeAbgewiesen";
  }
}

function abweisen(status: number, error: string, grund?: string): never {
  throw new AusgabeAbgewiesen({ status, body: grund ? { error, grund } : { error } });
}

/** 400 mit dem Text eines `vermerkPruefen`-Grundes. */
function vermerkGrundAbweisen(grund: VermerkGrund): never {
  abweisen(400, MELDUNGEN_AUSGABEN[grund]);
}

/** Was eine Aktion in der Transaktion braucht. */
interface Kontext {
  tx: Db;
  vorgang: AusgabenVorgang;
  session: SessionPayload;
  jetzt: Date;
}

/** Was eine Aktion getan hat: die Meldung und das Protokoll (`null` = nichts geaendert). */
interface Ergebnis {
  meldung: string;
  audit: { action: string; details: Record<string, unknown> } | null;
}

/**
 * POST /api/onboarding/[id]/ausgaben — eine Aktion der Karte (G7).
 *
 *   403 { error: "Keine Berechtigung" }        nicht HR_EDIT_ROLES (auch SERVICE)
 *   400 { error }                              Zod; Datum, Anzahl, Grenze aktiver Stuecke; Zugang nur „gesperrt“, nie getauscht
 *   404 { error }                              Vorgang, Aufgabe oder Ausgabe unbekannt bzw. fremd
 *   409 { error, grund }                       KEINE_AUSGABE | AUFGABE_ENTFAELLT | AUSGABE_IM_AUSTRITT | NICHT_AUSGEGEBEN
 *   200 { data: AusstattungsUebersicht, meldung }
 */
export async function ausgabenAktionAusfuehren(opts: {
  onboardingId: string;
  rohBody: unknown;
  session: SessionPayload;
  jetzt?: Date;
}): Promise<DienstAntwort> {
  const jetzt = opts.jetzt ?? new Date();
  if (!HR_EDIT_ROLES.includes(opts.session.role)) return KEINE_BERECHTIGUNG;
  const parsed = ausgabenAktionSchema.safeParse(opts.rohBody);
  if (!parsed.success) {
    return { status: 400, body: { error: parsed.error.errors[0]?.message ?? ABTEILUNGS_MELDUNGEN.UNGUELTIGE_EINGABE } };
  }
  const aktion = parsed.data;

  const vorgang = await prisma.onboardingProcess.findUnique({
    where: { id: opts.onboardingId },
    select: VORGANG_AUSWAHL,
  });
  if (!vorgang || !(await canAccessProcess(opts.session, vorgang.organizationId))) return vorgangNichtGefunden();

  let ergebnis: Ergebnis;
  try {
    ergebnis = await prisma.$transaction((tx) => aktionIn({ tx, vorgang, session: opts.session, jetzt }, aktion));
  } catch (err) {
    if (err instanceof AusgabeAbgewiesen) return err.antwort;
    throw err;
  }

  const data = await ausstattungUebersichtLaden(vorgang, opts.session, jetzt);
  return { status: 200, body: { data, meldung: ergebnis.meldung } };
}

/**
 * Die Transaktion: Vorgang sperren (bei jedem Status – unbekannt geworden →
 * 404), die Aktion schreiben, dann das Protokoll im selben Commit.
 */
async function aktionIn(k: Kontext, aktion: AusgabenAktionInput): Promise<Ergebnis> {
  if (!(await vorgangSperrenIn(k.tx, k.vorgang.id, { jetzt: k.jetzt, auch: ["COMPLETED", "EXPIRED"] }))) {
    abweisen(404, ABTEILUNGS_MELDUNGEN.ONBOARDING_VORGANG_NICHT_GEFUNDEN);
  }
  const e = await aktionSchreibenIn(k, aktion);
  if (e.audit) {
    await k.tx.auditLog.create({
      data: {
        userId: k.session.userId,
        onboardingId: k.vorgang.id,
        processType: "ONBOARDING",
        action: e.audit.action,
        details: e.audit.details as Prisma.InputJsonValue,
      },
    });
  }
  return e;
}

async function aktionSchreibenIn(k: Kontext, aktion: AusgabenAktionInput): Promise<Ergebnis> {
  switch (aktion.aktion) {
    case "vermerken":
      return vermerkenIn(k, aktion);
    case "korrigieren":
      return korrigierenIn(k, aktion);
    case "tauschen":
      return tauschenIn(k, aktion);
    case "zurueckgenommen":
      return zuruecknehmenIn(k, aktion);
    case "entfernen":
      return entfernenIn(k, aktion.ausgabeId);
    default: {
      const unbekannt: never = aktion;
      throw new Error(`Unbekannte Aktion: ${JSON.stringify(unbekannt)}`);
    }
  }
}

const istAktiv = (zustand: string) => (AUSGABE_AKTIV as readonly string[]).includes(zustand);

/**
 * Wann die Einstellung abgesagt wurde – `null`, solange sie nicht EXPIRED ist
 * (G10). NACH der Sperre des Vorgangs frisch gelesen: Der Vorgang aus
 * `ausgabenAktionAusfuehren` ist vor der Transaktion gelesen, eine
 * gleichzeitige Absage (die den Vorgang ebenfalls zuerst sperrt) kaeme sonst
 * nicht an. Ein Altfall ohne `expiredAt` (abgesagt vor F12) nimmt `jetzt` –
 * spaeter, nie frueher geloescht, als die Regel verlangt (`ausgabeLoeschenAb`).
 */
async function absageZeitpunktIn(k: Kontext): Promise<Date | null> {
  const v = await k.tx.onboardingProcess.findUnique({
    where: { id: k.vorgang.id },
    select: { status: true, expiredAt: true },
  });
  if (v?.status !== "EXPIRED") return null;
  return v.expiredAt ?? k.jetzt;
}

// ---- Vermerken (G4) ----

type VermerkenEingabe = Extract<AusgabenAktionInput, { aktion: "vermerken" }>;

/**
 * Uebergabe vermerken an einer Ausstattungsaufgabe – offen oder erledigt,
 * nicht entfallen, Zeile mit RUECKGABE/SPERREN (G4). Die Aufgabe wird NACH
 * der Sperre des Vorgangs gelesen, die Zahl der aktiven Stuecke ebenso
 * (jeder Anleger sperrt zuerst den Vorgang). `quelle "HR"`, `erfasstVonId` =
 * HR-Konto; die Merker `ausgabenGeloeschtAm` setzt der Schreiber zurueck.
 * Nach einer Absage (EXPIRED) tragen die neuen Stuecke deren Frist (G10).
 */
async function vermerkenIn(k: Kontext, a: VermerkenEingabe): Promise<Ergebnis> {
  const ziel = await vermerkZielLadenIn(k.tx, k.vorgang.id, a.checklistItemId);
  if (!ziel) abweisen(404, ABTEILUNGS_MELDUNGEN.AUFGABE_NICHT_GEFUNDEN);
  const zielGrund = vermerkZielGrund(ziel);
  if (zielGrund) abweisen(409, MELDUNGEN_AUSGABEN[zielGrund], zielGrund);

  const heute = berlinerKalendertag(k.jetzt);
  const aktiv = await aktiveAusgabenZaehlen(k.tx, ziel.aufgabe.id);
  const grund = vermerkPruefen({ stuecke: a.stuecke }, { heute, vorgangAngelegt: k.vorgang.createdAt, aktiv });
  if (grund) vermerkGrundAbweisen(grund);

  const basis = ausgabeBasis(ziel, { vorgang: k.vorgang, quelle: "HR", erfasstVonId: k.session.userId });
  const stuecke = vermerkStuecke(a.stuecke, heute);
  const vorgangEingestelltAm = await absageZeitpunktIn(k);
  const ids = await ausgabenAnlegenIn(k.tx, basis, stuecke, k.jetzt, { vorgangEingestelltAm });
  return {
    meldung: MELDUNGEN_AUSGABEN.VERMERKT(ids.length, basis.beiAustritt),
    audit: {
      action: AUSGABEN_AUDIT.AUSGABE_VERMERKT,
      details: {
        checklistItemId: ziel.aufgabe.id,
        departmentKey: basis.departmentKey,
        anzahl: ids.length,
        mitKennung: stuecke.some((s) => s.kennung !== null),
        ueber: "PORTAL",
        ausgabeIds: ids,
      },
    },
  };
}

// ---- Gemeinsam: eine vorhandene Ausgabe sperren, frisch lesen, Bindung pruefen ----

/**
 * Die Ausgabe dieses Vorgangs (sonst 404), gesperrt und NACH der Sperre frisch
 * gelesen, samt Austrittsbezug (G24, G28). Bindet ein Austritt sie, aendert
 * sie nur der Austritt: 409 AUSGABE_IM_AUSTRITT – die Vorgangsnummer nur,
 * wenn HR den Austritt oeffnen darf (`austrittsBezuegeLaden` mit Sitzung).
 */
async function freieAusgabeIn(k: Kontext, ausgabeId: string): Promise<AusgabeDaten> {
  if (!(await ausgabeLaden(k.tx, k.vorgang.id, ausgabeId))) abweisen(404, MELDUNGEN_AUSGABEN.AUSGABE_NICHT_GEFUNDEN);
  await ausgabenSperrenIn(k.tx, [ausgabeId], k.jetzt);
  const a = await ausgabeLaden(k.tx, k.vorgang.id, ausgabeId);
  if (!a) abweisen(404, MELDUNGEN_AUSGABEN.AUSGABE_NICHT_GEFUNDEN);
  const bezuege = await austrittsBezuegeLaden(k.tx, [a.id], { session: k.session });
  const bindend = bindenderAustritt(a, bezuege.get(a.id) ?? []);
  if (bindend) {
    abweisen(409, MELDUNGEN_AUSGABEN.AUSGABE_IM_AUSTRITT(bindend.displayId ?? null), "AUSGABE_IM_AUSTRITT");
  }
  return a;
}

function nichtAusgegeben(): never {
  abweisen(409, MELDUNGEN_AUSGABEN.NICHT_AUSGEGEBEN, "NICHT_AUSGEGEBEN");
}

/** Bei einem Schluessel bzw. Transponder, der fehlt: der feste Hinweis statt einer Aufgabe (G7). */
function gebaeudewirtschaftMeldung(a: { rueckgabeKategorie: string | null }, standard: string): string {
  return a.rueckgabeKategorie === "SCHLUESSEL" ? MELDUNGEN_AUSGABEN.GEBAEUDEWIRTSCHAFT_INFORMIEREN : standard;
}

// ---- Korrigieren ----

type KorrigierenEingabe = Extract<AusgabenAktionInput, { aktion: "korrigieren" }>;

/**
 * Kennung und/oder Uebergabedatum eines aktiven Stuecks korrigieren. Das
 * Datum gilt wie beim Vermerk (nicht nach heute, hoechstens 365 Tage vor dem
 * Anlegen des Vorgangs). Gleiche Werte: „Keine Änderung.“ ohne Protokoll.
 */
async function korrigierenIn(k: Kontext, a: KorrigierenEingabe): Promise<Ergebnis> {
  const alt = await freieAusgabeIn(k, a.ausgabeId);
  if (!istAktiv(alt.zustand)) nichtAusgegeben();

  const felder: { kennung?: string | null; uebergebenAm?: string } = {};
  if (a.kennung !== undefined && (a.kennung ?? null) !== (alt.kennung ?? null)) felder.kennung = a.kennung ?? null;
  if (a.uebergebenAm !== undefined) {
    const grund = vermerkPruefen(
      { stuecke: [{ uebergebenAm: a.uebergebenAm }] },
      { heute: berlinerKalendertag(k.jetzt), vorgangAngelegt: k.vorgang.createdAt, aktiv: 0 },
    );
    if (grund) vermerkGrundAbweisen(grund);
    if (a.uebergebenAm !== ausgabeKalendertag(alt.uebergebenAm)) felder.uebergebenAm = a.uebergebenAm;
  }
  if (Object.keys(felder).length === 0) return { meldung: MELDUNGEN_AUSGABEN.KEINE_AENDERUNG, audit: null };

  if (!(await ausgabeKorrigierenIn(k.tx, alt.id, felder))) nichtAusgegeben();
  return {
    meldung: MELDUNGEN_AUSGABEN.KORRIGIERT(alt.beiAustritt),
    audit: {
      action: AUSGABEN_AUDIT.AUSGABE_KORRIGIERT,
      details: { ausgabeId: alt.id, felder: Object.keys(felder) },
    },
  };
}

// ---- Tauschen ----

type TauschenEingabe = Extract<AusgabenAktionInput, { aktion: "tauschen" }>;

/**
 * Tausch mit Grund (G7) von AUSGEGEBEN oder VERBLEIBT aus: die alte wird
 * ERSETZT (DEFEKT) bzw. FEHLT (VERLOREN), die neue ist AUSGEGEBEN an derselben
 * Aufgabe, `ersetztDurchId` zeigt auf sie. Ein verlorener Schluessel bringt
 * den Hinweis zur Gebaeudewirtschaft. Nur Gegenstaende (RUECKGABE): Ein Zugang
 * wird gesperrt und neu eingerichtet (400 `ZUGANG_KEIN_TAUSCH`). Nach einer
 * Absage (EXPIRED) traegt die neue deren Frist (G10).
 */
async function tauschenIn(k: Kontext, a: TauschenEingabe): Promise<Ergebnis> {
  const alt = await freieAusgabeIn(k, a.ausgabeId);
  if (!istAktiv(alt.zustand)) nichtAusgegeben();
  if (alt.beiAustritt !== "RUECKGABE") abweisen(400, MELDUNGEN_AUSGABEN.ZUGANG_KEIN_TAUSCH);

  const heute = berlinerKalendertag(k.jetzt);
  // Die alte verlaesst den aktiven Bestand, die neue tritt ein – die Grenze
  // aktiver Stuecke kann der Tausch nicht reissen; geprueft wird das Datum.
  const grund = vermerkPruefen({ stuecke: [a.neu] }, { heute, vorgangAngelegt: k.vorgang.createdAt, aktiv: 0 });
  if (grund) vermerkGrundAbweisen(grund);
  const [neu] = vermerkStuecke([a.neu], heute);

  const vorgangEingestelltAm = await absageZeitpunktIn(k);
  const r = await ausgabeTauschenIn(k.tx, alt, {
    grund: a.grund,
    neu,
    erfasstVonId: k.session.userId,
    jetzt: k.jetzt,
    vorgangEingestelltAm,
  });
  if (!r) nichtAusgegeben();
  return {
    meldung:
      a.grund === "VERLOREN"
        ? gebaeudewirtschaftMeldung(alt, MELDUNGEN_AUSGABEN.GETAUSCHT(a.grund))
        : MELDUNGEN_AUSGABEN.GETAUSCHT(a.grund),
    audit: {
      action: AUSGABEN_AUDIT.AUSGABE_GETAUSCHT,
      details: {
        alt: alt.id,
        neu: r.neuId,
        grund: a.grund,
        zustandAlt: r.zustandAlt,
        checklistItemId: alt.checklistItemId,
        departmentKey: alt.departmentKey,
        mitKennung: neu.kennung !== null,
      },
    },
  };
}

// ---- Zuruecknehmen (ohne Austritt) ----

type ZuruecknehmenEingabe = Extract<AusgabenAktionInput, { aktion: "zurueckgenommen" }>;

/**
 * Ruecknahme ohne Austritt (G7, G10: nach einer Absage, ein Defekt ohne
 * Ersatz): ZURUECK, BESCHAEDIGT oder FEHLT von AUSGEGEBEN bzw. VERBLEIBT aus.
 * Ein Zugang (SPERREN) kommt nur als „gesperrt“ (ZURUECK) zurueck (400). Die
 * Frist setzt `ausgabeZustandDaten` (6 Monate bzw. bei FEHLT 3 Jahre ab
 * Jahresende); ein fehlender Schluessel bringt den Hinweis zur
 * Gebaeudewirtschaft.
 */
async function zuruecknehmenIn(k: Kontext, a: ZuruecknehmenEingabe): Promise<Ergebnis> {
  const alt = await freieAusgabeIn(k, a.ausgabeId);
  if (!istAktiv(alt.zustand)) nichtAusgegeben();
  if (alt.beiAustritt === "SPERREN" && a.zustand !== "ZURUECK") abweisen(400, MELDUNGEN_AUSGABEN.ZUGANG_NUR_GESPERRT);

  if (!(await ausgabeZustandIn(k.tx, alt.id, a.zustand, k.jetzt, { von: AUSGABE_AKTIV }))) nichtAusgegeben();
  const standard = MELDUNGEN_AUSGABEN.ZURUECKGENOMMEN(ausgabeZustandLabel(a.zustand, alt.beiAustritt), alt.beiAustritt);
  return {
    meldung: a.zustand === "FEHLT" ? gebaeudewirtschaftMeldung(alt, standard) : standard,
    audit: {
      action: AUSGABEN_AUDIT.AUSGABE_ZURUECKGENOMMEN,
      details: { ausgabeId: alt.id, zustand: a.zustand, von: alt.zustand, departmentKey: alt.departmentKey },
    },
  };
}

// ---- Entfernen ----

/**
 * Einen irrtuemlichen Vermerk entfernen: nur AUSGEGEBEN und ohne Bindung an
 * einen Austritt (G28). VERBLEIBT und Endzustaende sind kein Irrtum mehr
 * (409 NICHT_AUSGEGEBEN).
 */
async function entfernenIn(k: Kontext, ausgabeId: string): Promise<Ergebnis> {
  const alt = await freieAusgabeIn(k, ausgabeId);
  if (alt.zustand !== "AUSGEGEBEN") nichtAusgegeben();
  if (!(await ausgabeEntfernenIn(k.tx, alt.id))) nichtAusgegeben();
  return {
    meldung: MELDUNGEN_AUSGABEN.ENTFERNT(alt.beiAustritt),
    audit: {
      action: AUSGABEN_AUDIT.AUSGABE_ENTFERNT,
      details: {
        ausgabeId: alt.id,
        ueber: "PORTAL",
        checklistItemId: alt.checklistItemId,
        departmentKey: alt.departmentKey,
        quelle: alt.quelle,
      },
    },
  };
}
