/**
 * CREDO HR-Portal – Sammelmail "Verbeamtung: Fristen-Warnung"
 *
 * Der taegliche Fristen-Lauf (src/app/api/cron/civil-service-deadlines)
 * sammelt Hinweise zu Amtsarzt-Attesten, Beurteilungen, RV-Befreiung und
 * BR-Genehmigung und schickt EINE Mail an HR. Bis zu dieser Aenderung stand
 * darin nur die Anzahl und ein englischer Code ("OVERDUE") — welche Vorgaenge
 * betroffen sind und warum, musste HR im Portal selbst suchen. Die Einzelheiten
 * lagen zwar im Payload (`warnings`), aber als Liste, und der Mail-Baustein
 * setzt nur skalare Werte ein. Die Vorlage konnte sie also gar nicht nennen.
 *
 * Diese Datei macht aus der Liste fertige Mailtexte: eine HTML-Fassung
 * (maskiert — Namen und Meldungen stammen aus der Datenbank und landen sonst
 * ungefiltert im HTML des Postfachs) und eine Klartext-Fassung. Beide gehen
 * als gewoehnliche Felder in den Payload und stehen damit in der Vorlage als
 * {{warnungen_liste_html}} bzw. {{warnungen_liste}} zur Verfuegung — auch in
 * einer unter Einstellungen gespeicherten Fassung, die HR anpassen kann.
 *
 * Bewusst ohne Datenbank- und ohne Node-Abhaengigkeit: Der Event-Katalog
 * (events.ts) baut seinen Beispiel-Payload fuer den Testversand mit derselben
 * Funktion, und der Katalog wird auch im Browser geladen (Einstellungen).
 * Deshalb kommt die Portal-Adresse als Parameter herein, statt hier
 * getBaseUrl() zu rufen.
 */

import { escapeHtml } from "@/lib/email-layout";
import { formatDatumDE } from "@/lib/format";

export type FristSchwere = "WARNING" | "URGENT" | "OVERDUE";

/** Ein Hinweis des Fristen-Laufs — genau die Felder, die der Cron erzeugt. */
export interface FristWarnung {
  processId: string;
  displayId: string;
  employeeName: string;
  type: string;
  severity: FristSchwere;
  message: string;
  /** ISO-Zeitstempel der Frist */
  dueDate: string;
}

/** Anzeige der Dringlichkeit — die Mail ist deutsch, der Code nicht. */
export const FRIST_SCHWERE_LABEL: Record<FristSchwere, string> = {
  OVERDUE: "Überfällig",
  URGENT: "Dringend",
  WARNING: "Vorwarnung",
};

const SCHWERE_RANG: Record<FristSchwere, number> = { OVERDUE: 0, URGENT: 1, WARNING: 2 };

/** Farben der Kennzeichnung, aus der Palette der uebrigen Vorlagen. */
const SCHWERE_FARBE: Record<FristSchwere, string> = {
  OVERDUE: "#991b1b",
  URGENT: "#92400e",
  WARNING: "#1e40af",
};

/**
 * Dringendstes zuerst, innerhalb einer Stufe die fruehere Frist zuerst.
 *
 * Wichtig, weil die Mail nach 50 Hinweisen abschneidet: Ohne Sortierung
 * entschied die Reihenfolge der Pruefungen im Cron, was wegfaellt — und die
 * Amtsarzt-Vorwarnungen kamen vor den ueberfaelligen BR-Genehmigungen. Jetzt
 * fallen immer die am wenigsten dringenden Hinweise weg.
 *
 * Liefert eine neue Liste; die uebergebene bleibt unveraendert.
 */
export function sortiereFristWarnungen(warnungen: FristWarnung[]): FristWarnung[] {
  return [...warnungen].sort((a, b) => {
    const rang = SCHWERE_RANG[a.severity] - SCHWERE_RANG[b.severity];
    if (rang !== 0) return rang;
    return a.dueDate.localeCompare(b.dueDate);
  });
}

export interface FristenMailFelder {
  hoechste_dringlichkeit: string;
  anzahl_vorgaenge: number;
  anzahl_ueberfaellig: number;
  anzahl_dringend: number;
  anzahl_vorwarnung: number;
  warnungen_liste: string;
  warnungen_liste_html: string;
  weitere_warnungen: string;
}

