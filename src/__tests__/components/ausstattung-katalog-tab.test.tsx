/**
 * @jest-environment jsdom
 */

/**
 * Einstellungen → Ausstattung & Zugänge, die Oberflaeche (Feinplan S4,
 * Mockup 6.7): Reiter `AusstattungKatalogTab` und `PositionDialog`.
 *
 * Belegt wird:
 *  1. Anzeige: Spalten, kleine Zeile, Status, Warnungen ueber der Liste und je
 *     Zeile, leerer Katalog, Ladefehler.
 *  2. Filter Stelle und Einrichtung (im Browser), „Ausgeblendet hier“ und
 *     „Hier einblenden“ (PUT …/ausblendung), Filter ohne Treffer.
 *  3. Ein- und Ausschalten (PATCH isActive), Fehlertext des Servers.
 *  4. Dialog „Neue Position“: Felder je Art, Grund am gesperrten Knopf aus
 *     `positionPruefen`, der gesendete Body — jeder Body laeuft zusaetzlich
 *     durch das Zod-Schema der Route und `positionPruefen`, damit ein Dialog,
 *     dessen Form der Server ablehnt, hier auffaellt und nicht erst im Betrieb.
 *     Fehlertext des Servers im Dialog, der offen bleibt.
 *  5. Bearbeiten (ganzes Formular per PATCH samt `stand`), 409 „inzwischen
 *     geändert“ bzw. 404: Dialog schliesst, Liste neu, Meldung darueber.
 *  6. Löschen ueber DialogRahmen: in Verwendung gesperrt mit Grund, 409 des
 *     Servers als Meldung; danach Fokus auf dem Ersatzziel statt auf `body`.
 *  7. Vorschläge übernehmen: Vorschau mit „schon im Katalog“ und
 *     Pflegehinweis, Meldung des Servers.
 *  8. Die reinen Helfer des Dialogs und die Importe (client-sicher).
 * 10. A4 (S23): die Feldgruppe „Beim Austritt“ im Dialog (Rückgabekategorie,
 *     Beschriftung der Kennung, Satz aus G27, Grund aus positionPruefen) und
 *     „Rückgabe-Vorgaben übernehmen …“ mit Rückfrage zu MAV und DSB, Vorschau
 *     und Webhook-Hinweis des Servers.
 *  9. Barrierefreiheit: Fokus nach Zeilenaktionen, Namen der Zeilenknoepfe
 *     (beginnen mit dem sichtbaren Text), Pflichtfelder und Hilfetexte des
 *     Dialogs.
 *
 * Umgebung wie in einstellungen-abteilungen.test.tsx (jsdom, ohne jest-dom);
 * der Reiter braucht kein next/navigation.
 */
import fs from "fs";
import path from "path";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { AusstattungKatalogTab } from "@/components/ausstattung/katalog-tab";
import {
  entwurfAusFormular,
  formularAusPosition,
  ganzzahlAusText,
  leeresFormular,
  optionenAusText,
} from "@/components/ausstattung/position-dialog";
import { MELDUNGEN_AUSGABEN } from "@/lib/ausgaben";
import {
  MELDUNGEN,
  VORSCHLAEGE,
  katalogWerte,
  positionPruefen,
  type KatalogEintrag,
  type KatalogPosition,
  type KatalogUebersicht,
} from "@/lib/ausstattung";
import { katalogPositionAenderungSchema, katalogPositionSchema } from "@/lib/validations/ausstattung";

// React 19 verlangt diese Marke, bevor act() Zustandsaenderungen einsammeln darf.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// =============================================
// Fixtures
// =============================================

const GYM = "0b7f4a52-1c1e-4b52-9d1f-2a3b4c5d6e01";
const GS = "0b7f4a52-1c1e-4b52-9d1f-2a3b4c5d6e02";

function position(teil: Partial<KatalogEintrag> & { id: string }): KatalogEintrag {
  return {
    departmentKey: "IT",
    organizationId: null,
    einrichtungsarten: [],
    art: "JA_NEIN",
    angabeSchluessel: null,
    bezeichnung: "Position",
    hinweisFuehrungskraft: null,
    hinweisStelle: null,
    optionen: [],
    vorausgewaehlt: false,
    vorausgewaehlteOptionen: [],
    bemerkungAnbieten: true,
    bemerkungPlatzhalter: null,
    aufgabeTitel: null,
    defaultDueDays: null,
    personengruppen: [],
    sichtbarFuer: [],
    entgeltrelevant: false,
    isActive: true,
    orderIndex: 0,
    vorschlagSchluessel: null,
    ausblendungen: [],
    verwendung: 0,
    ...teil,
  };
}

const IPAD = position({
  id: "p-ipad",
  bezeichnung: "Dienst-iPad (Lernmittel)",
  defaultDueDays: -5,
  vorschlagSchluessel: "IT_IPAD",
});
const ZUGAENGE = position({
  id: "p-zugaenge",
  art: "AUSWAHL",
  bezeichnung: "Zugänge",
  optionen: ["Dienst-E-Mail", "Schulportal", "WebUntis"],
  vorausgewaehlteOptionen: ["Dienst-E-Mail"],
  aufgabeTitel: "Zugang einrichten",
  hinweisStelle: "Erst nach Verpflichtung auf Vertraulichkeit freischalten.",
  defaultDueDays: -7,
  personengruppen: ["STANDARD", "BEAMTE"],
  orderIndex: 10,
  verwendung: 2,
});
const KOPIERKARTE = position({
  id: "p-kopier",
  departmentKey: "VERWALTUNG",
  bezeichnung: "Kopierkarte",
  defaultDueDays: 0,
  ausblendungen: [{ organizationId: GYM }],
});
const SCHLUESSEL = position({
  id: "p-schluessel",
  departmentKey: "FACILITY",
  organizationId: GYM,
  art: "AUSWAHL",
  bezeichnung: "Schlüssel",
  optionen: ["Haupteingang", "Lehrerzimmer"],
  aufgabeTitel: "Schlüssel ausgeben",
  defaultDueDays: -3,
  isActive: false,
});

function katalog(positionen: KatalogEintrag[] = [IPAD, ZUGAENGE, KOPIERKARTE, SCHLUESSEL]): KatalogUebersicht {
  return {
    positionen,
    einrichtungen: [
      { id: GYM, name: "Gymnasium Minden", type: "GYMNASIUM", isActive: true },
      { id: GS, name: "Grundschule Haddenhausen", type: "GRUNDSCHULE", isActive: true },
    ],
    stellen: [
      { key: "IT", name: "IT-Support FES" },
      { key: "VERWALTUNG", name: "Sekretariat" },
      { key: "FACILITY", name: "Hausmeister" },
      { key: "HR", name: "Personalabteilung" },
    ],
    warnungen: {
      adressLuecken: positionen.some((p) => p.id === "p-ipad")
        ? [
            {
              positionId: "p-ipad",
              bezeichnung: "Dienst-iPad (Lernmittel)",
              departmentKey: "IT",
              stelleName: "IT-Abteilung",
              organizationId: GS,
              einrichtung: "Grundschule Haddenhausen",
              grund: "KEINE_ADRESSE",
              text: "Grundschule Haddenhausen: keine aktive Adresse für IT-Abteilung – „Dienst-iPad (Lernmittel)“ fehlt dort im Formular.",
            },
          ]
        : [],
      aehnlicheVorlagenpunkte: positionen.some((p) => p.id === "p-schluessel")
        ? [
            {
              positionId: "p-schluessel",
              bezeichnung: "Schlüssel",
              departmentKey: "FACILITY",
              templateId: "vorlage-1",
              templateName: "Onboarding Lehrkräfte",
              punktId: "punkt-1",
              punktTitel: "Schlüssel bereitlegen",
              wort: "schlüssel",
              text: "Vorlage „Onboarding Lehrkräfte“: „Schlüssel bereitlegen“ klingt nach „Schlüssel“. Bitte den Vorlagenpunkt streichen oder umformulieren, sonst bekommt die Stelle zwei Aufgaben.",
            },
          ]
        : [],
      ausserhalbFreigabe: [],
    },
  };
}

