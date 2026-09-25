/**
 * Tests: HR-Routen „Unterlagen nachfordern" (Paket 4, Schritt 4)
 *
 *   POST /api/onboarding/[id]/unterlagen   (die fuenf Aktionen)
 *   GET  /api/onboarding/[id]              (Feld `unterlagen`)
 *
 * Die Fachlogik steckt in src/lib/unterlagen-dienst.ts und ist dort getestet
 * (src/__tests__/lib/unterlagen-dienst.test.ts). Hier geht es um das, was die
 * Routen SELBST tun: Sitzung, Body (kaputt/leer/ohne Aktion → 400, nie eine
 * Standardaktion), EINE Dienstfunktion, Antwort 1:1 samt `Retry-After`, 500
 * ohne Personendaten im Log — und, mit dem echten Dienst gegen die
 * In-Memory-Datenbank (src/__tests__/hilfen/unterlagen-fake-db.ts), Rolle und
 * Bindung der IDs an den Vorgang: fremd und unbekannt ergeben dieselbe 404.
 *
 * Die Dienstfunktionen sind jest.fn-Huellen um die ECHTEN Funktionen: Ein Test
 * kann sie fuer das reine Durchreichen ersetzen, die uebrigen laufen durch.
 */

import type { EventEmailResult } from "@/lib/mailer";

const mockGetSession = jest.fn();
const mockSend = jest.fn(
  async (_e: string, _p: Record<string, unknown>, _o?: { overrideTo?: string }): Promise<EventEmailResult> => ({
    status: "SENT",
  }),
);
const mockTrigger = jest.fn(async (): Promise<EventEmailResult | null> => ({ status: "SENT" }));

jest.mock("@/lib/db", () => ({
  prisma: jest.requireActual("../hilfen/unterlagen-fake-db").fakePrisma,
}));
jest.mock("@/lib/auth", () => ({ getSession: () => mockGetSession() }));
jest.mock("@/lib/mailer", () => ({
  ...jest.requireActual("@/lib/mailer"),
  sendEventEmail: (e: string, p: Record<string, unknown>, o?: { overrideTo?: string }) => mockSend(e, p, o),
}));
jest.mock("@/lib/webhooks", () => ({ triggerWebhooks: () => mockTrigger() }));
jest.mock("@/lib/encryption", () => ({ decrypt: (v: string) => v }));
// Die Abteilungsuebersicht und der Fragebogen-Fortschritt haben eigene Tests;
// hier geht es nur um das Feld `unterlagen`.
jest.mock("@/lib/abteilungsaufgaben-onboarding", () => ({
  onboardingAbteilungsUebersichtLaden: jest.fn(async () => ({})),
}));
jest.mock("@/lib/fragebogen-fortschritt", () => ({
  ladeVorlagenKonfigurationen: jest.fn(async () => new Map()),
  fortschrittFuerVorgang: jest.fn(() => null),
}));
jest.mock("@/lib/unterlagen-dienst", () => {
  const echt = jest.requireActual("@/lib/unterlagen-dienst");
  return {
    ...echt,
    unterlagenAktionAusfuehren: jest.fn(echt.unterlagenAktionAusfuehren),
    unterlagenUebersichtLaden: jest.fn(echt.unterlagenUebersichtLaden),
  };
});

import { NextRequest } from "next/server";
import {
  neueDatei,
  neueNachforderung,
  neuePosition,
  udb,
  udbLeeren,
  type Zeile,
} from "../hilfen/unterlagen-fake-db";
import { POST } from "@/app/api/onboarding/[id]/unterlagen/route";
import { GET as vorgangLaden } from "@/app/api/onboarding/[id]/route";
import { unterlagenAktionAusfuehren, unterlagenUebersichtLaden } from "@/lib/unterlagen-dienst";
import { MELDUNGEN } from "@/lib/unterlagen";
import type { SessionPayload } from "@/lib/permissions";

const echtDienst = jest.requireActual<typeof import("@/lib/unterlagen-dienst")>("@/lib/unterlagen-dienst");
const mockAktion = unterlagenAktionAusfuehren as jest.Mock;
const mockUebersicht = unterlagenUebersichtLaden as jest.Mock;

// =============================================
// Testdaten
// =============================================

const BASIS = "https://hr.example.org";
const VORGANG_ID = "3f1c2a4e-5b6d-4e7f-8a9b-0c1d2e3f4a5b";
const ANDERER_VORGANG = "9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d";
const ADRESSE = "anna.privat@example.org";

const HR: SessionPayload = {
  userId: "u-hr",
  email: "erika.muster@example.org",
  role: "HR_SACHBEARBEITER",
  firstName: "Erika",
  lastName: "Muster",
};

