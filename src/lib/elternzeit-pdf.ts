/**
 * CREDO HR-Portal — PDF-Generator Elternzeit
 *
 * Phase 1 MVP: Vorläufige Genehmigung (Mutter- und Vater-Version).
 * Verwendet Helvetica (PDFKit-Standard) — Montserrat in Phase 2 als TTF.
 *
 * QR-Code wie bei Verbeamtung (Swiss-DMS-Format):
 *   Mandantennummer | Nachname, Vorname | Personalnummer | DisplayId | Dokumenttyp | Datum
 */

import PDFDocument from "pdfkit";
import QRCode from "qrcode";

// CREDO Corporate Design (KEINE Farbverlaeufe)
const COLORS = {
  primary: "#575756", // Dunkelgrau
  gruen: "#6BAA24",
  gelb: "#FBC900",
  rot: "#E2001A",
  blau: "#009AC6",
  gray: "#999999",
  lightGray: "#E5E5E5",
  white: "#FFFFFF",
  black: "#000000",
};

export interface ElternzeitPdfContext {
  // Mitarbeiter
  firstName: string;
  lastName: string;
  email: string;
  personalNr: string | null;
  adresseStrasse: string | null;
  adressePlz: string | null;
  adresseOrt: string | null;
  dienstbezeichnung: string | null;
  schulnummer: string | null;
  // Organisation
  organizationName: string;
  mandantNumber: string;
  // Vorgang
  displayId: string;
  geschlecht: "MUTTER" | "VATER";
  personalgruppe: "TARIF_TV_L" | "BEAMTER" | "PLANSTELLENINHABER";
  kindNummer: number;
  betreuungsabsicht: string | null;
  gleichzeitigeEZ: boolean;
  // Abschnitte
  abschnitte: {
    abschnittNr: number;
    von: Date;
    bis: Date;
    uebertragung3bis8: boolean;
    teilzeit: boolean;
    teilzeitStunden: number | null;
  }[];
  // Genehmigung
  genehmigungAm: Date;
  genehmigungVon: string;
}

