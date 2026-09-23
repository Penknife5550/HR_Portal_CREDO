/**
 * Tests: die drei E-Mails rund um die beiden Onboarding-Spuren (Paket 2)
 *
 *   POST /api/fragebogen/[token]    -> questionnaire-completed (HR)
 *                                   -> questionnaire-confirmation-employee (Person)
 *   POST /api/modalitaeten/[token]  -> supervisor-completed (HR)
 *
 * Schwerpunkt ist das, was in der Mail steht: Seit beide Spuren parallel
 * laufen, darf keine der beiden HR-Mails „bereit zur Prüfung" behaupten,
 * solange die Gegenspur fehlt. Die Aussage kommt aus `StatusAbgleich.nach`,
 * also aus dem Stand AUS der Transaktion — der Lesestand davor kennt eine
 * gleichzeitige Abgabe der Gegenseite nicht.
 *
 * Zweiter Schwerpunkt: `{{mitarbeiter_name}}` faellt in `extractVariables`
 * zuletzt auf `payload.email` zurueck. Ohne ausdruecklich gesetztes Feld
 * stuende die PRIVATE Adresse der Person im Betreff der HR-Mail.
 */

const mockPrisma = {
  formTemplate: { findUnique: jest.fn() },
  document: { findMany: jest.fn() },
  child: { count: jest.fn() },
  personalData: { findUnique: jest.fn(), update: jest.fn() },
  supervisorData: { upsert: jest.fn(), update: jest.fn() },
  supervisorKostenstelle: { deleteMany: jest.fn(), createMany: jest.fn() },
  onboardingProcess: {
    updateMany: jest.fn(),
    findUniqueOrThrow: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  auditLog: { create: jest.fn() },
  $transaction: jest.fn(),
};
const mockMagicToken = jest.fn();
const mockSupervisorToken = jest.fn();
const mockN8n = jest.fn();

jest.mock("@/lib/db", () => ({ prisma: mockPrisma }));
jest.mock("@/lib/auth", () => ({
  validateMagicToken: (...args: unknown[]) => mockMagicToken(...args),
  validateSupervisorToken: (...args: unknown[]) => mockSupervisorToken(...args),
}));
jest.mock("@/lib/rate-limit", () => ({
  tokenRateLimiter: { check: () => ({ allowed: true }) },
  getClientIp: () => "203.0.113.7",
  getClientIpOrNull: () => "203.0.113.7",
  // Die Modalitaeten-Route zieht ueber `faelligkeitenSetzen` auch
  // src/lib/abteilungsaufgaben-uebergaenge.ts herein, und die baut beim Laden
  // ihre eigene Bremse je Link.
  createRateLimiter: () => ({ check: () => ({ allowed: true }) }),
}));
jest.mock("@/lib/n8n", () => ({
  triggerN8nWebhook: (...a: unknown[]) => mockN8n(...a),
}));
jest.mock("@/lib/encryption", () => ({
  encrypt: (v: string) => v,
  decrypt: (v: string) => v,
  isEncryptionConfigured: () => true,
}));

import { POST as FRAGEBOGEN_POST } from "@/app/api/fragebogen/[token]/route";
import { POST as MODALITAETEN_POST } from "@/app/api/modalitaeten/[token]/route";
import { AKTUELLE_ERKLAERUNG } from "@/lib/erklaerung-arbeitnehmer";
import { MITARBEITER_NEUTRAL } from "@/lib/onboarding-spuren";
import { NextRequest } from "next/server";

const TOKEN = "magic-token-1234567890";
const SUP_TOKEN = "supervisor-token-1234567890";
const MA_EMAIL = "privat@gmx.example";
const params = (token: string) => () => Promise.resolve({ token });

function req(pfad: string, body: Record<string, unknown>): NextRequest {
  return new NextRequest(`http://localhost:3000${pfad}`, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "Jest" },
    body: JSON.stringify(body),
  });
}

/** Genau der Rumpf, den Schritt 10 des Fragebogens sendet. */
const ABSENDE_RUMPF = {
  dsgvoAccepted: true,
  erklaerungAccepted: true,
  erklaerungOrt: "Minden",
  erklaerungVersion: AKTUELLE_ERKLAERUNG.version,
};

