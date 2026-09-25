/**
 * @jest-environment jsdom
 */

/**
 * Oeffentliche Upload-Seite „Unterlagen nachreichen" (/unterlagen/[token], Paket 4).
 *
 * Gerendert wird die echte Seite (page.tsx) mit der Komponente
 * src/components/unterlagen/upload-seite.tsx; ersetzt sind nur Netz, Router
 * und next/image. Hinter `fetch` steht ein kleiner Server, der Stand und
 * Texte mit den ECHTEN Regeln aus src/lib/unterlagen.ts baut
 * (`personenStand`, `oeffentlicherFristSatz`) — die Seite zeigt also, was die
 * API wirklich liefert. Belegt wird (Feinplanung 5.3–5.5, 10.1, 13):
 *
 *  1. Laden: ein GET mit `no-store`, auch im StrictMode nur einer; Kopf,
 *     Fristkasten, Kacheln je Zustand, Freitexte nur als Text.
 *  2. Fehlerseite: 404/410 mit dem Text des Servers, ohne Name und
 *     Einrichtung; `readOnly` nur lesend; Verbindungsfehler mit neuem Versuch;
 *     409 „alles geprüft" auf einem Schreibweg laedt den Stand neu.
 *  3. Linkende erst nach der Frist; Countdown in Berliner Kalendertagen.
 *  4. Hochladen: eine Anfrage je Datei, nacheinander, genau ein Feld `datei`;
 *     zu gross oder falscher Typ ohne Anfrage; Fehler je Datei mit
 *     role="alert", die stehen bleiben; 429 wartet `Retry-After` ab; volle
 *     Unterlage nennt den Grund statt des Dateifelds.
 *  5. Entfernen: „<Dateiname> entfernen", DELETE, Fehler an der Unterlage,
 *     Fokus danach auf der Nachbardatei bzw. dem Dateifeld.
 *  6. „Gültig bis": speichert beim Verlassen und geht beim Übermitteln mit;
 *     ein abgelehntes Datum steht am Feld und haelt Übermitteln auf.
 *  7. Übermitteln: Bestaetigung mit Fokus, nennt Übermitteltes, Offenes und
 *     das noch abzugebende Original; vorher nennt der Balken die Unterlagen
 *     und sagt, dass danach keine Dateien mehr dazukommen; Doppelklick = eine
 *     Anfrage.
 *  8. Barrierefreiheit: Labels, Regionen, aria-live im Balken.
 *  9. Fusszeile: verantwortliche Stelle, Datenschutz, Hinweise zum Link.
 * 10. Kopfdaten des Layouts: noindex, no-referrer.
 */
import { StrictMode } from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import UnterlagenPage from "@/app/unterlagen/[token]/page";
import UnterlagenLayout, { metadata } from "@/app/unterlagen/[token]/layout";
import { formatKalendertagLang } from "@/lib/kalendertag";
import {
  MAX_DATEI_BYTES,
  MAX_DATEIEN_JE_POSITION,
  MELDUNGEN,
  meldungLinkAbgelaufen,
  oeffentlicherFristSatz,
  personenStand,
  UPLOAD_ACCEPT,
  type OeffentlicheDatei,
  type OeffentlichePosition,
  type OeffentlicheUnterlagen,
} from "@/lib/unterlagen";

// React 19 verlangt diese Marke, bevor act() Zustandsaenderungen einsammeln darf.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("next/navigation", () => ({ useParams: () => ({ token: "2f1c9d2e-8a4b-4c3d-9e1f-0a1b2c3d4e5f" }) }));
jest.mock("next/image", () => ({ __esModule: true, default: () => null }));

const TOKEN = "2f1c9d2e-8a4b-4c3d-9e1f-0a1b2c3d4e5f";
const BASIS = `/api/unterlagen/${TOKEN}`;

// =============================================
// Uhr
// =============================================

/** Montag, 21.09.2026, 12:00 Uhr deutscher Zeit — vier Tage vor der Frist. */
const VOR_DER_FRIST = new Date("2026-09-21T10:00:00.000Z");
/** Montag, 28.09.2026 — drei Tage nach der Frist, der Link gilt noch bis 09.10. */
const NACH_DER_FRIST = new Date("2026-09-28T10:00:00.000Z");
/** Freitag */
const FRIST = "2026-09-25";
/** Frist + 14, ebenfalls ein Freitag */
const LINKENDE = "2026-10-09";

const NUR_DATE = [
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
] as const;

/**
 * Haelt das Datum fest. Mit `timer: true` laufen auch setTimeout/clearTimeout
 * ueber die falsche Uhr (Retry-After, „Fehler bleiben stehen").
 */
function uhrStellen(zeit: Date = VOR_DER_FRIST, { timer = false } = {}) {
  jest.useFakeTimers({
    now: zeit,
    doNotFake: timer ? NUR_DATE.filter((n) => n !== "setTimeout" && n !== "clearTimeout") : [...NUR_DATE],
  });
}

afterEach(() => {
  jest.useRealTimers();
});

// =============================================
// Kleiner Server hinter fetch
// =============================================

interface ServerPosition {
  id: string;
  bezeichnung: string;
  hinweis: string | null;
  originalErforderlich: boolean;
  fristpflichtig: boolean;
  /** Status der Datenbank: ANGEFORDERT | EINGEREICHT | ANGENOMMEN | ZURUECKGEWIESEN | ENTFAELLT */
  status: string;
  gueltigBisAngabe: string | null;
  begruendung: string | null;
  uebermitteltAm: string | null;
  entwuerfe: OeffentlicheDatei[];
}

function position(teil: Partial<ServerPosition> & Pick<ServerPosition, "id" | "bezeichnung">): ServerPosition {
  return {
    hinweis: null,
    originalErforderlich: false,
    fristpflichtig: false,
    status: "ANGEFORDERT",
    gueltigBisAngabe: null,
    begruendung: null,
    uebermitteltAm: null,
    entwuerfe: [],
    ...teil,
  };
}

const masern = (teil: Partial<ServerPosition> = {}) =>
  position({
    id: "p-masern",
    bezeichnung: "Masernschutz-Nachweis",
    hinweis: "Bitte laden Sie nur die Seite Ihres Impfpasses mit den Masern-Impfungen hoch.",
    status: "ZURUECKGEWIESEN",
    begruendung: "Auf dem Foto ist das Impfdatum nicht lesbar.",
    ...teil,
  });
const titel = (teil: Partial<ServerPosition> = {}) =>
  position({
    id: "p-titel",
    bezeichnung: "Aufenthaltstitel",
    hinweis: "Bitte laden Sie Vorder- und Rückseite hoch und tragen Sie das Ablaufdatum ein.",
    fristpflichtig: true,
    ...teil,
  });
const rvAntrag = (teil: Partial<ServerPosition> = {}) =>
  position({
    id: "p-rv",
    bezeichnung: "Unterschriebener RV-Antrag",
    originalErforderlich: true,
    status: "EINGEREICHT",
    uebermitteltAm: "2026-09-15T08:00:00.000Z",
    ...teil,
  });

const VORNE: OeffentlicheDatei = { id: "d-vorne", name: "titel-vorne.jpg", groesse: 1_153_434 };
const HINTEN: OeffentlicheDatei = { id: "d-hinten", name: "titel-hinten.jpg", groesse: 943_718 };

const VERANTWORTLICHE_STELLE = "Christlicher Schulverein Minden e.V., Kingsleyallee 6, 32425 Minden";

let server: {
  heute: string;
  readOnly: boolean;
  nachricht: string | null;
  positionen: ServerPosition[];
};
let dateiNr = 0;

/** Eine Position, wie `oeffentlichePositionBauen` (unterlagen-upload.ts) sie baut. */
function oeffentlich(p: ServerPosition): OeffentlichePosition {
  const s = personenStand(p.status, p.entwuerfe.length, p.uebermitteltAm);
  return {
    id: p.id,
    bezeichnung: p.bezeichnung,
    hinweis: p.hinweis,
    originalErforderlich: p.originalErforderlich,
    fristpflichtig: p.fristpflichtig,
    gueltigBisAngabe: p.fristpflichtig ? p.gueltigBisAngabe : null,
    stand: s.stand,
    standText: s.text,
    begruendung: p.status === "ZURUECKGEWIESEN" ? p.begruendung : null,
    uebermitteltAm: p.uebermitteltAm,
    entwuerfe: p.entwuerfe.map((d) => ({ ...d })),
  };
}

