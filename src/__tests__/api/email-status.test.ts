/**
 * Tests: Versand-Status-Ampel (GET /api/settings/email-status)
 *
 * Paket 4 bringt zwei Dinge in die Ampel:
 *   - Die HR-Mails der Nachforderung setzen das HR-Postfach in Cc
 *     ({{hr_postfach}} = SmtpConfig.replyToEmail). Ist es leer, faellt die
 *     Kopie still weg — und ohne aktives Konto der anfordernden HR-Kraft gibt
 *     es gar keinen Empfaenger. Die Ampel muss das vorher sagen.
 *   - Die Mails an die Person gehen per overrideTo an die Adresse der
 *     Nachforderung. Sie duerfen nicht als „Kein Empfänger“ rot leuchten —
 *     geloest wie beim Dokumentenpaket ueber den Katalog-Default {{email}}.
 */

const mockGetSession = jest.fn();
const mockPrisma = {
  smtpConfig: { findUnique: jest.fn() },
  emailTemplate: { findMany: jest.fn() },
  webhookConfig: { findMany: jest.fn() },
};

jest.mock("@/lib/auth", () => ({ getSession: mockGetSession }));
jest.mock("@/lib/db", () => ({ prisma: mockPrisma }));

import { GET } from "@/app/api/settings/email-status/route";

interface EventStatus {
  event: string;
  group: string;
  ok: boolean;
  recipientConfigured: boolean;
  webhookCount: number;
  issues: string[];
}

const HR_EVENTS = ["unterlagen-vollstaendig", "unterlagen-frist-verstrichen"];
const PERSON_EVENTS = ["unterlagen-angefordert", "unterlagen-erinnerung", "unterlage-zurueckgewiesen"];
const POSTFACH_HINWEIS = /Nutzt \{\{hr_postfach\}\}, aber in den SMTP-Einstellungen ist keine Antwortadresse/;

function smtp(replyToEmail: string) {
  return {
    id: "default",
    host: "smtp.example.org",
    username: "portal",
    fromEmail: "noreply@example.org",
    isActive: true,
    replyToEmail,
  };
}

function dbVorlage(event: string, felder: Partial<Record<"recipientTo" | "recipientCc" | "recipientBcc" | "recipientReplyTo", string>> = {}) {
  return { event, isActive: true, recipientTo: "", recipientCc: "", recipientBcc: "", recipientReplyTo: "", ...felder };
}

async function laden(): Promise<Map<string, EventStatus>> {
  const res = await GET();
  expect(res.status).toBe(200);
  const { data } = await res.json();
  return new Map((data.events as EventStatus[]).map((e) => [e.event, e]));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetSession.mockResolvedValue({ userId: "sa1", role: "SUPER_ADMIN" });
  mockPrisma.smtpConfig.findUnique.mockResolvedValue(smtp("personal@example.org"));
  mockPrisma.emailTemplate.findMany.mockResolvedValue([]);
  mockPrisma.webhookConfig.findMany.mockResolvedValue([]);
});

