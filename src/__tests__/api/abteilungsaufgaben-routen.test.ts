/**
 * Tests: Routen der Abteilungsaufgaben im Offboarding (Paket 1b)
 *
 * Die Fachlogik (Rolle, Mandant, Status, Sperren, Versand, Uebergaenge, Mails)
 * steckt in src/lib/abteilungsaufgaben-dienst.ts und
 * src/lib/abteilungsaufgaben-uebergaenge.ts und ist dort getestet
 * (src/__tests__/lib/abteilungsaufgaben-dienst.test.ts). Hier geht es um das,
 * was die Routen SELBST tun:
 *   - Session, Body-Lesen (leer / {} / kaputt), IP-Bremse VOR dem Dienst,
 *     Status und Body des Dienstes 1:1 weiterreichen, 500 bei Ausnahmen,
 *   - die Routen mit eigener Logik: GET/PATCH /api/offboarding/[id]
 *     (Mandant → 404, Abteilungsuebersicht, Fuehrungskraft mit Freigabeliste,
 *     neuer letzter Arbeitstag verschiebt Faelligkeiten), GET checklist,
 *     Cron-Antwort, Auswertung nur versendeter Links.
 *
 * Die Dienstfunktionen sind jest.fn-Huellen um die ECHTEN Funktionen: Ein
 * Test kann sie fuer das reine Durchreichen ersetzen, die uebrigen laufen
 * durch den echten Dienst gegen die In-Memory-Datenbank
 * (src/__tests__/hilfen/abteilungs-fake-db.ts). Was die Routen darueber hinaus
 * an Prisma brauchen (offboardingProcess.update, include beim Laden des
 * Vorgangs, die Abfragen der Auswertung), haengt DIESE Datei an den Fake an.
 */

type MailErgebnis = { status: "SENT" | "FAILED" | "SKIPPED"; detail?: string; recipient?: string } | null;

const mockGetSession = jest.fn();
const mockTrigger = jest.fn(
  async (_event: string, payload: Record<string, unknown>): Promise<MailErgebnis> => ({
    status: "SENT",
    recipient: String(payload.email ?? "hr@example.org"),
  }),
);

jest.mock("@/lib/db", () => ({
  prisma: jest.requireActual("../hilfen/abteilungs-fake-db").fakePrisma,
}));
jest.mock("@/lib/auth", () => ({ getSession: () => mockGetSession() }));
jest.mock("@/lib/webhooks", () => ({
  triggerWebhooks: (e: string, p: Record<string, unknown>) => mockTrigger(e, p),
}));
jest.mock("@/lib/encryption", () => ({
  encrypt: (v: string) => v,
  decrypt: (v: string) => v,
  isEncryptionConfigured: () => false,
}));
jest.mock("@/lib/permissions", () => {
  const echt = jest.requireActual("@/lib/permissions");
  return { ...echt, canAccessProcess: jest.fn(echt.canAccessProcess) };
});
jest.mock("@/lib/abteilungsaufgaben-dienst", () => {
  const echt = jest.requireActual("@/lib/abteilungsaufgaben-dienst");
  return {
    ...echt,
    abteilungsAktionAusfuehren: jest.fn(echt.abteilungsAktionAusfuehren),
    erinnerungenSenden: jest.fn(echt.erinnerungenSenden),
  };
});
jest.mock("@/lib/abteilungsaufgaben-uebergaenge", () => {
  const echt = jest.requireActual("@/lib/abteilungsaufgaben-uebergaenge");
  return {
    ...echt,
    oeffentlicheAufgabenLaden: jest.fn(echt.oeffentlicheAufgabenLaden),
    oeffentlicheAufgabeAendern: jest.fn(echt.oeffentlicheAufgabeAendern),
    aufgabeImPortalAendern: jest.fn(echt.aufgabeImPortalAendern),
  };
});

import { NextRequest } from "next/server";
import { db, dbLeeren, fakePrisma, naechsteId, neuerLink, type Zeile } from "../hilfen/abteilungs-fake-db";
import * as abteilungsLinksRoute from "@/app/api/offboarding/[id]/department-links/route";
import { GET as aufgabenPerLinkLaden } from "@/app/api/offboarding-tasks/[token]/route";
import { PATCH as aufgabePerLinkAendern } from "@/app/api/offboarding-tasks/[token]/[itemId]/route";
import { GET as vorgangLaden, PATCH as vorgangAendern } from "@/app/api/offboarding/[id]/route";
import { GET as checklisteLaden } from "@/app/api/offboarding/[id]/checklist/route";
import { PATCH as checklistenPunktAendern } from "@/app/api/offboarding/[id]/checklist/[itemId]/route";
import { POST as cronLauf } from "@/app/api/cron/offboarding-reminders/route";
import { GET as auswertungLaden } from "@/app/api/offboarding/analytics/route";
import { abteilungsAktionAusfuehren, erinnerungenSenden } from "@/lib/abteilungsaufgaben-dienst";
import {
  aufgabeImPortalAendern,
  oeffentlicheAufgabeAendern,
  oeffentlicheAufgabenLaden,
} from "@/lib/abteilungsaufgaben-uebergaenge";
import { canAccessProcess, type SessionPayload } from "@/lib/permissions";
import { MELDUNGEN } from "@/lib/abteilungsaufgaben";

// =============================================
// Echte Funktionen hinter den Huellen
// =============================================

const echtDienst = jest.requireActual<typeof import("@/lib/abteilungsaufgaben-dienst")>(
  "@/lib/abteilungsaufgaben-dienst",
);
const echtUebergaenge = jest.requireActual<typeof import("@/lib/abteilungsaufgaben-uebergaenge")>(
  "@/lib/abteilungsaufgaben-uebergaenge",
);
const echtRechte = jest.requireActual<typeof import("@/lib/permissions")>("@/lib/permissions");

const mockAktion = abteilungsAktionAusfuehren as jest.Mock;
const mockCron = erinnerungenSenden as jest.Mock;
const mockLinkLaden = oeffentlicheAufgabenLaden as jest.Mock;
const mockLinkAendern = oeffentlicheAufgabeAendern as jest.Mock;
const mockPortal = aufgabeImPortalAendern as jest.Mock;
const mockZugriff = canAccessProcess as jest.Mock;

// =============================================
// Fake-Datenbank: was die Routen zusaetzlich brauchen
// =============================================

type FakeTabelle = Record<string, jest.Mock>;
const fp = fakePrisma as unknown as Record<string, FakeTabelle> & { $transaction: jest.Mock };

