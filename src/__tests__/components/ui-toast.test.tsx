/**
 * @jest-environment jsdom
 */

/**
 * Toast (UX-Umbau „Klarer Weg", U0): die Regeln aus dem Kopfkommentar von
 * `ui/toast.tsx` — Fehler bleiben stehen, Erfolg geht nach 5 Sekunden, mit
 * „Rückgängig" nach 10; kein Text, keine Meldung; Doppelte ersetzen sich.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import {
  TOAST_DAUER_MIT_AKTION,
  TOAST_HOECHSTZAHL,
  TOAST_TOENE,
  ToastAnbieter,
  toast,
} from "@/components/ui/toast";
import { axeVerstoesse } from "../hilfen/axe";

function meldungen() {
  return Array.from(document.querySelectorAll<HTMLElement>("li[data-ton]"));
}

function warten(ms: number) {
  act(() => {
    jest.advanceTimersByTime(ms);
  });
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  act(() => toast.alleSchliessen());
  jest.useRealTimers();
});

describe("Toast: Standzeit", () => {
  it("Erfolg verschwindet nach 5 Sekunden", () => {
    render(<ToastAnbieter />);
    act(() => void toast.ok("Änderung gespeichert."));
    expect(screen.getByText("Änderung gespeichert.")).toBeTruthy();
    warten(4900);
    expect(meldungen()).toHaveLength(1);
    warten(200);
    expect(meldungen()).toHaveLength(0);
  });

  it("ein Fehler bleibt stehen, bis ihn jemand schliesst", () => {
    render(<ToastAnbieter />);
    act(() => void toast.fehler("Speichern fehlgeschlagen."));
    warten(10 * 60 * 1000);
    expect(meldungen()).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Meldung schließen" }));
    expect(meldungen()).toHaveLength(0);
  });

  it("mit Rückgängig bleibt der Erfolg 10 Sekunden", () => {
    render(<ToastAnbieter />);
    act(() => void toast.ok("Aufgabe erledigt.", { rueckgaengig: () => {} }));
    warten(TOAST_TOENE.ok.dauer! + 100);
    expect(meldungen()).toHaveLength(1);
    warten(TOAST_DAUER_MIT_AKTION);
    expect(meldungen()).toHaveLength(0);
  });
});

describe("Toast: Sitzung und offener Dialog", () => {
  it("beim Aushaengen des Anbieters (Abmelden) verschwinden alle Meldungen – auch Fehler", () => {
    // Befund der Durchsicht: Der Speicher ueberlebte das Abmelden, eine
    // Fehlermeldung stand danach fuer die naechste Person da.
    const erster = render(<ToastAnbieter />);
    act(() => void toast.fehler("Unterlage von Maria Voth konnte nicht gespeichert werden."));
    expect(meldungen()).toHaveLength(1);
    erster.unmount();
    render(<ToastAnbieter />);
    expect(meldungen()).toHaveLength(0);
  });

  it("solange ein Dialog offen ist, haelt die Zeit an; danach laeuft sie weiter", async () => {
    // Befund der Durchsicht: Der Fokusfang des Dialogs laesst die Tastatur
    // nicht an die Meldung — „Rückgängig" lief ab, ohne erreichbar zu sein.
    jest.useRealTimers();
    render(<ToastAnbieter />);
    const pause = jest.fn();
    const weiter = jest.fn();
    const bereich = document.querySelector("ol")!;
    bereich.addEventListener("toast.viewportPause", pause);
    bereich.addEventListener("toast.viewportResume", weiter);
    const warteAuf = async (f: jest.Mock) => {
      for (let i = 0; i < 50 && f.mock.calls.length === 0; i++) await act(async () => void (await new Promise((r) => setTimeout(r, 10))));
    };

    // So sperrt Radix das Rollen, waehrend ein Dialog offen ist.
    act(() => document.body.setAttribute("data-scroll-locked", "1"));
    await warteAuf(pause);
    expect(pause).toHaveBeenCalledTimes(1);
    expect(weiter).not.toHaveBeenCalled();

    act(() => document.body.removeAttribute("data-scroll-locked"));
    await warteAuf(weiter);
    expect(weiter).toHaveBeenCalledTimes(1);
  });
});

describe("Toast: Inhalt", () => {
  it("Rückgängig ruft die Funktion und schliesst die Meldung", () => {
    const zurueck = jest.fn();
    render(<ToastAnbieter />);
    act(() => void toast.ok("Aufgabe erledigt.", { rueckgaengig: zurueck }));
    fireEvent.click(screen.getByRole("button", { name: "Rückgängig" }));
    expect(zurueck).toHaveBeenCalledTimes(1);
    expect(meldungen()).toHaveLength(0);
  });

  it("Rückgängig bekommt kein Klick-Ereignis als Argument", () => {
    // Befund der Durchsicht: `onClick={rueckgaengig}` reichte das MouseEvent
    // durch — eine Funktion mit Vorgabewert bekam es als ersten Parameter.
    const argumente: unknown[][] = [];
    render(<ToastAnbieter />);
    act(() => void toast.ok("Aufgabe erledigt.", { rueckgaengig: (...a: unknown[]) => void argumente.push(a) }));
    fireEvent.click(screen.getByRole("button", { name: "Rückgängig" }));
    expect(argumente).toEqual([[]]);
  });

  it("ohne Text entsteht keine Meldung", () => {
    render(<ToastAnbieter />);
    let id: number | null = 0;
    act(() => {
      id = toast.ok("   ");
    });
    expect(id).toBeNull();
    expect(meldungen()).toHaveLength(0);
  });

  it("ein Fehler sagt Screenreadern „Fehler:“ vorweg; Symbole sind verborgen", () => {
    render(<ToastAnbieter />);
    act(() => {
      toast.fehler("Speichern fehlgeschlagen.");
      toast.ok("Gespeichert.");
    });
    const [fehler, ok] = meldungen();
    expect(fehler.getAttribute("data-ton")).toBe("fehler");
    expect(fehler.textContent).toContain("Fehler: Speichern fehlgeschlagen.");
    expect(ok.textContent).not.toContain("Fehler:");
    for (const m of [fehler, ok]) {
      for (const svg of Array.from(m.querySelectorAll("svg"))) expect(svg.getAttribute("aria-hidden")).toBe("true");
    }
  });

  it("dieselbe Meldung zweimal ersetzt die erste; eine andere kommt dazu", () => {
    render(<ToastAnbieter />);
    act(() => {
      toast.fehler("Speichern fehlgeschlagen.");
      toast.fehler("Speichern fehlgeschlagen.");
      toast.ok("Speichern fehlgeschlagen.");
    });
    expect(meldungen().map((m) => m.getAttribute("data-ton"))).toEqual(["fehler", "ok"]);
  });

  it("hoechstens vier Meldungen zugleich – die aelteste weicht", () => {
    render(<ToastAnbieter />);
    act(() => {
      for (let i = 1; i <= TOAST_HOECHSTZAHL + 2; i++) toast.fehler(`Fehler ${i}`);
    });
    expect(meldungen()).toHaveLength(TOAST_HOECHSTZAHL);
    expect(screen.queryByText("Fehler 1")).toBeNull();
    expect(screen.getByText(`Fehler ${TOAST_HOECHSTZAHL + 2}`)).toBeTruthy();
  });

  it("eine Meldung von vor dem Einhaengen des Anbieters erscheint trotzdem", () => {
    act(() => void toast.fehler("Früh gemeldet."));
    render(<ToastAnbieter />);
    expect(screen.getByText("Früh gemeldet.")).toBeTruthy();
  });

  it("axe findet nichts", async () => {
    jest.useRealTimers();
    render(
      <main>
        <h1>Seite</h1>
        <ToastAnbieter />
      </main>,
    );
    act(() => {
      toast.fehler("Speichern fehlgeschlagen.");
      toast.ok("Aufgabe erledigt.", { rueckgaengig: () => {} });
      toast.hinweis("Liste aktualisiert.");
    });
    expect(await axeVerstoesse(document.body)).toEqual([]);
  });
});
