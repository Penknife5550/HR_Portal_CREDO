/**
 * Tests: Katalog lesen je Vorgang (src/lib/ausstattung-katalog.ts)
 *
 * `katalogAusschnittLaden` (gebaut mit S3, gebraucht ab S7/S8): die
 * Positionen, die EIN Vorgang anbietet — gefiltert am WIRKSAMEN Arbeitsort
 * (E-A10), nicht an der Einrichtung des Vorgangs: Einrichtungsart, eigene
 * Positionen, Ausblendung und Adresse der Stelle kommen alle vom Arbeitsort.
 * Eigener `mockPrisma` (als `db` uebergeben), weil die Routen-Tests
 * (supervisor-link.test.ts) beide Funktionen nur mocken.
 *
 * `ausstattungAngebotenIn` (S7): der Merker `mitAusstattung`, den die beiden
 * Link-Wege in ihrer Transaktion setzen (Regel 2) — dieselben Faelle am
 * Arbeitsort ≠ Einrichtung, jeweils als Ja/Nein.
 */

jest.mock("@/lib/db", () => ({ prisma: {} }));

import {
  ausstattungAngebotenIn,
  katalogAusschnittLaden,
  type AusschnittVorgang,
} from "@/lib/ausstattung-katalog";
import type { Prisma } from "@prisma/client";

const GYM = "org-gym";
const KITA = "org-kita";

function position(teil: Record<string, unknown> = {}) {
  return {
    id: "pos-1",
    departmentKey: "IT",
    organizationId: null,
    einrichtungsarten: [] as string[],
    art: "JA_NEIN",
    angabeSchluessel: null,
    bezeichnung: "Dienst-iPad (Lernmittel)",
    hinweisFuehrungskraft: null,
    hinweisStelle: null,
    optionen: [] as string[],
    vorausgewaehlt: false,
    vorausgewaehlteOptionen: [] as string[],
    bemerkungAnbieten: true,
    bemerkungPlatzhalter: null,
    aufgabeTitel: null,
    defaultDueDays: -5,
    personengruppen: [] as string[],
    sichtbarFuer: [] as string[],
    entgeltrelevant: false,
    ausgabeKennung: null,
    rueckgabeKategorie: null,
    beiAustritt: null,
    vorschlagSchluessel: null,
    isActive: true,
    orderIndex: 0,
    ...teil,
  };
}

function konfig(teil: Record<string, unknown>) {
  return {
    departmentKey: "IT",
    departmentName: "IT-Support FES",
    email: "it@credo.de",
    organizationId: null,
    isActive: true,
    ...teil,
  };
}

const mockDb = {
  ausstattungsPosition: { findMany: jest.fn() },
  organization: { findUnique: jest.fn() },
  ausstattungsAusblendung: { findMany: jest.fn() },
  departmentConfig: { findMany: jest.fn() },
};
const db = mockDb as unknown as Prisma.TransactionClient;

/** Vorgang an der Einrichtung GYM, Arbeitsort Kita. */
const AM_KITA: AusschnittVorgang = {
  organizationId: GYM,
  arbeitsortId: KITA,
  questionnaireType: "STANDARD",
  processType: "EINSTELLUNG",
};

const ARTEN: Record<string, string> = { [GYM]: "GYMNASIUM", [KITA]: "KITA" };

beforeEach(() => {
  jest.clearAllMocks();
  mockDb.ausstattungsPosition.findMany.mockResolvedValue([]);
  mockDb.organization.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) =>
    ARTEN[where.id] ? { type: ARTEN[where.id] } : null,
  );
  mockDb.ausstattungsAusblendung.findMany.mockResolvedValue([]);
  mockDb.departmentConfig.findMany.mockResolvedValue([konfig({}), konfig({ departmentKey: "FACILITY", departmentName: "Hausmeister" })]);
});

const ids = (a: { positionen: { id: string }[] }) => a.positionen.map((p) => p.id);

