/**
 * CREDO HR-Portal – Ausstattung & Zugaenge: der Dienst am Vorgang
 *
 * Stand S15 (Paket A3): das Formular der Fuehrungskraft, die Sicht von HR und
 * die Karte „Ausstattung & Zugänge“ im Reiter Checkliste.
 *
 *   fuehrungskraftSichtLaden      GET /api/modalitaeten/[token] (Feld `ausstattung`)
 *   fuehrungskraftWahlSpeichernIn PUT /api/modalitaeten/[token] (in der Transaktion der Route)
 *   ausgabenAngebotenBeiAbgabeIn  POST /api/modalitaeten/[token] (Merker E-A36, in der Transaktion der Abgabe)
 *   ausstattungKurzLaden          POST /api/modalitaeten/[token] (HR-Mail, `{{ausstattung_kurz}}`)
 *   ausstattungUebersichtLaden    GET /api/onboarding/[id] (Feld `ausstattung`, nur HR_EDIT_ROLES)
 *   ausstattungKarteLaden         GET /api/onboarding/[id]/ausstattung (nur HR_EDIT_ROLES)
 *   ausstattungAktionAusfuehren   POST /api/onboarding/[id]/ausstattung (nur HR_EDIT_ROLES)
 *
 * Die Regeln selbst stehen rein in src/lib/ausstattung.ts (`wahlPruefen`,
 * `fuehrungskraftSicht`, `momentaufnahme`, `bemerkungQuelleNach`,
 * `ausstattungKurz`, `ausstattungsUebersichtBauen`, `aenderungPruefen`,
 * `hinweisAenderungPruefen`, `aenderungsEintraege`); hier stehen nur Laden
 * und Schreiben. Schreibbausteine in fremder Transaktion:
 * src/lib/ausstattung-aufgaben.ts.
 *
 * Regeln, die beim Aendern gelten muessen:
 *   1. Der Merker `SupervisorData.mitAusstattung` entscheidet, nie der Katalog
 *      (Regel 2). Ohne Merker liefert die Sicht `null`, OHNE die Datenbank zu
 *      fragen; der PUT weist Ausstattung dann mit 400 ab (Route).
 *   2. Die Fuehrungskraft sieht und ersetzt nur ihre eigenen Zeilen und
 *      Hinweise (`quelle = FUEHRUNGSKRAFT`, Regel 5) — nie, was HR ergaenzt
 *      hat, nie interne Felder (`hinweisStelle`, Faelligkeit, A4-Felder).
 *      Nach der eigenen Abgabe (oder mit HR-Status) liefert die Sicht `null`:
 *      Das Formular zeigt dann nur noch „Vielen Dank“, und ab da bearbeitet HR.
 *   3. Jede Wahl wird gegen den Katalogausschnitt GENAU DIESES Vorgangs
 *      geprueft (`wahlPruefen`, Regel 4) — gelesen in derselben Transaktion,
 *      die schreibt. Eine fremde oder unbekannte Position oder Option ergibt
 *      `AusstattungsWahlUngueltig` (Route: 400, Rollback).
 *   4. Ersetzen statt Abgleichen: erst die eigenen Zeilen loeschen, dann neu
 *      anlegen (Momentaufnahme aus dem Katalog bzw. aus der eigenen Zeile).
 *      Vor der Abgabe haengen an ihnen keine Aufgaben (die entstehen erst
 *      danach). Ein fehlendes Feld laesst den Stand stehen, `[]` leert ihn.
 *   5. `ausstattungGespeichertAm` wird bei jedem Speichern des Schritts
 *      gesetzt (F9): Ab dann gilt die Vorauswahl des Katalogs nicht mehr —
 *      „alles abgewaehlt“ bleibt abgewaehlt. Im selben Update der Merker
 *      `ausgabenAngeboten` (E-A36, A4) aus dem gelesenen Ausschnitt; hat die
 *      Fuehrungskraft nie gespeichert, setzt ihn die Abgabe
 *      (`ausgabenAngebotenBeiAbgabeIn`).
 *   6. Der GET schreibt nichts.
 *   7. Die Sicht von HR (`ausstattungUebersichtLaden`) bekommt nur, wer in
 *      HR_EDIT_ROLES steht — fuer alle anderen `null`, OHNE die Datenbank zu
 *      fragen (Regel 16). Die neuen Tabellen stehen deshalb bewusst NICHT im
 *      `include` der Detailroute: `...safeOnboarding` gaebe sie sonst an alle
 *      PORTAL_ROLES weiter (Einrichtungsleitung, Vorgesetzte).
 *   8. Die HR-Mail `supervisor-completed` bekommt nur Zahlen
 *      (`ausstattungKurz`), nie Bemerkungs- oder Hinweistexte. Ohne Merker
 *      `mitAusstattung` gibt es nichts zu zaehlen — dann ohne Abfrage "".
 *
 * Die Karte (S15; Regel 5, 9, 10, 12, 13, 16, F2, F6, F23):
 *   9. Pruefreihenfolge der Aktionen: 403 (nicht HR_EDIT_ROLES — auch nie
 *      SERVICE) → Zod 400 (auch MITARBEITER/VORGESETZTER, Regel 11) → 404
 *      (unbekannt ODER fremder Mandant, derselbe Text) → 409
 *      VORGANG_ABGESCHLOSSEN (COMPLETED und EXPIRED, Regel 13) → 409
 *      MODALITAETEN_FEHLEN (Zustand ENTWURF; `mitAusstattung` zaehlt NICHT,
 *      E-A11) → 409 VERSAND_LAEUFT (dieselbe prozesslokale Sperre wie
 *      „Abteilungen informieren“, F6 — sonst kaeme eine waehrend des Versands
 *      ergaenzte Position weder in die Mail noch in die Aenderungsliste).
 *  10. Danach EINE Transaktion in der Sperrreihenfolge Vorgang → Links →
 *      Aufgaben → Ausstattung: Vorgang sperren, Links der alten und neuen
 *      Stelle sperren, Aufgaben lesen und Regel 9 pruefen, schreiben, die
 *      Aenderungsliste fuer informierte Stellen (Regel 10), das Nachholen
 *      (legt neue Aufgaben an, setzt Faelligkeiten — ohne Mail, ohne
 *      Anhebung), den Abteilungsstatus beider Stellen neu berechnen,
 *      Protokoll. Jede Abweisung darin wirft (Rollback) und wird zur Antwort.
 *  11. Vor der ersten Information der Stelle verschwindet, was HR streicht oder
 *      abwaehlt, samt Aufgabe — ERST die Aufgaben loeschen (die Kaskade nimmt
 *      die Verknuepfung mit), DANN die Zeile. Danach entfaellt es (F2): Die
 *      Zeile bleibt mit `gestrichenAm`, die Aufgabe mit `entfaelltAm`. Wieder
 *      gewaehlt, oeffnet sich die entfallene Aufgabe wieder (F23) — nie eine
 *      zweite.
 *  12. Bedingt schreiben: Entfallen, Loeschen und Faelligkeit nur an offenen
 *      Aufgaben; hat die Stelle eine Aufgabe zwischen Lesen und Schreiben
 *      abgehakt (HR-Stelle ohne Link-Sperre), weicht die Anzahl ab → 409
 *      AUFGABE_ERLEDIGT, Rollback.
 *  13. Protokoll nur mit IDs, Schluesseln, Katalog- bzw. Aufgabentiteln und
 *      Laengen — nie Bemerkung, Angabe oder Hinweis im Wortlaut.
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { canAccessProcess, HR_EDIT_ROLES, type SessionPayload } from "@/lib/permissions";
import { darfVorgesetzteSchreiben, vorgesetzteAbgesendet } from "@/lib/onboarding-spuren";
import {
  ABTEILUNGS_AUDIT,
  MELDUNGEN as ABTEILUNGS_MELDUNGEN,
  abteilungsSchluesselBekannt,
  meldungUnbekannteZustaendigkeit,
  onboardingEmpfaengerEinrichtung,
  type DienstAntwort,
} from "@/lib/abteilungsaufgaben";
import { versandSperreFreigeben, versandSperreNehmen } from "@/lib/abteilungsaufgaben-dienst";
import { onboardingAusstattungNachholenIn, vorgangSperrenIn } from "@/lib/abteilungsaufgaben-onboarding";
import {
  auditBezug,
  linkStatusNeuBerechnenIn,
  linksSperrenIn,
  type LinkBereich,
} from "@/lib/abteilungsaufgaben-uebergaenge";
import {
  aenderungenSchreibenIn,
  aufgabeEntfallenIn,
  aufgabeWiederAufnehmenIn,
} from "@/lib/ausstattung-aufgaben";
import { katalogAusschnittLaden, type AusschnittVorgang } from "@/lib/ausstattung-katalog";
import { ausgabenAngeboten } from "@/lib/ausgaben";
import {
  ANGABEN_KATALOG,
  GRENZEN,
  AUSSTATTUNG_AUDIT,
  AUSSTATTUNG_ENDSTATUS,
  MELDUNGEN,
  REIHENFOLGE_MAX,
  aenderungPruefen,
  aenderungsEintraege,
  aenderungsGrundText,
  aufgabenStatus,
  aufgabenTitel,
  ausstattungKurz,
  ausstattungsUebersichtBauen,
  ausstattungsZustand,
  bemerkungQuelleNach,
  fuehrungskraftSicht,
  hinweisAenderungPruefen,
  hinweisAenderungsStand,
  istAngabeSchluessel,
  momentaufnahme,
  wahlPruefen,
  zeilenAenderungsStand,
  type AenderungsEintrag,
  type AenderungsGrund,
  type AufgabenStatus,
  type AusstattungsMomentaufnahme,
  type AusstattungsQuelle,
  type AusstattungsUebersicht,
  type BestehendeFuehrungskraftWahl,
  type Erfasser,
  type FuehrungskraftEingabe,
  type FuehrungskraftSicht,
} from "@/lib/ausstattung";
import { ausstattungAktionSchema, type AusstattungAktionInput } from "@/lib/validations/ausstattung";

type Db = Prisma.TransactionClient;

const FUEHRUNGSKRAFT: AusstattungsQuelle = "FUEHRUNGSKRAFT";

/** Was die Sicht ueber den Vorgang wissen muss (so liefert ihn `validateSupervisorToken`). */
export interface FormularVorgang extends AusschnittVorgang {
  id: string;
  status: string;
  supervisorSubmittedAt?: Date | null;
  supervisorData?: {
    isComplete?: boolean | null;
    mitAusstattung?: boolean | null;
    ausstattungGespeichertAm?: Date | null;
  } | null;
}

