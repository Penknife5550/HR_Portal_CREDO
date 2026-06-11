/**
 * Tests: Reporting-API (/api/reports/*) + API-Key-Auth (lib/api-key.ts)
 */

const mockPrisma = {
  apiKey: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  offboardingProcess: {
    findMany: jest.fn(),
  },
};
const mockGetSession = jest.fn();

jest.mock("@/lib/db", () => ({ prisma: mockPrisma }));
jest.mock("@/lib/auth", () => ({ getSession: mockGetSession }));

import { GET } from "@/app/api/reports/offboardings/route";
import { generateApiKey } from "@/lib/api-key";
import { hashToken } from "@/lib/token-hash";
import { NextRequest } from "next/server";

function createRequest(headers: Record<string, string> = {}, query = ""): NextRequest {
  return new NextRequest(`http://localhost:3000/api/reports/offboardings${query}`, {
    headers,
  });
}

const validKeyRecord = {
  id: "key-1",
  name: "Test-Key",
  keyHash: "hash",
  prefix: "crk_abc",
  scopes: ["reports:read"],
  isActive: true,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetSession.mockResolvedValue(null);
  mockPrisma.apiKey.update.mockResolvedValue({});
  mockPrisma.offboardingProcess.findMany.mockResolvedValue([
    {
      displayId: "OFF-2026-GYM-001",
      status: "NOTICE_PERIOD",
      exitType: "KUENDIGUNG_ARBEITNEHMER",
      lastWorkingDay: new Date("2026-08-31"),
      employeeFirstName: "Max",
      employeeLastName: "Mustermann",
      employeeEmail: "max@example.org",
      organization: { name: "FES Minden", shortName: "FES", mandantNumber: "01" },
    },
  ]);
});

describe("GET /api/reports/offboardings", () => {
  it("liefert 401 ohne API-Key und ohne Session", async () => {
    const res = await GET(createRequest());
    expect(res.status).toBe(401);
  });

  it("liefert 401 bei deaktiviertem API-Key", async () => {
    mockPrisma.apiKey.findUnique.mockResolvedValue({ ...validKeyRecord, isActive: false });
    const res = await GET(createRequest({ "x-api-key": "crk_test123" }));
    expect(res.status).toBe(401);
  });

  it("liefert 401 bei API-Key ohne reports:read-Scope", async () => {
    mockPrisma.apiKey.findUnique.mockResolvedValue({ ...validKeyRecord, scopes: ["other"] });
    const res = await GET(createRequest({ "x-api-key": "crk_test123" }));
    expect(res.status).toBe(401);
  });

  it("liefert 200 mit gueltigem Bearer-Key und filtert default auf offene Vorgaenge", async () => {
    mockPrisma.apiKey.findUnique.mockResolvedValue(validKeyRecord);
    const res = await GET(createRequest({ authorization: "Bearer crk_test123" }));
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.data).toHaveLength(1);
    expect(json.meta.count).toBe(1);

    // Default-Filter: nicht abgeschlossene Kuendigungen
    expect(mockPrisma.offboardingProcess.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { notIn: ["COMPLETED", "CANCELLED"] },
        }),
      })
    );
    // lastUsedAt wurde aktualisiert
    expect(mockPrisma.apiKey.update).toHaveBeenCalled();
  });

  it("liefert 200 fuer eingeloggte Admin-Session ohne API-Key", async () => {
    mockGetSession.mockResolvedValue({ userId: "u1", role: "HR_LEITUNG" });
    const res = await GET(createRequest());
    expect(res.status).toBe(200);
  });

  it("liefert 403 fuer Session-Rollen ohne Reporting-Berechtigung (z.B. VIEWER)", async () => {
    mockGetSession.mockResolvedValue({ userId: "u2", role: "VIEWER" });
    const res = await GET(createRequest());
    expect(res.status).toBe(403);
  });

  it("liefert 400 bei ungueltigem Status oder Datum", async () => {
    mockPrisma.apiKey.findUnique.mockResolvedValue(validKeyRecord);
    const resStatus = await GET(createRequest({ "x-api-key": "crk_test123" }, "?status=FOO"));
    expect(resStatus.status).toBe(400);
    const resDate = await GET(createRequest({ "x-api-key": "crk_test123" }, "?from=31.12.2026"));
    expect(resDate.status).toBe(400);
  });

  it("uebernimmt Zeitraum- und Status-Filter aus der Query", async () => {
    mockPrisma.apiKey.findUnique.mockResolvedValue(validKeyRecord);
    await GET(
      createRequest(
        { "x-api-key": "crk_test123" },
        "?status=COMPLETED&from=2026-01-01&to=2026-12-31"
      )
    );
    expect(mockPrisma.offboardingProcess.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: "COMPLETED",
          lastWorkingDay: {
            gte: new Date("2026-01-01"),
            lte: new Date("2026-12-31"),
          },
        }),
      })
    );
  });

  it("Antwort enthaelt keine sensiblen Felder", async () => {
    mockPrisma.apiKey.findUnique.mockResolvedValue(validKeyRecord);
    const res = await GET(createRequest({ "x-api-key": "crk_test123" }));
    const json = await res.json();
    const serialized = JSON.stringify(json);
    for (const forbidden of ["iban", "steuerId", "sozialversicherung", "keyHash"]) {
      expect(serialized.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });
});

describe("generateApiKey", () => {
  it("erzeugt Keys mit crk_-Prefix und konsistentem Hash", () => {
    const { plaintext, keyHash, prefix } = generateApiKey();
    expect(plaintext.startsWith("crk_")).toBe(true);
    expect(plaintext.length).toBeGreaterThan(40);
    expect(keyHash).toBe(hashToken(plaintext));
    expect(plaintext.startsWith(prefix)).toBe(true);
  });

  it("erzeugt unterschiedliche Keys", () => {
    expect(generateApiKey().plaintext).not.toBe(generateApiKey().plaintext);
  });
});