/** Der Vorgang, wie `validateMagicToken` ihn liefert. */
function fragebogenToken(vorgang: Record<string, unknown> = {}) {
  return {
    valid: true,
    onboarding: {
      id: "ob1",
      status: "IN_PROGRESS",
      submittedAt: null,
      supervisorSubmittedAt: null,
      supervisorToken: null,
      email: MA_EMAIL,
      firstName: "Anna",
      lastName: "Beispiel",
      displayId: "2026-GYM-042",
      questionnaireType: "MINIJOB",
      organization: { name: "Berufskolleg", type: "VERWALTUNG" },
      personalData: {
        firstName: "Anna",
        lastName: "Beispiel",
        rvEntscheidung: null,
        birthDate: null,
        aufenthaltstitelErforderlich: null,
        healthInsuranceType: null,
      },
      ...vorgang,
    },
  };
}

/** Der Vorgang, wie `validateSupervisorToken` ihn liefert. */
function modalitaetenToken(vorgang: Record<string, unknown> = {}) {
  return {
    valid: true,
    onboarding: {
      id: "ob1",
      status: "IN_PROGRESS",
      submittedAt: null,
      supervisorSubmittedAt: null,
      supervisorToken: SUP_TOKEN,
      email: MA_EMAIL,
      supervisorEmail: "leitung@example.de",
      displayId: "2026-GYM-042",
      firstName: "Anna",
      lastName: "Beispiel",
      organization: { name: "Berufskolleg" },
      personalData: { firstName: "Anna", lastName: "Beispiel" },
      supervisorData: { isComplete: false, befristet: false, kostenstellen: [] },
      ...vorgang,
    },
  };
}

/** Der Stand, den `statusAbgleichen` NACH der Beanspruchung liest. */
function standNachFragebogen(vorgang: Record<string, unknown> = {}) {
  return {
    status: "IN_PROGRESS",
    submittedAt: new Date("2026-09-22T08:00:00Z"),
    supervisorSubmittedAt: null,
    supervisorToken: null,
    personalData: { currentStep: 12, isComplete: true },
    supervisorData: null,
    ...vorgang,
  };
}

function standNachModalitaeten(vorgang: Record<string, unknown> = {}) {
  return {
    status: "IN_PROGRESS",
    submittedAt: null,
    supervisorSubmittedAt: new Date("2026-09-22T08:00:00Z"),
    supervisorToken: SUP_TOKEN,
    personalData: { currentStep: 4, isComplete: false },
    supervisorData: { isComplete: true },
    ...vorgang,
  };
}

/** Die Nutzlast des genannten Ereignisses — oder undefined. */
function payload(event: string): Record<string, unknown> | undefined {
  const aufruf = mockN8n.mock.calls.find((c) => c[0] === event);
  return aufruf?.[1] as Record<string, unknown> | undefined;
}

/** Die Ereignisnamen in der Reihenfolge des Versands. */
function ereignisse(): string[] {
  return mockN8n.mock.calls.map((c) => c[0] as string);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockMagicToken.mockResolvedValue(fragebogenToken());
  mockSupervisorToken.mockResolvedValue(modalitaetenToken());
  mockPrisma.formTemplate.findUnique.mockResolvedValue({ requiredDocuments: [] });
  mockPrisma.document.findMany.mockResolvedValue([]);
  mockPrisma.child.count.mockResolvedValue(0);
  mockPrisma.personalData.findUnique.mockResolvedValue({
    onboardingId: "ob1",
    firstName: "Anna",
    lastName: "Beispiel",
    rvEntscheidung: null,
    socialSecurityNumber: null,
    iban: null,
    taxId: null,
    children: [],
    beschaeftigungsAngaben: [],
  });
  mockPrisma.personalData.update.mockResolvedValue({});
  mockPrisma.supervisorData.update.mockResolvedValue({});
  mockPrisma.auditLog.create.mockResolvedValue({});
  mockPrisma.onboardingProcess.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.onboardingProcess.update.mockResolvedValue({});
  mockPrisma.onboardingProcess.findUnique.mockResolvedValue(null);
  mockPrisma.onboardingProcess.findUniqueOrThrow.mockResolvedValue(standNachFragebogen());
  // Die Transaktions-Rueckrufe laufen echt, gegen dieselben Mocks — und ihr
  // Rueckgabewert traegt den `StatusAbgleich` nach draussen.
  mockPrisma.$transaction.mockImplementation((arg: unknown) =>
    typeof arg === "function"
      ? (arg as (tx: typeof mockPrisma) => unknown)(mockPrisma)
      : Promise.all(arg as unknown[]),
  );
});

