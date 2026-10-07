/**
 * Vertragsende: Was hat der Versand an die Fuehrungskraft ergeben?
 *
 * `triggerWebhooks` wirft nie und meldet SENT, FAILED oder SKIPPED. Anfrage
 * (`/supervisor-link`) und Erinnerung (Knopf und taeglicher Lauf) haben das
 * Ergebnis bis 10/2026 verworfen: Die Oberflaeche meldete „gesendet", der
 * Zaehler stieg, und nach drei gescheiterten Erinnerungen ging die Eskalation
 * „reagiert nicht auf 3 Erinnerungen" an HR — obwohl nie eine ankam.
 *
 * Die Bewertung ist dieselbe wie bei den Abteilungsaufgaben
 * (`versandStatusAusErgebnis`): SENT zaehlt, SKIPPED wegen deaktivierter
 * Portal-Vorlage zaehlt nur, wenn ein aktiver Webhook das Event uebernimmt
 * (WEBHOOK), alles andere ist nicht zugestellt.
 */

import { prisma } from "@/lib/db";
import {
  versandStatusAusErgebnis,
  VORLAGE_DEAKTIVIERT_DETAIL,
  type LinkVersandErgebnis,
  type MailErgebnis,
} from "@/lib/abteilungsaufgaben";

/** Ergebnis von `triggerWebhooks` auf zugestellt / nicht zugestellt abbilden. */
export async function versandBewerten(
  event: string,
  ergebnis: MailErgebnis | null | undefined,
): Promise<LinkVersandErgebnis> {
  // Die Abfrage braucht es nur in genau einem Fall — sonst keine.
  const vorlageAus =
    ergebnis?.status === "SKIPPED" && (ergebnis.detail ?? "").trim() === VORLAGE_DEAKTIVIERT_DETAIL;
  return versandStatusAusErgebnis(ergebnis, vorlageAus ? await webhookAktiv(event) : false);
}

async function webhookAktiv(event: string): Promise<boolean> {
  try {
    return (await prisma.webhookConfig.count({ where: { event, isActive: true } })) > 0;
  } catch {
    return false;
  }
}

/** Statuscode einer Antwort, deren Mail nicht hinausging: Mailserver 502, sonst 409. */
export function statusNichtZugestellt(versand: LinkVersandErgebnis): 409 | 502 {
  return versand.status === "FAILED" ? 502 : 409;
}

/** Grund aus dem Mailer, ohne Punkt am Ende (der Satz setzt seinen eigenen). */
function grundVon(versand: LinkVersandErgebnis): string {
  const grund = (versand.detail ?? "").replace(/[.\s]+$/, "");
  return grund || (versand.status === "FAILED" ? "Versand fehlgeschlagen" : "nicht versendet");
}

/**
 * Meldung fuer HR, wenn die Anfrage nicht hinausging. Der neue Link ist
 * gespeichert, ein frueher versendeter damit tot — das muss HR wissen.
 */
export function anfrageNichtZugestelltMeldung(
  versand: LinkVersandErgebnis,
  fruehererLinkUngueltig: boolean,
): string {
  const grund = grundVon(versand);
  const kopf =
    versand.status === "FAILED"
      ? `Die Anfrage an die Führungskraft konnte nicht versendet werden: ${grund}.`
      : `Die Anfrage an die Führungskraft wurde nicht versendet: ${grund}.`;
  const alt = fruehererLinkUngueltig ? " Der zuvor versendete Link gilt nicht mehr." : "";
  const weiter =
    versand.status === "FAILED"
      ? " Bitte senden Sie die Anfrage später erneut."
      : " Bitte prüfen Sie die E-Mail-Vorlage und senden Sie die Anfrage dann erneut.";
  return `${kopf} Die Anfrage gilt als nicht gesendet.${alt}${weiter}`;
}

/** Meldung fuer HR, wenn die Erinnerung per Knopf nicht hinausging. */
export function erinnerungNichtZugestelltMeldung(versand: LinkVersandErgebnis): string {
  const grund = grundVon(versand);
  return versand.status === "FAILED"
    ? `Die Erinnerung konnte nicht versendet werden: ${grund}. Sie wurde nicht gezählt – bitte später erneut versuchen.`
    : `Die Erinnerung wurde nicht versendet: ${grund}. Sie wurde nicht gezählt.`;
}
