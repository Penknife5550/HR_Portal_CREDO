/**
 * Tests: Wer sieht „Ausstattung & Zugänge“ in GET /api/onboarding/[id]?
 * (Paket A2, Feinplan S10, Regel 16)
 *
 * Bemerkungen, Angaben und Hinweise der Führungskraft sieht nur HR
 * (HR_EDIT_ROLES). Die Detailroute lassen aber alle PORTAL_ROLES zu — auch
 * Einrichtungsleitung und Vorgesetzte. Für sie liefert die Route
 * `ausstattung: null`, und `ausstattungUebersichtLaden` fragt die neuen
 * Tabellen gar nicht erst ab.
 *
 * Der Route-Handler wird DIREKT aufgerufen, ohne Middleware — also ohne deren
 * Mandanten-Sperre (`canAccessProcess` ist hier immer wahr). So hält der Test
 * auch dann, wenn die Sperre der Middleware später gelockert wird. Eine Rolle
 * `VIEWER` gibt es nicht; geprüft werden alle PORTAL_ROLES ausserhalb von
 * HR_EDIT_ROLES.
 *
 * Die übrigen Felder der Detailroute (Abteilungen, Unterlagen, Fortschritt)
 * haben eigene Suites und sind hier stillgelegt.
 *
 * Seit S15 (Karte im Reiter Checkliste) auch die eigene Route
 * GET /api/onboarding/[id]/ausstattung: nur HR_EDIT_ROLES — Einrichtungsleitung,
 * Vorgesetzte und der n8n-Schlüssel (SERVICE) bekommen 403, ohne dass der
 * Vorgang oder die neuen Tabellen gelesen werden.
 */

const mockGetSession = jest.fn();

const mockPrisma = {
  onboardingProcess: { findUnique: jest.fn() },
  formTemplate: { findUnique: jest.fn() },
  // die neuen Tabellen und der Katalog (src/lib/ausstattung-dienst.ts)
  onboardingAusstattung: { findMany: jest.fn() },
  onboardingStellenHinweis: { findMany: jest.fn() },
  // seit S15: Aufgabenstand der Karte
  onboardingAusstattungAufgabe: { findMany: jest.fn() },
  checklistItem: { findMany: jest.fn() },
  ausstattungsPosition: { findMany: jest.fn() },
  ausstattungsAusblendung: { findMany: jest.fn() },
  organization: { findUnique: jest.fn() },
  departmentConfig: { findMany: jest.fn() },
  user: { findMany: jest.fn() },
};

jest.mock("@/lib/db", () => ({ prisma: mockPrisma }));
jest.mock("@/lib/auth", () => ({ getSession: () => mockGetSession() }));
jest.mock("@/lib/encryption", () => ({ decrypt: (v: string) => v }));
jest.mock("@/lib/permissions", () => ({
  ...jest.requireActual("@/lib/permissions"),
  // ohne Mandanten-Sperre: Hier zaehlt allein die Rolle
  canAccessProcess: jest.fn(async () => true),
}));
jest.mock("@/lib/abteilungsaufgaben-onboarding", () => ({
  onboardingAbteilungsUebersichtLaden: jest.fn(async () => ({})),
}));
jest.mock("@/lib/fragebogen-fortschritt", () => ({
  ladeVorlagenKonfigurationen: jest.fn(async () => new Map()),
  fortschrittFuerVorgang: jest.fn(() => null),
}));
jest.mock("@/lib/unterlagen-dienst", () => ({
  unterlagenUebersichtLaden: jest.fn(async () => ({ unterlagen: null })),
}));

import { NextRequest } from "next/server";
import { GET } from "@/app/api/onboarding/[id]/route";
import { GET as karteLaden } from "@/app/api/onboarding/[id]/ausstattung/route";
import { HR_EDIT_ROLES, PORTAL_ROLES, type SessionPayload } from "@/lib/permissions";
import type { AusstattungsUebersicht } from "@/lib/ausstattung";

