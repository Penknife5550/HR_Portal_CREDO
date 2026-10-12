/**
 * CREDO HR-Portal – Ausstattung & Zugaenge: der Dienst am Vorgang
 *
 * Stand S10 (Paket A2): das Formular der Fuehrungskraft und die Sicht von HR.
 *
 *   fuehrungskraftSichtLaden      GET /api/modalitaeten/[token] (Feld `ausstattung`)
 *   fuehrungskraftWahlSpeichernIn PUT /api/modalitaeten/[token] (in der Transaktion der Route)
 *   ausstattungKurzLaden          POST /api/modalitaeten/[token] (HR-Mail, `{{ausstattung_kurz}}`)
 *   ausstattungUebersichtLaden    GET /api/onboarding/[id] (Feld `ausstattung`, nur HR_EDIT_ROLES)
 *
 * Spaetere Schritte haengen hier die Aktionen der HR-Karte an. Die Regeln
 * selbst stehen rein in src/lib/ausstattung.ts (`wahlPruefen`,
 * `fuehrungskraftSicht`, `momentaufnahme`, `bemerkungQuelleNach`,
 * `ausstattungKurz`, `ausstattungsUebersichtBauen`); hier stehen nur Laden
 * und Schreiben.
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
 *      „alles abgewaehlt“ bleibt abgewaehlt.
 *   6. Der GET schreibt nichts.
 *   7. Die Sicht von HR (`ausstattungUebersichtLaden`) bekommt nur, wer in
 *      HR_EDIT_ROLES steht — fuer alle anderen `null`, OHNE die Datenbank zu
 *      fragen (Regel 16). Die neuen Tabellen stehen deshalb bewusst NICHT im
 *      `include` der Detailroute: `...safeOnboarding` gaebe sie sonst an alle
 *      PORTAL_ROLES weiter (Einrichtungsleitung, Vorgesetzte).
 *   8. Die HR-Mail `supervisor-completed` bekommt nur Zahlen
 *      (`ausstattungKurz`), nie Bemerkungs- oder Hinweistexte. Ohne Merker
 *      `mitAusstattung` gibt es nichts zu zaehlen — dann ohne Abfrage "".
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { HR_EDIT_ROLES } from "@/lib/permissions";
import { darfVorgesetzteSchreiben } from "@/lib/onboarding-spuren";
import { onboardingEmpfaengerEinrichtung } from "@/lib/abteilungsaufgaben";
import { katalogAusschnittLaden, type AusschnittVorgang } from "@/lib/ausstattung-katalog";
import {
  ausstattungKurz,
  ausstattungsUebersichtBauen,
  ausstattungsZustand,
  bemerkungQuelleNach,
  fuehrungskraftSicht,
  wahlPruefen,
  type AusstattungsQuelle,
  type AusstattungsUebersicht,
  type BestehendeFuehrungskraftWahl,
  type Erfasser,
  type FuehrungskraftEingabe,
  type FuehrungskraftSicht,
} from "@/lib/ausstattung";

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

  await tx.supervisorData.update({ where: { onboardingId }, data: { ausstattungGespeichertAm: jetzt } });
  return { zeilen: pruefung.zeilen?.length ?? null, hinweise: pruefung.hinweise?.length ?? null };
}

// =============================================
// HR liest mit (S10): Kurzform der HR-Mail, Uebersicht der Detailroute
// =============================================

/** Die Felder einer Zeile, die Uebersicht und PDF lesen (`UebersichtZeileDaten`). */
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

/**
 * Was die Uebersicht ueber den Vorgang wissen muss — so liegt die Zeile in der
 * Detailroute ohnehin vor; der Vorgang wird NICHT ein zweites Mal geladen.
 */
export interface UebersichtVorgang extends AusschnittVorgang {
  id: string;
  status: string;
  supervisorSubmittedAt?: Date | null;
  supervisorData?: { isComplete?: boolean | null; mitAusstattung?: boolean | null } | null;
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
 * (Feld `ausstattung`; Karte im Reiter „Vorgesetzter“, ab S16 auch im Reiter
 * Checkliste). Nur fuer HR_EDIT_ROLES — sonst `null`, OHNE die Datenbank zu
 * fragen (Regel 16; die Middleware sperrt fremde Mandanten, dieser Schutz
 * haengt nicht daran).
 *
 * Nutzt die uebergebene Vorgangszeile (Status, `supervisorSubmittedAt`,
 * `supervisorData`, `organizationId`, `arbeitsortId`, Fragebogen- und
 * Vorgangsart) und laedt nur:
 *   - die Zeilen und Hinweise des Vorgangs (alle Quellen);
 *   - den Katalogausschnitt, solange der Vorgang laeuft und es etwas
 *     abzugleichen gibt — fuer `hinzufuegbar` (BEARBEITBAR) und „nicht mehr
 *     im Katalog“;
 *   - die Abteilungen (Name und Adresse der Stelle am Arbeitsort), nur wenn es
 *     eine Gruppe gibt;
 *   - die Namen der HR-Konten hinter „ergänzt von HR (…)“, nur wenn es solche
 *     Zeilen gibt.
 */
export async function ausstattungUebersichtLaden(
  onboarding: UebersichtVorgang,
  session: { role: string },
): Promise<AusstattungsUebersicht | null> {
  const darfBearbeiten = HR_EDIT_ROLES.includes(session.role);
  if (!darfBearbeiten) return null;

  const onboardingId = onboarding.id;
  const { zustand } = ausstattungsZustand(onboarding, darfBearbeiten);
  const zeilen = await prisma.onboardingAusstattung.findMany({
    where: { onboardingId },
    select: UEBERSICHT_ZEILEN_AUSWAHL,
    orderBy: UEBERSICHT_ZEILEN_ORDNUNG,
  });
  const hinweise = await prisma.onboardingStellenHinweis.findMany({
    where: { onboardingId },
    select: UEBERSICHT_HINWEIS_AUSWAHL,
  });

  const katalogNoetig =
    zustand === "BEARBEITBAR" || (zustand === "ENTWURF" && zeilen.some((z) => z.positionId != null));
  const katalog = katalogNoetig ? (await katalogAusschnittLaden(prisma, onboarding)).positionen : null;

  const mitGruppen = zeilen.length > 0 || hinweise.some((h) => h.text.trim() !== "");
  const konfigs = mitGruppen ? await prisma.departmentConfig.findMany({ select: KONFIG_AUSWAHL }) : [];

  const erfasserIds = [
    ...new Set(zeilen.map((z) => z.erfasstVonId).filter((id): id is string => typeof id === "string" && id !== "")),
  ];
  const erfasser: Record<string, Erfasser> = {};
  if (erfasserIds.length > 0) {
    const konten = await prisma.user.findMany({
      where: { id: { in: erfasserIds } },
      select: { id: true, firstName: true, lastName: true },
    });
    for (const k of konten) erfasser[k.id] = { firstName: k.firstName, lastName: k.lastName };
  }

  return ausstattungsUebersichtBauen({
    vorgang: onboarding,
    darfBearbeiten,
    zeilen,
    hinweise,
    arbeitsortId: onboardingEmpfaengerEinrichtung(onboarding),
    konfigs,
    katalog,
    erfasser,
  });
}
