/**
 * @jest-environment jsdom
 */

/**
 * Neue Detailseite Vertragsende (UX-Umbau, Pilot, Feinplan Abschnitt 5).
 *
 * Geprueft wird die SEITE (`vorgaenge/vertragsende/[id]/detail.tsx` samt
 * Reitern und Dialogen) gegen einen nachgebauten Server hinter `fetch`:
 *   - je Lage genau eine `h1`, die Pille des Adapters, die Handlung in
 *     „Jetzt dran" und die Punkte des Menues — Texte aus `aktionText`,
 *     `menueText`, `vertragsendePille`; die SCHLUESSEL je Lage stehen hier
 *     ausgeschrieben (Feinplan 3.3), damit der Test mehr prueft als sich selbst;
 *   - ohne Bearbeitungsrecht nur Lesen;
 *   - jede Rueckfrage schickt genau den Aufruf aus `vertragsendeAufruf`
 *     (Methode, Adresse, Koerper). Dass DIESE Tabelle der alten Ansicht
 *     entspricht, haelt `vertragsende-seite-regeln.test.ts` fest;
 *   - Fehler der Route im Dialog, Erfolg schliesst, meldet und laedt neu;
 *   - bis der neue Stand da ist, sind Knoepfe, Menue und „Stand setzen …"
 *     gesperrt, und kein Dialog geht auf — auch nicht ueber einen Handler
 *     des alten Stands;
 *   - Reiter in der Adresse (Startwert aus `useSearchParams`, hier aus
 *     `window.location` nachgebaut), Laden, Ladefehler, Hinweise.
 *
 * Uhr: Nur `Date` steht fest (`JETZT`), Timer und Microtasks bleiben echt —
 * Radix, `waitFor` und die Promises der Aufrufe laufen wie im Browser.
 * `toast` ist ersetzt: geprueft wird der Aufruf, nicht die Radix-Meldung.
 */
import "@testing-library/jest-dom";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { axeVerstoesse } from "../hilfen/axe";
import { VertragsendeDetailAnsicht } from "@/app/(portal)/vorgaenge/vertragsende/[id]/detail";
import { vertragsendeAufruf, type AufrufArt, type AufrufWerte } from "@/app/(portal)/vorgaenge/vertragsende/[id]/aufrufe";
import { aktionText, menueText, type VertragsendeDetail } from "@/app/(portal)/vorgaenge/vertragsende/[id]/typen";
import { SEITENTITEL_ID } from "@/components/ui/seitenkopf";
import { toast } from "@/components/ui/toast";
import { vorgangPfad, vorgangslistePfad } from "@/lib/adressen";
import {
  vertragsendeMenue,
  vertragsendePille,
  vertragsendeProzessStand,
  type VertragsendeAktion,
} from "@/lib/prozess/vertragsende";
import { vertragsendeHinweise } from "@/lib/prozess/vertragsende-hinweise";

// ---------------------------------------------
// Ersatz fuer Next.js, Meldungen und die bestehenden Karten
// ---------------------------------------------

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const routerPush = jest.fn();
// `useSearchParams` liest wie in Next.js die AKTUELLE Adresse des Browsers —
// auch nach `history.replaceState` (Next.js gleicht beides seit 14.1 ab).
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush, replace: jest.fn(), refresh: jest.fn() }),
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

jest.mock("@/components/ui/toast", () => ({ toast: { ok: jest.fn(), fehler: jest.fn(), hinweis: jest.fn() } }));

// Die Karten des Reiters Dokumente und das Mailprotokoll sind unveraendert
// eingebunden und haben eigene Tests; hier zaehlt nur, DASS sie im richtigen
// Reiter stehen — und dass ihre h3 (wie die echten Karten) unter einer h2
// steht, nicht direkt unter der h1.
jest.mock("@/components/template-generation-section", () => ({
  TemplateGenerationSection: () => (
    <div>
      <h3>Dokument aus Vorlage erstellen</h3>
      <p>Attrappe Vorlagen</p>
    </div>
  ),
}));
jest.mock("@/components/dokumentenpaket-section", () => ({
  DokumentenpaketSection: () => (
    <div>
      <h3>Unterlagen versenden</h3>
      <p>Attrappe Dokumentenpaket</p>
    </div>
  ),
}));
jest.mock("@/components/individuelle-mail/individuelle-mail-karte", () => ({
  IndividuelleMailKarte: () => (
    <div>
      <h3>Individuelle E-Mail</h3>
      <p>Attrappe Individuelle E-Mail</p>
    </div>
  ),
}));
jest.mock("@/components/vorgangs-mails/mail-protokoll", () => ({
  MailProtokoll: () => (
    <div>
      <h3>E-Mails zu diesem Vorgang</h3>
      <p>Attrappe Mailprotokoll</p>
    </div>
  ),
}));

const toastOk = toast.ok as jest.Mock;
const toastFehler = toast.fehler as jest.Mock;

// axe ueber die ganze Seite dauert im vollen Lauf ein Vielfaches der Vorgabe.
jest.setTimeout(30_000);

// ---------------------------------------------
// Uhr: nur Date festhalten
// ---------------------------------------------

/** 01.06.2026, 12:00 Uhr deutscher Zeit — wie in `prozess-vertragsende.test.ts`. */
const JETZT = new Date("2026-06-01T10:00:00.000Z");

beforeEach(() => {
  jest.useFakeTimers({
    now: JETZT,
    doNotFake: [
      "hrtime",
      "nextTick",
      "performance",
      "queueMicrotask",
      "requestAnimationFrame",
      "cancelAnimationFrame",
      "requestIdleCallback",
      "cancelIdleCallback",
      "setImmediate",
      "clearImmediate",
      "setInterval",
      "clearInterval",
      "setTimeout",
      "clearTimeout",
    ],
  });
});

afterEach(() => {
  jest.useRealTimers();
});

// ---------------------------------------------
// Vorgaenge je Lage
// ---------------------------------------------

const ID = "0b6c1f3e-4a7d-4c2b-9e51-7d2f8a9c1e04";
const OFFBOARDING = { id: "5f2e8d1c-3b4a-4e6f-8a9b-0c1d2e3f4a5b", displayId: "OFF-2026-BK-001", status: "INITIATED" };

/** Ein Vorgang im Status „Angelegt"; jede Lage legt ihre Felder darueber. */
function vorgang(teil: Partial<VertragsendeDetail> = {}): VertragsendeDetail {
  return {
    id: ID,
    displayId: "VE-2026-BK-004",
    status: "ANGELEGT",
    decision: "OFFEN",
    employeeFirstName: "Maria",
    employeeLastName: "Muster",
    employeeEmail: "maria.muster@example.org",
    employeePersonalNr: "4711",
    contractStartDate: "2024-10-01T00:00:00.000Z",
    // Vier Monate nach JETZT: keine Entfristungswarnung, Frist-Ampel „Warnung".
    contractEndDate: "2026-09-30T00:00:00.000Z",
    createdAt: "2026-05-04T08:00:00.000Z",
    supervisorEmail: null,
    supervisorLinkSentAt: null,
    supervisorTokenExpiresAt: null,
    supervisorRespondedAt: null,
    supervisorDeclineReason: null,
    lastSupervisorReminderAt: null,
    supervisorReminderCount: 0,
    contractSignedReturnedAt: null,
    vorstandAbgestimmt: null,
    vorstandAbstimmungVermerk: null,
    mavStatus: null,
    mavConsultedAt: null,
    completedAt: null,
    befristungsart: "SACHGRUNDLOS",
    bisherigeBefristungMonate: 12,
    bisherigeVerlaengerungen: 1,
    contractEndDateGeaendertAm: null,
    weitereMandanten: [],
    organization: { id: "org-bk", name: "Berufskolleg", mandantNumber: "12" },
    renewalData: null,
    offboarding: null,
    ...teil,
  };
}

const ANGELEGT: Partial<VertragsendeDetail> = {};
const ANFRAGE: Partial<VertragsendeDetail> = {
  status: "ANFRAGE_VORGESETZTER",
  supervisorEmail: "fuehrung@example.org",
  supervisorLinkSentAt: "2026-05-22T08:00:00.000Z",
  supervisorTokenExpiresAt: "2026-06-05T08:00:00.000Z",
};
const ANFRAGE_ABGELAUFEN: Partial<VertragsendeDetail> = { ...ANFRAGE, supervisorTokenExpiresAt: "2026-05-29T08:00:00.000Z" };
/**
 * So hinterlaesst `/supervisor-link` eine Anfrage, deren Mail nicht hinausging:
 * neuer Link gespeichert (neues Ablaufdatum), Versandzeitpunkt zurueck auf null.
 */
const NICHT_ZUGESTELLT: Partial<VertragsendeDetail> = {
  ...ANFRAGE,
  supervisorLinkSentAt: null,
  supervisorTokenExpiresAt: "2026-06-15T10:00:00.000Z",
};
const UEBERNAHME: Partial<VertragsendeDetail> = {
  ...ANFRAGE,
  status: "RUECKMELDUNG_UEBERNAHME",
  decision: "UEBERNAHME",
  supervisorRespondedAt: "2026-05-27T09:00:00.000Z",
};
const VERTRAG: Partial<VertragsendeDetail> = {
  ...UEBERNAHME,
  status: "VERTRAG_UNTERSCHRIEBEN",
  contractSignedReturnedAt: "2026-05-30T09:00:00.000Z",
};
const ABGELEHNT: Partial<VertragsendeDetail> = {
  ...ANFRAGE,
  status: "RUECKMELDUNG_KEINE_UEBERNAHME",
  decision: "KEINE_UEBERNAHME",
  supervisorRespondedAt: "2026-05-27T09:00:00.000Z",
  supervisorDeclineReason: "Die Stelle entfällt.",
};
const KEINE_UEBERNAHME: Partial<VertragsendeDetail> = {
  ...ABGELEHNT,
  status: "ENTSCHEIDUNG_KEINE_UEBERNAHME",
  offboarding: OFFBOARDING,
};
const ABGESCHLOSSEN: Partial<VertragsendeDetail> = {
  ...VERTRAG,
  status: "ABGESCHLOSSEN",
  mavStatus: "ANGEHOERT",
  completedAt: "2026-05-31T09:00:00.000Z",
};
const STORNIERT: Partial<VertragsendeDetail> = { ...ANFRAGE, status: "STORNIERT" };

// ---------------------------------------------
// Server hinter fetch
// ---------------------------------------------

interface Antwort {
  status: number;
  body: unknown;
}

interface Aufzeichnung {
  url: string;
  method: string;
  body?: string;
  headers?: Record<string, string>;
}

const server = {
  /** Was `GET /api/contract-end/[id]` liefert — nach einer Handlung der neue Stand. */
  vorgang: vorgang(),
  /** Ersetzt die Antwort des Ladens (Ladefehler). */
  ladeAntwort: null as Antwort | null,
  /** Haelt das Laden an, bis die Probe es freigibt. */
  ladenWartet: null as Promise<void> | null,
  /** Antworten der uebrigen Aufrufe je „METHODE Adresse"; eine Funktion darf warten. */
  antworten: new Map<string, Antwort | (() => Promise<Antwort>)>(),
  aufrufe: [] as Aufzeichnung[],
};

const VORGANG_URL = `/api/contract-end/${ID}`;
const ladeAufrufe = () => server.aufrufe.filter((a) => a.method === "GET" && a.url === VORGANG_URL);
const schreibAufrufe = () => server.aufrufe.filter((a) => a.method !== "GET");

const fetchVorher = global.fetch;

