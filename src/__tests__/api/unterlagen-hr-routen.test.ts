/**
 * Tests: HR-Routen „Unterlagen nachfordern" (Paket 4, Schritte 4 und 6)
 *
 *   POST /api/onboarding/[id]/unterlagen                        (die fuenf Aktionen)
 *   POST /api/onboarding/[id]/unterlagen/positionen/[positionId] (die vier Entscheidungen)
 *   GET  /api/onboarding/[id]/unterlagen/dateien/[dateiId]      (Datei oeffnen)
 *   GET  /api/onboarding/[id]                                   (Feld `unterlagen`)
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
/** Liest die Datei der Nachforderung — hier ohne Platte; die Wurzel prueft unterlagen-dateien.test.ts. */
const mockDateiLesen = jest.fn(async (_speicherPfad: string, _nachforderungId: string) =>
  Buffer.from("%PDF-1.7\n%%EOF\n"),
);

jest.mock("@/lib/db", () => ({
  prisma: jest.requireActual("../hilfen/unterlagen-fake-db").fakePrisma,
}));
jest.mock("@/lib/unterlagen-dateien", () => ({
  ...jest.requireActual("@/lib/unterlagen-dateien"),
  nachforderungsDateiLesen: (pfad: string, nf: string) => mockDateiLesen(pfad, nf),
}));
jest.mock("@/lib/permissions", () => {
  const echt = jest.requireActual("@/lib/permissions");
  return { ...echt, canAccessProcess: jest.fn(echt.canAccessProcess) };
});
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
    unterlagenPositionsAktionAusfuehren: jest.fn(echt.unterlagenPositionsAktionAusfuehren),
    unterlagenDateiOeffnen: jest.fn(echt.unterlagenDateiOeffnen),
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
import { ddbLeeren } from "../hilfen/unterlagen-fake-db-pruefen";
import { POST } from "@/app/api/onboarding/[id]/unterlagen/route";
import { POST as positionPost } from "@/app/api/onboarding/[id]/unterlagen/positionen/[positionId]/route";
import { GET as dateiOeffnen } from "@/app/api/onboarding/[id]/unterlagen/dateien/[dateiId]/route";
import { GET as vorgangLaden } from "@/app/api/onboarding/[id]/route";
import {
  unterlagenAktionAusfuehren,
  unterlagenDateiOeffnen,
  unterlagenPositionsAktionAusfuehren,
  unterlagenUebersichtLaden,
} from "@/lib/unterlagen-dienst";
import { MELDUNGEN, UNTERLAGEN_AUDIT } from "@/lib/unterlagen";
import { canAccessProcess, type SessionPayload } from "@/lib/permissions";

const echtDienst = jest.requireActual<typeof import("@/lib/unterlagen-dienst")>("@/lib/unterlagen-dienst");
const mockAktion = unterlagenAktionAusfuehren as jest.Mock;
const mockPositionsAktion = unterlagenPositionsAktionAusfuehren as jest.Mock;
const mockDateiOeffnen = unterlagenDateiOeffnen as jest.Mock;
const mockUebersicht = unterlagenUebersichtLaden as jest.Mock;
const mockZugriff = canAccessProcess as jest.Mock;
const echtRechte = jest.requireActual<typeof import("@/lib/permissions")>("@/lib/permissions");

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
  ddbLeeren();
  udb.vorgaenge = [vorgang()];
  udb.users = [{ id: "u-hr", firstName: "Erika", lastName: "Muster", email: "erika.muster@example.org", isActive: true }];
  udb.zuweisungen = [{ userId: "u-el", organizationId: "org-1" }];
  mockGetSession.mockResolvedValue(HR);
  mockAktion.mockReset();
  mockAktion.mockImplementation(echtDienst.unterlagenAktionAusfuehren);
  mockPositionsAktion.mockReset();
  mockPositionsAktion.mockImplementation(echtDienst.unterlagenPositionsAktionAusfuehren);
  mockDateiOeffnen.mockReset();
  mockDateiOeffnen.mockImplementation(echtDienst.unterlagenDateiOeffnen);
  mockUebersicht.mockReset();
  mockUebersicht.mockImplementation(echtDienst.unterlagenUebersichtLaden);
  mockZugriff.mockImplementation(echtRechte.canAccessProcess);
  mockDateiLesen.mockImplementation(async () => Buffer.from("%PDF-1.7\n%%EOF\n"));
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

// =============================================
// POST /api/onboarding/[id]/unterlagen/positionen/[positionId] (Schritt 6)
// =============================================

