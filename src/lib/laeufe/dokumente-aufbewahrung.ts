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
 * Seit Paket 3 (10/2026) raeumt derselbe Lauf auch die individuellen E-Mails
 * auf: nach 12 Monaten Dateien und Nachrichtentext, der Nachweis bleibt
 * (individuelleMailsAufraeumen in individuelle-mail-dienst.ts). Die Antwort
 * traegt dafuer `individuelleMails` — `AUSWERTER` in zeitplaner/bericht.ts liest es.
 *
 * Seit Paket A3 (S20, E-A22) leert er ausserdem Bemerkungen, Angaben und
 * Hinweise aus „Ausstattung & Zugänge“ sechs Monate nach Abschluss oder
 * Abbruch des Onboardings (eigene Frist `freitextGrenze`, nicht die zwoelf
 * Monate oben; die Zeilen bleiben als Nachweis —
 * `ausstattungFreitexteLeeren` in ausstattung-lauf.ts). Antwortfeld
 * `ausstattung`: `{ geleert, hinweiseGeleert, fehler }`, im Probelauf
 * `{ wuerdeLeeren }`.
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
import { individuelleMailsAufraeumen } from "@/lib/individuelle-mail-dienst";
import { FREITEXT_AUFBEWAHRUNG_MONATE, freitextGrenze } from "@/lib/ausstattung";
import { ausstattungFreitexteLeeren, leeresFreitexteErgebnis } from "@/lib/ausstattung-lauf";
import { fehlerKennung } from "@/lib/fehler-kennung";

export async function dokumenteAufbewahrungLauf(opts: LaufOptionen = {}): Promise<LaufErgebnis> {
  try {
    const dryRun = opts.dryRun === true;
    const jetzt = opts.jetzt ?? new Date();
    const grenze = aufbewahrungsGrenze(jetzt);
    // Eigene, kuerzere Frist fuer die Freitexte der Ausstattung (E-A22).
    const ausstattungGrenze = freitextGrenze(jetzt);
    const ausstattungKopf = {
      aufbewahrungMonate: FREITEXT_AUFBEWAHRUNG_MONATE,
      grenze: ausstattungGrenze.toISOString(),
    };

    const faellig = await prisma.generatedDocument.findMany({
      where: { createdAt: { lt: grenze } },
      select: { id: true, pfadDocx: true, pfadPdf: true },
    });

    if (dryRun) {
      const mails = await individuelleMailsAufraeumen({ grenze, dryRun: true });
      const ausstattung = await ausstattungFreitexteLeeren({ grenze: ausstattungGrenze, dryRun: true });
      return laufAntwort({
        success: true,
        dryRun: true,
        aufbewahrungMonate: AUFBEWAHRUNG_MONATE,
        grenze: grenze.toISOString(),
        wuerdeLoeschen: faellig.length,
        individuelleMails: { wuerdeLeeren: mails.mails },
        // Zeilen (Bemerkung/Angabe) und Hinweise zusammen.
        ausstattung: { ...ausstattungKopf, wuerdeLeeren: ausstattung.geleert + ausstattung.hinweiseGeleert },
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

    // Eigener Block: Ein Fehler dort laesst die erzeugten Dokumente oben
    // unberuehrt und umgekehrt.
    let mails = { mails: 0, dateienGeloescht: 0, fehler: 0 };
    try {
      mails = await individuelleMailsAufraeumen({ grenze, dryRun: false });
    } catch (err) {
      console.error("[cron/dokumente-aufbewahrung] Individuelle E-Mails:", err instanceof Error ? err.name : err);
      mails.fehler++;
    }

    // Eigener Block (E-A22): Freitexte der Ausstattung leeren — ein Fehler dort
    // laesst Dokumente und E-Mails oben unberuehrt.
    let ausstattung = leeresFreitexteErgebnis();
    try {
      ausstattung = await ausstattungFreitexteLeeren({ grenze: ausstattungGrenze, dryRun: false, jetzt });
    } catch (err) {
      console.error("[cron/dokumente-aufbewahrung] Ausstattung (Freitexte):", fehlerKennung(err));
      ausstattung.fehler++;
    }

    return laufAntwort({
      success: true,
      aufbewahrungMonate: AUFBEWAHRUNG_MONATE,
      grenze: grenze.toISOString(),
      geloescht,
      dateienGeloescht,
      ordnerGeloescht,
      fehler,
      individuelleMails: { geleert: mails.mails, dateienGeloescht: mails.dateienGeloescht, fehler: mails.fehler },
      ausstattung: {
        ...ausstattungKopf,
        geleert: ausstattung.geleert,
        hinweiseGeleert: ausstattung.hinweiseGeleert,
        fehler: ausstattung.fehler,
      },
    });
  } catch (error) {
    console.error("[cron/dokumente-aufbewahrung] Schwerer Fehler:", error);
    return laufAntwort({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
