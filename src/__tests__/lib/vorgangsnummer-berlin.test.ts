/**
 * Vorgangsnummern aller Module: Jahr und Zaehlbereich aus `vorgangsjahrInBerlin`.
 *
 * Der Container laeuft in UTC. `new Date().getFullYear()` und
 * `new Date(jahr, 0, 1)` rechneten dort in UTC: In der ersten Stunde des neuen
 * Jahres (deutscher Zeit) bekam ein Vorgang die Jahreszahl des alten, und der
 * Zaehlbereich begann eine Stunde zu spaet. Behoben war das zuerst nur im
 * Onboarding (B7); dieselben drei Zeilen standen in sechs weiteren Erzeugern.
 *
 * WARUM MIT EINEM PLATZHALTER-JAHR STATT MIT DER SILVESTERNACHT: Auf einem
 * Entwicklerrechner in Europe/Berlin rechnet auch der alte Code „richtig" —
 * dort ist die Ortszeit ja deutsche Zeit. Ein Test mit
 * `setSystemTime("2026-12-31T23:30Z")` waere hier gruen, mit und ohne Fix, und
 * wuerde erst im UTC-Container rot. Und `process.env.TZ` laesst sich innerhalb
 * von Jest nicht umstellen (die Umgebung arbeitet auf einer Kopie von
 * `process.env`). Belegt wird deshalb die VERDRAHTUNG: Jeder Erzeuger nimmt
 * Jahr und Bereich woertlich aus `vorgangsjahrInBerlin` — ein Jahr, das keine
 * Uhr liefern kann (2031), zeigt das zweifelsfrei. Die Rechnung selbst
 * (Silvester, Sommerzeit, Umstellungstage) prueft vorgangsjahr.test.ts.
 */

const mockPrisma = {
  bemFall: { count: jest.fn(), findUnique: jest.fn() },
  mutterschutzProzess: { count: jest.fn(), findUnique: jest.fn() },
  elternzeitProzess: { count: jest.fn(), findUnique: jest.fn() },
  contractEndProcess: { count: jest.fn(), findUnique: jest.fn() },
  offboardingProcess: { count: jest.fn(), findUnique: jest.fn() },
  civilServiceProcess: { count: jest.fn(), findUnique: jest.fn() },
  organization: { findUnique: jest.fn() },
  checklistTemplate: { findFirst: jest.fn() },
  $transaction: jest.fn(),
};
const mockVorgangsjahr = jest.fn();
const mockGetSession = jest.fn();

jest.mock("@/lib/db", () => ({ prisma: mockPrisma }));
jest.mock("@/lib/webhooks", () => ({ triggerWebhooks: jest.fn() }));
jest.mock("@/lib/auth", () => ({ getSession: mockGetSession }));
jest.mock("@/lib/vorgangsjahr", () => ({ vorgangsjahrInBerlin: mockVorgangsjahr }));

import { generateBemDisplayId } from "@/lib/bem-helpers";
import {
  generateElternzeitDisplayId,
  generateMutterschutzDisplayId,
} from "@/lib/elternzeit-helpers";
import { createContractEndProcess } from "@/lib/contract-end";
import { createOffboardingProcess } from "@/lib/offboarding";
import { POST as psiAnlegen } from "@/app/api/civil-service/route";
import { NextRequest } from "next/server";

/** Ein Jahr, das keine Uhr liefert — nur der Helfer kann es hergeben. */
const JAHR = {
  jahr: 2031,
  von: new Date("2030-12-31T23:00:00.000Z"),
  bis: new Date("2031-12-31T23:00:00.000Z"),
};
const BEREICH = { gte: JAHR.von, lt: JAHR.bis };

/** Abbruch nach der Nummernvergabe — der Rest der Anlage ist hier nicht Thema. */
const STOPP = new Error("STOPP nach der Nummernvergabe");

const ORG = {
  id: "org-1",
  name: "FES Gymnasium",
  shortName: "GYM",
  mandantNumber: "712",
  type: "GYMNASIUM",
};