// Vorgang mit `include` laden und offboardingProcess.update/updateMany
// (GET/PATCH /api/offboarding/[id]) kann der Fake selbst; hier kommt nur noch
// dazu, was ausschliesslich die Routen brauchen (Auswertung, siehe unten).

// =============================================
// Testdaten
// =============================================

const BASIS = "https://hr.example.org";
const CRON_SECRET = "test-cron-secret-abteilungsaufgaben";
const TAG = 86_400_000;

const HR: SessionPayload = {
  userId: "u-hr",
  email: "hr@example.org",
  role: "HR_SACHBEARBEITER",
  firstName: "Erika",
  lastName: "Sachbearbeiter",
};

/** Mandantenbeschraenkte Rolle OHNE Zuweisung zu org-1 — "fremder Mandant". */
const LEITUNG_FREMD: SessionPayload = {
  userId: "u-el",
  email: "el@example.org",
  role: "EINRICHTUNGSLEITUNG",
  firstName: "Egon",
  lastName: "Leitung",
};

function vorgang(teil: Zeile = {}): Zeile {
  return {
    id: "off-1",
    displayId: "OFF-2027-GYM-014",
    sequentialNumber: 14,
    organizationId: "org-1",
    status: "HANDOVER_PHASE",
    exitType: "KUENDIGUNG_ARBEITNEHMER",
    employeeEmail: "max.mustermann@example.org",
    employeePrivateEmail: null,
    employeeFirstName: "Max",
    employeeLastName: "Mustermann",
    lastWorkingDay: new Date("2027-07-31T00:00:00.000Z"),
    supervisorEmail: null,
    supervisorName: null,
    organization: { id: "org-1", name: "FES Minden", mandantNumber: "01" },
    zeugnisBewertung: null,
    contractEnd: null,
    ...teil,
  };
}

function aufgabe(teil: Zeile): Zeile {
  return {
    id: `i-${naechsteId()}`,
    offboardingId: "off-1",
    title: "Aufgabe",
    category: "Phase 5: Letzter Tag",
    orderIndex: naechsteId(),
    description: null,
    assigneeDepartment: "IT",
    isCompleted: false,
    completedAt: null,
    completedById: null,
    dueDate: new Date("2027-07-31T00:00:00.000Z"),
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
    offboardingId: "off-1",
    departmentKey: "IT",
    departmentName: "IT-Abteilung",
    email: "it@example.org",
    token: `tok-${naechsteId()}`,
    expiresAt: new Date(Date.now() + 60 * TAG),
    sentAt: new Date(Date.now() - 10 * TAG),
    lastSendStatus: "SENT",
    ...teil,
  });
}

// Jede Anfrage an die oeffentlichen Routen bekommt eine eigene IP — die
// IP-Bremse (20/min) ist ein Modulzaehler und gilt ueber alle Tests hinweg.
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

const idParams = (id = "off-1") => ({ params: Promise.resolve({ id }) });

const alteUmgebung = { ...process.env };

beforeEach(() => {
  jest.clearAllMocks();
  process.env.NEXT_PUBLIC_APP_URL = BASIS;
  process.env.CRON_SECRET = CRON_SECRET;
  dbLeeren();
  db.vorgaenge = [vorgang()];
  db.konfigs = [konfig()];
  mockGetSession.mockResolvedValue(HR);
  mockTrigger.mockImplementation(async (_e, p) => ({ status: "SENT", recipient: String(p.email ?? "hr@example.org") }));

  // Huellen auf die echten Funktionen zuruecksetzen (ein Test kann sie ersetzen).
  mockAktion.mockReset();
  mockAktion.mockImplementation(echtDienst.abteilungsAktionAusfuehren);
  mockCron.mockReset();
  mockCron.mockImplementation(echtDienst.erinnerungenSenden);
  mockLinkLaden.mockReset();
  mockLinkLaden.mockImplementation(echtUebergaenge.oeffentlicheAufgabenLaden);
  mockLinkAendern.mockReset();
  mockLinkAendern.mockImplementation(echtUebergaenge.oeffentlicheAufgabeAendern);
  mockPortal.mockReset();
  mockPortal.mockImplementation(echtUebergaenge.aufgabeImPortalAendern);
  mockZugriff.mockReset();
  mockZugriff.mockImplementation(echtRechte.canAccessProcess);
});

afterAll(() => {
  process.env = alteUmgebung;
});

// =============================================
// POST /api/offboarding/[id]/department-links
// =============================================

