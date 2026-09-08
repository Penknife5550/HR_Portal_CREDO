/**
 * @jest-environment jsdom
 */

/**
 * Die Schrittleiste des Personalfragebogens — Springen in BEIDE Richtungen.
 *
 * Anlass ist eine Beobachtung aus dem Betrieb (09/2026): "Wenn man in der
 * Leiste ganz oben in einen der vorherigen Reiter springt, dann kann man nicht
 * in den zurueck, von dem man kommt, sondern muss auf jeder Seite runter
 * scrollen und den Weiter-Button klicken." Die Leiste liess bis dahin nur
 * `index < currentStep` zu — der Rueckweg war offen, der Hinweg gesperrt.
 *
 * Die vier Zusagen, die nur an der gerenderten Leiste zu belegen sind:
 *
 *  1. **Beide Richtungen.** Wer von Schritt 3 auf 1 zuruecksprang, kommt ueber
 *     die Leiste auch wieder auf 3.
 *  2. **Nie gesehen bleibt zu.** Ein Schritt jenseits der weitesten erreichten
 *     Position bleibt gesperrt — sonst uebergeht man Pflichtangaben und
 *     erfaehrt davon erst beim Absenden, wo der Server alles prueft.
 *  3. **Kein stiller Verlust.** Ein Sprung speichert nicht. Stehen in der
 *     Maske ungespeicherte Eingaben, wird gefragt, bevor sie verschwinden.
 *  4. **Keine Rueckfrage ohne Grund.** Wer nichts angefasst hat, springt ohne
 *     Dialog — sonst waere die Muehsal nur durch eine andere ersetzt.
 *
 * Umgebung wie in den uebrigen Komponententests: jsdom im Docblock
 * (jest.config.ts bleibt global auf "node"), JSX aus der einen
 * transform-Regel, ohne @testing-library/jest-dom.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { FragebogenForm } from "@/app/fragebogen/[token]/fragebogen-form";
import type { StepFieldConfig } from "@/lib/field-definitions";

// React 19 verlangt diese Marke, bevor act() Zustandsaenderungen einsammeln darf.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Eine kurze Strecke: Persoenliches, Adresse, Bank — dazu die Zusammenfassung,
 * die als Pflichtschritt immer dabei ist. Vier Schritte reichen, um Hin- und
 * Rueckweg zu zeigen, und die Masken dazwischen laden nichts nach.
 */
const STEPS_CONFIG: StepFieldConfig[] = [
  { step: 1, title: "Persönliche Angaben", enabled: true },
  { step: 2, title: "Adresse & Kontakt", enabled: true },
  { step: 3, title: "Bankverbindung", enabled: true },
];

/**
 * `currentStep` in den Personaldaten ist die **Registry-Nummer**, nicht die
 * Anzeigeposition: 2 = Adresse (Position 2 von 4), 3 = Bank (Position 3).
 */
function machDaten(personalData: Record<string, unknown> | null) {
  return {
    onboardingId: "8f3a1c2e-0000-0000-0000-000000000000",
    email: "max@example.org",
    organization: {
      name: "FES Minden",
      mandantNumber: "100",
      type: "SCHULE",
    },
    questionnaireType: "MINIJOB",
    status: "IN_PROGRESS",
    stepsConfig: STEPS_CONFIG,
    requiredDocuments: null,
    personalData,
  };
}

/** Eine vollstaendig ausgefuellte Adresse — sonst kaeme "Weiter" nicht durch. */
const ADRESSE_VOLLSTAENDIG = {
  currentStep: 2,
  street: "Musterweg",
  houseNumber: "1",
  zipCode: "32423",
  city: "Minden",
};

let fetchMock: jest.Mock;

