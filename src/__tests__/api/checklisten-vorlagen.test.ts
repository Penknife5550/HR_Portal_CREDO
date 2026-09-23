/**
 * Checklisten-Vorlagen (Paket 5): /api/checklisten[/id][/items]
 *
 * Der Editor speicherte eine bearbeitete Vorlage, indem er erst ALLE Punkte
 * einzeln loeschte und sie danach einzeln neu anlegte — ohne eine einzige
 * Antwort zu pruefen. Brach etwas dazwischen ab, war die Vorlage leer, und die
 * Oberflaeche meldete trotzdem Erfolg; ausserdem bekam jeder Punkt eine neue
 * ID, sodass `ChecklistItem.templateItemId` laufender Vorgaenge ins Leere zeigte.
 *
 * Diese Suite haelt die Reparatur fest:
 *   - PUT ersetzt Metadaten und Punkte in EINER Transaktion, behaelt die
 *     mitgeschickten IDs und legt nur wirklich neue Punkte an.
 *   - Ein ungueltiger Punkt fuehrt zu 400, BEVOR irgendetwas geschrieben wird.
 *   - Die Zustaendigkeit muss ein Schluessel sein (Freitext-Altwerte werden
 *     abgewiesen, nicht still verworfen), der Hinweis hoechstens 500 Zeichen.
 *   - prisma/seed.ts schreibt Schluessel statt Freitext (die Migration laeuft
 *     VOR dem Seed und setzt auf leerer Datenbank nur ihren Merker).
 *
 * Prisma ist gemockt, damit die Aufrufe selbst pruefbar sind (deleteMany mit
 * `notIn`, updateMany mit `templateId` im WHERE, createMany fuer den Rest).
 */

const mockGetSession = jest.fn();
const mockPrisma = {
  checklistTemplate: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  checklistTemplateItem: {
    findFirst: jest.fn(),
    create: jest.fn(),
    createMany: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    deleteMany: jest.fn(),
  },
  // Interaktive Transaktion: tx ist dasselbe Mock-Objekt (Umsetzung im beforeEach).
  $transaction: jest.fn(),
};

jest.mock("@/lib/auth", () => ({ getSession: mockGetSession }));
jest.mock("@/lib/db", () => ({ prisma: mockPrisma }));

import fs from "fs";
import path from "path";
import { NextRequest } from "next/server";
import { POST as VORLAGE_ANLEGEN } from "@/app/api/checklisten/route";
import {
  PUT as VORLAGE_ERSETZEN,
  PATCH as VORLAGE_AENDERN,
} from "@/app/api/checklisten/[id]/route";
import {
  POST as PUNKT_ANLEGEN,
  PATCH as PUNKT_AENDERN,
} from "@/app/api/checklisten/[id]/items/route";
import { DEPARTMENT_KEYS } from "@/lib/constants";
import { ABTEILUNGS_SCHLUESSEL_MUSTER } from "@/lib/abteilungsaufgaben";

// =============================================
// Fixtures
// =============================================

const HR_LEITUNG = { userId: "u-hrl", email: "hrl@credo.de", role: "HR_LEITUNG", firstName: "H", lastName: "L" };
const SUPER_ADMIN = { ...HR_LEITUNG, userId: "u-sa", role: "SUPER_ADMIN" };
const HR_SACHBEARBEITER = { ...HR_LEITUNG, userId: "u-hrs", role: "HR_SACHBEARBEITER" };

const VORLAGE_ID = "t-1";
const URL_BASIS = "http://localhost:3000/api/checklisten";

const ANTWORT_VORLAGE = {
  id: VORLAGE_ID,
  name: "Standard-Einstellung (TV-L)",
  description: null,
  questionnaireType: "STANDARD",
  isActive: true,
  items: [],
  _count: { items: 0, onboardings: 2 },
  createdAt: new Date("2026-09-01T08:00:00.000Z"),
  updatedAt: new Date("2026-09-22T08:00:00.000Z"),
};

