/**
 * API: POST /api/bem/[id]/einwilligung/[einwilligungId]/widerruf
 *
 * Setzt eine erteilte Einwilligung auf WIDERRUFEN (Widerruf jederzeit moeglich,
 * § 167 SGB IX / DSGVO). Versiegelte Akte: Zugriff via canAccessBemContent.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canMutateBemContent } from "@/lib/permissions";
import { logBemAudit, logBemKommunikation, BEM_AUDIT_ACTIONS } from "@/lib/bem-audit";
import { sendEmailDetailed } from "@/lib/mailer";
import { renderCredoEmail, paragraphsToHtml } from "@/lib/email-layout";

function clientIp(req: NextRequest): string | null {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    null
  );
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string; einwilligungId: string }> },
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }
    const { id, einwilligungId } = await context.params;
    if (!(await canMutateBemContent(session, id))) {
      return NextResponse.json({ error: "Fall nicht gefunden" }, { status: 404 });
    }

    const e = await prisma.bemEinwilligung.findFirst({
      where: { id: einwilligungId, bemFallId: id },
      select: { id: true, art: true },
    });
    if (!e) {
      return NextResponse.json(
        { error: "Einwilligung nicht gefunden" },
        { status: 404 },
      );
    }

    const upd = await prisma.bemEinwilligung.updateMany({
      where: { id: einwilligungId, status: "ERTEILT" },
      data: { status: "WIDERRUFEN", widerrufAm: new Date() },
    });
    if (upd.count === 0) {
      return NextResponse.json(
        { error: "Nur erteilte Einwilligungen können widerrufen werden." },
        { status: 409 },
      );
    }

    await logBemAudit({
      bemFallId: id,
      userId: session.userId,
      action: BEM_AUDIT_ACTIONS.EINWILLIGUNG_WIDERRUFEN,
      details: { einwilligungId, art: e.art },
      ipAddress: clientIp(request),
    });

    // Nur der Widerruf einer TRAGENDEN Einwilligung (Datenschutz/Durchfuehrung)
    // stoppt die Verarbeitung -> dann die Beauftragten informieren. Der Widerruf
    // einer reinen BR/SBV-Beteiligung loest diesen Alarm bewusst NICHT aus.
    const tragend = e.art === "DATENSCHUTZ" || e.art === "DURCHFUEHRUNG";
    const fall = tragend
      ? await prisma.bemFall.findUnique({
      where: { id },
      select: {
        displayId: true,
        zugriffe: {
          where: { revokedAt: null },
          select: { user: { select: { email: true, isActive: true } } },
        },
      },
    })
      : null;
    const empfaenger = (fall?.zugriffe ?? [])
      .map((z) => z.user)
      .filter((u) => u.isActive && u.email)
      .map((u) => u.email);
    if (fall && empfaenger.length > 0) {
      const subject = `BEM ${fall.displayId}: Einwilligung widerrufen`;
      const text =
        `Im BEM-Fall ${fall.displayId} wurde eine Einwilligung widerrufen.\n\n` +
        `Bitte stellen Sie die weitere Verarbeitung ein: Es duerfen keine neuen ` +
        `Gespraeche oder Massnahmen mehr erfasst werden. Pruefen Sie, ob das ` +
        `Verfahren zu beenden ist.`;
      const html = renderCredoEmail({
        titel: `BEM-Einwilligung widerrufen: ${fall.displayId}`,
        bodyHtml: paragraphsToHtml(text),
        fussnote:
          "Automatische Benachrichtigung des CREDO HR-Portals (BEM). Keine Gesundheitsdaten.",
      });
      for (const adr of empfaenger) {
        const r = await sendEmailDetailed({ to: adr, subject, html, text });
        await logBemKommunikation({
          bemFallId: id,
          kanal: "EMAIL",
          status: r.ok ? "GESENDET" : "FEHLGESCHLAGEN",
          empfaenger: adr,
          betreff: subject,
          messageId: r.ok ? (r.messageId ?? null) : null,
          fehlertext: r.ok ? null : r.error.slice(0, 500),
          gesendetById: session.userId,
        });
      }
    }

    return NextResponse.json({ data: { id: einwilligungId, status: "WIDERRUFEN" } });
  } catch (error) {
    console.error("[API] BEM Einwilligung Widerruf fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
