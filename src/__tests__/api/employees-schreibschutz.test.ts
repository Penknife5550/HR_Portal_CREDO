/**
 * Schreibschutz der Beschaeftigten-Routen (Self-Service S0, Vorbedingung fuer S1)
 *
 * - Schreiben nur die HR-Rollen, nicht der n8n-Schluessel (SERVICE); Lesen bleibt.
 * - Person aus DokuBit: Adresse, Aktiv-Status und Quelle → 409, Deaktivieren → 409.
 * - Eine Person mit Quelle DOKUBIT legt nur der Abgleich an → 400.
 * - Vertrag aus DokuBit: alles, was der Abgleich schreibt → 409, Loeschen → 409.
 * - Jede Aenderung im AuditLog (processType PERSONALSTAMM), nur Feldnamen, nie Werte.
 * - Die Aenderung an der Person ist bedingt auf die gelesene Quelle.
 */

const mockGetSession = jest.fn();
const mockPrisma = {
  employee: { findUnique: jest.fn(), updateMany: jest.fn(), create: jest.fn() },
  employment: { findUnique: jest.fn(), update: jest.fn(), delete: jest.fn(), create: jest.fn() },
  organization: { findUnique: jest.fn() },
  auditLog: { create: jest.fn() },
  $transaction: jest.fn(),
};

jest.mock("@/lib/auth", () => ({ getSession: mockGetSession }));
jest.mock("@/lib/db", () => ({ prisma: mockPrisma }));

import { NextRequest } from "next/server";
import * as personenRoute from "@/app/api/employees/route";
import * as personRoute from "@/app/api/employees/[id]/route";
import * as anstellungenRoute from "@/app/api/employees/[id]/employments/route";
import * as anstellungRoute from "@/app/api/employees/[id]/employments/[employmentId]/route";
import { PERSONALSTAMM_ACTIONS } from "@/lib/constants";

const HR = { userId: "hr1", email: "hr@credo-gruppe.de", role: "HR_SACHBEARBEITER", firstName: "H", lastName: "S" };
const ORG = "11111111-1111-4111-8111-111111111111";
const DATUM = "2027-07-31T00:00:00.000Z";

const PERSON_DOKUBIT = {
  id: "p1",
  firstName: "Anna",
  lastName: "Beispiel",
  email: "anna.beispiel@credo-gruppe.de",
  importSource: "DOKUBIT",
  isActive: true,
};
const VERTRAG_DOKUBIT = {
  id: "v1",
  employeeId: "p1",
  organizationId: ORG,
  abrechnungskreis: "AK",
  personalNumber: "2001",
  mandantNumber: "742",
  isActive: true,
};
const VERTRAG_BESTAND = { ...VERTRAG_DOKUBIT, id: "v2", abrechnungskreis: null, personalNumber: null };

type Handler = (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;

async function aufrufen(handler: Handler, method: string, params: Record<string, string>, body?: unknown) {
  const req = new NextRequest("http://localhost:3000/api/employees", {
    method,
    ...(body !== undefined && { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }),
  });
  const res = await handler(req, { params: Promise.resolve(params) });
  return { status: res.status, body: await res.json() };
}

const person = (body: unknown) => aufrufen(personRoute.PATCH, "PATCH", { id: "p1" }, body);
const personLoeschen = () => aufrufen(personRoute.DELETE, "DELETE", { id: "p1" });
const vertrag = (body: unknown) => aufrufen(anstellungRoute.PATCH, "PATCH", { id: "p1", employmentId: "v1" }, body);
const vertragLoeschen = () => aufrufen(anstellungRoute.DELETE, "DELETE", { id: "p1", employmentId: "v1" });

function auditEintraege() {
  return mockPrisma.auditLog.create.mock.calls.map((c) => c[0].data);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetSession.mockResolvedValue(HR);
  mockPrisma.$transaction.mockImplementation((fn: (tx: typeof mockPrisma) => unknown) => fn(mockPrisma));
  mockPrisma.employee.findUnique.mockResolvedValue(PERSON_DOKUBIT);
  mockPrisma.employee.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.employee.create.mockImplementation(({ data }) => Promise.resolve({ id: "neu", ...data }));
  mockPrisma.employment.findUnique.mockResolvedValue(VERTRAG_DOKUBIT);
  mockPrisma.employment.update.mockImplementation(({ data }) => Promise.resolve({ ...VERTRAG_DOKUBIT, ...data }));
  mockPrisma.employment.create.mockImplementation(({ data }) => Promise.resolve({ id: "v9", ...data }));
  mockPrisma.organization.findUnique.mockResolvedValue({ id: ORG });
  mockPrisma.auditLog.create.mockResolvedValue({});
});

