/**
 * @jest-environment jsdom
 */

/**
 * Bausteine der Oberflaeche (UX-Umbau „Klarer Weg", U0): Button, Statuspille,
 * Gruppe und Zeile.
 *
 * Geprueft werden die REGELN aus den Kopfkommentaren der Bausteine: was ein
 * gesperrter Knopf durchlaesst, was als leer gilt, was abgeschnitten wuerde,
 * wie die Bereiche heissen. Dazu laeuft axe ueber jede Zusammenstellung
 * (`axeVerstoesse` aus hilfen/axe.ts; Begruendung dort). Farbkontraste rechnet
 * ui-kontrast.test.ts, die Musterseite prueft ui-musterseite.test.tsx.
 */
import { createRef, type ReactNode } from "react";
import { fireEvent, render } from "@testing-library/react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Button, BUTTON_FARBEN, type ButtonVariante } from "@/components/ui/button";
import { Inbox } from "lucide-react";
import { Gruppe, Zeile } from "@/components/ui/gruppe";
import { Leerzustand } from "@/components/ui/leerzustand";
import { Skelett } from "@/components/ui/skelett";
import { STATUS_TOENE, Statuspille, type StatusTon } from "@/components/ui/statuspille";
import { axeVerstoesse } from "../hilfen/axe";

// =============================================
// Button
// =============================================

