#!/usr/bin/env python3
"""
Generiert drei n8n-Workflow-JSONs fuer das CREDO HR-Portal.

- Onboarding-Workflow (6 Webhook-Events)
- Offboarding-Workflow (11 Webhook-Events)
- Verbeamtung-Workflow (9 Webhook-Events)

Pro Event: Webhook -> Code (HTML rendern) -> Microsoft Outlook (Send Email).
Node-Namen entsprechen exakt den deutschen UI-Labels aus
src/app/(portal)/einstellungen/einstellungen-content.tsx.

HTML-Templates sind Outlook-kompatibel:
- Tabellenbasiertes Layout, KEINE Flex/Grid
- Inline-Styles
- 600px max-width Container
- VML-Fallback fuer CTA-Buttons (mso-button)
- Preheader (versteckter Vorschautext)
- Web-Fonts via Google Fonts mit Arial/Helvetica-Fallback
- KEINE Farbverlaeufe (CREDO CI)
- CREDO-Linie als 1px-Tabellen-Reihe
"""

import json
import os
import uuid
from pathlib import Path

# =============================================
# Konfiguration
# =============================================

OUT_DIR = Path(__file__).resolve().parent.parent / "n8n"

# Microsoft Outlook OAuth Credential (siehe project_offboarding.md memory)
OUTLOOK_CREDENTIAL_ID = "FCU8Wm3Is8PCPAHT"
OUTLOOK_CREDENTIAL_NAME = "n8n@fes-minden.de"

# Konstanten fuer alle Mails
HR_INTERNAL = "CREDO-Personal-intern@fes-credo.de"
REPLY_TO = "personalbuchhaltung@fes-minden.de"
APP_BASE_URL = "https://hr.fes-credo.de"
LOGO_URL = f"{APP_BASE_URL}/credo_logo.png"

# CREDO Farben
CL_PRIMARY = "#575756"
CL_GRUEN = "#6BAA24"
CL_GELB = "#FBC900"
CL_ROT = "#E2001A"
CL_BLAU = "#009AC6"
CL_GREY_LINE = "#DADADA"
CL_BG = "#F4F4F4"
CL_TEXT = "#333333"
CL_TEXT_MUTED = "#777777"

# =============================================
# Mail-Helper als JS-String (wird in jeden Code-Node injiziert)
# =============================================

JS_HELPER = r"""
// =============================================
// CREDO HR-Portal — E-Mail-Renderer
// CI-konform, Outlook-kompatibel (table-based, inline CSS, VML-CTA)
// =============================================
const COLORS = {
  primary: '#575756',
  gruen: '#6BAA24',
  gelb: '#FBC900',
  rot: '#E2001A',
  blau: '#009AC6',
  greyLine: '#DADADA',
  bg: '#F4F4F4',
  text: '#333333',
  textMuted: '#777777',
};

const APP_BASE_URL = 'https://hr.fes-credo.de';
const LOGO_URL = APP_BASE_URL + '/credo_logo.png';

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch (e) { return iso; }
}

function formatDateTime(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch (e) { return iso; }
}

// =============================================
// CTA-Button mit VML-Fallback fuer Outlook
// =============================================
function ctaButton(text, url, color) {
  const bg = color || COLORS.primary;
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin: 24px auto;">
      <tr>
        <td align="center" bgcolor="${bg}" style="border-radius: 6px;">
          <!--[if mso]>
          <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word"
            href="${escapeHtml(url)}" style="height:48px;v-text-anchor:middle;width:280px;" arcsize="13%" stroke="f" fillcolor="${bg}">
            <w:anchorlock/>
            <center style="color:#ffffff;font-family:Arial,sans-serif;font-size:15px;font-weight:bold;">
              ${escapeHtml(text)}
            </center>
          </v:roundrect>
          <![endif]-->
          <!--[if !mso]> <!-- -->
          <a href="${escapeHtml(url)}" target="_blank" style="display:inline-block;padding:14px 32px;font-family:'Montserrat',Arial,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:6px;background-color:${bg};line-height:20px;">
            ${escapeHtml(text)}
          </a>
          <!-- <![endif]-->
        </td>
      </tr>
    </table>
  `.trim();
}

// =============================================
// CREDO-Linie (Grau + 4 Farbsegmente)
// =============================================
function credoLinie() {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">
      <tr>
        <td bgcolor="${COLORS.greyLine}" width="50%" height="4" style="line-height:4px;font-size:0;">&nbsp;</td>
        <td bgcolor="${COLORS.gelb}"     width="12.5%" height="4" style="line-height:4px;font-size:0;">&nbsp;</td>
        <td bgcolor="${COLORS.gruen}"    width="12.5%" height="4" style="line-height:4px;font-size:0;">&nbsp;</td>
        <td bgcolor="${COLORS.rot}"      width="12.5%" height="4" style="line-height:4px;font-size:0;">&nbsp;</td>
        <td bgcolor="${COLORS.blau}"     width="12.5%" height="4" style="line-height:4px;font-size:0;">&nbsp;</td>
      </tr>
    </table>
  `.trim();
}

// =============================================
// Daten-Tabelle (Label/Wert)
// =============================================
function dataTable(rows) {
  if (!rows || rows.length === 0) return '';
  const trs = rows
    .filter(r => r && r.label && r.value !== undefined && r.value !== null && r.value !== '')
    .map(r => `
      <tr>
        <td style="padding:8px 0;font-family:'Montserrat',Arial,sans-serif;font-size:13px;color:${COLORS.textMuted};vertical-align:top;width:40%;">${escapeHtml(r.label)}</td>
        <td style="padding:8px 0;font-family:'Montserrat',Arial,sans-serif;font-size:14px;color:${COLORS.text};font-weight:600;vertical-align:top;">${escapeHtml(r.value)}</td>
      </tr>
    `).join('');
  if (!trs) return '';
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;border-top:1px solid #EEEEEE;border-bottom:1px solid #EEEEEE;margin:16px 0;">
      ${trs}
    </table>
  `.trim();
}

// =============================================
// Haupt-Render-Funktion
// =============================================
function renderCredoMail(opts) {
  const {
    preheader = '',
    badge = null,        // { text, color }
    headline = '',
    intro = '',
    rows = [],           // Array von { label, value }
    bodyHtml = '',       // freier HTML-Block (z.B. fuer Begruendungstext)
    cta = null,          // { text, url, color }
    footerNote = '',
  } = opts || {};

  const badgeHtml = badge ? `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px 0;">
      <tr>
        <td bgcolor="${badge.color || COLORS.blau}" style="padding:6px 14px;border-radius:14px;font-family:'Montserrat',Arial,sans-serif;font-size:11px;font-weight:bold;color:#ffffff;letter-spacing:0.5px;text-transform:uppercase;">
          ${escapeHtml(badge.text)}
        </td>
      </tr>
    </table>
  ` : '';

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" lang="de">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta http-equiv="X-UA-Compatible" content="IE=edge" />
<meta name="x-apple-disable-message-reformatting" />
<title>CREDO HR-Portal</title>
<!--[if mso]>
<noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
<![endif]-->
<style type="text/css">
  body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
  table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; border-collapse: collapse; }
  img { -ms-interpolation-mode: bicubic; border: 0; outline: none; text-decoration: none; }
  body { margin: 0 !important; padding: 0 !important; width: 100% !important; background-color: ${COLORS.bg}; }
  @media screen and (max-width:600px) {
    .container { width: 100% !important; }
    .px { padding-left: 24px !important; padding-right: 24px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background-color:${COLORS.bg};font-family:'Montserrat',Arial,Helvetica,sans-serif;color:${COLORS.text};">

<!-- Preheader (versteckt) -->
<div style="display:none;font-size:1px;color:${COLORS.bg};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">
  ${escapeHtml(preheader)}
</div>

<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${COLORS.bg}">
  <tr>
    <td align="center" style="padding:24px 0;">

      <!-- Container 600px -->
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" class="container" style="width:600px;max-width:600px;background-color:#ffffff;border-radius:8px;overflow:hidden;">

        <!-- Header / Logo -->
        <tr>
          <td align="left" class="px" style="padding:32px 40px 16px 40px;">
            <img src="${LOGO_URL}" width="140" height="auto" alt="CREDO HR-Portal" style="display:block;border:0;width:140px;max-width:140px;height:auto;" />
          </td>
        </tr>

        <!-- CREDO-Linie -->
        <tr>
          <td>${credoLinie()}</td>
        </tr>

        <!-- Body -->
        <tr>
          <td class="px" style="padding:32px 40px 16px 40px;">
            ${badgeHtml}
            <h1 style="margin:0 0 12px 0;font-family:'Montserrat',Arial,Helvetica,sans-serif;font-size:22px;line-height:28px;font-weight:700;color:${COLORS.primary};">
              ${escapeHtml(headline)}
            </h1>
            <p style="margin:0 0 16px 0;font-family:'Montserrat',Arial,Helvetica,sans-serif;font-size:14px;line-height:22px;color:${COLORS.text};">
              ${intro}
            </p>
            ${dataTable(rows)}
            ${bodyHtml}
            ${cta ? ctaButton(cta.text, cta.url, cta.color) : ''}
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td>${credoLinie()}</td>
        </tr>
        <tr>
          <td class="px" style="padding:24px 40px 32px 40px;font-family:'Montserrat',Arial,Helvetica,sans-serif;font-size:11px;line-height:18px;color:${COLORS.textMuted};">
            ${footerNote ? `<p style="margin:0 0 12px 0;">${footerNote}</p>` : ''}
            <p style="margin:0;">
              CREDO Schultraegergruppe &middot; HR-Portal &middot;
              <a href="${APP_BASE_URL}" style="color:${COLORS.primary};text-decoration:none;">${APP_BASE_URL.replace('https://', '')}</a>
            </p>
            <p style="margin:8px 0 0 0;">
              Diese Nachricht wurde automatisch versendet. Bei Rueckfragen antworten Sie bitte auf diese E-Mail.
            </p>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>

</body>
</html>`;
}
"""

