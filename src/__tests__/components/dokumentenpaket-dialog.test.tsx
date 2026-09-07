/**
 * @jest-environment jsdom
 */

/**
 * Der erste Komponententest des Projekts — Versand-Dialog des Dokumentenpakets.
 *
 * Warum ausgerechnet hier: Die Zusagen dieses Dialogs sitzen in der
 * React-Verdrahtung selbst und lassen sich mit reinen Funktionen nicht belegen.
 *
 *  1. Das Rennen. Eine ueberholte Vorpruefung darf die juengere nicht
 *     ueberschreiben — das entscheidet ein Laufzaehler im Effekt-Cleanup, nicht
 *     eine Rechenregel.
 *  2. Die Reihenfolge. Was der Dialog von oben nach unten zeigt, geht in genau
 *     dieser Folge als Anhang hinaus. Frueher war das zweierlei: die Anzeige
 *     alphabetisch, der Versand nach der im Mandanten konfigurierten Folge.
 *  3. Der gesperrte Knopf. Eine Position, die den Versand mit 409 abbraeche,
 *     muss VOR dem Klick sperren.
 *  4. Die Adresse. Gesperrt, gewarnt und empfohlen wird nach EINEM Stand — dem
 *     frischen aus der Vorpruefung. Sonst riete der Dialog zu genau der
 *     Adresse, die der Server ablehnt.
 *  5. Die Meldung nach oben. Nach einem geglueckten Versand MUSS onVersendet()
 *     laufen — und nach einem abgelehnten nicht. Nur darueber erfaehrt die
 *     Karte, dass sie nicht mehr "Noch nicht versendet" sagen darf.
 *
 * Die Umgebung steht im Docblock oben, nicht global: jest.config.ts bleibt auf
 * "node", damit die ueber tausend Server-Tests unveraendert laufen. Die
 * JSX-Uebersetzung kommt aus der einen transform-Regel in jest.config.ts
 * ("jsx": "react-jsx", inline); dort steht auch, warum sie NICHT nach .ts und
 * .tsx aufgeteilt werden darf.
 *
 * @testing-library/jest-dom ist bewusst NICHT eingebunden (es braeuchte ein
 * setupFilesAfterEnv in der geteilten jest.config.ts und wirkte auf alle
 * Suiten). Die Zusicherungen kommen deshalb mit textContent, queryByText und
 * den nativen DOM-Eigenschaften aus.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { DokumentenpaketDialog, type PaketAngebot } from "@/components/dokumentenpaket-dialog";
import type {
  PaketPruefung,
  PaketVersandAntwort,
  PruefPosition,
} from "@/lib/types/dokumentenpaket";

// React 19 verlangt diese Marke, bevor act() Zustandsaenderungen einsammeln
// darf. @testing-library/react setzt sie selbst, aber nur beim ersten render —
// hier steht sie ausdruecklich, damit ein spaeterer Umbau der Bibliothek den
// Test nicht mit einer irrefuehrenden Warnung kippen laesst.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// =============================================
// Fixtures
// =============================================

const ANFAHRT = {
  art: "PDF" as const,
  id: "pdf-anfahrt",
  name: "Anfahrt",
  beschreibung: null,
  scope: "GLOBAL" as const,
  groesse: 1024,
  sensibleFelder: [],
};
const LEITBILD = {
  art: "PDF" as const,
  id: "pdf-leitbild",
  name: "Leitbild",
  beschreibung: null,
  scope: "GLOBAL" as const,
  groesse: 2048,
  sensibleFelder: [],
};
const WILLKOMMEN = {
  art: "VORLAGE" as const,
  id: "tpl-willkommen",
  name: "Willkommensschreiben",
  beschreibung: null,
  scope: "MANDANT" as const,
  groesse: 4096,
  sensibleFelder: [],
};
const ZUSATZ = {
  art: "VORLAGE" as const,
  id: "tpl-zusatz",
  name: "Zusatzvereinbarung",
  beschreibung: null,
  scope: "MANDANT" as const,
  groesse: 4096,
  sensibleFelder: [],
};

/** So kommt `verfuegbar` vom Server: PDFs nach Name, danach Vorlagen nach Name. */
const ALPHABETISCH = [ANFAHRT, LEITBILD, WILLKOMMEN, ZUSATZ];

