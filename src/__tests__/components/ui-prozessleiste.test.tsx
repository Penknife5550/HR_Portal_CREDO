/**
 * @jest-environment jsdom
 */

/**
 * Prozessleiste (UX-Umbau „Klarer Weg", Pilot Vertragsende).
 *
 * Geprueft werden die Regeln aus dem Kopfkommentar des Bausteins: geordnete
 * Liste, jeder Zustand mit Wort und ohne Farbe erkennbar, ein Schritt nur mit
 * `reiter` UND Handler ein Knopf, „Jetzt dran" mit Frist und Pille, Knoepfe nur
 * mit `jetztDran`, das Ende, die Kurzform fuer schmale Bildschirme, nichts
 * abgeschnitten. Dazu axe ueber fuenf Lagen und der Kontrast der Paare aus
 * `PROZESS_FARBEN`.
 *
 * Die Staende sind von Hand gebaut: Der Baustein kennt kein Modul, sein Test
 * auch nicht (den Adapter des Vertragsendes prueft prozess-vertragsende.test.ts).
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { Button } from "@/components/ui/button";
import {
  PROZESS_FARBEN,
  Prozessleiste,
  SCHRITT_WORT,
  SCHRITT_WORT_NICHT_ERREICHT,
} from "@/components/ui/prozessleiste";
import {
  BEI_NAME,
  ENDE_NAME,
  schrittKurzform,
  type JetztDran,
  type ProzessSchritt,
  type ProzessStand,
  type SchrittStatus,
} from "@/lib/prozess/prozess-stand";
import { AA_TEXT, kontrast } from "@/lib/ui/kontrast";
import { axeVerstoesse } from "../hilfen/axe";
import { FLAECHEN, token } from "../hilfen/farb-tokens";

// =============================================
// Staende
// =============================================

const s = (key: string, titel: string, status: SchrittStatus, rest: Partial<ProzessSchritt> = {}): ProzessSchritt => ({
  key,
  titel,
  status,
  ...rest,
});

const stand = (schritte: ProzessSchritt[], rest: Partial<ProzessStand> = {}): ProzessStand => ({
  modus: "schritte",
  schritte,
  jetztDran: null,
  ...rest,
});

const DRAN: JetztDran = {
  satz: "Vertrag erstellen und unterschrieben zurückholen",
  bei: "HR",
  unterzeile: "Danach: Vorgang abschließen",
  frist: "Vertragsende 30.09.2026 · in 4 Tagen",
  dringlichkeit: "critical",
  aktion: "erfassen",
  nebenAktion: "dokumente",
};

/** Laufender Ablauf mit allen vier Zustaenden, einer Verzweigung und einem Schritt mit Reiter. */
const LAEUFT = stand(
  [
    s("angelegt", "Angelegt", "erledigt", { datum: "2026-05-02T08:00:00.000Z" }),
    s("anfrage", "Anfrage", "uebersprungen", { zustaendig: "HR" }),
    s("rueckmeldung", "Rückmeldung", "erledigt", {
      zustaendig: "Führungskraft",
      notiz: "Übernahme",
      datum: "2026-05-20T10:00:00.000Z",
      sonst: "sonst: Offboarding",
    }),
    s("vertrag", "Vertrag", "aktiv", { zustaendig: "HR", reiter: "dokumente" }),
    s("abschluss", "Abschluss", "kommend", { zustaendig: "HR", notiz: "MAV offen" }),
  ],
  { jetztDran: DRAN },
);

const WARTET = stand(
  [
    s("angelegt", "Angelegt", "erledigt"),
    s("anfrage", "Anfrage", "erledigt", { zustaendig: "HR" }),
    s("rueckmeldung", "Rückmeldung", "aktiv", { zustaendig: "Führungskraft" }),
    s("abschluss", "Abschluss", "kommend"),
  ],
  {
    jetztDran: {
      satz: "Wartet auf die Rückmeldung",
      bei: "FUEHRUNGSKRAFT",
      frist: "Vertragsende 31.01.2027 · in 127 Tagen",
      dringlichkeit: "wait",
    },
  },
);

const ABGESCHLOSSEN = stand(
  [s("angelegt", "Angelegt", "erledigt"), s("anfrage", "Anfrage", "uebersprungen"), s("abschluss", "Abschluss", "erledigt")],
  { ende: "abgeschlossen" },
);

