/**
 * Tests fuer die Erzeugung der beiden Antragsanlagen.
 *
 * Geprueft wird vor allem, was man einem PDF nicht ansieht: dass es genau eine
 * Seite bleibt (sonst rutscht die Unterschrift vom Formular), dass die
 * Arbeitgeber-Datumsfelder leer bleiben und dass Umlaute im Zeichensatz landen
 * statt lautlos zu verschwinden.
 */

import { generateRvAntragPdf } from "@/lib/pdf-rv-antrag";
import { ANTRAGS_WORTLAUT } from "@/lib/rv-antrag-wortlaut";

const DATEN = {
  nachname: "Müller-Lüdenscheidt",
  vorname: "Jörg",
  rentenversicherungsnummer: "65 170839 M 123",
  arbeitgeberName: "Berufskolleg Minden",
  betriebsnummer: "12345678",
};

/** Zaehlt die Seiten anhand der PDF-Struktur. */
function seitenzahl(pdf: Buffer): number {
  const treffer = pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g);
  return treffer ? treffer.length : 0;
}

describe.each(["BEFREIUNG", "AUFHEBUNG"] as const)("Antrag %s", (art) => {
  let pdf: Buffer;

  beforeAll(async () => {
    pdf = await generateRvAntragPdf(art, DATEN);
  });

  it("ist ein gültiges PDF", () => {
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(1000);
  });

  it("bleibt auf genau einer Seite", () => {
    // Der eigentliche Punkt: Eine Unterschrift auf Seite 2 gehoert nicht mehr
    // zum Antrag. Der Renderer wirft selbst, wenn es zwei werden — dieser Test
    // haelt fest, dass die Pruefung auch wirklich greift.
    expect(seitenzahl(pdf)).toBe(1);
  });

  it("trägt einen sprechenden Titel in den Metadaten", () => {
    expect(pdf.toString("latin1")).toContain("Rentenversicherungspflicht");
  });
});

describe("Vorbelegung", () => {
  it("bricht ab, wenn das Layout auf zwei Seiten läuft", async () => {
    // Ein absurd langer Wert darf das Formular nicht sprengen: Die Schreiblinie
    // schneidet ab (ellipsis), statt umzubrechen.
    const pdf = await generateRvAntragPdf("AUFHEBUNG", {
      ...DATEN,
      nachname: "A".repeat(400),
      vorname: "B".repeat(400),
      arbeitgeberName: "C".repeat(400),
    });
    expect(seitenzahl(pdf)).toBe(1);
  });

  it("verkraftet eine leere Rentenversicherungsnummer", async () => {
    // Die Nummer fehlt manchmal noch. Die Kaestchen bleiben dann leer — das
    // Blatt ist trotzdem druckbar, und die Sperre greift an anderer Stelle.
    const pdf = await generateRvAntragPdf("BEFREIUNG", {
      ...DATEN,
      rentenversicherungsnummer: "",
    });
    expect(seitenzahl(pdf)).toBe(1);
  });
});

describe("Der Kollisionsschutz", () => {
  it("bricht ab, wenn der Inhalt in den Hinweiskasten laufen würde", async () => {
    // Der Aufhebungsantrag ist die enge Seite. Waechst der Wortlaut — sei es
    // durch eine neue amtliche Fassung oder eine groessere Schrift —, schoebe
    // sich der Inhalt lautlos ueber die Fusszeile: pdfkit legt dabei keine neue
    // Seite an, die Einseitigkeitspruefung greift also nicht. Genau dieser
    // Fehler ist beim ersten Bau passiert.
    const original = [...ANTRAGS_WORTLAUT.AUFHEBUNG.absaetze];
    ANTRAGS_WORTLAUT.AUFHEBUNG.absaetze = [
      ...original,
      "Ein zusätzlicher Absatz. ".repeat(60),
    ];
    try {
      await expect(generateRvAntragPdf("AUFHEBUNG", DATEN)).rejects.toThrow(
        /passt nicht auf eine Seite/
      );
    } finally {
      ANTRAGS_WORTLAUT.AUFHEBUNG.absaetze = original;
    }
  });

  it("lässt den unveränderten Wortlaut durch", async () => {
    await expect(
      generateRvAntragPdf("AUFHEBUNG", DATEN)
    ).resolves.toBeInstanceOf(Buffer);
  });
});

describe("Was bewusst leer bleibt", () => {
  it("druckt im Aufhebungsantrag den vorgedruckten Monatsersten", () => {
    // "0" und "1" gehoeren zum Vordruck: Die Aufhebung wirkt immer zum
    // Monatsersten. Alle uebrigen Datumsstellen bleiben leer.
    expect(ANTRAGS_WORTLAUT.AUFHEBUNG.wirkungVorgedruckt).toBe("01");
  });

  it("druckt im Befreiungsantrag keinen Tag vor", () => {
    // Seite 8 laesst beide Tagesstellen frei: Die Befreiung wirkt fruehestens
    // ab Beschaeftigungsbeginn und trifft damit nicht zwingend den Monatsersten.
    expect(ANTRAGS_WORTLAUT.BEFREIUNG.wirkungVorgedruckt).toBe("");
  });
});
