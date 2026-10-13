/**
 * @jest-environment jsdom
 */

/**
 * Karte „Ausstattung & Zugänge“: die Ausgaben je Aufgabe
 * (src/components/ausgaben/ausgaben-zeile.tsx), ihre Dialoge
 * (ausgaben-dialoge.tsx) und die Einbindung in die Karte
 * (src/components/ausstattung/ausstattung-karte.tsx) — Paket A4, Feinplan
 * S26, G7, G19, G20.
 *
 * Belegt wird, was nur die Oberfläche zeigt:
 *   1. Anzeige: Stücke mit und ohne Kennung (Zugang „eingerichtet“), frühere
 *      grau mit Zustand; gelb „Übergabe nicht vermerkt“ nur an einer erledigten
 *      Aufgabe, mit Löschmerker stattdessen grau „Ausgaben … gelöscht“; ohne
 *      „Beim Austritt“ (A4 aus) bleibt die Karte unverändert.
 *   2. Aktionen nur mit Recht — auch bei COMPLETED (NUR_LESEN), dann mit einem
 *      Satz dazu; ein an einen Austritt gebundenes Stück nennt seinen Grund.
 *   3. Dialoge: Body je Aktion (alle durch das echte Schema der Route), Tausch
 *      mit Pflichtgrund und Hinweis zur Gebäudewirtschaft, Zurücknehmen
 *      (Zugang nur „gesperrt“), Korrigieren nur mit Änderung, Entfernen mit
 *      Rückfrage, Fehlertext des Servers bleibt im Dialog.
 *   4. Protokollzeile „fehlt“ bzw. „hochgeladen am …“, nur mit Stücken, die
 *      zurückkommen.
 *   5. Aufruf der Route (`ausgabenAktionSenden`) und Verdrahtung in der
 *      Detailseite: ein abgeschlossener Vorgang, eine Übergabe nachgetragen.
 *
 * Die Übersicht kommt aus den echten reinen Funktionen
 * (`ausstattungsUebersichtBauen`, `ausgabenAnzeigeBauen`, `protokollAnzeige`) —
 * so, wie der Server sie baut; deren Regeln halten ausstattung.test.ts und
 * ausgaben.test.ts. Datumswerte liegen in der Vergangenheit, damit die Dialoge
 * (heute = Uhr des Browsers) sie nicht als „in der Zukunft“ sperren.
 */
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import {
  AusstattungKarte,
  ausgabenAktionSenden,
  type AusstattungAktionsAusgang,
} from "@/components/ausstattung/ausstattung-karte";
import {
  AUSGABE_ART_TEXTE,
  AUSGABEN_DIALOG_TEXTE,
  RUECKNAHME_WAHL,
  TAUSCH_WAHL,
  datumGrund,
  entfernenBody,
  gebaeudewirtschaftNoetig,
  kennungGrund,
  korrigierenBody,
  korrigierenGrund,
  korrigierenStart,
  stueckBody,
  tauschenBody,
  tauschenGrund,
  tauschenStart,
  vermerkenBody,
  vermerkenGrund,
  vermerkenMaxStuecke,
  zuruecknehmenBody,
  type AusgabenAktionBody,
} from "@/components/ausgaben/ausgaben-dialoge";
import { AUSGABEN_ZEILE_TEXTE, hatAusgabenFelder } from "@/components/ausgaben/ausgaben-zeile";
import { bearbeitenGrund, bearbeitenStart, festeOptionen } from "@/components/ausstattung/ausstattung-dialoge";
import { DetailContent, type DetailData } from "@/app/(portal)/dashboard/[id]/detail-content";
import { ausgabenAktionSchema } from "@/lib/validations/ausgaben";
import {
  MELDUNGEN_AUSGABEN,
  ausgabenAnzeigeBauen,
  ausgabenMitRueckgabe,
  protokollAnzeige,
  protokollStand,
  type AusgabeStand,
  type AusgabeZeilenDaten,
  type AustrittsBezug,
} from "@/lib/ausgaben";
import {
  MELDUNGEN,
  ausstattungsUebersichtBauen,
  type AusstattungsUebersicht,
  type UebersichtAufgabeDaten,
  type UebersichtVerknuepfung,
  type UebersichtVorgangStand,
  type UebersichtZeileDaten,
} from "@/lib/ausstattung";
import { heuteInBerlin, tageSpaeter } from "@/lib/kalendertag";

// React 19 verlangt diese Marke, bevor act() Zustandsaenderungen einsammeln darf.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children, className }: { href: string; children?: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), refresh: jest.fn() }),
  usePathname: () => "/dashboard/onb-1",
}));

// Nachbarn mit eigenem Netzverkehr — fuer die Verdrahtung ohne Belang.
jest.mock("@/components/portal-header", () => ({
  PortalHeader: () => <header data-testid="portal-header" />,
}));
jest.mock("@/components/dokumentenpaket-section", () => ({
  DokumentenpaketSection: () => <section data-testid="dokumentenpaket" />,
}));
jest.mock("@/components/template-generation-section", () => ({
  TemplateGenerationSection: () => <section data-testid="vorlagen" />,
}));
jest.mock("@/components/individuelle-mail/individuelle-mail-karte", () => ({
  IndividuelleMailKarte: () => <section data-testid="individuelle-mail" />,
}));

// =============================================
// Fixtur — Einstellung mit Dienstbeginn 01.02.2026, betrachtet am 10.02.2026
// =============================================

const JETZT = new Date("2026-02-10T09:00:00.000Z");
const ORT = "org-gym";
const HEUTE = heuteInBerlin();

function zeile(teil: Partial<UebersichtZeileDaten> & { id: string }): UebersichtZeileDaten {
  return {
    positionId: null,
    departmentKey: "IT",
    art: "JA_NEIN",
    angabeSchluessel: null,
    bezeichnung: "Position",
    sichtbarFuer: [],
    reihenfolge: 0,
    auswahl: [],
    angabe: null,
    bemerkung: null,
    bemerkungQuelle: null,
    quelle: "FUEHRUNGSKRAFT",
    erfasstVonId: null,
    gestrichenAm: null,
    createdAt: "2026-01-14T09:30:00.000Z",
    relativeDueDays: null,
    ...teil,
  };
}

const ZEILEN: UebersichtZeileDaten[] = [
  zeile({ id: "z-ipad", positionId: "pos-ipad", bezeichnung: "Dienst-iPad (Lernmittel)" }),
  zeile({ id: "z-zug", positionId: "pos-zug", art: "AUSWAHL", bezeichnung: "Zugänge", auswahl: ["Dienst-E-Mail"], reihenfolge: 1 }),
  zeile({ id: "z-tel", positionId: "pos-tel", bezeichnung: "Telefon mit Durchwahl", reihenfolge: 2 }),
  zeile({ id: "z-laptop", positionId: "pos-laptop", bezeichnung: "Dienst-Laptop / PC", reihenfolge: 3 }),
  zeile({
    id: "z-schl",
    positionId: "pos-schl",
    departmentKey: "FACILITY",
    art: "AUSWAHL",
    bezeichnung: "Schlüssel",
    auswahl: ["Haupteingang", "Lehrerzimmer"],
  }),
  zeile({ id: "z-park", positionId: "pos-park", departmentKey: "VERWALTUNG", bezeichnung: "Parkplatz" }),
];

