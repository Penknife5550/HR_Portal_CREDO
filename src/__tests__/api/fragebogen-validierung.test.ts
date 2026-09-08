/**
 * Tests: serverseitige Validierung des Auto-Save
 * (PUT /api/fragebogen/[token])
 *
 * Hintergrund ist eine Meldung aus dem Betrieb: Beschaeftigte kamen in
 * Schritt 6 nicht weiter, es erschien nur "Validierungsfehler". Ursache war das
 * Zusammenspiel zweier Schemata:
 *
 *   - Das Client-Schema (validations/personal-data.ts) laesst fuer ein
 *     AUSGEBLENDETES Auswahlfeld ein blankes `z.string()` zu — der leere
 *     Vorgabewert `""` geht also regelkonform durch und wird mitgesendet.
 *   - Das Server-Schema verlangte an derselben Stelle `z.enum([...]).optional()`.
 *     `""` ist kein Enum-Wert, also scheiterte der GANZE Rumpf mit 400.
 *
 * Weil `beschaeftigungsStatus` nur in der Vorlage MINIJOB sichtbar ist
 * (field-definitions.ts, defaultVisible: false), traf das jeden anderen
 * Fragebogentyp — TV-L, Beamte, Erzieher.
 *
 * Die Suite haelt drei Dinge fest: leere Auswahlfelder und leere Zahlenfelder
 * blockieren die Speicherung nicht mehr, ein leeres Feld landet trotzdem NICHT
 * als Wert in der Datenbank, und ein wirklich falscher Wert wird weiterhin
 * abgewiesen.
 */

const mockPrisma = {
  onboardingProcess: { update: jest.fn() },
  personalData: { upsert: jest.fn() },
  child: { deleteMany: jest.fn(), createMany: jest.fn() },
  beschaeftigungsAngabe: { deleteMany: jest.fn(), create: jest.fn() },
  $transaction: jest.fn(),
};
const mockValidate = jest.fn();

jest.mock("@/lib/db", () => ({ prisma: mockPrisma }));
jest.mock("@/lib/auth", () => ({
  validateMagicToken: (...args: unknown[]) => mockValidate(...args),
}));
jest.mock("@/lib/rate-limit", () => ({
  tokenRateLimiter: { check: () => ({ allowed: true }) },
  getClientIp: () => "203.0.113.7",
  getClientIpOrNull: () => "203.0.113.7",
}));
jest.mock("@/lib/n8n", () => ({ triggerN8nWebhook: jest.fn() }));
jest.mock("@/lib/mailer", () => ({ sendEmail: jest.fn() }));
jest.mock("@/lib/encryption", () => ({
  encrypt: (v: string) => v,
  decrypt: (v: string) => v,
  isEncryptionConfigured: () => true,
}));

import { PUT } from "@/app/api/fragebogen/[token]/route";
import { NextRequest } from "next/server";

const TOKEN = "magic-token-1234567890";
const params = () => Promise.resolve({ token: TOKEN });

