/**
 * Tests: Onboarding-Routen der Abteilungsaufgaben (Paket 5)
 *
 *   GET/POST /api/onboarding/[id]/abteilungen
 *   GET      /api/onboarding/[id]                 (Zusatzfelder, 404 statt 403)
 *   GET      /api/onboarding/[id]/checklist       (gehaertet, kein POST mehr)
 *   PATCH    /api/onboarding/[id]/checklist/[itemId]
 *   POST     /api/modalitaeten/[token]            (Faelligkeiten, KEIN Versand)
 *
 * Die Fachlogik (Rolle, Mandant, Status, Voraussetzung, Sperre, Versand,
 * Uebergaenge, Mails) steckt in src/lib/abteilungsaufgaben-onboarding.ts und
 * src/lib/abteilungsaufgaben-uebergaenge.ts und ist dort getestet
 * (src/__tests__/lib/abteilungsaufgaben-onboarding.test.ts). Hier geht es um
 * das, was die Routen SELBST tun: Session, Body-Lesen (leer / {} / kaputt),
 * Status und Body des Dienstes 1:1 weiterreichen, 500 bei Ausnahmen — und um
 * die Routen mit eigener Logik (Detailansicht, Checkliste, Modalitaeten).
 *
 * Die Dienstfunktionen sind jest.fn-Huellen um die ECHTEN Funktionen: Ein Test
 * kann sie fuer das reine Durchreichen ersetzen, die uebrigen laufen durch den
 * echten Dienst gegen die In-Memory-Datenbank
 * (src/__tests__/hilfen/abteilungs-fake-db.ts). Was die Routen darueber hinaus
 * an Prisma brauchen (`include` am Vorgang, Fragebogen-Vorlagen,
 * findUniqueOrThrow und supervisorData fuer die Abgabe), haengt DIESE Datei an
 * den Fake an.
 */

type MailErgebnis = { status: "SENT" | "FAILED" | "SKIPPED"; detail?: string; recipient?: string } | null;

const mockGetSession = jest.fn();
const mockValidateToken = jest.fn();
const mockTrigger = jest.fn(
  async (_event: string, payload: Record<string, unknown>): Promise<MailErgebnis> => ({
    status: "SENT",
    recipient: String(payload.email ?? "hr@example.org"),
  }),
);

jest.mock("@/lib/db", () => ({
  prisma: jest.requireActual("../hilfen/abteilungs-fake-db").fakePrisma,
}));
jest.mock("@/lib/auth", () => ({
  getSession: () => mockGetSession(),
  validateSupervisorToken: (token: string) => mockValidateToken(token),
}));
jest.mock("@/lib/webhooks", () => ({
  triggerWebhooks: (e: string, p: Record<string, unknown>) => mockTrigger(e, p),
}));
jest.mock("@/lib/n8n", () => ({ triggerN8nWebhook: jest.fn(async () => null) }));
jest.mock("@/lib/encryption", () => ({
  encrypt: (v: string) => v,
  decrypt: (v: string) => v,
  isEncryptionConfigured: () => false,
}));
jest.mock("@/lib/permissions", () => {
  const echt = jest.requireActual("@/lib/permissions");
  return { ...echt, canAccessProcess: jest.fn(echt.canAccessProcess) };
});
jest.mock("@/lib/abteilungsaufgaben-onboarding", () => {
  const echt = jest.requireActual("@/lib/abteilungsaufgaben-onboarding");
  return {
    ...echt,
    onboardingAbteilungsAktionAusfuehren: jest.fn(echt.onboardingAbteilungsAktionAusfuehren),
    onboardingAbteilungenLaden: jest.fn(echt.onboardingAbteilungenLaden),
    faelligkeitenSetzen: jest.fn(echt.faelligkeitenSetzen),
  };
});
jest.mock("@/lib/abteilungsaufgaben-uebergaenge", () => {
  const echt = jest.requireActual("@/lib/abteilungsaufgaben-uebergaenge");
  return {
    ...echt,
    onboardingAufgabeImPortalAendern: jest.fn(echt.onboardingAufgabeImPortalAendern),
  };
});

