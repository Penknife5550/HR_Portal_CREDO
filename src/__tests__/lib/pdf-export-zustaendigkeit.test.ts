/**
 * PDF-Export der Onboarding-Checkliste: Zustaendigkeit als Name, nie als
 * Schluessel.
 *
 * Seit Paket 5 steht in `ChecklistItem.assignee` der SCHLUESSEL („IT",
 * „VORGESETZTER"). In der Personalakte — dem einzigen Ausdruck, den spaeter
 * jemand ohne das Portal liest — gehoert der Name („IT-Abteilung",
 * „Führungskraft"). Freitext-Altwerte bleiben unveraendert stehen: haesslich,
 * aber ehrlich (`abteilungLabel`).
 *
 * Geprueft wird ueber die Texte, die pdfkit tatsaechlich setzt; der fertige
 * Stream ist komprimiert und verriete nichts. Der Spy ruft das Original weiter
 * auf, damit Umbruch und Seitenwechsel wie im Ernstfall rechnen.
 */

import PDFDocument from "pdfkit";
import {
  generateOnboardingPDF,
  type OnboardingExportContext,
} from "@/lib/pdf-export-onboarding";

type TextFn = (...args: unknown[]) => unknown;

const gesetzteTexte: string[] = [];

function aufgabe(teil: Partial<OnboardingExportContext["checklistItems"][number]>) {
  return {
    title: "Aufgabe",
    category: "Vor dem ersten Tag",
    isCompleted: false,
    completedAt: null,
    assignee: null,
    notes: null,
    dueDate: null,
    ...teil,
  };
}

const CTX: OnboardingExportContext = {
  firstName: "Anna",
  lastName: "Beispiel",
  email: "anna.beispiel@fes-minden.de",
  displayId: "ONB-2026-031",
  status: "REVIEWED",
  organizationName: "FES Minden",
  mandantNumber: "10",
  questionnaireType: "STANDARD",
  invitedAt: "2026-09-01T00:00:00.000Z",
  submittedAt: null,
  personalData: null,
  supervisorData: null,
  documents: [],
  checklistItems: [
    aufgabe({ title: "Benutzerkonto anlegen", assignee: "IT" }),
    aufgabe({ title: "Einarbeitungsplan abstimmen", assignee: "VORGESETZTER" }),
    aufgabe({ title: "Schlüssel übergeben", assignee: "Werkstatt" }),
    aufgabe({ title: "Ausweis ausstellen", assignee: "EMPFANG" }),
    aufgabe({ title: "Akte anlegen", assignee: null }),
  ],
  // Selbst angelegter Schluessel aus Einstellungen -> Abteilungen.
  abteilungsNamen: { EMPFANG: "Empfang" },
};

beforeAll(async () => {
  const original = (PDFDocument.prototype as unknown as { text: TextFn }).text;
  jest
    .spyOn(PDFDocument.prototype as unknown as { text: TextFn }, "text")
    .mockImplementation(function (this: unknown, ...args: unknown[]) {
      if (typeof args[0] === "string") gesetzteTexte.push(args[0]);
      return original.apply(this, args);
    });
  const pdf = await generateOnboardingPDF(CTX, "checkliste");
  expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
});

afterAll(() => {
  jest.restoreAllMocks();
});

describe("Zuständigkeit im PDF", () => {
  it("schreibt den Namen statt des Schlüssels", () => {
    expect(gesetzteTexte).toContain("IT-Abteilung");
    expect(gesetzteTexte).toContain("Führungskraft");
  });

  it("schreibt den Schlüssel nirgends", () => {
    expect(gesetzteTexte).not.toContain("IT");
    expect(gesetzteTexte).not.toContain("VORGESETZTER");
  });

  it("lässt Freitext-Altwerte stehen", () => {
    expect(gesetzteTexte).toContain("Werkstatt");
  });

  it("löst auch einen selbst angelegten Schlüssel zum Namen auf", () => {
    // `abteilungLabel` kennt nur die festen Schluessel; der Name kommt aus
    // den Einstellungen (Befund der Durchsicht).
    expect(gesetzteTexte).toContain("Empfang");
    expect(gesetzteTexte).not.toContain("EMPFANG");
  });

  it("schreibt ohne Zuständigkeit gar nichts in die Spalte", () => {
    // Weder "" noch "—": Eine leere Spalte ist die ehrliche Anzeige.
    expect(gesetzteTexte).not.toContain("");
    expect(gesetzteTexte.filter((t) => t === "Akte anlegen")).toHaveLength(1);
  });
});
