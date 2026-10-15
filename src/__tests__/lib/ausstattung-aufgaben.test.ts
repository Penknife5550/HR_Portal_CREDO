/**
 * Tests: Ausstattungsaufgaben anlegen und nachholen (Feinplan S12)
 *
 * src/lib/ausstattung-aufgaben.ts (`ausstattungsAufgabenAnlegenIn`, Feinplan
 * 1.7 Schritte 2–5) und das Nachholen im Onboarding-Adapter
 * (`onboardingAusstattungNachholenIn`, Schritte 1–9) — gegen die kleine
 * In-Memory-Datenbank (src/__tests__/hilfen/abteilungs-fake-db.ts).
 *
 * Geprueft werden Zustaende (Aufgaben, Verknuepfungen, Aenderungsliste,
 * Abteilungsstatus, Protokoll) und die Sperrreihenfolge Vorgang → Links →
 * Aufgaben (F5) ueber die Aufrufreihenfolge der Mocks — das Sperrverhalten von
 * Postgres bildet der Fake nicht nach. Die reinen Regeln (sollAufgaben,
 * ausstattungsFaelligkeit, anzuhebendeAufgaben) stehen in ausstattung.test.ts,
 * die Anhebung beim Versand (F22) samt Aktionen in
 * abteilungsaufgaben-onboarding.test.ts.
 *
 * Seit S15 die Bausteine der HR-Karte: `aufgabeEntfallenIn` (F2, bedingt),
 * `aufgabeWiederAufnehmenIn` (F23) und `aenderungenSchreibenIn` (Regel 10,
 * ohne Doppel gegen den noch nicht gesendeten Stand). Die Aktionen selbst
 * stehen in ausstattung-dienst.test.ts.
 */

jest.mock("@/lib/db", () => ({
  prisma: jest.requireActual("../hilfen/abteilungs-fake-db").fakePrisma,
}));
jest.mock("@/lib/webhooks", () => ({ triggerWebhooks: jest.fn() }));

import type { Prisma } from "@prisma/client";
import {
  db,
  dbLeeren,
  fakePrisma,
  neueAusstattungsZeile,
  neueOnboardingAufgabe,
  neuerLink,
  neuerStellenHinweis,
  type Zeile,
} from "../hilfen/abteilungs-fake-db";
import { onboardingAusstattungNachholenIn, vorgangSperrenIn } from "@/lib/abteilungsaufgaben-onboarding";
import {
  HinweisSchonVerknuepft,
  aenderungenSchreibenIn,
  aufgabeEntfallenIn,
  aufgabeWiederAufnehmenIn,
  ausstattungsAufgabenAnlegenIn,
} from "@/lib/ausstattung-aufgaben";
import {
  AUSSTATTUNG_AUDIT,
  AUSSTATTUNG_KATEGORIE,
  HINWEIS_AUFGABE_BESCHREIBUNG,
  HINWEIS_AUFGABE_TITEL,
  HINWEIS_ORDER_BASIS,
  ORDER_BASIS,
} from "@/lib/ausstattung";
import { ABTEILUNGS_AUDIT } from "@/lib/abteilungsaufgaben";

type FakeTabelle = Record<string, jest.Mock>;
const fp = fakePrisma as unknown as Record<string, FakeTabelle>;
const tx = fakePrisma as unknown as Prisma.TransactionClient;

const JETZT = new Date("2026-09-22T08:00:00.000Z");
const BEGINN = new Date("2026-10-01T00:00:00.000Z");
const tag = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

function vorgang(teil: Zeile = {}): Zeile {
  return {
    id: "onb-1",
    displayId: "ONB-2026-031",
    organizationId: "org-1",
    status: "SUPERVISOR_SUBMITTED",
    firstName: "Anna",
    lastName: "Beispiel",
    supervisorEmail: "a.leitung@example.org",
    supervisorSubmittedAt: new Date("2026-09-20T08:00:00.000Z"),
    supervisorData: { isComplete: true, vertragsbeginn: BEGINN },
    organization: { name: "FES Minden", mandantNumber: "01" },
    ...teil,
  };
}

