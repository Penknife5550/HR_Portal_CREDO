/**
 * API: /api/bem/[id]/gespraeche/[gespraechId]
 *
 * PATCH  – Gespraech aktualisieren (Datum, Ort, Teilnehmer, Notizen, Checkliste).
 * DELETE – Gespraech loeschen.
 *
 * Versiegelte Akte: Zugriff via canAccessBemContent. Notizen verschluesselt.
 */

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canMutateBemContent } from "@/lib/permissions";
import { encryptBem } from "@/lib/encryption";
import { logBemAudit, BEM_AUDIT_ACTIONS } from "@/lib/bem-audit";
import { updateGespraechSchema } from "@/lib/validations/bem";
import { istVerarbeitungGesperrt } from "@/lib/bem-einwilligung";

function clientIp(req: NextRequest): string | null {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    null
  );
}

async function loadOwned(bemFallId: string, gespraechId: string) {
  return prisma.bemGespraech.findFirst({
    where: { id: gespraechId, bemFallId },
    select: { id: true },
  });
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string; gespraechId: string }> },
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }
    const { id, gespraechId } = await context.params;
    if (!(await canMutateBemContent(session, id))) {
      return NextResponse.json({ error: "Fall nicht gefunden" }, { status: 404 });
    }
    if (!(await loadOwned(id, gespraechId))) {
      return NextResponse.json({ error: "Gespräch nicht gefunden" }, { status: 404 });
    }
    // Nach Widerruf der tragenden Einwilligung keine inhaltliche Bearbeitung mehr.
    if (await istVerarbeitungGesperrt(id)) {
      return NextResponse.json(
        { error: "Einwilligung widerrufen — Gespräche können nicht mehr bearbeitet werden." },
        { status: 409 },
      );
    }

    const body = await request.json().catch(() => null);
    const parsed = updateGespraechSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0].message },
        { status: 400 },
      );
    }
    const d = parsed.data;

    // Nur uebergebene Felder aendern.
    const data: Prisma.BemGespraechUpdateInput = {};
    if (d.datum !== undefined) data.datum = d.datum ? new Date(d.datum) : null;
    if (d.ort !== undefined) data.ort = d.ort;
    if (d.teilnehmer !== undefined) {
      data.teilnehmer = (d.teilnehmer ?? Prisma.JsonNull) as Prisma.InputJsonValue;
    }
    if (d.notizen !== undefined) {
      data.notizen = d.notizen ? encryptBem(d.notizen) : null;
    }
    if (d.checkliste !== undefined) {
      data.checkliste = (d.checkliste ?? Prisma.JsonNull) as Prisma.InputJsonValue;
    }
    if (d.naechsterTermin !== undefined) {
      data.naechsterTermin = d.naechsterTermin ? new Date(d.naechsterTermin) : null;
    }

    await prisma.bemGespraech.update({ where: { id: gespraechId }, data });

    await logBemAudit({
      bemFallId: id,
      userId: session.userId,
      action: BEM_AUDIT_ACTIONS.GESPRAECH_AKTUALISIERT,
      details: { gespraechId },
      ipAddress: clientIp(request),
    });

    return NextResponse.json({ data: { id: gespraechId } });
  } catch (error) {
    console.error("[API] BEM Gespraech PATCH fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string; gespraechId: string }> },
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }
    const { id, gespraechId } = await context.params;
    if (!(await canMutateBemContent(session, id))) {
      return NextResponse.json({ error: "Fall nicht gefunden" }, { status: 404 });
    }
    if (!(await loadOwned(id, gespraechId))) {
      return NextResponse.json({ error: "Gespräch nicht gefunden" }, { status: 404 });
    }

    await prisma.bemGespraech.delete({ where: { id: gespraechId } });

    await logBemAudit({
      bemFallId: id,
      userId: session.userId,
      action: BEM_AUDIT_ACTIONS.GESPRAECH_GELOESCHT,
      details: { gespraechId },
      ipAddress: clientIp(request),
    });

    return NextResponse.json({ data: { ok: true } });
  } catch (error) {
    console.error("[API] BEM Gespraech DELETE fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
