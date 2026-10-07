/**
 * @jest-environment jsdom
 */

/**
 * Baustein Textverweis (UX-Umbau, Pilot Vertragsende).
 *
 * Geprueft werden die Regeln aus dem Kopfkommentar: intern ueber `next/link`,
 * extern (`mailto:`, `https:`, `//host`) als einfaches `<a>`, Klassen und
 * weitere Angaben kommen an, axe findet nichts. `next/link` ist ersetzt und
 * markiert sein `<a>` — so ist zu sehen, welcher Weg gewaehlt wurde.
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { Textverweis } from "@/components/ui/textverweis";
import { axeVerstoesse } from "../hilfen/axe";

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a data-next-link="" href={href} {...rest}>
      {children}
    </a>
  ),
}));

describe("Textverweis", () => {
  it("intern (/…): über next/link, mit Adresse und Text", async () => {
    const { container } = render(
      <p>
        Weiter <Textverweis href="/vorgaenge/vertragsende">zur Liste</Textverweis>.
      </p>,
    );
    const verweis = screen.getByRole("link", { name: "zur Liste" });
    expect(verweis).toHaveAttribute("href", "/vorgaenge/vertragsende");
    expect(verweis).toHaveAttribute("data-next-link");
    expect(await axeVerstoesse(container)).toEqual([]);
  });

  it.each([
    "mailto:name@beispiel.invalid?subject=R%C3%BCckmeldung",
    "https://example.org/hilfe",
    "//example.org/hilfe",
  ])("extern (%s): ein einfaches <a>, nicht der Router", async (href) => {
    const { container } = render(
      <p>
        <Textverweis href={href}>Rückmeldung geben</Textverweis>
      </p>,
    );
    const verweis = screen.getByRole("link", { name: "Rückmeldung geben" });
    expect(verweis.tagName).toBe("A");
    expect(verweis).toHaveAttribute("href", href);
    expect(verweis).not.toHaveAttribute("data-next-link");
    expect(await axeVerstoesse(container)).toEqual([]);
  });

  it("unterstrichen in ink, mit dem Fokusring der Bausteine — intern wie extern gleich", () => {
    render(
      <>
        <Textverweis href="/vorgaenge">Intern</Textverweis>
        <Textverweis href="mailto:a@beispiel.invalid">Extern</Textverweis>
      </>,
    );
    const intern = screen.getByRole("link", { name: "Intern" });
    const extern = screen.getByRole("link", { name: "Extern" });
    for (const klasse of ["text-ink", "underline", "hover:no-underline", "focus-visible:outline-action"]) {
      expect(intern.className.split(/\s+/)).toContain(klasse);
    }
    expect(extern.className).toBe(intern.className);
    expect(intern.className).not.toMatch(/\btext-ink-3\b/);
  });

  it("className kommt dazu, weitere Angaben gehen an das Element", () => {
    render(
      <Textverweis href="https://example.org" className="font-semibold" target="_blank" rel="noopener noreferrer" aria-describedby="x">
        Hilfe
      </Textverweis>,
    );
    const verweis = screen.getByRole("link", { name: "Hilfe" });
    const klassen = verweis.className.split(/\s+/);
    // tailwind-merge: die Angabe des Aufrufers gewinnt, keine zwei Schriftstaerken.
    expect(klassen).toContain("font-semibold");
    expect(klassen).not.toContain("font-medium");
    expect(verweis).toHaveAttribute("target", "_blank");
    expect(verweis).toHaveAttribute("rel", "noopener noreferrer");
    expect(verweis).toHaveAttribute("aria-describedby", "x");
  });
});