const ID = "11111111-2222-4333-8444-555555555555";
const BEMERKUNG = "Mit Stift und Hülle";
const HINWEIS = "Bitte vor dem ersten Schultag einrichten";

function sitzung(role: string): SessionPayload {
  return { userId: `u-${role}`, email: `${role.toLowerCase()}@example.org`, role, firstName: "Test", lastName: role };
}

function vorgang() {
  return {
    id: ID,
    displayId: "ONB-2027-007",
    email: "anna.privat@example.org",
    firstName: "Anna",
    lastName: "Beispiel",
    organizationId: "org-1",
    arbeitsortId: null,
    arbeitsort: null,
    questionnaireType: "STANDARD",
    processType: "EINSTELLUNG",
    status: "SUPERVISOR_SUBMITTED",
    token: "fb-token",
    supervisorToken: "sv-token",
    submittedAt: new Date("2027-01-12T10:00:00.000Z"),
    supervisorSubmittedAt: new Date("2027-01-14T09:30:00.000Z"),
    organization: { id: "org-1", name: "FES Gymnasium", mandantNumber: "10", type: "GYMNASIUM" },
    personalData: null,
    supervisorData: { isComplete: true, mitAusstattung: true, currentStep: 5, kostenstellen: [] },
    documents: [],
    checklistItems: [],
    notes: [],
    departmentLinks: [],
    invitedBy: null,
    reviewedBy: null,
    _count: { notes: 0 },
  };
}

function katalogPosition(id: string, bezeichnung: string) {
  return {
    id,
    departmentKey: "IT",
    organizationId: null,
    einrichtungsarten: [],
    art: "JA_NEIN",
    angabeSchluessel: null,
    bezeichnung,
    hinweisFuehrungskraft: null,
    hinweisStelle: "Intern: Seriennummer notieren",
    optionen: [],
    vorausgewaehlt: false,
    vorausgewaehlteOptionen: [],
    bemerkungAnbieten: true,
    bemerkungPlatzhalter: null,
    aufgabeTitel: null,
    defaultDueDays: -5,
    personengruppen: [],
    sichtbarFuer: [],
    entgeltrelevant: false,
    isActive: true,
    orderIndex: 0,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.onboardingProcess.findUnique.mockResolvedValue(vorgang());
  mockPrisma.formTemplate.findUnique.mockResolvedValue({ requiredDocuments: [] });
  mockPrisma.onboardingAusstattung.findMany.mockResolvedValue([
    {
      id: "z-1",
      positionId: "pos-ipad",
      departmentKey: "IT",
      art: "JA_NEIN",
      angabeSchluessel: null,
      bezeichnung: "Dienst-iPad (Lernmittel)",
      sichtbarFuer: [],
      reihenfolge: 0,
      auswahl: [],
      angabe: null,
      bemerkung: BEMERKUNG,
      bemerkungQuelle: "FUEHRUNGSKRAFT",
      quelle: "FUEHRUNGSKRAFT",
      erfasstVonId: null,
      gestrichenAm: null,
      createdAt: new Date("2027-01-10T08:00:00.000Z"),
    },
  ]);
  mockPrisma.onboardingStellenHinweis.findMany.mockResolvedValue([
    { departmentKey: "IT", text: HINWEIS, quelle: "FUEHRUNGSKRAFT", checklistItemId: null, gesehenAm: null },
  ]);
  mockPrisma.ausstattungsPosition.findMany.mockResolvedValue([
    katalogPosition("pos-ipad", "Dienst-iPad (Lernmittel)"),
    katalogPosition("pos-laptop", "Dienst-Laptop / PC"),
  ]);
  mockPrisma.ausstattungsAusblendung.findMany.mockResolvedValue([]);
  mockPrisma.organization.findUnique.mockResolvedValue({ type: "GYMNASIUM" });
  mockPrisma.departmentConfig.findMany.mockResolvedValue([
    { departmentKey: "IT", departmentName: "IT-Abteilung", email: "it@example.org", organizationId: null, isActive: true },
  ]);
  mockPrisma.user.findMany.mockResolvedValue([]);
  mockPrisma.onboardingAusstattungAufgabe.findMany.mockResolvedValue([]);
  mockPrisma.checklistItem.findMany.mockResolvedValue([]);
});