/** Die A4-Felder der Momentaufnahme je Zeile (der Server liest sie aus `OnboardingAusstattung`). */
const A4: Record<string, { beiAustritt: string | null; rueckgabeKategorie: string | null; ausgabeKennung: string | null }> = {
  "z-ipad": { beiAustritt: "RUECKGABE", rueckgabeKategorie: "IT_HARDWARE", ausgabeKennung: "Inventarnummer" },
  "z-zug": { beiAustritt: "SPERREN", rueckgabeKategorie: null, ausgabeKennung: null },
  "z-tel": { beiAustritt: "RUECKGABE", rueckgabeKategorie: "IT_HARDWARE", ausgabeKennung: "Inventarnummer" },
  "z-laptop": { beiAustritt: "RUECKGABE", rueckgabeKategorie: "IT_HARDWARE", ausgabeKennung: "Inventarnummer" },
  "z-schl": { beiAustritt: "RUECKGABE", rueckgabeKategorie: "SCHLUESSEL", ausgabeKennung: "Schlüsselnummer" },
  "z-park": { beiAustritt: "NICHTS", rueckgabeKategorie: null, ausgabeKennung: null },
};

type TestAufgabe = UebersichtAufgabeDaten & { ausgabenGeloeschtAm?: string | null };

const AUFGABEN: TestAufgabe[] = [
  { id: "i-ipad", title: "Dienst-iPad (Lernmittel) bereitstellen", isCompleted: true, completedAt: "2026-01-28T09:00:00.000Z" },
  { id: "i-mail", title: "Zugang einrichten: Dienst-E-Mail", isCompleted: true, completedAt: "2026-01-20T09:00:00.000Z" },
  {
    id: "i-tel",
    title: "Telefon mit Durchwahl bereitstellen",
    isCompleted: true,
    completedAt: "2026-01-22T09:00:00.000Z",
    ausgabenGeloeschtAm: "2026-02-01T02:00:00.000Z",
  },
  { id: "i-laptop", title: "Dienst-Laptop / PC bereitstellen", isCompleted: false },
  { id: "i-haupt", title: "Schlüssel ausgeben: Haupteingang", isCompleted: true, completedAt: "2026-01-29T09:00:00.000Z" },
  { id: "i-lehrer", title: "Schlüssel ausgeben: Lehrerzimmer", isCompleted: true, completedAt: "2026-01-29T10:00:00.000Z" },
  { id: "i-park", title: "Parkplatz bereitstellen", isCompleted: true, completedAt: "2026-01-21T09:00:00.000Z" },
];

const VERKNUEPFUNGEN: UebersichtVerknuepfung[] = [
  { ausstattungId: "z-ipad", option: "", checklistItemId: "i-ipad" },
  { ausstattungId: "z-zug", option: "Dienst-E-Mail", checklistItemId: "i-mail" },
  { ausstattungId: "z-tel", option: "", checklistItemId: "i-tel" },
  { ausstattungId: "z-laptop", option: "", checklistItemId: "i-laptop" },
  { ausstattungId: "z-schl", option: "Haupteingang", checklistItemId: "i-haupt" },
  { ausstattungId: "z-schl", option: "Lehrerzimmer", checklistItemId: "i-lehrer" },
  { ausstattungId: "z-park", option: "", checklistItemId: "i-park" },
];

type TestAusgabe = AusgabeZeilenDaten & { checklistItemId: string | null };

function ausgabe(teil: Partial<TestAusgabe> & { id: string; checklistItemId: string }): TestAusgabe {
  return {
    zustand: "AUSGEGEBEN",
    beiAustritt: "RUECKGABE",
    kennung: null,
    kennungLabel: "Inventarnummer",
    uebergebenAm: "2026-01-28T00:00:00.000Z",
    quelle: "LINK",
    bezuege: [],
    ...teil,
  };
}

// In der Reihenfolge der Abfrage (Uebergabe, dann Anlage).
const AUSGABEN: TestAusgabe[] = [
  ausgabe({ id: "a-ipad-alt", checklistItemId: "i-ipad", zustand: "ERSETZT", kennung: "FES-IPAD-0100", quelle: "HR", uebergebenAm: "2026-01-20T00:00:00.000Z" }),
  ausgabe({ id: "a-mail", checklistItemId: "i-mail", beiAustritt: "SPERREN", kennungLabel: null, uebergebenAm: "2026-01-20T00:00:00.000Z" }),
  ausgabe({ id: "a-ipad", checklistItemId: "i-ipad", kennung: "FES-IPAD-0412" }),
  ausgabe({ id: "a-haupt", checklistItemId: "i-haupt", kennungLabel: "Schlüsselnummer", quelle: "HR", uebergebenAm: "2026-01-29T00:00:00.000Z" }),
];

const KONFIGS = [
  { departmentKey: "IT", departmentName: "IT-Abteilung", email: "it@fes-minden.de", organizationId: null, isActive: true },
  { departmentKey: "FACILITY", departmentName: "Facility Management", email: "hausmeister@fes-minden.de", organizationId: null, isActive: true },
  { departmentKey: "VERWALTUNG", departmentName: "Verwaltung / Sekretariat", email: "sekretariat@fes-minden.de", organizationId: null, isActive: true },
];

function vorgang(teil: Partial<UebersichtVorgangStand> = {}): UebersichtVorgangStand {
  return {
    status: "SUPERVISOR_SUBMITTED",
    supervisorSubmittedAt: "2026-01-14T09:30:00.000Z",
    supervisorData: { isComplete: true, mitAusstattung: true, vertragsbeginn: "2026-02-01T00:00:00.000Z" },
    ...teil,
  };
}

/** Wie der Server (`kartenAusgabenLaden`): Ausgaben je Aufgabe und, nur mit Stuecken, die zurueckkommen, die Protokollzeile. */
function uebersicht(
  teil: {
    status?: string;
    ausgaben?: TestAusgabe[];
    aufgaben?: TestAufgabe[];
    dokumente?: { uploadedAt: string }[];
    mitA4?: boolean;
    darfBearbeiten?: boolean;
  } = {},
): AusstattungsUebersicht {
  const ausgaben = teil.ausgaben ?? AUSGABEN;
  const aufgaben = teil.aufgaben ?? AUFGABEN;
  const mitA4 = teil.mitA4 ?? true;
  const mitRueckgabe = ausgabenMitRueckgabe(ausgaben);
  return ausstattungsUebersichtBauen({
    vorgang: vorgang(teil.status ? { status: teil.status } : {}),
    darfBearbeiten: teil.darfBearbeiten ?? true,
    zeilen: ZEILEN,
    hinweise: [],
    arbeitsortId: ORT,
    konfigs: KONFIGS,
    katalog: null,
    aufgaben,
    verknuepfungen: VERKNUEPFUNGEN,
    jetzt: JETZT,
    ...(mitA4
      ? {
          ausgabenJeAufgabe: ausgabenAnzeigeBauen({
            zeilen: ZEILEN.map((z) => ({ ...z, ...A4[z.id] })),
            verknuepfungen: VERKNUEPFUNGEN,
            aufgaben,
            ausgaben,
            darfBearbeiten: true,
          }),
          protokoll:
            mitRueckgabe === 0
              ? null
              : protokollAnzeige("UEBERGABE", protokollStand({ ausgabenMitRueckgabe: mitRueckgabe, dokumente: teil.dokumente ?? [] })),
        }
      : {}),
  });
}

