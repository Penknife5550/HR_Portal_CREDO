/**
 * Tests: Abschluss des Austritts mit Warnung (PATCH /api/offboarding/[id])
 *
 * Paket A4 (Ausstattung & Zugaenge, Feinplan S31, G18, E-A33): Der
 * COMPLETED-Zweig laeuft in EINER Transaktion –
 *   1. ein neuer letzter Arbeitstag im selben PATCH: `letztenArbeitstagSperren`
 *      zuerst;
 *   2. Sperre per bedingtem `updateMany` auf den gelesenen Status (0 Treffer →
 *      409 INZWISCHEN_GEAENDERT);
 *   3. Zaehlung der offenen Rueckgaben Stueck fuer Stueck
 *      (`offeneRueckgabenZaehlenIn`): offene Rueckgabe-Zeilen (auch von HR
 *      erfasste), offene Sperr- und Folgeaufgaben, je Ausgabe einmal;
 *   4. ohne `bestaetigt` und mit offenen Stuecken: 409 `{ error, grund:
 *      "RUECKGABEN_OFFEN", offen: [{ titel, stelle }] }`, nichts geschrieben –
 *      auch kein `exitData`, das im selben Body kam;
 *   5. danach `exitData`, das Update, die Faelligkeiten und die Loeschfrist
 *      der offen gebliebenen Ausgaben (drei Jahre ab Ende des Berliner Jahres
 *      des Abschlusses, `offeneAusgabenAbschliessenIn`); Protokoll
 *      `offeneRueckgaben`.
 * Bei allen anderen PATCHes bleibt es wie bisher (exitData davor, keine
 * Zaehlung). Die Webhook-Payload von `offboarding-completed` bleibt gleich.
 *
 * Aufbau nach dem Muster von onboarding-status-patch.test.ts (Faelle,
 * Reihenfolge per `invocationCallOrder`, Frist im selben Commit). Gerechnet
 * wird aber auf der kleinen In-Memory-Datenbank
 * (src/__tests__/hilfen/abteilungs-fake-db.ts): Zaehlung, Stellennamen,
 * Fristen und das Verschieben der Faelligkeiten laufen so durch die ECHTEN
 * Dienste. Die Fake-Datenbank rollt nicht zurueck – „nichts geschrieben“
 * heisst hier: kein Schreibaufruf nach der Sperre.
 */

const mockGetSession = jest.fn();
const mockTrigger = jest.fn(async (_event: string, _payload: Record<string, unknown>) => ({ status: "SENT" }));

jest.mock("@/lib/db", () => ({
  prisma: jest.requireActual("../hilfen/abteilungs-fake-db").fakePrisma,
}));
jest.mock("@/lib/auth", () => ({ getSession: () => mockGetSession() }));
jest.mock("@/lib/webhooks", () => ({
  triggerWebhooks: (e: string, p: Record<string, unknown>) => mockTrigger(e, p),
}));
jest.mock("@/lib/encryption", () => ({
  encrypt: (v: string) => `enc:${v}`,
  decrypt: (v: string) => v,
  isEncryptionConfigured: () => false,
}));

import { NextRequest } from "next/server";
import {
  db,
  dbLeeren,
  fakePrisma,
  neueAusgabe,
  neueOffboardingAufgabe,
  neueRueckgabe,
  type Zeile,
} from "../hilfen/abteilungs-fake-db";
import { PATCH } from "@/app/api/offboarding/[id]/route";
import { MELDUNGEN_AUSGABEN } from "@/lib/ausgaben";
import { offboardingMailFelder } from "@/lib/offboarding-mail";
import type { SessionPayload } from "@/lib/permissions";

// =============================================
// Fake-Datenbank: was nur diese Route braucht
// =============================================

type FakeTabelle = Record<string, jest.Mock>;
const fp = fakePrisma as unknown as Record<string, FakeTabelle> & { $transaction: jest.Mock };
fp.offboardingExitData = { upsert: jest.fn(async () => ({})) };

const echtTransaktion = fp.$transaction.getMockImplementation();
const echtAusgabeUpdateMany = fp.ausgabe.updateMany.getMockImplementation() as (args: unknown) => Promise<unknown>;

// =============================================
// Testdaten
// =============================================

const BASIS = "https://hr.example.org";
const KENNUNG = "FES-IPAD-0412";

