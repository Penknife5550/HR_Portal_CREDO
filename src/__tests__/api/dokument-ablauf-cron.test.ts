/**
 * Tests: POST /api/cron/dokument-ablauf — Fristerinnerung fuer befristete
 * Nachweise (Aufenthaltstitel, Arbeitserlaubnis).
 *
 * Geprueft wird das, was in einer Erinnerungsschleife teuer ist:
 * - Absicherung (CRON_SECRET),
 * - dass NICHT jeden Tag dieselbe Mail hinausgeht,
 * - dass ein Cron-AUSFALL die faellige Erinnerung nicht verschluckt,
 * - dass der Merker nur nach einem echten SENT gesetzt wird,
 * - dass ein nachgereichter Nachweis die Mahnung beendet,
 * - und dass die interne Warnung nicht bei der betroffenen Person landet.
 *
 * **Die Uhr steht.** Die Route rechnet in Kalendertagen ab "heute in Berlin";
 * ohne feste Systemzeit waeren die Stufengrenzen an manchen Tagen knapp
 * daneben.
 */

const mockPrisma = {
  document: { findMany: jest.fn(), groupBy: jest.fn(), update: jest.fn() },
  auditLog: { create: jest.fn() },
  $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
};
const mockTriggerWebhooks = jest.fn();

jest.mock("@/lib/db", () => ({ prisma: mockPrisma }));
jest.mock("@/lib/webhooks", () => ({ triggerWebhooks: mockTriggerWebhooks }));
jest.mock("@/lib/url", () => ({ getBaseUrl: () => "http://localhost:3000" }));

import { POST } from "@/app/api/cron/dokument-ablauf/route";
import { NextRequest } from "next/server";
import { EVENT_CATALOG } from "@/lib/events";
import { kalendertagAlsDatum } from "@/lib/dokument-fristen";
import { tageSpaeter } from "@/lib/minijob-fristen";

const SECRET = "test-cron-secret-mindestens-24-zeichen";
const MS_PER_DAY = 86400000;

/** 08.09.2026, 09:00 UTC — in Berlin derselbe Kalendertag. */
const JETZT = new Date("2026-09-08T09:00:00.000Z");
const HEUTE = "2026-09-08";

/** Ablaufdatum n Tage nach heute (n darf negativ sein), wie es Prisma liefert. */
const ablaufIn = (n: number): Date => kalendertagAlsDatum(tageSpaeter(HEUTE, n));

