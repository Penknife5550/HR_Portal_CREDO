/**
 * CREDO HR-Portal – SMTP-Mailversand (Fallback für n8n)
 *
 * Wird nur verwendet wenn n8n nicht erreichbar ist.
 * Konfiguration wird aus der Datenbank (SmtpConfig) geladen.
 * E-Mail-Vorlagen werden aus der Datenbank (EmailTemplate) geladen.
 *
 * Sensible Felder (Passwort) werden im Frontend maskiert angezeigt.
 */

import nodemailer from "nodemailer";
import { prisma } from "@/lib/db";
import { decrypt, isEncryptionConfigured } from "@/lib/encryption";

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
export async function sendEmail(
  options: MailOptions
): Promise<SendEmailResult | null> {
  try {
    const result = await createTransporter();
    if (!result) {
      console.warn("[Mailer] SMTP nicht konfiguriert oder deaktiviert – E-Mail uebersprungen");
      return null;
    }

    const info = await result.transporter.sendMail({
      from: result.from,
      to: options.to,
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
      messageId: info.messageId,
      accepted: (info.accepted ?? []).map((a) =>
        typeof a === "string" ? a : a.address
      ),
    };
  } catch (error) {
    console.error(
      "[Mailer] E-Mail-Versand fehlgeschlagen:",
      error instanceof Error ? error.message : error
    );
    return null;
  }
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
function renderTemplate(template: string, variables: Record<string, string>): string {
  return Object.entries(variables).reduce(
    (result, [key, value]) => result.replaceAll(`{{${key}}}`, value ?? ""),
    template
  );
}

// =============================================
// SMTP-Fallback: Event-basierter E-Mail-Versand
// Wird aufgerufen wenn n8n und alle Webhooks fehlschlagen
// =============================================
export async function sendEmailFallback(
  event: string,
  payload: Record<string, unknown>
): Promise<void> {
  // E-Mail-Vorlage aus DB laden
  const template = await prisma.emailTemplate.findUnique({
    where: { event: String(event) },
  });

  if (!template || !template.isActive) {
    console.warn(`[Mailer] Keine aktive E-Mail-Vorlage für Event "${event}" – Fallback abgebrochen`);
    return;
  }

  // Empfaenger und Variablen aus Payload extrahieren
  const vars = extractVariables(event, payload);
  const toEmail = vars.email || vars.supervisorEmail;

  if (!toEmail) {
    console.warn(`[Mailer] Kein Empfaenger im Payload für Event "${event}" gefunden`);
    return;
  }

  const subject = renderTemplate(template.subject, vars);
  const html = renderTemplate(template.bodyHtml, vars);
  const text = template.bodyText ? renderTemplate(template.bodyText, vars) : undefined;

  await sendEmail({ to: toEmail, subject, html, text });
}

// =============================================
// Variablen aus Event-Payload extrahieren
// =============================================
function extractVariables(
  event: string,
  payload: Record<string, unknown>
): Record<string, string> {
  const str = (v: unknown) => (v != null ? String(v) : "");

  const base: Record<string, string> = {
    email: str(payload.email),
    vorname: str(payload.vorname || payload.firstName),
    nachname: str(payload.nachname || payload.lastName),
    einrichtung: str(payload.organization || payload.einrichtung),
    vorgangsnummer: str(payload.displayId),
    mitarbeiter_name: str(payload.mitarbeiter_name) ||
      [str(payload.vorname || payload.firstName), str(payload.nachname || payload.lastName)].filter(Boolean).join(" ") ||
      str(payload.email),
    link: str(payload.fragebogenLink || payload.modalitaetenLink || payload.link),
    ablaufdatum: payload.tokenExpiresAt
      ? new Date(str(payload.tokenExpiresAt)).toLocaleDateString("de-DE")
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

  // Offboarding-spezifische Variablen
  if (event.startsWith("offboarding-")) {
    base.abteilung = str(payload.abteilung || payload.department);
    base.aufgabe = str(payload.aufgabe || payload.task);
    base.austrittsdatum = payload.austrittsdatum
      ? new Date(str(payload.austrittsdatum)).toLocaleDateString("de-DE")
      : str(payload.austrittsdatum || "");
    base.offene_aufgaben = str(payload.offene_aufgaben || payload.openTasks || "");
    base.link = str(payload.link || payload.offboardingLink || "");
  }

  return base;
}
