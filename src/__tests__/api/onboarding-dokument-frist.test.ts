/**
 * Tests: HR aendert die Frist eines Nachweises
 * (PATCH /api/onboarding/[id]/documents/[docId])
 *
 * ============================================================================
 * WARUM ES DIESE ROUTE GIBT (Durchsicht 09/2026)
 * ============================================================================
 *
 * `Document.gueltigBis` traegt die gesamte Fristenueberwachung: die Ampel an
 * der Dokumentenzeile, den Warnbalken am Vorgang und den naechtlichen
 * Erinnerungs-Cron (der auf `gueltigBis: { not: null }` filtert und einen
 * Nachweis ohne Datum deshalb nie sieht).
 *
 * Geschrieben werden konnte das Feld aber nur ueber den Magic Link der
 * beschaeftigten Person — und der wird mit dem Absenden des Fragebogens
 * ungueltig. Damit war jeder Nachweis, der ohne Datum abgegeben wurde,
 * dauerhaft unueberwacht: Die Oberflaeche forderte HR an zwei Stellen woertlich
 * auf, das Datum „nachzutragen", und es gab im ganzen Portal keine Stelle
 * dafuer. Genauso wenig liess sich der Kreis schliessen, fuer den der Cron
 * gebaut ist — die Erinnerung geht an HR, die Person schickt den verlaengerten
 * Titel, und die neue Frist konnte niemand eintragen.
 *
 * ============================================================================
 * WORAUF DIE ZUSICHERUNGEN ZIELEN
 * ============================================================================
 *
 *  1. Der Weg existiert ueberhaupt und schreibt ein reines Datum (Mitternacht
 *     UTC, `@db.Date`) — keine Ortszeit, sonst verschiebt sich der Ablauftag.
 *  2. Die Mandantengrenze. Die Schwester-Route GET prueft heute nur die
 *     Zugehoerigkeit des Dokuments zum Vorgang; eine schreibende Route darf
 *     sich damit nicht begnuegen.
 *  3. Die Fristregel ist DIESELBE wie am Magic Link (`pruefeGueltigBis`), nicht
 *     eine zweite Fassung daneben.
 *  4. Loeschen ist hier erlaubt (am Magic Link nicht) — und jede Aenderung
 *     hinterlaesst eine Spur, sonst waere genau das der stille Weg, die
 *     Ablaufkontrolle abzuschalten.
 *  5. Paket 4 (4.4, Z1): Ein angenommener Nachweis (`reviewedAt` gesetzt)
 *     kehrt aus EXPIRED nach APPROVED zurueck, nicht nach UPLOADED — und
 *     „unbefristet" ist ein eigenes Kennzeichen, das ein Datum wieder aufhebt.
 */

const mockGetSession = jest.fn();
const mockCanAccessProcess = jest.fn();