// =============================================
// Netz
// =============================================

interface Aufruf {
  url: string;
  method: string;
  body: Record<string, unknown> | null;
}

let aufrufe: Aufruf[] = [];
let daten: KatalogUebersicht = katalog();
let listeOk = true;
/** Antwort auf die naechste schreibende Anfrage (`status` nur, wo er zaehlt, etwa 404). */
let schreibAntwort: { ok: boolean; koerper: unknown; status?: number } = { ok: true, koerper: {} };
/** Haelt schreibende Anfragen an, bis der Test sie freigibt (Zustand „laeuft“). */
let schreibSperre: Promise<void> | null = null;

function json(ok: boolean, koerper: unknown, status?: number) {
  return Promise.resolve({ ok, status: status ?? (ok ? 200 : 400), json: async () => koerper } as Response);
}

beforeEach(() => {
  aufrufe = [];
  daten = katalog();
  listeOk = true;
  schreibAntwort = { ok: true, koerper: {} };
  global.fetch = jest.fn((url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    aufrufe.push({ url: String(url), method, body: init?.body ? JSON.parse(String(init.body)) : null });
    if (method === "GET") return listeOk ? json(true, { data: daten }) : json(false, { error: "Interner Serverfehler" });
    const { ok, koerper, status } = schreibAntwort;
    if (schreibSperre) return schreibSperre.then(() => json(ok, koerper, status));
    return json(ok, koerper, status);
  }) as unknown as typeof fetch;
  schreibSperre = null;
});