const ABGEBROCHEN = stand(
  [
    s("angelegt", "Angelegt", "erledigt"),
    s("anfrage", "Anfrage", "erledigt"),
    s("rueckmeldung", "Rückmeldung", "kommend"),
    s("abschluss", "Abschluss", "kommend"),
  ],
  { ende: "abgebrochen" },
);

/** Stand unbekannt: nichts dran, kein Ende. */
const UNBEKANNT = stand([s("angelegt", "Angelegt", "erledigt"), s("anfrage", "Anfrage", "kommend")]);

const HAUPT = <Button variante="critical">Vertrag erfassen …</Button>;
const NEBEN = <Button>Zu den Dokumenten</Button>;

const schritte = () => screen.getAllByRole("listitem");
const schritt = (index: number) => schritte()[index];
const punkt = (li: HTMLElement) => li.querySelector<HTMLElement>(".rounded-full")!;
const linien = (li: HTMLElement) => Array.from(li.querySelectorAll<HTMLElement>(":scope > span.absolute"));

// =============================================
// Schritte
// =============================================

describe("Prozessleiste: Schritte", () => {
  it("ist eine geordnete Liste mit Namen – Vorgabe „Ablauf“, sonst das Label", () => {
    const { rerender } = render(<Prozessleiste stand={LAEUFT} />);
    const liste = screen.getByRole("list", { name: "Ablauf" });
    expect(liste.tagName).toBe("OL");
    // Ausdruecklich: Ohne Listenzeichen (Tailwind) sagt Safari mit VoiceOver ein
    // `ol` ausserhalb von `nav` sonst nicht als Liste an — „3 von 5" entfiele.
    expect(liste.getAttribute("role")).toBe("list");
    expect(within(liste).getAllByRole("listitem")).toHaveLength(5);
    expect(schritte().map((li) => li.getAttribute("data-status"))).toEqual([
      "erledigt",
      "uebersprungen",
      "erledigt",
      "aktiv",
      "kommend",
    ]);
    rerender(<Prozessleiste stand={LAEUFT} label="Ablauf des Vertragsendes" />);
    expect(screen.getByRole("list", { name: "Ablauf des Vertragsendes" })).toBeTruthy();
  });

  it("genau der aktive Schritt traegt aria-current=step; ohne aktiven Schritt keiner", () => {
    const { container, rerender } = render(<Prozessleiste stand={LAEUFT} />);
    const aktuelle = Array.from(container.querySelectorAll('[aria-current="step"]'));
    expect(aktuelle).toEqual([schritt(3)]);
    rerender(<Prozessleiste stand={ABGESCHLOSSEN} />);
    expect(container.querySelector("[aria-current]")).toBeNull();
  });

  it.each(Object.keys(SCHRITT_WORT) as SchrittStatus[])(
    "%s hat sein Wort fuer Screenreader; der Punkt selbst ist Zierde",
    (status) => {
      render(<Prozessleiste stand={LAEUFT} />);
      const li = schritte().find((el) => el.getAttribute("data-status") === status)!;
      expect(li.querySelector(".sr-only")!.textContent).toBe(`(${SCHRITT_WORT[status]})`);
      expect(punkt(li).getAttribute("aria-hidden")).toBe("true");
    },
  );

  it("die Woerter sind deutsch und verschieden", () => {
    expect(SCHRITT_WORT).toEqual({
      erledigt: "erledigt",
      aktiv: "aktuell",
      kommend: "kommt noch",
      uebersprungen: "übersprungen",
    });
  });

  it("jeder Zustand ist ohne Farbe erkennbar: Haken, Hof und fetter Titel, Nummer, gestrichelter Rand", () => {
    render(<Prozessleiste stand={LAEUFT} />);
    const [erledigt, uebersprungen, , aktiv, kommend] = schritte();

    expect(punkt(erledigt).querySelector("svg")).not.toBeNull();
    expect(punkt(erledigt).textContent).toBe("");

    expect(punkt(aktiv).textContent).toBe("4");
    expect(punkt(aktiv).className).toContain("ring-4");
    expect(within(aktiv).getByText("Vertrag").className).toContain("font-semibold");

    expect(punkt(kommend).textContent).toBe("5");
    expect(punkt(kommend).className).not.toContain("ring-4");
    expect(punkt(kommend).className).not.toContain("border-dashed");
    expect(within(kommend).getByText("Abschluss").className).not.toContain("font-semibold");

    expect(punkt(uebersprungen).textContent).toBe("2");
    expect(punkt(uebersprungen).className).toContain("border-dashed");
  });

  it("uebersprungen ist durchgestrichen UND benannt", () => {
    render(<Prozessleiste stand={LAEUFT} />);
    const li = schritt(1);
    expect(within(li).getByText("Anfrage").className).toContain("line-through");
    expect(li.textContent).toContain("übersprungen");
    // Nur der uebersprungene Schritt.
    expect(within(schritt(0)).getByText("Angelegt").className).not.toContain("line-through");
  });

  it("die Farben kommen aus PROZESS_FARBEN", () => {
    render(<Prozessleiste stand={LAEUFT} />);
    for (const li of schritte()) {
      const farben = PROZESS_FARBEN.schritt[li.getAttribute("data-status") as SchrittStatus];
      for (const klasse of farben.punkt.split(" ")) expect(punkt(li).className).toContain(klasse);
    }
    expect(punkt(schritt(3)).className).toContain(PROZESS_FARBEN.hof);
  });

  /**
   * Gerechnet wird die Tabelle, gezeichnet das Markup — beides muss dasselbe
   * sein. Jede Farbklasse (Text, Rand, Flaeche, Ring), die irgendwo in der
   * Leiste steht, muss aus `PROZESS_FARBEN` kommen; eine fest eingetragene
   * (`text-wait` fuer die Frist) liefe sonst am Kontrasttest vorbei.
   * Ausgenommen: die Flaeche der Leiste selbst, der Fokusring, der
   * durchsichtige Rand und die Systemfarben des Kontrastmodus — und was in der
   * Statuspille steht (eigene Tabelle `STATUS_TOENE`).
   */
  it.each([
    ["laufend, mit Reiter-Knopf", LAEUFT],
    ["wartend", WARTET],
    ["abgeschlossen", ABGESCHLOSSEN],
    ["abgebrochen", ABGEBROCHEN],
  ])("keine Farbklasse am Markup vorbei an der Tabelle (%s)", (_name, lage) => {
    const { container } = render(<Prozessleiste stand={lage} onReiter={() => {}} />);
    const erlaubt = new Set(
      [
        ...Object.values(PROZESS_FARBEN.schritt).flatMap((f) => [f.punkt, f.titel, f.unterzeile]),
        ...Object.values(PROZESS_FARBEN.linie),
        PROZESS_FARBEN.hof,
        PROZESS_FARBEN.sonst,
        PROZESS_FARBEN.kurzform,
        ...Object.values(PROZESS_FARBEN.jetztDran),
        ...Object.values(PROZESS_FARBEN.ende),
      ].flatMap((klassen) => klassen.split(" ")),
    );
    const FARBE = /^(?:text|bg|border|ring|divide|outline)-(?:surface|card|ink|hairline|action|ok|wait|info|critical|neutral|transparent)/;
    const AUSGENOMMEN = new Set(["bg-card", "ring-hairline", "divide-hairline", "border-transparent"]);
    const fremd = new Set<string>();
    for (const el of [container.firstElementChild!, ...container.querySelectorAll("*")]) {
      if (el.closest("[data-ton]")) continue; // Statuspille: eigene Tabelle
      // `className` eines <svg> ist kein String — das Attribut lesen.
      for (const klasse of (el.getAttribute("class") ?? "").split(/\s+/)) {
        if (klasse.includes(":")) continue; // focus-visible:, forced-colors:, group-hover:
        if (FARBE.test(klasse) && !erlaubt.has(klasse) && !AUSGENOMMEN.has(klasse)) fremd.add(klasse);
      }
    }
    expect([...fremd]).toEqual([]);
  });

  it("jeder Text nimmt SEINEN Eintrag der Tabelle: Titel, Unterzeile, anderer Weg, Jetzt dran, Ende", () => {
    const { container, rerender } = render(<Prozessleiste stand={LAEUFT} />);
    const klassen = (el: Element) => (el.getAttribute("class") ?? "").split(/\s+/);
    for (const li of schritte()) {
      const farben = PROZESS_FARBEN.schritt[li.getAttribute("data-status") as SchrittStatus];
      const [titel, , unterzeile] = Array.from(li.querySelectorAll(":scope > div > span")).slice(1);
      expect(klassen(titel)).toContain(farben.titel);
      if (unterzeile && !unterzeile.className.includes("border-dashed")) {
        expect(klassen(unterzeile)).toContain(farben.unterzeile);
      }
    }
    for (const klasse of PROZESS_FARBEN.sonst.split(" ")) {
      expect(klassen(screen.getByText("sonst: Offboarding"))).toContain(klasse);
    }
    const kasten = container.querySelector("[data-jetzt-dran]")!;
    expect(klassen(within(kasten as HTMLElement).getByText(/^Jetzt dran/))).toContain(PROZESS_FARBEN.jetztDran.label);
    expect(klassen(screen.getByText(DRAN.satz))).toContain(PROZESS_FARBEN.jetztDran.satz);
    expect(klassen(screen.getByText(DRAN.unterzeile!))).toContain(PROZESS_FARBEN.jetztDran.unterzeile);
    expect(klassen(screen.getByText(DRAN.frist!))).toContain(PROZESS_FARBEN.jetztDran.frist);

    for (const [lage, ende] of [
      [ABGESCHLOSSEN, "abgeschlossen"],
      [ABGEBROCHEN, "abgebrochen"],
    ] as const) {
      rerender(<Prozessleiste stand={lage} />);
      const symbol = container.querySelector(`[data-ende="${ende}"] svg`)!;
      expect(klassen(symbol)).toContain(PROZESS_FARBEN.ende[ende]);
    }
  });

  it("der aktive Punkt bleibt im Windows-Kontrastmodus erkennbar (dort entfaellt der Hof)", () => {
    render(<Prozessleiste stand={LAEUFT} />);
    expect(punkt(schritt(3)).className).toContain("forced-colors:bg-[Highlight]");
    expect(punkt(schritt(4)).className).not.toContain("forced-colors:");
    // Der erledigte Punkt traegt einen Rand, die Linie IST ein Rand.
    expect(punkt(schritt(0)).className).toContain("border-2");
    for (const linie of linien(schritt(1))) expect(linie.className).toContain("border-t-2");
  });

  it("unter dem Titel stehen Zustaendigkeit, Notiz und Datum (deutsch); der nicht gewaehlte Weg gestrichelt", () => {
    render(<Prozessleiste stand={LAEUFT} />);
    expect(within(schritt(0)).getByText("02.05.2026")).toBeTruthy();
    expect(within(schritt(2)).getByText("Führungskraft · Übernahme · 20.05.2026")).toBeTruthy();
    expect(within(schritt(4)).getByText("HR · MAV offen")).toBeTruthy();
    const sonst = within(schritt(2)).getByText("sonst: Offboarding");
    expect(sonst.className).toContain("border-dashed");
    expect(screen.getAllByText(/^sonst:/)).toHaveLength(1);
  });

  it("ein unlesbares Datum faellt weg, statt „Invalid Date“ zu zeigen", () => {
    render(<Prozessleiste stand={stand([s("a", "Angelegt", "erledigt", { zustaendig: "HR", datum: "kein Datum" })])} />);
    expect(within(schritt(0)).getByText("HR")).toBeTruthy();
    expect(schritt(0).textContent).not.toContain("Invalid");
  });

  it("die Linie ist gruen, soweit der Ablauf sie hinter sich hat – auch ueber Uebersprungenes hinweg", () => {
    const { rerender } = render(<Prozessleiste stand={LAEUFT} />);
    const farben = () =>
      schritte().map((li) => linien(li).map((l) => (l.className.includes(PROZESS_FARBEN.linie.erledigt) ? "ok" : "offen")));
    // Erster und letzter Schritt haben nur eine halbe Linie.
    expect(farben()).toEqual([["ok"], ["ok", "ok"], ["ok", "ok"], ["ok", "offen"], ["offen"]]);
    for (const li of schritte()) {
      for (const linie of linien(li)) {
        expect(linie.getAttribute("aria-hidden")).toBe("true");
        if (!linie.className.includes(PROZESS_FARBEN.linie.erledigt)) {
          expect(linie.className).toContain(PROZESS_FARBEN.linie.offen);
        }
      }
    }
    rerender(<Prozessleiste stand={ABGEBROCHEN} />);
    expect(farben()).toEqual([["ok"], ["ok", "offen"], ["offen", "offen"], ["offen"]]);
  });
});

