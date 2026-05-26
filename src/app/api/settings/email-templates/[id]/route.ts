/**
 * API: /api/settings/email-templates/[id]
 *
 * PUT – E-Mail-Vorlage speichern (upsert per Event-Typ)
 *
 * Berechtigung: SUPER_ADMIN, HR_LEITUNG
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { DEFAULT_EMAIL_TEMPLATES } from "@/lib/default-email-templates";

const ALLOWED_ROLES = ["SUPER_ADMIN", "HR_LEITUNG"];

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    if (!ALLOWED_ROLES.includes(session.role)) return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });

    const { id } = await params;
    const body = await request.json();
    const { event, subject, bodyHtml, bodyText, isActive } = body;

    if (!event?.trim()) return NextResponse.json({ error: "Event ist ein Pflichtfeld" }, { status: 400 });
    if (!subject?.trim()) return NextResponse.json({ error: "Betreff ist ein Pflichtfeld" }, { status: 400 });
    if (!bodyHtml?.trim()) return NextResponse.json({ error: "HTML-Body ist ein Pflichtfeld" }, { status: 400 });

    // Variablen für dieses Event aus Default-Template holen
    const defaultTemplate = DEFAULT_EMAIL_TEMPLATES.find((t) => t.event === event);
    const variables = defaultTemplate?.variables ?? [];

    // Upsert per Event (nicht per ID, da Default-IDs "default-..." sind)
    const template = await prisma.emailTemplate.upsert({
      where: { event: event.trim() },
      update: {
        subject: subject.trim(),
        bodyHtml: bodyHtml.trim(),
        bodyText: bodyText?.trim() || null,
        isActive: isActive !== false,
        variables,
      },
      create: {
        event: event.trim(),
        name: defaultTemplate?.name ?? event.trim(),
        subject: subject.trim(),
        bodyHtml: bodyHtml.trim(),
        bodyText: bodyText?.trim() || null,
        isActive: isActive !== false,
        variables,
      },
    });

    // Falls ID "default-..." uebergeben wurde: echte DB-ID liefern
    return NextResponse.json({ data: template });
  } catch (error) {
    console.error("[API] E-Mail-Vorlage speichern fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
