/**
 * Tests: Schritt „Ausstattung & Zugänge" im Formular der Fuehrungskraft
 * (/api/modalitaeten/[token], Feinplan S8, Regeln 2, 4 und 5)
 *
 * Der Link ist ein Inhaber-Token ohne Anmeldung. Deshalb:
 *   - GET liefert `ausstattung` nur mit dem Merker `mitAusstattung` (sonst
 *     `null`, ohne den Katalog zu lesen), nur die EIGENE Wahl (quelle
 *     FUEHRUNGSKRAFT), nie den Hinweis fuer die Stelle — und schreibt nichts.
 *   - PUT prueft jede Wahl gegen den Katalogausschnitt GENAU DIESES Vorgangs
 *     (fremde/unbekannte Position oder Option = 400), ersetzt nur die eigenen
 *     Zeilen, sperrt zuerst den Vorgang bedingt auf die offene Spur (409 nach
 *     der Abgabe) und kappt `currentStep` (F21).
 *
 * Muster wie modalitaeten.test.ts: Prisma als Mock, der sich selbst als `tx`
 * durchreicht. Der Dienst (src/lib/ausstattung-dienst.ts) und der Katalog
 * (src/lib/ausstattung-katalog.ts) laufen ECHT — nur die Tabellen sind
 * gemockt; `findMany` beachtet das WHERE (`onboardingId`, `quelle`), damit der
 * Test belegt, dass die Route nur eigene Zeilen liest.
 */

const mockPrisma = {
  supervisorData: { upsert: jest.fn(), update: jest.fn() },
  supervisorKostenstelle: { deleteMany: jest.fn(), createMany: jest.fn() },
  onboardingProcess: { update: jest.fn(), updateMany: jest.fn(), findUniqueOrThrow: jest.fn(), findUnique: jest.fn() },
  auditLog: { create: jest.fn() },
  organization: { findMany: jest.fn(), findUnique: jest.fn() },
  ausstattungsPosition: { findMany: jest.fn() },
  ausstattungsAusblendung: { findMany: jest.fn() },
  departmentConfig: { findMany: jest.fn() },
  onboardingAusstattung: { findMany: jest.fn(), deleteMany: jest.fn(), createMany: jest.fn() },
  onboardingStellenHinweis: { findMany: jest.fn(), deleteMany: jest.fn(), createMany: jest.fn() },
  $transaction: jest.fn(),
};
const mockValidate = jest.fn();

jest.mock("@/lib/db", () => ({ prisma: mockPrisma }));
jest.mock("@/lib/auth", () => ({
  validateSupervisorToken: (...args: unknown[]) => mockValidate(...args),
}));
jest.mock("@/lib/rate-limit", () => ({
  tokenRateLimiter: { check: () => ({ allowed: true }) },
  getClientIp: () => "127.0.0.1",
  getClientIpOrNull: () => "127.0.0.1",
  createRateLimiter: () => ({ check: () => ({ allowed: true }) }),
}));
jest.mock("@/lib/n8n", () => ({ triggerN8nWebhook: jest.fn() }));

import { GET, PUT } from "@/app/api/modalitaeten/[token]/route";
import { NextRequest } from "next/server";
import { BEMERKUNG_HINWEIS, MELDUNGEN } from "@/lib/ausstattung";

const TOKEN = "supervisor-token-1234567890";
const params = () => Promise.resolve({ token: TOKEN });

const IPAD = "11111111-1111-4111-8111-111111111111";
const SCHLUESSEL = "22222222-2222-4222-8222-222222222222";
const FAECHER = "33333333-3333-4333-8333-333333333333";
const ALT = "44444444-4444-4444-8444-444444444444";
const FREMD = "55555555-5555-4555-8555-555555555555";

/** Eine Katalogzeile, wie `ausstattungsPosition.findMany` sie liefert. */
function position(teil: Record<string, unknown>) {
  return {
    id: IPAD,
    departmentKey: "IT",
    organizationId: null,
    einrichtungsarten: [] as string[],
    art: "JA_NEIN",
    angabeSchluessel: null,
    bezeichnung: "Dienst-iPad (Lernmittel)",
    hinweisFuehrungskraft: "Für Lehrkräfte mit eigenem Unterricht.",
    hinweisStelle: "Mit MDM-Profil ausgeben.",
    optionen: [] as string[],
    vorausgewaehlt: false,
    vorausgewaehlteOptionen: [] as string[],
    bemerkungAnbieten: true,
    bemerkungPlatzhalter: "z. B. mit Stift",
    aufgabeTitel: null,
    defaultDueDays: -5,
    personengruppen: [] as string[],
    sichtbarFuer: [] as string[],
    entgeltrelevant: false,
    ausgabeKennung: null,
    rueckgabeKategorie: null,
    beiAustritt: null,
    vorschlagSchluessel: null,
    isActive: true,
    orderIndex: 10,
    ...teil,
  };
}

