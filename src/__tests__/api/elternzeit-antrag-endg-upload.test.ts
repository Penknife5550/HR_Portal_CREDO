/**
 * Tests: Upload der Geburtsurkunde ueber den Link der Person
 * (/api/elternzeit-antrag-endg/[token]/upload)
 *
 * Hintergrund (Befund 10/2026): Die Route loeschte vor dem Anlegen der neuen
 * Zeile ALLE Geburtsurkunden des Vorgangs samt Dateien — auch eine, die HR im
 * Reiter Dokumente hochgeladen hatte. Ersetzt werden duerfen nur die eigenen
 * frueheren Uploads der Person (`hochgeladenVon` = "Mitarbeiter (Magic Link)").
 *
 * Die Datenbank ist ein kleiner Speicher im Test, der die `where`-Bedingung
 * wirklich anwendet — ein Mock, der jede Abfrage mit allen Zeilen beantwortet,
 * liesse den Filter ungeprueft.
 */

import path from "path";

type Zeile = {
  id: string;
  elternzeitId: string;
  dokumentTyp: string;
  dateiname: string;
  dateipfad: string;
  hochgeladenVon: string | null;
};

let zeilen: Zeile[] = [];
let naechsteId = 0;

/** Wendet eine flache Prisma-Bedingung an (Gleichheit, `null` trifft nur `null`). */
function passt(zeile: Zeile, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([feld, wert]) => {
    if (wert === undefined) return true;
    if (wert !== null && typeof wert === "object") {
      throw new Error(`Bedingung fuer ${feld} bildet der Test nicht nach – Speicher erweitern`);
    }
    return (zeile as Record<string, unknown>)[feld] === wert;
  });
}

const mockPrisma: {
  elternzeitProzess: { findUnique: jest.Mock };
  elternzeitDokument: { findMany: jest.Mock; delete: jest.Mock; create: jest.Mock };
  auditLog: { create: jest.Mock };
  $transaction: jest.Mock;
} = {
  elternzeitProzess: { findUnique: jest.fn() },
  elternzeitDokument: {
    findMany: jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
      zeilen.filter((z) => passt(z, where)),
    ),
    delete: jest.fn(async ({ where }: { where: { id: string } }) => {
      const treffer = zeilen.find((z) => z.id === where.id);
      if (!treffer) throw new Error("P2025");
      zeilen = zeilen.filter((z) => z.id !== where.id);
      return treffer;
    }),
    create: jest.fn(async ({ data }: { data: Omit<Zeile, "id"> }) => {
      const neu = { ...data, id: `neu-${++naechsteId}` };
      zeilen.push(neu);
      return neu;
    }),
  },
  auditLog: { create: jest.fn() },
  $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(mockPrisma)),
};

jest.mock("@/lib/db", () => ({ prisma: mockPrisma }));
jest.mock("@/lib/rate-limit", () => ({ getClientIpOrNull: () => null }));
jest.mock("fs/promises", () => ({
  writeFile: jest.fn().mockResolvedValue(undefined),
  mkdir: jest.fn().mockResolvedValue(undefined),
  unlink: jest.fn().mockResolvedValue(undefined),
}));

import { unlink } from "fs/promises";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/elternzeit-antrag-endg/[token]/upload/route";

const mockUnlink = unlink as jest.Mock;

/** Der Wert steht so in der Datenbank — der Test haelt ihn bewusst als Text fest. */
const PERSON = "Mitarbeiter (Magic Link)";
const VERZEICHNIS = path.join(process.cwd(), "uploads", "elternzeit", "ez-1");

function zeile(id: string, hochgeladenVon: string | null, dokumentTyp = "GEBURTSURKUNDE"): Zeile {
  return {
    id,
    elternzeitId: "ez-1",
    dokumentTyp,
    dateiname: `${id}.pdf`,
    dateipfad: path.join(VERZEICHNIS, `${id}.pdf`),
    hochgeladenVon,
  };
}

const VON_HR = zeile("hr-urkunde", "Hanna Personal");
const EIGENE_ALTE = zeile("eigene-alte", PERSON);

/** Minimale, gueltige PDF-Datei — die Route prueft die Magic Bytes (%PDF). */
function pdfFile(name = "geburtsurkunde.pdf"): File {
  const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
  return new File([bytes], name, { type: "application/pdf" });
}

