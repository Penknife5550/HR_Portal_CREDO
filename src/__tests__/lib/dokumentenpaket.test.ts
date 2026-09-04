/**
 * Tests: Dokumentenpaket-Versand (src/lib/dokumentenpaket.ts)
 *
 * Schwerpunkt sind die drei Zusagen der Bibliothek:
 *  - die Bestaetigung ist eine Schranke im Datenfluss, nicht nur eine Abfrage,
 *  - der Mandant wird selbst geprueft (die Resolver schweigen bei Ablehnung),
 *  - kein Abbruchpfad hinterlaesst einen Nachweis.
 */

const mockPrisma = {
  onboardingProcess: { findUnique: jest.fn(), update: jest.fn() },
  starterpaketDokument: { findMany: jest.fn() },
  documentTemplate: { findMany: jest.fn() },
  starterpaketAuswahl: { findMany: jest.fn() },
  dokumentenVersand: { create: jest.fn(), update: jest.fn(), findMany: jest.fn() },
  generatedDocument: { create: jest.fn() },
  auditLog: { create: jest.fn() },
  $transaction: jest.fn(),
};
const mockCanAccessProcess = jest.fn();
const mockSendEventEmail = jest.fn();
const mockResolveEventTemplate = jest.fn();
const mockRenderDocx = jest.fn();
const mockConvertDocxToPdf = jest.fn();
const mockGotenbergReachable = jest.fn();
const mockReadUploadedFile = jest.fn();
const mockSaveUploadedFile = jest.fn();
const mockResolver = jest.fn();
const mockReadFile = jest.fn();
const mockUnlink = jest.fn();

jest.mock("fs/promises", () => ({
  readFile: (...a: unknown[]) => mockReadFile(...a),
  unlink: (...a: unknown[]) => mockUnlink(...a),
}));
jest.mock("@/lib/db", () => ({ prisma: mockPrisma }));
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
jest.mock("@/lib/file-upload", () => ({
  readUploadedFile: (...a: unknown[]) => mockReadUploadedFile(...a),
  saveUploadedFile: (...a: unknown[]) => mockSaveUploadedFile(...a),
}));
jest.mock("@/lib/doc-template-resolvers", () => ({
  ...jest.requireActual("@/lib/doc-template-resolvers"),
  getResolver: () => mockResolver,
  hasModuleResolver: () => true,
}));

import { DEFAULT_EMAIL_TEMPLATES } from "@/lib/default-email-templates";
import {
  versendePaket,
  kodierteGroesse,
  ladePaketAngebot,
  deutschesDatum,
  alsHtmlAbsaetze,
  pruefePaket,
  SENSIBEL_MARKER,
  statusFuerFehler,
  unbestaetigteSensible,
  erlaubtePlatzhalter,
  vorlagenDateiname,
  modulVerdrahtet,
  MAX_PAKET_BYTES,
} from "@/lib/dokumentenpaket";

const ORG = "org-1";
const REF = "onb-1";
const PDF_ID = "11111111-1111-4111-8111-111111111111";
const VORLAGE_ID = "22222222-2222-4222-8222-222222222222";
const JETZT = new Date("2026-09-04T10:00:00.000Z");
const VORLAGE_PFAD = require("path").join(process.cwd(), "uploads", "brief-vorlagen", "a.docx");
const SYSTEM_PFAD = require("path").join(
  process.cwd(),
  "public",
  "system-dokumente",
  "fuehrungszeugnis-antrag.docx",
);

const session = {
  userId: "u1",
  email: "hr@fes.de",
  role: "HR_LEITUNG",
  firstName: "Erika",
  lastName: "Sachbearbeiter",
};

function basis(extra?: Record<string, unknown>) {
  return {
    modul: "ONBOARDING",
    refId: REF,
    positionen: [{ art: "PDF" as const, id: PDF_ID }],
    session,
    jetzt: JETZT,
    ...extra,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.onboardingProcess.findUnique.mockResolvedValue({
    email: "max@example.org",
    firstName: "Max",
    lastName: "Mustermann",
    displayId: "2026-GYM-001",
    organizationId: ORG,
    organization: { name: "Gymnasium" },
    personalData: null,
  });
  mockPrisma.starterpaketDokument.findMany.mockResolvedValue([
    { id: PDF_ID, name: "Leitbild", dateipfad: "starterpaket/leitbild.pdf", originalName: "leitbild.pdf", hash: "x".repeat(64) },
  ]);
  mockPrisma.documentTemplate.findMany.mockResolvedValue([]);
  mockCanAccessProcess.mockResolvedValue(true);
  mockReadUploadedFile.mockResolvedValue(Buffer.from("%PDF-1.4 inhalt"));
  mockReadFile.mockResolvedValue(Buffer.from("PK docx-quelle"));
  mockUnlink.mockResolvedValue(undefined);
  mockSaveUploadedFile.mockResolvedValue("uploads/irgendwo/datei");
  mockGotenbergReachable.mockResolvedValue(true);
  mockRenderDocx.mockReturnValue({ buffer: Buffer.from("docx"), missing: [] });
  mockConvertDocxToPdf.mockResolvedValue(Buffer.from("%PDF-1.4 gewandelt"));
  mockResolver.mockResolvedValue({ data: { vorname: "Max" }, sensitiveFields: [] });
  // Wie der echte Mailer: Er meldet zurueck, an wen er TATSAECHLICH
  // adressiert hat — bei gesetztem overrideTo also genau diese Adresse.
  mockSendEventEmail.mockImplementation(
    async (_event: string, _payload: unknown, optionen?: { overrideTo?: string }) => ({
      status: "SENT",
      messageId: "<abc@fes>",
      recipient: optionen?.overrideTo ?? "max@example.org",
      subject: "Herzlich willkommen",
    }),
  );
  mockResolveEventTemplate.mockResolvedValue({
    subject: "Herzlich willkommen",
    bodyHtml: "<p>Hallo {{vorname}}</p><p>{{nachricht}}</p>",
    bodyText: null,
  });
  mockPrisma.dokumentenVersand.create.mockResolvedValue({});
  mockPrisma.dokumentenVersand.update.mockResolvedValue({});
  mockPrisma.dokumentenVersand.findMany.mockResolvedValue([]);
  mockPrisma.starterpaketAuswahl.findMany.mockResolvedValue([]);
  mockPrisma.generatedDocument.create.mockResolvedValue({ id: "gen-1" });
  mockPrisma.auditLog.create.mockResolvedValue({});
  mockPrisma.onboardingProcess.update.mockResolvedValue({});
  // $transaction mit Callback: den tx-Zweig mit denselben Mocks bedienen.
  mockPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn(mockPrisma),
  );
});

