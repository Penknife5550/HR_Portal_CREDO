/**
 * BEM E10 — zentraler Versand-Helfer fuer Einwilligungs-Links.
 *
 * Erzeugt je Art (Durchfuehrung/Datenschutz/BR/SBV) einen Magic-Link
 * (Token nur als SHA-256-Hash in der DB), versendet die CREDO-CI-Mail
 * SMTP-direkt (Entscheidung #9) mit dem editierbaren Einwilligungstext der Art
 * und schreibt Versandnachweis (BemKommunikation) + Audit. Wird von der
 * Einladung, dem Auto-Versand nach Annahme und dem Einzel-Resend genutzt.
 */

import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";
import type { BemEinwilligungArt } from "@prisma/client";
import { hashToken } from "@/lib/token-hash";
import { sendEmailDetailed } from "@/lib/mailer";
import { renderCredoEmail, paragraphsToHtml } from "@/lib/email-layout";
import { logBemAudit, logBemKommunikation, BEM_AUDIT_ACTIONS } from "@/lib/bem-audit";
import { getBemEinwilligungstext } from "@/lib/bem-vorlagen";

export interface SendLinkFall {
  id: string;
  displayId: string;
  organizationId: string;
  employeeFirstName: string;
  employeeLastName: string;
}

export interface SendLinkResult {
  ok: boolean;
  art: BemEinwilligungArt;
  einwilligungId?: string;
  magicUrl?: string;
  error?: string;
}

export async function sendBemEinwilligungLink(params: {
  fall: SendLinkFall;
  art: BemEinwilligungArt;
  recipient: string;
  baseUrl: string;
  gueltigkeitstage: number;
  gesendetById?: string | null;
  ipAddress?: string | null;
  zusatzText?: string | null;
}): Promise<SendLinkResult> {
  const { fall, art, recipient, baseUrl, gueltigkeitstage } = params;
  const now = new Date();

  const token = randomUUID();
  const tokenHash = hashToken(token);
  const tokenExpiry = new Date(now);
  tokenExpiry.setDate(tokenExpiry.getDate() + gueltigkeitstage);

  const { titel, koerper, version } = await getBemEinwilligungstext(
    art,
    fall.organizationId,
  );

  const daten = {
    status: "OFFEN" as const,
    token: tokenHash,
    tokenExpiry,
    vorlageVersion: version,
    // Wortlaut-Snapshot fuer die Nachweisbarkeit (DSGVO Art. 5 Abs. 2).
    textSnapshot: { titel, koerper },
  };
  const einwilligung = await prisma.$transaction(async (tx) => {
    // Einen bei Fall-Anlage automatisch erzeugten, token-losen Platzhalter
    // derselben Art (z.B. SBV) wiederverwenden statt eine zweite Zeile anzulegen.
    const platzhalter = await tx.bemEinwilligung.findFirst({
      where: { bemFallId: fall.id, art, status: "OFFEN", token: null },
      select: { id: true },
    });
    // Vorhandene token-behaftete offene Links derselben Art entwerten.
    await tx.bemEinwilligung.updateMany({
      where: { bemFallId: fall.id, art, status: "OFFEN", token: { not: null } },
      data: { tokenExpiry: new Date(0) },
    });
    if (platzhalter) {
      return tx.bemEinwilligung.update({
        where: { id: platzhalter.id },
        data: daten,
        select: { id: true },
      });
    }
    return tx.bemEinwilligung.create({
      data: { bemFallId: fall.id, art, ...daten },
      select: { id: true },
    });
  });

  const magicUrl = `${baseUrl.replace(/\/+$/, "")}/bem/einwilligung/${token}`;
  const name = `${fall.employeeFirstName} ${fall.employeeLastName}`.trim();
  const subject = `BEM ${fall.displayId}: ${titel}`;
  const body = koerper + (params.zusatzText ? `\n\n${params.zusatzText}` : "");
  const html = renderCredoEmail({
    titel,
    intro: `Guten Tag ${name},`,
    bodyHtml: paragraphsToHtml(body),
    button: { label: "Jetzt online bestätigen", url: magicUrl },
    fussnote: `Dieser Link ist bis zum ${tokenExpiry.toLocaleDateString("de-DE")} gültig. Die Teilnahme ist freiwillig.`,
    appUrl: baseUrl,
  });

  const sent = await sendEmailDetailed({
    to: recipient,
    subject,
    html,
    text: `${body}\n\nLink: ${magicUrl}`,
  });

  await logBemKommunikation({
    bemFallId: fall.id,
    kanal: "EMAIL",
    status: sent.ok ? "GESENDET" : "FEHLGESCHLAGEN",
    empfaenger: recipient,
    betreff: subject,
    messageId: sent.ok ? (sent.messageId ?? null) : null,
    fehlertext: sent.ok ? null : sent.error.slice(0, 500),
    ipAddress: params.ipAddress ?? null,
    gesendetById: params.gesendetById ?? null,
  });
  await logBemAudit({
    bemFallId: fall.id,
    userId: params.gesendetById ?? null,
    action: sent.ok
      ? BEM_AUDIT_ACTIONS.EINLADUNG_VERSENDET
      : BEM_AUDIT_ACTIONS.EINLADUNG_FEHLGESCHLAGEN,
    details: {
      einwilligungId: einwilligung.id,
      art,
      empfaenger: recipient,
      ...(sent.ok ? {} : { fehler: sent.error.slice(0, 500) }),
    },
    ipAddress: params.ipAddress ?? null,
  });

  return {
    ok: sent.ok,
    art,
    einwilligungId: einwilligung.id,
    magicUrl,
    error: sent.ok ? undefined : sent.error,
  };
}

/**
 * Ermittelt die nach Annahme der Durchfuehrung automatisch zu versendenden Arten:
 * Datenschutz immer; BR nur bei vorhandenem Betriebsrat; SBV nur bei vorhandener
 * SBV UND Schwerbehinderung des Falls.
 */
export function erforderlicheFolgeArten(opts: {
  hatBetriebsrat: boolean;
  hatSchwerbehindertenvertretung: boolean;
  schwerbehindert: boolean;
}): BemEinwilligungArt[] {
  const arten: BemEinwilligungArt[] = ["DATENSCHUTZ"];
  if (opts.hatBetriebsrat) arten.push("BR");
  if (opts.hatSchwerbehindertenvertretung && opts.schwerbehindert) arten.push("SBV");
  return arten;
}
