/**
 * API: POST /api/bem/[id]/einladung
 *
 * Versendet die BEM-Einladung = DURCHFUEHRUNGS-Einwilligung ("Angebot annehmen").
 * Nutzt den zentralen Versand-Helfer (Magic-Link, CREDO-CI, SMTP-direkt,
 * BemKommunikation + Audit). Nach Annahme werden die weiteren erforderlichen
 * Einwilligungs-Links automatisch nachgesendet (siehe einwilligung/[token]).
 * Status -> EINLADUNG_VERSENDET (nur aus ANGELEGT).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canMutateBemContent } from "@/lib/permissions";
import { syncBemFristen } from "@/lib/bem-fristen";
import { einladungSchema } from "@/lib/validations/bem";
import { sendBemEinwilligungLink } from "@/lib/bem-einladung";

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
    if (!(await canMutateBemContent(session, id))) {
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
        organizationId: true,
        employeeFirstName: true,
        employeeLastName: true,
        employeeEmail: true,
        organization: { select: { ezTokenValidityDays: true } },
      },
    });
    if (!fall) {
      return NextResponse.json({ error: "Fall nicht gefunden" }, { status: 404 });
    }

    const recipient = d.email || fall.employeeEmail;
    if (!recipient) {
      return NextResponse.json(
        { error: "Keine Empfänger-E-Mail hinterlegt. Bitte E-Mail angeben." },
        { status: 400 },
      );
    }

    // Ansprechpartner:innen des Mandanten zur Info in die Mail aufnehmen.
    const ansprechpartner = await prisma.bemAnsprechpartner.findMany({
      where: { organizationId: fall.organizationId, isActive: true },
      select: { name: true, funktion: true },
      orderBy: [{ orderIndex: "asc" }, { name: "asc" }],
    });
    const ansprechpartnerText =
      ansprechpartner.length > 0
        ? `Als Ansprechpartner:innen stehen Ihnen zur Verfügung:\n` +
          ansprechpartner
            .map((a) => `- ${a.name}${a.funktion ? ` (${a.funktion})` : ""}`)
            .join("\n") +
          `\nIm Antwort-Formular können Sie eine:n Wunsch-Ansprechpartner:in auswählen.`
        : "";
    const zusatzText = [ansprechpartnerText, d.nachricht?.trim() || ""]
      .filter(Boolean)
      .join("\n\n") || null;

    const baseUrl =
      process.env.APP_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      request.nextUrl.origin;
    const validityDays = d.gueltigkeitstage || fall.organization.ezTokenValidityDays || 30;

    const result = await sendBemEinwilligungLink({
      fall: {
        id: fall.id,
        displayId: fall.displayId,
        organizationId: fall.organizationId,
        employeeFirstName: fall.employeeFirstName,
        employeeLastName: fall.employeeLastName,
      },
      art: "DURCHFUEHRUNG",
      recipient,
      baseUrl,
      gueltigkeitstage: validityDays,
      gesendetById: session.userId,
      ipAddress: clientIp(request),
      zusatzText,
    });

    if (!result.ok) {
      return NextResponse.json(
        {
          error: `E-Mail konnte nicht versendet werden: ${result.error}`,
          detail: result.error,
          magicUrl: result.magicUrl, // fuer manuelle Zustellung
        },
        { status: 502 },
      );
    }

    // Status nur aus ANGELEGT auf EINLADUNG_VERSENDET heben (race-frei).
    await prisma.bemFall.updateMany({
      where: { id, status: "ANGELEGT" },
      data: { status: "EINLADUNG_VERSENDET", einladungAm: new Date() },
    });
    // Manuell eingegebene Empfaenger-Mail als employeeEmail sichern, damit der
    // automatische Folge-Versand (Datenschutz/BR/SBV) nach Annahme funktioniert.
    if (!fall.employeeEmail && d.email) {
      await prisma.bemFall.update({ where: { id }, data: { employeeEmail: recipient } });
    }
    await syncBemFristen(id);

    return NextResponse.json({
      data: { sent: true, empfaenger: recipient },
    });
  } catch (error) {
    console.error("[API] BEM Einladung POST fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