// =============================================
// Schritt als Knopf
// =============================================

describe("Prozessleiste: Schritt mit Reiter", () => {
  it("ist mit onReiter ein Knopf (der ganze Schritt) und ruft ihn mit dem Reiter", () => {
    const onReiter = jest.fn();
    render(<Prozessleiste stand={LAEUFT} onReiter={onReiter} />);
    const knoepfe = within(screen.getByRole("list")).getAllByRole("button");
    // Schritte ohne `reiter` sind nie ein Knopf.
    expect(knoepfe).toHaveLength(1);
    const knopf = within(schritt(3)).getByRole("button", { name: /^Vertrag \(aktuell\) HR/ });
    expect(knopf).toBe(knoepfe[0]);
    expect(knopf.getAttribute("type")).toBe("button");
    expect(knopf.className).toContain("focus-visible:outline-action");
    // Der Punkt liegt IM Knopf: Auf schmalen Bildschirmen ist er das Einzige, was man trifft.
    expect(knopf.contains(punkt(schritt(3)))).toBe(true);
    fireEvent.click(knopf);
    expect(onReiter).toHaveBeenCalledTimes(1);
    expect(onReiter).toHaveBeenCalledWith("dokumente");
  });

  it("ohne Handler ist kein Schritt ein Knopf", () => {
    render(<Prozessleiste stand={LAEUFT} />);
    expect(screen.queryAllByRole("button")).toEqual([]);
    expect(within(schritt(3)).getByText("Vertrag")).toBeTruthy();
  });
});

