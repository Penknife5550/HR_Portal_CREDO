/**
 * Vertragsende: Bewertung des Mailversands an die Fuehrungskraft und die
 * Meldungen fuer HR (src/lib/contract-end-versand.ts).
 */

const mockPrisma = { webhookConfig: { count: jest.fn() } };
jest.mock("@/lib/db", () => ({ prisma: mockPrisma }));

import {
  anfrageNichtZugestelltMeldung,
  erinnerungNichtZugestelltMeldung,
  statusNichtZugestellt,
  versandBewerten,
} from "@/lib/contract-end-versand";

const EVENT = "contract-end-supervisor-link";

describe("versandBewerten", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.webhookConfig.count.mockResolvedValue(0);
  });

  it("SENT ist zugestellt — ohne Webhook-Abfrage", async () => {
    const v = await versandBewerten(EVENT, { status: "SENT", recipient: "a@example.org" });
    expect(v).toMatchObject({ status: "SENT", erfolgreich: true });
    expect(mockPrisma.webhookConfig.count).not.toHaveBeenCalled();
  });

  it("FAILED und fehlendes Ergebnis sind nicht zugestellt", async () => {
    expect(await versandBewerten(EVENT, { status: "FAILED", detail: "x" })).toMatchObject({
      status: "FAILED",
      erfolgreich: false,
    });
    expect(await versandBewerten(EVENT, null)).toMatchObject({ status: "FAILED", erfolgreich: false });
  });

  it("deaktivierte Vorlage: mit aktivem Webhook WEBHOOK (zugestellt), sonst SKIPPED", async () => {
    const skip = { status: "SKIPPED" as const, detail: "E-Mail-Vorlage ist deaktiviert" };
    expect(await versandBewerten(EVENT, skip)).toMatchObject({ status: "SKIPPED", erfolgreich: false });

    mockPrisma.webhookConfig.count.mockResolvedValue(2);
    expect(await versandBewerten(EVENT, skip)).toMatchObject({ status: "WEBHOOK", erfolgreich: true });
    expect(mockPrisma.webhookConfig.count).toHaveBeenLastCalledWith({ where: { event: EVENT, isActive: true } });
  });

  it("andere Gründe für SKIPPED fragen keinen Webhook ab und zählen nie", async () => {
    mockPrisma.webhookConfig.count.mockResolvedValue(5);
    const v = await versandBewerten(EVENT, { status: "SKIPPED", detail: "Keine E-Mail-Vorlage vorhanden" });
    expect(v).toMatchObject({ status: "SKIPPED", erfolgreich: false });
    expect(mockPrisma.webhookConfig.count).not.toHaveBeenCalled();
  });

  it("eine kaputte Webhook-Abfrage gilt als „kein Webhook“", async () => {
    mockPrisma.webhookConfig.count.mockRejectedValue(new Error("DB weg"));
    const v = await versandBewerten(EVENT, { status: "SKIPPED", detail: "E-Mail-Vorlage ist deaktiviert" });
    expect(v.erfolgreich).toBe(false);
  });
});

describe("Meldungen und Statuscodes", () => {
  const failed = { status: "FAILED" as const, erfolgreich: false, detail: "Timeout.", zugestelltAn: null };
  const skipped = {
    status: "SKIPPED" as const,
    erfolgreich: false,
    detail: "Vorlage deaktiviert (Einstellungen → E-Mail-Vorlagen)",
    zugestelltAn: null,
  };

  it("502 nur beim Mailserver, sonst 409", () => {
    expect(statusNichtZugestellt(failed)).toBe(502);
    expect(statusNichtZugestellt(skipped)).toBe(409);
  });

  it("Anfrage: Grund ohne doppelten Punkt, „nicht gesendet“, früherer Link nur wenn es einen gab", () => {
    expect(anfrageNichtZugestelltMeldung(failed, false)).toBe(
      "Die Anfrage an die Führungskraft konnte nicht versendet werden: Timeout. Die Anfrage gilt als nicht gesendet. Bitte senden Sie die Anfrage später erneut.",
    );
    expect(anfrageNichtZugestelltMeldung(skipped, true)).toBe(
      "Die Anfrage an die Führungskraft wurde nicht versendet: Vorlage deaktiviert (Einstellungen → E-Mail-Vorlagen). Die Anfrage gilt als nicht gesendet. Der zuvor versendete Link gilt nicht mehr. Bitte prüfen Sie die E-Mail-Vorlage und senden Sie die Anfrage dann erneut.",
    );
  });

  it("Erinnerung: sagt, dass nichts gezählt wurde", () => {
    expect(erinnerungNichtZugestelltMeldung(failed)).toBe(
      "Die Erinnerung konnte nicht versendet werden: Timeout. Sie wurde nicht gezählt – bitte später erneut versuchen.",
    );
    expect(erinnerungNichtZugestelltMeldung(skipped)).toBe(
      "Die Erinnerung wurde nicht versendet: Vorlage deaktiviert (Einstellungen → E-Mail-Vorlagen). Sie wurde nicht gezählt.",
    );
  });

  it("ohne Detail ein allgemeiner Grund statt einer Lücke", () => {
    expect(erinnerungNichtZugestelltMeldung({ ...failed, detail: null })).toContain(": Versand fehlgeschlagen.");
  });
});
