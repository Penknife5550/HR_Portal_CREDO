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

/**
 * Schreibt den Fall-Status aus den tragenden Einwilligungen fort (E10).
 * Nur aus EINLADUNG_VERSENDET (race-frei): Durchfuehrung abgelehnt ->
 * EINWILLIGUNG_ABGELEHNT; Datenschutz UND Durchfuehrung erteilt ->
 * EINWILLIGUNG_ERTEILT. Gibt den neuen Zielstatus zurueck, falls gewechselt
 * wurde (sonst null) — damit der Aufrufer Benachrichtigungen ausloesen kann.
 */
export async function recomputeFallEinwilligungsStatus(
  bemFallId: string,
): Promise<"EINWILLIGUNG_ERTEILT" | "EINWILLIGUNG_ABGELEHNT" | null> {
  const fall = await prisma.bemFall.findUnique({
    where: { id: bemFallId },
    select: { status: true },
  });
  if (!fall || fall.status !== "EINLADUNG_VERSENDET") return null;

  const einw = await prisma.bemEinwilligung.findMany({
    where: { bemFallId, art: { in: [...TRAGENDE_ARTEN] } },
    select: { art: true, status: true },
  });
  const effektiv = (art: string): "ERTEILT" | "ABGELEHNT" | "OFFEN" => {
    const list = einw.filter((e) => e.art === art);
    if (list.some((e) => e.status === "ERTEILT")) return "ERTEILT";
    if (list.some((e) => e.status === "ABGELEHNT")) return "ABGELEHNT";
    return "OFFEN";
  };
  const ds = effektiv("DATENSCHUTZ");
  const df = effektiv("DURCHFUEHRUNG");

  // Abwaertskompatibilitaet (vor E10): Faelle, die nur mit einer DATENSCHUTZ-
  // Einwilligung eingeladen wurden (kein DURCHFUEHRUNG-Datensatz), folgen der
  // alten Ein-Einwilligungs-Logik.
  const hatDurchfuehrung = einw.some((e) => e.art === "DURCHFUEHRUNG");
  if (!hatDurchfuehrung) {
    if (ds === "ABGELEHNT") {
      const upd = await prisma.bemFall.updateMany({
        where: { id: bemFallId, status: "EINLADUNG_VERSENDET" },
        data: { status: "EINWILLIGUNG_ABGELEHNT" },
      });
      return upd.count > 0 ? "EINWILLIGUNG_ABGELEHNT" : null;
    }
    if (ds === "ERTEILT") {
      const upd = await prisma.bemFall.updateMany({
        where: { id: bemFallId, status: "EINLADUNG_VERSENDET" },
        data: { status: "EINWILLIGUNG_ERTEILT", datenschutzAm: new Date() },
      });
      return upd.count > 0 ? "EINWILLIGUNG_ERTEILT" : null;
    }
    return null;
  }

  if (df === "ABGELEHNT") {
    const upd = await prisma.bemFall.updateMany({
      where: { id: bemFallId, status: "EINLADUNG_VERSENDET" },
      data: { status: "EINWILLIGUNG_ABGELEHNT" },
    });
    return upd.count > 0 ? "EINWILLIGUNG_ABGELEHNT" : null;
  }
  if (ds === "ERTEILT" && df === "ERTEILT") {
    const upd = await prisma.bemFall.updateMany({
      where: { id: bemFallId, status: "EINLADUNG_VERSENDET" },
      data: { status: "EINWILLIGUNG_ERTEILT", datenschutzAm: new Date() },
    });
    return upd.count > 0 ? "EINWILLIGUNG_ERTEILT" : null;
  }
  return null;
}
