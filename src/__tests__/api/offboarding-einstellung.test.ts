/**
 * Tests: Einstellung zuordnen, Arbeitsort am Austritt (Ausstattung & Zugaenge,
 * Stufe 2 – Feinplan A4, S28: G11, G12, G23, G24, G26)
 *
 *   GET/POST /api/offboarding/[id]/einstellung  → src/lib/offboarding-ausgaben.ts
 *   GET /api/offboarding/[id]                   → Feld `rueckgaben` (nur HR_EDIT_ROLES)
 *
 * Die Routen laufen ECHT gegen eine kleine In-Memory-Datenbank in dieser Datei
 * (eigener `mockPrisma`, Feinplan Abschnitt 3: die Fake-DB der
 * Abteilungsaufgaben kennt Relationsfilter nicht). Sie versteht die bedingten
 * `updateMany` (Gleichheit, `null`, `notIn`, `not`), rollt eine Transaktion bei
 * einer Ausnahme zurueck wie Postgres und protokolliert die Reihenfolge der
 * Sperren (`invocationCallOrder`). Die Kandidatenabfrage (Relationsfilter
 * `austritte: { none }`, `personalData: { is }`) liefert eine im Test gesetzte
 * Liste; geprueft wird ihre Bedingung.
 *
 * Die Versandsperre ist die ECHTE aus src/lib/abteilungsaufgaben-dienst.ts:
 * Der Test haelt sie wie „Abteilungen informieren“ und prueft, dass die
 * Zuordnung sie danach wieder freigibt.
 *
 * Seit S29 uebernimmt die Zuordnung auch den Rueckgabe-Vorschlag; das prueft
 * src/__tests__/lib/offboarding-ausgaben.test.ts. Hier hat die Einstellung
 * keine Ausgaben – die Zuordnung legt also nichts an, und der Reiter traegt
 * die S29-Felder leer.
 */

const mockGetSession = jest.fn();
const mockCanAccessProcess = jest.fn();

type Zeile = Record<string, unknown>;

/** Der Stand der In-Memory-Datenbank. */
const stand: {
  austritte: Zeile[];
  einstellungen: Zeile[];
  links: Zeile[];
  orgs: Zeile[];
  audits: Zeile[];
} = { austritte: [], einstellungen: [], links: [], orgs: [], audits: [] };

function passt(z: Zeile, where: Record<string, unknown> = {}): boolean {
  for (const [k, b] of Object.entries(where)) {
    if (b === undefined) continue;
    if (b !== null && typeof b === "object" && !(b instanceof Date)) {
      const bed = b as Record<string, unknown>;
      if ("notIn" in bed) {
        if ((bed.notIn as unknown[]).includes(z[k])) return false;
        continue;
      }
      if ("in" in bed) {
        if (!(bed.in as unknown[]).includes(z[k])) return false;
        continue;
      }
      if ("not" in bed) {
        if ((z[k] ?? null) === bed.not) return false;
        continue;
      }
      throw new Error(`Test-DB versteht die Bedingung fuer ${k} nicht`);
    }
    if ((z[k] ?? null) !== b) return false;
  }
  return true;
}

function anwenden(z: Zeile, data: Zeile): void {
  for (const [k, v] of Object.entries(data)) z[k] = v;
}

const mockPrisma = {
  offboardingProcess: {
    findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
      const a = stand.austritte.find((x) => x.id === where.id);
      return a ? structuredClone(a) : null;
    }),
    updateMany: jest.fn(async ({ where, data }: { where: Zeile; data: Zeile }) => {
      const treffer = stand.austritte.filter((a) => passt(a, where));
      treffer.forEach((a) => anwenden(a, data));
      return { count: treffer.length };
    }),
    update: jest.fn(async ({ where, data }: { where: { id: string }; data: Zeile }) => {
      const a = stand.austritte.find((x) => x.id === where.id);
      if (!a) throw new Error("Austritt fehlt");
      anwenden(a, data);
      return structuredClone(a);
    }),
    count: jest.fn(async ({ where }: { where: Zeile }) => stand.austritte.filter((a) => passt(a, where)).length),
  },
  onboardingProcess: {
    findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
      const e = stand.einstellungen.find((x) => x.id === where.id);
      return e ? structuredClone(e) : null;
    }),
    // Relationsfilter kann die Test-DB nicht – die Liste setzt der Test.
    findMany: jest.fn<Promise<Zeile[]>, [{ where: Record<string, unknown>; take?: number }]>(async () => []),
    updateMany: jest.fn(async ({ where, data }: { where: Zeile; data: Zeile }) => {
      const treffer = stand.einstellungen.filter((e) => passt(e, where));
      treffer.forEach((e) => anwenden(e, data));
      return { count: treffer.length };
    }),
  },
  offboardingDepartmentLink: {
    findMany: jest.fn(async ({ where }: { where: Zeile }) => stand.links.filter((l) => passt(l, where))),
  },
  organization: {
    findMany: jest.fn(async ({ where }: { where: { id: { in: string[] } } }) =>
      stand.orgs.filter((o) => where.id.in.includes(o.id as string)),
    ),
  },
  // Bestand der Einstellung (bestandDerEinstellungLaden) – leer: Lage nach Merker
  onboardingAusstattung: { findMany: jest.fn(async () => []) },
  checklistItem: { findMany: jest.fn(async () => []) },
  onboardingAusstattungAufgabe: { findMany: jest.fn(async () => []) },
  ausgabe: { findMany: jest.fn(async () => []) },
  returnItem: { findMany: jest.fn(async () => []) },
  // Detailroute: Abteilungsuebersicht; „Abteilungen informieren“ (Versandsperre)
  departmentConfig: { findMany: jest.fn(async (): Promise<never[]> => []) },
  offboardingChecklistItem: { findMany: jest.fn(async () => []) },
  // Reiter „Rückgaben“ (S29): das Rueckgabeprotokoll des Austritts
  offboardingDocument: { findMany: jest.fn(async () => []) },
  webhookConfig: { count: jest.fn(async () => 0) },
  user: { findMany: jest.fn(async () => []) },
  userOrgAssignment: { findMany: jest.fn(async () => []), findUnique: jest.fn(async () => null) },
  auditLog: {
    create: jest.fn(async ({ data }: { data: Zeile }) => {
      stand.audits.push(data);
      return data;
    }),
  },
  // Wie Postgres: Eine Ausnahme rollt alles zurueck.
  $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>): Promise<unknown> => {
    const vorher = structuredClone(stand);
    try {
      return await fn(mockPrisma);
    } catch (err) {
      Object.assign(stand, vorher);
      throw err;
    }
  }),
};

