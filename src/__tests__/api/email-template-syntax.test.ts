/**
 * Tests: Syntaxpruefung beim Speichern einer E-Mail-Vorlage
 * (PUT /api/settings/email-templates/[id])
 *
 * Hintergrund: Ein bedingter Block {{#nachricht}}...{{/nachricht}} loest der
 * Renderer nur als vollstaendiges Paar auf. Fehlt der Schluss-Marker, greift
 * weder die Block- noch die Variablen-Ersetzung — der Rohtext "{{#nachricht}}"
 * landete woertlich im Postfach der beschaeftigten Person. Die Hauptschranke
 * sitzt deshalb hier, beim Speichern: dort, wo der Tippfehler entsteht und wer
 * ihn gemacht hat noch davorsitzt.
 *
 * @/lib/mailer wird bewusst NICHT gemockt — geprueft werden soll die echte
 * Funktion, nicht ein Platzhalter. Der Import ist unbedenklich: nodemailer wird
 * erst in createTransporter benutzt, die Verschluesselung initialisiert lazy,
 * und @/lib/db ist hier ohnehin ersetzt.
 */

const mockGetSession = jest.fn();
const mockPrisma = {
  emailTemplate: { upsert: jest.fn() },
  auditLog: { create: jest.fn() },
};

jest.mock("@/lib/auth", () => ({ getSession: mockGetSession }));
jest.mock("@/lib/db", () => ({ prisma: mockPrisma }));

import { PUT } from "@/app/api/settings/email-templates/[id]/route";
import { NextRequest } from "next/server";

const SUPER_ADMIN = {
  userId: "sa1",
  email: "admin@credo-gruppe.de",
  role: "SUPER_ADMIN",
  firstName: "S",
  lastName: "A",
};

