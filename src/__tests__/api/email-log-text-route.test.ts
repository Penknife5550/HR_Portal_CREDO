/**
 * Versandprotokoll in den Einstellungen: die Liste kennzeichnet nur, OB es
 * einen Text gibt; der Text selbst kommt aus …/[id]/text.
 */

const mockGetSession = jest.fn();
const mockPrisma = {
  emailLog: { count: jest.fn(), findMany: jest.fn(), findFirst: jest.fn(), deleteMany: jest.fn() },
};

jest.mock("@/lib/auth", () => ({ getSession: mockGetSession }));
jest.mock("@/lib/db", () => ({ prisma: mockPrisma }));

import { NextRequest } from "next/server";
import { GET as LISTE } from "@/app/api/settings/email-log/route";
import { GET as TEXT } from "@/app/api/settings/email-log/[id]/text/route";
import { ALLE_ZEILEN } from "@/lib/mail-text-dienst";

const ADMIN = { userId: "u1", email: "a@example.org", role: "HR_LEITUNG", firstName: "A", lastName: "B" };

function liste() {
  return LISTE(new NextRequest("http://localhost/api/settings/email-log"));
}
function text(id = "log-1") {
  return TEXT(new NextRequest(`http://localhost/api/settings/email-log/${id}/text`), {
    params: Promise.resolve({ id }),
  });
}

const BASIS = {
  createdAt: new Date("2026-10-14T07:12:00Z"),
  recipient: "anna@beispiel.invalid",
  cc: null,
  bcc: null,
  subject: "Willkommen",
  detail: null,
  messageId: "<m1>",
  vorgangTyp: null,
  vorgangId: null,
  isTest: false,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetSession.mockResolvedValue(ADMIN);
  mockPrisma.emailLog.deleteMany.mockResolvedValue({ count: 0 });
  mockPrisma.emailLog.count.mockResolvedValue(3);
  mockPrisma.emailLog.findMany.mockResolvedValue([
    { ...BASIS, id: "l1", event: "onboarding-created", status: "SENT", text: { emailLogId: "l1" } },
    { ...BASIS, id: "l2", event: "bem-frist-erinnerung", status: "SENT", text: null },
    { ...BASIS, id: "l3", event: "onboarding-created", status: "SKIPPED", text: null },
  ]);
});

describe("GET /api/settings/email-log", () => {
  it("liest nur, ob es einen Text gibt — nie den Inhalt", async () => {
    await liste();
    expect(mockPrisma.emailLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ include: { text: { select: { emailLogId: true } } } }),
    );
  });

  it("kennzeichnet jede Zeile und nennt den Grund, wenn der Text fehlt", async () => {
    const json = await (await liste()).json();
    const [a, b, c] = json.data.logs;
    expect(a).toEqual(expect.objectContaining({ id: "l1", textVorhanden: true, textHinweis: null }));
    expect(b.textVorhanden).toBe(false);
    expect(b.textHinweis).toMatch(/BEM/);
    expect(c.textHinweis).toMatch(/nicht erzeugt/);
    // das Relationsobjekt selbst geht nicht hinaus
    expect(a).not.toHaveProperty("text");
  });
});

describe("GET /api/settings/email-log/[id]/text", () => {
  it("nur SUPER_ADMIN und HR_LEITUNG", async () => {
    mockGetSession.mockResolvedValue(null);
    expect((await text()).status).toBe(401);
    mockGetSession.mockResolvedValue({ ...ADMIN, role: "HR_SACHBEARBEITER" });
    expect((await text()).status).toBe(403);
    expect(mockPrisma.emailLog.findFirst).not.toHaveBeenCalled();
  });

  it("liefert den Text einer Zeile ohne Cache", async () => {
    mockPrisma.emailLog.findFirst.mockResolvedValue({
      ...BASIS,
      event: "onboarding-created",
      status: "SENT",
      subject: "Willkommen",
      text: { bodyHtml: "<p>Hallo</p>", gekuerzt: true },
    });
    const res = await text();
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const json = await res.json();
    expect(json.text).toBe("Hallo");
    expect(json.gekuerzt).toBe(true);
    expect(mockPrisma.emailLog.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "log-1" } }));
  });

  it("404 ohne Zeile oder ohne Text", async () => {
    mockPrisma.emailLog.findFirst.mockResolvedValue(null);
    expect((await text()).status).toBe(404);
    mockPrisma.emailLog.findFirst.mockResolvedValue({ ...BASIS, event: "x", status: "SKIPPED", text: null });
    expect((await text()).status).toBe(404);
  });
});

describe("Zusaetze der Durchsicht vom 15.10.2026", () => {
  it("nennt fuer eine FAILED-Zeile ohne Betreff den Grund „vor dem Versand“", async () => {
    mockPrisma.emailLog.findMany.mockResolvedValue([
      { ...BASIS, id: "l9", event: "onboarding-created", status: "FAILED", subject: "", recipient: "", text: null },
      { ...BASIS, id: "l10", event: "onboarding-created", status: "FAILED", subject: "Willkommen", text: null },
    ]);
    const json = await (await liste()).json();
    expect(json.data.logs[0].textHinweis).toMatch(/Fehler vor dem Versand/);
    expect(json.data.logs[1].textHinweis).toMatch(/Kein Text gespeichert/);
  });

  it("fragt den Text einer Zeile ausdruecklich ueber alle Zeilen ab (ALLE_ZEILEN, nie still)", async () => {
    mockPrisma.emailLog.findFirst.mockResolvedValue({
      ...BASIS,
      event: "onboarding-created",
      status: "SENT",
      text: { bodyHtml: "<p>Hallo</p>", gekuerzt: false },
    });
    await text("log-7");
    expect(mockPrisma.emailLog.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "log-7", ...ALLE_ZEILEN } }),
    );
    expect(Object.keys(ALLE_ZEILEN)).toEqual([]);
  });

  it("ohne ersetzten Link gibt es keinen Link-Hinweis", async () => {
    mockPrisma.emailLog.findFirst.mockResolvedValue({
      ...BASIS,
      event: "onboarding-created",
      status: "SENT",
      text: { bodyHtml: "<p>Hallo</p>", gekuerzt: false },
    });
    expect((await (await text()).json()).linkHinweis).toBeNull();
  });
});
