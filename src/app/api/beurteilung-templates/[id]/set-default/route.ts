/**
 * API: /api/beurteilung-templates/[id]/set-default
 *
 * POST – Diese Vorlage als Standard im jeweiligen Scope (global oder pro Mandant)
 *        setzen. Vorheriger Default im selben Scope wird auf isDefault: false gesetzt.
 *
 * Auth: SUPER_ADMIN, HR_LEITUNG
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

const ALLOWED_ROLES = ["SUPER_ADMIN", "HR_LEITUNG"];

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, context: RouteContext) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "Nicht authentifiziert" },
        { status: 401 },
      );
    }
    if (!ALLOWED_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    }

    const { id } = await context.params;

    const target = await prisma.beurteilungTemplate.findUnique({
      where: { id },
      select: { id: true, isActive: true, organizationId: true },
    });
    if (!target) {
      return NextResponse.json(
        { error: "Vorlage nicht gefunden" },
        { status: 404 },
      );
    }
    if (!target.isActive) {
      return NextResponse.json(
        { error: "Deaktivierte Vorlagen können nicht als Standard gesetzt werden" },
        { status: 400 },
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      // Alle anderen im selben Scope auf isDefault: false
      await tx.beurteilungTemplate.updateMany({
        where: {
          organizationId: target.organizationId,
          isDefault: true,
          id: { not: id },
        },
        data: { isDefault: false },
      });

      return tx.beurteilungTemplate.update({
        where: { id },
        data: { isDefault: true },
        include: {
          organization: {
            select: { id: true, name: true, mandantNumber: true },
          },
        },
      });
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error("Fehler beim Setzen des Beurteilungs-Vorlagen-Defaults:", error);
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 },
    );
  }
}
