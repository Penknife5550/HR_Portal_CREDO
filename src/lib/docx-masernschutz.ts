/**
 * Word-Generator: Masernschutz "Nachweis-Bescheinigung" (Task P6).
 *
 * Bildet das amtliche Formular (Ministerium für Schule und Bildung NRW,
 * Stand Februar 2020) als .docx nach und befuellt Name/Vorname, Geburtstag
 * und Wohnanschrift vor. Die Ankreuzoptionen, Ort/Datum, Unterschrift und der
 * Praxisstempel bleiben fuer die Aerztin/den Arzt frei.
 *
 * Rechtsgrundlage: § 20 Abs. 8/9 IfSG (Masernschutzgesetz).
 */
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
  BorderStyle,
} from "docx";

export interface MasernschutzDocData {
  /** "Nachname, Vorname" der betroffenen Person */
  nameVorname: string;
  /** Geburtsdatum, z.B. "01.01.1990" */
  geburtstag: string;
  /** Wohnanschrift (eine Zeile) */
  wohnanschrift: string;
}

const GREY = "575756";

function label(text: string): Paragraph {
  return new Paragraph({
    spacing: { after: 200 },
    children: [new TextRun({ text, size: 16, color: GREY })],
  });
}

/** Wert mit Unterstrich-Linie darueber (gefuelltes Formularfeld). */
function filledField(value: string, caption: string): Paragraph[] {
  return [
    new Paragraph({
      spacing: { after: 0 },
      border: {
        bottom: { style: BorderStyle.SINGLE, size: 6, space: 1, color: "000000" },
      },
      children: [new TextRun({ text: value || " ", bold: true })],
    }),
    label(caption),
  ];
}

function option(text: string, cite: string): Paragraph[] {
  return [
    new Paragraph({
      spacing: { after: 40 },
      children: [new TextRun({ text: `☐  ${text}` })],
    }),
    new Paragraph({
      spacing: { after: 160 },
      indent: { left: 360 },
      children: [new TextRun({ text: cite, italics: true, size: 18 })],
    }),
  ];
}

export async function generateMasernschutzBescheinigungDocx(
  data: MasernschutzDocData,
): Promise<Buffer> {
  const doc = new Document({
    creator: "CREDO HR-Portal",
    title: "Masernschutz Nachweis-Bescheinigung",
    sections: [
      {
        properties: {},
        children: [
          // Stempel-Box (rechtsbuendiger Hinweis)
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            spacing: { after: 320 },
            children: [new TextRun({ text: "(Stempel der Arztpraxis)", color: GREY })],
          }),
          // Ueberschrift
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 320 },
            children: [
              new TextRun({ text: "Nachweis - Bescheinigung", bold: true, size: 28 }),
            ],
          }),
          new Paragraph({
            spacing: { after: 160 },
            children: [new TextRun({ text: "Hiermit wird für" })],
          }),
          ...filledField(data.nameVorname, "(Name, Vorname)"),
          ...filledField(data.geburtstag, "(Geburtstag)"),
          ...filledField(data.wohnanschrift, "(Wohnanschrift)"),
          new Paragraph({
            spacing: { after: 240 },
            children: [
              new TextRun({ text: "bestätigt, dass bei der genannten Person" }),
            ],
          }),
          ...option(
            "ein ausreichender Impfschutz – im Sinne des § 20 Abs. 8 Satz 2 IfSG – gegen Masern besteht",
            "(§ 20 Absatz 9 Satz 1 Nummer 1 IfSG)",
          ),
          new Paragraph({ spacing: { after: 80 }, children: [new TextRun({ text: "oder", bold: true })] }),
          ...option(
            "eine Immunität gegen Masern vorliegt",
            "(§ 20 Absatz 9 Satz 1 Nummer 2 Alternative 1 IfSG)",
          ),
          new Paragraph({ spacing: { after: 80 }, children: [new TextRun({ text: "oder", bold: true })] }),
          ...option(
            "eine Impfung aufgrund einer medizinischen Kontraindikation nicht erfolgen kann.",
            "(§ 20 Absatz 9 Satz 1 Nummer 2 Alternative 2 IfSG)",
          ),
          // Unterschriftszeilen
          new Paragraph({ spacing: { before: 480, after: 0 } }),
          new Paragraph({
            spacing: { after: 0 },
            children: [
              new TextRun({ text: "______________________          ______________________________" }),
            ],
          }),
          new Paragraph({
            spacing: { after: 320 },
            children: [
              new TextRun({ text: "(Ort, Datum)                                   (Unterschrift Ärztin oder Arzt)", size: 16, color: GREY }),
            ],
          }),
          // Footer
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [
              new TextRun({
                text: "Ministerium für Schule und Bildung NRW – Stand Februar 2020",
                size: 14,
                color: GREY,
              }),
            ],
          }),
        ],
      },
    ],
  });

  return Packer.toBuffer(doc);
}
