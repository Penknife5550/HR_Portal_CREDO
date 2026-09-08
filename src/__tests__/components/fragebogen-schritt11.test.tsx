/**
 * @jest-environment jsdom
 */

/**
 * Schritt 11 des Personalfragebogens — der Hinweis bei
 * "Rentenversicherungsfrei von Gesetzes wegen".
 *
 * Hier gilt seit der Durchsicht 09/2026 eine harte Regel: **Der Schritt kreuzt
 * NICHTS an.** Vorher belegte er die Auswahl mit "RENTENVERSICHERUNGSFREI" vor,
 * sobald im Schritt "Weitere Beschaeftigung" ein freistellender Status stand.
 * Damit genuegte ein Klick auf "Weiter", ohne dass die Person je eine der vier
 * Zeilen angeklickt haette — und `PUT /api/fragebogen/[token]` schrieb den Wert
 * samt `rvEntscheidungAm` fest. In der Akte stand dann eine datierte
 * Entscheidung zur folgenreichsten Frage des Fragebogens, die niemand
 * getroffen hat. Dieselbe Begruendung wie bei `reqJaNein` in
 * validations/personal-data.ts: Bei einer Frage, deren Antwort eine Pflicht
 * entfallen laesst, ist die Vorbelegung selbst die Antwort.
 *
 * Der Hinweis bleibt, er wird nur nicht mehr zum Kreuz. Und sein Wortlaut haengt
 * am tatsaechlichen Zustand, nicht am Status allein — sonst entsteht der zweite
 * Fehler, den diese Datei festhaelt: Nach dem Weg, den die Schrittleiste bequem
 * macht (erst hier "versichert bleiben" waehlen und speichern, dann zurueck zu
 * "Weitere Beschaeftigung", dort "Altersvollrentner" setzen und wieder
 * herspringen), behauptete der gelbe Kasten woertlich, "Ich bin bereits von
 * Gesetzes wegen frei" sei gewaehlt, und das Abzeichen klebte an dieser nicht
 * angekreuzten Zeile.
 *
 * Deshalb pruefen die Zusicherungen unten Text UND Ankreuzung gemeinsam.
 *
 * Umgebung wie in fragebogen-schritt6.test.tsx: jsdom im Docblock, kein
 * @testing-library/jest-dom.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { Step11Rente } from "@/app/fragebogen/[token]/steps/step11-rente";
import { getRvOption } from "@/lib/minijob-rentenversicherung";

// React 19 verlangt diese Marke, bevor act() Zustandsaenderungen einsammeln darf.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const FREI_LABEL = getRvOption("RENTENVERSICHERUNGSFREI")!.label;
const BLEIBT_LABEL = getRvOption("KEINE_BEFREIUNG")!.label;

function zeige(
  data: Record<string, unknown>,
  onNext: (werte: Record<string, unknown>) => void = () => {}
) {
  return render(
    <Step11Rente
      data={data}
      onNext={onNext}
      onBack={() => {}}
      saving={false}
      token="tok"
    />
  );
}

/** Das Radio zu einer Antwortzeile — ueber die Beschriftung gefunden. */
function radio(label: string): HTMLInputElement {
  const zeile = screen.getByText(label).closest("label");
  if (!zeile) throw new Error(`Keine Antwortzeile zu "${label}" gefunden`);
  const feld = zeile.querySelector<HTMLInputElement>('input[type="radio"]');
  if (!feld) throw new Error(`Kein Radio in der Zeile "${label}"`);
  return feld;
}

