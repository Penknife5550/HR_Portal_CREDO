/**
 * Tests: Onboarding-Vorgang anlegen (POST /api/onboarding, Dialog „Neuer Vorgang")
 *
 * Was hier festgehalten ist:
 *   1. EINGABE — Zod mit deutschen Meldungen; Namen getrimmt, Leeres gilt als
 *      „nicht angegeben", spitze Klammern werden abgewiesen (die Namen landen
 *      in zwei Mails, in Betreff und Textteil roh).
 *   2. ZUGRIFF — Mandant per canAccessProcess (404, gleicher Text), den
 *      Vorgesetzten-Link beim Anlegen nur fuer HR_EDIT_ROLES (403).
 *   3. EINE TRANSAKTION — Vorgang, Vorbelegung der Personaldaten, Protokoll und
 *      ggf. der Vorgesetzten-Link, alles ueber den Transaktions-Client; KEIN
 *      Status, kein currentStep, kein isComplete. Der Link laeuft durch dieselbe Funktion wie /supervisor-link
 *      (bedingtes updateMany, statusAbgleichen, Protokoll).
 *   4. MAILS NACH DEM COMMIT — parallel, je Link gemeldet; ein Fehlschlag rollt
 *      nichts zurueck. Die Mail an die Fuehrungskraft nennt nie die private
 *      Adresse der Person.
 *   5. VORGANGSNUMMER — bei P2002 auf displayId neuer Versuch, nach drei 409;
 *      Jahr und Zaehlbereich in deutscher Zeit (`vorgangsjahrInBerlin`).
 *   6. FREIGABELISTE — eine Fuehrungskraft ausserhalb der freigegebenen Domains
 *      ergibt 409, bevor irgendetwas geschrieben oder gemailt wird.
 *   7. ARBEITSORT (E-A10) — optional, ohne UUID-Pruefung; unbekannt oder fremd
 *      = 404 mit dem Text der Einrichtung, gleich der Einrichtung = null,
 *      abweichend gespeichert. Der Mandant bleibt organizationId.
 *   8. MERKER mitAusstattung (Regel 2) — mit dem Link entsteht die Zeile der
 *      Modalitaeten samt Merker aus dem Katalog AM ARBEITSORT, gelesen in
 *      derselben Transaktion; die Einladung traegt ihn als "ja"/"".
 */

// Die Links werden aus APP_URL gebaut — fest, damit die Erwartungen unten
// nicht von der Umgebung des Rechners abhaengen.
process.env.APP_URL = "http://localhost:3000";

// Zwei getrennte Objekte: `mockPrisma` kann nur lesen (vor der Transaktion),
// geschrieben wird ausschliesslich ueber den Transaktions-Client `mockTx`.
// Schriebe die Route am Transaktions-Client vorbei (prisma.auditLog.create …),
// fehlte die Methode — der Test fiele um, statt wie mit `fn(mockPrisma)` gruen
// zu bleiben.
const mockTx = {
  onboardingProcess: {
    create: jest.fn(),
    updateMany: jest.fn(),
    findUniqueOrThrow: jest.fn(),
    update: jest.fn(),
  },
  supervisorData: { upsert: jest.fn(), updateMany: jest.fn() },
  auditLog: { create: jest.fn() },
  // Katalog „Ausstattung & Zugänge“ — gelesen in DERSELBEN Transaktion wie der
  // Link (Merker mitAusstattung, Regel 2). Standard: leerer Katalog.
  ausstattungsPosition: { findMany: jest.fn() },
  organization: { findUnique: jest.fn() },
  ausstattungsAusblendung: { findMany: jest.fn() },
  departmentConfig: { findMany: jest.fn() },
};
const mockPrisma = {
  organization: { findUnique: jest.fn() },
  formTemplate: { findUnique: jest.fn() },
  checklistTemplate: { findFirst: jest.fn() },
  onboardingProcess: {
    count: jest.fn(),
    findUnique: jest.fn(),
  },
  userOrgAssignment: { findUnique: jest.fn() },
  // Freigabeliste der Empfaenger-Domains (Einstellungen → SMTP).
  smtpConfig: { findUnique: jest.fn() },
  $transaction: jest.fn(),
};
const mockSession = jest.fn();
const mockGenerateToken = jest.fn();
const mockFrist = jest.fn();
const mockWebhook = jest.fn();

jest.mock("@/lib/db", () => ({ prisma: mockPrisma }));
jest.mock("@/lib/auth", () => ({
  getSession: () => mockSession(),
  generateToken: () => mockGenerateToken(),
  getTokenExpiryDate: () => mockFrist(),
}));
jest.mock("@/lib/webhooks", () => ({
  triggerWebhooks: (...a: unknown[]) => mockWebhook(...a),
}));
// Die echte Rechnung, aber uebersteuerbar: Ein Test setzt einmalig ein Jahr,
// das keine Uhr liefert (Verdrahtung, unabhaengig von der Zeitzone des
// Rechners). Als Umweg ueber `mockJahrVorgabe` und nicht als
// `jest.fn(echt…)`: `resetAllMocks` im beforeEach loeschte sonst die echte
// Implementierung mit.
const mockJahrVorgabe = jest.fn();
jest.mock("@/lib/vorgangsjahr", () => {
  const echt = jest.requireActual("@/lib/vorgangsjahr");
  return {
    ...echt,
    vorgangsjahrInBerlin: (jetzt?: Date) => mockJahrVorgabe(jetzt) ?? echt.vorgangsjahrInBerlin(jetzt),
  };
});

import { POST } from "@/app/api/onboarding/route";
import { NextRequest } from "next/server";
import { MITARBEITER_NEUTRAL } from "@/lib/onboarding-spuren";
import { MELDUNGEN } from "@/lib/abteilungsaufgaben";
import { vorgangsjahrInBerlin } from "@/lib/vorgangsjahr";

const HR = {
  userId: "u1",
  email: "hr@credo.example",
  role: "HR_SACHBEARBEITER",
  firstName: "H",
  lastName: "R",
};