beforeEach(() => {
  jest.clearAllMocks();
  mockVorgangsjahr.mockReturnValue(JAHR);
  for (const modell of [
    mockPrisma.bemFall,
    mockPrisma.mutterschutzProzess,
    mockPrisma.elternzeitProzess,
    mockPrisma.contractEndProcess,
    mockPrisma.offboardingProcess,
    mockPrisma.civilServiceProcess,
  ]) {
    modell.count.mockResolvedValue(0);
    modell.findUnique.mockResolvedValue(null);
  }
  mockPrisma.$transaction.mockRejectedValue(STOPP);
  mockPrisma.checklistTemplate.findFirst.mockRejectedValue(STOPP);
});

/** Welche Nummer geprueft wurde (der Eindeutigkeits-Check traegt sie). */
function gepruefteNummer(modell: { findUnique: jest.Mock }): string {
  return modell.findUnique.mock.calls[0][0].where.displayId;
}

function gezaehlterBereich(modell: { count: jest.Mock }) {
  return modell.count.mock.calls[0][0].where.createdAt;
}

describe("Vorgangsnummer in deutscher Zeit — alle Erzeuger", () => {
  it("BEM", async () => {
    const r = await generateBemDisplayId("org-1", "GYM");
    expect(r.displayId).toBe("BEM-2031-GYM-001");
    expect(gezaehlterBereich(mockPrisma.bemFall)).toEqual(BEREICH);
    expect(mockVorgangsjahr).toHaveBeenCalledWith(expect.any(Date));
  });

  it("Mutterschutz", async () => {
    const r = await generateMutterschutzDisplayId("org-1", "GYM");
    expect(r.displayId).toBe("MU-2031-GYM-001");
    expect(gezaehlterBereich(mockPrisma.mutterschutzProzess)).toEqual(BEREICH);
  });

  it("Elternzeit", async () => {
    const r = await generateElternzeitDisplayId("org-1", "GYM");
    expect(r.displayId).toBe("EZ-2031-GYM-001");
    expect(gezaehlterBereich(mockPrisma.elternzeitProzess)).toEqual(BEREICH);
  });

  it("Vertragsende", async () => {
    await expect(
      createContractEndProcess({
        organization: ORG,
        employeeEmail: "p@example.org",
        employeeFirstName: "Pia",
        employeeLastName: "Muster",
        contractEndDate: new Date("2031-07-31T00:00:00.000Z"),
      }),
    ).rejects.toBe(STOPP);
    expect(gepruefteNummer(mockPrisma.contractEndProcess)).toBe("VE-2031-GYM-001");
    expect(gezaehlterBereich(mockPrisma.contractEndProcess)).toEqual(BEREICH);
  });

  it("Offboarding", async () => {
    await expect(
      createOffboardingProcess({
        organization: ORG,
        lastWorkingDay: new Date("2031-07-31T00:00:00.000Z"),
        initiatedById: "u1",
      } as unknown as Parameters<typeof createOffboardingProcess>[0]),
    ).rejects.toBe(STOPP);
    expect(gepruefteNummer(mockPrisma.offboardingProcess)).toBe("OFF-2031-GYM-001");
    expect(gezaehlterBereich(mockPrisma.offboardingProcess)).toEqual(BEREICH);
  });

  it("Verbeamtung (PSI)", async () => {
    mockGetSession.mockResolvedValue({ userId: "u1", role: "HR_LEITUNG" });
    mockPrisma.organization.findUnique.mockResolvedValue(ORG);
    const res = await psiAnlegen(
      new NextRequest("http://localhost:3000/api/civil-service", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeFirstName: "Anna",
          employeeLastName: "Lehrerin",
          employeeEmail: "anna@example.org",
          organizationId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
          targetStartDate: "2031-08-01",
        }),
      }),
    );
    // Die Transaktion bricht ab (STOPP) — die Route antwortet 500; die
    // Nummer war da schon vergeben und geprueft.
    expect(res.status).toBe(500);
    expect(gepruefteNummer(mockPrisma.civilServiceProcess)).toBe("PSI-2031-GYM-001");
    expect(gezaehlterBereich(mockPrisma.civilServiceProcess)).toEqual(BEREICH);
  });
});
