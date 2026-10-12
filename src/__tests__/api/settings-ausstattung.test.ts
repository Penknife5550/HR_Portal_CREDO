/**
 * Einstellungen → Ausstattung & Zugänge (Feinplan S3): /api/settings/ausstattung
 *
 *   GET/POST   /api/settings/ausstattung
 *   PATCH/DELETE /api/settings/ausstattung/[id]
 *   PUT        /api/settings/ausstattung/[id]/ausblendung
 *   POST       /api/settings/ausstattung/vorschlaege
 *
 * Gemocktes Prisma (Geruest wie settings-departments.test.ts), damit die
 * Aufrufe selbst pruefbar sind: Anlegen immer ausgeschaltet, nur die
 * Positivliste wird geschrieben (nie A4-Felder oder vorschlagSchluessel ueber
 * POST/PATCH), nur echte Aenderungen werden geschrieben und protokolliert
 * (von/nach je Feld), Loeschen in Verwendung 409, Ausblenden nur fuer zentrale
 * Positionen, „Vorschläge übernehmen“ ist wiederholbar, die Warnungen werden
 * auf dem Server gerechnet.
 */

const mockGetSession = jest.fn();
const mockPrisma = {
  ausstattungsPosition: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    createManyAndReturn: jest.fn(),
  },
  ausstattungsAusblendung: { createMany: jest.fn(), deleteMany: jest.fn() },
  onboardingAusstattung: { count: jest.fn() },
  organization: { findMany: jest.fn(), findUnique: jest.fn() },
  departmentConfig: { findMany: jest.fn() },
  checklistTemplateItem: { findMany: jest.fn() },
  smtpConfig: { findUnique: jest.fn() },
  auditLog: { create: jest.fn() },
  // Interaktive Transaktion: tx ist dasselbe Mock-Objekt (Umsetzung im beforeEach).
  $transaction: jest.fn(),
};

jest.mock("@/lib/auth", () => ({ getSession: mockGetSession }));
jest.mock("@/lib/db", () => ({ prisma: mockPrisma }));

import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/settings/ausstattung/route";
import { PATCH, DELETE } from "@/app/api/settings/ausstattung/[id]/route";
import { PUT } from "@/app/api/settings/ausstattung/[id]/ausblendung/route";
import { POST as VORSCHLAEGE_POST } from "@/app/api/settings/ausstattung/vorschlaege/route";
import { AUSSTATTUNG_AUDIT, KATALOG_FELDER, MELDUNGEN, VORSCHLAEGE } from "@/lib/ausstattung";

// =============================================
// Fixtures
// =============================================

const HR_LEITUNG = { userId: "u-hrl", email: "hrl@credo.de", role: "HR_LEITUNG", firstName: "H", lastName: "L" };
const SUPER_ADMIN = { ...HR_LEITUNG, userId: "u-sa", role: "SUPER_ADMIN" };
const HR_SACHBEARBEITER = { ...HR_LEITUNG, userId: "u-hrs", role: "HR_SACHBEARBEITER" };

// ausblendungSchema verlangt UUIDs.
const GYM = "11111111-1111-4111-8111-111111111111";
const GS = "22222222-2222-4222-8222-222222222222";
const ZEIT = new Date("2026-10-12T08:00:00.000Z");

function zeile(teil: Record<string, unknown> = {}) {
  return {
    id: "pos-1",
    departmentKey: "IT",
    organizationId: null,
    einrichtungsarten: [],
    art: "JA_NEIN",
    angabeSchluessel: null,
    bezeichnung: "Dienst-iPad (Lernmittel)",
    hinweisFuehrungskraft: null,
    hinweisStelle: null,
    optionen: [],
    vorausgewaehlt: false,
    vorausgewaehlteOptionen: [],
    bemerkungAnbieten: true,
    bemerkungPlatzhalter: null,
    aufgabeTitel: null,
    defaultDueDays: -5,
    personengruppen: [],
    sichtbarFuer: [],
    entgeltrelevant: false,
    ausgabeKennung: null,
    rueckgabeKategorie: null,
    beiAustritt: null,
    vorschlagSchluessel: null,
    isActive: true,
    orderIndex: 0,
    createdAt: ZEIT,
    updatedAt: ZEIT,
    ausblendungen: [] as { organizationId: string }[],
    _count: { auswahlen: 0 },
    ...teil,
  };
}

const URL_BASIS = "http://localhost:3000/api/settings/ausstattung";
const OHNE_PARAMS = { params: Promise.resolve({}) };
const mitId = (id: string) => ({ params: Promise.resolve({ id }) });

function anfrage(methode: string, body?: unknown, url = URL_BASIS) {
  return new NextRequest(url, {
    method: methode,
    ...(body !== undefined && {
      body: typeof body === "string" ? body : JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    }),
  });
}

async function antwort(res: Response) {
  return { status: res.status, body: await res.json() };
}

const NEU_IPAD = { departmentKey: "IT", art: "JA_NEIN", bezeichnung: "Dienst-iPad (Lernmittel)", defaultDueDays: -5 };
const STUFE2_UND_VORSCHLAG = {
  ausgabeKennung: "Inventarnummer",
  rueckgabeKategorie: "IT_GERAET",
  beiAustritt: "RUECKGABE",
  vorschlagSchluessel: "IT_IPAD",
};

const audits = () => mockPrisma.auditLog.create.mock.calls.map((c) => c[0].data);

/** Vorschlagsschluessel, die „in der Datenbank“ stehen (fuer createManyAndReturn mit skipDuplicates). */
let vorhandeneVorschlaege: Set<string>;

