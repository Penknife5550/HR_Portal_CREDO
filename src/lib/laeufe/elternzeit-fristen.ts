/**
 * Lauf „Elternzeit-Fristen“ (vorher Inhalt der Route /api/cron/elternzeit-fristen).
 *
 * Taegliche Fristenpruefung für Elternzeit-Vorgaenge.
 *
 * Gestartet vom Zeitplaner des Portals (src/lib/zeitplaner/, Einstellungen →
 * Automatische Läufe); Handaufruf ueber die duenne Route POST /api/cron/elternzeit-fristen
 * (Bearer CRON_SECRET).
 *
 * Logik:
 * 1. Fristen aller offenen Vorgaenge per syncElternzeitFristen() aktualisieren
 * 2. Fuer alle nicht erledigten Fristen Severity berechnen
 * 3. Wenn die Severity zur vorherigen Stufe eskaliert ist (z.B. INFO → WARNING),
 *    Webhook triggern und letzteSeverity / letzteWarnungAm setzen.
 *    Verhindert Mehrfach-Notifications pro Stufe.
 */

import { prisma } from "@/lib/db";
import { triggerWebhooks } from "@/lib/webhooks";
import {
  syncElternzeitFristen,
  berechneSeverity,
  verbleibendeTage,
} from "@/lib/elternzeit-fristen";
import type { ElternzeitFristSeverity } from "@prisma/client";
import { laufAntwort, type LaufErgebnis, type LaufOptionen } from "@/lib/laeufe/lauf-ergebnis";

const SEVERITY_RANK: Record<ElternzeitFristSeverity, number> = {
  INFO: 0,
  WARNING: 1,
  URGENT: 2,
  OVERDUE: 3,
};

const ACTIVE_STATUSES = [
  "ANGELEGT",
  "ANTRAG_VORL_VERSANDT",
  "ANTRAG_VORL_EINGEREICHT",
  "VORLAEUFIG_GENEHMIGT",
  "ANTRAG_ENDG_VERSANDT",
  "ANTRAG_ENDG_EINGEREICHT",
  "GENEHMIGT",
  "AKTIV",
  "RUECKKEHR_GEPLANT",
] as const;

export async function elternzeitFristenLauf(opts: LaufOptionen = {}): Promise<LaufErgebnis> {
  const now = opts.jetzt ?? new Date();
  try {
    // 1. Alle offenen Vorgaenge ermitteln
    const vorgaenge = await prisma.elternzeitProzess.findMany({
      where: { status: { in: [...ACTIVE_STATUSES] } },
      select: { id: true, displayId: true, employeeFirstName: true, employeeLastName: true },
    });

    let syncFehler = 0;
    let eskalationen = 0;
    let mailsFehler = 0;
    let mailsUebersprungen = 0;
    let eskalationsFehler = 0;

    // 2. Fristen aktualisieren (pro Vorgang isoliert)
    for (const v of vorgaenge) {
      try {
        await syncElternzeitFristen(v.id);
      } catch (error) {
        console.error(
          `[cron] syncElternzeitFristen fehlgeschlagen für ${v.displayId}:`,
          error instanceof Error ? error.message : error,
        );
        syncFehler++;
      }
    }

    // 3. Eskalationen pruefen
    const offeneFristen = await prisma.elternzeitFrist.findMany({
      where: { erledigtAm: null },
      include: {
        elternzeit: {
          select: {
            id: true,
            displayId: true,
            employeeFirstName: true,
            employeeLastName: true,
            employeeEmail: true,
            status: true,
          },
        },
      },
    });

    for (const frist of offeneFristen) {
      try {
        const severity = berechneSeverity(frist.faelligAm);
        const previousRank = frist.letzteSeverity
          ? SEVERITY_RANK[frist.letzteSeverity]
          : -1;
        const currentRank = SEVERITY_RANK[severity];

        // Eskalation nur wenn Severity gestiegen ist
        if (currentRank > previousRank) {
          await prisma.elternzeitFrist.update({
            where: { id: frist.id },
            data: {
              letzteSeverity: severity,
              letzteWarnungAm: now,
            },
          });

          // Abgewartet (frueher fire-and-forget): Das Mailergebnis zaehlt fuer
          // den Bericht des Zeitplaners. triggerWebhooks wirft nie.
          const mail = await triggerWebhooks("elternzeit-frist-eskaliert", {
            elternzeitId: frist.elternzeit.id,
            displayId: frist.elternzeit.displayId,
            employeeName: `${frist.elternzeit.employeeFirstName} ${frist.elternzeit.employeeLastName}`,
            employeeEmail: frist.elternzeit.employeeEmail,
            fristTyp: frist.fristTyp,
            bezeichnung: frist.bezeichnung,
            beschreibung: frist.beschreibung,
            faelligAm: frist.faelligAm.toISOString(),
            verbleibendeTage: verbleibendeTage(frist.faelligAm),
            severity,
          });
          if (mail?.status === "SKIPPED") mailsUebersprungen++;
          else if (mail?.status !== "SENT") mailsFehler++;

          eskalationen++;
        }
      } catch (err) {
        console.error(
          `[cron] Eskalation für Frist ${frist.id} fehlgeschlagen:`,
          err instanceof Error ? err.message : err,
        );
        eskalationsFehler++;
      }
    }

    return laufAntwort({
      data: {
        vorgaengeGeprueft: vorgaenge.length,
        offeneFristen: offeneFristen.length,
        eskalationen,
        mailsFehler,
        mailsUebersprungen,
        syncFehler,
        eskalationsFehler,
      },
    });
  } catch (error) {
    console.error(
      "[cron/elternzeit-fristen] POST fehlgeschlagen:",
      error instanceof Error ? error.message : error,
    );
    return laufAntwort(
      { error: "Interner Serverfehler" },
      { status: 500 },
    );
  }
}