const ORG = { id: "org1", name: "FES Gymnasium", shortName: "GYM", mandantNumber: "10" };
// Deutsche Zeit wie die Route — sonst liefe der Test in der ersten Stunde
// eines Jahres auf einem UTC-Rechner auseinander.
const JAHR = vorgangsjahrInBerlin().jahr;
const NUMMER = `${JAHR}-GYM-014`;
const PRIVAT = "anna.privat@example.org";
const LEITUNG = "schulleitung@fes.example";

// Bewusst zwei verschiedene Fristen (Reihenfolge der Aufrufe: erst der
// Fragebogen-Link, dann der Vorgesetzten-Link) — eine Vertauschung in Antwort
// oder Payload fiele sonst nicht auf.
const FRIST_FRAGEBOGEN = new Date("2026-10-22T10:00:00Z");
const FRIST_MODALITAETEN = new Date("2026-10-29T10:00:00Z");

function req(body: unknown) {
  return new NextRequest("http://localhost:3000/api/onboarding", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function anlegen(body: Record<string, unknown> = {}) {
  return POST(req({ email: PRIVAT, organizationId: "org1", ...body }), {
    params: Promise.resolve({}),
  });
}

/** Was `statusAbgleichen` nach dem Setzen des Links auf der frischen Zeile liest. */
function frischerStand() {
  return {
    status: "INVITED",
    submittedAt: null,
    supervisorSubmittedAt: null,
    supervisorToken: "mod-token",
    personalData: { currentStep: 0, isComplete: false },
    supervisorData: { isComplete: false },
  };
}

/** Das `data` des (ersten erfolgreichen) create-Aufrufs. */
function angelegteDaten(aufruf = 0) {
  return mockTx.onboardingProcess.create.mock.calls[aufruf][0].data;
}

function mailAn(event: string): Record<string, unknown> {
  const aufruf = mockWebhook.mock.calls.find((c) => c[0] === event);
  if (!aufruf) throw new Error(`Keine Mail ${event}`);
  return aufruf[1];
}

function nummerVergeben(ziel: unknown = ["displayId"]) {
  return Object.assign(new Error("Unique constraint failed"), {
    code: "P2002",
    meta: { target: ziel },
  });
}

beforeEach(() => {
  jest.resetAllMocks();
  mockSession.mockResolvedValue(HR);
  mockGenerateToken.mockReturnValueOnce("fb-token").mockReturnValueOnce("mod-token");
  mockFrist.mockReturnValueOnce(FRIST_FRAGEBOGEN).mockReturnValueOnce(FRIST_MODALITAETEN);
  mockPrisma.organization.findUnique.mockResolvedValue(ORG);
  mockPrisma.formTemplate.findUnique.mockResolvedValue({ version: 3, stepsConfig: [{ step: 1 }] });
  mockPrisma.checklistTemplate.findFirst.mockResolvedValue({
    id: "cl1",
    items: [
      {
        id: "ti1",
        title: "Schlüssel",
        category: "Verwaltung",
        orderIndex: 0,
        defaultAssignee: "Sekretariat",
        defaultDueDays: -7,
        description: "Transponder für Haupteingang",
      },
    ],
  });
  mockPrisma.onboardingProcess.count.mockResolvedValue(13);
  mockPrisma.onboardingProcess.findUnique.mockResolvedValue(null);
  mockTx.onboardingProcess.create.mockImplementation(
    async ({ data }: { data: Record<string, unknown> }) => ({
      id: "ob-neu",
      displayId: data.displayId,
      email: data.email,
      firstName: data.firstName ?? null,
      lastName: data.lastName ?? null,
      status: "INVITED",
      token: data.token,
      tokenExpiresAt: data.tokenExpiresAt,
      createdAt: new Date("2026-09-22T08:00:00Z"),
    }),
  );
  mockTx.onboardingProcess.updateMany.mockResolvedValue({ count: 1 });
  mockTx.onboardingProcess.findUniqueOrThrow.mockResolvedValue(frischerStand());
  mockTx.onboardingProcess.update.mockResolvedValue({});
  // Frische Zeile: Prisma liefert, was `create` angelegt hat.
  mockTx.supervisorData.upsert.mockImplementation(
    async ({ create }: { create: { mitAusstattung?: boolean } }) => ({
      mitAusstattung: create.mitAusstattung ?? null,
      currentStep: 0,
    }),
  );
  mockTx.supervisorData.updateMany.mockResolvedValue({ count: 1 });
  mockTx.ausstattungsPosition.findMany.mockResolvedValue([]);
  mockTx.ausstattungsAusblendung.findMany.mockResolvedValue([]);
  mockTx.departmentConfig.findMany.mockResolvedValue([]);
  mockTx.auditLog.create.mockResolvedValue({});
  mockPrisma.userOrgAssignment.findUnique.mockResolvedValue(null);
  // Leere Liste = keine Einschraenkung (Auslieferungszustand).
  mockPrisma.smtpConfig.findUnique.mockResolvedValue({ allowedRecipientDomains: "" });
  mockPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
    fn(mockTx),
  );
  mockWebhook.mockResolvedValue({ status: "SENT" });
});

describe("Zugriff", () => {
  it("verlangt eine Anmeldung", async () => {
    mockSession.mockResolvedValue(null);
    expect((await anlegen()).status).toBe(401);
  });

  it.each(["VORGESETZTER", "SERVICE"])("laesst %s nicht anlegen", async (role) => {
    mockSession.mockResolvedValue({ ...HR, role });
    expect((await anlegen()).status).toBe(403);
    expect(mockTx.onboardingProcess.create).not.toHaveBeenCalled();
  });

  it("antwortet 404 fuer eine unbekannte Einrichtung", async () => {
    mockPrisma.organization.findUnique.mockResolvedValue(null);
    const res = await anlegen({ organizationId: "non-existent-uuid" });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("Organisation nicht gefunden");
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("antwortet 404 mit demselben Text fuer eine fremde Einrichtung (Einrichtungsleitung ohne Zuordnung)", async () => {
    mockSession.mockResolvedValue({ ...HR, role: "EINRICHTUNGSLEITUNG" });
    const res = await anlegen();
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("Organisation nicht gefunden");
    expect(mockPrisma.userOrgAssignment.findUnique).toHaveBeenCalledWith({
      where: { userId_organizationId: { userId: "u1", organizationId: "org1" } },
    });
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("laesst die Einrichtungsleitung mit Zuordnung anlegen — ohne Fuehrungskraft", async () => {
    mockSession.mockResolvedValue({ ...HR, role: "EINRICHTUNGSLEITUNG" });
    mockPrisma.userOrgAssignment.findUnique.mockResolvedValue({ userId: "u1", organizationId: "org1" });
    expect((await anlegen()).status).toBe(201);
  });

  it("verweigert der Einrichtungsleitung den Vorgesetzten-Link (403) und legt nichts an", async () => {
    mockSession.mockResolvedValue({ ...HR, role: "EINRICHTUNGSLEITUNG" });
    mockPrisma.userOrgAssignment.findUnique.mockResolvedValue({ userId: "u1", organizationId: "org1" });

    const res = await anlegen({ supervisorEmail: LEITUNG });

    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe(
      "Den Link zu den Einstellungsmodalitäten können nur Administration, HR-Leitung und HR-Sachbearbeitung erzeugen.",
    );
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockTx.onboardingProcess.create).not.toHaveBeenCalled();
    expect(mockWebhook).not.toHaveBeenCalled();
  });
});

describe("Eingabe", () => {
  it.each<[string, Record<string, unknown>, string]>([
    ["E-Mail fehlt", { email: undefined }, "Bitte geben Sie die E-Mail-Adresse der neuen Person an."],
    ["E-Mail leer", { email: "   " }, "Bitte geben Sie die E-Mail-Adresse der neuen Person an."],
    ["E-Mail ungueltig", { email: "kein-at-zeichen" }, "Bitte geben Sie eine gültige E-Mail-Adresse der neuen Person an."],
    ["Einrichtung fehlt", { organizationId: "" }, "Bitte wählen Sie eine Einrichtung aus."],
    ["Vorname zu lang", { firstName: "A".repeat(101) }, "Der Vorname darf hoechstens 100 Zeichen lang sein."],
    [
      "Vorname mit spitzer Klammer",
      { firstName: "<b>Anna</b>" },
      "Der Vorname darf keine spitzen Klammern (< >) oder Steuerzeichen enthalten.",
    ],
    [
      "Nachname mit Steuerzeichen",
      { lastName: "Beispiel" },
      "Der Nachname darf keine spitzen Klammern (< >) oder Steuerzeichen enthalten.",
    ],
    [
      "Adresse der Fuehrungskraft ungueltig",
      { supervisorEmail: "leitung@" },
      "Bitte geben Sie eine gültige E-Mail-Adresse der Führungskraft an.",
    ],
    [
      "Fuehrungskraft = Person (ohne Gross/Klein)",
      { email: "Anna.Privat@example.org", supervisorEmail: " anna.privat@EXAMPLE.org " },
      "Die Führungskraft braucht eine eigene E-Mail-Adresse – nicht die der neuen Person.",
    ],
    ["Fragebogentyp ungueltig", { questionnaireType: "PRAKTIKUM" }, "Ungültiger Fragebogentyp."],
    ["Vorgangsart ungueltig", { processType: "ABORDNUNG" }, "Ungültige Vorgangsart."],
    ["Arbeitsort kein Text", { arbeitsortId: 42 }, "Ungültiger Arbeitsort."],
    // Ein NUL-Zeichen liesse Postgres in findUnique scheitern (22021) — 400 statt 500.
    ["Arbeitsort mit NUL-Zeichen", { arbeitsortId: "\u0000" }, "Ungültiger Arbeitsort."],
  ])("weist ab: %s", async (_fall, teil, meldung) => {
    const res = await anlegen(teil);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe(meldung);
    expect(mockTx.onboardingProcess.create).not.toHaveBeenCalled();
    expect(mockWebhook).not.toHaveBeenCalled();
  });

  it("nimmt 100 Zeichen als Vorname noch an", async () => {
    expect((await anlegen({ firstName: "A".repeat(100) })).status).toBe(201);
  });

  it("setzt Vorgangsart und Fragebogentyp auf den Standard, wenn sie fehlen oder leer sind", async () => {
    await anlegen({ processType: "", questionnaireType: null });
    expect(angelegteDaten()).toMatchObject({
      processType: "EINSTELLUNG",
      questionnaireType: "STANDARD",
    });
  });

  it("uebernimmt gueltige Werte und trimmt die Adresse", async () => {
    await anlegen({ email: `  ${PRIVAT} `, processType: "VERBEAMTUNG", questionnaireType: "BEAMTE" });
    expect(angelegteDaten()).toMatchObject({
      email: PRIVAT,
      processType: "VERBEAMTUNG",
      questionnaireType: "BEAMTE",
    });
    expect(mockPrisma.formTemplate.findUnique).toHaveBeenCalledWith({
      where: { questionnaireType: "BEAMTE" },
    });
  });
});

describe("Anlegen ohne Fuehrungskraft", () => {
  it("schreibt den getrimmten Namen an den Vorgang UND als Vorbelegung in die Personaldaten", async () => {
    const res = await anlegen({ firstName: "  Anna ", lastName: " Beispiel  " });

    expect(res.status).toBe(201);
    const daten = angelegteDaten();
    expect(daten.firstName).toBe("Anna");
    expect(daten.lastName).toBe("Beispiel");
    expect(daten.personalData).toEqual({ create: { firstName: "Anna", lastName: "Beispiel" } });
  });

  it("setzt einen Namen aus Leerzeichen nicht", async () => {
    await anlegen({ firstName: "   ", lastName: "" });

    const daten = angelegteDaten();
    expect(daten).not.toHaveProperty("firstName");
    expect(daten).not.toHaveProperty("lastName");
    expect(daten.personalData).toEqual({ create: {} });
  });

  it("setzt nur den Teil, der angegeben ist", async () => {
    await anlegen({ firstName: "Anna" });
    const daten = angelegteDaten();
    expect(daten.firstName).toBe("Anna");
    expect(daten).not.toHaveProperty("lastName");
    expect(daten.personalData).toEqual({ create: { firstName: "Anna" } });
  });

  it("setzt weder Status noch Fortschritt — der Vorgang bleibt INVITED", async () => {
    const res = await anlegen({ firstName: "Anna", lastName: "Beispiel" });

    const daten = angelegteDaten();
    expect(daten).not.toHaveProperty("status");
    expect(daten).not.toHaveProperty("currentStep");
    expect(daten).not.toHaveProperty("isComplete");
    expect(daten.personalData.create).not.toHaveProperty("currentStep");
    expect(daten.personalData.create).not.toHaveProperty("isComplete");
    expect((await res.json()).status).toBe("INVITED");
  });

  it("legt Vorgang, Snapshot und Checkliste in EINEM create an und protokolliert im selben Commit", async () => {
    await anlegen({ firstName: "Anna" });

    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mockTx.onboardingProcess.create).toHaveBeenCalledTimes(1);
    const daten = angelegteDaten();
    expect(daten).toMatchObject({
      organizationId: "org1",
      token: "fb-token",
      tokenExpiresAt: FRIST_FRAGEBOGEN,
      invitedById: "u1",
      displayId: NUMMER,
      sequentialNumber: 14,
      formTemplateVersion: 3,
      formTemplateSnapshot: [{ step: 1 }],
      checklistTemplateId: "cl1",
    });
    // Paket 5: Zustaendigkeit als SCHLUESSEL (aus dem Freitext der Vorlage
    // abgeleitet), dazu Hinweis und Tagesangabe. `dueDate` bleibt null — der
    // Vertragsbeginn steht beim Anlegen noch nicht fest.
    expect(daten.checklistItems).toEqual({
      createMany: {
        data: [
          {
            templateItemId: "ti1",
            title: "Schlüssel",
            category: "Verwaltung",
            orderIndex: 0,
            dueDate: null,
            assignee: "VERWALTUNG",
            description: "Transponder für Haupteingang",
            relativeDueDays: -7,
          },
        ],
      },
    });

    const protokoll = mockTx.auditLog.create.mock.calls[0][0].data;
    expect(protokoll).toMatchObject({
      onboardingId: "ob-neu",
      userId: "u1",
      action: "ONBOARDING_CREATED",
      details: {
        email: PRIVAT,
        organization: "FES Gymnasium",
        questionnaireType: "STANDARD",
        nameVorbelegt: true,
        mitVorgesetztenLink: false,
      },
    });
  });

  /** Genau diese Vorlagenpunkte liefert die Checklisten-Vorlage diesmal. */
  function vorlagenPunkte(...punkte: Array<Record<string, unknown>>) {
    mockPrisma.checklistTemplate.findFirst.mockResolvedValue({
      id: "cl1",
      items: punkte.map((p, i) => ({
        id: `ti${i + 1}`,
        title: "Punkt",
        category: "Vor Arbeitsbeginn",
        orderIndex: i,
        defaultAssignee: null,
        defaultDueDays: null,
        description: null,
        ...p,
      })),
    });
  }

  /** Die kopierten Aufgaben des (ersten) create-Aufrufs. */
  function kopiertePunkte(): Array<Record<string, unknown>> {
    return (angelegteDaten().checklistItems as { createMany: { data: Array<Record<string, unknown>> } }).createMany
      .data;
  }

  it("macht aus leerer Zuständigkeit null — nicht den leeren Text", async () => {
    // `?? null` ergaebe hier "" — weder Schluessel noch Freitext. Die Aufgabe
    // erschiene dann weder als Abteilungszeile noch als „unbekannte
    // Zuständigkeit", sondern verschwaende still.
    vorlagenPunkte({ defaultAssignee: "   " });
    await anlegen();
    expect(kopiertePunkte()[0].assignee).toBeNull();
  });

  it("behält unbekannten Freitext als Zuständigkeit (er wird später gemeldet)", async () => {
    vorlagenPunkte({ defaultAssignee: "  Kantine  " });
    await anlegen();
    expect(kopiertePunkte()[0].assignee).toBe("Kantine");
  });

  it("übernimmt defaultDueDays 0 als 0, nicht als null", async () => {
    vorlagenPunkte({ defaultDueDays: 0 });
    await anlegen();
    expect(kopiertePunkte()[0].relativeDueDays).toBe(0);
  });

  it("laesst Checkliste und Snapshot weg, wenn es keine Vorlage gibt", async () => {
    mockPrisma.formTemplate.findUnique.mockResolvedValue(null);
    mockPrisma.checklistTemplate.findFirst.mockResolvedValue(null);
    await anlegen();
    const daten = angelegteDaten();
    expect(daten).not.toHaveProperty("checklistItems");
    expect(daten).not.toHaveProperty("checklistTemplateId");
    expect(daten).not.toHaveProperty("formTemplateSnapshot");
  });

  it("erzeugt keinen Vorgesetzten-Link", async () => {
    await anlegen();
    expect(mockTx.onboardingProcess.updateMany).not.toHaveBeenCalled();
    expect(mockTx.supervisorData.upsert).not.toHaveBeenCalled();
    expect(mockTx.onboardingProcess.update).not.toHaveBeenCalled();
  });

  it("verschickt genau eine Mail — mit Vor- und Nachname", async () => {
    await anlegen({ firstName: "Anna", lastName: "Beispiel" });

    expect(mockWebhook).toHaveBeenCalledTimes(1);
    expect(mockWebhook).toHaveBeenCalledWith("onboarding-created", {
      onboardingId: "ob-neu",
      displayId: NUMMER,
      email: PRIVAT,
      vorname: "Anna",
      nachname: "Beispiel",
      firstName: "Anna",
      lastName: "Beispiel",
      fragebogenLink: "http://localhost:3000/fragebogen/fb-token",
      organization: "FES Gymnasium",
      mandantNumber: "10",
      tokenExpiresAt: "2026-10-22T10:00:00.000Z",
    });
  });

  it("antwortet mit Vorgang, Link, Versandstatus und ohne Vorgesetzten", async () => {
    const res = await anlegen({ firstName: "Anna" });

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      id: "ob-neu",
      displayId: NUMMER,
      email: PRIVAT,
      firstName: "Anna",
      lastName: null,
      fragebogenLink: "http://localhost:3000/fragebogen/fb-token",
      organization: { id: "org1", name: "FES Gymnasium", mandantNumber: "10" },
      status: "INVITED",
      tokenExpiresAt: "2026-10-22T10:00:00.000Z",
      createdAt: "2026-09-22T08:00:00.000Z",
      mailVersand: "SENT",
      vorgesetzter: null,
    });
  });
});

describe("Anlegen mit Fuehrungskraft", () => {
  it("setzt den Link bedingt — dieselbe Sperre wie /supervisor-link", async () => {
    const res = await anlegen({ supervisorEmail: LEITUNG });

    expect(res.status).toBe(201);
    const arg = mockTx.onboardingProcess.updateMany.mock.calls[0][0];
    expect(arg.where).toEqual({
      id: "ob-neu",
      supervisorToken: null,
      supervisorSubmittedAt: null,
      status: { notIn: ["REVIEWED", "COMPLETED", "EXPIRED"] },
      // Der Arbeitsort, aus dem der Merker stammt (hier: wie Einrichtung).
      arbeitsortId: null,
    });
    expect(arg.data).toMatchObject({
      supervisorEmail: LEITUNG,
      supervisorToken: "mod-token",
      supervisorTokenExpiresAt: FRIST_MODALITAETEN,
      lastSupervisorReminderAt: null,
    });
    // Anker der ersten Vorgesetzten-Erinnerung (Cron).
    expect(arg.data.supervisorLinkSentAt).toBeInstanceOf(Date);
    expect(arg.data.status).toBeUndefined();
    // Leerer Katalog: Die Zeile entsteht mit dem Merker false (Regel 2).
    expect(mockTx.supervisorData.upsert).toHaveBeenCalledWith({
      where: { onboardingId: "ob-neu" },
      update: {},
      create: { onboardingId: "ob-neu", mitAusstattung: false },
      select: { mitAusstattung: true, currentStep: true },
    });
  });

  it("laesst den Status bei INVITED (statusAbgleichen schreibt auf der frischen Zeile nichts)", async () => {
    const res = await anlegen({ supervisorEmail: LEITUNG });
    expect(mockTx.onboardingProcess.findUniqueOrThrow).toHaveBeenCalledTimes(1);
    expect(mockTx.onboardingProcess.update).not.toHaveBeenCalled();
    expect((await res.json()).status).toBe("INVITED");
  });

  it("schreibt alles INNERHALB der Transaktion — ueber den Transaktions-Client", async () => {
    let offen = false;
    mockPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => {
      offen = true;
      try {
        return await fn(mockTx);
      } finally {
        offen = false;
      }
    });
    const waehrendTransaktion: boolean[] = [];
    const schreiber = [
      mockTx.onboardingProcess.create,
      mockTx.onboardingProcess.updateMany,
      mockTx.supervisorData.upsert,
      mockTx.auditLog.create,
    ];
    for (const schreib of schreiber) {
      const bisher = schreib.getMockImplementation();
      schreib.mockImplementation(async (...args: unknown[]) => {
        waehrendTransaktion.push(offen);
        return bisher?.(...args);
      });
    }

    expect((await anlegen({ supervisorEmail: LEITUNG, firstName: "Anna" })).status).toBe(201);

    // create, updateMany, upsert und zwei Protokolle
    expect(waehrendTransaktion).toEqual([true, true, true, true, true]);
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it("schreibt beide Protokolle in der Transaktion — vor der ersten Mail", async () => {
    await anlegen({ supervisorEmail: LEITUNG });

    const aktionen = mockTx.auditLog.create.mock.calls.map((c) => c[0].data.action);
    expect(aktionen).toEqual(["ONBOARDING_CREATED", "SUPERVISOR_LINK_CREATED"]);
    const ersteMail = Math.min(...mockWebhook.mock.invocationCallOrder);
    for (const zeitpunkt of mockTx.auditLog.create.mock.invocationCallOrder) {
      expect(zeitpunkt).toBeLessThan(ersteMail);
    }
    expect(mockTx.onboardingProcess.updateMany.mock.invocationCallOrder[0]).toBeLessThan(ersteMail);

    const link = mockTx.auditLog.create.mock.calls[1][0].data;
    expect(link.details).toEqual({
      supervisorEmail: LEITUNG,
      organization: "FES Gymnasium",
      ersetztLinkAn: null,
      status: { von: "INVITED", nach: "INVITED" },
    });
    expect(mockTx.auditLog.create.mock.calls[0][0].data.details.mitVorgesetztenLink).toBe(true);
  });

  it("verschickt zwei Mails mit unterschiedlichen Links", async () => {
    await anlegen({ supervisorEmail: LEITUNG });

    expect(mockWebhook).toHaveBeenCalledTimes(2);
    expect(mailAn("onboarding-created").fragebogenLink).toBe(
      "http://localhost:3000/fragebogen/fb-token",
    );
    expect(mailAn("supervisor-link-created")).toEqual({
      onboardingId: "ob-neu",
      displayId: NUMMER,
      supervisorEmail: LEITUNG,
      modalitaetenLink: "http://localhost:3000/modalitaeten/mod-token",
      employeeName: MITARBEITER_NEUTRAL,
      mitarbeiter_name: MITARBEITER_NEUTRAL,
      organization: "FES Gymnasium",
      mandantNumber: "10",
      supervisorTokenExpiresAt: "2026-10-29T10:00:00.000Z",
      ausstattung_angeboten: "",
    });
  });

  it("nennt der Fuehrungskraft nie die private Adresse der Person", async () => {
    await anlegen({ supervisorEmail: LEITUNG });

    const nutzlast = mailAn("supervisor-link-created");
    expect(nutzlast).not.toHaveProperty("email");
    expect(nutzlast).not.toHaveProperty("employeeEmail");
    expect(JSON.stringify(nutzlast)).not.toContain(PRIVAT);
  });

  it("nennt den vorbelegten Namen, wenn er angegeben ist", async () => {
    await anlegen({ supervisorEmail: LEITUNG, firstName: "Anna", lastName: "Beispiel" });

    const nutzlast = mailAn("supervisor-link-created");
    expect(nutzlast.mitarbeiter_name).toBe("Anna Beispiel");
    expect(nutzlast.employeeName).toBe("Anna Beispiel");
  });

  it("antwortet mit beiden Links und dem Versandstatus je Link", async () => {
    const res = await anlegen({ supervisorEmail: LEITUNG });

    const daten = await res.json();
    expect(daten.fragebogenLink).toBe("http://localhost:3000/fragebogen/fb-token");
    expect(daten.tokenExpiresAt).toBe("2026-10-22T10:00:00.000Z");
    expect(daten.mailVersand).toBe("SENT");
    expect(mailAn("onboarding-created").tokenExpiresAt).toBe("2026-10-22T10:00:00.000Z");
    expect(daten.vorgesetzter).toEqual({
      supervisorEmail: LEITUNG,
      modalitaetenLink: "http://localhost:3000/modalitaeten/mod-token",
      supervisorTokenExpiresAt: "2026-10-29T10:00:00.000Z",
      mailVersand: "SENT",
    });
  });
});

describe("Freigabeliste der Fuehrungskraft", () => {
  it("erlaubt bei leerer Liste jede Adresse", async () => {
    mockPrisma.smtpConfig.findUnique.mockResolvedValue({ allowedRecipientDomains: "" });
    const res = await anlegen({ supervisorEmail: "leitung@freemail.example" });
    expect(res.status).toBe(201);
  });

  it("erlaubt eine Adresse in einer freigegebenen Domain", async () => {
    mockPrisma.smtpConfig.findUnique.mockResolvedValue({
      allowedRecipientDomains: "fes.example, credo.example",
    });
    const res = await anlegen({ supervisorEmail: LEITUNG });
    expect(res.status).toBe(201);
  });

  it("weist eine nicht freigegebene Domain mit 409 ab — nichts angelegt, keine Mail", async () => {
    mockPrisma.smtpConfig.findUnique.mockResolvedValue({
      allowedRecipientDomains: "fes.example",
    });

    const res = await anlegen({ supervisorEmail: "leitung@freemail.example" });

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: MELDUNGEN.FUEHRUNGSKRAFT_NICHT_FREIGEGEBEN });
    // Vor jedem Schreiben: weder Vorgang noch Nummer noch Mail.
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockTx.onboardingProcess.create).not.toHaveBeenCalled();
    expect(mockPrisma.onboardingProcess.count).not.toHaveBeenCalled();
    expect(mockWebhook).not.toHaveBeenCalled();
  });

  it("vergleicht die Domain exakt — eine Subdomain-Attrappe gilt nicht", async () => {
    mockPrisma.smtpConfig.findUnique.mockResolvedValue({
      allowedRecipientDomains: "fes.example",
    });
    const res = await anlegen({ supervisorEmail: "leitung@evil-fes.example" });
    expect(res.status).toBe(409);
  });

  it("prueft ohne Fuehrungskraft gar nicht erst", async () => {
    mockPrisma.smtpConfig.findUnique.mockResolvedValue({
      allowedRecipientDomains: "fes.example",
    });
    expect((await anlegen()).status).toBe(201);
    expect(mockPrisma.smtpConfig.findUnique).not.toHaveBeenCalled();
  });
});

