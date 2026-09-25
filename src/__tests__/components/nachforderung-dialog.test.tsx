/**
 * @jest-environment jsdom
 */

/**
 * Dialog „Unterlagen nachfordern…" / „Unterlagen ergänzen…" (Paket 4,
 * Schritt 10a; Feinplanung 10.1, Mockup P:1298-1322).
 *
 * Die Uebersicht entsteht mit der ECHTEN Regel des Servers
 * (`uebersichtBauen`), die Auswahl mit den echten Texten
 * (`NACHFORDERUNG_HINWEISE`, `SENSIBEL_SPERRGRUND_TEXTE`) — der Dialog rechnet
 * keine Pflichtregel selbst und zeigt nur, was der Server liefert. Jeder Body,
 * der an die Route geht, laeuft zusaetzlich durch `unterlagenAktionSchema`:
 * Ein Dialog, der eine Form baut, die der Server mit 400 ablehnt, faellt hier
 * auf und nicht erst im Betrieb.
 *
 * Belegt wird:
 *  1. Vorauswahl: ohne `vorauswahl` (Karte) die Vorschlaege angekreuzt mit dem
 *     Hinweis aus `NACHFORDERUNG_HINWEISE` (editierbar) — ausser einer frueher
 *     als entfallen vermerkten Art (sichtbar, mit Hinweis, waehlbar); mit
 *     `vorauswahl` (Kasten, Warnbalken) genau diese Arten, die uebrigen
 *     Vorschlaege darunter unter „Weitere offene Nachweise (nicht
 *     vorausgewählt)“, nicht angekreuzt.
 *  2. Kennzeichen „Vertraulich" (bzw. die Kategorie des Servers) und
 *     „Original" in der Beschreibung des Kaestchens; gesperrte Art mit Grund;
 *     SONSTIGES nie unter „Weitere".
 *  3. Frist: Vorschlag heute + 14 mit Wochentag, ausserhalb der Grenzen
 *     gesperrt, Wochenende nur Hinweis; Info-Satz ohne „7 Tage vorher" bei
 *     kurzer Frist; heute nie aelter als der Tag im Browser; Summenzeile.
 *  4. Empfaenger: abweichende Adresse gelb mit Pflicht-Kaestchen, nicht
 *     freigegebene rot und gesperrt, zweiter Vorschlag aus der Personalakte;
 *     ein Formatfehler steht am Feld, nicht als rot/gelb.
 *  5. Freie Zeilen, Obergrenze von 30 Unterlagen, Fokus nach „Entfernen".
 *  6. Body exakt (anfordern, ergaenzen).
 *  7. Modus „ergänzen": Empfaenger nur lesbar, schon angeforderte Arten nicht
 *     waehlbar ausser ENTFAELLT, Weg bei angenommener Art, Frist optional und
 *     nach Fristablauf Pflicht, Hinweis bei verkuerzter Frist, Info-Satz ohne
 *     „erhalten Sie"; Modus „neu": Hinweis, dass die Ruecknahme endet.
 *  8. Ergebnis: Erfolg nur bei zugestellter Mail; nicht zugestellt (FAILED)
 *     rot mit dem Weg ueber „Link erneut senden" (als Moeglichkeit, nicht als
 *     Zusage), uebersprungen (SKIPPED)
 *     und N2 gelb; Fehler im Dialog mit role="alert"; Doppelklick ergibt einen
 *     Aufruf.
 *  9. Rahmen: Fokus auf „Abbrechen", Escape — nicht waehrend des Sendens;
 *     Name · Vorgangsnummer unter dem Titel; Ersatzziel beim Schliessen.
 */
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { NachforderungDialog } from "@/components/unterlagen/nachforderung-dialog";
import {
  documentTypeLabel,
  NACHFORDERUNG_HINWEISE,
  SCHRIFTFORM_DOKUMENTTYPEN,
  SENSIBEL_SPERRGRUND_TEXTE,
  SENSIBLE_DOKUMENTTYPEN,
} from "@/lib/required-documents";
import {
  aktionsTexte,
  dialogErinnerungsSatz,
  MELDUNGEN,
  uebersichtBauen,
  type AuswahlEintrag,
  type NachforderungEingabe,
  type PositionEingabe,
  type UnterlagenDialogDaten,
  type UnterlagenMailErgebnis,
  type UnterlagenUebersicht,
} from "@/lib/unterlagen";
import { unterlagenAktionSchema } from "@/lib/validations/unterlagen";

// React 19 verlangt diese Marke, bevor act() Zustandsaenderungen einsammeln darf.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// =============================================
// Fixtur
// =============================================

/** Montag, 21.09.2026, 12:00 Uhr deutscher Zeit — heute + 14 ist Montag, 05.10.2026. */
const JETZT = new Date("2026-09-21T10:00:00.000Z");
const VORGANG = "vg-1";
const BASIS = `/api/onboarding/${VORGANG}/unterlagen`;
/** Die Route verlangt eine UUID als Nachforderungs-Id. */
const NF_ID = "3f2b8c1e-7d4a-4c2b-9e1f-0a1b2c3d4e5f";
const ADRESSE_VORGANG = "anna.beispiel@example.org";
const ADRESSE_AKTE = "a.beispiel@credo-gruppe.de";

/** Eine Art, wie der Modul-Baustein sie liefert (`auswahl`), mit den echten Listen und Texten. */
function art(teil: Partial<AuswahlEintrag> & { typ: string }): AuswahlEintrag {
  return {
    label: documentTypeLabel(teil.typ),
    vorgeschlagen: false,
    sensibel: SENSIBLE_DOKUMENTTYPEN.includes(teil.typ),
    erlaubt: true,
    grund: null,
    originalErforderlich: SCHRIFTFORM_DOKUMENTTYPEN.includes(teil.typ),
    fristpflichtig: false,
    hinweis: NACHFORDERUNG_HINWEISE[teil.typ] ?? null,
    ...teil,
  };
}

const AUSWAHL: AuswahlEintrag[] = [
  art({ typ: "MASERNSCHUTZ", vorgeschlagen: true }),
  art({ typ: "AUFENTHALTSTITEL", vorgeschlagen: true, fristpflichtig: true }),
  art({ typ: "ABSCHLUSSZEUGNIS" }),
  art({ typ: "FUEHRUNGSZEUGNIS", erlaubt: false, grund: SENSIBEL_SPERRGRUND_TEXTE.FUEHRUNGSZEUGNIS_KITA }),
  art({ typ: "SB_AUSWEIS", erlaubt: false, grund: SENSIBEL_SPERRGRUND_TEXTE.SB_AUSWEIS_OHNE_ANGABE }),
  art({ typ: "ARBEITSVERTRAG" }),
  art({ typ: "ARBEITSERLAUBNIS", fristpflichtig: true }),
  art({ typ: "PKV_NACHWEIS" }),
  // Der Server liefert die Sammelart nie — der Dialog laesst sie trotzdem weg.
  art({ typ: "SONSTIGES" }),
];

const DIALOG: UnterlagenDialogDaten = {
  auswahl: AUSWAHL,
  empfaenger: {
    vorgang: ADRESSE_VORGANG,
    vorschlaege: [
      { adresse: ADRESSE_VORGANG, quelle: "VORGANG" },
      { adresse: ADRESSE_AKTE, quelle: "PERSONALAKTE" },
    ],
    erlaubteDomains: ["credo-gruppe.de"],
  },
};

