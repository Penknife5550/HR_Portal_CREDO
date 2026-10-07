/**
 * @jest-environment jsdom
 */

/**
 * Vorschau-Schalter der Vertragsende-Detailseite (UX-Umbau, Pilot, Feinplan 3.8).
 *
 * Zwei Teile:
 *   - die SEITE (`page.tsx`): liest den Cookie auf dem Server und liefert genau
 *     eine Ansicht — Vorgabe alt, nur „neu" schaltet um, die neue in einer
 *     Suspense-Grenze; das Bearbeitungsrecht rechnet sie selbst (den
 *     Startreiter liest die Ansicht aus der Adresse, siehe
 *     `vertragsende-detail.test.tsx`);
 *   - die ZEILE (`ansicht-schalter.tsx`): setzt bzw. loescht den Cookie und
 *     laedt die Seite ganz neu.
 *
 * Beide Ansichten sind hier ersetzt: Die alte ist unveraendert (eigene Tests
 * gibt es nicht), die neue hat ihren eigenen Seitentest. Geprueft wird nur,
 * WELCHE geladen wird und mit welchen Angaben.
 */
import "@testing-library/jest-dom";
import { Suspense, isValidElement, type ReactElement, type ReactNode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { axeVerstoesse } from "../hilfen/axe";
import { ANSICHT_VERTRAGSENDE_COOKIE, ansichtCookieZeile } from "@/lib/ansicht";

// ---------------------------------------------
// Ersatz fuer Server und Ansichten
// ---------------------------------------------

const redirect = jest.fn((ziel: string) => {
  throw new Error(`REDIRECT:${ziel}`);
});
let sitzung: { userId: string; email: string; role: string; firstName: string; lastName: string } | null = null;
let cookieWert: string | undefined;
const gelesen: string[] = [];

jest.mock("next/navigation", () => ({ redirect: (ziel: string) => redirect(ziel) }));
jest.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      gelesen.push(name);
      return cookieWert === undefined ? undefined : { name, value: cookieWert };
    },
  }),
}));
jest.mock("@/lib/auth", () => ({ getSession: async () => sitzung }));
// `permissions.ts` zieht Prisma mit; in jsdom liesse sich der Client nicht
// bauen. Die Rollenlisten selbst bleiben echt.
jest.mock("@/lib/db", () => ({ prisma: {} }));

const seiteNeuLaden = jest.fn();
jest.mock("@/lib/seite-laden", () => ({ seiteNeuLaden: (adresse: string) => seiteNeuLaden(adresse) }));

const alteAnsicht = jest.fn();
jest.mock("@/app/(portal)/dashboard/contract-end/[id]/contract-end-detail-content", () => ({
  ContractEndDetailContent: (props: Record<string, unknown>) => {
    alteAnsicht(props);
    return <main>Alte Ansicht</main>;
  },
}));

const neueAnsicht = jest.fn();
// Relativer Pfad und `virtual`: Die Seite importiert `./detail`; so treffen
// sich beide Angaben im selben Modulschluessel, ob die Datei schon liegt oder
// nicht.
jest.mock(
  "../../app/(portal)/vorgaenge/vertragsende/[id]/detail",
  () => ({
    VertragsendeDetailAnsicht: (props: Record<string, unknown>) => {
      neueAnsicht(props);
      return <main>Neue Ansicht</main>;
    },
  }),
  { virtual: true },
);

import VertragsendeDetailPage from "@/app/(portal)/vorgaenge/vertragsende/[id]/page";
import { AnsichtSchalter } from "@/app/(portal)/vorgaenge/vertragsende/[id]/ansicht-schalter";

const ID = "3f6d3b0c-1111-4222-8333-444455556666";

function nutzer(role: string) {
  return { userId: "u1", email: "erika@example.org", role, firstName: "Erika", lastName: "Muster" };
}

async function seite() {
  return render(await VertragsendeDetailPage({ params: Promise.resolve({ id: ID }) }));
}

/**
 * Die Typen der Elemente ueber dem ersten Element, auf das `treffer` passt —
 * im Baum, den die Seite zurueckgibt (vor dem Zeichnen). `null`: kein Treffer.
 */
function ahnenVon(
  knoten: ReactNode,
  treffer: (element: ReactElement<Record<string, unknown>>) => boolean,
  ahnen: unknown[] = [],
): unknown[] | null {
  if (Array.isArray(knoten)) {
    for (const kind of knoten) {
      const gefunden = ahnenVon(kind, treffer, ahnen);
      if (gefunden) return gefunden;
    }
    return null;
  }
  if (!isValidElement<Record<string, unknown>>(knoten)) return null;
  if (treffer(knoten)) return ahnen;
  return ahnenVon(knoten.props.children as ReactNode, treffer, [...ahnen, knoten.type]);
}