describe("katalogAusschnittLaden", () => {
  it("liest nur aktive Positionen; ohne Position bleibt es bei dieser einen Abfrage", async () => {
    const ausschnitt = await katalogAusschnittLaden(db, AM_KITA);
    expect(ausschnitt).toEqual({ arbeitsortId: KITA, positionen: [], stellenNamen: {} });
    expect(mockDb.ausstattungsPosition.findMany).toHaveBeenCalledWith({ where: { isActive: true } });
    expect(mockDb.organization.findUnique).not.toHaveBeenCalled();
    expect(mockDb.departmentConfig.findMany).not.toHaveBeenCalled();
  });

  it("ausserhalb von EINSTELLUNG leer — ohne jede Abfrage", async () => {
    mockDb.ausstattungsPosition.findMany.mockResolvedValue([position()]);
    const ausschnitt = await katalogAusschnittLaden(db, { ...AM_KITA, processType: "VERTRAGSAENDERUNG" });
    expect(ausschnitt.positionen).toEqual([]);
    expect(mockDb.ausstattungsPosition.findMany).not.toHaveBeenCalled();
  });

  it("die Einrichtungsart kommt vom Arbeitsort, nicht von der Einrichtung des Vorgangs", async () => {
    mockDb.ausstattungsPosition.findMany.mockResolvedValue([
      position({ id: "nur-kita", einrichtungsarten: ["KITA"] }),
      position({ id: "nur-gym", einrichtungsarten: ["GYMNASIUM"] }),
      position({ id: "alle" }),
    ]);
    expect(ids(await katalogAusschnittLaden(db, AM_KITA))).toEqual(["nur-kita", "alle"]);
    expect(mockDb.organization.findUnique).toHaveBeenCalledWith({ where: { id: KITA }, select: { type: true } });
  });

  it("eigene Positionen des Arbeitsorts ja, die der Einrichtung des Vorgangs nein", async () => {
    mockDb.ausstattungsPosition.findMany.mockResolvedValue([
      position({ id: "eigene-kita", organizationId: KITA }),
      position({ id: "eigene-gym", organizationId: GYM }),
    ]);
    expect(ids(await katalogAusschnittLaden(db, AM_KITA))).toEqual(["eigene-kita"]);
  });

  it("die Ausblendung am Arbeitsort wirkt, die an der Einrichtung nicht", async () => {
    mockDb.ausstattungsPosition.findMany.mockResolvedValue([position({ id: "a" }), position({ id: "b" })]);
    // Abgefragt werden nur die Ausblendungen des Arbeitsorts.
    mockDb.ausstattungsAusblendung.findMany.mockResolvedValue([{ positionId: "a", organizationId: KITA }]);
    expect(ids(await katalogAusschnittLaden(db, AM_KITA))).toEqual(["b"]);
    expect(mockDb.ausstattungsAusblendung.findMany).toHaveBeenCalledWith({
      where: { organizationId: KITA },
      select: { positionId: true, organizationId: true },
    });
  });

  it("die Adresse der Stelle wird am Arbeitsort aufgeloest: ohne Adresse dort fehlt die Position, HR nie", async () => {
    mockDb.ausstattungsPosition.findMany.mockResolvedValue([
      position({ id: "spind", departmentKey: "FACILITY", bezeichnung: "Spind" }),
      position({ id: "jobticket", departmentKey: "HR", bezeichnung: "Jobticket", entgeltrelevant: true }),
      position({ id: "ipad" }),
    ]);
    // FACILITY nur fuer das Gymnasium (Einrichtung des Vorgangs), nicht fuer die Kita (Arbeitsort).
    mockDb.departmentConfig.findMany.mockResolvedValue([
      konfig({}),
      konfig({ departmentKey: "FACILITY", departmentName: "Hausmeister GYM", organizationId: GYM }),
    ]);
    expect(ids(await katalogAusschnittLaden(db, AM_KITA))).toEqual(["ipad", "jobticket"]);
    // Ohne abweichenden Arbeitsort gilt die Einrichtung: dort hat FACILITY eine Adresse.
    expect(ids(await katalogAusschnittLaden(db, { ...AM_KITA, arbeitsortId: null }))).toEqual([
      "ipad",
      "spind",
      "jobticket",
    ]);
  });

  it("Personengruppe filtert; Stellennamen am Arbeitsort, auch fuer „Sichtbar für“", async () => {
    mockDb.ausstattungsPosition.findMany.mockResolvedValue([
      position({ id: "beamte", personengruppen: ["BEAMTE"] }),
      position({
        id: "faecher",
        departmentKey: "FACILITY",
        art: "ANGABE",
        angabeSchluessel: "UNTERRICHTSFAECHER",
        bezeichnung: "Unterrichtsfächer",
        bemerkungAnbieten: false,
        defaultDueDays: null,
        sichtbarFuer: ["IT"],
      }),
      position({ id: "jobticket", departmentKey: "HR", bezeichnung: "Jobticket" }),
    ]);
    mockDb.departmentConfig.findMany.mockResolvedValue([
      konfig({}),
      konfig({ departmentKey: "IT", departmentName: "IT Kita", organizationId: KITA }),
      konfig({ departmentKey: "FACILITY", departmentName: "Hausmeister Kita", organizationId: KITA }),
    ]);
    const ausschnitt = await katalogAusschnittLaden(db, AM_KITA);
    expect(ids(ausschnitt)).toEqual(["faecher", "jobticket"]);
    expect(ausschnitt.stellenNamen).toEqual({ FACILITY: "Hausmeister Kita", IT: "IT Kita", HR: "Personalabteilung" });
  });

  it("unbekannter Arbeitsort (keine Art): nur Positionen ohne Einschraenkung der Einrichtungsart", async () => {
    mockDb.ausstattungsPosition.findMany.mockResolvedValue([
      position({ id: "nur-kita", einrichtungsarten: ["KITA"] }),
      position({ id: "alle" }),
    ]);
    const ausschnitt = await katalogAusschnittLaden(db, { ...AM_KITA, arbeitsortId: "org-weg" });
    expect(ausschnitt.arbeitsortId).toBe("org-weg");
    expect(ids(ausschnitt)).toEqual(["alle"]);
  });
});

