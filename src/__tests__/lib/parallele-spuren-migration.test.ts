/**
 * Tests: Heil-Migration ONBOARDING_PARALLELE_SPUREN_V1 (prisma/seed-check.js)
 *
 * seed-check.js laeuft im Container als reines JS (kein tsx) und traegt deshalb
 * eine KOPIE von `gesamtStatus`. Dieser Test haelt beide Fassungen ueber die
 * ganze Matrix zusammen — laufen sie auseinander, setzte die Migration einen
 * anderen Status, als die Routen danach berechnen, und der naechste Abgleich
 * drehte ihn wieder um.
 *
 * Die Migration selbst ist nach einem Lauf nicht mehr korrigierbar (der
 * Merker verhindert den zweiten). Belegt werden deshalb ihre Regeln ohne
 * Datenbank: wer geheilt wird, wer nicht angefasst wird, und dass die
 * ausgelassenen Snapshot-Korrekturen genau bei den Richtigen nachgezogen werden.
 */

import {
  HR_STATUS,
  ONBOARDING_STATUS,
  gesamtStatus,
  type SpurenStand,
} from "@/lib/onboarding-spuren";

// Dank des `require.main === module`-Guards laedt seed-check.js, ohne dass der
// Entrypoint startet (Muster wie in betriebsnummern-migration.test.ts).
const seedCheck = require("../../../prisma/seed-check.js");

const ZEIT = new Date("2026-09-18T09:00:00Z");

function matrix(): SpurenStand[] {
  const faelle: SpurenStand[] = [];
  for (const status of ONBOARDING_STATUS) {
    for (const submittedAt of [null, ZEIT]) {
      for (const maFertig of [false, true]) {
        for (const supervisorSubmittedAt of [null, ZEIT]) {
          for (const vgFertig of [false, true]) {
            for (const supervisorToken of [null, "t"]) {
              for (const currentStep of [0, 5]) {
                for (const ohneRelationen of [false, true]) {
                  faelle.push({
                    status,
                    submittedAt,
                    supervisorSubmittedAt,
                    supervisorToken,
                    personalData: ohneRelationen ? null : { currentStep, isComplete: maFertig },
                    supervisorData: ohneRelationen ? null : { isComplete: vgFertig },
                  });
                }
              }
            }
          }
        }
      }
    }
  }
  return faelle;
}

describe("JS-Kopie in seed-check.js", () => {
  it("rechnet ueber die ganze Matrix genau wie gesamtStatus", () => {
    const faelle = matrix();
    expect(faelle.length).toBeGreaterThan(500);
    for (const v of faelle) {
      expect(seedCheck.spurenGesamtStatus(v)).toBe(gesamtStatus(v));
    }
  });

  it("fuehrt dieselben HR-Status", () => {
    expect(seedCheck.SPUREN_HR_STATUS).toEqual([...HR_STATUS]);
  });
});

// =============================================
// Statusplanung
// =============================================

function vorgang(teil: Record<string, unknown> = {}) {
  return {
    id: "ob1",
    displayId: "2026-GYM-014",
    status: "IN_PROGRESS",
    submittedAt: null,
    supervisorSubmittedAt: null,
    supervisorToken: null,
    questionnaireType: "STANDARD",
    formTemplateSnapshot: null,
    createdAt: new Date("2026-06-01T00:00:00Z"),
    personalData: { currentStep: 0, isComplete: false },
    supervisorData: null,
    ...teil,
  };
}

