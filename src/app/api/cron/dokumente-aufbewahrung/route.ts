/**
 * API: POST /api/cron/dokumente-aufbewahrung
 *
 * Entfernt erzeugte Dokumente (GeneratedDocument + Datei), die aelter als die
 * Aufbewahrungsfrist sind. Das Portal ist nur Zwischenlager — die fuehrende
 * Ablage ist das DMS, und die Dokumente sind aus Vorlage plus Vorgangsdaten
 * jederzeit neu erzeugbar.
 *
 * Geloescht wird nach ALTER, nicht nach Vorgangsstatus: Die Frist von zwoelf
 * Monaten deckt den Vorlauf der Vertragsende-Fristenampel (7-12 Monate) ab.
 * Trifft es doch einmal einen laufenden Vorgang, ist die Folge harmlos.
 *
 * Aufruf extern via n8n + Bearer-CRON_SECRET (wie die uebrigen Crons).
 * Mit ?dryRun=1 wird nur gezaehlt, nichts geloescht — fuer den ersten Lauf.
 */

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import path from "path";
import { prisma } from "@/lib/db";
import { deleteUploadedFile, deleteUploadedDirIfEmpty } from "@/lib/file-upload";
import { AUFBEWAHRUNG_MONATE, aufbewahrungsGrenze } from "@/lib/erzeugte-dokumente-vorgang";

function timingSafeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export async function POST(request: NextRequest) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret || cronSecret.length < 24) {
      console.error("[cron/dokumente-aufbewahrung] CRON_SECRET fehlt oder zu kurz");
      return NextResponse.json({ error: "Konfigurationsfehler" }, { status: 500 });
    }
    const authHeader = request.headers.get("authorization") || "";
    if (!timingSafeCompare(authHeader, `Bearer ${cronSecret}`)) {
      return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
    }

    const dryRun = new URL(request.url).searchParams.get("dryRun") === "1";
    const grenze = aufbewahrungsGrenze(new Date());

    const faellig = await prisma.generatedDocument.findMany({
      where: { createdAt: { lt: grenze } },
      select: { id: true, pfadDocx: true, pfadPdf: true },
    });

    if (dryRun) {
      return NextResponse.json({
        success: true,
        dryRun: true,
        aufbewahrungMonate: AUFBEWAHRUNG_MONATE,
        grenze: grenze.toISOString(),
        wuerdeLoeschen: faellig.length,
      });
    }

    let geloescht = 0;
    let dateienGeloescht = 0;
    let ordnerGeloescht = 0;
    let fehler = 0;

    for (const dok of faellig) {
      try {
        // Zuerst die Dateien — bleibt der Datensatz beim Fehlschlag stehen,
        // versucht es der naechste Lauf erneut. Umgekehrt waeren die Dateien
        // verwaist und niemand faende sie je wieder.
        for (const pfad of [dok.pfadDocx, dok.pfadPdf]) {
          if (pfad && (await deleteUploadedFile(pfad))) dateienGeloescht++;
        }
        // Jede Erzeugung liegt in einem eigenen Unterverzeichnis — das jetzt
        // leere Verzeichnis mit entfernen.
        const ordner = dok.pfadDocx || dok.pfadPdf;
        if (ordner && (await deleteUploadedDirIfEmpty(path.dirname(ordner)))) {
          ordnerGeloescht++;
        }

        await prisma.generatedDocument.delete({ where: { id: dok.id } });
        geloescht++;
      } catch (err) {
        console.error(`[cron/dokumente-aufbewahrung] Fehler bei ${dok.id}:`, err);
        fehler++;
      }
    }

    return NextResponse.json({
      success: true,
      aufbewahrungMonate: AUFBEWAHRUNG_MONATE,
      grenze: grenze.toISOString(),
      geloescht,
      dateienGeloescht,
      ordnerGeloescht,
      fehler,
    });
  } catch (error) {
    console.error("[cron/dokumente-aufbewahrung] Schwerer Fehler:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
