/**
 * Generator: n8n-Workflow CREDO-Elternzeit
 *
 * 13 Webhook-Events des Elternzeit-Moduls. Pro Event:
 *   1. Webhook → 2. Code-Render → 3. Outlook-Send
 *
 * Renderer-Library + Builder kommen aus generator-lib.js (geteilt mit
 * dem Mutterschutz-Generator). Pro neuem Event nur Eintrag in EVENTS hier.
 *
 * Aufruf:
 *   node scripts/n8n/generate-elternzeit-flow.js > n8n/CREDO-Elternzeit-v3.json
 *
 * Generator-Scripts sind versioniert (scripts/n8n/), die generierten
 * JSON-Outputs bleiben lokal in n8n/ (gitignored).
 */

const { HR_INTERN, buildFlow } = require("./generator-lib");

const EVENTS = [
  // ── Anlage ──────────────────────────────────────────────────────────
  {
    path: "elternzeit-angelegt",
    nodeName: "Elternzeit angelegt",
    render: `
const data = $input.first().json || {};
const subject = \`Neuer Elternzeit-Vorgang: \${data.employeeName || ''}\`;
const html = renderCredoMail({
  preheader: 'Neuer Elternzeit-Vorgang im HR-Portal angelegt.',
  badge: { text: 'Neu angelegt', color: COLORS.blau },
  headline: 'Neuer Elternzeit-Vorgang',
  intro: \`Im HR-Portal wurde ein neuer Elternzeit-Vorgang fuer <strong>\${escapeHtml(data.employeeName || '—')}</strong> angelegt.\`,
  rows: [
    { label: 'Mandant', value: data.organization },
    { label: 'Vorgangs-ID', value: data.displayId },
    { label: 'Voraussichtl. Geburt', value: formatDate(data.voraussGeburt) },
    { label: 'Personalgruppe', value: data.personalgruppe },
  ],
  cta: { text: 'Vorgang im Portal oeffnen', url: \`\${APP_BASE_URL}/dashboard/elternzeit/\${data.elternzeitId || ''}\`, color: COLORS.primary },
});
return [{ json: { to: '${HR_INTERN}', subject, html } }];
`,
  },
  // ── Magic-Link Vorl. ────────────────────────────────────────────────
  {
    path: "elternzeit-antrag-link-versandt",
    nodeName: "Vorl. Magic-Link versandt",
    render: `
const data = $input.first().json || {};
const recipient = data.recipientEmail || '${HR_INTERN}';
const subject = 'Antrag auf Elternzeit — bitte ausfuellen';
const html = renderCredoMail({
  preheader: 'Bitte fuellen Sie den vorlaeufigen Elternzeit-Antrag aus.',
  badge: { text: 'Aktion erforderlich', color: COLORS.gelb },
  headline: 'Antrag auf Elternzeit',
  intro: \`Liebe/r \${escapeHtml((data.recipientName || '').split(' ')[0] || 'Mitarbeiter/in')},<br/><br/>\` +
         \`bitte fuellen Sie den vorlaeufigen Elternzeit-Antrag ueber den folgenden Link aus. Der Link ist 30 Tage gueltig und kann nur einmal verwendet werden.\`,
  rows: [
    { label: 'Vorgangs-ID', value: data.displayId },
    { label: 'Gueltig bis', value: formatDate(data.expiresAt) },
  ],
  cta: { text: 'Antrag jetzt ausfuellen', url: data.magicUrl, color: COLORS.primary },
  footerNote: 'Der Link ist personenbezogen, einmalig nutzbar und 30 Tage gueltig.',
});
return [{ json: { to: recipient, subject, html } }];
`,
  },
  // ── Vorl. eingereicht ───────────────────────────────────────────────
  {
    path: "elternzeit-antrag-eingereicht",
    nodeName: "Vorl. Antrag eingereicht",
    render: `
const data = $input.first().json || {};
const subject = \`Elternzeit-Antrag eingegangen: \${data.employeeName || ''}\`;
const html = renderCredoMail({
  preheader: 'Vorlaeufiger Elternzeit-Antrag wurde eingereicht.',
  badge: { text: 'Eingegangen', color: COLORS.gruen },
  headline: 'Vorlaeufiger Antrag eingegangen',
  intro: \`Der vorlaeufige Elternzeit-Antrag von <strong>\${escapeHtml(data.employeeName || '—')}</strong> ist eingegangen und kann jetzt im HR-Portal geprueft werden.\`,
  rows: [
    { label: 'Vorgangs-ID', value: data.displayId },
    { label: 'Eingereicht am', value: formatDateTime(data.submittedAt) },
  ],
  cta: { text: 'Im Portal pruefen', url: \`\${APP_BASE_URL}/dashboard/elternzeit/\${data.elternzeitId || ''}\`, color: COLORS.blau },
});
return [{ json: { to: '${HR_INTERN}', subject, html } }];
`,
  },
  // ── Vorl. genehmigt ─────────────────────────────────────────────────
  {
    path: "elternzeit-vorl-genehmigt",
    nodeName: "Vorl. genehmigt",
    render: `
const data = $input.first().json || {};
const recipient = data.employeeEmail || '${HR_INTERN}';
const subject = 'Ihr Elternzeit-Antrag wurde vorlaeufig genehmigt';
const html = renderCredoMail({
  preheader: 'Vorlaeufige Genehmigung Ihres Elternzeit-Antrags.',
  badge: { text: 'Genehmigt (vorl.)', color: COLORS.gruen },
  headline: 'Vorlaeufige Genehmigung',
  intro: \`Ihr Elternzeit-Antrag wurde vorlaeufig genehmigt. Nach der Geburt benoetigen wir noch Ihre Geburtsurkunde fuer die endgueltige Genehmigung.\`,
  rows: [
    { label: 'Vorgangs-ID', value: data.displayId },
    { label: 'Genehmigt am', value: formatDate(data.genehmigungAm) },
  ],
  cta: { text: 'Im Portal ansehen', url: \`\${APP_BASE_URL}/dashboard/elternzeit/\${data.elternzeitId || ''}\`, color: COLORS.gruen },
});
return [{ json: { to: recipient, subject, html } }];
`,
  },
  // ── Vorl. abgelehnt ─────────────────────────────────────────────────
  {
    path: "elternzeit-vorl-abgelehnt",
    nodeName: "Vorl. abgelehnt",
    render: `
const data = $input.first().json || {};
const recipient = data.employeeEmail || '${HR_INTERN}';
const subject = 'Ihr Elternzeit-Antrag konnte nicht bearbeitet werden';
const html = renderCredoMail({
  preheader: 'Ablehnung Ihres Elternzeit-Antrags.',
  badge: { text: 'Abgelehnt', color: COLORS.rot },
  headline: 'Antrag abgelehnt',
  intro: \`Leider konnten wir Ihren Elternzeit-Antrag nicht bewilligen. Bitte wenden Sie sich an Ihre Personalabteilung fuer eine Klaerung.\`,
  rows: [
    { label: 'Vorgangs-ID', value: data.displayId },
    { label: 'Grund', value: data.grund },
  ],
});
return [{ json: { to: recipient, subject, html } }];
`,
  },
  // ── Leiter-Magic-Link ───────────────────────────────────────────────
  {
    path: "elternzeit-leiter-link-versandt",
    nodeName: "Leiter-Magic-Link versandt",
    render: `
const data = $input.first().json || {};
const recipient = data.leiterEmail || '${HR_INTERN}';
const subject = 'Bitte um Genehmigung: Elternzeit-Antrag';
const html = renderCredoMail({
  preheader: 'Bitte um Stellungnahme zu einem Elternzeit-Antrag.',
  badge: { text: 'Aktion erforderlich', color: COLORS.gelb },
  headline: 'Genehmigung Elternzeit-Antrag',
  intro: \`Sie werden gebeten, als Einrichtungsleitung zum Elternzeit-Antrag von <strong>\${escapeHtml(data.employeeName || '—')}</strong> Stellung zu nehmen.\`,
  rows: [
    { label: 'Vorgangs-ID', value: data.displayId },
    { label: 'Gueltig bis', value: formatDate(data.expiresAt) },
  ],
  cta: { text: 'Antrag pruefen', url: data.magicUrl, color: COLORS.primary },
  footerNote: 'Der Link ist personenbezogen, einmalig nutzbar.',
});
return [{ json: { to: recipient, subject, html } }];
`,
  },
  // ── Endg. genehmigt ─────────────────────────────────────────────────
  {
    path: "elternzeit-endg-genehmigt",
    nodeName: "Endg. genehmigt",
    render: `
const data = $input.first().json || {};
const recipient = data.employeeEmail || '${HR_INTERN}';
const subject = 'Ihre Elternzeit ist endgueltig genehmigt';
const html = renderCredoMail({
  preheader: 'Endgueltige Genehmigung Ihrer Elternzeit.',
  badge: { text: 'Endg. genehmigt', color: COLORS.gruen },
  headline: 'Herzlichen Glueckwunsch!',
  intro: \`Ihre Elternzeit wurde endgueltig genehmigt. Die offizielle Genehmigung finden Sie als PDF im HR-Portal.\`,
  rows: [
    { label: 'Vorgangs-ID', value: data.displayId },
    { label: 'Kind', value: data.kindName },
    { label: 'Geburtsdatum', value: formatDate(data.kindGeburtsdatum) },
  ],
  cta: { text: 'Genehmigung ansehen', url: \`\${APP_BASE_URL}/dashboard/elternzeit/\${data.elternzeitId || ''}\`, color: COLORS.gruen },
});
return [{ json: { to: recipient, subject, html } }];
`,
  },
  // ── Endg. abgelehnt ─────────────────────────────────────────────────
  {
    path: "elternzeit-endg-abgelehnt",
    nodeName: "Endg. abgelehnt",
    render: `
const data = $input.first().json || {};
const recipient = data.employeeEmail || '${HR_INTERN}';
const subject = 'Endgueltige Ablehnung Ihres Elternzeit-Antrags';
const html = renderCredoMail({
  preheader: 'Endgueltige Ablehnung Ihres Elternzeit-Antrags.',
  badge: { text: 'Abgelehnt', color: COLORS.rot },
  headline: 'Antrag endgueltig abgelehnt',
  intro: \`Leider konnten wir Ihren endgueltigen Elternzeit-Antrag nicht bewilligen. Bitte wenden Sie sich an Ihre Personalabteilung.\`,
  rows: [
    { label: 'Vorgangs-ID', value: data.displayId },
    { label: 'Grund', value: data.grund },
  ],
});
return [{ json: { to: recipient, subject, html } }];
`,
  },
  // ── BR Detmold-Brief generiert ──────────────────────────────────────
  {
    path: "elternzeit-br-detmold-generiert",
    nodeName: "BR-Detmold-Brief generiert",
    render: `
const data = $input.first().json || {};
const subject = \`BR-Detmold-Brief erzeugt: \${data.displayId || ''}\`;
const html = renderCredoMail({
  preheader: 'BR-Detmold-Schreiben wurde generiert.',
  badge: { text: 'Brief erzeugt', color: COLORS.blau },
  headline: 'BR-Detmold-Schreiben erzeugt',
  intro: \`Fuer den Vorgang <strong>\${escapeHtml(data.displayId || '—')}</strong> wurde ein BR-Detmold-Schreiben generiert. Bitte zeitnah an die Bezirksregierung Detmold, Dez. 41, weiterleiten.\`,
  rows: [
    { label: 'Vorgang', value: data.displayId },
    { label: 'Mitarbeiter/in', value: data.employeeName },
  ],
  cta: { text: 'Brief im Portal oeffnen', url: \`\${APP_BASE_URL}/dashboard/elternzeit/\${data.elternzeitId || ''}\`, color: COLORS.blau },
});
return [{ json: { to: '${HR_INTERN}', subject, html } }];
`,
  },
  // ── VBL-Info-Brief generiert ────────────────────────────────────────
  {
    path: "elternzeit-vbl-generiert",
    nodeName: "VBL-Info-Brief generiert",
    render: `
const data = $input.first().json || {};
const subject = \`VBL-Info-Brief erzeugt: \${data.displayId || ''}\`;
const html = renderCredoMail({
  preheader: 'VBL-Info-Brief wurde generiert.',
  badge: { text: 'Brief erzeugt', color: COLORS.blau },
  headline: 'VBL-Informationsbrief erzeugt',
  intro: \`Fuer den TV-L-Vorgang <strong>\${escapeHtml(data.displayId || '—')}</strong> wurde ein VBL-Info-Brief erzeugt.\`,
  rows: [
    { label: 'Vorgang', value: data.displayId },
    { label: 'Mitarbeiter/in', value: data.employeeName },
  ],
  cta: { text: 'Brief im Portal oeffnen', url: \`\${APP_BASE_URL}/dashboard/elternzeit/\${data.elternzeitId || ''}\`, color: COLORS.blau },
});
return [{ json: { to: '${HR_INTERN}', subject, html } }];
`,
  },
  // ── AG-Bescheinigung Elterngeld ─────────────────────────────────────
  {
    path: "elternzeit-ag-bescheinigung-generiert",
    nodeName: "AG-Bescheinigung generiert",
    render: `
const data = $input.first().json || {};
const subject = \`AG-Bescheinigung Elterngeld erzeugt: \${data.displayId || ''}\`;
const html = renderCredoMail({
  preheader: 'AG-Bescheinigung Elterngeld wurde generiert.',
  badge: { text: 'Brief erzeugt', color: COLORS.blau },
  headline: 'AG-Bescheinigung Elterngeld',
  intro: \`Fuer den Vorgang <strong>\${escapeHtml(data.displayId || '—')}</strong> wurde die AG-Bescheinigung fuer das Elterngeld generiert. Bitte an die Elterngeldstelle weiterleiten.\`,
  rows: [
    { label: 'Vorgang', value: data.displayId },
    { label: 'Mitarbeiter/in', value: data.employeeName },
  ],
  cta: { text: 'Bescheinigung oeffnen', url: \`\${APP_BASE_URL}/dashboard/elternzeit/\${data.elternzeitId || ''}\`, color: COLORS.blau },
});
return [{ json: { to: '${HR_INTERN}', subject, html } }];
`,
  },
  // ── BR-Genehmigung eingegangen ──────────────────────────────────────
  {
    path: "elternzeit-br-genehmigung-eingegangen",
    nodeName: "BR-Genehmigung eingegangen",
    render: `
const data = $input.first().json || {};
const subject = \`BR-Genehmigung eingegangen: \${data.displayId || ''}\`;
const html = renderCredoMail({
  preheader: 'Bezirksregierung Detmold hat die Elternzeit genehmigt.',
  badge: { text: 'Eingegangen', color: COLORS.gruen },
  headline: 'BR-Detmold Genehmigung eingegangen',
  intro: \`Die Bezirksregierung Detmold hat die Genehmigung fuer den Vorgang <strong>\${escapeHtml(data.displayId || '—')}</strong> erteilt.\`,
  rows: [
    { label: 'Vorgang', value: data.displayId },
    { label: 'Aktenzeichen', value: data.aktenzeichen },
    { label: 'Eingang am', value: formatDate(data.eingangAm) },
  ],
  cta: { text: 'Im Portal oeffnen', url: \`\${APP_BASE_URL}/dashboard/elternzeit/\${data.elternzeitId || ''}\`, color: COLORS.gruen },
});
return [{ json: { to: '${HR_INTERN}', subject, html } }];
`,
  },
  // ── Frist-Eskalation (Cron) ─────────────────────────────────────────
  {
    path: "elternzeit-frist-eskaliert",
    nodeName: "Frist eskaliert",
    render: `
const data = $input.first().json || {};
const sevColor = data.severity === 'OVERDUE' ? COLORS.rot
                 : data.severity === 'URGENT' ? COLORS.rot
                 : data.severity === 'WARNING' ? COLORS.gelb : COLORS.blau;
const sevLabel = data.severity === 'OVERDUE' ? 'Ueberfaellig'
                 : data.severity === 'URGENT' ? 'Dringend'
                 : data.severity === 'WARNING' ? 'Warnung' : 'Info';
const subject = \`[\${sevLabel}] Frist eskaliert: \${data.fristTyp || ''}\`;
const html = renderCredoMail({
  preheader: \`Eskalation einer Elternzeit-Frist (\${sevLabel}).\`,
  badge: { text: sevLabel, color: sevColor },
  headline: 'Frist erfordert Aufmerksamkeit',
  intro: \`Eine Frist im Elternzeit-Vorgang wurde eskaliert (\${sevLabel}).\`,
  rows: [
    { label: 'Vorgang', value: data.displayId },
    { label: 'Frist-Typ', value: data.fristTyp },
    { label: 'Bezeichnung', value: data.bezeichnung },
    { label: 'Faellig am', value: formatDate(data.faelligAm) },
    { label: 'Verbleibende Tage', value: data.verbleibendeTage !== undefined ? String(data.verbleibendeTage) : '' },
  ],
  cta: { text: 'Im Portal oeffnen', url: \`\${APP_BASE_URL}/dashboard/elternzeit/\${data.elternzeitId || ''}\`, color: sevColor },
});
return [{ json: { to: '${HR_INTERN}', subject, html } }];
`,
  },
];

const flow = buildFlow("CREDO HR-Portal — Elternzeit-v3", EVENTS);
process.stdout.write(JSON.stringify(flow, null, 2));