// =============================================
// Jetzt dran und Ende
// =============================================

describe("Prozessleiste: Jetzt dran", () => {
  const kasten = (container: HTMLElement) => container.querySelector<HTMLElement>("[data-jetzt-dran]");

  it("zeigt Satz, bei wem, Unterzeile und Frist", () => {
    const { container } = render(<Prozessleiste stand={LAEUFT} />);
    const k = within(kasten(container)!);
    expect(k.getByText(`Jetzt dran · ${BEI_NAME.HR}`)).toBeTruthy();
    expect(k.getByText("Vertrag erstellen und unterschrieben zurückholen").className).toContain("font-semibold");
    expect(k.getByText("Danach: Vorgang abschließen")).toBeTruthy();
    expect(k.getByText("Vertragsende 30.09.2026 · in 4 Tagen")).toBeTruthy();
  });

  it("nennt die Fuehrungskraft beim Namen aus BEI_NAME", () => {
    const { container } = render(<Prozessleiste stand={WARTET} />);
    expect(BEI_NAME.FUEHRUNGSKRAFT).toBe("Führungskraft");
    expect(within(kasten(container)!).getByText("Jetzt dran · Führungskraft")).toBeTruthy();
  });

  it("die Dringlichkeit steht als Pille mit Wort da – nie nur als Farbe", () => {
    const { container, rerender } = render(<Prozessleiste stand={LAEUFT} />);
    const pille = () => kasten(container)!.querySelector("[data-ton]");
    expect(pille()!.getAttribute("data-ton")).toBe("critical");
    expect(pille()!.textContent).toBe("Kritisch");

    rerender(<Prozessleiste stand={WARTET} />);
    expect(pille()!.getAttribute("data-ton")).toBe("wait");
    expect(pille()!.textContent).toBe("Frist naht");

    rerender(<Prozessleiste stand={{ ...LAEUFT, jetztDran: { ...DRAN, dringlichkeit: undefined } }} />);
    expect(pille()).toBeNull();
    expect(screen.getByText("Vertragsende 30.09.2026 · in 4 Tagen")).toBeTruthy();
  });

  it("Knoepfe: Hauptknopf zuerst im Quelltext, dann die Nebenhandlung", () => {
    const { container } = render(<Prozessleiste stand={LAEUFT} aktion={HAUPT} nebenAktion={NEBEN} />);
    const knoepfe = within(kasten(container)!).getAllByRole("button");
    expect(knoepfe.map((k) => k.textContent)).toEqual(["Vertrag erfassen …", "Zu den Dokumenten"]);
  });

  it("ohne Bearbeitungsrecht (keine Knoepfe mitgegeben) steht der Satz ohne Knopf da", () => {
    render(<Prozessleiste stand={LAEUFT} aktion={false} nebenAktion={undefined} />);
    expect(screen.getByText("Vertrag erstellen und unterschrieben zurückholen")).toBeTruthy();
    expect(screen.queryAllByRole("button")).toEqual([]);
  });

  it.each([
    ["abgeschlossen", ABGESCHLOSSEN],
    ["abgebrochen", ABGEBROCHEN],
    ["unbekannt", UNBEKANNT],
  ])("ohne jetztDran gibt es keine Knoepfe, auch wenn die Seite welche mitgibt (%s)", (_name, lage) => {
    const { container } = render(<Prozessleiste stand={lage} aktion={HAUPT} nebenAktion={NEBEN} />);
    expect(screen.queryAllByRole("button")).toEqual([]);
    expect(kasten(container)).toBeNull();
  });
});

