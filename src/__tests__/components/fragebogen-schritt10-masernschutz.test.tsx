/**
 * @jest-environment jsdom
 */

/**
 * Der Masernschutz-Abschnitt der Zusammenfassung (Schritt 10).
 *
 * DER BEFUND. Die Zusammenfassung las `bornAfter1971` roh aus dem
 * Formularzustand. Die Spalte haelt aber nur den Stand beim Verlassen von
 * Schritt 9 fest und wird danach nie wieder angefasst — waehrend die
 * Schrittleiste den Sprung zurueck zu Schritt 1 zum bequemen Regelweg macht:
 *
 *   Zahlendreher 1990 eingetragen, Schritt 9 durchlaufen, zurueck zu Schritt 1,
 *   auf 1965 korrigiert, weiter nach Schritt 10. Dort stand "Nach dem
 *   31.12.1970 geboren: Ja" — direkt unter dem Geburtsdatum 1965, das ihm
 *   widerspricht, und ueber einer Pflichtliste, die live rechnet und keinen
 *   Masernschutz-Nachweis verlangt. Und zwar auf der Seite, auf der die Person
 *   die Richtigkeit ihrer Angaben verbindlich erklaert.
 *
 * Geprueft wird deshalb am GERENDERTEN Schritt: Die Anzeigefunktion
 * `nach1970GeborenAnzeige` hat ihre eigene Suite
 * (src/__tests__/lib/masernschutz-anzeige.test.ts) und war die ganze Zeit
 * gruen — der Fehler lag darin, dass die Zusammenfassung sie nicht benutzte.
 *
 * Umgebung wie in fragebogen-schritt10.test.tsx: jsdom im Docblock, JSX aus der
 * einen transform-Regel in jest.config.ts, ohne @testing-library/jest-dom.
 */
import { render, screen, waitFor } from "@testing-library/react";
import { Step10Summary } from "@/app/fragebogen/[token]/steps/step10-summary";

// React 19 verlangt diese Marke, bevor act() Zustandsaenderungen einsammeln darf.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const TOKEN = "magic-token-1234567890";

const GEBURTSJAHR_LABEL = "Nach dem 31.12.1970 geboren";
const NACHWEIS_LABEL = "Masernschutz vorhanden";

/** Der Bestand, den `DocumentUpload` beim Aufbau laedt — leer, aber erfolgreich. */
function bestand() {
  return jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ documents: [] }),
  });
}

async function rendern(angaben: Record<string, unknown>) {
  render(
    <Step10Summary
      data={angaben}
      allData={angaben}
      onBack={jest.fn()}
      saving={false}
      onSubmit={jest.fn()}
      organization={{
        name: "Grundschule Beispiel",
        mandantNumber: "0815",
        type: "GRUNDSCHULE",
      }}
      token={TOKEN}
      requiredDocuments={["GEBURTSURKUNDE_EIGEN"]}
    />,
  );
  await waitFor(() =>
    expect(screen.getByText("Pflichtdokumente")).not.toBeNull(),
  );
}

/**
 * Der Wert, der neben einer Beschriftung steht.
 *
 * `SummaryRow` setzt Beschriftung und Wert als zwei Kinder derselben Zeile;
 * ueber den Text der Beschriftung nach oben und den Rest des Zeilentextes
 * abzuziehen ist der kuerzeste verlaessliche Weg dorthin.
 */
function wertNeben(label: string): string {
  const zelle = screen.getByText(label);
  const zeile = zelle.parentElement;
  if (!zeile) throw new Error(`Keine Zeile zu „${label}“ gefunden`);
  return (zeile.textContent ?? "").replace(label, "").trim();
}

beforeEach(() => {
  jest.clearAllMocks();
  (global as unknown as { fetch: unknown }).fetch = bestand();
});

// =============================================
// 1 — Der Befund
// =============================================
describe("nachtraeglich korrigiertes Geburtsdatum", () => {
  it("zeigt Nein, wenn das Geburtsjahr 1965 den gespeicherten Wert widerlegt", async () => {
    await rendern({
      birthDate: "1965-04-03",
      bornAfter1971: true,
      masernschutzProvided: true,
    });

    expect(wertNeben(GEBURTSJAHR_LABEL)).toBe("Nein");
  });

  it("nimmt auch die Nachweiszeile vom Altwert herunter", async () => {
    // Sonst haenge die Zeile weiter am eingefrorenen "Ja" und die Uebersicht
    // verlangte eine Auskunft, zu der es nach dem korrigierten Datum keinen
    // Anlass mehr gibt.
    await rendern({
      birthDate: "1965-04-03",
      bornAfter1971: true,
      masernschutzProvided: true,
    });

    expect(screen.queryByText(NACHWEIS_LABEL)).toBeNull();
  });

  it("zeigt Ja, wenn der gespeicherte Wert ein stilles Nein war", async () => {
    await rendern({
      birthDate: "1990-04-17",
      bornAfter1971: false,
      masernschutzProvided: true,
    });

    expect(wertNeben(GEBURTSJAHR_LABEL)).toBe("Ja");
    expect(wertNeben(NACHWEIS_LABEL)).toBe("Ja");
  });
});

// =============================================
// 2 — Was unveraendert gelten muss
// =============================================
describe("die Bedingungen um den Abschnitt herum", () => {
  it("zeigt den Abschnitt gar nicht, wenn Schritt 9 nie lief", async () => {
    // MINIJOB: Der Schritt ist abgeschaltet, es gibt keine Angabe. Ein aus dem
    // Geburtsdatum gerechnetes "Ja" waere hier eine Antwort auf eine nie
    // gestellte Frage — und das auf der Seite der verbindlichen Erklaerung.
    await rendern({ birthDate: "1990-04-17" });

    expect(screen.queryByText("9. Masernschutz")).toBeNull();
    expect(screen.queryByText(GEBURTSJAHR_LABEL)).toBeNull();
  });

  it("faellt ohne Geburtsdatum auf den gespeicherten Wert zurueck", async () => {
    // Die Rechnung gibt nichts her. Dann ist der frueher gegebene Wert immer
    // noch besser als eine leere Zeile.
    await rendern({ bornAfter1971: true, masernschutzProvided: false });

    expect(wertNeben(GEBURTSJAHR_LABEL)).toBe("Ja");
    expect(wertNeben(NACHWEIS_LABEL)).toBe("Nein");
  });
});