/** Portal-Rolle mit Zuweisung zu org-1 — darf lesen, nicht bearbeiten. */
const LEITUNG: SessionPayload = {
  userId: "u-el",
  email: "el@example.org",
  role: "EINRICHTUNGSLEITUNG",
  firstName: "Egon",
  lastName: "Leitung",
};

function vorgang(teil: Zeile = {}): Zeile {
  return {
    id: VORGANG_ID,
    displayId: "2026-GYM-014",
    organizationId: "org-1",
    status: "SUBMITTED",
    email: ADRESSE,
    firstName: "Anna",
    lastName: "Beispiel",
    submittedAt: new Date("2026-09-10T10:00:00.000Z"),
    questionnaireType: "STANDARD",
    organization: { id: "org-1", name: "FES Minden", type: "GYMNASIUM" },
    employeeId: null,
    personalData: {
      firstName: "Anna",
      lastName: "Beispiel",
      isComplete: true,
      birthDate: new Date("1990-05-01T00:00:00.000Z"),
      rvEntscheidung: null,
      aufenthaltstitelErforderlich: true,
      healthInsuranceType: "gesetzlich",
      severelyDisabled: false,
      iban: null,
      socialSecurityNumber: null,
      taxId: null,
      children: [],
    },
    documents: [],
    ...teil,
  };
}

function laufend(teil: Zeile = {}): Zeile {
  const n = neueNachforderung({
    onboardingId: VORGANG_ID,
    laufendSchluessel: `ONBOARDING:${VORGANG_ID}`,
    empfaenger: ADRESSE,
    empfaengerVorgang: ADRESSE,
    frist: new Date(Date.now() + 14 * 86_400_000),
    angefordertVonId: "u-hr",
    ...teil,
  });
  udb.nachforderungen.push(n);
  return n;
}

function anfrage(url: string, method: string, opts: { body?: unknown; roh?: string } = {}): NextRequest {
  const headers: Record<string, string> = {};
  let body: string | undefined;
  if (opts.roh !== undefined) {
    body = opts.roh;
  } else if (opts.body !== undefined) {
    body = JSON.stringify(opts.body);
  }
  if (body !== undefined) headers["Content-Type"] = "application/json";
  return new NextRequest(url, { method, headers, ...(body !== undefined ? { body } : {}) });
}

const idParams = (id = VORGANG_ID) => ({ params: Promise.resolve({ id }) });
const post = (opts: { body?: unknown; roh?: string } = {}, id = VORGANG_ID) =>
  POST(anfrage(`${BASIS}/api/onboarding/${id}/unterlagen`, "POST", opts), idParams(id));

const ANFORDERN = {
  aktion: "anfordern",
  empfaenger: ADRESSE,
  // Frist in den Grenzen (morgen bis heute + 90) relativ zur echten Uhr: Die Route reicht kein `jetzt` durch.
  frist: new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10),
  positionen: [{ typ: "AUFENTHALTSTITEL" }],
};

const alteUmgebung = { ...process.env };

beforeEach(() => {
  jest.clearAllMocks();
  process.env.NEXT_PUBLIC_APP_URL = BASIS;
  udbLeeren();
  udb.vorgaenge = [vorgang()];
  udb.users = [{ id: "u-hr", firstName: "Erika", lastName: "Muster", email: "erika.muster@example.org", isActive: true }];
  udb.zuweisungen = [{ userId: "u-el", organizationId: "org-1" }];
  mockGetSession.mockResolvedValue(HR);
  mockAktion.mockReset();
  mockAktion.mockImplementation(echtDienst.unterlagenAktionAusfuehren);
  mockUebersicht.mockReset();
  mockUebersicht.mockImplementation(echtDienst.unterlagenUebersichtLaden);
});

afterAll(() => {
  process.env = alteUmgebung;
});

// =============================================
// POST /api/onboarding/[id]/unterlagen — was die Route selbst tut
// =============================================

