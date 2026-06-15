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
import { EMAIL_PATTERN } from "@/lib/mailer";

const ALLOWED_ROLES = ["SUPER_ADMIN", "HR_LEITUNG"];

const VARIABLE_PATTERN = /^\{\{\w+\}\}$/;

/** Liefert den ersten ungueltigen Eintrag, sonst null */
function validateRecipientField(value: unknown): string | null {
  if (value == null || typeof value !== "string" || !value.trim()) return null;
  for (const entry of value.split(",").map((e) => e.trim()).filter(Boolean)) {
    if (!EMAIL_PATTERN.test(entry) && !VARIABLE_PATTERN.test(entry)) {
      return entry;
    }
  }
  return null;
}

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
    const { event, subject, bodyHtml, bodyText, isActive, recipientTo, recipientCc, recipientBcc, recipientReplyTo } = body;

    if (!event?.trim()) return NextResponse.json({ error: "Event ist ein Pflichtfeld" }, { status: 400 });
    if (!subject?.trim()) return NextResponse.json({ error: "Betreff ist ein Pflichtfeld" }, { status: 400 });
    if (!bodyHtml?.trim()) return NextResponse.json({ error: "HTML-Body ist ein Pflichtfeld" }, { status: 400 });

    // Empfaenger-Felder pruefen: kommagetrennt, je Eintrag E-Mail oder {{variable}}
    for (const [label, value] of [
      ["An", recipientTo],
      ["CC", recipientCc],
      ["BCC", recipientBcc],
      ["Reply-To", recipientReplyTo],
    ] as const) {
      const invalid = validateRecipientField(value);
      if (invalid) {
        return NextResponse.json(
          { error: `Empfaenger-Feld "${label}": "${invalid}" ist weder eine gueltige E-Mail-Adresse noch eine {{variable}}` },
          { status: 400 }
        );
      }
    }

    // Variablen für dieses Event aus Default-Template holen
    const defaultTemplate = DEFAULT_EMAIL_TEMPLATES.find((t) => t.event === event);
    const variables = defaultTemplate?.variables ?? [];

    // Empfaenger-Felder NUR aktualisieren wenn sie im Body vorhanden sind —
    // sonst wischt ein Client ohne diese Felder konfigurierte Empfaenger weg
    const recipientData = {
      ...(typeof recipientTo === "string" ? { recipientTo: recipientTo.trim() } : {}),
      ...(typeof recipientCc === "string" ? { recipientCc: recipientCc.trim() } : {}),
      ...(typeof recipientBcc === "string" ? { recipientBcc: recipientBcc.trim() } : {}),
      ...(typeof recipientReplyTo === "string" ? { recipientReplyTo: recipientReplyTo.trim() } : {}),
    };
    const data = {
      subject: subject.trim(),
      bodyHtml: bodyHtml.trim(),
      bodyText: bodyText?.trim() || null,
      isActive: isActive !== false,
      variables,
      ...recipientData,
    };

    // Upsert per Event (nicht per ID, da Default-IDs "default-..." sind)
    const template = await prisma.emailTemplate.upsert({
      where: { event: event.trim() },
      update: data,
      create: {
        event: event.trim(),
        name: defaultTemplate?.name ?? event.trim(),
        ...data,
      },
    });

    // Audit-Trail: insbesondere Empfaenger-Aenderungen (To/CC/BCC) muessen
    // nachvollziehbar sein — darueber liessen sich sonst unbemerkt alle
    // Prozess-Mails (inkl. Magic-Links) an externe Adressen umleiten
    await prisma.auditLog.create({
      data: {
        userId: session.userId,
        processType: "SYSTEM",
        action: "EMAIL_TEMPLATE_UPDATED",
        details: {
          event: template.event,
          isActive: template.isActive,
          recipientTo: template.recipientTo,
          recipientCc: template.recipientCc,
          recipientBcc: template.recipientBcc,
          recipientReplyTo: template.recipientReplyTo,
        },
      },
    });

    // Falls ID "default-..." uebergeben wurde: echte DB-ID liefern
    return NextResponse.json({ data: template });
  } catch (error) {
    console.error("[API] E-Mail-Vorlage speichern fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
