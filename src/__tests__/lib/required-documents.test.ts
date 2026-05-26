import {
  computeMissingRequiredDocuments,
  documentTypeLabel,
} from "@/lib/required-documents";

describe("computeMissingRequiredDocuments", () => {
  it("meldet fehlende Pflichtdokumente", () => {
    const missing = computeMissingRequiredDocuments({
      required: ["GEBURTSURKUNDE_EIGEN", "MASERNSCHUTZ"],
      uploadedTypes: ["GEBURTSURKUNDE_EIGEN"],
      hasChildren: false,
    });
    expect(missing).toEqual(["MASERNSCHUTZ"]);
  });

  it("verlangt GEBURTSURKUNDE_KIND nur, wenn Kinder vorhanden sind", () => {
    const ohneKinder = computeMissingRequiredDocuments({
      required: ["GEBURTSURKUNDE_KIND"],
      uploadedTypes: [],
      hasChildren: false,
    });
    expect(ohneKinder).toEqual([]);

    const mitKindern = computeMissingRequiredDocuments({
      required: ["GEBURTSURKUNDE_KIND"],
      uploadedTypes: [],
      hasChildren: true,
    });
    expect(mitKindern).toEqual(["GEBURTSURKUNDE_KIND"]);
  });

  it("gibt leeres Array zurueck, wenn alle Pflichtdokumente vorliegen", () => {
    const missing = computeMissingRequiredDocuments({
      required: ["GEBURTSURKUNDE_EIGEN", "GEBURTSURKUNDE_KIND"],
      uploadedTypes: ["GEBURTSURKUNDE_EIGEN", "GEBURTSURKUNDE_KIND"],
      hasChildren: true,
    });
    expect(missing).toEqual([]);
  });

  it("liefert deutsche Labels", () => {
    expect(documentTypeLabel("GEBURTSURKUNDE_EIGEN")).toBe(
      "Kopie Ihrer Geburtsurkunde",
    );
    expect(documentTypeLabel("UNBEKANNT")).toBe("UNBEKANNT");
  });
});
