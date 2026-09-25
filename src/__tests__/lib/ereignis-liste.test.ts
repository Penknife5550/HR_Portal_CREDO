/**
 * Tests: Ereignisliste der Einstellungen (src/lib/ereignis-liste.ts)
 *
 * Die Liste fuer den Webhook-Reiter und den Filter im Versandprotokoll war
 * frueher hart kodiert und veraltet: Vertragsende-, Ablauf- und
 * Dokumentenpaket-Ereignisse fehlten, drei nie ausgeloeste standen darin.
 * Jetzt kommt sie aus dem Event-Katalog. Diese Tests halten fest, dass sie
 * VOLLSTAENDIG ist, NUR Katalog-Events enthaelt und die beiden Sonderfaelle
 * (nie ausgeloest, Webhook feuert nicht) richtig kennzeichnet.
 */

import fs from "fs";
import path from "path";
import {
  EREIGNIS_GRUPPEN,
  EREIGNIS_OPTIONEN,
  EVENTS_OHNE_WEBHOOK,
  ereignisOption,
  ereignisOptionLabel,
} from "@/lib/ereignis-liste";
import { EVENT_CATALOG, EVENT_GROUP_ORDER, getEventDefinition } from "@/lib/events";
import { UNTERLAGEN_EVENTS, UNTERLAGEN_PERSONEN_EVENTS } from "@/lib/unterlagen-mail";

const werte = EREIGNIS_OPTIONEN.map((o) => o.value);

describe("Ereignisliste — Inhalt", () => {
  it.each([
    "contract-end-supervisor-link",
    "contract-end-created",
    "dokument-ablauf-warnung",
    "dokument-abgelaufen",
    "onboarding-starter-packet-sent",
    "questionnaire-confirmation-employee",
  ])("enthaelt %s (fehlte in der frueheren, hart kodierten Liste)", (event) => {
    expect(werte).toContain(event);
  });

  it("enthaelt keine unbekannten Events — jedes steht im Katalog, mit dessen Namen", () => {
    for (const option of EREIGNIS_OPTIONEN) {
      const def = getEventDefinition(option.value);
      expect({ event: option.value, imKatalog: Boolean(def) }).toEqual({ event: option.value, imKatalog: true });
      expect(option.label).toBe(def!.name);
      expect(option.group).toBe(def!.group);
      expect(option.wired).toBe(def!.wired);
    }
  });

  it.each(["exit-interview-submitted", "zeugnis-bewertung-invited", "zeugnis-bewertung-submitted", "contract-end-reminder"])(
    "enthaelt das nie existierende bzw. nie ausgeloeste %s nicht mehr",
    (event) => {
      expect(werte).not.toContain(event);
      expect(ereignisOption(event)).toBeUndefined();
    }
  );

  it("enthaelt den ganzen Katalog, jedes Event genau einmal", () => {
    expect(new Set(werte).size).toBe(werte.length);
    expect([...werte].sort()).toEqual(EVENT_CATALOG.map((d) => d.event).sort());
  });
});

describe("Ereignisliste — Gruppierung", () => {
  it("folgt EVENT_GROUP_ORDER und laesst leere Gruppen weg", () => {
    const gruppen = EREIGNIS_GRUPPEN.map((g) => g.group);
    const erwartet = EVENT_GROUP_ORDER.filter((g) => EVENT_CATALOG.some((d) => d.group === g));
    expect(gruppen).toEqual(erwartet);
    for (const gruppe of EREIGNIS_GRUPPEN) {
      expect(gruppe.events.length).toBeGreaterThan(0);
      expect(gruppe.events.every((e) => e.group === gruppe.group)).toBe(true);
    }
  });

  it("die flache Liste hat dieselbe Reihenfolge wie die Gruppen", () => {
    expect(EREIGNIS_OPTIONEN).toEqual(EREIGNIS_GRUPPEN.flatMap((g) => g.events));
  });

  it("haelt innerhalb einer Gruppe die Katalog-Reihenfolge", () => {
    for (const gruppe of EREIGNIS_GRUPPEN) {
      const katalog = EVENT_CATALOG.filter((d) => d.group === gruppe.group).map((d) => d.event);
      expect(gruppe.events.map((e) => e.value)).toEqual(katalog);
    }
  });
});