function cookiesLeeren() {
  for (const teil of document.cookie.split(";")) {
    const name = teil.split("=")[0].trim();
    if (name) document.cookie = `${name}=; Max-Age=0; Path=/`;
  }
}

// axe ueber die ganze Zeile bzw. Seite: im vollen Testlauf langsamer als 5 s.
jest.setTimeout(30_000);

beforeEach(() => {
  redirect.mockClear();
  seiteNeuLaden.mockClear();
  alteAnsicht.mockClear();
  neueAnsicht.mockClear();
  gelesen.length = 0;
  sitzung = nutzer("HR_LEITUNG");
  cookieWert = undefined;
  cookiesLeeren();
  window.history.replaceState({}, "", "/");
});

// =============================================
// Seite
// =============================================

describe("Seite: welche Ansicht", () => {
  it("ohne Sitzung geht es zur Anmeldung – vor jedem Cookie", async () => {
    sitzung = null;
    await expect(seite()).rejects.toThrow("REDIRECT:/login");
    expect(gelesen).toEqual([]);
    expect(alteAnsicht).not.toHaveBeenCalled();
    expect(neueAnsicht).not.toHaveBeenCalled();
  });

  it("ohne Cookie: alte Ansicht, unveraendert mit Vorgang und Sitzung, darueber der Schalter", async () => {
    const { container } = await seite();
    expect(gelesen).toEqual([ANSICHT_VERTRAGSENDE_COOKIE]);
    expect(alteAnsicht).toHaveBeenCalledTimes(1);
    expect(alteAnsicht).toHaveBeenCalledWith({ contractEndId: ID, user: nutzer("HR_LEITUNG") });
    expect(neueAnsicht).not.toHaveBeenCalled();
    expect(screen.getByText("Für diese Seite gibt es eine neue Ansicht.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Neue Ansicht ausprobieren" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Rückmeldung geben" })).toBeNull();
    // Der Schalter steht UEBER dem Inhalt.
    const bereich = screen.getByRole("complementary", { name: "Ansicht dieser Seite" });
    expect(bereich.compareDocumentPosition(screen.getByRole("main")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(await axeVerstoesse(container)).toEqual([]);
  });

  it.each(["NEU", "ja", "", " neu", "alt", "neu; x"])("Cookie-Wert %p: alte Ansicht", async (wert) => {
    cookieWert = wert;
    await seite();
    expect(alteAnsicht).toHaveBeenCalledTimes(1);
    expect(neueAnsicht).not.toHaveBeenCalled();
  });

  it("Cookie „neu“: neue Ansicht mit Vorgang und Recht, darueber der Schalter samt Rückmeldung", async () => {
    cookieWert = "neu";
    const { container } = await seite();
    expect(alteAnsicht).not.toHaveBeenCalled();
    expect(neueAnsicht).toHaveBeenCalledTimes(1);
    // Kein Startreiter von hier: Den liest die Ansicht selbst aus der Adresse.
    expect(neueAnsicht).toHaveBeenCalledWith({ vorgangId: ID, darfBearbeiten: true });
    expect(screen.getByText("Neue Ansicht (Vorschau).")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Zur bisherigen Ansicht" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Rückmeldung geben" })).toBeInTheDocument();
    expect(await axeVerstoesse(container)).toEqual([]);
  });

  it("die neue Ansicht steht in einer Suspense-Grenze (useSearchParams verlangt sie, sobald die Route statisch wird)", async () => {
    cookieWert = "neu";
    const baum = await VertragsendeDetailPage({ params: Promise.resolve({ id: ID }) });
    const ahnen = ahnenVon(baum, (e) => e.props.vorgangId === ID);
    expect(ahnen).not.toBeNull();
    expect(ahnen).toContain(Suspense);
    // Der Schalter selbst liest keine Suche — er steht ausserhalb der Grenze.
    const schalter = ahnenVon(baum, (e) => e.props.ansicht === "neu");
    expect(schalter).not.toBeNull();
    expect(schalter).not.toContain(Suspense);
  });

  it.each([
    ["SUPER_ADMIN", true],
    ["HR_LEITUNG", true],
    ["HR_SACHBEARBEITER", true],
    ["EINRICHTUNGSLEITUNG", false],
    ["VORGESETZTER", false],
    ["VIEWER", false],
  ])("%s: darfBearbeiten = %p (HR_EDIT_ROLES, auf dem Server gerechnet)", async (rolle, recht) => {
    cookieWert = "neu";
    sitzung = nutzer(rolle);
    await seite();
    expect(neueAnsicht).toHaveBeenCalledWith(expect.objectContaining({ darfBearbeiten: recht }));
  });
});

// =============================================
// Zeile des Schalters
// =============================================

describe("Schalter: umschalten", () => {
  let setzer: jest.SpyInstance;
  beforeEach(() => {
    setzer = jest.spyOn(document, "cookie", "set");
  });
  afterEach(() => {
    setzer.mockRestore();
  });

  it("alt → neu: setzt den Cookie (ohne Secure auf http) und laedt Pfad samt Suche neu", () => {
    window.history.replaceState({}, "", `/vorgaenge/vertragsende/${ID}?tab=dokumente`);
    render(<AnsichtSchalter ansicht="alt" />);
    fireEvent.click(screen.getByRole("button", { name: "Neue Ansicht ausprobieren" }));

    expect(setzer).toHaveBeenCalledTimes(1);
    const zeile = setzer.mock.calls[0][0] as string;
    expect(zeile).toBe(ansichtCookieZeile("neu", false));
    expect(zeile).toMatch(/^ansicht-vertragsende=neu; /);
    expect(zeile).toContain("Max-Age=31536000");
    expect(zeile).toContain("Path=/");
    expect(zeile).toContain("SameSite=Lax");
    expect(zeile).not.toContain("Secure");
    expect(document.cookie).toContain("ansicht-vertragsende=neu");

    expect(seiteNeuLaden).toHaveBeenCalledTimes(1);
    expect(seiteNeuLaden).toHaveBeenCalledWith(`/vorgaenge/vertragsende/${ID}?tab=dokumente`);
  });

  it("neu → alt: loescht den Cookie (Max-Age=0) und laedt neu", () => {
    document.cookie = "ansicht-vertragsende=neu; Path=/";
    setzer.mockClear();
    window.history.replaceState({}, "", `/vorgaenge/vertragsende/${ID}`);
    render(<AnsichtSchalter ansicht="neu" />);
    fireEvent.click(screen.getByRole("button", { name: "Zur bisherigen Ansicht" }));

    expect(setzer).toHaveBeenCalledWith(ansichtCookieZeile("alt", false));
    expect(setzer.mock.calls[0][0]).toContain("Max-Age=0");
    expect(document.cookie).not.toContain("ansicht-vertragsende");
    expect(seiteNeuLaden).toHaveBeenCalledWith(`/vorgaenge/vertragsende/${ID}`);
  });

  it("waehrend des Wechsels laedt der Knopf, und ein zweiter Klick tut nichts", () => {
    render(<AnsichtSchalter ansicht="alt" />);
    fireEvent.click(screen.getByRole("button", { name: "Neue Ansicht ausprobieren" }));
    const knopf = screen.getByRole("button", { name: "Ansicht wird gewechselt …" });
    expect(knopf).toHaveAttribute("aria-busy", "true");
    expect(knopf).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(knopf);
    expect(setzer).toHaveBeenCalledTimes(1);
    expect(seiteNeuLaden).toHaveBeenCalledTimes(1);
  });
});

describe("Schalter: Aufbau", () => {
  it("alt: ein Satz, ein Knopf, keine Rückmeldung; axe ohne Befund", async () => {
    const { container } = render(<AnsichtSchalter ansicht="alt" />);
    const bereich = screen.getByRole("complementary", { name: "Ansicht dieser Seite" });
    expect(bereich).toHaveTextContent("Für diese Seite gibt es eine neue Ansicht.");
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.getByRole("button")).toHaveAttribute("type", "button");
    expect(screen.queryByRole("link")).toBeNull();
    expect(container.querySelector("h1, h2, h3")).toBeNull();
    expect(await axeVerstoesse(container)).toEqual([]);
  });

  it("neu: „Rückmeldung geben“ ist ein mailto an das Personalbüro; axe ohne Befund", async () => {
    const { container } = render(<AnsichtSchalter ansicht="neu" />);
    const verweis = screen.getByRole("link", { name: "Rückmeldung geben" });
    const href = verweis.getAttribute("href") ?? "";
    expect(href.startsWith("mailto:personalbuchhaltung@fes-minden.de?subject=")).toBe(true);
    expect(decodeURIComponent(href.split("subject=")[1])).toBe("Rückmeldung: neue Ansicht Vertragsende");
    expect(screen.getByRole("button", { name: "Zur bisherigen Ansicht" })).toBeInTheDocument();
    expect(await axeVerstoesse(container)).toEqual([]);
  });

  it("Texte ohne Anrede, ohne Pfeil und ohne Emoji", () => {
    for (const ansicht of ["alt", "neu"] as const) {
      const { container, unmount } = render(<AnsichtSchalter ansicht={ansicht} />);
      const text = container.textContent ?? "";
      expect(text).not.toMatch(/\b(Sie|Ihre?|du|dein)\b/);
      expect(text).not.toMatch(/[←→⇒➜]/);
      expect(text).not.toMatch(/\p{Extended_Pictographic}/u);
      unmount();
    }
  });
});