describe("Prozessleiste: Ende", () => {
  it("abgeschlossen: der Kasten sagt „Abgeschlossen“, das Symbol ist Zierde", () => {
    const { container } = render(<Prozessleiste stand={ABGESCHLOSSEN} />);
    const ende = container.querySelector<HTMLElement>('[data-ende="abgeschlossen"]')!;
    expect(within(ende).getByText("Abgeschlossen")).toBeTruthy();
    expect(ende.querySelector("svg")!.getAttribute("aria-hidden")).toBe("true");
    expect(screen.queryByText(/Jetzt dran/)).toBeNull();
  });

  it("abgebrochen: „Abgebrochen“; nicht erreichte Schritte heissen so und bleiben zurueckgenommen", () => {
    const { container } = render(<Prozessleiste stand={ABGEBROCHEN} />);
    expect(within(container.querySelector<HTMLElement>('[data-ende="abgebrochen"]')!).getByText("Abgebrochen")).toBeTruthy();
    for (const li of [schritt(2), schritt(3)]) {
      expect(li.querySelector(".sr-only")!.textContent).toBe(`(${SCHRITT_WORT_NICHT_ERREICHT})`);
      expect(li.textContent).not.toContain(SCHRITT_WORT.kommend);
      expect(punkt(li).className).toContain("text-ink-2");
    }
    expect(within(schritt(2)).getByText("Rückmeldung").className).toContain(PROZESS_FARBEN.schritt.kommend.titel);
    // Was erledigt war, bleibt erledigt.
    expect(schritt(1).querySelector(".sr-only")!.textContent).toBe("(erledigt)");
  });

  it("ohne jetztDran und ohne Ende entfaellt der Kasten ganz", () => {
    const { container } = render(<Prozessleiste stand={UNBEKANNT} />);
    expect(container.querySelector("[data-jetzt-dran]")).toBeNull();
    expect(container.querySelector("[data-ende]")).toBeNull();
    expect(screen.getByRole("list", { name: "Ablauf" })).toBeTruthy();
    // In einem laufenden Ablauf heisst ein kommender Schritt „kommt noch".
    expect(schritt(1).querySelector(".sr-only")!.textContent).toBe("(kommt noch)");
  });

  it("jetztDran geht vor: Steht beides im Stand, zeigt der Kasten, was zu tun ist", () => {
    const { container } = render(<Prozessleiste stand={{ ...LAEUFT, ende: "abgebrochen" }} />);
    expect(container.querySelector("[data-jetzt-dran]")).not.toBeNull();
    expect(container.querySelector("[data-ende]")).toBeNull();
  });

  it("ein leerer Stand zeichnet nichts", () => {
    const { container } = render(<Prozessleiste stand={stand([])} />);
    expect(container.innerHTML).toBe("");
  });

  it("die Woerter fuer das Ende sind dieselben wie in schrittKurzform", () => {
    expect(schrittKurzform(ABGESCHLOSSEN)).toBe(ENDE_NAME.abgeschlossen);
    expect(schrittKurzform(ABGEBROCHEN)).toBe(ENDE_NAME.abgebrochen);
  });
});

