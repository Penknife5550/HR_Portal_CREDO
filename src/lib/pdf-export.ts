/**
 * CREDO HR-Portal – PDF-Export fuer Verbeamtungsvorgaenge
 *
 * Erzeugt PDF-Dokumente mit Swiss QR Code auf jeder Deckblatt-Seite.
 * QR-Code Inhalt: Mandantennummer | Nachname, Vorname | Personalnummer | Dokumenttyp
 *
 * Nutzt PDFKit fuer serverseitige PDF-Generierung.
 */

import PDFDocument from "pdfkit";
import QRCode from "qrcode";

// =============================================
// Typen
// =============================================

export interface ExportContext {
  // Mitarbeiter
  firstName: string;
  lastName: string;
  email: string;
  personalNr: string | null;
  // Organisation
  organizationName: string;
  mandantNumber: string;
  // Vorgang
  displayId: string;
  status: string;
  currentStep: number;
  createdAt: string;
  targetStartDate: string | null;
  // Daten
  prerequisites: PrerequisiteItem[] | null;
  applicationData: ApplicationData | null;
  applicationSubmittedAt: string | null;
  assessments: AssessmentExport[];
  checklistItems: ChecklistExport[];
  stakeholders: StakeholderExport | null;
}

interface PrerequisiteItem {
  key: string;
  label: string;
  met: boolean;
  value?: string;
  details?: string;
}

interface ApplicationData {
  [key: string]: unknown;
  employeeStatement?: string;
}

interface AssessmentExport {
  assessmentNumber: number;
  assessmentType: string; // BEURTEILUNG | REFERENZ
  status: string;
  recipientEmail: string;
  recipientName: string | null;
  overallGrade: number | null;
  meetsRequirements: boolean | null;
  ratingsData: Record<string, number> | null;
  referenceData: Record<string, string> | null;
  gemeindeReferenz: string | null;
  templateSnapshot: TemplateSnapshot | null;
  submittedAt: string | null;
}

interface TemplateSnapshot {
  categories: {
    id: string;
    name: string;
    weight: number;
    orderIndex: number;
    criteria: {
      id: string;
      name: string;
      description: string;
      weight: number;
      orderIndex: number;
    }[];
  }[];
}

interface ChecklistExport {
  step: string;
  phase: string;
  category: string;
  title: string;
  assignee: string;
  isGatekeeper: boolean;
  isCompleted: boolean;
  completedAt: string | null;
  notes: string | null;
  dueDate: string | null;
}

interface StakeholderExport {
  schulleitung?: { name?: string; email: string };
  amtsarzt?: { email: string };
  beirat?: { email: string };
}

// =============================================
// Farben (CREDO)
// =============================================

const COLORS = {
  primary: "#575756",
  gruen: "#6BAA24",
  gelb: "#FBC900",
  rot: "#E2001A",
  blau: "#009AC6",
  gray: "#999999",
  lightGray: "#E5E5E5",
  white: "#FFFFFF",
  black: "#000000",
};

// =============================================
// Hilfsfunktionen
// =============================================

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

const ASSIGNEE_LABELS: Record<string, string> = {
  HR: "Personalverwaltung",
  SL: "Schulleitung",
  LK: "Lehrkraft",
  EXTERN: "Extern",
  BEIRAT: "Beirat",
};

const PHASE_LABELS: Record<string, string> = {
  I: "Phase I: Antrag & Beurteilung",
  II_A: "Phase II-A: Amtsarzt",
  II_B: "Phase II-B: Besoldung",
  II_C: "Phase II-C: Vertrag & BR",
  II_D: "Phase II-D: Krankenversicherung",
  II_E: "Phase II-E: Beihilfe",
  II_F: "Phase II-F: RV-Befreiung",
  II_G: "Phase II-G: Kuendigung & LOGA",
  II_H: "Phase II-H: Riester, Foerderverein, Info",
  III: "Phase III: Probezeit",
  IV: "Phase IV: Uebernahme auf Lebenszeit",
};

