/**
 * Tests fuer das Einstellungsmodalitaeten-Formular des Vorgesetzten:
 * /api/modalitaeten/[token]
 *
 * Schwerpunkt: Befristung ohne festes Enddatum (Zweckbefristung) und die
 * Behandlung leerer Datumsfelder (leerer String darf NIE an Prisma gehen).
 */

const mockPrisma = {
  supervisorData: { upsert: jest.fn(), update: jest.fn() },
  supervisorKostenstelle: { deleteMany: jest.fn(), createMany: jest.fn() },
  onboardingProcess: { update: jest.fn() },
  auditLog: { create: jest.fn() },
  organization: { findMany: jest.fn() },
  // Die PUT-Route speichert Kopf und Zeilen in EINER interaktiven
  // Transaktion. Der Mock reicht sich selbst als `tx` durch — geprueft wird
  // hier, WAS geschrieben wird, nicht dass Postgres es atomar tut.
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
  // Vorsorglich mitgemockt, obwohl die hier getesteten Routen heute nur
  // `getClientIp` nutzen: Dieser Mock ersetzt das GANZE Modul. Stellt jemand
  // eine dieser Routen spaeter auf die null-Fassung um, kaeme sonst
  // stillschweigend `undefined` zurueck und der Test stuerbe an einem
  // TypeError statt an einer sprechenden Erwartung.
  getClientIpOrNull: () => "127.0.0.1",
}));
jest.mock("@/lib/n8n", () => ({ triggerN8nWebhook: jest.fn() }));

import { POST, PUT } from "@/app/api/modalitaeten/[token]/route";
import { NextRequest } from "next/server";

const TOKEN = "supervisor-token-1234567890";
const params = () => Promise.resolve({ token: TOKEN });

