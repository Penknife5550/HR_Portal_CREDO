/**
 * API: /api/schulferien/[id]
 *
 * PATCH  – Eintrag bearbeiten (ADMIN_ROLES)
 * DELETE – Eintrag loeschen (ADMIN_ROLES)
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { ADMIN_ROLES } from "@/lib/permissions";

const patchSchema = z
  .object({
    bezeichnung: z.string().min(1).max(200).optional(),
    von: z.string().regex(/^\d{4}-\d{2}-\d{2}/).optional(),
    bis: z.string().regex(/^\d{4}-\d{2}-\d{2}/).optional(),
    ferienTyp: z.enum(["SOMMER", "SONSTIGE"]).optional(),
    schuljahr: z.string().min(1).max(20).optional(),
    aktiv: z.boolean().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, "Mindestens ein Feld erforderlich");

export async function PATCH(
  request: NextRequest,
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
    const body = await request.json().catch(() => null);
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0].message },
        { status: 400 },
      );
    }

    const existing = await prisma.schulferienNRW.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: "Ferien-Eintrag nicht gefunden" },
        { status: 404 },
      );
    }

    const data: Record<string, unknown> = {};
    if (parsed.data.bezeichnung !== undefined)
      data.bezeichnung = parsed.data.bezeichnung;
    if (parsed.data.von !== undefined) data.von = new Date(parsed.data.von);
    if (parsed.data.bis !== undefined) data.bis = new Date(parsed.data.bis);
    if (parsed.data.ferienTyp !== undefined) data.ferienTyp = parsed.data.ferienTyp;
    if (parsed.data.schuljahr !== undefined) data.schuljahr = parsed.data.schuljahr;
    if (parsed.data.aktiv !== undefined) data.aktiv = parsed.data.aktiv;

    const ferien = await prisma.schulferienNRW.update({
      where: { id },
      data,
    });
    return NextResponse.json({ data: ferien });
  } catch (error) {
    console.error("[API] schulferien PATCH fehlgeschlagen:", error);
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
    const existing = await prisma.schulferienNRW.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: "Ferien-Eintrag nicht gefunden" },
        { status: 404 },
      );
    }
    await prisma.schulferienNRW.delete({ where: { id } });
    return NextResponse.json({ data: { ok: true } });
  } catch (error) {
    console.error("[API] schulferien DELETE fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
