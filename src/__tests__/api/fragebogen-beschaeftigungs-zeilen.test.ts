/**
 * Tests: der Loeschpfad der Beschaeftigungs-Zeilen
 * (PUT /api/fragebogen/[token], Abschnitt 4 der Minijob-Checkliste)
 *
 * Der Befund, der diese Suite ausgeloest hat, war stiller Datenverlust in
 * umgekehrter Richtung — es blieb zu VIEL stehen:
 *
 *   Das Formular sendete nur die Zeilenliste. Die Route leitete daraus ab,
 *   welche Kategorien sie leeren darf, und leerte genau die, die in der Liste
 *   VORKAMEN. Eine leere Liste nennt keine Kategorie, also wurde nichts
 *   geloescht. Wer eine Beschaeftigung eintrug, speicherte, zurueckging und die
 *   Grundfrage auf "Nein" stellte, hatte sie danach weiterhin in der
 *   Personalakte, im PDF-Export und in der Pruefsumme der Wahrheitsversicherung
 *   — waehrend das "Nein" daneben stand und ihr widersprach.
 *
 * Die Loesung ist ein zweites Feld: `beschaeftigungsKategorien` nennt, welche
 * der drei Tabellen der sendende Schritt VERANTWORTET. Damit wird
 * "keine Zeilen" von "dazu sende ich nichts" unterscheidbar.
 *
 * Belegt werden hier vier Dinge, in dieser Reihenfolge:
 *
 *  1. Der Widerruf kommt an (der eigentliche Befund).
 *  2. Fremde Kategorien bleiben unangetastet — die Sperre, die den Widerruf
 *     nicht zum Kahlschlag werden laesst.
 *  3. Ohne das neue Feld gilt das ALTE Verhalten weiter. Eine Browser-Sitzung
 *     mit der alten Formularfassung darf keine Zeilen verlieren.
 *  4. Zeilen ersetzen ihre Vorgaenger, statt sich zu ihnen zu addieren.
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

/** Welche Kategorien der Aufruf geleert haette — der Kern dieser Suite. */
function geleerteKategorien(): string[] {
  return mockPrisma.beschaeftigungsAngabe.deleteMany.mock.calls.map(
    (aufruf) => (aufruf[0] as { where: { kategorie: string } }).where.kategorie,
  );
}

/** Welche Zeilen angelegt worden waeren. */
function angelegteZeilen(): { kategorie: string }[] {
  return mockPrisma.beschaeftigungsAngabe.create.mock.calls.map(
    (aufruf) => (aufruf[0] as { data: { kategorie: string } }).data,
  );
}

/** Eine gueltige 4a-Zeile, so wie das Formular sie sendet. */
const weitereZeile = {
  kategorie: "WEITERE",
  beginn: "2026-01-15",
  art: "GERINGFUEGIG_MIT_EIGENANTEIL",
  arbeitgeberName: "Bäckerei Meier",
  arbeitgeberAdresse: null,
};

/** Der Rumpf von Schritt 6, wenn alle drei Tabellen sichtbar sind (MINIJOB). */
const ALLE_DREI = ["WEITERE", "VORBESCHAEFTIGUNG", "AUSLAND"];

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
  mockPrisma.$transaction.mockResolvedValue([]);
});