const PREREQUISITE_LABELS: Record<string, string> = {
  hasUnlimitedContract: "Unbefristeter Arbeitsvertrag",
  intendedLongTermStay: "Langfristige Mitarbeit (10+ Jahre)",
  workloadPercent: "Mindestens 75% Stellenumfang",
  dienstlicheBeurteilung: "Dienstliche Beurteilung < 3,0",
  activeCommunityMembership: "Aktive Gemeindemitgliedschaft",
  biblischeIntegration: "Biblische Integration",
  vebsSeminarCompleted: "VEBS-Grundlagenseminar",
  statusErfueller: "Status Erfueller (2. Staatsexamen)",
  subjectCombination: "Notwendige Faecherkombination",
  foerdervereinMember: "Foerderverein-Mitgliedschaft",
  empfehlungSchulleitung: "Empfehlung Schulleitung",
  amtsaerztlicheUntersuchung: "Amtsaerztliche Gesundheitsuntersuchung",
};

const REFERENZ_LABELS: Record<string, string> = {
  andachtsbesuch: "Regelmaessiger Andachtsbesuch",
  "vollzeit-perspektive": "Perspektive Vollzeit / mind. 75%",
  belastbarkeit: "Belastbarkeit",
  "gutes-miteinander": "Gutes Miteinander (Kollegium, Schueler, Eltern)",
  "besondere-aufgaben": "Bereitschaft besondere Aufgaben zu uebernehmen",
  klassenleitung: "Klassenleitung uebernommen",
  "engagement-schule": "Engagement fuer Schule sichtbar",
  "identifikation-fes": "Identifikation mit Grundsaetzen FES Minden",
  "grundsaetze-gelebt": "Grundsaetze der FES werden gelebt",
  zielvereinbarungen: "Zielvereinbarungen vereinbart",
  gemeindemitgliedschaft: "Aktive Gemeindemitgliedschaft",
  "mitarbeit-gemeinde": "Mitarbeit in der Gemeinde",
};

// =============================================
// QR Code generieren
// =============================================

async function generateQRDataUri(content: string): Promise<string> {
  return QRCode.toDataURL(content, {
    errorCorrectionLevel: "M",
    type: "image/png",
    width: 200,
    margin: 1,
    color: {
      dark: COLORS.primary,
      light: COLORS.white,
    },
  });
}

function buildQRContent(
  ctx: ExportContext,
  docType: string,
): string {
  // Swiss QR Format: strukturierte Daten mit Zeilenumbruch-Trennung
  const lines = [
    "SPC",                           // Swiss Payment Code Header
    "0200",                          // Version
    "1",                             // Coding (UTF-8)
    ctx.mandantNumber,               // Mandantennummer
    `${ctx.lastName}, ${ctx.firstName}`, // Name
    ctx.personalNr || "OHNE-NR",     // Personalnummer
    ctx.displayId,                   // Vorgangs-ID
    docType,                         // Dokumenttyp
    formatDate(new Date().toISOString()), // Exportdatum
  ];
  return lines.join("\n");
}

// =============================================
// Deckblatt mit QR Code
// =============================================

