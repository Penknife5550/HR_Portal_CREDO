/**
 * Tests: Die Person sieht das Uebergabeprotokoll nicht
 * (GET/PATCH/DELETE /api/fragebogen/[token]/documents) — Ausstattung &
 * Zugaenge, Stufe 2, Feinplan A4, S34, G19.
 *
 * Seit A4 legt HR am Onboarding-Vorgang auch Dokumente ab, die die Person nie
 * hochgeladen hat: das unterschriebene Uebergabeprotokoll (`UEBERGABEPROTOKOLL`,
 * mit Name und Kennungen der ausgegebenen Stuecke). Die oeffentliche
 * Fragebogen-Route listete bis dahin JEDES `Document` des Vorgangs und loeschte
 * jedes samt Datei, solange der Fragebogen offen ist — der Dienstbeginn (und
 * damit die Uebergabe) liegt oft davor.
 *
 * Zugesichert:
 *  1. GET listet nur Dokumente mit Typ aus `SELECTABLE_DOCUMENT_TYPES` — alle
 *     waehlbaren unveraendert, das Protokoll nicht.
 *  2. DELETE auf das Protokoll: dieselbe 404 wie fuer ein fremdes Dokument;
 *     Datei und Zeile bleiben.
 *  3. PATCH auf das Protokoll: dieselbe 404; nichts geschrieben, nichts
 *     protokolliert.
 *  4. Dokumente der waehlbaren Typen lassen sich wie bisher loeschen und mit
 *     einer Frist versehen.
 *
 * Die Datenbank ist eine kleine Attrappe, die `where` wirklich auswertet (id,
 * onboardingId, `type: { in }`) — so prueft der Test das Ergebnis der Abfrage,
 * nicht nur ihre Form.
 */

type Dok = { id: string; onboardingId: string; type: string; fileName: string; filePath: string; gueltigBis: Date | null };

let mockDokumente: Dok[] = [];

type Where = { id?: string; onboardingId?: string; type?: { in?: string[] } };
function mockPasst(d: Dok, where: Where): boolean {
  if (where.id !== undefined && d.id !== where.id) return false;
  if (where.onboardingId !== undefined && d.onboardingId !== where.onboardingId) return false;
  if (where.type?.in && !where.type.in.includes(d.type)) return false;
  return true;
}

const mockPrisma = {
  document: {
    findMany: jest.fn(async ({ where }: { where: Where }) => mockDokumente.filter((d) => mockPasst(d, where))),
    findFirst: jest.fn(async ({ where }: { where: Where }) => mockDokumente.find((d) => mockPasst(d, where)) ?? null),
    delete: jest.fn(async ({ where }: { where: { id: string } }) => {
      const dok = mockDokumente.find((d) => d.id === where.id);
      mockDokumente = mockDokumente.filter((d) => d.id !== where.id);
      return dok;
    }),
    update: jest.fn(async ({ where, data }: { where: { id: string }; data: Partial<Dok> }) => {
      const dok = mockDokumente.find((d) => d.id === where.id)!;
      Object.assign(dok, data);
      return { id: dok.id, type: dok.type, gueltigBis: dok.gueltigBis };
    }),
    updateMany: jest.fn(async () => ({ count: 0 })),
  },
  auditLog: { create: jest.fn(async () => ({})) },
  // Interaktive Transaktion: `tx` ist dieselbe Attrappe (gesetzt in beforeEach).
  $transaction: jest.fn(),
};
const mockValidateMagicToken = jest.fn();
const mockUnlink = jest.fn();

jest.mock("@/lib/db", () => ({ prisma: mockPrisma }));
jest.mock("@/lib/auth", () => ({ validateMagicToken: mockValidateMagicToken }));
jest.mock("@/lib/rate-limit", () => ({
  tokenRateLimiter: { check: () => ({ allowed: true }) },
  getClientIp: () => "127.0.0.1",
  getClientIpOrNull: () => "127.0.0.1",
}));
jest.mock("fs/promises", () => ({
  writeFile: jest.fn().mockResolvedValue(undefined),
  mkdir: jest.fn().mockResolvedValue(undefined),
  unlink: (...a: unknown[]) => mockUnlink(...a),
}));

import { DELETE, GET, PATCH } from "@/app/api/fragebogen/[token]/documents/route";
import { SELECTABLE_DOCUMENT_TYPES } from "@/lib/required-documents";
import { NextRequest } from "next/server";

const ONB = "onb-1";
/** Sicher in der Zukunft und innerhalb jeder Befristung, unabhaengig vom Tag des Laufs. */
const ZUKUNFT = `${new Date().getUTCFullYear() + 2}-03-01`;

