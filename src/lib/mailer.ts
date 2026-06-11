/**
 * CREDO HR-Portal – SMTP-Mailversand (primaerer Versandkanal)
 *
 * Jedes Event wird per SMTP versendet, sofern eine aktive Vorlage existiert
 * und ein Empfaenger aufloesbar ist. Webhooks sind nur noch ein optionaler
 * Zusatzkanal (siehe lib/webhooks.ts).
 *
 * Konfiguration wird aus der Datenbank (SmtpConfig) geladen.
 * E-Mail-Vorlagen werden aus der Datenbank (EmailTemplate) geladen;
 * fehlt eine DB-Vorlage, greifen die Code-Defaults (default-email-templates.ts).
 * Jeder Versandversuch wird im EmailLog protokolliert (SENT/FAILED/SKIPPED).
 *
 * Sensible Felder (Passwort) werden im Frontend maskiert angezeigt.
 */

import nodemailer from "nodemailer";
import { prisma } from "@/lib/db";
import { decrypt, isEncryptionConfigured } from "@/lib/encryption";
import { DEFAULT_EMAIL_TEMPLATES } from "@/lib/default-email-templates";
import { getEventDefinition } from "@/lib/events";

// =============================================
// Typen
// =============================================
interface MailAttachment {
  filename: string;
  content: Buffer;
  contentType?: string;
}

interface MailOptions {
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  html: string;
  text?: string;
  attachments?: MailAttachment[];
}

/**
 * Ergebnis eines erfolgreichen Versands — dient als Zustellnachweis
 * (z.B. fuer das BEM-Kommunikationsprotokoll, NFR 0a).
 */
export interface SendEmailResult {
  messageId?: string;
  accepted: string[];
}

interface SmtpTestResult {
  success: boolean;
  error?: string;
  durationMs: number;
}

// =============================================
// SMTP-Transporter erstellen
// =============================================
async function createTransporter() {
  const config = await prisma.smtpConfig.findUnique({
    where: { id: "default" },
  });

  if (!config || !config.isActive || !config.host || !config.username) {
    return null;
  }

  return {
    transporter: nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: {
        user: config.username,
        pass: isEncryptionConfigured() ? decrypt(config.password) : config.password,
      },
      tls: {
        rejectUnauthorized: process.env.NODE_ENV === "production",
      },
    }),
    from: `"${config.fromName}" <${config.fromEmail}>`,
  };
}

// =============================================
// E-Mail versenden
// =============================================
/**
 * Detaillierte Variante: liefert bei Fehlschlag den konkreten Grund zurueck
 * (statt nur null). Wird z.B. vom BEM-Einladungs-Endpunkt genutzt, um die echte
 * SMTP-Fehlermeldung anzuzeigen und im Versandprotokoll zu hinterlegen.
 */
export type SendEmailDetailed =
  | { ok: true; messageId?: string; accepted: string[] }
  | { ok: false; error: string };

export async function sendEmailDetailed(
  options: MailOptions
): Promise<SendEmailDetailed> {
  const result = await createTransporter();
  if (!result) {
    console.warn("[Mailer] SMTP nicht konfiguriert oder deaktiviert – E-Mail uebersprungen");
    return {
      ok: false,
      error:
        "SMTP ist nicht konfiguriert oder nicht aktiviert. Bitte unter Einstellungen → SMTP Host/Benutzer/Absender eintragen, 'aktiv' setzen und 'Verbindung testen'.",
    };
  }
  try {
    const info = await result.transporter.sendMail({
      from: result.from,
      to: options.to,
      cc: options.cc,
      bcc: options.bcc,
      subject: options.subject,
      html: options.html,
      text: options.text,
      attachments: options.attachments?.map((a) => ({
        filename: a.filename,
        content: a.content,
        contentType: a.contentType,
      })),
    });

    console.log(`[Mailer] E-Mail erfolgreich gesendet an: ${options.to.replace(/(.{2}).*(@.*)/, '$1***$2')}`);
    return {
      ok: true,
      messageId: info.messageId,
      accepted: (info.accepted ?? []).map((a) =>
        typeof a === "string" ? a : a.address
      ),
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[Mailer] E-Mail-Versand fehlgeschlagen:", msg);
    return { ok: false, error: msg };
  }
}

export async function sendEmail(
  options: MailOptions
): Promise<SendEmailResult | null> {
  const r = await sendEmailDetailed(options);
  return r.ok ? { messageId: r.messageId, accepted: r.accepted } : null;
}

// =============================================
// SMTP-Verbindung testen (Admin-Portal)
// =============================================
export async function testSmtpConnection(testEmail: string): Promise<SmtpTestResult> {
  const start = Date.now();
  try {
    const result = await createTransporter();
    if (!result) {
      return {
        success: false,
        error: "SMTP ist nicht konfiguriert oder deaktiviert. Bitte Host, Benutzer und Passwort eintragen.",
        durationMs: Date.now() - start,
      };
    }

    // Verbindung verifizieren
    await result.transporter.verify();

    // Test-E-Mail senden
    await result.transporter.sendMail({
      from: result.from,
      to: testEmail,
      subject: "CREDO HR-Portal – SMTP-Verbindungstest",
      html: `
        <div style="font-family: Arial, sans-serif; padding: 24px;">
          <h2 style="color: #1a1a2e;">✅ SMTP-Verbindungstest erfolgreich</h2>
          <p>Die SMTP-Konfiguration des CREDO HR-Portals funktioniert korrekt.</p>
          <p style="color: #666; font-size: 12px;">Gesendet am: ${new Date().toLocaleString("de-DE")}</p>
        </div>
      `,
      text: "CREDO HR-Portal SMTP-Test: Die Verbindung funktioniert korrekt.",
    });

    return { success: true, durationMs: Date.now() - start };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unbekannter Fehler",
      durationMs: Date.now() - start,
    };
  }
}

