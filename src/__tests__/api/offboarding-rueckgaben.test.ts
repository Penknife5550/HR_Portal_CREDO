/**
 * /api/offboarding/:id/return-items — Reiter „Rückgaben“ im Offboarding.
 *
 * Bis 10/2026 rief der Reiter `/returns` auf, eine Route, die es nie gab
 * (404 bei „Gegenstand hinzufügen“ und „Rückgabe“), und die vorhandene Route
 * prüfte weder Rolle noch Mandant. Hier: Rollen (Lesen PORTAL_ROLES, Schreiben
 * HR_EDIT_ROLES), fremder Mandant = dieselbe 404 wie unbekannt, Anlegen,
 * Bestätigen, Löschen, AuditLog im selben Commit.
 *
 * Seit A4 (S30, G15, G16) ist der PATCH duenn um `rueckgabeAendern`
 * (src/lib/offboarding-ausgaben.ts): `zustand` neben der Altform `isReturned`,
 * bedingt auf `zustand` UND `isReturned`, Austrittssperre (bedingt auf „nicht
 * CANCELLED“), 409 beim abgebrochenen Austritt, Kennungsschema an Zeilen aus
 * der Einstellung; DELETE weist vorgeschlagene Zeilen ab. Der Gleichlauf an
 * Zeilen mit Ausgabe ist in offboarding-ausgaben.test.ts geprueft (eigene
 * In-Memory-Datenbank).
 */

const mockGetSession = jest.fn();
const mockPrisma = {
  offboardingProcess: { findUnique: jest.fn(), updateMany: jest.fn() },
  userOrgAssignment: { findUnique: jest.fn() },
  returnItem: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    updateMany: jest.fn(),
    deleteMany: jest.fn(),
  },
  auditLog: { create: jest.fn() },
  $transaction: jest.fn(),
};
// canAccessProcess bleibt die echte Funktion; einzelne Tests erzwingen
// "fremder Mandant" fuer HR-Rollen, die in Wirklichkeit alle Mandanten sehen
// (die Pruefung steht trotzdem in jedem Schreibweg, falls sich das aendert).
const mockCanAccessProcess = jest.fn();

jest.mock("@/lib/auth", () => ({ getSession: mockGetSession }));
jest.mock("@/lib/db", () => ({ prisma: mockPrisma }));
jest.mock("@/lib/permissions", () => {
  const echt = jest.requireActual("@/lib/permissions");
  return { ...echt, canAccessProcess: (...a: unknown[]) => mockCanAccessProcess(...a) };
});

import { NextRequest } from "next/server";
import { DELETE, GET, PATCH, POST } from "@/app/api/offboarding/[id]/return-items/route";

const { canAccessProcess: echtesCanAccessProcess } = jest.requireActual("@/lib/permissions");

const ID = "0f1e2d3c-4b5a-4968-8776-655443322110";
const ITEM_ID = "9a8b7c6d-5e4f-4321-8fed-cba987654321";
const HR = { userId: "u-hr", email: "hr@example.org", role: "HR_SACHBEARBEITER", firstName: "H", lastName: "R" };

const GEGENSTAND = {
  id: ITEM_ID,
  offboardingId: ID,
  category: "IT_HARDWARE",
  itemName: "Laptop",
  serialNumber: null,
  isReturned: false,
  returnedAt: null,
  returnedToId: null,
  condition: null,
  notes: null,
  createdAt: new Date("2026-10-01T08:00:00Z"),
  updatedAt: new Date("2026-10-01T08:00:00Z"),
};

function anfrage(method: string, body?: unknown, query = ""): NextRequest {
  const url = `http://localhost/api/offboarding/${ID}/return-items${query}`;
  if (body === undefined) return new NextRequest(url, { method });
  return new NextRequest(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}
const kontext = () => ({ params: Promise.resolve({ id: ID }) });

const anlegen = (body: unknown) => POST(anfrage("POST", body), kontext());
const aendern = (body: unknown) => PATCH(anfrage("PATCH", body), kontext());
const loeschen = (query: string, body?: unknown) => DELETE(anfrage("DELETE", body, query), kontext());

function nichtsGeschrieben() {
  expect(mockPrisma.offboardingProcess.updateMany).not.toHaveBeenCalled();
  expect(mockPrisma.returnItem.create).not.toHaveBeenCalled();
  expect(mockPrisma.returnItem.updateMany).not.toHaveBeenCalled();
  expect(mockPrisma.returnItem.deleteMany).not.toHaveBeenCalled();
  expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetSession.mockResolvedValue(HR);
  mockCanAccessProcess.mockImplementation((...a: unknown[]) => echtesCanAccessProcess(...a));
  mockPrisma.offboardingProcess.findUnique.mockResolvedValue({ organizationId: "org-1", status: "HANDOVER_PHASE" });
  mockPrisma.offboardingProcess.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.userOrgAssignment.findUnique.mockResolvedValue(null);
  mockPrisma.returnItem.findMany.mockResolvedValue([GEGENSTAND]);
  mockPrisma.returnItem.findFirst.mockResolvedValue(GEGENSTAND);
  mockPrisma.returnItem.create.mockImplementation(async ({ data }) => ({ ...GEGENSTAND, ...data }));
  mockPrisma.returnItem.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.returnItem.findUnique.mockResolvedValue({ ...GEGENSTAND, isReturned: true });
  mockPrisma.returnItem.deleteMany.mockResolvedValue({ count: 1 });
  mockPrisma.auditLog.create.mockResolvedValue({});
  mockPrisma.$transaction.mockImplementation(async (fn: (tx: typeof mockPrisma) => unknown) => fn(mockPrisma));
});