async function laden(role: string): Promise<{ status: number; body: Record<string, unknown>; text: string }> {
  mockGetSession.mockResolvedValue(sitzung(role));
  const res = await GET(new NextRequest(`https://hr.example.org/api/onboarding/${ID}`), {
    params: Promise.resolve({ id: ID }),
  });
  const text = await res.text();
  return { status: res.status, body: JSON.parse(text), text };
}

const NICHT_HR = PORTAL_ROLES.filter((r) => !HR_EDIT_ROLES.includes(r));

describe("GET /api/onboarding/[id] — ausstattung (Regel 16)", () => {
  it("die Rollen ausserhalb von HR_EDIT_ROLES sind genau Einrichtungsleitung und Vorgesetzte (keine Rolle VIEWER)", () => {
    expect([...NICHT_HR].sort()).toEqual(["EINRICHTUNGSLEITUNG", "VORGESETZTER"]);
  });

  it.each(HR_EDIT_ROLES)("%s bekommt die Übersicht samt Bemerkung und Hinweis", async (role) => {
    const { status, body } = await laden(role);

    expect(status).toBe(200);
    const u = body.ausstattung as AusstattungsUebersicht;
    expect(u.zustand).toBe("BEARBEITBAR");
    expect(u.darfBearbeiten).toBe(true);
    expect(u.gruppen).toHaveLength(1);
    expect(u.gruppen[0]).toMatchObject({ departmentKey: "IT", stelleName: "IT-Abteilung", adresseFehlt: false });
    expect(u.gruppen[0].zeilen[0].bemerkung).toEqual({ text: BEMERKUNG, label: "Bemerkung der Führungskraft" });
    expect(u.gruppen[0].hinweis?.text).toBe(HINWEIS);
    // hinzufuegbar: der Katalog dieses Vorgangs ohne die schon gewaehlte Position
    expect(u.hinzufuegbar.map((h) => h.positionId)).toEqual(["pos-laptop"]);
    expect(u.einleitung).toBe("Angefordert von der Führungskraft mit den Einstellungsmodalitäten (14.01.2027).");
  });

  it.each(NICHT_HR)("%s bekommt `ausstattung: null` — und die neuen Tabellen werden nicht abgefragt", async (role) => {
    const { status, body, text } = await laden(role);

    expect(status).toBe(200);
    expect(body.ausstattung).toBeNull();
    expect(text).not.toContain(BEMERKUNG);
    expect(text).not.toContain(HINWEIS);
    for (const tabelle of [
      mockPrisma.onboardingAusstattung.findMany,
      mockPrisma.onboardingStellenHinweis.findMany,
      mockPrisma.ausstattungsPosition.findMany,
      mockPrisma.departmentConfig.findMany,
      mockPrisma.user.findMany,
    ]) {
      expect(tabelle).not.toHaveBeenCalled();
    }
  });

  it("die Tabellen stehen nicht im `include` der Route — `...safeOnboarding` gaebe sie sonst an alle weiter", async () => {
    const { body } = await laden("EINRICHTUNGSLEITUNG");

    const include = mockPrisma.onboardingProcess.findUnique.mock.calls[0][0].include as Record<string, unknown>;
    for (const relation of ["ausstattung", "stellenHinweise", "ausstattungAenderungen"]) {
      expect(include).not.toHaveProperty(relation);
    }
    expect(body).not.toHaveProperty("stellenHinweise");
    expect(body).not.toHaveProperty("ausstattungAenderungen");
  });

  it("die Übersicht nutzt die geladene Zeile — der Vorgang wird nicht ein zweites Mal geladen", async () => {
    await laden("HR_SACHBEARBEITER");

    expect(mockPrisma.onboardingProcess.findUnique).toHaveBeenCalledTimes(1);
    expect(mockPrisma.onboardingAusstattung.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { onboardingId: ID } }),
    );
    expect(mockPrisma.onboardingStellenHinweis.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { onboardingId: ID } }),
    );
  });

  it("nie interne Katalogfelder in der Übersicht (Hinweis für die Stelle, Fälligkeit)", async () => {
    const { text } = await laden("HR_LEITUNG");

    expect(text).not.toContain("Seriennummer");
    expect(text).not.toContain("defaultDueDays");
  });

  it("abgeschlossener Vorgang: nur lesbar, nichts hinzufügbar, kein Katalog geladen", async () => {
    mockPrisma.onboardingProcess.findUnique.mockResolvedValue({ ...vorgang(), status: "COMPLETED" });

    const { body } = await laden("SUPER_ADMIN");

    const u = body.ausstattung as AusstattungsUebersicht;
    expect(u.zustand).toBe("NUR_LESEN");
    expect(u.satz).toBe("Der Vorgang ist abgeschlossen – nur noch lesbar.");
    expect(u.hinzufuegbar).toEqual([]);
    expect(u.gruppen[0].zeilen[0].bemerkung?.text).toBe(BEMERKUNG);
    expect(mockPrisma.ausstattungsPosition.findMany).not.toHaveBeenCalled();
  });

  it("SERVICE (n8n-Schlüssel) kommt gar nicht erst an die Detailroute", async () => {
    const { status } = await laden("SERVICE");

    expect(status).toBe(403);
    expect(mockPrisma.onboardingProcess.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.onboardingAusstattung.findMany).not.toHaveBeenCalled();
  });
});