import { NextRequest } from "next/server";
import { db, dbLeeren, fakePrisma, naechsteId, neuerLink, type Zeile } from "../hilfen/abteilungs-fake-db";
import * as abteilungenRoute from "@/app/api/onboarding/[id]/abteilungen/route";
import { GET as vorgangLaden } from "@/app/api/onboarding/[id]/route";
import * as checklisteRoute from "@/app/api/onboarding/[id]/checklist/route";
import { PATCH as punktAendern } from "@/app/api/onboarding/[id]/checklist/[itemId]/route";
import { POST as modalitaetenAbsenden } from "@/app/api/modalitaeten/[token]/route";
import {
  faelligkeitenSetzen,
  onboardingAbteilungenLaden,
  onboardingAbteilungsAktionAusfuehren,
} from "@/lib/abteilungsaufgaben-onboarding";
import { onboardingAufgabeImPortalAendern } from "@/lib/abteilungsaufgaben-uebergaenge";
import { canAccessProcess, type SessionPayload } from "@/lib/permissions";
import { MELDUNGEN } from "@/lib/abteilungsaufgaben";

const echtOnboarding = jest.requireActual<typeof import("@/lib/abteilungsaufgaben-onboarding")>(
  "@/lib/abteilungsaufgaben-onboarding",
);
const echtUebergaenge = jest.requireActual<typeof import("@/lib/abteilungsaufgaben-uebergaenge")>(
  "@/lib/abteilungsaufgaben-uebergaenge",
);
const echtRechte = jest.requireActual<typeof import("@/lib/permissions")>("@/lib/permissions");

const mockAktion = onboardingAbteilungsAktionAusfuehren as jest.Mock;
const mockLaden = onboardingAbteilungenLaden as jest.Mock;
const mockFaelligkeiten = faelligkeitenSetzen as jest.Mock;
const mockPortal = onboardingAufgabeImPortalAendern as jest.Mock;
const mockZugriff = canAccessProcess as jest.Mock;

type FakeTabelle = Record<string, jest.Mock>;
const fp = fakePrisma as unknown as Record<string, FakeTabelle>;

// =============================================
// Fake-Datenbank: was nur die Routen brauchen
// =============================================

const findUniqueMitSelect = fp.onboardingProcess.findUnique;

// GET /api/onboarding/[id] laedt den Vorgang mit `include` statt `select`.
fp.onboardingProcess.findUnique = jest.fn(
  async (args: { where: Zeile; select?: Zeile; include?: Record<string, unknown> }) => {
    if (!args.include) return findUniqueMitSelect(args);
    const v = db.onboardingVorgaenge.find((x) => x.id === args.where.id);
    if (!v) return null;
    return {
      ...structuredClone(v),
      checklistItems: db.onboardingAufgaben
        .filter((a) => a.onboardingId === v.id)
        .map((a) => ({ ...structuredClone(a), completedBy: null })),
      departmentLinks: db.links.filter((l) => l.onboardingId === v.id).map((l) => structuredClone(l)),
      documents: [],
      notes: [],
      invitedBy: null,
      reviewedBy: null,
      _count: { notes: 0 },
    };
  },
);

// statusAbgleichen (Abgabe der Modalitaeten) liest die Zeile in der Transaktion neu.
fp.onboardingProcess.findUniqueOrThrow = jest.fn(async ({ where }: { where: Zeile }) => {
  const v = db.onboardingVorgaenge.find((x) => x.id === where.id);
  if (!v) throw new Error("Onboarding-Vorgang fehlt");
  return structuredClone(v);
});