function punkt(teil: Record<string, unknown> = {}) {
  return { title: "IT-Konto anlegen", category: "Vor Arbeitsbeginn", ...teil };
}

function vorlagenRumpf(teil: Record<string, unknown> = {}) {
  return {
    name: "Standard-Einstellung (TV-L)",
    questionnaireType: "STANDARD",
    items: [punkt()],
    ...teil,
  };
}

function anfrage(methode: string, body?: unknown, url = URL_BASIS) {
  return new NextRequest(url, {
    method: methode,
    ...(body !== undefined && {
      body: typeof body === "string" ? body : JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    }),
  });
}

const mitId = (id: string) => ({ params: Promise.resolve({ id }) });

async function antwort(res: Response) {
  return { status: res.status, body: await res.json() };
}

/** Existiert die Vorlage? (steuert beide findUnique-Aufrufe der PUT-Route) */
let vorlageVorhanden = true;
/** Name der gespeicherten Vorlage — PATCH liest ihn, wenn keiner mitkommt. */
let gespeicherterName = ANTWORT_VORLAGE.name;

beforeEach(() => {
  jest.clearAllMocks();
  vorlageVorhanden = true;
  gespeicherterName = ANTWORT_VORLAGE.name;
  mockGetSession.mockResolvedValue(HR_LEITUNG);
  mockPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(mockPrisma));
  mockPrisma.checklistTemplate.findUnique.mockImplementation(
    async ({ where, include }: { where: { id: string }; include?: unknown }) => {
      if (!vorlageVorhanden) return null;
      return include
        ? { ...ANTWORT_VORLAGE, id: where.id, name: gespeicherterName }
        : { id: where.id, name: gespeicherterName };
    },
  );
  mockPrisma.checklistTemplate.update.mockResolvedValue({ id: VORLAGE_ID });
  mockPrisma.checklistTemplate.create.mockImplementation(
    async ({ data }: { data: Record<string, unknown> }) => ({ ...ANTWORT_VORLAGE, ...data, id: "t-neu" }),
  );
  mockPrisma.checklistTemplateItem.deleteMany.mockResolvedValue({ count: 0 });
  mockPrisma.checklistTemplateItem.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.checklistTemplateItem.createMany.mockResolvedValue({ count: 0 });
  mockPrisma.checklistTemplateItem.create.mockImplementation(
    async ({ data }: { data: Record<string, unknown> }) => ({ id: "i-neu", ...data }),
  );
  mockPrisma.checklistTemplateItem.update.mockImplementation(
    async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => ({ id: where.id, ...data }),
  );
  mockPrisma.checklistTemplateItem.findFirst.mockResolvedValue({ id: "i-1" });
});

const angelegtePunkte = () =>
  (mockPrisma.checklistTemplateItem.createMany.mock.calls[0]?.[0].data ?? []) as Record<string, unknown>[];

/** Wurde irgendetwas geschrieben? */
function nichtsGeschrieben() {
  expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  expect(mockPrisma.checklistTemplate.update).not.toHaveBeenCalled();
  expect(mockPrisma.checklistTemplateItem.deleteMany).not.toHaveBeenCalled();
  expect(mockPrisma.checklistTemplateItem.updateMany).not.toHaveBeenCalled();
  expect(mockPrisma.checklistTemplateItem.createMany).not.toHaveBeenCalled();
}

// =============================================
// Rechte
// =============================================

