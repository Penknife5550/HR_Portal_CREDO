/**
 * Tests: Event-Katalog (src/lib/events.ts)
 *
 * Sichert die Vollstaendigkeit des Katalogs ab:
 * - jedes Event mit Standard-E-Mail-Vorlage hat einen Katalog-Eintrag
 * - Event-Namen sind eindeutig
 * - Empfaenger-Defaults referenzieren nur Variablen, die der Beispiel-Payload
 *   (bzw. extractVariables) tatsaechlich liefert
 */

import {
  EVENT_CATALOG,
  EVENT_GROUP_ORDER,
  getEventDefinition,
  verboteneBetreffVariablen,
} from "@/lib/events";
import { DEFAULT_EMAIL_TEMPLATES } from "@/lib/default-email-templates";

describe("Event-Katalog", () => {
  it("enthaelt jedes Event aus den Standard-E-Mail-Vorlagen", () => {
    const missing = DEFAULT_EMAIL_TEMPLATES.filter(
      (t) => !getEventDefinition(t.event)
    ).map((t) => t.event);
    expect(missing).toEqual([]);
  });

  it("Anzeigenamen stimmen mit den Standard-Vorlagen ueberein", () => {
    for (const template of DEFAULT_EMAIL_TEMPLATES) {
      const def = getEventDefinition(template.event);
      expect({ event: template.event, name: def?.name }).toEqual({
        event: template.event,
        name: template.name,
      });
    }
  });

  it("hat eindeutige Event-Namen", () => {
    const events = EVENT_CATALOG.map((d) => d.event);
    expect(new Set(events).size).toBe(events.length);
  });

  it("ordnet jedes Event einer bekannten Gruppe zu", () => {
    for (const def of EVENT_CATALOG) {
      expect(EVENT_GROUP_ORDER).toContain(def.group);
    }
  });

  it("Empfaenger-Default-Variablen sind im Beispiel-Payload aufloesbar", () => {
    for (const def of EVENT_CATALOG) {
      const fields = [
        def.defaultRecipients.to,
        def.defaultRecipients.cc ?? "",
        def.defaultRecipients.bcc ?? "",
      ].join(",");

      const variables = [...fields.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]);
      for (const variable of variables) {
        expect({
          event: def.event,
          variable,
          vorhanden: variable in def.samplePayload,
        }).toEqual({ event: def.event, variable, vorhanden: true });
      }
    }
  });

  it("Beispiel-Payloads verwenden keine echten Personendaten-Domains", () => {
    for (const def of EVENT_CATALOG) {
      for (const value of Object.values(def.samplePayload)) {
        if (typeof value === "string" && value.includes("@")) {
          expect(value).toMatch(/@example\.org$/);
        }
      }
    }
  });
});

/**
 * Paket 4 „Unterlagen nachfordern“: fuenf Ereignisse in einer eigenen Gruppe.
 * Die Payloads selbst prueft src/__tests__/lib/unterlagen-mails.test.ts.
 */
