/**
 * Zeitplaner — Ausfuehrung: Anspruch in der Datenbank, Protokoll, Bericht,
 * Freigabe der Sperre, Takt und Einstellungen (Prisma nachgebildet).
 */

const mockPrisma = {
  automatischerLauf: {
    createMany: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    updateMany: jest.fn(),
    update: jest.fn(),
  },
  automatischerLaufProtokoll: {
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    count: jest.fn(),
    findMany: jest.fn(),
    groupBy: jest.fn(),
  },
  smtpConfig: { findUnique: jest.fn() },
  auditLog: { create: jest.fn() },
  $transaction: jest.fn(),
};
const mockTriggerWebhooks = jest.fn();
const mockLauf = jest.fn();

jest.mock("@/lib/db", () => ({ prisma: mockPrisma }));
jest.mock("@/lib/webhooks", () => ({ triggerWebhooks: mockTriggerWebhooks }));
jest.mock("@/lib/url", () => ({ getBaseUrl: () => "https://hr.example.org" }));
// Die Lauf-Funktionen selbst sind in ihren eigenen Tests geprueft.
jest.mock("@/lib/laeufe/onboarding-erinnerungen", () => ({ onboardingErinnerungenLauf: mockLauf }));
jest.mock("@/lib/laeufe/offboarding-erinnerungen", () => ({ offboardingErinnerungenLauf: mockLauf }));
jest.mock("@/lib/laeufe/dokument-ablauf", () => ({ dokumentAblaufLauf: mockLauf }));
jest.mock("@/lib/laeufe/verbeamtung-fristen", () => ({ verbeamtungFristenLauf: mockLauf }));
jest.mock("@/lib/laeufe/vertragsende-erinnerungen", () => ({ vertragsendeErinnerungenLauf: mockLauf }));
jest.mock("@/lib/laeufe/elternzeit-fristen", () => ({ elternzeitFristenLauf: mockLauf }));
jest.mock("@/lib/laeufe/bem-fristen", () => ({ bemFristenLauf: mockLauf }));
jest.mock("@/lib/laeufe/bem-aufbewahrung", () => ({ bemAufbewahrungLauf: mockLauf }));
jest.mock("@/lib/laeufe/dokumente-aufbewahrung", () => ({ dokumenteAufbewahrungLauf: mockLauf }));
jest.mock("@/lib/laeufe/wartung", () => ({ wartungLauf: mockLauf }));
jest.mock("@/lib/unterlagen-lauf", () => ({ unterlagenFristenLauf: mockLauf }));

import { laufBeanspruchen, laufDurchfuehren, laufUeberRoute } from "@/lib/zeitplaner/ausfuehren";
import { einstellungAendern, handStarten, taktAusfuehren, uebersichtLaden } from "@/lib/zeitplaner/dienst";
import { LAEUFE } from "@/lib/zeitplaner/katalog";

const MI_0800 = new Date("2026-09-30T06:00:00Z");
const MI_1500 = new Date("2026-09-30T13:00:00Z");

function einstellung(teil: Record<string, unknown> = {}) {
  return {
    schluessel: "dokument-ablauf",
    aktiv: true,
    uhrzeit: "07:30",
    nurWerktags: false,
    probelauf: false,
    berichtBeiErfolg: false,
    tagErledigt: "2026-09-29",
    laeuftSeit: null,
    geaendertAm: MI_0800,
    geaendertVonId: null,
    ...teil,
  };
}