async function addCoverPage(
  doc: PDFKit.PDFDocument,
  ctx: ExportContext,
  docType: string,
  docTitle: string,
): Promise<void> {
  const qrContent = buildQRContent(ctx, docType);
  const qrDataUri = await generateQRDataUri(qrContent);

  // QR-Code als Buffer
  const qrBuffer = Buffer.from(qrDataUri.split(",")[1], "base64");

  // Header-Linie
  doc
    .rect(50, 40, 515, 3)
    .fill(COLORS.primary);

  // Titel
  doc
    .font("Helvetica-Bold")
    .fontSize(22)
    .fillColor(COLORS.primary)
    .text("CREDO HR-Portal", 50, 60);

  doc
    .font("Helvetica")
    .fontSize(14)
    .fillColor(COLORS.gray)
    .text("Verbeamtungsakte (PSI)", 50, 88);

  // Farbige Linie (CREDO-Farben)
  const lineY = 115;
  const lineW = 515 / 4;
  doc.rect(50, lineY, lineW, 2).fill(COLORS.gelb);
  doc.rect(50 + lineW, lineY, lineW, 2).fill(COLORS.gruen);
  doc.rect(50 + lineW * 2, lineY, lineW, 2).fill(COLORS.rot);
  doc.rect(50 + lineW * 3, lineY, lineW, 2).fill(COLORS.blau);

  // Dokumenttyp
  doc
    .font("Helvetica-Bold")
    .fontSize(18)
    .fillColor(COLORS.black)
    .text(docTitle, 50, 140);

  // QR Code (rechts)
  doc.image(qrBuffer, 390, 170, { width: 160, height: 160 });

  // QR-Beschriftung
  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor(COLORS.gray)
    .text("DMS-Zuordnung (QR-Code)", 390, 335, { width: 160, align: "center" });

  // Mitarbeiter-Daten (links neben QR)
  const dataX = 50;
  let dataY = 180;
  const rowH = 22;

  const infoRows = [
    ["Vorgangs-ID", ctx.displayId],
    ["Mandant", `${ctx.mandantNumber} — ${ctx.organizationName}`],
    ["Name", `${ctx.firstName} ${ctx.lastName}`],
    ["E-Mail", ctx.email],
    ["Personalnr.", ctx.personalNr || "—"],
    ["Startdatum", formatDate(ctx.targetStartDate)],
    ["Erstellt am", formatDate(ctx.createdAt)],
    ["Exportiert am", formatDate(new Date().toISOString())],
  ];

  for (const [label, value] of infoRows) {
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor(COLORS.gray)
      .text(label, dataX, dataY);
    doc
      .font("Helvetica-Bold")
      .fontSize(10)
      .fillColor(COLORS.black)
      .text(value, dataX + 90, dataY);
    dataY += rowH;
  }

  // Beteiligte
  if (ctx.stakeholders) {
    dataY += 10;
    doc
      .font("Helvetica-Bold")
      .fontSize(11)
      .fillColor(COLORS.primary)
      .text("Beteiligte", dataX, dataY);
    dataY += 18;

    if (ctx.stakeholders.schulleitung) {
      doc.font("Helvetica").fontSize(9).fillColor(COLORS.gray).text("Schulleitung:", dataX, dataY);
      doc.font("Helvetica-Bold").fontSize(9).fillColor(COLORS.black)
        .text(`${ctx.stakeholders.schulleitung.name || ""} (${ctx.stakeholders.schulleitung.email})`, dataX + 90, dataY);
      dataY += 16;
    }
    if (ctx.stakeholders.amtsarzt) {
      doc.font("Helvetica").fontSize(9).fillColor(COLORS.gray).text("Amtsarzt:", dataX, dataY);
      doc.font("Helvetica-Bold").fontSize(9).fillColor(COLORS.black).text(ctx.stakeholders.amtsarzt.email, dataX + 90, dataY);
      dataY += 16;
    }
    if (ctx.stakeholders.beirat) {
      doc.font("Helvetica").fontSize(9).fillColor(COLORS.gray).text("Beirat:", dataX, dataY);
      doc.font("Helvetica-Bold").fontSize(9).fillColor(COLORS.black).text(ctx.stakeholders.beirat.email, dataX + 90, dataY);
      dataY += 16;
    }
  }

  // Footer-Linie
  doc
    .rect(50, 750, 515, 1)
    .fill(COLORS.lightGray);
  doc
    .font("Helvetica")
    .fontSize(7)
    .fillColor(COLORS.gray)
    .text(
      `CREDO HR-Portal | ${ctx.displayId} | ${docTitle} | Seite 1`,
      50, 758,
      { width: 515, align: "center" }
    );
}

// =============================================
// Seitenheader (fuer Folgeseiten)
// =============================================

