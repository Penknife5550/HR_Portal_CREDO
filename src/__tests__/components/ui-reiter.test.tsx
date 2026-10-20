/**
 * @jest-environment jsdom
 */

/**
 * Reiter (UX-Umbau „Klarer Weg", Pilot Vertragsende).
 *
 * Geprueft werden die Regeln aus dem Kopfkommentar von `reiter.tsx`: echte
 * Reiter mit Inhaltsfeld (nur das gewaehlte steht im DOM), gesteuert ueber
 * `wert`/`onWechsel`, ein unbekannter `wert` faellt auf den ersten Reiter,
 * Tastatur wie bei Reitern ueblich, Zaehler im Namen, Auswahl durch Strich UND
 * Schriftstaerke, rollen statt abschneiden.
 *
 * Radix waehlt einen Reiter bei `mousedown` (und beim Fokus), nicht bei
 * `click` — `klick()` spielt deshalb die ganze Folge einer Maustaste. Die
 * Pfeiltasten setzen den Fokus in einem Zeitgeber um; darauf wartet `waitFor`.
 *
 * Farbkontraste rechnet axe in jsdom nicht (kein Layout). Die Paare aus
 * `REITER_FARBEN` stehen deshalb unten gegen die Tokens aus `globals.css`.
 */
import { readFileSync } from "fs";
import { join } from "path";
import { useState } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { REITER_FARBEN, Reiter, ReiterInhalt } from "@/components/ui/reiter";
import { ReiterMuster } from "@/app/(portal)/ui-muster/reiter-muster";
import { AA_BEDIENELEMENT, AA_TEXT, kontrast } from "@/lib/ui/kontrast";
import { axeVerstoesse } from "../hilfen/axe";
import { FLAECHEN, token } from "../hilfen/farb-tokens";

const EINTRAEGE = [
  { wert: "uebersicht", text: "Übersicht" },
  { wert: "vertragsdaten", text: "Vertragsdaten" },
  { wert: "dokumente", text: "Dokumente", zahl: 1 },
  { wert: "e-mails", text: "E-Mails", zahl: 0 },
] as const;
type Wert = (typeof EINTRAEGE)[number]["wert"];

const INHALTE = (
  <>
    <ReiterInhalt wert="uebersicht">
      <p>Inhalt Übersicht</p>
    </ReiterInhalt>
    <ReiterInhalt wert="vertragsdaten">
      <p>Inhalt Vertragsdaten</p>
    </ReiterInhalt>
    <ReiterInhalt wert="dokumente">
      <p>Inhalt Dokumente</p>
    </ReiterInhalt>
    <ReiterInhalt wert="e-mails">
      <p>Inhalt E-Mails</p>
    </ReiterInhalt>
  </>
);

/** Eine Seite, die den Reiter fuehrt — wie spaeter die Seite des Vorgangs. */
function Probe({ start = "uebersicht", onWechsel }: { start?: string; onWechsel?: (w: Wert) => void }) {
  const [wert, setWert] = useState(start as Wert);
  return (
    <Reiter
      label="Bereiche des Vorgangs"
      wert={wert}
      reiter={EINTRAEGE}
      onWechsel={(w) => {
        onWechsel?.(w);
        setWert(w);
      }}
    >
      {INHALTE}
    </Reiter>
  );
}

const leiste = () => screen.getByRole("tablist");
const reiter = () => screen.getAllByRole("tab") as HTMLButtonElement[];
const gewaehlt = () => reiter().map((r) => r.getAttribute("aria-selected"));
/** Die sichtbaren Inhaltsfelder — es darf immer nur eines sein. */
const felder = () => Array.from(document.querySelectorAll('[role="tabpanel"]:not([hidden])'));
/** Die Felder der uebrigen Reiter: versteckt und LEER (Radix haelt nur die Huelle). */
const versteckteFelder = () => Array.from(document.querySelectorAll('[role="tabpanel"][hidden]'));

/** Die Ereignisse einer Maustaste, in der Reihenfolge des Browsers. */
function klick(element: HTMLElement) {
  fireEvent.mouseDown(element);
  act(() => element.focus());
  fireEvent.mouseUp(element);
  fireEvent.click(element);
}

/** Tab in die Leiste: Radix reicht den Fokus an den gewaehlten Reiter weiter. */
function tabInDieLeiste() {
  act(() => leiste().focus());
}

/** Bis nach dem laufenden Ereignis warten (Zeitgeber mit 0 ms). */
async function naechsterTakt() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