const HR: SessionPayload = {
  userId: "u-hr",
  email: "hr@example.org",
  role: "HR_SACHBEARBEITER",
  firstName: "Erika",
  lastName: "Sachbearbeiter",
};
const ADMIN: SessionPayload = { ...HR, userId: "u-admin", role: "SUPER_ADMIN" };

function vorgang(teil: Zeile = {}): Zeile {
  return {
    id: "off-1",
    displayId: "OFF-2027-GYM-014",
    organizationId: "org-1",
    arbeitsortId: null,
    onboardingId: "onb-1",
    status: "FINAL_SETTLEMENT",
    exitType: "KUENDIGUNG_ARBEITNEHMER",
    employeeEmail: "max.mustermann@example.org",
    employeePrivateEmail: null,
    employeeFirstName: "Max",
    employeeLastName: "Mustermann",
    lastWorkingDay: new Date("2027-07-31T00:00:00.000Z"),
    supervisorEmail: null,
    supervisorName: null,
    organization: { id: "org-1", name: "FES Minden", mandantNumber: "01" },
    zeugnisBewertung: null,
    contractEnd: null,
    ...teil,
  };
}

const UEBERGEBEN = new Date("2027-02-01T00:00:00.000Z");
const VERMERKT = new Date("2027-02-01T09:00:00.000Z");
/** Frist einer schon zurueckgenommenen Ausgabe (sechs Monate) – bleibt beim Abschluss. */
const FRIST_ZURUECK = new Date("2028-01-31T23:00:00.000Z");

function ausgabe(teil: Zeile): Zeile {
  return neueAusgabe({
    onboardingId: "onb-1",
    organizationId: "org-1",
    departmentKey: "IT",
    bezeichnung: "Stück",
    beiAustritt: "RUECKGABE",
    quelle: "LINK",
    uebergebenAm: UEBERGEBEN,
    zustandAm: VERMERKT,
    ...teil,
  });
}

function rueckgabe(teil: Zeile): Zeile {
  return neueRueckgabe({ offboardingId: "off-1", category: "IT_HARDWARE", itemName: "Stück", ...teil });
}

function aufgabe(teil: Zeile): Zeile {
  return neueOffboardingAufgabe({
    offboardingId: "off-1",
    category: "Ausstattung & Zugänge",
    assigneeDepartment: "IT",
    ...teil,
  });
}

/**
 * Ein Austritt mit der Einstellung onb-1:
 *   - Dienst-iPad: Rueckgabe offen, Ruecknahmeaufgabe offen (zaehlt EINMAL);
 *   - Zugaenge: Sperraufgabe offen (ohne Rueckgabe-Zeile);
 *   - Laptop: zurueck (Rueckgabe ZURUECK, Aufgabe erledigt, Frist 6 Monate);
 *   - Schluessel: verbleibt (Bestand der Person, ohne Frist);
 *   - Parkausweis: von HR erfasst, offen (Personalabteilung);
 *   - ein Vorlagenpunkt, offen (zaehlt nicht);
 *   - eine fremde Ausgabe derselben Einstellung, die dieser Austritt nicht bezieht.
 */