async function hochladen(name?: string) {
  const formData = new FormData();
  formData.append("file", pdfFile(name));
  const request = new NextRequest(
    "http://localhost:3000/api/elternzeit-antrag-endg/tok-1/upload",
    { method: "POST", body: formData },
  );
  return POST(request, { params: Promise.resolve({ token: "tok-1" }) });
}

const geloeschteDateien = () => mockUnlink.mock.calls.map((c) => path.resolve(c[0] as string));
const ids = () => zeilen.map((z) => z.id).sort();

beforeEach(() => {
  jest.clearAllMocks();
  naechsteId = 0;
  mockPrisma.elternzeitProzess.findUnique.mockResolvedValue({
    id: "ez-1",
    antragTokenEndgExpiry: new Date(Date.now() + 86_400_000),
    antragTokenEndgUsedAt: null,
  });
});

describe("POST /api/elternzeit-antrag-endg/[token]/upload – nur eigene Uploads ersetzen", () => {
  it("laesst die Geburtsurkunde von HR stehen und ersetzt die eigene fruehere", async () => {
    zeilen = [VON_HR, EIGENE_ALTE];

    const res = await hochladen();

    expect(res.status).toBe(200);
    expect(ids()).toEqual(["hr-urkunde", "neu-1"]);
    expect(mockPrisma.elternzeitDokument.delete).toHaveBeenCalledTimes(1);
    expect(mockPrisma.elternzeitDokument.delete).toHaveBeenCalledWith({ where: { id: "eigene-alte" } });
    // Nach dem Commit wird genau die eigene alte Datei geloescht, nie die von HR.
    expect(geloeschteDateien()).toEqual([path.resolve(EIGENE_ALTE.dateipfad)]);
  });

  it("loescht nichts, solange nur die Geburtsurkunde von HR vorliegt", async () => {
    zeilen = [VON_HR];

    const res = await hochladen();

    expect(res.status).toBe(200);
    expect(ids()).toEqual(["hr-urkunde", "neu-1"]);
    expect(mockPrisma.elternzeitDokument.delete).not.toHaveBeenCalled();
    expect(mockUnlink).not.toHaveBeenCalled();
  });

  it("laesst Altzeilen ohne hochgeladenVon stehen (Herkunft unbekannt)", async () => {
    const ohneHerkunft = zeile("ohne-herkunft", null);
    zeilen = [ohneHerkunft, EIGENE_ALTE];

    await hochladen();

    expect(ids()).toEqual(["neu-1", "ohne-herkunft"]);
    expect(geloeschteDateien()).not.toContain(path.resolve(ohneHerkunft.dateipfad));
  });

  it("beruehrt andere Dokumentarten der Person nicht", async () => {
    const antrag = zeile("antrag", PERSON, "ANTRAG_ENDGUELTIG");
    zeilen = [antrag];

    await hochladen();

    expect(ids()).toEqual(["antrag", "neu-1"]);
    expect(mockUnlink).not.toHaveBeenCalled();
  });

  it("ein zweiter Upload findet den ersten wieder und ersetzt ihn – HR bleibt", async () => {
    // Haelt Anlegen und Ersetzen ueber denselben Wert zusammen: Traegt die neue
    // Zeile ein anderes Merkmal als die Suche erwartet, sammelten sich die
    // Uploads der Person an.
    zeilen = [VON_HR];

    await hochladen("erste.pdf");
    const erste = zeilen.find((z) => z.id === "neu-1");
    expect(erste?.hochgeladenVon).toBe(PERSON);

    await hochladen("zweite.pdf");

    expect(ids()).toEqual(["hr-urkunde", "neu-2"]);
    expect(geloeschteDateien()).toEqual([path.resolve(erste!.dateipfad)]);
  });

  it("scheitert die Transaktion, bleiben alte Dateien liegen und nur die neue wird entfernt", async () => {
    zeilen = [VON_HR, EIGENE_ALTE];
    mockPrisma.auditLog.create.mockRejectedValueOnce(new Error("DB weg"));
    const konsole = jest.spyOn(console, "error").mockImplementation(() => undefined);

    const res = await hochladen();
    konsole.mockRestore();

    expect(res.status).toBe(500);
    const geloescht = geloeschteDateien();
    expect(geloescht).toHaveLength(1);
    expect(geloescht).not.toContain(path.resolve(VON_HR.dateipfad));
    expect(geloescht).not.toContain(path.resolve(EIGENE_ALTE.dateipfad));
    expect(path.dirname(geloescht[0])).toBe(path.resolve(VERZEICHNIS));
  });
});