describe("Fragebogen abgesendet — Merker fuer die Gegenspur", () => {
  it("meldet „bereit zur Prüfung“, wenn die Modalitaeten schon vorliegen", async () => {
    mockPrisma.onboardingProcess.findUniqueOrThrow.mockResolvedValue(
      standNachFragebogen({
        supervisorToken: "vg-token",
        supervisorSubmittedAt: new Date("2026-09-18T09:00:00Z"),
        supervisorData: { isComplete: true },
      }),
    );

    const res = await FRAGEBOGEN_POST(req(`/api/fragebogen/${TOKEN}`, ABSENDE_RUMPF), {
      params: params(TOKEN)(),
    });

    expect(res.status).toBe(200);
    expect(payload("questionnaire-completed")).toMatchObject({
      modalitaeten_eingereicht: "ja",
      modalitaeten_offen: "",
      ohne_vorgesetzten_link: "",
    });
  });

  it("meldet „Modalitaeten stehen aus“, solange ein Vorgesetzten-Link offen ist", async () => {
    mockPrisma.onboardingProcess.findUniqueOrThrow.mockResolvedValue(
      standNachFragebogen({ supervisorToken: "vg-token" }),
    );

    await FRAGEBOGEN_POST(req(`/api/fragebogen/${TOKEN}`, ABSENDE_RUMPF), {
      params: params(TOKEN)(),
    });

    expect(payload("questionnaire-completed")).toMatchObject({
      modalitaeten_eingereicht: "",
      modalitaeten_offen: "ja",
      ohne_vorgesetzten_link: "",
    });
  });

  it("meldet „kein Vorgesetzten-Link“ (z. B. Ehrenamt)", async () => {
    await FRAGEBOGEN_POST(req(`/api/fragebogen/${TOKEN}`, ABSENDE_RUMPF), {
      params: params(TOKEN)(),
    });

    expect(payload("questionnaire-completed")).toMatchObject({
      modalitaeten_eingereicht: "",
      modalitaeten_offen: "",
      ohne_vorgesetzten_link: "ja",
    });
  });

  it("setzt IMMER genau einen der drei Merker", async () => {
    for (const stand of [
      standNachFragebogen(),
      standNachFragebogen({ supervisorToken: "vg-token" }),
      standNachFragebogen({
        supervisorToken: "vg-token",
        supervisorSubmittedAt: new Date(),
        supervisorData: { isComplete: true },
      }),
    ]) {
      jest.clearAllMocks();
      mockPrisma.onboardingProcess.findUniqueOrThrow.mockResolvedValue(stand);
      await FRAGEBOGEN_POST(req(`/api/fragebogen/${TOKEN}`, ABSENDE_RUMPF), {
        params: params(TOKEN)(),
      });

      const p = payload("questionnaire-completed")!;
      const gesetzt = [
        p.modalitaeten_eingereicht,
        p.modalitaeten_offen,
        p.ohne_vorgesetzten_link,
      ].filter((w) => w !== "");
      expect(gesetzt).toEqual(["ja"]);
    }
  });

  it("sendet die Merker als Zeichenketten, nie als Wahrheitswerte", async () => {
    // `renderTemplate` kennt nur „nicht leer". `false` waere String(false) =
    // "false" — nicht leer, der Block bliebe stehen.
    await FRAGEBOGEN_POST(req(`/api/fragebogen/${TOKEN}`, ABSENDE_RUMPF), {
      params: params(TOKEN)(),
    });

    const p = payload("questionnaire-completed")!;
    for (const feld of [
      "modalitaeten_eingereicht",
      "modalitaeten_offen",
      "ohne_vorgesetzten_link",
    ]) {
      expect(typeof p[feld]).toBe("string");
    }
  });
});