/**
 * Die Wahl verletzt den Katalogausschnitt des Vorgangs (`wahlPruefen`).
 * Eigene Klasse, weil die Pruefung IN der Transaktion laeuft: Eine Ausnahme
 * ist der einzige Weg, sie zurueckzurollen. Die Route antwortet 400 mit
 * `meldung`.
 */
export class AusstattungsWahlUngueltig extends Error {
  constructor(readonly meldung: string) {
    super(meldung);
    this.name = "AusstattungsWahlUngueltig";
  }
}

/** Die Felder einer eigenen Zeile, die Pruefung und Sicht brauchen (keine Zeitstempel, keine IDs). */
const ZEILEN_AUSWAHL = {
  positionId: true,
  departmentKey: true,
  art: true,
  angabeSchluessel: true,
  bezeichnung: true,
  aufgabeTitel: true,
  hinweisStelle: true,
  relativeDueDays: true,
  sichtbarFuer: true,
  ausgabeKennung: true,
  rueckgabeKategorie: true,
  beiAustritt: true,
  reihenfolge: true,
  auswahl: true,
  angabe: true,
  bemerkung: true,
  gestrichenAm: true,
} as const satisfies Prisma.OnboardingAusstattungSelect;

/** Die eigene, schon gespeicherte Wahl der Fuehrungskraft — nur `quelle = FUEHRUNGSKRAFT` (Regel 2). */
async function eigeneWahlLaden(db: Db, onboardingId: string): Promise<BestehendeFuehrungskraftWahl> {
  const zeilen = await db.onboardingAusstattung.findMany({
    where: { onboardingId, quelle: FUEHRUNGSKRAFT },
    select: ZEILEN_AUSWAHL,
    orderBy: [{ reihenfolge: "asc" }, { bezeichnung: "asc" }],
  });
  const hinweise = await db.onboardingStellenHinweis.findMany({
    where: { onboardingId, quelle: FUEHRUNGSKRAFT },
    select: { departmentKey: true, text: true },
  });
  return { zeilen, hinweise };
}

/**
 * Der Schritt „Ausstattung & Zugänge“ fuer das Formular der Fuehrungskraft
 * (GET /api/modalitaeten/[token]). `null` ohne Merker `mitAusstattung` und
 * sobald das Formular nicht mehr beschreibbar ist (eigene Abgabe oder
 * HR-Status) — beides ohne Datenbankabfrage. Liest nur.
 */
export async function fuehrungskraftSichtLaden(vorgang: FormularVorgang): Promise<FuehrungskraftSicht | null> {
  if (vorgang.supervisorData?.mitAusstattung !== true) return null;
  if (!darfVorgesetzteSchreiben(vorgang)) return null;

  const ausschnitt = await katalogAusschnittLaden(prisma, vorgang);
  const bestehend = await eigeneWahlLaden(prisma, vorgang.id);
  return fuehrungskraftSicht({
    positionen: ausschnitt.positionen,
    stellenNamen: ausschnitt.stellenNamen,
    bestehend,
    ausstattungGespeichert: vorgang.supervisorData.ausstattungGespeichertAm != null,
  });
}

/**
 * Speichert den Schritt „Ausstattung & Zugänge“ in der Transaktion des
 * Modalitaeten-PUT (`tx`). Die Route hat davor den Vorgang bedingt gesperrt
 * (noch nicht abgegeben, kein HR-Status) und `SupervisorData` angelegt bzw.
 * aktualisiert.
 *
 * Reihenfolge: Katalogausschnitt und eigene Wahl lesen → `wahlPruefen` (Fehler
 * → `AusstattungsWahlUngueltig`, Rollback) → eigene Zeilen ersetzen (nur wenn
 * `ausstattung` mitkommt) → eigene Hinweise ersetzen (nur wenn `hinweise`
 * mitkommt) → `ausstattungGespeichertAm` setzen. Liefert die Zahl der
 * angelegten Zeilen bzw. Hinweise (`null` = unveraendert).
 */
export async function fuehrungskraftWahlSpeichernIn(
  tx: Db,
  vorgang: AusschnittVorgang & { id: string },
  eingabe: FuehrungskraftEingabe,
  jetzt: Date,
): Promise<{ zeilen: number | null; hinweise: number | null }> {
  if (eingabe.ausstattung === undefined && eingabe.hinweise === undefined) return { zeilen: null, hinweise: null };
  const onboardingId = vorgang.id;

  const ausschnitt = await katalogAusschnittLaden(tx, vorgang);
  const bestehend = await eigeneWahlLaden(tx, onboardingId);
  const pruefung = wahlPruefen(eingabe, ausschnitt.positionen, bestehend);
  if (!pruefung.ok) throw new AusstattungsWahlUngueltig(pruefung.fehler);

  if (pruefung.zeilen) {
    await tx.onboardingAusstattung.deleteMany({ where: { onboardingId, quelle: FUEHRUNGSKRAFT } });
    if (pruefung.zeilen.length > 0) {
      await tx.onboardingAusstattung.createMany({
        data: pruefung.zeilen.map((z) => ({
          onboardingId,
          ...z,
          quelle: FUEHRUNGSKRAFT,
          bemerkungQuelle: z.bemerkung ? bemerkungQuelleNach(null, FUEHRUNGSKRAFT) : null,
        })),
      });
    }
  }

  if (pruefung.hinweise) {
    await tx.onboardingStellenHinweis.deleteMany({ where: { onboardingId, quelle: FUEHRUNGSKRAFT } });
    if (pruefung.hinweise.length > 0) {
      await tx.onboardingStellenHinweis.createMany({
        data: pruefung.hinweise.map((h) => ({
          onboardingId,
          departmentKey: h.departmentKey,
          text: h.text,
          quelle: FUEHRUNGSKRAFT,
        })),
      });
    }
  }

  // E-A36: Merker fuer den Reiter „Rückgaben“ aus dem Ausschnitt, den diese
  // Transaktion ohnehin gelesen hat — bei jedem Speichern neu.
  await tx.supervisorData.update({
    where: { onboardingId },
    data: { ausstattungGespeichertAm: jetzt, ausgabenAngeboten: ausgabenAngeboten(ausschnitt.positionen) },
  });
  return { zeilen: pruefung.zeilen?.length ?? null, hinweise: pruefung.hinweise?.length ?? null };
}

/**
 * Merker `SupervisorData.ausgabenAngeboten` bei der Abgabe der Modalitaeten
 * (POST /api/modalitaeten/[token], in deren Transaktion): Hat die
 * Fuehrungskraft den Schritt nie gespeichert (Vorauswahl uebernommen), steht er
 * noch auf `null` — dann hier aus dem Katalogausschnitt des Vorgangs. Nur mit
 * `mitAusstattung` (ohne den Schritt bleibt er `null`: Altfall bzw. kein
 * Ausstattungsschritt, `rueckgabeLage` liest daraus VOR_EINFUEHRUNG), nur
 * bedingt auf `null` — ein gespeicherter Wert bleibt. Ohne Abfrage, wenn
 * nichts zu tun ist.
 */
export async function ausgabenAngebotenBeiAbgabeIn(
  tx: Db,
  vorgang: AusschnittVorgang & {
    id: string;
    supervisorData?: { mitAusstattung?: boolean | null; ausgabenAngeboten?: boolean | null } | null;
  },
): Promise<void> {
  const sd = vorgang.supervisorData;
  if (sd?.mitAusstattung !== true || (sd.ausgabenAngeboten !== null && sd.ausgabenAngeboten !== undefined)) return;
  const { positionen } = await katalogAusschnittLaden(tx, vorgang);
  await tx.supervisorData.updateMany({
    where: { onboardingId: vorgang.id, ausgabenAngeboten: null },
    data: { ausgabenAngeboten: ausgabenAngeboten(positionen) },
  });
}

// =============================================
// HR liest mit (S10) und die Karte (S15): Uebersicht
// =============================================

/**
 * Die Felder einer Zeile, die Uebersicht und PDF lesen (`UebersichtZeileDaten`).
 * `relativeDueDays` (seit S15) braucht nur die Vorlauf-Warnung der Karte; in
 * die Antwort geht es nie.
 */
export const UEBERSICHT_ZEILEN_AUSWAHL = {
  id: true,
  positionId: true,
  departmentKey: true,
  art: true,
  angabeSchluessel: true,
  bezeichnung: true,
  sichtbarFuer: true,
  reihenfolge: true,
  auswahl: true,
  angabe: true,
  bemerkung: true,
  bemerkungQuelle: true,
  quelle: true,
  erfasstVonId: true,
  gestrichenAm: true,
  createdAt: true,
  relativeDueDays: true,
} as const satisfies Prisma.OnboardingAusstattungSelect;

/** Die Felder eines Hinweises, die Uebersicht und PDF lesen (`UebersichtHinweisDaten`). */
export const UEBERSICHT_HINWEIS_AUSWAHL = {
  departmentKey: true,
  text: true,
  quelle: true,
  checklistItemId: true,
  gesehenAm: true,
} as const satisfies Prisma.OnboardingStellenHinweisSelect;

/** Reihenfolge der Zeilen (orderIndex der Position beim Speichern, dann Bezeichnung). */
export const UEBERSICHT_ZEILEN_ORDNUNG: Prisma.OnboardingAusstattungOrderByWithRelationInput[] = [
  { reihenfolge: "asc" },
  { bezeichnung: "asc" },
];

