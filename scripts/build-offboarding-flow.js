/**
 * Build-Script: CREDO HR Offboarding n8n Workflow
 *
 * Nimmt die 5 bestehenden Code-Nodes aus CREDO_HR_Portal_Offboarding_Workflow.json,
 * ergaenzt 2 fehlende Events (task-overdue, reminder), wendet die Korrekturen an
 * (Telefon, Org-Name, E-Mail) und erzeugt einen neuen Workflow mit Outlook statt SMTP.
 */

const fs = require("fs");
const crypto = require("crypto");
const uuid = () => crypto.randomUUID();

const wf = JSON.parse(
  fs.readFileSync("n8n/CREDO_HR_Portal_Offboarding_Workflow.json", "utf8")
);

// Extract existing code from code nodes
const codeMap = {};
wf.nodes
  .filter((n) => n.type === "n8n-nodes-base.code")
  .forEach((n) => {
    codeMap[n.name] = n.parameters.jsCode;
  });

// ==========================================
// Fix all existing codes: phone, org, email
// ==========================================
function fixCode(code) {
  code = code.replace(/0571 388 60-148/g, "0571 388 60-0");
  code = code.replace(/0571 38860-148/g, "0571 388 60-0");
  code = code.replace(
    /Christlicher Schulverein Minden e\.V\./g,
    "Freie Evangelische Stiftung CREDO e.V."
  );
  code = code.replace(
    /Christliche Schulverein Minden/g,
    "Freie Evangelische Stiftung CREDO e.V."
  );
  code = code.replace(
    /personal@credo-gruppe\.de/g,
    "personalbuchhaltung@fes-minden.de"
  );
  code = code.replace(
    /CREDO-Personal-intern@fes-credo\.de/g,
    "personalbuchhaltung@fes-minden.de"
  );
  return code;
}

// ==========================================
// New code for task-overdue
// ==========================================
const codeTaskOverdue = `// ============================================================
// CREDO HR-Portal — Aufgabe ueberfaellig
// Benachrichtigung an HR: Offboarding-Aufgabe ist ueberfaellig
// ============================================================

const CONFIG = {
  hrEmail: 'personalbuchhaltung@fes-minden.de',
  portalUrl: 'https://hr.fes-credo.de'
};

try {
  const item = $input.first().json;
  const data = item.body || item;
  const { displayId, employeeName, employeeFirstName, employeeLastName, organization, departmentName, departmentKey, taskTitle, dueDate, lastWorkingDay } = data;

  const name = employeeName || [employeeFirstName, employeeLastName].filter(Boolean).join(' ') || 'Unbekannt';
  const orgName = organization || 'CREDO';
  const deptName = departmentName || departmentKey || 'Abteilung';
  const dueDateFormatted = dueDate ? new Date(dueDate).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : 'k.A.';
  const lwdFormatted = lastWorkingDay ? new Date(lastWorkingDay).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : 'k.A.';

  const htmlBody = \`<!DOCTYPE html>
<html lang="de">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:Calibri,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f5;padding:20px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;">
  <tr><td style="background-color:#005d6a;padding:25px 40px;">
    <h1 style="color:#ffffff;font-family:'ITC Avant Garde Gothic',Arial Black,Arial,sans-serif;font-size:22px;margin:0;">Offboarding — Aufgabe ueberfaellig</h1>
  </td></tr>
  <tr><td style="padding:35px 40px;">
    <div style="background-color:#fbe9e7;border-left:4px solid #E2001A;padding:15px 20px;border-radius:4px;margin:0 0 25px;">
      <p style="color:#c62828;font-size:15px;font-weight:bold;margin:0;">Ueberfaellige Offboarding-Aufgabe</p>
    </div>
    <table cellpadding="8" cellspacing="0" style="width:100%;border-collapse:collapse;margin:0 0 25px;">
      <tr style="border-bottom:1px solid #eee;"><td style="color:#666;font-size:14px;width:160px;">Vorgang</td><td style="color:#333;font-size:14px;font-weight:bold;">\${displayId || 'k.A.'}</td></tr>
      <tr style="border-bottom:1px solid #eee;"><td style="color:#666;font-size:14px;">Mitarbeiter/in</td><td style="color:#333;font-size:14px;font-weight:bold;">\${name}</td></tr>
      <tr style="border-bottom:1px solid #eee;"><td style="color:#666;font-size:14px;">Einrichtung</td><td style="color:#333;font-size:14px;">\${orgName}</td></tr>
      <tr style="border-bottom:1px solid #eee;"><td style="color:#666;font-size:14px;">Abteilung</td><td style="color:#333;font-size:14px;font-weight:bold;">\${deptName}</td></tr>
      <tr style="border-bottom:1px solid #eee;"><td style="color:#666;font-size:14px;">Aufgabe</td><td style="color:#333;font-size:14px;">\${taskTitle || 'k.A.'}</td></tr>
      <tr style="border-bottom:1px solid #eee;"><td style="color:#666;font-size:14px;">Faellig am</td><td style="color:#E2001A;font-size:14px;font-weight:bold;">\${dueDateFormatted}</td></tr>
      <tr><td style="color:#666;font-size:14px;">Letzter Arbeitstag</td><td style="color:#333;font-size:14px;">\${lwdFormatted}</td></tr>
    </table>
    <table cellpadding="0" cellspacing="0" style="margin:0 auto 20px;"><tr><td align="center" style="background-color:#005d6a;border-radius:6px;">
      <a href="\${CONFIG.portalUrl}/offboarding" target="_blank" style="display:inline-block;padding:12px 35px;color:#ffffff;font-size:15px;font-weight:bold;text-decoration:none;">Im HR-Portal oeffnen</a>
    </td></tr></table>
  </td></tr>
  <tr><td style="padding:0;"><table width="100%" cellpadding="0" cellspacing="0"><tr>
    <td width="50%" style="height:4px;background-color:#DADADA;"></td>
    <td width="12.5%" style="height:4px;background-color:#FBC900;"></td>
    <td width="12.5%" style="height:4px;background-color:#6BAA24;"></td>
    <td width="12.5%" style="height:4px;background-color:#E2001A;"></td>
    <td width="12.5%" style="height:4px;background-color:#009AC6;"></td>
  </tr></table></td></tr>
  <tr><td style="background-color:#f9f9f9;padding:20px 40px;text-align:center;">
    <p style="color:#999;font-size:11px;line-height:1.5;margin:0;">Freie Evangelische Stiftung CREDO e.V. &middot; Kingsleyallee 6 &middot; 32425 Minden<br>Tel. 0571 388 60-0 &middot; <a href="https://fes-minden.de" style="color:#005d6a;text-decoration:none;">fes-minden.de</a></p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>\`;

  return [{ json: { to: CONFIG.hrEmail, subject: '[HR-Portal] Aufgabe ueberfaellig: ' + (taskTitle || 'Aufgabe') + ' — ' + deptName + ' (' + name + ')', html: htmlBody } }];
} catch (error) {
  console.error('[offboarding-task-overdue] Fehler:', error.message);
  return [{ json: { error: error.message, event: 'offboarding-task-overdue' } }];
}`;

