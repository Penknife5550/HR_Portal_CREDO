/**
 * @jest-environment jsdom
 */

/**
 * Dialog „Einstellung zuordnen …“ im Offboarding (Ausstattung & Zugaenge
 * Stufe 2 – Paket A4, Feinplan S32, G11 bis G13, E-A31):
 * src/components/ausgaben/einstellung-zuordnen-dialog.tsx.
 *
 * Belegt wird:
 *   1. Vorschläge mit Stufe und Begründung (nie eine Adresse), Leerzustand
 *      „Kein Vorschlag – über Vorgangsnummer oder Nachname suchen“.
 *   2. Suche: „Mindestens 3 Zeichen“, Treffer ab 3 Zeichen, „Kein Treffer“.
 *   3. Merker „Person bleibt in einer anderen Beschäftigung“: vorbelegt wie
 *      der Server, ein Wechsel rechnet die Vorschau neu.
 *   4. Vorschau: Arbeitsort, Rückgaben, Sperraufgaben, Hinweise, Stücke in
 *      einem anderen Austritt; ohne vorschlagbare Stücke der Text der Lage.
 *   5. „Zuordnen“: Body nach dem Schema der Route, gesperrt mit sichtbarem
 *      Grund (keine Wahl, Sperrgrund des Servers), Fehlertext des Servers im
 *      Fuß.
 *   6. Abfrage-Adresse und Laden; der Hinweis für die Abteilungskarte.
 *
 * Gelesen wird über die Eigenschaft `laden` (ersetzt den GET); die Antworten
 * entstehen mit den echten reinen Funktionen (`zuordnungsVorschlaege`,
 * `einstellungsTreffer`, `rueckgabeVorschlagAnzeige`, `LAGE_TEXTE`).
 */
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import {
  EinstellungZuordnenDialog,
  ZUORDNEN_TEXTE,
  ZuordnungEmpfohlenHinweis,
  auswahlUrl,
  einstellungAuswahlLaden,
  sucheStand,
  wahlSichtbar,
  type AuswahlAnfrage,
  type AuswahlErgebnis,
  type EinstellungZuordnenDialogProps,
} from "@/components/ausgaben/einstellung-zuordnen-dialog";
import {
  LAGE_TEXTE,
  MELDUNGEN_AUSGABEN,
  ausgabeKurz,
  arbeitsortText,
  einstellungsTreffer,
  rueckgabeVorschlagAnzeige,
  zuordnungsVorschlaege,
  type EinstellungsKandidat,
} from "@/lib/ausgaben";
import { einstellungAktionSchema } from "@/lib/validations/ausgaben";
import type { EinstellungsAuswahl, EinstellungsVorschau } from "@/lib/offboarding-ausgaben";

// React 19 verlangt diese Marke, bevor act() Zustandsaenderungen einsammeln darf.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// =============================================
// Fixtures
// =============================================

const AUSTRITT = {
  employeeFirstName: "Anna",
  employeeLastName: "Beispiel",
  employeeEmail: "anna.beispiel@fes-minden.de",
  employeePrivateEmail: null,
  organizationId: "org-gym",
  arbeitsortId: null,
};

const KANDIDATEN: EinstellungsKandidat[] = [
  {
    id: "onb-stark",
    displayId: "2027-GYM-007",
    organizationId: "org-gym",
    email: "anna.beispiel@fes-minden.de",
    firstName: "Anna",
    lastName: "Beispiel",
    supervisorData: { vertragsbeginn: "2027-02-01T00:00:00.000Z" },
  },
  {
    id: "onb-mittel",
    displayId: "2025-GYM-031",
    organizationId: "org-gym",
    arbeitsortId: "org-gs",
    email: "andere@example.org",
    firstName: "Anna",
    lastName: "Beispiel",
    supervisorData: { vertragsbeginn: "2025-08-01T00:00:00.000Z" },
  },
  {
    id: "onb-schwach",
    displayId: "2024-GYM-002",
    organizationId: "org-gym",
    email: null,
    firstName: "Bernd",
    lastName: "Beispiel",
  },
];

const EINRICHTUNGEN = { "org-gym": "FES Gymnasium", "org-gs": "FES Grundschule" };

function auswahl(teil: Partial<EinstellungsAuswahl> = {}): EinstellungsAuswahl {
  return {
    zugeordnet: null,
    zuordenbar: true,
    weitereBeschaeftigung: false,
    vorschlaege: zuordnungsVorschlaege(AUSTRITT, KANDIDATEN),
    treffer: [],
    einrichtungen: EINRICHTUNGEN,
    ...teil,
  };
}