async function taste(key: string, ziel: number) {
  fireEvent.keyDown(document.activeElement!, { key });
  await waitFor(() => expect(document.activeElement).toBe(reiter()[ziel]));
}

// =============================================
// Aufbau
// =============================================

describe("Reiter: Aufbau", () => {
  it("ist eine benannte Reiterleiste; der gewaehlte Reiter traegt aria-selected", () => {
    render(<Probe />);
    expect(screen.getByRole("tablist", { name: "Bereiche des Vorgangs" })).toBeTruthy();
    expect(reiter()).toHaveLength(4);
    expect(gewaehlt()).toEqual(["true", "false", "false", "false"]);
    for (const r of reiter()) expect(r.getAttribute("type")).toBe("button");
  });

  it("nur der Inhalt des gewaehlten Reiters steht im DOM – und heisst wie sein Reiter", () => {
    render(<Probe start="dokumente" />);
    expect(felder()).toHaveLength(1);
    const feld = screen.getByRole("tabpanel", { name: "Dokumente 1" });
    expect(feld.textContent).toBe("Inhalt Dokumente");
    // Der Verweis des gewaehlten Reiters trifft sein Feld.
    expect(reiter()[2].getAttribute("aria-controls")).toBe(feld.id);
    for (const text of ["Inhalt Übersicht", "Inhalt Vertragsdaten", "Inhalt E-Mails"]) {
      expect(screen.queryByText(text)).toBeNull();
    }
    // Von den uebrigen Feldern steht nur die leere, versteckte Huelle da.
    expect(versteckteFelder().map((f) => f.innerHTML)).toEqual(["", "", ""]);
  });

  it("der Zaehler gehoert zum Namen des Reiters; die Null wird gezeigt, ohne Zahl steht keine da", () => {
    render(<Probe />);
    expect(reiter().map((r) => r.textContent)).toEqual(["Übersicht", "Vertragsdaten", "Dokumente1", "E-Mails0"]);
    expect(screen.getByRole("tab", { name: "Dokumente 1" })).toBe(reiter()[2]);
    expect(screen.getByRole("tab", { name: "E-Mails 0" })).toBe(reiter()[3]);
    expect(screen.getByRole("tab", { name: "Übersicht" })).toBe(reiter()[0]);
    // Der Name und, falls gesetzt, die Zahl – sonst nichts.
    expect(reiter().map((r) => r.children.length)).toEqual([1, 1, 2, 2]);
    const zahl = reiter()[3].children[1];
    expect(zahl.textContent).toBe("0");
    expect(zahl.className).toContain("tabular-nums");
    expect(zahl.className).toContain(REITER_FARBEN.zahl);
  });

  it("axe findet nichts – bei jedem gewaehlten Reiter", async () => {
    const { container } = render(<Probe />);
    expect(await axeVerstoesse(container)).toEqual([]);
    klick(reiter()[3]);
    expect(gewaehlt()).toEqual(["false", "false", "false", "true"]);
    expect(await axeVerstoesse(container)).toEqual([]);
  });

  it("ohne Eintraege zeichnet der Baustein nichts", () => {
    const { container } = render(
      <Reiter label="Bereiche" wert="x" onWechsel={() => {}} reiter={[]}>
        <p>nie zu sehen</p>
      </Reiter>,
    );
    expect(container.innerHTML).toBe("");
  });
});

// =============================================
// Gesteuert
// =============================================