// ==========================================
// New code for reminder
// ==========================================
const codeReminder = `// ============================================================
// CREDO HR-Portal — Offboarding-Reminder gesendet
// Benachrichtigung an HR ueber versendete Erinnerungen
// ============================================================

const CONFIG = {
  hrEmail: 'personalbuchhaltung@fes-minden.de'
};

try {
  const item = $input.first().json;
  const data = item.body || item;
  const { displayId, employeeName, employeeFirstName, employeeLastName, organization, departmentName, departmentKey, reminderLevel, overdueItems, upcomingItems } = data;

  const name = employeeName || [employeeFirstName, employeeLastName].filter(Boolean).join(' ') || 'Unbekannt';
  const orgName = organization || 'CREDO';
  const deptName = departmentName || departmentKey || 'Abteilung';
  const level = reminderLevel || 'INFO';

  const levelColors = { INFO: '#009AC6', WARNING: '#FBC900', ESCALATION: '#E2001A' };
  const levelLabels = { INFO: 'Vorab-Info', WARNING: 'Warnung', ESCALATION: 'Eskalation' };
  const bannerColor = levelColors[level] || '#009AC6';
  const bannerBg = level === 'ESCALATION' ? '#fbe9e7' : level === 'WARNING' ? '#fff3e0' : '#e3f2fd';

  const htmlBody = \`<!DOCTYPE html>
<html lang="de">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:Calibri,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f5;padding:20px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;">
  <tr><td style="background-color:#005d6a;padding:25px 40px;">
    <h1 style="color:#ffffff;font-family:'ITC Avant Garde Gothic',Arial Black,Arial,sans-serif;font-size:22px;margin:0;">Offboarding — Erinnerung</h1>
  </td></tr>
  <tr><td style="padding:35px 40px;">
    <div style="background-color:\${bannerBg};border-left:4px solid \${bannerColor};padding:15px 20px;border-radius:4px;margin:0 0 25px;">
      <p style="color:\${bannerColor};font-size:15px;font-weight:bold;margin:0;">Offboarding-Erinnerung (\${levelLabels[level] || level})</p>
    </div>
    <table cellpadding="8" cellspacing="0" style="width:100%;border-collapse:collapse;margin:0 0 25px;">
      <tr style="border-bottom:1px solid #eee;"><td style="color:#666;font-size:14px;width:160px;">Vorgang</td><td style="color:#333;font-size:14px;font-weight:bold;">\${displayId || 'k.A.'}</td></tr>
      <tr style="border-bottom:1px solid #eee;"><td style="color:#666;font-size:14px;">Mitarbeiter/in</td><td style="color:#333;font-size:14px;font-weight:bold;">\${name}</td></tr>
      <tr style="border-bottom:1px solid #eee;"><td style="color:#666;font-size:14px;">Einrichtung</td><td style="color:#333;font-size:14px;">\${orgName}</td></tr>
      <tr style="border-bottom:1px solid #eee;"><td style="color:#666;font-size:14px;">Abteilung</td><td style="color:#333;font-size:14px;font-weight:bold;">\${deptName}</td></tr>
      <tr style="border-bottom:1px solid #eee;"><td style="color:#666;font-size:14px;">Ueberfaellig</td><td style="color:#E2001A;font-size:14px;font-weight:bold;">\${overdueItems || 0}</td></tr>
      <tr><td style="color:#666;font-size:14px;">Bevorstehend</td><td style="color:#333;font-size:14px;">\${upcomingItems || 0}</td></tr>
    </table>
  </td></tr>
  <tr><td style="padding:0;"><table width="100%" cellpadding="0" cellspacing="0"><tr>
    <td width="50%" style="height:4px;background-color:#DADADA;"></td>
    <td width="12.5%" style="height:4px;background-color:#FBC900;"></td>
    <td width="12.5%" style="height:4px;background-color:#6BAA24;"></td>
    <td width="12.5%" style="height:4px;background-color:#E2001A;"></td>
    <td width="12.5%" style="height:4px;background-color:#009AC6;"></td>
  </tr></table></td></tr>
  <tr><td style="background-color:#f9f9f9;padding:20px 40px;text-align:center;">
    <p style="color:#999;font-size:11px;line-height:1.5;margin:0;">Freie Evangelische Stiftung CREDO e.V. &middot; Kingsleyallee 6 &middot; 32425 Minden<br>Tel. 0571 388 60-0 &middot; <a href="https://fes-minden.de" style="color:#005d6a;text-decoration:none;">fes-minden.de</a></p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>\`;

  return [{ json: { to: CONFIG.hrEmail, subject: '[HR-Portal] Offboarding-Erinnerung (' + (levelLabels[level] || level) + '): ' + deptName + ' — ' + name, html: htmlBody } }];
} catch (error) {
  console.error('[offboarding-reminder] Fehler:', error.message);
  return [{ json: { error: error.message, event: 'offboarding-reminder' } }];
}`;

