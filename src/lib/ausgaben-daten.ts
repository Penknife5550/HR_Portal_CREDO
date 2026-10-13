/**
 * CREDO HR-Portal – Ausstattung & Zugaenge, Stufe 2 (Paket A4): Ausgaben LESEN
 *
 * Nur lesend (Feinplan A4, 1.5): Geschrieben wird `ausgaben` ausschliesslich
 * in src/lib/ausgaben-schreiben.ts (G3). Jede Funktion nimmt den Client bzw.
 * die Transaktion als Parameter (`db`), damit der Aufrufer nach seinen Sperren
 * frisch liest (G24, G28: „Austrittsbezug nach der Sperre der Ausgabe“).
 *
 *   ausgabenZuAufgabenLaden  Ausgaben je Ausstattungsaufgabe (Karte, eine Abfrage)
 *   ausgabeLaden             eine Ausgabe eines Vorgangs (unbekannt und fremd: null)
 *   aktiveAusgabenZaehlen    aktive Stuecke einer Aufgabe (Grenze aus G4)
 *   aktiveAusgabenJeStelleLaden  aktive Stuecke einer Einstellung je Stelle (Absage-Mail, G10, S27)
 *   austrittsBezuegeLaden    je Ausgabe die Austritte, die sie beziehen (G28)
 *   vermerkZielLadenIn       Aufgabe, Zeile, Option und Position eines Vermerks
 *   linkAusgabenLaden        Feld `ausgabe` je Aufgabe der Link-Seite einer Stelle (S25)
 *   bestandDerEinstellungLaden  Bestand der einem Austritt zugeordneten Einstellung
 *                            fuer die Lage des Reiters „Rückgaben“ (E-A36, S28)
 *   ausgabenNachIdLaden      Ausgaben per ID – frisch nach ihrer Sperre (S29)
 *   stellenNamenLaden        Anzeigenamen der Stellen an einer Einrichtung (S29)
 *   offboardingLinkAusgabenLaden  Feld `ausgabe` je Aufgabe der Offboarding-Link-Seite (S30)
 *
 * Keine Relationsfilter: Die Bezuege kommen ueber die indizierten Spalten
 * `ausgabeId` von Offboarding-Aufgaben und Rueckgaben, danach die Austritte
 * per `id`.
 */

import type { Prisma } from "@prisma/client";
import { canAccessProcess, type SessionPayload } from "@/lib/permissions";
import { empfaengerAufloesen } from "@/lib/abteilungsaufgaben";
import {
  AUSGABE_AKTIV,
  AUSGABE_BEI_AUSTRITT,
  OFFBOARDING_AUFGABEN_HERKUNFT,
  abgeloesteAustritte,
  linkAusgabeBauen,
  offboardingLinkAusgabeBauen,
  rueckgabeZustand,
  type AustrittsBezug,
  type BestandAufgabe,
  type EinstellungsBestand,
  type LinkAusgabe,
  type OffboardingFolgeAusgabe,
  type OffboardingLinkAusgabe,
  type RueckgabeZustand,
  type VermerkZiel,
} from "@/lib/ausgaben";

type Db = Prisma.TransactionClient;

/** Die Felder einer Ausgabe, die Karte, Dienst und Mails lesen – nie `employeeId` oder `erfasstVonId`. */
export const AUSGABE_AUSWAHL = {
  id: true,
  onboardingId: true,
  checklistItemId: true,
  organizationId: true,
  zentral: true,
  departmentKey: true,
  bezeichnung: true,
  kennungLabel: true,
  kennung: true,
  rueckgabeKategorie: true,
  beiAustritt: true,
  quelle: true,
  uebergebenAm: true,
  zustand: true,
  zustandAm: true,
  ersetztDurchId: true,
  loeschenAb: true,
  createdAt: true,
} as const satisfies Prisma.AusgabeSelect;

export type AusgabeDaten = Prisma.AusgabeGetPayload<{ select: typeof AUSGABE_AUSWAHL }>;

/** Reihenfolge der Stuecke in Karte und Mail: nach Uebergabe, dann nach Anlage. */
const AUSGABE_ORDNUNG: Prisma.AusgabeOrderByWithRelationInput[] = [{ uebergebenAm: "asc" }, { createdAt: "asc" }];