const IPAD = {
  id: "ag-ipad",
  bezeichnung: "Dienst-iPad (Lernmittel)",
  beiAustritt: "RUECKGABE",
  kennung: "FES-IPAD-0412",
  kennungLabel: "Inventarnummer",
  departmentKey: "IT",
  organizationId: "org-gym",
  zentral: false,
  uebergebenAm: "2027-01-28",
  zustand: "AUSGEGEBEN",
};

function vorschau(teil: Partial<EinstellungsVorschau> = {}, mitStuecken = true): EinstellungsVorschau {
  const ctx = { stellenNamen: { IT: "IT-Abteilung" }, einrichtungen: EINRICHTUNGEN };
  const rueckgaben = rueckgabeVorschlagAnzeige(
    mitStuecken
      ? {
          vorschlag: [IPAD, { ...IPAD, id: "ag-zugang", bezeichnung: "Zugänge (Portal, E-Mail)", beiAustritt: "SPERREN", kennung: null }],
          hinweisZentral: [{ ...IPAD, id: "ag-mail", bezeichnung: "Dienst-E-Mail", beiAustritt: "SPERREN", kennung: null, zentral: true }],
          hinweisAndereEinrichtung: [{ ...IPAD, id: "ag-gs", bezeichnung: "Schlüssel: Haupteingang", kennung: "GS-114", organizationId: "org-gs" }],
          schonImAustritt: [{ offboardingId: "off-2", displayId: "OFF-2027-GYM-0002", anzahl: 1 }],
        }
      : { vorschlag: [], hinweisZentral: [], hinweisAndereEinrichtung: [], schonImAustritt: [] },
    ctx,
  );
  return {
    einstellung: einstellungsTreffer([KANDIDATEN[0]])[0],
    stufe: "STARK",
    gruende: [{ schluessel: "EMAIL", text: "Gleiche E-Mail-Adresse" }],
    arbeitsort: { grund: "OHNE_ARBEITSORT", text: null },
    lage: mitStuecken ? "AUSGABEN" : "VOR_EINFUEHRUNG",
    text: LAGE_TEXTE[mitStuecken ? "AUSGABEN" : "VOR_EINFUEHRUNG"]({ nr: "2027-GYM-007", gegenstaende: 1, zugaenge: 1, ohneVermerk: 0 }),
    zusatz: null,
    weitereBeschaeftigung: false,
    rueckgaben,
    sperrGrund: null,
    ...teil,
  };
}

/** `laden`, das je Anfrage antwortet; jede Anfrage wird mitgeschrieben. */
function lader(antworten: {
  basis?: EinstellungsAuswahl;
  suche?: (q: string) => EinstellungsAuswahl["treffer"];
  vorschau?: (a: AuswahlAnfrage) => EinstellungsVorschau | null;
}) {
  const anfragen: AuswahlAnfrage[] = [];
  const laden = jest.fn(async (a: AuswahlAnfrage): Promise<AuswahlErgebnis> => {
    anfragen.push(a);
    const basis = antworten.basis ?? auswahl();
    if (a.q) return { ok: true, daten: { ...basis, treffer: antworten.suche?.(a.q) ?? [] } };
    if (a.vorschau) {
      const v = antworten.vorschau?.(a) ?? null;
      return v ? { ok: true, daten: { ...basis, vorschau: v } } : { ok: false, meldung: MELDUNGEN_AUSGABEN.EINSTELLUNG_NICHT_GEFUNDEN };
    }
    return { ok: true, daten: basis };
  });
  return { laden, anfragen };
}

async function zeige(teil: Partial<EinstellungZuordnenDialogProps> & { laden: EinstellungZuordnenDialogProps["laden"] }) {
  const props: EinstellungZuordnenDialogProps = {
    offboardingId: "off-1",
    untertitel: "OFF-2027-GYM-014 · Anna Beispiel",
    sendet: false,
    fehler: null,
    onAbbrechen: jest.fn(),
    onZuordnen: jest.fn(),
    sucheVerzoegerung: 0,
    ...teil,
  };
  await act(async () => {
    render(<EinstellungZuordnenDialog {...props} />);
  });
  return props;
}

const dialog = () => screen.getByRole("dialog");
const zuordnenKnopf = () => within(dialog()).getByRole("button", { name: ZUORDNEN_TEXTE.zuordnen }) as HTMLButtonElement;

