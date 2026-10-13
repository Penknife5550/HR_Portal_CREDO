/**
 * @jest-environment jsdom
 */

/**
 * Reiter Checkliste: die Karte „Ausstattung & Zugänge“
 * (src/components/ausstattung/ausstattung-karte.tsx), ihre Dialoge
 * (ausstattung-dialoge.tsx) und der Zusatz am Checklistenpunkt
 * (aufgabe-zusatz.tsx) — Paket A3, Feinplan S16, Mockup 6.3.
 *
 * Belegt wird, was nur die Oberfläche zeigt:
 *   1. Zustände: ENTWURF (beide Sätze), NUR_LESEN, BEARBEITBAR auch bei
 *      `mitAusstattung = false` (Feinplan 1.6).
 *   2. Inhalt nach Mockup 6.3: je Stelle eine Gruppe, eine Auswahl je Option
 *      eine Zeile mit eigenem Stand, „Eilt“, Vorlauf-Warnung, „ergänzt von HR
 *      (…)“, „nicht mehr im Katalog“, gestrichen, Angabe, Hinweis mit Stand.
 *   3. Aktionen nur mit Bearbeitungsrecht; Bemerkungen, Angaben und
 *      Hinweistexte ohne Recht nicht (Regel 16).
 *   4. Die Dialoge: Body je Aktion (alle durch das echte Schema), Sperrgrund
 *      vor dem Senden (dieselbe Regel wie der Server), Fehlertext des
 *      Servers bleibt im Dialog, Erfolg schließt ihn mit der Meldung des
 *      Servers; Rückfragen beim Streichen und Entfernen; Fälligkeit der
 *      Hinweis-Aufgabe bearbeitbar (F20).
 *   5. Der Aufruf der Route (`ausstattungAktionSenden`) und der Zusatz am
 *      Checklistenpunkt (Entfällt, Eilt, Bemerkung).
 *   6. Verdrahtung in der Detailseite: Reiter-Zähler, Kopfzeile und Balken
 *      zählen ohne entfallene Aufgaben (F2), die Karte steht im Reiter, eine
 *      Aktion geht an die Route und lädt den Vorgang neu.
 *
 * Die Übersicht kommt aus der echten reinen Funktion
 * (`ausstattungsUebersichtBauen`); ihre Regeln hält
 * src/__tests__/lib/ausstattung.test.ts. Umgebung wie in den übrigen
 * Komponententests: jsdom im Docblock, ohne @testing-library/jest-dom.
 */
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import {
  AUSSTATTUNG_KARTE_TEXTE,
  AUSSTATTUNG_KARTE_TITEL_ID,
  AusstattungKarte,
  ausstattungAktionSenden,
  type AusstattungAktionsAusgang,
} from "@/components/ausstattung/ausstattung-karte";
import {
  DIALOG_TEXTE,
  bearbeitenAenderung,
  bearbeitenGrund,
  bearbeitenStart,
  datumFeldWert,
  hinweisBody,
  hinweisGrund,
  hinweisStart,
  hinzufuegenBody,
  hinzufuegenGrund,
  hinzufuegenStart,
  type AusstattungAktionBody,
} from "@/components/ausstattung/ausstattung-dialoge";
import { AufgabeZusatz, EntfaelltHaken, ZUSATZ_TEXTE, istEntfallen } from "@/components/ausstattung/aufgabe-zusatz";
import { useState } from "react";
import {
  DetailContent,
  TabChecklist,
  type ChecklistItemData,
  type DetailData,
} from "@/app/(portal)/dashboard/[id]/detail-content";
import { ausstattungAktionSchema } from "@/lib/validations/ausstattung";
import {
  BEMERKUNG_HINWEIS,
  HINWEIS_AUFGABE_TITEL,
  MELDUNGEN,
  ausstattungsUebersichtBauen,
  bemerkungLabel,
  type AusstattungsUebersicht,
  type AusstattungsZeile,
  type KatalogPosition,
  type UebersichtAufgabeDaten,
  type UebersichtHinweisDaten,
  type UebersichtVerknuepfung,
  type UebersichtVorgangStand,
  type UebersichtZeileDaten,
} from "@/lib/ausstattung";

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
// Fixtur — Mockup 6.3, betrachtet am Mo 25.01.2027, Dienstbeginn 01.02.2027
// =============================================

const JETZT = new Date("2027-01-25T08:00:00.000Z");
const BEGINN = "2027-02-01T00:00:00.000Z";
const ORT = "org-gym";
const tag = (iso: string) => `${iso}T00:00:00.000Z`;

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
    createdAt: "2027-01-14T09:30:00.000Z",
    relativeDueDays: null,
    ...teil,
  };
}

const ZEILEN: UebersichtZeileDaten[] = [
  zeile({
    id: "z-ipad",
    positionId: "pos-ipad",
    bezeichnung: "Dienst-iPad (Lernmittel)",
    bemerkung: "Mit Stift und Hülle, Apps: WebUntis, Explain Everything",
    bemerkungQuelle: "FUEHRUNGSKRAFT",
    relativeDueDays: -14,
  }),
  zeile({
    id: "z-zug",
    positionId: "pos-zugaenge",
    art: "AUSWAHL",
    bezeichnung: "Zugänge",
    auswahl: ["Dienst-E-Mail", "Schulportal", "WebUntis"],
    reihenfolge: 1,
  }),
  zeile({ id: "z-tel", positionId: "pos-tel", bezeichnung: "Telefon mit Durchwahl", reihenfolge: 2 }),
  zeile({
    id: "z-laptop",
    bezeichnung: "Dienst-Laptop / PC",
    quelle: "HR",
    erfasstVonId: "u-1",
    createdAt: "2027-01-19T09:00:00.000Z",
    reihenfolge: 500,
  }),
  zeile({
    id: "z-schl",
    positionId: "pos-schl",
    departmentKey: "FACILITY",
    art: "AUSWAHL",
    bezeichnung: "Schlüssel",
    auswahl: ["Haupteingang", "Lehrerzimmer"],
    bemerkung: "Sammlung erst nach der Sicherheitsunterweisung",
    bemerkungQuelle: "FUEHRUNGSKRAFT",
  }),
  zeile({
    id: "z-faecher",
    positionId: "pos-faecher",
    departmentKey: "FACILITY",
    art: "ANGABE",
    angabeSchluessel: "UNTERRICHTSFAECHER",
    bezeichnung: "Unterrichtsfächer",
    angabe: "Chemie, Sport",
    sichtbarFuer: ["IT"],
    reihenfolge: 3,
  }),
  zeile({
    id: "z-fach",
    positionId: "pos-fach",
    departmentKey: "VERWALTUNG",
    bezeichnung: "Fach im Lehrerzimmer",
    gestrichenAm: "2027-01-20T10:00:00.000Z",
  }),
];

