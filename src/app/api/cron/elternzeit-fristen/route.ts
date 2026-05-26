/**
 * API: /api/cron/elternzeit-fristen
 *
 * POST – Taegliche Fristenpruefung für Elternzeit-Vorgaenge.
 *
 * Wird taeglich (z.B. von n8n) per Cron-Workflow aufgerufen.
 * Sicherheit: Authentifizierung über CRON_SECRET Bearer-Token.
 *
 * Logik:
 * 1. Fristen aller offenen Vorgaenge per syncElternzeitFristen() aktualisieren
 * 2. Fuer alle nicht erledigten Fristen Severity berechnen
 * 3. Wenn die Severity zur vorherigen Stufe eskaliert ist (z.B. INFO → WARNING),
 *    Webhook triggern und letzteSeverity / letzteWarnungAm setzen.
 *    Verhindert Mehrfach-Notifications pro Stufe.
 */

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/db";
import { triggerWebhooks } from "@/lib/webhooks";
import {
  syncElternzeitFristen,
  berechneSeverity,
  verbleibendeTage,
} from "@/lib/elternzeit-fristen";
import type { ElternzeitFristSeverity } from "@prisma/client";

function timingSafeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

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

export async function POST(request: NextRequest) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret || cronSecret.length < 24) {
      console.error(
        "[cron/elternzeit-fristen] CRON_SECRET fehlt oder zu kurz (min 24 Zeichen)",
      );
      return NextResponse.json(
        { error: "Konfigurationsfehler" },
        { status: 500 },
      );
    }

    const authHeader = request.headers.get("authorization") || "";
    const expected = `Bearer ${cronSecret}`;
    if (!timingSafeCompare(authHeader, expected)) {
      return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
    }

    // 1. Alle offenen Vorgaenge ermitteln
    const vorgaenge = await prisma.elternzeitProzess.findMany({
      where: { status: { in: [...ACTIVE_STATUSES] } },
      select: { id: true, displayId: true, employeeFirstName: true, employeeLastName: true },
    });

    let syncFehler = 0;
    let eskalationen = 0;
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
              letzteWarnungAm: new Date(),
            },
          });

          triggerWebhooks("elternzeit-frist-eskaliert", {
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
          }).catch((err) =>
            console.error(
              "[cron] Webhook-Fehler elternzeit-frist-eskaliert:",
              err instanceof Error ? err.message : err,
            ),
          );

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

    return NextResponse.json({
      data: {
        vorgaengeGeprueft: vorgaenge.length,
        offeneFristen: offeneFristen.length,
        eskalationen,
        syncFehler,
        eskalationsFehler,
      },
    });
  } catch (error) {
    console.error(
      "[cron/elternzeit-fristen] POST fehlgeschlagen:",
      error instanceof Error ? error.message : error,
    );
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 },
    );
  }
}
