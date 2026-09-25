/**
 * Tests: POST /api/cron/dokument-ablauf — Fristerinnerung fuer befristete
 * Nachweise (Aufenthaltstitel, Arbeitserlaubnis).
 *
 * Geprueft wird das, was in einer Erinnerungsschleife teuer ist:
 * - Absicherung (CRON_SECRET),
 * - dass NICHT jeden Tag dieselbe Mail hinausgeht,
 * - dass ein Cron-AUSFALL die faellige Erinnerung nicht verschluckt,
 * - dass der Merker bei SENT und SKIPPED gesetzt wird, bei FAILED nicht
 *   (Hausregel des Erinnerungs-Crons),
 * - dass ein nachgereichter Nachweis die Mahnung beendet,
 * - dass die interne Warnung nicht bei der betroffenen Person landet,
 * - und dass die private Adresse nie als Name im Betreff steht.
 *
 * **Die Uhr steht.** Die Route rechnet in Kalendertagen ab "heute in Berlin";
 * ohne feste Systemzeit waeren die Stufengrenzen an manchen Tagen knapp
 * daneben.
 */

const mockPrisma = {
  document: {
    findMany: jest.fn(),
    groupBy: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
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
import { MITARBEITER_NEUTRAL } from "@/lib/onboarding-spuren";
import { renderEventEmail } from "@/lib/mailer";
import { DEFAULT_EMAIL_TEMPLATES } from "@/lib/default-email-templates";
import { documentTypeLabel } from "@/lib/required-documents";

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
      personalData: null as { firstName: string | null; lastName: string | null } | null,
    },
    ...overrides,
  };
}

/**
 * Alle Schreibaufrufe, die den Erinnerungs-Merker setzen. Seit 09/2026 als
 * bedingtes `updateMany` (nur solange `gueltigBis` der gelesene Wert ist) —
 * `update` wird mit abgefragt, damit ein Rueckbau nicht still durchrutscht.
 */
function merkerUpdates() {
  return [
    ...mockPrisma.document.update.mock.calls,
    ...mockPrisma.document.updateMany.mock.calls,
  ].filter((c) => "ablaufErinnertAm" in (c[0]?.data ?? {}));
}

/** Alle Schreibaufrufe, die den Status auf EXPIRED setzen. */
function statusUpdates() {
  return [
    ...mockPrisma.document.update.mock.calls,
    ...mockPrisma.document.updateMany.mock.calls,
  ].filter((c) => c[0]?.data?.status === "EXPIRED");
}

/**
 * Steht die Fundstelle bei `index` direkt nach „für"? Im Satz („für
 * <strong>…"), im Betreff und im Label „Nachweis für" (HTML: eigener Absatz
 * davor, Text: „Nachweis für: …").
 */
