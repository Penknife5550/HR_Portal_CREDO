/**
 * Einstellungen → Abteilungen (Paket 1b, M8): /api/settings/departments[/id]
 *
 * Vorher scheiterte hier jedes Anlegen: Die Seite schickte {name, key}, der
 * Server erwartete {departmentKey, departmentName} (immer 400); ein zentraler
 * Eintrag (organizationId null) lief ueber findUnique auf den
 * zusammengesetzten Schluessel und endete mit 500; `email.trim()` auf einer
 * Zahl ergab im PATCH 500; ein Protokoll gab es nicht. Diese Suite haelt die
 * Reparatur fest — mit gemocktem Prisma, damit die Aufrufe selbst (findFirst
 * mit organizationId null, include nur {id, name}) pruefbar sind.
 */

const mockGetSession = jest.fn();
const mockPrisma = {
  departmentConfig: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  checklistTemplateItem: { findMany: jest.fn() },
  organization: { findUnique: jest.fn() },
  auditLog: { create: jest.fn() },
  // Interaktive Transaktion: tx ist dasselbe Mock-Objekt (Umsetzung im beforeEach).
  $transaction: jest.fn(),
};

jest.mock("@/lib/auth", () => ({ getSession: mockGetSession }));
jest.mock("@/lib/db", () => ({ prisma: mockPrisma }));

import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/settings/departments/route";
import { PATCH, DELETE } from "@/app/api/settings/departments/[id]/route";

// =============================================
// Fixtures
// =============================================

const HR_LEITUNG = { userId: "u-hrl", email: "hrl@credo.de", role: "HR_LEITUNG", firstName: "H", lastName: "L" };
const SUPER_ADMIN = { ...HR_LEITUNG, userId: "u-sa", role: "SUPER_ADMIN" };
const HR_SACHBEARBEITER = { ...HR_LEITUNG, userId: "u-hrs", role: "HR_SACHBEARBEITER" };

const ORG = { id: "org-gym", name: "FES Gymnasium" };
const JETZT = new Date("2026-09-22T08:00:00.000Z");

function zeile(teil: Record<string, unknown> = {}) {
  return {
    id: "dep-1",
    departmentKey: "IT",
    departmentName: "IT-Abteilung",
    email: "it@credo.de",
    organizationId: null,
    organization: null,
    isActive: true,
    createdAt: JETZT,
    updatedAt: JETZT,
    ...teil,
  };
}

const URL_BASIS = "http://localhost:3000/api/settings/departments";
const OHNE_PARAMS = { params: Promise.resolve({}) };
const mitId = (id: string) => ({ params: Promise.resolve({ id }) });

function anfrage(methode: string, body?: unknown, url = URL_BASIS) {
  return new NextRequest(url, {
    method: methode,
    ...(body !== undefined && {
      body: typeof body === "string" ? body : JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    }),
  });
}

async function antwort(res: Response) {
  return { status: res.status, body: await res.json() };
}

const NEU_IT = { departmentKey: "IT", departmentName: "IT-Abteilung", email: "it@credo.de" };

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(mockPrisma));
  mockGetSession.mockResolvedValue(HR_LEITUNG);
  mockPrisma.departmentConfig.findMany.mockResolvedValue([]);
  mockPrisma.departmentConfig.findFirst.mockResolvedValue(null);
  mockPrisma.departmentConfig.findUnique.mockResolvedValue(null);
  mockPrisma.departmentConfig.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) =>
    zeile({ id: "dep-neu", ...data, organization: data.organizationId ? ORG : null }),
  );
  mockPrisma.departmentConfig.update.mockImplementation(
    async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => zeile({ id: where.id, ...data }),
  );
  mockPrisma.departmentConfig.delete.mockResolvedValue({});
  mockPrisma.checklistTemplateItem.findMany.mockResolvedValue([]);
  mockPrisma.organization.findUnique.mockResolvedValue(null);
  mockPrisma.auditLog.create.mockResolvedValue({});
});

const audits = () => mockPrisma.auditLog.create.mock.calls.map((c) => c[0].data);

// =============================================
// Rechte
// =============================================

