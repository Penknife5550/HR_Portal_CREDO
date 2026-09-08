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
 * Strecke fuer die Tabellen-Faelle: Persoenliches, Sozialversicherung (dort
 * liegt die Kinder-Erfassung) und die Zusammenfassung. Damit ist Schritt 1 ein
 * erreichtes Sprungziel, ohne dass Adresse und Bank dazwischen liegen.
 */
const STEPS_MIT_SOZIAL: StepFieldConfig[] = [
  { step: 1, title: "Persönliche Angaben", enabled: true },
  { step: 4, title: "Sozialversicherung", enabled: true },
];

/**
 * `currentStep` in den Personaldaten ist die **Registry-Nummer**, nicht die
 * Anzeigeposition: 2 = Adresse (Position 2 von 4), 3 = Bank (Position 3).
 */
function machDaten(
  personalData: Record<string, unknown> | null,
  stepsConfig: StepFieldConfig[] = STEPS_CONFIG,
  requiredDocuments: string[] | null = null
) {
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
    stepsConfig,
    requiredDocuments,
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

function zeige(
  personalData: Record<string, unknown> | null,
  stepsConfig?: StepFieldConfig[],
  requiredDocuments?: string[]
) {
  return render(
    <FragebogenForm
      token="tok-1234567890"
      initialData={machDaten(personalData, stepsConfig, requiredDocuments ?? null)}
    />
  );
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

// =============================================
// 5. Eingaben, die kein `name`-Attribut haben
// =============================================

/**
 * Der Kern des Befunds aus der Durchsicht vom 07.09.2026: Die Rueckfrage las
 * `input[name], select[name], textarea[name]` — und uebersah damit ausgerechnet
 * die Eingaben, deren Verlust am meisten kostet.
 *
 * Zwei Bauarten fallen aus dem alten Muster heraus:
 *
 *  - **Ja/Nein-Schaltflaechen** (`<button role="radio">`, Wert per `setValue`).
 *    Sie sind Knoepfe, keine Eingabefelder, und tragen deshalb keinen Namen.
 *  - **Zeilentabellen** (Kinder in Schritt 4, die drei Tabellen in Schritt 6).
 *    Ihr Zustand liegt in `useState`, ihre Felder sind namenlos.
 *
 * Beide Faelle sind hier belegt. Mit der alten Fassung von `leseEingaben` waere
 * der Vergleichstext in allen drei Zusicherungen unveraendert geblieben — der
 * Sprung haette also ohne Dialog stattgefunden und die Eingabe verworfen.
 */
describe("Schrittleiste: erkennt auch Eingaben ohne name-Attribut", () => {
  it("fragt vor dem Sprung, wenn eine Ja/Nein-Frage beantwortet wurde", async () => {
    zeige({ currentStep: 3 });
    await act(async () => {
      fireEvent.click(leiste(1, "Persönliche Angaben"));
    });
    expect(stepTitel()).toBe("Persönliche Angaben");

    // "Brauchen Sie einen Aufenthaltstitel?" — das "Nein" ist die folgenreichste
    // Antwort des Schritts: Es laesst Aufenthaltstitel UND Arbeitserlaubnis aus
    // den Pflichtdokumenten fallen.
    const nein = screen.getByRole("radio", { name: "Nein" });
    // Der Grund, warum die alte Erkennung hier blind war — festgehalten, damit
    // niemand den Knopf spaeter "aufraeumt" und den Befund zurueckholt.
    expect(nein.hasAttribute("name")).toBe(false);

    await act(async () => {
      fireEvent.click(nein);
    });
    expect(nein.getAttribute("aria-checked")).toBe("true");

    await act(async () => {
      fireEvent.click(leiste(3, "Bankverbindung"));
    });

    expect(dialog()).not.toBeNull();
    expect(stepTitel()).toBe("Persönliche Angaben");
    // Und die Antwort steht noch da, solange niemand zugestimmt hat.
    expect(
      screen.getByRole("radio", { name: "Nein" }).getAttribute("aria-checked")
    ).toBe("true");
  });

  it("fragt vor dem Sprung, wenn eine Kinderzeile eingetragen wurde", async () => {
    await act(async () => {
      // `parentStatus` schaltet die Kinder-Erfassung frei; ohne den Haken gibt
      // es die Tabelle gar nicht.
      zeige({ currentStep: 4, parentStatus: true }, STEPS_MIT_SOZIAL);
    });
    expect(stepTitel()).toBe("Sozialversicherung");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "+ Kind hinzufuegen" }));
    });

    // Vorname und Nachname der Zeile — beide ohne `name`, weil sie an
    // `useState` haengen und nicht an react-hook-form.
    const zeilenfelder = document.querySelectorAll<HTMLInputElement>(
      'input[type="text"]:not([name])'
    );
    expect(zeilenfelder.length).toBe(2);

    await act(async () => {
      fireEvent.change(zeilenfelder[0], { target: { value: "Mia" } });
    });

    await act(async () => {
      fireEvent.click(leiste(1, "Persönliche Angaben"));
    });

    expect(dialog()).not.toBeNull();
    expect(stepTitel()).toBe("Sozialversicherung");
    expect(
      (document.querySelector('input[type="text"]:not([name])') as HTMLInputElement).value
    ).toBe("Mia");
  });

  it("fragt auch, wenn eine bestehende Kinderzeile entfernt wurde", async () => {
    // Die Gegenrichtung: Nicht nur neu Eingetragenes geht beim Sprung verloren,
    // sondern auch das Entfernen einer Zeile — die Zeile waere beim naechsten
    // Zeichnen wieder da, und niemand haette es gemerkt.
    await act(async () => {
      zeige(
        {
          currentStep: 4,
          parentStatus: true,
          children: [
            { firstName: "Mia", lastName: "Muster", birthDate: "2019-04-01", taxAllowance: false },
          ],
        },
        STEPS_MIT_SOZIAL
      );
    });
    expect(document.querySelectorAll('input[type="text"]:not([name])').length).toBe(2);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Entfernen" }));
    });
    expect(document.querySelectorAll('input[type="text"]:not([name])').length).toBe(0);

    await act(async () => {
      fireEvent.click(leiste(1, "Persönliche Angaben"));
    });

    expect(dialog()).not.toBeNull();
    expect(stepTitel()).toBe("Sozialversicherung");
  });

  it("fragt NICHT, wenn nur geklickt und nichts geaendert wurde", async () => {
    // Die Gegenprobe zur Erweiterung: Erkannt wird der geaenderte Stand, nicht
    // die blosse Beruehrung. Sonst haette jeder Klick in ein Feld eine
    // Rueckfrage erzeugt, und wer Fehlalarme gewohnt ist, klickt auch den
    // echten weg.
    //
    // Die Bankmaske ist dafuer der einfache Fall: Sie laedt nichts nach, ein
    // Klick allein aendert hier also gar nichts am DOM. Der schwierige Fall —
    // ein Klick, nach dem sich die Feldmenge von selbst aendert — steht in
    // Abschnitt 6 an der Zusammenfassung.
    zeige({ currentStep: 3 });

    const feld = document.querySelector('input[name="iban"]') as HTMLInputElement;
    await act(async () => {
      fireEvent.click(feld);
      fireEvent.focus(feld);
    });

    await act(async () => {
      fireEvent.click(leiste(1, "Persönliche Angaben"));
    });

    expect(dialog()).toBeNull();
    expect(stepTitel()).toBe("Persönliche Angaben");
  });
});