describe("Ereignisliste — Kennzeichen", () => {
  it("kennzeichnet nie ausgeloeste Events (wired:false) auch in der Beschriftung", () => {
    const nieAusgeloest = EVENT_CATALOG.filter((d) => !d.wired).map((d) => d.event);
    expect(nieAusgeloest).toContain("offboarding-task-overdue");
    for (const event of nieAusgeloest) {
      const option = ereignisOption(event)!;
      expect(option.wired).toBe(false);
      expect(ereignisOptionLabel(option)).toMatch(/wird nie ausgelöst/);
    }
    const ausgeloest = ereignisOption("onboarding-created")!;
    expect(ereignisOptionLabel(ausgeloest)).toBe(ausgeloest.label);
  });

  it("genau die sieben direkt versendeten Events tragen den Hinweis, dass Webhooks nicht feuern", () => {
    // Vier Dokumentenpaket-Events (Anhaenge) und die drei Mails der
    // Nachforderung an die Person (persoenlicher Upload-Link, Paket 4).
    const mitHinweis = EREIGNIS_OPTIONEN.filter((o) => o.webhookHinweis).map((o) => o.value).sort();
    expect(mitHinweis).toEqual(
      [
        "civil-service-documents-sent",
        "contract-renewal-documents-sent",
        "offboarding-documents-sent",
        "onboarding-starter-packet-sent",
        "unterlagen-angefordert",
        "unterlagen-erinnerung",
        "unterlage-zurueckgewiesen",
      ].sort()
    );
    for (const event of mitHinweis) {
      expect(ereignisOption(event)!.webhookHinweis).toMatch(/Webhooks auf dieses Ereignis feuern nicht/);
    }
    for (const event of UNTERLAGEN_PERSONEN_EVENTS) {
      expect(ereignisOption(event)!.webhookHinweis).toMatch(/persönlichen Upload-Link/);
    }
  });

  it("EVENTS_OHNE_WEBHOOK deckt genau Dokumentenpaket und Personen-Mails der Nachforderung ab", () => {
    // dokumentenpaket.ts ruft sendEventEmail direkt (ohne Dispatcher, also ohne
    // Webhooks). Kommt dort ein Modul dazu, muss es auch hier stehen — sonst
    // verspricht der Webhook-Reiter einen Aufruf, der nie kommt. Dasselbe gilt
    // fuer die drei Mails der Nachforderung an die Person
    // (UNTERLAGEN_PERSONEN_EVENTS in unterlagen-mail.ts).
    const quelle = fs.readFileSync(path.join(process.cwd(), "src/lib/dokumentenpaket.ts"), "utf8");
    const paketEvents = [...quelle.matchAll(/\bevent:\s*"([a-z0-9-]+)"/g)].map((m) => m[1]).sort();
    expect(paketEvents.length).toBeGreaterThanOrEqual(4);
    expect(Object.keys(EVENTS_OHNE_WEBHOOK).sort()).toEqual([...paketEvents, ...UNTERLAGEN_PERSONEN_EVENTS].sort());
    for (const event of Object.keys(EVENTS_OHNE_WEBHOOK)) {
      expect(getEventDefinition(event)).toBeDefined();
    }
  });

  it("unterlagen-dienst.ts schickt die Personen-Mails nur ueber sendEventEmail, nie ueber triggerWebhooks", () => {
    // Der Hinweis in EVENTS_OHNE_WEBHOOK stimmt nur, solange der Dienst die
    // drei Mails mit Upload-Link wirklich am Dispatcher vorbeischickt.
    const quelle = fs.readFileSync(path.join(process.cwd(), "src/lib/unterlagen-dienst.ts"), "utf8");
    const personenSchluessel = (Object.keys(UNTERLAGEN_EVENTS) as (keyof typeof UNTERLAGEN_EVENTS)[]).filter((k) =>
      UNTERLAGEN_PERSONEN_EVENTS.includes(UNTERLAGEN_EVENTS[k]),
    );

    // Jedes Personen-Event, das der Dienst anfasst, traegt den Hinweis …
    const genutzt = [...quelle.matchAll(/UNTERLAGEN_EVENTS\.(\w+)/g)].map((m) => m[1]);
    const genutztePersonen = personenSchluessel.filter((k) => genutzt.includes(k));
    expect(genutztePersonen.length).toBeGreaterThan(0);
    for (const k of genutztePersonen) {
      expect(EVENTS_OHNE_WEBHOOK[UNTERLAGEN_EVENTS[k]]).toMatch(/persönlichen Upload-Link/);
    }
    // … und steht nie als Literal im Quelltext (nur ueber die Konstante).
    for (const event of UNTERLAGEN_PERSONEN_EVENTS) {
      expect(quelle).not.toContain(`"${event}"`);
    }

    // Kein triggerWebhooks-Aufruf bekommt ein Personen-Event; der einzige
    // Aufruf ist auf die beiden HR-Events getypt.
    const aufrufe = [...quelle.matchAll(/\btriggerWebhooks\(\s*([^,)]+)/g)].map((m) => m[1].trim());
    expect(aufrufe.length).toBeGreaterThan(0);
    for (const arg of aufrufe) {
      for (const k of personenSchluessel) expect(arg).not.toContain(`UNTERLAGEN_EVENTS.${k}`);
    }
    expect(quelle).toMatch(/export async function hrMeldungSenden\(opts: \{\s*event: UnterlagenHrEvent;/);

    // Die Mail an die Person: sendEventEmail mit erzwungenem Empfaenger.
    expect(quelle).toMatch(/export async function personenMailSenden\(opts: \{\s*event: UnterlagenPersonenEvent;/);
    expect(quelle).toMatch(/sendEventEmail\(opts\.event, vorbereitet\.payload, \{ overrideTo: vorbereitet\.empfaenger \}\)/);
  });

  it("die HR-Mails der Nachforderung feuern Webhooks — sie tragen weder Link noch Unterlagennamen", () => {
    for (const event of [UNTERLAGEN_EVENTS.VOLLSTAENDIG, UNTERLAGEN_EVENTS.FRIST_VERSTRICHEN]) {
      expect(EVENTS_OHNE_WEBHOOK[event]).toBeUndefined();
      expect(ereignisOption(event)!.webhookHinweis).toBeNull();
    }
  });

  it("ereignisOption liefert undefined fuer leere und unbekannte Namen", () => {
    expect(ereignisOption(undefined)).toBeUndefined();
    expect(ereignisOption(null)).toBeUndefined();
    expect(ereignisOption("")).toBeUndefined();
    expect(ereignisOption("frei-erfunden")).toBeUndefined();
    expect(ereignisOption("contract-end-supervisor-link")?.group).toBe("Vertragsende");
    expect(ereignisOption("unterlage-zurueckgewiesen")?.group).toBe("Unterlagen");
  });
});

describe("Ereignisliste — client-sicher", () => {
  // Die Liste laeuft im Browser (einstellungen-content.tsx ist eine Client-
  // Komponente). Ein Import von mailer/webhooks/dokumentenpaket zoege Prisma
  // und nodemailer ins Bundle.
  function importe(datei: string): string[] {
    const quelle = fs.readFileSync(path.join(process.cwd(), datei), "utf8");
    return [...quelle.matchAll(/^\s*import\s[^;]*?from\s+"([^"]+)"/gm)].map((m) => m[1]);
  }

  it("ereignis-liste.ts importiert nur den Event-Katalog", () => {
    expect(importe("src/lib/ereignis-liste.ts")).toEqual(["@/lib/events"]);
  });

  it("events.ts kommt ohne Importe aus (reine Daten)", () => {
    expect(importe("src/lib/events.ts")).toEqual([]);
  });
});
