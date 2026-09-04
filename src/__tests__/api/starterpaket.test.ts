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
  documentTemplate: { findMany: jest.fn(), count: jest.fn() },
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
const VORLAGE = "55555555-5555-4555-8555-555555555555";
const VORLAGE_SENSIBEL = "66666666-6666-4666-8666-666666666666";

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

function getReq(modul?: string): NextRequest {
  const basis = `http://localhost:3000/api/organizations/${ORG_ID}/starterpaket`;
  return new NextRequest(modul ? `${basis}?modul=${modul}` : basis);
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
  mockPrisma.starterpaketDokument.findMany.mockResolvedValue([]);
  mockPrisma.starterpaketAuswahl.findMany.mockResolvedValue([]);
  mockPrisma.documentTemplate.findMany.mockResolvedValue([]);
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

    const res = await PUT(putReq({ modul: "ONBOARDING", positionen: [{ art: "PDF", id: GLOBAL_DOC }, { art: "PDF", id: MANDANT_DOC }] }), ctx());
    expect(res.status).toBe(200);
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    // Beide Schreibvorgaenge sind auf ONBOARDING eingegrenzt. Ohne das raeumt
    // das Speichern des Onboarding-Pakets ab Phase 2 die Pakete der anderen
    // Module mit ab — deshalb steht das Modul hier ausdruecklich in der
    // Erwartung und nicht nur im Schema-Default.
    expect(mockPrisma.starterpaketAuswahl.deleteMany).toHaveBeenCalledWith({
      where: { organizationId: ORG_ID, modul: "ONBOARDING" },
    });
    expect(mockPrisma.starterpaketAuswahl.createMany).toHaveBeenCalledWith({
      data: [
        { organizationId: ORG_ID, modul: "ONBOARDING", dokumentId: GLOBAL_DOC, templateId: null, orderIndex: 0 },
        { organizationId: ORG_ID, modul: "ONBOARDING", dokumentId: MANDANT_DOC, templateId: null, orderIndex: 1 },
      ],
    });
    expect(mockPrisma.auditLog.create).toHaveBeenCalled();
  });

  it("weist ein fuer den Mandanten nicht verfuegbares Dokument ab (400)", async () => {
    // 2 IDs angefragt, aber nur 1 ist verfuegbar (das fremde wird nicht gezaehlt)
    mockPrisma.starterpaketDokument.count.mockResolvedValue(1);

    const res = await PUT(putReq({ modul: "ONBOARDING", positionen: [{ art: "PDF", id: GLOBAL_DOC }, { art: "PDF", id: FREMD_DOC }] }), ctx());
    expect(res.status).toBe(400);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("leere Auswahl loescht nur (kein createMany) — und nur im eigenen Modul", async () => {
    const res = await PUT(putReq({ modul: "ONBOARDING", positionen: [] }), ctx());
    expect(res.status).toBe(200);
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mockPrisma.starterpaketAuswahl.deleteMany).toHaveBeenCalledWith({
      where: { organizationId: ORG_ID, modul: "ONBOARDING" },
    });
    expect(mockPrisma.starterpaketAuswahl.createMany).not.toHaveBeenCalled();
  });

  it("liefert 401 ohne Session", async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await PUT(putReq({ modul: "ONBOARDING", positionen: [] }), ctx());
    expect(res.status).toBe(401);
  });

  it("liefert 403 fuer Nicht-Admin-Rolle", async () => {
    mockGetSession.mockResolvedValue({ ...adminSession, role: "HR_SACHBEARBEITER" });
    const res = await PUT(putReq({ modul: "ONBOARDING", positionen: [] }), ctx());
    expect(res.status).toBe(403);
  });
});

// =============================================
// Baustein 3: Vorlagen im Standardpaket, je Modul
// =============================================

