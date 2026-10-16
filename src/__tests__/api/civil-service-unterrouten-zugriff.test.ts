/**
 * Zugriff auf die Unterrouten der Verbeamtung (Befund 16.10.2026).
 *
 * VIER HANDLER HATTEN GAR KEINE ROLLENPRUEFUNG — nur „ist jemand angemeldet":
 *
 *   POST   /api/civil-service/[id]/application        erzeugt einen LEBENDEN
 *          Magic-Link-Token, ueberschreibt den bestehenden und gibt Token samt
 *          Adresse zurueck. Damit reicht man den Verbeamtungsantrag im Namen
 *          der Lehrkraft ein.
 *   GET    /api/civil-service/[id]/documents          Liste der Nachweise
 *   POST   /api/civil-service/[id]/documents          Datei hochladen
 *   GET    /api/civil-service/[id]/documents/[docId]  Datei herunterladen
 *   DELETE /api/civil-service/[id]/documents/[docId]  Datei loeschen
 *
 * Hinter den Dokumenten liegen die amtsaerztlichen Zeugnisse (Dokumentarten
 * AMTSARZT_PROBE, AMTSARZT_LEBENSZEIT) und die Gemeinde-Referenz — Gesundheits-
 * und Religionsdaten nach Art. 9 DSGVO. Und keiner der Handler prueefte den
 * Mandanten (`canAccessProcess`), die Unterlagen JEDES Traegers waren also
 * erreichbar.
 *
 * Aufgefallen ist das nicht, weil zwei Barrieren davorliegen (die
 * mandantenbeschraenkten Rollen lassen sich nicht vergeben, und das
 * Mandanten-Gate der Middleware verweigert ihnen jeden API-Pfad ausser
 * `/api/auth`) — beides soll sich aendern. Die uebrigen Unterrouten des Moduls
 * pruefen alle selbst; hier war es vergessen.
 *
 * Diese Tests halten BEIDES fest: die Rolle und den Mandanten. Sie sind
 * bewusst grob — je Handler ein 403 und ein 404 —, denn die Fachlogik dahinter
 * ist nicht Gegenstand dieser Korrektur.
 */

const mockGetSession = jest.fn();
const mockCanAccessProcess = jest.fn();
const mockPrisma = {
  civilServiceProcess: { findUnique: jest.fn(), update: jest.fn() },
  civilServiceDocument: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
  auditLog: { create: jest.fn() },
};

jest.mock("@/lib/auth", () => ({ getSession: mockGetSession }));
jest.mock("@/lib/db", () => ({ prisma: mockPrisma }));
// Die ECHTEN Rollenlisten, nur `canAccessProcess` als Attrappe.
jest.mock("@/lib/permissions", () => {
  const echt = jest.requireActual("@/lib/permissions");
  return { ...echt, canAccessProcess: (...a: unknown[]) => mockCanAccessProcess(...a) };
});

import { NextRequest } from "next/server";
import { POST as antragSenden } from "@/app/api/civil-service/[id]/application/route";
import { GET as dokumenteListe, POST as dokumentHochladen } from "@/app/api/civil-service/[id]/documents/route";
import { GET as dokumentLaden, DELETE as dokumentLoeschen } from "@/app/api/civil-service/[id]/documents/[docId]/route";
import { HR_EDIT_ROLES, PORTAL_ROLES } from "@/lib/permissions";

const ID = "psi1";
const DOC = "doc1";
const BASIS = `https://hr.example.org/api/civil-service/${ID}`;

/** Portal-Rollen ohne Bearbeitungsrecht, dazu das n8n-Dienstkonto. */
const OHNE_RECHT = [...PORTAL_ROLES.filter((r: string) => !HR_EDIT_ROLES.includes(r)), "SERVICE"];

const idParams = () => ({ params: Promise.resolve({ id: ID }) });
const docParams = () => ({ params: Promise.resolve({ id: ID, docId: DOC }) });

