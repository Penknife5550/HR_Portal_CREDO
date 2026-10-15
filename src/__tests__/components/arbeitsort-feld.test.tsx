/**
 * @jest-environment jsdom
 */

/**
 * Arbeitsort am Vorgang: Zeile in der Karte „Person“ und Kopfzeile
 * (src/components/ausstattung/arbeitsort-feld.tsx, E-A10, Feinplan S5)
 *
 * Belegt wird, was nur die Oberflaeche zeigt:
 *   1. Anzeige: „Wie Einrichtung“ ohne Arbeitsort, sonst sein Name; der Kopf
 *      nennt ihn nur bei Abweichung.
 *   2. „Ändern…“ nur, wenn die Seite `aenderbar` sagt.
 *   3. Der Dialog bietet „Wie Einrichtung“ und die AKTIVEN Einrichtungen an
 *      (nicht die des Vorgangs selbst), sperrt „Speichern“ ohne Aenderung mit
 *      sichtbarem Grund und schickt `null` bzw. die ID.
 *   4. Ein Fehler des Servers (409 nach erzeugtem Link) bleibt im Dialog; nach
 *      Erfolg schliesst er und die Seite laedt neu (`onGeaendert`).
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { ArbeitsortFeld, ArbeitsortKopf } from "@/components/ausstattung/arbeitsort-feld";
import { MELDUNGEN } from "@/lib/ausstattung";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const EINRICHTUNG = { id: "org-1", name: "Förderverein Minden", mandantNumber: "30" };
const GRUNDSCHULE = { id: "org-gs", name: "FES Grundschule Nord", mandantNumber: "20", isActive: true };
const KITA = { id: "org-kita", name: "FES Kita", mandantNumber: "40", isActive: true };
const STILLGELEGT = { id: "org-alt", name: "Alte Einrichtung", mandantNumber: "99", isActive: false };

interface Aufruf {
  url: string;
  init?: RequestInit;
}

let aufrufe: Aufruf[] = [];
let patchAntwort: { ok: boolean; body: unknown } = { ok: true, body: {} };

beforeEach(() => {
  aufrufe = [];
  patchAntwort = {
    ok: true,
    body: { data: { arbeitsortId: GRUNDSCHULE.id, arbeitsort: GRUNDSCHULE, geaendert: true } },
  };
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    aufrufe.push({ url: String(url), init });
    if (String(url) === "/api/organizations") {
      return { ok: true, json: async () => ({ data: [{ ...EINRICHTUNG, isActive: true }, GRUNDSCHULE, KITA, STILLGELEGT] }) } as Response;
    }
    return { ok: patchAntwort.ok, json: async () => patchAntwort.body } as Response;
  }) as unknown as typeof fetch;
});

async function zeige(teil: Partial<React.ComponentProps<typeof ArbeitsortFeld>> = {}) {
  const onGeaendert = jest.fn();
  await act(async () => {
    render(
      <ArbeitsortFeld
        onboardingId="onb-1"
        einrichtung={EINRICHTUNG}
        arbeitsort={null}
        aenderbar
        onGeaendert={onGeaendert}
        {...teil}
      />,
    );
  });
  return { onGeaendert };
}

async function oeffneDialog() {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Ändern…" }));
  });
}

const auswahl = () => screen.getByLabelText("Arbeitsort") as HTMLSelectElement;
const speichernKnopf = () => screen.getByRole("button", { name: "Speichern" }) as HTMLButtonElement;
const text = () => document.body.textContent ?? "";
const patchAufrufe = () => aufrufe.filter((a) => a.init?.method === "PATCH");

describe("Anzeige", () => {
  it("ohne Arbeitsort steht „Wie Einrichtung“", async () => {
    await zeige();
    expect(text()).toContain("ArbeitsortWie Einrichtung");
  });

  it("mit Arbeitsort steht sein Name", async () => {
    await zeige({ arbeitsort: { id: GRUNDSCHULE.id, name: GRUNDSCHULE.name, type: "GRUNDSCHULE" } });
    expect(text()).toContain("FES Grundschule Nord");
  });

  it("ohne `aenderbar` gibt es keinen Knopf „Ändern…“", async () => {
    await zeige({ aenderbar: false });
    expect(screen.queryByRole("button", { name: "Ändern…" })).toBeNull();
  });

  it("der Kopf nennt den Arbeitsort nur bei Abweichung", () => {
    const { container, rerender } = render(<ArbeitsortKopf arbeitsort={null} />);
    expect(container.textContent).toBe("");
    rerender(<ArbeitsortKopf arbeitsort={{ id: GRUNDSCHULE.id, name: GRUNDSCHULE.name }} />);
    expect(container.textContent).toContain("Arbeitsort: FES Grundschule Nord");
  });
});

describe("Dialog „Arbeitsort ändern“", () => {
  it("bietet „Wie Einrichtung“ und nur aktive, fremde Einrichtungen an; ohne Aenderung gesperrt", async () => {
    await zeige();
    await oeffneDialog();

    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(Array.from(auswahl().options).map((o) => o.textContent)).toEqual([
      "Wie Einrichtung",
      "FES Grundschule Nord (20)",
      "FES Kita (40)",
    ]);
    expect(auswahl().value).toBe("");
    expect(speichernKnopf().disabled).toBe(true);
    expect(text()).toContain(MELDUNGEN.ARBEITSORT_UNVERAENDERT);
  });

  it("ein stillgelegter, aber gesetzter Arbeitsort bleibt waehlbar und vorausgewaehlt", async () => {
    await zeige({ arbeitsort: { id: STILLGELEGT.id, name: STILLGELEGT.name, type: "VEREIN" } });
    await oeffneDialog();

    expect(auswahl().value).toBe(STILLGELEGT.id);
    expect(Array.from(auswahl().options).map((o) => o.value)).toContain(STILLGELEGT.id);
  });

  it("speichert eine Abweichung, schliesst und laedt neu", async () => {
    const { onGeaendert } = await zeige();
    await oeffneDialog();
    fireEvent.change(auswahl(), { target: { value: GRUNDSCHULE.id } });

    await act(async () => {
      fireEvent.click(speichernKnopf());
    });

    expect(patchAufrufe()).toHaveLength(1);
    expect(patchAufrufe()[0].url).toBe("/api/onboarding/onb-1/arbeitsort");
    expect(JSON.parse(String(patchAufrufe()[0].init?.body))).toEqual({ arbeitsortId: GRUNDSCHULE.id });
    expect(onGeaendert).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("status").textContent).toBe(MELDUNGEN.ARBEITSORT_GESPEICHERT);
  });

  it("„Wie Einrichtung“ schickt null", async () => {
    await zeige({ arbeitsort: { id: GRUNDSCHULE.id, name: GRUNDSCHULE.name, type: "GRUNDSCHULE" } });
    await oeffneDialog();
    fireEvent.change(auswahl(), { target: { value: "" } });

    await act(async () => {
      fireEvent.click(speichernKnopf());
    });

    expect(JSON.parse(String(patchAufrufe()[0].init?.body))).toEqual({ arbeitsortId: null });
  });

  it("zeigt den Fehler des Servers im Dialog und laedt still neu (auch ein 409 hat den Stand geaendert)", async () => {
    patchAntwort = { ok: false, body: { error: MELDUNGEN.ARBEITSORT_LINK_ERZEUGT, grund: "LINK_ERZEUGT" } };
    const { onGeaendert } = await zeige();
    await oeffneDialog();
    fireEvent.change(auswahl(), { target: { value: KITA.id } });

    await act(async () => {
      fireEvent.click(speichernKnopf());
    });

    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toBe(MELDUNGEN.ARBEITSORT_LINK_ERZEUGT);
    expect(onGeaendert).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("status")?.textContent ?? "").toBe("");
  });

  it("nach dem Neuladen ohne „Ändern…“: Schließen gibt den Fokus an die Beschriftung, nicht an body", async () => {
    patchAntwort = { ok: false, body: { error: MELDUNGEN.ARBEITSORT_LINK_ERZEUGT, grund: "LINK_ERZEUGT" } };
    const onGeaendert = jest.fn();
    const props = {
      onboardingId: "onb-1",
      einrichtung: EINRICHTUNG,
      arbeitsort: null,
      onGeaendert,
    };
    const { rerender } = await (async () => {
      let r!: ReturnType<typeof render>;
      await act(async () => {
        r = render(<ArbeitsortFeld {...props} aenderbar />);
      });
      return r;
    })();
    const aendernKnopf = screen.getByRole("button", { name: "Ändern…" });
    aendernKnopf.focus();
    await act(async () => {
      fireEvent.click(aendernKnopf);
    });
    fireEvent.change(auswahl(), { target: { value: KITA.id } });
    await act(async () => {
      fireEvent.click(speichernKnopf());
    });
    expect(onGeaendert).toHaveBeenCalledTimes(1);

    // Die Seite hat neu geladen: Der Link ist inzwischen erzeugt, „Ändern…“ entfaellt.
    await act(async () => {
      rerender(<ArbeitsortFeld {...props} aenderbar={false} />);
    });
    expect(screen.queryByRole("button", { name: "Ändern…" })).toBeNull();
    expect(screen.getByRole("dialog")).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement?.id).toBe("arbeitsort-onb-1-titel");
  });

  it("ohne Antwort des Servers (Netzfehler) wird nicht neu geladen", async () => {
    const { onGeaendert } = await zeige();
    await oeffneDialog();
    fireEvent.change(auswahl(), { target: { value: KITA.id } });
    (global.fetch as jest.Mock).mockImplementationOnce(async () => {
      throw new Error("offline");
    });

    await act(async () => {
      fireEvent.click(speichernKnopf());
    });

    expect(screen.getByRole("alert").textContent).toBe("Verbindungsfehler. Bitte erneut versuchen.");
    expect(onGeaendert).not.toHaveBeenCalled();
  });
});