async function warten() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

async function waehlen(id: string) {
  await act(async () => {
    fireEvent.click(document.querySelector(`[data-kandidat="${id}"] input`) as HTMLInputElement);
  });
  await warten();
}

async function suchen(text: string) {
  await act(async () => {
    fireEvent.change(within(dialog()).getByLabelText(ZUORDNEN_TEXTE.sucheLabel), { target: { value: text } });
  });
  await warten();
}

afterEach(() => {
  jest.restoreAllMocks();
});

// =============================================
// 1. Vorschläge
// =============================================

describe("Vorschläge", () => {
  it("Stufen und Begründungen, sortiert – nie eine Adresse", async () => {
    const { laden } = lader({});
    await zeige({ laden });
    expect(dialog().getAttribute("data-dialog")).toBe("einstellung-zuordnen");
    const liste = document.querySelector('[data-liste="vorschlaege"]') as HTMLElement;
    const begruendungen = [...liste.querySelectorAll("[data-begruendung]")].map((b) => b.textContent);
    expect(begruendungen).toEqual([
      "Starker Vorschlag: Gleiche E-Mail-Adresse · Gleicher Vor- und Nachname · Gleiche Einrichtung",
      "Mittlerer Vorschlag: Gleicher Vor- und Nachname · Gleiche Einrichtung",
      "Schwacher Vorschlag: Gleicher Nachname · Gleiche Einrichtung",
    ]);
    const stark = liste.querySelector('[data-kandidat="onb-stark"]') as HTMLElement;
    expect(stark.textContent).toContain("Anna Beispiel · 2027-GYM-007");
    expect(stark.textContent).toContain("FES Gymnasium · Vertragsbeginn 01.02.2027");
    expect(liste.querySelector('[data-kandidat="onb-mittel"]')?.textContent).toContain("Arbeitsort FES Grundschule");
    expect(dialog().textContent).not.toContain("@");
  });

  it("ohne Vorschlag: „Kein Vorschlag – über Vorgangsnummer oder Nachname suchen“", async () => {
    const { laden } = lader({ basis: auswahl({ vorschlaege: [] }) });
    await zeige({ laden });
    expect(document.querySelector('[data-leer="vorschlaege"]')?.textContent).toBe(MELDUNGEN_AUSGABEN.KEIN_VORSCHLAG);
  });

  it("„Zuordnen“ ist ohne Wahl gesperrt und nennt den Grund", async () => {
    const { laden } = lader({});
    await zeige({ laden });
    expect(zuordnenKnopf().disabled).toBe(true);
    expect(dialog().querySelector('[data-zeile="grund"]')?.textContent).toBe(ZUORDNEN_TEXTE.keineWahl);
  });
});

// =============================================
// 2. Suche
// =============================================