function machAngebot(
  standardpaket: { art: "PDF" | "VORLAGE"; id: string }[],
  verfuegbar = ALPHABETISCH,
): PaketAngebot {
  return {
    modul: "ONBOARDING",
    organizationId: "org-1",
    empfaengerVorschlag: "max@example.org",
    vorname: "Max",
    nachname: "Muster",
    displayId: "ONB-1",
    standardpaket,
    verfuegbar,
    verlauf: [],
    altversand: null,
    maxBytes: 15 * 1024 * 1024,
  };
}

/**
 * Ein vollstaendiges Pruefungs-Objekt. `pdfDienstErreichbar: true` ist wichtig:
 * Sonst sperrt der Knopf aus einem anderen Grund, und die Zusicherung zum
 * Rennen wuerde falsch gruen.
 */
function machPruefung(teil: Partial<PaketPruefung> = {}): PaketPruefung {
  return {
    empfaengerVorgang: "max@example.org",
    empfaengerAbweichend: false,
    empfaengerErlaubt: true,
    erlaubteDomains: [],
    positionen: [],
    gesamtGroesse: 0,
    gesamtGeschaetzt: false,
    ueberGroessenGrenze: false,
    pdfDienstErreichbar: true,
    mailvorlageKenntNachricht: true,
    warnungen: [],
    ...teil,
  };
}

function machPruefZeile(
  p: { art: "PDF" | "VORLAGE"; id: string; name: string; groesse: number },
  teil: Partial<PruefPosition> = {},
): PruefPosition {
  return {
    art: p.art,
    id: p.id,
    name: p.name,
    groesse: p.groesse,
    geschaetzt: p.art === "VORLAGE",
    fehlendeFelder: [],
    sensibleFelder: [],
    bestaetigungNoetig: false,
    ...teil,
  };
}

// =============================================
// Netz: jeder Aufruf bleibt offen, bis der Test antwortet
// =============================================

interface Aufruf {
  /** Der angefragte Pfad — der Dialog spricht zwei Endpunkte an. */
  url: string;
  init: RequestInit;
  antworte: (koerper: unknown, ok?: boolean) => void;
  scheitere: (grund: unknown) => void;
}

let aufrufe: Aufruf[] = [];

beforeEach(() => {
  jest.useFakeTimers();
  aufrufe = [];
  // Bewusst KEINE fertigen Antworten je Aufruf: Der Test bestimmt die
  // Reihenfolge, in der geantwortet wird — genau darum geht es beim Rennen.
  global.fetch = jest.fn(
    (url: string, init: RequestInit) =>
      new Promise((aufloesen, ablehnen) => {
        aufrufe.push({
          url: String(url),
          init,
          antworte: (koerper, ok = true) =>
            aufloesen({ ok, json: async () => koerper } as Response),
          scheitere: ablehnen,
        });
      }),
  ) as unknown as typeof fetch;
});

afterEach(() => {
  jest.useRealTimers();
});

/** Die 500 ms Entprellung ueberspringen und alle faellig gewordenen Zusagen einloesen. */
async function warteAufAnfrage() {
  await act(async () => {
    jest.advanceTimersByTime(500);
  });
}

/** Beliebiger Antwortkoerper — fuer den Versand-Endpunkt und seine Fehlerfaelle. */
async function antworteMit(aufruf: Aufruf, koerper: unknown, ok = true) {
  await act(async () => {
    aufruf.antworte(koerper, ok);
  });
}

async function beantworte(aufruf: Aufruf, pruefung: PaketPruefung) {
  await antworteMit(aufruf, { data: pruefung });
}

const seitentext = () => document.body.textContent ?? "";

