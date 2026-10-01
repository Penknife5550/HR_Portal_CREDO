/**
 * Tests: Individuelle E-Mail — Server-Dienst (src/lib/individuelle-mail-dienst.ts)
 *
 * Schwerpunkt sind die Zusagen aus dem Kopf der Datei:
 *  - Mandant selbst pruefen (unbekannt und fremd = dieselbe 404),
 *  - abweichende Adressen nur mit Freigabe, VOR dem Versand,
 *  - Typ aus den Bytes, Name bereinigt,
 *  - Nachweis nur nach SENT, in einer Transaktion; scheitert sie, bleibt SENT,
 *  - ein zweiter Versuch derselben Dialog-Kennung schickt nichts.
 */

const mockPrisma = {
  onboardingProcess: { findUnique: jest.fn() },
  offboardingProcess: { findUnique: jest.fn() },
  civilServiceProcess: { findUnique: jest.fn() },
  contractEndProcess: { findUnique: jest.fn() },
  individuelleMail: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
  individuelleMailAnhang: { findUnique: jest.fn(), update: jest.fn() },
  auditLog: { create: jest.fn() },
  smtpConfig: { findUnique: jest.fn() },
  $transaction: jest.fn(),
};
const mockCanAccessProcess = jest.fn();
const mockSendEventEmail = jest.fn();
const mockSaveUploadedFile = jest.fn();
const mockDateiLoeschen = jest.fn();
const mockDirLoeschen = jest.fn();
const mockPfadInWurzeln = jest.fn();
const mockReadFile = jest.fn();

jest.mock("fs/promises", () => ({
  ...jest.requireActual("fs/promises"),
  readFile: (...a: unknown[]) => mockReadFile(...a),
}));
jest.mock("@/lib/db", () => ({ prisma: mockPrisma }));
jest.mock("@/lib/permissions", () => ({
  ...jest.requireActual("@/lib/permissions"),
  canAccessProcess: (...a: unknown[]) => mockCanAccessProcess(...a),
}));
jest.mock("@/lib/mailer", () => ({
  // Echtes renderEventEmail fuer den Vorlagentest, nur der Versand ist eine Attrappe.
  ...jest.requireActual("@/lib/mailer"),
  sendEventEmail: (...a: unknown[]) => mockSendEventEmail(...a),
}));
jest.mock("@/lib/file-upload", () => ({
  ...jest.requireActual("@/lib/file-upload"),
  saveUploadedFile: (...a: unknown[]) => mockSaveUploadedFile(...a),
  dateiLoeschen: (...a: unknown[]) => mockDateiLoeschen(...a),
  deleteUploadedDirIfEmpty: (...a: unknown[]) => mockDirLoeschen(...a),
  pfadInWurzeln: (...a: unknown[]) => mockPfadInWurzeln(...a),
}));

import path from "path";
import {
  ANHANG_WURZEL,
  anhangLaden,
  individuelleMailsAufraeumen,
  mailPayload,
  mailSenden,
  uebersichtLaden,
  type MailSendenOptionen,
} from "@/lib/individuelle-mail-dienst";
import { INDIVIDUELLE_MAIL_AUDIT, MAX_ANHAENGE_BYTES, MELDUNGEN } from "@/lib/individuelle-mail";
import { DEFAULT_EMAIL_TEMPLATES } from "@/lib/default-email-templates";
import { getEventDefinition } from "@/lib/events";
import { renderEventEmail } from "@/lib/mailer";

const REF = "11111111-1111-4111-8111-111111111111";
const KENNUNG = "22222222-2222-4222-8222-222222222222";
const session = { userId: "u1", email: "hr@fes.de", role: "HR_SACHBEARBEITER", firstName: "Erika", lastName: "Muster" };
const PDF = Buffer.from("%PDF-1.4\nInhalt\n%%EOF\n", "latin1");
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

function onboarding(extra: Record<string, unknown> = {}) {
  return {
    email: "anna@privat.example",
    firstName: "Anna",
    lastName: "Beispiel",
    displayId: "2026-GYM-014",
    organizationId: "org-1",
    organization: { name: "FES Gymnasium" },
    personalData: null,
    ...extra,
  };
}