describe("Fragebogen abgesendet — Betreffdaten der HR-Mail", () => {
  it("sendet die Vorgangsnummer mit ({{vorgangsnummer}} kommt aus displayId)", async () => {
    await FRAGEBOGEN_POST(req(`/api/fragebogen/${TOKEN}`, ABSENDE_RUMPF), {
      params: params(TOKEN)(),
    });

    expect(payload("questionnaire-completed")).toMatchObject({
      displayId: "2026-GYM-042",
    });
  });

  it("faellt ohne displayId auf den Anfang der Id zurueck statt auf eine leere Klammer", async () => {
    mockMagicToken.mockResolvedValue(
      fragebogenToken({ id: "abcdef1234567890", displayId: null }),
    );

    await FRAGEBOGEN_POST(req(`/api/fragebogen/${TOKEN}`, ABSENDE_RUMPF), {
      params: params(TOKEN)(),
    });

    expect(payload("questionnaire-completed")?.displayId).toBe("ABCDEF12");
  });

  it("setzt den Namen ausdruecklich — nie die private Adresse der Person", async () => {
    await FRAGEBOGEN_POST(req(`/api/fragebogen/${TOKEN}`, ABSENDE_RUMPF), {
      params: params(TOKEN)(),
    });

    const p = payload("questionnaire-completed")!;
    expect(p.mitarbeiter_name).toBe("Anna Beispiel");
    expect(p.mitarbeiter_name).not.toBe(MA_EMAIL);
  });

  it("nutzt ohne jeden Namen die neutrale Bezeichnung", async () => {
    mockMagicToken.mockResolvedValue(
      fragebogenToken({
        firstName: null,
        lastName: null,
        personalData: {
          firstName: null,
          lastName: null,
          rvEntscheidung: null,
          birthDate: null,
          aufenthaltstitelErforderlich: null,
          healthInsuranceType: null,
        },
      }),
    );

    await FRAGEBOGEN_POST(req(`/api/fragebogen/${TOKEN}`, ABSENDE_RUMPF), {
      params: params(TOKEN)(),
    });

    const p = payload("questionnaire-completed")!;
    expect(p.mitarbeiter_name).toBe(MITARBEITER_NEUTRAL);
    expect(p.mitarbeiter_name).not.toBe(MA_EMAIL);
  });

  it("behaelt die bisherigen Payload-Felder (Abwaertsvertraeglichkeit)", async () => {
    await FRAGEBOGEN_POST(req(`/api/fragebogen/${TOKEN}`, ABSENDE_RUMPF), {
      params: params(TOKEN)(),
    });

    expect(payload("questionnaire-completed")).toMatchObject({
      onboardingId: "ob1",
      email: MA_EMAIL,
      organization: "Berufskolleg",
    });
  });
});

describe("Eingangsbestaetigung an die Person", () => {
  it("laeuft ueber den normalen Versandweg — nicht mehr an ihm vorbei", async () => {
    await FRAGEBOGEN_POST(req(`/api/fragebogen/${TOKEN}`, ABSENDE_RUMPF), {
      params: params(TOKEN)(),
    });

    // Beide Ereignisse gehen ueber den Dispatcher; damit wirken
    // Versandprotokoll, Aktiv-Schalter, Empfaenger- und Antwortfelder.
    expect(ereignisse()).toEqual([
      "questionnaire-completed",
      "questionnaire-confirmation-employee",
    ]);
  });

  it("traegt Anrede, Vorgangsnummer und Empfaengeradresse", async () => {
    await FRAGEBOGEN_POST(req(`/api/fragebogen/${TOKEN}`, ABSENDE_RUMPF), {
      params: params(TOKEN)(),
    });

    // {{email}} traegt ohne gespeicherte Vorlage den Empfaenger — der
    // Katalog-Default des Ereignisses ist genau dieses Feld.
    expect(payload("questionnaire-confirmation-employee")).toMatchObject({
      onboardingId: "ob1",
      displayId: "2026-GYM-042",
      email: MA_EMAIL,
      vorname: "Anna",
      nachname: "Beispiel",
      organization: "Berufskolleg",
    });
  });

  it("liest den Namen ohne eine zweite Abfrage aus dem schon geladenen Fragebogen", async () => {
    mockMagicToken.mockResolvedValue(
      fragebogenToken({
        firstName: "Alt",
        lastName: "Vorgang",
        personalData: {
          firstName: "Neu",
          lastName: "Fragebogen",
          rvEntscheidung: null,
          birthDate: null,
          aufenthaltstitelErforderlich: null,
          healthInsuranceType: null,
        },
      }),
    );

    await FRAGEBOGEN_POST(req(`/api/fragebogen/${TOKEN}`, ABSENDE_RUMPF), {
      params: params(TOKEN)(),
    });

    expect(payload("questionnaire-confirmation-employee")).toMatchObject({
      vorname: "Neu",
      nachname: "Fragebogen",
    });
  });

  it("geht nicht hinaus, wenn die Transaktion scheitert", async () => {
    mockPrisma.$transaction.mockRejectedValue(new Error("Verbindung verloren"));
    const fehler = jest.spyOn(console, "error").mockImplementation(() => {});

    const res = await FRAGEBOGEN_POST(req(`/api/fragebogen/${TOKEN}`, ABSENDE_RUMPF), {
      params: params(TOKEN)(),
    });

    expect(res.status).toBe(500);
    expect(mockN8n).not.toHaveBeenCalled();
    fehler.mockRestore();
  });
});

