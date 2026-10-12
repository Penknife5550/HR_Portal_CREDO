/**
 * @jest-environment jsdom
 */

/**
 * Reiter „Vorgesetzter“: die fünfte Karte „Ausstattung & Zugänge“
 * (src/components/ausstattung/modalitaeten-ausstattung-karte.tsx, Paket A2,
 * Feinplan S10).
 *
 * Belegt wird, was nur die Oberfläche zeigt:
 *   1. Ohne Übersicht (keine HR-Rolle: `ausstattung: null`) keine Karte.
 *   2. Je Stelle die Positionen mit gewählten Optionen und Angaben, die
 *      Bemerkung mit ihrer Herkunft, der Hinweis an die Stelle, Kennzeichen
 *      („gestrichen“, „nicht mehr im Katalog“, „ergänzt von HR …“) und die
 *      fehlende Adresse.
 *   3. Satz und Leersatz der Zustandsregel; der Verweis „Bearbeiten im Reiter
 *      Checkliste“ nur im Zustand BEARBEITBAR — nur lesend, kein Knopf zum
 *      Ändern.
 *   4. Verdrahtung: Der Reiter „Vorgesetzter“ zeigt die Karte nach „Weitere
 *      Angaben“, der Verweis wechselt in den Reiter Checkliste.
 *
 * Die Übersicht kommt aus der echten reinen Funktion
 * (`ausstattungsUebersichtBauen`); ihre Regeln hält
 * src/__tests__/lib/ausstattung.test.ts. Umgebung wie in den übrigen
 * Komponententests: jsdom im Docblock, ohne @testing-library/jest-dom.
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { KARTE_TEXTE, ModalitaetenAusstattungKarte } from "@/components/ausstattung/modalitaeten-ausstattung-karte";
import { TabSupervisor } from "@/app/(portal)/dashboard/[id]/detail-content";
import {
  MELDUNGEN,
  ausstattungsUebersichtBauen,
  type AusstattungsUebersicht,
  type UebersichtHinweisDaten,
  type UebersichtVorgangStand,
  type UebersichtZeileDaten,
} from "@/lib/ausstattung";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children }: { href: string; children?: React.ReactNode }) => <a href={href}>{children}</a>,
}));

const ORT = "org-gym";

function zeile(teil: Partial<UebersichtZeileDaten>): UebersichtZeileDaten {
  return {
    id: "z-1",
    positionId: "pos-ipad",
    departmentKey: "IT",
    art: "JA_NEIN",
    angabeSchluessel: null,
    bezeichnung: "Dienst-iPad (Lernmittel)",
    sichtbarFuer: [],
    reihenfolge: 0,
    auswahl: [],
    angabe: null,
    bemerkung: null,
    bemerkungQuelle: null,
    quelle: "FUEHRUNGSKRAFT",
    erfasstVonId: null,
    gestrichenAm: null,
    createdAt: "2027-01-10T08:00:00.000Z",
    ...teil,
  };
}

const ZEILEN: UebersichtZeileDaten[] = [
  zeile({ id: "ipad", bemerkung: "Mit Stift und Hülle", bemerkungQuelle: "FUEHRUNGSKRAFT" }),
  zeile({
    id: "zugaenge",
    positionId: "pos-zugaenge",
    art: "AUSWAHL",
    bezeichnung: "Zugänge",
    auswahl: ["Dienst-E-Mail", "WebUntis"],
    reihenfolge: 1,
  }),
  zeile({
    id: "laptop",
    positionId: "pos-laptop",
    bezeichnung: "Dienst-Laptop / PC",
    quelle: "HR",
    erfasstVonId: "u-1",
    createdAt: "2027-01-19T09:00:00.000Z",
    reihenfolge: 2,
  }),
  zeile({ id: "alt", positionId: "pos-alt", bezeichnung: "Telefon mit Durchwahl", reihenfolge: 3 }),
  zeile({
    id: "faecher",
    positionId: "pos-faecher",
    departmentKey: "FACILITY",
    art: "ANGABE",
    angabeSchluessel: "UNTERRICHTSFAECHER",
    bezeichnung: "Unterrichtsfächer",
    angabe: "Chemie, Sport",
    sichtbarFuer: ["IT"],
  }),
  zeile({
    id: "transponder",
    positionId: "pos-transponder",
    departmentKey: "FACILITY",
    bezeichnung: "Transponder/Chip",
    gestrichenAm: "2027-01-20T10:00:00.000Z",
    reihenfolge: 1,
  }),
];

const HINWEISE: UebersichtHinweisDaten[] = [
  { departmentKey: "IT", text: "Bitte vor dem ersten Schultag einrichten.", quelle: "FUEHRUNGSKRAFT", gesehenAm: null },
];

function vorgang(teil: Partial<UebersichtVorgangStand> = {}): UebersichtVorgangStand {
  return {
    status: "SUPERVISOR_SUBMITTED",
    supervisorSubmittedAt: "2027-01-14T09:30:00.000Z",
    supervisorData: { isComplete: true, mitAusstattung: true },
    ...teil,
  };
}

function uebersicht(
  teil: { vorgang?: UebersichtVorgangStand; zeilen?: UebersichtZeileDaten[]; hinweise?: UebersichtHinweisDaten[] } = {},
): AusstattungsUebersicht {
  return ausstattungsUebersichtBauen({
    vorgang: teil.vorgang ?? vorgang(),
    darfBearbeiten: true,
    zeilen: teil.zeilen ?? ZEILEN,
    hinweise: teil.hinweise ?? HINWEISE,
    arbeitsortId: ORT,
    // IT hat eine Adresse, Facility am Arbeitsort nicht
    konfigs: [{ departmentKey: "IT", departmentName: "IT-Abteilung", email: "it@example.org", organizationId: null, isActive: true }],
    // „Telefon“ hat die Verwaltung inzwischen ausgeschaltet
    katalog: ["pos-ipad", "pos-zugaenge", "pos-laptop", "pos-faecher", "pos-transponder"].map((id) => ({
      id,
      departmentKey: "IT",
      organizationId: null,
      einrichtungsarten: [],
      art: "JA_NEIN",
      angabeSchluessel: null,
      bezeichnung: id,
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
    })),
    erfasser: { "u-1": { firstName: "Anna", lastName: "Peters" } },
  });
}

function karte(): HTMLElement {
  const el = document.querySelector('[data-karte="ausstattung"]');
  if (!el) throw new Error("Karte fehlt");
  return el as HTMLElement;
}

function stelle(key: string): HTMLElement {
  const el = karte().querySelector(`[data-stelle="${key}"]`);
  if (!el) throw new Error(`Stelle ${key} fehlt`);
  return el as HTMLElement;
}

describe("ModalitaetenAusstattungKarte", () => {
  it("ohne Übersicht (keine HR-Rolle) keine Karte", () => {
    const { container: ohne } = render(<ModalitaetenAusstattungKarte uebersicht={null} />);
    expect(ohne.innerHTML).toBe("");
    const { container: fehlt } = render(<ModalitaetenAusstattungKarte uebersicht={undefined} />);
    expect(fehlt.innerHTML).toBe("");
  });

  it("je Stelle die Positionen, Optionen, Bemerkung mit Herkunft und den Hinweis", () => {
    render(<ModalitaetenAusstattungKarte uebersicht={uebersicht()} onZurCheckliste={jest.fn()} />);

    expect(screen.getByRole("heading", { name: "Ausstattung & Zugänge" })).not.toBeNull();
    expect(karte().textContent).toContain(
      "Angefordert von der Führungskraft mit den Einstellungsmodalitäten (14.01.2027).",
    );

    const it = stelle("IT");
    expect(within(it).getByRole("heading", { name: "IT-Abteilung" })).not.toBeNull();
    expect(it.textContent).toContain("Dienst-iPad (Lernmittel)");
    expect(it.textContent).toContain("Bemerkung der Führungskraft: Mit Stift und Hülle");
    expect(it.textContent).toContain("Dienst-E-Mail, WebUntis");
    expect(it.querySelector('[data-hinweis="IT"]')?.textContent).toBe(
      "Hinweis der FührungskraftBitte vor dem ersten Schultag einrichten.",
    );
  });

  it("Kennzeichen: ergänzt von HR, nicht mehr im Katalog, gestrichen", () => {
    render(<ModalitaetenAusstattungKarte uebersicht={uebersicht()} />);

    expect(stelle("IT").querySelector('[data-zeile="laptop"]')?.textContent).toContain(
      "ergänzt von HR (A. Peters), 19.01.2027",
    );
    expect(stelle("IT").querySelector('[data-zeile="alt"]')?.textContent).toContain(KARTE_TEXTE.nichtMehrImKatalog);
    expect(stelle("IT").querySelector('[data-zeile="ipad"]')?.textContent).not.toContain(KARTE_TEXTE.nichtMehrImKatalog);
    expect(stelle("FACILITY").querySelector('[data-zeile="transponder"]')?.textContent).toContain(KARTE_TEXTE.gestrichen);
  });

  it("Angabe mit Wert und wer sie sieht; Stelle ohne Adresse am Arbeitsort wird genannt", () => {
    render(<ModalitaetenAusstattungKarte uebersicht={uebersicht()} />);

    const facility = stelle("FACILITY");
    const faecher = facility.querySelector('[data-zeile="faecher"]')?.textContent ?? "";
    expect(faecher).toContain("Unterrichtsfächer");
    expect(faecher).toContain("Chemie, Sport");
    expect(faecher).toContain("sehen Facility Management und IT-Abteilung");
    expect(facility.textContent).toContain(KARTE_TEXTE.adresseFehlt);
    expect(stelle("IT").textContent).not.toContain(KARTE_TEXTE.adresseFehlt);
  });

  it("BEARBEITBAR: Verweis auf den Reiter Checkliste — sonst nur lesend, kein Knopf", () => {
    const zurCheckliste = jest.fn();
    render(<ModalitaetenAusstattungKarte uebersicht={uebersicht()} onZurCheckliste={zurCheckliste} />);

    fireEvent.click(screen.getByRole("button", { name: KARTE_TEXTE.verweis }));
    expect(zurCheckliste).toHaveBeenCalledTimes(1);
    expect(karte().querySelectorAll("button")).toHaveLength(1);
    expect(karte().querySelectorAll("input, textarea, select")).toHaveLength(0);
  });

  it("ohne Handler kein Verweis", () => {
    render(<ModalitaetenAusstattungKarte uebersicht={uebersicht()} />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("ENTWURF: Satz der Zustandsregel, kein Verweis", () => {
    render(
      <ModalitaetenAusstattungKarte
        uebersicht={uebersicht({ vorgang: vorgang({ status: "IN_PROGRESS", supervisorSubmittedAt: null, supervisorData: { isComplete: false, mitAusstattung: true } }) })}
        onZurCheckliste={jest.fn()}
      />,
    );

    expect(karte().dataset.zustand).toBe("ENTWURF");
    expect(karte().textContent).toContain(MELDUNGEN.UEBERSICHT_ENTWURF_MIT_SCHRITT);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("abgeschlossen: nur lesbar, kein Verweis", () => {
    render(
      <ModalitaetenAusstattungKarte
        uebersicht={uebersicht({ vorgang: vorgang({ status: "COMPLETED" }) })}
        onZurCheckliste={jest.fn()}
      />,
    );

    expect(karte().textContent).toContain(MELDUNGEN.UEBERSICHT_ABGESCHLOSSEN);
    expect(screen.queryByRole("button")).toBeNull();
    expect(stelle("IT").textContent).toContain("Mit Stift und Hülle");
  });

  it("leer: der Leersatz statt der Gruppen", () => {
    render(<ModalitaetenAusstattungKarte uebersicht={uebersicht({ zeilen: [], hinweise: [] })} />);

    expect(karte().textContent).toContain(MELDUNGEN.UEBERSICHT_NICHTS_ANGEFORDERT);
    expect(karte().querySelector("[data-stelle]")).toBeNull();
  });
});

describe("Reiter „Vorgesetzter“ (Verdrahtung)", () => {
  function reiter(ausstattung: AusstattungsUebersicht | null, onZurCheckliste = jest.fn()) {
    const data = {
      id: "onb-1",
      supervisorToken: null,
      supervisorTokenExpiresAt: null,
      supervisorSubmittedAt: "2027-01-14T09:30:00.000Z",
      status: "SUPERVISOR_SUBMITTED",
      supervisorData: {
        isComplete: true,
        currentStep: 5,
        mitAusstattung: true,
        betriebsstaette: "Minden",
        stellenbeschreibung: "Lehrkraft",
        kostenstellen: [],
        zusatzvereinbarungen: null,
      },
      ausstattung,
    };
    render(
      <TabSupervisor
        data={data as unknown as React.ComponentProps<typeof TabSupervisor>["data"]}
        appUrl="https://hr.example.org"
        onZurCheckliste={onZurCheckliste}
      />,
    );
    return onZurCheckliste;
  }

  it("die fünfte Karte steht nach „Weitere Angaben“, der Verweis wechselt in den Reiter Checkliste", () => {
    const zurCheckliste = reiter(uebersicht());

    const titel = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent?.trim());
    expect(titel.slice(-2)).toEqual(["Weitere Angaben", "Ausstattung & Zugänge"]);
    fireEvent.click(screen.getByRole("button", { name: KARTE_TEXTE.verweis }));
    expect(zurCheckliste).toHaveBeenCalledTimes(1);
  });

  it("ohne Übersicht (keine HR-Rolle) bleibt es bei vier Karten", () => {
    reiter(null);

    expect(document.querySelector('[data-karte="ausstattung"]')).toBeNull();
    expect(screen.queryByText("Mit Stift und Hülle")).toBeNull();
  });
});