describe("Reiter: gesteuert ueber wert und onWechsel", () => {
  it("ein Klick waehlt: onWechsel genau einmal, der Inhalt wechselt", () => {
    const wechsel = jest.fn();
    render(<Probe onWechsel={wechsel} />);
    klick(reiter()[2]);
    expect(wechsel).toHaveBeenCalledTimes(1);
    expect(wechsel).toHaveBeenCalledWith("dokumente");
    expect(gewaehlt()).toEqual(["false", "false", "true", "false"]);
    expect(felder()).toHaveLength(1);
    expect(screen.getByText("Inhalt Dokumente")).toBeTruthy();
    // Der verlassene Inhalt ist ausgehaengt, nicht nur versteckt.
    expect(screen.queryByText("Inhalt Übersicht")).toBeNull();
    expect(versteckteFelder().map((f) => f.innerHTML)).toEqual(["", "", ""]);
  });

  it("ein Klick auf den schon gewaehlten Reiter meldet nichts", () => {
    const wechsel = jest.fn();
    render(<Probe start="vertragsdaten" onWechsel={wechsel} />);
    klick(reiter()[1]);
    expect(wechsel).not.toHaveBeenCalled();
    expect(gewaehlt()).toEqual(["false", "true", "false", "false"]);
  });

  it("den Reiter fuehrt die Seite: Uebernimmt sie den Wechsel nicht, bleibt die Auswahl stehen", () => {
    const wechsel = jest.fn();
    render(
      <Reiter label="Bereiche des Vorgangs" wert="uebersicht" onWechsel={wechsel} reiter={EINTRAEGE}>
        {INHALTE}
      </Reiter>,
    );
    klick(reiter()[2]);
    expect(wechsel).toHaveBeenCalledWith("dokumente");
    expect(gewaehlt()).toEqual(["true", "false", "false", "false"]);
    expect(screen.getByText("Inhalt Übersicht")).toBeTruthy();
  });

  // Radix waehlt bei `mousedown` UND beim `focus` danach. Fuehrt die Seite den
  // Reiter in der Adresse, kommt ihr neuer `wert` erst nach dem Ereignis
  // zurueck — ohne Merker liefe `onWechsel` zweimal (zwei Navigationen je Klick).
  it("ein Klick meldet genau EINMAL – auch wenn die Seite den Wechsel nicht oder erst spaeter uebernimmt", async () => {
    const wechsel = jest.fn();
    const { rerender } = render(
      <Reiter label="Bereiche des Vorgangs" wert="uebersicht" onWechsel={wechsel} reiter={EINTRAEGE}>
        {INHALTE}
      </Reiter>,
    );
    klick(reiter()[2]);
    expect(wechsel.mock.calls).toEqual([["dokumente"]]);

    // Die Seite hat abgelehnt (wert unveraendert): Ein spaeterer Klick meldet wieder.
    await naechsterTakt();
    klick(reiter()[2]);
    expect(wechsel.mock.calls).toEqual([["dokumente"], ["dokumente"]]);

    // Die Seite uebernimmt verspaetet: danach ist der Reiter gewaehlt, ein Klick meldet nichts mehr.
    await naechsterTakt();
    rerender(
      <Reiter label="Bereiche des Vorgangs" wert="dokumente" onWechsel={wechsel} reiter={EINTRAEGE}>
        {INHALTE}
      </Reiter>,
    );
    klick(reiter()[2]);
    expect(wechsel).toHaveBeenCalledTimes(2);
    // Und ein anderer Reiter meldet sofort – der Merker haelt nur denselben Wert im selben Ereignis zurueck.
    klick(reiter()[1]);
    expect(wechsel.mock.calls[2]).toEqual(["vertragsdaten"]);
  });

  it("ein unbekannter wert faellt auf den ersten Reiter: gewaehlt, Inhalt sichtbar", async () => {
    const wechsel = jest.fn();
    const { container } = render(<Probe start="gibt-es-nicht" onWechsel={wechsel} />);
    expect(gewaehlt()).toEqual(["true", "false", "false", "false"]);
    expect(screen.getByRole("tabpanel", { name: "Übersicht" }).textContent).toBe("Inhalt Übersicht");
    expect(await axeVerstoesse(container)).toEqual([]);
    // Der erste Reiter IST gewaehlt – ein Klick darauf ist kein Wechsel.
    klick(reiter()[0]);
    expect(wechsel).not.toHaveBeenCalled();
    klick(reiter()[1]);
    expect(wechsel).toHaveBeenCalledTimes(1);
    expect(wechsel).toHaveBeenCalledWith("vertragsdaten");
  });
});

// =============================================
// Tastatur
// =============================================