const OK: AusstattungAktionsAusgang = { ok: true, status: 200, meldung: "Übergabe vermerkt." };

function karte(
  u: AusstattungsUebersicht = uebersicht(),
  opts: { darfBearbeiten?: boolean; ausgang?: AusstattungAktionsAusgang; ohneAusgabenAktion?: boolean } = {},
) {
  const onAktion = jest.fn(async () => OK);
  const onAusgabenAktion = jest.fn(async (body: AusgabenAktionBody) => {
    void body;
    return opts.ausgang ?? OK;
  });
  render(
    <AusstattungKarte
      uebersicht={u}
      darfBearbeiten={opts.darfBearbeiten ?? true}
      onAktion={onAktion}
      onAusgabenAktion={opts.ohneAusgabenAktion ? undefined : onAusgabenAktion}
    />,
  );
  return { onAktion, onAusgabenAktion };
}

const kartenEl = () => document.querySelector('[data-karte="ausstattung-checkliste"]') as HTMLElement;
const ausgabenEl = (aufgabeId: string) => document.querySelector(`[data-ausgaben="${aufgabeId}"]`) as HTMLElement | null;
const stueckEl = (id: string) => document.querySelector(`[data-ausgabe="${id}"]`) as HTMLElement;
const dialog = () => screen.getByRole("dialog");
const knopf = (wo: HTMLElement, name: RegExp | string) => within(wo).getByRole("button", { name });
const knopfNamen = (wo: HTMLElement | null) =>
  wo ? within(wo).queryAllByRole("button").map((b) => b.textContent ?? "") : [];

async function klick(el: HTMLElement) {
  await act(async () => {
    fireEvent.click(el);
  });
}

function eingeben(el: HTMLElement, wert: string) {
  fireEvent.change(el, { target: { value: wert } });
}

function bodies(onAusgabenAktion: jest.Mock): AusgabenAktionBody[] {
  return onAusgabenAktion.mock.calls.map((c) => c[0] as AusgabenAktionBody);
}

/** Ein Stueck, wie die Karte es bekommt (fuer die reinen Regeln). */
function stand(id: string): AusgabeStand {
  for (const g of uebersicht().gruppen) {
    for (const z of g.zeilen) {
      for (const a of z.aufgaben) {
        const s = a.ausgaben?.find((x) => x.id === id);
        if (s) return s;
      }
    }
  }
  throw new Error(`Stück ${id} fehlt in der Fixtur`);
}

// =============================================
// 1. Anzeige je Aufgabe
// =============================================

describe("Anzeige je Aufgabe", () => {
  it("Stücke mit und ohne Kennung, ein Zugang „eingerichtet“, frühere grau mit Zustand", () => {
    karte();
    expect(stueckEl("a-ipad").textContent).toContain("übergeben 28.01.2026 · FES-IPAD-0412 · über den Link");
    expect(stueckEl("a-ipad-alt").textContent).toContain("übergeben 20.01.2026 · FES-IPAD-0100 · von HR vermerkt · ersetzt");
    expect(stueckEl("a-ipad-alt").dataset.ausgabeZustand).toBe("ERSETZT");
    expect(stueckEl("a-ipad-alt").querySelector(".text-muted-foreground")?.textContent).toContain("ersetzt");
    expect(stueckEl("a-haupt").textContent).toContain("übergeben 29.01.2026 · von HR vermerkt");
    expect(stueckEl("a-mail").textContent).toContain("eingerichtet 20.01.2026 · über den Link");
    // Die Ausgaben stehen unter der Option, nicht an der Zeile.
    expect(document.querySelector('[data-option="Haupteingang"] [data-ausgabe="a-haupt"]')).not.toBeNull();
    expect(within(ausgabenEl("i-ipad")!).getByRole("list").getAttribute("aria-label")).toBe(
      AUSGABEN_ZEILE_TEXTE.liste("Dienst-iPad (Lernmittel)"),
    );
  });

  it("„Übergabe nicht vermerkt“ nur an einer erledigten Aufgabe; mit Löschmerker grau ohne Aufforderung", () => {
    karte();
    expect(ausgabenEl("i-lehrer")?.querySelector('[data-ausgaben-hinweis="gelb"]')?.textContent).toBe(
      MELDUNGEN_AUSGABEN.UEBERGABE_NICHT_VERMERKT,
    );
    // Offene Aufgabe ohne Vermerk: keine Aufforderung, nur „vermerken“.
    expect(ausgabenEl("i-laptop")?.querySelector("[data-ausgaben-hinweis]")).toBeNull();
    // Löschmerker: grau, keine gelbe Aufforderung — „vermerken“ bleibt eine gewöhnliche Aktion.
    const tel = ausgabenEl("i-tel")!;
    expect(tel.querySelector('[data-ausgaben-hinweis="grau"]')?.textContent).toBe(MELDUNGEN_AUSGABEN.AUSGABEN_GELOESCHT);
    expect(tel.querySelector('[data-ausgaben-hinweis="gelb"]')).toBeNull();
    expect(knopfNamen(tel)).toEqual(["Übergabe vermerken… Telefon mit Durchwahl"]);
    // Erledigte Aufgabe MIT Vermerk: kein Hinweis.
    expect(ausgabenEl("i-ipad")?.querySelector("[data-ausgaben-hinweis]")).toBeNull();
  });

  it("ein Zugang ohne Vermerk heißt „Einrichtung nicht vermerkt“ – wie der Knopf daneben (G4)", () => {
    karte(uebersicht({ ausgaben: AUSGABEN.filter((a) => a.id !== "a-mail") }));
    const mail = ausgabenEl("i-mail")!;
    expect(mail.querySelector('[data-ausgaben-hinweis="gelb"]')?.textContent).toBe(MELDUNGEN_AUSGABEN.EINRICHTUNG_NICHT_VERMERKT);
    expect(mail.textContent).not.toContain("Übergabe");
    expect(knopfNamen(mail)).toEqual(["Einrichtung vermerken… Zugänge: Dienst-E-Mail"]);
  });

  it("„Beim Austritt: nichts“ und A4 aus: kein Block, keine Protokollzeile — die Karte wie vorher", () => {
    karte();
    expect(ausgabenEl("i-park")).toBeNull();
    document.body.innerHTML = "";
    karte(uebersicht({ mitA4: false }));
    expect(document.querySelector("[data-ausgaben]")).toBeNull();
    expect(document.querySelector("[data-protokoll]")).toBeNull();
    expect(hatAusgabenFelder(uebersicht({ mitA4: false }))).toBe(false);
    expect(hatAusgabenFelder(uebersicht())).toBe(true);
  });
});

// =============================================
// 2. Aktionen und Recht (G7)
// =============================================