function addPageHeader(doc: PDFKit.PDFDocument, ctx: ExportContext, docTitle: string): void {
  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor(COLORS.gray)
    .text(`${ctx.displayId} — ${ctx.firstName} ${ctx.lastName} — ${docTitle}`, 50, 30, { width: 515, align: "right" });
  doc
    .rect(50, 45, 515, 0.5)
    .fill(COLORS.lightGray);
}

function sectionTitle(doc: PDFKit.PDFDocument, title: string, y?: number): number {
  const posY = y || doc.y + 15;
  doc
    .font("Helvetica-Bold")
    .fontSize(13)
    .fillColor(COLORS.primary)
    .text(title, 50, posY);
  doc
    .rect(50, posY + 18, 515, 1)
    .fill(COLORS.blau);
  return posY + 28;
}

function checkPageBreak(doc: PDFKit.PDFDocument, needed: number, ctx: ExportContext, title: string): void {
  if (doc.y + needed > 720) {
    doc.addPage();
    addPageHeader(doc, ctx, title);
    doc.y = 55;
  }
}

// =============================================
// Antrag-Seiten
// =============================================

async function addAntragPages(doc: PDFKit.PDFDocument, ctx: ExportContext, isFirstPage = false): Promise<void> {
  if (!isFirstPage) doc.addPage();
  await addCoverPage(doc, ctx, "ANTRAG", "Antrag — Voraussetzungen");

  doc.addPage();
  addPageHeader(doc, ctx, "Antrag");

  let y = sectionTitle(doc, "12 Voraussetzungen", 55);

  if (ctx.applicationSubmittedAt) {
    doc.font("Helvetica").fontSize(9).fillColor(COLORS.gruen)
      .text(`Eingereicht am: ${formatDate(ctx.applicationSubmittedAt)}`, 50, y);
    y += 18;
  }

  // Voraussetzungen
  const prereqs = Array.isArray(ctx.prerequisites) ? ctx.prerequisites : [];
  for (const p of prereqs) {
    checkPageBreak(doc, 30, ctx, "Antrag");
    y = doc.y;

    const icon = p.met ? "\u2713" : "\u2717";
    const iconColor = p.met ? COLORS.gruen : COLORS.rot;

    doc.font("Helvetica-Bold").fontSize(10).fillColor(iconColor).text(icon, 50, y);
    doc.font("Helvetica").fontSize(10).fillColor(COLORS.black)
      .text(PREREQUISITE_LABELS[p.key] || p.label || p.key, 68, y, { width: 460 });
    y = doc.y + 4;

    if (p.details || p.value) {
      doc.font("Helvetica").fontSize(8).fillColor(COLORS.gray)
        .text(String(p.details || p.value), 68, y, { width: 460 });
      y = doc.y + 4;
    }

    doc.y = y + 2;
  }

  // Persoenliche Erklaerung
  if (ctx.applicationData?.employeeStatement) {
    checkPageBreak(doc, 60, ctx, "Antrag");
    const sy = sectionTitle(doc, "Persoenliche Erklaerung");
    doc.font("Helvetica").fontSize(10).fillColor(COLORS.black)
      .text(String(ctx.applicationData.employeeStatement), 50, sy, { width: 515 });
  }
}

// =============================================
// Beurteilungs-Seiten
// =============================================

