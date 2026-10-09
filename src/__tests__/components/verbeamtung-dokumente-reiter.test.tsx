/**
 * @jest-environment jsdom
 */

/**
 * Reiter „Dokumente" der Verbeamtung: Hochgeladene Dateien stehen im Typraster.
 *
 * Der Reiter verglich `d.type`, die Detailroute liefert die Zeilen aber roh aus
 * Prisma — die Spalte heisst `documentType`. Folge im Betrieb: Jeder Typ stand
 * auf „Ausstehend", jede Datei unter „Weitere Dokumente". TypeScript hat das
 * nicht gemerkt, weil `DocumentData` die falschen Felder als Pflicht behauptete.
 *
 * Die Dokumente hier haben deshalb die Form der Antwort von
 * GET /api/civil-service/[id] (Felder von CivilServiceDocument) — dass
 * `DocumentData` dabei nur Spalten des Modells kennt und deren Nullbarkeit
 * uebernimmt, haelt der Typwaechter unten fest (scheitert schon in tsc). Der
 * Typschluessel kommt aus CIVIL_SERVICE_DOC_TYPES selbst — so, wie der Upload
 * ihn speichert (Grossbuchstaben, siehe CIVIL_SERVICE_UPLOAD_TYPES).
 *
 * Umgebung wie in den uebrigen Komponententests: jsdom im Docblock, ohne
 * @testing-library/jest-dom.
 */
import { createRef } from "react";
import { render, screen } from "@testing-library/react";
import { TabDocuments } from "@/app/(portal)/dashboard/civil-service/[id]/tabs/tab-documents";
import type { DocumentData } from "@/app/(portal)/dashboard/civil-service/[id]/types";
import { CIVIL_SERVICE_DOC_TYPES, CIVIL_SERVICE_UPLOAD_TYPES } from "@/lib/constants";
import type { CivilServiceDocument } from "@prisma/client";

// Typwaechter gegen das Modell: `DocumentData` darf kein Feld tragen, das
// CivilServiceDocument nicht hat (so stand dort `type` statt `documentType`),
// und was im Modell nullbar ist, muss es dort auch sein (fileName, fileSize und
// uploadedAt standen als Pflicht da). Weicht eins ab, wird der Typ unten
// `false`, und tsc (npm run pruefen) wie ts-jest scheitern beim Uebersetzen.
type GemeinsameFelder = keyof DocumentData & keyof CivilServiceDocument;
type NichtImModell = Exclude<keyof DocumentData, keyof CivilServiceDocument>;
type ImModellNullbarHierNicht = {
  [K in GemeinsameFelder]: null extends CivilServiceDocument[K]
    ? null extends DocumentData[K]
      ? never
      : K
    : never;
}[GemeinsameFelder];
const nurModellfelder: [NichtImModell] extends [never] ? true : false = true;
const nullbarWieImModell: [ImModellNullbarHierNicht] extends [never] ? true : false = true;

// React 19 verlangt diese Marke, bevor act() Zustandsaenderungen einsammeln darf.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Die drei Karten ueber dem Raster laden selbst ueber das Netz und haben mit
// der Zuordnung der Dokumente nichts zu tun.
jest.mock("@/components/template-generation-section", () => ({
  TemplateGenerationSection: () => null,
}));
jest.mock("@/components/dokumentenpaket-section", () => ({
  DokumentenpaketSection: () => null,
}));
jest.mock("@/components/individuelle-mail/individuelle-mail-karte", () => ({
  IndividuelleMailKarte: () => null,
}));

const TYP = "VEBS_NACHWEIS";
const TYP_LABEL = CIVIL_SERVICE_DOC_TYPES[TYP];

