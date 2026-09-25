/**
 * Tests: oeffentliche API „Unterlagen nachfordern" (Paket 4, Schritt 5)
 *
 *   GET    /api/unterlagen/[token]
 *   POST   /api/unterlagen/[token]/positionen/[positionId]/dateien
 *   DELETE /api/unterlagen/[token]/dateien/[dateiId]
 *   PATCH  /api/unterlagen/[token]/positionen/[positionId]
 *   POST   /api/unterlagen/[token]/uebermitteln
 *
 * Die Routen sind duenne Huellen um src/lib/unterlagen-upload.ts; die Tests
 * rufen deshalb die ECHTEN Routen gegen die In-Memory-Datenbank
 * (src/__tests__/hilfen/unterlagen-fake-db.ts) auf. Nur wo es um den
 * Datenstrom selbst geht (Content-Length, gezaehlter Body), rufen sie den
 * Dienst mit einem eigenen Strom auf — so laesst sich zaehlen, wie viel
 * gelesen wurde.
 *
 * Der Fake kennt kein Rollback und keine Zeilensperre. Die Tests halten
 * deshalb zusaetzlich die REIHENFOLGE fest (`udb.aufrufe`) und spielen den
 * Wettlauf „HR zieht zurueck, waehrend die Person hochlaedt" ueber
 * `udb.vorTransaktion` nach (N1). Dateien landen in einem eigenen Verzeichnis
 * unter os.tmpdir(); `process.cwd()` zeigt fuer die Dauer der Tests dorthin.
 *
 * Methoden, die der gemeinsame Fake nicht kennt (`unterlagenPosition.findFirst`,
 * `unterlagenDatei.create`/`findFirst`), haengt dieser Test selbst an —
 * wie es abteilungs-fake-db.ts fuer Erweiterungen vorsieht.
 */

import type { EventEmailResult } from "@/lib/mailer";

type Pruefung = { allowed: boolean; remaining: number; retryAfterMs?: number };

const mockLimit = jest.fn((_name: string, _schluessel: string): Pruefung => ({ allowed: true, remaining: 10 }));
const mockTrigger = jest.fn(
  async (_event: string, _payload: Record<string, unknown>): Promise<EventEmailResult | null> => ({ status: "SENT" }),
);
const mockSend = jest.fn(async (): Promise<EventEmailResult> => ({ status: "SENT" }));
/** Sammelt die Aufgaben „nach der Antwort", statt sie auszufuehren. */
const mockNachDerAntwort = jest.fn((_aufgabe: () => Promise<unknown>, _bezeichnung?: string) => undefined);
/**
 * Je fs.writeFile-Aufruf wird hier eine Aufgabe entnommen und VOR dem echten
 * Schreiben ausgefuehrt — z. B. „ein gleichzeitiges Entfernen raeumt den leeren
 * Ordner ab" (Muster unterlagen-dateien.test.ts).
 */
let mockVorSchreiben: Array<() => Promise<unknown>> = [];
let mockSchreibVersuche = 0;
jest.mock("fs/promises", () => {
  const echt = jest.requireActual("fs/promises");
  return {
    ...echt,
    writeFile: async (...args: unknown[]) => {
      mockSchreibVersuche += 1;
      const vorher = mockVorSchreiben.shift();
      if (vorher) await vorher();
      return echt.writeFile(...args);
    },
  };
});

jest.mock("@/lib/db", () => ({
  prisma: jest.requireActual("../hilfen/unterlagen-fake-db").fakePrisma,
}));
jest.mock("@/lib/webhooks", () => ({
  triggerWebhooks: (e: string, p: Record<string, unknown>) => mockTrigger(e, p),
}));
jest.mock("@/lib/mailer", () => ({
  ...jest.requireActual("@/lib/mailer"),
  sendEventEmail: () => mockSend(),
}));
jest.mock("@/lib/rate-limit", () => ({
  ...jest.requireActual("@/lib/rate-limit"),
  createRateLimiter: (name: string) => ({ check: (schluessel: string) => mockLimit(name, schluessel) }),
  tokenRateLimiter: { check: (schluessel: string) => mockLimit("token", schluessel) },
}));
jest.mock("@/lib/nach-der-antwort", () => ({
  nachDerAntwort: (aufgabe: () => Promise<unknown>, bezeichnung?: string) => mockNachDerAntwort(aufgabe, bezeichnung),
}));

import { NextRequest } from "next/server";
import { createHash } from "crypto";
import { access, mkdtemp, readdir, rm, rmdir } from "fs/promises";
import os from "os";
import path from "path";
import {
  eindeutigkeitsFehler,
  fakePrisma,
  neueDatei,
  neueNachforderung,
  neuePosition,
  neuerUnterlagenLink,
  realmSicher,
  udb,
  udbLeeren,
  type Zeile,
} from "../hilfen/unterlagen-fake-db";
import { GET } from "@/app/api/unterlagen/[token]/route";
import { POST as hochladenRoute } from "@/app/api/unterlagen/[token]/positionen/[positionId]/dateien/route";
import { DELETE as entfernenRoute } from "@/app/api/unterlagen/[token]/dateien/[dateiId]/route";
import { PATCH as gueltigBisRoute } from "@/app/api/unterlagen/[token]/positionen/[positionId]/route";
import { POST as uebermittelnRoute } from "@/app/api/unterlagen/[token]/uebermitteln/route";
import {
  kontingentPruefen,
  MAX_JSON_BYTES,
  OEFFENTLICHE_KOPFZEILEN,
  oeffentlicherOnboardingVorgang,
  unterlagenDateiHochladen,
  UPLOAD_MELDUNGEN,
  type OnboardingOeffentlichZeile,
} from "@/lib/unterlagen-upload";
import { onboardingUnterlagenVorgang, type OnboardingUnterlagenQuelle } from "@/lib/unterlagen-onboarding";
import { ONBOARDING_STATUS } from "@/lib/onboarding-spuren";
import {
  MAX_BODY_BYTES,
  MAX_BYTES_JE_NACHFORDERUNG,
  MAX_DATEI_BYTES,
  MAX_DATEIEN_JE_NACHFORDERUNG,
  MAX_DATEIEN_JE_POSITION,
  MAX_UPLOADS_GESAMT,
  MELDUNGEN,
  UNTERLAGEN_AUDIT,
  UPLOAD_ACCEPT,
} from "@/lib/unterlagen";
import { UNTERLAGEN_EVENTS } from "@/lib/unterlagen-mail";
import { heuteInBerlin, kalendertagAlsDatum, tageSpaeter } from "@/lib/kalendertag";
import { hashToken } from "@/lib/token-hash";
import { DEFAULT_VERANTWORTLICHE_STELLE } from "@/lib/dsgvo";

// =============================================
// Fake-Erweiterungen dieses Tests
// =============================================

type FakeTabelle = Record<string, jest.Mock>;
const fp = fakePrisma as unknown as Record<string, FakeTabelle>;

fp.unterlagenPosition.findFirst = jest.fn(async (args: Zeile) => {
  udb.aufrufe.push("unterlagenPosition.findFirst");
  return ((await fp.unterlagenPosition.findMany(args)) as Zeile[])[0] ?? null;
});
fp.unterlagenDatei.findFirst = jest.fn(async (args: Zeile) => {
  udb.aufrufe.push("unterlagenDatei.findFirst");
  return ((await fp.unterlagenDatei.findMany(args)) as Zeile[])[0] ?? null;
});
fp.unterlagenDatei.create = jest.fn(async ({ data }: { data: Zeile }) => {
  udb.aufrufe.push("unterlagenDatei.create");
  if (udb.dateien.some((d) => d.id === data.id)) throw eindeutigkeitsFehler(["id"]);
  const d = neueDatei(data);
  udb.dateien.push(d);
  return realmSicher(d);
});

// =============================================
// Testdaten
// =============================================

const BASIS = "https://hr.example.org";
const TOKEN = "5d8e3f9a-4c5f-4e7d-9a0b-9c8d7e6f5a4b";
const TOKEN_ZWEI = "6e9f4a0b-5d6a-4f8e-8b1c-0d9e8f7a6b5c";
const NF_ID = "0b6c1f7e-2a3d-4c5b-9e8f-7a6b5c4d3e2f";
const ANDERE_NF = "1c7d2e8f-3b4e-4d6c-8f9a-8b7c6d5e4f3a";
const VORGANG_ID = "3f1c2a4e-5b6d-4e7f-8a9b-0c1d2e3f4a5b";
const ADRESSE = "anna.privat@example.org";
const IBAN = "DE89370400440532013000";

/** Kalendertag relativ zu heute (Berlin) als `@db.Date`-Wert. */
const tag = (n: number) => kalendertagAlsDatum(tageSpaeter(heuteInBerlin(new Date()), n));
const kalendertag = (n: number) => tageSpaeter(heuteInBerlin(new Date()), n);

const PDF = Buffer.from("%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n%%EOF\n", "latin1");
const PDF_AKTIV = Buffer.from("%PDF-1.7\n1 0 obj\n<< /OpenAction 2 0 R /J#53 (app.alert(1)) >>\nendobj\n%%EOF\n", "latin1");
const PDF_OHNE_ENDE = Buffer.from("%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\n", "latin1");
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
const HTML = Buffer.from("<html><script>alert(1)</script></html>");
const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");

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
    organization: {
      id: "org-1",
      name: "FES Minden",
      type: "GYMNASIUM",
      dsgvoVerantwortlicheName: "Freie Evangelische Schule Minden e.V.",
      dsgvoVerantwortlicheStrasse: "Kingsleyallee 6",
      dsgvoVerantwortlichePlz: "32425",
      dsgvoVerantwortlicheOrt: "Minden",
    },
    employeeId: null,
    personalData: {
      firstName: "Anna",
      lastName: "Beispiel",
      isComplete: true,
      birthDate: new Date("1990-05-01T00:00:00.000Z"),
      rvEntscheidung: null,
      aufenthaltstitelErforderlich: true,
      healthInsuranceType: "gesetzlich",
      severelyDisabled: false,
      iban: IBAN,
      children: [],
    },
    documents: [],
    ...teil,
  };
}

