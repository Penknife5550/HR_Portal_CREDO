/**
 * API: POST /api/bem/[id]/gespraeche — BEM-Gespraech anlegen.
 *
 * Versiegelte Akte: Zugriff via canAccessBemContent (kein Rollen-Bypass).
 * Freitext (notizen) wird mit BEM_ENCRYPTION_KEY verschluesselt gespeichert.
 * Das Audit-Detail enthaelt KEINE Inhalte (nur Typ + ID).
 */

import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canAccessBemContent } from "@/lib/permissions";
import { encryptBem } from "@/lib/encryption";
import { logBemAudit, BEM_AUDIT_ACTIONS } from "@/lib/bem-audit";
import { createGespraechSchema } from "@/lib/validations/bem";

function clientIp(req: NextRequest): string | null {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    null
  );
}

export async function POST(
  request: NextRequest,
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

    const body = await request.json().catch(() => null);
    const parsed = createGespraechSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0].message },
        { status: 400 },
      );
    }
    const d = parsed.data;

    const gespraech = await prisma.bemGespraech.create({
      data: {
        bemFallId: id,
        typ: d.typ,
        datum: d.datum ? new Date(d.datum) : null,
        ort: d.ort ?? null,
        teilnehmer: (d.teilnehmer ?? undefined) as Prisma.InputJsonValue | undefined,
        notizen: d.notizen ? encryptBem(d.notizen) : null,
        checkliste: (d.checkliste ?? undefined) as Prisma.InputJsonValue | undefined,
        naechsterTermin: d.naechsterTermin ? new Date(d.naechsterTermin) : null,
        createdById: session.userId,
      },
      select: { id: true },
    });

    await logBemAudit({
      bemFallId: id,
      userId: session.userId,
      action: BEM_AUDIT_ACTIONS.GESPRAECH_ERFASST,
      details: { gespraechId: gespraech.id, typ: d.typ },
      ipAddress: clientIp(request),
    });

    return NextResponse.json({ data: { id: gespraech.id } }, { status: 201 });
  } catch (error) {
    console.error("[API] BEM Gespraech POST fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
