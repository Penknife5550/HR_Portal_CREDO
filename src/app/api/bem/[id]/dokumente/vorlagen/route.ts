/**
 * API: GET /api/bem/[id]/dokumente/vorlagen
 *
 * Liefert die verfuegbaren BEM-Vorlagen (DocumentTemplate, modul=BEM) fuer den
 * Fall — global oder auf den Mandanten des Falls beschraenkt. Versiegelte Akte:
 * Zugriff via canAccessBemContent (kein HR_EDIT-Gating wie beim E0-Endpunkt).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canAccessBemContent } from "@/lib/permissions";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }
    const { id } = await context.params;
    if (!(await canAccessBemContent(session, id))) {
      return NextResponse.json({ error: "Fall nicht gefunden" }, { status: 404 });
    }

    const fall = await prisma.bemFall.findUnique({
      where: { id },
      select: { organizationId: true },
    });
    if (!fall) {
      return NextResponse.json({ error: "Fall nicht gefunden" }, { status: 404 });
    }

    const vorlagen = await prisma.documentTemplate.findMany({
      where: {
        modul: "BEM",
        isActive: true,
        OR: [{ organizationId: null }, { organizationId: fall.organizationId }],
      },
      select: { id: true, name: true, platzhalter: true },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ data: vorlagen });
  } catch (error) {
    console.error("[API] BEM Vorlagen GET fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