fp.supervisorData = {
  update: jest.fn(async ({ where, data }: { where: Zeile; data: Zeile }) => {
    const v = db.onboardingVorgaenge.find((x) => x.id === where.onboardingId);
    if (!v) throw new Error("Vorgang fehlt");
    v.supervisorData = { ...(v.supervisorData as Zeile), ...data };
    return structuredClone(v.supervisorData);
  }),
};

fp.formTemplate = {
  findMany: jest.fn(async () => []),
  findUnique: jest.fn(async () => null),
};

// =============================================
// Testdaten
// =============================================

const BASIS = "https://hr.example.org";
const TAG = 86_400_000;
const BEGINN = new Date("2026-10-01T00:00:00.000Z");
const TOKEN = "modalitaeten-token-1234567890";

const HR: SessionPayload = {
  userId: "u-hr",
  email: "hr@example.org",
  role: "HR_SACHBEARBEITER",
  firstName: "Erika",
  lastName: "Sachbearbeiter",
};

/** Rolle ohne HR-Bearbeitung (darf lesen, nicht versenden). */
const VORGESETZTE: SessionPayload = {
  userId: "u-vg",
  email: "vg@example.org",
  role: "VORGESETZTER",
  firstName: "Volker",
  lastName: "Gesetzt",
};

/** Mandantenbeschraenkte Rolle OHNE Zuweisung zu org-1 — „fremder Mandant". */
const LEITUNG_FREMD: SessionPayload = {
  userId: "u-el",
  email: "el@example.org",
  role: "EINRICHTUNGSLEITUNG",
  firstName: "Egon",
  lastName: "Leitung",
};

function vorgang(teil: Zeile = {}): Zeile {
  return {
    id: "onb-1",
    displayId: "ONB-2026-031",
    organizationId: "org-1",
    questionnaireType: "STANDARD",
    formTemplateSnapshot: null,
    status: "SUPERVISOR_SUBMITTED",
    firstName: "Anna",
    lastName: "Beispiel",
    email: "anna.privat@example.org",
    token: "fb-token",
    submittedAt: new Date(Date.now() - 3 * TAG),
    supervisorToken: TOKEN,
    supervisorEmail: "a.leitung@example.org",
    supervisorSubmittedAt: new Date(Date.now() - 2 * TAG),
    personalData: { firstName: "Anna", lastName: "Beispiel", currentStep: 5, isComplete: true },
    supervisorData: {
      isComplete: true,
      vertragsbeginn: BEGINN,
      stellenbeschreibung: "Lehrkraft Sek. I",
      betriebsstaette: "Minden, Hauptstandort",
      kostenstellen: [],
    },
    organization: { id: "org-1", name: "FES Minden", mandantNumber: "01" },
    ...teil,
  };
}

function aufgabe(teil: Zeile = {}): Zeile {
  return {
    id: `i-${naechsteId()}`,
    onboardingId: "onb-1",
    templateItemId: null,
    title: "Benutzerkonto anlegen",
    category: "Vor Arbeitsbeginn",
    orderIndex: naechsteId(),
    description: null,
    assignee: "IT",
    relativeDueDays: null,
    isCompleted: false,
    completedAt: null,
    completedById: null,
    dueDate: null,
    notes: null,
    abteilungKommentar: null,
    abteilungKommentarAm: null,
    ...teil,
  };
}

function konfig(teil: Zeile = {}): Zeile {
  return {
    departmentKey: "IT",
    departmentName: "IT-Abteilung",
    email: "it@example.org",
    organizationId: null,
    isActive: true,
    ...teil,
  };
}

function link(teil: Zeile = {}): Zeile {
  return neuerLink({
    onboardingId: "onb-1",
    departmentKey: "IT",
    departmentName: "IT-Abteilung",
    email: "it@example.org",
    token: "tok-it",
    expiresAt: new Date(Date.now() + 60 * TAG),
    sentAt: new Date(Date.now() - 5 * TAG),
    lastSentAt: new Date(Date.now() - 5 * TAG),
    lastSendStatus: "SENT",
    ...teil,
  });
}