describe("PUT /api/checklisten/[id] – Rechte", () => {
  it("ohne Session 401, ohne Datenbankzugriff", async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await antwort(await VORLAGE_ERSETZEN(anfrage("PUT", vorlagenRumpf()), mitId(VORLAGE_ID)));
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "Nicht authentifiziert" });
    nichtsGeschrieben();
  });

  it("HR_SACHBEARBEITER bekommt 403", async () => {
    mockGetSession.mockResolvedValue(HR_SACHBEARBEITER);
    const res = await antwort(await VORLAGE_ERSETZEN(anfrage("PUT", vorlagenRumpf()), mitId(VORLAGE_ID)));
    expect(res.status).toBe(403);
    expect(res.body.error).toContain("Keine Berechtigung");
    nichtsGeschrieben();
  });

  it("SUPER_ADMIN darf", async () => {
    mockGetSession.mockResolvedValue(SUPER_ADMIN);
    const res = await antwort(await VORLAGE_ERSETZEN(anfrage("PUT", vorlagenRumpf()), mitId(VORLAGE_ID)));
    expect(res.status).toBe(200);
  });

  it("unbekannte Vorlage → 404", async () => {
    vorlageVorhanden = false;
    const res = await antwort(await VORLAGE_ERSETZEN(anfrage("PUT", vorlagenRumpf()), mitId("t-weg")));
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Checklisten-Vorlage nicht gefunden" });
    nichtsGeschrieben();
  });
});

// =============================================
// Ersetzen in EINER Transaktion
// =============================================