function formatDate(d: Date | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function buildQRContent(ctx: ElternzeitPdfContext): string {
  // Swiss-DMS-Format wie bei Verbeamtung
  return [
    "SPC",
    "0200",
    "1",
    ctx.mandantNumber,
    `${ctx.lastName}, ${ctx.firstName}`,
    ctx.personalNr || "OHNE-NR",
    ctx.displayId,
    "GENEHMIGUNG_VORLAEUFIG_ELTERNZEIT",
    formatDate(new Date()),
  ].join("\n");
}

async function generateQRBuffer(content: string): Promise<Buffer> {
  const dataUri = await QRCode.toDataURL(content, {
    errorCorrectionLevel: "M",
    type: "image/png",
    width: 200,
    margin: 1,
    color: { dark: COLORS.primary, light: COLORS.white },
  });
  return Buffer.from(dataUri.split(",")[1], "base64");
}

/**
 * Erzeugt das PDF "Vorläufige Genehmigung Elternzeit" als Buffer.
 *
 * Mutter-Version: Bezug auf Mutterschutz, weibliche Anrede.
 * Vater-Version: kein Mutterschutz, maennliche Anrede.
 */
export async function generateVorlaeufigeGenehmigungPdf(
  ctx: ElternzeitPdfContext,
): Promise<Buffer> {
  const isMutter = ctx.geschlecht === "MUTTER";
  const anrede = isMutter ? "Sehr geehrte Frau" : "Sehr geehrter Herr";
  const personenform = isMutter ? "Mitarbeiterin" : "Mitarbeiter";

  const doc = new PDFDocument({
    size: "A4",
    margin: 50,
    bufferPages: true,
    info: {
      Title: `Vorläufige Genehmigung Elternzeit — ${ctx.displayId}`,
      Author: "CREDO HR-Portal",
      Subject: "Elternzeit-Antrag (vorläufig)",
    },
  });

  const chunks: Buffer[] = [];
  doc.on("data", (chunk) => chunks.push(chunk));

  const qrBuffer = await generateQRBuffer(buildQRContent(ctx));

  // ── Header-Linie (CREDO Grau) ──
  doc.rect(50, 40, 515, 3).fill(COLORS.primary);

  // Logo-Platzhalter (Phase 2: echtes Logo aus /public/credo_logo.png)
  doc
    .font("Helvetica-Bold")
    .fontSize(20)
    .fillColor(COLORS.primary)
    .text("CREDO", 50, 60);
  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor(COLORS.gray)
    .text("Schultraegergruppe", 50, 84);

  // CREDO-Linie (4 Farbsegmente)
  const lineY = 102;
  const lineW = 515 / 4;
  doc.rect(50, lineY, lineW, 2).fill(COLORS.gelb);
  doc.rect(50 + lineW, lineY, lineW, 2).fill(COLORS.gruen);
  doc.rect(50 + lineW * 2, lineY, lineW, 2).fill(COLORS.rot);
  doc.rect(50 + lineW * 3, lineY, lineW, 2).fill(COLORS.blau);

  // QR-Code (oben rechts)
  doc.image(qrBuffer, 470, 50, { width: 80, height: 80 });
  doc
    .font("Helvetica")
    .fontSize(6)
    .fillColor(COLORS.gray)
    .text("DMS-Zuordnung", 470, 132, { width: 80, align: "center" });

  // Absender (Mandant)
  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor(COLORS.gray)
    .text(`${ctx.organizationName} · Personalabteilung`, 50, 130);

  // Empfaenger-Adresse
  doc
    .font("Helvetica")
    .fontSize(10)
    .fillColor(COLORS.black)
    .text(`${ctx.firstName} ${ctx.lastName}`, 50, 160);
  if (ctx.adresseStrasse)
    doc.text(ctx.adresseStrasse, 50, doc.y);
  if (ctx.adressePlz && ctx.adresseOrt)
    doc.text(`${ctx.adressePlz} ${ctx.adresseOrt}`, 50, doc.y);

  // Datum + Aktenzeichen
  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor(COLORS.gray)
    .text(formatDate(ctx.genehmigungAm), 400, 160, { width: 165, align: "right" })
    .text(`Vorgang: ${ctx.displayId}`, 400, 174, {
      width: 165,
      align: "right",
    });

  // Betreff
  let y = 240;
  doc
    .font("Helvetica-Bold")
    .fontSize(13)
    .fillColor(COLORS.primary)
    .text("Vorläufige Genehmigung Ihres Elternzeit-Antrags", 50, y, {
      width: 515,
    });
  y = doc.y + 20;

  // Anrede
  doc
    .font("Helvetica")
    .fontSize(11)
    .fillColor(COLORS.black)
    .text(`${anrede} ${ctx.lastName},`, 50, y);
  y = doc.y + 15;

  // Einleitungstext
  const intro = isMutter
    ? `wir bestaetigen Ihnen den Eingang Ihres vorläufigen Antrags auf Elternzeit ` +
      `für Ihr ${ctx.kindNummer}. Kind. Ihre Angaben haben wir wie folgt erfasst:`
    : `wir bestaetigen Ihnen den Eingang Ihres vorläufigen Antrags auf Elternzeit ` +
      `für Ihr ${ctx.kindNummer}. Kind. Da Sie als Vater keinen Mutterschutz in Anspruch nehmen, ` +
      `richtet sich Ihre Elternzeit nach § 15 BEEG. Ihre Angaben haben wir wie folgt erfasst:`;
  doc.text(intro, 50, y, { width: 515, align: "justify" });
  y = doc.y + 18;

  // Daten-Block
  doc.font("Helvetica-Bold").fontSize(10).fillColor(COLORS.primary);
  doc.text("Persönliche Daten", 50, y);
  y = doc.y + 8;
  doc.font("Helvetica").fontSize(10).fillColor(COLORS.black);

  const rows: [string, string][] = [
    ["Name", `${ctx.firstName} ${ctx.lastName}`],
    ["Personalnummer", ctx.personalNr || "—"],
    ["Dienst-/Tarifbezeichnung", ctx.dienstbezeichnung || "—"],
    ["Einrichtung", ctx.organizationName],
  ];
  if (ctx.schulnummer) rows.push(["Schulnummer", ctx.schulnummer]);

  for (const [label, value] of rows) {
    doc.font("Helvetica").fontSize(9).fillColor(COLORS.gray).text(label, 50, y);
    doc
      .font("Helvetica")
      .fontSize(10)
      .fillColor(COLORS.black)
      .text(value, 200, y);
    y += 16;
  }

  y += 10;
  doc
    .font("Helvetica-Bold")
    .fontSize(10)
    .fillColor(COLORS.primary)
    .text("Beantragte Elternzeit-Abschnitte", 50, y);
  y = doc.y + 8;

  for (const a of ctx.abschnitte) {
    doc
      .font("Helvetica-Bold")
      .fontSize(10)
      .fillColor(COLORS.black)
      .text(`Abschnitt ${a.abschnittNr}`, 50, y);
    doc
      .font("Helvetica")
      .fontSize(10)
      .text(`${formatDate(a.von)} bis ${formatDate(a.bis)}`, 200, y);
    y += 14;
    if (a.uebertragung3bis8) {
      doc
        .font("Helvetica-Oblique")
        .fontSize(8)
        .fillColor(COLORS.gray)
        .text(
          "Uebertragung auf 3.–8. Lebensjahr beantragt (AG-Zustimmung erforderlich)",
          50,
          y,
        );
      y += 12;
    }
    if (a.teilzeit && a.teilzeitStunden) {
      doc
        .font("Helvetica-Oblique")
        .fontSize(8)
        .fillColor(COLORS.gray)
        .text(
          `Teilzeit-Antrag: ${a.teilzeitStunden} Stunden/Woche (separater Antrag erforderlich)`,
          50,
          y,
        );
      y += 12;
    }
    y += 4;
  }

  if (ctx.gleichzeitigeEZ) {
    y += 6;
    doc
      .font("Helvetica-Oblique")
      .fontSize(9)
      .fillColor(COLORS.gray)
      .text(
        "Hinweis: Beide Eltern nehmen gleichzeitig Elternzeit in Anspruch.",
        50,
        y,
        { width: 515 },
      );
    y = doc.y + 6;
  }

  // Genehmigungs-Text
  y += 14;
  doc
    .font("Helvetica")
    .fontSize(11)
    .fillColor(COLORS.black)
    .text(
      `Hiermit genehmigen wir Ihren Antrag vorläufig. Die endgültige Genehmigung ` +
        `erfolgt nach Vorlage der Geburtsurkunde. Sie werden hierzu separat einen ` +
        `Magic-Link erhalten.`,
      50,
      y,
      { width: 515, align: "justify" },
    );
  y = doc.y + 16;

  doc.text(
    `Wir wuenschen Ihnen ${
      isMutter ? "und Ihrem Kind" : "Ihrer Familie"
    } alles Gute und Gottes Segen für die kommende Zeit.`,
    50,
    y,
    { width: 515, align: "justify" },
  );
  y = doc.y + 24;

  // Unterschrift
  doc
    .font("Helvetica")
    .fontSize(10)
    .text("Mit freundlichen Gruessen", 50, y);
  y += 30;
  doc.text(ctx.genehmigungVon, 50, y);
  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor(COLORS.gray)
    .text("Personalabteilung", 50, y + 12);

  // Footer
  doc.rect(50, 770, 515, 1).fill(COLORS.lightGray);
  doc
    .font("Helvetica")
    .fontSize(7)
    .fillColor(COLORS.gray)
    .text(
      `CREDO HR-Portal | ${ctx.displayId} | Vorläufige Genehmigung Elternzeit | ${personenform}`,
      50,
      778,
      { width: 515, align: "center" },
    );

  return new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });
}

