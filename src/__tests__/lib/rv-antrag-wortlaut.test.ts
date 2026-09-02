/**
 * Haelt den nachgebauten Antragswortlaut gegen die amtliche Fassung.
 *
 * Wir drucken die beiden Antragsanlagen nach, statt die amtliche Seite zu
 * stempeln. Das ist zulaessig — das Merkblatt verlangt den Vordruck nur
 * „möglichst" —, aber es verschiebt die Verantwortung fuer den Wortlaut zu uns.
 * Ohne diesen Test faellt eine Abweichung erst auf, wenn ein Pruefer sie findet.
 *
 * Verglichen wird gegen die abgelegte Textextraktion des amtlichen PDF
 * (docs/module/minijob/anlagen-wortlaut-2026-06-30.txt). Kommt eine neue
 * amtliche Fassung, wird diese Datei neu erzeugt — und der Test zeigt Satz fuer
 * Satz, was sich geaendert hat.
 */

import fs from "fs";
import path from "path";
import {
  ANTRAGS_WORTLAUT,
  FASSUNG,
  FASSUNG_ANZEIGE,
  GEMEINSAM,
  HERKUNFT,
  antragsArtFuerEntscheidung,
  dateiname,
} from "@/lib/rv-antrag-wortlaut";

const AMTLICH = fs.readFileSync(
  path.join(
    process.cwd(),
    "docs",
    "module",
    "minijob",
    "anlagen-wortlaut-2026-06-30.txt"
  ),
  "utf-8"
);

/**
 * Reduziert Text auf seine Buchstabenfolge.
 *
 * Die PDF-Extraktion traegt die Trennstriche der Originalsatz-Umbrueche mit
 * sich — mal mitten in der Zeile („geringfü-gig"), mal am Zeilenende
 * („ent-\nlohnten"). Beides sind Satzartefakte, keine Wortunterschiede. Wer
 * darueber stolpert, vergleicht Typografie statt Inhalt.
 */
function nurBuchstaben(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-zäöüß]/g, "");
}

const AMTLICH_NORMIERT = nurBuchstaben(AMTLICH);

describe("Die amtliche Textfassung liegt vor", () => {
  it("enthält beide Antragsanlagen", () => {
    expect(AMTLICH).toContain("SEITE 8 - Befreiungsantrag");
    expect(AMTLICH).toContain("SEITE 9 - Aufhebungsantrag");
  });

  it("ist die Fassung, auf die sich der Code beruft", () => {
    expect(AMTLICH).toContain("Stand: 30. Juni 2026");
    expect(FASSUNG).toBe("2026-06-30");
    expect(FASSUNG_ANZEIGE).toBe("Stand: 30. Juni 2026");
  });
});

describe.each([
  ["BEFREIUNG", "§ 6 Abs. 1b"],
  ["AUFHEBUNG", "§ 6 Abs. 6"],
] as const)("Wortlaut %s", (art, paragraf) => {
  const w = ANTRAGS_WORTLAUT[art];

  it("gibt den Titel des amtlichen Vordrucks wieder", () => {
    expect(AMTLICH_NORMIERT).toContain(nurBuchstaben(w.titel));
  });

  it("nennt die richtige Rechtsgrundlage", () => {
    expect(w.titel).toContain(paragraf);
    expect(w.titel).toContain("SGB VI");
  });

  it("gibt jeden Absatz der Erklärung wortgleich wieder", () => {
    expect(w.absaetze.length).toBeGreaterThan(0);
    for (const absatz of w.absaetze) {
      expect(AMTLICH_NORMIERT).toContain(nurBuchstaben(absatz));
    }
  });

  it("gibt die Zeilen des Arbeitgeberteils wieder", () => {
    expect(AMTLICH_NORMIERT).toContain(nurBuchstaben(w.eingangZeile.vor));
    expect(AMTLICH_NORMIERT).toContain(nurBuchstaben(w.eingangZeile.nach));
    expect(AMTLICH_NORMIERT).toContain(nurBuchstaben(w.wirkungZeile));
  });

  it("gibt den Hinweis nach der Beitragsverfahrensverordnung wieder", () => {
    expect(AMTLICH_NORMIERT).toContain(nurBuchstaben(w.hinweis));
    // Der entscheidende Satz: Das Blatt geht in die Entgeltunterlagen und
    // ausdruecklich NICHT an die Minijob-Zentrale.
    expect(w.hinweis).toContain("Entgeltunterlagen");
    expect(w.hinweis).toContain("nicht an die Minijob-Zentrale zu senden");
    expect(w.hinweis).toContain("§ 8 Abs. 2 Nr. 4a");
  });
});