jest.mock("@/lib/db", () => ({ prisma: mockPrisma }));
jest.mock("@/lib/auth", () => ({ getSession: () => mockGetSession() }));
jest.mock("@/lib/encryption", () => ({ decrypt: (v: string) => v, encrypt: (v: string) => v }));
jest.mock("@/lib/permissions", () => {
  const echt = jest.requireActual("@/lib/permissions");
  return { ...echt, canAccessProcess: (...a: unknown[]) => mockCanAccessProcess(...a) };
});

import { NextRequest } from "next/server";
import * as einstellungRoute from "@/app/api/offboarding/[id]/einstellung/route";
import { GET as vorgangLaden } from "@/app/api/offboarding/[id]/route";
import {
  abteilungsAktionAusfuehren,
  offboardingVersandBereich,
  versandSperreFreigeben,
  versandSperreNehmen,
} from "@/lib/abteilungsaufgaben-dienst";
import { MELDUNGEN } from "@/lib/abteilungsaufgaben";
import { AUSGABEN_AUDIT, LAGE_TEXTE, MELDUNGEN_AUSGABEN, arbeitsortText } from "@/lib/ausgaben";
import { HR_EDIT_ROLES, PORTAL_ROLES, type SessionPayload } from "@/lib/permissions";

// =============================================
// Testdaten
// =============================================

const A_ID = "off-a";
const B_ID = "off-b";
const E_ID = "onb-ogs";
const BASIS = "https://hr.example.org/api/offboarding";

const HR: SessionPayload = {
  userId: "u-hr",
  email: "hr@example.org",
  role: "HR_SACHBEARBEITER",
  firstName: "Erika",
  lastName: "Sachbearbeiter",
};

/** Ein Austritt, wie ihn Detailroute (include) und Dienst (select) lesen. */
function austritt(teil: Zeile = {}): Zeile {
  return {
    id: A_ID,
    displayId: "OFF-2027-FV-001",
    organizationId: "org-fv",
    arbeitsortId: null,
    status: "INITIATED",
    exitType: "KUENDIGUNG_ARBEITNEHMER",
    onboardingId: null,
    weitereBeschaeftigung: null,
    employeeFirstName: "Anna",
    employeeLastName: "Schmidt",
    employeeEmail: "a.schmidt@fes-minden.de",
    employeePrivateEmail: "anna.privat@example.org",
    lastWorkingDay: new Date("2027-07-31T00:00:00.000Z"),
    supervisorEmail: null,
    supervisorName: null,
    // include der Detailroute
    organization: { id: "org-fv", name: "Förderverein FES" },
    exitData: null,
    checklistItems: [],
    returnItems: [],
    documents: [],
    notes: [],
    departmentLinks: [],
    auditLogs: [],
    zeugnisBewertung: null,
    contractEnd: null,
    ...teil,
  };
}

/** Die Einstellung der OGS-Kraft: Foerderverein, Arbeitsort Grundschule. */
function einstellung(teil: Zeile = {}): Zeile {
  return {
    id: E_ID,
    displayId: "2026-FV-004",
    organizationId: "org-fv",
    arbeitsortId: "org-gs",
    processType: "EINSTELLUNG",
    status: "COMPLETED",
    email: "anna.privat@example.org",
    firstName: "Anna",
    lastName: "Schmidt",
    personalData: { emailPrivate: "anna.privat@example.org", firstName: "Anna", lastName: "Schmidt", birthName: null },
    supervisorData: { vertragsbeginn: new Date("2026-08-01T00:00:00.000Z"), ausgabenAngeboten: true },
    ...teil,
  };
}

function link(teil: Zeile = {}): Zeile {
  return { offboardingId: A_ID, departmentKey: "IT", sentAt: null, lastSentAt: null, ...teil };
}

const ctx = (id = A_ID) => ({ params: Promise.resolve({ id }) });

function lesen(query = "", id = A_ID) {
  return einstellungRoute.GET(new NextRequest(`${BASIS}/${id}/einstellung${query}`), ctx(id));
}

