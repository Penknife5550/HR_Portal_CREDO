/**
 * API: /api/settings/email-templates/test
 *
 * POST – Test-E-Mail fuer eine Vorlage versenden
 *        Rendert die Vorlage mit dem Beispiel-Payload aus dem Event-Katalog,
 *        setzt das Betreff-Praefix "[TEST]" und sendet an die angegebene
 *        Adresse. Optional koennen ungespeicherte Editor-Felder mitgegeben
 *        werden, um den aktuellen Entwurf zu testen.
 *
 * Body: { event, recipientEmail, subject?, bodyHtml?, bodyText?,
 *         recipientTo?, recipientCc?, recipientBcc? }
 *
 * Berechtigung: SUPER_ADMIN, HR_LEITUNG
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sendEventEmail, EMAIL_PATTERN } from "@/lib/mailer";
import { getEventDefinition } from "@/lib/events";

const ALLOWED_ROLES = ["SUPER_ADMIN", "HR_LEITUNG"];

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    if (!ALLOWED_ROLES.includes(session.role)) return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });

    const body = await request.json();
    const { event, recipientEmail, subject, bodyHtml, bodyText, recipientTo, recipientCc, recipientBcc } = body;

    if (!event?.trim()) {
      return NextResponse.json({ error: "Event ist ein Pflichtfeld" }, { status: 400 });
    }
    if (!recipientEmail || !EMAIL_PATTERN.test(recipientEmail)) {
      return NextResponse.json({ error: "Bitte eine gueltige Empfaenger-Adresse angeben" }, { status: 400 });
    }

    const definition = getEventDefinition(event.trim());
    if (!definition) {
      return NextResponse.json({ error: `Unbekanntes Event "${event}"` }, { status: 400 });
    }

    const templateOverride: Record<string, string> = {};
    if (typeof subject === "string" && subject.trim()) templateOverride.subject = subject;
    if (typeof bodyHtml === "string" && bodyHtml.trim()) templateOverride.bodyHtml = bodyHtml;
    if (typeof bodyText === "string") templateOverride.bodyText = bodyText;
    if (typeof recipientTo === "string") templateOverride.recipientTo = recipientTo;
    if (typeof recipientCc === "string") templateOverride.recipientCc = recipientCc;
    if (typeof recipientBcc === "string") templateOverride.recipientBcc = recipientBcc;

    const result = await sendEventEmail(definition.event, definition.samplePayload, {
      isTest: true,
      overrideTo: recipientEmail,
      templateOverride: Object.keys(templateOverride).length > 0 ? templateOverride : undefined,
    });

    if (result.status === "SENT") {
      return NextResponse.json({
        data: { success: true, message: `Test-E-Mail an ${recipientEmail} versendet` },
      });
    }
    // SKIPPED = Konfigurationsproblem (400), FAILED = SMTP-Fehler (502)
    return NextResponse.json(
      { error: result.detail ?? "Test-Versand fehlgeschlagen" },
      { status: result.status === "SKIPPED" ? 400 : 502 }
    );
  } catch (error) {
    console.error("[API] Test-E-Mail fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