/**
 * Die Namen der Auswahlzeilen in Anzeigefolge.
 *
 * Gelesen wird gezielt der Namens-Span (`text-sm`) und nicht der ganze
 * Listeneintrag: Dessen textContent enthaelt auch das "Vorlage"-Abzeichen und
 * die Groessenangabe, und ein Test, der daran zerbricht, sobald jemand eine
 * Zeile um einen Hinweis ergaenzt, prueft die falsche Zusage.
 */
const zeilenNamen = () =>
  Array.from(document.querySelectorAll("li")).map(
    (li) => li.querySelector("span.text-sm")?.textContent ?? "",
  );
const versandKnopf = () => screen.getByRole("button", { name: "Versenden" }) as HTMLButtonElement;
const gesendetePositionen = (a: Aufruf): { art: string; id: string }[] =>
  JSON.parse(String(a.init.body)).positionen;

/**
 * `onVersendet` ist annehmbar, weil genau diese Kante geprueft werden muss: Die
 * Karte erfaehrt nur ueber sie, dass etwas hinausgegangen ist. Bleibt der
 * Rueckruf aus, sagt sie weiter "Noch nicht versendet" — und die naechste
 * Handlung waere der zweite Versand desselben Pakets.
 */
function zeigeDialog(angebot: PaketAngebot, onVersendet: () => void = () => {}) {
  return render(
    <DokumentenpaketDialog
      angebot={angebot}
      modul="ONBOARDING"
      refId="ref-1"
      onClose={() => {}}
      onVersendet={onVersendet}
    />,
  );
}

// =============================================
// 1. Das Rennen
// =============================================