function senden(body: unknown, id = A_ID) {
  return einstellungRoute.POST(
    new NextRequest(`${BASIS}/${id}/einstellung`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    ctx(id),
  );
}

const zuordnen = (teil: Zeile = {}, id = A_ID) => senden({ aktion: "zuordnen", onboardingId: E_ID, ...teil }, id);

function austrittVon(id = A_ID): Zeile {
  const a = stand.austritte.find((x) => x.id === id);
  if (!a) throw new Error(`kein Austritt ${id}`);
  return a;
}

/** Nichts am Austritt, an der Einstellung und im Protokoll geschrieben. */
function nichtsGeschrieben() {
  expect(mockPrisma.offboardingProcess.updateMany).not.toHaveBeenCalled();
  expect(mockPrisma.offboardingProcess.update).not.toHaveBeenCalled();
  expect(mockPrisma.onboardingProcess.updateMany).not.toHaveBeenCalled();
  expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
}

beforeEach(() => {
  jest.clearAllMocks();
  stand.austritte = [austritt()];
  stand.einstellungen = [einstellung()];
  stand.links = [];
  stand.orgs = [
    { id: "org-fv", name: "Förderverein FES" },
    { id: "org-gs", name: "FES Grundschule" },
    { id: "org-gym", name: "FES Gymnasium" },
  ];
  stand.audits = [];
  mockGetSession.mockResolvedValue(HR);
  mockCanAccessProcess.mockResolvedValue(true);
  mockPrisma.onboardingProcess.findMany.mockResolvedValue([]);
});

// =============================================
// Rollen und Mandant (G23)
// =============================================

describe("Rollen und Mandant", () => {
  const NICHT_HR = [...PORTAL_ROLES.filter((r) => !HR_EDIT_ROLES.includes(r)), "SERVICE"];

  it.each(NICHT_HR)("%s: GET und POST /einstellung = 403, nichts gelesen oder geschrieben", async (role) => {
    mockGetSession.mockResolvedValue({ ...HR, role });
    for (const res of [await lesen(), await zuordnen()]) {
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: "Keine Berechtigung" });
    }
    expect(mockPrisma.offboardingProcess.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.onboardingProcess.findMany).not.toHaveBeenCalled();
    nichtsGeschrieben();
  });

  it("ohne Anmeldung 401", async () => {
    mockGetSession.mockResolvedValue(null);
    expect((await lesen()).status).toBe(401);
    expect((await zuordnen()).status).toBe(401);
  });

  it("Austritt fremd = dieselbe 404 wie unbekannt, nichts geschrieben", async () => {
    mockCanAccessProcess.mockImplementation(async (_s: unknown, org: string) => org !== "org-fv");
    for (const res of [await lesen(), await zuordnen()]) {
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "Vorgang nicht gefunden" });
    }
    mockCanAccessProcess.mockResolvedValue(true);
    for (const res of [await lesen("", "off-x"), await zuordnen({}, "off-x")]) {
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "Vorgang nicht gefunden" });
    }
    nichtsGeschrieben();
  });

  it("Einstellung unbekannt, fremd oder keine EINSTELLUNG = dieselbe 404 – beim Zuordnen und in der Vorschau", async () => {
    const faelle: [string, () => void][] = [
      ["unbekannt", () => (stand.einstellungen = [])],
      ["fremd", () => mockCanAccessProcess.mockImplementation(async (_s: unknown, org: string) => org !== "org-gym")],
      ["Verbeamtung", () => (stand.einstellungen = [einstellung({ processType: "VERBEAMTUNG" })])],
    ];
    for (const [fall, vorbereiten] of faelle) {
      stand.einstellungen = [einstellung({ organizationId: "org-gym" })];
      mockCanAccessProcess.mockResolvedValue(true);
      vorbereiten();
      for (const res of [await zuordnen(), await lesen(`?vorschau=${E_ID}`)]) {
        expect({ fall, status: res.status }).toEqual({ fall, status: 404 });
        expect(await res.json()).toEqual({ error: MELDUNGEN_AUSGABEN.EINSTELLUNG_NICHT_GEFUNDEN });
      }
    }
    nichtsGeschrieben();
  });

  it("kaputtes JSON = 400, unbekannte Aktion = 400; aktualisieren und ohne-vermerk (seit S29) ohne Zuordnung = 409 KEINE_ZUORDNUNG", async () => {
    const kaputt = await senden('{ "aktion": "zuord');
    expect(kaputt.status).toBe(400);
    expect(await kaputt.json()).toEqual({ error: MELDUNGEN.UNGUELTIGE_EINGABE });
    const unbekannt = await senden({ aktion: "trennen" });
    expect(unbekannt.status).toBe(400);
    expect(await unbekannt.json()).toEqual({ error: "Unbekannte Aktion." });
    for (const body of [{ aktion: "aktualisieren" }, { aktion: "ohne-vermerk", checklistItemIds: ["t-1"] }]) {
      const res = await senden(body);
      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({ error: MELDUNGEN_AUSGABEN.KEINE_ZUORDNUNG, grund: "KEINE_ZUORDNUNG" });
    }
    nichtsGeschrieben();
  });
});

// =============================================
// Vorschlaege und Suche (E-A31)
// =============================================

