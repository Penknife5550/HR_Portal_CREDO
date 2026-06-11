/**
 * API: /api/settings/api-keys/[id]
 *
 * PATCH  – API-Key aktivieren/deaktivieren oder umbenennen
 * DELETE – API-Key endgueltig loeschen
 *
 * Berechtigung: SUPER_ADMIN
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

const ALLOWED_ROLES = ["SUPER_ADMIN"];

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    if (!ALLOWED_ROLES.includes(session.role)) return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });

    const { id } = await params;
    const body = await request.json();

    const existing = await prisma.apiKey.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "API-Key nicht gefunden" }, { status: 404 });

    const updated = await prisma.apiKey.update({
      where: { id },
      data: {
        ...(typeof body.isActive === "boolean" ? { isActive: body.isActive } : {}),
        ...(typeof body.name === "string" && body.name.trim() ? { name: body.name.trim() } : {}),
      },
      select: {
        id: true,
        name: true,
        prefix: true,
        scopes: true,
        isActive: true,
        lastUsedAt: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error("[API] API-Key aktualisieren fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    if (!ALLOWED_ROLES.includes(session.role)) return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });

    const { id } = await params;
    const existing = await prisma.apiKey.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "API-Key nicht gefunden" }, { status: 404 });

    await prisma.apiKey.delete({ where: { id } });

    await prisma.auditLog.create({
      data: {
        userId: session.userId,
        processType: "SYSTEM",
        action: "API_KEY_DELETED",
        details: { apiKeyId: id, name: existing.name },
      },
    });

    return NextResponse.json({ data: { deleted: true } });
  } catch (error) {
    console.error("[API] API-Key loeschen fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