async function addBeurteilungPages(doc: PDFKit.PDFDocument, ctx: ExportContext, assessment: AssessmentExport, isFirstPage = false): Promise<void> {
  if (!isFirstPage) doc.addPage();
  await addCoverPage(doc, ctx, `BEURTEILUNG_${assessment.assessmentNumber}`,
    `${assessment.assessmentNumber}. Dienstliche Beurteilung`);

  doc.addPage();
  addPageHeader(doc, ctx, `${assessment.assessmentNumber}. Beurteilung`);

  let y = sectionTitle(doc, "Beurteilungsergebnis", 55);

  // Meta
  doc.font("Helvetica").fontSize(9).fillColor(COLORS.gray).text("Schulleitung:", 50, y);
  doc.font("Helvetica-Bold").fontSize(9).fillColor(COLORS.black)
    .text(`${assessment.recipientName || "—"} (${assessment.recipientEmail})`, 140, y);
  y += 16;

  doc.font("Helvetica").fontSize(9).fillColor(COLORS.gray).text("Eingereicht:", 50, y);
  doc.font("Helvetica-Bold").fontSize(9).fillColor(COLORS.black)
    .text(formatDate(assessment.submittedAt), 140, y);
  y += 16;

  // Gesamtnote
  if (assessment.overallGrade !== null) {
    doc.font("Helvetica").fontSize(9).fillColor(COLORS.gray).text("Gesamtnote:", 50, y);
    const gradeColor = assessment.overallGrade < 3.0 ? COLORS.gruen : COLORS.rot;
    doc.font("Helvetica-Bold").fontSize(14).fillColor(gradeColor)
      .text(assessment.overallGrade.toFixed(2), 140, y - 2);
    y += 20;

    const reqLabel = assessment.meetsRequirements ? "Ja" : "Nein";
    const reqColor = assessment.meetsRequirements ? COLORS.gruen : COLORS.rot;
    doc.font("Helvetica").fontSize(9).fillColor(COLORS.gray).text("Anforderungen erfuellt:", 50, y);
    doc.font("Helvetica-Bold").fontSize(10).fillColor(reqColor).text(reqLabel, 170, y);
    y += 25;
  }

  // Kategorien + Kriterien
  const template = assessment.templateSnapshot;
  const ratings = assessment.ratingsData || {};

  if (template?.categories) {
    for (const cat of template.categories.sort((a, b) => a.orderIndex - b.orderIndex)) {
      checkPageBreak(doc, 80, ctx, `${assessment.assessmentNumber}. Beurteilung`);
      y = doc.y;

      // Kategorie-Header
      doc.rect(50, y, 515, 22).fill("#F5F5F5");
      doc.font("Helvetica-Bold").fontSize(10).fillColor(COLORS.primary)
        .text(cat.name, 58, y + 5, { width: 350 });

      // Kategorie-Durchschnitt
      const catRatings = cat.criteria.map((c) => ratings[c.id]).filter((r) => r !== undefined && r !== null);
      if (catRatings.length > 0) {
        const avg = catRatings.reduce((a, b) => a + b, 0) / catRatings.length;
        const avgColor = avg < 3.0 ? COLORS.gruen : COLORS.rot;
        doc.font("Helvetica-Bold").fontSize(11).fillColor(avgColor)
          .text(avg.toFixed(1), 500, y + 5, { width: 60, align: "right" });
      }

      y += 28;

      for (const crit of cat.criteria.sort((a, b) => a.orderIndex - b.orderIndex)) {
        checkPageBreak(doc, 20, ctx, `${assessment.assessmentNumber}. Beurteilung`);
        y = doc.y;

        const rating = ratings[crit.id];
        doc.font("Helvetica").fontSize(9).fillColor(COLORS.black)
          .text(crit.name, 68, y, { width: 350 });
        doc.font("Helvetica").fontSize(8).fillColor(COLORS.gray)
          .text(crit.description, 68, y + 12, { width: 350 });

        if (rating !== undefined && rating !== null) {
          const rColor = rating < 3.0 ? COLORS.gruen : rating < 4.0 ? COLORS.gelb : COLORS.rot;
          doc.font("Helvetica-Bold").fontSize(11).fillColor(rColor)
            .text(String(rating), 510, y, { width: 50, align: "right" });
        } else {
          doc.font("Helvetica").fontSize(9).fillColor(COLORS.gray)
            .text("—", 510, y, { width: 50, align: "right" });
        }

        y += 28;
        doc.y = y;
      }
    }
  }
}

// =============================================
// Referenz-Seiten
// =============================================