/** Eine Zeile, wie die Detailroute sie liefert (roh aus CivilServiceDocument). */
function dokument(teil: Partial<DocumentData> & Pick<DocumentData, "id" | "documentType">): DocumentData {
  return {
    documentName: teil.documentType.replace(/_/g, " "),
    step: null,
    fileName: `${teil.id}.pdf`,
    fileSize: 2048,
    mimeType: "application/pdf",
    status: "UPLOADED",
    uploadedAt: "2026-10-01T08:00:00.000Z",
    expiresAt: null,
    createdAt: "2026-10-01T08:00:00.000Z",
    ...teil,
  };
}

function reiterZeigen(documents: DocumentData[]) {
  return render(
    <TabDocuments
      documents={documents}
      uploadingDoc={false}
      uploadDocType=""
      setUploadDocType={() => {}}
      fileInputRef={createRef<HTMLInputElement>()}
      onUpload={() => {}}
      processId="cs-1"
      assessments={[]}
      organizationId="org-1"
      canEdit
    />,
  );
}

/** Die Karte eines Typs im Raster: Ueberschrift → Kopfzeile → Karte. */
function karte(label: string): HTMLElement {
  const ueberschrift = screen.getByRole("heading", { level: 4, name: label });
  const kartenElement = ueberschrift.parentElement?.parentElement;
  if (!kartenElement) throw new Error(`Karte zu „${label}" nicht gefunden`);
  return kartenElement;
}

/** Der Abschnitt „Weitere Dokumente" oder null, wenn er fehlt. */
function weitereDokumente(): HTMLElement | null {
  const ueberschrift = screen.queryByRole("heading", { level: 3, name: /Weitere Dokumente/ });
  return ueberschrift?.parentElement ?? null;
}

