/**
 * API: POST /api/bem/[id]/einladung
 *
 * Versendet die BEM-Einladung samt Datenschutzinformation an die/den
 * Beschaeftigte:n. Erzeugt eine BemEinwilligung (OFFEN) mit Magic-Link-Token
 * (nur Hash in DB), sendet die Mail **SMTP-direkt** (kein n8n, Entscheidung #9)
 * im CREDO-CI-Layout und schreibt einen prueffaehigen Versandnachweis
 * (BemKommunikation, NFR 0a). Status -> EINLADUNG_VERSENDET (nur aus ANGELEGT).
 */

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canAccessBemContent } from "@/lib/permissions";
import { hashToken } from "@/lib/token-hash";
import { sendEmailDetailed } from "@/lib/mailer";
import { renderCredoEmail, paragraphsToHtml } from "@/lib/email-layout";
import { logBemAudit, logBemKommunikation, BEM_AUDIT_ACTIONS } from "@/lib/bem-audit";
import { einladungSchema } from "@/lib/validations/bem";

function clientIp(req: NextRequest): string | null {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    null
  );
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }
    const { id } = await context.params;
    if (!(await canAccessBemContent(session, id))) {
      return NextResponse.json({ error: "Fall nicht gefunden" }, { status: 404 });
    }

    const body = await request.json().catch(() => null);
    const parsed = einladungSchema.safeParse(body ?? {});
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0].message },
        { status: 400 },
      );
    }
    const d = parsed.data;

    const fall = await prisma.bemFall.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        displayId: true,
        employeeFirstName: true,
        employeeLastName: true,
        employeeEmail: true,
        einladungAm: true,
        organization: { select: { name: true, ezTokenValidityDays: true } },
      },
    });
    if (!fall) {
      return NextResponse.json({ error: "Fall nicht gefunden" }, { status: 404 });
    }

    const recipient = d.email || fall.employeeEmail;
    if (!recipient) {
      return NextResponse.json(
        { error: "Keine Empfaenger-E-Mail hinterlegt. Bitte E-Mail angeben." },
        { status: 400 },
      );
    }

    const ipAddress = clientIp(request);
    const now = new Date();

    // Token (UUID); in der DB nur der SHA-256-Hash.
    const token = randomUUID();
    const tokenHash = hashToken(token);
    const validityDays = d.gueltigkeitstage || fall.organization.ezTokenValidityDays || 30;
    const tokenExpiry = new Date(now);
    tokenExpiry.setDate(tokenExpiry.getDate() + validityDays);

    // Beim (Neu-)Versand werden zuvor offene, noch nicht beantwortete
    // Einladungen derselben Art entwertet (Ablauf in die Vergangenheit) —
    // so bleibt nur der zuletzt versandte Link gueltig (Sicherheit + DB-Hygiene).
    const einwilligung = await prisma.$transaction(async (tx) => {
      await tx.bemEinwilligung.updateMany({
        where: { bemFallId: id, art: d.art, status: "OFFEN" },
        data: { tokenExpiry: new Date(0) },
      });
      return tx.bemEinwilligung.create({
        data: {
          bemFallId: id,
          art: d.art,
          status: "OFFEN",
          token: tokenHash,
          tokenExpiry,
        },
        select: { id: true },
      });
    });

    const baseUrl =
      process.env.APP_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      request.nextUrl.origin;
    const magicUrl = `${baseUrl}/bem/einwilligung/${token}`;

    const name = `${fall.employeeFirstName} ${fall.employeeLastName}`.trim();
    const subject = "Einladung zum Betrieblichen Eingliederungsmanagement (BEM)";
    const textBody =
      `Sie waren in den letzten zwoelf Monaten laenger oder wiederholt arbeitsunfaehig. ` +
      `Ihr Arbeitgeber bietet Ihnen daher ein Betriebliches Eingliederungsmanagement (BEM) an. ` +
      `Ziel ist es, gemeinsam Moeglichkeiten zu finden, Ihre Arbeitsfaehigkeit zu erhalten.\n\n` +
      `Die Teilnahme ist freiwillig. Bitte teilen Sie uns ueber den folgenden Link mit, ` +
      `ob Sie dem BEM zustimmen. Ihre Angaben werden streng vertraulich behandelt.` +
      (d.nachricht ? `\n\n${d.nachricht}` : "");
    const html = renderCredoEmail({
      titel: "Einladung zum BEM-Gespraech",
      intro: `Guten Tag ${name},`,
      bodyHtml: paragraphsToHtml(textBody),
      button: { label: "Jetzt online antworten", url: magicUrl },
      fussnote: `Dieser Link ist bis zum ${tokenExpiry.toLocaleDateString("de-DE")} gueltig. Wenn Sie die Nachricht irrtuemlich erhalten haben, ignorieren Sie sie bitte.`,
      appUrl: baseUrl,
    });

    const sent = await sendEmailDetailed({
      to: recipient,
      subject,
      html,
      text: `${textBody}\n\nAntwort-Link: ${magicUrl}`,
    });

    if (!sent.ok) {
      // Echten SMTP-Fehler ins Protokoll schreiben (prueffaehig + debugbar).
      await logBemKommunikation({
        bemFallId: id,
        kanal: "EMAIL",
        status: "FEHLGESCHLAGEN",
        empfaenger: recipient,
        betreff: subject,
        fehlertext: sent.error.slice(0, 500),
        ipAddress,
        gesendetById: session.userId,
      });
      await logBemAudit({
        bemFallId: id,
        userId: session.userId,
        action: BEM_AUDIT_ACTIONS.EINLADUNG_FEHLGESCHLAGEN,
        details: {
          einwilligungId: einwilligung.id,
          art: d.art,
          empfaenger: recipient,
          fehler: sent.error.slice(0, 500),
        },
        ipAddress,
      });
      // Token bleibt gueltig — HR kann den Link manuell zustellen.
      return NextResponse.json(
        {
          error: `E-Mail konnte nicht versendet werden: ${sent.error}`,
          detail: sent.error,
          magicUrl,
        },
        { status: 502 },
      );
    }

    // Versandnachweis (prueffaehig)
    await logBemKommunikation({
      bemFallId: id,
      kanal: "EMAIL",
      status: "GESENDET",
      empfaenger: recipient,
      betreff: subject,
      messageId: sent.messageId ?? null,
      ipAddress,
      gesendetById: session.userId,
    });
    await logBemAudit({
      bemFallId: id,
      userId: session.userId,
      action: BEM_AUDIT_ACTIONS.EINLADUNG_VERSENDET,
      details: { einwilligungId: einwilligung.id, art: d.art, empfaenger: recipient },
      ipAddress,
    });

    // Status nur aus ANGELEGT auf EINLADUNG_VERSENDET heben (race-frei); bei
    // erneutem Versand bleibt der Status/das erste Einladungsdatum erhalten.
    await prisma.bemFall.updateMany({
      where: { id, status: "ANGELEGT" },
      data: { status: "EINLADUNG_VERSENDET", einladungAm: now },
    });

    // magicUrl (Klartext-Token) wird NICHT zurueckgegeben — er ist bereits per
    // Mail zugestellt. Nur im SMTP-Fehlerfall (oben) wird er fuer die manuelle
    // Zustellung geliefert.
    return NextResponse.json({
      data: { sent: true, empfaenger: recipient, expiresAt: tokenExpiry.toISOString() },
    });
  } catch (error) {
    console.error("[API] BEM Einladung POST fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