const AUFGABEN: UebersichtAufgabeDaten[] = [
  { id: "i-ipad", title: "Dienst-iPad (Lernmittel) bereitstellen", isCompleted: false, dueDate: tag("2027-01-27"), eilt: true },
  { id: "i-mail", title: "Zugang einrichten: Dienst-E-Mail", isCompleted: true, completedAt: "2027-01-20T09:00:00.000Z" },
  { id: "i-portal", title: "Zugang einrichten: Schulportal", isCompleted: true, completedAt: "2027-01-20T10:00:00.000Z" },
  { id: "i-untis", title: "Zugang einrichten: WebUntis", isCompleted: false, dueDate: tag("2027-01-25") },
  { id: "i-tel", title: "Telefon mit Durchwahl bereitstellen", isCompleted: true, completedAt: "2027-01-22T09:00:00.000Z" },
  { id: "i-laptop", title: "Dienst-Laptop / PC bereitstellen", isCompleted: false },
  { id: "i-haupt", title: "Schlüssel ausgeben: Haupteingang", isCompleted: false, dueDate: tag("2027-01-29") },
  { id: "i-lehrer", title: "Schlüssel ausgeben: Lehrerzimmer", isCompleted: false, dueDate: tag("2027-01-29") },
  { id: "i-chemie", title: "Schlüssel ausgeben: Fachraum Chemie", isCompleted: true, entfaelltAm: tag("2027-01-21") },
  { id: "i-fach", title: "Fach im Lehrerzimmer bereitstellen", isCompleted: true, entfaelltAm: tag("2027-01-20") },
  { id: "i-hinweis", title: HINWEIS_AUFGABE_TITEL, isCompleted: false, dueDate: tag("2027-01-25") },
];

const VERKNUEPFUNGEN: UebersichtVerknuepfung[] = [
  { ausstattungId: "z-ipad", option: "", checklistItemId: "i-ipad" },
  { ausstattungId: "z-zug", option: "Dienst-E-Mail", checklistItemId: "i-mail" },
  { ausstattungId: "z-zug", option: "Schulportal", checklistItemId: "i-portal" },
  { ausstattungId: "z-zug", option: "WebUntis", checklistItemId: "i-untis" },
  { ausstattungId: "z-tel", option: "", checklistItemId: "i-tel" },
  { ausstattungId: "z-laptop", option: "", checklistItemId: "i-laptop" },
  { ausstattungId: "z-schl", option: "Haupteingang", checklistItemId: "i-haupt" },
  { ausstattungId: "z-schl", option: "Lehrerzimmer", checklistItemId: "i-lehrer" },
  { ausstattungId: "z-schl", option: "Fachraum Chemie", checklistItemId: "i-chemie" },
  { ausstattungId: "z-fach", option: "", checklistItemId: "i-fach" },
];

const HINWEISE: UebersichtHinweisDaten[] = [
  {
    departmentKey: "IT",
    text: "Bitte vor dem ersten Schultag einrichten.",
    quelle: "FUEHRUNGSKRAFT",
    checklistItemId: "i-hinweis",
    gesehenAm: null,
  },
];

function katalogPosition(teil: Partial<KatalogPosition> & { id: string }): KatalogPosition {
  return {
    departmentKey: "IT",
    organizationId: null,
    einrichtungsarten: [],
    art: "JA_NEIN",
    angabeSchluessel: null,
    bezeichnung: teil.id,
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
    ...teil,
  };
}

// „Telefon“ hat die Verwaltung inzwischen ausgeschaltet → „nicht mehr im Katalog“.
const KATALOG: KatalogPosition[] = [
  katalogPosition({ id: "pos-ipad", bezeichnung: "Dienst-iPad (Lernmittel)" }),
  katalogPosition({
    id: "pos-zugaenge",
    art: "AUSWAHL",
    bezeichnung: "Zugänge",
    optionen: ["Dienst-E-Mail", "Schulportal", "WebUntis", "Drucker-PIN"],
  }),
  katalogPosition({
    id: "pos-schl",
    departmentKey: "FACILITY",
    art: "AUSWAHL",
    bezeichnung: "Schlüssel",
    optionen: ["Haupteingang", "Lehrerzimmer", "Fachraum Chemie", "Sporthalle"],
  }),
  katalogPosition({
    id: "pos-faecher",
    departmentKey: "FACILITY",
    art: "ANGABE",
    angabeSchluessel: "UNTERRICHTSFAECHER",
    bezeichnung: "Unterrichtsfächer",
    bemerkungAnbieten: false,
  }),
  katalogPosition({ id: "pos-fach", departmentKey: "VERWALTUNG", bezeichnung: "Fach im Lehrerzimmer" }),
  katalogPosition({ id: "pos-transponder", departmentKey: "FACILITY", bezeichnung: "Transponder/Chip" }),
  katalogPosition({
    id: "pos-raeume",
    departmentKey: "FACILITY",
    art: "AUSWAHL",
    bezeichnung: "Räume",
    optionen: ["Werkraum", "Musikraum"],
  }),
];

const KONFIGS = [
  { departmentKey: "IT", departmentName: "IT-Abteilung", email: "it@fes-minden.de", organizationId: null, isActive: true },
  { departmentKey: "FACILITY", departmentName: "Facility Management", email: "hausmeister@fes-minden.de", organizationId: null, isActive: true },
  { departmentKey: "VERWALTUNG", departmentName: "Verwaltung / Sekretariat", email: "sekretariat@fes-minden.de", organizationId: null, isActive: true },
];

function vorgang(teil: Partial<UebersichtVorgangStand> = {}): UebersichtVorgangStand {
  return {
    status: "SUPERVISOR_SUBMITTED",
    supervisorSubmittedAt: "2027-01-14T09:30:00.000Z",
    supervisorData: { isComplete: true, mitAusstattung: true, vertragsbeginn: BEGINN },
    ...teil,
  };
}

function uebersicht(
  teil: {
    vorgang?: UebersichtVorgangStand;
    darfBearbeiten?: boolean;
    zeilen?: UebersichtZeileDaten[];
    hinweise?: UebersichtHinweisDaten[];
  } = {},
): AusstattungsUebersicht {
  return ausstattungsUebersichtBauen({
    vorgang: teil.vorgang ?? vorgang(),
    darfBearbeiten: teil.darfBearbeiten ?? true,
    zeilen: teil.zeilen ?? ZEILEN,
    hinweise: teil.hinweise ?? HINWEISE,
    arbeitsortId: ORT,
    konfigs: KONFIGS,
    katalog: KATALOG.filter((p) => p.id !== "pos-tel"),
    erfasser: { "u-1": { firstName: "Anna", lastName: "Peters" } },
    aufgaben: AUFGABEN,
    verknuepfungen: VERKNUEPFUNGEN,
    jetzt: JETZT,
  });
}

const OK: AusstattungAktionsAusgang = { ok: true, status: 200, meldung: "Änderung gespeichert." };

function karte(
  u: AusstattungsUebersicht = uebersicht(),
  opts: { darfBearbeiten?: boolean; ausgang?: AusstattungAktionsAusgang; ohneAktion?: boolean } = {},
) {
  const onAktion = jest.fn(async (body: AusstattungAktionBody) => {
    void body;
    return opts.ausgang ?? OK;
  });
  render(
    <AusstattungKarte
      uebersicht={u}
      darfBearbeiten={opts.darfBearbeiten ?? true}
      onAktion={opts.ohneAktion ? undefined : onAktion}
    />,
  );
  return { onAktion };
}

const kartenEl = () => document.querySelector('[data-karte="ausstattung-checkliste"]') as HTMLElement | null;
const zeileEl = (id: string) => document.querySelector(`[data-zeile="${id}"]`) as HTMLElement;
const stelleEl = (key: string) => document.querySelector(`[data-stelle="${key}"]`) as HTMLElement;
const hinweisEl = (key: string) => document.querySelector(`[data-hinweis="${key}"]`) as HTMLElement;
const dialog = () => screen.getByRole("dialog");
const knopf = (wo: HTMLElement, name: RegExp | string) => within(wo).getByRole("button", { name });

