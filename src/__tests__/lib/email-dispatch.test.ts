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

import {
  sendEventEmail,
  renderEventEmail,
  renderTemplate,
  pruefeVorlagenSyntax,
} from "@/lib/mailer";
import { triggerWebhooks } from "@/lib/webhooks";
import { DEFAULT_EMAIL_TEMPLATES } from "@/lib/default-email-templates";
import { MITARBEITER_NEUTRAL } from "@/lib/onboarding-spuren";

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

  it("reicht Anhaenge an den SMTP-Versand durch und vermerkt sie im Protokoll", async () => {
    const attachments = [
      { filename: "leitbild.pdf", content: Buffer.from("%PDF-1.4"), contentType: "application/pdf" },
      { filename: "datenschutz.pdf", content: Buffer.from("%PDF-1.4"), contentType: "application/pdf" },
    ];

    const result = await sendEventEmail("onboarding-created", payload, { attachments });

    expect(result.status).toBe("SENT");
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        attachments: expect.arrayContaining([
          expect.objectContaining({ filename: "leitbild.pdf" }),
          expect.objectContaining({ filename: "datenschutz.pdf" }),
        ]),
      })
    );
    expect(mockPrisma.emailLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: "SENT",
        detail: expect.stringContaining("leitbild.pdf"),
      }),
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

  it("wirft niemals — auch wenn alles fehlschlaegt (liefert das E-Mail-Ergebnis)", async () => {
    mockPrisma.emailTemplate.findUnique.mockRejectedValue(new Error("DB down"));
    mockPrisma.emailLog.create.mockRejectedValue(new Error("DB down"));
    mockPrisma.webhookConfig.findMany.mockRejectedValue(new Error("DB down"));

    // Kein Reject; seit dem Eskalations-Fix gibt der Dispatcher das
    // EventEmailResult zurueck, damit Aufrufer Folgeaktionen davon abhaengig
    // machen koennen (z.B. escalatedAt nur bei SENT setzen).
    await expect(triggerWebhooks("onboarding-created", payload)).resolves.toEqual(
      expect.objectContaining({ status: "FAILED" }),
    );
  });
});

describe("renderTemplate — bedingte Bloecke", () => {
  const vorlage = "Hallo{{#nachricht}}\n\n{{nachricht}}{{/nachricht}}\n\nGruss";

  it("laesst den Block weg, wenn die Variable leer ist", () => {
    expect(renderTemplate(vorlage, { nachricht: "" })).toBe("Hallo\n\nGruss");
    // Auch reiner Leerraum zaehlt als leer — sonst stuende ein leerer Kasten da.
    expect(renderTemplate(vorlage, { nachricht: "   " })).toBe("Hallo\n\nGruss");
  });

  it("laesst den Block weg, wenn die Variable gar nicht uebergeben wurde", () => {
    expect(renderTemplate(vorlage, {})).toBe("Hallo\n\nGruss");
  });

  it("behaelt den Block samt Inhalt, wenn etwas drinsteht", () => {
    expect(renderTemplate(vorlage, { nachricht: "Bis Montag!" })).toBe(
      "Hallo\n\nBis Montag!\n\nGruss",
    );
  });

  it("laesst gewoehnliche Variablen unberuehrt", () => {
    expect(renderTemplate("Hallo {{name}}", { name: "Max" })).toBe("Hallo Max");
  });

  it("behandelt mehrere Bloecke unterschiedlichen Namens einzeln", () => {
    const t = "{{#a}}A{{/a}}|{{#b}}B{{/b}}";
    expect(renderTemplate(t, { a: "x", b: "" })).toBe("A|");
    expect(renderTemplate(t, { a: "", b: "y" })).toBe("|B");
  });

  it("entfernt einen verwaisten Marker, statt ihn zu versenden", () => {
    // Ohne Sicherheitsnetz stuende "{{#nachricht}}" woertlich im Postfach der
    // beschaeftigten Person. Die Warnung belegt, dass das Entfernen im Log
    // sichtbar bleibt und nicht stillschweigend passiert.
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const ergebnis = renderTemplate("Hallo{{#nachricht}} Welt", { nachricht: "x" });

    expect(ergebnis).toBe("Hallo Welt");
    expect(ergebnis).not.toContain("{{#");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("{{#nachricht}}"));
    warn.mockRestore();
  });

  it("laesst geschweifte Klammern IM WERT unangetastet", () => {
    // Belegt die Reihenfolge: bereinigt wird VOR dem Einsetzen der Werte. Sonst
    // zerschnitte der Fix die freie Nachricht aus dem Dokumentenpaket-Dialog,
    // die HR selbst eingegeben hat.
    expect(renderTemplate("A {{nachricht}}", { nachricht: "{{#x}}" })).toBe("A {{#x}}");
  });

  it("setzt Platzhalter IN einem Wert nicht ein — egal in welcher Reihenfolge die Variablen stehen", () => {
    // Frueher lief je Variable ein eigenes replaceAll: Schrieb eine Abteilung
    // "{{vorgangsnummer}}" in ihren Kommentar, stand in der HR-Mail die echte Nummer.
    const t = "Kommentar: {{kommentar}} ({{vorgangsnummer}})";
    const erwartet = "Kommentar: siehe {{vorgangsnummer}} (OFF-1)";
    expect(renderTemplate(t, { kommentar: "siehe {{vorgangsnummer}}", vorgangsnummer: "OFF-1" })).toBe(erwartet);
    expect(renderTemplate(t, { vorgangsnummer: "OFF-1", kommentar: "siehe {{vorgangsnummer}}" })).toBe(erwartet);
  });

  it("unbekannte Platzhalter bleiben stehen, bekannte ohne Wert werden leer", () => {
    expect(renderTemplate("{{a}}|{{unbekannt}}|{{b}}", { a: "1", b: undefined as unknown as string })).toBe(
      "1|{{unbekannt}}|",
    );
  });
});