describe("Suche", () => {
  it("unter 3 Zeichen „Mindestens 3 Zeichen“ ohne Abfrage; ab 3 die Treffer; ohne Ergebnis „Kein Treffer“", async () => {
    const { laden, anfragen } = lader({
      suche: (q) => (q === "Mus" ? einstellungsTreffer([{ id: "onb-mus", displayId: "2026-GYM-044", organizationId: "org-gym", firstName: "Max", lastName: "Muster" }]) : []),
    });
    await zeige({ laden });
    await suchen("Mu");
    expect(document.querySelector("[data-suche-stand]")?.textContent).toBe(MELDUNGEN_AUSGABEN.SUCHE_ZU_KURZ);
    expect(anfragen.some((a) => a.q)).toBe(false);

    await suchen("Mus");
    expect(anfragen.filter((a) => a.q)).toEqual([{ q: "Mus" }]);
    const treffer = document.querySelector('[data-liste="treffer"]') as HTMLElement;
    expect(treffer.querySelector('[data-kandidat="onb-mus"]')?.textContent).toContain("Max Muster · 2026-GYM-044");
    // Treffer tragen keine Begründung.
    expect(treffer.querySelector("[data-begruendung]")).toBeNull();

    await suchen("Xyz");
    expect(document.querySelector("[data-suche-stand]")?.textContent).toBe(MELDUNGEN_AUSGABEN.KEIN_TREFFER);
    expect(document.querySelector('[data-liste="treffer"]')).toBeNull();
  });

  it("ein gewählter Treffer verschwindet mit der Suche: die Wahl gilt nicht mehr – keine Vorschau, „Zuordnen“ gesperrt (Review A4c)", async () => {
    const mus = einstellungsTreffer([{ id: "onb-mus", displayId: "2026-GYM-044", organizationId: "org-gym", firstName: "Max", lastName: "Muster" }]);
    const { laden } = lader({ suche: (q) => (q.startsWith("Mus") ? mus : []), vorschau: () => vorschau() });
    const props = await zeige({ laden });
    await suchen("Mus");
    await waehlen("onb-mus");
    expect(document.querySelector("[data-vorschau]")).not.toBeNull();
    expect(zuordnenKnopf().disabled).toBe(false);

    // Andere Suche ohne diesen Treffer.
    await suchen("Xyz");
    expect(document.querySelector('[data-kandidat="onb-mus"]')).toBeNull();
    expect(document.querySelector("[data-vorschau]")).toBeNull();
    expect(zuordnenKnopf().disabled).toBe(true);
    expect(dialog().querySelector('[data-zeile="grund"]')?.textContent).toBe(ZUORDNEN_TEXTE.keineWahl);
    await act(async () => {
      fireEvent.click(zuordnenKnopf());
    });
    expect(props.onZuordnen).not.toHaveBeenCalled();

    // Kommt der Treffer zurück, ist er nicht von selbst wieder gewählt.
    await suchen("Must");
    expect((document.querySelector('[data-kandidat="onb-mus"] input') as HTMLInputElement).checked).toBe(false);
    expect(zuordnenKnopf().disabled).toBe(true);

    // Suche geleert: ebenso.
    await waehlen("onb-mus");
    expect(zuordnenKnopf().disabled).toBe(false);
    await suchen("");
    expect(document.querySelector("[data-vorschau]")).toBeNull();
    expect(zuordnenKnopf().disabled).toBe(true);
  });

  it("ein gewählter Vorschlag bleibt gewählt, wenn sich die Suche ändert", async () => {
    const { laden } = lader({ suche: () => [], vorschau: () => vorschau() });
    await zeige({ laden });
    await waehlen("onb-stark");
    await suchen("Xyz");
    expect((document.querySelector('[data-kandidat="onb-stark"] input') as HTMLInputElement).checked).toBe(true);
    expect(zuordnenKnopf().disabled).toBe(false);
  });

  it("reine Regel `wahlSichtbar`", () => {
    const v = [{ onboardingId: "onb-a" }];
    expect(wahlSichtbar(null, v, null)).toBe(false);
    expect(wahlSichtbar("onb-a", v, null)).toBe(true);
    expect(wahlSichtbar("onb-b", v, [{ onboardingId: "onb-b" }])).toBe(true);
    expect(wahlSichtbar("onb-b", v, [])).toBe(false);
    expect(wahlSichtbar("onb-b", v, null)).toBe(false);
  });

  it("ein Treffer, der schon Vorschlag ist, steht nur einmal da", async () => {
    const { laden } = lader({ suche: () => einstellungsTreffer([KANDIDATEN[0]]) });
    await zeige({ laden });
    await suchen("Beispiel");
    expect(document.querySelectorAll('[data-kandidat="onb-stark"]')).toHaveLength(1);
  });

  it("reine Regel `sucheStand`", () => {
    expect(sucheStand("")).toBe("LEER");
    expect(sucheStand("  ab ")).toBe("ZU_KURZ");
    expect(sucheStand("abc")).toBe("SUCHEN");
  });
});

// =============================================
// 3./4. Merker und Vorschau
// =============================================

