/**
 * @jest-environment jsdom
 */

/**
 * Der Kasten „Offene Nachweise" in der Vorgangsansicht.
 *
 * Er ist die einzige Stelle, an der HR erfaehrt, dass eine nachreichbare
 * Pflichtunterlage fehlt. Der Protokolleintrag `DOKUMENTE_NACHZUREICHEN`
 * leistet das nicht: Ihn liest kein Produktivcode, und er ist eine
 * Momentaufnahme des Abgabezeitpunkts.
 *
 * Belegt werden deshalb genau die Eigenschaften, wegen derer der Kasten LIVE
 * rechnet statt den Protokolleintrag zu lesen:
 *
 *  1. Er zeigt die Luecke auch bei einem Bestandsvorgang, der nie einen
 *     Vermerk bekommen hat (der gemeldete Masernschutz-Fall).
 *  2. Er wird still, sobald die Unterlage hochgeladen ist — der Vermerk
 *     behauptete danach weiter einen offenen Nachweis.
 *  3. Er fragt nach einem fehlenden Ablaufdatum, das sonst durch beide Netze
 *     faellt: `dringendeNachweisLagen` laesst den Fall aus, und der naechtliche
 *     Cron filtert auf `gueltigBis: { not: null }`.
 *  4. Er schweigt vor der Abgabe — und zwar mit BEIDEN Haelften. Solange der
 *     Fragebogen offen ist, fragt das Formular selbst nach Unterlage und
 *     Ablaufdatum; HR hat dort nichts zu tun.
 *
 * Umgebung wie in dokumentenpaket-dialog.test.tsx: jsdom im Docblock
 * (jest.config.ts bleibt global auf "node"), ohne @testing-library/jest-dom.
 */
import { render, screen } from "@testing-library/react";
import {
  OffeneNachweiseKasten,
  type DetailData,
} from "@/app/(portal)/dashboard/[id]/detail-content";

// =============================================
// Testdaten
// =============================================

/**
 * Ein abgegebener Vorgang in einer Gemeinschaftseinrichtung, Geburtsjahr 1990.
 *
 * Bewusst als Teilobjekt mit Umweg ueber `unknown`: `DetailData` beschreibt die
 * ganze Vorgangsansicht (ueber hundert Felder), der Kasten liest davon eine
 * Handvoll. Ein vollstaendiges Objekt hier waere Beiwerk, das bei jeder
 * Feldaenderung anzupassen waere, ohne je etwas zu belegen.
 */
function vorgang(teil: Record<string, unknown> = {}): DetailData {
  const basis = {
    id: "v1",
    status: "SUBMITTED",
    submittedAt: "2026-09-01T10:00:00.000Z",
    requiredDocuments: ["GEBURTSURKUNDE_EIGEN", "MASERNSCHUTZ"],
    organization: {
      id: "o1",
      name: "Gymnasium",
      mandantNumber: "712",
      type: "GYMNASIUM",
    },
    personalData: {
      birthDate: "1990-05-03",
      children: [],
      rvEntscheidung: null,
      aufenthaltstitelErforderlich: null,
      healthInsuranceType: "gesetzlich",
    },
    documents: [],
  };
  return { ...basis, ...teil } as unknown as DetailData;
}

function dokument(typ: string, gueltigBis: string | null = null) {
  return { id: `d-${typ}`, type: typ, gueltigBis };
}

// =============================================
// 1. Die fehlende Pflichtunterlage — live, nicht aus dem Protokoll
// =============================================

describe("Offene Nachweise: fehlende nachreichbare Pflichten", () => {
  test("nennt den fehlenden Masernschutz-Nachweis samt Meldepflicht", () => {
    render(<OffeneNachweiseKasten data={vorgang()} onZuDenDokumenten={null} />);

    expect(screen.queryByText("Offene Nachweise")).not.toBeNull();
    expect(screen.queryByText("Masernschutz-Nachweis")).not.toBeNull();
    // Der Satz, an dem die ganze Entscheidung gegen die Sperre haengt.
    expect(document.body.textContent).toContain("Gesundheitsamt");
  });

  /**
   * Der Fall, der den Umbau ausgeloest hat: abgesendet, bevor es den Vermerk
   * gab. Kein `submittedAt`, kein Protokolleintrag — der Kasten muss ihn
   * trotzdem finden, weil er rechnet statt nachzuschlagen.
   */
  test("findet die Luecke auch ohne submittedAt (Bestandsvorgang)", () => {
    render(
      <OffeneNachweiseKasten
        data={vorgang({ submittedAt: null, status: "REVIEWED" })}
        onZuDenDokumenten={null}
      />,
    );

    expect(screen.queryByText("Masernschutz-Nachweis")).not.toBeNull();
  });

  test("wird still, sobald der Nachweis hochgeladen ist", () => {
    render(
      <OffeneNachweiseKasten
        data={vorgang({ documents: [dokument("MASERNSCHUTZ")] })}
        onZuDenDokumenten={null}
      />,
    );

    expect(screen.queryByText("Offene Nachweise")).toBeNull();
  });

  /**
   * Die bedingten Pflichten muessen dieselbe Antwort bekommen wie beim
   * Absenden — sonst mahnt die Ansicht etwas an, das niemand verlangt hat, oder
   * schweigt zu etwas, das der Server vermerkt hat.
   */
  test("Aufenthaltstitel und Arbeitserlaubnis erst nach der Selbstauskunft", () => {
    const ohneAngabe = render(
      <OffeneNachweiseKasten
        data={vorgang({ documents: [dokument("MASERNSCHUTZ")] })}
        onZuDenDokumenten={null}
      />,
    );
    expect(screen.queryByText("Aufenthaltstitel")).toBeNull();
    ohneAngabe.unmount();

    render(
      <OffeneNachweiseKasten
        data={vorgang({
          documents: [dokument("MASERNSCHUTZ")],
          personalData: {
            birthDate: "1990-05-03",
            children: [],
            rvEntscheidung: null,
            aufenthaltstitelErforderlich: true,
            healthInsuranceType: "privat",
          },
        })}
        onZuDenDokumenten={null}
      />,
    );
    expect(screen.queryByText("Aufenthaltstitel")).not.toBeNull();
    expect(screen.queryByText("Arbeitserlaubnis / Zusatzblatt")).not.toBeNull();
    expect(
      screen.queryByText("Nachweis private Krankenversicherung"),
    ).not.toBeNull();
  });

  /**
   * Solange der Fragebogen offen ist, laedt die Person selbst hoch und wird im
   * Formular je Unterlage angemahnt. HR hinter jemandem hertelefonieren zu
   * lassen, der gerade in Schritt 3 sitzt, waere Laerm.
   */
  test("schweigt, solange der Fragebogen nicht abgegeben ist", () => {
    render(
      <OffeneNachweiseKasten
        data={vorgang({ status: "IN_PROGRESS", submittedAt: null })}
        onZuDenDokumenten={null}
      />,
    );

    expect(screen.queryByText("Offene Nachweise")).toBeNull();
  });
});

