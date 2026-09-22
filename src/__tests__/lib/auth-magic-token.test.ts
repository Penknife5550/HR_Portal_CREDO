/**
 * Tests: die Link-Gates in src/lib/auth.ts (validateMagicToken,
 * validateSupervisorToken) — echte auth.ts, Prisma gemockt.
 *
 * Seit Fragebogen und Modalitaeten parallel laufen, haengt die Schreibsperre
 * jedes Links an der EIGENEN Spur, nicht am gemeinsamen Status. Belegt werden
 * beide Richtungen des alten Fehlers:
 *   - Die Person wurde gesperrt, obwohl sie nichts abgesendet hatte (die
 *     Fuehrungskraft war schneller, Status SUPERVISOR_SUBMITTED).
 *   - Die Person konnte nach dem eigenen Absenden wieder schreiben, sobald der
 *     Status SUPERVISOR_PENDING oder REVIEWED lautete — die Pruefsumme ihrer
 *     Erklaerung passte danach nicht mehr.
 */

const mockPrisma = {
  onboardingProcess: { findUnique: jest.fn(), findFirst: jest.fn() },
};

jest.mock("@/lib/db", () => ({ prisma: mockPrisma }));

import {
  getTokenExpiryDate,
  magicLinkGueltigkeitMs,
  validateMagicToken,
  validateSupervisorToken,
} from "@/lib/auth";

const MORGEN = () => new Date(Date.now() + 86_400_000);
const GESTERN = () => new Date(Date.now() - 86_400_000);
const ABGABE = new Date("2026-09-18T09:00:00Z");

function magicVorgang(teil: Record<string, unknown> = {}) {
  return {
    id: "ob1",
    status: "IN_PROGRESS",
    tokenExpiresAt: MORGEN(),
    submittedAt: null,
    personalData: { isComplete: false, currentStep: 3 },
    organization: {},
    ...teil,
  };
}

