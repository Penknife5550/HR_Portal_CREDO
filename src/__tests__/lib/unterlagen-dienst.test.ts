/**
 * Tests: Unterlagen nachfordern — HR-Dienst (Paket 4, Schritte 4 und 6)
 * (src/lib/unterlagen-dienst.ts mit dem Baustein src/lib/unterlagen-onboarding.ts)
 *
 * Geprueft gegen die In-Memory-Datenbank src/__tests__/hilfen/unterlagen-fake-db.ts:
 * Teil 1 — Anfordern, Ergaenzen, Frist aendern, Link erneut senden,
 * Zurueckziehen, die Uebersicht fuer GET /api/onboarding/[id] und die
 * HR-Meldung „vollständig" mit bedingtem Anspruch. Teil 2 — die Entscheidungen
 * ueber eine Position: Annehmen (Uebernahme per Hardlink, echte Dateien in
 * einem Verzeichnis unter os.tmpdir()), Zurueckweisen, Entfällt, Annahme
 * zuruecknehmen; die Tabelle `document` kennt dieselbe Fake-Datenbank.
 *
 * Der Fake kennt kein Rollback, keine Zeilensperre und keine echte
 * Nebenlaeufigkeit (Feinplanung 13). Deshalb halten die Tests zusaetzlich die
 * REIHENFOLGE der Aufrufe fest — erst sperren, dann zaehlen; bedingtes
 * updateMany vor dem Schreiben; Mail und Dateiloeschung erst nach der
 * Transaktion. Dafuer tragen sich sendEventEmail, triggerWebhooks und
 * entwuerfeLoeschen in dieselbe Aufrufliste ein wie die Datenbank
 * (`udb.aufrufe`). Das echte Verhalten von Postgres belegt die einmalige Probe
 * gegen die Dev-Datenbank (Commit-Text von Schritt 4).
 *
 * Quer durch alle Tests (afterEach): triggerWebhooks wird NIE mit einem der
 * drei Personen-Events aufgerufen, und jede Mail an die Person geht mit
 * overrideTo = Adresse ihres Links hinaus.
 */

import type { EventEmailResult } from "@/lib/mailer";

const mockSend = jest.fn(
  async (_event: string, _payload: Record<string, unknown>, _opts?: { overrideTo?: string }): Promise<EventEmailResult> => ({
    status: "SENT",
    messageId: "<m-1@example.org>",
  }),
);
const mockTrigger = jest.fn(
  async (_event: string, _payload: Record<string, unknown>): Promise<EventEmailResult | null> => ({ status: "SENT" }),
);
const mockEntwuerfeLoeschen = jest.fn(async (_nf: string, pfade: ReadonlyArray<string | null>) => ({
  geloescht: pfade.filter(Boolean).length,
  fehlte: 0,
  fehler: 0,
}));

/** Traegt einen Aufruf ausserhalb der Datenbank in `udb.aufrufe` ein (Reihenfolge „nach dem Commit"). */
const mockProtokoll = (name: string) => jest.requireActual("../hilfen/unterlagen-fake-db").udb.aufrufe.push(name);

jest.mock("@/lib/db", () => ({
  prisma: jest.requireActual("../hilfen/unterlagen-fake-db").fakePrisma,
}));
jest.mock("@/lib/mailer", () => ({
  ...jest.requireActual("@/lib/mailer"),
  sendEventEmail: (e: string, p: Record<string, unknown>, o?: { overrideTo?: string }) => {
    mockProtokoll("sendEventEmail");
    return mockSend(e, p, o);
  },
}));
jest.mock("@/lib/webhooks", () => ({
  triggerWebhooks: (e: string, p: Record<string, unknown>) => {
    mockProtokoll("triggerWebhooks");
    return mockTrigger(e, p);
  },
}));
jest.mock("@/lib/unterlagen-dateien", () => {
  const echt = jest.requireActual("@/lib/unterlagen-dateien");
  // Die Dateihelfer laufen ECHT (Schritt 6 arbeitet auf einem Verzeichnis unter
  // os.tmpdir()); sie tragen sich nur in die Aufrufliste ein — so ist die
  // Reihenfolge „verknuepfen → Transaktion → alte Stelle loeschen" pruefbar.
  const mitProtokoll =
    <A extends unknown[], R>(name: string, fn: (...args: A) => R) =>
    (...args: A): R => {
      mockProtokoll(name);
      return fn(...args);
    };
  return {
    ...echt,
    entwuerfeLoeschen: (nf: string, pfade: ReadonlyArray<string | null>) => {
      mockProtokoll("entwuerfeLoeschen");
      return mockEntwuerfeLoeschen(nf, pfade);
    },
    verknuepfenInVorgang: mitProtokoll("verknuepfenInVorgang", echt.verknuepfenInVorgang),
    zurueckVerknuepfen: mitProtokoll("zurueckVerknuepfen", echt.zurueckVerknuepfen),
    vorgangsKopieLoeschen: mitProtokoll("vorgangsKopieLoeschen", echt.vorgangsKopieLoeschen),
    nachforderungsDateiLoeschen: mitProtokoll("nachforderungsDateiLoeschen", echt.nachforderungsDateiLoeschen),
  };
});
jest.mock("@/lib/permissions", () => {
  const echt = jest.requireActual("@/lib/permissions");
  return { ...echt, canAccessProcess: jest.fn(echt.canAccessProcess) };
});

import {
  fakePrisma,
  neueDatei,
  neueNachforderung,
  neuePosition,
  neuerUnterlagenLink,
  udb,
  udbLeeren,
  type Zeile,
} from "../hilfen/unterlagen-fake-db";
import { ddb, ddbLeeren, neuesDokument } from "../hilfen/unterlagen-fake-db";
import { fehlerKennung } from "@/lib/fehler-kennung";
import {
  HR_MELDUNG_GRUENDE,
  hrMeldungGrund,
  hrMeldungOhneEmpfaenger,
  hrMeldungSenden,
  hrVollstaendigMelden,
  unterlagenAktionAusfuehren,
  unterlagenPositionsAktionAusfuehren,
  unterlagenSperreFreigeben,
  unterlagenSperreNehmen,
  unterlagenUebersichtLaden,
} from "@/lib/unterlagen-dienst";
import { onboardingBaustein, ONBOARDING_NICHT_VERFUEGBAR, type OnboardingUnterlagenQuelle } from "@/lib/unterlagen-onboarding";
import { AKTION_MELDUNGEN, MELDUNGEN, UNTERLAGEN_AUDIT, type UnterlagenUebersicht } from "@/lib/unterlagen";
import { UNTERLAGEN_EVENTS, UNTERLAGEN_PERSONEN_EVENTS } from "@/lib/unterlagen-mail";
import { NACHFORDERUNG_HINWEISE, SENSIBEL_SPERRGRUND_TEXTE } from "@/lib/required-documents";
import { hashToken } from "@/lib/token-hash";
import { canAccessProcess, type SessionPayload } from "@/lib/permissions";
import type { PositionsAktionInput, UnterlagenAktionInput } from "@/lib/validations/unterlagen";
import type { Prisma } from "@prisma/client";
import { createHash, randomUUID } from "crypto";
import fs from "fs";
import { mkdir, mkdtemp, rm, stat, unlink, writeFile } from "fs/promises";
import os from "os";
import path from "path";

// =============================================
// Testdaten
// =============================================

const BASIS = "https://hr.example.org";
const VORGANG_ID = "3f1c2a4e-5b6d-4e7f-8a9b-0c1d2e3f4a5b";
const ANDERER_VORGANG = "9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d";
const ADRESSE = "anna.privat@example.org";
/** Montag, 21.09.2026, 10:00 Uhr in Berlin. */
const JETZT = new Date("2026-09-21T08:00:00.000Z");
const MINUTE = 60_000;
const TAG = 86_400_000;
const vor = (ms: number) => new Date(JETZT.getTime() - ms);
const datum = (tag: string) => new Date(`${tag}T00:00:00.000Z`);

const HR: SessionPayload = {
  userId: "u-hr",
  email: "erika.muster@example.org",
  role: "HR_SACHBEARBEITER",
  firstName: "Erika",
  lastName: "Muster",
};

/** Liest Portal-Daten, darf aber nichts bearbeiten. */
const VORGESETZTE: SessionPayload = {
  userId: "u-vg",
  email: "vg@example.org",
  role: "VORGESETZTER",
  firstName: "Volker",
  lastName: "Gesetzt",
};

function vorgang(teil: Zeile = {}): Zeile {
  return {
    id: VORGANG_ID,
    displayId: "2026-GYM-014",
    organizationId: "org-1",
    status: "SUBMITTED",
    email: ADRESSE,
    firstName: "Anna",
    lastName: "Beispiel",
    submittedAt: new Date("2026-09-10T10:00:00.000Z"),
    questionnaireType: "STANDARD",
    updatedAt: new Date("2026-09-10T10:00:00.000Z"),
    organization: { name: "FES Minden", type: "GYMNASIUM" },
    employeeId: null,
    employee: null,
    personalData: {
      firstName: "Anna",
      lastName: "Beispiel",
      isComplete: true,
      birthDate: new Date("1990-05-01T00:00:00.000Z"),
      rvEntscheidung: null,
      aufenthaltstitelErforderlich: true,
      healthInsuranceType: "gesetzlich",
      severelyDisabled: false,
      children: [],
    },
    documents: [],
    ...teil,
  };
}

/** Eine Zeile der Fake-Datenbank mit ihrer ID (die Zeilen selbst sind `Record<string, unknown>`). */
type MitId = Zeile & { id: string };

function laufend(teil: Zeile = {}, positionen: Zeile[] = [{ typ: "AUFENTHALTSTITEL", bezeichnung: "Aufenthaltstitel" }]): MitId {
  const n = neueNachforderung({
    onboardingId: VORGANG_ID,
    laufendSchluessel: `ONBOARDING:${VORGANG_ID}`,
    empfaenger: ADRESSE,
    empfaengerVorgang: ADRESSE,
    frist: datum("2026-10-05"),
    angefordertVonId: "u-hr",
    angefordertAm: new Date("2026-09-14T08:00:00.000Z"),
    ...teil,
  });
  udb.nachforderungen.push(n);
  positionen.forEach((p, i) =>
    udb.positionen.push(neuePosition({ nachforderungId: n.id, reihenfolge: i, ...p })),
  );
  return n as MitId;
}

function link(n: MitId, teil: Zeile = {}): MitId {
  const l = neuerUnterlagenLink({
    nachforderungId: n.id,
    empfaenger: ADRESSE,
    gueltigBis: datum("2026-10-19"),
    erstelltVonId: "u-hr",
    mailStatus: "SENT",
    gesendetAm: vor(3 * TAG),
    createdAt: vor(3 * TAG),
    ...teil,
  });
  udb.links.push(l);
  return l as MitId;
}

const aktion = (eingabe: UnterlagenAktionInput, opts: { session?: SessionPayload; jetzt?: Date; vorgangId?: string } = {}) =>
  unterlagenAktionAusfuehren({
    modul: "ONBOARDING",
    vorgangId: opts.vorgangId ?? VORGANG_ID,
    eingabe,
    session: opts.session ?? HR,
    jetzt: opts.jetzt ?? JETZT,
  });

function anfordern(teil: Partial<Extract<UnterlagenAktionInput, { aktion: "anfordern" }>> = {}): UnterlagenAktionInput {
  return {
    aktion: "anfordern",
    empfaenger: ADRESSE,
    frist: "2026-10-05",
    positionen: [{ art: "KATALOG", typ: "AUFENTHALTSTITEL" }],
    ...teil,
  };
}

/** Die Mails an die Person in Reihenfolge: Event, Payload, overrideTo. */
function mails() {
  return mockSend.mock.calls.map(([event, payload, opts]) => ({ event, payload, an: opts?.overrideTo }));
}

/** Der Klartext-Token aus dem Link einer Mail. */
function tokenAus(payload: Record<string, unknown>): string {
  return String(payload.link).split("/unterlagen/")[1];
}

function aufruf(name: string): number {
  return udb.aufrufe.indexOf(name);
}

/** Letzter Protokolleintrag der Aktion — die Grenze „im Commit" gegen „nach dem Commit". */
function letztesAudit(): number {
  return udb.aufrufe.lastIndexOf("auditLog.create");
}

/**
 * Die Uebersicht so, wie GET /api/onboarding/[id] sie ruft: mit der Zeile, die
 * die Route schon geladen hat, und deren Pflichtliste.
 */
function uebersicht(session: SessionPayload, requiredDocuments: string[] = ["GEBURTSURKUNDE_EIGEN", "GEBURTSURKUNDE_KIND"]) {
  const zeile = udb.vorgaenge[0] as unknown as OnboardingUnterlagenQuelle & { employeeId: string | null };
  return unterlagenUebersichtLaden(zeile, session, { requiredDocuments, jetzt: JETZT });
}

async function bis(bedingung: () => boolean): Promise<void> {
  for (let i = 0; i < 50 && !bedingung(); i++) await new Promise((r) => setImmediate(r));
}

const alteUmgebung = { ...process.env };
const mockZugriff = canAccessProcess as jest.Mock;
const echtRechte = jest.requireActual<typeof import("@/lib/permissions")>("@/lib/permissions");
const fp = fakePrisma as unknown as Record<string, Record<string, jest.Mock>>;

beforeEach(() => {
  jest.clearAllMocks();
  process.env.NEXT_PUBLIC_APP_URL = BASIS;
  udbLeeren();
  ddbLeeren();
  udb.vorgaenge = [vorgang()];
  udb.users = [
    { id: "u-hr", firstName: "Erika", lastName: "Muster", email: "erika.muster@example.org", isActive: true },
  ];
  mockSend.mockImplementation(async () => ({ status: "SENT", messageId: "<m-1@example.org>" }));
  mockTrigger.mockImplementation(async () => ({ status: "SENT" }));
  mockZugriff.mockImplementation(echtRechte.canAccessProcess);
});

afterEach(() => {
  // Der Upload-Link ist ein Zugang zur Personalakte: nie an einen Webhook.
  for (const [event] of mockTrigger.mock.calls) {
    expect(UNTERLAGEN_PERSONEN_EVENTS).not.toContain(event);
  }
  // Jede Mail an die Person: eines der drei Events, Empfaenger erzwungen.
  for (const m of mails()) {
    expect(UNTERLAGEN_PERSONEN_EVENTS).toContain(m.event);
    expect(m.an).toBeTruthy();
    expect(m.an).toBe(m.payload.email);
  }
});

afterAll(() => {
  process.env = alteUmgebung;
});

// =============================================
// Rechte und Bindung an den Vorgang
// =============================================