describe("Aktionen", () => {
  it("mit Recht: je Stück die Aktionen des Servers, je Aufgabe „Übergabe vermerken…“", () => {
    karte();
    expect(knopfNamen(stueckEl("a-ipad"))).toEqual([
      "Korrigieren… Dienst-iPad (Lernmittel) FES-IPAD-0412",
      "Tauschen… Dienst-iPad (Lernmittel) FES-IPAD-0412",
      "Zurückgenommen… Dienst-iPad (Lernmittel) FES-IPAD-0412",
      "Entfernen… Dienst-iPad (Lernmittel) FES-IPAD-0412",
    ]);
    // Ein ersetztes Stück ist endgültig.
    expect(knopfNamen(stueckEl("a-ipad-alt"))).toEqual([]);
    // Ein Zugang heißt „Gesperrt…“ und „Einrichtung vermerken…“ – und wird nie getauscht
    // (ein „verlorener“ Zugang wäre „fehlt“, was „Gesperrt…“ ausschließt; 1.2).
    expect(knopfNamen(stueckEl("a-mail"))).toEqual([
      "Korrigieren… Zugänge: Dienst-E-Mail",
      "Gesperrt… Zugänge: Dienst-E-Mail",
      "Entfernen… Zugänge: Dienst-E-Mail",
    ]);
    expect(knopfNamen(ausgabenEl("i-mail"))).toContain("Einrichtung vermerken… Zugänge: Dienst-E-Mail");
    expect(knopfNamen(ausgabenEl("i-laptop"))).toEqual(["Übergabe vermerken… Dienst-Laptop / PC"]);
  });

  it("auch bei COMPLETED (NUR_LESEN): nur die Ausgaben-Aktionen, dazu der Satz", () => {
    karte(uebersicht({ status: "COMPLETED" }));
    expect(kartenEl().dataset.zustand).toBe("NUR_LESEN");
    expect(kartenEl().textContent).toContain(MELDUNGEN.UEBERSICHT_ABGESCHLOSSEN);
    expect(kartenEl().querySelector('[data-satz="ausgaben"]')?.textContent).toBe(AUSGABEN_ZEILE_TEXTE.nachAbschluss);
    const namen = knopfNamen(kartenEl());
    expect(namen.some((n) => n.startsWith("Bearbeiten…") || n.startsWith("Streichen…"))).toBe(false);
    expect(namen).toContain("Übergabe vermerken… Dienst-Laptop / PC");
    expect(namen).toContain("Tauschen… Dienst-iPad (Lernmittel) FES-IPAD-0412");
  });

  it("auch nach der Absage (EXPIRED)", () => {
    karte(uebersicht({ status: "EXPIRED" }));
    expect(knopfNamen(ausgabenEl("i-laptop"))).toEqual(["Übergabe vermerken… Dienst-Laptop / PC"]);
  });

  it("ohne Recht bzw. ohne Aktion der Seite: keine Aktion, die Anzeige bleibt", () => {
    karte(uebersicht(), { darfBearbeiten: false });
    expect(within(kartenEl()).queryAllByRole("button")).toHaveLength(0);
    expect(stueckEl("a-ipad").textContent).toContain("FES-IPAD-0412");
    document.body.innerHTML = "";

    karte(uebersicht({ status: "COMPLETED" }), { ohneAusgabenAktion: true });
    expect(within(kartenEl()).queryAllByRole("button")).toHaveLength(0);
    expect(kartenEl().querySelector('[data-satz="ausgaben"]')).toBeNull();
    document.body.innerHTML = "";

    // Übersicht ohne Bearbeitungsrecht (`ausgabenBearbeitbar` falsch): ebenso.
    karte(uebersicht({ status: "COMPLETED", darfBearbeiten: false }));
    expect(within(kartenEl()).queryAllByRole("button")).toHaveLength(0);
  });

  it("gebunden an einen Austritt: keine Aktion, der Grund steht da — mit Vorgangsnummer nur bei Zugriff", () => {
    const laufend: AustrittsBezug = { offboardingId: "off-1", status: "IN_PROGRESS", displayId: "OFF-2026-GYM-004" };
    const fremd: AustrittsBezug = { offboardingId: "off-2", status: "IN_PROGRESS", displayId: null };
    const ausgaben = AUSGABEN.map((a) =>
      a.id === "a-ipad" ? { ...a, bezuege: [laufend] } : a.id === "a-haupt" ? { ...a, bezuege: [fremd] } : a,
    );
    karte(uebersicht({ ausgaben }));
    expect(knopfNamen(stueckEl("a-ipad"))).toEqual([]);
    expect(stueckEl("a-ipad").querySelector("[data-ausgabe-sperrgrund]")?.textContent).toBe(
      MELDUNGEN_AUSGABEN.AUSGABE_IM_AUSTRITT("OFF-2026-GYM-004"),
    );
    expect(stueckEl("a-haupt").querySelector("[data-ausgabe-sperrgrund]")?.textContent).toBe(
      MELDUNGEN_AUSGABEN.AUSGABE_IM_AUSTRITT(null),
    );
    // Ein abgebrochener Austritt bindet nie.
    document.body.innerHTML = "";
    karte(uebersicht({ ausgaben: AUSGABEN.map((a) => (a.id === "a-ipad" ? { ...a, bezuege: [{ ...laufend, status: "CANCELLED" }] } : a)) }));
    expect(knopfNamen(stueckEl("a-ipad"))).toHaveLength(4);
    expect(stueckEl("a-ipad").querySelector("[data-ausgabe-sperrgrund]")).toBeNull();
    // Ohne Recht kein Sperrgrund.
    document.body.innerHTML = "";
    karte(uebersicht({ ausgaben }), { darfBearbeiten: false });
    expect(stueckEl("a-ipad").querySelector("[data-ausgabe-sperrgrund]")).toBeNull();
  });
});

// =============================================
// 2a. „Bearbeiten…“ der Position: Regel 9 mit vermerkten Stücken (G5)
// =============================================

