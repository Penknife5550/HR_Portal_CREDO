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
import { ABTEILUNGS_AUDIT } from "@/lib/abteilungsaufgaben";

describe("Protokoll-Beschriftungen", () => {
  // Paket 1b: Die Abteilungsaufgaben schreiben neue Codes (ABTEILUNGS_AUDIT).
  // Ohne Beschriftung stuenden sie roh im Protokoll und in der Filterliste.
  test.each([
    ["DEPARTMENT_LINKS_SENT", "Abteilungen informiert"],
    ["DEPARTMENT_LINK_RESENT", "Abteilungs-Mail erneut gesendet"],
    ["DEPARTMENT_REMINDER_SENT", "Abteilung erinnert"],
    ["OFFBOARDING_REMINDER_SENT", "Abteilung automatisch erinnert"],
    ["DEPARTMENT_LINK_RENEWED", "Abteilungs-Link erneuert"],
    ["ABTEILUNGSAUFGABE_ERLEDIGT", "Aufgabe per Link erledigt"],
    ["ABTEILUNGSAUFGABE_WIEDER_GEOEFFNET", "Aufgabe per Link wieder geöffnet"],
    ["ABTEILUNGSAUFGABE_KOMMENTIERT", "Kommentar der Abteilung"],
    ["DEPARTMENT_TASKS_COMPLETED", "Abteilung fertig"],
    ["DEPARTMENT_TASKS_REOPENED", "Abteilung wieder offen"],
    ["CHECKLIST_ITEM_UPDATED", "Checkliste aktualisiert"],
    ["DEPARTMENT_CONFIG_CREATED", "Abteilung angelegt"],
    ["DEPARTMENT_CONFIG_UPDATED", "Abteilung geändert"],
    ["DEPARTMENT_CONFIG_DELETED", "Abteilung gelöscht"],
  ])("Abteilungsaufgaben: %s heißt „%s“", (code, label) => {
    expect(getActionLabel(code)).toBe(label);
  });

  test("jeder Code, den der Dienst schreibt, hat eine Beschriftung", () => {
    for (const code of Object.values(ABTEILUNGS_AUDIT)) {
      expect(getActionLabel(code)).not.toBe(code);
    }
  });

  test("der alte Code DEPARTMENT_LINKS_GENERATED bleibt fuer Alteintraege lesbar", () => {
    expect(getActionLabel("DEPARTMENT_LINKS_GENERATED")).toBe("Abteilungs-Links erstellt");
  });

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