/** Klick samt aller Folgen (Anfrage, Zustand, Neuladen). */
async function klicke(element: Element) {
  await act(async () => {
    fireEvent.click(element);
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

async function zeigeTab() {
  await act(async () => {
    render(<AusstattungKatalogTab />);
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

const seitentext = () => document.body.textContent ?? "";
const schreibend = () => aufrufe.filter((a) => a.method !== "GET");
const ladeAufrufe = () => aufrufe.filter((a) => a.method === "GET").length;
const zeile = (id: string) => document.querySelector(`tr[data-position="${id}"]`) as HTMLTableRowElement | null;
const zeilenIds = () =>
  Array.from(document.querySelectorAll("tr[data-position]")).map((tr) => tr.getAttribute("data-position"));

/** Was ein Knopf SICHTBAR zeigt — ohne den Zusatz fuer Screenreader (`sr-only`). */
function sichtbarerText(knopf: Element): string {
  return Array.from(knopf.childNodes)
    .filter((n) => !(n instanceof HTMLElement && n.classList.contains("sr-only")))
    .map((n) => n.textContent ?? "")
    .join("");
}

function knopfIn(element: Element, text: string): HTMLButtonElement {
  const knopf = Array.from(element.querySelectorAll("button")).find((b) => sichtbarerText(b) === text);
  if (!knopf) throw new Error(`Knopf „${text}“ fehlt`);
  return knopf as HTMLButtonElement;
}

function dialog(): HTMLElement {
  return screen.getByRole("dialog");
}

function grund(): string | null {
  return dialog().querySelector('[data-zeile="grund"]')?.textContent ?? null;
}

function chip(name: string, text: string): HTMLButtonElement {
  const feld = dialog().querySelector(`[data-chips="${name}"]`);
  if (!feld) throw new Error(`Chips „${name}“ fehlen`);
  return knopfIn(feld, text);
}

function aendere(element: HTMLElement, value: string) {
  fireEvent.change(element, { target: { value } });
}

// =============================================
// 1. Anzeige
// =============================================

describe("Anzeige", () => {
  it("Spalten nach Mockup 6.7 und eine Zeile je Position mit fertigen Werten", async () => {
    await zeigeTab();
    const kopf = Array.from(document.querySelectorAll("th")).map((th) => th.textContent);
    expect(kopf).toEqual(["Position", "Art", "Stelle", "Gilt für", "Fällig", "Status", "Aktionen"]);
    expect(zeilenIds()).toEqual(["p-ipad", "p-zugaenge", "p-kopier", "p-schluessel"]);

    const z = zeile("p-zugaenge")!;
    for (const teil of ["Zugänge", "Auswahl", "IT-Support FES", "Zentral", "−7", "Aktiv", "„Dienst-E-Mail“ vorausgewählt"]) {
      expect(z.textContent).toContain(teil);
    }
    expect(z.querySelector('[data-zeile="details"]')?.textContent).toContain("in 2 Vorgängen gewählt");
    const s = zeile("p-schluessel")!;
    expect(s.textContent).toContain("Gymnasium Minden");
    expect(s.querySelector("[data-status]")?.textContent).toBe("Aus");
    expect(knopfIn(s, "Einschalten")).toBeTruthy();
    expect(zeile("p-kopier")!.querySelector('[data-zeile="faellig"]')?.textContent).toBe("0");
  });

  it("Warnungen über der Liste (rot vor gelb) und je Zeile", async () => {
    await zeigeTab();
    const oben = Array.from(document.querySelectorAll("li[data-warnung]")).filter((li) => !li.closest("tr"));
    expect(oben.map((li) => li.getAttribute("data-warnung"))).toEqual(["rot", "gelb"]);
    expect(oben[0].textContent).toContain("Keine aktive Adresse für IT-Support FES in Grundschule Haddenhausen");
    expect(oben[1].textContent).toContain("1 Punkt einer Checklisten-Vorlage klingt");
    expect(zeile("p-ipad")!.querySelector('li[data-warnung="rot"]')?.textContent).toBe(
      "Fehlt in Grundschule Haddenhausen im Formular: IT-Support FES hat dort keine aktive Adresse.",
    );
    expect(zeile("p-schluessel")!.querySelector('li[data-warnung="gelb"]')?.textContent).toContain(
      "„Schlüssel bereitlegen“ klingt nach „Schlüssel“",
    );
  });

  it("leerer Katalog: Satz statt Tabelle, Vorschläge bleiben erreichbar", async () => {
    daten = katalog([]);
    await zeigeTab();
    expect(document.querySelector("table")).toBeNull();
    expect(document.querySelector('[data-leer="katalog"]')?.textContent).toContain("Der Katalog ist leer.");
    expect(screen.getByText("Vorschläge übernehmen…")).toBeTruthy();
  });

  it("Ladefehler wird genannt, „Erneut laden“ lädt neu", async () => {
    listeOk = false;
    await zeigeTab();
    expect(seitentext()).toContain("Der Katalog konnte nicht geladen werden.");
    expect(document.querySelector("table")).toBeNull();
    listeOk = true;
    await klicke(screen.getByText("Erneut laden"));
    expect(zeilenIds()).toHaveLength(4);
  });
});

// =============================================
// 2. Filter und Ausblenden
// =============================================

describe("Filter", () => {
  it("Stelle: nur deren Positionen, ohne neue Anfrage", async () => {
    await zeigeTab();
    const vorher = ladeAufrufe();
    aendere(screen.getByLabelText("Stelle"), "IT");
    expect(zeilenIds()).toEqual(["p-ipad", "p-zugaenge"]);
    expect(ladeAufrufe()).toBe(vorher);
    expect(seitentext()).toContain("2 von 4 Positionen.");
  });

  it("Einrichtung: eigene und zentrale, dort ausgeblendete mit „Ausgeblendet hier“ und „Hier einblenden“", async () => {
    await zeigeTab();
    aendere(screen.getByLabelText("Einrichtung"), GS);
    // Die Schlüssel des Gymnasiums gelten an der Grundschule nicht.
    expect(zeilenIds()).toEqual(["p-ipad", "p-zugaenge", "p-kopier"]);
    expect(zeile("p-kopier")!.querySelector("[data-status]")?.textContent).toBe("Aktiv");
    expect(knopfIn(zeile("p-kopier")!, "Hier ausblenden")).toBeTruthy();

    aendere(screen.getByLabelText("Einrichtung"), GYM);
    expect(zeilenIds()).toEqual(["p-ipad", "p-zugaenge", "p-kopier", "p-schluessel"]);
    const kopier = zeile("p-kopier")!;
    expect(kopier.querySelector("[data-status]")?.textContent).toBe("Ausgeblendet hier");
    expect(kopier.textContent).toContain("für Gymnasium Minden ausgeblendet");
    // Eine Position der Einrichtung wird ausgeschaltet, nicht ausgeblendet.
    expect(Array.from(zeile("p-schluessel")!.querySelectorAll("button")).map(sichtbarerText)).not.toContain(
      "Hier ausblenden",
    );

    schreibAntwort = { ok: true, koerper: { data: { positionId: "p-kopier", organizationId: GYM, ausgeblendet: false, geaendert: true } } };
    const vorher = ladeAufrufe();
    await klicke(knopfIn(kopier, "Hier einblenden"));
    expect(schreibend()).toEqual([
      {
        url: "/api/settings/ausstattung/p-kopier/ausblendung",
        method: "PUT",
        body: { organizationId: GYM, ausgeblendet: false },
      },
    ]);
    expect(seitentext()).toContain("„Kopierkarte“ für Gymnasium Minden wieder eingeblendet.");
    expect(ladeAufrufe()).toBe(vorher + 1);
  });

  it("ohne Treffer: Satz und „Filter zurücksetzen“", async () => {
    await zeigeTab();
    aendere(screen.getByLabelText("Stelle"), "HR");
    expect(document.querySelector('[data-leer="filter"]')?.textContent).toContain("Keine Position für diesen Filter.");
    await klicke(screen.getByText("Filter zurücksetzen"));
    expect(zeilenIds()).toHaveLength(4);
  });
});

// =============================================
// 3. Ein- und Ausschalten
// =============================================

describe("Ein- und Ausschalten", () => {
  it("schickt nur isActive und meldet mit dem Namen", async () => {
    await zeigeTab();
    schreibAntwort = { ok: true, koerper: { data: { ...SCHLUESSEL, isActive: true } } };
    await klicke(knopfIn(zeile("p-schluessel")!, "Einschalten"));
    expect(schreibend()).toEqual([
      { url: "/api/settings/ausstattung/p-schluessel", method: "PATCH", body: { isActive: true } },
    ]);
    expect(seitentext()).toContain("„Schlüssel“ eingeschaltet.");
  });

  it("zeigt den Fehlertext des Servers", async () => {
    await zeigeTab();
    schreibAntwort = { ok: false, koerper: { error: MELDUNGEN.POSITION_INZWISCHEN_GEAENDERT } };
    await klicke(knopfIn(zeile("p-ipad")!, "Ausschalten"));
    expect(document.querySelector('[data-meldung="fehler"]')?.textContent).toBe(MELDUNGEN.POSITION_INZWISCHEN_GEAENDERT);
  });
});

// =============================================
// 4. Dialog „Neue Position“
// =============================================

describe("Dialog „Neue Position“", () => {
  async function oeffne() {
    await zeigeTab();
    await klicke(screen.getByText("+ Position"));
    return dialog();
  }

  function pruefeBody(body: Record<string, unknown> | null) {
    const geparst = katalogPositionSchema.safeParse(body);
    expect(geparst.success).toBe(true);
    if (geparst.success) expect(positionPruefen(geparst.data)).toBeNull();
  }

  it("gesperrt mit Grund, bis Stelle und Bezeichnung da sind; sendet das ganze Formular", async () => {
    const d = await oeffne();
    expect(within(d).getByText("Neue Position")).toBeTruthy();
    const anlegen = within(d).getByRole("button", { name: "Anlegen" }) as HTMLButtonElement;
    expect(anlegen.disabled).toBe(true);
    expect(grund()).toBe(MELDUNGEN.STELLE_FEHLT);
    // A4 (S23): die Feldgruppe „Beim Austritt“, zunächst „Nicht festgelegt“, ohne Kategorie und Kennung.
    const austritt = d.querySelector('[data-feld="beim-austritt"]') as HTMLElement;
    expect((within(austritt).getByRole("radio", { name: "Nicht festgelegt" }) as HTMLInputElement).checked).toBe(true);
    expect(within(d).queryByLabelText(/^Rückgabekategorie/)).toBeNull();
    expect(within(d).queryByLabelText(/^Kennung abfragen/)).toBeNull();

    aendere(within(d).getByLabelText(/^Stelle/), "IT");
    expect(grund()).toBe(MELDUNGEN.BEZEICHNUNG_FEHLT);
    aendere(within(d).getByLabelText(/^Bezeichnung/), "  Dienst-Laptop/PC ");
    aendere(within(d).getByLabelText(/^Fällig/), "−5");
    await klicke(chip("personengruppen", "Beamte"));
    expect(chip("personengruppen", "Beamte").getAttribute("aria-pressed")).toBe("true");
    expect(grund()).toBeNull();
    expect(anlegen.disabled).toBe(false);

    schreibAntwort = { ok: true, koerper: { data: position({ id: "neu", bezeichnung: "Dienst-Laptop/PC", isActive: false }) } };
    await klicke(anlegen);
    expect(schreibend()).toEqual([
      {
        url: "/api/settings/ausstattung",
        method: "POST",
        body: {
          departmentKey: "IT",
          organizationId: null,
          einrichtungsarten: [],
          art: "JA_NEIN",
          angabeSchluessel: null,
          bezeichnung: "Dienst-Laptop/PC",
          hinweisFuehrungskraft: null,
          hinweisStelle: null,
          optionen: [],
          vorausgewaehlt: false,
          vorausgewaehlteOptionen: [],
          bemerkungAnbieten: true,
          bemerkungPlatzhalter: null,
          aufgabeTitel: null,
          defaultDueDays: -5,
          personengruppen: ["BEAMTE"],
          sichtbarFuer: [],
          entgeltrelevant: false,
          beiAustritt: null,
          rueckgabeKategorie: null,
          ausgabeKennung: null,
          orderIndex: 0,
        },
      },
    ]);
    pruefeBody(schreibend()[0].body);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(seitentext()).toContain("Position „Dienst-Laptop/PC“ angelegt – ausgeschaltet.");
  });

  it("A4 (S23): „Beim Austritt“ — Zurückgeben verlangt die Kategorie, Kennung nur bei Zurückgeben/Sperren, Satz aus G27", async () => {
    const d = await oeffne();
    aendere(within(d).getByLabelText(/^Stelle/), "FACILITY");
    aendere(within(d).getByLabelText(/^Bezeichnung/), "Schlüssel Haupteingang");
    const austritt = d.querySelector('[data-feld="beim-austritt"]') as HTMLElement;
    // Der Satz aus G27 hängt an der Feldgruppe.
    const hilfe = document.getElementById(austritt.getAttribute("aria-describedby") ?? "");
    expect(hilfe?.textContent).toContain(MELDUNGEN.AUSGABE_EINSCHALTEN_HINWEIS);

    await klicke(within(austritt).getByRole("radio", { name: "Zurückgeben" }));
    expect(grund()).toBe(MELDUNGEN.RUECKGABEKATEGORIE_FEHLT);
    const kategorie = within(d).getByLabelText(/^Rückgabekategorie/) as HTMLSelectElement;
    expect(kategorie.required).toBe(true);
    expect([...kategorie.options].map((o) => o.value)).toContain("SCHLUESSEL");
    aendere(kategorie, "SCHLUESSEL");
    aendere(within(d).getByLabelText(/^Kennung abfragen/), " Schlüsselnummer ");
    expect(grund()).toBeNull();

    schreibAntwort = { ok: true, koerper: { data: position({ id: "neu", bezeichnung: "Schlüssel Haupteingang" }) } };
    await klicke(within(d).getByRole("button", { name: "Anlegen" }));
    const body = schreibend()[0].body;
    expect(body).toMatchObject({ beiAustritt: "RUECKGABE", rueckgabeKategorie: "SCHLUESSEL", ausgabeKennung: "Schlüsselnummer" });
    pruefeBody(body);
  });

  it("A4 (S23): Sperren ohne Kategorie; „Nichts“ und Angabe schicken Kategorie und Kennung leer", async () => {
    const d = await oeffne();
    aendere(within(d).getByLabelText(/^Stelle/), "IT");
    aendere(within(d).getByLabelText(/^Bezeichnung/), "Zugang WebUntis");
    const austritt = d.querySelector('[data-feld="beim-austritt"]') as HTMLElement;
    await klicke(within(austritt).getByRole("radio", { name: "Zurückgeben" }));
    aendere(within(d).getByLabelText(/^Rückgabekategorie/), "IT_HARDWARE");
    aendere(within(d).getByLabelText(/^Kennung abfragen/), "Benutzername");
    await klicke(within(austritt).getByRole("radio", { name: "Sperren" }));
    // Bei „Sperren“ gibt es keine Kategorie; die getippte bleibt im Formular, geht aber leer hinaus.
    expect(within(d).queryByLabelText(/^Rückgabekategorie/)).toBeNull();
    expect(grund()).toBeNull();
    await klicke(within(austritt).getByRole("radio", { name: "Nichts" }));
    expect(within(d).queryByLabelText(/^Kennung abfragen/)).toBeNull();
    aendere(within(d).getByLabelText(/^Art$/), "ANGABE");
    expect(d.querySelector('[data-feld="beim-austritt"]')).toBeNull();
  });

  it("Auswahl: Optionen eine je Zeile, Vorauswahl als Chips, „entgeltrelevant“ nur mit HR", async () => {
    const d = await oeffne();
    aendere(within(d).getByLabelText(/^Stelle/), "FACILITY");
    aendere(within(d).getByLabelText(/^Bezeichnung/), "Schlüssel");
    aendere(within(d).getByLabelText(/^Art$/), "AUSWAHL");
    expect(grund()).toBe(MELDUNGEN.OPTIONEN_FEHLEN);
    aendere(within(d).getByLabelText(/^Optionen/), "Haupteingang\r\n\n  Lehrerzimmer  \nhaupteingang");
    expect(grund()).toBe(MELDUNGEN.OPTION_DOPPELT);
    aendere(within(d).getByLabelText(/^Optionen/), "Haupteingang\n\n  Lehrerzimmer  ");
    expect(grund()).toBeNull();
    await klicke(chip("vorauswahl", "Lehrerzimmer"));
    aendere(within(d).getByLabelText(/^Aufgabe für die Stelle/), "Schlüssel ausgeben");

    fireEvent.click(within(d).getByLabelText(/^Bedeutung für Entgelt/));
    expect(grund()).toBe(MELDUNGEN.ENTGELT_NUR_HR);
    fireEvent.click(within(d).getByLabelText(/^Bedeutung für Entgelt/));

    await klicke(within(d).getByRole("button", { name: "Anlegen" }));
    const body = schreibend()[0].body!;
    expect(body).toMatchObject({
      departmentKey: "FACILITY",
      art: "AUSWAHL",
      optionen: ["Haupteingang", "Lehrerzimmer"],
      vorausgewaehlteOptionen: ["Lehrerzimmer"],
      vorausgewaehlt: false,
      aufgabeTitel: "Schlüssel ausgeben",
      entgeltrelevant: false,
    });
    pruefeBody(body);
  });

  it("Angabe: nur aus der festen Liste, Bezeichnung = Label, ohne Aufgabe und Bemerkung; „Sichtbar auch für“ ohne eigene Stelle und HR", async () => {
    const d = await oeffne();
    aendere(within(d).getByLabelText(/^Stelle/), "FACILITY");
    aendere(within(d).getByLabelText(/^Bezeichnung/), "Wird ersetzt");
    aendere(within(d).getByLabelText(/^Fällig/), "-3");
    aendere(within(d).getByLabelText(/^Art$/), "ANGABE");
    expect(within(d).queryByLabelText(/^Bezeichnung/)).toBeNull();
    expect(within(d).queryByLabelText(/^Fällig/)).toBeNull();
    expect(grund()).toBe(MELDUNGEN.ANGABE_WAEHLEN);
    const angabe = within(d).getByLabelText(/^Angabe/) as HTMLSelectElement;
    expect(Array.from(angabe.options).map((o) => o.value)).toEqual([
      "",
      "UNTERRICHTSFAECHER",
      "DURCHWAHL",
      "ARBEITSPLATZ_RAUM",
    ]);
    aendere(angabe, "UNTERRICHTSFAECHER");
    const sichtbar = d.querySelector('[data-chips="sichtbar"]')!;
    expect(Array.from(sichtbar.querySelectorAll("button")).map((b) => b.textContent)).toEqual([
      "IT-Support FES",
      "Sekretariat",
    ]);
    await klicke(chip("sichtbar", "IT-Support FES"));
    expect(grund()).toBeNull();

    await klicke(within(d).getByRole("button", { name: "Anlegen" }));
    const body = schreibend()[0].body!;
    expect(body).toMatchObject({
      art: "ANGABE",
      angabeSchluessel: "UNTERRICHTSFAECHER",
      bezeichnung: "Unterrichtsfächer",
      bemerkungAnbieten: false,
      bemerkungPlatzhalter: null,
      aufgabeTitel: null,
      defaultDueDays: null,
      hinweisStelle: null,
      sichtbarFuer: ["IT"],
    });
    pruefeBody(body);
  });

  it("eine Einrichtung statt zentral: keine Einrichtungsarten", async () => {
    const d = await oeffne();
    aendere(within(d).getByLabelText(/^Stelle/), "FACILITY");
    aendere(within(d).getByLabelText(/^Bezeichnung/), "Fachraum Chemie");
    await klicke(chip("einrichtungsarten", "Gymnasium"));
    aendere(within(d).getByLabelText("Gilt für"), GYM);
    expect(d.querySelector('[data-chips="einrichtungsarten"]')).toBeNull();
    await klicke(within(d).getByRole("button", { name: "Anlegen" }));
    expect(schreibend()[0].body).toMatchObject({ organizationId: GYM, einrichtungsarten: [] });
  });

  it("Fehlertext des Servers: Dialog bleibt offen und nennt ihn", async () => {
    const d = await oeffne();
    aendere(within(d).getByLabelText(/^Stelle/), "IT");
    aendere(within(d).getByLabelText(/^Bezeichnung/), "Laptop <neu>");
    schreibAntwort = { ok: false, koerper: { error: MELDUNGEN.OHNE_KLAMMERN } };
    await klicke(within(d).getByRole("button", { name: "Anlegen" }));
    expect(screen.getByRole("dialog")).toBe(d);
    const fehler = d.querySelector('[data-zeile="fehler"]')!;
    expect(fehler.getAttribute("role")).toBe("alert");
    expect(fehler.textContent).toBe(MELDUNGEN.OHNE_KLAMMERN);
  });

  it("übernimmt die Stelle aus dem Filter; Abbrechen schließt ohne Anfrage", async () => {
    await zeigeTab();
    aendere(screen.getByLabelText("Stelle"), "VERWALTUNG");
    await klicke(screen.getByText("+ Position"));
    expect((within(dialog()).getByLabelText(/^Stelle/) as HTMLSelectElement).value).toBe("VERWALTUNG");
    await klicke(within(dialog()).getByRole("button", { name: "Abbrechen" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(schreibend()).toEqual([]);
  });
});

// =============================================
// 5. Bearbeiten
// =============================================

describe("Bearbeiten", () => {
  it("füllt das Formular aus der Position und schickt es ganz per PATCH", async () => {
    await zeigeTab();
    await klicke(knopfIn(zeile("p-zugaenge")!, "Bearbeiten"));
    const d = dialog();
    expect(d.textContent).toContain("Position „Zugänge“ bearbeiten");
    expect((within(d).getByLabelText(/^Optionen/) as HTMLTextAreaElement).value).toBe(
      "Dienst-E-Mail\nSchulportal\nWebUntis",
    );
    expect(chip("vorauswahl", "Dienst-E-Mail").getAttribute("aria-pressed")).toBe("true");
    expect(chip("personengruppen", "Angestellte").getAttribute("aria-pressed")).toBe("true");

    aendere(within(d).getByLabelText(/^Fällig/), "-10");
    schreibAntwort = { ok: true, koerper: { data: { ...ZUGAENGE, defaultDueDays: -10 } } };
    await klicke(within(d).getByRole("button", { name: "Speichern" }));

    const [aufruf] = schreibend();
    expect(aufruf.url).toBe("/api/settings/ausstattung/p-zugaenge");
    expect(aufruf.method).toBe("PATCH");
    const { isActive: _aus, ...ohneSchalter } = katalogWerte(ZUGAENGE);
    expect(aufruf.body).toEqual({ ...ohneSchalter, defaultDueDays: -10 });
    expect(katalogPositionAenderungSchema.safeParse(aufruf.body).success).toBe(true);
    expect(seitentext()).toContain("Position „Zugänge“ gespeichert.");
  });

  it("schickt den Stand beim Öffnen (`stand` = updatedAt) mit — der Server erkennt daran eine fremde Änderung", async () => {
    const stand = "2026-10-12T08:00:00.000Z";
    daten = katalog([{ ...IPAD, updatedAt: stand }, ZUGAENGE, KOPIERKARTE, SCHLUESSEL]);
    await zeigeTab();
    await klicke(knopfIn(zeile("p-ipad")!, "Bearbeiten"));
    aendere(within(dialog()).getByLabelText(/^Fällig/), "-8");
    schreibAntwort = { ok: true, koerper: { data: { ...IPAD, defaultDueDays: -8 } } };
    await klicke(within(dialog()).getByRole("button", { name: "Speichern" }));
    const [aufruf] = schreibend();
    expect(aufruf.body).toMatchObject({ defaultDueDays: -8, stand });
    expect(katalogPositionAenderungSchema.safeParse(aufruf.body).success).toBe(true);
  });

  it("409 „inzwischen geändert“: Dialog schließt (kein zweites Speichern des alten Stands), Liste neu, Meldung darüber", async () => {
    await zeigeTab();
    await klicke(knopfIn(zeile("p-ipad")!, "Bearbeiten"));
    const vorher = ladeAufrufe();
    schreibAntwort = {
      ok: false,
      status: 409,
      koerper: { error: MELDUNGEN.POSITION_INZWISCHEN_GEAENDERT, grund: "INZWISCHEN_GEAENDERT" },
    };
    await klicke(within(dialog()).getByRole("button", { name: "Speichern" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(ladeAufrufe()).toBe(vorher + 1);
    expect(document.querySelector('[data-meldung="fehler"]')?.textContent).toBe(MELDUNGEN.POSITION_INZWISCHEN_GEAENDERT);
    expect(schreibend()).toHaveLength(1);
  });

  it("404 (inzwischen gelöscht): ebenso schließen und neu laden", async () => {
    await zeigeTab();
    await klicke(knopfIn(zeile("p-ipad")!, "Bearbeiten"));
    schreibAntwort = { ok: false, status: 404, koerper: { error: MELDUNGEN.POSITION_NICHT_GEFUNDEN } };
    await klicke(within(dialog()).getByRole("button", { name: "Speichern" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.querySelector('[data-meldung="fehler"]')?.textContent).toBe(MELDUNGEN.POSITION_NICHT_GEFUNDEN);
  });

  it("ein anderer Fehler (400) lässt den Dialog mit der Meldung offen", async () => {
    await zeigeTab();
    await klicke(knopfIn(zeile("p-ipad")!, "Bearbeiten"));
    schreibAntwort = { ok: false, status: 400, koerper: { error: MELDUNGEN.OHNE_KLAMMERN } };
    await klicke(within(dialog()).getByRole("button", { name: "Speichern" }));
    expect(dialog().querySelector('[data-zeile="fehler"]')?.textContent).toBe(MELDUNGEN.OHNE_KLAMMERN);
  });

  it("fällt die Position nach dem Speichern aus dem Filter, geht der Fokus auf den Satz über der Liste", async () => {
    await zeigeTab();
    aendere(screen.getByLabelText("Stelle"), "IT");
    const knopf = knopfIn(zeile("p-ipad")!, "Bearbeiten");
    knopf.focus();
    await klicke(knopf);
    aendere(within(dialog()).getByLabelText(/^Stelle/), "VERWALTUNG");
    // Nach dem Speichern liefert der Server die Position bei der Verwaltung.
    daten = katalog([{ ...IPAD, departmentKey: "VERWALTUNG" }, ZUGAENGE, KOPIERKARTE, SCHLUESSEL]);
    schreibAntwort = { ok: true, koerper: { data: { ...IPAD, departmentKey: "VERWALTUNG" } } };
    await klicke(within(dialog()).getByRole("button", { name: "Speichern" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(zeile("p-ipad")).toBeNull();
    expect(document.activeElement?.id).toBe("ausstattung-katalog-titel");
  });
});

// =============================================
// 6. Löschen
// =============================================

describe("Löschen", () => {
  it("in Verwendung: gesperrt mit dem Grund, keine Anfrage", async () => {
    await zeigeTab();
    await klicke(knopfIn(zeile("p-zugaenge")!, "Löschen"));
    const d = dialog();
    expect(d.textContent).toContain("„Zugänge“ wurde schon in 2 Vorgängen gewählt.");
    expect(grund()).toBe(MELDUNGEN.IN_VERWENDUNG);
    const loeschen = knopfIn(d, "Löschen");
    expect(loeschen.disabled).toBe(true);
    await klicke(loeschen);
    expect(schreibend()).toEqual([]);
  });

  it("löscht nach Rückfrage; ein 409 des Servers steht im Dialog", async () => {
    await zeigeTab();
    await klicke(knopfIn(zeile("p-kopier")!, "Löschen"));
    schreibAntwort = {
      ok: false,
      koerper: { error: MELDUNGEN.IN_VERWENDUNG, grund: "IN_VERWENDUNG", verwendung: 1 },
    };
    await klicke(knopfIn(dialog(), "Löschen"));
    expect(schreibend()).toEqual([{ url: "/api/settings/ausstattung/p-kopier", method: "DELETE", body: null }]);
    expect(dialog().querySelector('[data-zeile="fehler"]')?.textContent).toBe(MELDUNGEN.IN_VERWENDUNG);

    schreibAntwort = { ok: true, koerper: { success: true } };
    await klicke(knopfIn(dialog(), "Löschen"));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(seitentext()).toContain("Position „Kopierkarte“ gelöscht.");
  });

  it("nach dem Löschen liegt der Fokus auf dem Satz über der Liste — nicht auf body", async () => {
    await zeigeTab();
    const ausloeser = knopfIn(zeile("p-kopier")!, "Löschen");
    ausloeser.focus();
    await klicke(ausloeser);
    // Der Server hat gelöscht: Die naechste Liste kennt die Kopierkarte nicht mehr.
    daten = katalog([IPAD, ZUGAENGE, SCHLUESSEL]);
    schreibAntwort = { ok: true, koerper: { success: true } };
    await klicke(knopfIn(dialog(), "Löschen"));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(zeile("p-kopier")).toBeNull();
    expect(document.activeElement?.id).toBe("ausstattung-katalog-titel");
  });
});

// =============================================
// 7. Vorschläge
// =============================================

describe("Rückgabe-Vorgaben übernehmen (A4, G27)", () => {
  async function oeffne() {
    await zeigeTab();
    await klicke(screen.getByText("Rückgabe-Vorgaben übernehmen …"));
    return dialog();
  }

  it("Rückfrage mit dem Satz zu MAV und DSB, Vorschau je Position; meldet den Satz des Servers", async () => {
    daten = katalog([
      IPAD,
      position({ id: "p-laptop", bezeichnung: "Dienst-Laptop/PC", vorschlagSchluessel: "IT_LAPTOP", beiAustritt: "NICHTS" }),
      ZUGAENGE,
    ]);
    const d = await oeffne();
    expect(d.textContent).toContain("Rückgabe-Vorgaben übernehmen?");
    expect(d.textContent).toContain(MELDUNGEN.AUSGABE_EINSCHALTEN_HINWEIS);
    expect(d.querySelector('[data-vorgaben="setzen"] li[data-vorgabe="IT_IPAD"]')?.textContent).toContain(
      "beim Austritt: zurückgeben (IT-Hardware), Kennung „Inventarnummer“",
    );
    expect(d.querySelector('[data-vorgaben="uebersprungen"] li[data-vorgabe="IT_LAPTOP"]')?.textContent).toContain(
      "hat schon einen Wert",
    );
    // Ohne Vorschlagsschlüssel kommt eine Position nicht vor.
    expect(d.textContent).not.toContain("Zugänge");

    const meldung = MELDUNGEN_AUSGABEN.RUECKGABE_VORGABEN_ERGEBNIS(1, 1);
    schreibAntwort = { ok: true, koerper: { gesetzt: 1, uebersprungen: 1, meldung } };
    const vorher = ladeAufrufe();
    await klicke(within(d).getByRole("button", { name: "Vorgaben übernehmen" }));
    expect(schreibend()).toEqual([{ url: "/api/settings/ausstattung/rueckgabe-vorgaben", method: "POST", body: null }]);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(seitentext()).toContain(meldung);
    expect(document.querySelector("[data-meldung-hinweis]")).toBeNull();
    expect(ladeAufrufe()).toBe(vorher + 1);
  });

  it("eine inzwischen zur Angabe gewordene Vorschlagsposition heißt „Angabe“, nicht „hat schon einen Wert“", async () => {
    daten = katalog([
      IPAD,
      position({
        id: "p-tel",
        art: "ANGABE",
        angabeSchluessel: "DURCHWAHL",
        bezeichnung: "Durchwahl",
        bemerkungAnbieten: false,
        defaultDueDays: null,
        vorschlagSchluessel: "IT_TELEFON",
      }),
    ]);
    const d = await oeffne();
    const zeileTel = d.querySelector('[data-vorgaben="uebersprungen"] li[data-vorgabe="IT_TELEFON"]');
    expect(zeileTel?.getAttribute("data-grund")).toBe("ANGABE");
    expect(zeileTel?.textContent).toContain(MELDUNGEN_AUSGABEN.RUECKGABE_VORGABEN_UEBERSPRUNGEN.ANGABE);
    expect(zeileTel?.textContent).not.toContain("Wert");
    expect(grund()).toBeNull();
    await klicke(within(d).getByRole("button", { name: "Abbrechen" }));

    // Nur noch die Angabe: gesperrt, und der Grund behauptet keinen Wert.
    daten = katalog([daten.positionen[1]]);
    await zeigeTab();
    await klicke(screen.getAllByText("Rückgabe-Vorgaben übernehmen …").at(-1)!);
    expect(grund()).toBe(MELDUNGEN_AUSGABEN.RUECKGABE_VORGABEN_NICHTS_ZU_TUN);
    expect(grund()).not.toContain("Wert");
  });

  it("der Webhook-Hinweis des Servers steht unter der Meldung und bleibt stehen (kein Ablauf-Timer)", async () => {
    // Die Meldung verschwindet sonst nach 5 s (Erfolg) bzw. 9 s (Fehler) per setTimeout.
    const ablauf = (spy: jest.SpyInstance) => spy.mock.calls.filter(([, ms]) => ms === 5000 || ms === 9000).length;
    const spy = jest.spyOn(globalThis, "setTimeout");
    try {
      await oeffne();
      const hinweis = MELDUNGEN_AUSGABEN.RUECKGABE_VORGABEN_WEBHOOKS(1);
      schreibAntwort = { ok: true, koerper: { gesetzt: 1, uebersprungen: 0, meldung: "Übernommen.", hinweis } };
      spy.mockClear();
      await klicke(within(dialog()).getByRole("button", { name: "Vorgaben übernehmen" }));
      expect(seitentext()).toContain("Übernommen.");
      expect(document.querySelector("[data-meldung-hinweis]")?.textContent).toBe(hinweis);
      expect(ablauf(spy)).toBe(0);

      // Gegenprobe: ohne Hinweis läuft die Meldung wie bisher ab.
      await klicke(screen.getByText("Rückgabe-Vorgaben übernehmen …"));
      schreibAntwort = { ok: true, koerper: { gesetzt: 0, uebersprungen: 1, meldung: "Nichts geändert." } };
      spy.mockClear();
      await klicke(within(dialog()).getByRole("button", { name: "Vorgaben übernehmen" }));
      expect(document.querySelector("[data-meldung-hinweis]")).toBeNull();
      expect(ablauf(spy)).toBe(1);
    } finally {
      spy.mockRestore();
    }
  });

  it("nichts zu tun: gesperrt mit Grund; Fehler des Servers bleibt im Dialog", async () => {
    daten = katalog([position({ id: "p-laptop", bezeichnung: "Laptop", vorschlagSchluessel: "IT_LAPTOP", beiAustritt: "RUECKGABE", rueckgabeKategorie: "IT_HARDWARE" })]);
    await oeffne();
    expect(grund()).toBe(MELDUNGEN_AUSGABEN.RUECKGABE_VORGABEN_NICHTS_ZU_TUN);
    await klicke(within(dialog()).getByRole("button", { name: "Abbrechen" }));

    daten = katalog();
    await zeigeTab();
    await klicke(screen.getAllByText("Rückgabe-Vorgaben übernehmen …").at(-1)!);
    expect(grund()).toBeNull();
    schreibAntwort = { ok: false, koerper: { error: "Interner Serverfehler" } };
    await klicke(within(dialog()).getByRole("button", { name: "Vorgaben übernehmen" }));
    expect(dialog().querySelector('[data-zeile="fehler"]')?.textContent).toBe("Interner Serverfehler");
  });
});

describe("Vorschläge übernehmen", () => {
  it("zeigt die Vorschau mit „schon im Katalog“ und meldet den Satz des Servers", async () => {
    await zeigeTab();
    await klicke(screen.getByText("Vorschläge übernehmen…"));
    const d = dialog();
    expect(d.querySelectorAll("li[data-vorschlag]")).toHaveLength(VORSCHLAEGE.length);
    expect(d.querySelector('li[data-vorschlag="IT_IPAD"]')?.textContent).toContain("schon im Katalog");
    expect(d.querySelector('li[data-vorschlag="IT_LAPTOP"]')?.textContent).not.toContain("schon im Katalog");
    expect(d.querySelector('[data-vorschlaege="IT"]')?.textContent).toContain("IT-Support FES");
    // Die Pflegeanweisung steht hier — nicht als Hinweis im Formular der Führungskraft.
    expect(d.querySelector('li[data-vorschlag="FACILITY_SCHLUESSEL"] [data-vorschlag-hinweis]')?.textContent).toBe(
      "Räume einer Einrichtung bitte als eigene Position dieser Einrichtung anlegen.",
    );
    expect(d.querySelectorAll("[data-vorschlag-hinweis]")).toHaveLength(1);

    const meldung = "14 Vorschläge übernommen – ausgeschaltet. Bitte prüfen, Fälligkeiten eintragen und einschalten, was passt. 1 stand schon im Katalog.";
    schreibAntwort = { ok: true, koerper: { angelegt: 14, vorhanden: 1, meldung } };
    const vorher = ladeAufrufe();
    await klicke(within(d).getByRole("button", { name: `${VORSCHLAEGE.length - 1} Vorschläge übernehmen` }));
    expect(schreibend()).toEqual([{ url: "/api/settings/ausstattung/vorschlaege", method: "POST", body: null }]);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(seitentext()).toContain(meldung);
    expect(ladeAufrufe()).toBe(vorher + 1);
  });

  it("alles schon da: gesperrt mit Grund", async () => {
    daten = katalog(
      VORSCHLAEGE.map((v, i) => position({ id: `v-${i}`, bezeichnung: v.bezeichnung, vorschlagSchluessel: v.vorschlagSchluessel })),
    );
    await zeigeTab();
    await klicke(screen.getByText("Vorschläge übernehmen…"));
    expect(grund()).toBe(MELDUNGEN.VORSCHLAEGE_ALLE_VORHANDEN);
  });

  it("Fehler des Servers bleibt im Dialog", async () => {
    await zeigeTab();
    await klicke(screen.getByText("Vorschläge übernehmen…"));
    schreibAntwort = { ok: false, koerper: { error: "Interner Serverfehler" } };
    await klicke(within(dialog()).getByRole("button", { name: /Vorschläge übernehmen$/ }));
    expect(dialog().querySelector('[data-zeile="fehler"]')?.textContent).toBe("Interner Serverfehler");
  });
});

// =============================================
// 9. Barrierefreiheit
// =============================================

describe("Barrierefreiheit", () => {
  /**
   * Was ein Browser mit dem Fokus eines gesperrten Knopfs tut: Er faellt auf
   * body. jsdom laesst ihn auf dem Knopf und nimmt auch `blur()` an einem
   * gesperrten Element nicht an — deshalb ein Hilfsfeld, das den Fokus
   * uebernimmt und wieder verschwindet.
   */
  function fokusAnBody() {
    const hilfe = document.createElement("input");
    document.body.appendChild(hilfe);
    hilfe.focus();
    hilfe.remove();
  }

  /**
   * Zeilenaktion mit angehaltener Anfrage: Klick, dann faellt der Fokus (wie im
   * Browser) auf body, dann antwortet der Server und die Liste laedt neu.
   */
  async function zeilenAktionAngehalten(knopf: HTMLButtonElement) {
    let freigeben!: () => void;
    schreibSperre = new Promise<void>((r) => {
      freigeben = r;
    });
    knopf.focus();
    await act(async () => {
      fireEvent.click(knopf);
    });
    expect(knopf.disabled).toBe(true);
    fokusAnBody();
    expect(document.activeElement).toBe(document.body);
    // Ein zweiter Klick waehrend der Anfrage schickt nichts.
    await act(async () => {
      fireEvent.click(knopf);
    });
    await act(async () => {
      freigeben();
      await new Promise((r) => setTimeout(r, 0));
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(schreibend()).toHaveLength(1);
  }

  it("Zeilenknöpfe: der zugängliche Name beginnt mit dem sichtbaren Text und nennt die Position (WCAG 2.5.3)", async () => {
    await zeigeTab();
    aendere(screen.getByLabelText("Einrichtung"), GS);
    const z = zeile("p-kopier")!;
    for (const name of [
      "Bearbeiten „Kopierkarte“",
      "Ausschalten „Kopierkarte“",
      "Hier ausblenden „Kopierkarte“ für Grundschule Haddenhausen",
      "Löschen „Kopierkarte“",
    ]) {
      expect(within(z).getByRole("button", { name })).toBeTruthy();
    }
    // Kein aria-label mehr, das vom sichtbaren Text abweicht.
    for (const knopf of Array.from(z.querySelectorAll("button"))) expect(knopf.hasAttribute("aria-label")).toBe(false);
    expect(sichtbarerText(knopfIn(z, "Hier ausblenden"))).toBe("Hier ausblenden");
  });

  it("Ein-/Ausschalten: während der Anfrage gesperrt, danach Fokus zurück auf den Knopf", async () => {
    await zeigeTab();
    schreibAntwort = { ok: true, koerper: { data: { ...SCHLUESSEL, isActive: true } } };
    daten = katalog([IPAD, ZUGAENGE, KOPIERKARTE, { ...SCHLUESSEL, isActive: true }]);
    await zeilenAktionAngehalten(knopfIn(zeile("p-schluessel")!, "Einschalten"));
    const nachher = knopfIn(zeile("p-schluessel")!, "Ausschalten");
    expect(nachher.disabled).toBe(false);
    expect(document.activeElement).toBe(nachher);
  });

  it("Ausblenden: auch nach einem Fehler Fokus zurück auf den Knopf", async () => {
    await zeigeTab();
    aendere(screen.getByLabelText("Einrichtung"), GS);
    schreibAntwort = { ok: false, koerper: { error: "Interner Serverfehler" } };
    await zeilenAktionAngehalten(knopfIn(zeile("p-kopier")!, "Hier ausblenden"));
    expect(document.querySelector('[data-meldung="fehler"]')?.textContent).toBe("Interner Serverfehler");
    expect(document.activeElement).toBe(knopfIn(zeile("p-kopier")!, "Hier ausblenden"));
  });

  it("verschwindet die Zeile nach der Aktion, geht der Fokus auf den Satz über der Liste", async () => {
    await zeigeTab();
    // Inzwischen hat jemand die Position gelöscht; die neue Liste kennt sie nicht mehr.
    schreibAntwort = { ok: false, status: 404, koerper: { error: MELDUNGEN.POSITION_NICHT_GEFUNDEN } };
    daten = katalog([ZUGAENGE, KOPIERKARTE, SCHLUESSEL]);
    await zeilenAktionAngehalten(knopfIn(zeile("p-ipad")!, "Ausschalten"));
    expect(zeile("p-ipad")).toBeNull();
    expect(document.activeElement?.id).toBe("ausstattung-katalog-titel");
  });

  it("Dialog: Pflichtfelder mit required und aria-required, Hilfetexte per aria-describedby", async () => {
    await zeigeTab();
    await klicke(screen.getByText("+ Position"));
    const d = dialog();
    const beschreibung = (feld: HTMLElement) =>
      (feld.getAttribute("aria-describedby") ?? "")
        .split(" ")
        .filter(Boolean)
        .map((id) => document.getElementById(id)?.textContent ?? `(fehlt: ${id})`)
        .join(" | ");

    const stelle = within(d).getByLabelText(/^Stelle/) as HTMLSelectElement;
    const bezeichnung = within(d).getByLabelText(/^Bezeichnung/) as HTMLInputElement;
    for (const feld of [stelle, bezeichnung]) {
      expect(feld.required).toBe(true);
      expect(feld.getAttribute("aria-required")).toBe("true");
    }
    expect(beschreibung(stelle)).toContain("Personalabteilung (HR)");
    expect(beschreibung(within(d).getByLabelText(/^Fällig/))).toBe(
      "Relativ zum Vertragsbeginn, negativ = vorher. Leer = ohne Fälligkeit, dann gibt es keine Erinnerung.",
    );
    expect(beschreibung(within(d).getByLabelText(/^Art$/))).toContain("Die Führungskraft hakt an");
    expect(beschreibung(within(d).getByLabelText(/^Aufgabe für die Stelle/))).toContain("Titel der Aufgabe");
    expect(beschreibung(within(d).getByLabelText("Gilt für"))).toContain("zentrale Position");
    expect(beschreibung(within(d).getByLabelText("Reihenfolge"))).toContain("kleinere Zahlen");
    expect(beschreibung(within(d).getByLabelText("Hinweis für die Führungskraft"))).toBe(
      "Steht im Formular unter der Position.",
    );
    const personengruppen = d.querySelector('[data-chips="personengruppen"]') as HTMLElement;
    expect(beschreibung(personengruppen)).toBe("Keine Auswahl = alle Personengruppen.");
    // Nicht-Pflichtfelder sind nicht als Pflicht markiert.
    expect((within(d).getByLabelText(/^Fällig/) as HTMLInputElement).required).toBe(false);

    aendere(within(d).getByLabelText(/^Art$/), "AUSWAHL");
    const optionen = within(d).getByLabelText(/^Optionen/) as HTMLTextAreaElement;
    expect(optionen.required).toBe(true);
    expect(optionen.getAttribute("aria-required")).toBe("true");
    expect(beschreibung(optionen)).toContain("Je gewählter Option entsteht eine Aufgabe.");

    aendere(within(d).getByLabelText(/^Art$/), "ANGABE");
    const angabe = within(d).getByLabelText(/^Angabe/) as HTMLSelectElement;
    expect(angabe.required).toBe(true);
    expect(angabe.getAttribute("aria-required")).toBe("true");
    expect(beschreibung(angabe)).toContain("Datenschutz");
  });
});

// =============================================
// 8. Reine Helfer des Dialogs, Importe
// =============================================

describe("Formular des Dialogs", () => {
  const ohneSchalter = (p: KatalogPosition) => {
    const { isActive: _aus, ...rest } = katalogWerte(p);
    return rest;
  };

  it.each([
    ["Ja/Nein", IPAD],
    ["Auswahl", ZUGAENGE],
    ["Auswahl einer Einrichtung", SCHLUESSEL],
    [
      "Angabe",
      position({
        id: "p-faecher",
        departmentKey: "FACILITY",
        art: "ANGABE",
        angabeSchluessel: "UNTERRICHTSFAECHER",
        bezeichnung: "Unterrichtsfächer",
        bemerkungAnbieten: false,
        sichtbarFuer: ["IT"],
      }),
    ],
  ])("%s: Formular aus der Position ergibt wieder dieselben Werte", (_name, p) => {
    expect(entwurfAusFormular(formularAusPosition(p))).toEqual(ohneSchalter(p));
  });

  it("was zur Art nicht passt, geht leer hinaus — getippte Werte bleiben im Formular", () => {
    const f = { ...formularAusPosition(ZUGAENGE), art: "JA_NEIN" as const, vorausgewaehlt: true };
    expect(entwurfAusFormular(f)).toMatchObject({
      optionen: [],
      vorausgewaehlteOptionen: [],
      vorausgewaehlt: true,
      aufgabeTitel: "Zugang einrichten",
    });
    expect(f.optionenText).toBe("Dienst-E-Mail\nSchulportal\nWebUntis");
    // Bemerkung aus: kein Platzhalter.
    expect(
      entwurfAusFormular({ ...leeresFormular(), bemerkungAnbieten: false, bemerkungPlatzhalter: "z. B. Farbe" })
        .bemerkungPlatzhalter,
    ).toBeNull();
    // „Sichtbar auch für“ ohne die eigene Stelle.
    expect(
      entwurfAusFormular({ ...leeresFormular({ departmentKey: "IT" }), art: "ANGABE", sichtbarFuer: ["IT", "FACILITY"] })
        .sichtbarFuer,
    ).toEqual(["FACILITY"]);
  });

  it("ganzzahlAusText: leer = null, Minuszeichen, sonst NaN statt still zu runden", () => {
    expect(ganzzahlAusText("")).toBeNull();
    expect(ganzzahlAusText("  ")).toBeNull();
    expect(ganzzahlAusText("−5")).toBe(-5);
    expect(ganzzahlAusText("–7")).toBe(-7);
    expect(ganzzahlAusText(" +3 ")).toBe(3);
    expect(ganzzahlAusText("1.5")).toBeNaN();
    expect(ganzzahlAusText("abc")).toBeNaN();
  });

  it("optionenAusText: eine je Zeile, getrimmt, ohne Leerzeilen", () => {
    expect(optionenAusText(" A \r\n\r\nB\rC\n  ")).toEqual(["A", "B", "C"]);
    expect(optionenAusText("")).toEqual([]);
  });

  it("leeres Formular: Reihenfolge 0, Bemerkung angeboten, sonst leer", () => {
    expect(entwurfAusFormular(leeresFormular())).toMatchObject({
      departmentKey: "",
      organizationId: null,
      bezeichnung: "",
      bemerkungAnbieten: true,
      orderIndex: 0,
    });
  });
});

describe("Importe (client-sicher)", () => {
  function importe(datei: string): string[] {
    const quelle = fs.readFileSync(path.join(process.cwd(), datei), "utf8");
    return [...quelle.matchAll(/^\s*import\s[^;]*?from\s+"([^"]+)"/gm)].map((m) => m[1]);
  }

  it.each(["src/components/ausstattung/katalog-tab.tsx", "src/components/ausstattung/position-dialog.tsx"])(
    "%s importiert Werte nur aus reinen Dateien",
    (datei) => {
      const erlaubt = [
        "react",
        "lucide-react",
        "@/lib/ausstattung",
        // S23: die reinen Regeln von A4 (Rechnung der Rückgabe-Vorgaben, Meldungen) — ohne Prisma.
        "@/lib/ausgaben",
        "@/components/unterlagen/dialog-rahmen",
        "@/components/ausstattung/position-dialog",
      ];
      expect(importe(datei).filter((modul) => !erlaubt.includes(modul))).toEqual([]);
    },
  );
});