const mockPrisma = {
  onboardingProcess: { findUnique: jest.fn() },
  document: { findFirst: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  auditLog: { create: jest.fn() },
  // Die Route bindet Aenderung, Statusruecknahme und Protokoll zusammen —
  // interaktiv, weil das Protokoll wissen muss, ob der Status wirklich
  // zurueckgenommen wurde. Der Mock reicht sich selbst als `tx` durch.
  $transaction: jest.fn(),
};

jest.mock("@/lib/auth", () => ({ getSession: mockGetSession }));
jest.mock("@/lib/db", () => ({ prisma: mockPrisma }));
jest.mock("@/lib/permissions", () => ({
  ...jest.requireActual("@/lib/permissions"),
  canAccessProcess: (...args: unknown[]) => mockCanAccessProcess(...args),
}));

import { PATCH } from "@/app/api/onboarding/[id]/documents/[docId]/route";
import { MELDUNGEN } from "@/lib/unterlagen";
import { positionsAktionSchema } from "@/lib/validations/unterlagen";
import { NextRequest } from "next/server";

const HR_SESSION = {
  userId: "hr-1",
  email: "hr@credo-gruppe.de",
  role: "HR_SACHBEARBEITER",
  firstName: "H",
  lastName: "R",
};

const VORGANG = { id: "v1", organizationId: "org-1" };
const TITEL = {
  id: "d1",
  type: "AUFENTHALTSTITEL",
  fileName: "titel.pdf",
  gueltigBis: null as Date | null,
  status: "UPLOADED",
};

function patch(koerper: unknown, id = "v1", docId = "d1") {
  return PATCH(
    new NextRequest(`http://localhost/api/onboarding/${id}/documents/${docId}`, {
      method: "PATCH",
      body: JSON.stringify(koerper),
    }),
    { params: Promise.resolve({ id, docId }) }
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetSession.mockResolvedValue(HR_SESSION);
  mockCanAccessProcess.mockResolvedValue(true);
  mockPrisma.onboardingProcess.findUnique.mockResolvedValue(VORGANG);
  mockPrisma.document.findFirst.mockResolvedValue({ ...TITEL });
  mockPrisma.document.update.mockImplementation(({ data }: { data: { gueltigBis: Date | null } }) =>
    Promise.resolve({
      id: "d1",
      type: "AUFENTHALTSTITEL",
      gueltigBis: data.gueltigBis,
      status: "UPLOADED",
    })
  );
  mockPrisma.document.updateMany.mockResolvedValue({ count: 0 });
  mockPrisma.auditLog.create.mockResolvedValue({});
  mockPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
    fn(mockPrisma)
  );
});

// =============================================
// 1. Der Weg selbst
// =============================================

describe("HR traegt ein Ablaufdatum nach", () => {
  test("schreibt es als reines Datum auf Mitternacht UTC", async () => {
    const antwort = await patch({ gueltigBis: "2027-03-01" });

    expect(antwort.status).toBe(200);
    const geschrieben = mockPrisma.document.update.mock.calls[0][0];
    expect(geschrieben.where).toEqual({ id: "d1" });
    // NICHT `new Date(2027, 2, 1)`: Das stuende auf Mitternacht ORTSZEIT und
    // landete oestlich von Greenwich als 28.02. in der `date`-Spalte.
    expect((geschrieben.data.gueltigBis as Date).toISOString()).toBe(
      "2027-03-01T00:00:00.000Z"
    );
  });

  test("haelt die Aenderung mit altem und neuem Wert im Protokoll fest", async () => {
    mockPrisma.document.findFirst.mockResolvedValue({
      ...TITEL,
      gueltigBis: new Date("2026-10-01T00:00:00.000Z"),
    });

    await patch({ gueltigBis: "2029-10-01" });

    const log = mockPrisma.auditLog.create.mock.calls[0][0].data;
    expect(log.action).toBe("DOKUMENT_FRIST_GEAENDERT");
    expect(log.userId).toBe("hr-1");
    expect(log.onboardingId).toBe("v1");
    expect(log.details).toMatchObject({
      documentId: "d1",
      vorher: "2026-10-01",
      nachher: "2029-10-01",
    });
  });

  /**
   * Die Aenderung und ihr Protokolleintrag gehoeren zusammen: Eine Frist, die
   * sich ohne Spur verschiebt, ist genau der Zustand, den die Ampel verhindern
   * soll.
   */
  test("schreibt Aenderung und Protokoll in EINER Transaktion", async () => {
    await patch({ gueltigBis: "2027-03-01" });

    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    // Interaktiv: Beide Schreibvorgaenge laufen ueber `tx`, innerhalb des
    // einen Aufrufs.
    expect(typeof mockPrisma.$transaction.mock.calls[0][0]).toBe("function");
    expect(mockPrisma.document.update).toHaveBeenCalledTimes(1);
    expect(mockPrisma.auditLog.create).toHaveBeenCalledTimes(1);
  });

  /**
   * Loeschen gibt es NUR hier, nicht am Magic Link: Dort waere ein leeres Datum
   * der stille Klick, mit dem sich die Ablaufkontrolle abschalten liesse. Hier
   * ist es die einzige Moeglichkeit, ein faelschlich eingetragenes Datum an
   * einer unbefristeten Niederlassungserlaubnis wieder loszuwerden.
   */
  test("nimmt ein falsch gesetztes Datum wieder zurueck", async () => {
    mockPrisma.document.findFirst.mockResolvedValue({
      ...TITEL,
      gueltigBis: new Date("2027-03-01T00:00:00.000Z"),
    });

    const antwort = await patch({ gueltigBis: "" });

    expect(antwort.status).toBe(200);
    expect(mockPrisma.document.update.mock.calls[0][0].data.gueltigBis).toBeNull();
    expect(mockPrisma.auditLog.create.mock.calls[0][0].data.details).toMatchObject({
      vorher: "2027-03-01",
      nachher: null,
    });
  });

  /**
   * Ein Protokolleintrag, der eine Aenderung behauptet, die keine war, macht
   * die Spur wertlos — dann steht in der Akte, HR habe etwas getan, was
   * niemand getan hat.
   */
  test("schreibt nichts, wenn sich das Datum gar nicht aendert", async () => {
    mockPrisma.document.findFirst.mockResolvedValue({
      ...TITEL,
      gueltigBis: new Date("2027-03-01T00:00:00.000Z"),
    });

    const antwort = await patch({ gueltigBis: "2027-03-01" });

    expect(antwort.status).toBe(200);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
    // Auch Merker und Status bleiben: Ein erneutes Speichern desselben Datums
    // startet keinen neuen Erinnerungszyklus.
    expect(mockPrisma.document.update).not.toHaveBeenCalled();
    expect(mockPrisma.document.updateMany).not.toHaveBeenCalled();
  });
});