describe("Vorpruefung: die juengste Antwort gewinnt", () => {
  it("bricht die ueberholte Anfrage ab und laesst ihre spaete Antwort nicht mehr durch", async () => {
    zeigeDialog(machAngebot([LEITBILD, WILLKOMMEN], [LEITBILD, WILLKOMMEN]));

    await warteAufAnfrage();
    expect(aufrufe).toHaveLength(1);

    // Eine Position abwaehlen -> zweite, kleinere Anfrage.
    await act(async () => {
      fireEvent.click(screen.getAllByRole("checkbox")[1]);
    });
    await warteAufAnfrage();
    expect(aufrufe).toHaveLength(2);
    // Der Abbruch spart dem Server das probeweise Rendern der alten Auswahl.
    expect((aufrufe[0].init.signal as AbortSignal).aborted).toBe(true);

    // Erst die JUENGERE beantworten...
    await beantworte(aufrufe[1], machPruefung({ gesamtGroesse: 2048 }));
    expect(seitentext()).toContain("2 KB");

    // ...dann die AELTERE nachliefern. Ohne Laufzaehler stuende jetzt eine
    // fremde Groesse da und der Knopf waere faelschlich gesperrt.
    await beantworte(
      aufrufe[0],
      machPruefung({ gesamtGroesse: 9_000_000, ueberGroessenGrenze: true }),
    );
    expect(seitentext()).toContain("2 KB");
    expect(seitentext()).not.toContain("8,6 MB");
    expect(screen.queryByText(/überschreitet die Größengrenze/)).toBeNull();
    expect(versandKnopf().disabled).toBe(false);
  });

  it("laesst den Spinner an, solange die juengste Anfrage laeuft", async () => {
    zeigeDialog(machAngebot([LEITBILD, WILLKOMMEN], [LEITBILD, WILLKOMMEN]));

    // Der Hinweis steht schon waehrend der Wartezeit — in diesen 500 ms zeigt
    // die Zusammenfassung noch den Stand der vorigen Auswahl.
    expect(seitentext()).toContain("Vorprüfung läuft");

    await warteAufAnfrage();
    await act(async () => {
      fireEvent.click(screen.getAllByRole("checkbox")[1]);
    });
    await warteAufAnfrage();

    // Die ueberholte Anfrage antwortet — sie darf den Spinner NICHT ausschalten.
    await beantworte(aufrufe[0], machPruefung({ gesamtGroesse: 4096 }));
    expect(seitentext()).toContain("Vorprüfung läuft");

    await beantworte(aufrufe[1], machPruefung({ gesamtGroesse: 2048 }));
    expect(seitentext()).not.toContain("Vorprüfung läuft");
  });

  it("macht aus dem Abbruch der ueberholten Anfrage keinen Verbindungsfehler", async () => {
    // Der Waechter im catch-Zweig zeigt seine Wirkung NICHT beim Schliessen des
    // Dialogs — nach dem Aushaengen zeigt ohnehin niemand mehr etwas an, ein
    // Test darauf bliebe gruen, egal was der Code tut. Er zeigt sie bei der
    // Auswahlaenderung am LEBENDEN Dialog: Das Cleanup dreht den Zaehler weiter
    // und bricht die alte Anfrage ab; deren Ablehnung trifft danach eine
    // Komponente, die weiter auf dem Schirm steht.
    zeigeDialog(machAngebot([LEITBILD, WILLKOMMEN], [LEITBILD, WILLKOMMEN]));

    await warteAufAnfrage();
    expect(aufrufe).toHaveLength(1);

    await act(async () => {
      fireEvent.click(screen.getAllByRole("checkbox")[1]);
    });
    await warteAufAnfrage();
    expect(aufrufe).toHaveLength(2);
    expect((aufrufe[0].init.signal as AbortSignal).aborted).toBe(true);

    // Die juengere Anfrage liefert ihr Ergebnis — es steht auf dem Schirm.
    await beantworte(aufrufe[1], machPruefung({ gesamtGroesse: 2048 }));
    expect(seitentext()).toContain("2 KB");

    // Erst jetzt schlaegt der Abbruch der aelteren als Fehler in `pruefe` auf.
    await act(async () => {
      aufrufe[0].scheitere(new DOMException("Aborted", "AbortError"));
    });

    // Ohne den Waechter stuende hier rot "Verbindungsfehler bei der
    // Vorpruefung", das gueltige Ergebnis waere per setPruefung(null) geloescht
    // (Groesse weg) und der Knopf haenge an einer Meldung ueber eine Anfrage,
    // die niemand mehr wollte.
    expect(seitentext()).not.toContain("Verbindungsfehler bei der Vorprüfung.");
    expect(seitentext()).toContain("2 KB");
    expect(versandKnopf().disabled).toBe(false);
  });

  // Den frueheren Test "meldet beim Schliessen keinen Verbindungsfehler" gibt es
  // bewusst NICHT mehr: Nach unmount() ist document.body.textContent der leere
  // String, und `"".not.toContain(...)` ist immer wahr — er konnte gar nicht
  // fallen und deckte den Waechter darueber trotzdem scheinbar ab. Der Fall des
  // Aushaengens laesst sich hier auch nicht sinnvoll ersetzen: React 19 warnt
  // nicht mehr ueber setState auf ausgehaengten Komponenten, es gaebe also
  // wieder nichts zu beobachten. Dieselbe Zeile Code schuetzt beide Faelle; der
  // Test darueber prueft sie an dem, in dem man den Schaden sieht.
});

// =============================================
// 2. Die Reihenfolge
// =============================================