/** Stellen-Namen und Adressen am Arbeitsort (wie `katalogAusschnittLaden`). */
const KONFIG_AUSWAHL = {
  departmentKey: true,
  departmentName: true,
  email: true,
  organizationId: true,
  isActive: true,
} as const satisfies Prisma.DepartmentConfigSelect;

/** Die Felder einer Ausstattungs- oder Hinweis-Aufgabe, die die Karte liest (`UebersichtAufgabeDaten`). */
const KARTE_AUFGABEN_AUSWAHL = {
  id: true,
  title: true,
  isCompleted: true,
  completedAt: true,
  dueDate: true,
  eilt: true,
  entfaelltAm: true,
} as const satisfies Prisma.ChecklistItemSelect;

/**
 * Was die Uebersicht ueber den Vorgang wissen muss — so liegt die Zeile in der
 * Detailroute ohnehin vor; der Vorgang wird NICHT ein zweites Mal geladen.
 * `vertragsbeginn` (seit S15) ist der Bezug der Vorlauf-Warnung.
 */
export interface UebersichtVorgang extends AusschnittVorgang {
  id: string;
  status: string;
  supervisorSubmittedAt?: Date | null;
  supervisorData?: {
    isComplete?: boolean | null;
    mitAusstattung?: boolean | null;
    vertragsbeginn?: Date | null;
  } | null;
}

/**
 * Die Kurzform fuer die HR-Mail `supervisor-completed`
 * (`{{ausstattung_kurz}}`, „6 Positionen für 3 Stellen“). Ohne Merker
 * `mitAusstattung` gibt es keine Wahl der Fuehrungskraft (der PUT weist sie
 * ab, und vor der Abgabe ergaenzt HR nichts) — dann "" ohne Abfrage. Liest
 * nur; der Aufrufer faengt Fehler ab, die Mail darf daran nie scheitern.
 */
export async function ausstattungKurzLaden(vorgang: {
  id: string;
  supervisorData?: { mitAusstattung?: boolean | null } | null;
}): Promise<string> {
  if (vorgang.supervisorData?.mitAusstattung !== true) return "";
  const zeilen = await prisma.onboardingAusstattung.findMany({
    where: { onboardingId: vorgang.id },
    select: { art: true, departmentKey: true, gestrichenAm: true },
  });
  const hinweise = await prisma.onboardingStellenHinweis.findMany({
    where: { onboardingId: vorgang.id },
    select: { departmentKey: true, text: true },
  });
  return ausstattungKurz(zeilen, hinweise);
}

/**
 * Die Sicht von HR auf Ausstattung & Zugaenge fuer GET /api/onboarding/[id]
 * (Feld `ausstattung`; Karte im Reiter „Vorgesetzter“ und im Reiter
 * Checkliste). Nur fuer HR_EDIT_ROLES — sonst `null`, OHNE die Datenbank zu
 * fragen (Regel 16; die Middleware sperrt fremde Mandanten, dieser Schutz
 * haengt nicht daran). Den Inhalt baut `uebersichtBauen`.
 */
export async function ausstattungUebersichtLaden(
  onboarding: UebersichtVorgang,
  session: { role: string },
  jetzt: Date = new Date(),
): Promise<AusstattungsUebersicht | null> {
  if (!HR_EDIT_ROLES.includes(session.role)) return null;
  return uebersichtBauen(prisma, onboarding, jetzt);
}

/**
 * Laedt und baut die Uebersicht (nur fuer HR — der Aufrufer hat die Rolle
 * geprueft). Nutzt die uebergebene Vorgangszeile (Status,
 * `supervisorSubmittedAt`, `supervisorData`, `organizationId`, `arbeitsortId`,
 * Fragebogen- und Vorgangsart) und laedt nur:
 *   - die Zeilen und Hinweise des Vorgangs (alle Quellen);
 *   - den Katalogausschnitt, solange der Vorgang laeuft und es etwas
 *     abzugleichen gibt — fuer `hinzufuegbar` (BEARBEITBAR), „nicht mehr im
 *     Katalog“ und die waehlbaren Optionen;
 *   - die Abteilungen (Name und Adresse der Stelle am Arbeitsort), wenn es
 *     eine Gruppe gibt oder die Karte bearbeitbar ist (waehlbare Stellen);
 *   - seit S15 Verknuepfungen und Aufgaben (nur mit Zeilen bzw. verknuepften
 *     Hinweisen) — fuer Aufgabenstand, Aktionen und Vorlauf-Warnung;
 *   - die Namen der HR-Konten hinter „ergänzt von HR (…)“, nur wenn es solche
 *     Zeilen gibt.
 */
async function uebersichtBauen(db: Db, onboarding: UebersichtVorgang, jetzt: Date): Promise<AusstattungsUebersicht> {
  const onboardingId = onboarding.id;
  const { zustand } = ausstattungsZustand(onboarding, true);
  const zeilen = await db.onboardingAusstattung.findMany({
    where: { onboardingId },
    select: UEBERSICHT_ZEILEN_AUSWAHL,
    orderBy: UEBERSICHT_ZEILEN_ORDNUNG,
  });
  const hinweise = await db.onboardingStellenHinweis.findMany({
    where: { onboardingId },
    select: UEBERSICHT_HINWEIS_AUSWAHL,
  });

  const katalogNoetig =
    zustand === "BEARBEITBAR" || (zustand === "ENTWURF" && zeilen.some((z) => z.positionId != null));
  const katalog = katalogNoetig ? (await katalogAusschnittLaden(db, onboarding)).positionen : null;

  const mitGruppen = zeilen.length > 0 || hinweise.some((h) => h.text.trim() !== "");
  const konfigs =
    mitGruppen || zustand === "BEARBEITBAR" ? await db.departmentConfig.findMany({ select: KONFIG_AUSWAHL }) : [];

  const verknuepfungen =
    zeilen.length > 0
      ? await db.onboardingAusstattungAufgabe.findMany({
          where: { ausstattungId: { in: zeilen.map((z) => z.id) } },
          select: { ausstattungId: true, option: true, checklistItemId: true },
        })
      : [];
  const aufgaben =
    verknuepfungen.length > 0 || hinweise.some((h) => h.checklistItemId != null)
      ? await db.checklistItem.findMany({
          where: { onboardingId, herkunft: { not: null } },
          select: KARTE_AUFGABEN_AUSWAHL,
        })
      : [];

  const erfasserIds = [
    ...new Set(zeilen.map((z) => z.erfasstVonId).filter((id): id is string => typeof id === "string" && id !== "")),
  ];
  const erfasser: Record<string, Erfasser> = {};
  if (erfasserIds.length > 0) {
    const konten = await db.user.findMany({
      where: { id: { in: erfasserIds } },
      select: { id: true, firstName: true, lastName: true },
    });
    for (const k of konten) erfasser[k.id] = { firstName: k.firstName, lastName: k.lastName };
  }

  return ausstattungsUebersichtBauen({
    vorgang: onboarding,
    darfBearbeiten: true,
    zeilen,
    hinweise,
    arbeitsortId: onboardingEmpfaengerEinrichtung(onboarding),
    konfigs,
    katalog,
    erfasser,
    aufgaben,
    verknuepfungen,
    jetzt,
  });
}

// =============================================
// Karte „Ausstattung & Zugänge“ (S15): Laden und Aktionen
// =============================================

/** Was Karte und Aktionen vom Vorgang brauchen — nie Fragebogen-Angaben, Tokens oder Adressen. */
const KARTE_VORGANG_AUSWAHL = {
  id: true,
  organizationId: true,
  arbeitsortId: true,
  status: true,
  questionnaireType: true,
  processType: true,
  supervisorSubmittedAt: true,
  supervisorData: { select: { isComplete: true, mitAusstattung: true, vertragsbeginn: true } },
} as const satisfies Prisma.OnboardingProcessSelect;

type KarteVorgang = Prisma.OnboardingProcessGetPayload<{ select: typeof KARTE_VORGANG_AUSWAHL }>;

const KEINE_BERECHTIGUNG: DienstAntwort = { status: 403, body: { error: "Keine Berechtigung" } };

function nichtGefunden(): DienstAntwort {
  return { status: 404, body: { error: ABTEILUNGS_MELDUNGEN.ONBOARDING_VORGANG_NICHT_GEFUNDEN } };
}

/** Der Vorgang — `null` fuer unbekannt UND fremden Mandanten (dieselbe 404). Mandant ist der Arbeitgeber. */
async function karteVorgangLaden(onboardingId: string, session: SessionPayload): Promise<KarteVorgang | null> {
  const v = await prisma.onboardingProcess.findUnique({ where: { id: onboardingId }, select: KARTE_VORGANG_AUSWAHL });
  if (!v || !(await canAccessProcess(session, v.organizationId))) return null;
  return v;
}

/**
 * GET /api/onboarding/[id]/ausstattung — die Karte allein (z. B. nach einem
 * Fehler neu laden), ohne die Detailroute mit ihren entschluesselten Feldern.
 *
 *   403 { error: "Keine Berechtigung" }        nicht HR_EDIT_ROLES (auch SERVICE, Regel 16)
 *   404 { error: "Vorgang nicht gefunden" }    unbekannt ODER fremder Mandant
 *   200 { data: AusstattungsUebersicht }
 */
export async function ausstattungKarteLaden(opts: {
  onboardingId: string;
  session: SessionPayload;
  jetzt?: Date;
}): Promise<DienstAntwort> {
  if (!HR_EDIT_ROLES.includes(opts.session.role)) return KEINE_BERECHTIGUNG;
  const vorgang = await karteVorgangLaden(opts.onboardingId, opts.session);
  if (!vorgang) return nichtGefunden();
  return { status: 200, body: { data: await uebersichtBauen(prisma, vorgang, opts.jetzt ?? new Date()) } };
}

/** Eine Abweisung IN der Transaktion: wirft (Rollback), die Antwort geht unveraendert hinaus. */
class KarteAbgewiesen extends Error {
  constructor(readonly antwort: DienstAntwort) {
    super(String(antwort.body.error ?? "abgewiesen"));
    this.name = "KarteAbgewiesen";
  }
}

