/**
 * API: /api/settings/email-status
 *
 * GET – Konfigurations-Status des E-Mail-Versands:
 *       - SMTP konfiguriert/aktiv?
 *       - je Event: Vorlage vorhanden/aktiv, Empfaenger aufloesbar,
 *         zusaetzliche Webhooks, wird das Event im Code ausgeloest?
 *
 * Berechtigung: SUPER_ADMIN, HR_LEITUNG
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { EVENT_CATALOG } from "@/lib/events";
import { DEFAULT_EMAIL_TEMPLATES } from "@/lib/default-email-templates";

const ALLOWED_ROLES = ["SUPER_ADMIN", "HR_LEITUNG"];

export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    if (!ALLOWED_ROLES.includes(session.role)) return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });

    const [smtpConfig, dbTemplates, webhooks] = await Promise.all([
      prisma.smtpConfig.findUnique({ where: { id: "default" } }),
      prisma.emailTemplate.findMany({
        select: { event: true, isActive: true, recipientTo: true },
      }),
      prisma.webhookConfig.findMany({
        where: { isActive: true },
        select: { event: true },
      }),
    ]);

    const smtp = {
      configured: Boolean(smtpConfig?.host && smtpConfig.username && smtpConfig.fromEmail),
      active: Boolean(smtpConfig?.isActive),
    };

    const webhookCounts = new Map<string, number>();
    for (const w of webhooks) {
      webhookCounts.set(w.event, (webhookCounts.get(w.event) ?? 0) + 1);
    }

    const events = EVENT_CATALOG.map((def) => {
      const dbTemplate = dbTemplates.find((t) => t.event === def.event);
      const hasDefault = DEFAULT_EMAIL_TEMPLATES.some((t) => t.event === def.event);
      const templateSource = dbTemplate ? "db" : hasDefault ? "default" : null;
      const templateActive = dbTemplate ? dbTemplate.isActive : hasDefault;
      const recipientConfigured = Boolean(
        dbTemplate?.recipientTo?.trim() || def.defaultRecipients.to
      );

      const issues: string[] = [];
      if (!templateSource) issues.push("Keine Vorlage vorhanden");
      else if (!templateActive) issues.push("Vorlage deaktiviert");
      if (templateSource && !recipientConfigured) issues.push("Kein Empfänger konfiguriert");
      if (!def.wired) issues.push("Wird derzeit von keinem Prozess ausgelöst");

      return {
        event: def.event,
        name: def.name,
        group: def.group,
        recipientHint: def.recipientHint,
        wired: def.wired,
        templateSource,
        templateActive,
        recipientConfigured,
        webhookCount: webhookCounts.get(def.event) ?? 0,
        ok: smtp.active && templateActive && recipientConfigured && def.wired,
        issues,
      };
    });

    return NextResponse.json({ data: { smtp, events } });
  } catch (error) {
    console.error("[API] E-Mail-Status laden fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