let ipNummer = 0;
function neueIp(): string {
  ipNummer++;
  return `10.${(ipNummer >> 16) & 255}.${(ipNummer >> 8) & 255}.${ipNummer & 255}`;
}

function anfrage(
  url: string,
  method: string,
  opts: { body?: unknown; roh?: string; ip?: string; headers?: Record<string, string> } = {},
): NextRequest {
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  if (opts.ip) headers["x-forwarded-for"] = opts.ip;
  let body: string | undefined;
  if (opts.roh !== undefined) {
    body = opts.roh;
  } else if (opts.body !== undefined) {
    body = JSON.stringify(opts.body);
    headers["Content-Type"] = "application/json";
  }
  return new NextRequest(url, { method, headers, ...(body !== undefined ? { body } : {}) });
}

const idParams = (id = "onb-1") => ({ params: Promise.resolve({ id }) });

const alteUmgebung = { ...process.env };

beforeEach(() => {
  jest.clearAllMocks();
  process.env.NEXT_PUBLIC_APP_URL = BASIS;
  dbLeeren();
  db.onboardingVorgaenge = [vorgang()];
  db.konfigs = [konfig()];
  mockGetSession.mockResolvedValue(HR);
  mockTrigger.mockImplementation(async (_e, p) => ({ status: "SENT", recipient: String(p.email ?? "hr@example.org") }));

  mockAktion.mockReset();
  mockAktion.mockImplementation(echtOnboarding.onboardingAbteilungsAktionAusfuehren);
  mockLaden.mockReset();
  mockLaden.mockImplementation(echtOnboarding.onboardingAbteilungenLaden);
  mockFaelligkeiten.mockReset();
  mockFaelligkeiten.mockImplementation(echtOnboarding.faelligkeitenSetzen);
  mockPortal.mockReset();
  mockPortal.mockImplementation(echtUebergaenge.onboardingAufgabeImPortalAendern);
  mockZugriff.mockReset();
  mockZugriff.mockImplementation(echtRechte.canAccessProcess);
});

afterAll(() => {
  process.env = alteUmgebung;
});

// =============================================
// POST /api/onboarding/[id]/abteilungen
// =============================================

