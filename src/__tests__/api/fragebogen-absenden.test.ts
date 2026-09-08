/**
 * Tests: das Absenden des Personalfragebogens
 * (POST /api/fragebogen/[token])
 *
 * Schwerpunkt ist die Stelle mit den groessten Folgen: Der Vorgang traegt hier
 * die Wahrheitsversicherung ein, die im Portal die Unterschrift ersetzt, setzt
 * den Status und schreibt den Nachweis ins Protokoll. Alle drei muessen
 * gemeinsam gelingen oder gemeinsam ausbleiben, und genau ein Aufrufer darf
 * gewinnen -- zwei Protokollsaetze mit verschiedenen Pruefsummen zur selben
 * Erklaerung machen den Unterschriftsersatz in der Betriebspruefung
 * mehrdeutig.
 */

const mockPrisma = {
  formTemplate: { findUnique: jest.fn() },
  document: { findMany: jest.fn() },
  child: { count: jest.fn() },
  personalData: { findUnique: jest.fn(), update: jest.fn() },
  onboardingProcess: { updateMany: jest.fn() },
  auditLog: { create: jest.fn() },
  emailTemplate: { findUnique: jest.fn() },
  $transaction: jest.fn(),
};
const mockValidate = jest.fn();
const mockSendEmail = jest.fn();

jest.mock("@/lib/db", () => ({ prisma: mockPrisma }));
jest.mock("@/lib/auth", () => ({
  validateMagicToken: (...args: unknown[]) => mockValidate(...args),
}));
jest.mock("@/lib/rate-limit", () => ({
  tokenRateLimiter: { check: () => ({ allowed: true }) },
  getClientIp: () => "203.0.113.7",
  // Vorsorglich mitgemockt, obwohl die hier getesteten Routen heute nur
  // `getClientIp` nutzen: Dieser Mock ersetzt das GANZE Modul. Stellt jemand
  // eine dieser Routen spaeter auf die null-Fassung um, kaeme sonst
  // stillschweigend `undefined` zurueck und der Test stuerbe an einem
  // TypeError statt an einer sprechenden Erwartung.
  getClientIpOrNull: () => "203.0.113.7",
}));
jest.mock("@/lib/n8n", () => ({ triggerN8nWebhook: jest.fn() }));
jest.mock("@/lib/mailer", () => ({ sendEmail: (...a: unknown[]) => mockSendEmail(...a) }));
jest.mock("@/lib/encryption", () => ({
  encrypt: (v: string) => v,
  decrypt: (v: string) => v,
  isEncryptionConfigured: () => true,
}));

import { POST } from "@/app/api/fragebogen/[token]/route";
import { AKTUELLE_ERKLAERUNG } from "@/lib/erklaerung-arbeitnehmer";
import { NextRequest } from "next/server";

const TOKEN = "magic-token-1234567890";
const params = () => Promise.resolve({ token: TOKEN });

/** Genau der Rumpf, den Schritt 10 sendet. */
function absendeRumpf(overrides: Record<string, unknown> = {}) {
  return {
    dsgvoAccepted: true,
    erklaerungAccepted: true,
    erklaerungOrt: "Minden",
    erklaerungVersion: AKTUELLE_ERKLAERUNG.version,
    ...overrides,
  };
}

function req(body: Record<string, unknown>): NextRequest {
  return new NextRequest(`http://localhost:3000/api/fragebogen/${TOKEN}`, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "Jest" },
    body: JSON.stringify(body),
  });
}

/**
 * Der Vorgang, wie `validateMagicToken` ihn liefert — samt `organization` und
 * `personalData`, denn beide laedt der Validierer mit.
 *
 * `type: "VERWALTUNG"` ist der neutrale Ausgangspunkt: Fuer die Verwaltung
 * traegt IfSG § 20 Abs. 8 nicht, es entsteht also keine bedingte Pflicht, und
 * die uebrigen Zusicherungen dieser Datei bleiben von den Dokumentenregeln
 * unberuehrt.
 */
function tokenAntwort(
  status = "IN_PROGRESS",
  personalData: Record<string, unknown> = {},
  organisationstyp = "VERWALTUNG",
) {
  return {
    valid: true,
    onboarding: {
      id: "ob1",
      status,
      email: "neu@example.de",
      firstName: "Anna",
      lastName: "Beispiel",
      displayId: "AB123456",
      questionnaireType: "MINIJOB",
      organization: { name: "Berufskolleg", type: organisationstyp },
      personalData: {
        rvEntscheidung: null,
        birthDate: null,
        aufenthaltstitelErforderlich: null,
        healthInsuranceType: null,
        ...personalData,
      },
    },
  };
}