/** Ja/Nein an die IT. */
function ipad(teil: Zeile = {}): Zeile {
  return neueAusstattungsZeile({
    id: "aus-ipad",
    onboardingId: "onb-1",
    positionId: "pos-ipad",
    departmentKey: "IT",
    art: "JA_NEIN",
    bezeichnung: "Dienst-iPad (Lernmittel)",
    aufgabeTitel: "Dienst-iPad (Lernmittel) bereitstellen",
    hinweisStelle: "Inventarnummer im Ticket vermerken.",
    relativeDueDays: -5,
    reihenfolge: 2,
    quelle: "FUEHRUNGSKRAFT",
    bemerkung: "Bitte mit Stift",
    bemerkungQuelle: "FUEHRUNGSKRAFT",
    ...teil,
  });
}

/** Auswahl an Facility: je Option eine Aufgabe. */
function schluessel(teil: Zeile = {}): Zeile {
  return neueAusstattungsZeile({
    id: "aus-schluessel",
    onboardingId: "onb-1",
    positionId: "pos-schluessel",
    departmentKey: "FACILITY",
    art: "AUSWAHL",
    bezeichnung: "Schlüssel",
    aufgabeTitel: "Schlüssel ausgeben",
    relativeDueDays: -7,
    reihenfolge: 1,
    auswahl: ["Haupteingang", "Lehrerzimmer"],
    quelle: "FUEHRUNGSKRAFT",
    ...teil,
  });
}

function link(teil: Zeile = {}): Zeile {
  return neuerLink({
    onboardingId: "onb-1",
    departmentKey: "IT",
    departmentName: "IT-Abteilung",
    email: "it@example.org",
    token: "tok-it",
    expiresAt: new Date("2026-12-01T00:00:00.000Z"),
    sentAt: new Date("2026-09-21T08:00:00.000Z"),
    lastSentAt: new Date("2026-09-21T08:00:00.000Z"),
    lastSendStatus: "SENT",
    ...teil,
  });
}

function nachholen(opts: { jetzt?: Date; versandAn?: string[] } = {}) {
  return onboardingAusstattungNachholenIn(tx, "onb-1", { userId: "u-hr", jetzt: JETZT, ...opts });
}

const ausstattungsAufgaben = () => db.onboardingAufgaben.filter((a) => a.herkunft != null);
const audits = (action: string) => db.audits.filter((a) => a.action === action);

beforeEach(() => {
  jest.clearAllMocks();
  dbLeeren();
  db.onboardingVorgaenge = [vorgang()];
});

// =============================================
// Anlegen
// =============================================

