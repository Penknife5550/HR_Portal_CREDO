/**
 * @jest-environment jsdom
 */

/**
 * Reiter „Rückgaben“ im Offboarding (Ausstattung & Zugaenge Stufe 2 – Paket
 * A4, Feinplan S32, Mockup 6.8): src/components/ausgaben/rueckgaben-karte.tsx
 * und die Einbindung in den Reiter (tab-returns.tsx).
 *
 * Belegt wird, was nur die Oberflaeche zeigt:
 *   1. Sechs Lagen der Kopfzeile, je mit eigenem Text (die drei Leeranzeigen
 *      „laut Portal“ unterscheidbar) und dem Satz „Gedächtnisstütze“.
 *   2. Hinweise (zentral, andere Einrichtung, ohne Übergabevermerk) mit
 *      „Übernehmen“ bzw. „Als ausgegeben übernehmen“; die Zeile
 *      `SCHON_IM_AUSTRITT` ohne Kennung, die Vorgangsnummer nur mit Zugriff.
 *   3. Tabelle: Zustandswahl (alle fünf und „offen“, Folgeaufgabe bei einem
 *      fehlenden Schlüssel), Zustand nicht wählbar mit Grund, Kennung
 *      korrigieren mit dem Schema des Vermerks, Löschen nur von HR erfasster
 *      Zeilen, Erfassen.
 *   4. Protokollzeile „fehlt“ bzw. „hochgeladen am …“; „Lösen …“ mit der
 *      Rückfrage samt Zahl der informierten Stellen; Merker „weitere
 *      Beschäftigung“.
 *   5. Aufrufe an die Routen, Fehler des Servers im Dialog, Meldung nach
 *      Erfolg; ohne Recht keine Aktion; ohne `rueckgaben` die Liste nur
 *      lesend; im Reiter Checkliste Zustand und Verweis.
 *   6. Detailseite: „Einstellung zuordnen …“ aus dem Schritt „Rückgaben
 *      einsammeln“ öffnet den Dialog der Seite; nach dem Zuordnen steht der
 *      Reiter „Rückgaben“ mit der Meldung offen, der Fokus auf seinem Titel.
 *
 * Die Übersicht kommt aus den echten reinen Funktionen (`rueckgabeZeilenBauen`,
 * `sperraufgabenZeilen`, `loesenStand`, `protokollAnzeige`, `ausgabeKurz`) –
 * so, wie der Server sie baut. Jeder Body geht durch das echte Schema seiner
 * Route.
 */
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import {
  AusgabeAufgabeZusatz,
  RUECKGABEN_KARTE_TEXTE,
  RueckgabenKarte,
  RueckgabenListe,
  ZUSTAND_WAHL,
  anlegenBody,
  kennungBody,
  kennungGrundZeile,
  rueckgabenAufrufSenden,
  zustandBody,
  type RueckgabenAufruf,
  type RueckgabenAusgang,
  type RueckgabenKarteProps,
} from "@/components/ausgaben/rueckgaben-karte";
import { TabReturns } from "@/app/(portal)/dashboard/offboarding/[id]/tabs/tab-returns";
import {
  GEDAECHTNISSTUETZE,
  LAGE_TEXTE,
  MELDUNGEN_AUSGABEN,
  RUECKGABE_LAGEN,
  ausgabeKurz,
  loesenStand,
  protokollAnzeige,
  protokollStand,
  rueckgabeVorschlagAnzeige,
  rueckgabeZeilenBauen,
  rueckgabenFortschritt,
  sperraufgabenZeilen,
  type AusgabeZeilenDaten,
  type RueckgabeLage,
} from "@/lib/ausgaben";
import { einstellungAktionSchema } from "@/lib/validations/ausgaben";
import { rueckgabeAendernSchema, rueckgabeAnlegenSchema } from "@/lib/validations/offboarding";
import type { RueckgabenUebersicht } from "@/lib/offboarding-ausgaben";
import { OffboardingDetailContent } from "@/app/(portal)/dashboard/offboarding/[id]/offboarding-detail-content";

// React 19 verlangt diese Marke, bevor act() Zustandsaenderungen einsammeln darf.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Fuer die Detailseite (Abschnitt 6): Router und Kopf ohne Netz.
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), refresh: jest.fn() }),
  usePathname: () => "/dashboard/offboarding/off-1",
}));
jest.mock("@/components/portal-header", () => ({
  PortalHeader: () => <header data-testid="portal-header" />,
}));

// =============================================
// Fixtures (wie der Server sie baut)
// =============================================

const STELLEN = { IT: "IT-Abteilung", FACILITY: "Facility Management" };
const EINRICHTUNGEN = { "org-gym": "FES Gymnasium", "org-gs": "FES Grundschule" };

type Ausgabe = AusgabeZeilenDaten & { departmentKey: string; bezeichnung: string; organizationId: string; zentral: boolean };

const IPAD: Ausgabe = {
  id: "ag-ipad",
  bezeichnung: "Dienst-iPad (Lernmittel)",
  zustand: "AUSGEGEBEN",
  beiAustritt: "RUECKGABE",
  kennung: "FES-IPAD-0412",
  kennungLabel: "Inventarnummer",
  uebergebenAm: "2027-01-28",
  quelle: "LINK",
  departmentKey: "IT",
  organizationId: "org-gym",
  zentral: false,
  bezuege: [{ offboardingId: "off-1", status: "HANDOVER_PHASE" }],
};
const SCHLUESSEL: Ausgabe = {
  ...IPAD,
  id: "ag-gs114",
  bezeichnung: "Schlüssel: Haupteingang",
  kennung: "GS-114",
  kennungLabel: "Schlüsselnummer",
  uebergebenAm: "2027-01-30",
  departmentKey: "FACILITY",
};
const ZUGANG: Ausgabe = {
  ...IPAD,
  id: "ag-zugang",
  bezeichnung: "Zugänge (Portal, E-Mail)",
  beiAustritt: "SPERREN",
  kennung: null,
  kennungLabel: null,
};