interface Szenario {
  n: Zeile;
  l: Zeile;
  positionen: Zeile[];
}

/** Eine laufende Nachforderung mit Link (TOKEN) und Positionen. */
function szenario(opts: { nf?: Zeile; link?: Zeile; positionen?: Zeile[] } = {}): Szenario {
  const n = neueNachforderung({
    id: NF_ID,
    onboardingId: VORGANG_ID,
    laufendSchluessel: `ONBOARDING:${VORGANG_ID}`,
    empfaenger: ADRESSE,
    empfaengerVorgang: ADRESSE,
    frist: tag(14),
    nachricht: "Bitte die Karte von beiden Seiten.",
    angefordertVonId: "u-hr",
    ...opts.nf,
  });
  udb.nachforderungen.push(n);
  const l = neuerUnterlagenLink({
    nachforderungId: n.id,
    tokenHash: hashToken(TOKEN),
    gueltigBis: tag(28),
    empfaenger: ADRESSE,
    mailStatus: "SENT",
    gesendetAm: new Date(),
    erstelltVonId: "u-hr",
    ...opts.link,
  });
  udb.links.push(l);
  const positionen = (
    opts.positionen ?? [
      { typ: "AUFENTHALTSTITEL", bezeichnung: "Aufenthaltstitel", fristpflichtig: true, sensibel: true },
    ]
  ).map((p, i) => {
    const z = neuePosition({ nachforderungId: n.id, reihenfolge: i, ...p });
    udb.positionen.push(z);
    return z;
  });
  return { n, l, positionen };
}

/** Eine Datei-Zeile (Standard: Entwurf) zu einer Position. */
function datei(position: Zeile, teil: Zeile = {}): Zeile {
  const d = neueDatei({
    positionId: position.id,
    nachforderungId: position.nachforderungId,
    anzeigeName: "vorderseite.pdf",
    ...teil,
  });
  udb.dateien.push(d);
  return d;
}

let ipZaehler = 0;
/** Je Anfrage eine eigene IP (Muster onboarding-tasks.test.ts). */
const ip = () => `10.0.${Math.floor(++ipZaehler / 250)}.${ipZaehler % 250}`;

const url = (pfad: string, token = TOKEN) => `${BASIS}/api/unterlagen/${token}${pfad}`;

function laden(token = TOKEN) {
  return GET(new NextRequest(url("", token), { headers: { "x-forwarded-for": ip() } }), {
    params: Promise.resolve({ token }),
  });
}

function hochladen(
  positionId: string,
  dateien: Array<File | string> | null,
  opts: { token?: string; headers?: Record<string, string> } = {},
) {
  const token = opts.token ?? TOKEN;
  const fd = new FormData();
  for (const d of dateien ?? []) fd.append("datei", d);
  return hochladenRoute(
    new NextRequest(url(`/positionen/${positionId}/dateien`, token), {
      method: "POST",
      body: fd,
      headers: { "x-forwarded-for": ip(), ...opts.headers },
    }),
    { params: Promise.resolve({ token, positionId }) },
  );
}

const alsDatei = (inhalt: Buffer, name = "scan.pdf", type = "application/pdf") =>
  new File([new Uint8Array(inhalt)], name, { type });

function entfernen(dateiId: string, token = TOKEN) {
  return entfernenRoute(
    new NextRequest(url(`/dateien/${dateiId}`, token), { method: "DELETE", headers: { "x-forwarded-for": ip() } }),
    { params: Promise.resolve({ token, dateiId }) },
  );
}

function jsonAnfrage(adresse: string, method: string, body: unknown, roh?: string) {
  return new NextRequest(adresse, {
    method,
    headers: { "x-forwarded-for": ip(), "content-type": "application/json" },
    body: roh ?? JSON.stringify(body),
  });
}

function gueltigBisSpeichern(positionId: string, body: unknown, opts: { token?: string; roh?: string } = {}) {
  const token = opts.token ?? TOKEN;
  return gueltigBisRoute(jsonAnfrage(url(`/positionen/${positionId}`, token), "PATCH", body, opts.roh), {
    params: Promise.resolve({ token, positionId }),
  });
}

function uebermitteln(body: unknown = {}, opts: { token?: string; roh?: string } = {}) {
  const token = opts.token ?? TOKEN;
  return uebermittelnRoute(jsonAnfrage(url("/uebermitteln", token), "POST", body, opts.roh), {
    params: Promise.resolve({ token }),
  });
}

/** Alle fuenf Routen mit demselben Token — fuer Pruefungen, die ueberall gelten. */
function alleRouten(token: string, positionId: string, dateiId: string): Array<[string, () => Promise<Response>]> {
  return [
    ["GET", () => laden(token)],
    ["Hochladen", () => hochladen(positionId, [alsDatei(PDF)], { token })],
    ["Entfernen", () => entfernen(dateiId, token)],
    ["Gültig bis", () => gueltigBisSpeichern(positionId, { gueltigBis: null }, { token })],
    ["Übermitteln", () => uebermitteln({}, { token })],
  ];
}

/** Ein ReadableStream, der mitzaehlt, wie viele Stuecke gelesen wurden (Muster file-upload.test.ts). */
function strom(stuecke: Uint8Array[]) {
  const zustand = { abgebrochen: false, gelesen: 0 };
  let i = 0;
  const body = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        if (i < stuecke.length) {
          zustand.gelesen += 1;
          controller.enqueue(stuecke[i++]);
        } else {
          controller.close();
        }
      },
      cancel() {
        zustand.abgebrochen = true;
      },
    },
    { highWaterMark: 0 },
  );
  return { body, zustand };
}

function pruefeKopfzeilen(res: Response): void {
  for (const [name, wert] of Object.entries(OEFFENTLICHE_KOPFZEILEN)) {
    expect({ name, wert: res.headers.get(name) }).toEqual({ name, wert });
  }
}

// =============================================
// Rahmen
// =============================================

let basis: string;
let cwd: jest.SpyInstance;
const alteUmgebung = { ...process.env };

beforeEach(async () => {
  jest.clearAllMocks();
  mockVorSchreiben = [];
  mockSchreibVersuche = 0;
  mockLimit.mockImplementation(() => ({ allowed: true, remaining: 10 }));
  mockTrigger.mockImplementation(async () => ({ status: "SENT" }));
  process.env.NEXT_PUBLIC_APP_URL = BASIS;
  udbLeeren();
  udb.vorgaenge = [vorgang()];
  udb.users = [{ id: "u-hr", firstName: "Erika", lastName: "Muster", email: "erika.muster@example.org", isActive: true }];
  basis = await mkdtemp(path.join(os.tmpdir(), "p4-upload-"));
  cwd = jest.spyOn(process, "cwd").mockReturnValue(basis);
});

afterEach(async () => {
  cwd.mockRestore();
  await rm(basis, { recursive: true, force: true });
  // Die oeffentlichen Wege schicken der Person nie selbst eine Mail.
  expect(mockSend).not.toHaveBeenCalled();
});

afterAll(() => {
  process.env = alteUmgebung;
});

const abs = (relativ: string) => path.join(basis, ...relativ.split("/"));
const existiert = (relativ: string) =>
  access(abs(relativ)).then(
    () => true,
    () => false,
  );
async function dateienAufPlatte(): Promise<string[]> {
  try {
    return await readdir(path.join(basis, "uploads", "unterlagen", NF_ID));
  } catch {
    return [];
  }
}

// =============================================
// Bremsen, Tokenformat, Suche (5.1, 5.2, 4.3 Nr. 1–2)
// =============================================

describe("IP-Bremse und Tokenformat — vor jeder Datenbankabfrage", () => {
  it("IP-Bremse: 429 mit Retry-After auf allen fuenf Wegen, ohne die Datenbank zu fragen", async () => {
    const { positionen } = szenario();
    const d = datei(positionen[0]);
    mockLimit.mockImplementation((name) =>
      name === "token" ? { allowed: false, remaining: 0, retryAfterMs: 12_300 } : { allowed: true, remaining: 1 },
    );
    for (const [weg, aufruf] of alleRouten(TOKEN, positionen[0].id as string, d.id as string)) {
      udb.aufrufe = [];
      const res = await aufruf();
      expect({ weg, status: res.status }).toEqual({ weg, status: 429 });
      expect(res.headers.get("Retry-After")).toBe("13");
      expect(await res.json()).toEqual({ error: MELDUNGEN.ZU_VIELE_ANFRAGEN });
      pruefeKopfzeilen(res);
      expect({ weg, aufrufe: udb.aufrufe }).toEqual({ weg, aufrufe: [] });
    }
    // Schluessel ist die IP des Aufrufers.
    expect(mockLimit.mock.calls.every(([name, schluessel]) => name === "token" && /^10\.0\./.test(schluessel))).toBe(
      true,
    );
  });

  it("Token in falscher Form: 404 ohne Datenbank — auf allen fuenf Wegen", async () => {
    szenario();
    for (const falsch of ["abc", TOKEN.toUpperCase(), "5d8e3f9a-4c5f-1e7d-9a0b-9c8d7e6f5a4b", `${TOKEN}x`]) {
      for (const [weg, aufruf] of alleRouten(falsch, udb.positionen[0].id as string, NF_ID)) {
        udb.aufrufe = [];
        const res = await aufruf();
        expect({ weg, falsch, status: res.status }).toEqual({ weg, falsch, status: 404 });
        expect(await res.json()).toEqual({ error: MELDUNGEN.LINK_UNGUELTIG, grund: "LINK_UNGUELTIG" });
        expect({ weg, aufrufe: udb.aufrufe }).toEqual({ weg, aufrufe: [] });
      }
    }
  });

  it("gesucht wird NUR ueber hashToken — der Klartext erreicht die Datenbank nie", async () => {
    szenario();
    const res = await laden();
    expect(res.status).toBe(200);
    expect(fp.unterlagenLink.findUnique).toHaveBeenCalledTimes(1);
    expect(fp.unterlagenLink.findUnique.mock.calls[0][0].where).toEqual({ tokenHash: hashToken(TOKEN) });
    const alleAufrufe = JSON.stringify(Object.values(fp).flatMap((t) => Object.values(t).map((m) => m.mock?.calls)));
    expect(alleAufrufe).not.toContain(TOKEN);
  });

  it("unbekannter Hash: 404 — derselbe Body wie bei falscher Form", async () => {
    szenario();
    const res = await laden(TOKEN_ZWEI);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: MELDUNGEN.LINK_UNGUELTIG, grund: "LINK_UNGUELTIG" });
  });

  it("Bremse je Nachforderung (nicht je Link): Hochladen 429 mit Retry-After, Schluessel = Nachforderung", async () => {
    const { n, positionen } = szenario();
    udb.links.push(neuerUnterlagenLink({ nachforderungId: n.id, tokenHash: hashToken(TOKEN_ZWEI), gueltigBis: tag(28) }));
    mockLimit.mockImplementation((name) =>
      name === "unterlagen-hochladen" ? { allowed: false, remaining: 0, retryAfterMs: 4_000 } : { allowed: true, remaining: 5 },
    );
    for (const token of [TOKEN, TOKEN_ZWEI]) {
      const res = await hochladen(positionen[0].id as string, [alsDatei(PDF)], { token });
      expect(res.status).toBe(429);
      expect(res.headers.get("Retry-After")).toBe("4");
    }
    const schluessel = mockLimit.mock.calls.filter(([name]) => name === "unterlagen-hochladen").map(([, s]) => s);
    expect(schluessel).toEqual([NF_ID, NF_ID]);
    expect(udb.dateien).toHaveLength(0);
    expect(await dateienAufPlatte()).toEqual([]);
  });

  it("uebrige Schreibwege haben ihre eigene Bremse je Nachforderung (Entfernen, Gültig bis, Übermitteln)", async () => {
    const { positionen } = szenario();
    const d = datei(positionen[0]);
    mockLimit.mockImplementation((name) =>
      name === "unterlagen-schreiben" ? { allowed: false, remaining: 0, retryAfterMs: 500 } : { allowed: true, remaining: 5 },
    );
    for (const res of [
      await entfernen(d.id as string),
      await gueltigBisSpeichern(positionen[0].id as string, { gueltigBis: null }),
      await uebermitteln({}),
    ]) {
      expect(res.status).toBe(429);
      expect(res.headers.get("Retry-After")).toBe("1");
    }
    expect(mockLimit.mock.calls.filter(([name]) => name === "unterlagen-schreiben").map(([, s]) => s)).toEqual([
      NF_ID,
      NF_ID,
      NF_ID,
    ]);
    // Die Leseroute kennt nur die IP-Bremse.
    mockLimit.mockClear();
    await laden();
    expect(mockLimit.mock.calls.map(([name]) => name)).toEqual(["token"]);
  });
});