function opts(extra: Partial<MailSendenOptionen> = {}): MailSendenOptionen {
  return {
    modul: "ONBOARDING",
    refId: REF,
    dialogKennung: KENNUNG,
    empfaenger: "anna@privat.example",
    betreff: "Ihr unterschriebener Arbeitsvertrag",
    nachricht: "Guten Tag Frau Beispiel,\r\nanbei der Vertrag.",
    dateien: [{ name: "Arbeitsvertrag.pdf", inhalt: PDF }],
    session,
    ipAddress: "10.0.0.1",
    ...extra,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.onboardingProcess.findUnique.mockResolvedValue(onboarding());
  mockPrisma.individuelleMail.findUnique.mockResolvedValue(null);
  mockPrisma.individuelleMail.findMany.mockResolvedValue([]);
  mockPrisma.smtpConfig.findUnique.mockResolvedValue({ allowedRecipientDomains: "", replyToEmail: "personal@fes.example" });
  mockPrisma.$transaction.mockImplementation(async (fn: (tx: typeof mockPrisma) => unknown) => fn(mockPrisma));
  mockCanAccessProcess.mockResolvedValue(true);
  mockSendEventEmail.mockResolvedValue({
    status: "SENT",
    messageId: "<m1@smtp>",
    recipient: "anna@privat.example",
    subject: "Ihr unterschriebener Arbeitsvertrag",
  });
  mockSaveUploadedFile.mockImplementation(async (_b: Buffer, dir: string, name: string) =>
    path.join(process.cwd(), "uploads", dir, name),
  );
  mockDateiLoeschen.mockResolvedValue("geloescht");
  mockPrisma.auditLog.create.mockResolvedValue({});
});

describe("mailSenden — Erfolg", () => {
  it("schickt per sendEventEmail mit overrideTo, Anhaengen und Vorgangsbezug", async () => {
    const e = await mailSenden(opts());
    expect(e.ok).toBe(true);
    expect(mockSendEventEmail).toHaveBeenCalledTimes(1);
    const [event, payload, optionen] = mockSendEventEmail.mock.calls[0];
    expect(event).toBe("individuelle-mail");
    expect(payload).toMatchObject({
      betreff: "Ihr unterschriebener Arbeitsvertrag",
      nachricht: "Guten Tag Frau Beispiel,\nanbei der Vertrag.",
      nachricht_html: "Guten Tag Frau Beispiel,<br>anbei der Vertrag.",
      einrichtung: "FES Gymnasium",
      absender_name: "Erika Muster",
      anhaenge_anzahl: "1",
      anhaenge_liste: "- Arbeitsvertrag.pdf",
    });
    expect(optionen.overrideTo).toBe("anna@privat.example");
    expect(optionen.bezug).toEqual({ vorgangTyp: "ONBOARDING", vorgangId: REF });
    expect(optionen.attachments).toEqual([
      { filename: "Arbeitsvertrag.pdf", content: PDF, contentType: "application/pdf" },
    ]);
  });

  it("schreibt Nachweis samt Anhang und AuditLog in EINER Transaktion, nach dem Versand", async () => {
    const e = await mailSenden(opts());
    if (!e.ok) throw new Error(e.meldung);
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    const daten = mockPrisma.individuelleMail.create.mock.calls[0][0].data;
    expect(daten).toMatchObject({
      modul: "ONBOARDING",
      refId: REF,
      dialogKennung: KENNUNG,
      empfaenger: "anna@privat.example",
      empfaengerAbweichend: false,
      messageId: "<m1@smtp>",
      sentById: "u1",
    });
    const anhang = daten.anhaenge.create[0];
    expect(anhang.dateipfad).toMatch(/^individuelle-mails\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.pdf$/);
    expect(anhang.sha256).toHaveLength(64);
    const audit = mockPrisma.auditLog.create.mock.calls[0][0].data;
    expect(audit).toMatchObject({
      onboardingId: REF,
      processType: "ONBOARDING",
      action: INDIVIDUELLE_MAIL_AUDIT.VERSENDET,
      ipAddress: "10.0.0.1",
    });
    // Im Protokoll nur die Laenge der Nachricht, nie der Text.
    expect(JSON.stringify(audit.details)).not.toContain("anbei der Vertrag");
    expect(audit.details.nachrichtLaenge).toBeGreaterThan(0);
    expect(e.daten.mailId).toBe(daten.id);
    expect(e.daten.anhaenge[0].verfuegbar).toBe(true);
    expect(mockSendEventEmail.mock.invocationCallOrder[0]).toBeLessThan(
      mockPrisma.$transaction.mock.invocationCallOrder[0],
    );
  });

  it("Offboarding: private UND dienstliche Adresse sind ohne Freigabeliste erlaubt", async () => {
    mockPrisma.offboardingProcess.findUnique.mockResolvedValue({
      employeeEmail: "max@fes-schule.de",
      employeePrivateEmail: "max@privat.example",
      employeeFirstName: "Max",
      employeeLastName: "Muster",
      displayId: "OFF-1",
      organizationId: "org-1",
      organization: { name: "FES" },
    });
    mockPrisma.smtpConfig.findUnique.mockResolvedValue({ allowedRecipientDomains: "fes-credo.de", replyToEmail: "" });
    const e = await mailSenden(opts({ modul: "OFFBOARDING", empfaenger: "max@fes-schule.de" }));
    expect(e.ok).toBe(true);
    expect(mockPrisma.auditLog.create.mock.calls[0][0].data).toMatchObject({
      offboardingId: REF,
      processType: "OFFBOARDING",
    });
  });

  it("ohne Anhang geht es auch, die Liste bleibt leer (Block der Vorlage entfaellt)", async () => {
    const e = await mailSenden(opts({ dateien: [] }));
    expect(e.ok).toBe(true);
    expect(mockSendEventEmail.mock.calls[0][1].anhaenge_liste).toBe("");
    expect(mockSendEventEmail.mock.calls[0][2].attachments).toEqual([]);
  });

  it("bereinigt Dateinamen: die Endung folgt immer dem erkannten Typ", async () => {
    const e = await mailSenden(opts({ dateien: [{ name: "C:\\Users\\x\\foto.hta", inhalt: PNG }] }));
    if (!e.ok) throw new Error(e.meldung);
    expect(e.daten.anhaenge[0].dateiname).toBe("foto.png");
    expect(mockSendEventEmail.mock.calls[0][2].attachments[0]).toMatchObject({
      filename: "foto.png",
      contentType: "image/png",
    });
  });
});

