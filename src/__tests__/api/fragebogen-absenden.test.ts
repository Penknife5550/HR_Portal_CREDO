/**
 * Tests: das Absenden des Personalfragebogens
 * (POST /api/fragebogen/[token])
 *
 * Schwerpunkt ist die Stelle mit den groessten Folgen: Der Vorgang traegt hier
 * die Wahrheitsversicherung ein, die im Portal die Unterschrift ersetzt, setzt
 * den Status und schreibt den Nachweis ins Protokoll. Alle drei muessen
 * gemeinsam gelingen oder gemeinsam ausbleiben, und genau ein Aufrufer darf
 * gewinnen -- zwei Protokollsaetze mit verschiedenen Pruefsummen zur selben
 * Erklaerung machen den Unterschriftsersatz in der Betriebspruefung
 * mehrdeutig.
 */

const mockPrisma = {
  formTemplate: { findUnique: jest.fn() },
  document: { findMany: jest.fn() },
  child: { count: jest.fn() },
  personalData: { findUnique: jest.fn(), update: jest.fn() },
  onboardingProcess: { updateMany: jest.fn() },
  auditLog: { create: jest.fn() },
  emailTemplate: { findUnique: jest.fn() },
  $transaction: jest.fn(),
};
const mockValidate = jest.fn();
const mockSendEmail = jest.fn();

jest.mock("@/lib/db", () => ({ prisma: mockPrisma }));
jest.mock("@/lib/auth", () => ({
  validateMagicToken: (...args: unknown[]) => mockValidate(...args),
}));
jest.mock("@/lib/rate-limit", () => ({
  tokenRateLimiter: { check: () => ({ allowed: true }) },
  getClientIp: () => "203.0.113.7",
}));
jest.mock("@/lib/n8n", () => ({ triggerN8nWebhook: jest.fn() }));
jest.mock("@/lib/mailer", () => ({ sendEmail: (...a: unknown[]) => mockSendEmail(...a) }));
jest.mock("@/lib/encryption", () => ({
  encrypt: (v: string) => v,
  decrypt: (v: string) => v,
  isEncryptionConfigured: () => true,
}));

import { POST } from "@/app/api/fragebogen/[token]/route";
import { AKTUELLE_ERKLAERUNG } from "@/lib/erklaerung-arbeitnehmer";
import { NextRequest } from "next/server";

const TOKEN = "magic-token-1234567890";
const params = () => Promise.resolve({ token: TOKEN });

/** Genau der Rumpf, den Schritt 10 sendet. */
function absendeRumpf(overrides: Record<string, unknown> = {}) {
  return {
    dsgvoAccepted: true,
    erklaerungAccepted: true,
    erklaerungOrt: "Minden",
    erklaerungVersion: AKTUELLE_ERKLAERUNG.version,
    ...overrides,
  };
}

function req(body: Record<string, unknown>): NextRequest {
  return new NextRequest(`http://localhost:3000/api/fragebogen/${TOKEN}`, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "Jest" },
    body: JSON.stringify(body),
  });
}

function tokenAntwort(status = "IN_PROGRESS") {
  return {
    valid: true,
    onboarding: {
      id: "ob1",
      status,
      email: "neu@example.de",
      firstName: "Anna",
      lastName: "Beispiel",
      displayId: "AB123456",
      questionnaireType: "MINIJOB",
      organization: { name: "Berufskolleg" },
      personalData: { rvEntscheidung: null },
    },
  };
}

/** Fuehrt die Transaktions-Rueckrufe echt aus, gegen dieselben Mocks. */
function transaktionLaeuftDurch() {
  mockPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
    fn(mockPrisma)
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockValidate.mockResolvedValue(tokenAntwort());
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
  mockPrisma.auditLog.create.mockResolvedValue({});
  mockPrisma.emailTemplate.findUnique.mockResolvedValue(null);
  // Standardfall: dieser Aufrufer beansprucht den Vorgang erfolgreich.
  mockPrisma.onboardingProcess.updateMany.mockResolvedValue({ count: 1 });
  transaktionLaeuftDurch();
});