describe("Aufgaben je Option (E-A12)", () => {
  beforeEach(() => {
    db.ausstattungZeilen = [ipad(), schluessel()];
  });

  it("legt je Option eine Aufgabe an — Titel nur aus dem Katalog, Kategorie, Stelle, Hinweis fuer die Stelle", async () => {
    const r = await nachholen();

    expect(r).toEqual({ gesperrt: true, angelegt: 3, stellen: ["FACILITY", "IT"], angehoben: 0 });
    expect(ausstattungsAufgaben().map((a) => [a.title, a.assignee, a.herkunft])).toEqual([
      ["Schlüssel ausgeben: Haupteingang", "FACILITY", "AUSSTATTUNG"],
      ["Schlüssel ausgeben: Lehrerzimmer", "FACILITY", "AUSSTATTUNG"],
      ["Dienst-iPad (Lernmittel) bereitstellen", "IT", "AUSSTATTUNG"],
    ]);
    for (const a of ausstattungsAufgaben()) {
      expect(a.category).toBe(AUSSTATTUNG_KATEGORIE);
      expect(a.orderIndex as number).toBeLessThan(0);
      expect(a.templateItemId).toBeNull();
      // Nie eine Bemerkung in `description` (Stolperstelle 13).
      expect(String(a.description ?? "")).not.toContain("Stift");
    }
    const [haupteingang, lehrerzimmer, ipadAufgabe] = ausstattungsAufgaben();
    expect(haupteingang.orderIndex).toBe(ORDER_BASIS + 100);
    expect(lehrerzimmer.orderIndex).toBe(ORDER_BASIS + 101);
    expect(ipadAufgabe.orderIndex).toBe(ORDER_BASIS + 200);
    expect(ipadAufgabe.description).toBe("Inventarnummer im Ticket vermerken.");
    expect(haupteingang.relativeDueDays).toBe(-7);

    expect(db.ausstattungAufgaben.map((v) => [v.ausstattungId, v.option, v.checklistItemId])).toEqual([
      ["aus-schluessel", "Haupteingang", haupteingang.id],
      ["aus-schluessel", "Lehrerzimmer", lehrerzimmer.id],
      ["aus-ipad", "", ipadAufgabe.id],
    ]);
  });

  it("setzt die Faelligkeit gleich mit (Vertragsbeginn + Tage, kein „Eilt“, solange die Frist kommt)", async () => {
    await nachholen();
    const [haupteingang, , ipadAufgabe] = ausstattungsAufgaben();
    expect(haupteingang).toMatchObject({ dueDate: tag("2026-09-24"), eilt: false });
    expect(ipadAufgabe).toMatchObject({ dueDate: tag("2026-09-26"), eilt: false });
  });

  it("verstrichene Frist beim Anlegen: heute und „Eilt“ (Regel 14), Protokoll mit Anzahl", async () => {
    await nachholen({ jetzt: new Date("2026-09-25T08:00:00.000Z") });
    const [haupteingang, , ipadAufgabe] = ausstattungsAufgaben();
    expect(haupteingang).toMatchObject({ dueDate: tag("2026-09-25"), eilt: true });
    expect(ipadAufgabe).toMatchObject({ dueDate: tag("2026-09-26"), eilt: false });
    expect(audits(ABTEILUNGS_AUDIT.FAELLIGKEITEN_GESETZT)).toEqual([
      expect.objectContaining({ details: { gesetzt: 3, vertragsbeginn: BEGINN.toISOString(), eilt: 2 } }),
    ]);
  });

  it("ein zweiter Aufruf legt nichts mehr an und protokolliert nichts", async () => {
    await nachholen();
    const vorher = db.audits.length;
    const r = await nachholen();
    expect(r.angelegt).toBe(0);
    expect(ausstattungsAufgaben()).toHaveLength(3);
    expect(db.ausstattungAufgaben).toHaveLength(3);
    expect(db.audits).toHaveLength(vorher);
  });

  it("eine spaeter gewaehlte Option wird nachgeholt, die vorhandenen bleiben", async () => {
    await nachholen();
    db.ausstattungZeilen[1].auswahl = ["Haupteingang", "Lehrerzimmer", "Fachraum Chemie"];
    const r = await nachholen();
    expect(r).toMatchObject({ angelegt: 1, stellen: ["FACILITY"] });
    expect(ausstattungsAufgaben().map((a) => a.title)).toContain("Schlüssel ausgeben: Fachraum Chemie");
    expect(ausstattungsAufgaben()).toHaveLength(4);
  });

  it("Angabe, gestrichene Zeile und leere Auswahl werden keine Aufgabe", async () => {
    db.ausstattungZeilen = [
      ipad({ gestrichenAm: new Date("2026-09-21T10:00:00.000Z") }),
      schluessel({ auswahl: [] }),
      neueAusstattungsZeile({
        id: "aus-faecher",
        onboardingId: "onb-1",
        positionId: "pos-faecher",
        departmentKey: "FACILITY",
        art: "ANGABE",
        angabeSchluessel: "UNTERRICHTSFAECHER",
        bezeichnung: "Unterrichtsfächer",
        angabe: "Chemie, Sport",
        quelle: "FUEHRUNGSKRAFT",
      }),
    ];
    const r = await nachholen();
    expect(r.angelegt).toBe(0);
    expect(ausstattungsAufgaben()).toEqual([]);
    expect(audits(AUSSTATTUNG_AUDIT.AUFGABEN_ANGELEGT)).toEqual([]);
  });

  it("Protokoll: Anzahl, Stellen und Herkunft — keine Titel, keine Bemerkung", async () => {
    await nachholen();
    const [eintrag] = audits(AUSSTATTUNG_AUDIT.AUFGABEN_ANGELEGT);
    expect(eintrag).toMatchObject({
      userId: "u-hr",
      onboardingId: "onb-1",
      processType: "ONBOARDING",
      details: { anzahl: 3, stellen: ["FACILITY", "IT"], herkunft: { AUSSTATTUNG: 3, HINWEIS: 0 } },
    });
    const text = JSON.stringify(eintrag);
    expect(text).not.toContain("Schlüssel");
    expect(text).not.toContain("Stift");
  });
});