describe("mailSenden — Schranken vor dem Versand", () => {
  function nichtsGeschickt() {
    expect(mockSendEventEmail).not.toHaveBeenCalled();
    expect(mockPrisma.individuelleMail.create).not.toHaveBeenCalled();
    expect(mockSaveUploadedFile).not.toHaveBeenCalled();
  }

  it("fremder Mandant ergibt dieselbe 404 wie ein unbekannter Vorgang", async () => {
    mockCanAccessProcess.mockResolvedValue(false);
    const fremd = await mailSenden(opts());
    mockCanAccessProcess.mockResolvedValue(true);
    mockPrisma.onboardingProcess.findUnique.mockResolvedValue(null);
    const unbekannt = await mailSenden(opts());
    expect(fremd).toEqual(unbekannt);
    expect(fremd).toMatchObject({ ok: false, fehler: "VORGANG_NICHT_GEFUNDEN" });
    nichtsGeschickt();
  });

  it("Modul ohne Karte (Elternzeit) wird abgewiesen", async () => {
    expect(await mailSenden(opts({ modul: "ELTERNZEIT" }))).toMatchObject({ ok: false, fehler: "MODUL_NICHT_UNTERSTUETZT" });
    nichtsGeschickt();
  });

  it("abweichende Adresse ohne freigegebene Domain: 409, nichts geschickt", async () => {
    mockPrisma.smtpConfig.findUnique.mockResolvedValue({ allowedRecipientDomains: "fes-credo.de", replyToEmail: "" });
    const e = await mailSenden(opts({ empfaenger: "fremd@gmail.com" }));
    expect(e).toMatchObject({ ok: false, fehler: "EMPFAENGER_NICHT_ERLAUBT" });
    nichtsGeschickt();
  });

  it("abweichende Adresse mit freigegebener Domain geht, vermerkt als abweichend", async () => {
    mockPrisma.smtpConfig.findUnique.mockResolvedValue({ allowedRecipientDomains: "fes-credo.de", replyToEmail: "" });
    mockSendEventEmail.mockResolvedValue({ status: "SENT", recipient: "x@fes-credo.de", subject: "B" });
    const e = await mailSenden(opts({ empfaenger: "x@fes-credo.de" }));
    expect(e.ok).toBe(true);
    expect(mockPrisma.individuelleMail.create.mock.calls[0][0].data.empfaengerAbweichend).toBe(true);
  });

  it("leere Freigabeliste schraenkt nicht ein", async () => {
    const e = await mailSenden(opts({ empfaenger: "irgendwer@example.com" }));
    expect(e.ok).toBe(true);
  });

  it.each([
    [{ betreff: "" }, MELDUNGEN.betreffFehlt],
    [{ betreff: "Zeile\nzwei" }, "Der Betreff darf keinen Zeilenumbruch enthalten."],
    [{ nachricht: "   " }, MELDUNGEN.nachrichtFehlt],
    [{ empfaenger: "kaputt" }, MELDUNGEN.adresseUngueltig],
  ])("Eingabe %o → 400", async (aenderung, meldung) => {
    expect(await mailSenden(opts(aenderung))).toEqual({ ok: false, fehler: "EINGABE_UNGUELTIG", meldung });
    nichtsGeschickt();
  });

  it("Zeilenumbrueche aus dem Formular (\\r\\n) zaehlen wie im Dialog nur einfach", async () => {
    // 4.000 Zeichen + 999 Umbrueche = 4.999 im Dialog, als \r\n aber 5.998.
    const zeilen = Array.from({ length: 1000 }, () => "abcd").join("\r\n");
    const e = await mailSenden(opts({ nachricht: zeilen }));
    expect(e.ok).toBe(true);
    expect(mockSendEventEmail.mock.calls[0][1].nachricht).toBe(zeilen.replace(/\r\n/g, "\n"));
  });

  it("Typ aus den Bytes: ein .pdf, das keines ist, wird abgewiesen (415)", async () => {
    const e = await mailSenden(opts({ dateien: [{ name: "rechnung.pdf", inhalt: Buffer.from("MZ\x90\x00 exe") }] }));
    expect(e).toMatchObject({ ok: false, fehler: "DATEITYP" });
    nichtsGeschickt();
  });

  it("abgeschnittenes PDF: 400 mit Handlungsanweisung", async () => {
    const e = await mailSenden(opts({ dateien: [{ name: "scan.pdf", inhalt: Buffer.from("%PDF-1.4 ohne Ende") }] }));
    expect(e).toMatchObject({ ok: false, fehler: "DATEI_UNGUELTIG" });
    if (!e.ok) expect(e.meldung).toContain(MELDUNGEN.pdfUnvollstaendig);
    nichtsGeschickt();
  });

  it("zusammen ueber 9 MB: 413", async () => {
    const gross = Buffer.concat([PDF, Buffer.alloc(MAX_ANHAENGE_BYTES)]);
    expect(await mailSenden(opts({ dateien: [{ name: "gross.pdf", inhalt: gross }] }))).toMatchObject({
      ok: false,
      fehler: "ZU_GROSS",
    });
    nichtsGeschickt();
  });

  it("mehr als 10 Dateien werden abgewiesen", async () => {
    const dateien = Array.from({ length: 11 }, (_, i) => ({ name: `${i}.pdf`, inhalt: PDF }));
    expect(await mailSenden(opts({ dateien }))).toMatchObject({ ok: false, fehler: "DATEI_UNGUELTIG" });
    nichtsGeschickt();
  });
});