/** Der Stand wie `standBauen` (unterlagen-upload.ts): Linkende nur nach der Frist. */
function stand(): OeffentlicheUnterlagen {
  return {
    readOnly: server.readOnly,
    meldung: server.readOnly ? MELDUNGEN.ALLES_GEPRUEFT : null,
    name: "Anna Beispiel",
    einrichtung: "FES Gymnasium",
    vorgangsnummer: "ONB-2026-GYM-014",
    frist: FRIST,
    fristLang: formatKalendertagLang(FRIST),
    linkGueltigBis: server.heute > FRIST ? LINKENDE : null,
    fristSatz: oeffentlicherFristSatz(FRIST, LINKENDE, server.heute),
    nachricht: server.nachricht,
    verantwortlicheStelle: VERANTWORTLICHE_STELLE,
    grenzen: { maxDateiBytes: MAX_DATEI_BYTES, maxDateienJePosition: MAX_DATEIEN_JE_POSITION, accept: UPLOAD_ACCEPT },
    positionen: server.positionen.map(oeffentlich),
  };
}

interface Anfrage {
  url: string;
  method: string;
  cache: RequestCache | undefined;
  json: unknown;
  /** Felder eines multipart-Bodys (Namen) und die Dateien im Feld `datei`. */
  felder: string[];
  dateien: File[];
}

interface ServerAntwort {
  status: number;
  body: unknown;
  retryAfter?: string;
}

let anfragen: Anfrage[] = [];
/** Liefert eine eigene Antwort — `undefined` heisst: wie der Server oben. */
let sonderfall: ((a: Anfrage) => ServerAntwort | undefined | Promise<ServerAntwort | undefined>) | null = null;

function positionVon(id: string): ServerPosition {
  const p = server.positionen.find((x) => x.id === id);
  if (!p) throw new Error(`unbekannte Position ${id}`);
  return p;
}

function standardAntwort(a: Anfrage): ServerAntwort {
  const pfad = a.url.slice(BASIS.length);
  if (a.method === "GET" && pfad === "") return { status: 200, body: stand() };

  const hochladen = /^\/positionen\/([^/]+)\/dateien$/.exec(pfad);
  if (a.method === "POST" && hochladen) {
    const p = positionVon(hochladen[1]);
    for (const d of a.dateien) p.entwuerfe.push({ id: `d-neu-${++dateiNr}`, name: d.name, groesse: d.size });
    return { status: 201, body: { position: oeffentlich(p) } };
  }

  const entfernen = /^\/dateien\/([^/]+)$/.exec(pfad);
  if (a.method === "DELETE" && entfernen) {
    const p = server.positionen.find((x) => x.entwuerfe.some((d) => d.id === entfernen[1]));
    if (!p) return { status: 404, body: { error: MELDUNGEN.DATEI_NICHT_GEFUNDEN } };
    p.entwuerfe = p.entwuerfe.filter((d) => d.id !== entfernen[1]);
    return { status: 200, body: { position: oeffentlich(p) } };
  }

  const gueltigBis = /^\/positionen\/([^/]+)$/.exec(pfad);
  if (a.method === "PATCH" && gueltigBis) {
    const p = positionVon(gueltigBis[1]);
    p.gueltigBisAngabe = (a.json as { gueltigBis: string | null }).gueltigBis;
    return { status: 200, body: { position: oeffentlich(p) } };
  }

  if (a.method === "POST" && pfad === "/uebermitteln") {
    const angaben = ((a.json as { gueltigBis?: Record<string, string | null> }).gueltigBis ?? {}) as Record<
      string,
      string | null
    >;
    let uebermittelt = 0;
    for (const p of server.positionen) {
      if (p.id in angaben) p.gueltigBisAngabe = angaben[p.id];
      if ((p.status === "ANGEFORDERT" || p.status === "ZURUECKGEWIESEN") && p.entwuerfe.length > 0) {
        p.status = "EINGEREICHT";
        p.uebermitteltAm = new Date().toISOString();
        p.entwuerfe = [];
        uebermittelt++;
      }
    }
    return { status: 200, body: { stand: stand(), uebermittelt } };
  }
  throw new Error(`unerwartete Anfrage ${a.method} ${a.url}`);
}

beforeEach(() => {
  anfragen = [];
  sonderfall = null;
  dateiNr = 0;
  server = { heute: "2026-09-21", readOnly: false, nachricht: null, positionen: [masern(), titel(), rvAntrag()] };
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    const body = init?.body;
    const formular = body instanceof FormData ? body : null;
    const a: Anfrage = {
      url: String(url),
      method: init?.method ?? "GET",
      cache: init?.cache,
      json: typeof body === "string" ? JSON.parse(body) : null,
      felder: formular ? [...formular.keys()] : [],
      dateien: formular ? (formular.getAll("datei") as File[]) : [],
    };
    anfragen.push(a);
    const antwort = (await sonderfall?.(a)) ?? standardAntwort(a);
    return {
      ok: antwort.status >= 200 && antwort.status < 300,
      status: antwort.status,
      headers: { get: (name: string) => (name.toLowerCase() === "retry-after" ? (antwort.retryAfter ?? null) : null) },
      json: async () => antwort.body,
    } as unknown as Response;
  }) as unknown as typeof fetch;
});

// =============================================
// Hilfen
// =============================================

/** Laesst die Promise-Ketten (fetch → Zustand) vollstaendig durchlaufen. */
async function ruhe() {
  await act(async () => {
    for (let i = 0; i < 200; i++) await Promise.resolve();
  });
}

async function zeigeSeite({ strict = false } = {}) {
  await act(async () => {
    render(strict ? (
      <StrictMode>
        <UnterlagenPage />
      </StrictMode>
    ) : (
      <UnterlagenPage />
    ));
  });
  await ruhe();
}

function datei(name: string, typ: string, groesse?: number): File {
  const f = new File(["%PDF-1.7\n%%EOF"], name, { type: typ });
  if (groesse !== undefined) Object.defineProperty(f, "size", { value: groesse });
  return f;
}

const kachel = (name: string) => screen.getByRole("region", { name });
const dateiFeld = (name: string) => screen.getByLabelText(`Datei hinzufügen: ${name}`) as HTMLInputElement;
const balkenStand = () => document.querySelector("[data-balken-stand]") as HTMLElement;
const uebermittelnKnopf = () => screen.getByRole("button", { name: "Unterlagen übermitteln" }) as HTMLButtonElement;
const seitentext = () => document.body.textContent ?? "";
const uploads = () => anfragen.filter((a) => a.method === "POST" && a.url.endsWith("/dateien"));
const uebermittlungen = () => anfragen.filter((a) => a.url === `${BASIS}/uebermitteln`);
const gets = () => anfragen.filter((a) => a.method === "GET");

async function dateienWaehlen(unterlage: string, dateien: File[]) {
  await act(async () => {
    fireEvent.change(dateiFeld(unterlage), { target: { files: dateien } });
  });
  await ruhe();
}

async function klicken(element: HTMLElement) {
  await act(async () => {
    fireEvent.click(element);
  });
  await ruhe();
}

// =============================================
// 1. Laden
// =============================================

