/**
 * @jest-environment jsdom
 */

/**
 * Dialog und Bestaetigungsdialog (UX-Umbau „Klarer Weg", U0).
 *
 * Geprueft werden die Regeln aus dem Kopfkommentar von `ui/dialog.tsx` — vor
 * allem die vier, die aus `unterlagen/dialog-rahmen.tsx` uebernommen sind und
 * die Radix nicht von sich aus kennt: nichts schliesst, waehrend die Aktion
 * laeuft; ein neuer Fehler bekommt den Fokus; der Sperrgrund steht als Text
 * da; der Fokus kehrt zurueck (oder geht auf das Ersatzziel).
 *
 * Der Dialog haengt in einem Portal an `body`; axe laeuft deshalb ueber
 * `document.body`, nicht ueber den Container des Tests.
 */
import { useState } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { BestaetigungsDialog, Dialog, type DialogProps } from "@/components/ui/dialog";
import { STATUS_TOENE } from "@/components/ui/statuspille";
import { axeVerstoesse } from "../hilfen/axe";

function escape() {
  fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
}

function knopf(name: string | RegExp) {
  return screen.getByRole("button", { name }) as HTMLButtonElement;
}

/** Dialog mit Ausloeser und Ersatzziel, wie ihn eine Karte einbindet. */
function Probe(props: Partial<DialogProps> & { ausloeserVerschwindet?: boolean; ausloeserGesperrt?: boolean }) {
  const { ausloeserVerschwindet, ausloeserGesperrt, ...dialog } = props;
  const [offen, setOffen] = useState(false);
  const [geoeffnet, setGeoeffnet] = useState(false);
  return (
    <main>
      <h1 id="ersatz" tabIndex={-1}>
        Karte
      </h1>
      {!(ausloeserVerschwindet && geoeffnet) && (
        <button
          type="button"
          disabled={ausloeserGesperrt && geoeffnet}
          onClick={() => {
            setOffen(true);
            setGeoeffnet(true);
          }}
        >
          Öffnen
        </button>
      )}
      <Dialog offen={offen} onSchliessen={() => setOffen(false)} titel="Unterlage zurückweisen" fokusZiel="ersatz" {...dialog} />
    </main>
  );
}

function oeffnen() {
  const ausloeser = knopf("Öffnen");
  ausloeser.focus();
  fireEvent.click(ausloeser);
  return ausloeser;
}

