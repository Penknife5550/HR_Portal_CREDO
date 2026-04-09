/**
 * n8n-Flow-Generator — Geteilte Library
 *
 * Wird von generate-elternzeit-flow.js und generate-mutterschutz-flow.js
 * (und perspektivisch weiteren Modulen) verwendet. Spiegelt 1:1 das
 * Layout der bestehenden Onboarding/Offboarding/Verbeamtung-Flows.
 *
 * Exports:
 *   - RENDERER_LIB:    Inline-Renderer (CREDO-CD, Outlook-VML)
 *   - HR_INTERN:       Default-Empfaenger fuer interne Mails
 *   - buildFlow(name, events): erzeugt das fertige n8n-JSON-Objekt
 */

const crypto = require("crypto");
const uuid = () => crypto.randomUUID();

// =============================================
// Renderer-Library — wird in jeden Code-Node eingebettet.
// 1:1 aus CREDO-Onboarding-v3.json uebernommen, damit Layout identisch bleibt.
// =============================================
const RENDERER_LIB = `
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

function ctaButton(text, url, color) {
  const bg = color || COLORS.primary;
  return \`
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin: 24px auto;">
      <tr>
        <td align="center" bgcolor="\${bg}" style="border-radius: 6px;">
          <!--[if mso]>
          <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word"
            href="\${escapeHtml(url)}" style="height:48px;v-text-anchor:middle;width:280px;" arcsize="13%" stroke="f" fillcolor="\${bg}">
            <w:anchorlock/>
            <center style="color:#ffffff;font-family:Arial,sans-serif;font-size:15px;font-weight:bold;">
              \${escapeHtml(text)}
            </center>
          </v:roundrect>
          <![endif]-->
          <!--[if !mso]> <!-- -->
          <a href="\${escapeHtml(url)}" target="_blank" style="display:inline-block;padding:14px 32px;font-family:'Montserrat',Arial,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:6px;background-color:\${bg};line-height:20px;">
            \${escapeHtml(text)}
          </a>
          <!-- <![endif]-->
        </td>
      </tr>
    </table>
  \`.trim();
}

function credoLinie() {
  return \`
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">
      <tr>
        <td bgcolor="\${COLORS.greyLine}" width="50%" height="4" style="line-height:4px;font-size:0;">&nbsp;</td>
        <td bgcolor="\${COLORS.gelb}"     width="12.5%" height="4" style="line-height:4px;font-size:0;">&nbsp;</td>
        <td bgcolor="\${COLORS.gruen}"    width="12.5%" height="4" style="line-height:4px;font-size:0;">&nbsp;</td>
        <td bgcolor="\${COLORS.rot}"      width="12.5%" height="4" style="line-height:4px;font-size:0;">&nbsp;</td>
        <td bgcolor="\${COLORS.blau}"     width="12.5%" height="4" style="line-height:4px;font-size:0;">&nbsp;</td>
      </tr>
    </table>
  \`.trim();
}

function dataTable(rows) {
  if (!rows || rows.length === 0) return '';
  const trs = rows
    .filter(r => r && r.label && r.value !== undefined && r.value !== null && r.value !== '')
    .map(r => \`
      <tr>
        <td style="padding:8px 0;font-family:'Montserrat',Arial,sans-serif;font-size:13px;color:\${COLORS.textMuted};vertical-align:top;width:40%;">\${escapeHtml(r.label)}</td>
        <td style="padding:8px 0;font-family:'Montserrat',Arial,sans-serif;font-size:14px;color:\${COLORS.text};font-weight:600;vertical-align:top;">\${escapeHtml(r.value)}</td>
      </tr>
    \`).join('');
  if (!trs) return '';
  return \`
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;border-top:1px solid #EEEEEE;border-bottom:1px solid #EEEEEE;margin:16px 0;">
      \${trs}
    </table>
  \`.trim();
}

function renderCredoMail(opts) {
  const {
    preheader = '',
    badge = null,
    headline = '',
    intro = '',
    rows = [],
    bodyHtml = '',
    cta = null,
    footerNote = '',
  } = opts || {};

  const badgeHtml = badge ? \`
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px 0;">
      <tr>
        <td bgcolor="\${badge.color || COLORS.blau}" style="padding:6px 14px;border-radius:14px;font-family:'Montserrat',Arial,sans-serif;font-size:11px;font-weight:bold;color:#ffffff;letter-spacing:0.5px;text-transform:uppercase;">
          \${escapeHtml(badge.text)}
        </td>
      </tr>
    </table>
  \` : '';

  return \`<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
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
  body { margin: 0 !important; padding: 0 !important; width: 100% !important; background-color: \${COLORS.bg}; }
  @media screen and (max-width:600px) {
    .container { width: 100% !important; }
    .px { padding-left: 24px !important; padding-right: 24px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background-color:\${COLORS.bg};font-family:'Montserrat',Arial,Helvetica,sans-serif;color:\${COLORS.text};">

<div style="display:none;font-size:1px;color:\${COLORS.bg};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">
  \${escapeHtml(preheader)}
</div>

<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="\${COLORS.bg}">
  <tr>
    <td align="center" style="padding:24px 0;">

      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" class="container" style="width:600px;max-width:600px;background-color:#ffffff;border-radius:8px;overflow:hidden;">

        <tr>
          <td align="left" class="px" style="padding:32px 40px 16px 40px;">
            <img src="\${LOGO_URL}" width="140" height="auto" alt="CREDO HR-Portal" style="display:block;border:0;width:140px;max-width:140px;height:auto;" />
          </td>
        </tr>

        <tr>
          <td>\${credoLinie()}</td>
        </tr>

        <tr>
          <td class="px" style="padding:32px 40px 16px 40px;">
            \${badgeHtml}
            <h1 style="margin:0 0 12px 0;font-family:'Montserrat',Arial,Helvetica,sans-serif;font-size:22px;line-height:28px;font-weight:700;color:\${COLORS.primary};">
              \${escapeHtml(headline)}
            </h1>
            <p style="margin:0 0 16px 0;font-family:'Montserrat',Arial,Helvetica,sans-serif;font-size:14px;line-height:22px;color:\${COLORS.text};">
              \${intro}
            </p>
            \${dataTable(rows)}
            \${bodyHtml}
            \${cta ? ctaButton(cta.text, cta.url, cta.color) : ''}
          </td>
        </tr>

        <tr>
          <td>\${credoLinie()}</td>
        </tr>
        <tr>
          <td class="px" style="padding:24px 40px 32px 40px;font-family:'Montserrat',Arial,Helvetica,sans-serif;font-size:11px;line-height:18px;color:\${COLORS.textMuted};">
            \${footerNote ? \`<p style="margin:0 0 12px 0;">\${footerNote}</p>\` : ''}
            <p style="margin:0;">
              CREDO Schultraegergruppe &middot; HR-Portal &middot;
              <a href="\${APP_BASE_URL}" style="color:\${COLORS.primary};text-decoration:none;">\${APP_BASE_URL.replace('https://', '')}</a>
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
</html>\`;
}
`;