describe("Schritt 11: Hinweis bei gesetzlicher Rentenversicherungsfreiheit", () => {
  it("kreuzt NICHTS an, auch nicht bei einem freistellenden Status", () => {
    const { container } = zeige({
      beschaeftigungsStatus: "ALTERSVOLLRENTNER_NACH_REGELALTERSGRENZE",
    });

    // Der Kern: keine der vier Zeilen ist angekreuzt.
    expect(radio(FREI_LABEL).checked).toBe(false);
    expect(radio(BLEIBT_LABEL).checked).toBe(false);

    // Der Hinweis bleibt — er empfiehlt, er behauptet nichts.
    const text = container.textContent ?? "";
    expect(text).toContain("von Gesetzes wegen frei");
    expect(text).toContain("vorausgekreuzt haben wir nichts");
    expect(
      screen.getByText("Empfohlen aufgrund Ihrer Angabe zur Beschäftigung")
    ).toBeTruthy();
    expect(screen.queryByText(/bereits gewählt/)).toBeNull();
  });

  it("speichert ohne eigene Auswahl NICHTS und sagt, was fehlt", () => {
    const gesendet: Record<string, unknown>[] = [];
    const { container } = zeige(
      { beschaeftigungsStatus: "ALTERSVOLLRENTNER_NACH_REGELALTERSGRENZE" },
      (werte) => gesendet.push(werte)
    );

    const formular = container.querySelector("form");
    if (!formular) throw new Error("Kein Formular gefunden");
    fireEvent.submit(formular);

    // Genau der Befund: Frueher ging hier ein datiertes
    // "RENTENVERSICHERUNGSFREI" an den Server, das niemand angeklickt hatte.
    expect(gesendet).toHaveLength(0);
    expect(
      screen.getByText("Bitte wählen Sie aus, wie Sie sich entscheiden.")
    ).toBeTruthy();
  });

  it("bestaetigt die Auswahl, wenn sie zur Angabe passt", () => {
    zeige({
      beschaeftigungsStatus: "ALTERSVOLLRENTNER_NACH_REGELALTERSGRENZE",
      rvEntscheidung: "RENTENVERSICHERUNGSFREI",
    });

    expect(radio(FREI_LABEL).checked).toBe(true);
    expect(
      screen.getByText("Passt zu Ihrer Angabe zur Beschäftigung")
    ).toBeTruthy();
    expect(screen.getByText("Ihre Auswahl passt zu Ihren Angaben")).toBeTruthy();
  });

  it("behauptet KEINE Auswahl, wenn eine abweichende Antwort gespeichert ist", () => {
    zeige({
      beschaeftigungsStatus: "ALTERSVOLLRENTNER_NACH_REGELALTERSGRENZE",
      rvEntscheidung: "KEINE_BEFREIUNG",
    });

    // Der Zustand, um den es geht: die gespeicherte Antwort steht.
    expect(radio(BLEIBT_LABEL).checked).toBe(true);
    expect(radio(FREI_LABEL).checked).toBe(false);

    // ... und der Text sagt das auch. Kein "bereits gewählt" mehr, und das
    // Abzeichen an der nicht angekreuzten Zeile behauptet keine Auswahl.
    expect(screen.queryByText(/bereits gewählt/)).toBeNull();
    expect(screen.queryByText("Aufgrund Ihrer Angabe vorausgewählt")).toBeNull();
    expect(
      screen.getByText("Empfohlen aufgrund Ihrer Angabe zur Beschäftigung")
    ).toBeTruthy();
  });

  it("benennt im Widerspruchsfall beides: was der Status sagt und was gewaehlt ist", () => {
    const { container } = zeige({
      beschaeftigungsStatus: "VERSORGUNGSEMPFAENGER",
      rvEntscheidung: "KEINE_BEFREIUNG",
    });

    const text = container.textContent ?? "";
    // Der Hinweis bleibt stehen — die Angabe zur Beschaeftigung ist ja weiter
    // da; er sagt nur nicht mehr, sie sei umgesetzt.
    expect(text).toContain("von Gesetzes wegen frei");
    expect(text).toContain(BLEIBT_LABEL);
    expect(text).toContain("War das ein Versehen");
  });

  it("laesst die gespeicherte Antwort unangetastet — der Kasten stellt nichts um", () => {
    zeige({
      beschaeftigungsStatus: "VERSORGUNGSEMPFAENGER",
      rvEntscheidung: "BEFREIUNG_BEANTRAGT",
    });

    expect(radio(getRvOption("BEFREIUNG_BEANTRAGT")!.label).checked).toBe(true);
    expect(radio(FREI_LABEL).checked).toBe(false);
  });

  it("zeigt ohne freistellenden Status weder Kasten noch Abzeichen", () => {
    const { container } = zeige({
      beschaeftigungsStatus: "ARBEITNEHMER_HAUPTBESCHAEFTIGUNG",
    });

    expect(radio(FREI_LABEL).checked).toBe(false);
    expect(screen.queryByText("Passt zu Ihrer Angabe zur Beschäftigung")).toBeNull();
    expect(
      screen.queryByText("Empfohlen aufgrund Ihrer Angabe zur Beschäftigung")
    ).toBeNull();
    expect(container.textContent ?? "").not.toContain("War das ein Versehen");
  });
});