/** Alle Zeilen vorhanden (so legt einstellungenLaden nichts an); `teil` ueberschreibt einzelne Laeufe. */
function alleEinstellungen(teil: Record<string, Record<string, unknown>> = {}) {
  return LAEUFE.map((l) => einstellung({ schluessel: l.schluessel, aktiv: false, ...(teil[l.schluessel] ?? {}) }));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.automatischerLauf.createMany.mockResolvedValue({ count: 0 });
  mockPrisma.automatischerLauf.findUnique.mockResolvedValue(einstellung());
  mockPrisma.automatischerLauf.findMany.mockResolvedValue(alleEinstellungen());
  mockPrisma.automatischerLaufProtokoll.updateMany.mockResolvedValue({ count: 0 });
  mockPrisma.automatischerLaufProtokoll.findMany.mockResolvedValue([]);
  mockPrisma.automatischerLaufProtokoll.groupBy.mockResolvedValue([]);
  mockPrisma.automatischerLauf.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.automatischerLaufProtokoll.create.mockResolvedValue({ id: "prot-1" });
  mockPrisma.automatischerLaufProtokoll.update.mockResolvedValue({});
  mockPrisma.automatischerLaufProtokoll.count.mockResolvedValue(0);
  mockPrisma.smtpConfig.findUnique.mockResolvedValue({ replyToEmail: "hr@example.org" });
  mockPrisma.auditLog.create.mockResolvedValue({});
  mockPrisma.$transaction.mockResolvedValue([]);
  mockTriggerWebhooks.mockResolvedValue({ status: "SENT" });
  mockLauf.mockResolvedValue({
    status: 200,
    body: { geprueft: 3, erinnerungen: 1, abgelaufenMarkiert: 0, fehler: 0, nichtZugestellt: 0, mailUebersprungen: 0 },
  });
});

describe("laufBeanspruchen", () => {
  it("legt fehlende Zeilen immer ausgeschaltet an — nur wenn eine fehlt", async () => {
    await laufBeanspruchen("dokument-ablauf", { ausloeser: "HAND", jetzt: MI_0800 });
    expect(mockPrisma.automatischerLauf.createMany).not.toHaveBeenCalled();
    mockPrisma.automatischerLauf.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(einstellung());
    await laufBeanspruchen("dokument-ablauf", { ausloeser: "HAND", jetzt: MI_0800 });
    const { data, skipDuplicates } = mockPrisma.automatischerLauf.createMany.mock.calls[0][0];
    expect(skipDuplicates).toBe(true);
    expect(data.every((d: { aktiv: boolean }) => d.aktiv === false)).toBe(true);
  });

  it("Zeitplan: nur aktiv, frei und heute noch offen — setzt Sperre und Tagesmerker", async () => {
    const anspruch = await laufBeanspruchen("dokument-ablauf", { ausloeser: "ZEITPLAN", jetzt: MI_0800 });
    expect(anspruch?.protokollId).toBe("prot-1");
    const { where, data } = mockPrisma.automatischerLauf.updateMany.mock.calls[0][0];
    expect(where.aktiv).toBe(true);
    expect(JSON.stringify(where.AND)).toContain('"tagErledigt":{"lt":"2026-09-30"}');
    expect(JSON.stringify(where.AND)).toContain('"laeuftSeit":null');
    expect(data).toEqual({ laeuftSeit: MI_0800, tagErledigt: "2026-09-30" });
  });

  it("von Hand: ohne Tagesbedingung; ein Probelauf setzt den Tagesmerker nicht", async () => {
    mockPrisma.automatischerLauf.findUnique.mockResolvedValue(einstellung({ schluessel: "unterlagen-fristen" }));
    await laufBeanspruchen("unterlagen-fristen", { ausloeser: "HAND", probelauf: true, jetzt: MI_0800 });
    const { where, data } = mockPrisma.automatischerLauf.updateMany.mock.calls[0][0];
    expect(where.aktiv).toBeUndefined();
    expect(JSON.stringify(where)).not.toContain("tagErledigt");
    expect(data).toEqual({ laeuftSeit: MI_0800 });
    expect(mockPrisma.automatischerLaufProtokoll.create.mock.calls[0][0].data.probelauf).toBe(true);
  });

  it("ein Lauf ohne Probelauf-Faehigkeit laeuft trotz Wunsch scharf", async () => {
    const anspruch = await laufBeanspruchen("dokument-ablauf", { ausloeser: "HAND", probelauf: true, jetzt: MI_0800 });
    expect(anspruch?.probelauf).toBe(false);
  });

  it("Zeitplan mit Probelauf-Einstellung laeuft als Probelauf — und erledigt trotzdem den Tag", async () => {
    // Sonst startete jeder Takt den Probelauf neu (jede Minute Lauf + Berichtsmail).
    mockPrisma.automatischerLauf.findUnique.mockResolvedValue(einstellung({ schluessel: "wartung", probelauf: true }));
    const anspruch = await laufBeanspruchen("wartung", { ausloeser: "ZEITPLAN", jetzt: MI_0800 });
    expect(anspruch?.probelauf).toBe(true);
    expect(mockPrisma.automatischerLauf.updateMany.mock.calls[0][0].data).toEqual({
      laeuftSeit: MI_0800,
      tagErledigt: "2026-09-30",
    });
  });

  it("schliesst Protokollzeilen eines abgebrochenen Laufs", async () => {
    await laufBeanspruchen("dokument-ablauf", { ausloeser: "ZEITPLAN", jetzt: MI_0800 });
    expect(mockPrisma.automatischerLaufProtokoll.updateMany).toHaveBeenCalledWith({
      where: { schluessel: "dokument-ablauf", ergebnis: "LAEUFT", gestartetAm: { lt: MI_0800 } },
      data: { ergebnis: "FEHLER", beendetAm: MI_0800, fehler: "ABGEBROCHEN" },
    });
  });

  it("belegt → null, kein Protokoll", async () => {
    mockPrisma.automatischerLauf.updateMany.mockResolvedValue({ count: 0 });
    expect(await laufBeanspruchen("dokument-ablauf", { ausloeser: "HAND", jetzt: MI_0800 })).toBeNull();
    expect(mockPrisma.automatischerLaufProtokoll.create).not.toHaveBeenCalled();
  });
});