// =============================================
// Variablen in E-Mail-Vorlage ersetzen
// =============================================
export function renderTemplate(template: string, variables: Record<string, string>): string {
  return Object.entries(variables).reduce(
    (result, [key, value]) => result.replaceAll(`{{${key}}}`, value ?? ""),
    template
  );
}

// =============================================
// Empfaenger-Felder rendern und validieren
// Eingabe: kommagetrennte Liste aus Festadressen und {{variablen}}
// =============================================
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function renderRecipientField(
  field: string,
  vars: Record<string, string>
): string {
  const addresses = renderTemplate(field, vars)
    .split(",")
    .map((addr) => addr.trim())
    .filter((addr) => EMAIL_PATTERN.test(addr));
  return [...new Set(addresses.map((a) => a.toLowerCase()))].join(", ");
}

// =============================================
// Vorlage fuer ein Event aufloesen: DB-Eintrag vor Code-Default
// =============================================
interface ResolvedTemplate {
  subject: string;
  bodyHtml: string;
  bodyText: string | null;
  recipientTo: string;
  recipientCc: string;
  recipientBcc: string;
  isActive: boolean;
  source: "db" | "default";
}

export async function resolveEventTemplate(
  event: string
): Promise<ResolvedTemplate | null> {
  const dbTemplate = await prisma.emailTemplate.findUnique({
    where: { event },
  });
  if (dbTemplate) {
    return {
      subject: dbTemplate.subject,
      bodyHtml: dbTemplate.bodyHtml,
      bodyText: dbTemplate.bodyText,
      recipientTo: dbTemplate.recipientTo,
      recipientCc: dbTemplate.recipientCc,
      recipientBcc: dbTemplate.recipientBcc,
      isActive: dbTemplate.isActive,
      source: "db",
    };
  }

  const defaultTemplate = DEFAULT_EMAIL_TEMPLATES.find((t) => t.event === event);
  if (!defaultTemplate) return null;
  return {
    subject: defaultTemplate.subject,
    bodyHtml: defaultTemplate.bodyHtml,
    bodyText: defaultTemplate.bodyText,
    recipientTo: "",
    recipientCc: "",
    recipientBcc: "",
    isActive: true,
    source: "default",
  };
}

// =============================================
// Gerenderte Event-E-Mail (auch fuer den Test-Versand nutzbar)
// =============================================
export interface RenderedEventEmail {
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  html: string;
  text?: string;
}