// ==========================================
// New code for exit-interview-invited
// ==========================================
const codeExitInterviewInvited = `// ============================================================
// CREDO HR-Portal — Exit-Interview versendet
// Benachrichtigung an HR: Magic-Link wurde versendet
// ============================================================

const CONFIG = {
  hrEmail: 'personalbuchhaltung@fes-minden.de',
  portalUrl: 'https://hr.fes-credo.de'
};

try {
  const item = $input.first().json;
  const data = item.body || item;
  const { displayId, employeeName, employeeFirstName, employeeLastName, organization, recipientEmail, exitInterviewId, sentAt } = data;

  const name = employeeName || [employeeFirstName, employeeLastName].filter(Boolean).join(' ') || 'Unbekannt';
  const orgName = organization || 'CREDO';
  const sentFormatted = sentAt ? new Date(sentAt).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : new Date().toLocaleString('de-DE');

  const htmlBody = \`<!DOCTYPE html>
<html lang="de">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:Calibri,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f5;padding:20px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;">
  <tr><td style="background-color:#005d6a;padding:25px 40px;">
    <h1 style="color:#ffffff;font-family:'ITC Avant Garde Gothic',Arial Black,Arial,sans-serif;font-size:22px;margin:0;">Exit-Interview — Einladung versendet</h1>
  </td></tr>
  <tr><td style="padding:35px 40px;">
    <div style="background-color:#eff6ff;border-left:4px solid #009AC6;padding:15px 20px;border-radius:4px;margin:0 0 25px;">
      <p style="color:#0277bd;font-size:15px;font-weight:bold;margin:0;">Exit-Interview-Einladung wurde versendet</p>
    </div>
    <table cellpadding="8" cellspacing="0" style="width:100%;border-collapse:collapse;margin:0 0 25px;">
      <tr style="border-bottom:1px solid #eee;"><td style="color:#666;font-size:14px;width:160px;">Vorgang</td><td style="color:#333;font-size:14px;font-weight:bold;">\${displayId || 'k.A.'}</td></tr>
      <tr style="border-bottom:1px solid #eee;"><td style="color:#666;font-size:14px;">Mitarbeiter/in</td><td style="color:#333;font-size:14px;font-weight:bold;">\${name}</td></tr>
      <tr style="border-bottom:1px solid #eee;"><td style="color:#666;font-size:14px;">Einrichtung</td><td style="color:#333;font-size:14px;">\${orgName}</td></tr>
      <tr style="border-bottom:1px solid #eee;"><td style="color:#666;font-size:14px;">Empfaenger</td><td style="color:#333;font-size:14px;">\${recipientEmail || 'k.A.'}</td></tr>
      <tr><td style="color:#666;font-size:14px;">Versendet am</td><td style="color:#333;font-size:14px;">\${sentFormatted}</td></tr>
    </table>
    <table cellpadding="0" cellspacing="0" style="margin:0 auto 20px;"><tr><td align="center" style="background-color:#005d6a;border-radius:6px;">
      <a href="\${CONFIG.portalUrl}/dashboard/offboarding" target="_blank" style="display:inline-block;padding:12px 35px;color:#ffffff;font-size:15px;font-weight:bold;text-decoration:none;">Im HR-Portal oeffnen</a>
    </td></tr></table>
  </td></tr>
  <tr><td style="padding:0;"><table width="100%" cellpadding="0" cellspacing="0"><tr>
    <td width="50%" style="height:4px;background-color:#DADADA;"></td>
    <td width="12.5%" style="height:4px;background-color:#FBC900;"></td>
    <td width="12.5%" style="height:4px;background-color:#6BAA24;"></td>
    <td width="12.5%" style="height:4px;background-color:#E2001A;"></td>
    <td width="12.5%" style="height:4px;background-color:#009AC6;"></td>
  </tr></table></td></tr>
  <tr><td style="background-color:#f9f9f9;padding:20px 40px;text-align:center;">
    <p style="color:#999;font-size:11px;line-height:1.5;margin:0;">Freie Evangelische Stiftung CREDO e.V. &middot; Kingsleyallee 6 &middot; 32425 Minden<br>Tel. 0571 388 60-0 &middot; <a href="https://fes-minden.de" style="color:#005d6a;text-decoration:none;">fes-minden.de</a></p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>\`;

  return [{ json: { to: CONFIG.hrEmail, subject: '[HR-Portal] Exit-Interview versendet: ' + name + ' (' + (displayId || '') + ') — ' + orgName, html: htmlBody } }];
} catch (error) {
  console.error('[exit-interview-invited] Fehler:', error.message);
  return [{ json: { error: error.message, event: 'exit-interview-invited' } }];
}`;

