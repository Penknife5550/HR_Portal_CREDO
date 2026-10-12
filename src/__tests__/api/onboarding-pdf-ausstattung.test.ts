/**
 * PDF der Modalitäten: Abschnitt „Ausstattung & Zugänge“ (Paket A2,
 * Feinplan S10).
 *
 * Die Route lädt Zeilen und Hinweise des Vorgangs mit (`include`, dieselbe
 * Auswahl wie die Karte im Reiter „Vorgesetzter“), das PDF druckt sie je
 * Stelle — mit Bemerkung samt Herkunft, gewählten Optionen, Angabe und dem
 * Hinweis an die Stelle. Den Export erzeugen nur HR-Rollen (die Route weist
 * alle anderen mit 403 ab). Ohne Wahl entfällt der Abschnitt.
 *
 * Geprüft wird über die Texte, die pdfkit tatsächlich setzt (Spy auf
 * `text`, wie pdf-export-zustaendigkeit.test.ts); der fertige Stream ist
 * komprimiert.
 */

import PDFDocument from "pdfkit";

const mockGetSession = jest.fn();
const mockPrisma = {
  onboardingProcess: { findUnique: jest.fn() },
  departmentConfig: { findMany: jest.fn() },
  auditLog: { create: jest.fn() },
};

jest.mock("@/lib/auth", () => ({ getSession: () => mockGetSession() }));
jest.mock("@/lib/db", () => ({ prisma: mockPrisma }));
jest.mock("@/lib/encryption", () => ({ decrypt: (v: string) => v }));
jest.mock("@/lib/pdf-export-onboarding", () => {
  const echt = jest.requireActual("@/lib/pdf-export-onboarding");
  return { ...echt, generateOnboardingPDF: jest.fn(echt.generateOnboardingPDF) };
});

import { NextRequest } from "next/server";
import { GET as PDF_EXPORT } from "@/app/api/onboarding/[id]/pdf-export/route";
import { generateOnboardingPDF, type OnboardingExportContext } from "@/lib/pdf-export-onboarding";
import {
  UEBERSICHT_HINWEIS_AUSWAHL,
  UEBERSICHT_ZEILEN_AUSWAHL,
  UEBERSICHT_ZEILEN_ORDNUNG,
} from "@/lib/ausstattung-dienst";

type TextFn = (...args: unknown[]) => unknown;
let gesetzteTexte: string[] = [];
/** Zu jedem Eintrag in `gesetzteTexte` die y-Position des Aufrufs (sonst null). */
let gesetzteY: (number | null)[] = [];

beforeAll(() => {
  const original = (PDFDocument.prototype as unknown as { text: TextFn }).text;
  jest
    .spyOn(PDFDocument.prototype as unknown as { text: TextFn }, "text")
    .mockImplementation(function (this: unknown, ...args: unknown[]) {
      if (typeof args[0] === "string") {
        gesetzteTexte.push(args[0]);
        gesetzteY.push(typeof args[2] === "number" ? args[2] : null);
      }
      return original.apply(this, args);
    });
});

afterAll(() => {
  jest.restoreAllMocks();
});

const HR = { userId: "hr-1", email: "hr@example.org", role: "HR_SACHBEARBEITER", firstName: "H", lastName: "R" };

function zeile(teil: Record<string, unknown>) {
  return {
    id: "z",
    positionId: "pos",
    departmentKey: "IT",
    art: "JA_NEIN",
    angabeSchluessel: null,
    bezeichnung: "Dienst-iPad (Lernmittel)",
    sichtbarFuer: [],
    reihenfolge: 0,
    auswahl: [],
    angabe: null,
    bemerkung: null,
    bemerkungQuelle: null,
    quelle: "FUEHRUNGSKRAFT",
    erfasstVonId: null,
    gestrichenAm: null,
    createdAt: new Date("2027-01-10T08:00:00.000Z"),
    ...teil,
  };
}

