/**
 * Tests: Standardtext und Abweichung einer E-Mail-Vorlage
 * (src/lib/email-vorlagen-standard.ts)
 *
 * Der Vergleich soll genau das als „gleich“ werten, was das Speichern ohnehin
 * veraendert (Trim, leerer Plaintext → null, CRLF, Leerzeichen am
 * Zeilenende) — und jede echte Textaenderung als Abweichung melden.
 */

import {
  STANDARD_TEXT_FELDER,
  abweichendeFelder,
  normalisiereVorlagenText,
  standardFassung,
  weichtVomStandardAb,
} from "@/lib/email-vorlagen-standard";
import { DEFAULT_EMAIL_TEMPLATES } from "@/lib/default-email-templates";

const BASIS = {
  subject: "Einstellungsmodalitäten für {{mitarbeiter_name}}",
  bodyHtml: "<p>Stellenbezeichnung</p>\n<p>Vertragsbeginn</p>",
  bodyText: "Stellenbezeichnung\nVertragsbeginn",
};

describe("normalisiereVorlagenText", () => {
  it("behandelt null, undefined und Leerstring gleich", () => {
    expect(normalisiereVorlagenText(null)).toBe("");
    expect(normalisiereVorlagenText(undefined)).toBe("");
    expect(normalisiereVorlagenText("   \n  ")).toBe("");
  });

  it("vereinheitlicht Zeilenenden und entfernt Leerzeichen am Zeilenende", () => {
    expect(normalisiereVorlagenText("a  \r\nb\t\rc")).toBe("a\nb\nc");
  });

  it("laesst Einrueckung und Leerzeilen im Inneren stehen", () => {
    expect(normalisiereVorlagenText("a\n\n  b")).toBe("a\n\n  b");
  });
});

describe("weichtVomStandardAb / abweichendeFelder", () => {
  it("gleicher Text: keine Abweichung", () => {
    expect(weichtVomStandardAb({ ...BASIS }, BASIS)).toBe(false);
    expect(abweichendeFelder({ ...BASIS }, BASIS)).toEqual([]);
  });

  it("was das Speichern veraendert, zaehlt nicht als Abweichung", () => {
    const gespeichert = {
      subject: `  ${BASIS.subject} `,
      bodyHtml: BASIS.bodyHtml.replace(/\n/g, "  \r\n"),
      bodyText: `\n${BASIS.bodyText}\n`,
    };
    expect(weichtVomStandardAb(gespeichert, BASIS)).toBe(false);
  });

  it("leerer Plaintext im Standard und null in der Datenbank sind gleich", () => {
    expect(weichtVomStandardAb({ ...BASIS, bodyText: null }, { ...BASIS, bodyText: "" })).toBe(false);
  });

  it("meldet jedes geaenderte Feld in fester Reihenfolge", () => {
    const gespeichert = {
      subject: "Anderer Betreff",
      bodyHtml: BASIS.bodyHtml,
      bodyText: BASIS.bodyText.replace("Stellenbezeichnung", "Stellenbeschreibung"),
    };
    expect(abweichendeFelder(gespeichert, BASIS)).toEqual(["subject", "bodyText"]);
    expect(weichtVomStandardAb(gespeichert, BASIS)).toBe(true);
  });

  it("zusaetzliche Leerzeile mitten im Text zaehlt als Abweichung", () => {
    const gespeichert = { ...BASIS, bodyText: "Stellenbezeichnung\n\nVertragsbeginn" };
    expect(abweichendeFelder(gespeichert, BASIS)).toEqual(["bodyText"]);
  });

  it("fehlender Plaintext bei vorhandenem Standard-Plaintext zaehlt als Abweichung", () => {
    expect(abweichendeFelder({ ...BASIS, bodyText: null }, BASIS)).toEqual(["bodyText"]);
  });

  it("vergleicht genau Betreff, HTML und Plaintext", () => {
    expect([...STANDARD_TEXT_FELDER]).toEqual(["subject", "bodyHtml", "bodyText"]);
  });
});

describe("standardFassung", () => {
  it("liefert null fuer Events ohne Code-Default", () => {
    expect(standardFassung("gibt-es-nicht")).toBeNull();
  });

  it("liefert fuer jedes Default-Event den getrimmten Standardtext samt Variablen", () => {
    for (const vorlage of DEFAULT_EMAIL_TEMPLATES) {
      const fassung = standardFassung(vorlage.event);
      expect(fassung).not.toBeNull();
      expect(fassung!.subject).toBe(vorlage.subject.trim());
      expect(fassung!.bodyHtml).toBe(vorlage.bodyHtml.trim());
      expect(fassung!.bodyText).toBe(vorlage.bodyText.trim() || null);
      expect(fassung!.variables).toBe(vorlage.variables);
    }
  });

  it("eine zurueckgesetzte Vorlage weicht nicht mehr vom Standard ab", () => {
    // Rundlauf: Was das Zuruecksetzen schreibt, muss die Liste als „gleich“
    // erkennen — sonst stuende nach dem Klick weiter „weicht ab“ da.
    for (const vorlage of DEFAULT_EMAIL_TEMPLATES) {
      const fassung = standardFassung(vorlage.event)!;
      expect({ event: vorlage.event, abweichend: weichtVomStandardAb(fassung, vorlage) }).toEqual({
        event: vorlage.event,
        abweichend: false,
      });
    }
  });
});
