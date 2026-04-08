/**
 * CREDO HR-Portal — Helper-Funktionen Mutterschutz & Elternzeit
 *
 * Datums-Berechnungen, displayId-Generierung, Feriensperrfrist-Check.
 * Phase 1 MVP — Fristen-Tracking + Cron in Phase 2.
 */

import { prisma } from "@/lib/db";
import type {
  Personalgruppe,
  Geschlecht,
  KVTyp,
  ElternzeitAbschnitt,
  SchulferienNRW,
  FerienTyp,
} from "@prisma/client";

// =============================================
// Datums-Mathematik (date-fns waere overkill — wir nutzen native Date)
// =============================================

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function subDays(date: Date, days: number): Date {
  return addDays(date, -days);
}

export function addWeeks(date: Date, weeks: number): Date {
  return addDays(date, weeks * 7);
}

export function subWeeks(date: Date, weeks: number): Date {
  return addDays(date, -weeks * 7);
}

/**
 * Mutterschutz-Beginn = voraussichtlicher Geburtstermin minus 6 Wochen (42 Tage).
 * § 3 Abs. 1 MuSchG
 */
export function berechneMutterschutzBeginn(voraussGeburt: Date): Date {
  return subDays(voraussGeburt, 42);
}

/**
 * Mutterschutz-Ende = tatsaechliche Geburt + 8 Wochen (56 Tage)
 * bzw. 12 Wochen (84 Tage) bei Fruehgeburt oder Mehrlingen.
 * § 3 Abs. 2 MuSchG
 */
export function berechneMutterschutzEnde(
  tatsGeburt: Date,
  fruehgeburt: boolean,
  mehrlinge: boolean,
): Date {
  const tage = fruehgeburt || mehrlinge ? 84 : 56;
  return addDays(tatsGeburt, tage);
}

// =============================================
// displayId-Generierung
// =============================================

/**
 * Generiert eine eindeutige displayId fuer einen Mutterschutz- oder
 * Elternzeit-Vorgang im Format `{prefix}-{year}-{shortName}-{nr3}`.
 *
 * Beispiel: "MU-2026-GYM-001", "EZ-2026-GYM-001"
 *
 * Nutzt Retry-Logik (3 Versuche) bei Race-Conditions.
 */
export async function generateMutterschutzDisplayId(
  organizationId: string,
  shortName: string,
): Promise<{ displayId: string; sequentialNumber: number }> {
  const currentYear = new Date().getFullYear();
  const yearStart = new Date(currentYear, 0, 1);
  const yearEnd = new Date(currentYear + 1, 0, 1);

  let displayId = "";
  let sequentialNumber = 0;

  for (let attempt = 0; attempt < 3; attempt++) {
    const countThisYear = await prisma.mutterschutzProzess.count({
      where: {
        organizationId,
        createdAt: { gte: yearStart, lt: yearEnd },
      },
    });
    sequentialNumber = countThisYear + 1 + attempt;
    displayId = `MU-${currentYear}-${shortName}-${sequentialNumber
      .toString()
      .padStart(3, "0")}`;
    const exists = await prisma.mutterschutzProzess.findUnique({
      where: { displayId },
      select: { id: true },
    });
    if (!exists) break;
  }

  return { displayId, sequentialNumber };
}

export async function generateElternzeitDisplayId(
  organizationId: string,
  shortName: string,
): Promise<{ displayId: string; sequentialNumber: number }> {
  const currentYear = new Date().getFullYear();
  const yearStart = new Date(currentYear, 0, 1);
  const yearEnd = new Date(currentYear + 1, 0, 1);

  let displayId = "";
  let sequentialNumber = 0;

  for (let attempt = 0; attempt < 3; attempt++) {
    const countThisYear = await prisma.elternzeitProzess.count({
      where: {
        organizationId,
        createdAt: { gte: yearStart, lt: yearEnd },
      },
    });
    sequentialNumber = countThisYear + 1 + attempt;
    displayId = `EZ-${currentYear}-${shortName}-${sequentialNumber
      .toString()
      .padStart(3, "0")}`;
    const exists = await prisma.elternzeitProzess.findUnique({
      where: { displayId },
      select: { id: true },
    });
    if (!exists) break;
  }

  return { displayId, sequentialNumber };
}

// =============================================
// Feriensperrfrist-Check (§ 11 FrUrlV NRW)
// =============================================

export interface FerienWarnung {
  abschnittNr: number;
  ferienBezeichnung: string;
  typ:
    | "BEGINN_IN_FERIEN"
    | "ENDE_IN_FERIEN"
    | "BEGINN_IN_SPERRZONE"
    | "ENDE_IN_SPERRZONE";
  hinweis: string;
}

/**
 * Berechnet die Sperrzone fuer einen Ferientermin.
 *
 * Sommerferien: 6 Wochen vor und nach den Ferien.
 * Sonstige Ferien: 2 Wochen vor und nach den Ferien.
 */
function getSperrzone(ferien: SchulferienNRW): { von: Date; bis: Date } {
  const wochen = ferien.ferienTyp === "SOMMER" ? 6 : 2;
  return {
    von: subWeeks(ferien.von, wochen),
    bis: addWeeks(ferien.bis, wochen),
  };
}

function isInRange(date: Date, von: Date, bis: Date): boolean {
  const t = date.getTime();
  return t >= von.getTime() && t <= bis.getTime();
}

