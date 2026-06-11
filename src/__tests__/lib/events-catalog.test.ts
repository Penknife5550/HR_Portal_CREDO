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