describe("POST /api/offboarding/[id]/department-links", () => {
  const url = `${BASIS}/api/offboarding/off-1/department-links`;
  const post = (opts: Parameters<typeof anfrage>[2] = {}) =>
    abteilungsLinksRoute.POST(anfrage(url, "POST", opts), idParams());

  it("hat keinen GET-Export mehr", () => {
    expect((abteilungsLinksRoute as Record<string, unknown>).GET).toBeUndefined();
  });

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
    expect(mockAktion).toHaveBeenCalledWith({ offboardingId: "off-1", rohBody: undefined, session: HR });
  });

  it("{} wird unveraendert durchgereicht", async () => {
    mockAktion.mockResolvedValue({ status: 201, body: {} });
    await post({ body: {} });
    expect(mockAktion).toHaveBeenCalledWith({ offboardingId: "off-1", rohBody: {}, session: HR });
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
    expect(await res.json()).toEqual({ error: "Ungültige Eingabe" });
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
    const spion = jest.spyOn(console, "error").mockImplementation(() => {});
    mockAktion.mockRejectedValue(new Error("DB weg"));
    const res = await post({ body: {} });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Interner Serverfehler" });
    spion.mockRestore();
  });

  describe("mit dem echten Dienst", () => {
    beforeEach(() => {
      db.aufgaben = [
        aufgabe({ title: "IT-Zugänge sperren", assigneeDepartment: "IT" }),
        aufgabe({ title: "Übergabe", assigneeDepartment: "VORGESETZTER" }),
        aufgabe({ title: "Zeugnis", assigneeDepartment: "HR" }),
      ];
    });

    it("informiert, meldet die fehlende Führungskraft — und ein zweiter Klick ist 409 mit demselben Token", async () => {
      const res = await post();
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.meldung).toBe("1 Abteilung informiert: IT-Abteilung.");
      expect(body.hinweis).toContain("Führungskraft");
      expect(body.data.versendet).toEqual([
        expect.objectContaining({ departmentKey: "IT", email: "it@example.org", status: "SENT" }),
      ]);
      expect(body.data.uebersprungen).toEqual([
        expect.objectContaining({ departmentKey: "VORGESETZTER", grund: "KEINE_FUEHRUNGSKRAFT" }),
      ]);
      const token = db.links[0].token;

      const zweiter = await post({ body: {} });
      expect(zweiter.status).toBe(409);
      const b2 = await zweiter.json();
      expect(b2.error).toBe(b2.meldung);
      expect(db.links[0].token).toBe(token);
    });

    it("403 für Rollen ausserhalb HR_EDIT_ROLES (auch wenn sie das Portal sehen)", async () => {
      mockGetSession.mockResolvedValue({ ...HR, role: "VORGESETZTER" });
      const res = await post();
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: "Keine Berechtigung" });
      expect(db.links).toHaveLength(0);
    });

    it("fremder Mandant → 404 mit demselben Text wie ein unbekannter Vorgang", async () => {
      mockZugriff.mockResolvedValue(false);
      const fremd = await post();
      const unbekannt = await abteilungsLinksRoute.POST(
        anfrage(`${BASIS}/api/offboarding/off-x/department-links`, "POST"),
        idParams("off-x"),
      );
      expect(fremd.status).toBe(404);
      expect(unbekannt.status).toBe(404);
      expect(await fremd.json()).toEqual({ error: "Offboarding-Vorgang nicht gefunden" });
      expect(await unbekannt.json()).toEqual({ error: "Offboarding-Vorgang nicht gefunden" });
    });

    it("abgeschlossener Vorgang → 409 mit grund VORGANG_ABGESCHLOSSEN", async () => {
      db.vorgaenge = [vorgang({ status: "COMPLETED" })];
      const res = await post();
      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({
        error: MELDUNGEN.HR_VORGANG_ABGESCHLOSSEN,
        grund: "VORGANG_ABGESCHLOSSEN",
      });
      expect(mockTrigger).not.toHaveBeenCalled();
    });

    it("502, wenn der Mailserver scheitert — der Link bleibt ohne sentAt", async () => {
      mockTrigger.mockResolvedValue({ status: "FAILED", detail: "SMTP-Server nicht erreichbar" });
      const res = await post();
      expect(res.status).toBe(502);
      const body = await res.json();
      expect(body.error).toBe(body.meldung);
      expect(db.links[0]).toMatchObject({ lastSendStatus: "FAILED", sentAt: null });
    });

    it("der alte Aufruf { action: 'remind' } erinnert (Alias)", async () => {
      db.links = [link({ token: "tok-remind" })];
      const res = await post({ body: { action: "remind", departmentKey: "IT" } });
      expect(res.status).toBe(201);
      expect(mockTrigger.mock.calls.map((c) => c[0])).toEqual(["offboarding-reminder"]);
      expect(db.links[0].token).toBe("tok-remind");
    });

    it("unbekannte Aktion → 400 aus dem Schema", async () => {
      const res = await post({ body: { aktion: "alles-loeschen", departmentKey: "IT" } });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Unbekannte Aktion." });
    });
  });
});

// =============================================
// GET /api/offboarding-tasks/[token]
// =============================================

describe("GET /api/offboarding-tasks/[token]", () => {
  const laden = (token: string, ip = neueIp()) =>
    aufgabenPerLinkLaden(anfrage(`${BASIS}/api/offboarding-tasks/${token}`, "GET", { ip }), {
      params: Promise.resolve({ token }),
    });

  it("429 durch die IP-Bremse VOR dem Dienst (21. Aufruf derselben IP)", async () => {
    mockLinkLaden.mockResolvedValue({ status: 404, body: { error: MELDUNGEN.LINK_UNGUELTIG } });
    const ip = neueIp();
    for (let i = 0; i < 20; i++) {
      expect((await laden(`geraten-${i}`, ip)).status).toBe(404);
    }
    const res = await laden("geraten-21", ip);
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: MELDUNGEN.ZU_VIELE_ANFRAGEN });
    expect(mockLinkLaden).toHaveBeenCalledTimes(20);
  });

  it.each([
    [404, { error: MELDUNGEN.LINK_UNGUELTIG }],
    [410, { error: MELDUNGEN.VORGANG_ABGEBROCHEN }],
    [410, { error: MELDUNGEN.LINK_ABGELAUFEN }],
    [200, { data: { readOnly: true } }],
  ])("reicht %i und den Body des Dienstes 1:1 weiter", async (status, body) => {
    mockLinkLaden.mockResolvedValue({ status, body });
    const res = await laden("tok-x");
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual(body);
    expect(mockLinkLaden).toHaveBeenCalledWith("tok-x");
  });

  it("mit dem echten Dienst: nur die eigenen Aufgaben, ohne interne Notiz, Beschreibung und Urheber", async () => {
    db.links = [link({ token: "tok-it" })];
    db.aufgaben = [
      aufgabe({ title: "Konto sperren", notes: "Intern: Rücksprache Schulleitung", description: "alt", completedById: null }),
      aufgabe({ title: "Schlüssel", assigneeDepartment: "FACILITY" }),
    ];
    const res = await laden("tok-it");
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.abteilung).toEqual({ key: "IT", name: "IT-Abteilung" });
    expect(data.vorgang).toMatchObject({ vorgangsnummer: "OFF-2027-GYM-014", einrichtung: "FES Minden" });
    expect(data.readOnly).toBe(false);
    expect(data.aufgaben).toHaveLength(1);
    expect(Object.keys(data.aufgaben[0]).sort()).toEqual(
      [
        "abteilungKommentar",
        "abteilungKommentarAm",
        "category",
        "completedAt",
        "dueDate",
        "id",
        "isCompleted",
        "orderIndex",
        "title",
      ].sort(),
    );
    expect(JSON.stringify(data)).not.toContain("Intern: Rücksprache");
    expect(data).not.toHaveProperty("progress");
    expect(db.links[0].openCount).toBe(1);
  });

  it("mit dem echten Dienst: abgeschlossener Vorgang = nur lesen, abgebrochener = 410", async () => {
    db.links = [link({ token: "tok-it" })];
    db.aufgaben = [aufgabe({})];
    db.vorgaenge = [vorgang({ status: "COMPLETED" })];
    const lesend = await laden("tok-it");
    expect(lesend.status).toBe(200);
    expect((await lesend.json()).data.readOnly).toBe(true);

    db.vorgaenge = [vorgang({ status: "CANCELLED" })];
    const abgebrochen = await laden("tok-it");
    expect(abgebrochen.status).toBe(410);
    expect(await abgebrochen.json()).toEqual({ error: MELDUNGEN.VORGANG_ABGEBROCHEN });
  });
});

