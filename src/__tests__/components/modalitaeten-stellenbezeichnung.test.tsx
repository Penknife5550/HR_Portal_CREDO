/**
 * @jest-environment jsdom
 */

/**
 * Einstellungsmodalitaeten, Schritt 1: das Feld „Stellenbezeichnung".
 *
 * Seit 09/2026 heisst es nicht mehr „Stellenbeschreibung", ist EINZEILIG und
 * nimmt hoechstens 200 Zeichen (vorher dreizeilig, 2000). Zwei Dinge lassen sich
 * nur an der gerenderten Maske belegen:
 *
 * 1. BESTANDSWERTE MIT ZEILENUMBRUCH. Ein `<input type="text">` entfernt
 *    Umbrueche STILL aus seinem Wert. Ein Entwurf „Lehrkraft\nMathematik" aus
 *    der Zeit des Textfeldes kaeme ohne Umwandlung als „LehrkraftMathematik"
 *    zurueck an den Server — und von dort in den Arbeitsvertrag. Die Maske
 *    macht daraus beim Oeffnen „Lehrkraft, Mathematik".
 * 2. BESTANDSWERTE UEBER 200 ZEICHEN. `maxLength` kuerzt einen vorbelegten Wert
 *    nicht. "Weiter" muss ihn sichtbar abweisen, statt ihn an die Route zu
 *    schicken, die ihn mit einem Validierungsfehler beantwortet.
 *
 * Umgebung wie in modalitaeten-kostenstellen.test.tsx: jsdom im Docblock,
 * ohne @testing-library/jest-dom.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import ModalitaetenPage from "@/app/modalitaeten/[token]/page";

// React 19 verlangt diese Marke, bevor act() Zustandsaenderungen einsammeln darf.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("next/navigation", () => ({
  useParams: () => ({ token: "supervisor-token-1234567890" }),
}));

// Das Logo traegt zu keiner Zusicherung bei.
jest.mock("next/image", () => ({ __esModule: true, default: () => null }));

type Rumpf = Record<string, unknown>;

let gesendet: { method: string; body: Rumpf }[] = [];
let gespeichert: Rumpf | null = null;

function seite(supervisorData: Rumpf | null) {
  return {
    onboardingId: "ob1",
    email: "neu@example.de",
    employeeName: "Maria Muster",
    organization: { name: "FES Minden", mandantNumber: "100", type: "SCHULE" },
    organizations: [],
    supervisorData,
    status: "IN_PROGRESS",
  };
}

/** Ein Vorgang, der auf Schritt 1 steht — alle uebrigen Pflichtangaben gueltig. */
function schritt1(stellenbeschreibung: string): Rumpf {
  return {
    currentStep: 0,
    betriebsstaette: "Gymnasium Minden",
    stellenbeschreibung,
    vertragsbeginn: "2026-09-01T00:00:00.000Z",
    befristet: false,
  };
}

beforeEach(() => {
  jest.useFakeTimers();
  gesendet = [];
  gespeichert = null;
  global.fetch = jest.fn(async (_url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    if (method === "GET") {
      return { ok: true, json: async () => seite(gespeichert) } as unknown as Response;
    }
    gesendet.push({ method, body: JSON.parse(String(init?.body)) as Rumpf });
    return { ok: true, json: async () => ({ success: true }) } as unknown as Response;
  }) as unknown as typeof fetch;
  window.scrollTo = jest.fn();
});

afterEach(() => {
  jest.useRealTimers();
});

const feld = () =>
  document.querySelector<HTMLInputElement | HTMLTextAreaElement>('[name="stellenbeschreibung"]');

async function zeige(supervisorData: Rumpf) {
  gespeichert = supervisorData;
  render(<ModalitaetenPage />);
  await act(async () => {});
}

async function weiter() {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Weiter" }));
  });
}

describe("Stellenbezeichnung im Formular", () => {
  it("heisst „Stellenbezeichnung“ und ist ein einzeiliges Feld mit 200 Zeichen", async () => {
    await zeige(schritt1("Lehrkraft für Mathematik und Physik"));

    expect(screen.getByText(/Stellenbezeichnung \(wird in Arbeitsvertrag übernommen!\)/)).toBeTruthy();
    expect(screen.queryByText(/Stellenbeschreibung/)).toBeNull();
    // Kartenkopf mit Umlaut und neuem Begriff.
    expect(screen.getByText("Betriebsstätte, Stellenbezeichnung, Vertragsdaten")).toBeTruthy();

    const eingabe = feld();
    expect(eingabe?.tagName).toBe("INPUT");
    expect(eingabe?.getAttribute("type")).toBe("text");
    expect(eingabe?.maxLength).toBe(200);
    expect(eingabe?.getAttribute("placeholder")).toBe("z.B. Lehrkraft für Mathematik und Physik");
    // Der Zaehler nennt die neue Grenze.
    expect(screen.getByText("35 / 200 Zeichen")).toBeTruthy();
  });

  it("macht aus einem mehrzeiligen Bestandswert „, “ und speichert ihn so", async () => {
    await zeige(schritt1("Lehrkraft\nMathematik und Physik"));

    expect(feld()?.value).toBe("Lehrkraft, Mathematik und Physik");

    await weiter();

    expect(gesendet).toHaveLength(1);
    expect(gesendet[0].method).toBe("PUT");
    expect(gesendet[0].body.stellenbeschreibung).toBe("Lehrkraft, Mathematik und Physik");
  });

  it("nennt die Zeile in der Zusammenfassung „Stellenbezeichnung“", async () => {
    await zeige({ ...schritt1("Lehrkraft für Mathematik"), currentStep: 4 });

    expect(screen.getByText("Stellenbezeichnung")).toBeTruthy();
    expect(screen.getByText("Lehrkraft für Mathematik")).toBeTruthy();
  });

  it("weist einen zu langen Bestandswert beim Weiter sichtbar ab und sendet nichts", async () => {
    await zeige(schritt1("x".repeat(201)));

    await weiter();

    expect(gesendet).toHaveLength(0);
    expect(screen.getByText("Bitte maximal 200 Zeichen.")).toBeTruthy();
    expect(screen.getByText("Bitte prüfen Sie die rot markierten Felder.")).toBeTruthy();
  });

  it("meldet ein leeres Feld mit dem neuen Begriff", async () => {
    await zeige(schritt1(""));

    await weiter();

    expect(gesendet).toHaveLength(0);
    expect(screen.getByText("Stellenbezeichnung ist erforderlich.")).toBeTruthy();
  });
});