function abweisen(status: number, error: string, grund?: string): never {
  throw new KarteAbgewiesen({ status, body: grund ? { error, grund } : { error } });
}

/** 409 mit dem Grund aus Regel 9 (`aenderungPruefen`, `hinweisAenderungPruefen`). */
function grundAbweisen(grund: AenderungsGrund): never {
  abweisen(409, aenderungsGrundText(grund), grund);
}

function prismaCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

/** Nicht leerer, getrimmter Text oder `null`. */
function textOderNull(text: string | null | undefined): string | null {
  const t = (text ?? "").trim();
  return t === "" ? null : t;
}

/** Laenge eines Freitexts fuers Protokoll (nie der Text selbst). */
function laenge(text: string | null | undefined): number {
  return (text ?? "").trim().length;
}

/** Was eine Aktion in der Transaktion braucht. */
interface KarteKontext {
  tx: Db;
  vorgang: KarteVorgang;
  bereich: LinkBereich;
  userId: string;
  jetzt: Date;
}

/** Was eine Aktion in der Transaktion getan hat. */
interface KarteErgebnis {
  meldung: string;
  /** Eintraege der Aenderungsliste fuer informierte Stellen (Regel 10). */
  eintraege: AenderungsEintrag[];
  /** Stellen, deren Abteilungsstatus neu zu berechnen ist (alte und neue). */
  stellen: string[];
  /** Protokoll; `null` = nichts geaendert. */
  audit: { action: string; details: Record<string, unknown> } | null;
}

const UNVERAENDERT: KarteErgebnis = { meldung: MELDUNGEN.KARTE_UNVERAENDERT, eintraege: [], stellen: [], audit: null };

/** Die Felder einer Zeile, die die Aktionen lesen. */
const ZEILE_KARTE_AUSWAHL = {
  id: true,
  positionId: true,
  departmentKey: true,
  art: true,
  angabeSchluessel: true,
  bezeichnung: true,
  aufgabeTitel: true,
  hinweisStelle: true,
  relativeDueDays: true,
  sichtbarFuer: true,
  reihenfolge: true,
  auswahl: true,
  angabe: true,
  bemerkung: true,
  bemerkungQuelle: true,
  quelle: true,
  gestrichenAm: true,
} as const satisfies Prisma.OnboardingAusstattungSelect;

type KarteZeile = Prisma.OnboardingAusstattungGetPayload<{ select: typeof ZEILE_KARTE_AUSWAHL }>;

/** Eine Aufgabe einer Zeile mit ihrem Zustand (F2). */
interface ZeilenAufgabe {
  option: string;
  checklistItemId: string;
  status: AufgabenStatus;
}

/**
 * Die Stellen einer Zeile: ihre eigene, bei einer Angabe dazu die unter
 * „sichtbar für“ (sie sehen die Angabe auf Link-Seite und in der Mail).
 */
function zeilenStellen(z: { departmentKey: string; art: string; sichtbarFuer: ReadonlyArray<string> }): string[] {
  return [...new Set([z.departmentKey, ...(z.art === "ANGABE" ? z.sichtbarFuer : [])])];
}

async function zeileLadenIn(tx: Db, onboardingId: string, ausstattungId: string): Promise<KarteZeile> {
  const z = await tx.onboardingAusstattung.findFirst({
    where: { id: ausstattungId, onboardingId },
    select: ZEILE_KARTE_AUSWAHL,
  });
  if (!z) abweisen(404, MELDUNGEN.POSITION_NICHT_GEFUNDEN);
  return z;
}

/** Die Aufgaben einer Zeile (je Option eine, auch entfallene) — gelesen nach den Sperren. */
async function zeilenAufgabenLadenIn(tx: Db, onboardingId: string, ausstattungId: string): Promise<ZeilenAufgabe[]> {
  const verknuepfungen = await tx.onboardingAusstattungAufgabe.findMany({
    where: { ausstattungId },
    select: { option: true, checklistItemId: true },
  });
  if (verknuepfungen.length === 0) return [];
  const items = await tx.checklistItem.findMany({
    where: { onboardingId, id: { in: verknuepfungen.map((v) => v.checklistItemId) } },
    select: { id: true, isCompleted: true, entfaelltAm: true },
  });
  const itemZu = new Map(items.map((i) => [i.id, i]));
  return verknuepfungen.flatMap((v) => {
    const i = itemZu.get(v.checklistItemId);
    return i ? [{ option: v.option, checklistItemId: i.id, status: aufgabenStatus(i) }] : [];
  });
}

/** Stellen mit zugestelltem Link (`sentAt ?? lastSentAt`) — gelesen NACH der Linksperre. HR hat nie einen Link. */
async function informierteStellenIn(tx: Db, onboardingId: string, stellen: ReadonlyArray<string>): Promise<Set<string>> {
  const links = await tx.offboardingDepartmentLink.findMany({
    where: { onboardingId, departmentKey: { in: [...new Set(stellen)] } },
    select: { departmentKey: true, sentAt: true, lastSentAt: true },
  });
  return new Set(links.filter((l) => (l.sentAt ?? l.lastSentAt) != null).map((l) => l.departmentKey));
}

/** Die Stelle muss bekannt sein (fester Schluessel oder unter Einstellungen → Abteilungen), sonst 400 — wie im Portal-PATCH. */
async function stelleBekanntIn(tx: Db, departmentKey: string): Promise<void> {
  const konfig = await tx.departmentConfig.findMany({ select: { departmentKey: true } });
  if (!abteilungsSchluesselBekannt(departmentKey, konfig.map((k) => k.departmentKey))) {
    abweisen(400, meldungUnbekannteZustaendigkeit(departmentKey));
  }
}

/** Die waehlbaren Optionen einer Auswahl-Zeile: Katalog, dahinter die gewaehlten und die einer frueheren Aufgabe (F23). */
function waehlbareOptionen(
  katalog: ReadonlyArray<string>,
  zeile: { auswahl: ReadonlyArray<string> },
  aufgaben: ReadonlyArray<ZeilenAufgabe>,
): string[] {
  return [...new Set([...katalog, ...zeile.auswahl, ...aufgaben.map((a) => a.option).filter((o) => o !== "")])];
}

/** Die Optionen der Katalogposition dieser Zeile, solange sie im Katalog DIESES Vorgangs steht. */
async function katalogOptionenIn(tx: Db, vorgang: KarteVorgang, positionId: string | null): Promise<string[]> {
  if (!positionId) return [];
  const { positionen } = await katalogAusschnittLaden(tx, vorgang);
  const p = positionen.find((x) => x.id === positionId);
  return p?.art === "AUSWAHL" ? [...p.optionen] : [];
}

/** Auswahl pruefen: mindestens eine Option, jede aus `optionen`; Reihenfolge wie `optionen`, ohne Doppelte. */
function auswahlPruefen(auswahl: ReadonlyArray<string> | undefined, optionen: ReadonlyArray<string>): string[] {
  const gewaehlt = [...new Set((auswahl ?? []).map((o) => o.trim()).filter((o) => o !== ""))];
  if (gewaehlt.length === 0) abweisen(400, MELDUNGEN.KARTE_AUSWAHL_LEER);
  if (gewaehlt.some((o) => !optionen.includes(o))) abweisen(400, MELDUNGEN.KARTE_OPTION_UNBEKANNT);
  return gewaehlt.sort((a, b) => optionen.indexOf(a) - optionen.indexOf(b));
}

/** Angabe pruefen: nicht leer, hoechstens so lang wie ihr Eintrag in ANGABEN_KATALOG. */
function angabePruefen(angabe: string | undefined, schluessel: string | null, bezeichnung: string): string {
  const wert = textOderNull(angabe);
  if (!wert) abweisen(400, MELDUNGEN.KARTE_ANGABE_LEER);
  const definition = istAngabeSchluessel(schluessel) ? ANGABEN_KATALOG[schluessel] : null;
  const max = definition?.max ?? GRENZEN.angabe;
  if (wert.length > max) {
    abweisen(400, `Die Angabe „${definition?.label ?? bezeichnung}“ darf höchstens ${max} Zeichen lang sein.`);
  }
  return wert;
}

/** Wahl beim Hinzufuegen und Wiederaufnehmen, passend zur Art (Felder, die nicht passen, sind 400 — nie still verworfen). */
function wahlFuerArt(
  zeile: { art: string; angabeSchluessel: string | null; bezeichnung: string },
  eingabe: { auswahl?: string[]; angabe?: string; bemerkung?: string },
  optionen: ReadonlyArray<string>,
): { auswahl: string[]; angabe: string | null; bemerkung: string | null | undefined } {
  const auswahlDa = (eingabe.auswahl ?? []).length > 0;
  const angabeDa = textOderNull(eingabe.angabe) !== null;
  const bemerkung = eingabe.bemerkung === undefined ? undefined : textOderNull(eingabe.bemerkung);
  switch (zeile.art) {
    case "JA_NEIN":
      if (auswahlDa || angabeDa) abweisen(400, MELDUNGEN.KARTE_PASST_NICHT_ZUR_ART);
      return { auswahl: [], angabe: null, bemerkung };
    case "AUSWAHL":
      if (angabeDa) abweisen(400, MELDUNGEN.KARTE_PASST_NICHT_ZUR_ART);
      return { auswahl: auswahlPruefen(eingabe.auswahl, optionen), angabe: null, bemerkung };
    case "ANGABE":
      if (auswahlDa) abweisen(400, MELDUNGEN.KARTE_PASST_NICHT_ZUR_ART);
      if (bemerkung) abweisen(400, MELDUNGEN.ANGABE_OHNE_BEMERKUNG);
      return { auswahl: [], angabe: angabePruefen(eingabe.angabe, zeile.angabeSchluessel, zeile.bezeichnung), bemerkung: undefined };
    default:
      abweisen(400, MELDUNGEN.KARTE_PASST_NICHT_ZUR_ART);
  }
}

