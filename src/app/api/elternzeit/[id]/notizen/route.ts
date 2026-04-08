/**
 * API: /api/elternzeit/[id]/notizen
 *
 * GET  – Notizen-Liste
 * POST – Notiz hinzufuegen
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { PORTAL_ROLES, canAccessProcess } from "@/lib/permissions";
import { noteSchema } from "@/lib/validations/elternzeit";

export async function GET(
  _request: NextRequest,
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
    // IDOR-Schutz: Mandant-Scope pruefen
    const ez = await prisma.elternzeitProzess.findUnique({
      where: { id },
      select: { id: true, organizationId: true },
    });
    if (!ez) {
      return NextResponse.json({ error: "Vorgang nicht gefunden" }, { status: 404 });
    }
    if (!(await canAccessProcess(session, ez.organizationId))) {
      return NextResponse.json({ error: "Vorgang nicht gefunden" }, { status: 404 });
    }
    const notizen = await prisma.elternzeitNotiz.findMany({
      where: { elternzeitId: id },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ data: notizen });
  } catch (error) {
    console.error("[API] Elternzeit Notizen GET fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
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

    const ez = await prisma.elternzeitProzess.findUnique({
      where: { id },
      select: { id: true, organizationId: true },
    });
    if (!ez) {
      return NextResponse.json({ error: "Vorgang nicht gefunden" }, { status: 404 });
    }
    // IDOR-Schutz: Mandant-Scope pruefen
    if (!(await canAccessProcess(session, ez.organizationId))) {
      return NextResponse.json({ error: "Vorgang nicht gefunden" }, { status: 404 });
    }

    const notiz = await prisma.elternzeitNotiz.create({
      data: {
        elternzeitId: id,
        text: parsed.data.text,
        erstelltVon: `${session.firstName} ${session.lastName}`,
      },
    });

    return NextResponse.json({ data: notiz }, { status: 201 });
  } catch (error) {
    console.error("[API] Elternzeit Notiz POST fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