// =============================================
// Phase 2: Endgültige Genehmigung
// =============================================

export interface ElternzeitEndgPdfContext extends ElternzeitPdfContext {
  // Kind-Daten (nach Geburt)
  kindName: string;
  kindGeburtsdatum: Date;
  kindGeschlecht: "TOCHTER" | "SOHN";
  // Mandanten-Konfiguration (Geschaeftsfuehrung als Unterzeichner)
  ezGfFirstName: string | null;
  ezGfLastName: string | null;
  ezGfTitle: string | null;
}

function buildEndgQRContent(ctx: ElternzeitEndgPdfContext): string {
  return [
    "SPC",
    "0200",
    "1",
    ctx.mandantNumber,
    `${ctx.lastName}, ${ctx.firstName}`,
    ctx.personalNr || "OHNE-NR",
    ctx.displayId,
    "GENEHMIGUNG_ENDGUELTIG_ELTERNZEIT",
    formatDate(new Date()),
  ].join("\n");
}

/**
 * Erzeugt das PDF "Endgültige Genehmigung Elternzeit" als Buffer.
 *
 * Wird nach Eingang der Geburtsurkunde + Validierung durch HR ausgestellt.
 * Unterzeichner: Geschaeftsfuehrung des Mandanten (aus Organization-Config),
 * mit Fallback auf den HR-Sachbearbeiter.
 */
