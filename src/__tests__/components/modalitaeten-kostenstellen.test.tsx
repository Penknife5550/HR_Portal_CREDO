/**
 * @jest-environment jsdom
 */

/**
 * Kostenstellen-Aufteilung im Vorgesetzten-Formular — der WIDERRUF.
 *
 * Anlass ist ein Befund der Durchsicht vor dem Push (09/2026): Eine entfernte
 * Zeile stand nach dem Neuladen des Magic Links wieder in der Maske.
 *
 * Der Grund liegt in diesem Release an zwei Quellen fuer dieselbe Angabe. Die
 * Aufteilung steht seit dem Umbau in `SupervisorKostenstelle`, die alten
 * Einzelspalten `kostenstelle`/`kostenstelleAnteil` bleiben noch ein Release
 * daneben stehen (der Entrypoint schiebt das Schema VOR der Datenmigration).
 * Weil ein Bestandsvorgang, dessen Migration noch nicht gelaufen ist, seine
 * Kostenstelle nicht verlieren soll, faellt die Maske beim Laden auf die
 * Alt-Spalte zurueck (`mitKostenstellenRueckfall`). Dieser Rueckfall sieht am
 * Ergebnis aber nicht, OB die Aufteilung nie gepflegt oder gerade bewusst
 * geleert wurde — er setzte die geloeschte Zeile also wieder ein.
 *
 * Die Heilung sitzt auf der Schreibseite: Schritt 4 fuehrt die Alt-Spalte mit
 * der Aufteilung mit (erste Zeile, sonst leer), und die PUT-Route leitet sie
 * ohnehin nur noch selbst ab. Die Serverhaelfte prueft
 * src/__tests__/api/modalitaeten.test.ts ("Alt-Spalte folgt der Aufteilung");
 * hier steht die Haelfte, die nur an der gerenderten Maske zu belegen ist:
 * WAS Schritt 4 abschickt und WAS die Zusammenfassung danach anzeigt.
 *
 * Umgebung wie in den uebrigen Komponententests: jsdom im Docblock
 * (jest.config.ts bleibt global auf "node"), ohne @testing-library/jest-dom.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import ModalitaetenPage from "@/app/modalitaeten/[token]/page";

// React 19 verlangt diese Marke, bevor act() Zustandsaenderungen einsammeln darf.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Die Seite liest den Token aus der Route. Der Wert steht als Literal in der
// Fabrik: jest.mock wird nach oben gezogen und darf nichts von aussen sehen.
jest.mock("next/navigation", () => ({
  useParams: () => ({ token: "supervisor-token-1234567890" }),
}));

// Das Logo traegt zu keiner Zusicherung bei und zoege den Bildlader von Next
// in den Test. Ohne JSX in der Fabrik, damit sie nicht von der Reihenfolge der
// erzeugten `require`-Aufrufe abhaengt.
jest.mock("next/image", () => ({ __esModule: true, default: () => null }));

type Rumpf = Record<string, unknown>;

let fetchMock: jest.Mock;
/** Alles, was die Maske an die Route geschickt hat (nur PUT und POST). */
let gesendet: { method: string; body: Rumpf }[] = [];
/** Was das GET liefert — je Test vor dem Rendern gesetzt. */
let gespeichert: Rumpf | null = null;

/** Die GET-Antwort der Route um den jeweiligen Datensatz herum. */
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

/**
 * Ein Vorgang, der auf Schritt 4 wieder einsteigt (`currentStep: 3` ist die
 * Position, nicht die Nummer). Die Pflichtangaben der uebrigen Felder stehen
 * mit drin, sonst kaeme "Weiter" nicht durch `supStep4Schema`.
 */
function schritt4(zusatz: Rumpf): Rumpf {
  return {
    currentStep: 3,
    probezeit: true,
    probezeitMonate: 6,
    urlaubstageProJahr: 30,
    masernschutzErforderlich: false,
    masernschutzVorArbeitsbeginn: false,
    zeiterfassung: true,
    zusatzvereinbarungen: "",
    kostenstellenBemerkung: "",
    ...zusatz,
  };
}

beforeEach(() => {
  // Ohne Zeitgeber liefe der 2-Sekunden-Timer aus `saveStepData`
  // ("Gespeichert" wieder ausblenden) nach dem Testende weiter.
  jest.useFakeTimers();
  gesendet = [];
  gespeichert = null;
  fetchMock = jest.fn(async (_url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    if (method === "GET") {
      return { ok: true, json: async () => seite(gespeichert) } as unknown as Response;
    }
    gesendet.push({ method, body: JSON.parse(String(init?.body)) as Rumpf });
    return { ok: true, json: async () => ({ success: true }) } as unknown as Response;
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  // jsdom kennt window.scrollTo nicht und schriebe bei jedem Schrittwechsel
  // eine "Not implemented"-Meldung in die Konsole.
  window.scrollTo = jest.fn();
});

afterEach(() => {
  jest.useRealTimers();
});

// =============================================
// Zugriffe auf die Oberflaeche
// =============================================

/** Ueberschrift der Maske — sie sagt, auf welchem Schritt wir stehen. */
const stepTitel = () => document.querySelector("main h2")?.textContent ?? "";

/** Die Bezeichnungsfelder der Aufteilung, in der Reihenfolge der Tabelle. */
const zeilenFelder = () =>
  Array.from(
    document.querySelectorAll<HTMLInputElement>('input[placeholder="z.B. 4711"]'),
  );

/** Der zuletzt abgeschickte Rumpf. */
const letzterRumpf = () => gesendet[gesendet.length - 1].body;

async function zeige(supervisorData: Rumpf) {
  gespeichert = supervisorData;
  render(<ModalitaetenPage />);
  // Das GET aus dem useEffect aufloesen lassen.
  await act(async () => {});
}

async function klicke(name: string) {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
  });
}