describe("GET /einstellung – Vorschläge, Suche, Vorschau", () => {
  it("Vorschläge mit Stufe und Begründung, ohne Adressen; Namen der Einrichtungen dabei", async () => {
    mockPrisma.onboardingProcess.findMany.mockResolvedValue([einstellung()]);
    const res = await lesen();
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toMatch(/@/);
    const { data } = JSON.parse(text);
    expect(data.zugeordnet).toBeNull();
    expect(data.zuordenbar).toBe(true);
    expect(data.weitereBeschaeftigung).toBe(false);
    expect(data.vorschlaege).toEqual([
      expect.objectContaining({
        onboardingId: E_ID,
        displayId: "2026-FV-004",
        name: "Anna Schmidt",
        stufe: "STARK",
        gruende: expect.arrayContaining([expect.objectContaining({ schluessel: "EMAIL" })]),
      }),
    ]);
    expect(data.treffer).toEqual([]);
    expect(data.einrichtungen).toEqual({ "org-fv": "Förderverein FES", "org-gs": "FES Grundschule" });
    expect(data).not.toHaveProperty("vorschau");
  });

  it("Kandidatenabfrage: nur EINSTELLUNG, nicht EXPIRED, nicht an einem anderen laufenden Austritt, Adresse oder Nachname, höchstens 50", async () => {
    await lesen();
    const { where, take } = mockPrisma.onboardingProcess.findMany.mock.calls[0][0];
    expect(take).toBe(50);
    expect(where).toMatchObject({
      processType: "EINSTELLUNG",
      status: { notIn: ["EXPIRED"] },
      austritte: { none: { id: { not: A_ID }, status: { notIn: ["COMPLETED", "CANCELLED"] } } },
    });
    // HR_EDIT_ROLES sehen alle Mandanten – kein Einrichtungsfilter
    expect(where).not.toHaveProperty("organizationId");
    const ohneGross = { mode: "insensitive" };
    expect(where.OR).toEqual(
      expect.arrayContaining([
        { email: { equals: "a.schmidt@fes-minden.de", ...ohneGross } },
        { personalData: { is: { emailPrivate: { equals: "anna.privat@example.org", ...ohneGross } } } },
        { lastName: { equals: "Schmidt", ...ohneGross } },
        { personalData: { is: { birthName: { equals: "Schmidt", ...ohneGross } } } },
      ]),
    );
  });

  it("Suche erst ab 3 Zeichen (400 darunter); Treffer ohne Stufe und ohne Adressen", async () => {
    const kurz = await lesen("?q=Sc");
    expect(kurz.status).toBe(400);
    expect(await kurz.json()).toEqual({ error: MELDUNGEN_AUSGABEN.SUCHE_ZU_KURZ });

    mockPrisma.onboardingProcess.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([einstellung()]);
    const res = await lesen("?q=2026-FV");
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toMatch(/@/);
    const { data } = JSON.parse(text);
    expect(data.vorschlaege).toEqual([]);
    expect(data.treffer).toEqual([expect.objectContaining({ onboardingId: E_ID, name: "Anna Schmidt" })]);
    expect(data.treffer[0]).not.toHaveProperty("stufe");
    const suche = mockPrisma.onboardingProcess.findMany.mock.calls[1][0];
    expect(suche.take).toBe(20);
    expect(suche.where.OR).toEqual(
      expect.arrayContaining([{ displayId: { contains: "2026-FV", mode: "insensitive" } }]),
    );
  });

  it("zugeordnet bzw. abgeschlossen: keine Vorschläge, keine Kandidatenabfrage", async () => {
    stand.austritte = [austritt({ onboardingId: E_ID, weitereBeschaeftigung: true })];
    let { data } = await (await lesen("?q=Schmidt")).json();
    expect(data).toMatchObject({ zuordenbar: false, vorschlaege: [], treffer: [], weitereBeschaeftigung: true });
    expect(data.zugeordnet).toMatchObject({ onboardingId: E_ID, name: "Anna Schmidt" });

    stand.austritte = [austritt({ status: "COMPLETED" })];
    ({ data } = await (await lesen()).json());
    expect(data).toMatchObject({ zuordenbar: false, zugeordnet: null, vorschlaege: [] });
    expect(mockPrisma.onboardingProcess.findMany).not.toHaveBeenCalled();
  });

  it("Vorschau: Arbeitsort-Satz, Lage und kein Sperrgrund; bei Versetzung ist der Merker vorbelegt", async () => {
    stand.austritte = [austritt({ exitType: "VERSETZUNG" })];
    const { data } = await (await lesen(`?vorschau=${E_ID}`)).json();
    expect(data.weitereBeschaeftigung).toBe(true);
    expect(data.vorschau).toMatchObject({
      einstellung: { onboardingId: E_ID, arbeitsortId: "org-gs" },
      stufe: "STARK",
      arbeitsort: { grund: "UEBERNOMMEN", text: arbeitsortText("UEBERNOMMEN", "FES Grundschule") },
      lage: "NICHTS_AUSGEGEBEN",
      sperrGrund: null,
    });
    expect(JSON.stringify(data)).not.toMatch(/@/);
    nichtsGeschrieben();
  });

  it("Vorschau nennt den Grund, aus dem Zuordnen scheitern wird (abgesagt, vergeben, Stelle informiert)", async () => {
    stand.einstellungen = [einstellung({ status: "EXPIRED" })];
    let { data } = await (await lesen(`?vorschau=${E_ID}`)).json();
    expect(data.vorschau.sperrGrund).toBe(MELDUNGEN_AUSGABEN.EINSTELLUNG_ABGESAGT);

    stand.einstellungen = [einstellung()];
    stand.austritte.push(austritt({ id: B_ID, onboardingId: E_ID, status: "HANDOVER_PHASE" }));
    stand.links = [link({ sentAt: new Date("2027-07-01T08:00:00Z") })];
    ({ data } = await (await lesen(`?vorschau=${E_ID}`)).json());
    expect(data.vorschau.sperrGrund).toBe(MELDUNGEN_AUSGABEN.EINSTELLUNG_VERGEBEN);
    expect(data.vorschau.arbeitsort.grund).toBe("STELLE_INFORMIERT");
  });
});

