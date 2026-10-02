/**
 * @jest-environment jsdom
 */

/**
 * Kopf des Portals (UX-Umbau U1): die Regeln aus dem Kopfkommentar von
 * `rahmen/portal-kopf.tsx`. Was jede Rolle sieht und welcher Punkt aktiv ist,
 * prueft navigation.test.ts; hier geht es um das Zeichnen.
 */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { axeVerstoesse } from "../hilfen/axe";

let pfad = "/vorgaenge/onboarding";
jest.mock("next/navigation", () => ({ usePathname: () => pfad }));
jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
jest.mock("next/image", () => ({
  __esModule: true,
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ alt, src }: { alt: string; src: string }) => <img alt={alt} src={src} />,
}));
jest.mock("@/components/session-timeout-warning", () => ({ SessionTimeoutWarning: () => null }));
const seiteNeuLaden = jest.fn();
jest.mock("@/lib/seite-laden", () => ({ seiteNeuLaden: (adresse: string) => seiteNeuLaden(adresse) }));

import { PortalKopf } from "@/components/rahmen/portal-kopf";
import { toast, ToastAnbieter } from "@/components/ui/toast";

const nutzer = (role: string) => ({ firstName: "Erika", lastName: "Muster", role });

let bemAnzahl = 0;
const abrufe: { url: string; method: string }[] = [];

beforeEach(() => {
  pfad = "/vorgaenge/onboarding";
  bemAnzahl = 0;
  abrufe.length = 0;
  global.fetch = jest.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    abrufe.push({ url: String(url), method: init?.method ?? "GET" });
    return { ok: true, json: async () => ({ data: { counts: { total: bemAnzahl } } }) } as Response;
  }) as typeof fetch;
});

const haupt = () => screen.getByRole("navigation", { name: "Hauptnavigation" });

async function gezeichnet(role: string) {
  const ergebnis = render(<PortalKopf user={nutzer(role)} />);
  // Der Abruf des BEM-Zaehlers laeuft nach dem ersten Zeichnen.
  await act(async () => {});
  return ergebnis;
}

describe("PortalKopf: Aufbau", () => {
  it("zeigt die Punkte der Rolle, Name und Rollenname – ohne Ueberschrift und ohne Emoji", async () => {
    const { container } = await gezeichnet("HR_LEITUNG");
    const punkte = within(haupt());
    expect(punkte.getByRole("link", { name: "Vorgänge" }).getAttribute("href")).toBe("/vorgaenge");
    expect(punkte.getByRole("link", { name: "BEM" }).getAttribute("href")).toBe("/bem");
    expect(punkte.getByRole("button", { name: "Vorlagen" })).toBeTruthy();
    expect(punkte.getByRole("button", { name: "Verwaltung" })).toBeTruthy();
    expect(screen.getByText("Erika Muster")).toBeTruthy();
    expect(screen.getByText("HR-Leitung")).toBeTruthy();
    // „HR-Portal" ist keine Ueberschrift mehr: Die h1 gehoert der Seite.
    expect(container.querySelector("h1, h2, h3")).toBeNull();
    expect(container.textContent).not.toMatch(/\p{Extended_Pictographic}/u);
    for (const svg of Array.from(container.querySelectorAll("svg"))) expect(svg.getAttribute("aria-hidden")).toBe("true");
  });

  it("Einrichtungsleitung liest ihre Rolle, nicht „Sachbearbeiter“ – und sieht keine Menues", async () => {
    await gezeichnet("EINRICHTUNGSLEITUNG");
    expect(screen.getByText("Einrichtungsleitung")).toBeTruthy();
    expect(within(haupt()).queryByRole("button")).toBeNull();
    expect(within(haupt()).getAllByRole("link").map((l) => l.textContent)).toEqual(["Vorgänge", "BEM"]);
  });

  it("BEM-Beauftragte sehen nur BEM", async () => {
    await gezeichnet("BEM_BEAUFTRAGTER");
    expect(within(haupt()).getAllByRole("link").map((l) => l.textContent)).toEqual(["BEM"]);
  });

  it("der Sprunglink ist der erste Verweis und zeigt auf #inhalt", async () => {
    const { container } = await gezeichnet("HR_LEITUNG");
    const erster = container.querySelector("a")!;
    expect(erster.textContent).toBe("Zum Inhalt springen");
    expect(erster.getAttribute("href")).toBe("#inhalt");
  });

  it("axe findet nichts – auch bei offenem Handy-Menue", async () => {
    const { container } = render(
      <>
        <PortalKopf user={nutzer("SUPER_ADMIN")} />
        <main id="inhalt">
          <h1>Seite</h1>
        </main>
      </>,
    );
    await act(async () => {});
    expect(await axeVerstoesse(container)).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Menü" }));
    expect(await axeVerstoesse(container)).toEqual([]);
  });
});

