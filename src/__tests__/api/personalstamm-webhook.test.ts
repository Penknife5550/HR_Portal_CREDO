/**
 * Tests fuer den Stammabgleich-Eingang: POST /api/webhooks/personalstamm
 * Kern: Anmeldung (eigenes PERSONALSTAMM_SECRET, nicht CRON_SECRET),
 * Body-Pruefungen, Durchreichen an die Bibliothek, kein Name im Log.
 * Die Abgleichlogik selbst ist gemockt (eigener Test personalstamm-abgleich).
 */

const mockAbgleichen = jest.fn();

jest.mock("@/lib/personalstamm/abgleich", () => ({
  personalstammAbgleichen: mockAbgleichen,
}));

import { POST } from "@/app/api/webhooks/personalstamm/route";
import { NextRequest } from "next/server";

const SECRET = "personalstamm-test-geheimnis-0123456789";
const CRON = "cron-test-geheimnis-abcdefghijklmnop";
const WEBHOOK_URL = "http://localhost:3000/api/webhooks/personalstamm";

function req(body: unknown, token: string | null = SECRET): NextRequest {
  return new NextRequest(WEBHOOK_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const EINTRAG = {
  mandantNummer: "742",
  abrechnungskreis: "AK1",
  personalNr: "4711",
  vorname: "Max",
  nachname: "Mustermann",
  email: "max.mustermann@fes-minden.de",
  teilzeitstunden: 39.5,
  vertragsbeginn: "2024-08-01",
  vertragsende: null,
};

const ERGEBNIS = {
  success: false,
  summary: {
    zeilen: 2,
    angelegt: 1,
    aktualisiert: 0,
    unveraendert: 0,
    uebersprungen: 0,
    stillgelegt: 0,
    reaktiviert: 0,
    zweifelsfall: 0,
    fehler: 1,
  },
  results: [
    { index: 0, status: "angelegt", schluessel: "742|AK1|4711" },
    { index: 1, status: "fehler", code: "FORMATFEHLER", feld: "vertragsende" },
  ],
};

describe("POST /api/webhooks/personalstamm", () => {
  let logError: jest.SpyInstance;
  let logWarn: jest.SpyInstance;
  let logInfo: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.PERSONALSTAMM_SECRET = SECRET;
    process.env.CRON_SECRET = CRON;
    mockAbgleichen.mockResolvedValue(ERGEBNIS);
    logError = jest.spyOn(console, "error").mockImplementation(() => {});
    logWarn = jest.spyOn(console, "warn").mockImplementation(() => {});
    logInfo = jest.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    logError.mockRestore();
    logWarn.mockRestore();
    logInfo.mockRestore();
  });

  // ---------- Anmeldung ----------

  it("500 Konfigurationsfehler, wenn PERSONALSTAMM_SECRET fehlt", async () => {
    delete process.env.PERSONALSTAMM_SECRET;
    const res = await POST(req(EINTRAG));
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "Konfigurationsfehler" });
    expect(logError).toHaveBeenCalledWith("[personalstamm] PERSONALSTAMM_SECRET fehlt oder ist zu kurz");
    expect(mockAbgleichen).not.toHaveBeenCalled();
  });

  it("500 Konfigurationsfehler, wenn PERSONALSTAMM_SECRET kuerzer als 24 Zeichen ist", async () => {
    process.env.PERSONALSTAMM_SECRET = "a".repeat(23);
    const res = await POST(req(EINTRAG, "a".repeat(23)));
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "Konfigurationsfehler" });
    expect(mockAbgleichen).not.toHaveBeenCalled();
  });

  it("200 mit einem Geheimnis von genau 24 Zeichen", async () => {
    process.env.PERSONALSTAMM_SECRET = "b".repeat(24);
    const res = await POST(req(EINTRAG, "b".repeat(24)));
    expect(res.status).toBe(200);
    expect(mockAbgleichen).toHaveBeenCalledTimes(1);
  });

  it("500 Konfigurationsfehler, wenn PERSONALSTAMM_SECRET gleich CRON_SECRET ist — auch fuer den richtigen Header", async () => {
    process.env.PERSONALSTAMM_SECRET = CRON;
    const res = await POST(req(EINTRAG, CRON));
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "Konfigurationsfehler" });
    expect(logError).toHaveBeenCalledWith("[personalstamm] PERSONALSTAMM_SECRET ist gleich CRON_SECRET");
    expect(JSON.stringify(logError.mock.calls)).not.toContain(CRON);
    expect(mockAbgleichen).not.toHaveBeenCalled();
  });

  it("401 ohne Authorization-Header", async () => {
    const res = await POST(req(EINTRAG, null));
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "Nicht autorisiert" });
    expect(mockAbgleichen).not.toHaveBeenCalled();
  });

  it("401 bei falschem Geheimnis", async () => {
    const res = await POST(req(EINTRAG, "falsches-geheimnis-falsches-geheimnis"));
    expect(res.status).toBe(401);
    expect(mockAbgleichen).not.toHaveBeenCalled();
  });

  it("401 mit CRON_SECRET — der Stammabgleich hat ein eigenes Geheimnis", async () => {
    const res = await POST(req(EINTRAG, CRON));
    expect(res.status).toBe(401);
    expect(mockAbgleichen).not.toHaveBeenCalled();
  });

  // ---------- Body ----------

  it("400 bei unlesbarem Body", async () => {
    const res = await POST(req("kein json"));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Ungültiger Request-Body" });
    expect(mockAbgleichen).not.toHaveBeenCalled();
  });

  it("400 bei JSON, das weder Objekt noch Array ist", async () => {
    for (const wert of ["\"text\"", "42", "null", "true"]) {
      const res = await POST(req(wert));
      expect(res.status).toBe(400);
    }
    expect(mockAbgleichen).not.toHaveBeenCalled();
  });

  it("400 bei leerem Stapel", async () => {
    const res = await POST(req([]));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Leerer Stapel" });
    expect(mockAbgleichen).not.toHaveBeenCalled();
  });

  it("400 bei 201 Eintraegen, 200 gehen durch", async () => {
    const zuViele = await POST(req(Array.from({ length: 201 }, () => EINTRAG)));
    expect(zuViele.status).toBe(400);
    await expect(zuViele.json()).resolves.toEqual({ error: "Maximal 200 Einträge pro Aufruf" });
    expect(mockAbgleichen).not.toHaveBeenCalled();

    const genau = await POST(req(Array.from({ length: 200 }, () => EINTRAG)));
    expect(genau.status).toBe(200);
    expect(mockAbgleichen).toHaveBeenCalledTimes(1);
  });

  it("413 bei einem Body ueber 1 MiB", async () => {
    const res = await POST(req([{ ...EINTRAG, fuellung: "x".repeat(1024 * 1024) }]));
    expect(res.status).toBe(413);
    await expect(res.json()).resolves.toEqual({ error: "Request-Body zu groß (maximal 1 MiB)" });
    expect(mockAbgleichen).not.toHaveBeenCalled();
  });

  // ---------- Durchreichen ----------

  it("macht aus einem einzelnen Objekt einen Stapel", async () => {
    const res = await POST(req(EINTRAG));
    expect(res.status).toBe(200);
    expect(mockAbgleichen).toHaveBeenCalledTimes(1);
    expect(mockAbgleichen).toHaveBeenCalledWith([EINTRAG]);
  });

  it("reicht einen Stapel unveraendert an die Bibliothek", async () => {
    const stapel = [EINTRAG, { ...EINTRAG, personalNr: "4712" }];
    await POST(req(stapel));
    expect(mockAbgleichen).toHaveBeenCalledWith(stapel);
  });

  it("gibt das Ergebnis der Bibliothek mit HTTP 200 durch", async () => {
    const res = await POST(req([EINTRAG, { vorname: "Kaputt" }]));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual(ERGEBNIS);
  });

  // ---------- Log ----------

  it("500 und kein Name, keine Adresse im Log, wenn die Bibliothek wirft", async () => {
    const fehler = Object.assign(
      new Error(`Unique constraint failed: Max Mustermann <${EINTRAG.email}>`),
      { name: "PrismaClientKnownRequestError", code: "P2002", meta: { target: EINTRAG.email } },
    );
    mockAbgleichen.mockRejectedValue(fehler);

    const res = await POST(req(EINTRAG));
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "Interner Serverfehler" });

    expect(logError).toHaveBeenCalledWith(
      "[personalstamm] Schwerer Fehler:",
      "PrismaClientKnownRequestError",
      "P2002",
    );
    const log = JSON.stringify([logError.mock.calls, logWarn.mock.calls, logInfo.mock.calls]);
    expect(log).not.toContain("Mustermann");
    expect(log).not.toContain("Max");
    expect(log).not.toContain(EINTRAG.email);
  });

  it("schreibt im Normalfall nichts ins Log", async () => {
    await POST(req([EINTRAG]));
    expect(logError).not.toHaveBeenCalled();
    expect(logWarn).not.toHaveBeenCalled();
    expect(logInfo).not.toHaveBeenCalled();
  });
});