const VORLAGE_ZEILE = {
  id: VORLAGE,
  name: "Willkommensschreiben",
  description: null,
  modul: "ONBOARDING",
  organizationId: null,
  fileSize: 1000,
  platzhalter: ["vorname", "nachname"],
  isSystem: false,
};
const VORLAGE_SENSIBEL_ZEILE = {
  ...VORLAGE_ZEILE,
  id: VORLAGE_SENSIBEL,
  name: "Bestaetigung der Abrechnungsdaten",
  platzhalter: ["vorname", "iban", "steuer_id"],
};

describe("GET — Vorlagen im Paket", () => {
  it("kennzeichnet Vorlagen mit ihren sensiblen Feldern", async () => {
    mockPrisma.documentTemplate.findMany.mockResolvedValue([
      VORLAGE_ZEILE,
      VORLAGE_SENSIBEL_ZEILE,
    ]);

    const json = await (await GET(getReq(), ctx())).json();
    const harmlos = json.data.vorlagen.find((v: { id: string }) => v.id === VORLAGE);
    const sensibel = json.data.vorlagen.find((v: { id: string }) => v.id === VORLAGE_SENSIBEL);

    expect(harmlos.sensibleFelder).toEqual([]);
    expect(sensibel.sensibleFelder.map((f: { key: string }) => f.key)).toEqual([
      "iban",
      "steuer_id",
    ]);
  });

  it("fragt nur Vorlagen des Moduls und ALLGEMEIN ab, aktiv und im Mandanten-Scope", async () => {
    await GET(getReq("OFFBOARDING"), ctx());
    expect(mockPrisma.documentTemplate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          isActive: true,
          modul: { in: ["OFFBOARDING", "ALLGEMEIN"] },
          OR: [{ organizationId: null }, { organizationId: ORG_ID }],
        },
      }),
    );
  });

  it("liest die Auswahl des angefragten Moduls", async () => {
    await GET(getReq("VERBEAMTUNG"), ctx());
    expect(mockPrisma.starterpaketAuswahl.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: ORG_ID, modul: "VERBEAMTUNG" } }),
    );
  });

  it("faellt bei unbekanntem oder ausgeschlossenem Modul auf ONBOARDING zurueck", async () => {
    for (const modul of ["PHANTASIE", "BEM"]) {
      const json = await (await GET(getReq(modul), ctx())).json();
      expect(json.data.modul).toBe("ONBOARDING");
    }
  });

  it("liefert die gemischte Liste in Paketreihenfolge", async () => {
    mockPrisma.starterpaketDokument.findMany.mockResolvedValue([
      {
        id: GLOBAL_DOC,
        name: "Leitbild",
        beschreibung: null,
        organizationId: null,
        fileSize: 20,
        isActive: true,
      },
    ]);
    mockPrisma.documentTemplate.findMany.mockResolvedValue([VORLAGE_ZEILE]);
    mockPrisma.starterpaketAuswahl.findMany.mockResolvedValue([
      { dokumentId: null, templateId: VORLAGE, orderIndex: 0 },
      { dokumentId: GLOBAL_DOC, templateId: null, orderIndex: 1 },
    ]);

    const json = await (await GET(getReq(), ctx())).json();
    expect(json.data.paket).toEqual([
      {
        art: "VORLAGE",
        id: VORLAGE,
        name: "Willkommensschreiben",
        orderIndex: 0,
        sensibleFelder: [],
      },
      { art: "PDF", id: GLOBAL_DOC, name: "Leitbild", orderIndex: 1 },
    ]);
  });
});