async function addReferenzPages(doc: PDFKit.PDFDocument, ctx: ExportContext, assessment: AssessmentExport, isFirstPage = false): Promise<void> {
  if (!isFirstPage) doc.addPage();
  await addCoverPage(doc, ctx, `REFERENZ_${assessment.assessmentNumber}`,
    `${assessment.assessmentNumber}. Schriftliche Referenz`);

  doc.addPage();
  addPageHeader(doc, ctx, `${assessment.assessmentNumber}. Referenz`);

  let y = sectionTitle(doc, "Referenz-Antworten", 55);

  // Meta
  doc.font("Helvetica").fontSize(9).fillColor(COLORS.gray).text("Schulleitung:", 50, y);
  doc.font("Helvetica-Bold").fontSize(9).fillColor(COLORS.black)
    .text(`${assessment.recipientName || "—"} (${assessment.recipientEmail})`, 140, y);
  y += 16;
  doc.font("Helvetica").fontSize(9).fillColor(COLORS.gray).text("Eingereicht:", 50, y);
  doc.font("Helvetica-Bold").fontSize(9).fillColor(COLORS.black)
    .text(formatDate(assessment.submittedAt), 140, y);
  y += 25;

  const refData = assessment.referenceData || {};

  for (const [key, label] of Object.entries(REFERENZ_LABELS)) {
    checkPageBreak(doc, 30, ctx, `${assessment.assessmentNumber}. Referenz`);
    y = doc.y;

    const answer = refData[key] || "—";
    const answerColor = answer === "Ja" ? COLORS.gruen : answer === "Nein" ? COLORS.rot : COLORS.gelb;

    doc.font("Helvetica").fontSize(9).fillColor(COLORS.black)
      .text(label, 50, y, { width: 380 });
    doc.font("Helvetica-Bold").fontSize(10).fillColor(answerColor)
      .text(answer, 440, y, { width: 120, align: "right" });

    y = doc.y + 6;
    doc.rect(50, y, 515, 0.5).fill(COLORS.lightGray);
    y += 4;
    doc.y = y;
  }

  // Gemeinde-Referenz
  if (assessment.gemeindeReferenz) {
    checkPageBreak(doc, 60, ctx, `${assessment.assessmentNumber}. Referenz`);
    const sy = sectionTitle(doc, "Gemeinde-Referenz");
    doc.font("Helvetica").fontSize(10).fillColor(COLORS.black)
      .text(assessment.gemeindeReferenz, 50, sy, { width: 515 });
  }
}

// =============================================
// Checkliste-Seiten
// =============================================

async function addChecklistePages(doc: PDFKit.PDFDocument, ctx: ExportContext, isFirstPage = false): Promise<void> {
  if (!isFirstPage) doc.addPage();
  await addCoverPage(doc, ctx, "CHECKLISTE", "Checkliste — 62 Punkte");

  doc.addPage();
  addPageHeader(doc, ctx, "Checkliste");

  // Nach Phase gruppieren
  const byPhase: Record<string, ChecklistExport[]> = {};
  for (const item of ctx.checklistItems) {
    if (!byPhase[item.phase]) byPhase[item.phase] = [];
    byPhase[item.phase].push(item);
  }

  const phaseOrder = ["I", "II_A", "II_B", "II_C", "II_D", "II_E", "II_F", "II_G", "II_H", "III", "IV"];

  let firstPhase = true;
  for (const phaseKey of phaseOrder) {
    const items = byPhase[phaseKey];
    if (!items) continue;

    const completed = items.filter((i) => i.isCompleted).length;
    const phaseName = PHASE_LABELS[phaseKey] || phaseKey;

    checkPageBreak(doc, 40, ctx, "Checkliste");
    const y = doc.y + (firstPhase ? 0 : 8);
    firstPhase = false;

    // Phase-Header
    doc.rect(50, y, 515, 22).fill("#F0F0F0");
    doc.font("Helvetica-Bold").fontSize(10).fillColor(COLORS.primary)
      .text(phaseName, 58, y + 5, { width: 380 });
    doc.font("Helvetica-Bold").fontSize(10)
      .fillColor(completed === items.length ? COLORS.gruen : COLORS.gray)
      .text(`${completed}/${items.length}`, 460, y + 5, { width: 100, align: "right" });

    doc.y = y + 28;

    for (const item of items) {
      checkPageBreak(doc, item.notes ? 40 : 22, ctx, "Checkliste");
      const iy = doc.y;

      const icon = item.isCompleted ? "\u2713" : "\u2610";
      const iconColor = item.isCompleted ? COLORS.gruen : COLORS.gray;

      doc.font("Helvetica-Bold").fontSize(9).fillColor(iconColor).text(icon, 55, iy);

      const titleColor = item.isCompleted ? COLORS.gray : COLORS.black;
      doc.font("Helvetica").fontSize(9).fillColor(titleColor)
        .text(item.title, 72, iy, { width: 340 });

      // Assignee
      doc.font("Helvetica").fontSize(7).fillColor(COLORS.blau)
        .text(ASSIGNEE_LABELS[item.assignee] || item.assignee, 420, iy, { width: 60 });

      // Datum
      if (item.isCompleted && item.completedAt) {
        doc.font("Helvetica").fontSize(7).fillColor(COLORS.gray)
          .text(formatDate(item.completedAt), 485, iy, { width: 80, align: "right" });
      }

      let ny = doc.y + 2;

      // Notiz
      if (item.notes) {
        doc.rect(72, ny, 400, 0.5).fill(COLORS.gelb);
        ny += 3;
        doc.font("Helvetica").fontSize(8).fillColor(COLORS.primary)
          .text(`Notiz: ${item.notes}`, 72, ny, { width: 440 });
        ny = doc.y + 4;
      }

      doc.y = ny + 2;
    }
  }
}