# =============================================
# Event-Definitionen
# Jeder Eintrag enthaelt:
# - id            : Webhook-Pfad (= Event-Name aus UI)
# - label         : Display-Name in n8n (= UI-Label aus einstellungen-content.tsx)
# - subjectExpr   : JS-Expression fuer den Subject (Template-String)
# - templateName  : Name der Template-Funktion in build_event_code()
# - recipientExpr : JS-Expression fuer den Empfaenger
#                   (z.B. data.recipientEmail || HR_INTERNAL)
# =============================================

ONBOARDING_EVENTS = [
    {
        "id": "onboarding-created",
        "label": "Onboarding erstellt",
        "subject": "Willkommen bei CREDO – Bitte fuellen Sie Ihren Personalfragebogen aus",
        "recipient": "data.employeeEmail",
        "to_employee": True,
    },
    {
        "id": "questionnaire-completed",
        "label": "Fragebogen eingereicht",
        "subject": "Personalfragebogen eingegangen: {employeeName}",
        "recipient": "HR_INTERNAL",
        "to_employee": False,
    },
    {
        "id": "supervisor-link-created",
        "label": "Vorgesetzten-Link erstellt",
        "subject": "Onboarding {employeeName} – Modalitaeten ergaenzen",
        "recipient": "data.supervisorEmail",
        "to_employee": False,
    },
    {
        "id": "supervisor-completed",
        "label": "Modalitaeten eingereicht",
        "subject": "Modalitaeten eingegangen: {employeeName}",
        "recipient": "HR_INTERNAL",
        "to_employee": False,
    },
    {
        "id": "employee-reminder",
        "label": "Erinnerung Mitarbeiter",
        "subject": "Erinnerung: Personalfragebogen noch ausstehend",
        "recipient": "data.employeeEmail",
        "to_employee": True,
    },
    {
        "id": "supervisor-reminder",
        "label": "Erinnerung Vorgesetzter",
        "subject": "Erinnerung: Modalitaeten fuer {employeeName} ergaenzen",
        "recipient": "data.supervisorEmail",
        "to_employee": False,
    },
]