describe("Event-Katalog — Gruppe „Unterlagen“ (Paket 4)", () => {
  const PERSON = ["unterlagen-angefordert", "unterlagen-erinnerung", "unterlage-zurueckgewiesen"];
  const HR = ["unterlagen-vollstaendig", "unterlagen-frist-verstrichen"];
  const unterlagen = () => EVENT_CATALOG.filter((d) => d.group === "Unterlagen");

  it("steht direkt hinter „Mutterschutz“", () => {
    expect(EVENT_GROUP_ORDER.indexOf("Unterlagen")).toBe(EVENT_GROUP_ORDER.indexOf("Mutterschutz") + 1);
  });

  it("enthaelt genau die fuenf Ereignisse, alle ausgeloest und mit Standardvorlage", () => {
    expect(unterlagen().map((d) => d.event)).toEqual([...PERSON, ...HR]);
    expect(unterlagen().map((d) => d.name)).toEqual([
      "Unterlagen angefordert",
      "Erinnerung: Unterlagen",
      "Unterlage zurückgewiesen",
      "Unterlagen vollständig eingegangen (HR)",
      "Frist für Unterlagen verstrichen (HR)",
    ]);
    for (const def of unterlagen()) {
      expect({ event: def.event, wired: def.wired }).toEqual({ event: def.event, wired: true });
      expect(DEFAULT_EMAIL_TEMPLATES.some((t) => t.event === def.event)).toBe(true);
    }
  });

  it("Mails an die Person: Empfaenger {{email}}, ohne Cc und Bcc", () => {
    // Der Dienst sendet mit overrideTo; {{email}} haelt die Status-Ampel gruen
    // (wie beim Dokumentenpaket), ein Cc im Katalog bekaeme den Link.
    for (const event of PERSON) {
      expect(getEventDefinition(event)!.defaultRecipients).toEqual({ to: "{{email}}" });
    }
  });

  it("Mails an HR: An die anfordernde Person, Cc das HR-Postfach", () => {
    for (const event of HR) {
      expect(getEventDefinition(event)!.defaultRecipients).toEqual({
        to: "{{anfordernde_email}}",
        cc: "{{hr_postfach}}",
      });
    }
  });

  it("die HR-Beispiele tragen weder Adresse der Person noch Link", () => {
    for (const event of HR) {
      const beispiel = getEventDefinition(event)!.samplePayload;
      for (const feld of ["email", "employeeEmail", "recipientEmail", "privateEmail", "mitarbeiter_email", "link", "magicLink"]) {
        expect({ event, feld, drin: feld in beispiel }).toEqual({ event, feld, drin: false });
      }
    }
  });

  it("die Personen-Beispiele nutzen den Beispiel-Link ohne UUID-Form", () => {
    for (const event of PERSON) {
      const { link } = getEventDefinition(event)!.samplePayload;
      expect(link).toBe("https://hr.fes-credo.de/beispiel-link");
      expect(String(link)).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
    }
  });

  it("alle fuenf sperren Freitexte, Unterlagennamen und den Link im Betreff", () => {
    for (const def of unterlagen()) {
      expect(def.betreffOhne).toEqual(
        expect.arrayContaining(["unterlage", "unterlagenliste", "begruendung", "nachricht", "link", "magicLink", "magicUrl"]),
      );
    }
  });

  it("jede Standardvorlage mit Sperrliste haelt sich an sie", () => {
    for (const vorlage of DEFAULT_EMAIL_TEMPLATES) {
      expect({ event: vorlage.event, verboten: verboteneBetreffVariablen(vorlage.event, vorlage.subject) }).toEqual({
        event: vorlage.event,
        verboten: [],
      });
    }
  });
});

/**
 * Paket A3 (Ausstattung & Zugaenge, Regel 17): Die Mails an eine Stelle im
 * Onboarding tragen Bemerkungen (Aufgabenliste), Angaben und den Link ohne
 * Anmeldung — nichts davon gehoert in den Betreff (90 Tage im
 * Versandprotokoll). Die Erledigt-Meldung an HR und die Sammelmail stehen
 * unten (S18), die Absage ganz unten (S19).
 */
describe("Event-Katalog — Betreff der Onboarding-Abteilungsmails (Paket A3)", () => {
  const STELLE = ["onboarding-department-assigned", "onboarding-department-reminder"];

  it("Zuweisung und Erinnerung sperren Aufgabenliste, Angaben, Nachtrag und Link", () => {
    for (const event of STELLE) {
      expect({ event, betreffOhne: [...(getEventDefinition(event)!.betreffOhne ?? [])].sort() }).toEqual({
        event,
        betreffOhne: [
          "angaben",
          "angaben_html",
          "aufgabenliste",
          "aufgabenliste_html",
          "link",
          "magicLink",
          "nachtrag_liste",
          "nachtrag_liste_html",
        ],
      });
    }
  });

  it("der Standard-Betreff beider Vorlagen nennt keine gesperrte Variable", () => {
    for (const event of STELLE) {
      const vorlage = DEFAULT_EMAIL_TEMPLATES.find((t) => t.event === event)!;
      expect({ event, verboten: verboteneBetreffVariablen(event, vorlage.subject) }).toEqual({ event, verboten: [] });
      // Gegenprobe: die Sperre greift wirklich.
      expect(verboteneBetreffVariablen(event, `${vorlage.subject} {{aufgabenliste}} {{angaben}}`)).toEqual([
        "aufgabenliste",
        "angaben",
      ]);
    }
  });

  it("die Zuweisungsmail liefert die neuen Felder im Beispiel, die Erinnerung keine Angaben", () => {
    const zuweisung = getEventDefinition("onboarding-department-assigned")!.samplePayload;
    expect(zuweisung).toHaveProperty("angaben");
    expect(zuweisung).toHaveProperty("angaben_html");
    expect(zuweisung).toHaveProperty("arbeitsort");
    const erinnerung = getEventDefinition("onboarding-department-reminder")!.samplePayload;
    expect(erinnerung).not.toHaveProperty("angaben");
    expect(erinnerung).toHaveProperty("arbeitsort");
  });
});