/**
 * Bemerkung nach dem Schreiben von HR (Regel 8): `undefined` = unveraendert;
 * ein gleicher Text aendert nichts; "" entfernt sie (ohne Herkunft); ein
 * neuer Text bekommt die Herkunft nach `bemerkungQuelleNach` (Text der
 * Fuehrungskraft, den HR aendert → BEIDE).
 */
function bemerkungNach(
  alt: { bemerkung: string | null; bemerkungQuelle: string | null },
  neu: string | null | undefined,
): { geaendert: boolean; bemerkung: string | null; bemerkungQuelle: string | null } {
  const vorher = textOderNull(alt.bemerkung);
  if (neu === undefined || neu === vorher) {
    return { geaendert: false, bemerkung: alt.bemerkung, bemerkungQuelle: alt.bemerkungQuelle };
  }
  if (neu === null) return { geaendert: true, bemerkung: null, bemerkungQuelle: null };
  return { geaendert: true, bemerkung: neu, bemerkungQuelle: bemerkungQuelleNach(alt.bemerkungQuelle, "HR") };
}

/**
 * Faelligkeit von Hand aus der Karte (`aendern.faelligkeiten`,
 * `hinweis-aendern.dueDate`): ein Kalendertag (Mitternacht UTC wie alle
 * Faelligkeiten der Checkliste) oder `null` — dann faellt auch die
 * Tagesangabe weg, sonst rechnete `faelligkeitenSetzen` die Frist beim
 * naechsten Nachholen wieder aus (wie der Portal-PATCH). `eilt` faellt in
 * beiden Faellen: „Eilt“ ist eine Eigenschaft der ANGEHOBENEN Faelligkeit
 * (Regel 14) — eine bewusst gesetzte Frist ist nicht angehoben, und sonst
 * zeigten Mail und Link-Seite weiter „(eilt)“ und `eiltDeckeln` deckelte die
 * erste Erinnerung.
 */
function faelligkeitVonHand(tag: string | null): Prisma.ChecklistItemUpdateManyMutationInput {
  return tag === null
    ? { dueDate: null, relativeDueDays: null, eilt: false }
    : { dueDate: new Date(`${tag}T00:00:00.000Z`), eilt: false };
}

/**
 * Die Momentaufnahme einer freien Position von HR (immer Ja/Nein, ohne Hinweis
 * fuer die Stelle, ans Ende sortiert). Seit S23 (A4, G8) mit „Beim Austritt“
 * und Rueckgabekategorie aus dem Dialog (Zod hat sie gegeneinander geprueft);
 * eine Kennungsbeschriftung gibt es fuer freie Positionen nicht.
 */
function freieMomentaufnahme(frei: FreiePosition): AusstattungsMomentaufnahme {
  return {
    positionId: null,
    departmentKey: frei.departmentKey,
    art: "JA_NEIN",
    angabeSchluessel: null,
    bezeichnung: frei.bezeichnung,
    aufgabeTitel: aufgabenTitel({ art: "JA_NEIN", bezeichnung: frei.bezeichnung }, ""),
    hinweisStelle: null,
    relativeDueDays: frei.relativeDueDays ?? null,
    sichtbarFuer: [],
    ausgabeKennung: null,
    rueckgabeKategorie: frei.beiAustritt === "RUECKGABE" ? (frei.rueckgabeKategorie ?? null) : null,
    beiAustritt: frei.beiAustritt ?? null,
    reihenfolge: REIHENFOLGE_MAX,
  };
}

/**
 * POST /api/onboarding/[id]/ausstattung — eine Aktion der Karte (Feinplan S15,
 * `ausstattungAktionSchema`).
 *
 * Antworten (in dieser Reihenfolge, Regel 9 der Datei oben):
 *   403 { error: "Keine Berechtigung" }
 *   400 { error }                                  Zod; unbekannte Stelle, Option oder Position; Feld passt nicht zur Art
 *   404 { error: "Vorgang nicht gefunden" }        unbekannt ODER fremder Mandant
 *   409 { error, grund: "VORGANG_ABGESCHLOSSEN" }  COMPLETED oder EXPIRED (Regel 13)
 *   409 { error, grund: "MODALITAETEN_FEHLEN" }    Modalitaeten nicht eingereicht (E-A11)
 *   409 { error, grund: "VERSAND_LAEUFT" }         Versandsperre belegt (F6)
 *   404 { error }                                  Zeile bzw. Hinweis gibt es in diesem Vorgang nicht
 *   409 { error, grund: "AUFGABE_ERLEDIGT" | "GESTRICHEN" | "OHNE_OFFENE_AUFGABE" | "BEREITS_VORHANDEN" }
 *   200 { data: AusstattungsUebersicht, meldung }
 */
export async function ausstattungAktionAusfuehren(opts: {
  onboardingId: string;
  rohBody: unknown;
  session: SessionPayload;
  jetzt?: Date;
}): Promise<DienstAntwort> {
  const jetzt = opts.jetzt ?? new Date();
  if (!HR_EDIT_ROLES.includes(opts.session.role)) return KEINE_BERECHTIGUNG;
  const parsed = ausstattungAktionSchema.safeParse(opts.rohBody);
  if (!parsed.success) {
    return { status: 400, body: { error: parsed.error.errors[0]?.message ?? ABTEILUNGS_MELDUNGEN.UNGUELTIGE_EINGABE } };
  }
  const aktion = parsed.data;

  const vorgang = await karteVorgangLaden(opts.onboardingId, opts.session);
  if (!vorgang) return nichtGefunden();
  if ((AUSSTATTUNG_ENDSTATUS as readonly string[]).includes(vorgang.status)) {
    return {
      status: 409,
      body: {
        error: vorgang.status === "EXPIRED" ? MELDUNGEN.KARTE_ABGELAUFEN : MELDUNGEN.KARTE_ABGESCHLOSSEN,
        grund: "VORGANG_ABGESCHLOSSEN",
      },
    };
  }
  // Zustand ENTWURF (1.6) — `mitAusstattung` spielt keine Rolle: Nach der Abgabe
  // ergaenzt HR auch Vorgaenge ohne den Schritt im Formular.
  if (!vorgesetzteAbgesendet(vorgang)) {
    return { status: 409, body: { error: MELDUNGEN.KARTE_MODALITAETEN_FEHLEN, grund: "MODALITAETEN_FEHLEN" } };
  }

  const bereich: LinkBereich = { modul: "ONBOARDING", vorgangId: vorgang.id };
  if (!versandSperreNehmen(bereich)) {
    return { status: 409, body: { error: MELDUNGEN.KARTE_VERSAND_LAEUFT, grund: "VERSAND_LAEUFT" } };
  }
  let ergebnis: KarteErgebnis & { geschrieben: number };
  try {
    ergebnis = await prisma.$transaction((tx) =>
      aktionIn({ tx, vorgang, bereich, userId: opts.session.userId, jetzt }, aktion),
    );
  } catch (err) {
    if (err instanceof KarteAbgewiesen) return err.antwort;
    // Zwei Tabs ergaenzen dieselbe Position zugleich: @@unique([onboardingId, positionId]).
    if (prismaCode(err) === "P2002" && (aktion.aktion === "hinzufuegen" || aktion.aktion === "hinweis-uebernehmen")) {
      return { status: 409, body: { error: MELDUNGEN.POSITION_BEREITS_GEWAEHLT, grund: "BEREITS_VORHANDEN" } };
    }
    throw err;
  } finally {
    versandSperreFreigeben(bereich);
  }

  const meldung = ergebnis.geschrieben > 0 ? `${ergebnis.meldung} ${MELDUNGEN.KARTE_NACHTRAG_FOLGT}` : ergebnis.meldung;
  return { status: 200, body: { data: await uebersichtBauen(prisma, vorgang, jetzt), meldung } };
}

/**
 * Die Transaktion einer Aktion (Feinplan S15, Schritte 1–8):
 *   1. Vorgang sperren (beendet inzwischen → 409);
 *   2.–4. je Aktion: Links der alten und neuen Stelle sperren, Aufgaben lesen,
 *      Regel 9 pruefen, schreiben;
 *   5. Aenderungsliste (`aenderungenSchreibenIn`);
 *   6. Nachholen ohne `versandAn` (neue Aufgaben, Faelligkeiten — keine Mail,
 *      keine Anhebung);
 *   7. Abteilungsstatus beider Stellen (`linkStatusNeuBerechnenIn`);
 *   8. Protokoll.
 */
async function aktionIn(
  k: KarteKontext,
  aktion: AusstattungAktionInput,
): Promise<KarteErgebnis & { geschrieben: number }> {
  if (!(await vorgangSperrenIn(k.tx, k.vorgang.id, { jetzt: k.jetzt }))) {
    abweisen(409, MELDUNGEN.KARTE_ABGESCHLOSSEN, "VORGANG_ABGESCHLOSSEN");
  }

  const e = await aktionSchreibenIn(k, aktion);

  const geschrieben = await aenderungenSchreibenIn(k.tx, k.vorgang.id, e.eintraege, { jetzt: k.jetzt });
  await onboardingAusstattungNachholenIn(k.tx, k.vorgang.id, { userId: k.userId, jetzt: k.jetzt });

  if (e.stellen.length > 0) {
    const uebergaenge = await linkStatusNeuBerechnenIn(k.tx, k.bereich, e.stellen, k.jetzt);
    for (const u of uebergaenge) {
      if (!u.uebergang) continue;
      await k.tx.auditLog.create({
        data: {
          userId: k.userId,
          ...auditBezug(k.bereich),
          action: u.uebergang === "FERTIG" ? ABTEILUNGS_AUDIT.ABTEILUNG_FERTIG : ABTEILUNGS_AUDIT.ABTEILUNG_WIEDER_OFFEN,
          details: { departmentKey: u.departmentKey, linkId: u.linkId, ueber: "AUSSTATTUNG" },
        },
      });
    }
  }

  if (e.audit) {
    await k.tx.auditLog.create({
      data: {
        userId: k.userId,
        ...auditBezug(k.bereich),
        action: e.audit.action,
        details: { ...e.audit.details, eintraege: geschrieben } as Prisma.InputJsonValue,
      },
    });
  }
  return { ...e, geschrieben };
}