describe("mailSenden — Ergebnis des Mailservers", () => {
  it("Vorlage aus (SKIPPED): 409 VORLAGE_AUS, kein Nachweis", async () => {
    mockSendEventEmail.mockResolvedValue({ status: "SKIPPED", detail: "E-Mail-Vorlage ist deaktiviert" });
    expect(await mailSenden(opts())).toMatchObject({ ok: false, fehler: "VORLAGE_AUS" });
    expect(mockPrisma.individuelleMail.create).not.toHaveBeenCalled();
    expect(mockSaveUploadedFile).not.toHaveBeenCalled();
  });

  it("FAILED: 502 VERSAND mit Grund, kein Nachweis", async () => {
    mockSendEventEmail.mockResolvedValue({ status: "FAILED", detail: "550 mailbox unavailable" });
    const e = await mailSenden(opts());
    expect(e).toMatchObject({ ok: false, fehler: "VERSAND" });
    if (!e.ok) expect(e.meldung).toContain("550 mailbox unavailable");
    expect(mockPrisma.individuelleMail.create).not.toHaveBeenCalled();
  });

  it("Nachweis scheitert nach dem Versand: SENT mit Warnung, Ersatzprotokoll, abgelegte Dateien weg", async () => {
    mockPrisma.$transaction.mockRejectedValue(new Error("DB weg"));
    const e = await mailSenden(opts({ dialogKennung: "33333333-3333-4333-8333-333333333333" }));
    if (!e.ok) throw new Error(e.meldung);
    expect(e.daten.mailId).toBeNull();
    expect(e.daten.warnungen[0]).toBe(MELDUNGEN.nachweisFehlt);
    expect(e.daten.anhaenge[0].verfuegbar).toBe(false);
    expect(mockDateiLoeschen).toHaveBeenCalledWith(expect.stringContaining("individuelle-mails"), [ANHANG_WURZEL]);
    expect(mockPrisma.auditLog.create.mock.calls[0][0].data.action).toBe(INDIVIDUELLE_MAIL_AUDIT.NACHWEIS_FEHLGESCHLAGEN);

    // Der zweite Klick desselben Dialogs schickt NICHT noch einmal.
    mockSendEventEmail.mockClear();
    const zweiter = await mailSenden(opts({ dialogKennung: "33333333-3333-4333-8333-333333333333" }));
    expect(zweiter).toMatchObject({ ok: true, daten: { wiederholt: true } });
    expect(mockSendEventEmail).not.toHaveBeenCalled();

    // Der Merker gilt 24 Stunden, danach wird er verworfen (keine unbegrenzte Liste).
    const echt = Date.now;
    Date.now = () => echt() + 25 * 60 * 60 * 1000;
    try {
      mockPrisma.$transaction.mockImplementation(async (fn: (tx: typeof mockPrisma) => unknown) => fn(mockPrisma));
      const spaeter = await mailSenden(opts({ dialogKennung: "33333333-3333-4333-8333-333333333333" }));
      expect(spaeter).toMatchObject({ ok: true, daten: { wiederholt: false } });
      expect(mockSendEventEmail).toHaveBeenCalledTimes(1);
    } finally {
      Date.now = echt;
    }
  });
});