beforeEach(() => {
  server.vorgang = vorgang();
  server.ladeAntwort = null;
  server.ladenWartet = null;
  server.antworten = new Map();
  server.aufrufe = [];
  toastOk.mockReset();
  toastFehler.mockReset();
  routerPush.mockReset();
  window.history.replaceState(null, "", "/");
  global.fetch = jest.fn(async (eingabe: RequestInfo | URL, init?: RequestInit) => {
    const url = String(eingabe);
    const method = init?.method ?? "GET";
    server.aufrufe.push({
      url,
      method,
      body: typeof init?.body === "string" ? init.body : undefined,
      headers: init?.headers as Record<string, string> | undefined,
    });
    let antwort: Antwort;
    if (method === "GET" && url === VORGANG_URL) {
      // Der Stand im Moment der Anfrage, wie bei einem echten Server: Haelt
      // die Probe das Laden an, kommt trotzdem DIESER Stand zurueck — so
      // unterscheiden sich zwei ueberlappende Ladevorgaenge.
      const stand = server.ladeAntwort ?? { status: 200, body: server.vorgang };
      if (server.ladenWartet) await server.ladenWartet;
      antwort = stand;
    } else {
      const eintrag = server.antworten.get(`${method} ${url}`);
      antwort =
        typeof eintrag === "function"
          ? await eintrag()
          : (eintrag ?? { status: 500, body: { error: `Keine Antwort hinterlegt: ${method} ${url}` } });
    }
    const body = JSON.parse(JSON.stringify(antwort.body ?? null));
    return { ok: antwort.status >= 200 && antwort.status < 300, status: antwort.status, json: async () => body } as Response;
  }) as typeof fetch;
});

afterAll(() => {
  global.fetch = fetchVorher;
});

/** Ein Versprechen, das die Probe selbst einloest. */
function aufgeschoben<T = void>() {
  let einloesen!: (wert: T) => void;
  const versprechen = new Promise<T>((r) => {
    einloesen = r;
  });
  return { versprechen, einloesen };
}

// ---------------------------------------------
// Hilfen
// ---------------------------------------------

const NAME = "Maria Muster";

/** Die Adresse des Vorgangs, optional mit `?tab=…` — so, wie der Browser sie zeigt. */
function adresseSetzen(tab?: string) {
  window.history.replaceState(null, "", vorgangPfad("vertragsende", ID, tab));
}

async function seite(
  teil: Partial<VertragsendeDetail>,
  { darfBearbeiten = true, tab }: { darfBearbeiten?: boolean; tab?: string } = {},
) {
  server.vorgang = vorgang(teil);
  adresseSetzen(tab);
  const ergebnis = render(<VertragsendeDetailAnsicht vorgangId={ID} darfBearbeiten={darfBearbeiten} />);
  await screen.findByRole("heading", { level: 1, name: NAME });
  return ergebnis;
}

/** Der Seitenkopf (das `header` in `main` hat keine eigene Rolle). */
function kopf(): HTMLElement {
  const header = document.querySelector("main header");
  if (!(header instanceof HTMLElement)) throw new Error("Kein Seitenkopf");
  return header;
}

/** Der Kasten „Jetzt dran" der Prozessleiste — oder null. */
const jetztDran = () => document.querySelector<HTMLElement>("[data-jetzt-dran]");

/** Knoepfe und Verweise in „Jetzt dran", in der Reihenfolge der Seite. */
function handlungenInJetztDran(): string[] {
  const kasten = jetztDran();
  return kasten ? Array.from(kasten.querySelectorAll("button, a")).map((e) => e.textContent ?? "") : [];
}

async function menueOeffnen() {
  const knopf = screen.getByRole("button", { name: "Weitere Aktionen" });
  act(() => knopf.focus());
  fireEvent.keyDown(knopf, { key: "Enter" });
  await screen.findByRole("menu");
  return knopf;
}

async function menuePunkte(): Promise<string[]> {
  await menueOeffnen();
  const punkte = screen.getAllByRole("menuitem").map((p) => p.textContent ?? "");
  fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
  return punkte;
}

/** Die Ereignisse einer Maustaste — Radix waehlt einen Reiter schon bei `mousedown`. */
function klick(element: HTMLElement) {
  fireEvent.mouseDown(element);
  act(() => element.focus());
  fireEvent.mouseUp(element);
  fireEvent.click(element);
}

const reiterGewaehlt = () =>
  screen.getAllByRole("tab").find((r) => r.getAttribute("aria-selected") === "true")?.textContent;

// =============================================
// Je Lage: Kopf, „Jetzt dran", Menue
// =============================================

interface LageFall {
  lage: string;
  teil: Partial<VertragsendeDetail>;
  pille: string;
  aktion?: VertragsendeAktion;
  neben?: VertragsendeAktion;
  menue: VertragsendeAktion[];
  axe?: boolean;
}

const LAGEN: LageFall[] = [
  { lage: "Angelegt", teil: ANGELEGT, pille: "Anfrage offen", aktion: "anfrage-senden", menue: ["offboarding-anlegen", "stornieren"], axe: true },
  {
    lage: "Anfrage offen, Link gültig",
    teil: ANFRAGE,
    pille: "Wartet auf Führungskraft",
    aktion: "erinnern",
    menue: ["anfrage-neu-senden", "offboarding-anlegen", "stornieren"],
  },
  {
    lage: "Anfrage mit abgelaufenem Link",
    teil: ANFRAGE_ABGELAUFEN,
    pille: "Link abgelaufen",
    aktion: "anfrage-neu-senden",
    menue: ["offboarding-anlegen", "stornieren"],
  },
  {
    lage: "Anfrage nicht zugestellt",
    teil: NICHT_ZUGESTELLT,
    pille: "Anfrage nicht zugestellt",
    aktion: "anfrage-senden",
    menue: ["offboarding-anlegen", "stornieren"],
    axe: true,
  },
  {
    lage: "Rückmeldung Übernahme",
    teil: UEBERNAHME,
    pille: "Übernahme · Vertrag offen",
    aktion: "vertrag-erfassen",
    neben: "dokumente",
    menue: ["abschliessen", "stornieren"],
  },
  {
    lage: "Vertrag unterschrieben",
    teil: VERTRAG,
    pille: "Vertrag unterschrieben",
    aktion: "abschliessen",
    neben: "dokumente",
    menue: ["stornieren"],
  },
  {
    lage: "Rückmeldung keine Übernahme",
    teil: ABGELEHNT,
    pille: "Abgelehnt · Offboarding offen",
    aktion: "offboarding-anlegen",
    menue: ["stornieren"],
  },
  {
    lage: "Keine Übernahme mit Offboarding",
    teil: KEINE_UEBERNAHME,
    pille: "Keine Übernahme",
    aktion: "zum-offboarding",
    neben: "dokumente",
    menue: ["abschliessen", "stornieren"],
    axe: true,
  },
  { lage: "Abgeschlossen", teil: ABGESCHLOSSEN, pille: "Abgeschlossen", menue: [] },
  { lage: "Storniert", teil: STORNIERT, pille: "Storniert", menue: [], axe: true },
];

describe("je Lage: Kopf, „Jetzt dran“ und Menü", () => {
  it.each(LAGEN.map((f) => [f.lage, f] as const))("%s", async (_lage, fall) => {
    await seite(fall.teil);
    const v = vorgang(fall.teil);

    // Die Erwartung der Probe stimmt mit dem Adapter ueberein — sonst prueft
    // der Rest etwas, das die Seite gar nicht zeigen soll.
    const stand = vertragsendeProzessStand(v, JETZT);
    expect(vertragsendePille(v, JETZT).text).toBe(fall.pille);
    expect(stand.jetztDran?.aktion).toBe(fall.aktion);
    expect(stand.jetztDran?.nebenAktion).toBe(fall.neben);
    expect(vertragsendeMenue(v, JETZT)).toEqual(fall.menue);

    // Genau eine h1: der Name.
    const titel = screen.getAllByRole("heading", { level: 1 });
    expect(titel).toHaveLength(1);
    expect(titel[0]).toHaveTextContent(NAME);
    expect(titel[0].id).toBe(SEITENTITEL_ID);

    // Eine Pille im Kopf, mit dem Text des Adapters.
    expect(within(kopf()).getByText(fall.pille)).toBeInTheDocument();
    expect(kopf()).toHaveTextContent("Berufskolleg · VE-2026-BK-004 · Vertragsende 30.09.2026");

    // „Jetzt dran": die Handlung zuerst, dann die Nebenhandlung.
    const erwartet = [fall.aktion, fall.neben].filter((a): a is VertragsendeAktion => Boolean(a)).map((a) => aktionText(a, v));
    expect(handlungenInJetztDran()).toEqual(erwartet);
    if (fall.aktion === "zum-offboarding") {
      // Reine Navigation: ein Verweis, kein Knopf.
      const verweis = within(jetztDran()!).getByRole("link", { name: aktionText("zum-offboarding", v) });
      expect(verweis).toHaveAttribute("href", vorgangPfad("offboarding", OFFBOARDING.id));
    } else if (fall.aktion) {
      expect(within(jetztDran()!).getByRole("button", { name: aktionText(fall.aktion, v) })).toBeInTheDocument();
    }

    if (fall.menue.length === 0) {
      // Endstatus: kein „Jetzt dran", kein Knopf, kein Menue.
      expect(jetztDran()).toBeNull();
      expect(document.querySelector("[data-ende]")).not.toBeNull();
      expect(screen.queryByRole("button", { name: "Weitere Aktionen" })).toBeNull();
    } else {
      expect(await menuePunkte()).toEqual(fall.menue.map((a) => menueText(a, v)));
    }

    if (fall.axe) expect(await axeVerstoesse(document.body)).toEqual([]);
  });

  it("„Stornieren“ steht im Menü als kritischer Punkt am Ende", async () => {
    await seite(ANFRAGE);
    await menueOeffnen();
    const punkte = screen.getAllByRole("menuitem");
    expect(punkte[punkte.length - 1]).toHaveTextContent("Vorgang stornieren …");
    expect(punkte[punkte.length - 1].className).toContain("text-critical");
  });
});

// =============================================
// Ohne Bearbeitungsrecht
// =============================================

