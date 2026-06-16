/**
 * Tests: Starterpaket-Markierung pro Mandant
 * (/api/organizations/[id]/starterpaket — GET + PUT)
 *
 * Schwerpunkt: Org-Scope (kein fremdes Mandanten-PDF markierbar), atomares Setzen
 * der Auswahl, Auth-Gating (nur ADMIN_ROLES).
 */

const mockPrisma = {
  organization: { findUnique: jest.fn() },
  starterpaketDokument: { findMany: jest.fn(), count: jest.fn() },
  starterpaketAuswahl: {
    findMany: jest.fn(),
    deleteMany: jest.fn(),
    createMany: jest.fn(),
  },
  auditLog: { create: jest.fn() },
  $transaction: jest.fn(),
};
const mockGetSession = jest.fn();

jest.mock("@/lib/db", () => ({ prisma: mockPrisma }));
jest.mock("@/lib/auth", () => ({ getSession: mockGetSession }));

import { GET, PUT } from "@/app/api/organizations/[id]/starterpaket/route";
import { NextRequest } from "next/server";

const ORG_ID = "11111111-1111-1111-1111-111111111111";
const GLOBAL_DOC = "22222222-2222-2222-2222-222222222222";
const MANDANT_DOC = "33333333-3333-3333-3333-333333333333";
const FREMD_DOC = "44444444-4444-4444-4444-444444444444";

function ctx(id: string = ORG_ID) {
  return { params: Promise.resolve({ id }) };
}

function putReq(body: unknown): NextRequest {
  return new NextRequest(`http://localhost:3000/api/organizations/${ORG_ID}/starterpaket`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function getReq(): NextRequest {
  return new NextRequest(`http://localhost:3000/api/organizations/${ORG_ID}/starterpaket`);
}

const adminSession = {
  userId: "u1",
  email: "admin@fes.de",
  role: "HR_LEITUNG",
  firstName: "A",
  lastName: "B",
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetSession.mockResolvedValue(adminSession);
  mockPrisma.organization.findUnique.mockResolvedValue({
    id: ORG_ID,
    name: "Gymnasium",
    mandantNumber: "712",
  });
  mockPrisma.auditLog.create.mockResolvedValue({});
  mockPrisma.$transaction.mockResolvedValue([]);
  mockPrisma.starterpaketAuswahl.deleteMany.mockResolvedValue({ count: 0 });
  mockPrisma.starterpaketAuswahl.createMany.mockResolvedValue({ count: 0 });
});

describe("GET /api/organizations/[id]/starterpaket", () => {
  it("listet verfuegbare Dokumente mit Markierung, markierte zuerst", async () => {
    mockPrisma.starterpaketDokument.findMany.mockResolvedValue([
      { id: MANDANT_DOC, name: "Hausordnung", beschreibung: null, organizationId: ORG_ID, fileSize: 10, isActive: true },
      { id: GLOBAL_DOC, name: "Leitbild", beschreibung: null, organizationId: null, fileSize: 20, isActive: true },
    ]);
    mockPrisma.starterpaketAuswahl.findMany.mockResolvedValue([
      { dokumentId: GLOBAL_DOC, orderIndex: 0 },
    ]);

    const res = await GET(getReq(), ctx());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.organization.name).toBe("Gymnasium");
    expect(json.data.documents).toHaveLength(2);
    // markiertes (Leitbild, global) zuerst
    expect(json.data.documents[0].id).toBe(GLOBAL_DOC);
    expect(json.data.documents[0].marked).toBe(true);
    expect(json.data.documents[0].scope).toBe("GLOBAL");
    expect(json.data.documents[1].marked).toBe(false);
    expect(json.data.documents[1].scope).toBe("MANDANT");
  });

  it("liefert 404 bei unbekanntem Mandanten", async () => {
    mockPrisma.organization.findUnique.mockResolvedValue(null);
    const res = await GET(getReq(), ctx());
    expect(res.status).toBe(404);
  });
});

describe("PUT /api/organizations/[id]/starterpaket", () => {
  it("setzt die Auswahl atomar (deleteMany + createMany im $transaction)", async () => {
    mockPrisma.starterpaketDokument.count.mockResolvedValue(2);

    const res = await PUT(putReq({ dokumentIds: [GLOBAL_DOC, MANDANT_DOC] }), ctx());
    expect(res.status).toBe(200);
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mockPrisma.starterpaketAuswahl.deleteMany).toHaveBeenCalledWith({
      where: { organizationId: ORG_ID },
    });
    expect(mockPrisma.starterpaketAuswahl.createMany).toHaveBeenCalledWith({
      data: [
        { organizationId: ORG_ID, dokumentId: GLOBAL_DOC, orderIndex: 0 },
        { organizationId: ORG_ID, dokumentId: MANDANT_DOC, orderIndex: 1 },
      ],
    });
    expect(mockPrisma.auditLog.create).toHaveBeenCalled();
  });

  it("weist ein fuer den Mandanten nicht verfuegbares Dokument ab (400)", async () => {
    // 2 IDs angefragt, aber nur 1 ist verfuegbar (das fremde wird nicht gezaehlt)
    mockPrisma.starterpaketDokument.count.mockResolvedValue(1);

    const res = await PUT(putReq({ dokumentIds: [GLOBAL_DOC, FREMD_DOC] }), ctx());
    expect(res.status).toBe(400);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("leere Auswahl loescht nur (kein createMany)", async () => {
    const res = await PUT(putReq({ dokumentIds: [] }), ctx());
    expect(res.status).toBe(200);
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mockPrisma.starterpaketAuswahl.createMany).not.toHaveBeenCalled();
  });

  it("liefert 401 ohne Session", async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await PUT(putReq({ dokumentIds: [] }), ctx());
    expect(res.status).toBe(401);
  });

  it("liefert 403 fuer Nicht-Admin-Rolle", async () => {
    mockGetSession.mockResolvedValue({ ...adminSession, role: "HR_SACHBEARBEITER" });
    const res = await PUT(putReq({ dokumentIds: [] }), ctx());
    expect(res.status).toBe(403);
  });
});