export async function generateEndgueltigeGenehmigungPdf(
  ctx: ElternzeitEndgPdfContext,
): Promise<Buffer> {
  const isMutter = ctx.geschlecht === "MUTTER";
  const anrede = isMutter ? "Sehr geehrte Frau" : "Sehr geehrter Herr";
  const personenform = isMutter ? "Mitarbeiterin" : "Mitarbeiter";
  const kindArtikel = ctx.kindGeschlecht === "TOCHTER" ? "Ihre Tochter" : "Ihren Sohn";

  const doc = new PDFDocument({
    size: "A4",
    margin: 50,
    bufferPages: true,
    info: {
      Title: `Endgültige Genehmigung Elternzeit — ${ctx.displayId}`,
      Author: "CREDO HR-Portal",
      Subject: "Elternzeit-Antrag (endgültig)",
    },
  });

  const chunks: Buffer[] = [];
  doc.on("data", (chunk) => chunks.push(chunk));

  const qrBuffer = await generateQRBuffer(buildEndgQRContent(ctx));

  // ── Header ──
  doc.rect(50, 40, 515, 3).fill(COLORS.primary);
  doc.font("Helvetica-Bold").fontSize(20).fillColor(COLORS.primary).text("CREDO", 50, 60);
  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor(COLORS.gray)
    .text("Schultraegergruppe", 50, 84);

  // CREDO-Linie
  const lineY = 102;
  const lineW = 515 / 4;
  doc.rect(50, lineY, lineW, 2).fill(COLORS.gelb);
  doc.rect(50 + lineW, lineY, lineW, 2).fill(COLORS.gruen);
  doc.rect(50 + lineW * 2, lineY, lineW, 2).fill(COLORS.rot);
  doc.rect(50 + lineW * 3, lineY, lineW, 2).fill(COLORS.blau);

  // QR
  doc.image(qrBuffer, 470, 50, { width: 80, height: 80 });
  doc
    .font("Helvetica")
    .fontSize(6)
    .fillColor(COLORS.gray)
    .text("DMS-Zuordnung", 470, 132, { width: 80, align: "center" });

  // Absender
  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor(COLORS.gray)
    .text(`${ctx.organizationName} · Personalabteilung`, 50, 130);

  // Empfaenger
  doc
    .font("Helvetica")
    .fontSize(10)
    .fillColor(COLORS.black)
    .text(`${ctx.firstName} ${ctx.lastName}`, 50, 160);
  if (ctx.adresseStrasse) doc.text(ctx.adresseStrasse, 50, doc.y);
  if (ctx.adressePlz && ctx.adresseOrt)
    doc.text(`${ctx.adressePlz} ${ctx.adresseOrt}`, 50, doc.y);

  // Datum + Vorgang
  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor(COLORS.gray)
    .text(formatDate(ctx.genehmigungAm), 400, 160, { width: 165, align: "right" })
    .text(`Vorgang: ${ctx.displayId}`, 400, 174, { width: 165, align: "right" });

  // Betreff
  let y = 240;
  doc
    .font("Helvetica-Bold")
    .fontSize(13)
    .fillColor(COLORS.primary)
    .text("Endgültige Genehmigung Ihres Elternzeit-Antrags", 50, y, { width: 515 });
  y = doc.y + 20;

  // Anrede
  doc
    .font("Helvetica")
    .fontSize(11)
    .fillColor(COLORS.black)
    .text(`${anrede} ${ctx.lastName},`, 50, y);
  y = doc.y + 15;

  // Glueckwunsch + Einleitung
  doc.text(
    `wir gratulieren Ihnen herzlich zur Geburt ${kindArtikel} ${ctx.kindName} ` +
      `am ${formatDate(ctx.kindGeburtsdatum)}. Mit der Vorlage der Geburtsurkunde ` +
      `koennen wir Ihren Antrag auf Elternzeit für Ihr ${ctx.kindNummer}. Kind nun endgültig genehmigen.`,
    50,
    y,
    { width: 515, align: "justify" },
  );
  y = doc.y + 18;

  // Daten-Block
  doc.font("Helvetica-Bold").fontSize(10).fillColor(COLORS.primary);
  doc.text("Persönliche Daten", 50, y);
  y = doc.y + 8;

  const rows: [string, string][] = [
    ["Name", `${ctx.firstName} ${ctx.lastName}`],
    ["Personalnummer", ctx.personalNr || "—"],
    ["Dienst-/Tarifbezeichnung", ctx.dienstbezeichnung || "—"],
    ["Einrichtung", ctx.organizationName],
    ["Kind", `${ctx.kindName} (${ctx.kindNummer}. Kind)`],
    ["Geburtsdatum", formatDate(ctx.kindGeburtsdatum)],
  ];
  if (ctx.schulnummer) rows.push(["Schulnummer", ctx.schulnummer]);

  for (const [label, value] of rows) {
    doc.font("Helvetica").fontSize(9).fillColor(COLORS.gray).text(label, 50, y);
    doc.font("Helvetica").fontSize(10).fillColor(COLORS.black).text(value, 200, y);
    y += 16;
  }

  // Abschnitte
  y += 10;
  doc
    .font("Helvetica-Bold")
    .fontSize(10)
    .fillColor(COLORS.primary)
    .text("Genehmigte Elternzeit-Abschnitte", 50, y);
  y = doc.y + 8;

  for (const a of ctx.abschnitte) {
    doc
      .font("Helvetica-Bold")
      .fontSize(10)
      .fillColor(COLORS.black)
      .text(`Abschnitt ${a.abschnittNr}`, 50, y);
    doc
      .font("Helvetica")
      .fontSize(10)
      .text(`${formatDate(a.von)} bis ${formatDate(a.bis)}`, 200, y);
    y += 14;
    if (a.uebertragung3bis8) {
      doc
        .font("Helvetica-Oblique")
        .fontSize(8)
        .fillColor(COLORS.gray)
        .text("Uebertragung auf 3.–8. Lebensjahr genehmigt", 50, y);
      y += 12;
    }
    if (a.teilzeit && a.teilzeitStunden) {
      doc
        .font("Helvetica-Oblique")
        .fontSize(8)
        .fillColor(COLORS.gray)
        .text(`Teilzeit: ${a.teilzeitStunden} Stunden/Woche`, 50, y);
      y += 12;
    }
    y += 4;
  }

  // Genehmigungs-Text
  y += 14;
  doc
    .font("Helvetica")
    .fontSize(11)
    .fillColor(COLORS.black)
    .text(
      `Hiermit bestaetigen wir die endgültige Genehmigung Ihres Elternzeit-Antrags. ` +
        `Die genannten Zeitraeume gelten als verbindlich. Ihre Personalakte wird entsprechend gepflegt.`,
      50,
      y,
      { width: 515, align: "justify" },
    );
  y = doc.y + 16;

  doc.text(
    `Wir wuenschen Ihnen ${
      isMutter ? "und Ihrem Kind" : "Ihrer Familie"
    } eine wunderbare und gesegnete Zeit.`,
    50,
    y,
    { width: 515, align: "justify" },
  );
  y = doc.y + 24;

  // Unterschrift — Geschaeftsfuehrung aus Mandanten-Config, Fallback auf HR
  const unterzeichnerName =
    ctx.ezGfFirstName && ctx.ezGfLastName
      ? `${ctx.ezGfFirstName} ${ctx.ezGfLastName}`
      : ctx.genehmigungVon;
  const unterzeichnerTitel = ctx.ezGfTitle || "Personalabteilung";

  doc.font("Helvetica").fontSize(10).text("Mit freundlichen Gruessen", 50, y);
  y += 30;
  doc.text(unterzeichnerName, 50, y);
  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor(COLORS.gray)
    .text(unterzeichnerTitel, 50, y + 12);

  // Footer
  doc.rect(50, 770, 515, 1).fill(COLORS.lightGray);
  doc
    .font("Helvetica")
    .fontSize(7)
    .fillColor(COLORS.gray)
    .text(
      `CREDO HR-Portal | ${ctx.displayId} | Endgültige Genehmigung Elternzeit | ${personenform}`,
      50,
      778,
      { width: 515, align: "center" },
    );

  return new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });
}

// =============================================
// Phase 2: Geteilter Brief-Layout-Helper
// =============================================
//
// Reduziert Code-Duplikation der 5 weiteren Phase-2-Briefe (BR Detmold,
// VBL, AG-Bescheinigung, BAD, Beihilfe). Setzt Header, CREDO-Linie,
// QR-Code, Empfaenger-Adresse, Datum/Vorgang sowie Footer.

interface BriefHeaderCtx {
  empfaengerZeile1: string;
  empfaengerZeile2?: string | null;
  empfaengerZeile3?: string | null;
  empfaengerZeile4?: string | null;
  absenderText: string;
  displayId: string;
  datum: Date;
  briefTitel: string;
  dmsTyp: string;
  footerSubtitel?: string;
  mandantNumber: string;
  empfaengerName: string;
  personalNr: string | null;
}

interface BriefDoc {
  doc: PDFKit.PDFDocument;
  chunks: Buffer[];
  bodyStartY: number;
  finalize: () => Promise<Buffer>;
}