describe("planeStatusAbgleich", () => {
  it("heilt den festhaengenden Fall auf IN_PROGRESS, wenn die Person schon gespeichert hat", () => {
    const { aenderungen } = seedCheck.planeStatusAbgleich([
      vorgang({
        status: "SUPERVISOR_SUBMITTED",
        supervisorToken: "t",
        supervisorSubmittedAt: ZEIT,
        supervisorData: { isComplete: true },
        personalData: { currentStep: 4, isComplete: false },
      }),
    ]);
    expect(aenderungen).toEqual([
      expect.objectContaining({
        von: "SUPERVISOR_SUBMITTED",
        nach: "IN_PROGRESS",
        festhaengend: true,
      }),
    ]);
  });

  it("heilt auf INVITED, wenn die Person nie gespeichert hat", () => {
    const { aenderungen } = seedCheck.planeStatusAbgleich([
      vorgang({ status: "SUBMITTED", personalData: { currentStep: 0, isComplete: false } }),
    ]);
    expect(aenderungen[0]).toMatchObject({ von: "SUBMITTED", nach: "INVITED", festhaengend: true });
  });

  it("setzt SUBMITTED mit offenem Vorgesetzten-Link auf SUPERVISOR_PENDING (ohne Snapshot-Nachzug)", () => {
    const { aenderungen } = seedCheck.planeStatusAbgleich([
      vorgang({
        status: "SUBMITTED",
        submittedAt: ZEIT,
        supervisorToken: "t",
        personalData: { currentStep: 12, isComplete: true },
      }),
    ]);
    expect(aenderungen[0]).toMatchObject({
      von: "SUBMITTED",
      nach: "SUPERVISOR_PENDING",
      festhaengend: false,
      snapshot: null,
    });
  });

  it("setzt SUPERVISOR_SUBMITTED ohne abgesendete Modalitaeten zurueck", () => {
    const { aenderungen } = seedCheck.planeStatusAbgleich([
      vorgang({
        status: "SUPERVISOR_SUBMITTED",
        submittedAt: ZEIT,
        supervisorToken: "t",
        personalData: { currentStep: 12, isComplete: true },
      }),
    ]);
    expect(aenderungen[0]).toMatchObject({ nach: "SUPERVISOR_PENDING", festhaengend: false });
  });

  it("laesst stimmige Vorgaenge in Ruhe", () => {
    const { aenderungen } = seedCheck.planeStatusAbgleich([
      vorgang(),
      vorgang({ status: "INVITED" }),
      vorgang({
        status: "SUPERVISOR_SUBMITTED",
        submittedAt: ZEIT,
        supervisorSubmittedAt: ZEIT,
        supervisorToken: "t",
      }),
    ]);
    expect(aenderungen).toEqual([]);
  });

  it("fasst HR-Status nie an und meldet geprueft/abgeschlossen ohne Abgabe", () => {
    const { aenderungen, hrOhneAbgabe } = seedCheck.planeStatusAbgleich([
      vorgang({ id: "a", displayId: "A", status: "REVIEWED" }),
      vorgang({ id: "b", displayId: "B", status: "COMPLETED" }),
      vorgang({ id: "c", displayId: "C", status: "EXPIRED" }),
      vorgang({ id: "d", displayId: "D", status: "REVIEWED", submittedAt: ZEIT }),
    ]);
    expect(aenderungen).toEqual([]);
    expect(hrOhneAbgabe).toEqual([
      { id: "a", displayId: "A", status: "REVIEWED" },
      { id: "b", displayId: "B", status: "COMPLETED" },
    ]);
  });

  it("ist idempotent: ein zweiter Lauf auf dem geheilten Stand aendert nichts", () => {
    const bestand = matrix().map((v, i) => ({
      ...vorgang(),
      ...v,
      id: `v${i}`,
      personalData: v.personalData ?? null,
    }));
    const { aenderungen } = seedCheck.planeStatusAbgleich(bestand);
    const nachLauf = bestand.map((v) => {
      const a = aenderungen.find((x: { id: string }) => x.id === v.id);
      return a ? { ...v, status: a.nach } : v;
    });
    expect(seedCheck.planeStatusAbgleich(nachLauf).aenderungen).toEqual([]);
  });
});

// =============================================
// Snapshot-Nachzug fuer geheilte Vorgaenge
// =============================================

/** Ein alter MINIJOB-Snapshot, den keine der vier Korrekturen je erreicht hat. */
function alterMinijobSnapshot() {
  return [
    { step: 5, title: "Steuer", enabled: false, fields: [] },
    { step: 6, title: "Weitere Beschäftigung", enabled: false },
    { step: 8, title: "Bildung & Beruf", enabled: false },
    { step: 9, title: "Masernschutz", enabled: false },
  ];
}

const GELAUFEN = new Date("2026-09-07T05:00:00Z");
const ALLE_MERKER = [
  { name: seedCheck.MINIJOB_TEMPLATE_MARKER, appliedAt: GELAUFEN, details: { changed: true } },
  { name: seedCheck.MINIJOB_RENTE_MARKER, appliedAt: GELAUFEN, details: { changed: true } },
  { name: seedCheck.MINIJOB_STEP6_MARKER, appliedAt: GELAUFEN, details: {} },
  { name: seedCheck.MASERNSCHUTZ_MARKER, appliedAt: GELAUFEN, details: { changed: true } },
];

function festhaengenderMinijob(teil: Record<string, unknown> = {}) {
  return vorgang({
    status: "SUPERVISOR_SUBMITTED",
    supervisorToken: "t",
    supervisorSubmittedAt: ZEIT,
    questionnaireType: "MINIJOB",
    formTemplateSnapshot: alterMinijobSnapshot(),
    createdAt: new Date("2026-08-20T00:00:00Z"),
    personalData: { currentStep: 4, isComplete: false },
    ...teil,
  });
}

