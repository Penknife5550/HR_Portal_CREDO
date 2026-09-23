/**
 * Tests: `bornAfter1971` zieht dem Geburtsdatum nach
 * (PUT /api/fragebogen/[token])
 *
 * DER BEFUND. Die Spalte `bornAfter1971` ist keine eigene Antwort, sondern eine
 * Ableitung aus `birthDate`. Geschrieben wurde sie beim Verlassen von Schritt 9
 * und danach nie wieder — sie konnte also veralten:
 *
 *   Zahlendreher 1990 in Schritt 1, Schritt 9 durchlaufen (`bornAfter1971` =
 *   true), ueber die Schrittleiste zurueck zu Schritt 1, dort auf 1965
 *   korrigiert. In der Datenbank stand danach ein "nach 1970 geboren" neben
 *   einem Geburtsjahr von 1965.
 *
 * Portal-Ansicht und Personalakte-PDF fangen das beim LESEN mit
 * `nach1970GeborenAnzeige` ab. Der JSON-Export (`/api/onboarding/[id]/export`)
 * reicht `personalData` dagegen unveraendert weiter — die falsche der beiden
 * Auskuenfte war damit ausgerechnet die maschinenlesbare. Deshalb wird der Wert
 * jetzt an der Quelle nachgezogen.
 *
 * DIE SCHRANKE, die dabei halten muss: nachziehen, nicht neu erfinden. Steht in
 * der Spalte noch nichts, wurde Schritt 9 nie durchlaufen (bei der Vorlage
 * MINIJOB ist er abgeschaltet). Ein aus Schritt 1 heraus gesetzter Wert machte
 * aus der nie gestellten Frage eine beantwortete — und die Zusammenfassung in
 * Schritt 10 zeigt den Masernschutz-Abschnitt genau dann, wenn eine Angabe
 * vorliegt.
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

/**
 * Der Vorgang, wie ihn `validateMagicToken` liefert — mit dem GESPEICHERTEN
 * Stand der Spalte. Genau der entscheidet, ob nachgezogen werden darf.
 */
function vorgangMit(gespeichert: boolean | null) {
  mockValidate.mockResolvedValue({
    valid: true,
    onboarding: {
      id: "ob1",
      status: "IN_PROGRESS",
      email: "neu@example.de",
      organization: { name: "Grundschule Beispiel" },
      personalData: { id: "pd1", bornAfter1971: gespeichert },
    },
  });
}

/** Die Felder, mit denen die Route `personalData` fortschreiben wuerde. */
function geschrieben(): Record<string, unknown> {
  const aufruf = mockPrisma.personalData.upsert.mock.calls[0]?.[0] as
    | { update: Record<string, unknown> }
    | undefined;
  if (!aufruf) throw new Error("personalData.upsert wurde nicht aufgerufen");
  return aufruf.update;
}

beforeEach(() => {
  jest.clearAllMocks();
  vorgangMit(null);
  mockPrisma.personalData.upsert.mockResolvedValue({ id: "pd1" });
  mockPrisma.onboardingProcess.update.mockResolvedValue({});
  mockPrisma.$transaction.mockResolvedValue([]);
});

// =============================================
// 1 — Der Befund
// =============================================
describe("korrigiertes Geburtsdatum", () => {
  it("zieht ein eingefrorenes Ja auf Nein nach", async () => {
    // Schritt 9 ist gelaufen und hat den Zahlendreher festgehalten.
    vorgangMit(true);

    // Schritt 1 sendet nur das korrigierte Datum — so, wie das Formular es tut.
    const res = await PUT(req({ birthDate: "1965-04-03", currentStep: 2 }), {
      params: params(),
    });

    expect(res.status).toBe(200);
    expect(geschrieben().bornAfter1971).toBe(false);
  });

  it("zieht auch in die andere Richtung nach", async () => {
    // Das spiegelverkehrte Bild: ein stilles "Nein" fuer eine nach 1970
    // geborene Person — genau der Fall, dessen Beseitigung der Anlass des
    // ganzen Umbaus war.
    vorgangMit(false);

    await PUT(req({ birthDate: "1990-04-17", currentStep: 2 }), {
      params: params(),
    });

    expect(geschrieben().bornAfter1971).toBe(true);
  });

  it("liest das Jahr in UTC — der 01.01.1971 bleibt nachweispflichtig", async () => {
    // Auf einem Server westlich von Greenwich liefert die Ortszeit fuer
    // `new Date("1971-01-01")` den 31.12.1970 und damit ausgerechnet an der
    // Jahresgrenze die falsche Antwort.
    vorgangMit(false);

    await PUT(req({ birthDate: "1971-01-01", currentStep: 2 }), {
      params: params(),
    });

    expect(geschrieben().bornAfter1971).toBe(true);
  });
});

// =============================================
// 2 — Die Schranke
// =============================================
describe("Schritt 9 wurde nie durchlaufen", () => {
  it("erfindet keinen Wert, nur weil ein Geburtsdatum ankommt", async () => {
    // MINIJOB: Schritt 9 ist abgeschaltet, die Frage wird nie gestellt. Ein
    // hier gesetztes `bornAfter1971` liesse in Schritt 10 einen
    // Masernschutz-Abschnitt erscheinen, den es nie gab.
    vorgangMit(null);

    await PUT(req({ birthDate: "1990-04-17", currentStep: 2 }), {
      params: params(),
    });

    expect(geschrieben()).not.toHaveProperty("bornAfter1971");
  });

  it("erfindet auch beim ersten Speichern keinen Wert", async () => {
    // Noch gar kein `personalData`: Schritt 1 legt den Datensatz gerade erst an.
    mockValidate.mockResolvedValue({
      valid: true,
      onboarding: {
        id: "ob1",
        status: "IN_PROGRESS",
        email: "neu@example.de",
        organization: { name: "Grundschule Beispiel" },
        personalData: null,
      },
    });

    await PUT(req({ birthDate: "1990-04-17", currentStep: 2 }), {
      params: params(),
    });

    expect(geschrieben()).not.toHaveProperty("bornAfter1971");
  });
});

// =============================================
// 3 — Keine Kollision mit Schritt 9
// =============================================
describe("Schritt 9 selbst", () => {
  it("darf die Spalte weiterhin setzen", async () => {
    // Schritt 9 sendet den abgeleiteten Wert ohne `birthDate`. Das
    // Nachziehen darf ihm nicht in den Weg kommen — sonst koennte die Spalte
    // ueberhaupt nie einen ersten Wert bekommen.
    vorgangMit(null);

    await PUT(
      req({
        bornAfter1971: true,
        masernschutzProvided: false,
        currentStep: 10,
      }),
      { params: params() },
    );

    expect(geschrieben().bornAfter1971).toBe(true);
    expect(geschrieben().masernschutzProvided).toBe(false);
  });

  it("laesst die Spalte in Ruhe, wenn kein Geburtsdatum mitkommt", async () => {
    // Jeder andere Schritt: Was gespeichert ist, bleibt stehen.
    vorgangMit(true);

    await PUT(req({ taxClass: "I", currentStep: 6 }), { params: params() });

    expect(geschrieben()).not.toHaveProperty("bornAfter1971");
  });
});
