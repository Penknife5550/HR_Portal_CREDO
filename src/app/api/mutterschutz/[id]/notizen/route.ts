/**
 * API: /api/mutterschutz/[id]/notizen
 *
 * GET  – Liste der Notizen
 * POST – Notiz hinzufuegen
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { PORTAL_ROLES } from "@/lib/permissions";
import { noteSchema } from "@/lib/validations/elternzeit";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
  }
  if (!PORTAL_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
  }

  const { id } = await params;
  const notizen = await prisma.mutterschutzNotiz.findMany({
    where: { mutterschutzId: id },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ data: notizen });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }
    if (!PORTAL_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json().catch(() => null);
    const parsed = noteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0].message },
        { status: 400 },
      );
    }

    const ms = await prisma.mutterschutzProzess.findUnique({ where: { id } });
    if (!ms) {
      return NextResponse.json({ error: "Vorgang nicht gefunden" }, { status: 404 });
    }

    const notiz = await prisma.mutterschutzNotiz.create({
      data: {
        mutterschutzId: id,
        text: parsed.data.text,
        erstelltVon: `${session.firstName} ${session.lastName}`,
      },
    });

    return NextResponse.json({ data: notiz }, { status: 201 });
  } catch (error) {
    console.error("[API] Mutterschutz Notiz POST fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