// ==========================================
// New code for exit-interview-submitted
// ==========================================
const codeExitInterviewSubmitted = `// ============================================================
// CREDO HR-Portal — Exit-Interview ausgefuellt
// Benachrichtigung an HR: Mitarbeiter hat Exit-Interview eingereicht
// ============================================================

const CONFIG = {
  hrEmail: 'personalbuchhaltung@fes-minden.de',
  portalUrl: 'https://hr.fes-credo.de'
};

try {
  const item = $input.first().json;
  const data = item.body || item;
  const { displayId, employeeName, employeeFirstName, employeeLastName, organization, recipientEmail, submittedAt } = data;

  const name = employeeName || [employeeFirstName, employeeLastName].filter(Boolean).join(' ') || 'Unbekannt';
  const orgName = organization || 'CREDO';
  const submittedFormatted = submittedAt ? new Date(submittedAt).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : new Date().toLocaleString('de-DE');

  const htmlBody = \`<!DOCTYPE html>
<html lang="de">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:Calibri,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f5;padding:20px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;">
  <tr><td style="background-color:#005d6a;padding:25px 40px;">
    <h1 style="color:#ffffff;font-family:'ITC Avant Garde Gothic',Arial Black,Arial,sans-serif;font-size:22px;margin:0;">Exit-Interview — Eingereicht</h1>
  </td></tr>
  <tr><td style="padding:35px 40px;">
    <div style="background-color:#e8f5e9;border-left:4px solid #6BAA24;padding:15px 20px;border-radius:4px;margin:0 0 25px;">
      <p style="color:#2e7d32;font-size:15px;font-weight:bold;margin:0;">Exit-Interview wurde ausgefuellt</p>
    </div>
    <table cellpadding="8" cellspacing="0" style="width:100%;border-collapse:collapse;margin:0 0 25px;">
      <tr style="border-bottom:1px solid #eee;"><td style="color:#666;font-size:14px;width:160px;">Vorgang</td><td style="color:#333;font-size:14px;font-weight:bold;">\${displayId || 'k.A.'}</td></tr>
      <tr style="border-bottom:1px solid #eee;"><td style="color:#666;font-size:14px;">Mitarbeiter/in</td><td style="color:#333;font-size:14px;font-weight:bold;">\${name}</td></tr>
      <tr style="border-bottom:1px solid #eee;"><td style="color:#666;font-size:14px;">Einrichtung</td><td style="color:#333;font-size:14px;">\${orgName}</td></tr>
      <tr style="border-bottom:1px solid #eee;"><td style="color:#666;font-size:14px;">Eingereicht von</td><td style="color:#333;font-size:14px;">\${recipientEmail || 'k.A.'}</td></tr>
      <tr><td style="color:#666;font-size:14px;">Eingereicht am</td><td style="color:#333;font-size:14px;font-weight:bold;">\${submittedFormatted}</td></tr>
    </table>
    <p style="color:#333;font-size:15px;line-height:1.6;margin:0 0 20px;">Die Antworten koennen jetzt im HR-Portal eingesehen und ausgewertet werden.</p>
    <table cellpadding="0" cellspacing="0" style="margin:0 auto 20px;"><tr><td align="center" style="background-color:#005d6a;border-radius:6px;">
      <a href="\${CONFIG.portalUrl}/dashboard/offboarding" target="_blank" style="display:inline-block;padding:12px 35px;color:#ffffff;font-size:15px;font-weight:bold;text-decoration:none;">Ergebnisse ansehen</a>
    </td></tr></table>
  </td></tr>
  <tr><td style="padding:0;"><table width="100%" cellpadding="0" cellspacing="0"><tr>
    <td width="50%" style="height:4px;background-color:#DADADA;"></td>
    <td width="12.5%" style="height:4px;background-color:#FBC900;"></td>
    <td width="12.5%" style="height:4px;background-color:#6BAA24;"></td>
    <td width="12.5%" style="height:4px;background-color:#E2001A;"></td>
    <td width="12.5%" style="height:4px;background-color:#009AC6;"></td>
  </tr></table></td></tr>
  <tr><td style="background-color:#f9f9f9;padding:20px 40px;text-align:center;">
    <p style="color:#999;font-size:11px;line-height:1.5;margin:0;">Freie Evangelische Stiftung CREDO e.V. &middot; Kingsleyallee 6 &middot; 32425 Minden<br>Tel. 0571 388 60-0 &middot; <a href="https://fes-minden.de" style="color:#005d6a;text-decoration:none;">fes-minden.de</a></p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>\`;

  return [{ json: { to: CONFIG.hrEmail, subject: '[HR-Portal] Exit-Interview eingereicht: ' + name + ' (' + (displayId || '') + ') — ' + orgName, html: htmlBody } }];
} catch (error) {
  console.error('[exit-interview-submitted] Fehler:', error.message);
  return [{ json: { error: error.message, event: 'exit-interview-submitted' } }];
}`;