// =============================================
// Zuordnen (G11, G12, G24, G26)
// =============================================

describe("POST /einstellung – zuordnen", () => {
  it("schreibt bedingt Bezug, Merker und Arbeitsort; Antwort ist der Reiter samt Meldung", async () => {
    const res = await zuordnen();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.meldung).toBe("Einstellung 2026-FV-004 zugeordnet. Arbeitsort FES Grundschule übernommen.");
    expect(body.data).toMatchObject({
      einstellung: { onboardingId: E_ID, displayId: "2026-FV-004" },
      weitereBeschaeftigung: false,
      arbeitsort: { id: "org-gs", name: "FES Grundschule" },
      lage: "NICHTS_AUSGEGEBEN",
      zuordnungEmpfohlen: false,
      aktionen: { zuordnen: false, loesen: true },
    });
    expect(JSON.stringify(body)).not.toMatch(/@/);

    // bedingt: nur ohne Zuordnung und nur laufend
    expect(mockPrisma.offboardingProcess.updateMany).toHaveBeenCalledWith({
      where: { id: A_ID, onboardingId: null, status: { notIn: ["COMPLETED", "CANCELLED"] } },
      data: { onboardingId: E_ID, weitereBeschaeftigung: false },
    });
    expect(austrittVon()).toMatchObject({
      onboardingId: E_ID,
      weitereBeschaeftigung: false,
      arbeitsortId: "org-gs",
      // Mandant bleibt die Einrichtung
      organizationId: "org-fv",
    });
  });

  it("zweites Zuordnen = 409 BEREITS_ZUGEORDNET, nichts geaendert", async () => {
    expect((await zuordnen()).status).toBe(200);
    jest.clearAllMocks();
    const zweite = await zuordnen();
    expect(zweite.status).toBe(409);
    expect(await zweite.json()).toEqual({ error: MELDUNGEN_AUSGABEN.BEREITS_ZUGEORDNET, grund: "BEREITS_ZUGEORDNET" });
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
    expect(mockPrisma.onboardingProcess.updateMany).not.toHaveBeenCalled();
  });

  it.each(["COMPLETED", "CANCELLED"])("Austritt %s = 409 VORGANG_ABGESCHLOSSEN, nichts geschrieben", async (status) => {
    stand.austritte = [austritt({ status })];
    const res = await zuordnen();
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: MELDUNGEN_AUSGABEN.VORGANG_ABGESCHLOSSEN, grund: "VORGANG_ABGESCHLOSSEN" });
    expect(austrittVon().onboardingId).toBeNull();
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("Einstellung an einem laufenden Austritt A: für B 409 EINSTELLUNG_VERGEBEN (Rollback); nach COMPLETED bzw. CANCELLED von A wählbar", async () => {
    stand.austritte = [austritt(), austritt({ id: B_ID, displayId: "OFF-2027-FV-002" })];
    expect((await zuordnen({}, A_ID)).status).toBe(200);

    const b = await zuordnen({}, B_ID);
    expect(b.status).toBe(409);
    expect(await b.json()).toEqual({ error: MELDUNGEN_AUSGABEN.EINSTELLUNG_VERGEBEN, grund: "EINSTELLUNG_VERGEBEN" });
    // Rollback: B traegt die Einstellung nicht, das Protokoll hat nur A
    expect(austrittVon(B_ID).onboardingId).toBeNull();
    expect(stand.audits).toHaveLength(1);

    for (const endstatus of ["COMPLETED", "CANCELLED"]) {
      austrittVon(A_ID).status = endstatus;
      austrittVon(B_ID).onboardingId = null;
      const res = await zuordnen({}, B_ID);
      expect({ endstatus, status: res.status }).toEqual({ endstatus, status: 200 });
      expect(austrittVon(B_ID).onboardingId).toBe(E_ID);
    }
  });

  it("abgesagte Einstellung (EXPIRED) per onboardingId im Body = 409 EINSTELLUNG_ABGESAGT – auch ohne Kandidatenliste", async () => {
    stand.einstellungen = [einstellung({ status: "EXPIRED" })];
    const res = await zuordnen();
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: MELDUNGEN_AUSGABEN.EINSTELLUNG_ABGESAGT, grund: "EINSTELLUNG_ABGESAGT" });
    expect(mockPrisma.onboardingProcess.findMany).not.toHaveBeenCalled();
    // Der Austritt war schon gesperrt und beschrieben – die Transaktion rollte zurueck.
    expect(mockPrisma.offboardingProcess.updateMany).toHaveBeenCalled();
    expect(austrittVon()).toMatchObject({ onboardingId: null, weitereBeschaeftigung: null, arbeitsortId: null });
    expect(stand.audits).toHaveLength(0);
  });

  it("Sperrreihenfolge (G24): erst der Austritt, dann die Einstellung (auch COMPLETED zugelassen)", async () => {
    await zuordnen();
    const austrittSperre = mockPrisma.offboardingProcess.updateMany.mock.invocationCallOrder[0];
    const einstellungSperre = mockPrisma.onboardingProcess.updateMany.mock.invocationCallOrder[0];
    expect(austrittSperre).toBeLessThan(einstellungSperre);
    expect(mockPrisma.onboardingProcess.updateMany).toHaveBeenCalledWith({
      where: { id: E_ID, status: { notIn: ["EXPIRED"] } },
      data: { updatedAt: expect.any(Date) },
    });
    // gezaehlt wird unter beiden Sperren
    const zaehlen = mockPrisma.offboardingProcess.count.mock.invocationCallOrder[0];
    expect(einstellungSperre).toBeLessThan(zaehlen);
  });

  it("waehrend „Abteilungen informieren“ laeuft: 409 VERSAND_LAEUFT, nichts geschrieben; danach wieder zuordenbar", async () => {
    // „Abteilungen informieren“ haelt die Sperre, solange es die Einstellungen
    // der Abteilungen laedt – genau dort bleibt der Aufruf haengen.
    let weiter: () => void = () => undefined;
    mockPrisma.departmentConfig.findMany.mockImplementationOnce(
      () => new Promise<never[]>((r) => (weiter = () => r([]))),
    );
    const informieren = abteilungsAktionAusfuehren({ offboardingId: A_ID, rohBody: undefined, session: HR });
    while (mockPrisma.departmentConfig.findMany.mock.calls.length === 0) {
      await new Promise((r) => setImmediate(r));
    }

    const res = await zuordnen();
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: MELDUNGEN.VERSAND_LAEUFT, grund: "VERSAND_LAEUFT" });
    nichtsGeschrieben();

    weiter();
    await informieren;
    expect((await zuordnen()).status).toBe(200);
    expect(austrittVon().onboardingId).toBe(E_ID);
  });

  it("die Sperre ist dieselbe wie die des Versands und wird nach Erfolg und Abweisung freigegeben (auch beim Loesen)", async () => {
    const bereich = offboardingVersandBereich(A_ID);
    // derselbe Schluessel wie offboardingVersandModul und der taegliche Lauf
    expect(bereich).toEqual({ modul: "OFFBOARDING", vorgangId: A_ID });
    expect(versandSperreNehmen(bereich)).toBe(true);
    try {
      stand.austritte = [austritt({ onboardingId: E_ID })];
      const loesen = await senden({ aktion: "loesen" });
      expect(loesen.status).toBe(409);
      expect(await loesen.json()).toEqual({ error: MELDUNGEN.VERSAND_LAEUFT, grund: "VERSAND_LAEUFT" });
      nichtsGeschrieben();
    } finally {
      versandSperreFreigeben(bereich);
    }

    stand.austritte = [austritt()];
    expect((await zuordnen()).status).toBe(200);
    expect(versandSperreNehmen(bereich)).toBe(true);
    versandSperreFreigeben(bereich);
    // zweites Zuordnen scheitert in der Transaktion – die Sperre ist trotzdem frei
    expect((await zuordnen()).status).toBe(409);
    expect(versandSperreNehmen(bereich)).toBe(true);
    versandSperreFreigeben(bereich);
  });

  describe("Arbeitsort (G12)", () => {
    it("Stelle schon informiert (sentAt bzw. nur lastSentAt): Arbeitsort bleibt leer, Meldung ohne Arbeitsort", async () => {
      for (const l of [link({ sentAt: new Date("2027-07-01T08:00:00Z") }), link({ lastSentAt: new Date("2027-07-01T08:00:00Z") })]) {
        stand.austritte = [austritt()];
        stand.links = [l];
        const res = await zuordnen();
        expect(res.status).toBe(200);
        expect((await res.json()).meldung).toBe("Einstellung 2026-FV-004 zugeordnet.");
        expect(austrittVon()).toMatchObject({ onboardingId: E_ID, arbeitsortId: null });
        expect(stand.audits[stand.audits.length - 1]).toMatchObject({ details: { arbeitsortUebernommen: false } });
      }
      expect(mockPrisma.offboardingProcess.update).not.toHaveBeenCalled();
    });

    it("nie zugestellter Link (FAILED) haelt die Uebernahme nicht auf", async () => {
      stand.links = [link({ sentAt: null, lastSentAt: null })];
      expect((await zuordnen()).status).toBe(200);
      expect(austrittVon().arbeitsortId).toBe("org-gs");
    });

    it("Einstellung an einer anderen Einrichtung als der Austritt: Arbeitsort nie übernommen", async () => {
      stand.austritte = [austritt({ organizationId: "org-gym", organization: { id: "org-gym", name: "FES Gymnasium" } })];
      expect((await zuordnen()).status).toBe(200);
      expect(austrittVon()).toMatchObject({ onboardingId: E_ID, arbeitsortId: null, organizationId: "org-gym" });
    });

    it("Einstellung ohne Arbeitsort: nichts übernommen", async () => {
      stand.einstellungen = [einstellung({ arbeitsortId: null })];
      expect((await zuordnen()).status).toBe(200);
      expect(austrittVon().arbeitsortId).toBeNull();
      expect(mockPrisma.offboardingProcess.update).not.toHaveBeenCalled();
    });
  });

  it("Merker weitereBeschaeftigung: Vorbelegung bei VERSETZUNG, sonst nein; ein Wert im Body gilt", async () => {
    const faelle: [string, boolean | undefined, boolean][] = [
      ["VERSETZUNG", undefined, true],
      ["KUENDIGUNG_ARBEITNEHMER", undefined, false],
      ["VERSETZUNG", false, false],
      ["RENTE_PENSION", true, true],
    ];
    for (const [exitType, wert, erwartet] of faelle) {
      stand.austritte = [austritt({ exitType })];
      const res = await zuordnen(wert === undefined ? {} : { weitereBeschaeftigung: wert });
      expect(res.status).toBe(200);
      expect({ exitType, wert, gespeichert: austrittVon().weitereBeschaeftigung }).toEqual({ exitType, wert, gespeichert: erwartet });
    }
  });

  it("Protokoll im selben Commit: beide IDs, Stufe und Begründungsschlüssel, Merker als Boolean – ohne Namen und Adressen", async () => {
    await zuordnen();
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(stand.audits).toHaveLength(1);
    const eintrag = stand.audits[0];
    expect(eintrag).toEqual({
      userId: HR.userId,
      offboardingId: A_ID,
      onboardingId: E_ID,
      processType: "OFFBOARDING",
      action: AUSGABEN_AUDIT.EINSTELLUNG_ZUGEORDNET,
      details: { stufe: "STARK", gruende: ["EMAIL", "NAME", "EINRICHTUNG"], arbeitsortUebernommen: true, weitereBeschaeftigung: false },
    });
    expect(JSON.stringify(eintrag)).not.toMatch(/Anna|Schmidt|@/);
  });

  it("Treffer der Suche ohne Begründung: Stufe null, leere Gründe im Protokoll", async () => {
    stand.einstellungen = [einstellung({ email: "andere@example.org", personalData: null, firstName: "Berta", lastName: "Meier" })];
    expect((await zuordnen()).status).toBe(200);
    expect(stand.audits[0].details).toMatchObject({ stufe: null, gruende: [] });
  });
});