async function klick(el: HTMLElement) {
  await act(async () => {
    fireEvent.click(el);
  });
}

function bodies(onAktion: jest.Mock): AusstattungAktionBody[] {
  return onAktion.mock.calls.map((c) => c[0] as AusstattungAktionBody);
}

// =============================================
// 1. Zustände (Feinplan 1.6)
// =============================================

describe("Zustände", () => {
  it("ohne Übersicht (keine HR-Rolle) keine Karte", () => {
    render(<AusstattungKarte uebersicht={null} darfBearbeiten onAktion={jest.fn()} />);
    expect(kartenEl()).toBeNull();
  });

  it("ENTWURF mit Schritt: Satz der Zustandsregel, nur lesend", () => {
    const u = uebersicht({
      vorgang: vorgang({ status: "IN_PROGRESS", supervisorSubmittedAt: null, supervisorData: { isComplete: false, mitAusstattung: true } }),
    });
    karte(u);
    expect(kartenEl()?.dataset.zustand).toBe("ENTWURF");
    expect(kartenEl()?.textContent).toContain(MELDUNGEN.UEBERSICHT_ENTWURF_MIT_SCHRITT);
    expect(within(kartenEl()!).queryAllByRole("button")).toHaveLength(0);
    // Gelesen wird trotzdem: die Wahl der Führungskraft samt Bemerkung.
    expect(kartenEl()?.textContent).toContain("Mit Stift und Hülle");
  });

  it("ENTWURF ohne Schritt: der andere Satz", () => {
    const u = uebersicht({
      vorgang: vorgang({ status: "IN_PROGRESS", supervisorSubmittedAt: null, supervisorData: { isComplete: false, mitAusstattung: false } }),
      zeilen: [],
      hinweise: [],
    });
    karte(u);
    expect(kartenEl()?.textContent).toContain(MELDUNGEN.UEBERSICHT_ENTWURF_OHNE_SCHRITT);
    expect(within(kartenEl()!).queryAllByRole("button")).toHaveLength(0);
  });

  it("NUR_LESEN (abgeschlossen): Satz, Inhalt sichtbar, keine Aktion", () => {
    karte(uebersicht({ vorgang: vorgang({ status: "COMPLETED" }) }));
    expect(kartenEl()?.dataset.zustand).toBe("NUR_LESEN");
    expect(kartenEl()?.textContent).toContain(MELDUNGEN.UEBERSICHT_ABGESCHLOSSEN);
    expect(kartenEl()?.textContent).toContain("Mit Stift und Hülle");
    expect(within(kartenEl()!).queryAllByRole("button")).toHaveLength(0);
  });

  it("BEARBEITBAR auch bei mitAusstattung = false (Bestand): HR ergänzt nach der Abgabe", () => {
    const u = uebersicht({
      vorgang: vorgang({ supervisorData: { isComplete: true, mitAusstattung: false, vertragsbeginn: BEGINN } }),
      zeilen: [],
      hinweise: [],
    });
    karte(u);
    expect(kartenEl()?.dataset.zustand).toBe("BEARBEITBAR");
    expect(knopf(kartenEl()!, AUSSTATTUNG_KARTE_TEXTE.hinzufuegen)).toBeTruthy();
    expect(knopf(kartenEl()!, AUSSTATTUNG_KARTE_TEXTE.hinweisNeu)).toBeTruthy();
    expect(kartenEl()?.textContent).toContain(MELDUNGEN.UEBERSICHT_LEER);
  });
});

// =============================================
// 2. Inhalt (Mockup 6.3)
// =============================================

describe("Inhalt nach Mockup 6.3", () => {
  it("je Stelle eine Gruppe, in der Reihenfolge der Abteilungskarte; Einleitung mit Datum", () => {
    karte();
    expect([...document.querySelectorAll("[data-stelle]")].map((e) => (e as HTMLElement).dataset.stelle)).toEqual([
      "IT",
      "VERWALTUNG",
      "FACILITY",
    ]);
    expect(kartenEl()?.textContent).toContain("Angefordert von der Führungskraft mit den Einstellungsmodalitäten (14.01.2027).");
    expect(kartenEl()?.textContent).toContain(AUSSTATTUNG_KARTE_TEXTE.erklaerung);
  });

  it("Auswahl: je Option eine Zeile mit eigenem Stand, entfallene dahinter", () => {
    karte();
    const optionen = [...zeileEl("z-schl").querySelectorAll("[data-option]")] as HTMLElement[];
    expect(optionen.map((o) => [o.dataset.option, o.querySelector("[data-stand]")?.textContent])).toEqual([
      ["Haupteingang", "offen · fällig 29.01.2027"],
      ["Lehrerzimmer", "offen · fällig 29.01.2027"],
      ["Fachraum Chemie", "entfällt"],
    ]);
    const zugaenge = [...zeileEl("z-zug").querySelectorAll("[data-option]")].map(
      (o) => o.querySelector("[data-stand]")?.textContent,
    );
    expect(zugaenge).toEqual(["erledigt 20.01.2027", "erledigt 20.01.2027", "offen · fällig 25.01.2027"]);
  });

  it("Ja/Nein: Stand mit „Eilt“, Bemerkung mit Herkunft, Vorlauf-Warnung (Regel 14)", () => {
    karte();
    const ipad = zeileEl("z-ipad");
    expect(ipad.querySelector("[data-stand]")?.textContent).toBe("offen · fällig 27.01.2027");
    expect(ipad.querySelector('[data-kennzeichen="eilt"]')).not.toBeNull();
    expect(ipad.querySelector("[data-bemerkung]")?.textContent).toBe(
      `${bemerkungLabel("FUEHRUNGSKRAFT")}Mit Stift und Hülle, Apps: WebUntis, Explain Everything`,
    );
    expect(ipad.querySelector('[data-warnung="vorlauf"]')?.textContent).toBe(MELDUNGEN.VORLAUF_WARNUNG);
  });

  it("„ergänzt von HR (…)“, „nicht mehr im Katalog“ und gestrichen", () => {
    karte();
    expect(zeileEl("z-laptop").textContent).toContain("ergänzt von HR (A. Peters), 19.01.2027");
    expect(zeileEl("z-tel").textContent).toContain(AUSSTATTUNG_KARTE_TEXTE.nichtMehrImKatalog);
    const fach = zeileEl("z-fach");
    expect(fach.textContent).toContain(AUSSTATTUNG_KARTE_TEXTE.gestrichen);
    // Eine gestrichene Zeile wird nicht bearbeitet (Wiederaufnahme über „Position hinzufügen…“).
    expect(within(fach).queryAllByRole("button")).toHaveLength(0);
  });

  it("Angabe mit Wert und wer sie sieht; Hinweis mit Herkunft, Stand und Fälligkeit", () => {
    karte();
    const faecher = zeileEl("z-faecher");
    expect(faecher.textContent).toContain("Angabe: Unterrichtsfächer");
    expect(faecher.querySelector("[data-angabe]")?.textContent).toBe(
      "Chemie, Sport · sehen Facility Management und IT-Abteilung",
    );
    const h = hinweisEl("IT");
    expect(h.textContent).toContain("Hinweis der Führungskraft");
    expect(h.textContent).toContain("Bitte vor dem ersten Schultag einrichten.");
    expect(h.querySelector("[data-stand]")?.textContent).toBe("offen · fällig 25.01.2027");
  });

  it("gesperrte Aktion nennt ihren Grund sichtbar (Regel 9)", () => {
    karte();
    const tel = zeileEl("z-tel");
    const bearbeiten = knopf(tel, /^Bearbeiten…/) as HTMLButtonElement;
    expect(bearbeiten.disabled).toBe(true);
    expect(tel.querySelector("[data-sperrgrund]")?.textContent).toBe(MELDUNGEN.AUFGABE_ERLEDIGT);
    expect(bearbeiten.getAttribute("aria-describedby")).toBe(tel.querySelector("[data-sperrgrund]")?.id);
    // Auswahl mit erledigter Option: ergänzen geht, streichen nicht.
    const zug = zeileEl("z-zug");
    expect((knopf(zug, /^Bearbeiten…/) as HTMLButtonElement).disabled).toBe(false);
    expect((knopf(zug, /^Streichen…/) as HTMLButtonElement).disabled).toBe(true);
  });
});