describe("Reihenfolge: der Dialog ist massgeblich", () => {
  it("zeigt das Standardpaket in konfigurierter Folge, nicht alphabetisch", async () => {
    // Der Admin hat das Willkommensschreiben auf Position 1 gezogen; `verfuegbar`
    // kommt trotzdem alphabetisch vom Server.
    zeigeDialog(machAngebot([WILLKOMMEN, LEITBILD]));

    expect(zeilenNamen().slice(0, 2)).toEqual(["Willkommensschreiben", "Leitbild"]);
  });

  it("versendet genau die Folge, die der Dialog von oben nach unten zeigt", async () => {
    zeigeDialog(machAngebot([WILLKOMMEN, LEITBILD]));

    // Zusaetzlich anhaken: Zusatzvereinbarung (Block "Weitere Vorlagen") und
    // Anfahrt (Block "Weitere Dokumente"). Der Versand haengte die zusaetzlichen
    // PDFs frueher VOR die zusaetzlichen Vorlagen — umgekehrt zur Anzeige.
    const kaestchen = screen.getAllByRole("checkbox");
    await act(async () => {
      fireEvent.click(kaestchen[2]);
      fireEvent.click(kaestchen[3]);
    });
    await warteAufAnfrage();

    expect(zeilenNamen()).toEqual([
      "Willkommensschreiben",
      "Leitbild",
      "Zusatzvereinbarung",
      "Anfahrt",
    ]);
    expect(gesendetePositionen(aufrufe[aufrufe.length - 1])).toEqual([
      { art: "VORLAGE", id: WILLKOMMEN.id },
      { art: "PDF", id: LEITBILD.id },
      { art: "VORLAGE", id: ZUSATZ.id },
      { art: "PDF", id: ANFAHRT.id },
    ]);
  });

  it("laesst eine nicht mehr vorhandene Position weg, statt eine Luecke zu zeigen", async () => {
    zeigeDialog(machAngebot([WILLKOMMEN, { art: "PDF", id: "laengst-geloescht" }]));

    await warteAufAnfrage();
    expect(gesendetePositionen(aufrufe[0])).toEqual([{ art: "VORLAGE", id: WILLKOMMEN.id }]);
  });
});

// =============================================
// 3. Der gesperrte Knopf
// =============================================

describe("Versand-Knopf", () => {
  it("sperrt, sobald eine gewaehlte Position den Versand abbraeche", async () => {
    zeigeDialog(machAngebot([LEITBILD, WILLKOMMEN], [LEITBILD, WILLKOMMEN]));
    await warteAufAnfrage();

    await beantworte(
      aufrufe[0],
      machPruefung({
        gesamtGroesse: 2048,
        positionen: [
          machPruefZeile(LEITBILD, { blockiert: true }),
          machPruefZeile(WILLKOMMEN),
        ],
        warnungen: ['Dokument "Leitbild" fehlt im Speicher und wuerde den Versand abbrechen.'],
      }),
    );

    expect(versandKnopf().disabled).toBe(true);
    expect(seitentext()).toContain("Diese Datei fehlt im Speicher");
    expect(seitentext()).toContain("1 Dokument(e) können nicht versendet werden");
  });

  it("gibt wieder frei, sobald die kaputte Position abgewaehlt ist", async () => {
    zeigeDialog(machAngebot([LEITBILD, WILLKOMMEN], [LEITBILD, WILLKOMMEN]));
    await warteAufAnfrage();
    await beantworte(
      aufrufe[0],
      machPruefung({
        gesamtGroesse: 2048,
        positionen: [
          machPruefZeile(LEITBILD, { blockiert: true }),
          machPruefZeile(WILLKOMMEN),
        ],
      }),
    );
    expect(versandKnopf().disabled).toBe(true);

    await act(async () => {
      fireEvent.click(screen.getAllByRole("checkbox")[0]);
    });
    // Die Sperre haengt an der AUSWAHL, nicht an der Pruefung insgesamt.
    expect(versandKnopf().disabled).toBe(false);
  });

  it("sperrt nicht, solange noch keine Pruefung eingetroffen ist", async () => {
    zeigeDialog(machAngebot([LEITBILD], [LEITBILD]));
    // Ein Ausfall der Vorpruefung darf einen gesunden Versand nicht verhindern.
    expect(versandKnopf().disabled).toBe(false);
  });
});

// =============================================
// 4. Adresse: Freigabe ohne Anfrage je Tastendruck
// =============================================

