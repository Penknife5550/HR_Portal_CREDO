/**
 * @jest-environment jsdom
 */

/**
 * Dialog „E-Mail ansehen“ und seine Einbindung im Reiter „E-Mails“.
 *
 * Der Dialog haengt in einem Portal an `body`; axe laeuft deshalb ueber
 * `document.body`.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MailTextDialog } from "@/components/vorgangs-mails/mail-text-dialog";
import { MailProtokoll } from "@/components/vorgangs-mails/mail-protokoll";
import { axeVerstoesse } from "../hilfen/axe";
import type { MailTextAntwort } from "@/lib/mail-text-dienst";

const QUELLE = "/api/vorgaenge/onboarding/v1/mails/m1/text";

const ANTWORT: MailTextAntwort = {
  kopf: {
    zeitpunkt: "2026-10-14T07:12:00.000Z",
    ereignisName: "Einladung Mitarbeiter (Personalfragebogen)",
    status: "SENT",
    statusText: "versendet",
    betreff: "Willkommen bei FES Gymnasium Minden",
    empfaenger: "anna.beispiel@beispiel.invalid",
    cc: null,
    bcc: null,
  },
  html: "<!DOCTYPE html><html><head></head><body><p>Hallo Anna</p></body></html>",
  text: "Hallo Anna\n\n[Persönlicher Link – aus Sicherheitsgründen nicht gespeichert]",
  gekuerzt: false,
  hinweis: null,
  linkHinweis: "Die Mail enthielt den echten Link, hier steht ein Platzhalter.",
};

function antwort(status: number, body: unknown) {
  return Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) } as Response);
}

const fetchMock = jest.fn();

beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
});

describe("MailTextDialog", () => {
  it("laedt nichts, solange er geschlossen ist", () => {
    render(<MailTextDialog quelle={null} onSchliessen={() => {}} />);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("zeigt beim Laden ein Skelett, dann Kopfzeilen und die Mail im geschuetzten Rahmen", async () => {
    fetchMock.mockReturnValue(antwort(200, ANTWORT));
    render(<MailTextDialog quelle={QUELLE} onSchliessen={() => {}} />);

    expect(screen.getByRole("status")).toBeTruthy(); // Skelett
    await screen.findByText("anna.beispiel@beispiel.invalid");

    expect(fetchMock).toHaveBeenCalledWith(QUELLE, { cache: "no-store" });
    const rahmen = screen.getByTitle("Text der E-Mail") as HTMLIFrameElement;
    // leeres sandbox-Attribut = keine einzige Berechtigung
    expect(rahmen.getAttribute("sandbox")).toBe("");
    expect(rahmen.getAttribute("srcdoc")).toBe(ANTWORT.html);
    expect(screen.getByText("Willkommen bei FES Gymnasium Minden")).toBeTruthy();
    expect(screen.getByText("Persönliche Links sind ersetzt")).toBeTruthy();
    expect(screen.getByRole("dialog").textContent).toContain("Einladung Mitarbeiter (Personalfragebogen) · versendet am");
  });

  it("Nur Text zeigt den abgeleiteten Text statt des Rahmens", async () => {
    fetchMock.mockReturnValue(antwort(200, ANTWORT));
    render(<MailTextDialog quelle={QUELLE} onSchliessen={() => {}} />);
    await screen.findByTitle("Text der E-Mail");

    fireEvent.click(screen.getByRole("radio", { name: "Nur Text" }));

    expect(screen.queryByTitle("Text der E-Mail")).toBeNull();
    expect(screen.getByText(/Hallo Anna/).tagName).toBe("PRE");
    expect(screen.getByText(/Persönlicher Link – aus Sicherheitsgründen nicht gespeichert/)).toBeTruthy();
  });

  it("nennt bei einer nicht zugestellten Mail den Hinweis, bei gekuerztem Text die Kuerzung", async () => {
    fetchMock.mockReturnValue(
      antwort(200, { ...ANTWORT, hinweis: "Diese Mail wurde nicht zugestellt.", gekuerzt: true }),
    );
    render(<MailTextDialog quelle={QUELLE} onSchliessen={() => {}} />);
    await screen.findByText("Diese Mail wurde nicht zugestellt.");
    expect(screen.getByText("Der Text wurde bei 100.000 Zeichen gekürzt.")).toBeTruthy();
  });

  it("ein Ladefehler steht mit „Erneut versuchen“ da, und der Knopf laedt neu", async () => {
    fetchMock.mockReturnValueOnce(antwort(500, { error: "Interner Serverfehler" })).mockReturnValueOnce(antwort(200, ANTWORT));
    render(<MailTextDialog quelle={QUELLE} onSchliessen={() => {}} />);

    await screen.findByText("Interner Serverfehler");
    fireEvent.click(screen.getByRole("button", { name: "Erneut versuchen" }));

    await screen.findByTitle("Text der E-Mail");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("ein 404 sagt, dass kein Text gespeichert ist", async () => {
    fetchMock.mockReturnValue(antwort(404, { error: "E-Mail nicht gefunden" }));
    render(<MailTextDialog quelle={QUELLE} onSchliessen={() => {}} />);
    await screen.findByText("Zu dieser Mail ist kein Text gespeichert.");
  });

  it("axe findet nichts (geladen und im Fehlerzustand)", async () => {
    fetchMock.mockReturnValue(antwort(200, ANTWORT));
    const { unmount } = render(<MailTextDialog quelle={QUELLE} onSchliessen={() => {}} />);
    await screen.findByTitle("Text der E-Mail");
    expect(await axeVerstoesse(document.body)).toEqual([]);
    unmount();

    fetchMock.mockReturnValue(antwort(500, { error: "Interner Serverfehler" }));
    render(<MailTextDialog quelle={QUELLE} onSchliessen={() => {}} />);
    await screen.findByText("Interner Serverfehler");
    expect(await axeVerstoesse(document.body)).toEqual([]);
  });
});

describe("Reiter „E-Mails“: Knopf und Hinweis je Zeile", () => {
  const ZEILE = {
    zeitpunkt: "2026-10-14T07:12:00.000Z",
    event: "onboarding-created",
    ereignisName: "Einladung Mitarbeiter (Personalfragebogen)",
    status: "SENT",
    statusText: "versendet",
    betreff: "Willkommen",
    empfaenger: "anna@beispiel.invalid",
    cc: null,
    bcc: null,
    grund: null,
    anhang: null,
  };

  const LISTE = {
    eintraege: [
      { ...ZEILE, id: "m1", textVorhanden: true, textHinweis: null },
      {
        ...ZEILE,
        id: "m2",
        status: "SKIPPED",
        statusText: "nicht versendet",
        grund: "E-Mail-Vorlage ist deaktiviert",
        textVorhanden: false,
        textHinweis: "Kein Text: Die Mail wurde nicht erzeugt.",
      },
    ],
    hinweis: "Aus dem Versandprotokoll.",
  };

  it("bietet den Text nur an, wo einer gespeichert ist — sonst steht der Grund da", async () => {
    fetchMock.mockReturnValue(antwort(200, LISTE));
    render(<MailProtokoll modul="onboarding" vorgangId="v1" />);

    await screen.findByText("Kein Text: Die Mail wurde nicht erzeugt.");
    expect(screen.getAllByRole("button", { name: "Text ansehen" })).toHaveLength(1);
  });

  it("oeffnet den Dialog erst auf Klick und laedt die Route dieser Mail", async () => {
    fetchMock.mockImplementation((url: string) =>
      url.endsWith("/text") ? antwort(200, ANTWORT) : antwort(200, LISTE),
    );
    render(<MailProtokoll modul="onboarding" vorgangId="v1" />);
    await screen.findByRole("button", { name: "Text ansehen" });
    expect(fetchMock).toHaveBeenCalledTimes(1); // nur die Liste — der Text kommt nicht mit

    fireEvent.click(screen.getByRole("button", { name: "Text ansehen" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/vorgaenge/onboarding/v1/mails/m1/text", { cache: "no-store" }),
    );
    await screen.findByTitle("Text der E-Mail");
  });
});

describe("MailTextDialog: Hinweis auf ersetzte Links", () => {
  it("zeigt den Kasten nur, wenn der Server einen Hinweis liefert", async () => {
    fetchMock.mockReturnValue(antwort(200, { ...ANTWORT, linkHinweis: null }));
    render(<MailTextDialog quelle={QUELLE} onSchliessen={() => {}} />);
    await screen.findByTitle("Text der E-Mail");
    expect(screen.queryByText("Persönliche Links sind ersetzt")).toBeNull();
  });
});