// ==========================================
// New code for zeugnis-bewertung-invited
// ==========================================
const codeZeugnisBewertungInvited = `// ============================================================
// CREDO HR-Portal — Zeugnis-Bewertung versendet
// Benachrichtigung an HR: Magic-Link an Vorgesetzten versendet
// ============================================================

const CONFIG = {
  hrEmail: 'personalbuchhaltung@fes-minden.de',
  portalUrl: 'https://hr.fes-credo.de'
};

try {
  const item = $input.first().json;
  const data = item.body || item;
  const { displayId, employeeName, employeeFirstName, employeeLastName, organization, supervisorEmail, supervisorName, jobGroup, sentAt } = data;

  const name = employeeName || [employeeFirstName, employeeLastName].filter(Boolean).join(' ') || 'Unbekannt';
  const orgName = organization || 'CREDO';
  const supName = supervisorName || supervisorEmail || 'k.A.';
  const sentFormatted = sentAt ? new Date(sentAt).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : new Date().toLocaleString('de-DE');

  const jobGroupLabels = {
    'LEHRKRAFT': 'Lehrkraft',
    'ERZIEHER': 'Erzieher/in',
    'VERWALTUNG': 'Verwaltung',
    'SCHULLEITUNG': 'Schulleitung',
    'SONSTIGES': 'Sonstiges'
  };
  const jobGroupLabel = jobGroupLabels[jobGroup] || jobGroup || 'k.A.';

  const htmlBody = \`<!DOCTYPE html>
<html lang="de">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:Calibri,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f5;padding:20px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;">
  <tr><td style="background-color:#005d6a;padding:25px 40px;">
    <h1 style="color:#ffffff;font-family:'ITC Avant Garde Gothic',Arial Black,Arial,sans-serif;font-size:22px;margin:0;">Zeugnis-Bewertung — Versendet</h1>
  </td></tr>
  <tr><td style="padding:35px 40px;">
    <div style="background-color:#eff6ff;border-left:4px solid #009AC6;padding:15px 20px;border-radius:4px;margin:0 0 25px;">
      <p style="color:#0277bd;font-size:15px;font-weight:bold;margin:0;">Zeugnis-Bewertungsbogen wurde versendet</p>
    </div>
    <table cellpadding="8" cellspacing="0" style="width:100%;border-collapse:collapse;margin:0 0 25px;">
      <tr style="border-bottom:1px solid #eee;"><td style="color:#666;font-size:14px;width:160px;">Vorgang</td><td style="color:#333;font-size:14px;font-weight:bold;">\${displayId || 'k.A.'}</td></tr>
      <tr style="border-bottom:1px solid #eee;"><td style="color:#666;font-size:14px;">Mitarbeiter/in</td><td style="color:#333;font-size:14px;font-weight:bold;">\${name}</td></tr>
      <tr style="border-bottom:1px solid #eee;"><td style="color:#666;font-size:14px;">Einrichtung</td><td style="color:#333;font-size:14px;">\${orgName}</td></tr>
      <tr style="border-bottom:1px solid #eee;"><td style="color:#666;font-size:14px;">Berufsgruppe</td><td style="color:#333;font-size:14px;">\${jobGroupLabel}</td></tr>
      <tr style="border-bottom:1px solid #eee;"><td style="color:#666;font-size:14px;">Vorgesetzte/r</td><td style="color:#333;font-size:14px;">\${supName}</td></tr>
      <tr><td style="color:#666;font-size:14px;">Versendet am</td><td style="color:#333;font-size:14px;">\${sentFormatted}</td></tr>
    </table>
    <table cellpadding="0" cellspacing="0" style="margin:0 auto 20px;"><tr><td align="center" style="background-color:#005d6a;border-radius:6px;">
      <a href="\${CONFIG.portalUrl}/dashboard/offboarding" target="_blank" style="display:inline-block;padding:12px 35px;color:#ffffff;font-size:15px;font-weight:bold;text-decoration:none;">Im HR-Portal oeffnen</a>
    </td></tr></table>
  </td></tr>
  <tr><td style="padding:0;"><table width="100%" cellpadding="0" cellspacing="0"><tr>
    <td width="50%" style="height:4px;background-color:#DADADA;"></td>
    <td width="12.5%" style="height:4px;background-color:#FBC900;"></td>
    <td width="12.5%" style="height:4px;background-color:#6BAA24;"></td>
    <td width="12.5%" style="height:4px;background-color:#E2001A;"></td>
    <td width="12.5%" style="height:4px;background-color:#009AC6;"></td>
  </tr></table></td></tr>
  <tr><td style="background-color:#f9f9f9;padding:20px 40px;text-align:center;">
    <p style="color:#999;font-size:11px;line-height:1.5;margin:0;">Freie Evangelische Stiftung CREDO e.V. &middot; Kingsleyallee 6 &middot; 32425 Minden<br>Tel. 0571 388 60-0 &middot; <a href="https://fes-minden.de" style="color:#005d6a;text-decoration:none;">fes-minden.de</a></p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>\`;

  return [{ json: { to: CONFIG.hrEmail, subject: '[HR-Portal] Zeugnis-Bewertung versendet: ' + name + ' (' + (displayId || '') + ') — ' + jobGroupLabel, html: htmlBody } }];
} catch (error) {
  console.error('[zeugnis-bewertung-invited] Fehler:', error.message);
  return [{ json: { error: error.message, event: 'zeugnis-bewertung-invited' } }];
}`;