// =============================================
// Loesen (G11, G12)
// =============================================

describe("POST /einstellung – loesen", () => {
  beforeEach(() => {
    stand.austritte = [austritt({ onboardingId: E_ID, weitereBeschaeftigung: true, arbeitsortId: "org-gs" })];
  });

  it("setzt Bezug, Merker und Arbeitsort zurück (keine Stelle informiert), Protokoll mit Anzahlen", async () => {
    const res = await senden({ aktion: "loesen" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.meldung).toBe("Zuordnung der Einstellung 2026-FV-004 gelöst. Der Arbeitsort am Austritt ist wieder leer.");
    expect(body.data).toMatchObject({ einstellung: null, lage: "KEINE_EINSTELLUNG", arbeitsort: null });
    expect(austrittVon()).toMatchObject({ onboardingId: null, weitereBeschaeftigung: null, arbeitsortId: null });
    // bedingt auf die gelesene Einstellung
    expect(mockPrisma.offboardingProcess.updateMany).toHaveBeenCalledWith({
      where: { id: A_ID, onboardingId: E_ID, status: { notIn: ["COMPLETED", "CANCELLED"] } },
      data: { updatedAt: expect.any(Date) },
    });
    expect(stand.audits).toEqual([
      {
        userId: HR.userId,
        offboardingId: A_ID,
        onboardingId: E_ID,
        processType: "OFFBOARDING",
        action: AUSGABEN_AUDIT.EINSTELLUNG_GELOEST,
        details: { geloeschteAufgaben: 0, geloeschteRueckgaben: 0, informierteStellen: 0, arbeitsortZurueckgesetzt: true },
      },
    ]);
  });

  it("Stelle schon informiert: Arbeitsort bleibt, Bezug und Merker gehen", async () => {
    stand.links = [link({ sentAt: new Date("2027-07-01T08:00:00Z") }), link({ departmentKey: "FACILITY" })];
    const res = await senden({ aktion: "loesen" });
    expect(res.status).toBe(200);
    expect((await res.json()).meldung).toContain("Arbeitsort am Austritt bleibt");
    expect(austrittVon()).toMatchObject({ onboardingId: null, weitereBeschaeftigung: null, arbeitsortId: "org-gs" });
    expect(stand.audits[0].details).toMatchObject({ informierteStellen: 1, arbeitsortZurueckgesetzt: false });
  });

  it("ohne Zuordnung 409 KEINE_ZUORDNUNG; abgeschlossen 409 VORGANG_ABGESCHLOSSEN; inzwischen geändert 409", async () => {
    stand.austritte = [austritt()];
    let res = await senden({ aktion: "loesen" });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: MELDUNGEN_AUSGABEN.KEINE_ZUORDNUNG, grund: "KEINE_ZUORDNUNG" });

    stand.austritte = [austritt({ onboardingId: E_ID, status: "COMPLETED" })];
    res = await senden({ aktion: "loesen" });
    expect(res.status).toBe(409);
    expect((await res.json()).grund).toBe("VORGANG_ABGESCHLOSSEN");
    expect(austrittVon().onboardingId).toBe(E_ID);

    // Zwischen Lesen und Sperre ordnet jemand anderes neu zu.
    stand.austritte = [austritt({ onboardingId: E_ID })];
    mockPrisma.offboardingProcess.findUnique.mockImplementationOnce(async () => structuredClone(austritt({ onboardingId: "onb-alt" })));
    res = await senden({ aktion: "loesen" });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: MELDUNGEN_AUSGABEN.INZWISCHEN_GEAENDERT, grund: "INZWISCHEN_GEAENDERT" });
    expect(austrittVon().onboardingId).toBe(E_ID);
    expect(stand.audits).toHaveLength(0);
  });

  it("nach dem Lösen wieder zuordenbar", async () => {
    expect((await senden({ aktion: "loesen" })).status).toBe(200);
    expect((await zuordnen()).status).toBe(200);
    expect(austrittVon().onboardingId).toBe(E_ID);
  });
});