describe("Merker und Vorschau", () => {
  it("Vorschau: Rückgaben, Sperraufgaben, Hinweise und andere Austritte; Arbeitsort-Satz", async () => {
    const { laden, anfragen } = lader({
      vorschau: () =>
        vorschau({ arbeitsort: { grund: "UEBERNOMMEN", text: arbeitsortText("UEBERNOMMEN", "FES Grundschule") } }),
    });
    await zeige({ laden });
    await waehlen("onb-stark");
    expect(anfragen.filter((a) => a.vorschau)).toEqual([{ vorschau: "onb-stark", weitereBeschaeftigung: false }]);
    const v = document.querySelector('[data-vorschau="onb-stark"]') as HTMLElement;
    // Der Kopf nennt, was zugeordnet wird (Review A4c).
    expect(v.querySelector("[data-vorschau-titel]")?.textContent).toBe("Vorschau für Anna Beispiel · 2027-GYM-007");
    expect(v.querySelector('[data-vorschau-arbeitsort="UEBERNOMMEN"]')?.textContent).toBe(
      "Arbeitsort FES Grundschule wird übernommen: Die Aufgaben dieses Austritts gehen an die Stellen dort.",
    );
    expect(v.querySelector('[data-vorschau-liste="rueckgaben"]')?.textContent).toContain(
      "Dienst-iPad (Lernmittel) · FES-IPAD-0412 – übergeben 28.01.2027 · IT-Abteilung",
    );
    expect(v.querySelector('[data-vorschau-liste="sperraufgaben"]')?.textContent).toContain("Zugänge (Portal, E-Mail)");
    expect(v.querySelector('[data-vorschau-liste="zentral"]')?.textContent).toContain("Dienst-E-Mail");
    expect(v.querySelector('[data-vorschau-liste="andere-einrichtung"]')?.textContent).toContain(
      "Schlüssel: Haupteingang · GS-114 – übergeben 28.01.2027 · IT-Abteilung · FES Grundschule",
    );
    expect(v.textContent).toContain(ZUORDNEN_TEXTE.hinweiseSpaeter);
    expect(v.querySelector("[data-schon-im-austritt]")?.textContent).toBe(
      MELDUNGEN_AUSGABEN.SCHON_IM_AUSTRITT(1, "OFF-2027-GYM-0002"),
    );
    // Mit der Lage AUSGABEN und Stuecken steht kein Lagetext.
    expect(v.querySelector("[data-vorschau-lage]")).toBeNull();
    expect(zuordnenKnopf().disabled).toBe(false);
  });

  it("Vorschau ohne vorschlagbare Stücke zeigt den Text ihrer Lage", async () => {
    const { laden } = lader({ vorschau: () => vorschau({}, false) });
    await zeige({ laden });
    await waehlen("onb-stark");
    expect(document.querySelector('[data-vorschau-lage="VOR_EINFUEHRUNG"]')?.textContent).toBe(
      LAGE_TEXTE.VOR_EINFUEHRUNG({ nr: "2027-GYM-007", gegenstaende: 0, zugaenge: 0, ohneVermerk: 0 }),
    );
  });

  it("Merker: vorbelegt wie der Server (Versetzung); ein Wechsel rechnet die Vorschau mit dem neuen Wert", async () => {
    const { laden, anfragen } = lader({ basis: auswahl({ weitereBeschaeftigung: true }), vorschau: () => vorschau() });
    await zeige({ laden });
    const box = within(dialog()).getByRole("checkbox", { name: ZUORDNEN_TEXTE.merker }) as HTMLInputElement;
    expect(box.checked).toBe(true);
    await waehlen("onb-stark");
    await act(async () => {
      fireEvent.click(box);
    });
    await warten();
    expect(anfragen.filter((a) => a.vorschau)).toEqual([
      { vorschau: "onb-stark", weitereBeschaeftigung: true },
      { vorschau: "onb-stark", weitereBeschaeftigung: false },
    ]);
  });
});

// =============================================
// 5. Zuordnen
// =============================================

describe("Zuordnen", () => {
  it("schickt Einstellung und Merker – Body nach dem Schema der Route", async () => {
    const { laden } = lader({ vorschau: () => vorschau() });
    const props = await zeige({ laden });
    await waehlen("onb-mittel");
    await act(async () => {
      fireEvent.click(zuordnenKnopf());
    });
    expect(props.onZuordnen).toHaveBeenCalledWith({ aktion: "zuordnen", onboardingId: "onb-mittel", weitereBeschaeftigung: false });
    const body = (props.onZuordnen as jest.Mock).mock.calls[0][0];
    expect(einstellungAktionSchema.safeParse(body).success).toBe(true);
  });

  it("Sperrgrund der Vorschau (vergeben) sperrt „Zuordnen“ mit sichtbarem Grund", async () => {
    const { laden } = lader({ vorschau: () => vorschau({ sperrGrund: MELDUNGEN_AUSGABEN.EINSTELLUNG_VERGEBEN }) });
    await zeige({ laden });
    await waehlen("onb-stark");
    expect(zuordnenKnopf().disabled).toBe(true);
    expect(dialog().querySelector('[data-zeile="grund"]')?.textContent).toBe(MELDUNGEN_AUSGABEN.EINSTELLUNG_VERGEBEN);
  });

  it("Fehlertext des Servers (EINSTELLUNG_VERGEBEN) steht im Fuß", async () => {
    const { laden } = lader({});
    await zeige({ laden, fehler: MELDUNGEN_AUSGABEN.EINSTELLUNG_VERGEBEN });
    expect(within(dialog()).getByRole("alert").textContent).toBe(MELDUNGEN_AUSGABEN.EINSTELLUNG_VERGEBEN);
  });

  it("schon zugeordnet: keine Auswahl, der Grund am Knopf", async () => {
    const { laden } = lader({
      basis: auswahl({ zuordenbar: false, zugeordnet: einstellungsTreffer([KANDIDATEN[0]])[0], vorschlaege: [] }),
    });
    await zeige({ laden });
    expect(dialog().querySelector('[data-liste="vorschlaege"]')).toBeNull();
    expect(dialog().querySelector('[data-zeile="grund"]')?.textContent).toBe(MELDUNGEN_AUSGABEN.BEREITS_ZUGEORDNET);
  });

  it("Abbrechen schließt ohne Aufruf", async () => {
    const { laden } = lader({});
    const props = await zeige({ laden });
    fireEvent.click(within(dialog()).getByRole("button", { name: "Abbrechen" }));
    expect(props.onAbbrechen).toHaveBeenCalledTimes(1);
    expect(props.onZuordnen).not.toHaveBeenCalled();
  });
});