describe("Empfaengeradresse", () => {
  it("prueft die Domain im Browser, ohne dafuer erneut zu fragen", async () => {
    zeigeDialog(machAngebot([LEITBILD], [LEITBILD]));
    await warteAufAnfrage();
    await beantworte(
      aufrufe[0],
      machPruefung({ gesamtGroesse: 2048, erlaubteDomains: ["fes-minden.de"] }),
    );
    expect(versandKnopf().disabled).toBe(false);

    await act(async () => {
      fireEvent.change(screen.getByDisplayValue("max@example.org"), {
        target: { value: "dieb@gmail.com" },
      });
    });

    expect(versandKnopf().disabled).toBe(true);
    expect(seitentext()).toContain("An diese Adresse darf nicht versendet werden");
    expect(seitentext()).toContain("erlaubt: fes-minden.de");

    // Der Kern der Entscheidung: Das Tippen loest KEINE neue Vorpruefung aus.
    await warteAufAnfrage();
    expect(aufrufe).toHaveLength(1);
  });

  it("laesst die Adresse des Vorgangs immer durch — auch bei gepflegter Liste", async () => {
    zeigeDialog(machAngebot([LEITBILD], [LEITBILD]));
    await warteAufAnfrage();
    await beantworte(
      aufrufe[0],
      machPruefung({
        gesamtGroesse: 2048,
        empfaengerVorgang: "max@example.org",
        erlaubteDomains: ["fes-minden.de"],
      }),
    );

    // Beim Onboarding ist die private Adresse der Regelfall — eine Liste, die
    // genau die blockierte, waere unbrauchbar.
    expect(versandKnopf().disabled).toBe(false);
    expect(seitentext()).not.toContain("An diese Adresse darf nicht versendet werden");
  });

  it("schickt die Adresse gar nicht erst in die teure Vorpruefung", async () => {
    zeigeDialog(machAngebot([LEITBILD], [LEITBILD]));
    await warteAufAnfrage();

    const koerper = JSON.parse(String(aufrufe[0].init.body));
    expect(Object.keys(koerper)).toEqual(["modul", "refId", "positionen"]);
  });

  it("urteilt nach der Adresse aus der Vorpruefung, nicht nach der aus dem Angebot", async () => {
    // Der Dialog steht offen, waehrend jemand die Adresse im Vorgang aendert:
    // Das Angebot nennt noch max@example.org, die Vorpruefung schon
    // neu@example.org. Beides ist serverseitig dasselbe Feld, nur zu
    // verschiedenen Zeitpunkten gelesen — und der Versand prueft am Ende gegen
    // den frischen Stand.
    zeigeDialog(machAngebot([LEITBILD], [LEITBILD]));
    await warteAufAnfrage();
    await beantworte(
      aufrufe[0],
      machPruefung({
        gesamtGroesse: 2048,
        empfaengerVorgang: "neu@example.org",
        erlaubteDomains: ["fes-minden.de"],
      }),
    );

    // Im Feld steht unveraendert die Adresse aus dem Angebot — sie ist jetzt
    // eine Abweichung, und ihre Domain steht nicht auf der Liste.
    expect(versandKnopf().disabled).toBe(true);
    expect(seitentext()).toContain("Weicht von der Adresse im Vorgang ab (neu@example.org)");
    // Der eigentliche Befund: Wuerde die Empfehlung den alten Stand nennen,
    // riete sie zu genau der Adresse, die der Server mit 409 ablehnt.
    expect(seitentext()).toContain("Bitte neu@example.org verwenden");
    expect(seitentext()).not.toContain("Bitte max@example.org verwenden");

    // Und die frische Adresse geht durch, obwohl das Angebot sie nicht kennt.
    await act(async () => {
      fireEvent.change(screen.getByDisplayValue("max@example.org"), {
        target: { value: "neu@example.org" },
      });
    });
    expect(versandKnopf().disabled).toBe(false);
    expect(seitentext()).not.toContain("An diese Adresse darf nicht versendet werden");
    expect(seitentext()).not.toContain("Weicht von der Adresse im Vorgang ab");
  });
});

// =============================================
// 5. Der Versand selbst: die Meldung nach oben
// =============================================

/**
 * Die Karte "Dokumente versenden" erfaehrt AUSSCHLIESSLICH ueber onVersendet(),
 * dass etwas hinausgegangen ist — sie laedt daraufhin ihr Angebot nach und sagt
 * statt "Noch nicht versendet" den Zeitpunkt. Bleibt der Rueckruf aus, lockt der
 * Knopf nach einem erfolgreichen Versand weiter zum ersten Versand.
 *
 * Der Aktualisierungstest (dokumentenpaket-aktualisierung.test.tsx) haengt die
 * Kette Karte → Elternteil an einen Ersatz-Dialog; hier steht die erste Kante
 * derselben Kette, der ECHTE Dialog.
 */