function vorgang(teil: Record<string, unknown> = {}) {
  return {
    id: "vorgang-1",
    displayId: "ONB-2027-007",
    status: "SUPERVISOR_SUBMITTED",
    email: "anna@example.org",
    firstName: "Anna",
    lastName: "Beispiel",
    organizationId: "org-1",
    arbeitsortId: null,
    questionnaireType: "STANDARD",
    invitedAt: new Date("2027-01-02T08:00:00Z"),
    submittedAt: null,
    organization: { name: "FES Gymnasium", mandantNumber: "10" },
    personalData: null,
    documents: [],
    checklistItems: [],
    supervisorData: {
      betriebsstaette: "Minden",
      stellenbeschreibung: "Lehrkraft",
      vertragsbeginn: new Date("2027-02-01T00:00:00Z"),
      befristet: false,
      befristungsart: null,
      vertragsende: null,
      befristungZweck: null,
      vertragsendeVoraussichtlich: null,
      befristungSachgrund: null,
      vollzeit: true,
      wochenstunden: 25.5,
      tageProWoche: 5,
      svPflichtig: true,
      minijob: false,
      ehrenamt: false,
      verguetungsmodell: "TV_L",
      entgeltgruppe: "E13",
      stufe: "1",
      festgehalt: null,
      stundenlohn: null,
      jahressonderzahlung: true,
      sonderzahlungProzent: null,
      urlaubstageProJahr: 30,
      probezeit: true,
      probezeitMonate: 6,
      zusatzvereinbarungen: null,
      kostenstelle: null,
      kostenstelleAnteil: null,
      kostenstellenBemerkung: null,
      kostenstellen: [],
    },
    ausstattung: [
      zeile({ id: "ipad", bemerkung: "Mit Stift und Hülle", bemerkungQuelle: "FUEHRUNGSKRAFT" }),
      zeile({
        id: "zugaenge",
        positionId: "pos-z",
        art: "AUSWAHL",
        bezeichnung: "Zugänge",
        auswahl: ["Dienst-E-Mail", "WebUntis"],
        reihenfolge: 1,
      }),
      zeile({
        id: "faecher",
        positionId: "pos-f",
        departmentKey: "FACILITY",
        art: "ANGABE",
        angabeSchluessel: "UNTERRICHTSFAECHER",
        bezeichnung: "Unterrichtsfächer",
        angabe: "Chemie, Sport",
        sichtbarFuer: ["IT"],
      }),
    ],
    stellenHinweise: [
      { departmentKey: "IT", text: "Bitte vor dem ersten Schultag einrichten.", quelle: "BEIDE", checklistItemId: null, gesehenAm: null },
    ],
    ...teil,
  };
}

async function export_(v = vorgang()) {
  mockPrisma.onboardingProcess.findUnique.mockResolvedValue(v);
  gesetzteTexte = [];
  gesetzteY = [];
  const res = await PDF_EXPORT(
    new NextRequest("http://localhost/api/onboarding/vorgang-1/pdf-export?type=modalitaeten"),
    { params: Promise.resolve({ id: "vorgang-1" }) },
  );
  return res;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetSession.mockResolvedValue(HR);
  mockPrisma.auditLog.create.mockResolvedValue({});
  mockPrisma.departmentConfig.findMany.mockResolvedValue([
    { departmentKey: "IT", departmentName: "IT-Abteilung", organizationId: null },
  ]);
});