/**
 * Alle Ausgaben (jeder Zustand) dieser Ausstattungsaufgaben in EINER Abfrage.
 * Ohne Aufgabe keine Abfrage.
 */
export async function ausgabenZuAufgabenLaden(db: Db, checklistItemIds: ReadonlyArray<string>): Promise<AusgabeDaten[]> {
  const ids = [...new Set(checklistItemIds)];
  if (ids.length === 0) return [];
  return db.ausgabe.findMany({
    where: { checklistItemId: { in: ids } },
    select: AUSGABE_AUSWAHL,
    orderBy: AUSGABE_ORDNUNG,
  });
}

/**
 * Eine Ausgabe DIESES Vorgangs (Herkunft `onboardingId`) – `null` fuer
 * unbekannt UND fuer die Ausgabe eines anderen Vorgangs (dieselbe 404).
 */
export async function ausgabeLaden(db: Db, onboardingId: string, ausgabeId: string): Promise<AusgabeDaten | null> {
  return db.ausgabe.findFirst({ where: { id: ausgabeId, onboardingId }, select: AUSGABE_AUSWAHL });
}

/** Aktive Stuecke (AUSGEGEBEN, VERBLEIBT) an einer Aufgabe – fuer die Grenze `aktiveJeAufgabe` (G4). */
export async function aktiveAusgabenZaehlen(db: Db, checklistItemId: string): Promise<number> {
  return db.ausgabe.count({ where: { checklistItemId, zustand: { in: [...AUSGABE_AKTIV] } } });
}

/** Ein noch ausgegebenes Stueck fuer die Absage-Mail an seine Stelle (G10, `ausgabenListeMailFelder`). */
export interface AbsageAusgabe {
  departmentKey: string;
  bezeichnung: string;
  kennung: string | null;
  uebergebenAm: Date;
  zustand: string;
  beiAustritt: string;
}

/**
 * Die aktiven Ausgaben (AUSGEGEBEN, VERBLEIBT) einer Einstellung je
 * ausgebender Stelle (`departmentKey`) – fuer die Absage-Mail (G10): Jede
 * Stelle liest nur ihre eigenen Stuecke. EINE Abfrage, Reihenfolge wie in
 * Karte und Mail; nur die Felder der Mailzeile (Bezeichnung, Kennung,
 * Uebergabetag, Zustand, Art) – nie `employeeId` oder `erfasstVonId`.
 */
export async function aktiveAusgabenJeStelleLaden(db: Db, onboardingId: string): Promise<Map<string, AbsageAusgabe[]>> {
  const zeilen = await db.ausgabe.findMany({
    where: { onboardingId, zustand: { in: [...AUSGABE_AKTIV] } },
    select: { departmentKey: true, bezeichnung: true, kennung: true, uebergebenAm: true, zustand: true, beiAustritt: true },
    orderBy: AUSGABE_ORDNUNG,
  });
  const jeStelle = new Map<string, AbsageAusgabe[]>();
  for (const z of zeilen) {
    const liste = jeStelle.get(z.departmentKey) ?? [];
    liste.push(z);
    jeStelle.set(z.departmentKey, liste);
  }
  return jeStelle;
}

/**
 * Je Ausgabe die Austritte, die sie BEZIEHEN (G28): eine Ruecknahme-, Sperr-
 * oder Folgeaufgabe (`herkunft` AUSGABE/AUSGABE_FEHLT) oder eine Rueckgabe-
 * Zeile mit ihrer `ausgabeId` – mit Status und, NUR wenn die Sitzung den
 * Austritt oeffnen darf (`canAccessProcess`), der Vorgangsnummer. Ob ein
 * Bezug BINDET, entscheidet der Aufrufer mit `bindenderAustritt` bzw.
 * `bezugBindet` und dem Zustand der Ausgabe (laufend immer, COMPLETED ausser
 * VERBLEIBT, CANCELLED nie). Dafuer traegt jeder Bezug den Stand DIESES
 * Austritts (Review A4c): `eigenerStand` = Zustand seiner Rueckgabe-Zeile
 * (nur, wenn sie einen hat) und `abgeloest`, wenn ein spaeterer Austritt das
 * Stueck ebenfalls bezieht (seine erste Zeile ist juenger, `abgeloesteAustritte`)
 * – sonst bindete ein abgeschlossener Austritt ein Stueck wieder, sobald der
 * naechste es umschaltet.
 *
 * Ohne Sitzung nie eine Vorgangsnummer. Ohne Ausgaben keine Abfrage. Die
 * Bezuege liest der Aufrufer NACH der Sperre der Ausgabe (G24).
 */