OFFBOARDING_EVENTS = [
    {
        "id": "offboarding-created",
        "label": "Offboarding erstellt",
        "subject": "Offboarding angelegt: {employeeName}",
        "recipient": "HR_INTERNAL",
    },
    {
        "id": "offboarding-department-assigned",
        "label": "Abteilung zugewiesen",
        "subject": "Offboarding {employeeName} – Aufgaben fuer Ihre Abteilung",
        "recipient": "data.departmentEmail",
    },
    {
        "id": "offboarding-task-completed",
        "label": "Aufgabe erledigt",
        "subject": "Offboarding-Aufgabe erledigt: {employeeName}",
        "recipient": "HR_INTERNAL",
    },
    {
        "id": "offboarding-department-completed",
        "label": "Abteilung fertig",
        "subject": "Abteilung fertig: {employeeName} ({departmentName})",
        "recipient": "HR_INTERNAL",
    },
    {
        "id": "offboarding-task-overdue",
        "label": "Aufgabe ueberfaellig",
        "subject": "Ueberfaellige Aufgabe: {employeeName} ({departmentName})",
        "recipient": "data.departmentEmail",
    },
    {
        "id": "offboarding-reminder",
        "label": "Reminder gesendet",
        "subject": "Erinnerung: Offboarding {employeeName}",
        "recipient": "data.departmentEmail",
    },
    {
        "id": "offboarding-completed",
        "label": "Offboarding abgeschlossen",
        "subject": "Offboarding abgeschlossen: {employeeName}",
        "recipient": "HR_INTERNAL",
    },
    {
        "id": "exit-interview-invited",
        "label": "Exit-Interview versendet",
        "subject": "Ihr persoenliches Exit-Interview",
        "recipient": "data.employeeEmail",
    },
    {
        "id": "exit-interview-submitted",
        "label": "Exit-Interview ausgefuellt",
        "subject": "Exit-Interview eingegangen: {employeeName}",
        "recipient": "HR_INTERNAL",
    },
    {
        "id": "zeugnis-bewertung-invited",
        "label": "Zeugnis-Bewertung versendet",
        "subject": "Zeugnis-Bewertung fuer {employeeName} angefragt",
        "recipient": "data.recipientEmail",
    },
    {
        "id": "zeugnis-bewertung-submitted",
        "label": "Zeugnis-Bewertung eingereicht",
        "subject": "Zeugnis-Bewertung eingegangen: {employeeName}",
        "recipient": "HR_INTERNAL",
    },
]

VERBEAMTUNG_EVENTS = [
    {
        "id": "psi-created",
        "label": "Verbeamtung angelegt",
        "subject": "Verbeamtung angelegt: {employeeName}",
        "recipient": "HR_INTERNAL",
    },
    {
        "id": "psi-assessment-requested",
        "label": "Beurteilung angefordert",
        "subject": "{assessmentNumber}. Beurteilung angefordert: {employeeName}",
        "recipient": "data.recipientEmail",
    },
    {
        "id": "psi-assessment-completed",
        "label": "Beurteilung eingegangen",
        "subject": "Beurteilung eingegangen: {employeeName} (Nr. {assessmentNumber})",
        "recipient": "HR_INTERNAL",
    },
    {
        "id": "psi-assessment-released",
        "label": "Beurteilung zur Bekanntgabe",
        "subject": "Ihre dienstliche Beurteilung – Bekanntgabe",
        "recipient": "data.employeeEmail",
    },
    {
        "id": "psi-assessment-acknowledged",
        "label": "Beurteilung quittiert",
        "subject": "Beurteilung quittiert: {employeeName} (Nr. {assessmentNumber})",
        "recipient": "HR_INTERNAL",
    },
    {
        "id": "psi-assessment-archived",
        "label": "Beurteilung in Personalakte",
        "subject": "Beurteilung in Personalakte: {employeeName} (Nr. {assessmentNumber})",
        "recipient": "HR_INTERNAL",
    },
    {
        "id": "psi-phase-completed",
        "label": "Phase abgeschlossen",
        "subject": "Phase abgeschlossen: {employeeName} – {phaseName}",
        "recipient": "HR_INTERNAL",
    },
    {
        "id": "psi-deadline-warning",
        "label": "Frist-Warnung",
        "subject": "Frist-Warnung Verbeamtung: {employeeName}",
        "recipient": "HR_INTERNAL",
    },
    {
        "id": "psi-completed",
        "label": "Verbeamtung abgeschlossen",
        "subject": "Verbeamtung abgeschlossen: {employeeName}",
        "recipient": "HR_INTERNAL",
    },
]

# =============================================
# Pro Event: JS-Code fuer den Code-Node
# =============================================

def js_for_event(event):
    """Generiert den JS-Code, der recipient/subject/html aus dem Webhook-Payload baut."""
    eid = event["id"]

    # Recipient-Logic
    if event["recipient"] == "HR_INTERNAL":
        recipient_js = f"const recipient = '{HR_INTERNAL}';"
    else:
        recipient_js = (
            f"const recipient = {event['recipient']} || '{HR_INTERNAL}';"
        )

    # Pro Event ein eigenes Mail-Template
    template_js = MAIL_TEMPLATES[eid]

    return JS_HELPER + f"""

// =============================================
// Event: {eid}
// =============================================
const data = $input.first().json || {{}};

{recipient_js}

{template_js}

return [{{ json: {{ to: recipient, subject, html }} }}];
"""

# =============================================
# Mail-Templates pro Event (alle 25)
# Jedes Template setzt `subject` und `html` Variablen.
# Greift auf `data` (= Webhook-Payload) zu.
# =============================================