describe("Hinweis an eine Stelle (E-A14, F20)", () => {
  it("wird eine Aufgabe mit −7 Tagen und ortsneutraler Beschreibung; der Hinweis zeigt auf sie", async () => {
    db.stellenHinweise = [
      neuerStellenHinweis({ onboardingId: "onb-1", departmentKey: "IT", text: "Bitte Mac statt PC", quelle: "FUEHRUNGSKRAFT" }),
    ];

    const r = await nachholen();

    expect(r.angelegt).toBe(1);
    const [a] = ausstattungsAufgaben();
    expect(a).toMatchObject({
      title: HINWEIS_AUFGABE_TITEL,
      category: AUSSTATTUNG_KATEGORIE,
      assignee: "IT",
      herkunft: "HINWEIS",
      relativeDueDays: -7,
      description: HINWEIS_AUFGABE_BESCHREIBUNG,
      orderIndex: HINWEIS_ORDER_BASIS,
      dueDate: tag("2026-09-24"),
    });
    // Der Text des Hinweises steht nie in der Aufgabe.
    expect(JSON.stringify(a)).not.toContain("Mac statt PC");
    expect(db.stellenHinweise[0].checklistItemId).toBe(a.id);
    expect(audits(AUSSTATTUNG_AUDIT.AUFGABEN_ANGELEGT)[0].details).toMatchObject({
      herkunft: { AUSSTATTUNG: 0, HINWEIS: 1 },
    });
  });

  it("ein leerer oder geleerter Hinweis wird keine Aufgabe", async () => {
    db.stellenHinweise = [
      neuerStellenHinweis({ onboardingId: "onb-1", departmentKey: "IT", text: "", quelle: "HR" }),
      neuerStellenHinweis({
        onboardingId: "onb-1",
        departmentKey: "FACILITY",
        text: "",
        quelle: "FUEHRUNGSKRAFT",
        inhaltGeleertAm: new Date(),
      }),
    ];
    expect((await nachholen()).angelegt).toBe(0);
    expect(ausstattungsAufgaben()).toEqual([]);
  });

  it("hat der Hinweis inzwischen eine Aufgabe, bricht das Anlegen ab (Rollback statt verwaister Aufgabe)", async () => {
    db.stellenHinweise = [
      neuerStellenHinweis({ onboardingId: "onb-1", departmentKey: "IT", text: "Bitte Mac statt PC", quelle: "FUEHRUNGSKRAFT" }),
    ];
    fp.onboardingStellenHinweis.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(ausstattungsAufgabenAnlegenIn(tx, "onb-1", { jetzt: JETZT })).rejects.toBeInstanceOf(
      HinweisSchonVerknuepft,
    );
  });
});