/** Die fuenf Handler, jeder mit seinem Aufruf. */
const HANDLER: Array<{ name: string; ruf: () => Promise<Response> }> = [
  {
    name: "POST .../application",
    ruf: () =>
      antragSenden(
        new NextRequest(`${BASIS}/application`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recipientEmail: "lehrkraft@example.org" }),
        }),
        idParams(),
      ),
  },
  {
    name: "GET .../documents",
    ruf: () => dokumenteListe(new NextRequest(`${BASIS}/documents`), idParams()),
  },
  {
    name: "POST .../documents",
    ruf: () =>
      dokumentHochladen(
        new NextRequest(`${BASIS}/documents`, { method: "POST", body: new FormData() }),
        idParams(),
      ),
  },
  {
    name: "GET .../documents/[docId]",
    ruf: () => dokumentLaden(new NextRequest(`${BASIS}/documents/${DOC}`), docParams()),
  },
  {
    name: "DELETE .../documents/[docId]",
    ruf: () =>
      dokumentLoeschen(new NextRequest(`${BASIS}/documents/${DOC}`, { method: "DELETE" }), docParams()),
  },
];

describe("Unterrouten der Verbeamtung: Rolle und Mandant", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCanAccessProcess.mockResolvedValue(true);
    mockPrisma.civilServiceProcess.findUnique.mockResolvedValue({
      id: ID,
      organizationId: "org1",
      displayId: "PSI-2026-GYM-001",
      status: "DRAFT",
      applicationToken: null,
      applicationSubmittedAt: null,
      employeeFirstName: "Max",
      employeeLastName: "Mustermann",
    });
    mockPrisma.civilServiceDocument.findFirst.mockResolvedValue({
      id: DOC,
      processId: ID,
      status: "UPLOADED",
      filePath: null,
      process: { organizationId: "org1" },
    });
    mockPrisma.civilServiceDocument.findMany.mockResolvedValue([]);
  });

  describe.each(HANDLER)("$name", ({ ruf }) => {
    it("401 ohne Sitzung", async () => {
      mockGetSession.mockResolvedValue(null);
      expect((await ruf()).status).toBe(401);
    });

    it.each(OHNE_RECHT)("403 fuer %s", async (rolle) => {
      mockGetSession.mockResolvedValue({ userId: "u2", role: rolle });
      const res = await ruf();
      expect(res.status).toBe(403);
      // Die Schranke sitzt VOR der Datenbank: kein Vorgang, kein Dokument,
      // kein Token wird angefasst.
      expect(mockPrisma.civilServiceProcess.update).not.toHaveBeenCalled();
      expect(mockPrisma.civilServiceDocument.create).not.toHaveBeenCalled();
      expect(mockPrisma.civilServiceDocument.update).not.toHaveBeenCalled();
    });

    it("404 bei fremdem Mandanten, mit HR-Recht", async () => {
      mockGetSession.mockResolvedValue({ userId: "u1", role: "HR_LEITUNG" });
      mockCanAccessProcess.mockResolvedValue(false);
      const res = await ruf();
      expect(res.status).toBe(404);
      // Nichts geschrieben, nichts ausgeliefert.
      expect(mockPrisma.civilServiceProcess.update).not.toHaveBeenCalled();
      expect(mockPrisma.civilServiceDocument.create).not.toHaveBeenCalled();
      expect(mockPrisma.civilServiceDocument.update).not.toHaveBeenCalled();
    });
  });

  // Der gefaehrlichste der fuenf Faelle, deshalb einzeln: Ohne Recht darf kein
  // Magic-Link-Token entstehen und keiner ueberschrieben werden.
  it("POST .../application: ohne HR-Recht entsteht KEIN Token", async () => {
    mockGetSession.mockResolvedValue({ userId: "u2", role: "VORGESETZTER" });
    const res = await HANDLER[0].ruf();

    expect(res.status).toBe(403);
    const text = JSON.stringify(await res.json());
    expect(text).not.toMatch(/token/i);
    expect(text).not.toMatch(/magicUrl/i);
    expect(mockPrisma.civilServiceProcess.update).not.toHaveBeenCalled();
  });
});