describe("POST /api/onboarding/[id]/abteilungen", () => {
  const url = `${BASIS}/api/onboarding/onb-1/abteilungen`;
  const post = (opts: Parameters<typeof anfrage>[2] = {}) =>
    abteilungenRoute.POST(anfrage(url, "POST", opts), idParams());

  it("401 ohne Session, der Dienst laeuft nicht", async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await post({ body: {} });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Nicht authentifiziert" });
    expect(mockAktion).not.toHaveBeenCalled();
  });

  it("leerer Body → Dienst mit rohBody undefined (= informieren)", async () => {
    mockAktion.mockResolvedValue({ status: 201, body: { data: {}, meldung: "ok", hinweis: null } });
    await post();
    expect(mockAktion).toHaveBeenCalledWith({ onboardingId: "onb-1", rohBody: undefined, session: HR });
  });

  it("{} wird unveraendert durchgereicht", async () => {
    mockAktion.mockResolvedValue({ status: 201, body: {} });
    await post({ body: {} });
    expect(mockAktion).toHaveBeenCalledWith({ onboardingId: "onb-1", rohBody: {}, session: HR });
  });

  it("Aktion und Alias kommen unveraendert beim Dienst an", async () => {
    mockAktion.mockResolvedValue({ status: 201, body: {} });
    await post({ body: { aktion: "link-erneuern", departmentKey: "IT" } });
    await post({ body: { action: "remind", departmentKey: "IT" } });
    expect(mockAktion.mock.calls.map((c) => c[0].rohBody)).toEqual([
      { aktion: "link-erneuern", departmentKey: "IT" },
      { action: "remind", departmentKey: "IT" },
    ]);
  });

  it("kaputtes JSON → 400 „Ungültige Eingabe“, ohne Dienstaufruf (heisst NICHT informieren)", async () => {
    const res = await post({ roh: '{ "aktion": "link-erneu', headers: { "Content-Type": "application/json" } });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: MELDUNGEN.UNGUELTIGE_EINGABE });
    expect(mockAktion).not.toHaveBeenCalled();
    expect(mockTrigger).not.toHaveBeenCalled();
  });

  it.each([201, 409, 502])("reicht Status %i und Body des Dienstes 1:1 weiter", async (status) => {
    const body = {
      data: { aktion: "informieren", versendet: [], uebersprungen: [] },
      meldung: "Meldung",
      hinweis: "Hinweis",
      ...(status >= 400 ? { error: "Meldung" } : {}),
    };
    mockAktion.mockResolvedValue({ status, body });
    const res = await post({ body: {} });
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual(body);
  });

  it("500 bei einer Ausnahme im Dienst", async () => {
    const stumm = jest.spyOn(console, "error").mockImplementation(() => {});
    mockAktion.mockRejectedValue(new Error("DB weg"));
    const res = await post({ body: {} });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Interner Serverfehler" });
    stumm.mockRestore();
  });

  describe("mit dem echten Dienst", () => {
    beforeEach(() => {
      db.onboardingAufgaben = [aufgabe({ relativeDueDays: -7 })];
    });

    it("informiert die Abteilung und antwortet 201", async () => {
      const res = await post();
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.data.versendet).toEqual([
        expect.objectContaining({ departmentKey: "IT", email: "it@example.org", status: "SENT" }),
      ]);
      expect(db.links).toHaveLength(1);
      expect(mockTrigger.mock.calls.map((c) => c[0])).toContain("onboarding-department-assigned");
    });

    it("409 mit Grund, solange die Modalitaeten fehlen — und ohne jede Mail", async () => {
      db.onboardingVorgaenge = [
        vorgang({ status: "IN_PROGRESS", supervisorSubmittedAt: null, supervisorData: { isComplete: false } }),
      ];
      const res = await post();
      expect(res.status).toBe(409);
      expect(await res.json()).toMatchObject({ grund: "MODALITAETEN_FEHLEN" });
      expect(mockTrigger).not.toHaveBeenCalled();
      expect(db.links).toHaveLength(0);
    });

    it("404 mit demselben Text bei unbekanntem und bei fremdem Mandanten", async () => {
      const unbekannt = await abteilungenRoute.POST(anfrage(url, "POST"), idParams("gibt-es-nicht"));
      expect(unbekannt.status).toBe(404);
      expect(await unbekannt.json()).toEqual({ error: MELDUNGEN.ONBOARDING_VORGANG_NICHT_GEFUNDEN });

      // Heute sind alle HR_EDIT_ROLES global; die Mandantenpruefung haelt,
      // falls sich das aendert — deshalb hier ueber canAccessProcess.
      mockZugriff.mockResolvedValue(false);
      const fremd = await post();
      expect(fremd.status).toBe(404);
      expect(await fremd.json()).toEqual({ error: MELDUNGEN.ONBOARDING_VORGANG_NICHT_GEFUNDEN });
      expect(db.links).toHaveLength(0);
    });

    it("403 fuer eine Rolle ohne HR-Bearbeitung", async () => {
      mockGetSession.mockResolvedValue(VORGESETZTE);
      const res = await post();
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: "Keine Berechtigung" });
    });
  });
});

// =============================================
// GET /api/onboarding/[id]/abteilungen
// =============================================

