/**
 * CREDO HR-Portal — Fristen-System BEM (E6)
 *
 * Berechnet/aktualisiert die relevanten Fristen eines BEM-Falls und bewertet
 * ihre Dringlichkeit (Severity). Wird bei Fall-Aenderungen (Anlage, Status,
 * Einladung, Einwilligung) und taeglich im Cron /api/cron/bem-fristen genutzt.
 *
 * Hinweis Datenschutz: Fristen enthalten KEINE Gesundheitsdaten — nur generische
 * Bezeichnungen (z.B. "Erstgespraech terminieren") + Stichtage.
 */

import { prisma } from "@/lib/db";
import type { BemFristTyp, BemFristSeverity } from "@prisma/client";

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

// =============================================
// Severity
// =============================================
/** OVERDUE <0 Tage · URGENT 0–7 · WARNING 8–14 · INFO >14 */
export function berechneSeverity(
  faelligAm: Date,
  heute: Date = new Date(),
): BemFristSeverity {
  const tage = Math.floor(
    (faelligAm.getTime() - heute.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (tage < 0) return "OVERDUE";
  if (tage <= 7) return "URGENT";
  if (tage <= 14) return "WARNING";
  return "INFO";
}

export function verbleibendeTage(faelligAm: Date, heute: Date = new Date()): number {
  return Math.floor(
    (faelligAm.getTime() - heute.getTime()) / (1000 * 60 * 60 * 24),
  );
}

// =============================================
// Frist-Templates
// =============================================
interface FristTemplate {
  typ: BemFristTyp;
  bezeichnung: string;
  beschreibung?: string;
  faelligAm: Date;
}

export interface BemFristSnapshot {
  status: string;
  createdAt: Date;
  anlassFehlzeitenAb: Date | null;
  einladungAm: Date | null;
  datenschutzAm: Date | null;
  erstgespraechAm: Date | null;
  aufbewahrungBis: Date | null;
  gespraeche: { naechsterTermin: Date | null }[];
  massnahmen: { status: string; evaluationAm: Date | null }[];
}

/** Reine Berechnung der relevanten Fristen aus dem Fall-Zustand (testbar). */
export function berechneBemFristTemplates(fall: BemFristSnapshot): FristTemplate[] {
  const t: FristTemplate[] = [];
  const base = fall.anlassFehlzeitenAb ?? fall.createdAt;

  if (fall.status === "ANGELEGT") {
    t.push({
      typ: "EINLADUNG",
      bezeichnung: "BEM-Einladung versenden",
      beschreibung:
        "Die/der Beschaeftigte sollte zeitnah zum BEM eingeladen werden.",
      faelligAm: addDays(base, 14),
    });
  }

  if (fall.status === "EINLADUNG_VERSENDET" && fall.einladungAm) {
    t.push({
      typ: "EINWILLIGUNG",
      bezeichnung: "Einwilligung steht aus",
      beschreibung:
        "Auf die Rueckmeldung warten; ggf. erinnern oder erneut einladen.",
      faelligAm: addDays(fall.einladungAm, 21),
    });
  }

  if (fall.status === "EINWILLIGUNG_ERTEILT" && fall.datenschutzAm) {
    t.push({
      typ: "ERSTGESPRAECH",
      bezeichnung: "Erstgespraech terminieren",
      beschreibung: "Nach erteilter Einwilligung das Erstgespraech vereinbaren.",
      faelligAm: addDays(fall.datenschutzAm, 21),
    });
  }

  // Folgetermin aus dem spaetesten geplanten naechsten Termin der Gespraeche.
  const naechsteTermine = fall.gespraeche
    .map((g) => g.naechsterTermin)
    .filter((d): d is Date => !!d)
    .sort((a, b) => b.getTime() - a.getTime());
  if (
    naechsteTermine[0] &&
    (fall.status === "ERSTGESPRAECH" || fall.status === "MASSNAHMEN_LAUFEN")
  ) {
    t.push({
      typ: "FOLGEGESPRAECH",
      bezeichnung: "Folgetermin wahrnehmen",
      faelligAm: naechsteTermine[0],
    });
  }

  // Frueheste offene Massnahmen-Evaluation.
  const evals = fall.massnahmen
    .filter((m) => (m.status === "OFFEN" || m.status === "LAEUFT") && m.evaluationAm)
    .map((m) => m.evaluationAm as Date)
    .sort((a, b) => a.getTime() - b.getTime());
  if (evals[0] && fall.status === "MASSNAHMEN_LAUFEN") {
    t.push({
      typ: "EVALUATION",
      bezeichnung: "Massnahmen evaluieren",
      beschreibung: "Wirksamkeit der vereinbarten Massnahmen pruefen.",
      faelligAm: evals[0],
    });
  }

  if (fall.aufbewahrungBis && fall.status !== "GELOESCHT") {
    t.push({
      typ: "AUFBEWAHRUNGSENDE",
      bezeichnung: "Aufbewahrungsfrist endet — Loeschung steht an",
      beschreibung:
        "Mit Ablauf der Aufbewahrungsfrist werden die Akteninhalte automatisch geloescht.",
      faelligAm: fall.aufbewahrungBis,
    });
  }

  return t;
}

// =============================================
// Synchronisation
// =============================================
/**
 * Gleicht die BemFrist-Tabelle eines Falls mit den berechneten Templates ab:
 * neue anlegen, geaenderte aktualisieren, nicht mehr anwendbare als erledigt
 * markieren (Audit-Trail bleibt — keine harte Loeschung). Wirft nicht.
 */
export async function syncBemFristen(bemFallId: string): Promise<void> {
  try {
    const fall = await prisma.bemFall.findUnique({
      where: { id: bemFallId },
      select: {
        status: true,
        createdAt: true,
        anlassFehlzeitenAb: true,
        einladungAm: true,
        datenschutzAm: true,
        erstgespraechAm: true,
        aufbewahrungBis: true,
        gespraeche: { select: { naechsterTermin: true } },
        massnahmen: { select: { status: true, evaluationAm: true } },
      },
    });
    if (!fall) return;

    const templates = berechneBemFristTemplates(fall as BemFristSnapshot);
    const existing = await prisma.bemFrist.findMany({ where: { bemFallId } });
    const byTyp = new Map<BemFristTyp, (typeof existing)[number]>();
    for (const f of existing) if (!byTyp.has(f.typ)) byTyp.set(f.typ, f);

    for (const tpl of templates) {
      const vorhanden = byTyp.get(tpl.typ);
      if (!vorhanden) {
        await prisma.bemFrist.create({
          data: {
            bemFallId,
            typ: tpl.typ,
            bezeichnung: tpl.bezeichnung,
            beschreibung: tpl.beschreibung ?? null,
            faelligAm: tpl.faelligAm,
          },
        });
      } else if (
        vorhanden.faelligAm.getTime() !== tpl.faelligAm.getTime() ||
        vorhanden.bezeichnung !== tpl.bezeichnung ||
        vorhanden.erledigtAm !== null
      ) {
        // Aktualisieren + ggf. reaktivieren (Stichtag/Status kann sich aendern).
        // Bei Reaktivierung (war erledigt) die Eskalations-Historie zuruecksetzen,
        // damit die Erinnerung fuer die wieder offene Frist erneut greifen kann.
        const reaktiviert = vorhanden.erledigtAm !== null;
        await prisma.bemFrist.update({
          where: { id: vorhanden.id },
          data: {
            bezeichnung: tpl.bezeichnung,
            beschreibung: tpl.beschreibung ?? null,
            faelligAm: tpl.faelligAm,
            erledigtAm: null,
            erledigtVon: null,
            ...(reaktiviert ? { letzteSeverity: null, letzteWarnungAm: null } : {}),
          },
        });
      }
      byTyp.delete(tpl.typ);
    }

    // Nicht mehr anwendbare offene Fristen automatisch als erledigt markieren.
    const heute = new Date();
    for (const rest of byTyp.values()) {
      if (!rest.erledigtAm) {
        await prisma.bemFrist.update({
          where: { id: rest.id },
          data: { erledigtAm: heute, erledigtVon: "System (nicht mehr anwendbar)" },
        });
      }
    }
  } catch (err) {
    console.error(
      `[bem-fristen] sync fehlgeschlagen fuer ${bemFallId}:`,
      err instanceof Error ? err.message : err,
    );
  }
}
