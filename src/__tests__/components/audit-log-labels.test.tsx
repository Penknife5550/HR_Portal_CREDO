/**
 * @jest-environment jsdom
 */

/**
 * Die Uebersetzungstabelle des Protokolls.
 *
 * Ohne Eintrag zeigt `/audit-log` den rohen Code — `DOKUMENTE_NACHZUREICHEN`
 * stand dort unuebersetzt in der Zeile. Das faellt niemandem auf, der die
 * Tabelle nicht liest, deshalb steht es hier.
 *
 * jsdom, weil die Funktion aus einer Client-Komponente kommt und deren Import
 * React-Module mitzieht.
 */
import { getActionLabel } from "@/app/(portal)/audit-log/audit-log-content";

describe("Protokoll-Beschriftungen", () => {
  test("der Vermerk „Nachweis offen\" ist uebersetzt", () => {
    expect(getActionLabel("DOKUMENTE_NACHZUREICHEN")).toBe(
      "Nachweise nachzureichen",
    );
  });

  test("ein unbekannter Code faellt auf sich selbst zurueck", () => {
    // Bewusst so: Eine erfundene Beschriftung waere schlimmer als der Code.
    expect(getActionLabel("GIBT_ES_NICHT")).toBe("GIBT_ES_NICHT");
  });
});