/** Kein Abbruchpfad darf etwas schreiben. */
function nichtsGeschrieben() {
  expect(mockPrisma.dokumentenVersand.create).not.toHaveBeenCalled();
  expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  expect(mockPrisma.onboardingProcess.update).not.toHaveBeenCalled();
}

// =============================================
// Reine Funktionen
// =============================================

describe("Dateiname", () => {
  it("traegt Vorlagenname, Nachname und Datum", () => {
    expect(vorlagenDateiname("Willkommensschreiben", "Müller", JETZT)).toBe(
      "Willkommensschreiben_M_ller_2026-09-04.pdf",
    );
  });

  it("kommt ohne Nachnamen aus", () => {
    expect(vorlagenDateiname("Anschreiben", "", JETZT)).toBe("Anschreiben_2026-09-04.pdf");
  });
});

describe("Bestaetigungspflicht (rein)", () => {
  const sensibel = {
    art: "VORLAGE" as const,
    id: VORLAGE_ID,
    name: "Abrechnungsdaten",
    bestaetigt: false,
    sensibleFelder: [
      { key: "iban", label: "IBAN" },
      { key: "steuer_id", label: "Steuer-ID" },
    ],
    platzhalter: ["vorname", "iban", "steuer_id"],
  };

  it("meldet unbestaetigte sensible Vorlagen mit ihren Feldern", () => {
    const offen = unbestaetigteSensible([sensibel]);
    expect(offen).toEqual([
      { templateId: VORLAGE_ID, name: "Abrechnungsdaten", felder: sensibel.sensibleFelder },
    ]);
  });

  it("schweigt bei bestaetigten und bei harmlosen Vorlagen", () => {
    expect(unbestaetigteSensible([{ ...sensibel, bestaetigt: true }])).toEqual([]);
    expect(unbestaetigteSensible([{ ...sensibel, sensibleFelder: [] }])).toEqual([]);
  });

  it("entzieht dem Resolver die sensiblen Platzhalter, solange nicht bestaetigt", () => {
    // Der Kern der Schranke: Ohne die Schluessel kann der Resolver nicht
    // entschluesseln — unabhaengig davon, ob der Aufrufer vorher geprueft hat.
    expect(erlaubtePlatzhalter(sensibel)).toEqual(["vorname"]);
    expect(erlaubtePlatzhalter({ ...sensibel, bestaetigt: true })).toEqual([
      "vorname",
      "iban",
      "steuer_id",
    ]);
  });

  it("erkennt die Schluessel auch in abweichender Schreibweise", () => {
    expect(
      erlaubtePlatzhalter({ ...sensibel, platzhalter: ["vorname", "IBAN", " steuer_id "] }),
    ).toEqual(["vorname"]);
  });
});

describe("Verdrahtete Module", () => {
  it("kennt Onboarding", () => {
    expect(modulVerdrahtet("ONBOARDING")).toBe(true);
  });

  it("kennt weder BEM noch Phantasiemodule noch die noch nicht verdrahteten", () => {
    expect(modulVerdrahtet("BEM")).toBe(false);
    expect(modulVerdrahtet("PHANTASIE")).toBe(false);
    // Phase 2 traegt sie nach — bis dahin gibt es keine abgestimmte Mailvorlage.
    expect(modulVerdrahtet("OFFBOARDING")).toBe(false);
  });
});

// =============================================
// Abbruchpfade
// =============================================

