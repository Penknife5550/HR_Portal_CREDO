/**
 * @jest-environment jsdom
 */

/**
 * Schritt 11 des Personalfragebogens — die Vorauswahl bei
 * "Rentenversicherungsfrei von Gesetzes wegen".
 *
 * Die Zustandslogik des Schritts ist richtig: Eine gespeicherte Antwort
 * schlaegt die Vorgabe aus dem Beschaeftigungsstatus. Der begleitende TEXT hing
 * frueher aber allein am Status und nicht daran, ob die Vorauswahl auch
 * tatsaechlich greift. Ergebnis nach dem Weg, den die neue Schrittleiste
 * bequem macht — erst hier "versichert bleiben" waehlen und speichern, dann
 * zurueck zu "Weitere Beschaeftigung", dort "Altersvollrentner" setzen und
 * wieder herspringen:
 *
 *   - der gelbe Kasten behauptete woertlich, "Ich bin bereits von Gesetzes
 *     wegen frei" sei bereits gewaehlt,
 *   - das Abzeichen "Aufgrund Ihrer Angabe vorausgewaehlt" klebte an dieser
 *     nicht angekreuzten Zeile,
 *   - angekreuzt war eine andere.
 *
 * Wer das liest und auf "Weiter" klickt, speichert nicht, was er zu speichern
 * glaubt — und zwar bei der Frage, die der Dateikopf selbst als die
 * folgenreichste des ganzen Fragebogens bezeichnet. Deshalb pruefen die
 * Zusicherungen unten Text UND Ankreuzung gemeinsam.
 *
 * Umgebung wie in fragebogen-schritt6.test.tsx: jsdom im Docblock, kein
 * @testing-library/jest-dom.
 */
import { render, screen } from "@testing-library/react";
import { Step11Rente } from "@/app/fragebogen/[token]/steps/step11-rente";
import { getRvOption } from "@/lib/minijob-rentenversicherung";

// React 19 verlangt diese Marke, bevor act() Zustandsaenderungen einsammeln darf.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const FREI_LABEL = getRvOption("RENTENVERSICHERUNGSFREI")!.label;
const BLEIBT_LABEL = getRvOption("KEINE_BEFREIUNG")!.label;

function zeige(data: Record<string, unknown>) {
  return render(
    <Step11Rente
      data={data}
      onNext={() => {}}
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

describe("Schritt 11: Vorauswahl bei gesetzlicher Rentenversicherungsfreiheit", () => {
  it("kuendigt die Vorauswahl nur an, wo sie auch greift", () => {
    zeige({ beschaeftigungsStatus: "ALTERSVOLLRENTNER_NACH_REGELALTERSGRENZE" });

    expect(radio(FREI_LABEL).checked).toBe(true);
    expect(screen.getByText(/bereits gewählt/)).toBeTruthy();
    expect(screen.getByText("Aufgrund Ihrer Angabe vorausgewählt")).toBeTruthy();
  });

  it("behauptet KEINE Vorauswahl, wenn eine abweichende Antwort gespeichert ist", () => {
    zeige({
      beschaeftigungsStatus: "ALTERSVOLLRENTNER_NACH_REGELALTERSGRENZE",
      rvEntscheidung: "KEINE_BEFREIUNG",
    });

    // Der Zustand, um den es geht: gespeichert schlaegt Vorgabe.
    expect(radio(BLEIBT_LABEL).checked).toBe(true);
    expect(radio(FREI_LABEL).checked).toBe(false);

    // ... und der Text sagt das auch. Kein "bereits gewählt" mehr, und das
    // Abzeichen an der nicht angekreuzten Zeile behauptet keine Auswahl.
    expect(screen.queryByText(/bereits gewählt/)).toBeNull();
    expect(screen.queryByText("Aufgrund Ihrer Angabe vorausgewählt")).toBeNull();
    expect(screen.getByText("Passt zu Ihrer Angabe zur Beschäftigung")).toBeTruthy();
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
    expect(screen.queryByText("Aufgrund Ihrer Angabe vorausgewählt")).toBeNull();
    expect(screen.queryByText("Passt zu Ihrer Angabe zur Beschäftigung")).toBeNull();
    expect(container.textContent ?? "").not.toContain("War das ein Versehen");
  });
});