describe("Arbeitsort (E-A10)", () => {
  const ORT = { id: "org2", name: "FES Grundschule Nord" };

  /** Einrichtungen nach ID — die Route fragt Einrichtung und Arbeitsort getrennt ab. */
  function einrichtungen(...zeilen: Array<{ id: string }>) {
    mockPrisma.organization.findUnique.mockImplementation(
      async ({ where }: { where: { id: string } }) => zeilen.find((z) => z.id === where.id) ?? null,
    );
  }

  /** Einrichtungsleitung, zugeordnet genau diesen Einrichtungen. */
  function einrichtungsleitung(...zugeordnet: string[]) {
    mockSession.mockResolvedValue({ ...HR, role: "EINRICHTUNGSLEITUNG" });
    mockPrisma.userOrgAssignment.findUnique.mockImplementation(
      async ({ where }: { where: { userId_organizationId: { organizationId: string } } }) =>
        zugeordnet.includes(where.userId_organizationId.organizationId)
          ? { userId: "u1", organizationId: where.userId_organizationId.organizationId }
          : null,
    );
  }

  it("speichert ohne Angabe null — und fragt keinen Arbeitsort ab", async () => {
    expect((await anlegen()).status).toBe(201);
    expect(angelegteDaten().arbeitsortId).toBeNull();
    expect(mockPrisma.organization.findUnique).toHaveBeenCalledTimes(1);
    expect(mockTx.auditLog.create.mock.calls[0][0].data.details.arbeitsortId).toBeNull();
  });

  it("speichert null, wenn der Arbeitsort die Einrichtung ist", async () => {
    expect((await anlegen({ arbeitsortId: "org1" })).status).toBe(201);
    expect(angelegteDaten().arbeitsortId).toBeNull();
    expect(mockPrisma.organization.findUnique).toHaveBeenCalledTimes(1);
  });

  it("speichert einen abweichenden Arbeitsort — der Mandant bleibt die Einrichtung", async () => {
    einrichtungen(ORG, ORT);

    const res = await anlegen({ arbeitsortId: " org2 " });

    expect(res.status).toBe(201);
    expect(angelegteDaten()).toMatchObject({ organizationId: "org1", arbeitsortId: "org2" });
    expect(mockPrisma.organization.findUnique).toHaveBeenLastCalledWith({
      where: { id: "org2" },
      select: { id: true },
    });
    const protokoll = mockTx.auditLog.create.mock.calls[0][0].data;
    expect(protokoll.details).toMatchObject({ organization: "FES Gymnasium", arbeitsortId: "org2" });
    // Die Vorgangsnummer kommt weiter aus dem Kuerzel der Einrichtung.
    expect(angelegteDaten().displayId).toBe(NUMMER);
  });

  it("antwortet 404 fuer einen unbekannten, nicht UUID-foermigen Arbeitsort (kein 400) — nichts angelegt", async () => {
    einrichtungen(ORG);

    const res = await anlegen({ arbeitsortId: "org-2" });

    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("Organisation nicht gefunden");
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockWebhook).not.toHaveBeenCalled();
  });

  it("antwortet 404 mit demselben Text fuer einen fremden Arbeitsort", async () => {
    einrichtungen(ORG, ORT);
    einrichtungsleitung("org1");

    const res = await anlegen({ arbeitsortId: "org2" });

    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("Organisation nicht gefunden");
    expect(mockPrisma.userOrgAssignment.findUnique).toHaveBeenCalledWith({
      where: { userId_organizationId: { userId: "u1", organizationId: "org2" } },
    });
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("prueft den Mandanten an der Einrichtung — ein zugeordneter Arbeitsort allein genuegt nicht", async () => {
    einrichtungen(ORG, ORT);
    einrichtungsleitung("org2");

    const res = await anlegen({ arbeitsortId: "org2" });

    expect(res.status).toBe(404);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("laesst die Einrichtungsleitung mit Zuordnung zu beiden anlegen", async () => {
    einrichtungen(ORG, ORT);
    einrichtungsleitung("org1", "org2");

    expect((await anlegen({ arbeitsortId: "org2" })).status).toBe(201);
    expect(angelegteDaten().arbeitsortId).toBe("org2");
  });
});

describe("Merker mitAusstattung beim Anlegen mit Fuehrungskraft (Regel 2)", () => {
  const ORT = { id: "org2", name: "FES Grundschule Nord" };
  const ARTEN: Record<string, string> = { org1: "GYMNASIUM", org2: "GRUNDSCHULE" };

  /** Aktive Position der Stelle HR (braucht keine Adresse), nur fuer Grundschulen. */
  const NUR_GRUNDSCHULE = {
    id: "pos-jobticket",
    departmentKey: "HR",
    organizationId: null,
    einrichtungsarten: ["GRUNDSCHULE"],
    art: "JA_NEIN",
    angabeSchluessel: null,
    bezeichnung: "Jobticket",
    hinweisFuehrungskraft: null,
    hinweisStelle: null,
    optionen: [],
    vorausgewaehlt: false,
    vorausgewaehlteOptionen: [],
    bemerkungAnbieten: true,
    bemerkungPlatzhalter: null,
    aufgabeTitel: null,
    defaultDueDays: null,
    personengruppen: [],
    sichtbarFuer: [],
    entgeltrelevant: true,
    ausgabeKennung: null,
    rueckgabeKategorie: null,
    beiAustritt: null,
    vorschlagSchluessel: null,
    isActive: true,
    orderIndex: 0,
  };

  beforeEach(() => {
    mockPrisma.organization.findUnique.mockImplementation(
      async ({ where }: { where: { id: string } }) => [ORG, ORT].find((z) => z.id === where.id) ?? null,
    );
    mockTx.ausstattungsPosition.findMany.mockResolvedValue([NUR_GRUNDSCHULE]);
    mockTx.organization.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) =>
      ARTEN[where.id] ? { type: ARTEN[where.id] } : null,
    );
  });

  it("angeboten am Arbeitsort: Zeile mit Merker true, Einladung mit ausstattung_angeboten \"ja\"", async () => {
    const res = await anlegen({ supervisorEmail: LEITUNG, arbeitsortId: "org2" });

    expect(res.status).toBe(201);
    expect(mockTx.supervisorData.upsert.mock.calls[0][0].create).toEqual({
      onboardingId: "ob-neu",
      mitAusstattung: true,
    });
    expect(mailAn("supervisor-link-created").ausstattung_angeboten).toBe("ja");
    // Die Einrichtungsart kommt vom Arbeitsort — gelesen ueber den Transaktions-Client.
    expect(mockTx.organization.findUnique).toHaveBeenCalledWith({ where: { id: "org2" }, select: { type: true } });
    // Erst der Katalog, dann der Link — und die Sperre traegt denselben
    // Arbeitsort, aus dem der Merker stammt (der gerade angelegte).
    expect(mockTx.ausstattungsPosition.findMany.mock.invocationCallOrder[0]).toBeLessThan(
      mockTx.onboardingProcess.updateMany.mock.invocationCallOrder[0],
    );
    expect(mockTx.onboardingProcess.updateMany.mock.calls[0][0].where.arbeitsortId).toBe("org2");
  });

  it("nicht angeboten an der Einrichtung (Gymnasium): Merker false, Einladung ohne den Satz", async () => {
    const res = await anlegen({ supervisorEmail: LEITUNG });

    expect(res.status).toBe(201);
    expect(mockTx.supervisorData.upsert.mock.calls[0][0].create).toEqual({
      onboardingId: "ob-neu",
      mitAusstattung: false,
    });
    expect(mailAn("supervisor-link-created").ausstattung_angeboten).toBe("");
  });

  it("ausserhalb von EINSTELLUNG: Merker false, ohne den Katalog zu lesen", async () => {
    const res = await anlegen({ supervisorEmail: LEITUNG, arbeitsortId: "org2", processType: "VERTRAGSAENDERUNG" });

    expect(res.status).toBe(201);
    expect(mockTx.ausstattungsPosition.findMany).not.toHaveBeenCalled();
    expect(mockTx.supervisorData.upsert.mock.calls[0][0].create.mitAusstattung).toBe(false);
  });

  it("ohne Fuehrungskraft entsteht kein Link — und der Katalog wird nicht gelesen", async () => {
    expect((await anlegen({ arbeitsortId: "org2" })).status).toBe(201);
    expect(mockTx.ausstattungsPosition.findMany).not.toHaveBeenCalled();
    expect(mockTx.supervisorData.upsert).not.toHaveBeenCalled();
  });
});

describe("Mailversand", () => {
  it("meldet FAILED und SKIPPED je Link — der Vorgang bleibt (201)", async () => {
    mockWebhook.mockImplementation(async (event: string) =>
      event === "onboarding-created" ? { status: "FAILED" } : { status: "SKIPPED" },
    );

    const res = await anlegen({ supervisorEmail: LEITUNG });

    expect(res.status).toBe(201);
    const daten = await res.json();
    expect(daten.mailVersand).toBe("FAILED");
    expect(daten.vorgesetzter.mailVersand).toBe("SKIPPED");
  });

  it("meldet null, wenn der Dispatcher kein Ergebnis liefert", async () => {
    mockWebhook.mockResolvedValue(null);
    const daten = await (await anlegen({ supervisorEmail: LEITUNG })).json();
    expect(daten.mailVersand).toBeNull();
    expect(daten.vorgesetzter.mailVersand).toBeNull();
  });

  it("verschickt nichts, wenn die Transaktion scheitert", async () => {
    mockTx.auditLog.create.mockRejectedValue(new Error("DB weg"));
    const fehler = jest.spyOn(console, "error").mockImplementation(() => {});

    const res = await anlegen({ supervisorEmail: LEITUNG });

    expect(res.status).toBe(500);
    expect(mockWebhook).not.toHaveBeenCalled();
    fehler.mockRestore();
  });
});

describe("Vorgangsnummer", () => {
  it("nimmt Jahr und Zaehlbereich aus der deutschen Zeit — auch in der Silvesternacht", async () => {
    // 31.12.2026, 23:30 UTC ist in Berlin schon der 1.1.2027, 00:30 Uhr. Der
    // Container laeuft in UTC; frueher bekam der Vorgang hier „2026-…".
    jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate"] });
    jest.setSystemTime(new Date("2026-12-31T23:30:00.000Z"));
    try {
      mockPrisma.onboardingProcess.count.mockResolvedValue(0);

      const res = await anlegen();

      expect(res.status).toBe(201);
      expect(angelegteDaten().displayId).toBe("2027-GYM-001");
      expect(mockPrisma.onboardingProcess.count).toHaveBeenCalledWith({
        where: {
          createdAt: {
            gte: new Date("2026-12-31T23:00:00.000Z"),
            lt: new Date("2027-12-31T23:00:00.000Z"),
          },
        },
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it("nimmt Jahr und Bereich woertlich aus vorgangsjahrInBerlin (unabhaengig von der Rechner-Zeitzone)", async () => {
    // Der Silvester-Test oben ist auf einem Rechner in Europe/Berlin auch mit
    // dem ALTEN Code gruen — dort ist Ortszeit deutsche Zeit. Erst dieses Jahr,
    // das keine Uhr liefern kann, belegt die Verdrahtung ueberall.
    mockJahrVorgabe.mockReturnValueOnce({
      jahr: 2031,
      von: new Date("2030-12-31T23:00:00.000Z"),
      bis: new Date("2031-12-31T23:00:00.000Z"),
    });
    mockPrisma.onboardingProcess.count.mockResolvedValue(0);

    const res = await anlegen();

    expect(res.status).toBe(201);
    expect(angelegteDaten().displayId).toBe("2031-GYM-001");
    expect(mockPrisma.onboardingProcess.count).toHaveBeenCalledWith({
      where: {
        createdAt: {
          gte: new Date("2030-12-31T23:00:00.000Z"),
          lt: new Date("2031-12-31T23:00:00.000Z"),
        },
      },
    });
  });

  it("versucht es nach P2002 auf displayId mit einer neu ermittelten Nummer erneut", async () => {
    mockPrisma.onboardingProcess.count.mockResolvedValueOnce(13).mockResolvedValueOnce(14);
    mockTx.onboardingProcess.create.mockRejectedValueOnce(nummerVergeben());

    const res = await anlegen({ supervisorEmail: LEITUNG });

    expect(res.status).toBe(201);
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(2);
    expect(angelegteDaten(0).displayId).toBe(NUMMER);
    expect(angelegteDaten(1).displayId).toBe(`${JAHR}-GYM-015`);
    expect((await res.json()).displayId).toBe(`${JAHR}-GYM-015`);
    // Der erste Versuch ist vollstaendig zurueckgerollt — gemailt wird einmal je Link.
    expect(mockWebhook).toHaveBeenCalledTimes(2);
  });

  it("erkennt den Index auch am Namen (meta.target als Zeichenkette)", async () => {
    mockTx.onboardingProcess.create.mockRejectedValueOnce(
      nummerVergeben("onboarding_processes_displayId_key"),
    );
    expect((await anlegen()).status).toBe(201);
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it("antwortet nach drei vergebenen Nummern mit 409 — ohne Mail", async () => {
    mockTx.onboardingProcess.create.mockRejectedValue(nummerVergeben());

    const res = await anlegen();

    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe(
      "Die Vorgangsnummer wurde gerade vergeben. Bitte versuchen Sie es erneut.",
    );
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(3);
    expect(mockWebhook).not.toHaveBeenCalled();
  });

  it("wiederholt andere Eindeutigkeitsfehler nicht", async () => {
    mockTx.onboardingProcess.create.mockRejectedValue(nummerVergeben(["token"]));
    const fehler = jest.spyOn(console, "error").mockImplementation(() => {});

    const res = await anlegen();

    expect(res.status).toBe(500);
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mockWebhook).not.toHaveBeenCalled();
    fehler.mockRestore();
  });
});