const RUECKGABEN = [
  {
    id: "r-ipad",
    category: "IT_HARDWARE",
    itemName: "Dienst-iPad (Lernmittel)",
    serialNumber: "FES-IPAD-0412",
    zustand: null,
    isReturned: false,
    returnedAt: null,
    ausgabeId: "ag-ipad",
  },
  {
    id: "r-gs",
    category: "SCHLUESSEL",
    itemName: "Schlüssel: Haupteingang",
    serialNumber: "GS-114",
    zustand: "ZURUECK",
    isReturned: true,
    returnedAt: "2027-07-29T08:00:00.000Z",
    ausgabeId: "ag-gs114",
  },
  {
    id: "r-hand",
    category: "SONSTIGES",
    itemName: "Parkausweis",
    serialNumber: null,
    zustand: null,
    isReturned: false,
    returnedAt: null,
    notes: "liegt im Fach",
    ausgabeId: null,
  },
];
const AUFGABEN = [
  { title: "Dienst-iPad (Lernmittel) zurücknehmen", isCompleted: false, herkunft: "AUSGABE", ausgabeId: "ag-ipad", assigneeDepartment: "IT" },
  { title: "Schlüssel: Haupteingang zurücknehmen", isCompleted: true, herkunft: "AUSGABE", ausgabeId: "ag-gs114", assigneeDepartment: "FACILITY" },
  { title: "Zugänge (Portal, E-Mail) sperren", isCompleted: false, herkunft: "AUSGABE", ausgabeId: "ag-zugang", assigneeDepartment: "IT" },
];
const LINKS = [{ departmentKey: "IT", sentAt: "2027-07-12T08:00:00.000Z", lastSentAt: null }];

function lageText(lage: RueckgabeLage): string {
  return LAGE_TEXTE[lage]({ nr: "2027-GYM-007", gegenstaende: 2, zugaenge: 1, ohneVermerk: 2 });
}

function uebersicht(teil: Partial<RueckgabenUebersicht> = {}, austrittStatus = "HANDOVER_PHASE"): RueckgabenUebersicht {
  const ausgaben = [IPAD, SCHLUESSEL, ZUGANG];
  return {
    einstellung: {
      onboardingId: "onb-7",
      displayId: "2027-GYM-007",
      name: "Anna Beispiel",
      organizationId: "org-gym",
      arbeitsortId: null,
      vertragsbeginn: "2027-02-01",
    },
    weitereBeschaeftigung: false,
    arbeitsort: null,
    einrichtungen: EINRICHTUNGEN,
    lage: "AUSGABEN",
    text: lageText("AUSGABEN"),
    zusatz: null,
    gedaechtnisstuetze: GEDAECHTNISSTUETZE,
    zuordnungEmpfohlen: false,
    aktionen: { zuordnen: false, loesen: true, aktualisieren: true, ohneVermerk: false },
    zeilen: rueckgabeZeilenBauen({
      rueckgaben: RUECKGABEN,
      aufgaben: AUFGABEN,
      ausgaben,
      stellenNamen: STELLEN,
      austrittId: "off-1",
      darfBearbeiten: austrittStatus !== "CANCELLED",
      austrittStatus,
    }),
    sperraufgaben: sperraufgabenZeilen({ aufgaben: AUFGABEN, rueckgaben: RUECKGABEN, ausgaben, stellenNamen: STELLEN }),
    vorschlag: { rueckgaben: [], sperraufgaben: [], hinweisZentral: [], hinweisAndereEinrichtung: [], schonImAustritt: [] },
    ohneVermerk: [],
    loesen: loesenStand({ aufgaben: AUFGABEN.map((a) => ({ ...a, isCompleted: false })), rueckgaben: [], links: LINKS }),
    offen: [],
    schritt: { erledigt: false, text: lageText("AUSGABEN") },
    fortschritt: rueckgabenFortschritt({
      rueckgaben: RUECKGABEN,
      aufgaben: AUFGABEN.map((a, i) => ({ ...a, id: `t-${i}` })),
    }),
    merkerWechsel: { nach: true, uebernimmt: [] },
    protokoll: protokollAnzeige("RUECKGABE", protokollStand({ ausgabenMitRueckgabe: 2, dokumente: [] })),
    ...teil,
  };
}

/** Ein Aufruf, der gelingt (bzw. scheitert) – und jeden Body durch das Schema seiner Route schickt. */
function aufrufMock(ausgang: Partial<RueckgabenAusgang> = {}) {
  return jest.fn(async (aufruf: RueckgabenAufruf): Promise<RueckgabenAusgang> => {
    if (aufruf.art === "einstellung") expect(einstellungAktionSchema.safeParse(aufruf.body).success).toBe(true);
    if (aufruf.art === "aendern") expect(rueckgabeAendernSchema.safeParse(aufruf.body).success).toBe(true);
    if (aufruf.art === "anlegen") expect(rueckgabeAnlegenSchema.safeParse(aufruf.body).success).toBe(true);
    return { ok: true, status: 200, meldung: "Gespeichert.", ...ausgang };
  });
}

function karte(teil: Partial<RueckgabenKarteProps> = {}) {
  const props: RueckgabenKarteProps = {
    rueckgaben: uebersicht(),
    darfBearbeiten: true,
    onAufruf: aufrufMock(),
    onZuordnen: jest.fn(),
    ...teil,
  };
  render(<RueckgabenKarte {...props} />);
  return props;
}

const karteEl = () => document.querySelector('[data-karte="rueckgaben"]') as HTMLElement;
const zeile = (id: string) => document.querySelector(`[data-rueckgabe="${id}"]`) as HTMLElement;
const dialog = () => screen.getByRole("dialog");
const imDialog = (name: string | RegExp) => within(dialog()).getByRole("button", { name }) as HTMLButtonElement;

async function klick(el: Element) {
  await act(async () => {
    fireEvent.click(el);
  });
}

afterEach(() => {
  jest.restoreAllMocks();
});

// =============================================
// 1. Lagen
// =============================================

