/**
 * Tests: taegliche Laeufe der Ausstattung (src/lib/ausstattung-lauf.ts)
 *
 * S12: `ausstattungNachholenLauf` (Abschnitt 3a von POST /api/cron/reminders).
 * S18: `ausstattungSammelmailLauf` (Abschnitt 4, E-A18) und
 * `ausstattungPortalLink` — Fenster Freitag vor Montag, Feiertag ignoriert,
 * Merker bei SENT und SKIPPED, Ruecksetzen bei FAILED, kein zweiter Versand,
 * Bericht ohne Personendaten, offene Hinweis-Aufgabe zaehlt mit, entfallene
 * nicht, echte Payload = Katalogbeispiel.
 * S20: `ausstattungFreitexteLeeren` (Lauf „Aufbewahrung erzeugter
 * Dokumente“, E-A22) — Grenzen COMPLETED/EXPIRED und der Rueckfall auf
 * `updatedAt`, laufende Vorgaenge nie, die Zeilen bleiben (nur Bemerkung,
 * Angabe und Hinweistext werden geleert), Protokoll nur mit Anzahlen, ein
 * Fehler je Vorgang laesst die uebrigen weiterlaufen, der Probelauf schreibt
 * nichts.
 *
 * Eigener `mockPrisma` statt der In-Memory-Datenbank: deren
 * `onboardingProcess.findMany` ignoriert fremde WHERE-Teile (Feinplan,
 * Abschnitt 4) — hier geht es gerade um die Kandidatenabfrage. Das Nachholen
 * selbst ist ein Spy; seine Regeln stehen in ausstattung-aufgaben.test.ts.
 * Die Versandsperre je Vorgang ist die ECHTE aus abteilungsaufgaben-dienst.ts.
 * Fuer die Sammelmail filtert `checklistItem.findMany` die Aufgaben-Zeilen
 * dieser Datei nach dem WHERE des Laufs (nur die Formen, die er schreibt).
 */

type Zeile = Record<string, unknown>;
type MailErgebnis = { status: "SENT" | "FAILED" | "SKIPPED"; detail?: string } | null;

/** Aufgaben-Zeilen der Sammelmail-Faelle (ChecklistItem). */
let aufgabenZeilen: Zeile[] = [];

/** Die Teile des WHERE, die der Lauf fuer die offenen Aufgaben schreibt. */
function passtAufgabe(a: Zeile, where: Zeile): boolean {
  for (const [feld, bedingung] of Object.entries(where)) {
    if (bedingung && typeof bedingung === "object" && "not" in (bedingung as Zeile)) {
      if (a[feld] === (bedingung as Zeile).not) return false;
    } else if (a[feld] !== bedingung) {
      return false;
    }
  }
  return true;
}

const mockPrisma = {
  onboardingProcess: { findMany: jest.fn(), updateMany: jest.fn() },
  checklistItem: {
    findMany: jest.fn(async ({ where }: { where: Zeile }) =>
      aufgabenZeilen
        .filter((a) => passtAufgabe(a, where))
        .sort((x, y) => Number(x.orderIndex) - Number(y.orderIndex))
        .map((a) => ({ title: a.title, assignee: a.assignee })),
    ),
  },
  departmentConfig: { findMany: jest.fn() },
  smtpConfig: { findUnique: jest.fn() },
  auditLog: { create: jest.fn() },
  // S20 (Loeschfrist): die Transaktion bekommt denselben Mock als `tx`.
  onboardingAusstattung: { count: jest.fn(), updateMany: jest.fn() },
  onboardingStellenHinweis: { count: jest.fn(), updateMany: jest.fn() },
  $transaction: jest.fn(),
};
const mockStandLaden = jest.fn();
const mockNachholen = jest.fn();
const mockTrigger = jest.fn<Promise<MailErgebnis>, [string, Record<string, unknown>]>();

jest.mock("@/lib/db", () => ({ prisma: mockPrisma }));
jest.mock("@/lib/webhooks", () => ({
  triggerWebhooks: (e: string, p: Record<string, unknown>) => mockTrigger(e, p),
}));
jest.mock("@/lib/ausstattung-daten", () => ({
  ausstattungsStandLaden: (...a: unknown[]) => mockStandLaden(...a),
}));
jest.mock("@/lib/abteilungsaufgaben-onboarding", () => ({
  onboardingAusstattungNachholen: (...a: unknown[]) => mockNachholen(...a),
}));

import {
  ausstattungFreitexteLeeren,
  ausstattungNachholenLauf,
  ausstattungPortalLink,
  ausstattungSammelmailLauf,
} from "@/lib/ausstattung-lauf";
import { versandSperreFreigeben, versandSperreNehmen } from "@/lib/abteilungsaufgaben-dienst";
import { AUSSTATTUNG_AUDIT, freitextGrenze, type AusstattungsStand } from "@/lib/ausstattung";
import { EVENT_CATALOG, ONBOARDING_AUSSTATTUNG_OFFEN_BEISPIEL_AUFGABEN } from "@/lib/events";
import { EVENTS_OHNE_WEBHOOK } from "@/lib/ereignis-liste";
import { DEFAULT_EMAIL_TEMPLATES } from "@/lib/default-email-templates";
import { renderEventEmail } from "@/lib/mailer";
import { MITARBEITER_NEUTRAL } from "@/lib/onboarding-spuren";