describe("planeSnapshotNachzug (ueber planeStatusAbgleich)", () => {
  it("zieht bei einem geheilten MINIJOB-Vorgang alle vier Korrekturen nach — in Laufreihenfolge", () => {
    const { aenderungen } = seedCheck.planeStatusAbgleich([festhaengenderMinijob()], ALLE_MERKER);
    const a = aenderungen[0];

    expect(a.snapshotKorrekturen).toEqual([
      seedCheck.MINIJOB_TEMPLATE_MARKER,
      seedCheck.MINIJOB_RENTE_MARKER,
      seedCheck.MINIJOB_STEP6_MARKER,
      seedCheck.MASERNSCHUTZ_MARKER,
    ]);
    const snap = a.snapshot as { step: number; enabled: boolean; fields?: unknown }[];
    const schritt = (n: number) => snap.find((s) => s.step === n);
    expect(schritt(5)).toMatchObject({ enabled: true, fields: seedCheck.MINIJOB_TAX_FIELDS });
    expect(schritt(6)).toMatchObject({ enabled: true, fields: seedCheck.MINIJOB_STEP6_FIELDS });
    expect(schritt(8)?.enabled).toBe(true);
    expect(schritt(9)?.enabled).toBe(true);
    expect(schritt(seedCheck.RENTE_SCHRITT)?.enabled).toBe(true);
  });

  it("zieht bei anderen Fragebogentypen nur den Masernschutz nach", () => {
    const { aenderungen } = seedCheck.planeStatusAbgleich(
      [festhaengenderMinijob({ questionnaireType: "STANDARD" })],
      ALLE_MERKER,
    );
    expect(aenderungen[0].snapshotKorrekturen).toEqual([seedCheck.MASERNSCHUTZ_MARKER]);
  });

  it("laesst Vorgaenge unangetastet, die NACH der Korrektur angelegt wurden", () => {
    // Ihr Snapshot stammt schon aus der korrigierten Vorlage — oder aus einer,
    // die HR danach bewusst anders eingestellt hat.
    const { aenderungen } = seedCheck.planeStatusAbgleich(
      [festhaengenderMinijob({ createdAt: new Date("2026-09-10T00:00:00Z") })],
      ALLE_MERKER,
    );
    expect(aenderungen[0].nach).toBe("IN_PROGRESS");
    expect(aenderungen[0].snapshot).toBeNull();
    expect(aenderungen[0].snapshotKorrekturen).toEqual([]);
  });

  it("zieht nichts nach, dessen Migration noch nicht gelaufen ist", () => {
    // Die holt den (dann IN_PROGRESS stehenden) Vorgang beim naechsten Start selbst ab.
    const { aenderungen } = seedCheck.planeStatusAbgleich(
      [festhaengenderMinijob()],
      ALLE_MERKER.filter((m) => m.name !== seedCheck.MASERNSCHUTZ_MARKER),
    );
    expect(aenderungen[0].snapshotKorrekturen).not.toContain(seedCheck.MASERNSCHUTZ_MARKER);
  });

  it("ahmt die Rente-Migration nach: bei „changed: false“ hat sie keinen Snapshot angesehen", () => {
    const merker = ALLE_MERKER.map((m) =>
      m.name === seedCheck.MINIJOB_RENTE_MARKER ? { ...m, details: { changed: false } } : m,
    );
    const { aenderungen } = seedCheck.planeStatusAbgleich([festhaengenderMinijob()], merker);
    expect(aenderungen[0].snapshotKorrekturen).not.toContain(seedCheck.MINIJOB_RENTE_MARKER);
  });

  it("fasst die Snapshots nicht festhaengender Vorgaenge nie an", () => {
    const { aenderungen } = seedCheck.planeStatusAbgleich(
      [
        festhaengenderMinijob({
          status: "SUBMITTED",
          submittedAt: ZEIT,
          supervisorSubmittedAt: null,
          personalData: { currentStep: 12, isComplete: true },
        }),
      ],
      ALLE_MERKER,
    );
    expect(aenderungen[0]).toMatchObject({ nach: "SUPERVISOR_PENDING", snapshot: null });
  });

  it("veraendert den uebergebenen Snapshot nicht", () => {
    const v = festhaengenderMinijob();
    const vorher = JSON.stringify(v.formTemplateSnapshot);
    seedCheck.planeStatusAbgleich([v], ALLE_MERKER);
    expect(JSON.stringify(v.formTemplateSnapshot)).toBe(vorher);
  });
});

describe("Rente-Regel (herausgezogen, verhaltensgleich)", () => {
  it("ergaenzt Schritt 11, wenn er fehlt, und schaltet ihn sonst nur ein", () => {
    expect(seedCheck.aktiviereRenteSchritt([{ step: 1, enabled: true }])).toEqual([
      { step: 1, enabled: true },
      { step: seedCheck.RENTE_SCHRITT, title: "Rentenversicherung", enabled: true },
    ]);
    expect(
      seedCheck.aktiviereRenteSchritt([{ step: seedCheck.RENTE_SCHRITT, title: "X", enabled: false }]),
    ).toEqual([{ step: seedCheck.RENTE_SCHRITT, title: "X", enabled: true }]);
    expect(seedCheck.renteSchrittAktiv([{ step: seedCheck.RENTE_SCHRITT, enabled: true }])).toBe(true);
    expect(seedCheck.renteSchrittAktiv([])).toBe(false);
  });
});
