/**
 * Word-Generator: "Aufforderung zur Vorlage eines erweiterten Fuehrungszeugnisses"
 * (Task P5). Erzeugt ein .docx programmatisch mit dem `docx`-Paket.
 *
 * Rechtsgrundlage: § 30a BZRG (erweitertes Fuehrungszeugnis fuer Taetigkeiten
 * mit Kindern/Jugendlichen). Der Brief fordert die/den neue/n Mitarbeiter/in auf,
 * ein erweitertes Fuehrungszeugnis zu beantragen und vorzulegen.
 */
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
} from "docx";

export interface FuehrungszeugnisDocData {
  /** Anrede + Titel + Name, z.B. "Frau Dr. Erika Muster" */
  anredeName: string;
  /** Empfaenger-Adresszeilen (Strasse, "PLZ Ort") */
  empfaengerStrasse: string;
  empfaengerOrt: string;
  /** Verantwortliche Stelle / Absender */
  absenderName: string;
  absenderStrasse: string;
  absenderOrt: string;
  /** Unterzeichner-Zeile, z.B. "i.A. Personalabteilung" oder GF-Name */
  unterzeichner: string;
  /** Ort + Datum, z.B. "Minden, den 26.05.2026" */
  ortDatum: string;
}

function p(text: string, opts?: { bold?: boolean; spacingAfter?: number }): Paragraph {
  return new Paragraph({
    spacing: { after: opts?.spacingAfter ?? 160 },
    children: [new TextRun({ text, bold: opts?.bold })],
  });
}

export async function generateFuehrungszeugnisAntragDocx(
  data: FuehrungszeugnisDocData,
): Promise<Buffer> {
  const doc = new Document({
    creator: "CREDO HR-Portal",
    title: "Aufforderung erweitertes Fuehrungszeugnis",
    sections: [
      {
        properties: {},
        children: [
          // Absenderzeile (klein)
          new Paragraph({
            spacing: { after: 240 },
            children: [
              new TextRun({
                text: `${data.absenderName} · ${data.absenderStrasse} · ${data.absenderOrt}`,
                size: 16, // half-points → 8pt
                color: "575756",
              }),
            ],
          }),
          // Empfaenger
          p(data.anredeName, { spacingAfter: 0 }),
          p(data.empfaengerStrasse, { spacingAfter: 0 }),
          p(data.empfaengerOrt, { spacingAfter: 320 }),
          // Ort/Datum rechtsbuendig
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            spacing: { after: 320 },
            children: [new TextRun({ text: data.ortDatum })],
          }),
          // Betreff
          p("Aufforderung zur Vorlage eines erweiterten Führungszeugnisses", {
            bold: true,
            spacingAfter: 240,
          }),
          // Anrede
          p(
            `${data.anredeName.startsWith("Frau") ? "Sehr geehrte Frau" : data.anredeName.startsWith("Herr") ? "Sehr geehrter Herr" : "Sehr geehrte/r"} ${
              data.anredeName.replace(/^(Frau|Herr)\s+/, "")
            },`,
          ),
          // Fliesstext
          p(
            "im Rahmen Ihrer Tätigkeit bei uns sind Sie in einem Bereich beschäftigt, der den Umgang mit Kindern und Jugendlichen umfasst. Nach § 30a des Bundeszentralregistergesetzes (BZRG) sind wir als Träger verpflichtet, vor Aufnahme dieser Tätigkeit ein erweitertes Führungszeugnis einzusehen.",
          ),
          p(
            "Wir bitten Sie daher, bei Ihrer zuständigen Meldebehörde (Bürgeramt) ein erweitertes Führungszeugnis zur Vorlage bei einer Behörde gemäß § 30a BZRG zu beantragen und uns dieses unverzüglich vorzulegen.",
          ),
          p(
            "Diese Bestätigung legen Sie bitte bei der Beantragung vor. Bei einer Tätigkeit nach § 30a BZRG kann das Führungszeugnis gebührenfrei beantragt werden.",
          ),
          p(
            "Sollte Ihr letztes erweitertes Führungszeugnis nicht älter als drei Monate sein, genügt dessen Vorlage.",
            { spacingAfter: 320 },
          ),
          // Gruss
          p("Mit freundlichen Grüßen", { spacingAfter: 480 }),
          p(data.unterzeichner, { spacingAfter: 0 }),
          p(data.absenderName, { spacingAfter: 0 }),
        ],
      },
    ],
  });

  return Packer.toBuffer(doc);
}
