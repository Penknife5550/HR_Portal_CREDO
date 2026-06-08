/**
 * API: POST /api/cron/bem-aufbewahrung
 *
 * Taeglicher Loesch-Lauf der BEM-Aufbewahrung (§ 167 SGB IX / DSGVO Art. 17).
 * Faelle, deren Aufbewahrungsfrist abgelaufen ist (aufbewahrungBis <= heute),
 * werden bereinigt ("Crypto-Shredding"):
 *  - alle inhaltstragenden Kind-Datensaetze (Gespraeche, Massnahmen,
 *    Einwilligungen) + Dokumente werden geloescht (inkl. Dateien auf Disk),
 *  - der Fall wird auf GELOESCHT gesetzt (Huelle bleibt fuer den Nachweis),
 *  - AuditLog + Versandprotokoll (BemKommunikation) bleiben erhalten.
 *
 * Aufruf extern via n8n + Bearer-CRON_SECRET (wie die uebrigen Crons).
 */

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/db";
import { deleteUploadedFile } from "@/lib/file-upload";
import { logBemAudit, BEM_AUDIT_ACTIONS } from "@/lib/bem-audit";

function timingSafeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export async function POST(request: NextRequest) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret || cronSecret.length < 24) {
      console.error("[cron/bem-aufbewahrung] CRON_SECRET fehlt oder zu kurz");
      return NextResponse.json({ error: "Konfigurationsfehler" }, { status: 500 });
    }
    const authHeader = request.headers.get("authorization") || "";
    if (!timingSafeCompare(authHeader, `Bearer ${cronSecret}`)) {
      return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
    }

    const now = new Date();
    const faellig = await prisma.bemFall.findMany({
      // not:null explizit — nur Faelle mit GESETZTER, abgelaufener Frist loeschen.
      where: { status: { not: "GELOESCHT" }, aufbewahrungBis: { not: null, lte: now } },
      select: {
        id: true,
        displayId: true,
        dokumente: { select: { dateipfad: true } },
      },
    });

    let geloescht = 0;
    let fehler = 0;
    let dateienGeloescht = 0;

    for (const fall of faellig) {
      const pfade = fall.dokumente.map((d) => d.dateipfad);
      try {
        // 1. DB-Inhalte atomar entfernen, Fall-Huelle auf GELOESCHT setzen.
        await prisma.$transaction([
          prisma.bemGespraech.deleteMany({ where: { bemFallId: fall.id } }),
          prisma.bemMassnahme.deleteMany({ where: { bemFallId: fall.id } }),
          prisma.bemEinwilligung.deleteMany({ where: { bemFallId: fall.id } }),
          prisma.bemDokument.deleteMany({ where: { bemFallId: fall.id } }),
          prisma.bemFall.update({
            where: { id: fall.id },
            data: { status: "GELOESCHT", geloeschtAm: now },
          }),
        ]);

        // 2. Dateien auf der Disk loeschen (best-effort, nach erfolgreichem Commit).
        for (const p of pfade) {
          if (await deleteUploadedFile(p)) dateienGeloescht++;
        }

        // 3. Loeschung auditieren (Nachweis bleibt — ohne Inhalte).
        await logBemAudit({
          bemFallId: fall.id,
          userId: null,
          action: BEM_AUDIT_ACTIONS.GELOESCHT,
          details: {
            displayId: fall.displayId,
            dokumente: pfade.length,
            grund: "Aufbewahrungsfrist abgelaufen",
          },
        });
        geloescht++;
      } catch (err) {
        console.error(
          `[cron/bem-aufbewahrung] Loeschung fehlgeschlagen fuer ${fall.displayId}:`,
          err instanceof Error ? err.message : err,
        );
        fehler++;
      }
    }

    return NextResponse.json({
      data: { faelligGeprueft: faellig.length, geloescht, fehler, dateienGeloescht },
    });
  } catch (error) {
    console.error(
      "[cron/bem-aufbewahrung] POST fehlgeschlagen:",
      error instanceof Error ? error.message : error,
    );
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