describe("Der vorgedruckte Monatserste", () => {
  it("steht nur im Aufhebungsantrag", () => {
    // Im Original sind die beiden Tageskaestchen der Wirkungszeile auf Seite 9
    // mit "0" und "1" gefuellt: Die Aufhebung kann nur zum Monatsersten wirken.
    // Seite 8 laesst beide Stellen frei.
    expect(ANTRAGS_WORTLAUT.AUFHEBUNG.wirkungVorgedruckt).toBe("01");
    expect(ANTRAGS_WORTLAUT.BEFREIUNG.wirkungVorgedruckt).toBe("");
  });

  it("passt zur Regel aus dem Wortlaut", () => {
    expect(ANTRAGS_WORTLAUT.AUFHEBUNG.absaetze.join(" ")).toContain(
      "ab Beginn des Kalendermonats"
    );
  });
});

describe("Gemeinsame Beschriftungen", () => {
  it("stammen aus dem amtlichen Vordruck", () => {
    for (const text of [
      GEMEINSAM.rubrikArbeitnehmer,
      GEMEINSAM.rubrikArbeitgeber,
      GEMEINSAM.rentenversicherungsnummer,
      GEMEINSAM.betriebsnummer,
      GEMEINSAM.legendeArbeitnehmer,
      GEMEINSAM.legendeArbeitgeber,
      GEMEINSAM.hinweisUeberschrift,
    ]) {
      expect(AMTLICH_NORMIERT).toContain(nurBuchstaben(text));
    }
  });

  it("beschriftet das Datumsfeld mit acht Stellen", () => {
    expect(GEMEINSAM.datumsBeschriftung).toEqual([
      "T", "T", "M", "M", "J", "J", "J", "J",
    ]);
  });
});

describe("Herkunftszeile", () => {
  it("weist das Blatt als Nachbildung aus", () => {
    // Ohne sie sieht die Seite aus wie das amtliche Original.
    expect(HERKUNFT).toContain("Nachbildung");
    expect(HERKUNFT).toContain("Minijob-Zentrale");
    expect(HERKUNFT).toContain("30.06.2026");
  });
});

describe("Zuordnung Entscheidung → Antrag", () => {
  it("führt jede Antragsentscheidung auf ihr Formular", () => {
    expect(antragsArtFuerEntscheidung("BEFREIUNG_BEANTRAGT")).toBe("BEFREIUNG");
    expect(antragsArtFuerEntscheidung("AUFHEBUNG_BEANTRAGT")).toBe("AUFHEBUNG");
  });

  it("liefert für die übrigen Wege kein Formular", () => {
    // Wer versichert bleibt oder ohnehin frei ist, stellt keinen Antrag.
    for (const wert of [
      "KEINE_BEFREIUNG",
      "RENTENVERSICHERUNGSFREI",
      null,
      undefined,
      "",
    ]) {
      expect(antragsArtFuerEntscheidung(wert)).toBeNull();
    }
  });
});

describe("Dateiname", () => {
  it("benennt Antragsart und Person", () => {
    expect(dateiname("BEFREIUNG", "Müller")).toBe(
      "RV-Befreiungsantrag-Müller.pdf"
    );
    expect(dateiname("AUFHEBUNG", "Schmidt")).toBe(
      "RV-Aufhebungsantrag-Schmidt.pdf"
    );
  });

  it("entfernt alles, was in einem Dateinamen nichts zu suchen hat", () => {
    expect(dateiname("BEFREIUNG", "van der Berg 2")).toBe(
      "RV-Befreiungsantrag-vanderBerg.pdf"
    );
    expect(dateiname("BEFREIUNG", "")).toBe("RV-Befreiungsantrag-Antrag.pdf");
    expect(dateiname("BEFREIUNG", "../../etc")).toBe(
      "RV-Befreiungsantrag-etc.pdf"
    );
  });
});