describe("GET /api/onboarding/[id]/abteilungen", () => {
  const get = (id = "onb-1") =>
    abteilungenRoute.GET(anfrage(`${BASIS}/api/onboarding/${id}/abteilungen`, "GET"), idParams(id));

  it("401 ohne Session", async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await get();
    expect(res.status).toBe(401);
    expect(mockLaden).not.toHaveBeenCalled();
  });

  it.each([
    [403, { error: "Keine Berechtigung" }],
    [404, { error: MELDUNGEN.ONBOARDING_VORGANG_NICHT_GEFUNDEN }],
    [200, { abteilungen: { modul: "ONBOARDING" }, fuehrungskraft: { email: null, name: null, quelle: null } }],
  ])("reicht %i und den Body des Dienstes 1:1 weiter", async (status, body) => {
    mockLaden.mockResolvedValue({ status, body });
    const res = await get();
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual(body);
    expect(mockLaden).toHaveBeenCalledWith({ onboardingId: "onb-1", session: HR });
  });

  it("mit dem echten Dienst: Vorschau ohne zu schreiben", async () => {
    db.onboardingAufgaben = [aufgabe({ relativeDueDays: -7 })];
    const res = await get();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.abteilungen.modul).toBe("ONBOARDING");
    expect(body.abteilungen.zeilen).toEqual([
      expect.objectContaining({ departmentKey: "IT", departmentName: "IT-Abteilung" }),
    ]);
    expect(body.fuehrungskraft).toEqual({ email: "a.leitung@example.org", name: null, quelle: "VORGANG" });
    // Weder Links noch Faelligkeiten entstehen beim blossen Ansehen.
    expect(db.links).toHaveLength(0);
    expect(db.onboardingAufgaben[0].dueDate).toBeNull();
    expect(mockTrigger).not.toHaveBeenCalled();
  });
});

// =============================================
// GET /api/onboarding/[id]
// =============================================

describe("GET /api/onboarding/[id]", () => {
  const get = (id = "onb-1") =>
    vorgangLaden(anfrage(`${BASIS}/api/onboarding/${id}`, "GET"), idParams(id));

  beforeEach(() => {
    db.onboardingAufgaben = [aufgabe({ relativeDueDays: -7 })];
    db.links = [link()];
  });

  it("404 mit demselben Text bei fremdem Mandanten wie bei unbekanntem Vorgang (frueher 403)", async () => {
    const unbekannt = await get("gibt-es-nicht");
    expect(unbekannt.status).toBe(404);
    expect(await unbekannt.json()).toEqual({ error: MELDUNGEN.ONBOARDING_VORGANG_NICHT_GEFUNDEN });

    mockGetSession.mockResolvedValue(LEITUNG_FREMD);
    const fremd = await get();
    expect(fremd.status).toBe(404);
    expect(await fremd.json()).toEqual({ error: MELDUNGEN.ONBOARDING_VORGANG_NICHT_GEFUNDEN });
  });

  it("legt Abteilungsübersicht, Führungskraft, Link-URL und Fälligkeit über den Vorgang", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.abteilungen).toMatchObject({
      modul: "ONBOARDING",
      gesperrt: null,
      bezugsdatum: BEGINN.toISOString(),
      vorgangAbgeschlossen: false,
    });
    expect(body.fuehrungskraft).toEqual({ email: "a.leitung@example.org", name: null, quelle: "VORGANG" });
    expect(body.departmentLinks[0].url).toBe(`${BASIS}/onboarding-tasks/tok-it`);
    expect(body.departmentLinks[0].anzeige).toBeDefined();
    // Vorschau der Faelligkeit (Vertragsbeginn minus 7 Tage), noch nicht gespeichert.
    expect(body.checklistItems[0].faelligAm).toBe("2026-09-24T00:00:00.000Z");
    expect(body.checklistItems[0].erledigtVon).toBeDefined();
    expect(db.onboardingAufgaben[0].dueDate).toBeNull();
    // Die bisherigen Felder bleiben.
    expect(body.requiredDocuments).toBeDefined();
    expect(body.fragebogenFortschritt).toBeDefined();
  });

  it("meldet die fehlenden Modalitäten als Sperre und verschweigt das Bezugsdatum", async () => {
    db.onboardingVorgaenge = [
      vorgang({ status: "IN_PROGRESS", supervisorSubmittedAt: null, supervisorData: { isComplete: false } }),
    ];
    const body = await (await get()).json();
    expect(body.abteilungen.gesperrt).toMatchObject({ grund: "MODALITAETEN_FEHLEN" });
    expect(body.abteilungen.bezugsdatum).toBeNull();
    expect(body.checklistItems[0].faelligAm).toBeNull();
  });
});