// =============================================
// Gueltigkeit des Links (2.4, 5.5)
// =============================================

describe("Gueltigkeit des Links", () => {
  it("entwertet wegen Adresswechsel: 404 — nicht unterscheidbar von einem unbekannten Link", async () => {
    szenario({ link: { entwertetAm: new Date(), entwertetGrund: "ADRESSE" } });
    const res = await laden();
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: MELDUNGEN.LINK_UNGUELTIG, grund: "LINK_UNGUELTIG" });
  });

  it("ueber „frühere Links sperren“ entwertet: 410 „ersetzt“", async () => {
    szenario({ link: { entwertetAm: new Date(), entwertetGrund: "GESPERRT" } });
    const res = await laden();
    expect(res.status).toBe(410);
    expect(await res.json()).toEqual({ error: MELDUNGEN.LINK_ERSETZT, grund: "LINK_ERSETZT" });
  });

  it("410 nennt nie Name, Einrichtung oder Vorgangsnummer — nur die Meldung, beim Linkende das Datum", async () => {
    const faelle: Array<{ vorbereiten: () => void; erwartet: Record<string, unknown> }> = [
      {
        vorbereiten: () => szenario({ nf: { status: "ZURUECKGEZOGEN", laufendSchluessel: null } }),
        erwartet: { error: MELDUNGEN.ANFORDERUNG_ZURUECKGEZOGEN, grund: "ANFORDERUNG_ZURUECKGEZOGEN" },
      },
      {
        vorbereiten: () => {
          udb.vorgaenge = [vorgang({ status: "EXPIRED" })];
          szenario();
        },
        erwartet: { error: MELDUNGEN.VORGANG_EINGESTELLT, grund: "VORGANG_EINGESTELLT" },
      },
      {
        // Frist vor 20 Tagen: Linkende = Frist + 14 = vor 6 Tagen.
        vorbereiten: () => szenario({ nf: { frist: tag(-20) }, link: { gueltigBis: tag(-6) } }),
        erwartet: {
          error: `Dieser Link war bis ${kalendertag(-6).split("-").reverse().join(".")} gültig. Bitte wenden Sie sich an die Personalabteilung.`,
          grund: "LINK_ABGELAUFEN",
          linkGueltigBis: kalendertag(-6),
        },
      },
    ];
    for (const fall of faelle) {
      udbLeeren();
      udb.vorgaenge = [vorgang()];
      fall.vorbereiten();
      const res = await laden();
      expect(res.status).toBe(410);
      const body = await res.json();
      expect(body).toEqual(fall.erwartet);
      const text = JSON.stringify(body);
      for (const verboten of ["Anna", "Beispiel", "FES Minden", "2026-GYM-014", ADRESSE]) {
        expect(text).not.toContain(verboten);
      }
      pruefeKopfzeilen(res);
    }
  });

  it("ein nicht fortgeschriebener Link endet an seinem eigenen gueltigBis, auch wenn die Frist verlaengert wurde", async () => {
    szenario({ nf: { frist: tag(30) }, link: { gueltigBis: tag(-1) } });
    const res = await laden();
    expect(res.status).toBe(410);
    expect((await res.json()).grund).toBe("LINK_ABGELAUFEN");
  });

  it("ERLEDIGT innerhalb des Linkendes: 200 nur lesend; alle Schreibwege 409", async () => {
    const { positionen } = szenario({
      nf: { status: "ERLEDIGT", laufendSchluessel: null },
      positionen: [{ typ: "AUFENTHALTSTITEL", bezeichnung: "Aufenthaltstitel", fristpflichtig: true, status: "ANGENOMMEN" }],
    });
    const res = await laden();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ readOnly: true, meldung: MELDUNGEN.ALLES_GEPRUEFT });

    const hoch = await hochladen(positionen[0].id as string, [alsDatei(PDF)]);
    expect(hoch.status).toBe(409);
    expect(await hoch.json()).toEqual({ error: MELDUNGEN.ALLES_GEPRUEFT, grund: "ALLES_GEPRUEFT" });
    const ueb = await uebermitteln({});
    expect(ueb.status).toBe(409);
    expect((await ueb.json()).error).toBe(MELDUNGEN.ALLES_GEPRUEFT);
    expect(await dateienAufPlatte()).toEqual([]);
  });
});

// =============================================
// GET: Datenzuschnitt (5.3)
// =============================================

describe("GET /api/unterlagen/[token] — Datenzuschnitt", () => {
  it("liefert genau die Felder aus 5.3 — nie Adresse, HR-Kraft, Pruefsummen, Notizen oder eingereichte Dateinamen", async () => {
    const { positionen } = szenario({
      positionen: [
        { typ: "AUFENTHALTSTITEL", bezeichnung: "Aufenthaltstitel", fristpflichtig: true, sensibel: true, gueltigBisAngabe: tag(400) },
        {
          typ: null,
          bezeichnung: "Unterschriebener RV-Antrag",
          originalErforderlich: true,
          status: "ZURUECKGEWIESEN",
          begruendung: "Die Unterschrift fehlt.",
          einreichungen: 1,
        },
        { typ: "MASERNSCHUTZ", bezeichnung: "Masernschutz", sensibel: true, status: "EINGEREICHT", einreichungen: 1, uebermitteltAm: new Date("2026-09-20T08:00:00.000Z") },
        { typ: "PKV_NACHWEIS", bezeichnung: "PKV-Nachweis", status: "ENTFAELLT", entfaelltNotiz: "intern: liegt schon vor" },
      ],
    });
    const entwurf = datei(positionen[0], { anzeigeName: "titel-vorne.jpg", groesse: 2048, sha256: "a".repeat(64) });
    datei(positionen[1], { status: "ZURUECKGEWIESEN", anzeigeName: "rv-alt-geheim.pdf", uebermitteltAm: new Date() });
    datei(positionen[2], { status: "EINGEREICHT", anzeigeName: "impfpass-geheim.jpg", uebermitteltAm: new Date(), sha256: "b".repeat(64) });

    const res = await laden();
    expect(res.status).toBe(200);
    pruefeKopfzeilen(res);
    const body = await res.json();

    expect(Object.keys(body).sort()).toEqual(
      [
        "readOnly",
        "meldung",
        "name",
        "einrichtung",
        "vorgangsnummer",
        "frist",
        "fristLang",
        "linkGueltigBis",
        "fristSatz",
        "nachricht",
        "verantwortlicheStelle",
        "grenzen",
        "positionen",
      ].sort(),
    );
    expect(body).toMatchObject({
      readOnly: false,
      meldung: null,
      name: "Anna Beispiel",
      einrichtung: "FES Minden",
      vorgangsnummer: "2026-GYM-014",
      frist: kalendertag(14),
      // Vor der Frist nur EIN Datum: kein Linkende.
      linkGueltigBis: null,
      nachricht: "Bitte die Karte von beiden Seiten.",
      verantwortlicheStelle: "Freie Evangelische Schule Minden e.V., Kingsleyallee 6, 32425 Minden",
      grenzen: { maxDateiBytes: MAX_DATEI_BYTES, maxDateienJePosition: MAX_DATEIEN_JE_POSITION, accept: UPLOAD_ACCEPT },
    });
    expect(body.fristSatz).toMatch(/^Bitte laden Sie die Unterlagen bis \w+, \d{2}\.\d{2}\.\d{4} hoch\.$/);

    expect(body.positionen).toEqual([
      {
        id: positionen[0].id,
        bezeichnung: "Aufenthaltstitel",
        hinweis: null,
        originalErforderlich: false,
        fristpflichtig: true,
        gueltigBisAngabe: kalendertag(400),
        stand: "BEREIT",
        standText: "1 Datei bereit, noch nicht übermittelt",
        begruendung: null,
        uebermitteltAm: null,
        entwuerfe: [{ id: entwurf.id, name: "titel-vorne.jpg", groesse: 2048 }],
      },
      expect.objectContaining({
        id: positionen[1].id,
        originalErforderlich: true,
        stand: "ZURUECKGEWIESEN",
        begruendung: "Die Unterschrift fehlt.",
        entwuerfe: [],
      }),
      expect.objectContaining({
        id: positionen[2].id,
        stand: "UEBERMITTELT",
        begruendung: null,
        uebermitteltAm: "2026-09-20T08:00:00.000Z",
        entwuerfe: [],
      }),
      expect.objectContaining({ id: positionen[3].id, stand: "ENTFAELLT", standText: "Wird nicht mehr benötigt" }),
    ]);

    const text = JSON.stringify(body);
    for (const verboten of [
      ADRESSE,
      "erika",
      "Erika",
      "Muster",
      IBAN,
      "a".repeat(64),
      "b".repeat(64),
      hashToken(TOKEN),
      "intern: liegt schon vor",
      "rv-alt-geheim.pdf",
      "impfpass-geheim.jpg",
      "speicherPfad",
      "sha256",
    ]) {
      expect({ verboten, enthalten: text.includes(verboten) }).toEqual({ verboten, enthalten: false });
    }
    // Ein GET schreibt nichts — Mailscanner verbrauchen den Link nicht.
    expect(udb.aufrufe.filter((a) => /\.(create|update|updateMany|delete|deleteMany)$/.test(a))).toEqual([]);
  });

  it("nach der Frist nennt die Seite das Linkende; ohne eigene Angabe gilt die Standard-Stelle", async () => {
    udb.vorgaenge = [
      vorgang({ organization: { id: "org-1", name: "Kita Sonnenschein", type: "KITA" }, personalData: null }),
    ];
    szenario({ nf: { frist: tag(-3) }, link: { gueltigBis: tag(11) } });
    const body = await (await laden()).json();
    expect(body.linkGueltigBis).toBe(kalendertag(11));
    expect(body.fristSatz).toMatch(/^Die Frist ist abgelaufen\. Sie können die Unterlagen noch bis .+ hochladen\.$/);
    // Name aus dem Vorgang, wenn der Fragebogen keinen traegt.
    expect(body.name).toBe("Anna Beispiel");
    const d = DEFAULT_VERANTWORTLICHE_STELLE;
    expect(body.verantwortlicheStelle).toBe(`${d.name}, ${d.strasse}, ${d.plz} ${d.ort}`);
  });
});