export async function austrittsBezuegeLaden(
  db: Db,
  ausgabeIds: ReadonlyArray<string>,
  opts: { session?: SessionPayload | null } = {},
): Promise<Map<string, AustrittsBezug[]>> {
  const ergebnis = new Map<string, AustrittsBezug[]>();
  const ids = [...new Set(ausgabeIds)];
  if (ids.length === 0) return ergebnis;

  const aufgaben = await db.offboardingChecklistItem.findMany({
    where: { ausgabeId: { in: ids }, herkunft: { in: [...OFFBOARDING_AUFGABEN_HERKUNFT] } },
    select: { ausgabeId: true, offboardingId: true, createdAt: true },
  });
  const rueckgaben = await db.returnItem.findMany({
    where: { ausgabeId: { in: ids } },
    select: { ausgabeId: true, offboardingId: true, createdAt: true, zustand: true, isReturned: true },
  });
  // Je Ausgabe und Austritt: der Zeitpunkt der ersten Zeile (`null` = unbekannt).
  const paare = new Map<string, Map<string, number | null>>();
  for (const p of [...aufgaben, ...rueckgaben]) {
    if (!p.ausgabeId) continue;
    const austritte = paare.get(p.ausgabeId) ?? new Map<string, number | null>();
    const zeit = zeitpunktMs(p.createdAt);
    const bisher = austritte.get(p.offboardingId);
    austritte.set(
      p.offboardingId,
      bisher === undefined ? zeit : bisher === null || zeit === null ? null : Math.min(bisher, zeit),
    );
    paare.set(p.ausgabeId, austritte);
  }
  // Der eigene Stand eines Austritts: Zustand seiner Rueckgabe-Zeile (offen = keiner).
  const eigenerStand = new Map<string, RueckgabeZustand>();
  for (const r of rueckgaben) {
    const z = r.ausgabeId ? rueckgabeZustand(r) : null;
    if (r.ausgabeId && z) eigenerStand.set(`${r.ausgabeId}|${r.offboardingId}`, z);
  }
  const austrittIds = [...new Set([...paare.values()].flatMap((m) => [...m.keys()]))];
  if (austrittIds.length === 0) return ergebnis;

  const austritte = await db.offboardingProcess.findMany({
    where: { id: { in: austrittIds } },
    select: { id: true, status: true, displayId: true, organizationId: true },
  });
  const bezugNachId = new Map<string, AustrittsBezug>();
  for (const a of austritte) {
    const darf = opts.session ? await canAccessProcess(opts.session, a.organizationId) : false;
    bezugNachId.set(a.id, { offboardingId: a.id, status: a.status, displayId: darf ? (a.displayId ?? null) : null });
  }
  for (const [ausgabeId, seit] of paare) {
    const abgeloest = abgeloesteAustritte(seit);
    const bezuege: AustrittsBezug[] = [];
    for (const id of [...seit.keys()].sort()) {
      const basis = bezugNachId.get(id);
      if (!basis) continue;
      const stand = eigenerStand.get(`${ausgabeId}|${id}`);
      // Nur gesetzte Felder: ein Bezug ohne eigenen Stand sieht aus wie bisher.
      bezuege.push({
        ...basis,
        ...(stand ? { eigenerStand: stand } : {}),
        ...(abgeloest.has(id) ? { abgeloest: true } : {}),
      });
    }
    if (bezuege.length > 0) ergebnis.set(ausgabeId, bezuege);
  }
  return ergebnis;
}

/**
 * Millisekunden eines Zeitpunkts, sonst `null` – ohne `instanceof Date` (ein
 * Date aus einem anderen Realm fiele dort durch; vgl. `gueltigerZeitpunkt` in
 * ausgaben.ts).
 */