describe("Laden", () => {
  it("ein GET mit no-store; Kopf mit Vorgangsnummer, Titel und Name · Einrichtung", async () => {
    uhrStellen();
    await zeigeSeite();
    expect(gets()).toHaveLength(1);
    expect(anfragen[0].url).toBe(BASIS);
    expect(anfragen[0].cache).toBe("no-store");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Unterlagen nachreichen");
    expect(document.querySelector("[data-kopfzeile]")?.textContent).toBe("Anna Beispiel · FES Gymnasium");
    expect(document.querySelector("[data-vorgangsnummer]")?.textContent).toBe("Vorgang ONB-2026-GYM-014");
  });

  it("nur ein GET, auch im StrictMode", async () => {
    uhrStellen();
    await zeigeSeite({ strict: true });
    expect(gets()).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Unterlagen nachreichen");
  });

  it("zeigt den Ladezustand, bis die Antwort da ist", async () => {
    uhrStellen();
    let freigeben!: () => void;
    sonderfall = () => new Promise<undefined>((r) => (freigeben = () => r(undefined)));
    await act(async () => {
      render(<UnterlagenPage />);
    });
    expect(screen.getByRole("status").textContent).toBe("Unterlagen werden geladen…");
    await act(async () => freigeben());
    await ruhe();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Unterlagen nachreichen");
  });

  it("je Unterlage eine Region mit ihrem Namen, in der Reihenfolge des Servers", async () => {
    uhrStellen();
    await zeigeSeite();
    const namen = screen
      .getAllByRole("region")
      .filter((r) => r.hasAttribute("data-position"))
      .map((r) => r.querySelector("h2")?.textContent);
    expect(namen).toEqual(["Masernschutz-Nachweis", "Aufenthaltstitel", "Unterschriebener RV-Antrag"]);
  });

  it("Kacheln: zurückgewiesen rot mit Begründung, offen mit Feld, übermittelt ohne Feld", async () => {
    uhrStellen();
    await zeigeSeite();

    const m = kachel("Masernschutz-Nachweis");
    expect(m.querySelector("[data-stand]")?.textContent).toBe("Bitte erneut hochladen");
    expect(m.querySelector("[data-begruendung]")?.textContent).toBe(
      "Die Personalabteilung konnte Ihre Unterlage nicht annehmen:Auf dem Foto ist das Impfdatum nicht lesbar.",
    );
    expect(m.className).toContain("border-red-200");
    expect(within(m).getByLabelText("Datei hinzufügen: Masernschutz-Nachweis")).not.toBeNull();

    const t = kachel("Aufenthaltstitel");
    expect(t.querySelector("[data-stand]")?.textContent).toBe("Offen");
    expect(t.querySelector("[data-hinweis]")?.textContent).toBe(
      "Bitte laden Sie Vorder- und Rückseite hoch und tragen Sie das Ablaufdatum ein.",
    );

    const rv = kachel("Unterschriebener RV-Antrag");
    expect(rv.querySelector("[data-stand]")?.textContent).toBe("Übermittelt am 15.09.2026, wird geprüft");
    expect(rv.className).toContain("#009AC6");
    expect(within(rv).queryByLabelText(/Datei hinzufügen/)).toBeNull();
    // Der Original-Hinweis steht „immer“ (P:1457) — auch nach dem Übermitteln:
    // Der Scan ist da, das Original fehlt noch.
    expect(rv.querySelector("[data-original]")?.textContent).toBe(
      "Bitte geben Sie zusätzlich das unterschriebene Original ab.",
    );
  });

  it("bereit: Dateien mit Name und Größe, Stand „2 Dateien bereit…“ — angenommen und entfällt ohne Feld", async () => {
    uhrStellen();
    server.positionen = [
      titel({ entwuerfe: [VORNE, HINTEN] }),
      position({ id: "p-vertrag", bezeichnung: "Arbeitsvertrag", status: "ANGENOMMEN" }),
      position({ id: "p-pkv", bezeichnung: "PKV-Nachweis", status: "ENTFAELLT" }),
    ];
    await zeigeSeite();

    const t = kachel("Aufenthaltstitel");
    expect(t.querySelector("[data-stand]")?.textContent).toBe("2 Dateien bereit, noch nicht übermittelt");
    expect(t.querySelector('[data-datei="d-vorne"]')?.textContent).toContain("titel-vorne.jpg · 1,1 MB");
    expect(t.querySelector('[data-datei="d-hinten"]')?.textContent).toContain("titel-hinten.jpg · 922 KB");

    const vertrag = kachel("Arbeitsvertrag");
    expect(vertrag.querySelector("[data-stand]")?.textContent).toBe("Angenommen");
    expect(within(vertrag).queryByLabelText(/Datei hinzufügen/)).toBeNull();
    const pkv = kachel("PKV-Nachweis");
    expect(pkv.querySelector("[data-stand]")?.textContent).toBe("Wird nicht mehr benötigt");
    expect(within(pkv).queryByLabelText(/Datei hinzufügen/)).toBeNull();
  });

  it("Schriftform: „Bitte geben Sie zusätzlich das unterschriebene Original ab.“", async () => {
    uhrStellen();
    server.positionen = [rvAntrag({ status: "ANGEFORDERT", uebermitteltAm: null })];
    await zeigeSeite();
    expect(kachel("Unterschriebener RV-Antrag").querySelector("[data-original]")?.textContent).toBe(
      "Bitte geben Sie zusätzlich das unterschriebene Original ab.",
    );
  });

  it("Schriftform: der Hinweis bleibt nach der Annahme (auch nur lesend) — nur bei „Entfällt“ nicht", async () => {
    uhrStellen();
    server.readOnly = true;
    server.positionen = [
      rvAntrag({ status: "ANGENOMMEN" }),
      position({ id: "p-vl", bezeichnung: "VL-Vertrag", originalErforderlich: true, status: "ENTFAELLT" }),
    ];
    await zeigeSeite();
    expect(kachel("Unterschriebener RV-Antrag").querySelector("[data-original]")?.textContent).toBe(
      "Bitte geben Sie zusätzlich das unterschriebene Original ab.",
    );
    expect(kachel("VL-Vertrag").querySelector("[data-original]")).toBeNull();
  });

  it("Freitexte der Personalabteilung nur als Text, nie als HTML", async () => {
    uhrStellen();
    server.nachricht = 'Bitte <b>beide</b> Seiten.\n<img src=x onerror="alert(1)">';
    server.positionen = [titel({ hinweis: '<a href="https://example.org">hier</a>' })];
    await zeigeSeite();
    const nachricht = document.querySelector("[data-nachricht]") as HTMLElement;
    expect(nachricht.textContent).toContain("Bitte <b>beide</b> Seiten.");
    expect(nachricht.querySelector("b, img")).toBeNull();
    expect(screen.getByRole("region", { name: "Nachricht der Personalabteilung" })).not.toBeNull();
    const hinweis = kachel("Aufenthaltstitel").querySelector("[data-hinweis]") as HTMLElement;
    expect(hinweis.textContent).toBe('<a href="https://example.org">hier</a>');
    expect(hinweis.querySelector("a")).toBeNull();
  });
});

// =============================================
// 2. Fehlerseite und nur lesen
// =============================================

