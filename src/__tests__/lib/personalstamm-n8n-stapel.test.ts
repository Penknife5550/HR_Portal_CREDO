/**
 * Tests: Code-Knoten „Stapel bilden" des n8n-Stammablaufs (Self-Service S0)
 *
 * Der Knoten steht zweimal im Repository: in der Anleitung
 * (docs/module/selfservice/s0-personalstamm-n8n.md, Abschnitt 3.2) und in der
 * Importvorlage (s0-personalstamm-n8n.json). Beide muessen gleich sein. Der
 * Abgleich wertet nur Zeilen im selben Stapel zusammen aus; der Knoten legt
 * deshalb alle Zeilen einer Adresse, eines Vertragsschluessels und eines
 * Namens in denselben Stapel — sonst hinge etwa der Schutz vor falscher
 * Stilllegung davon ab, wie die Stapel geschnitten sind.
 */

import fs from "fs";
import path from "path";

const ORDNER = path.join(process.cwd(), "docs", "module", "selfservice");
const anleitung = fs.readFileSync(path.join(ORDNER, "s0-personalstamm-n8n.md"), "utf-8");
const vorlage = JSON.parse(fs.readFileSync(path.join(ORDNER, "s0-personalstamm-n8n.json"), "utf-8")) as {
  nodes: { name: string; parameters: { jsCode?: string } }[];
};
const CODE = vorlage.nodes.find((n) => n.name === "Stapel bilden")?.parameters.jsCode ?? "";

type Zeile = Record<string, unknown>;

/** Fuehrt den Knoten aus wie n8n („Run Once for All Items"). */
function stapelBilden(zeilen: Zeile[]): Zeile[][] {
  const knoten = new Function("$input", CODE) as (input: { all: () => { json: Zeile }[] }) => { json: { eintraege: Zeile[] } }[];
  return knoten({ all: () => zeilen.map((json) => ({ json })) }).map((s) => s.json.eintraege);
}

function zeile(personalNr: string, email: string | null, vorname: string, nachname: string): Zeile {
  return {
    mandantNummer: "742",
    abrechnungskreis: "01",
    personalNr,
    vorname,
    nachname,
    email,
    teilzeitstunden: null,
    vertragsbeginn: "2024-08-01",
    vertragsende: null,
  };
}

/** n verschiedene Menschen: je eigene Adresse, eigener Name, eigener Schluessel. */
const fuellzeilen = (n: number) =>
  Array.from({ length: n }, (_, i) => zeile(`9${i}`, `person${i}@fes-minden.de`, `Vorname${i}`, `Nachname${i}`));

function stapelVon(stapel: Zeile[][], personalNr: string): number {
  return stapel.findIndex((s) => s.some((z) => z.personalNr === personalNr));
}

describe("n8n-Code-Knoten „Stapel bilden“", () => {
  it("steht in Anleitung und Importvorlage gleich", () => {
    const bloecke = [...anleitung.matchAll(/```js\n([\s\S]*?)```/g)].map((m) => m[1]);
    expect(bloecke).toHaveLength(1);
    expect(CODE).not.toBe("");
    expect(bloecke[0]).toBe(CODE);
  });

  it("legt die Zeilen einer Adresse, eines Schluessels und eines Namens in denselben Stapel, auch ohne Adresse", () => {
    // SQL Server sortiert NULL zuerst: Die Zeile ohne Adresse kommt vor allen anderen.
    const stapel = stapelBilden([
      zeile("1001", null, "Anna", "Beispiel"), // beendet, Postfach ausgetragen
      ...fuellzeilen(199),
      zeile("1002", " Anna.Beispiel@FES-Minden.de ", " ANNA ", "Beispiel"), // Anschluss, gleicher Name
      zeile("77", "anna.beispiel@fes-minden.de", "Bernd", "Muster"), // geteiltes Postfach
      zeile("1001", "clara.probe@mvs-minden.de", "Clara", "Probe"), // derselbe Schluessel
    ]);

    expect(stapel.map((s) => s.length)).toEqual([200, 3]);
    const ersterStapel = stapelVon(stapel, "1002");
    for (const personalNr of ["1001", "77"]) expect(stapelVon(stapel, personalNr)).toBe(ersterStapel);
    expect(stapel.flat().filter((z) => z.personalNr === "1001")).toHaveLength(2);
    expect(stapel[ersterStapel].filter((z) => z.personalNr === "1001")).toHaveLength(2);
  });

  it("legt Zeilen ohne Adresse und ohne Namen nicht zusammen", () => {
    const ohneAlles = Array.from({ length: 201 }, (_, i) => zeile(`8${i}`, null, "", " "));

    const stapel = stapelBilden(ohneAlles);

    expect(stapel.map((s) => s.length)).toEqual([200, 1]);
  });
});
