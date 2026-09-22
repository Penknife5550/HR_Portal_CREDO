/**
 * Tests: Vorlagenliste (GET /api/settings/email-templates) — Quelle und
 * Abweichungs-Kennzeichen
 *
 * Hintergrund: Eine gespeicherte Fassung schluckt jede spaetere Aenderung des
 * Standardtexts. Die Liste sagt deshalb je Vorlage, ob eine gespeicherte
 * Fassung gilt (`source`) und ob ihr Text vom aktuellen Standard abweicht
 * (`weichtVomStandardAb`) — nur so sieht HR, wo ein Update nicht ankommt.
 */

const mockGetSession = jest.fn();
const mockPrisma = {
  emailTemplate: { findMany: jest.fn() },
};

jest.mock("@/lib/auth", () => ({ getSession: mockGetSession }));
jest.mock("@/lib/db", () => ({ prisma: mockPrisma }));

import { GET } from "@/app/api/settings/email-templates/route";
import { DEFAULT_EMAIL_TEMPLATES } from "@/lib/default-email-templates";

const EVENT = "supervisor-link-created";
const standard = DEFAULT_EMAIL_TEMPLATES.find((t) => t.event === EVENT)!;

function dbZeile(ueberschreibung: Record<string, unknown> = {}) {
  return {
    id: "tpl-1",
    event: EVENT,
    name: standard.name,
    subject: standard.subject,
    bodyHtml: standard.bodyHtml,
    bodyText: standard.bodyText,
    variables: standard.variables,
    recipientTo: "{{supervisorEmail}}",
    recipientCc: "personal@example.org",
    recipientBcc: "",
    recipientReplyTo: "",
    isActive: true,
    createdAt: new Date("2026-07-03T10:00:00Z"),
    updatedAt: new Date("2026-07-03T10:00:00Z"),
    ...ueberschreibung,
  };
}

async function liste() {
  const res = await GET();
  expect(res.status).toBe(200);
  return (await res.json()).data as Array<Record<string, unknown>>;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetSession.mockResolvedValue({ userId: "sa1", role: "SUPER_ADMIN" });
  mockPrisma.emailTemplate.findMany.mockResolvedValue([]);
});

