/**
 * Generator: n8n-Workflow CREDO-Mutterschutz
 *
 * 5 Status-Events des Mutterschutz-Moduls. Pro Event:
 *   1. Webhook  → 2. Code-Render → 3. Outlook-Send
 *
 * Renderer-Library + Builder kommen aus generator-lib.js (geteilt mit
 * dem Elternzeit-Generator). Pro neuem Event nur Eintrag in EVENTS hier.
 *
 * Aufruf:
 *   node scripts/n8n/generate-mutterschutz-flow.js > n8n/CREDO-Mutterschutz-v3.json
 */

const { HR_INTERN, buildFlow } = require("./generator-lib");

const EVENTS = [
  // ── Anlage ──────────────────────────────────────────────────────────
  {
    path: "mutterschutz-angelegt",
    nodeName: "Mutterschutz angelegt",
    render: `
const data = $input.first().json || {};
const subject = \`Neuer Mutterschutz-Vorgang: \${data.employeeName || ''}\`;
const html = renderCredoMail({
  preheader: 'Neue Schwangerschaftsmeldung im HR-Portal.',
  badge: { text: 'Neu angelegt', color: COLORS.rot },
  headline: 'Neuer Mutterschutz-Vorgang',
  intro: \`Im HR-Portal wurde ein neuer Mutterschutz-Vorgang fuer <strong>\${escapeHtml(data.employeeName || '—')}</strong> angelegt. Bitte zeitnah die naechsten Schritte (BAD-Beauftragung, Lohnbescheinigung KK) pruefen.\`,
  rows: [
    { label: 'Mandant', value: data.organization },
    { label: 'Vorgangs-ID', value: data.displayId },
    { label: 'Voraussichtl. Geburt', value: formatDate(data.voraussGeburt) },
    { label: 'Mutterschutz-Beginn', value: formatDate(data.mutterschutzBeginn) },
  ],
  cta: { text: 'Vorgang im Portal oeffnen', url: \`\${APP_BASE_URL}/dashboard/mutterschutz/\${data.mutterschutzId || ''}\`, color: COLORS.primary },
});
return [{ json: { to: '${HR_INTERN}', subject, html } }];
`,
  },
  // ── BAD beauftragt ──────────────────────────────────────────────────
  {
    path: "mutterschutz-bad-beauftragt",
    nodeName: "BAD beauftragt",
    render: `
const data = $input.first().json || {};
const subject = \`BAD beauftragt: \${data.displayId || ''}\`;
const html = renderCredoMail({
  preheader: 'Betriebsaerztlicher Dienst wurde beauftragt.',
  badge: { text: 'BAD beauftragt', color: COLORS.gelb },
  headline: 'BAD-Untersuchung beauftragt',
  intro: \`Der Betriebsaerztliche Dienst wurde fuer <strong>\${escapeHtml(data.employeeName || '—')}</strong> beauftragt. Sobald das Ergebnis vorliegt, im Portal als "BAD abgeschlossen" markieren.\`,
  rows: [
    { label: 'Vorgangs-ID', value: data.displayId },
    { label: 'Status', value: data.status },
  ],
  cta: { text: 'Im Portal oeffnen', url: \`\${APP_BASE_URL}/dashboard/mutterschutz/\${data.mutterschutzId || ''}\`, color: COLORS.gelb },
});
return [{ json: { to: '${HR_INTERN}', subject, html } }];
`,
  },
  // ── BAD abgeschlossen ───────────────────────────────────────────────
  {
    path: "mutterschutz-bad-abgeschlossen",
    nodeName: "BAD abgeschlossen",
    render: `
const data = $input.first().json || {};
const subject = \`BAD abgeschlossen: \${data.displayId || ''}\`;
const html = renderCredoMail({
  preheader: 'BAD-Untersuchung ist abgeschlossen.',
  badge: { text: 'BAD abgeschlossen', color: COLORS.blau },
  headline: 'BAD-Ergebnis liegt vor',
  intro: \`Die BAD-Untersuchung fuer <strong>\${escapeHtml(data.employeeName || '—')}</strong> ist abgeschlossen. Bitte ggf. Beschaeftigungsverbot dokumentieren und Mutterschutz aktivieren.\`,
  rows: [
    { label: 'Vorgangs-ID', value: data.displayId },
    { label: 'Status', value: data.status },
  ],
  cta: { text: 'Im Portal oeffnen', url: \`\${APP_BASE_URL}/dashboard/mutterschutz/\${data.mutterschutzId || ''}\`, color: COLORS.blau },
});
return [{ json: { to: '${HR_INTERN}', subject, html } }];
`,
  },
  // ── Aktiviert ───────────────────────────────────────────────────────
  {
    path: "mutterschutz-aktiviert",
    nodeName: "Mutterschutz aktiviert",
    render: `
const data = $input.first().json || {};
const subject = \`Mutterschutz aktiv: \${data.displayId || ''}\`;
const html = renderCredoMail({
  preheader: 'Schutzfrist hat begonnen.',
  badge: { text: 'Aktiv', color: COLORS.gruen },
  headline: 'Mutterschutz hat begonnen',
  intro: \`Die Schutzfrist fuer <strong>\${escapeHtml(data.employeeName || '—')}</strong> hat begonnen. LOGA-Eintraege (Sonder-Steuerklasse, KK-Zuschuss) bitte vornehmen.\`,
  rows: [
    { label: 'Vorgangs-ID', value: data.displayId },
    { label: 'Status', value: data.status },
  ],
  cta: { text: 'Im Portal oeffnen', url: \`\${APP_BASE_URL}/dashboard/mutterschutz/\${data.mutterschutzId || ''}\`, color: COLORS.gruen },
});
return [{ json: { to: '${HR_INTERN}', subject, html } }];
`,
  },
  // ── Beendet ─────────────────────────────────────────────────────────
  {
    path: "mutterschutz-beendet",
    nodeName: "Mutterschutz beendet",
    render: `
const data = $input.first().json || {};
const subject = \`Mutterschutz beendet: \${data.displayId || ''}\`;
const html = renderCredoMail({
  preheader: 'Schutzfrist ist abgelaufen.',
  badge: { text: 'Beendet', color: COLORS.primary },
  headline: 'Mutterschutz beendet',
  intro: \`Die Schutzfrist fuer <strong>\${escapeHtml(data.employeeName || '—')}</strong> ist abgelaufen. Bitte LOGA-Wiedereingliederung pruefen (Anschluss Elternzeit oder Rueckkehr).\`,
  rows: [
    { label: 'Vorgangs-ID', value: data.displayId },
    { label: 'Status', value: data.status },
  ],
  cta: { text: 'Im Portal oeffnen', url: \`\${APP_BASE_URL}/dashboard/mutterschutz/\${data.mutterschutzId || ''}\`, color: COLORS.primary },
});
return [{ json: { to: '${HR_INTERN}', subject, html } }];
`,
  },
];

const flow = buildFlow("CREDO HR-Portal — Mutterschutz-v3", EVENTS);
process.stdout.write(JSON.stringify(flow, null, 2));