describe("ausstattungAngebotenIn (Merker mitAusstattung, Regel 2)", () => {
  /** Ohne abweichenden Arbeitsort: Einrichtung GYM. */
  const AM_GYM: AusschnittVorgang = { ...AM_KITA, arbeitsortId: null };

  it("leerer Ausschnitt (leerer Katalog) → false — mit einer einzigen Abfrage", async () => {
    expect(await ausstattungAngebotenIn(db, AM_KITA)).toBe(false);
    expect(mockDb.ausstattungsPosition.findMany).toHaveBeenCalledTimes(1);
    expect(mockDb.organization.findUnique).not.toHaveBeenCalled();
  });

  it("processType ≠ EINSTELLUNG → false, ohne den Katalog zu lesen", async () => {
    mockDb.ausstattungsPosition.findMany.mockResolvedValue([position()]);
    for (const processType of ["VERBEAMTUNG", "VERTRAGSAENDERUNG", "KUENDIGUNG"]) {
      expect(await ausstattungAngebotenIn(db, { ...AM_KITA, processType })).toBe(false);
    }
    expect(mockDb.ausstattungsPosition.findMany).not.toHaveBeenCalled();
    // Gegenprobe: bei EINSTELLUNG dieselbe Position.
    expect(await ausstattungAngebotenIn(db, AM_KITA)).toBe(true);
  });

  it("die Einrichtungsart kommt vom Arbeitsort, nicht von der Einrichtung", async () => {
    mockDb.ausstattungsPosition.findMany.mockResolvedValue([position({ id: "nur-gym", einrichtungsarten: ["GYMNASIUM"] })]);
    expect(await ausstattungAngebotenIn(db, AM_KITA)).toBe(false);
    expect(mockDb.organization.findUnique).toHaveBeenCalledWith({ where: { id: KITA }, select: { type: true } });
    expect(await ausstattungAngebotenIn(db, AM_GYM)).toBe(true);
  });

  it("eigene Positionen des Arbeitsorts ja, die der Einrichtung nein", async () => {
    mockDb.ausstattungsPosition.findMany.mockResolvedValue([position({ id: "eigene-gym", organizationId: GYM })]);
    expect(await ausstattungAngebotenIn(db, AM_KITA)).toBe(false);

    mockDb.ausstattungsPosition.findMany.mockResolvedValue([position({ id: "eigene-kita", organizationId: KITA })]);
    expect(await ausstattungAngebotenIn(db, AM_KITA)).toBe(true);
  });

  it("die Ausblendung am Arbeitsort wirkt, die an der Einrichtung nicht", async () => {
    mockDb.ausstattungsPosition.findMany.mockResolvedValue([position({ id: "a" })]);
    // Der Mock beachtet das WHERE: Ausblendungen je Einrichtung.
    const ausgeblendet: Record<string, string[]> = { [KITA]: ["a"], [GYM]: [] };
    mockDb.ausstattungsAusblendung.findMany.mockImplementation(
      async ({ where }: { where: { organizationId: string } }) =>
        (ausgeblendet[where.organizationId] ?? []).map((positionId) => ({ positionId, organizationId: where.organizationId })),
    );
    expect(await ausstattungAngebotenIn(db, AM_KITA)).toBe(false);
    expect(await ausstattungAngebotenIn(db, AM_GYM)).toBe(true);

    // Ausgeblendet nur an der Einrichtung, nicht am Arbeitsort: angeboten.
    ausgeblendet[KITA] = [];
    ausgeblendet[GYM] = ["a"];
    expect(await ausstattungAngebotenIn(db, AM_KITA)).toBe(true);
  });

  it("die Adresse der Stelle wird am Arbeitsort aufgeloest: ohne Adresse dort nicht angeboten, HR immer", async () => {
    mockDb.ausstattungsPosition.findMany.mockResolvedValue([
      position({ id: "spind", departmentKey: "FACILITY", bezeichnung: "Spind" }),
    ]);
    // FACILITY hat nur am Gymnasium (Einrichtung) eine Adresse, nicht an der Kita.
    mockDb.departmentConfig.findMany.mockResolvedValue([
      konfig({ departmentKey: "FACILITY", departmentName: "Hausmeister GYM", organizationId: GYM }),
    ]);
    expect(await ausstattungAngebotenIn(db, AM_KITA)).toBe(false);
    expect(await ausstattungAngebotenIn(db, AM_GYM)).toBe(true);

    // HR braucht keine Adresse — auch am Arbeitsort ohne jede Konfiguration.
    mockDb.ausstattungsPosition.findMany.mockResolvedValue([
      position({ id: "jobticket", departmentKey: "HR", bezeichnung: "Jobticket", entgeltrelevant: true }),
    ]);
    mockDb.departmentConfig.findMany.mockResolvedValue([]);
    expect(await ausstattungAngebotenIn(db, AM_KITA)).toBe(true);
  });
});
