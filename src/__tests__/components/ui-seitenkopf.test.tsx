/**
 * @jest-environment jsdom
 */

/**
 * Seitenkopf und Segment-Schalter (UX-Umbau „Klarer Weg", U0).
 *
 * Geprueft werden die Regeln aus den Kopfkommentaren: Der Pfad kommt als
 * Eigenschaft, der letzte Eintrag ist die Seite; der Titel ist Ersatzziel fuer
 * den Fokus; ein Menuepunkt laeuft erst, wenn das Menue zu ist — damit ein
 * daraus geoeffneter Dialog den Fokus auf den „…"-Knopf zurueckgeben kann.
 * Segment: Auswahlgruppe mit Pfeiltasten, Zaehler im Namen.
 */
import { useState } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Button } from "@/components/ui/button";
import { BestaetigungsDialog } from "@/components/ui/dialog";
import { Segment, SEGMENT_FARBEN } from "@/components/ui/segment";
import { MENUE_FARBEN, Seitenkopf, SEITENTITEL_ID, type MenuePunkt } from "@/components/ui/seitenkopf";
import { Statuspille } from "@/components/ui/statuspille";
import { axeVerstoesse } from "../hilfen/axe";

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const PFAD = [
  { text: "Vorgänge", href: "/vorgaenge" },
  { text: "Vertragsende", href: "/vorgaenge/vertragsende" },
  { text: "Maria Muster", href: "/wird-ignoriert" },
];

async function menueOeffnen() {
  const knopf = screen.getByRole("button", { name: "Weitere Aktionen" });
  knopf.focus();
  fireEvent.keyDown(knopf, { key: "Enter" });
  await screen.findByRole("menu");
  return knopf;
}

// =============================================
// Seitenkopf
// =============================================