beforeEach(() => {
  // Ohne Zeitgeber liefe der 2-Sekunden-Timer aus `saveStepData` ("Gespeichert"
  // wieder ausblenden) nach dem Testende weiter.
  jest.useFakeTimers();
  fetchMock = jest.fn(async () => ({ ok: true, json: async () => ({}) }) as unknown as Response);
  global.fetch = fetchMock as unknown as typeof fetch;
  // jsdom kennt window.scrollTo nicht und schriebe bei jedem Wechsel eine
  // "Not implemented"-Meldung in die Konsole.
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

/**
 * Ein Knopf der Leiste. Gesucht wird ueber `title`: Der sichtbare Text steht
 * erst ab Bildschirmbreite `lg` da, und der Zugangsname bestuende sonst aus
 * Nummer und Titel in einem Stueck.
 */
const leiste = (nr: number, titel: string) =>
  screen.getByTitle(`Schritt ${nr}: ${titel}`) as HTMLButtonElement;

const dialog = () => screen.queryByRole("dialog");

function zeige(personalData: Record<string, unknown> | null) {
  return render(<FragebogenForm token="tok-1234567890" initialData={machDaten(personalData)} />);
}

// =============================================
// 1. Beide Richtungen
// =============================================

describe("Schrittleiste: erreichte Schritte sind in beide Richtungen anklickbar", () => {
  it("springt zurueck und wieder vor, ohne den Weg dazwischen zu klicken", async () => {
    // Der Vorgang steigt auf der Bankverbindung wieder ein (Registry-Nummer 3,
    // Position 3) — davor liegen zwei bereits durchlaufene Schritte.
    zeige({ currentStep: 3 });
    expect(stepTitel()).toBe("Bankverbindung");

    await act(async () => {
      fireEvent.click(leiste(1, "Persönliche Angaben"));
    });
    expect(stepTitel()).toBe("Persönliche Angaben");

    // Der eigentliche Befund: Vorher war dieser Knopf `disabled`, und der
    // einzige Weg zurueck nach vorn fuehrte ueber "Weiter" auf jeder Seite.
    expect(leiste(3, "Bankverbindung").disabled).toBe(false);
    await act(async () => {
      fireEvent.click(leiste(3, "Bankverbindung"));
    });
    expect(stepTitel()).toBe("Bankverbindung");

    // Ein Sprung ist kein Speichervorgang — er darf nichts an den Server
    // schicken, schon gar nicht am Zod-Schema des Schritts vorbei.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("nimmt den mit Weiter neu erreichten Schritt in die Leiste auf", async () => {
    zeige(ADRESSE_VOLLSTAENDIG);
    expect(stepTitel()).toBe("Adresse & Kontakt");
    // Noch nie gesehen, also zu.
    expect(screen.getByTitle(/Bankverbindung/).hasAttribute("disabled")).toBe(true);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Weiter" }));
    });
    expect(stepTitel()).toBe("Bankverbindung");
    // Gespeichert wird die Registry-Nummer des FOLGENDEN Schritts.
    expect(JSON.parse(String(fetchMock.mock.calls[0][1].body)).currentStep).toBe(3);

    // Und jetzt traegt die Leiste den Schritt: hin und zurueck, ohne "Weiter".
    await act(async () => {
      fireEvent.click(leiste(2, "Adresse & Kontakt"));
    });
    expect(stepTitel()).toBe("Adresse & Kontakt");
    await act(async () => {
      fireEvent.click(leiste(3, "Bankverbindung"));
    });
    expect(stepTitel()).toBe("Bankverbindung");
  });

  it("laesst einen fehlgeschlagenen Speicherversuch die Leiste NICHT aufschliessen", async () => {
    // Sonst stuende der naechste Schritt offen, obwohl die Angaben des
    // aktuellen es nie auf den Server geschafft haben.
    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "Validierungsfehler" }),
    } as unknown as Response);
    zeige(ADRESSE_VOLLSTAENDIG);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Weiter" }));
    });

    expect(stepTitel()).toBe("Adresse & Kontakt");
    expect(screen.getByTitle(/Bankverbindung/).hasAttribute("disabled")).toBe(true);
  });
});

// =============================================
// 2. Nie gesehen bleibt zu
// =============================================

describe("Schrittleiste: ungesehene Schritte bleiben gesperrt", () => {
  it("sperrt die Zusammenfassung, solange die Strecke nicht dort war", async () => {
    zeige({ currentStep: 3 });

    const zusammenfassung = screen.getByTitle(/Zusammenfassung/) as HTMLButtonElement;
    expect(zusammenfassung.disabled).toBe(true);
    expect(zusammenfassung.title).toContain("noch nicht erreicht");

    await act(async () => {
      fireEvent.click(zusammenfassung);
    });
    // Ein gesperrter Knopf feuert in jsdom ohnehin nicht; die Zusicherung gilt
    // dem Ergebnis: Pflichtangaben lassen sich nicht ueberspringen.
    expect(stepTitel()).toBe("Bankverbindung");
  });
});

