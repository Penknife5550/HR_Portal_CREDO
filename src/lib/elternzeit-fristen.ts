/**
 * CREDO HR-Portal — Fristen-System Elternzeit (Phase 2)
 *
 * Berechnung, Anlage und Severity-Bewertung aller relevanten
 * Fristen rund um einen Elternzeit-Vorgang. Wird sowohl bei der
 * Vorgangs-Anlage / -Aktualisierung als auch im taeglichen
 * Cron-Job /api/cron/elternzeit-fristen genutzt.
 *
 * Rechtsgrundlagen:
 *  - § 16 Abs. 1 BEEG  — Antragsfrist 7 Wochen vor Beginn
 *  - § 1 Abs. 7 BEEG   — Geburtsurkunde nachreichen
 *  - § 17 BEEG         — Teilzeit-Antwortfrist 4 Wochen
 *  - LBV / FrUrlV NRW  — Beihilfe-Aenderung, BR-Genehmigung 8 Wochen
 */

import { prisma } from "@/lib/db";
import type {
  ElternzeitFrist,
  ElternzeitFristTyp,
  ElternzeitFristSeverity,
  ElternzeitProzess,
  ElternzeitAbschnitt,
  Personalgruppe,
} from "@prisma/client";
import { addDays, addWeeks, subDays } from "@/lib/elternzeit-helpers";

// =============================================
// Severity-Berechnung
// =============================================

/**
 * Bewertet eine Frist anhand der verbleibenden Tage:
 *  - INFO    : > 14 Tage Puffer
 *  - WARNING : 8-14 Tage
 *  - URGENT  : 0-7 Tage
 *  - OVERDUE : ueberfaellig
 */