describe("GET /api/settings/email-templates — Quelle und Abweichung", () => {
  it("ohne gespeicherte Fassung: source 'default', keine Abweichung", async () => {
    const daten = await liste();
    expect(daten).toHaveLength(DEFAULT_EMAIL_TEMPLATES.length);
    for (const vorlage of daten) {
      expect(vorlage.source).toBe("default");
      expect(vorlage.weichtVomStandardAb).toBe(false);
    }
  });

  it("gespeicherte Fassung mit unveraendertem Text: source 'db', keine Abweichung", async () => {
    // Typischer Fall: Nur ein Empfaenger in Kopie wurde eingetragen, der Text
    // ging dabei unveraendert mit — getrimmt wie beim Speichern und mit
    // Windows-Zeilenenden aus dem Browser.
    mockPrisma.emailTemplate.findMany.mockResolvedValue([
      dbZeile({
        subject: `  ${standard.subject}  `,
        bodyHtml: standard.bodyHtml.trim().replace(/\n/g, "\r\n"),
        bodyText: standard.bodyText.trim(),
      }),
    ]);
    const vorlage = (await liste()).find((t) => t.event === EVENT)!;

    expect(vorlage.source).toBe("db");
    expect(vorlage.weichtVomStandardAb).toBe(false);
    expect(vorlage.id).toBe("tpl-1");
  });

  it("gespeicherte Fassung mit altem Begriff im Text: weicht ab", async () => {
    mockPrisma.emailTemplate.findMany.mockResolvedValue([
      dbZeile({ bodyHtml: standard.bodyHtml.replace(/Stellenbezeichnung/g, "Stellenbeschreibung") + "<!-- alt -->" }),
    ]);
    const vorlage = (await liste()).find((t) => t.event === EVENT)!;

    expect(vorlage.source).toBe("db");
    expect(vorlage.weichtVomStandardAb).toBe(true);
  });

  it("gespeicherte Fassung mit eigenem Betreff: weicht ab", async () => {
    mockPrisma.emailTemplate.findMany.mockResolvedValue([dbZeile({ subject: "Eigener Betreff" })]);
    const vorlage = (await liste()).find((t) => t.event === EVENT)!;
    expect(vorlage.weichtVomStandardAb).toBe(true);
  });

  it("gespeicherte Fassung ohne Plaintext bei vorhandenem Standard-Plaintext: weicht ab", async () => {
    mockPrisma.emailTemplate.findMany.mockResolvedValue([dbZeile({ bodyText: null })]);
    const vorlage = (await liste()).find((t) => t.event === EVENT)!;
    expect(vorlage.weichtVomStandardAb).toBe(true);
  });

  it("das Kennzeichen betrifft nur das eigene Event, die uebrigen bleiben Standard", async () => {
    mockPrisma.emailTemplate.findMany.mockResolvedValue([dbZeile({ subject: "Eigener Betreff" })]);
    const andere = (await liste()).filter((t) => t.event !== EVENT);
    expect(andere.every((t) => t.source === "default" && t.weichtVomStandardAb === false)).toBe(true);
  });

  it("liefert die Variablenliste immer aus dem Code — auch bei gespeicherter Fassung", async () => {
    // Stand beim letzten Speichern: eine alte Liste ohne die neuen
    // Platzhalter. Der Editor zeigt `variables` unter „Verfügbare Variablen" —
    // HR saehe die neuen erst nach dem naechsten Speichern.
    mockPrisma.emailTemplate.findMany.mockResolvedValue([
      dbZeile({ variables: [{ key: "{{alt}}", description: "Alte Beschreibung" }] }),
    ]);
    const vorlage = (await liste()).find((t) => t.event === EVENT)!;

    expect(vorlage.source).toBe("db");
    expect(vorlage.variables).toEqual(JSON.parse(JSON.stringify(standard.variables)));
  });

  it("zeigt bei psi-deadline-warning die neuen Platzhalter trotz alter gespeicherter Liste", async () => {
    const psi = DEFAULT_EMAIL_TEMPLATES.find((t) => t.event === "psi-deadline-warning")!;
    mockPrisma.emailTemplate.findMany.mockResolvedValue([
      {
        ...dbZeile(),
        id: "tpl-psi",
        event: "psi-deadline-warning",
        name: psi.name,
        subject: psi.subject,
        bodyHtml: psi.bodyHtml,
        bodyText: psi.bodyText,
        variables: [
          { key: "{{totalWarnings}}", description: "Anzahl betroffener Vorgaenge" },
          { key: "{{topSeverity}}", description: "Hoechste Dringlichkeit" },
        ],
      },
    ]);
    const vorlage = (await liste()).find((t) => t.event === "psi-deadline-warning")!;
    const namen = JSON.stringify(vorlage.variables);

    expect(namen).toContain("warnungen_liste_html");
    expect(namen).not.toContain("Anzahl betroffener Vorgaenge");
  });

  it("Empfaenger der gespeicherten Fassung bleiben in der Liste erhalten", async () => {
    mockPrisma.emailTemplate.findMany.mockResolvedValue([dbZeile()]);
    const vorlage = (await liste()).find((t) => t.event === EVENT)!;
    expect(vorlage.recipientTo).toBe("{{supervisorEmail}}");
    expect(vorlage.recipientCc).toBe("personal@example.org");
  });
});

describe("GET /api/settings/email-templates — Berechtigung", () => {
  it("403 fuer HR_SACHBEARBEITER", async () => {
    mockGetSession.mockResolvedValue({ userId: "u1", role: "HR_SACHBEARBEITER" });
    const res = await GET();
    expect(res.status).toBe(403);
  });
});
