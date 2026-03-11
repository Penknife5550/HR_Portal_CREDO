/**
 * API: /api/vorlagen
 *
 * GET – Alle Formularvorlagen auflisten
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

// =============================================
// GET /api/vorlagen – Alle Vorlagen auflisten
// =============================================
export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "Nicht authentifiziert" },
        { status: 401 }
      );
    }

    const templates = await prisma.formTemplate.findMany({
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ data: templates });
  } catch (error) {
    console.error("Fehler beim Laden der Vorlagen:", error);
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}