describe("Rechte: nur SUPER_ADMIN und HR_LEITUNG", () => {
  it("HR_SACHBEARBEITER bekommt 403 bei allen vier Methoden — ohne Datenbankzugriff", async () => {
    mockGetSession.mockResolvedValue(HR_SACHBEARBEITER);
    const ergebnisse = [
      await GET(anfrage("GET"), OHNE_PARAMS),
      await POST(anfrage("POST", NEU_IT), OHNE_PARAMS),
      await PATCH(anfrage("PATCH", { departmentName: "X" }), mitId("dep-1")),
      await DELETE(anfrage("DELETE"), mitId("dep-1")),
    ];
    for (const res of ergebnisse) {
      expect(await antwort(res)).toEqual({ status: 403, body: { error: "Keine Berechtigung" } });
    }
    expect(mockPrisma.departmentConfig.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.departmentConfig.create).not.toHaveBeenCalled();
    expect(mockPrisma.departmentConfig.update).not.toHaveBeenCalled();
    expect(mockPrisma.departmentConfig.delete).not.toHaveBeenCalled();
  });

  it("ohne Anmeldung 401", async () => {
    mockGetSession.mockResolvedValue(null);
    expect(await antwort(await GET(anfrage("GET"), OHNE_PARAMS))).toEqual({
      status: 401,
      body: { error: "Nicht authentifiziert" },
    });
  });

  it("SUPER_ADMIN darf", async () => {
    mockGetSession.mockResolvedValue(SUPER_ADMIN);
    expect((await GET(anfrage("GET"), OHNE_PARAMS)).status).toBe(200);
  });
});

// =============================================
// POST
// =============================================