function austrittMitRueckgaben(): void {
  db.ausgaben = [
    ausgabe({ id: "ag-ipad", bezeichnung: "Dienst-iPad (Lernmittel)", kennung: KENNUNG, rueckgabeKategorie: "IT_HARDWARE" }),
    ausgabe({ id: "ag-zugang", bezeichnung: "Zugänge (Portal, E-Mail)", beiAustritt: "SPERREN" }),
    ausgabe({
      id: "ag-laptop",
      bezeichnung: "Dienst-Laptop/PC",
      zustand: "ZURUECK",
      zustandAm: new Date("2027-07-31T08:00:00.000Z"),
      loeschenAb: FRIST_ZURUECK,
    }),
    ausgabe({ id: "ag-schluessel", departmentKey: "FACILITY", bezeichnung: "Schlüssel: Haupteingang", zustand: "VERBLEIBT", rueckgabeKategorie: "SCHLUESSEL" }),
    ausgabe({ id: "ag-fremd", bezeichnung: "Kopierkarte" }),
  ];
  db.rueckgaben = [
    rueckgabe({ id: "r-ipad", itemName: "Dienst-iPad (Lernmittel)", serialNumber: KENNUNG, ausgabeId: "ag-ipad", createdAt: new Date("2027-07-01T08:00:00.000Z") }),
    rueckgabe({ id: "r-laptop", itemName: "Dienst-Laptop/PC", ausgabeId: "ag-laptop", zustand: "ZURUECK", isReturned: true, createdAt: new Date("2027-07-01T08:00:01.000Z") }),
    rueckgabe({ id: "r-schluessel", category: "SCHLUESSEL", itemName: "Schlüssel: Haupteingang", ausgabeId: "ag-schluessel", zustand: "VERBLEIBT", createdAt: new Date("2027-07-01T08:00:02.000Z") }),
    rueckgabe({ id: "r-park", category: "SONSTIGES", itemName: "Parkausweis", createdAt: new Date("2027-07-02T08:00:00.000Z") }),
  ];
  db.aufgaben = [
    aufgabe({ id: "t-ipad", title: "Dienst-iPad (Lernmittel) zurücknehmen", herkunft: "AUSGABE", ausgabeId: "ag-ipad", orderIndex: 1 }),
    aufgabe({ id: "t-zugang", title: "Zugänge (Portal, E-Mail) sperren", herkunft: "AUSGABE", ausgabeId: "ag-zugang", orderIndex: 2 }),
    aufgabe({ id: "t-laptop", title: "Dienst-Laptop/PC zurücknehmen", herkunft: "AUSGABE", ausgabeId: "ag-laptop", orderIndex: 3, isCompleted: true }),
    aufgabe({ id: "t-schluessel", title: "Schlüssel: Haupteingang zurücknehmen", herkunft: "AUSGABE", ausgabeId: "ag-schluessel", assigneeDepartment: "FACILITY", orderIndex: 4, isCompleted: true }),
    aufgabe({ id: "t-vorlage", title: "Postfach umleiten", category: "Phase 5: Letzter Tag", orderIndex: 100 }),
  ];
}

/** Die Rueckfrage zu `austrittMitRueckgaben` – Titel und Stelle, nie die Kennung. */
const OFFEN = [
  { titel: "Dienst-iPad (Lernmittel)", stelle: "IT-Abteilung FES" },
  { titel: "Parkausweis", stelle: "Personalabteilung" },
  { titel: "Zugänge (Portal, E-Mail) sperren", stelle: "IT-Abteilung FES" },
];