describe("laufDurchfuehren", () => {
  const anspruch = {
    schluessel: "dokument-ablauf" as const,
    ausloeser: "ZEITPLAN" as const,
    probelauf: false,
    seit: MI_0800,
    protokollId: "prot-1",
    berichtBeiErfolg: false,
    benutzerId: null,
  };

  it("ohne Befund: kein Bericht, Protokoll OK, Sperre bedingt freigegeben", async () => {
    await laufDurchfuehren(anspruch);
    expect(mockLauf).toHaveBeenCalledWith({ jetzt: MI_0800, dryRun: false });
    expect(mockTriggerWebhooks).not.toHaveBeenCalled();
    const { data } = mockPrisma.automatischerLaufProtokoll.update.mock.calls[0][0];
    expect(data.ergebnis).toBe("OK");
    expect(data.berichtMail).toBeNull();
    expect(data.zaehler[0]).toEqual(["Nachweise geprüft", 3, false]);
    expect(mockPrisma.automatischerLauf.updateMany).toHaveBeenLastCalledWith({
      where: { schluessel: "dokument-ablauf", laeuftSeit: MI_0800 },
      data: { laeuftSeit: null },
    });
  });

  it("mit Problemen: Bericht an das HR-Postfach, Ergebnis im Protokoll", async () => {
    mockLauf.mockResolvedValue({ status: 200, body: { geprueft: 1, erinnerungen: 0, fehler: 0, nichtZugestellt: 1, mailUebersprungen: 0 } });
    await laufDurchfuehren(anspruch);
    const [event, payload] = mockTriggerWebhooks.mock.calls[0];
    expect(event).toBe("automatischer-lauf-bericht");
    expect(payload.hr_postfach).toBe("hr@example.org");
    expect(payload.hat_probleme).toBe("ja");
    expect(payload.datum).toBe("30.09.2026");
    expect(payload.uhrzeit).toBe("08:00");
    expect(payload.portalLink).toBe("https://hr.example.org/einstellungen?tab=laeufe&lauf=dokument-ablauf");
    const { data } = mockPrisma.automatischerLaufProtokoll.update.mock.calls[0][0];
    expect(data.ergebnis).toBe("PROBLEME");
    expect(data.berichtMail).toBe("SENT");
  });

  it("Lauf wirft: FEHLER mit Kennung, Bericht, Sperre trotzdem frei", async () => {
    mockLauf.mockRejectedValue(Object.assign(new Error("geheim: max@example.org"), { code: "P1001" }));
    const ergebnis = await laufDurchfuehren(anspruch);
    expect(ergebnis.status).toBe(500);
    const { data } = mockPrisma.automatischerLaufProtokoll.update.mock.calls[0][0];
    expect(data.ergebnis).toBe("FEHLER");
    expect(data.fehler).toBe("P1001"); // nie der Rohtext
    expect(mockTriggerWebhooks.mock.calls[0][1].ist_fehler).toBe("ja");
    expect(mockPrisma.automatischerLauf.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: { laeuftSeit: null } }),
    );
  });

  it("Bericht auch bei Erfolg, wenn eingestellt und etwas versendet wurde", async () => {
    await laufDurchfuehren({ ...anspruch, berichtBeiErfolg: true });
    expect(mockTriggerWebhooks).toHaveBeenCalledTimes(1);
  });
});