async function createBrief(ctx: BriefHeaderCtx): Promise<BriefDoc> {
  const doc = new PDFDocument({
    size: "A4",
    margin: 50,
    bufferPages: true,
    info: {
      Title: `${ctx.briefTitel} — ${ctx.displayId}`,
      Author: "CREDO HR-Portal",
      Subject: ctx.briefTitel,
    },
  });

  const chunks: Buffer[] = [];
  doc.on("data", (chunk) => chunks.push(chunk));

  const qrContent = [
    "SPC",
    "0200",
    "1",
    ctx.mandantNumber,
    ctx.empfaengerName,
    ctx.personalNr || "OHNE-NR",
    ctx.displayId,
    ctx.dmsTyp,
    formatDate(new Date()),
  ].join("\n");
  const qrBuffer = await generateQRBuffer(qrContent);

  doc.rect(50, 40, 515, 3).fill(COLORS.primary);
  doc.font("Helvetica-Bold").fontSize(20).fillColor(COLORS.primary).text("CREDO", 50, 60);
  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor(COLORS.gray)
    .text("Schultraegergruppe", 50, 84);

  const lineY = 102;
  const lineW = 515 / 4;
  doc.rect(50, lineY, lineW, 2).fill(COLORS.gelb);
  doc.rect(50 + lineW, lineY, lineW, 2).fill(COLORS.gruen);
  doc.rect(50 + lineW * 2, lineY, lineW, 2).fill(COLORS.rot);
  doc.rect(50 + lineW * 3, lineY, lineW, 2).fill(COLORS.blau);

  doc.image(qrBuffer, 470, 50, { width: 80, height: 80 });
  doc
    .font("Helvetica")
    .fontSize(6)
    .fillColor(COLORS.gray)
    .text("DMS-Zuordnung", 470, 132, { width: 80, align: "center" });

  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor(COLORS.gray)
    .text(ctx.absenderText, 50, 130);

  doc
    .font("Helvetica")
    .fontSize(10)
    .fillColor(COLORS.black)
    .text(ctx.empfaengerZeile1, 50, 160);
  if (ctx.empfaengerZeile2) doc.text(ctx.empfaengerZeile2, 50, doc.y);
  if (ctx.empfaengerZeile3) doc.text(ctx.empfaengerZeile3, 50, doc.y);
  if (ctx.empfaengerZeile4) doc.text(ctx.empfaengerZeile4, 50, doc.y);

  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor(COLORS.gray)
    .text(formatDate(ctx.datum), 400, 160, { width: 165, align: "right" })
    .text(`Vorgang: ${ctx.displayId}`, 400, 174, { width: 165, align: "right" });

  let y = 240;
  doc
    .font("Helvetica-Bold")
    .fontSize(13)
    .fillColor(COLORS.primary)
    .text(ctx.briefTitel, 50, y, { width: 515 });
  y = doc.y + 20;

  const finalize = (): Promise<Buffer> => {
    doc.rect(50, 770, 515, 1).fill(COLORS.lightGray);
    doc
      .font("Helvetica")
      .fontSize(7)
      .fillColor(COLORS.gray)
      .text(
        `CREDO HR-Portal | ${ctx.displayId} | ${ctx.briefTitel}${
          ctx.footerSubtitel ? ` | ${ctx.footerSubtitel}` : ""
        }`,
        50,
        778,
        { width: 515, align: "center" },
      );
    return new Promise<Buffer>((resolve, reject) => {
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);
      doc.end();
    });
  };

  return { doc, chunks, bodyStartY: y, finalize };
}

function renderDataBlock(
  doc: PDFKit.PDFDocument,
  startY: number,
  rows: [string, string][],
): number {
  let y = startY;
  for (const [label, value] of rows) {
    doc.font("Helvetica").fontSize(9).fillColor(COLORS.gray).text(label, 50, y);
    doc.font("Helvetica").fontSize(10).fillColor(COLORS.black).text(value, 200, y);
    y += 16;
  }
  return y;
}

function renderAbsatz(
  doc: PDFKit.PDFDocument,
  y: number,
  text: string,
): number {
  doc
    .font("Helvetica")
    .fontSize(11)
    .fillColor(COLORS.black)
    .text(text, 50, y, { width: 515, align: "justify" });
  return doc.y + 12;
}

// =============================================
// Brief 1: BR Detmold (Bezirksregierung) — für Beamte/PSI
// =============================================

export interface BRDetmoldPdfContext {
  firstName: string;
  lastName: string;
  personalNr: string | null;
  dienstbezeichnung: string | null;
  schulnummer: string | null;
  organizationName: string;
  mandantNumber: string;
  displayId: string;
  kindName: string | null;
  kindGeburtsdatum: Date | null;
  abschnitte: { abschnittNr: number; von: Date; bis: Date }[];
  brName: string | null;
  brAktenPrefix: string | null;
  ezGfFirstName: string | null;
  ezGfLastName: string | null;
  ezGfTitle: string | null;
  generiertAm: Date;
}

function renderUnterschrift(
  doc: PDFKit.PDFDocument,
  y: number,
  ezGfFirstName: string | null,
  ezGfLastName: string | null,
  ezGfTitle: string | null,
): void {
  doc.font("Helvetica").fontSize(10).fillColor(COLORS.black).text("Mit freundlichen Gruessen", 50, y);
  const yName = y + 30;
  doc.text(
    ezGfFirstName && ezGfLastName ? `${ezGfFirstName} ${ezGfLastName}` : "Personalabteilung",
    50,
    yName,
  );
  if (ezGfTitle) {
    doc.font("Helvetica").fontSize(8).fillColor(COLORS.gray).text(ezGfTitle, 50, yName + 12);
  }
}