describe("GET /api/settings/email-status — HR-Postfach (Paket 4)", () => {
  it("ohne Antwortadresse warnen die HR-Mails der Nachforderung", async () => {
    mockPrisma.smtpConfig.findUnique.mockResolvedValue(smtp("  "));
    const status = await laden();

    for (const event of HR_EVENTS) {
      const e = status.get(event)!;
      expect({ event, hinweis: e.issues.some((i) => POSTFACH_HINWEIS.test(i)) }).toEqual({ event, hinweis: true });
      expect(e.ok).toBe(false);
    }
    // Wer {{hr_postfach}} nicht nutzt, bekommt keinen Hinweis.
    for (const event of [...PERSON_EVENTS, "onboarding-created", "questionnaire-completed"]) {
      expect(status.get(event)!.issues.some((i) => POSTFACH_HINWEIS.test(i))).toBe(false);
    }
  });

  it("mit Antwortadresse sind die HR-Mails ohne Hinweis und gruen", async () => {
    const status = await laden();
    for (const event of HR_EVENTS) {
      expect(status.get(event)).toMatchObject({ ok: true, issues: [] });
    }
  });

  it("wertet die gespeicherte Vorlage: ein fester Cc ersetzt {{hr_postfach}}", async () => {
    mockPrisma.smtpConfig.findUnique.mockResolvedValue(smtp(""));
    mockPrisma.emailTemplate.findMany.mockResolvedValue([
      dbVorlage("unterlagen-vollstaendig", { recipientCc: "personalbuero@example.org" }),
      // Leeres Cc in der Vorlage: es gilt der Katalog-Default {{hr_postfach}}.
      dbVorlage("unterlagen-frist-verstrichen", { recipientTo: "hr@example.org" }),
      // Eine andere Vorlage, die das Postfach selbst in Bcc setzt.
      dbVorlage("questionnaire-completed", { recipientTo: "hr@example.org", recipientBcc: "{{ hr_postfach }}" }),
    ]);
    const status = await laden();

    expect(status.get("unterlagen-vollstaendig")!.issues.some((i) => POSTFACH_HINWEIS.test(i))).toBe(false);
    expect(status.get("unterlagen-frist-verstrichen")!.issues.some((i) => POSTFACH_HINWEIS.test(i))).toBe(true);
    expect(status.get("questionnaire-completed")!.issues.some((i) => POSTFACH_HINWEIS.test(i))).toBe(true);
  });
});

describe("GET /api/settings/email-status — Mails an die Person (overrideTo)", () => {
  it("die drei Personen-Mails gelten als konfiguriert, nie „Kein Empfänger“", async () => {
    const status = await laden();
    for (const event of PERSON_EVENTS) {
      const e = status.get(event)!;
      expect(e.group).toBe("Unterlagen");
      expect(e.recipientConfigured).toBe(true);
      expect(e.issues).not.toContain("Kein Empfänger konfiguriert");
      expect(e.ok).toBe(true);
    }
  });

  it("gilt auch, wenn die Vorlage gespeichert ist und kein An-Feld hat", async () => {
    mockPrisma.emailTemplate.findMany.mockResolvedValue(PERSON_EVENTS.map((event) => dbVorlage(event)));
    const status = await laden();
    for (const event of PERSON_EVENTS) {
      expect(status.get(event)).toMatchObject({ recipientConfigured: true, ok: true });
    }
  });
});

describe("GET /api/settings/email-status — Webhooks, die nie feuern", () => {
  it("zaehlt Webhooks auf die Personen-Mails und das Dokumentenpaket nicht als „+n Webhook“", async () => {
    // Die Mails mit persoenlichem Link gehen am Dispatcher vorbei
    // (EVENTS_OHNE_WEBHOOK). Ein angelegter Webhook feuert dort nie — die
    // Plakette in der Ampel darf ihn nicht als zusaetzlichen Aufruf zeigen.
    mockPrisma.webhookConfig.findMany.mockResolvedValue([
      ...PERSON_EVENTS.map((event) => ({ event })),
      { event: "onboarding-starter-packet-sent" },
      { event: "unterlagen-vollstaendig" },
      { event: "unterlagen-vollstaendig" },
    ]);
    const status = await laden();

    for (const event of [...PERSON_EVENTS, "onboarding-starter-packet-sent"]) {
      expect({ event, webhookCount: status.get(event)!.webhookCount }).toEqual({ event, webhookCount: 0 });
      // Kein roter Punkt: Der Hinweis steht im Reiter „Webhooks“.
      expect(status.get(event)!.ok).toBe(true);
    }
    // Die HR-Mails laufen ueber triggerWebhooks — dort feuern beide.
    expect(status.get("unterlagen-vollstaendig")!.webhookCount).toBe(2);
  });
});