function position(teil: Partial<PositionEingabe> & { id: string }): PositionEingabe {
  return {
    reihenfolge: 0,
    typ: null,
    bezeichnung: "Unterlage",
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

/** Die laufende Nachforderung fuer „ergänzen": je Art ein anderer Stand. */
function nachforderung(teil: Partial<NachforderungEingabe> = {}): NachforderungEingabe {
  return {
    id: NF_ID,
    modul: "ONBOARDING",
    status: "LAUFEND",
    empfaenger: ADRESSE_VORGANG,
    frist: new Date("2026-10-02T00:00:00.000Z"),
    nachricht: null,
    angefordertAm: "2026-09-12T08:00:00.000Z",
    angefordertVonName: "Erika Muster",
    erinnertFuerFrist: null,
    erinnertStufe: null,
    erledigtAm: null,
    zurueckgezogenAm: null,
    positionen: [
      position({ id: "p-ms", typ: "MASERNSCHUTZ", bezeichnung: "Masernschutz-Nachweis", sensibel: true }),
      position({
        id: "p-at",
        reihenfolge: 1,
        typ: "AUFENTHALTSTITEL",
        bezeichnung: "Aufenthaltstitel",
        sensibel: true,
        fristpflichtig: true,
        status: "ANGENOMMEN",
        einreichungen: 1,
        uebermitteltAm: "2026-09-14T08:00:00.000Z",
        entschiedenAm: "2026-09-16T08:00:00.000Z",
      }),
      position({
        id: "p-az",
        reihenfolge: 2,
        typ: "ABSCHLUSSZEUGNIS",
        bezeichnung: "Abschlusszeugnis",
        status: "EINGEREICHT",
        einreichungen: 1,
        uebermitteltAm: "2026-09-18T08:00:00.000Z",
      }),
      position({
        id: "p-pkv",
        reihenfolge: 3,
        typ: "PKV_NACHWEIS",
        bezeichnung: "Nachweis private Krankenversicherung",
        status: "ENTFAELLT",
        entschiedenAm: "2026-09-17T08:00:00.000Z",
      }),
      position({ id: "p-frei", reihenfolge: 4, bezeichnung: "Unterschriebener RV-Antrag" }),
    ],
    links: [
      {
        anlass: "ANFORDERUNG",
        mailStatus: "SENT",
        mailDetail: null,
        gesendetAm: "2026-09-12T08:01:00.000Z",
        nachholVersuche: 0,
        erstelltVonId: "u-erika",
        createdAt: "2026-09-12T08:00:00.000Z",
      },
    ],
    ...teil,
  };
}

function uebersicht(
  opts: { nachforderungen?: NachforderungEingabe[]; dialog?: UnterlagenDialogDaten | null } = {},
): UnterlagenUebersicht {
  return uebersichtBauen({
    modul: "ONBOARDING",
    nachforderungen: opts.nachforderungen ?? [],
    verfuegbar: { ok: true },
    vorgangEingestellt: false,
    darfAktionen: true,
    dateiUrl: (id) => `${BASIS}/dateien/${id}`,
    apiBasis: BASIS,
    dialog: opts.dialog === undefined ? DIALOG : opts.dialog,
    jetzt: JETZT,
  });
}

function dialog(
  opts: {
    modus?: "neu" | "ergaenzen";
    vorauswahl?: string[] | null;
    u?: UnterlagenUebersicht;
    kopf?: { name?: string | null; vorgangsnummer?: string | null } | null;
    fokusZiel?: string;
    jetzt?: Date;
  } = {},
) {
  const onSchliessen = jest.fn();
  const onErfolg = jest.fn();
  const r = render(
    <NachforderungDialog
      uebersicht={opts.u ?? uebersicht()}
      modus={opts.modus ?? "neu"}
      vorauswahl={opts.vorauswahl ?? null}
      onSchliessen={onSchliessen}
      onErfolg={onErfolg}
      kopf={opts.kopf}
      fokusZiel={opts.fokusZiel}
      jetzt={opts.jetzt ?? JETZT}
    />,
  );
  return { onSchliessen, onErfolg, ...r };
}

const artZeile = (typ: string) => document.querySelector(`[data-art="${typ}"]`) as HTMLElement;
const kaestchen = (typ: string) => within(artZeile(typ)).getByRole("checkbox") as HTMLInputElement;
/** Das Hinweisfeld einer Art — sein Name nennt die Art, sonst hiessen alle Felder gleich. */
const hinweisFeld = (typ: string) =>
  within(artZeile(typ)).getByLabelText(
    `Hinweis an die Person (optional) – ${documentTypeLabel(typ)}`,
  ) as HTMLTextAreaElement;
const anfordernKnopf = () => screen.getByRole("button", { name: "Anfordern und E-Mail senden" }) as HTMLButtonElement;
const ergaenzenKnopf = () => screen.getByRole("button", { name: "Ergänzen und E-Mail senden" }) as HTMLButtonElement;
const grundZeile = () => document.querySelector('[data-zeile="grund"]')?.textContent ?? null;
const zeileText = (name: string) => document.querySelector(`[data-zeile="${name}"]`)?.textContent ?? null;
const hinweis = (name: string) => document.querySelector(`[data-hinweis="${name}"]`) as HTMLElement | null;
const fristFeld = () => screen.getByLabelText("Frist *") as HTMLInputElement;
/** Beim Ergaenzen nennt das Label, dass die neue Frist fuer alle Unterlagen gilt (EP-1). */
const ergaenzenFristFeld = (pflicht: boolean) =>
  screen.getByLabelText(`Neue Frist für alle Unterlagen ${pflicht ? "*" : "(optional)"}`) as HTMLInputElement;
const empfaengerFeld = () => screen.getByLabelText("Empfänger *") as HTMLInputElement;
/** Die Ids in `aria-describedby` eines Felds — und die Texte, auf die sie zeigen. */
const beschreibung = (feld: HTMLElement) =>
  (feld.getAttribute("aria-describedby") ?? "")
    .split(" ")
    .filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent ?? `<fehlt: ${id}>`);
/** Der Beginn des Info-Satzes beim Ergaenzen: die Meldung zum Fristablauf geht an die anfordernde Person (8.1). */
const neutralerSatz = (frist: string, heute: string) =>
  dialogErinnerungsSatz(frist, heute).replace("erhalten Sie eine E-Mail", "erhält die anfordernde HR-Kraft eine E-Mail");

/** fetch, das mit Status und Body antwortet. */
function fetchMit(status: number, body: unknown) {
  const f = jest.fn().mockResolvedValue({ ok: status >= 200 && status < 300, status, json: async () => body });
  global.fetch = f as unknown as typeof fetch;
  return f;
}

/** Der gesendete Body — und die Probe, dass die Route ihn so annimmt. */
function gesendet(f: jest.Mock) {
  expect(f).toHaveBeenCalledTimes(1);
  const [url, init] = f.mock.calls[0] as [string, RequestInit];
  expect(url).toBe(BASIS);
  expect(init.method).toBe("POST");
  const body = JSON.parse(init.body as string);
  expect(unterlagenAktionSchema.safeParse(body).success).toBe(true);
  return body;
}

/** 201 wie vom Server: Meldung und Warnung aus `aktionsTexte`. */
function anfordernAntwort(mail: UnterlagenMailErgebnis) {
  return { nachforderungId: NF_ID, mail, ...aktionsTexte("anfordern", mail) };
}

afterEach(() => {
  jest.restoreAllMocks();
});

// =============================================
// 1. Vorauswahl
// =============================================

describe("Vorauswahl", () => {
  it("die Vorschläge sind angekreuzt, mit dem Hinweis aus NACHFORDERUNG_HINWEISE", () => {
    dialog();
    const oben = document.querySelector('[data-block="vorgeschlagen"]') as HTMLElement;
    expect(oben.textContent).toContain("Vorgeschlagen (offene Nachweise)");
    expect(within(oben).getAllByRole("checkbox")).toHaveLength(2);
    expect(kaestchen("MASERNSCHUTZ").checked).toBe(true);
    expect(kaestchen("AUFENTHALTSTITEL").checked).toBe(true);
    expect(hinweisFeld("MASERNSCHUTZ").value).toBe(NACHFORDERUNG_HINWEISE.MASERNSCHUTZ);
    expect(hinweisFeld("AUFENTHALTSTITEL").value).toBe(NACHFORDERUNG_HINWEISE.AUFENTHALTSTITEL);
    // „Weitere" bleiben leer, ohne Hinweisfeld.
    expect(kaestchen("ABSCHLUSSZEUGNIS").checked).toBe(false);
    expect(kaestchen("ARBEITSERLAUBNIS").checked).toBe(false);
    expect(within(artZeile("ABSCHLUSSZEUGNIS")).queryByLabelText(/Hinweis an die Person/)).toBeNull();
  });

  it("der Hinweis ist je Unterlage editierbar, und eine angekreuzte weitere Art bekommt ihr Feld", () => {
    dialog();
    fireEvent.change(hinweisFeld("MASERNSCHUTZ"), { target: { value: "Nur die Seite mit den Impfungen." } });
    expect(hinweisFeld("MASERNSCHUTZ").value).toBe("Nur die Seite mit den Impfungen.");
    fireEvent.click(kaestchen("PKV_NACHWEIS"));
    expect(hinweisFeld("PKV_NACHWEIS").value).toBe(NACHFORDERUNG_HINWEISE.PKV_NACHWEIS);
    // Abwaehlen und wieder ankreuzen verliert die Aenderung nicht.
    fireEvent.click(kaestchen("MASERNSCHUTZ"));
    fireEvent.click(kaestchen("MASERNSCHUTZ"));
    expect(hinweisFeld("MASERNSCHUTZ").value).toBe("Nur die Seite mit den Impfungen.");
  });

  it("`vorauswahl` legt fest: genau diese Arten angekreuzt — die übrigen Vorschläge darunter, nicht angekreuzt", () => {
    dialog({ vorauswahl: ["ARBEITSERLAUBNIS", "FUEHRUNGSZEUGNIS", "SONSTIGES"] });
    expect(kaestchen("ARBEITSERLAUBNIS").checked).toBe(true);
    expect(hinweisFeld("ARBEITSERLAUBNIS").value).toBe(NACHFORDERUNG_HINWEISE.ARBEITSERLAUBNIS);
    // Die Vorschlaege bleiben sichtbar und waehlbar, aber nicht angekreuzt.
    expect(kaestchen("MASERNSCHUTZ").checked).toBe(false);
    expect(kaestchen("MASERNSCHUTZ").disabled).toBe(false);
    expect(kaestchen("AUFENTHALTSTITEL").checked).toBe(false);
    // Oben nur die Vorauswahl — die Ueberschrift sagt dann nicht mehr „offene
    // Nachweise" —, darunter die Vorschlaege unter eigener Ueberschrift, die
    // sagt, warum sie kein Kreuz haben.
    const reiheIn = (block: string) =>
      Array.from(document.querySelectorAll(`[data-block="${block}"] [data-art]`)).map(
        (el) => (el as HTMLElement).dataset.art,
      );
    const oben = document.querySelector('[data-block="vorgeschlagen"]') as HTMLElement;
    expect(reiheIn("vorgeschlagen")).toEqual(["FUEHRUNGSZEUGNIS", "ARBEITSERLAUBNIS"]);
    expect(oben.textContent).not.toContain("offene Nachweise");
    expect(reiheIn("weitere-vorschlaege")).toEqual(["MASERNSCHUTZ", "AUFENTHALTSTITEL"]);
    expect(document.querySelector('[data-block="weitere-vorschlaege"] p')?.textContent).toBe(
      "Weitere offene Nachweise (nicht vorausgewählt)",
    );
    // Gesperrt bleibt gesperrt, auch auf Zuruf — mit seinem Grund oben sichtbar.
    expect(kaestchen("FUEHRUNGSZEUGNIS").checked).toBe(false);
    expect(kaestchen("FUEHRUNGSZEUGNIS").disabled).toBe(true);
    expect(artZeile("SONSTIGES")).toBeNull();
    expect(zeileText("summe")).toContain("1 Unterlage ·");
    // Ein Vorschlag laesst sich dazu ankreuzen.
    fireEvent.click(kaestchen("MASERNSCHUTZ"));
    expect(zeileText("summe")).toContain("2 Unterlagen");
  });

  it("`vorauswahl` mit genau den Vorschlägen: alle angekreuzt, Überschrift „offene Nachweise“", () => {
    dialog({ vorauswahl: ["MASERNSCHUTZ", "AUFENTHALTSTITEL"] });
    expect(kaestchen("MASERNSCHUTZ").checked).toBe(true);
    expect(kaestchen("AUFENTHALTSTITEL").checked).toBe(true);
    expect((document.querySelector('[data-block="vorgeschlagen"]') as HTMLElement).textContent).toContain(
      "Vorgeschlagen (offene Nachweise)",
    );
    // Kein uebriger Vorschlag — keine zweite Ueberschrift.
    expect(document.querySelector('[data-block="weitere-vorschlaege"]')).toBeNull();
  });

  it("leere `vorauswahl`: nichts angekreuzt, die Vorschläge stehen unter „nicht vorausgewählt“", () => {
    dialog({ vorauswahl: [] });
    expect(kaestchen("MASERNSCHUTZ").checked).toBe(false);
    expect(kaestchen("AUFENTHALTSTITEL").checked).toBe(false);
    expect(document.querySelector('[data-block="vorgeschlagen"]')).toBeNull();
    const offen = document.querySelector('[data-block="weitere-vorschlaege"]') as HTMLElement;
    expect(offen.contains(artZeile("MASERNSCHUTZ"))).toBe(true);
    expect(anfordernKnopf().disabled).toBe(true);
    expect(grundZeile()).toBe(MELDUNGEN.KEINE_POSITION);
  });

  it("ohne `vorauswahl` nur die Vorschläge — in einem Block, ohne „nicht vorausgewählt“", () => {
    dialog({ vorauswahl: null });
    expect(kaestchen("ARBEITSERLAUBNIS").checked).toBe(false);
    const weitere = document.querySelector('[data-block="weitere"]') as HTMLElement;
    expect(weitere.contains(artZeile("ARBEITSERLAUBNIS"))).toBe(true);
    expect(document.querySelector('[data-block="weitere-vorschlaege"]')).toBeNull();
  });

  describe("früher als entfallen vermerkt (dieselbe Regel wie im Kasten)", () => {
    /** Eine aeltere, erledigte Nachforderung: Masernschutz dort als entfallen vermerkt. */
    const erledigtMitEntfallen = (teil: Partial<NachforderungEingabe> = {}) =>
      nachforderung({
        id: "nf-alt",
        status: "ERLEDIGT",
        angefordertAm: "2026-09-01T08:00:00.000Z",
        erledigtAm: "2026-09-10T08:00:00.000Z",
        links: [],
        positionen: [
          position({
            id: "p-ms-alt",
            typ: "MASERNSCHUTZ",
            bezeichnung: "Masernschutz-Nachweis",
            sensibel: true,
            status: "ENTFAELLT",
            entschiedenAm: "2026-09-10T08:00:00.000Z",
          }),
        ],
        ...teil,
      });
    const ENTFALLEN_SATZ = "Entfällt laut einer früheren Nachforderung (vermerkt am 10.09.2026).";

    it("Knopf der Karte (`null`): nicht angekreuzt, sichtbar oben mit Hinweis — und wählbar", () => {
      const u = uebersicht({ nachforderungen: [erledigtMitEntfallen()] });
      // Dieselbe Quelle wie der Kasten: `typen`, auch ohne rücknehmbare Annahme (zuletztErledigt fehlt).
      expect(u.zuletztErledigt).toBeNull();
      dialog({ u, vorauswahl: null });
      const ms = kaestchen("MASERNSCHUTZ");
      expect(ms.checked).toBe(false);
      expect(ms.disabled).toBe(false);
      const oben = document.querySelector('[data-block="vorgeschlagen"]') as HTMLElement;
      expect(oben.contains(artZeile("MASERNSCHUTZ"))).toBe(true);
      const info = artZeile("MASERNSCHUTZ").querySelector('[data-hinweis="frueher-entfallen"]') as HTMLElement;
      expect(info.textContent).toBe(ENTFALLEN_SATZ);
      expect(beschreibung(ms)).toEqual(["Vertraulich", ENTFALLEN_SATZ]);
      // Die uebrigen Vorschlaege bleiben angekreuzt.
      expect(kaestchen("AUFENTHALTSTITEL").checked).toBe(true);
      expect(zeileText("summe")).toContain("1 Unterlage ·");
      fireEvent.click(ms);
      expect(ms.checked).toBe(true);
    });

    it("mit `vorauswahl`, die sie nennt, ist sie angekreuzt — der Hinweis bleibt", () => {
      dialog({ u: uebersicht({ nachforderungen: [erledigtMitEntfallen()] }), vorauswahl: ["MASERNSCHUTZ"] });
      expect(kaestchen("MASERNSCHUTZ").checked).toBe(true);
      expect(artZeile("MASERNSCHUTZ").querySelector('[data-hinweis="frueher-entfallen"]')?.textContent).toBe(
        ENTFALLEN_SATZ,
      );
      expect(kaestchen("AUFENTHALTSTITEL").checked).toBe(false);
    });

    it("beim Ergänzen (`null`): eine früher entfallene Art ist nicht angekreuzt, ein neuer Vorschlag schon", () => {
      // Arbeitserlaubnis: in der aelteren entfallen; Arbeitsvertrag: in keiner Nachforderung.
      const auswahl = AUSWAHL.map((a) =>
        a.typ === "ARBEITSERLAUBNIS" || a.typ === "ARBEITSVERTRAG" ? { ...a, vorgeschlagen: true } : a,
      );
      const alt = erledigtMitEntfallen({
        positionen: [
          position({
            id: "p-ae-alt",
            typ: "ARBEITSERLAUBNIS",
            bezeichnung: "Arbeitserlaubnis / Zusatzblatt",
            status: "ENTFAELLT",
            entschiedenAm: "2026-09-10T08:00:00.000Z",
          }),
        ],
      });
      dialog({
        modus: "ergaenzen",
        vorauswahl: null,
        u: uebersicht({ nachforderungen: [nachforderung(), alt], dialog: { ...DIALOG, auswahl } }),
      });
      expect(kaestchen("ARBEITSERLAUBNIS").checked).toBe(false);
      expect(artZeile("ARBEITSERLAUBNIS").querySelector('[data-hinweis="frueher-entfallen"]')?.textContent).toBe(
        ENTFALLEN_SATZ,
      );
      expect(kaestchen("ARBEITSVERTRAG").checked).toBe(true);
      // Die in der LAUFENDEN entfallene Art traegt ihren eigenen Zusatz, keinen Hinweis auf eine fruehere.
      expect(artZeile("PKV_NACHWEIS").querySelector('[data-hinweis="frueher-entfallen"]')).toBeNull();
    });

    it("beim Ergänzen mit `vorauswahl` (Warnbalken): eine in der laufenden entfallene Art ist angekreuzt, eine angeforderte nicht", () => {
      dialog({
        modus: "ergaenzen",
        vorauswahl: ["PKV_NACHWEIS", "MASERNSCHUTZ"],
        u: uebersicht({ nachforderungen: [nachforderung()] }),
      });
      expect(kaestchen("PKV_NACHWEIS").checked).toBe(true);
      expect(kaestchen("MASERNSCHUTZ").checked).toBe(false);
      expect(kaestchen("MASERNSCHUTZ").disabled).toBe(true);
      expect(zeileText("summe")).toContain("1 weitere Unterlage");
    });
  });
});

// =============================================
// 2. Kennzeichen, gesperrte Arten, SONSTIGES
// =============================================

describe("Kennzeichen und gesperrte Arten", () => {
  it("vertrauliche Arten tragen „Vertraulich“ und den Hinweis zur E-Mail, Schriftform „Original“", () => {
    dialog();
    expect(artZeile("MASERNSCHUTZ").querySelector('[data-chip="vertraulich"]')?.textContent).toBe("Vertraulich");
    expect(artZeile("MASERNSCHUTZ").querySelector('[data-hinweis="sensibel"]')?.textContent).toBe(
      "Erscheint nur auf der Upload-Seite, nicht in der E-Mail.",
    );
    expect(artZeile("ABSCHLUSSZEUGNIS").querySelector('[data-chip="vertraulich"]')).toBeNull();
    const original = artZeile("ARBEITSVERTRAG").querySelector('[data-chip="original"]') as HTMLElement;
    expect(original.textContent).toBe("Original erforderlich");
    expect(artZeile("ABSCHLUSSZEUGNIS").querySelector('[data-chip="original"]')).toBeNull();
    // Die Kennzeichen stehen nicht im Namen des Kaestchens — aber in seiner Beschreibung.
    const vertrag = screen.getByRole("checkbox", { name: "Arbeitsvertrag" });
    expect(beschreibung(vertrag)).toEqual(["Original erforderlich"]);
    expect(beschreibung(kaestchen("MASERNSCHUTZ"))).toEqual(["Vertraulich"]);
    expect(kaestchen("ABSCHLUSSZEUGNIS").hasAttribute("aria-describedby")).toBe(false);
  });

  it("nennt der Server die Art der sensiblen Daten (`sensibelKategorie`), steht sie im Kennzeichen", () => {
    // Das Feld traegt der Modul-Baustein bei (E-1); der Dialog ordnet selbst nichts zu.
    const mitKategorie: Record<string, string> = {
      MASERNSCHUTZ: "Gesundheitsdaten",
      AUFENTHALTSTITEL: "Aufenthaltsstatus",
      FUEHRUNGSZEUGNIS: "Art. 10 DSGVO",
    };
    const auswahl = AUSWAHL.map((a) =>
      mitKategorie[a.typ] ? ({ ...a, sensibelKategorie: mitKategorie[a.typ] } as AuswahlEintrag) : a,
    );
    dialog({ u: uebersicht({ dialog: { ...DIALOG, auswahl } }) });
    const chip = (typ: string) => artZeile(typ).querySelector('[data-chip="vertraulich"]')?.textContent;
    expect(chip("MASERNSCHUTZ")).toBe("Gesundheitsdaten");
    expect(chip("AUFENTHALTSTITEL")).toBe("Aufenthaltsstatus");
    expect(chip("FUEHRUNGSZEUGNIS")).toBe("Art. 10 DSGVO");
    // Ohne Angabe bleibt das allgemeine Kennzeichen.
    expect(chip("SB_AUSWEIS")).toBe("Vertraulich");
    expect(beschreibung(kaestchen("MASERNSCHUTZ"))).toEqual(["Gesundheitsdaten"]);
  });

  it("eine gesperrte vertrauliche Art ist ausgegraut, mit dem Grund des Servers", () => {
    dialog();
    const fz = kaestchen("FUEHRUNGSZEUGNIS");
    expect(fz.disabled).toBe(true);
    expect(artZeile("FUEHRUNGSZEUGNIS").dataset.gesperrt).toBe("true");
    const grund = artZeile("FUEHRUNGSZEUGNIS").querySelector('[data-zeile="art-grund"]') as HTMLElement;
    expect(grund.textContent).toBe(SENSIBEL_SPERRGRUND_TEXTE.FUEHRUNGSZEUGNIS_KITA);
    expect(fz.getAttribute("aria-describedby")?.split(" ")).toContain(grund.id);
    expect(beschreibung(fz)).toEqual(["Vertraulich", SENSIBEL_SPERRGRUND_TEXTE.FUEHRUNGSZEUGNIS_KITA]);
    expect(artZeile("SB_AUSWEIS").textContent).toContain(SENSIBEL_SPERRGRUND_TEXTE.SB_AUSWEIS_OHNE_ANGABE);
  });

  it("eine vorgeschlagene, aber gesperrte Art ist nicht angekreuzt", () => {
    const auswahl = AUSWAHL.map((a) =>
      a.typ === "FUEHRUNGSZEUGNIS" ? { ...a, vorgeschlagen: true } : a,
    );
    dialog({ u: uebersicht({ dialog: { ...DIALOG, auswahl } }) });
    expect(kaestchen("FUEHRUNGSZEUGNIS").checked).toBe(false);
    expect(zeileText("summe")).toContain("2 Unterlagen");
  });

  it("SONSTIGES steht nicht unter „Weitere“", () => {
    dialog();
    const weitere = document.querySelector('[data-block="weitere"]') as HTMLElement;
    expect(weitere.textContent).not.toContain(documentTypeLabel("SONSTIGES"));
    expect(screen.queryByRole("checkbox", { name: documentTypeLabel("SONSTIGES") })).toBeNull();
    expect(within(weitere).getAllByRole("checkbox")).toHaveLength(6);
  });
});

// =============================================
// 3. Frist, Info-Satz, Summe
// =============================================

describe("Frist", () => {
  it("Vorschlag heute + 14 mit Wochentag, Grenzen morgen bis heute + 90", () => {
    dialog();
    const feld = fristFeld();
    expect(feld.type).toBe("date");
    expect(feld.value).toBe("2026-10-05");
    expect(feld.min).toBe("2026-09-22");
    expect(feld.max).toBe("2026-12-20");
    expect(zeileText("frist-lang")).toBe("Montag, 05.10.2026");
    expect(zeileText("summe")).toBe("2 Unterlagen · Frist 05.10.2026 · an anna.beispiel@example.org");
    expect(anfordernKnopf().disabled).toBe(false);
  });

  it("außerhalb der Grenzen gesperrt, mit Grund", () => {
    dialog();
    fireEvent.change(fristFeld(), { target: { value: "2026-09-21" } });
    expect(anfordernKnopf().disabled).toBe(true);
    expect(grundZeile()).toBe(MELDUNGEN.FRIST_ZU_FRUEH);
    expect(hinweis("frist-fehler")?.textContent).toBe(MELDUNGEN.FRIST_ZU_FRUEH);
    expect(fristFeld().getAttribute("aria-invalid")).toBe("true");
    expect(zeileText("erinnerung")).toBeNull();

    fireEvent.change(fristFeld(), { target: { value: "2026-12-21" } });
    expect(anfordernKnopf().disabled).toBe(true);
    expect(grundZeile()).toBe(MELDUNGEN.FRIST_ZU_SPAET);

    fireEvent.change(fristFeld(), { target: { value: "2026-12-20" } });
    expect(anfordernKnopf().disabled).toBe(false);

    fireEvent.change(fristFeld(), { target: { value: "" } });
    expect(anfordernKnopf().disabled).toBe(true);
    expect(grundZeile()).toBe(MELDUNGEN.FRIST_FEHLT);
  });

  it("eine Frist am Wochenende ist erlaubt — nur ein Hinweis", () => {
    dialog();
    fireEvent.change(fristFeld(), { target: { value: "2026-10-03" } });
    expect(zeileText("frist-lang")).toBe("Samstag, 03.10.2026");
    expect(hinweis("wochenende")?.textContent).toContain("Samstag");
    expect(anfordernKnopf().disabled).toBe(false);
    fireEvent.change(fristFeld(), { target: { value: "2026-10-02" } });
    expect(hinweis("wochenende")).toBeNull();
  });

  it("Info-Satz aus dialogErinnerungsSatz — bei kurzer Frist ohne „7 Tage vorher“", () => {
    dialog();
    expect(zeileText("erinnerung")).toBe(dialogErinnerungsSatz("2026-10-05", "2026-09-21"));
    expect(zeileText("erinnerung")).toContain("7 Tage vorher");

    fireEvent.change(fristFeld(), { target: { value: "2026-09-25" } });
    const satz = zeileText("erinnerung") ?? "";
    expect(satz).toBe(dialogErinnerungsSatz("2026-09-25", "2026-09-21"));
    expect(satz).not.toContain("7 Tage vorher");
    expect(satz).toContain("am Fristtag");
  });

  it("Wochentag, Fehler und Wochenend-Hinweis hängen am Feld (aria-describedby)", () => {
    dialog();
    expect(beschreibung(fristFeld())).toEqual(["Montag, 05.10.2026"]);
    fireEvent.change(fristFeld(), { target: { value: "2026-10-03" } });
    expect(beschreibung(fristFeld())).toEqual(["Samstag, 03.10.2026", hinweis("wochenende")?.textContent]);
    fireEvent.change(fristFeld(), { target: { value: "2026-09-21" } });
    expect(beschreibung(fristFeld())).toEqual(["Montag, 21.09.2026", MELDUNGEN.FRIST_ZU_FRUEH]);
  });

  describe("heute: der Tag des Servers, aber nie älter als der im Browser", () => {
    // Die letzte Nachforderung traegt den Tag des Servers (21.09.) in ihren Fristgrenzen.
    const erledigt = () =>
      nachforderung({
        status: "ERLEDIGT",
        erledigtAm: "2026-09-18T08:00:00.000Z",
        positionen: [
          position({
            id: "p-at",
            typ: "AUFENTHALTSTITEL",
            bezeichnung: "Aufenthaltstitel",
            status: "ANGENOMMEN",
            einreichungen: 1,
            entschiedenAm: "2026-09-16T08:00:00.000Z",
          }),
        ],
      });

    it("über Nacht offen: Übersicht von gestern, im Browser heute — Grenzen und Info-Satz von heute", () => {
      const u = uebersicht({ nachforderungen: [erledigt()] });
      expect(u.zuletztErledigt?.dialog.fristGrenzen.min).toBe("2026-09-22");
      // Dienstag, 22.09.2026, 12:00 Uhr deutscher Zeit.
      dialog({ u, jetzt: new Date("2026-09-22T10:00:00.000Z") });
      expect(fristFeld().min).toBe("2026-09-23");
      expect(fristFeld().max).toBe("2026-12-21");
      expect(fristFeld().value).toBe("2026-10-06");
      // Morgen nach dem alten Stand ist heute — der Server lehnte das ab.
      fireEvent.change(fristFeld(), { target: { value: "2026-09-22" } });
      expect(grundZeile()).toBe(MELDUNGEN.FRIST_ZU_FRUEH);
      // Frist in 7 Tagen: keine Vorab-Erinnerung mehr, die der Lauf nie verschickte.
      fireEvent.change(fristFeld(), { target: { value: "2026-09-29" } });
      expect(zeileText("erinnerung")).toBe(dialogErinnerungsSatz("2026-09-29", "2026-09-22"));
      expect(zeileText("erinnerung")).not.toContain("7 Tage vorher");
    });

    it("geht die Uhr im Browser nach, gilt der Tag des Servers", () => {
      const u = uebersichtBauen({
        modul: "ONBOARDING",
        nachforderungen: [erledigt()],
        verfuegbar: { ok: true },
        vorgangEingestellt: false,
        darfAktionen: true,
        dateiUrl: (id) => `${BASIS}/dateien/${id}`,
        apiBasis: BASIS,
        dialog: DIALOG,
        jetzt: new Date("2026-09-22T10:00:00.000Z"),
      });
      dialog({ u, jetzt: JETZT });
      expect(fristFeld().min).toBe("2026-09-23");
      expect(fristFeld().value).toBe("2026-10-06");
    });
  });
});

// =============================================
// 4. Empfaenger
// =============================================

describe("Empfänger", () => {
  it("vorbelegt mit der Adresse aus dem Vorgang — ohne gelben Hinweis und ohne Kästchen", () => {
    dialog();
    expect(empfaengerFeld().value).toBe(ADRESSE_VORGANG);
    expect(screen.getByText(/Aus dem Vorgang\. Eine andere Adresse braucht eine freigegebene Domain\./)).toBeTruthy();
    expect(beschreibung(empfaengerFeld())).toEqual([
      "Aus dem Vorgang. Eine andere Adresse braucht eine freigegebene Domain.",
    ]);
    expect(empfaengerFeld().hasAttribute("aria-invalid")).toBe(false);
    expect(hinweis("abweichend")).toBeNull();
    expect(screen.queryByRole("checkbox", { name: /Adresse geprüft/ })).toBeNull();
  });

  it("zweiter Vorschlag aus der Personalakte: gelb, Pflicht-Kästchen „Adresse geprüft“", async () => {
    const f = fetchMit(201, anfordernAntwort({ status: "SENT", detail: null }));
    dialog();
    const vorschlag = screen.getByRole("button", { name: `${ADRESSE_AKTE} (aus der Personalakte)` });
    fireEvent.click(vorschlag);
    expect(empfaengerFeld().value).toBe(ADRESSE_AKTE);
    expect(vorschlag.getAttribute("aria-pressed")).toBe("true");
    const gelb = hinweis("abweichend") as HTMLElement;
    expect(gelb.textContent).toContain("Adresse aus der Personalakte.");
    expect(gelb.textContent).toContain(`(${ADRESSE_VORGANG})`);
    expect(anfordernKnopf().disabled).toBe(true);
    expect(grundZeile()).toBe(MELDUNGEN.ADRESSE_NICHT_BESTAETIGT);
    // Der gelbe Satz beschreibt Feld und Kaestchen; „Aus dem Vorgang" steht nicht mehr da.
    const gelbSatz = gelb.querySelector("p")?.textContent;
    expect(beschreibung(empfaengerFeld())).toEqual([gelbSatz]);
    expect(beschreibung(screen.getByRole("checkbox", { name: /Adresse geprüft/ }))).toEqual([gelbSatz]);
    expect(hinweis("aus-dem-vorgang")).toBeNull();

    fireEvent.click(screen.getByRole("checkbox", { name: /Adresse geprüft/ }));
    expect(anfordernKnopf().disabled).toBe(false);
    expect(zeileText("summe")).toContain(`an ${ADRESSE_AKTE}`);

    await act(async () => {
      fireEvent.click(anfordernKnopf());
    });
    const body = gesendet(f);
    expect(body.empfaenger).toBe(ADRESSE_AKTE);
    expect(body.adresseBestaetigt).toBe(true);
  });

  it("eine neue Eingabe nimmt die Bestätigung zurück", () => {
    dialog();
    fireEvent.change(empfaengerFeld(), { target: { value: "anna@credo-gruppe.de" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /Adresse geprüft/ }));
    expect(anfordernKnopf().disabled).toBe(false);
    fireEvent.change(empfaengerFeld(), { target: { value: "anna.b@credo-gruppe.de" } });
    expect((screen.getByRole("checkbox", { name: /Adresse geprüft/ }) as HTMLInputElement).checked).toBe(false);
    expect(anfordernKnopf().disabled).toBe(true);
  });

  it("nicht freigegebene Domain: rot, ohne Kästchen, Knopf gesperrt", () => {
    dialog();
    fireEvent.change(empfaengerFeld(), { target: { value: "anna@gmail.com" } });
    const rot = hinweis("nicht-freigegeben") as HTMLElement;
    expect(rot.textContent).toContain(MELDUNGEN.EMPFAENGER_NICHT_FREIGEGEBEN);
    expect(rot.textContent).toContain("Freigegeben sind: credo-gruppe.de.");
    expect(empfaengerFeld().getAttribute("aria-invalid")).toBe("true");
    expect(beschreibung(empfaengerFeld())).toEqual([rot.textContent]);
    expect(screen.queryByRole("checkbox", { name: /Adresse geprüft/ })).toBeNull();
    expect(anfordernKnopf().disabled).toBe(true);
    expect(grundZeile()).toBe("Diese Adresse ist nicht freigegeben.");
    // Zurueck zur Adresse aus dem Vorgang: wieder frei.
    fireEvent.click(screen.getByRole("button", { name: `${ADRESSE_VORGANG} (aus dem Vorgang)` }));
    expect(anfordernKnopf().disabled).toBe(false);
  });

  it("leere Freigabeliste schränkt nichts ein — die Bestätigung bleibt Pflicht", () => {
    dialog({ u: uebersicht({ dialog: { ...DIALOG, empfaenger: { ...DIALOG.empfaenger, erlaubteDomains: [] } } }) });
    // Der Satz unter dem Feld nennt keine Domain-Schranke, die es nicht gibt.
    expect(hinweis("aus-dem-vorgang")?.textContent).toBe(
      "Aus dem Vorgang. Eine andere Adresse müssen Sie ausdrücklich als geprüft bestätigen.",
    );
    expect(screen.queryByText(/freigegebene Domain/)).toBeNull();
    fireEvent.change(empfaengerFeld(), { target: { value: "anna@gmail.com" } });
    expect(hinweis("nicht-freigegeben")).toBeNull();
    expect(hinweis("abweichend")).not.toBeNull();
    expect(grundZeile()).toBe(MELDUNGEN.ADRESSE_NICHT_BESTAETIGT);
  });

  it("ohne Personalakte kein zweiter Vorschlag", () => {
    const empfaenger = {
      ...DIALOG.empfaenger,
      vorschlaege: [{ adresse: ADRESSE_VORGANG, quelle: "VORGANG" as const }],
    };
    dialog({ u: uebersicht({ dialog: { ...DIALOG, empfaenger } }) });
    expect(screen.queryByRole("button", { name: /aus der Personalakte/ })).toBeNull();
    expect(document.querySelector('[data-block="vorschlaege"]')).toBeNull();
  });

  it("ungültige oder leere Adresse sperrt", () => {
    dialog();
    fireEvent.change(empfaengerFeld(), { target: { value: "" } });
    expect(grundZeile()).toBe("Bitte geben Sie eine E-Mail-Adresse an.");
    fireEvent.change(empfaengerFeld(), { target: { value: "anna@" } });
    expect(grundZeile()).toBe("Bitte geben Sie eine gültige E-Mail-Adresse an.");
  });

  describe("ein Formatfehler steht am Feld — nicht als „nicht freigegeben“ oder „weicht ab“", () => {
    it("„anna@“: kein roter Kasten, kein Kästchen, der Fehler am Feld", () => {
      dialog();
      fireEvent.change(empfaengerFeld(), { target: { value: "anna@" } });
      expect(hinweis("nicht-freigegeben")).toBeNull();
      expect(hinweis("abweichend")).toBeNull();
      expect(screen.queryByRole("checkbox", { name: /Adresse geprüft/ })).toBeNull();
      expect(hinweis("aus-dem-vorgang")).toBeNull();
      expect(hinweis("empfaenger-fehler")?.textContent).toBe("Bitte geben Sie eine gültige E-Mail-Adresse an.");
      expect(empfaengerFeld().getAttribute("aria-invalid")).toBe("true");
      expect(beschreibung(empfaengerFeld())).toEqual(["Bitte geben Sie eine gültige E-Mail-Adresse an."]);
    });

    it("leere Freigabeliste und ungültige Adresse: kein gelber Kasten mit Pflicht-Kästchen", () => {
      dialog({ u: uebersicht({ dialog: { ...DIALOG, empfaenger: { ...DIALOG.empfaenger, erlaubteDomains: [] } } }) });
      fireEvent.change(empfaengerFeld(), { target: { value: "anna.gmail.com" } });
      expect(hinweis("abweichend")).toBeNull();
      expect(screen.queryByRole("checkbox", { name: /Adresse geprüft/ })).toBeNull();
      expect(hinweis("empfaenger-fehler")?.textContent).toBe("Bitte geben Sie eine gültige E-Mail-Adresse an.");
    });

    it("leeres Feld: „Bitte geben Sie eine E-Mail-Adresse an.“ statt „Aus dem Vorgang“", () => {
      dialog();
      fireEvent.change(empfaengerFeld(), { target: { value: "  " } });
      expect(hinweis("aus-dem-vorgang")).toBeNull();
      expect(hinweis("empfaenger-fehler")?.textContent).toBe("Bitte geben Sie eine E-Mail-Adresse an.");
      expect(empfaengerFeld().getAttribute("aria-invalid")).toBe("true");
    });
  });
});

// =============================================
// 5. Freie Zeilen und Obergrenze
// =============================================

describe("Weitere Unterlagen (freie Zeilen)", () => {
  it("Satz zu Gesundheitsdaten, Fokus in die neue Zeile, leere Bezeichnung sperrt, Entfernen", () => {
    dialog();
    expect(hinweis("freie-zeilen")?.textContent).toContain(
      "Bitte keine Gesundheitsdaten über freie Zeilen anfordern.",
    );
    fireEvent.click(screen.getByRole("button", { name: "+ Weitere Unterlage hinzufügen" }));
    const bezeichnung = screen.getByLabelText("Bezeichnung *") as HTMLInputElement;
    expect(document.activeElement).toBe(bezeichnung);
    expect(bezeichnung.maxLength).toBe(120);
    expect(anfordernKnopf().disabled).toBe(true);
    expect(grundZeile()).toContain("Bezeichnung");

    fireEvent.change(bezeichnung, { target: { value: "Unterschriebener RV-Antrag" } });
    expect(anfordernKnopf().disabled).toBe(false);
    expect(zeileText("summe")).toContain("3 Unterlagen");

    fireEvent.click(screen.getByRole("button", { name: "Weitere Unterlage 1 entfernen" }));
    expect(screen.queryByLabelText("Bezeichnung *")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "+ Weitere Unterlage hinzufügen" }));
  });

  it("höchstens 30 Unterlagen: Hinzufügen gesperrt, eine weitere Art sperrt den Knopf", () => {
    dialog();
    const hinzufuegen = screen.getByRole("button", { name: "+ Weitere Unterlage hinzufügen" }) as HTMLButtonElement;
    for (let i = 0; i < 28; i++) fireEvent.click(hinzufuegen);
    screen.getAllByLabelText("Bezeichnung *").forEach((feld, i) => {
      fireEvent.change(feld, { target: { value: `Unterlage ${i + 1}` } });
    });
    expect(zeileText("summe")).toContain("30 Unterlagen");
    expect(hinzufuegen.disabled).toBe(true);
    expect(hinweis("obergrenze")?.textContent).toBe(MELDUNGEN.ZU_VIELE_POSITIONEN);
    expect(anfordernKnopf().disabled).toBe(false);

    fireEvent.click(kaestchen("ABSCHLUSSZEUGNIS"));
    expect(anfordernKnopf().disabled).toBe(true);
    expect(grundZeile()).toBe(MELDUNGEN.ZU_VIELE_POSITIONEN);
  });

  it("Entfernen an der Obergrenze: der Fokus landet auf „+ Weitere Unterlage hinzufügen“, nicht auf body", () => {
    dialog();
    const hinzufuegen = screen.getByRole("button", { name: "+ Weitere Unterlage hinzufügen" }) as HTMLButtonElement;
    for (let i = 0; i < 28; i++) fireEvent.click(hinzufuegen);
    expect(hinzufuegen.disabled).toBe(true);
    // Im Klick ist der Knopf noch gesperrt — erst das naechste Rendern gibt ihn frei.
    fireEvent.click(screen.getByRole("button", { name: "Weitere Unterlage 28 entfernen" }));
    expect(hinzufuegen.disabled).toBe(false);
    expect(document.activeElement).toBe(hinzufuegen);
  });

  it("bleibt Hinzufügen gesperrt (Katalog allein über der Grenze), bekommt die Überschrift den Fokus", () => {
    dialog();
    const hinzufuegen = screen.getByRole("button", { name: "+ Weitere Unterlage hinzufügen" }) as HTMLButtonElement;
    for (let i = 0; i < 28; i++) fireEvent.click(hinzufuegen);
    fireEvent.click(kaestchen("ABSCHLUSSZEUGNIS"));
    fireEvent.click(screen.getByRole("button", { name: "Weitere Unterlage 28 entfernen" }));
    expect(hinzufuegen.disabled).toBe(true);
    const ueberschrift = document.activeElement as HTMLElement;
    expect(ueberschrift.textContent).toBe("Weitere Unterlagen");
    expect(ueberschrift.tabIndex).toBe(-1);
  });
});

