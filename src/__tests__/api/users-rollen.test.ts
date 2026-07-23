/**
 * Tests fuer die Rechtelogik der Benutzerverwaltung.
 *
 * Hintergrund: Eine HR-Leitung konnte sich selbst zum Super-Admin machen und
 * damit die SUPER_ADMIN-only-Sperre fuer isBemBeauftragte aushebeln — also den
 * Zugang zur versiegelten BEM-Akte (§ 167 SGB IX). Zusaetzlich war derselbe Weg
 * ueber "Passwort eines Super-Admins neu setzen" offen.
 */

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
jest.mock("@/lib/passwort-setup", () => ({
  generateSetupToken: () => ({ token: "t", tokenHash: "h", expiresAt: new Date() }),
  buildSetupEmail: () => ({ subject: "s", text: "t", html: "h" }),
}));
jest.mock("@/lib/mailer", () => ({ sendEmailDetailed: jest.fn().mockResolvedValue({ ok: true }) }));

import { POST } from "@/app/api/users/route";
import { PATCH, DELETE } from "@/app/api/users/[id]/route";
import { assignableRoles, darfKontoVerwalten } from "@/lib/permissions";
import { NextRequest } from "next/server";

const HR_LEITUNG = {
  userId: "hr1",
  email: "hr@credo-gruppe.de",
  role: "HR_LEITUNG",
  firstName: "H",
  lastName: "L",
};
const SUPER_ADMIN = { ...HR_LEITUNG, userId: "sa1", role: "SUPER_ADMIN" };

