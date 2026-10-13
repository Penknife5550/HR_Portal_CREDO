/**
 * CREDO HR-Portal – Ausstattung & Zugaenge, Stufe 2 (Paket A4): Rueckgaben im
 * Offboarding – die Einstellung des Austritts und was sie dem Austritt
 * vorschlaegt (Feinplan A4, G11 bis G18, G21 bis G24, G26; Schritte S28 bis S31)
 *
 *   einstellungVorschlaegeLaden   GET  /api/offboarding/[id]/einstellung   (nur HR_EDIT_ROLES)
 *   einstellungAktionAusfuehren   POST /api/offboarding/[id]/einstellung   (nur HR_EDIT_ROLES)
 *   rueckgabenUebersichtLaden     Feld `rueckgaben` von GET /api/offboarding/[id]
 *                                 (nur HR_EDIT_ROLES, sonst `null` ohne Abfrage)
 *   rueckgabenUebernehmenIn       Ruecknahme- und Sperraufgaben samt Rueckgaben
 *                                 anlegen (in der Transaktion des Aufrufers)
 *   rueckgabeAendern              PATCH /api/offboarding/[id]/return-items (S30):
 *                                 Zustand, Kennung, Zustandstext, Notiz einer Zeile;
 *                                 Zeilen aus der Einstellung im Gleichlauf mit
 *                                 Ausgabe und Aufgabe (G15 bis G17)
 *   offeneRueckgabenZaehlenIn     Abschluss mit Warnung (S31, G18): was im
 *                                 COMPLETED-Zweig von PATCH /api/offboarding/[id]
 *                                 noch offen ist (in dessen Transaktion, nach der
 *                                 Sperre des Austritts)
 *
 * Worum es geht: Was eine Stelle bei der Einstellung ausgegeben hat, kennt der
 * Austritt erst, wenn HR ihm die Einstellung ZUORDNET (E-A31). Das Portal
 * schlaegt Einstellungen vor (gleiche E-Mail, gleicher Name samt Einrichtung –
 * `zuordnungsVorschlaege`), HR bestaetigt; ein stiller Namensabgleich findet
 * nie statt. Die Zuordnung uebernimmt den Arbeitsort der Einstellung an den
 * Austritt (G12), damit die Aufgaben der OGS-Kraft eines Foerdervereins an die
 * Stellen der Grundschule gehen, an der sie arbeitet.
 *
 * Seit S29 schlaegt die Zuordnung zugleich die Rueckgaben vor (E-A35, G13):
 * aktive Ausgaben der Einstellung mit RUECKGABE bzw. SPERREN, die kein ANDERER
 * Austritt bindet (G28), nicht zentral nur aus der Einrichtung bzw. dem
 * Arbeitsort des Austritts, zentrale nur ohne den Merker „Person bleibt in
 * einer anderen Beschäftigung“. Je Stueck entsteht eine Ruecknahme- bzw.
 * Sperraufgabe der ausgebenden Stelle, bei einem Gegenstand dazu eine
 * Rueckgabe-Zeile (G14). „Rückgaben aktualisieren“ holt Fehlendes nach,
 * „Als ausgegeben übernehmen“ legt fuer erledigte Ausstattungsaufgaben ohne
 * Vermerk eine Ausgabe an, „Lösen …“ nimmt Aufgaben und Rueckgaben wieder
 * heraus, solange nichts davon erledigt ist.
 *
 * Regeln, die beim Aendern gelten muessen:
 *   1. Pruefreihenfolge: 403 (nicht HR_EDIT_ROLES – auch nie der n8n-Schluessel
 *      SERVICE) → 400 (Zod) → 404 Austritt (unbekannt ODER fremder Mandant,
 *      derselbe Text wie die Detailroute) → 404 Einstellung (unbekannt, fremder
 *      Mandant ODER kein `processType` EINSTELLUNG, derselbe Text) → 409.
 *      `canAccessProcess` gilt fuer BEIDE Vorgaenge (G11, G23).
 *   2. Versandsperre (G26): Jede schreibende Aktion nimmt die Sperre des
 *      Austritts, die auch „Abteilungen informieren“ und der taegliche Lauf
 *      nehmen (`offboardingVersandBereich`), belegt → 409 VERSAND_LAEUFT,
 *      Freigabe im `finally`. Sonst pruefte die Zuordnung „keine Stelle
 *      informiert“, waehrend gerade an die Stellen der alten Einrichtung
 *      geschrieben wird – und neue Ruecknahmeaufgaben fehlten in der Mail.
 *   3. Sperrreihenfolge (G24): ERST der Austritt (bedingtes `updateMany`:
 *      `onboardingId: null` bzw. die gelesene, Status nicht COMPLETED/
 *      CANCELLED – 0 Treffer → 409 nach erneutem Lesen), DANN die Einstellung
 *      (Zuordnen: `vorgangSperrenIn` mit `auch: ["COMPLETED"]`, EXPIRED → 409
 *      EINSTELLUNG_ABGESAGT; „Als ausgegeben übernehmen“: beide Endstatus),
 *      DANN die Links der betroffenen Stellen (nach Schluessel), DANN die
 *      Ausgaben (nach `id`, `ausgabenSperrenIn`), erst danach neue Zeilen.
 *      Beim Loesen: Austritt → Links → Aufgaben → Rueckgaben. Erst unter den
 *      Sperren zaehlt die Zuordnung andere LAUFENDE Austritte derselben
 *      Einstellung (→ 409 EINSTELLUNG_VERGEBEN) und liest Zustand und Bindung
 *      jeder Ausgabe (G28) – was sich inzwischen geaendert hat, faellt still
 *      heraus und wird in der Meldung gezaehlt.
 *   4. Arbeitsort (G12, `arbeitsortBeiZuordnung`): nur bei gleicher
 *      Einrichtung von Einstellung und Austritt und nur, solange keine Stelle
 *      informiert ist (`sentAt ?? lastSentAt`), gelesen unter der
 *      Versandsperre und nach den Sperren. `loesen` setzt ihn zurueck, solange
 *      keine Stelle informiert ist; sonst bleibt er (die Stellen haben ihre
 *      Aufgaben schon). Der Mandant `organizationId` und das Mailfeld
 *      `einrichtung` aendern sich nie.
 *   5. Kennung (G14, G21): Titel und Beschreibung der Ruecknahme- und
 *      Sperraufgaben kommen nur aus `ruecknahmeAufgabe` (Bezeichnung, feste
 *      Texte) – NIE die Kennung; sie steht in der Rueckgabe-Zeile
 *      (`serialNumber`) und auf der Link-Seite der ausgebenden Stelle. Die
 *      Offboarding-Payloads bleiben Byte fuer Byte gleich; das
 *      Offboarding-Aktionsschema bekommt keinen Nachtrag – neue Aufgaben einer
 *      informierten Stelle verlaengern ihren Link (gleicher Token) und oeffnen
 *      ihn wieder (`linkStatusNeuBerechnenIn`, Protokoll
 *      DEPARTMENT_TASKS_REOPENED); die Abteilungskarte sagt „… bitte
 *      „Erneut senden““ (`nachInfoNeuZaehlen`).
 *   6. Protokoll (G22) im selben Commit, mit `offboardingId` UND
 *      `onboardingId` (beide Vorgaenge zeigen den Eintrag): Stufe und
 *      Begruendungsschluessel, Anzahlen, IDs, Merker als Boolean – nie Namen,
 *      nie Adressen, nie die Kennung.
 *   7. Kandidaten: nur `processType` EINSTELLUNG, nicht EXPIRED, nur aus den
 *      Mandanten der Sitzung (`getAllowedOrgIds`), ohne Einstellungen, die an
 *      einem anderen laufenden Austritt haengen; hoechstens
 *      `KANDIDATEN_ZEILEN`. Bewertet wird rein (`zuordnungsVorschlaege`).
 *   8. Geschrieben wird `ausgaben` nur ueber src/lib/ausgaben-schreiben.ts
 *      (G3); gelesen ueber src/lib/ausgaben-daten.ts.
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { canAccessProcess, getAllowedOrgIds, HR_EDIT_ROLES, type SessionPayload } from "@/lib/permissions";
import {
  ABTEILUNGS_AUDIT,
  MELDUNGEN as ABTEILUNGS_MELDUNGEN,
  empfaengerEinrichtung,
  gueltigBis,
  verlaengerungNoetig,
  type DienstAntwort,
} from "@/lib/abteilungsaufgaben";
import {
  OFFBOARDING_ENDSTATUS,
  offboardingVersandBereich,
  versandSperreFreigeben,
  versandSperreNehmen,
} from "@/lib/abteilungsaufgaben-dienst";
import { linkStatusNeuBerechnenIn, linksSperrenIn } from "@/lib/abteilungsaufgaben-uebergaenge";
import { vorgangSperrenIn } from "@/lib/abteilungsaufgaben-onboarding";
import {
  AusgabeKonflikt,
  ausgabeGleichlaufIn,
  ausgabeImAustrittSperrenIn,
  ausgabeKorrigierenIn,
  ausgabeOhneVermerkAnlegenIn,
  ausgabenSperrenIn,
} from "@/lib/ausgaben-schreiben";
import {
  ausgabenNachIdLaden,
  austrittsBezuegeLaden,
  bestandDerEinstellungLaden,
  stellenNamenLaden,
  vermerkZielLadenIn,
  type AusgabeDaten,
} from "@/lib/ausgaben-daten";
import {
  AUSGABE_AKTIV,
  AUSGABE_BEI_AUSTRITT,
  AUSGABE_GRENZEN,
  AUSGABEN_AUDIT,
  EINSTELLUNG_OHNE_NUMMER,
  FOLGE_STELLE,
  GEDAECHTNISSTUETZE,
  MELDUNGEN_AUSGABEN,
  OFFBOARDING_AUFGABEN_HERKUNFT,
  arbeitsortBeiZuordnung,
  arbeitsortText,
  ausgabeBasis,
  ausgabeNachZiel,
  austrittLaeuft,
  bindenderAustritt,
  brauchtFolgeStelle,
  gleichlaufSperreText,
  rueckgabeDaten,
  rueckgabeZielAusEingabe,
  rueckgabeZustand,
  einstellungAnzeige,
  einstellungsTreffer,
  informierteStellen,
  loesenGesperrt,
  loesenStand,
  offeneRueckgaben,
  protokollAnzeige,
  protokollStand,
  rueckgabeLageAnzeige,
  rueckgabeVorschlag,
  rueckgabeVorschlagAnzeige,
  rueckgabeZeilenBauen,
  rueckgabenFortschritt,
  rueckgabenSchritt,
  sperraufgabenZeilen,
  uebernahmePlan,
  vermerkZielGrund,
  weitereBeschaeftigungVorbelegung,
  zuordnungEmpfohlen,
  zuordnungsVorschlaege,
  type AusgabeBezug,
  type AusgabeKurz,
  type AustrittsBezug,
  type ArbeitsortGrund,
  type EinstellungsAnzeige,
  type LoesenStand,
  type OffeneRueckgabe,
  type OhneVermerkEintrag,
  type ProtokollAnzeige,
  type RueckgabeLage,
  type RueckgabenFortschritt,
  type RueckgabeVorschlagAnzeige,
  type RueckgabeVorschlagErgebnis,
  type RueckgabeZustand,
  type RueckgabeZeile,
  type SperraufgabenZeile,
  type VorschlagGrund,
  type VorschlagStufe,
  type ZuordnungsVorschlag,
} from "@/lib/ausgaben";
import { berlinerKalendertag } from "@/lib/kalendertag";
import { VORGANG_NICHT_GEFUNDEN } from "@/lib/offboarding-zugriff";
import {
  einstellungAktionSchema,
  einstellungSucheSchema,
  kennungSchema,
  type EinstellungAktionInput,
} from "@/lib/validations/ausgaben";
import type { RueckgabeAendernInput } from "@/lib/validations/offboarding";

type Db = Prisma.TransactionClient;

/** Hoechstens so viele Einstellungen liest die Kandidatenabfrage; bewertet und gekuerzt wird danach (`AUSGABE_GRENZEN.kandidaten`). */
export const KANDIDATEN_ZEILEN = 50;

/**
 * Was die Dienste vom Austritt lesen – nie Austrittsdaten, Notizen oder
 * Dokumente. Die Adressen der Person nur fuer die Bewertung der Vorschlaege.
 */
const AUSTRITT_AUSWAHL = {
  id: true,
  displayId: true,
  organizationId: true,
  arbeitsortId: true,
  status: true,
  exitType: true,
  lastWorkingDay: true,
  onboardingId: true,
  weitereBeschaeftigung: true,
  employeeFirstName: true,
  employeeLastName: true,
  employeeEmail: true,
  employeePrivateEmail: true,
} as const satisfies Prisma.OffboardingProcessSelect;

/** Ein Austritt, wie die Dienste ihn lesen. Die Detailroute reicht ihre volle Zeile (sie traegt alle Felder). */
export type AustrittFuerEinstellung = Prisma.OffboardingProcessGetPayload<{ select: typeof AUSTRITT_AUSWAHL }>;

/**
 * Was die Dienste von einer Einstellung lesen. `email` und
 * `personalData.emailPrivate` nur fuer die Bewertung (`zuordnungsVorschlaege`)
 * – hinaus geht nur `einstellungAnzeige` (ohne Adressen).
 */