describe("„Bearbeiten…“ einer Position mit vermerktem Stück (G5)", () => {
  // Beide Schlüssel-Aufgaben noch offen; am Haupteingang ist trotzdem schon ein
  // Stück vermerkt (G4: vermerkt wird getrennt vom Abhaken).
  const OFFEN: TestAufgabe[] = AUFGABEN.map((a) =>
    a.id === "i-haupt" || a.id === "i-lehrer" ? { ...a, isCompleted: false, completedAt: null } : a,
  );
  const zeileEl = (id: string) => document.querySelector(`[data-zeile="${id}"]`) as HTMLElement;
  const schluesselZeile = (u: AusstattungsUebersicht) => u.gruppen.flatMap((g) => g.zeilen).find((z) => z.id === "z-schl")!;

  it("die Option mit aktivem Stück bleibt fest und nennt den Grund; die andere lässt sich abwählen", async () => {
    karte(uebersicht({ aufgaben: OFFEN }));
    await klick(knopf(zeileEl("z-schl"), /^Bearbeiten…/));
    const haupt = within(dialog()).getByRole("checkbox", { name: /^Haupteingang/ }) as HTMLInputElement;
    const lehrer = within(dialog()).getByRole("checkbox", { name: /^Lehrerzimmer/ }) as HTMLInputElement;
    expect(haupt.disabled).toBe(true);
    expect(haupt.closest("label")?.textContent).toContain(MELDUNGEN.AUSGABE_VORHANDEN);
    expect(lehrer.disabled).toBe(false);
  });

  it("Stellenwechsel: „Speichern“ gesperrt mit dem Grund des Servers, nichts geht hinaus", async () => {
    const { onAktion } = karte(uebersicht({ aufgaben: OFFEN }));
    await klick(knopf(zeileEl("z-schl"), /^Bearbeiten…/));
    eingeben(within(dialog()).getByLabelText(/^Zuständige Stelle/), "VERWALTUNG");
    expect(dialog().querySelector('[data-zeile="grund"]')?.textContent).toBe(MELDUNGEN.AUSGABE_VORHANDEN);
    await klick(within(dialog()).getByRole("button", { name: "Speichern" }));
    expect(onAktion).not.toHaveBeenCalled();
  });

  it("reine Regeln: `bearbeitenGrund` und `festeOptionen` lesen die aktiven Stücke – wie `aenderungPruefen` des Servers", () => {
    const zeile = schluesselZeile(uebersicht({ aufgaben: OFFEN }));
    const start = bearbeitenStart(zeile, "FACILITY");
    expect(bearbeitenGrund(zeile, "FACILITY", { ...start, auswahl: ["Lehrerzimmer"] })).toBe(MELDUNGEN.AUSGABE_VORHANDEN);
    expect(bearbeitenGrund(zeile, "FACILITY", { ...start, stelle: "VERWALTUNG" })).toBe(MELDUNGEN.AUSGABE_VORHANDEN);
    // Die offene Option ohne Stück lässt sich abwählen.
    expect(bearbeitenGrund(zeile, "FACILITY", { ...start, auswahl: ["Haupteingang"] })).toBeNull();
    expect(festeOptionen(zeile.aufgaben)).toEqual({ Haupteingang: MELDUNGEN.AUSGABE_VORHANDEN });
    // Ein zurückgenommenes Stück ist nicht mehr aktiv und sperrt nichts.
    const zurueck = schluesselZeile(
      uebersicht({ aufgaben: OFFEN, ausgaben: AUSGABEN.map((a) => (a.id === "a-haupt" ? { ...a, zustand: "ZURUECK" } : a)) }),
    );
    expect(festeOptionen(zurueck.aufgaben)).toEqual({});
    expect(bearbeitenGrund(zurueck, "FACILITY", { ...bearbeitenStart(zurueck, "FACILITY"), stelle: "VERWALTUNG" })).toBeNull();
    // Eine erledigte Aufgabe nennt weiter ihren Stand (erledigt geht vor, wie im Server).
    const erledigt = schluesselZeile(uebersicht());
    expect(festeOptionen(erledigt.aufgaben).Haupteingang).not.toBe(MELDUNGEN.AUSGABE_VORHANDEN);
  });
});

// =============================================
// 3. Dialoge
// =============================================