// =============================================
// 6. Body exakt
// =============================================

describe("Body", () => {
  it("anfordern: genau die Form, die die Route prüft", async () => {
    const f = fetchMit(201, anfordernAntwort({ status: "SENT", detail: null }));
    dialog();
    fireEvent.change(hinweisFeld("MASERNSCHUTZ"), { target: { value: "  Nur die Seite mit den Impfungen.  " } });
    fireEvent.click(kaestchen("AUFENTHALTSTITEL"));
    fireEvent.click(kaestchen("ARBEITSVERTRAG"));
    fireEvent.click(screen.getByRole("button", { name: "+ Weitere Unterlage hinzufügen" }));
    fireEvent.change(screen.getByLabelText("Bezeichnung *"), { target: { value: " Unterschriebener RV-Antrag " } });
    const frei = document.querySelector('[data-frei="1"]') as HTMLElement;
    fireEvent.change(within(frei).getByLabelText("Hinweis an die Person (optional)"), {
      target: { value: "Bitte beide Seiten." },
    });
    fireEvent.click(within(frei).getByRole("checkbox", { name: "Original erforderlich (Schriftform)" }));
    fireEvent.change(screen.getByLabelText("Nachricht an die Person (optional)"), {
      target: { value: "Vielen Dank!" },
    });
    expect(zeileText("zaehler")).toBe("12/1000");
    // Hinweis und Zaehler haengen am Feld.
    expect(beschreibung(screen.getByLabelText("Nachricht an die Person (optional)"))).toEqual([
      "Erscheint in der E-Mail und auf der Upload-Seite.",
      "12/1000",
    ]);

    await act(async () => {
      fireEvent.click(anfordernKnopf());
    });
    expect(gesendet(f)).toEqual({
      aktion: "anfordern",
      empfaenger: ADRESSE_VORGANG,
      frist: "2026-10-05",
      nachricht: "Vielen Dank!",
      positionen: [
        { typ: "MASERNSCHUTZ", hinweis: "Nur die Seite mit den Impfungen." },
        { typ: "ARBEITSVERTRAG" },
        {
          typ: null,
          bezeichnung: "Unterschriebener RV-Antrag",
          hinweis: "Bitte beide Seiten.",
          originalErforderlich: true,
        },
      ],
    });
  });

  it("die Route kommt aus der Übersicht, wenn der Server sie nennt (`apiBasis`)", async () => {
    const f = fetchMit(201, anfordernAntwort({ status: "SENT", detail: null }));
    dialog({ u: { ...uebersicht(), apiBasis: "/api/modul/vg-9/unterlagen" } });
    await act(async () => {
      fireEvent.click(anfordernKnopf());
    });
    expect(f).toHaveBeenCalledWith("/api/modul/vg-9/unterlagen", expect.objectContaining({ method: "POST" }));
  });

  it("ohne `apiBasis` (kein Bearbeitungsrecht) bleibt der Knopf gesperrt — keine zweite Routentabelle im Client", () => {
    const f = fetchMit(201, anfordernAntwort({ status: "SENT", detail: null }));
    dialog({ u: { ...uebersicht(), apiBasis: null } });
    expect(anfordernKnopf().disabled).toBe(true);
    expect(grundZeile()).toBe("Die Auswahl der Unterlagen fehlt. Bitte laden Sie die Seite neu.");
    fireEvent.click(anfordernKnopf());
    expect(f).not.toHaveBeenCalled();
  });

  it("ein geleerter Hinweis und eine leere Nachricht fehlen im Body", async () => {
    const f = fetchMit(201, anfordernAntwort({ status: "SENT", detail: null }));
    dialog();
    fireEvent.change(hinweisFeld("MASERNSCHUTZ"), { target: { value: "   " } });
    await act(async () => {
      fireEvent.click(anfordernKnopf());
    });
    expect(gesendet(f)).toEqual({
      aktion: "anfordern",
      empfaenger: ADRESSE_VORGANG,
      frist: "2026-10-05",
      positionen: [
        { typ: "MASERNSCHUTZ" },
        { typ: "AUFENTHALTSTITEL", hinweis: NACHFORDERUNG_HINWEISE.AUFENTHALTSTITEL },
      ],
    });
  });
});