async function aktionSchreibenIn(k: KarteKontext, aktion: AusstattungAktionInput): Promise<KarteErgebnis> {
  switch (aktion.aktion) {
    case "hinzufuegen":
      return hinzufuegenIn(k, aktion);
    case "aendern":
      return aendernIn(k, aktion);
    case "streichen":
      return streichenIn(k, aktion.ausstattungId);
    case "hinweis-aendern":
      return hinweisAendernIn(k, aktion);
    case "hinweis-gesehen":
      return hinweisGesehenIn(k, aktion.departmentKey);
    case "hinweis-uebernehmen":
      return hinweisUebernehmenIn(k, aktion);
    default: {
      const unbekannt: never = aktion;
      throw new Error(`Unbekannte Aktion: ${JSON.stringify(unbekannt)}`);
    }
  }
}

// ---- Hinzufuegen (Katalog oder frei) und Wiederaufnahme (F23) ----

/** Eine freie Position, wie `ausstattungAktionSchema` sie liefert. */
type FreiePosition = {
  departmentKey: string;
  bezeichnung: string;
  relativeDueDays?: number | null;
  beiAustritt?: string | null;
  rueckgabeKategorie?: string | null;
};

type HinzufuegenEingabe = {
  positionId?: string;
  frei?: FreiePosition;
  auswahl?: string[];
  angabe?: string;
  bemerkung?: string;
};

/**
 * Eine Position ergaenzen: aus dem Katalog DIESES Vorgangs (sonst 400) oder
 * frei (Stelle muss bekannt sein). Steht die Katalogposition schon im
 * Vorgang, ist das 409 BEREITS_VORHANDEN — ausser sie ist gestrichen: dann
 * wird sie wieder aufgenommen, samt ihrer entfallenen Aufgaben (F23).
 */
async function hinzufuegenIn(k: KarteKontext, e: HinzufuegenEingabe): Promise<KarteErgebnis> {
  if (e.positionId) {
    const { positionen } = await katalogAusschnittLaden(k.tx, k.vorgang);
    const p = positionen.find((x) => x.id === e.positionId);
    if (!p) abweisen(400, MELDUNGEN.POSITION_NICHT_IM_KATALOG);
    const katalogOptionen = p.art === "AUSWAHL" ? [...p.optionen] : [];
    const vorhanden = await k.tx.onboardingAusstattung.findFirst({
      where: { onboardingId: k.vorgang.id, positionId: p.id },
      select: ZEILE_KARTE_AUSWAHL,
    });
    if (vorhanden && vorhanden.gestrichenAm == null) {
      abweisen(409, MELDUNGEN.POSITION_BEREITS_GEWAEHLT, "BEREITS_VORHANDEN");
    }
    if (vorhanden) return wiederAufnehmenIn(k, vorhanden, katalogOptionen, e);
    const basis = momentaufnahme(p);
    return neueZeileIn(k, basis, wahlFuerArt(basis, e, katalogOptionen));
  }
  if (!e.frei) abweisen(400, MELDUNGEN.KARTE_POSITION_ODER_FREI);
  await stelleBekanntIn(k.tx, e.frei.departmentKey);
  const basis = freieMomentaufnahme(e.frei);
  return neueZeileIn(k, basis, wahlFuerArt(basis, e, []));
}

async function neueZeileIn(
  k: KarteKontext,
  basis: AusstattungsMomentaufnahme,
  wahl: { auswahl: string[]; angabe: string | null; bemerkung: string | null | undefined },
): Promise<KarteErgebnis> {
  const stellen = zeilenStellen(basis);
  await linksSperrenIn(k.tx, k.bereich, stellen);
  const informiert = await informierteStellenIn(k.tx, k.vorgang.id, stellen);
  const bemerkung = wahl.bemerkung ?? null;
  const zeile = await k.tx.onboardingAusstattung.create({
    data: {
      onboardingId: k.vorgang.id,
      ...basis,
      sichtbarFuer: [...basis.sichtbarFuer],
      auswahl: wahl.auswahl,
      angabe: wahl.angabe,
      bemerkung,
      bemerkungQuelle: bemerkung ? bemerkungQuelleNach(null, "HR") : null,
      quelle: "HR",
      erfasstVonId: k.userId,
    },
    select: { id: true },
  });
  const nachher = zeilenAenderungsStand({ ...basis, auswahl: wahl.auswahl, angabe: wahl.angabe, bemerkung });
  return {
    meldung: MELDUNGEN.KARTE_HINZUGEFUEGT,
    eintraege: aenderungsEintraege(null, nachher, informiert),
    stellen,
    audit: {
      action: AUSSTATTUNG_AUDIT.HR_HINZUGEFUEGT,
      details: {
        ausstattungId: zeile.id,
        positionId: basis.positionId,
        departmentKey: basis.departmentKey,
        art: basis.art,
        bezeichnung: basis.bezeichnung,
        auswahl: wahl.auswahl,
        bemerkungLaenge: laenge(bemerkung),
        angabeLaenge: laenge(wahl.angabe),
      },
    },
  };
}

/** F23: eine gestrichene Zeile wieder aufnehmen — dieselbe Zeile, ihre entfallenen Aufgaben wieder offen. */
async function wiederAufnehmenIn(
  k: KarteKontext,
  z: KarteZeile,
  katalogOptionen: ReadonlyArray<string>,
  e: HinzufuegenEingabe,
): Promise<KarteErgebnis> {
  const stellen = zeilenStellen(z);
  await linksSperrenIn(k.tx, k.bereich, stellen);
  const aufgaben = await zeilenAufgabenLadenIn(k.tx, k.vorgang.id, z.id);
  const wahl = wahlFuerArt(z, e, waehlbareOptionen(katalogOptionen, z, aufgaben));
  const informiert = await informierteStellenIn(k.tx, k.vorgang.id, stellen);

  const soll = new Set(z.art === "AUSWAHL" ? wahl.auswahl : [""]);
  const wieder = aufgaben.filter((a) => a.status === "entfaellt" && soll.has(a.option)).map((a) => a.checklistItemId);
  const geoeffnet = await aufgabeWiederAufnehmenIn(k.tx, {
    onboardingId: k.vorgang.id,
    ids: wieder,
    departmentKey: z.departmentKey,
  });

  const bem = bemerkungNach(z, wahl.bemerkung);
  await k.tx.onboardingAusstattung.update({
    where: { id: z.id },
    data: {
      gestrichenAm: null,
      auswahl: wahl.auswahl,
      angabe: wahl.angabe,
      bemerkung: bem.bemerkung,
      bemerkungQuelle: bem.bemerkungQuelle,
    },
  });
  const nachher = zeilenAenderungsStand({ ...z, gestrichenAm: null, auswahl: wahl.auswahl, angabe: wahl.angabe, bemerkung: bem.bemerkung });
  return {
    meldung: MELDUNGEN.KARTE_WIEDER_AUFGENOMMEN,
    eintraege: aenderungsEintraege(null, nachher, informiert),
    stellen,
    audit: {
      action: AUSSTATTUNG_AUDIT.HR_HINZUGEFUEGT,
      details: {
        ausstattungId: z.id,
        positionId: z.positionId,
        departmentKey: z.departmentKey,
        art: z.art,
        bezeichnung: z.bezeichnung,
        auswahl: wahl.auswahl,
        wiederaufgenommen: true,
        wiederGeoeffnet: geoeffnet,
        bemerkungLaenge: laenge(bem.bemerkung),
        angabeLaenge: laenge(wahl.angabe),
      },
    },
  };
}

// ---- Aendern (Auswahl, Angabe, Bemerkung, Stelle, Faelligkeit) ----

type AendernEingabe = Extract<AusstattungAktionInput, { aktion: "aendern" }>;

/**
 * Eine Zeile aendern (Regel 9). Abgewaehlte Optionen verschwinden vor der
 * Information der Stelle samt Aufgabe, danach entfallen sie (F2); eine wieder
 * gewaehlte entfallene Option oeffnet ihre Aufgabe wieder (F23). Beim
 * Stellenwechsel ziehen die offenen Aufgaben mit (die Aenderungsliste meldet
 * ENTFAELLT an die alte, NEU an die neue Stelle), mit Tagesangabe samt neuer
 * Faelligkeit wie in F23. Eine Faelligkeit nur an einer offenen Aufgabe;
 * `null` raeumt auch die Tagesangabe ab (wie der Portal-PATCH), `eilt` faellt
 * immer (`faelligkeitVonHand`). Eine reine Faelligkeitsaenderung schreibt
 * keinen Eintrag.
 */
