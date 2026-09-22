/**
 * Tests fuer src/lib/format.ts
 *
 * Schwerpunkt ist formatBytes. Die Funktion loest acht ueber die Oberflaeche
 * verstreute Kopien ab, die in zwei Fassungen existierten (KB mit und ohne
 * Nachkommastelle) und beide englisch formatierten. Die Tests hier nageln die
 * EINE Regel fest, auf die zusammengelegt wurde — vor allem die deutsche
 * Lokalisierung, denn ein spaeterer Umbau (etwa zurueck auf ein blosses
 * toFixed) wuerde sie sonst stillschweigend zuruecknehmen, ohne dass
 * irgendetwas fehlschlaegt.
 */

import { formatBytes, formatDatumDE, formatEmployeeName } from "@/lib/format";

describe("formatBytes", () => {
  describe("fehlende Angabe gegen leere Datei", () => {
    it("null und undefined liefern den Gedankenstrich", () => {
      expect(formatBytes(null)).toBe("—");
      expect(formatBytes(undefined)).toBe("—");
    });

    it("0 liefert '0 B' und NICHT den Gedankenstrich", () => {
      // Die einzige beabsichtigte Verhaltensaenderung gegenueber der bisherigen
      // BEM-Fassung, die 0 ueber `if (!bytes)` mit abfing. Eine 0-Byte-Datei in
      // der Akte ist ein kaputter Upload und soll als solcher sichtbar sein,
      // nicht als fehlende Angabe.
      expect(formatBytes(0)).toBe("0 B");
    });
  });

  describe("Grenzen zwischen den Einheiten", () => {
    it("unter 1024 Bytes bleibt es bei B", () => {
      expect(formatBytes(1)).toBe("1 B");
      expect(formatBytes(512)).toBe("512 B");
      expect(formatBytes(1023)).toBe("1023 B");
    });

    it("genau 1024 Bytes ist 1 KB", () => {
      expect(formatBytes(1024)).toBe("1 KB");
    });

    it("knapp unter einem Megabyte bleibt es bei KB", () => {
      expect(formatBytes(1024 * 1024 - 1)).toBe("1024 KB");
    });

    it("genau ein Megabyte wechselt auf MB", () => {
      expect(formatBytes(1024 * 1024)).toBe("1,0 MB");
    });
  });

  describe("Rundung im KB-Bereich", () => {
    it("rundet auf ganze KB — genau hier liefen die beiden alten Fassungen auseinander", () => {
      // 1536 Bytes sind 1,5 KB: die alte formatBytes-Fassung zeigte "2 KB",
      // die alte formatFileSize-Fassung "1.5 KB".
      expect(formatBytes(1536)).toBe("2 KB");
      expect(formatBytes(768 * 1024)).toBe("768 KB");
      expect(formatBytes(1024 + 511)).toBe("1 KB");
    });

    it("zeigt im KB-Bereich nie ein Trennzeichen", () => {
      // Weder ein Komma (keine Nachkommastelle) noch einen Tausenderpunkt.
      // Letzterer waere die Falle bei toLocaleString("de-DE"): 1023,99 KB
      // erschienen dort als "1.024 KB" — also genau als die Zeichenfolge, die
      // wir mit dem Komma vermeiden wollen.
      expect(formatBytes(1024 * 1024 - 1)).not.toContain(".");
      expect(formatBytes(1024 * 1024 - 1)).not.toContain(",");
    });
  });

  describe("deutsche Lokalisierung ab MB", () => {
    it("trennt Nachkommastellen mit Komma, nicht mit Punkt", () => {
      expect(formatBytes(1.5 * 1024 * 1024)).toBe("1,5 MB");
      expect(formatBytes(15 * 1024 * 1024)).toBe("15,0 MB");
    });

    it("keine Ausgabe enthaelt jemals einen Punkt", () => {
      // Der Punkt trennt im Deutschen Tausender. Diese Erwartung ist der
      // eigentliche Schutz: Wer den Trennzeichen-Austausch spaeter entfernt
      // oder auf toLocaleString umstellt, faellt hier auf.
      const proben = [0, 1, 1023, 1024, 1536, 1024 * 1024 - 1, 1024 * 1024, 1.5 * 1024 * 1024, 15 * 1024 * 1024, 2048 * 1024 * 1024];
      for (const probe of proben) {
        expect(formatBytes(probe)).not.toContain(".");
      }
    });

    it("rundet MB auf eine Nachkommastelle", () => {
      // 15 MB ist die Paketgrenze, wie sie im Dokumentenpaket-Dialog erscheint;
      // knapp darunter muss sichtbar bleiben, dass es knapp ist.
      expect(formatBytes(15 * 1024 * 1024 - 1)).toBe("15,0 MB");
      expect(formatBytes(14.44 * 1024 * 1024)).toBe("14,4 MB");
      expect(formatBytes(14.46 * 1024 * 1024)).toBe("14,5 MB");
    });
  });
});

