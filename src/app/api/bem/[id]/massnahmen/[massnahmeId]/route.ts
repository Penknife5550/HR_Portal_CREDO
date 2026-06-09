/**
 * API: /api/bem/[id]/massnahmen/[massnahmeId]
 *
 * PATCH  – Massnahme aktualisieren (Status, Beschreibung, Frist, Evaluation).
 * DELETE – Massnahme loeschen.
 *
 * Versiegelte Akte: Zugriff via canAccessBemContent. Beschreibung verschluesselt.
 */

import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canMutateBemContent } from "@/lib/permissions";
import { encryptBem } from "@/lib/encryption";
import { logBemAudit, BEM_AUDIT_ACTIONS } from "@/lib/bem-audit";
import { updateMassnahmeSchema } from "@/lib/validations/bem";
import { istVerarbeitungGesperrt } from "@/lib/bem-einwilligung";

function clientIp(req: NextRequest): string | null {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    null
  );
}

async function loadOwned(bemFallId: string, massnahmeId: string) {
  return prisma.bemMassnahme.findFirst({
    where: { id: massnahmeId, bemFallId },
    select: { id: true },
  });
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string; massnahmeId: string }> },
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }
    const { id, massnahmeId } = await context.params;
    if (!(await canMutateBemContent(session, id))) {
      return NextResponse.json({ error: "Fall nicht gefunden" }, { status: 404 });
    }
    if (!(await loadOwned(id, massnahmeId))) {
      return NextResponse.json({ error: "Maßnahme nicht gefunden" }, { status: 404 });
    }
    // Nach Widerruf der tragenden Einwilligung keine inhaltliche Bearbeitung mehr.
    if (await istVerarbeitungGesperrt(id)) {
      return NextResponse.json(
        { error: "Einwilligung widerrufen — Maßnahmen können nicht mehr bearbeitet werden." },
        { status: 409 },
      );
    }

    const body = await request.json().catch(() => null);
    const parsed = updateMassnahmeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0].message },
        { status: 400 },
      );
    }
    const d = parsed.data;

    const data: Prisma.BemMassnahmeUpdateInput = {};
    if (d.kategorie !== undefined) data.kategorie = d.kategorie;
    if (d.beschreibung !== undefined) data.beschreibung = encryptBem(d.beschreibung);
    if (d.zustaendig !== undefined) data.zustaendig = d.zustaendig;
    if (d.frist !== undefined) data.frist = d.frist ? new Date(d.frist) : null;
    if (d.status !== undefined) data.status = d.status;
    if (d.evaluationAm !== undefined) {
      data.evaluationAm = d.evaluationAm ? new Date(d.evaluationAm) : null;
    }

    await prisma.bemMassnahme.update({ where: { id: massnahmeId }, data });

    await logBemAudit({
      bemFallId: id,
      userId: session.userId,
      action: BEM_AUDIT_ACTIONS.MASSNAHME_AKTUALISIERT,
      details: { massnahmeId, status: d.status },
      ipAddress: clientIp(request),
    });

    return NextResponse.json({ data: { id: massnahmeId } });
  } catch (error) {
    console.error("[API] BEM Massnahme PATCH fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string; massnahmeId: string }> },
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }
    const { id, massnahmeId } = await context.params;
    if (!(await canMutateBemContent(session, id))) {
      return NextResponse.json({ error: "Fall nicht gefunden" }, { status: 404 });
    }
    if (!(await loadOwned(id, massnahmeId))) {
      return NextResponse.json({ error: "Maßnahme nicht gefunden" }, { status: 404 });
    }

    await prisma.bemMassnahme.delete({ where: { id: massnahmeId } });

    await logBemAudit({
      bemFallId: id,
      userId: session.userId,
      action: BEM_AUDIT_ACTIONS.MASSNAHME_GELOESCHT,
      details: { massnahmeId },
      ipAddress: clientIp(request),
    });

    return NextResponse.json({ data: { ok: true } });
  } catch (error) {
    console.error("[API] BEM Massnahme DELETE fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
