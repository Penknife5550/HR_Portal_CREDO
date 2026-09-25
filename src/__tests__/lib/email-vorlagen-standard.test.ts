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

/**
 * Paket 4 „Unterlagen nachfordern“: die fuenf neuen Standardvorlagen. Was sie
 * mit echten Payloads ergeben, prueft src/__tests__/lib/unterlagen-mails.test.ts;
 * hier geht es um den Aufbau der Vorlagen selbst.
 */
describe("Standardvorlagen der Nachforderung (Paket 4)", () => {
  const PERSON = ["unterlagen-angefordert", "unterlagen-erinnerung", "unterlage-zurueckgewiesen"];
  const HR = ["unterlagen-vollstaendig", "unterlagen-frist-verstrichen"];
  const vorlage = (event: string) => DEFAULT_EMAIL_TEMPLATES.find((t) => t.event === event)!;

  it("es gibt alle fuenf, jede mit Textteil und Variablenliste", () => {
    for (const event of [...PERSON, ...HR]) {
      const v = vorlage(event);
      expect({ event, da: Boolean(v) }).toEqual({ event, da: true });
      expect(v.bodyText.trim().length).toBeGreaterThan(100);
      expect(v.variables.length).toBeGreaterThan(5);
    }
  });

  it("jede traegt die CREDO-Linie — die Kopfzeile passt also zum historischen Geruest", () => {
    // applyCredoCi setzt die Linie per Regex hinter die Kopfzeile. Weicht deren
    // Stil ab, fehlt die Linie still.
    for (const event of [...PERSON, ...HR]) {
      const html = vorlage(event).bodyHtml;
      expect({ event, linie: html.includes('bgcolor="#FBC900"') }).toEqual({ event, linie: true });
      expect(html).not.toContain("#1a1a2e");
      expect(html).not.toContain("#2563eb");
    }
  });

  it("die Mails an die Person tragen den Link im Knopf, im Ersatzlink und im Textteil — nie im Betreff", () => {
    for (const event of PERSON) {
      const v = vorlage(event);
      expect(v.bodyHtml.match(/href="\{\{link\}\}"/g)).toHaveLength(2);
      expect(v.bodyText).toContain("{{link}}");
      expect(v.subject).not.toContain("link");
    }
  });

  it("die Mails an die Person warnen vor Unterlagen per E-Mail und vor dem Weiterleiten", () => {
    for (const event of PERSON) {
      for (const teil of [vorlage(event).bodyHtml, vorlage(event).bodyText]) {
        expect(teil).toContain("Bitte senden Sie Unterlagen nicht per E-Mail, sondern nur über den Link.");
        expect(teil).toContain("Der Link ist persönlich, bitte nicht weiterleiten.");
      }
    }
  });

  it("das Linkende steht nur im Block „Frist verstrichen“ — sonst nennt die Mail ein Datum, die Frist", () => {
    for (const event of PERSON) {
      for (const teil of [vorlage(event).bodyHtml, vorlage(event).bodyText]) {
        const ohneBlock = teil.replace(/\{\{#frist_verstrichen\}\}[\s\S]*?\{\{\/frist_verstrichen\}\}/g, "");
        expect({ event, rest: ohneBlock.includes("link_gueltig_bis") }).toEqual({ event, rest: false });
        expect(ohneBlock).not.toContain("{{ablaufdatum}}");
      }
    }
  });

  it("die HR-Mails verweisen auf das Portal und nennen keine Unterlage", () => {
    for (const event of HR) {
      const v = vorlage(event);
      expect(v.bodyHtml).toContain('href="{{portalLink}}"');
      expect(v.bodyText).toContain("{{portalLink}}");
      for (const teil of [v.subject, v.bodyHtml, v.bodyText]) {
        expect(teil).not.toMatch(/\{\{(unterlage|unterlagenliste|begruendung|nachricht|link|email)(_html)?\}\}/);
      }
      // MITARBEITER_NEUTRAL ist ein Akkusativ: der Name nur nach „für“.
      for (const teil of [v.subject, v.bodyHtml, v.bodyText]) {
        for (const treffer of teil.matchAll(/(\S+)\s+\{\{mitarbeiter_name\}\}/g)) {
          expect({ event, davor: treffer[1] }).toEqual({ event, davor: "für" });
        }
      }
    }
  });

  it("der Knopf der HR-Mails verspricht nicht mehr, als der Link haelt", () => {
    // portalLink fuehrt auf den Vorgang (Reiter „Dokumente“, `?tab=dokumente`),
    // nicht auf die Nachforderung selbst — beschriftet wie die Nachbarvorlagen.
    const v = vorlage("unterlagen-frist-verstrichen");
    expect(v.bodyHtml).toContain("Vorgang im Portal öffnen →");
    expect(v.bodyText).toContain("Vorgang im Portal: {{portalLink}}");
    for (const event of HR) {
      for (const teil of [vorlage(event).bodyHtml, vorlage(event).bodyText]) {
        expect(teil).not.toContain("Nachforderung im Portal öffnen");
      }
    }
  });

  it("kein Bedingungsblock steht in einem anderen (renderTemplate loest innere nicht auf)", () => {
    for (const event of [...PERSON, ...HR]) {
      const v = vorlage(event);
      for (const teil of [v.subject, v.bodyHtml, v.bodyText]) {
        for (const block of teil.matchAll(/\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g)) {
          expect({ event, block: block[1], innen: /\{\{[#/]/.test(block[2]) }).toEqual({
            event,
            block: block[1],
            innen: false,
          });
        }
      }
    }
  });
});

/**
 * Ergaenzung Z3 der Feinplanung: Im Onboarding kann HR selbst nichts hochladen.
 * Die beiden HR-Mails zum Ablauf eines Titels verweisen deshalb auf die
 * Nachforderung — in HTML UND Textteil.
 */
describe("Ablauf-Mails verweisen auf „Unterlagen nachfordern“ (Z3)", () => {
  const vorlage = (event: string) => DEFAULT_EMAIL_TEMPLATES.find((t) => t.event === event)!;

  it.each(["dokument-ablauf-warnung", "dokument-abgelaufen"])("%s traegt den neuen Satz in HTML und Text", (event) => {
    const v = vorlage(event);
    for (const teil of [v.bodyHtml, v.bodyText]) {
      expect(teil).toContain("im Vorgang über „Unterlagen nachfordern“ an; sobald Sie");
      expect(teil).toMatch(/annehmen, endet (die Warnung|diese Erinnerung)\.?\{\{\/nachforderung_moeglich\}\}/);
      expect(teil).not.toContain("als Nachweis hoch");
      // Nur, wo das Portal die Nachforderung anbietet; sonst der Hinweis mit Grund.
      expect(teil).toContain("{{#nachforderung_moeglich}}");
      expect(teil).toContain("{{#nachforderung_gesperrt}} {{nachforderung_hinweis}}{{/nachforderung_gesperrt}}");
    }
  });

  it("dokument-ablauf-warnung nennt auch den Weg „Unbefristet“ (Z1, Niederlassungserlaubnis)", () => {
    // Nach einem befristeten Titel folgt oft die Niederlassungserlaubnis ohne
    // Ablaufdatum. Das Kennzeichen „unbefristet“ beendet die Erinnerung
    // ebenso — nennte die Mail nur das Ablaufdatum, suchte HR eines, das es
    // nicht gibt. Die Vorlage wird nach dem Deploy nur einmal zurueckgesetzt.
    const v = vorlage("dokument-ablauf-warnung");
    expect(v.bodyHtml).toContain(
      "sobald Sie ihn <strong>mit seinem Ablaufdatum</strong> oder – etwa bei einer Niederlassungserlaubnis – als <strong>„Unbefristet“</strong> annehmen, endet diese Erinnerung.",
    );
    expect(v.bodyText).toContain(
      "sobald Sie ihn mit seinem Ablaufdatum oder – etwa bei einer Niederlassungserlaubnis – als „Unbefristet“ annehmen, endet diese Erinnerung.",
    );
    for (const teil of [v.bodyHtml, v.bodyText]) {
      expect(teil).toContain("Sie endet, sobald ein Nachweis mit späterer Frist oder ein unbefristeter Nachweis im Vorgang liegt.");
    }
  });

  it("dokument-abgelaufen: die Fiktionsbescheinigung wird nachgefordert, nicht von HR hochgeladen — als die gemahnte Art", () => {
    // Der Lauf mahnt Aufenthaltstitel UND Arbeitserlaubnis; die Warnung endet
    // nur mit einem Nachweis DERSELBEN Art. Ein fest geschriebenes
    // „als Aufenthaltstitel" beendete die Mahnung zur Arbeitserlaubnis nie.
    const v = vorlage("dokument-abgelaufen");
    for (const teil of [v.bodyHtml, v.bodyText]) {
      expect(teil).toContain(
        "— dann fordern Sie diese im Vorgang über „Unterlagen nachfordern“ an; sobald Sie sie als {{dokument_typ}} mit ihrem Ablaufdatum annehmen, endet die Warnung",
      );
      expect(teil).not.toContain("als Aufenthaltstitel mit ihrem Ablaufdatum");
    }
  });
});
