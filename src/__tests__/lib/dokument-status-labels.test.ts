/**
 * Tests: Anzeige zu `DocumentStatus` (src/lib/constants.ts).
 *
 * Der Anlass ist ein stiller Fehler, den kein Typ und kein Linter sieht: Das
 * Schema bekam den Wert `EXPIRED`, der naechtliche Cron schrieb ihn — und beide
 * Stellen, die einen Dokumentstatus anzeigen (Onboarding- und
 * Offboarding-Detailseite), fuehrten eine eigene Kopie der Tabelle OHNE diesen
 * Wert. Der Rueckfall `|| UPLOADED` machte daraus keinen leeren Platz, sondern
 * die gegenteilige Aussage: Der abgelaufene Aufenthaltstitel trug das graue
 * Abzeichen "Hochgeladen" — neben dem roten "Abgelaufen" der Fristen-Ampel auf
 * derselben Karte.
 *
 * Die Zusicherung liest deshalb die Wahrheit aus `prisma/schema.prisma` und
 * nicht aus einer im Test wiederholten Liste: Eine mitgepflegte Liste faellt
 * beim naechsten neuen Enum-Wert genauso durch wie die Tabelle, die sie
 * absichern soll. Und sie liest das Schema statt `@prisma/client`, weil der
 * generierte Client im Test nicht vorausgesetzt werden kann.
 */
import { readFileSync } from "fs";
import { join } from "path";
import { DOCUMENT_STATUS_LABELS, documentStatusLabel } from "@/lib/constants";

/** Die Werte des Enums `DocumentStatus` aus dem Schema — die einzige Wahrheit. */
function documentStatusWerte(): string[] {
  const schema = readFileSync(join(process.cwd(), "prisma", "schema.prisma"), "utf8");
  const block = /enum\s+DocumentStatus\s*\{([\s\S]*?)\}/.exec(schema);
  if (!block) throw new Error("enum DocumentStatus nicht in prisma/schema.prisma gefunden");

  return block[1]
    .split("\n")
    .map((zeile) => zeile.trim())
    // Kommentarzeilen (/// und //) und Leerzeilen raus; uebrig bleiben die Werte.
    .filter((zeile) => zeile.length > 0 && !zeile.startsWith("/"))
    .map((zeile) => zeile.split(/\s+/)[0]);
}

describe("Dokument-Status-Labels", () => {
  it("findet die Enum-Werte im Schema (sonst prueft der Test nichts)", () => {
    const werte = documentStatusWerte();
    expect(werte.length).toBeGreaterThanOrEqual(5);
    expect(werte).toContain("UPLOADED");
    expect(werte).toContain("EXPIRED");
  });

  it("hat zu JEDEM Status des Schemas eine Anzeige", () => {
    for (const wert of documentStatusWerte()) {
      expect({ wert, label: DOCUMENT_STATUS_LABELS[wert]?.label }).toEqual({
        wert,
        label: expect.any(String),
      });
      expect(DOCUMENT_STATUS_LABELS[wert].label.length).toBeGreaterThan(0);
      expect(DOCUMENT_STATUS_LABELS[wert].color).toMatch(/\S/);
    }
  });

  it("nennt den abgelaufenen Nachweis abgelaufen — und faerbt ihn nicht wie ein gewoehnliches Papier", () => {
    expect(DOCUMENT_STATUS_LABELS.EXPIRED.label).toBe("Abgelaufen");
    expect(DOCUMENT_STATUS_LABELS.EXPIRED.color).not.toBe(
      DOCUMENT_STATUS_LABELS.UPLOADED.color
    );
    // Und unterscheidbar von der Ablehnung eines Scans: zwei verschiedene
    // Sachverhalte duerfen nicht dasselbe Abzeichen tragen.
    expect(DOCUMENT_STATUS_LABELS.EXPIRED.color).not.toBe(
      DOCUMENT_STATUS_LABELS.REJECTED.color
    );
  });

  it("faellt bei einem unbekannten Wert NICHT auf 'Hochgeladen' zurueck", () => {
    // Der alte Rueckfall war der eigentliche Schaden: Er machte aus einem
    // unbekannten Zustand die harmloseste aller Aussagen.
    const unbekannt = documentStatusLabel("VERNICHTET");
    expect(unbekannt.label).toBe("VERNICHTET");
    expect(unbekannt.label).not.toBe(DOCUMENT_STATUS_LABELS.UPLOADED.label);
  });

  it("liefert fuer bekannte Werte die Tabelle selbst", () => {
    expect(documentStatusLabel("EXPIRED")).toEqual(DOCUMENT_STATUS_LABELS.EXPIRED);
    expect(documentStatusLabel("APPROVED")).toEqual(DOCUMENT_STATUS_LABELS.APPROVED);
  });
});