// =============================================
// PATCH /api/offboarding-tasks/[token]/[itemId]
// =============================================

describe("PATCH /api/offboarding-tasks/[token]/[itemId]", () => {
  const aendern = (token: string, itemId: string, opts: Parameters<typeof anfrage>[2] = {}) =>
    aufgabePerLinkAendern(
      anfrage(`${BASIS}/api/offboarding-tasks/${token}/${itemId}`, "PATCH", { ip: neueIp(), ...opts }),
      { params: Promise.resolve({ token, itemId }) },
    );

  it("429 durch die IP-Bremse VOR dem Dienst (21. Aufruf derselben IP)", async () => {
    mockLinkAendern.mockResolvedValue({ status: 404, body: { error: MELDUNGEN.LINK_UNGUELTIG } });
    const ip = neueIp();
    for (let i = 0; i < 20; i++) {
      expect((await aendern(`geraten-${i}`, "i-1", { ip, body: { isCompleted: true } })).status).toBe(404);
    }
    const res = await aendern("geraten-21", "i-1", { ip, body: { isCompleted: true } });
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: MELDUNGEN.ZU_VIELE_ANFRAGEN });
    expect(mockLinkAendern).toHaveBeenCalledTimes(20);
  });

  it("kaputtes JSON → Dienst mit undefined", async () => {
    mockLinkAendern.mockResolvedValue({ status: 400, body: { error: "Ungültige Eingabe" } });
    const res = await aendern("tok-x", "i-1", { roh: "{kaputt", headers: { "Content-Type": "application/json" } });
    expect(mockLinkAendern).toHaveBeenCalledWith("tok-x", "i-1", undefined);
    expect(res.status).toBe(400);
  });

  it("reicht Status und Body des Dienstes 1:1 weiter", async () => {
    const body = { data: { aufgabe: { id: "i-1" }, fortschritt: { gesamt: 1, erledigt: 1, prozent: 100 }, allTasksComplete: true } };
    mockLinkAendern.mockResolvedValue({ status: 200, body });
    const res = await aendern("tok-x", "i-1", { body: { isCompleted: true, comment: "Erledigt" } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(body);
    expect(mockLinkAendern).toHaveBeenCalledWith("tok-x", "i-1", { isCompleted: true, comment: "Erledigt" });
  });

  it("500 bei einer Ausnahme im Dienst", async () => {
    const spion = jest.spyOn(console, "error").mockImplementation(() => {});
    mockLinkAendern.mockRejectedValue(new Error("DB weg"));
    const res = await aendern("tok-x", "i-1", { body: { isCompleted: true } });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Interner Serverfehler" });
    spion.mockRestore();
  });

  describe("mit dem echten Dienst", () => {
    let itemId: string;
    beforeEach(() => {
      db.links = [link({ token: "tok-it" })];
      const a = aufgabe({ title: "Konto sperren", notes: "Interne Notiz" });
      itemId = a.id as string;
      db.aufgaben = [a];
    });

    it("kaputter Body → 400 „Ungültige Eingabe“ (frueher 500)", async () => {
      const res = await aendern("tok-it", itemId, { roh: "nicht json", headers: { "Content-Type": "application/json" } });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Ungültige Eingabe" });
    });

    it("speichert den Kommentar getrennt von der internen Notiz; `notes` im Body wird verworfen", async () => {
      const res = await aendern("tok-it", itemId, {
        body: { isCompleted: true, comment: "Konto gesperrt", notes: "überschrieben?" },
      });
      expect(res.status).toBe(200);
      const { data } = await res.json();
      expect(data.aufgabe).toMatchObject({ isCompleted: true, abteilungKommentar: "Konto gesperrt" });
      expect(data.aufgabe).not.toHaveProperty("notes");
      expect(db.aufgaben[0]).toMatchObject({ notes: "Interne Notiz", abteilungKommentar: "Konto gesperrt" });
      expect(mockTrigger.mock.calls.filter((c) => c[0] === "offboarding-task-completed")).toHaveLength(1);
    });

    it("abgeschlossener Vorgang → 409, nur lesen", async () => {
      db.vorgaenge = [vorgang({ status: "COMPLETED" })];
      const res = await aendern("tok-it", itemId, { body: { isCompleted: true } });
      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({ error: MELDUNGEN.VORGANG_ABGESCHLOSSEN_NUR_LESEN });
      expect(db.aufgaben[0].isCompleted).toBe(false);
    });

    it("zweites Limit je Link: der 61. Aufruf auf DENSELBEN Link ist 429, auch von wechselnden IPs", async () => {
      // Die Uhr der Bremse festhalten: Sie fuellt laufend nach (60/min = eine
      // Anfrage je Sekunde). Dauern die 60 Aufrufe unter Last laenger als eine
      // Sekunde, waere sonst wieder Platz — und der 61. Aufruf bekaeme 200.
      const uhr = jest.spyOn(Date, "now").mockReturnValue(Date.now());
      try {
        for (let i = 0; i < 60; i++) {
          const r = await aendern("tok-it", itemId, { body: { comment: `Stand ${i}` } });
          expect(r.status).toBe(200);
        }
        const res = await aendern("tok-it", itemId, { body: { comment: "zu viel" } });
        expect(res.status).toBe(429);
        expect(await res.json()).toEqual({ error: MELDUNGEN.ZU_VIELE_ANFRAGEN });
        expect(db.aufgaben[0].abteilungKommentar).toBe("Stand 59");

        // Ein anderer Link hat seinen eigenen Zaehler.
        db.links.push(link({ departmentKey: "FACILITY", departmentName: "Facility Management", token: "tok-fm" }));
        const fm = aufgabe({ assigneeDepartment: "FACILITY" });
        db.aufgaben.push(fm);
        const anderer = await aendern("tok-fm", fm.id as string, { body: { comment: "geht" } });
        expect(anderer.status).toBe(200);
      } finally {
        uhr.mockRestore();
      }
    });
  });
});

// =============================================
// PATCH /api/offboarding/[id]/checklist/[itemId]
// =============================================

