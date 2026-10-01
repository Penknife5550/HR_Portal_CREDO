/**
 * @jest-environment jsdom
 */

/**
 * Musterseite `/ui-muster` (UX-Umbau, U0).
 *
 * Die Seite ist die Abnahmegrundlage der Bausteine — also laeuft axe ueber die
 * ECHTE Seite, nicht ueber eine nachgebaute Fixture. (Der Baustein-Test der
 * Gruppe bestand frueher nur, weil seine Fixture eine Zwischenueberschrift
 * einschob, die die Seite nicht hatte: `heading-order`.)
 *
 * Der Portal-Kopf ist durch seine Ueberschrift ersetzt (er zieht Router und
 * Sitzungswarnung mit); sein `<h1>` bleibt, damit die Reihenfolge stimmt.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { axeVerstoesse } from "../hilfen/axe";
import { STATUS_TOENE } from "@/components/ui/statuspille";

const redirect = jest.fn((ziel: string) => {
  throw new Error(`REDIRECT:${ziel}`);
});
let sitzung: { role: string } | null = null;

jest.mock("next/navigation", () => ({ redirect: (ziel: string) => redirect(ziel) }));
jest.mock("@/lib/auth", () => ({ getSession: async () => sitzung }));
jest.mock("@/components/portal-header", () => ({
  PortalHeader: () => (
    <header>
      <h1>HR-Portal</h1>
    </header>
  ),
}));
jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import UiMusterPage from "@/app/(portal)/ui-muster/page";

beforeEach(() => {
  redirect.mockClear();
});

describe("Zugang", () => {
  it("ohne Sitzung geht es zur Anmeldung", async () => {
    sitzung = null;
    await expect(UiMusterPage()).rejects.toThrow("REDIRECT:/login");
  });

  it.each(["HR_LEITUNG", "HR_SACHBEARBEITER", "SERVICE", "BEM_BEAUFTRAGTER"])(
    "%s wird weggeleitet – nur SUPER_ADMIN sieht die Seite",
    async (rolle) => {
      sitzung = { role: rolle };
      await expect(UiMusterPage()).rejects.toThrow("REDIRECT:/dashboard");
    },
  );
});

describe("Inhalt", () => {
  async function seite() {
    sitzung = { role: "SUPER_ADMIN" };
    return render(await UiMusterPage());
  }

  it("axe findet auf der echten Seite nichts – Ueberschriften in Reihenfolge, Bereiche eindeutig benannt", async () => {
    const { container } = await seite();
    expect(await axeVerstoesse(container)).toEqual([]);
    const ebenen = Array.from(container.querySelectorAll("h1, h2, h3, h4")).map((h) => h.tagName);
    expect(ebenen.filter((e) => e === "H2").length).toBeGreaterThanOrEqual(7);
    expect(ebenen).not.toContain("H3");
  });

  it("zeigt jeden Ton aus STATUS_TOENE", async () => {
    const { container } = await seite();
    const gezeigt = new Set(
      Array.from(container.querySelectorAll("[data-ton]")).map((p) => p.getAttribute("data-ton")),
    );
    expect([...gezeigt].sort()).toEqual(Object.keys(STATUS_TOENE).sort());
  });

  it("zeigt die Zustaende des Knopfs: laedt, gesperrt, gesperrt und fokussierbar, als Verweis", async () => {
    const { container } = await seite();
    expect(container.querySelector('button[aria-busy="true"]')).not.toBeNull();
    expect(container.querySelector("button[disabled]")).not.toBeNull();
    expect(container.querySelector('button[aria-disabled="true"]:not([aria-busy])')).not.toBeNull();
    expect(container.querySelector('a[href="/dashboard"]')).not.toBeNull();
  });

  it("nutzt ink-3 nirgends als Textfarbe", async () => {
    const { container } = await seite();
    expect(container.innerHTML).not.toMatch(/\btext-ink-3\b/);
  });

  it("zeigt Dialog und Rueckfrage: axe findet auch bei offenem Dialog nichts", async () => {
    await seite();
    fireEvent.click(screen.getByRole("button", { name: "Kritische Rückfrage" }));
    expect(screen.getByRole("alertdialog", { name: "Vorgang stornieren?" })).toBeTruthy();
    expect(await axeVerstoesse(document.body)).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Dialog mit Feld" }));
    expect(screen.getByRole("dialog", { name: "Unterlage zurückweisen" })).toBeTruthy();
    expect(screen.getByText("Bitte eine Begründung eintragen.")).toBeTruthy();
    expect(await axeVerstoesse(document.body)).toEqual([]);
  });

  it("zeigt jeden Ton der Meldungen als Knopf", async () => {
    await seite();
    for (const name of ["Erfolg", "Erfolg mit „Rückgängig“", "Fehler", "Hinweis"]) {
      expect(screen.getByRole("button", { name })).toBeTruthy();
    }
  });
});