describe("Fehlerseite (404/410) und nur lesen", () => {
  it.each([
    [404, "LINK_UNGUELTIG", MELDUNGEN.LINK_UNGUELTIG, "Link nicht gültig"],
    [410, "LINK_ERSETZT", MELDUNGEN.LINK_ERSETZT, "Link ersetzt"],
    [410, "LINK_ABGELAUFEN", meldungLinkAbgelaufen(LINKENDE), "Link abgelaufen"],
    [410, "ANFORDERUNG_ZURUECKGEZOGEN", MELDUNGEN.ANFORDERUNG_ZURUECKGEZOGEN, "Anforderung zurückgezogen"],
    [410, "VORGANG_EINGESTELLT", MELDUNGEN.VORGANG_EINGESTELLT, "Vorgang nicht mehr aktiv"],
  ])("%s %s: „%s“ unter „%s“ — ohne Name, Einrichtung, Vorgangsnummer", async (status, grund, text, titelText) => {
    uhrStellen();
    sonderfall = () => ({ status, body: { error: text, grund } });
    await zeigeSeite();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(titelText);
    expect(seitentext()).toContain(text);
    expect(seitentext()).not.toContain("Anna Beispiel");
    expect(seitentext()).not.toContain("FES Gymnasium");
    expect(seitentext()).not.toContain("ONB-2026");
    // Ein neuer Versuch hilft bei einem toten Link nicht.
    expect(screen.queryByRole("button", { name: "Erneut versuchen" })).toBeNull();
  });

  it("410 „Linkende“ nennt das Datum", async () => {
    uhrStellen();
    sonderfall = () => ({
      status: 410,
      body: { error: meldungLinkAbgelaufen(LINKENDE), grund: "LINK_ABGELAUFEN", linkGueltigBis: LINKENDE },
    });
    await zeigeSeite();
    expect(seitentext()).toContain(
      "Dieser Link war bis 09.10.2026 gültig. Bitte wenden Sie sich an die Personalabteilung.",
    );
  });

  it("Verbindungsfehler: Hinweis und „Erneut versuchen“ lädt neu", async () => {
    uhrStellen();
    let offline = true;
    sonderfall = () => {
      if (offline) throw new Error("offline");
      return undefined;
    };
    await zeigeSeite();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Seite nicht erreichbar");
    expect(seitentext()).toContain("Verbindungsfehler. Bitte versuchen Sie es später erneut.");
    offline = false;
    await klicken(screen.getByRole("button", { name: "Erneut versuchen" }));
    expect(gets()).toHaveLength(2);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Unterlagen nachreichen");
  });

  it("readOnly: Meldung „alles geprüft“, kein Dateifeld, kein Fristkasten, kein Übermitteln", async () => {
    uhrStellen();
    server.readOnly = true;
    server.positionen = [titel({ status: "ANGENOMMEN" }), masern({ status: "ENTFAELLT" })];
    await zeigeSeite();
    expect(screen.getByRole("status").textContent).toBe(MELDUNGEN.ALLES_GEPRUEFT);
    expect(screen.queryAllByLabelText(/Datei hinzufügen/)).toHaveLength(0);
    expect(screen.queryByLabelText("Gültig bis (Ablaufdatum)")).toBeNull();
    expect(screen.queryByRole("button", { name: "Unterlagen übermitteln" })).toBeNull();
    expect(document.querySelector("[data-fristkasten]")).toBeNull();
    // Die Begruendung einer frueheren Zurueckweisung ist dann kein Thema mehr.
    expect(document.querySelector("[data-begruendung]")).toBeNull();
  });

  it("410 beim Hochladen: die Seite wechselt auf die Fehlerseite", async () => {
    uhrStellen();
    await zeigeSeite();
    sonderfall = (a) =>
      a.method === "POST"
        ? { status: 410, body: { error: MELDUNGEN.ANFORDERUNG_ZURUECKGEZOGEN, grund: "ANFORDERUNG_ZURUECKGEZOGEN" } }
        : undefined;
    await dateienWaehlen("Aufenthaltstitel", [datei("vorne.jpg", "image/jpeg")]);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Anforderung zurückgezogen");
    expect(seitentext()).toContain(MELDUNGEN.ANFORDERUNG_ZURUECKGEZOGEN);
  });

  /** HR hat inzwischen entschieden: Titel entfaellt (Entwuerfe geloescht, EP-2), der Rest ist angenommen. */
  function hrHatAllesEntschieden() {
    for (const p of server.positionen) {
      p.status = p.id === "p-titel" ? "ENTFAELLT" : "ANGENOMMEN";
      p.entwuerfe = [];
    }
    server.readOnly = true;
    return { status: 409, body: { error: MELDUNGEN.ALLES_GEPRUEFT, grund: "ALLES_GEPRUEFT" } };
  }

  it("409 „alles geprüft“ beim Hochladen: nur lesen, und der Stand wird neu geladen", async () => {
    uhrStellen();
    server.positionen = [masern(), titel({ entwuerfe: [VORNE] })];
    await zeigeSeite();
    sonderfall = (a) => (a.method === "POST" ? hrHatAllesEntschieden() : undefined);
    await dateienWaehlen("Aufenthaltstitel", [datei("hinten.jpg", "image/jpeg")]);
    expect(gets()).toHaveLength(2);
    expect(screen.getByRole("status").textContent).toBe(MELDUNGEN.ALLES_GEPRUEFT);
    expect(screen.queryAllByLabelText(/Datei hinzufügen/)).toHaveLength(0);
    // Die Kacheln zeigen den Stand des Servers, nicht mehr die geloeschten Entwuerfe.
    expect(kachel("Aufenthaltstitel").querySelector("[data-stand]")?.textContent).toBe("Wird nicht mehr benötigt");
    expect(kachel("Masernschutz-Nachweis").querySelector("[data-stand]")?.textContent).toBe("Angenommen");
    expect(seitentext()).not.toContain("titel-vorne.jpg");
    expect(document.querySelector('[data-stand="BEREIT"]')).toBeNull();
  });

  it("409 „alles geprüft“ beim Übermitteln: keine Kachel bleibt „bereit“", async () => {
    uhrStellen();
    server.positionen = [masern(), titel({ entwuerfe: [VORNE, HINTEN] })];
    await zeigeSeite();
    sonderfall = (a) => (a.url.endsWith("/uebermitteln") ? hrHatAllesEntschieden() : undefined);
    await klicken(uebermittelnKnopf());
    expect(gets()).toHaveLength(2);
    expect(screen.getByRole("status").textContent).toBe(MELDUNGEN.ALLES_GEPRUEFT);
    expect(document.querySelector('[data-stand="BEREIT"]')).toBeNull();
    expect(seitentext()).not.toContain("titel-vorne.jpg");
    expect(seitentext()).not.toContain("titel-hinten.jpg");
    expect(document.querySelector("[data-balken]")).toBeNull();
  });

  it("409 „alles geprüft“ und das Neuladen scheitert: die Seite bleibt wenigstens auf nur lesen", async () => {
    uhrStellen();
    server.positionen = [titel({ entwuerfe: [VORNE] })];
    await zeigeSeite();
    sonderfall = (a) => {
      if (a.method === "GET") throw new Error("offline");
      return a.url.endsWith("/uebermitteln") ? hrHatAllesEntschieden() : undefined;
    };
    await klicken(uebermittelnKnopf());
    expect(gets()).toHaveLength(2);
    expect(screen.getByRole("status").textContent).toBe(MELDUNGEN.ALLES_GEPRUEFT);
    expect(screen.queryByRole("button", { name: /entfernen/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Unterlagen übermitteln" })).toBeNull();
  });
});

// =============================================
// 3. Frist und Linkende
// =============================================

describe("Frist und Linkende", () => {
  it("vor der Frist: genau ein Datum, die Frist — das Linkende steht nirgends", async () => {
    uhrStellen();
    await zeigeSeite();
    const kasten = document.querySelector("[data-fristkasten]") as HTMLElement;
    expect(kasten.querySelector("p")?.textContent).toBe("Bitte laden Sie die Unterlagen bis Freitag, 25.09.2026 hoch.");
    expect(kasten.querySelector("strong")?.textContent).toBe("Freitag, 25.09.2026");
    expect(kasten.querySelector("[data-countdown]")?.textContent).toBe("Noch 4 Tage bis zur Frist.");
    expect(seitentext()).not.toContain("09.10.2026");
  });

  it("nach der Frist: der Satz mit dem Linkende, kein Countdown", async () => {
    uhrStellen(NACH_DER_FRIST);
    server.heute = "2026-09-28";
    await zeigeSeite();
    const kasten = document.querySelector("[data-fristkasten]") as HTMLElement;
    expect(kasten.querySelector("p")?.textContent).toBe(
      "Die Frist ist abgelaufen. Sie können die Unterlagen noch bis Freitag, 09.10.2026 hochladen.",
    );
    expect(kasten.querySelector("strong")?.textContent).toBe("Freitag, 09.10.2026");
    expect(kasten.querySelector("[data-countdown]")).toBeNull();
  });

  it("nichts mehr offen: kein Fristkasten, kein Balken, nur der Stand", async () => {
    uhrStellen();
    server.positionen = [rvAntrag(), titel({ status: "ANGENOMMEN" })];
    await zeigeSeite();
    expect(document.querySelector("[data-fristkasten]")).toBeNull();
    expect(document.querySelector("[data-balken]")).toBeNull();
    expect(document.querySelector("[data-alles-uebermittelt]")?.textContent).toBe(
      "Sie haben alle angeforderten Unterlagen übermittelt. Die Personalabteilung prüft sie. Falls etwas fehlt oder nicht lesbar ist, erhalten Sie eine E-Mail.",
    );
  });

  it.each([
    ["2026-09-24T10:00:00.000Z", "Die Frist endet morgen."],
    ["2026-09-25T21:30:00.000Z", "Die Frist endet heute."], // 23:30 Uhr in Berlin, in UTC noch der 25.
    ["2026-09-24T22:30:00.000Z", "Die Frist endet heute."], // 00:30 Uhr in Berlin, in UTC noch der 24.
  ])("Countdown am %s in Berliner Kalendertagen: „%s“", async (zeit, erwartet) => {
    uhrStellen(new Date(zeit));
    await zeigeSeite();
    expect(document.querySelector("[data-countdown]")?.textContent).toBe(erwartet);
  });
});

// =============================================
// 4. Hochladen
// =============================================

describe("Hochladen", () => {
  it("Dateifeld: sichtbares Label, multiple, accept ohne HEIC, kein capture", async () => {
    uhrStellen();
    await zeigeSeite();
    const feld = dateiFeld("Aufenthaltstitel");
    expect(feld.type).toBe("file");
    expect(feld.multiple).toBe(true);
    expect(feld.getAttribute("accept")).toBe("application/pdf,image/jpeg,image/png,image/webp");
    expect(feld.hasAttribute("capture")).toBe(false);
    const label = document.querySelector(`label[for="${feld.id}"]`) as HTMLElement;
    expect(label.textContent).toBe("Datei hinzufügen: Aufenthaltstitel");
    expect(label.className).not.toContain("sr-only");
    expect(label.className).toContain("min-h-11");
  });

  it("eine Anfrage je Datei, nacheinander, mit genau einem Feld „datei“", async () => {
    uhrStellen();
    await zeigeSeite();
    let freigeben!: () => void;
    sonderfall = (a) =>
      a.method === "POST" && a.dateien[0]?.name === "vorne.jpg"
        ? new Promise<undefined>((r) => (freigeben = () => r(undefined)))
        : undefined;

    await dateienWaehlen("Aufenthaltstitel", [datei("vorne.jpg", "image/jpeg"), datei("hinten.png", "image/png")]);
    // Die zweite Datei wartet, bis die erste beantwortet ist.
    expect(uploads()).toHaveLength(1);
    expect(balkenStand().textContent).toBe("vorne.jpg wird hochgeladen (Datei 1 von 2) …");
    expect(uebermittelnKnopf().disabled).toBe(true);

    await act(async () => freigeben());
    await ruhe();
    expect(uploads().map((u) => u.url)).toEqual([
      `${BASIS}/positionen/p-titel/dateien`,
      `${BASIS}/positionen/p-titel/dateien`,
    ]);
    expect(uploads().map((u) => u.felder)).toEqual([["datei"], ["datei"]]);
    expect(uploads().map((u) => u.dateien.map((d) => d.name))).toEqual([["vorne.jpg"], ["hinten.png"]]);

    const t = kachel("Aufenthaltstitel");
    expect(t.querySelector("[data-stand]")?.textContent).toBe("2 Dateien bereit, noch nicht übermittelt");
    expect(t.textContent).toContain("vorne.jpg");
    expect(t.textContent).toContain("hinten.png");
    expect(balkenStand().textContent).toBe("1 Unterlage bereit zum Übermitteln");
    expect(uebermittelnKnopf().disabled).toBe(false);
  });

  it("zu groß oder falscher Typ: keine Anfrage, Fehler je Datei mit role=alert an der Unterlage", async () => {
    uhrStellen();
    await zeigeSeite();
    await dateienWaehlen("Aufenthaltstitel", [
      datei("scan.pdf", "application/pdf", MAX_DATEI_BYTES + 1),
      datei("foto.heic", "image/heic"),
      datei("leer.pdf", "application/pdf", 0),
    ]);
    expect(uploads()).toHaveLength(0);
    const alarm = within(kachel("Aufenthaltstitel")).getByRole("alert");
    expect([...alarm.querySelectorAll("li")].map((li) => li.textContent)).toEqual([
      `scan.pdf: ${MELDUNGEN.DATEI_ZU_GROSS}`,
      `foto.heic: ${MELDUNGEN.DATEITYP_NICHT_ERLAUBT}`,
      `leer.pdf: ${MELDUNGEN.DATEI_UNVOLLSTAENDIG}`,
    ]);
    // Nur an dieser Unterlage.
    expect(within(kachel("Masernschutz-Nachweis")).queryByRole("alert")).toBeNull();
  });

  it("genau 9,5 MB und eine PDF ohne Typangabe gehen hinaus, nur die zu große nicht", async () => {
    uhrStellen();
    await zeigeSeite();
    await dateienWaehlen("Aufenthaltstitel", [
      datei("grenze.pdf", "application/pdf", MAX_DATEI_BYTES),
      datei("ohne-typ.pdf", ""),
      datei("drueber.jpg", "image/jpeg", MAX_DATEI_BYTES + 1),
    ]);
    expect(uploads().map((u) => u.dateien[0].name)).toEqual(["grenze.pdf", "ohne-typ.pdf"]);
    expect(within(kachel("Aufenthaltstitel")).getByRole("alert").textContent).toBe(
      `drueber.jpg: ${MELDUNGEN.DATEI_ZU_GROSS}`,
    );
  });

  it("höchstens 10 Dateien je Unterlage — die elfte geht nicht hinaus", async () => {
    uhrStellen();
    const neun = Array.from({ length: 9 }, (_, i) => ({ id: `d${i}`, name: `seite-${i + 1}.jpg`, groesse: 1000 }));
    server.positionen = [titel({ entwuerfe: neun })];
    await zeigeSeite();
    await dateienWaehlen("Aufenthaltstitel", [datei("zehn.jpg", "image/jpeg"), datei("elf.jpg", "image/jpeg")]);
    expect(uploads().map((u) => u.dateien[0].name)).toEqual(["zehn.jpg"]);
    expect(within(kachel("Aufenthaltstitel")).getByRole("alert").textContent).toBe(
      `elf.jpg: ${MELDUNGEN.ZU_VIELE_DATEIEN_POSITION}`,
    );
    // Voll: kein Dateifeld mehr, aber der Grund an seiner Stelle.
    expect(screen.queryByLabelText("Datei hinzufügen: Aufenthaltstitel")).toBeNull();
    expect(kachel("Aufenthaltstitel").querySelector("[data-voll]")?.textContent).toBe(
      `${MELDUNGEN.ZU_VIELE_DATEIEN_POSITION} Entfernen Sie eine Datei, um eine andere hinzuzufügen.`,
    );
  });

  it("10 Dateien schon beim Öffnen: der Grund steht da, ohne dass etwas gewählt wurde; nach „Entfernen“ ist das Feld zurück", async () => {
    uhrStellen();
    const zehn = Array.from({ length: 10 }, (_, i) => ({ id: `d${i}`, name: `seite-${i + 1}.jpg`, groesse: 1000 }));
    server.positionen = [titel({ entwuerfe: zehn }), masern()];
    await zeigeSeite();
    const t = kachel("Aufenthaltstitel");
    expect(within(t).queryByLabelText(/Datei hinzufügen/)).toBeNull();
    expect(t.querySelector("[data-voll]")?.textContent).toContain(MELDUNGEN.ZU_VIELE_DATEIEN_POSITION);
    expect(within(t).queryByRole("alert")).toBeNull();
    // An der Unterlage mit Platz kein solcher Hinweis.
    expect(kachel("Masernschutz-Nachweis").querySelector("[data-voll]")).toBeNull();

    await klicken(screen.getByRole("button", { name: "seite-10.jpg entfernen" }));
    expect(kachel("Aufenthaltstitel").querySelector("[data-voll]")).toBeNull();
    expect(dateiFeld("Aufenthaltstitel")).not.toBeNull();
  });

  it("Fehler des Servers betrifft nur diese Datei — die übrigen laufen weiter", async () => {
    uhrStellen();
    await zeigeSeite();
    sonderfall = (a) =>
      a.method === "POST" && a.dateien[0]?.name === "kaputt.jpg"
        ? { status: 415, body: { error: MELDUNGEN.DATEITYP_NICHT_ERLAUBT } }
        : undefined;
    await dateienWaehlen("Aufenthaltstitel", [datei("kaputt.jpg", "image/jpeg"), datei("gut.jpg", "image/jpeg")]);
    expect(uploads()).toHaveLength(2);
    const t = kachel("Aufenthaltstitel");
    expect(within(t).getByRole("alert").textContent).toBe(`kaputt.jpg: ${MELDUNGEN.DATEITYP_NICHT_ERLAUBT}`);
    expect(t.textContent).toContain("gut.jpg");
  });

  it("Verbindungsfehler bricht ab und nennt, was nicht hochgeladen wurde", async () => {
    uhrStellen();
    await zeigeSeite();
    sonderfall = (a) => {
      if (a.method === "POST") throw new Error("offline");
      return undefined;
    };
    await dateienWaehlen("Aufenthaltstitel", [datei("a.jpg", "image/jpeg"), datei("b.jpg", "image/jpeg")]);
    expect(uploads()).toHaveLength(1);
    expect([...within(kachel("Aufenthaltstitel")).getByRole("alert").querySelectorAll("li")].map((li) => li.textContent)).toEqual([
      "a.jpg: Verbindungsfehler. Bitte versuchen Sie es später erneut.",
      "Nicht hochgeladen: b.jpg.",
    ]);
  });

  it("409 „Entfällt“ beim Hochladen: Meldung an der Unterlage und der Stand wird neu geladen", async () => {
    uhrStellen();
    await zeigeSeite();
    sonderfall = (a) => {
      if (a.method !== "POST") return undefined;
      positionVon("p-titel").status = "ENTFAELLT";
      return { status: 409, body: { error: MELDUNGEN.UNTERLAGE_ENTFAELLT, grund: "UNTERLAGE_ENTFAELLT" } };
    };
    await dateienWaehlen("Aufenthaltstitel", [datei("vorne.jpg", "image/jpeg")]);
    expect(gets()).toHaveLength(2);
    const t = kachel("Aufenthaltstitel");
    expect(t.querySelector("[data-stand]")?.textContent).toBe("Wird nicht mehr benötigt");
    expect(within(t).queryByLabelText(/Datei hinzufügen/)).toBeNull();
  });

  it("429: wartet Retry-After ab und versucht es selbst erneut", async () => {
    uhrStellen(VOR_DER_FRIST, { timer: true });
    await zeigeSeite();
    let erste = true;
    sonderfall = (a) => {
      if (a.method !== "POST" || !erste) return undefined;
      erste = false;
      return { status: 429, body: { error: MELDUNGEN.ZU_VIELE_ANFRAGEN }, retryAfter: "2" };
    };
    await dateienWaehlen("Aufenthaltstitel", [datei("vorne.jpg", "image/jpeg")]);
    expect(uploads()).toHaveLength(1);
    expect(balkenStand().textContent).toBe(
      "Zu viele Anfragen, bitte warten Sie einen Moment. Neuer Versuch in 2 Sekunden.",
    );
    expect(balkenStand().getAttribute("aria-live")).toBe("polite");

    await act(async () => {
      await jest.advanceTimersByTimeAsync(1999);
    });
    expect(uploads()).toHaveLength(1);

    await act(async () => {
      await jest.advanceTimersByTimeAsync(1);
    });
    await ruhe();
    expect(uploads()).toHaveLength(2);
    const t = kachel("Aufenthaltstitel");
    expect(t.textContent).toContain("vorne.jpg");
    expect(within(t).queryByRole("alert")).toBeNull();
    expect(balkenStand().textContent).toBe("1 Unterlage bereit zum Übermitteln");
  });

  it("Fehler bleiben stehen (kein Ausblenden nach Sekunden) — bis zur nächsten Aktion an der Unterlage", async () => {
    uhrStellen(VOR_DER_FRIST, { timer: true });
    await zeigeSeite();
    await dateienWaehlen("Aufenthaltstitel", [datei("foto.heic", "image/heic")]);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(60_000);
    });
    expect(within(kachel("Aufenthaltstitel")).getByRole("alert").textContent).toContain("foto.heic");

    await dateienWaehlen("Aufenthaltstitel", [datei("vorne.jpg", "image/jpeg")]);
    expect(within(kachel("Aufenthaltstitel")).queryByRole("alert")).toBeNull();
  });
});

// =============================================
// 5. Entfernen
// =============================================

describe("Entfernen", () => {
  beforeEach(() => {
    server.positionen = [masern(), titel({ entwuerfe: [VORNE, HINTEN] })];
  });

  it("Knopf „<Dateiname> entfernen“ schickt DELETE und übernimmt den neuen Stand", async () => {
    uhrStellen();
    await zeigeSeite();
    const knopf = screen.getByRole("button", { name: "titel-vorne.jpg entfernen" });
    expect(knopf.textContent).toBe("Entfernen");
    await klicken(knopf);
    expect(anfragen.filter((a) => a.method === "DELETE").map((a) => a.url)).toEqual([`${BASIS}/dateien/d-vorne`]);
    const t = kachel("Aufenthaltstitel");
    expect(t.textContent).not.toContain("titel-vorne.jpg");
    expect(t.textContent).toContain("titel-hinten.jpg");
    expect(t.querySelector("[data-stand]")?.textContent).toBe("1 Datei bereit, noch nicht übermittelt");
  });

  it("Fokus nach dem Entfernen: erst auf die nächste Datei derselben Unterlage, dann auf ihr Dateifeld — nie auf <body>", async () => {
    uhrStellen();
    await zeigeSeite();
    await klicken(screen.getByRole("button", { name: "titel-vorne.jpg entfernen" }));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "titel-hinten.jpg entfernen" }));

    await klicken(screen.getByRole("button", { name: "titel-hinten.jpg entfernen" }));
    expect(document.activeElement).toBe(dateiFeld("Aufenthaltstitel"));
    expect(document.activeElement).not.toBe(document.body);
  });

  it("Fokus nach dem Entfernen der letzten Datei in der Liste: auf die vorige", async () => {
    uhrStellen();
    await zeigeSeite();
    await klicken(screen.getByRole("button", { name: "titel-hinten.jpg entfernen" }));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "titel-vorne.jpg entfernen" }));
  });

  it("scheitert das Entfernen: Fehler an der Unterlage (role=alert), Stand neu geladen", async () => {
    uhrStellen();
    await zeigeSeite();
    sonderfall = (a) =>
      a.method === "DELETE"
        ? { status: 409, body: { error: MELDUNGEN.DATEI_NICHT_ENTFERNBAR, grund: "NICHT_ENTFERNBAR" } }
        : undefined;
    await klicken(screen.getByRole("button", { name: "titel-vorne.jpg entfernen" }));
    expect(within(kachel("Aufenthaltstitel")).getByRole("alert").textContent).toBe(
      `titel-vorne.jpg: ${MELDUNGEN.DATEI_NICHT_ENTFERNBAR}`,
    );
    expect(gets()).toHaveLength(2);
  });
});