describe("Reiter: Tastatur", () => {
  it("Tab erreicht den gewaehlten Reiter, das naechste Tab das Inhaltsfeld", () => {
    render(<Probe start="vertragsdaten" />);
    expect(leiste().tabIndex).toBe(0);
    tabInDieLeiste();
    expect(document.activeElement).toBe(reiter()[1]);
    // Nur der gewaehlte Reiter ist danach ein Halt der Tab-Taste …
    expect(reiter().map((r) => r.tabIndex)).toEqual([-1, 0, -1, -1]);
    // … und nach ihm das Inhaltsfeld.
    expect((screen.getByRole("tabpanel") as HTMLElement).tabIndex).toBe(0);
  });

  it("Pfeiltasten wechseln rundum, Pos1 und Ende springen; die Auswahl folgt dem Fokus", async () => {
    const wechsel = jest.fn();
    render(<Probe onWechsel={wechsel} />);
    tabInDieLeiste();
    expect(wechsel).not.toHaveBeenCalled();

    await taste("ArrowRight", 1);
    expect(gewaehlt()).toEqual(["false", "true", "false", "false"]);
    expect(screen.getByText("Inhalt Vertragsdaten")).toBeTruthy();
    await taste("End", 3);
    expect(gewaehlt()).toEqual(["false", "false", "false", "true"]);
    await taste("ArrowRight", 0);
    expect(gewaehlt()).toEqual(["true", "false", "false", "false"]);
    await taste("ArrowLeft", 3);
    await taste("Home", 0);
    expect(wechsel.mock.calls.map(([w]) => w)).toEqual(["vertragsdaten", "e-mails", "uebersicht", "e-mails", "uebersicht"]);
    expect(felder()).toHaveLength(1);
  });

  it("andere Tasten wechseln nicht – auch Pfeil hoch und runter nicht (die Leiste liegt waagerecht)", async () => {
    const wechsel = jest.fn();
    render(<Probe onWechsel={wechsel} />);
    tabInDieLeiste();
    for (const key of ["ArrowDown", "ArrowUp", "a"]) fireEvent.keyDown(document.activeElement!, { key });
    // Radix setzt den Fokus in einem Zeitgeber um; ihm Zeit lassen.
    await naechsterTakt();
    expect(wechsel).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(reiter()[0]);
  });

  it("Bild-auf und Bild-ab gehoeren der Seite: kein Sprung zum ersten/letzten Reiter, die Vorgabe des Browsers bleibt", async () => {
    const wechsel = jest.fn();
    render(<Probe start="vertragsdaten" onWechsel={wechsel} />);
    tabInDieLeiste();
    for (const key of ["PageDown", "PageUp"]) {
      // `fireEvent` gibt `false` zurueck, wenn jemand `preventDefault()` rief.
      expect(fireEvent.keyDown(document.activeElement!, { key })).toBe(true);
    }
    await naechsterTakt();
    expect(wechsel).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(reiter()[1]);
    expect(gewaehlt()).toEqual(["false", "true", "false", "false"]);
  });

  it("wechselt die Seite den Reiter von aussen, liegt der Halt der Tab-Taste auf dem NEU gewaehlten Reiter", () => {
    // Radix merkt sich den zuletzt fokussierten Reiter; ohne eigenen Halt
    // landete Umschalt+Tab aus dem Inhalt auf ihm und schaltete zurueck.
    const wechsel = jest.fn();
    const seite = (wert: Wert) => (
      <Reiter label="Bereiche des Vorgangs" wert={wert} onWechsel={wechsel} reiter={EINTRAEGE}>
        {INHALTE}
      </Reiter>
    );
    const { rerender } = render(seite("uebersicht"));
    klick(reiter()[1]);
    rerender(seite("vertragsdaten"));
    expect(reiter().map((r) => r.tabIndex)).toEqual([-1, 0, -1, -1]);

    // Von aussen: Adresse, Schritt der Prozessleiste, Zurueck-Taste.
    rerender(seite("e-mails"));
    expect(gewaehlt()).toEqual(["false", "false", "false", "true"]);
    expect(reiter().map((r) => r.tabIndex)).toEqual([-1, -1, -1, 0]);
    // Der Halt ist der gewaehlte Reiter: Ihn zu fokussieren ist kein Wechsel.
    wechsel.mockClear();
    act(() => reiter()[3].focus());
    expect(wechsel).not.toHaveBeenCalled();
  });
});

// =============================================
// Aussehen
// =============================================