async function aendernIn(k: KarteKontext, a: AendernEingabe): Promise<KarteErgebnis> {
  const onboardingId = k.vorgang.id;
  const z = await zeileLadenIn(k.tx, onboardingId, a.ausstattungId);
  if (z.gestrichenAm != null) grundAbweisen("GESTRICHEN");

  let neueAuswahl: string[] | undefined;
  if (a.auswahl !== undefined) {
    if (z.art !== "AUSWAHL") abweisen(400, MELDUNGEN.KARTE_PASST_NICHT_ZUR_ART);
    const vorab = await zeilenAufgabenLadenIn(k.tx, onboardingId, z.id);
    const optionen = waehlbareOptionen(await katalogOptionenIn(k.tx, k.vorgang, z.positionId), z, vorab);
    neueAuswahl = auswahlPruefen(a.auswahl, optionen);
  }
  let neueAngabe: string | undefined;
  if (a.angabe !== undefined) {
    if (z.art !== "ANGABE") abweisen(400, MELDUNGEN.KARTE_PASST_NICHT_ZUR_ART);
    neueAngabe = angabePruefen(a.angabe, z.angabeSchluessel, z.bezeichnung);
  }
  const bemerkungNeu = a.bemerkung === undefined ? undefined : textOderNull(a.bemerkung);
  if (z.art === "ANGABE" && bemerkungNeu) abweisen(400, MELDUNGEN.ANGABE_OHNE_BEMERKUNG);
  const bem = bemerkungNach(z, bemerkungNeu);
  let neueStelle: string | undefined;
  if (a.departmentKey !== undefined && a.departmentKey !== z.departmentKey) {
    await stelleBekanntIn(k.tx, a.departmentKey);
    neueStelle = a.departmentKey;
  }

  const abwaehlen = neueAuswahl ? z.auswahl.filter((o) => !neueAuswahl.includes(o)) : [];
  const hinzu = neueAuswahl ? neueAuswahl.filter((o) => !z.auswahl.includes(o)) : [];
  const angabeGeaendert = neueAngabe !== undefined && neueAngabe !== textOderNull(z.angabe);
  const faelligkeiten = a.faelligkeiten ?? [];
  if (
    abwaehlen.length === 0 &&
    hinzu.length === 0 &&
    !bem.geaendert &&
    !angabeGeaendert &&
    !neueStelle &&
    faelligkeiten.length === 0
  ) {
    return UNVERAENDERT;
  }

  // Sperren (Links der alten und neuen Stelle), DANN den Stand lesen und pruefen.
  const stelle = neueStelle ?? z.departmentKey;
  const sichtbarFuer = z.sichtbarFuer.filter((key) => key !== stelle);
  const nachherStellen = zeilenStellen({ departmentKey: stelle, art: z.art, sichtbarFuer });
  const stellen = [...new Set([...zeilenStellen(z), ...nachherStellen])];
  await linksSperrenIn(k.tx, k.bereich, stellen);
  const aufgaben = await zeilenAufgabenLadenIn(k.tx, onboardingId, z.id);
  const grund = aenderungPruefen(z, aufgaben, {
    abwaehlen,
    hinzu,
    bemerkung: bem.geaendert,
    angabe: angabeGeaendert,
    stelle: !!neueStelle,
    faelligkeiten: faelligkeiten.map((f) => f.option),
  });
  if (grund) grundAbweisen(grund);
  const informiert = await informierteStellenIn(k.tx, onboardingId, stellen);

  // Abgewaehlte Optionen: vor der Information der Stelle weg, danach entfallen.
  const weg = aufgaben.filter((x) => abwaehlen.includes(x.option) && x.status === "offen").map((x) => x.checklistItemId);
  if (weg.length > 0) {
    const anzahl = informiert.has(z.departmentKey)
      ? await aufgabeEntfallenIn(k.tx, { onboardingId, ids: weg, jetzt: k.jetzt, userId: k.userId })
      : (await k.tx.checklistItem.deleteMany({ where: { onboardingId, id: { in: weg }, isCompleted: false } })).count;
    if (anzahl !== weg.length) grundAbweisen("AUFGABE_ERLEDIGT");
  }
  // Wieder gewaehlte Optionen: die entfallene Aufgabe oeffnen (F23).
  const wieder = aufgaben.filter((x) => hinzu.includes(x.option) && x.status === "entfaellt").map((x) => x.checklistItemId);
  await aufgabeWiederAufnehmenIn(k.tx, { onboardingId, ids: wieder, departmentKey: stelle });
  // Stellenwechsel: die offenen Aufgaben ziehen mit — fuer die neue Stelle
  // sind sie neu. Mit Tagesangabe bekommen sie ihre Faelligkeit neu wie bei
  // der Wiederaufnahme (F23: `dueDate: null`, `eilt: false`; das Nachholen
  // dieser Transaktion rechnet nach Regel 14 — nie vor heute, sonst „Eilt“).
  // Ohne Tagesangabe bleibt die gespeicherte; verstrichen, hebt der naechste
  // Versand an die neue Stelle sie an (F22: offener Eintrag NEU der Stelle).
  if (neueStelle) {
    const bleibend = aufgaben
      .filter((x) => x.status === "offen" && !abwaehlen.includes(x.option))
      .map((x) => x.checklistItemId);
    if (bleibend.length > 0) {
      const basis = { onboardingId, id: { in: bleibend }, isCompleted: false, entfaelltAm: null };
      const mitTagen = await k.tx.checklistItem.updateMany({
        where: { ...basis, relativeDueDays: { not: null } },
        data: { assignee: neueStelle, dueDate: null, eilt: false },
      });
      const ohneTage = await k.tx.checklistItem.updateMany({
        where: { ...basis, relativeDueDays: null },
        data: { assignee: neueStelle },
      });
      if (mitTagen.count + ohneTage.count !== bleibend.length) grundAbweisen("AUFGABE_ERLEDIGT");
    }
  }
  // Faelligkeiten (nur offene Aufgaben; `null` raeumt die Tagesangabe ab). Eine
  // Frist von Hand ist nie angehoben: `eilt` faellt mit (Regel 14).
  for (const f of faelligkeiten) {
    const ziel = aufgaben.find((x) => x.option === f.option && x.status === "offen");
    if (!ziel) grundAbweisen("OHNE_OFFENE_AUFGABE");
    const r = await k.tx.checklistItem.updateMany({
      where: { onboardingId, id: ziel.checklistItemId, isCompleted: false, entfaelltAm: null },
      data: faelligkeitVonHand(f.dueDate),
    });
    if (r.count !== 1) grundAbweisen("AUFGABE_ERLEDIGT");
  }

  // Die Zeile selbst.
  const data: Prisma.OnboardingAusstattungUncheckedUpdateInput = {};
  const aenderungen: Record<string, unknown> = {};
  if (neueAuswahl && (abwaehlen.length > 0 || hinzu.length > 0)) {
    data.auswahl = neueAuswahl;
    aenderungen.auswahl = { von: z.auswahl, nach: neueAuswahl };
  }
  if (angabeGeaendert) {
    data.angabe = neueAngabe;
    aenderungen.angabeLaenge = { von: laenge(z.angabe), nach: laenge(neueAngabe) };
  }
  if (bem.geaendert) {
    data.bemerkung = bem.bemerkung;
    data.bemerkungQuelle = bem.bemerkungQuelle;
    aenderungen.bemerkungLaenge = { von: laenge(z.bemerkung), nach: laenge(bem.bemerkung) };
  }
  if (neueStelle) {
    data.departmentKey = neueStelle;
    if (z.art === "ANGABE") data.sichtbarFuer = sichtbarFuer;
    aenderungen.departmentKey = { von: z.departmentKey, nach: neueStelle };
  }
  if (faelligkeiten.length > 0) aenderungen.faelligkeiten = faelligkeiten;
  if (Object.keys(data).length > 0) await k.tx.onboardingAusstattung.update({ where: { id: z.id }, data });

  const nachher = {
    ...z,
    departmentKey: stelle,
    sichtbarFuer: z.art === "ANGABE" ? sichtbarFuer : z.sichtbarFuer,
    auswahl: neueAuswahl ?? z.auswahl,
    angabe: angabeGeaendert ? (neueAngabe ?? null) : z.angabe,
    bemerkung: bem.bemerkung,
  };
  return {
    meldung: MELDUNGEN.KARTE_GEAENDERT,
    eintraege: aenderungsEintraege(zeilenAenderungsStand(z), zeilenAenderungsStand(nachher), informiert),
    stellen,
    audit: {
      action: AUSSTATTUNG_AUDIT.HR_GEAENDERT,
      details: { ausstattungId: z.id, positionId: z.positionId, departmentKey: stelle, bezeichnung: z.bezeichnung, aenderungen },
    },
  };
}

// ---- Streichen ----

/**
 * Eine Position streichen (Regel 9, E-A21): nie mit erledigter Aufgabe. Vor
 * der Information der Stelle (bei einer Angabe: keiner der Stellen, die sie
 * sehen) verschwindet sie ganz — ERST die Aufgaben (die Kaskade nimmt die
 * Verknuepfungen mit), DANN die Zeile; umgekehrt bliebe eine verwaiste Aufgabe
 * stehen und ginge weiter an die Stelle. Danach bleibt die Zeile mit
 * `gestrichenAm`, ihre offenen Aufgaben entfallen (F2), Eintrag ENTFAELLT.
 */
async function streichenIn(k: KarteKontext, ausstattungId: string): Promise<KarteErgebnis> {
  const onboardingId = k.vorgang.id;
  const z = await zeileLadenIn(k.tx, onboardingId, ausstattungId);
  if (z.gestrichenAm != null) grundAbweisen("GESTRICHEN");
  const stellen = zeilenStellen(z);
  await linksSperrenIn(k.tx, k.bereich, stellen);
  const aufgaben = await zeilenAufgabenLadenIn(k.tx, onboardingId, z.id);
  const grund = aenderungPruefen(z, aufgaben, { streichen: true });
  if (grund) grundAbweisen(grund);
  const informiert = await informierteStellenIn(k.tx, onboardingId, stellen);

  const offen = aufgaben.filter((a) => a.status === "offen").map((a) => a.checklistItemId);
  const entfallen = aufgaben.filter((a) => a.status === "entfaellt").map((a) => a.checklistItemId);
  const basisDetails = { ausstattungId: z.id, positionId: z.positionId, departmentKey: z.departmentKey, bezeichnung: z.bezeichnung };

  if (!stellen.some((key) => informiert.has(key))) {
    if (offen.length > 0) {
      const r = await k.tx.checklistItem.deleteMany({ where: { onboardingId, id: { in: offen }, isCompleted: false } });
      if (r.count !== offen.length) grundAbweisen("AUFGABE_ERLEDIGT");
    }
    if (entfallen.length > 0) {
      await k.tx.checklistItem.deleteMany({ where: { onboardingId, id: { in: entfallen }, entfaelltAm: { not: null } } });
    }
    await k.tx.onboardingAusstattung.delete({ where: { id: z.id } });
    return {
      meldung: MELDUNGEN.KARTE_ENTFERNT,
      eintraege: [],
      stellen,
      audit: {
        action: AUSSTATTUNG_AUDIT.HR_GESTRICHEN,
        details: { ...basisDetails, entfernt: true, aufgaben: offen.length + entfallen.length },
      },
    };
  }

  if (offen.length > 0) {
    const n = await aufgabeEntfallenIn(k.tx, { onboardingId, ids: offen, jetzt: k.jetzt, userId: k.userId });
    if (n !== offen.length) grundAbweisen("AUFGABE_ERLEDIGT");
  }
  await k.tx.onboardingAusstattung.update({ where: { id: z.id }, data: { gestrichenAm: k.jetzt } });
  return {
    meldung: MELDUNGEN.KARTE_GESTRICHEN,
    eintraege: aenderungsEintraege(zeilenAenderungsStand(z), null, informiert),
    stellen,
    audit: { action: AUSSTATTUNG_AUDIT.HR_GESTRICHEN, details: { ...basisDetails, entfernt: false, aufgaben: offen.length } },
  };
}