export function renderEventEmail(
  template: Pick<
    ResolvedTemplate,
    "subject" | "bodyHtml" | "bodyText" | "recipientTo" | "recipientCc" | "recipientBcc"
  >,
  event: string,
  payload: Record<string, unknown>
): { rendered: RenderedEventEmail | null; skipReason?: string } {
  const vars = extractVariables(event, payload);
  const catalogDefaults = getEventDefinition(event)?.defaultRecipients;

  // An-Adresse: Vorlagen-Feld > Katalog-Default > bisherige Payload-Aufloesung
  const toField =
    template.recipientTo.trim() ||
    catalogDefaults?.to ||
    vars.email ||
    vars.supervisor_email;
  const to = renderRecipientField(toField, vars);
  if (!to) {
    return {
      rendered: null,
      skipReason: template.recipientTo.trim()
        ? `Empfaenger "${template.recipientTo}" ergab keine gueltige Adresse`
        : "Kein Empfaenger konfiguriert und keiner im Payload aufloesbar",
    };
  }

  const cc = renderRecipientField(template.recipientCc.trim() || catalogDefaults?.cc || "", vars);
  const bcc = renderRecipientField(template.recipientBcc.trim() || catalogDefaults?.bcc || "", vars);

  return {
    rendered: {
      to,
      cc: cc || undefined,
      bcc: bcc || undefined,
      subject: renderTemplate(template.subject, vars),
      html: renderTemplate(template.bodyHtml, vars),
      text: template.bodyText ? renderTemplate(template.bodyText, vars) : undefined,
    },
  };
}

// =============================================
// Versandprotokoll schreiben — wirft niemals
// =============================================
export type EmailLogStatus = "SENT" | "FAILED" | "SKIPPED";

async function writeEmailLog(entry: {
  event: string;
  status: EmailLogStatus;
  recipient?: string;
  cc?: string;
  bcc?: string;
  subject?: string;
  detail?: string;
  messageId?: string;
  isTest?: boolean;
}): Promise<void> {
  try {
    await prisma.emailLog.create({
      data: {
        event: entry.event,
        status: entry.status,
        recipient: entry.recipient ?? "",
        cc: entry.cc,
        bcc: entry.bcc,
        subject: entry.subject ?? "",
        detail: entry.detail,
        messageId: entry.messageId,
        isTest: entry.isTest ?? false,
      },
    });
  } catch (err) {
    console.error(
      "[Mailer] Versandprotokoll konnte nicht geschrieben werden:",
      err instanceof Error ? err.message : err
    );
  }
}

// =============================================
// Primaerer Event-basierter E-Mail-Versand
// Wird vom Dispatcher (lib/webhooks.ts) fuer jedes Event aufgerufen.
// Wirft niemals — jedes Ergebnis wird im EmailLog protokolliert.
// =============================================
export interface EventEmailResult {
  status: EmailLogStatus;
  detail?: string;
}

export async function sendEventEmail(
  event: string,
  payload: Record<string, unknown>,
  options?: {
    isTest?: boolean;
    /** Test-Versand: alle Empfaenger durch diese Adresse ersetzen */
    overrideTo?: string;
    /** Test-Versand: ungespeicherte Editor-Felder statt der DB-Vorlage nutzen */
    templateOverride?: Partial<
      Pick<
        ResolvedTemplate,
        "subject" | "bodyHtml" | "bodyText" | "recipientTo" | "recipientCc" | "recipientBcc"
      >
    >;
  }
): Promise<EventEmailResult> {
  const isTest = options?.isTest ?? false;
  try {
    let template = await resolveEventTemplate(event);
    if (!template) {
      const detail = "Keine E-Mail-Vorlage vorhanden";
      await writeEmailLog({ event, status: "SKIPPED", detail, isTest });
      return { status: "SKIPPED", detail };
    }
    if (options?.templateOverride) {
      template = { ...template, ...options.templateOverride };
    }
    // Test-Versand ist auch bei deaktivierter Vorlage erlaubt
    if (!template.isActive && !isTest) {
      const detail = "E-Mail-Vorlage ist deaktiviert";
      await writeEmailLog({ event, status: "SKIPPED", detail, isTest });
      return { status: "SKIPPED", detail };
    }

    let { rendered, skipReason } = renderEventEmail(template, event, payload);
    if (options?.overrideTo) {
      // Test-Versand: Empfaenger ersetzen — auch wenn die Vorlage selbst
      // keinen aufloesbaren Empfaenger hat (z.B. HR-interne Events)
      if (!rendered) {
        const vars = extractVariables(event, payload);
        rendered = {
          to: options.overrideTo,
          subject: renderTemplate(template.subject, vars),
          html: renderTemplate(template.bodyHtml, vars),
          text: template.bodyText ? renderTemplate(template.bodyText, vars) : undefined,
        };
        skipReason = undefined;
      } else {
        rendered.to = options.overrideTo;
        rendered.cc = undefined;
        rendered.bcc = undefined;
      }
    }
    if (!rendered) {
      await writeEmailLog({ event, status: "SKIPPED", detail: skipReason, isTest });
      console.warn(`[Mailer] Event "${event}" uebersprungen: ${skipReason}`);
      return { status: "SKIPPED", detail: skipReason };
    }

    if (isTest) {
      rendered.subject = `[TEST] ${rendered.subject}`;
    }

    const result = await sendEmailDetailed(rendered);
    if (result.ok) {
      await writeEmailLog({
        event,
        status: "SENT",
        recipient: rendered.to,
        cc: rendered.cc,
        bcc: rendered.bcc,
        subject: rendered.subject,
        messageId: result.messageId,
        isTest,
      });
      return { status: "SENT" };
    }

    await writeEmailLog({
      event,
      status: "FAILED",
      recipient: rendered.to,
      cc: rendered.cc,
      bcc: rendered.bcc,
      subject: rendered.subject,
      detail: result.error,
      isTest,
    });
    return { status: "FAILED", detail: result.error };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error(`[Mailer] Unerwarteter Fehler beim Versand fuer "${event}":`, detail);
    await writeEmailLog({ event, status: "FAILED", detail, isTest });
    return { status: "FAILED", detail };
  }
}

