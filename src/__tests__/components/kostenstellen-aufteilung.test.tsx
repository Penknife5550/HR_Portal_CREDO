/**
 * @jest-environment jsdom
 */

/**
 * Die Kostenstellen-Aufteilung in der HR-Vorgangsansicht.
 *
 * Bis zur Durchsicht 09/2026 stand in der Karte "Weitere Angaben" ein blosses
 *
 *     <FieldRow label="Kostenstelle" value={sd.kostenstelle} />
 *     <FieldRow label="Kostenstelle Anteil" value={formatNumber(sd.kostenstelleAnteil, "%")} />
 *
 * — also die Alt-Spalte, die die Maske seit KOSTENSTELLEN_AUFTEILUNG_V1 nicht
 * mehr befuellt. Bei einem geaenderten Bestandsvorgang las HR dort weiter
 * "4711" und gab genau diese Kostenstelle an die Lohnbuchhaltung weiter,
 * waehrend im Portal laengst 5000/6000 hinterlegt war. Der zweite Test unten
 * ist genau dieser Fall; er waere mit dem alten JSX rot gewesen.
 *
 * Warum als Komponententest und nicht als reine Funktion: Dass die Zeilen im
 * Markup landen, entscheidet die Verdrahtung — die Regel dahinter hat ihre
 * eigene Suite (src/__tests__/lib/kostenstellen-anzeige.test.ts).
 *
 * Umgebung wie in den uebrigen Komponententests: jsdom im Docblock,
 * jest.config.ts bleibt global auf "node", und ohne @testing-library/jest-dom
 * — die Zusicherungen kommen mit textContent und queryByText aus.
 */

import { render } from "@testing-library/react";
import { KostenstellenAufteilung } from "@/app/(portal)/dashboard/[id]/detail-content";

type SupervisorDaten = Parameters<typeof KostenstellenAufteilung>[0]["sd"];

interface KostenstellenTeil {
  kostenstelle?: string | null;
  kostenstelleAnteil?: number | null;
  kostenstellenBemerkung?: string | null;
  kostenstellen?: { bezeichnung: string; anteil: number }[];
}

/**
 * Nur die Felder, die diese Karte anfasst. Der Rest von SupervisorData ist
 * fuer die Aufteilung ohne Belang — deshalb die Behauptung statt zwei Dutzend
 * Attrappenwerte, die niemand liest.
 */
function sd(teil: KostenstellenTeil): SupervisorDaten {
  return {
    kostenstelle: null,
    kostenstelleAnteil: null,
    kostenstellenBemerkung: null,
    kostenstellen: [],
    ...teil,
  } as unknown as SupervisorDaten;
}

describe("Karte „Weitere Angaben“ — Kostenstellen", () => {
  it("zeigt die gepflegte Aufteilung eines neuen Vorgangs", () => {
    const { container } = render(
      <KostenstellenAufteilung
        sd={sd({
          kostenstellen: [
            { bezeichnung: "5000", anteil: 60 },
            { bezeichnung: "6000", anteil: 40 },
          ],
        })}
      />
    );

    const text = container.textContent || "";
    expect(text).toContain("5000");
    expect(text).toContain("60,00 %");
    expect(text).toContain("6000");
    expect(text).toContain("40,00 %");
    expect(text).toContain("100,00 %");
  });

  it("zeigt bei einem geaenderten Bestandsvorgang NICHT mehr die alte Kostenstelle", () => {
    const { container } = render(
      <KostenstellenAufteilung
        sd={sd({
          kostenstelle: "4711",
          kostenstelleAnteil: 100,
          kostenstellen: [
            { bezeichnung: "5000", anteil: 60 },
            { bezeichnung: "6000", anteil: 40 },
          ],
        })}
      />
    );

    const text = container.textContent || "";
    expect(text).toContain("5000");
    expect(text).toContain("6000");
    expect(text).not.toContain("4711");
  });

  it("faellt auf die Alt-Spalte zurueck und sagt das auch", () => {
    // Datenmigration noch nicht gelaufen: Der Bestandswert muss sichtbar
    // bleiben — aber als das gekennzeichnet, was er ist.
    const { container } = render(
      <KostenstellenAufteilung
        sd={sd({ kostenstelle: "4711", kostenstelleAnteil: null })}
      />
    );

    const text = container.textContent || "";
    expect(text).toContain("4711");
    expect(text).toContain("100,00 %");
    expect(text).toContain("Übernommen aus dem alten Einzelfeld");
  });

  it("weist eine Aufteilung aus, die nicht 100 Prozent ergibt", () => {
    const { container } = render(
      <KostenstellenAufteilung
        sd={sd({
          kostenstellen: [
            { bezeichnung: "5000", anteil: 60 },
            { bezeichnung: "6000", anteil: 30 },
          ],
        })}
      />
    );

    const text = container.textContent || "";
    expect(text).toContain("90,00 %");
    expect(text).toContain("ergibt nicht 100 %");
  });

  it("zeigt die Bemerkung zur Aufteilung", () => {
    const { container } = render(
      <KostenstellenAufteilung
        sd={sd({
          kostenstellen: [{ bezeichnung: "5000", anteil: 100 }],
          kostenstellenBemerkung: "Beschluss vom 01.09.2026",
        })}
      />
    );

    expect(container.textContent).toContain("Beschluss vom 01.09.2026");
  });

  it("bleibt ohne jede Angabe leer statt zu behaupten, es gaebe eine", () => {
    const { container } = render(<KostenstellenAufteilung sd={sd({})} />);

    const text = container.textContent || "";
    expect(text).toContain("Kostenstellen-Aufteilung");
    expect(text).toContain("—");
    expect(text).not.toContain("%");
  });
});