// =============================================
// Hochladen (4.3)
// =============================================

describe("POST …/positionen/[positionId]/dateien — Hochladen", () => {
  it("legt einen Entwurf an: Datei unter uploads/unterlagen/<nf>/<id>.<ext>, Zeile, uploadsGesamt + 1, kein AuditLog", async () => {
    const { n, positionen } = szenario();
    const res = await hochladen(positionen[0].id as string, [alsDatei(PDF, "Titel vorne.pdf")]);
    expect(res.status).toBe(201);
    pruefeKopfzeilen(res);

    expect(udb.dateien).toHaveLength(1);
    const d = udb.dateien[0];
    expect(d).toMatchObject({
      positionId: positionen[0].id,
      nachforderungId: NF_ID,
      status: "ENTWURF",
      anzeigeName: "Titel vorne.pdf",
      mimeType: "application/pdf",
      groesse: PDF.length,
      sha256: sha(PDF),
      pdfHinweise: null,
      uebermitteltAm: null,
      speicherPfad: `uploads/unterlagen/${NF_ID}/${d.id}.pdf`,
    });
    expect(await existiert(d.speicherPfad as string)).toBe(true);
    expect(n.uploadsGesamt).toBe(1);
    expect(udb.audits).toEqual([]);

    const body = await res.json();
    expect(body).toEqual({
      position: expect.objectContaining({
        id: positionen[0].id,
        stand: "BEREIT",
        entwuerfe: [{ id: d.id, name: "Titel vorne.pdf", groesse: PDF.length }],
      }),
    });
    // Reihenfolge 4.3 Nr. 11–12: erst die Datei (oben belegt), dann sperren, neu pruefen, zaehlen, Zeile, Zaehler.
    const tx = udb.aufrufe.slice(udb.aufrufe.indexOf("$transaction"));
    const stelle = (name: string) => tx.indexOf(name);
    expect(stelle("unterlagenNachforderung.updateMany")).toBeGreaterThan(0);
    expect(stelle("unterlagenNachforderung.updateMany")).toBeLessThan(stelle("unterlagenLink.findUnique"));
    expect(stelle("unterlagenLink.findUnique")).toBeLessThan(stelle("unterlagenDatei.findMany"));
    expect(stelle("unterlagenDatei.findMany")).toBeLessThan(stelle("unterlagenDatei.create"));
    expect(tx.lastIndexOf("unterlagenNachforderung.updateMany")).toBeGreaterThan(stelle("unterlagenDatei.create"));
  });

  it("der Typ kommt allein aus den Bytes: JPEG namens x.hta wird x.jpg, HTML als „PDF“ wird 415", async () => {
    const { positionen } = szenario();
    const ok = await hochladen(positionen[0].id as string, [alsDatei(JPEG, "x.hta", "application/hta")]);
    expect(ok.status).toBe(201);
    expect(udb.dateien[0]).toMatchObject({ mimeType: "image/jpeg", anzeigeName: "x.jpg" });
    expect(udb.dateien[0].speicherPfad).toMatch(/\.jpg$/);

    const falsch = await hochladen(positionen[0].id as string, [alsDatei(HTML, "brief.pdf", "application/pdf")]);
    expect(falsch.status).toBe(415);
    expect(await falsch.json()).toEqual({ error: MELDUNGEN.DATEITYP_NICHT_ERLAUBT });
    expect(udb.dateien).toHaveLength(1);
  });

  it("PDF-Merkmale sind nur ein Hinweis fuer HR — die Datei wird angenommen", async () => {
    const { positionen } = szenario();
    const res = await hochladen(positionen[0].id as string, [alsDatei(PDF_AKTIV)]);
    expect(res.status).toBe(201);
    expect(udb.dateien[0].pdfHinweise).toBe("AKTIVE_INHALTE");
  });

  it("PDF ohne %%EOF, leere Datei: 400 mit Handlungsanweisung", async () => {
    const { positionen } = szenario();
    for (const inhalt of [PDF_OHNE_ENDE, Buffer.alloc(0)]) {
      const res = await hochladen(positionen[0].id as string, [alsDatei(inhalt)]);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: MELDUNGEN.DATEI_UNVOLLSTAENDIG });
    }
    expect(udb.dateien).toHaveLength(0);
    expect(await dateienAufPlatte()).toEqual([]);
  });

  it("nicht genau ein Feld `datei`: 400 (zwei Dateien, keine, nur Text)", async () => {
    const { positionen } = szenario();
    for (const eintraege of [[alsDatei(PDF), alsDatei(PDF)], [], ["kein-datei-feld"]]) {
      const res = await hochladen(positionen[0].id as string, eintraege);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: MELDUNGEN.UNGUELTIGE_EINGABE });
    }
    expect(udb.dateien).toHaveLength(0);
  });

  it("eine Datei ueber 9,5 MiB (Body noch unter 10 MiB): 413", async () => {
    const { positionen } = szenario();
    const gross = Buffer.alloc(MAX_DATEI_BYTES + 1, 0x20);
    PDF.copy(gross, 0);
    const res = await hochladen(positionen[0].id as string, [alsDatei(gross)]);
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: MELDUNGEN.DATEI_ZU_GROSS });
    expect(udb.dateien).toHaveLength(0);
  });

  it("kein multipart: 415 — noch vor der Suche nach dem Link", async () => {
    szenario();
    const res = await hochladenRoute(
      new NextRequest(url(`/positionen/${udb.positionen[0].id}/dateien`), {
        method: "POST",
        headers: { "x-forwarded-for": ip(), "content-type": "application/json" },
        body: "{}",
      }),
      { params: Promise.resolve({ token: TOKEN, positionId: udb.positionen[0].id as string }) },
    );
    expect(res.status).toBe(415);
    expect(udb.aufrufe).toEqual([]);
  });

  it("Content-Length ueber 10 MiB: 413 sofort — ohne ein Byte zu lesen und ohne Datenbank", async () => {
    szenario();
    const { body, zustand } = strom([new Uint8Array(1024)]);
    const antwort = await unterlagenDateiHochladen(
      {
        headers: new Headers({
          "x-forwarded-for": ip(),
          "content-type": "multipart/form-data; boundary=grenze",
          "content-length": String(MAX_BODY_BYTES + 1),
        }),
        body,
      },
      TOKEN,
      udb.positionen[0].id as string,
    );
    expect(antwort).toEqual({ status: 413, body: { error: MELDUNGEN.DATEI_ZU_GROSS } });
    expect(zustand.gelesen).toBe(0);
    expect(udb.aufrufe).toEqual([]);
  });

  it("ohne Content-Length wird gezaehlt und ueber der Grenze abgebrochen — nichts geschrieben", async () => {
    szenario();
    const mib = new Uint8Array(1024 * 1024);
    const { body, zustand } = strom(Array.from({ length: 12 }, () => mib));
    const antwort = await unterlagenDateiHochladen(
      {
        headers: new Headers({ "x-forwarded-for": ip(), "content-type": "multipart/form-data; boundary=grenze" }),
        body,
      },
      TOKEN,
      udb.positionen[0].id as string,
    );
    expect(antwort).toEqual({ status: 413, body: { error: MELDUNGEN.DATEI_ZU_GROSS } });
    expect(zustand.abgebrochen).toBe(true);
    expect(zustand.gelesen).toBeLessThan(12);
    expect(udb.dateien).toHaveLength(0);
    expect(await dateienAufPlatte()).toEqual([]);
  });

  it("Position einer anderen Nachforderung: 404 — derselbe Text wie eine unbekannte", async () => {
    szenario();
    const fremd = neuePosition({ nachforderungId: ANDERE_NF, bezeichnung: "Fremd" });
    udb.nachforderungen.push(neueNachforderung({ id: ANDERE_NF, onboardingId: VORGANG_ID }));
    udb.positionen.push(fremd);

    const a = await hochladen(fremd.id as string, [alsDatei(PDF)]);
    const b = await hochladen("7f0a5b1c-6e7b-4a9f-9c2d-1e0f9a8b7c6d", [alsDatei(PDF)]);
    const c = await hochladen("keine-uuid", [alsDatei(PDF)]);
    for (const res of [a, b, c]) {
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: MELDUNGEN.POSITION_NICHT_GEFUNDEN });
    }
    // Gesucht wird die Position immer mit der Nachforderung des Links.
    for (const [args] of fp.unterlagenPosition.findFirst.mock.calls) {
      expect(args.where.nachforderungId).toBe(NF_ID);
    }
    expect(udb.dateien).toHaveLength(0);
  });

  it("Position nicht offen: „Entfällt“ und übermittelt je mit eigenem Text (409)", async () => {
    const { positionen } = szenario({
      positionen: [
        { typ: "PKV_NACHWEIS", bezeichnung: "PKV", status: "ENTFAELLT" },
        { typ: "AUFENTHALTSTITEL", bezeichnung: "Titel", status: "EINGEREICHT" },
      ],
    });
    const a = await hochladen(positionen[0].id as string, [alsDatei(PDF)]);
    expect(a.status).toBe(409);
    expect(await a.json()).toEqual({ error: MELDUNGEN.UNTERLAGE_ENTFAELLT, grund: "UNTERLAGE_ENTFAELLT" });
    const b = await hochladen(positionen[1].id as string, [alsDatei(PDF)]);
    expect(b.status).toBe(409);
    expect(await b.json()).toEqual({ error: MELDUNGEN.UNTERLAGE_NICHT_OFFEN, grund: "NICHT_OFFEN" });
  });

  describe("Kontingente", () => {
    it("10 aktive Dateien je Position: 409 schon vor dem Lesen des Bodys; zurueckgewiesene zaehlen nicht", async () => {
      const { positionen } = szenario();
      for (let i = 0; i < MAX_DATEIEN_JE_POSITION - 1; i++) datei(positionen[0]);
      datei(positionen[0], { status: "ZURUECKGEWIESEN" });
      datei(positionen[0], { status: "VERWORFEN" });
      // 9 aktive: eine geht noch.
      expect((await hochladen(positionen[0].id as string, [alsDatei(PDF)])).status).toBe(201);

      const res = await hochladen(positionen[0].id as string, [alsDatei(PDF)]);
      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({ error: MELDUNGEN.ZU_VIELE_DATEIEN_POSITION, grund: "ZU_VIELE_DATEIEN_POSITION" });
      expect(udb.dateien.filter((d) => d.status === "ENTWURF")).toHaveLength(MAX_DATEIEN_JE_POSITION);
      expect(await dateienAufPlatte()).toHaveLength(1);

      // Die Vorpruefung liest den Body gar nicht erst.
      const { body, zustand } = strom([new Uint8Array(64)]);
      const antwort = await unterlagenDateiHochladen(
        { headers: new Headers({ "x-forwarded-for": ip(), "content-type": "multipart/form-data; boundary=g" }), body },
        TOKEN,
        positionen[0].id as string,
      );
      expect(antwort.status).toBe(409);
      expect(zustand.gelesen).toBe(0);
    });

    it("40 Dateien je Nachforderung und 200 Uploads ueber die Laufzeit: 409 Gesamtgrenze", async () => {
      const { n, positionen } = szenario({
        positionen: Array.from({ length: 5 }, (_, i) => ({ typ: null, bezeichnung: `Blatt ${i + 1}` })),
      });
      for (const p of positionen.slice(0, 4)) for (let i = 0; i < MAX_DATEIEN_JE_NACHFORDERUNG / 4; i++) datei(p, { status: "EINGEREICHT" });
      const voll = await hochladen(positionen[4].id as string, [alsDatei(PDF)]);
      expect(voll.status).toBe(409);
      expect(await voll.json()).toEqual({ error: MELDUNGEN.GESAMTGRENZE_ERREICHT, grund: "GESAMTGRENZE_ERREICHT" });

      udb.dateien = [];
      n.uploadsGesamt = MAX_UPLOADS_GESAMT;
      const laufzeit = await hochladen(positionen[4].id as string, [alsDatei(PDF)]);
      expect(laufzeit.status).toBe(409);
      expect((await laufzeit.json()).grund).toBe("GESAMTGRENZE_ERREICHT");
      expect(await dateienAufPlatte()).toEqual([]);
    });

    it("150 MiB je Nachforderung: die Transaktion zaehlt mit der echten Groesse und loescht die geschriebene Datei", async () => {
      const { n, positionen } = szenario({ positionen: [{ typ: null, bezeichnung: "A" }, { typ: null, bezeichnung: "B" }] });
      datei(positionen[0], { status: "EINGEREICHT", groesse: MAX_BYTES_JE_NACHFORDERUNG - 10 });
      const res = await hochladen(positionen[1].id as string, [alsDatei(PDF)]);
      expect(res.status).toBe(409);
      expect((await res.json()).grund).toBe("GESAMTGRENZE_ERREICHT");
      expect(udb.dateien).toHaveLength(1);
      expect(n.uploadsGesamt).toBe(0);
      // Die Vorpruefung liess den Upload durch (ein Byte passte noch), die Datei war geschrieben — und ist wieder weg.
      expect(await dateienAufPlatte()).toEqual([]);
    });

    it("zaehlt in der Transaktion NACH der Sperre — ein gleichzeitiger zehnter Upload gewinnt", async () => {
      const { positionen } = szenario();
      for (let i = 0; i < MAX_DATEIEN_JE_POSITION - 1; i++) datei(positionen[0]);
      udb.vorTransaktion = () => {
        datei(positionen[0]);
      };
      const res = await hochladen(positionen[0].id as string, [alsDatei(PDF)]);
      expect(res.status).toBe(409);
      expect((await res.json()).grund).toBe("ZU_VIELE_DATEIEN_POSITION");
      expect(await dateienAufPlatte()).toEqual([]);
    });

    it("kontingentPruefen: Grenzen genau an der Kante", () => {
      const eine = { positionId: "p", groesse: 1 };
      expect(kontingentPruefen({ dateien: Array(MAX_DATEIEN_JE_POSITION - 1).fill(eine), uploadsGesamt: 0 }, "p", 1)).toBeNull();
      expect(kontingentPruefen({ dateien: Array(MAX_DATEIEN_JE_POSITION).fill(eine), uploadsGesamt: 0 }, "p", 1)?.grund).toBe(
        "ZU_VIELE_DATEIEN_POSITION",
      );
      expect(kontingentPruefen({ dateien: [], uploadsGesamt: MAX_UPLOADS_GESAMT - 1 }, "p", 1)).toBeNull();
      expect(kontingentPruefen({ dateien: [], uploadsGesamt: MAX_UPLOADS_GESAMT }, "p", 1)?.grund).toBe("GESAMTGRENZE_ERREICHT");
      expect(
        kontingentPruefen({ dateien: [{ positionId: "q", groesse: MAX_BYTES_JE_NACHFORDERUNG - 5 }], uploadsGesamt: 0 }, "p", 5),
      ).toBeNull();
      expect(
        kontingentPruefen({ dateien: [{ positionId: "q", groesse: MAX_BYTES_JE_NACHFORDERUNG - 5 }], uploadsGesamt: 0 }, "p", 6)
          ?.grund,
      ).toBe("GESAMTGRENZE_ERREICHT");
    });
  });

  it("scheitert die Transaktion, wird die geschriebene Datei geloescht (500 ohne Token im Log)", async () => {
    const { positionen } = szenario();
    const log = jest.spyOn(console, "error").mockImplementation(() => undefined);
    fp.unterlagenDatei.create.mockRejectedValueOnce(Object.assign(new Error(`kaputt ${TOKEN}`), { code: "P1001" }));
    const res = await hochladen(positionen[0].id as string, [alsDatei(PDF, "geheim-name.pdf")]);
    expect(res.status).toBe(500);
    pruefeKopfzeilen(res);
    expect(await res.json()).toEqual({ error: UPLOAD_MELDUNGEN.SERVERFEHLER });
    expect(await dateienAufPlatte()).toEqual([]);
    expect(log).toHaveBeenCalledWith("[API] Unterlagen hochladen fehlgeschlagen:", "P1001");
    const geloggt = JSON.stringify(log.mock.calls);
    expect(geloggt).not.toContain(TOKEN);
    expect(geloggt).not.toContain("geheim-name");
    log.mockRestore();
  });

  describe("gleichzeitiges Entfernen raeumt den leeren Ordner ab (rmdir zwischen mkdir und writeFile)", () => {
    const ordner = () => path.join(basis, "uploads", "unterlagen", NF_ID);

    it("ein neuer Versuch legt den Ordner wieder an: 201 statt 500", async () => {
      const { positionen } = szenario();
      mockVorSchreiben.push(() => rmdir(ordner()));
      const res = await hochladen(positionen[0].id as string, [alsDatei(PDF)]);
      expect(res.status).toBe(201);
      expect(mockSchreibVersuche).toBe(2);
      expect(udb.dateien).toHaveLength(1);
      expect(await existiert(udb.dateien[0].speicherPfad as string)).toBe(true);
    });

    it("verschwindet er jedes Mal, bleibt es bei drei Versuchen: 500, keine Zeile, kein Zaehler", async () => {
      const { n, positionen } = szenario();
      const log = jest.spyOn(console, "error").mockImplementation(() => undefined);
      mockVorSchreiben.push(
        () => rmdir(ordner()),
        () => rmdir(ordner()),
        () => rmdir(ordner()),
      );
      const res = await hochladen(positionen[0].id as string, [alsDatei(PDF)]);
      expect(res.status).toBe(500);
      expect(mockSchreibVersuche).toBe(3);
      expect(udb.dateien).toEqual([]);
      expect(n.uploadsGesamt).toBe(0);
      expect(log).toHaveBeenCalledWith("[API] Unterlagen hochladen fehlgeschlagen:", "ENOENT");
      log.mockRestore();
    });
  });
});