function dok(id: string, type: string, onboardingId = ONB): Dok {
  return { id, onboardingId, type, fileName: `${id}.pdf`, filePath: `uploads/${onboardingId}/${id}.pdf`, gueltigBis: null };
}

const ctx = { params: Promise.resolve({ token: "tok-1" }) };

function liste() {
  return GET(new NextRequest("http://localhost:3000/api/fragebogen/tok-1/documents"), ctx);
}

function loeschen(documentId: string) {
  return DELETE(
    new NextRequest(`http://localhost:3000/api/fragebogen/tok-1/documents?documentId=${documentId}`, { method: "DELETE" }),
    ctx,
  );
}

function frist(documentId: string, gueltigBis = ZUKUNFT) {
  return PATCH(
    new NextRequest("http://localhost:3000/api/fragebogen/tok-1/documents", {
      method: "PATCH",
      body: JSON.stringify({ documentId, gueltigBis }),
      headers: { "content-type": "application/json" },
    }),
    ctx,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(mockPrisma));
  mockUnlink.mockResolvedValue(undefined);
  mockValidateMagicToken.mockResolvedValue({ valid: true, onboarding: { id: ONB } });
  mockDokumente = [
    dok("geburt", "GEBURTSURKUNDE_EIGEN"),
    dok("titel", "AUFENTHALTSTITEL"),
    dok("protokoll", "UEBERGABEPROTOKOLL"),
    dok("fremd", "GEBURTSURKUNDE_EIGEN", "onb-2"),
  ];
});

describe("GET: nur Dokumente der waehlbaren Typen", () => {
  it("listet ein Uebergabeprotokoll des Vorgangs nicht", async () => {
    const res = await liste();
    expect(res.status).toBe(200);
    const { documents } = await res.json();
    expect(documents.map((d: { id: string }) => d.id).sort()).toEqual(["geburt", "titel"]);
  });

  it("listet jeden waehlbaren Typ unveraendert", async () => {
    mockDokumente = SELECTABLE_DOCUMENT_TYPES.map((t, i) => dok(`d${i}`, t));
    const { documents } = await (await liste()).json();
    expect(documents).toHaveLength(SELECTABLE_DOCUMENT_TYPES.length);
    expect(documents.map((d: { type: string }) => d.type).sort()).toEqual([...SELECTABLE_DOCUMENT_TYPES].sort());
  });

  it("filtert in der Abfrage selbst", async () => {
    await liste();
    expect(mockPrisma.document.findMany.mock.calls[0][0].where).toEqual({
      onboardingId: ONB,
      type: { in: SELECTABLE_DOCUMENT_TYPES },
    });
  });
});

describe("DELETE: das Protokoll ist ueber den Link unbekannt", () => {
  it("antwortet 404 wie fuer ein fremdes Dokument — Datei und Zeile bleiben", async () => {
    const protokoll = await loeschen("protokoll");
    const fremd = await loeschen("fremd");
    expect(protokoll.status).toBe(404);
    expect(fremd.status).toBe(404);
    expect(await protokoll.json()).toEqual(await fremd.json());

    expect(mockUnlink).not.toHaveBeenCalled();
    expect(mockPrisma.document.delete).not.toHaveBeenCalled();
    expect(mockDokumente.map((d) => d.id)).toContain("protokoll");
  });

  it("loescht ein Dokument eines waehlbaren Typs wie bisher", async () => {
    const res = await loeschen("geburt");
    expect(res.status).toBe(200);
    expect(mockUnlink).toHaveBeenCalledTimes(1);
    expect(mockDokumente.map((d) => d.id)).not.toContain("geburt");
  });
});

describe("PATCH: das Protokoll ist ueber den Link unbekannt", () => {
  it("antwortet 404 wie fuer ein fremdes Dokument und schreibt nichts", async () => {
    const protokoll = await frist("protokoll");
    const fremd = await frist("fremd");
    expect(protokoll.status).toBe(404);
    expect(fremd.status).toBe(404);
    expect(await protokoll.json()).toEqual(await fremd.json());

    expect(mockPrisma.document.update).not.toHaveBeenCalled();
    expect(mockPrisma.document.updateMany).not.toHaveBeenCalled();
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("traegt an einem Nachweis eines waehlbaren Typs die Frist wie bisher ein", async () => {
    const res = await frist("titel");
    expect(res.status).toBe(200);
    expect(mockPrisma.document.update).toHaveBeenCalledTimes(1);
    expect(mockDokumente.find((d) => d.id === "titel")?.gueltigBis).toEqual(new Date(`${ZUKUNFT}T00:00:00.000Z`));
  });
});