describe("Anspruch und Sperren (F4, F5)", () => {
  it("Sperrreihenfolge: Vorgang vor Links vor dem Anlegen", async () => {
    db.ausstattungZeilen = [ipad()];
    db.links = [link()];

    await nachholen();

    const vorgangSperre = fp.onboardingProcess.updateMany.mock.invocationCallOrder[0];
    const linkSperre = fp.offboardingDepartmentLink.updateMany.mock.invocationCallOrder[0];
    const anlegen = fp.checklistItem.create.mock.invocationCallOrder[0];
    expect(vorgangSperre).toBeLessThan(linkSperre);
    expect(linkSperre).toBeLessThan(anlegen);
    // Die Vorgangssperre ist bedingt auf einen laufenden Vorgang.
    expect(fp.onboardingProcess.updateMany.mock.calls[0][0]).toEqual({
      where: { id: "onb-1", status: { notIn: ["COMPLETED", "EXPIRED"] } },
      data: { updatedAt: JETZT },
    });
  });

  it("sperrt die Links der Stellen aus `versandAn` auch dann, wenn nichts fehlt", async () => {
    db.links = [link(), link({ departmentKey: "FACILITY", token: "tok-fac" })];
    await nachholen({ versandAn: ["FACILITY"] });
    expect(fp.offboardingDepartmentLink.updateMany.mock.calls.map((c) => c[0].where.departmentKey)).toEqual([
      "FACILITY",
    ]);
    expect(fp.checklistItem.create).not.toHaveBeenCalled();
  });

  it.each(["COMPLETED", "EXPIRED"])("Vorgang %s: nichts angelegt, nichts protokolliert", async (status) => {
    db.onboardingVorgaenge = [vorgang({ status })];
    db.ausstattungZeilen = [ipad()];
    db.stellenHinweise = [
      neuerStellenHinweis({ onboardingId: "onb-1", departmentKey: "IT", text: "Bitte Mac", quelle: "FUEHRUNGSKRAFT" }),
    ];

    const r = await nachholen();

    expect(r).toEqual({ gesperrt: false, angelegt: 0, stellen: [], angehoben: 0 });
    expect(db.onboardingAufgaben).toEqual([]);
    expect(db.audits).toEqual([]);
    expect(fp.offboardingDepartmentLink.updateMany).not.toHaveBeenCalled();
  });

  it("vorgangSperrenIn: `auch` laesst einen Endstatus zu (Absage nach EXPIRED, S19)", async () => {
    db.onboardingVorgaenge = [vorgang({ status: "EXPIRED" })];
    expect(await vorgangSperrenIn(tx, "onb-1")).toBe(false);
    expect(await vorgangSperrenIn(tx, "onb-1", { auch: ["EXPIRED"] })).toBe(true);
    expect(await vorgangSperrenIn(tx, "gibt-es-nicht")).toBe(false);
  });

  it("doppelte Anlage trotz Sperre: der Primaerschluessel (ausstattungId, option) wirft P2002", async () => {
    db.ausstattungZeilen = [ipad()];
    // Ein zweiter Anleger hat die Verknuepfung gerade angelegt; dieser hier hat
    // sie beim Lesen noch nicht gesehen.
    db.ausstattungAufgaben = [{ ausstattungId: "aus-ipad", option: "", checklistItemId: "i-anderer", createdAt: new Date() }];
    fp.onboardingAusstattungAufgabe.findMany.mockResolvedValueOnce([]);

    await expect(nachholen()).rejects.toMatchObject({ code: "P2002" });
  });
});