// ---- Hinweise an Stellen (E-A14, F20) ----

const HINWEIS_KARTE_AUSWAHL = {
  text: true,
  quelle: true,
  checklistItemId: true,
  gesehenAm: true,
} as const satisfies Prisma.OnboardingStellenHinweisSelect;

function hinweisSchluessel(onboardingId: string, departmentKey: string) {
  return { onboardingId_departmentKey: { onboardingId, departmentKey } };
}

type HinweisAendernEingabe = Extract<AusstattungAktionInput, { aktion: "hinweis-aendern" }>;

/**
 * Hinweis anlegen, aendern, entfernen und seine Faelligkeit setzen
 * (Feinplan 1.10, „Hinweis-Aufgabe“):
 *   - neu (keine Zeile oder Text ""): `quelle "HR"`; die Aufgabe legt das
 *     Nachholen an — war eine entfallene verknuepft, oeffnet sie sich wieder
 *     (F23);
 *   - aendern: `quelle` nach `bemerkungQuelleNach` (Text der Fuehrungskraft →
 *     BEIDE), Eintrag GEAENDERT;
 *   - entfernen (`hinweis: ""`): vor der Information Aufgabe und Zeile
 *     loeschen (erst die Aufgabe, die Verknuepfung wird per SetNull frei),
 *     danach Text "", Aufgabe entfaellt, Eintrag ENTFAELLT;
 *   - `dueDate`: nur an einer offenen Hinweis-Aufgabe (F20); `null` raeumt
 *     auch die Tagesangabe ab; `eilt` faellt (`faelligkeitVonHand`).
 * Ist die Hinweis-Aufgabe erledigt, sind Aendern, Entfernen und Faelligkeit
 * 409 AUFGABE_ERLEDIGT (`hinweisAenderungPruefen`).
 */
async function hinweisAendernIn(k: KarteKontext, a: HinweisAendernEingabe): Promise<KarteErgebnis> {
  const onboardingId = k.vorgang.id;
  const key = a.departmentKey;
  await stelleBekanntIn(k.tx, key);
  await linksSperrenIn(k.tx, k.bereich, [key]);
  const h = await k.tx.onboardingStellenHinweis.findUnique({
    where: hinweisSchluessel(onboardingId, key),
    select: HINWEIS_KARTE_AUSWAHL,
  });
  const aufgabe = h?.checklistItemId
    ? await k.tx.checklistItem.findUnique({
        where: { id: h.checklistItemId },
        select: { id: true, isCompleted: true, entfaelltAm: true },
      })
    : null;
  const status = aufgabe ? aufgabenStatus(aufgabe) : null;
  const alt = textOderNull(h?.text);
  const neu = a.hinweis === undefined ? undefined : textOderNull(a.hinweis);
  const textGeaendert = neu !== undefined && neu !== alt;
  const dueDateGeaendert = a.dueDate !== undefined && neu !== null;
  const grund = hinweisAenderungPruefen(h ? { text: h.text } : null, status ? { status } : null, {
    text: textGeaendert,
    dueDate: dueDateGeaendert,
  });
  if (grund) grundAbweisen(grund);
  if (!textGeaendert && !dueDateGeaendert) return UNVERAENDERT;
  const informiert = await informierteStellenIn(k.tx, onboardingId, [key]);

  let meldung: string = MELDUNGEN.KARTE_HINWEIS_GESPEICHERT;
  let art: "NEU" | "GEAENDERT" | "ENTFERNT" | null = null;
  if (textGeaendert && alt === null && neu) {
    if (h) {
      await k.tx.onboardingStellenHinweis.update({ where: hinweisSchluessel(onboardingId, key), data: { text: neu, quelle: "HR" } });
    } else {
      await k.tx.onboardingStellenHinweis.create({ data: { onboardingId, departmentKey: key, text: neu, quelle: "HR" } });
    }
    if (aufgabe && status === "entfaellt") {
      await aufgabeWiederAufnehmenIn(k.tx, { onboardingId, ids: [aufgabe.id], departmentKey: key });
    }
    art = "NEU";
  } else if (textGeaendert && neu === null && h) {
    if (!informiert.has(key)) {
      if (aufgabe) {
        const r = await k.tx.checklistItem.deleteMany({ where: { onboardingId, id: aufgabe.id, isCompleted: false } });
        if (r.count !== 1) grundAbweisen("AUFGABE_ERLEDIGT");
      }
      await k.tx.onboardingStellenHinweis.delete({ where: hinweisSchluessel(onboardingId, key) });
    } else {
      if (aufgabe && status === "offen") {
        const n = await aufgabeEntfallenIn(k.tx, { onboardingId, ids: [aufgabe.id], jetzt: k.jetzt, userId: k.userId });
        if (n !== 1) grundAbweisen("AUFGABE_ERLEDIGT");
      }
      await k.tx.onboardingStellenHinweis.update({ where: hinweisSchluessel(onboardingId, key), data: { text: "" } });
    }
    art = "ENTFERNT";
    meldung = MELDUNGEN.KARTE_HINWEIS_ENTFERNT;
  } else if (textGeaendert && neu && h) {
    await k.tx.onboardingStellenHinweis.update({
      where: hinweisSchluessel(onboardingId, key),
      data: { text: neu, quelle: bemerkungQuelleNach(h.quelle, "HR") },
    });
    art = "GEAENDERT";
  }

  if (dueDateGeaendert && aufgabe) {
    const r = await k.tx.checklistItem.updateMany({
      where: { onboardingId, id: aufgabe.id, isCompleted: false, entfaelltAm: null },
      data: faelligkeitVonHand(a.dueDate ?? null),
    });
    if (r.count !== 1) grundAbweisen("AUFGABE_ERLEDIGT");
  }

  return {
    meldung,
    eintraege: textGeaendert
      ? aenderungsEintraege(hinweisAenderungsStand(key, alt), hinweisAenderungsStand(key, neu ?? null), informiert)
      : [],
    stellen: [key],
    audit: {
      action: AUSSTATTUNG_AUDIT.HINWEIS_GEAENDERT,
      details: {
        departmentKey: key,
        art,
        laenge: laenge(neu === undefined ? alt : neu),
        ...(dueDateGeaendert ? { dueDate: a.dueDate } : {}),
      },
    },
  };
}

/** „Zur Kenntnis genommen“ (nur `gesehenAm`, kein Eintrag — keine Inhaltsaenderung). Ein zweites Mal aendert nichts. */
async function hinweisGesehenIn(k: KarteKontext, departmentKey: string): Promise<KarteErgebnis> {
  const h = await k.tx.onboardingStellenHinweis.findUnique({
    where: hinweisSchluessel(k.vorgang.id, departmentKey),
    select: HINWEIS_KARTE_AUSWAHL,
  });
  if (!h || !textOderNull(h.text)) abweisen(404, MELDUNGEN.HINWEIS_NICHT_GEFUNDEN);
  if (h.gesehenAm) return { ...UNVERAENDERT, meldung: MELDUNGEN.KARTE_HINWEIS_GESEHEN };
  await k.tx.onboardingStellenHinweis.update({
    where: hinweisSchluessel(k.vorgang.id, departmentKey),
    data: { gesehenAm: k.jetzt },
  });
  return {
    meldung: MELDUNGEN.KARTE_HINWEIS_GESEHEN,
    eintraege: [],
    stellen: [],
    audit: { action: AUSSTATTUNG_AUDIT.HINWEIS_GESEHEN, details: { departmentKey } },
  };
}

type HinweisUebernehmenEingabe = Extract<AusstattungAktionInput, { aktion: "hinweis-uebernehmen" }>;

/**
 * „Als Position übernehmen…“: legt die Position an wie „hinzufuegen“ und setzt
 * `gesehenAm`. Die Hinweis-Aufgabe bleibt unveraendert — der Hinweis steht
 * weiter auf der Link-Seite und kann mehr enthalten als die Position; wer ihn
 * nicht mehr will, entfernt ihn danach.
 */
async function hinweisUebernehmenIn(k: KarteKontext, a: HinweisUebernehmenEingabe): Promise<KarteErgebnis> {
  const h = await k.tx.onboardingStellenHinweis.findUnique({
    where: hinweisSchluessel(k.vorgang.id, a.departmentKey),
    select: HINWEIS_KARTE_AUSWAHL,
  });
  if (!h || !textOderNull(h.text)) abweisen(404, MELDUNGEN.HINWEIS_NICHT_GEFUNDEN);
  const e = await hinzufuegenIn(k, a);
  if (!h.gesehenAm) {
    await k.tx.onboardingStellenHinweis.update({
      where: hinweisSchluessel(k.vorgang.id, a.departmentKey),
      data: { gesehenAm: k.jetzt },
    });
  }
  return {
    ...e,
    meldung: MELDUNGEN.KARTE_HINWEIS_UEBERNOMMEN,
    audit: {
      action: AUSSTATTUNG_AUDIT.HINWEIS_UEBERNOMMEN,
      details: { ...(e.audit?.details ?? {}), hinweisVon: a.departmentKey },
    },
  };
}