// =============================================
// Schmale Bildschirme, nichts abgeschnitten
// =============================================

describe("Prozessleiste: schmale Bildschirme", () => {
  it("die Kurzform steht unter den Punkten und ist ab 640 px weg", () => {
    render(<Prozessleiste stand={LAEUFT} />);
    expect(schrittKurzform(LAEUFT)).toBe("Schritt 4 von 5 · Vertrag");
    const kurz = screen.getByText("Schritt 4 von 5 · Vertrag");
    expect(kurz.className).toContain("sm:hidden");
    expect(kurz.className).toContain(PROZESS_FARBEN.kurzform);
  });

  it("Titel, Unterzeile und der andere Weg verschwinden nur optisch – Screenreader lesen sie weiter", () => {
    render(<Prozessleiste stand={LAEUFT} />);
    const li = schritt(2);
    for (const text of ["Rückmeldung", "Führungskraft · Übernahme · 20.05.2026", "sonst: Offboarding"]) {
      const klassen = within(li).getByText(text).className.split(" ");
      expect(klassen).toContain("max-sm:sr-only");
      expect(klassen).not.toContain("hidden");
      expect(klassen).not.toContain("max-sm:hidden");
    }
    // Die Punkte bleiben: in einer Zeile, ohne Umbruch der Liste.
    expect(screen.getByRole("list").className).not.toContain("flex-wrap");
    expect(punkt(li).className).not.toContain("sr-only");
  });

  it("am Ende des Ablaufs entfaellt die Kurzform – das Wort steht schon im Kasten", () => {
    render(<Prozessleiste stand={ABGESCHLOSSEN} />);
    expect(screen.getAllByText("Abgeschlossen")).toHaveLength(1);
  });

  it("die Knoepfe duerfen unter den Text rutschen", () => {
    const { container } = render(<Prozessleiste stand={LAEUFT} aktion={HAUPT} />);
    expect(container.querySelector("[data-jetzt-dran]")!.className).toContain("flex-wrap");
  });
});