describe("Rollen", () => {
  it("ohne Anmeldung 401 — lesen und schreiben", async () => {
    mockGetSession.mockResolvedValue(null);
    expect((await GET(anfrage("GET"), kontext())).status).toBe(401);
    expect((await anlegen({ category: "IT_HARDWARE", itemName: "Laptop" })).status).toBe(401);
    nichtsGeschrieben();
  });

  it("lesen: Portal-Rollen ja, der n8n-Schlüssel (SERVICE) nicht", async () => {
    mockGetSession.mockResolvedValue({ ...HR, role: "SERVICE" });
    expect((await GET(anfrage("GET"), kontext())).status).toBe(403);

    mockGetSession.mockResolvedValue({ ...HR, role: "VORGESETZTER" });
    mockPrisma.userOrgAssignment.findUnique.mockResolvedValue({ userId: HR.userId, organizationId: "org-1" });
    const res = await GET(anfrage("GET"), kontext());
    expect(res.status).toBe(200);
    expect((await res.json()).items).toHaveLength(1);
  });

  it.each(["EINRICHTUNGSLEITUNG", "VORGESETZTER", "SERVICE"])(
    "schreiben nur mit HR_EDIT_ROLES — %s bekommt 403 und schreibt nichts",
    async (role) => {
      mockGetSession.mockResolvedValue({ ...HR, role });
      expect((await anlegen({ category: "IT_HARDWARE", itemName: "Laptop" })).status).toBe(403);
      expect((await aendern({ itemId: ITEM_ID, isReturned: true })).status).toBe(403);
      expect((await loeschen(`?itemId=${ITEM_ID}`)).status).toBe(403);
      nichtsGeschrieben();
    }
  );
});

describe("Mandant", () => {
  it("lesen: fremder Mandant = dieselbe 404 wie ein unbekannter Vorgang", async () => {
    mockGetSession.mockResolvedValue({ ...HR, role: "EINRICHTUNGSLEITUNG" });
    const fremd = await GET(anfrage("GET"), kontext());

    mockPrisma.offboardingProcess.findUnique.mockResolvedValue(null);
    const unbekannt = await GET(anfrage("GET"), kontext());

    expect(fremd.status).toBe(404);
    expect(unbekannt.status).toBe(404);
    expect(await fremd.json()).toEqual(await unbekannt.json());
    expect(mockPrisma.returnItem.findMany).not.toHaveBeenCalled();
  });

  it("schreiben: fremder Mandant = 404 mit demselben Text, nichts geschrieben", async () => {
    mockCanAccessProcess.mockResolvedValue(false);
    for (const res of [
      await anlegen({ category: "IT_HARDWARE", itemName: "Laptop" }),
      await aendern({ itemId: ITEM_ID, isReturned: true }),
      await loeschen(`?itemId=${ITEM_ID}`),
    ]) {
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "Vorgang nicht gefunden" });
    }
    expect(mockCanAccessProcess).toHaveBeenCalledWith(expect.objectContaining({ userId: HR.userId }), "org-1");
    nichtsGeschrieben();
  });

  it("schreiben: unbekannter Vorgang = 404", async () => {
    mockPrisma.offboardingProcess.findUnique.mockResolvedValue(null);
    const res = await anlegen({ category: "IT_HARDWARE", itemName: "Laptop" });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Vorgang nicht gefunden" });
    nichtsGeschrieben();
  });
});

