/**
 * Tests: Vorlage bearbeiten (PATCH /api/brief-vorlagen/[id]) — das Modul einer
 * System-Vorlage ist fest (Ausstattung & Zugaenge A4, G19, Review A4d).
 *
 * WARUM
 *
 * Der Seed-Check findet System-Vorlagen ueber `{ isSystem, modul,
 * originalName }`, der Loeschlauf der Ausstattungsprotokolle ihre erzeugten
 * Dokumente ueber `PROTOKOLL_SYSTEM_VORLAGEN` samt Modul. Stellte ein Admin das
 * „Rückgabeprotokoll Ausstattung“ von OFFBOARDING auf ALLGEMEIN um, legte der
 * naechste Start eine zweite, eingeschaltete Zeile an, und erzeugte
 * Protokolle fielen erst nach 12 Monaten statt mit der letzten Ausgabe.
 *
 * WORAUF DIE ZUSICHERUNGEN ZIELEN
 *
 *  1. Anderes Modul an einer System-Vorlage: 409 mit dem Text aus
 *     `SYSTEM_VORLAGE_MODUL_FEST`, VOR jedem Schreiben (kein update, kein
 *     AuditLog).
 *  2. Dasselbe Modul noch einmal: keine Aenderung — gespeichert wird der Rest,
 *     `modul` steht weder im Update noch im Protokoll.
 *  3. Name, Beschreibung, Aktiv-Schalter und Mandant bleiben an einer
 *     System-Vorlage pflegbar.
 *  4. Eine gewoehnliche Vorlage wechselt ihr Modul wie bisher.
 */

const mockGetSession = jest.fn();

const mockPrisma = {
  documentTemplate: { findUnique: jest.fn(), update: jest.fn() },
  organization: { findUnique: jest.fn() },
  auditLog: { create: jest.fn() },
  userOrgAssignment: { findUnique: jest.fn() },
};

jest.mock("@/lib/auth", () => ({ getSession: mockGetSession }));
jest.mock("@/lib/db", () => ({ prisma: mockPrisma }));

import { NextRequest } from "next/server";
import { PATCH } from "@/app/api/brief-vorlagen/[id]/route";
import { SYSTEM_VORLAGE_MODUL_FEST } from "@/lib/brief-vorlagen-filter";

const ADMIN = { userId: "admin-1", email: "admin@credo-gruppe.de", role: "HR_LEITUNG", firstName: "A", lastName: "D" };
const VORLAGE_ID = "8d0f2c1e-6a3b-4c5d-9e7f-0a1b2c3d4e5f";

function bearbeiten(body: Record<string, unknown>) {
  return PATCH(
    new NextRequest(`http://localhost/api/brief-vorlagen/${VORLAGE_ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: VORLAGE_ID }) },
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetSession.mockResolvedValue(ADMIN);
  mockPrisma.documentTemplate.findUnique.mockResolvedValue({ id: VORLAGE_ID, isSystem: true, modul: "OFFBOARDING" });
  mockPrisma.documentTemplate.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: VORLAGE_ID,
    ...data,
  }));
  mockPrisma.auditLog.create.mockResolvedValue({});
});

describe("System-Vorlage: Modul fest", () => {
  it("anderes Modul: 409 vor jedem Schreiben", async () => {
    const res = await bearbeiten({ name: "Rückgabeprotokoll", modul: "ALLGEMEIN" });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe(SYSTEM_VORLAGE_MODUL_FEST);
    expect(mockPrisma.documentTemplate.update).not.toHaveBeenCalled();
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("liest dafuer isSystem und Modul der gespeicherten Zeile", async () => {
    await bearbeiten({ modul: "ALLGEMEIN" });
    expect(mockPrisma.documentTemplate.findUnique).toHaveBeenCalledWith({
      where: { id: VORLAGE_ID },
      select: { id: true, isSystem: true, modul: true },
    });
  });

  it("dasselbe Modul ist keine Aenderung: der Rest wird gespeichert, modul weder im Update noch im Protokoll", async () => {
    const res = await bearbeiten({ name: "Rückgabeprotokoll (Schulen)", modul: "OFFBOARDING" });
    expect(res.status).toBe(200);
    const data = mockPrisma.documentTemplate.update.mock.calls[0][0].data;
    expect(data).toEqual({ name: "Rückgabeprotokoll (Schulen)" });
    expect(mockPrisma.auditLog.create.mock.calls[0][0].data.details.changes).toEqual(["name"]);
  });

  it("Name, Beschreibung, Aktiv-Schalter und Mandant bleiben pflegbar", async () => {
    const res = await bearbeiten({ name: "Neu", description: "Text", isActive: false, organizationId: null });
    expect(res.status).toBe(200);
    expect(mockPrisma.documentTemplate.update.mock.calls[0][0].data).toEqual({
      name: "Neu",
      description: "Text",
      isActive: false,
      organizationId: null,
    });
  });
});

describe("gewoehnliche Vorlage", () => {
  it("wechselt ihr Modul wie bisher", async () => {
    mockPrisma.documentTemplate.findUnique.mockResolvedValueOnce({ id: VORLAGE_ID, isSystem: false, modul: "ONBOARDING" });
    const res = await bearbeiten({ modul: "ALLGEMEIN" });
    expect(res.status).toBe(200);
    expect(mockPrisma.documentTemplate.update.mock.calls[0][0].data).toEqual({ modul: "ALLGEMEIN" });
  });
});
