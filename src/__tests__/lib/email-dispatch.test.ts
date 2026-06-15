/**
 * Tests: Event-Dispatcher (lib/webhooks.ts) + Event-E-Mail-Versand (lib/mailer.ts)
 *
 * Sichert den Umbau "SMTP primaer, Webhooks zusaetzlich" ab:
 * - E-Mail wird IMMER versendet, unabhaengig vom Webhook-Ergebnis
 * - EmailLog-Eintraege fuer SENT / FAILED / SKIPPED
 * - Empfaenger-Aufloesung: Vorlagen-Feld > Katalog-Default > Payload
 * - triggerWebhooks wirft niemals
 */

const mockPrisma = {
  emailTemplate: { findUnique: jest.fn() },
  emailLog: { create: jest.fn() },
  smtpConfig: { findUnique: jest.fn() },
  webhookConfig: { findMany: jest.fn() },
};

const mockSendMail = jest.fn();

jest.mock("@/lib/db", () => ({ prisma: mockPrisma }));
jest.mock("nodemailer", () => ({
  __esModule: true,
  default: { createTransport: jest.fn(() => ({ sendMail: mockSendMail })) },
}));
jest.mock("@/lib/encryption", () => ({
  decrypt: (v: string) => v,
  isEncryptionConfigured: () => false,
}));
jest.mock("@/lib/url", () => ({
  isPublicHostname: jest.fn().mockResolvedValue(true),
  redactUrlForLog: (url: string) => url,
}));

import { sendEventEmail, renderEventEmail } from "@/lib/mailer";
import { triggerWebhooks } from "@/lib/webhooks";

const activeSmtpConfig = {
  id: "default",
  host: "smtp.example.org",
  port: 587,
  secure: false,
  username: "portal",
  password: "geheim",
  fromEmail: "noreply@fes-credo.de",
  fromName: "CREDO HR-Portal",
  replyToEmail: "",
  isActive: true,
};

const baseTemplate = {
  id: "t1",
  event: "onboarding-created",
  name: "Einladung",
  subject: "Willkommen {{vorname}}",
  bodyHtml: "<p>Hallo {{vorname}}, Link: {{link}}</p>",
  bodyText: "Hallo {{vorname}}",
  recipientTo: "",
  recipientCc: "",
  recipientBcc: "",
  recipientReplyTo: "",
  isActive: true,
};

const payload = {
  onboardingId: "o1",
  displayId: "2026-GYM-001",
  email: "max.mustermann@example.org",
  vorname: "Max",
  fragebogenLink: "https://hr.fes-credo.de/fragebogen/abc",
  organization: "FES Minden",
};

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.smtpConfig.findUnique.mockResolvedValue(activeSmtpConfig);
  mockPrisma.emailTemplate.findUnique.mockResolvedValue(baseTemplate);
  mockPrisma.emailLog.create.mockResolvedValue({});
  mockPrisma.webhookConfig.findMany.mockResolvedValue([]);
  mockSendMail.mockResolvedValue({
    messageId: "<msg-1>",
    accepted: ["max.mustermann@example.org"],
  });
});