// =============================================
// 3. Recht (Regel 16)
// =============================================

describe("Bearbeitungsrecht", () => {
  it("ohne Recht der Rolle: keine Aktion, keine Bemerkung, kein Angabewert, kein Hinweistext", () => {
    karte(uebersicht(), { darfBearbeiten: false });
    const k = kartenEl()!;
    expect(within(k).queryAllByRole("button")).toHaveLength(0);
    expect(k.textContent).not.toContain("Mit Stift und Hülle");
    expect(k.textContent).not.toContain("Sammlung erst nach");
    expect(k.textContent).not.toContain("Chemie, Sport");
    expect(k.textContent).not.toContain("Bitte vor dem ersten Schultag");
    expect(k.querySelector("[data-bemerkung]")).toBeNull();
    // Der Aufgabenstand bleibt lesbar.
    expect(zeileEl("z-ipad").querySelector("[data-stand]")?.textContent).toBe("offen · fällig 27.01.2027");
  });

  it("Übersicht ohne Bearbeitungsrecht (NUR_LESEN ohne Satz): ebenso keine Texte", () => {
    karte(uebersicht({ darfBearbeiten: false }));
    expect(kartenEl()?.dataset.zustand).toBe("NUR_LESEN");
    expect(within(kartenEl()!).queryAllByRole("button")).toHaveLength(0);
    expect(kartenEl()?.textContent).not.toContain("Mit Stift und Hülle");
  });

  it("ohne Aktion der Seite bleibt die Karte lesend", () => {
    karte(uebersicht(), { ohneAktion: true });
    expect(within(kartenEl()!).queryAllByRole("button")).toHaveLength(0);
    expect(kartenEl()?.textContent).toContain("Mit Stift und Hülle");
  });
});

// =============================================
// 4. Dialoge und Aktionen
// =============================================

describe("Bearbeiten", () => {
  it("Option ergänzen, Bemerkung und Fälligkeit je Option → nur geänderte Felder", async () => {
    const { onAktion } = karte();
    await klick(knopf(zeileEl("z-zug"), /^Bearbeiten…/));
    const d = dialog();
    // Die erledigte Option ist fest (Regel 9) — mit ihrem Stand daneben.
    const mail = within(d).getByRole("checkbox", { name: /Dienst-E-Mail/ }) as HTMLInputElement;
    expect(mail.checked).toBe(true);
    expect(mail.disabled).toBe(true);
    expect(d.textContent).toContain(BEMERKUNG_HINWEIS);
    // Ohne Änderung: gesperrt mit Grund.
    expect(d.querySelector('[data-zeile="grund"]')?.textContent).toBe(DIALOG_TEXTE.KEINE_AENDERUNG);

    fireEvent.click(within(d).getByRole("checkbox", { name: /Drucker-PIN/ }));
    fireEvent.change(within(d).getByLabelText(/^Bemerkung/), { target: { value: "Bitte bis Montag" } });
    fireEvent.change(within(d).getByLabelText("Fälligkeit WebUntis"), { target: { value: "2027-01-28" } });
    await klick(within(d).getByRole("button", { name: "Speichern" }));

    expect(bodies(onAktion)).toEqual([
      {
        aktion: "aendern",
        ausstattungId: "z-zug",
        auswahl: ["Dienst-E-Mail", "Schulportal", "WebUntis", "Drucker-PIN"],
        bemerkung: "Bitte bis Montag",
        faelligkeiten: [{ option: "WebUntis", dueDate: "2027-01-28" }],
      },
    ]);
    // Erfolg: Dialog zu, Meldung des Servers in der Karte.
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(kartenEl()?.querySelector('[data-meldung="ok"]')?.textContent).toContain("Änderung gespeichert.");
  });

  it("der Fehlertext des Servers bleibt im offenen Dialog", async () => {
    karte(uebersicht(), { ausgang: { ok: false, status: 409, meldung: MELDUNGEN.AUFGABE_ERLEDIGT } });
    await klick(knopf(zeileEl("z-ipad"), /^Bearbeiten…/));
    fireEvent.change(within(dialog()).getByLabelText(/^Bemerkung/), { target: { value: "Ohne Hülle" } });
    await klick(within(dialog()).getByRole("button", { name: "Speichern" }));
    expect(within(dialog()).getByRole("alert").textContent).toBe(MELDUNGEN.AUFGABE_ERLEDIGT);
    expect(kartenEl()?.querySelector("[data-meldung]")).toBeNull();
  });

  it("Stellenwechsel und Fälligkeit entfernen", async () => {
    const { onAktion } = karte();
    await klick(knopf(zeileEl("z-ipad"), /^Bearbeiten…/));
    fireEvent.change(within(dialog()).getByLabelText(/^Zuständige Stelle/), { target: { value: "VERWALTUNG" } });
    // Ja/Nein: die eine Aufgabe heisst nach ihrem Titel (keine Option).
    fireEvent.change(within(dialog()).getByLabelText("Fälligkeit Dienst-iPad (Lernmittel) bereitstellen"), { target: { value: "" } });
    await klick(within(dialog()).getByRole("button", { name: "Speichern" }));
    expect(bodies(onAktion)).toEqual([
      {
        aktion: "aendern",
        ausstattungId: "z-ipad",
        departmentKey: "VERWALTUNG",
        faelligkeiten: [{ option: "", dueDate: null }],
      },
    ]);
  });

  it("reine Regeln: erledigte Option abwählen → Grund des Servers, nichts geändert → kein Senden", () => {
    const u = uebersicht();
    const zug = u.gruppen[0].zeilen.find((z) => z.id === "z-zug") as AusstattungsZeile;
    const start = bearbeitenStart(zug, "IT");
    expect(start).toEqual({
      auswahl: ["Dienst-E-Mail", "Schulportal", "WebUntis"],
      angabe: "",
      bemerkung: "",
      stelle: "IT",
      faelligkeiten: { WebUntis: "2027-01-25" },
    });
    expect(bearbeitenGrund(zug, "IT", start)).toBe(DIALOG_TEXTE.KEINE_AENDERUNG);
    expect(bearbeitenAenderung(zug, "IT", start).geaendert).toBe(false);
    expect(bearbeitenGrund(zug, "IT", { ...start, auswahl: ["Schulportal", "WebUntis"] })).toBe(MELDUNGEN.AUFGABE_ERLEDIGT);
    expect(bearbeitenGrund(zug, "IT", { ...start, auswahl: [] })).toBe(MELDUNGEN.KARTE_AUSWAHL_LEER);
    expect(bearbeitenGrund(zug, "IT", { ...start, stelle: "FACILITY" })).toBe(MELDUNGEN.AUFGABE_ERLEDIGT);
    expect(bearbeitenGrund(zug, "IT", { ...start, faelligkeiten: { WebUntis: "2027-02-30" } })).toBe(
      MELDUNGEN.KARTE_DATUM_UNGUELTIG,
    );
    // Eine abgewählte Option bekommt keine neue Fälligkeit mehr (ihre Aufgabe verschwindet bzw. entfällt).
    expect(
      bearbeitenAenderung(zug, "IT", { ...start, auswahl: ["Dienst-E-Mail", "Schulportal"], faelligkeiten: { WebUntis: "2027-01-28" } }).body,
    ).toEqual({ aktion: "aendern", ausstattungId: "z-zug", auswahl: ["Dienst-E-Mail", "Schulportal"] });
    const faecher = u.gruppen.flatMap((g) => g.zeilen).find((z) => z.id === "z-faecher") as AusstattungsZeile;
    expect(bearbeitenGrund(faecher, "FACILITY", { ...bearbeitenStart(faecher, "FACILITY"), angabe: " " })).toBe(
      MELDUNGEN.KARTE_ANGABE_LEER,
    );
    expect(
      bearbeitenAenderung(faecher, "FACILITY", { ...bearbeitenStart(faecher, "FACILITY"), angabe: "Chemie" }).body,
    ).toEqual({ aktion: "aendern", ausstattungId: "z-faecher", angabe: "Chemie" });
  });
});

