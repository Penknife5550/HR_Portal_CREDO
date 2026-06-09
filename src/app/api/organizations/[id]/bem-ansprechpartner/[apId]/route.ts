/**
 * API: /api/organizations/[id]/bem-ansprechpartner/[apId]
 *
 * PATCH  – Ansprechpartner:in bearbeiten / (de)aktivieren.
 * DELETE – Ansprechpartner:in entfernen (nur wenn nie in einem Fall gewaehlt;
 *          sonst deaktivieren, um die Referenz/Historie zu erhalten).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { ADMIN_ROLES } from "@/lib/permissions";
import { z } from "zod";

const patchSchema = z.object({
  name: z.string().trim().min(1).max(150).optional(),
  email: z.string().trim().email("Ungültige E-Mail-Adresse").max(200).optional(),
  funktion: z.string().trim().max(150).optional().nullable(),
  isActive: z.boolean().optional(),
});

async function loadOwned(orgId: string, apId: string) {
  return prisma.bemAnsprechpartner.findFirst({
    where: { id: apId, organizationId: orgId },
    select: { id: true },
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; apId: string }> },
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }
    if (!ADMIN_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    }
    const { id, apId } = await params;
    if (!(await loadOwned(id, apId))) {
      return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
    }
    const body = await request.json().catch(() => null);
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0].message },
        { status: 400 },
      );
    }
    const updated = await prisma.bemAnsprechpartner.update({
      where: { id: apId },
      data: parsed.data,
    });
    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error("[API] bem-ansprechpartner PATCH fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; apId: string }> },
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }
    if (!ADMIN_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    }
    const { id, apId } = await params;
    if (!(await loadOwned(id, apId))) {
      return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
    }

    // Wurde die/der Ansprechpartner:in bereits in einem Fall gewaehlt, NICHT hart
    // loeschen (Referenz/Historie) — stattdessen deaktivieren.
    const verwendet = await prisma.bemFall.count({ where: { ansprechpartnerId: apId } });
    if (verwendet > 0) {
      await prisma.bemAnsprechpartner.update({
        where: { id: apId },
        data: { isActive: false },
      });
      return NextResponse.json({
        data: { deactivated: true },
        hinweis: "Bereits in Fällen verwendet — deaktiviert statt gelöscht.",
      });
    }

    await prisma.bemAnsprechpartner.delete({ where: { id: apId } });
    return NextResponse.json({ data: { deleted: true } });
  } catch (error) {
    console.error("[API] bem-ansprechpartner DELETE fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
