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
 *  5. Paket 4 („Unterlagen nachfordern"): der neue Satz statt der alten
 *     Zusage — nur, wo er sich befolgen laesst (sonst der Grund bzw. ohne
 *     Recht ein Satz ueber die Personalabteilung) —, je Nachweis der Stand der
 *     Nachforderung (`nachweisStandText`), die Knoepfe je Recht und Stand —
 *     „Unterlagen nachfordern…" bekommt genau die offenen Arten (ohne frueher
 *     als entfallen vermerkte — der Satz nennt dann die Ausnahme, und sind es
 *     alle, gibt es keinen Knopf, nur den Verweis auf die Karte), „Ergänzen…"
 *     nur die noch nicht angeforderten, „Zur Nachforderung" springt zur Karte.
 *     Dazu der Warnbalken mit „Verlängerten Nachweis anfordern…".
 *  6. Was davon im ECHTEN Dialog angekreuzt ist: `vorauswahl` legt es fest,
 *     die uebrigen Vorschlaege stehen darunter unter „Weitere offene Nachweise
 *     (nicht vorausgewählt)“ — und der Kasten kreuzt dasselbe an wie der Knopf
 *     der Karte.
 *
 * Die Uebersicht der Nachforderung entsteht mit der ECHTEN Regel des Servers
 * (`uebersichtBauen`), die Knopfregeln kommen aus src/lib/unterlagen.ts
 * (`offeneNachweiseAktion`, `warnbalkenAktion`, dort eigens getestet) — der
 * Kasten rechnet nichts selbst.
 *
 * Umgebung wie in dokumentenpaket-dialog.test.tsx: jsdom im Docblock
 * (jest.config.ts bleibt global auf "node"), ohne @testing-library/jest-dom.
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
import {
  NachweisFristenWarnung,
  OffeneNachweiseKasten,
  verlaengerungVorauswahl,
  type DetailData,
} from "@/app/(portal)/dashboard/[id]/detail-content";
import { NachforderungDialog } from "@/components/unterlagen/nachforderung-dialog";
import { documentTypeLabel } from "@/lib/required-documents";
import {
  uebersichtBauen,
  type AuswahlEintrag,
  type NachforderungDialogAnfrage,
  type NachforderungEingabe,
  type PositionEingabe,
  type UnterlagenDialogDaten,
  type UnterlagenUebersicht,
} from "@/lib/unterlagen";