describe("PATCH /api/offboarding/[id]/checklist/[itemId]", () => {
  const aendern = (itemId: string, opts: Parameters<typeof anfrage>[2] = {}) =>
    checklistenPunktAendern(anfrage(`${BASIS}/api/offboarding/off-1/checklist/${itemId}`, "PATCH", opts), {
      params: Promise.resolve({ id: "off-1", itemId }),
    });

  it("401 ohne Session, der Dienst laeuft nicht", async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await aendern("i-1", { body: { isCompleted: true } });
    expect(res.status).toBe(401);
    expect(mockPortal).not.toHaveBeenCalled();
  });

  it("kaputtes JSON → Dienst mit undefined, der Dienst antwortet 400 „Ungültige Eingabe“", async () => {
    const res = await aendern("i-1", { roh: "{", headers: { "Content-Type": "application/json" } });
    expect(mockPortal).toHaveBeenCalledWith({ offboardingId: "off-1", itemId: "i-1", rohBody: undefined, session: HR });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Ungültige Eingabe" });
  });

  it("reicht Status und Body des Dienstes 1:1 weiter", async () => {
    mockPortal.mockResolvedValue({ status: 409, body: { error: MELDUNGEN.CHECKLISTE_ABGEBROCHEN } });
    const res = await aendern("i-1", { body: { isCompleted: true } });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: MELDUNGEN.CHECKLISTE_ABGEBROCHEN });
    expect(mockPortal).toHaveBeenCalledWith({
      offboardingId: "off-1",
      itemId: "i-1",
      rohBody: { isCompleted: true },
      session: HR,
    });
  });

  it("mit dem echten Dienst: Abhaken im Portal nennt den Urheber und den Fortschritt", async () => {
    const a = aufgabe({ title: "Konto sperren" });
    db.aufgaben = [a, aufgabe({ assigneeDepartment: "HR" })];
    const res = await aendern(a.id as string, { body: { isCompleted: true } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.item).toMatchObject({
      isCompleted: true,
      completedById: "u-hr",
      erledigtVon: { art: "PORTAL", name: "Erika Sachbearbeiter" },
    });
    expect(body.progress).toEqual({ total: 2, completed: 1, allCompleted: false });
  });

  it("mit dem echten Dienst: fremder Mandant → 404 wie ein unbekannter Vorgang", async () => {
    mockGetSession.mockResolvedValue(LEITUNG_FREMD);
    const a = aufgabe({});
    db.aufgaben = [a];
    const res = await aendern(a.id as string, { body: { isCompleted: true } });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: MELDUNGEN.VORGANG_NICHT_GEFUNDEN });
    expect(db.aufgaben[0].isCompleted).toBe(false);
  });
});

// =============================================
// GET /api/offboarding/[id]/checklist
// =============================================

describe("GET /api/offboarding/[id]/checklist", () => {
  const laden = (id = "off-1") =>
    checklisteLaden(anfrage(`${BASIS}/api/offboarding/${id}/checklist`, "GET"), idParams(id));

  it("401 ohne Session", async () => {
    mockGetSession.mockResolvedValue(null);
    expect((await laden()).status).toBe(401);
  });

  it("403 für Rollen ausserhalb PORTAL_ROLES", async () => {
    mockGetSession.mockResolvedValue({ ...HR, role: "BEM_BEAUFTRAGTER" });
    const res = await laden();
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Keine Berechtigung" });
  });

  it("fremder Mandant → 404 mit demselben Text wie ein unbekannter Vorgang", async () => {
    mockGetSession.mockResolvedValue(LEITUNG_FREMD);
    const fremd = await laden();
    mockGetSession.mockResolvedValue(HR);
    const unbekannt = await laden("off-x");
    expect(fremd.status).toBe(404);
    expect(unbekannt.status).toBe(404);
    expect(await fremd.json()).toEqual({ error: "Offboarding-Vorgang nicht gefunden" });
    expect(await unbekannt.json()).toEqual({ error: "Offboarding-Vorgang nicht gefunden" });
  });

  it("zugewiesener Mandant sieht die Punkte samt Kommentar der Abteilung, sortiert", async () => {
    mockGetSession.mockResolvedValue(LEITUNG_FREMD);
    db.zuweisungen = [{ userId: "u-el", organizationId: "org-1" }];
    db.aufgaben = [
      aufgabe({ title: "B", category: "Phase 2", orderIndex: 2, abteilungKommentar: "Erledigt, danke" }),
      aufgabe({ title: "A", category: "Phase 1", orderIndex: 5 }),
    ];
    const res = await laden();
    expect(res.status).toBe(200);
    const { items } = await res.json();
    expect(items.map((i: Zeile) => i.title)).toEqual(["A", "B"]);
    expect(items[1].abteilungKommentar).toBe("Erledigt, danke");
  });
});

// =============================================
// GET /api/offboarding/[id]
// =============================================

