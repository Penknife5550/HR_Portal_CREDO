/**
 * Tests fuer Lesezugriff und Download bereits erzeugter Dokumente.
 *
 * Schwerpunkte sind die drei Stellen, an denen der generische Endpunkt zum
 * Sicherheitsloch werden koennte: BEM-Ausschluss (versiegelte Akte), die
 * Mandantenpruefung ueber den Vorgang, und dass der Download die Berechtigung
 * erneut prueft statt sie aus dem Listenaufruf zu uebernehmen.
 */

const mockGetSession = jest.fn();
const mockCanAccessOrg = jest.fn();
const mockLadeVorgangsMandant = jest.fn();
const mockReadUploadedFile = jest.fn();
const mockPrisma = {
  generatedDocument: { findMany: jest.fn(), findUnique: jest.fn() },
};

jest.mock("@/lib/auth", () => ({ getSession: mockGetSession }));
jest.mock("@/lib/db", () => ({ prisma: mockPrisma }));
jest.mock("@/lib/permissions", () => ({
  HR_EDIT_ROLES: ["SUPER_ADMIN", "HR_LEITUNG", "HR_SACHBEARBEITER"],
  canAccessOrg: mockCanAccessOrg,
}));
jest.mock("@/lib/file-upload", () => ({ readUploadedFile: mockReadUploadedFile }));
jest.mock("@/lib/erzeugte-dokumente-vorgang", () => ({
  istModulUnterstuetzt: (m: string) =>
    ["ONBOARDING", "VERTRAGSVERLAENGERUNG"].includes(m),
  ladeVorgangsMandant: mockLadeVorgangsMandant,
}));

import { GET as LISTE } from "@/app/api/brief-vorlagen/erzeugt/route";
import { GET as DOWNLOAD } from "@/app/api/brief-vorlagen/erzeugt/[genId]/download/route";
import { NextRequest } from "next/server";

const HR = {
  userId: "hr1",
  email: "hr@credo-gruppe.de",
  role: "HR_SACHBEARBEITER",
  firstName: "H",
  lastName: "R",
};

function listeReq(query: string) {
  return new NextRequest(`http://localhost:3000/api/brief-vorlagen/erzeugt${query}`);
}

function downloadReq(genId: string, query = "") {
  return [
    new NextRequest(
      `http://localhost:3000/api/brief-vorlagen/erzeugt/${genId}/download${query}`,
    ),
    { params: Promise.resolve({ genId }) },
  ] as const;
}

const KEINE_PARAMS = { params: Promise.resolve({}) };

beforeEach(() => {
  jest.clearAllMocks();
  mockGetSession.mockResolvedValue(HR);
  mockCanAccessOrg.mockResolvedValue(true);
  mockLadeVorgangsMandant.mockResolvedValue("org-gym");
  mockPrisma.generatedDocument.findMany.mockResolvedValue([]);
});

