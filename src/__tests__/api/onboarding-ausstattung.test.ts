/**
 * Tests: Route der Karte „Ausstattung & Zugänge“ (Feinplan S15)
 *
 *   GET  /api/onboarding/[id]/ausstattung
 *   POST /api/onboarding/[id]/ausstattung
 *
 * Die Fachlogik (Regel 9, Aenderungsliste, Nachholen, Sperren) steckt in
 * src/lib/ausstattung-dienst.ts und ist in
 * src/__tests__/lib/ausstattung-dienst.test.ts getestet. Hier geht es um das,
 * was die Route SELBST tut: Sitzung (401), Body-Lesen (kaputtes JSON = 400,
 * nie eine Standardaktion), Status und Body des Dienstes 1:1, 500 bei einer
 * Ausnahme — und mit dem echten Dienst gegen die In-Memory-Datenbank die
 * Rollen (403, auch fuer SERVICE) und „fremd = unbekannt“ (dieselbe 404).
 */

const mockGetSession = jest.fn();

jest.mock("@/lib/db", () => ({
  prisma: jest.requireActual("../hilfen/abteilungs-fake-db").fakePrisma,
}));
jest.mock("@/lib/auth", () => ({ getSession: () => mockGetSession() }));
jest.mock("@/lib/webhooks", () => ({ triggerWebhooks: jest.fn() }));
jest.mock("@/lib/permissions", () => {
  const echt = jest.requireActual("@/lib/permissions");
  return { ...echt, canAccessProcess: jest.fn(echt.canAccessProcess) };
});
jest.mock("@/lib/ausstattung-dienst", () => {
  const echt = jest.requireActual("@/lib/ausstattung-dienst");
  return {
    ...echt,
    ausstattungAktionAusfuehren: jest.fn(echt.ausstattungAktionAusfuehren),
    ausstattungKarteLaden: jest.fn(echt.ausstattungKarteLaden),
  };
});

import { NextRequest } from "next/server";
import { db, dbLeeren, fakePrisma, neueAusstattungsZeile, type Zeile } from "../hilfen/abteilungs-fake-db";
import { GET, POST } from "@/app/api/onboarding/[id]/ausstattung/route";
import { ausstattungAktionAusfuehren, ausstattungKarteLaden } from "@/lib/ausstattung-dienst";
import { canAccessProcess, type SessionPayload } from "@/lib/permissions";
import { MELDUNGEN } from "@/lib/abteilungsaufgaben";

const echtDienst = jest.requireActual<typeof import("@/lib/ausstattung-dienst")>("@/lib/ausstattung-dienst");
const echtRechte = jest.requireActual<typeof import("@/lib/permissions")>("@/lib/permissions");
const mockAktion = ausstattungAktionAusfuehren as jest.Mock;
const mockLaden = ausstattungKarteLaden as jest.Mock;
const mockZugriff = canAccessProcess as jest.Mock;

(fakePrisma as Record<string, unknown>).organization = { findUnique: jest.fn(async () => ({ type: "GYMNASIUM" })) };

const BASIS = "https://hr.example.org";
const HR: SessionPayload = {
  userId: "u-hr",
  email: "hr@example.org",
  role: "HR_SACHBEARBEITER",
  firstName: "Anna",
  lastName: "Peters",
};

function vorgang(teil: Zeile = {}): Zeile {
  return {
    id: "onb-1",
    organizationId: "org-1",
    arbeitsortId: null,
    questionnaireType: "STANDARD",
    processType: "EINSTELLUNG",
    status: "SUPERVISOR_SUBMITTED",
    supervisorSubmittedAt: new Date("2026-09-20T08:00:00.000Z"),
    supervisorData: { isComplete: true, mitAusstattung: true, vertragsbeginn: new Date("2026-10-01T00:00:00.000Z") },
    ...teil,
  };
}

const params = (id = "onb-1") => ({ params: Promise.resolve({ id }) });
const url = (id = "onb-1") => `${BASIS}/api/onboarding/${id}/ausstattung`;
const post = (body: string | undefined, id = "onb-1") =>
  POST(
    new NextRequest(url(id), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      ...(body !== undefined ? { body } : {}),
    }),
    params(id),
  );
const get = (id = "onb-1") => GET(new NextRequest(url(id)), params(id));

beforeEach(() => {
  jest.clearAllMocks();
  dbLeeren();
  db.onboardingVorgaenge = [vorgang()];
  db.ausstattungZeilen = [
    neueAusstattungsZeile({
      id: "aus-ipad",
      onboardingId: "onb-1",
      positionId: "pos-ipad",
      departmentKey: "IT",
      art: "JA_NEIN",
      bezeichnung: "Dienst-iPad (Lernmittel)",
      aufgabeTitel: "Dienst-iPad (Lernmittel) bereitstellen",
      quelle: "FUEHRUNGSKRAFT",
    }),
  ];
  mockGetSession.mockResolvedValue(HR);
  mockAktion.mockReset();
  mockAktion.mockImplementation(echtDienst.ausstattungAktionAusfuehren);
  mockLaden.mockReset();
  mockLaden.mockImplementation(echtDienst.ausstattungKarteLaden);
  mockZugriff.mockReset();
  mockZugriff.mockImplementation(echtRechte.canAccessProcess);
});