describe("mailSenden — einmal je Dialog", () => {
  it("eine schon gespeicherte Kennung desselben Vorgangs: kein Versand, Ergebnis des ersten", async () => {
    mockPrisma.individuelleMail.findUnique.mockResolvedValue({
      id: "m1",
      modul: "ONBOARDING",
      refId: REF,
      createdAt: new Date("2026-10-01T10:00:00Z"),
      empfaenger: "anna@privat.example",
      empfaengerAbweichend: false,
      betreff: "Ihr Vertrag",
      inhaltGeloeschtAm: null,
      sentBy: null,
      anhaenge: [],
    });
    const e = await mailSenden(opts());
    expect(e).toMatchObject({ ok: true, daten: { mailId: "m1", wiederholt: true } });
    expect(mockSendEventEmail).not.toHaveBeenCalled();
  });

  it("dieselbe Kennung aus einem ANDEREN Vorgang verraet nichts (404)", async () => {
    mockPrisma.individuelleMail.findUnique.mockResolvedValue({ id: "m1", modul: "ONBOARDING", refId: "anderer" });
    expect(await mailSenden(opts())).toMatchObject({ ok: false, fehler: "VORGANG_NICHT_GEFUNDEN" });
    expect(mockSendEventEmail).not.toHaveBeenCalled();
  });

  it("zwei gleichzeitige Aufrufe derselben Kennung: der zweite bekommt 409", async () => {
    let freigeben: (v: unknown) => void = () => undefined;
    mockSendEventEmail.mockReturnValue(
      new Promise((r) => {
        freigeben = r;
      }),
    );
    const erster = mailSenden(opts({ dialogKennung: "44444444-4444-4444-8444-444444444444" }));
    await new Promise((r) => setImmediate(r));
    const zweiter = await mailSenden(opts({ dialogKennung: "44444444-4444-4444-8444-444444444444" }));
    expect(zweiter).toMatchObject({ ok: false, fehler: "VERSAND_LAEUFT" });
    freigeben({ status: "SENT", recipient: "anna@privat.example", subject: "B" });
    expect((await erster).ok).toBe(true);
    expect(mockSendEventEmail).toHaveBeenCalledTimes(1);
  });
});