describe("Liste — Zugriffsregeln", () => {
  it("weist BEM ab (versiegelte Akte)", async () => {
    const res = await LISTE(listeReq("?modul=BEM&refId=fall1"), KEINE_PARAMS);
    expect(res.status).toBe(403);
    expect(mockPrisma.generatedDocument.findMany).not.toHaveBeenCalled();
    // Belegt, dass die eigene BEM-Sperre gegriffen hat — nicht der allgemeine
    // "Modul nicht unterstuetzt"-Zweig, der 400 liefern wuerde.
    expect((await res.json()).error).toContain("BEM-Modul");
  });

  it("weist nicht unterstuetzte Module ab", async () => {
    const res = await LISTE(listeReq("?modul=OFFBOARDING&refId=x"), KEINE_PARAMS);
    expect(res.status).toBe(400);
    expect(mockPrisma.generatedDocument.findMany).not.toHaveBeenCalled();
  });

  it("verlangt Modul und Vorgang", async () => {
    expect((await LISTE(listeReq("?modul=ONBOARDING"), KEINE_PARAMS)).status).toBe(400);
    expect((await LISTE(listeReq("?refId=abc"), KEINE_PARAMS)).status).toBe(400);
  });

  it("antwortet mit 404, wenn es den Vorgang nicht gibt", async () => {
    mockLadeVorgangsMandant.mockResolvedValue(null);
    const res = await LISTE(listeReq("?modul=ONBOARDING&refId=weg"), KEINE_PARAMS);
    expect(res.status).toBe(404);
    expect(mockPrisma.generatedDocument.findMany).not.toHaveBeenCalled();
  });

  it("weist einen fremden Mandanten mit 403 ab", async () => {
    mockCanAccessOrg.mockResolvedValue(false);
    const res = await LISTE(listeReq("?modul=ONBOARDING&refId=onb1"), KEINE_PARAMS);
    expect(res.status).toBe(403);
    expect(mockPrisma.generatedDocument.findMany).not.toHaveBeenCalled();
  });

  it("prueft die Berechtigung gegen den Mandanten DES VORGANGS", async () => {
    await LISTE(listeReq("?modul=ONBOARDING&refId=onb1"), KEINE_PARAMS);
    expect(mockLadeVorgangsMandant).toHaveBeenCalledWith("ONBOARDING", "onb1");
    expect(mockCanAccessOrg).toHaveBeenCalledWith(HR, "org-gym");
  });

  it("normalisiert das Modul auf Grossschreibung", async () => {
    await LISTE(listeReq("?modul=onboarding&refId=onb1"), KEINE_PARAMS);
    expect(mockPrisma.generatedDocument.findMany.mock.calls[0][0].where).toEqual({
      modul: "ONBOARDING",
      refId: "onb1",
    });
  });
});

describe("Liste — Ausgabe", () => {
  it("liefert Formate als Kennzeichen und keine Dateipfade", async () => {
    mockPrisma.generatedDocument.findMany.mockResolvedValue([
      {
        id: "g1",
        name: "Vertragsverlängerung (23.07.2026)",
        createdAt: new Date("2026-07-23T09:14:00.000Z"),
        missingPlaceholders: ["stufe", "urlaubstage"],
        pfadDocx: "/app/uploads/brief-vorlagen-generiert/abc/v.docx",
        pfadPdf: null,
        createdBy: { firstName: "Erika", lastName: "Musterfrau" },
      },
    ]);

    const res = await LISTE(
      listeReq("?modul=VERTRAGSVERLAENGERUNG&refId=ce1"),
      KEINE_PARAMS,
    );
    const json = await res.json();
    const d = json.data[0];

    expect(d.hatDocx).toBe(true);
    expect(d.hatPdf).toBe(false);
    expect(d.fehlendeFelder).toBe(2);
    expect(d.erstelltVon).toBe("Erika Musterfrau");
    // Pfade duerfen den Server nicht verlassen
    expect(JSON.stringify(json)).not.toContain("uploads");
  });

  it("kommt mit geloeschtem Ersteller zurecht", async () => {
    mockPrisma.generatedDocument.findMany.mockResolvedValue([
      {
        id: "g1",
        name: "X",
        createdAt: new Date(),
        missingPlaceholders: [],
        pfadDocx: "/app/uploads/a/b.docx",
        pfadPdf: null,
        createdBy: null,
      },
    ]);
    const res = await LISTE(listeReq("?modul=ONBOARDING&refId=onb1"), KEINE_PARAMS);
    expect((await res.json()).data[0].erstelltVon).toBeNull();
  });

  it("sortiert die neuesten zuerst", async () => {
    await LISTE(listeReq("?modul=ONBOARDING&refId=onb1"), KEINE_PARAMS);
    expect(mockPrisma.generatedDocument.findMany.mock.calls[0][0].orderBy).toEqual({
      createdAt: "desc",
    });
  });
});