/**
 * Prueft alle Elternzeit-Abschnitte gegen die NRW-Schulferien.
 * Empfehlung des Workspace: Hinweis fuer alle, Pflichtbegruendung nur Beamte/PSI.
 *
 * @returns Liste aller Warnungen (leer = keine Konflikte)
 */
export function pruefeFeriensperrfrist(
  abschnitte: { abschnittNr: number; von: Date; bis: Date }[],
  ferien: SchulferienNRW[],
): FerienWarnung[] {
  const warnungen: FerienWarnung[] = [];

  for (const abschnitt of abschnitte) {
    for (const f of ferien) {
      if (!f.aktiv) continue;

      // Direkt in den Ferien
      if (isInRange(abschnitt.von, f.von, f.bis)) {
        warnungen.push({
          abschnittNr: abschnitt.abschnittNr,
          ferienBezeichnung: f.bezeichnung,
          typ: "BEGINN_IN_FERIEN",
          hinweis: `Elternzeit-Abschnitt ${abschnitt.abschnittNr} beginnt in den ${f.bezeichnung}. § 11 FrUrlV NRW: sachgerechte Begruendung erforderlich.`,
        });
      }
      if (isInRange(abschnitt.bis, f.von, f.bis)) {
        warnungen.push({
          abschnittNr: abschnitt.abschnittNr,
          ferienBezeichnung: f.bezeichnung,
          typ: "ENDE_IN_FERIEN",
          hinweis: `Elternzeit-Abschnitt ${abschnitt.abschnittNr} endet in den ${f.bezeichnung}. § 11 FrUrlV NRW: sachgerechte Begruendung erforderlich.`,
        });
      }

      // In der Sperrzone (aber nicht direkt in Ferien)
      const sperr = getSperrzone(f);
      if (
        isInRange(abschnitt.von, sperr.von, sperr.bis) &&
        !isInRange(abschnitt.von, f.von, f.bis)
      ) {
        warnungen.push({
          abschnittNr: abschnitt.abschnittNr,
          ferienBezeichnung: f.bezeichnung,
          typ: "BEGINN_IN_SPERRZONE",
          hinweis: `Elternzeit-Abschnitt ${abschnitt.abschnittNr} beginnt in der Sperrzone der ${f.bezeichnung} (${f.ferienTyp === "SOMMER" ? "6" : "2"} Wochen vor/nach).`,
        });
      }
      if (
        isInRange(abschnitt.bis, sperr.von, sperr.bis) &&
        !isInRange(abschnitt.bis, f.von, f.bis)
      ) {
        warnungen.push({
          abschnittNr: abschnitt.abschnittNr,
          ferienBezeichnung: f.bezeichnung,
          typ: "ENDE_IN_SPERRZONE",
          hinweis: `Elternzeit-Abschnitt ${abschnitt.abschnittNr} endet in der Sperrzone der ${f.bezeichnung}.`,
        });
      }
    }
  }

  return warnungen;
}

/**
 * Pflicht-Begruendung nur fuer Beamte/PSI (§ 11 FrUrlV NRW).
 * Fuer TV-L = nur Hinweis, keine Pflicht.
 */
export function ferienBegruendungPflicht(personalgruppe: Personalgruppe): boolean {
  return personalgruppe === "BEAMTER" || personalgruppe === "PLANSTELLENINHABER";
}

// =============================================
// Antragsfrist-Check (§ 16 BEEG)
// =============================================

/**
 * Antragsfrist:
 *  - 7 Wochen vor EZ-Beginn (bis 3. Lebensjahr)
 *  - 13 Wochen vor EZ-Beginn (3. bis 8. Lebensjahr — Uebertragung)
 */
export function pruefeAntragsfrist(
  ezBeginn: Date,
  uebertragung3bis8: boolean,
  heute: Date = new Date(),
): { eingehalten: boolean; verbleibendeTage: number; benoetigteTage: number } {
  const wochen = uebertragung3bis8 ? 13 : 7;
  const benoetigteTage = wochen * 7;
  const verbleibendeTage = Math.floor(
    (ezBeginn.getTime() - heute.getTime()) / (1000 * 60 * 60 * 24),
  );
  return {
    eingehalten: verbleibendeTage >= benoetigteTage,
    verbleibendeTage,
    benoetigteTage,
  };
}

// =============================================
// Geltungs-Helper (Personalgruppen → Workflow-Spezifika)
// =============================================

/**
 * Vater haben keinen Mutterschutz (§ 3 MuSchG gilt nur fuer schwangere/stillende Frauen).
 */
export function hatMutterschutz(geschlecht: Geschlecht): boolean {
  return geschlecht === "MUTTER";
}

/**
 * DEUEV-Meldung Pflicht nur bei TV-L + GKV-Pflicht.
 */
export function deuevPflicht(personalgruppe: Personalgruppe, kvTyp: KVTyp): boolean {
  return personalgruppe === "TARIF_TV_L" && kvTyp === "GKV_PFLICHT";
}

/**
 * KV-Zuschuss (31 EUR/Monat) nur fuer Beamte/PSI (§ 13 FrUrlV NRW).
 */
export function hatKvZuschussAnspruch(personalgruppe: Personalgruppe): boolean {
  return personalgruppe === "BEAMTER" || personalgruppe === "PLANSTELLENINHABER";
}
