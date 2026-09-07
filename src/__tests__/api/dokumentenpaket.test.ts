/**
 * Tests: Dokumentenpaket-Routen
 * (/api/dokumentenpaket, .../pruefen, .../versenden)
 *
 * Bewusst OHNE Mock der Bibliothek: Geprueft wird die ganze Kette vom
 * HTTP-Aufruf bis zum Schreibvorgang. Ein Test, der die Bibliothek wegmockt,
 * belegt nur, dass die Route eine Funktion aufruft — nicht, dass ein direkter
 * API-Aufruf ohne Oberflaeche an der Bestaetigungspflicht scheitert. Genau das
 * ist hier aber die Zusage.
 *
 * Schwerpunkte aus dem Plan (Abschnitt 8, Baustein 11): Mandantengrenze,
 * Bestaetigungspflicht per direktem Aufruf, Modul-Abgleich, BEM-Ausschluss,
 * Abbruchpfade ohne Nachweis, Nachweis-Inhalt samt Adressabweichung.
 */

const mockPrisma = {
  onboardingProcess: { findUnique: jest.fn(), update: jest.fn() },
  starterpaketDokument: { findMany: jest.fn() },
  documentTemplate: { findMany: jest.fn() },
  starterpaketAuswahl: { findMany: jest.fn() },
  dokumentenVersand: { create: jest.fn(), update: jest.fn(), findMany: jest.fn() },
  generatedDocument: { create: jest.fn() },
  auditLog: { create: jest.fn() },
  smtpConfig: { findUnique: jest.fn() },
  $transaction: jest.fn(),
};
const mockGetSession = jest.fn();
const mockCanAccessProcess = jest.fn();
const mockSendEventEmail = jest.fn();
const mockResolveEventTemplate = jest.fn();
const mockRenderDocx = jest.fn();
const mockConvertDocxToPdf = jest.fn();
const mockGotenbergReachable = jest.fn();
const mockSaveUploadedFile = jest.fn();
const mockReadFile = jest.fn();
const mockRealpath = jest.fn();
const mockResolver = jest.fn();
/** Ein Aufruf der Bremse: (name, key). Die Antwort steuert der Test. */
const mockLimit = jest.fn();

jest.mock("fs/promises", () => ({
  readFile: (...a: unknown[]) => mockReadFile(...a),
  realpath: (...a: unknown[]) => mockRealpath(...a),
}));
// Nur createRateLimiter ersetzen, getClientIpOrNull bleibt echt — die Route
// braucht beides aus derselben Datei. Der echte Limiter fuehrt seinen Zaehler
// modulweit und ueber die ganze Testdatei hinweg; ohne eine Reset-Moeglichkeit
// liefen die spaeten Faelle sonst in eine 429, die mit ihrer Zusage nichts zu
// tun hat. Was hier NICHT wegfaellt, ist die eigentliche Aussage: Mit welchem
// Schluessel gefragt wird (userId, nicht IP) und was bei einem Nein passiert,
// prueft die Datei weiterhin selbst.
jest.mock("@/lib/rate-limit", () => ({
  ...jest.requireActual("@/lib/rate-limit"),
  createRateLimiter: (name: string, config: { maxRequests: number; windowMs: number }) => ({
    check: (key: string) => mockLimit(name, key, config),
  }),
}));
jest.mock("@/lib/db", () => ({ prisma: mockPrisma }));
jest.mock("@/lib/auth", () => ({ getSession: mockGetSession }));
jest.mock("@/lib/permissions", () => ({
  ...jest.requireActual("@/lib/permissions"),
  canAccessProcess: (...a: unknown[]) => mockCanAccessProcess(...a),
}));
jest.mock("@/lib/mailer", () => ({
  sendEventEmail: (...a: unknown[]) => mockSendEventEmail(...a),
  resolveEventTemplate: (...a: unknown[]) => mockResolveEventTemplate(...a),
}));
jest.mock("@/lib/gotenberg", () => ({
  convertDocxToPdf: (...a: unknown[]) => mockConvertDocxToPdf(...a),
  isGotenbergReachable: () => mockGotenbergReachable(),
}));
jest.mock("@/lib/doc-templates", () => ({
  ...jest.requireActual("@/lib/doc-templates"),
  renderDocx: (...a: unknown[]) => mockRenderDocx(...a),
}));
// requireActual-Spread: dokumentenpaket.ts holt hier auch asciiFilename und
// sha256Hex — eine Fabrik mit nur zwei Namen machte beide zu undefined.
jest.mock("@/lib/file-upload", () => ({
  ...jest.requireActual("@/lib/file-upload"),
  saveUploadedFile: (...a: unknown[]) => mockSaveUploadedFile(...a),
}));
jest.mock("@/lib/doc-template-resolvers", () => ({
  ...jest.requireActual("@/lib/doc-template-resolvers"),
  getResolver: () => mockResolver,
  hasModuleResolver: () => true,
}));

