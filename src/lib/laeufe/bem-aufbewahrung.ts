/**
 * Lauf „BEM-Aufbewahrung“ (vorher Inhalt der Route /api/cron/bem-aufbewahrung).
 *
 * Taeglicher Loesch-Lauf der BEM-Aufbewahrung (§ 167 SGB IX / DSGVO Art. 17).
 * Faelle, deren Aufbewahrungsfrist abgelaufen ist (aufbewahrungBis <= heute),
 * werden bereinigt ("Crypto-Shredding"):
 *  - alle inhaltstragenden Kind-Datensaetze (Gespraeche, Massnahmen,
 *    Einwilligungen) + Dokumente werden geloescht (inkl. Dateien auf Disk),
 *  - der Fall wird auf GELOESCHT gesetzt (Huelle bleibt fuer den Nachweis),
 *  - AuditLog + Versandprotokoll (BemKommunikation) bleiben erhalten.
 *
 * Gestartet vom Zeitplaner des Portals (src/lib/zeitplaner/, Einstellungen →
 * Automatische Läufe); Handaufruf ueber die duenne Route POST /api/cron/bem-aufbewahrung
 * (Bearer CRON_SECRET). Probelauf (`dryRun`): nur zaehlen, nichts loeschen.
 */

import { prisma } from "@/lib/db";
import { deleteUploadedFile } from "@/lib/file-upload";
import { logBemAudit, BEM_AUDIT_ACTIONS } from "@/lib/bem-audit";
import { laufAntwort, type LaufErgebnis, type LaufOptionen } from "@/lib/laeufe/lauf-ergebnis";

export async function bemAufbewahrungLauf(opts: LaufOptionen = {}): Promise<LaufErgebnis> {
  const now = opts.jetzt ?? new Date();
  try {
    const faellig = await prisma.bemFall.findMany({
      // not:null explizit — nur Faelle mit GESETZTER, abgelaufener Frist loeschen.
      where: { status: { not: "GELOESCHT" }, aufbewahrungBis: { not: null, lte: now } },
      select: {
        id: true,
        displayId: true,
        dokumente: { select: { dateipfad: true } },
      },
    });

    // Probelauf: nur zaehlen — dieser Lauf loescht Art.-9-Daten endgueltig,
    // deshalb darf der erste Lauf nach dem Einschalten nur zeigen, was er taete.
    if (opts.dryRun) {
      return laufAntwort({
        dryRun: true,
        data: {
          faelligGeprueft: faellig.length,
          geloescht: 0,
          fehler: 0,
          dateienGeloescht: 0,
          wuerdeLoeschen: faellig.length,
          wuerdeDateienLoeschen: faellig.reduce((n, f) => n + f.dokumente.length, 0),
        },
      });
    }

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

    return laufAntwort({
      dryRun: false,
      data: { faelligGeprueft: faellig.length, geloescht, fehler, dateienGeloescht },
    });
  } catch (error) {
    console.error(
      "[cron/bem-aufbewahrung] POST fehlgeschlagen:",
      error instanceof Error ? error.message : error,
    );
    return laufAntwort({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
