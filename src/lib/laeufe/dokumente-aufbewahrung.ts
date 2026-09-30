/**
 * Lauf „Aufbewahrung erzeugter Dokumente“ (vorher Inhalt der Route
 * /api/cron/dokumente-aufbewahrung).
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
 * Gestartet vom Zeitplaner des Portals (src/lib/zeitplaner/, Einstellungen →
 * Automatische Läufe); Handaufruf ueber die duenne Route POST /api/cron/dokumente-aufbewahrung
 * (Bearer CRON_SECRET). Probelauf (`dryRun`, Route: ?dryRun=1): nur zaehlen.
 */

import path from "path";
import { prisma } from "@/lib/db";
import { deleteUploadedFile, deleteUploadedDirIfEmpty } from "@/lib/file-upload";
import { AUFBEWAHRUNG_MONATE, aufbewahrungsGrenze } from "@/lib/erzeugte-dokumente-vorgang";
import { laufAntwort, type LaufErgebnis, type LaufOptionen } from "@/lib/laeufe/lauf-ergebnis";

export async function dokumenteAufbewahrungLauf(opts: LaufOptionen = {}): Promise<LaufErgebnis> {
  try {
    const dryRun = opts.dryRun === true;
    const grenze = aufbewahrungsGrenze(opts.jetzt ?? new Date());

    const faellig = await prisma.generatedDocument.findMany({
      where: { createdAt: { lt: grenze } },
      select: { id: true, pfadDocx: true, pfadPdf: true },
    });

    if (dryRun) {
      return laufAntwort({
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

    return laufAntwort({
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
    return laufAntwort({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
