/**
 * API: /api/mutterschutz/[id]/checkliste/[itemId]
 *
 * PATCH – Item als erledigt / nicht erledigt markieren
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { CHECKLIST_ROLES } from "@/lib/permissions";
import { checklistUpdateSchema } from "@/lib/validations/elternzeit";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }
    if (!CHECKLIST_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    }

    const { id, itemId } = await params;
    const body = await request.json().catch(() => null);
    const parsed = checklistUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0].message },
        { status: 400 },
      );
    }

    const item = await prisma.mutterschutzChecklistItem.findFirst({
      where: { id: itemId, mutterschutzId: id },
    });
    if (!item) {
      return NextResponse.json({ error: "Item nicht gefunden" }, { status: 404 });
    }

    const updated = await prisma.mutterschutzChecklistItem.update({
      where: { id: itemId },
      data: {
        erledigtAm: parsed.data.erledigt ? new Date() : null,
        erledigtVon: parsed.data.erledigt
          ? `${session.firstName} ${session.lastName}`
          : null,
      },
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error("[API] Mutterschutz Checklist PATCH fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