// =============================================
// 6. „Gültig bis"
// =============================================

describe("„Gültig bis“", () => {
  it("Feld mit Label und Hinweis nur bei der Unterlage mit Ablaufdatum", async () => {
    uhrStellen();
    await zeigeSeite();
    const feld = within(kachel("Aufenthaltstitel")).getByLabelText("Gültig bis (Ablaufdatum)") as HTMLInputElement;
    expect(feld.type).toBe("date");
    expect(feld.className).toContain("text-base");
    expect(feld.className).toContain("sm:text-sm");
    const hinweis = document.getElementById(feld.getAttribute("aria-describedby") ?? "");
    expect(hinweis?.textContent).toBe(
      "Leer lassen, wenn Ihr Nachweis unbefristet ist (z. B. Niederlassungserlaubnis).",
    );
    expect(within(kachel("Masernschutz-Nachweis")).queryByLabelText("Gültig bis (Ablaufdatum)")).toBeNull();
  });

  it("speichert beim Verlassen des Feldes — nur, wenn sich etwas geändert hat", async () => {
    uhrStellen();
    await zeigeSeite();
    const feld = within(kachel("Aufenthaltstitel")).getByLabelText("Gültig bis (Ablaufdatum)") as HTMLInputElement;
    await act(async () => {
      fireEvent.change(feld, { target: { value: "2028-03-31" } });
    });
    await act(async () => {
      fireEvent.blur(feld);
    });
    await ruhe();
    const patches = anfragen.filter((a) => a.method === "PATCH");
    expect(patches.map((a) => [a.url, a.json])).toEqual([[`${BASIS}/positionen/p-titel`, { gueltigBis: "2028-03-31" }]]);
    expect(feld.value).toBe("2028-03-31");

    await act(async () => {
      fireEvent.blur(feld);
    });
    await ruhe();
    expect(anfragen.filter((a) => a.method === "PATCH")).toHaveLength(1);
  });

  it("Fehler beim Speichern steht an der Unterlage", async () => {
    uhrStellen();
    await zeigeSeite();
    const text = "Das Ablaufdatum liegt mehr als 20 Jahre in der Zukunft. Bitte prüfen Sie die Jahreszahl.";
    sonderfall = (a) => (a.method === "PATCH" ? { status: 400, body: { error: text } } : undefined);
    const feld = within(kachel("Aufenthaltstitel")).getByLabelText("Gültig bis (Ablaufdatum)");
    await act(async () => {
      fireEvent.change(feld, { target: { value: "2099-01-01" } });
    });
    await act(async () => {
      fireEvent.blur(feld);
    });
    await ruhe();
    expect(within(kachel("Aufenthaltstitel")).getByRole("alert").textContent).toBe(text);
  });

  describe("abgelehntes Datum", () => {
    const TEXT = "Das Ablaufdatum liegt mehr als 20 Jahre in der Zukunft. Bitte prüfen Sie die Jahreszahl.";
    const feld = () => within(kachel("Aufenthaltstitel")).getByLabelText("Gültig bis (Ablaufdatum)") as HTMLInputElement;

    async function falschesDatumVerlassen() {
      sonderfall = (a) => (a.method === "PATCH" ? { status: 400, body: { error: TEXT } } : undefined);
      await act(async () => {
        fireEvent.change(feld(), { target: { value: "2099-01-01" } });
      });
      await act(async () => {
        fireEvent.blur(feld());
      });
      await ruhe();
      sonderfall = null;
    }

    it("steht unter dem Feld: aria-invalid, aria-describedby auf Fehler und Hinweis", async () => {
      uhrStellen();
      server.positionen = [titel({ entwuerfe: [VORNE] })];
      await zeigeSeite();
      await falschesDatumVerlassen();
      expect(feld().getAttribute("aria-invalid")).toBe("true");
      const beschrieben = (feld().getAttribute("aria-describedby") ?? "").split(" ");
      expect(beschrieben.map((id) => document.getElementById(id)?.textContent)).toEqual([
        TEXT,
        "Leer lassen, wenn Ihr Nachweis unbefristet ist (z. B. Niederlassungserlaubnis).",
      ]);
      expect(document.getElementById(beschrieben[0])?.getAttribute("role")).toBe("alert");
    });

    it("ein Hochladen an derselben Unterlage räumt es nicht ab — erst eine Änderung des Feldes", async () => {
      uhrStellen();
      server.positionen = [titel({ entwuerfe: [VORNE] })];
      await zeigeSeite();
      await falschesDatumVerlassen();
      await dateienWaehlen("Aufenthaltstitel", [datei("hinten.jpg", "image/jpeg")]);
      expect(kachel("Aufenthaltstitel").textContent).toContain("hinten.jpg");
      expect(kachel("Aufenthaltstitel").querySelector("[data-datum-fehler]")?.textContent).toBe(TEXT);
      expect(feld().value).toBe("2099-01-01");

      await act(async () => {
        fireEvent.change(feld(), { target: { value: "2028-03-31" } });
      });
      expect(kachel("Aufenthaltstitel").querySelector("[data-datum-fehler]")).toBeNull();
      expect(feld().hasAttribute("aria-invalid")).toBe(false);
    });

    it("Übermitteln sendet nicht, solange das Datum abgelehnt ist, sondern führt zum Feld", async () => {
      uhrStellen();
      server.positionen = [titel({ entwuerfe: [VORNE] })];
      await zeigeSeite();
      await falschesDatumVerlassen();
      await klicken(uebermittelnKnopf());
      expect(uebermittlungen()).toHaveLength(0);
      const balken = document.querySelector("[data-balken]") as HTMLElement;
      expect(within(balken).getByRole("alert").textContent).toBe("Bitte prüfen Sie zuerst das Ablaufdatum: Aufenthaltstitel.");
      expect(document.activeElement).toBe(feld());

      // Korrigiert: jetzt geht die Übermittlung hinaus, mit dem neuen Datum.
      await act(async () => {
        fireEvent.change(feld(), { target: { value: "2028-03-31" } });
      });
      await klicken(uebermittelnKnopf());
      expect(uebermittlungen().map((a) => a.json)).toEqual([{ gueltigBis: { "p-titel": "2028-03-31" } }]);
    });

    it("400 beim Übermitteln mit ungespeichertem Datum: der Text auch am Feld, Fokus dort", async () => {
      uhrStellen();
      server.positionen = [titel({ entwuerfe: [VORNE] }), masern({ entwuerfe: [{ id: "d-m", name: "impfpass.jpg", groesse: 2000 }] })];
      await zeigeSeite();
      sonderfall = (a) => (a.url.endsWith("/uebermitteln") ? { status: 400, body: { error: TEXT } } : undefined);
      await act(async () => {
        fireEvent.change(feld(), { target: { value: "2099-01-01" } });
      });
      await klicken(uebermittelnKnopf());
      const balken = document.querySelector("[data-balken]") as HTMLElement;
      expect(within(balken).getByRole("alert").textContent).toBe(TEXT);
      expect(kachel("Aufenthaltstitel").querySelector("[data-datum-fehler]")?.textContent).toBe(TEXT);
      expect(feld().getAttribute("aria-invalid")).toBe("true");
      expect(document.activeElement).toBe(feld());
      // Die Unterlage ohne Ablaufdatum bekommt keinen Fehler.
      expect(within(kachel("Masernschutz-Nachweis")).queryByRole("alert")).toBeNull();
    });
  });

  it("wird beim Übermitteln mitgeschickt — auch ohne vorheriges Verlassen des Feldes", async () => {
    uhrStellen();
    server.positionen = [masern({ entwuerfe: [{ id: "d-m", name: "impfpass.jpg", groesse: 2000 }] }), titel({ entwuerfe: [VORNE] })];
    await zeigeSeite();
    await act(async () => {
      fireEvent.change(within(kachel("Aufenthaltstitel")).getByLabelText("Gültig bis (Ablaufdatum)"), {
        target: { value: "2028-03-31" },
      });
    });
    await klicken(uebermittelnKnopf());
    expect(uebermittlungen().map((a) => [a.method, a.json])).toEqual([
      ["POST", { gueltigBis: { "p-titel": "2028-03-31" } }],
    ]);
    expect(positionVon("p-titel").gueltigBisAngabe).toBe("2028-03-31");
  });

  it("leer heißt unbefristet: null; ohne bereite Unterlage mit Ablaufdatum ein leeres Objekt", async () => {
    uhrStellen();
    server.positionen = [titel({ entwuerfe: [VORNE] })];
    await zeigeSeite();
    await klicken(uebermittelnKnopf());
    expect(uebermittlungen()[0].json).toEqual({ gueltigBis: { "p-titel": null } });

    cleanup();
    anfragen = [];
    server.positionen = [masern({ entwuerfe: [{ id: "d-m", name: "impfpass.jpg", groesse: 2000 }] }), titel()];
    await zeigeSeite();
    await klicken(uebermittelnKnopf());
    expect(uebermittlungen()[0].json).toEqual({});
  });

  it("Übermitteln wartet eine laufende Speicherung ab", async () => {
    uhrStellen();
    server.positionen = [titel({ entwuerfe: [VORNE] })];
    await zeigeSeite();
    let freigeben!: () => void;
    sonderfall = (a) => (a.method === "PATCH" ? new Promise<undefined>((r) => (freigeben = () => r(undefined))) : undefined);
    const feld = within(kachel("Aufenthaltstitel")).getByLabelText("Gültig bis (Ablaufdatum)");
    await act(async () => {
      fireEvent.change(feld, { target: { value: "2028-03-31" } });
    });
    await act(async () => {
      fireEvent.blur(feld);
      fireEvent.click(uebermittelnKnopf());
    });
    await ruhe();
    expect(uebermittlungen()).toHaveLength(0);
    await act(async () => freigeben());
    await ruhe();
    expect(anfragen.map((a) => a.method + " " + a.url.slice(BASIS.length))).toEqual([
      "GET ",
      "PATCH /positionen/p-titel",
      "POST /uebermitteln",
    ]);
    // Kein Fehler an der jetzt uebermittelten Unterlage.
    expect(within(kachel("Aufenthaltstitel")).queryByRole("alert")).toBeNull();
  });
});