describe("Abbruch ohne Nachweis", () => {
  it("unbekanntes Modul", async () => {
    const r = await versendePaket(basis({ modul: "BEM" }));
    expect(r).toMatchObject({ status: "FEHLER", fehler: "MODUL_NICHT_UNTERSTUETZT" });
    expect(mockSendEventEmail).not.toHaveBeenCalled();
    nichtsGeschrieben();
  });

  it("Vorgang nicht gefunden", async () => {
    mockPrisma.onboardingProcess.findUnique.mockResolvedValue(null);
    const r = await versendePaket(basis());
    expect(r).toMatchObject({ status: "FEHLER", fehler: "VORGANG_NICHT_GEFUNDEN" });
    nichtsGeschrieben();
  });

  it("fremder Mandant — und zwar bevor irgendetwas gerendert wird", async () => {
    mockCanAccessProcess.mockResolvedValue(false);
    const r = await versendePaket(basis());
    expect(r).toMatchObject({ status: "FEHLER", fehler: "KEIN_ZUGRIFF" });
    expect(mockResolver).not.toHaveBeenCalled();
    expect(mockSendEventEmail).not.toHaveBeenCalled();
    nichtsGeschrieben();
  });

  it("leere Auswahl", async () => {
    const r = await versendePaket(basis({ positionen: [] }));
    expect(r).toMatchObject({ status: "FEHLER", fehler: "LEERE_AUSWAHL" });
    nichtsGeschrieben();
  });

  it("fremdes Dokument", async () => {
    mockPrisma.starterpaketDokument.findMany.mockResolvedValue([]);
    const r = await versendePaket(basis());
    expect(r).toMatchObject({ status: "FEHLER", fehler: "POSITION_NICHT_VERFUEGBAR" });
    nichtsGeschrieben();
  });

  it("sensible Vorlage ohne Bestaetigung — nichts wird entschluesselt oder versendet", async () => {
    mockPrisma.documentTemplate.findMany.mockResolvedValue([
      {
        id: VORLAGE_ID,
        name: "Abrechnungsdaten",
        dateipfad: VORLAGE_PFAD,
        platzhalter: ["vorname", "iban"],
        modul: "ONBOARDING",
      },
    ]);
    const r = await versendePaket(
      basis({ positionen: [{ art: "VORLAGE", id: VORLAGE_ID }] }),
    );
    expect(r).toMatchObject({ status: "FEHLER", fehler: "BESTAETIGUNG_FEHLT" });
    expect(r.status === "FEHLER" && r.betroffen?.[0]).toMatchObject({
      templateId: VORLAGE_ID,
      name: "Abrechnungsdaten",
    });
    expect(mockResolver).not.toHaveBeenCalled();
    expect(mockSendEventEmail).not.toHaveBeenCalled();
    nichtsGeschrieben();
  });

  it("fehlende Datei", async () => {
    mockReadUploadedFile.mockRejectedValue(new Error("weg"));
    const r = await versendePaket(basis());
    expect(r).toMatchObject({ status: "FEHLER", fehler: "DATEI_FEHLT" });
    expect(mockSendEventEmail).not.toHaveBeenCalled();
    nichtsGeschrieben();
  });

  it("PDF-Dienst nicht erreichbar bricht ab, sobald eine Vorlage dabei ist", async () => {
    mockGotenbergReachable.mockResolvedValue(false);
    mockPrisma.starterpaketDokument.findMany.mockResolvedValue([]);
    mockPrisma.documentTemplate.findMany.mockResolvedValue([
      {
        id: VORLAGE_ID,
        name: "Willkommensschreiben",
        dateipfad: VORLAGE_PFAD,
        platzhalter: ["vorname"],
        modul: "ONBOARDING",
      },
    ]);

    const r = await versendePaket(basis({ positionen: [{ art: "VORLAGE", id: VORLAGE_ID }] }));
    expect(r).toMatchObject({ status: "FEHLER", fehler: "PDF_DIENST" });
    expect(mockSendEventEmail).not.toHaveBeenCalled();
    nichtsGeschrieben();
  });

  it("reines PDF-Paket braucht den PDF-Dienst gar nicht", async () => {
    // Sonst haenge der Versand fester PDFs an einem Dienst, den er nie ruft.
    mockGotenbergReachable.mockResolvedValue(false);
    const r = await versendePaket(basis());
    expect(r.status).toBe("SENT");
    expect(mockConvertDocxToPdf).not.toHaveBeenCalled();
  });

  it("Paket zu gross", async () => {
    mockReadUploadedFile.mockResolvedValue(Buffer.alloc(MAX_PAKET_BYTES + 1));
    const r = await versendePaket(basis());
    expect(r).toMatchObject({ status: "FEHLER", fehler: "ZU_GROSS" });
    expect(mockSendEventEmail).not.toHaveBeenCalled();
    nichtsGeschrieben();
  });

  it("SMTP-Fehler hinterlaesst keinen Nachweis", async () => {
    mockSendEventEmail.mockResolvedValue({ status: "FAILED", detail: "SMTP ist nicht konfiguriert" });
    const r = await versendePaket(basis());
    expect(r).toMatchObject({ status: "FEHLER", fehler: "VERSAND" });
    expect(r.status === "FEHLER" && r.detail).toContain("SMTP");
    nichtsGeschrieben();
  });
});

// =============================================
// Erfolgsfall
// =============================================