/** Fuehrt die Transaktions-Rueckrufe echt aus, gegen dieselben Mocks. */
function transaktionLaeuftDurch() {
  mockPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
    fn(mockPrisma)
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockValidate.mockResolvedValue(tokenAntwort());
  mockPrisma.formTemplate.findUnique.mockResolvedValue({ requiredDocuments: [] });
  mockPrisma.document.findMany.mockResolvedValue([]);
  mockPrisma.child.count.mockResolvedValue(0);
  mockPrisma.personalData.findUnique.mockResolvedValue({
    onboardingId: "ob1",
    firstName: "Anna",
    lastName: "Beispiel",
    rvEntscheidung: null,
    socialSecurityNumber: null,
    iban: null,
    taxId: null,
    children: [],
    beschaeftigungsAngaben: [],
  });
  mockPrisma.personalData.update.mockResolvedValue({});
  mockPrisma.auditLog.create.mockResolvedValue({});
  mockPrisma.emailTemplate.findUnique.mockResolvedValue(null);
  // Standardfall: dieser Aufrufer beansprucht den Vorgang erfolgreich.
  mockPrisma.onboardingProcess.updateMany.mockResolvedValue({ count: 1 });
  transaktionLaeuftDurch();
});

describe("Absenden — Erfolgsfall", () => {
  it("nimmt den Fragebogen an und beansprucht den Vorgang bedingt", async () => {
    const res = await POST(req(absendeRumpf()), { params: params() });
    expect(res.status).toBe(200);

    // Der Statuswechsel ist die Sperre: EIN UPDATE ... WHERE status IN (...).
    expect(mockPrisma.onboardingProcess.updateMany).toHaveBeenCalledTimes(1);
    const arg = mockPrisma.onboardingProcess.updateMany.mock.calls[0][0];
    expect(arg.where).toMatchObject({ id: "ob1" });
    expect(arg.where.status.in).toEqual(["INVITED", "IN_PROGRESS"]);
    expect(arg.data.status).toBe("SUBMITTED");
  });

  it("schreibt Erklaerung, Status und Protokoll in genau einer Transaktion", async () => {
    await POST(req(absendeRumpf()), { params: params() });
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mockPrisma.personalData.update).toHaveBeenCalledTimes(1);
    expect(mockPrisma.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it("stempelt Erklaerung, Status und Protokoll auf denselben Zeitpunkt", async () => {
    // submittedAt ist der Anker fuer das RV-Wirkungsdatum beim
    // Aufhebungsantrag. Drei leicht verschiedene Zeitstempel fuer einen
    // Vorgang waeren in der Akte nicht erklaerbar.
    await POST(req(absendeRumpf()), { params: params() });
    const submittedAt: Date =
      mockPrisma.onboardingProcess.updateMany.mock.calls[0][0].data.submittedAt;
    const erklaertAm: Date =
      mockPrisma.personalData.update.mock.calls[0][0].data.erklaerungAcceptedAt;
    const protokoll: string =
      mockPrisma.auditLog.create.mock.calls[0][0].data.details.submittedAt;

    expect(erklaertAm.getTime()).toBe(submittedAt.getTime());
    expect(protokoll).toBe(submittedAt.toISOString());
  });

  it("haelt Ort, Version und Pruefsumme der Erklaerung fest", async () => {
    await POST(req(absendeRumpf()), { params: params() });
    const daten = mockPrisma.personalData.update.mock.calls[0][0].data;
    expect(daten).toMatchObject({
      erklaerungAccepted: true,
      erklaerungOrt: "Minden",
      erklaerungIp: "203.0.113.7",
      erklaerungVersion: AKTUELLE_ERKLAERUNG.version,
    });
    expect(typeof daten.erklaerungPruefsumme).toBe("string");
    expect(daten.erklaerungPruefsumme.length).toBeGreaterThan(0);
    // Dieselbe Pruefsumme muss im Protokoll stehen, sonst ist sie kein Nachweis.
    expect(mockPrisma.auditLog.create.mock.calls[0][0].data.details.erklaerungPruefsumme)
      .toBe(daten.erklaerungPruefsumme);
  });
});

describe("Absenden — Doppel-Submit", () => {
  it("laesst nur einen von zwei gleichzeitigen Absendern durch", async () => {
    // Beide kommen an der vorgelagerten Statuspruefung vorbei (der Lesestand
    // ist fuer beide IN_PROGRESS); erst das bedingte UPDATE trennt sie.
    mockPrisma.onboardingProcess.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    const [erster, zweiter] = await Promise.all([
      POST(req(absendeRumpf()), { params: params() }),
      POST(req(absendeRumpf()), { params: params() }),
    ]);

    const codes = [erster.status, zweiter.status].sort();
    expect(codes).toEqual([200, 409]);
    // Der Verlierer darf weder Erklaerung noch Protokoll geschrieben haben.
    expect(mockPrisma.auditLog.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.personalData.update).toHaveBeenCalledTimes(1);
  });

  it("antwortet 409, wenn der Vorgang zwischenzeitlich beansprucht wurde", async () => {
    mockPrisma.onboardingProcess.updateMany.mockResolvedValue({ count: 0 });
    const res = await POST(req(absendeRumpf()), { params: params() });
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({
      error: "Fragebogen wurde bereits eingereicht.",
    });
  });

  it("weist den schnellen Weg ab, wenn der Vorgang schon eingereicht ist", async () => {
    mockValidate.mockResolvedValue(tokenAntwort("SUBMITTED"));
    const res = await POST(req(absendeRumpf()), { params: params() });
    expect(res.status).toBe(409);
    // Gar nicht erst Dokumente und Pruefsumme laden.
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });
});

describe("Absenden — Fehlerfall bleibt folgenlos", () => {
  it("meldet 500 und laesst keinen Teilzustand zurueck, wenn die Transaktion bricht", async () => {
    mockPrisma.$transaction.mockRejectedValue(new Error("Verbindung verloren"));
    const fehler = jest.spyOn(console, "error").mockImplementation(() => {});

    const res = await POST(req(absendeRumpf()), { params: params() });

    expect(res.status).toBe(500);
    // Kein "erfolgreich eingereicht" an den Beschaeftigten und keine
    // Bestaetigungsmail zu einem Vorgang, der nicht abgesendet wurde.
    await expect(res.json()).resolves.not.toMatchObject({ success: true });
    expect(mockSendEmail).not.toHaveBeenCalled();
    fehler.mockRestore();
  });
});

describe("Absenden — Vorbedingungen", () => {
  it("verlangt die Bestaetigung der Erklaerung", async () => {
    const res = await POST(
      req(absendeRumpf({ erklaerungAccepted: false })),
      { params: params() }
    );
    expect(res.status).toBe(400);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("verlangt den Ort — er gehoert zur Unterschrift", async () => {
    const res = await POST(req(absendeRumpf({ erklaerungOrt: "" })), { params: params() });
    expect(res.status).toBe(400);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("lehnt eine unbekannte Erklaerungsversion ab", async () => {
    const res = await POST(
      req(absendeRumpf({ erklaerungVersion: "phantasie-9.9" })),
      { params: params() }
    );
    expect(res.status).toBe(409);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("sperrt, solange ein Pflichtdokument fehlt", async () => {
    mockPrisma.formTemplate.findUnique.mockResolvedValue({
      requiredDocuments: ["GEBURTSURKUNDE_EIGEN"],
    });
    const res = await POST(req(absendeRumpf()), { params: params() });
    expect(res.status).toBe(400);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("laesst die vier nachreichbaren Pflichten NICHT sperren", async () => {
    // Kita-Beschaeftigte, 1990 geboren, Aufenthaltstitel „Ja", privat
    // versichert — vier offene Pflichten, kein einziges hochgeladenes Papier.
    // Der Fragebogen muss trotzdem durchgehen: Im selben Formular stehen
    // Bankverbindung und Steuer-ID, die die Lohnbuchhaltung zum Ersten braucht.
    mockValidate.mockResolvedValue(
      tokenAntwort(
        "IN_PROGRESS",
        {
          birthDate: new Date("1990-04-17"),
          aufenthaltstitelErforderlich: true,
          healthInsuranceType: "privat",
        },
        "KITA",
      ),
    );
    mockPrisma.formTemplate.findUnique.mockResolvedValue({
      requiredDocuments: ["MASERNSCHUTZ", "AUFENTHALTSTITEL", "PKV_NACHWEIS"],
    });

    const res = await POST(req(absendeRumpf()), { params: params() });
    expect(res.status).toBe(200);
  });

  it("verlangt die Rentenversicherungsnummer, wenn eine Befreiung beantragt wurde", async () => {
    mockPrisma.personalData.findUnique.mockResolvedValue({
      onboardingId: "ob1",
      rvEntscheidung: "BEFREIUNG_BEANTRAGT",
      socialSecurityNumber: null,
      iban: null,
      taxId: null,
      children: [],
      beschaeftigungsAngaben: [],
    });
    // Der Befreiungsantrag ist dann zugleich Pflichtdokument — hier nicht der
    // Punkt, deshalb als vorhanden gemeldet.
    mockPrisma.document.findMany.mockResolvedValue([{ type: "RV_BEFREIUNG" }]);

    const res = await POST(req(absendeRumpf()), { params: params() });
    expect(res.status).toBe(400);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });
});

/**
 * „Nachreichbar" ist ein Tausch, kein Erlass (Entscheidung 07./08.09.2026): Der
 * Vorgang entsteht, DAFUER wird er sichtbar als offen gefuehrt. Die zweite
 * Haelfte fehlte vollstaendig — `fehlendeNachreichbareDokumente` hatte im
 * gesamten Produktivcode keinen Aufrufer, und der Absendezweig uebergab die drei
 * Eingaben (`masernschutzPflichtig`, `aufenthaltstitelErforderlich`,
 * `healthInsuranceType`) gar nicht erst. Ergebnis: Der Server nahm an, und
 * niemand erfuhr, dass etwas offen war. Gerade beim Masernschutz haengt daran
 * die Begruendung fuer den Verzicht auf die Sperre — die Meldung ans
 * Gesundheitsamt braucht eine Datengrundlage.
 */
describe("Absenden — offene nachreichbare Nachweise", () => {
  /**
   * Eine Transaktion mit EIGENEN Schreibern.
   *
   * Der Standard-Mock reicht `mockPrisma` als `tx` durch; dann sind „innerhalb"
   * und „ausserhalb" der Transaktion nicht zu unterscheiden. Mit einem eigenen
   * `tx` laesst sich belegen, dass der Vermerk wirklich im selben Commit steht
   * wie die Abgabe — ein Vermerk, der danach einzeln geschrieben wuerde, fehlte
   * genau dann, wenn die Verbindung abreisst.
   */
  function eigeneTransaktion() {
    const tx = {
      onboardingProcess: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      personalData: { update: jest.fn().mockResolvedValue({}) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    mockPrisma.$transaction.mockImplementation(
      async (fn: (t: unknown) => unknown) => fn(tx),
    );
    return tx;
  }

  /** Kita, 1990 geboren, Aufenthaltstitel „Ja", privat versichert. */
  function vierOffene() {
    mockValidate.mockResolvedValue(
      tokenAntwort(
        "IN_PROGRESS",
        {
          birthDate: new Date("1990-04-17"),
          aufenthaltstitelErforderlich: true,
          healthInsuranceType: "privat",
        },
        "KITA",
      ),
    );
  }

  /** Die Protokollsaetze einer Transaktion, nach Aktion aufgeschluesselt. */
  function saetze(tx: { auditLog: { create: jest.Mock } }) {
    const alle = tx.auditLog.create.mock.calls.map((c) => c[0].data);
    return {
      abgabe: alle.find((d) => d.action === "QUESTIONNAIRE_SUBMITTED"),
      vermerk: alle.find((d) => d.action === "DOKUMENTE_NACHZUREICHEN"),
      anzahl: alle.length,
    };
  }

  it("haelt alle vier offenen Nachweise am Vorgang fest", async () => {
    vierOffene();
    const tx = eigeneTransaktion();

    const res = await POST(req(absendeRumpf()), { params: params() });
    expect(res.status).toBe(200);

    const { vermerk } = saetze(tx);
    expect(vermerk).toBeDefined();
    expect(vermerk.onboardingId).toBe("ob1");
    expect(vermerk.details.typen).toEqual([
      "MASERNSCHUTZ",
      "AUFENTHALTSTITEL",
      "ARBEITSERLAUBNIS",
      "PKV_NACHWEIS",
    ]);
    // Deutsche Bezeichnungen mit im Satz: Das Protokoll liest ein Mensch.
    expect(vermerk.details.bezeichnungen).toContain("Masernschutz-Nachweis");
    expect(vermerk.details.bezeichnungen).toContain(
      "Nachweis private Krankenversicherung",
    );
  });

  it("schreibt den Vermerk in DIESELBE Transaktion wie die Abgabe", async () => {
    vierOffene();
    const tx = eigeneTransaktion();

    await POST(req(absendeRumpf()), { params: params() });

    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(saetze(tx).anzahl).toBe(2);
    // Nichts davon darf am Transaktionsclient vorbei geschrieben worden sein.
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("nennt die offenen Nachweise auch im Abgabesatz — als leere Liste, wenn nichts offen ist", async () => {
    // Ohne das Feld im Abgabesatz waere das Fehlen des Vermerks zweideutig:
    // nichts offen, oder Vermerk vergessen.
    const tx = eigeneTransaktion();
    await POST(req(absendeRumpf()), { params: params() });

    const { abgabe, vermerk, anzahl } = saetze(tx);
    expect(abgabe.details.offeneNachweise).toEqual([]);
    expect(vermerk).toBeUndefined();
    expect(anzahl).toBe(1);
  });

  it("laesst den Vermerk weg, sobald die Nachweise vorliegen", async () => {
    vierOffene();
    mockPrisma.document.findMany.mockResolvedValue([
      { type: "MASERNSCHUTZ" },
      { type: "AUFENTHALTSTITEL" },
      { type: "ARBEITSERLAUBNIS" },
      { type: "PKV_NACHWEIS" },
    ]);
    const tx = eigeneTransaktion();

    await POST(req(absendeRumpf()), { params: params() });

    const { abgabe, vermerk } = saetze(tx);
    expect(abgabe.details.offeneNachweise).toEqual([]);
    expect(vermerk).toBeUndefined();
  });

  it("wertet die Regeln aus und nicht die Vorlagenliste", async () => {
    // Keine Vorlage fuehrt diese Typen in `requiredDocuments`; die Pflicht
    // entsteht allein aus Geburtsjahr, Einrichtungstyp und den beiden
    // Selbstauskuenften. Eine Regel, die die Liste nur durchsiebt, erzeugte sie
    // nie.
    vierOffene();
    mockPrisma.formTemplate.findUnique.mockResolvedValue({
      requiredDocuments: [],
    });
    const tx = eigeneTransaktion();

    await POST(req(absendeRumpf()), { params: params() });

    expect(saetze(tx).vermerk.details.typen).toContain("MASERNSCHUTZ");
  });

  it("erzeugt in der Verwaltung keinen Masernschutz-Vermerk", async () => {
    // Fuer VERWALTUNG gibt es keine Rechtsgrundlage, einen Nachweis zu
    // verlangen — ihn als offen zu protokollieren waere ein Gesundheitsdatum
    // ohne Grundlage (Art. 9 DSGVO), und zwar eines, das dauerhaft im Protokoll
    // steht.
    mockValidate.mockResolvedValue(
      tokenAntwort(
        "IN_PROGRESS",
        { birthDate: new Date("1990-04-17") },
        "VERWALTUNG",
      ),
    );
    mockPrisma.formTemplate.findUnique.mockResolvedValue({
      requiredDocuments: ["MASERNSCHUTZ"],
    });
    const tx = eigeneTransaktion();

    await POST(req(absendeRumpf()), { params: params() });
    expect(saetze(tx).vermerk).toBeUndefined();
  });

  it("vermerkt nichts, solange die Frage nach dem Aufenthaltstitel unbeantwortet ist", async () => {
    // `null` heisst „noch nicht gefragt". Ein Vermerk daraus waere eine offene
    // Forderung, die die Person nie zu Gesicht bekommen hat.
    mockValidate.mockResolvedValue(
      tokenAntwort("IN_PROGRESS", { aufenthaltstitelErforderlich: null }),
    );
    const tx = eigeneTransaktion();

    await POST(req(absendeRumpf()), { params: params() });
    expect(saetze(tx).vermerk).toBeUndefined();
  });

  it("schreibt keinen Vermerk, wenn die Abgabe scheitert", async () => {
    vierOffene();
    mockPrisma.$transaction.mockRejectedValue(new Error("Verbindung verloren"));
    const fehler = jest.spyOn(console, "error").mockImplementation(() => {});

    const res = await POST(req(absendeRumpf()), { params: params() });

    expect(res.status).toBe(500);
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
    fehler.mockRestore();
  });

  it("laesst den Befreiungsantrag weiter sperren — und schreibt dann gar nichts", async () => {
    // Die sperrende Haelfte bleibt unangetastet: Ohne die unterschriebene Seite
    // kommt die Befreiung rechtlich nicht zustande.
    mockValidate.mockResolvedValue(
      tokenAntwort(
        "IN_PROGRESS",
        {
          rvEntscheidung: "BEFREIUNG_BEANTRAGT",
          birthDate: new Date("1990-04-17"),
        },
        "KITA",
      ),
    );
    const tx = eigeneTransaktion();

    const res = await POST(req(absendeRumpf()), { params: params() });

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      missingDocuments: ["RV_BEFREIUNG"],
    });
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });
});