// =============================================
// 6. Laden und Hinweis
// =============================================

describe("Laden und Hinweis für die Abteilungskarte", () => {
  it("Adresse der Abfrage: nur gesetzte Teile", () => {
    expect(auswahlUrl("off-1", {})).toBe("/api/offboarding/off-1/einstellung");
    expect(auswahlUrl("off-1", { q: " Mus " })).toBe("/api/offboarding/off-1/einstellung?q=Mus");
    expect(auswahlUrl("off-1", { vorschau: "onb-7", weitereBeschaeftigung: false })).toBe(
      "/api/offboarding/off-1/einstellung?vorschau=onb-7&weitereBeschaeftigung=false",
    );
  });

  it("Laden: `data` bei Erfolg, Text des Servers bei Fehler, Verbindungsfehler", async () => {
    global.fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ data: auswahl() }) })) as unknown as typeof fetch;
    const ok = await einstellungAuswahlLaden("off-1", {});
    expect(ok.ok && ok.daten.zuordenbar).toBe(true);
    global.fetch = jest.fn(async () => ({ ok: false, status: 404, json: async () => ({ error: "Vorgang nicht gefunden" }) })) as unknown as typeof fetch;
    expect(await einstellungAuswahlLaden("off-1", {})).toEqual({ ok: false, meldung: "Vorgang nicht gefunden" });
    global.fetch = jest.fn(async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    expect(await einstellungAuswahlLaden("off-1", {})).toEqual({ ok: false, meldung: ZUORDNEN_TEXTE.verbindung });
  });

  it("ein Ladefehler steht im Dialog, „Zuordnen“ bleibt gesperrt", async () => {
    const laden = jest.fn(async (): Promise<AuswahlErgebnis> => ({ ok: false, meldung: "Vorgang nicht gefunden" }));
    await zeige({ laden });
    expect(within(dialog()).getAllByRole("alert")[0].textContent).toBe("Vorgang nicht gefunden");
    expect(zuordnenKnopf().disabled).toBe(true);
  });

  it("Hinweis „Einstellung zuordnen, bevor Sie die Abteilungen informieren“ mit Knopf", () => {
    const zuordnen = jest.fn();
    render(<ZuordnungEmpfohlenHinweis onZuordnen={zuordnen} />);
    const hinweis = document.querySelector('[data-hinweis="zuordnung-empfohlen"]') as HTMLElement;
    expect(hinweis.textContent).toContain(MELDUNGEN_AUSGABEN.ZUORDNUNG_EMPFOHLEN);
    expect(MELDUNGEN_AUSGABEN.ZUORDNUNG_EMPFOHLEN).toBe("Einstellung zuordnen, bevor Sie die Abteilungen informieren");
    fireEvent.click(within(hinweis).getByRole("button", { name: "Einstellung zuordnen …" }));
    expect(zuordnen).toHaveBeenCalledTimes(1);
  });

  it("die Vorschau-Stücke kommen aus `ausgabeKurz` (ohne Adresse, mit Stelle)", () => {
    const k = ausgabeKurz(IPAD, { stellenNamen: { IT: "IT-Abteilung" }, einrichtungen: EINRICHTUNGEN });
    expect(k.text).toBe("übergeben 28.01.2027 · IT-Abteilung");
  });
});