describe("uebersichtLaden", () => {
  it("liefert Vorgang, Adressen, Antwortadresse und Verlauf; fremd = 404", async () => {
    mockPrisma.individuelleMail.findMany.mockResolvedValue([
      {
        id: "m1",
        createdAt: new Date("2026-10-01T10:00:00Z"),
        empfaenger: "anna@privat.example",
        empfaengerAbweichend: false,
        betreff: "Ihr Vertrag",
        inhaltGeloeschtAm: null,
        sentBy: { firstName: "Erika", lastName: "Muster" },
        anhaenge: [{ id: "a1", dateiname: "a.pdf", groesse: 5, sha256: "x", dateipfad: null }],
      },
    ]);
    const e = await uebersichtLaden({ modul: "ONBOARDING", refId: REF, session });
    if (!e.ok) throw new Error(e.meldung);
    expect(e.daten.vorgang).toEqual({
      name: "Anna Beispiel",
      displayId: "2026-GYM-014",
      einrichtung: "FES Gymnasium",
      adressen: [{ adresse: "anna@privat.example", bezeichnung: "Adresse aus dem Vorgang" }],
    });
    expect(e.daten.antwortAn).toBe("personal@fes.example");
    expect(e.daten.verlauf[0]).toMatchObject({ gesendetVon: "Erika Muster", anhaenge: [{ verfuegbar: false }] });

    mockCanAccessProcess.mockResolvedValue(false);
    expect(await uebersichtLaden({ modul: "ONBOARDING", refId: REF, session })).toMatchObject({
      ok: false,
      fehler: "VORGANG_NICHT_GEFUNDEN",
    });
  });
});

describe("anhangLaden", () => {
  const anhang = {
    id: "a1",
    dateiname: "Vertrag.pdf",
    mimeType: "application/pdf",
    dateipfad: "individuelle-mails/m1/a1.pdf",
    sha256: "x",
    mail: { id: "m1", modul: "ONBOARDING", refId: REF },
  };

  it("liest nur unter der eigenen Wurzel und protokolliert das Oeffnen", async () => {
    mockPrisma.individuelleMailAnhang.findUnique.mockResolvedValue(anhang);
    mockPfadInWurzeln.mockImplementation(async (p: string) => p);
    mockReadFile.mockResolvedValue(PDF);
    const e = await anhangLaden({ anhangId: "a1", session });
    if (!e.ok) throw new Error(e.meldung);
    expect(mockPfadInWurzeln).toHaveBeenCalledWith(
      path.join(process.cwd(), "uploads", "individuelle-mails/m1/a1.pdf"),
      [ANHANG_WURZEL],
    );
    expect(e.daten).toEqual({ inhalt: PDF, mimeType: "application/pdf", dateiname: "Vertrag.pdf" });
    expect(mockPrisma.auditLog.create.mock.calls[0][0].data).toMatchObject({
      onboardingId: REF,
      action: INDIVIDUELLE_MAIL_AUDIT.ANHANG_GEOEFFNET,
    });
  });

  it("fremder Mandant, geloeschte Datei und Pfad ausserhalb: 404 ohne Lesen", async () => {
    mockPrisma.individuelleMailAnhang.findUnique.mockResolvedValue(anhang);
    mockCanAccessProcess.mockResolvedValue(false);
    expect((await anhangLaden({ anhangId: "a1", session })).ok).toBe(false);

    mockCanAccessProcess.mockResolvedValue(true);
    mockPrisma.individuelleMailAnhang.findUnique.mockResolvedValue({ ...anhang, dateipfad: null });
    expect((await anhangLaden({ anhangId: "a1", session })).ok).toBe(false);

    mockPrisma.individuelleMailAnhang.findUnique.mockResolvedValue(anhang);
    mockPfadInWurzeln.mockRejectedValue(new Error("ausserhalb"));
    expect((await anhangLaden({ anhangId: "a1", session })).ok).toBe(false);
    expect(mockReadFile).not.toHaveBeenCalled();
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });
});