describe("pruefeVorlagenSyntax", () => {
  it("meldet ein fehlendes Schluss-Tag mit Feld, Marker, Name und Art", () => {
    expect(pruefeVorlagenSyntax({ "HTML-Body": "{{#nachricht}}Hallo" })).toEqual([
      {
        feld: "HTML-Body",
        marker: "{{#nachricht}}",
        name: "nachricht",
        art: "oeffnend",
      },
    ]);
  });

  it("meldet ein Schluss-Tag ohne Anfang", () => {
    const fehler = pruefeVorlagenSyntax({ "HTML-Body": "Hallo{{/nachricht}}" });
    expect(fehler).toHaveLength(1);
    expect(fehler[0].art).toBe("schliessend");
    expect(fehler[0].marker).toBe("{{/nachricht}}");
  });

  it("faengt einen vertippten Namen an beiden Enden", () => {
    // Belegt, dass MARKER_MUSTER auch Namen sieht, die BEDINGTER_BLOCK
    // (Rueckverweis auf denselben Namen) nie zu einem Paar zusammenfuehrt.
    const fehler = pruefeVorlagenSyntax({ "HTML-Body": "{{#nachricht}}x{{/nachrich}}" });
    expect(fehler).toHaveLength(2);
  });

  it("nimmt mehrere Bloecke gleichen Namens hin", () => {
    expect(pruefeVorlagenSyntax({ "HTML-Body": "{{#a}}A{{/a}}|{{#a}}B{{/a}}" })).toEqual([]);
  });

  it("meldet eine Verschachtelung gleichen Namens", () => {
    // Genau der Fall, den der Renderer stehen laesst: das lazy Muster loest nur
    // das aeussere Paar auf, das innere {{#a}} bliebe in der Mail.
    const fehler = pruefeVorlagenSyntax({ "HTML-Body": "{{#a}}x{{#a}}y{{/a}}" });
    expect(fehler.length).toBeGreaterThanOrEqual(1);
    expect(fehler.map((f) => f.marker)).toContain("{{#a}}");
  });

  it("haelt gewoehnliche Variablen nicht fuer Marker", () => {
    expect(pruefeVorlagenSyntax({ Betreff: "Hallo {{vorname}}" })).toEqual([]);
  });

  it("nennt das Feld, in dem der Fehler steht", () => {
    const felder = pruefeVorlagenSyntax({
      Betreff: "{{#a}}",
      "HTML-Body": "ok",
      Plaintext: "{{/b}}",
    }).map((f) => f.feld);

    expect(felder).toEqual(["Betreff", "Plaintext"]);
  });

  it("die mitgelieferten Code-Vorlagen sind ausgeglichen", () => {
    // Regressionsschutz: Ein Tippfehler in default-email-templates.ts liesse
    // sich ueber den Editor nicht mehr korrigieren (die PUT-Route weist ihn ab)
    // und ginge bis dahin an echte Empfaenger.
    for (const t of DEFAULT_EMAIL_TEMPLATES) {
      expect({
        event: t.event,
        fehler: pruefeVorlagenSyntax({
          Betreff: t.subject,
          "HTML-Body": t.bodyHtml,
          Plaintext: t.bodyText,
        }),
      }).toEqual({ event: t.event, fehler: [] });
    }
  });
});