// =============================================
// 7. Modus „ergänzen"
// =============================================

describe("Modus „ergänzen“", () => {
  const laufendeUebersicht = (teil: Partial<NachforderungEingabe> = {}) =>
    uebersicht({ nachforderungen: [nachforderung(teil)] });

  it("Empfänger nur lesbar, schon angeforderte Arten nicht wählbar — außer ENTFAELLT", () => {
    dialog({ modus: "ergaenzen", u: laufendeUebersicht() });
    expect(screen.getByRole("dialog").textContent).toContain("Unterlagen ergänzen");
    expect(screen.queryByLabelText("Empfänger *")).toBeNull();
    expect(zeileText("empfaenger")).toBe(ADRESSE_VORGANG);
    expect(zeileText("bestehend")).toContain("Unterschriebener RV-Antrag");

    // Angefordert: nicht waehlbar, und der Vorschlag ist deshalb nicht angekreuzt.
    expect(kaestchen("MASERNSCHUTZ").disabled).toBe(true);
    expect(kaestchen("MASERNSCHUTZ").checked).toBe(false);
    expect(artZeile("MASERNSCHUTZ").textContent).toContain("Bereits angefordert.");
    // Angenommen: der Weg ueber die Ruecknahme.
    expect(kaestchen("AUFENTHALTSTITEL").disabled).toBe(true);
    const weg = artZeile("AUFENTHALTSTITEL").textContent ?? "";
    expect(weg).toContain("„Annahme zurücknehmen“, dann zurückweisen");
    // Eingereicht: der Weg ueber „Zurückweisen…".
    expect(kaestchen("ABSCHLUSSZEUGNIS").disabled).toBe(true);
    expect(artZeile("ABSCHLUSSZEUGNIS").textContent).toContain("„Zurückweisen…“");
    // Entfallen: wieder anfordern — waehlbar, aber nicht vorangekreuzt.
    const pkv = kaestchen("PKV_NACHWEIS");
    expect(pkv.disabled).toBe(false);
    expect(pkv.checked).toBe(false);
    expect(artZeile("PKV_NACHWEIS").textContent).toContain("wieder anfordern");

    expect(ergaenzenKnopf().disabled).toBe(true);
    expect(grundZeile()).toBe(MELDUNGEN.KEINE_POSITION);
  });

  it("ohne Rücknahme-Möglichkeit nur „Bereits angenommen.“", () => {
    const u = laufendeUebersicht({
      positionen: nachforderung().positionen.map((p) =>
        p.id === "p-at" ? { ...p, entschiedenAm: "2026-08-01T08:00:00.000Z" } : p,
      ),
    });
    dialog({ modus: "ergaenzen", u });
    const text = artZeile("AUFENTHALTSTITEL").textContent ?? "";
    expect(text).toContain("Bereits angenommen.");
    expect(text).not.toContain("Annahme zurücknehmen");
  });

  it("Frist optional: ohne Angabe bleibt die bisherige; Body exakt", async () => {
    const mail: UnterlagenMailErgebnis = { status: "SENT", detail: null };
    const f = fetchMit(200, { nachforderungId: NF_ID, mail, ...aktionsTexte("ergaenzen", mail) });
    const { onErfolg } = dialog({ modus: "ergaenzen", u: laufendeUebersicht() });
    // Das Label sagt, dass eine neue Frist fuer ALLE Unterlagen gilt (EP-1).
    const feld = ergaenzenFristFeld(false);
    expect(feld.value).toBe("");
    expect(zeileText("frist-bleibt")).toBe("Leer lassen: Die bisherige Frist (Freitag, 02.10.2026) bleibt.");
    expect(beschreibung(feld)).toEqual(["Leer lassen: Die bisherige Frist (Freitag, 02.10.2026) bleibt."]);

    fireEvent.click(kaestchen("PKV_NACHWEIS"));
    fireEvent.click(kaestchen("ARBEITSERLAUBNIS"));
    expect(ergaenzenKnopf().disabled).toBe(false);
    // Die Summe zaehlt nur, was hinzukommt — und sagt das.
    expect(zeileText("summe")).toBe("2 weitere Unterlagen · Frist 02.10.2026 · an anna.beispiel@example.org");
    expect(zeileText("erinnerung")).toBe(neutralerSatz("2026-10-02", "2026-09-21"));

    await act(async () => {
      fireEvent.click(ergaenzenKnopf());
    });
    expect(gesendet(f)).toEqual({
      aktion: "ergaenzen",
      nachforderungId: NF_ID,
      positionen: [
        { typ: "ARBEITSERLAUBNIS", hinweis: NACHFORDERUNG_HINWEISE.ARBEITSERLAUBNIS },
        { typ: "PKV_NACHWEIS", hinweis: NACHFORDERUNG_HINWEISE.PKV_NACHWEIS },
      ],
    });
    expect(onErfolg).toHaveBeenCalledWith({ art: "erfolg", text: "Die Nachforderung ist ergänzt." });
  });

  it("eine neue Frist geht mit", async () => {
    const mail: UnterlagenMailErgebnis = { status: "SENT", detail: null };
    const f = fetchMit(200, { nachforderungId: NF_ID, mail, ...aktionsTexte("ergaenzen", mail) });
    dialog({ modus: "ergaenzen", u: laufendeUebersicht() });
    fireEvent.click(kaestchen("PKV_NACHWEIS"));
    fireEvent.change(ergaenzenFristFeld(false), { target: { value: "2026-10-09" } });
    // Spaeter als bisher: kein Hinweis auf eine Verkuerzung.
    expect(hinweis("frist-kuerzer")).toBeNull();
    expect(zeileText("summe")).toBe("1 weitere Unterlage · Frist 09.10.2026 · an anna.beispiel@example.org");
    await act(async () => {
      fireEvent.click(ergaenzenKnopf());
    });
    expect(gesendet(f).frist).toBe("2026-10-09");
  });

  it("eine frühere Frist verkürzt sie für alle Unterlagen — gelber Hinweis, der nicht sperrt", () => {
    dialog({ modus: "ergaenzen", u: laufendeUebersicht() });
    fireEvent.click(kaestchen("PKV_NACHWEIS"));
    const feld = ergaenzenFristFeld(false);
    fireEvent.change(feld, { target: { value: "2026-09-28" } });
    const text = "Die Frist wird für alle Unterlagen der Nachforderung verkürzt (bisher Freitag, 02.10.2026).";
    expect(hinweis("frist-kuerzer")?.textContent).toBe(text);
    expect(beschreibung(feld)).toContain(text);
    expect(ergaenzenKnopf().disabled).toBe(false);
    // Dieselbe Frist wie bisher ist keine Verkuerzung.
    fireEvent.change(feld, { target: { value: "2026-10-02" } });
    expect(hinweis("frist-kuerzer")).toBeNull();
  });

  it("der Info-Satz verspricht die Meldung zum Fristablauf nicht „Ihnen“ — sie geht an die anfordernde HR-Kraft", () => {
    dialog({ modus: "ergaenzen", u: laufendeUebersicht() });
    const satz = zeileText("erinnerung") ?? "";
    expect(satz).toContain("Ist die Frist verstrichen, erhält die anfordernde HR-Kraft eine E-Mail.");
    expect(satz).not.toContain("erhalten Sie");
  });

  it("… auch bei einer Frist, die heute endet (anderer Satzbau)", () => {
    dialog({ modus: "ergaenzen", u: laufendeUebersicht({ frist: new Date("2026-09-21T00:00:00.000Z") }) });
    const satz = zeileText("erinnerung") ?? "";
    expect(satz).toBe(neutralerSatz("2026-09-21", "2026-09-21"));
    expect(satz).toContain("Ist sie verstrichen, erhält die anfordernde HR-Kraft eine E-Mail.");
    expect(satz).not.toContain("erhalten Sie");
  });

  it("nach Fristablauf ist die Frist Pflicht", () => {
    dialog({ modus: "ergaenzen", u: laufendeUebersicht({ frist: new Date("2026-09-18T00:00:00.000Z") }) });
    const feld = ergaenzenFristFeld(true);
    expect(feld.required).toBe(true);
    expect(feld.value).toBe("2026-10-05");
    expect(hinweis("frist-pflicht")?.textContent).toBe(MELDUNGEN.NEUE_FRIST_NOETIG);
    fireEvent.click(kaestchen("PKV_NACHWEIS"));
    expect(ergaenzenKnopf().disabled).toBe(false);
    fireEvent.change(feld, { target: { value: "" } });
    expect(ergaenzenKnopf().disabled).toBe(true);
    expect(grundZeile()).toBe(MELDUNGEN.NEUE_FRIST_NOETIG);
  });

  it("die Obergrenze zählt die bestehenden Unterlagen mit", () => {
    dialog({ modus: "ergaenzen", u: laufendeUebersicht() });
    const hinzufuegen = screen.getByRole("button", { name: "+ Weitere Unterlage hinzufügen" }) as HTMLButtonElement;
    // 5 bestehende: Platz fuer 25 neue.
    for (let i = 0; i < 25; i++) fireEvent.click(hinzufuegen);
    expect(hinzufuegen.disabled).toBe(true);
    screen.getAllByLabelText("Bezeichnung *").forEach((feld, i) => {
      fireEvent.change(feld, { target: { value: `Unterlage ${i + 1}` } });
    });
    expect(ergaenzenKnopf().disabled).toBe(false);
    // Eine entfallene Art wird wieder aktiv, sie zaehlt nicht neu.
    fireEvent.click(kaestchen("PKV_NACHWEIS"));
    expect(ergaenzenKnopf().disabled).toBe(false);
    fireEvent.click(kaestchen("ARBEITSERLAUBNIS"));
    expect(ergaenzenKnopf().disabled).toBe(true);
    expect(grundZeile()).toBe(MELDUNGEN.ZU_VIELE_POSITIONEN);
  });

  it("ohne laufende Nachforderung lässt sich nichts ergänzen", () => {
    dialog({ modus: "ergaenzen" });
    fireEvent.click(kaestchen("ABSCHLUSSZEUGNIS"));
    expect(ergaenzenKnopf().disabled).toBe(true);
    expect(grundZeile()).toBe(MELDUNGEN.NICHT_LAUFEND);
  });
});

