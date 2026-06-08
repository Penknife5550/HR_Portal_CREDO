/**
 * API: /api/bem/[id]  (BEM-Fall-Inhalte)
 *
 * GET – Inhalte eines Falls. Streng zugriffsgeschuetzt (canAccessBemContent):
 *       ohne aktive BemZugriff-Freigabe -> 404 (Existenz nicht leaken), auch
 *       fuer SUPER_ADMIN/HR_LEITUNG. JEDER Lesezugriff schreibt einen
 *       AuditLog-Eintrag (BEM_AKTE_GEOEFFNET) — Nachweis "wer sah wann hinein".
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canAccessBemContent } from "@/lib/permissions";
import { logBemAudit, BEM_AUDIT_ACTIONS } from "@/lib/bem-audit";

function clientIp(req: NextRequest): string | null {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    null
  );
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }
    const { id } = await context.params;

    // Versiegelte Akte: ohne Freigabe -> 404 (kein Leak der Existenz).
    if (!(await canAccessBemContent(session, id))) {
      return NextResponse.json({ error: "Fall nicht gefunden" }, { status: 404 });
    }

    const fall = await prisma.bemFall.findUnique({
      where: { id },
      include: {
        organization: {
          select: { id: true, name: true, mandantNumber: true, type: true },
        },
        zugriffe: {
          where: { revokedAt: null },
          include: {
            user: { select: { id: true, firstName: true, lastName: true, email: true } },
          },
          orderBy: { grantedAt: "asc" },
        },
        kommunikation: {
          orderBy: { gesendetAm: "desc" },
          include: {
            gesendetBy: { select: { firstName: true, lastName: true } },
          },
        },
        auditLogs: {
          orderBy: { createdAt: "desc" },
          take: 100,
          include: { user: { select: { firstName: true, lastName: true } } },
        },
        _count: {
          select: {
            gespraeche: true,
            massnahmen: true,
            dokumente: true,
            einwilligungen: true,
            fristen: true,
          },
        },
      },
    });
    if (!fall) {
      return NextResponse.json({ error: "Fall nicht gefunden" }, { status: 404 });
    }

    // Lese-Audit (Compliance): jeder Zugriff wird protokolliert.
    await logBemAudit({
      bemFallId: id,
      userId: session.userId,
      action: BEM_AUDIT_ACTIONS.AKTE_GEOEFFNET,
      ipAddress: clientIp(request),
    });

    return NextResponse.json({ data: fall });
  } catch (error) {
    console.error("[API] BEM [id] GET fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