// =============================================
// N1: nach der Sperre noch einmal pruefen
// =============================================

describe("N1 — HR handelt zwischen Linkpruefung und Sperre", () => {
  function zurueckziehenBeimSperren(n: Zeile): void {
    udb.vorTransaktion = () => {
      n.status = "ZURUECKGEZOGEN";
      n.laufendSchluessel = null;
    };
  }

  it("Zurueckziehen waehrend des Hochladens: 410, keine Zeile, die Datei ist wieder weg", async () => {
    const { n, positionen } = szenario();
    zurueckziehenBeimSperren(n);
    const res = await hochladen(positionen[0].id as string, [alsDatei(PDF)]);
    expect(res.status).toBe(410);
    expect(await res.json()).toEqual({
      error: MELDUNGEN.ANFORDERUNG_ZURUECKGEZOGEN,
      grund: "ANFORDERUNG_ZURUECKGEZOGEN",
    });
    expect(udb.dateien).toHaveLength(0);
    expect(n.uploadsGesamt).toBe(0);
    expect(await dateienAufPlatte()).toEqual([]);
  });

  it("Zurueckziehen waehrend Übermitteln, Entfernen und „Gültig bis“: 410, nichts geaendert", async () => {
    const { n, positionen } = szenario();
    const d = datei(positionen[0]);
    for (const aufruf of [
      () => uebermitteln({ gueltigBis: { [positionen[0].id as string]: "2030-01-31" } }),
      () => entfernen(d.id as string),
      () => gueltigBisSpeichern(positionen[0].id as string, { gueltigBis: "2030-01-31" }),
    ]) {
      n.status = "LAUFEND";
      zurueckziehenBeimSperren(n);
      const res = await aufruf();
      expect(res.status).toBe(410);
      expect((await res.json()).grund).toBe("ANFORDERUNG_ZURUECKGEZOGEN");
    }
    expect(positionen[0].status).toBe("ANGEFORDERT");
    expect(positionen[0].gueltigBisAngabe).toBeNull();
    expect(udb.dateien).toEqual([expect.objectContaining({ id: d.id, status: "ENTWURF" })]);
    expect(udb.audits).toEqual([]);
  });

  it("„frühere Links sperren“ waehrend des Hochladens: 410 „ersetzt“", async () => {
    const { l, positionen } = szenario();
    udb.vorTransaktion = () => {
      l.entwertetAm = new Date();
      l.entwertetGrund = "GESPERRT";
    };
    const res = await hochladen(positionen[0].id as string, [alsDatei(PDF)]);
    expect(res.status).toBe(410);
    expect((await res.json()).grund).toBe("LINK_ERSETZT");
    expect(await dateienAufPlatte()).toEqual([]);
  });

  it("„Entfällt“ waehrend des Hochladens: 409 mit dem Text der Person", async () => {
    const { positionen } = szenario();
    udb.vorTransaktion = () => {
      positionen[0].status = "ENTFAELLT";
    };
    const res = await hochladen(positionen[0].id as string, [alsDatei(PDF)]);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: MELDUNGEN.UNTERLAGE_ENTFAELLT, grund: "UNTERLAGE_ENTFAELLT" });
    expect(await dateienAufPlatte()).toEqual([]);
  });

  it("Vorgang wird waehrend des Übermittelns eingestellt: 410", async () => {
    const { positionen } = szenario();
    datei(positionen[0]);
    udb.vorTransaktion = () => {
      udb.vorgaenge[0].status = "EXPIRED";
    };
    const res = await uebermitteln({});
    expect(res.status).toBe(410);
    expect((await res.json()).grund).toBe("VORGANG_EINGESTELLT");
    expect(positionen[0].status).toBe("ANGEFORDERT");
  });
});