describe("Dialog: Aufbau", () => {
  it("heisst wie sein Titel, die Beschreibung beschreibt ihn, und axe findet nichts", async () => {
    render(
      <Dialog
        offen
        onSchliessen={() => {}}
        titel="Unterlage zurückweisen"
        beschreibung="Meldebescheinigung"
        bestaetigen={{ text: "Zurückweisen", onClick: () => {} }}
        fehler="Der Vorgang wurde geändert."
        name="zurueckweisen"
      >
        <p>Inhalt</p>
      </Dialog>,
    );
    const dialog = screen.getByRole("dialog", { name: "Unterlage zurückweisen" });
    expect(dialog.getAttribute("data-dialog")).toBe("zurueckweisen");
    expect(document.getElementById(dialog.getAttribute("aria-describedby")!)?.textContent).toBe("Meldebescheinigung");
    expect(await axeVerstoesse(document.body)).toEqual([]);
  });

  it("die Beschreibung darf Absaetze und Listen enthalten – sie steht in einem div, nicht in einem p", () => {
    // Befund der Durchsicht: Radix zeichnet die Beschreibung als `<p>`; ein
    // Absatz darin waere ungueltiges HTML.
    render(
      <Dialog
        offen
        onSchliessen={() => {}}
        titel="Titel"
        beschreibung={
          <>
            <p>Satz eins.</p>
            <ul>
              <li>Punkt</li>
            </ul>
          </>
        }
      />,
    );
    const dialog = screen.getByRole("dialog");
    const beschreibung = document.getElementById(dialog.getAttribute("aria-describedby")!)!;
    expect(beschreibung.tagName).toBe("DIV");
    expect(beschreibung.querySelector("p")?.textContent).toBe("Satz eins.");
    expect(beschreibung.querySelector("li")?.textContent).toBe("Punkt");
  });

  it("geschlossen zeichnet er nichts", () => {
    render(<Dialog offen={false} onSchliessen={() => {}} titel="Titel" />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("ohne Bestaetigen gibt es einen Knopf, und der heisst Schließen", () => {
    render(<Dialog offen onSchliessen={() => {}} titel="Hinweis" />);
    expect(knopf("Schließen")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Abbrechen" })).toBeNull();
  });
});

describe("Dialog: Fokus", () => {
  it("beim Oeffnen liegt er auf Abbrechen – nie auf dem bestaetigenden Knopf", () => {
    render(<Probe bestaetigen={{ text: "Zurückweisen", onClick: () => {} }} />);
    oeffnen();
    expect(document.activeElement).toBe(knopf("Abbrechen"));
  });

  it("ein Feld mit data-autofokus bekommt ihn stattdessen", () => {
    render(
      <Probe bestaetigen={{ text: "Zurückweisen", onClick: () => {} }}>
        <label>
          Begründung
          <textarea data-autofokus />
        </label>
      </Probe>,
    );
    oeffnen();
    expect(document.activeElement).toBe(screen.getByLabelText("Begründung"));
  });

  it("Tab kreist im Dialog", () => {
    render(<Probe bestaetigen={{ text: "Zurückweisen", onClick: () => {} }} />);
    oeffnen();
    const letzter = knopf("Zurückweisen");
    letzter.focus();
    fireEvent.keyDown(letzter, { key: "Tab" });
    expect(document.activeElement).toBe(knopf("Dialog schließen"));
    fireEvent.keyDown(knopf("Dialog schließen"), { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(letzter);
  });

  it("nach dem Schliessen kehrt er zum Ausloeser zurueck", async () => {
    render(<Probe />);
    const ausloeser = oeffnen();
    escape();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(ausloeser));
  });

  it("ist der Ausloeser verschwunden, geht er auf das Ersatzziel", async () => {
    render(<Probe ausloeserVerschwindet />);
    oeffnen();
    fireEvent.click(knopf("Schließen"));
    await waitFor(() => expect(document.activeElement).toBe(document.getElementById("ersatz")));
  });

  it("nimmt der Ausloeser den Fokus nicht an (disabled), geht er auf das Ersatzziel", async () => {
    render(<Probe ausloeserGesperrt />);
    oeffnen();
    fireEvent.click(knopf("Schließen"));
    await waitFor(() => expect(document.activeElement).toBe(document.getElementById("ersatz")));
  });
});

describe("Dialog: schliessen", () => {
  it("Escape, Abbrechen und das Kreuz schliessen", () => {
    const zu = jest.fn();
    render(<Dialog offen onSchliessen={zu} titel="Titel" bestaetigen={{ text: "Senden", onClick: () => {} }} />);
    escape();
    fireEvent.click(knopf("Abbrechen"));
    fireEvent.click(knopf("Dialog schließen"));
    expect(zu).toHaveBeenCalledTimes(3);
  });

  it("ein Klick neben den Dialog schliesst nicht", async () => {
    const zu = jest.fn();
    render(<Dialog offen onSchliessen={zu} titel="Titel" />);
    // Radix haengt seinen Horcher fuer „Klick daneben" erst im naechsten Takt
    // an — ohne das Warten pruefte der Test nichts.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    const schleier = screen.getByRole("dialog").parentElement!;
    fireEvent.pointerDown(schleier);
    fireEvent.mouseDown(schleier);
    fireEvent.click(schleier);
    expect(zu).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("waehrend die Aktion laeuft, schliesst NICHTS – und die Knoepfe bleiben fokussierbar", () => {
    const zu = jest.fn();
    const senden = jest.fn();
    render(
      <Dialog
        offen
        gesperrt
        onSchliessen={zu}
        titel="Titel"
        bestaetigen={{ text: "Senden", laeuftText: "Wird gesendet …", onClick: senden }}
      />,
    );
    escape();
    fireEvent.click(knopf("Abbrechen"));
    fireEvent.click(knopf("Dialog schließen"));
    expect(zu).not.toHaveBeenCalled();

    const laeuft = knopf("Wird gesendet …");
    expect(laeuft.getAttribute("aria-busy")).toBe("true");
    fireEvent.click(laeuft);
    expect(senden).not.toHaveBeenCalled();

    // aria-disabled statt disabled: Der Fokus faellt nicht auf body.
    for (const k of [knopf("Abbrechen"), knopf("Dialog schließen"), laeuft]) {
      expect(k.disabled).toBe(false);
      expect(k.getAttribute("aria-disabled")).toBe("true");
      k.focus();
      expect(document.activeElement).toBe(k);
    }
  });
});

describe("Dialog: Fehler und Sperrgrund", () => {
  it("ein NEUER Fehler bekommt den Fokus und nutzt das gerechnete Farbpaar", () => {
    const { rerender } = render(
      <Dialog offen onSchliessen={() => {}} titel="Titel" bestaetigen={{ text: "Senden", onClick: () => {} }} />,
    );
    expect(screen.queryByRole("alert")).toBeNull();
    rerender(
      <Dialog
        offen
        onSchliessen={() => {}}
        titel="Titel"
        fehler="Der Vorgang wurde geändert."
        bestaetigen={{ text: "Senden", onClick: () => {} }}
      />,
    );
    const zeile = screen.getByRole("alert");
    expect(zeile.textContent).toBe("Der Vorgang wurde geändert.");
    expect(document.activeElement).toBe(zeile);
    for (const klasse of STATUS_TOENE.critical.split(" ")) expect(zeile.className).toContain(klasse);
  });

  it("derselbe Fehler noch einmal reisst den Fokus nicht an sich", () => {
    const props = { offen: true, onSchliessen: () => {}, titel: "Titel", fehler: "Fehler A" };
    const { rerender } = render(<Dialog {...props} />);
    knopf("Schließen").focus();
    rerender(<Dialog {...props} gesperrt />);
    rerender(<Dialog {...props} />);
    expect(document.activeElement).toBe(knopf("Schließen"));
    rerender(<Dialog {...props} fehler="Fehler B" />);
    expect(document.activeElement).toBe(screen.getByRole("alert"));
  });

  it("der Sperrgrund steht als Text da, beschreibt den Knopf, und der Knopf tut nichts", () => {
    const senden = jest.fn();
    render(
      <Dialog
        offen
        onSchliessen={() => {}}
        titel="Titel"
        bestaetigen={{ text: "Zurückweisen", onClick: senden, sperrGrund: "Bitte eine Begründung eintragen." }}
      />,
    );
    const k = knopf("Zurückweisen");
    expect(screen.getByText("Bitte eine Begründung eintragen.")).toBeTruthy();
    expect(document.getElementById(k.getAttribute("aria-describedby")!)?.textContent).toBe(
      "Bitte eine Begründung eintragen.",
    );
    expect(k.getAttribute("aria-disabled")).toBe("true");
    expect(k.disabled).toBe(false);
    fireEvent.click(k);
    expect(senden).not.toHaveBeenCalled();
  });

  it("ohne Sperrgrund laeuft die Aktion; ein leerer Grund sperrt nicht", () => {
    const senden = jest.fn();
    render(
      <Dialog offen onSchliessen={() => {}} titel="Titel" bestaetigen={{ text: "Senden", onClick: senden, sperrGrund: "  " }} />,
    );
    fireEvent.click(knopf("Senden"));
    expect(senden).toHaveBeenCalledTimes(1);
    expect(knopf("Senden").getAttribute("aria-describedby")).toBeNull();
  });

  it("waehrend die Aktion laeuft, steht der Sperrgrund nicht da", () => {
    render(
      <Dialog
        offen
        gesperrt
        onSchliessen={() => {}}
        titel="Titel"
        bestaetigen={{ text: "Senden", onClick: () => {}, sperrGrund: "Bitte eine Begründung eintragen." }}
      />,
    );
    expect(screen.queryByText("Bitte eine Begründung eintragen.")).toBeNull();
  });
});

describe("BestaetigungsDialog", () => {
  function Rueckfrage(props: { variante?: "primary" | "critical"; onBestaetigen?: () => void; onAbbrechen?: () => void }) {
    return (
      <BestaetigungsDialog
        offen
        onAbbrechen={props.onAbbrechen ?? (() => {})}
        onBestaetigen={props.onBestaetigen ?? (() => {})}
        titel="Vorgang stornieren?"
        bestaetigenText="Stornieren"
        variante={props.variante}
      >
        Alle verschickten Links werden ungültig.
      </BestaetigungsDialog>
    );
  }

  it("ist ein alertdialog mit Frage als Name und Satz als Beschreibung; axe findet nichts", async () => {
    render(<Rueckfrage />);
    const dialog = screen.getByRole("alertdialog", { name: "Vorgang stornieren?" });
    expect(document.getElementById(dialog.getAttribute("aria-describedby")!)?.textContent).toBe(
      "Alle verschickten Links werden ungültig.",
    );
    expect(await axeVerstoesse(document.body)).toEqual([]);
  });

  it("der Fokus liegt auf Abbrechen; Enter dort bestaetigt nicht", async () => {
    const ja = jest.fn();
    const nein = jest.fn();
    render(<Rueckfrage onBestaetigen={ja} onAbbrechen={nein} />);
    await waitFor(() => expect(document.activeElement).toBe(knopf("Abbrechen")));
    fireEvent.click(document.activeElement!);
    expect(ja).not.toHaveBeenCalled();
    expect(nein).toHaveBeenCalledTimes(1);
  });

  it("bestaetigt mit dem Verb der Aktion; critical faerbt den Knopf", () => {
    const ja = jest.fn();
    render(<Rueckfrage variante="critical" onBestaetigen={ja} />);
    const k = knopf("Stornieren");
    expect(k.className).toContain("bg-critical");
    act(() => {
      fireEvent.click(k);
    });
    expect(ja).toHaveBeenCalledTimes(1);
  });
});