// =============================================
// 2. Wer darf, und wo die Grenze liegt
// =============================================

describe("Zugriffsgrenzen", () => {
  test("weist ohne Sitzung ab", async () => {
    mockGetSession.mockResolvedValue(null);
    expect((await patch({ gueltigBis: "2027-03-01" })).status).toBe(401);
    expect(mockPrisma.document.update).not.toHaveBeenCalled();
  });

  test("weist eine nur lesende Rolle ab", async () => {
    mockGetSession.mockResolvedValue({ ...HR_SESSION, role: "VIEWER" });
    expect((await patch({ gueltigBis: "2027-03-01" })).status).toBe(403);
    expect(mockPrisma.document.update).not.toHaveBeenCalled();
  });

  /**
   * Der fremde Mandant bekommt denselben 404 wie ein unbekannter Vorgang —
   * ein eigener Code verriete, dass es ihn gibt.
   */
  test("weist einen fremden Mandanten mit 404 ab, nicht mit 403", async () => {
    mockCanAccessProcess.mockResolvedValue(false);
    const antwort = await patch({ gueltigBis: "2027-03-01" });

    expect(antwort.status).toBe(404);
    expect(await antwort.json()).toEqual({ error: "Vorgang nicht gefunden" });
    expect(mockPrisma.document.update).not.toHaveBeenCalled();
  });

  /**
   * Die documentId kommt aus der Anfrage. Ohne die Bindung an den Vorgang
   * liesse sich ueber einen eigenen Vorgang ein fremdes Dokument aendern.
   */
  test("aendert kein Dokument eines anderen Vorgangs", async () => {
    mockPrisma.document.findFirst.mockResolvedValue(null);
    expect((await patch({ gueltigBis: "2027-03-01" })).status).toBe(404);

    // Die Bindung steckt in der Abfrage selbst, nicht in einem nachtraeglichen
    // Vergleich — sonst waere sie beim naechsten Umbau schnell weg.
    expect(mockPrisma.document.findFirst.mock.calls[0][0].where).toEqual({
      id: "d1",
      onboardingId: "v1",
    });
  });
});

// =============================================
// 3. Dieselbe Fristregel wie am Magic Link
// =============================================

