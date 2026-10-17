/**
 * Tests: Lauf „Wartung“ (src/lib/laeufe/wartung.ts) — Loeschfrist der
 * Protokolleintraege des Stammabgleichs aus DokuBit (Self-Service S0, E10).
 *
 * Geprueft wird: AuditLog-Eintraege mit processType PERSONALSTAMM fallen nach
 * PERSONALSTAMM_AUFBEWAHRUNG_TAGE (365) weg — ein Eintrag genau an der Grenze
 * bleibt —, Eintraege anderer Vorgaenge bleiben immer. Der Probelauf zaehlt
 * nur. Die bisherigen Antwortfelder bleiben, der Bericht des Zeitplaners
 * liest die Antwort weiter ohne „Antwort unvollständig“.
 */

interface Eintrag {
  id: string;
  processType: string | null;
  createdAt: Date;
}
interface AuditWhere {
  processType?: string;
  createdAt?: { lt: Date };
}

/** Kleiner Ersatz fuer `auditLog.count`/`deleteMany`: wertet genau die Form aus wartung.ts aus. */
let auditLogs: Eintrag[] = [];
const trifft = (e: Eintrag, where: AuditWhere) =>
  (where.processType === undefined || e.processType === where.processType) &&
  (where.createdAt === undefined || e.createdAt.getTime() < where.createdAt.lt.getTime());

const mockPrisma = {
  emailLog: { count: jest.fn(), deleteMany: jest.fn() },
  automatischerLaufProtokoll: { count: jest.fn(), deleteMany: jest.fn() },
  auditLog: {
    count: jest.fn(async ({ where }: { where: AuditWhere }) => auditLogs.filter((e) => trifft(e, where)).length),
    deleteMany: jest.fn(async ({ where }: { where: AuditWhere }) => {
      const vorher = auditLogs.length;
      auditLogs = auditLogs.filter((e) => !trifft(e, where));
      return { count: vorher - auditLogs.length };
    }),
  },
};

jest.mock("@/lib/db", () => ({ prisma: mockPrisma }));

import { wartungLauf } from "@/lib/laeufe/wartung";
import { laufAuswerten } from "@/lib/zeitplaner/bericht";
import { PERSONALSTAMM_AUFBEWAHRUNG_TAGE, PERSONALSTAMM_PROCESS_TYPE } from "@/lib/constants";

const JETZT = new Date("2027-10-17T01:30:00.000Z");
const MS_PRO_TAG = 86_400_000;
/** 365 Tage vor JETZT (2027 ist kein Schaltjahr). */
const GRENZE = new Date("2026-10-17T01:30:00.000Z");
type Koerper = Record<string, unknown>;

function bestand(): Eintrag[] {
  return [
    { id: "ps-alt", processType: PERSONALSTAMM_PROCESS_TYPE, createdAt: new Date(GRENZE.getTime() - 1) },
    { id: "ps-sehr-alt", processType: PERSONALSTAMM_PROCESS_TYPE, createdAt: new Date("2025-01-01T00:00:00.000Z") },
    { id: "ps-grenze", processType: PERSONALSTAMM_PROCESS_TYPE, createdAt: GRENZE },
    { id: "ps-neu", processType: PERSONALSTAMM_PROCESS_TYPE, createdAt: new Date(JETZT.getTime() - 364 * MS_PRO_TAG) },
    { id: "ve-alt", processType: "CONTRACT_END", createdAt: new Date("2025-01-01T00:00:00.000Z") },
    { id: "ohne-typ-alt", processType: null, createdAt: new Date("2025-01-01T00:00:00.000Z") },
  ];
}

beforeEach(() => {
  jest.clearAllMocks();
  auditLogs = bestand();
  mockPrisma.emailLog.count.mockResolvedValue(4);
  mockPrisma.emailLog.deleteMany.mockResolvedValue({ count: 4 });
  mockPrisma.automatischerLaufProtokoll.count.mockResolvedValue(2);
  mockPrisma.automatischerLaufProtokoll.deleteMany.mockResolvedValue({ count: 2 });
});

describe("wartungLauf — Protokolle des Stammabgleichs (PERSONALSTAMM)", () => {
  it("die Frist ist 365 Tage", () => {
    expect(PERSONALSTAMM_AUFBEWAHRUNG_TAGE).toBe(365);
    expect(JETZT.getTime() - GRENZE.getTime()).toBe(365 * MS_PRO_TAG);
  });

  it("scharf: loescht nur PERSONALSTAMM-Eintraege vor der Grenze; der Eintrag genau an der Grenze bleibt", async () => {
    const r = await wartungLauf({ jetzt: JETZT });
    const body = r.body as Koerper;

    expect(r.status).toBe(200);
    expect(mockPrisma.auditLog.deleteMany).toHaveBeenCalledWith({
      where: { processType: PERSONALSTAMM_PROCESS_TYPE, createdAt: { lt: GRENZE } },
    });
    expect(body.personalstammProtokolle).toBe(2);
    expect(auditLogs.map((e) => e.id).sort()).toEqual(["ohne-typ-alt", "ps-grenze", "ps-neu", "ve-alt"]);
  });

  it("scharf: die bisherigen Antwortfelder bleiben, der Bericht liest die Antwort vollstaendig", async () => {
    const r = await wartungLauf({ jetzt: JETZT });
    expect(r.body).toEqual({ success: true, dryRun: false, emailLogs: 4, protokolle: 2, personalstammProtokolle: 2 });
    const auswertung = laufAuswerten("wartung", r.status, r.body, false);
    expect(auswertung.ergebnis).toBe("OK");
    expect(auswertung.zaehler).toContainEqual(["Gelöscht: Personalstamm-Protokolle", 2]);
  });

  it("Probelauf: zaehlt nur, loescht nichts", async () => {
    const r = await wartungLauf({ jetzt: JETZT, dryRun: true });

    expect(mockPrisma.auditLog.count).toHaveBeenCalledWith({
      where: { processType: PERSONALSTAMM_PROCESS_TYPE, createdAt: { lt: GRENZE } },
    });
    expect(mockPrisma.auditLog.deleteMany).not.toHaveBeenCalled();
    expect(mockPrisma.emailLog.deleteMany).not.toHaveBeenCalled();
    expect(mockPrisma.automatischerLaufProtokoll.deleteMany).not.toHaveBeenCalled();
    expect(auditLogs).toHaveLength(bestand().length);
    expect(r.body).toEqual({ success: true, dryRun: true, emailLogs: 4, protokolle: 2, personalstammProtokolle: 2 });
    const auswertung = laufAuswerten("wartung", r.status, r.body, true);
    expect(auswertung.ergebnis).toBe("OK");
    expect(auswertung.zaehler).toContainEqual(["Würde löschen: Personalstamm-Protokolle", 2]);
  });

  it("nichts abgelaufen: 0, andere Vorgaenge bleiben unberuehrt", async () => {
    auditLogs = bestand().filter((e) => e.processType !== PERSONALSTAMM_PROCESS_TYPE || e.createdAt >= GRENZE);
    const r = await wartungLauf({ jetzt: JETZT });
    expect((r.body as Koerper).personalstammProtokolle).toBe(0);
    expect(auditLogs.map((e) => e.id).sort()).toEqual(["ohne-typ-alt", "ps-grenze", "ps-neu", "ve-alt"]);
  });
});