function patch(body: unknown, id = "off-1") {
  return PATCH(
    new NextRequest(`${BASIS}/api/offboarding/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );
}

const ag = (id: string) => db.ausgaben.find((a) => a.id === id) as Zeile;
const reihenfolge = (fn: jest.Mock, i = 0) => fn.mock.invocationCallOrder[i];
/** Schreibaufrufe auf Ausgaben, die eine Frist setzen (die Sperre schreibt nur `updatedAt`). */
const fristUpdates = () =>
  fp.ausgabe.updateMany.mock.calls
    .map((c) => c[0] as { where: Zeile; data: Zeile })
    .filter((arg) => "loeschenAb" in arg.data);

let inTransaktion: boolean;
let fristInTransaktion: boolean[];

beforeEach(() => {
  jest.clearAllMocks();
  dbLeeren();
  db.vorgaenge = [vorgang()];
  db.konfigs = [
    { departmentKey: "IT", departmentName: "IT-Abteilung FES", email: "it@example.org", organizationId: null, isActive: true },
    { departmentKey: "FACILITY", departmentName: "Hausmeister Gymnasium", email: "fm@example.org", organizationId: null, isActive: true },
  ];
  mockGetSession.mockResolvedValue(HR);
  inTransaktion = false;
  fristInTransaktion = [];
  fp.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => {
    inTransaktion = true;
    try {
      return await fn(fakePrisma);
    } finally {
      inTransaktion = false;
    }
  });
  fp.ausgabe.updateMany.mockImplementation(async (args: { data: Zeile }) => {
    if ("loeschenAb" in args.data) fristInTransaktion.push(inTransaktion);
    return echtAusgabeUpdateMany(args);
  });
});

afterAll(() => {
  fp.$transaction.mockImplementation(echtTransaktion);
  fp.ausgabe.updateMany.mockImplementation(echtAusgabeUpdateMany);
});

// =============================================
// Rueckfrage ohne Bestaetigung
// =============================================

describe("offene Rückgaben ohne Bestätigung → 409 RUECKGABEN_OFFEN", () => {
  beforeEach(austrittMitRueckgaben);

  it("nennt Titel und Stelle je Stück – ohne Kennung – und schreibt nichts, auch kein exitData aus demselben Body", async () => {
    const res = await patch({ status: "COMPLETED", exitData: { remainingVacationDays: 3, severancePay: "1000" } });

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body).toEqual({ error: MELDUNGEN_AUSGABEN.RUECKGABEN_OFFEN(3), grund: "RUECKGABEN_OFFEN", offen: OFFEN });
    expect(body.error).toBe(
      "3 Rückgaben oder Sperren sind noch offen. Der Austritt lässt sich trotzdem abschließen – bitte bestätigen.",
    );
    expect(JSON.stringify(body)).not.toContain(KENNUNG);

    // Nichts geschrieben: kein exitData, kein Update, keine Frist, kein Protokoll, kein Webhook.
    expect(fp.offboardingExitData.upsert).not.toHaveBeenCalled();
    expect(fp.offboardingProcess.update).not.toHaveBeenCalled();
    expect(db.vorgaenge[0]).toMatchObject({ status: "FINAL_SETTLEMENT" });
    expect(db.vorgaenge[0].completedAt).toBeUndefined();
    expect(fristUpdates()).toEqual([]);
    expect(fp.ausgabe.updateMany).not.toHaveBeenCalled();
    expect(db.audits).toEqual([]);
    expect(mockTrigger).not.toHaveBeenCalled();
  });

  it("`bestaetigt: false` gilt wie keine Bestätigung", async () => {
    const res = await patch({ status: "COMPLETED", bestaetigt: false });
    expect(res.status).toBe(409);
    expect((await res.json()).grund).toBe("RUECKGABEN_OFFEN");
  });

  it("gezählt wird NACH der Sperre auf den gelesenen Status, in derselben Transaktion", async () => {
    await patch({ status: "COMPLETED" });

    expect(fp.$transaction).toHaveBeenCalledTimes(1);
    expect(fp.offboardingProcess.updateMany.mock.calls[0][0]).toMatchObject({
      where: { id: "off-1", status: "FINAL_SETTLEMENT" },
    });
    expect(reihenfolge(fp.offboardingProcess.updateMany)).toBeLessThan(reihenfolge(fp.returnItem.findMany));
    expect(reihenfolge(fp.offboardingProcess.updateMany)).toBeLessThan(
      reihenfolge(fp.offboardingChecklistItem.findMany),
    );
  });

  it("dasselbe Stück zählt einmal; erledigte, zurückgegebene, verbliebene und Vorlagenpunkte zählen nicht", async () => {
    // Nur noch die Rueckgabe des iPads offen (Zeile und Ruecknahmeaufgabe).
    db.rueckgaben = db.rueckgaben.filter((r) => r.id !== "r-park");
    db.aufgaben = db.aufgaben.filter((a) => a.id !== "t-zugang");

    const res = await patch({ status: "COMPLETED" });

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: "1 Rückgabe oder Sperre ist noch offen. Der Austritt lässt sich trotzdem abschließen – bitte bestätigen.",
      grund: "RUECKGABEN_OFFEN",
      offen: [{ titel: "Dienst-iPad (Lernmittel)", stelle: "IT-Abteilung FES" }],
    });
  });

  it("eine offene Folgeaufgabe „Schließung prüfen“ zählt (bei der Gebäudewirtschaft)", async () => {
    db.rueckgaben = [];
    db.aufgaben = [
      aufgabe({
        id: "t-folge",
        title: "Schließung prüfen: Schlüssel: Haupteingang",
        herkunft: "AUSGABE_FEHLT",
        ausgabeId: "ag-schluessel",
        assigneeDepartment: "FACILITY",
      }),
    ];
    const res = await patch({ status: "COMPLETED" });
    expect(res.status).toBe(409);
    expect((await res.json()).offen).toEqual([
      { titel: "Schließung prüfen: Schlüssel: Haupteingang", stelle: "Hausmeister Gymnasium" },
    ]);
  });

  it("hat sich der Status inzwischen bewegt, gibt es 409 INZWISCHEN_GEAENDERT – ohne Zählung, ohne Schreiben", async () => {
    // Der PATCH hat den Austritt vor einem gleichzeitigen Abschluss gelesen.
    db.vorgaenge[0].status = "COMPLETED";
    fp.offboardingProcess.findUnique.mockImplementationOnce(async () => vorgang());

    const res = await patch({ status: "COMPLETED", bestaetigt: true, exitData: { remainingVacationDays: 3 } });

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: MELDUNGEN_AUSGABEN.INZWISCHEN_GEAENDERT,
      grund: "INZWISCHEN_GEAENDERT",
    });
    expect(fp.returnItem.findMany).not.toHaveBeenCalled();
    expect(fp.offboardingExitData.upsert).not.toHaveBeenCalled();
    expect(fp.offboardingProcess.update).not.toHaveBeenCalled();
    expect(fp.ausgabe.updateMany).not.toHaveBeenCalled();
    expect(db.audits).toEqual([]);
    expect(mockTrigger).not.toHaveBeenCalled();
  });
});

// =============================================
// Abschluss mit Bestaetigung
// =============================================

describe("mit Bestätigung: 200, Protokoll und Löschfrist der offenen Ausgaben", () => {
  // 01.01.2028, 00:30 Uhr in Berlin — in UTC noch der 31.12.2027. Das
  // BERLINER Jahr des Abschlusses zaehlt: drei Jahre ab Jahresende = 1.1.2032.
  const ABSCHLUSS = new Date("2027-12-31T23:30:00.000Z");
  const FRIST = new Date("2031-12-31T23:00:00.000Z");
  const NUR_DATUM_FAELSCHEN = [
    "hrtime",
    "nextTick",
    "performance",
    "queueMicrotask",
    "requestAnimationFrame",
    "cancelAnimationFrame",
    "requestIdleCallback",
    "cancelIdleCallback",
    "setImmediate",
    "clearImmediate",
    "setInterval",
    "clearInterval",
    "setTimeout",
    "clearTimeout",
  ] as const;

  beforeEach(() => {
    jest.useFakeTimers({ now: ABSCHLUSS, doNotFake: [...NUR_DATUM_FAELSCHEN] });
    austrittMitRueckgaben();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("schließt ab und protokolliert die Zahl der offen gebliebenen Stücke", async () => {
    const res = await patch({ status: "COMPLETED", bestaetigt: true });

    expect(res.status).toBe(200);
    expect(db.vorgaenge[0]).toMatchObject({ status: "COMPLETED", completedAt: ABSCHLUSS });
    expect(db.audits).toHaveLength(1);
    expect(db.audits[0]).toMatchObject({
      offboardingId: "off-1",
      userId: "u-hr",
      processType: "OFFBOARDING",
      action: "STATUS_CHANGED",
      details: { statusFrom: "FINAL_SETTLEMENT", statusTo: "COMPLETED", offeneRueckgaben: 3 },
    });
    // Nur die Zahl – nie Titel oder Kennung.
    expect(JSON.stringify(db.audits[0])).not.toContain(KENNUNG);
    expect(JSON.stringify(db.audits[0])).not.toContain("Dienst-iPad");
  });

  it("jede offene Ausgabe des Austritts bekommt drei Jahre ab Ende des Berliner Jahres des Abschlusses – Zustand bleibt", async () => {
    await patch({ status: "COMPLETED", bestaetigt: true });

    // Offen geblieben: iPad (Rueckgabe offen) und Zugaenge (Sperraufgabe offen).
    for (const id of ["ag-ipad", "ag-zugang"]) {
      expect({ id, zustand: ag(id).zustand, zustandAm: ag(id).zustandAm, loeschenAb: ag(id).loeschenAb }).toEqual({
        id,
        zustand: "AUSGEGEBEN",
        zustandAm: VERMERKT,
        loeschenAb: FRIST,
      });
    }
    // Zurueckgenommen: eigene, kuerzere Frist bleibt. Verbleibt: ohne Frist (G20).
    expect(ag("ag-laptop").loeschenAb).toEqual(FRIST_ZURUECK);
    expect(ag("ag-schluessel").loeschenAb).toBeNull();
    // Nicht von diesem Austritt bezogen: unberuehrt.
    expect(ag("ag-fremd").loeschenAb).toBeNull();

    // EIN Update, bedingt auf AUSGEGEBEN, im selben Commit.
    expect(fristUpdates()).toEqual([
      { where: { id: { in: ["ag-ipad", "ag-zugang"] }, zustand: "AUSGEGEBEN" }, data: { loeschenAb: FRIST } },
    ]);
    expect(fristInTransaktion).toEqual([true]);
  });

  it("Reihenfolge: Sperre → Zählung → exitData → Update → Ausgaben sperren → Frist; exitData aus demselben Body wird geschrieben", async () => {
    const res = await patch({ status: "COMPLETED", bestaetigt: true, exitData: { remainingVacationDays: 3 } });

    expect(res.status).toBe(200);
    expect(fp.$transaction).toHaveBeenCalledTimes(1);
    expect(fp.offboardingExitData.upsert).toHaveBeenCalledTimes(1);
    expect(fp.offboardingExitData.upsert.mock.calls[0][0]).toEqual({
      where: { offboardingId: "off-1" },
      create: { offboardingId: "off-1", remainingVacationDays: 3 },
      update: { remainingVacationDays: 3 },
    });

    const ausgabeUpdates = fp.ausgabe.updateMany.mock.invocationCallOrder;
    const folge = [
      reihenfolge(fp.offboardingProcess.updateMany),
      reihenfolge(fp.returnItem.findMany),
      reihenfolge(fp.offboardingExitData.upsert),
      reihenfolge(fp.offboardingProcess.update),
      ausgabeUpdates[0],
      ausgabeUpdates[ausgabeUpdates.length - 1],
    ];
    expect(folge).toEqual([...folge].sort((a, b) => a - b));
    // Gesperrt wird je Stueck, nach `id` sortiert (G24), erst danach die Frist.
    const sperren = fp.ausgabe.updateMany.mock.calls
      .map((c) => c[0] as { where: { id: string }; data: Zeile })
      .filter((arg) => !("loeschenAb" in arg.data));
    expect(sperren.map((s) => s.where.id)).toEqual(["ag-ipad", "ag-zugang"]);
  });

  it("ein unverändert übernommenes VERBLEIBT, das hier offen blieb: AUSGEGEBEN mit derselben Frist und protokolliert; ein hier gesetztes VERBLEIBT bleibt frei (Review A4c)", async () => {
    // Ein früherer Austritt gab den Dienstausweis mit „verbleibt“ frei; dieser übernahm ihn und ließ ihn offen.
    db.ausgaben.push(ausgabe({ id: "ag-ausweis", bezeichnung: "Dienstausweis", zustand: "VERBLEIBT", kennung: "DA-77" }));
    db.rueckgaben.push(
      rueckgabe({ id: "r-ausweis", category: "DOKUMENTE", itemName: "Dienstausweis", ausgabeId: "ag-ausweis", createdAt: new Date("2027-07-03T08:00:00.000Z") }),
    );
    db.aufgaben.push(aufgabe({ id: "t-ausweis", title: "Dienstausweis zurücknehmen", herkunft: "AUSGABE", ausgabeId: "ag-ausweis", orderIndex: 5 }));

    // Ohne Bestätigung steht er in der Rückfrage.
    const rueckfrage = await patch({ status: "COMPLETED" });
    expect(rueckfrage.status).toBe(409);
    expect((await rueckfrage.json()).offen).toContainEqual({ titel: "Dienstausweis", stelle: "IT-Abteilung FES" });

    const res = await patch({ status: "COMPLETED", bestaetigt: true });
    expect(res.status).toBe(200);
    // Offen beim Abschluss: AUSGEGEBEN mit drei Jahren ab Jahresende – bleibt an diesen Austritt gebunden.
    expect(ag("ag-ausweis")).toMatchObject({ zustand: "AUSGEGEBEN", zustandAm: ABSCHLUSS, loeschenAb: FRIST });
    // Hier mit „verbleibt“ erledigt: frei, ohne Frist (G20).
    expect(ag("ag-schluessel")).toMatchObject({ zustand: "VERBLEIBT", loeschenAb: null });
    expect(db.audits).toContainEqual(
      expect.objectContaining({
        action: "AUSGABE_ZUSTAND_GEAENDERT",
        userId: "u-hr",
        offboardingId: "off-1",
        details: { ausgabeId: "ag-ausweis", von: "VERBLEIBT", nach: "AUSGEGEBEN", ueber: "ABSCHLUSS", folgeaufgabe: null },
      }),
    );
    expect(JSON.stringify(db.audits)).not.toContain("DA-77");
    expect(fristInTransaktion.every(Boolean)).toBe(true);
  });

  it("ein anderer, laufender Austritt, der ein Stück bezieht, behält es ohne Frist", async () => {
    // Nach einem Admin-Abschluss denkbar: Ein zweiter Austritt fuehrt das iPad.
    db.vorgaenge.push(vorgang({ id: "off-2", displayId: "OFF-2027-GYM-020", status: "HANDOVER_PHASE" }));
    db.rueckgaben.push(rueckgabe({ id: "r-ipad-2", offboardingId: "off-2", ausgabeId: "ag-ipad" }));

    await patch({ status: "COMPLETED", bestaetigt: true });

    expect(ag("ag-ipad").loeschenAb).toBeNull();
    expect(ag("ag-zugang").loeschenAb).toEqual(FRIST);
  });
});

// =============================================
// Ohne offene Rueckgaben
// =============================================

describe("ohne offene Rückgaben", () => {
  it("genügt der erste Klick; Protokoll wie bisher, keine Stellennamen, keine Frist", async () => {
    austrittMitRueckgaben();
    db.rueckgaben = db.rueckgaben.filter((r) => r.id !== "r-ipad" && r.id !== "r-park");
    db.aufgaben = db.aufgaben.filter((a) => a.id !== "t-ipad" && a.id !== "t-zugang");

    const res = await patch({ status: "COMPLETED" });

    expect(res.status).toBe(200);
    expect(db.vorgaenge[0].status).toBe("COMPLETED");
    expect(db.audits[0]).toMatchObject({ action: "STATUS_CHANGED" });
    expect(db.audits[0].details).toEqual({ statusFrom: "FINAL_SETTLEMENT", statusTo: "COMPLETED" });
    expect(fp.departmentConfig.findMany).not.toHaveBeenCalled();
    expect(fristUpdates()).toEqual([]);
  });

  it("ein Austritt ohne Einstellung und ohne Rückgaben: keine Rückfrage, keine Ausgabe-Abfrage", async () => {
    db.vorgaenge = [vorgang({ onboardingId: null })];

    const res = await patch({ status: "COMPLETED" });

    expect(res.status).toBe(200);
    expect(fp.ausgabe.findMany).not.toHaveBeenCalled();
    expect(fp.ausgabe.updateMany).not.toHaveBeenCalled();
  });
});

// =============================================
// Was unveraendert bleibt
// =============================================

describe("unverändert", () => {
  it("nur `bestaetigt` ist keine Änderung → 400 „Mindestens ein Feld erforderlich“ (1.4)", async () => {
    for (const bestaetigt of [true, false]) {
      const res = await patch({ bestaetigt });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Mindestens ein Feld erforderlich" });
    }
    expect(fp.$transaction).not.toHaveBeenCalled();
    expect(fp.offboardingProcess.update).not.toHaveBeenCalled();
    expect(db.audits).toEqual([]);
  });

  it("ein anderer Wert als true/false für `bestaetigt` ist ungültig (400)", async () => {
    const res = await patch({ status: "COMPLETED", bestaetigt: "ja" });
    expect(res.status).toBe(400);
    expect(fp.offboardingProcess.findUnique).not.toHaveBeenCalled();
  });

  describe("Admin-Override", () => {
    beforeEach(() => {
      db.vorgaenge = [vorgang({ status: "HANDOVER_PHASE" })];
      austrittMitRueckgaben();
    });

    it("SUPER_ADMIN schließt weiter direkt ab – die Rückfrage gilt auch dort", async () => {
      mockGetSession.mockResolvedValue(ADMIN);

      const ohne = await patch({ status: "COMPLETED" });
      expect(ohne.status).toBe(409);
      expect((await ohne.json()).grund).toBe("RUECKGABEN_OFFEN");

      const mit = await patch({ status: "COMPLETED", bestaetigt: true });
      expect(mit.status).toBe(200);
      expect(db.vorgaenge[0].status).toBe("COMPLETED");
      expect(db.audits[0].details).toMatchObject({ statusFrom: "HANDOVER_PHASE", statusTo: "COMPLETED", offeneRueckgaben: 3 });
    });

    it("die Sachbearbeitung nicht: 400 vor jeder Transaktion", async () => {
      const res = await patch({ status: "COMPLETED", bestaetigt: true });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toContain("Ungueltiger Status-Uebergang");
      expect(fp.$transaction).not.toHaveBeenCalled();
    });
  });

  it("Webhook `offboarding-completed`: dieselbe Payload wie bisher, ohne Kennung – und nie bei einer Rückfrage", async () => {
    austrittMitRueckgaben();

    await patch({ status: "COMPLETED" });
    expect(mockTrigger).not.toHaveBeenCalled();

    const res = await patch({ status: "COMPLETED", bestaetigt: true });
    expect(res.status).toBe(200);
    expect(mockTrigger).toHaveBeenCalledTimes(1);
    const [event, payload] = mockTrigger.mock.calls[0];
    expect(event).toBe("offboarding-completed");
    const v = db.vorgaenge[0] as Zeile & Parameters<typeof offboardingMailFelder>[0];
    expect(payload).toEqual({
      ...offboardingMailFelder(v),
      employeeEmail: "max.mustermann@example.org",
      completedAt: (v.completedAt as Date).toISOString(),
      // Offen: iPad- und Sperraufgabe sowie der Vorlagenpunkt.
      offene_aufgaben_beim_abschluss: "3",
    });
    expect(JSON.stringify(payload)).not.toContain(KENNUNG);
  });

  it("ein neuer letzter Arbeitstag im selben PATCH verschiebt weiter – in derselben Transaktion, nach seiner Sperre", async () => {
    austrittMitRueckgaben();
    const vorlage = db.aufgaben.find((a) => a.id === "t-vorlage") as Zeile;
    vorlage.dueDate = new Date("2027-07-31T00:00:00.000Z");

    const res = await patch({ status: "COMPLETED", bestaetigt: true, lastWorkingDay: "2027-08-14" });

    expect(res.status).toBe(200);
    expect(fp.$transaction).toHaveBeenCalledTimes(1);
    expect((vorlage.dueDate as Date).toISOString()).toBe("2027-08-14T00:00:00.000Z");
    expect((db.vorgaenge[0].lastWorkingDay as Date).toISOString()).toBe("2027-08-14T00:00:00.000Z");
    // Zuerst letztenArbeitstagSperren (ohne Status), dann die Sperre auf den gelesenen Status.
    expect(fp.offboardingProcess.updateMany.mock.calls.map((c) => c[0].where)).toEqual([
      { id: "off-1" },
      { id: "off-1", status: "FINAL_SETTLEMENT" },
    ]);
    expect(db.audits[0].details).toMatchObject({
      statusTo: "COMPLETED",
      lastWorkingDay: "2027-08-14",
      lastWorkingDayFrom: "2027-07-31",
      faelligkeitenVerschoben: 1,
      offeneRueckgaben: 3,
    });
  });

  it("bei der Rückfrage verschiebt ein mitgeschickter letzter Arbeitstag nichts", async () => {
    austrittMitRueckgaben();
    const vorlage = db.aufgaben.find((a) => a.id === "t-vorlage") as Zeile;
    vorlage.dueDate = new Date("2027-07-31T00:00:00.000Z");

    const res = await patch({ status: "COMPLETED", lastWorkingDay: "2027-08-14" });

    expect(res.status).toBe(409);
    expect((vorlage.dueDate as Date).toISOString()).toBe("2027-07-31T00:00:00.000Z");
    expect((db.vorgaenge[0].lastWorkingDay as Date).toISOString()).toBe("2027-07-31T00:00:00.000Z");
  });

  it("exitData ohne Statuswechsel wird wie bisher geschrieben – vor dem Update, ohne Transaktion und ohne Zählung", async () => {
    austrittMitRueckgaben();

    const res = await patch({ exitData: { remainingVacationDays: 3, severancePay: "1000", unbekannt: "x" } });

    expect(res.status).toBe(200);
    expect(fp.offboardingExitData.upsert.mock.calls[0][0]).toEqual({
      where: { offboardingId: "off-1" },
      create: { offboardingId: "off-1", remainingVacationDays: 3, severancePay: "enc:1000" },
      update: { remainingVacationDays: 3, severancePay: "enc:1000" },
    });
    expect(reihenfolge(fp.offboardingExitData.upsert)).toBeLessThan(reihenfolge(fp.offboardingProcess.update));
    expect(fp.$transaction).not.toHaveBeenCalled();
    expect(fp.returnItem.findMany).not.toHaveBeenCalled();
    expect(db.audits[0]).toMatchObject({ action: "OFFBOARDING_UPDATED" });
  });

  it("ein anderer Statuswechsel zählt nichts und fragt nicht", async () => {
    austrittMitRueckgaben();
    db.vorgaenge = [vorgang({ status: "HANDOVER_PHASE" })];

    const res = await patch({ status: "FINAL_SETTLEMENT", exitData: { remainingVacationDays: 1 } });

    expect(res.status).toBe(200);
    expect(db.vorgaenge[0].status).toBe("FINAL_SETTLEMENT");
    expect(fp.offboardingExitData.upsert).toHaveBeenCalledTimes(1);
    expect(fp.returnItem.findMany).not.toHaveBeenCalled();
    expect(fp.ausgabe.updateMany).not.toHaveBeenCalled();
  });
});