describe("Fristregel", () => {
  test("weist ein unlesbares Datum ab", async () => {
    const antwort = await patch({ gueltigBis: "01.03.2027" });
    expect(antwort.status).toBe(400);
    expect(mockPrisma.document.update).not.toHaveBeenCalled();
  });

  test("weist den 31. Februar ab, obwohl das Muster stimmt", async () => {
    expect((await patch({ gueltigBis: "2027-02-31" })).status).toBe(400);
  });

  test("weist eine Jahreszahl weit in der Zukunft ab (Tippfehler)", async () => {
    const antwort = await patch({ gueltigBis: "2206-03-01" });
    expect(antwort.status).toBe(400);
    expect((await antwort.json()).error).toContain("20 Jahre");
  });

  /**
   * Ein abgelaufener Titel ist eine Tatsache, die HR sehen muss. Wer sie mit
   * einem 400 zurueckweist, erzieht zum Erfinden eines passenden Datums.
   */
  test("nimmt ein Datum in der Vergangenheit an", async () => {
    expect((await patch({ gueltigBis: "2020-01-01" })).status).toBe(200);
  });

  /**
   * Ein Ablaufdatum an einer Geburtsurkunde ist ein Bedienfehler. Es
   * stillschweigend zu verwerfen waere schlimmer — jemand hat es getippt.
   */
  test("weist ein Datum an einem Typ ohne Frist ab", async () => {
    mockPrisma.document.findFirst.mockResolvedValue({
      ...TITEL,
      type: "GEBURTSURKUNDE_EIGEN",
    });

    const antwort = await patch({ gueltigBis: "2027-03-01" });
    expect(antwort.status).toBe(400);
    expect(mockPrisma.document.update).not.toHaveBeenCalled();
  });

  /**
   * Auch das LEEREN muss an einem Typ ohne Frist scheitern: `pruefeGueltigBis`
   * laesst den leeren Wert ueberall durch, weil beim Upload jeder Typ ohne
   * Datum ankommen darf. Hier waere das eine stille Zusage, dass die Ruecknahme
   * geklappt hat.
   */
  test("weist auch die Ruecknahme an einem Typ ohne Frist ab", async () => {
    mockPrisma.document.findFirst.mockResolvedValue({
      ...TITEL,
      type: "GEBURTSURKUNDE_EIGEN",
    });

    expect((await patch({ gueltigBis: "" })).status).toBe(400);
    expect(mockPrisma.document.update).not.toHaveBeenCalled();
  });
});

// =============================================
// 4. Eine neue Frist beginnt von vorn (Durchsicht 09/2026)
// =============================================
//
// Der naechtliche Lauf schreibt EXPIRED und den Erinnerungs-Merker an das
// Dokument — beides haengt am ALTEN Datum. Ohne Ruecknahme truege ein
// korrigierter Titel dauerhaft „Abgelaufen" neben der gruenen Ampel, und die
// erste Erinnerung zur neuen Frist wartete das Intervall der alten Stufe ab.

