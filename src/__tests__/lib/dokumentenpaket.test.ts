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
  dokumentenVersand: { create: jest.fn() },
  generatedDocument: { create: jest.fn() },
  auditLog: { create: jest.fn() },
  $transaction: jest.fn(),
};
const mockCanAccessProcess = jest.fn();
const mockSendEventEmail = jest.fn();
const mockRenderDocx = jest.fn();
const mockConvertDocxToPdf = jest.fn();
const mockGotenbergReachable = jest.fn();
const mockReadUploadedFile = jest.fn();
const mockSaveUploadedFile = jest.fn();
const mockResolver = jest.fn();

jest.mock("@/lib/db", () => ({ prisma: mockPrisma }));
jest.mock("@/lib/permissions", () => ({
  ...jest.requireActual("@/lib/permissions"),
  canAccessProcess: (...a: unknown[]) => mockCanAccessProcess(...a),
}));
jest.mock("@/lib/mailer", () => ({ sendEventEmail: (...a: unknown[]) => mockSendEventEmail(...a) }));
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

import {
  versendePaket,
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
  mockSaveUploadedFile.mockResolvedValue("uploads/irgendwo/datei");
  mockGotenbergReachable.mockResolvedValue(true);
  mockRenderDocx.mockReturnValue({ buffer: Buffer.from("docx"), missing: [] });
  mockConvertDocxToPdf.mockResolvedValue(Buffer.from("%PDF-1.4 gewandelt"));
  mockResolver.mockResolvedValue({ data: { vorname: "Max" }, sensitiveFields: [] });
  mockSendEventEmail.mockResolvedValue({
    status: "SENT",
    messageId: "<abc@fes>",
    recipient: "max@example.org",
    subject: "Herzlich willkommen",
  });
  mockPrisma.dokumentenVersand.create.mockResolvedValue({});
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
        dateipfad: "brief-vorlagen/a.docx",
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
        dateipfad: "brief-vorlagen/w.docx",
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
        dateipfad: "brief-vorlagen/w.docx",
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
        dateipfad: "brief-vorlagen/a.docx",
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