const KATALOG = [
  position({}),
  position({
    id: SCHLUESSEL,
    departmentKey: "FACILITY",
    art: "AUSWAHL",
    bezeichnung: "Schlüssel",
    hinweisFuehrungskraft: null,
    hinweisStelle: null,
    optionen: ["Haupteingang", "Lehrerzimmer"],
    vorausgewaehlteOptionen: ["Haupteingang"],
    aufgabeTitel: "Schlüssel ausgeben",
    defaultDueDays: -3,
    orderIndex: 20,
  }),
  position({
    id: FAECHER,
    departmentKey: "FACILITY",
    art: "ANGABE",
    angabeSchluessel: "UNTERRICHTSFAECHER",
    bezeichnung: "Unterrichtsfächer",
    hinweisFuehrungskraft: null,
    hinweisStelle: null,
    bemerkungAnbieten: false,
    bemerkungPlatzhalter: null,
    defaultDueDays: null,
    sichtbarFuer: ["IT"],
    orderIndex: 30,
  }),
];

/** Eine gespeicherte Zeile in `onboarding_ausstattung`. */
function zeile(teil: Record<string, unknown>) {
  return {
    onboardingId: "ob1",
    positionId: IPAD,
    departmentKey: "IT",
    art: "JA_NEIN",
    angabeSchluessel: null,
    bezeichnung: "Dienst-iPad (Lernmittel)",
    aufgabeTitel: "Dienst-iPad (Lernmittel) bereitstellen",
    hinweisStelle: "Mit MDM-Profil ausgeben.",
    relativeDueDays: -5,
    sichtbarFuer: [] as string[],
    ausgabeKennung: null,
    rueckgabeKategorie: null,
    beiAustritt: null,
    reihenfolge: 10,
    auswahl: [] as string[],
    angabe: null,
    bemerkung: null,
    bemerkungQuelle: null,
    quelle: "FUEHRUNGSKRAFT",
    gestrichenAm: null,
    ...teil,
  };
}

/** Was in den beiden Vorgangstabellen steht; `findMany` filtert nach WHERE. */
let zeilen: ReturnType<typeof zeile>[] = [];
let hinweise: { onboardingId: string; departmentKey: string; text: string; quelle: string }[] = [];

type Wo = { where: { onboardingId?: string; quelle?: string } };
const passt = (z: { onboardingId: string; quelle: string }, { where }: Wo) =>
  (where.onboardingId === undefined || z.onboardingId === where.onboardingId) &&
  (where.quelle === undefined || z.quelle === where.quelle);

const SUPERVISOR_DATA = {
  id: "sd1",
  currentStep: 4,
  isComplete: false,
  mitAusstattung: true,
  ausstattungGespeichertAm: null,
  kostenstellen: [],
};

function vorgang(supervisorData: Record<string, unknown> | null = SUPERVISOR_DATA, extra: Record<string, unknown> = {}) {
  return {
    valid: true,
    onboarding: {
      id: "ob1",
      status: "IN_PROGRESS",
      submittedAt: null,
      supervisorSubmittedAt: null,
      supervisorToken: TOKEN,
      email: "neu@example.de",
      supervisorEmail: "chef@example.de",
      organizationId: "org-gym",
      arbeitsortId: null,
      questionnaireType: "STANDARD",
      processType: "EINSTELLUNG",
      firstName: null,
      lastName: null,
      organization: { name: "FES Gymnasium", mandantNumber: "10", type: "GYMNASIUM" },
      personalData: { firstName: null, lastName: null },
      supervisorData,
      ...extra,
    },
  };
}