describe("GET /api/offboarding/[id]", () => {
  const laden = (id = "off-1") => vorgangLaden(anfrage(`${BASIS}/api/offboarding/${id}`, "GET"), idParams(id));

  it("fremder Mandant → 404 „Vorgang nicht gefunden“ (vorher 403), gleich wie unbekannt", async () => {
    mockGetSession.mockResolvedValue(LEITUNG_FREMD);
    const fremd = await laden();
    mockGetSession.mockResolvedValue(HR);
    const unbekannt = await laden("off-x");
    expect(fremd.status).toBe(404);
    expect(unbekannt.status).toBe(404);
    expect(await fremd.json()).toEqual({ error: "Vorgang nicht gefunden" });
    expect(await unbekannt.json()).toEqual({ error: "Vorgang nicht gefunden" });
  });

  it("403 für Rollen ausserhalb PORTAL_ROLES", async () => {
    mockGetSession.mockResolvedValue({ ...HR, role: "SERVICE" });
    expect((await laden()).status).toBe(403);
  });

  it("liefert Abteilungsübersicht, Führungskraft, Urheber und die Link-URL vom Server (APP_URL)", async () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    process.env.APP_URL = "https://portal.example.org";
    db.vorgaenge = [
      vorgang({ zeugnisBewertung: { supervisorEmail: "leitung@example.org", supervisorName: "Anna Leitung" } }),
    ];
    db.users = [{ id: "u-hr", firstName: "Erika", lastName: "Sachbearbeiter" }];
    db.links = [link({ token: "tok-it", departmentKey: "IT" })];
    db.aufgaben = [
      aufgabe({ title: "Per Link", isCompleted: true, completedAt: new Date("2027-07-29T08:14:00Z") }),
      aufgabe({ title: "Im Portal", isCompleted: true, completedAt: new Date(), completedById: "u-hr" }),
      aufgabe({ title: "Offen", assigneeDepartment: "VORGESETZTER", abteilungKommentar: null }),
    ];

    const res = await laden();
    expect(res.status).toBe(200);
    const body = await res.json();

    // Spalten des Vorgangs und wirksame Fuehrungskraft (Rueckfall Zeugnis-Bewertung)
    expect(body.supervisorEmail).toBeNull();
    expect(body.supervisorName).toBeNull();
    expect(body.fuehrungskraft).toEqual({ email: "leitung@example.org", name: "Anna Leitung", quelle: "ZEUGNIS" });

    // Links: URL vom Server, nicht aus dem Browser
    expect(body.departmentLinks).toHaveLength(1);
    expect(body.departmentLinks[0]).toMatchObject({
      url: "https://portal.example.org/offboarding-tasks/tok-it",
      lastSendStatus: "SENT",
      anzeige: expect.objectContaining({ status: expect.any(String), text: expect.any(String) }),
    });
    expect(body.departmentLinks[0]).toHaveProperty("zugestelltAn");
    expect(body.departmentLinks[0]).toHaveProperty("lastSentAt");

    // Aufgaben: Urheber und Kommentarfelder
    const nachTitel = (t: string) => body.checklistItems.find((i: Zeile) => i.title === t);
    expect(nachTitel("Per Link").erledigtVon).toEqual({ art: "LINK", name: "IT-Abteilung" });
    expect(nachTitel("Im Portal").erledigtVon).toEqual({ art: "PORTAL", name: "Erika Sachbearbeiter" });
    expect(nachTitel("Offen").erledigtVon).toBeNull();
    expect(nachTitel("Offen")).toHaveProperty("abteilungKommentar");
    expect(nachTitel("Offen")).toHaveProperty("abteilungKommentarAm");

    // Karte: auch die Fuehrungskraft-Zeile, die noch nicht informiert ist
    expect(body.abteilungen).toMatchObject({
      vorgangAbgeschlossen: false,
      bezugsdatum: "2027-07-31T00:00:00.000Z",
      niemandInformiert: false,
    });
    const zeilen = body.abteilungen.zeilen as Zeile[];
    expect(zeilen.map((z) => z.departmentKey)).toEqual(["IT", "VORGESETZTER"]);
    expect(zeilen[0]).toMatchObject({ link: expect.objectContaining({ url: "https://portal.example.org/offboarding-tasks/tok-it" }) });
    expect(zeilen[1]).toMatchObject({
      istFuehrungskraft: true,
      email: "leitung@example.org",
      fuehrungskraftName: "Anna Leitung",
      informierbar: true,
      link: null,
    });
    expect(body.abteilungen.informierbar).toBe(1);

    // Die Rueckfall-Quellen werden mit genau diesen Feldern geladen
    expect(fp.offboardingProcess.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          zeugnisBewertung: { select: { supervisorEmail: true, supervisorName: true } },
          contractEnd: { select: { supervisorEmail: true } },
        }),
      }),
    );
  });

  it("abgeschlossener Vorgang: Karte nur lesend, niemand informierbar", async () => {
    db.vorgaenge = [vorgang({ status: "COMPLETED", supervisorEmail: "chef@example.org" })];
    db.aufgaben = [aufgabe({ assigneeDepartment: "VORGESETZTER" })];
    const body = await (await laden()).json();
    expect(body.abteilungen.vorgangAbgeschlossen).toBe(true);
    expect(body.abteilungen.informierbar).toBe(0);
    expect(body.fuehrungskraft).toEqual({ email: "chef@example.org", name: null, quelle: "VORGANG" });
  });
});

// =============================================
// PATCH /api/offboarding/[id]
// =============================================

