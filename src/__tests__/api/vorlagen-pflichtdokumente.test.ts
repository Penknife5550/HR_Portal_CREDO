/**
 * PATCH /api/vorlagen/:id – welche Pflicht-Dokumenttypen eine Fragebogen-Vorlage
 * annimmt.
 *
 * Die Route bildete ihre Positivliste frueher aus allen Schluesseln von
 * DOCUMENT_TYPE_LABELS. Seit A4 (Ausstattung & Zugaenge) steht dort auch
 * UEBERGABEPROTOKOLL – ein Dokument, das nur HR hochlaedt. Als Pflicht einer
 * Vorlage hielte es die Abgabe jedes Fragebogens auf, weil die Person es gar
 * nicht hochladen kann. Seitdem gilt SELECTABLE_DOCUMENT_TYPES, dieselbe Liste,
 * die der Editor anbietet.
 */

const mockGetSession = jest.fn();
const mockPrisma = {
  formTemplate: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
};

jest.mock("@/lib/auth", () => ({ getSession: mockGetSession }));
jest.mock("@/lib/db", () => ({ prisma: mockPrisma }));

import { NextRequest } from "next/server";
import { PATCH } from "@/app/api/vorlagen/[id]/route";
import { SELECTABLE_DOCUMENT_TYPES } from "@/lib/required-documents";

function patch(body: unknown) {
  return PATCH(
    new NextRequest("http://localhost/api/vorlagen/v1", {
      method: "PATCH",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    }),
    { params: Promise.resolve({ id: "v1" }) },
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetSession.mockResolvedValue({ userId: "u1", role: "SUPER_ADMIN" });
  mockPrisma.formTemplate.findUnique.mockResolvedValue({ id: "v1", version: 1 });
  mockPrisma.formTemplate.update.mockImplementation(async ({ data }: { data: unknown }) => ({ id: "v1", ...(data as object) }));
});

describe("PATCH /api/vorlagen/:id – requiredDocuments", () => {
  it("weist UEBERGABEPROTOKOLL ab (400), ohne zu schreiben", async () => {
    const res = await patch({ requiredDocuments: ["MASERNSCHUTZ", "UEBERGABEPROTOKOLL"] });
    expect(res.status).toBe(400);
    expect(mockPrisma.formTemplate.update).not.toHaveBeenCalled();
  });

  it("nimmt jeden waehlbaren Typ an", async () => {
    const res = await patch({ requiredDocuments: [...SELECTABLE_DOCUMENT_TYPES] });
    expect(res.status).toBe(200);
    expect(mockPrisma.formTemplate.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ requiredDocuments: [...SELECTABLE_DOCUMENT_TYPES] }) }),
    );
  });

  it("weist unbekannte Typen weiter ab", async () => {
    const res = await patch({ requiredDocuments: ["GIBT_ES_NICHT"] });
    expect(res.status).toBe(400);
  });
});