describe("Erfolgreicher Versand", () => {
  it("schreibt den Nachweis mit dem tatsaechlichen Betreff und der Message-ID", async () => {
    const r = await versendePaket(basis());
    expect(r.status).toBe("SENT");

    const daten = mockPrisma.dokumentenVersand.create.mock.calls[0][0].data;
    expect(daten).toMatchObject({
      modul: "ONBOARDING",
      refId: REF,
      organizationId: ORG,
      empfaenger: "max@example.org",
      empfaengerAbweichend: false,
      betreff: "Herzlich willkommen",
      messageId: "<abc@fes>",
      anzahl: 1,
      sentById: "u1",
    });
  });

  it("haengt Pool-PDFs mit Originalnamen und PDF-Typ an", async () => {
    // Uebernommen aus dem Test der abgeloesten starterpaket.ts.
    await versendePaket(basis());
    expect(mockSendEventEmail).toHaveBeenCalledWith(
      "onboarding-starter-packet-sent",
      expect.objectContaining({ email: "max@example.org", anzahlDokumente: 1 }),
      expect.objectContaining({
        attachments: [
          expect.objectContaining({ filename: "leitbild.pdf", contentType: "application/pdf" }),
        ],
      }),
    );
  });

  it("nennt im Pruefprotokoll Name, Hash und Art jedes Dokuments", async () => {
    // Ebenfalls aus dem alten Test — dort ohne die Art, die es jetzt braucht,
    // weil ein Paket aus zwei Quellen bestehen kann.
    const r = await versendePaket(basis());
    const log = mockPrisma.auditLog.create.mock.calls[0][0].data;
    expect(log.details.dokumente).toEqual([
      { name: "Leitbild", hash: r.status === "SENT" ? r.dokumente[0].hash : "", art: "PDF" },
    ]);
  });

  it("haelt eine abweichende Empfaengeradresse fest", async () => {
    const r = await versendePaket(basis({ empfaenger: "privat@example.org" }));
    expect(r.status).toBe("SENT");

    const daten = mockPrisma.dokumentenVersand.create.mock.calls[0][0].data;
    expect(daten).toMatchObject({
      empfaenger: "privat@example.org",
      empfaengerVorgang: "max@example.org",
      empfaengerAbweichend: true,
    });
  });

  it("protokolliert den Hash der tatsaechlich versendeten Bytes", async () => {
    const inhalt = Buffer.from("%PDF-1.4 inhalt");
    const erwartet = require("crypto").createHash("sha256").update(inhalt).digest("hex");

    const r = await versendePaket(basis());
    expect(r.status === "SENT" && r.dokumente[0].hash).toBe(erwartet);
    // Der DB-Hash des Pool-Dokuments ist bewusst NICHT die Quelle.
    expect(r.status === "SENT" && r.dokumente[0].hash).not.toBe("x".repeat(64));
  });

  it("versendet Vorlagen als befuelltes PDF und legt sie mit Versandbezug ab", async () => {
    mockPrisma.starterpaketDokument.findMany.mockResolvedValue([]);
    mockPrisma.documentTemplate.findMany.mockResolvedValue([
      {
        id: VORLAGE_ID,
        name: "Willkommensschreiben",
        dateipfad: VORLAGE_PFAD,
        platzhalter: ["vorname"],
        modul: "ONBOARDING",
      },
    ]);
    mockRenderDocx.mockReturnValue({ buffer: Buffer.from("docx"), missing: ["ort"] });

    const r = await versendePaket(basis({ positionen: [{ art: "VORLAGE", id: VORLAGE_ID }] }));
    expect(r.status).toBe("SENT");

    // Anhang traegt den vereinbarten Dateinamen
    const mailArgs = mockSendEventEmail.mock.calls[0];
    expect(mailArgs[2].attachments[0].filename).toBe(
      "Willkommensschreiben_Mustermann_2026-09-04.pdf",
    );

    // Erzeugtes Dokument zeigt auf den Versand
    const gen = mockPrisma.generatedDocument.create.mock.calls[0][0].data;
    expect(gen).toMatchObject({ templateId: VORLAGE_ID, refId: REF, missingPlaceholders: ["ort"] });
    expect(gen.versandId).toBeDefined();

    // Leere Felder sind eine Warnung, kein Abbruch
    expect(r.status === "SENT" && r.warnungen[0]).toContain("ort");
  });

  it("zieht den Zeitstempel des Onboardings nach (Uebergang bis Baustein 9)", async () => {
    await versendePaket(basis());
    expect(mockPrisma.onboardingProcess.update).toHaveBeenCalledWith({
      where: { id: REF },
      data: { starterPacketSentAt: JETZT, starterPacketSentCount: { increment: 1 } },
    });
  });

  it("schreibt Nachweis, erzeugte Dokumente und Protokoll in EINER Transaktion", async () => {
    await versendePaket(basis());
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it("nennt im Pruefprotokoll die entschluesselten Felder", async () => {
    mockPrisma.starterpaketDokument.findMany.mockResolvedValue([]);
    mockPrisma.documentTemplate.findMany.mockResolvedValue([
      {
        id: VORLAGE_ID,
        name: "Abrechnungsdaten",
        dateipfad: VORLAGE_PFAD,
        platzhalter: ["vorname", "iban"],
        modul: "ONBOARDING",
      },
    ]);
    mockResolver.mockResolvedValue({ data: { iban: "DE…" }, sensitiveFields: ["iban"] });

    await versendePaket(
      basis({ positionen: [{ art: "VORLAGE", id: VORLAGE_ID, bestaetigt: true }] }),
    );

    const log = mockPrisma.auditLog.create.mock.calls[0][0].data;
    expect(log.action).toBe("DOKUMENTENPAKET_SENT");
    expect(log.details.sensitiveFields).toEqual(["iban"]);
    expect(log.details.empfaengerAbweichend).toBe(false);
  });
});

// =============================================
// Vorpruefung
// =============================================

const VORLAGE_SENSIBEL = {
  id: VORLAGE_ID,
  name: "Abrechnungsdaten",
  dateipfad: VORLAGE_PFAD,
  platzhalter: ["vorname", "iban", "steuer_id"],
  modul: "ONBOARDING",
};

describe("Vorpruefung", () => {
  it("reicht sensible Platzhalter NICHT an den Resolver — auch nicht bei Bestaetigung", async () => {
    // Der Kern: Die Vorpruefung entschluesselt nichts. Ob spaeter bestaetigt
    // wird, spielt hier keine Rolle.
    mockPrisma.starterpaketDokument.findMany.mockResolvedValue([]);
    mockPrisma.documentTemplate.findMany.mockResolvedValue([VORLAGE_SENSIBEL]);

    await pruefePaket({
      modul: "ONBOARDING",
      refId: REF,
      positionen: [{ art: "VORLAGE", id: VORLAGE_ID, bestaetigt: true }],
      session,
    });

    expect(mockResolver).toHaveBeenCalledWith(
      expect.objectContaining({ placeholders: ["vorname"] }),
    );
  });

  it("setzt fuer sensible Felder einen Marker, damit sie nicht als leer zaehlen", async () => {
    mockPrisma.starterpaketDokument.findMany.mockResolvedValue([]);
    mockPrisma.documentTemplate.findMany.mockResolvedValue([VORLAGE_SENSIBEL]);
    mockRenderDocx.mockReturnValue({ buffer: Buffer.from("docx"), missing: ["ort"] });

    const r = await pruefePaket({
      modul: "ONBOARDING",
      refId: REF,
      positionen: [{ art: "VORLAGE", id: VORLAGE_ID }],
      session,
    });

    // Marker landet in den Renderdaten ...
    const daten = mockRenderDocx.mock.calls[0][1];
    expect(daten.iban).toBe(SENSIBEL_MARKER);
    expect(daten.steuer_id).toBe(SENSIBEL_MARKER);

    // ... und die Position meldet nur das echte Loch, plus die Bestaetigungspflicht.
    expect(r.status).toBe("OK");
    if (r.status !== "OK") return;
    expect(r.pruefung.positionen[0]).toMatchObject({
      fehlendeFelder: ["ort"],
      bestaetigungNoetig: true,
      geschaetzt: true,
    });
    expect(r.pruefung.positionen[0].sensibleFelder.map((f) => f.key)).toEqual([
      "iban",
      "steuer_id",
    ]);
  });

  it("meldet Groessen: PDFs genau, Vorlagen geschaetzt", async () => {
    mockPrisma.documentTemplate.findMany.mockResolvedValue([VORLAGE_SENSIBEL]);
    mockReadUploadedFile.mockResolvedValue(Buffer.alloc(1000));
    mockRenderDocx.mockReturnValue({ buffer: Buffer.alloc(2000), missing: [] });

    const r = await pruefePaket({
      modul: "ONBOARDING",
      refId: REF,
      positionen: [
        { art: "PDF", id: PDF_ID },
        { art: "VORLAGE", id: VORLAGE_ID },
      ],
      session,
    });

    expect(r.status).toBe("OK");
    if (r.status !== "OK") return;
    expect(r.pruefung.gesamtGroesse).toBe(3000);
    expect(r.pruefung.gesamtGeschaetzt).toBe(true);
    expect(r.pruefung.ueberGroessenGrenze).toBe(false);
    expect(r.pruefung.positionen[0].geschaetzt).toBe(false);
  });

  it("warnt, wenn die Mailvorlage {{nachricht}} nicht kennt", async () => {
    mockResolveEventTemplate.mockResolvedValue({
      subject: "Willkommen",
      bodyHtml: "<p>Hallo {{vorname}}</p>",
      bodyText: null,
    });

    const r = await pruefePaket({
      modul: "ONBOARDING",
      refId: REF,
      positionen: [{ art: "PDF", id: PDF_ID }],
      session,
    });

    expect(r.status).toBe("OK");
    if (r.status !== "OK") return;
    expect(r.pruefung.mailvorlageKenntNachricht).toBe(false);
    expect(r.pruefung.warnungen.join(" ")).toContain("{{nachricht}}");
  });

  it("warnt beim nicht erreichbaren PDF-Dienst, bricht aber nicht ab", async () => {
    mockPrisma.starterpaketDokument.findMany.mockResolvedValue([]);
    mockPrisma.documentTemplate.findMany.mockResolvedValue([VORLAGE_SENSIBEL]);
    mockGotenbergReachable.mockResolvedValue(false);

    const r = await pruefePaket({
      modul: "ONBOARDING",
      refId: REF,
      positionen: [{ art: "VORLAGE", id: VORLAGE_ID }],
      session,
    });

    expect(r.status).toBe("OK");
    if (r.status !== "OK") return;
    expect(r.pruefung.pdfDienstErreichbar).toBe(false);
    expect(r.pruefung.warnungen.join(" ")).toContain("PDF");
  });

  it("nimmt eine leere Auswahl hin — der Dialog prueft waehrend des Zusammenstellens", async () => {
    const r = await pruefePaket({ modul: "ONBOARDING", refId: REF, positionen: [], session });
    expect(r.status).toBe("OK");
    if (r.status !== "OK") return;
    expect(r.pruefung.positionen).toEqual([]);
    expect(r.pruefung.gesamtGroesse).toBe(0);
  });

  it("haelt eine abweichende Adresse fest", async () => {
    const r = await pruefePaket({
      modul: "ONBOARDING",
      refId: REF,
      positionen: [],
      empfaenger: "privat@example.org",
      session,
    });
    expect(r.status).toBe("OK");
    if (r.status !== "OK") return;
    expect(r.pruefung.empfaengerVorgang).toBe("max@example.org");
    expect(r.pruefung.empfaengerAbweichend).toBe(true);
  });

  it("lehnt fremde Mandanten ab und persistiert nie etwas", async () => {
    mockCanAccessProcess.mockResolvedValue(false);
    const r = await pruefePaket({
      modul: "ONBOARDING",
      refId: REF,
      positionen: [{ art: "PDF", id: PDF_ID }],
      session,
    });
    expect(r).toMatchObject({ status: "FEHLER", fehler: "KEIN_ZUGRIFF" });
    nichtsGeschrieben();
    expect(mockSaveUploadedFile).not.toHaveBeenCalled();
  });
});

describe("HTTP-Zuordnung", () => {
  it("bildet jedes Fehlerbild auf einen Status ab", () => {
    expect(statusFuerFehler("KEIN_ZUGRIFF")).toBe(404);
    expect(statusFuerFehler("VORGANG_NICHT_GEFUNDEN")).toBe(404);
    expect(statusFuerFehler("VERSAND_LAEUFT")).toBe(409);
    expect(statusFuerFehler("LEERE_AUSWAHL")).toBe(409);
    expect(statusFuerFehler("BESTAETIGUNG_FEHLT")).toBe(409);
    expect(statusFuerFehler("ZU_GROSS")).toBe(413);
    expect(statusFuerFehler("PDF_DIENST")).toBe(502);
    expect(statusFuerFehler("VERSAND")).toBe(502);
    expect(statusFuerFehler("MODUL_NICHT_UNTERSTUETZT")).toBe(400);
  });
});

describe("Vorlagendateien lesen", () => {
  const vorlage = (dateipfad: string) => ({
    id: VORLAGE_ID,
    name: "Willkommensschreiben",
    dateipfad,
    platzhalter: ["vorname"],
    modul: "ONBOARDING",
  });

  beforeEach(() => {
    mockPrisma.starterpaketDokument.findMany.mockResolvedValue([]);
  });

  it("liest hochgeladene Vorlagen aus uploads/", async () => {
    mockPrisma.documentTemplate.findMany.mockResolvedValue([vorlage(VORLAGE_PFAD)]);
    const r = await versendePaket(basis({ positionen: [{ art: "VORLAGE", id: VORLAGE_ID }] }));
    expect(r.status).toBe("SENT");
    expect(mockReadFile).toHaveBeenCalledWith(VORLAGE_PFAD);
  });

  it("liest System-Vorlagen aus public/system-dokumente/", async () => {
    // Sie werden beim Start geseedet, nicht hochgeladen — readUploadedFile
    // wuerde sie abweisen. An dieser Stelle ist der Versand einmal gescheitert.
    mockPrisma.documentTemplate.findMany.mockResolvedValue([vorlage(SYSTEM_PFAD)]);
    const r = await versendePaket(basis({ positionen: [{ art: "VORLAGE", id: VORLAGE_ID }] }));
    expect(r.status).toBe("SENT");
    expect(mockReadFile).toHaveBeenCalledWith(SYSTEM_PFAD);
  });

  it("weist jeden anderen Pfad ab, auch wenn er in der Datenbank steht", async () => {
    // Der Pfad kommt aus der Datenbank. Eine manipulierte Zeile darf nicht
    // jede Datei des Servers als Anhang verschicken koennen.
    for (const boesartig of [
      "/etc/passwd",
      require("path").join(process.cwd(), ".env"),
      require("path").join(process.cwd(), "uploads", "..", ".env"),
    ]) {
      mockPrisma.documentTemplate.findMany.mockResolvedValue([vorlage(boesartig)]);
      const r = await versendePaket(basis({ positionen: [{ art: "VORLAGE", id: VORLAGE_ID }] }));
      expect(r).toMatchObject({ status: "FEHLER", fehler: "DATEI_FEHLT" });
      expect(mockSendEventEmail).not.toHaveBeenCalled();
    }
  });
});

describe("Freitext im HTML-Teil", () => {
  it("maskiert alles, was die Mail zerlegen koennte", () => {
    // Die Nachricht kommt aus einem Eingabefeld und landet im HTML-Teil.
    expect(alsHtmlAbsaetze('<script>alert("x")</script>')).toBe(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;",
    );
    expect(alsHtmlAbsaetze("Meier & Sohn")).toBe("Meier &amp; Sohn");
  });

  it("behaelt Absaetze als <br>", () => {
    expect(alsHtmlAbsaetze("Zeile 1\nZeile 2")).toBe("Zeile 1<br>Zeile 2");
    expect(alsHtmlAbsaetze("Zeile 1\r\nZeile 2")).toBe("Zeile 1<br>Zeile 2");
  });

  it("reicht die unmaskierte Fassung an den Textteil und die maskierte an HTML", async () => {
    await versendePaket(basis({ nachricht: "Meier & Sohn\nBis Montag" }));
    const payload = mockSendEventEmail.mock.calls[0][1];
    expect(payload.nachricht).toBe("Meier & Sohn\nBis Montag");
    expect(payload.nachricht_html).toBe("Meier &amp; Sohn<br>Bis Montag");
  });

  it("liefert die Anhangliste in beiden Fassungen", async () => {
    await versendePaket(basis());
    const payload = mockSendEventEmail.mock.calls[0][1];
    expect(payload.dokumentenliste).toBe("1. Leitbild");
    expect(payload.dokumentenliste_html).toContain("<li>Leitbild</li>");
    expect(payload.sachbearbeiter_name).toBe("Erika Sachbearbeiter");
  });
});

describe("Standardvorlage des Starterpakets", () => {
  const vorlage = DEFAULT_EMAIL_TEMPLATES.find(
    (t) => t.event === "onboarding-starter-packet-sent",
  );

  it("existiert", () => {
    expect(vorlage).toBeDefined();
  });

  it("kennt die Nachricht als bedingten Block — sonst warnt die Vorpruefung zu Recht", () => {
    expect(vorlage!.bodyHtml).toContain("{{#nachricht}}");
    expect(vorlage!.bodyHtml).toContain("{{nachricht_html}}");
    expect(vorlage!.bodyText).toContain("{{#nachricht}}");
    expect(vorlage!.bodyText).toContain("{{nachricht}}");
  });

  it("nennt die Anhaenge und den Absender", () => {
    expect(vorlage!.bodyHtml).toContain("{{dokumentenliste_html}}");
    expect(vorlage!.bodyText).toContain("{{dokumentenliste}}");
    expect(vorlage!.bodyHtml).toContain("{{sachbearbeiter_name}}");
    expect(vorlage!.bodyText).toContain("{{sachbearbeiter_name}}");
  });

  it("maskiert den Freitext im HTML-Teil und nicht im Textteil", () => {
    // Der HTML-Teil muss {{nachricht_html}} nehmen; {{nachricht}} dort waere
    // eine offene Tuer fuer Markup aus dem Eingabefeld.
    const htmlOhneBlockmarker = vorlage!.bodyHtml
      .split("{{#nachricht}}")
      .join("")
      .split("{{/nachricht}}")
      .join("");
    expect(htmlOhneBlockmarker).not.toContain("{{nachricht}}");
  });
});

// =============================================
// Haertung aus dem Audit (credo-check / edge-cases)
// =============================================

describe("Datum in deutscher Zeit", () => {
  it("nimmt den deutschen Kalendertag, nicht den von UTC", () => {
    // 00:30 deutscher Sommerzeit ist UTC noch der Vortag. Der Dateiname ist
    // Teil des Nachweises — er soll den Tag nennen, an dem hier gearbeitet wurde.
    expect(deutschesDatum(new Date("2026-09-04T22:30:00.000Z"))).toBe("2026-09-05");
    // Und im Winter (UTC+1) genauso.
    expect(deutschesDatum(new Date("2026-01-14T23:30:00.000Z"))).toBe("2026-01-15");
    expect(deutschesDatum(new Date("2026-09-04T10:00:00.000Z"))).toBe("2026-09-04");
  });

  it("schlaegt bis in den Dateinamen durch", () => {
    expect(
      vorlagenDateiname("Anschreiben", "Meier", new Date("2026-09-04T22:30:00.000Z")),
    ).toBe("Anschreiben_Meier_2026-09-05.pdf");
  });
});

describe("Doppelversand", () => {
  it("laesst nur einen Versand je Vorgang gleichzeitig zu", async () => {
    // Der Dialog sperrt seinen Knopf — zwei parallele API-Aufrufe wuerden
    // trotzdem zweimal verschicken. Eine Mail laesst sich nicht zurueckholen.
    let freigeben: () => void = () => undefined;
    mockSendEventEmail.mockImplementation(
      () =>
        new Promise((res) => {
          freigeben = () =>
            res({ status: "SENT", messageId: "<a>", recipient: "max@example.org", subject: "W" });
        }),
    );

    const ersterLauf = versendePaket(basis());
    // Kurz warten, damit der erste Aufruf die Sperre wirklich haelt.
    await new Promise((r) => setImmediate(r));
    const zweiterLauf = await versendePaket(basis());

    expect(zweiterLauf).toMatchObject({ status: "FEHLER", fehler: "VERSAND_LAEUFT" });
    expect(mockSendEventEmail).toHaveBeenCalledTimes(1);

    freigeben();
    expect((await ersterLauf).status).toBe("SENT");
  });

  it("gibt die Sperre auch nach einem Fehlschlag wieder frei", async () => {
    // Sonst waere der Vorgang dauerhaft blockiert.
    mockSendEventEmail.mockResolvedValue({ status: "FAILED", detail: "SMTP weg" });
    expect((await versendePaket(basis())).status).toBe("FEHLER");

    mockSendEventEmail.mockResolvedValue({
      status: "SENT",
      messageId: "<a>",
      recipient: "max@example.org",
      subject: "W",
    });
    expect((await versendePaket(basis())).status).toBe("SENT");
  });
});

describe("Nachweis scheitert nach dem Versand", () => {
  // Der Fehlschlag wird bewusst geloggt — im Testlauf ist das nur Laerm und
  // koennte echte Fehler verdecken.
  let konsole: jest.SpyInstance;
  beforeAll(() => {
    konsole = jest.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterAll(() => konsole.mockRestore());

  beforeEach(() => {
    mockPrisma.starterpaketDokument.findMany.mockResolvedValue([]);
    mockPrisma.documentTemplate.findMany.mockResolvedValue([
      {
        id: VORLAGE_ID,
        name: "Willkommensschreiben",
        dateipfad: VORLAGE_PFAD,
        platzhalter: ["vorname"],
        modul: "ONBOARDING",
      },
    ]);
    mockSaveUploadedFile
      .mockResolvedValueOnce("uploads/x/a.docx")
      .mockResolvedValueOnce("uploads/x/a.pdf");
    mockPrisma.$transaction.mockRejectedValue(new Error("Datenbank weg"));
  });

  it("meldet trotzdem SENT — sonst verschickt jemand dasselbe Paket erneut", async () => {
    const r = await versendePaket(basis({ positionen: [{ art: "VORLAGE", id: VORLAGE_ID }] }));
    expect(r.status).toBe("SENT");
    expect(r.status === "SENT" && r.warnungen.join(" ")).toContain("NICHT wiederholen");
  });

  it("raeumt die eben abgelegten, nun unreferenzierten Dateien weg", async () => {
    await versendePaket(basis({ positionen: [{ art: "VORLAGE", id: VORLAGE_ID }] }));
    expect(mockUnlink).toHaveBeenCalledWith("uploads/x/a.docx");
    expect(mockUnlink).toHaveBeenCalledWith("uploads/x/a.pdf");
  });
});

// =============================================
// Behobene Review-Befunde
// =============================================

describe("Dateiname behaelt seine Endung", () => {
  it("kuerzt den Namen, nicht die Endung", () => {
    // Vorher wurde erst ".pdf" angehaengt und dann auf 150 Zeichen gekuerzt —
    // bei langen Vorlagennamen fiel die Endung weg. Danach traf
    // replace(/\.pdf$/i, ".docx") beim Ablegen nicht mehr, und Word- und
    // PDF-Fassung landeten unter demselben Pfad.
    const name = vorlagenDateiname("V".repeat(200), "Mustermann", JETZT);
    expect(name.endsWith(".pdf")).toBe(true);
    expect(name.replace(/\.pdf$/i, ".docx")).not.toBe(name);
    expect(name.length).toBeLessThanOrEqual(144);
  });
});

describe("Groessengrenze misst die versendete Nachricht", () => {
  it("rechnet die base64-Kodierung ein", () => {
    expect(kodierteGroesse(3)).toBe(4);
    expect(kodierteGroesse(MAX_PAKET_BYTES)).toBeGreaterThan(MAX_PAKET_BYTES);
  });

  it("weist ein Paket ab, das erst kodiert zu gross wird", async () => {
    // Rohbytes unter der Grenze, base64 darueber: genau der Fall, den die alte
    // Pruefung durchgelassen haette und den der Posteingang abweist.
    const roh = Math.floor(MAX_PAKET_BYTES * 0.8);
    expect(roh).toBeLessThan(MAX_PAKET_BYTES);
    expect(kodierteGroesse(roh)).toBeGreaterThan(MAX_PAKET_BYTES);

    mockReadUploadedFile.mockResolvedValue(Buffer.alloc(roh));
    const r = await versendePaket(basis());
    expect(r).toMatchObject({ status: "FEHLER", fehler: "ZU_GROSS" });
    expect(mockSendEventEmail).not.toHaveBeenCalled();
  });
});

describe("Empfaenger: Zusage des Dialogs gilt", () => {
  it("erzwingt die gewaehlte Adresse per overrideTo", async () => {
    // Ohne overrideTo entscheidet die Mailvorlage ("Vorlagen-Feld vor
    // Katalog-Default") — ein dort gesetztes An-Feld schluege die Auswahl.
    await versendePaket(basis({ empfaenger: "privat@example.org" }));
    expect(mockSendEventEmail).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Object),
      expect.objectContaining({ overrideTo: "privat@example.org" }),
    );
  });

  it("haelt im Nachweis fest, wohin tatsaechlich zugestellt wurde", async () => {
    // Der Mailer meldet eine andere Adresse zurueck, als angefordert wurde.
    // Der Nachweis muss seiner Meldung folgen, nicht unserer Absicht.
    mockSendEventEmail.mockResolvedValue({
      status: "SENT",
      messageId: "<a>",
      recipient: "verteiler@example.org",
      subject: "W",
    });
    const r = await versendePaket(basis({ empfaenger: "privat@example.org" }));

    const daten = mockPrisma.dokumentenVersand.create.mock.calls[0][0].data;
    expect(daten.empfaenger).toBe("verteiler@example.org");
    expect(daten.empfaengerAbweichend).toBe(true);
    expect(r.status === "SENT" && r.empfaenger).toBe("verteiler@example.org");
  });
});

describe("Nachweis kennt die erzeugten Dokumente", () => {
  it("zieht die generatedDocumentId in positionen nach", async () => {
    // Der create serialisiert positionen, BEVOR die IDs feststehen — ohne das
    // Nachziehen bliebe die Verknuepfung Nachweis -> Datei dauerhaft leer.
    mockPrisma.starterpaketDokument.findMany.mockResolvedValue([]);
    mockPrisma.documentTemplate.findMany.mockResolvedValue([
      {
        id: VORLAGE_ID,
        name: "Willkommensschreiben",
        dateipfad: VORLAGE_PFAD,
        platzhalter: ["vorname"],
        modul: "ONBOARDING",
      },
    ]);

    await versendePaket(basis({ positionen: [{ art: "VORLAGE", id: VORLAGE_ID }] }));

    expect(mockPrisma.dokumentenVersand.update).toHaveBeenCalledTimes(1);
    const nachgezogen = mockPrisma.dokumentenVersand.update.mock.calls[0][0];
    expect(nachgezogen.data.positionen[0].generatedDocumentId).toBe("gen-1");
  });
});

describe("Nachweis scheitert: Ersatzprotokoll", () => {
  let konsole: jest.SpyInstance;
  beforeAll(() => {
    konsole = jest.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterAll(() => konsole.mockRestore());

  it("schreibt ein eigenstaendiges Protokoll ausserhalb der Transaktion", async () => {
    // Nachweis UND Pruefprotokoll lagen in derselben Transaktion. Faellt sie,
    // bliebe nur das EmailLog — ohne Hashes, ohne entschluesselte Felder, und
    // nach 90 Tagen weg. Fuer eine Mail mit Art.-9-Daten zu wenig.
    mockPrisma.$transaction.mockRejectedValue(new Error("Datenbank weg"));

    const r = await versendePaket(basis());
    expect(r.status).toBe("SENT");

    const eintraege = mockPrisma.auditLog.create.mock.calls.map((c) => c[0].data.action);
    expect(eintraege).toContain("DOKUMENTENPAKET_NACHWEIS_FEHLGESCHLAGEN");

    const ersatz = mockPrisma.auditLog.create.mock.calls.find(
      (c) => c[0].data.action === "DOKUMENTENPAKET_NACHWEIS_FEHLGESCHLAGEN",
    )[0].data;
    expect(ersatz.details.empfaenger).toBe("max@example.org");
    expect(ersatz.details.dokumente[0].name).toBe("Leitbild");
    expect(ersatz.details.grund).toContain("Datenbank weg");
  });
});

describe("Bestandsvorgaenge gelten nicht als unversendet", () => {
  it("reicht den Altversand ins Angebot durch", async () => {
    // Ohne das stuende nach dem Deploy bei jedem Bestandsvorgang "Noch nicht
    // versendet" — und jemand schickte die Unterlagen ein zweites Mal.
    mockPrisma.onboardingProcess.findUnique.mockResolvedValue({
      email: "max@example.org",
      firstName: "Max",
      lastName: "Mustermann",
      displayId: "2026-GYM-001",
      organizationId: ORG,
      organization: { name: "Gymnasium" },
      personalData: null,
      starterPacketSentAt: new Date("2026-06-01T09:00:00.000Z"),
      starterPacketSentCount: 2,
    });
    mockPrisma.starterpaketAuswahl.findMany.mockResolvedValue([]);
    mockPrisma.dokumentenVersand.findMany.mockResolvedValue([]);

    const r = await ladePaketAngebot({ modul: "ONBOARDING", refId: REF, session });
    expect(r.status).toBe("OK");
    if (r.status !== "OK") return;
    expect(r.angebot.verlauf).toEqual([]);
    expect(r.angebot.altversand).toEqual({
      am: new Date("2026-06-01T09:00:00.000Z"),
      anzahl: 2,
    });
  });

  it("meldet null, wenn nie etwas versendet wurde", async () => {
    mockPrisma.starterpaketAuswahl.findMany.mockResolvedValue([]);
    mockPrisma.dokumentenVersand.findMany.mockResolvedValue([]);
    const r = await ladePaketAngebot({ modul: "ONBOARDING", refId: REF, session });
    expect(r.status === "OK" && r.angebot.altversand).toBeNull();
  });
});