describe("Aenderungsliste und Abteilungsstatus (Regel 10, Feinplan 1.7 Schritte 5 und 8)", () => {
  it("informierte Stelle: Eintrag NEU je neuer Aufgabe, Abteilung wieder offen samt Protokoll", async () => {
    db.ausstattungZeilen = [ipad(), schluessel()];
    db.onboardingAufgaben = [
      neueOnboardingAufgabe({
        id: "i-konto",
        onboardingId: "onb-1",
        title: "Konto anlegen",
        category: "Vor Arbeitsbeginn",
        assignee: "IT",
        isCompleted: true,
        completedAt: new Date("2026-09-21T12:00:00.000Z"),
      }),
    ];
    db.links = [link({ allTasksComplete: true, completedAt: new Date("2026-09-21T12:00:00.000Z") })];

    await nachholen();

    // Nur die informierte IT bekommt einen Eintrag; Facility hat keinen Link.
    expect(db.ausstattungAenderungen).toEqual([
      expect.objectContaining({
        onboardingId: "onb-1",
        departmentKey: "IT",
        art: "NEU",
        titel: "Dienst-iPad (Lernmittel) bereitstellen",
        gesendetAm: null,
        erfasstAm: JETZT,
      }),
    ]);
    expect(db.links[0]).toMatchObject({ allTasksComplete: false, completedAt: null });
    expect(audits(ABTEILUNGS_AUDIT.ABTEILUNG_WIEDER_OFFEN)).toEqual([
      expect.objectContaining({
        userId: "u-hr",
        onboardingId: "onb-1",
        processType: "ONBOARDING",
        details: { departmentKey: "IT", linkId: db.links[0].id, ueber: "AUSSTATTUNG" },
      }),
    ]);
    // Der Link wird dabei nicht verlaengert (Stolperstelle 14).
    expect(db.links[0].expiresAt).toEqual(new Date("2026-12-01T00:00:00.000Z"));
  });

  it("ein Link ohne Zustellung (sentAt und lastSentAt leer) gilt nicht als informiert", async () => {
    db.ausstattungZeilen = [ipad()];
    db.links = [link({ sentAt: null, lastSentAt: null, lastSendStatus: "FAILED" })];
    await nachholen();
    expect(db.ausstattungAenderungen).toEqual([]);
  });
});