MAIL_TEMPLATES = {

# ----------- ONBOARDING -----------

"onboarding-created": r"""
const subject = 'Willkommen bei CREDO – Bitte fuellen Sie Ihren Personalfragebogen aus';
const html = renderCredoMail({
  preheader: 'Willkommen im Team! Wir freuen uns auf Sie.',
  badge: { text: 'Willkommen', color: COLORS.gruen },
  headline: 'Herzlich willkommen bei der CREDO Schultraegergruppe',
  intro: `Liebe/r ${escapeHtml(data.firstName || 'neue/r Mitarbeiter/in')},<br/><br/>` +
         `wir freuen uns, dass Sie ab dem <strong>${formatDate(data.startDate)}</strong> Teil unseres Teams werden. ` +
         `Damit alles reibungslos starten kann, bitten wir Sie, den Personalfragebogen auszufuellen. Es dauert nur wenige Minuten.`,
  rows: [
    { label: 'Mandant', value: data.organizationName },
    { label: 'Position', value: data.position },
    { label: 'Startdatum', value: formatDate(data.startDate) },
  ],
  cta: { text: 'Personalfragebogen ausfuellen', url: data.magicLink || APP_BASE_URL, color: COLORS.primary },
  footerNote: 'Der Link ist 14 Tage gueltig. Ihre Daten werden DSGVO-konform verarbeitet.',
});
""",

"questionnaire-completed": r"""
const subject = `Personalfragebogen eingegangen: ${data.employeeName || ''}`;
const html = renderCredoMail({
  preheader: 'Personalfragebogen wurde eingereicht.',
  badge: { text: 'Eingegangen', color: COLORS.gruen },
  headline: 'Personalfragebogen eingereicht',
  intro: `Der Personalfragebogen von <strong>${escapeHtml(data.employeeName || '—')}</strong> ist eingegangen ` +
         `und kann jetzt im HR-Portal geprueft werden.`,
  rows: [
    { label: 'Mandant', value: data.organizationName },
    { label: 'Eingereicht am', value: formatDateTime(data.submittedAt) },
    { label: 'Vorgangs-ID', value: data.displayId },
  ],
  cta: { text: 'Im HR-Portal oeffnen', url: `${APP_BASE_URL}/dashboard/${data.onboardingId || ''}`, color: COLORS.blau },
});
""",

"supervisor-link-created": r"""
const subject = `Onboarding ${data.employeeName || ''} – Modalitaeten ergaenzen`;
const html = renderCredoMail({
  preheader: 'Bitte ergaenzen Sie die Onboarding-Modalitaeten.',
  badge: { text: 'Aktion benoetigt', color: COLORS.blau },
  headline: 'Modalitaeten fuer Ihren neuen Mitarbeiter',
  intro: `Sehr geehrte/r ${escapeHtml(data.supervisorName || 'Vorgesetzte/r')},<br/><br/>` +
         `fuer <strong>${escapeHtml(data.employeeName || '—')}</strong> wurde ein Onboarding angelegt. ` +
         `Bitte ergaenzen Sie ueber den unten stehenden Link die organisatorischen Modalitaeten ` +
         `(Arbeitsplatz, Hardware, Schluessel, etc.).`,
  rows: [
    { label: 'Mitarbeiter', value: data.employeeName },
    { label: 'Position', value: data.position },
    { label: 'Startdatum', value: formatDate(data.startDate) },
    { label: 'Mandant', value: data.organizationName },
  ],
  cta: { text: 'Modalitaeten ergaenzen', url: data.supervisorLink || APP_BASE_URL, color: COLORS.primary },
  footerNote: 'Der Link ist personalisiert – bitte nicht weiterleiten.',
});
""",

"supervisor-completed": r"""
const subject = `Modalitaeten eingegangen: ${data.employeeName || ''}`;
const html = renderCredoMail({
  preheader: 'Vorgesetzten-Modalitaeten eingereicht.',
  badge: { text: 'Eingegangen', color: COLORS.gruen },
  headline: 'Modalitaeten ergaenzt',
  intro: `Die Modalitaeten fuer <strong>${escapeHtml(data.employeeName || '—')}</strong> wurden vom Vorgesetzten ergaenzt.`,
  rows: [
    { label: 'Vorgesetzte/r', value: data.supervisorName },
    { label: 'Mandant', value: data.organizationName },
    { label: 'Eingereicht am', value: formatDateTime(data.submittedAt) },
  ],
  cta: { text: 'Im HR-Portal oeffnen', url: `${APP_BASE_URL}/dashboard/${data.onboardingId || ''}`, color: COLORS.blau },
});
""",

"employee-reminder": r"""
const subject = 'Erinnerung: Personalfragebogen noch ausstehend';
const html = renderCredoMail({
  preheader: 'Bitte fuellen Sie Ihren Personalfragebogen aus.',
  badge: { text: 'Erinnerung', color: COLORS.gelb },
  headline: 'Wir warten noch auf Ihren Personalfragebogen',
  intro: `Liebe/r ${escapeHtml(data.firstName || '')},<br/><br/>` +
         `Ihr Start bei der CREDO Schultraegergruppe rueckt naeher. Damit wir alles vorbereiten koennen, ` +
         `bitten wir Sie, den Personalfragebogen <strong>so bald wie moeglich</strong> auszufuellen.`,
  rows: [
    { label: 'Startdatum', value: formatDate(data.startDate) },
    { label: 'Mandant', value: data.organizationName },
  ],
  cta: { text: 'Jetzt ausfuellen', url: data.magicLink || APP_BASE_URL, color: COLORS.gelb },
  footerNote: 'Bei Fragen wenden Sie sich gerne an unsere Personalabteilung.',
});
""",

"supervisor-reminder": r"""
const subject = `Erinnerung: Modalitaeten fuer ${data.employeeName || ''} ergaenzen`;
const html = renderCredoMail({
  preheader: 'Bitte ergaenzen Sie die Modalitaeten.',
  badge: { text: 'Erinnerung', color: COLORS.gelb },
  headline: 'Modalitaeten fehlen noch',
  intro: `Sehr geehrte/r ${escapeHtml(data.supervisorName || 'Vorgesetzte/r')},<br/><br/>` +
         `die Modalitaeten fuer <strong>${escapeHtml(data.employeeName || '—')}</strong> wurden noch nicht ergaenzt. ` +
         `Bitte holen Sie das so bald wie moeglich nach – der Mitarbeiter startet am ${formatDate(data.startDate)}.`,
  rows: [
    { label: 'Mitarbeiter', value: data.employeeName },
    { label: 'Startdatum', value: formatDate(data.startDate) },
  ],
  cta: { text: 'Modalitaeten ergaenzen', url: data.supervisorLink || APP_BASE_URL, color: COLORS.gelb },
});
""",

# ----------- OFFBOARDING -----------

"offboarding-created": r"""
const subject = `Offboarding angelegt: ${data.employeeName || ''}`;
const html = renderCredoMail({
  preheader: 'Neuer Offboarding-Vorgang.',
  badge: { text: 'Neu', color: COLORS.blau },
  headline: 'Offboarding angelegt',
  intro: `Fuer <strong>${escapeHtml(data.employeeName || '—')}</strong> wurde ein Offboarding-Vorgang angelegt.`,
  rows: [
    { label: 'Mandant', value: data.organizationName },
    { label: 'Letzter Arbeitstag', value: formatDate(data.lastWorkingDay) },
    { label: 'Vorgangs-ID', value: data.displayId },
  ],
  cta: { text: 'Im HR-Portal oeffnen', url: `${APP_BASE_URL}/dashboard/offboarding/${data.offboardingId || ''}`, color: COLORS.blau },
});
""",

"offboarding-department-assigned": r"""
const subject = `Offboarding ${data.employeeName || ''} – Aufgaben fuer ${data.departmentName || 'Ihre Abteilung'}`;
const html = renderCredoMail({
  preheader: 'Aufgaben fuer Ihre Abteilung beim Offboarding.',
  badge: { text: 'Aktion benoetigt', color: COLORS.blau },
  headline: `Offboarding-Aufgaben fuer ${escapeHtml(data.departmentName || 'Ihre Abteilung')}`,
  intro: `Sehr geehrte Damen und Herren,<br/><br/>` +
         `bitte erledigen Sie die folgenden Offboarding-Aufgaben fuer ` +
         `<strong>${escapeHtml(data.employeeName || '—')}</strong> bis spaetestens ` +
         `<strong>${formatDate(data.dueDate || data.lastWorkingDay)}</strong>.`,
  rows: [
    { label: 'Mitarbeiter', value: data.employeeName },
    { label: 'Letzter Arbeitstag', value: formatDate(data.lastWorkingDay) },
    { label: 'Anzahl Aufgaben', value: data.taskCount },
  ],
  cta: { text: 'Aufgaben oeffnen', url: data.taskLink || APP_BASE_URL, color: COLORS.primary },
  footerNote: 'Der Link ist personalisiert – bitte nicht weiterleiten.',
});
""",

"offboarding-task-completed": r"""
const subject = `Offboarding-Aufgabe erledigt: ${data.employeeName || ''}`;
const html = renderCredoMail({
  preheader: 'Eine Offboarding-Aufgabe wurde abgeschlossen.',
  badge: { text: 'Erledigt', color: COLORS.gruen },
  headline: 'Aufgabe abgeschlossen',
  intro: `Eine Offboarding-Aufgabe fuer <strong>${escapeHtml(data.employeeName || '—')}</strong> wurde von ` +
         `<strong>${escapeHtml(data.departmentName || 'einer Abteilung')}</strong> als erledigt markiert.`,
  rows: [
    { label: 'Aufgabe', value: data.taskTitle },
    { label: 'Abteilung', value: data.departmentName },
    { label: 'Abgeschlossen am', value: formatDateTime(data.completedAt) },
  ],
  cta: { text: 'Im HR-Portal oeffnen', url: `${APP_BASE_URL}/dashboard/offboarding/${data.offboardingId || ''}`, color: COLORS.blau },
});
""",

"offboarding-department-completed": r"""
const subject = `Abteilung fertig: ${data.employeeName || ''} (${data.departmentName || ''})`;
const html = renderCredoMail({
  preheader: 'Eine Abteilung hat alle Aufgaben erledigt.',
  badge: { text: 'Komplett', color: COLORS.gruen },
  headline: 'Abteilung komplett abgeschlossen',
  intro: `<strong>${escapeHtml(data.departmentName || '—')}</strong> hat alle Offboarding-Aufgaben fuer ` +
         `<strong>${escapeHtml(data.employeeName || '—')}</strong> abgeschlossen.`,
  rows: [
    { label: 'Mitarbeiter', value: data.employeeName },
    { label: 'Abteilung', value: data.departmentName },
    { label: 'Abgeschlossen am', value: formatDateTime(data.completedAt) },
  ],
  cta: { text: 'Im HR-Portal oeffnen', url: `${APP_BASE_URL}/dashboard/offboarding/${data.offboardingId || ''}`, color: COLORS.blau },
});
""",

"offboarding-task-overdue": r"""
const subject = `Ueberfaellige Aufgabe: ${data.employeeName || ''} (${data.departmentName || ''})`;
const html = renderCredoMail({
  preheader: 'Eine Offboarding-Aufgabe ist ueberfaellig.',
  badge: { text: 'Ueberfaellig', color: COLORS.rot },
  headline: 'Offboarding-Aufgabe ueberfaellig',
  intro: `Eine Offboarding-Aufgabe fuer <strong>${escapeHtml(data.employeeName || '—')}</strong> ist ueberfaellig. ` +
         `Bitte erledigen Sie diese so bald wie moeglich.`,
  rows: [
    { label: 'Aufgabe', value: data.taskTitle },
    { label: 'Abteilung', value: data.departmentName },
    { label: 'Faellig seit', value: formatDate(data.dueDate) },
  ],
  cta: { text: 'Aufgabe oeffnen', url: data.taskLink || APP_BASE_URL, color: COLORS.rot },
});
""",

"offboarding-reminder": r"""
const subject = `Erinnerung: Offboarding ${data.employeeName || ''}`;
const html = renderCredoMail({
  preheader: 'Erinnerung an offene Offboarding-Aufgaben.',
  badge: { text: 'Erinnerung', color: COLORS.gelb },
  headline: 'Offene Offboarding-Aufgaben',
  intro: `Sehr geehrte Damen und Herren,<br/><br/>` +
         `wir moechten Sie an die noch offenen Offboarding-Aufgaben fuer ` +
         `<strong>${escapeHtml(data.employeeName || '—')}</strong> erinnern.`,
  rows: [
    { label: 'Offene Aufgaben', value: data.openTaskCount },
    { label: 'Letzter Arbeitstag', value: formatDate(data.lastWorkingDay) },
    { label: 'Abteilung', value: data.departmentName },
  ],
  cta: { text: 'Aufgaben oeffnen', url: data.taskLink || APP_BASE_URL, color: COLORS.gelb },
});
""",

"offboarding-completed": r"""
const subject = `Offboarding abgeschlossen: ${data.employeeName || ''}`;
const html = renderCredoMail({
  preheader: 'Offboarding-Vorgang vollstaendig abgeschlossen.',
  badge: { text: 'Abgeschlossen', color: COLORS.gruen },
  headline: 'Offboarding abgeschlossen',
  intro: `Der Offboarding-Vorgang fuer <strong>${escapeHtml(data.employeeName || '—')}</strong> ist vollstaendig abgeschlossen. ` +
         `Alle Abteilungen haben ihre Aufgaben erledigt.`,
  rows: [
    { label: 'Mandant', value: data.organizationName },
    { label: 'Letzter Arbeitstag', value: formatDate(data.lastWorkingDay) },
    { label: 'Abgeschlossen am', value: formatDateTime(data.completedAt) },
    { label: 'Vorgangs-ID', value: data.displayId },
  ],
  cta: { text: 'Im HR-Portal oeffnen', url: `${APP_BASE_URL}/dashboard/offboarding/${data.offboardingId || ''}`, color: COLORS.blau },
});
""",

"exit-interview-invited": r"""
const subject = 'Ihr persoenliches Exit-Interview';
const html = renderCredoMail({
  preheader: 'Wir wuerden uns ueber Ihr Feedback freuen.',
  badge: { text: 'Einladung', color: COLORS.blau },
  headline: 'Ihr Feedback ist uns wichtig',
  intro: `Liebe/r ${escapeHtml(data.firstName || '')},<br/><br/>` +
         `wir bedauern Ihren Weggang von der CREDO Schultraegergruppe und wuenschen Ihnen alles Gute auf Ihrem weiteren Weg. ` +
         `Damit wir uns als Arbeitgeber stetig verbessern koennen, wuerden wir uns ueber Ihre Rueckmeldung in Form eines kurzen ` +
         `Exit-Interviews freuen. Es dauert ca. 10 Minuten und ist <strong>vollstaendig anonym</strong>.`,
  cta: { text: 'Exit-Interview starten', url: data.interviewLink || APP_BASE_URL, color: COLORS.primary },
  footerNote: 'Ihre Antworten werden anonymisiert und nur fuer interne Verbesserungen verwendet.',
});
""",

"exit-interview-submitted": r"""
const subject = `Exit-Interview eingegangen: ${data.employeeName || ''}`;
const html = renderCredoMail({
  preheader: 'Ein Exit-Interview wurde eingereicht.',
  badge: { text: 'Eingegangen', color: COLORS.gruen },
  headline: 'Exit-Interview eingegangen',
  intro: `Ein anonymes Exit-Interview im Rahmen des Offboardings von ` +
         `<strong>${escapeHtml(data.employeeName || '—')}</strong> ist eingegangen.`,
  rows: [
    { label: 'Mandant', value: data.organizationName },
    { label: 'Eingereicht am', value: formatDateTime(data.submittedAt) },
  ],
  cta: { text: 'Im HR-Portal anzeigen', url: `${APP_BASE_URL}/dashboard/offboarding/${data.offboardingId || ''}`, color: COLORS.blau },
});
""",

"zeugnis-bewertung-invited": r"""
const subject = `Zeugnis-Bewertung fuer ${data.employeeName || ''} angefragt`;
const html = renderCredoMail({
  preheader: 'Bitte bewerten Sie den Mitarbeiter fuer das Arbeitszeugnis.',
  badge: { text: 'Aktion benoetigt', color: COLORS.blau },
  headline: 'Zeugnis-Bewertung angefragt',
  intro: `Sehr geehrte/r ${escapeHtml(data.recipientName || 'Vorgesetzte/r')},<br/><br/>` +
         `fuer das Arbeitszeugnis von <strong>${escapeHtml(data.employeeName || '—')}</strong> bitten wir Sie um Ihre Bewertung. ` +
         `Bitte fuellen Sie den Bewertungsbogen ueber den unten stehenden Link aus.`,
  rows: [
    { label: 'Mitarbeiter', value: data.employeeName },
    { label: 'Letzter Arbeitstag', value: formatDate(data.lastWorkingDay) },
  ],
  cta: { text: 'Bewertungsbogen oeffnen', url: data.bewertungLink || APP_BASE_URL, color: COLORS.primary },
  footerNote: 'Der Link ist personalisiert – bitte nicht weiterleiten.',
});
""",

"zeugnis-bewertung-submitted": r"""
const subject = `Zeugnis-Bewertung eingegangen: ${data.employeeName || ''}`;
const html = renderCredoMail({
  preheader: 'Eine Zeugnis-Bewertung wurde eingereicht.',
  badge: { text: 'Eingegangen', color: COLORS.gruen },
  headline: 'Zeugnis-Bewertung eingegangen',
  intro: `Die Zeugnis-Bewertung fuer <strong>${escapeHtml(data.employeeName || '—')}</strong> ist eingegangen ` +
         `und kann jetzt im HR-Portal geprueft werden.`,
  rows: [
    { label: 'Mitarbeiter', value: data.employeeName },
    { label: 'Bewertet von', value: data.recipientName },
    { label: 'Eingereicht am', value: formatDateTime(data.submittedAt) },
  ],
  cta: { text: 'Im HR-Portal oeffnen', url: `${APP_BASE_URL}/dashboard/offboarding/${data.offboardingId || ''}`, color: COLORS.blau },
});
""",

# ----------- VERBEAMTUNG -----------

"psi-created": r"""
const subject = `Verbeamtung angelegt: ${data.employeeName || ''}`;
const html = renderCredoMail({
  preheader: 'Neuer Verbeamtungs-Vorgang.',
  badge: { text: 'Neu', color: COLORS.blau },
  headline: 'Verbeamtungs-Vorgang angelegt',
  intro: `Fuer <strong>${escapeHtml(data.employeeName || '—')}</strong> wurde ein Verbeamtungs-Vorgang (PSI) angelegt.`,
  rows: [
    { label: 'Mandant', value: data.organizationName },
    { label: 'Vorgangs-ID', value: data.displayId },
    { label: 'Geplanter Beginn', value: formatDate(data.targetStartDate) },
  ],
  cta: { text: 'Im HR-Portal oeffnen', url: `${APP_BASE_URL}/dashboard/civil-service/${data.civilServiceId || ''}`, color: COLORS.blau },
});
""",

"psi-assessment-requested": r"""
const subject = `${data.assessmentNumber || ''}. Beurteilung angefordert: ${data.employeeName || ''}`;
const html = renderCredoMail({
  preheader: `${data.assessmentNumber || ''}. Unterrichtsbesuch / Beurteilung angefordert.`,
  badge: { text: 'Aktion benoetigt', color: COLORS.blau },
  headline: `${data.assessmentNumber || ''}. Dienstliche Beurteilung angefordert`,
  intro: `Sehr geehrte/r ${escapeHtml(data.recipientName || 'Schulleitung')},<br/><br/>` +
         `fuer die Verbeamtung von <strong>${escapeHtml(data.employeeName || '—')}</strong> ` +
         `bitten wir Sie um die <strong>${escapeHtml(String(data.assessmentNumber || ''))}. dienstliche Beurteilung</strong>. ` +
         `Bitte beachten Sie die Vorgaben der BRL und fuehren Sie das Beurteilungsgespraech rechtzeitig.`,
  rows: [
    { label: 'Mitarbeiter', value: data.employeeName },
    { label: 'Schule / Mandant', value: data.organization },
    { label: 'Vorgangs-ID', value: data.displayId },
    { label: 'Termin Unterrichtsbesuch', value: formatDateTime(data.scheduledDate) },
    { label: 'Fach', value: data.fach },
    { label: 'Klasse', value: data.klasse },
    { label: 'Link gueltig bis', value: formatDate(data.tokenExpiresAt) },
  ],
  cta: { text: 'Beurteilung ausfuellen', url: data.magicLink || APP_BASE_URL, color: COLORS.primary },
  footerNote: 'Der Link ist personalisiert – bitte nicht weiterleiten. Rechtsgrundlage: BRL Nr. 8.3 (14-Tage-Frist fuer Ankuendigung).',
});
""",

"psi-assessment-completed": r"""
const subject = `Beurteilung eingegangen: ${data.employeeName || ''} (Nr. ${data.assessmentNumber || ''})`;
const html = renderCredoMail({
  preheader: 'Eine Beurteilung wurde von der Schulleitung eingereicht.',
  badge: { text: 'Eingegangen', color: COLORS.gruen },
  headline: 'Beurteilung eingegangen',
  intro: `Die <strong>${escapeHtml(String(data.assessmentNumber || ''))}. dienstliche Beurteilung</strong> fuer ` +
         `<strong>${escapeHtml(data.employeeName || '—')}</strong> ist eingegangen.`,
  rows: [
    { label: 'Mitarbeiter', value: data.employeeName },
    { label: 'Mandant', value: data.organization },
    { label: 'Erfuellt Anforderungen', value: data.meetsRequirementsManual === true ? 'Ja' : (data.meetsRequirementsManual === false ? 'Nein' : '—') },
    { label: 'Eingereicht am', value: formatDateTime(data.submittedAt) },
  ],
  cta: { text: 'Im HR-Portal oeffnen', url: `${APP_BASE_URL}/dashboard/civil-service/${data.civilServiceId || ''}`, color: COLORS.blau },
});
""",

"psi-assessment-released": r"""
const subject = 'Ihre dienstliche Beurteilung – Bekanntgabe';
const html = renderCredoMail({
  preheader: 'Bitte nehmen Sie Ihre Beurteilung zur Kenntnis.',
  badge: { text: 'Bekanntgabe', color: COLORS.blau },
  headline: 'Ihre dienstliche Beurteilung liegt vor',
  intro: `Liebe/r Lehrkraft,<br/><br/>` +
         `eine dienstliche Beurteilung im Rahmen Ihres Verbeamtungsverfahrens liegt zur Bekanntgabe vor. ` +
         `Sie haben das Recht auf Einsicht und koennen optional eine Gegenaeusserung abgeben (§ 92 Abs. 1 S. 6 LBG NRW).`,
  rows: [
    { label: 'Mandant', value: data.organization },
    { label: 'Beurteilung', value: data.assessmentNumber ? `${data.assessmentNumber}. Unterrichtsbesuch` : '—' },
    { label: 'Link gueltig bis', value: formatDate(data.tokenExpiresAt) },
  ],
  cta: { text: 'Beurteilung einsehen', url: data.ackLink || APP_BASE_URL, color: COLORS.primary },
  footerNote: 'Rechtsgrundlage: § 92 Abs. 1 LBG NRW. Der Link ist personalisiert – bitte nicht weiterleiten.',
});
""",

"psi-assessment-acknowledged": r"""
const subject = `Beurteilung quittiert: ${data.employeeName || ''} (Nr. ${data.assessmentNumber || ''})`;
const html = renderCredoMail({
  preheader: 'Lehrkraft hat die Beurteilung zur Kenntnis genommen.',
  badge: { text: data.hasRebuttal ? 'Mit Gegenaeusserung' : 'Quittiert', color: data.hasRebuttal ? COLORS.gelb : COLORS.gruen },
  headline: 'Beurteilung quittiert',
  intro: `Die <strong>${escapeHtml(String(data.assessmentNumber || ''))}. dienstliche Beurteilung</strong> fuer ` +
         `<strong>${escapeHtml(data.employeeName || '—')}</strong> wurde von der Lehrkraft zur Kenntnis genommen` +
         (data.hasRebuttal ? ` <strong style="color:${COLORS.gelb};">mit Gegenaeusserung</strong>.` : '.'),
  rows: [
    { label: 'Mitarbeiter', value: data.employeeName },
    { label: 'Mandant', value: data.organization },
    { label: 'Quittiert am', value: formatDateTime(data.acknowledgedAt) },
    { label: 'Gegenaeusserung', value: data.hasRebuttal ? 'Ja' : 'Nein' },
  ],
  cta: { text: 'Im HR-Portal oeffnen', url: `${APP_BASE_URL}/dashboard/civil-service/${data.civilServiceId || ''}`, color: COLORS.blau },
});
""",

"psi-assessment-archived": r"""
const subject = `Beurteilung in Personalakte: ${data.employeeName || ''} (Nr. ${data.assessmentNumber || ''})`;
const html = renderCredoMail({
  preheader: 'Beurteilung wurde in die Personalakte aufgenommen.',
  badge: { text: 'In Personalakte', color: COLORS.gruen },
  headline: 'Beurteilung in Personalakte aufgenommen',
  intro: `Die <strong>${escapeHtml(String(data.assessmentNumber || ''))}. dienstliche Beurteilung</strong> fuer ` +
         `<strong>${escapeHtml(data.employeeName || '—')}</strong> wurde formal in die Personalakte aufgenommen ` +
         `(BRL Nr. 14, § 92 LBG NRW).`,
  rows: [
    { label: 'Mitarbeiter', value: data.employeeName },
    { label: 'Mandant', value: data.organization },
    { label: 'Archiviert am', value: formatDateTime(data.archivedAt) },
    { label: 'Hatte Gegenaeusserung', value: data.hadRebuttal ? 'Ja' : 'Nein' },
  ],
  cta: { text: 'Im HR-Portal oeffnen', url: `${APP_BASE_URL}/dashboard/civil-service/${data.civilServiceId || ''}`, color: COLORS.blau },
  footerNote: 'Der Workflow-Schritt "In Personalakte aufgenommen" ist abgeschlossen (Schritt 9).',
});
""",

"psi-phase-completed": r"""
const subject = `Phase abgeschlossen: ${data.employeeName || ''} – ${data.phaseName || ''}`;
const html = renderCredoMail({
  preheader: 'Eine Verbeamtungs-Phase wurde abgeschlossen.',
  badge: { text: 'Phase fertig', color: COLORS.gruen },
  headline: `Phase abgeschlossen: ${escapeHtml(data.phaseName || '—')}`,
  intro: `Im Verbeamtungs-Vorgang von <strong>${escapeHtml(data.employeeName || '—')}</strong> wurde ` +
         `die Phase <strong>${escapeHtml(data.phaseName || '—')}</strong> vollstaendig abgeschlossen.`,
  rows: [
    { label: 'Mitarbeiter', value: data.employeeName },
    { label: 'Phase', value: data.phaseName },
    { label: 'Vorgangs-ID', value: data.displayId },
    { label: 'Abgeschlossen am', value: formatDateTime(data.completedAt) },
  ],
  cta: { text: 'Im HR-Portal oeffnen', url: `${APP_BASE_URL}/dashboard/civil-service/${data.civilServiceId || ''}`, color: COLORS.blau },
});
""",

"psi-deadline-warning": r"""
const subject = `Frist-Warnung Verbeamtung: ${data.employeeName || ''}`;
const html = renderCredoMail({
  preheader: 'Frist-Warnung im Verbeamtungs-Vorgang.',
  badge: { text: 'Frist-Warnung', color: COLORS.rot },
  headline: 'Frist-Warnung Verbeamtung',
  intro: `Im Verbeamtungs-Vorgang von <strong>${escapeHtml(data.employeeName || '—')}</strong> ist eine wichtige Frist gefaehrdet. ` +
         `Bitte pruefen Sie die folgenden Hinweise.`,
  rows: [
    { label: 'Mitarbeiter', value: data.employeeName },
    { label: 'Vorgangs-ID', value: data.displayId },
    { label: 'Phase', value: data.phaseName },
    { label: 'Faellig bis', value: formatDate(data.deadline) },
    { label: 'Hinweis', value: data.warningType },
  ],
  cta: { text: 'Im HR-Portal oeffnen', url: `${APP_BASE_URL}/dashboard/civil-service/${data.civilServiceId || ''}`, color: COLORS.rot },
});
""",

"psi-completed": r"""
const subject = `Verbeamtung abgeschlossen: ${data.employeeName || ''}`;
const html = renderCredoMail({
  preheader: 'Verbeamtungs-Vorgang vollstaendig abgeschlossen.',
  badge: { text: 'Abgeschlossen', color: COLORS.gruen },
  headline: 'Verbeamtung abgeschlossen',
  intro: `Der Verbeamtungs-Vorgang fuer <strong>${escapeHtml(data.employeeName || '—')}</strong> ist vollstaendig abgeschlossen. ` +
         `Alle Phasen wurden erfolgreich durchlaufen.`,
  rows: [
    { label: 'Mandant', value: data.organizationName || data.organization },
    { label: 'Vorgangs-ID', value: data.displayId },
    { label: 'Probezeit-Ende', value: formatDate(data.probationEndDate) },
    { label: 'Abgeschlossen am', value: formatDateTime(data.completedAt) },
  ],
  cta: { text: 'Im HR-Portal oeffnen', url: `${APP_BASE_URL}/dashboard/civil-service/${data.civilServiceId || ''}`, color: COLORS.blau },
});
""",

}