// =============================================
// Oeffentliche Export-Funktionen
// =============================================

export type ExportType = "gesamtakte" | "antrag" | "beurteilung" | "referenz" | "checkliste";

export async function generateExportPDF(
  ctx: ExportContext,
  type: ExportType,
  nr?: number,
): Promise<Buffer> {
  const doc = new PDFDocument({
    size: "A4",
    margin: 50,
    info: {
      Title: `${ctx.displayId} — ${type}`,
      Author: "CREDO HR-Portal",
      Subject: `Verbeamtungsakte ${ctx.firstName} ${ctx.lastName}`,
    },
  });

  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));

  // Erste Seite entfernen (PDFKit erstellt automatisch eine)
  // Wir fuegen unsere eigenen Seiten hinzu

  switch (type) {
    case "antrag":
      await addAntragPages(doc, ctx, true);
      break;

    case "beurteilung": {
      const beurteilung = ctx.assessments.find(
        (a) => a.assessmentType === "BEURTEILUNG" && a.assessmentNumber === (nr || 1)
      );
      if (beurteilung) {
        await addBeurteilungPages(doc, ctx, beurteilung, true);
      }
      break;
    }

    case "referenz": {
      const referenz = ctx.assessments.find(
        (a) => a.assessmentType === "REFERENZ" && a.assessmentNumber === (nr || 1)
      );
      if (referenz) {
        await addReferenzPages(doc, ctx, referenz, true);
      }
      break;
    }

    case "checkliste":
      await addChecklistePages(doc, ctx, true);
      break;

    case "gesamtakte":
      // Alle Dokumente hintereinander
      await addAntragPages(doc, ctx, true);

      for (const a of ctx.assessments.filter((a) => a.assessmentType === "BEURTEILUNG").sort((a, b) => a.assessmentNumber - b.assessmentNumber)) {
        await addBeurteilungPages(doc, ctx, a);
      }
      for (const a of ctx.assessments.filter((a) => a.assessmentType === "REFERENZ").sort((a, b) => a.assessmentNumber - b.assessmentNumber)) {
        await addReferenzPages(doc, ctx, a);
      }
      await addChecklistePages(doc, ctx);
      break;
  }

  // Die automatisch erstellte erste leere Seite entfernen
  // PDFKit hat leider keinen einfachen Weg dafuer, also arbeiten wir damit

  doc.end();

  return new Promise((resolve) => {
    doc.on("end", () => {
      resolve(Buffer.concat(chunks));
    });
  });
}
