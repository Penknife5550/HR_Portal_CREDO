/**
 * CREDO HR-Portal – Ausstattung & Zugaenge: Lesen am Vorgang (nur Server)
 *
 * NUR LESEND (Feinplan 1.5). Die Datei laedt, was Anlegen, Nachholen und
 * spaeter Versandkern und Link-Seite ueber die Ausstattung eines Vorgangs
 * wissen muessen — und schreibt nie. Deshalb duerfen auch
 * abteilungsaufgaben-dienst.ts und -uebergaenge.ts sie importieren, ohne dass
 * ein Kreis entsteht (Dienst und Adapter importieren sie, nie umgekehrt).
 *
 * Jede Funktion bekommt den Datenbankzugriff (`db`) vom Aufrufer: innerhalb
 * einer Transaktion `tx` — dann liest sie nach dessen Sperren —, sonst
 * `prisma`.
 *
 * Stand S12: `ausstattungsStandLaden` (Zeilen, Verknuepfungen, Hinweise fuer
 * `fehlendeAusstattungsAufgaben`). Seit S13 fuer die Mail an die Stelle:
 * `ausstattungZuAufgabenLaden` (Bemerkung je Aufgabe, Versandkern) und
 * `angabenJeStelleLaden` (Angaben und Hinweis je Stelle, Infokasten der
 * Zuweisungsmail). Seit S17 die offene Aenderungsliste je Stelle
 * (`offeneAenderungenLaden`, Nachtrag und Waechter, Regel 10/15).
 *
 * Bewusst ohne Relationsfilter und ohne Relations-`select`: Die
 * Verknuepfungen kommen in einer eigenen Abfrage ueber die IDs der Zeilen.
 * So bleibt die Abfrageform schlicht (und die In-Memory-Datenbank der Tests,
 * src/__tests__/hilfen/abteilungs-fake-db.ts, versteht sie).
 */

import type { Prisma } from "@prisma/client";
import {
  angabenFuer,
  bemerkungLabel,
  nachtragListe,
  type AngabenFuerStelle,
  type AusstattungsStand,
  type NachtragListe,
} from "@/lib/ausstattung";

type Db = Prisma.TransactionClient;

/** Die Felder einer Zeile, die `sollAufgaben` braucht. */
const STAND_ZEILEN_AUSWAHL = {
  id: true,
  departmentKey: true,
  art: true,
  bezeichnung: true,
  aufgabeTitel: true,
  hinweisStelle: true,
  relativeDueDays: true,
  reihenfolge: true,
  auswahl: true,
  gestrichenAm: true,
} as const satisfies Prisma.OnboardingAusstattungSelect;

/**
 * Der Stand, gegen den das Nachholen rechnet (`fehlendeAusstattungsAufgaben`):
 * alle Zeilen des Vorgangs (auch gestrichene — `sollAufgaben` laesst sie
 * aus), alle Verknuepfungen dieser Zeilen (auch zu entfallenen Aufgaben) und
 * alle Hinweise an Stellen. Drei Abfragen, die zweite nur mit Zeilen.
 */
export async function ausstattungsStandLaden(db: Db, onboardingId: string): Promise<AusstattungsStand> {
  const zeilen = await db.onboardingAusstattung.findMany({
    where: { onboardingId },
    select: STAND_ZEILEN_AUSWAHL,
    orderBy: [{ reihenfolge: "asc" }, { bezeichnung: "asc" }],
  });
  const verknuepfungen =
    zeilen.length > 0
      ? await db.onboardingAusstattungAufgabe.findMany({
          where: { ausstattungId: { in: zeilen.map((z) => z.id) } },
          select: { ausstattungId: true, option: true },
        })
      : [];
  const hinweise = await db.onboardingStellenHinweis.findMany({
    where: { onboardingId },
    select: { departmentKey: true, text: true, checklistItemId: true, inhaltGeleertAm: true },
  });
  return { zeilen, verknuepfungen, hinweise };
}

