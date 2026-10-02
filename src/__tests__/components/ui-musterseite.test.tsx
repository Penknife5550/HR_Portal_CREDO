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
import { readdirSync, readFileSync } from "fs";
import { join } from "path";
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

// axe ueber die GANZE Seite dauert je Lauf rund eine Sekunde, im vollen
// Testlauf (alle Kerne belegt) ein Vielfaches. Mit der Vorgabe von 5 s lief
// ein Test in die Zeitgrenze — und riss den naechsten mit („Axe is already
// running"), weil sein Lauf noch arbeitete.
jest.setTimeout(30_000);

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
      await expect(UiMusterPage()).rejects.toThrow("REDIRECT:/vorgaenge");
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
    expect(ebenen.filter((e) => e === "H2").length).toBeGreaterThanOrEqual(11);
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
    expect(container.querySelector('a[href="/vorgaenge"]')).not.toBeNull();
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

  it("der Kopf der Seite ist der Seitenkopf: Pfad, Titel, Zustand, Primaerknopf, Menue", async () => {
    await seite();
    expect(screen.getByRole("navigation", { name: "Pfad" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1, name: "UI-Muster" })).toBeTruthy();
    expect(screen.getByText("U0 in Arbeit")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Primäraktion" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Weitere Aktionen" })).toBeTruthy();
  });

  it("zeigt den Segment-Schalter mit und ohne Zaehler", async () => {
    await seite();
    expect(screen.getByRole("radiogroup", { name: "Sicht" })).toBeTruthy();
    expect(screen.getByRole("radiogroup", { name: "Art der Einträge" })).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "Kritisch 3" }));
    expect(screen.getByText("3 Vorgänge in „Kritisch“")).toBeTruthy();
  });
  it("zeigt Ladezustand und Leerzustand; axe findet auch nach dem Umschalten nichts", async () => {
    const { container } = await seite();
    expect(container.querySelector('[data-skelett="liste"]')).not.toBeNull();
    expect(container.querySelector('[data-skelett="gruppe"]')).not.toBeNull();
    expect(container.querySelectorAll("[data-leerzustand]")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Inhalt zeigen" }));
    expect(container.querySelector("[data-skelett]")).toBeNull();
    expect(screen.getByText("Probe, Lea")).toBeTruthy();
    expect(await axeVerstoesse(container)).toEqual([]);
  });
});

describe("Vollstaendigkeit", () => {
  it("jeder Baustein aus src/components/ui/ steht auf der Musterseite", () => {
    // Regel: Wer einen Baustein baut, traegt ihn auf der Musterseite ein.
    const wurzel = join(__dirname, "..", "..");
    const bausteine = readdirSync(join(wurzel, "components", "ui"))
      .filter((d) => d.endsWith(".tsx"))
      .map((d) => d.replace(/\.tsx$/, ""));
    const ordner = join(wurzel, "app", "(portal)", "ui-muster");
    const quelltext = readdirSync(ordner)
      .map((d) => readFileSync(join(ordner, d), "utf8"))
      .join("\n");
    expect(bausteine.length).toBeGreaterThanOrEqual(9);
    const fehlt = bausteine.filter((b) => !quelltext.includes(`from "@/components/ui/${b}"`));
    expect(fehlt).toEqual([]);
  });
});