describe("Verbeamtung, Reiter Dokumente: Zuordnung ueber documentType", () => {
  it("DocumentData kennt nur Spalten von CivilServiceDocument, nullbar wie im Modell", () => {
    // Die eigentliche Pruefung macht der Uebersetzer (siehe Typwaechter oben).
    expect([nurModellfelder, nullbarWieImModell]).toEqual([true, true]);
  });

  it("der Testtyp ist ein Schluessel, den der Upload annimmt", () => {
    // Sonst prueften die Faelle unten einen Typ, den es im Betrieb nie gibt.
    expect(TYP_LABEL).toBeTruthy();
    expect(CIVIL_SERVICE_UPLOAD_TYPES).toContain(TYP);
    expect(TYP.toUpperCase()).toBe(TYP);
  });

  it("zeigt ein Dokument mit bekanntem Typ im Raster als vorhanden, nicht unter „Weitere Dokumente“", () => {
    reiterZeigen([dokument({ id: "doc-vebs", documentType: TYP, fileName: "vebs-nachweis.pdf" })]);

    const vebs = karte(TYP_LABEL);
    expect(vebs.textContent).toContain("Vorhanden");
    expect(vebs.textContent).not.toContain("Ausstehend");
    expect(vebs.textContent).toContain("vebs-nachweis.pdf");
    const laden = Array.from(vebs.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(laden).toEqual(["/api/civil-service/cs-1/documents/doc-vebs"]);

    // Ohne unbekannte Typen gibt es den Abschnitt gar nicht.
    expect(weitereDokumente()).toBeNull();
  });

  it("stellt ein Dokument mit unbekanntem Typ unter „Weitere Dokumente“, das bekannte bleibt im Raster", () => {
    reiterZeigen([
      dokument({ id: "doc-vebs", documentType: TYP, fileName: "vebs-nachweis.pdf" }),
      dokument({ id: "doc-sonst", documentType: "SONSTIGES", fileName: "altbestand.pdf" }),
    ]);

    const weitere = weitereDokumente();
    expect(weitere).not.toBeNull();
    expect(weitere!.textContent).toContain("altbestand.pdf");
    expect(weitere!.textContent).not.toContain("vebs-nachweis.pdf");
    // Zaehler neben der Ueberschrift: genau das eine unbekannte Dokument.
    expect(screen.getByRole("heading", { level: 3, name: /Weitere Dokumente/ }).textContent).toContain("1");

    expect(karte(TYP_LABEL).textContent).toContain("Vorhanden");
    // Das unbekannte Dokument macht keinen anderen Typ zu „Vorhanden“.
    const uebrigeVorhanden = Object.entries(CIVIL_SERVICE_DOC_TYPES)
      .filter(([schluessel]) => schluessel !== TYP)
      .filter(([, label]) => karte(label).textContent?.includes("Vorhanden"));
    expect(uebrigeVorhanden).toEqual([]);
  });

  it("haelt bei mehreren Uploads eines Typs jede Datei erreichbar, die neueste vorn", () => {
    // Auf main standen alle Dateien unter „Weitere Dokumente“ und liessen sich
    // laden. Seit der Zuordnung zeigt die Karte die neueste (die Route liefert
    // neueste zuerst) — die aelteren duerfen dabei nicht verschwinden, etwa die
    // ersten Seiten eines seitenweise als Bilder hochgeladenen Vertrags.
    reiterZeigen([
      dokument({ id: "doc-neu", documentType: TYP, fileName: "neu.pdf" }),
      dokument({ id: "doc-alt", documentType: TYP, fileName: "alt.pdf" }),
    ]);

    const vebs = karte(TYP_LABEL);
    expect(vebs.textContent).toContain("Vorhanden");
    const hrefs = Array.from(vebs.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual([
      "/api/civil-service/cs-1/documents/doc-neu",
      "/api/civil-service/cs-1/documents/doc-alt",
    ]);
    expect(vebs.textContent).toContain("1 frühere Datei");
    expect(screen.getByRole("link", { name: "alt.pdf laden" }).getAttribute("href")).toBe(
      "/api/civil-service/cs-1/documents/doc-alt",
    );
    // Die neueste steht vor der frueheren, nicht umgekehrt.
    const text = vebs.textContent ?? "";
    expect(text.indexOf("neu.pdf")).toBeLessThan(text.indexOf("alt.pdf"));

    // Ein bekannter Typ gehoert nicht unter „Weitere Dokumente“, auch nicht doppelt.
    expect(weitereDokumente()).toBeNull();
  });

  it("zeigt per Soft Delete entfernte Dokumente nirgends", () => {
    reiterZeigen([
      dokument({ id: "doc-weg", documentType: TYP, fileName: "geloescht.pdf", status: "DELETED" }),
      dokument({ id: "doc-weg-2", documentType: "SONSTIGES", fileName: "auch-weg.pdf", status: "DELETED" }),
    ]);

    expect(karte(TYP_LABEL).textContent).toContain("Ausstehend");
    expect(document.body.textContent).not.toContain("geloescht.pdf");
    expect(weitereDokumente()).toBeNull();
  });

  it("meldet ein vom Fristen-Lauf als EXPIRED markiertes Amtsarzt-Zeugnis als abgelaufen", () => {
    reiterZeigen([
      dokument({
        id: "doc-amt",
        documentType: "AMTSARZT_PROBE",
        status: "EXPIRED",
        expiresAt: "2099-01-01T00:00:00.000Z",
      }),
    ]);

    const amtsarzt = karte(CIVIL_SERVICE_DOC_TYPES.AMTSARZT_PROBE);
    expect(amtsarzt.textContent).toContain("Abgelaufen");
    expect(amtsarzt.textContent).toContain("Neues Zeugnis erforderlich");
  });

  it("zeigt ohne Dateinamen den Anzeigenamen statt einer leeren Zeile", () => {
    reiterZeigen([
      dokument({ id: "doc-ohne", documentType: TYP, fileName: null, fileSize: null, uploadedAt: null }),
    ]);

    const vebs = karte(TYP_LABEL);
    expect(vebs.textContent).toContain("VEBS NACHWEIS");
    expect(vebs.textContent).toContain("Vorhanden");
  });
});