// =============================================
// Mail an die Stelle (S13): Bemerkung je Aufgabe, Angaben je Stelle
// =============================================

/** Was der Versandkern zu einer Ausstattungsaufgabe wissen muss. */
export interface AusstattungZuAufgabe {
  ausstattungId: string;
  /** "" = ganze Position, sonst die gewaehlte Option. */
  option: string;
  /**
   * Die Stelle, der die Zeile HEUTE gehoert. Nach einem Stellenwechsel bleiben
   * entfallene Aufgaben bei der alten Stelle, die Verknuepfung aber zeigt auf
   * dieselbe Zeile — die Bemerkung darf nur an die Stelle der Zeile
   * (Regel 8, `bemerkungFuerStelle`).
   */
  departmentKey: string;
  /**
   * Bemerkung zur Position mit ihrer Beschriftung nach Herkunft (Regel 8);
   * `null` ohne Text oder nach dem Leeren (E-A22). Bei einer Auswahl steht
   * dieselbe Bemerkung an jeder Option.
   */
  bemerkung: { text: string; label: string } | null;
}

/**
 * Bemerkung, Beschriftung und Option zu Checklisten-Aufgaben, die aus einer
 * Ausstattungszeile stammen (`OnboardingAusstattungAufgabe`). Aufgaben ohne
 * Verknuepfung (Vorlage, Hinweis-Aufgaben) fehlen in der Map. Zwei
 * Abfragen, die zweite nur mit Treffern; ohne IDs keine.
 *
 * Die Bemerkung steht ueber die Verknuepfung, nicht in der Aufgabe: Aendert HR
 * sie in der Karte, stimmt die naechste Mail sofort (Regel 8).
 * `ChecklistItem.description` traegt nur den Katalog-Hinweis fuer die Stelle.
 * Wer sie einer STELLE zeigt (Link-Seite, Mail), nimmt `bemerkungFuerStelle`
 * — die Map selbst kennt die Stelle der Aufgabe nicht.
 */
export async function ausstattungZuAufgabenLaden(
  db: Db,
  checklistItemIds: ReadonlyArray<string>,
): Promise<Map<string, AusstattungZuAufgabe>> {
  const ergebnis = new Map<string, AusstattungZuAufgabe>();
  const ids = [...new Set(checklistItemIds)];
  if (ids.length === 0) return ergebnis;
  const verknuepfungen = await db.onboardingAusstattungAufgabe.findMany({
    where: { checklistItemId: { in: ids } },
    select: { checklistItemId: true, ausstattungId: true, option: true },
  });
  if (verknuepfungen.length === 0) return ergebnis;
  const zeilen = await db.onboardingAusstattung.findMany({
    where: { id: { in: [...new Set(verknuepfungen.map((v) => v.ausstattungId))] } },
    select: { id: true, departmentKey: true, bemerkung: true, bemerkungQuelle: true, quelle: true, inhaltGeleertAm: true },
  });
  const zeileZu = new Map(zeilen.map((z) => [z.id, z]));
  for (const v of verknuepfungen) {
    const z = zeileZu.get(v.ausstattungId);
    const text = z && z.inhaltGeleertAm == null ? (z.bemerkung ?? "").trim() : "";
    ergebnis.set(v.checklistItemId, {
      ausstattungId: v.ausstattungId,
      option: v.option,
      departmentKey: z?.departmentKey ?? "",
      bemerkung: z && text ? { text, label: bemerkungLabel(z.bemerkungQuelle ?? z.quelle) } : null,
    });
  }
  return ergebnis;
}

/**
 * Die Bemerkung einer Aufgabe fuer GENAU diese Stelle (Regel 8: Bemerkung nur
 * an der eigenen Aufgabe, nur fuer die Stelle) — `null`, wenn die Zeile
 * inzwischen einer anderen Stelle gehoert. Nach einem Stellenwechsel bleiben
 * die entfallenen Aufgaben (abgewaehlte Optionen) bei der alten Stelle; ohne
 * diesen Vergleich saehe sie auf ihrer Link-Seite jede spaetere Bemerkung der
 * Zeile, die nur noch der neuen Stelle gilt (Freitext, auch Gesundheitsangaben).
 */