# =============================================
# n8n Workflow-Builder
# =============================================

def make_node(node_type, name, parameters, position, type_version=1, credentials=None):
    node = {
        "parameters": parameters,
        "id": str(uuid.uuid4()),
        "name": name,
        "type": node_type,
        "typeVersion": type_version,
        "position": position,
    }
    if credentials:
        node["credentials"] = credentials
    return node

def make_workflow(workflow_name, events):
    """Baut einen kompletten Workflow mit pro Event: Webhook -> Code -> Outlook."""
    nodes = []
    connections = {}

    Y_STEP = 280
    X_WEBHOOK = 240
    X_CODE = 540
    X_EMAIL = 880

    for idx, event in enumerate(events):
        y = 240 + idx * Y_STEP

        # Webhook-Node
        webhook_name = event["label"]
        webhook = make_node(
            "n8n-nodes-base.webhook",
            webhook_name,
            {
                "httpMethod": "POST",
                "path": event["id"],
                "responseMode": "onReceived",
                "responseCode": 200,
                "responseData": "noData",
                "options": {},
            },
            [X_WEBHOOK, y],
            type_version=2,
        )
        nodes.append(webhook)

        # Code-Node
        code_name = f"E-Mail rendern: {event['label']}"
        code = make_node(
            "n8n-nodes-base.code",
            code_name,
            {
                "language": "javaScript",
                "jsCode": js_for_event(event),
            },
            [X_CODE, y],
            type_version=2,
        )
        nodes.append(code)

        # Outlook Send-Email Node
        email_name = f"Outlook senden: {event['label']}"
        email = make_node(
            "n8n-nodes-base.microsoftOutlook",
            email_name,
            {
                "resource": "message",
                "operation": "send",
                "subject": "={{ $json.subject }}",
                "bodyContent": "={{ $json.html }}",
                "bodyContentType": "html",
                "toRecipients": "={{ $json.to }}",
                "additionalFields": {
                    "replyTo": REPLY_TO,
                },
            },
            [X_EMAIL, y],
            type_version=2,
            credentials={
                "microsoftOutlookOAuth2Api": {
                    "id": OUTLOOK_CREDENTIAL_ID,
                    "name": OUTLOOK_CREDENTIAL_NAME,
                }
            },
        )
        nodes.append(email)

        # Connections: Webhook -> Code -> Email
        connections[webhook_name] = {
            "main": [[{"node": code_name, "type": "main", "index": 0}]]
        }
        connections[code_name] = {
            "main": [[{"node": email_name, "type": "main", "index": 0}]]
        }

    return {
        "name": workflow_name,
        "nodes": nodes,
        "connections": connections,
        "active": False,
        "settings": {"executionOrder": "v1"},
        "tags": [],
        "meta": {
            "templateCredsSetupCompleted": False,
        },
    }


# =============================================
# Generate
# =============================================

def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    workflows = [
        ("CREDO HR-Portal — Onboarding-v3", ONBOARDING_EVENTS, "CREDO-Onboarding-v3.json"),
        ("CREDO HR-Portal — Offboarding-v3", OFFBOARDING_EVENTS, "CREDO-Offboarding-v3.json"),
        ("CREDO HR-Portal — Verbeamtung-v3", VERBEAMTUNG_EVENTS, "CREDO-Verbeamtung-v3.json"),
    ]

    for wf_name, events, filename in workflows:
        wf = make_workflow(wf_name, events)
        out_path = OUT_DIR / filename
        with out_path.open("w", encoding="utf-8") as f:
            json.dump(wf, f, indent=2, ensure_ascii=False)
        print(f"  ✓ {filename}: {len(events)} Events, {len(wf['nodes'])} Nodes")

if __name__ == "__main__":
    main()