// =============================================
// GET /api/onboarding/[id]/checklist
// =============================================

describe("GET /api/onboarding/[id]/checklist", () => {
  const get = (id = "onb-1") =>
    checklisteRoute.GET(anfrage(`${BASIS}/api/onboarding/${id}/checklist`, "GET"), idParams(id));

  it("hat keinen POST-Export mehr", () => {
    expect((checklisteRoute as Record<string, unknown>).POST).toBeUndefined();
  });

  it("401 ohne Session, 403 fuer eine Rolle ausserhalb des Portals", async () => {
    mockGetSession.mockResolvedValue(null);
    expect((await get()).status).toBe(401);

    mockGetSession.mockResolvedValue({ ...HR, role: "BEM_BEAUFTRAGTER" });
    const res = await get();
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Keine Berechtigung" });
  });

  it("404 mit demselben Text bei unbekanntem und bei fremdem Mandanten", async () => {
    const unbekannt = await get("gibt-es-nicht");
    expect(unbekannt.status).toBe(404);
    expect(await unbekannt.json()).toEqual({ error: MELDUNGEN.ONBOARDING_VORGANG_NICHT_GEFUNDEN });

    mockGetSession.mockResolvedValue(LEITUNG_FREMD);
    const fremd = await get();
    expect(fremd.status).toBe(404);
    expect(await fremd.json()).toEqual({ error: MELDUNGEN.ONBOARDING_VORGANG_NICHT_GEFUNDEN });
  });

  it("liefert die Aufgaben wie bisher unter `data`", async () => {
    db.onboardingAufgaben = [aufgabe({ title: "Benutzerkonto anlegen" })];
    const res = await get();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].title).toBe("Benutzerkonto anlegen");
  });
});

// =============================================
// PATCH /api/onboarding/[id]/checklist/[itemId]
// =============================================

describe("PATCH /api/onboarding/[id]/checklist/[itemId]", () => {
  const itemParams = (itemId: string, id = "onb-1") => ({ params: Promise.resolve({ id, itemId }) });
  const patch = (itemId: string, opts: Parameters<typeof anfrage>[2] = {}, id = "onb-1") =>
    punktAendern(anfrage(`${BASIS}/api/onboarding/${id}/checklist/${itemId}`, "PATCH", opts), itemParams(itemId, id));

  it("401 ohne Session, der Dienst laeuft nicht", async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await patch("i-1", { body: { isCompleted: true } });
    expect(res.status).toBe(401);
    expect(mockPortal).not.toHaveBeenCalled();
  });

  it("kaputtes JSON → Dienst mit undefined (400, frueher 500)", async () => {
    mockPortal.mockResolvedValue({ status: 400, body: { error: MELDUNGEN.UNGUELTIGE_EINGABE } });
    const res = await patch("i-1", { roh: "{kaputt", headers: { "Content-Type": "application/json" } });
    expect(mockPortal).toHaveBeenCalledWith({
      onboardingId: "onb-1",
      itemId: "i-1",
      rohBody: undefined,
      session: HR,
    });
    expect(res.status).toBe(400);
  });

  it("500 bei einer Ausnahme im Dienst", async () => {
    const stumm = jest.spyOn(console, "error").mockImplementation(() => {});
    mockPortal.mockRejectedValue(new Error("DB weg"));
    const res = await patch("i-1", { body: { isCompleted: true } });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Interner Serverfehler" });
    stumm.mockRestore();
  });

  it("antwortet mit { item, progress } statt dem nackten Datensatz", async () => {
    const a = aufgabe({ title: "Benutzerkonto anlegen" });
    db.onboardingAufgaben = [a, aufgabe({ title: "Zugänge einrichten" })];
    db.users = [{ id: "u-hr", firstName: "Erika", lastName: "Sachbearbeiter" }];

    const res = await patch(a.id as string, { body: { isCompleted: true } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.item).toMatchObject({ id: a.id, isCompleted: true });
    expect(body.item.erledigtVon).toMatchObject({ art: "PORTAL" });
    expect(body.progress).toEqual({ total: 2, completed: 1, allCompleted: false });
    // Das eigene Haekchen im Portal meldet im Onboarding niemandem etwas.
    expect(mockTrigger).not.toHaveBeenCalled();
  });
});