export async function generateBRDetmoldSchreiben(
  ctx: BRDetmoldPdfContext,
): Promise<Buffer> {
  const aktz = ctx.brAktenPrefix
    ? `${ctx.brAktenPrefix}-${ctx.displayId}`
    : ctx.displayId;

  const brief = await createBrief({
    empfaengerZeile1: "Bezirksregierung Detmold",
    empfaengerZeile2: ctx.brName || "Dezernat 41",
    empfaengerZeile3: "Leopoldstrasse 15",
    empfaengerZeile4: "32756 Detmold",
    absenderText: `${ctx.organizationName} · Personalabteilung`,
    displayId: ctx.displayId,
    datum: ctx.generiertAm,
    briefTitel: "Mitteilung Elternzeit (PSI / Beamte)",
    dmsTyp: "BR_DETMOLD_ELTERNZEIT",
    footerSubtitel: `Aktenzeichen ${aktz}`,
    mandantNumber: ctx.mandantNumber,
    empfaengerName: `${ctx.lastName}, ${ctx.firstName}`,
    personalNr: ctx.personalNr,
  });

  let y = brief.bodyStartY;
  y = renderAbsatz(brief.doc, y, `Sehr geehrte Damen und Herren,`);
  y = renderAbsatz(
    brief.doc,
    y,
    `wir teilen Ihnen mit, dass die nachstehend genannte Lehrkraft Elternzeit ` +
      `nach § 15 BEEG in Anspruch nimmt. Wir bitten um Kenntnisnahme und ` +
      `entsprechende Beruecksichtigung.`,
  );

  y += 6;
  brief.doc
    .font("Helvetica-Bold")
    .fontSize(10)
    .fillColor(COLORS.primary)
    .text("Persönliche Daten", 50, y);
  y = brief.doc.y + 8;

  const rows: [string, string][] = [
    ["Name", `${ctx.firstName} ${ctx.lastName}`],
    ["Personalnummer", ctx.personalNr || "—"],
    ["Dienstbezeichnung", ctx.dienstbezeichnung || "—"],
    ["Einrichtung", ctx.organizationName],
    ["Aktenzeichen", aktz],
  ];
  if (ctx.schulnummer) rows.push(["Schulnummer", ctx.schulnummer]);
  if (ctx.kindName) rows.push(["Kind", ctx.kindName]);
  if (ctx.kindGeburtsdatum)
    rows.push(["Geburtsdatum Kind", formatDate(ctx.kindGeburtsdatum)]);
  y = renderDataBlock(brief.doc, y, rows);

  y += 10;
  brief.doc
    .font("Helvetica-Bold")
    .fontSize(10)
    .fillColor(COLORS.primary)
    .text("Zeitraeume", 50, y);
  y = brief.doc.y + 8;

  for (const a of ctx.abschnitte) {
    brief.doc
      .font("Helvetica")
      .fontSize(10)
      .fillColor(COLORS.black)
      .text(
        `Abschnitt ${a.abschnittNr}: ${formatDate(a.von)} bis ${formatDate(a.bis)}`,
        50,
        y,
      );
    y += 14;
  }

  y += 14;
  y = renderAbsatz(
    brief.doc,
    y,
    `Wir bitten um schriftliche Bestaetigung der Genehmigung. Fuer Rueckfragen ` +
      `stehen wir Ihnen gerne zur Verfuegung.`,
  );

  y += 16;
  renderUnterschrift(brief.doc, y, ctx.ezGfFirstName, ctx.ezGfLastName, ctx.ezGfTitle);

  return brief.finalize();
}

// =============================================
// Brief 2: VBL-Informationsbrief (TV-L)
// =============================================

export interface VBLPdfContext {
  firstName: string;
  lastName: string;
  personalNr: string | null;
  adresseStrasse: string | null;
  adressePlz: string | null;
  adresseOrt: string | null;
  organizationName: string;
  mandantNumber: string;
  displayId: string;
  abschnitte: { abschnittNr: number; von: Date; bis: Date }[];
  ezGfFirstName: string | null;
  ezGfLastName: string | null;
  ezGfTitle: string | null;
  generiertAm: Date;
}

export async function generateVBLInfoBrief(ctx: VBLPdfContext): Promise<Buffer> {
  const brief = await createBrief({
    empfaengerZeile1: `${ctx.firstName} ${ctx.lastName}`,
    empfaengerZeile2: ctx.adresseStrasse,
    empfaengerZeile3:
      ctx.adressePlz && ctx.adresseOrt ? `${ctx.adressePlz} ${ctx.adresseOrt}` : null,
    absenderText: `${ctx.organizationName} · Personalabteilung`,
    displayId: ctx.displayId,
    datum: ctx.generiertAm,
    briefTitel: "Information zur VBL-Versicherung waehrend der Elternzeit",
    dmsTyp: "VBL_INFORMATIONSBRIEF",
    mandantNumber: ctx.mandantNumber,
    empfaengerName: `${ctx.lastName}, ${ctx.firstName}`,
    personalNr: ctx.personalNr,
  });

  let y = brief.bodyStartY;
  y = renderAbsatz(brief.doc, y, `Sehr geehrte/r Frau/Herr ${ctx.lastName},`);
  y = renderAbsatz(
    brief.doc,
    y,
    `waehrend Ihrer Elternzeit ruht das Beschaeftigungsverhaeltnis, jedoch ` +
      `bleibt Ihre Pflichtversicherung bei der Versorgungsanstalt des Bundes ` +
      `und der Laender (VBL) bestehen. Beitraege werden in dieser Zeit nicht ` +
      `entrichtet — die Wartezeit laeuft jedoch weiter.`,
  );
  y = renderAbsatz(
    brief.doc,
    y,
    `Bitte nehmen Sie zur Kenntnis, dass Anspruchszeiten aus der Elternzeit ` +
      `für Renten- und Versorgungsansprueche relevant sein koennen. Eine ` +
      `Beratung erhalten Sie direkt bei der VBL: www.vbl.de`,
  );
  y = renderAbsatz(
    brief.doc,
    y,
    `Eine separate Meldung an die VBL durch Sie ist nicht erforderlich — wir ` +
      `uebernehmen die DEUEV-Meldung für Sie.`,
  );

  y += 6;
  brief.doc
    .font("Helvetica-Bold")
    .fontSize(10)
    .fillColor(COLORS.primary)
    .text("Elternzeit-Zeitraeume", 50, y);
  y = brief.doc.y + 8;
  for (const a of ctx.abschnitte) {
    brief.doc
      .font("Helvetica")
      .fontSize(10)
      .fillColor(COLORS.black)
      .text(
        `Abschnitt ${a.abschnittNr}: ${formatDate(a.von)} bis ${formatDate(a.bis)}`,
        50,
        y,
      );
    y += 14;
  }

  y += 18;
  renderUnterschrift(brief.doc, y, ctx.ezGfFirstName, ctx.ezGfLastName, ctx.ezGfTitle);
  return brief.finalize();
}