describe("Modus „neu“ neben der letzten Nachforderung", () => {
  const erledigt = () =>
    nachforderung({
      status: "ERLEDIGT",
      erledigtAm: "2026-09-18T08:00:00.000Z",
      positionen: [
        position({
          id: "p-at",
          typ: "AUFENTHALTSTITEL",
          bezeichnung: "Aufenthaltstitel",
          status: "ANGENOMMEN",
          einreichungen: 1,
          uebermitteltAm: "2026-09-14T08:00:00.000Z",
          entschiedenAm: "2026-09-16T08:00:00.000Z",
        }),
      ],
    });
  const RUECKNAHME_ENDET =
    "Mit dem Anfordern lässt sich keine Annahme der letzten Nachforderung mehr zurücknehmen. War eine Annahme ein Versehen, nehmen Sie sie vorher dort zurück.";

  it("eine dort angenommene Art nennt den Weg über die Rücknahme — und bleibt wählbar", () => {
    const auswahl = AUSWAHL.map((a) => (a.typ === "AUFENTHALTSTITEL" ? { ...a, vorgeschlagen: false } : a));
    dialog({ u: uebersicht({ nachforderungen: [erledigt()], dialog: { ...DIALOG, auswahl } }) });
    const at = kaestchen("AUFENTHALTSTITEL");
    expect(at.disabled).toBe(false);
    expect(at.checked).toBe(false);
    const info = artZeile("AUFENTHALTSTITEL").querySelector('[data-hinweis="zuletzt-angenommen"]') as HTMLElement;
    expect(info.textContent).toContain("„Annahme zurücknehmen“, dann zurückweisen");
    // Der Satz gehoert zur Beschreibung des Kaestchens (neben dem Kennzeichen).
    expect(beschreibung(at)).toEqual(["Vertraulich", info.textContent]);
    fireEvent.click(at);
    expect(at.checked).toBe(true);
  });

  it("sagt vor dem Knopf, dass mit dem Anfordern keine Annahme der letzten mehr zurückgeht (E-3)", () => {
    dialog({ u: uebersicht({ nachforderungen: [erledigt()] }) });
    expect(hinweis("ruecknahme-endet")?.textContent).toBe(RUECKNAHME_ENDET);
    // Der Hinweis sperrt nichts.
    expect(anfordernKnopf().disabled).toBe(false);
  });

  it("ohne rücknehmbare Annahme kein Hinweis", () => {
    // Laenger als 30 Tage her: keine Ruecknahme mehr, die Uebersicht klappt die letzte nicht mehr auf.
    const alt = nachforderung({
      ...erledigt(),
      positionen: erledigt().positionen.map((p) => ({ ...p, entschiedenAm: "2026-08-01T08:00:00.000Z" })),
    });
    const erster = dialog({ u: uebersicht({ nachforderungen: [alt] }) });
    expect(hinweis("ruecknahme-endet")).toBeNull();
    erster.unmount();
    dialog({ u: uebersicht() });
    expect(hinweis("ruecknahme-endet")).toBeNull();
  });

  it("läuft schon eine Nachforderung, ist „neu“ gesperrt", () => {
    dialog({ u: uebersicht({ nachforderungen: [nachforderung()] }) });
    expect(anfordernKnopf().disabled).toBe(true);
    expect(grundZeile()).toBe(MELDUNGEN.LAEUFT_BEREITS);
  });

  it("ohne Daten des Dialogs gesperrt, mit Grund", () => {
    dialog({ u: uebersicht({ dialog: null }) });
    expect(anfordernKnopf().disabled).toBe(true);
    expect(grundZeile()).toBe("Die Auswahl der Unterlagen fehlt. Bitte laden Sie die Seite neu.");
  });
});