describe("laufUeberRoute", () => {
  it("gibt die Antwort der Lauf-Funktion 1:1 zurueck", async () => {
    const funktion = jest.fn().mockResolvedValue({ status: 200, body: { geprueft: 0 } });
    const ergebnis = await laufUeberRoute("dokument-ablauf", {}, funktion);
    expect(ergebnis).toEqual({ status: 200, body: { geprueft: 0 } });
    expect(funktion).toHaveBeenCalled();
    expect(mockPrisma.automatischerLaufProtokoll.create.mock.calls[0][0].data.ausloeser).toBe("ROUTE");
  });

  it("409, solange der Lauf arbeitet", async () => {
    mockPrisma.automatischerLauf.updateMany.mockResolvedValue({ count: 0 });
    const funktion = jest.fn();
    const ergebnis = await laufUeberRoute("dokument-ablauf", {}, funktion);
    expect(ergebnis.status).toBe(409);
    expect(funktion).not.toHaveBeenCalled();
  });
});

describe("taktAusfuehren", () => {
  it("startet nur faellige, aktive Laeufe — ohne jede Minute Zeilen anzulegen", async () => {
    mockPrisma.automatischerLauf.findMany.mockResolvedValue(
      alleEinstellungen({
        "dokument-ablauf": { aktiv: true, uhrzeit: "07:30" }, // faellig
        reminders: { aktiv: true, uhrzeit: "09:00" }, // spaeter
        "bem-fristen": { aktiv: true, tagErledigt: "2026-09-30" }, // heute erledigt
      }),
    );
    const gestartet = await taktAusfuehren(MI_0800);
    expect(gestartet).toEqual(["dokument-ablauf"]);
    expect(mockPrisma.automatischerLauf.createMany).not.toHaveBeenCalled();
  });
});

describe("einstellungAendern", () => {
  it("unbekannter Lauf = 404", async () => {
    expect((await einstellungAendern("gibt-es-nicht", { aktiv: true }, "u1", MI_0800)).status).toBe(404);
  });

  it("Loeschlauf ohne vorherigen Probelauf scharf einschalten = 409", async () => {
    const antwort = await einstellungAendern("bem-aufbewahrung", { aktiv: true }, "u1", MI_0800);
    expect(antwort.status).toBe(409);
    expect(antwort.body.grund).toBe("PROBELAUF_FEHLT");
  });

  it("… als Probelauf einschalten geht", async () => {
    const antwort = await einstellungAendern("bem-aufbewahrung", { aktiv: true, probelauf: true }, "u1", MI_0800);
    expect(antwort.status).toBe(200);
  });

  it("… „als Probelauf“ an einem eingeschalteten Loeschlauf abwaehlen ohne Probelauf = 409", async () => {
    mockPrisma.automatischerLauf.findMany.mockResolvedValue(
      alleEinstellungen({ "bem-aufbewahrung": { aktiv: true, probelauf: true } }),
    );
    const antwort = await einstellungAendern("bem-aufbewahrung", { probelauf: false }, "u1", MI_0800);
    expect(antwort.status).toBe(409);
    expect(mockPrisma.automatischerLauf.update).not.toHaveBeenCalled();
  });

  it("… nach einem erfolgreichen Probelauf geht scharf", async () => {
    mockPrisma.automatischerLaufProtokoll.count.mockResolvedValue(1);
    const antwort = await einstellungAendern("bem-aufbewahrung", { aktiv: true }, "u1", MI_0800);
    expect(antwort.status).toBe(200);
  });

  it("Probelauf fuer einen Lauf ohne diese Faehigkeit = 400", async () => {
    expect((await einstellungAendern("reminders", { probelauf: true }, "u1", MI_0800)).status).toBe(400);
  });

  it("Einschalten nach der Uhrzeit: erster Lauf morgen, AuditLog im selben Commit", async () => {
    mockPrisma.automatischerLauf.findMany.mockResolvedValue(
      alleEinstellungen({ "dokument-ablauf": { aktiv: false, tagErledigt: null } }),
    );
    const antwort = await einstellungAendern("dokument-ablauf", { aktiv: true }, "u1", MI_1500);
    expect(antwort.body.naechsterLaufText).toBe("morgen 07:30");
    expect(mockPrisma.automatischerLauf.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ aktiv: true, tagErledigt: "2026-09-30" }) }),
    );
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mockPrisma.auditLog.create.mock.calls[0][0].data.action).toBe("ZEITPLANER_GEAENDERT");
  });
});