describe("formatEmployeeName", () => {
  it("setzt Vor- und Nachname mit einem Leerzeichen zusammen", () => {
    expect(
      formatEmployeeName({ employeeFirstName: "Anna", employeeLastName: "Mueller" }),
    ).toBe("Anna Mueller");
  });

  it("trimmt, wenn ein Teil fehlt — kein Leerzeichen am Rand", () => {
    // Der Name landet in Mail-Betreffs und Audit-Logs; ein fuehrendes oder
    // haengendes Leerzeichen faellt dort erst beim Lesen auf.
    expect(
      formatEmployeeName({ employeeFirstName: "", employeeLastName: "Mueller" }),
    ).toBe("Mueller");
    expect(
      formatEmployeeName({ employeeFirstName: "Anna", employeeLastName: "" }),
    ).toBe("Anna");
  });
});

describe("formatDatumDE", () => {
  it("formatiert ein Date als TT.MM.JJJJ mit fuehrenden Nullen", () => {
    expect(formatDatumDE(new Date("2026-08-01T00:00:00.000Z"))).toBe("01.08.2026");
  });

  it("nimmt den Kalendertag in deutscher Zeit, nicht in UTC", () => {
    // 22:00 UTC ist in der Sommerzeit schon 00:00 des Folgetags. Der
    // Container laeuft in UTC; die Serverzeit ergaebe hier den 30.08.
    expect(formatDatumDE("2026-08-30T22:00:00.000Z")).toBe("31.08.2026");
    // Winterzeit: eine Stunde Versatz.
    expect(formatDatumDE("2026-12-31T23:30:00.000Z")).toBe("01.01.2027");
  });

  it("laesst die als UTC-Mitternacht gespeicherten Tagesdaten auf ihrem Tag", () => {
    // So liegen lastWorkingDay & Co. in der Datenbank (new Date("2026-08-31")).
    expect(formatDatumDE("2026-08-31T00:00:00.000Z")).toBe("31.08.2026");
  });

  it("stellt ein reines Kalenderdatum ohne Zeitzonen-Umweg um", () => {
    expect(formatDatumDE("2026-08-31")).toBe("31.08.2026");
  });

  it("reicht ein schon deutsch formatiertes Datum durch — ohne Tag und Monat zu tauschen", () => {
    // Der eigentliche Fehler: new Date("31.12.2026") ist Invalid Date, und
    // new Date("01.08.2026") liest der Parser als 8. Januar.
    expect(formatDatumDE("31.12.2026")).toBe("31.12.2026");
    expect(formatDatumDE("01.08.2026")).toBe("01.08.2026");
    expect(formatDatumDE("1.8.2026")).toBe("01.08.2026");
  });

  it("liefert fuer Leeres und Unlesbares einen leeren Text statt 'Invalid Date'", () => {
    expect(formatDatumDE(null)).toBe("");
    expect(formatDatumDE(undefined)).toBe("");
    expect(formatDatumDE("")).toBe("");
    expect(formatDatumDE("   ")).toBe("");
    expect(formatDatumDE("demnaechst")).toBe("");
    expect(formatDatumDE(new Date("kaputt"))).toBe("");
  });
});
