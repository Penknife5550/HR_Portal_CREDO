/**
 * API: /api/elternzeit/[id]
 *
 * GET    – Detail eines Elternzeit-Vorgangs
 * PATCH  – Status / Felder aktualisieren
 * DELETE – Loeschen (nur Status ANGELEGT, nur Admin)
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
import { updateElternzeitSchema } from "@/lib/validations/elternzeit";

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
    const ez = await prisma.elternzeitProzess.findUnique({
      where: { id },
      include: {
        organization: true,
        mutterschutz: {
          select: {
            id: true,
            displayId: true,
            status: true,
            mutterschutzBeginn: true,
            mutterschutzEnde: true,
          },
        },
        abschnitte: { orderBy: { abschnittNr: "asc" } },
        checklistItems: { orderBy: [{ phase: "asc" }, { orderIndex: "asc" }] },
        dokumente: { orderBy: { hochgeladenAm: "desc" } },
        notizen: { orderBy: { createdAt: "desc" } },
      },
    });

    if (!ez) {
      return NextResponse.json({ error: "Vorgang nicht gefunden" }, { status: 404 });
    }
    // IDOR-Schutz: Mandant-Scope pruefen (404 statt 403 — kein Info-Leak)
    if (!(await canAccessProcess(session, ez.organizationId))) {
      return NextResponse.json({ error: "Vorgang nicht gefunden" }, { status: 404 });
    }
    return NextResponse.json({ data: ez });
  } catch (error) {
    console.error("[API] Elternzeit GET[id] fehlgeschlagen:", error);
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

    const body = await request.json().catch(() => null);
    const parsed = updateElternzeitSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0].message },
        { status: 400 },
      );
    }

    const data: Record<string, unknown> = { ...parsed.data };
    if (parsed.data.kindGeburtsdatum !== undefined) {
      data.kindGeburtsdatum = parsed.data.kindGeburtsdatum
        ? new Date(parsed.data.kindGeburtsdatum)
        : null;
    }

    const ipAddress =
      request.headers.get("x-forwarded-for") ||
      request.headers.get("x-real-ip") ||
      null;

    const updated = await prisma.elternzeitProzess.update({
      where: { id },
      data,
      include: {
        organization: true,
        abschnitte: { orderBy: { abschnittNr: "asc" } },
        checklistItems: { orderBy: [{ phase: "asc" }, { orderIndex: "asc" }] },
      },
    });

    await prisma.auditLog.create({
      data: {
        elternzeitId: id,
        userId: session.userId,
        processType: "ELTERNZEIT",
        action: "ELTERNZEIT_UPDATED",
        details: { fields: Object.keys(parsed.data) },
        ipAddress,
      },
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error("[API] Elternzeit PATCH fehlgeschlagen:", error);
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
    const ez = await prisma.elternzeitProzess.findUnique({
      where: { id },
      select: { id: true, status: true, organizationId: true },
    });
    if (!ez) {
      return NextResponse.json({ error: "Vorgang nicht gefunden" }, { status: 404 });
    }
    // IDOR-Schutz: Mandant-Scope pruefen
    if (!(await canAccessProcess(session, ez.organizationId))) {
      return NextResponse.json({ error: "Vorgang nicht gefunden" }, { status: 404 });
    }
    if (ez.status !== "ANGELEGT") {
      return NextResponse.json(
        { error: "Loeschen nur im Status ANGELEGT moeglich" },
        { status: 409 },
      );
    }

    await prisma.elternzeitProzess.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[API] Elternzeit DELETE fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