describe("GET /api/onboarding/[id]/ausstattung — nur HR (Regel 16, S15)", () => {
  async function karte(role: string) {
    mockGetSession.mockResolvedValue(sitzung(role));
    const res = await karteLaden(new NextRequest(`https://hr.example.org/api/onboarding/${ID}/ausstattung`), {
      params: Promise.resolve({ id: ID }),
    });
    return { status: res.status, body: await res.json() };
  }

  it.each([...NICHT_HR, "SERVICE"])("%s bekommt 403 — weder Vorgang noch neue Tabellen werden gelesen", async (role) => {
    const { status, body } = await karte(role);

    expect(status).toBe(403);
    expect(body).toEqual({ error: "Keine Berechtigung" });
    expect(mockPrisma.onboardingProcess.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.onboardingAusstattung.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.onboardingStellenHinweis.findMany).not.toHaveBeenCalled();
  });

  it("HR bekommt die Karte samt Aufgabenstand", async () => {
    mockPrisma.onboardingAusstattungAufgabe.findMany.mockResolvedValue([
      { ausstattungId: "z-1", option: "", checklistItemId: "i-ipad" },
    ]);
    mockPrisma.checklistItem.findMany.mockResolvedValue([
      {
        id: "i-ipad",
        title: "Dienst-iPad (Lernmittel) bereitstellen",
        isCompleted: false,
        completedAt: null,
        dueDate: new Date("2027-01-27T00:00:00.000Z"),
        eilt: false,
        entfaelltAm: null,
      },
    ]);

    const { status, body } = await karte("HR_SACHBEARBEITER");

    expect(status).toBe(200);
    const u = body.data as AusstattungsUebersicht;
    expect(u.zustand).toBe("BEARBEITBAR");
    expect(u.gruppen[0].zeilen[0].aufgaben).toEqual([
      {
        option: "",
        checklistItemId: "i-ipad",
        titel: "Dienst-iPad (Lernmittel) bereitstellen",
        status: "offen",
        faelligAm: "2027-01-27T00:00:00.000Z",
        eilt: false,
        erledigtAm: null,
      },
    ]);
    expect(u.gruppen[0].zeilen[0].aktionen).toEqual({ aendern: true, streichen: true, sperrGrund: null });
    // Der Vorgang wird mit eigenem select geladen — nie mit den Fragebogen-Angaben.
    const args = mockPrisma.onboardingProcess.findUnique.mock.calls[0][0] as { select?: Record<string, unknown> };
    expect(args.select).toBeDefined();
    expect(args.select).not.toHaveProperty("personalData");
  });
});