// ==========================================
// New code for zeugnis-bewertung-submitted
// ==========================================
const codeZeugnisBewertungSubmitted = `// ============================================================
// CREDO HR-Portal — Zeugnis-Bewertung eingereicht
// Benachrichtigung an HR: Vorgesetzter hat Bewertung abgeschlossen
// ============================================================

const CONFIG = {
  hrEmail: 'personalbuchhaltung@fes-minden.de',
  portalUrl: 'https://hr.fes-credo.de'
};

try {
  const item = $input.first().json;
  const data = item.body || item;
  const { displayId, employeeName, employeeFirstName, employeeLastName, organization, supervisorEmail, supervisorName, jobGroup, submittedAt } = data;

  const name = employeeName || [employeeFirstName, employeeLastName].filter(Boolean).join(' ') || 'Unbekannt';
  const orgName = organization || 'CREDO';
  const supName = supervisorName || supervisorEmail || 'k.A.';
  const submittedFormatted = submittedAt ? new Date(submittedAt).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : new Date().toLocaleString('de-DE');

  const jobGroupLabels = {
    'LEHRKRAFT': 'Lehrkraft',
    'ERZIEHER': 'Erzieher/in',
    'VERWALTUNG': 'Verwaltung',
    'SCHULLEITUNG': 'Schulleitung',
    'SONSTIGES': 'Sonstiges'
  };
  const jobGroupLabel = jobGroupLabels[jobGroup] || jobGroup || 'k.A.';

  const htmlBody = \`<!DOCTYPE html>
<html lang="de">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:Calibri,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f5;padding:20px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;">
  <tr><td style="background-color:#005d6a;padding:25px 40px;">
    <h1 style="color:#ffffff;font-family:'ITC Avant Garde Gothic',Arial Black,Arial,sans-serif;font-size:22px;margin:0;">Zeugnis-Bewertung — Eingereicht</h1>
  </td></tr>
  <tr><td style="padding:35px 40px;">
    <div style="background-color:#e8f5e9;border-left:4px solid #6BAA24;padding:15px 20px;border-radius:4px;margin:0 0 25px;">
      <p style="color:#2e7d32;font-size:15px;font-weight:bold;margin:0;">Zeugnis-Bewertung wurde eingereicht</p>
    </div>
    <table cellpadding="8" cellspacing="0" style="width:100%;border-collapse:collapse;margin:0 0 25px;">
      <tr style="border-bottom:1px solid #eee;"><td style="color:#666;font-size:14px;width:160px;">Vorgang</td><td style="color:#333;font-size:14px;font-weight:bold;">\${displayId || 'k.A.'}</td></tr>
      <tr style="border-bottom:1px solid #eee;"><td style="color:#666;font-size:14px;">Mitarbeiter/in</td><td style="color:#333;font-size:14px;font-weight:bold;">\${name}</td></tr>
      <tr style="border-bottom:1px solid #eee;"><td style="color:#666;font-size:14px;">Einrichtung</td><td style="color:#333;font-size:14px;">\${orgName}</td></tr>
      <tr style="border-bottom:1px solid #eee;"><td style="color:#666;font-size:14px;">Berufsgruppe</td><td style="color:#333;font-size:14px;">\${jobGroupLabel}</td></tr>
      <tr style="border-bottom:1px solid #eee;"><td style="color:#666;font-size:14px;">Bewertet von</td><td style="color:#333;font-size:14px;">\${supName}</td></tr>
      <tr><td style="color:#666;font-size:14px;">Eingereicht am</td><td style="color:#333;font-size:14px;font-weight:bold;">\${submittedFormatted}</td></tr>
    </table>
    <p style="color:#333;font-size:15px;line-height:1.6;margin:0 0 20px;">Die Bewertung kann jetzt im HR-Portal geprueft und fuer das Zeugnis uebernommen werden.</p>
    <table cellpadding="0" cellspacing="0" style="margin:0 auto 20px;"><tr><td align="center" style="background-color:#005d6a;border-radius:6px;">
      <a href="\${CONFIG.portalUrl}/dashboard/offboarding" target="_blank" style="display:inline-block;padding:12px 35px;color:#ffffff;font-size:15px;font-weight:bold;text-decoration:none;">Bewertung pruefen</a>
    </td></tr></table>
  </td></tr>
  <tr><td style="padding:0;"><table width="100%" cellpadding="0" cellspacing="0"><tr>
    <td width="50%" style="height:4px;background-color:#DADADA;"></td>
    <td width="12.5%" style="height:4px;background-color:#FBC900;"></td>
    <td width="12.5%" style="height:4px;background-color:#6BAA24;"></td>
    <td width="12.5%" style="height:4px;background-color:#E2001A;"></td>
    <td width="12.5%" style="height:4px;background-color:#009AC6;"></td>
  </tr></table></td></tr>
  <tr><td style="background-color:#f9f9f9;padding:20px 40px;text-align:center;">
    <p style="color:#999;font-size:11px;line-height:1.5;margin:0;">Freie Evangelische Stiftung CREDO e.V. &middot; Kingsleyallee 6 &middot; 32425 Minden<br>Tel. 0571 388 60-0 &middot; <a href="https://fes-minden.de" style="color:#005d6a;text-decoration:none;">fes-minden.de</a></p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>\`;

  return [{ json: { to: CONFIG.hrEmail, subject: '[HR-Portal] Zeugnis-Bewertung eingereicht: ' + name + ' (' + (displayId || '') + ') — ' + supName, html: htmlBody } }];
} catch (error) {
  console.error('[zeugnis-bewertung-submitted] Fehler:', error.message);
  return [{ json: { error: error.message, event: 'zeugnis-bewertung-submitted' } }];
}`;