function zeitpunktMs(d: unknown): number | null {
  if (Object.prototype.toString.call(d) !== "[object Date]") return null;
  const ms = (d as Date).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Das Ziel eines Vermerks (Karte S24, Link der Stelle S25) – gelesen nach der
 * Sperre des Vorgangs: die Aufgabe DIESES Vorgangs (sonst `null` = 404), ueber
 * `OnboardingAusstattungAufgabe` die Zeile der Ausstattung und die Option,
 * dazu die Katalogposition (zentral oder nicht, E-A35). Ob ein Vermerk geht,
 * entscheidet `vermerkZielGrund` (ausgaben.ts).
 */
export async function vermerkZielLadenIn(
  db: Db,
  onboardingId: string,
  checklistItemId: string,
): Promise<VermerkZiel | null> {
  const aufgabe = await db.checklistItem.findFirst({
    where: { id: checklistItemId, onboardingId },
    select: { id: true, assignee: true, herkunft: true, entfaelltAm: true },
  });
  if (!aufgabe) return null;
  const verknuepfung = await db.onboardingAusstattungAufgabe.findUnique({
    where: { checklistItemId: aufgabe.id },
    select: { ausstattungId: true, option: true },
  });
  const zeile = verknuepfung
    ? await db.onboardingAusstattung.findFirst({
        where: { id: verknuepfung.ausstattungId, onboardingId },
        select: {
          id: true,
          positionId: true,
          departmentKey: true,
          art: true,
          bezeichnung: true,
          ausgabeKennung: true,
          rueckgabeKategorie: true,
          beiAustritt: true,
          gestrichenAm: true,
        },
      })
    : null;
  const position = zeile?.positionId
    ? await db.ausstattungsPosition.findUnique({ where: { id: zeile.positionId }, select: { organizationId: true } })
    : null;
  return { aufgabe, zeile, option: verknuepfung?.option ?? "", position };
}

/** Eine Aufgabe der Link-Seite, wie `linkAusgabenLaden` sie braucht. */
export interface LinkAufgabe {
  id: string;
  assignee: string | null;
  herkunft: string | null;
  entfaelltAm: Date | null;
  /** Zeile der Ausstattung hinter der Aufgabe (`OnboardingAusstattungAufgabe`), sonst null. */
  ausstattungId: string | null;
}

/**
 * Das Feld `ausgabe` je Aufgabe der Link-Seite einer Stelle (Onboarding, G6,
 * Feinplan 1.6), Schluessel = `checklistItemId`; eine Aufgabe ohne Eintrag
 * bekommt das Feld gar nicht (`linkAusgabeBauen` entscheidet).
 *
 * Sparsam wie die Karte (G27): Ohne Ausstattungsaufgabe der Stelle keine
 * Abfrage; ohne Zeile mit RUECKGABE/SPERREN (A4 nicht eingeschaltet) eine;
 * die Ausgaben nur zu Aufgaben, die eine Uebergabe kennen; die Austrittsbezuege
 * (G28) nur fuer eigene Link-Vermerke im Zustand AUSGEGEBEN – nur dort
 * entscheidet die Bindung, ob die Stelle entfernen darf. Ohne Sitzung, also
 * nie mit Vorgangsnummer.
 */
export async function linkAusgabenLaden(
  db: Db,
  departmentKey: string,
  aufgaben: ReadonlyArray<LinkAufgabe>,
): Promise<Map<string, LinkAusgabe>> {
  const ergebnis = new Map<string, LinkAusgabe>();
  const kandidaten = aufgaben.filter(
    (a): a is LinkAufgabe & { ausstattungId: string } =>
      a.herkunft === "AUSSTATTUNG" && a.assignee === departmentKey && !!a.ausstattungId,
  );
  if (kandidaten.length === 0) return ergebnis;

  const zeilen = await db.onboardingAusstattung.findMany({
    where: {
      id: { in: [...new Set(kandidaten.map((a) => a.ausstattungId))] },
      departmentKey,
      beiAustritt: { in: [...AUSGABE_BEI_AUSTRITT] },
    },
    select: { id: true, departmentKey: true, art: true, beiAustritt: true, ausgabeKennung: true, gestrichenAm: true },
  });
  if (zeilen.length === 0) return ergebnis;
  const zeileNachId = new Map(zeilen.map((z) => [z.id, z]));
  const mitZeile = kandidaten.filter((a) => zeileNachId.has(a.ausstattungId));

  const ausgaben = await ausgabenZuAufgabenLaden(
    db,
    mitZeile.map((a) => a.id),
  );
  const bezuege = await austrittsBezuegeLaden(
    db,
    ausgaben
      .filter((a) => a.quelle === "LINK" && a.zustand === "AUSGEGEBEN" && a.departmentKey === departmentKey)
      .map((a) => a.id),
  );
  for (const a of mitZeile) {
    const anzeige = linkAusgabeBauen({
      departmentKey,
      aufgabe: a,
      zeile: zeileNachId.get(a.ausstattungId),
      ausgaben: ausgaben
        .filter((x) => x.checklistItemId === a.id)
        .map((x) => ({ ...x, bezuege: bezuege.get(x.id) ?? [] })),
    });
    if (anzeige) ergebnis.set(a.id, anzeige);
  }
  return ergebnis;
}

/** Eine Aufgabe der Offboarding-Link-Seite, wie `offboardingLinkAusgabenLaden` sie braucht. */
export interface OffboardingLinkAufgabe {
  id: string;
  herkunft?: string | null;
  ausgabeId?: string | null;
  assigneeDepartment?: string | null;
  isCompleted: boolean;
}

/**
 * Das Feld `ausgabe` je Aufgabe der Offboarding-Link-Seite einer Stelle (S30,
 * G15, G17, G21; Feinplan 1.6), Schluessel = Aufgaben-ID; eine Aufgabe ohne
 * Eintrag bekommt das Feld gar nicht (`offboardingLinkAusgabeBauen`
 * entscheidet: die ausgebende Stelle an ihrer Ruecknahme- bzw. Sperraufgabe,
 * die Gebaeudewirtschaft nur lesend an der Folgeaufgabe). Ohne Ruecknahme-,
 * Sperr- oder Folgeaufgabe dieser Stelle keine Abfrage; sonst je eine fuer
 * die Ausgaben und fuer die Rueckgabe-Zeilen DIESES Austritts (deren Zustand
 * ist der Stand beim Austritt).
 */
export async function offboardingLinkAusgabenLaden(
  db: Db,
  offboardingId: string,
  departmentKey: string,
  aufgaben: ReadonlyArray<OffboardingLinkAufgabe>,
): Promise<Map<string, OffboardingLinkAusgabe | OffboardingFolgeAusgabe>> {
  const ergebnis = new Map<string, OffboardingLinkAusgabe | OffboardingFolgeAusgabe>();
  const herkunft = OFFBOARDING_AUFGABEN_HERKUNFT as readonly string[];
  const kandidaten = aufgaben.filter(
    (a): a is OffboardingLinkAufgabe & { ausgabeId: string } =>
      herkunft.includes(a.herkunft ?? "") && !!a.ausgabeId && a.assigneeDepartment === departmentKey,
  );
  if (kandidaten.length === 0) return ergebnis;

  const ids = [...new Set(kandidaten.map((a) => a.ausgabeId))];
  const ausgaben = new Map((await ausgabenNachIdLaden(db, ids)).map((a) => [a.id, a]));
  const rueckgaben = await db.returnItem.findMany({
    where: { offboardingId, ausgabeId: { in: ids } },
    select: { ausgabeId: true, zustand: true, isReturned: true },
  });
  const rueckgabeJeAusgabe = new Map(rueckgaben.map((r) => [r.ausgabeId, r]));
  for (const a of kandidaten) {
    const feld = offboardingLinkAusgabeBauen({
      departmentKey,
      aufgabe: a,
      ausgabe: ausgaben.get(a.ausgabeId),
      rueckgabe: rueckgabeJeAusgabe.get(a.ausgabeId) ?? null,
    });
    if (feld) ergebnis.set(a.id, feld);
  }
  return ergebnis;
}

/** Der Bestand einer Einstellung samt der vollen Ausgabe-Zeilen (S29 braucht sie fuer den Rueckgabe-Vorschlag). */
export type EinstellungsBestandDaten = Omit<EinstellungsBestand, "ausgaben"> & { ausgaben: AusgabeDaten[] };

/**
 * Was der Reiter „Rückgaben“ von der zugeordneten Einstellung braucht (E-A36,
 * `rueckgabeLageAnzeige`): Vorgangsnummer und Merker `ausgabenAngeboten`, die
 * Zeilen der Ausstattung (nur `id`, `art`, `beiAustritt` – nie Bemerkungen
 * oder Angaben), die Ausstattungsaufgaben samt Loeschmerker und Zeile
 * (`OnboardingAusstattungAufgabe`) und ALLE Ausgaben (jeder Zustand – die Lage
 * AUSGABEN gilt schon mit einer). `null`, wenn es die Einstellung nicht (mehr)
 * gibt. Ohne Ausstattungsaufgabe keine Abfrage der Verknuepfungen.
 */
export async function bestandDerEinstellungLaden(db: Db, onboardingId: string): Promise<EinstellungsBestandDaten | null> {
  const einstellung = await db.onboardingProcess.findUnique({
    where: { id: onboardingId },
    select: { displayId: true, supervisorData: { select: { ausgabenAngeboten: true } } },
  });
  if (!einstellung) return null;

  const zeilen = await db.onboardingAusstattung.findMany({
    where: { onboardingId },
    select: { id: true, art: true, beiAustritt: true },
  });
  const aufgabenZeilen = await db.checklistItem.findMany({
    where: { onboardingId, herkunft: "AUSSTATTUNG" },
    select: {
      id: true,
      title: true,
      isCompleted: true,
      completedAt: true,
      entfaelltAm: true,
      ausgabenGeloeschtAm: true,
    },
  });
  const verknuepfungen =
    aufgabenZeilen.length > 0
      ? await db.onboardingAusstattungAufgabe.findMany({
          where: { checklistItemId: { in: aufgabenZeilen.map((a) => a.id) } },
          select: { checklistItemId: true, ausstattungId: true },
        })
      : [];
  const zeileJeAufgabe = new Map(verknuepfungen.map((v) => [v.checklistItemId, v.ausstattungId]));
  const aufgaben: BestandAufgabe[] = aufgabenZeilen.map((a) => ({
    ...a,
    ausstattungId: zeileJeAufgabe.get(a.id) ?? null,
  }));
  const ausgaben = await db.ausgabe.findMany({
    where: { onboardingId },
    select: AUSGABE_AUSWAHL,
    orderBy: AUSGABE_ORDNUNG,
  });

  return {
    displayId: einstellung.displayId ?? null,
    ausgabenAngeboten: einstellung.supervisorData?.ausgabenAngeboten ?? null,
    zeilen,
    aufgaben,
    ausgaben,
  };
}

/**
 * Ausgaben per ID (alle Felder aus `AUSGABE_AUSWAHL`) – der Aufrufer liest
 * damit NACH `ausgabenSperrenIn` frisch (G24: Zustand und Bezug erst nach der
 * Sperre). Unbekannte IDs fehlen; ohne ID keine Abfrage.
 */
export async function ausgabenNachIdLaden(db: Db, ids: ReadonlyArray<string>): Promise<AusgabeDaten[]> {
  const eindeutig = [...new Set(ids)];
  if (eindeutig.length === 0) return [];
  return db.ausgabe.findMany({ where: { id: { in: eindeutig } }, select: AUSGABE_AUSWAHL, orderBy: AUSGABE_ORDNUNG });
}

/**
 * Anzeigenamen der Stellen fuer Reiter und Vorschau (S29): je Schluessel der
 * gepflegte Name aus Einstellungen → Abteilungen, nach derselben Regel wie
 * die Empfaenger (`empfaengerAufloesen`: aktiver Eintrag der Einrichtung vor
 * dem zentralen). `organizationId` ist die Empfaenger-Einrichtung des
 * Vorgangs (Arbeitsort, sonst Einrichtung). Ohne gepflegten Namen fehlt der
 * Schluessel – die reinen Regeln nehmen dann das Label (`abteilungLabel`).
 * Nie Adressen. Ohne Schluessel keine Abfrage.
 */
export async function stellenNamenLaden(
  db: Db,
  keys: ReadonlyArray<string | null | undefined>,
  organizationId: string,
): Promise<Record<string, string>> {
  const eindeutig = [...new Set(keys.filter((k): k is string => !!k))];
  if (eindeutig.length === 0) return {};
  const konfigs = await db.departmentConfig.findMany({
    where: { departmentKey: { in: eindeutig } },
    select: { departmentKey: true, departmentName: true, email: true, organizationId: true, isActive: true },
  });
  const namen: Record<string, string> = {};
  for (const key of eindeutig) {
    const passend = konfigs.filter((k) => k.departmentKey === key);
    if (passend.length === 0) continue;
    const e = empfaengerAufloesen({ departmentKey: key, organizationId, konfigs: passend, fuehrungskraft: null });
    const name = e.departmentName?.trim();
    if (name) namen[key] = name;
  }
  return namen;
}