import path from "path";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/dokumentenpaket/route";
import { POST as PRUEFEN } from "@/app/api/dokumentenpaket/pruefen/route";
import { POST as VERSENDEN } from "@/app/api/dokumentenpaket/versenden/route";
import { MAX_PAKET_BYTES } from "@/lib/dokumentenpaket";

const ORG = "11111111-1111-4111-8111-111111111111";
const REF = "22222222-2222-4222-8222-222222222222";
const PDF_ID = "33333333-3333-4333-8333-333333333333";
const VORLAGE_ID = "44444444-4444-4444-8444-444444444444";
const VORLAGE_PFAD = path.join(process.cwd(), "uploads", "brief-vorlagen", "a.docx");
const POOL_PFAD = path.join(process.cwd(), "uploads", "starterpaket", "leitbild.pdf");
const POOL_INHALT = Buffer.from("%PDF-1.4 pool");

const session = {
  userId: "u1",
  email: "hr@fes.de",
  role: "HR_SACHBEARBEITER",
  firstName: "Erika",
  lastName: "Sachbearbeiter",
};

function getReq(query = `?modul=ONBOARDING&refId=${REF}`): NextRequest {
  return new NextRequest(`http://localhost:3000/api/dokumentenpaket${query}`);
}
function postReq(pfad: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost:3000/api/dokumentenpaket/${pfad}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
const ctx = () => ({ params: Promise.resolve({}) });

const SENSIBLE_VORLAGE = {
  id: VORLAGE_ID,
  name: "Bestaetigung der Abrechnungsdaten",
  description: null,
  organizationId: null,
  fileSize: 1000,
  dateipfad: VORLAGE_PFAD,
  platzhalter: ["vorname", "iban", "steuer_id"],
  modul: "ONBOARDING",
};

const POOL_PDF = {
  id: PDF_ID,
  name: "Leitbild",
  beschreibung: null,
  organizationId: null,
  fileSize: POOL_INHALT.length,
  dateipfad: POOL_PFAD,
  originalName: "leitbild.pdf",
  hash: "x".repeat(64),
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetSession.mockResolvedValue(session);
  mockCanAccessProcess.mockResolvedValue(true);
  mockPrisma.onboardingProcess.findUnique.mockResolvedValue({
    email: "max@example.org",
    firstName: "Max",
    lastName: "Mustermann",
    displayId: "2026-GYM-001",
    organizationId: ORG,
    organization: { name: "Gymnasium" },
    personalData: null,
  });
  // Standardfall: Beide Bremsen lassen durch. Nur die 429-Faelle sagen Nein.
  mockLimit.mockReturnValue({ allowed: true, remaining: 9 });
  mockPrisma.smtpConfig.findUnique.mockResolvedValue({ allowedRecipientDomains: "" });
  mockPrisma.starterpaketDokument.findMany.mockResolvedValue([POOL_PDF]);
  mockPrisma.documentTemplate.findMany.mockResolvedValue([SENSIBLE_VORLAGE]);
  mockPrisma.starterpaketAuswahl.findMany.mockResolvedValue([]);
  mockPrisma.dokumentenVersand.findMany.mockResolvedValue([]);
  mockPrisma.dokumentenVersand.create.mockResolvedValue({});
  mockPrisma.dokumentenVersand.update.mockResolvedValue({});
  mockPrisma.generatedDocument.create.mockResolvedValue({ id: "gen-1" });
  mockPrisma.auditLog.create.mockResolvedValue({});
  mockPrisma.onboardingProcess.update.mockResolvedValue({});
  mockPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn(mockPrisma),
  );
  // Pool-PDFs und Vorlagen laufen ueber denselben Leseweg hinter der
  // Pfadschranke — unterschieden wird an der Endung.
  mockReadFile.mockImplementation(async (p: unknown) =>
    String(p).toLowerCase().endsWith(".pdf") ? POOL_INHALT : Buffer.from("PK docx"),
  );
  mockRealpath.mockImplementation(async (p: unknown) => p as string);
  mockSaveUploadedFile.mockResolvedValue("uploads/irgendwo");
  mockGotenbergReachable.mockResolvedValue(true);
  mockRenderDocx.mockReturnValue({ buffer: Buffer.from("docx"), missing: [] });
  mockConvertDocxToPdf.mockResolvedValue(Buffer.from("%PDF-1.4 gewandelt"));
  mockResolver.mockResolvedValue({ data: { vorname: "Max" }, sensitiveFields: [] });
  mockResolveEventTemplate.mockResolvedValue({
    subject: "Willkommen",
    bodyHtml: "<p>{{#nachricht}}{{nachricht_html}}{{/nachricht}}</p>",
    bodyText: null,
  });
  // Wie der echte Mailer: Er meldet zurueck, an wen er TATSAECHLICH
  // adressiert hat — bei gesetztem overrideTo also genau diese Adresse.
  mockSendEventEmail.mockImplementation(
    async (_event: string, _payload: unknown, optionen?: { overrideTo?: string }) => ({
      status: "SENT",
      messageId: "<abc@fes>",
      recipient: optionen?.overrideTo ?? "max@example.org",
      subject: "Willkommen",
    }),
  );
});