function put(body: Record<string, unknown>) {
  return PUT(
    new NextRequest(`http://localhost:3000/api/modalitaeten/${TOKEN}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: params() },
  );
}

async function laden() {
  const res = await GET(new NextRequest(`http://localhost:3000/api/modalitaeten/${TOKEN}`), { params: params() });
  return res.json();
}

/** Jede schreibende Methode aller Mocks — der GET darf keine davon rufen. */
function schreibendeAufrufe(): string[] {
  const namen: string[] = [];
  for (const [modell, methoden] of Object.entries(mockPrisma)) {
    if (typeof methoden === "function") continue;
    for (const [methode, fn] of Object.entries(methoden as Record<string, jest.Mock>)) {
      if (/^(create|update|upsert|delete)/.test(methode) && fn.mock.calls.length > 0) namen.push(`${modell}.${methode}`);
    }
  }
  return namen;
}

beforeEach(() => {
  jest.clearAllMocks();
  zeilen = [];
  hinweise = [];
  mockValidate.mockResolvedValue(vorgang());
  mockPrisma.supervisorData.upsert.mockResolvedValue({ id: "sd1" });
  mockPrisma.supervisorData.update.mockResolvedValue({});
  mockPrisma.onboardingProcess.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.organization.findMany.mockResolvedValue([]);
  mockPrisma.organization.findUnique.mockResolvedValue({ type: "GYMNASIUM" });
  mockPrisma.ausstattungsPosition.findMany.mockResolvedValue(KATALOG);
  mockPrisma.ausstattungsAusblendung.findMany.mockResolvedValue([]);
  mockPrisma.departmentConfig.findMany.mockResolvedValue([
    { departmentKey: "IT", departmentName: "IT-Support FES", email: "it@credo.de", organizationId: null, isActive: true },
    { departmentKey: "FACILITY", departmentName: "Hausmeister", email: "haus@credo.de", organizationId: null, isActive: true },
  ]);
  mockPrisma.onboardingAusstattung.findMany.mockImplementation(async (arg: Wo) => zeilen.filter((z) => passt(z, arg)));
  mockPrisma.onboardingAusstattung.deleteMany.mockResolvedValue({ count: 0 });
  mockPrisma.onboardingAusstattung.createMany.mockResolvedValue({ count: 0 });
  mockPrisma.onboardingStellenHinweis.findMany.mockImplementation(async (arg: Wo) =>
    hinweise.filter((h) => passt(h, arg)).map((h) => ({ departmentKey: h.departmentKey, text: h.text })),
  );
  mockPrisma.onboardingStellenHinweis.deleteMany.mockResolvedValue({ count: 0 });
  mockPrisma.onboardingStellenHinweis.createMany.mockResolvedValue({ count: 0 });
  mockPrisma.$transaction.mockImplementation((arg: unknown) =>
    typeof arg === "function"
      ? (arg as (tx: typeof mockPrisma) => unknown)(mockPrisma)
      : Promise.all(arg as unknown[]),
  );
});

// =============================================
// GET
// =============================================

describe("GET – Schritt „Ausstattung & Zugänge“", () => {
  it("ohne Merker: ausstattung null — ohne den Katalog oder die Vorgangstabellen zu lesen", async () => {
    for (const sd of [null, { ...SUPERVISOR_DATA, mitAusstattung: false }, { ...SUPERVISOR_DATA, mitAusstattung: null }]) {
      mockValidate.mockResolvedValue(vorgang(sd));
      expect((await laden()).ausstattung).toBeNull();
    }
    expect(mockPrisma.ausstattungsPosition.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.onboardingAusstattung.findMany).not.toHaveBeenCalled();
  });

  it("mit Merker: Ausschnitt nach Stellen und die eigene Wahl — ohne Hinweis fuer die Stelle, ohne HR-Zeilen", async () => {
    zeilen = [
      zeile({ bemerkung: "Mit Stift und Hülle", bemerkungQuelle: "FUEHRUNGSKRAFT" }),
      // Was HR ergaenzt hat, sieht die Fuehrungskraft nie (Regel 5).
      zeile({
        positionId: SCHLUESSEL,
        departmentKey: "FACILITY",
        art: "AUSWAHL",
        bezeichnung: "Schlüssel",
        aufgabeTitel: "Schlüssel ausgeben",
        hinweisStelle: null,
        auswahl: ["Lehrerzimmer"],
        bemerkung: "Von HR ergänzt",
        bemerkungQuelle: "HR",
        quelle: "HR",
      }),
      // Ein fremder Vorgang.
      zeile({ onboardingId: "ob2", bemerkung: "Fremder Vorgang" }),
    ];
    hinweise = [
      { onboardingId: "ob1", departmentKey: "IT", text: "Monitor bitte höhenverstellbar", quelle: "FUEHRUNGSKRAFT" },
      { onboardingId: "ob1", departmentKey: "FACILITY", text: "Hinweis von HR", quelle: "HR" },
    ];

    const daten = await laden();

    expect(daten.ausstattung.gruppen.map((g: { departmentKey: string }) => g.departmentKey)).toEqual(["IT", "FACILITY"]);
    expect(daten.ausstattung.gruppen[0]).toMatchObject({
      stelleName: "IT-Support FES",
      positionen: [{ id: IPAD, art: "JA_NEIN", hinweisFuehrungskraft: "Für Lehrkräfte mit eigenem Unterricht." }],
    });
    expect(daten.ausstattung.wahl).toEqual([{ positionId: IPAD, gewaehlt: true, bemerkung: "Mit Stift und Hülle" }]);
    expect(daten.ausstattung.hinweise).toEqual([{ departmentKey: "IT", hinweis: "Monitor bitte höhenverstellbar" }]);
    expect(daten.ausstattung.bemerkungHinweis).toBe(BEMERKUNG_HINWEIS);

    const text = JSON.stringify(daten);
    expect(text).not.toContain("Mit MDM-Profil");
    expect(text).not.toContain("hinweisStelle");
    expect(text).not.toContain("Von HR ergänzt");
    expect(text).not.toContain("Hinweis von HR");
    expect(text).not.toContain("Fremder Vorgang");
    expect(mockPrisma.onboardingAusstattung.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { onboardingId: "ob1", quelle: "FUEHRUNGSKRAFT" } }),
    );
    expect(mockPrisma.onboardingStellenHinweis.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { onboardingId: "ob1", quelle: "FUEHRUNGSKRAFT" } }),
    );
  });

  it("schreibt nichts", async () => {
    zeilen = [zeile({ bemerkung: "Mit Stift" })];
    await laden();
    expect(schreibendeAufrufe()).toEqual([]);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("Vorauswahl nur, solange der Schritt nie gespeichert wurde (F9)", async () => {
    expect((await laden()).ausstattung.vorausgewaehltAnwenden).toBe(true);
    mockValidate.mockResolvedValue(vorgang({ ...SUPERVISOR_DATA, ausstattungGespeichertAm: new Date("2027-01-05T09:00:00Z") }));
    expect((await laden()).ausstattung.vorausgewaehltAnwenden).toBe(false);
  });

  it("nach der eigenen Abgabe: null — das Formular zeigt nur noch „Vielen Dank“, ab da bearbeitet HR", async () => {
    mockValidate.mockResolvedValue(vorgang(SUPERVISOR_DATA, { supervisorSubmittedAt: new Date("2027-01-06T09:00:00Z") }));
    expect((await laden()).ausstattung).toBeNull();
    mockValidate.mockResolvedValue(vorgang(SUPERVISOR_DATA, { status: "REVIEWED" }));
    expect((await laden()).ausstattung).toBeNull();
    expect(mockPrisma.ausstattungsPosition.findMany).not.toHaveBeenCalled();
  });

  it("der Katalog wird am Arbeitsort gelesen, nicht an der Einrichtung", async () => {
    mockValidate.mockResolvedValue(vorgang(SUPERVISOR_DATA, { arbeitsortId: "org-kita" }));
    await laden();
    expect(mockPrisma.organization.findUnique).toHaveBeenCalledWith({ where: { id: "org-kita" }, select: { type: true } });
  });

  it("eine gewaehlte Position, deren Art der Katalog seitdem geaendert hat: gespeichert und markiert, wie sie abgegeben wuerde", async () => {
    // Gespeichert als Auswahl; heute fuehrt der Katalog „Schlüssel“ als Ja/Nein.
    mockPrisma.ausstattungsPosition.findMany.mockResolvedValue(
      KATALOG.map((p) => (p.id === SCHLUESSEL ? { ...p, art: "JA_NEIN", optionen: [], vorausgewaehlteOptionen: [] } : p)),
    );
    zeilen = [
      zeile({
        positionId: SCHLUESSEL,
        departmentKey: "FACILITY",
        art: "AUSWAHL",
        bezeichnung: "Schlüssel",
        aufgabeTitel: "Schlüssel ausgeben",
        hinweisStelle: null,
        auswahl: ["Lehrerzimmer"],
        reihenfolge: 20,
      }),
    ];

    const daten = await laden();

    const facility = daten.ausstattung.gruppen.find((g: { departmentKey: string }) => g.departmentKey === "FACILITY");
    const schluessel = facility.positionen.filter((p: { id: string }) => p.id === SCHLUESSEL);
    expect(schluessel).toHaveLength(1);
    expect(schluessel[0]).toMatchObject({
      art: "AUSWAHL",
      optionen: ["Lehrerzimmer"],
      nichtMehrImKatalog: true,
      imKatalogGeaendert: true,
    });
    expect(daten.ausstattung.wahl).toEqual([{ positionId: SCHLUESSEL, auswahl: ["Lehrerzimmer"] }]);
  });
});