describe("POST /api/settings/departments", () => {
  it("legt eine ZENTRALE Abteilung an (organizationId null) — frueher 500", async () => {
    const { status, body } = await antwort(
      await POST(anfrage("POST", { ...NEU_IT, organizationId: null }), OHNE_PARAMS),
    );
    expect(status).toBe(201);
    // findFirst mit organizationId null — findUnique auf den zusammengesetzten
    // Schluessel nimmt null nicht an
    expect(mockPrisma.departmentConfig.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { departmentKey: "IT", organizationId: null } }),
    );
    expect(mockPrisma.departmentConfig.create).toHaveBeenCalledWith({
      data: { departmentKey: "IT", departmentName: "IT-Abteilung", email: "it@credo.de", organizationId: null },
      include: { organization: { select: { id: true, name: true } } },
    });
    expect(body.data).toMatchObject({
      id: "dep-neu",
      departmentKey: "IT",
      departmentName: "IT-Abteilung",
      organization: null,
      label: "IT-Abteilung",
      reserviert: false,
    });
    expect(mockPrisma.organization.findUnique).not.toHaveBeenCalled();
  });

  it('organizationId "" heisst ebenfalls zentral', async () => {
    const res = await POST(anfrage("POST", { ...NEU_IT, organizationId: "" }), OHNE_PARAMS);
    expect(res.status).toBe(201);
    expect(mockPrisma.departmentConfig.create.mock.calls[0][0].data.organizationId).toBeNull();
  });

  it("schreibt DEPARTMENT_CONFIG_CREATED im selben Commit", async () => {
    await POST(anfrage("POST", { ...NEU_IT, email: "  it@credo.de  " }), OHNE_PARAMS);
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(audits()).toEqual([
      {
        userId: "u-hrl",
        processType: "SYSTEM",
        action: "DEPARTMENT_CONFIG_CREATED",
        details: {
          departmentConfigId: "dep-neu",
          departmentKey: "IT",
          departmentName: "IT-Abteilung",
          email: "it@credo.de",
          organizationId: null,
        },
      },
    ]);
  });

  it("zweiter zentraler Eintrag mit gleichem Schluessel → 409 (der Unique-Index faengt NULL nicht)", async () => {
    mockPrisma.departmentConfig.findFirst.mockResolvedValue({ id: "dep-alt" });
    const { status, body } = await antwort(await POST(anfrage("POST", NEU_IT), OHNE_PARAMS));
    expect(status).toBe(409);
    expect(body).toEqual({ error: "Eine zentrale Abteilung „IT“ gibt es schon." });
    expect(mockPrisma.departmentConfig.create).not.toHaveBeenCalled();
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("Duplikat fuer eine Einrichtung → 409 mit dem Einrichtungs-Text", async () => {
    mockPrisma.organization.findUnique.mockResolvedValue({ id: ORG.id });
    mockPrisma.departmentConfig.findFirst.mockResolvedValue({ id: "dep-alt" });
    const { status, body } = await antwort(
      await POST(anfrage("POST", { ...NEU_IT, organizationId: ORG.id }), OHNE_PARAMS),
    );
    expect(status).toBe(409);
    expect(body).toEqual({ error: "Für diese Einrichtung gibt es die Abteilung „IT“ schon." });
    expect(mockPrisma.departmentConfig.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { departmentKey: "IT", organizationId: ORG.id } }),
    );
  });

  it("gleichzeitige Anlage (P2002 beim create) → 409 statt 500", async () => {
    mockPrisma.organization.findUnique.mockResolvedValue({ id: ORG.id });
    mockPrisma.departmentConfig.create.mockRejectedValue(Object.assign(new Error("unique"), { code: "P2002" }));
    const { status, body } = await antwort(
      await POST(anfrage("POST", { ...NEU_IT, organizationId: ORG.id }), OHNE_PARAMS),
    );
    expect(status).toBe(409);
    expect(body.error).toBe("Für diese Einrichtung gibt es die Abteilung „IT“ schon.");
  });

  it("legt fuer eine vorhandene Einrichtung an und liefert organization als {id, name}", async () => {
    mockPrisma.organization.findUnique.mockResolvedValue({ id: ORG.id });
    const { status, body } = await antwort(
      await POST(
        anfrage("POST", { departmentKey: "VERWALTUNG", departmentName: "Sekretariat Gymnasium", email: "sek@fes.de", organizationId: ORG.id }),
        OHNE_PARAMS,
      ),
    );
    expect(status).toBe(201);
    expect(body.data).toMatchObject({
      departmentKey: "VERWALTUNG",
      organizationId: ORG.id,
      organization: ORG,
      label: "Verwaltung / Sekretariat",
    });
  });

  it("unbekannte Einrichtung → 400", async () => {
    const { status, body } = await antwort(
      await POST(anfrage("POST", { ...NEU_IT, organizationId: "org-gibt-es-nicht" }), OHNE_PARAMS),
    );
    expect(status).toBe(400);
    expect(body).toEqual({ error: "Einrichtung nicht gefunden." });
    expect(mockPrisma.departmentConfig.create).not.toHaveBeenCalled();
  });

  it.each([
    ["VORGESETZTER", "Der Schlüssel „VORGESETZTER“ ist reserviert: Aufgaben für Vorgesetzte gehen an die Führungskraft des Vorgangs."],
    ["HR", "Der Schlüssel „HR“ ist reserviert: Die Personalabteilung arbeitet im Portal und bekommt keinen Link."],
    ["MITARBEITER", "Der Schlüssel „MITARBEITER“ ist reserviert: Mitarbeitende arbeiten im Portal und bekommen keinen Link."],
  ])("reservierter Schluessel %s → 400 mit Begruendung", async (key, meldung) => {
    const { status, body } = await antwort(
      await POST(anfrage("POST", { ...NEU_IT, departmentKey: key }), OHNE_PARAMS),
    );
    expect(status).toBe(400);
    expect(body).toEqual({ error: meldung });
    expect(mockPrisma.departmentConfig.findFirst).not.toHaveBeenCalled();
  });

  it("die alte Form der Seite ({name, key}) wird mit einer deutschen Meldung abgewiesen", async () => {
    const { status, body } = await antwort(
      await POST(anfrage("POST", { name: "IT-Abteilung", key: "IT", email: "it@credo.de" }), OHNE_PARAMS),
    );
    expect(status).toBe(400);
    expect(body.error).toBe("Bitte einen Schlüssel angeben.");
  });

  it("ungueltige Adresse und falscher Schluessel → 400", async () => {
    expect(
      await antwort(await POST(anfrage("POST", { ...NEU_IT, email: "keine-adresse" }), OHNE_PARAMS)),
    ).toEqual({ status: 400, body: { error: "Die E-Mail-Adresse ist nicht gültig." } });
    const klein = await antwort(await POST(anfrage("POST", { ...NEU_IT, departmentKey: "it" }), OHNE_PARAMS));
    expect(klein.status).toBe(400);
    expect(klein.body.error).toMatch(/Großbuchstaben/);
  });

  it("kaputtes JSON → 400 statt 500", async () => {
    expect(await antwort(await POST(anfrage("POST", "{kaputt"), OHNE_PARAMS))).toEqual({
      status: 400,
      body: { error: "Ungültiger Request-Body" },
    });
  });
});

// =============================================
// PATCH
// =============================================