describe("sendEventEmail", () => {
  it("versendet mit Katalog-Default-Empfaenger und protokolliert SENT", async () => {
    const result = await sendEventEmail("onboarding-created", payload);

    expect(result.status).toBe("SENT");
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "max.mustermann@example.org",
        subject: "Willkommen Max",
      })
    );
    expect(mockPrisma.emailLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        event: "onboarding-created",
        status: "SENT",
        recipient: "max.mustermann@example.org",
        messageId: "<msg-1>",
      }),
    });
  });

  it("nutzt konfigurierte To/CC-Felder der Vorlage (Variablen + Festadresse)", async () => {
    mockPrisma.emailTemplate.findUnique.mockResolvedValue({
      ...baseTemplate,
      recipientTo: "{{email}}, hr@credo-gruppe.de",
      recipientCc: "leitung@example.org",
    });

    await sendEventEmail("onboarding-created", payload);

    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "max.mustermann@example.org, hr@credo-gruppe.de",
        cc: "leitung@example.org",
      })
    );
  });

  it("ueberspringt mit Protokoll wenn kein Empfaenger aufloesbar ist", async () => {
    // psi-phase-completed hat keinen Default-Empfaenger und kein E-Mail-Feld im Payload
    mockPrisma.emailTemplate.findUnique.mockResolvedValue({
      ...baseTemplate,
      event: "psi-phase-completed",
    });

    const result = await sendEventEmail("psi-phase-completed", {
      displayId: "PSI-2026-GYM-001",
      phaseName: "Vorbereitung",
    });

    expect(result.status).toBe("SKIPPED");
    expect(mockSendMail).not.toHaveBeenCalled();
    expect(mockPrisma.emailLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ status: "SKIPPED" }),
    });
  });

  it("HR-interne Events (Katalog-Default to: \"\") gehen NICHT an die Person aus dem Payload", async () => {
    // questionnaire-completed ist eine HR-Benachrichtigung; payload.email
    // ist die Mitarbeiter-Adresse — sie darf NICHT als Empfaenger einspringen
    mockPrisma.emailTemplate.findUnique.mockResolvedValue({
      ...baseTemplate,
      event: "questionnaire-completed",
    });

    const result = await sendEventEmail("questionnaire-completed", {
      onboardingId: "o1",
      email: "max.mustermann@example.org",
      organization: "FES Minden",
    });

    expect(result.status).toBe("SKIPPED");
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it("nutzt die alte Payload-Aufloesung nur fuer Events ausserhalb des Katalogs", async () => {
    mockPrisma.emailTemplate.findUnique.mockResolvedValue({
      ...baseTemplate,
      event: "custom-event-nicht-im-katalog",
    });

    const result = await sendEventEmail("custom-event-nicht-im-katalog", {
      email: "max.mustermann@example.org",
    });

    expect(result.status).toBe("SENT");
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "max.mustermann@example.org" })
    );
  });

  it("ueberspringt wenn die Vorlage deaktiviert ist", async () => {
    mockPrisma.emailTemplate.findUnique.mockResolvedValue({
      ...baseTemplate,
      isActive: false,
    });

    const result = await sendEventEmail("onboarding-created", payload);

    expect(result.status).toBe("SKIPPED");
    expect(result.detail).toContain("deaktiviert");
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it("nutzt die Code-Default-Vorlage wenn keine DB-Vorlage existiert", async () => {
    mockPrisma.emailTemplate.findUnique.mockResolvedValue(null);

    const result = await sendEventEmail("onboarding-created", payload);

    expect(result.status).toBe("SENT");
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "max.mustermann@example.org" })
    );
  });

  it("protokolliert FAILED mit SMTP-Fehlermeldung", async () => {
    mockSendMail.mockRejectedValue(new Error("Connection refused"));

    const result = await sendEventEmail("onboarding-created", payload);

    expect(result.status).toBe("FAILED");
    expect(result.detail).toContain("Connection refused");
    expect(mockPrisma.emailLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: "FAILED",
        detail: expect.stringContaining("Connection refused"),
      }),
    });
  });

  it("protokolliert FAILED wenn SMTP nicht konfiguriert ist", async () => {
    mockPrisma.smtpConfig.findUnique.mockResolvedValue(null);

    const result = await sendEventEmail("onboarding-created", payload);

    expect(result.status).toBe("FAILED");
    expect(result.detail).toContain("SMTP");
  });

  it("setzt beim Test-Versand das [TEST]-Praefix und das isTest-Flag", async () => {
    await sendEventEmail("onboarding-created", payload, { isTest: true });

    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({ subject: "[TEST] Willkommen Max" })
    );
    expect(mockPrisma.emailLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ isTest: true }),
    });
  });
});