const EINSTELLUNG_AUSWAHL = {
  id: true,
  displayId: true,
  organizationId: true,
  arbeitsortId: true,
  processType: true,
  status: true,
  email: true,
  firstName: true,
  lastName: true,
  personalData: { select: { emailPrivate: true, firstName: true, lastName: true, birthName: true } },
  supervisorData: { select: { vertragsbeginn: true } },
} as const satisfies Prisma.OnboardingProcessSelect;

type EinstellungZeile = Prisma.OnboardingProcessGetPayload<{ select: typeof EINSTELLUNG_AUSWAHL }>;

const KEINE_BERECHTIGUNG: DienstAntwort = { status: 403, body: { error: "Keine Berechtigung" } };
const AUSTRITT_NICHT_GEFUNDEN: DienstAntwort = { status: 404, body: { error: VORGANG_NICHT_GEFUNDEN } };
const EINSTELLUNG_NICHT_GEFUNDEN: DienstAntwort = {
  status: 404,
  body: { error: MELDUNGEN_AUSGABEN.EINSTELLUNG_NICHT_GEFUNDEN },
};

/** Eine Abweisung IN der Transaktion: wirft (Rollback), die Antwort geht unveraendert hinaus. */
class ZuordnungAbgewiesen extends Error {
  constructor(readonly antwort: DienstAntwort) {
    super(String(antwort.body.error ?? "abgewiesen"));
    this.name = "ZuordnungAbgewiesen";
  }
}

function abweisen(status: number, error: string, grund?: string): never {
  throw new ZuordnungAbgewiesen({ status, body: grund ? { error, grund } : { error } });
}

function nummer(displayId: string | null | undefined): string {
  return displayId?.trim() || EINSTELLUNG_OHNE_NUMMER;
}

/** Saetze einer Meldung, leere fallen weg. */
function saetze(...teile: ReadonlyArray<string | null | undefined | false>): string {
  return teile.filter((t): t is string => typeof t === "string" && t.trim() !== "").join(" ");
}

const istAktiv = (zustand: string) => (AUSGABE_AKTIV as readonly string[]).includes(zustand);
const kommtZurueck = (beiAustritt: string) => (AUSGABE_BEI_AUSTRITT as readonly string[]).includes(beiAustritt);
const ausgabeHerkunft = (herkunft: string | null | undefined) =>
  (OFFBOARDING_AUFGABEN_HERKUNFT as readonly (string | null | undefined)[]).includes(herkunft);

/** Die Bezuege je Ausgabe (`austrittsBezuegeLaden`) als flache Liste fuer `rueckgabeVorschlag`. */
function bezuegeListe(bezuege: ReadonlyMap<string, ReadonlyArray<AustrittsBezug>>): AusgabeBezug[] {
  return [...bezuege].flatMap(([ausgabeId, liste]) => liste.map((b) => ({ ...b, ausgabeId })));
}

// =============================================
// Lesen: Austritt, Einstellung, Kandidaten, Namen
// =============================================

/** Der Austritt, wenn es ihn gibt und die Sitzung seinen Mandanten sehen darf – sonst null (dieselbe 404). */
async function austrittLaden(db: Db, offboardingId: string, session: SessionPayload): Promise<AustrittFuerEinstellung | null> {
  const austritt = await db.offboardingProcess.findUnique({ where: { id: offboardingId }, select: AUSTRITT_AUSWAHL });
  if (!austritt || !(await canAccessProcess(session, austritt.organizationId))) return null;
  return austritt;
}

/** Die Einstellung, wenn es sie gibt, sie eine EINSTELLUNG ist und die Sitzung ihren Mandanten sehen darf – sonst null. */
async function einstellungLaden(db: Db, onboardingId: string, session: SessionPayload): Promise<EinstellungZeile | null> {
  const zeile = await db.onboardingProcess.findUnique({ where: { id: onboardingId }, select: EINSTELLUNG_AUSWAHL });
  if (!zeile || zeile.processType !== "EINSTELLUNG") return null;
  if (!(await canAccessProcess(session, zeile.organizationId))) return null;
  return zeile;
}

/**
 * Grundbedingung jeder Kandidatenabfrage (G11): Einstellung, nicht abgesagt,
 * Mandant der Sitzung, an keinem ANDEREN laufenden Austritt.
 */
function kandidatenWhere(austrittId: string, erlaubt: string[] | null): Prisma.OnboardingProcessWhereInput {
  return {
    processType: "EINSTELLUNG",
    status: { notIn: ["EXPIRED"] },
    ...(erlaubt ? { organizationId: { in: erlaubt } } : {}),
    austritte: { none: { id: { not: austrittId }, status: { notIn: [...OFFBOARDING_ENDSTATUS] } } },
  };
}

/**
 * Kandidaten der Vorschlaege: gleiche Adresse (Einladung bzw. private Adresse
 * im Fragebogen) oder gleicher Nachname (auch Geburtsname), jeweils ohne
 * Gross-/Kleinschreibung. Die Bewertung macht `zuordnungsVorschlaege`.
 */
async function vorschlagsKandidatenLaden(
  db: Db,
  austritt: AustrittFuerEinstellung,
  erlaubt: string[] | null,
): Promise<EinstellungZeile[]> {
  if (erlaubt && erlaubt.length === 0) return [];
  const gleich = (wert: string) => ({ equals: wert, mode: "insensitive" as const });
  const adressen = [
    ...new Set(
      [austritt.employeeEmail, austritt.employeePrivateEmail].map((a) => (a ?? "").trim()).filter((a) => a !== ""),
    ),
  ];
  const nachname = (austritt.employeeLastName ?? "").trim();
  const oder: Prisma.OnboardingProcessWhereInput[] = [
    ...adressen.flatMap((a) => [{ email: gleich(a) }, { personalData: { is: { emailPrivate: gleich(a) } } }]),
    ...(nachname
      ? [
          { lastName: gleich(nachname) },
          { personalData: { is: { lastName: gleich(nachname) } } },
          { personalData: { is: { birthName: gleich(nachname) } } },
        ]
      : []),
  ];
  if (oder.length === 0) return [];
  return db.onboardingProcess.findMany({
    where: { ...kandidatenWhere(austritt.id, erlaubt), OR: oder },
    select: EINSTELLUNG_AUSWAHL,
    orderBy: { createdAt: "desc" },
    take: KANDIDATEN_ZEILEN,
  });
}

/** Treffer der Suche: Vorgangsnummer oder Nachname (auch Fragebogen und Geburtsname) enthaelt `q`. */
async function trefferLaden(
  db: Db,
  austritt: AustrittFuerEinstellung,
  q: string,
  erlaubt: string[] | null,
): Promise<EinstellungZeile[]> {
  if (erlaubt && erlaubt.length === 0) return [];
  const enthaelt = { contains: q, mode: "insensitive" as const };
  return db.onboardingProcess.findMany({
    where: {
      ...kandidatenWhere(austritt.id, erlaubt),
      OR: [
        { displayId: enthaelt },
        { lastName: enthaelt },
        { personalData: { is: { lastName: enthaelt } } },
        { personalData: { is: { birthName: enthaelt } } },
      ],
    },
    select: EINSTELLUNG_AUSWAHL,
    orderBy: { createdAt: "desc" },
    take: AUSGABE_GRENZEN.suche,
  });
}

/** Namen der Einrichtungen bzw. Arbeitsorte (fuer Dialog und Reiter); ohne ID keine Abfrage. */
async function einrichtungsNamenLaden(db: Db, ids: ReadonlyArray<string | null | undefined>): Promise<Record<string, string>> {
  const eindeutig = [...new Set(ids.filter((id): id is string => !!id))];
  if (eindeutig.length === 0) return {};
  const orte = await db.organization.findMany({ where: { id: { in: eindeutig } }, select: { id: true, name: true } });
  return Object.fromEntries(orte.map((o) => [o.id, o.name]));
}

/** Stufe und Begruendung genau dieser Einstellung – leer, wenn sie kein Vorschlag waere (Treffer der Suche). */
function bewertung(
  austritt: AustrittFuerEinstellung,
  zeile: EinstellungZeile,
): { stufe: VorschlagStufe | null; gruende: { schluessel: VorschlagGrund; text: string }[] } {
  const [v] = zuordnungsVorschlaege(austritt, [zeile]);
  return { stufe: v?.stufe ?? null, gruende: v?.gruende ?? [] };
}

/** Einrichtungen aller Stuecke eines Vorschlags (fuer ihre Namen in Hinweis und Vorschau). */
function vorschlagsOrte(ergebnis: RueckgabeVorschlagErgebnis<AusgabeDaten>): string[] {
  return [...ergebnis.vorschlag, ...ergebnis.hinweisZentral, ...ergebnis.hinweisAndereEinrichtung].map(
    (a) => a.organizationId,
  );
}

// =============================================
// Stand des Austritts (Rueckgaben, Aufgaben aus Ausgaben, Links, Protokolle)
// =============================================

/** Eine Rueckgabe-Zeile, wie Reiter, Abschluss und Loesen sie lesen. */
interface RueckgabeDaten {
  id: string;
  category: string;
  itemName: string;
  serialNumber: string | null;
  zustand: string | null;
  isReturned: boolean;
  returnedAt: Date | null;
  condition: string | null;
  notes: string | null;
  ausgabeId: string | null;
  createdAt?: Date | null;
}

/** Eine Aufgabe des Austritts – fuer den Reiter zaehlen nur die mit `herkunft` (Ausgabe, Folgeaufgabe). */
interface AufgabeDaten {
  id: string;
  title: string;
  isCompleted: boolean;
  herkunft?: string | null;
  ausgabeId?: string | null;
  assigneeDepartment: string | null;
}

/**
 * Was die Uebersicht vom Austritt selbst liest. Die Detailroute hat es schon
 * geladen (`include`: returnItems, checklistItems, departmentLinks,
 * documents) und reicht es mit – dann keine zweite Abfrage; sonst
 * `austrittsStandLaden`.
 */
export interface AustrittsStand {
  returnItems: ReadonlyArray<RueckgabeDaten>;
  checklistItems: ReadonlyArray<AufgabeDaten>;
  departmentLinks: ReadonlyArray<{ departmentKey: string; sentAt: Date | null; lastSentAt: Date | null }>;
  documents: ReadonlyArray<{ type: string; uploadedAt: Date }>;
}