// =============================================
// 7. Übermitteln
// =============================================

describe("Übermitteln", () => {
  it("teilweise: nennt, was übermittelt wurde und was noch offen ist; Fokus auf der Bestätigung", async () => {
    uhrStellen();
    server.positionen = [masern(), titel({ entwuerfe: [VORNE, HINTEN] }), rvAntrag()];
    await zeigeSeite();
    expect(balkenStand().textContent).toBe("1 Unterlage bereit zum Übermitteln");
    await klicken(uebermittelnKnopf());

    const bestaetigung = document.querySelector("[data-bestaetigung]") as HTMLElement;
    expect(bestaetigung.querySelector("h2")?.textContent).toBe("Vielen Dank – Ihre Unterlagen sind übermittelt.");
    expect(bestaetigung.textContent).toContain("Übermittelt: Aufenthaltstitel.");
    expect(bestaetigung.querySelector("[data-noch-offen]")?.textContent).toBe(
      "Noch offen: Masernschutz-Nachweis. Diese Unterlagen können Sie später über denselben Link hochladen und übermitteln.",
    );
    expect(document.activeElement).toBe(bestaetigung);

    expect(kachel("Aufenthaltstitel").querySelector("[data-stand]")?.textContent).toBe(
      "Übermittelt am 21.09.2026, wird geprüft",
    );
    expect(balkenStand().textContent).toBe("Noch keine Unterlage bereit zum Übermitteln");
    expect(uebermittelnKnopf().disabled).toBe(true);
  });

  it("vorher: Erklärung und Balken sagen, dass danach keine Dateien mehr dazukommen — der Balken mit Namen, am Knopf beschrieben", async () => {
    uhrStellen();
    server.positionen = [
      masern({ entwuerfe: [{ id: "d-m", name: "impfpass.jpg", groesse: 2000 }] }),
      titel({ entwuerfe: [VORNE] }),
      rvAntrag(),
    ];
    await zeigeSeite();
    expect(document.querySelector("[data-erklaerung]")?.textContent).toContain(
      "Danach können Sie zu diesen Unterlagen keine Dateien mehr hinzufügen oder entfernen – laden Sie deshalb zuerst alle Seiten einer Unterlage hoch.",
    );
    expect(balkenStand().textContent).toBe("2 Unterlagen bereit zum Übermitteln");
    const beschreibung = document.getElementById(uebermittelnKnopf().getAttribute("aria-describedby") ?? "");
    expect(beschreibung?.textContent).toBe(
      "Übermittelt werden: Masernschutz-Nachweis, Aufenthaltstitel. Danach können Sie dazu keine Dateien mehr hinzufügen.",
    );
    // Die Namen stehen nicht in der aria-live-Region (sonst bei jedem Upload vorgelesen).
    expect(balkenStand().textContent).not.toContain("Masernschutz-Nachweis");
  });

  it("ohne bereite Unterlage keine Namenszeile und keine Beschreibung am Knopf", async () => {
    uhrStellen();
    await zeigeSeite();
    expect(document.querySelector("[data-balken-bereit]")).toBeNull();
    expect(uebermittelnKnopf().hasAttribute("aria-describedby")).toBe(false);
  });

  it("Schriftform: die Bestätigung nennt das Original, das noch abzugeben ist", async () => {
    uhrStellen();
    server.positionen = [
      rvAntrag({ status: "ANGEFORDERT", uebermitteltAm: null, entwuerfe: [{ id: "d-rv", name: "rv.pdf", groesse: 3000 }] }),
      titel({ entwuerfe: [VORNE] }),
    ];
    await zeigeSeite();
    await klicken(uebermittelnKnopf());
    const bestaetigung = document.querySelector("[data-bestaetigung]") as HTMLElement;
    expect(bestaetigung.querySelector("[data-original-bestaetigung]")?.textContent).toBe(
      "Bitte geben Sie zusätzlich das unterschriebene Original ab: Unterschriebener RV-Antrag.",
    );
    // Und an der jetzt übermittelten Kachel steht der Hinweis weiter.
    expect(kachel("Unterschriebener RV-Antrag").querySelector("[data-original]")).not.toBeNull();
  });

  it("ohne Schriftform-Unterlage kein Original-Satz in der Bestätigung", async () => {
    uhrStellen();
    server.positionen = [titel({ entwuerfe: [VORNE] }), masern()];
    await zeigeSeite();
    await klicken(uebermittelnKnopf());
    expect(document.querySelector("[data-original-bestaetigung]")).toBeNull();
  });

  it("vollständig: kein Balken mehr, Hinweis auf die Prüfung", async () => {
    uhrStellen();
    server.positionen = [titel({ entwuerfe: [VORNE] }), rvAntrag()];
    await zeigeSeite();
    await klicken(uebermittelnKnopf());
    const bestaetigung = document.querySelector("[data-bestaetigung]") as HTMLElement;
    expect(bestaetigung.textContent).toContain(
      "Die Personalabteilung prüft Ihre Unterlagen. Falls etwas fehlt oder nicht lesbar ist, erhalten Sie eine E-Mail.",
    );
    expect(document.activeElement).toBe(bestaetigung);
    expect(document.querySelector("[data-balken]")).toBeNull();
  });

  it("Doppelklick: genau eine Anfrage", async () => {
    uhrStellen();
    server.positionen = [titel({ entwuerfe: [VORNE] }), masern()];
    await zeigeSeite();
    await act(async () => {
      fireEvent.click(uebermittelnKnopf());
      fireEvent.click(uebermittelnKnopf());
    });
    await ruhe();
    expect(uebermittlungen()).toHaveLength(1);
  });

  it("ohne bereite Unterlage ist der Knopf gesperrt", async () => {
    uhrStellen();
    await zeigeSeite();
    expect(balkenStand().textContent).toBe("Noch keine Unterlage bereit zum Übermitteln");
    expect(uebermittelnKnopf().disabled).toBe(true);
  });

  it("Fehler beim Übermitteln steht im Balken (role=alert), der Stand wird neu geladen", async () => {
    uhrStellen();
    server.positionen = [titel({ entwuerfe: [VORNE] }), masern()];
    await zeigeSeite();
    sonderfall = (a) =>
      a.url.endsWith("/uebermitteln")
        ? { status: 409, body: { error: MELDUNGEN.NICHTS_ZU_UEBERMITTELN, grund: "NICHTS_BEREIT" } }
        : undefined;
    await klicken(uebermittelnKnopf());
    const balken = document.querySelector("[data-balken]") as HTMLElement;
    expect(within(balken).getByRole("alert").textContent).toBe(MELDUNGEN.NICHTS_ZU_UEBERMITTELN);
    expect(gets()).toHaveLength(2);
    expect(document.querySelector("[data-bestaetigung]")).toBeNull();
  });
});