describe("Reiter: Aussehen", () => {
  it("der gewaehlte Reiter unterscheidet sich durch Strich UND Schriftstaerke", () => {
    render(<Probe />);
    const [aktiv, ruhe] = reiter();
    expect(aktiv.className).toContain("border-b-2");
    expect(aktiv.className).toContain(REITER_FARBEN.strich);
    expect(aktiv.className).toContain("font-semibold");
    expect(aktiv.className.split(" ")).toContain(REITER_FARBEN.aktiv);
    expect(ruhe.className).toContain("font-medium");
    expect(ruhe.className).not.toContain("font-semibold");
    expect(ruhe.className.split(" ")).toContain(REITER_FARBEN.ruhe);
    expect(ruhe.className).toContain(REITER_FARBEN.hover);
  });

  it("nicht gewaehlte Reiter tragen GAR KEINEN Rand – ein durchsichtiger wuerde im Windows-Kontrastmodus sichtbar", () => {
    render(<Probe />);
    for (const r of reiter().slice(1)) expect(r.className).not.toMatch(/\bborder\b|\bborder-/);
    // Der Strich ist ein Rand aus einem Token, kein Schatten und keine feste Farbe.
    expect(REITER_FARBEN.strich).toMatch(/^border-[a-z0-9-]+$/);
    expect(reiter()[0].className).not.toMatch(/shadow|\[/);
  });

  it("die Leiste rollt waagerecht, statt umzubrechen oder abzuschneiden; der Fokusring liegt innen", () => {
    const { container } = render(<Probe />);
    expect(leiste().className).toContain("overflow-x-auto");
    expect(leiste().className).not.toContain("flex-wrap");
    for (const r of reiter()) {
      expect(r.className).toContain("whitespace-nowrap");
      expect(r.className).toContain("shrink-0");
      expect(r.className).toContain("focus-visible:-outline-offset-2");
      expect(r.className).toContain("focus-visible:outline-action");
    }
    expect(container.innerHTML).not.toMatch(/truncate|text-ellipsis|line-clamp|overflow-hidden/);
  });

  it("nutzt ink-3 nirgends als Textfarbe – auch der Zaehler nicht", () => {
    const { container } = render(<Probe start="dokumente" />);
    expect(container.innerHTML).not.toMatch(/\btext-ink-3\b/);
    expect(Object.values(REITER_FARBEN).join(" ")).not.toMatch(/ink-3/);
  });

  it("das Inhaltsfeld zeigt einen Fokusring und hat keine eigene Flaeche", () => {
    render(
      <Reiter label="Bereiche" wert="a" onWechsel={() => {}} reiter={[{ wert: "a", text: "A" }]}>
        <ReiterInhalt wert="a" className="mt-8">
          Inhalt
        </ReiterInhalt>
      </Reiter>,
    );
    const feld = screen.getByRole("tabpanel");
    expect(feld.className).toContain("focus-visible:outline-2");
    expect(feld.className).toContain("focus-visible:outline-action");
    expect(feld.className).not.toMatch(/\bbg-|\bring-|\bshadow|\bborder/);
    // Eigene Klassen kommen an und gewinnen (cn).
    expect(feld.className).toContain("mt-8");
    expect(feld.className).not.toContain("mt-4");
  });
});

// =============================================
// Schmale Bildschirme
// =============================================

describe("Reiter: der gewaehlte Reiter wird in den sichtbaren Teil der Leiste geholt", () => {
  // jsdom hat kein Layout: Die Leiste ist hier 300 px breit, jeder Reiter 120 px.
  function mitLayout() {
    return jest.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
      const links =
        this.getAttribute("role") === "tab" ? reiter().indexOf(this as HTMLButtonElement) * 120 - leiste().scrollLeft : 0;
      const breite = this.getAttribute("role") === "tab" ? 120 : 300;
      return { left: links, right: links + breite, top: 0, bottom: 40, width: breite, height: 40, x: links, y: 0 } as DOMRect;
    });
  }

  afterEach(() => jest.restoreAllMocks());

  it("beim Oeffnen mit dem letzten Reiter und beim Wechsel zurueck; die Seite selbst wird nicht gerollt", () => {
    mitLayout();
    const seiteRollen = jest.fn();
    Element.prototype.scrollIntoView = seiteRollen;
    render(<Probe start="e-mails" />);
    // Der vierte Reiter reicht von 360 bis 480, die Leiste zeigt 300.
    expect(leiste().scrollLeft).toBe(180);
    klick(reiter()[0]);
    expect(leiste().scrollLeft).toBe(0);
    // Ein Reiter, der schon ganz zu sehen ist, verschiebt nichts.
    klick(reiter()[1]);
    expect(leiste().scrollLeft).toBe(0);
    expect(seiteRollen).not.toHaveBeenCalled();
  });
});

// =============================================
// Quelltext
// =============================================

describe("Reiter: der Baustein kennt nur sich selbst", () => {
  const quelltext = readFileSync(join(__dirname, "..", "..", "components", "ui", "reiter.tsx"), "utf8");

  it("ist eine Client-Komponente", () => {
    expect(quelltext.startsWith('"use client";')).toBe(true);
  });

  it("liest nichts aus der Adresse und bindet nichts aus den Modulen ein", () => {
    const eingebunden = [...quelltext.matchAll(/from "([^"]+)"/g)].map((t) => t[1]);
    expect(eingebunden.sort()).toEqual(["@/lib/utils", "@radix-ui/react-tabs", "react"]);
    expect(quelltext).not.toMatch(/\b(?:window|document|location|history)\./);
  });
});