// ==========================================
// Event definitions: UI label -> webhook path -> code
// ==========================================
const events = [
  {
    uiLabel: "Offboarding erstellt",
    path: "offboarding-created",
    code: fixCode(codeMap["E-Mail: Offboarding angelegt"]),
  },
  {
    uiLabel: "Abteilung zugewiesen",
    path: "offboarding-department-assigned",
    code: fixCode(codeMap["E-Mail: Abteilung zugewiesen"]),
  },
  {
    uiLabel: "Aufgabe erledigt",
    path: "offboarding-task-completed",
    code: fixCode(codeMap["E-Mail: Aufgabe erledigt"]),
  },
  {
    uiLabel: "Abteilung fertig",
    path: "offboarding-department-completed",
    code: fixCode(codeMap["E-Mail: Abteilung komplett"]),
  },
  {
    uiLabel: "Aufgabe ueberfaellig",
    path: "offboarding-task-overdue",
    code: codeTaskOverdue,
  },
  {
    uiLabel: "Reminder gesendet",
    path: "offboarding-reminder",
    code: codeReminder,
  },
  {
    uiLabel: "Offboarding abgeschlossen",
    path: "offboarding-completed",
    code: fixCode(codeMap["E-Mail: Offboarding abgeschlossen"]),
  },
  {
    uiLabel: "Exit-Interview versendet",
    path: "exit-interview-invited",
    code: codeExitInterviewInvited,
  },
  {
    uiLabel: "Exit-Interview ausgefuellt",
    path: "exit-interview-submitted",
    code: codeExitInterviewSubmitted,
  },
  {
    uiLabel: "Zeugnis-Bewertung versendet",
    path: "zeugnis-bewertung-invited",
    code: codeZeugnisBewertungInvited,
  },
  {
    uiLabel: "Zeugnis-Bewertung eingereicht",
    path: "zeugnis-bewertung-submitted",
    code: codeZeugnisBewertungSubmitted,
  },
];