function machErgebnis(teil: Partial<PaketVersandAntwort> = {}): PaketVersandAntwort {
  return {
    versandId: "vers-1",
    empfaenger: "max@example.org",
    dokumente: [
      {
        art: "PDF",
        name: "Leitbild",
        dateiname: "leitbild.pdf",
        hash: "abc",
        groesse: 2048,
        fehlendeFelder: [],
        sensibleFelder: [],
      },
    ],
    warnungen: [],
    ...teil,
  };
}

describe("Versand: der Dialog meldet nach oben", () => {
  /** Bis zum klickbaren Versand-Knopf: Vorpruefung abwarten und beantworten. */
  async function bisZumKnopf(onVersendet: jest.Mock) {
    zeigeDialog(machAngebot([LEITBILD], [LEITBILD]), onVersendet);
    await warteAufAnfrage();
    await beantworte(
      aufrufe[0],
      machPruefung({ gesamtGroesse: 2048, positionen: [machPruefZeile(LEITBILD)] }),
    );
    expect(versandKnopf().disabled).toBe(false);

    await act(async () => {
      fireEvent.click(versandKnopf());
    });
    // Der Klick fragt den Versand-Endpunkt und NICHT noch einmal die
    // Vorpruefung — sonst haenge die Antwort unten am falschen Aufruf.
    expect(aufrufe).toHaveLength(2);
    expect(aufrufe[1].url).toBe("/api/dokumentenpaket/versenden");
    return aufrufe[1];
  }

  it("ruft onVersendet, sobald der Versand geglueckt ist", async () => {
    const onVersendet = jest.fn();
    const versand = await bisZumKnopf(onVersendet);

    expect(onVersendet).not.toHaveBeenCalled();

    await antworteMit(versand, { data: machErgebnis() });

    expect(onVersendet).toHaveBeenCalledTimes(1);
    // Und der Dialog zeigt das Ergebnis statt des Formulars.
    expect(seitentext()).toContain("an max@example.org versendet");
    expect(screen.queryByRole("button", { name: "Versenden" })).toBeNull();
  });

  it("ruft onVersendet auch, wenn der Nachweis Warnungen traegt", async () => {
    // Der gefaehrlichste Fall: Die Mail IST raus (Ergebnis SENT), nur die
    // Nachweis-Transaktion ist zurueckgerollt. Gerade dann muss die Karte es
    // erfahren — sonst behauptet sie "Noch nicht versendet" und die naechste
    // Handlung waere der zweite Versand desselben Pakets.
    const onVersendet = jest.fn();
    const versand = await bisZumKnopf(onVersendet);

    await antworteMit(versand, {
      data: machErgebnis({
        warnungen: ["Der Versand ist erfolgt, der Nachweis konnte nicht gespeichert werden."],
      }),
    });

    expect(onVersendet).toHaveBeenCalledTimes(1);
    expect(seitentext()).toContain("Nachweis konnte nicht gespeichert werden");
  });

  it("meldet NICHT nach oben, wenn der Versand abgelehnt wurde", async () => {
    // Die Gegenprobe zu den beiden oberen: Ein unbedingter Aufruf von
    // onVersendet() liesse sie gruen und waere trotzdem falsch — die Karte
    // stuende danach auf "versendet", obwohl nichts hinausgegangen ist.
    const onVersendet = jest.fn();
    const versand = await bisZumKnopf(onVersendet);

    await antworteMit(versand, { error: "Das Paket überschreitet die Größengrenze." }, false);

    expect(onVersendet).not.toHaveBeenCalled();
    expect(seitentext()).toContain("Das Paket überschreitet die Größengrenze.");
    // Das Formular bleibt stehen, damit die Auswahl geaendert werden kann.
    expect(versandKnopf().disabled).toBe(false);
  });
});
