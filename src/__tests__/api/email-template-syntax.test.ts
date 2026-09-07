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
