/**
 * API: /api/settings/email-templates
 *
 * GET – Alle E-Mail-Vorlagen laden
 *       Falls noch keine vorhanden: Standard-Vorlagen aus Code liefern.
 *       Empfaenger-Felder werden mit den Katalog-Defaults vorbelegt,
 *       solange sie nicht explizit konfiguriert wurden.
 *
 * Berechtigung: SUPER_ADMIN, HR_LEITUNG
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { DEFAULT_EMAIL_TEMPLATES } from "@/lib/default-email-templates";
import { getEventDefinition } from "@/lib/events";

const ALLOWED_ROLES = ["SUPER_ADMIN", "HR_LEITUNG"];

export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    if (!ALLOWED_ROLES.includes(session.role)) return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });

    const dbTemplates = await prisma.emailTemplate.findMany({
      orderBy: { event: "asc" },
    });

    // Fehlende Vorlagen durch Defaults ersetzen (ohne DB-Eintrag anzulegen);
    // leere Empfaenger-Felder mit den Katalog-Defaults vorbelegen.
    const dbByEvent = new Map(dbTemplates.map((t) => [t.event, t]));
    const allTemplates = DEFAULT_EMAIL_TEMPLATES.map((def) => {
      const catalog = getEventDefinition(def.event);
      const defaults = catalog?.defaultRecipients;
      const found = dbByEvent.get(def.event);
      const base =
        found ??
        {
          ...def,
          id: `default-${def.event}`,
          recipientTo: "",
          recipientCc: "",
          recipientBcc: "",
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      return {
        ...base,
        recipientTo: base.recipientTo || defaults?.to || "",
        recipientCc: base.recipientCc || defaults?.cc || "",
        recipientBcc: base.recipientBcc || defaults?.bcc || "",
        group: catalog?.group ?? "Weitere",
        recipientHint: catalog?.recipientHint ?? "",
        wired: catalog?.wired ?? true,
      };
    });

    return NextResponse.json({ data: allTemplates });
  } catch (error) {
    console.error("[API] E-Mail-Vorlagen laden fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