describe("Download", () => {
  const DOK = {
    name: "Vertragsverlaengerung",
    modul: "VERTRAGSVERLAENGERUNG",
    refId: "ce1",
    pfadDocx: "/app/uploads/brief-vorlagen-generiert/abc/v.docx",
    pfadPdf: "/app/uploads/brief-vorlagen-generiert/abc/v.pdf",
  };

  beforeEach(() => {
    mockPrisma.generatedDocument.findUnique.mockResolvedValue(DOK);
    mockReadUploadedFile.mockResolvedValue(Buffer.from("inhalt"));
  });

  it("liefert die Word-Fassung als Standard", async () => {
    const res = await DOWNLOAD(...downloadReq("g1"));
    expect(res.status).toBe(200);
    expect(mockReadUploadedFile).toHaveBeenCalledWith(DOK.pfadDocx);
    expect(res.headers.get("Content-Type")).toContain("wordprocessingml");
  });

  it("liefert auf Wunsch die PDF-Fassung", async () => {
    const res = await DOWNLOAD(...downloadReq("g1", "?format=pdf"));
    expect(mockReadUploadedFile).toHaveBeenCalledWith(DOK.pfadPdf);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
  });

  it("prueft die Berechtigung ERNEUT, nicht nur beim Listenaufruf", async () => {
    mockCanAccessOrg.mockResolvedValue(false);
    const res = await DOWNLOAD(...downloadReq("g1"));
    expect(res.status).toBe(403);
    expect(mockReadUploadedFile).not.toHaveBeenCalled();
  });

  it("weist ein BEM-Dokument ab, auch wenn die ID bekannt ist", async () => {
    mockPrisma.generatedDocument.findUnique.mockResolvedValue({
      ...DOK,
      modul: "BEM",
    });
    const res = await DOWNLOAD(...downloadReq("g1"));
    expect(res.status).toBe(403);
    expect(mockReadUploadedFile).not.toHaveBeenCalled();
    // Die Fehlermeldung belegt, dass die EIGENE BEM-Sperre gegriffen hat und
    // nicht bloss der allgemeine "Modul nicht unterstuetzt"-Zweig. Sonst
    // bestuende der Test auch dann noch, wenn jemand die BEM-Sperre entfernt.
    expect((await res.json()).error).toContain("BEM-Modul");
  });

  it("weist ein Dokument ohne Vorgangsbezug ab", async () => {
    mockPrisma.generatedDocument.findUnique.mockResolvedValue({ ...DOK, refId: null });
    const res = await DOWNLOAD(...downloadReq("g1"));
    expect(res.status).toBe(403);
    expect(mockReadUploadedFile).not.toHaveBeenCalled();
  });

  it("antwortet mit 404, wenn das gewuenschte Format fehlt", async () => {
    mockPrisma.generatedDocument.findUnique.mockResolvedValue({ ...DOK, pfadPdf: null });
    const res = await DOWNLOAD(...downloadReq("g1", "?format=pdf"));
    expect(res.status).toBe(404);
    expect(mockReadUploadedFile).not.toHaveBeenCalled();
  });

  it("antwortet mit 404, wenn die Datei nicht mehr auf der Platte liegt", async () => {
    mockReadUploadedFile.mockRejectedValue(new Error("ENOENT"));
    const res = await DOWNLOAD(...downloadReq("g1"));
    expect(res.status).toBe(404);
  });

  it("setzt einen ASCII-Dateinamen (Content-Disposition vertraegt keine Umlaute)", async () => {
    mockPrisma.generatedDocument.findUnique.mockResolvedValue({
      ...DOK,
      name: "Vertragsverlängerung für Lehrkräfte",
    });
    const res = await DOWNLOAD(...downloadReq("g1"));
    const cd = res.headers.get("Content-Disposition") || "";
    expect(cd).not.toMatch(/[^\x00-\x7F]/);
    expect(cd).toContain(".docx");
  });
});