describe("ohne Bearbeitungsrecht", () => {
  /** Knoepfe ausserhalb der Schritte — die Schritte selbst wechseln nur den Reiter. */
  const knoepfeAusserhalbDerSchritte = () =>
    screen.queryAllByRole("button").filter((k) => !k.closest('ol[aria-label="Ablauf"]'));

  it.each([
    ["Rückmeldung Übernahme", UEBERNAHME],
    ["Anfrage offen", ANFRAGE],
    ["Keine Übernahme mit Offboarding", KEINE_UEBERNAHME],
  ] as const)("%s: kein Handlungsknopf, kein Menü, kein „Stand setzen …“, kein Reiter E-Mails", async (_lage, teil) => {
    await seite(teil, { darfBearbeiten: false });
    expect(knoepfeAusserhalbDerSchritte()).toEqual([]);
    expect(screen.queryByRole("button", { name: "Weitere Aktionen" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Stand setzen …" })).toBeNull();
    expect(screen.queryByRole("tab", { name: "E-Mails" })).toBeNull();
    expect(screen.getAllByRole("tab").map((r) => r.textContent)).toEqual(["Übersicht", "Vertragsdaten", "Dokumente"]);
    // „Jetzt dran" steht da, nur ohne Knopf und Verweis.
    expect(jetztDran()).not.toBeNull();
    expect(handlungenInJetztDran()).toEqual([]);
  });

  it("die Daten stehen trotzdem da – Kopf, „Jetzt dran“, Übersicht, Mitarbeitervertretung", async () => {
    await seite(UEBERNAHME, { darfBearbeiten: false });
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(within(kopf()).getByText("Übernahme · Vertrag offen")).toBeInTheDocument();
    expect(jetztDran()).toHaveTextContent("Verlängerungsvertrag erstellen und unterschrieben zurückholen");
    const person = screen.getByRole("region", { name: "Person und Vertrag" });
    expect(person).toHaveTextContent("maria.muster@example.org");
    expect(person).toHaveTextContent("4711");
    expect(screen.getByRole("region", { name: "Führungskraft" })).toHaveTextContent("fuehrung@example.org");
    expect(screen.getByRole("region", { name: "Mitarbeitervertretung" })).toHaveTextContent("Offen");
    expect(await axeVerstoesse(document.body)).toEqual([]);
  });

  it("der Schritt „Vertrag“ wechselt auch ohne Recht nur den Reiter", async () => {
    await seite(UEBERNAHME, { darfBearbeiten: false });
    const schritt = within(screen.getByRole("list", { name: "Ablauf" })).getByRole("button");
    fireEvent.click(schritt);
    expect(reiterGewaehlt()).toBe("Dokumente");
    expect(screen.getByText("Attrappe Vorlagen")).toBeInTheDocument();
    expect(schreibAufrufe()).toEqual([]);
  });

  it.each(["e-mails", "mails"])("steht „?tab=%s“ ohne Recht in der Adresse, zeigt die Ansicht die Übersicht und kein Mailprotokoll", async (tab) => {
    await seite(UEBERNAHME, { darfBearbeiten: false, tab });
    expect(reiterGewaehlt()).toBe("Übersicht");
    expect(screen.getByRole("region", { name: "Person und Vertrag" })).toBeInTheDocument();
    expect(screen.queryByText("Attrappe Mailprotokoll")).toBeNull();
  });
});

// =============================================
// Rueckfragen: derselbe Aufruf wie `vertragsendeAufruf`
// =============================================

interface DialogFall {
  fall: string;
  art: AufrufArt;
  teil: Partial<VertragsendeDetail>;
  /** Knopf auf der Seite oder Punkt im Menue. */
  ausloeser: { knopf: string } | { menue: string };
  rolle: "dialog" | "alertdialog";
  titel: string;
  bestaetigen: string;
  /** Eingabe im Dialog, bevor bestaetigt wird. */
  eingabe?: (dialog: HTMLElement) => void;
  werte?: AufrufWerte;
  /** Antwort der Route bei Erfolg. */
  antwort: Antwort;
  meldung: string;
  /** Der neue Stand nach der Handlung — das zweite Laden liefert ihn. */
  nachher: Partial<VertragsendeDetail>;
}

function adresseEintragen(adresse: string) {
  return (dialog: HTMLElement) => {
    fireEvent.change(within(dialog).getByLabelText("E-Mail der Führungskraft"), { target: { value: adresse } });
  };
}

const NEUE_ANFRAGE: Partial<VertragsendeDetail> = {
  ...ANFRAGE,
  supervisorLinkSentAt: "2026-06-01T10:00:00.000Z",
  supervisorTokenExpiresAt: "2026-06-15T10:00:00.000Z",
};

const DIALOGE: DialogFall[] = [
  {
    fall: "Anfrage senden (Knopf, Adresse eingeben)",
    art: "anfrage-senden",
    teil: ANGELEGT,
    ausloeser: { knopf: "Anfrage senden …" },
    rolle: "dialog",
    titel: "Anfrage an die Führungskraft senden",
    bestaetigen: "Anfrage senden",
    // Leerraum um die Adresse geht nicht an die Route.
    eingabe: adresseEintragen("  fuehrung@example.org "),
    werte: { supervisorEmail: "fuehrung@example.org" },
    antwort: { status: 201, body: { id: ID, supervisorEmail: "fuehrung@example.org" } },
    meldung: "Anfrage an fuehrung@example.org gesendet.",
    nachher: NEUE_ANFRAGE,
  },
  {
    fall: "Anfrage neu senden (Menü, Adresse vorbelegt)",
    art: "anfrage-senden",
    teil: ANFRAGE,
    ausloeser: { menue: "Anfrage neu senden …" },
    rolle: "alertdialog",
    titel: "Anfrage neu senden?",
    bestaetigen: "Anfrage neu senden",
    werte: { supervisorEmail: "fuehrung@example.org" },
    antwort: { status: 201, body: { id: ID, supervisorEmail: "fuehrung@example.org" } },
    meldung: "Neue Anfrage an fuehrung@example.org gesendet.",
    nachher: NEUE_ANFRAGE,
  },
  {
    fall: "Anfrage neu senden (Knopf bei abgelaufenem Link, neue Adresse)",
    art: "anfrage-senden",
    teil: ANFRAGE_ABGELAUFEN,
    ausloeser: { knopf: "Anfrage neu senden …" },
    rolle: "alertdialog",
    titel: "Anfrage neu senden?",
    bestaetigen: "Anfrage neu senden",
    eingabe: adresseEintragen("leitung@example.org"),
    werte: { supervisorEmail: "leitung@example.org" },
    antwort: { status: 201, body: { id: ID, supervisorEmail: "leitung@example.org" } },
    meldung: "Neue Anfrage an leitung@example.org gesendet.",
    nachher: { ...NEUE_ANFRAGE, supervisorEmail: "leitung@example.org" },
  },
  {
    fall: "Offboarding anlegen (Knopf nach Ablehnung)",
    art: "offboarding-anlegen",
    teil: ABGELEHNT,
    ausloeser: { knopf: "Offboarding anlegen …" },
    rolle: "alertdialog",
    titel: "Offboarding anlegen?",
    bestaetigen: "Offboarding anlegen",
    antwort: { status: 201, body: { contractEnd: { id: ID }, offboarding: { id: OFFBOARDING.id, displayId: OFFBOARDING.displayId } } },
    meldung: "Offboarding OFF-2026-BK-001 angelegt.",
    nachher: KEINE_UEBERNAHME,
  },
  {
    fall: "Offboarding anlegen (Menü, ohne Anfrage)",
    art: "offboarding-anlegen",
    teil: ANGELEGT,
    ausloeser: { menue: "Ohne Anfrage: Offboarding anlegen …" },
    rolle: "alertdialog",
    titel: "Offboarding anlegen?",
    bestaetigen: "Offboarding anlegen",
    antwort: { status: 201, body: { contractEnd: { id: ID }, offboarding: { id: OFFBOARDING.id, displayId: OFFBOARDING.displayId } } },
    meldung: "Offboarding OFF-2026-BK-001 angelegt.",
    nachher: { status: "ENTSCHEIDUNG_KEINE_UEBERNAHME", decision: "KEINE_UEBERNAHME", offboarding: OFFBOARDING },
  },
  {
    fall: "Unterschriebenen Vertrag erfassen (Knopf)",
    art: "vertrag-erfassen",
    teil: UEBERNAHME,
    ausloeser: { knopf: "Unterschriebenen Vertrag erfassen …" },
    rolle: "alertdialog",
    titel: "Unterschriebener Vertrag liegt vor?",
    bestaetigen: "Vertrag erfassen",
    antwort: { status: 200, body: { id: ID, status: "VERTRAG_UNTERSCHRIEBEN" } },
    meldung: "Unterschriebener Vertrag erfasst.",
    nachher: VERTRAG,
  },
  {
    fall: "Abschließen (Knopf)",
    art: "abschliessen",
    teil: VERTRAG,
    ausloeser: { knopf: "Abschließen …" },
    rolle: "alertdialog",
    titel: "Vorgang abschließen?",
    bestaetigen: "Abschließen",
    antwort: { status: 200, body: { id: ID, status: "ABGESCHLOSSEN" } },
    meldung: "Vorgang abgeschlossen.",
    nachher: ABGESCHLOSSEN,
  },
  {
    fall: "Abschließen (Menü, keine Übernahme)",
    art: "abschliessen",
    teil: KEINE_UEBERNAHME,
    ausloeser: { menue: "Abschließen …" },
    rolle: "alertdialog",
    titel: "Vorgang abschließen?",
    bestaetigen: "Abschließen",
    antwort: { status: 200, body: { id: ID, status: "ABGESCHLOSSEN" } },
    meldung: "Vorgang abgeschlossen.",
    nachher: { ...KEINE_UEBERNAHME, status: "ABGESCHLOSSEN", completedAt: "2026-06-01T10:00:00.000Z" },
  },
  {
    fall: "Stornieren (Menü)",
    art: "stornieren",
    teil: ANFRAGE,
    ausloeser: { menue: "Vorgang stornieren …" },
    rolle: "alertdialog",
    titel: "Vorgang stornieren?",
    bestaetigen: "Stornieren",
    antwort: { status: 200, body: { id: ID, status: "STORNIERT" } },
    meldung: "Vorgang storniert.",
    nachher: STORNIERT,
  },
  {
    fall: "Stand der Mitarbeitervertretung (Knopf in der Übersicht, Auswahl)",
    art: "mav-setzen",
    teil: VERTRAG,
    ausloeser: { knopf: "Stand setzen …" },
    rolle: "dialog",
    titel: "Stand der Mitarbeitervertretung",
    bestaetigen: "Stand speichern",
    eingabe: (dialog) => fireEvent.click(within(dialog).getByLabelText("Zugestimmt")),
    werte: { mavStatus: "ZUGESTIMMT" },
    antwort: { status: 200, body: { id: ID, mavStatus: "ZUGESTIMMT" } },
    meldung: "Stand der Mitarbeitervertretung gespeichert.",
    nachher: { ...VERTRAG, mavStatus: "ZUGESTIMMT", mavConsultedAt: "2026-06-01T10:00:00.000Z" },
  },
];

async function ausloesen(ausloeser: DialogFall["ausloeser"]) {
  if ("knopf" in ausloeser) {
    const knopf = screen.getByRole("button", { name: ausloeser.knopf });
    act(() => knopf.focus());
    fireEvent.click(knopf);
    return knopf;
  }
  const knopf = await menueOeffnen();
  fireEvent.click(screen.getByRole("menuitem", { name: ausloeser.menue }));
  return knopf;
}

async function dialogOeffnen(fall: Pick<DialogFall, "ausloeser" | "rolle" | "titel">) {
  const ausloeser = await ausloesen(fall.ausloeser);
  const dialog = await screen.findByRole(fall.rolle, { name: fall.titel });
  return { ausloeser, dialog };
}

describe("Rückfragen senden denselben Aufruf wie `vertragsendeAufruf`", () => {
  it.each(DIALOGE.map((f) => [f.fall, f] as const))("%s", async (_name, fall) => {
    await seite(fall.teil);
    const { dialog } = await dialogOeffnen(fall);
    fall.eingabe?.(dialog);

    const aufruf = vertragsendeAufruf(fall.art, ID, fall.werte);
    server.antworten.set(`${aufruf.method} ${aufruf.url}`, fall.antwort);
    server.vorgang = vorgang(fall.nachher);
    // Vor dem Bestaetigen ist nichts geschrieben.
    expect(schreibAufrufe()).toEqual([]);

    fireEvent.click(within(dialog).getByRole("button", { name: fall.bestaetigen }));

    // Erfolg: Meldung, Dialog zu, zweites Laden mit dem neuen Stand.
    await waitFor(() => expect(toastOk).toHaveBeenCalledWith(fall.meldung));
    await waitFor(() => expect(screen.queryByRole(fall.rolle)).toBeNull());
    await waitFor(() => expect(ladeAufrufe()).toHaveLength(2));
    const neuePille = vertragsendePille(vorgang(fall.nachher), JETZT).text;
    await waitFor(() => expect(within(kopf()).getByText(neuePille)).toBeInTheDocument());

    // Genau EIN schreibender Aufruf: Methode, Adresse, Koerper wie die Tabelle.
    expect(schreibAufrufe()).toEqual([
      {
        url: aufruf.url,
        method: aufruf.method,
        body: aufruf.body ? JSON.stringify(aufruf.body) : undefined,
        headers: aufruf.body ? { "Content-Type": "application/json" } : undefined,
      },
    ]);
    expect(toastOk).toHaveBeenCalledTimes(1);
    expect(toastFehler).not.toHaveBeenCalled();
  });

  it("„Erinnerung senden“ fragt nicht: Klick → POST /reminder sofort, gesperrt bis zum neuen Stand", async () => {
    await seite(ANFRAGE);
    const aufruf = vertragsendeAufruf("erinnern", ID);
    const reminder = aufgeschoben<Antwort>();
    server.antworten.set(`${aufruf.method} ${aufruf.url}`, () => reminder.versprechen);
    server.vorgang = vorgang({ ...ANFRAGE, supervisorReminderCount: 1, lastSupervisorReminderAt: "2026-06-01T10:00:00.000Z" });

    const knopf = screen.getByRole("button", { name: "Erinnerung senden" });
    fireEvent.click(knopf);

    // Kein Dialog, der Aufruf ist schon unterwegs.
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("alertdialog")).toBeNull();
    await waitFor(() => expect(schreibAufrufe()).toEqual([{ url: aufruf.url, method: "POST", body: undefined, headers: undefined }]));

    // Waehrenddessen gesperrt: Ein zweiter Klick schickt keine zweite Mail.
    const gesperrt = screen.getByRole("button", { name: "Erinnerung wird gesendet …" });
    expect(gesperrt).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(gesperrt);
    expect(schreibAufrufe()).toHaveLength(1);

    await act(async () => reminder.einloesen({ status: 200, body: { ok: true } }));
    await waitFor(() => expect(toastOk).toHaveBeenCalledWith("Erinnerung an die Führungskraft gesendet."));
    await waitFor(() => expect(ladeAufrufe()).toHaveLength(2));
    await waitFor(() => expect(screen.getByRole("region", { name: "Führungskraft" })).toHaveTextContent("1× erinnert, zuletzt 01.06.2026"));
    expect(screen.getByRole("button", { name: "Erinnerung senden" })).not.toHaveAttribute("aria-disabled");
    expect(schreibAufrufe()).toHaveLength(1);
  });

  it("während „Erinnerung senden“ läuft, sind die Menüpunkte gesperrt – danach wieder frei", async () => {
    await seite(ANFRAGE);
    const reminder = aufgeschoben<Antwort>();
    server.antworten.set(`POST ${VORGANG_URL}/reminder`, () => reminder.versprechen);
    fireEvent.click(screen.getByRole("button", { name: "Erinnerung senden" }));
    await screen.findByRole("button", { name: "Erinnerung wird gesendet …" });

    await menueOeffnen();
    const neuSenden = screen.getByRole("menuitem", { name: "Anfrage neu senden …" });
    expect(neuSenden).toHaveAttribute("aria-disabled", "true");
    for (const punkt of screen.getAllByRole("menuitem")) expect(punkt).toHaveAttribute("aria-disabled", "true");
    // Gewaehlt werden kann er nicht: kein Dialog, kein zweiter Aufruf.
    fireEvent.click(neuSenden);
    expect(screen.queryByRole("alertdialog")).toBeNull();
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(schreibAufrufe()).toHaveLength(1);

    await act(async () => reminder.einloesen({ status: 200, body: { ok: true } }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Erinnerung senden" })).not.toHaveAttribute("aria-disabled"));
    await menueOeffnen();
    expect(screen.getByRole("menuitem", { name: "Anfrage neu senden …" })).not.toHaveAttribute("aria-disabled");
  });

  it("„Erinnerung senden“ mit Fehler der Route: Fehlermeldung, kein Dialog", async () => {
    await seite(ANFRAGE);
    server.antworten.set(`POST ${VORGANG_URL}/reminder`, { status: 409, body: { error: "Der Link ist abgelaufen." } });
    fireEvent.click(screen.getByRole("button", { name: "Erinnerung senden" }));
    await waitFor(() => expect(toastFehler).toHaveBeenCalledWith("Der Link ist abgelaufen."));
    expect(toastOk).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

// =============================================
// Fehler der Route, Fokus, Texte der Dialoge
// =============================================

describe("Dialoge: Fehler, Fokus, Texte", () => {
  it.each([
    ["Anfrage senden", DIALOGE[0], { status: 400, body: { error: "Ungültige E-Mail-Adresse" } }],
    ["Stornieren", DIALOGE[8], { status: 400, body: { error: "Statuswechsel nicht erlaubt." } }],
    ["Stand der Mitarbeitervertretung", DIALOGE[9], { status: 500, body: {} }],
  ] as const)("%s: der Fehler der Route steht im Dialog, der Dialog bleibt offen", async (_name, fall, fehlerAntwort) => {
    await seite(fall.teil);
    const { dialog } = await dialogOeffnen(fall);
    fall.eingabe?.(dialog);
    const aufruf = vertragsendeAufruf(fall.art, ID, fall.werte);
    server.antworten.set(`${aufruf.method} ${aufruf.url}`, fehlerAntwort);

    fireEvent.click(within(dialog).getByRole("button", { name: fall.bestaetigen }));

    // Ohne eigenen Text der Route der Ersatztext der Tabelle.
    const text = "error" in fehlerAntwort.body ? fehlerAntwort.body.error : aufruf.ersatzFehler;
    const alarm = await within(dialog).findByRole("alert");
    expect(alarm).toHaveTextContent(text);
    // Ein neuer Fehler bekommt den Fokus (Regel des Dialogs).
    await waitFor(() => expect(document.activeElement).toBe(alarm));
    expect(screen.getByRole(fall.rolle, { name: fall.titel })).toBe(dialog);
    expect(toastOk).not.toHaveBeenCalled();
    expect(ladeAufrufe()).toHaveLength(1);
    expect(schreibAufrufe()).toHaveLength(1);
    expect(await axeVerstoesse(document.body)).toEqual([]);
  });

  it("Anfrage senden: Fokus im Feld, Sperrgrund ohne Adresse, Formatfehler einmal im Dialog, am Feld nur aria-invalid, ohne Aufruf", async () => {
    await seite(ANGELEGT);
    const { dialog } = await dialogOeffnen(DIALOGE[0]);
    const feld = within(dialog).getByLabelText("E-Mail der Führungskraft");
    await waitFor(() => expect(document.activeElement).toBe(feld));
    expect(dialog).toHaveTextContent("Bitte die E-Mail-Adresse der Führungskraft eintragen.");
    expect(within(dialog).getByRole("button", { name: "Anfrage senden" })).toHaveAttribute("aria-disabled", "true");

    fireEvent.change(feld, { target: { value: "fuehrung.example.org" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Anfrage senden" }));
    expect(feld).toHaveAttribute("aria-invalid", "true");
    // Der Text steht EINMAL da — in der Fehlerzeile des Dialogs, nicht noch einmal unter dem Feld.
    expect(within(dialog).getAllByText("Das ist keine E-Mail-Adresse.")).toEqual([within(dialog).getByRole("alert")]);
    expect(feld).not.toHaveAttribute("aria-describedby");
    expect(schreibAufrufe()).toEqual([]);
    expect(await axeVerstoesse(document.body)).toEqual([]);
  });

  it("Anfrage senden: Enter mit ungültiger Adresse – der Fehler wird angesagt und bekommt den Fokus, kein Aufruf", async () => {
    await seite(ANGELEGT);
    const { dialog } = await dialogOeffnen(DIALOGE[0]);
    const feld = within(dialog).getByLabelText("E-Mail der Führungskraft");
    fireEvent.change(feld, { target: { value: "ohne-at" } });
    const formular = feld.closest("form");
    if (!formular) throw new Error("Kein Formular um das Feld");
    fireEvent.submit(formular);

    const alarm = await within(dialog).findByRole("alert");
    expect(alarm).toHaveTextContent("Das ist keine E-Mail-Adresse.");
    await waitFor(() => expect(document.activeElement).toBe(alarm));
    // Am Feld nur `aria-invalid`; der Text steht einmal, im Dialog.
    expect(feld).toHaveAttribute("aria-invalid", "true");
    expect(within(dialog).getAllByText("Das ist keine E-Mail-Adresse.")).toEqual([alarm]);
    // Kein Aufruf ueber das erste Laden hinaus.
    expect(server.aufrufe).toHaveLength(1);
    expect(await axeVerstoesse(document.body)).toEqual([]);

    // Tippen nimmt den Fehler weg, im Feld und im Dialog.
    fireEvent.change(feld, { target: { value: "ohne-at@example.org" } });
    expect(within(dialog).queryByRole("alert")).toBeNull();
    expect(feld).not.toHaveAttribute("aria-invalid");
  });

  it("Anfrage senden: derselbe Formatfehler noch einmal wird wieder angesagt und bekommt wieder den Fokus – per Enter wie per Knopf", async () => {
    // Der Dialog sagt nur einen NEUEN Fehler an. Ohne Leeren dazwischen bliebe
    // ein zweites Enter mit unveraenderter Eingabe stumm, der Fokus im Feld.
    await seite(ANGELEGT);
    const { dialog } = await dialogOeffnen(DIALOGE[0]);
    const feld = within(dialog).getByLabelText("E-Mail der Führungskraft");
    const formular = feld.closest("form");
    if (!formular) throw new Error("Kein Formular um das Feld");
    fireEvent.change(feld, { target: { value: "ohne-at" } });
    fireEvent.submit(formular);
    const erster = await within(dialog).findByRole("alert");
    await waitFor(() => expect(document.activeElement).toBe(erster));

    // Zurueck ins Feld, unveraendert noch einmal Enter.
    act(() => feld.focus());
    fireEvent.submit(formular);
    await waitFor(() => expect(document.activeElement).toBe(within(dialog).getByRole("alert")));
    const zweiter = within(dialog).getByRole("alert");
    // Eine NEU eingefuegte Fehlerzeile — die sagen Screenreader wieder an.
    expect(zweiter).not.toBe(erster);
    expect(zweiter).toHaveTextContent("Das ist keine E-Mail-Adresse.");

    // Dasselbe ueber den Knopf.
    const senden = within(dialog).getByRole("button", { name: "Anfrage senden" });
    act(() => senden.focus());
    fireEvent.click(senden);
    await waitFor(() => expect(document.activeElement).toBe(within(dialog).getByRole("alert")));
    expect(within(dialog).getByRole("alert")).not.toBe(zweiter);

    // Immer genau einmal sichtbar, am Feld nur `aria-invalid`, kein Aufruf.
    expect(within(dialog).getAllByText("Das ist keine E-Mail-Adresse.")).toHaveLength(1);
    expect(feld).toHaveAttribute("aria-invalid", "true");
    expect(schreibAufrufe()).toEqual([]);
  });

  it("Anfrage senden: ein alter Fehler der Route kommt nach einem Formatfehler beim Tippen nicht wieder hoch", async () => {
    await seite(ANGELEGT);
    const { dialog } = await dialogOeffnen(DIALOGE[0]);
    const feld = within(dialog).getByLabelText("E-Mail der Führungskraft");
    server.antworten.set(`POST ${VORGANG_URL}/supervisor-link`, { status: 400, body: { error: "Ungültige E-Mail-Adresse" } });
    fireEvent.change(feld, { target: { value: "a@b" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Anfrage senden" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Ungültige E-Mail-Adresse");

    fireEvent.change(feld, { target: { value: "ohne-at" } });
    fireEvent.submit(feld.closest("form")!);
    await waitFor(() => expect(within(dialog).getByRole("alert")).toHaveTextContent("Das ist keine E-Mail-Adresse."));

    act(() => feld.focus());
    fireEvent.change(feld, { target: { value: "ohne-at@" } });
    expect(within(dialog).queryByRole("alert")).toBeNull();
    // Der Fokus bleibt beim Tippen im Feld.
    expect(document.activeElement).toBe(feld);
    expect(schreibAufrufe()).toHaveLength(1);
  });

  it("Anfrage neu senden: Rückfrage mit Fokus auf „Abbrechen“; Eingaben gehen nicht verloren", async () => {
    await seite(ANFRAGE);
    const { dialog } = await dialogOeffnen(DIALOGE[1]);
    await waitFor(() => expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "Abbrechen" })));
    expect(within(dialog).getByLabelText("E-Mail der Führungskraft")).toHaveValue("fuehrung@example.org");

    const beschreibung = document.getElementById(dialog.getAttribute("aria-describedby") ?? "")?.textContent ?? "";
    expect(beschreibung).toContain("der bisherige wird ungültig");
    // Die Route legt die Vertragsdaten per `upsert` ohne Aenderung an: Kein
    // Satz darf behaupten, Eingaben gingen verloren.
    const saetze = beschreibung.split(/(?<=\.)\s+/);
    const ueberEingaben = saetze.filter((s) => /Eingabe/.test(s));
    expect(ueberEingaben.length).toBeGreaterThan(0);
    for (const satz of ueberEingaben) {
      expect(satz).toMatch(/bleiben erhalten/);
      expect(satz).not.toMatch(/zurückgesetzt|verworfen|verloren|gelöscht/);
    }
    expect(await axeVerstoesse(document.body)).toEqual([]);
  });

  /** Oeffnet einen Dialog, liest seinen ganzen Text und schliesst ihn wieder. */
  async function dialogText(fall: Pick<DialogFall, "ausloeser" | "rolle" | "titel">): Promise<string> {
    const { dialog } = await dialogOeffnen(fall);
    const text = dialog.textContent ?? "";
    fireEvent.click(within(dialog).getByRole("button", { name: "Abbrechen" }));
    await waitFor(() => expect(screen.queryByRole(fall.rolle)).toBeNull());
    return text;
  }

  const OFFBOARDING_OHNE_RUECKMELDUNG = {
    ausloeser: { menue: "Ohne Rückmeldung: Offboarding anlegen …" },
    rolle: "alertdialog",
    titel: "Offboarding anlegen?",
  } as const;
  const STORNO = { ausloeser: { menue: "Vorgang stornieren …" }, rolle: "alertdialog", titel: "Vorgang stornieren?" } as const;

  it("gültiger Link: Offboarding und Stornieren sagen, dass der Link der Führungskraft ungültig wird", async () => {
    await seite(ANFRAGE);
    expect(await dialogText(OFFBOARDING_OHNE_RUECKMELDUNG)).toContain("Der Link der Führungskraft wird damit ungültig.");
    expect(await dialogText(STORNO)).toContain("Der Link der Führungskraft wird damit ungültig, Erinnerungen entfallen.");
  });

  it("abgelaufener Link: keine Rückfrage behauptet „ungültig“; „Anfrage neu senden“ sagt „bereits abgelaufen“", async () => {
    await seite(ANFRAGE_ABGELAUFEN);
    for (const fall of [OFFBOARDING_OHNE_RUECKMELDUNG, STORNO]) {
      const text = await dialogText(fall);
      expect({ titel: fall.titel, ungueltig: /ungültig|Erinnerungen entfallen/.test(text) }).toEqual({
        titel: fall.titel,
        ungueltig: false,
      });
    }

    const { dialog } = await dialogOeffnen({
      ausloeser: { knopf: "Anfrage neu senden …" },
      rolle: "alertdialog",
      titel: "Anfrage neu senden?",
    });
    const beschreibung = document.getElementById(dialog.getAttribute("aria-describedby") ?? "")?.textContent ?? "";
    expect(beschreibung).toContain("Die Führungskraft bekommt einen neuen Link; der bisherige ist bereits abgelaufen.");
    expect(dialog.textContent).not.toMatch(/ungültig/);
  });

  it("Abbrechen schliesst ohne Aufruf; der Fokus geht an den Auslöser zurück", async () => {
    await seite(UEBERNAHME);
    const { ausloeser, dialog } = await dialogOeffnen(DIALOGE[5]);
    fireEvent.click(within(dialog).getByRole("button", { name: "Abbrechen" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(ausloeser));
    expect(schreibAufrufe()).toEqual([]);
    expect(ladeAufrufe()).toHaveLength(1);
  });

  // Im Browser schliesst der Dialog, BEVOR der neue Stand da ist: Der Fokus
  // kehrt erst zum Ausloeser zurueck, und erst das Neuladen nimmt ihn weg.
  // Deshalb haelt die Probe das Laden an — sonst kaeme der neue Stand schon
  // vor dem Schliessen, und der Dialog faende den Seitentitel selbst
  // (`fokusZiel`), ohne dass die Seite etwas dazutun muesste.
  it("verschwindet der Auslöser mit dem neuen Stand (Menü nach dem Stornieren), bekommt der Seitentitel den Fokus", async () => {
    await seite(ANFRAGE);
    const fall = DIALOGE[8];
    const { ausloeser, dialog } = await dialogOeffnen(fall);
    server.antworten.set(`PATCH ${VORGANG_URL}`, fall.antwort);
    server.vorgang = vorgang(STORNIERT);
    const laden = aufgeschoben();
    server.ladenWartet = laden.versprechen;
    fireEvent.click(within(dialog).getByRole("button", { name: "Stornieren" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    await waitFor(() => expect(ladeAufrufe()).toHaveLength(2));
    await waitFor(() => expect(document.activeElement).toBe(ausloeser));
    expect(ausloeser).toHaveAccessibleName("Weitere Aktionen");

    await act(async () => laden.einloesen());
    await waitFor(() => expect(screen.queryByRole("button", { name: "Weitere Aktionen" })).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(document.getElementById(SEITENTITEL_ID)));
  });

  it("wechselt die Handlung in „Jetzt dran“, bleibt der Fokus nicht auf dem Knopf der NEUEN Handlung", async () => {
    // Nach „Anfrage senden" steht dort „Erinnerung senden" — ohne Rueckfrage.
    // Laege der Fokus darauf, schickte ein zweites Enter sofort eine Mail.
    await seite(ANGELEGT);
    const fall = DIALOGE[0];
    const { ausloeser, dialog } = await dialogOeffnen(fall);
    fall.eingabe?.(dialog);
    server.antworten.set(`POST ${VORGANG_URL}/supervisor-link`, fall.antwort);
    server.vorgang = vorgang(fall.nachher);
    const laden = aufgeschoben();
    server.ladenWartet = laden.versprechen;
    fireEvent.click(within(dialog).getByRole("button", { name: "Anfrage senden" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(ladeAufrufe()).toHaveLength(2));
    await waitFor(() => expect(document.activeElement).toBe(ausloeser));
    expect(ausloeser).toHaveTextContent("Anfrage senden …");

    await act(async () => laden.einloesen());
    const erinnern = await screen.findByRole("button", { name: "Erinnerung senden" });
    await waitFor(() => expect(document.activeElement).toBe(document.getElementById(SEITENTITEL_ID)));
    expect(document.activeElement).not.toBe(erinnern);
  });

  it("Abschließen nennt offene Punkte, sperrt aber nicht", async () => {
    await seite(UEBERNAHME);
    const { dialog } = await dialogOeffnen({ ausloeser: { menue: "Abschließen …" }, rolle: "alertdialog", titel: "Vorgang abschließen?" });
    expect(dialog).toHaveTextContent("Der Stand der Mitarbeitervertretung ist noch offen.");
    expect(dialog).toHaveTextContent("Es ist kein unterschriebener Vertrag erfasst.");
    expect(within(dialog).getByRole("button", { name: "Abschließen" })).not.toHaveAttribute("aria-disabled");
  });

  it("Offboarding anlegen nennt Namen und letzten Arbeitstag", async () => {
    await seite(ABGELEHNT);
    const { dialog } = await dialogOeffnen(DIALOGE[3]);
    expect(dialog).toHaveTextContent("Für Maria Muster startet ein neuer Offboarding-Vorgang");
    expect(dialog).toHaveTextContent("30.09.2026");
  });

  it("Stand der Mitarbeitervertretung: Vorauswahl des gespeicherten Stands, Fokus darauf", async () => {
    await seite({ ...VERTRAG, mavStatus: "ANGEHOERT" });
    const { dialog } = await dialogOeffnen(DIALOGE[9]);
    const angehoert = within(dialog).getByLabelText("Angehört");
    expect(angehoert).toBeChecked();
    await waitFor(() => expect(document.activeElement).toBe(angehoert));
    expect(await axeVerstoesse(document.body)).toEqual([]);
  });
});

// =============================================
// Versandergebnis: nicht zugestellt, Webhook
// =============================================

/**
 * `/supervisor-link` und `/reminder` melden seit 10/2026, ob die Mail
 * hinausging (`mailStatus`, src/lib/contract-end-versand.ts). Nicht zugestellt
 * heisst bei der Anfrage: 502/409 MIT gespeichertem neuen Link — die Seite
 * muss neu laden, der Dialog bleibt offen.
 */
describe("Versandergebnis", () => {
  const MELDUNG_FAILED =
    "Die Anfrage an die Führungskraft konnte nicht versendet werden: Zeitüberschreitung. Die Anfrage gilt als nicht gesendet. Der zuvor versendete Link gilt nicht mehr. Bitte senden Sie die Anfrage später erneut.";
  const beschreibungVon = (dialog: HTMLElement) =>
    document.getElementById(dialog.getAttribute("aria-describedby") ?? "")?.textContent ?? "";

  it("Anfrage nicht zugestellt (502 mit mailStatus): Meldung im Dialog, Dialog offen und bedienbar, die Seite lädt dahinter neu – ein neuer Versuch im selben Dialog geht", async () => {
    await seite(ANFRAGE);
    const fall = DIALOGE[1];
    const { dialog } = await dialogOeffnen(fall);
    const beschreibung = beschreibungVon(dialog);
    expect(beschreibung).toContain("der bisherige wird ungültig");

    server.antworten.set(`POST ${VORGANG_URL}/supervisor-link`, {
      status: 502,
      body: { error: MELDUNG_FAILED, mailStatus: "FAILED" },
    });
    server.vorgang = vorgang(NICHT_ZUGESTELLT);
    // Das Neuladen haelt an: So zeigt sich, dass der Dialog WAEHRENDDESSEN bedienbar bleibt.
    const laden = aufgeschoben();
    server.ladenWartet = laden.versprechen;
    fireEvent.click(within(dialog).getByRole("button", { name: fall.bestaetigen }));

    const alarm = await within(dialog).findByRole("alert");
    expect(alarm).toHaveTextContent(MELDUNG_FAILED);
    await waitFor(() => expect(document.activeElement).toBe(alarm));
    // Zugleich mit der Meldung sagt die Rueckfrage, was die Route sagt: Der
    // bisherige Link gilt schon nicht mehr (ein neuer Versuch ersetzt den
    // nie zugestellten, nicht den alten).
    const nachFehlschlag = beschreibungVon(dialog);
    expect(nachFehlschlag).toContain("der bisherige gilt bereits nicht mehr");
    expect(nachFehlschlag).not.toContain("wird ungültig");
    // Die Seite laedt dahinter neu — der Dialog bleibt offen, nichts ist gesperrt.
    await waitFor(() => expect(ladeAufrufe()).toHaveLength(2));
    expect(screen.getByRole("alertdialog", { name: fall.titel })).toBe(dialog);
    for (const name of [fall.bestaetigen, "Abbrechen", "Dialog schließen"]) {
      expect({ name, gesperrt: within(dialog).getByRole("button", { name }).getAttribute("aria-disabled") }).toEqual({
        name,
        gesperrt: null,
      });
    }
    expect(toastOk).not.toHaveBeenCalled();
    expect(toastFehler).not.toHaveBeenCalled();

    // Der neue Stand ist da: hinter dem Dialog „nicht zugestellt“, der Dialog
    // unveraendert offen, Fokus und Text nicht gesprungen.
    await act(async () => laden.einloesen());
    await waitFor(() => expect(within(kopf()).getByText("Anfrage nicht zugestellt")).toBeInTheDocument());
    expect(screen.getByRole("alertdialog", { name: fall.titel })).toBe(dialog);
    expect(document.activeElement).toBe(within(dialog).getByRole("alert"));
    // Der neue Stand („nicht zugestellt") laesst den Text nicht noch einmal springen.
    expect(beschreibungVon(dialog)).toBe(nachFehlschlag);
    expect(within(dialog).getByLabelText("E-Mail der Führungskraft")).toHaveValue("fuehrung@example.org");
    expect(schreibAufrufe()).toHaveLength(1);
    expect(toastOk).not.toHaveBeenCalled();

    // Neuer Versuch im selben Dialog — diesmal geht die Mail hinaus.
    server.antworten.set(`POST ${VORGANG_URL}/supervisor-link`, {
      status: 201,
      body: { id: ID, supervisorEmail: "fuehrung@example.org", mailStatus: "SENT" },
    });
    server.vorgang = vorgang(NEUE_ANFRAGE);
    fireEvent.click(within(dialog).getByRole("button", { name: fall.bestaetigen }));
    await waitFor(() => expect(toastOk).toHaveBeenCalledWith("Neue Anfrage an fuehrung@example.org gesendet."));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    await waitFor(() => expect(ladeAufrufe()).toHaveLength(3));
    await waitFor(() => expect(within(kopf()).getByText("Wartet auf Führungskraft")).toBeInTheDocument());
    expect(schreibAufrufe()).toHaveLength(2);
    expect(toastOk).toHaveBeenCalledTimes(1);
    expect(toastFehler).not.toHaveBeenCalled();
  });

  it("ein neuer Versuch, während die Seite noch neu lädt, geht auch – kommt die ältere Antwort zuletzt, bleibt der jüngere Stand", async () => {
    await seite(ANGELEGT);
    const fall = DIALOGE[0];
    const { dialog } = await dialogOeffnen(fall);
    fall.eingabe?.(dialog);
    server.antworten.set(`POST ${VORGANG_URL}/supervisor-link`, {
      status: 409,
      body: { error: "Die Anfrage an die Führungskraft wurde nicht versendet: Vorlage deaktiviert.", mailStatus: "SKIPPED" },
    });
    // Erste Anfrage gescheitert: Status zurueck auf ANGELEGT, Adresse bleibt.
    server.vorgang = vorgang({ supervisorEmail: "fuehrung@example.org", supervisorTokenExpiresAt: "2026-06-15T10:00:00.000Z" });
    const ladenAlt = aufgeschoben();
    server.ladenWartet = ladenAlt.versprechen;
    fireEvent.click(within(dialog).getByRole("button", { name: fall.bestaetigen }));
    await within(dialog).findByRole("alert");
    await waitFor(() => expect(ladeAufrufe()).toHaveLength(2));

    server.antworten.set(`POST ${VORGANG_URL}/supervisor-link`, fall.antwort);
    server.vorgang = vorgang(fall.nachher);
    const ladenNeu = aufgeschoben();
    server.ladenWartet = ladenNeu.versprechen;
    fireEvent.click(within(dialog).getByRole("button", { name: fall.bestaetigen }));
    await waitFor(() => expect(toastOk).toHaveBeenCalledWith(fall.meldung));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(ladeAufrufe()).toHaveLength(3));

    // Erst kommt der Stand nach dem ZWEITEN Versuch; die Seite ist bis dahin
    // gesperrt und danach frei.
    await act(async () => ladenNeu.einloesen());
    expect(await screen.findByRole("button", { name: "Erinnerung senden" })).not.toHaveAttribute("aria-disabled");
    expect(within(kopf()).getByText("Wartet auf Führungskraft")).toBeInTheDocument();

    // Dann die aeltere Antwort (Stand nach dem ersten, gescheiterten Versuch):
    // Sie wird verworfen und setzt die Seite nicht zurueck.
    await act(async () => ladenAlt.einloesen());
    expect(within(kopf()).getByText("Wartet auf Führungskraft")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Anfrage senden …" })).toBeNull();
    expect(screen.getByRole("button", { name: "Erinnerung senden" })).not.toHaveAttribute("aria-disabled");
    expect(schreibAufrufe()).toHaveLength(2);
  });

  it("schließt der Dialog nach dem Fehlschlag vor dem neuen Stand, ist die Seite bis dahin gesperrt", async () => {
    await seite(ANFRAGE);
    const fall = DIALOGE[1];
    const { ausloeser, dialog } = await dialogOeffnen(fall);
    server.antworten.set(`POST ${VORGANG_URL}/supervisor-link`, {
      status: 502,
      body: { error: MELDUNG_FAILED, mailStatus: "FAILED" },
    });
    server.vorgang = vorgang(NICHT_ZUGESTELLT);
    const laden = aufgeschoben();
    server.ladenWartet = laden.versprechen;
    fireEvent.click(within(dialog).getByRole("button", { name: fall.bestaetigen }));
    await within(dialog).findByRole("alert");
    await waitFor(() => expect(ladeAufrufe()).toHaveLength(2));

    // Abbrechen, waehrend der neue Stand noch laedt: Die Seite zeigt den alten
    // Stand — „Erinnerung senden" zu einem Link, den es nicht mehr gibt.
    fireEvent.click(within(dialog).getByRole("button", { name: "Abbrechen" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(ausloeser));
    const erinnern = screen.getByRole("button", { name: "Erinnerung senden" });
    expect(erinnern).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(erinnern);
    expect(schreibAufrufe()).toHaveLength(1);

    // Der neue Stand ist da: „nicht zugestellt", der Knopf dazu frei.
    await act(async () => laden.einloesen());
    await waitFor(() => expect(within(kopf()).getByText("Anfrage nicht zugestellt")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Erinnerung senden" })).toBeNull();
    expect(screen.getByRole("button", { name: "Anfrage senden …" })).not.toHaveAttribute("aria-disabled");
    expect(schreibAufrufe()).toHaveLength(1);
  });

  it("Anfrage über den Webhook (201 mit mailStatus WEBHOOK): die Meldung sagt das, nicht „gesendet“", async () => {
    await seite(ANGELEGT);
    const fall = DIALOGE[0];
    const { dialog } = await dialogOeffnen(fall);
    fall.eingabe?.(dialog);
    server.antworten.set(`POST ${VORGANG_URL}/supervisor-link`, {
      status: 201,
      body: { id: ID, supervisorEmail: "fuehrung@example.org", mailStatus: "WEBHOOK" },
    });
    server.vorgang = vorgang(fall.nachher);
    fireEvent.click(within(dialog).getByRole("button", { name: fall.bestaetigen }));
    await waitFor(() =>
      expect(toastOk).toHaveBeenCalledWith(
        "Anfrage für fuehrung@example.org an den Webhook weitergegeben (die E-Mail-Vorlage im Portal ist ausgeschaltet).",
      ),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(ladeAufrufe()).toHaveLength(2));
    expect(toastOk).toHaveBeenCalledTimes(1);
  });

  it("Erinnerung nicht zugestellt (409 mit mailStatus SKIPPED): Fehlermeldung der Route, die Seite lädt neu", async () => {
    await seite(ANFRAGE);
    const meldung = "Die Erinnerung wurde nicht versendet: Vorlage deaktiviert. Sie wurde nicht gezählt.";
    server.antworten.set(`POST ${VORGANG_URL}/reminder`, { status: 409, body: { error: meldung, mailStatus: "SKIPPED" } });
    fireEvent.click(screen.getByRole("button", { name: "Erinnerung senden" }));
    await waitFor(() => expect(toastFehler).toHaveBeenCalledWith(meldung));
    await waitFor(() => expect(ladeAufrufe()).toHaveLength(2));
    await waitFor(() => expect(screen.getByRole("button", { name: "Erinnerung senden" })).not.toHaveAttribute("aria-disabled"));
    expect(toastOk).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Erinnerung über den Webhook (200 mit mailStatus WEBHOOK): eigener Satz; SENT wie bisher", async () => {
    await seite(ANFRAGE);
    server.antworten.set(`POST ${VORGANG_URL}/reminder`, { status: 200, body: { ok: true, mailStatus: "WEBHOOK" } });
    fireEvent.click(screen.getByRole("button", { name: "Erinnerung senden" }));
    await waitFor(() =>
      expect(toastOk).toHaveBeenCalledWith(
        "Erinnerung an den Webhook weitergegeben (die E-Mail-Vorlage im Portal ist ausgeschaltet).",
      ),
    );
    await waitFor(() => expect(screen.getByRole("button", { name: "Erinnerung senden" })).not.toHaveAttribute("aria-disabled"));

    server.antworten.set(`POST ${VORGANG_URL}/reminder`, { status: 200, body: { ok: true, mailStatus: "SENT" } });
    fireEvent.click(screen.getByRole("button", { name: "Erinnerung senden" }));
    await waitFor(() => expect(toastOk).toHaveBeenLastCalledWith("Erinnerung an die Führungskraft gesendet."));
    expect(toastFehler).not.toHaveBeenCalled();
  });

  it("Lage „nicht zugestellt“: Pille, „Jetzt dran“ mit Adresse, Knopf „Anfrage senden …“, Übersicht „Nicht zugestellt“ ohne „Link gültig bis“", async () => {
    await seite(NICHT_ZUGESTELLT);
    expect(within(kopf()).getByText("Anfrage nicht zugestellt")).toBeInTheDocument();

    const kasten = jetztDran()!;
    expect(kasten).toHaveTextContent("Anfrage wurde nicht zugestellt – erneut senden");
    expect(kasten).toHaveTextContent(
      "Die E-Mail an fuehrung@example.org ging nicht hinaus; die Führungskraft hat keinen gültigen Link.",
    );
    expect(handlungenInJetztDran()).toEqual(["Anfrage senden …"]);
    // Der Schritt „Anfrage“ sagt es auch.
    expect(screen.getByRole("list", { name: "Ablauf" })).toHaveTextContent("HR · nicht zugestellt");

    const fk = screen.getByRole("region", { name: "Führungskraft" });
    const anfrageVom = within(fk).getByText("Anfrage vom").parentElement!;
    expect(anfrageVom).toHaveTextContent("Nicht zugestellt");
    expect(within(fk).queryByText("Link gültig bis")).toBeNull();
    expect(await axeVerstoesse(document.body)).toEqual([]);

    // Der Knopf oeffnet die Anfrage mit der bisherigen Adresse im Feld.
    const { dialog } = await dialogOeffnen({
      ausloeser: { knopf: "Anfrage senden …" },
      rolle: "dialog",
      titel: "Anfrage an die Führungskraft senden",
    });
    const feld = within(dialog).getByLabelText("E-Mail der Führungskraft");
    expect(feld).toHaveValue("fuehrung@example.org");
    await waitFor(() => expect(document.activeElement).toBe(feld));
    expect(schreibAufrufe()).toEqual([]);
  });
});

// =============================================
// Reiter
// =============================================

describe("Reiter", () => {
  it("?tab=dokumente in der Adresse öffnet den Reiter Dokumente mit den Karten", async () => {
    await seite(UEBERNAHME, { tab: "dokumente" });
    expect(reiterGewaehlt()).toBe("Dokumente");
    expect(screen.getByText("Attrappe Vorlagen")).toBeInTheDocument();
    expect(screen.getByText("Attrappe Dokumentenpaket")).toBeInTheDocument();
    expect(screen.getByText("Attrappe Individuelle E-Mail")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Person und Vertrag" })).toBeNull();
  });

  it("?tab=e-mails zeigt das Mailprotokoll", async () => {
    await seite(UEBERNAHME, { tab: "e-mails" });
    expect(reiterGewaehlt()).toBe("E-Mails");
    expect(screen.getByText("Attrappe Mailprotokoll")).toBeInTheDocument();
  });

  it.each([
    ["mails", "E-Mails"],
    ["Renewal", "Vertragsdaten"],
    ["unbekannt", "Übersicht"],
  ])("?tab=%s (Alias, Groß-/Kleinschreibung, Unbekanntes) startet im Reiter %s", async (tab, reiter) => {
    await seite(UEBERNAHME, { tab });
    expect(reiterGewaehlt()).toBe(reiter);
  });

  it("zweimal ?tab=: es gilt der erste Wert", async () => {
    server.vorgang = vorgang(UEBERNAHME);
    window.history.replaceState(null, "", `${vorgangPfad("vertragsende", ID)}?tab=dokumente&tab=e-mails`);
    render(<VertragsendeDetailAnsicht vorgangId={ID} darfBearbeiten />);
    await screen.findByRole("heading", { level: 1, name: NAME });
    expect(reiterGewaehlt()).toBe("Dokumente");
  });

  it("Zurück/Vor: Die Ansicht startet im Reiter der AKTUELLEN Adresse, nicht in dem des ersten Aufrufs", async () => {
    // Erster Aufruf mit ?tab=dokumente, dann Wechsel auf „Vertragsdaten“ —
    // die Adresse traegt jetzt diesen Reiter.
    const { unmount } = await seite(UEBERNAHME, { tab: "dokumente" });
    klick(screen.getByRole("tab", { name: "Vertragsdaten" }));
    expect(window.location.search).toBe("?tab=vertragsdaten");
    unmount();

    // Zurueck auf die Seite: Next.js haengt die Ansicht neu ein; die Adresse
    // ist die gewechselte, nicht die des ersten Aufrufs.
    render(<VertragsendeDetailAnsicht vorgangId={ID} darfBearbeiten />);
    await screen.findByRole("heading", { level: 1, name: NAME });
    expect(reiterGewaehlt()).toBe("Vertragsdaten");

    // Ein Verlaufseintrag mit anderem Reiter (Vor/Zurueck auf eine andere Adresse).
    cleanup();
    adresseSetzen("dokumente");
    render(<VertragsendeDetailAnsicht vorgangId={ID} darfBearbeiten />);
    await screen.findByRole("heading", { level: 1, name: NAME });
    expect(reiterGewaehlt()).toBe("Dokumente");
  });

  it("ein Wechsel schreibt den Reiter in die Adresse, „Übersicht“ ohne ?tab=", async () => {
    await seite(UEBERNAHME);
    const ersetzen = jest.spyOn(window.history, "replaceState");
    try {
      klick(screen.getByRole("tab", { name: "Vertragsdaten" }));
      expect(ersetzen).toHaveBeenLastCalledWith(null, "", vorgangPfad("vertragsende", ID, "vertragsdaten"));
      expect(window.location.search).toBe("?tab=vertragsdaten");
      expect(reiterGewaehlt()).toBe("Vertragsdaten");
      expect(screen.getByText("Noch keine Vertragsdaten")).toBeInTheDocument();

      klick(screen.getByRole("tab", { name: "Übersicht" }));
      expect(ersetzen).toHaveBeenLastCalledWith(null, "", vorgangPfad("vertragsende", ID));
      expect(window.location.pathname).toBe(vorgangPfad("vertragsende", ID));
      expect(window.location.search).toBe("");
      // Je Klick genau ein Eintrag (Radix meldet bei mousedown UND focus).
      expect(ersetzen).toHaveBeenCalledTimes(2);
    } finally {
      ersetzen.mockRestore();
    }
  });

  it("„Zu den Dokumenten“ in „Jetzt dran“ wechselt den Reiter, ohne etwas zu schreiben", async () => {
    await seite(UEBERNAHME);
    const ersetzen = jest.spyOn(window.history, "replaceState");
    try {
      fireEvent.click(within(jetztDran()!).getByRole("button", { name: "Zu den Dokumenten" }));
      expect(reiterGewaehlt()).toBe("Dokumente");
      expect(ersetzen).toHaveBeenLastCalledWith(null, "", vorgangPfad("vertragsende", ID, "dokumente"));
      expect(schreibAufrufe()).toEqual([]);
    } finally {
      ersetzen.mockRestore();
    }
  });

  it("Vertragsdaten mit Inhalt: Zahlen deutsch, Pille „Abgesendet“, Freitext mit Umbruch", async () => {
    await seite({
      ...VERTRAG,
      renewalData: {
        vertragsbeginn: "2026-10-01T00:00:00.000Z",
        befristet: true,
        vertragsende: "2027-09-30T00:00:00.000Z",
        befristungSachgrund: "Elternzeitvertretung",
        wochenstunden: 25.5,
        entgeltgruppe: "E 9b",
        stufe: "3",
        stellenbeschreibung: "Lehrkraft",
        betriebsstaette: "Minden",
        urlaubstageProJahr: 30,
        zusatzvereinbarungen: "Zeile eins\nZeile zwei",
        isComplete: true,
      },
    });
    klick(screen.getByRole("tab", { name: "Vertragsdaten" }));
    const gruppe = screen.getByRole("region", { name: "Vertragsdaten der Verlängerung" });
    expect(gruppe).toHaveTextContent("Abgesendet");
    expect(gruppe).toHaveTextContent("25,5");
    expect(gruppe).toHaveTextContent("01.10.2026");
    expect(gruppe).toHaveTextContent("Zeile eins");
    expect(await axeVerstoesse(document.body)).toEqual([]);
  });

  /** Der Wert der Zeile „Betriebsstätte" im Reiter Vertragsdaten. */
  async function betriebsstaette(daten: Partial<NonNullable<VertragsendeDetail["renewalData"]>>): Promise<string> {
    await seite({
      ...VERTRAG,
      renewalData: {
        vertragsbeginn: "2026-10-01T00:00:00.000Z",
        befristet: false,
        vertragsende: null,
        befristungSachgrund: null,
        wochenstunden: 39,
        entgeltgruppe: "E 9b",
        stufe: "3",
        stellenbeschreibung: "Lehrkraft",
        betriebsstaette: null,
        urlaubstageProJahr: 30,
        zusatzvereinbarungen: null,
        isComplete: true,
        ...daten,
      },
    });
    klick(screen.getByRole("tab", { name: "Vertragsdaten" }));
    const gruppe = screen.getByRole("region", { name: "Vertragsdaten der Verlängerung" });
    const zeile = Array.from(gruppe.querySelectorAll("li, div")).find(
      (e) => e.children.length === 2 && e.children[0].textContent === "Betriebsstätte",
    );
    if (!zeile) throw new Error("Keine Zeile „Betriebsstätte“");
    return zeile.children[1].textContent ?? "";
  }

  it("Betriebsstätte: der Name der im Formular gewählten Organisation (das Freitextfeld ist dann leer)", async () => {
    expect(await betriebsstaette({ betriebsstaetteName: "Gesamtschule Minden", betriebsstaette: null })).toBe(
      "Gesamtschule Minden",
    );
  });

  it("Betriebsstätte: ohne Auswahl der Freitext des Altbestands, ohne beides „—“", async () => {
    expect(await betriebsstaette({ betriebsstaetteName: null, betriebsstaette: "Minden" })).toBe("Minden");
    cleanup();
    // Eine Antwort ohne das neue Feld (aelterer Server) zeigt ebenfalls den Freitext.
    expect(await betriebsstaette({ betriebsstaette: "Minden" })).toBe("Minden");
    cleanup();
    expect(await betriebsstaette({ betriebsstaetteName: null, betriebsstaette: null })).toBe("—");
  });

  // Die Karten im Reiter Dokumente und das Mailprotokoll tragen h3. Ohne
  // Hinweise (h2) stuende sonst direkt unter der h1 eine h3 (axe: heading-order).
  it.each(["Übersicht", "Vertragsdaten", "Dokumente", "E-Mails"])(
    "Reiter %s ohne Hinweise: Überschriften lückenlos, axe ohne Befund",
    async (name) => {
      await seite(UEBERNAHME);
      expect(vertragsendeHinweise(vorgang(UEBERNAHME), JETZT)).toEqual([]);
      klick(screen.getByRole("tab", { name }));
      expect(reiterGewaehlt()).toBe(name);
      const ebenen = Array.from(document.querySelectorAll("main h1, main h2, main h3, main h4")).map((h) =>
        Number(h.tagName[1]),
      );
      for (let i = 1; i < ebenen.length; i++) {
        expect({ name, von: ebenen[i - 1], nach: ebenen[i], sprung: ebenen[i] - ebenen[i - 1] <= 1 }).toEqual({
          name,
          von: ebenen[i - 1],
          nach: ebenen[i],
          sprung: true,
        });
      }
      expect(await axeVerstoesse(document.body)).toEqual([]);
    },
  );
});

// =============================================
// Nach einer Handlung: bis der neue Stand da ist
// =============================================

describe("nach einer Handlung, bis der neue Stand da ist", () => {
  // Bis das stille Neuladen fertig ist, zeigt die Seite den ALTEN Stand.
  // Jede Handlung darauf ginge von ihm aus — ein zweites „Anfrage senden …"
  // schickte eine zweite Mail und machte den ersten Link ungueltig.

  it("„Anfrage senden …“: der Knopf des alten Stands bleibt fokussierbar, aber gesperrt – kein zweiter Dialog, kein zweiter Aufruf; das Menü ebenso", async () => {
    await seite(ANGELEGT);
    const fall = DIALOGE[0];
    const { ausloeser, dialog } = await dialogOeffnen(fall);
    fall.eingabe?.(dialog);
    server.antworten.set(`POST ${VORGANG_URL}/supervisor-link`, fall.antwort);
    server.vorgang = vorgang(fall.nachher);
    const laden = aufgeschoben();
    server.ladenWartet = laden.versprechen;
    fireEvent.click(within(dialog).getByRole("button", { name: "Anfrage senden" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(ladeAufrufe()).toHaveLength(2));
    // Der Dialog gab den Fokus an seinen Ausloeser zurueck — der steht noch da,
    // ist aber gesperrt (nicht `disabled`: der Fokus fiele sonst auf body).
    await waitFor(() => expect(document.activeElement).toBe(ausloeser));
    expect(ausloeser).toHaveTextContent("Anfrage senden …");
    expect(ausloeser).toHaveAttribute("aria-disabled", "true");
    expect(ausloeser).not.toBeDisabled();
    fireEvent.click(ausloeser);
    expect(screen.queryByRole("dialog")).toBeNull();

    // Das Menue geht auf, aber jeder Punkt ist gesperrt.
    await menueOeffnen();
    const punkte = screen.getAllByRole("menuitem");
    expect(punkte.map((p) => p.textContent)).toEqual(["Ohne Anfrage: Offboarding anlegen …", "Vorgang stornieren …"]);
    for (const punkt of punkte) expect(punkt).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(punkte[0]);
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(schreibAufrufe()).toHaveLength(1);

    // Der neue Stand ist da: alles wieder frei.
    await act(async () => laden.einloesen());
    expect(await screen.findByRole("button", { name: "Erinnerung senden" })).not.toHaveAttribute("aria-disabled");
    await menueOeffnen();
    for (const punkt of screen.getAllByRole("menuitem")) expect(punkt).not.toHaveAttribute("aria-disabled");
    fireEvent.click(screen.getByRole("menuitem", { name: "Anfrage neu senden …" }));
    expect(await screen.findByRole("alertdialog", { name: "Anfrage neu senden?" })).toBeInTheDocument();
    expect(schreibAufrufe()).toHaveLength(1);
  });

  it("„Stand setzen …“ und „Abschließen …“ gesperrt; „Zu den Dokumenten“ führt nur woandershin und bleibt frei", async () => {
    await seite(VERTRAG);
    const fall = DIALOGE[9];
    const { dialog } = await dialogOeffnen(fall);
    fall.eingabe?.(dialog);
    server.antworten.set(`PATCH ${VORGANG_URL}`, fall.antwort);
    server.vorgang = vorgang(fall.nachher);
    const laden = aufgeschoben();
    server.ladenWartet = laden.versprechen;
    fireEvent.click(within(dialog).getByRole("button", { name: fall.bestaetigen }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(ladeAufrufe()).toHaveLength(2));

    const mav = screen.getByRole("button", { name: "Stand setzen …" });
    const abschliessen = within(jetztDran()!).getByRole("button", { name: "Abschließen …" });
    for (const knopf of [mav, abschliessen]) {
      expect(knopf).toHaveAttribute("aria-disabled", "true");
      fireEvent.click(knopf);
    }
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(within(jetztDran()!).getByRole("button", { name: "Zu den Dokumenten" })).not.toHaveAttribute("aria-disabled");
    expect(schreibAufrufe()).toHaveLength(1);

    await act(async () => laden.einloesen());
    await waitFor(() => expect(screen.getByRole("region", { name: "Mitarbeitervertretung" })).toHaveTextContent("Zugestimmt"));
    expect(within(jetztDran()!).getByRole("button", { name: "Abschließen …" })).not.toHaveAttribute("aria-disabled");
    const mavNeu = screen.getByRole("button", { name: "Stand setzen …" });
    expect(mavNeu).not.toHaveAttribute("aria-disabled");
    fireEvent.click(mavNeu);
    expect(await screen.findByRole("dialog", { name: "Stand der Mitarbeitervertretung" })).toBeInTheDocument();
    expect(schreibAufrufe()).toHaveLength(1);
  });
});

// =============================================
// Laden und Ladefehler
// =============================================

/**
 * Der Klick-Handler, den React an ein Element gehaengt hat — auch nachdem das
 * Element verschwunden ist. So laesst sich ein Handler pruefen, der seinen
 * Zeichendurchgang ueberlebt (der Seitenkopf fuehrt einen Menuepunkt erst nach
 * dem Schliessen aus); ueber die Oberflaeche ist er nicht mehr erreichbar.
 */
function reactKlick(element: HTMLElement): () => void {
  const schluessel = Object.keys(element).find((k) => k.startsWith("__reactProps$"));
  if (!schluessel) throw new Error("Keine React-Eigenschaften am Element");
  const props = (element as unknown as Record<string, { onClick?: () => void }>)[schluessel];
  const onClick = props.onClick;
  if (!onClick) throw new Error("Kein onClick am Element");
  return () => onClick();
}

describe("Laden", () => {
  it("zeigt beim Laden ein Skelett und genau eine h1, danach den Inhalt", async () => {
    const sperre = aufgeschoben();
    server.ladenWartet = sperre.versprechen;
    server.vorgang = vorgang(ANFRAGE);
    render(<VertragsendeDetailAnsicht vorgangId={ID} darfBearbeiten />);

    const status = screen.getAllByRole("status");
    expect(status).toHaveLength(1);
    expect(status[0]).toHaveTextContent("Vorgang wird geladen");
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(await axeVerstoesse(document.body)).toEqual([]);

    await act(async () => sperre.einloesen());
    await screen.findByRole("heading", { level: 1, name: NAME });
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(ladeAufrufe()).toEqual([{ url: VORGANG_URL, method: "GET", body: undefined, headers: undefined }]);
  });

  it("Fehler beim Laden: Hinweis mit dem Text der Route und Verweis „Zur Liste“", async () => {
    server.ladeAntwort = { status: 404, body: { error: "Vorgang nicht gefunden" } };
    render(<VertragsendeDetailAnsicht vorgangId={ID} darfBearbeiten />);
    const alarm = await screen.findByRole("alert");
    expect(alarm).toHaveTextContent("Vorgang konnte nicht geladen werden");
    expect(alarm).toHaveTextContent("Vorgang nicht gefunden");
    expect(within(alarm).getByRole("link", { name: "Zur Liste" })).toHaveAttribute("href", vorgangslistePfad("vertragsende"));
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByRole("button", { name: "Weitere Aktionen" })).toBeNull();
    expect(await axeVerstoesse(document.body)).toEqual([]);
  });

  it("scheitert das Neuladen nach einer Handlung: alter Stand nur lesbar, Hinweis mit „Neu laden“ – danach alles wieder da", async () => {
    await seite(VERTRAG);
    const fall = DIALOGE[9]; // Stand der Mitarbeitervertretung — danach bleiben Handlungen
    const { dialog } = await dialogOeffnen(fall);
    fall.eingabe?.(dialog);
    server.antworten.set(`PATCH ${VORGANG_URL}`, fall.antwort);
    server.ladeAntwort = { status: 500, body: { error: "Interner Serverfehler" } };
    fireEvent.click(within(dialog).getByRole("button", { name: fall.bestaetigen }));

    // Ein Hinweis, angesagt, ueber der Leiste — und keine zweite Meldung als Toast.
    const hinweis = await screen.findByRole("alert");
    expect(hinweis).toHaveTextContent("Die Ansicht ist nicht aktuell");
    expect(hinweis).toHaveTextContent("Der neue Stand konnte nicht geladen werden (Interner Serverfehler).");
    expect(hinweis.compareDocumentPosition(screen.getByRole("list", { name: "Ablauf" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(toastOk).toHaveBeenCalledWith(fall.meldung);
    expect(toastFehler).not.toHaveBeenCalled();

    // Der alte Stand bleibt lesbar ...
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(within(kopf()).getByText("Vertrag unterschrieben")).toBeInTheDocument();
    expect(jetztDran()).toHaveTextContent("Vorgang abschließen");
    // ... aber nicht bedienbar: kein Menue, keine Handlung, kein „Stand setzen …".
    expect(screen.queryByRole("button", { name: "Weitere Aktionen" })).toBeNull();
    expect(handlungenInJetztDran()).toEqual([]);
    expect(screen.queryByRole("button", { name: "Stand setzen …" })).toBeNull();
    // Der Ausloeser ist weg — der Fokus liegt auf dem Seitentitel, nicht auf `body`.
    await waitFor(() => expect(document.activeElement).toBe(document.getElementById(SEITENTITEL_ID)));
    expect(await axeVerstoesse(document.body)).toEqual([]);

    // „Neu laden": waehrend es laeuft, gesperrt; mit gutem Stand ist alles wieder da.
    server.ladeAntwort = null;
    server.vorgang = vorgang(fall.nachher);
    const laden = aufgeschoben();
    server.ladenWartet = laden.versprechen;
    const neuLaden = within(hinweis).getByRole("button", { name: "Neu laden" });
    act(() => neuLaden.focus());
    fireEvent.click(neuLaden);
    expect(await within(hinweis).findByRole("button", { name: "Wird neu geladen …" })).toHaveAttribute("aria-disabled", "true");
    await act(async () => laden.einloesen());

    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(screen.getByRole("button", { name: "Weitere Aktionen" })).toBeInTheDocument();
    expect(handlungenInJetztDran()).toEqual(["Abschließen …", "Zu den Dokumenten"]);
    expect(screen.getByRole("button", { name: "Stand setzen …" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Mitarbeitervertretung" })).toHaveTextContent("Zugestimmt");
    await waitFor(() => expect(document.activeElement).toBe(document.getElementById(SEITENTITEL_ID)));
    expect(ladeAufrufe()).toHaveLength(3);
    expect(toastFehler).not.toHaveBeenCalled();
  });

  it("scheitert auch „Neu laden“, bleibt der Hinweis stehen und der Knopf wieder bedienbar", async () => {
    await seite(VERTRAG);
    const fall = DIALOGE[9];
    const { dialog } = await dialogOeffnen(fall);
    fall.eingabe?.(dialog);
    server.antworten.set(`PATCH ${VORGANG_URL}`, fall.antwort);
    server.ladeAntwort = { status: 500, body: { error: "Interner Serverfehler" } };
    fireEvent.click(within(dialog).getByRole("button", { name: fall.bestaetigen }));
    const hinweis = await screen.findByRole("alert");

    fireEvent.click(within(hinweis).getByRole("button", { name: "Neu laden" }));
    await waitFor(() => expect(ladeAufrufe()).toHaveLength(3));
    await waitFor(() => expect(within(hinweis).getByRole("button", { name: "Neu laden" })).not.toHaveAttribute("aria-disabled"));
    expect(screen.getByRole("alert")).toBe(hinweis);
    expect(screen.queryByRole("button", { name: "Weitere Aktionen" })).toBeNull();
    expect(toastFehler).not.toHaveBeenCalled();
  });

  it("nach gescheitertem Neuladen öffnet auch ein Handler des alten Stands keinen Dialog (Wächter in dialogOeffnen)", async () => {
    await seite(VERTRAG);
    // Die Handler, die der alte Stand an „Stand setzen …“ und „Abschließen …“ hing.
    const alterMav = reactKlick(screen.getByRole("button", { name: "Stand setzen …" }));
    const alterAbschluss = reactKlick(within(jetztDran()!).getByRole("button", { name: "Abschließen …" }));

    const fall = DIALOGE[9];
    const { dialog } = await dialogOeffnen(fall);
    fall.eingabe?.(dialog);
    server.antworten.set(`PATCH ${VORGANG_URL}`, fall.antwort);
    server.ladeAntwort = { status: 500, body: { error: "Interner Serverfehler" } };
    fireEvent.click(within(dialog).getByRole("button", { name: fall.bestaetigen }));
    await screen.findByRole("alert");
    await waitFor(() => expect(document.activeElement).toBe(document.getElementById(SEITENTITEL_ID)));
    expect(screen.queryByRole("button", { name: "Stand setzen …" })).toBeNull();

    // Der geschlossene Dialog bleibt eingehaengt (am Recht, nicht am Stand) —
    // umso mehr muss das Oeffnen selbst pruefen, ob gehandelt werden darf.
    act(() => {
      alterMav();
      alterAbschluss();
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(document.activeElement).toBe(document.getElementById(SEITENTITEL_ID));
    expect(schreibAufrufe()).toHaveLength(1);
  });

  it("ein Laden ohne sichtbare Änderung (derselbe Fehler noch einmal) lässt keinen Fokus-Merker zurück", async () => {
    const { rerender } = await seite(VERTRAG);
    const fall = DIALOGE[9];
    const { dialog } = await dialogOeffnen(fall);
    fall.eingabe?.(dialog);
    server.antworten.set(`PATCH ${VORGANG_URL}`, fall.antwort);
    server.ladeAntwort = { status: 500, body: { error: "Interner Serverfehler" } };
    fireEvent.click(within(dialog).getByRole("button", { name: fall.bestaetigen }));
    const hinweis = await screen.findByRole("alert");

    // „Neu laden“ scheitert zweimal mit demselben Text — am Bild aendert sich nichts.
    for (const anzahl of [3, 4]) {
      const knopf = within(hinweis).getByRole("button", { name: "Neu laden" });
      act(() => knopf.focus());
      fireEvent.click(knopf);
      await waitFor(() => expect(ladeAufrufe()).toHaveLength(anzahl));
      await waitFor(() => expect(within(hinweis).getByRole("button", { name: "Neu laden" })).not.toHaveAttribute("aria-disabled"));
    }
    expect(screen.getByRole("alert")).toBe(hinweis);

    // Danach ein Laden, das von KEINER Handlung kommt: Die Ansicht zeigt einen
    // anderen Vorgang. Ein liegengebliebener Merker zoege den Fokus jetzt auf
    // den Titel.
    const andereId = "7c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f";
    server.antworten.set(`GET /api/contract-end/${andereId}`, {
      status: 200,
      body: vorgang({ ...ANFRAGE, id: andereId, displayId: "VE-2026-BK-005", employeeFirstName: "Jonas", employeeLastName: "Beispiel" }),
    });
    act(() => (document.activeElement as HTMLElement | null)?.blur());
    expect(document.activeElement).toBe(document.body);
    rerender(<VertragsendeDetailAnsicht vorgangId={andereId} darfBearbeiten />);
    await screen.findByRole("heading", { level: 1, name: "Jonas Beispiel" });
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(document.activeElement).toBe(document.body);
  });
});

// =============================================
// Hinweise
// =============================================

describe("Hinweise über allen Reitern", () => {
  const MIT_HINWEISEN: Partial<VertragsendeDetail> = {
    ...UEBERNAHME,
    vorstandAbgestimmt: false,
    befristungsart: "SACHGRUNDLOS",
    bisherigeVerlaengerungen: 3,
    weitereMandanten: ["Kita Sonnenschein"],
  };
  const TITEL = [
    "Nicht mit Vorstand oder Geschäftsführung abgestimmt",
    "Hinweis zur Befristung (§ 14 TzBfG)",
    "Person hat weitere Einstellungen",
  ];

  it("zeigt die zutreffenden Hinweise als benannte Bereiche, in der Reihenfolge des Adapters", async () => {
    await seite(MIT_HINWEISEN);
    expect(vertragsendeHinweise(vorgang(MIT_HINWEISEN), JETZT).map((h) => h.titel)).toEqual(TITEL);

    const bereiche = TITEL.map((titel) => screen.getByRole("region", { name: titel }));
    for (let i = 1; i < bereiche.length; i++) {
      expect(bereiche[i - 1].compareDocumentPosition(bereiche[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    expect(bereiche[2]).toHaveTextContent("Kita Sonnenschein");
    // Sie stehen schon beim Oeffnen da — angesagt wird keiner.
    expect(screen.queryByRole("alert")).toBeNull();
    // Ueber den Reitern, nicht in einem.
    for (const bereich of bereiche) expect(bereich.closest('[role="tabpanel"]')).toBeNull();

    klick(screen.getByRole("tab", { name: "Dokumente" }));
    for (const titel of TITEL) expect(screen.getByRole("region", { name: titel })).toBeInTheDocument();
    expect(await axeVerstoesse(document.body)).toEqual([]);
  });

  it("ohne zutreffende Hinweise steht keiner da", async () => {
    await seite(UEBERNAHME);
    for (const titel of TITEL) expect(screen.queryByRole("region", { name: titel })).toBeNull();
  });
});
