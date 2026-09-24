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

const BASE_EMAIL_TEMPLATES: EmailTemplateDefinition[] = [
  // =============================================
  // Mitarbeiter-Einladung (Magic Link Fragebogen)
  // =============================================
  {
    event: "onboarding-created",
    name: "Einladung Mitarbeiter (Personalfragebogen)",
    subject: "Willkommen bei {{einrichtung}} – Ihr Personalfragebogen (bis {{ablaufdatum}})",
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
          <h2 style="color:#1a1a2e;font-size:19px;margin:0 0 16px;">Herzlich willkommen{{#vorname}}, {{vorname}}{{/vorname}}!</h2>
          <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px;">
            Schön, dass Sie zu <strong>{{einrichtung}}</strong> kommen. Damit zu Ihrem Start alles bereitliegt – vom Arbeitsvertrag bis zur pünktlichen Gehaltszahlung – benötigen wir einmalig einige Angaben von Ihnen.
          </p>
          <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 22px;">
            Bitte füllen Sie dazu den <strong>Personalfragebogen</strong> aus. Ihre Daten werden verschlüsselt übertragen und vertraulich behandelt.
          </p>

          <!-- Frist & Dauer -->
          <table cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 22px;">
            <tr><td style="background-color:#f9fafb;border-left:4px solid #575756;padding:13px 16px;">
              <p style="margin:0;color:#2d2d2d;font-size:14px;line-height:1.6;"><strong>Bitte ausfüllen bis:</strong> {{ablaufdatum}}<br><span style="color:#6b7280;">Dauer: ca. 10 Minuten</span></p>
            </td></tr>
          </table>

          <!-- Button -->
          <table cellpadding="0" cellspacing="0" style="margin:0 0 12px;">
            <tr><td style="background-color:#575756;border-radius:8px;">
              <a href="{{link}}" style="display:inline-block;padding:14px 30px;color:#ffffff;text-decoration:none;font-weight:bold;font-size:15px;">
                Personalfragebogen ausfüllen →
              </a>
            </td></tr>
          </table>

          <p style="color:#6b7280;font-size:12px;line-height:1.5;margin:0 0 6px;">
            Falls der Button nicht funktioniert, kopieren Sie diesen Link in Ihren Browser:
          </p>
          <p style="margin:0 0 24px;"><a href="{{link}}" style="color:#575756;font-size:12px;word-break:break-all;text-decoration:underline;">{{link}}</a></p>

          <!-- Das halten Sie bereit -->
          <table cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 24px;">
            <tr><td style="background-color:#f9fafb;border:1px solid #eceef1;border-radius:8px;padding:16px 20px;">
              <p style="margin:0 0 10px;color:#2d2d2d;font-size:14px;font-weight:bold;">Das halten Sie am besten bereit</p>
              <p style="margin:0;color:#374151;font-size:14px;line-height:1.9;">› IBAN Ihrer Bankverbindung<br>› Steuer-Identifikationsnummer (Steuer-ID)<br>› Sozialversicherungsnummer<br>› Name Ihrer Krankenkasse<br>› Nachweis Ihres Masernschutzes (z.&nbsp;B. Impfausweis)</p>
            </td></tr>
          </table>

          <!-- So geht es weiter -->
          <p style="color:#2d2d2d;font-size:14px;font-weight:bold;margin:0 0 6px;">So geht es weiter</p>
          <p style="color:#374151;font-size:14px;line-height:1.6;margin:0 0 24px;">
            Nach dem Absenden müssen Sie nichts weiter tun. Wir prüfen Ihre Angaben und melden uns, falls noch etwas fehlt. Alles Weitere besprechen wir an Ihrem ersten Arbeitstag.
          </p>

          <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 18px;">
          <p style="color:#6b7280;font-size:13px;line-height:1.6;margin:0;">
            Haben Sie Fragen? Schreiben Sie uns gern an <a href="mailto:personalbuchhaltung@fes-minden.de" style="color:#575756;text-decoration:underline;">personalbuchhaltung@fes-minden.de</a>
          </p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="background-color:#f9fafb;border-radius:0 0 8px 8px;padding:18px 32px;border-top:1px solid #e5e7eb;">
          <p style="margin:0 0 4px;color:#9ca3af;font-size:11px;text-align:center;line-height:1.5;">
            <strong style="color:#575756;">CREDO Gruppe</strong> – Freie Evangelische Schulen<br>lebensnah · wegweisend · christlich
          </p>
          <p style="margin:0;color:#bbbbbb;font-size:11px;text-align:center;">{{einrichtung}}</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`,
    bodyText: `Herzlich willkommen{{#vorname}}, {{vorname}}{{/vorname}}!

Schön, dass Sie zu {{einrichtung}} kommen. Damit zu Ihrem Start alles bereitliegt – vom Arbeitsvertrag bis zur pünktlichen Gehaltszahlung – benötigen wir einmalig einige Angaben von Ihnen.

Bitte füllen Sie dazu den Personalfragebogen aus. Ihre Daten werden verschlüsselt übertragen und vertraulich behandelt.

Bitte ausfüllen bis: {{ablaufdatum}} (Dauer: ca. 10 Minuten)

Personalfragebogen öffnen:
{{link}}

Das halten Sie am besten bereit:
- IBAN Ihrer Bankverbindung
- Steuer-Identifikationsnummer (Steuer-ID)
- Sozialversicherungsnummer
- Name Ihrer Krankenkasse
- Nachweis Ihres Masernschutzes (z. B. Impfausweis)

So geht es weiter: Nach dem Absenden müssen Sie nichts weiter tun. Wir prüfen Ihre Angaben und melden uns, falls noch etwas fehlt.

Haben Sie Fragen? Schreiben Sie uns gern an personalbuchhaltung@fes-minden.de.

CREDO Gruppe – Freie Evangelische Schulen
{{einrichtung}}`,
    variables: [
      {
        key: "{{vorname}}",
        description:
          "Vorname (aus ‚Neuer Vorgang‘ oder dem Fragebogen; kann leer sein – für die Anrede {{#vorname}}…{{/vorname}} verwenden)",
      },
      { key: "{{nachname}}", description: "Nachname (kann leer sein)" },
      { key: "{{email}}", description: "E-Mail der neuen Person" },
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
    subject: "Einstellungsmodalitäten für {{mitarbeiter_name}} – bitte ausfüllen",
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
          <h2 style="color:#1a1a2e;font-size:19px;margin:0 0 16px;">Bitte ergänzen Sie die Einstellungsmodalitäten</h2>
          <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px;">
            Für <strong>{{mitarbeiter_name}}</strong> fehlen bei {{einrichtung}} noch die Einstellungsmodalitäten. Mit Ihren Angaben kann die Personalabteilung den Arbeitsvertrag erstellen.
          </p>
          <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 22px;">
            Das Ausfüllen dauert nur wenige Minuten. Sie können sofort beginnen, unabhängig davon, ob der Personalfragebogen schon ausgefüllt ist.
          </p>
          {{#ablaufdatum}}
          <!-- Frist -->
          <table cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 22px;">
            <tr><td style="background-color:#f9fafb;border-left:4px solid #575756;padding:13px 16px;">
              <p style="margin:0;color:#2d2d2d;font-size:14px;line-height:1.6;"><strong>Bitte ausfüllen bis:</strong> {{ablaufdatum}}</p>
            </td></tr>
          </table>
          {{/ablaufdatum}}

          <!-- Button -->
          <table cellpadding="0" cellspacing="0" style="margin:0 0 12px;">
            <tr><td style="background-color:#575756;border-radius:8px;">
              <a href="{{link}}" style="display:inline-block;padding:14px 30px;color:#ffffff;text-decoration:none;font-weight:bold;font-size:15px;">
                Einstellungsmodalitäten ausfüllen →
              </a>
            </td></tr>
          </table>

          <p style="color:#6b7280;font-size:12px;line-height:1.5;margin:0 0 6px;">
            Falls der Button nicht funktioniert, kopieren Sie diesen Link in Ihren Browser:
          </p>
          <p style="margin:0 0 24px;"><a href="{{link}}" style="color:#575756;font-size:12px;word-break:break-all;text-decoration:underline;">{{link}}</a></p>

          <!-- Eckdaten -->
          <table cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 24px;">
            <tr><td style="background-color:#f9fafb;border:1px solid #eceef1;border-radius:8px;padding:16px 20px;">
              <p style="margin:0 0 10px;color:#2d2d2d;font-size:14px;font-weight:bold;">Diese Eckdaten werden abgefragt</p>
              <p style="margin:0;color:#374151;font-size:14px;line-height:1.9;">› Stellenbezeichnung (wird in den Arbeitsvertrag übernommen)<br>› Vertragsbeginn, ggf. Befristung<br>› Arbeitszeit (Wochenstunden)<br>› Vergütung (Entgeltgruppe/Stufe oder Festgehalt)</p>
            </td></tr>
          </table>

          <!-- So geht es weiter -->
          <p style="color:#2d2d2d;font-size:14px;font-weight:bold;margin:0 0 6px;">So geht es weiter</p>
          <p style="color:#374151;font-size:14px;line-height:1.6;margin:0 0 24px;">
            Nach dem Absenden übernimmt die Personalabteilung alles Weitere – Sie müssen nichts ausdrucken oder zurücksenden.
          </p>

          <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 18px;">
          <p style="color:#6b7280;font-size:13px;line-height:1.6;margin:0;">
            Bei Rückfragen erreichen Sie uns unter <a href="mailto:personalbuchhaltung@fes-minden.de" style="color:#575756;text-decoration:underline;">personalbuchhaltung@fes-minden.de</a>
          </p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="background-color:#f9fafb;border-radius:0 0 8px 8px;padding:18px 32px;border-top:1px solid #e5e7eb;">
          <p style="margin:0 0 4px;color:#9ca3af;font-size:11px;text-align:center;line-height:1.5;">
            <strong style="color:#575756;">CREDO Gruppe</strong> – Freie Evangelische Schulen<br>lebensnah · wegweisend · christlich
          </p>
          <p style="margin:0;color:#bbbbbb;font-size:11px;text-align:center;">{{einrichtung}}</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`,
    bodyText: `Bitte ergänzen Sie die Einstellungsmodalitäten

Für {{mitarbeiter_name}} fehlen bei {{einrichtung}} noch die Einstellungsmodalitäten. Mit Ihren Angaben kann die Personalabteilung den Arbeitsvertrag erstellen. Das dauert nur wenige Minuten. Sie können sofort beginnen, unabhängig davon, ob der Personalfragebogen schon ausgefüllt ist.

{{#ablaufdatum}}Bitte ausfüllen bis: {{ablaufdatum}}

{{/ablaufdatum}}Formular öffnen:
{{link}}

Diese Eckdaten werden abgefragt:
- Stellenbezeichnung (wird in den Arbeitsvertrag übernommen)
- Vertragsbeginn, ggf. Befristung
- Arbeitszeit (Wochenstunden)
- Vergütung (Entgeltgruppe/Stufe oder Festgehalt)

So geht es weiter: Nach dem Absenden übernimmt die Personalabteilung alles Weitere.

Bei Rückfragen erreichen Sie uns unter personalbuchhaltung@fes-minden.de.

CREDO Gruppe – Freie Evangelische Schulen
{{einrichtung}}`,
    variables: [
      {
        key: "{{mitarbeiter_name}}",
        description:
          "Name der neuen Person; ohne Namen ‚die neue Mitarbeiterin / den neuen Mitarbeiter‘ (Akkusativ – nur nach ‚für‘ verwenden)",
      },
      { key: "{{email}}", description: "E-Mail der Führungskraft" },
      { key: "{{einrichtung}}", description: "Name der Einrichtung" },
      { key: "{{link}}", description: "Link zu den Einstellungsmodalitäten" },
      {
        key: "{{ablaufdatum}}",
        description: "Ablaufdatum des Links (für den Block {{#ablaufdatum}}…{{/ablaufdatum}})",
      },
      { key: "{{vorgangsnummer}}", description: "Vorgangsnummer" },
    ],
  },

  // =============================================
  // Vertragsende – Einladung Vorgesetzter (Vertragsverlaengerung, Strang A)
  // =============================================
  {
    event: "contract-end-supervisor-link",
    name: "Einladung Vorgesetzter (Vertragsverlängerung)",
    // Seit die Fuehrungskraft SELBST ueber die Uebernahme entscheidet (Ja/Nein
    // im Formular, Nein mit Begruendung), setzt diese Mail die Verlaengerung
    // nicht mehr voraus: Betreff, Text und Knopf bitten um die Entscheidung,
    // die Vertragsdaten sind der Ja-Fall. Wortwahl wie in der Erinnerung
    // (contract-end-supervisor-reminder), damit beide Mails zusammenpassen.
    subject: "Vertragsverlängerung für {{mitarbeiter_name}} – Ihre Entscheidung erbeten",
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
          <h2 style="color:#1a1a2e;font-size:19px;margin:0 0 16px;">Bitte entscheiden Sie über die Weiterbeschäftigung</h2>
          <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px;">
            Der befristete Vertrag von <strong>{{mitarbeiter_name}}</strong> bei {{einrichtung}} läuft aus. Bitte teilen Sie uns mit, ob der/die Mitarbeiter:in über das Vertragsende hinaus weiterbeschäftigt werden soll.
          </p>
          <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 22px;">
            Bei „Ja“ erfassen Sie im selben Formular gleich die Vertragsdaten für die Verlängerung – mit Ihren Angaben erstellt die Personalabteilung den neuen Vertrag. Bei „Nein“ genügt eine kurze Begründung. Das Ausfüllen dauert nur wenige Minuten.
          </p>

          <!-- Button -->
          <table cellpadding="0" cellspacing="0" style="margin:0 0 12px;">
            <tr><td style="background-color:#575756;border-radius:8px;">
              <a href="{{link}}" style="display:inline-block;padding:14px 30px;color:#ffffff;text-decoration:none;font-weight:bold;font-size:15px;">
                Jetzt entscheiden →
              </a>
            </td></tr>
          </table>

          <p style="color:#6b7280;font-size:12px;line-height:1.5;margin:0 0 6px;">
            Falls der Button nicht funktioniert, kopieren Sie diesen Link in Ihren Browser:
          </p>
          <p style="margin:0 0 24px;"><a href="{{link}}" style="color:#575756;font-size:12px;word-break:break-all;text-decoration:underline;">{{link}}</a></p>

          <!-- Eckdaten -->
          <table cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 24px;">
            <tr><td style="background-color:#f9fafb;border:1px solid #eceef1;border-radius:8px;padding:16px 20px;">
              <p style="margin:0 0 10px;color:#2d2d2d;font-size:14px;font-weight:bold;">Bei Weiterbeschäftigung werden diese Eckdaten abgefragt</p>
              <p style="margin:0;color:#374151;font-size:14px;line-height:1.9;">› Neuer Vertragsbeginn, ggf. Befristung<br>› Arbeitszeit (Wochenstunden)<br>› Vergütung (Entgeltgruppe/Stufe)<br>› Stellenbezeichnung</p>
            </td></tr>
          </table>

          <p style="color:#2d2d2d;font-size:14px;font-weight:bold;margin:0 0 6px;">So geht es weiter</p>
          <p style="color:#374151;font-size:14px;line-height:1.6;margin:0 0 24px;">
            Nach dem Absenden übernimmt die Personalabteilung alles Weitere – Sie müssen nichts ausdrucken oder zurücksenden. Der Link ist bis zum {{ablaufdatum}} gültig.
          </p>

          <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 18px;">
          <p style="color:#6b7280;font-size:13px;line-height:1.6;margin:0;">
            Bei Rückfragen erreichen Sie uns unter <a href="mailto:personalbuchhaltung@fes-minden.de" style="color:#575756;text-decoration:underline;">personalbuchhaltung@fes-minden.de</a>
          </p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="background-color:#f9fafb;border-radius:0 0 8px 8px;padding:18px 32px;border-top:1px solid #e5e7eb;">
          <p style="margin:0 0 4px;color:#9ca3af;font-size:11px;text-align:center;line-height:1.5;">
            <strong style="color:#575756;">CREDO Gruppe</strong> – Freie Evangelische Schulen<br>lebensnah · wegweisend · christlich
          </p>
          <p style="margin:0;color:#bbbbbb;font-size:11px;text-align:center;">{{einrichtung}}</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`,
    bodyText: `Bitte entscheiden Sie über die Weiterbeschäftigung

Der befristete Vertrag von {{mitarbeiter_name}} bei {{einrichtung}} läuft aus. Bitte teilen Sie uns mit, ob der/die Mitarbeiter:in über das Vertragsende hinaus weiterbeschäftigt werden soll.

Bei „Ja“ erfassen Sie im selben Formular gleich die Vertragsdaten für die Verlängerung – mit Ihren Angaben erstellt die Personalabteilung den neuen Vertrag. Bei „Nein“ genügt eine kurze Begründung. Das dauert nur wenige Minuten.

Formular öffnen:
{{link}}

Bei Weiterbeschäftigung werden diese Eckdaten abgefragt:
- Neuer Vertragsbeginn, ggf. Befristung
- Arbeitszeit (Wochenstunden)
- Vergütung (Entgeltgruppe/Stufe)
- Stellenbezeichnung

So geht es weiter: Nach dem Absenden übernimmt die Personalabteilung alles Weitere. Der Link ist bis zum {{ablaufdatum}} gültig.

Bei Rückfragen erreichen Sie uns unter personalbuchhaltung@fes-minden.de.

CREDO Gruppe – Freie Evangelische Schulen
{{einrichtung}}`,
    variables: [
      { key: "{{mitarbeiter_name}}", description: "Vollständiger Name des Mitarbeiters" },
      { key: "{{supervisorEmail}}", description: "E-Mail des Vorgesetzten" },
      { key: "{{einrichtung}}", description: "Name der Einrichtung" },
      { key: "{{link}}", description: "Link zum Entscheidungs-/Vertragsdaten-Formular" },
      { key: "{{ablaufdatum}}", description: "Gültig-bis-Datum des Links" },
      { key: "{{vorgangsnummer}}", description: "Vorgangsnummer (VE-...)" },
    ],
  },

  // =============================================
  // Erinnerung an Vorgesetzten (Vertragsende-Anfrage offen)
  // =============================================
  {
    event: "contract-end-supervisor-reminder",
    name: "Erinnerung Vorgesetzter (Vertragsende-Anfrage offen)",
    subject: "Erinnerung: Vertragsverlängerung für {{mitarbeiter_name}} – Rückmeldung erbeten",
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
          <div style="display:inline-block;background-color:#fff3c9;border-radius:6px;padding:8px 16px;margin-bottom:24px;">
            <span style="color:#8a6d00;font-weight:bold;font-size:14px;">Erinnerung · {{dringlichkeit}}</span>
          </div>
          <h2 style="color:#1a1a2e;font-size:19px;margin:0 0 16px;">Ihre Rückmeldung wird noch benötigt</h2>
          <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px;">
            der befristete Vertrag von <strong>{{mitarbeiter_name}}</strong> bei {{einrichtung}} endet am <strong>{{vertragsende}}</strong>. Ihre Anfrage zur Weiterbeschäftigung ist seit {{tage_offen}} Tagen offen.
          </p>
          <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 22px;">
            Bitte entscheiden Sie über das Formular, ob der/die Mitarbeiter:in weiterbeschäftigt wird – und erfassen Sie bei Übernahme gleich die neuen Vertragsdaten.
          </p>

          <!-- Button -->
          <table cellpadding="0" cellspacing="0" style="margin:0 0 12px;">
            <tr><td style="background-color:#575756;border-radius:8px;">
              <a href="{{link}}" style="display:inline-block;padding:14px 30px;color:#ffffff;text-decoration:none;font-weight:bold;font-size:15px;">
                Jetzt entscheiden →
              </a>
            </td></tr>
          </table>

          <p style="color:#6b7280;font-size:12px;line-height:1.5;margin:0 0 6px;">
            Falls der Button nicht funktioniert, kopieren Sie diesen Link in Ihren Browser:
          </p>
          <p style="margin:0 0 24px;"><a href="{{link}}" style="color:#575756;font-size:12px;word-break:break-all;text-decoration:underline;">{{link}}</a></p>

          <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 18px;">
          <p style="color:#6b7280;font-size:13px;line-height:1.6;margin:0;">
            Bei Rückfragen erreichen Sie uns unter <a href="mailto:personalbuchhaltung@fes-minden.de" style="color:#575756;text-decoration:underline;">personalbuchhaltung@fes-minden.de</a>
          </p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="background-color:#f9fafb;border-radius:0 0 8px 8px;padding:18px 32px;border-top:1px solid #e5e7eb;">
          <p style="margin:0 0 4px;color:#9ca3af;font-size:11px;text-align:center;line-height:1.5;">
            <strong style="color:#575756;">CREDO Gruppe</strong> – Freie Evangelische Schulen<br>lebensnah · wegweisend · christlich
          </p>
          <p style="margin:0;color:#bbbbbb;font-size:11px;text-align:center;">{{einrichtung}}</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`,
    bodyText: `Erinnerung – Ihre Rückmeldung wird noch benötigt

Der befristete Vertrag von {{mitarbeiter_name}} bei {{einrichtung}} endet am {{vertragsende}}. Ihre Anfrage zur Weiterbeschäftigung ist seit {{tage_offen}} Tagen offen.

Bitte entscheiden Sie über das Formular, ob der/die Mitarbeiter:in weiterbeschäftigt wird – und erfassen Sie bei Übernahme gleich die neuen Vertragsdaten:
{{link}}

Bei Rückfragen erreichen Sie uns unter personalbuchhaltung@fes-minden.de.

CREDO Gruppe – Freie Evangelische Schulen
{{einrichtung}}`,
    variables: [
      { key: "{{mitarbeiter_name}}", description: "Vollständiger Name des Mitarbeiters" },
      { key: "{{einrichtung}}", description: "Name der Einrichtung" },
      { key: "{{link}}", description: "Link zum Entscheidungs-/Vertragsdaten-Formular" },
      { key: "{{vertragsende}}", description: "Datum des Vertragsendes" },
      { key: "{{tage_offen}}", description: "Tage seit Versand der Anfrage" },
      { key: "{{dringlichkeit}}", description: "Ampel-Stufe (Kritisch/Warnung/Beobachten)" },
    ],
  },

  // =============================================
  // Eskalation an HR (Vorgesetzter reagiert trotz Erinnerungen nicht)
  // =============================================
  {
    event: "contract-end-eskalation",
    name: "Eskalation an HR (Vorgesetzter reagiert nicht)",
    subject: "ESKALATION: Keine Rückmeldung zur Vertragsverlängerung {{mitarbeiter_name}} ({{dringlichkeit}})",
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
          <div style="display:inline-block;background-color:#fde3e3;border-radius:6px;padding:8px 16px;margin-bottom:24px;">
            <span style="color:#b3121a;font-weight:bold;font-size:14px;">Eskalation · {{dringlichkeit}}</span>
          </div>
          <h2 style="color:#1a1a2e;font-size:19px;margin:0 0 16px;">Führungskraft reagiert nicht — Vorgang wird kritisch</h2>
          <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px;">
            zur Übernahme-Anfrage für <strong>{{mitarbeiter_name}}</strong> ({{einrichtung}}, Vorgang {{displayId}}) liegt trotz <strong>{{anzahl_erinnerungen}} Erinnerungen</strong> keine Rückmeldung von <strong>{{supervisorEmail}}</strong> vor. Die Anfrage ist seit {{tage_offen}} Tagen offen, der Vertrag endet am <strong>{{vertragsende}}</strong>.
          </p>
          <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 22px;">
            Bitte fassen Sie persönlich nach. Achtung Entfristungsrisiko (§15 Abs. 5 TzBfG): Bei Weiterarbeit ohne rechtzeitigen neuen Vertrag gilt das Arbeitsverhältnis als unbefristet verlängert.
          </p>

          <!-- Button -->
          <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
            <tr><td style="background-color:#575756;border-radius:8px;">
              <a href="{{portalLink}}" style="display:inline-block;padding:14px 30px;color:#ffffff;text-decoration:none;font-weight:bold;font-size:15px;">
                Vorgang im Portal öffnen →
              </a>
            </td></tr>
          </table>

          <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 18px;">
          <p style="color:#6b7280;font-size:13px;line-height:1.6;margin:0;">
            Diese Eskalation wird je Anfrage nur einmal versendet.
          </p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="background-color:#f9fafb;border-radius:0 0 8px 8px;padding:18px 32px;border-top:1px solid #e5e7eb;">
          <p style="margin:0 0 4px;color:#9ca3af;font-size:11px;text-align:center;line-height:1.5;">
            <strong style="color:#575756;">CREDO Gruppe</strong> – Freie Evangelische Schulen<br>lebensnah · wegweisend · christlich
          </p>
          <p style="margin:0;color:#bbbbbb;font-size:11px;text-align:center;">{{einrichtung}}</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`,
    bodyText: `ESKALATION – Führungskraft reagiert nicht

Zur Übernahme-Anfrage für {{mitarbeiter_name}} ({{einrichtung}}, Vorgang {{displayId}}) liegt trotz {{anzahl_erinnerungen}} Erinnerungen keine Rückmeldung von {{supervisorEmail}} vor. Die Anfrage ist seit {{tage_offen}} Tagen offen, der Vertrag endet am {{vertragsende}}.

Bitte fassen Sie persönlich nach. Achtung Entfristungsrisiko (§15 Abs. 5 TzBfG): Bei Weiterarbeit ohne rechtzeitigen neuen Vertrag gilt das Arbeitsverhältnis als unbefristet verlängert.

Vorgang im Portal: {{portalLink}}

Diese Eskalation wird je Anfrage nur einmal versendet.

CREDO Gruppe – Freie Evangelische Schulen
{{einrichtung}}`,
    variables: [
      { key: "{{mitarbeiter_name}}", description: "Vollständiger Name des Mitarbeiters" },
      { key: "{{einrichtung}}", description: "Name der Einrichtung" },
      { key: "{{displayId}}", description: "Vorgangsnummer (VE-...)" },
      { key: "{{supervisorEmail}}", description: "E-Mail der Führungskraft" },
      { key: "{{anzahl_erinnerungen}}", description: "Anzahl der bisherigen Erinnerungen" },
      { key: "{{tage_offen}}", description: "Tage seit Versand der Anfrage" },
      { key: "{{vertragsende}}", description: "Datum des Vertragsendes" },
      { key: "{{dringlichkeit}}", description: "Ampel-Stufe (Kritisch/Warnung/Beobachten)" },
      { key: "{{portalLink}}", description: "Link zur Vorgangs-Detailseite im Portal" },
    ],
  },

  // =============================================
  // Woechentlicher HR-Hinweis: kritische Vorgaenge ohne versendete Anfrage
  // =============================================
  {
    event: "contract-end-unbearbeitet",
    name: "Woechentlicher HR-Hinweis (Vertragsende ohne Anfrage)",
    subject: "Vertragsende: {{anzahl}} Vorgänge ohne Vorgesetzten-Anfrage",
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
          <p style="margin:4px 0 0;color:#a0a0c0;font-size:13px;">Vertragsende-Monitoring</p>
        </td></tr>

        <!-- Body -->
        <tr><td style="background-color:#ffffff;padding:32px;">
          <div style="display:inline-block;background-color:#fff3c9;border-radius:6px;padding:8px 16px;margin-bottom:24px;">
            <span style="color:#8a6d00;font-weight:bold;font-size:14px;">Wöchentlicher Hinweis</span>
          </div>
          <h2 style="color:#1a1a2e;font-size:19px;margin:0 0 16px;">{{anzahl}} Vertragsende-Vorgänge warten auf die Vorgesetzten-Anfrage</h2>
          <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px;">
            für die folgenden Vorgänge in den Ampel-Stufen Kritisch/Warnung wurde noch keine Anfrage an die Führungskraft versendet:
          </p>
          <ul style="color:#374151;font-size:14px;line-height:1.8;margin:0 0 22px;padding-left:20px;">{{liste_html}}</ul>

          <!-- Button -->
          <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
            <tr><td style="background-color:#575756;border-radius:8px;">
              <a href="{{portalLink}}" style="display:inline-block;padding:14px 30px;color:#ffffff;text-decoration:none;font-weight:bold;font-size:15px;">
                Vorgänge im Portal öffnen →
              </a>
            </td></tr>
          </table>

          <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 18px;">
          <p style="color:#6b7280;font-size:13px;line-height:1.6;margin:0;">
            Dieser Hinweis kommt einmal wöchentlich, solange unbearbeitete kritische Vorgänge vorliegen.
          </p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="background-color:#f9fafb;border-radius:0 0 8px 8px;padding:18px 32px;border-top:1px solid #e5e7eb;">
          <p style="margin:0 0 4px;color:#9ca3af;font-size:11px;text-align:center;line-height:1.5;">
            <strong style="color:#575756;">CREDO Gruppe</strong> – Freie Evangelische Schulen<br>lebensnah · wegweisend · christlich
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`,
    bodyText: `Wöchentlicher Hinweis – {{anzahl}} Vertragsende-Vorgänge ohne Vorgesetzten-Anfrage

Für die folgenden Vorgänge in den Ampel-Stufen Kritisch/Warnung wurde noch keine Anfrage an die Führungskraft versendet:

{{liste_text}}

Vorgänge im Portal: {{portalLink}}

Dieser Hinweis kommt einmal wöchentlich, solange unbearbeitete kritische Vorgänge vorliegen.

CREDO Gruppe – Freie Evangelische Schulen`,
    variables: [
      { key: "{{anzahl}}", description: "Anzahl der unbearbeiteten Vorgänge" },
      { key: "{{liste_text}}", description: "Liste der Vorgänge (Text, eine Zeile je Vorgang)" },
      { key: "{{liste_html}}", description: "Liste der Vorgänge (HTML-Listenpunkte)" },
      { key: "{{portalLink}}", description: "Link zur Vertragsende-Übersicht im Portal" },
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
          <p style="margin:4px 0 0;color:#a0a0c0;font-size:13px;">{{einrichtung}}</p>
        </td></tr>
        <tr><td style="background-color:#ffffff;padding:32px;">
          <table cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
            <tr><td style="background-color:#eef6e3;border-radius:6px;padding:8px 16px;"><span style="color:#41671a;font-weight:bold;font-size:14px;">✓ Fragebogen eingereicht</span></td></tr>
          </table>
          <h2 style="color:#1a1a2e;font-size:19px;margin:0 0 16px;">Personalfragebogen vollständig</h2>
          <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 22px;">
            Der Personalfragebogen für <strong>{{mitarbeiter_name}}</strong> wurde soeben ausgefüllt und eingereicht.
          </p>
          <table cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 22px;">
            <tr><td style="background-color:#f9fafb;border:1px solid #eceef1;border-radius:8px;padding:4px 0;">
              <table cellpadding="0" cellspacing="0" style="width:100%;">
                <tr><td style="padding:13px 18px 6px;">
                  <p style="margin:0 0 2px;color:#9ca3af;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;font-weight:bold;">Vorgang</p>
                  <p style="margin:0;color:#2d2d2d;font-size:15px;font-weight:bold;">{{vorgangsnummer}}</p>
                </td></tr>
                <tr><td style="padding:0 18px 6px;">
                  <p style="margin:0 0 2px;color:#9ca3af;font-size:11px;">Mitarbeiter</p>
                  <p style="margin:0;color:#374151;font-size:14px;">{{mitarbeiter_name}} · {{email}}</p>
                </td></tr>
                <tr><td style="padding:0 18px 13px;">
                  <p style="margin:0 0 2px;color:#9ca3af;font-size:11px;">Einrichtung</p>
                  <p style="margin:0;color:#374151;font-size:14px;">{{einrichtung}}</p>
                </td></tr>
              </table>
            </td></tr>
          </table>
          {{#modalitaeten_eingereicht}}<table cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 20px;">
            <tr><td style="background-color:#eef6e3;border-left:3px solid #41671a;border-radius:6px;padding:14px 18px;">
              <p style="margin:0;color:#41671a;font-size:14px;line-height:1.6;">
                Die Einstellungsmodalitäten der Führungskraft liegen bereits vor. <strong>Der Vorgang ist bereit zur Prüfung.</strong>
              </p>
            </td></tr>
          </table>{{/modalitaeten_eingereicht}}
          {{#ohne_vorgesetzten_link}}<table cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 20px;">
            <tr><td style="background-color:#eef6e3;border-left:3px solid #41671a;border-radius:6px;padding:14px 18px;">
              <p style="margin:0;color:#41671a;font-size:14px;line-height:1.6;">
                Für diesen Vorgang ist kein Vorgesetzten-Link vergeben. <strong>Der Vorgang ist bereit zur Prüfung.</strong>
              </p>
            </td></tr>
          </table>{{/ohne_vorgesetzten_link}}
          {{#modalitaeten_offen}}<table cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 20px;">
            <tr><td style="background-color:#fef3c7;border-left:3px solid #b45309;border-radius:6px;padding:14px 18px;">
              <p style="margin:0;color:#92400e;font-size:14px;line-height:1.6;">
                Die Einstellungsmodalitäten der Führungskraft stehen noch aus. Der Vorgang ist prüfbar, sobald sie eingegangen sind.
              </p>
            </td></tr>
          </table>{{/modalitaeten_offen}}
          <p style="color:#6b7280;font-size:13px;line-height:1.6;margin:0;">
            Sie können den Vorgang im HR-Portal öffnen und weiterbearbeiten.
          </p>
        </td></tr>
        <tr><td style="background-color:#f9fafb;border-radius:0 0 8px 8px;padding:18px 32px;border-top:1px solid #e5e7eb;">
          <p style="margin:0;color:#9ca3af;font-size:11px;text-align:center;line-height:1.5;"><strong style="color:#575756;">CREDO Gruppe</strong> – Freie Evangelische Schulen<br>lebensnah · wegweisend · christlich</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
    bodyText: `Fragebogen eingereicht – {{vorgangsnummer}}

Der Personalfragebogen für {{mitarbeiter_name}} wurde soeben ausgefüllt und eingereicht.

Vorgang: {{vorgangsnummer}}
Mitarbeiter: {{mitarbeiter_name}} · {{email}}
Einrichtung: {{einrichtung}}
{{#modalitaeten_eingereicht}}
Die Einstellungsmodalitäten der Führungskraft liegen bereits vor. Der Vorgang ist bereit zur Prüfung.
{{/modalitaeten_eingereicht}}{{#ohne_vorgesetzten_link}}
Für diesen Vorgang ist kein Vorgesetzten-Link vergeben. Der Vorgang ist bereit zur Prüfung.
{{/ohne_vorgesetzten_link}}{{#modalitaeten_offen}}
Die Einstellungsmodalitäten der Führungskraft stehen noch aus. Der Vorgang ist prüfbar, sobald sie eingegangen sind.
{{/modalitaeten_offen}}
Sie können den Vorgang im HR-Portal öffnen und weiterbearbeiten.

CREDO HR-Portal`,
    variables: [
      {
        key: "{{mitarbeiter_name}}",
        description:
          "Vollständiger Name des Mitarbeiters (ohne Namen die neutrale Bezeichnung – nie die E-Mail-Adresse)",
      },
      { key: "{{email}}", description: "E-Mail des Mitarbeiters" },
      { key: "{{einrichtung}}", description: "Name der Einrichtung" },
      { key: "{{vorgangsnummer}}", description: "Vorgangsnummer" },
      {
        key: "{{modalitaeten_eingereicht}}",
        description:
          "„ja“, wenn die Einstellungsmodalitäten schon vorliegen – der Vorgang ist dann bereit zur Prüfung (für {{#modalitaeten_eingereicht}}…{{/modalitaeten_eingereicht}})",
      },
      {
        key: "{{modalitaeten_offen}}",
        description:
          "„ja“, wenn ein Vorgesetzten-Link vergeben ist, die Modalitäten aber noch fehlen (für {{#modalitaeten_offen}}…{{/modalitaeten_offen}})",
      },
      {
        key: "{{ohne_vorgesetzten_link}}",
        description:
          "„ja“, wenn für den Vorgang kein Vorgesetzten-Link vergeben ist (z. B. Ehrenamt) – der Vorgang ist dann bereit zur Prüfung (für {{#ohne_vorgesetzten_link}}…{{/ohne_vorgesetzten_link}})",
      },
    ],
  },

  // =============================================
  // Vorgesetzter hat ausgefuellt (HR-Benachrichtigung)
  // =============================================
  {
    event: "supervisor-completed",
    name: "Einstellungsmodalitäten eingereicht (HR-Benachrichtigung)",
    // „für {{mitarbeiter_name}}": Ohne Namen setzt der Aufrufer
    // MITARBEITER_NEUTRAL („die neue Mitarbeiterin / den neuen Mitarbeiter") —
    // ein Akkusativ, der nur nach „für" traegt. Im parallelen Ablauf ist
    // „noch kein Name" der Regelfall, weil die Fuehrungskraft oft vor der
    // Person abgibt. Dieselbe Bauform nutzt supervisor-link-created.
    subject: "Einstellungsmodalitäten für {{mitarbeiter_name}} eingereicht ({{vorgangsnummer}})",
    bodyHtml: `<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <tr><td style="background-color:#1a1a2e;border-radius:8px 8px 0 0;padding:24px 32px;">
          <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:bold;">CREDO HR-Portal</h1>
          <p style="margin:4px 0 0;color:#a0a0c0;font-size:13px;">{{einrichtung}}</p>
        </td></tr>
        <tr><td style="background-color:#ffffff;padding:32px;">
          <table cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
            <tr><td style="background-color:#eef6e3;border-radius:6px;padding:8px 16px;"><span style="color:#41671a;font-weight:bold;font-size:14px;">✓ Einstellungsmodalitäten vollständig</span></td></tr>
          </table>
          <h2 style="color:#1a1a2e;font-size:19px;margin:0 0 16px;">Einstellungsmodalitäten eingegangen</h2>
          <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 22px;">
            Die Einstellungsmodalitäten für <strong>{{mitarbeiter_name}}</strong> wurden von der Führungskraft eingereicht.
          </p>
          <table cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 22px;">
            <tr><td style="background-color:#f9fafb;border:1px solid #eceef1;border-radius:8px;padding:4px 0;">
              <table cellpadding="0" cellspacing="0" style="width:100%;">
                <tr><td style="padding:13px 18px 6px;">
                  <p style="margin:0 0 2px;color:#9ca3af;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;font-weight:bold;">Vorgang</p>
                  <p style="margin:0;color:#2d2d2d;font-size:15px;font-weight:bold;">{{vorgangsnummer}}</p>
                </td></tr>
                <tr><td style="padding:0 18px 6px;">
                  <p style="margin:0 0 2px;color:#9ca3af;font-size:11px;">Mitarbeiter</p>
                  <p style="margin:0;color:#374151;font-size:14px;">{{mitarbeiter_name}}</p>
                </td></tr>
                <tr><td style="padding:0 18px 13px;">
                  <p style="margin:0 0 2px;color:#9ca3af;font-size:11px;">Einrichtung</p>
                  <p style="margin:0;color:#374151;font-size:14px;">{{einrichtung}}</p>
                </td></tr>
              </table>
            </td></tr>
          </table>
          {{#fragebogen_eingereicht}}<table cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 20px;">
            <tr><td style="background-color:#eef6e3;border-left:3px solid #41671a;border-radius:6px;padding:14px 18px;">
              <p style="margin:0;color:#41671a;font-size:14px;line-height:1.6;">
                Der Personalfragebogen liegt bereits vor. <strong>Der Vorgang ist bereit zur Prüfung.</strong>
              </p>
            </td></tr>
          </table>{{/fragebogen_eingereicht}}
          {{#fragebogen_offen}}<table cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 20px;">
            <tr><td style="background-color:#fef3c7;border-left:3px solid #b45309;border-radius:6px;padding:14px 18px;">
              <p style="margin:0;color:#92400e;font-size:14px;line-height:1.6;">
                Der Personalfragebogen steht noch aus. Der Vorgang ist prüfbar, sobald er eingegangen ist.
              </p>
            </td></tr>
          </table>{{/fragebogen_offen}}
          <p style="color:#6b7280;font-size:13px;line-height:1.6;margin:0;">
            Sie können den Vorgang im HR-Portal öffnen.
          </p>
        </td></tr>
        <tr><td style="background-color:#f9fafb;border-radius:0 0 8px 8px;padding:18px 32px;border-top:1px solid #e5e7eb;">
          <p style="margin:0;color:#9ca3af;font-size:11px;text-align:center;line-height:1.5;"><strong style="color:#575756;">CREDO Gruppe</strong> – Freie Evangelische Schulen<br>lebensnah · wegweisend · christlich</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
    bodyText: `Einstellungsmodalitäten eingegangen – {{vorgangsnummer}}

Die Einstellungsmodalitäten für {{mitarbeiter_name}} wurden von der Führungskraft eingereicht.

Vorgang: {{vorgangsnummer}}
Mitarbeiter: {{mitarbeiter_name}}
Einrichtung: {{einrichtung}}
{{#fragebogen_eingereicht}}
Der Personalfragebogen liegt bereits vor. Der Vorgang ist bereit zur Prüfung.
{{/fragebogen_eingereicht}}{{#fragebogen_offen}}
Der Personalfragebogen steht noch aus. Der Vorgang ist prüfbar, sobald er eingegangen ist.
{{/fragebogen_offen}}
Sie können den Vorgang im HR-Portal öffnen.

CREDO HR-Portal`,
    variables: [
      {
        key: "{{mitarbeiter_name}}",
        description:
          "Vollständiger Name des Mitarbeiters (ohne Namen die neutrale Bezeichnung – nie die E-Mail-Adresse)",
      },
      { key: "{{einrichtung}}", description: "Name der Einrichtung" },
      { key: "{{vorgangsnummer}}", description: "Vorgangsnummer" },
      {
        key: "{{fragebogen_eingereicht}}",
        description:
          "„ja“, wenn der Personalfragebogen schon vorliegt – der Vorgang ist dann bereit zur Prüfung (für {{#fragebogen_eingereicht}}…{{/fragebogen_eingereicht}})",
      },
      {
        key: "{{fragebogen_offen}}",
        description:
          "„ja“, solange der Personalfragebogen aussteht (für {{#fragebogen_offen}}…{{/fragebogen_offen}})",
      },
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
            Hallo{{#vorname}} {{vorname}}{{/vorname}}, wir haben festgestellt, dass Ihr Personalfragebogen seit <strong>{{tage_offen}} Tagen</strong> noch nicht vollständig ausgefüllt wurde.
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

Hallo{{#vorname}} {{vorname}}{{/vorname}}, Ihr Personalfragebogen ist seit {{tage_offen}} Tagen offen.

Bitte fuellen Sie ihn zeitnah aus:
{{link}}

Bei Fragen wenden Sie sich bitte an Ihre HR-Ansprechperson.

CREDO Gruppe – {{einrichtung}}`,
    variables: [
      {
        key: "{{vorname}}",
        description:
          "Vorname (aus ‚Neuer Vorgang‘ oder dem Fragebogen; kann leer sein – für die Anrede {{#vorname}}…{{/vorname}} verwenden)",
      },
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
    // Name identisch mit dem Katalog (events.ts) — der Test events-catalog
    // erzwingt das. Betreff und Text mit Umlauten wie die Einladung
    // (supervisor-link-created), zu der diese Mail die Erinnerung ist.
    name: "Erinnerung Vorgesetzter (Modalitäten ausstehend)",
    subject: "Erinnerung: Einstellungsmodalitäten für {{mitarbeiter_name}} offen",
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
          <h2 style="color:#1a1a2e;font-size:18px;margin:0 0 16px;">Einstellungsmodalitäten ausstehend</h2>
          <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px;">
            Die Einstellungsmodalitäten für <strong>{{mitarbeiter_name}}</strong> sind seit <strong>{{tage_offen}} Tagen</strong> offen.
          </p>
          <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 24px;">
            Bitte füllen Sie das Formular zeitnah aus, damit die Personalabteilung den Arbeitsvertrag vorbereiten kann.
          </p>
          <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
            <tr><td style="background-color:#f59e0b;border-radius:8px;">
              <a href="{{supervisor_link}}" style="display:inline-block;padding:14px 28px;color:#ffffff;text-decoration:none;font-weight:bold;font-size:15px;">
                Einstellungsmodalitäten ausfüllen →
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
    bodyText: `Erinnerung: Einstellungsmodalitäten ausstehend

Die Einstellungsmodalitäten für {{mitarbeiter_name}} sind seit {{tage_offen}} Tagen offen.

Bitte füllen Sie das Formular aus:
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
  // Onboarding: Aufgaben fuer eine Abteilung bzw. die Fuehrungskraft
  // (Paket 5) — vier Vorlagen
  //
  // Gegenstueck zu den vier Offboarding-Vorlagen weiter unten; dieselben
  // Regeln gelten unveraendert:
  //   - Ausloeser und Payload stehen in src/lib/abteilungsaufgaben-dienst.ts
  //     (zuweisungsPayload, erinnerungsPayload) und
  //     src/lib/abteilungsaufgaben-uebergaenge.ts (aufgabeErledigtMelden,
  //     abteilungFertigMelden); der gemeinsame Teil kommt aus
  //     src/lib/onboarding-abteilung-mail.ts.
  //   - Empfaenger ist eine Abteilung ODER die Fuehrungskraft des Vorgangs
  //     (Schluessel VORGESETZTER, dann {{abteilung}} = "Führungskraft").
  //     Angesprochen ist "Sie" — das traegt beide Empfaenger.
  //   - {{aufgabenliste_html}} und {{kommentar}} sind schon maskiert und
  //     gehoeren ins HTML; die Rohtexte {{aufgabenliste}} und
  //     {{kommentar_text}} nur in den Textteil. Im HTML maskiert der Mailer
  //     sie trotzdem (FREITEXT_VARIABLEN), falls ein Admin sie dort einsetzt.
  //   - Bedingungsbloecke brauchen einen nicht leeren Wert; die Merker
  //     (erneut_gesendet, neuer_link, ist_fuehrungskraft, ist_info,
  //     ist_warnung, ist_eskalation, ist_ueberfaellig) sind "ja" oder "".
  //     Bloecke nie verschachteln — renderTemplate loest nur eine Ebene auf.
  //
  // Zwei Unterschiede zum Offboarding:
  //   - {{abteilung}} steht NIE im Satzsubjekt und nie hinter einer
  //     Praeposition ohne Artikel: Der Wert ist ein Anzeigename aus den
  //     Einstellungen ("Datenschutzbeauftragte/r", "Verwaltung / Sekretariat",
  //     "Fuehrungskraft"), und "Fuer Datenschutzbeauftragte/r sind ..." ist
  //     kein deutscher Satz. Loesung wie im Offboarding: Der Satz spricht die
  //     Empfaenger mit "Sie" an, die Zustaendigkeit steht in Klammern
  //     ("zustaendig: {{abteilung}}") oder in einer Label-Zeile.
  //   - Bezug ist der DIENSTBEGINN, nie ein Austritt. {{vertragsbeginn}} ist
  //     TT.MM.JJJJ; {{mitarbeiter_name}} ist NIE leer und NIE eine Adresse
  //     (ohne Namen steht dort "die neue Mitarbeiterin / den neuen
  //     Mitarbeiter" — deshalb ueberall "für …", nie "von …").
  //   - Nur die Zuweisungsmail kennt die Zusatzangaben
  //     {{stellenbezeichnung}}, {{betriebsstaette}} und
  //     {{ansprechpartner_email}}, und auch die nur, wenn
  //     ONBOARDING_ZUSATZFELDER sie dem Schluessel erlaubt (Datensparsamkeit,
  //     src/lib/abteilungsaufgaben.ts). Nicht erlaubte Felder fehlen ganz —
  //     deshalb stehen sie in Bedingungsbloecken, sonst bliebe eine leere
  //     Zeile "Betriebsstätte:" stehen. Ein Admin darf sie in dieser Vorlage
  //     auch weglassen; was NICHT geht, ist sie in eine der drei anderen
  //     Vorlagen zu setzen — dort liefert sie keine Aufrufstelle.
  // =============================================
  {
    event: "onboarding-department-assigned",
    name: "Onboarding-Aufgaben für Abteilung zugewiesen",
    subject: "Onboarding-Aufgaben für {{abteilung}}: Dienstbeginn {{vertragsbeginn}} ({{einrichtung}})",
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
            <span style="color:#1e40af;font-weight:bold;font-size:14px;">Neue Aufgaben</span>
          </div>
          <h2 style="color:#1a1a2e;font-size:18px;margin:0 0 16px;">Aufgaben zum Dienstbeginn</h2>
          <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px;">
            Guten Tag, bitte bereiten Sie den Dienstbeginn für <strong>{{mitarbeiter_name}}</strong> am {{vertragsbeginn}} in {{einrichtung}} vor. Folgende Aufgaben sind für Sie vorgesehen (zuständig: {{abteilung}}):
          </p>
          {{aufgabenliste_html}}
          {{#ist_fuehrungskraft}}<p style="color:#374151;font-size:14px;line-height:1.6;margin:0 0 16px;">
            Sie erhalten diese Aufgaben, weil Sie im Onboarding-Vorgang als Führungskraft eingetragen sind. Falls das nicht zutrifft, geben Sie bitte der Personalabteilung Bescheid.
          </p>{{/ist_fuehrungskraft}}
          <table cellpadding="0" cellspacing="0" style="width:100%;background-color:#f9fafb;border-radius:8px;margin:0 0 24px;">
            <tr><td style="padding:16px;">
              <p style="margin:0 0 4px;color:#6b7280;font-size:12px;">Vertragsbeginn</p>
              <p style="margin:0;color:#374151;font-size:14px;">{{vertragsbeginn}}</p>
            </td></tr>
            <tr><td style="padding:0 16px 16px;">
              <p style="margin:0 0 4px;color:#6b7280;font-size:12px;">Vorgangsnummer</p>
              <p style="margin:0;color:#374151;font-size:14px;">{{vorgangsnummer}}</p>
            </td></tr>
            {{#stellenbezeichnung}}<tr><td style="padding:0 16px 16px;">
              <p style="margin:0 0 4px;color:#6b7280;font-size:12px;">Stellenbezeichnung</p>
              <p style="margin:0;color:#374151;font-size:14px;">{{stellenbezeichnung}}</p>
            </td></tr>{{/stellenbezeichnung}}
            {{#betriebsstaette}}<tr><td style="padding:0 16px 16px;">
              <p style="margin:0 0 4px;color:#6b7280;font-size:12px;">Betriebsstätte</p>
              <p style="margin:0;color:#374151;font-size:14px;">{{betriebsstaette}}</p>
            </td></tr>{{/betriebsstaette}}
            {{#ansprechpartner_email}}<tr><td style="padding:0 16px 16px;">
              <p style="margin:0 0 4px;color:#6b7280;font-size:12px;">Ansprechpartner (Führungskraft)</p>
              <p style="margin:0;color:#374151;font-size:14px;">{{ansprechpartner_email}}</p>
            </td></tr>{{/ansprechpartner_email}}
          </table>
          <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
            <tr><td style="background-color:#2563eb;border-radius:8px;">
              <a href="{{link}}" style="display:inline-block;padding:14px 28px;color:#ffffff;text-decoration:none;font-weight:bold;font-size:15px;">
                Aufgaben öffnen und abhaken →
              </a>
            </td></tr>
          </table>
          <p style="color:#6b7280;font-size:13px;line-height:1.5;margin:0 0 12px;">
            Der Link funktioniert ohne Anmeldung und ist bis {{ablaufdatum}} gültig. Bitte leiten Sie ihn nur innerhalb Ihres Bereichs weiter. Rückfragen beantwortet die Personalabteilung.
          </p>
          {{#erneut_gesendet}}<p style="color:#6b7280;font-size:13px;line-height:1.5;margin:0 0 12px;">
            Diese Nachricht wurde erneut gesendet. Der Link ist unverändert.
          </p>{{/erneut_gesendet}}
          {{#neuer_link}}<p style="color:#92400e;font-size:13px;line-height:1.5;margin:0 0 12px;">
            Dies ist ein neuer Link. Ein früher versendeter Link ist nicht mehr gültig.
          </p>{{/neuer_link}}
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
    bodyText: `Onboarding-Aufgaben für {{abteilung}}: Dienstbeginn {{vertragsbeginn}} ({{einrichtung}})

Bitte bereiten Sie den Dienstbeginn für {{mitarbeiter_name}} am {{vertragsbeginn}} in {{einrichtung}} vor. Folgende Aufgaben sind für Sie vorgesehen (zuständig: {{abteilung}}):

{{aufgabenliste}}
{{#ist_fuehrungskraft}}
Sie erhalten diese Aufgaben, weil Sie im Onboarding-Vorgang als Führungskraft eingetragen sind. Falls das nicht zutrifft, geben Sie bitte der Personalabteilung Bescheid.
{{/ist_fuehrungskraft}}
Vertragsbeginn: {{vertragsbeginn}}
{{#stellenbezeichnung}}Stellenbezeichnung: {{stellenbezeichnung}}
{{/stellenbezeichnung}}{{#betriebsstaette}}Betriebsstätte: {{betriebsstaette}}
{{/betriebsstaette}}{{#ansprechpartner_email}}Ansprechpartner (Führungskraft): {{ansprechpartner_email}}
{{/ansprechpartner_email}}
Aufgaben öffnen: {{link}}
Gültig bis {{ablaufdatum}}. Bitte leiten Sie den Link nur innerhalb Ihres Bereichs weiter.
{{#erneut_gesendet}}
Diese Nachricht wurde erneut gesendet. Der Link ist unverändert.
{{/erneut_gesendet}}{{#neuer_link}}
Dies ist ein neuer Link. Ein früher versendeter Link ist nicht mehr gültig.
{{/neuer_link}}
Vorgangsnummer: {{vorgangsnummer}}

CREDO HR-Portal`,
    variables: [
      { key: "{{mitarbeiter_name}}", description: "Name der neuen Mitarbeiterin / des neuen Mitarbeiters – ohne bekannten Namen „die neue Mitarbeiterin / den neuen Mitarbeiter“ (nie leer, nie eine E-Mail-Adresse)" },
      { key: "{{vorname}}", description: "Vorname (kann vor dem Fragebogen leer sein)" },
      { key: "{{nachname}}", description: "Nachname (kann vor dem Fragebogen leer sein)" },
      { key: "{{abteilung}}", description: "Zuständigkeit: Name der Abteilung bzw. „Führungskraft“" },
      { key: "{{einrichtung}}", description: "Name der Einrichtung" },
      { key: "{{vertragsbeginn}}", description: "Vertragsbeginn / Dienstbeginn (TT.MM.JJJJ)" },
      { key: "{{link}}", description: "Link zu den Aufgaben (ohne Anmeldung)" },
      { key: "{{ablaufdatum}}", description: "Der Link ist gültig bis (TT.MM.JJJJ)" },
      { key: "{{vorgangsnummer}}", description: "Vorgangsnummer" },
      { key: "{{aufgabenliste}}", description: "Aufgaben als Klartext, eine Zeile je Aufgabe („- Titel – fällig TT.MM.JJJJ“), ein Hinweis eingerückt darunter – für den Textteil" },
      { key: "{{aufgabenliste_html}}", description: "Dieselben Aufgaben als HTML-Liste, bereits maskiert – für den HTML-Teil" },
      { key: "{{anzahl_aufgaben}}", description: "Anzahl der gelisteten Aufgaben" },
      { key: "{{naechste_faelligkeit}}", description: "Früheste Fälligkeit der gelisteten Aufgaben (TT.MM.JJJJ, leer ohne Fälligkeit)" },
      { key: "{{stellenbezeichnung}}", description: "Stellenbezeichnung aus den Einstellungsmodalitäten – nur für Zuständigkeiten, die sie sehen dürfen, sonst leer (für {{#stellenbezeichnung}}…{{/stellenbezeichnung}})" },
      { key: "{{betriebsstaette}}", description: "Betriebsstätte aus den Einstellungsmodalitäten – nur für Zuständigkeiten, die sie sehen dürfen, sonst leer" },
      { key: "{{ansprechpartner_email}}", description: "E-Mail der Führungskraft des Vorgangs – nur für Zuständigkeiten, die sie sehen dürfen, sonst leer" },
      { key: "{{erneut_gesendet}}", description: "„ja“, wenn die Mail mit unverändertem Link erneut gesendet wird, sonst leer (für {{#erneut_gesendet}}…{{/erneut_gesendet}})" },
      { key: "{{neuer_link}}", description: "„ja“, wenn ein neuer Link vergeben wurde (Link erneuert oder Adresse geändert) – der alte gilt dann nicht mehr; sonst leer" },
      { key: "{{ist_fuehrungskraft}}", description: "„ja“, wenn die Mail an die Führungskraft geht, sonst leer" },
    ],
  },

  // =============================================
  // Onboarding: Erinnerung offene Abteilungsaufgaben
  //
  // Knopf "Erinnern" und Abschnitt 3 des taeglichen Laufs
  // (/api/cron/reminders) senden denselben Aufbau. Die Stufe steckt in je
  // einem Merker, weil renderTemplate nicht vergleichen kann: ist_info (bald
  // faellig), ist_warnung (ueberfaellig), ist_eskalation (seit 3 Tagen und
  // mehr ueberfaellig). ist_ueberfaellig haengt an den Aufgaben, nicht an der
  // Stufe. Bewusst KEIN Satz, HR werde informiert — eine HR-Eskalation gibt
  // es nicht. Aufgaben ohne Faelligkeit loesen nie eine Erinnerung aus.
  // =============================================
  {
    event: "onboarding-department-reminder",
    name: "Erinnerung: Offene Onboarding-Aufgaben",
    subject:
      "{{#ist_eskalation}}Dringend – {{/ist_eskalation}}Erinnerung: Onboarding-Aufgaben für {{abteilung}} – Dienstbeginn {{vertragsbeginn}}",
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
          {{#ist_info}}<div style="display:inline-block;background-color:#fef3c7;border-radius:6px;padding:8px 16px;margin-bottom:24px;">
            <span style="color:#92400e;font-weight:bold;font-size:14px;">Erinnerung</span>
          </div>{{/ist_info}}
          {{#ist_warnung}}<div style="display:inline-block;background-color:#ffedd5;border-radius:6px;padding:8px 16px;margin-bottom:24px;">
            <span style="color:#9a3412;font-weight:bold;font-size:14px;">Überfällig</span>
          </div>{{/ist_warnung}}
          {{#ist_eskalation}}<div style="display:inline-block;background-color:#fee2e2;border-radius:6px;padding:8px 16px;margin-bottom:24px;">
            <span style="color:#991b1b;font-weight:bold;font-size:14px;">Dringend: überfällig</span>
          </div>{{/ist_eskalation}}
          <h2 style="color:#1a1a2e;font-size:18px;margin:0 0 16px;">Offene Aufgaben zum Dienstbeginn</h2>
          <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px;">
            Bitte denken Sie an die offenen Aufgaben für <strong>{{mitarbeiter_name}}</strong> (Dienstbeginn {{vertragsbeginn}}). Für Sie sind noch <strong>{{offene_aufgaben}}</strong> Aufgabe(n) offen (zuständig: {{abteilung}}):
          </p>
          {{aufgabenliste_html}}
          {{#ist_ueberfaellig}}<table cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 24px;">
            <tr><td style="background-color:#fef2f2;border:1px solid #fca5a5;border-radius:8px;padding:12px 16px;">
              <p style="margin:0;color:#991b1b;font-size:14px;line-height:1.5;">{{ueberfaellige_aufgaben}} Aufgabe(n) sind überfällig, die älteste seit {{tage_ueberfaellig}} Tag(en). Bitte erledigen Sie sie umgehend oder geben Sie der Personalabteilung Bescheid.</p>
            </td></tr>
          </table>{{/ist_ueberfaellig}}
          <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
            <tr><td style="background-color:#f59e0b;border-radius:8px;">
              <a href="{{link}}" style="display:inline-block;padding:14px 28px;color:#ffffff;text-decoration:none;font-weight:bold;font-size:15px;">
                Aufgaben öffnen und abhaken →
              </a>
            </td></tr>
          </table>
          <p style="color:#6b7280;font-size:13px;line-height:1.5;margin:0 0 12px;">
            Der Link funktioniert ohne Anmeldung und ist bis {{ablaufdatum}} gültig. Bitte leiten Sie ihn nur innerhalb Ihres Bereichs weiter. Rückfragen beantwortet die Personalabteilung.
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
    bodyText: `{{#ist_eskalation}}Dringend – {{/ist_eskalation}}Erinnerung: Onboarding-Aufgaben für {{abteilung}} – Dienstbeginn {{vertragsbeginn}}

Bitte denken Sie an die offenen Aufgaben für {{mitarbeiter_name}} (Dienstbeginn {{vertragsbeginn}}). Für Sie sind noch {{offene_aufgaben}} Aufgabe(n) offen (zuständig: {{abteilung}}):

{{aufgabenliste}}
{{#ist_ueberfaellig}}
{{ueberfaellige_aufgaben}} Aufgabe(n) sind überfällig, die älteste seit {{tage_ueberfaellig}} Tag(en). Bitte erledigen Sie sie umgehend oder geben Sie der Personalabteilung Bescheid.
{{/ist_ueberfaellig}}
Aufgaben öffnen: {{link}}
Gültig bis {{ablaufdatum}}. Bitte leiten Sie den Link nur innerhalb Ihres Bereichs weiter.

Vorgangsnummer: {{vorgangsnummer}}

CREDO HR-Portal`,
    variables: [
      { key: "{{mitarbeiter_name}}", description: "Name der neuen Mitarbeiterin / des neuen Mitarbeiters – ohne bekannten Namen „die neue Mitarbeiterin / den neuen Mitarbeiter“ (nie leer, nie eine E-Mail-Adresse)" },
      { key: "{{abteilung}}", description: "Zuständigkeit: Name der erinnerten Abteilung bzw. „Führungskraft“" },
      { key: "{{einrichtung}}", description: "Name der Einrichtung" },
      { key: "{{vertragsbeginn}}", description: "Vertragsbeginn / Dienstbeginn (TT.MM.JJJJ)" },
      { key: "{{offene_aufgaben}}", description: "Anzahl der offenen Aufgaben dieser Zuständigkeit" },
      { key: "{{aufgabenliste}}", description: "Offene Aufgaben als Klartext, eine Zeile je Aufgabe, ein Hinweis eingerückt darunter – für den Textteil" },
      { key: "{{aufgabenliste_html}}", description: "Dieselben Aufgaben als HTML-Liste, bereits maskiert – für den HTML-Teil" },
      { key: "{{anzahl_aufgaben}}", description: "Anzahl der gelisteten (offenen) Aufgaben" },
      { key: "{{naechste_faelligkeit}}", description: "Früheste Fälligkeit der offenen Aufgaben (TT.MM.JJJJ, leer ohne Fälligkeit)" },
      { key: "{{ueberfaellige_aufgaben}}", description: "Anzahl der überfälligen Aufgaben (leer, wenn nichts überfällig ist)" },
      { key: "{{tage_ueberfaellig}}", description: "So viele Tage ist die älteste überfällige Aufgabe überfällig (leer, wenn nichts überfällig ist)" },
      { key: "{{ist_ueberfaellig}}", description: "„ja“, wenn mindestens eine Aufgabe überfällig ist, sonst leer (für {{#ist_ueberfaellig}}…{{/ist_ueberfaellig}})" },
      { key: "{{ist_info}}", description: "„ja“ bei der Stufe „Erinnerung“ (bald fällig), sonst leer" },
      { key: "{{ist_warnung}}", description: "„ja“ bei der Stufe „Überfällig“, sonst leer" },
      { key: "{{ist_eskalation}}", description: "„ja“ bei der Stufe „Dringend“ (seit 3 Tagen oder länger überfällig), sonst leer" },
      { key: "{{ist_fuehrungskraft}}", description: "„ja“, wenn die Mail an die Führungskraft geht, sonst leer" },
      { key: "{{link}}", description: "Link zu den Aufgaben (ohne Anmeldung)" },
      { key: "{{ablaufdatum}}", description: "Der Link ist gültig bis (TT.MM.JJJJ)" },
      { key: "{{vorgangsnummer}}", description: "Vorgangsnummer" },
    ],
  },

  // =============================================
  // Onboarding: Aufgabe erledigt (an HR)
  //
  // Geht nur hinaus, wenn in der Vorlage ein An-Feld steht (Katalog to: "").
  // Ausloeser ist AUSSCHLIESSLICH der Link der Abteilung — hakt HR im Portal
  // ab, meldet das Portal HR nichts an sich selbst (Entscheidung Paket 5).
  // {{kommentar}} ist schon maskiert (Zeilenumbrueche als <br>),
  // {{kommentar_text}} ist der Rohtext und steht NUR im Textteil.
  // =============================================
  {
    event: "onboarding-task-completed",
    name: "Onboarding-Aufgabe erledigt",
    subject: "Onboarding-Aufgabe erledigt: {{aufgabe}} ({{abteilung}})",
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
            Die Aufgabe „{{aufgabe}}“ für {{mitarbeiter_name}} wurde als erledigt markiert.
          </p>
          <table cellpadding="0" cellspacing="0" style="width:100%;background-color:#f9fafb;border-radius:8px;margin:0 0 24px;">
            <tr><td style="padding:16px;">
              <p style="margin:0 0 4px;color:#6b7280;font-size:12px;">Zuständigkeit</p>
              <p style="margin:0;color:#374151;font-size:14px;">{{abteilung}}</p>
            </td></tr>
            <tr><td style="padding:0 16px 16px;">
              <p style="margin:0 0 4px;color:#6b7280;font-size:12px;">Erledigt über</p>
              <p style="margin:0;color:#374151;font-size:14px;">{{erledigt_ueber}}</p>
            </td></tr>
            <tr><td style="padding:0 16px 16px;">
              <p style="margin:0 0 4px;color:#6b7280;font-size:12px;">Vertragsbeginn</p>
              <p style="margin:0;color:#374151;font-size:14px;">{{vertragsbeginn}}</p>
            </td></tr>
            <tr><td style="padding:0 16px 16px;">
              <p style="margin:0 0 4px;color:#6b7280;font-size:12px;">Vorgangsnummer</p>
              <p style="margin:0;color:#374151;font-size:14px;">{{vorgangsnummer}}</p>
            </td></tr>
            <tr><td style="padding:0 16px 16px;">
              <p style="margin:0 0 4px;color:#6b7280;font-size:12px;">Noch offen im Vorgang</p>
              <p style="margin:0;color:#374151;font-size:14px;">{{offene_aufgaben}} Aufgabe(n)</p>
            </td></tr>
          </table>
          {{#kommentar}}<table cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 24px;">
            <tr><td style="background-color:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:12px 16px;">
              <p style="margin:0 0 4px;color:#1e40af;font-size:12px;font-weight:bold;">Kommentar der Abteilung:</p>
              <p style="margin:0;color:#374151;font-size:14px;line-height:1.5;">{{kommentar}}</p>
            </td></tr>
          </table>{{/kommentar}}
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
    bodyText: `Onboarding-Aufgabe erledigt: {{aufgabe}} ({{abteilung}})

Die Aufgabe „{{aufgabe}}“ für {{mitarbeiter_name}} wurde als erledigt markiert.

Zuständigkeit: {{abteilung}}
Erledigt über: {{erledigt_ueber}}
Vertragsbeginn: {{vertragsbeginn}}
Vorgangsnummer: {{vorgangsnummer}}
Noch offen im Vorgang: {{offene_aufgaben}} Aufgabe(n)
{{#kommentar_text}}
Kommentar der Abteilung: {{kommentar_text}}
{{/kommentar_text}}
CREDO HR-Portal`,
    variables: [
      { key: "{{aufgabe}}", description: "Titel der erledigten Aufgabe" },
      { key: "{{abteilung}}", description: "Zuständigkeit der Aufgabe bzw. „Führungskraft“" },
      { key: "{{mitarbeiter_name}}", description: "Name der neuen Mitarbeiterin / des neuen Mitarbeiters – ohne bekannten Namen „die neue Mitarbeiterin / den neuen Mitarbeiter“ (nie leer, nie eine E-Mail-Adresse)" },
      { key: "{{erledigt_ueber}}", description: "„Link der Abteilung“ bzw. „Link der Führungskraft“" },
      { key: "{{kommentar}}", description: "Kommentar der Abteilung für den HTML-Teil, bereits maskiert (Zeilenumbrüche als <br>); leer ohne Kommentar (für {{#kommentar}}…{{/kommentar}})" },
      { key: "{{kommentar_text}}", description: "Kommentar der Abteilung als Rohtext – nur für den Textteil (im HTML-Teil wird er maskiert)" },
      { key: "{{einrichtung}}", description: "Name der Einrichtung" },
      { key: "{{vertragsbeginn}}", description: "Vertragsbeginn / Dienstbeginn (TT.MM.JJJJ)" },
      { key: "{{offene_aufgaben}}", description: "Anzahl der im ganzen Vorgang noch offenen Aufgaben" },
      { key: "{{offene_aufgaben_abteilung}}", description: "Anzahl der noch offenen Aufgaben dieser Zuständigkeit" },
      { key: "{{vorgangsnummer}}", description: "Vorgangsnummer" },
    ],
  },

  // =============================================
  // Onboarding: Abteilung vollstaendig abgeschlossen (Bestaetigung)
  //
  // Genau einmal beim Uebergang auf "fertig" ueber den Link
  // (abteilungsaufgaben-uebergaenge.ts), nie beim Abhaken im Portal. Der Text
  // ist neutral formuliert, weil die Bestaetigung auch an die Fuehrungskraft
  // geht (VORGESETZTER) — eine EINZELNE Person, keine Abteilung: "Ihnen
  // zugewiesenen Aufgaben ({{abteilung}})" statt "Aufgaben fuer {{abteilung}}".
  // {{abteilung}} steht nie im Satzsubjekt, weil "Datenschutzbeauftragte/r"
  // und "Verwaltung / Sekretariat" dort einen Artikel braeuchten (wie in den
  // Offboarding-Vorlagen geloest).
  // =============================================
  {
    event: "onboarding-department-completed",
    name: "Onboarding: Abteilung abgeschlossen (Bestaetigung)",
    subject: "Danke – alle Onboarding-Aufgaben für {{abteilung}} erledigt ({{vorgangsnummer}})",
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
            <span style="color:#065f46;font-weight:bold;font-size:14px;">Aufgaben erledigt</span>
          </div>
          <h2 style="color:#1a1a2e;font-size:18px;margin:0 0 16px;">Alle Ihre Aufgaben sind erledigt</h2>
          <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px;">
            Vielen Dank. Alle <strong>{{anzahl_aufgaben}}</strong> Ihnen zugewiesenen Aufgaben ({{abteilung}}) zum Dienstbeginn am {{vertragsbeginn}} in {{einrichtung}} sind erledigt. Die Personalabteilung sieht Ihre Rückmeldung im Portal.
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
    bodyText: `Danke – alle Onboarding-Aufgaben für {{abteilung}} erledigt ({{vorgangsnummer}})

Vielen Dank. Alle {{anzahl_aufgaben}} Ihnen zugewiesenen Aufgaben ({{abteilung}}) zum Dienstbeginn am {{vertragsbeginn}} in {{einrichtung}} sind erledigt. Die Personalabteilung sieht Ihre Rückmeldung im Portal.

Diese E-Mail wurde automatisch vom CREDO HR-Portal versendet.

CREDO HR-Portal`,
    variables: [
      { key: "{{abteilung}}", description: "Zuständigkeit: Name der Abteilung bzw. „Führungskraft“" },
      { key: "{{anzahl_aufgaben}}", description: "Anzahl der erledigten Aufgaben dieser Zuständigkeit" },
      { key: "{{vertragsbeginn}}", description: "Vertragsbeginn / Dienstbeginn (TT.MM.JJJJ)" },
      { key: "{{einrichtung}}", description: "Name der Einrichtung" },
      { key: "{{mitarbeiter_name}}", description: "Name der neuen Mitarbeiterin / des neuen Mitarbeiters – ohne bekannten Namen „die neue Mitarbeiterin / den neuen Mitarbeiter“ (nie leer, nie eine E-Mail-Adresse)" },
      { key: "{{email}}", description: "E-Mail der Abteilungs-Kontaktperson (Empfänger)" },
      { key: "{{vorgangsnummer}}", description: "Vorgangsnummer" },
      { key: "{{ist_fuehrungskraft}}", description: "„ja“, wenn die Bestätigung an die Führungskraft geht, sonst leer" },
    ],
  },

  // =============================================
  // Offboarding: Neuer Vorgang erstellt
  //
  // Fuer alle Offboarding-Vorlagen gilt: {{vorname}}, {{nachname}},
  // {{einrichtung}} und {{austrittsdatum}} (TT.MM.JJJJ) liefert jede
  // Aufrufstelle ueber offboardingMailFelder (src/lib/offboarding-mail.ts).
  // Aliase fuer die englischen Feldnamen stehen in extractVariables
  // (src/lib/mailer.ts). Bis September 2026 blieben diese Platzhalter leer,
  // weil Vorlagen und Aufrufer verschiedene Namen benutzten — wer hier einen
  // neuen Platzhalter einfuehrt, prueft ihn gegen ALLE Aufrufer
  // (Test: src/__tests__/api/offboarding-mails.test.ts).
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
            Für <strong>{{vorname}} {{nachname}}</strong> wurde ein Offboarding-Vorgang angelegt.
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
  // Offboarding: Aufgaben fuer eine Abteilung bzw. die Fuehrungskraft
  // (Paket 1b)
  //
  // Fuer die drei Vorlagen der Abteilungsaufgaben (zugewiesen, Erinnerung,
  // erledigt) gilt zusaetzlich:
  //   - Ausloeser und Payload stehen in src/lib/abteilungsaufgaben-dienst.ts
  //     (zuweisungsPayload, erinnerungsPayload) und
  //     src/lib/abteilungsaufgaben-uebergaenge.ts (aufgabeErledigtMelden).
  //   - Empfaenger ist eine Abteilung ODER die Fuehrungskraft des Vorgangs
  //     (Schluessel VORGESETZTER, dann {{abteilung}} = "Führungskraft"). Der
  //     Text setzt {{abteilung}} deshalb nie hinter einen Artikel: "für
  //     IT-Abteilung" fehlt der Artikel, "für die Führungskraft" passte nicht
  //     zur Abteilung. Die Zustaendigkeit steht in Klammern ("zuständig: …"),
  //     angesprochen ist "Sie" — das traegt beide Empfaenger.
  //   - {{aufgabenliste_html}} und {{kommentar}} sind schon maskiert
  //     (aufgabenlisteMailFelder, kommentarMailFelder) und gehoeren ins HTML;
  //     die Rohtexte {{aufgabenliste}} und {{kommentar_text}} nur in den
  //     Textteil. Im HTML maskiert der Mailer sie trotzdem (FREITEXT_VARIABLEN),
  //     falls ein Admin sie dort einsetzt.
  //   - Bedingungsbloecke brauchen einen nicht leeren Wert; die Merker
  //     (erneut_gesendet, neuer_link, ist_fuehrungskraft, ist_info,
  //     ist_warnung, ist_eskalation, ist_ueberfaellig) sind "ja" oder "".
  //     Bloecke nie verschachteln — renderTemplate loest nur eine Ebene auf.
  // =============================================
  {
    event: "offboarding-department-assigned",
    name: "Offboarding-Aufgaben für Abteilung zugewiesen",
    subject: "Offboarding-Aufgaben für {{abteilung}}: {{vorname}} {{nachname}} (letzter Arbeitstag {{austrittsdatum}})",
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
            Im Rahmen des Austritts von <strong>{{vorname}} {{nachname}}</strong> ({{einrichtung}}) sind folgende Aufgaben für Sie vorgesehen (zuständig: {{abteilung}}):
          </p>
          {{aufgabenliste_html}}
          {{#ist_fuehrungskraft}}<p style="color:#374151;font-size:14px;line-height:1.6;margin:0 0 16px;">
            Sie erhalten diese Aufgaben, weil Sie im Austrittsvorgang als Führungskraft eingetragen sind. Falls das nicht zutrifft, geben Sie bitte der Personalabteilung Bescheid.
          </p>{{/ist_fuehrungskraft}}
          <table cellpadding="0" cellspacing="0" style="width:100%;background-color:#f9fafb;border-radius:8px;margin:0 0 24px;">
            <tr><td style="padding:16px;">
              <p style="margin:0 0 4px;color:#6b7280;font-size:12px;">Letzter Arbeitstag</p>
              <p style="margin:0;color:#374151;font-size:14px;">{{austrittsdatum}}</p>
            </td></tr>
            <tr><td style="padding:0 16px 16px;">
              <p style="margin:0 0 4px;color:#6b7280;font-size:12px;">Vorgangsnummer</p>
              <p style="margin:0;color:#374151;font-size:14px;">{{vorgangsnummer}}</p>
            </td></tr>
          </table>
          <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
            <tr><td style="background-color:#2563eb;border-radius:8px;">
              <a href="{{link}}" style="display:inline-block;padding:14px 28px;color:#ffffff;text-decoration:none;font-weight:bold;font-size:15px;">
                Aufgaben öffnen und abhaken →
              </a>
            </td></tr>
          </table>
          <p style="color:#6b7280;font-size:13px;line-height:1.5;margin:0 0 12px;">
            Der Link funktioniert ohne Anmeldung und ist bis {{ablaufdatum}} gültig. Bitte leiten Sie ihn nur innerhalb Ihres Bereichs weiter.
          </p>
          {{#erneut_gesendet}}<p style="color:#6b7280;font-size:13px;line-height:1.5;margin:0 0 12px;">
            Diese Nachricht wurde erneut gesendet. Der Link ist unverändert.
          </p>{{/erneut_gesendet}}
          {{#neuer_link}}<p style="color:#92400e;font-size:13px;line-height:1.5;margin:0 0 12px;">
            Dies ist ein neuer Link. Ein früher versendeter Link ist nicht mehr gültig.
          </p>{{/neuer_link}}
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
    bodyText: `Offboarding-Aufgaben für {{abteilung}}: {{vorname}} {{nachname}} (letzter Arbeitstag {{austrittsdatum}})

Im Rahmen des Austritts von {{vorname}} {{nachname}} ({{einrichtung}}) sind folgende Aufgaben für Sie vorgesehen (zuständig: {{abteilung}}):

{{aufgabenliste}}
{{#ist_fuehrungskraft}}
Sie erhalten diese Aufgaben, weil Sie im Austrittsvorgang als Führungskraft eingetragen sind. Falls das nicht zutrifft, geben Sie bitte der Personalabteilung Bescheid.
{{/ist_fuehrungskraft}}
Letzter Arbeitstag: {{austrittsdatum}}

Aufgaben öffnen und abhaken: {{link}}
Der Link funktioniert ohne Anmeldung und ist bis {{ablaufdatum}} gültig. Bitte leiten Sie ihn nur innerhalb Ihres Bereichs weiter.
{{#erneut_gesendet}}
Diese Nachricht wurde erneut gesendet. Der Link ist unverändert.
{{/erneut_gesendet}}{{#neuer_link}}
Dies ist ein neuer Link. Ein früher versendeter Link ist nicht mehr gültig.
{{/neuer_link}}
Vorgangsnummer: {{vorgangsnummer}}

CREDO HR-Portal`,
    variables: [
      { key: "{{vorname}}", description: "Vorname des Mitarbeiters" },
      { key: "{{nachname}}", description: "Nachname des Mitarbeiters" },
      { key: "{{abteilung}}", description: "Zuständigkeit: Name der Abteilung bzw. „Führungskraft“" },
      { key: "{{einrichtung}}", description: "Name der Einrichtung" },
      { key: "{{austrittsdatum}}", description: "Letzter Arbeitstag (TT.MM.JJJJ)" },
      { key: "{{link}}", description: "Link zu den Aufgaben (ohne Anmeldung)" },
      { key: "{{ablaufdatum}}", description: "Der Link ist gültig bis (TT.MM.JJJJ)" },
      { key: "{{vorgangsnummer}}", description: "Vorgangsnummer" },
      { key: "{{aufgabenliste}}", description: "Aufgaben als Klartext, eine Zeile je Aufgabe („- Titel – fällig TT.MM.JJJJ“) – für den Textteil" },
      { key: "{{aufgabenliste_html}}", description: "Dieselben Aufgaben als HTML-Liste, bereits maskiert – für den HTML-Teil" },
      { key: "{{anzahl_aufgaben}}", description: "Anzahl der gelisteten Aufgaben" },
      { key: "{{naechste_faelligkeit}}", description: "Früheste Fälligkeit der gelisteten Aufgaben (TT.MM.JJJJ, leer ohne Fälligkeit)" },
      { key: "{{erneut_gesendet}}", description: "„ja“, wenn die Mail mit unverändertem Link erneut gesendet wird, sonst leer (für {{#erneut_gesendet}}…{{/erneut_gesendet}})" },
      { key: "{{neuer_link}}", description: "„ja“, wenn ein neuer Link vergeben wurde (Link erneuert oder Adresse geändert) – der alte gilt dann nicht mehr; sonst leer" },
      { key: "{{ist_fuehrungskraft}}", description: "„ja“, wenn die Mail an die Führungskraft geht, sonst leer" },
    ],
  },

  // =============================================
  // Offboarding: Aufgabe erledigt (an HR)
  //
  // Geht nur hinaus, wenn in der Vorlage ein An-Feld steht (Katalog to: "").
  // Ausloeser: die Abteilung hakt ueber ihren Link ab, oder HR hakt im Portal
  // eine Aufgabe einer Link-Abteilung ab — genau einmal je Wechsel offen →
  // erledigt. {{kommentar}} ist schon maskiert (Zeilenumbrueche als <br>),
  // {{kommentar_text}} ist der Rohtext und steht NUR im Textteil.
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
              <p style="margin:0 0 4px;color:#6b7280;font-size:12px;">Erledigt über</p>
              <p style="margin:0;color:#374151;font-size:14px;">{{erledigt_ueber}}</p>
            </td></tr>
            <tr><td style="padding:0 16px 16px;">
              <p style="margin:0 0 4px;color:#6b7280;font-size:12px;">Noch offen im Vorgang</p>
              <p style="margin:0;color:#374151;font-size:14px;">{{offene_aufgaben}} Aufgabe(n)</p>
            </td></tr>
          </table>
          {{#kommentar}}<table cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 24px;">
            <tr><td style="background-color:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:12px 16px;">
              <p style="margin:0 0 4px;color:#1e40af;font-size:12px;font-weight:bold;">Kommentar der Abteilung:</p>
              <p style="margin:0;color:#374151;font-size:14px;line-height:1.5;">{{kommentar}}</p>
            </td></tr>
          </table>{{/kommentar}}
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
Erledigt über: {{erledigt_ueber}}
Noch offen im Vorgang: {{offene_aufgaben}} Aufgabe(n)
{{#kommentar_text}}
Kommentar der Abteilung: {{kommentar_text}}
{{/kommentar_text}}
CREDO HR-Portal`,
    variables: [
      { key: "{{vorname}}", description: "Vorname des Mitarbeiters" },
      { key: "{{nachname}}", description: "Nachname des Mitarbeiters" },
      { key: "{{aufgabe}}", description: "Name der erledigten Aufgabe" },
      { key: "{{abteilung}}", description: "Zuständige Abteilung der Aufgabe bzw. „Führungskraft“" },
      { key: "{{erledigt_ueber}}", description: "„Link der Abteilung“, „Link der Führungskraft“ oder „Portal“" },
      { key: "{{kommentar}}", description: "Kommentar der Abteilung für den HTML-Teil, bereits maskiert (Zeilenumbrüche als <br>); leer ohne Kommentar (für {{#kommentar}}…{{/kommentar}})" },
      { key: "{{kommentar_text}}", description: "Kommentar der Abteilung als Rohtext – nur für den Textteil (im HTML-Teil wird er maskiert)" },
      { key: "{{einrichtung}}", description: "Name der Einrichtung" },
      { key: "{{offene_aufgaben}}", description: "Anzahl der im ganzen Vorgang noch offenen Aufgaben" },
      { key: "{{offene_aufgaben_abteilung}}", description: "Anzahl der noch offenen Aufgaben dieser Abteilung" },
      { key: "{{austrittsdatum}}", description: "Letzter Arbeitstag (TT.MM.JJJJ)" },
      { key: "{{vorgangsnummer}}", description: "Vorgangsnummer" },
    ],
  },

  // =============================================
  // Offboarding: Erinnerung offene Aufgaben
  //
  // Knopf "Erinnern" und taeglicher Lauf senden denselben Aufbau
  // (erinnerungsPayload). Die Stufe steckt in je einem Merker, weil
  // renderTemplate nicht vergleichen kann: ist_info (bald faellig),
  // ist_warnung (ueberfaellig), ist_eskalation (seit 3 Tagen und mehr
  // ueberfaellig). ist_ueberfaellig haengt an den Aufgaben, nicht an der Stufe.
  // Bewusst KEIN Satz, HR werde informiert — eine HR-Eskalation gibt es nicht.
  // =============================================
  {
    event: "offboarding-reminder",
    name: "Erinnerung: Offene Offboarding-Aufgaben",
    subject: "{{#ist_eskalation}}Dringend – {{/ist_eskalation}}Erinnerung: Offboarding-Aufgaben für {{abteilung}} ({{vorname}} {{nachname}})",
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
          {{#ist_info}}<div style="display:inline-block;background-color:#fef3c7;border-radius:6px;padding:8px 16px;margin-bottom:24px;">
            <span style="color:#92400e;font-weight:bold;font-size:14px;">Erinnerung</span>
          </div>{{/ist_info}}
          {{#ist_warnung}}<div style="display:inline-block;background-color:#ffedd5;border-radius:6px;padding:8px 16px;margin-bottom:24px;">
            <span style="color:#9a3412;font-weight:bold;font-size:14px;">Überfällig</span>
          </div>{{/ist_warnung}}
          {{#ist_eskalation}}<div style="display:inline-block;background-color:#fee2e2;border-radius:6px;padding:8px 16px;margin-bottom:24px;">
            <span style="color:#991b1b;font-weight:bold;font-size:14px;">Dringend: überfällig</span>
          </div>{{/ist_eskalation}}
          <h2 style="color:#1a1a2e;font-size:18px;margin:0 0 16px;">Offene Offboarding-Aufgaben</h2>
          <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px;">
            Für den Austritt von <strong>{{vorname}} {{nachname}}</strong> am {{austrittsdatum}} sind für Sie noch <strong>{{offene_aufgaben}}</strong> Aufgabe(n) offen (zuständig: {{abteilung}}):
          </p>
          {{aufgabenliste_html}}
          {{#ist_ueberfaellig}}<table cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 24px;">
            <tr><td style="background-color:#fef2f2;border:1px solid #fca5a5;border-radius:8px;padding:12px 16px;">
              <p style="margin:0;color:#991b1b;font-size:14px;line-height:1.5;">{{ueberfaellige_aufgaben}} Aufgabe(n) sind überfällig, die älteste seit {{tage_ueberfaellig}} Tag(en). Bitte erledigen Sie sie umgehend oder geben Sie der Personalabteilung Bescheid.</p>
            </td></tr>
          </table>{{/ist_ueberfaellig}}
          <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
            <tr><td style="background-color:#f59e0b;border-radius:8px;">
              <a href="{{link}}" style="display:inline-block;padding:14px 28px;color:#ffffff;text-decoration:none;font-weight:bold;font-size:15px;">
                Aufgaben öffnen und abhaken →
              </a>
            </td></tr>
          </table>
          <p style="color:#6b7280;font-size:13px;line-height:1.5;margin:0 0 12px;">
            Der Link funktioniert ohne Anmeldung und ist bis {{ablaufdatum}} gültig.
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
    bodyText: `{{#ist_eskalation}}Dringend – {{/ist_eskalation}}Erinnerung: Offboarding-Aufgaben für {{abteilung}} ({{vorname}} {{nachname}})

Für den Austritt von {{vorname}} {{nachname}} am {{austrittsdatum}} sind für Sie noch {{offene_aufgaben}} Aufgabe(n) offen (zuständig: {{abteilung}}):

{{aufgabenliste}}
{{#ist_ueberfaellig}}
{{ueberfaellige_aufgaben}} Aufgabe(n) sind überfällig, die älteste seit {{tage_ueberfaellig}} Tag(en). Bitte erledigen Sie sie umgehend oder geben Sie der Personalabteilung Bescheid.
{{/ist_ueberfaellig}}
Aufgaben öffnen und abhaken: {{link}}
Der Link funktioniert ohne Anmeldung und ist bis {{ablaufdatum}} gültig.

CREDO HR-Portal`,
    variables: [
      { key: "{{vorname}}", description: "Vorname des Mitarbeiters" },
      { key: "{{nachname}}", description: "Nachname des Mitarbeiters" },
      { key: "{{einrichtung}}", description: "Name der Einrichtung" },
      { key: "{{abteilung}}", description: "Zuständigkeit: Name der erinnerten Abteilung bzw. „Führungskraft“" },
      { key: "{{austrittsdatum}}", description: "Letzter Arbeitstag (TT.MM.JJJJ)" },
      { key: "{{offene_aufgaben}}", description: "Anzahl der offenen Aufgaben dieser Abteilung" },
      { key: "{{aufgabenliste}}", description: "Offene Aufgaben als Klartext, eine Zeile je Aufgabe („- Titel – fällig TT.MM.JJJJ“) – für den Textteil" },
      { key: "{{aufgabenliste_html}}", description: "Dieselben Aufgaben als HTML-Liste, bereits maskiert – für den HTML-Teil" },
      { key: "{{anzahl_aufgaben}}", description: "Anzahl der gelisteten (offenen) Aufgaben" },
      { key: "{{naechste_faelligkeit}}", description: "Früheste Fälligkeit der offenen Aufgaben (TT.MM.JJJJ, leer ohne Fälligkeit)" },
      { key: "{{ueberfaellige_aufgaben}}", description: "Anzahl der überfälligen Aufgaben (leer, wenn nichts überfällig ist)" },
      { key: "{{tage_ueberfaellig}}", description: "So viele Tage ist die älteste überfällige Aufgabe überfällig (leer, wenn nichts überfällig ist)" },
      { key: "{{ist_ueberfaellig}}", description: "„ja“, wenn mindestens eine Aufgabe überfällig ist, sonst leer (für {{#ist_ueberfaellig}}…{{/ist_ueberfaellig}})" },
      { key: "{{ist_info}}", description: "„ja“ bei der Stufe „Erinnerung“ (bald fällig), sonst leer" },
      { key: "{{ist_warnung}}", description: "„ja“ bei der Stufe „Überfällig“, sonst leer" },
      { key: "{{ist_eskalation}}", description: "„ja“ bei der Stufe „Dringend“ (seit 3 Tagen oder länger überfällig), sonst leer" },
      { key: "{{ist_fuehrungskraft}}", description: "„ja“, wenn die Mail an die Führungskraft geht, sonst leer" },
      { key: "{{link}}", description: "Link zu den Aufgaben (ohne Anmeldung)" },
      { key: "{{ablaufdatum}}", description: "Der Link ist gültig bis (TT.MM.JJJJ)" },
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
            Das Offboarding von <strong>{{vorname}} {{nachname}}</strong> wurde abgeschlossen.
          </p>
          {{#offene_aufgaben_beim_abschluss}}<table cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 16px;">
            <tr><td style="background-color:#fffbeb;border:1px solid #fcd34d;border-radius:8px;padding:12px 16px;">
              <p style="margin:0;color:#92400e;font-size:14px;line-height:1.5;">Hinweis: Beim Abschluss waren noch <strong>{{offene_aufgaben_beim_abschluss}}</strong> Aufgabe(n) der Checkliste offen. Bitte prüfen Sie im Vorgang, ob sie noch erledigt werden müssen.</p>
            </td></tr>
          </table>{{/offene_aufgaben_beim_abschluss}}
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
{{#offene_aufgaben_beim_abschluss}}
Hinweis: Beim Abschluss waren noch {{offene_aufgaben_beim_abschluss}} Aufgabe(n) der Checkliste offen. Bitte prüfen Sie im Vorgang, ob sie noch erledigt werden müssen.
{{/offene_aufgaben_beim_abschluss}}
CREDO HR-Portal`,
    variables: [
      { key: "{{vorname}}", description: "Vorname des Mitarbeiters" },
      { key: "{{nachname}}", description: "Nachname des Mitarbeiters" },
      { key: "{{email}}", description: "E-Mail des Mitarbeiters" },
      { key: "{{einrichtung}}", description: "Name der Einrichtung" },
      { key: "{{austrittsdatum}}", description: "Austrittsdatum" },
      { key: "{{offene_aufgaben_beim_abschluss}}", description: "Anzahl offener Checklisten-Aufgaben beim Abschluss (leer, wenn alles erledigt ist; für den Bedingungsblock {{#offene_aufgaben_beim_abschluss}}…{{/offene_aufgaben_beim_abschluss}})" },
      { key: "{{vorgangsnummer}}", description: "Vorgangsnummer" },
    ],
  },

  // =============================================
  // Offboarding: Abteilung vollstaendig abgeschlossen
  //
  // Paket 1b: Die englischen Platzhalter {{employeeName}}, {{departmentName}}
  // und {{organizationName}} bleiben (sie kommen ueber den generischen
  // Durchreich in extractVariables an). Neu ist, WANN die Mail kommt: genau
  // einmal beim Uebergang auf "fertig" ueber den Link
  // (abteilungsaufgaben-uebergaenge.ts), nie beim Abhaken im Portal.
  // Der Text ist neutral formuliert, weil die Bestaetigung auch an die
  // Fuehrungskraft geht (VORGESETZTER): "Ihre Aufgaben (Führungskraft)" statt
  // "Aufgaben der Abteilung Führungskraft".
  // =============================================
  {
    event: "offboarding-department-completed",
    name: "Offboarding: Abteilung abgeschlossen (Bestaetigung)",
    subject: "Offboarding-Aufgaben erledigt: {{employeeName}}",
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
            <span style="color:#065f46;font-weight:bold;font-size:14px;">Aufgaben erledigt</span>
          </div>
          <h2 style="color:#1a1a2e;font-size:18px;margin:0 0 16px;">Alle Ihre Aufgaben sind erledigt</h2>
          <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px;">
            Vielen Dank. Im Rahmen des Offboardings von <strong>{{employeeName}}</strong> sind alle Ihnen zugewiesenen Aufgaben (<strong>{{departmentName}}</strong>) als erledigt markiert.
          </p>
          <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 24px;">
            Es sind keine weiteren Schritte Ihrerseits erforderlich. Diese E-Mail dient als Bestätigung.
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
    bodyText: `Offboarding-Aufgaben erledigt: {{employeeName}}

Vielen Dank. Im Rahmen des Offboardings von {{employeeName}} sind alle Ihnen zugewiesenen Aufgaben ({{departmentName}}) erledigt.

Es sind keine weiteren Schritte Ihrerseits erforderlich.

CREDO HR-Portal`,
    variables: [
      { key: "{{employeeName}}", description: "Name des ausscheidenden Mitarbeiters" },
      { key: "{{departmentName}}", description: "Name der Abteilung bzw. „Führungskraft“" },
      { key: "{{organizationName}}", description: "Name der Einrichtung" },
      { key: "{{email}}", description: "E-Mail der Abteilungs-Kontaktperson (Empfaenger)" },
      { key: "{{vorgangsnummer}}", description: "Vorgangsnummer (displayId)" },
      { key: "{{anzahl_aufgaben}}", description: "Anzahl der erledigten Aufgaben dieser Abteilung" },
      { key: "{{ist_fuehrungskraft}}", description: "„ja“, wenn die Bestätigung an die Führungskraft geht, sonst leer" },
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
  //
  // Nennt die einzelnen Hinweise. Vorher stand hier nur eine Zahl — die
  // zudem falsch beschriftet war: {{totalWarnings}} zaehlt HINWEISE, nicht
  // Vorgaenge (ein Vorgang kann mehrere haben). Die Liste kommt fertig
  // gebaut und maskiert aus src/lib/psi-fristen-mail.ts; die Vorlage setzt
  // sie nur ein. Markup im bisherigen Aufbau, die CI-Umfaerbung unten
  // (applyCredoCi) greift wie bei allen Vorlagen.
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
            Im täglichen Fristen-Lauf wurden <strong>{{totalWarnings}}</strong> fristrelevante Hinweise in <strong>{{anzahl_vorgaenge}}</strong> Verbeamtungsvorgang/-vorgängen erkannt. Höchste Dringlichkeit: <strong>{{hoechste_dringlichkeit}}</strong>.
          </p>
          <table cellpadding="0" cellspacing="0" style="width:100%;background-color:#f9fafb;border-radius:8px;margin:0 0 16px;">
            <tr><td style="padding:16px;">
              <p style="margin:0 0 12px;color:#6b7280;font-size:12px;">Überfällig: {{anzahl_ueberfaellig}} · Dringend: {{anzahl_dringend}} · Vorwarnung: {{anzahl_vorwarnung}}</p>
              {{warnungen_liste_html}}
            </td></tr>
          </table>
{{#weitere_warnungen}}
          <p style="color:#6b7280;font-size:13px;line-height:1.5;margin:0 0 16px;">{{weitere_warnungen}}</p>
{{/weitere_warnungen}}
          <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 24px;">
            Bitte prüfen Sie die betroffenen Vorgänge im HR-Portal und veranlassen Sie die erforderlichen Schritte.
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

Im täglichen Fristen-Lauf wurden {{totalWarnings}} fristrelevante Hinweise in {{anzahl_vorgaenge}} Vorgang/Vorgängen erkannt.
Höchste Dringlichkeit: {{hoechste_dringlichkeit}}
Überfällig: {{anzahl_ueberfaellig}} · Dringend: {{anzahl_dringend}} · Vorwarnung: {{anzahl_vorwarnung}}

{{warnungen_liste}}
{{#weitere_warnungen}}
{{weitere_warnungen}}
{{/weitere_warnungen}}

Bitte prüfen Sie die betroffenen Vorgänge im HR-Portal.

CREDO HR-Portal`,
    variables: [
      { key: "{{totalWarnings}}", description: "Anzahl der Hinweise (nicht der Vorgänge)" },
      { key: "{{anzahl_vorgaenge}}", description: "Anzahl der betroffenen Vorgänge" },
      { key: "{{hoechste_dringlichkeit}}", description: "Höchste Dringlichkeit (Überfällig/Dringend/Vorwarnung)" },
      { key: "{{anzahl_ueberfaellig}}", description: "Anzahl überfälliger Hinweise" },
      { key: "{{anzahl_dringend}}", description: "Anzahl dringender Hinweise" },
      { key: "{{anzahl_vorwarnung}}", description: "Anzahl der Vorwarnungen" },
      { key: "{{warnungen_liste_html}}", description: "Liste der Hinweise als <ul>, maskiert, mit Link in das Portal (HTML-Teil)" },
      { key: "{{warnungen_liste}}", description: "Liste der Hinweise, eine Zeile je Hinweis (Textteil)" },
      { key: "{{weitere_warnungen}}", description: "Satz zu nicht aufgeführten Hinweisen (ab 50); sonst leer" },
      { key: "{{#weitere_warnungen}}...{{/weitere_warnungen}}", description: "Block, der nur erscheint, wenn Hinweise weggelassen wurden" },
      { key: "{{topSeverity}}", description: "Höchste Dringlichkeit als Code (OVERDUE/URGENT/WARNING), für ältere Vorlagen" },
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
  // Vertragsende: HR-Benachrichtigung (neuer Vorgang)
  // =============================================
  hrStatusNotification({
    event: "contract-end-created",
    name: "Neuer Vertragsende-Vorgang erstellt",
    subject: "Neuer Vertragsende-Vorgang: {{mitarbeiter_name}} ({{vorgangsnummer}})",
    badge: "Vertragsende",
    badgeBg: "#e0f3fb",
    badgeText: "#0a7ca6",
    heading: "Neuer Vertragsende-Vorgang",
    text: "Für <strong>{{mitarbeiter_name}}</strong> ({{einrichtung}}) wurde ein Vertragsende-Vorgang (<strong>{{vorgangsnummer}}</strong>) angelegt. Bitte entscheiden Sie im Portal über Übernahme (Vertragsverlängerung) oder Austritt (Offboarding).",
  }),

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

  // =============================================
  // Starterpaket versandt (Onboarding-Abschluss, mit PDF-Anhang an MA)
  // =============================================
  {
    event: "onboarding-starter-packet-sent",
    name: "Starterpaket versandt (Onboarding-Abschluss)",
    subject: "Herzlich willkommen bei {{einrichtung}} – Ihr Starterpaket",
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
            <span style="color:#065f46;font-weight:bold;font-size:14px;">Herzlich willkommen</span>
          </div>
          <h2 style="color:#1a1a2e;font-size:18px;margin:0 0 16px;">Willkommen im Team, {{vorname}}!</h2>
          <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px;">
            wir freuen uns sehr, Sie bei {{einrichtung}} begrüßen zu dürfen. Im Anhang dieser E-Mail finden Sie Ihr persönliches Starterpaket mit wichtigen Unterlagen rund um Ihren Start bei uns.
          </p>

          <table cellpadding="0" cellspacing="0" style="width:100%;background-color:#f9fafb;border-radius:8px;margin:0 0 24px;">
            <tr><td style="padding:16px;">
              <p style="margin:0 0 8px;color:#6b7280;font-size:12px;text-transform:uppercase;font-weight:bold;">Im Anhang ({{anzahlDokumente}})</p>
              <div style="margin:0;color:#374151;font-size:14px;line-height:1.6;">{{dokumentenliste_html}}</div>
            </td></tr>
          </table>

{{#nachricht}}
          <table cellpadding="0" cellspacing="0" style="width:100%;border-left:3px solid #FBC900;background-color:#fffbea;border-radius:4px;margin:0 0 24px;">
            <tr><td style="padding:14px 16px;">
              <p style="margin:0;color:#374151;font-size:14px;line-height:1.6;">{{nachricht_html}}</p>
            </td></tr>
          </table>
{{/nachricht}}
          <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px;">
            Bitte lesen Sie die Unterlagen in Ruhe durch und bewahren Sie sie auf. Bei Fragen ist Ihre HR-Ansprechperson gerne für Sie da.
          </p>

          <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px;">
            Mit freundlichen Grüßen<br>
            {{sachbearbeiter_name}}
          </p>

          <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
          <p style="color:#9ca3af;font-size:12px;margin:0;">
            Vorgang: {{vorgangsnummer}}<br>
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
    bodyText: `Willkommen im Team, {{vorname}}!

wir freuen uns, Sie bei {{einrichtung}} begrüßen zu dürfen. Im Anhang dieser E-Mail finden Sie Ihr persönliches Starterpaket.

Im Anhang ({{anzahlDokumente}}):
{{dokumentenliste}}
{{#nachricht}}
{{nachricht}}
{{/nachricht}}
Bitte lesen Sie die Unterlagen in Ruhe durch und bewahren Sie sie auf.

Mit freundlichen Grüßen
{{sachbearbeiter_name}}

Vorgang: {{vorgangsnummer}}

CREDO Gruppe – {{einrichtung}}`,
    variables: [
      { key: "{{vorname}}", description: "Vorname des Mitarbeiters" },
      { key: "{{nachname}}", description: "Nachname des Mitarbeiters" },
      { key: "{{email}}", description: "E-Mail des Mitarbeiters" },
      { key: "{{einrichtung}}", description: "Name der Einrichtung" },
      { key: "{{vorgangsnummer}}", description: "Vorgangsnummer (displayId)" },
      { key: "{{anzahlDokumente}}", description: "Anzahl der angehaengten Dokumente" },
      { key: "{{dokumentenliste}}", description: "Nummerierte Liste der Anhaenge (Textteil)" },
      { key: "{{dokumentenliste_html}}", description: "Liste der Anhaenge als <ol> (HTML-Teil)" },
      { key: "{{nachricht}}", description: "Persoenliche Nachricht aus dem Versand-Dialog (Textteil)" },
      { key: "{{nachricht_html}}", description: "Dieselbe Nachricht HTML-sicher, Umbrueche als <br>" },
      { key: "{{#nachricht}}...{{/nachricht}}", description: "Block, der nur erscheint, wenn eine Nachricht eingegeben wurde" },
      { key: "{{sachbearbeiter_name}}", description: "Wer versendet hat (Gruszformel)" },
    ],
  },

  // =============================================
  // Dokumentenpaket in den uebrigen drei Modulen (Phase 2)
  //
  // Aufbau bewusst gleich: dieselben Variablen, derselbe bedingte
  // Nachrichtenblock, je Modul ein eigenes Datum in einem eigenen bedingten
  // Block — fehlt das Datum im Vorgang, entfaellt der Satz, statt halb
  // dazustehen.
  // =============================================
  {
    event: "offboarding-documents-sent",
    name: "Unterlagen zum Austritt (Offboarding)",
    subject: "Ihre Unterlagen zum Austritt aus {{einrichtung}}",
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
          <div style="display:inline-block;background-color:#e5e7eb;border-radius:6px;padding:8px 16px;margin-bottom:24px;">
            <span style="color:#374151;font-weight:bold;font-size:14px;">Unterlagen zum Austritt</span>
          </div>
          <h2 style="color:#1a1a2e;font-size:18px;margin:0 0 16px;">Guten Tag {{vorname}} {{nachname}},</h2>
          <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px;">
            im Anhang dieser E-Mail finden Sie die Unterlagen zu Ihrem Austritt aus {{einrichtung}}.{{#austrittsdatum}} Ihr Arbeitsverhältnis endet zum {{austrittsdatum}}.{{/austrittsdatum}}
          </p>

          <table cellpadding="0" cellspacing="0" style="width:100%;background-color:#f9fafb;border-radius:8px;margin:0 0 24px;">
            <tr><td style="padding:16px;">
              <p style="margin:0 0 8px;color:#6b7280;font-size:12px;text-transform:uppercase;font-weight:bold;">Im Anhang ({{anzahlDokumente}})</p>
              <div style="margin:0;color:#374151;font-size:14px;line-height:1.6;">{{dokumentenliste_html}}</div>
            </td></tr>
          </table>
{{#nachricht}}
          <table cellpadding="0" cellspacing="0" style="width:100%;border-left:3px solid #FBC900;background-color:#fffbea;border-radius:4px;margin:0 0 24px;">
            <tr><td style="padding:14px 16px;">
              <p style="margin:0;color:#374151;font-size:14px;line-height:1.6;">{{nachricht_html}}</p>
            </td></tr>
          </table>
{{/nachricht}}
          <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px;">
            Bitte bewahren Sie diese Unterlagen sorgfältig auf — die Bescheinigungen zur Sozialversicherung und für die Agentur für Arbeit brauchen Sie unter Umständen kurzfristig. Bei Rückfragen zu den Unterlagen wenden Sie sich gerne an uns.
          </p>

          <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px;">
            Mit freundlichen Grüßen<br>
            {{sachbearbeiter_name}}
          </p>

          <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
          <p style="color:#9ca3af;font-size:12px;margin:0;">
            Vorgang: {{vorgangsnummer}}<br>
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
    bodyText: `Guten Tag {{vorname}} {{nachname}},

im Anhang dieser E-Mail finden Sie die Unterlagen zu Ihrem Austritt aus {{einrichtung}}.{{#austrittsdatum}} Ihr Arbeitsverhältnis endet zum {{austrittsdatum}}.{{/austrittsdatum}}

Im Anhang ({{anzahlDokumente}}):
{{dokumentenliste}}
{{#nachricht}}
{{nachricht}}
{{/nachricht}}
Bitte bewahren Sie diese Unterlagen sorgfältig auf — die Bescheinigungen zur Sozialversicherung und für die Agentur für Arbeit brauchen Sie unter Umständen kurzfristig.

Bei Rückfragen zu den Unterlagen wenden Sie sich gerne an uns.

Mit freundlichen Grüßen
{{sachbearbeiter_name}}

Vorgang: {{vorgangsnummer}}

CREDO Gruppe – {{einrichtung}}`,
    variables: [
      { key: "{{vorname}}", description: "Vorname der Person" },
      { key: "{{nachname}}", description: "Nachname der Person" },
      { key: "{{email}}", description: "E-Mail der Person" },
      { key: "{{einrichtung}}", description: "Name der Einrichtung" },
      { key: "{{vorgangsnummer}}", description: "Vorgangsnummer (displayId)" },
      { key: "{{anzahlDokumente}}", description: "Anzahl der angehaengten Dokumente" },
      { key: "{{dokumentenliste}}", description: "Nummerierte Liste der Anhaenge (Textteil)" },
      { key: "{{dokumentenliste_html}}", description: "Liste der Anhaenge als <ol> (HTML-Teil)" },
      { key: "{{nachricht}}", description: "Persoenliche Nachricht aus dem Versand-Dialog (Textteil)" },
      { key: "{{nachricht_html}}", description: "Dieselbe Nachricht HTML-sicher, Umbrueche als <br>" },
      { key: "{{#nachricht}}...{{/nachricht}}", description: "Block, der nur bei eingegebener Nachricht erscheint" },
      { key: "{{austrittsdatum}}", description: "Datum aus dem Vorgang; leer, wenn keines hinterlegt ist" },
      { key: "{{#austrittsdatum}}...{{/austrittsdatum}}", description: "Block, der nur bei vorhandenem Datum erscheint" },
      { key: "{{sachbearbeiter_name}}", description: "Wer versendet hat (Gruszformel)" },
    ],
  },

  {
    event: "civil-service-documents-sent",
    name: "Unterlagen zur Verbeamtung",
    subject: "Unterlagen zu Ihrer Verbeamtung – {{einrichtung}}",
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
          <div style="display:inline-block;background-color:#dbeafe;border-radius:6px;padding:8px 16px;margin-bottom:24px;">
            <span style="color:#1e40af;font-weight:bold;font-size:14px;">Verbeamtungsverfahren</span>
          </div>
          <h2 style="color:#1a1a2e;font-size:18px;margin:0 0 16px;">Guten Tag {{vorname}} {{nachname}},</h2>
          <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px;">
            im Anhang dieser E-Mail finden Sie die Unterlagen zu Ihrem Verbeamtungsverfahren bei {{einrichtung}}.{{#probezeit_beginn}} Ihre Probezeit beginnt am {{probezeit_beginn}}.{{/probezeit_beginn}}
          </p>

          <table cellpadding="0" cellspacing="0" style="width:100%;background-color:#f9fafb;border-radius:8px;margin:0 0 24px;">
            <tr><td style="padding:16px;">
              <p style="margin:0 0 8px;color:#6b7280;font-size:12px;text-transform:uppercase;font-weight:bold;">Im Anhang ({{anzahlDokumente}})</p>
              <div style="margin:0;color:#374151;font-size:14px;line-height:1.6;">{{dokumentenliste_html}}</div>
            </td></tr>
          </table>
{{#nachricht}}
          <table cellpadding="0" cellspacing="0" style="width:100%;border-left:3px solid #FBC900;background-color:#fffbea;border-radius:4px;margin:0 0 24px;">
            <tr><td style="padding:14px 16px;">
              <p style="margin:0;color:#374151;font-size:14px;line-height:1.6;">{{nachricht_html}}</p>
            </td></tr>
          </table>
{{/nachricht}}
          <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px;">
            Bitte prüfen Sie die Unterlagen. Sofern Vordrucke auszufüllen oder zu unterschreiben sind, senden Sie diese bitte fristgerecht zurück. Bei Rückfragen wenden Sie sich gerne an uns.
          </p>

          <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px;">
            Mit freundlichen Grüßen<br>
            {{sachbearbeiter_name}}
          </p>

          <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
          <p style="color:#9ca3af;font-size:12px;margin:0;">
            Vorgang: {{vorgangsnummer}}<br>
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
    bodyText: `Guten Tag {{vorname}} {{nachname}},

im Anhang dieser E-Mail finden Sie die Unterlagen zu Ihrem Verbeamtungsverfahren bei {{einrichtung}}.{{#probezeit_beginn}} Ihre Probezeit beginnt am {{probezeit_beginn}}.{{/probezeit_beginn}}

Im Anhang ({{anzahlDokumente}}):
{{dokumentenliste}}
{{#nachricht}}
{{nachricht}}
{{/nachricht}}
Bitte prüfen Sie die Unterlagen. Sofern Vordrucke auszufüllen oder zu unterschreiben sind, senden Sie diese bitte fristgerecht zurück.

Bei Rückfragen wenden Sie sich gerne an uns.

Mit freundlichen Grüßen
{{sachbearbeiter_name}}

Vorgang: {{vorgangsnummer}}

CREDO Gruppe – {{einrichtung}}`,
    variables: [
      { key: "{{vorname}}", description: "Vorname der Person" },
      { key: "{{nachname}}", description: "Nachname der Person" },
      { key: "{{email}}", description: "E-Mail der Person" },
      { key: "{{einrichtung}}", description: "Name der Einrichtung" },
      { key: "{{vorgangsnummer}}", description: "Vorgangsnummer (displayId)" },
      { key: "{{anzahlDokumente}}", description: "Anzahl der angehaengten Dokumente" },
      { key: "{{dokumentenliste}}", description: "Nummerierte Liste der Anhaenge (Textteil)" },
      { key: "{{dokumentenliste_html}}", description: "Liste der Anhaenge als <ol> (HTML-Teil)" },
      { key: "{{nachricht}}", description: "Persoenliche Nachricht aus dem Versand-Dialog (Textteil)" },
      { key: "{{nachricht_html}}", description: "Dieselbe Nachricht HTML-sicher, Umbrueche als <br>" },
      { key: "{{#nachricht}}...{{/nachricht}}", description: "Block, der nur bei eingegebener Nachricht erscheint" },
      { key: "{{probezeit_beginn}}", description: "Datum aus dem Vorgang; leer, wenn keines hinterlegt ist" },
      { key: "{{#probezeit_beginn}}...{{/probezeit_beginn}}", description: "Block, der nur bei vorhandenem Datum erscheint" },
      { key: "{{sachbearbeiter_name}}", description: "Wer versendet hat (Gruszformel)" },
    ],
  },

  {
    event: "contract-renewal-documents-sent",
    name: "Unterlagen zur Vertragsverlaengerung",
    subject: "Ihre Vertragsverlängerung bei {{einrichtung}} – Unterlagen",
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
            <span style="color:#065f46;font-weight:bold;font-size:14px;">Vertragsverlängerung</span>
          </div>
          <h2 style="color:#1a1a2e;font-size:18px;margin:0 0 16px;">Guten Tag {{vorname}} {{nachname}},</h2>
          <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px;">
            wir freuen uns, dass Sie {{einrichtung}} erhalten bleiben. Im Anhang finden Sie die Unterlagen zu Ihrer Vertragsverlängerung.{{#vertragsende_neu}} Ihr Vertrag läuft nun bis zum {{vertragsende_neu}}.{{/vertragsende_neu}}
          </p>

          <table cellpadding="0" cellspacing="0" style="width:100%;background-color:#f9fafb;border-radius:8px;margin:0 0 24px;">
            <tr><td style="padding:16px;">
              <p style="margin:0 0 8px;color:#6b7280;font-size:12px;text-transform:uppercase;font-weight:bold;">Im Anhang ({{anzahlDokumente}})</p>
              <div style="margin:0;color:#374151;font-size:14px;line-height:1.6;">{{dokumentenliste_html}}</div>
            </td></tr>
          </table>
{{#nachricht}}
          <table cellpadding="0" cellspacing="0" style="width:100%;border-left:3px solid #FBC900;background-color:#fffbea;border-radius:4px;margin:0 0 24px;">
            <tr><td style="padding:14px 16px;">
              <p style="margin:0;color:#374151;font-size:14px;line-height:1.6;">{{nachricht_html}}</p>
            </td></tr>
          </table>
{{/nachricht}}
          <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px;">
            Bitte prüfen Sie die Unterlagen. Falls eine Ausfertigung unterschrieben zurückzusenden ist, finden Sie den Hinweis im jeweiligen Dokument. Bei Rückfragen wenden Sie sich gerne an uns.
          </p>

          <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px;">
            Mit freundlichen Grüßen<br>
            {{sachbearbeiter_name}}
          </p>

          <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
          <p style="color:#9ca3af;font-size:12px;margin:0;">
            Vorgang: {{vorgangsnummer}}<br>
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
    bodyText: `Guten Tag {{vorname}} {{nachname}},

wir freuen uns, dass Sie {{einrichtung}} erhalten bleiben. Im Anhang finden Sie die Unterlagen zu Ihrer Vertragsverlängerung.{{#vertragsende_neu}} Ihr Vertrag läuft nun bis zum {{vertragsende_neu}}.{{/vertragsende_neu}}

Im Anhang ({{anzahlDokumente}}):
{{dokumentenliste}}
{{#nachricht}}
{{nachricht}}
{{/nachricht}}
Bitte prüfen Sie die Unterlagen. Falls eine Ausfertigung unterschrieben zurückzusenden ist, finden Sie den Hinweis im jeweiligen Dokument.

Bei Rückfragen wenden Sie sich gerne an uns.

Mit freundlichen Grüßen
{{sachbearbeiter_name}}

Vorgang: {{vorgangsnummer}}

CREDO Gruppe – {{einrichtung}}`,
    variables: [
      { key: "{{vorname}}", description: "Vorname der Person" },
      { key: "{{nachname}}", description: "Nachname der Person" },
      { key: "{{email}}", description: "E-Mail der Person" },
      { key: "{{einrichtung}}", description: "Name der Einrichtung" },
      { key: "{{vorgangsnummer}}", description: "Vorgangsnummer (displayId)" },
      { key: "{{anzahlDokumente}}", description: "Anzahl der angehaengten Dokumente" },
      { key: "{{dokumentenliste}}", description: "Nummerierte Liste der Anhaenge (Textteil)" },
      { key: "{{dokumentenliste_html}}", description: "Liste der Anhaenge als <ol> (HTML-Teil)" },
      { key: "{{nachricht}}", description: "Persoenliche Nachricht aus dem Versand-Dialog (Textteil)" },
      { key: "{{nachricht_html}}", description: "Dieselbe Nachricht HTML-sicher, Umbrueche als <br>" },
      { key: "{{#nachricht}}...{{/nachricht}}", description: "Block, der nur bei eingegebener Nachricht erscheint" },
      { key: "{{vertragsende_neu}}", description: "Datum aus dem Vorgang; leer, wenn keines hinterlegt ist" },
      { key: "{{#vertragsende_neu}}...{{/vertragsende_neu}}", description: "Block, der nur bei vorhandenem Datum erscheint" },
      { key: "{{sachbearbeiter_name}}", description: "Wer versendet hat (Gruszformel)" },
    ],
  },

  // =============================================
  // Befristete Nachweise: Fristerinnerung an HR
  //
  // Beide Vorlagen sind so gebaut, dass HR handeln kann, ohne erst das Portal
  // zu oeffnen: WER, WELCHES Papier, BIS WANN, WIE VIELE Tage — und was zu tun
  // ist. Der Link ist die Abkuerzung, nicht die Voraussetzung.
  //
  // `{{mitarbeiter_name}}` steht nur nach „für“ (auch als Label „Nachweis für“):
  // Ohne bekannten Namen setzt der Cron MITARBEITER_NEUTRAL ein, einen
  // Akkusativ („die neue Mitarbeiterin / den neuen Mitarbeiter“) — nach „von“
  // oder als Subjekt zerbraeche der Satz. Frueher stand dort die private
  // E-Mail-Adresse der Person im Betreff.
  // =============================================
  {
    event: "dokument-ablauf-warnung",
    name: "Befristeter Nachweis läuft ab (HR-Erinnerung)",
    subject: "Nachweis läuft ab: {{dokument_typ}} für {{mitarbeiter_name}} ({{dringlichkeit}})",
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
          <div style="display:inline-block;background-color:#fff3c9;border-radius:6px;padding:8px 16px;margin-bottom:24px;">
            <span style="color:#8a6d00;font-weight:bold;font-size:14px;">Fristerinnerung · {{dringlichkeit}}</span>
          </div>
          <h2 style="color:#1a1a2e;font-size:19px;margin:0 0 16px;">{{dokument_typ}} für {{mitarbeiter_name}} läuft ab</h2>
          <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 20px;">
            der Nachweis <strong>{{dokument_typ}}</strong> für <strong>{{mitarbeiter_name}}</strong> gilt nur noch bis zum <strong>{{gueltig_bis}}</strong> — das sind noch <strong>{{tage_verbleibend}} Tage</strong>.
          </p>

          <!-- Daten -->
          <table cellpadding="0" cellspacing="0" style="width:100%;background-color:#f9fafb;border-radius:8px;margin:0 0 22px;">
            <tr><td style="padding:16px 18px;">
              <p style="margin:0 0 10px;color:#6b7280;font-size:12px;">Nachweis für</p>
              <p style="margin:0 0 16px;color:#374151;font-size:14px;">{{mitarbeiter_name}} · {{mitarbeiter_email}}<br>{{einrichtung}} · Vorgang {{vorgangsnummer}}</p>
              <p style="margin:0 0 10px;color:#6b7280;font-size:12px;">Dokument</p>
              <p style="margin:0 0 16px;color:#374151;font-size:14px;">{{dokument_typ}}<br><span style="color:#6b7280;font-size:13px;">{{dokument_datei}}</span></p>
              <p style="margin:0 0 10px;color:#6b7280;font-size:12px;">Frist</p>
              <p style="margin:0;color:#374151;font-size:14px;">{{frist_text}}</p>
            </td></tr>
          </table>

          <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 22px;">
            Bitte stoßen Sie die Verlängerung jetzt an. Den Antrag stellt die beschäftigte Person selbst bei der Ausländerbehörde; von der Terminvergabe bis zum neuen Titel vergehen regelmäßig Wochen bis Monate. Der neue Nachweis gehört anschließend <strong>mit seinem Ablaufdatum</strong> in den Vorgang — erst dann endet diese Erinnerung.
          </p>

          <!-- Button -->
          <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
            <tr><td style="background-color:#575756;border-radius:8px;">
              <a href="{{portalLink}}" style="display:inline-block;padding:14px 30px;color:#ffffff;text-decoration:none;font-weight:bold;font-size:15px;">
                Vorgang im Portal öffnen →
              </a>
            </td></tr>
          </table>

          <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 18px;">
          <p style="color:#6b7280;font-size:13px;line-height:1.6;margin:0;">
            Diese Erinnerung wiederholt sich in kürzer werdenden Abständen, je näher der Ablauf rückt (ab 90 Tagen monatlich, ab 42 Tagen alle zwei Wochen, ab 14 Tagen alle drei Tage). Sie endet, sobald ein Nachweis mit späterer Frist im Vorgang liegt.
          </p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="background-color:#f9fafb;border-radius:0 0 8px 8px;padding:18px 32px;border-top:1px solid #e5e7eb;">
          <p style="margin:0 0 4px;color:#9ca3af;font-size:11px;text-align:center;line-height:1.5;">
            <strong style="color:#575756;">CREDO Gruppe</strong> – Freie Evangelische Schulen<br>lebensnah · wegweisend · christlich
          </p>
          <p style="margin:0;color:#bbbbbb;font-size:11px;text-align:center;">{{einrichtung}}</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`,
    bodyText: `Fristerinnerung ({{dringlichkeit}}) – {{dokument_typ}} für {{mitarbeiter_name}} läuft ab

Der Nachweis {{dokument_typ}} für {{mitarbeiter_name}} gilt nur noch bis zum {{gueltig_bis}} — das sind noch {{tage_verbleibend}} Tage.

Nachweis für: {{mitarbeiter_name}} · {{mitarbeiter_email}}
              {{einrichtung}} · Vorgang {{vorgangsnummer}}
Dokument:     {{dokument_typ}} ({{dokument_datei}})
Frist:        {{frist_text}}

Bitte stoßen Sie die Verlängerung jetzt an. Den Antrag stellt die beschäftigte Person selbst bei der Ausländerbehörde; von der Terminvergabe bis zum neuen Titel vergehen regelmäßig Wochen bis Monate. Der neue Nachweis gehört anschließend mit seinem Ablaufdatum in den Vorgang — erst dann endet diese Erinnerung.

Vorgang im Portal: {{portalLink}}

Diese Erinnerung wiederholt sich in kürzer werdenden Abständen, je näher der Ablauf rückt (ab 90 Tagen monatlich, ab 42 Tagen alle zwei Wochen, ab 14 Tagen alle drei Tage). Sie endet, sobald ein Nachweis mit späterer Frist im Vorgang liegt.

CREDO Gruppe – Freie Evangelische Schulen
{{einrichtung}}`,
    variables: [
      { key: "{{mitarbeiter_name}}", description: "Vollständiger Name der beschäftigten Person; ohne bekannten Namen „die neue Mitarbeiterin / den neuen Mitarbeiter“ (Akkusativ, daher nur nach „für“ einsetzen)" },
      { key: "{{mitarbeiter_email}}", description: "E-Mail der beschäftigten Person (nur zur Anzeige, NICHT als Empfänger gedacht)" },
      { key: "{{einrichtung}}", description: "Name der Einrichtung" },
      { key: "{{vorgangsnummer}}", description: "Vorgangsnummer (displayId)" },
      { key: "{{dokument_typ}}", description: "Art des Nachweises (z.B. Aufenthaltstitel)" },
      { key: "{{dokument_datei}}", description: "Dateiname des hochgeladenen Nachweises" },
      { key: "{{gueltig_bis}}", description: "Ablaufdatum des Nachweises (TT.MM.JJJJ)" },
      { key: "{{tage_verbleibend}}", description: "Verbleibende Kalendertage bis zum Ablauf" },
      { key: "{{frist_text}}", description: "Fertiger Satz zur Frist (z.B. „Läuft in 42 Tagen ab (20.10.2026)“)" },
      { key: "{{dringlichkeit}}", description: "Ampel-Stufe (Beobachten/Warnung/Kritisch)" },
      { key: "{{portalLink}}", description: "Link zur Vorgangs-Detailseite im Portal" },
    ],
  },

  {
    event: "dokument-abgelaufen",
    name: "Befristeter Nachweis ist abgelaufen (HR-Warnung)",
    subject: "ABGELAUFEN: {{dokument_typ}} für {{mitarbeiter_name}} (seit {{tage_ueberfaellig}} Tagen)",
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
          <div style="display:inline-block;background-color:#f7c9c9;border-radius:6px;padding:8px 16px;margin-bottom:24px;">
            <span style="color:#7a0c12;font-weight:bold;font-size:14px;">Nachweis abgelaufen</span>
          </div>
          <h2 style="color:#1a1a2e;font-size:19px;margin:0 0 16px;">{{dokument_typ}} für {{mitarbeiter_name}} ist abgelaufen</h2>
          <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 20px;">
            der Nachweis <strong>{{dokument_typ}}</strong> für <strong>{{mitarbeiter_name}}</strong> galt bis zum <strong>{{gueltig_bis}}</strong> und ist seit <strong>{{tage_ueberfaellig}} Tagen</strong> abgelaufen. Ein gültiger Nachfolge-Nachweis liegt im Portal nicht vor.
          </p>

          <!-- Daten -->
          <table cellpadding="0" cellspacing="0" style="width:100%;background-color:#f9fafb;border-radius:8px;margin:0 0 22px;">
            <tr><td style="padding:16px 18px;">
              <p style="margin:0 0 10px;color:#6b7280;font-size:12px;">Nachweis für</p>
              <p style="margin:0 0 16px;color:#374151;font-size:14px;">{{mitarbeiter_name}} · {{mitarbeiter_email}}<br>{{einrichtung}} · Vorgang {{vorgangsnummer}}</p>
              <p style="margin:0 0 10px;color:#6b7280;font-size:12px;">Dokument</p>
              <p style="margin:0 0 16px;color:#374151;font-size:14px;">{{dokument_typ}}<br><span style="color:#6b7280;font-size:13px;">{{dokument_datei}}</span></p>
              <p style="margin:0 0 10px;color:#6b7280;font-size:12px;">Frist</p>
              <p style="margin:0;color:#374151;font-size:14px;">{{frist_text}}</p>
            </td></tr>
          </table>

          <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px;">
            Bitte klären Sie <strong>umgehend</strong>, ob eine Verlängerung beantragt wurde: Wurde der Antrag rechtzeitig gestellt, gilt der bisherige Titel mit einer <strong>Fiktionsbescheinigung</strong> fort (§ 81 Abs. 4 AufenthG) — dann laden Sie diese als Nachweis hoch und die Warnung endet. Liegt nichts vor, ist die Beschäftigung zu prüfen: Sie ist für den Arbeitgeber eine Ordnungswidrigkeit (§ 404 SGB III) und kann eine Straftat sein (§ 98 AufenthG).
          </p>
          <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 22px;">
            Das Portal sperrt nichts. Der Nachweis ist auf „Abgelaufen“ gesetzt und der Vorgang rot markiert — die Bewertung und die Entscheidung bleiben bei Ihnen.
          </p>

          <!-- Button -->
          <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
            <tr><td style="background-color:#575756;border-radius:8px;">
              <a href="{{portalLink}}" style="display:inline-block;padding:14px 30px;color:#ffffff;text-decoration:none;font-weight:bold;font-size:15px;">
                Vorgang im Portal öffnen →
              </a>
            </td></tr>
          </table>

          <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 18px;">
          <p style="color:#6b7280;font-size:13px;line-height:1.6;margin:0;">
            Diese Warnung wiederholt sich alle drei Tage und endet 180 Tage nach dem Ablauf. Die Markierung im Portal bleibt danach bestehen.
          </p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="background-color:#f9fafb;border-radius:0 0 8px 8px;padding:18px 32px;border-top:1px solid #e5e7eb;">
          <p style="margin:0 0 4px;color:#9ca3af;font-size:11px;text-align:center;line-height:1.5;">
            <strong style="color:#575756;">CREDO Gruppe</strong> – Freie Evangelische Schulen<br>lebensnah · wegweisend · christlich
          </p>
          <p style="margin:0;color:#bbbbbb;font-size:11px;text-align:center;">{{einrichtung}}</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`,
    bodyText: `ABGELAUFEN – {{dokument_typ}} für {{mitarbeiter_name}}

Der Nachweis {{dokument_typ}} für {{mitarbeiter_name}} galt bis zum {{gueltig_bis}} und ist seit {{tage_ueberfaellig}} Tagen abgelaufen. Ein gültiger Nachfolge-Nachweis liegt im Portal nicht vor.

Nachweis für: {{mitarbeiter_name}} · {{mitarbeiter_email}}
              {{einrichtung}} · Vorgang {{vorgangsnummer}}
Dokument:     {{dokument_typ}} ({{dokument_datei}})
Frist:        {{frist_text}}

Bitte klären Sie umgehend, ob eine Verlängerung beantragt wurde: Wurde der Antrag rechtzeitig gestellt, gilt der bisherige Titel mit einer Fiktionsbescheinigung fort (§ 81 Abs. 4 AufenthG) — dann laden Sie diese als Nachweis hoch und die Warnung endet. Liegt nichts vor, ist die Beschäftigung zu prüfen: Sie ist für den Arbeitgeber eine Ordnungswidrigkeit (§ 404 SGB III) und kann eine Straftat sein (§ 98 AufenthG).

Das Portal sperrt nichts. Der Nachweis ist auf "Abgelaufen" gesetzt und der Vorgang rot markiert — die Bewertung und die Entscheidung bleiben bei Ihnen.

Vorgang im Portal: {{portalLink}}

Diese Warnung wiederholt sich alle drei Tage und endet 180 Tage nach dem Ablauf. Die Markierung im Portal bleibt danach bestehen.

CREDO Gruppe – Freie Evangelische Schulen
{{einrichtung}}`,
    variables: [
      { key: "{{mitarbeiter_name}}", description: "Vollständiger Name der beschäftigten Person; ohne bekannten Namen „die neue Mitarbeiterin / den neuen Mitarbeiter“ (Akkusativ, daher nur nach „für“ einsetzen)" },
      { key: "{{mitarbeiter_email}}", description: "E-Mail der beschäftigten Person (nur zur Anzeige, NICHT als Empfänger gedacht)" },
      { key: "{{einrichtung}}", description: "Name der Einrichtung" },
      { key: "{{vorgangsnummer}}", description: "Vorgangsnummer (displayId)" },
      { key: "{{dokument_typ}}", description: "Art des Nachweises (z.B. Aufenthaltstitel)" },
      { key: "{{dokument_datei}}", description: "Dateiname des hochgeladenen Nachweises" },
      { key: "{{gueltig_bis}}", description: "Ablaufdatum des Nachweises (TT.MM.JJJJ)" },
      { key: "{{tage_ueberfaellig}}", description: "Kalendertage seit dem Ablauf" },
      { key: "{{frist_text}}", description: "Fertiger Satz zur Frist (z.B. „Abgelaufen seit 7 Tagen (01.09.2026)“)" },
      { key: "{{portalLink}}", description: "Link zur Vorgangs-Detailseite im Portal" },
    ],
  },
];

// =============================================
// CREDO-Verwaltung Corporate Design zentral anwenden
//
// Die Vorlagen oben sind im historischen Design (#1a1a2e) gehalten.
// Diese Transformation bringt JEDE Vorlage einheitlich in das CI der
// CREDO Verwaltung: grauer Markenkopf (#575756), CREDO-Linie (Grau +
// Gelb/Gruen/Rot/Blau) direkt unter dem Kopf, graue Buttons/Links statt Blau.
//
// Ein zentraler Ort => gilt automatisch auch fuer kuenftige Vorlagen.
// Idempotent: bereits im CI gehaltene Vorlagen bleiben unveraendert.
// =============================================
const CREDO_LINE_HTML =
  '<tr><td style="font-size:0;line-height:0;mso-line-height-rule:exactly;">' +
  '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>' +
  '<td width="50%" height="6" bgcolor="#dadada" style="background-color:#dadada;height:6px;line-height:6px;font-size:0;">&nbsp;</td>' +
  '<td width="12.5%" height="6" bgcolor="#FBC900" style="background-color:#FBC900;height:6px;line-height:6px;font-size:0;">&nbsp;</td>' +
  '<td width="12.5%" height="6" bgcolor="#6BAA24" style="background-color:#6BAA24;height:6px;line-height:6px;font-size:0;">&nbsp;</td>' +
  '<td width="12.5%" height="6" bgcolor="#E2001A" style="background-color:#E2001A;height:6px;line-height:6px;font-size:0;">&nbsp;</td>' +
  '<td width="12.5%" height="6" bgcolor="#009AC6" style="background-color:#009AC6;height:6px;line-height:6px;font-size:0;">&nbsp;</td>' +
  '</tr></table></td></tr>';

function applyCredoCi(html: string): string {
  return html
    // CREDO-Linie direkt nach dem dunklen Markenkopf einsetzen
    .replace(
      /(<tr><td style="background-color:#1a1a2e;border-radius:8px 8px 0 0;[^"]*">[\s\S]*?<\/td><\/tr>)/,
      `$1${CREDO_LINE_HTML}`
    )
    // Farbwelt auf Verwaltungs-CI umstellen
    .replaceAll("background-color:#1a1a2e", "background-color:#575756") // Markenkopf
    .replaceAll("color:#1a1a2e", "color:#2d2d2d") // Ueberschriften / Akzentschrift
    .replaceAll("background-color:#2563eb", "background-color:#575756") // Buttons
    .replaceAll("color:#2563eb", "color:#575756"); // Links
}

export const DEFAULT_EMAIL_TEMPLATES: EmailTemplateDefinition[] =
  BASE_EMAIL_TEMPLATES.map((t) => ({ ...t, bodyHtml: applyCredoCi(t.bodyHtml) }));