function stehtNachFuer(teil: string, index: number): boolean {
  const davor = teil.slice(Math.max(0, index - 200), index);
  return (
    /für (<strong>)?$/.test(davor) ||
    /Nachweis für:\s*$/.test(davor) ||
    /Nachweis für<\/p>\s*<p[^>]*>$/.test(davor)
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
    mockPrisma.document.updateMany.mockResolvedValue({ count: 1 });
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
    // Bedingt auf das gelesene Datum: Hat HR die Frist inzwischen geaendert
    // (und damit den Merker geleert), ueberschreibt dieser Lauf das nicht.
    expect(merkerUpdates()[0][0]).toEqual({
      where: { id: "doc1", gueltigBis: ablaufIn(30) },
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
    // Bedingt: nur auf dem gelesenen Datum und nie ueber REJECTED — hat HR
    // die Frist seit dem Lesen korrigiert, bleibt deren Ruecknahme stehen.
    expect(statusUpdates()[0][0]).toEqual({
      where: {
        id: "doc1",
        gueltigBis: ablaufIn(-7),
        status: { notIn: ["EXPIRED", "REJECTED"] },
      },
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
  // Merker: SENT und SKIPPED ja, FAILED nein (Hausregel wie /cron/reminders)
  // ---------------------------------------------------------------
  it("setzt den Merker auch bei SKIPPED — ohne Protokoll, als eigener Zaehler", async () => {
    // SKIPPED heisst: Vorlage aus oder kein Empfaenger. Ein Versuch am naechsten
    // Tag aendert daran nichts; ohne Merker feuerten die Webhooks taeglich und
    // jeder Lauf schriebe einen SKIPPED-Eintrag ins Versandprotokoll.
    mockTriggerWebhooks.mockResolvedValue({ status: "SKIPPED", detail: "Kein Empfaenger" });
    mockPrisma.document.findMany.mockResolvedValue([dokument()]);

    const json = await (await POST(req())).json();
    expect(json.erinnerungen).toBe(0);
    expect(json.mailUebersprungen).toBe(1);
    expect(json.nichtZugestellt).toBe(0);
    // Das bestehende Feld zaehlt wie bisher mit (n8n-Auswertungen).
    expect(json.uebersprungen).toBe(1);
    expect(merkerUpdates()).toHaveLength(1);
    expect(merkerUpdates()[0][0].data).toEqual({
      ablaufErinnertAm: JETZT,
      ablaufErinnertStufe: "WARNUNG",
    });
    // Angekommen ist nichts — also auch kein DOKUMENT_ABLAUF_ERINNERT.
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("schweigt nach einem SKIPPED am naechsten Tag, statt taeglich neu zu feuern", async () => {
    // Der Merker vom Vortag (gleiche Stufe, Intervall 14 Tage) haelt.
    mockTriggerWebhooks.mockResolvedValue({ status: "SKIPPED" });
    mockPrisma.document.findMany.mockResolvedValue([
      dokument({
        ablaufErinnertAm: new Date(JETZT.getTime() - 1 * MS_PER_DAY),
        ablaufErinnertStufe: "WARNUNG",
      }),
    ]);

    await POST(req());
    expect(mockTriggerWebhooks).not.toHaveBeenCalled();
  });

  it("setzt den Merker NICHT bei FAILED — der naechste Lauf versucht es erneut", async () => {
    mockTriggerWebhooks.mockResolvedValue({ status: "FAILED", detail: "SMTP weg" });
    mockPrisma.document.findMany.mockResolvedValue([dokument()]);

    const json = await (await POST(req())).json();
    expect(json.erinnerungen).toBe(0);
    expect(json.nichtZugestellt).toBe(1);
    expect(json.mailUebersprungen).toBe(0);
    expect(json.uebersprungen).toBe(1);
    expect(merkerUpdates()).toHaveLength(0);
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("behandelt ein fehlendes Ergebnis des Dispatchers wie FAILED", async () => {
    mockTriggerWebhooks.mockResolvedValue(null);
    mockPrisma.document.findMany.mockResolvedValue([dokument()]);

    const json = await (await POST(req())).json();
    expect(json.nichtZugestellt).toBe(1);
    expect(merkerUpdates()).toHaveLength(0);
  });

  it("zaehlt den Ablauf nur, wenn das bedingte Update wirklich getroffen hat", async () => {
    // count 0: HR hat die Frist seit dem Lesen geaendert oder den Scan
    // abgelehnt — dann hat dieser Lauf nichts markiert.
    mockPrisma.document.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.document.findMany.mockResolvedValue([
      dokument({ gueltigBis: ablaufIn(-2), status: "UPLOADED" }),
    ]);

    const json = await (await POST(req())).json();
    expect(json.abgelaufenMarkiert).toBe(0);
    expect(statusUpdates()).toHaveLength(1);
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
    expect(merkerUpdates()[0][0].where).toEqual({ id: "docA", gueltigBis: gleich });
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

  // ---------------------------------------------------------------
  // Name der Person: Fragebogen, Vorgang, neutral — nie die Adresse
  // ---------------------------------------------------------------
  it("nimmt den Namen aus dem Fragebogen vor dem Namen am Vorgang", async () => {
    mockPrisma.document.findMany.mockResolvedValue([
      dokument({
        onboarding: {
          ...dokument().onboarding,
          personalData: { firstName: "Maximilian", lastName: "Mustermann-Neu" },
        },
      }),
    ]);
    await POST(req());

    expect(mockTriggerWebhooks.mock.calls[0][1].mitarbeiter_name).toBe(
      "Maximilian Mustermann-Neu"
    );
    // Die Abfrage muss die Fragebogen-Namen ueberhaupt mitlesen.
    const select = mockPrisma.document.findMany.mock.calls[0][0].select;
    expect(select.onboarding.select.personalData).toEqual({
      select: { firstName: true, lastName: true },
    });
  });

  it("nimmt ohne Fragebogen-Namen den Namen am Vorgang", async () => {
    mockPrisma.document.findMany.mockResolvedValue([dokument()]);
    await POST(req());
    expect(mockTriggerWebhooks.mock.calls[0][1].mitarbeiter_name).toBe("Max Mustermann");
  });

  it("faellt ohne Namen auf MITARBEITER_NEUTRAL zurueck — nie auf die private Adresse", async () => {
    mockPrisma.document.findMany.mockResolvedValue([
      dokument({
        onboarding: {
          ...dokument().onboarding,
          firstName: null,
          lastName: "  ",
          personalData: { firstName: "", lastName: null },
        },
      }),
    ]);
    await POST(req());

    const payload = mockTriggerWebhooks.mock.calls[0][1];
    expect(payload.mitarbeiter_name).toBe(MITARBEITER_NEUTRAL);
    expect(payload.mitarbeiter_name).not.toContain("@");
    // Das Feld selbst bleibt fuer bestehende Webhook-Abnehmer im Payload.
    expect(payload.mitarbeiter_email).toBe("max.mustermann@example.org");
  });

  it("beide Vorlagen bleiben mit der neutralen Bezeichnung grammatisch", () => {
    // MITARBEITER_NEUTRAL ist ein Akkusativ. Nach „von" (Dativ) oder als
    // Wert hinter einem Gedankenstrich zerbraeche der Satz; die Vorlagen
    // setzen den Namen deshalb nur nach „für".
    for (const event of ["dokument-ablauf-warnung", "dokument-abgelaufen"]) {
      const vorlage = DEFAULT_EMAIL_TEMPLATES.find((t) => t.event === event)!;
      const { rendered } = renderEventEmail(
        {
          subject: vorlage.subject,
          bodyHtml: vorlage.bodyHtml,
          bodyText: vorlage.bodyText,
          recipientTo: "personal@example.org",
          recipientCc: "",
          recipientBcc: "",
          recipientReplyTo: "",
        },
        event,
        {
          onboardingId: "onb1",
          displayId: "2026-GYM-001",
          mitarbeiter_name: MITARBEITER_NEUTRAL,
          mitarbeiter_email: "privat@gmx.example",
          organization: "Gymnasium",
          dokument_typ: "Aufenthaltstitel",
          dokument_datei: "titel.pdf",
          gueltig_bis: "08.10.2026",
          tage_verbleibend: 30,
          tage_ueberfaellig: 0,
          dringlichkeit: "Warnung",
          frist_text: "Läuft in 30 Tagen ab (08.10.2026)",
          portalLink: "http://localhost:3000/dashboard/onb1",
        }
      );
      const mail = rendered!;
      expect(mail.subject).toContain(`Aufenthaltstitel für ${MITARBEITER_NEUTRAL}`);

      for (const teil of [mail.subject, mail.html, mail.text ?? ""]) {
        let index = teil.indexOf(MITARBEITER_NEUTRAL);
        expect({ event, gefunden: index >= 0 }).toEqual({ event, gefunden: true });
        while (index >= 0) {
          const umgebung = teil.slice(Math.max(0, index - 60), index);
          expect({ event, umgebung, nachFuer: stehtNachFuer(teil, index) }).toEqual({
            event,
            umgebung,
            nachFuer: true,
          });
          index = teil.indexOf(MITARBEITER_NEUTRAL, index + 1);
        }
        expect(teil).not.toMatch(/\{\{/);
      }
    }
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

  // ---------------------------------------------------------------
  // Paket 4: unbefristete Nachweise (Z1) und kein Dateiname in der Mail
  // ---------------------------------------------------------------
  it("fragt je Vorgang die ausdruecklich unbefristeten Arten mit ab — ohne abgelehnte Scans", async () => {
    await POST(req());
    const select = mockPrisma.document.findMany.mock.calls[0][0].select;
    expect(select.onboarding.select.documents).toEqual({
      where: {
        type: { in: ["AUFENTHALTSTITEL", "ARBEITSERLAUBNIS"] },
        unbefristet: true,
        status: { not: "REJECTED" },
      },
      select: { type: true },
    });
  });

  it("Z1: liegt fuer Person und Art ein unbefristeter Nachweis vor, mahnt der Lauf nicht mehr", async () => {
    mockPrisma.document.findMany.mockResolvedValue([
      dokument({
        gueltigBis: ablaufIn(-3),
        onboarding: { ...dokument().onboarding, documents: [{ type: "AUFENTHALTSTITEL" }] },
      }),
    ]);

    const json = await (await POST(req())).json();
    expect(json.erinnerungen).toBe(0);
    expect(json.uebersprungen).toBe(1);
    expect(mockTriggerWebhooks).not.toHaveBeenCalled();
    expect(merkerUpdates()).toHaveLength(0);
    // Der alte Titel ist trotzdem abgelaufen und wird so gefuehrt.
    expect(json.abgelaufenMarkiert).toBe(1);
  });

  it("Z1: ein unbefristeter Nachweis einer ANDEREN Art beendet die Mahnung nicht", async () => {
    mockPrisma.document.findMany.mockResolvedValue([
      dokument({ onboarding: { ...dokument().onboarding, documents: [{ type: "ARBEITSERLAUBNIS" }] } }),
    ]);
    expect((await (await POST(req())).json()).erinnerungen).toBe(1);
  });

  it("`dokument_datei` traegt nie den Dateinamen, sondern eine neutrale Bezeichnung", async () => {
    mockPrisma.document.findMany.mockResolvedValue([
      dokument({ fileName: "Titel Anna Mustermann.jpg", uploadedAt: new Date("2026-09-14T08:00:00.000Z") }),
    ]);
    await POST(req());
    const payload = mockTriggerWebhooks.mock.calls[0][1];
    expect(payload.dokument_datei).toBe("hochgeladen am 14.09.2026");
    expect(JSON.stringify(payload)).not.toContain("Titel Anna");
    // Die Abfrage liest den Dateinamen gar nicht erst.
    expect(mockPrisma.document.findMany.mock.calls[0][0].select).not.toHaveProperty("fileName");
  });

  it("`dokument_datei`: auch keine frei vergebene Bezeichnung (HR-Freitext, unmaskiert im HTML) — nur Datum, sonst die Art", async () => {
    const freitext = '<a href="https://boese.example.org">Titel Rückseite</a>';
    mockPrisma.document.findMany.mockResolvedValue([
      dokument({ id: "doc1", bezeichnung: freitext, uploadedAt: new Date("2026-09-13T23:30:00.000Z") }),
      dokument({ id: "doc2", type: "ARBEITSERLAUBNIS", fileName: "erlaubnis.pdf" }),
    ]);
    await POST(req());
    // 23:30 UTC ist in Berlin schon der 14.09.
    expect(mockTriggerWebhooks.mock.calls[0][1].dokument_datei).toBe("hochgeladen am 14.09.2026");
    expect(mockTriggerWebhooks.mock.calls[1][1].dokument_datei).toBe(documentTypeLabel("ARBEITSERLAUBNIS"));
    for (const [, payload] of mockTriggerWebhooks.mock.calls) {
      expect(JSON.stringify(payload)).not.toContain("boese.example.org");
      expect(JSON.stringify(payload)).not.toContain("Rückseite");
    }
    // Die Abfrage liest die Bezeichnung gar nicht erst.
    expect(mockPrisma.document.findMany.mock.calls[0][0].select).not.toHaveProperty("bezeichnung");
  });

  it("beide Vorlagen lesen sich mit der neutralen Bezeichnung (ohne Vorlagenaenderung)", () => {
    for (const event of ["dokument-ablauf-warnung", "dokument-abgelaufen"]) {
      const vorlage = DEFAULT_EMAIL_TEMPLATES.find((t) => t.event === event)!;
      const { rendered } = renderEventEmail(
        {
          subject: vorlage.subject,
          bodyHtml: vorlage.bodyHtml,
          bodyText: vorlage.bodyText,
          recipientTo: "personal@example.org",
          recipientCc: "",
          recipientBcc: "",
          recipientReplyTo: "",
        },
        event,
        {
          onboardingId: "onb1",
          displayId: "2026-GYM-001",
          mitarbeiter_name: "Max Mustermann",
          mitarbeiter_email: "max@example.org",
          organization: "Gymnasium",
          dokument_typ: "Aufenthaltstitel",
          dokument_datei: "hochgeladen am 14.09.2026",
          gueltig_bis: "08.10.2026",
          tage_verbleibend: 30,
          tage_ueberfaellig: 0,
          dringlichkeit: "Warnung",
          frist_text: "Läuft in 30 Tagen ab (08.10.2026)",
          portalLink: "http://localhost:3000/dashboard/onb1",
        }
      );
      expect({ event, text: rendered!.text }).toEqual({
        event,
        text: expect.stringContaining("Aufenthaltstitel (hochgeladen am 14.09.2026)"),
      });
      expect(rendered!.html).toContain("hochgeladen am 14.09.2026</span>");
    }
  });
});