// =============================================
// Detailroute: Feld `rueckgaben` (G12, G23)
// =============================================

describe("GET /api/offboarding/[id] – rueckgaben", () => {
  const laden = () => vorgangLaden(new NextRequest(`${BASIS}/${A_ID}`), ctx());

  it.each(["EINRICHTUNGSLEITUNG", "VORGESETZTER"])(
    "%s: rueckgaben === null, ohne Ausgaben, Rückgaben oder Kandidaten abzufragen",
    async (role) => {
      mockGetSession.mockResolvedValue({ ...HR, role });
      stand.austritte = [austritt({ onboardingId: E_ID })];
      const res = await laden();
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.rueckgaben).toBeNull();
      expect(mockPrisma.onboardingProcess.findMany).not.toHaveBeenCalled();
      expect(mockPrisma.onboardingProcess.findUnique).not.toHaveBeenCalled();
      expect(mockPrisma.ausgabe.findMany).not.toHaveBeenCalled();
      expect(mockPrisma.returnItem.findMany).not.toHaveBeenCalled();
      expect(mockPrisma.organization.findMany).not.toHaveBeenCalled();
    },
  );

  it("HR ohne Zuordnung, laufend, starker Vorschlag: KEINE_EINSTELLUNG und zuordnungEmpfohlen", async () => {
    mockPrisma.onboardingProcess.findMany.mockResolvedValue([einstellung()]);
    const body = await (await laden()).json();
    expect(body.rueckgaben).toEqual({
      einstellung: null,
      weitereBeschaeftigung: null,
      arbeitsort: null,
      einrichtungen: {},
      lage: "KEINE_EINSTELLUNG",
      text: LAGE_TEXTE.KEINE_EINSTELLUNG({ nr: "", gegenstaende: 0, zugaenge: 0, ohneVermerk: 0 }),
      zusatz: null,
      gedaechtnisstuetze: expect.any(String),
      zuordnungEmpfohlen: true,
      aktionen: { zuordnen: true, loesen: false, aktualisieren: false, ohneVermerk: false },
      // S29: Tabelle, Sperraufgaben, Vorschlag, Lösen, Stepper und Protokoll – ohne Einstellung leer
      zeilen: [],
      sperraufgaben: [],
      vorschlag: { rueckgaben: [], sperraufgaben: [], hinweisZentral: [], hinweisAndereEinrichtung: [], schonImAustritt: [] },
      ohneVermerk: [],
      loesen: null,
      offen: [],
      schritt: { erledigt: true, text: LAGE_TEXTE.KEINE_EINSTELLUNG({ nr: "", gegenstaende: 0, zugaenge: 0, ohneVermerk: 0 }) },
      fortschritt: { erledigt: 0, gesamt: 0 },
      merkerWechsel: null,
      protokoll: { art: "RUECKGABE", noetig: false, hochgeladenAm: null, text: null },
    });
  });

  it("zuordnungEmpfohlen nur mit STARK/MITTEL, nur laufend und nur ohne Zuordnung", async () => {
    // nur schwach: gleicher Nachname an derselben Einrichtung
    mockPrisma.onboardingProcess.findMany.mockResolvedValue([
      einstellung({ email: "x@example.org", personalData: null, firstName: "Berta" }),
    ]);
    expect((await (await laden()).json()).rueckgaben.zuordnungEmpfohlen).toBe(false);

    mockPrisma.onboardingProcess.findMany.mockResolvedValue([einstellung()]);
    stand.austritte = [austritt({ status: "COMPLETED" })];
    expect((await (await laden()).json()).rueckgaben.zuordnungEmpfohlen).toBe(false);

    stand.austritte = [austritt({ onboardingId: E_ID })];
    const r = (await (await laden()).json()).rueckgaben;
    expect(r.zuordnungEmpfohlen).toBe(false);
    expect(r).toMatchObject({ einstellung: { onboardingId: E_ID }, lage: "NICHTS_AUSGEGEBEN", aktionen: { zuordnen: false, loesen: true } });
  });

  it("zugeordnet mit Arbeitsort: Namen der Einrichtungen und Arbeitsort am Austritt, ohne Adressen", async () => {
    stand.austritte = [austritt({ onboardingId: E_ID, arbeitsortId: "org-gs", weitereBeschaeftigung: false })];
    const r = (await (await laden()).json()).rueckgaben;
    expect(r).toMatchObject({
      arbeitsort: { id: "org-gs", name: "FES Grundschule" },
      einrichtungen: { "org-fv": "Förderverein FES", "org-gs": "FES Grundschule" },
      weitereBeschaeftigung: false,
    });
    expect(JSON.stringify(r)).not.toMatch(/@/);
  });
});