// React 19 verlangt diese Marke, bevor act() Zustandsaenderungen einsammeln darf
// (der echte Dialog setzt beim Oeffnen den Fokus).
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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

  /**
   * Zwei Spuren (09/2026): Hat die Fuehrungskraft zuerst abgesendet, stand der
   * Status frueher auf SUPERVISOR_SUBMITTED, waehrend die Person noch in
   * Schritt 4 sass — und der Kasten mahnte bei HR Nachweise an, die sie gerade
   * selbst hochlaedt. Massgeblich ist die eigene Abgabe, nicht der Status.
   */
  test("schweigt auch bei einem Link-Status ohne eigene Abgabe (Fuehrungskraft war schneller)", () => {
    for (const status of ["SUPERVISOR_SUBMITTED", "SUPERVISOR_PENDING", "SUBMITTED"]) {
      const ansicht = render(
        <OffeneNachweiseKasten
          data={vorgang({ status, submittedAt: null })}
          onZuDenDokumenten={null}
        />,
      );
      expect(screen.queryByText("Offene Nachweise")).toBeNull();
      ansicht.unmount();
    }
  });

  test("meldet die Luecke nach der Abgabe auch bei „Bereit zur Prüfung“", () => {
    render(
      <OffeneNachweiseKasten
        data={vorgang({ status: "SUPERVISOR_SUBMITTED" })}
        onZuDenDokumenten={null}
      />,
    );

    expect(screen.queryByText("Masernschutz-Nachweis")).not.toBeNull();
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
    // leere Feld. Steht das nicht da, liest sie sich als Ruege — und seit Z1
    // steht der Weg dabei, sie als solche zu kennzeichnen.
    expect(text).toContain("Niederlassungserlaubnis");
    expect(text).toContain(
      "Ist der Nachweis unbefristet (etwa eine Niederlassungserlaubnis), klicken Sie an der Unterlage im Reiter „Dokumente“ auf „Unbefristet“",
    );
    // Der alte Satz behauptete, das leere Feld sei „richtig so" — der alte,
    // befristete Titel blieb dann aber massgeblich (Z1).
    expect(text).not.toContain("richtig so");
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

// =============================================
// 3. Kennzeichen „unbefristet" (Paket 4, Z1)
// =============================================

describe("Offene Nachweise: ausdrücklich unbefristeter Nachweis", () => {
  const ohnePflichten = {
    requiredDocuments: ["GEBURTSURKUNDE_EIGEN"],
    personalData: {
      birthDate: "1965-05-03",
      children: [],
      rvEntscheidung: null,
      aufenthaltstitelErforderlich: null,
      healthInsuranceType: "gesetzlich",
    },
  };

  /**
   * Ein Dokument mit `unbefristet: true` ist erledigt — nachzufragen gibt es
   * nichts, auch wenn daneben die Rueckseite ohne Datum liegt. Die Detailroute
   * liefert die Spalte ueber `documents: true` von selbst mit.
   */
  test("fragt bei einem unbefristeten Nachweis nicht nach dem Ablaufdatum", () => {
    render(
      <OffeneNachweiseKasten
        data={vorgang({
          ...ohnePflichten,
          documents: [
            { ...dokument("AUFENTHALTSTITEL", null), unbefristet: true },
            { id: "d-rueckseite", type: "AUFENTHALTSTITEL", gueltigBis: null },
          ],
        })}
        onZuDenDokumenten={null}
      />,
    );

    expect(screen.queryByText("Offene Nachweise")).toBeNull();
  });

  test("Gegenprobe: die andere Art ohne Datum bleibt in der Nachfrage", () => {
    render(
      <OffeneNachweiseKasten
        data={vorgang({
          ...ohnePflichten,
          documents: [
            { ...dokument("AUFENTHALTSTITEL", null), unbefristet: true },
            dokument("ARBEITSERLAUBNIS", null),
          ],
        })}
        onZuDenDokumenten={null}
      />,
    );

    expect(screen.queryByText("Arbeitserlaubnis / Zusatzblatt")).not.toBeNull();
    expect(screen.queryByText("Aufenthaltstitel")).toBeNull();
  });

  test("`unbefristet: false` ändert nichts — die Nachfrage bleibt", () => {
    render(
      <OffeneNachweiseKasten
        data={vorgang({
          ...ohnePflichten,
          documents: [{ ...dokument("AUFENTHALTSTITEL", null), unbefristet: false }],
        })}
        onZuDenDokumenten={null}
      />,
    );

    expect(screen.queryByText("Aufenthaltstitel")).not.toBeNull();
    expect(document.body.textContent ?? "").toContain("kein Ablaufdatum erfasst");
  });
});

// =============================================
// 4. Paket 4: Stand je Nachweis und der Weg zur Nachforderung
// =============================================

/** Montag, 21.09.2026, 12:00 Uhr deutscher Zeit. */
const JETZT = new Date("2026-09-21T10:00:00.000Z");

/** Abgegeben, privat versichert, Titel erforderlich: vier offene Nachweise. */
const VIER_OFFEN = {
  personalData: {
    birthDate: "1990-05-03",
    children: [],
    rvEntscheidung: null,
    aufenthaltstitelErforderlich: true,
    healthInsuranceType: "privat",
  },
};
const VIER_OFFENE_ARTEN = ["MASERNSCHUTZ", "AUFENTHALTSTITEL", "ARBEITSERLAUBNIS", "PKV_NACHWEIS"];

function position(teil: Partial<PositionEingabe> & { id: string; typ: string }): PositionEingabe {
  return {
    reihenfolge: 0,
    bezeichnung: teil.typ,
    hinweis: null,
    originalErforderlich: false,
    sensibel: false,
    fristpflichtig: false,
    status: "ANGEFORDERT",
    einreichungen: 0,
    gueltigBisAngabe: null,
    angefordertAm: "2026-09-12T08:00:00.000Z",
    uebermitteltAm: null,
    begruendung: null,
    entfaelltNotiz: null,
    entschiedenAm: null,
    entschiedenVonName: null,
    dateien: [],
    ...teil,
  };
}

function nachforderung(teil: Partial<NachforderungEingabe> = {}): NachforderungEingabe {
  return {
    id: "nf-1",
    modul: "ONBOARDING",
    status: "LAUFEND",
    empfaenger: "anna.beispiel@example.org",
    empfaengerAbweichend: false,
    frist: new Date("2026-09-26T00:00:00.000Z"),
    nachricht: null,
    angefordertAm: "2026-09-12T08:00:00.000Z",
    angefordertVonName: "Erika Muster",
    erinnertFuerFrist: null,
    erinnertStufe: null,
    erledigtAm: null,
    zurueckgezogenAm: null,
    positionen: [],
    links: [],
    ...teil,
  };
}

/** Masernschutz eingereicht, Aufenthaltstitel angefordert — der Stand aus P:1285. */
const LAUFEND_ZWEI = nachforderung({
  positionen: [
    position({
      id: "p-ms",
      typ: "MASERNSCHUTZ",
      status: "EINGEREICHT",
      einreichungen: 1,
      uebermitteltAm: "2026-09-15T08:00:00.000Z",
    }),
    position({ id: "p-at", typ: "AUFENTHALTSTITEL", reihenfolge: 1 }),
  ],
});

function uebersicht(
  opts: {
    nachforderungen?: NachforderungEingabe[];
    darfAktionen?: boolean;
    verfuegbar?: { ok: true } | { ok: false; grund: string };
    vorgangEingestellt?: boolean;
    dialog?: UnterlagenDialogDaten | null;
  } = {},
): UnterlagenUebersicht {
  return uebersichtBauen({
    modul: "ONBOARDING",
    nachforderungen: opts.nachforderungen ?? [],
    verfuegbar: opts.verfuegbar ?? { ok: true },
    vorgangEingestellt: opts.vorgangEingestellt ?? false,
    darfAktionen: opts.darfAktionen ?? true,
    dateiUrl: (id) => `/api/onboarding/v1/unterlagen/dateien/${id}`,
    apiBasis: "/api/onboarding/v1/unterlagen",
    dialog: opts.dialog ?? null,
    jetzt: JETZT,
  });
}

const kastenKnoepfe = () =>
  Array.from(document.querySelectorAll('[data-block="kasten-knoepfe"] button')).map((b) => b.textContent);
const zeileVon = (typ: string) => document.querySelector(`[data-nachweis="${typ}"]`)?.textContent;
const kastenSatz = () => document.querySelector('[data-zeile="kasten-satz"]')?.textContent ?? "";

const SATZ_P1285 =
  "Mit „Unterlagen nachfordern“ schicken Sie der Person einen Link, über den sie genau diese Nachweise hochlädt.";
const SATZ_OHNE_RECHT = "Die Personalabteilung kann sie über „Unterlagen nachfordern“ bei der Person anfordern.";
/** Einige offene Arten sind frueher als entfallen vermerkt: Der Knopf kreuzt sie nicht an. */
const SATZ_TEILS_ENTFALLEN =
  "Mit „Unterlagen nachfordern“ schicken Sie der Person einen Link, über den sie diese Nachweise hochlädt – außer den als entfallen vermerkten; die lassen sich im Dialog bei Bedarf dazunehmen.";
/** Alle offenen Arten so vermerkt: kein Knopf im Kasten, der Weg fuehrt ueber die Karte. */
const SATZ_ALLE_ENTFALLEN =
  "Laut einer früheren Nachforderung sind sie als entfallen vermerkt; werden sie doch gebraucht, fordern Sie sie in der Karte „Unterlagen nachfordern“ im Reiter „Dokumente“ wieder an.";
const GRUND_EINGESTELLT =
  "Der Vorgang ist abgelaufen und wird nicht mehr bearbeitet. Unterlagen lassen sich nicht mehr nachfordern.";

/** Eine aeltere, erledigte Nachforderung: Die Arbeitserlaubnis ist dort als entfallen vermerkt. */
const ERLEDIGT_AE_ENTFALLEN = nachforderung({
  id: "nf-alt",
  status: "ERLEDIGT",
  angefordertAm: "2026-09-01T08:00:00.000Z",
  erledigtAm: "2026-09-10T08:00:00.000Z",
  positionen: [
    position({ id: "p-ae", typ: "ARBEITSERLAUBNIS", status: "ENTFAELLT", entschiedenAm: "2026-09-10T08:00:00.000Z" }),
  ],
});

describe("Offene Nachweise: Paket 4 — Text, Stand, Knöpfe", () => {
  test("mit Recht der neue Satz aus P:1285 statt der Zusage des Fragebogens", () => {
    render(
      <OffeneNachweiseKasten
        data={vorgang({ unterlagen: uebersicht() })}
        onZuDenDokumenten={null}
        onNachfordern={jest.fn()}
      />,
    );
    expect(kastenSatz()).toBe(
      `Diese Pflichtunterlagen durften nachgereicht werden und liegen bis heute nicht vor. ${SATZ_P1285}`,
    );
    expect(document.body.textContent).not.toContain("Der Fragebogen hat zugesagt");
  });

  test("ohne Recht (oder ohne Übersicht) keine Aufforderung an „Sie“, sondern ein Satz über die Personalabteilung", () => {
    const ohneRecht = render(
      <OffeneNachweiseKasten
        data={vorgang({ unterlagen: uebersicht({ darfAktionen: false }) })}
        onZuDenDokumenten={null}
        onNachfordern={null}
      />,
    );
    expect(kastenSatz()).toContain(SATZ_OHNE_RECHT);
    expect(kastenSatz()).not.toContain("schicken Sie");
    ohneRecht.unmount();

    render(<OffeneNachweiseKasten data={vorgang()} onZuDenDokumenten={null} />);
    expect(kastenSatz()).toContain(SATZ_OHNE_RECHT);
    expect(document.body.textContent).not.toContain("Der Fragebogen hat zugesagt");
  });

  test("eingestellter Vorgang (EXPIRED): kein Verweis auf eine gesperrte Aktion, sondern der Grund", () => {
    render(
      <OffeneNachweiseKasten
        data={vorgang({
          status: "EXPIRED",
          unterlagen: uebersicht({ verfuegbar: { ok: false, grund: GRUND_EINGESTELLT }, vorgangEingestellt: true }),
        })}
        onZuDenDokumenten={jest.fn()}
        onNachfordern={jest.fn()}
      />,
    );
    expect(kastenSatz()).toContain(GRUND_EINGESTELLT);
    expect(kastenSatz()).not.toContain("schicken Sie");
    expect(kastenKnoepfe()).toEqual(["Zu den Dokumenten"]);
  });

  test("eingestellter Vorgang mit laufender Nachforderung: nur der Sprung, keine Aufforderung", () => {
    render(
      <OffeneNachweiseKasten
        data={vorgang({
          ...VIER_OFFEN,
          status: "EXPIRED",
          unterlagen: uebersicht({ nachforderungen: [LAUFEND_ZWEI], vorgangEingestellt: true }),
        })}
        onZuDenDokumenten={null}
        onNachfordern={jest.fn()}
        onZurNachforderung={jest.fn()}
      />,
    );
    expect(kastenSatz()).toBe("Diese Pflichtunterlagen durften nachgereicht werden und liegen bis heute nicht vor.");
    expect(kastenKnoepfe()).toEqual(["Zur Nachforderung"]);
  });

  test("je Nachweis der Stand der laufenden Nachforderung (P:1285)", () => {
    render(
      <OffeneNachweiseKasten
        data={vorgang({ ...VIER_OFFEN, unterlagen: uebersicht({ nachforderungen: [LAUFEND_ZWEI] }) })}
        onZuDenDokumenten={null}
      />,
    );
    expect(zeileVon("MASERNSCHUTZ")).toBe("Masernschutz-Nachweis — eingegangen, bitte prüfen");
    expect(zeileVon("AUFENTHALTSTITEL")).toBe("Aufenthaltstitel — angefordert am 12.09.2026, Frist 26.09.2026");
    // Nicht angefordert: nur die Bezeichnung.
    expect(zeileVon("PKV_NACHWEIS")).toBe("Nachweis private Krankenversicherung");
    // Die Bezeichnung bleibt ein eigenes Element — frueher suchten Tests (und Leser) genau sie.
    expect(screen.queryByText("Masernschutz-Nachweis")).not.toBeNull();
  });

  test("ohne Übersicht (ältere Antwort): Zeilen wie bisher, keine Nachforderungs-Knöpfe", () => {
    const onNachfordern = jest.fn();
    render(<OffeneNachweiseKasten data={vorgang()} onZuDenDokumenten={null} onNachfordern={onNachfordern} />);
    expect(zeileVon("MASERNSCHUTZ")).toBe("Masernschutz-Nachweis");
    expect(kastenKnoepfe()).toEqual([]);
  });

  test("ohne laufende Nachforderung: „Unterlagen nachfordern…“ bekommt genau die offenen Arten", () => {
    const onNachfordern = jest.fn();
    render(
      <OffeneNachweiseKasten
        data={vorgang({ ...VIER_OFFEN, unterlagen: uebersicht() })}
        onZuDenDokumenten={jest.fn()}
        onNachfordern={onNachfordern}
        onZurNachforderung={jest.fn()}
      />,
    );
    expect(kastenKnoepfe()).toEqual(["Unterlagen nachfordern…", "Zu den Dokumenten"]);
    fireEvent.click(screen.getByRole("button", { name: "Unterlagen nachfordern…" }));
    expect(onNachfordern).toHaveBeenCalledTimes(1);
    expect(onNachfordern).toHaveBeenCalledWith({ modus: "neu", vorauswahl: VIER_OFFENE_ARTEN });
  });

  test("ohne Bearbeitungsrecht: kein schreibender Knopf — weder ohne Rückruf noch ohne Recht in der Übersicht", () => {
    const ohneRueckruf = render(
      <OffeneNachweiseKasten
        data={vorgang({ ...VIER_OFFEN, unterlagen: uebersicht() })}
        onZuDenDokumenten={jest.fn()}
        onNachfordern={null}
      />,
    );
    expect(kastenKnoepfe()).toEqual(["Zu den Dokumenten"]);
    ohneRueckruf.unmount();

    render(
      <OffeneNachweiseKasten
        data={vorgang({ ...VIER_OFFEN, unterlagen: uebersicht({ darfAktionen: false }) })}
        onZuDenDokumenten={jest.fn()}
        onNachfordern={jest.fn()}
      />,
    );
    expect(kastenKnoepfe()).toEqual(["Zu den Dokumenten"]);
  });

  test("laufende Nachforderung: „Ergänzen…“ nur mit den noch nicht angeforderten Arten, dazu „Zur Nachforderung“", () => {
    const onNachfordern = jest.fn();
    const onZurNachforderung = jest.fn();
    render(
      <OffeneNachweiseKasten
        data={vorgang({ ...VIER_OFFEN, unterlagen: uebersicht({ nachforderungen: [LAUFEND_ZWEI] }) })}
        onZuDenDokumenten={null}
        onNachfordern={onNachfordern}
        onZurNachforderung={onZurNachforderung}
      />,
    );
    expect(kastenKnoepfe()).toEqual(["Ergänzen…", "Zur Nachforderung"]);
    // Die Aufforderung steht auch hier — so zeigt es das Mockup (P:1285).
    expect(kastenSatz()).toContain(SATZ_P1285);
    fireEvent.click(screen.getByRole("button", { name: "Ergänzen…" }));
    expect(onNachfordern).toHaveBeenCalledWith({
      modus: "ergaenzen",
      vorauswahl: ["ARBEITSERLAUBNIS", "PKV_NACHWEIS"],
    });
    fireEvent.click(screen.getByRole("button", { name: "Zur Nachforderung" }));
    expect(onZurNachforderung).toHaveBeenCalledTimes(1);
  });

  test("laufende Nachforderung mit allen offenen Arten: nur „Zur Nachforderung“ — auch ohne Recht", () => {
    const alle = nachforderung({
      positionen: VIER_OFFENE_ARTEN.map((typ, i) => position({ id: `p-${i}`, typ, reihenfolge: i })),
    });
    render(
      <OffeneNachweiseKasten
        data={vorgang({ ...VIER_OFFEN, unterlagen: uebersicht({ nachforderungen: [alle], darfAktionen: false }) })}
        onZuDenDokumenten={null}
        onNachfordern={null}
        onZurNachforderung={jest.fn()}
      />,
    );
    expect(kastenKnoepfe()).toEqual(["Zur Nachforderung"]);
    // Ohne Recht, und die Zeilen sagen schon „angefordert am …": kein weiterer Satz.
    expect(kastenSatz()).toBe("Diese Pflichtunterlagen durften nachgereicht werden und liegen bis heute nicht vor.");
  });

  test("früher als entfallen vermerkt: Stand erklärt — offen, aber nicht in der Vorauswahl", () => {
    const onNachfordern = jest.fn();
    render(
      <OffeneNachweiseKasten
        data={vorgang({ ...VIER_OFFEN, unterlagen: uebersicht({ nachforderungen: [ERLEDIGT_AE_ENTFALLEN] }) })}
        onZuDenDokumenten={null}
        onNachfordern={onNachfordern}
      />,
    );
    // Weiter unter den offenen Nachweisen, mit ihrem Stand.
    expect(zeileVon("ARBEITSERLAUBNIS")).toBe(
      "Arbeitserlaubnis / Zusatzblatt — entfällt laut Nachforderung (vermerkt am 10.09.2026)",
    );
    fireEvent.click(screen.getByRole("button", { name: "Unterlagen nachfordern…" }));
    // Die offenen Arten ohne die quittierte: HR hat sie schon einmal als
    // entfallen vermerkt; im Dialog steht sie sichtbar, aber nicht angekreuzt
    // (echter Dialog: unten).
    expect(onNachfordern).toHaveBeenCalledWith({
      modus: "neu",
      vorauswahl: ["MASERNSCHUTZ", "AUFENTHALTSTITEL", "PKV_NACHWEIS"],
    });
    // Der Satz sagt nicht mehr „genau diese Nachweise", sondern nennt die Ausnahme.
    expect(kastenSatz()).toBe(
      `Diese Pflichtunterlagen durften nachgereicht werden und liegen bis heute nicht vor. ${SATZ_TEILS_ENTFALLEN}`,
    );
    expect(kastenSatz()).not.toContain("genau diese");
  });

  /** Nur die Arbeitserlaubnis ist offen — und die ist in der aelteren Nachforderung als entfallen vermerkt. */
  const NUR_AE_OFFEN = {
    ...VIER_OFFEN,
    documents: [
      dokument("MASERNSCHUTZ"),
      dokument("AUFENTHALTSTITEL", "2030-01-01T00:00:00.000Z"),
      dokument("PKV_NACHWEIS"),
    ],
  };

  test("alle offenen Arten früher entfallen: kein Knopf, der einen Dialog ohne Kreuz öffnet — der Satz nennt den Weg", () => {
    const onNachfordern = jest.fn();
    render(
      <OffeneNachweiseKasten
        data={vorgang({ ...NUR_AE_OFFEN, unterlagen: uebersicht({ nachforderungen: [ERLEDIGT_AE_ENTFALLEN] }) })}
        onZuDenDokumenten={jest.fn()}
        onNachfordern={onNachfordern}
        onZurNachforderung={jest.fn()}
      />,
    );
    expect(Array.from(document.querySelectorAll("[data-nachweis]")).map((el) => el.getAttribute("data-nachweis"))).toEqual([
      "ARBEITSERLAUBNIS",
    ]);
    expect(zeileVon("ARBEITSERLAUBNIS")).toBe(
      "Arbeitserlaubnis / Zusatzblatt — entfällt laut Nachforderung (vermerkt am 10.09.2026)",
    );
    expect(kastenKnoepfe()).toEqual(["Zu den Dokumenten"]);
    expect(onNachfordern).not.toHaveBeenCalled();
    expect(kastenSatz()).toBe(
      `Diese Pflichtunterlagen durften nachgereicht werden und liegen bis heute nicht vor. ${SATZ_ALLE_ENTFALLEN}`,
    );
  });

  test("alle offenen Arten früher entfallen, mit laufender Nachforderung: nur „Zur Nachforderung“, derselbe Satz", () => {
    const laufendOhneAe = nachforderung({ positionen: [position({ id: "p-az", typ: "ABSCHLUSSZEUGNIS" })] });
    render(
      <OffeneNachweiseKasten
        data={vorgang({
          ...NUR_AE_OFFEN,
          unterlagen: uebersicht({ nachforderungen: [laufendOhneAe, ERLEDIGT_AE_ENTFALLEN] }),
        })}
        onZuDenDokumenten={null}
        onNachfordern={jest.fn()}
        onZurNachforderung={jest.fn()}
      />,
    );
    expect(kastenKnoepfe()).toEqual(["Zur Nachforderung"]);
    expect(kastenSatz()).toContain(SATZ_ALLE_ENTFALLEN);
    expect(kastenSatz()).not.toContain("schicken Sie");
  });

  test("früher entfallen, ohne Recht: der Satz über die Personalabteilung bleibt", () => {
    render(
      <OffeneNachweiseKasten
        data={vorgang({
          ...NUR_AE_OFFEN,
          unterlagen: uebersicht({ nachforderungen: [ERLEDIGT_AE_ENTFALLEN], darfAktionen: false }),
        })}
        onZuDenDokumenten={null}
        onNachfordern={null}
      />,
    );
    expect(kastenSatz()).toContain(SATZ_OHNE_RECHT);
    expect(kastenSatz()).not.toContain("wieder an");
  });
});

// =============================================
// 5. Der Warnbalken: „Verlängerten Nachweis anfordern…"
// =============================================

describe("Warnbalken: verlängerten Nachweis anfordern", () => {
  type BalkenProps = React.ComponentProps<typeof NachweisFristenWarnung>;
  const ABGELAUFEN = [
    { id: "d-at", type: "AUFENTHALTSTITEL", gueltigBis: "2020-01-01T00:00:00.000Z" },
  ] as unknown as BalkenProps["documents"];
  const warnKnoepfe = () =>
    Array.from(document.querySelectorAll('[data-block="warnbalken-knoepfe"] button')).map((b) => b.textContent);
  const balkenSatz = () => document.querySelector('[data-zeile="balken-satz"]')?.textContent ?? "";

  function balken(teil: Partial<BalkenProps> = {}) {
    return render(<NachweisFristenWarnung documents={ABGELAUFEN} onZuDenDokumenten={null} {...teil} />);
  }

  test("Knopf mit Vorauswahl: der abgelaufene Titel und die Arbeitserlaubnis", () => {
    const onNachfordern = jest.fn();
    balken({ unterlagen: uebersicht(), onNachfordern, onZurNachforderung: jest.fn() });
    expect(warnKnoepfe()).toEqual(["Verlängerten Nachweis anfordern…"]);
    fireEvent.click(screen.getByRole("button", { name: "Verlängerten Nachweis anfordern…" }));
    expect(onNachfordern).toHaveBeenCalledWith({ modus: "neu", vorauswahl: ["AUFENTHALTSTITEL", "ARBEITSERLAUBNIS"] });
  });

  test("der Satz nennt den Weg — und dass die Warnung erst mit Datum oder „unbefristet“ endet", () => {
    balken({ unterlagen: uebersicht(), onNachfordern: jest.fn() });
    expect(balkenSatz()).toBe(
      "Eine Beschäftigung ohne gültigen Aufenthaltstitel ist für den Arbeitgeber bußgeldbewehrt (§ 404 SGB III, § 98 AufenthG). " +
        "Der Vorgang bleibt bedienbar. Fordern Sie den verlängerten Nachweis bei der Person an und nehmen Sie ihn mit seinem Ablaufdatum oder als unbefristet an – ohne Datum bleibt der abgelaufene Nachweis maßgeblich und diese Warnung stehen.",
    );
    expect(balkenSatz()).not.toContain("anfordern und hochladen");
    expect(balkenSatz()).not.toContain("sobald Sie ihn annehmen");
  });

  test("eingestellter Vorgang: statt der Aufforderung der Grund — und kein Knopf", () => {
    balken({
      unterlagen: uebersicht({ verfuegbar: { ok: false, grund: GRUND_EINGESTELLT }, vorgangEingestellt: true }),
      onNachfordern: jest.fn(),
    });
    expect(balkenSatz()).toContain(GRUND_EINGESTELLT);
    expect(balkenSatz()).not.toContain("Fordern Sie");
    expect(balkenSatz()).not.toContain("bleibt bedienbar");
    expect(warnKnoepfe()).toEqual([]);
  });

  test("ohne Bearbeitungsrecht kein Knopf und keine Aufforderung an „Sie“", () => {
    const erster = balken({ unterlagen: uebersicht({ darfAktionen: false }), onNachfordern: jest.fn() });
    expect(warnKnoepfe()).toEqual([]);
    expect(balkenSatz()).toContain(
      "Die Personalabteilung kann den verlängerten Nachweis über „Unterlagen nachfordern“ bei der Person anfordern.",
    );
    expect(balkenSatz()).not.toContain("Fordern Sie");
    erster.unmount();
    const zweiter = balken({ unterlagen: uebersicht(), onNachfordern: null });
    expect(within(zweiter.container).queryByRole("button")).toBeNull();
  });

  test("laufende Nachforderung mit dem Titel: Ergänzen nur um die Arbeitserlaubnis, dazu „Zur Nachforderung“", () => {
    const onNachfordern = jest.fn();
    balken({
      unterlagen: uebersicht({ nachforderungen: [LAUFEND_ZWEI] }),
      onNachfordern,
      onZurNachforderung: jest.fn(),
      onZuDenDokumenten: jest.fn(),
    });
    expect(warnKnoepfe()).toEqual(["Verlängerten Nachweis anfordern…", "Zur Nachforderung", "Zu den Dokumenten"]);
    fireEvent.click(screen.getByRole("button", { name: "Verlängerten Nachweis anfordern…" }));
    expect(onNachfordern).toHaveBeenCalledWith({ modus: "ergaenzen", vorauswahl: ["ARBEITSERLAUBNIS"] });
  });

  test("verlaengerungVorauswahl: der Titel zieht die Arbeitserlaubnis nach (N4)", () => {
    expect(verlaengerungVorauswahl(["AUFENTHALTSTITEL"])).toEqual(["AUFENTHALTSTITEL", "ARBEITSERLAUBNIS"]);
    expect(verlaengerungVorauswahl(["ARBEITSERLAUBNIS", "AUFENTHALTSTITEL"])).toEqual([
      "ARBEITSERLAUBNIS",
      "AUFENTHALTSTITEL",
    ]);
    expect(verlaengerungVorauswahl(["ARBEITSERLAUBNIS"])).toEqual(["ARBEITSERLAUBNIS"]);
  });
});

// =============================================
// 6. Kasten und Warnbalken → der ECHTE Dialog: was angekreuzt ist
// =============================================

/**
 * `vorauswahl` legt fest, was der Dialog ankreuzt; die uebrigen Vorschlaege
 * (offene Nachweise, `dialog.auswahl[].vorgeschlagen`) stehen darunter, nicht
 * angekreuzt. Die Rueckrufe allein belegen nicht, was HR im Dialog sieht —
 * hier geht die Anfrage aus Kasten bzw. Warnbalken in den echten Dialog, und
 * geprueft werden die Kaestchen, auch gegen den Knopf der Karte
 * (`vorauswahl: null`).
 */
describe("Kasten und Warnbalken öffnen den echten Dialog", () => {
  /** Eine Art, wie der Modul-Baustein sie liefert (`auswahl`). */
  function art(typ: string, vorgeschlagen: boolean): AuswahlEintrag {
    return {
      typ,
      label: documentTypeLabel(typ),
      vorgeschlagen,
      sensibel: false,
      erlaubt: true,
      grund: null,
      originalErforderlich: false,
      fristpflichtig: typ === "AUFENTHALTSTITEL" || typ === "ARBEITSERLAUBNIS",
      hinweis: null,
    };
  }
  const empfaenger = {
    vorgang: "anna.beispiel@example.org",
    vorschlaege: [{ adresse: "anna.beispiel@example.org", quelle: "VORGANG" as const }],
    erlaubteDomains: [],
  };
  const kaestchen = (typ: string) =>
    within(document.querySelector(`[data-art="${typ}"]`) as HTMLElement).getByRole("checkbox") as HTMLInputElement;

  function dialogAus(anfrage: NachforderungDialogAnfrage, u: UnterlagenUebersicht) {
    return render(
      <NachforderungDialog
        vorgangId="v1"
        uebersicht={u}
        modus={anfrage.modus}
        vorauswahl={anfrage.vorauswahl}
        onSchliessen={jest.fn()}
        onErfolg={jest.fn()}
        jetzt={JETZT}
      />,
    );
  }

  const angekreuzt = () =>
    Array.from(document.querySelectorAll("[data-art]"))
      .filter((el) => (within(el as HTMLElement).getByRole("checkbox") as HTMLInputElement).checked)
      .map((el) => (el as HTMLElement).dataset.art);

  test("Kasten: genau die offenen Nachweise angekreuzt — eine früher entfallene Art sichtbar, aber nicht", () => {
    const u = uebersicht({
      nachforderungen: [ERLEDIGT_AE_ENTFALLEN],
      dialog: {
        auswahl: [...VIER_OFFENE_ARTEN.map((t) => art(t, true)), art("ABSCHLUSSZEUGNIS", false)],
        empfaenger,
      },
    });
    const onNachfordern = jest.fn();
    const kasten = render(
      <OffeneNachweiseKasten
        data={vorgang({ ...VIER_OFFEN, unterlagen: u })}
        onZuDenDokumenten={null}
        onNachfordern={onNachfordern}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Unterlagen nachfordern…" }));
    kasten.unmount();

    dialogAus(onNachfordern.mock.calls[0][0], u);
    expect(angekreuzt()).toEqual(["MASERNSCHUTZ", "AUFENTHALTSTITEL", "PKV_NACHWEIS"]);
    // Die quittierte Arbeitserlaubnis steht darunter bei den nicht
    // vorausgewaehlten offenen Nachweisen, waehlbar und mit ihrem Stand.
    const offen = document.querySelector('[data-block="weitere-vorschlaege"]') as HTMLElement;
    expect(offen.contains(document.querySelector('[data-art="ARBEITSERLAUBNIS"]'))).toBe(true);
    expect(kaestchen("ARBEITSERLAUBNIS").disabled).toBe(false);
    expect(document.querySelector('[data-art="ARBEITSERLAUBNIS"] [data-hinweis="frueher-entfallen"]')?.textContent).toBe(
      "Entfällt laut einer früheren Nachforderung (vermerkt am 10.09.2026).",
    );
    expect(kaestchen("ABSCHLUSSZEUGNIS").checked).toBe(false);
  });

  test("Kasten und Knopf der Karte kreuzen dasselbe an", () => {
    const u = uebersicht({
      nachforderungen: [ERLEDIGT_AE_ENTFALLEN],
      dialog: {
        auswahl: [...VIER_OFFENE_ARTEN.map((t) => art(t, true)), art("ABSCHLUSSZEUGNIS", false)],
        empfaenger,
      },
    });
    const onNachfordern = jest.fn();
    const kasten = render(
      <OffeneNachweiseKasten
        data={vorgang({ ...VIER_OFFEN, unterlagen: u })}
        onZuDenDokumenten={null}
        onNachfordern={onNachfordern}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Unterlagen nachfordern…" }));
    kasten.unmount();

    const ausKasten = dialogAus(onNachfordern.mock.calls[0][0], u);
    const kreuzeKasten = angekreuzt();
    ausKasten.unmount();
    // Der Knopf „Unterlagen nachfordern…" der Karte oeffnet ohne Vorauswahl.
    dialogAus({ modus: "neu", vorauswahl: null }, u);
    expect(angekreuzt()).toEqual(kreuzeKasten);
  });

  test("Warnbalken: genau die ablaufenden Arten — die offenen Nachweise stehen darunter, nicht angekreuzt", () => {
    // Titel und Arbeitserlaubnis liegen als (abgelaufene) Dokumente vor, sind
    // also KEIN Vorschlag; offen ist nur der Masernschutz.
    const u = uebersicht({
      dialog: {
        auswahl: [
          art("MASERNSCHUTZ", true),
          art("AUFENTHALTSTITEL", false),
          art("ARBEITSERLAUBNIS", false),
          art("ABSCHLUSSZEUGNIS", false),
        ],
        empfaenger,
      },
    });
    type BalkenProps = React.ComponentProps<typeof NachweisFristenWarnung>;
    const onNachfordern = jest.fn();
    const warn = render(
      <NachweisFristenWarnung
        documents={
          [{ id: "d-at", type: "AUFENTHALTSTITEL", gueltigBis: "2020-01-01T00:00:00.000Z" }] as unknown as BalkenProps["documents"]
        }
        onZuDenDokumenten={null}
        unterlagen={u}
        onNachfordern={onNachfordern}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Verlängerten Nachweis anfordern…" }));
    warn.unmount();

    dialogAus(onNachfordern.mock.calls[0][0], u);
    expect(angekreuzt()).toEqual(["AUFENTHALTSTITEL", "ARBEITSERLAUBNIS"]);
    // Anlass ist der Ablauf: Der offene Masernschutz steht sichtbar darunter,
    // unter einer eigenen Ueberschrift, die sagt, warum er kein Kreuz hat — HR
    // kreuzt ihn bei Bedarf dazu.
    const arten = (block: string) =>
      Array.from(document.querySelectorAll(`[data-block="${block}"] [data-art]`)).map(
        (el) => (el as HTMLElement).dataset.art,
      );
    expect(arten("vorgeschlagen")).toEqual(["AUFENTHALTSTITEL", "ARBEITSERLAUBNIS"]);
    expect(arten("weitere-vorschlaege")).toEqual(["MASERNSCHUTZ"]);
    expect(document.querySelector('[data-block="weitere-vorschlaege"] p')?.textContent).toBe(
      "Weitere offene Nachweise (nicht vorausgewählt)",
    );
    expect(kaestchen("MASERNSCHUTZ").checked).toBe(false);
    expect(kaestchen("MASERNSCHUTZ").disabled).toBe(false);
    expect(kaestchen("ABSCHLUSSZEUGNIS").checked).toBe(false);
  });
});