describe("Button", () => {
  it("ist ohne Angabe ein type=button – er schickt kein Formular ab", () => {
    let abgeschickt = 0;
    const { getByText } = render(
      <form
        onSubmit={(e) => {
          e.preventDefault();
          abgeschickt += 1;
        }}
      >
        <Button>Nur klicken</Button>
        <Button type="submit">Absenden</Button>
      </form>,
    );
    expect(getByText("Nur klicken").getAttribute("type")).toBe("button");
    fireEvent.click(getByText("Nur klicken"));
    expect(abgeschickt).toBe(0);
    fireEvent.click(getByText("Absenden"));
    expect(abgeschickt).toBe(1);
  });

  it("ruft onClick auf und reicht den ref durch", () => {
    const klick = jest.fn();
    const ref = createRef<HTMLButtonElement>();
    const { getByRole } = render(
      <Button ref={ref} onClick={klick}>
        Speichern
      </Button>,
    );
    fireEvent.click(getByRole("button"));
    expect(klick).toHaveBeenCalledTimes(1);
    expect(ref.current).toBe(getByRole("button"));
  });

  it("laedt: aria-disabled und aria-busy, fokussierbar, Text bleibt, Ladesymbol davor, nicht abgeblendet", () => {
    const klick = jest.fn();
    const { getByRole } = render(
      <Button laedt variante="primary" onClick={klick}>
        Wird gesendet …
      </Button>,
    );
    const knopf = getByRole("button") as HTMLButtonElement;
    expect(knopf.getAttribute("aria-disabled")).toBe("true");
    expect(knopf.getAttribute("aria-busy")).toBe("true");
    // NICHT disabled: sonst verloere der Knopf den Fokus, waehrend er laedt.
    expect(knopf.disabled).toBe(false);
    knopf.focus();
    expect(document.activeElement).toBe(knopf);
    fireEvent.click(knopf);
    expect(klick).not.toHaveBeenCalled();
    expect(knopf.textContent).toBe("Wird gesendet …");
    expect(knopf.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    // Der Text ist die Statusmeldung: volle Farben, kein Abblenden, kein Hover.
    expect(knopf.className).not.toContain("opacity-60");
    expect(knopf.className).not.toContain("hover:");
    expect(knopf.className).toContain("bg-action");
  });

  it("laedt verhindert auch das Absenden eines Formulars", () => {
    let abgeschickt = 0;
    const { getByRole } = render(
      <form onSubmit={() => (abgeschickt += 1)}>
        <Button type="submit" laedt>
          Absenden
        </Button>
      </form>,
    );
    fireEvent.click(getByRole("button"));
    expect(abgeschickt).toBe(0);
  });

  it("gesperrt: KEIN Handler laeuft – weder der einer klickbaren Zeile noch pointerdown noch keydown", () => {
    // Befund der Durchsicht: Die Sperre sass nur im eigenen onClick. Der Klick
    // stieg zur Zeile auf (das stopPropagation des uebersprungenen Handlers
    // entfiel), und alle anderen Handler liefen ungebremst.
    const zeile = jest.fn();
    const andere = { onPointerDown: jest.fn(), onMouseDown: jest.fn(), onKeyDown: jest.fn() };
    const eigen = jest.fn((e: { stopPropagation: () => void }) => e.stopPropagation());
    const { getByRole, rerender } = render(
      <div onClick={zeile} onKeyDown={zeile}>
        <Button onClick={eigen} {...andere}>
          Senden
        </Button>
      </div>,
    );
    const knopf = () => getByRole("button");
    fireEvent.click(knopf());
    expect(eigen).toHaveBeenCalledTimes(1);
    expect(zeile).not.toHaveBeenCalled();

    rerender(
      <div onClick={zeile} onKeyDown={zeile}>
        <Button laedt onClick={eigen} {...andere}>
          Senden
        </Button>
      </div>,
    );
    fireEvent.click(knopf());
    fireEvent.pointerDown(knopf());
    fireEvent.mouseDown(knopf());
    fireEvent.keyDown(knopf(), { key: "Enter" });
    fireEvent.keyDown(knopf(), { key: " " });
    expect(eigen).toHaveBeenCalledTimes(1);
    expect(zeile).not.toHaveBeenCalled();
    expect(andere.onPointerDown).not.toHaveBeenCalled();
    expect(andere.onMouseDown).not.toHaveBeenCalled();
    expect(andere.onKeyDown).not.toHaveBeenCalled();
  });

  it("gesperrt haelt Tab nicht auf", () => {
    const aussen = jest.fn();
    const { getByRole } = render(
      <div onKeyDown={aussen}>
        <Button laedt>Senden</Button>
      </div>,
    );
    fireEvent.keyDown(getByRole("button"), { key: "Tab" });
    expect(aussen).toHaveBeenCalledTimes(1);
  });

  it("ein Radix-Menue um einen gesperrten Knopf oeffnet sich nicht", () => {
    // Radix oeffnet ueber onPointerDown und onKeyDown – nicht ueber onClick.
    function Menue({ laedt }: { laedt: boolean }) {
      return (
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <Button laedt={laedt}>Mehr</Button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content>
              <DropdownMenu.Item>Stornieren</DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      );
    }
    const { rerender } = render(<Menue laedt />);
    // Nicht ueber die Rolle suchen: Ein offenes Radix-Menue blendet den Rest
    // der Seite fuer Hilfstechnik aus.
    const knopf = () => document.querySelector('[aria-haspopup="menu"]') as HTMLElement;
    fireEvent.pointerDown(knopf(), { button: 0, ctrlKey: false });
    fireEvent.keyDown(knopf(), { key: "Enter" });
    fireEvent.keyDown(knopf(), { key: "ArrowDown" });
    expect(knopf().getAttribute("aria-expanded")).toBe("false");
    expect(knopf().getAttribute("aria-disabled")).toBe("true");

    // Gegenprobe: ohne Sperre oeffnet derselbe Aufbau.
    rerender(<Menue laedt={false} />);
    fireEvent.keyDown(knopf(), { key: "Enter" });
    expect(knopf().getAttribute("aria-expanded")).toBe("true");
  });

  it("der Zustand gewinnt gegen mitgegebene Attribute – auch gegen ein ausdrueckliches undefined", () => {
    // Befund der Durchsicht: {...rest} stand hinter aria-disabled/aria-busy.
    const { getByText } = render(
      <>
        <Button laedt aria-disabled={undefined} aria-busy={undefined}>
          Eins
        </Button>
        <Button laedt aria-disabled={false}>
          Zwei
        </Button>
      </>,
    );
    for (const text of ["Eins", "Zwei"]) {
      const knopf = getByText(text).closest("button")!;
      expect(knopf.getAttribute("aria-disabled")).toBe("true");
      expect(knopf.getAttribute("aria-busy")).toBe("true");
    }
  });

  it("aria-disabled vom Aufrufer sperrt wirklich – sieht nicht nur so aus", () => {
    const klick = jest.fn();
    let abgeschickt = 0;
    const { getByText } = render(
      <form onSubmit={() => (abgeschickt += 1)}>
        <Button aria-disabled onClick={klick}>
          Klick
        </Button>
        <Button type="submit" aria-disabled="true">
          Absenden
        </Button>
      </form>,
    );
    fireEvent.click(getByText("Klick"));
    fireEvent.click(getByText("Absenden"));
    expect(klick).not.toHaveBeenCalled();
    expect(abgeschickt).toBe(0);
    // Ohne laedt: abgeblendet, aber nicht „beschaeftigt"
    expect(getByText("Klick").className).toContain("opacity-60");
    expect(getByText("Klick").hasAttribute("aria-busy")).toBe(false);
    expect(getByText("Klick").querySelector("svg")).toBeNull();
  });

  it("ohne Sperre stehen weder aria-disabled noch aria-busy im Markup", () => {
    const { getByRole } = render(<Button>Normal</Button>);
    expect(getByRole("button").hasAttribute("aria-disabled")).toBe(false);
    expect(getByRole("button").hasAttribute("aria-busy")).toBe(false);
  });

  it("ein echtes disabled bleibt moeglich und nimmt dem Knopf nicht die Zeigerereignisse", () => {
    // Mit pointer-events:none fiele der Klick auf das Element dahinter –
    // eine klickbare Zeile wuerde navigieren.
    const klick = jest.fn();
    const { getByRole } = render(
      <Button disabled onClick={klick}>
        Gesperrt
      </Button>,
    );
    const knopf = getByRole("button") as HTMLButtonElement;
    expect(knopf.disabled).toBe(true);
    fireEvent.click(knopf);
    expect(klick).not.toHaveBeenCalled();
    expect(knopf.className).not.toContain("pointer-events-none");
    expect(knopf.className).not.toContain("hover:");
  });

  it("jede Variante nutzt genau die Farben aus BUTTON_FARBEN; Vorgabe ist secondary/md", () => {
    const varianten = Object.keys(BUTTON_FARBEN) as ButtonVariante[];
    const { getByText } = render(
      <>
        <Button>Vorgabe</Button>
        {varianten.map((v) => (
          <Button key={v} variante={v} groesse="sm">
            {v}
          </Button>
        ))}
      </>,
    );
    const klassen = (text: string) => getByText(text).className.split(" ");
    for (const k of BUTTON_FARBEN.secondary.ruhe.split(" ")) expect(klassen("Vorgabe")).toContain(k);
    expect(klassen("Vorgabe")).toContain("h-10");
    for (const v of varianten) {
      for (const k of `${BUTTON_FARBEN[v].ruhe} ${BUTTON_FARBEN[v].hover}`.split(" ")) {
        expect(klassen(v)).toContain(k);
      }
      expect(klassen(v)).toContain("h-8");
      // Rand fuer den Windows-Kontrastmodus (dort entfallen Flaechen und Schatten)
      expect(klassen(v)).toContain("border");
      expect(klassen(v)).toContain("border-transparent");
    }
  });

  it("className ergaenzt und ueberschreibt (tailwind-merge)", () => {
    const { getByRole } = render(<Button className="h-12 w-full">Breit</Button>);
    const klassen = getByRole("button").className.split(" ");
    expect(klassen).toContain("w-full");
    expect(klassen).toContain("h-12");
    expect(klassen).not.toContain("h-10");
  });

  it("asChild: ein Verweis sieht aus wie ein Knopf und bleibt ein Verweis ohne type", () => {
    const { getByRole, queryByRole } = render(
      <Button asChild variante="primary">
        <a href="#liste">Zur Liste</a>
      </Button>,
    );
    const verweis = getByRole("link");
    expect(queryByRole("button")).toBeNull();
    expect(verweis.getAttribute("href")).toBe("#liste");
    expect(verweis.hasAttribute("type")).toBe(false);
    expect(verweis.className).toContain("bg-action");
  });

  it("asChild: ein ausdruecklich gesetzter type erreicht das Kind", () => {
    let abgeschickt = 0;
    const { getByText } = render(
      <form
        onSubmit={(e) => {
          e.preventDefault();
          abgeschickt += 1;
        }}
      >
        <Button asChild type="button">
          <button>Nur klicken</button>
        </Button>
      </form>,
    );
    expect(getByText("Nur klicken").getAttribute("type")).toBe("button");
    fireEvent.click(getByText("Nur klicken"));
    expect(abgeschickt).toBe(0);
  });

  it("asChild + disabled: der Verweis ist gesperrt statt nur beschriftet – auch der onClick des Kindes laeuft nicht", () => {
    // `:disabled` trifft nie einen Verweis; das Attribut waere wirkungslos.
    const kind = jest.fn();
    const { getByRole } = render(
      <Button asChild disabled>
        <a href="#ziel" onClick={kind}>
          Bearbeiten
        </a>
      </Button>,
    );
    const verweis = getByRole("link");
    expect(verweis.hasAttribute("disabled")).toBe(false);
    expect(verweis.getAttribute("aria-disabled")).toBe("true");
    expect(verweis.className).toContain("opacity-60");
    // fireEvent liefert false, wenn der Standard (hier: der Sprung) verhindert wurde.
    expect(fireEvent.click(verweis)).toBe(false);
    expect(kind).not.toHaveBeenCalled();
  });

  it("asChild + laedt: der onClick des Kindes laeuft nicht", () => {
    const kind = jest.fn();
    const { getByRole } = render(
      <Button asChild laedt>
        <a href="#ziel" onClick={kind}>
          Öffnen
        </a>
      </Button>,
    );
    expect(fireEvent.click(getByRole("link"))).toBe(false);
    expect(kind).not.toHaveBeenCalled();
  });

  it("axe findet nichts", async () => {
    const { container } = render(
      <main>
        <Button variante="primary">Primär</Button>
        <Button laedt>Wird gesendet …</Button>
        <Button disabled>Gesperrt</Button>
        <Button aria-disabled>Gesperrt, fokussierbar</Button>
        <Button asChild>
          <a href="#liste">Verweis</a>
        </Button>
      </main>,
    );
    expect(await axeVerstoesse(container)).toEqual([]);
  });
});

// =============================================
// Statuspille
// =============================================

describe("Statuspille", () => {
  const TOENE = Object.keys(STATUS_TOENE) as StatusTon[];

  it.each(TOENE)("%s: Text steht im Markup, der Punkt ist nur Zierde, die Farben kommen aus STATUS_TOENE", (ton) => {
    const { container } = render(<Statuspille ton={ton}>Zustand</Statuspille>);
    const pille = container.firstElementChild as HTMLElement;
    expect(pille.textContent).toBe("Zustand");
    expect(pille.getAttribute("data-ton")).toBe(ton);
    const punkt = pille.firstElementChild as HTMLElement;
    expect(punkt.getAttribute("aria-hidden")).toBe("true");
    expect(punkt.textContent).toBe("");
    for (const k of STATUS_TOENE[ton].split(" ")) expect(pille.className.split(" ")).toContain(k);
  });

  it.each<[string, ReactNode]>([
    ["undefined", undefined],
    ["null", null],
    ["leere Zeichenkette", ""],
    ["nur Leerraum", "   "],
    ["false aus a && b", false],
  ])("ohne Text (%s) zeichnet sie nichts – nie eine reine Farbpille", (_name, inhalt) => {
    const { container } = render(<Statuspille ton="critical">{inhalt}</Statuspille>);
    expect(container.innerHTML).toBe("");
  });

  it("langer Text bricht um, statt abgeschnitten zu werden", () => {
    const { container } = render(
      <Statuspille ton="wait">Wartet auf Einstellungsmodalitäten der Führungskraft</Statuspille>,
    );
    const pille = container.firstElementChild as HTMLElement;
    expect(pille.className).not.toContain("whitespace-nowrap");
    expect(pille.className).toContain("max-w-full");
    expect((pille.lastElementChild as HTMLElement).className).toContain("wrap-anywhere");
  });

  it("data-ton laesst sich nicht ueberschreiben", () => {
    const { container } = render(
      <Statuspille ton="ok" {...{ "data-ton": "critical" }}>
        Erledigt
      </Statuspille>,
    );
    expect((container.firstElementChild as HTMLElement).getAttribute("data-ton")).toBe("ok");
  });

  it("axe findet nichts", async () => {
    const { container } = render(
      <main>
        {TOENE.map((ton) => (
          <Statuspille key={ton} ton={ton}>
            {ton}
          </Statuspille>
        ))}
      </main>,
    );
    expect(await axeVerstoesse(container)).toEqual([]);
  });
});

// =============================================
// Gruppe und Zeile
// =============================================

describe("Gruppe und Zeile", () => {
  it("die Beschriftung ist eine h2 und benennt die Gruppe", () => {
    const { getByRole } = render(
      <Gruppe titel="Vertrag">
        <Zeile label="Beginn">01.02.2027</Zeile>
      </Gruppe>,
    );
    const ueberschrift = getByRole("heading", { level: 2 });
    expect(ueberschrift.textContent).toBe("Vertrag");
    expect(getByRole("region").getAttribute("aria-labelledby")).toBe(ueberschrift.id);
    // Schriftskala des Plans: 11 px, Versalien, Laufweite +6 %
    for (const k of ["text-2xs", "uppercase", "tracking-label", "text-ink-2"]) {
      expect(ueberschrift.className.split(" ")).toContain(k);
    }
  });

  it("die Ueberschriften-Ebene ist waehlbar", () => {
    const { getByRole } = render(
      <Gruppe titel="Person" ebene={3}>
        <Zeile>Inhalt</Zeile>
      </Gruppe>,
    );
    expect(getByRole("heading", { level: 3 }).textContent).toBe("Person");
  });

  it("zwei Gruppen bekommen verschiedene Kennungen", () => {
    const { getAllByRole } = render(
      <>
        <Gruppe titel="Eins">
          <Zeile>a</Zeile>
        </Gruppe>
        <Gruppe titel="Zwei">
          <Zeile>b</Zeile>
        </Gruppe>
      </>,
    );
    const [eins, zwei] = getAllByRole("heading");
    expect(eins.id).not.toBe("");
    expect(eins.id).not.toBe(zwei.id);
  });

  it("ohne Titel gibt es weder Ueberschrift noch einen unbenannten Bereich", () => {
    const { queryByRole, container } = render(
      <Gruppe>
        <Zeile>Inhalt</Zeile>
      </Gruppe>,
    );
    expect(queryByRole("heading")).toBeNull();
    expect(container.querySelector("section")?.hasAttribute("aria-labelledby")).toBe(false);
  });

  it("die Beschreibung erscheint auch ohne Titel und ohne Aktion", () => {
    // Befund der Durchsicht: Sie wurde dann stillschweigend verworfen.
    const { getByText } = render(
      <Gruppe beschreibung="Angaben der Führungskraft">
        <Zeile>Inhalt</Zeile>
      </Gruppe>,
    );
    expect(getByText("Angaben der Führungskraft")).not.toBeNull();
  });

  it("der Kopf ist mit und ohne Aktion gleich hoch", () => {
    const { container } = render(
      <>
        <Gruppe titel="Mit" aktion={<Button groesse="sm">Ändern</Button>}>
          <Zeile>a</Zeile>
        </Gruppe>
        <Gruppe titel="Ohne">
          <Zeile>b</Zeile>
        </Gruppe>
      </>,
    );
    const koepfe = Array.from(container.querySelectorAll("section > div:first-child"));
    expect(koepfe).toHaveLength(2);
    for (const k of koepfe) expect(k.className.split(" ")).toContain("min-h-8");
  });

  it("ein mitgegebenes aria-labelledby={undefined} nimmt der Gruppe nicht ihren Namen; ein gesetztes gewinnt", () => {
    const { getAllByRole } = render(
      <>
        <Gruppe titel="Vertrag" aria-labelledby={undefined}>
          <Zeile>a</Zeile>
        </Gruppe>
        <span id="fremd">Fremder Name</span>
        <Gruppe titel="Person" aria-labelledby="fremd">
          <Zeile>b</Zeile>
        </Gruppe>
      </>,
    );
    const [vertrag, person] = getAllByRole("region");
    expect(vertrag.getAttribute("aria-labelledby")).toBe(vertrag.querySelector("h2")!.id);
    expect(person.getAttribute("aria-labelledby")).toBe("fremd");
  });

  it.each<[string, ReactNode, string]>([
    ["Text", "Berufskolleg", "Berufskolleg"],
    ["kein Kind", undefined, "—"],
    ["null", null, "—"],
    ["leere Zeichenkette", "", "—"],
    ["nur Leerraum", "   ", "—"],
    ["false aus a && b", false, "—"],
    ["leere Liste", [], "—"],
    ["Liste aus Leerem", [null, undefined, " "], "—"],
    ["0 ist ein Wert", 0, "0"],
    ["Element", <b key="b">fett</b>, "fett"],
  ])("Zeile mit label, Wert %s", (_name, inhalt, erwartet) => {
    const { container } = render(
      <Gruppe titel="Person">
        <Zeile label="Feld">{inhalt}</Zeile>
      </Gruppe>,
    );
    const zeile = container.querySelector("section > div:last-child > div") as HTMLElement;
    expect(Array.from(zeile.children).map((k) => k.textContent)).toEqual(["Feld", erwartet]);
  });

  it("Zeile ohne label gehoert die ganze Breite – kein Strich, keine zweite Spalte", () => {
    const { container } = render(
      <Gruppe titel="Liste">
        <Zeile>
          <span>Frei</span>
        </Zeile>
      </Gruppe>,
    );
    const zeile = container.querySelector("section > div:last-child > div") as HTMLElement;
    expect(zeile.children).toHaveLength(1);
    expect(zeile.textContent).toBe("Frei");
  });

  it("nichts wird abgeschnitten: Wert und Beschriftung brechen um, die Gruppe hat kein overflow-hidden", () => {
    // Befund der Durchsicht: Die Beschriftung schrumpfte nie, der Wert auf 0;
    // eine IBAN oder ein Datum verschwand ohne Hinweis hinter der Kante.
    const { container } = render(
      <Gruppe titel="Bank">
        <Zeile label="Voraussichtliches Ende der Zweckbefristung (Vertretung)">
          DE89370400440532013000COBADEFFXXX
        </Zeile>
      </Gruppe>,
    );
    const flaeche = container.querySelector("section > div:last-child") as HTMLElement;
    expect(flaeche.className).not.toContain("overflow-hidden");
    const [beschriftung, wert] = Array.from(flaeche.firstElementChild!.children) as HTMLElement[];
    for (const el of [beschriftung, wert]) {
      expect(el.className.split(" ")).toContain("wrap-anywhere");
      expect(el.className.split(" ")).toContain("min-w-0");
      expect(el.className).not.toContain("shrink-0");
    }
    expect(beschriftung.className).toContain("max-w-[50%]");
  });

  it("Beschriftungen nutzen ink-2, nie ink-3", () => {
    const { container } = render(
      <Gruppe titel="Vertrag" beschreibung="Satz">
        <Zeile label="Beginn">01.02.2027</Zeile>
      </Gruppe>,
    );
    expect(container.innerHTML).toContain("text-ink-2");
    expect(container.innerHTML).not.toContain("ink-3");
  });

  it("axe findet nichts – Gruppen direkt unter dem Seitentitel", async () => {
    // Ohne eingeschobene Zwischenueberschrift: So steht die Gruppe auf der
    // Seite. (Eine Fixture mit <h2> davor verdeckte frueher, dass die Vorgabe
    // h3 unter einem h1 die Ueberschriften-Reihenfolge verletzt.)
    const { container } = render(
      <main>
        <h1>Seite</h1>
        <Gruppe titel="Vertrag" beschreibung="Angaben" aktion={<Button groesse="sm">Ändern</Button>}>
          <Zeile label="Beginn">01.02.2027</Zeile>
          <Zeile label="Personalnummer" />
        </Gruppe>
        <Gruppe titel="Liste">
          <Zeile>
            <Statuspille ton="wait">Wartet</Statuspille>
          </Zeile>
        </Gruppe>
      </main>,
    );
    expect(await axeVerstoesse(container)).toEqual([]);
  });

  it("der axe-Lauf erkennt eine uebersprungene Ebene – der Helfer nennt Regel und Knoten", async () => {
    // Gegenprobe: Der Lauf oben ist nicht deshalb gruen, weil axe nichts prueft.
    const { container } = render(
      <main>
        <h1>Seite</h1>
        <Gruppe titel="Zu tief" ebene={4}>
          <Zeile>a</Zeile>
        </Gruppe>
      </main>,
    );
    const verstoesse = await axeVerstoesse(container);
    expect(verstoesse).toHaveLength(1);
    expect(verstoesse[0]).toContain("heading-order");
    expect(verstoesse[0]).toContain("<h4");
  });
});

// =============================================
// Skelett
// =============================================

describe("Skelett", () => {
  it("meldet Screenreadern EINEN Satz; die Balken sind Zierde", async () => {
    const { container, getByRole } = render(
      <main>
        <h1>Seite</h1>
        <Skelett zeilen={4} label="Vorgänge werden geladen" />
      </main>,
    );
    const bereich = getByRole("status");
    expect(bereich.getAttribute("aria-busy")).toBe("true");
    expect(bereich.textContent).toBe("Vorgänge werden geladen");
    // Alles ausser dem Satz ist verborgen.
    for (const kind of Array.from(bereich.children)) {
      if (kind.textContent === "") expect(kind.getAttribute("aria-hidden")).toBe("true");
    }
    expect(await axeVerstoesse(container)).toEqual([]);
  });

  it("zeichnet so viele Zeilen wie verlangt – mindestens eine, Vorgabe drei", () => {
    const zeilen = (el: HTMLElement) => el.querySelector("[aria-hidden].divide-y")!.children.length;
    expect(zeilen(render(<Skelett />).container)).toBe(3);
    expect(zeilen(render(<Skelett zeilen={7} />).container)).toBe(7);
    expect(zeilen(render(<Skelett zeilen={0} />).container)).toBe(1);
    expect(zeilen(render(<Skelett zeilen={2.9} />).container)).toBe(2);
  });

  it("hat die Form der Gruppe: dieselbe Flaeche, Haarlinien und Zeilenabstaende", () => {
    const skelett = render(<Skelett art="gruppe" />).container.querySelector("[aria-hidden].divide-y")!;
    const gruppe = render(
      <Gruppe>
        <Zeile label="a">b</Zeile>
      </Gruppe>,
    ).container.querySelector(".divide-y")!;
    expect(skelett.className).toBe(gruppe.className);
    for (const k of ["px-4", "py-3"]) {
      expect(skelett.firstElementChild!.className).toContain(k);
      expect(gruppe.firstElementChild!.className).toContain(k);
    }
  });

  it("liste und gruppe unterscheiden sich; mitTitel haelt den Platz des Gruppentitels frei", () => {
    const liste = render(<Skelett art="liste" />).container;
    const gruppe = render(<Skelett art="gruppe" mitTitel />).container;
    expect(liste.querySelector('[data-skelett="liste"] .rounded-full')).not.toBeNull();
    expect(gruppe.querySelector('[data-skelett="gruppe"] .rounded-full')).toBeNull();
    expect(liste.querySelector(".min-h-8")).toBeNull();
    expect(gruppe.querySelector(".min-h-8")).not.toBeNull();
  });

  it("pulsiert nur, wenn Bewegung erlaubt ist, und zeichnet jedes Mal dasselbe", () => {
    const a = render(<Skelett zeilen={5} />).container.innerHTML;
    const b = render(<Skelett zeilen={5} />).container.innerHTML;
    expect(a).toBe(b);
    expect(a).toContain("motion-safe:animate-pulse");
    expect(a).not.toMatch(/[\s"]animate-pulse/);
  });
});

// =============================================
// Leerzustand
// =============================================

describe("Leerzustand", () => {
  it("zeigt Titel, Satz und Knopf; das Symbol ist Zierde, der Titel keine Ueberschrift", async () => {
    const { container, getByText, getByRole, queryByRole } = render(
      <main>
        <h1>Seite</h1>
        <Gruppe titel="Aufgaben">
          <Leerzustand symbol={Inbox} titel="Keine offenen Aufgaben" aktion={<Button>Neuen Vorgang anlegen</Button>}>
            Sobald eine Abteilung etwas zurückmeldet, steht es hier.
          </Leerzustand>
        </Gruppe>
      </main>,
    );
    expect(getByText("Keine offenen Aufgaben").tagName).toBe("P");
    expect(queryByRole("heading", { name: "Keine offenen Aufgaben" })).toBeNull();
    expect(getByText("Sobald eine Abteilung etwas zurückmeldet, steht es hier.")).toBeTruthy();
    expect(getByRole("button", { name: "Neuen Vorgang anlegen" })).toBeTruthy();
    expect(container.querySelector("[data-leerzustand] svg")!.closest("[aria-hidden]")).not.toBeNull();
    expect(await axeVerstoesse(container)).toEqual([]);
  });

  it("ohne Satz und ohne Knopf bleibt nur der Titel", () => {
    const { container } = render(<Leerzustand symbol={Inbox} titel="Keine Dokumente" />);
    const bereich = container.querySelector("[data-leerzustand]")!;
    expect(bereich.querySelectorAll("p")).toHaveLength(1);
    expect(bereich.querySelector("button")).toBeNull();
  });

  it("mitFlaeche gibt die weisse Flaeche der Gruppe; Klassen und Attribute erreichen den Bereich", () => {
    const { container } = render(<Leerzustand symbol={Inbox} titel="Leer" mitFlaeche className="py-4" data-test="x" />);
    const bereich = container.querySelector("[data-leerzustand]")!;
    expect(bereich.className).toContain("bg-card");
    expect(bereich.className).toContain("py-4");
    expect(bereich.className).not.toContain("py-10");
    expect(bereich.getAttribute("data-test")).toBe("x");
    const ohne = render(<Leerzustand symbol={Inbox} titel="Leer" />).container.querySelector("[data-leerzustand]")!;
    expect(ohne.className).not.toContain("bg-card");
  });

  it("nutzt ink-3 nirgends als Textfarbe und kein Emoji", () => {
    const { container } = render(
      <Leerzustand symbol={Inbox} titel="Keine offenen Aufgaben">
        Satz
      </Leerzustand>,
    );
    expect(container.innerHTML).not.toMatch(/\btext-ink-3\b/);
    expect(container.textContent).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});
