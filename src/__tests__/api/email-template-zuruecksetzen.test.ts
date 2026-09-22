/**
 * Tests: „Text auf Standard zuruecksetzen“ fuer E-Mail-Vorlagen
 * (POST /api/settings/email-templates/[id]/zuruecksetzen)
 *
 * Hintergrund: Eine gespeicherte Vorlage ueberschreibt den Code-Default
 * vollstaendig — neue Standardtexte (etwa „Stellenbezeichnung“ statt
 * „Stellenbeschreibung“) kamen dort nie an. Das Zuruecksetzen holt NUR den
 * Text zurueck. Der entscheidende Teil sind die Felder, die es NICHT anfasst:
 * HR-interne Events haben keinen Empfaenger-Default; verloeren sie ihr
 * eingetragenes An-Feld, liefen sie ab sofort still als SKIPPED.
 *
 * @/lib/email-vorlagen-standard und die Default-Vorlagen werden bewusst NICHT
 * gemockt — geprueft wird gegen den echten Standardtext.
 */

const mockGetSession = jest.fn();
const mockPrisma = {
  emailTemplate: { findUnique: jest.fn(), update: jest.fn() },
  auditLog: { create: jest.fn() },
  $transaction: jest.fn(),
};

jest.mock("@/lib/auth", () => ({ getSession: mockGetSession }));
jest.mock("@/lib/db", () => ({ prisma: mockPrisma }));

import { POST } from "@/app/api/settings/email-templates/[id]/zuruecksetzen/route";
import { NextRequest } from "next/server";
import { DEFAULT_EMAIL_TEMPLATES } from "@/lib/default-email-templates";

const SUPER_ADMIN = {
  userId: "sa1",
  email: "admin@example.org",
  role: "SUPER_ADMIN",
  firstName: "S",
  lastName: "A",
};

// HR-internes Event: Ohne eingetragenes An-Feld wuerde es uebersprungen.
const EVENT = "questionnaire-completed";
const standard = DEFAULT_EMAIL_TEMPLATES.find((t) => t.event === EVENT)!;

/** Gespeicherte Fassung mit eigenem Text UND konfigurierten Empfaengern. */
const GESPEICHERT = {
  id: "tpl-1",
  event: EVENT,
  subject: "Alter Betreff mit Stellenbeschreibung",
  bodyHtml: "<p>Alter Text</p>",
  bodyText: "Alter Text",
};

function req(id: string) {
  return new NextRequest(`http://localhost:3000/api/settings/email-templates/${id}/zuruecksetzen`, {
    method: "POST",
  });
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetSession.mockResolvedValue(SUPER_ADMIN);
  mockPrisma.emailTemplate.findUnique.mockResolvedValue({ ...GESPEICHERT });
  // Array-Transaktion: update/create liefern nur die Operation, ausgefuehrt
  // wird sie in $transaction. Die Marker machen pruefbar, dass BEIDE darin
  // stecken.
  mockPrisma.emailTemplate.update.mockReturnValue("UPDATE_OP");
  mockPrisma.auditLog.create.mockReturnValue("AUDIT_OP");
  mockPrisma.$transaction.mockImplementation(async (ops: unknown[]) =>
    ops.map((op) =>
      op === "UPDATE_OP"
        ? {
            ...GESPEICHERT,
            subject: standard.subject.trim(),
            recipientTo: "personal@example.org",
            isActive: false,
          }
        : { id: "audit-1" }
    )
  );
});