function req(body: Record<string, unknown>) {
  return new NextRequest("http://localhost:3000/api/users", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

/** Zielkonto, das die Route per findUnique laedt. */
function zielkonto(role: string, id = "u-ziel") {
  mockPrisma.user.findUnique.mockResolvedValue({
    id,
    email: "ziel@credo-gruppe.de",
    role,
    phone: null,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.user.update.mockResolvedValue({ id: "u-ziel" });
  mockPrisma.user.create.mockResolvedValue({ id: "neu" });
});

describe("assignableRoles", () => {
  it("erlaubt Super-Admins alle vier Rollen", () => {
    expect(assignableRoles("SUPER_ADMIN")).toContain("SUPER_ADMIN");
    expect(assignableRoles("SUPER_ADMIN")).toHaveLength(4);
  });

  it("verweigert der HR-Leitung die Rolle Super-Admin", () => {
    expect(assignableRoles("HR_LEITUNG")).not.toContain("SUPER_ADMIN");
  });

  it("bietet die mandantenbeschraenkten Rollen niemandem an", () => {
    for (const rolle of ["SUPER_ADMIN", "HR_LEITUNG"]) {
      expect(assignableRoles(rolle)).not.toContain("EINRICHTUNGSLEITUNG");
      expect(assignableRoles(rolle)).not.toContain("VORGESETZTER");
    }
  });
});

describe("darfKontoVerwalten", () => {
  it("laesst Super-Admins alles", () => {
    expect(darfKontoVerwalten("SUPER_ADMIN", "SUPER_ADMIN")).toBe(true);
  });

  it("sperrt Super-Admin-Konten fuer die HR-Leitung", () => {
    expect(darfKontoVerwalten("HR_LEITUNG", "SUPER_ADMIN")).toBe(false);
  });

  it("laesst die HR-Leitung normale Konten verwalten", () => {
    expect(darfKontoVerwalten("HR_LEITUNG", "HR_SACHBEARBEITER")).toBe(true);
  });
});

describe("Rechteausweitung ist geschlossen", () => {
  it("HR-Leitung kann sich selbst NICHT zum Super-Admin machen", async () => {
    mockGetSession.mockResolvedValue(HR_LEITUNG);
    zielkonto("HR_LEITUNG", "hr1");

    const res = await PATCH(req({ role: "SUPER_ADMIN" }), params("hr1"));
    expect(res.status).toBe(403);
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it("HR-Leitung kann auch einen anderen NICHT zum Super-Admin machen", async () => {
    mockGetSession.mockResolvedValue(HR_LEITUNG);
    zielkonto("HR_SACHBEARBEITER");

    const res = await PATCH(req({ role: "SUPER_ADMIN" }), params("u-ziel"));
    expect(res.status).toBe(403);
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it("HR-Leitung kann das Passwort eines Super-Admins NICHT setzen", async () => {
    // Der zweite Weg zur Uebernahme: Passwort setzen und sich anmelden.
    mockGetSession.mockResolvedValue(HR_LEITUNG);
    zielkonto("SUPER_ADMIN");

    const res = await PATCH(req({ password: "EinSicheres123" }), params("u-ziel"));
    expect(res.status).toBe(403);
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it("HR-Leitung kann die E-Mail eines Super-Admins NICHT aendern", async () => {
    mockGetSession.mockResolvedValue(HR_LEITUNG);
    zielkonto("SUPER_ADMIN");

    const res = await PATCH(req({ email: "uebernahme@example.org" }), params("u-ziel"));
    expect(res.status).toBe(403);
  });

  it("HR-Leitung kann einen Super-Admin NICHT deaktivieren", async () => {
    mockGetSession.mockResolvedValue(HR_LEITUNG);
    zielkonto("SUPER_ADMIN");

    const res = await DELETE(req({}), params("u-ziel"));
    expect(res.status).toBe(403);
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it("HR-Leitung kann keinen Super-Admin ANLEGEN", async () => {
    mockGetSession.mockResolvedValue(HR_LEITUNG);
    mockPrisma.user.findUnique.mockResolvedValue(null);

    const res = await POST(
      req({
        email: "neu@credo-gruppe.de",
        firstName: "N",
        lastName: "N",
        password: "EinSicheres123",
        role: "SUPER_ADMIN",
      }),
    );
    expect(res.status).toBe(400);
    expect(mockPrisma.user.create).not.toHaveBeenCalled();
  });

  it("ein Super-Admin darf einen Super-Admin anlegen", async () => {
    mockGetSession.mockResolvedValue(SUPER_ADMIN);
    mockPrisma.user.findUnique.mockResolvedValue(null);

    const res = await POST(
      req({
        email: "neu@credo-gruppe.de",
        firstName: "N",
        lastName: "N",
        password: "EinSicheres123",
        role: "SUPER_ADMIN",
      }),
    );
    expect(res.status).toBe(201);
  });
});

describe("Selbstschutz bei der eigenen Rolle", () => {
  it("auch ein Super-Admin kann die eigene Rolle nicht herabstufen", async () => {
    mockGetSession.mockResolvedValue(SUPER_ADMIN);
    zielkonto("SUPER_ADMIN", "sa1");

    const res = await PATCH(req({ role: "HR_SACHBEARBEITER" }), params("sa1"));
    expect(res.status).toBe(403);
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it("das UNVERAENDERTE Mitsenden der eigenen Rolle bleibt erlaubt", async () => {
    // Die Oberflaeche sendet die Rolle bei jedem Speichern mit — wer nur seine
    // Telefonnummer aendert, darf daran nicht scheitern.
    mockGetSession.mockResolvedValue(SUPER_ADMIN);
    zielkonto("SUPER_ADMIN", "sa1");

    const res = await PATCH(
      req({ role: "SUPER_ADMIN", phone: "0571 / 1" }),
      params("sa1"),
    );
    expect(res.status).toBe(200);
    const daten = mockPrisma.user.update.mock.calls[0][0].data;
    expect(daten.phone).toBe("0571 / 1");
    expect("role" in daten).toBe(false);
  });
});

describe("Bestandsrollen bleiben bearbeitbar", () => {
  it("ein Konto mit Rolle EINRICHTUNGSLEITUNG laesst sich weiter pflegen", async () => {
    // Die Rolle ist nicht mehr vergebbar; unveraendert mitgesendet darf sie das
    // Speichern der uebrigen Felder aber nicht blockieren.
    mockGetSession.mockResolvedValue(HR_LEITUNG);
    zielkonto("EINRICHTUNGSLEITUNG");

    const res = await PATCH(
      req({ role: "EINRICHTUNGSLEITUNG", phone: "0571 / 2" }),
      params("u-ziel"),
    );
    expect(res.status).toBe(200);
    expect(mockPrisma.user.update.mock.calls[0][0].data.phone).toBe("0571 / 2");
  });

  it("auf EINRICHTUNGSLEITUNG UMstellen bleibt verboten", async () => {
    mockGetSession.mockResolvedValue(HR_LEITUNG);
    zielkonto("HR_SACHBEARBEITER");

    const res = await PATCH(req({ role: "EINRICHTUNGSLEITUNG" }), params("u-ziel"));
    expect(res.status).toBe(400);
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });
});
