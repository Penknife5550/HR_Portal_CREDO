/**
 * API: POST /api/bem/[id]/massnahmen — BEM-Massnahme anlegen.
 *
 * Versiegelte Akte: Zugriff via canAccessBemContent. Die Beschreibung wird mit
 * BEM_ENCRYPTION_KEY verschluesselt gespeichert (kann gesundheitsbezogen sein).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canMutateBemContent } from "@/lib/permissions";
import { encryptBem } from "@/lib/encryption";
import { logBemAudit, BEM_AUDIT_ACTIONS } from "@/lib/bem-audit";
import { createMassnahmeSchema } from "@/lib/validations/bem";
import { istVerarbeitungGesperrt } from "@/lib/bem-einwilligung";

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
    // Nach Widerruf der tragenden Einwilligung keine weitere Erfassung (DSGVO Art. 7 Abs. 3).
    if (await istVerarbeitungGesperrt(id)) {
      return NextResponse.json(
        { error: "Einwilligung widerrufen — es dürfen keine neuen Maßnahmen erfasst werden." },
        { status: 409 },
      );
    }

    const body = await request.json().catch(() => null);
    const parsed = createMassnahmeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0].message },
        { status: 400 },
      );
    }
    const d = parsed.data;

    const massnahme = await prisma.bemMassnahme.create({
      data: {
        bemFallId: id,
        kategorie: d.kategorie,
        beschreibung: encryptBem(d.beschreibung),
        zustaendig: d.zustaendig ?? null,
        frist: d.frist ? new Date(d.frist) : null,
        evaluationAm: d.evaluationAm ? new Date(d.evaluationAm) : null,
        createdById: session.userId,
      },
      select: { id: true },
    });

    await logBemAudit({
      bemFallId: id,
      userId: session.userId,
      action: BEM_AUDIT_ACTIONS.MASSNAHME_ERFASST,
      details: { massnahmeId: massnahme.id, kategorie: d.kategorie },
      ipAddress: clientIp(request),
    });

    return NextResponse.json({ data: { id: massnahme.id } }, { status: 201 });
  } catch (error) {
    console.error("[API] BEM Massnahme POST fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