describe("POST …/unterlagen/positionen/[positionId] — Huelle", () => {
  const POSITION = "7a1b2c3d-4e5f-4a6b-8c7d-6e5f4a3b2c1d";
  const postPosition = (opts: { body?: unknown; roh?: string } = {}, positionId = POSITION, id = VORGANG_ID) =>
    positionPost(anfrage(`${BASIS}/api/onboarding/${id}/unterlagen/positionen/${positionId}`, "POST", opts), {
      params: Promise.resolve({ id, positionId }),
    });

  it("401 ohne Sitzung, der Dienst laeuft nicht", async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await postPosition({ body: { aktion: "entfaellt" } });
    expect(res.status).toBe(401);
    expect(mockPositionsAktion).not.toHaveBeenCalled();
  });

  it.each([
    ["kaputtes JSON", '{ "aktion": "annehm', MELDUNGEN.UNGUELTIGE_EINGABE],
    ["leerer Body", "", MELDUNGEN.UNGUELTIGE_EINGABE],
    ["ohne Aktion", "{}", "Unbekannte oder fehlende Aktion."],
    ["Aktion des Kopfes", '{"aktion":"zurueckziehen"}', "Unbekannte oder fehlende Aktion."],
    ["Zurueckweisen ohne Begruendung", '{"aktion":"zurueckweisen"}', "Bitte geben Sie eine Begründung für die Person an."],
    [
      "Datum UND unbefristet",
      '{"aktion":"annehmen","gueltigBis":"2029-01-31","unbefristet":true}',
      "Bitte entweder ein Ablaufdatum angeben oder „Unbefristet“ wählen, nicht beides.",
    ],
  ])("%s → 400, nie eine Standardaktion, kein Dienstaufruf", async (_fall, roh, meldung) => {
    const res = await postPosition({ roh });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: meldung });
    expect(mockPositionsAktion).not.toHaveBeenCalled();
  });

  it("reicht den geprueften Body mit Modul, Vorgang, Position und Sitzung an EINE Dienstfunktion", async () => {
    mockPositionsAktion.mockResolvedValue({ status: 200, body: {} });
    await postPosition({ body: { aktion: "annehmen", gueltigBis: "", unbefristet: true } });
    expect(mockPositionsAktion).toHaveBeenCalledTimes(1);
    expect(mockPositionsAktion).toHaveBeenCalledWith({
      modul: "ONBOARDING",
      vorgangId: VORGANG_ID,
      positionId: POSITION,
      // "" wird zu null („kein Datum").
      eingabe: { aktion: "annehmen", gueltigBis: null, unbefristet: true },
      session: HR,
    });
  });

  it.each([
    [200, { positionId: POSITION, positionStatus: "ANGENOMMEN", meldung: "ok" }, undefined],
    [409, { error: "nicht zu pruefen", grund: "NICHT_ZU_PRUEFEN" }, undefined],
    [429, { error: MELDUNGEN.MAIL_BREMSE, grund: "MAIL_BREMSE" }, { "Retry-After": "600" }],
  ])("reicht Status %i, Body und Kopfzeilen 1:1 weiter", async (status, body, headers) => {
    mockPositionsAktion.mockResolvedValue({ status, body, ...(headers ? { headers } : {}) });
    const res = await postPosition({ body: { aktion: "zurueckweisen", begruendung: "unscharf" } });
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual(body);
    expect(res.headers.get("Retry-After")).toBe(headers ? headers["Retry-After"] : null);
  });

  it("500 bei einer Ausnahme — im Log nur der Code, keine Meldung", async () => {
    const stumm = jest.spyOn(console, "error").mockImplementation(() => {});
    mockPositionsAktion.mockRejectedValue(Object.assign(new Error(`kaputt ${ADRESSE}`), { code: "P1001" }));
    const res = await postPosition({ body: { aktion: "entfaellt" } });
    expect(res.status).toBe(500);
    const log = JSON.stringify(stumm.mock.calls);
    expect(log).toContain("P1001");
    expect(log).not.toContain(ADRESSE);
    stumm.mockRestore();
  });

  describe("mit dem echten Dienst", () => {
    function eingereichtePosition(onboardingId = VORGANG_ID): Zeile {
      const n = laufend(
        onboardingId === VORGANG_ID
          ? {}
          : { onboardingId, laufendSchluessel: `ONBOARDING:${onboardingId}` },
      );
      const p = neuePosition({ nachforderungId: n.id, typ: "PKV_NACHWEIS", bezeichnung: "PKV", status: "EINGEREICHT" });
      udb.positionen.push(p);
      return p;
    }

    it("403 fuer eine Portal-Rolle ohne Bearbeitungsrecht", async () => {
      const p = eingereichtePosition();
      mockGetSession.mockResolvedValue(LEITUNG);
      const res = await postPosition({ body: { aktion: "entfaellt" } }, String(p.id));
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: MELDUNGEN.KEINE_BERECHTIGUNG });
      expect(p.status).toBe("EINGEREICHT");
    });

    it("fremde positionId (anderer Vorgang) → 404 mit demselben Text wie eine unbekannte", async () => {
      udb.vorgaenge.push(vorgang({ id: ANDERER_VORGANG, email: "bert@example.org" }));
      const fremd = eingereichtePosition(ANDERER_VORGANG);
      const fremdRes = await postPosition({ body: { aktion: "entfaellt" } }, String(fremd.id));
      const unbekanntRes = await postPosition({ body: { aktion: "entfaellt" } });
      expect(fremdRes.status).toBe(404);
      expect(unbekanntRes.status).toBe(404);
      const [a, b] = [await fremdRes.json(), await unbekanntRes.json()];
      expect(a).toEqual({ error: MELDUNGEN.POSITION_NICHT_GEFUNDEN });
      expect(b).toEqual(a);
      expect(fremd.status).toBe("EINGEREICHT");
    });

    it("entfaellt: 200 mit dem Vertrag PositionsAktionAntwort, keine Mail", async () => {
      const p = eingereichtePosition();
      const res = await postPosition({ body: { aktion: "entfaellt", notiz: "liegt vor" } }, String(p.id));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        nachforderungId: p.nachforderungId,
        positionId: p.id,
        positionStatus: "ENTFAELLT",
        nachforderungStatus: "ERLEDIGT",
        mail: null,
        meldung: "Die Unterlage ist als entfallen vermerkt.",
      });
      expect(mockSend).not.toHaveBeenCalled();
    });
  });
});