describe("Anlegen", () => {
  it("legt den Gegenstand an und protokolliert im selben Commit — ohne Freitext", async () => {
    const res = await anlegen({
      category: "SCHLUESSEL",
      itemName: "  Generalschlüssel  ",
      serialNumber: "",
      notes: "",
    });

    expect(res.status).toBe(201);
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mockPrisma.returnItem.create).toHaveBeenCalledWith({
      data: {
        offboardingId: ID,
        category: "SCHLUESSEL",
        itemName: "Generalschlüssel",
        serialNumber: null,
        notes: null,
      },
    });
    const { item } = await res.json();
    expect(item.itemName).toBe("Generalschlüssel");

    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        offboardingId: ID,
        userId: HR.userId,
        processType: "OFFBOARDING",
        action: "RETURN_ITEM_CREATED",
        details: { returnItemId: ITEM_ID, category: "SCHLUESSEL" },
      },
    });
  });

  it("unbekannte Kategorie → 400 mit deutscher Meldung", async () => {
    const res = await anlegen({ category: "RAKETE", itemName: "Laptop" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Bitte eine gültige Kategorie wählen");
    nichtsGeschrieben();
  });

  it("leerer Gegenstand → 400", async () => {
    const res = await anlegen({ category: "IT_HARDWARE", itemName: "   " });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Bitte den Gegenstand angeben");
    nichtsGeschrieben();
  });

  it("kaputtes JSON → 400 statt 500", async () => {
    const res = await anlegen("{kaputt");
    expect(res.status).toBe(400);
    nichtsGeschrieben();
  });
});

describe("Bestätigen", () => {
  it("setzt Rückgabe, Zeitpunkt und Person vom Server — ein mitgeschickter Zeitpunkt zählt nicht", async () => {
    const res = await aendern({ itemId: ITEM_ID, isReturned: true, returnedAt: "1999-01-01T00:00:00Z" });

    expect(res.status).toBe(200);
    expect(mockPrisma.returnItem.findFirst).toHaveBeenCalledWith({
      where: { id: ITEM_ID, offboardingId: ID },
    });
    const aufruf = mockPrisma.returnItem.updateMany.mock.calls[0][0];
    // Bedingt auf den gelesenen Stand (gleichzeitige Bestaetigung → 409) –
    // seit A4 auch auf den Zustand (G16).
    expect(aufruf.where).toEqual({ id: ITEM_ID, offboardingId: ID, isReturned: false, zustand: null });
    expect(aufruf.data.isReturned).toBe(true);
    // Die Altform `isReturned: true` heisst ZURUECK (G16).
    expect(aufruf.data.zustand).toBe("ZURUECK");
    expect(aufruf.data.returnedToId).toBe(HR.userId);
    expect(aufruf.data.returnedAt).toBeInstanceOf(Date);
    expect(aufruf.data.returnedAt.getFullYear()).not.toBe(1999);

    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        offboardingId: ID,
        userId: HR.userId,
        processType: "OFFBOARDING",
        action: "RETURN_ITEM_UPDATED",
        details: {
          returnItemId: ITEM_ID,
          category: "IT_HARDWARE",
          geaenderteFelder: ["isReturned"],
          isReturned: true,
          zustand: "ZURUECK",
        },
      },
    });
    expect((await res.json()).item.isReturned).toBe(true);
  });

  it("Gegenstand eines anderen Vorgangs = 404 wie ein unbekannter", async () => {
    // findFirst sucht mit offboardingId — ein fremder Gegenstand findet sich nicht.
    mockPrisma.returnItem.findFirst.mockResolvedValue(null);
    const res = await aendern({ itemId: "fremd", isReturned: true });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Rückgabe-Gegenstand nicht gefunden" });
    nichtsGeschrieben();
  });

  it("schon zurückgegeben: 200 ohne Schreiben und ohne Protokoll", async () => {
    const zurueck = { ...GEGENSTAND, isReturned: true, returnedAt: new Date("2026-10-05T09:00:00Z"), returnedToId: "u-erst" };
    mockPrisma.returnItem.findFirst.mockResolvedValue(zurueck);
    const res = await aendern({ itemId: ITEM_ID, isReturned: true });
    expect(res.status).toBe(200);
    expect((await res.json()).item.returnedToId).toBe("u-erst");
    nichtsGeschrieben();
  });

  it("gleichzeitig von jemand anderem bestätigt → 409, kein Protokoll", async () => {
    mockPrisma.returnItem.updateMany.mockResolvedValue({ count: 0 });
    const res = await aendern({ itemId: ITEM_ID, isReturned: true });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain("Bitte die Seite neu laden");
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("Zustand und Notiz ändern: nur die geänderten Felder, Freitext nicht im Protokoll", async () => {
    const res = await aendern({ itemId: ITEM_ID, condition: "Kratzer am Deckel", notes: "" });
    expect(res.status).toBe(200);
    const { data } = mockPrisma.returnItem.updateMany.mock.calls[0][0];
    // notes "" = null = unveraendert (war schon null)
    expect(data).toEqual({ condition: "Kratzer am Deckel" });
    const details = mockPrisma.auditLog.create.mock.calls[0][0].data.details;
    expect(details).toEqual({ returnItemId: ITEM_ID, category: "IT_HARDWARE", geaenderteFelder: ["condition"] });
    expect(JSON.stringify(details)).not.toContain("Kratzer");
  });

  it("ohne itemId → 400", async () => {
    const res = await aendern({ isReturned: true });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Rückgabe-Gegenstand fehlt");
    nichtsGeschrieben();
  });
});