// =============================================
// PUT
// =============================================

describe("PUT – Schritt „Ausstattung & Zugänge“", () => {
  it("speichert die Wahl als Momentaufnahme mit quelle FUEHRUNGSKRAFT und setzt ausstattungGespeichertAm", async () => {
    const res = await put({
      ausstattung: [
        { positionId: IPAD, gewaehlt: true, bemerkung: "Mit Stift\r\nund Hülle" },
        { positionId: SCHLUESSEL, auswahl: ["Lehrerzimmer", "Haupteingang"] },
        { positionId: FAECHER, angabe: "Chemie, Sport" },
      ],
      hinweise: [
        { departmentKey: "IT", hinweis: "Monitor bitte höhenverstellbar" },
        { departmentKey: "FACILITY", hinweis: "" },
      ],
      currentStep: 5,
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, currentStep: 5 });
    expect(mockPrisma.onboardingAusstattung.deleteMany).toHaveBeenCalledWith({
      where: { onboardingId: "ob1", quelle: "FUEHRUNGSKRAFT" },
    });
    expect(mockPrisma.onboardingAusstattung.createMany.mock.calls[0][0].data).toEqual([
      {
        onboardingId: "ob1",
        positionId: IPAD,
        departmentKey: "IT",
        art: "JA_NEIN",
        angabeSchluessel: null,
        bezeichnung: "Dienst-iPad (Lernmittel)",
        aufgabeTitel: "Dienst-iPad (Lernmittel) bereitstellen",
        hinweisStelle: "Mit MDM-Profil ausgeben.",
        relativeDueDays: -5,
        sichtbarFuer: [],
        ausgabeKennung: null,
        rueckgabeKategorie: null,
        beiAustritt: null,
        reihenfolge: 10,
        auswahl: [],
        angabe: null,
        // Browser schicken \r\n; gespeichert wird \n.
        bemerkung: "Mit Stift\nund Hülle",
        bemerkungQuelle: "FUEHRUNGSKRAFT",
        quelle: "FUEHRUNGSKRAFT",
      },
      expect.objectContaining({
        positionId: SCHLUESSEL,
        art: "AUSWAHL",
        aufgabeTitel: "Schlüssel ausgeben",
        relativeDueDays: -3,
        auswahl: ["Haupteingang", "Lehrerzimmer"],
        bemerkung: null,
        bemerkungQuelle: null,
        quelle: "FUEHRUNGSKRAFT",
      }),
      expect.objectContaining({
        positionId: FAECHER,
        art: "ANGABE",
        aufgabeTitel: "",
        relativeDueDays: null,
        sichtbarFuer: ["IT"],
        angabe: "Chemie, Sport",
        quelle: "FUEHRUNGSKRAFT",
      }),
    ]);
    expect(mockPrisma.onboardingStellenHinweis.deleteMany).toHaveBeenCalledWith({
      where: { onboardingId: "ob1", quelle: "FUEHRUNGSKRAFT" },
    });
    // Der leere Hinweis wird keine Zeile.
    expect(mockPrisma.onboardingStellenHinweis.createMany).toHaveBeenCalledWith({
      data: [{ onboardingId: "ob1", departmentKey: "IT", text: "Monitor bitte höhenverstellbar", quelle: "FUEHRUNGSKRAFT" }],
    });
    const gespeichert = mockPrisma.supervisorData.update.mock.calls[0][0];
    expect(gespeichert.where).toEqual({ onboardingId: "ob1" });
    expect(gespeichert.data.ausstattungGespeichertAm).toBeInstanceOf(Date);
    // A4 (E-A36): Der Katalog fuehrt hier keine Position mit „Beim Austritt“.
    expect(gespeichert.data.ausgabenAngeboten).toBe(false);
  });

  it("A4 (E-A36): Merker ausgabenAngeboten aus dem gelesenen Ausschnitt — auch, wenn die Position nicht gewaehlt ist", async () => {
    mockPrisma.ausstattungsPosition.findMany.mockResolvedValue([
      KATALOG[0],
      { ...KATALOG[1], beiAustritt: "RUECKGABE", rueckgabeKategorie: "SCHLUESSEL", ausgabeKennung: "Schlüsselnummer" },
      KATALOG[2],
    ]);
    const res = await put({ ausstattung: [{ positionId: IPAD, gewaehlt: true }], currentStep: 5 });
    expect(res.status).toBe(200);
    expect(mockPrisma.supervisorData.update.mock.calls[0][0].data).toEqual({
      ausstattungGespeichertAm: expect.any(Date),
      ausgabenAngeboten: true,
    });
    // Eine Angabe zaehlt nie (sie wird nicht ausgegeben), NICHTS ebenso wenig.
    jest.clearAllMocks();
    mockPrisma.ausstattungsPosition.findMany.mockResolvedValue([
      { ...KATALOG[0], beiAustritt: "NICHTS" },
      KATALOG[1],
      KATALOG[2],
    ]);
    await put({ ausstattung: [], currentStep: 5 });
    expect(mockPrisma.supervisorData.update.mock.calls[0][0].data.ausgabenAngeboten).toBe(false);
  });

  it("sperrt zuerst den Vorgang bedingt — dann SupervisorData, Katalog, Ersetzen, Merker", async () => {
    await put({ ausstattung: [{ positionId: IPAD, gewaehlt: true }], currentStep: 5 });

    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    const sperre = mockPrisma.onboardingProcess.updateMany.mock.calls[0][0];
    expect(sperre.where).toEqual({
      id: "ob1",
      supervisorToken: TOKEN,
      supervisorSubmittedAt: null,
      status: { notIn: ["REVIEWED", "COMPLETED", "EXPIRED"] },
    });
    const reihenfolge = [
      mockPrisma.onboardingProcess.updateMany,
      mockPrisma.supervisorData.upsert,
      mockPrisma.ausstattungsPosition.findMany,
      mockPrisma.onboardingAusstattung.findMany,
      mockPrisma.onboardingAusstattung.deleteMany,
      mockPrisma.onboardingAusstattung.createMany,
      mockPrisma.supervisorData.update,
    ].map((fn) => fn.mock.invocationCallOrder[0]);
    expect(reihenfolge).toEqual([...reihenfolge].sort((a, b) => a - b));
  });

  it("nach der Abgabe (zweiter Tab war schneller): 409 — an der Ausstattung wird nichts geschrieben", async () => {
    mockPrisma.onboardingProcess.updateMany.mockResolvedValue({ count: 0 });

    const res = await put({ ausstattung: [{ positionId: IPAD, gewaehlt: true }], currentStep: 5 });

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "Die Einstellungsmodalitäten wurden bereits eingereicht." });
    expect(mockPrisma.supervisorData.upsert).not.toHaveBeenCalled();
    expect(mockPrisma.onboardingAusstattung.deleteMany).not.toHaveBeenCalled();
    expect(mockPrisma.onboardingAusstattung.createMany).not.toHaveBeenCalled();
  });

  it("fremde Position: 400 — nichts ersetzt", async () => {
    const res = await put({ ausstattung: [{ positionId: FREMD, gewaehlt: true }], currentStep: 5 });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: MELDUNGEN.WAHL_POSITION_UNBEKANNT });
    expect(mockPrisma.onboardingAusstattung.deleteMany).not.toHaveBeenCalled();
    expect(mockPrisma.onboardingAusstattung.createMany).not.toHaveBeenCalled();
    expect(mockPrisma.supervisorData.update).not.toHaveBeenCalled();
  });

  it("eine Position eines anderen Arbeitsorts ist fremd", async () => {
    // Am Arbeitsort Kita gilt die Gymnasium-Position nicht.
    mockPrisma.ausstattungsPosition.findMany.mockResolvedValue([position({ einrichtungsarten: ["GYMNASIUM"] })]);
    mockPrisma.organization.findUnique.mockResolvedValue({ type: "KITA" });
    mockValidate.mockResolvedValue(vorgang(SUPERVISOR_DATA, { arbeitsortId: "org-kita" }));

    const res = await put({ ausstattung: [{ positionId: IPAD, gewaehlt: true }] });

    expect(res.status).toBe(400);
    expect(mockPrisma.onboardingAusstattung.createMany).not.toHaveBeenCalled();
  });

  it("unbekannte Option: 400 — nichts ersetzt", async () => {
    const res = await put({ ausstattung: [{ positionId: SCHLUESSEL, auswahl: ["Tresorraum"] }] });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: MELDUNGEN.WAHL_OPTION_UNBEKANNT });
    expect(mockPrisma.onboardingAusstattung.deleteMany).not.toHaveBeenCalled();
  });

  it("Hinweis an eine Stelle, die das Formular nicht anbietet: 400", async () => {
    const res = await put({ hinweise: [{ departmentKey: "DSB", hinweis: "Bitte verpflichten" }] });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: MELDUNGEN.HINWEIS_STELLE_UNBEKANNT });
    expect(mockPrisma.onboardingStellenHinweis.createMany).not.toHaveBeenCalled();
  });

  it("ohne Merker: 400 „nicht vorgesehen“ — ohne Transaktion", async () => {
    for (const sd of [null, { ...SUPERVISOR_DATA, mitAusstattung: false }, { ...SUPERVISOR_DATA, mitAusstattung: null }]) {
      mockValidate.mockResolvedValue(vorgang(sd));
      for (const body of [{ ausstattung: [] }, { hinweise: [] }]) {
        const res = await put(body);
        expect(res.status).toBe(400);
        expect(await res.json()).toEqual({ error: "Ausstattung ist für dieses Formular nicht vorgesehen." });
      }
    }
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("[] leert nur die eigenen Zeilen; ein fehlendes Feld laesst alles stehen", async () => {
    const res = await put({ ausstattung: [], currentStep: 5 });

    expect(res.status).toBe(200);
    expect(mockPrisma.onboardingAusstattung.deleteMany).toHaveBeenCalledWith({
      where: { onboardingId: "ob1", quelle: "FUEHRUNGSKRAFT" },
    });
    expect(mockPrisma.onboardingAusstattung.createMany).not.toHaveBeenCalled();
    // `hinweise` kam nicht mit: Die Hinweise bleiben, wie sie sind.
    expect(mockPrisma.onboardingStellenHinweis.deleteMany).not.toHaveBeenCalled();
    // „Alles abgewaehlt“ ist gespeichert — die Vorauswahl gilt danach nicht mehr.
    // Dazu (A4, E-A36) der Merker aus dem Ausschnitt.
    expect(mockPrisma.supervisorData.update).toHaveBeenCalledWith({
      where: { onboardingId: "ob1" },
      data: { ausstattungGespeichertAm: expect.any(Date), ausgabenAngeboten: false },
    });

    jest.clearAllMocks();
    const andererSchritt = await put({ wochenstunden: 30, currentStep: 2 });
    expect(andererSchritt.status).toBe(200);
    expect(mockPrisma.onboardingProcess.updateMany).not.toHaveBeenCalled();
    expect(mockPrisma.ausstattungsPosition.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.onboardingAusstattung.deleteMany).not.toHaveBeenCalled();
    expect(mockPrisma.onboardingStellenHinweis.deleteMany).not.toHaveBeenCalled();
    expect(mockPrisma.supervisorData.update).not.toHaveBeenCalled();
  });

  it("eine inzwischen ausgeschaltete Position aus der eigenen Wahl bleibt erlaubt (Momentaufnahme aus der Zeile)", async () => {
    // „Altes iPad“ steht nicht mehr im Katalog (ausgeschaltet), wohl aber in der eigenen Wahl.
    zeilen = [
      zeile({
        positionId: ALT,
        bezeichnung: "Altes iPad",
        aufgabeTitel: "Altes iPad bereitstellen",
        hinweisStelle: "Aus dem Lager",
        relativeDueDays: -10,
        reihenfolge: 5,
      }),
    ];

    const res = await put({ ausstattung: [{ positionId: ALT, gewaehlt: true }] });

    expect(res.status).toBe(200);
    expect(mockPrisma.onboardingAusstattung.createMany.mock.calls[0][0].data).toEqual([
      expect.objectContaining({
        positionId: ALT,
        bezeichnung: "Altes iPad",
        aufgabeTitel: "Altes iPad bereitstellen",
        hinweisStelle: "Aus dem Lager",
        relativeDueDays: -10,
        reihenfolge: 5,
        quelle: "FUEHRUNGSKRAFT",
      }),
    ]);
  });

  it("eine Position, die der Katalog seit dem Speichern geaendert hat: die gespeicherte Momentaufnahme bleibt", async () => {
    // Heute gehoert „Schlüssel“ zur IT; gespeichert ist er beim Hausmeister.
    mockPrisma.ausstattungsPosition.findMany.mockResolvedValue(
      KATALOG.map((p) => (p.id === SCHLUESSEL ? { ...p, departmentKey: "IT", aufgabeTitel: "Schlüssel holen" } : p)),
    );
    zeilen = [
      zeile({
        positionId: SCHLUESSEL,
        departmentKey: "FACILITY",
        art: "AUSWAHL",
        bezeichnung: "Schlüssel",
        aufgabeTitel: "Schlüssel ausgeben",
        hinweisStelle: null,
        relativeDueDays: -3,
        auswahl: ["Lehrerzimmer"],
        reihenfolge: 20,
      }),
    ];

    const res = await put({ ausstattung: [{ positionId: SCHLUESSEL, auswahl: ["Lehrerzimmer"] }] });

    expect(res.status).toBe(200);
    expect(mockPrisma.onboardingAusstattung.createMany.mock.calls[0][0].data).toEqual([
      expect.objectContaining({
        positionId: SCHLUESSEL,
        departmentKey: "FACILITY",
        art: "AUSWAHL",
        aufgabeTitel: "Schlüssel ausgeben",
        auswahl: ["Lehrerzimmer"],
      }),
    ]);
  });

  it("nicht mehr im Katalog und ohne gespeicherte Bemerkung: eine neue Bemerkung ist 400 (S8)", async () => {
    zeilen = [zeile({ positionId: ALT, bezeichnung: "Altes iPad", aufgabeTitel: "Altes iPad bereitstellen" })];

    const res = await put({ ausstattung: [{ positionId: ALT, gewaehlt: true, bemerkung: "Parkplatz Nr. 7" }] });

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe(MELDUNGEN.WAHL_OHNE_BEMERKUNG);
    expect(mockPrisma.onboardingAusstattung.deleteMany).not.toHaveBeenCalled();
  });

  it("eine Zeile von HR macht eine Position nicht waehlbar und wird nie ersetzt", async () => {
    zeilen = [zeile({ positionId: ALT, bezeichnung: "Altes iPad", quelle: "HR" })];

    const res = await put({ ausstattung: [{ positionId: ALT, gewaehlt: true }] });

    expect(res.status).toBe(400);
    expect(mockPrisma.onboardingAusstattung.deleteMany).not.toHaveBeenCalled();
  });

  it("Zod: ungueltige Position und zu lange Bemerkung sind 400 mit Feldangabe", async () => {
    const keineUuid = await put({ ausstattung: [{ positionId: "pos-1", gewaehlt: true }] });
    expect(keineUuid.status).toBe(400);
    expect((await keineUuid.json()).details[0].message).toBe(MELDUNGEN.WAHL_POSITION_UNGUELTIG);

    const zuLang = await put({ ausstattung: [{ positionId: IPAD, gewaehlt: true, bemerkung: "x".repeat(501) }] });
    expect(zuLang.status).toBe(400);
    const befund = (await zuLang.json()).details[0];
    expect(befund.path).toEqual(["ausstattung", 0, "bemerkung"]);
    expect(befund.message).toBe(MELDUNGEN.BEMERKUNG_ZU_LANG);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });
});

describe("PUT – currentStep wird gekappt (F21)", () => {
  it("mit Merker auf 5 (sechs Schritte), ohne auf 4 (fuenf Schritte)", async () => {
    const mit = await put({ currentStep: 9 });
    expect(await mit.json()).toEqual({ success: true, currentStep: 5 });
    expect(mockPrisma.supervisorData.upsert.mock.calls[0][0].update.currentStep).toBe(5);

    mockValidate.mockResolvedValue(vorgang({ ...SUPERVISOR_DATA, mitAusstattung: false }));
    const ohne = await put({ currentStep: 9 });
    expect(await ohne.json()).toEqual({ success: true, currentStep: 4 });
    expect(mockPrisma.supervisorData.upsert.mock.calls[1][0].update.currentStep).toBe(4);
  });

  it("ein Wert in der Strecke bleibt unveraendert", async () => {
    await put({ currentStep: 4 });
    expect(mockPrisma.supervisorData.upsert.mock.calls[0][0].update.currentStep).toBe(4);
  });
});