const HR_INTERN = "CREDO-Personal-intern@fes-credo.de";

// =============================================
// Konstanten fuer das Layout (Canvas-Positionen)
// =============================================
const OUTLOOK_CRED_ID = "FCU8Wm3Is8PCPAHT";
const OUTLOOK_CRED_NAME = "n8n@fes-minden.de";
const REPLY_TO = "personalbuchhaltung@fes-minden.de";
const X_WEBHOOK = 240;
const X_RENDER = 540;
const X_OUTLOOK = 880;
const Y_START = 240;
const Y_STEP = 280;

// =============================================
// Haupt-Builder
// =============================================
function buildFlow(flowName, events) {
  const nodes = [];
  const conns = {};

  events.forEach((ev, i) => {
    const y = Y_START + i * Y_STEP;
    const renderName = `E-Mail rendern: ${ev.nodeName}`;
    const sendName = `Outlook senden: ${ev.nodeName}`;

    // Webhook-Node
    nodes.push({
      parameters: {
        httpMethod: "POST",
        path: ev.path,
        responseMode: "onReceived",
        responseCode: 200,
        responseData: "noData",
        options: {},
      },
      id: uuid(),
      name: ev.nodeName,
      type: "n8n-nodes-base.webhook",
      typeVersion: 2,
      position: [X_WEBHOOK, y],
    });

    // Code-Node (Renderer-Lib + Event-Render)
    nodes.push({
      parameters: {
        language: "javaScript",
        jsCode: RENDERER_LIB + "\n" + ev.render,
      },
      id: uuid(),
      name: renderName,
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [X_RENDER, y],
    });

    // Outlook-Send-Node
    nodes.push({
      parameters: {
        resource: "message",
        operation: "send",
        subject: "={{ $json.subject }}",
        bodyContent: "={{ $json.html }}",
        bodyContentType: "html",
        toRecipients: "={{ $json.to }}",
        additionalFields: { replyTo: REPLY_TO },
      },
      id: uuid(),
      name: sendName,
      type: "n8n-nodes-base.microsoftOutlook",
      typeVersion: 2,
      position: [X_OUTLOOK, y],
      credentials: {
        microsoftOutlookOAuth2Api: {
          id: OUTLOOK_CRED_ID,
          name: OUTLOOK_CRED_NAME,
        },
      },
    });

    // Connections: Webhook → Render → Outlook
    conns[ev.nodeName] = {
      main: [[{ node: renderName, type: "main", index: 0 }]],
    };
    conns[renderName] = {
      main: [[{ node: sendName, type: "main", index: 0 }]],
    };
  });

  return {
    name: flowName,
    nodes,
    connections: conns,
    active: false,
    settings: { executionOrder: "v1" },
    tags: [],
    meta: { templateCredsSetupCompleted: false },
  };
}

module.exports = { RENDERER_LIB, HR_INTERN, buildFlow };