describe("Kopfzeile nach Lage (E-A36)", () => {
  it.each(RUECKGABE_LAGEN)("%s: eigener Text, Symbol, darunter die Gedächtnisstütze", (lage) => {
    karte({ rueckgaben: uebersicht({ lage, text: lageText(lage) }) });
    expect(karteEl().getAttribute("data-lage")).toBe(lage);
    const kopf = document.querySelector(`[data-lage-text="${lage}"]`) as HTMLElement;
    expect(kopf.textContent).toContain(lageText(lage));
    expect(kopf.querySelector("svg")).not.toBeNull();
    expect(kopf.querySelector("[data-gedaechtnisstuetze]")?.textContent).toBe(GEDAECHTNISSTUETZE);
  });

  it("die drei Leeranzeigen „laut Portal“ sind unterscheidbar (verschiedene Texte)", () => {
    const leer = ["KEINE_EINSTELLUNG", "VOR_EINFUEHRUNG", "NICHTS_AUSGEGEBEN"] as const;
    const texte = leer.map(lageText);
    expect(new Set(texte).size).toBe(3);
    expect(texte[0]).toContain("Keine Einstellung zugeordnet");
    expect(texte[1]).toContain("vor der Erfassung");
    expect(texte[2]).toContain("nichts ausgegeben");
  });

  it("Zusatzzeile „Weitere Ausgaben … gelöscht“ steht unter dem Text", () => {
    karte({ rueckgaben: uebersicht({ zusatz: "Weitere Ausgaben wurden nach Ablauf der Aufbewahrungsfrist gelöscht." }) });
    expect(document.querySelector('[data-lage-text="AUSGABEN"]')?.textContent).toContain(
      "Weitere Ausgaben wurden nach Ablauf der Aufbewahrungsfrist gelöscht.",
    );
  });

  it("ohne Einstellung: „Einstellung zuordnen …“ öffnet den Dialog der Seite; kein Lösen, kein Merker", async () => {
    const props = karte({
      rueckgaben: uebersicht({
        einstellung: null,
        weitereBeschaeftigung: null,
        lage: "KEINE_EINSTELLUNG",
        text: lageText("KEINE_EINSTELLUNG"),
        aktionen: { zuordnen: true, loesen: false, aktualisieren: false, ohneVermerk: false },
        loesen: null,
        zeilen: [],
        sperraufgaben: [],
      }),
    });
    await klick(screen.getByRole("button", { name: "Einstellung zuordnen …" }));
    expect(props.onZuordnen).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: RUECKGABEN_KARTE_TEXTE.loesen })).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(document.querySelector('[data-leer="rueckgaben"]')?.textContent).toBe(RUECKGABEN_KARTE_TEXTE.leer);
  });
});

// =============================================
// 2. Einstellung, Hinweise, andere Austritte
// =============================================

