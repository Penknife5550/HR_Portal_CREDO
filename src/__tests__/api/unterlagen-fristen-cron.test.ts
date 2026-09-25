/**
 * Tests: taeglicher Lauf „Unterlagen nachfordern"
 * (POST /api/cron/unterlagen-fristen, src/lib/unterlagen-lauf.ts — Feinplanung
 * Abschnitt 9, 4.5, Z2 und N3)
 *
 * Der echte Lauf samt echtem Dienst gegen die In-Memory-Datenbank
 * (src/__tests__/hilfen/unterlagen-fake-db.ts); die Dateien liegen echt in
 * einem Verzeichnis unter os.tmpdir(), `process.cwd()` zeigt dorthin.
 * sendEventEmail und triggerWebhooks tragen sich in dieselbe Aufrufliste ein
 * wie die Datenbank (`udb.aufrufe`) — so ist die Reihenfolge pruefbar: erst
 * sperren, dann der Link, dann die Mail, dann Merker und Protokoll.
 *
 * **Die Uhr steht** auf Mo 21.09.2026, 10:00 Uhr in Berlin. Die Geschichte:
 * angefordert Mo 14.09., Frist Fr 25.09. (heute ist Frist − 4, also im
 * Vorab-Fenster), Linkende Fr 09.10.2026.
 *
 * Quer durch alle Tests (afterEach): Kein Personen-Event geht ueber
 * triggerWebhooks, jede Mail an die Person mit overrideTo.
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

import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { access, mkdir, mkdtemp, readdir, rm, utimes, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import {
  ddb,
  fakePrisma,
  neueDatei,
  neueNachforderung,
  neuePosition,
  neuerUnterlagenLink,
  neuesDokument,
  udb,
  udbLeeren,
  type Zeile,
} from "../hilfen/unterlagen-fake-db";
import { POST } from "@/app/api/cron/unterlagen-fristen/route";
import { LAUF_MELDUNGEN, unterlagenFristenLauf, type LaufBericht } from "@/lib/unterlagen-lauf";
import { LAUF_ZURUECKGEZOGEN_GRUND, unterlagenSperreFreigeben, unterlagenSperreNehmen } from "@/lib/unterlagen-dienst";
import { MELDUNGEN, UNTERLAGEN_AUDIT } from "@/lib/unterlagen";
import { UNTERLAGEN_EVENTS, UNTERLAGEN_PERSONEN_EVENTS } from "@/lib/unterlagen-mail";
import { DEFAULT_EMAIL_TEMPLATES } from "@/lib/default-email-templates";
import * as dateienModul from "@/lib/unterlagen-dateien";

// =============================================
// Testdaten
// =============================================

const SECRET = "test-cron-secret-mindestens-24-zeichen";
const BASIS = "https://hr.example.org";
/** Montag, 21.09.2026, 10:00 Uhr in Berlin. */
const JETZT = new Date("2026-09-21T08:00:00.000Z");
const STUNDE = 3_600_000;
const TAG = 24 * STUNDE;
const vor = (ms: number) => new Date(JETZT.getTime() - ms);
const datum = (tag: string) => new Date(`${tag}T00:00:00.000Z`);
const FRIST = "2026-09-25";
const PDF = Buffer.from("%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n", "latin1");

type MitId = Zeile & { id: string };

let basis: string;
let cwd: jest.SpyInstance;
const fp = fakePrisma as unknown as Record<string, Record<string, jest.Mock>>;

