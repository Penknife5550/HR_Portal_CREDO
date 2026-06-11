/**
 * CREDO HR-Portal – Standard-E-Mail-Vorlagen
 *
 * Diese Vorlagen werden verwendet wenn:
 * 1. Noch keine DB-Vorlage gespeichert wurde
 * 2. Als Ausgangsbasis für den Admin
 *
 * Variablen: {{schluessel}} werden beim Versand ersetzt.
 */

export interface EmailTemplateDefinition {
  event: string;
  name: string;
  subject: string;
  bodyHtml: string;
  bodyText: string;
  variables: { key: string; description: string }[];
}

/**
 * Factory fuer einfache HR-Status-Benachrichtigungen im CREDO-CI
 * (Badge + Text + Vorgangs-Box). Fuer Vorlagen ohne Magic-Link/Button.
 */
function hrStatusNotification(opts: {
  event: string;
  name: string;
  subject: string;
  badge: string;
  badgeBg: string;
  badgeText: string;
  heading: string;
  text: string;
  extraVariables?: { key: string; description: string }[];
}): EmailTemplateDefinition {
  return {
    event: opts.event,
    name: opts.name,
    subject: opts.subject,
    bodyHtml: `<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <tr><td style="background-color:#1a1a2e;border-radius:8px 8px 0 0;padding:24px 32px;">
          <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:bold;">CREDO HR-Portal</h1>
        </td></tr>
        <tr><td style="background-color:#ffffff;padding:32px;">
          <div style="display:inline-block;background-color:${opts.badgeBg};border-radius:6px;padding:8px 16px;margin-bottom:24px;">
            <span style="color:${opts.badgeText};font-weight:bold;font-size:14px;">${opts.badge}</span>
          </div>
          <h2 style="color:#1a1a2e;font-size:18px;margin:0 0 16px;">${opts.heading}</h2>
          <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px;">
            ${opts.text}
          </p>
          <table cellpadding="0" cellspacing="0" style="width:100%;background-color:#f9fafb;border-radius:8px;margin:0 0 24px;">
            <tr><td style="padding:16px;">
              <p style="margin:0 0 4px;color:#6b7280;font-size:12px;">Vorgang</p>
              <p style="margin:0;color:#374151;font-size:14px;">{{vorgangsnummer}}</p>
            </td></tr>
          </table>
          <p style="color:#9ca3af;font-size:12px;margin:0;">
            Diese E-Mail wurde automatisch vom CREDO HR-Portal versendet.
          </p>
        </td></tr>
        <tr><td style="background-color:#f9fafb;border-radius:0 0 8px 8px;padding:16px 32px;border-top:1px solid #e5e7eb;">
          <p style="margin:0;color:#9ca3af;font-size:11px;text-align:center;">© CREDO Gruppe – HR-Portal</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
    bodyText: `${opts.subject}

${opts.text.replace(/<[^>]+>/g, "")}
Vorgang: {{vorgangsnummer}}

CREDO HR-Portal`,
    variables: [
      { key: "{{mitarbeiter_name}}", description: "Name des Mitarbeiters" },
      { key: "{{vorgangsnummer}}", description: "Vorgangsnummer (displayId)" },
      ...(opts.extraVariables ?? []),
    ],
  };
}

export const DEFAULT_EMAIL_TEMPLATES: EmailTemplateDefinition[] = [
  // =============================================
  // Mitarbeiter-Einladung (Magic Link Fragebogen)
  // =============================================
  {
    event: "onboarding-created",
    name: "Einladung Mitarbeiter (Personalfragebogen)",
    subject: "Einladung zum Personalfragebogen – {{einrichtung}}",
    bodyHtml: `<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

        <!-- Header -->
        <tr><td style="background-color:#1a1a2e;border-radius:8px 8px 0 0;padding:24px 32px;">
          <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:bold;">CREDO HR-Portal</h1>
          <p style="margin:4px 0 0;color:#a0a0c0;font-size:13px;">{{einrichtung}}</p>
        </td></tr>

        <!-- Body -->
        <tr><td style="background-color:#ffffff;padding:32px;">
          <h2 style="color:#1a1a2e;font-size:18px;margin:0 0 16px;">Herzlich willkommen, {{vorname}}!</h2>
          <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px;">
            Wir freuen uns, Sie bald in unserem Team begrüßen zu dürfen. Bitte füllen Sie vor Ihrem ersten Arbeitstag den nachfolgenden Personalfragebogen aus.
          </p>
          <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 24px;">
            Der Fragebogen ist <strong>bis zum {{ablaufdatum}}</strong> gültig.
          </p>

          <!-- Button -->
          <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
            <tr><td style="background-color:#2563eb;border-radius:8px;">
              <a href="{{link}}" style="display:inline-block;padding:14px 28px;color:#ffffff;text-decoration:none;font-weight:bold;font-size:15px;">
                Personalfragebogen ausfüllen →
              </a>
            </td></tr>
          </table>

          <p style="color:#6b7280;font-size:13px;line-height:1.5;margin:0 0 8px;">
            Falls der Button nicht funktioniert, kopieren Sie bitte diesen Link in Ihren Browser:
          </p>
          <p style="color:#2563eb;font-size:12px;word-break:break-all;margin:0 0 24px;">{{link}}</p>

          <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
          <p style="color:#9ca3af;font-size:12px;margin:0;">
            Bei Fragen wenden Sie sich bitte an Ihre HR-Ansprechperson.<br>
            Diese E-Mail wurde automatisch vom CREDO HR-Portal versendet.
          </p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="background-color:#f9fafb;border-radius:0 0 8px 8px;padding:16px 32px;border-top:1px solid #e5e7eb;">
          <p style="margin:0;color:#9ca3af;font-size:11px;text-align:center;">
            © CREDO Gruppe – Freie Evangelische Schulen | {{einrichtung}}
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`,
    bodyText: `Herzlich willkommen, {{vorname}}!

Wir freuen uns, Sie bald in unserem Team begrüßen zu dürfen.

Bitte füllen Sie Ihren Personalfragebogen aus (gültig bis {{ablaufdatum}}):
{{link}}

Bei Fragen wenden Sie sich bitte an Ihre HR-Ansprechperson.

CREDO Gruppe – {{einrichtung}}`,
    variables: [
      { key: "{{vorname}}", description: "Vorname des Mitarbeiters" },
      { key: "{{nachname}}", description: "Nachname des Mitarbeiters" },
      { key: "{{email}}", description: "E-Mail des Mitarbeiters" },
      { key: "{{einrichtung}}", description: "Name der Einrichtung" },
      { key: "{{link}}", description: "Link zum Personalfragebogen" },
      { key: "{{ablaufdatum}}", description: "Ablaufdatum des Links" },
      { key: "{{vorgangsnummer}}", description: "Vorgangsnummer (z.B. 2026-GYM-001)" },
    ],
  },

  // =============================================
  // Vorgesetzten-Einladung (Einstellungsmodalitaeten)
  // =============================================
  {
    event: "supervisor-link-created",
    name: "Einladung Vorgesetzter (Einstellungsmodalitäten)",
    subject: "Bitte ausfüllen: Einstellungsmodalitäten für {{mitarbeiter_name}}",
    bodyHtml: `<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

        <!-- Header -->
        <tr><td style="background-color:#1a1a2e;border-radius:8px 8px 0 0;padding:24px 32px;">
          <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:bold;">CREDO HR-Portal</h1>
          <p style="margin:4px 0 0;color:#a0a0c0;font-size:13px;">{{einrichtung}}</p>
        </td></tr>

        <!-- Body -->
        <tr><td style="background-color:#ffffff;padding:32px;">
          <h2 style="color:#1a1a2e;font-size:18px;margin:0 0 16px;">Einstellungsmodalitäten erforderlich</h2>
          <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px;">
            Für den neuen Mitarbeiter <strong>{{mitarbeiter_name}}</strong> werden die Einstellungsmodalitäten benötigt.
          </p>
          <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 24px;">
            Bitte füllen Sie das Formular über den nachstehenden Link aus, damit die Personalabteilung alle erforderlichen Informationen für den Arbeitsvertrag erhält.
          </p>

          <!-- Button -->
          <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
            <tr><td style="background-color:#059669;border-radius:8px;">
              <a href="{{link}}" style="display:inline-block;padding:14px 28px;color:#ffffff;text-decoration:none;font-weight:bold;font-size:15px;">
                Einstellungsmodalitäten ausfüllen →
              </a>
            </td></tr>
          </table>

          <p style="color:#6b7280;font-size:13px;line-height:1.5;margin:0 0 8px;">
            Falls der Button nicht funktioniert, kopieren Sie bitte diesen Link:
          </p>
          <p style="color:#2563eb;font-size:12px;word-break:break-all;margin:0 0 24px;">{{link}}</p>

          <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
          <p style="color:#9ca3af;font-size:12px;margin:0;">
            Diese E-Mail wurde automatisch vom CREDO HR-Portal versendet.
          </p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="background-color:#f9fafb;border-radius:0 0 8px 8px;padding:16px 32px;border-top:1px solid #e5e7eb;">
          <p style="margin:0;color:#9ca3af;font-size:11px;text-align:center;">
            © CREDO Gruppe – Freie Evangelische Schulen | {{einrichtung}}
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`,
    bodyText: `Einstellungsmodalitäten erforderlich

Für den neuen Mitarbeiter {{mitarbeiter_name}} werden die Einstellungsmodalitäten benötigt.

Bitte füllen Sie das Formular aus:
{{link}}

CREDO Gruppe – {{einrichtung}}`,
    variables: [
      { key: "{{mitarbeiter_name}}", description: "Vollständiger Name des neuen Mitarbeiters" },
      { key: "{{email}}", description: "E-Mail des Vorgesetzten" },
      { key: "{{einrichtung}}", description: "Name der Einrichtung" },
      { key: "{{link}}", description: "Link zu den Einstellungsmodalitäten" },
      { key: "{{vorgangsnummer}}", description: "Vorgangsnummer" },
    ],
  },

  // =============================================
  // Bestaetigungs-E-Mail an Mitarbeiter (nach Fragebogen-Einreichung)
  // =============================================
  {
    event: "questionnaire-confirmation-employee",
    name: "Eingangsbestaetigung Mitarbeiter (Fragebogen eingereicht)",
    subject: "Ihre Unterlagen sind bei uns eingegangen – {{einrichtung}}",
    bodyHtml: `<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

        <!-- Header -->
        <tr><td style="background-color:#1a1a2e;border-radius:8px 8px 0 0;padding:24px 32px;">
          <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:bold;">CREDO HR-Portal</h1>
          <p style="margin:4px 0 0;color:#a0a0c0;font-size:13px;">{{einrichtung}}</p>
        </td></tr>

        <!-- Body -->
        <tr><td style="background-color:#ffffff;padding:32px;">
          <div style="display:inline-block;background-color:#d1fae5;border-radius:6px;padding:8px 16px;margin-bottom:24px;">
            <span style="color:#065f46;font-weight:bold;font-size:14px;">Erfolgreich eingegangen</span>
          </div>
          <h2 style="color:#1a1a2e;font-size:18px;margin:0 0 16px;">Vielen Dank, {{vorname}}!</h2>
          <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px;">
            Wir bestätigen hiermit den Eingang Ihres Personalfragebogens. Ihre Unterlagen wurden erfolgreich an unsere Personalabteilung übermittelt.
          </p>

          <table cellpadding="0" cellspacing="0" style="width:100%;background-color:#f9fafb;border-radius:8px;margin:0 0 24px;">
            <tr><td style="padding:16px;">
              <p style="margin:0 0 8px;color:#6b7280;font-size:12px;text-transform:uppercase;font-weight:bold;">Ihre Bestätigungs-ID</p>
              <p style="margin:0;color:#1a1a2e;font-size:15px;font-weight:bold;">{{vorgangsnummer}}</p>
            </td></tr>
            <tr><td style="padding:0 16px 16px;">
              <p style="margin:0 0 4px;color:#6b7280;font-size:12px;">Einrichtung</p>
              <p style="margin:0;color:#374151;font-size:14px;">{{einrichtung}}</p>
            </td></tr>
          </table>

          <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px;">
            <strong>Wie geht es weiter?</strong><br>
            Unsere Personalabteilung prüft Ihre Angaben und wird sich bei Rückfragen direkt bei Ihnen melden. Sie müssen nichts weiter tun.
          </p>

          <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
          <p style="color:#9ca3af;font-size:12px;margin:0;">
            Bitte bewahren Sie diese E-Mail als Nachweis auf.<br>
            Bei Fragen wenden Sie sich bitte an Ihre HR-Ansprechperson.<br>
            Diese E-Mail wurde automatisch vom CREDO HR-Portal versendet.
          </p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="background-color:#f9fafb;border-radius:0 0 8px 8px;padding:16px 32px;border-top:1px solid #e5e7eb;">
          <p style="margin:0;color:#9ca3af;font-size:11px;text-align:center;">
            &copy; CREDO Gruppe – Freie Evangelische Schulen | {{einrichtung}}
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`,
    bodyText: `Vielen Dank, {{vorname}}!

Wir bestätigen den Eingang Ihres Personalfragebogens.

Bestätigungs-ID: {{vorgangsnummer}}
Einrichtung: {{einrichtung}}

Wie geht es weiter?
Unsere Personalabteilung prüft Ihre Angaben und meldet sich bei Rückfragen.

Bitte bewahren Sie diese E-Mail als Nachweis auf.

CREDO Gruppe – {{einrichtung}}`,
    variables: [
      { key: "{{vorname}}", description: "Vorname des Mitarbeiters" },
      { key: "{{nachname}}", description: "Nachname des Mitarbeiters" },
      { key: "{{email}}", description: "E-Mail des Mitarbeiters" },
      { key: "{{einrichtung}}", description: "Name der Einrichtung" },
      { key: "{{vorgangsnummer}}", description: "Vorgangsnummer / Bestaetigungs-ID" },
    ],
  },

  // =============================================
  // Fragebogen eingereicht (HR-Benachrichtigung)
  // =============================================
  {
    event: "questionnaire-completed",
    name: "Fragebogen eingereicht (HR-Benachrichtigung)",
    subject: "Fragebogen eingereicht – {{mitarbeiter_name}} ({{vorgangsnummer}})",
    bodyHtml: `<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <tr><td style="background-color:#1a1a2e;border-radius:8px 8px 0 0;padding:24px 32px;">
          <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:bold;">CREDO HR-Portal</h1>
        </td></tr>
        <tr><td style="background-color:#ffffff;padding:32px;">
          <div style="display:inline-block;background-color:#d1fae5;border-radius:6px;padding:8px 16px;margin-bottom:24px;">
            <span style="color:#065f46;font-weight:bold;font-size:14px;">✓ Fragebogen eingereicht</span>
          </div>
          <h2 style="color:#1a1a2e;font-size:18px;margin:0 0 16px;">Personalfragebogen vollständig</h2>
          <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px;">
            Der Personalfragebogen von <strong>{{mitarbeiter_name}}</strong> wurde soeben ausgefüllt und eingereicht.
          </p>
          <table cellpadding="0" cellspacing="0" style="width:100%;background-color:#f9fafb;border-radius:8px;padding:0;margin:0 0 24px;">
            <tr><td style="padding:16px;">
              <p style="margin:0 0 8px;color:#6b7280;font-size:12px;text-transform:uppercase;font-weight:bold;">Vorgang</p>
              <p style="margin:0;color:#1a1a2e;font-size:15px;font-weight:bold;">{{vorgangsnummer}}</p>
            </td></tr>
            <tr><td style="padding:0 16px 16px;">
              <p style="margin:0 0 4px;color:#6b7280;font-size:12px;">Mitarbeiter</p>
              <p style="margin:0;color:#374151;font-size:14px;">{{mitarbeiter_name}} · {{email}}</p>
            </td></tr>
            <tr><td style="padding:0 16px 16px;">
              <p style="margin:0 0 4px;color:#6b7280;font-size:12px;">Einrichtung</p>
              <p style="margin:0;color:#374151;font-size:14px;">{{einrichtung}}</p>
            </td></tr>
          </table>
          <p style="color:#9ca3af;font-size:12px;margin:0;">
            Diese E-Mail wurde automatisch vom CREDO HR-Portal versendet.
          </p>
        </td></tr>
        <tr><td style="background-color:#f9fafb;border-radius:0 0 8px 8px;padding:16px 32px;border-top:1px solid #e5e7eb;">
          <p style="margin:0;color:#9ca3af;font-size:11px;text-align:center;">© CREDO Gruppe – HR-Portal</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
    bodyText: `Fragebogen eingereicht – {{vorgangsnummer}}

{{mitarbeiter_name}} hat den Personalfragebogen ausgefüllt.

Einrichtung: {{einrichtung}}
E-Mail: {{email}}

CREDO HR-Portal`,
    variables: [
      { key: "{{mitarbeiter_name}}", description: "Vollständiger Name des Mitarbeiters" },
      { key: "{{email}}", description: "E-Mail des Mitarbeiters" },
      { key: "{{einrichtung}}", description: "Name der Einrichtung" },
      { key: "{{vorgangsnummer}}", description: "Vorgangsnummer" },
    ],
  },

  // =============================================
  // Vorgesetzter hat ausgefuellt (HR-Benachrichtigung)
  // =============================================
  {
    event: "supervisor-completed",
    name: "Einstellungsmodalitäten eingereicht (HR-Benachrichtigung)",
    subject: "Modalitäten vollständig – {{mitarbeiter_name}} ({{vorgangsnummer}})",
    bodyHtml: `<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <tr><td style="background-color:#1a1a2e;border-radius:8px 8px 0 0;padding:24px 32px;">
          <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:bold;">CREDO HR-Portal</h1>
        </td></tr>
        <tr><td style="background-color:#ffffff;padding:32px;">
          <div style="display:inline-block;background-color:#d1fae5;border-radius:6px;padding:8px 16px;margin-bottom:24px;">
            <span style="color:#065f46;font-weight:bold;font-size:14px;">✓ Einstellungsmodalitäten vollständig</span>
          </div>
          <h2 style="color:#1a1a2e;font-size:18px;margin:0 0 16px;">Alle Daten eingegangen</h2>
          <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px;">
            Die Einstellungsmodalitäten für <strong>{{mitarbeiter_name}}</strong> wurden vom Vorgesetzten eingereicht. Der Vorgang kann jetzt abgeschlossen werden.
          </p>
          <table cellpadding="0" cellspacing="0" style="width:100%;background-color:#f9fafb;border-radius:8px;margin:0 0 24px;">
            <tr><td style="padding:16px;">
              <p style="margin:0 0 8px;color:#6b7280;font-size:12px;text-transform:uppercase;font-weight:bold;">Vorgang</p>
              <p style="margin:0;color:#1a1a2e;font-size:15px;font-weight:bold;">{{vorgangsnummer}}</p>
            </td></tr>
            <tr><td style="padding:0 16px 16px;">
              <p style="margin:0 0 4px;color:#6b7280;font-size:12px;">Mitarbeiter</p>
              <p style="margin:0;color:#374151;font-size:14px;">{{mitarbeiter_name}}</p>
            </td></tr>
            <tr><td style="padding:0 16px 16px;">
              <p style="margin:0 0 4px;color:#6b7280;font-size:12px;">Einrichtung</p>
              <p style="margin:0;color:#374151;font-size:14px;">{{einrichtung}}</p>
            </td></tr>
          </table>
          <p style="color:#9ca3af;font-size:12px;margin:0;">
            Diese E-Mail wurde automatisch vom CREDO HR-Portal versendet.
          </p>
        </td></tr>
        <tr><td style="background-color:#f9fafb;border-radius:0 0 8px 8px;padding:16px 32px;border-top:1px solid #e5e7eb;">
          <p style="margin:0;color:#9ca3af;font-size:11px;text-align:center;">© CREDO Gruppe – HR-Portal</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
    bodyText: `Einstellungsmodalitäten vollständig – {{vorgangsnummer}}

Die Einstellungsmodalitäten für {{mitarbeiter_name}} wurden eingereicht.

Einrichtung: {{einrichtung}}

CREDO HR-Portal`,
    variables: [
      { key: "{{mitarbeiter_name}}", description: "Vollständiger Name des Mitarbeiters" },
      { key: "{{einrichtung}}", description: "Name der Einrichtung" },
      { key: "{{vorgangsnummer}}", description: "Vorgangsnummer" },
    ],
  },

  // =============================================
  // Erinnerung Mitarbeiter (Fragebogen nicht ausgefuellt)
  // =============================================
  {
    event: "employee-reminder",
    name: "Erinnerung Mitarbeiter (Fragebogen ausstehend)",
    subject: "Erinnerung: Ihr Personalfragebogen ist noch offen – {{einrichtung}}",
    bodyHtml: `<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <tr><td style="background-color:#1a1a2e;border-radius:8px 8px 0 0;padding:24px 32px;">
          <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:bold;">CREDO HR-Portal</h1>
          <p style="margin:4px 0 0;color:#a0a0c0;font-size:13px;">{{einrichtung}}</p>
        </td></tr>
        <tr><td style="background-color:#ffffff;padding:32px;">
          <div style="display:inline-block;background-color:#fef3c7;border-radius:6px;padding:8px 16px;margin-bottom:24px;">
            <span style="color:#92400e;font-weight:bold;font-size:14px;">⏰ Erinnerung</span>
          </div>
          <h2 style="color:#1a1a2e;font-size:18px;margin:0 0 16px;">Ihr Personalfragebogen wartet auf Sie</h2>
          <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px;">
            Hallo {{vorname}}, wir haben festgestellt, dass Ihr Personalfragebogen seit <strong>{{tage_offen}} Tagen</strong> noch nicht vollständig ausgefüllt wurde.
          </p>
          <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 24px;">
            Bitte füllen Sie den Fragebogen zeitnah aus, damit wir Ihre Einstellung reibungslos vorbereiten können.
          </p>
          <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
            <tr><td style="background-color:#f59e0b;border-radius:8px;">
              <a href="{{link}}" style="display:inline-block;padding:14px 28px;color:#ffffff;text-decoration:none;font-weight:bold;font-size:15px;">
                Jetzt Fragebogen ausfüllen →
              </a>
            </td></tr>
          </table>
          <p style="color:#6b7280;font-size:13px;line-height:1.5;margin:0 0 8px;">
            Falls der Button nicht funktioniert:
          </p>
          <p style="color:#2563eb;font-size:12px;word-break:break-all;margin:0 0 24px;">{{link}}</p>
          <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
          <p style="color:#9ca3af;font-size:12px;margin:0;">
            Bei Fragen wenden Sie sich bitte an Ihre HR-Ansprechperson.<br>
            Diese E-Mail wurde automatisch vom CREDO HR-Portal versendet.
          </p>
        </td></tr>
        <tr><td style="background-color:#f9fafb;border-radius:0 0 8px 8px;padding:16px 32px;border-top:1px solid #e5e7eb;">
          <p style="margin:0;color:#9ca3af;font-size:11px;text-align:center;">
            © CREDO Gruppe – Freie Evangelische Schulen | {{einrichtung}}
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
    bodyText: `Erinnerung: Ihr Personalfragebogen wartet auf Sie

Hallo {{vorname}}, Ihr Personalfragebogen ist seit {{tage_offen}} Tagen offen.

Bitte fuellen Sie ihn zeitnah aus:
{{link}}

Bei Fragen wenden Sie sich bitte an Ihre HR-Ansprechperson.

CREDO Gruppe – {{einrichtung}}`,
    variables: [
      { key: "{{vorname}}", description: "Vorname des Mitarbeiters" },
      { key: "{{nachname}}", description: "Nachname des Mitarbeiters" },
      { key: "{{email}}", description: "E-Mail des Mitarbeiters" },
      { key: "{{einrichtung}}", description: "Name der Einrichtung" },
      { key: "{{link}}", description: "Link zum Personalfragebogen" },
      { key: "{{tage_offen}}", description: "Anzahl Tage seit Einladung" },
      { key: "{{vorgangsnummer}}", description: "Vorgangsnummer" },
    ],
  },

  // =============================================
  // Erinnerung Vorgesetzter (Einstellungsmodalitaeten ausstehend)
  // =============================================
  {
    event: "supervisor-reminder",
    name: "Erinnerung Vorgesetzter (Modalitaeten ausstehend)",
    subject: "Erinnerung: Einstellungsmodalitaeten für {{mitarbeiter_name}} offen",
    bodyHtml: `<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <tr><td style="background-color:#1a1a2e;border-radius:8px 8px 0 0;padding:24px 32px;">
          <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:bold;">CREDO HR-Portal</h1>
          <p style="margin:4px 0 0;color:#a0a0c0;font-size:13px;">{{einrichtung}}</p>
        </td></tr>
        <tr><td style="background-color:#ffffff;padding:32px;">
          <div style="display:inline-block;background-color:#fef3c7;border-radius:6px;padding:8px 16px;margin-bottom:24px;">
            <span style="color:#92400e;font-weight:bold;font-size:14px;">⏰ Erinnerung</span>
          </div>
          <h2 style="color:#1a1a2e;font-size:18px;margin:0 0 16px;">Einstellungsmodalitaeten ausstehend</h2>
          <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px;">
            Die Einstellungsmodalitaeten für <strong>{{mitarbeiter_name}}</strong> sind seit <strong>{{tage_offen}} Tagen</strong> offen.
          </p>
          <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 24px;">
            Bitte fuellen Sie das Formular zeitnah aus, damit die Personalabteilung den Arbeitsvertrag vorbereiten kann.
          </p>
          <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
            <tr><td style="background-color:#f59e0b;border-radius:8px;">
              <a href="{{supervisor_link}}" style="display:inline-block;padding:14px 28px;color:#ffffff;text-decoration:none;font-weight:bold;font-size:15px;">
                Einstellungsmodalitaeten ausfüllen →
              </a>
            </td></tr>
          </table>
          <p style="color:#6b7280;font-size:13px;line-height:1.5;margin:0 0 8px;">
            Falls der Button nicht funktioniert:
          </p>
          <p style="color:#2563eb;font-size:12px;word-break:break-all;margin:0 0 24px;">{{supervisor_link}}</p>
          <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
          <p style="color:#9ca3af;font-size:12px;margin:0;">
            Diese E-Mail wurde automatisch vom CREDO HR-Portal versendet.
          </p>
        </td></tr>
        <tr><td style="background-color:#f9fafb;border-radius:0 0 8px 8px;padding:16px 32px;border-top:1px solid #e5e7eb;">
          <p style="margin:0;color:#9ca3af;font-size:11px;text-align:center;">
            © CREDO Gruppe – Freie Evangelische Schulen | {{einrichtung}}
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
    bodyText: `Erinnerung: Einstellungsmodalitaeten ausstehend

Die Einstellungsmodalitaeten für {{mitarbeiter_name}} sind seit {{tage_offen}} Tagen offen.

Bitte fuellen Sie das Formular aus:
{{supervisor_link}}

CREDO Gruppe – {{einrichtung}}`,
    variables: [
      { key: "{{mitarbeiter_name}}", description: "Vollständiger Name des neuen Mitarbeiters" },
      { key: "{{email}}", description: "E-Mail des Vorgesetzten" },
      { key: "{{einrichtung}}", description: "Name der Einrichtung" },
      { key: "{{supervisor_link}}", description: "Link zum Vorgesetzten-Formular" },
      { key: "{{tage_offen}}", description: "Anzahl Tage seit Einreichung" },
      { key: "{{vorgangsnummer}}", description: "Vorgangsnummer" },
    ],
  },

  // =============================================
  // Offboarding: Neuer Vorgang erstellt
  // =============================================
  {
    event: "offboarding-created",
    name: "Neuer Offboarding-Vorgang erstellt",
    subject: "Neuer Offboarding-Vorgang: {{vorname}} {{nachname}}",
    bodyHtml: `<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <tr><td style="background-color:#1a1a2e;border-radius:8px 8px 0 0;padding:24px 32px;">
          <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:bold;">CREDO HR-Portal</h1>
          <p style="margin:4px 0 0;color:#a0a0c0;font-size:13px;">{{einrichtung}}</p>
        </td></tr>
        <tr><td style="background-color:#ffffff;padding:32px;">
          <div style="display:inline-block;background-color:#fee2e2;border-radius:6px;padding:8px 16px;margin-bottom:24px;">
            <span style="color:#991b1b;font-weight:bold;font-size:14px;">Offboarding gestartet</span>
          </div>
          <h2 style="color:#1a1a2e;font-size:18px;margin:0 0 16px;">Neuer Offboarding-Vorgang</h2>
          <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px;">
            Fuer <strong>{{vorname}} {{nachname}}</strong> wurde ein Offboarding-Vorgang angelegt.
          </p>
          <table cellpadding="0" cellspacing="0" style="width:100%;background-color:#f9fafb;border-radius:8px;margin:0 0 24px;">
            <tr><td style="padding:16px;">
              <p style="margin:0 0 4px;color:#6b7280;font-size:12px;">Mitarbeiter</p>
              <p style="margin:0;color:#374151;font-size:14px;">{{vorname}} {{nachname}}</p>
            </td></tr>
            <tr><td style="padding:0 16px 16px;">
              <p style="margin:0 0 4px;color:#6b7280;font-size:12px;">Austrittsdatum</p>
              <p style="margin:0;color:#374151;font-size:14px;">{{austrittsdatum}}</p>
            </td></tr>
            <tr><td style="padding:0 16px 16px;">
              <p style="margin:0 0 4px;color:#6b7280;font-size:12px;">Einrichtung</p>
              <p style="margin:0;color:#374151;font-size:14px;">{{einrichtung}}</p>
            </td></tr>
          </table>
          <p style="color:#9ca3af;font-size:12px;margin:0;">
            Diese E-Mail wurde automatisch vom CREDO HR-Portal versendet.
          </p>
        </td></tr>
        <tr><td style="background-color:#f9fafb;border-radius:0 0 8px 8px;padding:16px 32px;border-top:1px solid #e5e7eb;">
          <p style="margin:0;color:#9ca3af;font-size:11px;text-align:center;">© CREDO Gruppe – HR-Portal</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
    bodyText: `Neuer Offboarding-Vorgang: {{vorname}} {{nachname}}

Austrittsdatum: {{austrittsdatum}}
Einrichtung: {{einrichtung}}

CREDO HR-Portal`,
    variables: [
      { key: "{{vorname}}", description: "Vorname des Mitarbeiters" },
      { key: "{{nachname}}", description: "Nachname des Mitarbeiters" },
      { key: "{{email}}", description: "E-Mail des Mitarbeiters" },
      { key: "{{einrichtung}}", description: "Name der Einrichtung" },
      { key: "{{austrittsdatum}}", description: "Geplantes Austrittsdatum" },
      { key: "{{vorgangsnummer}}", description: "Vorgangsnummer" },
    ],
  },

  // =============================================
  // Offboarding: Abteilung zugewiesen
  // =============================================
  {
    event: "offboarding-department-assigned",
    name: "Offboarding-Aufgaben für Abteilung zugewiesen",
    subject: "Offboarding-Aufgaben für {{abteilung}}: {{vorname}} {{nachname}}",
    bodyHtml: `<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <tr><td style="background-color:#1a1a2e;border-radius:8px 8px 0 0;padding:24px 32px;">
          <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:bold;">CREDO HR-Portal</h1>
          <p style="margin:4px 0 0;color:#a0a0c0;font-size:13px;">{{einrichtung}}</p>
        </td></tr>
        <tr><td style="background-color:#ffffff;padding:32px;">
          <div style="display:inline-block;background-color:#dbeafe;border-radius:6px;padding:8px 16px;margin-bottom:24px;">
            <span style="color:#1e40af;font-weight:bold;font-size:14px;">Aufgaben zugewiesen</span>
          </div>
          <h2 style="color:#1a1a2e;font-size:18px;margin:0 0 16px;">Offboarding-Aufgaben für {{abteilung}}</h2>
          <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px;">
            Im Rahmen des Offboardings von <strong>{{vorname}} {{nachname}}</strong> wurden Ihrer Abteilung Aufgaben zugewiesen. Bitte bearbeiten Sie diese bis zum Austrittsdatum.
          </p>
          <table cellpadding="0" cellspacing="0" style="width:100%;background-color:#f9fafb;border-radius:8px;margin:0 0 24px;">
            <tr><td style="padding:16px;">
              <p style="margin:0 0 4px;color:#6b7280;font-size:12px;">Mitarbeiter</p>
              <p style="margin:0;color:#374151;font-size:14px;">{{vorname}} {{nachname}}</p>
            </td></tr>
            <tr><td style="padding:0 16px 16px;">
              <p style="margin:0 0 4px;color:#6b7280;font-size:12px;">Abteilung</p>
              <p style="margin:0;color:#374151;font-size:14px;">{{abteilung}}</p>
            </td></tr>
            <tr><td style="padding:0 16px 16px;">
              <p style="margin:0 0 4px;color:#6b7280;font-size:12px;">Austrittsdatum</p>
              <p style="margin:0;color:#374151;font-size:14px;">{{austrittsdatum}}</p>
            </td></tr>
          </table>
          <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
            <tr><td style="background-color:#2563eb;border-radius:8px;">
              <a href="{{link}}" style="display:inline-block;padding:14px 28px;color:#ffffff;text-decoration:none;font-weight:bold;font-size:15px;">
                Aufgaben ansehen →
              </a>
            </td></tr>
          </table>
          <p style="color:#9ca3af;font-size:12px;margin:0;">
            Diese E-Mail wurde automatisch vom CREDO HR-Portal versendet.
          </p>
        </td></tr>
        <tr><td style="background-color:#f9fafb;border-radius:0 0 8px 8px;padding:16px 32px;border-top:1px solid #e5e7eb;">
          <p style="margin:0;color:#9ca3af;font-size:11px;text-align:center;">© CREDO Gruppe – HR-Portal</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
    bodyText: `Offboarding-Aufgaben für {{abteilung}}: {{vorname}} {{nachname}}

Im Rahmen des Offboardings wurden Ihrer Abteilung Aufgaben zugewiesen.
Austrittsdatum: {{austrittsdatum}}

Aufgaben ansehen: {{link}}

CREDO HR-Portal`,
    variables: [
      { key: "{{vorname}}", description: "Vorname des Mitarbeiters" },
      { key: "{{nachname}}", description: "Nachname des Mitarbeiters" },
      { key: "{{abteilung}}", description: "Name der zugewiesenen Abteilung" },
      { key: "{{einrichtung}}", description: "Name der Einrichtung" },
      { key: "{{austrittsdatum}}", description: "Geplantes Austrittsdatum" },
      { key: "{{link}}", description: "Link zu den Offboarding-Aufgaben" },
      { key: "{{vorgangsnummer}}", description: "Vorgangsnummer" },
    ],
  },

  // =============================================
  // Offboarding: Aufgabe erledigt
  // =============================================
  {
    event: "offboarding-task-completed",
    name: "Offboarding-Aufgabe erledigt",
    subject: "Aufgabe erledigt: {{aufgabe}} ({{vorname}} {{nachname}})",
    bodyHtml: `<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <tr><td style="background-color:#1a1a2e;border-radius:8px 8px 0 0;padding:24px 32px;">
          <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:bold;">CREDO HR-Portal</h1>
          <p style="margin:4px 0 0;color:#a0a0c0;font-size:13px;">{{einrichtung}}</p>
        </td></tr>
        <tr><td style="background-color:#ffffff;padding:32px;">
          <div style="display:inline-block;background-color:#d1fae5;border-radius:6px;padding:8px 16px;margin-bottom:24px;">
            <span style="color:#065f46;font-weight:bold;font-size:14px;">Aufgabe erledigt</span>
          </div>
          <h2 style="color:#1a1a2e;font-size:18px;margin:0 0 16px;">{{aufgabe}}</h2>
          <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px;">
            Die Offboarding-Aufgabe <strong>{{aufgabe}}</strong> für <strong>{{vorname}} {{nachname}}</strong> wurde als erledigt markiert.
          </p>
          <table cellpadding="0" cellspacing="0" style="width:100%;background-color:#f9fafb;border-radius:8px;margin:0 0 24px;">
            <tr><td style="padding:16px;">
              <p style="margin:0 0 4px;color:#6b7280;font-size:12px;">Abteilung</p>
              <p style="margin:0;color:#374151;font-size:14px;">{{abteilung}}</p>
            </td></tr>
            <tr><td style="padding:0 16px 16px;">
              <p style="margin:0 0 4px;color:#6b7280;font-size:12px;">Offene Aufgaben</p>
              <p style="margin:0;color:#374151;font-size:14px;">{{offene_aufgaben}}</p>
            </td></tr>
          </table>
          <p style="color:#9ca3af;font-size:12px;margin:0;">
            Diese E-Mail wurde automatisch vom CREDO HR-Portal versendet.
          </p>
        </td></tr>
        <tr><td style="background-color:#f9fafb;border-radius:0 0 8px 8px;padding:16px 32px;border-top:1px solid #e5e7eb;">
          <p style="margin:0;color:#9ca3af;font-size:11px;text-align:center;">© CREDO Gruppe – HR-Portal</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
    bodyText: `Aufgabe erledigt: {{aufgabe}} ({{vorname}} {{nachname}})

Abteilung: {{abteilung}}
Offene Aufgaben: {{offene_aufgaben}}

CREDO HR-Portal`,
    variables: [
      { key: "{{vorname}}", description: "Vorname des Mitarbeiters" },
      { key: "{{nachname}}", description: "Nachname des Mitarbeiters" },
      { key: "{{aufgabe}}", description: "Name der erledigten Aufgabe" },
      { key: "{{abteilung}}", description: "Abteilung der Aufgabe" },
      { key: "{{einrichtung}}", description: "Name der Einrichtung" },
      { key: "{{offene_aufgaben}}", description: "Anzahl verbleibender offener Aufgaben" },
      { key: "{{vorgangsnummer}}", description: "Vorgangsnummer" },
    ],
  },

  // =============================================
  // Offboarding: Erinnerung offene Aufgaben
  // =============================================
  {
    event: "offboarding-reminder",
    name: "Erinnerung: Offene Offboarding-Aufgaben",
    subject: "Erinnerung: Offene Aufgaben für {{vorname}} {{nachname}}",
    bodyHtml: `<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <tr><td style="background-color:#1a1a2e;border-radius:8px 8px 0 0;padding:24px 32px;">
          <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:bold;">CREDO HR-Portal</h1>
          <p style="margin:4px 0 0;color:#a0a0c0;font-size:13px;">{{einrichtung}}</p>
        </td></tr>
        <tr><td style="background-color:#ffffff;padding:32px;">
          <div style="display:inline-block;background-color:#fef3c7;border-radius:6px;padding:8px 16px;margin-bottom:24px;">
            <span style="color:#92400e;font-weight:bold;font-size:14px;">Erinnerung</span>
          </div>
          <h2 style="color:#1a1a2e;font-size:18px;margin:0 0 16px;">Offene Offboarding-Aufgaben</h2>
          <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px;">
            Fuer das Offboarding von <strong>{{vorname}} {{nachname}}</strong> sind noch <strong>{{offene_aufgaben}} Aufgaben</strong> offen. Das Austrittsdatum ist der <strong>{{austrittsdatum}}</strong>.
          </p>
          <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
            <tr><td style="background-color:#f59e0b;border-radius:8px;">
              <a href="{{link}}" style="display:inline-block;padding:14px 28px;color:#ffffff;text-decoration:none;font-weight:bold;font-size:15px;">
                Aufgaben ansehen →
              </a>
            </td></tr>
          </table>
          <p style="color:#9ca3af;font-size:12px;margin:0;">
            Diese E-Mail wurde automatisch vom CREDO HR-Portal versendet.
          </p>
        </td></tr>
        <tr><td style="background-color:#f9fafb;border-radius:0 0 8px 8px;padding:16px 32px;border-top:1px solid #e5e7eb;">
          <p style="margin:0;color:#9ca3af;font-size:11px;text-align:center;">© CREDO Gruppe – HR-Portal</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
    bodyText: `Erinnerung: Offene Aufgaben für {{vorname}} {{nachname}}

Offene Aufgaben: {{offene_aufgaben}}
Austrittsdatum: {{austrittsdatum}}

Aufgaben ansehen: {{link}}

CREDO HR-Portal`,
    variables: [
      { key: "{{vorname}}", description: "Vorname des Mitarbeiters" },
      { key: "{{nachname}}", description: "Nachname des Mitarbeiters" },
      { key: "{{einrichtung}}", description: "Name der Einrichtung" },
      { key: "{{austrittsdatum}}", description: "Geplantes Austrittsdatum" },
      { key: "{{offene_aufgaben}}", description: "Anzahl offener Aufgaben" },
      { key: "{{link}}", description: "Link zu den Offboarding-Aufgaben" },
      { key: "{{vorgangsnummer}}", description: "Vorgangsnummer" },
    ],
  },

  // =============================================
  // Offboarding: Vorgang abgeschlossen
  // =============================================
  {
    event: "offboarding-completed",
    name: "Offboarding abgeschlossen",
    subject: "Offboarding abgeschlossen: {{vorname}} {{nachname}}",
    bodyHtml: `<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <tr><td style="background-color:#1a1a2e;border-radius:8px 8px 0 0;padding:24px 32px;">
          <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:bold;">CREDO HR-Portal</h1>
          <p style="margin:4px 0 0;color:#a0a0c0;font-size:13px;">{{einrichtung}}</p>
        </td></tr>
        <tr><td style="background-color:#ffffff;padding:32px;">
          <div style="display:inline-block;background-color:#d1fae5;border-radius:6px;padding:8px 16px;margin-bottom:24px;">
            <span style="color:#065f46;font-weight:bold;font-size:14px;">Abgeschlossen</span>
          </div>
          <h2 style="color:#1a1a2e;font-size:18px;margin:0 0 16px;">Offboarding abgeschlossen</h2>
          <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px;">
            Das Offboarding von <strong>{{vorname}} {{nachname}}</strong> wurde erfolgreich abgeschlossen. Alle Aufgaben sind erledigt.
          </p>
          <table cellpadding="0" cellspacing="0" style="width:100%;background-color:#f9fafb;border-radius:8px;margin:0 0 24px;">
            <tr><td style="padding:16px;">
              <p style="margin:0 0 4px;color:#6b7280;font-size:12px;">Mitarbeiter</p>
              <p style="margin:0;color:#374151;font-size:14px;">{{vorname}} {{nachname}}</p>
            </td></tr>
            <tr><td style="padding:0 16px 16px;">
              <p style="margin:0 0 4px;color:#6b7280;font-size:12px;">Austrittsdatum</p>
              <p style="margin:0;color:#374151;font-size:14px;">{{austrittsdatum}}</p>
            </td></tr>
            <tr><td style="padding:0 16px 16px;">
              <p style="margin:0 0 4px;color:#6b7280;font-size:12px;">Einrichtung</p>
              <p style="margin:0;color:#374151;font-size:14px;">{{einrichtung}}</p>
            </td></tr>
          </table>
          <p style="color:#9ca3af;font-size:12px;margin:0;">
            Diese E-Mail wurde automatisch vom CREDO HR-Portal versendet.
          </p>
        </td></tr>
        <tr><td style="background-color:#f9fafb;border-radius:0 0 8px 8px;padding:16px 32px;border-top:1px solid #e5e7eb;">
          <p style="margin:0;color:#9ca3af;font-size:11px;text-align:center;">© CREDO Gruppe – HR-Portal</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
    bodyText: `Offboarding abgeschlossen: {{vorname}} {{nachname}}

Austrittsdatum: {{austrittsdatum}}
Einrichtung: {{einrichtung}}

Alle Aufgaben wurden erledigt.

CREDO HR-Portal`,
    variables: [
      { key: "{{vorname}}", description: "Vorname des Mitarbeiters" },
      { key: "{{nachname}}", description: "Nachname des Mitarbeiters" },
      { key: "{{email}}", description: "E-Mail des Mitarbeiters" },
      { key: "{{einrichtung}}", description: "Name der Einrichtung" },
      { key: "{{austrittsdatum}}", description: "Austrittsdatum" },
      { key: "{{vorgangsnummer}}", description: "Vorgangsnummer" },
    ],
  },

  // =============================================
  // Offboarding: Abteilung vollstaendig abgeschlossen
  // =============================================
  {
    event: "offboarding-department-completed",
    name: "Offboarding: Abteilung abgeschlossen (Bestaetigung)",
    subject: "Offboarding-Aufgaben Ihrer Abteilung abgeschlossen: {{employeeName}}",
    bodyHtml: `<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <tr><td style="background-color:#1a1a2e;border-radius:8px 8px 0 0;padding:24px 32px;">
          <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:bold;">CREDO HR-Portal</h1>
          <p style="margin:4px 0 0;color:#a0a0c0;font-size:13px;">{{organizationName}}</p>
        </td></tr>
        <tr><td style="background-color:#ffffff;padding:32px;">
          <div style="display:inline-block;background-color:#d1fae5;border-radius:6px;padding:8px 16px;margin-bottom:24px;">
            <span style="color:#065f46;font-weight:bold;font-size:14px;">Abteilung abgeschlossen</span>
          </div>
          <h2 style="color:#1a1a2e;font-size:18px;margin:0 0 16px;">Alle Aufgaben Ihrer Abteilung erledigt</h2>
          <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px;">
            Vielen Dank. Im Rahmen des Offboardings von <strong>{{employeeName}}</strong> wurden alle Aufgaben der Abteilung <strong>{{departmentName}}</strong> als erledigt markiert.
          </p>
          <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 24px;">
            Es sind keine weiteren Schritte Ihrerseits erforderlich. Diese E-Mail dient als Bestaetigung.
          </p>
          <p style="color:#9ca3af;font-size:12px;margin:0;">
            Diese E-Mail wurde automatisch vom CREDO HR-Portal versendet.
          </p>
        </td></tr>
        <tr><td style="background-color:#f9fafb;border-radius:0 0 8px 8px;padding:16px 32px;border-top:1px solid #e5e7eb;">
          <p style="margin:0;color:#9ca3af;font-size:11px;text-align:center;">© CREDO Gruppe – HR-Portal</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
    bodyText: `Offboarding-Aufgaben Ihrer Abteilung abgeschlossen: {{employeeName}}

Im Rahmen des Offboardings von {{employeeName}} wurden alle Aufgaben der Abteilung {{departmentName}} erledigt.

Es sind keine weiteren Schritte Ihrerseits erforderlich.

CREDO HR-Portal`,
    variables: [
      { key: "{{employeeName}}", description: "Name des ausscheidenden Mitarbeiters" },
      { key: "{{departmentName}}", description: "Name der abgeschlossenen Abteilung" },
      { key: "{{organizationName}}", description: "Name der Einrichtung" },
      { key: "{{email}}", description: "E-Mail der Abteilungs-Kontaktperson (Empfaenger)" },
      { key: "{{vorgangsnummer}}", description: "Vorgangsnummer (displayId)" },
    ],
  },

  // =============================================
  // Exit-Interview: Einladung an ausscheidende:n Mitarbeiter:in
  // =============================================
  {
    event: "exit-interview-invited",
    name: "Exit-Interview: Einladung",
    subject: "Einladung zum Exit-Interview – {{einrichtung}}",
    bodyHtml: `<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <tr><td style="background-color:#1a1a2e;border-radius:8px 8px 0 0;padding:24px 32px;">
          <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:bold;">CREDO HR-Portal</h1>
          <p style="margin:4px 0 0;color:#a0a0c0;font-size:13px;">{{einrichtung}}</p>
        </td></tr>
        <tr><td style="background-color:#ffffff;padding:32px;">
          <h2 style="color:#1a1a2e;font-size:18px;margin:0 0 16px;">Ihre Meinung ist uns wichtig</h2>
          <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px;">
            Anlaesslich Ihres Ausscheidens moechten wir Sie zu einem kurzen, vertraulichen Exit-Interview einladen. Ihre Rueckmeldung hilft uns, uns als Arbeitgeber weiterzuentwickeln.
          </p>
          <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 24px;">
            Die Teilnahme ist freiwillig und Ihre Antworten werden vertraulich behandelt. Der Zugang ist <strong>bis zum {{ablaufdatum}}</strong> gültig.
          </p>
          <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
            <tr><td style="background-color:#2563eb;border-radius:8px;">
              <a href="{{link}}" style="display:inline-block;padding:14px 28px;color:#ffffff;text-decoration:none;font-weight:bold;font-size:15px;">
                Exit-Interview starten →
              </a>
            </td></tr>
          </table>
          <p style="color:#6b7280;font-size:13px;line-height:1.5;margin:0 0 8px;">
            Falls der Button nicht funktioniert, kopieren Sie bitte diesen Link in Ihren Browser:
          </p>
          <p style="color:#2563eb;font-size:12px;word-break:break-all;margin:0 0 24px;">{{link}}</p>
          <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
          <p style="color:#9ca3af;font-size:12px;margin:0;">
            Bei Fragen wenden Sie sich bitte an Ihre HR-Ansprechperson.<br>
            Diese E-Mail wurde automatisch vom CREDO HR-Portal versendet.
          </p>
        </td></tr>
        <tr><td style="background-color:#f9fafb;border-radius:0 0 8px 8px;padding:16px 32px;border-top:1px solid #e5e7eb;">
          <p style="margin:0;color:#9ca3af;font-size:11px;text-align:center;">
            © CREDO Gruppe – Freie Evangelische Schulen | {{einrichtung}}
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
    bodyText: `Einladung zum Exit-Interview

Anlaesslich Ihres Ausscheidens moechten wir Sie zu einem kurzen, vertraulichen Exit-Interview einladen.

Die Teilnahme ist freiwillig (gültig bis {{ablaufdatum}}):
{{link}}

Bei Fragen wenden Sie sich bitte an Ihre HR-Ansprechperson.

CREDO Gruppe – {{einrichtung}}`,
    variables: [
      { key: "{{vorname}}", description: "Vorname des Mitarbeiters" },
      { key: "{{email}}", description: "E-Mail des Mitarbeiters (Empfaenger)" },
      { key: "{{einrichtung}}", description: "Name der Einrichtung" },
      { key: "{{link}}", description: "Magic-Link zum Exit-Interview" },
      { key: "{{ablaufdatum}}", description: "Ablaufdatum des Links" },
      { key: "{{vorgangsnummer}}", description: "Vorgangsnummer" },
    ],
  },

  // =============================================
  // Verbeamtung / PSI: Neuer Vorgang angelegt
  // =============================================
  {
    event: "psi-created",
    name: "Verbeamtung: Vorgang angelegt",
    subject: "Verbeamtungsvorgang angelegt – {{mitarbeiter_name}} ({{vorgangsnummer}})",
    bodyHtml: `<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <tr><td style="background-color:#1a1a2e;border-radius:8px 8px 0 0;padding:24px 32px;">
          <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:bold;">CREDO HR-Portal</h1>
          <p style="margin:4px 0 0;color:#a0a0c0;font-size:13px;">{{einrichtung}}</p>
        </td></tr>
        <tr><td style="background-color:#ffffff;padding:32px;">
          <div style="display:inline-block;background-color:#dbeafe;border-radius:6px;padding:8px 16px;margin-bottom:24px;">
            <span style="color:#1e40af;font-weight:bold;font-size:14px;">Verbeamtung gestartet</span>
          </div>
          <h2 style="color:#1a1a2e;font-size:18px;margin:0 0 16px;">Neuer Verbeamtungsvorgang</h2>
          <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px;">
            Für <strong>{{mitarbeiter_name}}</strong> wurde ein Verbeamtungsvorgang (PSI) angelegt. Das Verfahren wird nun gemaess den festgelegten Phasen begleitet.
          </p>
          <table cellpadding="0" cellspacing="0" style="width:100%;background-color:#f9fafb;border-radius:8px;margin:0 0 24px;">
            <tr><td style="padding:16px;">
              <p style="margin:0 0 8px;color:#6b7280;font-size:12px;text-transform:uppercase;font-weight:bold;">Vorgang</p>
              <p style="margin:0;color:#1a1a2e;font-size:15px;font-weight:bold;">{{vorgangsnummer}}</p>
            </td></tr>
            <tr><td style="padding:0 16px 16px;">
              <p style="margin:0 0 4px;color:#6b7280;font-size:12px;">Einrichtung</p>
              <p style="margin:0;color:#374151;font-size:14px;">{{einrichtung}}</p>
            </td></tr>
          </table>
          <p style="color:#9ca3af;font-size:12px;margin:0;">
            Diese E-Mail wurde automatisch vom CREDO HR-Portal versendet.
          </p>
        </td></tr>
        <tr><td style="background-color:#f9fafb;border-radius:0 0 8px 8px;padding:16px 32px;border-top:1px solid #e5e7eb;">
          <p style="margin:0;color:#9ca3af;font-size:11px;text-align:center;">© CREDO Gruppe – HR-Portal</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
    bodyText: `Neuer Verbeamtungsvorgang – {{vorgangsnummer}}

Für {{mitarbeiter_name}} wurde ein Verbeamtungsvorgang (PSI) angelegt.

Einrichtung: {{einrichtung}}

CREDO HR-Portal`,
    variables: [
      { key: "{{mitarbeiter_name}}", description: "Name des Mitarbeiters" },
      { key: "{{email}}", description: "E-Mail des Mitarbeiters" },
      { key: "{{einrichtung}}", description: "Name der Einrichtung" },
      { key: "{{vorgangsnummer}}", description: "Vorgangsnummer (displayId)" },
    ],
  },

  // =============================================
  // Verbeamtung / PSI: Phase abgeschlossen
  // =============================================
  {
    event: "psi-phase-completed",
    name: "Verbeamtung: Phase abgeschlossen",
    subject: "Verbeamtung – Phase abgeschlossen: {{phaseName}} ({{vorgangsnummer}})",
    bodyHtml: `<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <tr><td style="background-color:#1a1a2e;border-radius:8px 8px 0 0;padding:24px 32px;">
          <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:bold;">CREDO HR-Portal</h1>
          <p style="margin:4px 0 0;color:#a0a0c0;font-size:13px;">{{einrichtung}}</p>
        </td></tr>
        <tr><td style="background-color:#ffffff;padding:32px;">
          <div style="display:inline-block;background-color:#d1fae5;border-radius:6px;padding:8px 16px;margin-bottom:24px;">
            <span style="color:#065f46;font-weight:bold;font-size:14px;">Phase abgeschlossen</span>
          </div>
          <h2 style="color:#1a1a2e;font-size:18px;margin:0 0 16px;">{{phaseName}}</h2>
          <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px;">
            Im Verbeamtungsvorgang von <strong>{{mitarbeiter_name}}</strong> wurde die Phase <strong>{{phaseName}}</strong> abgeschlossen.
          </p>
          <table cellpadding="0" cellspacing="0" style="width:100%;background-color:#f9fafb;border-radius:8px;margin:0 0 24px;">
            <tr><td style="padding:16px;">
              <p style="margin:0 0 4px;color:#6b7280;font-size:12px;">Vorgang</p>
              <p style="margin:0;color:#374151;font-size:14px;">{{vorgangsnummer}}</p>
            </td></tr>
          </table>
          <p style="color:#9ca3af;font-size:12px;margin:0;">
            Diese E-Mail wurde automatisch vom CREDO HR-Portal versendet.
          </p>
        </td></tr>
        <tr><td style="background-color:#f9fafb;border-radius:0 0 8px 8px;padding:16px 32px;border-top:1px solid #e5e7eb;">
          <p style="margin:0;color:#9ca3af;font-size:11px;text-align:center;">© CREDO Gruppe – HR-Portal</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
    bodyText: `Verbeamtung – Phase abgeschlossen: {{phaseName}}

Vorgang: {{vorgangsnummer}}
Mitarbeiter: {{mitarbeiter_name}}

CREDO HR-Portal`,
    variables: [
      { key: "{{mitarbeiter_name}}", description: "Name des Mitarbeiters" },
      { key: "{{einrichtung}}", description: "Name der Einrichtung" },
      { key: "{{phaseName}}", description: "Bezeichnung der abgeschlossenen Phase" },
      { key: "{{vorgangsnummer}}", description: "Vorgangsnummer (displayId)" },
    ],
  },

  // =============================================
  // Verbeamtung / PSI: Vorgang abgeschlossen (Beiratsentscheidung)
  // =============================================
  {
    event: "psi-completed",
    name: "Verbeamtung: Vorgang abgeschlossen",
    subject: "Verbeamtung abgeschlossen – {{mitarbeiter_name}} ({{vorgangsnummer}})",
    bodyHtml: `<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <tr><td style="background-color:#1a1a2e;border-radius:8px 8px 0 0;padding:24px 32px;">
          <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:bold;">CREDO HR-Portal</h1>
          <p style="margin:4px 0 0;color:#a0a0c0;font-size:13px;">{{einrichtung}}</p>
        </td></tr>
        <tr><td style="background-color:#ffffff;padding:32px;">
          <div style="display:inline-block;background-color:#d1fae5;border-radius:6px;padding:8px 16px;margin-bottom:24px;">
            <span style="color:#065f46;font-weight:bold;font-size:14px;">Abgeschlossen</span>
          </div>
          <h2 style="color:#1a1a2e;font-size:18px;margin:0 0 16px;">Verbeamtungsvorgang abgeschlossen</h2>
          <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px;">
            Der Verbeamtungsvorgang von <strong>{{mitarbeiter_name}}</strong> wurde mit einer Beiratsentscheidung abgeschlossen.
          </p>
          <table cellpadding="0" cellspacing="0" style="width:100%;background-color:#f9fafb;border-radius:8px;margin:0 0 24px;">
            <tr><td style="padding:16px;">
              <p style="margin:0 0 4px;color:#6b7280;font-size:12px;">Vorgang</p>
              <p style="margin:0;color:#374151;font-size:14px;">{{vorgangsnummer}}</p>
            </td></tr>
            <tr><td style="padding:0 16px 16px;">
              <p style="margin:0 0 4px;color:#6b7280;font-size:12px;">Entscheidung</p>
              <p style="margin:0;color:#374151;font-size:14px;">{{decisionType}}</p>
            </td></tr>
          </table>
          <p style="color:#9ca3af;font-size:12px;margin:0;">
            Diese E-Mail wurde automatisch vom CREDO HR-Portal versendet.
          </p>
        </td></tr>
        <tr><td style="background-color:#f9fafb;border-radius:0 0 8px 8px;padding:16px 32px;border-top:1px solid #e5e7eb;">
          <p style="margin:0;color:#9ca3af;font-size:11px;text-align:center;">© CREDO Gruppe – HR-Portal</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
    bodyText: `Verbeamtung abgeschlossen – {{vorgangsnummer}}

Der Verbeamtungsvorgang von {{mitarbeiter_name}} wurde abgeschlossen.
Entscheidung: {{decisionType}}

CREDO HR-Portal`,
    variables: [
      { key: "{{mitarbeiter_name}}", description: "Name des Mitarbeiters" },
      { key: "{{email}}", description: "E-Mail des Mitarbeiters" },
      { key: "{{einrichtung}}", description: "Name der Einrichtung" },
      { key: "{{decisionType}}", description: "Art der Beiratsentscheidung" },
      { key: "{{vorgangsnummer}}", description: "Vorgangsnummer (displayId)" },
    ],
  },

  // =============================================
  // Verbeamtung / PSI: Beurteilung angefordert (an Gutachter:in)
  // =============================================
  {
    event: "psi-assessment-requested",
    name: "Verbeamtung: Beurteilung angefordert",
    subject: "Bitte um Beurteilung – {{mitarbeiter_name}} ({{vorgangsnummer}})",
    bodyHtml: `<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <tr><td style="background-color:#1a1a2e;border-radius:8px 8px 0 0;padding:24px 32px;">
          <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:bold;">CREDO HR-Portal</h1>
          <p style="margin:4px 0 0;color:#a0a0c0;font-size:13px;">{{einrichtung}}</p>
        </td></tr>
        <tr><td style="background-color:#ffffff;padding:32px;">
          <h2 style="color:#1a1a2e;font-size:18px;margin:0 0 16px;">Beurteilung erbeten</h2>
          <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px;">
            Im Rahmen des Verbeamtungsverfahrens von <strong>{{mitarbeiter_name}}</strong> bitten wir Sie um Ihre Beurteilung.
          </p>
          <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 24px;">
            Bitte füllen Sie den Beurteilungsbogen über den nachstehenden Link aus. Der Zugang ist <strong>bis zum {{ablaufdatum}}</strong> gültig.
          </p>
          <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
            <tr><td style="background-color:#2563eb;border-radius:8px;">
              <a href="{{link}}" style="display:inline-block;padding:14px 28px;color:#ffffff;text-decoration:none;font-weight:bold;font-size:15px;">
                Beurteilung ausfüllen →
              </a>
            </td></tr>
          </table>
          <p style="color:#6b7280;font-size:13px;line-height:1.5;margin:0 0 8px;">
            Falls der Button nicht funktioniert, kopieren Sie bitte diesen Link:
          </p>
          <p style="color:#2563eb;font-size:12px;word-break:break-all;margin:0 0 24px;">{{link}}</p>
          <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
          <p style="color:#9ca3af;font-size:12px;margin:0;">
            Diese E-Mail wurde automatisch vom CREDO HR-Portal versendet.
          </p>
        </td></tr>
        <tr><td style="background-color:#f9fafb;border-radius:0 0 8px 8px;padding:16px 32px;border-top:1px solid #e5e7eb;">
          <p style="margin:0;color:#9ca3af;font-size:11px;text-align:center;">© CREDO Gruppe – HR-Portal</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
    bodyText: `Beurteilung erbeten – {{mitarbeiter_name}}

Im Rahmen des Verbeamtungsverfahrens bitten wir Sie um Ihre Beurteilung.

Bitte füllen Sie den Beurteilungsbogen aus (gültig bis {{ablaufdatum}}):
{{link}}

CREDO HR-Portal`,
    variables: [
      { key: "{{mitarbeiter_name}}", description: "Name des zu beurteilenden Mitarbeiters" },
      { key: "{{email}}", description: "E-Mail der Gutachterin / des Gutachters (Empfaenger)" },
      { key: "{{recipientName}}", description: "Name der Gutachterin / des Gutachters" },
      { key: "{{einrichtung}}", description: "Name der Einrichtung" },
      { key: "{{link}}", description: "Magic-Link zum Beurteilungsbogen" },
      { key: "{{ablaufdatum}}", description: "Ablaufdatum des Links" },
      { key: "{{vorgangsnummer}}", description: "Vorgangsnummer (displayId)" },
    ],
  },

  // =============================================
  // Verbeamtung / PSI: Beurteilung eingereicht (HR-Benachrichtigung)
  // =============================================
  {
    event: "psi-assessment-completed",
    name: "Verbeamtung: Beurteilung eingereicht",
    subject: "Beurteilung eingegangen – {{mitarbeiter_name}} ({{vorgangsnummer}})",
    bodyHtml: `<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <tr><td style="background-color:#1a1a2e;border-radius:8px 8px 0 0;padding:24px 32px;">
          <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:bold;">CREDO HR-Portal</h1>
          <p style="margin:4px 0 0;color:#a0a0c0;font-size:13px;">{{einrichtung}}</p>
        </td></tr>
        <tr><td style="background-color:#ffffff;padding:32px;">
          <div style="display:inline-block;background-color:#d1fae5;border-radius:6px;padding:8px 16px;margin-bottom:24px;">
            <span style="color:#065f46;font-weight:bold;font-size:14px;">Beurteilung eingegangen</span>
          </div>
          <h2 style="color:#1a1a2e;font-size:18px;margin:0 0 16px;">Beurteilung eingereicht</h2>
          <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px;">
            Die angeforderte Beurteilung im Verbeamtungsvorgang von <strong>{{mitarbeiter_name}}</strong> wurde eingereicht.
          </p>
          <table cellpadding="0" cellspacing="0" style="width:100%;background-color:#f9fafb;border-radius:8px;margin:0 0 24px;">
            <tr><td style="padding:16px;">
              <p style="margin:0 0 4px;color:#6b7280;font-size:12px;">Vorgang</p>
              <p style="margin:0;color:#374151;font-size:14px;">{{vorgangsnummer}}</p>
            </td></tr>
          </table>
          <p style="color:#9ca3af;font-size:12px;margin:0;">
            Diese E-Mail wurde automatisch vom CREDO HR-Portal versendet.
          </p>
        </td></tr>
        <tr><td style="background-color:#f9fafb;border-radius:0 0 8px 8px;padding:16px 32px;border-top:1px solid #e5e7eb;">
          <p style="margin:0;color:#9ca3af;font-size:11px;text-align:center;">© CREDO Gruppe – HR-Portal</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
    bodyText: `Beurteilung eingegangen – {{vorgangsnummer}}

Die angeforderte Beurteilung im Verbeamtungsvorgang von {{mitarbeiter_name}} wurde eingereicht.

CREDO HR-Portal`,
    variables: [
      { key: "{{mitarbeiter_name}}", description: "Name des beurteilten Mitarbeiters" },
      { key: "{{einrichtung}}", description: "Name der Einrichtung" },
      { key: "{{recipientName}}", description: "Name der Gutachterin / des Gutachters" },
      { key: "{{vorgangsnummer}}", description: "Vorgangsnummer (displayId)" },
    ],
  },

  // =============================================
  // Verbeamtung / PSI: Beurteilung freigegeben (an Beschaeftigte:n)
  // =============================================
  {
    event: "psi-assessment-released",
    name: "Verbeamtung: Beurteilung freigegeben",
    subject: "Ihre Beurteilung liegt vor – bitte bestaetigen ({{vorgangsnummer}})",
    bodyHtml: `<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <tr><td style="background-color:#1a1a2e;border-radius:8px 8px 0 0;padding:24px 32px;">
          <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:bold;">CREDO HR-Portal</h1>
          <p style="margin:4px 0 0;color:#a0a0c0;font-size:13px;">{{einrichtung}}</p>
        </td></tr>
        <tr><td style="background-color:#ffffff;padding:32px;">
          <h2 style="color:#1a1a2e;font-size:18px;margin:0 0 16px;">Ihre Beurteilung liegt vor</h2>
          <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px;">
            Im Rahmen Ihres Verbeamtungsverfahrens wurde eine Beurteilung für Sie freigegeben. Bitte nehmen Sie diese zur Kenntnis und bestaetigen Sie den Erhalt.
          </p>
          <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 24px;">
            Der Zugang ist <strong>bis zum {{ablaufdatum}}</strong> gültig.
          </p>
          <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
            <tr><td style="background-color:#2563eb;border-radius:8px;">
              <a href="{{link}}" style="display:inline-block;padding:14px 28px;color:#ffffff;text-decoration:none;font-weight:bold;font-size:15px;">
                Beurteilung ansehen &amp; bestaetigen →
              </a>
            </td></tr>
          </table>
          <p style="color:#6b7280;font-size:13px;line-height:1.5;margin:0 0 8px;">
            Falls der Button nicht funktioniert, kopieren Sie bitte diesen Link:
          </p>
          <p style="color:#2563eb;font-size:12px;word-break:break-all;margin:0 0 24px;">{{link}}</p>
          <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
          <p style="color:#9ca3af;font-size:12px;margin:0;">
            Bei Fragen wenden Sie sich bitte an Ihre HR-Ansprechperson.<br>
            Diese E-Mail wurde automatisch vom CREDO HR-Portal versendet.
          </p>
        </td></tr>
        <tr><td style="background-color:#f9fafb;border-radius:0 0 8px 8px;padding:16px 32px;border-top:1px solid #e5e7eb;">
          <p style="margin:0;color:#9ca3af;font-size:11px;text-align:center;">© CREDO Gruppe – HR-Portal</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
    bodyText: `Ihre Beurteilung liegt vor – {{vorgangsnummer}}

Im Rahmen Ihres Verbeamtungsverfahrens wurde eine Beurteilung freigegeben. Bitte nehmen Sie diese zur Kenntnis und bestaetigen Sie den Erhalt (gültig bis {{ablaufdatum}}):
{{link}}

CREDO HR-Portal`,
    variables: [
      { key: "{{mitarbeiter_name}}", description: "Name des Mitarbeiters" },
      { key: "{{email}}", description: "E-Mail des Mitarbeiters (Empfaenger)" },
      { key: "{{einrichtung}}", description: "Name der Einrichtung" },
      { key: "{{link}}", description: "Bestaetigungs-Link (ackLink)" },
      { key: "{{ablaufdatum}}", description: "Ablaufdatum des Links" },
      { key: "{{vorgangsnummer}}", description: "Vorgangsnummer (displayId)" },
    ],
  },

  // =============================================
  // Verbeamtung / PSI: Beurteilung zur Kenntnis genommen (HR-Benachrichtigung)
  // =============================================
  {
    event: "psi-assessment-acknowledged",
    name: "Verbeamtung: Beurteilung zur Kenntnis genommen",
    subject: "Beurteilung bestaetigt – {{mitarbeiter_name}} ({{vorgangsnummer}})",
    bodyHtml: `<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <tr><td style="background-color:#1a1a2e;border-radius:8px 8px 0 0;padding:24px 32px;">
          <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:bold;">CREDO HR-Portal</h1>
          <p style="margin:4px 0 0;color:#a0a0c0;font-size:13px;">{{einrichtung}}</p>
        </td></tr>
        <tr><td style="background-color:#ffffff;padding:32px;">
          <div style="display:inline-block;background-color:#d1fae5;border-radius:6px;padding:8px 16px;margin-bottom:24px;">
            <span style="color:#065f46;font-weight:bold;font-size:14px;">Zur Kenntnis genommen</span>
          </div>
          <h2 style="color:#1a1a2e;font-size:18px;margin:0 0 16px;">Beurteilung bestaetigt</h2>
          <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px;">
            <strong>{{mitarbeiter_name}}</strong> hat die freigegebene Beurteilung zur Kenntnis genommen und den Erhalt bestaetigt.
          </p>
          <table cellpadding="0" cellspacing="0" style="width:100%;background-color:#f9fafb;border-radius:8px;margin:0 0 24px;">
            <tr><td style="padding:16px;">
              <p style="margin:0 0 4px;color:#6b7280;font-size:12px;">Vorgang</p>
              <p style="margin:0;color:#374151;font-size:14px;">{{vorgangsnummer}}</p>
            </td></tr>
          </table>
          <p style="color:#9ca3af;font-size:12px;margin:0;">
            Diese E-Mail wurde automatisch vom CREDO HR-Portal versendet.
          </p>
        </td></tr>
        <tr><td style="background-color:#f9fafb;border-radius:0 0 8px 8px;padding:16px 32px;border-top:1px solid #e5e7eb;">
          <p style="margin:0;color:#9ca3af;font-size:11px;text-align:center;">© CREDO Gruppe – HR-Portal</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
    bodyText: `Beurteilung bestaetigt – {{vorgangsnummer}}

{{mitarbeiter_name}} hat die freigegebene Beurteilung zur Kenntnis genommen.

CREDO HR-Portal`,
    variables: [
      { key: "{{mitarbeiter_name}}", description: "Name des Mitarbeiters" },
      { key: "{{einrichtung}}", description: "Name der Einrichtung" },
      { key: "{{vorgangsnummer}}", description: "Vorgangsnummer (displayId)" },
    ],
  },

  // =============================================
  // Verbeamtung / PSI: Beurteilung archiviert (HR-Benachrichtigung)
  // =============================================
  {
    event: "psi-assessment-archived",
    name: "Verbeamtung: Beurteilung archiviert",
    subject: "Beurteilung archiviert – {{mitarbeiter_name}} ({{vorgangsnummer}})",
    bodyHtml: `<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <tr><td style="background-color:#1a1a2e;border-radius:8px 8px 0 0;padding:24px 32px;">
          <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:bold;">CREDO HR-Portal</h1>
          <p style="margin:4px 0 0;color:#a0a0c0;font-size:13px;">{{einrichtung}}</p>
        </td></tr>
        <tr><td style="background-color:#ffffff;padding:32px;">
          <div style="display:inline-block;background-color:#e5e7eb;border-radius:6px;padding:8px 16px;margin-bottom:24px;">
            <span style="color:#374151;font-weight:bold;font-size:14px;">Archiviert</span>
          </div>
          <h2 style="color:#1a1a2e;font-size:18px;margin:0 0 16px;">Beurteilung archiviert</h2>
          <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px;">
            Die Beurteilung im Verbeamtungsvorgang von <strong>{{mitarbeiter_name}}</strong> wurde archiviert. Es sind keine weiteren Schritte erforderlich.
          </p>
          <table cellpadding="0" cellspacing="0" style="width:100%;background-color:#f9fafb;border-radius:8px;margin:0 0 24px;">
            <tr><td style="padding:16px;">
              <p style="margin:0 0 4px;color:#6b7280;font-size:12px;">Vorgang</p>
              <p style="margin:0;color:#374151;font-size:14px;">{{vorgangsnummer}}</p>
            </td></tr>
          </table>
          <p style="color:#9ca3af;font-size:12px;margin:0;">
            Diese E-Mail wurde automatisch vom CREDO HR-Portal versendet.
          </p>
        </td></tr>
        <tr><td style="background-color:#f9fafb;border-radius:0 0 8px 8px;padding:16px 32px;border-top:1px solid #e5e7eb;">
          <p style="margin:0;color:#9ca3af;font-size:11px;text-align:center;">© CREDO Gruppe – HR-Portal</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
    bodyText: `Beurteilung archiviert – {{vorgangsnummer}}

Die Beurteilung im Verbeamtungsvorgang von {{mitarbeiter_name}} wurde archiviert.

CREDO HR-Portal`,
    variables: [
      { key: "{{mitarbeiter_name}}", description: "Name des Mitarbeiters" },
      { key: "{{einrichtung}}", description: "Name der Einrichtung" },
      { key: "{{vorgangsnummer}}", description: "Vorgangsnummer (displayId)" },
    ],
  },

  // =============================================
  // Verbeamtung / PSI: Fristen-Warnung (Sammelmail an HR)
  // =============================================
  {
    event: "psi-deadline-warning",
    name: "Verbeamtung: Fristen-Warnung (HR-Sammelmail)",
    subject: "Verbeamtung: {{totalWarnings}} Frist(en) erfordern Aufmerksamkeit",
    bodyHtml: `<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <tr><td style="background-color:#1a1a2e;border-radius:8px 8px 0 0;padding:24px 32px;">
          <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:bold;">CREDO HR-Portal</h1>
        </td></tr>
        <tr><td style="background-color:#ffffff;padding:32px;">
          <div style="display:inline-block;background-color:#fef3c7;border-radius:6px;padding:8px 16px;margin-bottom:24px;">
            <span style="color:#92400e;font-weight:bold;font-size:14px;">Fristen-Warnung</span>
          </div>
          <h2 style="color:#1a1a2e;font-size:18px;margin:0 0 16px;">Offene Fristen im Verbeamtungsverfahren</h2>
          <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px;">
            Im taeglichen Fristen-Lauf wurden <strong>{{totalWarnings}}</strong> Verbeamtungsvorgang/-vorgaenge mit fristrelevanten Hinweisen erkannt. Hoechste Dringlichkeit: <strong>{{topSeverity}}</strong>.
          </p>
          <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 24px;">
            Bitte pruefen Sie die betroffenen Vorgaenge im HR-Portal und veranlassen Sie die erforderlichen Schritte.
          </p>
          <p style="color:#9ca3af;font-size:12px;margin:0;">
            Diese E-Mail wurde automatisch vom CREDO HR-Portal versendet.
          </p>
        </td></tr>
        <tr><td style="background-color:#f9fafb;border-radius:0 0 8px 8px;padding:16px 32px;border-top:1px solid #e5e7eb;">
          <p style="margin:0;color:#9ca3af;font-size:11px;text-align:center;">© CREDO Gruppe – HR-Portal</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
    bodyText: `Verbeamtung: Fristen-Warnung

Im taeglichen Fristen-Lauf wurden {{totalWarnings}} Vorgang/Vorgaenge mit fristrelevanten Hinweisen erkannt.
Hoechste Dringlichkeit: {{topSeverity}}

Bitte pruefen Sie die betroffenen Vorgaenge im HR-Portal.

CREDO HR-Portal`,
    variables: [
      { key: "{{totalWarnings}}", description: "Anzahl betroffener Vorgaenge" },
      { key: "{{topSeverity}}", description: "Hoechste Dringlichkeitsstufe (OVERDUE/URGENT/WARNING)" },
    ],
  },

  // =============================================
  // Elternzeit: Vorgang angelegt
  // =============================================
  {
    event: "elternzeit-angelegt",
    name: "Elternzeit: Vorgang angelegt",
    subject: "Elternzeit-Vorgang angelegt – {{mitarbeiter_name}} ({{vorgangsnummer}})",
    bodyHtml: `<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <tr><td style="background-color:#1a1a2e;border-radius:8px 8px 0 0;padding:24px 32px;">
          <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:bold;">CREDO HR-Portal</h1>
          <p style="margin:4px 0 0;color:#a0a0c0;font-size:13px;">{{einrichtung}}</p>
        </td></tr>
        <tr><td style="background-color:#ffffff;padding:32px;">
          <div style="display:inline-block;background-color:#dbeafe;border-radius:6px;padding:8px 16px;margin-bottom:24px;">
            <span style="color:#1e40af;font-weight:bold;font-size:14px;">Elternzeit gestartet</span>
          </div>
          <h2 style="color:#1a1a2e;font-size:18px;margin:0 0 16px;">Neuer Elternzeit-Vorgang</h2>
          <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px;">
            Für <strong>{{mitarbeiter_name}}</strong> wurde ein Elternzeit-Vorgang angelegt. Das Verfahren wird nun begleitet.
          </p>
          <table cellpadding="0" cellspacing="0" style="width:100%;background-color:#f9fafb;border-radius:8px;margin:0 0 24px;">
            <tr><td style="padding:16px;">
              <p style="margin:0 0 4px;color:#6b7280;font-size:12px;">Vorgang</p>
              <p style="margin:0;color:#374151;font-size:14px;">{{vorgangsnummer}}</p>
            </td></tr>
            <tr><td style="padding:0 16px 16px;">
              <p style="margin:0 0 4px;color:#6b7280;font-size:12px;">Einrichtung</p>
              <p style="margin:0;color:#374151;font-size:14px;">{{einrichtung}}</p>
            </td></tr>
          </table>
          <p style="color:#9ca3af;font-size:12px;margin:0;">
            Diese E-Mail wurde automatisch vom CREDO HR-Portal versendet.
          </p>
        </td></tr>
        <tr><td style="background-color:#f9fafb;border-radius:0 0 8px 8px;padding:16px 32px;border-top:1px solid #e5e7eb;">
          <p style="margin:0;color:#9ca3af;font-size:11px;text-align:center;">© CREDO Gruppe – HR-Portal</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
    bodyText: `Neuer Elternzeit-Vorgang – {{vorgangsnummer}}

Für {{mitarbeiter_name}} wurde ein Elternzeit-Vorgang angelegt.
Einrichtung: {{einrichtung}}

CREDO HR-Portal`,
    variables: [
      { key: "{{mitarbeiter_name}}", description: "Name des Mitarbeiters" },
      { key: "{{email}}", description: "E-Mail des Mitarbeiters" },
      { key: "{{einrichtung}}", description: "Name der Einrichtung" },
      { key: "{{vorgangsnummer}}", description: "Vorgangsnummer (displayId)" },
    ],
  },

  // =============================================
  // Elternzeit: Antrag eingereicht (HR-Benachrichtigung)
  // =============================================
  {
    event: "elternzeit-antrag-eingereicht",
    name: "Elternzeit: Antrag eingereicht",
    subject: "Elternzeit-Antrag eingereicht – {{mitarbeiter_name}} ({{vorgangsnummer}})",
    bodyHtml: `<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <tr><td style="background-color:#1a1a2e;border-radius:8px 8px 0 0;padding:24px 32px;">
          <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:bold;">CREDO HR-Portal</h1>
        </td></tr>
        <tr><td style="background-color:#ffffff;padding:32px;">
          <div style="display:inline-block;background-color:#d1fae5;border-radius:6px;padding:8px 16px;margin-bottom:24px;">
            <span style="color:#065f46;font-weight:bold;font-size:14px;">Antrag eingereicht</span>
          </div>
          <h2 style="color:#1a1a2e;font-size:18px;margin:0 0 16px;">Elternzeit-Antrag eingegangen</h2>
          <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px;">
            <strong>{{mitarbeiter_name}}</strong> hat einen <strong>{{antragTyp}}en</strong> Elternzeit-Antrag eingereicht. Bitte pruefen Sie die Angaben im HR-Portal.
          </p>
          <table cellpadding="0" cellspacing="0" style="width:100%;background-color:#f9fafb;border-radius:8px;margin:0 0 24px;">
            <tr><td style="padding:16px;">
              <p style="margin:0 0 4px;color:#6b7280;font-size:12px;">Vorgang</p>
              <p style="margin:0;color:#374151;font-size:14px;">{{vorgangsnummer}}</p>
            </td></tr>
          </table>
          <p style="color:#9ca3af;font-size:12px;margin:0;">
            Diese E-Mail wurde automatisch vom CREDO HR-Portal versendet.
          </p>
        </td></tr>
        <tr><td style="background-color:#f9fafb;border-radius:0 0 8px 8px;padding:16px 32px;border-top:1px solid #e5e7eb;">
          <p style="margin:0;color:#9ca3af;font-size:11px;text-align:center;">© CREDO Gruppe – HR-Portal</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
    bodyText: `Elternzeit-Antrag eingereicht – {{vorgangsnummer}}

{{mitarbeiter_name}} hat einen {{antragTyp}}en Elternzeit-Antrag eingereicht.
Bitte pruefen Sie die Angaben im HR-Portal.

CREDO HR-Portal`,
    variables: [
      { key: "{{mitarbeiter_name}}", description: "Name des Mitarbeiters" },
      { key: "{{antragTyp}}", description: "Art des Antrags (vorläufig / endgültig)" },
      { key: "{{vorgangsnummer}}", description: "Vorgangsnummer (displayId)" },
    ],
  },

  // =============================================
  // Elternzeit: Antrags-Link versandt (an Antragsteller:in)
  // =============================================
  {
    event: "elternzeit-antrag-link-versandt",
    name: "Elternzeit: Antrags-Link versandt",
    subject: "Ihr Elternzeit-Antrag ({{antragTyp}}) – bitte ausfüllen",
    bodyHtml: `<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <tr><td style="background-color:#1a1a2e;border-radius:8px 8px 0 0;padding:24px 32px;">
          <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:bold;">CREDO HR-Portal</h1>
        </td></tr>
        <tr><td style="background-color:#ffffff;padding:32px;">
          <h2 style="color:#1a1a2e;font-size:18px;margin:0 0 16px;">Ihr Elternzeit-Antrag</h2>
          <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px;">
            Bitte füllen Sie Ihren <strong>{{antragTyp}}en</strong> Elternzeit-Antrag über den nachstehenden Link aus.
          </p>
          <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 24px;">
            Der Zugang ist <strong>bis zum {{ablaufdatum}}</strong> gültig.
          </p>
          <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
            <tr><td style="background-color:#2563eb;border-radius:8px;">
              <a href="{{link}}" style="display:inline-block;padding:14px 28px;color:#ffffff;text-decoration:none;font-weight:bold;font-size:15px;">
                Antrag ausfüllen →
              </a>
            </td></tr>
          </table>
          <p style="color:#6b7280;font-size:13px;line-height:1.5;margin:0 0 8px;">
            Falls der Button nicht funktioniert, kopieren Sie bitte diesen Link:
          </p>
          <p style="color:#2563eb;font-size:12px;word-break:break-all;margin:0 0 24px;">{{link}}</p>
          <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
          <p style="color:#9ca3af;font-size:12px;margin:0;">
            Bei Fragen wenden Sie sich bitte an Ihre HR-Ansprechperson.<br>
            Diese E-Mail wurde automatisch vom CREDO HR-Portal versendet.
          </p>
        </td></tr>
        <tr><td style="background-color:#f9fafb;border-radius:0 0 8px 8px;padding:16px 32px;border-top:1px solid #e5e7eb;">
          <p style="margin:0;color:#9ca3af;font-size:11px;text-align:center;">© CREDO Gruppe – HR-Portal</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
    bodyText: `Ihr Elternzeit-Antrag ({{antragTyp}})

Bitte füllen Sie Ihren {{antragTyp}}en Elternzeit-Antrag aus (gültig bis {{ablaufdatum}}):
{{link}}

Bei Fragen wenden Sie sich bitte an Ihre HR-Ansprechperson.

CREDO HR-Portal`,
    variables: [
      { key: "{{email}}", description: "E-Mail des Empfaengers (recipientEmail)" },
      { key: "{{antragTyp}}", description: "Art des Antrags (vorläufig / endgültig)" },
      { key: "{{link}}", description: "Magic-Link zum Antragsformular" },
      { key: "{{ablaufdatum}}", description: "Ablaufdatum des Links" },
      { key: "{{vorgangsnummer}}", description: "Vorgangsnummer (displayId)" },
    ],
  },

  // =============================================
  // Elternzeit: Leiter-Link versandt (an Einrichtungsleitung)
  // =============================================
  {
    event: "elternzeit-leiter-link-versandt",
    name: "Elternzeit: Leiter-Link versandt",
    subject: "Elternzeit – Stellungnahme der Einrichtungsleitung erbeten",
    bodyHtml: `<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <tr><td style="background-color:#1a1a2e;border-radius:8px 8px 0 0;padding:24px 32px;">
          <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:bold;">CREDO HR-Portal</h1>
          <p style="margin:4px 0 0;color:#a0a0c0;font-size:13px;">{{organizationName}}</p>
        </td></tr>
        <tr><td style="background-color:#ffffff;padding:32px;">
          <h2 style="color:#1a1a2e;font-size:18px;margin:0 0 16px;">Stellungnahme zur Elternzeit erbeten</h2>
          <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px;">
            Im Rahmen eines Elternzeit-Vorgangs an Ihrer Einrichtung wird Ihre Stellungnahme als Einrichtungsleitung benoetigt.
          </p>
          <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 24px;">
            Bitte füllen Sie das Formular über den nachstehenden Link aus. Der Zugang ist <strong>bis zum {{ablaufdatum}}</strong> gültig.
          </p>
          <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
            <tr><td style="background-color:#059669;border-radius:8px;">
              <a href="{{link}}" style="display:inline-block;padding:14px 28px;color:#ffffff;text-decoration:none;font-weight:bold;font-size:15px;">
                Stellungnahme abgeben →
              </a>
            </td></tr>
          </table>
          <p style="color:#6b7280;font-size:13px;line-height:1.5;margin:0 0 8px;">
            Falls der Button nicht funktioniert, kopieren Sie bitte diesen Link:
          </p>
          <p style="color:#2563eb;font-size:12px;word-break:break-all;margin:0 0 24px;">{{link}}</p>
          <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
          <p style="color:#9ca3af;font-size:12px;margin:0;">
            Diese E-Mail wurde automatisch vom CREDO HR-Portal versendet.
          </p>
        </td></tr>
        <tr><td style="background-color:#f9fafb;border-radius:0 0 8px 8px;padding:16px 32px;border-top:1px solid #e5e7eb;">
          <p style="margin:0;color:#9ca3af;font-size:11px;text-align:center;">© CREDO Gruppe – HR-Portal</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
    bodyText: `Stellungnahme zur Elternzeit erbeten

Im Rahmen eines Elternzeit-Vorgangs an Ihrer Einrichtung wird Ihre Stellungnahme als Einrichtungsleitung benoetigt.

Bitte füllen Sie das Formular aus (gültig bis {{ablaufdatum}}):
{{link}}

CREDO HR-Portal`,
    variables: [
      { key: "{{email}}", description: "E-Mail der Einrichtungsleitung (recipientEmail, Empfaenger)" },
      { key: "{{organizationName}}", description: "Name der Einrichtung" },
      { key: "{{link}}", description: "Magic-Link zum Leiter-Formular" },
      { key: "{{ablaufdatum}}", description: "Ablaufdatum des Links" },
      { key: "{{vorgangsnummer}}", description: "Vorgangsnummer (displayId)" },
    ],
  },

  // =============================================
  // Elternzeit: Vorlaeufig genehmigt
  // =============================================
  {
    event: "elternzeit-vorl-genehmigt",
    name: "Elternzeit: Vorlaeufig genehmigt",
    subject: "Ihr Elternzeit-Antrag wurde vorlaeufig genehmigt ({{vorgangsnummer}})",
    bodyHtml: `<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <tr><td style="background-color:#1a1a2e;border-radius:8px 8px 0 0;padding:24px 32px;">
          <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:bold;">CREDO HR-Portal</h1>
          <p style="margin:4px 0 0;color:#a0a0c0;font-size:13px;">{{einrichtung}}</p>
        </td></tr>
        <tr><td style="background-color:#ffffff;padding:32px;">
          <div style="display:inline-block;background-color:#d1fae5;border-radius:6px;padding:8px 16px;margin-bottom:24px;">
            <span style="color:#065f46;font-weight:bold;font-size:14px;">Vorlaeufig genehmigt</span>
          </div>
          <h2 style="color:#1a1a2e;font-size:18px;margin:0 0 16px;">Ihr Antrag wurde vorlaeufig genehmigt</h2>
          <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px;">
            Guten Tag {{mitarbeiter_name}}, Ihr Elternzeit-Antrag wurde <strong>vorlaeufig genehmigt</strong>. Die endgültige Bestaetigung erfolgt zu einem spaeteren Zeitpunkt.
          </p>
          <table cellpadding="0" cellspacing="0" style="width:100%;background-color:#f9fafb;border-radius:8px;margin:0 0 24px;">
            <tr><td style="padding:16px;">
              <p style="margin:0 0 4px;color:#6b7280;font-size:12px;">Vorgang</p>
              <p style="margin:0;color:#374151;font-size:14px;">{{vorgangsnummer}}</p>
            </td></tr>
          </table>
          <p style="color:#9ca3af;font-size:12px;margin:0;">
            Bei Fragen wenden Sie sich bitte an Ihre HR-Ansprechperson.<br>
            Diese E-Mail wurde automatisch vom CREDO HR-Portal versendet.
          </p>
        </td></tr>
        <tr><td style="background-color:#f9fafb;border-radius:0 0 8px 8px;padding:16px 32px;border-top:1px solid #e5e7eb;">
          <p style="margin:0;color:#9ca3af;font-size:11px;text-align:center;">© CREDO Gruppe – HR-Portal</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
    bodyText: `Ihr Elternzeit-Antrag wurde vorlaeufig genehmigt – {{vorgangsnummer}}

Guten Tag {{mitarbeiter_name}}, Ihr Elternzeit-Antrag wurde vorlaeufig genehmigt. Die endgültige Bestaetigung erfolgt zu einem spaeteren Zeitpunkt.

CREDO HR-Portal`,
    variables: [
      { key: "{{mitarbeiter_name}}", description: "Name des Mitarbeiters" },
      { key: "{{email}}", description: "E-Mail des Mitarbeiters (Empfaenger)" },
      { key: "{{einrichtung}}", description: "Name der Einrichtung" },
      { key: "{{vorgangsnummer}}", description: "Vorgangsnummer (displayId)" },
    ],
  },

  // =============================================
  // Elternzeit: Endgueltig genehmigt
  // =============================================
  {
    event: "elternzeit-endg-genehmigt",
    name: "Elternzeit: Endgueltig genehmigt",
    subject: "Ihr Elternzeit-Antrag wurde genehmigt ({{vorgangsnummer}})",
    bodyHtml: `<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <tr><td style="background-color:#1a1a2e;border-radius:8px 8px 0 0;padding:24px 32px;">
          <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:bold;">CREDO HR-Portal</h1>
          <p style="margin:4px 0 0;color:#a0a0c0;font-size:13px;">{{einrichtung}}</p>
        </td></tr>
        <tr><td style="background-color:#ffffff;padding:32px;">
          <div style="display:inline-block;background-color:#d1fae5;border-radius:6px;padding:8px 16px;margin-bottom:24px;">
            <span style="color:#065f46;font-weight:bold;font-size:14px;">Genehmigt</span>
          </div>
          <h2 style="color:#1a1a2e;font-size:18px;margin:0 0 16px;">Ihr Antrag wurde endgültig genehmigt</h2>
          <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px;">
            Guten Tag {{mitarbeiter_name}}, Ihr Elternzeit-Antrag wurde <strong>endgültig genehmigt</strong>. Die entsprechenden Unterlagen erhalten Sie gesondert.
          </p>
          <table cellpadding="0" cellspacing="0" style="width:100%;background-color:#f9fafb;border-radius:8px;margin:0 0 24px;">
            <tr><td style="padding:16px;">
              <p style="margin:0 0 4px;color:#6b7280;font-size:12px;">Vorgang</p>
              <p style="margin:0;color:#374151;font-size:14px;">{{vorgangsnummer}}</p>
            </td></tr>
          </table>
          <p style="color:#9ca3af;font-size:12px;margin:0;">
            Bei Fragen wenden Sie sich bitte an Ihre HR-Ansprechperson.<br>
            Diese E-Mail wurde automatisch vom CREDO HR-Portal versendet.
          </p>
        </td></tr>
        <tr><td style="background-color:#f9fafb;border-radius:0 0 8px 8px;padding:16px 32px;border-top:1px solid #e5e7eb;">
          <p style="margin:0;color:#9ca3af;font-size:11px;text-align:center;">© CREDO Gruppe – HR-Portal</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
    bodyText: `Ihr Elternzeit-Antrag wurde genehmigt – {{vorgangsnummer}}

Guten Tag {{mitarbeiter_name}}, Ihr Elternzeit-Antrag wurde endgültig genehmigt. Die entsprechenden Unterlagen erhalten Sie gesondert.

CREDO HR-Portal`,
    variables: [
      { key: "{{mitarbeiter_name}}", description: "Name des Mitarbeiters" },
      { key: "{{email}}", description: "E-Mail des Mitarbeiters (Empfaenger)" },
      { key: "{{einrichtung}}", description: "Name der Einrichtung" },
      { key: "{{vorgangsnummer}}", description: "Vorgangsnummer (displayId)" },
    ],
  },

  // =============================================
  // Elternzeit: Vorlaeufig abgelehnt
  // =============================================
  {
    event: "elternzeit-vorl-abgelehnt",
    name: "Elternzeit: Vorlaeufig abgelehnt",
    subject: "Ihr Elternzeit-Antrag – Rueckmeldung ({{vorgangsnummer}})",
    bodyHtml: `<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <tr><td style="background-color:#1a1a2e;border-radius:8px 8px 0 0;padding:24px 32px;">
          <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:bold;">CREDO HR-Portal</h1>
          <p style="margin:4px 0 0;color:#a0a0c0;font-size:13px;">{{einrichtung}}</p>
        </td></tr>
        <tr><td style="background-color:#ffffff;padding:32px;">
          <div style="display:inline-block;background-color:#fee2e2;border-radius:6px;padding:8px 16px;margin-bottom:24px;">
            <span style="color:#991b1b;font-weight:bold;font-size:14px;">Nicht genehmigt</span>
          </div>
          <h2 style="color:#1a1a2e;font-size:18px;margin:0 0 16px;">Rueckmeldung zu Ihrem Elternzeit-Antrag</h2>
          <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px;">
            Guten Tag {{mitarbeiter_name}}, Ihr vorlaeufiger Elternzeit-Antrag konnte derzeit nicht genehmigt werden.
          </p>
          <table cellpadding="0" cellspacing="0" style="width:100%;background-color:#f9fafb;border-radius:8px;margin:0 0 24px;">
            <tr><td style="padding:16px;">
              <p style="margin:0 0 4px;color:#6b7280;font-size:12px;">Begruendung</p>
              <p style="margin:0;color:#374151;font-size:14px;">{{ablehnungsgrund}}</p>
            </td></tr>
          </table>
          <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px;">
            Bei Rueckfragen wenden Sie sich bitte an Ihre HR-Ansprechperson.
          </p>
          <p style="color:#9ca3af;font-size:12px;margin:0;">
            Diese E-Mail wurde automatisch vom CREDO HR-Portal versendet.
          </p>
        </td></tr>
        <tr><td style="background-color:#f9fafb;border-radius:0 0 8px 8px;padding:16px 32px;border-top:1px solid #e5e7eb;">
          <p style="margin:0;color:#9ca3af;font-size:11px;text-align:center;">© CREDO Gruppe – HR-Portal</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
    bodyText: `Rueckmeldung zu Ihrem Elternzeit-Antrag – {{vorgangsnummer}}

Guten Tag {{mitarbeiter_name}}, Ihr vorlaeufiger Elternzeit-Antrag konnte derzeit nicht genehmigt werden.

Begruendung: {{ablehnungsgrund}}

Bei Rueckfragen wenden Sie sich bitte an Ihre HR-Ansprechperson.

CREDO HR-Portal`,
    variables: [
      { key: "{{mitarbeiter_name}}", description: "Name des Mitarbeiters" },
      { key: "{{email}}", description: "E-Mail des Mitarbeiters (Empfaenger)" },
      { key: "{{einrichtung}}", description: "Name der Einrichtung" },
      { key: "{{ablehnungsgrund}}", description: "Begruendung der Ablehnung" },
      { key: "{{vorgangsnummer}}", description: "Vorgangsnummer (displayId)" },
    ],
  },

  // =============================================
  // Elternzeit: Endgueltig abgelehnt
  // =============================================
  {
    event: "elternzeit-endg-abgelehnt",
    name: "Elternzeit: Endgueltig abgelehnt",
    subject: "Ihr Elternzeit-Antrag – Rueckmeldung ({{vorgangsnummer}})",
    bodyHtml: `<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <tr><td style="background-color:#1a1a2e;border-radius:8px 8px 0 0;padding:24px 32px;">
          <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:bold;">CREDO HR-Portal</h1>
          <p style="margin:4px 0 0;color:#a0a0c0;font-size:13px;">{{einrichtung}}</p>
        </td></tr>
        <tr><td style="background-color:#ffffff;padding:32px;">
          <div style="display:inline-block;background-color:#fee2e2;border-radius:6px;padding:8px 16px;margin-bottom:24px;">
            <span style="color:#991b1b;font-weight:bold;font-size:14px;">Nicht genehmigt</span>
          </div>
          <h2 style="color:#1a1a2e;font-size:18px;margin:0 0 16px;">Rueckmeldung zu Ihrem Elternzeit-Antrag</h2>
          <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px;">
            Guten Tag {{mitarbeiter_name}}, Ihr endgültiger Elternzeit-Antrag konnte nicht genehmigt werden.
          </p>
          <table cellpadding="0" cellspacing="0" style="width:100%;background-color:#f9fafb;border-radius:8px;margin:0 0 24px;">
            <tr><td style="padding:16px;">
              <p style="margin:0 0 4px;color:#6b7280;font-size:12px;">Begruendung</p>
              <p style="margin:0;color:#374151;font-size:14px;">{{ablehnungGrund}}</p>
            </td></tr>
          </table>
          <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px;">
            Bei Rueckfragen wenden Sie sich bitte an Ihre HR-Ansprechperson.
          </p>
          <p style="color:#9ca3af;font-size:12px;margin:0;">
            Diese E-Mail wurde automatisch vom CREDO HR-Portal versendet.
          </p>
        </td></tr>
        <tr><td style="background-color:#f9fafb;border-radius:0 0 8px 8px;padding:16px 32px;border-top:1px solid #e5e7eb;">
          <p style="margin:0;color:#9ca3af;font-size:11px;text-align:center;">© CREDO Gruppe – HR-Portal</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
    bodyText: `Rueckmeldung zu Ihrem Elternzeit-Antrag – {{vorgangsnummer}}

Guten Tag {{mitarbeiter_name}}, Ihr endgültiger Elternzeit-Antrag konnte nicht genehmigt werden.

Begruendung: {{ablehnungGrund}}

Bei Rueckfragen wenden Sie sich bitte an Ihre HR-Ansprechperson.

CREDO HR-Portal`,
    variables: [
      { key: "{{mitarbeiter_name}}", description: "Name des Mitarbeiters" },
      { key: "{{email}}", description: "E-Mail des Mitarbeiters (Empfaenger)" },
      { key: "{{einrichtung}}", description: "Name der Einrichtung" },
      { key: "{{ablehnungGrund}}", description: "Begruendung der Ablehnung" },
      { key: "{{vorgangsnummer}}", description: "Vorgangsnummer (displayId)" },
    ],
  },

  // =============================================
  // Elternzeit: VBL-Information generiert (HR-Tracking)
  // =============================================
  {
    event: "elternzeit-vbl-generiert",
    name: "Elternzeit: VBL-Information generiert",
    subject: "Elternzeit: VBL-Information erstellt ({{vorgangsnummer}})",
    bodyHtml: `<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <tr><td style="background-color:#1a1a2e;border-radius:8px 8px 0 0;padding:24px 32px;">
          <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:bold;">CREDO HR-Portal</h1>
        </td></tr>
        <tr><td style="background-color:#ffffff;padding:32px;">
          <div style="display:inline-block;background-color:#dbeafe;border-radius:6px;padding:8px 16px;margin-bottom:24px;">
            <span style="color:#1e40af;font-weight:bold;font-size:14px;">Dokument erstellt</span>
          </div>
          <h2 style="color:#1a1a2e;font-size:18px;margin:0 0 16px;">VBL-Information generiert</h2>
          <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px;">
            Im Elternzeit-Vorgang <strong>{{vorgangsnummer}}</strong> wurde die VBL-Information als PDF generiert.
          </p>
          <p style="color:#9ca3af;font-size:12px;margin:0;">
            Diese E-Mail wurde automatisch vom CREDO HR-Portal versendet.
          </p>
        </td></tr>
        <tr><td style="background-color:#f9fafb;border-radius:0 0 8px 8px;padding:16px 32px;border-top:1px solid #e5e7eb;">
          <p style="margin:0;color:#9ca3af;font-size:11px;text-align:center;">© CREDO Gruppe – HR-Portal</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
    bodyText: `Elternzeit: VBL-Information erstellt – {{vorgangsnummer}}

Im Elternzeit-Vorgang {{vorgangsnummer}} wurde die VBL-Information als PDF generiert.

CREDO HR-Portal`,
    variables: [
      { key: "{{vorgangsnummer}}", description: "Vorgangsnummer (displayId)" },
    ],
  },

  // =============================================
  // Elternzeit: AG-Bescheinigung generiert (HR-Tracking)
  // =============================================
  {
    event: "elternzeit-ag-bescheinigung-generiert",
    name: "Elternzeit: AG-Bescheinigung generiert",
    subject: "Elternzeit: AG-Bescheinigung erstellt ({{vorgangsnummer}})",
    bodyHtml: `<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <tr><td style="background-color:#1a1a2e;border-radius:8px 8px 0 0;padding:24px 32px;">
          <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:bold;">CREDO HR-Portal</h1>
        </td></tr>
        <tr><td style="background-color:#ffffff;padding:32px;">
          <div style="display:inline-block;background-color:#dbeafe;border-radius:6px;padding:8px 16px;margin-bottom:24px;">
            <span style="color:#1e40af;font-weight:bold;font-size:14px;">Dokument erstellt</span>
          </div>
          <h2 style="color:#1a1a2e;font-size:18px;margin:0 0 16px;">Arbeitgeber-Bescheinigung generiert</h2>
          <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px;">
            Im Elternzeit-Vorgang <strong>{{vorgangsnummer}}</strong> wurde die Arbeitgeber-Bescheinigung als PDF generiert.
          </p>
          <p style="color:#9ca3af;font-size:12px;margin:0;">
            Diese E-Mail wurde automatisch vom CREDO HR-Portal versendet.
          </p>
        </td></tr>
        <tr><td style="background-color:#f9fafb;border-radius:0 0 8px 8px;padding:16px 32px;border-top:1px solid #e5e7eb;">
          <p style="margin:0;color:#9ca3af;font-size:11px;text-align:center;">© CREDO Gruppe – HR-Portal</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
    bodyText: `Elternzeit: AG-Bescheinigung erstellt – {{vorgangsnummer}}

Im Elternzeit-Vorgang {{vorgangsnummer}} wurde die Arbeitgeber-Bescheinigung als PDF generiert.

CREDO HR-Portal`,
    variables: [
      { key: "{{vorgangsnummer}}", description: "Vorgangsnummer (displayId)" },
    ],
  },

  // =============================================
  // Elternzeit: BR-Detmold-Dokument generiert (HR-Tracking)
  // =============================================
  {
    event: "elternzeit-br-detmold-generiert",
    name: "Elternzeit: BR-Detmold-Dokument generiert",
    subject: "Elternzeit: BR-Detmold-Dokument erstellt ({{vorgangsnummer}})",
    bodyHtml: `<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <tr><td style="background-color:#1a1a2e;border-radius:8px 8px 0 0;padding:24px 32px;">
          <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:bold;">CREDO HR-Portal</h1>
        </td></tr>
        <tr><td style="background-color:#ffffff;padding:32px;">
          <div style="display:inline-block;background-color:#dbeafe;border-radius:6px;padding:8px 16px;margin-bottom:24px;">
            <span style="color:#1e40af;font-weight:bold;font-size:14px;">Dokument erstellt</span>
          </div>
          <h2 style="color:#1a1a2e;font-size:18px;margin:0 0 16px;">BR-Detmold-Dokument generiert</h2>
          <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px;">
            Im Elternzeit-Vorgang <strong>{{vorgangsnummer}}</strong> wurde das Dokument für die Bezirksregierung Detmold als PDF generiert.
          </p>
          <p style="color:#9ca3af;font-size:12px;margin:0;">
            Diese E-Mail wurde automatisch vom CREDO HR-Portal versendet.
          </p>
        </td></tr>
        <tr><td style="background-color:#f9fafb;border-radius:0 0 8px 8px;padding:16px 32px;border-top:1px solid #e5e7eb;">
          <p style="margin:0;color:#9ca3af;font-size:11px;text-align:center;">© CREDO Gruppe – HR-Portal</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
    bodyText: `Elternzeit: BR-Detmold-Dokument erstellt – {{vorgangsnummer}}

Im Elternzeit-Vorgang {{vorgangsnummer}} wurde das Dokument für die Bezirksregierung Detmold als PDF generiert.

CREDO HR-Portal`,
    variables: [
      { key: "{{vorgangsnummer}}", description: "Vorgangsnummer (displayId)" },
      { key: "{{generiertAm}}", description: "Zeitpunkt der Generierung" },
    ],
  },

  // =============================================
  // Elternzeit: BR-Genehmigung eingegangen (HR-Tracking)
  // =============================================
  {
    event: "elternzeit-br-genehmigung-eingegangen",
    name: "Elternzeit: BR-Genehmigung eingegangen",
    subject: "Elternzeit: BR-Genehmigung eingegangen ({{vorgangsnummer}})",
    bodyHtml: `<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <tr><td style="background-color:#1a1a2e;border-radius:8px 8px 0 0;padding:24px 32px;">
          <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:bold;">CREDO HR-Portal</h1>
        </td></tr>
        <tr><td style="background-color:#ffffff;padding:32px;">
          <div style="display:inline-block;background-color:#d1fae5;border-radius:6px;padding:8px 16px;margin-bottom:24px;">
            <span style="color:#065f46;font-weight:bold;font-size:14px;">BR-Genehmigung eingegangen</span>
          </div>
          <h2 style="color:#1a1a2e;font-size:18px;margin:0 0 16px;">Genehmigung der Bezirksregierung</h2>
          <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px;">
            Im Elternzeit-Vorgang <strong>{{vorgangsnummer}}</strong> ist die Genehmigung der Bezirksregierung eingegangen.
          </p>
          <table cellpadding="0" cellspacing="0" style="width:100%;background-color:#f9fafb;border-radius:8px;margin:0 0 24px;">
            <tr><td style="padding:16px;">
              <p style="margin:0 0 4px;color:#6b7280;font-size:12px;">Aktenzeichen</p>
              <p style="margin:0;color:#374151;font-size:14px;">{{aktenzeichen}}</p>
            </td></tr>
          </table>
          <p style="color:#9ca3af;font-size:12px;margin:0;">
            Diese E-Mail wurde automatisch vom CREDO HR-Portal versendet.
          </p>
        </td></tr>
        <tr><td style="background-color:#f9fafb;border-radius:0 0 8px 8px;padding:16px 32px;border-top:1px solid #e5e7eb;">
          <p style="margin:0;color:#9ca3af;font-size:11px;text-align:center;">© CREDO Gruppe – HR-Portal</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
    bodyText: `Elternzeit: BR-Genehmigung eingegangen – {{vorgangsnummer}}

Im Elternzeit-Vorgang {{vorgangsnummer}} ist die Genehmigung der Bezirksregierung eingegangen.
Aktenzeichen: {{aktenzeichen}}

CREDO HR-Portal`,
    variables: [
      { key: "{{vorgangsnummer}}", description: "Vorgangsnummer (displayId)" },
      { key: "{{aktenzeichen}}", description: "Aktenzeichen der Bezirksregierung" },
      { key: "{{eingegangenAm}}", description: "Eingangsdatum der Genehmigung" },
    ],
  },

  // =============================================
  // Elternzeit: Frist eskaliert (HR-Eskalation)
  // =============================================
  {
    event: "elternzeit-frist-eskaliert",
    name: "Elternzeit: Frist eskaliert",
    subject: "Elternzeit-Frist eskaliert: {{bezeichnung}} ({{vorgangsnummer}})",
    bodyHtml: `<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <tr><td style="background-color:#1a1a2e;border-radius:8px 8px 0 0;padding:24px 32px;">
          <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:bold;">CREDO HR-Portal</h1>
        </td></tr>
        <tr><td style="background-color:#ffffff;padding:32px;">
          <div style="display:inline-block;background-color:#fef3c7;border-radius:6px;padding:8px 16px;margin-bottom:24px;">
            <span style="color:#92400e;font-weight:bold;font-size:14px;">Frist eskaliert</span>
          </div>
          <h2 style="color:#1a1a2e;font-size:18px;margin:0 0 16px;">{{bezeichnung}}</h2>
          <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px;">
            Im Elternzeit-Vorgang <strong>{{vorgangsnummer}}</strong> ({{mitarbeiter_name}}) wurde eine Frist eskaliert. Bitte pruefen Sie den Vorgang im HR-Portal.
          </p>
          <table cellpadding="0" cellspacing="0" style="width:100%;background-color:#f9fafb;border-radius:8px;margin:0 0 24px;">
            <tr><td style="padding:16px;">
              <p style="margin:0 0 4px;color:#6b7280;font-size:12px;">Dringlichkeit</p>
              <p style="margin:0;color:#374151;font-size:14px;">{{severity}}</p>
            </td></tr>
            <tr><td style="padding:0 16px 16px;">
              <p style="margin:0 0 4px;color:#6b7280;font-size:12px;">Verbleibende Tage</p>
              <p style="margin:0;color:#374151;font-size:14px;">{{verbleibendeTage}}</p>
            </td></tr>
          </table>
          <p style="color:#9ca3af;font-size:12px;margin:0;">
            Diese E-Mail wurde automatisch vom CREDO HR-Portal versendet.
          </p>
        </td></tr>
        <tr><td style="background-color:#f9fafb;border-radius:0 0 8px 8px;padding:16px 32px;border-top:1px solid #e5e7eb;">
          <p style="margin:0;color:#9ca3af;font-size:11px;text-align:center;">© CREDO Gruppe – HR-Portal</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
    bodyText: `Elternzeit-Frist eskaliert: {{bezeichnung}} – {{vorgangsnummer}}

Im Elternzeit-Vorgang {{vorgangsnummer}} ({{mitarbeiter_name}}) wurde eine Frist eskaliert.
Dringlichkeit: {{severity}}
Verbleibende Tage: {{verbleibendeTage}}

Bitte pruefen Sie den Vorgang im HR-Portal.

CREDO HR-Portal`,
    variables: [
      { key: "{{mitarbeiter_name}}", description: "Name des Mitarbeiters" },
      { key: "{{vorgangsnummer}}", description: "Vorgangsnummer (displayId)" },
      { key: "{{bezeichnung}}", description: "Bezeichnung der eskalierten Frist" },
      { key: "{{severity}}", description: "Dringlichkeitsstufe" },
      { key: "{{verbleibendeTage}}", description: "Verbleibende Tage bis zur Frist" },
    ],
  },

  // =============================================
  // Mutterschutz: Vorgang angelegt
  // =============================================
  {
    event: "mutterschutz-angelegt",
    name: "Mutterschutz: Vorgang angelegt",
    subject: "Mutterschutz-Vorgang angelegt – {{mitarbeiter_name}} ({{vorgangsnummer}})",
    bodyHtml: `<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <tr><td style="background-color:#1a1a2e;border-radius:8px 8px 0 0;padding:24px 32px;">
          <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:bold;">CREDO HR-Portal</h1>
          <p style="margin:4px 0 0;color:#a0a0c0;font-size:13px;">{{einrichtung}}</p>
        </td></tr>
        <tr><td style="background-color:#ffffff;padding:32px;">
          <div style="display:inline-block;background-color:#dbeafe;border-radius:6px;padding:8px 16px;margin-bottom:24px;">
            <span style="color:#1e40af;font-weight:bold;font-size:14px;">Mutterschutz gestartet</span>
          </div>
          <h2 style="color:#1a1a2e;font-size:18px;margin:0 0 16px;">Neuer Mutterschutz-Vorgang</h2>
          <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px;">
            Für <strong>{{mitarbeiter_name}}</strong> wurde ein Mutterschutz-Vorgang angelegt. Das Verfahren wird nun begleitet.
          </p>
          <table cellpadding="0" cellspacing="0" style="width:100%;background-color:#f9fafb;border-radius:8px;margin:0 0 24px;">
            <tr><td style="padding:16px;">
              <p style="margin:0 0 4px;color:#6b7280;font-size:12px;">Vorgang</p>
              <p style="margin:0;color:#374151;font-size:14px;">{{vorgangsnummer}}</p>
            </td></tr>
            <tr><td style="padding:0 16px 16px;">
              <p style="margin:0 0 4px;color:#6b7280;font-size:12px;">Einrichtung</p>
              <p style="margin:0;color:#374151;font-size:14px;">{{einrichtung}}</p>
            </td></tr>
          </table>
          <p style="color:#9ca3af;font-size:12px;margin:0;">
            Diese E-Mail wurde automatisch vom CREDO HR-Portal versendet.
          </p>
        </td></tr>
        <tr><td style="background-color:#f9fafb;border-radius:0 0 8px 8px;padding:16px 32px;border-top:1px solid #e5e7eb;">
          <p style="margin:0;color:#9ca3af;font-size:11px;text-align:center;">© CREDO Gruppe – HR-Portal</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
    bodyText: `Neuer Mutterschutz-Vorgang – {{vorgangsnummer}}

Für {{mitarbeiter_name}} wurde ein Mutterschutz-Vorgang angelegt.
Einrichtung: {{einrichtung}}

CREDO HR-Portal`,
    variables: [
      { key: "{{mitarbeiter_name}}", description: "Name des Mitarbeiters" },
      { key: "{{email}}", description: "E-Mail des Mitarbeiters" },
      { key: "{{einrichtung}}", description: "Name der Einrichtung" },
      { key: "{{vorgangsnummer}}", description: "Vorgangsnummer (displayId)" },
    ],
  },

  // =============================================
  // Mutterschutz: Statuswechsel (HR-Benachrichtigungen)
  // =============================================
  hrStatusNotification({
    event: "mutterschutz-bad-beauftragt",
    name: "Mutterschutz: BAD beauftragt",
    subject: "Mutterschutz: BAD beauftragt – {{mitarbeiter_name}} ({{vorgangsnummer}})",
    badge: "BAD beauftragt",
    badgeBg: "#dbeafe",
    badgeText: "#1e40af",
    heading: "Gefaehrdungsbeurteilung beauftragt",
    text: "Im Mutterschutz-Vorgang <strong>{{vorgangsnummer}}</strong> ({{mitarbeiter_name}}) wurde der Betriebsaerztliche Dienst (BAD) mit der Gefaehrdungsbeurteilung beauftragt.",
  }),
  hrStatusNotification({
    event: "mutterschutz-bad-abgeschlossen",
    name: "Mutterschutz: BAD abgeschlossen",
    subject: "Mutterschutz: BAD abgeschlossen – {{mitarbeiter_name}} ({{vorgangsnummer}})",
    badge: "BAD abgeschlossen",
    badgeBg: "#d1fae5",
    badgeText: "#065f46",
    heading: "Gefaehrdungsbeurteilung abgeschlossen",
    text: "Im Mutterschutz-Vorgang <strong>{{vorgangsnummer}}</strong> ({{mitarbeiter_name}}) wurde die Gefaehrdungsbeurteilung durch den BAD abgeschlossen.",
  }),
  hrStatusNotification({
    event: "mutterschutz-aktiviert",
    name: "Mutterschutz: Aktiviert",
    subject: "Mutterschutz aktiv – {{mitarbeiter_name}} ({{vorgangsnummer}})",
    badge: "Mutterschutz aktiv",
    badgeBg: "#dbeafe",
    badgeText: "#1e40af",
    heading: "Mutterschutz hat begonnen",
    text: "Der Mutterschutz im Vorgang <strong>{{vorgangsnummer}}</strong> ({{mitarbeiter_name}}) ist jetzt aktiv.",
  }),
  hrStatusNotification({
    event: "mutterschutz-beendet",
    name: "Mutterschutz: Beendet",
    subject: "Mutterschutz beendet – {{mitarbeiter_name}} ({{vorgangsnummer}})",
    badge: "Beendet",
    badgeBg: "#e5e7eb",
    badgeText: "#374151",
    heading: "Mutterschutz-Vorgang beendet",
    text: "Der Mutterschutz-Vorgang <strong>{{vorgangsnummer}}</strong> ({{mitarbeiter_name}}) wurde beendet.",
  }),

  // =============================================
  // Elternzeit: Entscheidung der Einrichtungsleitung (HR-Benachrichtigungen)
  // =============================================
  hrStatusNotification({
    event: "elternzeit-leiter-genehmigt",
    name: "Elternzeit: Durch Leitung genehmigt",
    subject: "Elternzeit durch Leitung genehmigt – {{mitarbeiter_name}} ({{vorgangsnummer}})",
    badge: "Genehmigt",
    badgeBg: "#d1fae5",
    badgeText: "#065f46",
    heading: "Genehmigung der Einrichtungsleitung",
    text: "Die Einrichtungsleitung ({{leiterName}}) hat den Elternzeit-Antrag im Vorgang <strong>{{vorgangsnummer}}</strong> ({{mitarbeiter_name}}) genehmigt.",
    extraVariables: [
      { key: "{{leiterName}}", description: "Name der Einrichtungsleitung" },
    ],
  }),
  hrStatusNotification({
    event: "elternzeit-leiter-abgelehnt",
    name: "Elternzeit: Durch Leitung abgelehnt",
    subject: "Elternzeit durch Leitung abgelehnt – {{mitarbeiter_name}} ({{vorgangsnummer}})",
    badge: "Abgelehnt",
    badgeBg: "#fee2e2",
    badgeText: "#991b1b",
    heading: "Ablehnung der Einrichtungsleitung",
    text: "Die Einrichtungsleitung ({{leiterName}}) hat den Elternzeit-Antrag im Vorgang <strong>{{vorgangsnummer}}</strong> ({{mitarbeiter_name}}) abgelehnt. Grund: {{ablehnungGrund}}",
    extraVariables: [
      { key: "{{leiterName}}", description: "Name der Einrichtungsleitung" },
      { key: "{{ablehnungGrund}}", description: "Begruendung der Ablehnung" },
    ],
  }),
];