export function berechneSeverity(
  faelligAm: Date,
  heute: Date = new Date(),
): ElternzeitFristSeverity {
  const tage = Math.floor(
    (faelligAm.getTime() - heute.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (tage < 0) return "OVERDUE";
  if (tage <= 7) return "URGENT";
  if (tage <= 14) return "WARNING";
  return "INFO";
}

/**
 * Verbleibende Tage bis zum Stichtag (negativ = ueberfaellig).
 */
export function verbleibendeTage(faelligAm: Date, heute: Date = new Date()): number {
  return Math.floor(
    (faelligAm.getTime() - heute.getTime()) / (1000 * 60 * 60 * 24),
  );
}

// =============================================
// Frist-Templates: Was wird automatisch berechnet?
// =============================================

interface FristTemplate {
  fristTyp: ElternzeitFristTyp;
  bezeichnung: string;
  beschreibung?: string;
  faelligAm: Date;
}

/**
 * Bestimmt alle relevanten Fristen fuer einen Elternzeit-Vorgang
 * anhand seines aktuellen Zustands. Wird sowohl beim Anlegen
 * als auch beim Aktualisieren aufgerufen.
 *
 * Liefert nur Fristen, die fuer den jeweiligen Vorgang sinnvoll sind
 * (z.B. BR-Genehmigung nur fuer Beamte/PSI).
 */
export function berechneFristTemplates(
  ez: ElternzeitProzess & { abschnitte: ElternzeitAbschnitt[] },
): FristTemplate[] {
  const templates: FristTemplate[] = [];
  const ersterAbschnitt = [...ez.abschnitte].sort(
    (a, b) => a.von.getTime() - b.von.getTime(),
  )[0];

  // 1. Antragsfrist vorlaeufig (§ 16 Abs. 1 BEEG, 7 Wochen vor Beginn)
  if (ersterAbschnitt && !ez.antragVorlAm) {
    templates.push({
      fristTyp: "ANTRAGSFRIST_VORL",
      bezeichnung: "Antrag vorlaeufig einreichen (§ 16 BEEG)",
      beschreibung:
        "7 Wochen vor Beginn der Elternzeit muss der vorlaeufige Antrag eingereicht sein.",
      faelligAm: subDays(ersterAbschnitt.von, 49),
    });
  }

  // 2. Token Vorl. Expiry
  if (
    ez.antragTokenVorl &&
    ez.antragTokenVorlExpiry &&
    !ez.antragTokenVorlUsedAt
  ) {
    templates.push({
      fristTyp: "TOKEN_VORL_EXPIRY",
      bezeichnung: "Magic Link (vorl. Antrag) laeuft ab",
      beschreibung:
        "Der Mitarbeiter hat den Antrag noch nicht eingereicht — Link erneuern oder erinnern.",
      faelligAm: ez.antragTokenVorlExpiry,
    });
  }

  // 3. Token Endg. Expiry
  if (
    ez.antragTokenEndg &&
    ez.antragTokenEndgExpiry &&
    !ez.antragTokenEndgUsedAt
  ) {
    templates.push({
      fristTyp: "TOKEN_ENDG_EXPIRY",
      bezeichnung: "Magic Link (endg. Antrag) laeuft ab",
      faelligAm: ez.antragTokenEndgExpiry,
    });
  }

  // 4. Geburtsurkunde nachreichen (4 Wochen nach Geburt)
  if (ez.kindGeburtsdatum && !ez.geburtsurkunde) {
    templates.push({
      fristTyp: "GEBURTSURKUNDE_NACHREICHUNG",
      bezeichnung: "Geburtsurkunde nachreichen",
      beschreibung:
        "Die Geburtsurkunde sollte spaetestens 4 Wochen nach Geburt vorliegen.",
      faelligAm: addWeeks(ez.kindGeburtsdatum, 4),
    });
  }

  // 5. BR-Genehmigung Detmold (nur Beamte/PSI, 8 Wochen nach Versand)
  if (
    (ez.personalgruppe === "BEAMTER" || ez.personalgruppe === "PLANSTELLENINHABER") &&
    ez.brSchreibenVersandtAm &&
    !ez.brGenehmigungEingegAm
  ) {
    templates.push({
      fristTyp: "BR_GENEHMIGUNG",
      bezeichnung: "BR Detmold Genehmigung erwarten",
      beschreibung:
        "8 Wochen nach Versand des BR-Schreibens sollte die Genehmigung vorliegen.",
      faelligAm: addWeeks(ez.brSchreibenVersandtAm, 8),
    });
  }

  // 6. Beihilfe-Aenderung (Beamte/PSI, 1 Monat nach EZ-Beginn)
  if (
    (ez.personalgruppe === "BEAMTER" || ez.personalgruppe === "PLANSTELLENINHABER") &&
    ersterAbschnitt
  ) {
    templates.push({
      fristTyp: "BEIHILFE_AENDERUNG",
      bezeichnung: "Beihilfe-Aenderungsformular einreichen",
      beschreibung:
        "Innerhalb 1 Monat nach EZ-Beginn muss das Beihilfe-Aenderungsformular eingereicht werden.",
      faelligAm: addDays(ersterAbschnitt.von, 30),
    });
  }

  // 7. Rueckkehr-Gespraech (6 Wochen vor Ende des letzten Abschnitts)
  if (ez.abschnitte.length > 0) {
    const letzterAbschnitt = [...ez.abschnitte].sort(
      (a, b) => b.bis.getTime() - a.bis.getTime(),
    )[0];
    templates.push({
      fristTyp: "RUECKKEHR_GESPRAECH",
      bezeichnung: "Rueckkehr-Gespraech vorbereiten",
      beschreibung:
        "Spaetestens 6 Wochen vor Ende der Elternzeit ein Rueckkehr-Gespraech vereinbaren.",
      faelligAm: subDays(letzterAbschnitt.bis, 42),
    });
  }

  // 8. Teilzeit-Antrag-Pruefung (§ 17 BEEG, AG-Antwort innerhalb 4 Wochen)
  const offenerTeilzeit = ez.abschnitte.find(
    (a) => a.teilzeit && a.agZustimmung === null,
  );
  if (offenerTeilzeit) {
    templates.push({
      fristTyp: "TEILZEIT_ANTRAG_PRUEFUNG",
      bezeichnung: "Teilzeit-Antrag bearbeiten (§ 17 BEEG)",
      beschreibung:
        "Der Arbeitgeber muss innerhalb 4 Wochen ueber den Teilzeit-Antrag entscheiden.",
      faelligAm: addWeeks(offenerTeilzeit.createdAt, 4),
    });
  }

  return templates;
}

// =============================================
// Synchronisations-Funktion
// =============================================

/**
 * Synchronisiert die Fristen-Tabelle fuer einen Vorgang:
 * - Neue Fristen anlegen
 * - Existierende mit gleichem Typ aktualisieren (faelligAm kann sich
 *   aendern, z.B. wenn Mitarbeiter Termin verschiebt)
 * - Fristen, die nicht mehr anwendbar sind, NICHT loeschen
 *   (Audit-Trail bleibt erhalten — sie werden nur als erledigt
 *   markiert, falls noch nicht erledigt).
 */
export async function syncElternzeitFristen(elternzeitId: string): Promise<void> {
  const ez = await prisma.elternzeitProzess.findUnique({
    where: { id: elternzeitId },
    include: { abschnitte: true },
  });
  if (!ez) return;

  const templates = berechneFristTemplates(ez);
  const existing = await prisma.elternzeitFrist.findMany({
    where: { elternzeitId },
  });

  // Map: fristTyp → existing Frist
  const byTyp = new Map<ElternzeitFristTyp, ElternzeitFrist>();
  for (const f of existing) byTyp.set(f.fristTyp, f);

  for (const tpl of templates) {
    const vorhanden = byTyp.get(tpl.fristTyp);
    if (!vorhanden) {
      await prisma.elternzeitFrist.create({
        data: {
          elternzeitId,
          fristTyp: tpl.fristTyp,
          bezeichnung: tpl.bezeichnung,
          beschreibung: tpl.beschreibung ?? null,
          faelligAm: tpl.faelligAm,
        },
      });
    } else if (
      vorhanden.faelligAm.getTime() !== tpl.faelligAm.getTime() ||
      vorhanden.bezeichnung !== tpl.bezeichnung
    ) {
      await prisma.elternzeitFrist.update({
        where: { id: vorhanden.id },
        data: {
          bezeichnung: tpl.bezeichnung,
          beschreibung: tpl.beschreibung ?? null,
          faelligAm: tpl.faelligAm,
        },
      });
    }
    byTyp.delete(tpl.fristTyp);
  }

  // Verbleibende existing-Eintraege, die nicht mehr im Template sind:
  // automatisch auf erledigt setzen (z.B. Token wurde benutzt, Antrag gestellt).
  const heute = new Date();
  for (const verbliebene of byTyp.values()) {
    if (!verbliebene.erledigtAm) {
      await prisma.elternzeitFrist.update({
        where: { id: verbliebene.id },
        data: {
          erledigtAm: heute,
          erledigung: "Automatisch — Frist ist nicht mehr anwendbar",
        },
      });
    }
  }
}

// =============================================
// Bequeme Helper fuer Personalgruppen-Workflow
// =============================================

export function gehoertZuBeamtenWorkflow(personalgruppe: Personalgruppe): boolean {
  return personalgruppe === "BEAMTER" || personalgruppe === "PLANSTELLENINHABER";
}
