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
