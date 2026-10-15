/**
 * Mailtext im Versandprotokoll — Schreiben und Lesen (Server).
 *
 * Die Regeln (was ersetzt wird, was nie gespeichert wird) stehen rein und
 * getestet in `mail-text-archiv.ts`. Hier liegt nur die Datenbank:
 *
 *  - Schreiben: `mailTextSpeichern` laeuft NACH der Protokollzeile und in einem
 *    eigenen `try`. Ein Fehler hier verliert nie die Zeile und nie die Mail —
 *    er landet nur mit Kennung (nie mit Inhalt) in der Konsole.
 *  - Lesen: `mailTextLaden` liefert genau EINE Mail, mit Kopfzeilen, der
 *    Ansicht und dem abgeleiteten Text. Den Zugriff pruefen die Routen davor
 *    (Rolle, Mandant, gehoert die Zeile zu diesem Vorgang); `bedingung` ist
 *    dafuer die zweite Schranke direkt in der Abfrage.
 */

import { prisma } from "@/lib/db";
import { getEventDefinition } from "@/lib/events";
import { fehlerKennung } from "@/lib/fehler-kennung";
import {
  MAIL_TEXT_MELDUNGEN,
  htmlFuerAnsicht,
  linkWurdeErsetzt,
  textAusHtml,
  textFuerProtokoll,
  textSpeichernErlaubt,
} from "@/lib/mail-text-archiv";
import { MAIL_STATUS_TEXTE } from "@/lib/vorgangs-mails";

/** Portal-Adresse fuer die Entscheidung, welche Links bleiben (leer = unbekannt, dann strenger). */
function portalAdresse(): string {
  return process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "";
}

/**
 * Speichert den Text zu einer Protokollzeile. Wirft nie.
 *
 * `html` ist der HTML-Teil, der hinausging (oder hinausgehen sollte — bei
 * FAILED). Nicht gespeichert wird bei BEM, beim Test-Versand und ohne Zeile.
 */
export async function mailTextSpeichern(opts: {
  emailLogId: string | null | undefined;
  event: string;
  html: string;
  isTest?: boolean;
}): Promise<void> {
  if (!opts.emailLogId || opts.isTest || !opts.html) return;
  if (!textSpeichernErlaubt(opts.event)) return;
  try {
    const kopie = textFuerProtokoll(opts.html, portalAdresse());
    await prisma.emailLogText.create({
      data: { emailLogId: opts.emailLogId, bodyHtml: kopie.bodyHtml, gekuerzt: kopie.gekuerzt },
    });
  } catch (err) {
    console.error("[Mailer] Mailtext konnte nicht gespeichert werden:", fehlerKennung(err));
  }
}

export interface MailTextAntwort {
  kopf: {
    zeitpunkt: string;
    ereignisName: string;
    status: string;
    statusText: string;
    betreff: string;
    empfaenger: string;
    cc: string | null;
    bcc: string | null;
  };
  /** Fuer den Rahmen der Ansicht aufbereitet (ohne Skripte und klickbare Adressen). */
  html: string;
  /** Die Ansicht „Nur Text“, aus dem HTML abgeleitet. */
  text: string;
  /** Der Text wurde beim Speichern gekuerzt. */
  gekuerzt: boolean;
  /** Fertiger Satz zu dieser Mail (z. B. „nicht zugestellt“); `null` = nichts zu sagen. */
  hinweis: string | null;
  /**
   * Fertiger Satz zu den ersetzten Links — nur, wenn in DIESEM Text wirklich
   * einer ersetzt wurde (sonst `null`; die Oberflaeche zeigt dann keinen Kasten).
   */
  linkHinweis: string | null;
}

/**
 * Bedingung „alle Zeilen“ fuer `mailTextLaden` — das allgemeine Versandprotokoll
 * (Einstellungen) liest ueber alle Vorgaenge. Ausdruecklich benannt, damit ein
 * vergessenes Argument nicht still alle Zeilen oeffnet.
 */
export const ALLE_ZEILEN: Record<string, never> = {};

/**
 * Text einer Protokollzeile. `bedingung` wird in die Abfrage der Zeile
 * eingehaengt (etwa `{ vorgangTyp, vorgangId, isTest: false }`) — eine Zeile,
 * die nicht dazu passt, ist „nicht gefunden“, nicht „verboten“.
 */
export async function mailTextLaden(
  emailLogId: string,
  bedingung: Record<string, unknown>,
): Promise<MailTextAntwort | null> {
  const zeile = await prisma.emailLog.findFirst({
    where: { id: emailLogId, ...bedingung },
    select: {
      createdAt: true,
      event: true,
      status: true,
      subject: true,
      recipient: true,
      cc: true,
      bcc: true,
      text: { select: { bodyHtml: true, gekuerzt: true } },
    },
  });
  if (!zeile?.text) return null;

  const bodyHtml = zeile.text.bodyHtml;
  return {
    kopf: {
      zeitpunkt: zeile.createdAt.toISOString(),
      ereignisName: getEventDefinition(zeile.event)?.name ?? zeile.event,
      status: zeile.status,
      statusText: MAIL_STATUS_TEXTE[zeile.status] ?? zeile.status,
      betreff: zeile.subject,
      empfaenger: zeile.recipient,
      cc: zeile.cc || null,
      bcc: zeile.bcc || null,
    },
    html: htmlFuerAnsicht(bodyHtml),
    text: textAusHtml(bodyHtml),
    gekuerzt: zeile.text.gekuerzt,
    hinweis: zeile.status === "FAILED" ? MAIL_TEXT_MELDUNGEN.nichtZugestellt : null,
    linkHinweis: linkWurdeErsetzt(bodyHtml) ? MAIL_TEXT_MELDUNGEN.zugangslinks : null,
  };
}