function nichtsGeschrieben() {
  expect(mockPrisma.dokumentenVersand.create).not.toHaveBeenCalled();
  expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  expect(mockPrisma.onboardingProcess.update).not.toHaveBeenCalled();
}

// =============================================
// Rechte
// =============================================

describe("Berechtigungen", () => {
  it("weist alle drei Routen ohne Sitzung ab (401)", async () => {
    mockGetSession.mockResolvedValue(null);
    expect((await GET(getReq(), ctx())).status).toBe(401);
    expect(
      (await PRUEFEN(postReq("pruefen", { modul: "ONBOARDING", refId: REF, positionen: [{ art: "PDF", id: PDF_ID }] }), ctx())).status,
    ).toBe(401);
    expect(
      (await VERSENDEN(postReq("versenden", { modul: "ONBOARDING", refId: REF, positionen: [{ art: "PDF", id: PDF_ID }], empfaenger: "a@b.de" }), ctx())).status,
    ).toBe(401);
  });

  it("weist Rollen ohne HR-Bearbeitungsrecht ab (403)", async () => {
    mockGetSession.mockResolvedValue({ ...session, role: "VORGESETZTER" });
    expect((await GET(getReq(), ctx())).status).toBe(403);
    expect(
      (await VERSENDEN(postReq("versenden", { modul: "ONBOARDING", refId: REF, positionen: [{ art: "PDF", id: PDF_ID }], empfaenger: "a@b.de" }), ctx())).status,
    ).toBe(403);
  });

  it("weist einen fremden Mandanten ab (404) und schreibt nichts", async () => {
    // 404, nicht 403: Ueber den Statuscode soll niemand erfahren, dass ein
    // fremder Vorgang ueberhaupt existiert (CREDO-Hausstandard A6).
    mockCanAccessProcess.mockResolvedValue(false);
    expect((await GET(getReq(), ctx())).status).toBe(404);
    const res = await VERSENDEN(
      postReq("versenden", {
        modul: "ONBOARDING",
        refId: REF,
        positionen: [{ art: "PDF", id: PDF_ID }],
        empfaenger: "a@b.de",
      }),
      ctx(),
    );
    expect(res.status).toBe(404);
    expect(mockSendEventEmail).not.toHaveBeenCalled();
    nichtsGeschrieben();
  });
});

