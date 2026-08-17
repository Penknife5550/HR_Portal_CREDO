/**
 * Tests: Dokument-Upload im Personalfragebogen (/api/fragebogen/[token]/documents)
 *
 * Hintergrund (Bug 08/2026): Die Route mappt den mitgeschickten `type` ueber eine
 * Tabelle mit KLEINGESCHRIEBENEN Schluesseln. Schritt 4 (Geburtsurkunde Kind) und
 * Schritt 8 (Masernschutz) haben die ENUM-Schreibweise gesendet — der Treffer blieb
 * aus und das Dokument landete stillschweigend als SONSTIGES. Folge: Das Pflicht-
 * dokument galt weiter als fehlend, der Mitarbeiter musste dieselbe Datei am Ende
 * des Fragebogens erneut hochladen.
 *
 * Diese Tests sichern beide Schreibweisen ab.
 */

const mockPrisma = {
  document: {
    create: jest.fn(),
  },
};
const mockValidateMagicToken = jest.fn();

jest.mock("@/lib/db", () => ({ prisma: mockPrisma }));
jest.mock("@/lib/auth", () => ({ validateMagicToken: mockValidateMagicToken }));
jest.mock("@/lib/rate-limit", () => ({
  tokenRateLimiter: { check: () => ({ allowed: true }) },
  getClientIp: () => "127.0.0.1",
}));
jest.mock("fs/promises", () => ({
  writeFile: jest.fn().mockResolvedValue(undefined),
  mkdir: jest.fn().mockResolvedValue(undefined),
  unlink: jest.fn().mockResolvedValue(undefined),
}));

import { POST } from "@/app/api/fragebogen/[token]/documents/route";
import { NextRequest } from "next/server";

/** Minimale, gueltige PDF-Datei — die Route prueft die Magic Bytes (%PDF). */
function pdfFile(name = "geburtsurkunde.pdf"): File {
  const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
  return new File([bytes], name, { type: "application/pdf" });
}

async function upload(type: string) {
  const formData = new FormData();
  formData.append("file", pdfFile());
  formData.append("type", type);

  const request = new NextRequest(
    "http://localhost:3000/api/fragebogen/tok-123/documents",
    { method: "POST", body: formData }
  );

  const response = await POST(request, {
    params: Promise.resolve({ token: "tok-123" }),
  });

  return response;
}

/** Liest den `type`, mit dem das Dokument tatsaechlich angelegt wurde. */
function gespeicherterTyp(): string {
  expect(mockPrisma.document.create).toHaveBeenCalledTimes(1);
  return mockPrisma.document.create.mock.calls[0][0].data.type;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockValidateMagicToken.mockResolvedValue({
    valid: true,
    onboarding: { id: "onb-1" },
  });
  mockPrisma.document.create.mockImplementation(({ data }: never) => ({
    id: "doc-1",
    fileName: (data as { fileName: string }).fileName,
    type: (data as { type: string }).type,
    fileSize: 8,
    uploadedAt: new Date("2026-08-17T10:00:00Z"),
  }));
});

describe("Dokument-Typ-Mapping", () => {
  it("akzeptiert den Kategorie-Schluessel in Kleinschreibung", async () => {
    const res = await upload("geburtsurkunde_kind");
    expect(res.status).toBe(201);
    expect(gespeicherterTyp()).toBe("GEBURTSURKUNDE_KIND");
  });

  it("akzeptiert auch die Enum-Schreibweise (Regressionsschutz)", async () => {
    const res = await upload("GEBURTSURKUNDE_KIND");
    expect(res.status).toBe(201);
    expect(gespeicherterTyp()).toBe("GEBURTSURKUNDE_KIND");
  });

  it("mappt den Masernschutz-Nachweis in beiden Schreibweisen", async () => {
    await upload("MASERNSCHUTZ");
    expect(gespeicherterTyp()).toBe("MASERNSCHUTZ");

    jest.clearAllMocks();
    mockValidateMagicToken.mockResolvedValue({ valid: true, onboarding: { id: "onb-1" } });
    mockPrisma.document.create.mockImplementation(({ data }: never) => ({
      id: "doc-2",
      fileName: (data as { fileName: string }).fileName,
      type: (data as { type: string }).type,
      fileSize: 8,
      uploadedAt: new Date("2026-08-17T10:00:00Z"),
    }));

    await upload("masernschutz");
    expect(gespeicherterTyp()).toBe("MASERNSCHUTZ");
  });

  it("faellt bei unbekanntem Typ auf SONSTIGES zurueck", async () => {
    await upload("gibt_es_nicht");
    expect(gespeicherterTyp()).toBe("SONSTIGES");
  });

  it("legt kein Dokument an, wenn der Magic Link ungueltig ist", async () => {
    mockValidateMagicToken.mockResolvedValue({
      valid: false,
      reason: "Token nicht gefunden",
    });

    const res = await upload("geburtsurkunde_kind");
    expect(res.status).toBe(404);
    expect(mockPrisma.document.create).not.toHaveBeenCalled();
  });
});