describe("POST /api/onboarding/[id]/unterlagen — Huelle", () => {
  it("401 ohne Sitzung, der Dienst laeuft nicht", async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await post({ body: ANFORDERN });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Nicht authentifiziert" });
    expect(mockAktion).not.toHaveBeenCalled();
  });

  it.each([
    ["kaputtes JSON", '{ "aktion": "zurueckzie', MELDUNGEN.UNGUELTIGE_EINGABE],
    ["leerer Body", "", MELDUNGEN.UNGUELTIGE_EINGABE],
    ["ohne Aktion", "{}", "Unbekannte oder fehlende Aktion."],
    ["unbekannte Aktion", '{"aktion":"alles-loeschen"}', "Unbekannte oder fehlende Aktion."],
  ])("%s → 400, nie eine Standardaktion, kein Dienstaufruf", async (_fall, roh, meldung) => {
    const res = await post({ roh });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: meldung });
    expect(mockAktion).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("reicht den geprueften Body mit Modul, Vorgang und Sitzung an EINE Dienstfunktion", async () => {
    mockAktion.mockResolvedValue({ status: 200, body: {} });
    await post({ body: { aktion: "zurueckziehen", nachforderungId: "0b6c1f7e-2a3d-4c5b-9e8f-7a6b5c4d3e2f" } });
    expect(mockAktion).toHaveBeenCalledTimes(1);
    expect(mockAktion).toHaveBeenCalledWith({
      modul: "ONBOARDING",
      vorgangId: VORGANG_ID,
      eingabe: { aktion: "zurueckziehen", nachforderungId: "0b6c1f7e-2a3d-4c5b-9e8f-7a6b5c4d3e2f" },
      session: HR,
    });
  });

  it.each([
    [201, { nachforderungId: "n-1", mail: { status: "SENT", detail: null }, meldung: "ok" }, undefined],
    [409, { error: "läuft schon", grund: "LAEUFT_BEREITS" }, undefined],
    [429, { error: MELDUNGEN.MAIL_BREMSE, grund: "MAIL_BREMSE" }, { "Retry-After": "600" }],
    [502, { error: "nicht zugestellt", mail: { status: "FAILED" } }, undefined],
  ])("reicht Status %i, Body und Kopfzeilen 1:1 weiter", async (status, body, headers) => {
    mockAktion.mockResolvedValue({ status, body, ...(headers ? { headers } : {}) });
    const res = await post({ body: ANFORDERN });
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual(body);
    expect(res.headers.get("Retry-After")).toBe(headers ? headers["Retry-After"] : null);
  });

  it("500 bei einer Ausnahme — im Log nur der Code, keine Meldung", async () => {
    const stumm = jest.spyOn(console, "error").mockImplementation(() => {});
    mockAktion.mockRejectedValue(Object.assign(new Error(`kaputt fuer ${ADRESSE}`), { code: "P1001" }));
    const res = await post({ body: ANFORDERN });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Interner Serverfehler" });
    const log = JSON.stringify(stumm.mock.calls);
    expect(log).toContain("P1001");
    expect(log).not.toContain(ADRESSE);
    stumm.mockRestore();
  });
});

describe("POST /api/onboarding/[id]/unterlagen — mit dem echten Dienst", () => {
  it("anfordern: 201, Nachforderung angelegt, Mail an die Adresse des Vorgangs", async () => {
    const res = await post({ body: ANFORDERN });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({ mail: { status: "SENT" }, meldung: "Die Unterlagen sind angefordert." });
    expect(udb.nachforderungen).toHaveLength(1);
    expect(body.nachforderungId).toBe(udb.nachforderungen[0].id);
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend.mock.calls[0][2]).toEqual({ overrideTo: ADRESSE });
  });

  it("403 fuer eine Portal-Rolle ohne Bearbeitungsrecht", async () => {
    mockGetSession.mockResolvedValue(LEITUNG);
    const res = await post({ body: ANFORDERN });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: MELDUNGEN.KEINE_BERECHTIGUNG });
    expect(udb.nachforderungen).toHaveLength(0);
  });

  it("unbekannter Vorgang: 404 „Vorgang nicht gefunden“", async () => {
    const res = await post({ body: ANFORDERN }, ANDERER_VORGANG);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: MELDUNGEN.VORGANG_NICHT_GEFUNDEN });
  });

  it("fremde nachforderungId (anderer Vorgang) → 404 mit demselben Text wie eine unbekannte", async () => {
    udb.vorgaenge.push(vorgang({ id: ANDERER_VORGANG, email: "bert@example.org" }));
    const fremd = laufend({ onboardingId: ANDERER_VORGANG, laufendSchluessel: `ONBOARDING:${ANDERER_VORGANG}` });

    const fremdRes = await post({ body: { aktion: "zurueckziehen", nachforderungId: fremd.id } });
    const unbekanntRes = await post({
      body: { aktion: "zurueckziehen", nachforderungId: "0b6c1f7e-2a3d-4c5b-9e8f-7a6b5c4d3e2f" },
    });
    expect(fremdRes.status).toBe(404);
    expect(unbekanntRes.status).toBe(404);
    const [a, b] = [await fremdRes.json(), await unbekanntRes.json()];
    expect(a).toEqual({ error: MELDUNGEN.NACHFORDERUNG_NICHT_GEFUNDEN });
    expect(b).toEqual(a);
    expect(fremd.status).toBe("LAUFEND");
  });
});