describe("Seitenkopf: Aufbau", () => {
  it("Pfad: Verweise bis auf den letzten Eintrag – der ist die Seite selbst", () => {
    render(<Seitenkopf pfad={PFAD} titel="Maria Muster" />);
    const pfad = screen.getByRole("navigation", { name: "Pfad" });
    const verweise = Array.from(pfad.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(verweise).toEqual(["/vorgaenge", "/vorgaenge/vertragsende"]);
    const seite = pfad.querySelector('[aria-current="page"]')!;
    expect(seite.textContent).toBe("Maria Muster");
    expect(seite.tagName).toBe("SPAN");
    // Trennzeichen sind Zierde.
    for (const svg of Array.from(pfad.querySelectorAll("svg"))) expect(svg.getAttribute("aria-hidden")).toBe("true");
  });

  it("ohne Pfad gibt es keine Navigation, ohne Menue keinen „…“-Knopf", () => {
    render(<Seitenkopf titel="Start" menue={[]} />);
    expect(screen.queryByRole("navigation")).toBeNull();
    expect(screen.queryByRole("button", { name: "Weitere Aktionen" })).toBeNull();
  });

  it("der Titel ist die h1 und per Programm fokussierbar (Ersatzziel der Dialoge), nicht per Tab", () => {
    render(<Seitenkopf titel="Maria Muster" />);
    const titel = screen.getByRole("heading", { level: 1, name: "Maria Muster" });
    expect(titel.id).toBe(SEITENTITEL_ID);
    expect(titel.getAttribute("tabindex")).toBe("-1");
    titel.focus();
    expect(document.activeElement).toBe(titel);
  });

  it("zeigt Unterzeile, Zustand und Primaerknopf; axe findet nichts – auch bei offenem Menue", async () => {
    render(
      <main>
        <Seitenkopf
          pfad={PFAD}
          titel="Maria Muster"
          unterzeile="Vertragsende · Berufskolleg · VE-2026-BK-004"
          status={<Statuspille ton="wait">Wartet auf Führungskraft</Statuspille>}
          aktion={<Button variante="primary">Verlängerung anlegen</Button>}
          menue={[
            { text: "Verlauf anzeigen", onWaehlen: () => {} },
            { text: "Zur Liste", href: "/vorgaenge" },
            { text: "Vorgang stornieren …", kritisch: true, onWaehlen: () => {} },
          ]}
        />
      </main>,
    );
    expect(screen.getByText("Vertragsende · Berufskolleg · VE-2026-BK-004")).toBeTruthy();
    expect(screen.getByText("Wartet auf Führungskraft")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Verlängerung anlegen" })).toBeTruthy();
    expect(await axeVerstoesse(document.body)).toEqual([]);
    await menueOeffnen();
    // Das offene Menue haengt in einem Portal an `body`, also ausserhalb von
    // `main` — axe meldet dafuer `region` (Empfehlung, kein WCAG-Kriterium;
    // ein Menue ist kein Seiteninhalt). Alles andere muss leer sein.
    const offen = await axeVerstoesse(document.body);
    expect(offen.filter((v) => !v.startsWith("region:"))).toEqual([]);
    expect(await axeVerstoesse(screen.getByRole("menu"))).toEqual([]);
  });
});

describe("Seitenkopf: Menue", () => {
  function mitMenue(menue: MenuePunkt[]) {
    return render(<Seitenkopf titel="Maria Muster" menue={menue} />);
  }

  it("zeigt die Punkte; ein Verweis ist ein Verweis, ein kritischer Punkt ist rot", async () => {
    mitMenue([
      { text: "Verlauf anzeigen", onWaehlen: () => {} },
      { text: "Zur Liste", href: "/vorgaenge" },
      { text: "Vorgang stornieren …", kritisch: true, onWaehlen: () => {} },
    ]);
    await menueOeffnen();
    const punkte = screen.getAllByRole("menuitem");
    expect(punkte.map((p) => p.textContent)).toEqual(["Verlauf anzeigen", "Zur Liste", "Vorgang stornieren …"]);
    expect(punkte[1].tagName).toBe("A");
    expect(punkte[1].getAttribute("href")).toBe("/vorgaenge");
    expect(punkte[2].className).toContain(MENUE_FARBEN.kritisch.ruhe);
    expect(punkte[0].className).toContain(MENUE_FARBEN.normal.ruhe);
  });

  it("die Aktion laeuft erst, wenn das Menue zu ist und der Fokus wieder auf dem „…“-Knopf liegt", async () => {
    let fokusBeimAufruf: Element | null = null;
    let menueOffenBeimAufruf = true;
    const aktion = jest.fn(() => {
      fokusBeimAufruf = document.activeElement;
      menueOffenBeimAufruf = screen.queryByRole("menu") !== null;
    });
    mitMenue([{ text: "Verlauf anzeigen", onWaehlen: aktion }]);
    const knopf = await menueOeffnen();
    fireEvent.click(screen.getByRole("menuitem", { name: "Verlauf anzeigen" }));
    await waitFor(() => expect(aktion).toHaveBeenCalledTimes(1));
    expect(menueOffenBeimAufruf).toBe(false);
    expect(fokusBeimAufruf).toBe(knopf);
  });

  it("Escape schliesst das Menue, ohne etwas auszuloesen", async () => {
    const aktion = jest.fn();
    mitMenue([{ text: "Verlauf anzeigen", onWaehlen: aktion }]);
    const knopf = await menueOeffnen();
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(knopf));
    expect(aktion).not.toHaveBeenCalled();
  });

  it("ein gesperrter Punkt bleibt sichtbar und tut nichts", async () => {
    const aktion = jest.fn();
    mitMenue([
      { text: "Als PDF exportieren", gesperrt: true, onWaehlen: aktion },
      { text: "Verlauf anzeigen", onWaehlen: () => {} },
    ]);
    await menueOeffnen();
    const punkt = screen.getByRole("menuitem", { name: "Als PDF exportieren" });
    expect(punkt.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(punkt);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(aktion).not.toHaveBeenCalled();
  });

  it("ein Dialog aus dem Menue gibt den Fokus beim Schliessen an den „…“-Knopf zurueck", async () => {
    function Seite() {
      const [offen, setOffen] = useState(false);
      return (
        <>
          <Seitenkopf titel="Maria Muster" menue={[{ text: "Vorgang stornieren …", kritisch: true, onWaehlen: () => setOffen(true) }]} />
          <BestaetigungsDialog
            offen={offen}
            onAbbrechen={() => setOffen(false)}
            onBestaetigen={() => setOffen(false)}
            titel="Vorgang stornieren?"
            bestaetigenText="Stornieren"
            fokusZiel={SEITENTITEL_ID}
          />
        </>
      );
    }
    render(<Seite />);
    const knopf = await menueOeffnen();
    fireEvent.click(screen.getByRole("menuitem", { name: "Vorgang stornieren …" }));
    await screen.findByRole("alertdialog", { name: "Vorgang stornieren?" });
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Abbrechen" })));
    fireEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(knopf));
  });
});

// =============================================
// Segment
// =============================================

describe("Segment", () => {
  const OPTIONEN = [
    { wert: "alle", text: "Alle", zahl: 24 },
    { wert: "kritisch", text: "Kritisch", zahl: 0 },
    { wert: "hr", text: "Bei HR" },
  ] as const;
  type Wert = (typeof OPTIONEN)[number]["wert"];

  function Probe({ start = "alle", onWechsel }: { start?: string; onWechsel?: (w: Wert) => void }) {
    const [wert, setWert] = useState(start as Wert);
    return (
      <Segment
        label="Sicht"
        wert={wert}
        optionen={OPTIONEN}
        onWechsel={(w) => {
          onWechsel?.(w);
          setWert(w);
        }}
      />
    );
  }

  const sichten = () => screen.getAllByRole("radio") as HTMLButtonElement[];
  const gewaehlt = () => sichten().map((s) => s.getAttribute("aria-checked"));

  it("ist eine benannte Auswahlgruppe; der Zaehler gehoert zum Namen, auch die Null", async () => {
    const { container } = render(<Probe />);
    expect(screen.getByRole("radiogroup", { name: "Sicht" })).toBeTruthy();
    expect(sichten().map((s) => s.textContent)).toEqual(["Alle24", "Kritisch0", "Bei HR"]);
    expect(screen.getByRole("radio", { name: "Kritisch 0" })).toBeTruthy();
    expect(gewaehlt()).toEqual(["true", "false", "false"]);
    for (const s of sichten()) expect(s.getAttribute("type")).toBe("button");
    expect(await axeVerstoesse(container)).toEqual([]);
  });

  it("Klick waehlt; ein Klick auf die gewaehlte Sicht meldet nichts", () => {
    const wechsel = jest.fn();
    render(<Probe onWechsel={wechsel} />);
    fireEvent.click(sichten()[0]);
    expect(wechsel).not.toHaveBeenCalled();
    fireEvent.click(sichten()[2]);
    expect(wechsel).toHaveBeenCalledWith("hr");
    expect(gewaehlt()).toEqual(["false", "false", "true"]);
  });

  it("nur die gewaehlte Sicht ist per Tab erreichbar", () => {
    render(<Probe start="kritisch" />);
    expect(sichten().map((s) => s.tabIndex)).toEqual([-1, 0, -1]);
  });

  it("Pfeiltasten wechseln rundum, Pos1 und Ende springen; der Fokus geht mit", () => {
    render(<Probe />);
    sichten()[0].focus();
    fireEvent.keyDown(document.activeElement!, { key: "ArrowRight" });
    expect(gewaehlt()).toEqual(["false", "true", "false"]);
    expect(document.activeElement).toBe(sichten()[1]);
    fireEvent.keyDown(document.activeElement!, { key: "End" });
    expect(document.activeElement).toBe(sichten()[2]);
    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
    expect(gewaehlt()).toEqual(["true", "false", "false"]);
    fireEvent.keyDown(document.activeElement!, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(sichten()[2]);
    fireEvent.keyDown(document.activeElement!, { key: "Home" });
    expect(document.activeElement).toBe(sichten()[0]);
    // Andere Tasten bleiben unberuehrt.
    fireEvent.keyDown(document.activeElement!, { key: "a" });
    expect(gewaehlt()).toEqual(["true", "false", "false"]);
  });

  it("passt der Wert zu keiner Sicht, ist keine gewaehlt und die erste erreichbar", () => {
    render(<Probe start="gibt-es-nicht" />);
    expect(gewaehlt()).toEqual(["false", "false", "false"]);
    expect(sichten().map((s) => s.tabIndex)).toEqual([0, -1, -1]);
  });

  it("die gewaehlte Sicht unterscheidet sich durch Flaeche UND Schriftstaerke", () => {
    render(<Probe />);
    const [aktiv, ruhe] = sichten();
    for (const k of SEGMENT_FARBEN.aktiv.split(" ")) expect(aktiv.className).toContain(k);
    expect(aktiv.className).toContain("font-semibold");
    expect(ruhe.className).toContain(SEGMENT_FARBEN.ruhe);
    expect(ruhe.className).not.toContain("font-semibold");
    expect(ruhe.className).not.toContain("bg-card");
  });
});