// =============================================
// Entfernen (2.3)
// =============================================

describe("DELETE …/dateien/[dateiId] — nur Entwuerfe", () => {
  async function entwurfHochladen(position: Zeile): Promise<Zeile> {
    expect((await hochladen(position.id as string, [alsDatei(PDF)])).status).toBe(201);
    return udb.dateien[udb.dateien.length - 1];
  }

  it("entfernt Zeile und Datei eines eigenen Entwurfs: erst die Zeile, dann die Datei", async () => {
    const { positionen } = szenario();
    const d = await entwurfHochladen(positionen[0]);
    expect(await existiert(d.speicherPfad as string)).toBe(true);
    udb.aufrufe = [];

    const res = await entfernen(d.id as string);
    expect(res.status).toBe(200);
    pruefeKopfzeilen(res);
    expect(await res.json()).toEqual({
      position: expect.objectContaining({ id: positionen[0].id, stand: "OFFEN", entwuerfe: [] }),
    });
    expect(udb.dateien).toEqual([]);
    expect(await existiert(d.speicherPfad as string)).toBe(false);
    expect(udb.aufrufe).toContain("unterlagenDatei.deleteMany");
    expect(udb.audits).toEqual([]);
  });

  it("eine uebermittelte Datei bleibt: 409", async () => {
    const { positionen } = szenario({ positionen: [{ typ: null, bezeichnung: "A", status: "EINGEREICHT" }] });
    const d = datei(positionen[0], { status: "EINGEREICHT", uebermitteltAm: new Date() });
    const res = await entfernen(d.id as string);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: MELDUNGEN.DATEI_NICHT_ENTFERNBAR, grund: "NICHT_ENTFERNBAR" });
    expect(udb.dateien).toHaveLength(1);
  });

  it("Datei einer anderen Nachforderung oder unbekannt: 404 mit demselben Text", async () => {
    szenario();
    const fremdePosition = neuePosition({ nachforderungId: ANDERE_NF });
    udb.nachforderungen.push(neueNachforderung({ id: ANDERE_NF, onboardingId: VORGANG_ID }));
    udb.positionen.push(fremdePosition);
    const fremd = datei(fremdePosition);
    for (const id of [fremd.id as string, "7f0a5b1c-6e7b-4a9f-9c2d-1e0f9a8b7c6d", "x"]) {
      const res = await entfernen(id);
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: MELDUNGEN.DATEI_NICHT_GEFUNDEN });
    }
    expect(udb.dateien).toHaveLength(1);
  });
});

// =============================================
// Gültig bis (PATCH)
// =============================================

describe("PATCH …/positionen/[positionId] — „Gültig bis“ zwischenspeichern", () => {
  it("speichert das Datum an der Position; null leert es (unbefristet oder unbekannt)", async () => {
    const { positionen } = szenario();
    const res = await gueltigBisSpeichern(positionen[0].id as string, { gueltigBis: "2029-03-31" });
    expect(res.status).toBe(200);
    pruefeKopfzeilen(res);
    expect(positionen[0].gueltigBisAngabe).toEqual(new Date("2029-03-31T00:00:00.000Z"));
    expect(await res.json()).toEqual({ position: expect.objectContaining({ gueltigBisAngabe: "2029-03-31" }) });

    const leer = await gueltigBisSpeichern(positionen[0].id as string, { gueltigBis: null });
    expect(leer.status).toBe(200);
    expect(positionen[0].gueltigBisAngabe).toBeNull();
    // Die Angabe landet NUR an der Position, nie im Vorgang.
    expect(udb.aufrufe).not.toContain("onboardingProcess.updateMany");
  });

  it("409 bei einer Unterlage ohne Ablaufdatum und bei einer, die nicht mehr offen ist", async () => {
    const { positionen } = szenario({
      positionen: [
        { typ: "PKV_NACHWEIS", bezeichnung: "PKV" },
        { typ: "AUFENTHALTSTITEL", bezeichnung: "Titel", fristpflichtig: true, status: "EINGEREICHT" },
      ],
    });
    const a = await gueltigBisSpeichern(positionen[0].id as string, { gueltigBis: "2029-03-31" });
    expect(a.status).toBe(409);
    expect(await a.json()).toEqual({ error: MELDUNGEN.KEIN_ABLAUFDATUM, grund: "KEIN_ABLAUFDATUM" });
    const b = await gueltigBisSpeichern(positionen[1].id as string, { gueltigBis: "2029-03-31" });
    expect(b.status).toBe(409);
    expect((await b.json()).error).toBe(MELDUNGEN.UNTERLAGE_NICHT_OFFEN);
    expect(positionen[1].gueltigBisAngabe).toBeNull();
  });

  it("400 bei kaputtem JSON, leerem Body, falscher Form und einem Datum mehr als 20 Jahre voraus", async () => {
    const { positionen } = szenario();
    const id = positionen[0].id as string;
    for (const res of [
      await gueltigBisSpeichern(id, null, { roh: "{\"gueltigBis\":" }),
      await gueltigBisSpeichern(id, null, { roh: "" }),
      await gueltigBisSpeichern(id, { gueltigBis: "31.03.2029" }),
      await gueltigBisSpeichern(id, { gueltigBis: "2099-01-01" }),
    ]) {
      expect(res.status).toBe(400);
      expect(typeof (await res.json()).error).toBe("string");
    }
    expect(positionen[0].gueltigBisAngabe).toBeNull();
  });

  it("413 bei einem JSON-Body ueber der Grenze — gezaehlt, nicht nur nach Content-Length", async () => {
    const { positionen } = szenario();
    const res = await gueltigBisSpeichern(positionen[0].id as string, null, {
      roh: JSON.stringify({ gueltigBis: null, fuell: "x".repeat(MAX_JSON_BYTES) }),
    });
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: UPLOAD_MELDUNGEN.ANFRAGE_ZU_GROSS });
  });
});

// =============================================
// Übermitteln (6.1, 2.1, 7)
// =============================================