function vgVorgang(teil: Record<string, unknown> = {}) {
  return {
    id: "ob1",
    status: "IN_PROGRESS",
    supervisorTokenExpiresAt: MORGEN(),
    supervisorSubmittedAt: null,
    supervisorData: { isComplete: false, kostenstellen: [] },
    personalData: { firstName: null, lastName: null },
    organization: {},
    ...teil,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("validateMagicToken (Fragebogen-Link)", () => {
  it("laesst schreiben, obwohl die Fuehrungskraft schon abgesendet hat", async () => {
    mockPrisma.onboardingProcess.findUnique.mockResolvedValue(
      magicVorgang({ status: "SUPERVISOR_SUBMITTED", supervisorSubmittedAt: ABGABE }),
    );
    const ergebnis = await validateMagicToken("t");
    expect(ergebnis.valid).toBe(true);
  });

  it.each(["SUBMITTED", "SUPERVISOR_PENDING", "SUPERVISOR_SUBMITTED"])(
    "sperrt Schreiben nach der eigenen Abgabe — auch bei Status %s",
    async (status) => {
      mockPrisma.onboardingProcess.findUnique.mockResolvedValue(
        magicVorgang({ status, submittedAt: ABGABE }),
      );
      const ergebnis = await validateMagicToken("t");
      expect(ergebnis).toEqual({
        valid: false,
        reason: "Fragebogen wurde bereits eingereicht",
      });
    },
  );

  it("sperrt Schreiben bei REVIEWED, auch ohne eigene Abgabe", async () => {
    mockPrisma.onboardingProcess.findUnique.mockResolvedValue(
      magicVorgang({ status: "REVIEWED" }),
    );
    const ergebnis = await validateMagicToken("t");
    expect(ergebnis.valid).toBe(false);
  });

  it("sperrt den Altfall ohne Zeitstempel (isComplete)", async () => {
    mockPrisma.onboardingProcess.findUnique.mockResolvedValue(
      magicVorgang({ status: "SUBMITTED", personalData: { isComplete: true } }),
    );
    expect((await validateMagicToken("t")).valid).toBe(false);
  });

  it("laesst LESEN nach der Abgabe weiter zu (allowSubmitted)", async () => {
    mockPrisma.onboardingProcess.findUnique.mockResolvedValue(
      magicVorgang({ status: "SUPERVISOR_PENDING", submittedAt: ABGABE }),
    );
    expect((await validateMagicToken("t", { allowSubmitted: true })).valid).toBe(true);
  });

  it("sperrt auch das Lesen bei abgeschlossenem, abgelaufenem Vorgang oder abgelaufenem Link", async () => {
    for (const teil of [
      { status: "COMPLETED" },
      { status: "EXPIRED" },
      { tokenExpiresAt: GESTERN() },
    ]) {
      mockPrisma.onboardingProcess.findUnique.mockResolvedValue(magicVorgang(teil));
      expect((await validateMagicToken("t", { allowSubmitted: true })).valid).toBe(false);
    }
  });
});

describe("validateSupervisorToken (Modalitaeten-Link)", () => {
  it("laesst schreiben, obwohl der Fragebogen schon eingereicht ist (Status SUBMITTED)", async () => {
    mockPrisma.onboardingProcess.findFirst.mockResolvedValue(
      vgVorgang({ status: "SUBMITTED", submittedAt: ABGABE }),
    );
    expect((await validateSupervisorToken("t")).valid).toBe(true);
  });

  it("sperrt Schreiben nach der eigenen Abgabe — auch wenn der Status noch IN_PROGRESS ist", async () => {
    // Genau der neue Normalfall: Die Fuehrungskraft war zuerst fertig.
    mockPrisma.onboardingProcess.findFirst.mockResolvedValue(
      vgVorgang({ status: "IN_PROGRESS", supervisorSubmittedAt: ABGABE }),
    );
    expect(await validateSupervisorToken("t")).toEqual({
      valid: false,
      reason: "Die Einstellungsmodalitäten wurden bereits eingereicht",
    });
  });

  it("sperrt den Altfall ohne Zeitstempel (isComplete)", async () => {
    mockPrisma.onboardingProcess.findFirst.mockResolvedValue(
      vgVorgang({ supervisorData: { isComplete: true, kostenstellen: [] } }),
    );
    expect((await validateSupervisorToken("t")).valid).toBe(false);
  });

  it("sperrt Schreiben bei REVIEWED", async () => {
    mockPrisma.onboardingProcess.findFirst.mockResolvedValue(
      vgVorgang({ status: "REVIEWED" }),
    );
    expect((await validateSupervisorToken("t")).valid).toBe(false);
  });

  it("laesst LESEN nach der Abgabe zu (allowSubmitted)", async () => {
    mockPrisma.onboardingProcess.findFirst.mockResolvedValue(
      vgVorgang({ supervisorSubmittedAt: ABGABE }),
    );
    expect((await validateSupervisorToken("t", { allowSubmitted: true })).valid).toBe(true);
  });

  it("sperrt einen abgelaufenen Link auch fuers Lesen", async () => {
    mockPrisma.onboardingProcess.findFirst.mockResolvedValue(
      vgVorgang({ supervisorTokenExpiresAt: GESTERN() }),
    );
    expect((await validateSupervisorToken("t", { allowSubmitted: true })).valid).toBe(false);
  });
});

describe("magicLinkGueltigkeitMs", () => {
  // Dieselbe Zahl braucht der Erinnerungs-Cron, um den Erzeugungszeitpunkt
  // von Bestandslinks aus ihrem Ablauf zurueckzurechnen.
  const STUNDE = 3_600_000;
  const alt = process.env.MAGIC_LINK_EXPIRY_HOURS;

  afterEach(() => {
    if (alt === undefined) delete process.env.MAGIC_LINK_EXPIRY_HOURS;
    else process.env.MAGIC_LINK_EXPIRY_HOURS = alt;
  });

  it("gilt ohne Einstellung 720 Stunden (30 Tage)", () => {
    delete process.env.MAGIC_LINK_EXPIRY_HOURS;
    expect(magicLinkGueltigkeitMs()).toBe(720 * STUNDE);
  });

  it("folgt MAGIC_LINK_EXPIRY_HOURS", () => {
    process.env.MAGIC_LINK_EXPIRY_HOURS = "168";
    expect(magicLinkGueltigkeitMs()).toBe(168 * STUNDE);
  });

  it("faellt bei unlesbarem oder nicht positivem Wert auf 720 Stunden zurueck", () => {
    for (const wert of ["abc", "0", "-5"]) {
      process.env.MAGIC_LINK_EXPIRY_HOURS = wert;
      expect(magicLinkGueltigkeitMs()).toBe(720 * STUNDE);
    }
  });

  it("getTokenExpiryDate rechnet mit derselben Gueltigkeit", () => {
    process.env.MAGIC_LINK_EXPIRY_HOURS = "48";
    const vorher = Date.now();
    const ablauf = getTokenExpiryDate().getTime();
    expect(ablauf - vorher).toBeGreaterThanOrEqual(48 * STUNDE);
    expect(ablauf - Date.now()).toBeLessThanOrEqual(48 * STUNDE);
  });
});
