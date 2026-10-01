/**
 * @jest-environment jsdom
 */

/**
 * Bausteine der Oberflaeche (UX-Umbau „Klarer Weg", U0): Button, Statuspille,
 * Gruppe und Zeile.
 *
 * Geprueft werden die REGELN, die in den Kopfkommentaren der Bausteine stehen —
 * nicht ihr Aussehen. Dazu laeuft axe ueber jede Zusammenstellung (Rollen,
 * Namen, ARIA). Farbkontraste kann axe in jsdom nicht messen; die rechnet
 * ui-kontrast.test.ts.
 *
 * Umgebung wie in den uebrigen Komponententests: jsdom im Docblock, ohne
 * @testing-library/jest-dom. jest-axe wird je Datei eingebunden (kein
 * setupFilesAfterEnv), deshalb `violations` statt `toHaveNoViolations()`.
 */
import { createRef } from "react";
import { fireEvent, render } from "@testing-library/react";
import { axe } from "jest-axe";
import { Button } from "@/components/ui/button";
import { Gruppe, Zeile } from "@/components/ui/gruppe";
import { Statuspille, type StatusTon } from "@/components/ui/statuspille";

async function verstoesse(container: Element): Promise<string[]> {
  const ergebnis = await axe(container);
  return ergebnis.violations.map((v) => `${v.id}: ${v.help}`);
}

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

  it("laedt: gesperrt ueber aria-disabled, bleibt fokussierbar, Klick tut nichts, Text bleibt", () => {
    const klick = jest.fn();
    const { getByRole } = render(
      <Button laedt onClick={klick}>
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

  it("ohne laedt stehen weder aria-disabled noch aria-busy im Markup", () => {
    const { getByRole } = render(<Button>Normal</Button>);
    expect(getByRole("button").hasAttribute("aria-disabled")).toBe(false);
    expect(getByRole("button").hasAttribute("aria-busy")).toBe(false);
  });

  it("ein echtes disabled bleibt moeglich", () => {
    const klick = jest.fn();
    const { getByRole } = render(
      <Button disabled onClick={klick}>
        Gesperrt
      </Button>,
    );
    expect((getByRole("button") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(getByRole("button"));
    expect(klick).not.toHaveBeenCalled();
  });

  it("Varianten und Groessen nutzen nur Tokens, die Vorgabe ist sekundaer/md", () => {
    const { getByText } = render(
      <>
        <Button>Vorgabe</Button>
        <Button variante="primary">Primär</Button>
        <Button variante="ghost" groesse="sm">
          Klein
        </Button>
        <Button variante="critical">Löschen</Button>
      </>,
    );
    expect(getByText("Vorgabe").className).toContain("bg-card");
    expect(getByText("Vorgabe").className).toContain("h-10");
    expect(getByText("Primär").className).toContain("bg-action");
    expect(getByText("Klein").className).toContain("h-8");
    expect(getByText("Löschen").className).toContain("bg-critical");
    for (const text of ["Vorgabe", "Primär", "Klein", "Löschen"]) {
      expect(getByText(text).className).not.toMatch(/#[0-9a-fA-F]{3,8}/);
    }
  });

  it("className ergaenzt und ueberschreibt (tailwind-merge)", () => {
    const { getByRole } = render(<Button className="h-12 w-full">Breit</Button>);
    const klassen = getByRole("button").className.split(" ");
    expect(klassen).toContain("w-full");
    expect(klassen).toContain("h-12");
    expect(klassen).not.toContain("h-10");
  });

  it("asChild: ein Verweis sieht aus wie ein Knopf, bleibt aber ein Verweis ohne type", () => {
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

  it("axe findet nichts", async () => {
    const { container } = render(
      <main>
        <Button variante="primary">Primär</Button>
        <Button laedt>Wird gesendet …</Button>
        <Button disabled>Gesperrt</Button>
        <Button asChild>
          <a href="#liste">Verweis</a>
        </Button>
      </main>,
    );
    expect(await verstoesse(container)).toEqual([]);
  });
});

// =============================================
// Statuspille
// =============================================

describe("Statuspille", () => {
  const TOENE: StatusTon[] = ["ok", "wait", "critical", "info", "neutral"];

  it.each(TOENE)("%s: Text steht im Markup, der Punkt ist nur Zierde", (ton) => {
    const { container } = render(<Statuspille ton={ton}>Zustand</Statuspille>);
    const pille = container.firstElementChild as HTMLElement;
    expect(pille.textContent).toBe("Zustand");
    expect(pille.getAttribute("data-ton")).toBe(ton);
    const punkt = pille.firstElementChild as HTMLElement;
    expect(punkt.getAttribute("aria-hidden")).toBe("true");
    expect(punkt.textContent).toBe("");
  });

  it("jeder Ton nimmt Text- und Grundfarbe aus demselben Token-Paar", () => {
    for (const ton of TOENE) {
      const { container, unmount } = render(<Statuspille ton={ton}>x</Statuspille>);
      const klassen = (container.firstElementChild as HTMLElement).className;
      if (ton === "neutral") {
        expect(klassen).toContain("bg-neutral-soft");
        expect(klassen).toContain("text-ink-2");
      } else {
        expect(klassen).toContain(`bg-${ton}-soft`);
        expect(klassen).toContain(`text-${ton}`);
      }
      unmount();
    }
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
    expect(await verstoesse(container)).toEqual([]);
  });
});

// =============================================
// Gruppe und Zeile
// =============================================

describe("Gruppe und Zeile", () => {
  it("die Beschriftung ist eine Ueberschrift und benennt die Gruppe", () => {
    const { getByRole } = render(
      <Gruppe titel="Vertrag">
        <Zeile label="Beginn">01.02.2027</Zeile>
      </Gruppe>,
    );
    const ueberschrift = getByRole("heading", { level: 3 });
    expect(ueberschrift.textContent).toBe("Vertrag");
    const bereich = getByRole("region");
    expect(bereich.getAttribute("aria-labelledby")).toBe(ueberschrift.id);
  });

  it("die Ueberschriften-Ebene ist waehlbar", () => {
    const { getByRole } = render(
      <Gruppe titel="Person" ebene={2}>
        <Zeile>Inhalt</Zeile>
      </Gruppe>,
    );
    expect(getByRole("heading", { level: 2 }).textContent).toBe("Person");
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

  it("zeigt Beschreibung und Aktion neben der Beschriftung", () => {
    const { getByText, getByRole } = render(
      <Gruppe titel="Vertrag" beschreibung="Angaben der Führungskraft" aktion={<Button groesse="sm">Ändern</Button>}>
        <Zeile>Inhalt</Zeile>
      </Gruppe>,
    );
    expect(getByText("Angaben der Führungskraft")).not.toBeNull();
    expect(getByRole("button").textContent).toBe("Ändern");
  });

  it("Zeile mit label: Beschriftung und Wert; ein leerer Wert bleibt als Strich sichtbar", () => {
    const { container } = render(
      <Gruppe titel="Person">
        <Zeile label="Einrichtung">Berufskolleg</Zeile>
        <Zeile label="Personalnummer" />
        <Zeile label="Hinweis">{""}</Zeile>
        <Zeile label="Kinder">{0}</Zeile>
      </Gruppe>,
    );
    const zeilen = Array.from(container.querySelectorAll("section > div:last-child > div")).map((z) =>
      Array.from(z.children).map((k) => k.textContent),
    );
    expect(zeilen).toEqual([
      ["Einrichtung", "Berufskolleg"],
      ["Personalnummer", "—"],
      ["Hinweis", "—"],
      // 0 ist ein Wert, kein leeres Feld.
      ["Kinder", "0"],
    ]);
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

  it("Beschriftungen nutzen ink-2, nie ink-3", () => {
    const { container } = render(
      <Gruppe titel="Vertrag" beschreibung="Satz">
        <Zeile label="Beginn">01.02.2027</Zeile>
      </Gruppe>,
    );
    expect(container.innerHTML).toContain("text-ink-2");
    expect(container.innerHTML).not.toContain("ink-3");
  });

  it("axe findet nichts", async () => {
    const { container } = render(
      <main>
        <h1>Seite</h1>
        <h2>Abschnitt</h2>
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
    expect(await verstoesse(container)).toEqual([]);
  });
});