// =============================================
// 8. Balken und Fusszeile
// =============================================

describe("Balken und Fußzeile", () => {
  it("Stand im festen Balken mit aria-live=polite, Knopf mit Tippfläche ≥ 44 px", async () => {
    uhrStellen();
    await zeigeSeite();
    const balken = document.querySelector("[data-balken]") as HTMLElement;
    expect(balken.className).toContain("fixed");
    expect(balken.className).toContain("bottom-0");
    expect(balkenStand().getAttribute("aria-live")).toBe("polite");
    expect(uebermittelnKnopf().className).toContain("min-h-11");
  });

  it("Fußzeile: verantwortliche Stelle, Datenschutz, Link persönlich, keine Unterlagen per E-Mail", async () => {
    uhrStellen();
    await zeigeSeite();
    expect(document.querySelector('[data-fusszeile="verantwortliche-stelle"]')?.textContent).toBe(
      `Verantwortliche Stelle: ${VERANTWORTLICHE_STELLE}.`,
    );
    expect(document.querySelector('[data-fusszeile="hinweise"]')?.textContent).toBe(
      "Der Link ist persönlich, bitte nicht weiterleiten. Bitte senden Sie Unterlagen nicht per E-Mail.",
    );
    expect(document.querySelector('[data-fusszeile="datenschutz"]')?.textContent).toContain("Datenschutz");
    expect(document.querySelector('[data-fusszeile="einrichtung"]')?.textContent).toBe("© 2026 FES Gymnasium");
  });
});

// =============================================
// 9. Kopfdaten (layout.tsx)
// =============================================

describe("Kopfdaten der Seite", () => {
  it("noindex und no-referrer", () => {
    expect(metadata.robots).toEqual(expect.objectContaining({ index: false, follow: false }));
    expect(metadata.referrer).toBe("no-referrer");
  });

  it("das Layout gibt die Seite unverändert aus", () => {
    render(
      <UnterlagenLayout>
        <p data-kind>Inhalt</p>
      </UnterlagenLayout>,
    );
    expect(document.querySelector("[data-kind]")?.textContent).toBe("Inhalt");
  });
});