/**
 * Baut die Mailfelder aus ALLEN Hinweisen eines Laufs.
 *
 * Gezaehlt wird ueber alle Hinweise (auch die abgeschnittenen), aufgelistet
 * werden hoechstens `maxAnzeige` — die dringendsten, siehe
 * sortiereFristWarnungen. Was wegfaellt, nennt `weitere_warnungen` in einem
 * Satz; ist nichts weggefallen, ist das Feld leer, damit die Vorlage den Satz
 * mit einem Bedingungsblock ({{#weitere_warnungen}}) ganz weglassen kann.
 *
 * `portalBasis` (z. B. https://hr.fes-credo.de): Ist sie gesetzt, verlinkt
 * jede Zeile den Vorgang im Portal. Ohne Basis bleibt es beim Text — ein
 * relativer Link waere in einer Mail wertlos.
 */
export function fristenMailFelder(
  warnungen: FristWarnung[],
  opts: { maxAnzeige: number; portalBasis?: string },
): FristenMailFelder {
  const sortiert = sortiereFristWarnungen(warnungen);
  const angezeigt = sortiert.slice(0, Math.max(0, opts.maxAnzeige));
  const ausgelassen = sortiert.length - angezeigt.length;
  const basis = (opts.portalBasis ?? "").replace(/\/$/, "");

  const anzahl: Record<FristSchwere, number> = { OVERDUE: 0, URGENT: 0, WARNING: 0 };
  for (const w of sortiert) anzahl[w.severity] += 1;

  const hoechste = sortiert[0]?.severity;
  const portalLink = (w: FristWarnung) =>
    basis ? `${basis}/dashboard/civil-service/${encodeURIComponent(w.processId)}` : "";

  // Klartext: eine Zeile je Hinweis, der Link (falls vorhanden) eingerueckt
  // darunter — lange Zeilen bricht jedes Mailprogramm anders um.
  const textZeilen = angezeigt.map((w) => {
    const frist = formatDatumDE(w.dueDate);
    const zeile =
      `- [${FRIST_SCHWERE_LABEL[w.severity]}] ${w.displayId} · ${w.employeeName}: ` +
      `${w.message}${frist ? ` (Frist: ${frist})` : ""}`;
    const link = portalLink(w);
    return link ? `${zeile}\n  ${link}` : zeile;
  });

  // HTML: jede Angabe aus der Datenbank wird maskiert, auch der Link. Die
  // Farben stehen inline — die Variable wird nach der CI-Umfaerbung der
  // Vorlage eingesetzt, und Mailprogramme ignorieren <style>-Bloecke gern.
  const htmlZeilen = angezeigt.map((w) => {
    const frist = formatDatumDE(w.dueDate);
    const link = portalLink(w);
    const vorgang = link
      ? `<a href="${escapeHtml(link)}" style="color:#575756;">${escapeHtml(w.displayId)}</a>`
      : escapeHtml(w.displayId);
    return (
      `<li style="margin:0 0 10px;">` +
      `<strong style="color:${SCHWERE_FARBE[w.severity]};">${escapeHtml(FRIST_SCHWERE_LABEL[w.severity])}</strong>` +
      ` · ${vorgang} · ${escapeHtml(w.employeeName)}<br>` +
      `<span style="color:#374151;">${escapeHtml(w.message)}</span>` +
      (frist ? `<br><span style="color:#6b7280;font-size:12px;">Frist: ${escapeHtml(frist)}</span>` : "") +
      `</li>`
    );
  });

  return {
    hoechste_dringlichkeit: hoechste ? FRIST_SCHWERE_LABEL[hoechste] : "",
    anzahl_vorgaenge: new Set(sortiert.map((w) => w.processId)).size,
    anzahl_ueberfaellig: anzahl.OVERDUE,
    anzahl_dringend: anzahl.URGENT,
    anzahl_vorwarnung: anzahl.WARNING,
    warnungen_liste: textZeilen.join("\n"),
    warnungen_liste_html: htmlZeilen.length
      ? `<ul style="margin:0;padding:0 0 0 18px;color:#374151;font-size:14px;line-height:1.5;">${htmlZeilen.join("")}</ul>`
      : "",
    weitere_warnungen:
      ausgelassen > 0
        ? `Weitere ${ausgelassen} ${ausgelassen === 1 ? "Hinweis ist" : "Hinweise sind"} hier nicht aufgeführt – bitte im HR-Portal prüfen.`
        : "",
  };
}