// =============================================
// GET — Zusammenstellung
// =============================================

describe("GET /api/dokumentenpaket", () => {
  it("verlangt modul und refId (400)", async () => {
    expect((await GET(getReq("?modul=ONBOARDING"), ctx())).status).toBe(400);
    expect((await GET(getReq(`?refId=${REF}`), ctx())).status).toBe(400);
  });

  it("liefert Empfaenger, Waehlbares und die Groessengrenze", async () => {
    const res = await GET(getReq(), ctx());
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.empfaengerVorschlag).toBe("max@example.org");
    expect(data.maxBytes).toBe(MAX_PAKET_BYTES);
    expect(data.verfuegbar.map((p: { id: string }) => p.id).sort()).toEqual(
      [PDF_ID, VORLAGE_ID].sort(),
    );
    const vorlage = data.verfuegbar.find((p: { id: string }) => p.id === VORLAGE_ID);
    expect(vorlage.sensibleFelder.map((f: { key: string }) => f.key)).toEqual([
      "iban",
      "steuer_id",
    ]);
  });

  it("laesst Positionen aus der Vorauswahl fallen, die es nicht mehr gibt", async () => {
    // Sonst blieben sie im Dialog vorausgewaehlt und der Versand wiese sie ab.
    mockPrisma.starterpaketAuswahl.findMany.mockResolvedValue([
      { dokumentId: PDF_ID, templateId: null },
      { dokumentId: "99999999-9999-4999-8999-999999999999", templateId: null },
    ]);
    const { data } = await (await GET(getReq(), ctx())).json();
    expect(data.standardpaket).toEqual([{ art: "PDF", id: PDF_ID }]);
  });

  it("meldet einen unbekannten Vorgang mit 404", async () => {
    mockPrisma.onboardingProcess.findUnique.mockResolvedValue(null);
    expect((await GET(getReq(), ctx())).status).toBe(404);
  });

  it("kennt kein BEM (400)", async () => {
    expect((await GET(getReq(`?modul=BEM&refId=${REF}`), ctx())).status).toBe(400);
  });
});

// =============================================
// Bestaetigungspflicht — der Kern
// =============================================

describe("Bestaetigungspflicht beim direkten API-Aufruf", () => {
  const koerper = (bestaetigt?: boolean) => ({
    modul: "ONBOARDING",
    refId: REF,
    positionen: [{ art: "VORLAGE", id: VORLAGE_ID, ...(bestaetigt ? { bestaetigt } : {}) }],
    empfaenger: "max@example.org",
  });

  it("lehnt eine sensible Vorlage ohne Bestaetigung mit 409 ab", async () => {
    const res = await VERSENDEN(postReq("versenden", koerper()), ctx());
    expect(res.status).toBe(409);
    const j = await res.json();
    expect(j.fehler).toBe("BESTAETIGUNG_FEHLT");
    // Der Dialog soll die Haekchen genau dort setzen koennen.
    expect(j.betroffen[0]).toMatchObject({ templateId: VORLAGE_ID });
    expect(j.betroffen[0].felder.map((f: { key: string }) => f.key)).toEqual([
      "iban",
      "steuer_id",
    ]);
  });

  it("entschluesselt dabei nichts und versendet nichts", async () => {
    await VERSENDEN(postReq("versenden", koerper()), ctx());
    expect(mockResolver).not.toHaveBeenCalled();
    expect(mockSendEventEmail).not.toHaveBeenCalled();
    nichtsGeschrieben();
  });

  it("laesst sie mit Bestaetigung durch und vermerkt die Felder im Pruefprotokoll", async () => {
    mockResolver.mockResolvedValue({
      data: { iban: "DE00" },
      sensitiveFields: ["iban", "steuer_id"],
    });
    const res = await VERSENDEN(postReq("versenden", koerper(true)), ctx());
    expect(res.status).toBe(200);

    const log = mockPrisma.auditLog.create.mock.calls[0][0].data;
    expect(log.action).toBe("DOKUMENTENPAKET_SENT");
    expect(log.details.sensitiveFields).toEqual(["iban", "steuer_id"]);

    const nachweis = mockPrisma.dokumentenVersand.create.mock.calls[0][0].data;
    expect(nachweis.bestaetigungen[0]).toMatchObject({
      templateId: VORLAGE_ID,
      felder: ["iban", "steuer_id"],
      userId: "u1",
    });
  });
});