describe("Bausteine der HR-Karte (S15)", () => {
  it("aufgabeEntfallenIn: nur offene, nicht schon entfallene Aufgaben — die Anzahl verraet einen Wettlauf", async () => {
    db.onboardingAufgaben = [
      neueOnboardingAufgabe({ id: "i-offen", onboardingId: "onb-1", herkunft: "AUSSTATTUNG" }),
      neueOnboardingAufgabe({ id: "i-erledigt", onboardingId: "onb-1", herkunft: "AUSSTATTUNG", isCompleted: true }),
      neueOnboardingAufgabe({ id: "i-fremd", onboardingId: "onb-2", herkunft: "AUSSTATTUNG" }),
    ];

    const n = await aufgabeEntfallenIn(tx, {
      onboardingId: "onb-1",
      ids: ["i-offen", "i-erledigt", "i-fremd"],
      jetzt: JETZT,
      userId: "u-hr",
    });

    expect(n).toBe(1);
    expect(db.onboardingAufgaben.map((a) => [a.id, a.isCompleted, a.entfaelltAm, a.completedById])).toEqual([
      ["i-offen", true, JETZT, "u-hr"],
      ["i-erledigt", true, null, null],
      ["i-fremd", false, null, null],
    ]);
    expect(await aufgabeEntfallenIn(tx, { onboardingId: "onb-1", ids: [], jetzt: JETZT, userId: null })).toBe(0);
  });

  it("aufgabeWiederAufnehmenIn: nur entfallene; Stelle folgt der Zeile, mit Tagesangabe neue Faelligkeit", async () => {
    const weg = new Date("2026-09-21T10:00:00.000Z");
    db.onboardingAufgaben = [
      neueOnboardingAufgabe({
        id: "i-tage",
        onboardingId: "onb-1",
        assignee: "IT",
        relativeDueDays: -5,
        dueDate: tag("2026-09-26"),
        eilt: true,
        isCompleted: true,
        completedAt: weg,
        completedById: "u-hr",
        entfaelltAm: weg,
        abteilungKommentar: "Bestellung gestoppt",
      }),
      neueOnboardingAufgabe({
        id: "i-hand",
        onboardingId: "onb-1",
        assignee: "IT",
        relativeDueDays: null,
        dueDate: tag("2026-09-28"),
        isCompleted: true,
        entfaelltAm: weg,
      }),
      neueOnboardingAufgabe({ id: "i-offen", onboardingId: "onb-1", assignee: "IT", dueDate: tag("2026-09-25") }),
    ];

    const n = await aufgabeWiederAufnehmenIn(tx, {
      onboardingId: "onb-1",
      ids: ["i-tage", "i-hand", "i-offen"],
      departmentKey: "FACILITY",
    });

    expect(n).toBe(2);
    expect(db.onboardingAufgaben[0]).toMatchObject({
      isCompleted: false,
      completedAt: null,
      completedById: null,
      entfaelltAm: null,
      assignee: "FACILITY",
      dueDate: null,
      eilt: false,
      // Der Kommentar der Stelle bleibt (E-A21).
      abteilungKommentar: "Bestellung gestoppt",
    });
    // Ohne Tagesangabe bleibt die gespeicherte Faelligkeit.
    expect(db.onboardingAufgaben[1]).toMatchObject({ entfaelltAm: null, isCompleted: false, dueDate: tag("2026-09-28") });
    // Eine offene Aufgabe bleibt, wie sie ist.
    expect(db.onboardingAufgaben[2]).toMatchObject({ assignee: "IT", dueDate: tag("2026-09-25") });
  });

  it("aenderungenSchreibenIn: kein Doppel gegen den letzten offenen Eintrag — wechselnde Arten bleiben", async () => {
    const titel = "Dienst-iPad (Lernmittel) bereitstellen";
    db.ausstattungAenderungen = [
      // schon gesendet: zaehlt nicht
      { id: "alt", onboardingId: "onb-1", departmentKey: "IT", art: "GEAENDERT", titel, erfasstAm: tag("2026-09-20"), gesendetAm: tag("2026-09-21") },
    ];

    expect(await aenderungenSchreibenIn(tx, "onb-1", [{ departmentKey: "IT", art: "GEAENDERT", titel }], { jetzt: JETZT })).toBe(1);
    // Ein zweites „geaendert“ vor dem Nachtrag: bleibt einer.
    expect(await aenderungenSchreibenIn(tx, "onb-1", [{ departmentKey: "IT", art: "GEAENDERT", titel }], { jetzt: JETZT })).toBe(0);
    // NEU, ENTFAELLT, NEU: alle drei (zusammengefasst wird erst beim Senden).
    expect(
      await aenderungenSchreibenIn(
        tx,
        "onb-1",
        [
          { departmentKey: "IT", art: "ENTFAELLT", titel },
          { departmentKey: "IT", art: "NEU", titel },
          { departmentKey: "IT", art: "NEU", titel },
          { departmentKey: "FACILITY", art: "NEU", titel },
        ],
        { jetzt: JETZT },
      ),
    ).toBe(3);
    expect(db.ausstattungAenderungen.filter((e) => e.gesendetAm == null).map((e) => [e.departmentKey, e.art])).toEqual([
      ["IT", "GEAENDERT"],
      ["IT", "ENTFAELLT"],
      ["IT", "NEU"],
      ["FACILITY", "NEU"],
    ]);
    expect(db.ausstattungAenderungen.every((e) => e.id === "alt" || e.erfasstAm === JETZT)).toBe(true);
    expect(await aenderungenSchreibenIn(tx, "onb-1", [], { jetzt: JETZT })).toBe(0);
  });
});