// ==========================================
// Build the workflow
// ==========================================
const OUTLOOK_CRED_ID = "FCU8Wm3Is8PCPAHT";
const OUTLOOK_CRED_NAME = "n8n@fes-minden.de";
const HEADER_AUTH_ID = "V77WPyuAnVY81lAB";
const HEADER_AUTH_NAME = "CREDO-HR-Portal";

const nodes = [];
const connections = {};
let y = 240;

for (const ev of events) {
  const whName = ev.uiLabel;
  const codeName = "E-Mail: " + ev.uiLabel;
  const outlookName = "Outlook: " + ev.uiLabel;

  // Webhook
  nodes.push({
    parameters: {
      httpMethod: "POST",
      path: ev.path,
      authentication: "headerAuth",
      options: { rawBody: false },
    },
    id: uuid(),
    name: whName,
    type: "n8n-nodes-base.webhook",
    typeVersion: 2,
    position: [240, y],
    webhookId: ev.path,
    credentials: {
      httpHeaderAuth: { id: HEADER_AUTH_ID, name: HEADER_AUTH_NAME },
    },
  });

  // Code
  nodes.push({
    parameters: {
      language: "javaScript",
      jsCode: ev.code,
    },
    id: uuid(),
    name: codeName,
    type: "n8n-nodes-base.code",
    typeVersion: 2,
    position: [560, y],
  });

  // Outlook
  nodes.push({
    parameters: {
      resource: "message",
      operation: "send",
      subject: "={{ $json.subject }}",
      bodyContent: "={{ $json.html }}",
      bodyContentType: "html",
      toRecipients: "={{ $json.to }}",
      senderAddress: "personalbuchhaltung@fes-minden.de",
      additionalFields: { replyTo: "personalbuchhaltung@fes-minden.de" },
    },
    id: uuid(),
    name: outlookName,
    type: "n8n-nodes-base.microsoftOutlook",
    typeVersion: 2,
    position: [920, y],
    credentials: {
      microsoftOutlookOAuth2Api: {
        id: OUTLOOK_CRED_ID,
        name: OUTLOOK_CRED_NAME,
      },
    },
  });

  // Connections
  connections[whName] = {
    main: [[{ node: codeName, type: "main", index: 0 }]],
  };
  connections[codeName] = {
    main: [[{ node: outlookName, type: "main", index: 0 }]],
  };

  y += 280;
}

const result = {
  name: "CREDO HR Offboarding",
  nodes,
  connections,
  active: false,
  settings: { executionOrder: "v1" },
  tags: [{ name: "Offboarding" }, { name: "HR-Portal" }, { name: "CREDO" }],
  meta: { templateCredsSetupCompleted: false },
};

fs.writeFileSync(
  "n8n/CREDO HR Offboarding.json",
  JSON.stringify(result, null, 2),
  "utf8"
);
console.log("Done. Nodes:", nodes.length);
console.log("Events:");
events.forEach((e) => console.log("  " + e.uiLabel + " -> /" + e.path));