// =============================================
// Brief 3: AG-Bescheinigung Elterngeld
// =============================================

export interface AGBescheinigungPdfContext {
  firstName: string;
  lastName: string;
  personalNr: string | null;
  geburtsdatum: Date | null;
  adresseStrasse: string | null;
  adressePlz: string | null;
  adresseOrt: string | null;
  organizationName: string;
  mandantNumber: string;
  displayId: string;
  brutto12Monate: string;
  arbeitszeitWochenstunden: number | null;
  beschaeftigtSeit: Date | null;
  abschnitte: { abschnittNr: number; von: Date; bis: Date }[];
  ezGfFirstName: string | null;
  ezGfLastName: string | null;
  ezGfTitle: string | null;
  generiertAm: Date;
}

export async function generateAGBescheinigungElterngeld(
  ctx: AGBescheinigungPdfContext,
): Promise<Buffer> {
  const brief = await createBrief({
    empfaengerZeile1: "Elterngeldstelle",
    empfaengerZeile2: "(Adresse wird vom Antragsteller eingesetzt)",
    absenderText: `${ctx.organizationName} · Personalabteilung`,
    displayId: ctx.displayId,
    datum: ctx.generiertAm,
    briefTitel: "Arbeitgeberbescheinigung zum Elterngeld",
    dmsTyp: "AG_BESCHEINIGUNG_ELTERNGELD",
    mandantNumber: ctx.mandantNumber,
    empfaengerName: `${ctx.lastName}, ${ctx.firstName}`,
    personalNr: ctx.personalNr,
  });

  let y = brief.bodyStartY;
  y = renderAbsatz(
    brief.doc,
    y,
    `Hiermit bestaetigen wir folgende Angaben für den Elterngeld-Antrag der ` +
      `unten genannten Mitarbeiterin / des Mitarbeiters:`,
  );

  const rows: [string, string][] = [
    ["Name", `${ctx.firstName} ${ctx.lastName}`],
    ["Geburtsdatum", ctx.geburtsdatum ? formatDate(ctx.geburtsdatum) : "—"],
    ["Personalnummer", ctx.personalNr || "—"],
    [
      "Adresse",
      ctx.adresseStrasse && ctx.adressePlz && ctx.adresseOrt
        ? `${ctx.adresseStrasse}, ${ctx.adressePlz} ${ctx.adresseOrt}`
        : "—",
    ],
    ["Arbeitgeber", ctx.organizationName],
    [
      "Beschaeftigt seit",
      ctx.beschaeftigtSeit ? formatDate(ctx.beschaeftigtSeit) : "—",
    ],
    [
      "Wochenstunden",
      ctx.arbeitszeitWochenstunden ? `${ctx.arbeitszeitWochenstunden} h` : "—",
    ],
    ["Brutto-Entgelt (12 Monate)", ctx.brutto12Monate || "—"],
  ];
  y = renderDataBlock(brief.doc, y, rows);

  y += 10;
  brief.doc
    .font("Helvetica-Bold")
    .fontSize(10)
    .fillColor(COLORS.primary)
    .text("Beantragte Elternzeit", 50, y);
  y = brief.doc.y + 8;
  for (const a of ctx.abschnitte) {
    brief.doc
      .font("Helvetica")
      .fontSize(10)
      .fillColor(COLORS.black)
      .text(
        `Abschnitt ${a.abschnittNr}: ${formatDate(a.von)} bis ${formatDate(a.bis)}`,
        50,
        y,
      );
    y += 14;
  }

  y += 14;
  y = renderAbsatz(
    brief.doc,
    y,
    `Diese Angaben dienen ausschliesslich dem Elterngeld-Antrag. Eine ` +
      `Verwendung für andere Zwecke ist nicht zulaessig.`,
  );

  y += 16;
  renderUnterschrift(brief.doc, y, ctx.ezGfFirstName, ctx.ezGfLastName, ctx.ezGfTitle);
  return brief.finalize();
}

// =============================================
// Brief 4: BAD-Aufforderungsbrief (Kita)
// =============================================

export interface BADPdfContext {
  firstName: string;
  lastName: string;
  personalNr: string | null;
  dienstbezeichnung: string | null;
  organizationName: string;
  mandantNumber: string;
  displayId: string;
  voraussGeburt: Date | null;
  ezGfFirstName: string | null;
  ezGfLastName: string | null;
  ezGfTitle: string | null;
  generiertAm: Date;
}