// =============================================
// Rueckgabezustand (A4, S30, G15, G16)
// =============================================

describe("Zustand (A4, S30)", () => {
  it("„fehlt“ an einer von HR erfassten Zeile: Zustand gesetzt, `isReturned` bleibt falsch, Protokoll mit Zustand", async () => {
    const res = await aendern({ itemId: ITEM_ID, zustand: "FEHLT" });
    expect(res.status).toBe(200);
    const aufruf = mockPrisma.returnItem.updateMany.mock.calls[0][0];
    expect(aufruf.where).toEqual({ id: ITEM_ID, offboardingId: ID, isReturned: false, zustand: null });
    expect(aufruf.data).toEqual({ zustand: "FEHLT", isReturned: false, returnedAt: null, returnedToId: null });
    expect(mockPrisma.auditLog.create.mock.calls[0][0].data.details).toEqual({
      returnItemId: ITEM_ID,
      category: "IT_HARDWARE",
      geaenderteFelder: ["zustand"],
      zustand: "FEHLT",
      isReturned: false,
    });
  });

  it("„beschädigt“ zählt als zurückgegeben (G16); `zustand: null` und `isReturned: false` öffnen wieder", async () => {
    await aendern({ itemId: ITEM_ID, zustand: "BESCHAEDIGT" });
    expect(mockPrisma.returnItem.updateMany.mock.calls[0][0].data).toMatchObject({
      zustand: "BESCHAEDIGT",
      isReturned: true,
      returnedToId: HR.userId,
    });

    const fehlt = { ...GEGENSTAND, zustand: "FEHLT" };
    for (const body of [{ zustand: null }, { isReturned: false }]) {
      jest.clearAllMocks();
      mockPrisma.returnItem.findFirst.mockResolvedValue(fehlt);
      mockPrisma.returnItem.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.offboardingProcess.updateMany.mockResolvedValue({ count: 1 });
      const res = await aendern({ itemId: ITEM_ID, ...body });
      expect(res.status).toBe(200);
      const aufruf = mockPrisma.returnItem.updateMany.mock.calls[0][0];
      expect(aufruf.where).toEqual({ id: ITEM_ID, offboardingId: ID, isReturned: false, zustand: "FEHLT" });
      expect(aufruf.data).toEqual({ zustand: null, isReturned: false, returnedAt: null, returnedToId: null });
    }
  });

  it("Altbestand (`isReturned` ohne Zustand) gilt als ZURUECK – „zurück“ ein zweites Mal ändert nichts", async () => {
    mockPrisma.returnItem.findFirst.mockResolvedValue({ ...GEGENSTAND, isReturned: true, zustand: null });
    const res = await aendern({ itemId: ITEM_ID, zustand: "ZURUECK" });
    expect(res.status).toBe(200);
    nichtsGeschrieben();
  });

  it("zwei Zustandswechsel auf demselben gelesenen Stand: der zweite ist 409 (bedingt auf den Zustand)", async () => {
    mockPrisma.returnItem.updateMany.mockResolvedValue({ count: 0 });
    const res = await aendern({ itemId: ITEM_ID, zustand: "ENTFAELLT" });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "Der Gegenstand wurde inzwischen geändert oder gelöscht. Bitte die Seite neu laden." });
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("der Austritt wird zuerst gesperrt (bedingt auf „nicht CANCELLED“), dann die Zeile geschrieben", async () => {
    await aendern({ itemId: ITEM_ID, zustand: "VERBLEIBT" });
    expect(mockPrisma.offboardingProcess.updateMany).toHaveBeenCalledWith({
      where: { id: ID, status: { not: "CANCELLED" } },
      data: { updatedAt: expect.any(Date) },
    });
    expect(mockPrisma.offboardingProcess.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      mockPrisma.returnItem.updateMany.mock.invocationCallOrder[0],
    );
  });

  it("abgebrochener Austritt → 409, nichts geschrieben – auch wenn der Abbruch erst unter der Sperre ankommt", async () => {
    mockPrisma.offboardingProcess.findUnique.mockResolvedValue({ organizationId: "org-1", status: "CANCELLED" });
    let res = await aendern({ itemId: ITEM_ID, zustand: "ZURUECK" });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "Der Vorgang wurde abgebrochen. Die Rückgaben lassen sich nicht mehr ändern." });
    nichtsGeschrieben();

    mockPrisma.offboardingProcess.findUnique
      .mockResolvedValueOnce({ organizationId: "org-1", status: "HANDOVER_PHASE" })
      .mockResolvedValueOnce({ status: "CANCELLED" });
    mockPrisma.offboardingProcess.updateMany.mockResolvedValue({ count: 0 });
    res = await aendern({ itemId: ITEM_ID, notes: "Rücksprache" });
    expect(res.status).toBe(409);
    expect(mockPrisma.returnItem.updateMany).not.toHaveBeenCalled();
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("`zustand` und `isReturned` zugleich bzw. ein unbekannter Zustand → 400", async () => {
    let res = await aendern({ itemId: ITEM_ID, zustand: "FEHLT", isReturned: true });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Bitte entweder „zurückgegeben“ oder einen Zustand angeben, nicht beides.");
    res = await aendern({ itemId: ITEM_ID, zustand: "VERSCHOLLEN" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Unbekannter Zustand.");
    nichtsGeschrieben();
  });

  it("Kennung einer Zeile aus der Einstellung: spitze Klammern, Zeilenumbruch oder über 60 Zeichen → 400; an einer HR-Zeile gelten die 100 Zeichen", async () => {
    mockPrisma.returnItem.findFirst.mockResolvedValue({ ...GEGENSTAND, ausgabeId: "ag-ipad", serialNumber: "FES-IPAD-0412" });
    for (const [serialNumber, meldung] of [
      ["<b>FES</b>", "Die Kennung darf keine spitzen Klammern (< >), keine Zeilenumbrüche und keine Steuerzeichen enthalten."],
      ["FES\nIPAD", "Die Kennung darf keine spitzen Klammern (< >), keine Zeilenumbrüche und keine Steuerzeichen enthalten."],
      ["X".repeat(61), "Die Kennung darf höchstens 60 Zeichen lang sein."],
    ]) {
      const res = await aendern({ itemId: ITEM_ID, serialNumber });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe(meldung);
    }
    nichtsGeschrieben();

    // Manuelle Zeile: 80 Zeichen sind erlaubt (bis 100 wie bisher).
    mockPrisma.returnItem.findFirst.mockResolvedValue(GEGENSTAND);
    const res = await aendern({ itemId: ITEM_ID, serialNumber: "S".repeat(80) });
    expect(res.status).toBe(200);
    expect(mockPrisma.returnItem.updateMany.mock.calls[0][0].data).toEqual({ serialNumber: "S".repeat(80) });
  });
});

describe("Löschen", () => {
  it("löscht per Query-Parameter und protokolliert", async () => {
    const res = await loeschen(`?itemId=${ITEM_ID}`);
    expect(res.status).toBe(200);
    expect(mockPrisma.returnItem.deleteMany).toHaveBeenCalledWith({
      where: { id: ITEM_ID, offboardingId: ID },
    });
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "RETURN_ITEM_DELETED",
        details: { returnItemId: ITEM_ID, category: "IT_HARDWARE", warZurueckgegeben: false },
      }),
    });
  });

  it("itemId auch im Body", async () => {
    expect((await loeschen("", { itemId: ITEM_ID })).status).toBe(200);
  });

  it("ohne itemId → 400, Gegenstand eines anderen Vorgangs → 404", async () => {
    expect((await loeschen("")).status).toBe(400);
    mockPrisma.returnItem.findFirst.mockResolvedValue(null);
    expect((await loeschen("?itemId=fremd")).status).toBe(404);
    nichtsGeschrieben();
  });

  it("eine aus der Einstellung vorgeschlagene Zeile (`ausgabeId`) lässt sich nicht löschen → 409 (A4, G15)", async () => {
    mockPrisma.returnItem.findFirst.mockResolvedValue({ ...GEGENSTAND, ausgabeId: "ag-ipad" });
    const res = await loeschen(`?itemId=${ITEM_ID}`);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: "Eine vorgeschlagene Rückgabe lässt sich nicht löschen – stattdessen „entfällt“ wählen.",
      grund: "VORGESCHLAGEN_NICHT_LOESCHEN",
    });
    nichtsGeschrieben();
  });
});