// =============================================
// 1. Der Widerruf
// =============================================

describe("Kostenstellen: eine entfernte Zeile bleibt entfernt", () => {
  it("leert die Alt-Spalte mit, wenn die letzte Zeile entfernt wird", async () => {
    // Migrierter Bestandsvorgang: Die Zeile 4711/100 stammt aus der
    // Datenmigration, die Alt-Spalte steht unveraendert daneben.
    await zeige(
      schritt4({
        kostenstelle: "4711",
        kostenstelleAnteil: null,
        kostenstellen: [{ bezeichnung: "4711", anteil: 100 }],
      }),
    );
    expect(stepTitel()).toBe("Zusätzliche Angaben");
    expect(zeilenFelder().map((f) => f.value)).toEqual(["4711"]);

    await klicke("Entfernen");
    expect(zeilenFelder()).toHaveLength(0);
    await klicke("Weiter");

    // Die Zeilen sind fort — das tat die Maske schon vorher richtig.
    expect(letzterRumpf().kostenstellen).toEqual([]);
    // DAS ist der Befund: Vorher reichte Schritt 4 den geladenen Altwert
    // unveraendert zurueck ("4711"), die Route schrieb ihn erneut fest, und
    // beim naechsten Oeffnen des Links setzte der Rueckfall die geloeschte
    // Zeile wieder ein.
    expect(letzterRumpf().kostenstelle).toBe("");
    expect(letzterRumpf().kostenstelleAnteil).toBeNull();
  });

  it("zeigt die geloeschte Kostenstelle auch in der Zusammenfassung nicht mehr", async () => {
    // Die Zusammenfassung faellt ohne Zeilen auf `data.kostenstelle` zurueck.
    // Stuende dort der Altwert, bestaetigte die vorgesetzte Person beim
    // Absenden eine Kostenstelle, die sie gerade entfernt hat.
    await zeige(
      schritt4({
        kostenstelle: "4711",
        kostenstelleAnteil: null,
        kostenstellen: [{ bezeichnung: "4711", anteil: 100 }],
      }),
    );

    await klicke("Entfernen");
    await klicke("Weiter");

    expect(stepTitel()).toBe("Zusammenfassung");
    expect(screen.queryByText("4711")).toBeNull();
  });
});

// =============================================
// 2. Die Alt-Spalte folgt der Aufteilung
// =============================================

describe("Kostenstellen: die Alt-Spalte folgt der gepflegten Aufteilung", () => {
  it("schickt die erste Zeile statt des geladenen Altwerts", async () => {
    // Bestandsvorgang "4711", von der vorgesetzten Person auf 5000/60 % und
    // 6000/40 % umgestellt. Die erste Zeile ist dieselbe Lesart, mit der der
    // CSV-Export die eine LOGA-Spalte "Kostenstelle" fuellt.
    await zeige(
      schritt4({
        kostenstelle: "4711",
        kostenstelleAnteil: 100,
        kostenstellen: [
          { bezeichnung: "5000", anteil: 60 },
          { bezeichnung: "6000", anteil: 40 },
        ],
      }),
    );
    expect(zeilenFelder().map((f) => f.value)).toEqual(["5000", "6000"]);

    await klicke("Weiter");

    expect(letzterRumpf().kostenstellen).toEqual([
      { bezeichnung: "5000", anteil: 60 },
      { bezeichnung: "6000", anteil: 40 },
    ]);
    expect(letzterRumpf().kostenstelle).toBe("5000");
    expect(letzterRumpf().kostenstelleAnteil).toBe(60);
  });
});

// =============================================
// 3. Wofuer der Rueckfall bleibt
// =============================================

describe("Kostenstellen: der Rueckfall auf die Alt-Spalte", () => {
  it("macht aus einer noch nicht migrierten Kostenstelle eine Zeile", async () => {
    // Keine Regressionsprobe, sondern der Grund, warum der Rueckfall NICHT
    // einfach entfernt wurde: Auf einem Server, dessen Datenmigration noch
    // nicht gelaufen ist, saehe die vorgesetzte Person sonst eine leere
    // Tabelle, obwohl im Vorgang eine Kostenstelle steht.
    await zeige(
      schritt4({ kostenstelle: "4711", kostenstelleAnteil: null, kostenstellen: [] }),
    );

    expect(zeilenFelder().map((f) => f.value)).toEqual(["4711"]);
    // Fehlt der Anteil, traegt die eine Kostenstelle alles — dieselbe Regel
    // wie in der Datenmigration.
    expect(
      document.querySelector<HTMLInputElement>('input[type="number"]')?.value,
    ).toBe("100");
  });

  it("greift nicht mehr, sobald die Route die Alt-Spalte geleert hat", async () => {
    // Das Gegenstueck zum ersten Abschnitt: So sieht der Vorgang beim
    // naechsten Oeffnen des Links aus, nachdem der Widerruf gespeichert
    // wurde. Genau hier stand vorher die auferstandene Zeile.
    await zeige(
      schritt4({ kostenstelle: null, kostenstelleAnteil: null, kostenstellen: [] }),
    );

    expect(zeilenFelder()).toHaveLength(0);
  });
});