describe("PATCH /api/offboarding/[id]", () => {
  const aendern = (body: unknown, id = "off-1") =>
    vorgangAendern(anfrage(`${BASIS}/api/offboarding/${id}`, "PATCH", { body }), idParams(id));
  const letzterAudit = () => db.audits[db.audits.length - 1] as Zeile & { details: Zeile };

  it("canAccessProcess false → 404 „Vorgang nicht gefunden“, nichts geschrieben", async () => {
    mockZugriff.mockResolvedValue(false);
    const res = await aendern({ exitReason: "neu" });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Vorgang nicht gefunden" });
    expect(fp.offboardingProcess.update).not.toHaveBeenCalled();
    expect(db.audits).toHaveLength(0);
  });

  it("unbekannter Vorgang → 404 mit demselben Text", async () => {
    const res = await aendern({ exitReason: "neu" }, "off-x");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Vorgang nicht gefunden" });
  });

  it("403 für Rollen ausserhalb HR_EDIT_ROLES", async () => {
    mockGetSession.mockResolvedValue({ ...HR, role: "EINRICHTUNGSLEITUNG" });
    expect((await aendern({ exitReason: "neu" })).status).toBe(403);
  });

  describe("letzter Arbeitstag", () => {
    let offenIt: Zeile;
    let erledigt: Zeile;
    let ohneFrist: Zeile;
    beforeEach(() => {
      offenIt = aufgabe({ title: "Konto sperren", dueDate: new Date("2027-07-31T00:00:00Z") });
      erledigt = aufgabe({
        title: "Laptop",
        isCompleted: true,
        completedAt: new Date("2027-07-01T00:00:00Z"),
        dueDate: new Date("2027-07-30T00:00:00Z"),
      });
      ohneFrist = aufgabe({ title: "Ohne Frist", assigneeDepartment: "FACILITY", dueDate: null });
      db.aufgaben = [offenIt, erledigt, ohneFrist];
      db.links = [link({ token: "tok-it", expiresAt: new Date("2027-08-30T00:00:00Z") })];
    });

    it("ein neuer Tag verschiebt die OFFENEN Fälligkeiten in einer Transaktion und protokolliert es", async () => {
      const res = await aendern({ lastWorkingDay: "2027-08-14" });
      expect(res.status).toBe(200);
      expect(fp.$transaction).toHaveBeenCalledTimes(1);

      const nach = (a: Zeile) => db.aufgaben.find((x) => x.id === a.id) as Zeile;
      expect((nach(offenIt).dueDate as Date).toISOString()).toBe("2027-08-14T00:00:00.000Z");
      expect((nach(erledigt).dueDate as Date).toISOString()).toBe("2027-07-30T00:00:00.000Z");
      expect(nach(ohneFrist).dueDate).toBeNull();
      expect((db.vorgaenge[0].lastWorkingDay as Date).toISOString()).toBe("2027-08-14T00:00:00.000Z");
      // gueltig bis = spaeteste Faelligkeit + 30 Tage (liegt nach dem alten Ablauf)
      expect((db.links[0].expiresAt as Date).toISOString()).toBe("2027-09-13T00:00:00.000Z");
      expect(db.links[0].token).toBe("tok-it");

      expect(letzterAudit()).toMatchObject({
        action: "OFFBOARDING_UPDATED",
        details: {
          lastWorkingDay: "2027-08-14",
          lastWorkingDayFrom: "2027-07-31",
          faelligkeitenVerschoben: 1,
          linksVerlaengert: 1,
        },
      });
    });

    it("derselbe Tag → kein Verschieben, keine Zähler im Protokoll", async () => {
      const res = await aendern({ lastWorkingDay: "2027-07-31" });
      expect(res.status).toBe(200);
      expect((db.aufgaben[0].dueDate as Date).toISOString()).toBe("2027-07-31T00:00:00.000Z");
      expect(letzterAudit().details).not.toHaveProperty("faelligkeitenVerschoben");
      expect(letzterAudit().details).not.toHaveProperty("lastWorkingDayFrom");
    });

    it("zwei gleichzeitige PATCHes mit demselben Tag verschieben nur EINMAL (alter Tag unter der Sperre gelesen)", async () => {
      // Der erste PATCH hat schon committet: Tag 14.08., Faelligkeit 14.08.
      // Der zweite hat den Vorgang davor gelesen und haelt noch den 31.07.
      db.vorgaenge[0].lastWorkingDay = new Date("2027-08-14T00:00:00.000Z");
      offenIt.dueDate = new Date("2027-08-14T00:00:00.000Z");
      fp.offboardingProcess.findUnique.mockImplementationOnce(async () => ({
        ...vorgang(),
        lastWorkingDay: new Date("2027-07-31T00:00:00.000Z"),
      }));
      const res = await aendern({ lastWorkingDay: "2027-08-14" });
      expect(res.status).toBe(200);
      expect((db.aufgaben.find((x) => x.id === offenIt.id)?.dueDate as Date).toISOString()).toBe(
        "2027-08-14T00:00:00.000Z",
      );
      expect(letzterAudit().details).not.toHaveProperty("faelligkeitenVerschoben");
    });

    it("abgeschlossener Vorgang: Fälligkeiten rücken mit, der Link wird nicht verlängert", async () => {
      db.vorgaenge = [vorgang({ status: "COMPLETED" })];
      const res = await aendern({ lastWorkingDay: "2027-08-14" });
      expect(res.status).toBe(200);
      expect((db.links[0].expiresAt as Date).toISOString()).toBe("2027-08-30T00:00:00.000Z");
      expect(letzterAudit().details).toMatchObject({ faelligkeitenVerschoben: 1, linksVerlaengert: 0 });
    });

    it.each([
      ["kein Datum", "Datum im Format YYYY-MM-DD erforderlich"],
      ["2027-07-31T12:00:00Z", "Datum im Format YYYY-MM-DD erforderlich"],
      ["2027-07-31junk", "Datum im Format YYYY-MM-DD erforderlich"],
      ["2027-13-45", "Ungültiges Datum"],
      ["2027-02-30", "Ungültiges Datum"],
    ])("„%s“ → 400 ohne Transaktion", async (wert, meldung) => {
      const res = await aendern({ lastWorkingDay: wert });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: meldung });
      expect(fp.$transaction).not.toHaveBeenCalled();
      expect(fp.offboardingProcess.update).not.toHaveBeenCalled();
    });
  });

  describe("Führungskraft", () => {
    beforeEach(() => {
      db.domains = "fes-minden.de";
    });

    it("speichert eine Adresse aus einer freigegebenen Domain samt Namen und protokolliert Vorher/Nachher", async () => {
      const res = await aendern({ supervisorEmail: " leitung@fes-minden.de ", supervisorName: "Anna Leitung" });
      expect(res.status).toBe(200);
      expect(db.vorgaenge[0]).toMatchObject({ supervisorEmail: "leitung@fes-minden.de", supervisorName: "Anna Leitung" });
      expect(letzterAudit().details).toMatchObject({
        supervisorEmailFrom: null,
        supervisorEmailTo: "leitung@fes-minden.de",
        supervisorNameFrom: null,
        supervisorNameTo: "Anna Leitung",
      });
    });

    it("freie Adresse ausserhalb der Freigabeliste → 409, nichts gespeichert", async () => {
      const res = await aendern({ supervisorEmail: "chefin@gmail.com" });
      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({ error: MELDUNGEN.FUEHRUNGSKRAFT_NICHT_FREIGEGEBEN });
      expect(db.vorgaenge[0].supervisorEmail).toBeNull();
      expect(fp.offboardingProcess.update).not.toHaveBeenCalled();
      expect(db.audits).toHaveLength(0);
    });

    it("bekannte Adresse aus der Zeugnis-Bewertung ist trotz Freigabeliste erlaubt (Gross/Klein egal)", async () => {
      db.vorgaenge = [vorgang({ zeugnisBewertung: { supervisorEmail: "Leitung@GMAIL.com", supervisorName: null } })];
      const res = await aendern({ supervisorEmail: "leitung@gmail.com" });
      expect(res.status).toBe(200);
      expect(db.vorgaenge[0].supervisorEmail).toBe("leitung@gmail.com");
    });

    it("bekannte Adresse aus dem Vertragsende ist erlaubt", async () => {
      db.vorgaenge = [vorgang({ contractEnd: { supervisorEmail: "leitung@web.de" } })];
      const res = await aendern({ supervisorEmail: "leitung@web.de" });
      expect(res.status).toBe(200);
    });

    it("leere Freigabeliste = keine Einschränkung", async () => {
      db.domains = "";
      const res = await aendern({ supervisorEmail: "chefin@gmail.com" });
      expect(res.status).toBe(200);
      expect(db.vorgaenge[0].supervisorEmail).toBe("chefin@gmail.com");
    });

    it("\"\" löscht Adresse und Namen", async () => {
      db.vorgaenge = [vorgang({ supervisorEmail: "alt@fes-minden.de", supervisorName: "Alte Leitung" })];
      const res = await aendern({ supervisorEmail: "", supervisorName: "" });
      expect(res.status).toBe(200);
      expect(db.vorgaenge[0]).toMatchObject({ supervisorEmail: null, supervisorName: null });
      expect(letzterAudit().details).toMatchObject({
        supervisorEmailFrom: "alt@fes-minden.de",
        supervisorEmailTo: null,
        supervisorNameFrom: "Alte Leitung",
        supervisorNameTo: null,
      });
    });

    it("ungültige Adresse → 400 mit deutscher Meldung", async () => {
      const res = await aendern({ supervisorEmail: "keine-adresse" });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Bitte eine gültige E-Mail-Adresse der Führungskraft angeben." });
    });

    it("unveränderte Adresse wird nicht erneut geprüft und nicht protokolliert", async () => {
      db.vorgaenge = [vorgang({ supervisorEmail: "alt@gmail.com" })];
      const res = await aendern({ supervisorEmail: "alt@gmail.com", exitReason: "Umzug" });
      expect(res.status).toBe(200);
      expect(letzterAudit().details).not.toHaveProperty("supervisorEmailFrom");
    });
  });
});