describe("PUT — gemischte Positionen", () => {
  it("speichert PDFs und Vorlagen in der uebergebenen Reihenfolge", async () => {
    mockPrisma.starterpaketDokument.count.mockResolvedValue(1);
    mockPrisma.documentTemplate.count.mockResolvedValue(1);

    const res = await PUT(
      putReq({
        modul: "ONBOARDING",
        positionen: [
          { art: "VORLAGE", id: VORLAGE },
          { art: "PDF", id: GLOBAL_DOC },
        ],
      }),
      ctx(),
    );
    expect(res.status).toBe(200);
    expect(mockPrisma.starterpaketAuswahl.createMany).toHaveBeenCalledWith({
      data: [
        {
          organizationId: ORG_ID,
          modul: "ONBOARDING",
          dokumentId: null,
          templateId: VORLAGE,
          orderIndex: 0,
        },
        {
          organizationId: ORG_ID,
          modul: "ONBOARDING",
          dokumentId: GLOBAL_DOC,
          templateId: null,
          orderIndex: 1,
        },
      ],
    });
  });

  it("leert nur das uebergebene Modul", async () => {
    mockPrisma.documentTemplate.count.mockResolvedValue(1);
    await PUT(
      putReq({ modul: "OFFBOARDING", positionen: [{ art: "VORLAGE", id: VORLAGE }] }),
      ctx(),
    );
    expect(mockPrisma.starterpaketAuswahl.deleteMany).toHaveBeenCalledWith({
      where: { organizationId: ORG_ID, modul: "OFFBOARDING" },
    });
  });

  it("weist eine Vorlage ab, die fuer Mandant oder Modul nicht verfuegbar ist (400)", async () => {
    // Zwei angefragt, nur eine erfuellt Modul, Geltung und Aktivitaet.
    mockPrisma.documentTemplate.count.mockResolvedValue(1);

    const res = await PUT(
      putReq({
        modul: "ONBOARDING",
        positionen: [
          { art: "VORLAGE", id: VORLAGE },
          { art: "VORLAGE", id: VORLAGE_SENSIBEL },
        ],
      }),
      ctx(),
    );
    expect(res.status).toBe(400);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("prueft Vorlagen gegen Aktivitaet, Modul und Mandant", async () => {
    mockPrisma.documentTemplate.count.mockResolvedValue(1);
    await PUT(
      putReq({ modul: "ONBOARDING", positionen: [{ art: "VORLAGE", id: VORLAGE }] }),
      ctx(),
    );
    expect(mockPrisma.documentTemplate.count).toHaveBeenCalledWith({
      where: {
        id: { in: [VORLAGE] },
        isActive: true,
        modul: { in: ["ONBOARDING", "ALLGEMEIN"] },
        OR: [{ organizationId: null }, { organizationId: ORG_ID }],
      },
    });
  });

  it("laesst sensible Vorlagen zu — die Bestaetigung sitzt beim Versand, nicht hier", async () => {
    mockPrisma.documentTemplate.count.mockResolvedValue(1);
    const res = await PUT(
      putReq({ modul: "ONBOARDING", positionen: [{ art: "VORLAGE", id: VORLAGE_SENSIBEL }] }),
      ctx(),
    );
    expect(res.status).toBe(200);
  });

  it("weist die abgeloeste Form { dokumentIds } ab (400)", async () => {
    // Seit Baustein 4 schickt die Oberflaeche { modul, positionen }. Die alte
    // Form ist kein gueltiger Koerper mehr und darf nicht stillschweigend als
    // leeres Paket durchgehen — das wuerde das Standardpaket loeschen.
    mockPrisma.starterpaketDokument.count.mockResolvedValue(1);
    const res = await PUT(putReq({ dokumentIds: [GLOBAL_DOC] }), ctx());
    expect(res.status).toBe(400);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("haelt Modul und Aufteilung im Pruefprotokoll fest", async () => {
    mockPrisma.starterpaketDokument.count.mockResolvedValue(1);
    mockPrisma.documentTemplate.count.mockResolvedValue(1);
    await PUT(
      putReq({
        modul: "ONBOARDING",
        positionen: [
          { art: "PDF", id: GLOBAL_DOC },
          { art: "VORLAGE", id: VORLAGE },
        ],
      }),
      ctx(),
    );
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          details: expect.objectContaining({
            modul: "ONBOARDING",
            anzahl: 2,
            anzahlPdf: 1,
            anzahlVorlagen: 1,
          }),
        }),
      }),
    );
  });
});