// =============================================
// 3. und 4. Ungespeicherte Eingaben
// =============================================

describe("Schrittleiste: kein stiller Verlust von Eingaben", () => {
  /** Die IBAN eintippen — die Bankmaske ist der Einstiegsschritt dieser Tests. */
  function tippeIban(wert = "DE02120300000000202051") {
    const feld = document.querySelector('input[name="iban"]') as HTMLInputElement;
    expect(feld).not.toBeNull();
    fireEvent.change(feld, { target: { value: wert } });
    return feld;
  }

  it("springt ohne Rueckfrage, wenn nichts geaendert wurde", async () => {
    zeige({ currentStep: 3 });

    await act(async () => {
      fireEvent.click(leiste(1, "Persönliche Angaben"));
    });

    expect(dialog()).toBeNull();
    expect(stepTitel()).toBe("Persönliche Angaben");
  });

  it("fragt vor dem Sprung, wenn in der Maske etwas Ungespeichertes steht", async () => {
    zeige({ currentStep: 3 });
    await act(async () => {
      tippeIban();
    });

    await act(async () => {
      fireEvent.click(leiste(1, "Persönliche Angaben"));
    });

    expect(dialog()).not.toBeNull();
    // Entscheidend: Der Wechsel hat NICHT stattgefunden — die Eingabe steht
    // noch da, solange die Person nicht zugestimmt hat.
    expect(stepTitel()).toBe("Bankverbindung");
    expect((document.querySelector('input[name="iban"]') as HTMLInputElement).value).not.toBe("");
  });

  it("bleibt auf Wunsch stehen und behaelt die Eingabe", async () => {
    zeige({ currentStep: 3 });
    await act(async () => {
      tippeIban();
    });
    await act(async () => {
      fireEvent.click(leiste(1, "Persönliche Angaben"));
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Hier bleiben" }));
    });

    expect(dialog()).toBeNull();
    expect(stepTitel()).toBe("Bankverbindung");
    expect((document.querySelector('input[name="iban"]') as HTMLInputElement).value).not.toBe("");
  });

  it("wechselt erst nach ausdruecklicher Zustimmung — und speichert dabei nichts", async () => {
    zeige({ currentStep: 3 });
    await act(async () => {
      tippeIban();
    });
    await act(async () => {
      fireEvent.click(leiste(1, "Persönliche Angaben"));
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Ohne Speichern wechseln" }));
    });

    expect(dialog()).toBeNull();
    expect(stepTitel()).toBe("Persönliche Angaben");
    // Der Dialog verspricht "ohne Speichern" — er darf die ungeprueften Werte
    // nicht doch noch heimlich an den Server schicken.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("erkennt auch eine gesetzte Auswahl, nicht nur getippten Text", async () => {
    // Bei Radioknoepfen und Haken steht die Antwort in `checked`; ihr `value`
    // ist der feste Wert der Option und aendert sich nie. Wer nur die Werte
    // vergliche, liesse eine geaenderte Anrede stillschweigend verschwinden.
    zeige({ currentStep: 3 });
    await act(async () => {
      fireEvent.click(leiste(1, "Persönliche Angaben"));
    });
    expect(stepTitel()).toBe("Persönliche Angaben");

    const anrede = document.querySelectorAll('input[name="salutation"]');
    expect(anrede.length).toBe(2);
    await act(async () => {
      fireEvent.click(anrede[1]);
    });

    await act(async () => {
      fireEvent.click(leiste(3, "Bankverbindung"));
    });
    expect(dialog()).not.toBeNull();
    expect(stepTitel()).toBe("Persönliche Angaben");
  });

  it("stellt dieselbe Frage beim Zurueck-Knopf des Schritts", async () => {
    // Die Leiste warnt, der Knopf daneben nicht — das waere niemandem zu
    // erklaeren. Beide gehen deshalb denselben Weg.
    zeige({ currentStep: 3 });
    await act(async () => {
      tippeIban();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Zurück" }));
    });

    expect(dialog()).not.toBeNull();
    expect(stepTitel()).toBe("Bankverbindung");
  });
});