// =============================================
// Weitere Abbruchpfade
// =============================================

describe("Abbruchpfade der Versandroute", () => {
  const mitPdf = (extra?: Record<string, unknown>) => ({
    modul: "ONBOARDING",
    refId: REF,
    positionen: [{ art: "PDF", id: PDF_ID }],
    empfaenger: "max@example.org",
    ...extra,
  });

  it("weist einen ungueltigen Koerper ab (400)", async () => {
    for (const koerper of [
      { modul: "ONBOARDING", refId: REF, positionen: [] },
      { modul: "ONBOARDING", refId: "keine-uuid", positionen: [{ art: "PDF", id: PDF_ID }], empfaenger: "a@b.de" },
      { modul: "ONBOARDING", refId: REF, positionen: [{ art: "PDF", id: PDF_ID }], empfaenger: "keine-mail" },
      { modul: "BEM", refId: REF, positionen: [{ art: "PDF", id: PDF_ID }], empfaenger: "a@b.de" },
    ]) {
      const res = await VERSENDEN(postReq("versenden", koerper), ctx());
      expect(res.status).toBe(400);
    }
    nichtsGeschrieben();
  });

  it("weist ein fremdes Pool-PDF ab (400)", async () => {
    mockPrisma.starterpaketDokument.findMany.mockResolvedValue([]);
    const res = await VERSENDEN(postReq("versenden", mitPdf()), ctx());
    expect(res.status).toBe(400);
    nichtsGeschrieben();
  });

  it("weist eine Vorlage aus einem fremden Modul ab (400)", async () => {
    // stellePaketZusammen filtert per Abfrage; findet sie nichts, ist die
    // Position nicht verfuegbar.
    mockPrisma.documentTemplate.findMany.mockResolvedValue([]);
    const res = await VERSENDEN(
      postReq("versenden", {
        modul: "ONBOARDING",
        refId: REF,
        positionen: [{ art: "VORLAGE", id: VORLAGE_ID, bestaetigt: true }],
        empfaenger: "max@example.org",
      }),
      ctx(),
    );
    expect(res.status).toBe(400);
    nichtsGeschrieben();
  });

  it("meldet ein zu grosses Paket mit 413", async () => {
    mockReadFile.mockResolvedValue(Buffer.alloc(MAX_PAKET_BYTES + 1));
    const res = await VERSENDEN(postReq("versenden", mitPdf()), ctx());
    expect(res.status).toBe(413);
    expect(mockSendEventEmail).not.toHaveBeenCalled();
    nichtsGeschrieben();
  });

  it("meldet einen SMTP-Fehlschlag mit 502 und schreibt keinen Nachweis", async () => {
    mockSendEventEmail.mockResolvedValue({ status: "FAILED", detail: "SMTP ist nicht konfiguriert" });
    const res = await VERSENDEN(postReq("versenden", mitPdf()), ctx());
    expect(res.status).toBe(502);
    nichtsGeschrieben();
  });

  it("meldet einen toten PDF-Dienst mit 502", async () => {
    mockGotenbergReachable.mockResolvedValue(false);
    const res = await VERSENDEN(
      postReq("versenden", {
        modul: "ONBOARDING",
        refId: REF,
        positionen: [{ art: "VORLAGE", id: VORLAGE_ID, bestaetigt: true }],
        empfaenger: "max@example.org",
      }),
      ctx(),
    );
    expect(res.status).toBe(502);
    nichtsGeschrieben();
  });
});

// =============================================
// Nachweis-Inhalt
// =============================================

