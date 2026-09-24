/**
 * @jest-environment jsdom
 */

/**
 * Fristkorrektur an einem befristeten Nachweis — der STATUS kommt mit.
 *
 * Seit der Durchsicht 09/2026 nimmt die Route (PATCH
 * /api/onboarding/[id]/documents/[docId]) ein EXPIRED zurueck, wenn die neue
 * Frist nicht abgelaufen ist, und meldet den neuen Status in der Antwort. Die
 * Oberflaeche uebernahm davon bisher nur `gueltigBis`: Nach einer Korrektur
 * stand bis zum Neuladen das Abzeichen „Abgelaufen" neben der gruenen Ampel —
 * genau das Bild, gegen das der Server-Fix gebaut ist.
 *
 * Belegt werden beide Haelften:
 *  1. `AblaufAbzeichen` reicht den Status aus der Antwort nach oben weiter.
 *  2. `fristAenderungUebernehmen` schreibt ihn in die geladene Liste — und
 *     laesst ihn stehen, wenn die Antwort keinen traegt.
 *
 * Umgebung wie in offene-nachweise.test.tsx: jsdom im Docblock, ohne
 * @testing-library/jest-dom.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import {
  AblaufAbzeichen,
  fristAenderungUebernehmen,
} from "@/app/(portal)/dashboard/[id]/detail-content";

// React 19 verlangt diese Marke, bevor act() Zustandsaenderungen einsammeln darf.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ABGELAUFEN = "2020-09-01T00:00:00.000Z";
const NEU = "2099-09-01";

function dokument(teil: Record<string, unknown> = {}) {
  return {
    id: "d1",
    type: "AUFENTHALTSTITEL",
    fileName: "titel.pdf",
    fileSize: 1024,
    mimeType: "application/pdf",
    status: "EXPIRED",
    uploadedAt: "2020-01-01T10:00:00.000Z",
    gueltigBis: ABGELAUFEN,
    ...teil,
  };
}

function antwort(koerper: unknown, ok = true) {
  return { ok, json: async () => koerper } as unknown as Response;
}

const fetchMock = jest.fn();

beforeEach(() => {
  fetchMock.mockReset();
  (globalThis as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;
});

/** „Ändern" → neues Datum → „Speichern". */
async function korrigieren(onFristGeaendert: jest.Mock) {
  render(
    <AblaufAbzeichen
      doc={dokument()}
      onboardingId="onb-1"
      canEdit
      onFristGeaendert={onFristGeaendert}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Ändern" }));
  fireEvent.change(screen.getByLabelText(/^Ablaufdatum für/), { target: { value: NEU } });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
  });
}

describe("AblaufAbzeichen: Status aus der Antwort", () => {
  it("reicht den zurueckgenommenen Status mit dem Datum nach oben", async () => {
    fetchMock.mockResolvedValue(
      antwort({ id: "d1", type: "AUFENTHALTSTITEL", gueltigBis: `${NEU}T00:00:00.000Z`, status: "UPLOADED" }),
    );
    const onFristGeaendert = jest.fn();

    await korrigieren(onFristGeaendert);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/onboarding/onb-1/documents/d1",
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ gueltigBis: NEU }) }),
    );
    expect(onFristGeaendert).toHaveBeenCalledWith("d1", {
      gueltigBis: `${NEU}T00:00:00.000Z`,
      status: "UPLOADED",
    });
  });

  it("ohne Status in der Antwort: kein erfundener Status", async () => {
    fetchMock.mockResolvedValue(antwort({ id: "d1", gueltigBis: `${NEU}T00:00:00.000Z` }));
    const onFristGeaendert = jest.fn();

    await korrigieren(onFristGeaendert);

    expect(onFristGeaendert).toHaveBeenCalledWith("d1", {
      gueltigBis: `${NEU}T00:00:00.000Z`,
      status: undefined,
    });
  });

  it("Fehler der Route: nichts wird uebernommen, die Meldung steht da", async () => {
    fetchMock.mockResolvedValue(antwort({ error: "Das Datum liegt zu weit in der Zukunft." }, false));
    const onFristGeaendert = jest.fn();

    await korrigieren(onFristGeaendert);

    expect(onFristGeaendert).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("Das Datum liegt zu weit in der Zukunft.");
  });
});

describe("fristAenderungUebernehmen", () => {
  const liste = [
    dokument(),
    dokument({ id: "d2", status: "EXPIRED", gueltigBis: ABGELAUFEN }),
  ];

  it("uebernimmt Datum UND Status — nur am betroffenen Dokument", () => {
    const neu = fristAenderungUebernehmen(liste, "d1", {
      gueltigBis: `${NEU}T00:00:00.000Z`,
      status: "UPLOADED",
    });
    expect(neu[0]).toMatchObject({ gueltigBis: `${NEU}T00:00:00.000Z`, status: "UPLOADED" });
    // Das andere Dokument bleibt, wie es war — auch sein EXPIRED.
    expect(neu[1]).toBe(liste[1]);
  });

  it("ohne Status bleibt der bisherige stehen", () => {
    const neu = fristAenderungUebernehmen(liste, "d1", { gueltigBis: null });
    expect(neu[0]).toMatchObject({ gueltigBis: null, status: "EXPIRED" });
  });

  it("veraendert die Eingabe nicht (React-Zustand)", () => {
    fristAenderungUebernehmen(liste, "d1", { gueltigBis: null, status: "UPLOADED" });
    expect(liste[0]).toMatchObject({ gueltigBis: ABGELAUFEN, status: "EXPIRED" });
  });
});
