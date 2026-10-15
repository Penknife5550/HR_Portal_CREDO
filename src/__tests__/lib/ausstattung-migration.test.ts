/**
 * Tests: Migration SUPERVISOR_MIT_AUSSTATTUNG_V1 (prisma/seed-check.js)
 *
 * Ausstattung & Zugaenge, Regel 2: Der Merker `SupervisorData.mitAusstattung`
 * entsteht mit dem Modalitaeten-Link. Der Bestand vor A2 hat den Schritt nie
 * gesehen und bekommt einmalig `false` — sonst hiesse „leer" zugleich „Altfall"
 * und „noch nicht entschieden", und ein erneuerter Link setzte den Schritt bei
 * einem nie gespeicherten Altformular nachtraeglich ein.
 *
 * Belegt werden der Plan (rein) und der Ablauf mit einem Prisma-Ersatz: Merker
 * und Datenaenderung in EINER Transaktion, kein zweiter Lauf, Fehler nur
 * geloggt.
 */

// Dank des `require.main === module`-Guards laedt seed-check.js, ohne dass der
// Entrypoint startet (Muster wie in parallele-spuren-migration.test.ts).
const seedCheck = require("../../../prisma/seed-check.js");

const MARKER: string = seedCheck.SUPERVISOR_MIT_AUSSTATTUNG_MARKER;
const plane: (ohneMerker: number) => {
  where: Record<string, unknown>;
  data: Record<string, unknown>;
  details: Record<string, unknown>;
} = seedCheck.planeMitAusstattung;
const migriere: (prisma: unknown) => Promise<void> = seedCheck.migriereMitAusstattung;

describe("planeMitAusstattung", () => {
  it("setzt nur leere Merker auf false — ein gesetztes true oder false bleibt", () => {
    const plan = plane(7);
    expect(plan.where).toEqual({ mitAusstattung: null });
    expect(plan.data).toEqual({ mitAusstattung: false });
  });

  it("fasst sonst nichts an — weder den Index des Formulars noch den zweiten Merker", () => {
    const plan = plane(3);
    expect(Object.keys(plan.data)).toEqual(["mitAusstattung"]);
    expect(Object.keys(plan.where)).toEqual(["mitAusstattung"]);
  });

  it("nennt die Zahl der betroffenen Zeilen im Merker", () => {
    expect(plane(12).details).toEqual({ aufFalseGesetzt: 12 });
    expect(plane(0).details).toEqual({ aufFalseGesetzt: 0 });
  });
});

describe("migriereMitAusstattung", () => {
  function prismaErsatz(opts: { erledigt?: boolean; ohneMerker?: number } = {}) {
    const updateManyOp = { op: "updateMany" };
    const markerOp = { op: "marker" };
    return {
      updateManyOp,
      markerOp,
      systemMigration: {
        findUnique: jest.fn().mockResolvedValue(opts.erledigt ? { id: "m1" } : null),
        create: jest.fn().mockReturnValue(markerOp),
      },
      supervisorData: {
        count: jest.fn().mockResolvedValue(opts.ohneMerker ?? 4),
        updateMany: jest.fn().mockReturnValue(updateManyOp),
      },
      $transaction: jest.fn().mockResolvedValue([{ count: opts.ohneMerker ?? 4 }, {}]),
    };
  }

  let log: jest.SpyInstance;
  let fehler: jest.SpyInstance;
  beforeEach(() => {
    log = jest.spyOn(console, "log").mockImplementation(() => {});
    fehler = jest.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    log.mockRestore();
    fehler.mockRestore();
  });

  it("traegt einen stabilen Namen", () => {
    expect(MARKER).toBe("SUPERVISOR_MIT_AUSSTATTUNG_V1");
  });

  it("schreibt Update und Merker in EINER Transaktion — mit der Zahl in details", async () => {
    const p = prismaErsatz({ ohneMerker: 4 });

    await migriere(p);

    expect(p.systemMigration.findUnique).toHaveBeenCalledWith({ where: { name: MARKER }, select: { id: true } });
    expect(p.supervisorData.count).toHaveBeenCalledWith({ where: { mitAusstattung: null } });
    expect(p.supervisorData.updateMany).toHaveBeenCalledWith({
      where: { mitAusstattung: null },
      data: { mitAusstattung: false },
    });
    expect(p.systemMigration.create).toHaveBeenCalledWith({
      data: { name: MARKER, details: { aufFalseGesetzt: 4 } },
    });
    expect(p.$transaction).toHaveBeenCalledTimes(1);
    expect(p.$transaction).toHaveBeenCalledWith([p.updateManyOp, p.markerOp]);
  });

  it("setzt den Merker auch auf einer leeren Datenbank (0 Zeilen)", async () => {
    const p = prismaErsatz({ ohneMerker: 0 });
    await migriere(p);
    expect(p.systemMigration.create).toHaveBeenCalledWith({
      data: { name: MARKER, details: { aufFalseGesetzt: 0 } },
    });
    expect(p.$transaction).toHaveBeenCalledTimes(1);
  });

  it("laeuft kein zweites Mal, wenn der Merker steht", async () => {
    const p = prismaErsatz({ erledigt: true });

    await migriere(p);

    expect(p.supervisorData.count).not.toHaveBeenCalled();
    expect(p.supervisorData.updateMany).not.toHaveBeenCalled();
    expect(p.$transaction).not.toHaveBeenCalled();
  });

  it("loggt einen Fehler und bricht den Start nicht ab — ohne Merker laeuft sie beim naechsten Start erneut", async () => {
    const p = prismaErsatz();
    p.$transaction.mockRejectedValue(new Error("Verbindung weg"));

    await expect(migriere(p)).resolves.toBeUndefined();

    expect(fehler).toHaveBeenCalledWith(expect.stringContaining(MARKER), "Verbindung weg");
  });
});