describe("POST /api/settings/email-templates/[id]/zuruecksetzen — Berechtigung", () => {
  it("401 ohne Session", async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await POST(req("tpl-1"), params("tpl-1"));
    expect(res.status).toBe(401);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it.each(["HR_SACHBEARBEITER", "EINRICHTUNGSLEITUNG", "VORGESETZTER", "BEM_BEAUFTRAGTER"])(
    "403 fuer Rolle %s",
    async (role) => {
      mockGetSession.mockResolvedValue({ ...SUPER_ADMIN, role });
      const res = await POST(req("tpl-1"), params("tpl-1"));
      expect(res.status).toBe(403);
      expect(mockPrisma.emailTemplate.findUnique).not.toHaveBeenCalled();
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    }
  );

  it("HR_LEITUNG darf zuruecksetzen (wie die uebrigen Settings-Routen)", async () => {
    mockGetSession.mockResolvedValue({ ...SUPER_ADMIN, role: "HR_LEITUNG" });
    const res = await POST(req("tpl-1"), params("tpl-1"));
    expect(res.status).toBe(200);
  });
});

describe("POST /api/settings/email-templates/[id]/zuruecksetzen — 404", () => {
  it("404, wenn es keine gespeicherte Fassung gibt (z.B. Listen-ID default-<event>)", async () => {
    mockPrisma.emailTemplate.findUnique.mockResolvedValue(null);
    const res = await POST(req(`default-${EVENT}`), params(`default-${EVENT}`));

    expect(res.status).toBe(404);
    expect((await res.json()).error).toMatch(/keine gespeicherte Fassung/);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("404, wenn es fuer das Event keinen Standardtext gibt", async () => {
    mockPrisma.emailTemplate.findUnique.mockResolvedValue({
      ...GESPEICHERT,
      event: "altes-event-ohne-standard",
    });
    const res = await POST(req("tpl-1"), params("tpl-1"));

    expect(res.status).toBe(404);
    expect((await res.json()).error).toContain("altes-event-ohne-standard");
    // Nichts anfassen: Worauf sollte zurueckgesetzt werden?
    expect(mockPrisma.emailTemplate.update).not.toHaveBeenCalled();
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("404 statt 500, wenn die Zeile zwischen Lesen und Schreiben verschwindet", async () => {
    mockPrisma.$transaction.mockRejectedValue(Object.assign(new Error("Record not found"), { code: "P2025" }));
    const res = await POST(req("tpl-1"), params("tpl-1"));
    expect(res.status).toBe(404);
  });

  it("500 bei anderen Datenbankfehlern", async () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    mockPrisma.$transaction.mockRejectedValue(new Error("Verbindung weg"));
    const res = await POST(req("tpl-1"), params("tpl-1"));
    expect(res.status).toBe(500);
    spy.mockRestore();
  });
});

describe("POST /api/settings/email-templates/[id]/zuruecksetzen — was geschrieben wird", () => {
  it("schreibt Betreff, HTML, Plaintext und Variablen des aktuellen Standards (getrimmt wie beim Speichern)", async () => {
    const res = await POST(req("tpl-1"), params("tpl-1"));
    expect(res.status).toBe(200);

    expect(mockPrisma.emailTemplate.update).toHaveBeenCalledWith({
      where: { id: "tpl-1" },
      data: {
        subject: standard.subject.trim(),
        bodyHtml: standard.bodyHtml.trim(),
        bodyText: standard.bodyText.trim() || null,
        variables: standard.variables,
      },
    });
  });

  it("laesst Empfaengerfelder, Aktiv-Schalter und Namen unangetastet", async () => {
    await POST(req("tpl-1"), params("tpl-1"));

    const { data } = mockPrisma.emailTemplate.update.mock.calls[0][0];
    // Exakt diese vier Felder — alles andere (recipientTo/Cc/Bcc/ReplyTo,
    // isActive, name, event) bleibt, wie es in der Datenbank steht.
    expect(Object.keys(data).sort()).toEqual(["bodyHtml", "bodyText", "subject", "variables"]);
    for (const feld of ["recipientTo", "recipientCc", "recipientBcc", "recipientReplyTo", "isActive", "name", "event"]) {
      expect(data).not.toHaveProperty(feld);
    }
  });

  it("aendert die Zeile, statt sie zu loeschen oder per upsert neu anzulegen", async () => {
    // Der Mock kennt weder delete noch upsert — riefe die Route eines davon
    // auf, endete sie mit einem TypeError im 500er-Zweig.
    const res = await POST(req("tpl-1"), params("tpl-1"));
    expect(res.status).toBe(200);
    expect(mockPrisma.emailTemplate.update).toHaveBeenCalledTimes(1);
  });

  it("schreibt Aenderung und AuditLog in EINER Transaktion", async () => {
    await POST(req("tpl-1"), params("tpl-1"));
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mockPrisma.$transaction).toHaveBeenCalledWith(["UPDATE_OP", "AUDIT_OP"]);
  });

  it("protokolliert EMAIL_TEMPLATE_RESET mit Event, Feldern und dem ueberschriebenen Text", async () => {
    await POST(req("tpl-1"), params("tpl-1"));

    expect(mockPrisma.auditLog.create).toHaveBeenCalledTimes(1);
    const { data } = mockPrisma.auditLog.create.mock.calls[0][0];
    expect(data.userId).toBe("sa1");
    expect(data.processType).toBe("SYSTEM");
    expect(data.action).toBe("EMAIL_TEMPLATE_RESET");
    expect(data.details.event).toBe(EVENT);
    expect(data.details.felder).toEqual(["subject", "bodyHtml", "bodyText", "variables"]);
    expect(data.details.abweichend).toEqual(["subject", "bodyHtml", "bodyText"]);
    // Rueckweg fuer bewusst formulierte Texte
    expect(data.details.vorher).toEqual({
      subject: GESPEICHERT.subject,
      bodyHtml: GESPEICHERT.bodyHtml,
      bodyText: GESPEICHERT.bodyText,
    });
    expect(data.details.beibehalten).toEqual(
      expect.arrayContaining(["recipientTo", "recipientCc", "recipientBcc", "recipientReplyTo", "isActive"])
    );
  });

  it("vermerkt nur tatsaechlich abweichende Felder als ueberschrieben", async () => {
    // Nur der Betreff wurde angepasst; HTML und Plaintext entsprechen dem Standard
    mockPrisma.emailTemplate.findUnique.mockResolvedValue({
      ...GESPEICHERT,
      bodyHtml: standard.bodyHtml,
      bodyText: standard.bodyText,
    });
    await POST(req("tpl-1"), params("tpl-1"));

    const { details } = mockPrisma.auditLog.create.mock.calls[0][0].data;
    expect(details.abweichend).toEqual(["subject"]);
    expect(Object.keys(details.vorher)).toEqual(["subject"]);
  });

  it("liefert die geaenderte Zeile zurueck — mit den unveraenderten Empfaengern", async () => {
    const res = await POST(req("tpl-1"), params("tpl-1"));
    const json = await res.json();
    expect(json.data.id).toBe("tpl-1");
    expect(json.data.recipientTo).toBe("personal@example.org");
    expect(json.data.isActive).toBe(false);
  });
});