/** Ein Onboarding-Vorgang (Fragebogen abgesendet) mit eigener ID und Adresse. */
function vorgang(teil: Zeile = {}): MitId {
  const id = String(teil.id ?? randomUUID());
  const v = {
    id,
    displayId: "2026-GYM-014",
    organizationId: "org-1",
    status: "SUBMITTED",
    email: `anna.${id.slice(0, 4)}@example.org`,
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
  udb.vorgaenge.push(v);
  return v as MitId;
}

/** Eine laufende Nachforderung samt Positionen; Frist Fr 25.09., angefordert Mo 14.09. */
function nachforderung(
  v: MitId,
  teil: Zeile = {},
  positionen: Zeile[] = [{ typ: "PKV_NACHWEIS", bezeichnung: "PKV-Nachweis" }],
): MitId {
  const n = neueNachforderung({
    onboardingId: v.id,
    laufendSchluessel: `ONBOARDING:${v.id}`,
    empfaenger: v.email,
    empfaengerVorgang: v.email,
    frist: datum(FRIST),
    angefordertVonId: "u-hr",
    angefordertAm: new Date("2026-09-14T08:00:00.000Z"),
    ...teil,
  });
  udb.nachforderungen.push(n);
  positionen.forEach((p, i) =>
    udb.positionen.push(neuePosition({ nachforderungId: n.id, reihenfolge: i, angefordertAm: n.angefordertAm, ...p })),
  );
  return n as MitId;
}

function positionVon(n: MitId, index = 0): MitId {
  return udb.positionen.filter((p) => p.nachforderungId === n.id)[index] as MitId;
}

/** Eine Mail an die Person; Standard: die zugestellte Aufforderung vom 14.09. */
function link(n: MitId, teil: Zeile = {}): MitId {
  const l = neuerUnterlagenLink({
    nachforderungId: n.id,
    empfaenger: n.empfaenger,
    gueltigBis: datum("2026-10-09"),
    erstelltVonId: "u-hr",
    mailStatus: "SENT",
    gesendetAm: new Date("2026-09-14T08:00:00.000Z"),
    createdAt: new Date("2026-09-14T08:00:00.000Z"),
    ...teil,
  });
  udb.links.push(l);
  return l as MitId;
}

async function ablegen(relativ: string, mtime: Date = vor(30 * TAG), inhalt: Buffer = PDF): Promise<void> {
  const ziel = path.join(basis, ...relativ.split("/"));
  await mkdir(path.dirname(ziel), { recursive: true });
  await writeFile(ziel, inhalt);
  await utimes(ziel, mtime, mtime);
}

async function gibtEs(relativ: string): Promise<boolean> {
  try {
    await access(path.join(basis, ...relativ.split("/")));
    return true;
  } catch {
    return false;
  }
}

/** Eine Datei der Nachforderung — mit `aufPlatte` liegt sie auch dort. */
async function datei(n: MitId, teil: Zeile = {}, aufPlatte = true): Promise<MitId> {
  const id = randomUUID();
  const d = neueDatei({
    id,
    nachforderungId: n.id,
    positionId: positionVon(n).id,
    speicherPfad: `uploads/unterlagen/${n.id}/${id}.pdf`,
    hochgeladenAm: vor(10 * TAG),
    ...teil,
  });
  udb.dateien.push(d);
  if (aufPlatte && typeof d.speicherPfad === "string") await ablegen(d.speicherPfad);
  return d as MitId;
}

const lauf = (opts: { dryRun?: boolean; jetzt?: Date } = {}) =>
  unterlagenFristenLauf({ jetzt: opts.jetzt ?? JETZT, dryRun: opts.dryRun });

async function bericht(opts: { dryRun?: boolean; jetzt?: Date } = {}): Promise<LaufBericht> {
  const antwort = await lauf(opts);
  expect(antwort.status).toBe(200);
  return antwort.body as LaufBericht;
}

function anfrage(opts: { token?: string | null; query?: string } = {}): NextRequest {
  const token = opts.token === undefined ? SECRET : opts.token;
  return new NextRequest(`http://localhost:3000/api/cron/unterlagen-fristen${opts.query ?? ""}`, {
    method: "POST",
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

/** Die Mails an die Person in Reihenfolge. */
function mails() {
  return mockSend.mock.calls.map(([event, payload, opts]) => ({ event, payload, an: opts?.overrideTo }));
}

/** Alle schreibenden Aufrufe an die Datenbank. */
function schreibzugriffe(): string[] {
  return udb.aufrufe.filter((a) => /\.(create|update|updateMany|delete|deleteMany|upsert)$/.test(a) || a === "$transaction");
}

async function bis(bedingung: () => boolean): Promise<void> {
  for (let i = 0; i < 200 && !bedingung(); i++) await new Promise((r) => setImmediate(r));
}

const alteUmgebung = { ...process.env };

beforeAll(() => {
  jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate", "queueMicrotask"] });
});
afterAll(() => {
  jest.useRealTimers();
});

beforeEach(async () => {
  jest.setSystemTime(JETZT);
  jest.clearAllMocks();
  process.env.NEXT_PUBLIC_APP_URL = BASIS;
  process.env.CRON_SECRET = SECRET;
  udbLeeren();
  udb.users = [
    { id: "u-hr", firstName: "Erika", lastName: "Muster", email: "erika.muster@example.org", isActive: true },
  ];
  mockSend.mockImplementation(async () => ({ status: "SENT", messageId: "<m-1@example.org>" }));
  mockTrigger.mockImplementation(async () => ({ status: "SENT" }));
  basis = await mkdtemp(path.join(os.tmpdir(), "p4-lauf-"));
  cwd = jest.spyOn(process, "cwd").mockReturnValue(basis);
});

afterEach(async () => {
  // Der Upload-Link ist ein Zugang zur Personalakte: nie an einen Webhook …
  for (const [event] of mockTrigger.mock.calls) {
    expect(UNTERLAGEN_PERSONEN_EVENTS).not.toContain(event);
  }
  // … und jede Mail an die Person geht an genau die Adresse der Nachforderung.
  for (const [, , opts] of mockSend.mock.calls) expect(opts?.overrideTo).toBeTruthy();
  cwd.mockRestore();
  await rm(basis, { recursive: true, force: true });
  process.env = { ...alteUmgebung };
});

// =============================================
// Anmeldung und Rahmen
// =============================================

describe("POST /api/cron/unterlagen-fristen — Anmeldung", () => {
  it("500 ohne oder mit zu kurzem CRON_SECRET — ohne einen Datenbankzugriff", async () => {
    const stumm = jest.spyOn(console, "error").mockImplementation(() => {});
    delete process.env.CRON_SECRET;
    expect((await POST(anfrage())).status).toBe(500);
    process.env.CRON_SECRET = "zu-kurz-23-zeichen-lang";
    expect(process.env.CRON_SECRET).toHaveLength(23);
    const kurz = await POST(anfrage({ token: "zu-kurz-23-zeichen-lang" }));
    expect(kurz.status).toBe(500);
    expect(await kurz.json()).toEqual({ error: "Konfigurationsfehler" });
    expect(udb.aufrufe).toEqual([]);
    stumm.mockRestore();
  });

  it("401 ohne, mit falschem und mit gleich langem Nicht-ASCII-Geheimnis — ohne Datenbankzugriff", async () => {
    const umlaut = "ä".repeat(SECRET.length);
    for (const token of [null, "falsch", umlaut, `${SECRET}x`]) {
      const res = await POST(anfrage({ token }));
      expect({ token, status: res.status }).toEqual({ token, status: 401 });
    }
    expect(udb.aufrufe).toEqual([]);
  });

  it("200 mit dem Geheimnis: Antwort ohne Personendaten, `no-store`, `?dryRun=1` wird durchgereicht", async () => {
    const v = vorgang();
    const n = nachforderung(v);
    link(n);

    const probe = await POST(anfrage({ query: "?dryRun=1" }));
    expect(probe.status).toBe(200);
    expect(probe.headers.get("Cache-Control")).toBe("no-store");
    const trocken = (await probe.json()) as LaufBericht;
    expect(trocken).toMatchObject({ success: true, dryRun: true, heute: "2026-09-21", erinnerungen: { vorab: 1 } });
    expect(mockSend).not.toHaveBeenCalled();

    const echt = (await (await POST(anfrage())).json()) as LaufBericht;
    expect(echt).toMatchObject({ dryRun: false, erinnerungen: { vorab: 1, fristtag: 0 }, total: 1 });
    expect(echt.details).toEqual([
      { nachforderungId: n.id, modul: "ONBOARDING", schritt: "ERINNERUNG", anlass: "VORAB", status: "SENT" },
    ]);
    // n8n speichert Ausfuehrungsdaten: keine Adresse, kein Name, keine Vorgangsnummer.
    const text = JSON.stringify([trocken, echt]);
    for (const verboten of [v.email as string, "Anna", "Beispiel", "2026-GYM", "unterlagen/"]) {
      expect(text).not.toContain(verboten);
    }
  });
});

// =============================================
// Probelauf
// =============================================

describe("dryRun — dieselbe Planung ohne jede Seitenwirkung", () => {
  /** Je Vorgang eine Nachforderung mit einem anderen faelligen Schritt. */
  async function allesFaellig() {
    const erinnern = nachforderung(vorgang(), { angefordertAm: vor(7 * TAG) });
    link(erinnern);
    const abgewiesen = await datei(erinnern, { status: "ZURUECKGEWIESEN", uebermitteltAm: vor(40 * TAG), loeschenAb: vor(TAG) });
    await ablegen(`uploads/unterlagen/${erinnern.id}/${randomUUID()}.pdf`, vor(3 * TAG)); // Waise

    const verstrichen = nachforderung(vorgang(), { frist: datum("2026-09-18"), angefordertAm: vor(6 * TAG) });
    link(verstrichen);

    const vollstaendig = nachforderung(vorgang(), { vollstaendigSeit: vor(2 * STUNDE), angefordertAm: vor(5 * TAG) }, [
      { typ: "PKV_NACHWEIS", bezeichnung: "PKV-Nachweis", status: "EINGEREICHT" },
    ]);
    link(vollstaendig);

    const abgelaufen = nachforderung(vorgang({ status: "EXPIRED" }), { angefordertAm: vor(4 * TAG) });
    link(abgelaufen);
    const entwurf = await datei(abgelaufen);

    const nachholen = nachforderung(vorgang(), { angefordertAm: vor(3 * TAG) });
    link(nachholen, { mailStatus: "FAILED", gesendetAm: null, mailDetail: "SMTP weg" });

    return { erinnern, abgewiesen, verstrichen, vollstaendig, abgelaufen, entwurf, nachholen };
  }

  it("keine Mail, kein Link, kein Schreibzugriff, keine Loeschung — Zaehler wie der scharfe Lauf, Status GEPLANT", async () => {
    const f = await allesFaellig();
    const linksVorher = udb.links.length;

    const trocken = await bericht({ dryRun: true });
    expect(mockSend).not.toHaveBeenCalled();
    expect(mockTrigger).not.toHaveBeenCalled();
    expect(schreibzugriffe()).toEqual([]);
    expect(udb.links).toHaveLength(linksVorher);
    expect(udb.nachforderungen.find((n) => n.id === f.abgelaufen.id)?.status).toBe("LAUFEND");
    expect(await gibtEs(String(f.abgewiesen.speicherPfad))).toBe(true);
    expect(await gibtEs(String(f.entwurf.speicherPfad))).toBe(true);
    expect(await readdir(path.join(basis, "uploads", "unterlagen", f.erinnern.id))).toHaveLength(2);
    expect(trocken.details.every((d) => d.status === "GEPLANT")).toBe(true);

    const scharf = await bericht();
    const zaehler = (b: LaufBericht) => ({
      erinnerungen: b.erinnerungen,
      hrMeldungen: b.hrMeldungen,
      nachgeholt: b.nachgeholt,
      zurueckgezogen: b.zurueckgezogen,
      aufgeraeumt: b.aufgeraeumt,
      total: b.total,
    });
    expect(zaehler(trocken)).toEqual({
      erinnerungen: { vorab: 1, fristtag: 0 },
      hrMeldungen: { vollstaendigNachgeholt: 1, fristVerstrichen: 1 },
      nachgeholt: 1,
      zurueckgezogen: 1,
      aufgeraeumt: { dateien: 1, entwuerfe: 0, waisen: 1, fehler: 0 },
      total: 4,
    });
    expect(zaehler(scharf)).toEqual(zaehler(trocken));
    // Dieselbe Form der Antwort.
    expect(Object.keys(trocken).sort()).toEqual(Object.keys(scharf).sort());
    expect(trocken.details.map(({ status: _s, ...rest }) => rest)).toEqual(
      scharf.details.map(({ status: _s, ...rest }) => rest),
    );
    expect(scharf.errors).toBe(0);
  });

  it("Z2 im Probelauf: nur gezaehlt — die Nachforderung laeuft weiter, der Entwurf bleibt", async () => {
    const n = nachforderung(vorgang({ status: "EXPIRED" }));
    link(n);
    const entwurf = await datei(n);
    const b = await bericht({ dryRun: true });
    expect(b.zurueckgezogen).toBe(1);
    expect(b.details).toEqual([{ nachforderungId: n.id, modul: "ONBOARDING", schritt: "ZURUECKZIEHEN", status: "GEPLANT" }]);
    expect(n).toMatchObject({ status: "LAUFEND", laufendSchluessel: expect.any(String) });
    expect(udb.dateien).toHaveLength(1);
    expect(await gibtEs(String(entwurf.speicherPfad))).toBe(true);
    expect(udb.audits).toEqual([]);
  });
});

// =============================================
// Erinnerung: Merker und Protokoll
// =============================================

describe("Erinnerung an die Person", () => {
  it("SENT: Link vor dem Versand (vom Lauf, gleiche Adresse), Merker und Protokoll im selben Commit", async () => {
    const v = vorgang();
    const n = nachforderung(v);
    link(n);
    await datei(n); // ein Entwurf liegt schon

    const b = await bericht();
    expect(b).toMatchObject({ erinnerungen: { vorab: 1, fristtag: 0 }, total: 1, errors: 0 });

    const neu = udb.links.at(-1) as MitId;
    expect(neu).toMatchObject({
      anlass: "ERINNERUNG_VORAB",
      erstelltVonId: null,
      empfaenger: v.email,
      mailStatus: "SENT",
      gesendetAm: JETZT,
      gueltigBis: datum("2026-10-09"),
    });
    expect(mails()).toHaveLength(1);
    const [mail] = mails();
    expect(mail.event).toBe(UNTERLAGEN_EVENTS.ERINNERUNG);
    expect(mail.an).toBe(v.email);
    expect(mail.payload).toMatchObject({
      ist_vorab: "ja",
      ist_fristtag: "",
      entwurf_vorhanden: "ja",
      frist_verstrichen: "",
      email: v.email,
    });
    expect(String(mail.payload.link)).toMatch(new RegExp(`^${BASIS}/unterlagen/[0-9a-f-]{36}$`));

    expect(n).toMatchObject({ erinnertFuerFrist: datum(FRIST), erinnertStufe: "VORAB" });
    expect(udb.audits).toEqual([
      expect.objectContaining({
        userId: null,
        onboardingId: v.id,
        processType: "ONBOARDING",
        action: UNTERLAGEN_AUDIT.ERINNERT,
        details: { nachforderungId: n.id, linkId: neu.id, stufe: "VORAB", frist: FRIST },
      }),
    ]);

    // Reihenfolge: Vorgang sperren → Nachforderung sperren → Link → Mail → Merker und Protokoll.
    const a = udb.aufrufe;
    const stelle = (name: string) => a.indexOf(name);
    expect(stelle("onboardingProcess.updateMany")).toBeLessThan(stelle("unterlagenNachforderung.updateMany"));
    expect(stelle("unterlagenNachforderung.updateMany")).toBeLessThan(stelle("unterlagenLink.create"));
    expect(stelle("unterlagenLink.create")).toBeLessThan(stelle("sendEventEmail"));
    expect(stelle("sendEventEmail")).toBeLessThan(a.lastIndexOf("auditLog.create"));
    expect(a.lastIndexOf("$transaction")).toBeGreaterThan(stelle("sendEventEmail"));

    // Derselbe Tag noch einmal: keine zweite Mail.
    mockSend.mockClear();
    expect((await bericht()).total).toBe(0);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("SKIPPED: Merker gesetzt, kein Protokoll — und kein zweiter Versuch", async () => {
    const n = nachforderung(vorgang());
    link(n);
    mockSend.mockResolvedValue({ status: "SKIPPED", detail: "E-Mail-Vorlage ist deaktiviert" });
    const b = await bericht();
    expect(b).toMatchObject({ mailUebersprungen: 1, total: 0, nichtZugestellt: 0 });
    expect(b.details[0]).toMatchObject({ schritt: "ERINNERUNG", status: "SKIPPED" });
    expect(n).toMatchObject({ erinnertFuerFrist: datum(FRIST), erinnertStufe: "VORAB" });
    expect(udb.audits).toEqual([]);
    expect(udb.links.at(-1)).toMatchObject({ mailStatus: "SKIPPED" });

    await bericht({ jetzt: new Date(JETZT.getTime() + TAG) });
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it("FAILED: kein Merker, kein Protokoll — der naechste Lauf versucht es erneut", async () => {
    const n = nachforderung(vorgang());
    link(n);
    mockSend.mockResolvedValueOnce({ status: "FAILED", detail: "SMTP weg" });
    const b = await bericht();
    expect(b).toMatchObject({ nichtZugestellt: 1, total: 0 });
    expect(n).toMatchObject({ erinnertFuerFrist: null, erinnertStufe: null });
    expect(udb.audits).toEqual([]);
    expect(udb.links.at(-1)).toMatchObject({ anlass: "ERINNERUNG_VORAB", mailStatus: "FAILED", mailDetail: "SMTP weg" });

    const morgen = await bericht({ jetzt: new Date(JETZT.getTime() + TAG) });
    expect(morgen.erinnerungen.vorab).toBe(1);
    expect(n).toMatchObject({ erinnertFuerFrist: datum(FRIST), erinnertStufe: "VORAB" });
  });

  it("SENT, Speichern scheitert zweimal (N2): zugestellt UND ein Fehler, Status NACHWEIS_FEHLT — nicht doppelt gezaehlt", async () => {
    const stumm = jest.spyOn(console, "error").mockImplementation(() => {});
    const v = vorgang();
    const n = nachforderung(v);
    link(n);
    // Das erste updateMany der Links nach dem Versand ist das Ergebnis der Mail (beide Versuche).
    const weg = () => Object.assign(new Error(`weg fuer ${v.email as string}`), { code: "P1001" });
    fp.unterlagenLink.updateMany.mockRejectedValueOnce(weg()).mockRejectedValueOnce(weg());

    const b = await bericht();
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(b).toMatchObject({ erinnerungen: { vorab: 1, fristtag: 0 }, total: 1, errors: 1, nichtZugestellt: 0 });
    expect(b.details).toEqual([
      { nachforderungId: n.id, modul: "ONBOARDING", schritt: "ERINNERUNG", anlass: "VORAB", status: "NACHWEIS_FEHLT" },
    ]);
    // Merker und Protokoll fehlen — genau das meldet der Bericht.
    expect(n).toMatchObject({ erinnertFuerFrist: null });
    expect(udb.audits).toEqual([]);
    expect(stumm).toHaveBeenCalledWith(`[Unterlagen-Lauf] ERINNERUNG (${n.id}): versendet, Nachweis nicht gespeichert.`);
    expect(JSON.stringify(stumm.mock.calls)).not.toContain(v.email as string);
    stumm.mockRestore();
  });

  it("Fristtag: am Tag der Frist, ein verpasster wird nicht nachgeholt", async () => {
    const n = nachforderung(vorgang(), { erinnertFuerFrist: datum(FRIST), erinnertStufe: "VORAB" });
    link(n);
    const amFristtag = new Date("2026-09-25T06:30:00.000Z");
    expect((await bericht({ jetzt: amFristtag })).erinnerungen).toEqual({ vorab: 0, fristtag: 1 });
    expect(mails()[0].payload).toMatchObject({ ist_fristtag: "ja", ist_vorab: "" });
    expect(n.erinnertStufe).toBe("FRISTTAG");

    const n2 = nachforderung(vorgang(), { erinnertFuerFrist: datum(FRIST), erinnertStufe: "VORAB" });
    link(n2);
    mockSend.mockClear();
    await bericht({ jetzt: new Date("2026-09-26T08:00:00.000Z") });
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("bedingter Merker: aendert HR die Frist waehrend des Versands, bleibt die neue unberuehrt", async () => {
    const n = nachforderung(vorgang());
    link(n);
    mockSend.mockImplementationOnce(async () => {
      n.frist = datum("2026-10-09");
      return { status: "SENT" };
    });
    await bericht();
    expect(n).toMatchObject({ frist: datum("2026-10-09"), erinnertFuerFrist: null, erinnertStufe: null });
  });

  it("aendert HR die Frist zwischen Lesen und Link, geht weder Link noch Mail hinaus", async () => {
    const n = nachforderung(vorgang());
    link(n);
    const vorher = udb.links.length;
    udb.vorTransaktion = () => {
      n.frist = datum("2026-10-09");
    };
    const b = await bericht();
    expect(mockSend).not.toHaveBeenCalled();
    expect(udb.links).toHaveLength(vorher);
    expect(b).toMatchObject({ uebersprungen: 1, total: 0 });
    expect(b.details[0]).toMatchObject({ schritt: "ERINNERUNG", status: "UEBERSPRUNGEN" });
  });

  it("setzt HR den Vorgang zwischen Lesen und Link auf EXPIRED, geht keine Mail hinaus", async () => {
    const v = vorgang();
    const n = nachforderung(v);
    link(n);
    udb.vorTransaktion = () => {
      v.status = "EXPIRED";
    };
    await bericht();
    expect(mockSend).not.toHaveBeenCalled();
    expect(udb.links.filter((l) => l.nachforderungId === n.id)).toHaveLength(1);
  });

  it("untaugliche Vorlage ({{link}} im Betreff): nichts geht hinaus, der Link steht mit Grund auf SKIPPED", async () => {
    const standard = DEFAULT_EMAIL_TEMPLATES.find((t) => t.event === UNTERLAGEN_EVENTS.ERINNERUNG)!;
    udb.emailVorlagen = [
      {
        event: UNTERLAGEN_EVENTS.ERINNERUNG,
        subject: "Erinnerung {{link}}",
        bodyHtml: standard.bodyHtml,
        bodyText: standard.bodyText,
        recipientTo: "",
        recipientCc: "",
        recipientBcc: "",
        recipientReplyTo: "",
        isActive: true,
      },
    ];
    const n = nachforderung(vorgang());
    link(n);
    const b = await bericht();
    expect(mockSend).not.toHaveBeenCalled();
    expect(b).toMatchObject({ mailUebersprungen: 1, total: 0 });
    expect(udb.links.at(-1)).toMatchObject({ anlass: "ERINNERUNG_VORAB", mailStatus: "SKIPPED" });
    expect(String(udb.links.at(-1)?.mailDetail)).toContain("gesperrten Platzhalter");
    // SKIPPED setzt den Merker (Hausregel) — morgen nicht jeden Tag erneut.
    expect(n.erinnertStufe).toBe("VORAB");
  });
});

// =============================================
// Nachholen
// =============================================

describe("Mail an die Person nachholen", () => {
  it("FAILED-Aufforderung: neuer Link mit gleichem Anlass, `ist_nachgeholt`, Protokoll — hoechstens drei Versuche", async () => {
    const v = vorgang();
    const n = nachforderung(v);
    const alt = link(n, { mailStatus: "FAILED", gesendetAm: null, mailDetail: "SMTP weg" });

    const b = await bericht();
    expect(b).toMatchObject({ nachgeholt: 1, total: 1 });
    expect(b.details).toEqual([
      { nachforderungId: n.id, modul: "ONBOARDING", schritt: "NACHHOLEN", anlass: "ANFORDERUNG", status: "SENT" },
    ]);
    const neu = udb.links.at(-1) as MitId;
    expect(neu).toMatchObject({ anlass: "ANFORDERUNG", nachholVersuche: 1, erstelltVonId: null, mailStatus: "SENT" });
    expect(mails()[0]).toMatchObject({
      event: UNTERLAGEN_EVENTS.ANGEFORDERT,
      an: v.email,
      payload: expect.objectContaining({ ist_nachgeholt: "ja", ist_erstmalig: "", frist_verstrichen: "" }),
    });
    expect(udb.audits).toEqual([
      expect.objectContaining({
        userId: null,
        action: UNTERLAGEN_AUDIT.MAIL_NACHGEHOLT,
        details: { nachforderungId: n.id, linkId: neu.id, vorherLinkId: alt.id, anlass: "ANFORDERUNG", versuch: 1 },
      }),
    ]);
  });

  it("drei gescheiterte Versuche, dann nicht mehr — SKIPPED wird nie nachgeholt", async () => {
    const n = nachforderung(vorgang());
    link(n, { mailStatus: "FAILED", gesendetAm: null });
    mockSend.mockResolvedValue({ status: "FAILED", detail: "SMTP weg" });
    for (let tag = 0; tag < 4; tag++) await bericht({ jetzt: new Date(JETZT.getTime() + tag * TAG) });
    expect(mockSend).toHaveBeenCalledTimes(3);
    expect(udb.links.map((l) => l.nachholVersuche)).toEqual([0, 1, 2, 3]);

    const n2 = nachforderung(vorgang());
    link(n2, { mailStatus: "SKIPPED", gesendetAm: null });
    mockSend.mockClear();
    await bericht();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("seit ueber einer Stunde AUSSTEHEND: der alte Link bekommt „kein Ergebnis“, ein neuer geht hinaus", async () => {
    const n = nachforderung(vorgang());
    const alt = link(n, { mailStatus: "AUSSTEHEND", gesendetAm: null, createdAt: vor(2 * STUNDE) });
    const frisch = nachforderung(vorgang());
    link(frisch, { mailStatus: "AUSSTEHEND", gesendetAm: null, createdAt: vor(30 * 60_000) });

    await bericht();
    expect(alt).toMatchObject({ mailStatus: "FAILED", mailDetail: MELDUNGEN.MAIL_OHNE_ERGEBNIS });
    expect(mails().map((m) => m.an)).toEqual([n.empfaenger]);
  });

  /** Ein Eintrag im Versandprotokoll, wie `sendEventEmail` ihn bei SENT schreibt. */
  function protokoll(teil: Zeile): Zeile {
    const e = { id: randomUUID(), status: "SENT", isTest: false, cc: null, bcc: null, subject: "", detail: null, ...teil };
    udb.emailLogs.push(e);
    return e;
  }

  it("N2 nach einer HR-Aktion: Das Versandprotokoll kennt die Mail — SENT nachgetragen, KEINE zweite Mail", async () => {
    // HR fordert an, die Mail geht hinaus, das Speichern scheitert zweimal:
    // HR liest „bitte nicht erneut senden", der Link steht auf AUSSTEHEND.
    const n = nachforderung(vorgang());
    const alt = link(n, { mailStatus: "AUSSTEHEND", gesendetAm: null, createdAt: vor(20 * STUNDE) });
    const versendet = new Date((alt.createdAt as Date).getTime() + 40_000);
    protokoll({ event: UNTERLAGEN_EVENTS.ANGEFORDERT, recipient: n.empfaenger, createdAt: versendet, messageId: "<m-9@example.org>" });

    const b = await bericht();
    expect(mockSend).not.toHaveBeenCalled();
    expect(alt).toMatchObject({ mailStatus: "SENT", gesendetAm: versendet, messageId: "<m-9@example.org>", mailDetail: null });
    expect(udb.links).toHaveLength(1);
    expect(b).toMatchObject({ nachgeholt: 0, errors: 0, total: 0 });
    expect(b.details).toEqual([
      { nachforderungId: n.id, modul: "ONBOARDING", schritt: "ERGEBNIS", anlass: "ANFORDERUNG", status: "SENT" },
    ]);
  });

  it("… nur dasselbe Ereignis an dieselbe Adresse im Fenster des Links zaehlt — sonst „kein Ergebnis“ und Nachholen", async () => {
    const n = nachforderung(vorgang());
    const alt = link(n, { mailStatus: "AUSSTEHEND", gesendetAm: null, createdAt: vor(20 * STUNDE) });
    const t = (alt.createdAt as Date).getTime();
    protokoll({ event: UNTERLAGEN_EVENTS.ANGEFORDERT, recipient: "jemand.anders@example.org", createdAt: new Date(t + 40_000) });
    protokoll({ event: UNTERLAGEN_EVENTS.ERINNERUNG, recipient: n.empfaenger, createdAt: new Date(t + 40_000) });
    protokoll({ event: UNTERLAGEN_EVENTS.ANGEFORDERT, recipient: n.empfaenger, createdAt: new Date(t - 60_000) });
    protokoll({ event: UNTERLAGEN_EVENTS.ANGEFORDERT, recipient: n.empfaenger, createdAt: new Date(t + 2 * STUNDE) });
    protokoll({ event: UNTERLAGEN_EVENTS.ANGEFORDERT, recipient: n.empfaenger, createdAt: new Date(t + 40_000), isTest: true });
    protokoll({ event: UNTERLAGEN_EVENTS.ANGEFORDERT, recipient: n.empfaenger, createdAt: new Date(t + 40_000), status: "FAILED" });

    const b = await bericht();
    expect(alt).toMatchObject({ mailStatus: "FAILED", mailDetail: MELDUNGEN.MAIL_OHNE_ERGEBNIS });
    expect(mails().map((m) => m.an)).toEqual([n.empfaenger]);
    expect(b.details.map((d) => [d.schritt, d.status])).toEqual([
      ["ERGEBNIS", "FAILED"],
      ["NACHHOLEN", "SENT"],
    ]);
  });

  it("… das Protokoll eines SPAETEREN Links der Nachforderung gehoert nicht zu diesem", async () => {
    const n = nachforderung(vorgang());
    const alt = link(n, { mailStatus: "AUSSTEHEND", gesendetAm: null, createdAt: vor(20 * STUNDE) });
    const spaeter = new Date((alt.createdAt as Date).getTime() + 10 * 60_000);
    link(n, { anlass: "FRISTAENDERUNG", mailStatus: "SENT", gesendetAm: spaeter, createdAt: spaeter });
    protokoll({ event: UNTERLAGEN_EVENTS.ANGEFORDERT, recipient: n.empfaenger, createdAt: new Date(spaeter.getTime() + 30_000) });

    await bericht();
    expect(alt).toMatchObject({ mailStatus: "FAILED", mailDetail: MELDUNGEN.MAIL_OHNE_ERGEBNIS });
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("… „frühere Links sperren“ an der nachgetragenen Mail: der Lauf sperrt die frueheren im selben Commit", async () => {
    const n = nachforderung(vorgang());
    const erste = link(n);
    const erneut = link(n, {
      anlass: "ERNEUT",
      mailStatus: "AUSSTEHEND",
      gesendetAm: null,
      fruehereSperren: true,
      createdAt: vor(20 * STUNDE),
    });
    protokoll({
      event: UNTERLAGEN_EVENTS.ANGEFORDERT,
      recipient: n.empfaenger,
      createdAt: new Date((erneut.createdAt as Date).getTime() + 5_000),
    });

    await bericht();
    expect(erneut).toMatchObject({ mailStatus: "SENT", entwertetAm: null });
    expect(erste).toMatchObject({ entwertetGrund: "GESPERRT", entwertetAm: JETZT });
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("haengende Erinnerung: SENT laut Protokoll bzw. „kein Ergebnis“ — nie mehr fuer immer „wird gesendet“", async () => {
    const n = nachforderung(vorgang(), { erinnertFuerFrist: datum(FRIST), erinnertStufe: "VORAB" });
    link(n);
    const erinnerung = link(n, {
      anlass: "ERINNERUNG_VORAB",
      erstelltVonId: null,
      mailStatus: "AUSSTEHEND",
      gesendetAm: null,
      createdAt: vor(2 * TAG),
    });
    const ohne = nachforderung(vorgang(), { erinnertFuerFrist: datum(FRIST), erinnertStufe: "VORAB" });
    link(ohne);
    const verloren = link(ohne, {
      anlass: "ERINNERUNG_VORAB",
      erstelltVonId: null,
      mailStatus: "AUSSTEHEND",
      gesendetAm: null,
      createdAt: vor(2 * TAG),
    });
    protokoll({
      event: UNTERLAGEN_EVENTS.ERINNERUNG,
      recipient: n.empfaenger,
      createdAt: new Date((erinnerung.createdAt as Date).getTime() + 5_000),
    });

    await bericht();
    expect(erinnerung).toMatchObject({ mailStatus: "SENT" });
    expect(verloren).toMatchObject({ mailStatus: "FAILED", mailDetail: MELDUNGEN.MAIL_OHNE_ERGEBNIS });
    // Erinnerungen holt Schritt 2 nicht nach — keine Mail.
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("dryRun: liest das Protokoll, schreibt nichts — die Planung sieht dasselbe wie der scharfe Lauf", async () => {
    const n = nachforderung(vorgang());
    const alt = link(n, { mailStatus: "AUSSTEHEND", gesendetAm: null, createdAt: vor(20 * STUNDE) });
    protokoll({
      event: UNTERLAGEN_EVENTS.ANGEFORDERT,
      recipient: n.empfaenger,
      createdAt: new Date((alt.createdAt as Date).getTime() + 40_000),
    });

    const b = await bericht({ dryRun: true });
    expect(alt).toMatchObject({ mailStatus: "AUSSTEHEND", gesendetAm: null });
    expect(schreibzugriffe()).toEqual([]);
    expect(b).toMatchObject({ nachgeholt: 0, total: 0 });
    expect(b.details).toEqual([
      { nachforderungId: n.id, modul: "ONBOARDING", schritt: "ERGEBNIS", anlass: "ANFORDERUNG", status: "GEPLANT" },
    ]);
  });

  it("nach der Frist mit `frist_verstrichen` und Linkende; nach dem Linkende nicht mehr", async () => {
    const n = nachforderung(vorgang(), { frist: datum("2026-09-18"), fristGemeldetFuer: datum("2026-09-18") });
    link(n, { anlass: "FRISTAENDERUNG", mailStatus: "FAILED", gesendetAm: null });
    await bericht();
    expect(mails()[0].payload).toMatchObject({ ist_nachgeholt: "ja", frist_verstrichen: "ja", link_gueltig_bis: "02.10.2026" });
    expect(udb.links.at(-1)).toMatchObject({ anlass: "FRISTAENDERUNG", gueltigBis: datum("2026-10-02") });

    const tot = nachforderung(vorgang(), { frist: datum("2026-09-01"), fristGemeldetFuer: datum("2026-09-01") });
    link(tot, { mailStatus: "FAILED", gesendetAm: null });
    mockSend.mockClear();
    await bericht();
    expect(mails().map((m) => m.an)).not.toContain(tot.empfaenger);
  });

  it("Zurueckweisung: dieselbe Position, dieselbe Begruendung — solange sie zurueckgewiesen ist", async () => {
    const n = nachforderung(vorgang(), {}, [{ typ: "PKV_NACHWEIS", bezeichnung: "PKV-Nachweis", status: "ZURUECKGEWIESEN", begruendung: "Bitte die aktuelle Bescheinigung.", einreichungen: 1 }]);
    const p = positionVon(n);
    link(n);
    link(n, { anlass: "ZURUECKWEISUNG", positionId: p.id, mailStatus: "FAILED", gesendetAm: null, createdAt: vor(3 * TAG) });

    await bericht();
    expect(mails()[0]).toMatchObject({
      event: UNTERLAGEN_EVENTS.ZURUECKGEWIESEN,
      payload: expect.objectContaining({
        ist_nachgeholt: "ja",
        unterlage: "PKV-Nachweis",
        begruendung: "Bitte die aktuelle Bescheinigung.",
        einreichung_nr: 1,
      }),
    });
    expect(udb.links.at(-1)).toMatchObject({ anlass: "ZURUECKWEISUNG", positionId: p.id, nachholVersuche: 1 });
  });

  it("„Link erneut senden“ mit „frühere Links sperren“ scheiterte: nach dem nachgeholten SENT sperrt der Lauf die frueheren", async () => {
    const n = nachforderung(vorgang());
    const erste = link(n);
    const erneut = link(n, {
      anlass: "ERNEUT",
      mailStatus: "FAILED",
      gesendetAm: null,
      fruehereSperren: true,
      createdAt: vor(3 * TAG),
    });

    const b = await bericht();
    expect(b).toMatchObject({ nachgeholt: 1, errors: 0 });
    const neu = udb.links.at(-1) as MitId;
    expect(neu).toMatchObject({ anlass: "ERNEUT", mailStatus: "SENT", fruehereSperren: true, entwertetAm: null });
    for (const alt of [erste, erneut]) {
      expect(alt).toMatchObject({ entwertetGrund: "GESPERRT", entwertetAm: JETZT });
    }
    // Sperren, Nachweis und Protokoll in EINER Transaktion — nach dem Versand.
    const a = udb.aufrufe;
    expect(a.lastIndexOf("$transaction")).toBeGreaterThan(a.indexOf("sendEventEmail"));
    expect(udb.audits).toEqual([
      expect.objectContaining({
        action: UNTERLAGEN_AUDIT.MAIL_NACHGEHOLT,
        details: expect.objectContaining({ linkId: neu.id, vorherLinkId: erneut.id, anlass: "ERNEUT", fruehereGesperrt: 2 }),
      }),
    ]);
  });

  it("… scheitert auch der Nachholversuch, bleibt alles gueltig — der neue Link traegt den Wunsch weiter", async () => {
    const n = nachforderung(vorgang());
    const erste = link(n);
    link(n, { anlass: "ERNEUT", mailStatus: "FAILED", gesendetAm: null, fruehereSperren: true, createdAt: vor(3 * TAG) });
    mockSend.mockResolvedValueOnce({ status: "FAILED", detail: "SMTP weg" });

    await bericht();
    expect(erste).toMatchObject({ entwertetAm: null });
    expect(udb.links.at(-1)).toMatchObject({ anlass: "ERNEUT", mailStatus: "FAILED", fruehereSperren: true, nachholVersuche: 1 });

    // Am naechsten Tag klappt es — dann wird gesperrt.
    await bericht({ jetzt: new Date(JETZT.getTime() + TAG) });
    expect(udb.links.at(-1)).toMatchObject({ mailStatus: "SENT", nachholVersuche: 2, entwertetAm: null });
    expect(erste.entwertetGrund).toBe("GESPERRT");
  });

  it("ohne Sperrwunsch bleiben die frueheren Links nach dem Nachholen gueltig (E-5)", async () => {
    const n = nachforderung(vorgang());
    const erste = link(n);
    link(n, { anlass: "ERNEUT", mailStatus: "FAILED", gesendetAm: null, createdAt: vor(3 * TAG) });
    await bericht();
    expect(erste).toMatchObject({ entwertetAm: null, entwertetGrund: null });
    expect(udb.audits.at(-1)?.details).not.toHaveProperty("fruehereGesperrt");
  });

  it("Zeitstempel beim Schreiben: legt HR waehrend des Laufs einen Link an, steht der des Laufs danach — morgen kein zweites Nachholen", async () => {
    // A wird zuerst bearbeitet (frueher angefordert); waehrend ihrer Mail
    // vergehen 20 Minuten, und HR sendet fuer B erneut — die Mail scheitert.
    const a = nachforderung(vorgang(), { angefordertAm: vor(9 * TAG) });
    link(a);
    const vb = vorgang();
    const b = nachforderung(vb, { angefordertAm: vor(8 * TAG), erinnertFuerFrist: datum(FRIST), erinnertStufe: "VORAB" });
    link(b);
    const hrZeit = new Date(JETZT.getTime() + 10 * 60_000);
    mockSend.mockImplementationOnce(async () => {
      jest.setSystemTime(new Date(JETZT.getTime() + 20 * 60_000));
      link(b, { anlass: "ERNEUT", mailStatus: "FAILED", gesendetAm: null, createdAt: hrZeit });
      return { status: "SENT" };
    });

    const ergebnis = await bericht();
    expect(ergebnis).toMatchObject({ erinnerungen: { vorab: 1 }, nachgeholt: 1 });
    const nachgeholt = udb.links.at(-1) as MitId;
    expect(nachgeholt).toMatchObject({ nachforderungId: b.id, anlass: "ERNEUT", mailStatus: "SENT" });
    expect((nachgeholt.createdAt as Date).getTime()).toBeGreaterThan(hrZeit.getTime());
    expect((nachgeholt.gesendetAm as Date).getTime()).toBeGreaterThan(hrZeit.getTime());

    // Am naechsten Tag ist die juengste Mail an B die zugestellte — nichts nachzuholen.
    mockSend.mockClear();
    jest.setSystemTime(new Date(JETZT.getTime() + TAG));
    await bericht({ jetzt: new Date(JETZT.getTime() + TAG) });
    expect(mails().map((m) => m.an)).not.toContain(vb.email);
  });
});

// =============================================
// HR-Meldungen
// =============================================

describe("HR-Meldungen", () => {
  it("„vollständig“ nachholen: bedingter Anspruch, Mail an HR, Merker bleibt — FAILED gibt den Anspruch zurueck", async () => {
    const n = nachforderung(vorgang(), { vollstaendigSeit: vor(2 * STUNDE) }, [
      { typ: "PKV_NACHWEIS", bezeichnung: "PKV-Nachweis", status: "EINGEREICHT" },
    ]);
    link(n);
    mockTrigger.mockResolvedValueOnce({ status: "FAILED", detail: "SMTP weg" });
    expect(await bericht()).toMatchObject({ nichtZugestellt: 1, hrMeldungen: { vollstaendigNachgeholt: 0 } });
    expect(n.vollstaendigGemeldetAm).toBeNull();

    const b = await bericht();
    expect(b).toMatchObject({ hrMeldungen: { vollstaendigNachgeholt: 1, fristVerstrichen: 0 }, total: 1 });
    expect(mockTrigger).toHaveBeenLastCalledWith(UNTERLAGEN_EVENTS.VOLLSTAENDIG, expect.any(Object));
    expect(n.vollstaendigGemeldetAm).toEqual(JETZT);
    expect(mockSend).not.toHaveBeenCalled();

    mockTrigger.mockClear();
    await bericht();
    expect(mockTrigger).not.toHaveBeenCalled();
  });

  it("„Frist verstrichen“: einmal je Fristwert, Merker und Protokoll — ohne Adresse, Link und Unterlagennamen", async () => {
    const v = vorgang();
    const n = nachforderung(v, { frist: datum("2026-09-18") });
    link(n);
    const b = await bericht();
    expect(b).toMatchObject({ hrMeldungen: { fristVerstrichen: 1 }, total: 1 });
    expect(n.fristGemeldetFuer).toEqual(datum("2026-09-18"));
    const [[event, payload]] = mockTrigger.mock.calls;
    expect(event).toBe(UNTERLAGEN_EVENTS.FRIST_VERSTRICHEN);
    expect(payload).toMatchObject({ nie_zugestellt: "", link_gueltig_bis: "02.10.2026", anzahl_offen: 1 });
    expect(payload).not.toHaveProperty("email");
    expect(payload).not.toHaveProperty("link");
    expect(JSON.stringify(payload)).not.toContain(v.email as string);
    expect(JSON.stringify(payload)).not.toContain("PKV");
    expect(udb.audits).toEqual([
      expect.objectContaining({ userId: null, action: UNTERLAGEN_AUDIT.HR_GEMELDET, details: { nachforderungId: n.id, event } }),
    ]);

    mockTrigger.mockClear();
    await bericht({ jetzt: new Date(JETZT.getTime() + TAG) });
    expect(mockTrigger).not.toHaveBeenCalled();
  });

  it("nie zugestellt: die Meldung geht trotzdem, mit `nie_zugestellt`", async () => {
    const n = nachforderung(vorgang(), { frist: datum("2026-09-18") });
    link(n, { mailStatus: "SKIPPED", gesendetAm: null });
    await bericht();
    expect(mockTrigger.mock.calls[0][1]).toMatchObject({ nie_zugestellt: "ja" });
  });

  it("holt der Lauf die Aufforderung im selben Durchgang erfolgreich nach, heisst es NICHT „nie zugestellt“", async () => {
    const n = nachforderung(vorgang(), { frist: datum("2026-09-18") });
    link(n, { mailStatus: "FAILED", gesendetAm: null, mailDetail: "SMTP weg" });
    const b = await bericht();
    expect(b).toMatchObject({ nachgeholt: 1, hrMeldungen: { fristVerstrichen: 1 } });
    expect(udb.links.map((l) => l.mailStatus)).toEqual(["FAILED", "SENT"]);
    expect(mockTrigger.mock.calls[0][0]).toBe(UNTERLAGEN_EVENTS.FRIST_VERSTRICHEN);
    expect(mockTrigger.mock.calls[0][1]).toMatchObject({ nie_zugestellt: "" });
  });

  it("… scheitert auch das Nachholen, bleibt es bei `nie_zugestellt`", async () => {
    const n = nachforderung(vorgang(), { frist: datum("2026-09-18") });
    link(n, { mailStatus: "FAILED", gesendetAm: null, mailDetail: "SMTP weg" });
    mockSend.mockResolvedValueOnce({ status: "FAILED", detail: "SMTP weg" });
    await bericht();
    expect(mockTrigger.mock.calls[0][1]).toMatchObject({ nie_zugestellt: "ja" });
  });

  it("„Frist verstrichen“ versendet, Speichern scheitert (N2): zugestellt UND ein Fehler", async () => {
    const stumm = jest.spyOn(console, "error").mockImplementation(() => {});
    const n = nachforderung(vorgang(), { frist: datum("2026-09-18") });
    link(n);
    // Das erste updateMany der Nachforderung ist das in der Transaktion von hrMeldungSenden.
    fp.unterlagenNachforderung.updateMany.mockRejectedValueOnce(Object.assign(new Error("weg"), { code: "P1001" }));
    const b = await bericht();
    expect(b).toMatchObject({ hrMeldungen: { fristVerstrichen: 1 }, total: 1, errors: 1 });
    expect(b.details).toEqual([
      { nachforderungId: n.id, modul: "ONBOARDING", schritt: "FRIST_VERSTRICHEN", status: "NACHWEIS_FEHLT" },
    ]);
    expect(n.fristGemeldetFuer).toBeNull();
    stumm.mockRestore();
  });

  it("SKIPPED setzt den Merker, FAILED nicht", async () => {
    const a = nachforderung(vorgang(), { frist: datum("2026-09-18"), angefordertAm: vor(9 * TAG) });
    link(a);
    const b = nachforderung(vorgang(), { frist: datum("2026-09-18"), angefordertAm: vor(8 * TAG) });
    link(b);
    mockTrigger.mockResolvedValueOnce({ status: "SKIPPED", detail: "Kein Empfaenger konfiguriert" });
    mockTrigger.mockResolvedValueOnce({ status: "FAILED", detail: "SMTP weg" });
    const ergebnis = await bericht();
    expect(ergebnis).toMatchObject({ mailUebersprungen: 1, nichtZugestellt: 1 });
    expect(a.fristGemeldetFuer).toEqual(datum("2026-09-18"));
    expect(b.fristGemeldetFuer).toBeNull();
  });
});

// =============================================
// Sperren und Bremse
// =============================================

describe("Sperre des Vorgangs, Laufsperre, SMTP-Bremse", () => {
  it("belegte Sperre: vormerken und am Ende EINMAL erneut versuchen", async () => {
    const va = vorgang();
    const a = nachforderung(va, { angefordertAm: vor(9 * TAG) });
    link(a);
    const vb = vorgang();
    const b = nachforderung(vb, { angefordertAm: vor(8 * TAG) });
    link(b);

    expect(unterlagenSperreNehmen("ONBOARDING", va.id)).toBe(true);
    // Waehrend der Mail an B endet die HR-Aktion auf A.
    mockSend.mockImplementationOnce(async () => {
      unterlagenSperreFreigeben("ONBOARDING", va.id);
      return { status: "SENT" };
    });
    const ergebnis = await bericht();
    expect(mails().map((m) => m.an)).toEqual([vb.email, va.email]);
    expect(ergebnis).toMatchObject({ erinnerungen: { vorab: 2 }, uebersprungen: 0 });
  });

  it("bleibt die Sperre belegt, wird der Vorgang heute ausgelassen und gezaehlt", async () => {
    const v = vorgang();
    const n = nachforderung(v);
    link(n);
    expect(unterlagenSperreNehmen("ONBOARDING", v.id)).toBe(true);
    try {
      const b = await bericht();
      expect(mockSend).not.toHaveBeenCalled();
      expect(b.uebersprungen).toBe(1);
      expect(b.details).toEqual([{ nachforderungId: n.id, modul: "ONBOARDING", schritt: "SPERRE", status: "UEBERSPRUNGEN" }]);
    } finally {
      unterlagenSperreFreigeben("ONBOARDING", v.id);
    }
    // Die Sperre des Laufs selbst ist wieder frei.
    expect(unterlagenSperreNehmen("ONBOARDING", v.id)).toBe(true);
    unterlagenSperreFreigeben("ONBOARDING", v.id);
  });

  it("Laufsperre: ein zweiter Aufruf waehrend des Laufs bekommt 409 — der Probelauf nicht", async () => {
    const n = nachforderung(vorgang());
    link(n);
    let freigeben: () => void = () => {};
    mockSend.mockImplementationOnce(
      () => new Promise<EventEmailResult>((fertig) => (freigeben = () => fertig({ status: "SENT" }))),
    );
    const erster = lauf();
    await bis(() => mockSend.mock.calls.length > 0);

    const zweiter = await lauf();
    expect(zweiter).toEqual({ status: 409, body: { error: LAUF_MELDUNGEN.LAEUFT_BEREITS } });
    const ueberRoute = await POST(anfrage());
    expect(ueberRoute.status).toBe(409);
    expect((await lauf({ dryRun: true })).status).toBe(200);

    freigeben();
    expect((await erster).status).toBe(200);
    expect((await lauf()).status).toBe(200);
  });

  it("SMTP-Bremse: nach drei FAILED in Folge keine Mail mehr — der Rest zaehlt als nicht zugestellt, aufgeraeumt wird trotzdem", async () => {
    const ns: MitId[] = [];
    for (let i = 0; i < 4; i++) {
      const n = nachforderung(vorgang(), { angefordertAm: vor((10 - i) * TAG) });
      link(n);
      ns.push(n);
    }
    const hr = nachforderung(vorgang(), { frist: datum("2026-09-18"), angefordertAm: vor(TAG) });
    link(hr);
    const abgewiesen = await datei(ns[3], { status: "ZURUECKGEWIESEN", uebermitteltAm: vor(40 * TAG), loeschenAb: vor(TAG) });
    mockSend.mockResolvedValue({ status: "FAILED", detail: "SMTP weg" });

    const b = await bericht();
    expect(mockSend).toHaveBeenCalledTimes(3);
    expect(mockTrigger).not.toHaveBeenCalled();
    expect(b.nichtZugestellt).toBe(5);
    expect(b.details.map((d) => d.status)).toEqual(["FAILED", "FAILED", "FAILED", "GEBREMST", "GEBREMST"]);
    expect(b.aufgeraeumt.dateien).toBe(1);
    expect(abgewiesen.dateiGeloeschtAm).toEqual(JETZT);
    expect(await gibtEs(`uploads/unterlagen/${ns[3].id}/${abgewiesen.id}.pdf`)).toBe(false);
  });

  it("ein Fehler in einem Schritt zaehlt als `errors` — die uebrigen Schritte und Nachforderungen laufen weiter", async () => {
    const stumm = jest.spyOn(console, "error").mockImplementation(() => {});
    const a = nachforderung(vorgang(), { angefordertAm: vor(9 * TAG) });
    link(a);
    const abgewiesen = await datei(a, { status: "ZURUECKGEWIESEN", uebermitteltAm: vor(40 * TAG), loeschenAb: vor(TAG) });
    const b = nachforderung(vorgang(), { angefordertAm: vor(8 * TAG) });
    link(b);
    fp.unterlagenLink.create.mockRejectedValueOnce(Object.assign(new Error(`kaputt ${String(a.empfaenger)}`), { code: "P1001" }));

    const ergebnis = await bericht();
    expect(ergebnis.errors).toBe(1);
    expect(ergebnis.details[0]).toEqual({ nachforderungId: a.id, modul: "ONBOARDING", schritt: "ERINNERUNG", status: "FEHLER" });
    expect(abgewiesen.dateiGeloeschtAm).toEqual(JETZT);
    expect(mails().map((m) => m.an)).toEqual([b.empfaenger]);
    // Im Log nur Praefix, ID und Code — nie die Meldung.
    expect(JSON.stringify(stumm.mock.calls)).not.toContain(String(a.empfaenger));
    expect(stumm).toHaveBeenCalledWith(`[Unterlagen-Lauf] ERINNERUNG (${a.id}) fehlgeschlagen:`, "P1001");
    stumm.mockRestore();
  });
});

// =============================================
// Z2: eingestellter Vorgang
// =============================================

describe("Z2 — Nachforderung eines EXPIRED-Vorgangs", () => {
  it("zieht zurueck wie „Zurückziehen“: Entwuerfe weg, eingereichte VERWORFEN (+30 Tage), keine Mail, Protokoll ohne userId", async () => {
    const v = vorgang({ status: "EXPIRED" });
    const n = nachforderung(v, { vollstaendigSeit: vor(STUNDE) }, [
      { typ: "PKV_NACHWEIS", bezeichnung: "PKV-Nachweis" },
      { typ: "AUFENTHALTSTITEL", bezeichnung: "Aufenthaltstitel", status: "EINGEREICHT" },
    ]);
    link(n);
    const entwurf = await datei(n);
    const eingereicht = await datei(n, { positionId: positionVon(n, 1).id, status: "EINGEREICHT", uebermitteltAm: vor(2 * TAG) });

    const b = await bericht();
    expect(b).toMatchObject({ zurueckgezogen: 1, total: 0, errors: 0 });
    expect(b.details).toEqual([{ nachforderungId: n.id, modul: "ONBOARDING", schritt: "ZURUECKZIEHEN", status: "ERLEDIGT" }]);
    expect(n).toMatchObject({
      status: "ZURUECKGEZOGEN",
      laufendSchluessel: null,
      zurueckgezogenAm: JETZT,
      zurueckgezogenVonId: null,
      vollstaendigSeit: null,
      vollstaendigGemeldetAm: null,
    });
    expect(udb.dateien.map((d) => d.id)).toEqual([eingereicht.id]);
    expect(await gibtEs(String(entwurf.speicherPfad))).toBe(false);
    expect(eingereicht).toMatchObject({ status: "VERWORFEN", loeschenAb: new Date(JETZT.getTime() + 30 * TAG) });
    expect(await gibtEs(String(eingereicht.speicherPfad))).toBe(true);
    expect(mockSend).not.toHaveBeenCalled();
    expect(mockTrigger).not.toHaveBeenCalled();
    expect(udb.audits).toEqual([
      expect.objectContaining({
        userId: null,
        onboardingId: v.id,
        action: UNTERLAGEN_AUDIT.ZURUECKGEZOGEN,
        details: { nachforderungId: n.id, entwuerfeGeloescht: 1, dateienVerworfen: 1, grund: LAUF_ZURUECKGEZOGEN_GRUND },
      }),
    ]);
    expect(LAUF_ZURUECKGEZOGEN_GRUND).toBe("VORGANG_EXPIRED");
  });
});

// =============================================
// Aufraeumen (4.5, N3)
// =============================================

describe("Aufraeumen", () => {
  it("zurueckgewiesen: Datei weg, Zeile bleibt als Nachweis mit `dateiGeloeschtAm` — auch bei einer erledigten Nachforderung", async () => {
    const v = vorgang();
    const n = nachforderung(v, { status: "ERLEDIGT", laufendSchluessel: null });
    const faellig = await datei(n, { status: "ZURUECKGEWIESEN", uebermitteltAm: vor(40 * TAG), loeschenAb: vor(TAG), begruendung: "unscharf" });
    const nochNicht = await datei(n, { status: "VERWORFEN", uebermitteltAm: vor(5 * TAG), loeschenAb: new Date(JETZT.getTime() + TAG) });
    const fehlt = await datei(n, { status: "VERWORFEN", uebermitteltAm: vor(40 * TAG), loeschenAb: vor(2 * TAG) }, false);

    const b = await bericht();
    expect(b.aufgeraeumt).toEqual({ dateien: 2, entwuerfe: 0, waisen: 0, fehler: 0 });
    expect(await gibtEs(`uploads/unterlagen/${n.id}/${faellig.id}.pdf`)).toBe(false);
    expect(faellig).toMatchObject({ status: "ZURUECKGEWIESEN", begruendung: "unscharf", dateiGeloeschtAm: JETZT, speicherPfad: null });
    expect(fehlt).toMatchObject({ dateiGeloeschtAm: JETZT, speicherPfad: null });
    expect(nochNicht).toMatchObject({ dateiGeloeschtAm: null });
    expect(await gibtEs(String(nochNicht.speicherPfad))).toBe(true);
    expect(udb.audits).toEqual([
      expect.objectContaining({
        userId: null,
        onboardingId: v.id,
        action: UNTERLAGEN_AUDIT.DATEIEN_GELOESCHT,
        // Nach Faelligkeit: die laenger faellige zuerst.
        details: { nachforderungId: n.id, dateiIds: [fehlt.id, faellig.id], entwurfIds: [], waisen: 0 },
      }),
    ]);
    expect(JSON.stringify(udb.audits)).not.toContain("scan.pdf");
  });

  it("Loeschen mit „fehler“ setzt kein `dateiGeloeschtAm` — der naechste Lauf versucht es erneut", async () => {
    const v = vorgang();
    const n = nachforderung(v, { status: "ERLEDIGT", laufendSchluessel: null });
    // Ein Pfad ausserhalb der Wurzel der Nachforderung: nie loeschen, immer „fehler".
    const fremd = `uploads/${v.id}/fremd.pdf`;
    await ablegen(fremd);
    const d = await datei(n, { status: "ZURUECKGEWIESEN", uebermitteltAm: vor(40 * TAG), loeschenAb: vor(TAG), speicherPfad: fremd }, false);

    const b = await bericht();
    expect(b.aufgeraeumt).toEqual({ dateien: 0, entwuerfe: 0, waisen: 0, fehler: 1 });
    expect(d).toMatchObject({ dateiGeloeschtAm: null, speicherPfad: fremd });
    expect(await gibtEs(fremd)).toBe(true);
    expect(udb.audits).toEqual([]);
    expect((await bericht()).aufgeraeumt.fehler).toBe(1);
  });

  it("Entwuerfe ab Linkende + 30 Tagen: erst die Zeile (bedingt), dann die Datei — eine verlaengerte Frist rettet sie", async () => {
    const alt = nachforderung(vorgang(), { frist: datum("2026-08-08"), fristGemeldetFuer: datum("2026-08-08") });
    link(alt);
    const entwurf = await datei(alt);
    const gerettet = nachforderung(vorgang(), { frist: datum("2026-08-09"), fristGemeldetFuer: datum("2026-08-09") });
    link(gerettet);
    const bleibt = await datei(gerettet);

    const b = await bericht();
    expect(b.aufgeraeumt).toMatchObject({ entwuerfe: 1, fehler: 0 });
    expect(udb.dateien.map((d) => d.id)).toEqual([bleibt.id]);
    expect(await gibtEs(String(entwurf.speicherPfad))).toBe(false);
    expect(await gibtEs(String(bleibt.speicherPfad))).toBe(true);
    const loeschen = udb.aufrufe.indexOf("unterlagenDatei.deleteMany");
    expect(loeschen).toBeGreaterThanOrEqual(0);
    expect(fp.unterlagenDatei.deleteMany.mock.calls[0][0].where).toMatchObject({ id: entwurf.id, status: "ENTWURF" });
    expect(udb.audits.at(-1)).toMatchObject({ action: UNTERLAGEN_AUDIT.DATEIEN_GELOESCHT, details: { entwurfIds: [entwurf.id] } });
  });

  it("die Entwurf-Loeschung verliert gegen ein gleichzeitiges Uebermitteln", async () => {
    const n = nachforderung(vorgang(), { frist: datum("2026-08-08"), fristGemeldetFuer: datum("2026-08-08") });
    link(n);
    const entwurf = await datei(n);
    const echt = fp.unterlagenDatei.deleteMany.getMockImplementation() as (a: unknown) => Promise<{ count: number }>;
    fp.unterlagenDatei.deleteMany.mockImplementationOnce(async (args: unknown) => {
      // Die Person klickt genau jetzt auf „Übermitteln".
      entwurf.status = "EINGEREICHT";
      entwurf.uebermitteltAm = JETZT;
      return echt(args);
    });

    const b = await bericht();
    expect(b.aufgeraeumt).toMatchObject({ entwuerfe: 0, fehler: 0 });
    expect(udb.dateien).toEqual([entwurf]);
    expect(await gibtEs(String(entwurf.speicherPfad))).toBe(true);
  });

  it("Waisen in beiden Ordnern — mit einer Datei-ID dieser Nachforderung und ohne Dokument; frische Dateien unter 24 h bleiben", async () => {
    const v = vorgang();
    const n = nachforderung(v, { status: "ERLEDIGT", laufendSchluessel: null });
    const angenommen = await datei(n, { status: "ANGENOMMEN", uebermitteltAm: vor(5 * TAG), speicherPfad: null }, false);
    const zurueckgenommen = await datei(n, { status: "EINGEREICHT", uebermitteltAm: vor(5 * TAG) });

    const waiseAlt = `uploads/unterlagen/${n.id}/${randomUUID()}.pdf`;
    const waiseFrisch = `uploads/unterlagen/${n.id}/${randomUUID()}.jpg`;
    await ablegen(waiseAlt, vor(25 * STUNDE));
    await ablegen(waiseFrisch, vor(STUNDE));

    // Im Vorgangsordner: die Kopie der Ruecknahme (kein Dokument) ist Waise,
    // die Datei des angenommenen Dokuments nicht, fremde Dateien schon gar nicht.
    const kopie = `uploads/${v.id}/${zurueckgenommen.id}.pdf`;
    const dokumentDatei = `uploads/${v.id}/${angenommen.id}.pdf`;
    const fragebogen = `uploads/${v.id}/1726-abc-pass.pdf`;
    const fremdeId = `uploads/${v.id}/${randomUUID()}.pdf`;
    for (const p of [kopie, dokumentDatei, fragebogen, fremdeId]) await ablegen(p, vor(STUNDE));
    ddb.dokumente.push(neuesDokument({ onboardingId: v.id, filePath: dokumentDatei, status: "APPROVED" }));

    const b = await bericht();
    expect(b.aufgeraeumt).toEqual({ dateien: 0, entwuerfe: 0, waisen: 2, fehler: 0 });
    expect(await gibtEs(waiseAlt)).toBe(false);
    expect(await gibtEs(waiseFrisch)).toBe(true);
    expect(await gibtEs(kopie)).toBe(false);
    for (const p of [dokumentDatei, fragebogen, fremdeId, String(zurueckgenommen.speicherPfad)]) {
      expect({ p, da: await gibtEs(p) }).toEqual({ p, da: true });
    }
    expect(udb.audits.at(-1)).toMatchObject({ action: UNTERLAGEN_AUDIT.DATEIEN_GELOESCHT, details: { waisen: 2 } });
  });

  it("verwaiste Nachforderungsordner (ohne Zeile): ab 24 h mitsamt Ordner — ein frischer bleibt", async () => {
    const altId = randomUUID();
    const frischId = randomUUID();
    await ablegen(`uploads/unterlagen/${altId}/${randomUUID()}.pdf`, vor(3 * TAG));
    await ablegen(`uploads/unterlagen/${frischId}/${randomUUID()}.pdf`, vor(STUNDE));
    const altOrdner = path.join(basis, "uploads", "unterlagen", altId);
    const frischOrdner = path.join(basis, "uploads", "unterlagen", frischId);
    await utimes(altOrdner, vor(3 * TAG), vor(3 * TAG));
    await utimes(frischOrdner, vor(STUNDE), vor(STUNDE));

    const b = await bericht();
    expect(b.aufgeraeumt.waisen).toBe(1);
    expect(await gibtEs(`uploads/unterlagen/${altId}`)).toBe(false);
    expect(await gibtEs(`uploads/unterlagen/${frischId}`)).toBe(true);
    expect(udb.audits).toEqual([]);
  });

  it("`uploads/unterlagen` nicht lesbar: 200 mit `errors`, die Erinnerung geht trotzdem — und KEIN Ordner gilt als verwaist", async () => {
    const stumm = jest.spyOn(console, "error").mockImplementation(() => {});
    const n = nachforderung(vorgang());
    link(n);
    // Ein alter Ordner OHNE Zeile und einer MIT (erledigte Nachforderung):
    // Ohne die Auflistung darf keiner von beiden als verwaist gelten.
    const ohneZeile = randomUUID();
    await ablegen(`uploads/unterlagen/${ohneZeile}/${randomUUID()}.pdf`, vor(3 * TAG));
    await utimes(path.join(basis, "uploads", "unterlagen", ohneZeile), vor(3 * TAG), vor(3 * TAG));
    const erledigt = nachforderung(vorgang(), { status: "ERLEDIGT", laufendSchluessel: null });
    const bleibt = await datei(erledigt, { status: "EINGEREICHT", uebermitteltAm: vor(5 * TAG) });
    await utimes(path.join(basis, "uploads", "unterlagen", erledigt.id), vor(3 * TAG), vor(3 * TAG));
    const auflisten = jest
      .spyOn(dateienModul, "nachforderungsOrdnerIds")
      .mockRejectedValueOnce(Object.assign(new Error(`EACCES ${basis}`), { code: "EACCES" }));
    try {
      const antwort = await POST(anfrage());
      expect(antwort.status).toBe(200);
      const b = (await antwort.json()) as LaufBericht;
      expect(b).toMatchObject({ erinnerungen: { vorab: 1 }, total: 1, errors: 1 });
      expect(mails().map((m) => m.an)).toEqual([n.empfaenger]);
      expect(await gibtEs(`uploads/unterlagen/${ohneZeile}`)).toBe(true);
      expect(await gibtEs(String(bleibt.speicherPfad))).toBe(true);
      // Im Log nur Praefix und Code — kein Pfad.
      expect(stumm).toHaveBeenCalledWith("[Unterlagen-Lauf] Ordner der Nachforderungen nicht gelesen:", "EACCES");
      expect(JSON.stringify(stumm.mock.calls)).not.toContain(basis);
    } finally {
      auflisten.mockRestore();
      stumm.mockRestore();
    }
  });

  it("scheitert erst das Lesen der verwaisten Ordner am Ende: 200, `errors` 1, der Bericht mit den Mails bleibt", async () => {
    const stumm = jest.spyOn(console, "error").mockImplementation(() => {});
    const n = nachforderung(vorgang());
    link(n);
    const verwaist = jest
      .spyOn(dateienModul, "verwaisteNachforderungsOrdner")
      .mockRejectedValueOnce(Object.assign(new Error("EIO"), { code: "EIO" }));
    try {
      const b = await bericht();
      expect(b).toMatchObject({ erinnerungen: { vorab: 1 }, total: 1, errors: 1 });
      expect(stumm).toHaveBeenCalledWith("[Unterlagen-Lauf] Verwaiste Ordner nicht gelesen:", "EIO");
    } finally {
      verwaist.mockRestore();
      stumm.mockRestore();
    }
  });

  it("N3: Faelligkeit steht in der Abfrage — 600 nicht faellige Dateien verdecken die eine faellige nicht", async () => {
    const voll = nachforderung(vorgang(), { status: "ERLEDIGT", laufendSchluessel: null });
    for (let i = 0; i < 600; i++) {
      udb.dateien.push(
        neueDatei({
          nachforderungId: voll.id,
          positionId: positionVon(voll).id,
          status: "ZURUECKGEWIESEN",
          speicherPfad: null,
          uebermitteltAm: vor(TAG),
          loeschenAb: new Date(JETZT.getTime() + (i + 1) * STUNDE),
        }),
      );
    }
    const n = nachforderung(vorgang(), { status: "ERLEDIGT", laufendSchluessel: null });
    const faellig = await datei(n, { status: "VERWORFEN", uebermitteltAm: vor(40 * TAG), loeschenAb: vor(STUNDE) });

    const b = await bericht();
    expect(b.aufgeraeumt.dateien).toBe(1);
    expect(faellig.dateiGeloeschtAm).toEqual(JETZT);
    const abfrage = fp.unterlagenDatei.findMany.mock.calls.find(([a]) => a.where?.loeschenAb)?.[0];
    expect(abfrage).toMatchObject({
      where: { status: { in: ["ZURUECKGEWIESEN", "VERWORFEN"] }, dateiGeloeschtAm: null, loeschenAb: { lte: JETZT } },
      orderBy: [{ loeschenAb: "asc" }, { id: "asc" }],
      take: 500,
    });
    // Die Nachforderung mit den 600 nicht faelligen wird gar nicht erst gelesen.
    const gelesen = fp.unterlagenNachforderung.findUnique.mock.calls.map(([a]) => a.where.id);
    expect(gelesen).toEqual([n.id]);
  });
});