beforeEach(() => {
  jest.clearAllMocks();
  vorhandeneVorschlaege = new Set();
  mockPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(mockPrisma));
  mockGetSession.mockResolvedValue(HR_LEITUNG);

  mockPrisma.ausstattungsPosition.findMany.mockResolvedValue([]);
  mockPrisma.ausstattungsPosition.findUnique.mockResolvedValue(null);
  mockPrisma.ausstattungsPosition.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) =>
    zeile({ id: "pos-neu", ...data }),
  );
  mockPrisma.ausstattungsPosition.update.mockImplementation(
    async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => zeile({ id: where.id, ...data }),
  );
  mockPrisma.ausstattungsPosition.delete.mockResolvedValue({});
  // Wie Postgres mit ON CONFLICT DO NOTHING … RETURNING: nur die wirklich angelegten Zeilen.
  mockPrisma.ausstattungsPosition.createManyAndReturn.mockImplementation(
    async ({ data }: { data: { vorschlagSchluessel: string; departmentKey: string; bezeichnung: string }[] }) => {
      const neu = [];
      for (const d of data) {
        if (vorhandeneVorschlaege.has(d.vorschlagSchluessel)) continue;
        vorhandeneVorschlaege.add(d.vorschlagSchluessel);
        neu.push({
          id: `id-${d.vorschlagSchluessel}`,
          vorschlagSchluessel: d.vorschlagSchluessel,
          departmentKey: d.departmentKey,
          organizationId: null,
          bezeichnung: d.bezeichnung,
        });
      }
      // Die Reihenfolge von RETURNING ist nicht zugesagt — der Dienst sortiert selbst.
      return neu.reverse();
    },
  );
  mockPrisma.ausstattungsAusblendung.createMany.mockResolvedValue({ count: 1 });
  mockPrisma.ausstattungsAusblendung.deleteMany.mockResolvedValue({ count: 1 });
  mockPrisma.onboardingAusstattung.count.mockResolvedValue(0);
  mockPrisma.organization.findMany.mockResolvedValue([]);
  mockPrisma.organization.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) =>
    [GYM, GS].includes(where.id) ? { id: where.id } : null,
  );
  mockPrisma.departmentConfig.findMany.mockResolvedValue([]);
  mockPrisma.checklistTemplateItem.findMany.mockResolvedValue([]);
  mockPrisma.smtpConfig.findUnique.mockResolvedValue(null);
  mockPrisma.auditLog.create.mockResolvedValue({});
});

// =============================================
// Rechte
// =============================================