// =============================================
// 6. Die Zusammenfassung — dort, wo sich die Maske selbst umbaut
// =============================================

/**
 * Der Befund aus der Nachpruefung vom 08.09.2026.
 *
 * Der Merker `beruehrtRef` friert den Ausgangsstand mit der ERSTEN Beruehrung
 * ein, und als Beruehrung zaehlt schon ein Klick. Auf der Zusammenfassung ist
 * der Klick auf „Hochladen" genau so ein Klick — und unmittelbar danach baut
 * die Upload-Karte sich um: Das Feld „Gültig bis" der hochgeladenen Unterlage
 * verschwindet, weil es nur vor dem Upload steht. Der Vergleich sah damit eine
 * andere Feldmenge als beim Einfrieren und meldete ungespeicherte Eingaben —
 * ausgerechnet in dem Moment, in dem die Datei nachweislich auf dem Server
 * liegt und gar nichts verloren gehen kann.
 *
 * Behoben wird das nicht am Merker, sondern an der Quelle: Der Dateibereich
 * traegt seit dieser Aenderung das Merkmal `data-dateibereich` und faellt aus
 * `leseEingaben` heraus. Keines seiner Felder haengt am „Weiter" — Datei,
 * Ablaufdatum und Nachtrag speichern sich ueber eigene Knoepfe sofort selbst.
 *
 * Die Gegenrichtung steht direkt daneben: Was auf DERSELBEN Seite wirklich erst
 * mit dem Absenden gespeichert wird (der Ort der Erklaerung), muss die
 * Rueckfrage weiterhin ausloesen — auch nach einem Upload.
 */