function req(token: string | null = SECRET): NextRequest {
  return new NextRequest("http://localhost:3000/api/cron/dokument-ablauf", {
    method: "POST",
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

/**
 * Ein Aufenthaltstitel, der in `tage` Tagen ablaeuft, noch nie erinnert.
 * Voreinstellung: 30 Tage -> Stufe WARNUNG (bis 42 Tage).
 */
function dokument(overrides: Record<string, unknown> = {}) {
  return {
    id: "doc1",
    type: "AUFENTHALTSTITEL",
    fileName: "titel-vorderseite.pdf",
    status: "APPROVED",
    gueltigBis: ablaufIn(30),
    ablaufErinnertAm: null,
    ablaufErinnertStufe: null,
    onboardingId: "onb1",
    onboarding: {
      displayId: "2026-GYM-001",
      firstName: "Max",
      lastName: "Mustermann",
      email: "max.mustermann@example.org",
      organization: { name: "Gymnasium" },
    },
    ...overrides,
  };
}

/** Alle document.update-Aufrufe, die den Erinnerungs-Merker schreiben. */
function merkerUpdates() {
  return mockPrisma.document.update.mock.calls.filter(
    (c) => "ablaufErinnertAm" in (c[0]?.data ?? {})
  );
}

/** Alle document.update-Aufrufe, die den Status auf EXPIRED setzen. */
function statusUpdates() {
  return mockPrisma.document.update.mock.calls.filter(
    (c) => c[0]?.data?.status === "EXPIRED"
  );
}

describe("POST /api/cron/dokument-ablauf", () => {
  beforeAll(() => {
    jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate"] });
    jest.setSystemTime(JETZT);
  });
  afterAll(() => {
    jest.useRealTimers();
  });

  beforeEach(() => {
    jest.setSystemTime(JETZT);
    jest.clearAllMocks();
    process.env.CRON_SECRET = SECRET;
    mockPrisma.document.findMany.mockResolvedValue([]);
    // Leer = kein Nachweis ueberholt einen anderen (der Regelfall).
    mockPrisma.document.groupBy.mockResolvedValue([]);
    mockPrisma.document.update.mockResolvedValue({});
    mockPrisma.auditLog.create.mockResolvedValue({});
    mockTriggerWebhooks.mockResolvedValue({ status: "SENT" });
  });

  // ---------------------------------------------------------------
  // Absicherung
  // ---------------------------------------------------------------
  it("401 ohne und mit falschem Secret", async () => {
    expect((await POST(req(null))).status).toBe(401);
    expect((await POST(req("falsch"))).status).toBe(401);
    expect(mockPrisma.document.findMany).not.toHaveBeenCalled();
  });

  it("500 ohne konfiguriertes CRON_SECRET — und liest keine Daten", async () => {
    delete process.env.CRON_SECRET;
    expect((await POST(req())).status).toBe(500);
    expect(mockPrisma.document.findMany).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------
  // Auswahl der Kandidaten
  // ---------------------------------------------------------------
  it("fragt nur fristpflichtige Typen bis zum 90-Tage-Horizont ab", async () => {
    await POST(req());

    const where = mockPrisma.document.findMany.mock.calls[0][0].where;
    expect(where.type).toEqual({ in: ["AUFENTHALTSTITEL", "ARBEITSERLAUBNIS"] });
    // Der Horizont ist der 90. Tag ab heute — alles Spaetere waere AUSSERHALB.
    expect(where.gueltigBis.lte).toEqual(kalendertagAlsDatum(tageSpaeter(HEUTE, 90)));
    expect(where.gueltigBis.not).toBeNull();
    // Ein abgelehnter Scan belegt nichts und darf nicht mahnen.
    expect(where.status).toEqual({ not: "REJECTED" });
  });

  it("filtert NICHT nach Vorgangsstatus — ein Titel laeuft nach dem Onboarding ab", async () => {
    await POST(req());

    const where = mockPrisma.document.findMany.mock.calls[0][0].where;
    expect(where).not.toHaveProperty("onboarding");
    expect(JSON.stringify(where)).not.toContain("COMPLETED");
  });

  // ---------------------------------------------------------------
  // Staffelung: Stufenwechsel und Intervall
  // ---------------------------------------------------------------
  it("erinnert einen noch nie gemahnten Nachweis und setzt Merker + Protokoll", async () => {
    mockPrisma.document.findMany.mockResolvedValue([dokument()]);

    const res = await POST(req());
    expect(res.status).toBe(200);
    expect((await res.json()).erinnerungen).toBe(1);

    expect(mockTriggerWebhooks).toHaveBeenCalledWith(
      "dokument-ablauf-warnung",
      expect.objectContaining({
        mitarbeiter_name: "Max Mustermann",
        dokument_typ: "Aufenthaltstitel",
        gueltig_bis: "08.10.2026",
        tage_verbleibend: 30,
        dringlichkeit: "Warnung",
      })
    );
    expect(merkerUpdates()[0][0]).toEqual({
      where: { id: "doc1" },
      data: { ablaufErinnertAm: JETZT, ablaufErinnertStufe: "WARNUNG" },
    });
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          onboardingId: "onb1",
          action: "DOKUMENT_ABLAUF_ERINNERT",
        }),
      })
    );
    // Merker und Protokoll gehoeren zusammen — beides oder nichts.
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it("schweigt am naechsten Tag: gleiche Stufe, Intervall noch nicht um", async () => {
    // WARNUNG erinnert alle 14 Tage; die letzte Mail ist einen Tag her.
    mockPrisma.document.findMany.mockResolvedValue([
      dokument({
        ablaufErinnertAm: new Date(JETZT.getTime() - 1 * MS_PER_DAY),
        ablaufErinnertStufe: "WARNUNG",
      }),
    ]);

    const res = await POST(req());
    expect((await res.json()).erinnerungen).toBe(0);
    expect(mockTriggerWebhooks).not.toHaveBeenCalled();
  });

  it("erinnert wieder, sobald das Intervall der Stufe abgelaufen ist", async () => {
    mockPrisma.document.findMany.mockResolvedValue([
      dokument({
        ablaufErinnertAm: new Date(JETZT.getTime() - 14 * MS_PER_DAY),
        ablaufErinnertStufe: "WARNUNG",
      }),
    ]);

    expect((await (await POST(req())).json()).erinnerungen).toBe(1);
  });

  it("erinnert beim Stufenwechsel sofort, ohne das alte Intervall abzuwarten", async () => {
    // Zuletzt in BEOBACHTEN gemahnt (Intervall 30 Tage), jetzt KRITISCH.
    // Ohne die Stufenpruefung bliebe es bis zu 30 Tage still — genau in der
    // Zeit, in der es eilig wird.
    mockPrisma.document.findMany.mockResolvedValue([
      dokument({
        gueltigBis: ablaufIn(10),
        ablaufErinnertAm: new Date(JETZT.getTime() - 1 * MS_PER_DAY),
        ablaufErinnertStufe: "BEOBACHTEN",
      }),
    ]);

    expect((await (await POST(req())).json()).erinnerungen).toBe(1);
    expect(mockTriggerWebhooks).toHaveBeenCalledWith(
      "dokument-ablauf-warnung",
      expect.objectContaining({ dringlichkeit: "Kritisch", tage_verbleibend: 10 })
    );
    expect(merkerUpdates()[0][0].data.ablaufErinnertStufe).toBe("KRITISCH");
  });

  it("verschluckt nichts, wenn der Cron zwei Tage ausfaellt", async () => {
    // Der Merker haelt die zuletzt VERSENDETE Stufe, nicht die von gestern:
    // Der Sprung ueber die ausgefallenen Tage hinweg wird trotzdem erkannt,
    // und das Intervall ist "mindestens so lange her", nicht "genau".
    mockPrisma.document.findMany.mockResolvedValue([
      dokument({
        gueltigBis: ablaufIn(12),
        ablaufErinnertAm: new Date(JETZT.getTime() - 2 * MS_PER_DAY),
        ablaufErinnertStufe: "WARNUNG",
      }),
    ]);

    expect((await (await POST(req())).json()).erinnerungen).toBe(1);
    expect(mockTriggerWebhooks).toHaveBeenCalledWith(
      "dokument-ablauf-warnung",
      expect.objectContaining({ dringlichkeit: "Kritisch" })
    );
  });

  it("erinnert am Ablauftag selbst noch als KRITISCH, nicht als abgelaufen", async () => {
    // Der Ablauftag gilt noch — an ihm darf gearbeitet werden.
    mockPrisma.document.findMany.mockResolvedValue([dokument({ gueltigBis: ablaufIn(0) })]);

    await POST(req());
    expect(mockTriggerWebhooks).toHaveBeenCalledWith(
      "dokument-ablauf-warnung",
      expect.objectContaining({ tage_verbleibend: 0, tage_ueberfaellig: 0 })
    );
    expect(statusUpdates()).toHaveLength(0);
  });

  // ---------------------------------------------------------------
  // Abgelaufen
  // ---------------------------------------------------------------
  it("meldet den Ablauf als eigenes Ereignis und setzt den Status auf EXPIRED", async () => {
    mockPrisma.document.findMany.mockResolvedValue([
      dokument({ gueltigBis: ablaufIn(-7), ablaufErinnertStufe: "KRITISCH" }),
    ]);

    const json = await (await POST(req())).json();
    expect(json.erinnerungen).toBe(1);
    expect(json.abgelaufenMarkiert).toBe(1);

    expect(mockTriggerWebhooks).toHaveBeenCalledWith(
      "dokument-abgelaufen",
      expect.objectContaining({ tage_ueberfaellig: 7, tage_verbleibend: -7 })
    );
    expect(statusUpdates()[0][0]).toEqual({
      where: { id: "doc1" },
      data: { status: "EXPIRED" },
    });
  });

  it("setzt EXPIRED nicht erneut, wenn es schon steht", async () => {
    mockPrisma.document.findMany.mockResolvedValue([
      dokument({ gueltigBis: ablaufIn(-7), status: "EXPIRED", ablaufErinnertStufe: "ABGELAUFEN" }),
    ]);

    const json = await (await POST(req())).json();
    expect(json.abgelaufenMarkiert).toBe(0);
    expect(statusUpdates()).toHaveLength(0);
  });

  it("markiert den Ablauf auch dann, wenn keine Mail mehr faellig ist", async () => {
    // Der Ablauf ist eine Tatsache des Datums, kein Ergebnis der Zustellung.
    mockPrisma.document.findMany.mockResolvedValue([
      dokument({
        gueltigBis: ablaufIn(-4),
        ablaufErinnertAm: new Date(JETZT.getTime() - 1 * MS_PER_DAY),
        ablaufErinnertStufe: "ABGELAUFEN",
      }),
    ]);

    const json = await (await POST(req())).json();
    expect(json.erinnerungen).toBe(0);
    expect(json.abgelaufenMarkiert).toBe(1);
  });

  it("hoert 180 Tage nach dem Ablauf auf zu mahnen, markiert aber weiter", async () => {
    mockPrisma.document.findMany.mockResolvedValue([
      dokument({ gueltigBis: ablaufIn(-181), status: "APPROVED" }),
    ]);

    const json = await (await POST(req())).json();
    expect(json.erinnerungen).toBe(0);
    expect(mockTriggerWebhooks).not.toHaveBeenCalled();
    expect(json.abgelaufenMarkiert).toBe(1);
  });

  it("mahnt bis einschliesslich Tag 180", async () => {
    mockPrisma.document.findMany.mockResolvedValue([dokument({ gueltigBis: ablaufIn(-180) })]);
    expect((await (await POST(req())).json()).erinnerungen).toBe(1);
  });

  // ---------------------------------------------------------------
  // Merker nur nach echtem SENT
  // ---------------------------------------------------------------
  it("setzt den Merker NICHT, wenn kein Empfaenger konfiguriert ist (SKIPPED)", async () => {
    // Sonst waere die Erinnerung verbrannt: Der naechste Lauf haelt sie fuer
    // erledigt, obwohl nie jemand eine Mail bekommen hat.
    mockTriggerWebhooks.mockResolvedValue({ status: "SKIPPED", detail: "Kein Empfaenger" });
    mockPrisma.document.findMany.mockResolvedValue([dokument()]);

    const json = await (await POST(req())).json();
    expect(json.erinnerungen).toBe(0);
    expect(merkerUpdates()).toHaveLength(0);
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("setzt den Merker NICHT bei FAILED", async () => {
    mockTriggerWebhooks.mockResolvedValue({ status: "FAILED", detail: "SMTP weg" });
    mockPrisma.document.findMany.mockResolvedValue([dokument()]);

    expect((await (await POST(req())).json()).erinnerungen).toBe(0);
    expect(merkerUpdates()).toHaveLength(0);
  });

  // ---------------------------------------------------------------
  // Ueberholte und doppelte Nachweise
  // ---------------------------------------------------------------
  it("schweigt, sobald ein Nachweis desselben Typs mit spaeterer Frist vorliegt", async () => {
    // Ohne diese Regel mahnt der Cron den alten Titel weiter, obwohl der neue
    // laengst im Portal liegt — eine Warnung, die niemand abstellen kann.
    mockPrisma.document.groupBy.mockResolvedValue([
      { onboardingId: "onb1", type: "AUFENTHALTSTITEL", _max: { gueltigBis: ablaufIn(900) } },
    ]);
    mockPrisma.document.findMany.mockResolvedValue([dokument({ gueltigBis: ablaufIn(-3) })]);

    const json = await (await POST(req())).json();
    expect(json.erinnerungen).toBe(0);
    expect(mockTriggerWebhooks).not.toHaveBeenCalled();
    // Der alte Nachweis ist trotzdem abgelaufen und wird so gefuehrt.
    expect(json.abgelaufenMarkiert).toBe(1);
  });

  it("mahnt weiter, wenn der nachgereichte Nachweis ein anderer Typ ist", async () => {
    mockPrisma.document.groupBy.mockResolvedValue([
      { onboardingId: "onb1", type: "ARBEITSERLAUBNIS", _max: { gueltigBis: ablaufIn(900) } },
    ]);
    mockPrisma.document.findMany.mockResolvedValue([dokument()]);

    expect((await (await POST(req())).json()).erinnerungen).toBe(1);
  });

  it("schickt bei zwei gleich datierten Zeilen desselben Typs nur EINE Mail", async () => {
    const gleich = ablaufIn(20);
    mockPrisma.document.groupBy.mockResolvedValue([
      { onboardingId: "onb1", type: "AUFENTHALTSTITEL", _max: { gueltigBis: gleich } },
    ]);
    mockPrisma.document.findMany.mockResolvedValue([
      dokument({ id: "docA", gueltigBis: gleich }),
      dokument({ id: "docB", gueltigBis: gleich }),
    ]);

    const json = await (await POST(req())).json();
    expect(json.erinnerungen).toBe(1);
    expect(mockTriggerWebhooks).toHaveBeenCalledTimes(1);
  });

  it("schweigt am Folgetag auch mit der ZWEITEN Zeile desselben Doppel-Uploads", async () => {
    // Der Lauf davor hat docA gemahnt und dessen Merker gesetzt; docB blieb als
    // uebersprungene Zeile ohne Merker zurueck. Heute ist docA nicht faellig
    // (gleiche Stufe, Intervall 14 Tage noch nicht um). Belegte docA den
    // Schluessel erst mit dem Mailversand, liefe docB jetzt in seinen EIGENEN
    // Stufenwechsel (null !== "WARNUNG") — und ab da kaeme jede Mahnung doppelt,
    // um einen Tag versetzt, an das HR-Postfach. Genau der Weg, den die Maske
    // anbietet: Vorder- und Rueckseite des Aufenthaltstitels, beide Male
    // dasselbe Ablaufdatum nachgetragen.
    const gleich = ablaufIn(20);
    mockPrisma.document.groupBy.mockResolvedValue([
      { onboardingId: "onb1", type: "AUFENTHALTSTITEL", _max: { gueltigBis: gleich } },
    ]);
    mockPrisma.document.findMany.mockResolvedValue([
      dokument({
        id: "docA",
        gueltigBis: gleich,
        ablaufErinnertAm: new Date(JETZT.getTime() - 1 * MS_PER_DAY),
        ablaufErinnertStufe: "WARNUNG",
      }),
      dokument({ id: "docB", gueltigBis: gleich }),
    ]);

    const json = await (await POST(req())).json();
    expect(json.erinnerungen).toBe(0);
    expect(mockTriggerWebhooks).not.toHaveBeenCalled();
    // Und der Merker der schweigenden Zeile bleibt unberuehrt: Sie ist nicht
    // "erledigt", sie ist unzustaendig.
    expect(merkerUpdates()).toHaveLength(0);
  });

  it("laesst die zustaendige Zeile weiter mahnen, wenn ihr Intervall um ist", async () => {
    // Gegenprobe zum Test darueber: Die Sperre darf die Mahnung nur
    // VERDOPPELN verhindern, nicht sie abstellen.
    const gleich = ablaufIn(20);
    mockPrisma.document.groupBy.mockResolvedValue([
      { onboardingId: "onb1", type: "AUFENTHALTSTITEL", _max: { gueltigBis: gleich } },
    ]);
    mockPrisma.document.findMany.mockResolvedValue([
      dokument({
        id: "docA",
        gueltigBis: gleich,
        ablaufErinnertAm: new Date(JETZT.getTime() - 14 * MS_PER_DAY),
        ablaufErinnertStufe: "WARNUNG",
      }),
      dokument({ id: "docB", gueltigBis: gleich }),
    ]);

    const json = await (await POST(req())).json();
    expect(json.erinnerungen).toBe(1);
    expect(mockTriggerWebhooks).toHaveBeenCalledTimes(1);
    expect(merkerUpdates()[0][0].where).toEqual({ id: "docA" });
  });

  // ---------------------------------------------------------------
  // Robustheit
  // ---------------------------------------------------------------
  it("laeuft nach einem Fehler bei einem Dokument weiter", async () => {
    mockPrisma.document.findMany.mockResolvedValue([
      dokument({ id: "kaputt", onboardingId: "onbA" }),
      dokument({ id: "heil", onboardingId: "onbB" }),
    ]);
    mockTriggerWebhooks
      .mockRejectedValueOnce(new Error("Boom"))
      .mockResolvedValue({ status: "SENT" });

    const json = await (await POST(req())).json();
    expect(json.fehler).toBe(1);
    expect(json.erinnerungen).toBe(1);
  });

  it("ueberspringt ein unlesbares Ablaufdatum, statt den Lauf abzubrechen", async () => {
    mockPrisma.document.findMany.mockResolvedValue([
      dokument({ id: "krumm", gueltigBis: new Date("kein datum") }),
      dokument({ id: "heil", onboardingId: "onbB" }),
    ]);

    const json = await (await POST(req())).json();
    expect(json.fehler).toBe(0);
    expect(json.erinnerungen).toBe(1);
  });

  // ---------------------------------------------------------------
  // Empfaenger: NUR das HR-Postfach
  // ---------------------------------------------------------------
  it("stellt die Adresse der Person NICHT als {{email}} bereit", async () => {
    // Der Mailer loest {{email}} als Empfaenger auf. Traegt jemand {{email}}
    // in das An-Feld ein, soll daraus keine Adresse werden (SKIPPED) — statt
    // einer internen Warnung an die betroffene Person selbst.
    mockPrisma.document.findMany.mockResolvedValue([dokument()]);
    await POST(req());

    const payload = mockTriggerWebhooks.mock.calls[0][1];
    expect(payload).not.toHaveProperty("email");
    expect(payload).not.toHaveProperty("employeeEmail");
    expect(payload.mitarbeiter_email).toBe("max.mustermann@example.org");
  });

  it("nutzt NICHT die Variable {{ablaufdatum}} — sie wuerde leer gerendert", async () => {
    // extractVariables setzt `ablaufdatum` aus tokenExpiresAt/expiresAt und
    // ueberschreibt damit ein gleichnamiges Payload-Feld mit "".
    mockPrisma.document.findMany.mockResolvedValue([dokument()]);
    await POST(req());

    expect(mockTriggerWebhooks.mock.calls[0][1]).not.toHaveProperty("ablaufdatum");
  });

  it("beide Events stehen im Katalog und gehen ausschliesslich an HR", async () => {
    for (const name of ["dokument-ablauf-warnung", "dokument-abgelaufen"]) {
      const def = EVENT_CATALOG.find((e) => e.event === name);
      expect({ name, gefunden: Boolean(def) }).toEqual({ name, gefunden: true });
      // Leerer Default = kein natuerlicher Empfaenger im Payload; die Adresse
      // muss in der Vorlage stehen. Ein {{...}} hier ginge an die Person.
      expect({ name, to: def!.defaultRecipients.to }).toEqual({ name, to: "" });
      expect({ name, wired: def!.wired }).toEqual({ name, wired: true });
    }
  });
});