describe("Zugriff", () => {
  const schreibende: [string, () => Promise<{ status: number }>][] = [
    ["POST /api/employees", () => aufrufen(personenRoute.POST, "POST", {}, { firstName: "A", lastName: "B" })],
    ["PATCH /api/employees/[id]", () => person({ firstName: "A" })],
    ["DELETE /api/employees/[id]", personLoeschen],
    [
      "POST /api/employees/[id]/employments",
      () => aufrufen(anstellungenRoute.POST, "POST", { id: "p1" }, { organizationId: ORG }),
    ],
    ["PATCH /api/employees/[id]/employments/[employmentId]", () => vertrag({ position: "Lehrkraft" })],
    ["DELETE /api/employees/[id]/employments/[employmentId]", vertragLoeschen],
  ];

  it.each(schreibende)("%s: 403 fuer SERVICE (n8n-Schluessel), ohne die Datenbank zu fragen", async (_, aufruf) => {
    mockGetSession.mockResolvedValue({ ...HR, role: "SERVICE" });
    const { status } = await aufruf();
    expect(status).toBe(403);
    expect(mockPrisma.employee.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.employment.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("Lesen bleibt fuer SERVICE erlaubt", async () => {
    mockGetSession.mockResolvedValue({ ...HR, role: "SERVICE" });
    const { status } = await aufrufen(personRoute.GET, "GET", { id: "p1" });
    expect(status).toBe(200);
  });
});

describe("Person aus DokuBit", () => {
  it.each([
    ["email", { email: "andere@credo-gruppe.de" }],
    ["email", { email: null }],
    ["isActive", { isActive: true }],
    ["importSource", { importSource: "MANUELL" }],
  ])("%s → 409 ohne Schreiben", async (feld, body) => {
    const { status, body: antwort } = await person({ firstName: "Anna", ...body });
    expect(status).toBe(409);
    expect(antwort.felder).toEqual([feld]);
    expect(antwort.error).toContain("DokuBit");
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("Name und private Angaben bleiben frei, protokolliert nur mit Feldnamen", async () => {
    const { status } = await person({ lastName: "Neu", privateEmail: "privat@example.org" });
    expect(status).toBe(200);
    expect(mockPrisma.employee.updateMany).toHaveBeenCalledWith({
      where: { id: "p1", importSource: "DOKUBIT" },
      data: { lastName: "Neu", privateEmail: "privat@example.org" },
    });
    const [eintrag] = auditEintraege();
    expect(eintrag).toEqual({
      userId: "hr1",
      processType: "PERSONALSTAMM",
      action: PERSONALSTAMM_ACTIONS.PERSON_GEAENDERT,
      details: { employeeId: "p1", felder: ["lastName", "privateEmail"] },
    });
    expect(JSON.stringify(eintrag)).not.toMatch(/Neu|privat@/);
  });

  it("Deaktivieren → 409; das legt der Abgleich am Vertragsende still", async () => {
    const { status, body } = await personLoeschen();
    expect(status).toBe(409);
    expect(body.error).toContain("Vertragsende");
    expect(mockPrisma.employee.updateMany).not.toHaveBeenCalled();
  });
});

describe("Person anderer Quelle", () => {
  it("HR stellt eine Person von Hand auf DOKUBIT um (D1), mit Quelle von/nach im Protokoll", async () => {
    mockPrisma.employee.findUnique.mockResolvedValue({ ...PERSON_DOKUBIT, importSource: "MANUELL" });
    const { status } = await person({ importSource: "DOKUBIT" });
    expect(status).toBe(200);
    expect(auditEintraege()[0].details).toEqual({
      employeeId: "p1",
      felder: ["importSource"],
      quelle: { von: "MANUELL", nach: "DOKUBIT" },
    });
  });

  it("bedingt auf die gelesene Quelle: hat der Abgleich die Person inzwischen uebernommen → 409", async () => {
    mockPrisma.employee.findUnique.mockResolvedValue({ ...PERSON_DOKUBIT, importSource: null });
    mockPrisma.employee.updateMany.mockResolvedValue({ count: 0 });
    const { status } = await person({ email: "neu@credo-gruppe.de" });
    expect(status).toBe(409);
    expect(mockPrisma.employee.updateMany.mock.calls[0][0].where).toEqual({ id: "p1", importSource: null });
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("Deaktivieren erlaubt und protokolliert", async () => {
    mockPrisma.employee.findUnique.mockResolvedValue({ ...PERSON_DOKUBIT, importSource: "MANUELL" });
    const { status } = await personLoeschen();
    expect(status).toBe(200);
    expect(mockPrisma.employee.updateMany).toHaveBeenCalledWith({
      where: { id: "p1", importSource: "MANUELL" },
      data: { isActive: false },
    });
    expect(auditEintraege()[0]).toMatchObject({
      action: PERSONALSTAMM_ACTIONS.PERSON_DEAKTIVIERT,
      details: { employeeId: "p1" },
    });
  });

  it("leerer Body schreibt nichts und protokolliert nichts", async () => {
    const { status } = await person({});
    expect(status).toBe(200);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });
});

describe("Person anlegen", () => {
  it("mit Quelle DOKUBIT → 400; das darf nur der Abgleich", async () => {
    const { status } = await aufrufen(personenRoute.POST, "POST", {}, {
      firstName: "A",
      lastName: "B",
      importSource: "DOKUBIT",
    });
    expect(status).toBe(400);
    expect(mockPrisma.employee.create).not.toHaveBeenCalled();
  });

  it("sonst 201, protokolliert ohne Namen und Adresse", async () => {
    const { status } = await aufrufen(personenRoute.POST, "POST", {}, {
      firstName: "Clara",
      lastName: "Muster",
      email: "clara.muster@credo-gruppe.de",
      importSource: "MANUELL",
    });
    expect(status).toBe(201);
    const [eintrag] = auditEintraege();
    expect(eintrag).toMatchObject({
      processType: "PERSONALSTAMM",
      action: PERSONALSTAMM_ACTIONS.PERSON_ANGELEGT,
      details: { employeeId: "neu", quelle: "MANUELL" },
    });
    expect(JSON.stringify(eintrag)).not.toMatch(/Clara|Muster|credo-gruppe/);
  });
});

describe("Vertrag aus DokuBit", () => {
  it.each([
    ["organizationId", ORG],
    ["mandantNumber", "742"],
    ["startDate", DATUM],
    ["endDate", DATUM],
    ["endDate", null],
    ["workingHoursWeek", 20],
    ["isActive", true],
  ])("%s → 409 ohne Schreiben", async (feld, wert) => {
    const { status, body } = await vertrag({ position: "Lehrkraft", [feld]: wert });
    expect(status).toBe(409);
    expect(body.felder).toEqual([feld]);
    expect(mockPrisma.employment.update).not.toHaveBeenCalled();
  });

  it("Position, Abteilung und Vertragsart bleiben frei, protokolliert nur mit Feldnamen", async () => {
    const { status } = await vertrag({ position: "Lehrkraft", department: "Grundschule", contractType: "BEFRISTET" });
    expect(status).toBe(200);
    expect(auditEintraege()[0]).toEqual({
      userId: "hr1",
      processType: "PERSONALSTAMM",
      action: PERSONALSTAMM_ACTIONS.ANSTELLUNG_GEAENDERT,
      details: { employeeId: "p1", employmentId: "v1", felder: ["position", "department", "contractType"] },
    });
  });

  it("Loeschen → 409", async () => {
    const { status, body } = await vertragLoeschen();
    expect(status).toBe(409);
    expect(body.error).toContain("Vertragsende");
    expect(mockPrisma.employment.delete).not.toHaveBeenCalled();
  });
});

describe("Bestandsvertrag", () => {
  beforeEach(() => mockPrisma.employment.findUnique.mockResolvedValue(VERTRAG_BESTAND));

  it("Ende frei; Schluessel und Person lassen sich auch hier nicht setzen", async () => {
    const { status } = await vertrag({ endDate: DATUM, abrechnungskreis: "AK", personalNumber: "2001", employeeId: "p2" });
    expect(status).toBe(200);
    expect(mockPrisma.employment.update.mock.calls[0][0].data).toEqual({ endDate: new Date(DATUM) });
    expect(auditEintraege()[0].details).toEqual({ employeeId: "p1", employmentId: "v1", felder: ["endDate"] });
  });

  it("Loeschen erlaubt und protokolliert", async () => {
    const { status } = await vertragLoeschen();
    expect(status).toBe(200);
    expect(mockPrisma.employment.delete).toHaveBeenCalledWith({ where: { id: "v1" } });
    expect(auditEintraege()[0]).toMatchObject({
      action: PERSONALSTAMM_ACTIONS.ANSTELLUNG_GELOESCHT,
      details: { employeeId: "p1", employmentId: "v1" },
    });
  });
});

describe("Anstellung anlegen", () => {
  it("201 und protokolliert", async () => {
    const { status } = await aufrufen(anstellungenRoute.POST, "POST", { id: "p1" }, { organizationId: ORG });
    expect(status).toBe(201);
    expect(auditEintraege()[0]).toMatchObject({
      processType: "PERSONALSTAMM",
      action: PERSONALSTAMM_ACTIONS.ANSTELLUNG_ANGELEGT,
      details: { employeeId: "p1", employmentId: "v9" },
    });
  });
});
