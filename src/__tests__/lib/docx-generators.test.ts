import { generateFuehrungszeugnisAntragDocx } from "@/lib/docx-fuehrungszeugnis";
import { generateMasernschutzBescheinigungDocx } from "@/lib/docx-masernschutz";

// .docx ist ein ZIP-Container → beginnt mit "PK" (0x50 0x4B)
function isDocx(buf: Buffer): boolean {
  return buf.length > 100 && buf[0] === 0x50 && buf[1] === 0x4b;
}

describe("Word-Generatoren", () => {
  it("erzeugt einen Fuehrungszeugnis-Antrag als gueltiges .docx", async () => {
    const buf = await generateFuehrungszeugnisAntragDocx({
      anredeName: "Frau Dr. Erika Muster",
      empfaengerStrasse: "Musterstraße 1",
      empfaengerOrt: "32423 Minden",
      absenderName: "Christlicher Schulverein Minden e.V.",
      absenderStrasse: "Kingsleyallee 6",
      absenderOrt: "32425 Minden",
      unterzeichner: "i. A. Personalabteilung",
      ortDatum: "Minden, den 26.05.2026",
    });
    expect(isDocx(buf)).toBe(true);
  });

  it("erzeugt eine Masernschutz-Bescheinigung als gueltiges .docx", async () => {
    const buf = await generateMasernschutzBescheinigungDocx({
      nameVorname: "Muster, Erika",
      geburtstag: "01.01.1990",
      wohnanschrift: "Musterstraße 1, 32423 Minden",
    });
    expect(isDocx(buf)).toBe(true);
  });
});