const JETZT = new Date("2026-09-25T04:00:00.000Z");

/** Ein Stand, dem eine Aufgabe fehlt (Ja/Nein ohne Verknuepfung). */
function standMitLuecke(): AusstattungsStand {
  return {
    zeilen: [
      {
        id: "aus-1",
        departmentKey: "IT",
        art: "JA_NEIN",
        bezeichnung: "Dienst-iPad (Lernmittel)",
        aufgabeTitel: "Dienst-iPad (Lernmittel) bereitstellen",
        hinweisStelle: null,
        relativeDueDays: -7,
        reihenfolge: 0,
        auswahl: [],
        gestrichenAm: null,
      },
    ],
    verknuepfungen: [],
    hinweise: [],
  };
}

/** Derselbe Stand, vollstaendig angelegt. */
function standVollstaendig(): AusstattungsStand {
  return { ...standMitLuecke(), verknuepfungen: [{ ausstattungId: "aus-1", option: "" }] };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.onboardingProcess.findMany.mockResolvedValue([{ id: "onb-1" }, { id: "onb-2" }]);
  mockStandLaden.mockResolvedValue(standMitLuecke());
  mockNachholen.mockResolvedValue({ gesperrt: true, angelegt: 1, stellen: ["IT"], angehoben: 0 });
});

describe("ausstattungNachholenLauf (Regel 6, Abschnitt 3a)", () => {
  it("Kandidaten: laufend, Modalitaeten eingereicht, nicht gestrichene Zeile oder Hinweis ohne Aufgabe", async () => {
    await ausstattungNachholenLauf(JETZT);
    expect(mockPrisma.onboardingProcess.findMany).toHaveBeenCalledWith({
      where: {
        status: { notIn: ["COMPLETED", "EXPIRED"] },
        supervisorSubmittedAt: { not: null },
        OR: [
          { ausstattung: { some: { gestrichenAm: null } } },
          { stellenHinweise: { some: { checklistItemId: null } } },
        ],
      },
      select: { id: true },
    });
  });

  it("holt je Vorgang mit Luecke nach und zaehlt Vorgaenge und Aufgaben", async () => {
    mockNachholen
      .mockResolvedValueOnce({ gesperrt: true, angelegt: 2, stellen: ["IT"], angehoben: 0 })
      .mockResolvedValueOnce({ gesperrt: true, angelegt: 1, stellen: ["FACILITY"], angehoben: 0 });

    const r = await ausstattungNachholenLauf(JETZT);

    expect(r).toEqual({ nachgeholt: { vorgaenge: 2, aufgaben: 3 }, errors: 0 });
    expect(mockNachholen.mock.calls).toEqual([
      ["onb-1", { jetzt: JETZT }],
      ["onb-2", { jetzt: JETZT }],
    ]);
  });

  it("fehlt nichts, laeuft keine Transaktion (kein taegliches Schreiben am Vorgang)", async () => {
    mockStandLaden.mockResolvedValue(standVollstaendig());
    const r = await ausstattungNachholenLauf(JETZT);
    expect(mockNachholen).not.toHaveBeenCalled();
    expect(r).toEqual({ nachgeholt: { vorgaenge: 0, aufgaben: 0 }, errors: 0 });
  });

  it("ein inzwischen beendeter Vorgang (Nachholen gesperrt) zaehlt nicht", async () => {
    mockNachholen.mockResolvedValue({ gesperrt: false, angelegt: 0, stellen: [], angehoben: 0 });
    expect(await ausstattungNachholenLauf(JETZT)).toEqual({ nachgeholt: { vorgaenge: 0, aufgaben: 0 }, errors: 0 });
  });

  it("laeuft gerade eine HR-Aktion (Versandsperre), bleibt der Vorgang heute aus", async () => {
    const bereich = { modul: "ONBOARDING" as const, vorgangId: "onb-1" };
    expect(versandSperreNehmen(bereich)).toBe(true);
    try {
      const r = await ausstattungNachholenLauf(JETZT);
      expect(mockNachholen.mock.calls.map((c) => c[0])).toEqual(["onb-2"]);
      expect(r.nachgeholt.vorgaenge).toBe(1);
    } finally {
      versandSperreFreigeben(bereich);
    }
  });

  it("ein Fehler je Vorgang zaehlt, der Lauf macht weiter, die Sperre wird freigegeben — geloggt nur die Kennung", async () => {
    const fehler = jest.spyOn(console, "error").mockImplementation(() => {});
    mockNachholen
      .mockRejectedValueOnce(Object.assign(new Error("Unique constraint anna.privat@example.org"), { code: "P2002" }))
      .mockResolvedValueOnce({ gesperrt: true, angelegt: 1, stellen: ["IT"], angehoben: 0 });

    const r = await ausstattungNachholenLauf(JETZT);

    expect(r).toEqual({ nachgeholt: { vorgaenge: 1, aufgaben: 1 }, errors: 1 });
    expect(JSON.stringify(fehler.mock.calls)).toContain("P2002");
    expect(JSON.stringify(fehler.mock.calls)).not.toContain("anna.privat");
    // Freigegeben: Ein HR-Klick koennte die Sperre jetzt wieder nehmen.
    const bereich = { modul: "ONBOARDING" as const, vorgangId: "onb-1" };
    expect(versandSperreNehmen(bereich)).toBe(true);
    versandSperreFreigeben(bereich);
    fehler.mockRestore();
  });

  it("auch ein Fehler beim Vorpruefen zaehlt und gibt die Sperre frei", async () => {
    const fehler = jest.spyOn(console, "error").mockImplementation(() => {});
    mockStandLaden.mockRejectedValueOnce(new Error("Verbindung verloren"));

    const r = await ausstattungNachholenLauf(JETZT);

    expect(r.errors).toBe(1);
    expect(mockNachholen.mock.calls.map((c) => c[0])).toEqual(["onb-2"]);
    const bereich = { modul: "ONBOARDING" as const, vorgangId: "onb-1" };
    expect(versandSperreNehmen(bereich)).toBe(true);
    versandSperreFreigeben(bereich);
    fehler.mockRestore();
  });

  it("die Antwort traegt nur Zaehler — keine IDs, Namen oder Titel", async () => {
    const r = await ausstattungNachholenLauf(JETZT);
    const text = JSON.stringify(r);
    expect(text).not.toContain("onb-");
    expect(text).not.toContain("iPad");
    expect(Object.keys(r).sort()).toEqual(["errors", "nachgeholt"]);
  });
});

