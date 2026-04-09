/**
 * API: /api/mutterschutz/[id]
 *
 * GET    – Detail eines Mutterschutz-Vorgangs
 * PATCH  – Status / Felder aktualisieren
 * DELETE – Loeschen (nur Status GEMELDET, nur HR_LEITUNG/SUPER_ADMIN)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import {
  ADMIN_ROLES,
  HR_EDIT_ROLES,
  PORTAL_ROLES,
  canAccessProcess,
} from "@/lib/permissions";
import { updateMutterschutzSchema } from "@/lib/validations/elternzeit";
import { berechneMutterschutzEnde } from "@/lib/elternzeit-helpers";

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
    const ms = await prisma.mutterschutzProzess.findUnique({
      where: { id },
      include: {
        organization: true,
        checklistItems: { orderBy: { orderIndex: "asc" } },
        dokumente: { orderBy: { hochgeladenAm: "desc" } },
        notizen: { orderBy: { createdAt: "desc" } },
        elternzeitProzesse: {
          select: {
            id: true,
            displayId: true,
            status: true,
            geschlecht: true,
            personalgruppe: true,
          },
        },
      },
    });

    if (!ms) {
      return NextResponse.json({ error: "Vorgang nicht gefunden" }, { status: 404 });
    }
    if (!(await canAccessProcess(session, ms.organizationId))) {
      return NextResponse.json({ error: "Vorgang nicht gefunden" }, { status: 404 });
    }
    return NextResponse.json({ data: ms });
  } catch (error) {
    console.error("[API] Mutterschutz GET[id] fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }
    if (!HR_EDIT_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    }

    const { id } = await params;
    const ms = await prisma.mutterschutzProzess.findUnique({ where: { id } });
    if (!ms) {
      return NextResponse.json({ error: "Vorgang nicht gefunden" }, { status: 404 });
    }
    if (!(await canAccessProcess(session, ms.organizationId))) {
      return NextResponse.json({ error: "Vorgang nicht gefunden" }, { status: 404 });
    }

    const body = await request.json().catch(() => null);
    const parsed = updateMutterschutzSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0].message },
        { status: 400 },
      );
    }

    const data: Record<string, unknown> = { ...parsed.data };
    // Konvertierungen
    if (parsed.data.voraussGeburt) {
      data.voraussGeburt = new Date(parsed.data.voraussGeburt);
    }
    if (parsed.data.tatsGeburt !== undefined) {
      data.tatsGeburt = parsed.data.tatsGeburt
        ? new Date(parsed.data.tatsGeburt)
        : null;
    }
    if (parsed.data.badBeauftragtAm !== undefined) {
      data.badBeauftragtAm = parsed.data.badBeauftragtAm
        ? new Date(parsed.data.badBeauftragtAm)
        : null;
    }
    if (parsed.data.badAbgeschlossenAm !== undefined) {
      data.badAbgeschlossenAm = parsed.data.badAbgeschlossenAm
        ? new Date(parsed.data.badAbgeschlossenAm)
        : null;
    }
    if (parsed.data.lohnbeschKkErstelltAm !== undefined) {
      data.lohnbeschKkErstelltAm = parsed.data.lohnbeschKkErstelltAm
        ? new Date(parsed.data.lohnbeschKkErstelltAm)
        : null;
    }

    // Wenn tatsaechliche Geburt erfasst wird, Mutterschutz-Ende berechnen
    if (data.tatsGeburt instanceof Date) {
      data.mutterschutzEnde = berechneMutterschutzEnde(
        data.tatsGeburt,
        (data.fruehgeburt as boolean | undefined) ?? ms.fruehgeburt,
        (data.mehrlinge as boolean | undefined) ?? ms.mehrlinge,
      );
    }

    const updated = await prisma.mutterschutzProzess.update({
      where: { id },
      data,
      include: {
        organization: true,
        checklistItems: { orderBy: { orderIndex: "asc" } },
      },
    });

    await prisma.auditLog.create({
      data: {
        mutterschutzId: id,
        userId: session.userId,
        processType: "MUTTERSCHUTZ",
        action: "MUTTERSCHUTZ_UPDATED",
        details: { fields: Object.keys(parsed.data) },
      },
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error("[API] Mutterschutz PATCH fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }
    if (!ADMIN_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    }

    const { id } = await params;
    const ms = await prisma.mutterschutzProzess.findUnique({ where: { id } });
    if (!ms) {
      return NextResponse.json({ error: "Vorgang nicht gefunden" }, { status: 404 });
    }
    if (!(await canAccessProcess(session, ms.organizationId))) {
      return NextResponse.json({ error: "Vorgang nicht gefunden" }, { status: 404 });
    }
    if (ms.status !== "GEMELDET") {
      return NextResponse.json(
        { error: "Loeschen nur im Status GEMELDET moeglich" },
        { status: 409 },
      );
    }

    await prisma.mutterschutzProzess.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[API] Mutterschutz DELETE fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