// =============================================
// 8. Ergebnis
// =============================================

describe("Ergebnis", () => {
  async function anfordern(status: number, body: unknown) {
    const f = fetchMit(status, body);
    const r = dialog();
    await act(async () => {
      fireEvent.click(anfordernKnopf());
    });
    return { f, ...r };
  }

  it("Mail zugestellt: Erfolg", async () => {
    const { onErfolg } = await anfordern(201, anfordernAntwort({ status: "SENT", detail: null }));
    expect(onErfolg).toHaveBeenCalledWith({ art: "erfolg", text: "Die Unterlagen sind angefordert." });
  });

  /** Der Weg nach FAILED — als Moeglichkeit, nicht als Zusage eines zugestellten Links. */
  const WEG_NICHT_ZUGESTELLT =
    "Über „Link erneut senden“ in der Karte können Sie die E-Mail auch selbst noch einmal senden, bei Bedarf an eine korrigierte Adresse.";

  it("Mail nicht zugestellt (FAILED): rot — gespeichert, nicht zugestellt, „Link erneut senden“ als Weg", async () => {
    const { onErfolg } = await anfordern(201, anfordernAntwort({ status: "FAILED", detail: "ETIMEDOUT" }));
    expect(onErfolg).toHaveBeenCalledTimes(1);
    expect(onErfolg.mock.calls[0][0]).toEqual({
      art: "fehler",
      text: `Die Unterlagen sind angefordert. ${MELDUNGEN.MAIL_NICHT_ZUGESTELLT} ${WEG_NICHT_ZUGESTELLT}`,
    });
    // Keine Zusage, die „Link erneut senden" nicht halten kann (dieselbe Adresse
    // kann wieder scheitern), und „gespeichert" nicht doppelt.
    const text = onErfolg.mock.calls[0][0].text as string;
    expect(text).not.toContain("bekommt die Person");
    expect(text).not.toContain("bleibt gespeichert");
  });

  it("beim Ergänzen nicht zugestellt: rot, dieselbe Aussage — ohne „sofort“ (Sperrzeit von „Link erneut senden“)", async () => {
    const mail: UnterlagenMailErgebnis = { status: "FAILED", detail: "ETIMEDOUT" };
    fetchMit(200, { nachforderungId: NF_ID, mail, ...aktionsTexte("ergaenzen", mail) });
    const { onErfolg } = dialog({ modus: "ergaenzen", u: uebersicht({ nachforderungen: [nachforderung()] }) });
    fireEvent.click(kaestchen("PKV_NACHWEIS"));
    await act(async () => {
      fireEvent.click(ergaenzenKnopf());
    });
    expect(onErfolg.mock.calls[0][0]).toEqual({
      art: "fehler",
      text: `Die Nachforderung ist ergänzt. ${MELDUNGEN.MAIL_NICHT_ZUGESTELLT} ${WEG_NICHT_ZUGESTELLT}`,
    });
    expect(onErfolg.mock.calls[0][0].text).not.toContain("sofort");
  });

  it("Mail übersprungen (SKIPPED, Vorlage deaktiviert): Warnung — ohne den Weg über „Link erneut senden“", async () => {
    const { onErfolg } = await anfordern(
      201,
      anfordernAntwort({ status: "SKIPPED", detail: "Vorlage deaktiviert" }),
    );
    const meldung = onErfolg.mock.calls[0][0];
    expect(meldung.art).toBe("warnung");
    expect(meldung.text).toContain("nicht versendet");
    // Bei einer abgeschalteten Vorlage haelfe ein neuer Link nichts.
    expect(meldung.text).not.toContain("Link erneut senden");
  });

  it("versendet, aber nicht gespeichert (N2): Warnung", async () => {
    const { onErfolg } = await anfordern(
      201,
      anfordernAntwort({ status: "SENT", detail: null, nachweisFehlt: true }),
    );
    expect(onErfolg.mock.calls[0][0]).toEqual({
      art: "warnung",
      text: `Die Unterlagen sind angefordert. ${MELDUNGEN.MAIL_NACHWEIS_FEHLT}`,
    });
  });

  it("Fehler des Servers: im Dialog mit role=alert, der Dialog bleibt offen", async () => {
    const { onErfolg, onSchliessen } = await anfordern(409, {
      error: MELDUNGEN.LAEUFT_BEREITS,
      grund: "LAEUFT_BEREITS",
    });
    expect(onErfolg).not.toHaveBeenCalled();
    expect(onSchliessen).not.toHaveBeenCalled();
    const alert = within(screen.getByRole("dialog")).getByRole("alert");
    expect(alert.textContent).toBe(MELDUNGEN.LAEUFT_BEREITS);
    expect(document.activeElement).toBe(alert);
    // Die Eingabe steht noch da.
    expect(kaestchen("MASERNSCHUTZ").checked).toBe(true);
    expect(anfordernKnopf().disabled).toBe(false);
  });

  it("der Grund des Servers zu einer vertraulichen Art steht mit im Fehler", async () => {
    await anfordern(409, {
      error: MELDUNGEN.SENSIBEL_NICHT_ERLAUBT,
      grund: "SENSIBEL_NICHT_ERLAUBT",
      typ: "MASERNSCHUTZ",
      hinweis: SENSIBEL_SPERRGRUND_TEXTE.NICHT_PFLICHT,
    });
    const alert = within(screen.getByRole("dialog")).getByRole("alert");
    expect(alert.textContent).toBe(`${MELDUNGEN.SENSIBEL_NICHT_ERLAUBT} ${SENSIBEL_SPERRGRUND_TEXTE.NICHT_PFLICHT}`);
  });

  it("Verbindungsfehler: im Dialog", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("offline")) as unknown as typeof fetch;
    const { onErfolg } = dialog();
    await act(async () => {
      fireEvent.click(anfordernKnopf());
    });
    expect(onErfolg).not.toHaveBeenCalled();
    expect(within(screen.getByRole("dialog")).getByRole("alert").textContent).toContain("Verbindungsfehler");
  });

  it("Doppelklick ergibt einen Aufruf; während des Sendens schließt Escape nicht", async () => {
    let fertig!: (wert: unknown) => void;
    const f = jest.fn(
      () =>
        new Promise((r) => {
          fertig = r;
        }),
    );
    global.fetch = f as unknown as typeof fetch;
    const { onErfolg, onSchliessen } = dialog();
    const knopf = anfordernKnopf();
    await act(async () => {
      fireEvent.click(knopf);
      fireEvent.click(knopf);
    });
    expect(f).toHaveBeenCalledTimes(1);
    expect(knopf.textContent).toBe("Wird gesendet…");
    expect(kaestchen("MASERNSCHUTZ").disabled).toBe(true);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onSchliessen).not.toHaveBeenCalled();

    await act(async () => {
      fertig({ ok: true, status: 201, json: async () => anfordernAntwort({ status: "SENT", detail: null }) });
    });
    expect(onErfolg).toHaveBeenCalledTimes(1);
  });
});