describe("Absenden — Erfolgsfall", () => {
  it("nimmt den Fragebogen an und beansprucht den Vorgang bedingt", async () => {
    const res = await POST(req(absendeRumpf()), { params: params() });
    expect(res.status).toBe(200);

    // Der Statuswechsel ist die Sperre: EIN UPDATE ... WHERE status IN (...).
    expect(mockPrisma.onboardingProcess.updateMany).toHaveBeenCalledTimes(1);
    const arg = mockPrisma.onboardingProcess.updateMany.mock.calls[0][0];
    expect(arg.where).toMatchObject({ id: "ob1" });
    expect(arg.where.status.in).toEqual(["INVITED", "IN_PROGRESS"]);
    expect(arg.data.status).toBe("SUBMITTED");
  });

  it("schreibt Erklaerung, Status und Protokoll in genau einer Transaktion", async () => {
    await POST(req(absendeRumpf()), { params: params() });
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mockPrisma.personalData.update).toHaveBeenCalledTimes(1);
    expect(mockPrisma.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it("stempelt Erklaerung, Status und Protokoll auf denselben Zeitpunkt", async () => {
    // submittedAt ist der Anker fuer das RV-Wirkungsdatum beim
    // Aufhebungsantrag. Drei leicht verschiedene Zeitstempel fuer einen
    // Vorgang waeren in der Akte nicht erklaerbar.
    await POST(req(absendeRumpf()), { params: params() });
    const submittedAt: Date =
      mockPrisma.onboardingProcess.updateMany.mock.calls[0][0].data.submittedAt;
    const erklaertAm: Date =
      mockPrisma.personalData.update.mock.calls[0][0].data.erklaerungAcceptedAt;
    const protokoll: string =
      mockPrisma.auditLog.create.mock.calls[0][0].data.details.submittedAt;

    expect(erklaertAm.getTime()).toBe(submittedAt.getTime());
    expect(protokoll).toBe(submittedAt.toISOString());
  });

  it("haelt Ort, Version und Pruefsumme der Erklaerung fest", async () => {
    await POST(req(absendeRumpf()), { params: params() });
    const daten = mockPrisma.personalData.update.mock.calls[0][0].data;
    expect(daten).toMatchObject({
      erklaerungAccepted: true,
      erklaerungOrt: "Minden",
      erklaerungIp: "203.0.113.7",
      erklaerungVersion: AKTUELLE_ERKLAERUNG.version,
    });
    expect(typeof daten.erklaerungPruefsumme).toBe("string");
    expect(daten.erklaerungPruefsumme.length).toBeGreaterThan(0);
    // Dieselbe Pruefsumme muss im Protokoll stehen, sonst ist sie kein Nachweis.
    expect(mockPrisma.auditLog.create.mock.calls[0][0].data.details.erklaerungPruefsumme)
      .toBe(daten.erklaerungPruefsumme);
  });
});

describe("Absenden — Doppel-Submit", () => {
  it("laesst nur einen von zwei gleichzeitigen Absendern durch", async () => {
    // Beide kommen an der vorgelagerten Statuspruefung vorbei (der Lesestand
    // ist fuer beide IN_PROGRESS); erst das bedingte UPDATE trennt sie.
    mockPrisma.onboardingProcess.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    const [erster, zweiter] = await Promise.all([
      POST(req(absendeRumpf()), { params: params() }),
      POST(req(absendeRumpf()), { params: params() }),
    ]);

    const codes = [erster.status, zweiter.status].sort();
    expect(codes).toEqual([200, 409]);
    // Der Verlierer darf weder Erklaerung noch Protokoll geschrieben haben.
    expect(mockPrisma.auditLog.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.personalData.update).toHaveBeenCalledTimes(1);
  });

  it("antwortet 409, wenn der Vorgang zwischenzeitlich beansprucht wurde", async () => {
    mockPrisma.onboardingProcess.updateMany.mockResolvedValue({ count: 0 });
    const res = await POST(req(absendeRumpf()), { params: params() });
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({
      error: "Fragebogen wurde bereits eingereicht.",
    });
  });

  it("weist den schnellen Weg ab, wenn der Vorgang schon eingereicht ist", async () => {
    mockValidate.mockResolvedValue(tokenAntwort("SUBMITTED"));
    const res = await POST(req(absendeRumpf()), { params: params() });
    expect(res.status).toBe(409);
    // Gar nicht erst Dokumente und Pruefsumme laden.
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });
});

describe("Absenden — Fehlerfall bleibt folgenlos", () => {
  it("meldet 500 und laesst keinen Teilzustand zurueck, wenn die Transaktion bricht", async () => {
    mockPrisma.$transaction.mockRejectedValue(new Error("Verbindung verloren"));
    const fehler = jest.spyOn(console, "error").mockImplementation(() => {});

    const res = await POST(req(absendeRumpf()), { params: params() });

    expect(res.status).toBe(500);
    // Kein "erfolgreich eingereicht" an den Beschaeftigten und keine
    // Bestaetigungsmail zu einem Vorgang, der nicht abgesendet wurde.
    await expect(res.json()).resolves.not.toMatchObject({ success: true });
    expect(mockSendEmail).not.toHaveBeenCalled();
    fehler.mockRestore();
  });
});

describe("Absenden — Vorbedingungen", () => {
  it("verlangt die Bestaetigung der Erklaerung", async () => {
    const res = await POST(
      req(absendeRumpf({ erklaerungAccepted: false })),
      { params: params() }
    );
    expect(res.status).toBe(400);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("verlangt den Ort — er gehoert zur Unterschrift", async () => {
    const res = await POST(req(absendeRumpf({ erklaerungOrt: "" })), { params: params() });
    expect(res.status).toBe(400);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("lehnt eine unbekannte Erklaerungsversion ab", async () => {
    const res = await POST(
      req(absendeRumpf({ erklaerungVersion: "phantasie-9.9" })),
      { params: params() }
    );
    expect(res.status).toBe(409);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("sperrt, solange ein Pflichtdokument fehlt", async () => {
    mockPrisma.formTemplate.findUnique.mockResolvedValue({
      requiredDocuments: ["GEBURTSURKUNDE_EIGEN"],
    });
    const res = await POST(req(absendeRumpf()), { params: params() });
    expect(res.status).toBe(400);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("verlangt die Rentenversicherungsnummer, wenn eine Befreiung beantragt wurde", async () => {
    mockPrisma.personalData.findUnique.mockResolvedValue({
      onboardingId: "ob1",
      rvEntscheidung: "BEFREIUNG_BEANTRAGT",
      socialSecurityNumber: null,
      iban: null,
      taxId: null,
      children: [],
      beschaeftigungsAngaben: [],
    });
    // Der Befreiungsantrag ist dann zugleich Pflichtdokument — hier nicht der
    // Punkt, deshalb als vorhanden gemeldet.
    mockPrisma.document.findMany.mockResolvedValue([{ type: "RV_BEFREIUNG" }]);

    const res = await POST(req(absendeRumpf()), { params: params() });
    expect(res.status).toBe(400);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });
});