describe("POST /api/onboarding/[id]/ausstattung", () => {
  it("401 ohne Sitzung, der Dienst läuft nicht", async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await post(JSON.stringify({ aktion: "streichen", ausstattungId: "aus-ipad" }));
    expect(res.status).toBe(401);
    expect(mockAktion).not.toHaveBeenCalled();
  });

  it("kaputtes JSON → 400 „Ungültige Eingabe“ ohne Dienstaufruf; leerer Body → Dienst mit undefined (400)", async () => {
    const kaputt = await post('{ "aktion": "strei');
    expect(kaputt.status).toBe(400);
    expect(await kaputt.json()).toEqual({ error: MELDUNGEN.UNGUELTIGE_EINGABE });
    expect(mockAktion).not.toHaveBeenCalled();

    const leer = await post(undefined);
    expect(leer.status).toBe(400);
    expect(mockAktion).toHaveBeenCalledWith({ onboardingId: "onb-1", rohBody: undefined, session: HR });
    expect(db.ausstattungZeilen).toHaveLength(1);
  });

  it.each([200, 400, 404, 409])("reicht Status %i und Body des Dienstes 1:1 weiter", async (status) => {
    const body = status === 200 ? { data: { zustand: "BEARBEITBAR" }, meldung: "ok" } : { error: "Meldung", grund: "X" };
    mockAktion.mockResolvedValue({ status, body });
    const res = await post(JSON.stringify({ aktion: "streichen", ausstattungId: "aus-ipad" }));
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual(body);
    expect(mockAktion).toHaveBeenCalledWith({
      onboardingId: "onb-1",
      rohBody: { aktion: "streichen", ausstattungId: "aus-ipad" },
      session: HR,
    });
  });

  it("500 bei einer Ausnahme im Dienst", async () => {
    const stumm = jest.spyOn(console, "error").mockImplementation(() => {});
    mockAktion.mockRejectedValue(new Error("DB weg"));
    const res = await post(JSON.stringify({ aktion: "streichen", ausstattungId: "aus-ipad" }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Interner Serverfehler" });
    stumm.mockRestore();
  });

  describe("mit dem echten Dienst", () => {
    it.each(["VORGESETZTER", "EINRICHTUNGSLEITUNG", "SERVICE"])("%s → 403, nichts geschrieben (Regel 16)", async (role) => {
      mockGetSession.mockResolvedValue({ ...HR, role });
      const res = await post(JSON.stringify({ aktion: "streichen", ausstattungId: "aus-ipad" }));
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: "Keine Berechtigung" });
      expect(db.ausstattungZeilen).toHaveLength(1);
    });

    it("404 mit demselben Text für einen unbekannten und einen fremden Vorgang", async () => {
      const unbekannt = await post(JSON.stringify({ aktion: "streichen", ausstattungId: "aus-ipad" }), "gibt-es-nicht");
      expect(unbekannt.status).toBe(404);
      const textUnbekannt = await unbekannt.json();

      mockZugriff.mockResolvedValue(false);
      const fremd = await post(JSON.stringify({ aktion: "streichen", ausstattungId: "aus-ipad" }));
      expect(fremd.status).toBe(404);
      expect(await fremd.json()).toEqual(textUnbekannt);
      expect(textUnbekannt).toEqual({ error: MELDUNGEN.ONBOARDING_VORGANG_NICHT_GEFUNDEN });
      expect(db.ausstattungZeilen).toHaveLength(1);
    });

    it("200 mit der neuen Übersicht und einer Meldung", async () => {
      const res = await post(JSON.stringify({ aktion: "streichen", ausstattungId: "aus-ipad" }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.meldung).toBe("Position entfernt.");
      expect(body.data).toMatchObject({ zustand: "BEARBEITBAR", gruppen: [] });
      expect(db.ausstattungZeilen).toEqual([]);
    });
  });
});

describe("GET /api/onboarding/[id]/ausstattung", () => {
  it("401 ohne Sitzung", async () => {
    mockGetSession.mockResolvedValue(null);
    expect((await get()).status).toBe(401);
    expect(mockLaden).not.toHaveBeenCalled();
  });

  it.each(["VORGESETZTER", "EINRICHTUNGSLEITUNG", "SERVICE"])("%s → 403", async (role) => {
    mockGetSession.mockResolvedValue({ ...HR, role });
    const res = await get();
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Keine Berechtigung" });
  });

  it("404 für unbekannt und fremd — derselbe Text", async () => {
    const unbekannt = await get("gibt-es-nicht");
    mockZugriff.mockResolvedValue(false);
    const fremd = await get();
    expect([unbekannt.status, fremd.status]).toEqual([404, 404]);
    expect(await fremd.json()).toEqual(await unbekannt.json());
  });

  it("200 mit der Übersicht für HR", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.gruppen[0]).toMatchObject({ departmentKey: "IT" });
    expect(mockLaden).toHaveBeenCalledWith({ onboardingId: "onb-1", session: HR });
  });

  it("500 bei einer Ausnahme im Dienst", async () => {
    const stumm = jest.spyOn(console, "error").mockImplementation(() => {});
    mockLaden.mockRejectedValue(new Error("DB weg"));
    const res = await get();
    expect(res.status).toBe(500);
    stumm.mockRestore();
  });
});