describe("POST …/uebermitteln", () => {
  function zweiPositionen(): Szenario {
    return szenario({
      positionen: [
        { typ: "AUFENTHALTSTITEL", bezeichnung: "Aufenthaltstitel", fristpflichtig: true, sensibel: true },
        { typ: null, bezeichnung: "Unterschriebener RV-Antrag", status: "ZURUECKGEWIESEN", einreichungen: 1, begruendung: "Unterschrift fehlt" },
      ],
    });
  }

  it("speichert „Gültig bis“ in DERSELBEN Transaktion, reicht ein, setzt den Merker und protokolliert ohne IP und Dateinamen", async () => {
    const { n, positionen } = zweiPositionen();
    const a = datei(positionen[0], { anzeigeName: "titel-vorne.jpg", mimeType: "image/jpeg", groesse: 111, sha256: "c".repeat(64) });
    const b = datei(positionen[0], { anzeigeName: "titel-hinten.jpg", mimeType: "image/jpeg", groesse: 222, sha256: "d".repeat(64) });
    const c = datei(positionen[1], { anzeigeName: "rv-neu.pdf", groesse: 333, sha256: "e".repeat(64) });
    udb.aufrufe = [];

    const res = await uebermitteln({ gueltigBis: { [positionen[0].id as string]: "2029-06-30" } });
    expect(res.status).toBe(200);
    pruefeKopfzeilen(res);

    // Genau EINE Transaktion; darin erst sperren, dann „Gültig bis", dann einreichen, zuletzt das Protokoll.
    expect(udb.aufrufe.filter((x) => x === "$transaction")).toHaveLength(1);
    const tx = udb.aufrufe.slice(udb.aufrufe.indexOf("$transaction"));
    const erstes = (name: string) => tx.indexOf(name);
    expect(erstes("unterlagenNachforderung.updateMany")).toBe(1);
    expect(erstes("unterlagenPosition.updateMany")).toBeGreaterThan(erstes("unterlagenLink.findUnique"));
    expect(erstes("unterlagenPosition.updateMany")).toBeLessThan(erstes("unterlagenDatei.updateMany"));
    expect(erstes("unterlagenDatei.updateMany")).toBeLessThan(erstes("auditLog.create"));

    expect(positionen[0]).toMatchObject({
      status: "EINGEREICHT",
      einreichungen: 1,
      gueltigBisAngabe: new Date("2029-06-30T00:00:00.000Z"),
    });
    expect(positionen[0].uebermitteltAm).toBeInstanceOf(Date);
    expect(positionen[1]).toMatchObject({ status: "EINGEREICHT", einreichungen: 2 });
    for (const [d, nr] of [
      [a, 1],
      [b, 1],
      [c, 2],
    ] as const) {
      expect(d).toMatchObject({ status: "EINGEREICHT", einreichungNr: nr });
      expect(d.uebermitteltAm).toBeInstanceOf(Date);
    }
    // Nichts wartet mehr: Merker gesetzt, gemeldet noch nicht.
    expect(n.vollstaendigSeit).toBeInstanceOf(Date);
    expect(n.vollstaendigGemeldetAm).toBeNull();

    expect(udb.audits).toHaveLength(1);
    const audit = udb.audits[0];
    expect(audit).toMatchObject({
      userId: null,
      processType: "ONBOARDING",
      onboardingId: VORGANG_ID,
      action: UNTERLAGEN_AUDIT.UEBERMITTELT,
    });
    expect(audit.ipAddress).toBeUndefined();
    expect(audit.details).toEqual({
      nachforderungId: NF_ID,
      linkId: udb.links[0].id,
      vollstaendig: true,
      positionen: [
        {
          positionId: positionen[0].id,
          typ: "AUFENTHALTSTITEL",
          einreichungNr: 1,
          dateien: [
            { dateiId: a.id, groesse: 111, mimeType: "image/jpeg", sha256: "c".repeat(64) },
            { dateiId: b.id, groesse: 222, mimeType: "image/jpeg", sha256: "d".repeat(64) },
          ],
        },
        {
          positionId: positionen[1].id,
          typ: null,
          einreichungNr: 2,
          dateien: [{ dateiId: c.id, groesse: 333, mimeType: "application/pdf", sha256: "e".repeat(64) }],
        },
      ],
    });
    const protokoll = JSON.stringify(audit);
    for (const verboten of ["titel-vorne", "titel-hinten", "rv-neu", "10.0.", TOKEN, ADRESSE]) {
      expect(protokoll).not.toContain(verboten);
    }

    const body = await res.json();
    expect(body.uebermittelt).toBe(2);
    expect(body.stand.positionen.map((p: { stand: string }) => p.stand)).toEqual(["UEBERMITTELT", "UEBERMITTELT"]);
    // Die Namen eingereichter Dateien stehen auch in der Antwort nicht.
    expect(JSON.stringify(body)).not.toContain("titel-vorne");
  });

  it("die HR-Meldung geht NACH der Antwort — die Antwort wartet nicht auf die Mail", async () => {
    const { n, positionen } = zweiPositionen();
    datei(positionen[0]);
    datei(positionen[1]);

    const res = await uebermitteln({});
    expect(res.status).toBe(200);
    expect(mockNachDerAntwort).toHaveBeenCalledTimes(1);
    expect(mockNachDerAntwort.mock.calls[0][1]).toBe("Unterlagen: HR-Meldung");
    // Bis hierher: keine Mail, kein Anspruch.
    expect(mockTrigger).not.toHaveBeenCalled();
    expect(n.vollstaendigGemeldetAm).toBeNull();

    // Next.js fuehrt die Aufgabe nach der Antwort aus.
    await mockNachDerAntwort.mock.calls[0][0]();
    expect(mockTrigger).toHaveBeenCalledTimes(1);
    expect(mockTrigger.mock.calls[0][0]).toBe(UNTERLAGEN_EVENTS.VOLLSTAENDIG);
    expect(n.vollstaendigGemeldetAm).toBeInstanceOf(Date);
    const payload = JSON.stringify(mockTrigger.mock.calls[0][1]);
    expect(payload).not.toContain(ADRESSE);
    expect(payload).not.toContain(TOKEN);
  });

  it("nach dem Commit gibt es keinen Datenbankzugriff mehr — ein Aussetzer danach wird nie zur 500 (auch beim Doppelklick)", async () => {
    const { positionen } = zweiPositionen();
    datei(positionen[0]);
    datei(positionen[1]);
    const tx = fakePrisma.$transaction as jest.Mock;
    const echt = tx.getMockImplementation() as (fn: (t: unknown) => unknown) => Promise<unknown>;
    const mitCommitMarke = async (fn: (t: unknown) => unknown) => {
      const wert = await echt(fn);
      udb.aufrufe.push("$commit");
      return wert;
    };

    for (const erwartet of [2, 0]) {
      udb.aufrufe = [];
      tx.mockImplementationOnce(mitCommitMarke);
      const res = await uebermitteln({});
      expect(res.status).toBe(200);
      const commit = udb.aufrufe.indexOf("$commit");
      expect(commit).toBeGreaterThan(0);
      // Alles, was werfen koennte, lief VOR dem Commit.
      expect({ erwartet, nachDemCommit: udb.aufrufe.slice(commit + 1) }).toEqual({ erwartet, nachDemCommit: [] });
      const body = await res.json();
      expect(body.uebermittelt).toBe(erwartet);
      expect(body.stand.positionen.map((p: { stand: string }) => p.stand)).toEqual(["UEBERMITTELT", "UEBERMITTELT"]);
    }
    // Die HR-Meldung wurde beim ersten Mal eingeplant, beim Doppelklick nicht.
    expect(mockNachDerAntwort).toHaveBeenCalledTimes(1);
  });

  it("scheitert die HR-Mail (FAILED), wird der Anspruch zurueckgesetzt — der Lauf holt nach", async () => {
    const { n, positionen } = zweiPositionen();
    datei(positionen[0]);
    datei(positionen[1]);
    mockTrigger.mockImplementationOnce(async () => ({ status: "FAILED", detail: "SMTP nicht erreichbar" }));

    expect((await uebermitteln({})).status).toBe(200);
    await mockNachDerAntwort.mock.calls[0][0]();
    expect(mockTrigger).toHaveBeenCalledTimes(1);
    expect(n.vollstaendigSeit).toBeInstanceOf(Date);
    expect(n.vollstaendigGemeldetAm).toBeNull();
  });

  it("wartet danach noch etwas auf die Person, gibt es keine HR-Meldung (teilweises Übermitteln)", async () => {
    const { n, positionen } = zweiPositionen();
    datei(positionen[1]);
    const res = await uebermitteln({});
    expect(res.status).toBe(200);
    expect((await res.json()).uebermittelt).toBe(1);
    expect(positionen[0].status).toBe("ANGEFORDERT");
    expect(positionen[1].status).toBe("EINGEREICHT");
    expect(n.vollstaendigSeit).toBeNull();
    expect(mockNachDerAntwort).not.toHaveBeenCalled();
    expect(udb.audits[0].details).toMatchObject({ vollstaendig: false });
  });

  it("Doppelklick: das zweite Übermitteln antwortet 200 mit dem aktuellen Stand und schreibt nichts", async () => {
    const { positionen } = zweiPositionen();
    datei(positionen[0]);
    datei(positionen[1]);
    expect((await uebermitteln({})).status).toBe(200);
    expect(udb.audits).toHaveLength(1);

    const zweites = await uebermitteln({ gueltigBis: { [positionen[0].id as string]: "2029-06-30" } });
    expect(zweites.status).toBe(200);
    const body = await zweites.json();
    expect(body.uebermittelt).toBe(0);
    expect(body.stand.positionen.map((p: { stand: string }) => p.stand)).toEqual(["UEBERMITTELT", "UEBERMITTELT"]);
    expect(udb.audits).toHaveLength(1);
    expect(positionen[0].einreichungen).toBe(1);
    // Die Angabe zur schon eingereichten Unterlage wird uebergangen, nicht geschrieben.
    expect(positionen[0].gueltigBisAngabe).toBeNull();
    expect(mockNachDerAntwort).toHaveBeenCalledTimes(1);
  });

  it("409 nur, wenn nie etwas bereit war", async () => {
    szenario();
    const res = await uebermitteln({});
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: MELDUNGEN.NICHTS_ZU_UEBERMITTELN, grund: "NICHTS_BEREIT" });
    expect(udb.audits).toEqual([]);
  });

  it("„Gültig bis“ ist optional — auch eine fristpflichtige Unterlage geht ohne Datum hinaus (Z1)", async () => {
    const { positionen } = szenario();
    datei(positionen[0]);
    const res = await uebermitteln({});
    expect(res.status).toBe(200);
    expect(positionen[0]).toMatchObject({ status: "EINGEREICHT", gueltigBisAngabe: null });
  });

  it("Angaben „Gültig bis“: fremde Position 404, ohne Ablaufdatum 409, unmoegliches Datum 400 — nichts eingereicht", async () => {
    const { positionen } = szenario({
      positionen: [
        { typ: "AUFENTHALTSTITEL", bezeichnung: "Titel", fristpflichtig: true },
        { typ: "PKV_NACHWEIS", bezeichnung: "PKV" },
      ],
    });
    datei(positionen[0]);
    const faelle: Array<[Record<string, string | null>, number]> = [
      [{ "7f0a5b1c-6e7b-4a9f-9c2d-1e0f9a8b7c6d": "2029-01-01" }, 404],
      [{ [positionen[1].id as string]: "2029-01-01" }, 409],
      [{ [positionen[0].id as string]: "2099-01-01" }, 400],
    ];
    for (const [gueltigBis, status] of faelle) {
      const res = await uebermitteln({ gueltigBis });
      expect(res.status).toBe(status);
    }
    expect(positionen[0].status).toBe("ANGEFORDERT");
    expect(udb.audits).toEqual([]);
  });

  it("kaputtes JSON oder leerer Body: 400, nie eine Standardaktion", async () => {
    const { positionen } = szenario();
    datei(positionen[0]);
    for (const roh of ["", "{\"gueltigBis\":", "[]", "null"]) {
      const res = await uebermitteln(undefined, { roh });
      expect(res.status).toBe(400);
    }
    expect(positionen[0].status).toBe("ANGEFORDERT");
  });
});