describe("PUT /api/checklisten/[id] – Ersetzen", () => {
  it("behaelt vorhandene IDs, entfernt Fehlende, legt Neue an – alles in einer Transaktion", async () => {
    const rumpf = vorlagenRumpf({
      items: [
        punkt({ id: "i-1", title: "Arbeitsvertrag erstellt", defaultAssignee: "HR", defaultDueDays: -14 }),
        punkt({ id: "i-2", title: "IT-Konto anlegen", defaultAssignee: "IT", defaultDueDays: -7, description: "Microsoft 365" }),
        punkt({ title: "Schlüssel bestellen", defaultAssignee: "VERWALTUNG", defaultDueDays: -3 }),
      ],
    });

    const res = await antwort(await VORLAGE_ERSETZEN(anfrage("PUT", rumpf), mitId(VORLAGE_ID)));

    expect(res.status).toBe(200);
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);

    // Punkte ausserhalb der Liste verschwinden — nur innerhalb DIESER Vorlage.
    expect(mockPrisma.checklistTemplateItem.deleteMany).toHaveBeenCalledWith({
      where: { templateId: VORLAGE_ID, id: { notIn: ["i-1", "i-2"] } },
    });

    // Vorhandene Punkte behalten ihre ID.
    expect(mockPrisma.checklistTemplateItem.updateMany).toHaveBeenCalledTimes(2);
    expect(mockPrisma.checklistTemplateItem.updateMany).toHaveBeenNthCalledWith(1, {
      where: { id: "i-1", templateId: VORLAGE_ID },
      data: {
        title: "Arbeitsvertrag erstellt",
        category: "Vor Arbeitsbeginn",
        orderIndex: 0,
        defaultDueDays: -14,
        defaultAssignee: "HR",
        description: null,
      },
    });
    expect(mockPrisma.checklistTemplateItem.updateMany).toHaveBeenNthCalledWith(2, {
      where: { id: "i-2", templateId: VORLAGE_ID },
      data: expect.objectContaining({ orderIndex: 1, description: "Microsoft 365" }),
    });

    // Nur der Punkt ohne ID entsteht neu.
    expect(angelegtePunkte()).toEqual([
      {
        templateId: VORLAGE_ID,
        title: "Schlüssel bestellen",
        category: "Vor Arbeitsbeginn",
        orderIndex: 2,
        defaultDueDays: -3,
        defaultAssignee: "VERWALTUNG",
        description: null,
      },
    ]);
  });

  it("ohne vorhandene IDs verschwinden alle alten Punkte (deleteMany ohne notIn)", async () => {
    await VORLAGE_ERSETZEN(anfrage("PUT", vorlagenRumpf()), mitId(VORLAGE_ID));
    expect(mockPrisma.checklistTemplateItem.deleteMany).toHaveBeenCalledWith({
      where: { templateId: VORLAGE_ID },
    });
  });

  it("eine Punkt-ID aus einer FREMDEN Vorlage wird angelegt, nie ueberschrieben", async () => {
    mockPrisma.checklistTemplateItem.updateMany.mockResolvedValue({ count: 0 });
    const rumpf = vorlagenRumpf({ items: [punkt({ id: "fremd-9", title: "Fremder Punkt" })] });

    const res = await antwort(await VORLAGE_ERSETZEN(anfrage("PUT", rumpf), mitId(VORLAGE_ID)));

    expect(res.status).toBe(200);
    // Der Versuch lief gegen id UND templateId — er traf nichts.
    expect(mockPrisma.checklistTemplateItem.updateMany).toHaveBeenCalledWith({
      where: { id: "fremd-9", templateId: VORLAGE_ID },
      data: expect.any(Object),
    });
    // Und der Punkt entstand neu (ohne die fremde ID).
    const neu = angelegtePunkte();
    expect(neu).toHaveLength(1);
    expect(neu[0]).toMatchObject({ templateId: VORLAGE_ID, title: "Fremder Punkt" });
    expect(neu[0].id).toBeUndefined();
  });

  it("orderIndex ergibt sich aus der Position, wenn er fehlt – mitgeschickte bleiben", async () => {
    const rumpf = vorlagenRumpf({
      items: [punkt({ title: "A" }), punkt({ title: "B", orderIndex: 42 }), punkt({ title: "C" })],
    });
    await VORLAGE_ERSETZEN(anfrage("PUT", rumpf), mitId(VORLAGE_ID));
    expect(angelegtePunkte().map((p) => [p.title, p.orderIndex])).toEqual([
      ["A", 0],
      ["B", 42],
      ["C", 2],
    ]);
  });

  it("defaultDueDays 0 bleibt 0 (nicht null)", async () => {
    const rumpf = vorlagenRumpf({ items: [punkt({ defaultDueDays: 0 })] });
    await VORLAGE_ERSETZEN(anfrage("PUT", rumpf), mitId(VORLAGE_ID));
    expect(angelegtePunkte()[0].defaultDueDays).toBe(0);
  });

  it("eine „Offboarding: …“-Vorlage bekommt questionnaireType null", async () => {
    const rumpf = vorlagenRumpf({ name: "Offboarding: Standard", questionnaireType: "STANDARD" });
    await VORLAGE_ERSETZEN(anfrage("PUT", rumpf), mitId(VORLAGE_ID));
    expect(mockPrisma.checklistTemplate.update).toHaveBeenCalledWith({
      where: { id: VORLAGE_ID },
      data: expect.objectContaining({ name: "Offboarding: Standard", questionnaireType: null }),
    });
  });

  it("isActive bleibt unveraendert, solange es niemand mitschickt", async () => {
    await VORLAGE_ERSETZEN(anfrage("PUT", vorlagenRumpf()), mitId(VORLAGE_ID));
    const daten = mockPrisma.checklistTemplate.update.mock.calls[0][0].data;
    expect("isActive" in daten).toBe(false);

    jest.clearAllMocks();
    beforeEachNachbauen();
    await VORLAGE_ERSETZEN(anfrage("PUT", vorlagenRumpf({ isActive: false })), mitId(VORLAGE_ID));
    expect(mockPrisma.checklistTemplate.update.mock.calls[0][0].data.isActive).toBe(false);
  });

  it("antwortet mit { data: … } inklusive Punkten und Zaehlern", async () => {
    const res = await antwort(await VORLAGE_ERSETZEN(anfrage("PUT", vorlagenRumpf()), mitId(VORLAGE_ID)));
    expect(res.body.data).toMatchObject({ id: VORLAGE_ID, _count: { items: 0, onboardings: 2 } });
    expect(Array.isArray(res.body.data.items)).toBe(true);
  });
});

