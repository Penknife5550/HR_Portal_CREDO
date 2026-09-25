/**
 * API: /api/settings/email-status
 *
 * GET – Konfigurations-Status des E-Mail-Versands:
 *       - SMTP konfiguriert/aktiv?
 *       - je Event: Vorlage vorhanden/aktiv, Empfaenger aufloesbar,
 *         zusaetzliche Webhooks, wird das Event im Code ausgeloest?
 *       - nutzt ein Empfaengerfeld {{hr_postfach}}, obwohl in den
 *         SMTP-Einstellungen keine Antwortadresse steht? (Paket 4)
 *
 * Mails, die der Code per overrideTo an eine feste Adresse schickt
 * (Dokumentenpaket, die Mails der Nachforderung an die Person), tragen im
 * Katalog den Default {{email}} — deshalb meldet die Ampel fuer sie keinen
 * fehlenden Empfaenger, obwohl An, Cc und Bcc der Vorlage dort nicht wirken.
 * Webhooks auf diese Ereignisse feuern nie (EVENTS_OHNE_WEBHOOK) — sie
 * zaehlen deshalb nicht in `webhookCount`; den Grund zeigt der Reiter
 * „Webhooks“ an Ort und Stelle.
 *
 * Berechtigung: SUPER_ADMIN, HR_LEITUNG
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { EVENT_CATALOG } from "@/lib/events";
import { DEFAULT_EMAIL_TEMPLATES } from "@/lib/default-email-templates";
import { EVENTS_OHNE_WEBHOOK } from "@/lib/ereignis-liste";

const ALLOWED_ROLES = ["SUPER_ADMIN", "HR_LEITUNG"];

/** {{hr_postfach}} in einem Empfaengerfeld (auch mit Leerzeichen im Marker). */
const HR_POSTFACH_VARIABLE = /\{\{\s*hr_postfach\s*\}\}/;

/**
 * Das HR-Postfach ist SmtpConfig.replyToEmail (Paket 4). Ist es leer, faellt
 * die Kopie der HR-Meldungen still weg — und ist das Konto der anfordernden
 * HR-Kraft inaktiv, bleibt gar kein Empfaenger (SKIPPED).
 */
const HR_POSTFACH_FEHLT =
  "Nutzt {{hr_postfach}}, aber in den SMTP-Einstellungen ist keine Antwortadresse (HR-Postfach) hinterlegt";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    if (!ALLOWED_ROLES.includes(session.role)) return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });

    const [smtpConfig, dbTemplates, webhooks] = await Promise.all([
      prisma.smtpConfig.findUnique({ where: { id: "default" } }),
      prisma.emailTemplate.findMany({
        select: {
          event: true,
          isActive: true,
          recipientTo: true,
          recipientCc: true,
          recipientBcc: true,
          recipientReplyTo: true,
        },
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
    const dbByEvent = new Map(dbTemplates.map((t) => [t.event, t]));
    const defaultEvents = new Set(DEFAULT_EMAIL_TEMPLATES.map((t) => t.event));
    const hrPostfachLeer = !smtpConfig?.replyToEmail?.trim();

    const events = EVENT_CATALOG.map((def) => {
      const dbTemplate = dbByEvent.get(def.event);
      const hasDefault = defaultEvents.has(def.event);
      const templateSource = dbTemplate ? "db" : hasDefault ? "default" : null;
      const templateActive = dbTemplate ? dbTemplate.isActive : hasDefault;
      const recipientConfigured = Boolean(
        dbTemplate?.recipientTo?.trim() || def.defaultRecipients.to
      );

      // Wirksame Empfaengerfelder wie in renderEventEmail: Vorlagen-Feld vor
      // Katalog-Default (Reply-To hat keinen Katalog-Default).
      const empfaengerFelder = [
        dbTemplate?.recipientTo?.trim() || def.defaultRecipients.to,
        dbTemplate?.recipientCc?.trim() || def.defaultRecipients.cc || "",
        dbTemplate?.recipientBcc?.trim() || def.defaultRecipients.bcc || "",
        dbTemplate?.recipientReplyTo?.trim() || "",
      ];
      const postfachFehlt =
        hrPostfachLeer && empfaengerFelder.some((feld) => HR_POSTFACH_VARIABLE.test(feld));

      const issues: string[] = [];
      if (!templateSource) issues.push("Keine Vorlage vorhanden");
      else if (!templateActive) issues.push("Vorlage deaktiviert");
      if (templateSource && !recipientConfigured) issues.push("Kein Empfänger konfiguriert");
      if (templateSource && postfachFehlt) issues.push(HR_POSTFACH_FEHLT);
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
        // Nur Webhooks, die auch feuern: Die Plakette „+1 Webhook“ versprach
        // sonst bei den Mails mit persoenlichem Link (und beim
        // Dokumentenpaket) einen Aufruf, den es nie gibt.
        webhookCount: EVENTS_OHNE_WEBHOOK[def.event] ? 0 : (webhookCounts.get(def.event) ?? 0),
        ok:
          smtp.active &&
          templateActive &&
          recipientConfigured &&
          def.wired &&
          !(templateSource && postfachFehlt),
        issues,
      };
    });

    return NextResponse.json({ data: { smtp, events } });
  } catch (error) {
    console.error("[API] E-Mail-Status laden fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