/**
 * Paket A3, S18: Die HR-Meldung onboarding-task-completed geht an das
 * HR-Postfach (E-A17, auch bei einem reinen Kommentar) und sperrt zusaetzlich
 * den Kommentar im Betreff (F19); dazu die Sammelmail
 * onboarding-ausstattung-offen (E-A18). Beide Beispiele tragen `hr_postfach`,
 * damit der Empfaenger-Default im Testversand aufloesbar ist.
 */
describe("Event-Katalog — HR-Mails der Ausstattung (Paket A3, S18)", () => {
  const HR = ["onboarding-task-completed", "onboarding-ausstattung-offen"];

  it("beide gehen an {{hr_postfach}}, und das Beispiel traegt `hr_postfach`", () => {
    for (const event of HR) {
      const def = getEventDefinition(event)!;
      expect({ event, an: def.defaultRecipients }).toEqual({ event, an: { to: "{{hr_postfach}}" } });
      expect(def.samplePayload).toMatchObject({ hr_postfach: "personal@example.org" });
      expect({ event, group: def.group, wired: def.wired }).toEqual({ event, group: "Onboarding", wired: true });
      // HR-Mails: weder die Adresse einer Stelle noch die der Person.
      expect(def.samplePayload).not.toHaveProperty("email");
    }
  });

  it("die Erledigt-Meldung traegt die Merker und sperrt Kommentar und Liste im Betreff (F19)", () => {
    const def = getEventDefinition("onboarding-task-completed")!;
    expect(def.samplePayload).toMatchObject({ ist_erledigt: "ja", nur_kommentar: "", meldung_kurz: "erledigt, mit Kommentar" });
    expect(def.betreffOhne).toEqual(expect.arrayContaining(["kommentar", "kommentar_text", "aufgabenliste", "link"]));
    const vorlage = DEFAULT_EMAIL_TEMPLATES.find((t) => t.event === "onboarding-task-completed")!;
    expect(verboteneBetreffVariablen("onboarding-task-completed", vorlage.subject)).toEqual([]);
    expect(verboteneBetreffVariablen("onboarding-task-completed", "{{aufgabe}} – {{kommentar_text}}")).toEqual([
      "kommentar_text",
    ]);
  });

  // A4, S25 (G9): Der Uebergabevermerk traegt Kennungen, die die Stelle tippt.
  it("die Erledigt-Meldung traegt den Uebergabevermerk flach und sperrt ihn im Betreff", () => {
    const def = getEventDefinition("onboarding-task-completed")!;
    expect(def.betreffOhne).toEqual(expect.arrayContaining(["ausgabe_vermerk", "ausgabe_vermerk_html"]));
    // Im Beispiel ohne Vermerk (Vorlagenpunkt) – als Zeichenkette, nie fehlend.
    expect(def.samplePayload).toMatchObject({ ausgabe_vermerk: "", ausgabe_vermerk_html: "" });
    expect(
      verboteneBetreffVariablen("onboarding-task-completed", "{{aufgabe}}: {{ausgabe_vermerk}} {{ausgabe_vermerk_html}}"),
    ).toEqual(["ausgabe_vermerk", "ausgabe_vermerk_html"]);
    const vorlage = DEFAULT_EMAIL_TEMPLATES.find((t) => t.event === "onboarding-task-completed")!;
    expect(verboteneBetreffVariablen("onboarding-task-completed", vorlage.subject)).toEqual([]);
  });

  it("die Sammelmail sperrt Liste und Portal-Link im Betreff und nennt keine Bemerkung", () => {
    const def = getEventDefinition("onboarding-ausstattung-offen")!;
    expect([...(def.betreffOhne ?? [])].sort()).toEqual(["offene_liste", "offene_liste_html", "portalLink"]);
    expect(def.samplePayload).toMatchObject({ anzahl_offen: 2 });
    for (const feld of ["bemerkung", "angaben", "angaben_html", "hinweis", "link", "magicLink", "token"]) {
      expect({ feld, drin: feld in def.samplePayload }).toEqual({ feld, drin: false });
    }
    const vorlage = DEFAULT_EMAIL_TEMPLATES.find((t) => t.event === "onboarding-ausstattung-offen")!;
    expect(vorlage.name).toBe(def.name);
    expect(verboteneBetreffVariablen("onboarding-ausstattung-offen", vorlage.subject)).toEqual([]);
  });
});