describe("PDF der Modalitäten — Ausstattung & Zugänge", () => {
  it("die Route lädt Zeilen und Hinweise mit derselben Auswahl wie die Karte", async () => {
    const res = await export_();

    expect(res.status).toBe(200);
    const include = mockPrisma.onboardingProcess.findUnique.mock.calls[0][0].include;
    expect(include.ausstattung).toEqual({ select: UEBERSICHT_ZEILEN_AUSWAHL, orderBy: UEBERSICHT_ZEILEN_ORDNUNG });
    expect(include.stellenHinweise).toEqual({ select: UEBERSICHT_HINWEIS_AUSWAHL });
    const ctx = (generateOnboardingPDF as jest.Mock).mock.calls[0][0] as OnboardingExportContext;
    expect(ctx.ausstattung?.zeilen.map((z) => z.id)).toEqual(["ipad", "zugaenge", "faecher"]);
    expect(ctx.ausstattung?.hinweise).toHaveLength(1);
  });

  it("je Stelle Positionen, Optionen, Angabe, Bemerkung mit Herkunft und Hinweis", async () => {
    await export_();

    expect(gesetzteTexte).toContain("Ausstattung & Zugänge");
    expect(gesetzteTexte).toContain("IT-Abteilung");
    expect(gesetzteTexte).toContain("Facility Management");
    expect(gesetzteTexte).toContain("Dienst-iPad (Lernmittel)");
    expect(gesetzteTexte).toContain("Bemerkung der Führungskraft");
    expect(gesetzteTexte).toContain("Mit Stift und Hülle");
    expect(gesetzteTexte).toContain("Dienst-E-Mail, WebUntis");
    expect(gesetzteTexte).toContain("Chemie, Sport (sehen Facility Management und IT-Abteilung)");
    expect(gesetzteTexte).toContain("Hinweis der Führungskraft, ergänzt durch die Personalabteilung");
    expect(gesetzteTexte).toContain("Bitte vor dem ersten Schultag einrichten.");
    // IT vor Facility (Reihenfolge der Abteilungskarte), der Abschnitt nach „Probezeit & Sonstiges“
    expect(gesetzteTexte.indexOf("IT-Abteilung")).toBeLessThan(gesetzteTexte.indexOf("Facility Management"));
    expect(gesetzteTexte.indexOf("Probezeit & Sonstiges")).toBeLessThan(gesetzteTexte.indexOf("Ausstattung & Zugänge"));
  });

  it("ohne Wahl kein Abschnitt — auch nicht bei älteren Gerüsten ohne die Relationen", async () => {
    await export_(vorgang({ ausstattung: [], stellenHinweise: [] }));
    expect(gesetzteTexte).not.toContain("Ausstattung & Zugänge");

    const { ausstattung: _a, stellenHinweise: _h, ...ohne } = vorgang();
    void _a;
    void _h;
    const res = await export_(ohne as ReturnType<typeof vorgang>);
    expect(res.status).toBe(200);
    expect(gesetzteTexte).not.toContain("Ausstattung & Zugänge");
  });

  it("nur HR-Rollen erzeugen den Export", async () => {
    mockGetSession.mockResolvedValue({ ...HR, role: "EINRICHTUNGSLEITUNG" });
    const res = await export_();
    expect(res.status).toBe(403);
    expect(mockPrisma.onboardingProcess.findUnique).not.toHaveBeenCalled();
  });

  it("viele Zeilen brechen sauber auf eine neue Seite um", async () => {
    const zeilen = Array.from({ length: 60 }, (_, i) =>
      zeile({ id: `z${i}`, positionId: `p${i}`, bezeichnung: `Position ${i}`, reihenfolge: i, bemerkung: `Bemerkung ${i}` }),
    );
    const res = await export_(vorgang({ ausstattung: zeilen, stellenHinweise: [] }));

    expect(res.status).toBe(200);
    expect(gesetzteTexte).toContain("Position 59");
    expect(gesetzteTexte).toContain("Bemerkung 59");
  });

  it("ein langer Hinweis nahe am Seitenende: neue Seite mit Kopfzeile davor, nie ein Umbruch mitten im Text", async () => {
    // 1000 Zeichen (Obergrenze des Hinweises) sind rund 14 Zeilen. Eine feste
    // Reserve von 20 pt liess einen Hinweis zu, der bis zu 20 pt vor dem
    // Seitenende begann; pdfkit brach ihn dann selbst um — neue Seite ohne
    // Kopfzeile, und die naechste Zeile legte gleich noch eine an.
    const SEITE = "[neue Seite]";
    const KOPF = /— Modalitaeten$/;
    const LABEL = "Hinweis der Führungskraft";
    const hinweis = "Bitte das Gerät vor dem ersten Schultag einrichten und alle Zugänge einmal prüfen. "
      .repeat(13)
      .slice(0, 1000);
    expect(hinweis).toHaveLength(1000);

    // Einmal ueber die Route (Kontext wie im Betrieb), danach das PDF direkt —
    // die Route bremst nach zehn Exporten je Minute.
    expect((await export_()).status).toBe(200);
    const ctx = (generateOnboardingPDF as jest.Mock).mock.calls[0][0] as OnboardingExportContext;

    const original = (PDFDocument.prototype as unknown as { addPage: TextFn }).addPage;
    const seite = jest
      .spyOn(PDFDocument.prototype as unknown as { addPage: TextFn }, "addPage")
      .mockImplementation(function (this: unknown, ...args: unknown[]) {
        gesetzteTexte.push(SEITE);
        gesetzteY.push(null);
        return original.apply(this, args);
      });

    /** PDF mit `davor` kurzen Zeilen vor dem Hinweis; liefert den Abschnitt samt y-Positionen. */
    async function setzen(davor: number) {
      const zeilen = Array.from({ length: davor }, (_, i) =>
        zeile({ id: `z${i}`, positionId: `p${i}`, bezeichnung: `Position ${i}`, reihenfolge: i }),
      );
      gesetzteTexte = [];
      gesetzteY = [];
      await generateOnboardingPDF(
        {
          ...ctx,
          ausstattung: {
            zeilen,
            hinweise: [
              { departmentKey: "IT", text: hinweis, quelle: "FUEHRUNGSKRAFT", checklistItemId: null, gesehenAm: null },
            ],
          },
        },
        "modalitaeten",
      );
      const ab = gesetzteTexte.indexOf("Ausstattung & Zugänge");
      expect(ab).toBeGreaterThan(-1);
      return { texte: gesetzteTexte.slice(ab), y: gesetzteY.slice(ab) };
    }

    try {
      // Probe: Wo steht die Zeile Nr. d? Genau dort begaenne der Hinweis, wenn
      // d kurze Zeilen davor stehen (die Zeilen davor liegen unabhaengig davon,
      // was nach ihnen kommt). Gesucht sind die d, mit denen er 20 bis 80 pt
      // vor der Seitengrenze (720) beginnt — genau dort brach die alte Reserve
      // (Start bis 700 erlaubt, pdfkit bricht ab rund 792 selbst um).
      const probe = await setzen(45);
      const yZeile = (d: number) => probe.y[probe.texte.indexOf(`Position ${d}`)] ?? 0;
      const proben: number[] = [];
      for (let d = 1; d < 45; d++) {
        const y = yZeile(d);
        if (y > yZeile(d - 1) && y >= 640 && y <= 700) proben.push(d);
      }
      expect(proben.length).toBeGreaterThan(0);

      for (const davor of proben) {
        const { texte } = await setzen(davor);
        // Jede neue Seite im Abschnitt beginnt mit der Kopfzeile — eine von
        // pdfkit selbst angelegte haette keine.
        texte.forEach((text, i) => {
          if (text === SEITE) expect(`${davor} Zeilen davor: ${texte[i + 1]}`).toMatch(KOPF);
        });
        // Der Hinweis steht in einem Stueck direkt hinter seiner Beschriftung.
        const label = texte.indexOf(LABEL);
        expect(texte[label + 1]).toBe(hinweis);
        if (proben.includes(davor)) {
          // Er passte nicht mehr auf die Seite: Seitenwechsel samt Kopfzeile VOR der Zeile.
          expect(texte[label - 2]).toBe(SEITE);
          expect(texte[label - 1]).toMatch(KOPF);
        }
      }
    } finally {
      seite.mockRestore();
    }
    // Einige PDFs samt QR-Code: im vollen Lauf langsamer als die 5 s der Vorgabe.
  }, 30_000);
});