/** Die Mock-Vorgaben nach einem `clearAllMocks` mitten im Test wiederherstellen. */
function beforeEachNachbauen() {
  mockGetSession.mockResolvedValue(HR_LEITUNG);
  mockPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(mockPrisma));
  mockPrisma.checklistTemplate.findUnique.mockImplementation(
    async ({ where, include }: { where: { id: string }; include?: unknown }) =>
      include
        ? { ...ANTWORT_VORLAGE, id: where.id, name: gespeicherterName }
        : { id: where.id, name: gespeicherterName },
  );
  mockPrisma.checklistTemplate.update.mockResolvedValue({ id: VORLAGE_ID });
  mockPrisma.checklistTemplateItem.deleteMany.mockResolvedValue({ count: 0 });
  mockPrisma.checklistTemplateItem.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.checklistTemplateItem.createMany.mockResolvedValue({ count: 0 });
}

// =============================================
// Validierung – nichts halb gespeichert
// =============================================

describe("PUT /api/checklisten/[id] – Validierung", () => {
  it("ein ungueltiger Punkt ergibt 400 mit „Punkt 2: …“ – und NICHTS ist gespeichert", async () => {
    const rumpf = vorlagenRumpf({
      items: [punkt({ id: "i-1" }), punkt({ title: "Schlüssel bestellen", defaultAssignee: "Hausmeister" })],
    });

    const res = await antwort(await VORLAGE_ERSETZEN(anfrage("PUT", rumpf), mitId(VORLAGE_ID)));

    expect(res.status).toBe(400);
    expect(res.body.error).toBe(
      "Punkt 2: Die Zuständigkeit „Hausmeister“ ist unbekannt – bitte in der Auswahl zuordnen.",
    );
    nichtsGeschrieben();
  });

  it("Freitext-Zustaendigkeit wird abgewiesen, ein Schluessel angenommen", async () => {
    const schlecht = await antwort(
      await VORLAGE_ERSETZEN(anfrage("PUT", vorlagenRumpf({ items: [punkt({ defaultAssignee: "Verwaltung" })] })), mitId(VORLAGE_ID)),
    );
    expect(schlecht.status).toBe(400);
    expect(schlecht.body.error).toContain("Verwaltung");

    jest.clearAllMocks();
    beforeEachNachbauen();
    const gut = await antwort(
      await VORLAGE_ERSETZEN(anfrage("PUT", vorlagenRumpf({ items: [punkt({ defaultAssignee: "VERWALTUNG" })] })), mitId(VORLAGE_ID)),
    );
    expect(gut.status).toBe(200);
  });

  it("ein Hinweis ueber 500 Zeichen ergibt 400", async () => {
    const rumpf = vorlagenRumpf({ items: [punkt({ description: "x".repeat(501) })] });
    const res = await antwort(await VORLAGE_ERSETZEN(anfrage("PUT", rumpf), mitId(VORLAGE_ID)));
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Punkt 1: Der Hinweis darf höchstens 500 Zeichen lang sein.");
    nichtsGeschrieben();
  });

  it("genau 500 Zeichen gehen durch, leerer Hinweis wird null", async () => {
    const rumpf = vorlagenRumpf({ items: [punkt({ description: "x".repeat(500) }), punkt({ title: "B", description: "   " })] });
    const res = await antwort(await VORLAGE_ERSETZEN(anfrage("PUT", rumpf), mitId(VORLAGE_ID)));
    expect(res.status).toBe(200);
    expect(angelegtePunkte().map((p) => p.description)).toEqual(["x".repeat(500), null]);
  });

  it("leere Punktliste, fehlender Name und kaputtes JSON ergeben 400", async () => {
    const leer = await antwort(await VORLAGE_ERSETZEN(anfrage("PUT", vorlagenRumpf({ items: [] })), mitId(VORLAGE_ID)));
    expect(leer.status).toBe(400);
    expect(leer.body.error).toBe("Mindestens ein Checklisten-Punkt ist erforderlich.");

    const ohneName = await antwort(await VORLAGE_ERSETZEN(anfrage("PUT", vorlagenRumpf({ name: "  " })), mitId(VORLAGE_ID)));
    expect(ohneName.status).toBe(400);
    expect(ohneName.body.error).toBe("Name ist ein Pflichtfeld.");

    const kaputt = await antwort(await VORLAGE_ERSETZEN(anfrage("PUT", "{nicht json"), mitId(VORLAGE_ID)));
    expect(kaputt.status).toBe(400);
    expect(kaputt.body.error).toBe("Ungültige Eingabe");

    nichtsGeschrieben();
  });

  it("eine doppelte Punkt-ID ergibt 400", async () => {
    const rumpf = vorlagenRumpf({ items: [punkt({ id: "i-1" }), punkt({ id: "i-1", title: "B" })] });
    const res = await antwort(await VORLAGE_ERSETZEN(anfrage("PUT", rumpf), mitId(VORLAGE_ID)));
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("doppelt");
    nichtsGeschrieben();
  });
});