describe("Dialoge", () => {
  it("Vermerken: zwei Stück mit Kennung, Datum Vorgabe heute → Body; Erfolg schließt mit der Meldung des Servers", async () => {
    const { onAusgabenAktion } = karte();
    await klick(knopf(ausgabenEl("i-laptop")!, /^Übergabe vermerken…/));
    expect(dialog().textContent).toContain(AUSGABE_ART_TEXTE.RUECKGABE.vermerken);
    expect(dialog().textContent).toContain("Dienst-Laptop / PC · IT-Abteilung");
    const datum = within(dialog()).getByLabelText("Übergeben am") as HTMLInputElement;
    expect(datum.value).toBe(HEUTE);
    expect(datum.max).toBe(HEUTE);
    eingeben(within(dialog()).getByLabelText(/^Inventarnummer/), "  FES-NB-0007 ");
    await klick(knopf(dialog(), AUSGABEN_DIALOG_TEXTE.WEITERES_STUECK));
    const kennungen = within(dialog()).getAllByLabelText(/^Inventarnummer/);
    expect(kennungen).toHaveLength(2);
    expect(within(dialog()).getByLabelText("Übergeben am – Stück 2")).not.toBeNull();
    // Das neue Feld hat den Fokus.
    expect(document.activeElement).toBe(kennungen[1]);
    await klick(knopf(dialog(), "Übergabe speichern"));
    expect(bodies(onAusgabenAktion)).toEqual([
      {
        aktion: "vermerken",
        checklistItemId: "i-laptop",
        stuecke: [
          { kennung: "FES-NB-0007", uebergebenAm: HEUTE },
          { kennung: null, uebergebenAm: HEUTE },
        ],
      },
    ]);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(kartenEl().querySelector('[data-meldung="ok"]')?.textContent).toContain("Übergabe vermerkt.");
  });

  it("Vermerken: ein Stück weglassen, ein Datum in der Zukunft sperrt mit Grund", async () => {
    const { onAusgabenAktion } = karte();
    await klick(knopf(ausgabenEl("i-laptop")!, /^Übergabe vermerken…/));
    await klick(knopf(dialog(), AUSGABEN_DIALOG_TEXTE.WEITERES_STUECK));
    await klick(knopf(dialog(), AUSGABEN_DIALOG_TEXTE.STUECK_WEGLASSEN(2)));
    expect(within(dialog()).getAllByLabelText(/^Inventarnummer/)).toHaveLength(1);
    expect(document.activeElement?.textContent).toBe(AUSGABEN_DIALOG_TEXTE.WEITERES_STUECK);
    eingeben(within(dialog()).getByLabelText("Übergeben am"), tageSpaeter(HEUTE, 1));
    const speichern = knopf(dialog(), "Übergabe speichern") as HTMLButtonElement;
    expect(speichern.disabled).toBe(true);
    expect(dialog().querySelector('[data-zeile="grund"]')?.textContent).toBe(MELDUNGEN_AUSGABEN.DATUM_IN_ZUKUNFT);
    expect(onAusgabenAktion).not.toHaveBeenCalled();
  });

  it("der Fehlertext des Servers bleibt im offenen Dialog", async () => {
    const meldung = MELDUNGEN_AUSGABEN.AUSGABE_IM_AUSTRITT(null);
    karte(uebersicht(), { ausgang: { ok: false, status: 409, meldung } });
    await klick(knopf(stueckEl("a-ipad"), /^Entfernen…/));
    await klick(knopf(dialog(), AUSGABEN_DIALOG_TEXTE.ENTFERNEN));
    expect(screen.getByRole("dialog")).not.toBeNull();
    const fehler = dialog().querySelector('[data-zeile="fehler"]') as HTMLElement;
    expect(fehler.textContent).toBe(meldung);
    expect(fehler.getAttribute("role")).toBe("alert");
    expect(document.activeElement).toBe(fehler);
  });

  it("Tauschen: der Grund ist Pflicht; „Verloren“ bei einem Schlüssel zeigt den Hinweis zur Gebäudewirtschaft", async () => {
    const { onAusgabenAktion } = karte();
    await klick(knopf(stueckEl("a-haupt"), /^Tauschen…/));
    const tauschen = knopf(dialog(), AUSGABEN_DIALOG_TEXTE.TAUSCHEN) as HTMLButtonElement;
    expect(tauschen.disabled).toBe(true);
    expect(dialog().querySelector('[data-zeile="grund"]')?.textContent).toBe(MELDUNGEN_AUSGABEN.TAUSCH_GRUND_FEHLT);
    expect(within(dialog()).getByLabelText(/^Schlüsselnummer/)).not.toBeNull();

    await klick(within(dialog()).getByRole("radio", { name: new RegExp(`^${TAUSCH_WAHL.DEFEKT.label}`) }));
    expect(document.querySelector('[data-hinweis="gebaeudewirtschaft"]')).toBeNull();
    await klick(within(dialog()).getByRole("radio", { name: new RegExp(`^${TAUSCH_WAHL.VERLOREN.label}`) }));
    expect(document.querySelector('[data-hinweis="gebaeudewirtschaft"]')?.textContent).toBe(
      MELDUNGEN_AUSGABEN.GEBAEUDEWIRTSCHAFT_INFORMIEREN,
    );
    eingeben(within(dialog()).getByLabelText(/^Schlüsselnummer/), "S-118");
    await klick(knopf(dialog(), AUSGABEN_DIALOG_TEXTE.TAUSCHEN));
    expect(bodies(onAusgabenAktion)).toEqual([
      { aktion: "tauschen", ausgabeId: "a-haupt", grund: "VERLOREN", neu: { kennung: "S-118", uebergebenAm: HEUTE } },
    ]);
  });

  it("Tauschen: „Verloren“ bei einem Gerät ohne Hinweis", async () => {
    karte();
    await klick(knopf(stueckEl("a-ipad"), /^Tauschen…/));
    await klick(within(dialog()).getByRole("radio", { name: new RegExp(`^${TAUSCH_WAHL.VERLOREN.label}`) }));
    expect(document.querySelector('[data-hinweis="gebaeudewirtschaft"]')).toBeNull();
  });

  it("Zurückgenommen: Zustand Pflicht; „Fehlt“ eines Schlüssels zeigt den Hinweis", async () => {
    const { onAusgabenAktion } = karte();
    await klick(knopf(stueckEl("a-haupt"), /^Zurückgenommen…/));
    expect(dialog().textContent).toContain(AUSGABE_ART_TEXTE.RUECKGABE.zuruecknehmenTitel);
    expect((knopf(dialog(), AUSGABE_ART_TEXTE.RUECKGABE.zuruecknehmenTitel) as HTMLButtonElement).disabled).toBe(true);
    expect(dialog().querySelector('[data-zeile="grund"]')?.textContent).toBe(AUSGABEN_DIALOG_TEXTE.ZUSTAND_FEHLT);
    await klick(within(dialog()).getByRole("radio", { name: RUECKNAHME_WAHL.BESCHAEDIGT }));
    expect(document.querySelector('[data-hinweis="gebaeudewirtschaft"]')).toBeNull();
    await klick(within(dialog()).getByRole("radio", { name: RUECKNAHME_WAHL.FEHLT }));
    expect(document.querySelector('[data-hinweis="gebaeudewirtschaft"]')).not.toBeNull();
    await klick(knopf(dialog(), AUSGABE_ART_TEXTE.RUECKGABE.zuruecknehmenTitel));
    expect(bodies(onAusgabenAktion)).toEqual([{ aktion: "zurueckgenommen", ausgabeId: "a-haupt", zustand: "FEHLT" }]);
  });

  it("Zurückgenommen an einem Zugang: nur „gesperrt“, ohne Wahl", async () => {
    const { onAusgabenAktion } = karte();
    await klick(knopf(stueckEl("a-mail"), /^Gesperrt…/));
    expect(dialog().textContent).toContain(AUSGABEN_DIALOG_TEXTE.SPERRUNG_SATZ);
    expect(within(dialog()).queryAllByRole("radio")).toHaveLength(0);
    await klick(knopf(dialog(), AUSGABE_ART_TEXTE.SPERREN.zuruecknehmenTitel));
    expect(bodies(onAusgabenAktion)).toEqual([{ aktion: "zurueckgenommen", ausgabeId: "a-mail", zustand: "ZURUECK" }]);
  });

  it("Korrigieren: vorbelegt, ohne Änderung gesperrt, dann nur das geänderte Feld", async () => {
    const { onAusgabenAktion } = karte();
    await klick(knopf(stueckEl("a-ipad"), /^Korrigieren…/));
    const kennung = within(dialog()).getByLabelText(/^Inventarnummer/) as HTMLInputElement;
    expect(kennung.value).toBe("FES-IPAD-0412");
    expect((within(dialog()).getByLabelText(/^Übergeben am/) as HTMLInputElement).value).toBe("2026-01-28");
    expect((knopf(dialog(), AUSGABEN_DIALOG_TEXTE.KORRIGIEREN) as HTMLButtonElement).disabled).toBe(true);
    expect(dialog().querySelector('[data-zeile="grund"]')?.textContent).toBe(AUSGABEN_DIALOG_TEXTE.KEINE_AENDERUNG);
    eingeben(kennung, "FES-IPAD-0413");
    await klick(knopf(dialog(), AUSGABEN_DIALOG_TEXTE.KORRIGIEREN));
    expect(bodies(onAusgabenAktion)).toEqual([{ aktion: "korrigieren", ausgabeId: "a-ipad", kennung: "FES-IPAD-0413" }]);
  });

  it("Entfernen fragt nach; „Abbrechen“ sendet nichts, erst die Bestätigung", async () => {
    const { onAusgabenAktion } = karte();
    await klick(knopf(stueckEl("a-ipad"), /^Entfernen…/));
    expect(dialog().textContent).toContain(AUSGABEN_DIALOG_TEXTE.ENTFERNEN_SATZ(stand("a-ipad").text));
    await klick(knopf(dialog(), "Abbrechen"));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onAusgabenAktion).not.toHaveBeenCalled();
    await klick(knopf(stueckEl("a-ipad"), /^Entfernen…/));
    await klick(knopf(dialog(), AUSGABEN_DIALOG_TEXTE.ENTFERNEN));
    expect(bodies(onAusgabenAktion)).toEqual([{ aktion: "entfernen", ausgabeId: "a-ipad" }]);
  });
});