describe("Neue Frist, neuer Zyklus", () => {
  /** 23.09.2026, 10:00 UTC — die Stufen haengen an „heute in Berlin". */
  const JETZT = new Date("2026-09-23T10:00:00.000Z");

  beforeAll(() => {
    jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate"] });
    jest.setSystemTime(JETZT);
  });
  afterAll(() => {
    jest.useRealTimers();
  });

  const ABGELAUFENER_TITEL = {
    ...TITEL,
    gueltigBis: new Date("2026-09-01T00:00:00.000Z"),
    status: "EXPIRED",
  };

  test("leert bei jeder Aenderung den Erinnerungs-Merker", async () => {
    await patch({ gueltigBis: "2027-03-01" });

    expect(mockPrisma.document.update.mock.calls[0][0].data).toMatchObject({
      ablaufErinnertAm: null,
      ablaufErinnertStufe: null,
    });
  });

  test("nimmt EXPIRED zurueck, wenn die neue Frist nicht abgelaufen ist — mit Spur", async () => {
    mockPrisma.document.findFirst.mockResolvedValue({ ...ABGELAUFENER_TITEL });
    mockPrisma.document.updateMany.mockResolvedValue({ count: 1 });

    const antwort = await patch({ gueltigBis: "2027-09-01" });

    expect(antwort.status).toBe(200);
    // Bedingt in der Abfrage, nicht nach dem gelesenen Stand: trifft NUR
    // EXPIRED, nie REJECTED — auch wenn der Lauf EXPIRED gerade erst gesetzt hat.
    expect(mockPrisma.document.updateMany).toHaveBeenCalledWith({
      where: { id: "d1", status: "EXPIRED" },
      data: { status: "UPLOADED" },
    });
    expect(mockPrisma.auditLog.create.mock.calls[0][0].data.details).toMatchObject({
      vorher: "2026-09-01",
      nachher: "2027-09-01",
      statusVorher: "EXPIRED",
      statusNachher: "UPLOADED",
    });
    // Die Antwort traegt den Status, damit die Oberflaeche ihn nachziehen kann.
    expect(await antwort.json()).toHaveProperty("status");
  });

  test("laesst den Status stehen, wenn auch die neue Frist schon abgelaufen ist", async () => {
    // EXPIRED setzt dann der naechste Lauf — die eine Stelle, die ihn setzt.
    mockPrisma.document.findFirst.mockResolvedValue({ ...ABGELAUFENER_TITEL });

    await patch({ gueltigBis: "2026-09-10" });

    expect(mockPrisma.document.updateMany).not.toHaveBeenCalled();
    // Der Merker wird trotzdem geleert: Fuer die korrigierte Frist meldet sich
    // der Lauf beim naechsten Mal sofort.
    expect(mockPrisma.document.update.mock.calls[0][0].data).toMatchObject({
      ablaufErinnertAm: null,
      ablaufErinnertStufe: null,
    });
    expect(mockPrisma.auditLog.create.mock.calls[0][0].data.details).not.toHaveProperty(
      "statusVorher"
    );
  });

  test("der Ablauftag selbst gilt noch — EXPIRED wird zurueckgenommen", async () => {
    mockPrisma.document.findFirst.mockResolvedValue({ ...ABGELAUFENER_TITEL });

    await patch({ gueltigBis: "2026-09-23" });

    expect(mockPrisma.document.updateMany).toHaveBeenCalledTimes(1);
  });

  test("ohne Datum ist nichts abgelaufen — auch das Loeschen nimmt EXPIRED zurueck", async () => {
    mockPrisma.document.findFirst.mockResolvedValue({ ...ABGELAUFENER_TITEL });
    mockPrisma.document.updateMany.mockResolvedValue({ count: 1 });

    await patch({ gueltigBis: "" });

    expect(mockPrisma.document.updateMany).toHaveBeenCalledWith({
      where: { id: "d1", status: "EXPIRED" },
      data: { status: "UPLOADED" },
    });
  });

  test("REJECTED bleibt unberuehrt — kein Statuswechsel im Protokoll", async () => {
    // Die Ablehnung gilt dem Scan, nicht dem Datum. Die bedingte Abfrage trifft
    // die Zeile nicht (count 0), und das Protokoll behauptet keinen Wechsel.
    mockPrisma.document.findFirst.mockResolvedValue({
      ...TITEL,
      gueltigBis: new Date("2026-09-01T00:00:00.000Z"),
      status: "REJECTED",
    });
    mockPrisma.document.updateMany.mockResolvedValue({ count: 0 });

    await patch({ gueltigBis: "2027-09-01" });

    expect(mockPrisma.document.updateMany.mock.calls[0][0].where).toEqual({
      id: "d1",
      status: "EXPIRED",
    });
    expect(mockPrisma.document.update.mock.calls[0][0].data).not.toHaveProperty("status");
    expect(mockPrisma.auditLog.create.mock.calls[0][0].data.details).not.toHaveProperty(
      "statusVorher"
    );
  });

  /**
   * Paket 4 (4.4): Nur das Annehmen einer nachgeforderten Unterlage schreibt
   * `reviewedAt` — immer zusammen mit APPROVED. Laeuft ein solcher Titel ab
   * und HR traegt den verlaengerten ein, war er geprueft und bleibt es.
   */
  test("ein angenommener Nachweis (reviewedAt) kehrt aus EXPIRED nach APPROVED zurueck — mit Spur", async () => {
    mockPrisma.document.findFirst.mockResolvedValue({
      ...ABGELAUFENER_TITEL,
      reviewedAt: new Date("2026-06-01T10:00:00.000Z"),
    });
    mockPrisma.document.updateMany.mockResolvedValue({ count: 1 });

    await patch({ gueltigBis: "2027-09-01" });

    expect(mockPrisma.document.updateMany).toHaveBeenCalledWith({
      where: { id: "d1", status: "EXPIRED" },
      data: { status: "APPROVED" },
    });
    expect(mockPrisma.auditLog.create.mock.calls[0][0].data.details).toMatchObject({
      statusVorher: "EXPIRED",
      statusNachher: "APPROVED",
    });
  });

  test("ohne reviewedAt (Fragebogen-Upload) weiter UPLOADED", async () => {
    mockPrisma.document.findFirst.mockResolvedValue({ ...ABGELAUFENER_TITEL, reviewedAt: null });
    mockPrisma.document.updateMany.mockResolvedValue({ count: 1 });

    await patch({ gueltigBis: "2027-09-01" });

    expect(mockPrisma.document.updateMany.mock.calls[0][0].data).toEqual({ status: "UPLOADED" });
  });

  test("„Unbefristet“ an einem abgelaufenen, angenommenen Titel: kein Datum ist nicht abgelaufen → APPROVED", async () => {
    mockPrisma.document.findFirst.mockResolvedValue({
      ...ABGELAUFENER_TITEL,
      reviewedAt: new Date("2026-06-01T10:00:00.000Z"),
    });
    mockPrisma.document.updateMany.mockResolvedValue({ count: 1 });

    await patch({ gueltigBis: null, unbefristet: true });

    expect(mockPrisma.document.updateMany.mock.calls[0][0].data).toEqual({ status: "APPROVED" });
    expect(mockPrisma.document.update.mock.calls[0][0].data).toMatchObject({
      gueltigBis: null,
      unbefristet: true,
      ablaufErinnertAm: null,
      ablaufErinnertStufe: null,
    });
  });
});

