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

import { formatBytes, formatEmployeeName } from "@/lib/format";

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