describe("Rechte: nur SUPER_ADMIN und HR_LEITUNG", () => {
  it("HR_SACHBEARBEITER bekommt 403 bei allen sechs Methoden — ohne Datenbankzugriff", async () => {
    mockGetSession.mockResolvedValue(HR_SACHBEARBEITER);
    const ergebnisse = [
      await GET(anfrage("GET"), OHNE_PARAMS),
      await POST(anfrage("POST", NEU_IPAD), OHNE_PARAMS),
      await PATCH(anfrage("PATCH", { isActive: true }), mitId("pos-1")),
      await DELETE(anfrage("DELETE"), mitId("pos-1")),
      await PUT(anfrage("PUT", { organizationId: GYM, ausgeblendet: true }), mitId("pos-1")),
      await VORSCHLAEGE_POST(anfrage("POST"), OHNE_PARAMS),
    ];
    for (const res of ergebnisse) {
      expect(await antwort(res)).toEqual({ status: 403, body: { error: "Keine Berechtigung" } });
    }
    for (const methode of Object.values(mockPrisma.ausstattungsPosition)) expect(methode).not.toHaveBeenCalled();
    expect(mockPrisma.ausstattungsAusblendung.createMany).not.toHaveBeenCalled();
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("ohne Anmeldung 401", async () => {
    mockGetSession.mockResolvedValue(null);
    for (const res of [
      await GET(anfrage("GET"), OHNE_PARAMS),
      await POST(anfrage("POST", NEU_IPAD), OHNE_PARAMS),
      await VORSCHLAEGE_POST(anfrage("POST"), OHNE_PARAMS),
    ]) {
      expect(await antwort(res)).toEqual({ status: 401, body: { error: "Nicht authentifiziert" } });
    }
  });

  it("SUPER_ADMIN darf", async () => {
    mockGetSession.mockResolvedValue(SUPER_ADMIN);
    expect((await GET(anfrage("GET"), OHNE_PARAMS)).status).toBe(200);
  });
});

// =============================================
// POST: anlegen
// =============================================

describe("POST /api/settings/ausstattung", () => {
  it("legt immer AUSGESCHALTET an — auch mit isActive: true im Body", async () => {
    const { status, body } = await antwort(await POST(anfrage("POST", { ...NEU_IPAD, isActive: true }), OHNE_PARAMS));
    expect(status).toBe(201);
    expect(mockPrisma.ausstattungsPosition.create).toHaveBeenCalledTimes(1);
    const { data } = mockPrisma.ausstattungsPosition.create.mock.calls[0][0];
    expect(data.isActive).toBe(false);
    expect(body.data).toMatchObject({ id: "pos-neu", isActive: false, verwendung: 0, ausblendungen: [] });
    expect(body.data).not.toHaveProperty("_count");
  });

  it("schreibt genau die Positivliste — nie A4-Felder oder vorschlagSchluessel", async () => {
    await POST(anfrage("POST", { ...NEU_IPAD, ...STUFE2_UND_VORSCHLAG }), OHNE_PARAMS);
    const { data, include } = mockPrisma.ausstattungsPosition.create.mock.calls[0][0];
    expect(Object.keys(data).sort()).toEqual([...KATALOG_FELDER].sort());
    for (const feld of Object.keys(STUFE2_UND_VORSCHLAG)) expect(data).not.toHaveProperty(feld);
    expect(include).toEqual({
      ausblendungen: { select: { organizationId: true }, orderBy: { organizationId: "asc" } },
      _count: { select: { auswahlen: true } },
    });
  });

  it("protokolliert AUSSTATTUNG_POSITION_ANGELEGT mit nachher, im selben Commit", async () => {
    await POST(anfrage("POST", NEU_IPAD), OHNE_PARAMS);
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    const [eintrag] = audits();
    expect(eintrag).toMatchObject({
      userId: "u-hrl",
      processType: "SYSTEM",
      action: AUSSTATTUNG_AUDIT.POSITION_ANGELEGT,
      details: {
        positionId: "pos-neu",
        departmentKey: "IT",
        organizationId: null,
        bezeichnung: "Dienst-iPad (Lernmittel)",
        nachher: { departmentKey: "IT", art: "JA_NEIN", defaultDueDays: -5, isActive: false },
      },
    });
    expect(Object.keys(eintrag.details.nachher).sort()).toEqual([...KATALOG_FELDER].sort());
  });

  it("Zod-Fehler → 400, nichts angelegt", async () => {
    const res = await antwort(await POST(anfrage("POST", { departmentKey: "IT", art: "JA_NEIN" }), OHNE_PARAMS));
    expect(res).toEqual({ status: 400, body: { error: MELDUNGEN.BEZEICHNUNG_FEHLT } });
    const art = await antwort(await POST(anfrage("POST", { ...NEU_IPAD, art: "FREI" }), OHNE_PARAMS));
    expect(art).toEqual({ status: 400, body: { error: MELDUNGEN.ART_UNBEKANNT } });
    expect(mockPrisma.ausstattungsPosition.create).not.toHaveBeenCalled();
  });

  it.each([
    [{ ...NEU_IPAD, entgeltrelevant: true }, MELDUNGEN.ENTGELT_NUR_HR],
    [{ ...NEU_IPAD, departmentKey: "VORGESETZTER" }, MELDUNGEN.STELLE_NICHT_ERLAUBT],
    [{ ...NEU_IPAD, departmentKey: "MITARBEITER" }, MELDUNGEN.STELLE_NICHT_ERLAUBT],
    [{ ...NEU_IPAD, art: "AUSWAHL" }, MELDUNGEN.OPTIONEN_FEHLEN],
    [{ ...NEU_IPAD, art: "AUSWAHL", optionen: ["A"], vorausgewaehlteOptionen: ["B"] }, MELDUNGEN.VORAUSWAHL_NICHT_IN_OPTIONEN],
    [{ ...NEU_IPAD, einrichtungsarten: ["KITA"], organizationId: GYM }, MELDUNGEN.EINRICHTUNGSARTEN_NUR_ZENTRAL],
  ])("positionPruefen → 400 (%#)", async (eingabe, meldung) => {
    expect(await antwort(await POST(anfrage("POST", eingabe), OHNE_PARAMS))).toEqual({
      status: 400,
      body: { error: meldung },
    });
    expect(mockPrisma.ausstattungsPosition.create).not.toHaveBeenCalled();
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("entgeltrelevant mit Stelle HR ist erlaubt", async () => {
    const res = await POST(
      anfrage("POST", { departmentKey: "HR", art: "JA_NEIN", bezeichnung: "Jobticket", entgeltrelevant: true }),
      OHNE_PARAMS,
    );
    expect(res.status).toBe(201);
    expect(mockPrisma.ausstattungsPosition.create.mock.calls[0][0].data).toMatchObject({
      departmentKey: "HR",
      entgeltrelevant: true,
    });
  });

  it("unbekannter eigener Schluessel → 400; unter Einstellungen → Abteilungen angelegt → 201", async () => {
    const unbekannt = await antwort(await POST(anfrage("POST", { ...NEU_IPAD, departmentKey: "WERKSTATT" }), OHNE_PARAMS));
    expect(unbekannt).toEqual({
      status: 400,
      body: { error: "Unbekannte Zuständigkeit „WERKSTATT“. Bitte eine Abteilung aus Einstellungen → Abteilungen wählen." },
    });
    expect(mockPrisma.ausstattungsPosition.create).not.toHaveBeenCalled();

    mockPrisma.departmentConfig.findMany.mockResolvedValue([{ departmentKey: "WERKSTATT" }]);
    expect((await POST(anfrage("POST", { ...NEU_IPAD, departmentKey: "WERKSTATT" }), OHNE_PARAMS)).status).toBe(201);
  });

  it("feste Schluessel fragen die Abteilungen nicht ab", async () => {
    await POST(anfrage("POST", NEU_IPAD), OHNE_PARAMS);
    expect(mockPrisma.departmentConfig.findMany).not.toHaveBeenCalled();
  });

  it("unbekannte Stelle in „Sichtbar für“ einer Angabe → 400", async () => {
    const angabe = {
      departmentKey: "FACILITY",
      art: "ANGABE",
      angabeSchluessel: "UNTERRICHTSFAECHER",
      bezeichnung: "Unterrichtsfächer",
      sichtbarFuer: ["IT", "KANTINE"],
    };
    const res = await antwort(await POST(anfrage("POST", angabe), OHNE_PARAMS));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/KANTINE/);
  });

  it("Position einer Einrichtung: Einrichtung muss es geben (400 sonst)", async () => {
    expect((await POST(anfrage("POST", { ...NEU_IPAD, organizationId: GYM }), OHNE_PARAMS)).status).toBe(201);
    expect(mockPrisma.ausstattungsPosition.create.mock.calls[0][0].data.organizationId).toBe(GYM);
    expect(await antwort(await POST(anfrage("POST", { ...NEU_IPAD, organizationId: "org-weg" }), OHNE_PARAMS))).toEqual({
      status: 400,
      body: { error: MELDUNGEN.EINRICHTUNG_UNBEKANNT },
    });
    expect(mockPrisma.ausstattungsPosition.create).toHaveBeenCalledTimes(1);
  });

  it("Einrichtung mit NUL-Zeichen → 400 statt 500 (Postgres 22021), ohne Datenbankzugriff — auch im PATCH", async () => {
    expect(await antwort(await POST(anfrage("POST", { ...NEU_IPAD, organizationId: "\u0000" }), OHNE_PARAMS))).toEqual({
      status: 400,
      body: { error: MELDUNGEN.EINRICHTUNG_UNGUELTIG },
    });
    expect(await antwort(await PATCH(anfrage("PATCH", { organizationId: "gym\u0000" }), mitId("pos-1")))).toEqual({
      status: 400,
      body: { error: MELDUNGEN.EINRICHTUNG_UNGUELTIG },
    });
    expect(mockPrisma.organization.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.ausstattungsPosition.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.ausstattungsPosition.create).not.toHaveBeenCalled();
  });

  it("P2002 beim Anlegen → 409 statt 500", async () => {
    mockPrisma.ausstattungsPosition.create.mockRejectedValue(Object.assign(new Error("unique"), { code: "P2002" }));
    expect(await antwort(await POST(anfrage("POST", NEU_IPAD), OHNE_PARAMS))).toEqual({
      status: 409,
      body: { error: MELDUNGEN.POSITION_VORHANDEN },
    });
  });

  it("kaputtes JSON → 400 statt 500", async () => {
    expect(await antwort(await POST(anfrage("POST", "{kaputt"), OHNE_PARAMS))).toEqual({
      status: 400,
      body: { error: "Ungültiger Request-Body" },
    });
  });
});

// =============================================
// PATCH: aendern
// =============================================

describe("PATCH /api/settings/ausstattung/[id]", () => {
  const schluessel = () =>
    zeile({
      id: "pos-s",
      departmentKey: "FACILITY",
      art: "AUSWAHL",
      bezeichnung: "Schlüssel",
      optionen: ["Haupteingang", "Lehrerzimmer"],
      aufgabeTitel: "Schlüssel ausgeben",
      defaultDueDays: -3,
      isActive: false,
    });

  beforeEach(() => {
    mockPrisma.ausstattungsPosition.findUnique.mockResolvedValue(schluessel());
  });

  it("ohne echte Aenderung: 200, kein Schreiben, kein Protokoll", async () => {
    const { status, body } = await antwort(
      await PATCH(
        anfrage("PATCH", { bezeichnung: "Schlüssel", optionen: ["Haupteingang", "Lehrerzimmer"], isActive: false }),
        mitId("pos-s"),
      ),
    );
    expect(status).toBe(200);
    expect(body.data).toMatchObject({ id: "pos-s", bezeichnung: "Schlüssel", verwendung: 0 });
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockPrisma.ausstattungsPosition.update).not.toHaveBeenCalled();
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("schreibt nur geaenderte Felder, bedingt auf den gelesenen updatedAt; Protokoll mit von/nach", async () => {
    const { status, body } = await antwort(
      await PATCH(
        anfrage("PATCH", {
          bezeichnung: "Schlüssel",
          optionen: ["Haupteingang", "Lehrerzimmer", "Sporthalle"],
          defaultDueDays: -5,
          isActive: true,
        }),
        mitId("pos-s"),
      ),
    );
    expect(status).toBe(200);
    expect(body.data).toMatchObject({ id: "pos-s", isActive: true, defaultDueDays: -5 });
    expect(mockPrisma.ausstattungsPosition.update).toHaveBeenCalledWith({
      where: { id: "pos-s", updatedAt: ZEIT },
      data: { optionen: ["Haupteingang", "Lehrerzimmer", "Sporthalle"], defaultDueDays: -5, isActive: true },
      include: expect.any(Object),
    });
    expect(audits()).toEqual([
      {
        userId: "u-hrl",
        processType: "SYSTEM",
        action: AUSSTATTUNG_AUDIT.POSITION_GEAENDERT,
        details: {
          positionId: "pos-s",
          departmentKey: "FACILITY",
          organizationId: null,
          bezeichnung: "Schlüssel",
          aenderungen: {
            optionen: { von: ["Haupteingang", "Lehrerzimmer"], nach: ["Haupteingang", "Lehrerzimmer", "Sporthalle"] },
            defaultDueDays: { von: -3, nach: -5 },
            isActive: { von: false, nach: true },
          },
        },
      },
    ]);
  });

  it("A4-Felder und vorschlagSchluessel werden nie geschrieben", async () => {
    const nur = await antwort(await PATCH(anfrage("PATCH", STUFE2_UND_VORSCHLAG), mitId("pos-s")));
    expect(nur).toEqual({ status: 400, body: { error: MELDUNGEN.MINDESTENS_EIN_FELD } });

    await PATCH(anfrage("PATCH", { ...STUFE2_UND_VORSCHLAG, isActive: true }), mitId("pos-s"));
    expect(mockPrisma.ausstattungsPosition.update.mock.calls[0][0].data).toEqual({ isActive: true });
    expect(audits()[0].details.aenderungen).toEqual({ isActive: { von: false, nach: true } });
  });

  it("positionPruefen laeuft auf gespeicherter Zeile + Aenderung (400)", async () => {
    // Art wechselt auf Ja/Nein, die gespeicherten Optionen bleiben → ungueltig
    expect(await antwort(await PATCH(anfrage("PATCH", { art: "JA_NEIN" }), mitId("pos-s")))).toEqual({
      status: 400,
      body: { error: MELDUNGEN.OPTIONEN_NUR_AUSWAHL },
    });
    // Vorauswahl ausserhalb der gespeicherten Optionen
    expect(
      await antwort(await PATCH(anfrage("PATCH", { vorausgewaehlteOptionen: ["Sporthalle"] }), mitId("pos-s"))),
    ).toEqual({ status: 400, body: { error: MELDUNGEN.VORAUSWAHL_NICHT_IN_OPTIONEN } });
    // Entgeltbezug an einer Stelle ausser HR
    expect(await antwort(await PATCH(anfrage("PATCH", { entgeltrelevant: true }), mitId("pos-s")))).toEqual({
      status: 400,
      body: { error: MELDUNGEN.ENTGELT_NUR_HR },
    });
    expect(mockPrisma.ausstattungsPosition.update).not.toHaveBeenCalled();
    // Mit beidem zugleich gueltig
    const ok = await PATCH(anfrage("PATCH", { art: "JA_NEIN", optionen: [], aufgabeTitel: null }), mitId("pos-s"));
    expect(ok.status).toBe(200);
  });

  it("Stellenwechsel nach MITARBEITER bzw. VORGESETZTER → 400 (Regel 11)", async () => {
    for (const departmentKey of ["MITARBEITER", "VORGESETZTER"]) {
      expect(await antwort(await PATCH(anfrage("PATCH", { departmentKey }), mitId("pos-s")))).toEqual({
        status: 400,
        body: { error: MELDUNGEN.STELLE_NICHT_ERLAUBT },
      });
    }
  });

  it("zentral → Einrichtung: Ausblendungen fallen in derselben Transaktion weg", async () => {
    mockPrisma.ausstattungsPosition.findUnique.mockResolvedValue({
      ...schluessel(),
      ausblendungen: [{ organizationId: GS }],
    });
    mockPrisma.ausstattungsAusblendung.deleteMany.mockResolvedValue({ count: 1 });
    expect((await PATCH(anfrage("PATCH", { organizationId: GYM }), mitId("pos-s"))).status).toBe(200);
    expect(mockPrisma.ausstattungsAusblendung.deleteMany).toHaveBeenCalledWith({ where: { positionId: "pos-s" } });
    expect(mockPrisma.ausstattungsAusblendung.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(
      mockPrisma.ausstattungsPosition.update.mock.invocationCallOrder[0],
    );
    expect(audits()[0].details).toMatchObject({
      aenderungen: { organizationId: { von: null, nach: GYM } },
      ausblendungenEntfernt: 1,
    });
  });

  it("unbekannte Einrichtung → 400", async () => {
    expect(await antwort(await PATCH(anfrage("PATCH", { organizationId: "org-weg" }), mitId("pos-s")))).toEqual({
      status: 400,
      body: { error: MELDUNGEN.EINRICHTUNG_UNBEKANNT },
    });
  });

  it("unbekannte Position → 404", async () => {
    mockPrisma.ausstattungsPosition.findUnique.mockResolvedValue(null);
    expect(await antwort(await PATCH(anfrage("PATCH", { isActive: true }), mitId("weg")))).toEqual({
      status: 404,
      body: { error: MELDUNGEN.POSITION_NICHT_GEFUNDEN },
    });
  });

  it("P2025 (Bedingung verfehlt): inzwischen geaendert → 409, inzwischen geloescht → 404", async () => {
    mockPrisma.ausstattungsPosition.update.mockRejectedValue(Object.assign(new Error("weg"), { code: "P2025" }));
    mockPrisma.ausstattungsPosition.findUnique
      .mockResolvedValueOnce(schluessel())
      .mockResolvedValueOnce({ id: "pos-s" });
    expect(await antwort(await PATCH(anfrage("PATCH", { isActive: true }), mitId("pos-s")))).toEqual({
      status: 409,
      body: { error: MELDUNGEN.POSITION_INZWISCHEN_GEAENDERT, grund: "INZWISCHEN_GEAENDERT" },
    });

    mockPrisma.ausstattungsPosition.findUnique.mockResolvedValueOnce(schluessel()).mockResolvedValueOnce(null);
    expect(await antwort(await PATCH(anfrage("PATCH", { isActive: true }), mitId("pos-s")))).toEqual({
      status: 404,
      body: { error: MELDUNGEN.POSITION_NICHT_GEFUNDEN },
    });
  });

  it("leerer Rumpf → 400", async () => {
    expect(await antwort(await PATCH(anfrage("PATCH", {}), mitId("pos-s")))).toEqual({
      status: 400,
      body: { error: MELDUNGEN.MINDESTENS_EIN_FELD },
    });
  });

  // Regel 4a: Der Dialog schickt das ganze Formular samt dem Stand beim Oeffnen.
  describe("stand (updatedAt beim Oeffnen des Dialogs)", () => {
    // Admin B hat inzwischen „Turnhalle“ ergaenzt; A's Formular kennt sie nicht.
    const vonB = () =>
      zeile({
        ...schluessel(),
        optionen: ["Haupteingang", "Lehrerzimmer", "Turnhalle"],
        updatedAt: new Date("2026-10-12T09:30:00.000Z"),
      });
    const formularVonA = {
      bezeichnung: "Schlüssel",
      optionen: ["Haupteingang", "Lehrerzimmer"],
      aufgabeTitel: "Schlüssel aushändigen",
      stand: ZEIT.toISOString(),
    };

    it("veralteter Stand → 409 INZWISCHEN_GEAENDERT; nichts geschrieben, B's Option bleibt", async () => {
      mockPrisma.ausstattungsPosition.findUnique.mockResolvedValue(vonB());
      expect(await antwort(await PATCH(anfrage("PATCH", formularVonA), mitId("pos-s")))).toEqual({
        status: 409,
        body: { error: MELDUNGEN.POSITION_INZWISCHEN_GEAENDERT, grund: "INZWISCHEN_GEAENDERT" },
      });
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
      expect(mockPrisma.ausstattungsPosition.update).not.toHaveBeenCalled();
      expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
    });

    it("veralteter Stand → 409 auch dann, wenn das Formular dem neuen Stand zufaellig gleicht", async () => {
      mockPrisma.ausstattungsPosition.findUnique.mockResolvedValue(vonB());
      const res = await PATCH(
        anfrage("PATCH", { optionen: ["Haupteingang", "Lehrerzimmer", "Turnhalle"], stand: ZEIT.toISOString() }),
        mitId("pos-s"),
      );
      expect(res.status).toBe(409);
    });

    it("passender Stand → geschrieben wie bisher, bedingt auf denselben updatedAt; stand selbst wird nie geschrieben", async () => {
      const { status } = await antwort(await PATCH(anfrage("PATCH", formularVonA), mitId("pos-s")));
      expect(status).toBe(200);
      expect(mockPrisma.ausstattungsPosition.update).toHaveBeenCalledWith({
        where: { id: "pos-s", updatedAt: ZEIT },
        data: { aufgabeTitel: "Schlüssel aushändigen" },
        include: expect.any(Object),
      });
      expect(audits()[0].details.aenderungen).toEqual({
        aufgabeTitel: { von: "Schlüssel ausgeben", nach: "Schlüssel aushändigen" },
      });
    });

    it("stand allein ist keine Aenderung (400); kein Zeitstempel → 400", async () => {
      expect(await antwort(await PATCH(anfrage("PATCH", { stand: ZEIT.toISOString() }), mitId("pos-s")))).toEqual({
        status: 400,
        body: { error: MELDUNGEN.MINDESTENS_EIN_FELD },
      });
      expect(await antwort(await PATCH(anfrage("PATCH", { isActive: true, stand: "gestern" }), mitId("pos-s")))).toEqual({
        status: 400,
        body: { error: MELDUNGEN.STAND_UNGUELTIG },
      });
    });
  });
});

// =============================================
// DELETE
// =============================================

describe("DELETE /api/settings/ausstattung/[id]", () => {
  beforeEach(() => {
    mockPrisma.ausstattungsPosition.findUnique.mockResolvedValue(zeile({ id: "pos-7", vorschlagSchluessel: "IT_IPAD" }));
  });

  it("loescht eine unbenutzte Position und protokolliert vorher", async () => {
    expect(await antwort(await DELETE(anfrage("DELETE"), mitId("pos-7")))).toEqual({
      status: 200,
      body: { success: true },
    });
    expect(mockPrisma.onboardingAusstattung.count).toHaveBeenCalledWith({ where: { positionId: "pos-7" } });
    expect(mockPrisma.ausstattungsPosition.delete).toHaveBeenCalledWith({ where: { id: "pos-7" } });
    const [eintrag] = audits();
    expect(eintrag).toMatchObject({
      action: AUSSTATTUNG_AUDIT.POSITION_GELOESCHT,
      processType: "SYSTEM",
      details: {
        positionId: "pos-7",
        departmentKey: "IT",
        bezeichnung: "Dienst-iPad (Lernmittel)",
        vorschlagSchluessel: "IT_IPAD",
        vorher: { art: "JA_NEIN", defaultDueDays: -5, isActive: true },
      },
    });
  });

  it("in Verwendung → 409 IN_VERWENDUNG, nichts geloescht, kein Protokoll", async () => {
    mockPrisma.onboardingAusstattung.count.mockResolvedValue(3);
    expect(await antwort(await DELETE(anfrage("DELETE"), mitId("pos-7")))).toEqual({
      status: 409,
      body: { error: MELDUNGEN.IN_VERWENDUNG, grund: "IN_VERWENDUNG", verwendung: 3 },
    });
    expect(mockPrisma.ausstattungsPosition.delete).not.toHaveBeenCalled();
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("die Verwendung wird in der loeschenden Transaktion gezaehlt", async () => {
    await DELETE(anfrage("DELETE"), mitId("pos-7"));
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mockPrisma.onboardingAusstattung.count.mock.invocationCallOrder[0]).toBeLessThan(
      mockPrisma.ausstattungsPosition.delete.mock.invocationCallOrder[0],
    );
  });

  it("unbekannt → 404; zwischen Lesen und Loeschen verschwunden (P2025) → 404", async () => {
    mockPrisma.ausstattungsPosition.findUnique.mockResolvedValueOnce(null);
    expect((await DELETE(anfrage("DELETE"), mitId("weg"))).status).toBe(404);
    mockPrisma.ausstattungsPosition.delete.mockRejectedValue(Object.assign(new Error("weg"), { code: "P2025" }));
    expect(await antwort(await DELETE(anfrage("DELETE"), mitId("pos-7")))).toEqual({
      status: 404,
      body: { error: MELDUNGEN.POSITION_NICHT_GEFUNDEN },
    });
  });
});

// =============================================
// PUT …/ausblendung
// =============================================

describe("PUT /api/settings/ausstattung/[id]/ausblendung", () => {
  beforeEach(() => {
    mockPrisma.ausstattungsPosition.findUnique.mockResolvedValue({
      id: "pos-z",
      departmentKey: "VERWALTUNG",
      organizationId: null,
      bezeichnung: "Kopierkarte",
    });
  });

  it("blendet eine zentrale Position fuer eine Einrichtung aus (idempotent) und protokolliert den Wechsel", async () => {
    const { status, body } = await antwort(
      await PUT(anfrage("PUT", { organizationId: GYM, ausgeblendet: true }), mitId("pos-z")),
    );
    expect(status).toBe(200);
    expect(body).toEqual({ data: { positionId: "pos-z", organizationId: GYM, ausgeblendet: true, geaendert: true } });
    expect(mockPrisma.ausstattungsAusblendung.createMany).toHaveBeenCalledWith({
      data: [{ positionId: "pos-z", organizationId: GYM }],
      skipDuplicates: true,
    });
    expect(audits()).toEqual([
      {
        userId: "u-hrl",
        processType: "SYSTEM",
        action: AUSSTATTUNG_AUDIT.AUSBLENDUNG_GEAENDERT,
        details: {
          positionId: "pos-z",
          departmentKey: "VERWALTUNG",
          organizationId: null,
          bezeichnung: "Kopierkarte",
          einrichtungId: GYM,
          ausgeblendet: true,
        },
      },
    ]);
  });

  it("schon ausgeblendet: 200, kein Protokoll", async () => {
    mockPrisma.ausstattungsAusblendung.createMany.mockResolvedValue({ count: 0 });
    const { body } = await antwort(await PUT(anfrage("PUT", { organizationId: GYM, ausgeblendet: true }), mitId("pos-z")));
    expect(body.data.geaendert).toBe(false);
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("einblenden loescht die Ausblendung", async () => {
    const { body } = await antwort(await PUT(anfrage("PUT", { organizationId: GYM, ausgeblendet: false }), mitId("pos-z")));
    expect(body.data).toEqual({ positionId: "pos-z", organizationId: GYM, ausgeblendet: false, geaendert: true });
    expect(mockPrisma.ausstattungsAusblendung.deleteMany).toHaveBeenCalledWith({
      where: { positionId: "pos-z", organizationId: GYM },
    });
    expect(mockPrisma.ausstattungsAusblendung.createMany).not.toHaveBeenCalled();
  });

  it("nur zentrale Positionen → 400 bei einer Position einer Einrichtung", async () => {
    mockPrisma.ausstattungsPosition.findUnique.mockResolvedValue({
      id: "pos-e",
      departmentKey: "FACILITY",
      organizationId: GYM,
      bezeichnung: "Schlüssel",
    });
    expect(await antwort(await PUT(anfrage("PUT", { organizationId: GYM, ausgeblendet: true }), mitId("pos-e")))).toEqual({
      status: 400,
      body: { error: MELDUNGEN.AUSBLENDEN_NUR_ZENTRAL },
    });
    expect(mockPrisma.ausstattungsAusblendung.createMany).not.toHaveBeenCalled();
  });

  it("unbekannte Einrichtung → 400, unbekannte Position → 404, keine UUID → 400", async () => {
    const fremd = "33333333-3333-4333-8333-333333333333";
    expect(await antwort(await PUT(anfrage("PUT", { organizationId: fremd, ausgeblendet: true }), mitId("pos-z")))).toEqual({
      status: 400,
      body: { error: MELDUNGEN.EINRICHTUNG_UNBEKANNT },
    });
    mockPrisma.ausstattungsPosition.findUnique.mockResolvedValue(null);
    expect((await PUT(anfrage("PUT", { organizationId: GYM, ausgeblendet: true }), mitId("weg"))).status).toBe(404);
    expect(await antwort(await PUT(anfrage("PUT", { organizationId: "org-2", ausgeblendet: true }), mitId("pos-z")))).toEqual({
      status: 400,
      body: { error: MELDUNGEN.EINRICHTUNG_UNGUELTIG },
    });
  });
});

// =============================================
// POST …/vorschlaege
// =============================================

describe("POST /api/settings/ausstattung/vorschlaege", () => {
  it("legt alle Vorschlaege ausgeschaltet an, mit festem Schluessel; protokolliert Anzahl und jede angelegte Position", async () => {
    const { status, body } = await antwort(await VORSCHLAEGE_POST(anfrage("POST"), OHNE_PARAMS));
    expect(status).toBe(200);
    expect(body).toEqual({
      angelegt: VORSCHLAEGE.length,
      vorhanden: 0,
      meldung: `${VORSCHLAEGE.length} Vorschläge übernommen – ausgeschaltet. Bitte prüfen, Fälligkeiten eintragen und einschalten, was passt.`,
    });
    const { data, skipDuplicates, select } = mockPrisma.ausstattungsPosition.createManyAndReturn.mock.calls[0][0];
    expect(skipDuplicates).toBe(true);
    expect(select).toEqual({
      id: true,
      vorschlagSchluessel: true,
      departmentKey: true,
      organizationId: true,
      bezeichnung: true,
    });
    expect(data).toHaveLength(VORSCHLAEGE.length);
    for (const d of data) {
      expect(d.isActive).toBe(false);
      expect(d.organizationId).toBeNull();
      // Auch der Pflegehinweis eines Vorschlags ist kein Katalogfeld und wird nie geschrieben.
      expect(Object.keys(d).sort()).toEqual([...KATALOG_FELDER, "vorschlagSchluessel"].sort());
    }
    expect(data.map((d: { vorschlagSchluessel: string }) => d.vorschlagSchluessel)).toEqual(
      VORSCHLAEGE.map((v) => v.vorschlagSchluessel),
    );
    expect(audits()).toEqual([
      {
        userId: "u-hrl",
        processType: "SYSTEM",
        action: AUSSTATTUNG_AUDIT.VORSCHLAEGE_UEBERNOMMEN,
        details: {
          angelegt: VORSCHLAEGE.length,
          vorhanden: 0,
          // Regel 18: je angelegter Position ID, Schluessel, Stelle und Titel — in der Reihenfolge der Vorschlaege.
          positionen: VORSCHLAEGE.map((v) => ({
            positionId: `id-${v.vorschlagSchluessel}`,
            departmentKey: v.departmentKey,
            organizationId: null,
            bezeichnung: v.bezeichnung,
            vorschlagSchluessel: v.vorschlagSchluessel,
          })),
        },
      },
    ]);
  });

  it("zweimal: der zweite Aufruf legt nichts an (angelegt 0) und protokolliert nichts", async () => {
    await VORSCHLAEGE_POST(anfrage("POST"), OHNE_PARAMS);
    const zweiter = await antwort(await VORSCHLAEGE_POST(anfrage("POST"), OHNE_PARAMS));
    expect(zweiter).toEqual({
      status: 200,
      body: { angelegt: 0, vorhanden: VORSCHLAEGE.length, meldung: MELDUNGEN.VORSCHLAEGE_ALLE_VORHANDEN },
    });
    expect(mockPrisma.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it("nach dem Loeschen eines Vorschlags legt der naechste Aufruf genau ihn wieder an — und protokolliert genau ihn", async () => {
    await VORSCHLAEGE_POST(anfrage("POST"), OHNE_PARAMS);
    vorhandeneVorschlaege.delete("IT_IPAD");
    const { body } = await antwort(await VORSCHLAEGE_POST(anfrage("POST"), OHNE_PARAMS));
    expect(body).toMatchObject({ angelegt: 1, vorhanden: VORSCHLAEGE.length - 1 });
    expect(audits()[1].details).toEqual({
      angelegt: 1,
      vorhanden: VORSCHLAEGE.length - 1,
      positionen: [
        {
          positionId: "id-IT_IPAD",
          departmentKey: "IT",
          organizationId: null,
          bezeichnung: "Dienst-iPad (Lernmittel)",
          vorschlagSchluessel: "IT_IPAD",
        },
      ],
    });
  });

  it("gibt die Vorschlags-Listen nicht heraus (jede Zeile hat eigene Arrays)", async () => {
    await VORSCHLAEGE_POST(anfrage("POST"), OHNE_PARAMS);
    const { data } = mockPrisma.ausstattungsPosition.createManyAndReturn.mock.calls[0][0];
    const zugaenge = VORSCHLAEGE.find((v) => v.vorschlagSchluessel === "IT_ZUGAENGE");
    const geschrieben = data.find((d: { vorschlagSchluessel: string }) => d.vorschlagSchluessel === "IT_ZUGAENGE");
    expect(geschrieben.optionen).toEqual(zugaenge?.optionen);
    expect(geschrieben.optionen).not.toBe(zugaenge?.optionen);
  });
});

// =============================================
// GET: Katalog und Warnungen
// =============================================

describe("GET /api/settings/ausstattung", () => {
  beforeEach(() => {
    mockPrisma.ausstattungsPosition.findMany.mockResolvedValue([
      zeile({
        id: "pos-hr",
        departmentKey: "HR",
        bezeichnung: "Jobticket",
        entgeltrelevant: true,
      }),
      zeile({
        id: "pos-spind",
        departmentKey: "FACILITY",
        bezeichnung: "Spind",
        ausblendungen: [{ organizationId: GS }],
        _count: { auswahlen: 2 },
      }),
      zeile({ id: "pos-ipad", departmentKey: "IT", bezeichnung: "Dienst-iPad (Lernmittel)", isActive: false }),
      zeile({
        id: "pos-schluessel",
        departmentKey: "FACILITY",
        art: "AUSWAHL",
        bezeichnung: "Schlüssel",
        optionen: ["Haupteingang"],
        organizationId: GYM,
        orderIndex: 10,
      }),
    ]);
    mockPrisma.organization.findMany.mockResolvedValue([
      { id: GYM, name: "Gymnasium Minden", type: "GYMNASIUM", isActive: true },
      { id: GS, name: "Grundschule Minden", type: "GRUNDSCHULE", isActive: true },
    ]);
    mockPrisma.departmentConfig.findMany.mockResolvedValue([
      { departmentKey: "IT", departmentName: "IT-Support FES", email: "it@extern.de", organizationId: null, isActive: true },
      {
        departmentKey: "FACILITY",
        departmentName: "Hausmeister GYM",
        email: "hm@credo.de",
        organizationId: GYM,
        isActive: true,
      },
    ]);
    mockPrisma.checklistTemplateItem.findMany.mockResolvedValue([
      {
        id: "tp-1",
        templateId: "t-on",
        title: "Spind zuweisen",
        defaultAssignee: "FACILITY",
        template: { name: "Standard-Einstellung (TV-L)" },
      },
      {
        id: "tp-2",
        templateId: "t-off",
        title: "Spind räumen",
        defaultAssignee: "FACILITY",
        template: { name: "Offboarding: Standard" },
      },
    ]);
    mockPrisma.smtpConfig.findUnique.mockResolvedValue({ allowedRecipientDomains: "credo.de" });
  });

  it("liefert Positionen (sortiert, mit Ausblendungen und Verwendung), Einrichtungen und Stellen", async () => {
    const { status, body } = await antwort(await GET(anfrage("GET"), OHNE_PARAMS));
    expect(status).toBe(200);
    const { positionen, einrichtungen, stellen } = body.data;
    expect(positionen.map((p: { id: string }) => p.id)).toEqual(["pos-ipad", "pos-spind", "pos-schluessel", "pos-hr"]);
    expect(positionen[1]).toMatchObject({ ausblendungen: [{ organizationId: GS }], verwendung: 2 });
    expect(positionen[1]).not.toHaveProperty("_count");
    // Der Stand fuer den Dialog „Bearbeiten“ (Regel 4a): updatedAt als ISO-Zeitstempel.
    expect(positionen[1].updatedAt).toBe(ZEIT.toISOString());
    expect(einrichtungen).toHaveLength(2);
    expect(stellen[0]).toEqual({ key: "IT", name: "IT-Support FES" });
    expect(stellen.map((s: { key: string }) => s.key)).not.toContain("VORGESETZTER");
    expect(stellen[stellen.length - 1]).toEqual({ key: "HR", name: "Personalabteilung" });
    expect(mockPrisma.ausstattungsPosition.findMany).toHaveBeenCalledWith({
      include: {
        ausblendungen: { select: { organizationId: true }, orderBy: { organizationId: "asc" } },
        _count: { select: { auswahlen: true } },
      },
    });
  });

  it("Warnungen: Adresslücken, ähnliche Vorlagenpunkte (nur Onboarding), Adressen außerhalb der Freigabeliste", async () => {
    const { body } = await antwort(await GET(anfrage("GET"), OHNE_PARAMS));
    const { adressLuecken, aehnlicheVorlagenpunkte, ausserhalbFreigabe } = body.data.warnungen;
    // Spind (aktiv, zentral, FACILITY): GYM hat eine Adresse, GS hat die Position ausgeblendet → keine Lücke.
    // iPad ist aus; HR braucht keine Adresse; Schlüssel gilt nur am GYM (Adresse da).
    expect(adressLuecken).toEqual([]);
    expect(aehnlicheVorlagenpunkte).toEqual([
      expect.objectContaining({
        positionId: "pos-spind",
        templateId: "t-on",
        punktId: "tp-1",
        punktTitel: "Spind zuweisen",
        wort: "spind",
      }),
    ]);
    expect(ausserhalbFreigabe).toEqual([
      expect.objectContaining({ departmentKey: "IT", email: "it@extern.de", organizationId: null }),
    ]);
    expect(mockPrisma.checklistTemplateItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { template: { isActive: true, questionnaireType: { not: null } } } }),
    );
  });

  it("Adresslücke, sobald eine Stelle an einer Einrichtung keine Adresse hat", async () => {
    mockPrisma.departmentConfig.findMany.mockResolvedValue([]);
    const { body } = await antwort(await GET(anfrage("GET"), OHNE_PARAMS));
    expect(
      body.data.warnungen.adressLuecken.map((l: { positionId: string; organizationId: string }) => [
        l.positionId,
        l.organizationId,
      ]),
    ).toEqual([
      ["pos-spind", GYM],
      ["pos-schluessel", GYM],
    ]);
  });

  it("ohne Freigabeliste keine Warnung „außerhalb der Freigabeliste“", async () => {
    mockPrisma.smtpConfig.findUnique.mockResolvedValue({ allowedRecipientDomains: "" });
    const { body } = await antwort(await GET(anfrage("GET"), OHNE_PARAMS));
    expect(body.data.warnungen.ausserhalbFreigabe).toEqual([]);
  });

  it("schreibt nichts", async () => {
    await GET(anfrage("GET"), OHNE_PARAMS);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });
});