describe("PortalKopf: aktiv", () => {
  it("genau ein Punkt traegt aria-current – in der Vorgangsliste „Vorgänge“", async () => {
    await gezeichnet("HR_LEITUNG");
    const aktive = within(haupt()).getAllByRole("link").filter((l) => l.getAttribute("aria-current") === "page");
    expect(aktive.map((l) => l.textContent)).toEqual(["Vorgänge"]);
  });

  it("im BEM ist nur BEM markiert – „Vorgänge“ nicht mehr mit", async () => {
    pfad = "/bem/statistik";
    await gezeichnet("HR_LEITUNG");
    const aktive = within(haupt()).getAllByRole("link").filter((l) => l.getAttribute("aria-current") === "page");
    expect(aktive.map((l) => l.textContent)).toEqual(["BEM"]);
  });

  it("auf einer Unterseite ist der Menueknopf markiert und der Unterpunkt aktiv – BEM nicht", async () => {
    pfad = "/bem-vorlagen";
    await gezeichnet("HR_LEITUNG");
    const punkte = within(haupt());
    expect(punkte.getByRole("button", { name: "Verwaltung" }).hasAttribute("data-aktiv")).toBe(true);
    expect(punkte.getByRole("button", { name: "Vorlagen" }).hasAttribute("data-aktiv")).toBe(false);
    expect(punkte.getByRole("link", { name: "BEM" }).getAttribute("aria-current")).toBeNull();

    const knopf = punkte.getByRole("button", { name: "Verwaltung" });
    knopf.focus();
    fireEvent.keyDown(knopf, { key: "Enter" });
    const menue = await screen.findByRole("menu");
    const aktive = within(menue).getAllByRole("menuitem").filter((m) => m.getAttribute("aria-current") === "page");
    expect(aktive.map((m) => m.textContent)).toEqual(["BEM-Vorlagen"]);
  });
});

describe("PortalKopf: Menues", () => {
  it("oeffnet mit der Tastatur, zeigt Verweise, schliesst mit Escape und gibt den Fokus zurueck", async () => {
    await gezeichnet("HR_SACHBEARBEITER");
    const knopf = within(haupt()).getByRole("button", { name: "Vorlagen" });
    knopf.focus();
    fireEvent.keyDown(knopf, { key: "Enter" });
    const menue = await screen.findByRole("menu");
    // Sachbearbeitung: „Formulare" fehlt (U1-F3).
    const punkte = within(menue).getAllByRole("menuitem");
    expect(punkte.map((p) => `${p.tagName}:${p.textContent}:${p.getAttribute("href")}`)).toEqual(["A:Brief-Vorlagen:/brief-vorlagen"]);
    fireEvent.keyDown(menue, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(knopf));
  });
});

describe("PortalKopf: BEM-Zaehler", () => {
  it("zeigt die Zahl mit Text fuer Screenreader; bei null nichts", async () => {
    bemAnzahl = 3;
    await gezeichnet("HR_LEITUNG");
    await waitFor(() =>
      expect(within(haupt()).getByRole("link", { name: /BEM/ }).textContent).toBe("BEM3 Fristen mit Handlungsbedarf"),
    );
  });

  it("ohne Fristen steht nur „BEM“", async () => {
    await gezeichnet("HR_LEITUNG");
    expect(within(haupt()).getByRole("link", { name: "BEM" }).textContent).toBe("BEM");
    expect(abrufe.filter((a) => a.url.includes("/api/bem/handlungsbedarf"))).toHaveLength(1);
  });
});

describe("PortalKopf: Handy-Menue", () => {
  it("ist zu, oeffnet mit dem Knopf (aria-expanded) und zeigt alle erreichbaren Punkte", async () => {
    await gezeichnet("HR_LEITUNG");
    const knopf = screen.getByRole("button", { name: "Menü" });
    expect(knopf.getAttribute("aria-expanded")).toBe("false");
    const liste = document.getElementById(knopf.getAttribute("aria-controls")!)!;
    expect(liste.hidden).toBe(true);

    fireEvent.click(knopf);
    expect(knopf.getAttribute("aria-expanded")).toBe("true");
    expect(liste.hidden).toBe(false);
    const verweise = within(liste).getAllByRole("link").map((l) => l.textContent);
    expect(verweise).toEqual([
      "Vorgänge",
      "BEM",
      "Formulare",
      "Brief-Vorlagen",
      "Checklisten",
      "Exit-Interview",
      "Zeugnis-Bewertung",
      "Beurteilungs-Vorlagen",
      "Benutzer",
      "BEM-Vorlagen",
      "Einstellungen",
      "Audit-Log",
    ]);
  });

  it("schliesst beim Wechsel der Seite", async () => {
    const { rerender } = await gezeichnet("HR_LEITUNG");
    const knopf = screen.getByRole("button", { name: "Menü" });
    fireEvent.click(knopf);
    expect(knopf.getAttribute("aria-expanded")).toBe("true");
    pfad = "/checklisten";
    rerender(<PortalKopf user={nutzer("HR_LEITUNG")} />);
    await act(async () => {});
    expect(knopf.getAttribute("aria-expanded")).toBe("false");
  });
});

describe("PortalKopf: Abmelden", () => {
  it("meldet ab, raeumt die Meldungen ab und laedt die Anmeldeseite neu", async () => {
    seiteNeuLaden.mockClear();
    render(
      <>
        <PortalKopf user={nutzer("HR_LEITUNG")} />
        <ToastAnbieter />
      </>,
    );
    await act(async () => {});
    act(() => void toast.fehler("Unterlage von Maria Voth konnte nicht gespeichert werden."));
    expect(document.querySelectorAll("li[data-ton]")).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Abmelden" }));
    // Volles Laden, kein Wechsel im Client — sonst bliebe der Kopf des alten Kontos stehen.
    await waitFor(() => expect(seiteNeuLaden).toHaveBeenCalledWith("/login"));
    expect(abrufe).toContainEqual({ url: "/api/auth", method: "DELETE" });
    expect(document.querySelectorAll("li[data-ton]")).toHaveLength(0);
  });
});