// =============================================
// GET /api/onboarding/[id]/unterlagen/dateien/[dateiId] (Schritt 6, EP-10)
// =============================================

describe("GET …/unterlagen/dateien/[dateiId] — Datei oeffnen", () => {
  const oeffnen = (dateiId: string, id = VORGANG_ID) =>
    dateiOeffnen(anfrage(`${BASIS}/api/onboarding/${id}/unterlagen/dateien/${dateiId}`, "GET"), {
      params: Promise.resolve({ id, dateiId }),
    });

  /** Eine uebermittelte Datei (Standard) — mit `teil` Entwurf, geloescht, uebernommen, … */
  function datei(teil: Zeile = {}, onboardingId = VORGANG_ID): Zeile {
    const n = laufend(
      onboardingId === VORGANG_ID ? {} : { onboardingId, laufendSchluessel: `ONBOARDING:${onboardingId}` },
    );
    const p = neuePosition({ nachforderungId: n.id, typ: "AUFENTHALTSTITEL", bezeichnung: "Aufenthaltstitel", status: "EINGEREICHT" });
    udb.positionen.push(p);
    const d = neueDatei({
      nachforderungId: n.id,
      positionId: p.id,
      status: "EINGEREICHT",
      anzeigeName: "Titel Rückseite.pdf",
      mimeType: "application/pdf",
      groesse: 15,
      uebermitteltAm: new Date(),
      speicherPfad: `uploads/unterlagen/${n.id}/x.pdf`,
      ...teil,
    });
    udb.dateien.push(d);
    return d;
  }

  it("HR: inline, Typ aus der Datenbank, no-store, CORP, nosniff — und ein Protokolleintrag ohne Dateinamen", async () => {
    const d = datei();
    const res = await oeffnen(String(d.id));
    expect(res.status).toBe(200);
    expect(Buffer.from(await res.arrayBuffer()).toString()).toBe("%PDF-1.7\n%%EOF\n");
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    // asciiFilename: kein Umlaut, kein Leerzeichen im Header.
    expect(res.headers.get("Content-Disposition")).toBe('inline; filename="Titel_R_ckseite.pdf"');
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.headers.get("Cross-Origin-Resource-Policy")).toBe("same-origin");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    // Bei PDFs (noch) keine Sandbox — erst nach der Browserprobe (Abschnitt 17).
    expect(res.headers.get("Content-Security-Policy")).toBeNull();
    // Gelesen wird ueber die Wurzel der Nachforderung.
    expect(mockDateiLesen).toHaveBeenCalledWith(d.speicherPfad, d.nachforderungId);

    expect(udb.audits).toHaveLength(1);
    expect(udb.audits[0]).toMatchObject({
      action: UNTERLAGEN_AUDIT.DATEI_GEOEFFNET,
      userId: "u-hr",
      onboardingId: VORGANG_ID,
      processType: "ONBOARDING",
      details: { dateiId: d.id, nachforderungId: d.nachforderungId, positionId: d.positionId, mimeType: "application/pdf", groesse: 15 },
    });
    expect(JSON.stringify(udb.audits)).not.toContain("ckseite");
  });

  /**
   * Geprueft wird hier nur die Antwort DER ROUTE. Beim Browser kommt die
   * `sandbox` erst an, wenn die Middleware fuer diesen Pfad keine eigene CSP
   * setzt: Next.js (15.5, `send-response.js`) haengt einen Kopf der Route nur
   * an, wenn die Middleware ihn nicht schon gesetzt hat. Siehe den offenen
   * Punkt unten.
   */
  it("die Route verlangt fuer Bilder zusaetzlich `Content-Security-Policy: sandbox`", async () => {
    const d = datei({ anzeigeName: "foto.jpg", mimeType: "image/jpeg", speicherPfad: "uploads/unterlagen/y/x.jpg" });
    const res = await oeffnen(String(d.id));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/jpeg");
    expect(res.headers.get("Content-Security-Policy")).toBe("sandbox");
    expect(res.headers.get("Content-Disposition")).toBe('inline; filename="foto.jpg"');
  });

  // Offen (src/middleware.ts gehoert Schritt 5): Solange die Middleware auch
  // fuer …/unterlagen/dateien/… ihre CSP setzt, verwirft Next.js die der Route.
  it.todo("die Middleware setzt fuer /api/onboarding/[id]/unterlagen/dateien/[dateiId] keine eigene CSP");

  it.each([
    ["ein Entwurf (HR sieht Entwuerfe nie)", { status: "ENTWURF", uebermitteltAm: null }],
    ["eine nie uebermittelte Datei", { uebermitteltAm: null }],
    ["eine geloeschte Datei", { status: "ZURUECKGEWIESEN", dateiGeloeschtAm: new Date() }],
    ["eine uebernommene Datei (liegt als Dokument im Vorgang)", { status: "ANGENOMMEN", speicherPfad: null, uebernahmeZiel: "DOCUMENT" }],
  ])("%s → 404 mit demselben Text, nichts gelesen, kein Protokoll", async (_fall, teil) => {
    const d = datei(teil);
    const res = await oeffnen(String(d.id));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: MELDUNGEN.DATEI_NICHT_GEFUNDEN });
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(mockDateiLesen).not.toHaveBeenCalled();
    expect(udb.audits).toHaveLength(0);
  });

  it("eine zurueckgewiesene, noch nicht geloeschte Datei laesst sich oeffnen", async () => {
    const d = datei({ status: "ZURUECKGEWIESEN" });
    expect((await oeffnen(String(d.id))).status).toBe(200);
  });

  it("Datei eines ANDEREN Vorgangs → 404 mit demselben Text wie eine unbekannte", async () => {
    udb.vorgaenge.push(vorgang({ id: ANDERER_VORGANG, email: "bert@example.org" }));
    const fremd = datei({}, ANDERER_VORGANG);
    const a = await oeffnen(String(fremd.id));
    const b = await oeffnen("0b6c1f7e-2a3d-4c5b-9e8f-7a6b5c4d3e2f");
    expect(a.status).toBe(404);
    expect(b.status).toBe(404);
    expect(await a.json()).toEqual(await b.json());
    expect(mockDateiLesen).not.toHaveBeenCalled();
  });

  it("nur HR: eine Portal-Rolle ohne Bearbeitungsrecht und der n8n-Schluessel (SERVICE) bekommen 403", async () => {
    const d = datei();
    for (const session of [LEITUNG, { ...HR, userId: "n8n", role: "SERVICE" }]) {
      mockGetSession.mockResolvedValue(session);
      const res = await oeffnen(String(d.id));
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: MELDUNGEN.KEINE_BERECHTIGUNG });
    }
    mockGetSession.mockResolvedValue(null);
    expect((await oeffnen(String(d.id))).status).toBe(401);
    expect(mockDateiLesen).not.toHaveBeenCalled();
  });

  it("fremder Mandant → 404 „Vorgang nicht gefunden“", async () => {
    const d = datei();
    mockZugriff.mockResolvedValue(false);
    const res = await oeffnen(String(d.id));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: MELDUNGEN.VORGANG_NICHT_GEFUNDEN });
  });

  it("Datei auf der Platte nicht lesbar → 404, im Log nur der Code, kein Protokolleintrag", async () => {
    const stumm = jest.spyOn(console, "error").mockImplementation(() => {});
    const d = datei();
    mockDateiLesen.mockRejectedValueOnce(Object.assign(new Error(`ENOENT ${String(d.speicherPfad)}`), { code: "ENOENT" }));
    const res = await oeffnen(String(d.id));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: MELDUNGEN.DATEI_NICHT_GEFUNDEN });
    expect(udb.audits).toHaveLength(0);
    const log = JSON.stringify(stumm.mock.calls);
    expect(log).toContain("ENOENT");
    expect(log).not.toContain("uploads/unterlagen");
    stumm.mockRestore();
  });
});
