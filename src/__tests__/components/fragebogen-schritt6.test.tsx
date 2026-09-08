/**
 * @jest-environment jsdom
 */

/**
 * Schritt 6 des Personalfragebogens — die drei Zusagen, die nur am gerenderten
 * Formular zu belegen sind.
 *
 *  1. **Der Widerruf wird gesendet.** Das Formular nennt die Kategorien, die es
 *     verantwortet (`beschaeftigungsKategorien`), statt sie aus den Zeilen
 *     abzuleiten. Sonst kann ein "Nein" die vorher eingetragenen Zeilen nicht
 *     entfernen — die Gegenprobe auf der Serverseite steht in
 *     src/__tests__/api/fragebogen-beschaeftigungs-zeilen.test.ts.
 *
 *  2. **Die 603-€-Frage bleibt im Minijob-Fragebogen.** Sie haengt an
 *     `summeUeberGeringfuegigkeitsgrenze` (defaultVisible: false). Ohne dieses
 *     Gate klappte sie in jedem TV-L- und Beamten-Fragebogen auf, weil die
 *     Statusbedingung dort mangels Status immer wahr ist — und die Antwort
 *     landete in der Personalakte zu einer Frage, die die Vorlage abgeschaltet
 *     hat.
 *
 *  3. **Die Mengengrenze ist sichtbar.** Der Server nimmt hoechstens 20 Zeilen.
 *     Wer das erst beim Klick auf "Weiter" erfaehrt, hat zwanzig Zeitraeume
 *     umsonst ausgefuellt.
 *
 * Umgebung wie in dokumentenpaket-dialog.test.tsx: jsdom im Docblock
 * (jest.config.ts bleibt global auf "node"), JSX aus der einen
 * transform-Regel, und ohne @testing-library/jest-dom — die Zusicherungen
 * kommen mit den nativen DOM-Eigenschaften aus.
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import {
  Step6Employment,
  MAX_BESCHAEFTIGUNGS_ZEILEN,
} from "@/app/fragebogen/[token]/steps/step6-employment";
import { FieldConfigHelper, getDefaultFieldConfig } from "@/lib/field-definitions";
import { beschaeftigungsAngabenListeSchema } from "@/lib/validations/beschaeftigungs-angaben";

// React 19 verlangt diese Marke, bevor act() Zustandsaenderungen einsammeln darf.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Feld-Konfiguration eines Schritts, bei der die genannten Felder sichtbar
 * sind und alle uebrigen nicht — so wie eine gespeicherte Vorlage sie liefert.
 */
function konfig(sichtbar: string[]): FieldConfigHelper {
  const felder = getDefaultFieldConfig(6).map((f) => ({
    ...f,
    visible: sichtbar.includes(f.name),
    // Pflicht nur, wo die Vorgabe es ohnehin vorsieht — sonst verlangte der
    // Test Angaben, die die echte Vorlage nicht verlangt.
    required: sichtbar.includes(f.name) && f.required,
  }));
  return new FieldConfigHelper(6, felder);
}

/** Die Vorlage MINIJOB: Abschnitt 2 und alle drei Tabellen aus Abschnitt 4. */
const MINIJOB = () =>
  konfig([
    "beschaeftigungsStatus",
    "alsArbeitsuchendGemeldet",
    "hasOtherEmployment",
    "summeUeberGeringfuegigkeitsgrenze",
    "vorbeschaeftigungenVorhanden",
    "auslandsbeschaeftigungVorhanden",
    "employerType",
  ]);

/**
 * Ein Fragebogen ohne Minijob-Teil (TV-L, Beamte, Erzieher). `hasOtherEmployment`
 * ist als einziges der Abschnitt-4-Felder defaultVisible: true — genau deshalb
 * ist dieser Fall der gefaehrliche.
 */
const TVL = () => konfig(["hasOtherEmployment", "employerType"]);

function rendern(
  fc: FieldConfigHelper,
  data: Record<string, unknown> = {},
) {
  const onNext = jest.fn();
  render(
    <Step6Employment
      data={data}
      onNext={onNext}
      onBack={jest.fn()}
      saving={false}
      fieldConfig={fc}
    />,
  );
  return onNext;
}

/** Die zwei Schaltflaechen einer Ja/Nein-Frage. */
function jaNein(gruppe: string) {
  const bereich = screen.getByRole("radiogroup", { name: gruppe });
  return {
    ja: within(bereich).getByRole("radio", { name: "Ja" }),
    nein: within(bereich).getByRole("radio", { name: "Nein" }),
  };
}

