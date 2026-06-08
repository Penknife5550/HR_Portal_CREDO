/**
 * DMS-Deckblatt fuer erzeugte Dokumente (Vorlagenbibliothek E0).
 *
 * Erzeugt eine eigenstaendige A4-Deckblatt-Seite (PDF) mit CREDO-Header,
 * Metadaten und einem QR-Code zur DMS-Zuordnung. Wird beim PDF-Export der
 * Vorlagenbibliothek vor den eigentlichen Inhalt gemerged (siehe gotenberg.ts).
 *
 * Nutzt PDFKit + qrcode (analog zu pdf-export.ts).
 */

import PDFDocument from "pdfkit";
import QRCode from "qrcode";

const COLORS = {
  primary: "#575756",
  gruen: "#6BAA24",
  gelb: "#FBC900",
  rot: "#E2001A",
  blau: "#009AC6",
  gray: "#999999",
  black: "#1A1A1A",
  white: "#FFFFFF",
};

export interface DeckblattMeta {
  /** Anzeigename des erzeugten Dokuments */
  dokumentName: string;
  /** Modul, z.B. "BEM", "ALLGEMEIN" */
  modul: string;
  /** Name der zugrunde liegenden Vorlage */
  vorlageName?: string;
  /** Organisationsname */
  mandantName?: string;
  /** Mandantennummer */
  mandantNumber?: string;
  /** Bezug, z.B. bemFallId */
  refId?: string;
  /** Empfaenger / betroffene Person */
  empfaenger?: string;
  /** Formatiertes Erstelldatum */
  erstelltAm: string;
  /** Benutzername des Erstellers */
  erstelltVon?: string;
}

/** Baut den QR-Inhalt fuer die DMS-Zuordnung (SPC-Struktur, newline-getrennt). */
function buildDmsQrContent(meta: DeckblattMeta): string {
  return [
    "SPC",
    "0200",
    "1",
    meta.mandantNumber || "GLOBAL",
    meta.empfaenger || "",
    meta.refId || "",
    meta.modul,
    meta.dokumentName,
    meta.erstelltAm,
  ].join("\n");
}

/**
 * Erzeugt ein einseitiges DMS-Deckblatt als PDF-Buffer.
 */
export async function buildDeckblattPdf(meta: DeckblattMeta): Promise<Buffer> {
  const qrContent = buildDmsQrContent(meta);
  const qrDataUri = await QRCode.toDataURL(qrContent, {
    errorCorrectionLevel: "M",
    type: "image/png",
    width: 220,
    margin: 1,
    color: { dark: COLORS.primary, light: COLORS.white },
  });
  const qrBuffer = Buffer.from(qrDataUri.split(",")[1], "base64");

  const doc = new PDFDocument({
    size: "A4",
    margin: 50,
    info: { Title: meta.dokumentName, Author: "CREDO HR-Portal" },
  });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));

  // Kopfbalken + Titelzeile
  doc.rect(50, 40, 515, 3).fill(COLORS.primary);
  doc
    .font("Helvetica-Bold")
    .fontSize(22)
    .fillColor(COLORS.primary)
    .text("CREDO HR-Portal", 50, 60);
  doc
    .font("Helvetica")
    .fontSize(11)
    .fillColor(COLORS.gray)
    .text("Dokument-Deckblatt (DMS-Zuordnung)", 50, 88);

  // CREDO-Linie
  const lineY = 112;
  const lineW = 515 / 4;
  doc.rect(50, lineY, lineW, 2).fill(COLORS.gelb);
  doc.rect(50 + lineW, lineY, lineW, 2).fill(COLORS.gruen);
  doc.rect(50 + lineW * 2, lineY, lineW, 2).fill(COLORS.rot);
  doc.rect(50 + lineW * 3, lineY, lineW, 2).fill(COLORS.blau);

  // QR-Code rechts
  doc.image(qrBuffer, 390, 150, { width: 160, height: 160 });
  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor(COLORS.gray)
    .text("DMS-Zuordnung (QR-Code)", 390, 315, { width: 160, align: "center" });

  // Dokumenttitel
  doc
    .font("Helvetica-Bold")
    .fontSize(16)
    .fillColor(COLORS.black)
    .text(meta.dokumentName, 50, 160, { width: 320 });

  // Info-Tabelle
  const rows: Array<[string, string]> = [
    ["Modul", meta.modul],
    ["Vorlage", meta.vorlageName || "—"],
    [
      "Mandant",
      meta.mandantName
        ? `${meta.mandantNumber ? meta.mandantNumber + " — " : ""}${meta.mandantName}`
        : "Global",
    ],
    ["Empfaenger", meta.empfaenger || "—"],
    ["Bezug (Ref-ID)", meta.refId || "—"],
    ["Erstellt am", meta.erstelltAm],
    ["Erstellt von", meta.erstelltVon || "—"],
  ];
  let y = 200;
  for (const [label, value] of rows) {
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor(COLORS.gray)
      .text(label, 50, y, { width: 110 });
    doc
      .font("Helvetica-Bold")
      .fontSize(10)
      .fillColor(COLORS.black)
      .text(value, 165, y, { width: 200 });
    y += 22;
  }

  // Fusszeile
  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor(COLORS.gray)
    .text(
      "Automatisch erzeugt durch das CREDO HR-Portal. Dieses Deckblatt dient der DMS-Zuordnung.",
      50,
      790,
      { width: 515, align: "center" },
    );

  doc.end();
  return new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}
