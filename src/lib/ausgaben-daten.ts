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
 *
 * Keine Relationsfilter: Die Bezuege kommen ueber die indizierten Spalten
 * `ausgabeId` von Offboarding-Aufgaben und Rueckgaben, danach die Austritte
 * per `id`. Spaetere Schritte haengen hier an (`bestandDerEinstellungLaden`,
 * `stellenNamenLaden` mit dem Offboarding, S28/S29).
 */

import type { Prisma } from "@prisma/client";
import { canAccessProcess, type SessionPayload } from "@/lib/permissions";
import {
  AUSGABE_AKTIV,
  AUSGABE_BEI_AUSTRITT,
  OFFBOARDING_AUFGABEN_HERKUNFT,
  linkAusgabeBauen,
  type AustrittsBezug,
  type LinkAusgabe,
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
 * Bezug BINDET, entscheidet der Aufrufer mit `bindenderAustritt` und dem
 * Zustand der Ausgabe (laufend immer, COMPLETED ausser VERBLEIBT, CANCELLED nie).
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
    select: { ausgabeId: true, offboardingId: true },
  });
  const rueckgaben = await db.returnItem.findMany({
    where: { ausgabeId: { in: ids } },
    select: { ausgabeId: true, offboardingId: true },
  });
  const paare = new Map<string, Set<string>>();
  for (const p of [...aufgaben, ...rueckgaben]) {
    if (!p.ausgabeId) continue;
    const austritte = paare.get(p.ausgabeId) ?? new Set<string>();
    austritte.add(p.offboardingId);
    paare.set(p.ausgabeId, austritte);
  }
  const austrittIds = [...new Set([...paare.values()].flatMap((s) => [...s]))];
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
  for (const [ausgabeId, offboardingIds] of paare) {
    const bezuege = [...offboardingIds]
      .sort()
      .map((id) => bezugNachId.get(id))
      .filter((b): b is AustrittsBezug => !!b);
    if (bezuege.length > 0) ergebnis.set(ausgabeId, bezuege);
  }
  return ergebnis;
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