// =============================================
// Sammelmail an HR am Werktag vor Dienstbeginn (S18, E-A18)
// =============================================

describe("ausstattungSammelmailLauf (Abschnitt 4, E-A18)", () => {
  const BASIS = "https://hr.example.org";
  const VORGANG_ID = "00000000-0000-0000-0000-000000000005";
  const alteUmgebung = { ...process.env };

  /** Der Beispielvorgang des Katalogs (Anna Beispiel, Dienstbeginn Donnerstag 01.10.2026). */
  function vorgang(teil: Zeile = {}): Zeile {
    return {
      id: VORGANG_ID,
      displayId: "ONB-2026-031",
      organizationId: "org-1",
      arbeitsortId: null,
      firstName: "Anna",
      lastName: "Beispiel",
      personalData: { firstName: "Anna", lastName: "Beispiel" },
      organization: { name: "FES Minden", mandantNumber: "01" },
      arbeitsort: null,
      supervisorData: { vertragsbeginn: new Date("2026-10-01T00:00:00.000Z") },
      ...teil,
    };
  }

  let ordnung = 0;
  function aufgabe(teil: Zeile): Zeile {
    return {
      onboardingId: VORGANG_ID,
      title: "Aufgabe",
      assignee: "IT",
      herkunft: "AUSSTATTUNG",
      isCompleted: false,
      entfaelltAm: null,
      orderIndex: ++ordnung,
      ...teil,
    };
  }

  /** Die beiden offenen Aufgaben des Katalogbeispiels (eine Ausstattungs-, eine Hinweis-Aufgabe). */
  function beispielAufgaben(): Zeile[] {
    const [ipad, hinweis] = ONBOARDING_AUSSTATTUNG_OFFEN_BEISPIEL_AUFGABEN;
    return [
      aufgabe({ title: ipad.title, assignee: ipad.assignee }),
      aufgabe({ title: hinweis.title, assignee: hinweis.assignee, herkunft: "HINWEIS" }),
    ];
  }

  // Mittwoch 30.09.2026, 08:00 Berliner Zeit — letzter Werktag vor Donnerstag 01.10.
  const MI = new Date("2026-09-30T06:00:00.000Z");

  function beispiel(): Record<string, unknown> {
    return EVENT_CATALOG.find((d) => d.event === "onboarding-ausstattung-offen")!.samplePayload;
  }

  function payloads(): Record<string, unknown>[] {
    return mockTrigger.mock.calls.filter((c) => c[0] === "onboarding-ausstattung-offen").map((c) => c[1]);
  }

  /** Aufrufe von onboardingProcess.updateMany: [Anspruch, Ruecksetzen …]. */
  function merkerAufrufe(): Zeile[] {
    return mockPrisma.onboardingProcess.updateMany.mock.calls.map((c) => c[0] as Zeile);
  }

  beforeEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = BASIS;
    ordnung = 0;
    aufgabenZeilen = beispielAufgaben();
    mockPrisma.onboardingProcess.findMany.mockResolvedValue([vorgang()]);
    mockPrisma.onboardingProcess.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.departmentConfig.findMany.mockResolvedValue([]);
    mockPrisma.smtpConfig.findUnique.mockResolvedValue({ replyToEmail: "personal@example.org" });
    mockPrisma.auditLog.create.mockResolvedValue({});
    mockTrigger.mockResolvedValue({ status: "SENT" });
  });

  afterAll(() => {
    process.env = alteUmgebung;
  });

  it("Kandidaten: laufend, Modalitaeten eingereicht, ohne Merker, Beginn im Vorfilter, mit offener Ausstattung", async () => {
    await ausstattungSammelmailLauf(MI);
    const [aufruf] = mockPrisma.onboardingProcess.findMany.mock.calls[0] as [{ where: Zeile; select: Zeile }];
    expect(aufruf.where).toEqual({
      status: { notIn: ["COMPLETED", "EXPIRED"] },
      supervisorSubmittedAt: { not: null },
      ausstattungSammelmailAm: null,
      // Heute (30.09.) minus einen Tag bis heute + 5 Tage — die genaue Regel macht sammelmailFaellig.
      supervisorData: {
        is: {
          vertragsbeginn: { gte: new Date("2026-09-29T00:00:00.000Z"), lt: new Date("2026-10-05T00:00:00.000Z") },
        },
      },
      checklistItems: { some: { herkunft: { not: null }, isCompleted: false, entfaelltAm: null } },
    });
    // Nie die private Adresse der Person, nie Tokens.
    for (const feld of ["email", "token", "supervisorToken", "supervisorEmail"]) {
      expect({ feld, gelesen: feld in aufruf.select }).toEqual({ feld, gelesen: false });
    }
  });

  it("echte Payload = Katalogbeispiel (bis auf den Portal-Link), gerendert ohne leere Platzhalter", async () => {
    const r = await ausstattungSammelmailLauf(MI);
    expect(r).toEqual({ sammelmail: { versendet: 1, nichtZugestellt: 0, uebersprungen: 0 }, errors: 0 });

    const [payload] = payloads();
    const { portalLink, ...rest } = payload;
    const { portalLink: beispielLink, ...beispielRest } = beispiel();
    expect(rest).toEqual(beispielRest);
    expect(typeof beispielLink).toBe("string");
    expect(portalLink).toBe(`${BASIS}/dashboard/${VORGANG_ID}?tab=checklist`);
    expect(portalLink).toBe(ausstattungPortalLink(VORGANG_ID));
    expect(payload).not.toHaveProperty("email");

    const vorlage = DEFAULT_EMAIL_TEMPLATES.find((t) => t.event === "onboarding-ausstattung-offen")!;
    const { rendered } = renderEventEmail(
      { ...vorlage, recipientTo: "", recipientCc: "", recipientBcc: "", recipientReplyTo: "" },
      "onboarding-ausstattung-offen",
      payload,
    );
    expect(rendered).not.toBeNull();
    // Empfaenger ist das HR-Postfach (Katalog-Default), die Fuehrungskraft nicht in Kopie.
    expect(rendered!.to).toBe("personal@example.org");
    expect(rendered!.cc).toBeUndefined();
    expect(rendered!.subject).toBe("Noch offene Ausstattung für Anna Beispiel – Dienstbeginn 01.10.2026 (ONB-2026-031)");
    for (const teil of [rendered!.subject, rendered!.html, rendered!.text ?? ""]) {
      expect(teil).not.toMatch(/\{\{/);
      expect(teil).not.toContain("undefined");
    }
    expect(rendered!.text).toContain("- Dienst-iPad (Lernmittel) bereitstellen – IT-Abteilung");
    expect(rendered!.text).toContain("- Hinweis der Führungskraft beachten – Facility Management");
    expect(rendered!.text).toContain("noch 2 Aufgabe(n) nicht erledigt");
    expect(rendered!.html).toContain(`href="${portalLink}"`);
    // Arbeitsort = Einrichtung: keine eigene Zeile.
    expect(rendered!.text).not.toContain("Arbeitsort");
  });

  it("das Ereignis geht nicht an Webhooks (F18)", async () => {
    await ausstattungSammelmailLauf(MI);
    expect(mockTrigger.mock.calls[0][0]).toBe("onboarding-ausstattung-offen");
    expect(EVENTS_OHNE_WEBHOOK["onboarding-ausstattung-offen"]).toMatch(/Webhooks auf dieses Ereignis feuern nicht/);
  });

  it("Fenster: Dienstbeginn Montag → am Freitag davor fällig, am Donnerstag nicht", async () => {
    mockPrisma.onboardingProcess.findMany.mockResolvedValue([
      vorgang({ supervisorData: { vertragsbeginn: new Date("2026-10-05T00:00:00.000Z") } }),
    ]);
    // Donnerstag 01.10., 08:00 Berliner Zeit: noch nicht.
    expect(await ausstattungSammelmailLauf(new Date("2026-10-01T06:00:00.000Z"))).toEqual({
      sammelmail: { versendet: 0, nichtZugestellt: 0, uebersprungen: 0 },
      errors: 0,
    });
    expect(mockTrigger).not.toHaveBeenCalled();
    expect(mockPrisma.onboardingProcess.updateMany).not.toHaveBeenCalled();

    // Freitag 02.10.: fällig.
    const r = await ausstattungSammelmailLauf(new Date("2026-10-02T06:00:00.000Z"));
    expect(r.sammelmail.versendet).toBe(1);
    expect(payloads()[0]).toMatchObject({ vertragsbeginn: "05.10.2026" });
  });

  it("Feiertag ignoriert: Dienstbeginn Mo 04.01.2027 → an Neujahr (Freitag) fällig", async () => {
    mockPrisma.onboardingProcess.findMany.mockResolvedValue([
      vorgang({ supervisorData: { vertragsbeginn: new Date("2027-01-04T00:00:00.000Z") } }),
    ]);
    const r = await ausstattungSammelmailLauf(new Date("2027-01-01T07:00:00.000Z"));
    expect(r.sammelmail.versendet).toBe(1);
  });

  it("SENT: Merker per bedingtem Anspruch, kein Ruecksetzen, Protokoll nur mit Anzahl und Stellen-Schluesseln", async () => {
    await ausstattungSammelmailLauf(MI);
    expect(merkerAufrufe()).toEqual([
      {
        where: { id: VORGANG_ID, ausstattungSammelmailAm: null, status: { notIn: ["COMPLETED", "EXPIRED"] } },
        data: { ausstattungSammelmailAm: MI },
      },
    ]);
    // Anspruch VOR dem Versand.
    expect(mockPrisma.onboardingProcess.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      mockTrigger.mock.invocationCallOrder[0],
    );
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        userId: null,
        onboardingId: VORGANG_ID,
        processType: "ONBOARDING",
        action: AUSSTATTUNG_AUDIT.SAMMELMAIL_GESENDET,
        details: { anzahlOffen: 2, stellen: ["FACILITY", "IT"] },
      },
    });
    expect(JSON.stringify(mockPrisma.auditLog.create.mock.calls)).not.toContain("iPad");
  });

  it("SKIPPED (Vorlage aus, kein HR-Postfach): Merker bleibt, kein Protokoll, `uebersprungen`", async () => {
    mockPrisma.smtpConfig.findUnique.mockResolvedValue({ replyToEmail: null });
    mockTrigger.mockResolvedValue({ status: "SKIPPED", detail: "Kein Empfaenger" });
    const r = await ausstattungSammelmailLauf(MI);
    expect(r).toEqual({ sammelmail: { versendet: 0, nichtZugestellt: 0, uebersprungen: 1 }, errors: 0 });
    expect(payloads()[0]).toMatchObject({ hr_postfach: "" });
    // Nur der Anspruch, kein Ruecksetzen.
    expect(merkerAufrufe()).toHaveLength(1);
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });

  it.each([
    ["FAILED", { status: "FAILED", detail: "SMTP weg" } as MailErgebnis],
    ["kein Ergebnis", null as MailErgebnis],
  ])("%s: Merker bedingt auf den eigenen Zeitstempel zurueck — der naechste Lauf versucht es erneut", async (_name, mail) => {
    mockTrigger.mockResolvedValue(mail);
    const r = await ausstattungSammelmailLauf(MI);
    expect(r).toEqual({ sammelmail: { versendet: 0, nichtZugestellt: 1, uebersprungen: 0 }, errors: 0 });
    expect(merkerAufrufe()[1]).toEqual({
      where: { id: VORGANG_ID, ausstattungSammelmailAm: MI },
      data: { ausstattungSammelmailAm: null },
    });
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("kein zweiter Versand: Anspruch verloren (anderer Lauf, Knopf oder Route war schneller) → keine Mail", async () => {
    mockPrisma.onboardingProcess.updateMany.mockResolvedValue({ count: 0 });
    const r = await ausstattungSammelmailLauf(MI);
    expect(mockTrigger).not.toHaveBeenCalled();
    expect(r).toEqual({ sammelmail: { versendet: 0, nichtZugestellt: 0, uebersprungen: 0 }, errors: 0 });
    expect(merkerAufrufe()).toHaveLength(1);
  });

  it("zwei Laeufe am selben Tag: der zweite findet den Merker gesetzt und sendet nichts", async () => {
    // Kleiner Zustand: Der Anspruch setzt den Merker, die Kandidatenabfrage filtert ihn.
    let merker: Date | null = null;
    mockPrisma.onboardingProcess.findMany.mockImplementation(async () => (merker ? [] : [vorgang()]));
    mockPrisma.onboardingProcess.updateMany.mockImplementation(async ({ where, data }: { where: Zeile; data: Zeile }) => {
      if (where.ausstattungSammelmailAm !== merker) return { count: 0 };
      merker = data.ausstattungSammelmailAm as Date | null;
      return { count: 1 };
    });
    await ausstattungSammelmailLauf(MI);
    await ausstattungSammelmailLauf(new Date(MI.getTime() + 60 * 60 * 1000));
    expect(payloads()).toHaveLength(1);
    expect(merker).toEqual(MI);
  });

  it("offene Hinweis-Aufgabe zaehlt mit; entfallene, erledigte und Vorlagenaufgaben nicht", async () => {
    aufgabenZeilen = [
      aufgabe({ title: "Dienst-Laptop/PC bereitstellen", assignee: "IT" }),
      aufgabe({ title: "Hinweis der Führungskraft beachten", assignee: "IT", herkunft: "HINWEIS" }),
      aufgabe({ title: "Spind bereitstellen", assignee: "FACILITY", isCompleted: true, entfaelltAm: new Date("2026-09-20T00:00:00Z") }),
      aufgabe({ title: "Transponder/Chip bereitstellen", assignee: "FACILITY", isCompleted: true }),
      aufgabe({ title: "Benutzerkonto anlegen", assignee: "IT", herkunft: null }),
      // Ein anderer Vorgang.
      aufgabe({ title: "Fremde Aufgabe", onboardingId: "onb-anderer" }),
    ];
    await ausstattungSammelmailLauf(MI);
    const [payload] = payloads();
    expect(payload).toMatchObject({
      anzahl_offen: 2,
      offene_liste: "- Dienst-Laptop/PC bereitstellen – IT-Abteilung\n- Hinweis der Führungskraft beachten – IT-Abteilung",
    });
  });

  it("nichts mehr offen (inzwischen erledigt): kein Anspruch, keine Mail", async () => {
    aufgabenZeilen = [aufgabe({ isCompleted: true })];
    const r = await ausstattungSammelmailLauf(MI);
    expect(mockPrisma.onboardingProcess.updateMany).not.toHaveBeenCalled();
    expect(mockTrigger).not.toHaveBeenCalled();
    expect(r.sammelmail).toEqual({ versendet: 0, nichtZugestellt: 0, uebersprungen: 0 });
  });

  it("Stellen-Namen am Arbeitsort (E-A10), Arbeitsort in der Payload nur bei Abweichung (F15)", async () => {
    mockPrisma.onboardingProcess.findMany.mockResolvedValue([
      vorgang({ arbeitsortId: "org-gs", arbeitsort: { name: "Grundschule Minden" } }),
    ]);
    mockPrisma.departmentConfig.findMany.mockResolvedValue([
      { departmentKey: "FACILITY", departmentName: "Hausmeister Grundschule", email: "hm@example.org", organizationId: "org-gs", isActive: true },
      { departmentKey: "FACILITY", departmentName: "Facility zentral", email: "fm@example.org", organizationId: null, isActive: true },
    ]);
    await ausstattungSammelmailLauf(MI);
    const [payload] = payloads();
    expect(payload).toMatchObject({ arbeitsort: "Grundschule Minden" });
    expect(String(payload.offene_liste)).toContain("Hinweis der Führungskraft beachten – Hausmeister Grundschule");
  });

  it("ohne bekannten Namen: die neutrale Bezeichnung, nie eine Adresse", async () => {
    mockPrisma.onboardingProcess.findMany.mockResolvedValue([
      vorgang({ firstName: null, lastName: null, personalData: null }),
    ]);
    await ausstattungSammelmailLauf(MI);
    expect(payloads()[0]).toMatchObject({ mitarbeiter_name: MITARBEITER_NEUTRAL, employeeName: MITARBEITER_NEUTRAL });
    // Die einzige Adresse in der Payload ist das HR-Postfach.
    const mitAdresse = Object.entries(payloads()[0])
      .filter(([, wert]) => typeof wert === "string" && wert.includes("@"))
      .map(([feld]) => feld);
    expect(mitAdresse).toEqual(["hr_postfach"]);
  });

  it("zwei Vorgaenge: Stellen und HR-Postfach werden einmal je Lauf gelesen; ein Fehler je Vorgang zaehlt, der Lauf macht weiter", async () => {
    const fehler = jest.spyOn(console, "error").mockImplementation(() => {});
    mockPrisma.onboardingProcess.findMany.mockResolvedValue([vorgang(), vorgang({ id: "onb-2", displayId: "ONB-2026-032" })]);
    aufgabenZeilen = [...beispielAufgaben(), aufgabe({ onboardingId: "onb-2", title: "Kopierkarte bereitstellen", assignee: "VERWALTUNG" })];
    mockPrisma.checklistItem.findMany.mockRejectedValueOnce(Object.assign(new Error("Anna Beispiel weg"), { code: "P1001" }));

    const r = await ausstattungSammelmailLauf(MI);

    expect(r).toEqual({ sammelmail: { versendet: 1, nichtZugestellt: 0, uebersprungen: 0 }, errors: 1 });
    expect(payloads().map((p) => p.onboardingId)).toEqual(["onb-2"]);
    // Vor dem Anspruch gescheitert: nichts zurueckzusetzen.
    expect(merkerAufrufe().map((a) => (a.where as Zeile).id)).toEqual(["onb-2"]);
    expect(mockPrisma.departmentConfig.findMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.smtpConfig.findUnique).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(fehler.mock.calls)).toContain("P1001");
    expect(JSON.stringify(fehler.mock.calls)).not.toContain("Anna Beispiel");
    fehler.mockRestore();
  });

  it("scheitert das Protokoll nach SENT, bleibt der Merker (keine zweite Mail) — gezaehlt als Fehler", async () => {
    const fehler = jest.spyOn(console, "error").mockImplementation(() => {});
    mockPrisma.auditLog.create.mockRejectedValue(new Error("Protokoll weg"));
    const r = await ausstattungSammelmailLauf(MI);
    expect(r).toEqual({ sammelmail: { versendet: 1, nichtZugestellt: 0, uebersprungen: 0 }, errors: 1 });
    expect(merkerAufrufe()).toHaveLength(1);
    fehler.mockRestore();
  });

  it("die Antwort traegt nur Zaehler — keine IDs, Namen, Vorgangsnummern oder Titel", async () => {
    const r = await ausstattungSammelmailLauf(MI);
    const text = JSON.stringify(r);
    for (const verboten of [VORGANG_ID, "Anna", "ONB-2026", "iPad", "personal@example.org"]) {
      expect(text).not.toContain(verboten);
    }
    expect(Object.keys(r).sort()).toEqual(["errors", "sammelmail"]);
    expect(Object.keys(r.sammelmail).sort()).toEqual(["nichtZugestellt", "uebersprungen", "versendet"]);
  });
});

