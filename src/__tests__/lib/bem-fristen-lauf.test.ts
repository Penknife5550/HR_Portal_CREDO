/**
 * Lauf „BEM-Fristen“ — die Stufe (letzteSeverity) wird ERST NACH dem Versand
 * gespeichert: bei SENT und SKIPPED ja, bei FAILED und ohne freigegebene
 * Beauftragte nein (der naechste Lauf versucht es erneut).
 */

const mockPrisma = {
  bemFall: { findMany: jest.fn() },
  bemFrist: { findMany: jest.fn(), update: jest.fn() },
  bemZugriff: { findMany: jest.fn() },
};
const mockSendEventEmail = jest.fn();
const mockLogBemAudit = jest.fn();
const mockLogBemKommunikation = jest.fn();

jest.mock("@/lib/db", () => ({ prisma: mockPrisma }));
jest.mock("@/lib/url", () => ({ getBaseUrl: () => "https://hr.example.org" }));
jest.mock("@/lib/mailer", () => ({ sendEventEmail: mockSendEventEmail }));
jest.mock("@/lib/bem-fristen", () => ({
  syncBemFristen: jest.fn().mockResolvedValue(undefined),
  berechneSeverity: () => "WARNING",
}));
jest.mock("@/lib/bem-audit", () => ({
  logBemAudit: mockLogBemAudit,
  logBemKommunikation: mockLogBemKommunikation,
  BEM_AUDIT_ACTIONS: { FRIST_ERINNERUNG: "FRIST_ERINNERUNG" },
}));

import { BEM_FRIST_EVENT, bemFristenLauf } from "@/lib/laeufe/bem-fristen";

const JETZT = new Date("2026-09-30T06:00:00Z");

function frist(id: string) {
  return {
    id,
    bezeichnung: "Erstgespräch",
    faelligAm: new Date("2026-10-06T00:00:00Z"),
    letzteSeverity: "INFO",
    bemFall: { id: "fall-1", displayId: "BEM-2026-GYM-001" },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.bemFall.findMany.mockResolvedValue([{ id: "fall-1" }]);
  mockPrisma.bemFrist.findMany.mockResolvedValue([frist("f1"), frist("f2")]);
  mockPrisma.bemFrist.update.mockResolvedValue({});
  mockPrisma.bemZugriff.findMany.mockResolvedValue([
    { user: { email: "a@example.org", isActive: true } },
    { user: { email: "b@example.org", isActive: true } },
  ]);
  mockSendEventEmail.mockResolvedValue({ status: "SENT", messageId: "<m>", subject: "BEM: Frist(en) fällig" });
});

it("SENT: je Beauftragtem eine Mail mit overrideTo, danach die Stufe je Frist", async () => {
  const antwort = await bemFristenLauf({ jetzt: JETZT });
  expect(mockSendEventEmail).toHaveBeenCalledTimes(2);
  expect(mockSendEventEmail).toHaveBeenCalledWith(BEM_FRIST_EVENT, expect.objectContaining({ email: "a@example.org" }), {
    overrideTo: "a@example.org",
  });
  expect(mockPrisma.bemFrist.update).toHaveBeenCalledTimes(2);
  expect(mockPrisma.bemFrist.update).toHaveBeenCalledWith({
    where: { id: "f1" },
    data: { letzteSeverity: "WARNING", letzteWarnungAm: JETZT },
  });
  // Die Stufe kommt nach dem Versand, nicht davor.
  expect(mockPrisma.bemFrist.update.mock.invocationCallOrder[0]).toBeGreaterThan(
    mockSendEventEmail.mock.invocationCallOrder[1],
  );
  expect((antwort.body as { data: { mailsGesendet: number } }).data.mailsGesendet).toBe(2);
});

it("FAILED bei allen Beauftragten: keine Stufe — der naechste Lauf versucht es erneut", async () => {
  mockSendEventEmail.mockResolvedValue({ status: "FAILED", detail: "Connection timeout" });
  const antwort = await bemFristenLauf({ jetzt: JETZT });
  expect(mockPrisma.bemFrist.update).not.toHaveBeenCalled();
  expect((antwort.body as { data: { mailsFehler: number } }).data.mailsFehler).toBe(2);
});

it("einer SENT, einer FAILED: die Stufe gilt (mindestens eine Person weiss Bescheid)", async () => {
  mockSendEventEmail
    .mockResolvedValueOnce({ status: "SENT", messageId: "<m>" })
    .mockResolvedValueOnce({ status: "FAILED", detail: "x" });
  await bemFristenLauf({ jetzt: JETZT });
  expect(mockPrisma.bemFrist.update).toHaveBeenCalledTimes(2);
});

it("SKIPPED (Vorlage aus): Stufe setzen — ein neuer Versuch aenderte nichts", async () => {
  mockSendEventEmail.mockResolvedValue({ status: "SKIPPED", detail: "E-Mail-Vorlage ist deaktiviert" });
  await bemFristenLauf({ jetzt: JETZT });
  expect(mockPrisma.bemFrist.update).toHaveBeenCalledTimes(2);
});

it("ohne freigegebene Beauftragte: keine Mail, keine Stufe", async () => {
  mockPrisma.bemZugriff.findMany.mockResolvedValue([]);
  const antwort = await bemFristenLauf({ jetzt: JETZT });
  expect(mockSendEventEmail).not.toHaveBeenCalled();
  expect(mockPrisma.bemFrist.update).not.toHaveBeenCalled();
  expect((antwort.body as { data: { ohneEmpfaenger: number } }).data.ohneEmpfaenger).toBe(1);
});