function req(method: "PUT" | "POST", body: Record<string, unknown>): NextRequest {
  return new NextRequest(`http://localhost:3000/api/modalitaeten/${TOKEN}`, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function onboarding(supervisorData: Record<string, unknown> | null = null) {
  return {
    valid: true,
    onboarding: {
      id: "ob1",
      email: "neu@example.de",
      supervisorEmail: "chef@example.de",
      organization: { name: "Christliche Familienhilfe Minden e. V." },
      supervisorData,
    },
  };
}

/** Schritt 1 so, wie ihn das Formular sendet (alle Felder, auch leere). */
const STEP1 = {
  betriebsstaette: "Kingsleyallee 6",
  stellenbeschreibung: "Sozialpaedagogische Familienhilfe",
  vertragsbeginn: "2026-09-01",
  befristet: false,
  befristungsart: "" as const,
  vertragsende: "",
  befristungZweck: "",
  vertragsendeVoraussichtlich: "",
  befristungSachgrund: "",
  currentStep: 1,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockValidate.mockResolvedValue(onboarding());
  // Die id kommt aus dem Upsert und wird fuer die Zeilen gebraucht — deshalb
  // eine interaktive Transaktion und nicht ein Array von Operationen.
  mockPrisma.supervisorData.upsert.mockResolvedValue({ id: "sd1" });
  mockPrisma.supervisorData.update.mockResolvedValue({});
  mockPrisma.supervisorKostenstelle.deleteMany.mockResolvedValue({ count: 0 });
  mockPrisma.supervisorKostenstelle.createMany.mockResolvedValue({ count: 0 });
  mockPrisma.onboardingProcess.update.mockResolvedValue({});
  mockPrisma.auditLog.create.mockResolvedValue({});
  mockPrisma.$transaction.mockImplementation((arg: unknown) =>
    typeof arg === "function"
      ? (arg as (tx: typeof mockPrisma) => unknown)(mockPrisma)
      : Promise.all(arg as unknown[])
  );
});

function savedData() {
  return mockPrisma.supervisorData.upsert.mock.calls[0][0].update as Record<string, unknown>;
}

describe("PUT – leere Datumsfelder", () => {
  it("speichert ein leeres Vertragsende als null statt als leerem String", async () => {
    const res = await PUT(req("PUT", STEP1), { params: params() });

    expect(res.status).toBe(200);
    // Regression: "" an einer DateTime-Spalte liess Prisma scheitern -> 500,
    // der "Weiter"-Button blieb ohne Meldung wirkungslos.
    expect(savedData().vertragsende).toBeNull();
    expect(savedData().vertragsbeginn).toEqual(new Date("2026-09-01"));
  });

  it("speichert ein leeres optionales Ende der Zweckbefristung als null", async () => {
    // Dieser Pfad haengt allein an der Datumsnormalisierung: Der Aufraeum-Block
    // fasst vertragsendeVoraussichtlich im ZWECK-Zweig NICHT an.
    const res = await PUT(
      req("PUT", {
        ...STEP1,
        befristet: true,
        befristungsart: "ZWECK",
        befristungZweck: "Ende der Kostenzusage des Jugendamtes",
        vertragsendeVoraussichtlich: "",
      }),
      { params: params() }
    );

    expect(res.status).toBe(200);
    expect(savedData().vertragsendeVoraussichtlich).toBeNull();
  });

  it("speichert einen leeren Vertragsbeginn als null", async () => {
    // Ebenfalls nur durch die Datumsnormalisierung abgedeckt
    const res = await PUT(req("PUT", { ...STEP1, vertragsbeginn: "" }), { params: params() });

    expect(res.status).toBe(200);
    expect(savedData().vertragsbeginn).toBeNull();
  });

  it("lehnt ein unplausibles Datum mit 400 statt mit einem Serverfehler ab", async () => {
    const res = await PUT(req("PUT", { ...STEP1, vertragsbeginn: "31.09.2026" }), {
      params: params(),
    });

    expect(res.status).toBe(400);
    expect(mockPrisma.supervisorData.upsert).not.toHaveBeenCalled();
  });
});

describe("PUT – Zweckbefristung", () => {
  it("speichert Zweck und voraussichtliches Ende ohne festes Vertragsende", async () => {
    const res = await PUT(
      req("PUT", {
        ...STEP1,
        befristet: true,
        befristungsart: "ZWECK",
        befristungZweck: "Ende der Kostenzusage des Jugendamtes",
        vertragsendeVoraussichtlich: "2027-08-31",
        befristungSachgrund: "projektbezogen",
      }),
      { params: params() }
    );

    expect(res.status).toBe(200);
    expect(savedData()).toMatchObject({
      befristet: true,
      befristungsart: "ZWECK",
      befristungZweck: "Ende der Kostenzusage des Jugendamtes",
      befristungSachgrund: "projektbezogen",
      vertragsende: null,
    });
    expect(savedData().vertragsendeVoraussichtlich).toEqual(new Date("2027-08-31"));
  });

  it("verwirft Zweck-Felder, wenn ein festes Enddatum gewaehlt wurde", async () => {
    await PUT(
      req("PUT", {
        ...STEP1,
        befristet: true,
        befristungsart: "KALENDER",
        vertragsende: "2027-08-31",
        befristungZweck: "alter Text",
        vertragsendeVoraussichtlich: "2027-12-31",
      }),
      { params: params() }
    );

    expect(savedData()).toMatchObject({
      befristungsart: "KALENDER",
      befristungZweck: null,
      vertragsendeVoraussichtlich: null,
    });
    expect(savedData().vertragsende).toEqual(new Date("2027-08-31"));
  });

  it("raeumt alle Befristungsfelder auf, wenn der Haken entfernt wird", async () => {
    await PUT(req("PUT", { ...STEP1, befristet: false }), { params: params() });

    expect(savedData()).toMatchObject({
      befristet: false,
      befristungsart: null,
      vertragsende: null,
      befristungZweck: null,
      vertragsendeVoraussichtlich: null,
      befristungSachgrund: null,
    });
  });

  it("laesst spaetere Schritte unberuehrt (kein Ueberschreiben der Befristung)", async () => {
    await PUT(req("PUT", { wochenstunden: 30, currentStep: 2 }), { params: params() });

    expect(savedData()).toEqual({ wochenstunden: 30, currentStep: 2 });
  });
});

describe("PUT – Kostenstellen-Aufteilung", () => {
  /** Was die deleteMany/createMany-Aufrufe der Zeilentabelle gesehen haben. */
  function geschriebeneZeilen() {
    return mockPrisma.supervisorKostenstelle.createMany.mock.calls[0][0]
      .data as Record<string, unknown>[];
  }

  it("laesst die Aufteilung unberuehrt, wenn der Aufruf sie nicht mitschickt", async () => {
    // DAS ist der gefaehrliche Fall: Die Schritte 1 bis 3 speichern ohne
    // `kostenstellen`. Wuerde die Route die Zeilen trotzdem anfassen, waere die
    // Aufteilung nach dem naechsten Zurueckblaettern weg.
    const res = await PUT(req("PUT", STEP1), { params: params() });

    expect(res.status).toBe(200);
    expect(mockPrisma.supervisorKostenstelle.deleteMany).not.toHaveBeenCalled();
    expect(mockPrisma.supervisorKostenstelle.createMany).not.toHaveBeenCalled();
  });

  it("loescht alle Zeilen bei einem leeren Array", async () => {
    // Der Widerruf. Ein Wahrheitswert-Test statt `Array.isArray` haette [] wie
    // "nichts gesendet" behandelt und die alten Zeilen stehen lassen.
    const res = await PUT(
      req("PUT", { kostenstellen: [], currentStep: 4 }),
      { params: params() }
    );

    expect(res.status).toBe(200);
    expect(mockPrisma.supervisorKostenstelle.deleteMany).toHaveBeenCalledWith({
      where: { supervisorDataId: "sd1" },
    });
    expect(mockPrisma.supervisorKostenstelle.createMany).not.toHaveBeenCalled();
  });

  it("ersetzt die Zeilen und behaelt die Reihenfolge", async () => {
    const res = await PUT(
      req("PUT", {
        kostenstellen: [
          { bezeichnung: "4711", anteil: 60 },
          { bezeichnung: " 4712 ", anteil: 40 },
        ],
        kostenstellenBemerkung: "Aufteilung ab dem zweiten Halbjahr",
        currentStep: 4,
      }),
      { params: params() }
    );

    expect(res.status).toBe(200);
    // Erst raeumen, dann anlegen — sonst wuerde aus Ersetzen ein Verdoppeln.
    expect(mockPrisma.supervisorKostenstelle.deleteMany).toHaveBeenCalled();
    expect(geschriebeneZeilen()).toEqual([
      { supervisorDataId: "sd1", orderIndex: 0, bezeichnung: "4711", anteil: 60 },
      { supervisorDataId: "sd1", orderIndex: 1, bezeichnung: "4712", anteil: 40 },
    ]);
  });

  it("legt das Zeilen-Array NICHT am SupervisorData ab", async () => {
    // `kostenstellen` steht nicht in ALLOWED_FIELDS. Stuende es dort, ginge ein
    // Array an eine Spalte, die es nicht gibt — Prisma antwortete mit 500.
    await PUT(
      req("PUT", {
        kostenstellen: [{ bezeichnung: "4711", anteil: 100 }],
        kostenstellenBemerkung: "Vollständig auf 4711",
        currentStep: 4,
      }),
      { params: params() }
    );

    expect(savedData()).not.toHaveProperty("kostenstellen");
    expect(savedData().kostenstellenBemerkung).toBe("Vollständig auf 4711");
  });

  it("weist eine Aufteilung ab, die nicht genau 100 Prozent ergibt", async () => {
    const res = await PUT(
      req("PUT", {
        kostenstellen: [
          { bezeichnung: "4711", anteil: 60 },
          { bezeichnung: "4712", anteil: 30 },
        ],
        currentStep: 4,
      }),
      { params: params() }
    );

    expect(res.status).toBe(400);
    // Nichts gespeichert: Ein halb angenommener Aufruf waere schlimmer als gar
    // keiner.
    expect(mockPrisma.supervisorData.upsert).not.toHaveBeenCalled();
    expect(mockPrisma.supervisorKostenstelle.deleteMany).not.toHaveBeenCalled();
  });

  it("nimmt die Drittelung 33,33 / 33,33 / 33,34 an", async () => {
    // Der Grund fuer die Rechnung in ganzen Hundertsteln: Als Gleitkommazahl
    // ergibt diese Summe 100.00000000000001.
    const res = await PUT(
      req("PUT", {
        kostenstellen: [
          { bezeichnung: "4711", anteil: 33.33 },
          { bezeichnung: "4712", anteil: 33.33 },
          { bezeichnung: "4713", anteil: 33.34 },
        ],
        currentStep: 4,
      }),
      { params: params() }
    );

    expect(res.status).toBe(200);
    expect(geschriebeneZeilen()).toHaveLength(3);
  });

  /**
   * DER WIEDERGAENGER.
   *
   * Solange `kostenstelle`/`kostenstelleAnteil` neben der Aufteilung stehen
   * (dieses eine Release), braucht die Maske einen Rueckfall auf die
   * Alt-Spalte — ein Vorgang, dessen Datenmigration noch nicht gelaufen ist,
   * soll seine Kostenstelle nicht verlieren. Der Rueckfall kann aber "nie
   * gepflegt" nicht von "gerade bewusst geleert" unterscheiden. Blieb die
   * Alt-Spalte beim Loeschen stehen, setzte er die entfernte Zeile beim
   * naechsten Oeffnen desselben Links wieder ein, und das naechste "Weiter"
   * schrieb sie zurueck in die Datenbank — der Widerruf hielt keinen Reload.
   *
   * Deshalb folgt die Alt-Spalte hier der Aufteilung. Die drei Zusicherungen
   * darunter sind die ganze Regel.
   */
  describe("Alt-Spalte folgt der Aufteilung", () => {
    it("raeumt die Alt-Spalte mit, wenn die letzte Zeile entfernt wird", async () => {
      // Genau der Widerruf: Die vorgesetzte Person entfernt die migrierte
      // Zeile "4711". Bliebe die Alt-Spalte stehen, saehe sie beim naechsten
      // Aufruf desselben Links wieder 4711 in der Maske.
      const res = await PUT(
        req("PUT", {
          kostenstellen: [],
          // Was das Formular vor der Behebung unveraendert zurueckreichte.
          kostenstelle: "4711",
          kostenstelleAnteil: 100,
          currentStep: 4,
        }),
        { params: params() }
      );

      expect(res.status).toBe(200);
      expect(savedData().kostenstelle).toBeNull();
      expect(savedData().kostenstelleAnteil).toBeNull();
    });

    it("spiegelt die erste Zeile in die Alt-Spalte statt den gesendeten Altwert", async () => {
      // Bestandsvorgang mit "4711", jetzt auf 5000/60 % + 6000/40 % geaendert.
      // Der Altwert im Rumpf ist der Wiedergaenger — er darf nicht gewinnen.
      // Die erste Zeile ist dieselbe Lesart, die der CSV-Export fuer die eine
      // LOGA-Spalte "Kostenstelle" benutzt.
      const res = await PUT(
        req("PUT", {
          kostenstellen: [
            { bezeichnung: "5000", anteil: 60 },
            { bezeichnung: "6000", anteil: 40 },
          ],
          kostenstelle: "4711",
          kostenstelleAnteil: 100,
          currentStep: 4,
        }),
        { params: params() }
      );

      expect(res.status).toBe(200);
      expect(savedData().kostenstelle).toBe("5000");
      expect(savedData().kostenstelleAnteil).toBe(60);
    });

    it("nimmt die Alt-Spalte nicht mehr aus dem Aufruf entgegen", async () => {
      // Ohne `kostenstellen` sagt der Aufruf ueber die Aufteilung nichts —
      // dann darf er auch die Alt-Spalte nicht setzen. Sonst bliebe ein Weg
      // offen, ueber den eine Kostenstelle ohne Zeile in die Datenbank kommt,
      // und der Rueckfall in der Maske machte daraus wieder eine Zeile.
      const res = await PUT(
        req("PUT", { kostenstelle: "9999", kostenstelleAnteil: 25, currentStep: 2 }),
        { params: params() }
      );

      expect(res.status).toBe(200);
      expect(savedData()).not.toHaveProperty("kostenstelle");
      expect(savedData()).not.toHaveProperty("kostenstelleAnteil");
      // Und die Zeilen bleiben unberuehrt — "dazu sage ich nichts" heisst
      // nicht "keine mehr".
      expect(mockPrisma.supervisorKostenstelle.deleteMany).not.toHaveBeenCalled();
    });
  });
});

describe("POST – Absenden", () => {
  it("blockiert eine kalendermaessige Befristung ohne Vertragsende", async () => {
    mockValidate.mockResolvedValue(
      onboarding({ befristet: true, befristungsart: "KALENDER", vertragsende: null })
    );

    const res = await POST(req("POST", {}), { params: params() });

    expect(res.status).toBe(400);
    expect(mockPrisma.onboardingProcess.update).not.toHaveBeenCalled();
  });

  it("blockiert eine Zweckbefristung ohne Beschreibung", async () => {
    mockValidate.mockResolvedValue(
      onboarding({ befristet: true, befristungsart: "ZWECK", befristungZweck: "  " })
    );

    const res = await POST(req("POST", {}), { params: params() });

    expect(res.status).toBe(400);
    expect(mockPrisma.onboardingProcess.update).not.toHaveBeenCalled();
  });

  it("laesst eine vollstaendige Zweckbefristung ohne Enddatum durch", async () => {
    mockValidate.mockResolvedValue(
      onboarding({
        befristet: true,
        befristungsart: "ZWECK",
        befristungZweck: "Ende der Kostenzusage des Jugendamtes",
        vertragsende: null,
      })
    );

    const res = await POST(req("POST", {}), { params: params() });

    expect(res.status).toBe(200);
    expect(mockPrisma.onboardingProcess.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "SUPERVISOR_SUBMITTED" }) })
    );
  });

  it("laesst einen unbefristeten Vertrag durch", async () => {
    mockValidate.mockResolvedValue(onboarding({ befristet: false }));

    const res = await POST(req("POST", {}), { params: params() });

    expect(res.status).toBe(200);
  });

  it("blockiert eine Aufteilung, die nicht 100 Prozent ergibt", async () => {
    // Die harte Sperre. Im Formular ist "Weiter" gesperrt — das laesst sich im
    // Browser aber wieder freischalten, und diese Route ist auch ohne Formular
    // erreichbar.
    mockValidate.mockResolvedValue(
      onboarding({
        befristet: false,
        kostenstellen: [{ bezeichnung: "4711", anteil: 60 }],
      })
    );

    const res = await POST(req("POST", {}), { params: params() });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error:
        "Die Anteile ergeben zusammen 60,00 %. Es fehlen 40,00 % auf 100 %. " +
        "Bitte teilen Sie das Gehalt auf genau 100 % auf oder entfernen Sie die Kostenstellen.",
    });
    expect(mockPrisma.onboardingProcess.update).not.toHaveBeenCalled();
  });

  it("laesst einen Vorgang ganz ohne Kostenstellen durch", async () => {
    // Entscheidung des Nutzers: Wer die Kostenstelle noch nicht kennt, darf
    // trotzdem absenden.
    mockValidate.mockResolvedValue(
      onboarding({ befristet: false, kostenstellen: [] })
    );

    const res = await POST(req("POST", {}), { params: params() });

    expect(res.status).toBe(200);
  });

  it("laesst eine vollstaendige Aufteilung durch", async () => {
    mockValidate.mockResolvedValue(
      onboarding({
        befristet: false,
        kostenstellen: [
          { bezeichnung: "4711", anteil: 33.33 },
          { bezeichnung: "4712", anteil: 33.33 },
          { bezeichnung: "4713", anteil: 33.34 },
        ],
      })
    );

    const res = await POST(req("POST", {}), { params: params() });

    expect(res.status).toBe(200);
  });
});
