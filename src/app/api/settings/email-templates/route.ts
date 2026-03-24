/**
 * API: /api/settings/email-templates
 *
 * GET – Alle E-Mail-Vorlagen laden
 *       Falls noch keine vorhanden: Standard-Vorlagen aus Code liefern
 *
 * Berechtigung: SUPER_ADMIN, HR_LEITUNG
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { DEFAULT_EMAIL_TEMPLATES } from "@/lib/default-email-templates";

const ALLOWED_ROLES = ["SUPER_ADMIN", "HR_LEITUNG"];

export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    if (!ALLOWED_ROLES.includes(session.role)) return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });

    const dbTemplates = await prisma.emailTemplate.findMany({
      orderBy: { event: "asc" },
    });

    // Fehlende Vorlagen durch Defaults ersetzen (ohne DB-Eintrag anzulegen)
    const allTemplates = DEFAULT_EMAIL_TEMPLATES.map((def) => {
      const found = dbTemplates.find((t) => t.event === def.event);
      return found ?? { ...def, id: `default-${def.event}`, isActive: true, createdAt: new Date(), updatedAt: new Date() };
    });

    return NextResponse.json({ data: allTemplates });
  } catch (error) {
    console.error("[API] E-Mail-Vorlagen laden fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