describe("Nachweis", () => {
  it("haelt die abweichende Adresse und die des Vorgangs fest", async () => {
    const res = await VERSENDEN(
      postReq("versenden", {
        modul: "ONBOARDING",
        refId: REF,
        positionen: [{ art: "PDF", id: PDF_ID }],
        empfaenger: "privat@example.org",
        nachricht: "Bis Montag!",
      }),
      ctx(),
    );
    expect(res.status).toBe(200);

    const daten = mockPrisma.dokumentenVersand.create.mock.calls[0][0].data;
    expect(daten).toMatchObject({
      empfaenger: "privat@example.org",
      empfaengerVorgang: "max@example.org",
      empfaengerAbweichend: true,
      nachricht: "Bis Montag!",
      betreff: "Willkommen",
      messageId: "<abc@fes>",
      anzahl: 1,
    });
  });

  it("antwortet mit Versand-ID, Dokumenten und Warnungen", async () => {
    const res = await VERSENDEN(
      postReq("versenden", {
        modul: "ONBOARDING",
        refId: REF,
        positionen: [{ art: "PDF", id: PDF_ID }],
        empfaenger: "max@example.org",
      }),
      ctx(),
    );
    const { data } = await res.json();
    expect(data.versandId).toBeDefined();
    expect(data.empfaenger).toBe("max@example.org");
    expect(data.dokumente[0]).toMatchObject({ art: "PDF", name: "Leitbild" });
    expect(Array.isArray(data.warnungen)).toBe(true);
  });
});

// =============================================
// Vorpruefung
// =============================================

describe("POST /api/dokumentenpaket/pruefen", () => {
  it("entschluesselt nichts — auch nicht bei bestaetigter Vorlage", async () => {
    const res = await PRUEFEN(
      postReq("pruefen", {
        modul: "ONBOARDING",
        refId: REF,
        positionen: [{ art: "VORLAGE", id: VORLAGE_ID, bestaetigt: true }],
      }),
      ctx(),
    );
    expect(res.status).toBe(200);
    expect(mockResolver).toHaveBeenCalledWith(
      expect.objectContaining({ placeholders: ["vorname"] }),
    );
    // Und persistiert nichts.
    nichtsGeschrieben();
    expect(mockSendEventEmail).not.toHaveBeenCalled();
  });

  it("meldet Bestaetigungspflicht, ohne den Versand zu erzwingen", async () => {
    const res = await PRUEFEN(
      postReq("pruefen", {
        modul: "ONBOARDING",
        refId: REF,
        positionen: [{ art: "VORLAGE", id: VORLAGE_ID }],
      }),
      ctx(),
    );
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.positionen[0].bestaetigungNoetig).toBe(true);
    expect(data.mailvorlageKenntNachricht).toBe(true);
  });

  it("weist einen ungueltigen Koerper ab (400)", async () => {
    const res = await PRUEFEN(postReq("pruefen", { modul: "ONBOARDING" }), ctx());
    expect(res.status).toBe(400);
  });
});

// =============================================
// Bremse der Versandroute
// =============================================