// =============================================
// 2. Nachweise ohne erfasstes Ablaufdatum
// =============================================

describe("Offene Nachweise: fehlendes Ablaufdatum", () => {
  /**
   * Ein befristeter Aufenthaltstitel ohne Datum laeuft ab, ohne dass irgendwer
   * etwas erfaehrt — der vorgangsweite Warnbalken laesst den Fall bewusst aus,
   * der Cron sieht solche Dokumente nie.
   */
  test("fragt nach — ruhig, ohne Vorwurf", () => {
    render(
      <OffeneNachweiseKasten
        data={vorgang({
          requiredDocuments: ["GEBURTSURKUNDE_EIGEN"],
          personalData: {
            birthDate: "1965-05-03",
            children: [],
            rvEntscheidung: null,
            aufenthaltstitelErforderlich: null,
            healthInsuranceType: "gesetzlich",
          },
          documents: [dokument("AUFENTHALTSTITEL", null)],
        })}
        onZuDenDokumenten={null}
      />,
    );

    expect(screen.queryByText("Aufenthaltstitel")).not.toBeNull();
    const text = document.body.textContent ?? "";
    expect(text).toContain("kein Ablaufdatum erfasst");
    // Die unbefristete Niederlassungserlaubnis ist ein legitimer Grund fuer das
    // leere Feld. Steht das nicht da, liest sie sich als Ruege.
    expect(text).toContain("Niederlassungserlaubnis");
  });

  /**
   * Die Sperre „erst ab Abgabe" gilt fuer BEIDE Haelften des Kastens.
   *
   * Sie war nur an der Liste der fehlenden Pflichtunterlagen verdrahtet; die
   * Nachfrage nach dem Ablaufdatum lief ungebremst. Wer in Schritt 3 seinen
   * Aufenthaltstitel hochlud und das Datumsfeld daneben (noch) leer liess,
   * loeste damit den gelben Kasten auf JEDEM Reiter der HR-Ansicht aus —
   * waehrend das Formular genau dieses Datum gerade selbst abfragt und die
   * Person es dort ohne HR eintragen kann.
   */
  test("fragt erst nach der Abgabe nach — vorher gar nicht", () => {
    render(
      <OffeneNachweiseKasten
        data={vorgang({
          status: "IN_PROGRESS",
          submittedAt: null,
          requiredDocuments: ["GEBURTSURKUNDE_EIGEN"],
          personalData: {
            birthDate: "1965-05-03",
            children: [],
            rvEntscheidung: null,
            aufenthaltstitelErforderlich: null,
            healthInsuranceType: "gesetzlich",
          },
          documents: [dokument("AUFENTHALTSTITEL", null)],
        })}
        onZuDenDokumenten={null}
      />,
    );

    expect(screen.queryByText("Offene Nachweise")).toBeNull();
    expect(document.body.textContent ?? "").not.toContain(
      "kein Ablaufdatum erfasst",
    );
  });

  test("schweigt, sobald ein Datum erfasst ist", () => {
    render(
      <OffeneNachweiseKasten
        data={vorgang({
          requiredDocuments: ["GEBURTSURKUNDE_EIGEN"],
          personalData: {
            birthDate: "1965-05-03",
            children: [],
            rvEntscheidung: null,
            aufenthaltstitelErforderlich: null,
            healthInsuranceType: "gesetzlich",
          },
          documents: [dokument("AUFENTHALTSTITEL", "2030-01-01")],
        })}
        onZuDenDokumenten={null}
      />,
    );

    expect(screen.queryByText("Offene Nachweise")).toBeNull();
  });

  /**
   * Nicht fristpflichtige Papiere haben kein Ablaufdatum und sollen auch keins
   * bekommen — sonst stuende der Kasten bei jedem Vorgang mit einer
   * Geburtsurkunde.
   */
  test("fragt nur bei fristpflichtigen Nachweisarten nach", () => {
    render(
      <OffeneNachweiseKasten
        data={vorgang({
          requiredDocuments: ["GEBURTSURKUNDE_EIGEN"],
          personalData: {
            birthDate: "1965-05-03",
            children: [],
            rvEntscheidung: null,
            aufenthaltstitelErforderlich: null,
            healthInsuranceType: "gesetzlich",
          },
          documents: [dokument("GEBURTSURKUNDE_EIGEN", null)],
        })}
        onZuDenDokumenten={null}
      />,
    );

    expect(screen.queryByText("Offene Nachweise")).toBeNull();
  });
});