/** Eine gespeicherte Zeile, wie sie aus der Datenbank zurueckkommt. */
const gespeicherteZeile = (i: number) => ({
  kategorie: "WEITERE",
  beginn: `2026-01-${String((i % 28) + 1).padStart(2, "0")}T00:00:00.000Z`,
  ende: null,
  arbeitgeberName: `Arbeitgeber ${i}`,
  arbeitgeberAdresse: null,
  art: "GERINGFUEGIG_MIT_EIGENANTEIL",
  entgeltUeberGrenze: null,
  arbeitstage: null,
  beiArbeitsagentur: false,
});

// =============================================
// 1 — Der Widerruf
// =============================================
describe("Kategorien, die der Schritt verantwortet", () => {
  it("sendet nach einem Nein eine leere Zeilenliste UND alle drei Kategorien", async () => {
    const onNext = rendern(MINIJOB(), {
      beschaeftigungsStatus: "STUDENT",
      employerType: "nebenarbeitgeber",
      hasOtherEmployment: true,
      beschaeftigungsAngaben: [gespeicherteZeile(1)],
    });

    // Die Zeile ist da, die Grundfrage steht auf Ja.
    expect(screen.getByDisplayValue("Arbeitgeber 1")).not.toBeNull();

    fireEvent.click(jaNein("Weitere Beschäftigungen").nein);
    fireEvent.click(screen.getByRole("button", { name: "Weiter" }));

    await waitFor(() => expect(onNext).toHaveBeenCalledTimes(1));
    const gesendet = onNext.mock.calls[0][0];

    expect(gesendet.hasOtherEmployment).toBe(false);
    expect(gesendet.beschaeftigungsAngaben).toEqual([]);
    // Ohne diese Liste koennte der Server den Widerruf nicht ausfuehren: Eine
    // leere Zeilenliste nennt keine Kategorie.
    expect([...gesendet.beschaeftigungsKategorien].sort()).toEqual([
      "AUSLAND",
      "VORBESCHAEFTIGUNG",
      "WEITERE",
    ]);
  });

  it("nennt nur die sichtbaren Tabellen", async () => {
    const onNext = rendern(TVL(), { employerType: "hauptarbeitgeber" });

    fireEvent.click(screen.getByRole("button", { name: "Weiter" }));

    await waitFor(() => expect(onNext).toHaveBeenCalledTimes(1));
    // 4b und 4c zeigt dieser Fragebogen nicht — also verantwortet er sie auch
    // nicht. Ihre Zeilen koennen aus der HR-Nacherfassung stammen.
    expect(onNext.mock.calls[0][0].beschaeftigungsKategorien).toEqual([
      "WEITERE",
    ]);
  });
});

// =============================================
// 2 — Die 603-€-Frage
// =============================================
describe("Additionsfrage zur Geringfuegigkeitsgrenze", () => {
  const FRAGE = /Verdienen Sie mit allen Minijobs zusammen/;

  it("erscheint im Minijob-Fragebogen ohne Hauptbeschaeftigung", () => {
    rendern(MINIJOB(), {
      beschaeftigungsStatus: "STUDENT",
      hasOtherEmployment: true,
    });

    expect(screen.queryByText(FRAGE)).not.toBeNull();
  });

  it("erscheint NICHT in einem Fragebogen, dessen Vorlage sie abgeschaltet hat", () => {
    // Der Befund: `beschaeftigungsStatus` bleibt hier leer, die
    // Statusbedingung ist damit immer wahr — ohne das Sichtbarkeits-Gate
    // klappte die Minijob-Frage in einem TV-L-Fragebogen auf, und die Antwort
    // landete in der Personalakte.
    rendern(TVL(), { hasOtherEmployment: true });

    expect(screen.queryByText(FRAGE)).toBeNull();
  });

  it("erscheint auch im Minijob-Fragebogen nicht bei Hauptbeschaeftigung", () => {
    // Die fachliche Bedingung aus dem amtlichen Muster bleibt unangetastet.
    rendern(MINIJOB(), {
      beschaeftigungsStatus: "ARBEITNEHMER_HAUPTBESCHAEFTIGUNG",
      hasOtherEmployment: true,
    });

    expect(screen.queryByText(FRAGE)).toBeNull();
  });

  it("sendet keine Antwort, wo die Frage nicht gestellt wurde", async () => {
    const onNext = rendern(TVL(), {
      employerType: "nebenarbeitgeber",
      hasOtherEmployment: true,
      summeUeberGeringfuegigkeitsgrenze: true,
      beschaeftigungsAngaben: [gespeicherteZeile(1)],
    });

    fireEvent.click(screen.getByRole("button", { name: "Weiter" }));

    await waitFor(() => expect(onNext).toHaveBeenCalledTimes(1));
    // Eine frueher gegebene Antwort auf eine inzwischen gegenstandslose Frage
    // wird ausdruecklich geleert, nicht stillschweigend mitgeschleppt.
    expect(onNext.mock.calls[0][0].summeUeberGeringfuegigkeitsgrenze).toBeNull();
  });
});