describe("Streichen", () => {
  it("fragt nach („entfällt für die Stelle“), erst die Bestätigung sendet", async () => {
    const { onAktion } = karte();
    await klick(knopf(zeileEl("z-ipad"), /^Streichen…/));
    expect(dialog().textContent).toContain("Die Position entfällt für die Stelle IT-Abteilung.");
    expect(onAktion).not.toHaveBeenCalled();
    await klick(within(dialog()).getByRole("button", { name: "Streichen" }));
    expect(bodies(onAktion)).toEqual([{ aktion: "streichen", ausstattungId: "z-ipad" }]);
  });

  it("Abbrechen sendet nichts", async () => {
    const { onAktion } = karte();
    await klick(knopf(zeileEl("z-ipad"), /^Streichen…/));
    await klick(within(dialog()).getByRole("button", { name: "Abbrechen" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onAktion).not.toHaveBeenCalled();
  });
});

describe("Position hinzufügen", () => {
  it("aus dem Katalog: nur, was dieser Vorgang anbietet — gestrichene wieder dabei; Auswahl je Option", async () => {
    const { onAktion } = karte();
    await klick(knopf(kartenEl()!, AUSSTATTUNG_KARTE_TEXTE.hinzufuegen));
    const d = dialog();
    const auswahl = within(d).getByLabelText(/^Position/) as HTMLSelectElement;
    const angeboten = [...auswahl.options].map((o) => o.value).filter(Boolean);
    expect(angeboten.sort()).toEqual(["pos-fach", "pos-raeume", "pos-transponder"]);
    expect(d.querySelector('[data-zeile="grund"]')?.textContent).toBe(DIALOG_TEXTE.POSITION_WAEHLEN);

    fireEvent.change(auswahl, { target: { value: "pos-raeume" } });
    expect(d.querySelector('[data-zeile="grund"]')?.textContent).toBe(MELDUNGEN.KARTE_AUSWAHL_LEER);
    fireEvent.click(within(d).getByRole("checkbox", { name: "Musikraum" }));
    await klick(within(d).getByRole("button", { name: "Hinzufügen" }));
    expect(bodies(onAktion)).toEqual([{ aktion: "hinzufuegen", positionId: "pos-raeume", auswahl: ["Musikraum"] }]);
  });

  it("frei: Stelle, Bezeichnung, Tage und Bemerkung", async () => {
    const { onAktion } = karte();
    await klick(knopf(kartenEl()!, AUSSTATTUNG_KARTE_TEXTE.hinzufuegen));
    const d = dialog();
    fireEvent.click(within(d).getByRole("radio", { name: "Freie Position" }));
    expect(d.querySelector('[data-zeile="grund"]')?.textContent).toBe(MELDUNGEN.STELLE_FEHLT);
    const stellen = [...(within(d).getByLabelText(/^Stelle/) as HTMLSelectElement).options].map((o) => o.value);
    // Nie die Führungskraft oder die Person selbst (Regel 11).
    expect(stellen).not.toContain("VORGESETZTER");
    expect(stellen).not.toContain("MITARBEITER");
    expect(stellen).toContain("HR");
    fireEvent.change(within(d).getByLabelText(/^Stelle/), { target: { value: "IT" } });
    fireEvent.change(within(d).getByLabelText(/^Bezeichnung/), { target: { value: "  Dokumentenkamera " } });
    fireEvent.change(within(d).getByLabelText(/^Fällig/), { target: { value: "−3" } });
    fireEvent.change(within(d).getByLabelText(/^Bemerkung/), { target: { value: "Für den Physikraum" } });
    await klick(within(d).getByRole("button", { name: "Hinzufügen" }));
    expect(bodies(onAktion)).toEqual([
      {
        aktion: "hinzufuegen",
        frei: { departmentKey: "IT", bezeichnung: "Dokumentenkamera", relativeDueDays: -3 },
        bemerkung: "Für den Physikraum",
      },
    ]);
  });

  it("reine Regeln: Grenzen vor dem Senden", () => {
    const u = uebersicht();
    const frei = { ...hinzufuegenStart(u.hinzufuegbar, "IT"), quelle: "frei" as const };
    expect(hinzufuegenGrund({ ...frei, freiBezeichnung: "x".repeat(121) }, u.hinzufuegbar)).toBe(MELDUNGEN.KARTE_FREI_ZU_LANG);
    expect(hinzufuegenGrund({ ...frei, freiBezeichnung: "Kamera", freiTage: "abc" }, u.hinzufuegbar)).toBe(
      MELDUNGEN.FAELLIG_UNGUELTIG,
    );
    expect(hinzufuegenGrund({ ...frei, freiBezeichnung: "Kamera", freiTage: "400" }, u.hinzufuegbar)).toBe(
      MELDUNGEN.FAELLIG_UNGUELTIG,
    );
    expect(
      hinzufuegenGrund({ ...frei, freiBezeichnung: "Kamera", bemerkung: "x".repeat(501) }, u.hinzufuegbar),
    ).toBe(MELDUNGEN.BEMERKUNG_ZU_LANG);
    expect(hinzufuegenGrund({ ...frei, freiBezeichnung: "Kamera" }, u.hinzufuegbar)).toBeNull();
    // Ohne Katalog geht es gleich frei los.
    expect(hinzufuegenStart([]).quelle).toBe("frei");
  });
});

describe("Hinweise an Stellen (E-A14, F20)", () => {
  it("Fälligkeit der Hinweis-Aufgabe ist bearbeitbar → nur `dueDate` geht hinaus", async () => {
    const { onAktion } = karte();
    await klick(knopf(hinweisEl("IT"), /^Bearbeiten…/));
    const feld = within(dialog()).getByLabelText(/^Fälligkeit der Aufgabe/) as HTMLInputElement;
    expect(feld.value).toBe("2027-01-25");
    fireEvent.change(feld, { target: { value: "2027-01-28" } });
    await klick(within(dialog()).getByRole("button", { name: "Speichern" }));
    expect(bodies(onAktion)).toEqual([{ aktion: "hinweis-aendern", departmentKey: "IT", dueDate: "2027-01-28" }]);
  });

  it("Text ändern; ein geleerter Text verweist auf „Hinweis entfernen…“", async () => {
    const { onAktion } = karte();
    await klick(knopf(hinweisEl("IT"), /^Bearbeiten…/));
    const text = within(dialog()).getByLabelText(/^Hinweis an die Stelle/);
    fireEvent.change(text, { target: { value: "" } });
    expect(dialog().querySelector('[data-zeile="grund"]')?.textContent).toBe(DIALOG_TEXTE.HINWEIS_LEER);
    fireEvent.change(text, { target: { value: "Bitte zwei Monitore." } });
    await klick(within(dialog()).getByRole("button", { name: "Speichern" }));
    expect(bodies(onAktion)).toEqual([{ aktion: "hinweis-aendern", departmentKey: "IT", hinweis: "Bitte zwei Monitore." }]);
  });

  it("„Hinweis entfernen…“ fragt nach und sendet einen leeren Hinweis", async () => {
    const { onAktion } = karte();
    await klick(knopf(hinweisEl("IT"), /^Bearbeiten…/));
    await klick(within(dialog()).getByRole("button", { name: "Hinweis entfernen…" }));
    expect(dialog().textContent).toContain("Hinweis an IT-Abteilung entfernen?");
    await klick(within(dialog()).getByRole("button", { name: "Entfernen" }));
    expect(bodies(onAktion)).toEqual([{ aktion: "hinweis-aendern", departmentKey: "IT", hinweis: "" }]);
  });

  it("„Als Position übernehmen…“: der Hinweis steht im Dialog, die Stelle ist vorbelegt", async () => {
    const { onAktion } = karte();
    await klick(knopf(hinweisEl("IT"), /^Als Position übernehmen…/));
    const d = dialog();
    expect(d.textContent).toContain("Bitte vor dem ersten Schultag einrichten.");
    fireEvent.click(within(d).getByRole("radio", { name: "Freie Position" }));
    expect((within(d).getByLabelText(/^Stelle/) as HTMLSelectElement).value).toBe("IT");
    fireEvent.change(within(d).getByLabelText(/^Bezeichnung/), { target: { value: "Zweiter Monitor" } });
    await klick(within(d).getByRole("button", { name: "Übernehmen" }));
    expect(bodies(onAktion)).toEqual([
      { aktion: "hinweis-uebernehmen", departmentKey: "IT", frei: { departmentKey: "IT", bezeichnung: "Zweiter Monitor" } },
    ]);
  });

  it("„Zur Kenntnis genommen“ sendet ohne Dialog; ein Fehler steht als Meldung in der Karte", async () => {
    const { onAktion } = karte(uebersicht(), { ausgang: { ok: false, status: 409, meldung: MELDUNGEN.KARTE_VERSAND_LAEUFT } });
    await klick(knopf(hinweisEl("IT"), /^Zur Kenntnis genommen/));
    expect(bodies(onAktion)).toEqual([{ aktion: "hinweis-gesehen", departmentKey: "IT" }]);
    expect(kartenEl()?.querySelector('[data-meldung="fehler"]')?.textContent).toContain(MELDUNGEN.KARTE_VERSAND_LAEUFT);
  });

  it("„Zur Kenntnis genommen“: danach liegt der Fokus auf dem Kartentitel, nicht auf `body`", async () => {
    // Erfolg: Der Knopf verschwindet mit dem neuen Stand (hier: Rendern mit
    // „gesehen“), der Fokus darf nicht mit ihm verloren gehen.
    const gesehen = uebersicht({
      hinweise: HINWEISE.map((h) => (h.departmentKey === "IT" ? { ...h, gesehenAm: "2027-01-20T09:00:00.000Z" } : h)),
    });
    let neuerStand!: () => void;
    const onAktion = jest.fn(async () => {
      neuerStand();
      return OK;
    });
    const { rerender } = render(<AusstattungKarte uebersicht={uebersicht()} darfBearbeiten onAktion={onAktion} />);
    neuerStand = () => rerender(<AusstattungKarte uebersicht={gesehen} darfBearbeiten onAktion={onAktion} />);
    const ausloeser = knopf(hinweisEl("IT"), /^Zur Kenntnis genommen/);
    ausloeser.focus();

    await klick(ausloeser);

    expect(within(hinweisEl("IT")).queryByRole("button", { name: /^Zur Kenntnis genommen/ })).toBeNull();
    expect(document.activeElement?.id).toBe(AUSSTATTUNG_KARTE_TITEL_ID);
    expect(kartenEl()?.querySelector('[data-meldung="ok"]')?.textContent).toContain(OK.meldung);
  });

  it("„Zur Kenntnis genommen“ abgelehnt: Fokus ebenfalls auf dem Kartentitel, die Meldung darunter", async () => {
    karte(uebersicht(), { ausgang: { ok: false, status: 409, meldung: MELDUNGEN.KARTE_VERSAND_LAEUFT } });
    const ausloeser = knopf(hinweisEl("IT"), /^Zur Kenntnis genommen/);
    ausloeser.focus();
    await klick(ausloeser);
    expect(document.activeElement?.id).toBe(AUSSTATTUNG_KARTE_TITEL_ID);
  });

  it("erledigte Hinweis-Aufgabe: „Bearbeiten…“ gesperrt mit Grund", () => {
    const erledigt = AUFGABEN.map((a) => (a.id === "i-hinweis" ? { ...a, isCompleted: true, completedAt: tag("2027-01-22") } : a));
    const u = ausstattungsUebersichtBauen({
      vorgang: vorgang(),
      darfBearbeiten: true,
      zeilen: ZEILEN,
      hinweise: HINWEISE,
      arbeitsortId: ORT,
      konfigs: KONFIGS,
      katalog: KATALOG,
      aufgaben: erledigt,
      verknuepfungen: VERKNUEPFUNGEN,
      jetzt: JETZT,
    });
    karte(u);
    expect((knopf(hinweisEl("IT"), /^Bearbeiten…/) as HTMLButtonElement).disabled).toBe(true);
    expect(hinweisEl("IT").querySelector("[data-sperrgrund]")?.textContent).toBe(MELDUNGEN.AUFGABE_ERLEDIGT);
  });

  it("„Hinweis an eine Stelle…“: nur Stellen ohne Hinweis, Text Pflicht", async () => {
    const { onAktion } = karte();
    await klick(knopf(kartenEl()!, AUSSTATTUNG_KARTE_TEXTE.hinweisNeu));
    const d = dialog();
    const stellen = [...(within(d).getByLabelText(/^Stelle/) as HTMLSelectElement).options].map((o) => o.value);
    expect(stellen).not.toContain("IT");
    expect(stellen).toContain("FACILITY");
    fireEvent.change(within(d).getByLabelText(/^Stelle/), { target: { value: "FACILITY" } });
    expect(d.querySelector('[data-zeile="grund"]')?.textContent).toBe(DIALOG_TEXTE.HINWEIS_FEHLT);
    fireEvent.change(within(d).getByLabelText(/^Hinweis an die Stelle/), { target: { value: "Spind im Keller." } });
    await klick(within(d).getByRole("button", { name: "Speichern" }));
    expect(bodies(onAktion)).toEqual([{ aktion: "hinweis-aendern", departmentKey: "FACILITY", hinweis: "Spind im Keller." }]);
  });

  it("reine Regeln: Start, Body und Grund", () => {
    const h = uebersicht().gruppen[0].hinweis!;
    const start = hinweisStart("IT", h);
    expect(start).toEqual({ stelle: "IT", text: h.text, faellig: "2027-01-25" });
    expect(hinweisBody(h, start)).toBeNull();
    expect(hinweisGrund(h, start)).toBe(DIALOG_TEXTE.KEINE_AENDERUNG);
    expect(hinweisBody(h, { ...start, faellig: "" })).toEqual({ aktion: "hinweis-aendern", departmentKey: "IT", dueDate: null });
    expect(hinweisGrund(h, { ...start, text: "x".repeat(1001) })).toBe(MELDUNGEN.HINWEIS_ZU_LANG);
  });
});

describe("Bodies und Schema", () => {
  it("jeder Body der Dialoge besteht das echte Schema der Route", () => {
    const u = uebersicht();
    const zug = u.gruppen[0].zeilen.find((z) => z.id === "z-zug") as AusstattungsZeile;
    const h = u.gruppen[0].hinweis!;
    const alle: AusstattungAktionBody[] = [
      bearbeitenAenderung(zug, "IT", { ...bearbeitenStart(zug, "IT"), auswahl: ["Dienst-E-Mail", "Schulportal", "WebUntis", "Drucker-PIN"], bemerkung: "Text", faelligkeiten: { WebUntis: "" } }).body,
      hinzufuegenBody({ ...hinzufuegenStart(u.hinzufuegbar), positionId: "pos-raeume", auswahl: ["Werkraum"], bemerkung: "Bitte" }, u.hinzufuegbar),
      hinzufuegenBody({ ...hinzufuegenStart(u.hinzufuegbar, "IT"), quelle: "frei", freiStelle: "IT", freiBezeichnung: "Kamera", freiTage: "-3" }, u.hinzufuegbar, "IT"),
      hinweisBody(h, { ...hinweisStart("IT", h), text: "Neu", faellig: "2027-01-30" })!,
      { aktion: "streichen", ausstattungId: "z-ipad" },
      { aktion: "hinweis-gesehen", departmentKey: "IT" },
    ];
    for (const body of alle) {
      const r = ausstattungAktionSchema.safeParse(body);
      expect(r.success ? null : r.error.errors[0]?.message).toBeNull();
    }
  });

  it("datumFeldWert: Fälligkeit (Mitternacht UTC) als Wert des Datumsfelds", () => {
    expect(datumFeldWert("2027-01-25T00:00:00.000Z")).toBe("2027-01-25");
    expect(datumFeldWert(null)).toBe("");
  });
});

// =============================================
// 5. Aufruf der Route und Zusatz am Checklistenpunkt
// =============================================

describe("ausstattungAktionSenden", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  function fetchAntwort(ok: boolean, status: number, json: unknown) {
    const f = jest.fn(async () => ({ ok, status, json: async () => json }));
    global.fetch = f as unknown as typeof fetch;
    return f;
  }

  it("Erfolg: POST an die Route, Meldung des Servers", async () => {
    const f = fetchAntwort(true, 200, { data: {}, meldung: "Position ergänzt." });
    const r = await ausstattungAktionSenden("onb-1", { aktion: "hinweis-gesehen", departmentKey: "IT" });
    expect(r).toEqual({ ok: true, status: 200, meldung: "Position ergänzt." });
    expect(f).toHaveBeenCalledWith("/api/onboarding/onb-1/ausstattung", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ aktion: "hinweis-gesehen", departmentKey: "IT" }),
    });
  });

  it("Ablehnung: der Text des Servers, sonst der allgemeine", async () => {
    fetchAntwort(false, 409, { error: MELDUNGEN.AUFGABE_ERLEDIGT, grund: "AUFGABE_ERLEDIGT" });
    expect(await ausstattungAktionSenden("onb-1", { aktion: "streichen", ausstattungId: "z" })).toEqual({
      ok: false,
      status: 409,
      meldung: MELDUNGEN.AUFGABE_ERLEDIGT,
    });
    fetchAntwort(false, 500, null);
    expect((await ausstattungAktionSenden("onb-1", { aktion: "streichen", ausstattungId: "z" })).meldung).toBe(
      AUSSTATTUNG_KARTE_TEXTE.fehler,
    );
  });

  it("Netzfehler: kein Status (die Seite lädt dann nicht neu)", async () => {
    global.fetch = jest.fn(async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    expect(await ausstattungAktionSenden("onb-1", { aktion: "streichen", ausstattungId: "z" })).toEqual({
      ok: false,
      status: null,
      meldung: AUSSTATTUNG_KARTE_TEXTE.verbindungsfehler,
    });
  });
});