/**
 * Paket A3, S19 (E-A20): Die Absage onboarding-department-abgesagt geht an die
 * Stelle, die informiert wurde (`{{email}}`, F16), traegt die erledigten
 * Aufgaben (F17), aber keinen Link — der Vorgang ist abgelaufen. Die Liste
 * steht nie im Betreff.
 */
describe("Event-Katalog — Absage an die Stellen (Paket A3, S19)", () => {
  const EVENT = "onboarding-department-abgesagt";

  it("geht an {{email}}, und das Beispiel loest den Empfaenger auf", () => {
    const def = getEventDefinition(EVENT)!;
    expect({ an: def.defaultRecipients, group: def.group, wired: def.wired }).toEqual({
      an: { to: "{{email}}" },
      group: "Onboarding",
      wired: true,
    });
    expect(def.samplePayload).toMatchObject({ email: "it@example.org", abteilung: "IT-Abteilung" });
  });

  it("das Beispiel traegt keine Link-Felder, aber die erledigten Aufgaben", () => {
    const beispiel = getEventDefinition(EVENT)!.samplePayload;
    for (const feld of ["link", "magicLink", "magicUrl", "token", "expiresAt", "portalLink"]) {
      expect({ feld, drin: feld in beispiel }).toEqual({ feld, drin: false });
    }
    expect(beispiel).toMatchObject({ hat_erledigte: "ja", anzahl_erledigt: 2 });
    expect(String(beispiel.erledigte_liste)).toContain("Benutzerkonto und E-Mail-Adresse anlegen");
  });

  it("sperrt die erledigte Liste, Aufgabenliste und Link im Betreff; der Standard-Betreff haelt sich daran", () => {
    const def = getEventDefinition(EVENT)!;
    expect(def.betreffOhne).toEqual(
      expect.arrayContaining(["erledigte_liste", "erledigte_liste_html", "aufgabenliste", "link", "magicLink"]),
    );
    const vorlage = DEFAULT_EMAIL_TEMPLATES.find((t) => t.event === EVENT)!;
    expect(vorlage.name).toBe(def.name);
    expect(vorlage.bodyHtml).not.toMatch(/\{\{(link|magicLink)\}\}/);
    expect(verboteneBetreffVariablen(EVENT, vorlage.subject)).toEqual([]);
    expect(verboteneBetreffVariablen(EVENT, "Absage {{erledigte_liste}}")).toEqual(["erledigte_liste"]);
  });

  // A4, S27 (G10): Die Absage nennt die noch ausgegebenen Stuecke samt Kennung.
  it("das Beispiel traegt die Ausgaben der Stelle; beide Listen sind im Betreff gesperrt", () => {
    const def = getEventDefinition(EVENT)!;
    expect(def.samplePayload).toMatchObject({ hat_ausgaben: "ja" });
    expect(String(def.samplePayload.ausgaben_liste)).toContain("FES-NB-0412");
    expect(def.betreffOhne).toEqual(expect.arrayContaining(["ausgaben_liste", "ausgaben_liste_html"]));
    expect(verboteneBetreffVariablen(EVENT, "Absage: {{ausgaben_liste}} {{ausgaben_liste_html}}")).toEqual([
      "ausgaben_liste",
      "ausgaben_liste_html",
    ]);
    // Der Merker allein verraet keine Kennung und bleibt erlaubt.
    expect(verboteneBetreffVariablen(EVENT, "Absage{{#hat_ausgaben}} – bitte zurücknehmen{{/hat_ausgaben}}")).toEqual([]);
  });
});
