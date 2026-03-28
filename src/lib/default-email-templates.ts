/**
 * CREDO HR-Portal – Standard-E-Mail-Vorlagen
 *
 * Diese Vorlagen werden verwendet wenn:
 * 1. Noch keine DB-Vorlage gespeichert wurde
 * 2. Als Ausgangsbasis fuer den Admin
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
            Wir bestaetigen hiermit den Eingang Ihres Personalfragebogens. Ihre Unterlagen wurden erfolgreich an unsere Personalabteilung uebermittelt.
          </p>

          <table cellpadding="0" cellspacing="0" style="width:100%;background-color:#f9fafb;border-radius:8px;margin:0 0 24px;">
            <tr><td style="padding:16px;">
              <p style="margin:0 0 8px;color:#6b7280;font-size:12px;text-transform:uppercase;font-weight:bold;">Ihre Bestaetigungs-ID</p>
              <p style="margin:0;color:#1a1a2e;font-size:15px;font-weight:bold;">{{vorgangsnummer}}</p>
            </td></tr>
            <tr><td style="padding:0 16px 16px;">
              <p style="margin:0 0 4px;color:#6b7280;font-size:12px;">Einrichtung</p>
              <p style="margin:0;color:#374151;font-size:14px;">{{einrichtung}}</p>
            </td></tr>
          </table>

          <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px;">
            <strong>Wie geht es weiter?</strong><br>
            Unsere Personalabteilung prueft Ihre Angaben und wird sich bei Rueckfragen direkt bei Ihnen melden. Sie muessen nichts weiter tun.
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

Wir bestaetigen den Eingang Ihres Personalfragebogens.

Bestaetigungs-ID: {{vorgangsnummer}}
Einrichtung: {{einrichtung}}

Wie geht es weiter?
Unsere Personalabteilung prueft Ihre Angaben und meldet sich bei Rueckfragen.

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
            Hallo {{vorname}}, wir haben festgestellt, dass Ihr Personalfragebogen seit <strong>{{tage_offen}} Tagen</strong> noch nicht vollstaendig ausgefuellt wurde.
          </p>
          <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 24px;">
            Bitte fuellen Sie den Fragebogen zeitnah aus, damit wir Ihre Einstellung reibungslos vorbereiten koennen.
          </p>
          <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
            <tr><td style="background-color:#f59e0b;border-radius:8px;">
              <a href="{{link}}" style="display:inline-block;padding:14px 28px;color:#ffffff;text-decoration:none;font-weight:bold;font-size:15px;">
                Jetzt Fragebogen ausfuellen →
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
    subject: "Erinnerung: Einstellungsmodalitaeten fuer {{mitarbeiter_name}} offen",
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
            Die Einstellungsmodalitaeten fuer <strong>{{mitarbeiter_name}}</strong> sind seit <strong>{{tage_offen}} Tagen</strong> offen.
          </p>
          <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 24px;">
            Bitte fuellen Sie das Formular zeitnah aus, damit die Personalabteilung den Arbeitsvertrag vorbereiten kann.
          </p>
          <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
            <tr><td style="background-color:#f59e0b;border-radius:8px;">
              <a href="{{supervisor_link}}" style="display:inline-block;padding:14px 28px;color:#ffffff;text-decoration:none;font-weight:bold;font-size:15px;">
                Einstellungsmodalitaeten ausfuellen →
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

Die Einstellungsmodalitaeten fuer {{mitarbeiter_name}} sind seit {{tage_offen}} Tagen offen.

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
    name: "Offboarding-Aufgaben fuer Abteilung zugewiesen",
    subject: "Offboarding-Aufgaben fuer {{abteilung}}: {{vorname}} {{nachname}}",
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
          <h2 style="color:#1a1a2e;font-size:18px;margin:0 0 16px;">Offboarding-Aufgaben fuer {{abteilung}}</h2>
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
    bodyText: `Offboarding-Aufgaben fuer {{abteilung}}: {{vorname}} {{nachname}}

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
            Die Offboarding-Aufgabe <strong>{{aufgabe}}</strong> fuer <strong>{{vorname}} {{nachname}}</strong> wurde als erledigt markiert.
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
    subject: "Erinnerung: Offene Aufgaben fuer {{vorname}} {{nachname}}",
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
    bodyText: `Erinnerung: Offene Aufgaben fuer {{vorname}} {{nachname}}

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
];