async function austrittsStandLaden(db: Db, offboardingId: string): Promise<AustrittsStand> {
  const returnItems = await db.returnItem.findMany({
    where: { offboardingId },
    select: {
      id: true,
      category: true,
      itemName: true,
      serialNumber: true,
      zustand: true,
      isReturned: true,
      returnedAt: true,
      condition: true,
      notes: true,
      ausgabeId: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });
  const checklistItems = await db.offboardingChecklistItem.findMany({
    where: { offboardingId, herkunft: { in: [...OFFBOARDING_AUFGABEN_HERKUNFT] } },
    select: { id: true, title: true, isCompleted: true, herkunft: true, ausgabeId: true, assigneeDepartment: true },
    orderBy: [{ orderIndex: "asc" }, { category: "asc" }],
  });
  const departmentLinks = await db.offboardingDepartmentLink.findMany({
    where: { offboardingId },
    select: { departmentKey: true, sentAt: true, lastSentAt: true },
  });
  const documents = await db.offboardingDocument.findMany({
    where: { offboardingId, type: "RUECKGABEPROTOKOLL" },
    select: { type: true, uploadedAt: true },
  });
  return { returnItems, checklistItems, departmentLinks, documents };
}

/** Hat die Detailroute den Stand schon mitgeladen? Nur, wenn alle vier Listen da sind. */
function mitgeladenerStand(austritt: object): AustrittsStand | null {
  const a = austritt as Partial<AustrittsStand>;
  return Array.isArray(a.returnItems) &&
    Array.isArray(a.checklistItems) &&
    Array.isArray(a.departmentLinks) &&
    Array.isArray(a.documents)
    ? (a as AustrittsStand)
    : null;
}

// =============================================
// Reiter „Rückgaben“ (Feld `rueckgaben` der Detailroute)
// =============================================

/** Der Reiter „Rückgaben“ – fertig, die Oberflaeche rechnet nichts. */
export interface RueckgabenUebersicht {
  /** Die zugeordnete Einstellung (ohne Adressen), sonst null. */
  einstellung: EinstellungsAnzeige | null;
  /** Merker „Person bleibt in einer anderen Beschäftigung“ (G13); null = nie zugeordnet. */
  weitereBeschaeftigung: boolean | null;
  /** Arbeitsort am Austritt (G12) – Empfaenger der Abteilungsaufgaben; null = Einrichtung. */
  arbeitsort: { id: string; name: string } | null;
  /** Namen der Einrichtungen (Einstellung, Arbeitsorte, Stuecke der Hinweise). */
  einrichtungen: Record<string, string>;
  /** Lage der Kopfzeile (E-A36) samt Text und ggf. Zusatzzeile. */
  lage: RueckgabeLage;
  text: string;
  zusatz: string | null;
  /** „Das Portal ist eine Gedächtnisstütze …“ – steht unter jeder Kopfzeile. */
  gedaechtnisstuetze: string;
  /**
   * Hinweis „Einstellung zuordnen, bevor Sie die Abteilungen informieren“
   * (G12): ohne Zuordnung, laufender Austritt, STARKER oder MITTLERER Vorschlag.
   */
  zuordnungEmpfohlen: boolean;
  /** Was der Reiter anbietet; der Server prueft trotzdem jede Aktion selbst. */
  aktionen: { zuordnen: boolean; loesen: boolean; aktualisieren: boolean; ohneVermerk: boolean };
  /** Tabelle: eine Zeile je Rueckgabe – vorgeschlagene mit Stelle und Uebergabe (Mockup 6.8). */
  zeilen: RueckgabeZeile[];
  /** Zeile „Sperraufgaben …“ je Stelle. */
  sperraufgaben: SperraufgabenZeile[];
  /**
   * Vorschlag der zugeordneten Einstellung OHNE das schon Uebernommene:
   * `rueckgaben`/`sperraufgaben` holt „Rückgaben aktualisieren“, die Hinweise
   * lassen sich einzeln uebernehmen, `schonImAustritt` bindet ein anderer
   * Austritt (G28). Ohne Einstellung alles leer.
   */
  vorschlag: RueckgabeVorschlagAnzeige;
  /** Erledigte Ausstattungsaufgaben ohne Uebergabevermerk – „Als ausgegeben übernehmen“ (G13). */
  ohneVermerk: OhneVermerkEintrag[];
  /** Rueckfrage vor „Lösen …“ (nur mit Zuordnung). */
  loesen: LoesenStand | null;
  /** Was noch offen ist, Stueck fuer Stueck (E-A33; Abschluss mit Warnung, Stepper). */
  offen: OffeneRueckgabe[];
  /** Stepper „Rückgaben einsammeln“: erledigt, wenn nichts offen ist; Text der Lage. */
  schritt: { erledigt: boolean; text: string };
  /**
   * Fortschritt desselben Schritts in denselben Stuecken wie `offen`
   * (Rueckgaben, Sperr- und Folgeaufgaben, je Ausgabe einmal;
   * `rueckgabenFortschritt`) – nie „4/4“ neben einer offenen Sperraufgabe.
   */
  fortschritt: RueckgabenFortschritt;
  /**
   * Was eine Aenderung des Merkers „Person bleibt in einer anderen
   * Beschäftigung“ mit sich braechte (Rueckfrage der Karte, Review A4c): der
   * neue Wert und die Stuecke, die „Rückgaben aktualisieren“ mit ihm
   * uebernaehme. Nur, solange `aktionen.aktualisieren` gilt; sonst null.
   */
  merkerWechsel: { nach: boolean; uebernimmt: AusgabeKurz[] } | null;
  /** „Unterschriebenes Rückgabeprotokoll: fehlt / hochgeladen am …“ (G19). */
  protokoll: ProtokollAnzeige;
}

const LEERER_VORSCHLAG: RueckgabeVorschlagAnzeige = Object.freeze({
  rueckgaben: [],
  sperraufgaben: [],
  hinweisZentral: [],
  hinweisAndereEinrichtung: [],
  schonImAustritt: [],
}) as RueckgabeVorschlagAnzeige;

/**
 * Feld `rueckgaben` von GET /api/offboarding/[id] (G23): nur fuer
 * HR_EDIT_ROLES, sonst `null` – OHNE eine Abfrage (keine Einstellung, keine
 * Ausgaben, keine Rueckgaben, keine Kandidaten). Der Aufrufer reicht die
 * geladene Zeile des Austritts (sie traegt alle Felder aus `AUSTRITT_AUSWAHL`
 * und die mitgeladenen Listen, `AustrittsStand`).
 */
export async function rueckgabenUebersichtLaden(
  austritt: AustrittFuerEinstellung & Partial<AustrittsStand>,
  session: SessionPayload,
): Promise<RueckgabenUebersicht | null> {
  if (!HR_EDIT_ROLES.includes(session.role)) return null;
  return uebersichtBauen(prisma, austritt, session, mitgeladenerStand(austritt));
}

async function uebersichtBauen(
  db: Db,
  austritt: AustrittFuerEinstellung,
  session: SessionPayload,
  mitgeladen: AustrittsStand | null = null,
): Promise<RueckgabenUebersicht> {
  const laeuft = austrittLaeuft(austritt.status);
  const stand = mitgeladen ?? (await austrittsStandLaden(db, austritt.id));
  const rueckgaben = [...stand.returnItems].sort(
    (a, b) => (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0),
  );
  const aufgaben = stand.checklistItems.filter((a) => ausgabeHerkunft(a.herkunft));

  let einstellung: EinstellungsAnzeige | null = null;
  let einstellungsOrte: { organizationId: string; arbeitsortId: string | null } | null = null;
  let bestand: Awaited<ReturnType<typeof bestandDerEinstellungLaden>> = null;
  let vorschlaege: ZuordnungsVorschlag[] = [];

  if (austritt.onboardingId) {
    // HR_EDIT_ROLES sehen alle Mandanten; die Zuordnung selbst hat beide geprueft.
    const zeile = await db.onboardingProcess.findUnique({
      where: { id: austritt.onboardingId },
      select: EINSTELLUNG_AUSWAHL,
    });
    if (zeile) {
      einstellung = einstellungAnzeige(zeile);
      einstellungsOrte = { organizationId: zeile.organizationId, arbeitsortId: zeile.arbeitsortId ?? null };
      bestand = await bestandDerEinstellungLaden(db, zeile.id);
    }
  } else if (laeuft) {
    // Nur fuer den Hinweis vor dem Informieren (G12) – ein abgeschlossener
    // Austritt laesst sich nicht mehr zuordnen und fragt nicht.
    const erlaubt = await getAllowedOrgIds(session);
    vorschlaege = zuordnungsVorschlaege(austritt, await vorschlagsKandidatenLaden(db, austritt, erlaubt));
  }
  const lage = rueckgabeLageAnzeige(bestand);

  // Ausgaben: der Bestand der Einstellung und alles, worauf sich der Austritt
  // bezieht (nach einer Loesung bzw. Loeschung koennen beide auseinanderlaufen).
  const ausgaben = new Map((bestand?.ausgaben ?? []).map((a) => [a.id, a]));
  const bezogen = [
    ...new Set(
      [...aufgaben.map((a) => a.ausgabeId), ...rueckgaben.map((r) => r.ausgabeId)].filter((id): id is string => !!id),
    ),
  ];
  for (const a of await ausgabenNachIdLaden(db, bezogen.filter((id) => !ausgaben.has(id)))) ausgaben.set(a.id, a);
  const relevant = [...ausgaben.values()].filter(
    (a) => bezogen.includes(a.id) || (istAktiv(a.zustand) && kommtZurueck(a.beiAustritt)),
  );
  // Vorgangsnummer anderer Austritte nur, wenn die Sitzung sie oeffnen darf.
  const bezuege = await austrittsBezuegeLaden(
    db,
    relevant.map((a) => a.id),
    { session },
  );

  const ergebnis =
    bestand && einstellungsOrte
      ? rueckgabeVorschlag({
          austritt: { id: austritt.id, organizationId: austritt.organizationId, arbeitsortId: austritt.arbeitsortId },
          einstellung: einstellungsOrte,
          ausgaben: bestand.ausgaben,
          weitereBeschaeftigung: austritt.weitereBeschaeftigung,
          bezuege: bezuegeListe(bezuege),
        })
      : null;

  const stellenNamen = await stellenNamenLaden(
    db,
    [...[...ausgaben.values()].map((a) => a.departmentKey), ...aufgaben.map((a) => a.assigneeDepartment)],
    empfaengerEinrichtung(austritt),
  );
  const einrichtungen = await einrichtungsNamenLaden(db, [
    einstellung?.organizationId,
    einstellung?.arbeitsortId,
    austritt.arbeitsortId,
    ...(ergebnis ? vorschlagsOrte(ergebnis) : []),
  ]);
  const uebernommen = aufgaben.filter((a) => a.herkunft === "AUSGABE").map((a) => a.ausgabeId ?? "");
  const vorschlag = ergebnis
    ? rueckgabeVorschlagAnzeige(ergebnis, { stellenNamen, einrichtungen, uebernommen })
    : LEERER_VORSCHLAG;

  const zugeordnet = !!austritt.onboardingId;
  // Rueckfrage vor dem Aendern des Merkers: derselbe Vorschlag mit dem neuen
  // Wert – was „Rückgaben aktualisieren“ danach uebernaehme (rein, keine Abfrage).
  const merkerNach = austritt.weitereBeschaeftigung !== true;
  const mitNeuemMerker =
    laeuft && zugeordnet && bestand && einstellungsOrte
      ? rueckgabeVorschlagAnzeige(
          rueckgabeVorschlag({
            austritt: { id: austritt.id, organizationId: austritt.organizationId, arbeitsortId: austritt.arbeitsortId },
            einstellung: einstellungsOrte,
            ausgaben: bestand.ausgaben,
            weitereBeschaeftigung: merkerNach,
            bezuege: bezuegeListe(bezuege),
          }),
          { stellenNamen, einrichtungen, uebernommen },
        )
      : null;
  const merkerWechsel = mitNeuemMerker
    ? { nach: merkerNach, uebernimmt: [...mitNeuemMerker.rueckgaben, ...mitNeuemMerker.sperraufgaben] }
    : null;
  const loesen = zugeordnet
    ? loesenStand({ aufgaben, rueckgaben, links: stand.departmentLinks })
    : null;
  const offen = offeneRueckgaben({ rueckgaben, aufgaben, stellenNamen });

  return {
    einstellung,
    weitereBeschaeftigung: austritt.weitereBeschaeftigung ?? null,
    arbeitsort: austritt.arbeitsortId
      ? { id: austritt.arbeitsortId, name: einrichtungen[austritt.arbeitsortId] ?? "" }
      : null,
    einrichtungen,
    lage: lage.stand.lage,
    text: lage.text,
    zusatz: lage.zusatz,
    gedaechtnisstuetze: GEDAECHTNISSTUETZE,
    zuordnungEmpfohlen: zuordnungEmpfohlen({
      zugeordnet,
      austrittStatus: austritt.status,
      vorschlaege,
    }),
    aktionen: {
      zuordnen: laeuft && !zugeordnet,
      loesen: laeuft && zugeordnet && loesen?.sperrGrund === null,
      aktualisieren: laeuft && zugeordnet,
      ohneVermerk: laeuft && zugeordnet && lage.ohneVermerk.length > 0,
    },
    zeilen: rueckgabeZeilenBauen({
      rueckgaben,
      aufgaben,
      ausgaben: [...ausgaben.values()].map((a) => ({ ...a, bezuege: bezuege.get(a.id) ?? [] })),
      stellenNamen,
      austrittId: austritt.id,
      darfBearbeiten: austritt.status !== "CANCELLED",
      austrittStatus: austritt.status,
    }),
    sperraufgaben: sperraufgabenZeilen({ aufgaben, rueckgaben, ausgaben: [...ausgaben.values()], stellenNamen }),
    vorschlag,
    ohneVermerk: zugeordnet ? lage.ohneVermerk : [],
    loesen,
    offen,
    schritt: rueckgabenSchritt(lage.stand, offen),
    fortschritt: rueckgabenFortschritt({ rueckgaben, aufgaben }),
    merkerWechsel,
    protokoll: protokollAnzeige(
      "RUECKGABE",
      protokollStand({
        ausgabenMitRueckgabe: rueckgaben.filter((r) => !!r.ausgabeId).length,
        dokumente: stand.documents.filter((d) => d.type === "RUECKGABEPROTOKOLL"),
      }),
    ),
  };
}

// =============================================
// Abschluss mit Warnung (G18, S31)
// =============================================

/**
 * Was beim Abschluss des Austritts noch offen ist – Stueck fuer Stueck
 * (`offeneRueckgaben`, E-A33): offene Rueckgabe-Zeilen (auch die, die HR
 * selbst erfasst hat), offene Sperraufgaben und offene Folgeaufgaben
 * „Schließung prüfen“, je Ausgabe nur einmal; Titel und Stelle wie im Reiter
 * (Stelle am Arbeitsort des Austritts, `empfaengerEinrichtung`).
 *
 * Laeuft im COMPLETED-Zweig von PATCH /api/offboarding/[id] in dessen
 * Transaktion, NACH dem bedingten `updateMany` auf den gelesenen Status, das
 * den Austritt sperrt: Jeder Weg, der eine Rueckgabe-Zeile oder eine
 * Ausgabe-Aufgabe umschaltet (Link der Stelle, Portal-PATCH, Reiter
 * „Rückgaben“), sperrt den Austritt zuerst – zwischen Zaehlen und Commit
 * oeffnet also niemand eine Rueckgabe wieder. Gelesen wird nur; ohne offene
 * Stuecke keine Abfrage der Stellennamen.
 */
export async function offeneRueckgabenZaehlenIn(tx: Db, offboardingId: string): Promise<OffeneRueckgabe[]> {
  const rueckgaben = await tx.returnItem.findMany({
    where: { offboardingId },
    select: { id: true, itemName: true, zustand: true, isReturned: true, ausgabeId: true },
    orderBy: { createdAt: "asc" },
  });
  const aufgaben = await tx.offboardingChecklistItem.findMany({
    where: { offboardingId, herkunft: { in: [...OFFBOARDING_AUFGABEN_HERKUNFT] } },
    select: { id: true, title: true, isCompleted: true, herkunft: true, ausgabeId: true, assigneeDepartment: true },
    orderBy: [{ orderIndex: "asc" }, { category: "asc" }],
  });
  if (offeneRueckgaben({ rueckgaben, aufgaben, stellenNamen: {} }).length === 0) return [];

  const austritt = await tx.offboardingProcess.findUnique({
    where: { id: offboardingId },
    select: { organizationId: true, arbeitsortId: true },
  });
  const stellenNamen = austritt
    ? await stellenNamenLaden(
        tx,
        aufgaben.map((a) => a.assigneeDepartment),
        empfaengerEinrichtung(austritt),
      )
    : {};
  return offeneRueckgaben({ rueckgaben, aufgaben, stellenNamen });
}

// =============================================
// GET /api/offboarding/[id]/einstellung – Dialog „Einstellung zuordnen …“
// =============================================

/** Vorschau einer Einstellung vor der Bestaetigung (G11 bis G13). */
export interface EinstellungsVorschau {
  einstellung: EinstellungsAnzeige;
  /** Stufe und Begruendung, wenn sie ein Vorschlag waere; sonst null bzw. leer. */
  stufe: VorschlagStufe | null;
  gruende: { schluessel: VorschlagGrund; text: string }[];
  /** Was mit dem Arbeitsort geschaehe (G12) – der Satz sagt es auch, wenn er leer bleibt. */
  arbeitsort: { grund: ArbeitsortGrund; text: string | null };
  /** Lage, die der Reiter nach der Zuordnung zeigte (E-A36). */
  lage: RueckgabeLage;
  text: string;
  zusatz: string | null;
  /** Der Merker, mit dem der Vorschlag gerechnet ist (Query, sonst gespeichert bzw. Vorbelegung). */
  weitereBeschaeftigung: boolean;
  /** Der Rueckgabe-Vorschlag (S29): Rueckgaben, Sperraufgaben, Hinweise, Stuecke in anderen Austritten. */
  rueckgaben: RueckgabeVorschlagAnzeige;
  /** Warum „Zuordnen“ jetzt mit 409 scheiterte (vergeben, abgesagt, …) – sonst null. */
  sperrGrund: string | null;
}

/** Antwort von GET /api/offboarding/[id]/einstellung (`data`). */
export interface EinstellungsAuswahl {
  /** Die zugeordnete Einstellung, sonst null. */
  zugeordnet: EinstellungsAnzeige | null;
  /** Zuordnen moeglich: keine Zuordnung und laufender Austritt. Sonst bleiben Vorschlaege und Treffer leer. */
  zuordenbar: boolean;
  /** Gespeicherter Merker bzw. seine Vorbelegung (Versetzung → ja, G13). */
  weitereBeschaeftigung: boolean;
  vorschlaege: ZuordnungsVorschlag[];
  /** Treffer der Suche (`q`); ohne Suche leer. */
  treffer: EinstellungsAnzeige[];
  /** Namen der Einrichtungen und Arbeitsorte, die in dieser Antwort vorkommen. */
  einrichtungen: Record<string, string>;
  vorschau?: EinstellungsVorschau;
}

/**
 * GET /api/offboarding/[id]/einstellung?q=…&vorschau=…&weitereBeschaeftigung=…
 * — Vorschlaege, Suche und Vorschau fuer den Dialog „Einstellung zuordnen …“
 * (G11 bis G13). Schreibt nichts.
 *
 *   403 { error: "Keine Berechtigung" }   nicht HR_EDIT_ROLES (auch SERVICE)
 *   400 { error }                        `q` kuerzer als 3 bzw. laenger als 60 Zeichen, `vorschau` keine ID
 *   404 { error }                        Austritt unbekannt/fremd; Einstellung der Vorschau unbekannt/fremd/keine EINSTELLUNG
 *   200 { data: EinstellungsAuswahl }
 */
export async function einstellungVorschlaegeLaden(opts: {
  offboardingId: string;
  query: unknown;
  session: SessionPayload;
}): Promise<DienstAntwort> {
  if (!HR_EDIT_ROLES.includes(opts.session.role)) return KEINE_BERECHTIGUNG;
  const parsed = einstellungSucheSchema.safeParse(opts.query);
  if (!parsed.success) {
    return { status: 400, body: { error: parsed.error.errors[0]?.message ?? ABTEILUNGS_MELDUNGEN.UNGUELTIGE_EINGABE } };
  }
  const { q, vorschau: vorschauId, weitereBeschaeftigung: merkerImDialog } = parsed.data;

  const austritt = await austrittLaden(prisma, opts.offboardingId, opts.session);
  if (!austritt) return AUSTRITT_NICHT_GEFUNDEN;

  const vorschauZeile = vorschauId ? await einstellungLaden(prisma, vorschauId, opts.session) : null;
  if (vorschauId && !vorschauZeile) return EINSTELLUNG_NICHT_GEFUNDEN;

  const zuordenbar = austrittLaeuft(austritt.status) && !austritt.onboardingId;
  const erlaubt = zuordenbar ? await getAllowedOrgIds(opts.session) : null;
  const vorschlaege = zuordenbar
    ? zuordnungsVorschlaege(austritt, await vorschlagsKandidatenLaden(prisma, austritt, erlaubt))
    : [];
  const treffer = zuordenbar && q ? einstellungsTreffer(await trefferLaden(prisma, austritt, q, erlaubt)) : [];
  const zugeordnetZeile = austritt.onboardingId
    ? await prisma.onboardingProcess.findUnique({ where: { id: austritt.onboardingId }, select: EINSTELLUNG_AUSWAHL })
    : null;
  const zugeordnet = zugeordnetZeile ? einstellungAnzeige(zugeordnetZeile) : null;
  const gespeichert = austritt.weitereBeschaeftigung ?? weitereBeschaeftigungVorbelegung(austritt.exitType);

  const einrichtungen = await einrichtungsNamenLaden(
    prisma,
    [...vorschlaege, ...treffer, ...(zugeordnet ? [zugeordnet] : []), ...(vorschauZeile ? [vorschauZeile] : [])].flatMap(
      (e) => [e.organizationId, e.arbeitsortId],
    ),
  );
  const vorschau = vorschauZeile
    ? await vorschauBauen(prisma, {
        austritt,
        zeile: vorschauZeile,
        weitereBeschaeftigung: merkerImDialog ?? gespeichert,
        einrichtungen,
        session: opts.session,
      })
    : null;

  const auswahl: EinstellungsAuswahl = {
    zugeordnet,
    zuordenbar,
    weitereBeschaeftigung: gespeichert,
    vorschlaege,
    treffer,
    einrichtungen: { ...einrichtungen, ...(vorschau?.einrichtungen ?? {}) },
    ...(vorschau ? { vorschau: vorschau.vorschau } : {}),
  };
  return { status: 200, body: { data: auswahl } };
}

/**
 * Was die Zuordnung dieser Einstellung bewirkte – gelesen ohne Sperre (die
 * Zuordnung prueft alles unter ihren Sperren erneut). Der Rueckgabe-Vorschlag
 * rechnet mit dem Arbeitsort, den der Austritt danach haette, und mit dem
 * Merker aus dem Dialog.
 */
async function vorschauBauen(
  db: Db,
  opts: {
    austritt: AustrittFuerEinstellung;
    zeile: EinstellungZeile;
    weitereBeschaeftigung: boolean;
    einrichtungen: Readonly<Record<string, string>>;
    session: SessionPayload;
  },
): Promise<{ vorschau: EinstellungsVorschau; einrichtungen: Record<string, string> }> {
  const { austritt, zeile } = opts;
  const links = await db.offboardingDepartmentLink.findMany({
    where: { offboardingId: austritt.id },
    select: { sentAt: true, lastSentAt: true },
  });
  const vergeben = await db.offboardingProcess.count({
    where: { onboardingId: zeile.id, id: { not: austritt.id }, status: { notIn: [...OFFBOARDING_ENDSTATUS] } },
  });
  const bestand = await bestandDerEinstellungLaden(db, zeile.id);
  const lage = rueckgabeLageAnzeige(bestand);
  const ort = arbeitsortBeiZuordnung({ austritt, einstellung: zeile, links });

  let sperrGrund: string | null = null;
  if (!austrittLaeuft(austritt.status)) sperrGrund = MELDUNGEN_AUSGABEN.VORGANG_ABGESCHLOSSEN;
  else if (austritt.onboardingId) sperrGrund = MELDUNGEN_AUSGABEN.BEREITS_ZUGEORDNET;
  else if (zeile.status === "EXPIRED") sperrGrund = MELDUNGEN_AUSGABEN.EINSTELLUNG_ABGESAGT;
  else if (vergeben > 0) sperrGrund = MELDUNGEN_AUSGABEN.EINSTELLUNG_VERGEBEN;

  // Der Austritt, wie er nach der Zuordnung aussaehe (Arbeitsort, G12).
  const danach = {
    id: austritt.id,
    organizationId: austritt.organizationId,
    arbeitsortId: ort.grund === "UEBERNOMMEN" ? ort.arbeitsortId : (austritt.arbeitsortId ?? null),
  };
  const ausgaben = bestand?.ausgaben ?? [];
  const bezuege = await austrittsBezuegeLaden(
    db,
    ausgaben.filter((a) => istAktiv(a.zustand) && kommtZurueck(a.beiAustritt)).map((a) => a.id),
    { session: opts.session },
  );
  const ergebnis = rueckgabeVorschlag({
    austritt: danach,
    einstellung: { organizationId: zeile.organizationId, arbeitsortId: zeile.arbeitsortId ?? null },
    ausgaben,
    weitereBeschaeftigung: opts.weitereBeschaeftigung,
    bezuege: bezuegeListe(bezuege),
  });
  const stellenNamen = await stellenNamenLaden(
    db,
    ausgaben.map((a) => a.departmentKey),
    empfaengerEinrichtung(danach),
  );
  const fehlende = vorschlagsOrte(ergebnis).filter((id) => !(id in opts.einrichtungen));
  const einrichtungen = { ...opts.einrichtungen, ...(await einrichtungsNamenLaden(db, fehlende)) };

  return {
    einrichtungen,
    vorschau: {
      einstellung: einstellungAnzeige(zeile),
      ...bewertung(austritt, zeile),
      arbeitsort: {
        grund: ort.grund,
        text: arbeitsortText(ort.grund, zeile.arbeitsortId ? (einrichtungen[zeile.arbeitsortId] ?? null) : null),
      },
      lage: lage.stand.lage,
      text: lage.text,
      zusatz: lage.zusatz,
      weitereBeschaeftigung: opts.weitereBeschaeftigung,
      rueckgaben: rueckgabeVorschlagAnzeige(ergebnis, { stellenNamen, einrichtungen }),
      sperrGrund,
    },
  };
}

// =============================================
// Uebernahme in den Austritt (Feinplan 1.7, Schritte 3.4 bis 3.8)
// =============================================

/** Was eine Uebernahme angelegt hat – fuer Protokoll und Meldung. */
export interface UebernahmeErgebnis {
  /** Neue Rueckgabe-Zeilen (Gegenstaende). */
  rueckgaben: number;
  /** Neue Sperraufgaben (Zugaenge). */
  sperraufgaben: number;
  /** Stuecke, die nur als Hinweis bleiben (zentral bei weiterer Beschaeftigung, andere Einrichtung). */
  hinweise: number;
  /** Zwischen Vorschlag und Sperre geaendert (oder in der Auswahl nicht mehr waehlbar) – still herausgefallen. */
  herausgefallen: number;
  /** Stellen mit neuen Aufgaben. */
  stellen: string[];
  /** Verlaengerte Links (gleicher Token). */
  verlaengert: number;
}

const NICHTS_UEBERNOMMEN: UebernahmeErgebnis = Object.freeze({
  rueckgaben: 0,
  sperraufgaben: 0,
  hinweise: 0,
  herausgefallen: 0,
  stellen: [],
  verlaengert: 0,
}) as UebernahmeErgebnis;

/**
 * Uebernimmt den Rueckgabe-Vorschlag der Einstellung in den Austritt (G13,
 * G14; Feinplan 1.7, Schritte 3.4 bis 3.8) – in der Transaktion des
 * Aufrufers, der Austritt (und beim Zuordnen die Einstellung) schon gesperrt
 * hat:
 *
 *   3.4 Vorschlag berechnen (`bestandDerEinstellungLaden`,
 *       `austrittsBezuegeLaden`, `rueckgabeVorschlag`); mit `nur` stattdessen
 *       genau diese Ausgaben – jede muss zur Einstellung gehoeren (sonst 404)
 *       und waehlbar sein (Vorschlag oder Hinweis, sonst faellt sie heraus);
 *   3.5 Links der Stellen sperren, denen noch etwas fehlt;
 *   3.6 Ausgaben sperren (nach `id`) und frisch pruefen: aktiv, RUECKGABE
 *       bzw. SPERREN, an keinen ANDEREN Austritt gebunden (G28) – sonst
 *       still heraus (`herausgefallen`);
 *   3.7 Aufgaben (`ruecknahmeAufgabe`) und Rueckgaben anlegen, nur was fehlt
 *       (`uebernahmePlan`), beide mit `skipDuplicates` als Netz;
 *   3.8 Links nachziehen: verlaengern (gleicher Token) und
 *       `linkStatusNeuBerechnenIn` (DEPARTMENT_TASKS_REOPENED bei
 *       WIEDER_OFFEN) – ohne Mail.
 *
 * Der Zustand der Ausgabe aendert sich nicht. Das Protokoll schreibt der
 * Aufrufer.
 */
export async function rueckgabenUebernehmenIn(
  tx: Db,
  opts: {
    austritt: { id: string; organizationId: string; arbeitsortId: string | null; lastWorkingDay: Date | null };
    einstellung: { id: string; organizationId: string; arbeitsortId: string | null };
    weitereBeschaeftigung: boolean | null;
    /** Ausgewaehlte Ausgaben (`uebernehmen` bzw. `ausgabeIds`); fehlt = der Vorschlag. */
    nur?: ReadonlyArray<string> | null;
    userId: string | null;
    jetzt: Date;
  },
): Promise<UebernahmeErgebnis> {
  const { austritt, jetzt } = opts;

  // 3.4 Vorschlag
  const bestand = await bestandDerEinstellungLaden(tx, opts.einstellung.id);
  if (!bestand) return { ...NICHTS_UEBERNOMMEN };
  const nachId = new Map(bestand.ausgaben.map((a) => [a.id, a]));
  const bezuege = await austrittsBezuegeLaden(
    tx,
    bestand.ausgaben.filter((a) => istAktiv(a.zustand) && kommtZurueck(a.beiAustritt)).map((a) => a.id),
  );
  const ergebnis = rueckgabeVorschlag({
    austritt,
    einstellung: opts.einstellung,
    ausgaben: bestand.ausgaben,
    weitereBeschaeftigung: opts.weitereBeschaeftigung,
    bezuege: bezuegeListe(bezuege),
  });

  let herausgefallen = 0;
  let ziel: AusgabeDaten[];
  if (opts.nur) {
    for (const id of opts.nur) {
      if (!nachId.has(id)) abweisen(404, MELDUNGEN_AUSGABEN.AUSGABE_NICHT_GEFUNDEN);
    }
    const waehlbar = new Set(
      [...ergebnis.vorschlag, ...ergebnis.hinweisZentral, ...ergebnis.hinweisAndereEinrichtung].map((a) => a.id),
    );
    ziel = opts.nur.filter((id) => waehlbar.has(id)).map((id) => nachId.get(id) as AusgabeDaten);
    herausgefallen += opts.nur.length - ziel.length;
  } else {
    ziel = ergebnis.vorschlag;
  }
  const zielIds = new Set(ziel.map((a) => a.id));
  const hinweise = [...ergebnis.hinweisZentral, ...ergebnis.hinweisAndereEinrichtung].filter(
    (a) => !zielIds.has(a.id),
  ).length;
  if (ziel.length === 0) return { ...NICHTS_UEBERNOMMEN, hinweise, herausgefallen };

  // Was hat der Austritt schon? (Unter der Sperre des Austritts: kein anderer
  // Weg legt fuer ihn gleichzeitig Ausgabe-Aufgaben an.)
  const vorhandeneAufgaben = (
    await tx.offboardingChecklistItem.findMany({
      where: { offboardingId: austritt.id, herkunft: "AUSGABE", ausgabeId: { in: [...zielIds] } },
      select: { ausgabeId: true },
    })
  ).map((a) => a.ausgabeId ?? "");
  const vorhandeneRueckgaben = (
    await tx.returnItem.findMany({
      where: { offboardingId: austritt.id, ausgabeId: { in: [...zielIds] } },
      select: { ausgabeId: true },
    })
  ).map((r) => r.ausgabeId ?? "");
  const mitAufgabe = new Set(vorhandeneAufgaben);
  const mitRueckgabe = new Set(vorhandeneRueckgaben);
  const fehlend = ziel.filter(
    (a) => !mitAufgabe.has(a.id) || (a.beiAustritt === "RUECKGABE" && !mitRueckgabe.has(a.id)),
  );
  if (fehlend.length === 0) return { ...NICHTS_UEBERNOMMEN, hinweise, herausgefallen };

  // 3.5 Links der Stellen, denen etwas fehlt (G24: vor Aufgaben und Ausgaben).
  const bereich = offboardingVersandBereich(austritt.id);
  await linksSperrenIn(
    tx,
    bereich,
    fehlend.map((a) => a.departmentKey),
  );

  // 3.6 Ausgaben sperren und NACH der Sperre pruefen (G24, G28).
  const ids = fehlend.map((a) => a.id);
  await ausgabenSperrenIn(tx, ids, jetzt);
  const frisch = new Map((await ausgabenNachIdLaden(tx, ids)).map((a) => [a.id, a]));
  const bezuegeFrisch = await austrittsBezuegeLaden(tx, ids);
  const gueltig = ids
    .map((id) => frisch.get(id))
    .filter(
      (a): a is AusgabeDaten =>
        !!a &&
        a.onboardingId === opts.einstellung.id &&
        istAktiv(a.zustand) &&
        kommtZurueck(a.beiAustritt) &&
        bindenderAustritt(a, bezuegeFrisch.get(a.id) ?? [], austritt.id) === null,
    );
  herausgefallen += fehlend.length - gueltig.length;
  if (gueltig.length === 0) return { ...NICHTS_UEBERNOMMEN, hinweise, herausgefallen };

  // 3.7 Anlegen – nur was fehlt; der Unique-Index ist das Netz.
  const startIndex = await tx.offboardingChecklistItem.count({
    where: { offboardingId: austritt.id, herkunft: "AUSGABE" },
  });
  const plan = uebernahmePlan({
    ausgaben: gueltig,
    vorhanden: { aufgaben: vorhandeneAufgaben, rueckgaben: vorhandeneRueckgaben },
    letzterArbeitstag: austritt.lastWorkingDay,
    heute: berlinerKalendertag(jetzt),
    startIndex,
  });
  if (plan.aufgaben.length > 0) {
    await tx.offboardingChecklistItem.createMany({
      data: plan.aufgaben.map((a) => ({ ...a, offboardingId: austritt.id })),
      skipDuplicates: true,
    });
  }
  if (plan.rueckgaben.length > 0) {
    await tx.returnItem.createMany({
      data: plan.rueckgaben.map((r) => ({ ...r, offboardingId: austritt.id })),
      skipDuplicates: true,
    });
  }

  // 3.8 Links nachziehen.
  const verlaengert = await linksNachziehenIn(tx, austritt.id, plan.stellen, opts.userId, jetzt);

  return {
    rueckgaben: plan.rueckgabenNeu,
    sperraufgaben: plan.sperraufgabenNeu,
    hinweise,
    herausgefallen,
    stellen: plan.stellen,
    verlaengert,
  };
}

/**
 * Neue Aufgaben fuer schon informierte Stellen (G14, kein Nachtrag im
 * Offboarding): Link verlaengern, wenn seine Gueltigkeit vor dem neuen
 * „gültig bis“ endet (gleicher Token, `gueltigBis`/`verlaengerungNoetig`), und
 * den Abteilungsstatus neu berechnen – eine fertige Stelle ist wieder offen
 * (Protokoll DEPARTMENT_TASKS_REOPENED). Ohne Mail; die Link-Seite zeigt die
 * Aufgaben sofort, die naechste Erinnerung nimmt sie mit, die Abteilungskarte
 * bietet „Erneut senden“ an. Antwort: Zahl der verlaengerten Links.
 */
async function linksNachziehenIn(
  tx: Db,
  offboardingId: string,
  stellen: ReadonlyArray<string>,
  userId: string | null,
  jetzt: Date,
): Promise<number> {
  if (stellen.length === 0) return 0;
  const links = await tx.offboardingDepartmentLink.findMany({
    where: { offboardingId, departmentKey: { in: [...stellen] } },
    select: { id: true, departmentKey: true, expiresAt: true },
  });
  let verlaengert = 0;
  for (const link of links) {
    const offene = await tx.offboardingChecklistItem.findMany({
      where: { offboardingId, assigneeDepartment: link.departmentKey, isCompleted: false },
      select: { dueDate: true },
    });
    const bis = gueltigBis(
      jetzt,
      offene.map((a) => a.dueDate),
    );
    if (verlaengerungNoetig(link.expiresAt, bis)) {
      await tx.offboardingDepartmentLink.update({ where: { id: link.id }, data: { expiresAt: bis } });
      verlaengert += 1;
    }
  }
  await linkStatusProtokollieren(tx, offboardingId, stellen, userId, jetzt);
  return verlaengert;
}

/** `linkStatusNeuBerechnenIn` fuer diese Stellen samt Protokoll jedes Wechsels (ohne Mail). */
async function linkStatusProtokollieren(
  tx: Db,
  offboardingId: string,
  stellen: ReadonlyArray<string | null | undefined>,
  userId: string | null,
  jetzt: Date,
): Promise<void> {
  const uebergaenge = await linkStatusNeuBerechnenIn(tx, offboardingVersandBereich(offboardingId), stellen, jetzt);
  for (const u of uebergaenge) {
    if (!u.uebergang) continue;
    await tx.auditLog.create({
      data: {
        userId,
        offboardingId,
        processType: "OFFBOARDING",
        action: u.uebergang === "FERTIG" ? ABTEILUNGS_AUDIT.ABTEILUNG_FERTIG : ABTEILUNGS_AUDIT.ABTEILUNG_WIEDER_OFFEN,
        details: { departmentKey: u.departmentKey, linkId: u.linkId, ueber: "RUECKGABEN" },
      },
    });
  }
}

// =============================================
// POST /api/offboarding/[id]/einstellung – zuordnen, loesen, aktualisieren, ohne-vermerk
// =============================================

/**
 * POST /api/offboarding/[id]/einstellung — eine Aktion am Austritt (G11 bis G14).
 *
 *   403 { error: "Keine Berechtigung" }   nicht HR_EDIT_ROLES (auch SERVICE)
 *   400 { error }                        Zod
 *   404 { error }                        Austritt bzw. Einstellung unbekannt, fremd, keine EINSTELLUNG;
 *                                        eine ausgewaehlte Ausgabe gehoert nicht zur Einstellung
 *   409 { error, grund }                 VERSAND_LAEUFT | BEREITS_ZUGEORDNET | VORGANG_ABGESCHLOSSEN |
 *                                        EINSTELLUNG_ABGESAGT | EINSTELLUNG_VERGEBEN | INZWISCHEN_GEAENDERT |
 *                                        KEINE_ZUORDNUNG | LOESEN_GESPERRT
 *   200 { data: RueckgabenUebersicht, meldung }
 */
export async function einstellungAktionAusfuehren(opts: {
  offboardingId: string;
  rohBody: unknown;
  session: SessionPayload;
  jetzt?: Date;
}): Promise<DienstAntwort> {
  const jetzt = opts.jetzt ?? new Date();
  if (!HR_EDIT_ROLES.includes(opts.session.role)) return KEINE_BERECHTIGUNG;
  const parsed = einstellungAktionSchema.safeParse(opts.rohBody);
  if (!parsed.success) {
    return { status: 400, body: { error: parsed.error.errors[0]?.message ?? ABTEILUNGS_MELDUNGEN.UNGUELTIGE_EINGABE } };
  }
  const aktion = parsed.data;

  const austritt = await austrittLaden(prisma, opts.offboardingId, opts.session);
  if (!austritt) return AUSTRITT_NICHT_GEFUNDEN;

  switch (aktion.aktion) {
    case "zuordnen":
      return zuordnen(austritt, aktion, opts.session, jetzt);
    case "loesen":
      return loesen(austritt, opts.session, jetzt);
    case "aktualisieren":
      return aktualisieren(austritt, aktion, opts.session, jetzt);
    case "ohne-vermerk":
      return ohneVermerkUebernehmen(austritt, aktion, opts.session, jetzt);
    default: {
      const unbekannt: never = aktion;
      throw new Error(`Unbekannte Aktion: ${JSON.stringify(unbekannt)}`);
    }
  }
}

/** Nimmt die Versandsperre des Austritts (G26) und gibt sie im `finally` frei – auch bei jeder Abweisung. */
async function mitVersandsperre(offboardingId: string, fn: () => Promise<DienstAntwort>): Promise<DienstAntwort> {
  const bereich = offboardingVersandBereich(offboardingId);
  if (!versandSperreNehmen(bereich)) {
    return { status: 409, body: { error: ABTEILUNGS_MELDUNGEN.VERSAND_LAEUFT, grund: "VERSAND_LAEUFT" } };
  }
  try {
    return await fn();
  } finally {
    versandSperreFreigeben(bereich);
  }
}

/**
 * Fuehrt die Transaktion aus; eine Abweisung darin – auch ein
 * `AusgabeKonflikt` aus dem Gleichlauf (S30) – wird zur Antwort (Rollback ist
 * geschehen).
 */
async function inTransaktion<T>(fn: (tx: Db) => Promise<T>): Promise<{ ok: true; wert: T } | { ok: false; antwort: DienstAntwort }> {
  try {
    return { ok: true, wert: await prisma.$transaction(fn) };
  } catch (err) {
    if (err instanceof ZuordnungAbgewiesen) return { ok: false, antwort: err.antwort };
    if (err instanceof AusgabeKonflikt) {
      return { ok: false, antwort: { status: 409, body: { error: MELDUNGEN_AUSGABEN[err.grund], grund: err.grund } } };
    }
    throw err;
  }
}

/**
 * Das bedingte `updateMany` auf den Austritt traf nichts: erneut lesen und den
 * Grund nennen – unbekannt (404), abgeschlossen bzw. abgebrochen oder `sonst`
 * (409).
 */
async function austrittSperreAbweisen(
  tx: Db,
  offboardingId: string,
  sonst: "BEREITS_ZUGEORDNET" | "INZWISCHEN_GEAENDERT",
): Promise<never> {
  const stand = await tx.offboardingProcess.findUnique({ where: { id: offboardingId }, select: { status: true } });
  if (!stand) abweisen(404, VORGANG_NICHT_GEFUNDEN);
  if (!austrittLaeuft(stand.status)) {
    abweisen(409, MELDUNGEN_AUSGABEN.VORGANG_ABGESCHLOSSEN, "VORGANG_ABGESCHLOSSEN");
  }
  abweisen(409, MELDUNGEN_AUSGABEN[sonst], sonst);
}

/**
 * Sperrt einen zugeordneten Austritt (G24, erster Schritt von Loesen,
 * Aktualisieren und „Als ausgegeben übernehmen“): bedingt auf die gelesene
 * Einstellung und „laufend“; `data` schreibt dabei z. B. den Merker. 0 Treffer
 * → 409 (`INZWISCHEN_GEAENDERT` bzw. `VORGANG_ABGESCHLOSSEN`).
 */
async function zugeordnetenAustrittSperrenIn(
  tx: Db,
  offboardingId: string,
  onboardingId: string,
  data: Prisma.OffboardingProcessUpdateManyMutationInput,
): Promise<void> {
  const r = await tx.offboardingProcess.updateMany({
    where: { id: offboardingId, onboardingId, status: { notIn: [...OFFBOARDING_ENDSTATUS] } },
    data,
  });
  if (r.count === 0) await austrittSperreAbweisen(tx, offboardingId, "INZWISCHEN_GEAENDERT");
}

/** Der Austritt frisch nach seiner Sperre – Arbeitsort, letzter Arbeitstag, Merker. */
async function austrittNachSperreLaden(tx: Db, offboardingId: string) {
  const a = await tx.offboardingProcess.findUnique({
    where: { id: offboardingId },
    select: { organizationId: true, arbeitsortId: true, lastWorkingDay: true, weitereBeschaeftigung: true },
  });
  if (!a) abweisen(404, VORGANG_NICHT_GEFUNDEN);
  return a;
}

/** Der frische Reiter nach einer Aktion (Austritt neu gelesen). */
async function uebersichtNachAktion(offboardingId: string, session: SessionPayload): Promise<RueckgabenUebersicht | null> {
  const austritt = await prisma.offboardingProcess.findUnique({ where: { id: offboardingId }, select: AUSTRITT_AUSWAHL });
  return austritt ? uebersichtBauen(prisma, austritt, session) : null;
}

/** Meldung einer Uebernahme: was neu ist, was herausfiel. */
function uebernahmeMeldung(u: UebernahmeErgebnis, ohneNeues: string | null): string {
  return saetze(
    MELDUNGEN_AUSGABEN.UEBERNOMMEN(u.rueckgaben, u.sperraufgaben) || ohneNeues,
    u.herausgefallen > 0 && MELDUNGEN_AUSGABEN.HERAUSGEFALLEN(u.herausgefallen),
  );
}

/** Protokoll der Uebernahme (Anzahlen, nie Kennung oder Namen). */
function uebernahmeDetails(u: UebernahmeErgebnis): Prisma.InputJsonObject {
  return {
    rueckgaben: u.rueckgaben,
    sperraufgaben: u.sperraufgaben,
    hinweise: u.hinweise,
    herausgefallen: u.herausgefallen,
    stellen: u.stellen,
    linksVerlaengert: u.verlaengert,
  };
}

const etwasUebernommen = (u: UebernahmeErgebnis) =>
  u.rueckgaben + u.sperraufgaben + u.hinweise + u.herausgefallen > 0;

// ---- Zuordnen (G11 bis G14) ----

/** „Zuordnen“ (Feinplan 1.7, Schritte 1 bis 3.9). */
async function zuordnen(
  austritt: AustrittFuerEinstellung,
  aktion: Extract<EinstellungAktionInput, { aktion: "zuordnen" }>,
  session: SessionPayload,
  jetzt: Date,
): Promise<DienstAntwort> {
  // 1. Die Einstellung: unbekannt, fremder Mandant oder keine EINSTELLUNG = dieselbe 404.
  const einstellung = await einstellungLaden(prisma, aktion.onboardingId, session);
  if (!einstellung) return EINSTELLUNG_NICHT_GEFUNDEN;
  const weitereBeschaeftigung = aktion.weitereBeschaeftigung ?? weitereBeschaeftigungVorbelegung(austritt.exitType);
  const { stufe, gruende } = bewertung(austritt, einstellung);

  // 2. Versandsperre des Austritts (G26).
  return mitVersandsperre(austritt.id, async () => {
    const ergebnis = await inTransaktion(async (tx) => {
      // 3.1 Austritt sperren und zugleich zuordnen – nur ohne Zuordnung und nur laufend.
      const gesperrt = await tx.offboardingProcess.updateMany({
        where: { id: austritt.id, onboardingId: null, status: { notIn: [...OFFBOARDING_ENDSTATUS] } },
        data: { onboardingId: einstellung.id, weitereBeschaeftigung },
      });
      if (gesperrt.count === 0) await austrittSperreAbweisen(tx, austritt.id, "BEREITS_ZUGEORDNET");

      // 3.2 Einstellung sperren (G24: nach dem Austritt). EXPIRED → abgesagt.
      if (!(await vorgangSperrenIn(tx, einstellung.id, { jetzt, auch: ["COMPLETED"] }))) {
        abweisen(409, MELDUNGEN_AUSGABEN.EINSTELLUNG_ABGESAGT, "EINSTELLUNG_ABGESAGT");
      }
      const andere = await tx.offboardingProcess.count({
        where: { onboardingId: einstellung.id, id: { not: austritt.id }, status: { notIn: [...OFFBOARDING_ENDSTATUS] } },
      });
      if (andere > 0) abweisen(409, MELDUNGEN_AUSGABEN.EINSTELLUNG_VERGEBEN, "EINSTELLUNG_VERGEBEN");

      // 3.3 Arbeitsort (G12) – Einstellung, Austritt und Links frisch unter den Sperren gelesen.
      const frisch = await tx.onboardingProcess.findUnique({
        where: { id: einstellung.id },
        select: { organizationId: true, arbeitsortId: true },
      });
      const einstellungOrte = {
        id: einstellung.id,
        organizationId: frisch?.organizationId ?? einstellung.organizationId,
        arbeitsortId: (frisch ?? einstellung).arbeitsortId ?? null,
      };
      const austrittFrisch = await austrittNachSperreLaden(tx, austritt.id);
      const links = await tx.offboardingDepartmentLink.findMany({
        where: { offboardingId: austritt.id },
        select: { sentAt: true, lastSentAt: true },
      });
      const ort = arbeitsortBeiZuordnung({
        austritt: { organizationId: austrittFrisch.organizationId },
        einstellung: einstellungOrte,
        links,
      });
      if (ort.grund === "UEBERNOMMEN") {
        await tx.offboardingProcess.update({ where: { id: austritt.id }, data: { arbeitsortId: ort.arbeitsortId } });
      }

      // 3.4–3.8 Rueckgabe-Vorschlag bzw. Auswahl uebernehmen (G13, G14).
      const uebernahme = await rueckgabenUebernehmenIn(tx, {
        austritt: {
          id: austritt.id,
          organizationId: austrittFrisch.organizationId,
          arbeitsortId: ort.grund === "UEBERNOMMEN" ? ort.arbeitsortId : (austrittFrisch.arbeitsortId ?? null),
          lastWorkingDay: austrittFrisch.lastWorkingDay,
        },
        einstellung: einstellungOrte,
        weitereBeschaeftigung,
        nur: aktion.uebernehmen,
        userId: session.userId,
        jetzt,
      });

      // 3.9 Protokoll im selben Commit – Begruendungsschluessel und Anzahlen,
      // keine Namen, keine Adressen, keine Kennung (G22).
      await tx.auditLog.create({
        data: {
          userId: session.userId,
          offboardingId: austritt.id,
          onboardingId: einstellung.id,
          processType: "OFFBOARDING",
          action: AUSGABEN_AUDIT.EINSTELLUNG_ZUGEORDNET,
          details: {
            stufe,
            gruende: gruende.map((g) => g.schluessel),
            arbeitsortUebernommen: ort.grund === "UEBERNOMMEN",
            weitereBeschaeftigung,
          } satisfies Prisma.InputJsonObject,
        },
      });
      if (etwasUebernommen(uebernahme)) {
        await tx.auditLog.create({
          data: {
            userId: session.userId,
            offboardingId: austritt.id,
            onboardingId: einstellung.id,
            processType: "OFFBOARDING",
            action: AUSGABEN_AUDIT.RUECKGABEN_VORGESCHLAGEN,
            details: { ...uebernahmeDetails(uebernahme), auswahl: !!aktion.uebernehmen },
          },
        });
      }
      return { ort, uebernahme };
    });
    if (!ergebnis.ok) return ergebnis.antwort;

    const data = await uebersichtNachAktion(austritt.id, session);
    const ortName = ergebnis.wert.ort.grund === "UEBERNOMMEN" ? data?.arbeitsort?.name || null : null;
    return {
      status: 200,
      body: {
        data,
        meldung: saetze(
          MELDUNGEN_AUSGABEN.ZUGEORDNET(nummer(einstellung.displayId), ortName),
          uebernahmeMeldung(ergebnis.wert.uebernahme, null),
        ),
      },
    };
  });
}

// ---- Rueckgaben aktualisieren (G13) ----

/**
 * „Rückgaben aktualisieren“ (Feinplan 1.7, Schritt 4): Versandsperre →
 * Austritt sperren (bedingt auf die gelesene Einstellung und „laufend“; ein
 * mitgeschicktes `weitereBeschaeftigung` wird dabei gespeichert) → ab Schritt
 * 3.4 mit dem GESPEICHERTEN Merker. `ausgabeIds` = genau diese Stuecke (etwa
 * ein Hinweis, den HR doch uebernimmt). Fehlendes kommt dazu, nichts doppelt.
 */
async function aktualisieren(
  austritt: AustrittFuerEinstellung,
  aktion: Extract<EinstellungAktionInput, { aktion: "aktualisieren" }>,
  session: SessionPayload,
  jetzt: Date,
): Promise<DienstAntwort> {
  const gelesen = austritt.onboardingId;
  if (!gelesen) return { status: 409, body: { error: MELDUNGEN_AUSGABEN.KEINE_ZUORDNUNG, grund: "KEINE_ZUORDNUNG" } };
  const merkerNeu = aktion.weitereBeschaeftigung;

  return mitVersandsperre(austritt.id, async () => {
    const ergebnis = await inTransaktion(async (tx) => {
      await zugeordnetenAustrittSperrenIn(
        tx,
        austritt.id,
        gelesen,
        merkerNeu === undefined ? { updatedAt: jetzt } : { weitereBeschaeftigung: merkerNeu },
      );
      const frisch = await austrittNachSperreLaden(tx, austritt.id);
      const einstellung = await tx.onboardingProcess.findUnique({
        where: { id: gelesen },
        select: { id: true, organizationId: true, arbeitsortId: true },
      });
      if (!einstellung) abweisen(404, MELDUNGEN_AUSGABEN.EINSTELLUNG_NICHT_GEFUNDEN);

      const uebernahme = await rueckgabenUebernehmenIn(tx, {
        austritt: {
          id: austritt.id,
          organizationId: frisch.organizationId,
          arbeitsortId: frisch.arbeitsortId ?? null,
          lastWorkingDay: frisch.lastWorkingDay,
        },
        einstellung: { ...einstellung, arbeitsortId: einstellung.arbeitsortId ?? null },
        weitereBeschaeftigung: frisch.weitereBeschaeftigung ?? null,
        nur: aktion.ausgabeIds,
        userId: session.userId,
        jetzt,
      });

      const merkerGeaendert = merkerNeu !== undefined && merkerNeu !== (austritt.weitereBeschaeftigung ?? null);
      if (uebernahme.rueckgaben + uebernahme.sperraufgaben > 0 || merkerGeaendert) {
        await tx.auditLog.create({
          data: {
            userId: session.userId,
            offboardingId: austritt.id,
            onboardingId: gelesen,
            processType: "OFFBOARDING",
            action: AUSGABEN_AUDIT.RUECKGABEN_AKTUALISIERT,
            details: {
              ...uebernahmeDetails(uebernahme),
              auswahl: !!aktion.ausgabeIds,
              weitereBeschaeftigungGeaendert: merkerGeaendert,
              ...(merkerGeaendert ? { weitereBeschaeftigung: merkerNeu } : {}),
            },
          },
        });
      }
      return { uebernahme, merkerGeaendert };
    });
    if (!ergebnis.ok) return ergebnis.antwort;

    const { uebernahme, merkerGeaendert } = ergebnis.wert;
    return {
      status: 200,
      body: {
        data: await uebersichtNachAktion(austritt.id, session),
        meldung: saetze(
          uebernahmeMeldung(uebernahme, MELDUNGEN_AUSGABEN.NICHTS_NEU),
          merkerGeaendert && merkerNeu !== undefined && MELDUNGEN_AUSGABEN.MERKER_GESPEICHERT(merkerNeu),
        ),
      },
    };
  });
}

// ---- Als ausgegeben uebernehmen (G13) ----

/**
 * „Als ausgegeben übernehmen“ (Feinplan 1.7, Schritt 5): Versandsperre →
 * Austritt sperren → Einstellung sperren (`vorgangSperrenIn`, auch
 * COMPLETED und EXPIRED) → `ohneVermerk` NACH der Sperre neu rechnen → je
 * gewaehlter, noch passender Aufgabe EINE Ausgabe (`quelle` HR, ohne Kennung,
 * Datum = Berliner Tag der Erledigung; nach einer Absage mit deren Frist, G10)
 * → Schritte 3.4 bis 3.9 mit dem gespeicherten Merker. Aufgaben, die
 * inzwischen einen Vermerk haben oder entfallen sind, werden uebersprungen.
 */
async function ohneVermerkUebernehmen(
  austritt: AustrittFuerEinstellung,
  aktion: Extract<EinstellungAktionInput, { aktion: "ohne-vermerk" }>,
  session: SessionPayload,
  jetzt: Date,
): Promise<DienstAntwort> {
  const gelesen = austritt.onboardingId;
  if (!gelesen) return { status: 409, body: { error: MELDUNGEN_AUSGABEN.KEINE_ZUORDNUNG, grund: "KEINE_ZUORDNUNG" } };

  return mitVersandsperre(austritt.id, async () => {
    const ergebnis = await inTransaktion(async (tx) => {
      await zugeordnetenAustrittSperrenIn(tx, austritt.id, gelesen, { updatedAt: jetzt });
      if (!(await vorgangSperrenIn(tx, gelesen, { jetzt, auch: ["COMPLETED", "EXPIRED"] }))) {
        abweisen(404, MELDUNGEN_AUSGABEN.EINSTELLUNG_NICHT_GEFUNDEN);
      }
      const frisch = await austrittNachSperreLaden(tx, austritt.id);
      const einstellung = await tx.onboardingProcess.findUnique({
        where: { id: gelesen },
        select: { id: true, organizationId: true, arbeitsortId: true, status: true, expiredAt: true },
      });
      const bestand = await bestandDerEinstellungLaden(tx, gelesen);
      if (!einstellung || !bestand) abweisen(404, MELDUNGEN_AUSGABEN.EINSTELLUNG_NICHT_GEFUNDEN);

      // Neu gerechnet nach der Sperre der Einstellung (kein Vermerk dazwischen).
      const waehlbar = new Map(
        rueckgabeLageAnzeige(bestand).ohneVermerk.map((e) => [e.checklistItemId, e] as const),
      );
      const heute = berlinerKalendertag(jetzt);
      // G10: Nach einer Absage traegt auch dieses Stueck deren Frist.
      const vorgangEingestelltAm = einstellung.status === "EXPIRED" ? (einstellung.expiredAt ?? jetzt) : null;
      const angelegt: { checklistItemId: string; ausgabeId: string }[] = [];
      for (const id of aktion.checklistItemIds) {
        const eintrag = waehlbar.get(id);
        if (!eintrag) continue;
        const ziel = await vermerkZielLadenIn(tx, gelesen, id);
        if (!ziel || vermerkZielGrund(ziel)) continue;
        const basis = ausgabeBasis(ziel, { vorgang: einstellung, quelle: "HR", erfasstVonId: session.userId });
        const ausgabeId = await ausgabeOhneVermerkAnlegenIn(tx, basis, eintrag.erledigtAm ?? heute, jetzt, {
          vorgangEingestelltAm,
        });
        angelegt.push({ checklistItemId: id, ausgabeId });
      }
      const uebersprungen = aktion.checklistItemIds.length - angelegt.length;
      if (angelegt.length === 0) return { angelegt, uebersprungen, uebernahme: { ...NICHTS_UEBERNOMMEN } };

      const uebernahme = await rueckgabenUebernehmenIn(tx, {
        austritt: {
          id: austritt.id,
          organizationId: frisch.organizationId,
          arbeitsortId: frisch.arbeitsortId ?? null,
          lastWorkingDay: frisch.lastWorkingDay,
        },
        einstellung: { id: einstellung.id, organizationId: einstellung.organizationId, arbeitsortId: einstellung.arbeitsortId ?? null },
        weitereBeschaeftigung: frisch.weitereBeschaeftigung ?? null,
        userId: session.userId,
        jetzt,
      });

      await tx.auditLog.create({
        data: {
          userId: session.userId,
          offboardingId: austritt.id,
          onboardingId: gelesen,
          processType: "OFFBOARDING",
          action: AUSGABEN_AUDIT.AUSGABE_UEBERNOMMEN,
          details: {
            anzahl: angelegt.length,
            checklistItemIds: angelegt.map((a) => a.checklistItemId),
            ausgabeIds: angelegt.map((a) => a.ausgabeId),
            uebersprungen,
          },
        },
      });
      if (uebernahme.rueckgaben + uebernahme.sperraufgaben > 0) {
        await tx.auditLog.create({
          data: {
            userId: session.userId,
            offboardingId: austritt.id,
            onboardingId: gelesen,
            processType: "OFFBOARDING",
            action: AUSGABEN_AUDIT.RUECKGABEN_AKTUALISIERT,
            details: { ...uebernahmeDetails(uebernahme), auswahl: false, weitereBeschaeftigungGeaendert: false },
          },
        });
      }
      return { angelegt, uebersprungen, uebernahme };
    });
    if (!ergebnis.ok) return ergebnis.antwort;

    const { angelegt, uebersprungen, uebernahme } = ergebnis.wert;
    return {
      status: 200,
      body: {
        data: await uebersichtNachAktion(austritt.id, session),
        meldung: saetze(
          angelegt.length > 0 && MELDUNGEN_AUSGABEN.ALS_AUSGEGEBEN_UEBERNOMMEN(angelegt.length),
          uebernahmeMeldung(uebernahme, null),
          uebersprungen > 0 && MELDUNGEN_AUSGABEN.OHNE_VERMERK_UEBERSPRUNGEN(uebersprungen),
        ),
      },
    };
  });
}

// ---- Loesen (G11) ----

/**
 * „Lösen …“ (Feinplan 1.7, Ablauf „Lösen“):
 *
 *   2.1 Austritt sperren (bedingt auf die gelesene Einstellung, laufend);
 *   2.2 Bedingungen NACH der Sperre: keine Aufgabe mit `herkunft` erledigt,
 *       keine vorgeschlagene Rueckgabe mit Zustand (`loesenGesperrt`) – sonst
 *       409 LOESEN_GESPERRT ohne jede Aenderung;
 *   2.3 Links der Stellen dieser Aufgaben sperren (nach Schluessel);
 *   2.4 die Aufgaben (AUSGABE, AUSGABE_FEHLT) loeschen, danach die
 *       Rueckgaben mit `ausgabeId` (G24) – bedingt auf „offen“, trifft das
 *       nicht alle, Rollback und 409; die Ausgaben bleiben unveraendert;
 *   2.5 `linkStatusNeuBerechnenIn` fuer diese Stellen, OHNE Mail (eine Stelle
 *       mit sonst erledigten Aufgaben steht danach auf „fertig“);
 *   2.6 Arbeitsort zurueck, nur solange keine Stelle informiert ist;
 *       Bezug und Merker zurueck;
 *   2.7 Protokoll mit Anzahlen.
 */
async function loesen(austritt: AustrittFuerEinstellung, session: SessionPayload, jetzt: Date): Promise<DienstAntwort> {
  const gelesen = austritt.onboardingId;
  if (!gelesen) {
    return { status: 409, body: { error: MELDUNGEN_AUSGABEN.KEINE_ZUORDNUNG, grund: "KEINE_ZUORDNUNG" } };
  }
  const einstellung = await prisma.onboardingProcess.findUnique({ where: { id: gelesen }, select: { displayId: true } });

  return mitVersandsperre(austritt.id, async () => {
    const ergebnis = await inTransaktion(async (tx) => {
      // 2.1 Austritt sperren – bedingt auf die gelesene Einstellung und laufend.
      await zugeordnetenAustrittSperrenIn(tx, austritt.id, gelesen, { updatedAt: jetzt });

      // 2.2 Bedingungen erneut pruefen (unter der Sperre).
      const aufgaben = await tx.offboardingChecklistItem.findMany({
        where: { offboardingId: austritt.id, herkunft: { in: [...OFFBOARDING_AUFGABEN_HERKUNFT] } },
        select: { id: true, herkunft: true, isCompleted: true, assigneeDepartment: true },
      });
      const rueckgaben = await tx.returnItem.findMany({
        where: { offboardingId: austritt.id, ausgabeId: { not: null } },
        select: { id: true, zustand: true, isReturned: true, ausgabeId: true },
      });
      if (loesenGesperrt({ aufgaben, rueckgaben })) {
        abweisen(409, MELDUNGEN_AUSGABEN.LOESEN_GESPERRT, "LOESEN_GESPERRT");
      }

      // 2.3 Links der Stellen dieser Aufgaben (G24: vor den Aufgaben).
      const stellen = [...new Set(aufgaben.map((a) => a.assigneeDepartment).filter((k): k is string => !!k))];
      await linksSperrenIn(tx, offboardingVersandBereich(austritt.id), stellen);

      // 2.4 Erst die Aufgaben, dann die Rueckgaben – bedingt auf „offen“ (Netz).
      if (aufgaben.length > 0) {
        const r = await tx.offboardingChecklistItem.deleteMany({
          where: {
            offboardingId: austritt.id,
            herkunft: { in: [...OFFBOARDING_AUFGABEN_HERKUNFT] },
            isCompleted: false,
          },
        });
        if (r.count !== aufgaben.length) abweisen(409, MELDUNGEN_AUSGABEN.LOESEN_GESPERRT, "LOESEN_GESPERRT");
      }
      if (rueckgaben.length > 0) {
        const r = await tx.returnItem.deleteMany({
          where: { offboardingId: austritt.id, ausgabeId: { not: null }, zustand: null, isReturned: false },
        });
        if (r.count !== rueckgaben.length) abweisen(409, MELDUNGEN_AUSGABEN.LOESEN_GESPERRT, "LOESEN_GESPERRT");
      }

      // 2.5 Abteilungsstatus der betroffenen Stellen – ohne Mail.
      if (stellen.length > 0) await linkStatusProtokollieren(tx, austritt.id, stellen, session.userId, jetzt);

      // 2.6 Arbeitsort nur zurueck, solange keine Stelle informiert ist (G12).
      const frisch = await tx.offboardingProcess.findUnique({
        where: { id: austritt.id },
        select: { arbeitsortId: true },
      });
      const links = await tx.offboardingDepartmentLink.findMany({
        where: { offboardingId: austritt.id },
        select: { sentAt: true, lastSentAt: true },
      });
      const informiert = informierteStellen(links);
      const hatteArbeitsort = !!frisch?.arbeitsortId;
      await tx.offboardingProcess.update({
        where: { id: austritt.id },
        data: { onboardingId: null, weitereBeschaeftigung: null, ...(informiert === 0 ? { arbeitsortId: null } : {}) },
      });

      // 2.7 Protokoll im selben Commit (G22) – nur Anzahlen.
      const arbeitsortZurueckgesetzt = informiert === 0 && hatteArbeitsort;
      await tx.auditLog.create({
        data: {
          userId: session.userId,
          offboardingId: austritt.id,
          onboardingId: gelesen,
          processType: "OFFBOARDING",
          action: AUSGABEN_AUDIT.EINSTELLUNG_GELOEST,
          details: {
            geloeschteAufgaben: aufgaben.length,
            geloeschteRueckgaben: rueckgaben.length,
            informierteStellen: informiert,
            arbeitsortZurueckgesetzt,
          } satisfies Prisma.InputJsonObject,
        },
      });
      return arbeitsortZurueckgesetzt ? ("ZURUECKGESETZT" as const) : hatteArbeitsort ? ("BLEIBT" as const) : null;
    });
    if (!ergebnis.ok) return ergebnis.antwort;

    const data = await uebersichtNachAktion(austritt.id, session);
    return {
      status: 200,
      body: { data, meldung: MELDUNGEN_AUSGABEN.GELOEST(nummer(einstellung?.displayId), ergebnis.wert) },
    };
  });
}

// =============================================
// PATCH /api/offboarding/[id]/return-items – eine Zeile im Reiter „Rückgaben“ (G15, G16; S30)
// =============================================

const GEGENSTAND_NICHT_GEFUNDEN: DienstAntwort = {
  status: 404,
  body: { error: MELDUNGEN_AUSGABEN.GEGENSTAND_NICHT_GEFUNDEN },
};

/** Freitextfelder einer Rueckgabe-Zeile, die der Reiter aendert (Zustand kommt getrennt). */
type ZeilenFelder = { serialNumber?: string | null; condition?: string | null; notes?: string | null };

/**
 * PATCH /api/offboarding/[id]/return-items — Zustand, Kennung, Zustandstext
 * oder Notiz einer Rueckgabe-Zeile im Reiter „Rückgaben“ (G15, G16). Die
 * Route ist duenn (Rolle `HR_EDIT_ROLES`, Body `rueckgabeAendernSchema`).
 *
 *   403 { error: "Keine Berechtigung" }
 *   404 { error: "Vorgang nicht gefunden" }                unbekannt ODER fremder Mandant
 *   404 { error: "Rückgabe-Gegenstand nicht gefunden" }    unbekannt ODER aus einem anderen Austritt
 *   400 { error }                                          Kennung einer Zeile aus der Einstellung
 *                                                          (`kennungSchema`: ≤ 60, einzeilig, ohne < >)
 *   409 { error }                                          abgebrochen; Stand inzwischen geaendert
 *   409 { error, grund }                                   AUSGABE_IM_AUSTRITT | AUSGABE_FREIGEGEBEN |
 *                                                          NICHT_AUSGEGEBEN | STUECK_INZWISCHEN_GEAENDERT
 *   200 { item }                                           auch ohne Aenderung (dann nichts geschrieben)
 *
 * Zustand: `zustand` (einer der fuenf, `null` = wieder offen) oder die Altform
 * `isReturned` (`true` = ZURUECK, `false` = offen); `isReturned` folgt
 * (`rueckgabeDaten`). Jeder schreibende Weg sperrt zuerst den Austritt
 * (bedingt auf „nicht CANCELLED“ – der Abschluss zaehlt offene Rueckgaben
 * unter derselben Sperre, G18). Bedingt auf den gelesenen `zustand` UND
 * `isReturned`: Zwei gleichzeitige Wechsel ueberschrieben sich sonst still
 * (409 „inzwischen geändert“) – auch an Zeilen, die HR selbst erfasst hat.
 *
 * Zeilen aus der Einstellung (`ausgabeId`), wenn Zustand oder Kennung sich
 * aendern (Feinplan 1.7, „Reiter Rückgaben“): Austritt → Links der
 * Aufgabenstelle (+ FACILITY, wenn ein Schluessel FEHLT setzt oder verlaesst)
 * → Aufgabe → Ausgabe sperren und Bindung pruefen (ein ANDERER Austritt
 * bindet sie bzw. sie ist freigegeben → 409) → Kennung zieht die Ausgabe mit
 * (`ausgabeKorrigierenIn`, nur an einem aktiven Stueck) → Zustand ueber
 * `ausgabeGleichlaufIn` (Aufgabe mit `completedById` HR, Ausgabe, Zeile,
 * Folgeaufgabe; keine Mail) → Abteilungsstatus der betroffenen Stellen. Ein
 * abgeschlossener Austritt nimmt hier die spaete Rueckgabe eines offen
 * gebliebenen Stuecks auf (es ist noch an ihn gebunden). Protokoll
 * `RETURN_ITEM_UPDATED` nur mit ID, Kategorie, Feldnamen und Zustand – nie
 * Freitext.
 */
export async function rueckgabeAendern(opts: {
  offboardingId: string;
  eingabe: RueckgabeAendernInput;
  session: SessionPayload;
  jetzt?: Date;
}): Promise<DienstAntwort> {
  const jetzt = opts.jetzt ?? new Date();
  const { eingabe, session, offboardingId } = opts;
  if (!HR_EDIT_ROLES.includes(session.role)) return KEINE_BERECHTIGUNG;

  const austritt = await prisma.offboardingProcess.findUnique({
    where: { id: offboardingId },
    select: { organizationId: true, status: true },
  });
  if (!austritt || !(await canAccessProcess(session, austritt.organizationId))) return AUSTRITT_NICHT_GEFUNDEN;
  const vorhanden = await prisma.returnItem.findFirst({ where: { id: eingabe.itemId, offboardingId } });
  if (!vorhanden) return GEGENSTAND_NICHT_GEFUNDEN;

  // Kennung einer Zeile aus der Einstellung: dasselbe Schema wie der Vermerk
  // (G15) – sie geht in die Ausgabe, in webhookfreie Mails und ins Protokoll.
  let serialNumber = eingabe.serialNumber;
  if (vorhanden.ausgabeId && serialNumber !== undefined) {
    const kennung = kennungSchema.safeParse(serialNumber);
    if (!kennung.success) {
      return { status: 400, body: { error: kennung.error.errors[0]?.message ?? MELDUNGEN_AUSGABEN.KENNUNG_UNGUELTIG } };
    }
    serialNumber = kennung.data;
  }

  const ziel = rueckgabeZielAusEingabe(eingabe);
  const zustandWechsel = ziel !== undefined && ziel !== rueckgabeZustand(vorhanden);
  const felder: ZeilenFelder = {};
  const geaenderteFelder: string[] = [];
  if (zustandWechsel) geaenderteFelder.push(eingabe.zustand !== undefined ? "zustand" : "isReturned");
  const kandidaten: [keyof ZeilenFelder, string | null | undefined][] = [
    ["serialNumber", serialNumber],
    ["condition", eingabe.condition],
    ["notes", eingabe.notes],
  ];
  for (const [feld, wert] of kandidaten) {
    if (wert !== undefined && wert !== vorhanden[feld]) {
      felder[feld] = wert;
      geaenderteFelder.push(feld);
    }
  }
  // Nichts zu tun (etwa die Rueckgabe ein zweites Mal bestaetigt): kein
  // Schreiben, kein Protokoll – Zeitpunkt und Person der ersten bleiben.
  if (geaenderteFelder.length === 0) return { status: 200, body: { item: vorhanden } };
  if (austritt.status === "CANCELLED") {
    return { status: 409, body: { error: MELDUNGEN_AUSGABEN.RUECKGABEN_ABGEBROCHEN } };
  }
  const zielZustand = zustandWechsel ? (ziel ?? null) : undefined;
  const mitAusgabe = !!vorhanden.ausgabeId && (zustandWechsel || felder.serialNumber !== undefined);

  const ergebnis = await inTransaktion(async (tx) => {
    // 1. Austritt sperren – bedingt auf „nicht CANCELLED“ (G18).
    const gesperrt = await tx.offboardingProcess.updateMany({
      where: { id: offboardingId, status: { not: "CANCELLED" } },
      data: { updatedAt: jetzt },
    });
    if (gesperrt.count === 0) {
      const stand = await tx.offboardingProcess.findUnique({ where: { id: offboardingId }, select: { status: true } });
      if (!stand) abweisen(404, VORGANG_NICHT_GEFUNDEN);
      abweisen(409, MELDUNGEN_AUSGABEN.RUECKGABEN_ABGEBROCHEN);
    }

    let isReturnedNeu: boolean | undefined;
    if (mitAusgabe && vorhanden.ausgabeId) {
      isReturnedNeu = await zeileMitAusgabeAendernIn(tx, {
        offboardingId,
        vorhanden: { ...vorhanden, ausgabeId: vorhanden.ausgabeId },
        zielZustand,
        felder,
        session,
        jetzt,
      });
    } else {
      // Zeile ohne Ausgabe (bzw. nur Zustandstext und Notiz): bedingt auf den gelesenen Stand.
      const daten: Prisma.ReturnItemUpdateManyMutationInput = {
        ...(zielZustand !== undefined ? rueckgabeDaten(zielZustand, jetzt, session.userId) : {}),
        ...felder,
      };
      const { count } = await tx.returnItem.updateMany({
        where: {
          id: vorhanden.id,
          offboardingId,
          isReturned: vorhanden.isReturned,
          zustand: vorhanden.zustand ?? null,
        },
        data: daten,
      });
      if (count === 0) abweisen(409, MELDUNGEN_AUSGABEN.RUECKGABE_INZWISCHEN_GEAENDERT);
      if (zielZustand !== undefined) isReturnedNeu = rueckgabeDaten(zielZustand, jetzt, null).isReturned;
    }

    await tx.auditLog.create({
      data: {
        offboardingId,
        userId: session.userId,
        processType: "OFFBOARDING",
        action: "RETURN_ITEM_UPDATED",
        // Nur ID, Kategorie, Feldnamen und Zustand – nie Freitext (Gegenstand, Kennung, Notiz).
        details: {
          returnItemId: vorhanden.id,
          category: vorhanden.category,
          geaenderteFelder,
          ...(zielZustand !== undefined ? { zustand: zielZustand, isReturned: isReturnedNeu ?? false } : {}),
        },
      },
    });
    return tx.returnItem.findUnique({ where: { id: vorhanden.id } });
  });
  if (!ergebnis.ok) return ergebnis.antwort;
  if (!ergebnis.wert) return { status: 409, body: { error: MELDUNGEN_AUSGABEN.RUECKGABE_INZWISCHEN_GEAENDERT } };
  return { status: 200, body: { item: ergebnis.wert } };
}

/**
 * Eine Zeile aus der Einstellung, wenn Zustand oder Kennung sich aendern –
 * in der Transaktion von `rueckgabeAendern`, NACH der Sperre des Austritts
 * (Reihenfolge G24: Links → Aufgabe → Ausgabe → Zeile). Antwort: `isReturned`
 * danach (fuer das Protokoll), `undefined` ohne Zustandswechsel.
 */
async function zeileMitAusgabeAendernIn(
  tx: Db,
  opts: {
    offboardingId: string;
    vorhanden: { id: string; ausgabeId: string; zustand: string | null; isReturned: boolean };
    zielZustand: RueckgabeZustand | null | undefined;
    felder: ZeilenFelder;
    session: SessionPayload;
    jetzt: Date;
  },
): Promise<boolean | undefined> {
  const { offboardingId, vorhanden, zielZustand, felder, session, jetzt } = opts;

  // Die Zeile unter der Sperre des Austritts: Stand wie gelesen?
  const frisch = await tx.returnItem.findFirst({
    where: { id: vorhanden.id, offboardingId },
    select: { zustand: true, isReturned: true, ausgabeId: true },
  });
  if (
    !frisch ||
    frisch.ausgabeId !== vorhanden.ausgabeId ||
    (frisch.zustand ?? null) !== (vorhanden.zustand ?? null) ||
    frisch.isReturned !== vorhanden.isReturned
  ) {
    abweisen(409, MELDUNGEN_AUSGABEN.RUECKGABE_INZWISCHEN_GEAENDERT);
  }

  // Die Ausgabe (Stelle, Kategorie und Zustand aendert unter der Sperre des
  // Austritts kein anderer Weg) und die Stelle der Ruecknahmeaufgabe.
  const [ausgabe] = await ausgabenNachIdLaden(tx, [vorhanden.ausgabeId]);
  if (!ausgabe) abweisen(409, MELDUNGEN_AUSGABEN.STUECK_INZWISCHEN_GEAENDERT, "STUECK_INZWISCHEN_GEAENDERT");
  const aufgabe = await tx.offboardingChecklistItem.findFirst({
    where: { offboardingId, ausgabeId: ausgabe.id, herkunft: "AUSGABE" },
    select: { assigneeDepartment: true },
  });
  // „Offen“ nach einem hier gesetzten Zustand heisst AUSGEGEBEN (G15) – dieselbe Regel wie im Gleichlauf.
  const nach =
    zielZustand !== undefined
      ? ausgabeNachZiel(zielZustand, ausgabe.zustand, rueckgabeZustand(vorhanden) !== null)
      : ausgabe.zustand;

  // Links der Aufgabenstelle (+ FACILITY fuer die Folgeaufgabe, G17) – vor Aufgaben und Ausgabe.
  await linksSperrenIn(tx, offboardingVersandBereich(offboardingId), [
    aufgabe?.assigneeDepartment ?? ausgabe.departmentKey,
    brauchtFolgeStelle(ausgabe, ausgabe.zustand, nach) ? FOLGE_STELLE : null,
  ]);

  // Ausgabe sperren, Bindung pruefen (G28). Bindet ein anderer Austritt das
  // Stueck, aendert dieser nichts daran. Hat dieser Austritt es mit „verbleibt“
  // freigegeben, bleibt ihm nur die Kennung (`ausgabenZeile` bietet
  // `korrigieren` auch dort an); den Zustand fuehrt die Karte bzw. der naechste
  // Austritt.
  const { sperre } = await ausgabeImAustrittSperrenIn(tx, { offboardingId, ausgabeId: ausgabe.id, jetzt, session });
  if (sperre && !(sperre.grund === "AUSGABE_FREIGEGEBEN" && zielZustand === undefined)) {
    abweisen(409, gleichlaufSperreText(sperre), sperre.grund);
  }

  // Kennung zieht die Ausgabe mit – nur an einem aktiven Stueck (Wiederoeffnen
  // im selben Aufruf: erst der Zustand, dann die Kennung).
  const kennungZuerst = istAktiv(ausgabe.zustand);
  const kennungKorrigieren = async () => {
    if (felder.serialNumber === undefined) return;
    if (!(await ausgabeKorrigierenIn(tx, ausgabe.id, { kennung: felder.serialNumber }))) {
      abweisen(409, MELDUNGEN_AUSGABEN.NICHT_AUSGEGEBEN, "NICHT_AUSGEGEBEN");
    }
  };
  if (kennungZuerst) await kennungKorrigieren();

  let isReturnedNeu: boolean | undefined;
  if (zielZustand !== undefined) {
    const gleichlauf = await ausgabeGleichlaufIn(tx, {
      offboardingId,
      ausgabeId: ausgabe.id,
      zustand: zielZustand,
      jetzt,
      userId: session.userId,
      aufgabeSchonGeschaltet: false,
      ueber: "RUECKGABEN",
    });
    if (gleichlauf.stellen.length > 0) {
      await linkStatusProtokollieren(tx, offboardingId, gleichlauf.stellen, session.userId, jetzt);
    }
    isReturnedNeu = rueckgabeDaten(zielZustand, jetzt, null).isReturned;
  }
  if (!kennungZuerst) await kennungKorrigieren();

  // Die uebrigen Felder (Kennung als Kopie, Zustandstext, Notiz).
  if (Object.keys(felder).length > 0) {
    await tx.returnItem.update({ where: { id: vorhanden.id }, data: felder });
  }
  return isReturnedNeu;
}