// =============================================
// 1 — Der Widerruf
// =============================================
describe("Grundfrage zurueck auf Nein", () => {
  it("loescht die vorher eingetragenen Zeilen, obwohl keine mitkommen", async () => {
    const res = await PUT(
      req({
        // Genau das, was das Formular nach einem "Nein" sendet: die drei
        // Grundfragen auf false, keine Zeilen — und die Kategorien, die dieser
        // Schritt verantwortet.
        hasOtherEmployment: false,
        vorbeschaeftigungenVorhanden: false,
        auslandsbeschaeftigungVorhanden: false,
        beschaeftigungsAngaben: [],
        beschaeftigungsKategorien: ALLE_DREI,
        currentStep: 7,
      }),
      { params: params() },
    );

    expect(res.status).toBe(200);
    // Alle drei Tabellen werden geleert — das ist der behobene Befund.
    expect(geleerteKategorien().sort()).toEqual([...ALLE_DREI].sort());
    expect(angelegteZeilen()).toHaveLength(0);
    // Loeschen und Neuanlegen laufen in EINER Transaktion.
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it("laesst die Grundfrage selbst als Nein in der Datenbank stehen", async () => {
    await PUT(
      req({
        hasOtherEmployment: false,
        beschaeftigungsAngaben: [],
        beschaeftigungsKategorien: ALLE_DREI,
      }),
      { params: params() },
    );

    // Sonst stuenden Antwort und Zeilen weiterhin im Widerspruch — nur
    // andersherum als vorher.
    const gespeichert = mockPrisma.personalData.upsert.mock.calls[0][0]
      .update as Record<string, unknown>;
    expect(gespeichert.hasOtherEmployment).toBe(false);
  });

  it("widerruft auch nur EINE Tabelle, ohne die anderen anzufassen", async () => {
    // 4a bleibt bestehen, 4b und 4c werden widerrufen.
    const res = await PUT(
      req({
        beschaeftigungsAngaben: [weitereZeile],
        beschaeftigungsKategorien: ALLE_DREI,
      }),
      { params: params() },
    );

    expect(res.status).toBe(200);
    expect(geleerteKategorien().sort()).toEqual([...ALLE_DREI].sort());
    expect(angelegteZeilen()).toEqual([
      expect.objectContaining({ kategorie: "WEITERE" }),
    ]);
  });
});

// =============================================
// 2 — Fremde Kategorien
// =============================================
describe("Kategorien, die der Schritt nicht verantwortet", () => {
  it("bleiben stehen, wenn der Schritt sie nicht nennt", async () => {
    // So sendet ein Fragebogen, in dem nur 4a sichtbar ist (TV-L, Beamte):
    // `hasOtherEmployment` ist defaultVisible: true, die beiden anderen
    // Grundfragen nicht.
    const res = await PUT(
      req({
        beschaeftigungsAngaben: [],
        beschaeftigungsKategorien: ["WEITERE"],
      }),
      { params: params() },
    );

    expect(res.status).toBe(200);
    // Nur 4a. Zeilen zu 4b/4c koennen unter einer frueheren Fassung der
    // Vorlage ordnungsgemaess entstanden sein — jeder Vorgang haelt seinen
    // eigenen Schnappschuss der Sichtbarkeiten. Ein Schritt, der die Tabelle
    // nicht anzeigt, darf sie deshalb nicht wegraeumen.
    expect(geleerteKategorien()).toEqual(["WEITERE"]);
  });

  it("weist eine erfundene Kategorie ab, statt sie zu ignorieren", async () => {
    const res = await PUT(
      req({
        beschaeftigungsAngaben: [],
        beschaeftigungsKategorien: ["WEITERE", "ALLES"],
      }),
      { params: params() },
    );

    expect(res.status).toBe(400);
    expect(mockPrisma.personalData.upsert).not.toHaveBeenCalled();
  });
});

// =============================================
// 3 — Der Rueckfall fuer alte Browser-Sitzungen
// =============================================
describe("Aufruf ohne beschaeftigungsKategorien", () => {
  it("laesst alles stehen, wenn keine Zeilen mitkommen", async () => {
    // Eine Browser-Sitzung, die noch die alte Formularfassung geladen hat.
    // Sie kann den Widerruf nicht ausdruecken — aber sie darf auch nichts
    // verlieren. Nach einem Neuladen der Seite greift der neue Weg.
    const res = await PUT(req({ beschaeftigungsAngaben: [] }), {
      params: params(),
    });

    expect(res.status).toBe(200);
    expect(geleerteKategorien()).toEqual([]);
  });

  it("ersetzt weiterhin die Kategorien, zu denen Zeilen kommen", async () => {
    const res = await PUT(req({ beschaeftigungsAngaben: [weitereZeile] }), {
      params: params(),
    });

    expect(res.status).toBe(200);
    expect(geleerteKategorien()).toEqual(["WEITERE"]);
    expect(angelegteZeilen()).toHaveLength(1);
  });
});

// =============================================
// 4 — Ersetzen, nicht verdoppeln
// =============================================
describe("Zeilen ersetzen ihre Vorgaenger", () => {
  it("leert eine Kategorie auch dann, wenn nur ihre Zeilen sie nennen", async () => {
    // Der Schutz gegen einen halb ausgefuellten Aufruf: Kaeme eine Zeile zu
    // einer Kategorie, die der Schritt nicht genannt hat, wuerde sie ohne
    // dieses Verhalten NEBEN die alten gelegt — aus Ersetzen wuerde Verdoppeln.
    const res = await PUT(
      req({
        beschaeftigungsAngaben: [weitereZeile],
        beschaeftigungsKategorien: ["AUSLAND"],
      }),
      { params: params() },
    );

    expect(res.status).toBe(200);
    expect(geleerteKategorien().sort()).toEqual(["AUSLAND", "WEITERE"]);
  });

  it("zaehlt den orderIndex je Kategorie, nicht ueber die ganze Liste", async () => {
    const res = await PUT(
      req({
        beschaeftigungsAngaben: [
          weitereZeile,
          { ...weitereZeile, beginn: "2026-02-01" },
          {
            kategorie: "AUSLAND",
            beginn: "2026-03-01",
            ende: null,
            arbeitgeberName: null,
            arbeitgeberAdresse: null,
          },
        ],
        beschaeftigungsKategorien: ALLE_DREI,
      }),
      { params: params() },
    );

    expect(res.status).toBe(200);
    expect(angelegteZeilen()).toEqual([
      expect.objectContaining({ kategorie: "WEITERE", orderIndex: 0 }),
      expect.objectContaining({ kategorie: "WEITERE", orderIndex: 1 }),
      // Die Auslandszeile faengt wieder bei 0 an — sie steht in einer eigenen
      // Tabelle der Oberflaeche.
      expect.objectContaining({ kategorie: "AUSLAND", orderIndex: 0 }),
    ]);
  });

  it("fasst die Zeilen ohne beschaeftigungsAngaben gar nicht an", async () => {
    // Der Auto-Save eines ANDEREN Schritts. Er sendet keine Zeilen und darf
    // deshalb auch keine loeschen — selbst wenn ihm jemand Kategorien
    // unterschiebt.
    const res = await PUT(
      req({ firstName: "Anna", beschaeftigungsKategorien: ALLE_DREI }),
      { params: params() },
    );

    expect(res.status).toBe(200);
    expect(geleerteKategorien()).toEqual([]);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("schreibt beschaeftigungsKategorien nicht als Feld in PersonalData", async () => {
    await PUT(
      req({
        firstName: "Anna",
        beschaeftigungsAngaben: [],
        beschaeftigungsKategorien: ALLE_DREI,
      }),
      { params: params() },
    );

    // Es ist eine Angabe ueber den AUFRUF, keine Spalte des Modells. Landete
    // sie im Update, brechte Prisma zur Laufzeit ab.
    const gespeichert = mockPrisma.personalData.upsert.mock.calls[0][0]
      .update as Record<string, unknown>;
    expect(gespeichert).not.toHaveProperty("beschaeftigungsKategorien");
    expect(gespeichert.firstName).toBe("Anna");
  });
});

// =============================================
// 5 — Die Mengengrenze
// =============================================
describe("Obergrenze von 20 Zeilen", () => {
  const vieleZeilen = (anzahl: number) =>
    Array.from({ length: anzahl }, (_, i) => ({
      ...weitereZeile,
      beginn: `2026-01-${String((i % 28) + 1).padStart(2, "0")}`,
    }));

  it("nimmt 20 Zeilen an", async () => {
    const res = await PUT(
      req({
        beschaeftigungsAngaben: vieleZeilen(20),
        beschaeftigungsKategorien: ALLE_DREI,
      }),
      { params: params() },
    );

    expect(res.status).toBe(200);
    expect(angelegteZeilen()).toHaveLength(20);
  });

  it("weist 21 Zeilen ab — deshalb sperrt das Formular die Knoepfe vorher", async () => {
    const res = await PUT(
      req({
        beschaeftigungsAngaben: vieleZeilen(21),
        beschaeftigungsKategorien: ALLE_DREI,
      }),
      { params: params() },
    );

    expect(res.status).toBe(400);
    expect(mockPrisma.personalData.upsert).not.toHaveBeenCalled();
  });
});