describe("handStarten", () => {
  it("202 mit Protokoll-ID und AuditLog", async () => {
    const antwort = await handStarten("dokument-ablauf", false, "u1");
    expect(antwort.status).toBe(202);
    expect(antwort.body.protokollId).toBe("prot-1");
    expect(mockPrisma.auditLog.create.mock.calls[0][0].data.action).toBe("ZEITPLANER_HAND_AUSGEFUEHRT");
  });

  it("409, wenn der Lauf gerade arbeitet", async () => {
    mockPrisma.automatischerLauf.updateMany.mockResolvedValue({ count: 0 });
    expect((await handStarten("dokument-ablauf", false, "u1")).status).toBe(409);
  });

  it("Probelauf fuer einen Lauf ohne diese Faehigkeit = 400", async () => {
    expect((await handStarten("reminders", true, "u1")).status).toBe(400);
  });

  it("Loeschlauf scharf „Jetzt ausführen“ ohne Probelauf = 409 (nicht nur im Browser gesperrt)", async () => {
    const antwort = await handStarten("bem-aufbewahrung", false, "u1");
    expect(antwort.status).toBe(409);
    expect(antwort.body.grund).toBe("PROBELAUF_FEHLT");
    expect(mockPrisma.automatischerLauf.updateMany).not.toHaveBeenCalled();
  });

  it("… als Probelauf geht", async () => {
    expect((await handStarten("bem-aufbewahrung", true, "u1")).status).toBe(202);
  });
});

describe("uebersichtLaden", () => {
  it("eine verwaiste Sperre (aelter als 2 h) sperrt die Karte nicht, die Zeile heisst „abgebrochen“", async () => {
    const vorDreiStunden = new Date(MI_0800.getTime() - 3 * 3_600_000);
    mockPrisma.automatischerLauf.findMany.mockResolvedValue(
      alleEinstellungen({ "dokument-ablauf": { laeuftSeit: vorDreiStunden } }),
    );
    mockPrisma.automatischerLaufProtokoll.findMany.mockImplementation(({ where }: { where: { schluessel: string } }) =>
      Promise.resolve(
        where.schluessel === "dokument-ablauf"
          ? [
              {
                id: "p1",
                schluessel: "dokument-ablauf",
                ausloeser: "HAND",
                probelauf: false,
                gestartetAm: vorDreiStunden,
                beendetAm: null,
                ergebnis: "LAEUFT",
                zaehler: null,
                schritte: null,
                fehler: null,
                berichtMail: null,
              },
            ]
          : [],
      ),
    );
    const u = await uebersichtLaden(MI_0800);
    const zeile = u.laeufe.find((l) => l.definition.schluessel === "dokument-ablauf")!;
    expect(zeile.laeuft).toBe(false);
    expect(zeile.protokolle[0].ergebnisText).toBe("abgebrochen");
  });

  it("frische Sperre = läuft; Protokolle je Lauf eigens geladen; probelaufFehlt aus einer Gruppierung", async () => {
    mockPrisma.automatischerLauf.findMany.mockResolvedValue(
      alleEinstellungen({ reminders: { laeuftSeit: new Date(MI_0800.getTime() - 60_000) } }),
    );
    mockPrisma.automatischerLaufProtokoll.groupBy.mockResolvedValue([{ schluessel: "wartung", _count: { _all: 1 } }]);
    const u = await uebersichtLaden(MI_0800);
    expect(u.laeufe.find((l) => l.definition.schluessel === "reminders")!.laeuft).toBe(true);
    expect(mockPrisma.automatischerLaufProtokoll.findMany).toHaveBeenCalledTimes(LAEUFE.length);
    expect(u.laeufe.find((l) => l.definition.schluessel === "wartung")!.probelaufFehlt).toBe(false);
    expect(u.laeufe.find((l) => l.definition.schluessel === "bem-aufbewahrung")!.probelaufFehlt).toBe(true);
    expect(u.laeufe.find((l) => l.definition.schluessel === "reminders")!.probelaufFehlt).toBe(false);
    expect(mockPrisma.automatischerLaufProtokoll.count).not.toHaveBeenCalled();
  });
});