// =============================================
// POST /api/cron/offboarding-reminders
// =============================================

describe("POST /api/cron/offboarding-reminders", () => {
  const lauf = (secret = CRON_SECRET) =>
    cronLauf(
      anfrage(`${BASIS}/api/cron/offboarding-reminders`, "POST", { headers: { authorization: `Bearer ${secret}` } }),
    );

  it("401 mit falschem Secret, der Dienst laeuft nicht", async () => {
    const res = await lauf("falsch-falsch-falsch-falsch-falsch-xx");
    expect(res.status).toBe(401);
    expect(mockCron).not.toHaveBeenCalled();
  });

  it("gibt das Ergebnis des Dienstes samt `uebersprungen` aus", async () => {
    const ergebnis = {
      remindersProcessed: 1,
      errors: 0,
      details: [{ offboardingId: "off-1", departmentKey: "IT", level: "WARNING", status: "SENT" }],
      uebersprungen: [{ offboardingId: "off-1", departmentKey: "FACILITY", grund: "ADRESSE_GEAENDERT", detail: "x" }],
    };
    mockCron.mockResolvedValue(ergebnis);
    const res = await lauf();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true, timestamp: expect.any(String), ...ergebnis });
    expect(mockCron).toHaveBeenCalledWith(expect.any(Date));
  });

  it("Ausnahme im Dienst → 500", async () => {
    const spion = jest.spyOn(console, "error").mockImplementation(() => {});
    mockCron.mockRejectedValue(new Error("DB weg"));
    const res = await lauf();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Interner Serverfehler" });
    spion.mockRestore();
  });

  it("mit dem echten Dienst: erinnert IT, überspringt die geänderte Adresse, nie informierte bleiben still", async () => {
    const jetzt = Date.now();
    db.konfigs = [
      konfig(),
      konfig({ departmentKey: "FACILITY", departmentName: "Facility Management", email: "fm-neu@example.org" }),
    ];
    db.links = [
      link({ token: "tok-it", sentAt: new Date(jetzt - 10 * TAG) }),
      link({
        departmentKey: "FACILITY",
        departmentName: "Facility Management",
        email: "fm@example.org",
        token: "tok-fm",
        sentAt: new Date(jetzt - 10 * TAG),
      }),
      link({ departmentKey: "DSB", departmentName: "Datenschutz", email: "dsb@example.org", token: "tok-dsb", sentAt: null }),
    ];
    const ueberfaellig = new Date(jetzt - 2 * TAG);
    db.aufgaben = [
      aufgabe({ assigneeDepartment: "IT", dueDate: ueberfaellig }),
      aufgabe({ assigneeDepartment: "FACILITY", dueDate: ueberfaellig }),
      aufgabe({ assigneeDepartment: "DSB", dueDate: ueberfaellig }),
    ];

    const res = await lauf();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.remindersProcessed).toBe(1);
    expect(body.details).toEqual([expect.objectContaining({ departmentKey: "IT", level: "WARNING", status: "SENT" })]);
    expect(body.uebersprungen).toEqual([
      expect.objectContaining({ departmentKey: "FACILITY", grund: "ADRESSE_GEAENDERT" }),
    ]);
    expect(mockTrigger.mock.calls.map((c) => [c[0], c[1].email])).toEqual([["offboarding-reminder", "it@example.org"]]);
    expect(db.links.find((l) => l.departmentKey === "FACILITY")?.token).toBe("tok-fm");
  });
});

// =============================================
// GET /api/offboarding/analytics
// =============================================

describe("GET /api/offboarding/analytics — Abteilungen", () => {
  const gesichert: Record<string, Record<string, jest.Mock | undefined>> = {};

  beforeAll(() => {
    // Nur fuer diese Tests: die uebrigen Abfragen der Auswertung liefern
    // leere Ergebnisse, die Links kommen aus dem Fake.
    gesichert.offboardingProcess = { ...fp.offboardingProcess };
    fp.offboardingProcess.findMany = jest.fn(async () => []);
    fp.offboardingProcess.count = jest.fn(async () => 0);
    fp.offboardingProcess.groupBy = jest.fn(async () => []);
    fp.organization = { findMany: jest.fn(async () => []) };
    fp.exitInterview = { groupBy: jest.fn(async () => []), findMany: jest.fn(async () => []) };
    fp.zeugnisBewertung = { groupBy: jest.fn(async () => []), findMany: jest.fn(async () => []) };
  });

  afterAll(() => {
    Object.assign(fp.offboardingProcess, gesichert.offboardingProcess);
    delete fp.offboardingProcess.count;
    delete fp.offboardingProcess.groupBy;
  });

  it("zählt nur Links, die wirklich hinausgingen (sentAt gesetzt)", async () => {
    const versand = new Date("2027-07-10T00:00:00Z");
    db.links = [
      link({ departmentKey: "IT", sentAt: versand, allTasksComplete: true, completedAt: new Date("2027-07-12T00:00:00Z") }),
      link({ departmentKey: "IT", offboardingId: "off-2", sentAt: null, lastSendStatus: "FAILED" }),
      link({ departmentKey: "FACILITY", departmentName: "Facility Management", sentAt: null }),
    ];
    const res = await auswertungLaden(anfrage(`${BASIS}/api/offboarding/analytics`, "GET"));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(fp.offboardingDepartmentLink.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ sentAt: { not: null } }) }),
    );
    // Nie versendete Links (FAILED oder nie versucht) zaehlen nicht als "zugewiesen".
    expect(body.data.departmentPerformance).toEqual([
      expect.objectContaining({ departmentKey: "IT", totalAssigned: 1, completedOnTime: 1, avgResponseDays: 2 }),
    ]);
  });
});
