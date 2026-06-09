/**
 * BEM-Einwilligungs-Helfer (E9)
 *
 * Der Widerruf der Durchfuehrungs-/Datenschutz-Einwilligung muss die weitere
 * Verarbeitung stoppen (DSGVO Art. 7 Abs. 3 / § 167 SGB IX). Diese Helfer
 * kapseln die Pruefung, ob fuer einen Fall aktuell eine gueltige Einwilligung
 * vorliegt — verwendet von den inhaltlichen Erfassungs-Routen.
 */

import { prisma } from "@/lib/db";

const TRAGENDE_ARTEN = ["DATENSCHUTZ", "DURCHFUEHRUNG"] as const;

/**
 * true, wenn fuer den Fall eine tragende Einwilligung erteilt UND danach
 * widerrufen wurde und KEINE neue gueltige Einwilligung vorliegt. In diesem
 * Fall ist die weitere inhaltliche Verarbeitung zu unterlassen.
 *
 * Faelle ohne erfasste Einwilligung (z.B. fruehe Phase, reiner Papierweg ohne
 * Datensatz) werden NICHT gesperrt — der Widerruf greift nur, wenn es vorher
 * eine erteilte Einwilligung gab.
 */
export async function istVerarbeitungGesperrt(bemFallId: string): Promise<boolean> {
  const einwilligungen = await prisma.bemEinwilligung.findMany({
    where: { bemFallId, art: { in: [...TRAGENDE_ARTEN] } },
    select: { art: true, status: true },
  });
  if (einwilligungen.length === 0) return false;
  // Je tragender Art einzeln auswerten: wird DATENSCHUTZ widerrufen, darf eine
  // noch aktive DURCHFUEHRUNG das NICHT maskieren (und umgekehrt). Gesperrt,
  // sobald MINDESTENS eine tragende Art widerrufen-und-nicht-erneuert ist.
  for (const art of TRAGENDE_ARTEN) {
    const proArt = einwilligungen.filter((e) => e.art === art);
    if (proArt.length === 0) continue;
    const aktiv = proArt.some((e) => e.status === "ERTEILT");
    const widerruf = proArt.some((e) => e.status === "WIDERRUFEN");
    if (widerruf && !aktiv) return true;
  }
  return false;
}