describe("Einstellung und Hinweise", () => {
  it("Einstellung mit Nummer, Name, Einrichtung und Vertragsbeginn; Arbeitsort am Austritt", () => {
    karte({ rueckgaben: uebersicht({ arbeitsort: { id: "org-gs", name: "FES Grundschule" } }) });
    const block = document.querySelector('[data-einstellung="onb-7"]') as HTMLElement;
    expect(block.textContent).toContain("Anna Beispiel · 2027-GYM-007");
    expect(block.textContent).toContain("FES Gymnasium · Vertragsbeginn 01.02.2027");
    expect(block.querySelector("[data-arbeitsort]")?.textContent).toBe("Arbeitsort am Austritt: FES Grundschule");
  });

  it("noch nicht übernommen: Liste und „Rückgaben aktualisieren“ schickt { aktion: aktualisieren }", async () => {
    const vorschlag = rueckgabeVorschlagAnzeige(
      { vorschlag: [{ ...IPAD, id: "ag-neu", kennung: "NB-2231", bezeichnung: "Dienst-Laptop/PC" }], hinweisZentral: [], hinweisAndereEinrichtung: [], schonImAustritt: [] },
      { stellenNamen: STELLEN, einrichtungen: EINRICHTUNGEN },
    );
    const props = karte({ rueckgaben: uebersicht({ vorschlag }) });
    const block = document.querySelector('[data-block="noch-nicht-uebernommen"]') as HTMLElement;
    expect(block.textContent).toContain(RUECKGABEN_KARTE_TEXTE.nochNicht(1));
    expect(block.textContent).toContain("Dienst-Laptop/PC · NB-2231 – übergeben 28.01.2027 · IT-Abteilung");
    await klick(screen.getByRole("button", { name: RUECKGABEN_KARTE_TEXTE.aktualisieren }));
    expect(props.onAufruf).toHaveBeenCalledWith({ art: "einstellung", body: { aktion: "aktualisieren" } });
    expect(document.querySelector('[data-meldung="ok"]')?.textContent).toContain("Gespeichert.");
  });

  it("Hinweise zentral und andere Einrichtung: „Übernehmen“ schickt genau dieses Stück", async () => {
    const zentral = ausgabeKurz({ ...IPAD, id: "ag-mail", bezeichnung: "Dienst-E-Mail", beiAustritt: "SPERREN", kennung: null, zentral: true }, { stellenNamen: STELLEN, einrichtungen: EINRICHTUNGEN });
    const andere = ausgabeKurz({ ...SCHLUESSEL, id: "ag-gs201", organizationId: "org-gs" }, { stellenNamen: STELLEN, einrichtungen: EINRICHTUNGEN });
    const props = karte({
      rueckgaben: uebersicht({
        vorschlag: { rueckgaben: [], sperraufgaben: [], hinweisZentral: [zentral], hinweisAndereEinrichtung: [andere], schonImAustritt: [] },
      }),
    });
    const blockZentral = document.querySelector('[data-block="hinweis-zentral"]') as HTMLElement;
    const blockAndere = document.querySelector('[data-block="hinweis-andere-einrichtung"]') as HTMLElement;
    expect(blockZentral.textContent).toContain(RUECKGABEN_KARTE_TEXTE.hinweisZentral(1));
    expect(blockAndere.textContent).toContain("FES Grundschule");
    await klick(within(blockAndere).getByRole("button", { name: "Übernehmen Schlüssel: Haupteingang" }));
    expect(props.onAufruf).toHaveBeenLastCalledWith({ art: "einstellung", body: { aktion: "aktualisieren", ausgabeIds: ["ag-gs201"] } });
    await klick(within(blockZentral).getByRole("button", { name: "Übernehmen Dienst-E-Mail" }));
    expect(props.onAufruf).toHaveBeenLastCalledWith({ art: "einstellung", body: { aktion: "aktualisieren", ausgabeIds: ["ag-mail"] } });
  });

  it("ohne Übergabevermerk: „Als ausgegeben übernehmen“ schickt die Aufgabe", async () => {
    const props = karte({
      rueckgaben: uebersicht({
        aktionen: { zuordnen: false, loesen: true, aktualisieren: true, ohneVermerk: true },
        ohneVermerk: [{ checklistItemId: "ci-laptop", titel: "Dienst-Laptop/PC bereitstellen", erledigtAm: "2027-01-27" }],
      }),
    });
    const block = document.querySelector('[data-block="ohne-vermerk"]') as HTMLElement;
    expect(block.textContent).toContain("Dienst-Laptop/PC bereitstellen · erledigt am 27.01.2027");
    await klick(within(block).getByRole("button", { name: /^Als ausgegeben übernehmen/ }));
    expect(props.onAufruf).toHaveBeenCalledWith({
      art: "einstellung",
      body: { aktion: "ohne-vermerk", checklistItemIds: ["ci-laptop"] },
    });
  });

  it("Hinweiszeile SCHON_IM_AUSTRITT: ohne Kennung, die Vorgangsnummer nur mit Zugriff", () => {
    const vorschlag = rueckgabeVorschlagAnzeige(
      {
        vorschlag: [],
        hinweisZentral: [],
        hinweisAndereEinrichtung: [],
        schonImAustritt: [
          { offboardingId: "off-2", displayId: "OFF-2027-GYM-0002", anzahl: 2 },
          { offboardingId: "off-3", displayId: null, anzahl: 1 },
        ],
      },
      { stellenNamen: STELLEN, einrichtungen: EINRICHTUNGEN },
    );
    karte({ rueckgaben: uebersicht({ vorschlag }) });
    const zeilen = [...document.querySelectorAll("[data-schon-im-austritt]")].map((z) => z.textContent);
    expect(zeilen).toEqual([
      MELDUNGEN_AUSGABEN.SCHON_IM_AUSTRITT(2, "OFF-2027-GYM-0002"),
      MELDUNGEN_AUSGABEN.SCHON_IM_AUSTRITT(1, null),
    ]);
    expect(zeilen[1]).toBe("1 Stück läuft in einem anderen Austritt.");
    expect(zeilen.join(" ")).not.toContain("FES-IPAD");
  });

  it("Merker „weitere Beschäftigung“: angehakt nach Stand; Ändern erst nach der Rückfrage = „Rückgaben aktualisieren“ mit dem neuen Merker", async () => {
    // Review A4c: Das Kaestchen sendet nie selbst – erst die Rueckfrage nennt, was uebernommen wird.
    const zentral = ausgabeKurz(
      { ...IPAD, id: "ag-mail", bezeichnung: "Dienst-E-Mail", beiAustritt: "SPERREN", kennung: null, zentral: true },
      { stellenNamen: STELLEN, einrichtungen: EINRICHTUNGEN },
    );
    const props = karte({
      rueckgaben: uebersicht({ weitereBeschaeftigung: true, merkerWechsel: { nach: false, uebernimmt: [zentral] } }),
    });
    const box = screen.getByRole("checkbox", { name: RUECKGABEN_KARTE_TEXTE.merker }) as HTMLInputElement;
    expect(box.checked).toBe(true);
    box.focus();
    await klick(box);

    // Kein Aufruf, das Kaestchen zeigt weiter den gespeicherten Stand; der Dialog nennt das Stueck.
    expect(props.onAufruf).not.toHaveBeenCalled();
    expect(box.checked).toBe(true);
    expect(dialog().getAttribute("data-dialog")).toBe("weitere-beschaeftigung");
    expect(dialog().textContent).toContain(RUECKGABEN_KARTE_TEXTE.merkerTitel(false));
    expect(dialog().textContent).toContain(RUECKGABEN_KARTE_TEXTE.merkerSatz(false));
    expect(dialog().querySelector('[data-liste="merker-uebernimmt"]')?.textContent).toContain(
      "Dienst-E-Mail – eingerichtet 28.01.2027 · IT-Abteilung",
    );

    // Abbrechen: nichts gesendet, der Fokus zurueck auf das Kaestchen (kein Sprung zum Titel).
    await klick(imDialog("Abbrechen"));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(props.onAufruf).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(box);

    // Bestaetigen: genau „aktualisieren“ mit dem neuen Merker; danach der Fokus wieder auf dem Kaestchen.
    await klick(box);
    await klick(imDialog(RUECKGABEN_KARTE_TEXTE.merkerSpeichernUebernehmen));
    expect(props.onAufruf).toHaveBeenCalledWith({
      art: "einstellung",
      body: { aktion: "aktualisieren", weitereBeschaeftigung: false },
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(box);
  });

  it("Merker setzen ohne neue Stücke: „Dabei wird nichts übernommen.“ und „Speichern“", async () => {
    const props = karte();
    const box = screen.getByRole("checkbox", { name: RUECKGABEN_KARTE_TEXTE.merker }) as HTMLInputElement;
    expect(box.checked).toBe(false);
    await klick(box);
    expect(dialog().textContent).toContain(RUECKGABEN_KARTE_TEXTE.merkerTitel(true));
    expect(dialog().querySelector("[data-merker-nichts]")?.textContent).toBe(RUECKGABEN_KARTE_TEXTE.merkerNichts);
    await klick(imDialog(RUECKGABEN_KARTE_TEXTE.merkerSpeichern));
    expect(props.onAufruf).toHaveBeenCalledWith({
      art: "einstellung",
      body: { aktion: "aktualisieren", weitereBeschaeftigung: true },
    });
  });
});

// =============================================
// 3. Tabelle
// =============================================

describe("Tabelle: Zustand, Kennung, Löschen, Erfassen", () => {
  it("Zeilen mit Kategorie, Stelle und Übergabe, Kennung, Zustand; Zähler „erledigt“", () => {
    karte();
    expect(document.querySelector("[data-zaehler]")?.textContent).toBe("1 von 3 Rückgaben erledigt");
    const ipad = zeile("r-ipad");
    expect(ipad.textContent).toContain("IT-Hardware");
    expect(ipad.querySelector("[data-uebergabe]")?.textContent).toBe("übergeben 28.01.2027 · IT-Abteilung");
    expect(ipad.textContent).toContain("FES-IPAD-0412");
    expect(ipad.querySelector('[data-zustand="OFFEN"]')?.textContent).toBe("offen");
    expect(zeile("r-gs").querySelector('[data-zustand="ZURUECK"]')?.textContent).toBe("zurück · 29.07.2027");
    expect(zeile("r-hand").querySelector("[data-uebergabe]")?.textContent).toBe("Personalabteilung");
    expect(zeile("r-hand").textContent).toContain("Notiz: liegt im Fach");
  });

  it("Löschen nur an der von HR erfassten Zeile – Rückfrage, dann DELETE-Aufruf", async () => {
    const props = karte();
    expect(within(zeile("r-ipad")).queryByRole("button", { name: /^Löschen…/ })).toBeNull();
    await klick(within(zeile("r-hand")).getByRole("button", { name: "Löschen… Parkausweis" }));
    expect(dialog().textContent).toContain(RUECKGABEN_KARTE_TEXTE.loeschenSatz("Parkausweis"));
    await klick(imDialog(RUECKGABEN_KARTE_TEXTE.loeschen));
    expect(props.onAufruf).toHaveBeenCalledWith({ art: "loeschen", itemId: "r-hand" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Zustand wählen: alle fünf und „offen“; „Fehlt“ an einem Schlüssel nennt die Folgeaufgabe", async () => {
    const props = karte();
    await klick(within(zeile("r-gs")).getByRole("button", { name: "Zustand… Schlüssel: Haupteingang" }));
    const radios = within(dialog()).getAllByRole("radio") as HTMLInputElement[];
    expect(radios.map((r) => r.closest("label")?.textContent)).toEqual(ZUSTAND_WAHL.map((w) => w.label));
    expect(radios.find((r) => r.checked)?.value).toBe("ZURUECK");
    // Unveraendert: gesperrt mit Grund.
    expect(imDialog(RUECKGABEN_KARTE_TEXTE.zustandSpeichern).disabled).toBe(true);
    expect(dialog().textContent).toContain(RUECKGABEN_KARTE_TEXTE.keineAenderung);

    await klick(within(dialog()).getByLabelText("Fehlt"));
    expect(dialog().querySelector('[data-hinweis="folgeaufgabe"]')?.textContent).toBe(RUECKGABEN_KARTE_TEXTE.folgeHinweis);
    await klick(imDialog(RUECKGABEN_KARTE_TEXTE.zustandSpeichern));
    expect(props.onAufruf).toHaveBeenCalledWith({ art: "aendern", body: { itemId: "r-gs", zustand: "FEHLT" } });
  });

  it("„Offen“ schickt `zustand: null`; „Fehlt“ an einem Gerät ohne Folgeaufgaben-Hinweis", async () => {
    const props = karte();
    await klick(within(zeile("r-ipad")).getByRole("button", { name: "Zustand… Dienst-iPad (Lernmittel)" }));
    await klick(within(dialog()).getByLabelText("Fehlt"));
    expect(dialog().querySelector('[data-hinweis="folgeaufgabe"]')).toBeNull();
    await klick(within(dialog()).getByLabelText("Verbleibt bei der Person"));
    expect(dialog().querySelector('[data-hinweis="verbleibt"]')).not.toBeNull();
    await klick(imDialog("Abbrechen"));

    await klick(within(zeile("r-gs")).getByRole("button", { name: /^Zustand…/ }));
    await klick(within(dialog()).getByLabelText("Offen"));
    await klick(imDialog(RUECKGABEN_KARTE_TEXTE.zustandSpeichern));
    expect(props.onAufruf).toHaveBeenLastCalledWith({ art: "aendern", body: { itemId: "r-gs", zustand: null } });
  });

  it("freigegebenes VERBLEIBT-Stück eines abgeschlossenen Austritts: kein „Zustand…“, dafür der Grund; Kennung bleibt korrigierbar", () => {
    const verbleibt = { ...IPAD, zustand: "VERBLEIBT", bezuege: [{ offboardingId: "off-1", status: "COMPLETED" }] };
    const zeilen = rueckgabeZeilenBauen({
      rueckgaben: [{ ...RUECKGABEN[0], zustand: "VERBLEIBT" }],
      aufgaben: AUFGABEN,
      ausgaben: [verbleibt],
      stellenNamen: STELLEN,
      austrittId: "off-1",
      darfBearbeiten: true,
      austrittStatus: "COMPLETED",
    });
    karte({ rueckgaben: uebersicht({ zeilen }) });
    const z = zeile("r-ipad");
    expect(within(z).queryByRole("button", { name: /^Zustand…/ })).toBeNull();
    expect(within(z).getByRole("button", { name: /^Kennung…/ })).not.toBeNull();
    expect(z.querySelector("[data-zeile-sperrgrund]")?.textContent).toBe(MELDUNGEN_AUSGABEN.AUSGABE_FREIGEGEBEN);
  });

  it("Kennung korrigieren: Beschriftung der Ausgabe, Schema des Vermerks (spitze Klammern → gesperrt), sonst PATCH mit `serialNumber`", async () => {
    const props = karte();
    await klick(within(zeile("r-ipad")).getByRole("button", { name: "Kennung… Dienst-iPad (Lernmittel)" }));
    const feld = within(dialog()).getByLabelText("Inventarnummer (optional)") as HTMLInputElement;
    expect(feld.value).toBe("FES-IPAD-0412");
    expect(feld.maxLength).toBe(60);
    fireEvent.change(feld, { target: { value: "FES-<b>" } });
    expect(imDialog(RUECKGABEN_KARTE_TEXTE.kennungSpeichern).disabled).toBe(true);
    expect(dialog().textContent).toContain(MELDUNGEN_AUSGABEN.KENNUNG_UNGUELTIG);
    fireEvent.change(feld, { target: { value: " FES-IPAD-0413 " } });
    await klick(imDialog(RUECKGABEN_KARTE_TEXTE.kennungSpeichern));
    expect(props.onAufruf).toHaveBeenCalledWith({ art: "aendern", body: { itemId: "r-ipad", serialNumber: "FES-IPAD-0413" } });
  });

  it("reine Regeln: Kennung an einer Handzeile bis 100 Zeichen, leer = null, unverändert = kein Body", () => {
    const hand = { id: "r-hand", serialNumber: null, vorgeschlagen: false };
    expect(kennungGrundZeile(hand, "x".repeat(101))).toBe(RUECKGABEN_KARTE_TEXTE.kennungZuLang(100));
    expect(kennungGrundZeile(hand, "<ok>")).toBeNull();
    expect(kennungGrundZeile(hand, "  ")).toBe(RUECKGABEN_KARTE_TEXTE.keineAenderung);
    expect(kennungBody({ id: "r-1", serialNumber: "A" }, "  ")).toEqual({ itemId: "r-1", serialNumber: null });
    expect(kennungBody({ id: "r-1", serialNumber: "A" }, " A ")).toBeNull();
    expect(zustandBody({ id: "r-1", zustand: null }, null)).toBeNull();
    expect(zustandBody({ id: "r-1", zustand: null }, "ENTFAELLT")).toEqual({ itemId: "r-1", zustand: "ENTFAELLT" });
    expect(anlegenBody({ category: "SCHLUESSEL", itemName: " Spind ", serialNumber: " ", notes: "" })).toEqual({
      category: "SCHLUESSEL",
      itemName: "Spind",
      serialNumber: null,
      notes: null,
    });
  });

  it("Gegenstand hinzufügen: Pflichtfeld Gegenstand, Body nach `rueckgabeAnlegenSchema`", async () => {
    const props = karte();
    await klick(screen.getByRole("button", { name: RUECKGABEN_KARTE_TEXTE.hinzufuegen }));
    expect(imDialog(RUECKGABEN_KARTE_TEXTE.anlegen).disabled).toBe(true);
    fireEvent.change(within(dialog()).getByLabelText("Kategorie"), { target: { value: "SCHLUESSEL" } });
    fireEvent.change(within(dialog()).getByLabelText(/^Gegenstand/), { target: { value: "Spindschlüssel" } });
    fireEvent.change(within(dialog()).getByLabelText(/^Seriennummer/), { target: { value: "SP-12" } });
    await klick(imDialog(RUECKGABEN_KARTE_TEXTE.anlegen));
    expect(props.onAufruf).toHaveBeenCalledWith({
      art: "anlegen",
      body: { category: "SCHLUESSEL", itemName: "Spindschlüssel", serialNumber: "SP-12", notes: null },
    });
  });

  it("abgebrochener Austritt: keine Zustandswahl, keine Korrektur, kein Erfassen", () => {
    karte({ rueckgaben: uebersicht({ aktionen: { zuordnen: false, loesen: false, aktualisieren: false, ohneVermerk: false } }, "CANCELLED"), abgebrochen: true });
    expect(screen.queryByRole("button", { name: /^Zustand…/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Kennung…/ })).toBeNull();
    expect(screen.queryByRole("button", { name: RUECKGABEN_KARTE_TEXTE.hinzufuegen })).toBeNull();
  });
});

// =============================================
// 4. Protokoll, Sperraufgaben, Lösen
// =============================================

describe("Protokoll, Sperraufgaben und „Lösen …“", () => {
  it("Protokollzeile „fehlt“ bzw. „hochgeladen am …“", () => {
    karte();
    expect(document.querySelector('[data-protokoll="fehlt"]')?.textContent).toBe("Unterschriebenes Rückgabeprotokoll: fehlt");
  });

  it("… hochgeladen am TT.MM.JJJJ", () => {
    karte({
      rueckgaben: uebersicht({
        protokoll: protokollAnzeige(
          "RUECKGABE",
          protokollStand({ ausgabenMitRueckgabe: 2, dokumente: [{ uploadedAt: "2027-08-02T09:00:00.000Z" }] }),
        ),
      }),
    });
    expect(document.querySelector('[data-protokoll="hochgeladen"]')?.textContent).toBe(
      "Unterschriebenes Rückgabeprotokoll: hochgeladen am 02.08.2027",
    );
  });

  it("Zeile „Sperraufgaben …“ je Stelle, ohne Kennung", () => {
    karte();
    expect(document.querySelector('[data-sperraufgaben="IT"]')?.textContent).toBe(
      "Sperraufgaben zum letzten Arbeitstag – IT-Abteilung, über den Offboarding-Link: Zugänge (Portal, E-Mail)",
    );
  });

  it("„Lösen …“: Rückfrage mit Zahl der Aufgaben und der informierten Stellen, dann der Aufruf", async () => {
    const props = karte();
    await klick(screen.getByRole("button", { name: RUECKGABEN_KARTE_TEXTE.loesen }));
    expect(dialog().querySelector('[data-rueckfrage="loesen"]')?.textContent).toBe(MELDUNGEN_AUSGABEN.LOESEN_RUECKFRAGE(3, 1));
    expect(MELDUNGEN_AUSGABEN.LOESEN_RUECKFRAGE(3, 1)).toContain("1 Stelle wurde schon informiert");
    await klick(imDialog(RUECKGABEN_KARTE_TEXTE.loesenBestaetigen));
    expect(props.onAufruf).toHaveBeenCalledWith({ art: "einstellung", body: { aktion: "loesen" } });
  });

  it("Lösen gesperrt: kein Knopf, der Grund steht an der Einstellung", () => {
    karte({
      rueckgaben: uebersicht({
        aktionen: { zuordnen: false, loesen: false, aktualisieren: true, ohneVermerk: false },
        loesen: loesenStand({ aufgaben: AUFGABEN, rueckgaben: [], links: LINKS }),
      }),
    });
    expect(screen.queryByRole("button", { name: RUECKGABEN_KARTE_TEXTE.loesen })).toBeNull();
    expect(document.querySelector("[data-loesen-gesperrt]")?.textContent).toBe(MELDUNGEN_AUSGABEN.LOESEN_GESPERRT);
  });

  it("ein Fehler des Servers bleibt im Dialog; der Dialog bleibt offen", async () => {
    karte({ onAufruf: aufrufMock({ ok: false, status: 409, meldung: MELDUNGEN_AUSGABEN.LOESEN_GESPERRT }) });
    await klick(screen.getByRole("button", { name: RUECKGABEN_KARTE_TEXTE.loesen }));
    await klick(imDialog(RUECKGABEN_KARTE_TEXTE.loesenBestaetigen));
    expect(within(dialog()).getByRole("alert").textContent).toBe(MELDUNGEN_AUSGABEN.LOESEN_GESPERRT);
  });
});

// =============================================
// 5. Rechte, Liste, Aufrufe, Checkliste
// =============================================

describe("Rechte, Einbindung und Aufrufe", () => {
  it("ohne Bearbeitungsrecht: nur lesen – keine Knöpfe, kein Merker zum Ändern", () => {
    karte({ darfBearbeiten: false });
    expect(within(karteEl()).queryAllByRole("button")).toHaveLength(0);
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(document.querySelector("[data-merker]")?.textContent).toBe("Person bleibt in einer anderen Beschäftigung: nein");
  });

  it("Reiter ohne `rueckgaben`: die bisherige Liste nur lesend, mit Zustand und Kategorie-Namen", () => {
    render(
      <TabReturns
        canEdit={false}
        rueckgaben={null}
        returnItems={[
          { id: "a", category: "IT_HARDWARE", itemName: "Laptop", serialNumber: "SN-1", isReturned: true, returnedAt: null, condition: null, notes: null },
          { id: "b", category: "SCHLUESSEL", itemName: "Schlüssel", serialNumber: null, isReturned: false, returnedAt: null, condition: null, notes: null, zustand: "FEHLT" },
        ]}
      />,
    );
    const liste = document.querySelector('[data-liste="rueckgaben-lesend"]') as HTMLElement;
    expect(liste.textContent).toContain("2 von 2 Rückgaben erledigt");
    expect(liste.textContent).toContain("IT-Hardware");
    expect(liste.querySelector('[data-rueckgabe="a"] [data-zustand="ZURUECK"]')?.textContent).toBe("zurück");
    expect(liste.querySelector('[data-rueckgabe="b"] [data-zustand="FEHLT"]')?.textContent).toBe("fehlt");
    expect(within(liste).queryAllByRole("button")).toHaveLength(0);
  });

  it("Reiter mit `rueckgaben`: die Karte", () => {
    render(<TabReturns canEdit rueckgaben={uebersicht()} returnItems={[]} onAufruf={aufrufMock()} />);
    expect(karteEl()).not.toBeNull();
  });

  it("Leere Liste lesend: „Keine Rückgaben“ mit Symbol statt Inline-SVG-Pfad", () => {
    render(<RueckgabenListe returnItems={[]} />);
    expect(document.querySelector('[data-leer="rueckgaben"]')?.textContent).toContain("Keine Rückgaben");
  });

  it("Aufrufe: Routen, Methoden und Meldung des Servers", async () => {
    const f = jest.fn(async (url: string, init?: RequestInit) => {
      void url;
      void init;
      return { ok: true, status: 200, json: async () => ({ meldung: "Einstellung 2027-GYM-007 zugeordnet." }) };
    });
    global.fetch = f as unknown as typeof fetch;
    const r1 = await rueckgabenAufrufSenden("off-1", { art: "einstellung", body: { aktion: "loesen" } });
    expect(r1).toEqual({ ok: true, status: 200, meldung: "Einstellung 2027-GYM-007 zugeordnet." });
    await rueckgabenAufrufSenden("off-1", { art: "aendern", body: { itemId: "r-1", zustand: "FEHLT" } });
    await rueckgabenAufrufSenden("off-1", { art: "loeschen", itemId: "r-1" });
    await rueckgabenAufrufSenden("off-1", {
      art: "anlegen",
      body: { category: "SONSTIGES", itemName: "Ausweis", serialNumber: null, notes: null },
    });
    const calls = f.mock.calls as unknown as [string, RequestInit][];
    expect(calls.map(([url, init]) => [url, init.method])).toEqual([
      ["/api/offboarding/off-1/einstellung", "POST"],
      ["/api/offboarding/off-1/return-items", "PATCH"],
      ["/api/offboarding/off-1/return-items?itemId=r-1", "DELETE"],
      ["/api/offboarding/off-1/return-items", "POST"],
    ]);
    expect(JSON.parse(String(calls[1][1].body))).toEqual({ itemId: "r-1", zustand: "FEHLT" });

    global.fetch = jest.fn(async () => ({ ok: false, status: 409, json: async () => ({ error: "x" }) })) as unknown as typeof fetch;
    expect(await rueckgabenAufrufSenden("off-1", { art: "loeschen", itemId: "r-1" })).toEqual({ ok: false, status: 409, meldung: "x" });
    global.fetch = jest.fn(async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    expect(await rueckgabenAufrufSenden("off-1", { art: "loeschen", itemId: "r-1" })).toEqual({
      ok: false,
      status: null,
      meldung: RUECKGABEN_KARTE_TEXTE.verbindung,
    });
  });

  it("Reiter Checkliste: an einer Rücknahmeaufgabe Zustand und Verweis, an einer Sperraufgabe nichts", async () => {
    const zumReiter = jest.fn();
    const items = [{ ausgabeId: "ag-gs114", zustand: "FEHLT", isReturned: false }];
    const { container } = render(
      <div>
        <AusgabeAufgabeZusatz aufgabe={{ herkunft: "AUSGABE", ausgabeId: "ag-gs114" }} returnItems={items} onZumReiter={zumReiter} />
        <AusgabeAufgabeZusatz aufgabe={{ herkunft: "AUSGABE", ausgabeId: "ag-zugang" }} returnItems={items} onZumReiter={zumReiter} />
        <AusgabeAufgabeZusatz aufgabe={{ herkunft: null, ausgabeId: null }} returnItems={items} />
      </div>,
    );
    const zusaetze = container.querySelectorAll("[data-ruecknahme-zustand]");
    expect(zusaetze).toHaveLength(1);
    expect(zusaetze[0].textContent).toContain("Rückgabe: fehlt");
    await klick(screen.getByRole("button", { name: RUECKGABEN_KARTE_TEXTE.zumReiter }));
    expect(zumReiter).toHaveBeenCalledTimes(1);
  });
});

// =============================================
// 6. Detailseite: „Einstellung zuordnen …“ aus dem Stepper, Ergebnis im Reiter
// =============================================

describe("Detailseite: Zuordnen aus dem Schritt „Rückgaben einsammeln“", () => {
  const VORGANG = "off-1";
  const USER = { userId: "u-hr", email: "hr@credo-gruppe.de", role: "HR_LEITUNG", firstName: "Hanna", lastName: "Personal" };

  function austritt(rueckgaben: RueckgabenUebersicht) {
    return {
      id: VORGANG,
      displayId: "OFF-2027-GYM-014",
      employeeEmail: "anna.beispiel@fes-minden.de",
      employeeFirstName: "Anna",
      employeeLastName: "Beispiel",
      employeePersonalNr: null,
      employeePrivateEmail: null,
      exitType: "KUENDIGUNG_ARBEITNEHMER",
      exitReason: null,
      noticeDate: null,
      lastWorkingDay: "2027-07-31T00:00:00.000Z",
      contractEndDate: null,
      noticePeriodEnd: null,
      status: "HANDOVER_PHASE",
      initiatedAt: "2027-06-01T00:00:00.000Z",
      completedAt: null,
      dataRetentionDate: null,
      organization: { id: "org-gym", name: "FES Gymnasium", mandantNumber: "10" },
      exitData: null,
      returnItems: [],
      documents: [],
      checklistItems: [],
      notes: [],
      departmentLinks: [],
      rueckgaben,
    };
  }

  const VORHER = uebersicht({
    einstellung: null,
    weitereBeschaeftigung: null,
    lage: "KEINE_EINSTELLUNG",
    text: lageText("KEINE_EINSTELLUNG"),
    zuordnungEmpfohlen: true,
    aktionen: { zuordnen: true, loesen: false, aktualisieren: false, ohneVermerk: false },
    zeilen: [],
    sperraufgaben: [],
    loesen: null,
    schritt: { erledigt: true, text: lageText("KEINE_EINSTELLUNG") },
  });

  const VORSCHLAG = {
    onboardingId: "onb-7",
    displayId: "2027-GYM-007",
    name: "Anna Beispiel",
    organizationId: "org-gym",
    arbeitsortId: null,
    vertragsbeginn: "2027-02-01",
    stufe: "STARK" as const,
    gruende: [{ schluessel: "EMAIL" as const, text: "Gleiche E-Mail-Adresse" }],
  };

  function server() {
    let zugeordnet = false;
    const f = jest.fn(async (url: string, init?: RequestInit) => {
      const antwort = (status: number, json: unknown) => ({ ok: status < 300, status, json: async () => json });
      if (url === `/api/offboarding/${VORGANG}`) {
        return antwort(200, JSON.parse(JSON.stringify(austritt(zugeordnet ? uebersicht() : VORHER))));
      }
      if (url.startsWith(`/api/offboarding/${VORGANG}/einstellung`) && init?.method === "POST") {
        zugeordnet = true;
        return antwort(200, { data: uebersicht(), meldung: "Einstellung 2027-GYM-007 zugeordnet. 2 Rückgaben und 1 Sperraufgabe übernommen." });
      }
      if (url.startsWith(`/api/offboarding/${VORGANG}/einstellung`)) {
        const vorschau = url.includes("vorschau=")
          ? {
              vorschau: {
                einstellung: VORSCHLAG,
                stufe: "STARK",
                gruende: VORSCHLAG.gruende,
                arbeitsort: { grund: "OHNE_ARBEITSORT", text: null },
                lage: "AUSGABEN",
                text: lageText("AUSGABEN"),
                zusatz: null,
                weitereBeschaeftigung: false,
                rueckgaben: { rueckgaben: [], sperraufgaben: [], hinweisZentral: [], hinweisAndereEinrichtung: [], schonImAustritt: [] },
                sperrGrund: null,
              },
            }
          : {};
        return antwort(200, {
          data: { zugeordnet: null, zuordenbar: true, weitereBeschaeftigung: false, vorschlaege: [VORSCHLAG], treffer: [], einrichtungen: EINRICHTUNGEN, ...vorschau },
        });
      }
      return antwort(200, { data: null });
    });
    global.fetch = f as unknown as typeof fetch;
    return f;
  }

  it("Hinweis im Stepper → Dialog → Zuordnen: der Reiter „Rückgaben“ zeigt das Ergebnis samt Meldung, der Fokus liegt auf seinem Titel", async () => {
    const f = server();
    await act(async () => {
      render(<OffboardingDetailContent offboardingId={VORGANG} user={USER} />);
    });
    await screen.findAllByText("OFF-2027-GYM-014");
    expect(document.body.textContent).toContain(MELDUNGEN_AUSGABEN.ZUORDNUNG_EMPFOHLEN);

    await klick(screen.getByRole("button", { name: "Einstellung zuordnen …" }));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(dialog().getAttribute("data-dialog")).toBe("einstellung-zuordnen");
    await klick(document.querySelector('[data-kandidat="onb-7"] input') as HTMLInputElement);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    await klick(within(dialog()).getByRole("button", { name: "Zuordnen" }));

    const post = (f.mock.calls as [string, RequestInit | undefined][]).find(([, init]) => init?.method === "POST")!;
    expect(post[0]).toBe(`/api/offboarding/${VORGANG}/einstellung`);
    expect(JSON.parse(String(post[1]!.body))).toEqual({ aktion: "zuordnen", onboardingId: "onb-7", weitereBeschaeftigung: false });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(karteEl()).not.toBeNull();
    expect(document.querySelector('[data-meldung="ok"]')?.textContent).toContain("Einstellung 2027-GYM-007 zugeordnet.");
    expect(document.activeElement?.id).toBe("rueckgaben-karte-titel");
  });
});
