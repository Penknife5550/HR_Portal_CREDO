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
import { ABTEILUNGS_AUDIT, ABTEILUNGS_AUDIT_LABELS } from "@/lib/abteilungsaufgaben";
import { UNTERLAGEN_AUDIT, UNTERLAGEN_AUDIT_LABELS } from "@/lib/unterlagen";
import { INDIVIDUELLE_MAIL_AUDIT_LABELS } from "@/lib/individuelle-mail";
import { AUSSTATTUNG_AUDIT, AUSSTATTUNG_AUDIT_LABELS } from "@/lib/ausstattung";

describe("Protokoll-Beschriftungen", () => {
  // Paket 1b: Die Abteilungsaufgaben schreiben neue Codes (ABTEILUNGS_AUDIT).
  // Ohne Beschriftung stuenden sie roh im Protokoll und in der Filterliste.
  test.each([
    ["DEPARTMENT_LINKS_SENT", "Abteilungen informiert"],
    ["DEPARTMENT_LINK_RESENT", "Abteilungs-Mail erneut gesendet"],
    ["DEPARTMENT_REMINDER_SENT", "Abteilung erinnert"],
    ["OFFBOARDING_REMINDER_SENT", "Abteilung automatisch erinnert"],
    ["DEPARTMENT_LINK_RENEWED", "Abteilungs-Link erneuert"],
    // Paket A3 (Ausstattung & Zugaenge, Regel 10)
    ["DEPARTMENT_NACHTRAG_SENT", "Nachtrag an Abteilung gesendet"],
    // Paket A3 (E-A20): Absage an die informierten Stellen nach EXPIRED
    ["DEPARTMENT_ABSAGE_SENT", "Absage an Abteilungen gesendet"],
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

  // Paket 4: Unterlagen nachfordern (Feinplanung Abschnitt 11). Dieselbe
  // Regel wie oben — jeder Code, den Dienst, Upload-Route oder Lauf schreibt,
  // braucht eine Beschriftung.
  test.each([
    ["UNTERLAGEN_ANGEFORDERT", "Unterlagen angefordert"],
    ["UNTERLAGEN_ERGAENZT", "Nachforderung ergänzt"],
    ["UNTERLAGEN_FRIST_GEAENDERT", "Frist der Nachforderung geändert"],
    ["UNTERLAGEN_LINK_ERNEUT_GESENDET", "Unterlagen-Link erneut gesendet"],
    ["UNTERLAGEN_ZURUECKGEZOGEN", "Nachforderung zurückgezogen"],
    ["UNTERLAGEN_UEBERMITTELT", "Unterlagen übermittelt (Link)"],
    ["UNTERLAGE_ANGENOMMEN", "Unterlage angenommen"],
    ["UNTERLAGE_ZURUECKGEWIESEN", "Unterlage zurückgewiesen"],
    ["UNTERLAGE_ENTFAELLT", "Unterlage entfällt"],
    ["UNTERLAGE_ANNAHME_ZURUECKGENOMMEN", "Annahme einer Unterlage zurückgenommen"],
    ["UNTERLAGEN_ERLEDIGT", "Nachforderung erledigt"],
    ["UNTERLAGEN_DATEI_GEOEFFNET", "Nachgereichte Datei geöffnet"],
    ["UNTERLAGEN_ERINNERT", "Erinnerung an Unterlagen gesendet"],
    ["UNTERLAGEN_HR_GEMELDET", "HR über Unterlagen informiert"],
    ["UNTERLAGEN_MAIL_NACHGEHOLT", "Unterlagen-Mail nachgeholt"],
    ["UNTERLAGEN_DATEIEN_GELOESCHT", "Unterlagen-Dateien gelöscht (Aufbewahrung)"],
  ])("Unterlagen nachfordern: %s heißt „%s“", (code, label) => {
    expect(getActionLabel(code)).toBe(label);
  });

  test("DOKUMENT_GEOEFFNET (gehärtete Download-Route) ist übersetzt", () => {
    expect(getActionLabel("DOKUMENT_GEOEFFNET")).toBe("Vertrauliches Dokument geöffnet");
  });

  test("jeder Code aus UNTERLAGEN_AUDIT hat eine Beschriftung, und keine steht ohne Code", () => {
    for (const code of Object.values(UNTERLAGEN_AUDIT)) {
      expect(getActionLabel(code)).not.toBe(code);
    }
    // Gegenrichtung: Eine Beschriftung ohne Code waere ein Tippfehler im
    // Schluessel — der echte Code stuende dann weiter roh im Protokoll.
    expect(Object.keys(UNTERLAGEN_AUDIT_LABELS).sort()).toEqual(
      [...new Set(Object.values(UNTERLAGEN_AUDIT))].sort(),
    );
  });

  test("die Unterlagen-Beschriftungen ueberschreiben keinen bestehenden Code", () => {
    // Die Tabelle wird per Spread angehaengt; ein gleichnamiger Schluessel
    // haette die aeltere Beschriftung still ersetzt.
    for (const code of Object.values(ABTEILUNGS_AUDIT)) {
      expect(Object.keys(UNTERLAGEN_AUDIT_LABELS)).not.toContain(code);
    }
    expect(getActionLabel("DOKUMENT_FRIST_GEAENDERT")).toBe("Ablaufdatum geändert");
  });

  test("der alte Code DEPARTMENT_LINKS_GENERATED bleibt fuer Alteintraege lesbar", () => {
    expect(getActionLabel("DEPARTMENT_LINKS_GENERATED")).toBe("Abteilungs-Links erstellt");
  });

  test("der Vermerk „Nachweis offen\" ist uebersetzt", () => {
    expect(getActionLabel("DOKUMENTE_NACHZUREICHEN")).toBe(
      "Nachweise nachzureichen",
    );
  });

  test("die Codes der befristeten Nachweise sind uebersetzt", () => {
    // DOKUMENT_FRIST_GEAENDERT schreiben HR und seit der Durchsicht 09/2026
    // auch der Magic Link (Statusruecknahme) — beide landen in derselben Zeile.
    expect(getActionLabel("DOKUMENT_FRIST_GEAENDERT")).toBe("Ablaufdatum geändert");
    expect(getActionLabel("DOKUMENT_ABLAUF_ERINNERT")).toBe("Ablauf-Erinnerung gesendet");
  });

  test("die Codes der individuellen E-Mail (Paket 3) sind uebersetzt", () => {
    expect(getActionLabel("INDIVIDUELLE_MAIL_SENT")).toBe("Individuelle E-Mail versendet");
    expect(getActionLabel("INDIVIDUELLE_MAIL_NACHWEIS_FEHLGESCHLAGEN")).toBe(
      "Individuelle E-Mail versendet, Nachweis fehlgeschlagen",
    );
    expect(getActionLabel("INDIVIDUELLE_MAIL_ANHANG_GEOEFFNET")).toBe("Anhang einer individuellen E-Mail geöffnet");
  });

  // Ausstattung & Zugaenge (Feinplan 1.15, Schritt S1): dieselbe Regel – jeder
  // Code aus AUSSTATTUNG_AUDIT steht uebersetzt im Protokoll.
  test.each(Object.entries(AUSSTATTUNG_AUDIT))(
    "Ausstattung & Zugänge: %s ist übersetzt",
    (_schluessel, code) => {
      expect(getActionLabel(code)).toBe(AUSSTATTUNG_AUDIT_LABELS[code]);
      expect(getActionLabel(code)).not.toBe(code);
    },
  );

  test("die Ausstattungs-Beschriftungen ueberschreiben keinen bestehenden Code", () => {
    // Per Spread angehaengt: Ein gleichnamiger Schluessel ersetzte die aeltere
    // Beschriftung still.
    const bestehend = [
      ...Object.keys(ABTEILUNGS_AUDIT_LABELS),
      ...Object.keys(UNTERLAGEN_AUDIT_LABELS),
      ...Object.keys(INDIVIDUELLE_MAIL_AUDIT_LABELS),
    ];
    for (const code of Object.keys(AUSSTATTUNG_AUDIT_LABELS)) {
      expect(bestehend).not.toContain(code);
    }
    expect(getActionLabel("STATUS_CHANGED")).toBe("Status geändert");
  });

  test("die Codes des Reiters „Rückgaben“ (Offboarding) sind uebersetzt", () => {
    // Schreibt /api/offboarding/:id/return-items (Anlegen, Bestaetigen, Loeschen).
    expect(getActionLabel("RETURN_ITEM_CREATED")).toBe("Rückgabe-Gegenstand erfasst");
    expect(getActionLabel("RETURN_ITEM_UPDATED")).toBe("Rückgabe aktualisiert");
    expect(getActionLabel("RETURN_ITEM_DELETED")).toBe("Rückgabe-Gegenstand gelöscht");
  });

  test("ein unbekannter Code faellt auf sich selbst zurueck", () => {
    // Bewusst so: Eine erfundene Beschriftung waere schlimmer als der Code.
    expect(getActionLabel("GIBT_ES_NICHT")).toBe("GIBT_ES_NICHT");
  });
});