describe("Schrittleiste: die Zusammenfassung laedt nach, ohne Alarm zu schlagen", () => {
  /**
   * Ein `fetch`, das den ECHTEN Ablauf nachstellt: erst leerer Bestand, nach
   * dem POST der Bestand mit der neuen Unterlage. Ein von Hand gesetzter
   * Zustand bewiese hier nichts — die Feldmenge aendert sich ja gerade WEIL
   * `loadDocuments()` nach dem Upload noch einmal laeuft.
   */
  function dokumentenDienst(nachUpload: string[]) {
    let hochgeladen = false;
    return jest.fn(async (_url: unknown, init?: { method?: string }) => {
      if (init?.method === "POST") {
        hochgeladen = true;
        return { ok: true, json: async () => ({ ok: true }) };
      }
      return {
        ok: true,
        json: async () => ({
          documents: hochgeladen
            ? nachUpload.map((typ, i) => ({
                id: `doc${i}`,
                fileName: `${typ.toLowerCase()}.pdf`,
                fileSize: 1024,
                type: typ,
                // Mit Datum, wie es der Server nach diesem Upload
                // zurueckliefert: Ohne eines traete an die Stelle des
                // verschwundenen Fristfeldes sofort das Nachtragsfeld, und die
                // Feldmenge saehe zufaellig unveraendert aus.
                gueltigBis: "2028-01-31",
                uploadedAt: "2026-09-08T10:00:00.000Z",
              }))
            : [],
        }),
      };
    }) as unknown as jest.Mock;
  }

  /**
   * Die Zusammenfassung als Einstiegsschritt (Registry-Nummer 10, Position 4).
   *
   * `aufenthaltstitelErforderlich` ist der Schalter, der die beiden
   * fristpflichtigen Pflichten erzeugt — und nur die tragen ueberhaupt ein
   * Feld „Gültig bis", das nach dem Upload wieder verschwindet.
   */
  async function zeigeZusammenfassung() {
    await act(async () => {
      zeige(
        { currentStep: 10, aufenthaltstitelErforderlich: true },
        STEPS_CONFIG,
        ["GEBURTSURKUNDE_EIGEN"]
      );
    });
    expect(stepTitel()).toBe("Zusammenfassung");
  }

  /** Alle Eingabefelder der Maske — das Mass, das der Vergleich sieht. */
  const feldzahl = () =>
    document.querySelectorAll("input, select, textarea").length;

  /**
   * Der vollstaendige Upload-Ablauf am Aufenthaltstitel, so wie ihn die Karte
   * vorgibt: erst das Ablaufdatum eintragen (es wird mit der Datei zusammen
   * gespeichert), dann „Hochladen", dann die Datei waehlen — POST, Nachladen.
   *
   * Reihenfolge der Pflichtzeilen: Geburtsurkunde, Aufenthaltstitel,
   * Arbeitserlaubnis — Position 1 ist also der Titel mit dem Fristfeld.
   */
  async function ladeAufenthaltstitelHoch() {
    const frist = document.getElementById(
      "frist-aufenthaltstitel"
    ) as HTMLInputElement;
    expect(frist).not.toBeNull();
    await act(async () => {
      fireEvent.change(frist, { target: { value: "2028-01-31" } });
    });

    const knoepfe = screen.getAllByRole("button", { name: "Hochladen" });
    const dateifelder = document.querySelectorAll<HTMLInputElement>(
      'input[type="file"]'
    );
    await act(async () => {
      fireEvent.click(knoepfe[1]);
    });
    await act(async () => {
      fireEvent.change(dateifelder[1], {
        target: {
          files: [new File(["x"], "titel.pdf", { type: "application/pdf" })],
        },
      });
    });
    // Der zweite Durchlauf raeumt die Kette POST -> loadDocuments -> setState ab.
    await act(async () => {});
  }

  it("fragt NICHT nach einem Upload — die Datei liegt auf dem Server", async () => {
    global.fetch = dokumentenDienst(["AUFENTHALTSTITEL"]) as unknown as typeof fetch;
    await zeigeZusammenfassung();

    const vorher = feldzahl();
    await ladeAufenthaltstitelHoch();
    // Die Ursache, festgehalten: Die Maske hat sich von selbst umgebaut. Faellt
    // das eines Tages weg, ist dieser Test kein Beleg mehr — dann muss er
    // scheitern und nicht stillschweigend gruen bleiben.
    expect(feldzahl()).toBeLessThan(vorher);

    await act(async () => {
      fireEvent.click(leiste(1, "Persönliche Angaben"));
    });

    expect(dialog()).toBeNull();
    expect(stepTitel()).toBe("Persönliche Angaben");
  });

  it("fragt weiterhin, wenn der Ort der Erklaerung eingetragen wurde", async () => {
    // Die Gegenrichtung. Der Ort gehoert zum Unterschriftsersatz und wird erst
    // mit dem Absenden gespeichert — er geht beim Sprung wirklich verloren.
    global.fetch = dokumentenDienst([]) as unknown as typeof fetch;
    await zeigeZusammenfassung();

    const ort = document.getElementById("erklaerungOrt") as HTMLInputElement;
    expect(ort).not.toBeNull();
    await act(async () => {
      fireEvent.change(ort, { target: { value: "Minden" } });
    });

    await act(async () => {
      fireEvent.click(leiste(1, "Persönliche Angaben"));
    });

    expect(dialog()).not.toBeNull();
    expect(stepTitel()).toBe("Zusammenfassung");
    expect(
      (document.getElementById("erklaerungOrt") as HTMLInputElement).value
    ).toBe("Minden");
  });

  it("vergisst eine echte Eingabe nicht, nur weil danach hochgeladen wurde", async () => {
    // Der gefaehrlichste Fall: Wer den Ausgangsstand nach jedem Upload neu
    // einfroeren wuerde, saehe die vorher eingetippte Angabe danach als
    // „unveraendert" an — und liesse sie beim Sprung stillschweigend fallen.
    global.fetch = dokumentenDienst(["AUFENTHALTSTITEL"]) as unknown as typeof fetch;
    await zeigeZusammenfassung();

    await act(async () => {
      fireEvent.change(document.getElementById("erklaerungOrt") as HTMLInputElement, {
        target: { value: "Minden" },
      });
    });
    await ladeAufenthaltstitelHoch();

    await act(async () => {
      fireEvent.click(leiste(1, "Persönliche Angaben"));
    });

    expect(dialog()).not.toBeNull();
    expect(stepTitel()).toBe("Zusammenfassung");
  });
});
