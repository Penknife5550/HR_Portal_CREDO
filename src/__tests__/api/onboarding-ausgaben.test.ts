/**
 * Tests: Route der Ausgaben in der Karte „Ausstattung & Zugänge“ (Feinplan A4, S24)
 *
 *   POST /api/onboarding/[id]/ausgaben
 *
 * Die Fachlogik (Vermerk, Tausch, Bindung an einen Austritt, Fristen) steckt in
 * src/lib/ausgaben-dienst.ts und ist in src/__tests__/lib/ausgaben-dienst.test.ts
 * getestet. Hier geht es um das, was die Route SELBST tut: Sitzung (401),
 * Body-Lesen (kaputtes JSON = 400, nie eine Standardaktion), Status und Body
 * des Dienstes 1:1, 500 bei einer Ausnahme — und mit dem echten Dienst gegen
 * die In-Memory-Datenbank die Rollen (403 fuer Einrichtungsleitung,
 * Vorgesetzte und den n8n-Schluessel SERVICE) und „fremd = unbekannt“
 * (dieselbe 404).
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
jest.mock("@/lib/ausgaben-dienst", () => {
  const echt = jest.requireActual("@/lib/ausgaben-dienst");
  return { ...echt, ausgabenAktionAusfuehren: jest.fn(echt.ausgabenAktionAusfuehren) };
});

import { NextRequest } from "next/server";
import {
  db,
  dbLeeren,
  fakePrisma,
  neueAusstattungsZeile,
  neueOnboardingAufgabe,
  type Zeile,
} from "../hilfen/abteilungs-fake-db";
import { POST } from "@/app/api/onboarding/[id]/ausgaben/route";
import { ausgabenAktionAusfuehren } from "@/lib/ausgaben-dienst";
import { canAccessProcess, type SessionPayload } from "@/lib/permissions";
import { MELDUNGEN } from "@/lib/abteilungsaufgaben";
import { MELDUNGEN_AUSGABEN } from "@/lib/ausgaben";

const echtDienst = jest.requireActual<typeof import("@/lib/ausgaben-dienst")>("@/lib/ausgaben-dienst");
const echtRechte = jest.requireActual<typeof import("@/lib/permissions")>("@/lib/permissions");
const mockAktion = ausgabenAktionAusfuehren as jest.Mock;
const mockZugriff = canAccessProcess as jest.Mock;

(fakePrisma as Record<string, unknown>).organization = { findUnique: jest.fn(async () => ({ type: "GYMNASIUM" })) };
// Rueckgaben kennt der Fake noch nicht (S29): Die Uebersicht fragt nach
// Austrittsbezuegen der Ausgaben – hier gibt es keine.
(fakePrisma as Record<string, unknown>).returnItem = { findMany: jest.fn(async () => []) };
// Kein hochgeladenes Uebergabeprotokoll (G19).
(fakePrisma as Record<string, unknown>).document = { findFirst: jest.fn(async () => null) };

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
    status: "COMPLETED",
    createdAt: new Date("2027-01-05T09:00:00.000Z"),
    supervisorSubmittedAt: new Date("2027-01-14T09:00:00.000Z"),
    supervisorData: { isComplete: true, mitAusstattung: true, vertragsbeginn: new Date("2027-02-01T00:00:00.000Z") },
    ausgabenGeloeschtAm: null,
    ...teil,
  };
}

const VERMERK = { aktion: "vermerken", checklistItemId: "i-ipad", stuecke: [{ kennung: "FES-IPAD-0412" }] };

const params = (id = "onb-1") => ({ params: Promise.resolve({ id }) });
const post = (body: string | undefined, id = "onb-1") =>
  POST(
    new NextRequest(`${BASIS}/api/onboarding/${id}/ausgaben`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      ...(body !== undefined ? { body } : {}),
    }),
    params(id),
  );

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
      beiAustritt: "RUECKGABE",
      rueckgabeKategorie: "IT_HARDWARE",
      ausgabeKennung: "Inventarnummer",
    }),
  ];
  db.onboardingAufgaben = [
    neueOnboardingAufgabe({
      id: "i-ipad",
      onboardingId: "onb-1",
      title: "Dienst-iPad (Lernmittel) bereitstellen",
      herkunft: "AUSSTATTUNG",
      assignee: "IT",
      isCompleted: true,
    }),
  ];
  db.ausstattungAufgaben = [{ ausstattungId: "aus-ipad", option: "", checklistItemId: "i-ipad", createdAt: new Date() }];
  db.ausstattungsPositionen = [{ id: "pos-ipad", organizationId: "org-1" }];
  mockGetSession.mockResolvedValue(HR);
  mockAktion.mockReset();
  mockAktion.mockImplementation(echtDienst.ausgabenAktionAusfuehren);
  mockZugriff.mockReset();
  mockZugriff.mockImplementation(echtRechte.canAccessProcess);
});

describe("POST /api/onboarding/[id]/ausgaben", () => {
  it("401 ohne Sitzung, der Dienst läuft nicht", async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await post(JSON.stringify(VERMERK));
    expect(res.status).toBe(401);
    expect(mockAktion).not.toHaveBeenCalled();
  });

  it("kaputtes JSON → 400 „Ungültige Eingabe“ ohne Dienstaufruf; leerer Body → Dienst mit undefined (400)", async () => {
    const kaputt = await post('{ "aktion": "vermer');
    expect(kaputt.status).toBe(400);
    expect(await kaputt.json()).toEqual({ error: MELDUNGEN.UNGUELTIGE_EINGABE });
    expect(mockAktion).not.toHaveBeenCalled();

    const leer = await post(undefined);
    expect(leer.status).toBe(400);
    expect(mockAktion).toHaveBeenCalledWith({ onboardingId: "onb-1", rohBody: undefined, session: HR });
    expect(db.ausgaben).toEqual([]);
  });

  it.each([200, 400, 404, 409])("reicht Status %i und Body des Dienstes 1:1 weiter", async (status) => {
    const body = status === 200 ? { data: { zustand: "NUR_LESEN" }, meldung: "ok" } : { error: "Meldung", grund: "X" };
    mockAktion.mockResolvedValue({ status, body });
    const res = await post(JSON.stringify(VERMERK));
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual(body);
    expect(mockAktion).toHaveBeenCalledWith({ onboardingId: "onb-1", rohBody: VERMERK, session: HR });
  });

  it("500 bei einer Ausnahme im Dienst", async () => {
    const stumm = jest.spyOn(console, "error").mockImplementation(() => {});
    mockAktion.mockRejectedValue(new Error("DB weg"));
    const res = await post(JSON.stringify(VERMERK));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Interner Serverfehler" });
    stumm.mockRestore();
  });

  describe("mit dem echten Dienst", () => {
    it.each(["EINRICHTUNGSLEITUNG", "VORGESETZTER", "SERVICE"])("%s → 403, nichts geschrieben", async (role) => {
      mockGetSession.mockResolvedValue({ ...HR, role });
      const res = await post(JSON.stringify(VERMERK));
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: "Keine Berechtigung" });
      expect(db.ausgaben).toEqual([]);
    });

    it("404 mit demselben Text für einen unbekannten und einen fremden Vorgang", async () => {
      const unbekannt = await post(JSON.stringify(VERMERK), "gibt-es-nicht");
      expect(unbekannt.status).toBe(404);
      const textUnbekannt = await unbekannt.json();

      mockZugriff.mockResolvedValue(false);
      const fremd = await post(JSON.stringify(VERMERK));
      expect(fremd.status).toBe(404);
      expect(await fremd.json()).toEqual(textUnbekannt);
      expect(textUnbekannt).toEqual({ error: MELDUNGEN.ONBOARDING_VORGANG_NICHT_GEFUNDEN });
      expect(db.ausgaben).toEqual([]);
    });

    it("200 mit der neuen Übersicht und einer Meldung – auch am abgeschlossenen Vorgang (G7)", async () => {
      const res = await post(JSON.stringify(VERMERK));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.meldung).toBe(MELDUNGEN_AUSGABEN.VERMERKT(1));
      expect(body.data).toMatchObject({ zustand: "NUR_LESEN", ausgabenBearbeitbar: true });
      expect(db.ausgaben).toHaveLength(1);
      expect(db.ausgaben[0]).toMatchObject({ kennung: "FES-IPAD-0412", quelle: "HR", zustand: "AUSGEGEBEN" });
    });
  });
});