describe("ausstattungPortalLink (Feinplan 1.10)", () => {
  it("fuehrt in den Reiter Checkliste der Detailseite", () => {
    const vorher = process.env.NEXT_PUBLIC_APP_URL;
    process.env.NEXT_PUBLIC_APP_URL = "https://hr.example.org";
    try {
      expect(ausstattungPortalLink("onb-1")).toBe("https://hr.example.org/dashboard/onb-1?tab=checklist");
    } finally {
      process.env.NEXT_PUBLIC_APP_URL = vorher;
    }
  });
});

// =============================================
// S20: Loeschfrist der Freitexte (E-A22)
// =============================================

describe("ausstattungFreitexteLeeren (E-A22, Lauf „Aufbewahrung erzeugter Dokumente“)", () => {
  /** 15.09.2027 → Grenze 15.03.2027 00:00 Uhr Berlin (14.03. 23:00 UTC). */
  const JETZT_L = new Date("2027-09-15T08:00:00.000Z");
  const GRENZE = freitextGrenze(JETZT_L);
  const VOR = new Date(GRENZE.getTime() - 60_000);
  const ALT = new Date("2027-01-01T10:00:00.000Z");
  const NEU = new Date("2027-05-01T10:00:00.000Z");

  type Vorgang = { id: string; status: string; completedAt: Date | null; expiredAt: Date | null; updatedAt: Date };
  const VORGAENGE: Vorgang[] = [
    { id: "abgeschlossen-vor-grenze", status: "COMPLETED", completedAt: VOR, expiredAt: null, updatedAt: VOR },
    { id: "abgeschlossen-auf-grenze", status: "COMPLETED", completedAt: GRENZE, expiredAt: null, updatedAt: GRENZE },
    // completedAt entscheidet, nicht ein altes updatedAt
    { id: "abgeschlossen-neu", status: "COMPLETED", completedAt: NEU, expiredAt: null, updatedAt: ALT },
    { id: "abgeschlossen-ohne-zeitstempel", status: "COMPLETED", completedAt: null, expiredAt: null, updatedAt: ALT },
    { id: "abgebrochen-alt", status: "EXPIRED", completedAt: null, expiredAt: ALT, updatedAt: NEU },
    { id: "abgebrochen-neu", status: "EXPIRED", completedAt: null, expiredAt: NEU, updatedAt: ALT },
    // vor F12 abgebrochen: Rueckfall auf updatedAt
    { id: "abgebrochen-ohne-alt", status: "EXPIRED", completedAt: null, expiredAt: null, updatedAt: ALT },
    { id: "abgebrochen-ohne-neu", status: "EXPIRED", completedAt: null, expiredAt: null, updatedAt: NEU },
    // laufende und gepruefte Vorgaenge nie, egal wie alt
    { id: "laufend-alt", status: "IN_PROGRESS", completedAt: null, expiredAt: null, updatedAt: ALT },
    { id: "geprueft-alt", status: "REVIEWED", completedAt: null, expiredAt: null, updatedAt: ALT },
  ];
  const FAELLIG = ["abgeschlossen-vor-grenze", "abgeschlossen-ohne-zeitstempel", "abgebrochen-alt", "abgebrochen-ohne-alt"];

  /** Der Statusteil des WHERE (erstes Glied von AND: OR ueber Status und Zeitstempel). */
  function passtStatusteil(v: Vorgang, where: Zeile): boolean {
    const oder = ((where.AND as Zeile[])[0].OR ?? []) as Zeile[];
    return oder.some((bedingung) =>
      Object.entries(bedingung).every(([feld, b]) => {
        const wert = (v as unknown as Zeile)[feld];
        if (b === null) return wert === null;
        if (b && typeof b === "object" && "lt" in (b as Zeile)) {
          return wert instanceof Date && wert.getTime() < ((b as Zeile).lt as Date).getTime();
        }
        return wert === b;
      }),
    );
  }

  const zeilenAufrufe = () => mockPrisma.onboardingAusstattung.updateMany.mock.calls.map((c) => c[0] as Zeile);
  const hinweisAufrufe = () => mockPrisma.onboardingStellenHinweis.updateMany.mock.calls.map((c) => c[0] as Zeile);

  beforeEach(() => {
    mockPrisma.onboardingProcess.findMany.mockImplementation(async ({ where }: { where: Zeile }) =>
      VORGAENGE.filter((v) => passtStatusteil(v, where)).map((v) => ({ id: v.id })),
    );
    mockPrisma.onboardingAusstattung.updateMany.mockResolvedValue({ count: 2 });
    mockPrisma.onboardingStellenHinweis.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.onboardingAusstattung.count.mockResolvedValue(5);
    mockPrisma.onboardingStellenHinweis.count.mockResolvedValue(3);
    mockPrisma.auditLog.create.mockResolvedValue({});
    mockPrisma.$transaction.mockImplementation(async (fn: (tx: typeof mockPrisma) => Promise<unknown>) => fn(mockPrisma));
  });

  it("Grenzen: COMPLETED nach completedAt, EXPIRED nach expiredAt, ohne Zeitstempel nach updatedAt — laufende nie", async () => {
    await ausstattungFreitexteLeeren({ grenze: GRENZE, dryRun: false, jetzt: JETZT_L });
    expect(zeilenAufrufe().map((w) => (w.where as Zeile).onboardingId)).toEqual(FAELLIG);
    expect(hinweisAufrufe().map((w) => (w.where as Zeile).onboardingId)).toEqual(FAELLIG);
  });

  it("nur Vorgaenge, an denen noch etwas zu leeren ist (Freitext, nicht schon geleert)", async () => {
    await ausstattungFreitexteLeeren({ grenze: GRENZE, dryRun: false, jetzt: JETZT_L });
    const aufruf = mockPrisma.onboardingProcess.findMany.mock.calls[0][0] as { where: Zeile; select: Zeile };
    expect((aufruf.where.AND as Zeile[])[1]).toEqual({
      OR: [
        { ausstattung: { some: { inhaltGeleertAm: null, OR: [{ bemerkung: { not: null } }, { angabe: { not: null } }] } } },
        { stellenHinweise: { some: { inhaltGeleertAm: null, text: { not: "" } } } },
      ],
    });
    expect(aufruf.select).toEqual({ id: true });
  });

  it("die Zeilen bleiben: geleert werden nur Bemerkung, Angabe und Hinweistext, mit inhaltGeleertAm", async () => {
    await ausstattungFreitexteLeeren({ grenze: GRENZE, dryRun: false, jetzt: JETZT_L });
    expect(zeilenAufrufe()[0]).toEqual({
      where: {
        onboardingId: "abgeschlossen-vor-grenze",
        inhaltGeleertAm: null,
        OR: [{ bemerkung: { not: null } }, { angabe: { not: null } }],
      },
      data: { bemerkung: null, angabe: null, inhaltGeleertAm: JETZT_L },
    });
    expect(hinweisAufrufe()[0]).toEqual({
      where: { onboardingId: "abgeschlossen-vor-grenze", inhaltGeleertAm: null, text: { not: "" } },
      data: { text: "", inhaltGeleertAm: JETZT_L },
    });
    // Kein Loeschen: Der Mock kennt nichts als zaehlen und bedingt aendern.
    expect(Object.keys(mockPrisma.onboardingAusstattung).sort()).toEqual(["count", "updateMany"]);
  });

  it("je Vorgang eine Transaktion samt Protokoll — nur Anzahlen, nie Inhalte", async () => {
    const r = await ausstattungFreitexteLeeren({ grenze: GRENZE, dryRun: false, jetzt: JETZT_L });
    expect(r).toEqual({ vorgaenge: 4, geleert: 8, hinweiseGeleert: 4, fehler: 0 });
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(4);
    expect(mockPrisma.auditLog.create).toHaveBeenCalledTimes(4);
    expect(mockPrisma.auditLog.create.mock.calls[0][0]).toEqual({
      data: {
        userId: null,
        onboardingId: "abgeschlossen-vor-grenze",
        processType: "ONBOARDING",
        action: AUSSTATTUNG_AUDIT.FREITEXTE_GELEERT,
        details: { zeilen: 2, hinweise: 1, aufbewahrungMonate: 6 },
      },
    });
  });

  it("nichts mehr zu leeren (ein zweiter Lauf war schneller): kein Protokoll, kein Vorgang gezaehlt", async () => {
    mockPrisma.onboardingAusstattung.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.onboardingStellenHinweis.updateMany.mockResolvedValue({ count: 0 });
    const r = await ausstattungFreitexteLeeren({ grenze: GRENZE, dryRun: false, jetzt: JETZT_L });
    expect(r).toEqual({ vorgaenge: 0, geleert: 0, hinweiseGeleert: 0, fehler: 0 });
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("ein Fehler je Vorgang zaehlt, die uebrigen laufen weiter — geloggt nur die Kennung", async () => {
    const fehler = jest.spyOn(console, "error").mockImplementation(() => {});
    mockPrisma.$transaction.mockRejectedValueOnce(
      Object.assign(new Error("Verbindung zu anna.privat@example.org verloren"), { code: "P1001" }),
    );
    const r = await ausstattungFreitexteLeeren({ grenze: GRENZE, dryRun: false, jetzt: JETZT_L });
    expect(r).toEqual({ vorgaenge: 3, geleert: 6, hinweiseGeleert: 3, fehler: 1 });
    expect(JSON.stringify(fehler.mock.calls)).toContain("P1001");
    expect(JSON.stringify(fehler.mock.calls)).not.toContain("anna.privat");
    fehler.mockRestore();
  });

  it("Probelauf zaehlt nur — keine Transaktion, kein Schreiben, kein Protokoll", async () => {
    const r = await ausstattungFreitexteLeeren({ grenze: GRENZE, dryRun: true });
    expect(r).toEqual({ vorgaenge: 4, geleert: 5, hinweiseGeleert: 3, fehler: 0 });
    expect(mockPrisma.onboardingAusstattung.count).toHaveBeenCalledWith({
      where: {
        onboardingId: { in: FAELLIG },
        inhaltGeleertAm: null,
        OR: [{ bemerkung: { not: null } }, { angabe: { not: null } }],
      },
    });
    expect(mockPrisma.onboardingStellenHinweis.count).toHaveBeenCalledWith({
      where: { onboardingId: { in: FAELLIG }, inhaltGeleertAm: null, text: { not: "" } },
    });
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockPrisma.onboardingAusstattung.updateMany).not.toHaveBeenCalled();
    expect(mockPrisma.onboardingStellenHinweis.updateMany).not.toHaveBeenCalled();
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("ohne faellige Vorgaenge keine weitere Abfrage", async () => {
    mockPrisma.onboardingProcess.findMany.mockResolvedValue([]);
    expect(await ausstattungFreitexteLeeren({ grenze: GRENZE, dryRun: true })).toEqual({
      vorgaenge: 0,
      geleert: 0,
      hinweiseGeleert: 0,
      fehler: 0,
    });
    expect(mockPrisma.onboardingAusstattung.count).not.toHaveBeenCalled();
  });
});