// =============================================
// GET /api/onboarding/[id] — Feld `unterlagen`
// =============================================

describe("GET /api/onboarding/[id] — unterlagen", () => {
  const get = (id = VORGANG_ID) => vorgangLaden(anfrage(`${BASIS}/api/onboarding/${id}`, "GET"), idParams(id));

  function mitDatei(): { datei: Zeile } {
    const n = laufend();
    const p1 = neuePosition({ nachforderungId: n.id, typ: "AUFENTHALTSTITEL", bezeichnung: "Aufenthaltstitel", status: "EINGEREICHT", uebermitteltAm: new Date() });
    const p2 = neuePosition({ nachforderungId: n.id, typ: "PKV_NACHWEIS", bezeichnung: "PKV", status: "ANGEFORDERT", reihenfolge: 1 });
    udb.positionen.push(p1, p2);
    const datei = neueDatei({
      nachforderungId: n.id,
      positionId: p1.id,
      status: "EINGEREICHT",
      anzeigeName: "titel-vorne.jpg",
      uebermitteltAm: new Date(),
      speicherPfad: `uploads/unterlagen/${n.id}/x.jpg`,
    });
    const entwurf = neueDatei({ nachforderungId: n.id, positionId: p2.id, status: "ENTWURF", anzeigeName: "geheim-entwurf.pdf" });
    udb.dateien.push(datei, entwurf);
    return { datei };
  }

  it("HR: Uebersicht mit Datei-URL, Namen, Aktionen und Dialogdaten — Entwuerfe nie", async () => {
    const { datei } = mitDatei();
    const res = await get();
    expect(res.status).toBe(200);
    const body = await res.json();
    // Die Route reicht ihre schon geladene Zeile und DIESELBE Pflichtliste weiter,
    // die sie auch als `requiredDocuments` ausgibt — kein zweites Laden.
    expect(mockUebersicht).toHaveBeenCalledWith(expect.objectContaining({ id: VORGANG_ID }), HR, {
      requiredDocuments: ["GEBURTSURKUNDE_EIGEN", "GEBURTSURKUNDE_KIND"],
    });
    expect(udb.aufrufe.filter((a) => a === "onboardingProcess.findUnique")).toHaveLength(1);
    expect(udb.aufrufe.filter((a) => a === "formTemplate.findUnique")).toHaveLength(1);
    expect(body.unterlagen.darfAktionen).toBe(true);
    const titel = body.unterlagen.laufend.positionen[0];
    expect(titel.dateien[0]).toMatchObject({
      name: "titel-vorne.jpg",
      url: `/api/onboarding/${VORGANG_ID}/unterlagen/dateien/${datei.id}`,
    });
    expect(titel.aktionen.annehmen).toBe(true);
    expect(body.unterlagen.dialog.empfaenger.vorgang).toBe(ADRESSE);
    expect(JSON.stringify(body.unterlagen)).not.toContain("geheim-entwurf");
    // Die bisherigen Felder bleiben.
    expect(body.requiredDocuments).toEqual(["GEBURTSURKUNDE_EIGEN", "GEBURTSURKUNDE_KIND"]);
  });

  it("Portal-Rolle ohne Bearbeitungsrecht: keine Datei-URLs, keine Namen, keine Aktionen, keine Dialogdaten", async () => {
    mitDatei();
    mockGetSession.mockResolvedValue(LEITUNG);
    const res = await get();
    expect(res.status).toBe(200);
    const u = (await res.json()).unterlagen;
    expect(u.darfAktionen).toBe(false);
    expect(u.dialog).toBeNull();
    expect(u.anfordern).toEqual({ moeglich: false, grund: null });
    for (const p of u.laufend.positionen) {
      expect(Object.values(p.aktionen).some(Boolean)).toBe(false);
      for (const d of p.dateien) {
        expect(d.url).toBeNull();
        expect(d.name).toBeNull();
      }
    }
    expect(Object.values(u.laufend.aktionen).some(Boolean)).toBe(false);
    expect(JSON.stringify(u)).not.toContain("titel-vorne");
  });

  it("ohne Nachforderung: Knopf „Unterlagen nachfordern…“ fuer HR", async () => {
    const u = (await (await get()).json()).unterlagen;
    expect(u.laufend).toBeNull();
    expect(u.anfordern).toEqual({ moeglich: true, grund: null });
  });

  it("fremder Mandant: 404, die Uebersicht wird gar nicht erst geladen", async () => {
    udb.zuweisungen = [];
    mockGetSession.mockResolvedValue(LEITUNG);
    const res = await get();
    expect(res.status).toBe(404);
    expect(mockUebersicht).not.toHaveBeenCalled();
  });
});