describe("AufgabeZusatz und EntfaelltHaken", () => {
  it("entfallen: Kennzeichen und Erklärung, kein „Eilt“", () => {
    const { container } = render(
      <AufgabeZusatz item={{ isCompleted: true, eilt: true, entfaelltAm: tag("2027-01-21") }} />,
    );
    expect(container.querySelector('[data-kennzeichen="entfaellt"]')).not.toBeNull();
    expect(container.querySelector('[data-kennzeichen="eilt"]')).toBeNull();
    expect(container.textContent).toContain(ZUSATZ_TEXTE.entfaellt);
  });

  it("„Eilt“ nur an einer offenen Aufgabe", () => {
    const offen = render(<AufgabeZusatz item={{ isCompleted: false, eilt: true }} />);
    expect(offen.container.querySelector('[data-kennzeichen="eilt"]')).not.toBeNull();
    offen.unmount();
    const erledigt = render(<AufgabeZusatz item={{ isCompleted: true, eilt: true }} />);
    expect(erledigt.container.innerHTML).toBe("");
  });

  it("Bemerkung mit Beschriftung; ohne alles nichts", () => {
    const mit = render(
      <AufgabeZusatz
        item={{ isCompleted: false }}
        bemerkung={{ text: "Mit Stift und Hülle", label: bemerkungLabel("HR") }}
      />,
    );
    expect(mit.container.querySelector("[data-bemerkung]")?.textContent).toBe(
      "Bemerkung der PersonalabteilungMit Stift und Hülle",
    );
    mit.unmount();
    expect(render(<AufgabeZusatz item={{ isCompleted: false }} bemerkung={null} />).container.innerHTML).toBe("");
  });

  it("der Haken einer entfallenen Aufgabe ist gesperrt und benannt", () => {
    render(<EntfaelltHaken />);
    const haken = screen.getByRole("button", { name: ZUSATZ_TEXTE.haken }) as HTMLButtonElement;
    expect(haken.disabled).toBe(true);
    expect(istEntfallen({ entfaelltAm: tag("2027-01-21") })).toBe(true);
    expect(istEntfallen({ entfaelltAm: null })).toBe(false);
    expect(istEntfallen({})).toBe(false);
  });
});