describe("Reine Regeln der Dialoge", () => {
  const zeilen = (n: number) => Array.from({ length: n }, () => ({ kennung: "", datum: HEUTE }));

  it("vermerken: Anzahl, Grenze aktiver Stücke, Kennung und Datum wie der Server", () => {
    expect(vermerkenGrund(zeilen(1), { heute: HEUTE, aktiv: 0 })).toBeNull();
    expect(vermerkenGrund([], { heute: HEUTE, aktiv: 0 })).toBe(MELDUNGEN_AUSGABEN.KEIN_STUECK);
    expect(vermerkenGrund(zeilen(11), { heute: HEUTE, aktiv: 0 })).toBe(MELDUNGEN_AUSGABEN.ZU_VIELE_STUECKE);
    expect(vermerkenGrund(zeilen(2), { heute: HEUTE, aktiv: 19 })).toBe(MELDUNGEN_AUSGABEN.ZU_VIELE_AKTIVE);
    expect(vermerkenGrund([{ kennung: "<b>", datum: HEUTE }], { heute: HEUTE, aktiv: 0 })).toBe(MELDUNGEN_AUSGABEN.KENNUNG_UNGUELTIG);
    expect(vermerkenGrund([{ kennung: "x".repeat(61), datum: HEUTE }], { heute: HEUTE, aktiv: 0 })).toBe(
      MELDUNGEN_AUSGABEN.KENNUNG_ZU_LANG,
    );
    expect(vermerkenGrund([{ kennung: "", datum: "2026-02-31" }], { heute: HEUTE, aktiv: 0 })).toBe(MELDUNGEN_AUSGABEN.DATUM_UNGUELTIG);
    expect(vermerkenGrund([{ kennung: "", datum: tageSpaeter(HEUTE, 1) }], { heute: HEUTE, aktiv: 0 })).toBe(
      MELDUNGEN_AUSGABEN.DATUM_IN_ZUKUNFT,
    );
    // Leeres Datum: der Server nimmt heute.
    expect(vermerkenGrund([{ kennung: "", datum: "" }], { heute: HEUTE, aktiv: 0 })).toBeNull();
    expect(vermerkenBody("i-1", [{ kennung: " A\r\n", datum: "" }])).toEqual({
      aktion: "vermerken",
      checklistItemId: "i-1",
      stuecke: [{ kennung: "A" }],
    });
    expect(vermerkenMaxStuecke(0)).toBe(10);
    expect(vermerkenMaxStuecke(15)).toBe(5);
    expect(vermerkenMaxStuecke(20)).toBe(1);
  });

  it("korrigieren: nur Geändertes, eine geleerte Kennung wird `null`, das Datum ist Pflicht", () => {
    const s = stand("a-ipad");
    const start = korrigierenStart(s);
    expect(start).toEqual({ kennung: "FES-IPAD-0412", datum: "2026-01-28" });
    expect(korrigierenBody(s, start)).toBeNull();
    expect(korrigierenGrund(s, start, HEUTE)).toBe(AUSGABEN_DIALOG_TEXTE.KEINE_AENDERUNG);
    expect(korrigierenBody(s, { ...start, kennung: "  " })).toEqual({ aktion: "korrigieren", ausgabeId: "a-ipad", kennung: null });
    expect(korrigierenBody(s, { ...start, datum: "2026-01-27" })).toEqual({
      aktion: "korrigieren",
      ausgabeId: "a-ipad",
      uebergebenAm: "2026-01-27",
    });
    expect(korrigierenGrund(s, { ...start, datum: "" }, HEUTE)).toBe(MELDUNGEN_AUSGABEN.DATUM_UNGUELTIG);
    expect(korrigierenGrund(s, { ...start, datum: tageSpaeter(HEUTE, 3) }, HEUTE)).toBe(MELDUNGEN_AUSGABEN.DATUM_IN_ZUKUNFT);
  });

  it("tauschen: ohne Grund kein Body; Hinweis zur Gebäudewirtschaft nur bei Schlüssel und verloren bzw. fehlt", () => {
    const start = tauschenStart(HEUTE);
    expect(tauschenGrund(start, HEUTE)).toBe(MELDUNGEN_AUSGABEN.TAUSCH_GRUND_FEHLT);
    expect(tauschenBody({ id: "a" }, start)).toBeNull();
    expect(tauschenGrund({ ...start, grund: "DEFEKT" }, HEUTE)).toBeNull();
    expect(tauschenBody({ id: "a" }, { ...start, grund: "DEFEKT", kennung: "" })).toEqual({
      aktion: "tauschen",
      ausgabeId: "a",
      grund: "DEFEKT",
      neu: { kennung: null, uebergebenAm: HEUTE },
    });
    expect(gebaeudewirtschaftNoetig({ schluessel: true, tauschGrund: "VERLOREN" })).toBe(true);
    expect(gebaeudewirtschaftNoetig({ schluessel: true, tauschGrund: "DEFEKT" })).toBe(false);
    expect(gebaeudewirtschaftNoetig({ schluessel: true, zustand: "FEHLT" })).toBe(true);
    expect(gebaeudewirtschaftNoetig({ schluessel: true, zustand: "BESCHAEDIGT" })).toBe(false);
    expect(gebaeudewirtschaftNoetig({ schluessel: false, tauschGrund: "VERLOREN", zustand: "FEHLT" })).toBe(false);
    expect(gebaeudewirtschaftNoetig({ schluessel: undefined, zustand: "FEHLT" })).toBe(false);
  });

  it("Kennung und Datum: dieselben Meldungen wie der Server", () => {
    expect(kennungGrund("")).toBeNull();
    expect(kennungGrund("FES-0412")).toBeNull();
    expect(kennungGrund("a\tb")).toBe(MELDUNGEN_AUSGABEN.KENNUNG_UNGUELTIG);
    expect(datumGrund("", HEUTE, false)).toBeNull();
    expect(datumGrund("", HEUTE, true)).toBe(MELDUNGEN_AUSGABEN.DATUM_UNGUELTIG);
    expect(datumGrund(HEUTE, HEUTE, true)).toBeNull();
    expect(stueckBody({ kennung: "", datum: "" })).toEqual({ kennung: null });
  });

  it("jeder Body der Dialoge besteht das echte Schema der Route", () => {
    const s = stand("a-ipad");
    const alle: AusgabenAktionBody[] = [
      vermerkenBody("i-laptop", [{ kennung: "FES-NB-0007", datum: HEUTE }, { kennung: "", datum: "" }]),
      korrigierenBody(s, { ...korrigierenStart(s), kennung: "" })!,
      korrigierenBody(s, { ...korrigierenStart(s), datum: "2026-01-27" })!,
      tauschenBody(s, { ...tauschenStart(HEUTE), grund: "VERLOREN", kennung: "FES-IPAD-0500" })!,
      zuruecknehmenBody(s, "BESCHAEDIGT"),
      entfernenBody(s),
    ];
    for (const body of alle) {
      const r = ausgabenAktionSchema.safeParse(body);
      expect(r.success ? null : r.error.errors[0]?.message).toBeNull();
    }
  });
});

// =============================================
// 4. Protokollzeile (G19)
// =============================================

describe("Unterschriebenes Übergabeprotokoll", () => {
  it("„fehlt“, solange kein Dokument da ist", () => {
    karte();
    const p = document.querySelector("[data-protokoll]") as HTMLElement;
    expect(p.dataset.protokoll).toBe("fehlt");
    expect(p.textContent).toBe(MELDUNGEN_AUSGABEN.PROTOKOLL_FEHLT("UEBERGABE"));
  });

  it("„hochgeladen am …“ mit dem jüngsten Dokument", () => {
    karte(uebersicht({ dokumente: [{ uploadedAt: "2026-02-03T10:00:00.000Z" }] }));
    const p = document.querySelector("[data-protokoll]") as HTMLElement;
    expect(p.dataset.protokoll).toBe("hochgeladen");
    expect(p.textContent).toBe(MELDUNGEN_AUSGABEN.PROTOKOLL_HOCHGELADEN("UEBERGABE", "03.02.2026"));
  });

  it("nur mit Stücken, die zurückkommen — Zugänge und Zurückgenommenes zählen nicht", () => {
    karte(
      uebersicht({
        ausgaben: [
          AUSGABEN.find((a) => a.id === "a-mail")!,
          { ...AUSGABEN.find((a) => a.id === "a-ipad")!, zustand: "ZURUECK" },
        ],
      }),
    );
    expect(document.querySelector("[data-protokoll]")).toBeNull();
  });
});

