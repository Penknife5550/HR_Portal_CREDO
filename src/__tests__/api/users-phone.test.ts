/**
 * Tests fuer das Telefon-Feld der Benutzer-API (/api/users, /api/users/[id]).
 *
 * Schwerpunkt ist die beauftragte Loesch-Semantik: Ein GELEERTES Feld muss die
 * Nummer entfernen, ein FEHLENDES Feld darf sie unangetastet lassen. Beides
 * laesst sich weder durch tsc noch durch ESLint absichern.
 */

// Mocks muessen VOR dem Import definiert werden
const mockGetSession = jest.fn();
const mockPrisma = {
  user: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
};

jest.mock("@/lib/auth", () => ({ getSession: mockGetSession }));
jest.mock("@/lib/db", () => ({ prisma: mockPrisma }));
jest.mock("bcryptjs", () => ({ hash: jest.fn().mockResolvedValue("gehasht") }));

import { GET, POST } from "@/app/api/users/route";
import { PATCH } from "@/app/api/users/[id]/route";
import { NextRequest } from "next/server";

const ADMIN = {
  userId: "admin1",
  email: "admin@credo-gruppe.de",
  role: "SUPER_ADMIN",
  firstName: "A",
  lastName: "B",
};

function jsonRequest(body: Record<string, unknown>, url = "http://localhost:3000/api/users") {
  return new NextRequest(url, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function patchParams(id = "u-ziel") {
  return { params: Promise.resolve({ id }) };
}

/** Die von prisma.user.update tatsaechlich uebergebenen Daten. */
function updateDaten(): Record<string, unknown> {
  return mockPrisma.user.update.mock.calls[0][0].data;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetSession.mockResolvedValue(ADMIN);
  mockPrisma.user.findUnique.mockResolvedValue({
    id: "u-ziel",
    email: "alt@credo-gruppe.de",
    phone: "0571 / 111",
    role: "HR_SACHBEARBEITER",
  });
  mockPrisma.user.update.mockResolvedValue({ id: "u-ziel" });
  mockPrisma.user.create.mockResolvedValue({ id: "neu" });
});

describe("PATCH /api/users/:id — Loesch-Semantik", () => {
  it("leerer String loescht die Nummer", async () => {
    const res = await PATCH(jsonRequest({ phone: "" }), patchParams());
    expect(res.status).toBe(200);
    expect(updateDaten().phone).toBeNull();
  });

  it("nur Leerzeichen loeschen die Nummer ebenfalls", async () => {
    await PATCH(jsonRequest({ phone: "   " }), patchParams());
    expect(updateDaten().phone).toBeNull();
  });

  it("null loescht die Nummer", async () => {
    await PATCH(jsonRequest({ phone: null }), patchParams());
    expect(updateDaten().phone).toBeNull();
  });

  it("fehlendes Feld laesst die Nummer unangetastet", async () => {
    // Wichtig bei Teil-Updates (z.B. Reaktivieren): phone darf nicht
    // versehentlich geloescht werden, nur weil es nicht mitgesendet wurde.
    await PATCH(jsonRequest({ isActive: true }), patchParams());
    expect("phone" in updateDaten()).toBe(false);
  });

  it("speichert die Nummer getrimmt", async () => {
    await PATCH(jsonRequest({ phone: "  0571 / 8879-120  " }), patchParams());
    expect(updateDaten().phone).toBe("0571 / 8879-120");
  });

  it("weist eine zu lange Nummer mit 400 ab", async () => {
    const res = await PATCH(jsonRequest({ phone: "1".repeat(51) }), patchParams());
    expect(res.status).toBe(400);
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it("weist einen Nicht-String mit 400 ab", async () => {
    const res = await PATCH(jsonRequest({ phone: 12345 }), patchParams());
    expect(res.status).toBe(400);
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });
});

describe("POST /api/users — Anlage", () => {
  const basis = {
    email: "neu@credo-gruppe.de",
    firstName: "Neu",
    lastName: "Nutzer",
    password: "EinSicheres123",
    role: "HR_SACHBEARBEITER",
  };

  beforeEach(() => {
    // Kein bestehender Nutzer mit dieser E-Mail
    mockPrisma.user.findUnique.mockResolvedValue(null);
  });

  it("uebernimmt die Nummer getrimmt", async () => {
    const res = await POST(jsonRequest({ ...basis, phone: "  0571 / 1  " }));
    expect(res.status).toBe(201);
    expect(mockPrisma.user.create.mock.calls[0][0].data.phone).toBe("0571 / 1");
  });

  it("speichert ohne Angabe null statt eines leeren Strings", async () => {
    await POST(jsonRequest(basis));
    expect(mockPrisma.user.create.mock.calls[0][0].data.phone).toBeNull();
  });

  it("speichert einen leeren String als null", async () => {
    await POST(jsonRequest({ ...basis, phone: "" }));
    expect(mockPrisma.user.create.mock.calls[0][0].data.phone).toBeNull();
  });

  it("weist eine zu lange Nummer mit 400 ab", async () => {
    const res = await POST(jsonRequest({ ...basis, phone: "1".repeat(51) }));
    expect(res.status).toBe(400);
    expect(mockPrisma.user.create).not.toHaveBeenCalled();
  });

  it("weist einen Nicht-String mit 400 ab", async () => {
    const res = await POST(jsonRequest({ ...basis, phone: 12345 }));
    expect(res.status).toBe(400);
    expect(mockPrisma.user.create).not.toHaveBeenCalled();
  });
});

describe("GET /api/users", () => {
  it("liefert das Telefon-Feld mit aus", async () => {
    mockPrisma.user.findMany.mockResolvedValue([]);
    await GET();
    expect(mockPrisma.user.findMany.mock.calls[0][0].select.phone).toBe(true);
  });
});