// =============================================
// 6. Verdrahtung in der Detailseite
// =============================================

describe("Detailseite: Reiter Checkliste", () => {
  const VORGANG = "onb-1";

  function punkt(teil: Record<string, unknown> & { id: string }) {
    return {
      title: teil.id,
      category: "Ausstattung & Zugänge",
      orderIndex: 0,
      isCompleted: false,
      completedAt: null,
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
      displayId: "2027-GYM-003",
      email: "anna.beispiel@example.org",
      firstName: "Anna",
      lastName: "Beispiel",
      status: "SUPERVISOR_SUBMITTED",
      questionnaireType: "STANDARD",
      token: "tok-fb",
      invitedAt: "2027-01-08T12:00:00.000Z",
      submittedAt: "2027-01-10T12:00:00.000Z",
      supervisorSubmittedAt: "2027-01-14T09:30:00.000Z",
      supervisorToken: "tok-sv",
      supervisorEmail: "leitung@fes-minden.de",
      supervisorTokenExpiresAt: "2027-02-14T09:30:00.000Z",
      supervisorLinkSentAt: null,
      reviewedAt: null,
      completedAt: null,
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
        punkt({ id: "i-ipad", title: "Dienst-iPad (Lernmittel) bereitstellen", eilt: true }),
        punkt({ id: "i-mail", title: "Zugang einrichten: Dienst-E-Mail", isCompleted: true, completedAt: "2027-01-20T09:00:00.000Z" }),
        punkt({ id: "i-untis", title: "Zugang einrichten: WebUntis" }),
        punkt({ id: "i-chemie", title: "Schlüssel ausgeben: Fachraum Chemie", isCompleted: true, entfaelltAm: tag("2027-01-21") }),
        punkt({ id: "i-fach", title: "Fach im Lehrerzimmer bereitstellen", isCompleted: true, entfaelltAm: tag("2027-01-20") }),
      ],
      notes: [],
      _count: { notes: 0 },
      ausstattung: uebersicht(),
    } as unknown as DetailData;
  }

  function fetchVorgang() {
    const f = jest.fn(async (url: string, init?: RequestInit) => {
      if (url === `/api/onboarding/${VORGANG}/ausstattung` && init?.method === "POST") {
        return { ok: true, status: 200, json: async () => ({ data: uebersicht(), meldung: "Hinweis als zur Kenntnis genommen markiert." }) };
      }
      return { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(detail())) };
    });
    global.fetch = f as unknown as typeof fetch;
    return f;
  }

  const USER = { userId: "u-erika", email: "erika.muster@credo-gruppe.de", role: "HR_SACHBEARBEITER", firstName: "Erika", lastName: "Muster" };

  afterEach(() => {
    window.history.replaceState(null, "", "/");
    jest.restoreAllMocks();
  });

  it("Reiter-Zähler, Kopfzeile und Balken zählen ohne entfallene Aufgaben (1/3)", async () => {
    fetchVorgang();
    window.history.replaceState(null, "", "/?tab=checkliste");
    await act(async () => {
      render(<DetailContent onboardingId={VORGANG} user={USER} />);
    });
    await screen.findAllByText("2027-GYM-003");
    expect(document.querySelector('[data-pille="checkliste"]')?.textContent).toBe("1/3");
    const fortschritt = document.querySelector('[data-fortschritt="checkliste"]') as HTMLElement;
    expect(fortschritt.textContent).toContain("1 von 3 Aufgaben erledigt");
    expect(fortschritt.textContent).toContain("33%");
    // Die Karte steht zwischen Fortschritt und Liste; die entfallene Aufgabe hat einen gesperrten Haken.
    expect(kartenEl()).not.toBeNull();
    const chemie = document.querySelector('[data-aufgabe="i-chemie"]') as HTMLElement;
    expect((within(chemie).getByRole("button", { name: ZUSATZ_TEXTE.haken }) as HTMLButtonElement).disabled).toBe(true);
    // Bemerkung (nur HR) unter der Aufgabe — aus der Übersicht.
    expect(document.querySelector('[data-aufgabe="i-ipad"] [data-bemerkung]')?.textContent).toContain("Mit Stift und Hülle");
  });

  it("eine Aktion der Karte geht an die Route und lädt den Vorgang neu", async () => {
    const f = fetchVorgang();
    window.history.replaceState(null, "", "/?tab=checkliste");
    await act(async () => {
      render(<DetailContent onboardingId={VORGANG} user={USER} />);
    });
    await screen.findAllByText("2027-GYM-003");
    const vorher = f.mock.calls.length;
    await klick(knopf(hinweisEl("IT"), /^Zur Kenntnis genommen/));
    const neu = f.mock.calls.slice(vorher);
    expect(neu[0][0]).toBe(`/api/onboarding/${VORGANG}/ausstattung`);
    expect(JSON.parse(String((neu[0][1] as RequestInit).body))).toEqual({ aktion: "hinweis-gesehen", departmentKey: "IT" });
    expect(neu[1][0]).toBe(`/api/onboarding/${VORGANG}`);
    expect(kartenEl()?.querySelector('[data-meldung="ok"]')?.textContent).toContain(
      "Hinweis als zur Kenntnis genommen markiert.",
    );
  });
});

