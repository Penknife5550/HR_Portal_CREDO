/**
 * API: /api/schulferien
 *
 * GET   – Alle Schulferien-Eintraege auflisten (PORTAL_ROLES)
 * POST  – Neuen Eintrag anlegen (ADMIN_ROLES)
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { ADMIN_ROLES, PORTAL_ROLES } from "@/lib/permissions";

const createSchema = z.object({
  bezeichnung: z.string().min(1).max(200),
  von: z.string().regex(/^\d{4}-\d{2}-\d{2}/),
  bis: z.string().regex(/^\d{4}-\d{2}-\d{2}/),
  ferienTyp: z.enum(["SOMMER", "SONSTIGE"]),
  schuljahr: z.string().min(1).max(20),
  aktiv: z.boolean().default(true),
});

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }
    if (!PORTAL_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    }

    const ferien = await prisma.schulferienNRW.findMany({
      orderBy: { von: "asc" },
    });
    return NextResponse.json({ data: ferien });
  } catch (error) {
    console.error("[API] schulferien GET fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }
    if (!ADMIN_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0].message },
        { status: 400 },
      );
    }

    const von = new Date(parsed.data.von);
    const bis = new Date(parsed.data.bis);
    if (bis < von) {
      return NextResponse.json(
        { error: "Bis-Datum muss nach Von-Datum liegen" },
        { status: 400 },
      );
    }

    const ferien = await prisma.schulferienNRW.create({
      data: {
        bezeichnung: parsed.data.bezeichnung,
        von,
        bis,
        ferienTyp: parsed.data.ferienTyp,
        schuljahr: parsed.data.schuljahr,
        aktiv: parsed.data.aktiv,
      },
    });

    return NextResponse.json({ data: ferien });
  } catch (error) {
    console.error("[API] schulferien POST fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