// =============================================
// POST /api/checklisten
// =============================================

describe("POST /api/checklisten", () => {
  it("legt Vorlage samt Hinweis an und antwortet 201 mit dem nackten Datensatz", async () => {
    const rumpf = vorlagenRumpf({
      items: [punkt({ defaultAssignee: "IT", defaultDueDays: -7, description: "Microsoft 365" })],
    });

    const res = await antwort(await VORLAGE_ANLEGEN(anfrage("POST", rumpf)));

    expect(res.status).toBe(201);
    // Kein { data: … } — anders als GET und PUT (der Editor liest beide Formen).
    expect(res.body.id).toBe("t-neu");
    const daten = mockPrisma.checklistTemplate.create.mock.calls[0][0].data;
    expect(daten.items.create).toEqual([
      {
        title: "IT-Konto anlegen",
        category: "Vor Arbeitsbeginn",
        orderIndex: 0,
        defaultDueDays: -7,
        defaultAssignee: "IT",
        description: "Microsoft 365",
      },
    ]);
  });

  it("uebergeht ein mitgeschicktes items[].id – eine neue Vorlage bekommt neue Punkte", async () => {
    await VORLAGE_ANLEGEN(anfrage("POST", vorlagenRumpf({ items: [punkt({ id: "i-alt" })] })));
    const erstellt = mockPrisma.checklistTemplate.create.mock.calls[0][0].data.items.create[0];
    expect("id" in erstellt).toBe(false);
  });

  it("weist Freitext-Zustaendigkeit ab und schreibt nichts", async () => {
    const res = await antwort(
      await VORLAGE_ANLEGEN(anfrage("POST", vorlagenRumpf({ items: [punkt({ defaultAssignee: "Vorgesetzter" })] }))),
    );
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Punkt 1:");
    expect(mockPrisma.checklistTemplate.create).not.toHaveBeenCalled();
  });

  it("HR_SACHBEARBEITER bekommt 403", async () => {
    mockGetSession.mockResolvedValue(HR_SACHBEARBEITER);
    const res = await antwort(await VORLAGE_ANLEGEN(anfrage("POST", vorlagenRumpf())));
    expect(res.status).toBe(403);
    expect(mockPrisma.checklistTemplate.create).not.toHaveBeenCalled();
  });
});

// =============================================
// PATCH – dieselbe Offboarding-Sperre wie PUT und POST
//
// Befund der Durchsicht: PUT und POST setzen `questionnaireType` bei einer
// „Offboarding: …"-Vorlage auf null, PATCH schrieb ihn ungeprueft. Ueber die
// Oberflaeche nicht ausloesbar (der Aktiv-Schalter schickt nur isActive),
// ueber die API schon — und der naechste POST /api/onboarding haette sich
// eine Austritts-Checkliste gezogen.
// =============================================