// =============================================
// 5. Kennzeichen „unbefristet" (Paket 4, Z1)
// =============================================
//
// Ein Nachweis ohne Datum verdraengte nie einen datierten derselben Art — nach
// einer Niederlassungserlaubnis blieben Warnbalken und Erinnerungen des alten
// Titels stehen. Das Kennzeichen macht „unbefristet" von „Frist noch nicht
// erfasst" unterscheidbar.

describe("Kennzeichen „unbefristet“ (Z1)", () => {
  test("{ gueltigBis: null, unbefristet: true } setzt das Kennzeichen — mit Spur, ohne Dateinamen", async () => {
    mockPrisma.document.findFirst.mockResolvedValue({
      ...TITEL,
      gueltigBis: new Date("2027-03-01T00:00:00.000Z"),
      unbefristet: false,
    });

    const antwort = await patch({ gueltigBis: null, unbefristet: true });

    expect(antwort.status).toBe(200);
    expect(mockPrisma.document.update.mock.calls[0][0].data).toMatchObject({ gueltigBis: null, unbefristet: true });
    // Die Antwort traegt das Kennzeichen, damit die Oberflaeche es nachziehen kann.
    expect(mockPrisma.document.update.mock.calls[0][0].select).toMatchObject({ unbefristet: true });
    const details = mockPrisma.auditLog.create.mock.calls[0][0].data.details;
    expect(details).toMatchObject({
      documentId: "d1",
      vorher: "2027-03-01",
      nachher: null,
      unbefristetVorher: false,
      unbefristetNachher: true,
    });
    // Ein angenommener Nachweis traegt als Namen den der Person — der gehoert nie ins Protokoll.
    expect(details).not.toHaveProperty("dokumentDatei");
    expect(JSON.stringify(details)).not.toContain("titel.pdf");
  });

  test("ein gesetztes Datum hebt das Kennzeichen wieder auf", async () => {
    mockPrisma.document.findFirst.mockResolvedValue({ ...TITEL, gueltigBis: null, unbefristet: true });

    await patch({ gueltigBis: "2028-01-31" });

    expect(mockPrisma.document.update.mock.calls[0][0].data).toMatchObject({ unbefristet: false });
    expect(mockPrisma.auditLog.create.mock.calls[0][0].data.details).toMatchObject({
      vorher: null,
      nachher: "2028-01-31",
      unbefristetVorher: true,
      unbefristetNachher: false,
    });
  });

  test("ein leeres Datum ohne `unbefristet` heisst „Frist nicht erfasst“ — auch das hebt das Kennzeichen auf", async () => {
    mockPrisma.document.findFirst.mockResolvedValue({ ...TITEL, gueltigBis: null, unbefristet: true });

    const antwort = await patch({ gueltigBis: "" });

    expect(antwort.status).toBe(200);
    expect(mockPrisma.document.update.mock.calls[0][0].data).toMatchObject({ gueltigBis: null, unbefristet: false });
  });

  test("schon unbefristet, noch einmal unbefristet: nichts zu tun, keine Spur", async () => {
    mockPrisma.document.findFirst.mockResolvedValue({ ...TITEL, gueltigBis: null, unbefristet: true });

    const antwort = await patch({ gueltigBis: null, unbefristet: true });

    expect(antwort.status).toBe(200);
    expect(await antwort.json()).toMatchObject({ unbefristet: true });
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });

  test("Datum UND unbefristet zugleich → 400 — derselbe Text wie beim Annehmen, vor jedem Lesen (Zod)", async () => {
    const antwort = await patch({ gueltigBis: "2028-01-31", unbefristet: true });
    expect(antwort.status).toBe(400);
    expect((await antwort.json()).error).toBe(MELDUNGEN.DATUM_UND_UNBEFRISTET);
    expect(mockPrisma.onboardingProcess.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.document.update).not.toHaveBeenCalled();
    // Dieselbe Regel und derselbe Text im Schema des Annehmens.
    const annehmen = positionsAktionSchema.safeParse({ aktion: "annehmen", gueltigBis: "2028-01-31", unbefristet: true });
    expect(annehmen.success ? null : annehmen.error.errors[0].message).toBe(MELDUNGEN.DATUM_UND_UNBEFRISTET);
  });

  test("ein leerer Text ist kein Datum: { gueltigBis: \"\", unbefristet: true } setzt das Kennzeichen", async () => {
    const antwort = await patch({ gueltigBis: "", unbefristet: true });
    expect(antwort.status).toBe(200);
    expect(mockPrisma.document.update.mock.calls[0][0].data).toMatchObject({ gueltigBis: null, unbefristet: true });
  });

  test("`unbefristet` ist kein Wahrheitswert → 400", async () => {
    expect((await patch({ gueltigBis: null, unbefristet: "ja" })).status).toBe(400);
    expect(mockPrisma.document.update).not.toHaveBeenCalled();
  });

  test("kein Objekt (Liste, null) → 400, nichts gelesen", async () => {
    expect((await patch([])).status).toBe(400);
    expect((await patch(null)).status).toBe(400);
    expect(mockPrisma.onboardingProcess.findUnique).not.toHaveBeenCalled();
  });

  test("„unbefristet“ an einem Typ ohne Frist → 400", async () => {
    mockPrisma.document.findFirst.mockResolvedValue({ ...TITEL, type: "GEBURTSURKUNDE_EIGEN" });
    expect((await patch({ gueltigBis: null, unbefristet: true })).status).toBe(400);
    expect(mockPrisma.document.update).not.toHaveBeenCalled();
  });
});
