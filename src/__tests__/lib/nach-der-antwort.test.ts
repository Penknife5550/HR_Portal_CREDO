/**
 * Tests: nachDerAntwort (src/lib/nach-der-antwort.ts)
 *
 * Die Huelle um `after()` aus next/server hat zwei Zusagen:
 *   - Im Request-Scope reicht sie die Aufgabe an `after()` weiter und fuehrt
 *     sie NICHT selbst aus — die Antwort wartet nicht.
 *   - Ausserhalb (Tests, Aufrufe ohne Route) wirft `after()`; dann laeuft die
 *     Aufgabe trotzdem, statt verloren zu gehen.
 * In beiden Faellen wird ein Fehler der Aufgabe nur geloggt — mit Praefix und
 * Fehlercode, nie mit der Meldung.
 */

const mockAfter = jest.fn();

jest.mock("next/server", () => ({
  ...jest.requireActual("next/server"),
  after: (aufgabe: () => unknown) => mockAfter(aufgabe),
}));

import { nachDerAntwort } from "@/lib/nach-der-antwort";

const echtesAfter = jest.requireActual<typeof import("next/server")>("next/server").after;

/** Laesst alle anstehenden Promise-Ketten laufen. */
const abwarten = () => new Promise((fertig) => setImmediate(fertig));

let log: jest.SpyInstance;

beforeEach(() => {
  mockAfter.mockReset();
  log = jest.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  log.mockRestore();
});

describe("nachDerAntwort", () => {
  it("im Request-Scope: reicht die Aufgabe an after() und fuehrt sie nicht selbst aus", async () => {
    const aufgabe = jest.fn(async () => "fertig");
    nachDerAntwort(aufgabe);
    await abwarten();

    expect(mockAfter).toHaveBeenCalledTimes(1);
    expect(aufgabe).not.toHaveBeenCalled();

    // Next.js ruft den Rueckruf nach der Antwort auf.
    await mockAfter.mock.calls[0][0]();
    expect(aufgabe).toHaveBeenCalledTimes(1);
  });

  it("ausserhalb eines Request-Scopes wirft after() — die Aufgabe laeuft trotzdem", async () => {
    mockAfter.mockImplementation(echtesAfter);
    expect(() => echtesAfter(async () => undefined)).toThrow(/outside a request scope/);

    const aufgabe = jest.fn(async () => undefined);
    expect(() => nachDerAntwort(aufgabe)).not.toThrow();
    await abwarten();
    expect(aufgabe).toHaveBeenCalledTimes(1);
  });

  it("ein Fehler der Aufgabe wird nur geloggt: Praefix und Fehlercode, nie die Meldung", async () => {
    mockAfter.mockImplementation(() => {
      throw new Error("`after` was called outside a request scope");
    });
    const geheim = Object.assign(new Error("550 <anna.privat@example.org> abgelehnt"), { code: "EENVELOPE" });
    nachDerAntwort(async () => {
      throw geheim;
    }, "Unterlagen: HR-Meldung");
    await abwarten();

    expect(log).toHaveBeenCalledWith("[Unterlagen: HR-Meldung] fehlgeschlagen:", "EENVELOPE");
    expect(JSON.stringify(log.mock.calls)).not.toContain("anna.privat");
  });

  it("auch im Request-Scope faengt der Rueckruf den Fehler selbst (kein unbehandeltes Promise)", async () => {
    nachDerAntwort(async () => {
      throw new TypeError("kaputt");
    });
    await expect(mockAfter.mock.calls[0][0]()).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledWith("[Nach der Antwort] fehlgeschlagen:", "TypeError");
  });

  it("eine Aufgabe, die synchron wirft, bringt den Aufrufer nicht zu Fall", async () => {
    mockAfter.mockImplementation(echtesAfter);
    const aufgabe = (() => {
      throw new RangeError("sofort");
    }) as unknown as () => Promise<unknown>;
    expect(() => nachDerAntwort(aufgabe)).not.toThrow();
    await abwarten();
    expect(log).toHaveBeenCalledWith("[Nach der Antwort] fehlgeschlagen:", "RangeError");
  });
});