// =============================================
// 9. Rahmen: Fokus und Escape
// =============================================

describe("Rahmen", () => {
  it("role=dialog mit Titel, Fokus auf „Abbrechen“, Escape schließt", () => {
    const { onSchliessen } = dialog();
    const d = screen.getByRole("dialog");
    expect(d.getAttribute("aria-modal")).toBe("true");
    const titel = document.getElementById(d.getAttribute("aria-labelledby") ?? "");
    expect(titel?.textContent).toBe("Unterlagen nachfordern");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Abbrechen" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onSchliessen).toHaveBeenCalledTimes(1);
  });

  it("unter dem Titel Name und Vorgangsnummer (`kopf`), sonst der allgemeine Satz", () => {
    const erster = dialog({ kopf: { name: "Anna Beispiel", vorgangsnummer: "ONB-2026-GYM-014" } });
    const d = screen.getByRole("dialog");
    const untertitel = () => document.getElementById(d.getAttribute("aria-describedby") ?? "")?.textContent;
    expect(untertitel()).toBe("Anna Beispiel · ONB-2026-GYM-014");
    erster.unmount();

    dialog({ kopf: { name: null, vorgangsnummer: "ONB-2026-GYM-014" } });
    expect(
      document.getElementById(screen.getByRole("dialog").getAttribute("aria-describedby") ?? "")?.textContent,
    ).toBe("ONB-2026-GYM-014");
  });

  it("ohne `kopf` der allgemeine Satz — je Modus", () => {
    const erster = dialog();
    const untertitel = () =>
      document.getElementById(screen.getByRole("dialog").getAttribute("aria-describedby") ?? "")?.textContent;
    expect(untertitel()).toBe("Die Person erhält eine E-Mail mit einem persönlichen Link zum Hochladen.");
    erster.unmount();
    dialog({ modus: "ergaenzen", kopf: { name: "  ", vorgangsnummer: null } });
    expect(untertitel()).toBe(
      "Die Person erhält eine E-Mail mit einem neuen Link; neue Unterlagen sind darin gekennzeichnet.",
    );
  });

  it("ist der Auslöser beim Schließen verschwunden, bekommt `fokusZiel` den Fokus", () => {
    // Wie nach dem Anfordern: „Unterlagen nachfordern…" gibt es dann nicht mehr.
    const ziel = document.createElement("div");
    ziel.id = "unterlagen-nachforderung";
    ziel.tabIndex = -1;
    document.body.appendChild(ziel);
    const ausloeser = document.createElement("button");
    ausloeser.textContent = "Unterlagen nachfordern…";
    document.body.appendChild(ausloeser);
    ausloeser.focus();
    try {
      const { unmount } = dialog({ fokusZiel: "unterlagen-nachforderung" });
      expect(document.activeElement).toBe(screen.getByRole("button", { name: "Abbrechen" }));
      ausloeser.remove();
      unmount();
      expect(document.activeElement).toBe(ziel);
    } finally {
      ziel.remove();
      ausloeser.remove();
    }
  });

  it("„Abbrechen“ und „Dialog schließen“ schließen, ohne zu senden", () => {
    const f = fetchMit(201, {});
    const { onSchliessen } = dialog();
    fireEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    fireEvent.click(screen.getByRole("button", { name: "Dialog schließen" }));
    expect(onSchliessen).toHaveBeenCalledTimes(2);
    expect(f).not.toHaveBeenCalled();
  });

  it("Tab bleibt im Dialog", () => {
    dialog();
    const schliessen = screen.getByRole("button", { name: "Dialog schließen" });
    anfordernKnopf().focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(schliessen);
  });
});