/**
 * Paket 2: Die beiden HR-Mails sprechen ueber die GEGENSPUR. `renderTemplate`
 * kann nicht negieren, deshalb liegen die Faelle als flache, sich gegenseitig
 * ausschliessende Bloecke nebeneinander. Hier wird nachgehalten, dass immer
 * genau einer davon stehen bleibt — und dass „bereit zur Prüfung" nie ohne
 * Beleg erscheint.
 */
describe("HR-Mails der parallelen Onboarding-Spuren", () => {
  const BEREIT = "bereit zur Prüfung";

  /** Die Code-Vorlage des Ereignisses, mit einem HR-Empfaenger versehen. */
  function codeVorlage(event: string) {
    const t = DEFAULT_EMAIL_TEMPLATES.find((v) => v.event === event)!;
    return {
      ...baseTemplate,
      event,
      subject: t.subject,
      bodyHtml: t.bodyHtml,
      bodyText: t.bodyText,
      recipientTo: "personal@example.org",
    };
  }

  function rendern(event: string, merker: Record<string, string>) {
    const { rendered } = renderEventEmail(codeVorlage(event), event, {
      onboardingId: "o1",
      displayId: "2026-GYM-042",
      email: "privat@gmx.example",
      mitarbeiter_name: "Anna Beispiel",
      supervisorEmail: "leitung@example.org",
      organization: "Berufskolleg",
      ...merker,
    });
    return rendered!;
  }

  /** Wie oft ein Satz in Betreff, HTML und Textteil zusammen vorkommt. */
  function wieOft(mail: { subject: string; html: string; text?: string }, satz: string) {
    return [mail.subject, mail.html, mail.text ?? ""]
      .map((teil) => teil.split(satz).length - 1)
      .reduce((a, b) => a + b, 0);
  }

  it("Fragebogen-Mail: „bereit zur Prüfung“ nur, wenn die Modalitaeten vorliegen", () => {
    const mail = rendern("questionnaire-completed", {
      modalitaeten_eingereicht: "ja",
      modalitaeten_offen: "",
      ohne_vorgesetzten_link: "",
    });

    expect(mail.html).toContain("Die Einstellungsmodalitäten der Führungskraft liegen bereits vor.");
    expect(mail.text).toContain("Die Einstellungsmodalitäten der Führungskraft liegen bereits vor.");
    expect(mail.html).not.toContain("stehen noch aus");
    expect(mail.html).not.toContain("kein Vorgesetzten-Link vergeben");
  });

  it("Fragebogen-Mail: offene Modalitaeten behaupten NICHT „bereit zur Prüfung“", () => {
    const mail = rendern("questionnaire-completed", {
      modalitaeten_eingereicht: "",
      modalitaeten_offen: "ja",
      ohne_vorgesetzten_link: "",
    });

    expect(mail.html).toContain("stehen noch aus");
    expect(mail.text).toContain("stehen noch aus");
    expect(wieOft(mail, BEREIT)).toBe(0);
  });

  it("Fragebogen-Mail: ohne Vorgesetzten-Link ist der Vorgang prueffaehig", () => {
    const mail = rendern("questionnaire-completed", {
      modalitaeten_eingereicht: "",
      modalitaeten_offen: "",
      ohne_vorgesetzten_link: "ja",
    });

    expect(mail.html).toContain("kein Vorgesetzten-Link vergeben");
    expect(mail.html).not.toContain("stehen noch aus");
  });

  it("Fragebogen-Mail: nie zwei Statussaetze zugleich", () => {
    for (const merker of [
      { modalitaeten_eingereicht: "ja", modalitaeten_offen: "", ohne_vorgesetzten_link: "" },
      { modalitaeten_eingereicht: "", modalitaeten_offen: "ja", ohne_vorgesetzten_link: "" },
      { modalitaeten_eingereicht: "", modalitaeten_offen: "", ohne_vorgesetzten_link: "ja" },
    ]) {
      const mail = rendern("questionnaire-completed", merker);
      const saetze = [
        "liegen bereits vor",
        "stehen noch aus",
        "kein Vorgesetzten-Link vergeben",
      ].filter((satz) => mail.html.includes(satz));
      expect({ merker, saetze }).toEqual({ merker, saetze: [saetze[0]] });
    }
  });

  it("Fragebogen-Mail: ohne jeden Merker steht gar kein Statussatz da", () => {
    // Sicherheitsnetz fuer den Fall, dass der Abgleich fehlt: kein Satz ist
    // besser als ein falscher.
    const mail = rendern("questionnaire-completed", {
      modalitaeten_eingereicht: "",
      modalitaeten_offen: "",
      ohne_vorgesetzten_link: "",
    });

    expect(wieOft(mail, BEREIT)).toBe(0);
    expect(mail.html).not.toContain("stehen noch aus");
    expect(mail.html).not.toContain("kein Vorgesetzten-Link vergeben");
  });

  it("Modalitaeten-Mail: „bereit zur Prüfung“ nur mit vorliegendem Fragebogen", () => {
    const fertig = rendern("supervisor-completed", {
      fragebogen_eingereicht: "ja",
      fragebogen_offen: "",
    });
    const offen = rendern("supervisor-completed", {
      fragebogen_eingereicht: "",
      fragebogen_offen: "ja",
    });

    expect(fertig.html).toContain("Der Personalfragebogen liegt bereits vor.");
    expect(fertig.html).not.toContain("steht noch aus");
    expect(offen.html).toContain("Der Personalfragebogen steht noch aus.");
    expect(wieOft(offen, BEREIT)).toBe(0);
  });

  it("Modalitaeten-Mail: behauptet nicht mehr, der Vorgang sei abzuschliessen", () => {
    // Alter Text: „Alle Daten eingegangen" / „Der Vorgang kann jetzt
    // abgeschlossen werden" — beides falsch, solange der Fragebogen fehlt.
    const mail = rendern("supervisor-completed", {
      fragebogen_eingereicht: "",
      fragebogen_offen: "ja",
    });

    expect(mail.html).not.toContain("Alle Daten eingegangen");
    expect(mail.html).not.toContain("kann jetzt abgeschlossen werden");
    expect(mail.text).not.toContain("Bitte schließen Sie den Vorgang im HR-Portal ab.");
  });

  it("beide Mails tragen Name und Vorgangsnummer im Betreff — nie die private Adresse", () => {
    const fragebogen = rendern("questionnaire-completed", { modalitaeten_offen: "ja" });
    const modalitaeten = rendern("supervisor-completed", { fragebogen_offen: "ja" });

    for (const mail of [fragebogen, modalitaeten]) {
      expect(mail.subject).toContain("Anna Beispiel");
      expect(mail.subject).toContain("2026-GYM-042");
      expect(mail.subject).not.toContain("privat@gmx.example");
    }
  });

  it("ohne Namen bleibt der Satz lesbar: „für“, nicht „von“", () => {
    // `MITARBEITER_NEUTRAL` ist ein AKKUSATIV („die neue Mitarbeiterin / den
    // neuen Mitarbeiter"). Nach „von" (Dativ) stand da „Der Personalfragebogen
    // von die neue Mitarbeiterin / den neuen Mitarbeiter…". Im parallelen
    // Ablauf ist „noch kein Name" der Regelfall, nicht die Ausnahme.
    const mail = rendern("questionnaire-completed", {
      mitarbeiter_name: MITARBEITER_NEUTRAL,
      modalitaeten_offen: "ja",
    });

    expect(mail.html).toContain(
      `Der Personalfragebogen für <strong>${MITARBEITER_NEUTRAL}</strong> wurde soeben`,
    );
    expect(mail.text).toContain(`Der Personalfragebogen für ${MITARBEITER_NEUTRAL} wurde soeben`);
    expect(mail.html).not.toContain("Personalfragebogen von");
    expect(mail.text).not.toContain("Personalfragebogen von");
    // Bei der Modalitaeten-Mail traegt „für" den Akkusativ schon immer.
    const mod = rendern("supervisor-completed", {
      mitarbeiter_name: MITARBEITER_NEUTRAL,
      fragebogen_offen: "ja",
    });
    expect(mod.subject).toBe(
      `Einstellungsmodalitäten für ${MITARBEITER_NEUTRAL} eingereicht (2026-GYM-042)`,
    );
  });

  it("laesst keinen rohen {{...}}-Marker in der fertigen Mail stehen", () => {
    for (const mail of [
      rendern("questionnaire-completed", { modalitaeten_eingereicht: "ja" }),
      rendern("questionnaire-completed", { modalitaeten_offen: "ja" }),
      rendern("questionnaire-completed", { ohne_vorgesetzten_link: "ja" }),
      rendern("supervisor-completed", { fragebogen_eingereicht: "ja" }),
      rendern("supervisor-completed", { fragebogen_offen: "ja" }),
    ]) {
      for (const teil of [mail.subject, mail.html, mail.text ?? ""]) {
        expect(teil).not.toMatch(/\{\{/);
      }
    }
  });
});

/**
 * Paket 2: Die Eingangsbestaetigung an die Person lief frueher an
 * `sendEventEmail` vorbei (eigene `replaceAll`-Schleife, `sendEmail` direkt).
 * Damit wirkten weder Versandprotokoll noch Aktiv-Schalter noch die
 * Empfaengerfelder der Vorlage. Hier wird der neue Weg festgehalten.
 */
describe("Eingangsbestaetigung an die Person (questionnaire-confirmation-employee)", () => {
  const EVENT = "questionnaire-confirmation-employee";
  const nutzlast = {
    onboardingId: "o1",
    displayId: "2026-GYM-042",
    email: "privat@gmx.example",
    vorname: "Anna",
    nachname: "Beispiel",
    organization: "Berufskolleg",
  };

  it("geht ohne gespeicherte Vorlage an die Person — der Empfaenger kommt aus dem Katalog", async () => {
    // resolveEventTemplate liefert fuer Code-Vorlagen recipientTo: "";
    // renderEventEmail faellt dann auf den Katalog-Default {{email}} zurueck.
    mockPrisma.emailTemplate.findUnique.mockResolvedValue(null);

    const result = await sendEventEmail(EVENT, nutzlast);

    expect(result.status).toBe("SENT");
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "privat@gmx.example" })
    );
  });

  it("landet im Versandprotokoll", async () => {
    mockPrisma.emailTemplate.findUnique.mockResolvedValue(null);

    await sendEventEmail(EVENT, nutzlast);

    expect(mockPrisma.emailLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ event: EVENT, status: "SENT" }),
    });
  });

  it("respektiert den Aktiv-Schalter der Vorlage", async () => {
    // Frueher wirkungslos: Die Route las die Vorlage selbst und versendete
    // ohne jede Pruefung.
    mockPrisma.emailTemplate.findUnique.mockResolvedValue({
      ...baseTemplate,
      event: EVENT,
      recipientTo: "{{email}}",
      isActive: false,
    });

    const result = await sendEventEmail(EVENT, nutzlast);

    expect(result.status).toBe("SKIPPED");
    expect(mockSendMail).not.toHaveBeenCalled();
    expect(mockPrisma.emailLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ event: EVENT, status: "SKIPPED" }),
    });
  });

  it("nimmt den Empfaenger aus der Vorlage, wenn HR dort einen eintraegt", async () => {
    mockPrisma.emailTemplate.findUnique.mockResolvedValue({
      ...baseTemplate,
      event: EVENT,
      recipientTo: "{{email}}",
      recipientCc: "personal@example.org",
    });

    await sendEventEmail(EVENT, nutzlast);

    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "privat@gmx.example",
        cc: "personal@example.org",
      })
    );
  });
});