describe("Rate-Limit der Versandroute", () => {
  const koerper = {
    modul: "ONBOARDING",
    refId: REF,
    positionen: [{ art: "PDF", id: PDF_ID }],
    empfaenger: "max@example.org",
  };

  it("bremst je Benutzerkonto: 10 pro Minute und 60 pro Stunde", async () => {
    await VERSENDEN(postReq("versenden", koerper), ctx());
    // Der Schluessel ist die userId und NICHT die IP: Wer hier Schaden
    // anrichten kann, ist angemeldet, und eine IP wechselt man mit dem
    // Mobilfunknetz. Ohne diesen Test waere ein spaeterer Wechsel auf
    // getClientIp unbemerkt moeglich.
    expect(mockLimit).toHaveBeenCalledWith("dokumentenpaket-versand", "u1", {
      maxRequests: 10,
      windowMs: 60_000,
    });
    expect(mockLimit).toHaveBeenCalledWith("dokumentenpaket-versand-stunde", "u1", {
      maxRequests: 60,
      windowMs: 60 * 60_000,
    });
  });

  it("antwortet bei erschoepftem Minutenkontingent mit 429 und Retry-After", async () => {
    mockLimit.mockImplementation((name: string) =>
      name === "dokumentenpaket-versand"
        ? { allowed: false, remaining: 0, retryAfterMs: 30_000 }
        : { allowed: true, remaining: 9 },
    );
    const res = await VERSENDEN(postReq("versenden", koerper), ctx());
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("30");
    const j = await res.json();
    expect(j.error).toContain("Zu viele Versendungen");
  });

  it("bremst auch, wenn nur das Stundenkontingent erschoepft ist", async () => {
    // Ein reines Minutenfenster liesse 600 Vorgaenge je Stunde durch — genau
    // den langsamen Abfluss, um den es geht.
    mockLimit.mockImplementation((name: string) =>
      name === "dokumentenpaket-versand-stunde"
        ? { allowed: false, remaining: 0, retryAfterMs: 900_000 }
        : { allowed: true, remaining: 9 },
    );
    const res = await VERSENDEN(postReq("versenden", koerper), ctx());
    expect(res.status).toBe(429);
    expect((await res.json()).error).toContain("letzten Stunde");
  });

  it("versendet beim 429 nichts und schreibt nichts", async () => {
    mockLimit.mockReturnValue({ allowed: false, remaining: 0, retryAfterMs: 1000 });
    await VERSENDEN(postReq("versenden", koerper), ctx());
    expect(mockSendEventEmail).not.toHaveBeenCalled();
    nichtsGeschrieben();
  });

  it("kostet auch ein abgewiesener Versuch ein Kontingent", async () => {
    // Sonst liesse sich ueber die Fehlerpfade beliebig oft probieren — und
    // gerade die Fehlerpfade verraten, welche Vorgangs-ID existiert.
    mockCanAccessProcess.mockResolvedValue(false);
    const res = await VERSENDEN(postReq("versenden", koerper), ctx());
    expect(res.status).toBe(404);
    expect(mockLimit).toHaveBeenCalledWith("dokumentenpaket-versand", "u1", expect.anything());
  });

  it("laesst die Vorpruefung ungebremst", async () => {
    // Der Dialog ruft sie nach jeder Aenderung erneut auf; eine Bremse traefe
    // hier den Normalfall.
    await PRUEFEN(
      postReq("pruefen", { modul: "ONBOARDING", refId: REF, positionen: [{ art: "PDF", id: PDF_ID }] }),
      ctx(),
    );
    expect(mockLimit).not.toHaveBeenCalled();
  });
});

// =============================================
// Freigabeliste — der Dialog ist umgehbar, der Server nicht
// =============================================

describe("Freigabe abweichender Empfaenger ueber die API", () => {
  beforeEach(() => {
    mockPrisma.smtpConfig.findUnique.mockResolvedValue({
      allowedRecipientDomains: "fes-minden.de",
    });
  });

  it("weist einen direkten Aufruf mit fremder Domain mit 409 ab", async () => {
    const res = await VERSENDEN(
      postReq("versenden", {
        modul: "ONBOARDING",
        refId: REF,
        positionen: [{ art: "PDF", id: PDF_ID }],
        empfaenger: "dieb@gmail.com",
      }),
      ctx(),
    );
    expect(res.status).toBe(409);
    expect((await res.json()).fehler).toBe("EMPFAENGER_NICHT_ERLAUBT");
    expect(mockSendEventEmail).not.toHaveBeenCalled();
    nichtsGeschrieben();
  });

  it("laesst die Adresse des Vorgangs durch", async () => {
    const res = await VERSENDEN(
      postReq("versenden", {
        modul: "ONBOARDING",
        refId: REF,
        positionen: [{ art: "PDF", id: PDF_ID }],
        empfaenger: "max@example.org",
      }),
      ctx(),
    );
    expect(res.status).toBe(200);
  });

  it("meldet es der Vorpruefung mit 200, damit der Dialog vorher warnen kann", async () => {
    const res = await PRUEFEN(
      postReq("pruefen", {
        modul: "ONBOARDING",
        refId: REF,
        positionen: [{ art: "PDF", id: PDF_ID }],
        empfaenger: "dieb@gmail.com",
      }),
      ctx(),
    );
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.empfaengerErlaubt).toBe(false);
    expect(data.erlaubteDomains).toEqual(["fes-minden.de"]);
  });
});