describe("Reply-To", () => {
  it("nutzt das Reply-To-Feld der Vorlage (Override vor globalem Default)", async () => {
    mockPrisma.emailTemplate.findUnique.mockResolvedValue({
      ...baseTemplate,
      recipientReplyTo: "antwort@fes-minden.de",
    });
    mockPrisma.smtpConfig.findUnique.mockResolvedValue({
      ...activeSmtpConfig,
      replyToEmail: "global@fes-minden.de",
    });

    await sendEventEmail("onboarding-created", payload);

    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({ replyTo: "antwort@fes-minden.de" })
    );
  });

  it("faellt auf die globale SMTP-Reply-To-Adresse zurueck, wenn die Vorlage keine hat", async () => {
    mockPrisma.smtpConfig.findUnique.mockResolvedValue({
      ...activeSmtpConfig,
      replyToEmail: "global@fes-minden.de",
    });

    await sendEventEmail("onboarding-created", payload);

    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({ replyTo: "global@fes-minden.de" })
    );
  });

  it("setzt kein Reply-To, wenn weder Vorlage noch SMTP-Config eine Adresse haben", async () => {
    await sendEventEmail("onboarding-created", payload);

    expect(mockSendMail).toHaveBeenCalled();
    expect(mockSendMail.mock.calls[0][0].replyTo).toBeUndefined();
  });

  it("ersetzt Variablen im Reply-To-Feld der Vorlage", async () => {
    mockPrisma.emailTemplate.findUnique.mockResolvedValue({
      ...baseTemplate,
      recipientReplyTo: "{{email}}",
    });

    await sendEventEmail("onboarding-created", payload);

    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({ replyTo: "max.mustermann@example.org" })
    );
  });

  it("setzt das Reply-To auch beim Test-Versand (overrideTo)", async () => {
    mockPrisma.emailTemplate.findUnique.mockResolvedValue({
      ...baseTemplate,
      recipientReplyTo: "antwort@fes-minden.de",
    });

    await sendEventEmail("onboarding-created", payload, {
      isTest: true,
      overrideTo: "tester@example.org",
    });

    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "tester@example.org",
        replyTo: "antwort@fes-minden.de",
      })
    );
  });
});

describe("renderEventEmail", () => {
  it("dedupliziert doppelte Empfaenger-Adressen", () => {
    const { rendered } = renderEventEmail(
      { ...baseTemplate, recipientTo: "{{email}}, MAX.MUSTERMANN@example.org" },
      "onboarding-created",
      payload
    );
    expect(rendered?.to).toBe("max.mustermann@example.org");
  });

  it("verwirft ungueltige Adressen nach Variablen-Ersetzung", () => {
    const { rendered, skipReason } = renderEventEmail(
      { ...baseTemplate, recipientTo: "{{nicht_vorhanden}}" },
      "onboarding-created",
      payload
    );
    expect(rendered).toBeNull();
    expect(skipReason).toBeTruthy();
  });
});

describe("triggerWebhooks (Dispatcher)", () => {
  it("versendet die E-Mail auch wenn ein Webhook konfiguriert ist und Erfolg hat", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 });
    mockPrisma.webhookConfig.findMany.mockResolvedValue([
      {
        id: "w1",
        event: "onboarding-created",
        url: "https://n8n.example.org/webhook/x",
        authType: "none",
        authHeader: null,
        authValue: null,
        isActive: true,
      },
    ]);

    await triggerWebhooks("onboarding-created", payload);

    // E-Mail wurde versendet (primaerer Kanal) UND der Webhook gefeuert
    expect(mockSendMail).toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalled();
  });

  it("wirft niemals — auch wenn alles fehlschlaegt", async () => {
    mockPrisma.emailTemplate.findUnique.mockRejectedValue(new Error("DB down"));
    mockPrisma.emailLog.create.mockRejectedValue(new Error("DB down"));
    mockPrisma.webhookConfig.findMany.mockRejectedValue(new Error("DB down"));

    await expect(
      triggerWebhooks("onboarding-created", payload)
    ).resolves.toBeUndefined();
  });
});