function req(body: Record<string, unknown>): NextRequest {
  return new NextRequest(`http://localhost:3000/api/fragebogen/${TOKEN}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Was der Speicherpfad tatsaechlich in `PersonalData` schreiben wuerde. */
function gespeicherteFelder(): Record<string, unknown> {
  expect(mockPrisma.personalData.upsert).toHaveBeenCalledTimes(1);
  return mockPrisma.personalData.upsert.mock.calls[0][0].update as Record<
    string,
    unknown
  >;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockValidate.mockResolvedValue({
    valid: true,
    onboarding: {
      id: "ob1",
      status: "IN_PROGRESS",
      email: "neu@example.de",
      organization: { name: "Berufskolleg" },
    },
  });
  mockPrisma.personalData.upsert.mockResolvedValue({ id: "pd1" });
  mockPrisma.onboardingProcess.update.mockResolvedValue({});
});

// =============================================
// Befund 1 — der gemeldete Fehler
// =============================================
describe("Schritt 6 mit ausgeblendetem Statusfeld", () => {
  /**
   * Genau der Rumpf, den ein TV-L-Fragebogen in Schritt 6 sendet: Das
   * Statusfeld ist ausgeblendet und steht deshalb auf dem leeren Vorgabewert.
   */
  const schritt6 = {
    beschaeftigungsStatus: "",
    hasOtherEmployment: false,
    employerType: "hauptarbeitgeber",
    vorbeschaeftigungenVorhanden: false,
    auslandsbeschaeftigungVorhanden: false,
    alsArbeitsuchendGemeldet: false,
    currentStep: 6,
  };

  it("nimmt den leeren beschaeftigungsStatus an, statt den ganzen Schritt mit 400 abzuweisen", async () => {
    const res = await PUT(req(schritt6), { params: params() });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      success: true,
      currentStep: 6,
    });
  });

  it("schreibt den leeren Wert NICHT als Angabe in die Datenbank", async () => {
    await PUT(req(schritt6), { params: params() });

    const gespeichert = gespeicherteFelder();
    // Weder "" noch null: Ein ausgeblendetes Feld ist keine Angabe, und der
    // Auto-Save darf eine frueher gespeicherte Angabe nicht loeschen.
    expect(gespeichert).not.toHaveProperty("beschaeftigungsStatus");
    // Die uebrigen Felder desselben Schritts kommen unbeschadet durch — das
    // war der eigentliche Schaden: Ein Feld riss den ganzen Rumpf mit.
    expect(gespeichert.employerType).toBe("hauptarbeitgeber");
    expect(gespeichert.hasOtherEmployment).toBe(false);
    expect(gespeichert.currentStep).toBe(6);
  });

  it("speichert einen echten Status weiterhin", async () => {
    const res = await PUT(
      req({ ...schritt6, beschaeftigungsStatus: "STUDENT" }),
      { params: params() },
    );

    expect(res.status).toBe(200);
    expect(gespeicherteFelder().beschaeftigungsStatus).toBe("STUDENT");
  });

  it("weist einen erfundenen Status weiterhin ab", async () => {
    const res = await PUT(
      req({ ...schritt6, beschaeftigungsStatus: "ADMIN" }),
      { params: params() },
    );

    expect(res.status).toBe(400);
    expect(mockPrisma.personalData.upsert).not.toHaveBeenCalled();
  });
});

// =============================================
// Befund 2 — dasselbe Muster fuer jedes Auswahlfeld
// =============================================
describe("Auswahlfelder vertragen den leeren Vorgabewert", () => {
  /** Feldname und ein gueltiger Wert dazu. */
  const AUSWAHLFELDER: [string, string][] = [
    ["salutation", "Herr"],
    ["maritalStatus", "ledig"],
    ["healthInsuranceType", "gesetzlich"],
    ["taxClass", "IV"],
    ["religion", "ev"],
    ["highestSchoolDegree", "abitur_fachabitur"],
    ["highestProfessionalDegree", "bachelor"],
    ["employerType", "hauptarbeitgeber"],
    ["rvEntscheidung", "KEINE_BEFREIUNG"],
    ["beschaeftigungsStatus", "STUDENT"],
  ];

  it.each(AUSWAHLFELDER)('%s: "" wird angenommen und nicht gespeichert', async (feld) => {
    const res = await PUT(req({ [feld]: "", firstName: "Anna" }), {
      params: params(),
    });

    expect(res.status).toBe(200);
    expect(gespeicherteFelder()).not.toHaveProperty(feld);
  });

  it.each(AUSWAHLFELDER)("%s: null wird angenommen und nicht gespeichert", async (feld) => {
    const res = await PUT(req({ [feld]: null, firstName: "Anna" }), {
      params: params(),
    });

    expect(res.status).toBe(200);
    expect(gespeicherteFelder()).not.toHaveProperty(feld);
  });

  it.each(AUSWAHLFELDER)("%s: ein gueltiger Wert kommt weiterhin an", async (feld, wert) => {
    const res = await PUT(req({ [feld]: wert }), { params: params() });

    expect(res.status).toBe(200);
    expect(gespeicherteFelder()[feld]).toBe(wert);
  });

  it.each(AUSWAHLFELDER)("%s: ein unbekannter Wert wird weiterhin abgewiesen", async (feld) => {
    const res = await PUT(req({ [feld]: "UNSINN" }), { params: params() });

    expect(res.status).toBe(400);
    expect(mockPrisma.personalData.upsert).not.toHaveBeenCalled();
  });

  it("blockiert nicht den ganzen Rumpf, wenn alle Auswahlfelder leer sind", async () => {
    const alleLeer = Object.fromEntries(
      AUSWAHLFELDER.map(([feld]) => [feld, ""]),
    );

    const res = await PUT(req({ ...alleLeer, firstName: "Anna", city: "Minden" }), {
      params: params(),
    });

    expect(res.status).toBe(200);
    const gespeichert = gespeicherteFelder();
    expect(gespeichert.firstName).toBe("Anna");
    expect(gespeichert.city).toBe("Minden");
  });
});

// =============================================
// Befund 3 — Zahlenfelder
// =============================================
describe("Zahlenfelder vertragen ein geleertes Eingabefeld", () => {
  const ZAHLENFELDER: [string, number][] = [
    ["disabilityDegree", 50],
    ["taxAllowance", 1200],
    ["childAllowance", 2],
    ["otherWeeklyHours", 10],
  ];

  // "" kommt aus einem Textfeld ohne valueAsNumber, null aus JSON.stringify
  // eines NaN — react-hook-form liefert fuer ein geleertes Zahlenfeld NaN.
  it.each(ZAHLENFELDER)('%s: "" weist die Speicherung nicht ab', async (feld) => {
    const res = await PUT(req({ [feld]: "", firstName: "Anna" }), {
      params: params(),
    });

    expect(res.status).toBe(200);
    expect(gespeicherteFelder()).not.toHaveProperty(feld);
  });

  it.each(ZAHLENFELDER)("%s: null weist die Speicherung nicht ab", async (feld) => {
    const res = await PUT(req({ [feld]: null, firstName: "Anna" }), {
      params: params(),
    });

    expect(res.status).toBe(200);
    expect(gespeicherteFelder()).not.toHaveProperty(feld);
  });

  it.each(ZAHLENFELDER)("%s: die 0 bleibt eine Angabe", async (feld) => {
    const res = await PUT(req({ [feld]: 0 }), { params: params() });

    expect(res.status).toBe(200);
    // Die 0 ist gueltig — ein Freibetrag von 0 oder ein Grad der Behinderung
    // von 0 sind Aussagen, keine Leerstellen.
    expect(gespeicherteFelder()[feld]).toBe(0);
  });

  it.each(ZAHLENFELDER)("%s: ein echter Wert kommt weiterhin an", async (feld, wert) => {
    const res = await PUT(req({ [feld]: wert }), { params: params() });

    expect(res.status).toBe(200);
    expect(gespeicherteFelder()[feld]).toBe(wert);
  });

  it("weist eine Zahl ausserhalb der Grenzen weiterhin ab", async () => {
    const res = await PUT(req({ disabilityDegree: 120 }), { params: params() });

    expect(res.status).toBe(400);
    expect(mockPrisma.personalData.upsert).not.toHaveBeenCalled();
  });

  it("weist Buchstaben in einem Zahlenfeld weiterhin ab", async () => {
    const res = await PUT(req({ taxAllowance: "zwoelfhundert" }), {
      params: params(),
    });

    expect(res.status).toBe(400);
    expect(mockPrisma.personalData.upsert).not.toHaveBeenCalled();
  });
});