// =============================================
// Kontrast
// =============================================

describe("Reiter: Kontrast der Farben aus REITER_FARBEN", () => {
  // Tokens aus globals.css wie in ui-kontrast.test.ts (`hilfen/farb-tokens.ts`);
  // die Reiter stehen auf dem Seitengrund oder auf einer Karte (`FLAECHEN`).

  /** Tokenname einer Klasse (`hover:text-ink` mit Praefix `hover:text` → `ink`). */
  function tokenName(klasse: string, praefix: string): string {
    if (!klasse.startsWith(`${praefix}-`)) throw new Error(`„${klasse}“ beginnt nicht mit „${praefix}-“`);
    return klasse.slice(praefix.length + 1);
  }

  it("jeder Eintrag ist genau EINE Klasse aus den Tokens – ohne Deckkraft, ohne Filter", () => {
    expect(Object.keys(REITER_FARBEN).sort()).toEqual(["aktiv", "hover", "ruhe", "strich", "zahl"]);
    for (const klasse of Object.values(REITER_FARBEN)) {
      expect(klasse).not.toMatch(/\s|\/\d|opacity|brightness|#|\[/);
    }
  });

  it.each([
    ["ruhe", "text"],
    ["hover", "hover:text"],
    ["aktiv", "text"],
    ["zahl", "text"],
  ] as const)("%s: Text erreicht AA auf Karte und Seitengrund", (eintrag, praefix) => {
    const farbe = token(tokenName(REITER_FARBEN[eintrag], praefix));
    for (const flaeche of FLAECHEN) expect(kontrast(farbe, token(flaeche))).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it("der Strich hebt sich von Karte und Seitengrund ab", () => {
    const farbe = token(tokenName(REITER_FARBEN.strich, "border"));
    for (const flaeche of FLAECHEN) expect(kontrast(farbe, token(flaeche))).toBeGreaterThanOrEqual(AA_BEDIENELEMENT);
  });

  it("der Fokusring (action) hebt sich von beiden Flaechen ab", () => {
    for (const flaeche of FLAECHEN) {
      expect(kontrast(token("action"), token(flaeche))).toBeGreaterThanOrEqual(AA_BEDIENELEMENT);
    }
  });
});

// =============================================
// Muster
// =============================================

describe("Reiter-Muster der Musterseite", () => {
  it("zeigt vier Reiter, zwei mit Zaehler; die Zeile „Gewählt“ folgt dem Wechsel", async () => {
    render(<ReiterMuster />);
    expect(screen.getByRole("tablist", { name: "Bereiche des Vorgangs" })).toBeTruthy();
    expect(reiter().map((r) => r.textContent)).toEqual(["Übersicht", "Vertragsdaten", "Dokumente1", "E-Mails0"]);
    expect(screen.getByText("Gewählt: Übersicht")).toBeTruthy();
    klick(screen.getByRole("tab", { name: "Dokumente 1" }));
    expect(screen.getByText("Gewählt: Dokumente")).toBeTruthy();
    expect(screen.getByText("Verlängerungsvertrag")).toBeTruthy();
    tabInDieLeiste();
    await taste("ArrowRight", 3);
    expect(screen.getByText("Gewählt: E-Mails")).toBeTruthy();
    expect(document.querySelector("[data-leerzustand]")).not.toBeNull();
  });

  it("axe findet in keinem Reiter etwas; Ueberschriften nur h2 (die Musterseite erlaubt keine h3)", async () => {
    const { container } = render(
      <main>
        <h1>UI-Muster</h1>
        <ReiterMuster />
      </main>,
    );
    for (let i = 0; i < 4; i += 1) {
      klick(reiter()[i]);
      expect(gewaehlt()[i]).toBe("true");
      expect(await axeVerstoesse(container)).toEqual([]);
      const ebenen = Array.from(container.querySelectorAll("h2, h3, h4")).map((h) => h.tagName);
      expect(ebenen).toEqual(["H2"]);
    }
    // Der Leerzustand steht nur im letzten Reiter – nicht im zuerst gezeigten.
    klick(reiter()[0]);
    expect(document.querySelector("[data-leerzustand]")).toBeNull();
    expect(container.innerHTML).not.toMatch(/\btext-ink-3\b/);
  });
});