// =============================================
// Adresswechsel: nur die eigenen Entwuerfe (5.3, 2.4)
// =============================================

describe("Adresswechsel — der neue Link sieht nur die eigenen Entwuerfe", () => {
  // HR hat die Adresse vertippt, die Falsche hat ueber ihren Link hochgeladen;
  // dann „erneut senden" an die richtige Adresse: alter Link ADRESSE, neuer = TOKEN.
  const WECHSEL = new Date(Date.now() - 60 * 60 * 1000);
  const VORHER = new Date(WECHSEL.getTime() - 10 * 60 * 1000);
  const NACHHER = new Date(WECHSEL.getTime() + 10 * 60 * 1000);

  function nachAdresswechsel(opts: Parameters<typeof szenario>[0] = {}): Szenario {
    const s = szenario(opts);
    udb.links.push(
      neuerUnterlagenLink({
        nachforderungId: s.n.id,
        tokenHash: hashToken(TOKEN_ZWEI),
        gueltigBis: tag(28),
        empfaenger: "falsch@example.org",
        entwertetAm: WECHSEL,
        entwertetGrund: "ADRESSE",
      }),
    );
    return s;
  }

  it("GET zeigt nur die nach dem letzten Wechsel hochgeladenen Entwuerfe — nie die Namen der Falschen", async () => {
    const { n, positionen } = nachAdresswechsel();
    // Ein frueherer Wechsel zaehlt nicht: es gilt der LETZTE.
    udb.links.push(
      neuerUnterlagenLink({
        nachforderungId: n.id,
        gueltigBis: tag(28),
        entwertetAm: new Date(VORHER.getTime() - 60_000),
        entwertetGrund: "ADRESSE",
      }),
    );
    // Eine Sperre ueber „frühere Links sperren" (GESPERRT) verschiebt die Grenze nicht.
    udb.links.push(
      neuerUnterlagenLink({ nachforderungId: n.id, gueltigBis: tag(28), entwertetAm: NACHHER, entwertetGrund: "GESPERRT" }),
    );
    datei(positionen[0], { anzeigeName: "fremd-geheim.pdf", hochgeladenAm: VORHER });
    // Zwischen dem Wechsel und der Sperre hochgeladen — bleibt sichtbar.
    const eigen = datei(positionen[0], { anzeigeName: "titel-vorne.pdf", hochgeladenAm: new Date(WECHSEL.getTime() + 60_000) });

    const res = await laden();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.positionen[0]).toMatchObject({
      stand: "BEREIT",
      standText: "1 Datei bereit, noch nicht übermittelt",
      entwuerfe: [{ id: eigen.id, name: "titel-vorne.pdf", groesse: 1000 }],
    });
    expect(JSON.stringify(body)).not.toContain("fremd-geheim");
    // Der alte Link bleibt 404.
    expect((await laden(TOKEN_ZWEI)).status).toBe(404);
  });

  it("Entfernen eines fremden Entwurfs: 404 mit demselben Text — die Zeile bleibt fuer den Lauf", async () => {
    const { positionen } = nachAdresswechsel();
    const fremd = datei(positionen[0], { hochgeladenAm: VORHER });
    const res = await entfernen(fremd.id as string);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: MELDUNGEN.DATEI_NICHT_GEFUNDEN });
    expect(udb.dateien).toEqual([expect.objectContaining({ id: fremd.id, status: "ENTWURF" })]);

    // Die eigenen bleiben entfernbar.
    const eigen = datei(positionen[0], { hochgeladenAm: NACHHER });
    expect((await entfernen(eigen.id as string)).status).toBe(200);
    expect(udb.dateien.map((d) => d.id)).toEqual([fremd.id]);
  });

  it("Übermitteln reicht nur die eigenen Entwuerfe ein; mit nur fremden: 409 „nichts bereit“", async () => {
    const { positionen } = nachAdresswechsel({
      positionen: [
        { typ: null, bezeichnung: "A" },
        { typ: null, bezeichnung: "B" },
      ],
    });
    const fremdA = datei(positionen[0], { hochgeladenAm: VORHER });
    datei(positionen[1], { hochgeladenAm: VORHER });

    const nichts = await uebermitteln({});
    expect(nichts.status).toBe(409);
    expect(await nichts.json()).toEqual({ error: MELDUNGEN.NICHTS_ZU_UEBERMITTELN, grund: "NICHTS_BEREIT" });

    const eigen = datei(positionen[0], { hochgeladenAm: NACHHER });
    const res = await uebermitteln({});
    expect(res.status).toBe(200);
    expect((await res.json()).uebermittelt).toBe(1);
    expect(positionen[0]).toMatchObject({ status: "EINGEREICHT", einreichungen: 1 });
    expect(positionen[1]).toMatchObject({ status: "ANGEFORDERT", einreichungen: 0 });
    expect(udb.dateien.find((d) => d.id === eigen.id)).toMatchObject({ status: "EINGEREICHT", einreichungNr: 1 });
    expect(udb.dateien.find((d) => d.id === fremdA.id)).toMatchObject({ status: "ENTWURF", uebermitteltAm: null });
    expect(udb.audits).toHaveLength(1);
    expect(udb.audits[0].details).toMatchObject({
      vollstaendig: false,
      positionen: [{ positionId: positionen[0].id, dateien: [expect.objectContaining({ dateiId: eigen.id })] }],
    });
  });

  it("fremde Entwuerfe zaehlen nicht in die Kontingente des neuen Links", async () => {
    const { positionen } = nachAdresswechsel();
    for (let i = 0; i < MAX_DATEIEN_JE_POSITION; i++) datei(positionen[0], { hochgeladenAm: VORHER });
    const res = await hochladen(positionen[0].id as string, [alsDatei(PDF)]);
    expect(res.status).toBe(201);
    expect((await res.json()).position.entwuerfe).toHaveLength(1);
  });
});

// =============================================
// Gleichlauf mit dem Modul-Baustein
// =============================================

describe("Gleichlauf mit dem Modul-Baustein (bis `oeffentlichLaden` im Baustein steht)", () => {
  it("„eingestellt“, Einrichtung und Vorgangsnummer wie onboardingUnterlagenVorgang — fuer jeden Status", () => {
    for (const status of ONBOARDING_STATUS) {
      const zeile = vorgang({ status });
      const oeffentlich = oeffentlicherOnboardingVorgang(zeile as unknown as OnboardingOeffentlichZeile);
      const baustein = onboardingUnterlagenVorgang(zeile as unknown as OnboardingUnterlagenQuelle, []);
      expect({ status, eingestellt: oeffentlich.eingestellt }).toEqual({ status, eingestellt: baustein.eingestellt });
      expect(oeffentlich.einrichtung).toBe(baustein.einrichtung);
      expect(oeffentlich.vorgangsnummer).toBe(baustein.displayId);
    }
    expect(ONBOARDING_STATUS.filter((s) => oeffentlicherOnboardingVorgang(vorgang({ status: s }) as unknown as OnboardingOeffentlichZeile).eingestellt)).toEqual(["EXPIRED"]);
  });
});

// =============================================
// Kopfzeilen in ALLEN Antworten
// =============================================

describe("Kopfzeilen", () => {
  it("no-store, nosniff, no-referrer und noindex stehen in jeder Antwort — 200, 201, 400, 404, 409, 410, 415, 500", async () => {
    const { positionen } = szenario();
    const log = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const antworten: Response[] = [
      await laden(),
      await hochladen(positionen[0].id as string, [alsDatei(PDF)]),
      await hochladen(positionen[0].id as string, [alsDatei(HTML)]),
      await hochladen(positionen[0].id as string, []),
      await laden(TOKEN_ZWEI),
      await uebermitteln({}, { roh: "kaputt" }),
    ];
    positionen[0].status = "ENTFAELLT";
    antworten.push(await hochladen(positionen[0].id as string, [alsDatei(PDF)]));
    udb.nachforderungen[0].status = "ZURUECKGEZOGEN";
    antworten.push(await laden());
    fp.unterlagenLink.findUnique.mockRejectedValueOnce(Object.assign(new Error("db weg"), { code: "P1001" }));
    antworten.push(await laden());

    expect(antworten.map((r) => r.status)).toEqual([200, 201, 415, 400, 404, 400, 409, 410, 500]);
    for (const res of antworten) pruefeKopfzeilen(res);
    expect(log).toHaveBeenCalledWith("[API] Unterlagen laden fehlgeschlagen:", "P1001");
    log.mockRestore();
  });
});
