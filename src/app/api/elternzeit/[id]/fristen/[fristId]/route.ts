/**
 * API: /api/elternzeit/[id]/fristen/[fristId]
 *
 * PATCH  – Frist als erledigt markieren / Erledigung-Text setzen.
 * DELETE – Frist loeschen (HR_EDIT_ROLES).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { HR_EDIT_ROLES, canAccessProcess } from "@/lib/permissions";

const patchSchema = z.object({
  erledigt: z.boolean(),
  erledigung: z.string().max(2000).optional().nullable(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; fristId: string }> },
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }
    if (!HR_EDIT_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    }

    const { id, fristId } = await params;
    const body = await request.json().catch(() => null);
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0].message },
        { status: 400 },
      );
    }

    const existing = await prisma.elternzeitFrist.findUnique({
      where: { id: fristId },
      include: { elternzeit: { select: { organizationId: true } } },
    });
    if (!existing || existing.elternzeitId !== id) {
      return NextResponse.json({ error: "Frist nicht gefunden" }, { status: 404 });
    }
    if (!(await canAccessProcess(session, existing.elternzeit.organizationId))) {
      return NextResponse.json({ error: "Frist nicht gefunden" }, { status: 404 });
    }

    const updated = await prisma.elternzeitFrist.update({
      where: { id: fristId },
      data: {
        erledigtAm: parsed.data.erledigt ? new Date() : null,
        erledigtVon: parsed.data.erledigt
          ? `${session.firstName} ${session.lastName}`
          : null,
        erledigung: parsed.data.erledigung ?? null,
      },
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error("[API] elternzeit/fristen PATCH fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; fristId: string }> },
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }
    if (!HR_EDIT_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    }

    const { id, fristId } = await params;
    const existing = await prisma.elternzeitFrist.findUnique({
      where: { id: fristId },
      include: { elternzeit: { select: { organizationId: true } } },
    });
    if (!existing || existing.elternzeitId !== id) {
      return NextResponse.json({ error: "Frist nicht gefunden" }, { status: 404 });
    }
    if (!(await canAccessProcess(session, existing.elternzeit.organizationId))) {
      return NextResponse.json({ error: "Frist nicht gefunden" }, { status: 404 });
    }

    await prisma.elternzeitFrist.delete({ where: { id: fristId } });
    return NextResponse.json({ data: { ok: true } });
  } catch (error) {
    console.error("[API] elternzeit/fristen DELETE fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