describe("Prozessleiste: nichts wird abgeschnitten", () => {
  const LANG = stand(
    [
      s("a", "Voraussichtliche Rückmeldung der Einrichtungsleitung zur Weiterbeschäftigung", "aktiv", {
        zustaendig: "Einrichtungsleitung und Geschäftsführung gemeinsam",
        sonst: "sonst: Offboarding mit Auslaufmitteilung",
      }),
      s("b", "Abschluss", "kommend"),
    ],
    {
      jetztDran: {
        satz: "Wartet auf die Rückmeldung der Einrichtungsleitung zur Weiterbeschäftigung nach dem Ende der Befristung",
        bei: "FUEHRUNGSKRAFT",
        unterzeile: "Anfrage vom 08.09.2026 an eine.sehr.lange.adresse.der.schulleitung@beispiel.invalid · 2× erinnert",
        frist: "Vertragsende 31.01.2027 · in 127 Tagen",
        dringlichkeit: "wait",
      },
    },
  );

  it("lange Titel brechen zwischen den Woertern um; nirgends truncate, overflow-hidden oder nowrap", () => {
    const { container } = render(<Prozessleiste stand={LANG} />);
    expect(container.innerHTML).not.toMatch(/truncate|overflow-hidden|line-clamp|text-ellipsis|whitespace-nowrap/);
    expect(screen.getByText(/^Voraussichtliche Rückmeldung/).className).toContain("wrap-break-word");
    // Eine E-Mail-Adresse hat keine Wortgrenze: Sie bricht notfalls an jeder Stelle.
    expect(screen.getByText(/^Anfrage vom/).className).toContain("wrap-anywhere");
  });

  it("kein sticky, kein ink-3 als Text", () => {
    const { container } = render(<Prozessleiste stand={LAEUFT} aktion={HAUPT} nebenAktion={NEBEN} onReiter={() => {}} />);
    expect(container.innerHTML).not.toMatch(/\btext-ink-3\b/);
    expect(container.innerHTML).not.toMatch(/\bsticky\b/);
    const flaeche = container.querySelector<HTMLElement>("[data-prozessleiste]")!;
    for (const klasse of ["bg-card", "ring-1", "ring-hairline", "rounded-xl"]) expect(flaeche.className).toContain(klasse);
  });

  it("className landet auf der Flaeche", () => {
    const { container } = render(<Prozessleiste stand={LAEUFT} className="mt-6" />);
    expect(container.querySelector("[data-prozessleiste]")!.className).toContain("mt-6");
  });
});

// =============================================
// axe
// =============================================

describe("Prozessleiste: axe", () => {
  it.each([
    ["laeuft, mit Knoepfen und klickbarem Schritt", LAEUFT, true],
    ["wartet, ohne Knoepfe", WARTET, false],
    ["abgeschlossen", ABGESCHLOSSEN, false],
    ["abgebrochen", ABGEBROCHEN, false],
    ["Stand unbekannt", UNBEKANNT, false],
  ])("findet nichts: %s", async (_name, lage, mitHandlungen) => {
    const { container } = render(
      <main>
        <h1>Maria Muster</h1>
        {mitHandlungen ? (
          <Prozessleiste stand={lage} aktion={HAUPT} nebenAktion={NEBEN} onReiter={() => {}} />
        ) : (
          <Prozessleiste stand={lage} />
        )}
      </main>,
    );
    expect(await axeVerstoesse(container)).toEqual([]);
  });
});

// =============================================
// Kontrast der Paare aus PROZESS_FARBEN
// =============================================

