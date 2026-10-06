/**
 * @jest-environment jsdom
 */

/**
 * Bausteine Hinweis und Textfeld (UX-Umbau, Pilot Vertragsende, Tag 3).
 *
 * Geprueft werden die Regeln aus den Kopfkommentaren: wann ein Hinweis
 * angesagt wird, dass er ohne Titel nichts zeichnet, wie Hilfe und Fehler am
 * Feld haengen, dass das Markup die Farbtabellen benutzt (gerechnet werden sie
 * in ui-kontrast.test.ts). Dazu axe ueber jede Zusammenstellung.
 */
import "@testing-library/jest-dom";
import { createRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { Users } from "lucide-react";
import { HINWEIS_TOENE, Hinweis, type HinweisTon } from "@/components/ui/hinweis";
import { TEXTFELD_FARBEN, Textfeld } from "@/components/ui/textfeld";
import { axeVerstoesse } from "../hilfen/axe";

const TOENE = Object.keys(HINWEIS_TOENE) as HinweisTon[];

// =============================================
// Hinweis
// =============================================

describe("Hinweis", () => {
  it.each(TOENE)("%s: Bereich mit Ueberschrift, benannt nach dem Titel, nicht angesagt", async (ton) => {
    const { container } = render(
      <main>
        <h1>Vorgang</h1>
        <Hinweis ton={ton} titel="Vertragsende überschritten">
          Der Vorgang ist noch offen.
        </Hinweis>
      </main>,
    );
    const bereich = screen.getByRole("region", { name: "Vertragsende überschritten" });
    expect(bereich).not.toHaveAttribute("role");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("heading", { level: 2, name: "Vertragsende überschritten" })).toBeInTheDocument();
    expect(bereich).toHaveTextContent("Der Vorgang ist noch offen.");
    expect(await axeVerstoesse(container)).toEqual([]);
  });

  it("critical mit ansagen ist ein Alarm – er wird sofort vorgelesen", async () => {
    const { container } = render(
      <main>
        <h1>Vorgang</h1>
        <Hinweis ton="critical" ansagen titel="Speichern fehlgeschlagen">
          Die Eingaben sind noch da.
        </Hinweis>
      </main>,
    );
    const alarm = screen.getByRole("alert");
    expect(alarm).toHaveTextContent("Speichern fehlgeschlagen");
    expect(alarm).not.toHaveAttribute("aria-labelledby");
    expect(await axeVerstoesse(container)).toEqual([]);
  });

  it.each(["wait", "info"] as const)("%s mit ansagen bleibt still (nur Kritisches unterbricht)", (ton) => {
    render(<Hinweis ton={ton} ansagen titel="Frist naht" />);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("region", { name: "Frist naht" })).toBeInTheDocument();
  });

  it.each(["", "   "])("ohne Titel (%j) zeichnet er nichts – ein farbiger Kasten ohne Aussage waere nur Farbe", (titel) => {
    const { container } = render(
      <Hinweis ton="critical" titel={titel}>
        Text
      </Hinweis>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("ebene setzt die Ueberschrift tiefer; axe meldet keinen Sprung", async () => {
    const { container } = render(
      <main>
        <h1>Seite</h1>
        <h2>Abschnitt</h2>
        <Hinweis ton="info" ebene={3} titel="Zur Kenntnis" />
      </main>,
    );
    expect(screen.getByRole("heading", { level: 3, name: "Zur Kenntnis" })).toBeInTheDocument();
    expect(await axeVerstoesse(container)).toEqual([]);
  });

  it.each(TOENE)("%s: Farben aus HINWEIS_TOENE, Symbol ist Zierde, Rand fuer den Kontrastmodus", (ton) => {
    const { container } = render(<Hinweis ton={ton} titel="Titel" />);
    const bereich = container.firstElementChild as HTMLElement;
    for (const klasse of [HINWEIS_TOENE[ton].flaeche, HINWEIS_TOENE[ton].text]) {
      expect(bereich.className.split(/\s+/)).toContain(klasse);
    }
    expect(bereich).toHaveAttribute("data-ton", ton);
    expect(bereich.className).toMatch(/\bborder\b/);
    const symbol = bereich.querySelector("svg")!;
    expect(symbol).toHaveAttribute("aria-hidden", "true");
    expect(symbol.getAttribute("class")).toContain(HINWEIS_TOENE[ton].symbol);
  });

  it("jeder Ton hat ein eigenes Standardsymbol – die Form unterscheidet, nicht nur die Farbe", () => {
    const symbole = TOENE.map((ton) => HINWEIS_TOENE[ton].standard);
    expect(new Set(symbole).size).toBe(TOENE.length);
  });

  it("ein eigenes Symbol ersetzt das des Tons", () => {
    const { container } = render(<Hinweis ton="info" symbol={Users} titel="Weitere Einstellungen" />);
    expect(container.querySelector("svg")!.getAttribute("class")).toContain("lucide-users");
  });

  it("der Knopf steht im Hinweis und ist erreichbar", async () => {
    const geklickt = jest.fn();
    const { container } = render(
      <main>
        <h1>Vorgang</h1>
        <Hinweis ton="wait" titel="Anfrage offen" aktion={<button onClick={geklickt}>Anfrage senden</button>}>
          Die Führungskraft hat noch keinen Link.
        </Hinweis>
      </main>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Anfrage senden" }));
    expect(geklickt).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("region", { name: "Anfrage offen" })).toContainElement(
      screen.getByRole("button", { name: "Anfrage senden" }),
    );
    expect(await axeVerstoesse(container)).toEqual([]);
  });

  it("zwei Hinweise bekommen verschiedene Kennungen", () => {
    render(
      <>
        <Hinweis ton="info" titel="Erster" />
        <Hinweis ton="info" titel="Zweiter" />
      </>,
    );
    expect(screen.getByRole("region", { name: "Erster" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Zweiter" })).toBeInTheDocument();
  });
});

// =============================================
// Textfeld
// =============================================

describe("Textfeld", () => {
  it("die Beschriftung benennt das Feld und steht sichtbar darueber", async () => {
    const { container } = render(<Textfeld label="E-Mail der Führungskraft" type="email" />);
    const feld = screen.getByRole("textbox", { name: "E-Mail der Führungskraft" });
    expect(feld).toHaveAttribute("type", "email");
    expect(container.querySelector("label")).toHaveTextContent("E-Mail der Führungskraft");
    expect(feld).not.toHaveAttribute("aria-describedby");
    expect(feld).not.toHaveAttribute("aria-invalid");
    expect(await axeVerstoesse(container)).toEqual([]);
  });

  it("ohne Angabe ist es ein Textfeld", () => {
    render(<Textfeld label="Bemerkung" />);
    expect(screen.getByRole("textbox", { name: "Bemerkung" })).toHaveAttribute("type", "text");
  });

  it("Hilfe und Fehler haengen am Feld – erst die Hilfe, dann der Fehler", async () => {
    const { container } = render(
      <Textfeld label="E-Mail" hilfe="An diese Adresse geht der Link." fehler="Bitte eine vollständige Adresse eingeben." />,
    );
    const feld = screen.getByRole("textbox", { name: "E-Mail" });
    expect(feld).toHaveAttribute("aria-invalid", "true");
    expect(feld).toHaveAccessibleDescription("An diese Adresse geht der Link. Bitte eine vollständige Adresse eingeben.");
    expect(await axeVerstoesse(container)).toEqual([]);
  });

  it("eine eigene aria-describedby des Aufrufers kommt dazu, statt verloren zu gehen", () => {
    render(
      <>
        <p id="extra">Wird nicht gespeichert.</p>
        <Textfeld label="Notiz" hilfe="Nur für HR." aria-describedby="extra" />
      </>,
    );
    expect(screen.getByRole("textbox", { name: "Notiz" })).toHaveAccessibleDescription(
      "Nur für HR. Wird nicht gespeichert.",
    );
  });

  it.each(["", "  "])("ein leerer Fehler (%j) ist keiner", (fehler) => {
    render(<Textfeld label="E-Mail" fehler={fehler} />);
    const feld = screen.getByRole("textbox", { name: "E-Mail" });
    expect(feld).not.toHaveAttribute("aria-invalid");
    expect(feld).not.toHaveAttribute("aria-describedby");
    expect(feld.className.split(/\s+/)).not.toContain(TEXTFELD_FARBEN.fehlerRand);
  });

  it("der Fehler steht als Text da und faerbt den Rand – nie nur Farbe", () => {
    const { container } = render(<Textfeld label="Personalnummer" fehler="Nur Ziffern." />);
    const feld = screen.getByRole("textbox", { name: "Personalnummer" });
    expect(screen.getByText("Nur Ziffern.")).toBeInTheDocument();
    const klassen = feld.className.split(/\s+/);
    expect(klassen).toContain(TEXTFELD_FARBEN.fehlerRand);
    // Der Rand in Ruhe weicht dem des Fehlers (cn/tailwind-merge).
    expect(klassen).not.toContain("border-ink-2");
    const fehlerZeile = container.querySelector(`#${CSS.escape(feld.id)}-fehler`)!;
    expect(fehlerZeile.className).toContain(TEXTFELD_FARBEN.fehler);
    expect(fehlerZeile.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("das Markup benutzt TEXTFELD_FARBEN", () => {
    const { container } = render(<Textfeld label="Name" hilfe="Wie im Ausweis." />);
    const feld = screen.getByRole("textbox", { name: "Name" });
    for (const klasse of [...TEXTFELD_FARBEN.feld.split(" "), ...TEXTFELD_FARBEN.gesperrt.split(" ")]) {
      expect(feld.className.split(/\s+/)).toContain(klasse);
    }
    expect(container.querySelector("label")!.className).toContain(TEXTFELD_FARBEN.beschriftung);
    expect(screen.getByText("Wie im Ausweis.").className).toContain(TEXTFELD_FARBEN.hilfe);
  });

  it("id, Wert, Aenderung, ref und data-autofokus gehen an das Feld; className an die Huelle", () => {
    const aenderung = jest.fn();
    const ref = createRef<HTMLInputElement>();
    const { container } = render(
      <Textfeld
        label="E-Mail"
        id="adresse"
        value="a@b.de"
        onChange={aenderung}
        ref={ref}
        data-autofokus=""
        className="max-w-sm"
      />,
    );
    const feld = screen.getByRole("textbox", { name: "E-Mail" });
    expect(feld).toHaveAttribute("id", "adresse");
    expect(feld).toHaveValue("a@b.de");
    expect(feld).toHaveAttribute("data-autofokus");
    expect(ref.current).toBe(feld);
    fireEvent.change(feld, { target: { value: "x@y.de" } });
    expect(aenderung).toHaveBeenCalledTimes(1);
    expect((container.firstElementChild as HTMLElement).className).toContain("max-w-sm");
    expect(feld.className).not.toContain("max-w-sm");
  });

  it("zwei Felder ohne id bekommen verschiedene Kennungen – die Beschriftung trifft das richtige", () => {
    render(
      <>
        <Textfeld label="Vorname" fehler="Fehlt." />
        <Textfeld label="Nachname" fehler="Zu lang." />
      </>,
    );
    expect(screen.getByRole("textbox", { name: "Vorname" })).toHaveAccessibleDescription("Fehlt.");
    expect(screen.getByRole("textbox", { name: "Nachname" })).toHaveAccessibleDescription("Zu lang.");
  });

  it("gesperrt bleibt das Feld mit Beschriftung sichtbar", async () => {
    const { container } = render(<Textfeld label="Vorgangsnummer" defaultValue="VE-2026-BK-0007" disabled />);
    expect(screen.getByRole("textbox", { name: "Vorgangsnummer" })).toBeDisabled();
    expect(await axeVerstoesse(container)).toEqual([]);
  });
});