describe("PATCH /api/settings/departments/[id]", () => {
  beforeEach(() => {
    mockPrisma.departmentConfig.findUnique.mockResolvedValue(zeile());
  });

  it("email als Zahl → 400 (frueher 500 durch email.trim())", async () => {
    const { status, body } = await antwort(await PATCH(anfrage("PATCH", { email: 42 }), mitId("dep-1")));
    expect(status).toBe(400);
    expect(body).toEqual({ error: "Bitte eine E-Mail-Adresse angeben." });
    expect(mockPrisma.departmentConfig.update).not.toHaveBeenCalled();
  });

  it("der Anzeigename ist aenderbar; Protokoll nur mit dem geaenderten Feld (von/nach)", async () => {
    const { status, body } = await antwort(
      await PATCH(anfrage("PATCH", { departmentName: "IT-Support FES", email: "it@credo.de" }), mitId("dep-1")),
    );
    expect(status).toBe(200);
    expect(body.data).toMatchObject({ id: "dep-1", departmentName: "IT-Support FES", label: "IT-Abteilung" });
    expect(mockPrisma.departmentConfig.update).toHaveBeenCalledWith({
      where: { id: "dep-1" },
      data: { departmentName: "IT-Support FES" },
      include: { organization: { select: { id: true, name: true } } },
    });
    expect(audits()).toEqual([
      {
        userId: "u-hrl",
        processType: "SYSTEM",
        action: "DEPARTMENT_CONFIG_UPDATED",
        details: {
          departmentConfigId: "dep-1",
          departmentKey: "IT",
          organizationId: null,
          aenderungen: { departmentName: { von: "IT-Abteilung", nach: "IT-Support FES" } },
        },
      },
    ]);
  });

  it("E-Mail und Status: beide Aenderungen im Protokoll", async () => {
    await PATCH(anfrage("PATCH", { email: "neu@credo.de", isActive: false }), mitId("dep-1"));
    expect(audits()[0].details.aenderungen).toEqual({
      email: { von: "it@credo.de", nach: "neu@credo.de" },
      isActive: { von: true, nach: false },
    });
  });

  it("Schluessel und Einrichtung sind nicht aenderbar (werden verworfen)", async () => {
    await PATCH(
      anfrage("PATCH", { departmentKey: "HR", organizationId: "org-x", departmentName: "Neu" }),
      mitId("dep-1"),
    );
    expect(mockPrisma.departmentConfig.update.mock.calls[0][0].data).toEqual({ departmentName: "Neu" });
  });

  it("ohne echte Aenderung: 200, kein Schreiben, kein Protokoll", async () => {
    const { status, body } = await antwort(
      await PATCH(anfrage("PATCH", { departmentName: "IT-Abteilung" }), mitId("dep-1")),
    );
    expect(status).toBe(200);
    expect(body.data.departmentName).toBe("IT-Abteilung");
    expect(mockPrisma.departmentConfig.update).not.toHaveBeenCalled();
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("leerer Rumpf → 400", async () => {
    expect(await antwort(await PATCH(anfrage("PATCH", {}), mitId("dep-1")))).toEqual({
      status: 400,
      body: { error: "Mindestens ein Feld erforderlich." },
    });
  });

  it("unbekannte Abteilung → 404", async () => {
    mockPrisma.departmentConfig.findUnique.mockResolvedValue(null);
    expect(await antwort(await PATCH(anfrage("PATCH", { isActive: false }), mitId("weg")))).toEqual({
      status: 404,
      body: { error: "Abteilung nicht gefunden" },
    });
  });

  it("zwischen Lesen und Schreiben geloescht (P2025) → 404 statt 500", async () => {
    mockPrisma.departmentConfig.update.mockRejectedValue(Object.assign(new Error("weg"), { code: "P2025" }));
    expect((await PATCH(anfrage("PATCH", { isActive: false }), mitId("dep-1"))).status).toBe(404);
  });
});

// =============================================
// DELETE
// =============================================

describe("DELETE /api/settings/departments/[id]", () => {
  it("loescht und protokolliert DEPARTMENT_CONFIG_DELETED", async () => {
    mockPrisma.departmentConfig.findUnique.mockResolvedValue(
      zeile({ id: "dep-7", departmentKey: "DSB", departmentName: "Datenschutz", email: "dsb@credo.de", organizationId: ORG.id }),
    );
    expect(await antwort(await DELETE(anfrage("DELETE"), mitId("dep-7")))).toEqual({
      status: 200,
      body: { success: true },
    });
    expect(mockPrisma.departmentConfig.delete).toHaveBeenCalledWith({ where: { id: "dep-7" } });
    expect(audits()).toEqual([
      {
        userId: "u-hrl",
        processType: "SYSTEM",
        action: "DEPARTMENT_CONFIG_DELETED",
        details: {
          departmentConfigId: "dep-7",
          departmentKey: "DSB",
          departmentName: "Datenschutz",
          email: "dsb@credo.de",
          organizationId: ORG.id,
        },
      },
    ]);
  });

  it("unbekannte Abteilung → 404, nichts geloescht", async () => {
    expect(await antwort(await DELETE(anfrage("DELETE"), mitId("weg")))).toEqual({
      status: 404,
      body: { error: "Abteilung nicht gefunden" },
    });
    expect(mockPrisma.departmentConfig.delete).not.toHaveBeenCalled();
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });
});

// =============================================
// GET
// =============================================

describe("GET /api/settings/departments", () => {
  const punkt = (templateId: string, name: string, defaultAssignee: string | null) => ({
    templateId,
    defaultAssignee,
    template: { name },
  });

  beforeEach(() => {
    mockPrisma.departmentConfig.findMany.mockResolvedValue([
      zeile({ id: "d-it", departmentKey: "IT", departmentName: "IT-Abteilung" }),
      zeile({ id: "d-fac", departmentKey: "FACILITY", departmentName: "Facility", isActive: false }),
      zeile({ id: "d-sek", departmentKey: "VERWALTUNG", departmentName: "Sekretariat GYM", organizationId: ORG.id, organization: ORG }),
      zeile({ id: "d-alt", departmentKey: "VORGESETZTER", departmentName: "Vorgesetzter", email: "chef@credo.de" }),
    ]);
    mockPrisma.checklistTemplateItem.findMany.mockResolvedValue([
      punkt("t-off", "Offboarding: Standard", "IT"),
      punkt("t-off", "Offboarding: Standard", "IT"),
      punkt("t-off", "Offboarding: Standard", "FACILITY"),
      punkt("t-off", "Offboarding: Standard", "VORGESETZTER"),
      punkt("t-off", "Offboarding: Standard", "HR"),
      punkt("t-off", "Offboarding: Standard", "DSB"),
      punkt("t-on", "Standard-Einstellung (TV-L)", "IT"),
      // Freitext der Onboarding-Vorlagen (bis Paket 5): kein Schluessel
      punkt("t-on", "Standard-Einstellung (TV-L)", "Vorgesetzter"),
      punkt("t-on", "Standard-Einstellung (TV-L)", "Verwaltung"),
      punkt("t-on", "Standard-Einstellung (TV-L)", null),
    ]);
  });

  it("liest nur aktive Vorlagen und die Einrichtung nur als {id, name}", async () => {
    await GET(anfrage("GET"), OHNE_PARAMS);
    expect(mockPrisma.departmentConfig.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ include: { organization: { select: { id: true, name: true } } } }),
    );
    expect(mockPrisma.checklistTemplateItem.findMany).toHaveBeenCalledWith({
      where: { template: { isActive: true } },
      select: { templateId: true, defaultAssignee: true, template: { select: { name: true } } },
    });
  });

  it("DTO mit einheitlichen Feldnamen, label und reserviert", async () => {
    const { status, body } = await antwort(await GET(anfrage("GET"), OHNE_PARAMS));
    expect(status).toBe(200);
    expect(body.data).toHaveLength(4);
    expect(body.data[0]).toMatchObject({
      id: "d-it",
      departmentKey: "IT",
      departmentName: "IT-Abteilung",
      organization: null,
      label: "IT-Abteilung",
      reserviert: false,
    });
    expect(body.data[2].organization).toEqual(ORG);
    expect(body.data[3]).toMatchObject({ departmentKey: "VORGESETZTER", reserviert: true, label: "Führungskraft" });
  });

  it("zaehlt die Verwendung je Schluessel ueber alle Vorlagen, Freitext nicht", async () => {
    const { body } = await antwort(await GET(anfrage("GET"), OHNE_PARAMS));
    expect(body.verwendung).toEqual({
      IT: { aufgaben: 3, vorlagen: 2 },
      FACILITY: { aufgaben: 1, vorlagen: 1 },
      VORGESETZTER: { aufgaben: 1, vorlagen: 1 },
      HR: { aufgaben: 1, vorlagen: 1 },
      DSB: { aufgaben: 1, vorlagen: 1 },
    });
  });

  it("fehlende Adressen: nur inaktive (FACILITY) und keine (DSB); nie Fuehrungskraft, HR oder Freitext", async () => {
    const { body } = await antwort(await GET(anfrage("GET"), OHNE_PARAMS));
    expect(body.fehlendeAdressen).toEqual([
      { vorlage: "Offboarding: Standard", departmentKey: "FACILITY", label: "Facility Management" },
      { vorlage: "Offboarding: Standard", departmentKey: "DSB", label: "Datenschutzbeauftragte/r" },
    ]);
  });
});