describe("PROZESS_FARBEN: Kontrast", () => {
  // Tokens aus globals.css wie in ui-kontrast.test.ts (`hilfen/farb-tokens.ts`).
  const klassenMit = (klassen: string, praefix: "bg" | "text") =>
    klassen.split(/\s+/).filter((k) => k.startsWith(`${praefix}-`));
  const farbeAus = (klassen: string, praefix: "bg" | "text") => klassenMit(klassen, praefix)[0]?.slice(praefix.length + 1) ?? null;

  /** Alle Zeichenketten der Tabelle, mit ihrem Pfad. */
  function eintraege(knoten: unknown, pfad = ""): [string, string][] {
    if (typeof knoten === "string") return [[pfad, knoten]];
    return Object.entries(knoten as Record<string, unknown>).flatMap(([k, v]) => eintraege(v, pfad ? `${pfad}.${k}` : k));
  }
  const ALLE = eintraege(PROZESS_FARBEN);
  const STATUS = Object.keys(PROZESS_FARBEN.schritt) as SchrittStatus[];

  it("die Tabelle kennt jeden Zustand und je Eintrag hoechstens eine bg- und eine text-Klasse", () => {
    expect(STATUS.sort()).toEqual(Object.keys(SCHRITT_WORT).sort());
    expect(ALLE.length).toBeGreaterThanOrEqual(20);
    const zuViele = ALLE.filter(
      ([, klassen]) => klassenMit(klassen, "bg").length > 1 || klassenMit(klassen, "text").length > 1,
    ).map(([pfad]) => pfad);
    expect(zuViele).toEqual([]);
  });

  it("kein ink-3 als Text, keine Deckkraft, kein Filter, keine Palettenfarbe", () => {
    for (const [, klassen] of ALLE) {
      expect(klassen).not.toMatch(/\btext-ink-3\b/);
      expect(klassen).not.toMatch(/brightness|opacity|\/\d|#|-\d{2,3}\b/);
    }
  });

  it.each(STATUS)("%s: die Schrift im Punkt erreicht AA auf dem Grund des Punkts", (status) => {
    const { punkt: klassen } = PROZESS_FARBEN.schritt[status];
    const text = farbeAus(klassen, "text");
    const grund = farbeAus(klassen, "bg");
    expect(text).not.toBeNull();
    expect(grund).not.toBeNull();
    // Der Grund des Punkts ist deckend (`kontrast` wuerfe sonst).
    expect(kontrast(token(text!), token(grund!))).toBeGreaterThanOrEqual(AA_TEXT);
  });

  const TEXTE = ALLE.filter(([pfad, klassen]) => !pfad.endsWith(".punkt") && klassenMit(klassen, "text").length > 0);

  it("jeder Text der Leiste ist dabei: Titel und Unterzeile je Zustand, anderer Weg, Kurzform, Jetzt dran, Ende", () => {
    expect(TEXTE.map(([pfad]) => pfad).sort()).toEqual(
      [
        ...STATUS.flatMap((status) => [`schritt.${status}.titel`, `schritt.${status}.unterzeile`]),
        "sonst",
        "kurzform",
        "jetztDran.label",
        "jetztDran.satz",
        "jetztDran.unterzeile",
        "jetztDran.frist",
        "ende.abgeschlossen",
        "ende.abgebrochen",
      ].sort(),
    );
  });

  it.each(TEXTE)("%s (%s) erreicht AA – auf Karte und auf Seitengrund", (_pfad, klassen) => {
    const text = farbeAus(klassen, "text")!;
    for (const flaeche of FLAECHEN) {
      expect(kontrast(token(text), token(flaeche))).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });

  it("die zurueckgelegte Linie und der Rand des erledigten Punkts heben sich von beiden Flaechen ab", () => {
    // Zierde (der Zustand steht im Punkt und im Wort) — trotzdem sichtbar: 3:1.
    expect(PROZESS_FARBEN.linie.erledigt).toBe("border-ok");
    for (const flaeche of FLAECHEN) expect(kontrast(token("ok"), token(flaeche))).toBeGreaterThanOrEqual(3);
  });

  it("der Rand des uebersprungenen Punkts traegt Bedeutung und erreicht 3:1 – anders als der des kommenden", () => {
    // Unter 640 px ist der durchgestrichene Titel nicht zu sehen; „uebersprungen"
    // zeigt dann allein die Strichelung. Die Leiste steht immer auf `card`.
    const rand = (klassen: string) => klassen.split(" ").find((k) => k.startsWith("border-"))!.slice("border-".length);
    const uebersprungen = rand(PROZESS_FARBEN.schritt.uebersprungen.punkt);
    expect(kontrast(token(uebersprungen), token("card"))).toBeGreaterThanOrEqual(3);
    // Der kommende Punkt darf zart bleiben: Ihn traegt die Nummer (Text, oben gerechnet).
    expect(rand(PROZESS_FARBEN.schritt.kommend.punkt)).toBe("ink-3");
    expect(uebersprungen).not.toBe("ink-3");
  });
});