describe("Rechte und Vorgang", () => {
  it("403 fuer eine Rolle ohne HR-Bearbeitung — nichts gelesen, nichts geschrieben", async () => {
    const r = await aktion(anfordern(), { session: VORGESETZTE });
    expect(r).toEqual({ status: 403, body: { error: MELDUNGEN.KEINE_BERECHTIGUNG } });
    expect(udb.nachforderungen).toHaveLength(0);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("404 mit demselben Text fuer unbekannten und fremden Vorgang", async () => {
    const unbekannt = await aktion(anfordern(), { vorgangId: ANDERER_VORGANG });
    expect(unbekannt).toEqual({ status: 404, body: { error: MELDUNGEN.VORGANG_NICHT_GEFUNDEN } });

    mockZugriff.mockResolvedValue(false);
    const fremd = await aktion(anfordern());
    expect(fremd).toEqual(unbekannt);
    expect(udb.nachforderungen).toHaveLength(0);
  });

  it("eine Nachforderung eines ANDEREN Vorgangs ergibt dieselbe 404 wie eine unbekannte", async () => {
    udb.vorgaenge.push(vorgang({ id: ANDERER_VORGANG, email: "bert@example.org" }));
    const fremd = laufend({ onboardingId: ANDERER_VORGANG, laufendSchluessel: `ONBOARDING:${ANDERER_VORGANG}` });
    // Nacheinander: Zwei gleichzeitige Aktionen am selben Vorgang bekaemen 409 (Sperre).
    const ergebnisse = [
      await aktion({ aktion: "zurueckziehen", nachforderungId: fremd.id }),
      await aktion({ aktion: "frist-aendern", nachforderungId: "00000000-0000-4000-8000-000000000000", frist: "2026-10-10" }),
    ];
    for (const r of ergebnisse) {
      expect(r.status).toBe(404);
      expect(r.body).toEqual({ error: MELDUNGEN.NACHFORDERUNG_NICHT_GEFUNDEN });
    }
    expect(fremd.status).toBe("LAUFEND");
  });
});

// =============================================
// Anfordern
// =============================================

describe("anfordern", () => {
  it("legt Kopf, Positionen und Link in EINER Transaktion an und schickt die Mail danach", async () => {
    const r = await aktion(
      anfordern({
        nachricht: "Bitte bis Monatsende.",
        positionen: [
          // Der Dialog belegt den Hinweis mit dem Standardtext der Art vor (10.1).
          { art: "KATALOG", typ: "AUFENTHALTSTITEL", hinweis: NACHFORDERUNG_HINWEISE.AUFENTHALTSTITEL },
          { art: "KATALOG", typ: "RV_BEFREIUNG", hinweis: "Seite 2 unterschreiben" },
          { art: "FREI", typ: null, bezeichnung: "Unterschriebener RV-Antrag", originalErforderlich: true },
        ],
      }),
    );
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({
      mail: { status: "SENT", detail: null },
      meldung: "Die Unterlagen sind angefordert.",
    });
    expect(r.body.warnung).toBeUndefined();

    expect(udb.nachforderungen).toHaveLength(1);
    const n = udb.nachforderungen[0];
    expect(r.body.nachforderungId).toBe(n.id);
    expect(n).toMatchObject({
      modul: "ONBOARDING",
      onboardingId: VORGANG_ID,
      status: "LAUFEND",
      laufendSchluessel: `ONBOARDING:${VORGANG_ID}`,
      empfaenger: ADRESSE,
      empfaengerVorgang: ADRESSE,
      empfaengerAbweichend: false,
      nachricht: "Bitte bis Monatsende.",
      angefordertVonId: "u-hr",
    });
    expect(n.frist).toEqual(datum("2026-10-05"));

    // Katalog: Bezeichnung, Schriftform, „sensibel" und Ablaufdatum vom Server,
    // der Hinweis aus dem Body.
    const [titel, rv, frei] = udb.positionen;
    expect(titel).toMatchObject({
      typ: "AUFENTHALTSTITEL",
      bezeichnung: "Aufenthaltstitel",
      sensibel: true,
      fristpflichtig: true,
      originalErforderlich: false,
      hinweis: NACHFORDERUNG_HINWEISE.AUFENTHALTSTITEL,
      status: "ANGEFORDERT",
      reihenfolge: 0,
    });
    expect(rv).toMatchObject({ typ: "RV_BEFREIUNG", originalErforderlich: true, sensibel: false, hinweis: "Seite 2 unterschreiben" });
    expect(frei).toMatchObject({ typ: null, bezeichnung: "Unterschriebener RV-Antrag", originalErforderlich: true, sensibel: false });

    // Link: nur der Hash, gueltig bis Frist + 14, vor dem Versand angelegt.
    expect(udb.links).toHaveLength(1);
    const l = udb.links[0];
    expect(l).toMatchObject({ anlass: "ANFORDERUNG", empfaenger: ADRESSE, erstelltVonId: "u-hr", mailStatus: "SENT" });
    expect(l.gueltigBis).toEqual(datum("2026-10-19"));
    expect(l.gesendetAm).toEqual(JETZT);
    expect(l.messageId).toBe("<m-1@example.org>");

    const [mail] = mails();
    expect(mail.event).toBe(UNTERLAGEN_EVENTS.ANGEFORDERT);
    expect(mail.an).toBe(ADRESSE);
    const token = tokenAus(mail.payload);
    expect(String(mail.payload.link)).toBe(`${BASIS}/unterlagen/${token}`);
    expect(l.tokenHash).toBe(hashToken(token));
    // Der Klartext steht nirgends in der Datenbank.
    expect(JSON.stringify(udb)).not.toContain(token);
    expect(mail.payload).toMatchObject({ ist_erstmalig: "ja", ist_ergaenzung: "", frist: "05.10.2026", email: ADRESSE });
    // Sensible Unterlage nur neutral (E-2).
    expect(String(mail.payload.unterlagenliste)).toContain("Eine vertrauliche Unterlage");
    expect(String(mail.payload.unterlagenliste)).not.toContain("Aufenthaltstitel");

    // Reihenfolge: Sperre des Vorgangs, dann die Mail-Bremse, dann das Anlegen;
    // die Mail erst nach dem Protokoll, also nach dem Ende der Transaktion.
    expect(aufruf("onboardingProcess.updateMany")).toBeGreaterThan(aufruf("$transaction"));
    expect(aufruf("onboardingProcess.updateMany")).toBeLessThan(aufruf("unterlagenLink.findMany"));
    expect(aufruf("unterlagenLink.findMany")).toBeLessThan(aufruf("unterlagenNachforderung.create"));
    expect(aufruf("unterlagenNachforderung.create")).toBeLessThan(aufruf("unterlagenLink.create"));
    expect(aufruf("sendEventEmail")).toBeGreaterThan(letztesAudit());
    expect(letztesAudit()).toBeGreaterThan(aufruf("unterlagenLink.create"));

    // Protokoll: nur IDs, Schluessel, Frist und Laengen — kein Freitext, keine Adresse.
    expect(udb.audits).toHaveLength(1);
    const audit = udb.audits[0];
    expect(audit).toMatchObject({
      action: UNTERLAGEN_AUDIT.ANGEFORDERT,
      userId: "u-hr",
      onboardingId: VORGANG_ID,
      processType: "ONBOARDING",
    });
    expect(audit.details).toEqual({
      nachforderungId: n.id,
      linkId: l.id,
      typen: ["AUFENTHALTSTITEL", "RV_BEFREIUNG"],
      freieZeilen: 1,
      frist: "2026-10-05",
      nachrichtLaenge: 21,
      empfaengerAbweichend: false,
    });
    const text = JSON.stringify(audit);
    expect(text).not.toContain(ADRESSE);
    expect(text).not.toContain("Monatsende");
    expect(text).not.toContain("Unterschriebener");
  });

  it("ohne Hinweis im Body bleibt die Position ohne Hinweis — kein stiller Rueckfall auf den Standardtext", async () => {
    // Hat HR den vorbelegten Hinweis im Dialog geloescht, kommt er hier als
    // undefined an (die Zod-Schicht macht aus "" und null „nicht angegeben").
    const ohne = await aktion(anfordern({ positionen: [{ art: "KATALOG", typ: "PKV_NACHWEIS" }] }));
    expect(ohne.status).toBe(201);
    expect(udb.positionen[0].hinweis).toBeNull();
    expect(String(mails()[0].payload.unterlagenliste)).not.toContain(NACHFORDERUNG_HINWEISE.PKV_NACHWEIS);

    // Gegenprobe: mit Hinweis im Body steht er in Position und Mail.
    await aktion({ aktion: "zurueckziehen", nachforderungId: String(ohne.body.nachforderungId) });
    await aktion(anfordern({ positionen: [{ art: "KATALOG", typ: "PKV_NACHWEIS", hinweis: NACHFORDERUNG_HINWEISE.PKV_NACHWEIS }] }));
    expect(udb.positionen.at(-1)!.hinweis).toBe(NACHFORDERUNG_HINWEISE.PKV_NACHWEIS);
    expect(String(mails().at(-1)!.payload.unterlagenliste)).toContain(NACHFORDERUNG_HINWEISE.PKV_NACHWEIS);
  });

  it("Doppelklick: der zweite Aufruf scheitert am Unique-Index (P2002) → 409, keine zweite Mail", async () => {
    laufend();
    const r = await aktion(anfordern());
    expect(r).toEqual({ status: 409, body: { error: MELDUNGEN.LAEUFT_BEREITS, grund: "LAEUFT_BEREITS" } });
    expect(udb.nachforderungen).toHaveLength(1);
    expect(udb.links).toHaveLength(0);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("zwei gleichzeitige Aktionen am selben Vorgang: die zweite bekommt 409 (Sperre je Vorgang)", async () => {
    let freigeben: (e: EventEmailResult) => void = () => {};
    mockSend.mockImplementationOnce(() => new Promise<EventEmailResult>((res) => (freigeben = res)));
    const erste = aktion(anfordern());
    await bis(() => mockSend.mock.calls.length === 1);

    const zweite = await aktion(anfordern());
    expect(zweite).toEqual({ status: 409, body: { error: MELDUNGEN.AKTION_LAEUFT, grund: "AKTION_LAEUFT" } });

    freigeben({ status: "SENT" });
    expect((await erste).status).toBe(201);
    // Nach der ersten ist die Sperre wieder frei.
    const dritte = await aktion(anfordern());
    expect(dritte.status).toBe(409);
    expect(dritte.body.grund).toBe("LAEUFT_BEREITS");
  });

  describe("Mail-Bremse ueber alle Nachforderungen des Vorgangs (5.2, Tabelle 6.1)", () => {
    it("Zurueckziehen und Anfordern im Wechsel: die 7. Mail in einer Stunde → 429 mit Retry-After, nichts angelegt", async () => {
      for (let i = 0; i < 6; i++) {
        const jetzt = new Date(JETZT.getTime() + i * MINUTE);
        const r = await aktion(anfordern(), { jetzt });
        expect(r.status).toBe(201);
        expect((await aktion({ aktion: "zurueckziehen", nachforderungId: String(r.body.nachforderungId) }, { jetzt })).status).toBe(200);
      }
      const siebte = await aktion(anfordern(), { jetzt: new Date(JETZT.getTime() + 6 * MINUTE) });
      expect(siebte).toEqual({
        status: 429,
        body: { error: MELDUNGEN.MAIL_BREMSE, grund: "MAIL_BREMSE" },
        // Die erste Mail (JETZT) faellt nach 60 Minuten aus dem Fenster — noch 54.
        headers: { "Retry-After": String(54 * 60) },
      });
      expect(udb.nachforderungen).toHaveLength(6);
      expect(mockSend).toHaveBeenCalledTimes(6);
      // Erst den Vorgang sperren, dann zaehlen — im letzten, abgewiesenen Durchgang.
      const letzte = udb.aufrufe.lastIndexOf("$transaction");
      const sperre = udb.aufrufe.indexOf("onboardingProcess.updateMany", letzte);
      const zaehlen = udb.aufrufe.indexOf("unterlagenLink.findMany", letzte);
      expect(sperre).toBeGreaterThan(letzte);
      expect(zaehlen).toBeGreaterThan(sperre);
      expect(udb.aufrufe.indexOf("unterlagenNachforderung.create", letzte)).toBe(-1);
    });

    it("Mails an einen ANDEREN Vorgang zaehlen nicht mit", async () => {
      udb.vorgaenge.push(vorgang({ id: ANDERER_VORGANG, email: "bert@example.org" }));
      const fremd = laufend({ onboardingId: ANDERER_VORGANG, laufendSchluessel: `ONBOARDING:${ANDERER_VORGANG}` });
      for (const minuten of [50, 40, 30, 20, 10, 5]) link(fremd, { createdAt: vor(minuten * MINUTE) });
      expect((await aktion(anfordern())).status).toBe(201);
    });
  });

  it("vor der Abgabe des Fragebogens und bei EXPIRED: 409 mit dem Grund im Klartext", async () => {
    udb.vorgaenge = [vorgang({ status: "IN_PROGRESS", submittedAt: null, personalData: { ...vorgang().personalData as Zeile, isComplete: false } })];
    const offen = await aktion(anfordern());
    expect(offen).toEqual({
      status: 409,
      body: { error: ONBOARDING_NICHT_VERFUEGBAR.FRAGEBOGEN_OFFEN, grund: "NICHT_VERFUEGBAR" },
    });

    udb.vorgaenge = [vorgang({ status: "EXPIRED" })];
    const abgelaufen = await aktion(anfordern());
    expect(abgelaufen.body).toEqual({ error: ONBOARDING_NICHT_VERFUEGBAR.VORGANG_EINGESTELLT, grund: "NICHT_VERFUEGBAR" });
    expect(udb.nachforderungen).toHaveLength(0);
  });

  it("auch nach dem Abschluss (COMPLETED) laesst sich nachfordern", async () => {
    udb.vorgaenge = [vorgang({ status: "COMPLETED" })];
    expect((await aktion(anfordern())).status).toBe(201);
  });

  it("EXPIRED zwischen Lesen und Schreiben: 409, nichts angelegt, keine Mail", async () => {
    udb.vorTransaktion = () => {
      udb.vorgaenge[0].status = "EXPIRED";
    };
    const r = await aktion(anfordern());
    expect(r).toEqual({
      status: 409,
      body: { error: MELDUNGEN.HR_VORGANG_EINGESTELLT, grund: "HR_VORGANG_EINGESTELLT" },
    });
    expect(udb.nachforderungen).toHaveLength(0);
    expect(udb.links).toHaveLength(0);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("sensible Art ohne Pflicht (Fuehrungszeugnis) → 409 mit Grund, nichts angelegt", async () => {
    const r = await aktion(anfordern({ positionen: [{ art: "KATALOG", typ: "FUEHRUNGSZEUGNIS" }] }));
    expect(r).toEqual({
      status: 409,
      body: {
        error: MELDUNGEN.SENSIBEL_NICHT_ERLAUBT,
        grund: "SENSIBEL_NICHT_ERLAUBT",
        typ: "FUEHRUNGSZEUGNIS",
        hinweis: SENSIBEL_SPERRGRUND_TEXTE.NICHT_PFLICHT,
      },
    });
    expect(udb.nachforderungen).toHaveLength(0);
  });

  it("SB-Ausweis nur mit der Angabe „schwerbehindert“", async () => {
    const ohne = await aktion(anfordern({ positionen: [{ art: "KATALOG", typ: "SB_AUSWEIS" }] }));
    expect(ohne.body.hinweis).toBe(SENSIBEL_SPERRGRUND_TEXTE.SB_AUSWEIS_OHNE_ANGABE);

    udb.vorgaenge = [vorgang({ personalData: { ...(vorgang().personalData as Zeile), severelyDisabled: true } })];
    expect((await aktion(anfordern({ positionen: [{ art: "KATALOG", typ: "SB_AUSWEIS" }] }))).status).toBe(201);
  });

  it("Fuehrungszeugnis bei einer Kita gesperrt, auch wenn es vorliegt", async () => {
    udb.vorgaenge = [
      vorgang({ organization: { name: "Kita Sonnenschein", type: "KITA" }, documents: [{ type: "FUEHRUNGSZEUGNIS" }] }),
    ];
    const r = await aktion(anfordern({ positionen: [{ art: "KATALOG", typ: "FUEHRUNGSZEUGNIS" }] }));
    expect(r.status).toBe(409);
    expect(r.body.hinweis).toBe(SENSIBEL_SPERRGRUND_TEXTE.FUEHRUNGSZEUGNIS_KITA);
  });

  it("Sammelart und unbekannte Art → 400 (eingabePruefen), Frist ausserhalb der Grenzen → 400", async () => {
    expect((await aktion(anfordern({ positionen: [{ art: "KATALOG", typ: "SONSTIGES" }] }))).body.grund).toBe("SAMMELART");
    expect((await aktion(anfordern({ positionen: [{ art: "KATALOG", typ: "GIBT_ES_NICHT" }] }))).body.grund).toBe("TYP_UNBEKANNT");
    expect(await aktion(anfordern({ frist: "2026-09-21" }))).toEqual({
      status: 400,
      body: { error: MELDUNGEN.FRIST_ZU_FRUEH, grund: "FRIST_ZU_FRUEH" },
    });
    expect((await aktion(anfordern({ frist: "2026-12-21" }))).body.grund).toBe("FRIST_ZU_SPAET");
    expect(udb.nachforderungen).toHaveLength(0);
  });

  describe("Empfaenger", () => {
    it("die Adresse des Vorgangs ist immer erlaubt, auch in anderer Schreibweise und mit Freigabeliste", async () => {
      udb.smtp.allowedRecipientDomains = "credo-gruppe.de";
      const r = await aktion(anfordern({ empfaenger: "Anna.Privat@Example.org" }));
      expect(r.status).toBe(201);
      expect(udb.nachforderungen[0].empfaengerAbweichend).toBe(false);
    });

    it("abweichende Adresse ausserhalb der Freigabeliste → 409, nichts angelegt", async () => {
      udb.smtp.allowedRecipientDomains = "credo-gruppe.de";
      const r = await aktion(anfordern({ empfaenger: "anna@gmail.example", adresseBestaetigt: true }));
      expect(r).toEqual({
        status: 409,
        body: { error: MELDUNGEN.EMPFAENGER_NICHT_FREIGEGEBEN, grund: "EMPFAENGER_NICHT_FREIGEGEBEN" },
      });
      expect(udb.nachforderungen).toHaveLength(0);
    });

    it("abweichende Adresse ohne Bestaetigung → 409, auch bei leerer Freigabeliste", async () => {
      const r = await aktion(anfordern({ empfaenger: "anna@gmail.example" }));
      expect(r).toEqual({
        status: 409,
        body: { error: MELDUNGEN.ADRESSE_NICHT_BESTAETIGT, grund: "ADRESSE_NICHT_BESTAETIGT" },
      });
      expect(udb.nachforderungen).toHaveLength(0);
    });

    it("leere Freigabeliste + Bestaetigung: erlaubt, abweichend vermerkt, Mail an genau diese Adresse", async () => {
      const r = await aktion(anfordern({ empfaenger: "anna@gmail.example", adresseBestaetigt: true }));
      expect(r.status).toBe(201);
      expect(udb.nachforderungen[0]).toMatchObject({
        empfaenger: "anna@gmail.example",
        empfaengerVorgang: ADRESSE,
        empfaengerAbweichend: true,
      });
      expect(mails()[0].an).toBe("anna@gmail.example");
      expect(udb.audits[0].details).toMatchObject({ empfaengerAbweichend: true, adresseBestaetigt: true });
    });

    it("freigegebene Domain + Bestaetigung: erlaubt", async () => {
      udb.smtp.allowedRecipientDomains = "credo-gruppe.de";
      const r = await aktion(anfordern({ empfaenger: "a.beispiel@credo-gruppe.de", adresseBestaetigt: true }));
      expect(r.status).toBe(201);
    });
  });

  describe("Vorlage der Mail an die Person (vor jeder Anlage)", () => {
    function vorlage(teil: Zeile): void {
      udb.emailVorlagen.push({
        event: UNTERLAGEN_EVENTS.ANGEFORDERT,
        subject: "Unterlagen zu Ihrem Vorgang",
        bodyHtml: "<p>Hier: {{link}}</p>",
        bodyText: null,
        recipientTo: "",
        recipientCc: "",
        recipientBcc: "",
        recipientReplyTo: "",
        isActive: true,
        ...teil,
      });
    }

    it.each([
      ["deaktiviert", { isActive: false }, "VORLAGE_DEAKTIVIERT"],
      ["ohne {{link}}", { bodyHtml: "<p>Bitte melden Sie sich.</p>" }, "VORLAGE_OHNE_LINK"],
      ["mit {{link}} im Betreff", { subject: "Ihr Link: {{link}}" }, "VORLAGE_BETREFF"],
    ])("gespeicherte Vorlage %s → 409 ohne jede Aenderung", async (_fall, teil, grund) => {
      vorlage(teil);
      const r = await aktion(anfordern());
      expect(r.status).toBe(409);
      expect(r.body.grund).toBe(grund);
      expect(String(r.body.error)).toContain("„Unterlagen angefordert“");
      expect(udb.nachforderungen).toHaveLength(0);
      expect(udb.aufrufe).not.toContain("$transaction");
      expect(mockSend).not.toHaveBeenCalled();
    });

    it("eine taugliche gespeicherte Vorlage geht durch", async () => {
      vorlage({});
      expect((await aktion(anfordern())).status).toBe(201);
    });
  });

  describe("Ergebnis der Mail (EP-11, N2)", () => {
    it("FAILED: 201 mit Warnung, Link FAILED ohne gesendetAm (der Lauf holt nach)", async () => {
      mockSend.mockImplementationOnce(async () => ({ status: "FAILED", detail: "Timeout" }));
      const r = await aktion(anfordern());
      expect(r.status).toBe(201);
      expect(r.body).toMatchObject({
        mail: { status: "FAILED", detail: "Timeout" },
        warnung: MELDUNGEN.MAIL_NICHT_ZUGESTELLT,
      });
      expect(udb.links[0]).toMatchObject({ mailStatus: "FAILED", mailDetail: "Timeout", gesendetAm: null, entwertetAm: null });
    });

    it("SKIPPED wegen deaktivierter Vorlage: 201 mit Warnung „Vorlage deaktiviert“", async () => {
      mockSend.mockImplementationOnce(async () => ({ status: "SKIPPED", detail: "E-Mail-Vorlage ist deaktiviert" }));
      const r = await aktion(anfordern());
      expect(r.status).toBe(201);
      expect(r.body.warnung).toBe(MELDUNGEN.MAIL_VORLAGE_DEAKTIVIERT);
      expect(udb.links[0].mailStatus).toBe("SKIPPED");
    });

    it("SENT, Speichern scheitert einmal: zweiter Versuch, keine Warnung", async () => {
      const stumm = jest.spyOn(console, "error").mockImplementation(() => {});
      fp.unterlagenLink.updateMany.mockRejectedValueOnce(Object.assign(new Error("weg"), { code: "P1001" }));
      const r = await aktion(anfordern());
      expect(r.status).toBe(201);
      expect(r.body.warnung).toBeUndefined();
      expect(udb.links[0].mailStatus).toBe("SENT");
      stumm.mockRestore();
    });

    it("SENT, Speichern scheitert zweimal: 2xx mit „versendet, bitte nicht erneut senden“ — nie 500", async () => {
      const stumm = jest.spyOn(console, "error").mockImplementation(() => {});
      fp.unterlagenLink.updateMany
        .mockRejectedValueOnce(Object.assign(new Error("weg"), { code: "P1001" }))
        .mockRejectedValueOnce(Object.assign(new Error("weg"), { code: "P1001" }));
      const r = await aktion(anfordern());
      expect(r.status).toBe(201);
      expect(r.body).toMatchObject({
        mail: { status: "SENT", nachweisFehlt: true },
        warnung: MELDUNGEN.MAIL_NACHWEIS_FEHLT,
      });
      // Die Konsole nennt nur die Link-ID und den Code, keine Adresse.
      const log = JSON.stringify(stumm.mock.calls);
      expect(log).not.toContain(ADRESSE);
      expect(log).toContain("P1001");
      stumm.mockRestore();
    });
  });
});

// =============================================
// Ergaenzen
// =============================================

describe("ergaenzen", () => {
  it("neue Position und reaktivierte entfallene Art: beide „(neu)“, Merker zurueckgesetzt, Link ERGAENZUNG", async () => {
    const n = laufend(
      { vollstaendigSeit: vor(TAG), vollstaendigGemeldetAm: vor(TAG) },
      [
        { typ: "AUFENTHALTSTITEL", bezeichnung: "Aufenthaltstitel", status: "EINGEREICHT" },
        {
          // Eingereicht, zurueckgewiesen, erneut eingereicht — dann „Entfällt" (EP-2).
          typ: "PKV_NACHWEIS",
          bezeichnung: "Nachweis private Krankenversicherung",
          status: "ENTFAELLT",
          einreichungen: 2,
          uebermitteltAm: vor(3 * TAG),
          gueltigBisAngabe: datum("2027-01-31"),
          begruendung: "Seite 2 fehlt",
          hinweis: "Alter Hinweis",
          entschiedenAm: vor(2 * TAG),
          entschiedenVonId: "u-hr",
          entfaelltNotiz: "doch gesetzlich",
        },
      ],
    );
    const r = await aktion({
      aktion: "ergaenzen",
      nachforderungId: n.id,
      positionen: [
        { art: "KATALOG", typ: "PKV_NACHWEIS" },
        { art: "KATALOG", typ: "ARBEITSERLAUBNIS" },
      ],
    });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ nachforderungId: n.id, meldung: "Die Nachforderung ist ergänzt.", mail: { status: "SENT" } });

    // Wieder aktiv wie neu angefordert: nichts aus der verworfenen Runde bleibt
    // als „aktuell" stehen; der Zaehler der Einreichungen laeuft weiter.
    const pkv = udb.positionen.find((p) => p.typ === "PKV_NACHWEIS")!;
    expect(pkv).toMatchObject({
      status: "ANGEFORDERT",
      entschiedenAm: null,
      entschiedenVonId: null,
      entfaelltNotiz: null,
      uebermitteltAm: null,
      gueltigBisAngabe: null,
      begruendung: null,
      hinweis: null,
      einreichungen: 2,
    });
    expect(pkv.angefordertAm).toEqual(JETZT);
    const erlaubnis = udb.positionen.find((p) => p.typ === "ARBEITSERLAUBNIS")!;
    expect(erlaubnis).toMatchObject({ status: "ANGEFORDERT", reihenfolge: 2, sensibel: true, fristpflichtig: true });
    expect(udb.positionen).toHaveLength(3);

    expect(n).toMatchObject({ vollstaendigSeit: null, vollstaendigGemeldetAm: null });
    expect(udb.links.at(-1)).toMatchObject({ anlass: "ERGAENZUNG", erstelltVonId: "u-hr" });

    const [mail] = mails();
    expect(mail.payload.ist_ergaenzung).toBe("ja");
    const liste = String(mail.payload.unterlagenliste);
    expect(liste).toContain("Nachweis private Krankenversicherung (neu)");
    expect(liste).toContain("Eine vertrauliche Unterlage (neu)");
    // Die eingereichte wartet nicht auf die Person — sie steht nicht in der Liste.
    expect(liste).not.toContain("Aufenthaltstitel");

    expect(udb.audits.at(-1)).toMatchObject({
      action: UNTERLAGEN_AUDIT.ERGAENZT,
      details: { nachforderungId: n.id, typen: ["ARBEITSERLAUBNIS"], reaktiviert: ["PKV_NACHWEIS"], freieZeilen: 0 },
    });
    // Die Mail erst nach dem Commit.
    expect(aufruf("sendEventEmail")).toBeGreaterThan(letztesAudit());
  });

  it("reaktivierter Aufenthaltstitel: Karte zeigt kein „Gültig bis“ der verworfenen Einreichung mehr", async () => {
    const n = laufend({}, [
      {
        typ: "AUFENTHALTSTITEL",
        bezeichnung: "Aufenthaltstitel",
        sensibel: true,
        fristpflichtig: true,
        status: "ENTFAELLT",
        einreichungen: 1,
        uebermitteltAm: vor(3 * TAG),
        gueltigBisAngabe: datum("2027-01-31"),
        entschiedenAm: vor(2 * TAG),
      },
    ]);
    const vorher = (await uebersicht(HR)).unterlagen.laufend!.positionen[0];
    expect(vorher.gueltigBisAngabeText).toBe("Gültig bis (Angabe der Person): 31.01.2027");

    const r = await aktion({ aktion: "ergaenzen", nachforderungId: n.id, positionen: [{ art: "KATALOG", typ: "AUFENTHALTSTITEL" }] });
    expect(r.status).toBe(200);
    const nachher = (await uebersicht(HR)).unterlagen.laufend!.positionen[0];
    expect(nachher).toMatchObject({ status: "ANGEFORDERT", gueltigBisAngabe: null, gueltigBisAngabeText: null, begruendungText: null });
  });

  it("reaktivierte Art mit Hinweis im Body: der neue Hinweis gilt", async () => {
    const n = laufend({}, [{ typ: "PKV_NACHWEIS", bezeichnung: "PKV", status: "ENTFAELLT", hinweis: "Alter Hinweis" }]);
    const r = await aktion({
      aktion: "ergaenzen",
      nachforderungId: n.id,
      positionen: [{ art: "KATALOG", typ: "PKV_NACHWEIS", hinweis: "Nur die Bescheinigung, bitte." }],
    });
    expect(r.status).toBe(200);
    expect(udb.positionen[0]).toMatchObject({ status: "ANGEFORDERT", hinweis: "Nur die Bescheinigung, bitte." });
  });

  it("eine schon angeforderte Art → 409, mehr als 30 Positionen → 409", async () => {
    const n = laufend();
    const doppelt = await aktion({ aktion: "ergaenzen", nachforderungId: n.id, positionen: [{ art: "KATALOG", typ: "AUFENTHALTSTITEL" }] });
    expect(doppelt).toEqual({ status: 409, body: { error: MELDUNGEN.BEREITS_ANGEFORDERT, grund: "BEREITS_ANGEFORDERT" } });

    const frei = Array.from({ length: 30 }, (_, i) => ({
      art: "FREI" as const,
      typ: null,
      bezeichnung: `Blatt ${i + 1}`,
      originalErforderlich: false,
    }));
    const zuViele = await aktion({ aktion: "ergaenzen", nachforderungId: n.id, positionen: frei });
    expect(zuViele.body.grund).toBe("ZU_VIELE_POSITIONEN");
    expect(zuViele.status).toBe(409);
    expect(udb.positionen).toHaveLength(1);
  });

  it("nach der Frist ohne neue Frist → 409; mit neuer Frist: lebende Links fortgeschrieben, tote nicht", async () => {
    const n = laufend({ frist: datum("2026-09-18") });
    const lebt = link(n, { gueltigBis: datum("2026-10-02") });
    const tot = link(n, { gueltigBis: datum("2026-09-20") });

    const ohne = await aktion({ aktion: "ergaenzen", nachforderungId: n.id, positionen: [{ art: "KATALOG", typ: "ARBEITSERLAUBNIS" }] });
    expect(ohne).toEqual({ status: 409, body: { error: MELDUNGEN.NEUE_FRIST_NOETIG, grund: "NEUE_FRIST_NOETIG" } });

    const mit = await aktion({
      aktion: "ergaenzen",
      nachforderungId: n.id,
      frist: "2026-10-09",
      positionen: [{ art: "KATALOG", typ: "ARBEITSERLAUBNIS" }],
    });
    expect(mit.status).toBe(200);
    expect(n.frist).toEqual(datum("2026-10-09"));
    expect(lebt.gueltigBis).toEqual(datum("2026-10-23"));
    expect(tot.gueltigBis).toEqual(datum("2026-09-20"));
    expect(udb.links.at(-1)!.gueltigBis).toEqual(datum("2026-10-23"));
  });

  it("gewinnt ein zweiter Container den Wettlauf um dieselbe Art (P2002 auf nachforderungId+typ): 409, kein 500", async () => {
    const n = laufend();
    fp.unterlagenPosition.create.mockRejectedValueOnce(
      Object.assign(new Error("Unique"), { code: "P2002", meta: { target: ["nachforderungId", "typ"] } }),
    );
    const r = await aktion({ aktion: "ergaenzen", nachforderungId: n.id, positionen: [{ art: "KATALOG", typ: "ARBEITSERLAUBNIS" }] });
    expect(r).toEqual({ status: 409, body: { error: MELDUNGEN.BEREITS_ANGEFORDERT, grund: "BEREITS_ANGEFORDERT" } });
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("nicht LAUFEND → 409, keine Mail", async () => {
    const n = laufend({ status: "ERLEDIGT", laufendSchluessel: null });
    const r = await aktion({ aktion: "ergaenzen", nachforderungId: n.id, positionen: [{ art: "KATALOG", typ: "ARBEITSERLAUBNIS" }] });
    expect(r).toEqual({ status: 409, body: { error: MELDUNGEN.NICHT_LAUFEND, grund: "NICHT_LAUFEND" } });
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("bei EXPIRED gesperrt (EP-3)", async () => {
    udb.vorgaenge = [vorgang({ status: "EXPIRED" })];
    const n = laufend();
    const r = await aktion({ aktion: "ergaenzen", nachforderungId: n.id, positionen: [{ art: "KATALOG", typ: "ARBEITSERLAUBNIS" }] });
    expect(r.body).toEqual({ error: MELDUNGEN.HR_VORGANG_EINGESTELLT, grund: "HR_VORGANG_EINGESTELLT" });
  });

  it("die 7. Mail in einer Stunde → 429 mit Retry-After — erst sperren, dann zaehlen, nichts geschrieben", async () => {
    const n = laufend();
    for (const minuten of [50, 40, 30, 20, 10, 5]) link(n, { createdAt: vor(minuten * MINUTE), gesendetAm: vor(minuten * MINUTE) });
    const r = await aktion({ aktion: "ergaenzen", nachforderungId: n.id, positionen: [{ art: "KATALOG", typ: "ARBEITSERLAUBNIS" }] });
    expect(r).toEqual({
      status: 429,
      body: { error: MELDUNGEN.MAIL_BREMSE, grund: "MAIL_BREMSE" },
      // Die aelteste der sechs faellt in 10 Minuten aus dem Fenster.
      headers: { "Retry-After": "600" },
    });
    expect(udb.links).toHaveLength(6);
    expect(udb.positionen).toHaveLength(1);
    expect(mockSend).not.toHaveBeenCalled();

    const sperre = udb.aufrufe.indexOf("unterlagenNachforderung.updateMany");
    const zaehlen = udb.aufrufe.indexOf("unterlagenLink.findMany");
    expect(udb.aufrufe.indexOf("onboardingProcess.updateMany")).toBeLessThan(sperre);
    expect(sperre).toBeGreaterThan(-1);
    expect(sperre).toBeLessThan(zaehlen);
  });

  it("Mails des taeglichen Laufs (ohne erstelltVonId) zaehlen nicht zur Bremse", async () => {
    const n = laufend();
    for (const minuten of [50, 40, 30, 20, 10, 5]) link(n, { createdAt: vor(minuten * MINUTE), erstelltVonId: null });
    const r = await aktion({ aktion: "ergaenzen", nachforderungId: n.id, positionen: [{ art: "KATALOG", typ: "ARBEITSERLAUBNIS" }] });
    expect(r.status).toBe(200);
  });

  it("20 Mails in 24 Stunden → 429 bis die aelteste aus dem Tagesfenster faellt", async () => {
    const n = laufend();
    for (let i = 0; i < 20; i++) link(n, { createdAt: vor((23 * 60 - i * 60) * MINUTE) });
    const r = await aktion({ aktion: "ergaenzen", nachforderungId: n.id, positionen: [{ art: "KATALOG", typ: "ARBEITSERLAUBNIS" }] });
    expect(r.status).toBe(429);
    // Die aelteste liegt 23 Stunden zurueck: noch 1 Stunde.
    expect(r.headers).toEqual({ "Retry-After": "3600" });
  });
});

// =============================================
// Frist aendern
// =============================================

describe("frist-aendern", () => {
  it("schreibt nur lebende Links fort und schickt eine Mail mit neuem Link", async () => {
    const n = laufend({ frist: datum("2026-09-10") });
    const lebt = link(n, { gueltigBis: datum("2026-09-24") });
    const tot = link(n, { gueltigBis: datum("2026-09-20") });
    const entwertet = link(n, { gueltigBis: datum("2026-09-24"), entwertetAm: vor(TAG), entwertetGrund: "ADRESSE" });

    const r = await aktion({ aktion: "frist-aendern", nachforderungId: n.id, frist: "2026-10-10" });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ mail: { status: "SENT" }, meldung: "Die Frist ist geändert." });
    expect(n.frist).toEqual(datum("2026-10-10"));
    expect(lebt.gueltigBis).toEqual(datum("2026-10-24"));
    expect(tot.gueltigBis).toEqual(datum("2026-09-20"));
    expect(entwertet.gueltigBis).toEqual(datum("2026-09-24"));

    const neu = udb.links.at(-1)!;
    expect(neu).toMatchObject({ anlass: "FRISTAENDERUNG" });
    expect(neu.gueltigBis).toEqual(datum("2026-10-24"));
    expect(mails()[0].payload).toMatchObject({ ist_fristaenderung: "ja", frist: "10.10.2026", frist_verstrichen: "" });
    expect(udb.audits.at(-1)).toMatchObject({
      action: UNTERLAGEN_AUDIT.FRIST_GEAENDERT,
      details: { fristVorher: "2026-09-10", fristNachher: "2026-10-10", linksFortgeschrieben: 1 },
    });
    // Erst sperren, dann zaehlen, dann schreiben; die Mail nach dem Commit.
    expect(aufruf("onboardingProcess.updateMany")).toBeLessThan(aufruf("unterlagenLink.findMany"));
    expect(aufruf("sendEventEmail")).toBeGreaterThan(letztesAudit());
  });

  it("wartet nichts mehr auf die Person: keine Mail, kein Link, Meldung sagt das", async () => {
    const n = laufend({}, [{ typ: "AUFENTHALTSTITEL", status: "EINGEREICHT" }]);
    const r = await aktion({ aktion: "frist-aendern", nachforderungId: n.id, frist: "2026-10-10" });
    expect(r).toEqual({
      status: 200,
      body: { nachforderungId: n.id, mail: null, meldung: `Die Frist ist geändert. ${MELDUNGEN.NICHTS_OFFEN}` },
    });
    expect(udb.links).toHaveLength(0);
    expect(mockSend).not.toHaveBeenCalled();
    expect(n.frist).toEqual(datum("2026-10-10"));
  });

  it("dieselbe Frist → 409, Frist ausserhalb der Grenzen → 400, EXPIRED → 409", async () => {
    const n = laufend();
    expect((await aktion({ aktion: "frist-aendern", nachforderungId: n.id, frist: "2026-10-05" })).body.grund).toBe(
      "FRIST_UNVERAENDERT",
    );
    expect((await aktion({ aktion: "frist-aendern", nachforderungId: n.id, frist: "2027-01-05" })).status).toBe(400);
    udb.vorgaenge = [vorgang({ status: "EXPIRED" })];
    expect((await aktion({ aktion: "frist-aendern", nachforderungId: n.id, frist: "2026-10-10" })).body.grund).toBe(
      "HR_VORGANG_EINGESTELLT",
    );
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("Merker „vollständig“ bleibt (2.1)", async () => {
    const seit = vor(TAG);
    const n = laufend({ vollstaendigSeit: seit, vollstaendigGemeldetAm: seit }, [{ typ: "AUFENTHALTSTITEL", status: "EINGEREICHT" }]);
    await aktion({ aktion: "frist-aendern", nachforderungId: n.id, frist: "2026-10-10" });
    expect(n.vollstaendigSeit).toEqual(seit);
    expect(n.vollstaendigGemeldetAm).toEqual(seit);
  });
});

// =============================================
// Link erneut senden
// =============================================

describe("erneut-senden", () => {
  it("SENT → 201 mit neuem Link ERNEUT; aeltere Links bleiben gueltig (E-5)", async () => {
    const n = laufend();
    const alt = link(n);
    const r = await aktion({ aktion: "erneut-senden", nachforderungId: n.id });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({
      nachforderungId: n.id,
      mail: { status: "SENT" },
      meldung: "Der Link ist erneut gesendet.",
      adresseGeaendert: false,
      fruehereGesperrt: false,
    });
    expect(alt.entwertetAm).toBeNull();
    expect(udb.links.at(-1)).toMatchObject({ anlass: "ERNEUT", mailStatus: "SENT" });
    expect(mails()[0].payload.ist_erneut).toBe("ja");
    // Link und Protokoll im Commit, die Mail danach.
    expect(aufruf("unterlagenLink.create")).toBeLessThan(letztesAudit());
    expect(aufruf("sendEventEmail")).toBeGreaterThan(letztesAudit());
  });

  it("neue Adresse: Freigabe geprueft, alte Links VOR dem Versand als ADRESSE entwertet", async () => {
    udb.smtp.allowedRecipientDomains = "credo-gruppe.de";
    const n = laufend();
    const alt = link(n);
    let beimVersand: Zeile | null = null;
    mockSend.mockImplementationOnce(async () => {
      beimVersand = structuredClone(alt);
      return { status: "SENT" };
    });
    const r = await aktion({
      aktion: "erneut-senden",
      nachforderungId: n.id,
      empfaenger: "a.beispiel@credo-gruppe.de",
      adresseBestaetigt: true,
    });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ adresseGeaendert: true });
    expect(beimVersand).toMatchObject({ entwertetGrund: "ADRESSE" });
    expect(n).toMatchObject({
      empfaenger: "a.beispiel@credo-gruppe.de",
      empfaengerVorgang: ADRESSE,
      empfaengerAbweichend: true,
    });
    expect(mails()[0].an).toBe("a.beispiel@credo-gruppe.de");
    const neu = udb.links.at(-1)!;
    expect(neu).toMatchObject({ empfaenger: "a.beispiel@credo-gruppe.de", entwertetAm: null });
    expect(udb.audits.at(-1)!.details).toMatchObject({ adresseGeaendert: true, linksEntwertet: 1, adresseBestaetigt: true });
  });

  it("neue Adresse ausserhalb der Freigabeliste bzw. ohne Bestaetigung → 409, nichts geaendert", async () => {
    udb.smtp.allowedRecipientDomains = "credo-gruppe.de";
    const n = laufend();
    const alt = link(n);
    const gesperrt = await aktion({ aktion: "erneut-senden", nachforderungId: n.id, empfaenger: "x@gmail.example", adresseBestaetigt: true });
    expect(gesperrt.body.grund).toBe("EMPFAENGER_NICHT_FREIGEGEBEN");
    const unbestaetigt = await aktion({ aktion: "erneut-senden", nachforderungId: n.id, empfaenger: "x@credo-gruppe.de" });
    expect(unbestaetigt.body.grund).toBe("ADRESSE_NICHT_BESTAETIGT");
    expect(n.empfaenger).toBe(ADRESSE);
    expect(alt.entwertetAm).toBeNull();
    expect(udb.links).toHaveLength(1);
  });

  it("zurueck auf die Adresse des Vorgangs braucht keine Bestaetigung, entwertet aber den Link an die falsche", async () => {
    const n = laufend({ empfaenger: "falsch@example.org", empfaengerAbweichend: true });
    const alt = link(n, { empfaenger: "falsch@example.org" });
    const r = await aktion({ aktion: "erneut-senden", nachforderungId: n.id, empfaenger: ADRESSE });
    expect(r.status).toBe(201);
    expect(alt.entwertetGrund).toBe("ADRESSE");
    expect(n).toMatchObject({ empfaenger: ADRESSE, empfaengerAbweichend: false });
  });

  it("Adresswechsel: `entwertetAm` ist der Zeitpunkt UNTER der Sperre der Nachforderung, nicht der Anfang der Aktion (U-17)", async () => {
    // Zwischen dem Klick (JETZT) und der Sperre liegen Abfragen und das Warten
    // auf einen Upload, der die Sperre zuerst bekam und mit SEINER Zeit unter
    // der Sperre stempelte. Die Grenze „eigene Entwürfe" muss danach liegen.
    const n = laufend({ empfaenger: "falsch@example.org", empfaengerAbweichend: true });
    const alt = link(n, { empfaenger: "falsch@example.org" });
    const NACH_DER_SPERRE = JETZT.getTime() + 5_000;
    let uhr = JETZT.getTime();
    const jetztSpion = jest.spyOn(Date, "now").mockImplementation(() => uhr);
    const echtSperren = fp.unterlagenNachforderung.updateMany.getMockImplementation()!;
    fp.unterlagenNachforderung.updateMany.mockImplementationOnce(async (...args: Parameters<typeof echtSperren>) => {
      const r = await echtSperren(...args);
      uhr = NACH_DER_SPERRE; // die Sperre war belegt
      return r;
    });
    try {
      const r = await aktion({ aktion: "erneut-senden", nachforderungId: n.id, empfaenger: ADRESSE });
      expect(r.status).toBe(201);
    } finally {
      jetztSpion.mockRestore();
    }
    expect(alt).toMatchObject({ entwertetGrund: "ADRESSE", entwertetAm: new Date(NACH_DER_SPERRE) });
  });

  it("„frühere Links sperren“ erst NACH SENT", async () => {
    const n = laufend();
    const alt = link(n);
    let beimVersand: Zeile | null = null;
    mockSend.mockImplementationOnce(async () => {
      beimVersand = structuredClone(alt);
      return { status: "SENT" };
    });
    const r = await aktion({ aktion: "erneut-senden", nachforderungId: n.id, fruehereSperren: true });
    expect(r.status).toBe(201);
    expect(r.body.fruehereGesperrt).toBe(true);
    expect(beimVersand).toMatchObject({ entwertetAm: null });
    expect(alt).toMatchObject({ entwertetGrund: "GESPERRT" });
    expect(alt.entwertetAm).toEqual(JETZT);
    expect(udb.links.at(-1)).toMatchObject({ entwertetAm: null });
  });

  it("„frühere Links sperren“ scheitert einmal: zweiter Versuch, gesperrt, keine Warnung", async () => {
    const stumm = jest.spyOn(console, "error").mockImplementation(() => {});
    const n = laufend();
    const alt = link(n);
    // Das erste updateMany der Links nach dem Versand speichert das Ergebnis der
    // Mail (echt), das zweite ist der erste Versuch, die frueheren zu sperren.
    const echtUpdate = fp.unterlagenLink.updateMany.getMockImplementation()!;
    fp.unterlagenLink.updateMany
      .mockImplementationOnce(echtUpdate)
      .mockRejectedValueOnce(Object.assign(new Error("weg"), { code: "P1001" }));
    const r = await aktion({ aktion: "erneut-senden", nachforderungId: n.id, fruehereSperren: true });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ fruehereGesperrt: true });
    expect(r.body.warnung).toBeUndefined();
    expect(alt.entwertetGrund).toBe("GESPERRT");
    stumm.mockRestore();
  });

  it("„frühere Links sperren“ scheitert zweimal: 201 mit „bitte nicht erneut senden“ — keine Aufforderung zu einer weiteren Mail", async () => {
    const stumm = jest.spyOn(console, "error").mockImplementation(() => {});
    const n = laufend();
    const alt = link(n);
    const echtUpdate = fp.unterlagenLink.updateMany.getMockImplementation()!;
    fp.unterlagenLink.updateMany
      .mockImplementationOnce(echtUpdate)
      .mockRejectedValueOnce(Object.assign(new Error(`weg fuer ${ADRESSE}`), { code: "P1001" }))
      .mockRejectedValueOnce(Object.assign(new Error(`weg fuer ${ADRESSE}`), { code: "P1001" }));
    const r = await aktion({ aktion: "erneut-senden", nachforderungId: n.id, fruehereSperren: true });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ mail: { status: "SENT" }, fruehereGesperrt: false });
    expect(r.body.warnung).toBe(
      "Die E-Mail ist versendet. Die früheren Links ließen sich aber nicht sperren und bleiben gültig – bitte nicht erneut senden.",
    );
    expect(alt.entwertetAm).toBeNull();
    expect(udb.links.at(-1)).toMatchObject({ mailStatus: "SENT" });
    // Genau zwei Versuche, im Log nur der Code.
    const log = JSON.stringify(stumm.mock.calls);
    expect(stumm.mock.calls.filter((c) => String(c[0]).includes("Frühere Links"))).toHaveLength(2);
    expect(log).not.toContain(ADRESSE);
    stumm.mockRestore();
  });

  it("FAILED → 502 und entwertet nichts; SKIPPED → 409", async () => {
    const n = laufend();
    const alt = link(n);
    mockSend.mockImplementationOnce(async () => ({ status: "FAILED", detail: "Timeout" }));
    const failed = await aktion({ aktion: "erneut-senden", nachforderungId: n.id, fruehereSperren: true });
    expect(failed.status).toBe(502);
    expect(failed.body).toMatchObject({
      mail: { status: "FAILED" },
      error: MELDUNGEN.MAIL_NICHT_ZUGESTELLT,
      meldung: MELDUNGEN.MAIL_NICHT_ZUGESTELLT,
      fruehereGesperrt: false,
    });
    expect(alt.entwertetAm).toBeNull();
    // Der Wunsch steht am neuen Link — holt der Lauf die Mail nach, sperrt er nach SEINEM SENT.
    expect(udb.links.at(-1)).toMatchObject({ mailStatus: "FAILED", entwertetAm: null, fruehereSperren: true });

    mockSend.mockImplementationOnce(async () => ({ status: "SKIPPED", detail: "E-Mail-Vorlage ist deaktiviert" }));
    const skipped = await aktion({ aktion: "erneut-senden", nachforderungId: n.id, fruehereSperren: true });
    expect(skipped.status).toBe(409);
    expect(skipped.body.error).toBe(MELDUNGEN.MAIL_VORLAGE_DEAKTIVIERT);
    expect(alt.entwertetAm).toBeNull();
  });

  it("SENT, Speichern scheitert zweimal → 201 mit Warnung (N2), nie 502", async () => {
    const stumm = jest.spyOn(console, "error").mockImplementation(() => {});
    const n = laufend();
    fp.unterlagenLink.updateMany
      .mockRejectedValueOnce(Object.assign(new Error("weg"), { code: "P1001" }))
      .mockRejectedValueOnce(Object.assign(new Error("weg"), { code: "P1001" }));
    const r = await aktion({ aktion: "erneut-senden", nachforderungId: n.id });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ warnung: MELDUNGEN.MAIL_NACHWEIS_FEHLT, mail: { nachweisFehlt: true } });
    expect(r.body.error).toBeUndefined();
    stumm.mockRestore();
  });

  it("Sperrzeit: 10 Minuten nach der letzten zugestellten ERNEUT-Mail → 409 mit sperreBis", async () => {
    const n = laufend();
    link(n, { anlass: "ERNEUT", gesendetAm: vor(5 * MINUTE), createdAt: vor(5 * MINUTE) });
    const r = await aktion({ aktion: "erneut-senden", nachforderungId: n.id });
    expect(r).toEqual({
      status: 409,
      body: { error: MELDUNGEN.SPERRZEIT, grund: "SPERRZEIT", sperreBis: new Date(JETZT.getTime() + 5 * MINUTE).toISOString() },
    });
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("nach der Frist bis zum Linkende → 201 mit frist_verstrichen; danach 409 „zuerst die Frist ändern“", async () => {
    const n = laufend({ frist: datum("2026-09-14") });
    const r = await aktion({ aktion: "erneut-senden", nachforderungId: n.id });
    expect(r.status).toBe(201);
    expect(mails()[0].payload).toMatchObject({ frist_verstrichen: "ja", link_gueltig_bis: "28.09.2026" });

    n.frist = datum("2026-09-01");
    const tot = await aktion({ aktion: "erneut-senden", nachforderungId: n.id });
    expect(tot).toEqual({
      status: 409,
      body: { error: MELDUNGEN.ZUERST_FRIST_AENDERN, grund: "ZUERST_FRIST_AENDERN" },
    });
  });

  it("nichts wartet auf die Person → 409 NICHTS_OFFEN", async () => {
    const n = laufend({}, [{ typ: "AUFENTHALTSTITEL", status: "EINGEREICHT" }]);
    const r = await aktion({ aktion: "erneut-senden", nachforderungId: n.id });
    expect(r.body).toEqual({ error: MELDUNGEN.NICHTS_OFFEN, grund: "NICHTS_OFFEN" });
  });

  it("die 7. Mail in einer Stunde → 429 mit Retry-After", async () => {
    const n = laufend();
    for (const minuten of [45, 40, 30, 20, 15]) link(n, { createdAt: vor(minuten * MINUTE) });
    // Die sechste geht noch (und startet die Sperrzeit von 10 Minuten) …
    expect((await aktion({ aktion: "erneut-senden", nachforderungId: n.id })).status).toBe(201);
    // … die siebte nach der Sperrzeit scheitert an der Bremse: Die aelteste
    // (vor 45 Minuten) faellt erst in 4 Minuten aus dem Stundenfenster.
    const siebte = await aktion(
      { aktion: "erneut-senden", nachforderungId: n.id },
      { jetzt: new Date(JETZT.getTime() + 11 * MINUTE) },
    );
    expect(siebte.status).toBe(429);
    expect(siebte.headers).toEqual({ "Retry-After": "240" });
    expect(udb.links).toHaveLength(6);
  });
});

// =============================================
// Zurueckziehen
// =============================================

describe("zurueckziehen", () => {
  it("Endzustand ohne Mail: Entwuerfe geloescht, eingereichte VERWORFEN (+30 Tage), Merker geleert", async () => {
    const n = laufend({ vollstaendigSeit: vor(TAG), vollstaendigGemeldetAm: vor(TAG) }, [
      { typ: "AUFENTHALTSTITEL", status: "EINGEREICHT" },
      { typ: "PKV_NACHWEIS", status: "ANGEFORDERT" },
    ]);
    const [titel, pkv] = udb.positionen;
    const eingereicht = neueDatei({ nachforderungId: n.id, positionId: titel.id, status: "EINGEREICHT", uebermitteltAm: vor(TAG), speicherPfad: `uploads/unterlagen/${n.id}/a.pdf` });
    const entwurf = neueDatei({ nachforderungId: n.id, positionId: pkv.id, status: "ENTWURF", speicherPfad: `uploads/unterlagen/${n.id}/b.pdf` });
    udb.dateien.push(eingereicht, entwurf);

    const r = await aktion({ aktion: "zurueckziehen", nachforderungId: n.id });
    expect(r).toEqual({
      status: 200,
      body: { nachforderungId: n.id, mail: null, meldung: "Die Nachforderung ist zurückgezogen." },
    });
    expect(n).toMatchObject({
      status: "ZURUECKGEZOGEN",
      laufendSchluessel: null,
      zurueckgezogenVonId: "u-hr",
      vollstaendigSeit: null,
      vollstaendigGemeldetAm: null,
    });
    expect(n.zurueckgezogenAm).toEqual(JETZT);

    // Der Entwurf ist weg (Zeile), seine Datei wird NACH dem Commit geloescht:
    // Zeile loeschen und Protokoll in der Transaktion, die Datei danach.
    expect(udb.dateien.map((d) => d.id)).toEqual([eingereicht.id]);
    expect(mockEntwuerfeLoeschen).toHaveBeenCalledWith(n.id, [`uploads/unterlagen/${n.id}/b.pdf`]);
    expect(aufruf("unterlagenDatei.deleteMany")).toBeLessThan(letztesAudit());
    expect(aufruf("entwuerfeLoeschen")).toBeGreaterThan(letztesAudit());
    expect(eingereicht).toMatchObject({ status: "VERWORFEN" });
    expect(eingereicht.entschiedenAm).toEqual(JETZT);
    expect(eingereicht.loeschenAb).toEqual(new Date(JETZT.getTime() + 30 * TAG));
    // Positionen bleiben stehen, wie sie sind (2.2).
    expect(udb.positionen.map((p) => p.status)).toEqual(["EINGEREICHT", "ANGEFORDERT"]);

    expect(mockSend).not.toHaveBeenCalled();
    expect(mockTrigger).not.toHaveBeenCalled();
    expect(udb.audits.at(-1)).toMatchObject({
      action: UNTERLAGEN_AUDIT.ZURUECKGEZOGEN,
      details: { nachforderungId: n.id, entwuerfeGeloescht: 1, dateienVerworfen: 1 },
    });
  });

  it("bleibt bei EXPIRED erlaubt (EP-3) — ohne Sperre des Vorgangs", async () => {
    udb.vorgaenge = [vorgang({ status: "EXPIRED" })];
    const n = laufend();
    expect((await aktion({ aktion: "zurueckziehen", nachforderungId: n.id })).status).toBe(200);
    expect(udb.aufrufe).not.toContain("onboardingProcess.updateMany");
  });

  it("nicht LAUFEND → 409; danach laesst sich neu anfordern", async () => {
    const n = laufend();
    expect((await aktion({ aktion: "zurueckziehen", nachforderungId: n.id })).status).toBe(200);
    expect((await aktion({ aktion: "zurueckziehen", nachforderungId: n.id })).body.grund).toBe("NICHT_LAUFEND");
    expect((await aktion(anfordern())).status).toBe(201);
  });
});

// =============================================
// Uebersicht (GET /api/onboarding/[id])
// =============================================

describe("unterlagenUebersichtLaden", () => {
  function mitDateien(): { n: Zeile; eingereicht: Zeile; entwurf: Zeile } {
    const n = laufend({}, [
      { typ: "AUFENTHALTSTITEL", bezeichnung: "Aufenthaltstitel", status: "EINGEREICHT", uebermitteltAm: vor(TAG), einreichungen: 1 },
      { typ: "PKV_NACHWEIS", bezeichnung: "PKV-Nachweis", status: "ANGEFORDERT" },
    ]);
    const [titel, pkv] = udb.positionen;
    const eingereicht = neueDatei({
      nachforderungId: n.id,
      positionId: titel.id,
      status: "EINGEREICHT",
      anzeigeName: "titel-vorne.jpg",
      mimeType: "image/jpeg",
      uebermitteltAm: vor(TAG),
      speicherPfad: `uploads/unterlagen/${n.id}/x.jpg`,
    });
    const entwurf = neueDatei({ nachforderungId: n.id, positionId: pkv.id, status: "ENTWURF", anzeigeName: "geheim-entwurf.pdf" });
    udb.dateien.push(eingereicht, entwurf);
    link(n);
    return { n, eingereicht, entwurf };
  }

  it("HR: laufende Nachforderung mit Datei-URL, Namen, Aktionen und Dialogdaten — nie Entwuerfe", async () => {
    udb.vorgaenge = [vorgang({ employeeId: "akte-1" })];
    udb.personalakten = [{ id: "akte-1", email: "a.beispiel@credo-gruppe.de" }];
    udb.smtp.allowedRecipientDomains = "credo-gruppe.de";
    const { n, eingereicht } = mitDateien();
    const { unterlagen } = await uebersicht(HR);

    // Aus der Zeile der Vorgangsansicht: Vorgang und Formularvorlage werden
    // nicht ein zweites Mal gelesen, nur die Personalakte (zweiter Vorschlag).
    expect(udb.aufrufe).not.toContain("onboardingProcess.findUnique");
    expect(udb.aufrufe).not.toContain("formTemplate.findUnique");
    expect(udb.aufrufe).toContain("employee.findUnique");

    expect(unterlagen.darfAktionen).toBe(true);
    // Die Basis der HR-Routen kommt vom Modul-Baustein — Karte und Dialog kennen die Routen nicht selbst.
    expect(unterlagen.apiBasis).toBe(`/api/onboarding/${VORGANG_ID}/unterlagen`);
    expect(unterlagen.anfordern).toEqual({ moeglich: false, grund: null });
    const l = unterlagen.laufend!;
    expect(l.id).toBe(n.id);
    expect(l.kopfZeile).toBe(`Angefordert am 14.09.2026 von Erika Muster · an ${ADRESSE}`);
    expect(l.pille).toEqual({ text: "1 zu prüfen", farbe: "gelb" });
    const [titel, pkv] = l.positionen;
    expect(titel.dateien).toEqual([
      expect.objectContaining({
        id: eingereicht.id,
        name: "titel-vorne.jpg",
        url: `/api/onboarding/${VORGANG_ID}/unterlagen/dateien/${eingereicht.id}`,
      }),
    ]);
    expect(pkv.dateien).toEqual([]);
    expect(JSON.stringify(unterlagen)).not.toContain("geheim-entwurf");
    expect(titel.aktionen).toMatchObject({ annehmen: true, zurueckweisen: true });
    expect(l.aktionen).toMatchObject({ ergaenzen: true, fristAendern: true, erneutSenden: true, zurueckziehen: true });

    expect(unterlagen.dialog?.empfaenger).toEqual({
      vorgang: ADRESSE,
      vorschlaege: [
        { adresse: ADRESSE, quelle: "VORGANG" },
        { adresse: "a.beispiel@credo-gruppe.de", quelle: "PERSONALAKTE" },
      ],
      erlaubteDomains: ["credo-gruppe.de"],
    });
    const auswahl = unterlagen.dialog!.auswahl;
    expect(auswahl.map((a) => a.typ)).not.toContain("SONSTIGES");
    // Vorgeschlagen sind die offenen Nachweise, zuerst.
    expect(auswahl.filter((a) => a.vorgeschlagen).map((a) => a.typ)).toEqual([
      "MASERNSCHUTZ",
      "AUFENTHALTSTITEL",
      "ARBEITSERLAUBNIS",
    ]);
    expect(auswahl.find((a) => a.typ === "FUEHRUNGSZEUGNIS")).toMatchObject({
      sensibel: true,
      erlaubt: false,
      grund: SENSIBEL_SPERRGRUND_TEXTE.NICHT_PFLICHT,
    });
    expect(auswahl.find((a) => a.typ === "ARBEITSVERTRAG")).toMatchObject({ originalErforderlich: true, erlaubt: true });
    expect(auswahl.find((a) => a.typ === "AUFENTHALTSTITEL")).toMatchObject({
      fristpflichtig: true,
      hinweis: NACHFORDERUNG_HINWEISE.AUFENTHALTSTITEL,
    });
    expect(unterlagen.typen.AUFENTHALTSTITEL).toMatchObject({ status: "EINGEREICHT", laufend: true });
  });

  it("ohne Bearbeitungsrecht: keine Datei-URLs, keine Namen, keine Aktionen, keine Dialogdaten", async () => {
    udb.vorgaenge = [vorgang({ employeeId: "akte-1" })];
    udb.personalakten = [{ id: "akte-1", email: "a.beispiel@credo-gruppe.de" }];
    mitDateien();
    const { unterlagen } = await uebersicht(VORGESETZTE);
    expect(unterlagen.darfAktionen).toBe(false);
    expect(unterlagen.apiBasis).toBeNull();
    // Die Adresse der Personalakte wird fuer Leser gar nicht erst geladen.
    expect(udb.aufrufe).not.toContain("employee.findUnique");
    expect(JSON.stringify(unterlagen)).not.toContain("credo-gruppe.de");
    expect(unterlagen.dialog).toBeNull();
    expect(unterlagen.anfordern).toEqual({ moeglich: false, grund: null });
    const l = unterlagen.laufend!;
    for (const p of l.positionen) {
      expect(Object.values(p.aktionen).some(Boolean)).toBe(false);
      for (const d of p.dateien) {
        expect(d.url).toBeNull();
        expect(d.name).toBeNull();
      }
    }
    expect(Object.values(l.aktionen).some(Boolean)).toBe(false);
    expect(JSON.stringify(unterlagen)).not.toContain("titel-vorne");
  });

  it("ohne laufende Nachforderung: Knopf nach verfuegbar, sonst der Grund im Klartext", async () => {
    let u: UnterlagenUebersicht = (await uebersicht(HR)).unterlagen;
    expect(u.anfordern).toEqual({ moeglich: true, grund: null });
    expect(u.laufend).toBeNull();

    udb.vorgaenge = [vorgang({ status: "INVITED", submittedAt: null, personalData: null })];
    u = (await uebersicht(HR)).unterlagen;
    expect(u.anfordern).toEqual({ moeglich: false, grund: ONBOARDING_NICHT_VERFUEGBAR.FRAGEBOGEN_OFFEN });
  });

  it("die Pflichtliste kommt von der Route (dieselbe wie im Kasten) — sie entscheidet ueber sensible Arten", async () => {
    const fz = (u: UnterlagenUebersicht) => u.dialog!.auswahl.find((a) => a.typ === "FUEHRUNGSZEUGNIS");
    expect(fz((await uebersicht(HR, ["FUEHRUNGSZEUGNIS"])).unterlagen)).toMatchObject({ erlaubt: true, grund: null });
    expect(fz((await uebersicht(HR, [])).unterlagen)).toMatchObject({ erlaubt: false });
  });

  it("HR-Meldung ohne Empfaenger → Hinweis auf der Karte", async () => {
    mitDateien();
    udb.nachforderungen[0].hrMeldungStatus = "SKIPPED";
    udb.nachforderungen[0].hrMeldungDetail = HR_MELDUNG_GRUENDE.KEIN_EMPFAENGER;
    const { unterlagen } = await uebersicht(HR);
    expect(unterlagen.laufend!.hrMeldungHinweis).toBe(MELDUNGEN.HR_MELDUNG_OHNE_EMPFAENGER);
  });

  it("hrMeldungGrund: nur ein Code, nie der Rohtext des Mailers", () => {
    expect(hrMeldungGrund({ status: "SENT", detail: null })).toBeNull();
    expect(hrMeldungGrund({ status: "SKIPPED", detail: "Kein Empfaenger konfiguriert — bitte in der Vorlage ein An-Feld setzen" })).toBe(
      HR_MELDUNG_GRUENDE.KEIN_EMPFAENGER,
    );
    expect(hrMeldungGrund({ status: "SKIPPED", detail: 'Empfaenger "{{anfordernde_email}}" ergab keine gueltige Adresse' })).toBe(
      HR_MELDUNG_GRUENDE.KEIN_EMPFAENGER,
    );
    expect(hrMeldungGrund({ status: "SKIPPED", detail: "E-Mail-Vorlage ist deaktiviert" })).toBe(HR_MELDUNG_GRUENDE.VORLAGE_DEAKTIVIERT);
    expect(hrMeldungGrund({ status: "SKIPPED", detail: "Keine E-Mail-Vorlage vorhanden" })).toBe(HR_MELDUNG_GRUENDE.NICHT_VERSENDET);
    expect(hrMeldungGrund({ status: "FAILED", detail: "550 5.1.1 <personal@credo-gruppe.de>: Recipient rejected" })).toBe(
      HR_MELDUNG_GRUENDE.VERSAND_FEHLGESCHLAGEN,
    );
  });

  it("die beiden Empfaenger-Gruende stehen woertlich so in mailer.ts (sonst sagte die Karte nie „kein Empfänger“)", () => {
    const quelle = fs.readFileSync(path.join(process.cwd(), "src/lib/mailer.ts"), "utf8");
    expect(quelle).toContain('"Kein Empfaenger konfiguriert');
    expect(quelle).toContain("`Empfaenger \"${");
  });

  it("hrMeldungOhneEmpfaenger liest die gespeicherten Spalten: nur SKIPPED mit KEIN_EMPFAENGER", () => {
    expect(hrMeldungOhneEmpfaenger("SKIPPED", HR_MELDUNG_GRUENDE.KEIN_EMPFAENGER)).toBe(true);
    expect(hrMeldungOhneEmpfaenger("SKIPPED", HR_MELDUNG_GRUENDE.VORLAGE_DEAKTIVIERT)).toBe(false);
    expect(hrMeldungOhneEmpfaenger("FAILED", HR_MELDUNG_GRUENDE.KEIN_EMPFAENGER)).toBe(false);
    expect(hrMeldungOhneEmpfaenger(null, null)).toBe(false);
  });
});

// =============================================
// HR-Meldung „vollständig" (bedingter Anspruch)
// =============================================

describe("hrVollstaendigMelden", () => {
  function vollstaendig(): MitId {
    return laufend({ vollstaendigSeit: vor(MINUTE) }, [
      { typ: "AUFENTHALTSTITEL", bezeichnung: "Aufenthaltstitel", status: "EINGEREICHT", einreichungen: 2 },
    ]);
  }

  it("beansprucht, meldet per triggerWebhooks und merkt das Ergebnis — ein zweiter Aufruf tut nichts", async () => {
    udb.smtp.replyToEmail = "personal@credo-gruppe.de";
    const n = vollstaendig();
    const mail = await hrVollstaendigMelden(n.id, JETZT);
    expect(mail).toEqual({ status: "SENT", detail: null });
    expect(n.vollstaendigGemeldetAm).toEqual(JETZT);
    expect(n.hrMeldungStatus).toBe("SENT");
    expect(mockTrigger).toHaveBeenCalledTimes(1);
    const [event, payload] = mockTrigger.mock.calls[0];
    expect(event).toBe(UNTERLAGEN_EVENTS.VOLLSTAENDIG);
    expect(payload).toMatchObject({
      anfordernde_email: "erika.muster@example.org",
      hr_postfach: "personal@credo-gruppe.de",
      angefordert_von: "Erika Muster",
      mitarbeiter_name: "Anna Beispiel",
      // „Im Portal prüfen" landet im Reiter „Dokumente" bei der Karte.
      portalLink: `${BASIS}/dashboard/${VORGANG_ID}?tab=dokumente`,
      anzahl_zu_pruefen: 1,
      erneut_eingereicht: "ja",
    });
    // Keine Adresse der Person, kein Link, keine Unterlagennamen.
    expect(payload.email).toBeUndefined();
    expect(payload.link).toBeUndefined();
    expect(JSON.stringify(payload)).not.toContain("Aufenthaltstitel");
    expect(JSON.stringify(payload)).not.toContain(ADRESSE);
    expect(udb.audits.at(-1)).toMatchObject({ action: UNTERLAGEN_AUDIT.HR_GEMELDET, userId: null, onboardingId: VORGANG_ID });

    expect(await hrVollstaendigMelden(n.id, JETZT)).toBeNull();
    expect(mockTrigger).toHaveBeenCalledTimes(1);
  });

  it("FAILED gibt den Anspruch zurueck (der Lauf holt nach), SKIPPED behaelt ihn", async () => {
    const n = vollstaendig();
    mockTrigger.mockImplementationOnce(async () => ({ status: "FAILED", detail: "SMTP weg" }));
    expect((await hrVollstaendigMelden(n.id, JETZT))!.status).toBe("FAILED");
    expect(n.vollstaendigGemeldetAm).toBeNull();
    expect(n.hrMeldungStatus).toBe("FAILED");

    mockTrigger.mockImplementationOnce(async () => ({
      status: "SKIPPED",
      detail: "Kein Empfaenger konfiguriert — bitte in der Vorlage ein An-Feld setzen",
    }));
    expect((await hrVollstaendigMelden(n.id, JETZT))!.status).toBe("SKIPPED");
    expect(n.vollstaendigGemeldetAm).toEqual(JETZT);
    // Gespeichert wird nur der Grundcode, nicht der Text des Mailers.
    expect(n.hrMeldungDetail).toBe(HR_MELDUNG_GRUENDE.KEIN_EMPFAENGER);
    expect(hrMeldungOhneEmpfaenger(n.hrMeldungStatus as string, n.hrMeldungDetail as string)).toBe(true);
  });

  it("FAILED mit Adresse im Fehlertext: an der Nachforderung steht nur der Code", async () => {
    const n = vollstaendig();
    mockTrigger.mockImplementationOnce(async () => ({
      status: "FAILED",
      detail: "550 5.1.1 <erika.muster@example.org>: Recipient address rejected",
    }));
    await hrVollstaendigMelden(n.id, JETZT);
    expect(n).toMatchObject({ hrMeldungStatus: "FAILED", hrMeldungDetail: HR_MELDUNG_GRUENDE.VERSAND_FEHLGESCHLAGEN });
    expect(JSON.stringify(udb.nachforderungen)).not.toContain("erika.muster@example.org");
  });

  it("Dispatcher ohne Ergebnis zaehlt als FAILED", async () => {
    const n = vollstaendig();
    mockTrigger.mockImplementationOnce(async () => null);
    expect((await hrVollstaendigMelden(n.id, JETZT))!.status).toBe("FAILED");
    expect(n.vollstaendigGemeldetAm).toBeNull();
  });

  it("hat ein anderer den Anspruch schon (gleichzeitig), passiert nichts", async () => {
    const n = vollstaendig();
    fp.unterlagenNachforderung.updateMany.mockImplementationOnce(async () => ({ count: 0 }));
    expect(await hrVollstaendigMelden(n.id, JETZT)).toBeNull();
    expect(mockTrigger).not.toHaveBeenCalled();
  });

  it("nicht LAUFEND, schon gemeldet oder nicht vollstaendig: nichts zu tun", async () => {
    const n = laufend({ status: "ERLEDIGT", laufendSchluessel: null, vollstaendigSeit: vor(MINUTE) });
    expect(await hrVollstaendigMelden(n.id, JETZT)).toBeNull();
    n.status = "LAUFEND";
    n.vollstaendigSeit = null;
    expect(await hrVollstaendigMelden(n.id, JETZT)).toBeNull();
    expect(mockTrigger).not.toHaveBeenCalled();
  });
});

// =============================================
// HR-Mail mit Merker des Aufrufers (fuer den taeglichen Lauf, Abschnitt 9)
// =============================================

describe("hrMeldungSenden mit Merker", () => {
  const FRIST = datum("2026-09-18");

  /** Wie der Lauf „Frist verstrichen" merkt: bedingt auf den gelesenen Fristwert. */
  function fristMerker(n: MitId) {
    return async (tx: Prisma.TransactionClient) => {
      await tx.unterlagenNachforderung.updateMany({ where: { id: n.id, frist: FRIST }, data: { fristGemeldetFuer: FRIST } });
    };
  }

  const senden = (n: MitId, merker: (tx: Prisma.TransactionClient, status: "SENT" | "SKIPPED") => Promise<void>) =>
    hrMeldungSenden({
      event: UNTERLAGEN_EVENTS.FRIST_VERSTRICHEN,
      nachforderungId: n.id,
      vorgangId: VORGANG_ID,
      baustein: onboardingBaustein,
      payload: { nachforderungId: n.id },
      merker,
    });

  it("SENT: Merker, Status und AuditLog in EINER Transaktion — nach dem Versand", async () => {
    const n = laufend({ frist: FRIST });
    const merker = jest.fn(fristMerker(n));
    expect(await senden(n, merker)).toEqual({ status: "SENT", detail: null });
    expect(merker).toHaveBeenCalledWith(fakePrisma, "SENT");
    expect(n.fristGemeldetFuer).toEqual(FRIST);
    expect(n.hrMeldungStatus).toBe("SENT");
    expect(udb.audits.at(-1)).toMatchObject({ action: UNTERLAGEN_AUDIT.HR_GEMELDET, userId: null });

    const trx = aufruf("$transaction");
    expect(aufruf("triggerWebhooks")).toBeLessThan(trx);
    expect(aufruf("unterlagenNachforderung.updateMany")).toBeGreaterThan(trx);
    expect(letztesAudit()).toBeGreaterThan(udb.aufrufe.lastIndexOf("unterlagenNachforderung.updateMany"));
  });

  it("SKIPPED: Merker gesetzt, kein AuditLog; FAILED: kein Merker (der naechste Lauf versucht es erneut)", async () => {
    const n = laufend({ frist: FRIST });
    mockTrigger.mockImplementationOnce(async () => ({ status: "FAILED", detail: "SMTP weg" }));
    const merker = jest.fn(fristMerker(n));
    expect((await senden(n, merker)).status).toBe("FAILED");
    expect(merker).not.toHaveBeenCalled();
    expect(n.fristGemeldetFuer).toBeNull();
    expect(n.hrMeldungStatus).toBe("FAILED");

    mockTrigger.mockImplementationOnce(async () => ({ status: "SKIPPED", detail: "E-Mail-Vorlage ist deaktiviert" }));
    expect((await senden(n, merker)).status).toBe("SKIPPED");
    expect(merker).toHaveBeenCalledWith(fakePrisma, "SKIPPED");
    expect(n.fristGemeldetFuer).toEqual(FRIST);
    expect(udb.audits).toHaveLength(0);
  });

  it("der Merker ist bedingt: Hat HR die Frist inzwischen geaendert, bleibt er leer", async () => {
    const n = laufend({ frist: datum("2026-10-09") });
    await senden(n, fristMerker(n));
    expect(n.fristGemeldetFuer).toBeNull();
  });

  it("scheitert die Transaktion (etwa im Merker): kein Wurf, das Ergebnis der Mail kommt zurueck, im Log nur der Code", async () => {
    const stumm = jest.spyOn(console, "error").mockImplementation(() => {});
    const n = laufend({ frist: FRIST });
    const r = await senden(n, async () => {
      throw Object.assign(new Error("weg"), { code: "P1001" });
    });
    expect(r.status).toBe("SENT");
    // N2: versendet, aber Merker und Protokoll fehlen — der Lauf zaehlt das als Fehler.
    expect(r.nachweisFehlt).toBe(true);
    expect(JSON.stringify(stumm.mock.calls)).toContain("P1001");
    stumm.mockRestore();
  });
});

describe("fehlerKennung (Konsole ohne Personendaten)", () => {
  it("nur code, sonst name — nie die Meldung", () => {
    expect(fehlerKennung(Object.assign(new Error(`weg fuer ${ADRESSE}`), { code: "P2002" }))).toBe("P2002");
    expect(fehlerKennung(new TypeError(`kaputt ${ADRESSE}`))).toBe("TypeError");
    expect(fehlerKennung("Text mit Adresse")).toBe("unbekannt");
    expect(fehlerKennung(null)).toBe("unbekannt");
  });
});

// =============================================
// Teil 2 (Schritt 6): Entscheidungen ueber eine Position
// =============================================

const INHALT = Buffer.from("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n");
const sha256 = (b: Buffer) => createHash("sha256").update(b).digest("hex");

const position = (
  positionId: string,
  eingabe: PositionsAktionInput,
  opts: { session?: SessionPayload; jetzt?: Date; vorgangId?: string } = {},
) =>
  unterlagenPositionsAktionAusfuehren({
    modul: "ONBOARDING",
    vorgangId: opts.vorgangId ?? VORGANG_ID,
    positionId,
    eingabe,
    session: opts.session ?? HR,
    jetzt: opts.jetzt ?? JETZT,
  });

/**
 * Ein eigenes Arbeitsverzeichnis unter os.tmpdir() je Test: Die Dateihelfer
 * rechnen mit `process.cwd()`. Innerhalb eines describe aufrufen.
 */
function mitArbeitsverzeichnis(): { abs: (relativ: string) => string } {
  let basis = "";
  let cwd: jest.SpyInstance | null = null;
  beforeEach(async () => {
    basis = await mkdtemp(path.join(os.tmpdir(), "p4-dienst-"));
    cwd = jest.spyOn(process, "cwd").mockReturnValue(basis);
  });
  afterEach(async () => {
    cwd?.mockRestore();
    await rm(basis, { recursive: true, force: true });
  });
  return { abs: (relativ) => path.join(basis, ...relativ.split("/")) };
}

/**
 * Die Fake-Datenbank kennt kein Rollback (Feinplanung 13). Wo ein Test den
 * Stand NACH einer gescheiterten Transaktion prueft — etwa ob noch eine Zeile
 * auf eine Datei zeigt —, bildet dies es fuer die NAECHSTE Transaktion nach:
 * Wirft sie, stehen alle Zeilen wieder wie zu ihrem Beginn (dieselben
 * Objekte, damit die Verweise des Tests gueltig bleiben). Was `vorTransaktion`
 * anlegt — der Commit einer anderen Instanz —, bleibt.
 */
function naechsteTransaktionMitRollback(): void {
  (fakePrisma.$transaction as jest.Mock).mockImplementationOnce(async (fn: (tx: unknown) => unknown) => {
    // Wie der Fake selbst: protokollieren, fremden Commit einspielen.
    udb.aufrufe.push("$transaction");
    udb.vorTransaktion?.();
    const listen = {
      nachforderungen: [...udb.nachforderungen],
      positionen: [...udb.positionen],
      dateien: [...udb.dateien],
      links: [...udb.links],
      audits: [...udb.audits],
      dokumente: [...ddb.dokumente],
    };
    const zeilen = [...listen.nachforderungen, ...listen.positionen, ...listen.dateien, ...listen.links, ...listen.dokumente];
    const vorher = zeilen.map((z) => ({ ...z }));
    try {
      return await fn(fakePrisma);
    } catch (err) {
      zeilen.forEach((z, i) => {
        for (const k of Object.keys(z)) delete z[k];
        Object.assign(z, vorher[i]);
      });
      Object.assign(udb, {
        nachforderungen: listen.nachforderungen,
        positionen: listen.positionen,
        dateien: listen.dateien,
        links: listen.links,
        audits: listen.audits,
      });
      ddb.dokumente = listen.dokumente;
      throw err;
    }
  });
}

async function gibtEs(datei: string): Promise<boolean> {
  try {
    await stat(datei);
    return true;
  } catch {
    return false;
  }
}

/**
 * Eine Position „zu prüfen" (Aufenthaltstitel, die Person gab „gültig bis
 * 31.03.2028" an) mit echten Dateien bei der Nachforderung.
 */
async function zuPruefen(
  abs: (relativ: string) => string,
  opts: { kopf?: Zeile; position?: Zeile; weitere?: Zeile[]; dateien?: number } = {},
): Promise<{ n: MitId; p: MitId; dateien: MitId[] }> {
  const n = laufend(opts.kopf ?? {}, [
    {
      typ: "AUFENTHALTSTITEL",
      bezeichnung: "Aufenthaltstitel",
      sensibel: true,
      fristpflichtig: true,
      status: "EINGEREICHT",
      einreichungen: 1,
      uebermitteltAm: vor(TAG),
      gueltigBisAngabe: datum("2028-03-31"),
      ...opts.position,
    },
    ...(opts.weitere ?? []),
  ]);
  const p = udb.positionen.find((x) => x.nachforderungId === n.id && x.reihenfolge === 0) as MitId;
  const dateien: MitId[] = [];
  for (let i = 0; i < (opts.dateien ?? 1); i++) {
    const id = randomUUID();
    const relativ = `uploads/unterlagen/${n.id}/${id}.pdf`;
    await mkdir(path.dirname(abs(relativ)), { recursive: true });
    await writeFile(abs(relativ), INHALT);
    const d = neueDatei({
      id,
      nachforderungId: n.id,
      positionId: p.id,
      status: "EINGEREICHT",
      anzeigeName: `titel-seite-${i + 1}.pdf`,
      speicherPfad: relativ,
      sha256: sha256(INHALT),
      groesse: INHALT.length,
      uebermitteltAm: vor(TAG),
      einreichungNr: 1,
    });
    udb.dateien.push(d);
    dateien.push(d as MitId);
  }
  return { n, p, dateien };
}

describe("Entscheidungen: Rechte und Bindung an den Vorgang", () => {
  it("403 ohne Bearbeitungsrecht — nichts gelesen, nichts geschrieben", async () => {
    laufend();
    const r = await position(String(udb.positionen[0].id), { aktion: "entfaellt" }, { session: VORGESETZTE });
    expect(r).toEqual({ status: 403, body: { error: MELDUNGEN.KEINE_BERECHTIGUNG } });
    expect(udb.aufrufe).toEqual([]);
  });

  it("Position eines ANDEREN Vorgangs → 404 mit demselben Text wie eine unbekannte", async () => {
    udb.vorgaenge.push(vorgang({ id: ANDERER_VORGANG, email: "bert@example.org" }));
    laufend({ onboardingId: ANDERER_VORGANG, laufendSchluessel: `ONBOARDING:${ANDERER_VORGANG}` }, [
      { typ: "PKV_NACHWEIS", status: "EINGEREICHT" },
    ]);
    const fremd = udb.positionen[0] as MitId;
    const a = await position(fremd.id, { aktion: "entfaellt" });
    const b = await position(randomUUID(), { aktion: "entfaellt" });
    expect(a).toEqual({ status: 404, body: { error: MELDUNGEN.POSITION_NICHT_GEFUNDEN } });
    expect(b).toEqual(a);
    expect(fremd.status).toBe("EINGEREICHT");
  });
});

describe("annehmen (4.4)", () => {
  const { abs } = mitArbeitsverzeichnis();

  it("Hardlink in den Vorgang, je Datei ein Document (APPROVED, relativer Pfad), die Quelle erst nach dem Commit geloescht", async () => {
    const { n, p, dateien } = await zuPruefen(abs, { dateien: 2 });
    const quellen = dateien.map((d) => String(d.speicherPfad));
    const inodes = await Promise.all(quellen.map(async (q) => (await stat(abs(q), { bigint: true })).ino));

    const r = await position(p.id, { aktion: "annehmen" });
    expect(r).toEqual({
      status: 200,
      body: {
        nachforderungId: n.id,
        positionId: p.id,
        positionStatus: "ANGENOMMEN",
        nachforderungStatus: "ERLEDIGT",
        mail: null,
        meldung: AKTION_MELDUNGEN.annehmen,
        dokumentIds: ddb.dokumente.map((d) => d.id),
      },
    });

    expect(ddb.dokumente).toHaveLength(2);
    for (const [i, d] of dateien.entries()) {
      const dok = ddb.dokumente[i];
      expect(dok).toMatchObject({
        onboardingId: VORGANG_ID,
        type: "AUFENTHALTSTITEL",
        bezeichnung: null,
        fileName: `titel-seite-${i + 1}.pdf`,
        filePath: `uploads/${VORGANG_ID}/${d.id}.pdf`,
        fileSize: INHALT.length,
        mimeType: "application/pdf",
        status: "APPROVED",
        reviewedById: "u-hr",
        unbefristet: false,
        ablaufErinnertAm: null,
        ablaufErinnertStufe: null,
      });
      expect(dok.reviewedAt).toEqual(JETZT);
      expect(dok.uploadedAt).toEqual(vor(TAG));
      // Ohne Angabe im Body gilt die Angabe der Person.
      expect(dok.gueltigBis).toEqual(datum("2028-03-31"));
      expect(d).toMatchObject({ status: "ANGENOMMEN", uebernahmeZiel: "DOCUMENT", uebernommenId: dok.id, speicherPfad: null });
      expect(d.uebernommenAm).toEqual(JETZT);
      // Hardlink: dieselbe Datei (gleicher Inode), keine Kopie — und die Quelle ist weg.
      expect((await stat(abs(String(dok.filePath)), { bigint: true })).ino).toBe(inodes[i]);
      expect(await gibtEs(abs(quellen[i]))).toBe(false);
    }
    expect(p).toMatchObject({ status: "ANGENOMMEN", entschiedenVonId: "u-hr" });
    expect(p.entschiedenAm).toEqual(JETZT);
    // Die letzte Entscheidung: ERLEDIGT, Unique-Schluessel frei, Merker leer.
    expect(n).toMatchObject({ status: "ERLEDIGT", laufendSchluessel: null, vollstaendigSeit: null, vollstaendigGemeldetAm: null });
    expect(n.erledigtAm).toEqual(JETZT);

    // Protokoll: ANGENOMMEN, dann ERLEDIGT — IDs, Arten, Groessen, SHA-256, nie ein Dateiname.
    expect(udb.audits.map((a) => a.action)).toEqual([UNTERLAGEN_AUDIT.ANGENOMMEN, UNTERLAGEN_AUDIT.ERLEDIGT]);
    expect(udb.audits[0]).toMatchObject({
      userId: "u-hr",
      onboardingId: VORGANG_ID,
      processType: "ONBOARDING",
      details: {
        nachforderungId: n.id,
        positionId: p.id,
        typ: "AUFENTHALTSTITEL",
        dokumentTyp: "AUFENTHALTSTITEL",
        gueltigBis: "2028-03-31",
        unbefristet: false,
      },
    });
    expect(JSON.stringify(udb.audits)).toContain(sha256(INHALT));
    expect(JSON.stringify(udb.audits)).not.toContain("titel-seite");

    // Reihenfolge: verknuepfen → Transaktion (Nachforderung, Position, Dokumente) → Quelle loeschen.
    const trx = aufruf("$transaction");
    expect(udb.aufrufe.lastIndexOf("verknuepfenInVorgang")).toBeLessThan(trx);
    expect(aufruf("unterlagenNachforderung.updateMany")).toBeGreaterThan(trx);
    expect(aufruf("unterlagenNachforderung.updateMany")).toBeLessThan(aufruf("unterlagenPosition.updateMany"));
    expect(aufruf("unterlagenPosition.updateMany")).toBeLessThan(aufruf("document.create"));
    expect(aufruf("nachforderungsDateiLoeschen")).toBeGreaterThan(letztesAudit());
    // Keine Mail; weder Vorgang noch Fragebogendaten (rvAntragEingangAm) noch Checkliste.
    expect(mockSend).not.toHaveBeenCalled();
    expect(mockTrigger).not.toHaveBeenCalled();
    expect(udb.aufrufe.filter((a) => /^(onboardingProcess\.update|personalData|checklistItem)/.test(a))).toEqual([]);
  });

  it("nicht die letzte Entscheidung: bleibt LAUFEND, der Merker „vollständig“ bleibt (2.1)", async () => {
    const seit = vor(MINUTE);
    const { n, p } = await zuPruefen(abs, {
      kopf: { vollstaendigSeit: seit, vollstaendigGemeldetAm: seit },
      weitere: [{ typ: "PKV_NACHWEIS", bezeichnung: "PKV-Nachweis", status: "EINGEREICHT" }],
    });
    const r = await position(p.id, { aktion: "annehmen", gueltigBis: "2029-01-31" });
    expect(r.body.nachforderungStatus).toBe("LAUFEND");
    expect(n).toMatchObject({ status: "LAUFEND", laufendSchluessel: `ONBOARDING:${VORGANG_ID}` });
    expect(n.vollstaendigSeit).toEqual(seit);
    expect(n.vollstaendigGemeldetAm).toEqual(seit);
    // Das Datum aus dem Body geht der Angabe der Person vor.
    expect(ddb.dokumente[0].gueltigBis).toEqual(datum("2029-01-31"));
    expect(udb.audits.map((a) => a.action)).toEqual([UNTERLAGEN_AUDIT.ANGENOMMEN]);
  });

  it("Z1 „Unbefristet“: Kennzeichen gesetzt, kein Datum — auch wenn die Person eines angegeben hat", async () => {
    const { p } = await zuPruefen(abs);
    expect((await position(p.id, { aktion: "annehmen", unbefristet: true })).status).toBe(200);
    expect(ddb.dokumente[0]).toMatchObject({ unbefristet: true, gueltigBis: null });
    expect(udb.audits[0].details).toMatchObject({ gueltigBis: null, unbefristet: true });
  });

  it("Z1 „Datum später nachtragen“ (null): weder Datum noch Kennzeichen", async () => {
    const { p } = await zuPruefen(abs);
    expect((await position(p.id, { aktion: "annehmen", gueltigBis: null })).status).toBe(200);
    expect(ddb.dokumente[0]).toMatchObject({ unbefristet: false, gueltigBis: null });
  });

  it("Datum oder „unbefristet“ an einer Art ohne Ablauf, Datum mehr als 20 Jahre voraus → 400, nichts verknuepft", async () => {
    const { p } = await zuPruefen(abs, {
      position: { typ: "PKV_NACHWEIS", bezeichnung: "PKV-Nachweis", sensibel: false, fristpflichtig: false, gueltigBisAngabe: null },
    });
    const mitDatum = await position(p.id, { aktion: "annehmen", gueltigBis: "2029-01-31" });
    expect(mitDatum.status).toBe(400);
    expect(mitDatum.body.grund).toBe("GUELTIG_BIS_UNGUELTIG");
    expect(await position(p.id, { aktion: "annehmen", unbefristet: true })).toEqual({
      status: 400,
      body: { error: MELDUNGEN.UNBEFRISTET_OHNE_ABLAUFDATUM, grund: "UNBEFRISTET_OHNE_ABLAUFDATUM" },
    });

    udb.nachforderungen[0].status = "ZURUECKGEZOGEN";
    udb.nachforderungen[0].laufendSchluessel = null;
    const titel = await zuPruefen(abs);
    const zuWeit = await position(titel.p.id, { aktion: "annehmen", gueltigBis: "2060-01-01" });
    expect(zuWeit.status).toBe(400);
    expect(String(zuWeit.body.error)).toContain("20 Jahre");
    expect(udb.aufrufe).not.toContain("verknuepfenInVorgang");
    expect(ddb.dokumente).toHaveLength(0);
  });

  it("Katalogzeile mit einer anderen Art → 400 — keine stille Umdeutung", async () => {
    const { p } = await zuPruefen(abs);
    expect(await position(p.id, { aktion: "annehmen", dokumentTyp: "SONSTIGES" })).toEqual({
      status: 400,
      body: { error: MELDUNGEN.ART_NICHT_WAEHLBAR, grund: "ART_NICHT_WAEHLBAR" },
    });
  });

  describe("frei benannte Zeile", () => {
    const frei = {
      typ: null,
      bezeichnung: "Unterschriebener RV-Antrag",
      sensibel: false,
      fristpflichtig: false,
      gueltigBisAngabe: null,
    };

    it("ohne Wahl als SONSTIGES, ihr Name als `bezeichnung` (EP-6)", async () => {
      const { p } = await zuPruefen(abs, { position: frei });
      expect((await position(p.id, { aktion: "annehmen" })).status).toBe(200);
      expect(ddb.dokumente[0]).toMatchObject({
        type: "SONSTIGES",
        bezeichnung: "Unterschriebener RV-Antrag",
        gueltigBis: null,
        unbefristet: false,
      });
      expect(udb.audits[0].details).toMatchObject({ typ: null, dokumentTyp: "SONSTIGES" });
      expect(JSON.stringify(udb.audits)).not.toContain("Unterschriebener");
    });

    it("mit einer fristpflichtigen Art: das Datum wird uebernommen", async () => {
      const { p } = await zuPruefen(abs, { position: frei });
      const r = await position(p.id, { aktion: "annehmen", dokumentTyp: "AUFENTHALTSTITEL", gueltigBis: "2029-01-31" });
      expect(r.status).toBe(200);
      expect(ddb.dokumente[0]).toMatchObject({ type: "AUFENTHALTSTITEL", bezeichnung: "Unterschriebener RV-Antrag" });
      expect(ddb.dokumente[0].gueltigBis).toEqual(datum("2029-01-31"));
    });

    it("sensible Art, die der Vorgang nicht zulaesst → 409 mit Grund, nichts verknuepft", async () => {
      const { p } = await zuPruefen(abs, { position: frei });
      expect(await position(p.id, { aktion: "annehmen", dokumentTyp: "FUEHRUNGSZEUGNIS" })).toEqual({
        status: 409,
        body: {
          error: MELDUNGEN.ART_NICHT_UEBERNEHMBAR,
          grund: "ART_NICHT_UEBERNEHMBAR",
          hinweis: SENSIBEL_SPERRGRUND_TEXTE.NICHT_PFLICHT,
        },
      });
      expect(udb.aufrufe).not.toContain("verknuepfenInVorgang");
      expect(p.status).toBe("EINGEREICHT");
    });

    it("unbekannte Art → 400", async () => {
      const { p } = await zuPruefen(abs, { position: frei });
      expect((await position(p.id, { aktion: "annehmen", dokumentTyp: "GIBT_ES_NICHT" })).body).toEqual({
        error: MELDUNGEN.TYP_UNBEKANNT,
        grund: "TYP_UNBEKANNT",
      });
    });
  });

  it("zwischen Lesen und Schreiben entschieden (etwa entfallen), kein Document zeigt aufs Ziel: 409, das neue Ziel entfernt, die Quelle bleibt", async () => {
    const { p, dateien } = await zuPruefen(abs);
    const quelle = abs(String(dateien[0].speicherPfad));
    const ziel = abs(`uploads/${VORGANG_ID}/${dateien[0].id}.pdf`);
    udb.vorTransaktion = () => {
      p.status = "ENTFAELLT";
    };
    const r = await position(p.id, { aktion: "annehmen" });
    expect(r).toEqual({ status: 409, body: { error: MELDUNGEN.NICHT_ZU_PRUEFEN, grund: "NICHT_ZU_PRUEFEN" } });
    expect(ddb.dokumente).toHaveLength(0);
    expect(await gibtEs(ziel)).toBe(false);
    expect(await gibtEs(quelle)).toBe(true);
    expect(dateien[0]).toMatchObject({ status: "EINGEREICHT", speicherPfad: String(dateien[0].speicherPfad) });
    expect(udb.aufrufe).not.toContain("nachforderungsDateiLoeschen");
  });

  /**
   * Zwei Container nehmen dieselbe Unterlage gleichzeitig an: Dieser legt das
   * Ziel an (neu), der zweite trifft auf EEXIST mit gleichem Hash, gewinnt die
   * Transaktion und legt SEIN Document auf genau diesen Pfad. Das 409 hier
   * darf das Ziel nicht wegraeumen — sonst zeigte das angenommene Dokument ins
   * Leere.
   */
  it("gleichzeitig angenommen, das Document der anderen Instanz zeigt aufs Ziel: 409, das Ziel bleibt", async () => {
    const { p, dateien } = await zuPruefen(abs);
    const zielRelativ = `uploads/${VORGANG_ID}/${dateien[0].id}.pdf`;
    udb.vorTransaktion = () => {
      p.status = "ANGENOMMEN";
      ddb.dokumente.push(neuesDokument({ onboardingId: VORGANG_ID, filePath: zielRelativ, status: "APPROVED" }));
    };
    const r = await position(p.id, { aktion: "annehmen" });
    expect(r).toEqual({ status: 409, body: { error: MELDUNGEN.NICHT_ZU_PRUEFEN, grund: "NICHT_ZU_PRUEFEN" } });
    expect(await gibtEs(abs(zielRelativ))).toBe(true);
    // Geprueft wurde ueber den Pfad, gebunden an den Vorgang — geloescht wurde nichts.
    expect(fp.document.findMany).toHaveBeenCalledWith({
      where: { onboardingId: VORGANG_ID, filePath: { in: [zielRelativ] } },
      select: { filePath: true },
    });
    expect(udb.aufrufe).not.toContain("vorgangsKopieLoeschen");
  });

  it("zeigt nach dem Commit eine Dateizeile auf die Quelle (gleichzeitig zurueckgenommen), bleibt sie liegen", async () => {
    const { p, dateien } = await zuPruefen(abs);
    const quelle = String(dateien[0].speicherPfad);
    // Eine zweite Instanz nimmt die Annahme sofort zurueck — ihr
    // Zurueckverknuepfen trifft auf die noch liegende Quelle (EEXIST).
    const umschalten = fp.unterlagenDatei.updateMany.getMockImplementation() as (a: unknown) => Promise<{ count: number }>;
    fp.unterlagenDatei.updateMany.mockImplementationOnce(async (args: unknown) => {
      const r = await umschalten(args);
      Object.assign(dateien[0], { status: "EINGEREICHT", speicherPfad: quelle });
      return r;
    });
    expect((await position(p.id, { aktion: "annehmen" })).status).toBe(200);
    expect(await gibtEs(abs(quelle))).toBe(true);
    expect(udb.aufrufe).not.toContain("nachforderungsDateiLoeschen");
  });

  it("ist nicht pruefbar, ob ein Document aufs Ziel zeigt: Das Ziel bleibt liegen (der Lauf entscheidet) — im Log nur Code und ID", async () => {
    const stumm = jest.spyOn(console, "error").mockImplementation(() => {});
    const { p, dateien } = await zuPruefen(abs);
    const ziel = abs(`uploads/${VORGANG_ID}/${dateien[0].id}.pdf`);
    fp.document.create.mockRejectedValueOnce(Object.assign(new Error("weg"), { code: "P1001" }));
    fp.document.findMany.mockRejectedValueOnce(Object.assign(new Error(`kaputt ${ziel}`), { code: "P1017" }));
    await expect(position(p.id, { aktion: "annehmen" })).rejects.toMatchObject({ code: "P1001" });
    expect(await gibtEs(ziel)).toBe(true);
    expect(udb.aufrufe).not.toContain("vorgangsKopieLoeschen");
    const log = JSON.stringify(stumm.mock.calls);
    expect(log).toContain("P1017");
    expect(log).not.toContain("uploads");
    stumm.mockRestore();
  });

  it("eine andere Aktion am selben Vorgang laeuft gerade: 409 (Sperre je Vorgang), nichts verknuepft", async () => {
    const { p } = await zuPruefen(abs);
    expect(unterlagenSperreNehmen("ONBOARDING", VORGANG_ID)).toBe(true);
    try {
      expect(await position(p.id, { aktion: "annehmen" })).toEqual({
        status: 409,
        body: { error: MELDUNGEN.AKTION_LAEUFT, grund: "AKTION_LAEUFT" },
      });
    } finally {
      unterlagenSperreFreigeben("ONBOARDING", VORGANG_ID);
    }
    expect(udb.aufrufe).not.toContain("verknuepfenInVorgang");
  });

  it("scheitert die Transaktion: das neue Ziel wird entfernt, die Quelle bleibt, der Fehler geht weiter", async () => {
    const { p, dateien } = await zuPruefen(abs);
    const quelle = abs(String(dateien[0].speicherPfad));
    const ziel = abs(`uploads/${VORGANG_ID}/${dateien[0].id}.pdf`);
    fp.document.create.mockRejectedValueOnce(Object.assign(new Error("weg"), { code: "P1001" }));
    await expect(position(p.id, { aktion: "annehmen" })).rejects.toMatchObject({ code: "P1001" });
    expect(await gibtEs(ziel)).toBe(false);
    expect(await gibtEs(quelle)).toBe(true);
    // Die Sperre je Vorgang ist wieder frei.
    expect(unterlagenSperreNehmen("ONBOARDING", VORGANG_ID)).toBe(true);
    unterlagenSperreFreigeben("ONBOARDING", VORGANG_ID);
  });

  it("Pruefsumme weicht ab → 409 DATEI_VERAENDERT; Datei fehlt → 409 DATEI_FEHLT — nichts geschrieben", async () => {
    const { p, dateien } = await zuPruefen(abs);
    dateien[0].sha256 = "f".repeat(64);
    expect(await position(p.id, { aktion: "annehmen" })).toEqual({
      status: 409,
      body: { error: MELDUNGEN.DATEI_VERAENDERT, grund: "DATEI_VERAENDERT" },
    });
    dateien[0].sha256 = sha256(INHALT);
    await unlink(abs(String(dateien[0].speicherPfad)));
    expect(await position(p.id, { aktion: "annehmen" })).toEqual({
      status: 409,
      body: { error: MELDUNGEN.DATEI_FEHLT, grund: "DATEI_FEHLT" },
    });
    expect(udb.aufrufe).not.toContain("$transaction");
    expect(ddb.dokumente).toHaveLength(0);
    expect(p.status).toBe("EINGEREICHT");
  });

  it("bei EXPIRED erlaubt (EP-3) — ohne Sperre des Vorgangs", async () => {
    udb.vorgaenge = [vorgang({ status: "EXPIRED" })];
    const { p } = await zuPruefen(abs);
    expect((await position(p.id, { aktion: "annehmen" })).status).toBe(200);
    expect(udb.aufrufe).not.toContain("onboardingProcess.updateMany");
  });

  it("eine noch offene Unterlage → 409 NICHT_ZU_PRUEFEN", async () => {
    laufend();
    expect((await position(String(udb.positionen[0].id), { aktion: "annehmen" })).body).toEqual({
      error: MELDUNGEN.NICHT_ZU_PRUEFEN,
      grund: "NICHT_ZU_PRUEFEN",
    });
  });
});

describe("Annahme zurücknehmen (4.5, E-3)", () => {
  const { abs } = mitArbeitsverzeichnis();
  const SPAETER = new Date(JETZT.getTime() + 10 * TAG);

  /** Eine angenommene Unterlage — ueber den echten Weg „Annehmen". */
  async function angenommen(opts: { weitere?: Zeile[] } = {}) {
    const s = await zuPruefen(abs, { weitere: opts.weitere });
    expect((await position(s.p.id, { aktion: "annehmen" })).status).toBe(200);
    udb.aufrufe = [];
    udb.audits = [];
    return { ...s, dokument: ddb.dokumente[0] };
  }

  it("Document geloescht, Datei zurueck bei der Nachforderung, ERLEDIGT → LAUFEND; die Vorgangskopie erst nach dem Commit entfernt", async () => {
    const { n, p, dateien, dokument } = await angenommen();
    const kopie = abs(String(dokument.filePath));
    const zurueck = `uploads/unterlagen/${n.id}/${dateien[0].id}.pdf`;

    const r = await position(p.id, { aktion: "annahme-zuruecknehmen" }, { jetzt: SPAETER });
    expect(r).toEqual({
      status: 200,
      body: {
        nachforderungId: n.id,
        positionId: p.id,
        positionStatus: "EINGEREICHT",
        nachforderungStatus: "LAUFEND",
        mail: null,
        meldung: AKTION_MELDUNGEN["annahme-zuruecknehmen"],
      },
    });
    expect(ddb.dokumente).toHaveLength(0);
    expect(dateien[0]).toMatchObject({
      status: "EINGEREICHT",
      speicherPfad: zurueck,
      uebernahmeZiel: null,
      uebernommenId: null,
      uebernommenAm: null,
      entschiedenAm: null,
    });
    expect(await gibtEs(abs(zurueck))).toBe(true);
    expect(await gibtEs(kopie)).toBe(false);
    expect(p).toMatchObject({ status: "EINGEREICHT", entschiedenAm: null, entschiedenVonId: null });
    // Wieder laufend, mit dem Unique-Schluessel; der Merker bleibt leer (2.1).
    expect(n).toMatchObject({
      status: "LAUFEND",
      laufendSchluessel: `ONBOARDING:${VORGANG_ID}`,
      erledigtAm: null,
      vollstaendigSeit: null,
    });
    expect(udb.audits).toHaveLength(1);
    expect(udb.audits[0]).toMatchObject({
      action: UNTERLAGEN_AUDIT.ANNAHME_ZURUECKGENOMMEN,
      userId: "u-hr",
      details: { nachforderungId: n.id, positionId: p.id, zielIds: [dokument.id], wiedereroeffnet: true },
    });
    const trx = aufruf("$transaction");
    expect(aufruf("zurueckVerknuepfen")).toBeLessThan(trx);
    expect(aufruf("document.deleteMany")).toBeGreaterThan(trx);
    expect(aufruf("vorgangsKopieLoeschen")).toBeGreaterThan(letztesAudit());
    expect(mockSend).not.toHaveBeenCalled();
    expect(mockTrigger).not.toHaveBeenCalled();

    // Danach laesst sie sich wieder annehmen — ein neues Dokument aus derselben Datei.
    expect((await position(p.id, { aktion: "annehmen" }, { jetzt: SPAETER })).status).toBe(200);
    expect(ddb.dokumente).toHaveLength(1);
    expect(await gibtEs(abs(String(ddb.dokumente[0].filePath)))).toBe(true);
  });

  it("hoechstens 30 Tage nach der Annahme: am 31. Tag 409, am 30. noch moeglich", async () => {
    const { p, dokument } = await angenommen();
    const r = await position(p.id, { aktion: "annahme-zuruecknehmen" }, { jetzt: new Date(JETZT.getTime() + 31 * TAG) });
    expect(r).toEqual({ status: 409, body: { error: MELDUNGEN.RUECKNAHME_ZU_SPAET, grund: "RUECKNAHME_ZU_SPAET" } });
    expect(ddb.dokumente).toEqual([dokument]);
    expect(udb.aufrufe).not.toContain("zurueckVerknuepfen");
    const tag30 = await position(p.id, { aktion: "annahme-zuruecknehmen" }, { jetzt: new Date(JETZT.getTime() + 30 * TAG) });
    expect(tag30.status).toBe(200);
  });

  it("neben einer laufenden neueren Nachforderung → 409 ANDERE_LAEUFT, ohne jede Dateiaktion", async () => {
    const { p } = await angenommen();
    laufend({ angefordertAm: vor(MINUTE) });
    const r = await position(p.id, { aktion: "annahme-zuruecknehmen" }, { jetzt: SPAETER });
    expect(r).toEqual({ status: 409, body: { error: MELDUNGEN.ANDERE_LAEUFT, grund: "ANDERE_LAEUFT" } });
    expect(udb.aufrufe).not.toContain("zurueckVerknuepfen");
    expect(ddb.dokumente).toHaveLength(1);
  });

  it("nach dem Zurueckziehen → 409 (Endzustand)", async () => {
    const { n, p } = await angenommen({ weitere: [{ typ: "PKV_NACHWEIS", bezeichnung: "PKV-Nachweis", status: "ANGEFORDERT" }] });
    expect((await aktion({ aktion: "zurueckziehen", nachforderungId: n.id }, { jetzt: SPAETER })).status).toBe(200);
    const r = await position(p.id, { aktion: "annahme-zuruecknehmen" }, { jetzt: SPAETER });
    expect(r).toEqual({
      status: 409,
      body: { error: MELDUNGEN.RUECKNAHME_ZURUECKGEZOGEN, grund: "RUECKNAHME_ZURUECKGEZOGEN" },
    });
    expect(ddb.dokumente).toHaveLength(1);
  });

  it("gewinnt eine gleichzeitig angelegte Nachforderung den Unique-Index (P2002): 409, die zurueckgeholte Datei wird wieder entfernt", async () => {
    const { n, dateien, dokument, p } = await angenommen();
    udb.vorTransaktion = () => {
      laufend({ angefordertAm: new Date() });
    };
    // Postgres rollt die Dateizeilen zurueck — ohne das zeigte die schon
    // umgeschaltete Zeile weiter auf die zurueckgeholte Datei, und sie bliebe.
    naechsteTransaktionMitRollback();
    const r = await position(p.id, { aktion: "annahme-zuruecknehmen" }, { jetzt: SPAETER });
    expect(r).toEqual({ status: 409, body: { error: MELDUNGEN.ANDERE_LAEUFT, grund: "ANDERE_LAEUFT" } });
    expect(dateien[0]).toMatchObject({ status: "ANGENOMMEN", speicherPfad: null });
    expect(await gibtEs(abs(`uploads/unterlagen/${n.id}/${dateien[0].id}.pdf`))).toBe(false);
    // Die Kopie im Vorgang bleibt: Die Transaktion ist nicht durchgegangen.
    expect(await gibtEs(abs(String(dokument.filePath)))).toBe(true);
    expect(udb.aufrufe).not.toContain("vorgangsKopieLoeschen");
  });

  /**
   * Spiegelbild zum gleichzeitigen Annehmen: Eine zweite Instanz nimmt die
   * Annahme gerade selbst zurueck — ihr Zurueckverknuepfen traf auf EEXIST,
   * ihre Dateizeile zeigt jetzt auf denselben Pfad bei der Nachforderung.
   */
  it("gleichzeitig zurueckgenommen, die Dateizeile der anderen Instanz zeigt auf die Datei: 409, die Datei bleibt", async () => {
    const { n, p, dateien, dokument } = await angenommen();
    const zurueck = `uploads/unterlagen/${n.id}/${dateien[0].id}.pdf`;
    udb.vorTransaktion = () => {
      p.status = "EINGEREICHT";
      Object.assign(dateien[0], { status: "EINGEREICHT", speicherPfad: zurueck, uebernahmeZiel: null, uebernommenId: null });
      ddb.dokumente = [];
    };
    const r = await position(p.id, { aktion: "annahme-zuruecknehmen" }, { jetzt: SPAETER });
    expect(r).toEqual({ status: 409, body: { error: MELDUNGEN.NICHT_ANGENOMMEN, grund: "NICHT_ANGENOMMEN" } });
    expect(await gibtEs(abs(zurueck))).toBe(true);
    expect(udb.aufrufe).not.toContain("nachforderungsDateiLoeschen");
    // Die Vorgangskopie raeumt nur ab, wer die Transaktion gewonnen hat.
    expect(await gibtEs(abs(String(dokument.filePath)))).toBe(true);
    expect(udb.aufrufe).not.toContain("vorgangsKopieLoeschen");
  });

  it("zeigt nach dem Commit wieder ein Document auf die Vorgangskopie (erneut angenommen), bleibt sie liegen", async () => {
    const { p, dokument } = await angenommen();
    const kopie = String(dokument.filePath);
    // Eine zweite Instanz nimmt die zurueckgeholte Datei sofort wieder an — ihr
    // Verknuepfen trifft auf die noch liegende Kopie (EEXIST, gleicher Hash).
    const loeschen = fp.document.deleteMany.getMockImplementation() as (a: unknown) => Promise<{ count: number }>;
    fp.document.deleteMany.mockImplementationOnce(async (args: unknown) => {
      const r = await loeschen(args);
      ddb.dokumente.push(neuesDokument({ onboardingId: VORGANG_ID, filePath: kopie, status: "APPROVED" }));
      return r;
    });
    expect((await position(p.id, { aktion: "annahme-zuruecknehmen" }, { jetzt: SPAETER })).status).toBe(200);
    expect(await gibtEs(abs(kopie))).toBe(true);
    expect(udb.aufrufe).not.toContain("vorgangsKopieLoeschen");
  });

  it("in einer noch laufenden Nachforderung: bleibt LAUFEND, nichts wird wiedereroeffnet", async () => {
    const { n, p } = await angenommen({ weitere: [{ typ: "PKV_NACHWEIS", bezeichnung: "PKV-Nachweis", status: "ANGEFORDERT" }] });
    const r = await position(p.id, { aktion: "annahme-zuruecknehmen" }, { jetzt: SPAETER });
    expect(r.body).toMatchObject({ positionStatus: "EINGEREICHT", nachforderungStatus: "LAUFEND" });
    expect(n.status).toBe("LAUFEND");
    expect(udb.audits[0].details).toMatchObject({ wiedereroeffnet: false });
  });

  it("die Vorgangskopie wurde veraendert → 409; das Dokument ist weg → 409 DOKUMENT_FEHLT — nichts geschrieben", async () => {
    const { p, dokument } = await angenommen();
    await writeFile(abs(String(dokument.filePath)), Buffer.from("anders"));
    expect(await position(p.id, { aktion: "annahme-zuruecknehmen" }, { jetzt: SPAETER })).toEqual({
      status: 409,
      body: { error: MELDUNGEN.RUECKNAHME_DATEI_VERAENDERT, grund: "RUECKNAHME_DATEI_VERAENDERT" },
    });
    ddb.dokumente = [];
    expect(await position(p.id, { aktion: "annahme-zuruecknehmen" }, { jetzt: SPAETER })).toEqual({
      status: 409,
      body: { error: MELDUNGEN.DOKUMENT_FEHLT, grund: "DOKUMENT_FEHLT" },
    });
    expect(udb.aufrufe).not.toContain("$transaction");
    expect(p.status).toBe("ANGENOMMEN");
  });
});

describe("zurueckweisen (EP-1)", () => {
  const BEGRUENDUNG = "Bitte die aktuelle Bescheinigung <b>2026</b> hochladen.";

  /** Eine uebermittelte Unterlage (PKV-Nachweis) — die Datei selbst braucht das Zurueckweisen nicht. */
  function eingereicht(kopf: Zeile = {}, pos: Zeile = {}): { n: MitId; p: MitId; datei: Zeile } {
    const n = laufend({ frist: datum("2026-09-25"), ...kopf }, [
      {
        typ: "PKV_NACHWEIS",
        bezeichnung: "PKV-Nachweis",
        status: "EINGEREICHT",
        einreichungen: 1,
        uebermitteltAm: vor(TAG),
        ...pos,
      },
    ]);
    const p = udb.positionen[0] as MitId;
    const datei = neueDatei({
      nachforderungId: n.id,
      positionId: p.id,
      status: "EINGEREICHT",
      uebermitteltAm: vor(TAG),
      speicherPfad: `uploads/unterlagen/${n.id}/x.pdf`,
    });
    udb.dateien.push(datei);
    return { n, p, datei };
  }

  it("mit neuer Frist: genau EINE Mail; die Frist gilt fuer die ganze Nachforderung, lebende Links werden fortgeschrieben", async () => {
    const { n, p, datei } = eingereicht({ vollstaendigSeit: vor(TAG), vollstaendigGemeldetAm: vor(TAG) });
    const lebt = link(n, { gueltigBis: datum("2026-10-09") });
    const tot = link(n, { gueltigBis: datum("2026-09-20"), createdAt: vor(10 * TAG), gesendetAm: vor(10 * TAG) });

    const r = await position(p.id, { aktion: "zurueckweisen", begruendung: BEGRUENDUNG, frist: "2026-10-12" });
    expect(r).toEqual({
      status: 200,
      body: {
        nachforderungId: n.id,
        positionId: p.id,
        positionStatus: "ZURUECKGEWIESEN",
        nachforderungStatus: "LAUFEND",
        mail: { status: "SENT", detail: null },
        meldung: AKTION_MELDUNGEN.zurueckweisen,
      },
    });

    // Genau eine Mail: die Zurueckweisung — keine zusaetzliche zur Friständerung.
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockTrigger).not.toHaveBeenCalled();
    const [mail] = mails();
    expect(mail.event).toBe(UNTERLAGEN_EVENTS.ZURUECKGEWIESEN);
    expect(mail.an).toBe(ADRESSE);
    expect(mail.payload).toMatchObject({
      frist: "12.10.2026",
      unterlage: "PKV-Nachweis",
      begruendung: BEGRUENDUNG,
      einreichung_nr: 1,
      frist_verstrichen: "",
    });
    expect(String(mail.payload.begruendung_html)).not.toContain("<b>");

    expect(n.frist).toEqual(datum("2026-10-12"));
    expect(n).toMatchObject({ vollstaendigSeit: null, vollstaendigGemeldetAm: null });
    expect(lebt.gueltigBis).toEqual(datum("2026-10-26"));
    expect(tot.gueltigBis).toEqual(datum("2026-09-20"));
    const neu = udb.links.at(-1)!;
    expect(neu).toMatchObject({
      anlass: "ZURUECKWEISUNG",
      positionId: p.id,
      empfaenger: ADRESSE,
      erstelltVonId: "u-hr",
      mailStatus: "SENT",
    });
    expect(neu.gueltigBis).toEqual(datum("2026-10-26"));
    expect(neu.tokenHash).toBe(hashToken(tokenAus(mail.payload)));

    expect(p).toMatchObject({ status: "ZURUECKGEWIESEN", begruendung: BEGRUENDUNG, entschiedenVonId: "u-hr" });
    // Die Datei traegt eine Kopie der Begruendung (Nachweis nach dem Loeschen) und geht nach 30 Tagen.
    expect(datei).toMatchObject({ status: "ZURUECKGEWIESEN", begruendung: BEGRUENDUNG });
    expect(datei.entschiedenAm).toEqual(JETZT);
    expect(datei.loeschenAb).toEqual(new Date(JETZT.getTime() + 30 * TAG));

    expect(udb.audits.at(-1)).toMatchObject({
      action: UNTERLAGEN_AUDIT.ZURUECKGEWIESEN,
      details: {
        nachforderungId: n.id,
        positionId: p.id,
        linkId: neu.id,
        begruendungLaenge: BEGRUENDUNG.length,
        dateienZurueckgewiesen: 1,
        fristVorher: "2026-09-25",
        fristNachher: "2026-10-12",
        linksFortgeschrieben: 1,
      },
    });
    expect(JSON.stringify(udb.audits)).not.toContain("Bescheinigung");

    // Reihenfolge: Vorgang, Nachforderung, Mail-Bremse — die Mail nach dem Commit.
    const trx = aufruf("$transaction");
    expect(aufruf("onboardingProcess.updateMany")).toBeGreaterThan(trx);
    expect(aufruf("onboardingProcess.updateMany")).toBeLessThan(aufruf("unterlagenNachforderung.updateMany"));
    expect(aufruf("unterlagenLink.findMany")).toBeGreaterThan(aufruf("unterlagenNachforderung.updateMany"));
    expect(aufruf("sendEventEmail")).toBeGreaterThan(letztesAudit());
  });

  it("sensible Unterlage: Mail ohne Namen und ohne Begruendung (E-2) — beides nur auf der Upload-Seite", async () => {
    const { p } = eingereicht({}, { typ: "AUFENTHALTSTITEL", bezeichnung: "Aufenthaltstitel", sensibel: true, fristpflichtig: true });
    expect((await position(p.id, { aktion: "zurueckweisen", begruendung: "Rueckseite fehlt" })).status).toBe(200);
    const [mail] = mails();
    expect(mail.payload).toMatchObject({ unterlage: "", begruendung: "", begruendung_html: "" });
    expect(JSON.stringify(mail.payload)).not.toContain("Aufenthaltstitel");
    expect(JSON.stringify(mail.payload)).not.toContain("Rueckseite");
    expect(p.begruendung).toBe("Rueckseite fehlt");
  });

  it("ohne neue Frist bleibt die bisherige — ist der Link schon tot, ist eine neue Frist Pflicht (409, nichts geschrieben)", async () => {
    // Frist 01.09., Linkende 15.09. — heute ist der 21.09.
    const { n, p } = eingereicht({ frist: datum("2026-09-01") });
    expect(await position(p.id, { aktion: "zurueckweisen", begruendung: "x" })).toEqual({
      status: 409,
      body: { error: MELDUNGEN.ZURUECKWEISEN_FRIST_NOETIG, grund: "ZURUECKWEISEN_FRIST_NOETIG" },
    });
    expect(p.status).toBe("EINGEREICHT");
    expect(udb.aufrufe).not.toContain("$transaction");

    expect((await position(p.id, { aktion: "zurueckweisen", begruendung: "x", frist: "2026-10-01" })).status).toBe(200);
    expect(n.frist).toEqual(datum("2026-10-01"));
    expect(udb.links.at(-1)!.gueltigBis).toEqual(datum("2026-10-15"));
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it("Frist ausserhalb der Grenzen → 400", async () => {
    const { p } = eingereicht();
    const r = await position(p.id, { aktion: "zurueckweisen", begruendung: "x", frist: "2026-09-21" });
    expect(r).toEqual({ status: 400, body: { error: MELDUNGEN.FRIST_ZU_FRUEH, grund: "FRIST_ZU_FRUEH" } });
  });

  it("bei EXPIRED gesperrt (EP-3); EXPIRED zwischen Lesen und Schreiben → 409, nichts geschrieben, keine Mail", async () => {
    udb.vorgaenge = [vorgang({ status: "EXPIRED" })];
    const { p } = eingereicht();
    expect((await position(p.id, { aktion: "zurueckweisen", begruendung: "x" })).body.grund).toBe("HR_VORGANG_EINGESTELLT");

    udb.vorgaenge = [vorgang()];
    udb.vorTransaktion = () => {
      udb.vorgaenge[0].status = "EXPIRED";
    };
    expect(await position(p.id, { aktion: "zurueckweisen", begruendung: "x" })).toEqual({
      status: 409,
      body: { error: MELDUNGEN.HR_VORGANG_EINGESTELLT, grund: "HR_VORGANG_EINGESTELLT" },
    });
    expect(p.status).toBe("EINGEREICHT");
    expect(udb.links).toHaveLength(0);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("die 7. Mail an die Person in einer Stunde → 429 mit Retry-After, nichts geschrieben", async () => {
    const { n, p } = eingereicht();
    for (const minuten of [50, 40, 30, 20, 10, 5]) link(n, { createdAt: vor(minuten * MINUTE), gesendetAm: vor(minuten * MINUTE) });
    const r = await position(p.id, { aktion: "zurueckweisen", begruendung: "x" });
    expect(r).toEqual({
      status: 429,
      body: { error: MELDUNGEN.MAIL_BREMSE, grund: "MAIL_BREMSE" },
      headers: { "Retry-After": String(10 * 60) },
    });
    expect(p.status).toBe("EINGEREICHT");
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("Mail scheitert: 200 mit Warnung (EP-11) — die Zurueckweisung bleibt gespeichert, der Lauf holt nach", async () => {
    mockSend.mockImplementationOnce(async () => ({ status: "FAILED", detail: "Timeout" }));
    const { p } = eingereicht();
    const r = await position(p.id, { aktion: "zurueckweisen", begruendung: "x" });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ mail: { status: "FAILED" }, warnung: MELDUNGEN.MAIL_NICHT_ZUGESTELLT });
    expect(p.status).toBe("ZURUECKGEWIESEN");
    expect(udb.links.at(-1)).toMatchObject({ anlass: "ZURUECKWEISUNG", mailStatus: "FAILED" });
  });

  it("N2: versendet, das Ergebnis laesst sich zweimal nicht speichern → 200 mit „bitte nicht erneut senden“, nie 500", async () => {
    const stumm = jest.spyOn(console, "error").mockImplementation(() => {});
    const { p } = eingereicht();
    fp.unterlagenLink.updateMany
      .mockRejectedValueOnce(Object.assign(new Error("weg"), { code: "P1001" }))
      .mockRejectedValueOnce(Object.assign(new Error("weg"), { code: "P1001" }));
    const r = await position(p.id, { aktion: "zurueckweisen", begruendung: "x" });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      mail: { status: "SENT", nachweisFehlt: true },
      warnung: MELDUNGEN.MAIL_NACHWEIS_FEHLT,
    });
    expect(JSON.stringify(stumm.mock.calls)).not.toContain(ADRESSE);
    stumm.mockRestore();
  });

  it("gespeicherte Vorlage ohne {{link}} → 409 vor jeder Aenderung", async () => {
    udb.emailVorlagen.push({
      event: UNTERLAGEN_EVENTS.ZURUECKGEWIESEN,
      subject: "Bitte erneut hochladen",
      bodyHtml: "<p>Bitte melden Sie sich.</p>",
      bodyText: null,
      recipientTo: "",
      recipientCc: "",
      recipientBcc: "",
      recipientReplyTo: "",
      isActive: true,
    });
    const { p } = eingereicht();
    const r = await position(p.id, { aktion: "zurueckweisen", begruendung: "x" });
    expect(r.body.grund).toBe("VORLAGE_OHNE_LINK");
    expect(String(r.body.error)).toContain("„Unterlage zurückgewiesen“");
    expect(udb.aufrufe).not.toContain("$transaction");
  });
});

describe("entfaellt (EP-2)", () => {
  it("interne Notiz, keine Mail; Entwuerfe verschwinden (Zeile im Commit, Datei danach), eingereichte werden VERWORFEN; die letzte macht ERLEDIGT", async () => {
    const n = laufend({ vollstaendigSeit: vor(TAG), vollstaendigGemeldetAm: vor(TAG) }, [
      { typ: "AUFENTHALTSTITEL", bezeichnung: "Aufenthaltstitel", status: "EINGEREICHT", uebermitteltAm: vor(TAG) },
      { typ: "PKV_NACHWEIS", bezeichnung: "PKV-Nachweis", status: "ZURUECKGEWIESEN", begruendung: "unscharf" },
    ]);
    const [titel, pkv] = udb.positionen as MitId[];
    const eingereicht = neueDatei({
      nachforderungId: n.id,
      positionId: titel.id,
      status: "EINGEREICHT",
      uebermitteltAm: vor(TAG),
      speicherPfad: `uploads/unterlagen/${n.id}/a.pdf`,
    });
    const alt = neueDatei({
      nachforderungId: n.id,
      positionId: pkv.id,
      status: "ZURUECKGEWIESEN",
      uebermitteltAm: vor(2 * TAG),
      speicherPfad: `uploads/unterlagen/${n.id}/b.pdf`,
    });
    const entwurf = neueDatei({
      nachforderungId: n.id,
      positionId: pkv.id,
      status: "ENTWURF",
      speicherPfad: `uploads/unterlagen/${n.id}/c.pdf`,
    });
    udb.dateien.push(eingereicht, alt, entwurf);
    const NOTIZ = "Liegt in der Personalakte.";

    const r1 = await position(pkv.id, { aktion: "entfaellt", notiz: NOTIZ });
    expect(r1).toEqual({
      status: 200,
      body: {
        nachforderungId: n.id,
        positionId: pkv.id,
        positionStatus: "ENTFAELLT",
        nachforderungStatus: "LAUFEND",
        mail: null,
        meldung: AKTION_MELDUNGEN.entfaellt,
      },
    });
    expect(pkv).toMatchObject({ status: "ENTFAELLT", entfaelltNotiz: NOTIZ, entschiedenVonId: "u-hr" });
    // Der Entwurf ist weg, die frueher zurueckgewiesene Datei bleibt, wie sie ist.
    expect(udb.dateien.map((d) => d.id)).toEqual([eingereicht.id, alt.id]);
    expect(alt.status).toBe("ZURUECKGEWIESEN");
    expect(mockEntwuerfeLoeschen).toHaveBeenCalledWith(n.id, [`uploads/unterlagen/${n.id}/c.pdf`]);
    expect(aufruf("unterlagenDatei.deleteMany")).toBeLessThan(letztesAudit());
    expect(aufruf("entwuerfeLoeschen")).toBeGreaterThan(letztesAudit());
    // Ohne Abschluss bleibt der Merker (2.1) — eine Aktion von HR meldet nie „vollständig".
    expect(n.vollstaendigSeit).toEqual(vor(TAG));
    expect(udb.audits.at(-1)).toMatchObject({
      action: UNTERLAGEN_AUDIT.ENTFAELLT,
      details: {
        positionId: pkv.id,
        typ: "PKV_NACHWEIS",
        notizLaenge: NOTIZ.length,
        entwuerfeGeloescht: 1,
        dateienVerworfen: 0,
      },
    });
    expect(JSON.stringify(udb.audits)).not.toContain("Personalakte");

    const r2 = await position(titel.id, { aktion: "entfaellt" });
    expect(r2.body).toMatchObject({ positionStatus: "ENTFAELLT", nachforderungStatus: "ERLEDIGT" });
    expect(eingereicht).toMatchObject({ status: "VERWORFEN" });
    expect(eingereicht.entschiedenAm).toEqual(JETZT);
    expect(eingereicht.loeschenAb).toEqual(new Date(JETZT.getTime() + 30 * TAG));
    expect(n).toMatchObject({ status: "ERLEDIGT", laufendSchluessel: null, vollstaendigSeit: null, vollstaendigGemeldetAm: null });
    expect(udb.audits.slice(-2).map((a) => a.action)).toEqual([UNTERLAGEN_AUDIT.ENTFAELLT, UNTERLAGEN_AUDIT.ERLEDIGT]);
    expect(mockSend).not.toHaveBeenCalled();
    expect(mockTrigger).not.toHaveBeenCalled();
  });

  it("bei EXPIRED erlaubt — ohne Sperre des Vorgangs; eine angenommene Unterlage → 409", async () => {
    udb.vorgaenge = [vorgang({ status: "EXPIRED" })];
    laufend({}, [
      { typ: "AUFENTHALTSTITEL", status: "ANGEFORDERT" },
      { typ: "PKV_NACHWEIS", status: "ANGENOMMEN" },
      { typ: "SV_AUSWEIS", status: "ANGEFORDERT" },
    ]);
    const [offen, angenommen] = udb.positionen as MitId[];
    expect((await position(offen.id, { aktion: "entfaellt" })).status).toBe(200);
    expect(udb.aufrufe).not.toContain("onboardingProcess.updateMany");
    expect((await position(angenommen.id, { aktion: "entfaellt" })).body).toEqual({
      error: MELDUNGEN.NICHT_ENTFAELLBAR,
      grund: "NICHT_ENTFAELLBAR",
    });
  });
});