describe("individuelleMailsAufraeumen (12 Monate)", () => {
  const grenze = new Date("2025-10-01T00:00:00Z");
  const faellig = [
    { id: "m1", anhaenge: [{ id: "a1", dateipfad: "individuelle-mails/m1/a1.pdf" }] },
    { id: "m2", anhaenge: [{ id: "a2", dateipfad: "individuelle-mails/m2/a2.pdf" }] },
  ];

  it("Probelauf zaehlt nur", async () => {
    mockPrisma.individuelleMail.findMany.mockResolvedValue(faellig);
    expect(await individuelleMailsAufraeumen({ grenze, dryRun: true })).toEqual({ mails: 2, dateienGeloescht: 0, fehler: 0 });
    expect(mockDateiLoeschen).not.toHaveBeenCalled();
    expect(mockPrisma.individuelleMail.update).not.toHaveBeenCalled();
  });

  it("loescht Dateien und Text, die Zeile bleibt; bei Dateifehler bleibt die Mail offen", async () => {
    mockPrisma.individuelleMail.findMany.mockResolvedValue(faellig);
    mockDateiLoeschen.mockResolvedValueOnce("geloescht").mockResolvedValueOnce("fehler");
    const e = await individuelleMailsAufraeumen({ grenze, dryRun: false });
    expect(e).toEqual({ mails: 1, dateienGeloescht: 1, fehler: 1 });
    expect(mockPrisma.individuelleMail.findMany.mock.calls[0][0].where).toEqual({
      createdAt: { lt: grenze },
      inhaltGeloeschtAm: null,
    });
    expect(mockDateiLoeschen).toHaveBeenCalledWith(expect.any(String), [ANHANG_WURZEL]);
    expect(mockPrisma.individuelleMail.update).toHaveBeenCalledTimes(1);
    expect(mockPrisma.individuelleMail.update.mock.calls[0][0]).toMatchObject({
      where: { id: "m1" },
      data: { nachricht: null },
    });
  });
});

describe("Vorlage individuelle-mail", () => {
  const vorlage = DEFAULT_EMAIL_TEMPLATES.find((t) => t.event === "individuelle-mail")!;

  it("existiert im Katalog und als Code-Default mit {{betreff}} als Betreff", () => {
    expect(getEventDefinition("individuelle-mail")?.group).toBe("Allgemein");
    expect(vorlage.subject).toBe("{{betreff}}");
  });

  it("maskiert Dateinamen und Freitext im HTML, laesst den Textteil roh", () => {
    const payload = mailPayload({
      modul: "ONBOARDING",
      refId: REF,
      vorgang: {
        organizationId: "o",
        organizationName: "FES",
        displayId: "X",
        vorname: "A",
        nachname: "B",
        empfaenger: "a@example.org",
        adressen: [],
      },
      empfaenger: "a@example.org",
      betreff: "Vertrag <b>",
      nachricht: "Hallo <script>x</script> & 5$' Gruß",
      anhaenge: [{ dateiname: "<img src=x>.pdf" }],
      absender: "Erika <i>M</i>",
    });
    const r = renderEventEmail(
      { ...vorlage, bodyText: vorlage.bodyText ?? null, recipientTo: "", recipientCc: "", recipientBcc: "", recipientReplyTo: "" },
      "individuelle-mail",
      payload,
      { overrideTo: "a@example.org" },
    );
    if (!r.rendered) throw new Error("nicht gerendert");
    expect(r.rendered.subject).toBe("Vertrag <b>");
    expect(r.rendered.html).not.toContain("<script>");
    expect(r.rendered.html).not.toContain("<img src=x>");
    expect(r.rendered.html).not.toContain("<i>M</i>");
    expect(r.rendered.html).toContain("5$' Gruß");
    expect(r.rendered.text).toContain("Hallo <script>x</script> & 5$' Gruß");
    expect(r.rendered.text).toContain("- <img src=x>.pdf");
  });
});