// =============================================
// 5. Aufruf der Route und Verdrahtung in der Detailseite
// =============================================

describe("ausgabenAktionSenden", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("Erfolg: POST an die Route der Ausgaben, Meldung des Servers", async () => {
    const f = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ data: {}, meldung: MELDUNGEN_AUSGABEN.GEBAEUDEWIRTSCHAFT_INFORMIEREN }),
    }));
    global.fetch = f as unknown as typeof fetch;
    const body: AusgabenAktionBody = { aktion: "zurueckgenommen", ausgabeId: "a-haupt", zustand: "FEHLT" };
    expect(await ausgabenAktionSenden("onb-1", body)).toEqual({
      ok: true,
      status: 200,
      meldung: MELDUNGEN_AUSGABEN.GEBAEUDEWIRTSCHAFT_INFORMIEREN,
    });
    expect(f).toHaveBeenCalledWith("/api/onboarding/onb-1/ausgaben", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  });

  it("Ablehnung: der Text des Servers", async () => {
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 409,
      json: async () => ({ error: MELDUNGEN_AUSGABEN.NICHT_AUSGEGEBEN, grund: "NICHT_AUSGEGEBEN" }),
    })) as unknown as typeof fetch;
    expect(await ausgabenAktionSenden("onb-1", { aktion: "entfernen", ausgabeId: "a" })).toEqual({
      ok: false,
      status: 409,
      meldung: MELDUNGEN_AUSGABEN.NICHT_AUSGEGEBEN,
    });
  });
});

describe("Detailseite: abgeschlossener Vorgang, Übergabe nachtragen", () => {
  const VORGANG = "onb-1";

  function punkt(teil: Record<string, unknown> & { id: string }) {
    return {
      title: teil.id,
      category: "Ausstattung & Zugänge",
      orderIndex: 0,
      isCompleted: true,
      completedAt: "2026-01-28T09:00:00.000Z",
      completedBy: null,
      dueDate: null,
      assignee: "IT",
      notes: null,
      herkunft: "AUSSTATTUNG",
      eilt: false,
      entfaelltAm: null,
      ...teil,
    };
  }

  function detail(): DetailData {
    return {
      id: VORGANG,
      displayId: "2026-GYM-003",
      email: "anna.beispiel@example.org",
      firstName: "Anna",
      lastName: "Beispiel",
      status: "COMPLETED",
      questionnaireType: "STANDARD",
      token: "tok-fb",
      invitedAt: "2026-01-08T12:00:00.000Z",
      submittedAt: "2026-01-10T12:00:00.000Z",
      supervisorSubmittedAt: "2026-01-14T09:30:00.000Z",
      supervisorToken: null,
      supervisorEmail: "leitung@fes-minden.de",
      supervisorTokenExpiresAt: null,
      supervisorLinkSentAt: null,
      reviewedAt: "2026-01-30T12:00:00.000Z",
      completedAt: "2026-02-02T12:00:00.000Z",
      starterPacketSentAt: null,
      starterPacketSentCount: 0,
      organization: { id: ORT, name: "FES Gymnasium", mandantNumber: "10", type: "GYMNASIUM" },
      fragebogenFortschritt: { position: 9, total: 9, titel: "Abschluss", prozent: 100 },
      requiredDocuments: [],
      personalData: {
        firstName: "Anna",
        lastName: "Beispiel",
        isComplete: true,
        currentStep: 9,
        birthDate: "1990-05-03",
        children: [],
        rvEntscheidung: null,
        aufenthaltstitelErforderlich: null,
        healthInsuranceType: "gesetzlich",
      },
      supervisorData: null,
      documents: [],
      checklistItems: [
        punkt({ id: "i-ipad", title: "Dienst-iPad (Lernmittel) bereitstellen" }),
        punkt({ id: "i-laptop", title: "Dienst-Laptop / PC bereitstellen" }),
      ],
      notes: [],
      _count: { notes: 0 },
      ausstattung: uebersicht({ status: "COMPLETED" }),
    } as unknown as DetailData;
  }

  const USER = { userId: "u-erika", email: "erika.muster@credo-gruppe.de", role: "HR_SACHBEARBEITER", firstName: "Erika", lastName: "Muster" };

  afterEach(() => {
    window.history.replaceState(null, "", "/");
    jest.restoreAllMocks();
  });

  it("„Übergabe vermerken…“ und „Tauschen…“ gehen an die Route der Ausgaben und laden den Vorgang neu", async () => {
    const f = jest.fn(async (url: string, init?: RequestInit) => {
      if (url === `/api/onboarding/${VORGANG}/ausgaben` && init?.method === "POST") {
        return { ok: true, status: 200, json: async () => ({ data: uebersicht(), meldung: "Übergabe vermerkt." }) };
      }
      return { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(detail())) };
    });
    global.fetch = f as unknown as typeof fetch;
    window.history.replaceState(null, "", "/?tab=checkliste");
    await act(async () => {
      render(<DetailContent onboardingId={VORGANG} user={USER} />);
    });
    await screen.findAllByText("2026-GYM-003");
    expect(kartenEl().dataset.zustand).toBe("NUR_LESEN");

    const vorher = f.mock.calls.length;
    await klick(knopf(ausgabenEl("i-laptop")!, /^Übergabe vermerken…/));
    eingeben(within(dialog()).getByLabelText(/^Inventarnummer/), "FES-NB-0007");
    await klick(knopf(dialog(), "Übergabe speichern"));

    const neu = f.mock.calls.slice(vorher);
    expect(neu[0][0]).toBe(`/api/onboarding/${VORGANG}/ausgaben`);
    expect(JSON.parse(String((neu[0][1] as RequestInit).body))).toEqual({
      aktion: "vermerken",
      checklistItemId: "i-laptop",
      stuecke: [{ kennung: "FES-NB-0007", uebergebenAm: HEUTE }],
    });
    expect(neu[1][0]).toBe(`/api/onboarding/${VORGANG}`);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(kartenEl().querySelector('[data-meldung="ok"]')?.textContent).toContain("Übergabe vermerkt.");

    // Danach tauschen — dieselbe Route, wieder neu geladen.
    const vorTausch = f.mock.calls.length;
    await klick(knopf(stueckEl("a-ipad"), /^Tauschen…/));
    await klick(within(dialog()).getByRole("radio", { name: new RegExp(`^${TAUSCH_WAHL.DEFEKT.label}`) }));
    eingeben(within(dialog()).getByLabelText(/^Inventarnummer/), "FES-IPAD-0500");
    await klick(knopf(dialog(), AUSGABEN_DIALOG_TEXTE.TAUSCHEN));
    const tausch = f.mock.calls.slice(vorTausch);
    expect(tausch[0][0]).toBe(`/api/onboarding/${VORGANG}/ausgaben`);
    expect(JSON.parse(String((tausch[0][1] as RequestInit).body))).toEqual({
      aktion: "tauschen",
      ausgabeId: "a-ipad",
      grund: "DEFEKT",
      neu: { kennung: "FES-IPAD-0500", uebergebenAm: HEUTE },
    });
    expect(tausch[1][0]).toBe(`/api/onboarding/${VORGANG}`);
  });
});