export function bemerkungFuerStelle(
  zuordnung: AusstattungZuAufgabe | undefined,
  departmentKey: string | null | undefined,
): AusstattungZuAufgabe["bemerkung"] {
  if (!zuordnung || !departmentKey || zuordnung.departmentKey !== departmentKey) return null;
  return zuordnung.bemerkung;
}

/**
 * Angaben und Hinweis JE STELLE (Regel 7, `angabenFuer`) — fuer die
 * Zuweisungsmail und die Link-Seite. Gelesen werden nur Zeilen der Art
 * ANGABE und die Hinweise des Vorgangs. Die Map enthaelt jede Stelle, die
 * eine Angabe besitzt, sieht (`sichtbarFuer`) oder einen Hinweis hat; fuer
 * jede andere gilt `KEINE_ANGABEN` (der Aufrufer nimmt `?? KEINE_ANGABEN`).
 */
export async function angabenJeStelleLaden(db: Db, onboardingId: string): Promise<Map<string, AngabenFuerStelle>> {
  const [zeilen, hinweise] = await Promise.all([
    db.onboardingAusstattung.findMany({
      where: { onboardingId, art: "ANGABE" },
      select: {
        departmentKey: true,
        art: true,
        angabeSchluessel: true,
        bezeichnung: true,
        angabe: true,
        sichtbarFuer: true,
        reihenfolge: true,
        gestrichenAm: true,
        inhaltGeleertAm: true,
      },
    }),
    db.onboardingStellenHinweis.findMany({
      where: { onboardingId },
      select: { departmentKey: true, text: true, inhaltGeleertAm: true },
    }),
  ]);
  const stellen = new Set<string>([
    ...zeilen.flatMap((z) => [z.departmentKey, ...z.sichtbarFuer]),
    ...hinweise.map((h) => h.departmentKey),
  ]);
  return new Map([...stellen].map((key) => [key, angabenFuer(key, zeilen, hinweise)]));
}

// =============================================
// Nachtrag (S17): offene Aenderungsliste je Stelle
// =============================================

/** Die noch nicht gesendete Aenderungsliste EINER Stelle. */
export interface OffeneAenderungen {
  /**
   * IDs ALLER gelesenen Eintraege — auch solcher, die sich in der
   * Zusammenfassung aufheben (NEU+ENTFAELLT). Bei SENT einer Zuweisungsmail
   * werden genau diese als gesendet markiert (F7); spaeter geschriebene
   * bleiben offen.
   */
  ids: string[];
  /** Zusammengefasst (`nachtragListe`) — das, was die Mail nennt. */
  liste: NachtragListe;
}

/**
 * Die offenen (nicht gesendeten) Eintraege der Aenderungsliste eines Vorgangs,
 * je Stelle zusammengefasst (Regel 10). Eine Abfrage, sortiert nach
 * `erfasstAm`. Stellen ohne offenen Eintrag fehlen in der Map.
 */
export async function offeneAenderungenLaden(db: Db, onboardingId: string): Promise<Map<string, OffeneAenderungen>> {
  const eintraege = await db.onboardingAusstattungAenderung.findMany({
    where: { onboardingId, gesendetAm: null },
    select: { id: true, departmentKey: true, art: true, titel: true, erfasstAm: true },
    orderBy: { erfasstAm: "asc" },
  });
  const jeStelle = new Map<string, typeof eintraege>();
  for (const e of eintraege) {
    const liste = jeStelle.get(e.departmentKey) ?? [];
    liste.push(e);
    jeStelle.set(e.departmentKey, liste);
  }
  return new Map(
    [...jeStelle].map(([key, liste]) => [key, { ids: liste.map((e) => e.id), liste: nachtragListe(liste) }]),
  );
}
