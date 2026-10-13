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
 * Paket A3 (Ausstattung & Zugaenge): Die vier Onboarding-Abteilungsvorlagen
 * bekommen neue Bloecke ({{#arbeitsort}}, {{#angaben_html}}, {{#angaben}},
 * seit S17 {{#nachtrag}} und {{#hat_offene_aufgaben}}). Dieselbe Regel wie bei den Unterlagen: Bloecke nie
 * verschachteln — sonst bliebe ein innerer Marker woertlich in der Mail stehen.
 */
describe("Onboarding-Abteilungsvorlagen: flache Bedingungsbloecke (Paket A3)", () => {
  const ONBOARDING_ABTEILUNG = [
    "onboarding-department-assigned",
    "onboarding-department-reminder",
    "onboarding-task-completed",
    "onboarding-department-completed",
    // S18 (E-A18): die Sammelmail an HR haelt dieselbe Regel ein.
    "onboarding-ausstattung-offen",
  ];
  const vorlage = (event: string) => DEFAULT_EMAIL_TEMPLATES.find((t) => t.event === event)!;

  it("kein Bedingungsblock steht in einem anderen", () => {
    for (const event of ONBOARDING_ABTEILUNG) {
      const v = vorlage(event);
      expect({ event, gefunden: Boolean(v) }).toEqual({ event, gefunden: true });
      for (const teil of [v.subject, v.bodyHtml, v.bodyText ?? ""]) {
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

  it("jeder geoeffnete Block wird geschlossen (gleich viele Anfangs- und Schlussmarker je Name)", () => {
    for (const event of ONBOARDING_ABTEILUNG) {
      const v = vorlage(event);
      for (const teil of [v.subject, v.bodyHtml, v.bodyText ?? ""]) {
        const zaehlen = (zeichen: string) =>
          [...teil.matchAll(new RegExp(`\\{\\{${zeichen}(\\w+)\\}\\}`, "g"))].map((m) => m[1]).sort();
        expect({ event, auf: zaehlen("#") }).toEqual({ event, auf: zaehlen("/") });
      }
    }
  });

  it("die Zuweisungsmail zeigt Angaben und Arbeitsort in HTML und Text, die Erinnerung keine Angaben", () => {
    const zuweisung = vorlage("onboarding-department-assigned");
    expect(zuweisung.bodyHtml).toContain("{{#angaben_html}}{{angaben_html}}{{/angaben_html}}");
    expect(zuweisung.bodyText).toContain("{{#angaben}}{{angaben}}");
    expect(zuweisung.bodyHtml).toContain("{{#arbeitsort}}");
    expect(zuweisung.bodyText).toContain("{{#arbeitsort}}Arbeitsort: {{arbeitsort}}");
    // Rohtext nie ins HTML (dort steht das maskierte Feld), HTML-Feld nie in den Text.
    expect(zuweisung.bodyHtml).not.toMatch(/\{\{angaben\}\}/);
    expect(zuweisung.bodyText).not.toContain("angaben_html");
    const variablen = zuweisung.variables?.map((v) => v.key) ?? [];
    expect(variablen).toEqual(expect.arrayContaining(["{{angaben}}", "{{angaben_html}}", "{{arbeitsort}}"]));

    const erinnerung = vorlage("onboarding-department-reminder");
    for (const teil of [erinnerung.bodyHtml, erinnerung.bodyText ?? ""]) expect(teil).not.toContain("angaben");
  });

  // S17 (Regel 10, F7): Der Nachtrag steht flach in beiden Teilen, die
  // Aufgabenliste in {{#hat_offene_aufgaben}} — ein Nachtrag, der nur
  // „Entfällt“ meldet, hat keine offene Aufgabe und damit keine Liste.
  it("die Zuweisungsmail traegt den Nachtrag flach und die Aufgabenliste im Block {{#hat_offene_aufgaben}}", () => {
    const zuweisung = vorlage("onboarding-department-assigned");
    expect(zuweisung.bodyHtml).toMatch(/\{\{#nachtrag\}\}[\s\S]*\{\{nachtrag_liste_html\}\}[\s\S]*\{\{\/nachtrag\}\}/);
    expect(zuweisung.bodyText).toMatch(/\{\{#nachtrag\}\}[\s\S]*\{\{nachtrag_liste\}\}[\s\S]*\{\{\/nachtrag\}\}/);
    expect(zuweisung.bodyHtml).toContain("{{#hat_offene_aufgaben}}{{aufgabenliste_html}}{{/hat_offene_aufgaben}}");
    expect(zuweisung.bodyText).toMatch(/\{\{#hat_offene_aufgaben\}\}[\s\S]*\{\{aufgabenliste\}\}\{\{\/hat_offene_aufgaben\}\}/);
    // Rohtext nie ins HTML, HTML-Feld nie in den Text.
    expect(zuweisung.bodyHtml).not.toMatch(/\{\{nachtrag_liste\}\}/);
    expect(zuweisung.bodyText).not.toContain("nachtrag_liste_html");
    const variablen = zuweisung.variables?.map((v) => v.key) ?? [];
    expect(variablen).toEqual(
      expect.arrayContaining(["{{nachtrag}}", "{{nachtrag_liste}}", "{{nachtrag_liste_html}}", "{{hat_offene_aufgaben}}"]),
    );
    // Der Betreff bleibt ohne Nachtrag (betreffOhne sperrt die Liste ohnehin).
    expect(zuweisung.subject).not.toContain("nachtrag");
  });

  // S18 (E-A17): Die Erledigt-Meldung kennt zwei Anlaesse. Die Bloecke
  // {{#ist_erledigt}} und {{#nur_kommentar}} stehen nebeneinander — in HTML
  // UND Text —, der Betreff traegt nur die Kurzform.
  it("die Erledigt-Meldung hat je Anlass einen eigenen Satz, beide flach", () => {
    const erledigt = vorlage("onboarding-task-completed");
    expect(erledigt.subject).toBe("Onboarding-Aufgabe {{meldung_kurz}}: {{aufgabe}} ({{abteilung}})");
    for (const teil of [erledigt.bodyHtml, erledigt.bodyText ?? ""]) {
      expect(teil).toMatch(/\{\{#ist_erledigt\}\}[\s\S]*wurde als erledigt markiert[\s\S]*?\{\{\/ist_erledigt\}\}/);
      expect(teil).toMatch(/\{\{#nur_kommentar\}\}[\s\S]*einen Kommentar hinterlassen[\s\S]*?\{\{\/nur_kommentar\}\}/);
    }
    // Rohtext nie ins HTML, das maskierte Feld nie in den Text.
    expect(erledigt.bodyHtml).not.toContain("kommentar_text");
    expect(erledigt.bodyText).not.toMatch(/\{\{kommentar\}\}/);
    const variablen = erledigt.variables?.map((v) => v.key) ?? [];
    expect(variablen).toEqual(
      expect.arrayContaining(["{{meldung_kurz}}", "{{ist_erledigt}}", "{{nur_kommentar}}", "{{hr_postfach}}"]),
    );
  });

  it("die Sammelmail nennt Liste und Portal-Link nur im Text der Mail, nie im Betreff", () => {
    const sammel = vorlage("onboarding-ausstattung-offen");
    expect(sammel.bodyHtml).toContain("{{offene_liste_html}}");
    expect(sammel.bodyHtml).toContain('href="{{portalLink}}"');
    expect(sammel.bodyText).toContain("{{offene_liste}}");
    expect(sammel.bodyText).toContain("{{portalLink}}");
    expect(sammel.bodyHtml).not.toMatch(/\{\{offene_liste\}\}/);
    expect(sammel.bodyText).not.toContain("offene_liste_html");
    for (const name of ["offene_liste", "portalLink"]) expect(sammel.subject).not.toContain(name);
    // Historischer Kopf, den applyCredoCi in die CREDO-Linie umsetzt.
    expect(sammel.bodyHtml).toContain("background-color:#575756");
    expect(sammel.bodyHtml).not.toContain("#1a1a2e");
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