describe("PATCH /api/checklisten/[id]", () => {
  const patch = (body: unknown, id = VORLAGE_ID) =>
    VORLAGE_AENDERN(anfrage("PATCH", body, `${URL_BASIS}/${id}`), mitId(id));

  const geschrieben = () =>
    mockPrisma.checklistTemplate.update.mock.calls[0][0].data as Record<string, unknown>;

  it("ein „Offboarding: …“-Name erzwingt questionnaireType null", async () => {
    const res = await antwort(await patch({ name: "Offboarding: Standard", questionnaireType: "STANDARD" }));
    expect(res.status).toBe(200);
    expect(geschrieben()).toMatchObject({ name: "Offboarding: Standard", questionnaireType: null });
  });

  it("auch ohne mitgeschickten Namen zaehlt der gespeicherte", async () => {
    gespeicherterName = "Offboarding: Standard";
    await patch({ questionnaireType: "BEAMTE" });
    expect(geschrieben().questionnaireType).toBeNull();
  });

  it("eine Onboarding-Vorlage behaelt ihren Fragebogentyp", async () => {
    await patch({ questionnaireType: "BEAMTE" });
    expect(geschrieben().questionnaireType).toBe("BEAMTE");
  });

  it("der Aktiv-Schalter allein aendert sonst nichts", async () => {
    await patch({ isActive: false });
    expect(geschrieben()).toEqual({ isActive: false });
  });

  it("kaputtes JSON ergibt 400 statt 500 – und schreibt nichts", async () => {
    const res = await antwort(await patch("{kaputt"));
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Ungültige Eingabe");
    expect(mockPrisma.checklistTemplate.update).not.toHaveBeenCalled();
  });

  it("Rolle und unbekannte Vorlage: 403 / 404", async () => {
    mockGetSession.mockResolvedValue(HR_SACHBEARBEITER);
    expect((await antwort(await patch({ isActive: false }))).status).toBe(403);
    mockGetSession.mockResolvedValue(SUPER_ADMIN);
    vorlageVorhanden = false;
    expect((await antwort(await patch({ isActive: false }))).status).toBe(404);
    expect(mockPrisma.checklistTemplate.update).not.toHaveBeenCalled();
  });
});

// =============================================
// Einzelne Punkte (/items) – die API bleibt, der Editor nutzt sie nicht mehr
// =============================================