// =============================================
// POST /api/modalitaeten/[token] — Faelligkeiten, kein Versand
// =============================================

describe("POST /api/modalitaeten/[token]", () => {
  const tokenParams = { params: Promise.resolve({ token: TOKEN }) };
  const absenden = () =>
    modalitaetenAbsenden(
      anfrage(`${BASIS}/api/modalitaeten/${TOKEN}`, "POST", { ip: neueIp(), body: {} }),
      tokenParams,
    );

  beforeEach(() => {
    // Der Vorgang ist noch offen: Die Fuehrungskraft reicht jetzt erst ein.
    db.onboardingVorgaenge = [
      vorgang({
        status: "IN_PROGRESS",
        supervisorSubmittedAt: null,
        supervisorData: {
          isComplete: false,
          vertragsbeginn: BEGINN,
          stellenbeschreibung: "Lehrkraft Sek. I",
          betriebsstaette: "Minden, Hauptstandort",
          kostenstellen: [],
        },
      }),
    ];
    db.onboardingAufgaben = [
      aufgabe({ title: "Benutzerkonto anlegen", relativeDueDays: -7 }),
      aufgabe({ title: "Ohne Frist", relativeDueDays: null }),
      aufgabe({ title: "Von Hand gesetzt", relativeDueDays: -3, dueDate: new Date("2026-08-01T00:00:00.000Z") }),
    ];
    mockValidateToken.mockResolvedValue({
      valid: true,
      onboarding: {
        ...db.onboardingVorgaenge[0],
        supervisorData: db.onboardingVorgaenge[0].supervisorData,
      },
    });
  });

  it("rechnet die Fälligkeiten nach der Abgabe einmal aus — ohne jede Mail an Abteilungen", async () => {
    const res = await absenden();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true });

    // Vertragsbeginn minus 7 Tage.
    expect((db.onboardingAufgaben[0].dueDate as Date).toISOString()).toBe("2026-09-24T00:00:00.000Z");
    // Ohne Tagesangabe bleibt die Aufgabe ohne Frist (und ohne Erinnerung).
    expect(db.onboardingAufgaben[1].dueDate).toBeNull();
    // Eine von Hand gesetzte Faelligkeit wird nie ueberschrieben.
    expect((db.onboardingAufgaben[2].dueDate as Date).toISOString()).toBe("2026-08-01T00:00:00.000Z");

    // Kein Versand: Abteilungen informiert nur HR per Knopf.
    expect(db.links).toHaveLength(0);
    expect(mockTrigger.mock.calls.map((c) => c[0])).not.toContain("onboarding-department-assigned");
  });

  it("lässt einen Fehler beim Setzen der Fälligkeiten die Abgabe nicht umwerfen", async () => {
    const stumm = jest.spyOn(console, "error").mockImplementation(() => {});
    mockFaelligkeiten.mockRejectedValue(new Error("Datenbank weg"));

    const res = await absenden();

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true });
    // Die Abgabe selbst ist gespeichert.
    expect(db.onboardingVorgaenge[0].supervisorSubmittedAt).toBeInstanceOf(Date);
    expect(db.onboardingAufgaben[0].dueDate).toBeNull();
    stumm.mockRestore();
  });
});