describe("Modalitaeten abgesendet — Merker fuer die Gegenspur", () => {
  beforeEach(() => {
    mockPrisma.onboardingProcess.findUniqueOrThrow.mockResolvedValue(
      standNachModalitaeten(),
    );
  });

  it("meldet „Fragebogen steht noch aus“, solange er offen ist", async () => {
    const res = await MODALITAETEN_POST(req(`/api/modalitaeten/${SUP_TOKEN}`, {}), {
      params: params(SUP_TOKEN)(),
    });

    expect(res.status).toBe(200);
    expect(payload("supervisor-completed")).toMatchObject({
      fragebogen_eingereicht: "",
      fragebogen_offen: "ja",
    });
  });

  it("meldet „bereit zur Prüfung“, wenn der Fragebogen schon vorliegt", async () => {
    mockPrisma.onboardingProcess.findUniqueOrThrow.mockResolvedValue(
      standNachModalitaeten({
        submittedAt: new Date("2026-09-20T09:00:00Z"),
        personalData: { currentStep: 12, isComplete: true },
      }),
    );

    await MODALITAETEN_POST(req(`/api/modalitaeten/${SUP_TOKEN}`, {}), {
      params: params(SUP_TOKEN)(),
    });

    expect(payload("supervisor-completed")).toMatchObject({
      fragebogen_eingereicht: "ja",
      fragebogen_offen: "",
    });
  });

  it("sendet die Merker als Zeichenketten, nie als Wahrheitswerte", async () => {
    await MODALITAETEN_POST(req(`/api/modalitaeten/${SUP_TOKEN}`, {}), {
      params: params(SUP_TOKEN)(),
    });

    const p = payload("supervisor-completed")!;
    expect(typeof p.fragebogen_eingereicht).toBe("string");
    expect(typeof p.fragebogen_offen).toBe("string");
  });

  it("traegt Vorgangsnummer und Namen — nie die private Adresse der Person", async () => {
    await MODALITAETEN_POST(req(`/api/modalitaeten/${SUP_TOKEN}`, {}), {
      params: params(SUP_TOKEN)(),
    });

    const p = payload("supervisor-completed")!;
    expect(p.displayId).toBe("2026-GYM-042");
    expect(p.mitarbeiter_name).toBe("Anna Beispiel");
    expect(p.mitarbeiter_name).not.toBe(MA_EMAIL);
  });

  it("nutzt ohne jeden Namen die neutrale Bezeichnung", async () => {
    mockSupervisorToken.mockResolvedValue(
      modalitaetenToken({ firstName: null, lastName: null, personalData: null }),
    );

    await MODALITAETEN_POST(req(`/api/modalitaeten/${SUP_TOKEN}`, {}), {
      params: params(SUP_TOKEN)(),
    });

    expect(payload("supervisor-completed")?.mitarbeiter_name).toBe(MITARBEITER_NEUTRAL);
  });

  it("behaelt die bisherigen Payload-Felder (Abwaertsvertraeglichkeit)", async () => {
    await MODALITAETEN_POST(req(`/api/modalitaeten/${SUP_TOKEN}`, {}), {
      params: params(SUP_TOKEN)(),
    });

    expect(payload("supervisor-completed")).toMatchObject({
      onboardingId: "ob1",
      email: MA_EMAIL,
      supervisorEmail: "leitung@example.de",
      organization: "Berufskolleg",
    });
  });

  it("geht nicht hinaus, wenn die Transaktion scheitert", async () => {
    mockPrisma.$transaction.mockRejectedValue(new Error("Verbindung verloren"));
    const fehler = jest.spyOn(console, "error").mockImplementation(() => {});

    const res = await MODALITAETEN_POST(req(`/api/modalitaeten/${SUP_TOKEN}`, {}), {
      params: params(SUP_TOKEN)(),
    });

    expect(res.status).toBe(500);
    expect(mockN8n).not.toHaveBeenCalled();
    fehler.mockRestore();
  });
});