// =============================================
// Variablen aus Event-Payload extrahieren
// =============================================
function extractVariables(
  event: string,
  payload: Record<string, unknown>
): Record<string, string> {
  const str = (v: unknown) => (v != null ? String(v) : "");

  // Generischer Durchreich: jedes skalare Payload-Feld wird unter seinem
  // Originalnamen als Platzhalter verfuegbar (z.B. {{employeeName}}, {{displayId}},
  // {{magicUrl}}). Die kuratierten Felder unten ueberschreiben diese gezielt.
  const generic: Record<string, string> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (v == null) continue;
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
      generic[k] = String(v);
    }
  }

  const base: Record<string, string> = {
    ...generic,
    // Empfaenger: deckt die unterschiedlichen Feldnamen aller Module ab.
    email: str(
      payload.email ||
        payload.employeeEmail ||
        payload.recipientEmail ||
        payload.privateEmail,
    ),
    vorname: str(payload.vorname || payload.firstName),
    nachname: str(payload.nachname || payload.lastName),
    einrichtung: str(payload.organization || payload.einrichtung),
    vorgangsnummer: str(payload.displayId),
    mitarbeiter_name:
      str(payload.mitarbeiter_name || payload.employeeName) ||
      [str(payload.vorname || payload.firstName), str(payload.nachname || payload.lastName)]
        .filter(Boolean)
        .join(" ") ||
      str(payload.email || payload.employeeEmail),
    link: str(
      payload.fragebogenLink ||
        payload.modalitaetenLink ||
        payload.magicUrl ||
        payload.magicLink ||
        payload.link,
    ),
    ablaufdatum: payload.tokenExpiresAt
      ? new Date(str(payload.tokenExpiresAt)).toLocaleDateString("de-DE")
      : payload.expiresAt
        ? new Date(str(payload.expiresAt)).toLocaleDateString("de-DE")
        : "",
    supervisor_email: str(payload.supervisorEmail),
    supervisor_link: str(payload.supervisor_link || payload.modalitaetenLink),
    tage_offen: str(payload.tage_offen || ""),
  };

  // Event-spezifische Ergaenzungen
  if (event === "supervisor-link-created" || event === "supervisor-reminder") {
    base.email = str(payload.supervisorEmail || payload.email);
    base.link = str(payload.modalitaetenLink || payload.supervisor_link);
  }

  // PSI-Beurteilungs-Anfrage: Empfaenger ist der/die Gutachter:in (recipientEmail),
  // der Link liegt unter `magicLink` (nicht magicUrl).
  if (event === "psi-assessment-requested") {
    base.email = str(payload.recipientEmail || payload.email);
    base.link = str(payload.magicLink || payload.link);
  }

  // PSI-Beurteilung freigegeben: Empfaenger ist der/die Beschaeftigte,
  // der Bestaetigungs-Link liegt unter `ackLink`.
  if (event === "psi-assessment-released") {
    base.email = str(payload.employeeEmail || payload.email);
    base.link = str(payload.ackLink || payload.link);
  }

  // Offboarding-spezifische Variablen
  if (event.startsWith("offboarding-")) {
    base.abteilung = str(payload.abteilung || payload.department);
    base.aufgabe = str(payload.aufgabe || payload.task);
    base.austrittsdatum = payload.austrittsdatum
      ? new Date(str(payload.austrittsdatum)).toLocaleDateString("de-DE")
      : str(payload.austrittsdatum || "");
    base.offene_aufgaben = str(payload.offene_aufgaben || payload.openTasks || "");
    base.link = str(payload.link || payload.offboardingLink || payload.magicLink || "");
  }

  return base;
}
