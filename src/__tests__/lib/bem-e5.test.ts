/**
 * Tests fuer BEM E5 — Aktentrennung + Gesamtexport-PDF.
 */

import {
  defaultAblage,
  brauchtPersonalakte,
  BEM_DOKUMENT_ABLAGE,
} from "@/lib/bem-aktentrennung";
import { buildBemGesamtExportPdf, type BemExportInput } from "@/lib/bem-export";

describe("bem-aktentrennung", () => {
  it("legt Gespraechs-/Datenschutzdokumente NUR in der BEM-Akte ab", () => {
    expect(defaultAblage("ERSTGESPRAECH_PROTOKOLL")).toBe("NUR_BEM");
    expect(defaultAblage("DATENSCHUTZVEREINBARUNG")).toBe("NUR_BEM");
    expect(brauchtPersonalakte("ERSTGESPRAECH_PROTOKOLL")).toBe(false);
  });

  it("Massnahmenplan -> bereinigte Kopie in Personalakte", () => {
    expect(defaultAblage("MASSNAHMENPLAN")).toBe("KOPIE_PERSONALAKTE");
    expect(brauchtPersonalakte("MASSNAHMENPLAN")).toBe(true);
  });

  it("Abbruch/Beendigung -> Original Personalakte + Kopie BEM", () => {
    expect(defaultAblage("ABBRUCHERKLAERUNG")).toBe("ORIGINAL_PERSONALAKTE");
    expect(defaultAblage("BEENDIGUNGSERKLAERUNG")).toBe("ORIGINAL_PERSONALAKTE");
    expect(brauchtPersonalakte("BEENDIGUNGSERKLAERUNG")).toBe(true);
  });

  it("deckt alle Dokumenttypen ab (kein undefined)", () => {
    for (const typ of Object.keys(BEM_DOKUMENT_ABLAGE)) {
      // @ts-expect-error — Iteration ueber Enum-Keys
      expect(typeof defaultAblage(typ)).toBe("string");
    }
  });
});

describe("bem-export", () => {
  const minimal: BemExportInput = {
    displayId: "BEM-2026-GYM-001",
    status: "ERSTGESPRAECH",
    statusLabel: "Erstgespraech",
    eingangsweg: "DIGITAL",
    employee: { name: "Max Mustermann", email: "max@example.de", personalNr: "4711" },
    organization: { name: "Gymnasium", mandantNumber: "712" },
    dates: { angelegtAm: "01.06.2026", fehlzeitenAb: "01.05.2026" },
    einwilligungen: [
      { artLabel: "Datenschutz", statusLabel: "Erteilt", signedAt: "02.06.2026", signedName: "Max Mustermann" },
    ],
    gespraeche: [
      {
        typLabel: "Erstgespraech",
        datum: "05.06.2026",
        ort: "Buero",
        teilnehmer: ["Elena Bergen (BEM-Beauftragte)"],
        notizen: "Vertraulicher Gespraechsinhalt.",
        checkliste: [
          { titel: "Einwilligung liegt vor", erledigt: true },
          { titel: "Massnahmen identifiziert", erledigt: false },
        ],
      },
    ],
    massnahmen: [
      {
        kategorieLabel: "Organisatorisch",
        beschreibung: "Stufenweise Wiedereingliederung",
        statusLabel: "Laeuft",
        zustaendig: "HR",
        frist: "01.07.2026",
        evaluationAm: null,
      },
    ],
    dokumente: [
      {
        typ: "EINLADUNG",
        ablageLabel: "Nur BEM-Akte",
        quelle: "Generiert",
        dateiname: "einladung.docx",
        erstelltAm: "01.06.2026",
      },
    ],
    kommunikation: [
      {
        kanal: "E-Mail",
        statusLabel: "Gesendet",
        empfaenger: "max@example.de",
        betreff: "Einladung",
        gesendetAm: "01.06.2026, 10:00",
        nachweis: "Msg-ID <abc@host>",
      },
    ],
    protokoll: [
      { zeitpunkt: "01.06.2026, 09:00", vorgang: "Fall angelegt", person: "Admin", ip: "10.0.0.1" },
    ],
    erstelltAm: "08.06.2026, 12:00",
    erstelltVon: "Admin Test",
  };

  it("erzeugt ein gueltiges PDF (Buffer mit %PDF-Header)", async () => {
    const pdf = await buildBemGesamtExportPdf(minimal);
    expect(Buffer.isBuffer(pdf)).toBe(true);
    expect(pdf.length).toBeGreaterThan(1000);
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });

  it("funktioniert auch mit leerer Akte", async () => {
    const leer: BemExportInput = {
      ...minimal,
      einwilligungen: [],
      gespraeche: [],
      massnahmen: [],
      dokumente: [],
      kommunikation: [],
      protokoll: [],
    };
    const pdf = await buildBemGesamtExportPdf(leer);
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });
});