describe("Reiter Checkliste ohne Vorlage: die erste Aufgabe entsteht aus einer Aktion der Karte", () => {
  const erste: ChecklistItemData = {
    id: "i-laptop",
    title: "Dienst-Laptop / PC bereitstellen",
    category: "Ausstattung & Zugänge",
    orderIndex: -50000,
    isCompleted: false,
    completedAt: null,
    completedBy: null,
    dueDate: null,
    assignee: "IT",
    notes: null,
    herkunft: "AUSSTATTUNG",
  };

  function Huelle() {
    const [items, setItems] = useState<ChecklistItemData[]>([]);
    return (
      <TabChecklist
        checklistItems={items}
        togglingItems={new Set()}
        toggleChecklistItem={jest.fn()}
        editingNoteId={null}
        setEditingNoteId={jest.fn()}
        checklistNoteText=""
        setChecklistNoteText={jest.fn()}
        savingChecklistNote={false}
        saveChecklistNote={jest.fn()}
        checklistFehler={null}
        onAbteilungsAktion={jest.fn()}
        abteilungenDialogOffen={false}
        setAbteilungenDialogOffen={jest.fn()}
        ausstattung={uebersicht()}
        darfAusstattungBearbeiten
        onAusstattungAktion={async () => {
          // Wie die Seite: Nach der Aktion kommt der neue Stand — hier mit der ersten Aufgabe.
          setItems([erste]);
          return OK;
        }}
      />
    );
  }

  it("die Karte bleibt eingehängt: Leerzustand weicht Fortschritt und Liste, die Meldung bleibt stehen", async () => {
    render(<Huelle />);
    expect(document.querySelector('[data-leer="checkliste"]')).not.toBeNull();
    const vorher = kartenEl();
    await klick(knopf(hinweisEl("IT"), /^Zur Kenntnis genommen/));
    expect(document.querySelector('[data-leer="checkliste"]')).toBeNull();
    expect(document.querySelector('[data-fortschritt="checkliste"]')).not.toBeNull();
    expect(kartenEl()).toBe(vorher);
    expect(kartenEl()?.querySelector('[data-meldung="ok"]')?.textContent).toContain("Änderung gespeichert.");
  });
});