function req(body: Record<string, unknown>) {
  return new NextRequest("http://localhost:3000/api/settings/email-templates/t1", {
    method: "PUT",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

/** Vollstaendige Vorlage; die einzelnen Faelle ueberschreiben nur ein Feld. */
function vorlage(ueberschreibung: Record<string, unknown> = {}) {
  return {
    event: "onboarding-created",
    subject: "Willkommen {{vorname}}",
    bodyHtml: "<p>Hallo {{vorname}}</p>",
    bodyText: "Hallo {{vorname}}",
    isActive: true,
    ...ueberschreibung,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetSession.mockResolvedValue(SUPER_ADMIN);
  mockPrisma.emailTemplate.upsert.mockResolvedValue({
    id: "t1",
    event: "onboarding-created",
    isActive: true,
    recipientTo: "",
    recipientCc: "",
    recipientBcc: "",
    recipientReplyTo: "",
  });
  mockPrisma.auditLog.create.mockResolvedValue({});
});

describe("PUT /api/settings/email-templates/[id] — Bedingungsmarker", () => {
  it("weist eine Vorlage mit offenem Bedingungsblock ab", async () => {
    const res = await PUT(
      req(vorlage({ bodyHtml: "{{#nachricht}}Hallo" })),
      params("t1"),
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("{{#nachricht}}");
    expect(json.error).toContain("HTML-Body");
    // Der entscheidende Teil: die kaputte Vorlage landet gar nicht erst in der
    // Datenbank — sonst ginge sie beim naechsten Ereignis hinaus.
    expect(mockPrisma.emailTemplate.upsert).not.toHaveBeenCalled();
  });

  it("benennt den Betreff, wenn der Fehler dort steht", async () => {
    const res = await PUT(req(vorlage({ subject: "{{#a}}Hallo" })), params("t1"));

    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("Betreff");
  });

  it("weist auch ein Schluss-Tag ohne Anfang im Plaintext ab", async () => {
    const res = await PUT(req(vorlage({ bodyText: "Hallo{{/nachricht}}" })), params("t1"));

    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("Plaintext");
    expect(mockPrisma.emailTemplate.upsert).not.toHaveBeenCalled();
  });

  it("speichert eine Vorlage mit vollstaendigem Block", async () => {
    // Gegenprobe: Der Standardfall darf nicht blockiert werden.
    const res = await PUT(
      req(vorlage({ bodyHtml: "{{#nachricht}}{{nachricht}}{{/nachricht}}" })),
      params("t1"),
    );

    expect(res.status).toBe(200);
    expect(mockPrisma.emailTemplate.upsert).toHaveBeenCalled();
  });
});

/**
 * Paket 4: Das Versandprotokoll haelt Betreffzeilen 90 Tage fest. Fuer die
 * Mails der Nachforderung sind deshalb Unterlagennamen, Begruendung, Nachricht
 * und jeder Weg zum Link im Betreff verboten (betreffOhne im Event-Katalog).
 */
describe("PUT /api/settings/email-templates/[id] — verbotene Variablen im Betreff", () => {
  it("weist {{link}} im Betreff ab und nennt den Grund", async () => {
    const res = await PUT(
      req(vorlage({ event: "unterlagen-angefordert", subject: "Ihr Upload-Link: {{link}}" })),
      params("t1"),
    );

    expect(res.status).toBe(400);
    const { error } = await res.json();
    expect(error).toContain("{{link}}");
    expect(error).toContain("90 Tage im Versandprotokoll");
    // Die Vorlage landet gar nicht erst in der Datenbank.
    expect(mockPrisma.emailTemplate.upsert).not.toHaveBeenCalled();
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });

  it.each([
    ["unterlage-zurueckgewiesen", "Zurückgewiesen: {{unterlage}}", "{{unterlage}}"],
    ["unterlage-zurueckgewiesen", "Grund: {{ begruendung }}", "{{begruendung}}"],
    ["unterlagen-erinnerung", "Offen: {{unterlagenliste}}", "{{unterlagenliste}}"],
    ["unterlagen-angefordert", "{{#nachricht}}Mit Nachricht{{/nachricht}}", "{{nachricht}}"],
    ["unterlagen-vollstaendig", "Eingegangen {{magicLink}}", "{{magicLink}}"],
  ])("%s: %s ergibt 400", async (event, subject, genannt) => {
    const res = await PUT(req(vorlage({ event, subject })), params("t1"));

    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain(genannt);
    expect(mockPrisma.emailTemplate.upsert).not.toHaveBeenCalled();
  });

  it("nennt alle verbotenen Variablen auf einmal", async () => {
    const res = await PUT(
      req(vorlage({ event: "unterlage-zurueckgewiesen", subject: "{{unterlage}} – {{link}}" })),
      params("t1"),
    );

    expect(res.status).toBe(400);
    const { error } = await res.json();
    expect(error).toContain("{{unterlage}}");
    expect(error).toContain("{{link}}");
  });

  it("speichert den Standard-Betreff der Nachforderung", async () => {
    const res = await PUT(
      req(
        vorlage({
          event: "unterlagen-angefordert",
          subject: "{{#ist_ergaenzung}}Ergänzung: {{/ist_ergaenzung}}Unterlagen zu Ihrem Vorgang{{vorgang_zusatz}} – {{einrichtung}}",
        }),
      ),
      params("t1"),
    );

    expect(res.status).toBe(200);
    expect(mockPrisma.emailTemplate.upsert).toHaveBeenCalled();
  });

  // Der Renderer loest zuerst die Bloecke auf und setzt danach ein: Aus diesen
  // Betreffzeilen entstuende beim Versand ein echtes {{link}} bzw. die Liste der
  // Unterlagen, obwohl der Rohtext keinen verbotenen Platzhalter nennt.
  it.each([
    ["unterlagen-angefordert", "Unterlagen {{li{{#x}}{{/x}}nk}}"],
    ["unterlagen-angefordert", "Unterlagen {{lin{{#x}}zz{{/x}}k}}"],
    ["unterlagen-erinnerung", "{{l{{#ist_vorab}}i{{/ist_vorab}}n{{#ist_fristtag}}zz{{/ist_fristtag}}k}}"],
    ["unterlage-zurueckgewiesen", "{{unterlage{{#ist_erneut}}{{/ist_erneut}}nliste}}"],
    ["unterlagen-vollstaendig", "Eingegangen {{{#x}}{{/x}}{link}}"],
  ])("%s: zusammengesetzter Platzhalter %s ergibt 400", async (event, subject) => {
    const res = await PUT(req(vorlage({ event, subject })), params("t1"));

    expect(res.status).toBe(400);
    const { error } = await res.json();
    expect(error).toContain("ineinander geschachtelte");
    expect(error).toContain("90 Tage im Versandprotokoll");
    expect(mockPrisma.emailTemplate.upsert).not.toHaveBeenCalled();
  });

  it("laesst Ereignisse ohne Sperrliste unberuehrt ({{link}} im Betreff der Einladung bleibt erlaubt)", async () => {
    const res = await PUT(req(vorlage({ subject: "Ihr Fragebogen: {{link}}" })), params("t1"));

    expect(res.status).toBe(200);
  });
});