export async function generateBADAufforderungsbrief(
  ctx: BADPdfContext,
): Promise<Buffer> {
  const brief = await createBrief({
    empfaengerZeile1: "Betriebsaerztlicher Dienst",
    empfaengerZeile2: "(BAD-Adresse wird mandantenspezifisch eingesetzt)",
    absenderText: `${ctx.organizationName} · Personalabteilung`,
    displayId: ctx.displayId,
    datum: ctx.generiertAm,
    briefTitel: "Aufforderung zur arbeitsmedizinischen Vorsorge (Schwangerschaft)",
    dmsTyp: "BAD_AUFFORDERUNG_KITA",
    mandantNumber: ctx.mandantNumber,
    empfaengerName: `${ctx.lastName}, ${ctx.firstName}`,
    personalNr: ctx.personalNr,
  });

  let y = brief.bodyStartY;
  y = renderAbsatz(brief.doc, y, `Sehr geehrte Damen und Herren,`);
  y = renderAbsatz(
    brief.doc,
    y,
    `wir bitten um Durchfuehrung einer arbeitsmedizinischen Untersuchung ` +
      `nach MuSchG / ArbMedVV für die nachstehend genannte schwangere ` +
      `Mitarbeiterin. Der Einsatzort ist eine Kindertageseinrichtung — die ` +
      `Pruefung der Beschaeftigungsfaehigkeit ist gemäß § 10 MuSchG erforderlich.`,
  );

  const rows: [string, string][] = [
    ["Name", `${ctx.firstName} ${ctx.lastName}`],
    ["Personalnummer", ctx.personalNr || "—"],
    ["Dienstbezeichnung", ctx.dienstbezeichnung || "—"],
    ["Einrichtung", ctx.organizationName],
  ];
  if (ctx.voraussGeburt)
    rows.push(["Voraussichtl. Entbindungstermin", formatDate(ctx.voraussGeburt)]);
  y = renderDataBlock(brief.doc, y, rows);

  y += 14;
  y = renderAbsatz(
    brief.doc,
    y,
    `Wir bitten um zeitnahen Termin und Rueckmeldung des Ergebnisses. Vielen ` +
      `Dank für Ihre Unterstuetzung.`,
  );

  y += 16;
  renderUnterschrift(brief.doc, y, ctx.ezGfFirstName, ctx.ezGfLastName, ctx.ezGfTitle);
  return brief.finalize();
}

// =============================================
// Brief 5: Beihilfe-Aenderungsformular (Beamte / PSI)
// =============================================

export interface BeihilfePdfContext {
  firstName: string;
  lastName: string;
  personalNr: string | null;
  adresseStrasse: string | null;
  adressePlz: string | null;
  adresseOrt: string | null;
  organizationName: string;
  mandantNumber: string;
  displayId: string;
  abschnitte: { abschnittNr: number; von: Date; bis: Date }[];
  ezGfFirstName: string | null;
  ezGfLastName: string | null;
  ezGfTitle: string | null;
  generiertAm: Date;
}

export async function generateBeihilfeAenderungsformular(
  ctx: BeihilfePdfContext,
): Promise<Buffer> {
  const brief = await createBrief({
    empfaengerZeile1: `${ctx.firstName} ${ctx.lastName}`,
    empfaengerZeile2: ctx.adresseStrasse,
    empfaengerZeile3:
      ctx.adressePlz && ctx.adresseOrt ? `${ctx.adressePlz} ${ctx.adresseOrt}` : null,
    absenderText: `${ctx.organizationName} · Personalabteilung`,
    displayId: ctx.displayId,
    datum: ctx.generiertAm,
    briefTitel: "Beihilfe-Aenderung waehrend Elternzeit",
    dmsTyp: "BEIHILFE_AENDERUNGSFORMULAR",
    mandantNumber: ctx.mandantNumber,
    empfaengerName: `${ctx.lastName}, ${ctx.firstName}`,
    personalNr: ctx.personalNr,
  });

  let y = brief.bodyStartY;
  y = renderAbsatz(brief.doc, y, `Sehr geehrte/r Frau/Herr ${ctx.lastName},`);
  y = renderAbsatz(
    brief.doc,
    y,
    `waehrend Ihrer Elternzeit aendert sich Ihr Beihilfe-Bemessungssatz. Bitte ` +
      `reichen Sie das beigefuegte Aenderungsformular innerhalb von 1 Monat ` +
      `ausgefuellt bei der Beihilfestelle ein, damit Ihre Beihilfeansprueche ` +
      `weiterhin korrekt berechnet werden.`,
  );
  y = renderAbsatz(
    brief.doc,
    y,
    `Bitte beachten Sie, dass ein Versaeumnis dieser Frist zu Rueckforderungen ` +
      `oder Ablehnungen von Beihilfeantraegen fuehren kann.`,
  );

  y += 6;
  brief.doc
    .font("Helvetica-Bold")
    .fontSize(10)
    .fillColor(COLORS.primary)
    .text("Elternzeit-Zeitraeume", 50, y);
  y = brief.doc.y + 8;
  for (const a of ctx.abschnitte) {
    brief.doc
      .font("Helvetica")
      .fontSize(10)
      .fillColor(COLORS.black)
      .text(
        `Abschnitt ${a.abschnittNr}: ${formatDate(a.von)} bis ${formatDate(a.bis)}`,
        50,
        y,
      );
    y += 14;
  }

  y += 14;
  y = renderAbsatz(
    brief.doc,
    y,
    `Bei Rueckfragen wenden Sie sich gerne an die Personalabteilung.`,
  );

  y += 16;
  renderUnterschrift(brief.doc, y, ctx.ezGfFirstName, ctx.ezGfLastName, ctx.ezGfTitle);
  return brief.finalize();
}