// =============================================
// 3 — Die Mengengrenze
// =============================================
describe("Obergrenze der Zeilen", () => {
  it("stimmt mit der Grenze des Servers ueberein", () => {
    // Die Zahl steht an zwei Stellen: hier im Formular und als `.max(20)` im
    // Zeilen-Schema, das die Route benutzt. Laufen sie auseinander, sperrt das
    // Formular entweder zu frueh oder gar nicht.
    const zeile = {
      kategorie: "AUSLAND" as const,
      beginn: "2026-01-01",
      ende: null,
      arbeitgeberName: null,
      arbeitgeberAdresse: null,
    };
    const genau = Array.from({ length: MAX_BESCHAEFTIGUNGS_ZEILEN }, () => zeile);

    expect(beschaeftigungsAngabenListeSchema.safeParse(genau).success).toBe(true);
    expect(
      beschaeftigungsAngabenListeSchema.safeParse([...genau, zeile]).success,
    ).toBe(false);
  });

  it("sperrt den Hinzufuegen-Knopf und sagt warum", () => {
    rendern(MINIJOB(), {
      beschaeftigungsStatus: "STUDENT",
      hasOtherEmployment: true,
      beschaeftigungsAngaben: Array.from(
        { length: MAX_BESCHAEFTIGUNGS_ZEILEN },
        (_, i) => gespeicherteZeile(i),
      ),
    });

    const knopf = screen.getByRole("button", {
      name: "+ Weitere Beschäftigung hinzufügen",
    });
    expect((knopf as HTMLButtonElement).disabled).toBe(true);
    // Ein gesperrter Knopf ohne Begruendung ist eine Sackgasse.
    expect(screen.queryByText(/mehr können wir/)).not.toBeNull();
  });

  it("laesst darunter weiter hinzufuegen", () => {
    rendern(MINIJOB(), {
      beschaeftigungsStatus: "STUDENT",
      hasOtherEmployment: true,
      beschaeftigungsAngaben: Array.from(
        { length: MAX_BESCHAEFTIGUNGS_ZEILEN - 1 },
        (_, i) => gespeicherteZeile(i),
      ),
    });

    const knopf = screen.getByRole("button", {
      name: "+ Weitere Beschäftigung hinzufügen",
    });
    expect((knopf as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByText(/mehr können wir/)).toBeNull();

    fireEvent.click(knopf);
    expect((knopf as HTMLButtonElement).disabled).toBe(true);
  });

  it("zaehlt nur Tabellen, deren Grundfrage auf Ja steht", () => {
    // Die Zeilen sind gespeichert, die Grundfrage steht aber auf Nein — dann
    // gehen sie nicht mit und duerfen die Grenze nicht belasten.
    rendern(MINIJOB(), {
      beschaeftigungsStatus: "STUDENT",
      hasOtherEmployment: false,
      auslandsbeschaeftigungVorhanden: true,
      beschaeftigungsAngaben: [
        ...Array.from({ length: MAX_BESCHAEFTIGUNGS_ZEILEN }, (_, i) =>
          gespeicherteZeile(i),
        ),
        {
          kategorie: "AUSLAND",
          beginn: "2026-05-01T00:00:00.000Z",
          ende: null,
          arbeitgeberName: "Schule in Groningen",
          arbeitgeberAdresse: null,
          art: null,
          entgeltUeberGrenze: null,
          arbeitstage: null,
          beiArbeitsagentur: false,
        },
      ],
    });

    const knopf = screen.getByRole("button", {
      name: "+ Weitere Tätigkeit hinzufügen",
    });
    expect((knopf as HTMLButtonElement).disabled).toBe(false);
  });
});