describe("/api/checklisten/[id]/items", () => {
  it("POST prueft den Rumpf und schreibt den Hinweis mit", async () => {
    mockPrisma.checklistTemplateItem.findFirst.mockResolvedValue({ orderIndex: 4 });
    const res = await antwort(
      await PUNKT_ANLEGEN(
        anfrage("POST", punkt({ defaultAssignee: "DSB", defaultDueDays: 7, description: "Verpflichtung auf Vertraulichkeit" })),
        mitId(VORLAGE_ID),
      ),
    );
    expect(res.status).toBe(201);
    expect(mockPrisma.checklistTemplateItem.create).toHaveBeenCalledWith({
      data: {
        templateId: VORLAGE_ID,
        title: "IT-Konto anlegen",
        category: "Vor Arbeitsbeginn",
        orderIndex: 5,
        defaultDueDays: 7,
        defaultAssignee: "DSB",
        description: "Verpflichtung auf Vertraulichkeit",
      },
    });
  });

  it("POST weist Freitext ab, ohne die Vorlage zu laden", async () => {
    const res = await antwort(
      await PUNKT_ANLEGEN(anfrage("POST", punkt({ defaultAssignee: "Sekretariat" })), mitId(VORLAGE_ID)),
    );
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Sekretariat");
    expect(mockPrisma.checklistTemplateItem.create).not.toHaveBeenCalled();
  });

  it("PATCH ohne itemId ergibt 400, mit itemId aendert es nur die mitgeschickten Felder", async () => {
    const ohne = await antwort(await PUNKT_AENDERN(anfrage("PATCH", { title: "X" }), mitId(VORLAGE_ID)));
    expect(ohne.status).toBe(400);
    expect(ohne.body.error).toBe("itemId ist erforderlich");

    const res = await antwort(
      await PUNKT_AENDERN(anfrage("PATCH", { itemId: "i-1", description: "Neuer Hinweis", defaultDueDays: 0 }), mitId(VORLAGE_ID)),
    );
    expect(res.status).toBe(200);
    expect(mockPrisma.checklistTemplateItem.update).toHaveBeenCalledWith({
      where: { id: "i-1" },
      data: { defaultDueDays: 0, description: "Neuer Hinweis" },
    });
  });

  it("PATCH leert die Zustaendigkeit mit null", async () => {
    await PUNKT_AENDERN(anfrage("PATCH", { itemId: "i-1", defaultAssignee: "" }), mitId(VORLAGE_ID));
    expect(mockPrisma.checklistTemplateItem.update.mock.calls[0][0].data).toEqual({ defaultAssignee: null });
  });

  it("PATCH auf einen fremden Punkt ergibt 404", async () => {
    mockPrisma.checklistTemplateItem.findFirst.mockResolvedValue(null);
    const res = await antwort(await PUNKT_AENDERN(anfrage("PATCH", { itemId: "fremd", title: "X" }), mitId(VORLAGE_ID)));
    expect(res.status).toBe(404);
    expect(mockPrisma.checklistTemplateItem.update).not.toHaveBeenCalled();
  });
});

// =============================================
// prisma/seed.ts – Schluessel statt Freitext
//
// Die Migration ONBOARDING_ABTEILUNGSAUFGABEN_V1 laeuft VOR dem Seed und setzt
// auf einer leeren Datenbank nur ihren Merker. Stuende hier wieder Freitext,
// haette eine frische Installation erneut Zustaendigkeiten, die keinen Link
// bekommen koennen.
// =============================================

describe("prisma/seed.ts", () => {
  const seedText = fs.readFileSync(path.join(__dirname, "..", "..", "..", "prisma", "seed.ts"), "utf8");
  const zustaendigkeiten = [...seedText.matchAll(/defaultAssignee:\s*"([^"]*)"/g)].map((m) => m[1]);

  it("enthaelt ueberhaupt Zustaendigkeiten", () => {
    expect(zustaendigkeiten.length).toBeGreaterThan(20);
  });

  it("kennt nur bekannte Schluessel – kein Freitext mehr", () => {
    const bekannt = new Set<string>(Object.values(DEPARTMENT_KEYS));
    const unbekannt = [...new Set(zustaendigkeiten)].filter(
      (wert) => !ABTEILUNGS_SCHLUESSEL_MUSTER.test(wert) || !bekannt.has(wert),
    );
    expect(unbekannt).toEqual([]);
  });

  it("die Onboarding-Vorlagen nutzen IT, VERWALTUNG, VORGESETZTER, DSB und HR", () => {
    const genutzt = new Set(zustaendigkeiten);
    for (const key of ["IT", "VERWALTUNG", "VORGESETZTER", "DSB", "HR"]) {
      expect(genutzt.has(key)).toBe(true);
    }
  });

  it("jeder Punkt mit Zustaendigkeit hat auch eine Tagesangabe", () => {
    const tage = [...seedText.matchAll(/defaultDueDays:\s*-?\d+/g)].length;
    expect(tage).toBeGreaterThanOrEqual(zustaendigkeiten.length);
  });

  it("die IT-Punkte tragen einen Hinweis fuer die zustaendige Stelle", () => {
    expect(seedText).toContain("Konto in der Schulverwaltung und im Microsoft-365-Mandanten");
  });
});
