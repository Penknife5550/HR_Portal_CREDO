"use client";

/**
 * Dialog „Einstellung zuordnen …“ im Offboarding (Ausstattung & Zugaenge
 * Stufe 2 – Feinplan A4, S32, G11 bis G13, E-A31, E-A35, Mockup 6.8)
 *
 * Was ausgegeben wurde, kennt ein Austritt erst, wenn HR ihm die Einstellung
 * ZUORDNET – nie ueber einen stillen Namensabgleich. Der Dialog zeigt:
 *
 *   - die Vorschlaege des Servers mit Stufe („Starker Vorschlag“ …) und
 *     Begruendung („Gleiche E-Mail-Adresse · Gleiche Einrichtung“), nie mit
 *     Adresse;
 *   - eine Suche ueber Vorgangsnummer oder Nachname (ab 3 Zeichen);
 *   - den Merker „Person bleibt in einer anderen Beschäftigung“ (vorbelegt bei
 *     einer Versetzung): zentrale Ausgaben stehen dann nur als Hinweis da;
 *   - die Vorschau der gewaehlten Einstellung – im Kopf Name und
 *     Vorgangsnummer, damit sichtbar ist, was zugeordnet wird: was mit dem
 *     Arbeitsort geschieht, welche Rueckgaben und Sperraufgaben entstehen,
 *     welche Stuecke nur als Hinweis bleiben und welche gerade ein anderer
 *     Austritt bindet; ohne vorschlagbare Stuecke der Text ihrer Lage (E-A36).
 *     Verschwindet die gewaehlte Einstellung aus der Liste (Suche geaendert
 *     oder geleert), gilt die Wahl nicht mehr (`wahlSichtbar`, Review A4c).
 *
 * Leerzustaende: „Kein Vorschlag – über Vorgangsnummer oder Nachname suchen“,
 * „Mindestens 3 Zeichen“, „Kein Treffer“. Ein Fehler des Servers beim
 * Zuordnen (etwa EINSTELLUNG_VERGEBEN) steht im Fuss (`fehler`), ein Grund,
 * der das Zuordnen schon vorher ausschliesst (`vorschau.sperrGrund`), als
 * sichtbarer Grund am gesperrten Knopf.
 *
 * Gelesen wird ueber GET /api/offboarding/[id]/einstellung (`laden`, im Test
 * ersetzbar) – das schreibt nichts. Zugeordnet wird NICHT hier: Der Dialog baut
 * den Body (`zuordnenBody`, dieselbe Form wie `einstellungAktionSchema`) und
 * meldet ihn an die Seite, die sendet und einen Fehler zurueckgibt – wie das
 * Hausmuster (ausgaben-dialoge.tsx, dialog-rahmen.tsx). Die Vorschau ist
 * gelesen ohne Sperre; der Server prueft beim Zuordnen alles erneut.
 *
 * Dazu der Hinweis `ZuordnungEmpfohlenHinweis` („Einstellung zuordnen, bevor
 * Sie die Abteilungen informieren“, G12) fuer die Abteilungskarte.
 *
 * Portal: Texte ohne Anrede (die Meldungen des Servers bleiben, wie sie sind).
 * Nur Farb-Tokens und lucide-react (neue Datei, Stand 0 in der Sperrklinke).
 */

import { useEffect, useId, useRef, useState } from "react";
import { Search, TriangleAlert } from "lucide-react";
import { DialogRahmen } from "@/components/unterlagen/dialog-rahmen";
import {
  AUSGABE_GRENZEN,
  EINSTELLUNG_OHNE_NUMMER,
  MELDUNGEN_AUSGABEN,
  VORSCHLAG_STUFE_LABELS,
  type AusgabeKurz,
  type EinstellungsAnzeige,
  type ZuordnungsVorschlag,
} from "@/lib/ausgaben";
import { formatDatumDE } from "@/lib/format";
// Nur Typen: Der Dienst ist Server-Code (Prisma) – `import type` verschwindet beim Uebersetzen.
import type { EinstellungsAuswahl, EinstellungsVorschau } from "@/lib/offboarding-ausgaben";

// =============================================
// Body der Aktionen (POST /api/offboarding/[id]/einstellung)
// =============================================

/** Die vier Aktionen am Austritt — dieselbe Form wie `einstellungAktionSchema` (src/lib/validations/ausgaben.ts). */
export type EinstellungAktionBody =
  | { aktion: "zuordnen"; onboardingId: string; weitereBeschaeftigung?: boolean; uebernehmen?: string[] }
  | { aktion: "loesen" }
  | { aktion: "aktualisieren"; ausgabeIds?: string[]; weitereBeschaeftigung?: boolean }
  | { aktion: "ohne-vermerk"; checklistItemIds: string[] };

/**
 * „Zuordnen“: die gewaehlte Einstellung und der Merker, wie er im Dialog steht.
 * Ohne `uebernehmen` – der Server rechnet den Vorschlag unter seinen Sperren
 * neu (was sich seit der Vorschau geaendert hat, faellt heraus und wird
 * gemeldet). Die Hinweise uebernimmt HR danach im Reiter einzeln.
 */
export function zuordnenBody(onboardingId: string, weitereBeschaeftigung: boolean): EinstellungAktionBody {
  return { aktion: "zuordnen", onboardingId, weitereBeschaeftigung };
}

// =============================================
// Texte
// =============================================

/** Texte nur des Dialogs (Fehler und Leerzustaende stehen in `MELDUNGEN_AUSGABEN`). */
export const ZUORDNEN_TEXTE = {
  titel: "Einstellung zuordnen",
  knopf: "Einstellung zuordnen …",
  zuordnen: "Zuordnen",
  erklaerung:
    "Was bei der Einstellung ausgegeben wurde, schlägt der Austritt danach als Rückgabe bzw. Sperraufgabe der ausgebenden Stelle vor. Zugeordnet wird nur, was hier bestätigt wird.",
  laedt: "Vorschläge werden geladen …",
  vorschlaege: "Vorschläge",
  treffer: "Suchtreffer",
  waehlen: "Einstellung wählen",
  sucheLabel: "Suche nach Vorgangsnummer oder Nachname",
  sucheLaeuft: "Suche läuft …",
  merker: "Person bleibt in einer anderen Beschäftigung",
  merkerHilfe:
    "Zentral ausgegebene Stücke (z. B. Dienst-E-Mail) stehen dann nur als Hinweis da, statt zurückgefordert zu werden.",
  keineWahl: "Bitte eine Einstellung wählen.",
  vorschauLaedt: "Vorschau wird geladen …",
  vorschau: "Vorschau",
  /** Kopf der Vorschau: was zugeordnet wuerde – Name und Vorgangsnummer der gewaehlten Einstellung. */
  vorschauFuer: (titel: string) => `Vorschau für ${titel}`,
  rueckgaben: (n: number) => `Rückgaben (${n})`,
  sperraufgaben: (n: number) => `Sperraufgaben (${n})`,
  hinweisZentral: (n: number) => `Nur Hinweis – zentral ausgegeben, die Person bleibt in einer anderen Beschäftigung (${n})`,
  hinweisAndere: (n: number) => `Nur Hinweis – ausgegeben von einer anderen Einrichtung (${n})`,
  hinweiseSpaeter: "Hinweise lassen sich nach dem Zuordnen im Reiter „Rückgaben“ einzeln übernehmen.",
  ohneName: "ohne Namen",
  vertragsbeginn: (datum: string) => `Vertragsbeginn ${datum}`,
  arbeitsort: (name: string) => `Arbeitsort ${name}`,
  ladeFehler: "Die Vorschläge konnten nicht geladen werden.",
  verbindung: "Verbindungsfehler. Bitte erneut versuchen.",
} as const;

// =============================================
// Laden (GET /api/offboarding/[id]/einstellung)
// =============================================

/** Was der Dialog abfragt: Suche, Vorschau einer Einstellung, Merker aus dem Dialog. */
export interface AuswahlAnfrage {
  q?: string;
  vorschau?: string;
  weitereBeschaeftigung?: boolean;
}

export type AuswahlErgebnis = { ok: true; daten: EinstellungsAuswahl } | { ok: false; meldung: string };

/** Die Adresse der Abfrage (`q`, `vorschau`, `weitereBeschaeftigung` nur, wenn gesetzt). */
export function auswahlUrl(offboardingId: string, anfrage: AuswahlAnfrage): string {
  const p = new URLSearchParams();
  const q = anfrage.q?.trim();
  if (q) p.set("q", q);
  if (anfrage.vorschau) p.set("vorschau", anfrage.vorschau);
  if (anfrage.weitereBeschaeftigung !== undefined) p.set("weitereBeschaeftigung", String(anfrage.weitereBeschaeftigung));
  const suche = p.toString();
  return `/api/offboarding/${encodeURIComponent(offboardingId)}/einstellung${suche ? `?${suche}` : ""}`;
}

/** GET – die Antwort 1:1 (`data`), ein Fehler mit dem Text des Servers. */
export async function einstellungAuswahlLaden(offboardingId: string, anfrage: AuswahlAnfrage): Promise<AuswahlErgebnis> {
  let res: Response;
  try {
    res = await fetch(auswahlUrl(offboardingId, anfrage), { cache: "no-store" });
  } catch {
    return { ok: false, meldung: ZUORDNEN_TEXTE.verbindung };
  }
  const body = (await res.json().catch(() => null)) as { data?: EinstellungsAuswahl; error?: unknown } | null;
  if (res.ok && body?.data) return { ok: true, daten: body.data };
  const text = typeof body?.error === "string" && body.error.trim() ? body.error : ZUORDNEN_TEXTE.ladeFehler;
  return { ok: false, meldung: text };
}

// =============================================
// Reine Hilfen der Anzeige
// =============================================

/** Was unter der Suche steht: nichts (leer), „Mindestens 3 Zeichen“ (zu kurz) oder die Treffer. */
export function sucheStand(suche: string): "LEER" | "ZU_KURZ" | "SUCHEN" {
  const t = suche.trim();
  if (t === "") return "LEER";
  return t.length < AUSGABE_GRENZEN.sucheMinZeichen ? "ZU_KURZ" : "SUCHEN";
}

/** „Anna Beispiel · 2027-GYM-007“ (ohne Nummer „ohne Vorgangsnummer“). */
export function einstellungTitel(e: Pick<EinstellungsAnzeige, "name" | "displayId">): string {
  return `${e.name.trim() || ZUORDNEN_TEXTE.ohneName} · ${e.displayId?.trim() || EINSTELLUNG_OHNE_NUMMER}`;
}

/** „FES Grundschule · Arbeitsort OGS Nord · Vertragsbeginn 01.02.2027“ – Teile ohne Wert fallen weg. */
export function einstellungZeile(e: EinstellungsAnzeige, einrichtungen: Readonly<Record<string, string>>): string {
  const ort = e.arbeitsortId && e.arbeitsortId !== e.organizationId ? einrichtungen[e.arbeitsortId] : null;
  return [
    einrichtungen[e.organizationId] ?? "",
    ort ? ZUORDNEN_TEXTE.arbeitsort(ort) : "",
    e.vertragsbeginn ? ZUORDNEN_TEXTE.vertragsbeginn(formatDatumDE(e.vertragsbeginn)) : "",
  ]
    .filter((t) => t.trim() !== "")
    .join(" · ");
}

/** „Starker Vorschlag: Gleiche E-Mail-Adresse · Gleiche Einrichtung“. */
export function begruendungText(v: Pick<ZuordnungsVorschlag, "stufe" | "gruende">): string {
  const gruende = v.gruende.map((g) => g.text).join(" · ");
  return gruende ? `${VORSCHLAG_STUFE_LABELS[v.stufe]}: ${gruende}` : VORSCHLAG_STUFE_LABELS[v.stufe];
}

/**
 * Ein Stueck der Vorschau bzw. eines Hinweises: „Dienst-iPad (Lernmittel) ·
 * FES-IPAD-0412 – übergeben 28.01.2027 · IT-Abteilung“; mit `mitEinrichtung`
 * dahinter die Einrichtung, der das Stueck gehoert (Hinweis „andere
 * Einrichtung“).
 */
export function stueckText(a: AusgabeKurz, mitEinrichtung = false): string {
  const kopf = [a.bezeichnung, a.kennung ?? ""].filter((t) => t.trim() !== "").join(" · ");
  const rest = [a.text, mitEinrichtung ? (a.einrichtung ?? "") : ""].filter((t) => t.trim() !== "").join(" · ");
  return rest ? `${kopf} – ${rest}` : kopf;
}

/**
 * Steht die gewaehlte Einstellung noch auf dem Bildschirm – unter den
 * Vorschlaegen oder den aktuellen Suchtreffern? Aendert oder leert HR die
 * Suche, verschwindet ein gewaehlter Treffer; dann gilt die Wahl nicht mehr
 * (sonst ordnete „Zuordnen“ eine Einstellung zu, die nirgends mehr steht –
 * Feinplan A4, Abschnitt 5: „Zuordnung mit falscher Person“).
 */
export function wahlSichtbar(
  gewaehlt: string | null,
  vorschlaege: ReadonlyArray<Pick<EinstellungsAnzeige, "onboardingId">>,
  treffer: ReadonlyArray<Pick<EinstellungsAnzeige, "onboardingId">> | null,
): boolean {
  if (!gewaehlt) return false;
  return [...vorschlaege, ...(treffer ?? [])].some((e) => e.onboardingId === gewaehlt);
}

/** Grund am Knopf „Zuordnen“: keine Wahl, Vorschau laedt bzw. scheiterte, Sperrgrund des Servers; sonst null. */
export function zuordnenGrund(opts: {
  gewaehlt: string | null;
  vorschauLaedt: boolean;
  vorschauFehler: string | null;
  vorschau: Pick<EinstellungsVorschau, "sperrGrund"> | null;
}): string | null {
  if (!opts.gewaehlt) return ZUORDNEN_TEXTE.keineWahl;
  if (opts.vorschauLaedt) return ZUORDNEN_TEXTE.vorschauLaedt;
  if (opts.vorschauFehler) return opts.vorschauFehler;
  return opts.vorschau?.sperrGrund ?? null;
}

// =============================================
// Hinweis fuer Abteilungskarte und Stepper (G12)
// =============================================

/**
 * „Einstellung zuordnen, bevor Sie die Abteilungen informieren“ samt Knopf –
 * solange keine Einstellung zugeordnet ist, der Austritt laeuft und ein
 * starker oder mittlerer Vorschlag vorliegt (`rueckgaben.zuordnungEmpfohlen`).
 * Sonst kaeme die Zuordnung zu spaet fuer den Arbeitsort (G12), und Ausgaben
 * blieben unbemerkt.
 */
export function ZuordnungEmpfohlenHinweis({ onZuordnen, gesperrt = false }: { onZuordnen?: () => void; gesperrt?: boolean }) {
  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-credo-gelb/50 bg-credo-gelb/10 px-3 py-2 text-xs text-foreground"
      data-hinweis="zuordnung-empfohlen"
    >
      <span className="flex min-w-0 flex-1 items-start gap-2">
        <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="min-w-0 break-words font-medium">{MELDUNGEN_AUSGABEN.ZUORDNUNG_EMPFOHLEN}</span>
      </span>
      {onZuordnen && (
        <button
          type="button"
          onClick={onZuordnen}
          disabled={gesperrt}
          className="shrink-0 rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium text-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
        >
          {ZUORDNEN_TEXTE.knopf}
        </button>
      )}
    </div>
  );
}

// =============================================
// Dialog
// =============================================

export interface EinstellungZuordnenDialogProps {
  offboardingId: string;
  /** Kleine Zeile unter dem Titel, z. B. „OFF-2027-GYM-014 · Max Mustermann“. */
  untertitel?: string | null;
  /** Laeuft das Zuordnen? Dann gesperrt, Escape wirkungslos. */
  sendet: boolean;
  /** Fehler des Servers beim Zuordnen – der Dialog bleibt offen. */
  fehler: string | null;
  /** Id eines Elements fuer den Fokus, wenn der Ausloeser beim Schliessen fehlt. */
  fokusZiel?: string;
  onAbbrechen: () => void;
  onZuordnen: (body: EinstellungAktionBody) => void;
  /** Lesen; Standard: GET /api/offboarding/[id]/einstellung. Fuer Tests ersetzbar. */
  laden?: (anfrage: AuswahlAnfrage) => Promise<AuswahlErgebnis>;
  /** Wartezeit der Suche nach dem letzten Tastendruck (ms); Tests setzen 0. */
  sucheVerzoegerung?: number;
}

/** Eine waehlbare Einstellung (Vorschlag mit, Suchtreffer ohne Begruendung). */
function Kandidat({
  name,
  eintrag,
  begruendung,
  einrichtungen,
  gewaehlt,
  sendet,
  onWaehlen,
}: {
  name: string;
  eintrag: EinstellungsAnzeige;
  begruendung: string | null;
  einrichtungen: Readonly<Record<string, string>>;
  gewaehlt: boolean;
  sendet: boolean;
  onWaehlen: () => void;
}) {
  const zeile = einstellungZeile(eintrag, einrichtungen);
  return (
    <li>
      <label
        className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 ${
          gewaehlt ? "border-primary bg-muted" : "border-border bg-card hover:bg-muted"
        }`}
        data-kandidat={eintrag.onboardingId}
      >
        <input
          type="radio"
          name={name}
          value={eintrag.onboardingId}
          checked={gewaehlt}
          disabled={sendet}
          onChange={onWaehlen}
          className="mt-0.5 h-4 w-4 shrink-0"
        />
        <span className="min-w-0 break-words">
          <span className="block font-medium text-foreground">{einstellungTitel(eintrag)}</span>
          {zeile && <span className="block text-xs text-muted-foreground">{zeile}</span>}
          {begruendung && (
            <span className="block text-xs text-foreground" data-begruendung>
              {begruendung}
            </span>
          )}
        </span>
      </label>
    </li>
  );
}

/** Eine Liste der Vorschau mit Ueberschrift; ohne Stueck nichts. */
function StueckListe({
  titel,
  stuecke,
  name,
  mitEinrichtung = false,
}: {
  titel: string;
  stuecke: ReadonlyArray<AusgabeKurz>;
  name: string;
  mitEinrichtung?: boolean;
}) {
  if (stuecke.length === 0) return null;
  return (
    <div data-vorschau-liste={name}>
      <p className="text-xs font-semibold text-muted-foreground">{titel}</p>
      <ul className="mt-0.5 list-disc space-y-0.5 pl-5 text-xs text-foreground">
        {stuecke.map((a) => (
          <li key={a.ausgabeId} className="break-words">
            {stueckText(a, mitEinrichtung)}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Vorschau({ vorschau }: { vorschau: EinstellungsVorschau }) {
  const r = vorschau.rueckgaben;
  const vorschlagbar = r.rueckgaben.length + r.sperraufgaben.length > 0;
  const hinweise = r.hinweisZentral.length + r.hinweisAndereEinrichtung.length > 0;
  return (
    <div className="space-y-2 rounded-lg border border-border bg-muted px-3 py-2" data-vorschau={vorschau.einstellung.onboardingId}>
      <p className="break-words text-xs font-semibold text-foreground" data-vorschau-titel>
        {ZUORDNEN_TEXTE.vorschauFuer(einstellungTitel(vorschau.einstellung))}
      </p>
      {vorschau.arbeitsort.text && (
        <p className="text-xs text-foreground" data-vorschau-arbeitsort={vorschau.arbeitsort.grund}>
          {vorschau.arbeitsort.text}
        </p>
      )}
      {!vorschlagbar && (
        <p className="text-xs text-foreground" data-vorschau-lage={vorschau.lage}>
          {vorschau.text}
          {vorschau.zusatz ? ` ${vorschau.zusatz}` : ""}
        </p>
      )}
      <StueckListe name="rueckgaben" titel={ZUORDNEN_TEXTE.rueckgaben(r.rueckgaben.length)} stuecke={r.rueckgaben} />
      <StueckListe name="sperraufgaben" titel={ZUORDNEN_TEXTE.sperraufgaben(r.sperraufgaben.length)} stuecke={r.sperraufgaben} />
      <StueckListe name="zentral" titel={ZUORDNEN_TEXTE.hinweisZentral(r.hinweisZentral.length)} stuecke={r.hinweisZentral} />
      <StueckListe
        name="andere-einrichtung"
        titel={ZUORDNEN_TEXTE.hinweisAndere(r.hinweisAndereEinrichtung.length)}
        stuecke={r.hinweisAndereEinrichtung}
        mitEinrichtung
      />
      {hinweise && <p className="text-xs text-muted-foreground">{ZUORDNEN_TEXTE.hinweiseSpaeter}</p>}
      {r.schonImAustritt.map((s) => (
        <p key={s.offboardingId} className="text-xs text-foreground" data-schon-im-austritt>
          {s.text}
        </p>
      ))}
    </div>
  );
}

export function EinstellungZuordnenDialog({
  offboardingId,
  untertitel,
  sendet,
  fehler,
  fokusZiel,
  onAbbrechen,
  onZuordnen,
  laden,
  sucheVerzoegerung = 300,
}: EinstellungZuordnenDialogProps) {
  const id = useId();
  const sucheId = `${id}-suche`;
  const merkerId = `${id}-merker`;
  // Die Ladefunktion beim Oeffnen genuegt (eine neue Pfeilfunktion je Rendern loeste sonst neue Abfragen aus).
  const ladenRef = useRef(laden ?? ((a: AuswahlAnfrage) => einstellungAuswahlLaden(offboardingId, a)));

  const [basis, setBasis] = useState<EinstellungsAuswahl | null>(null);
  const [ladeFehler, setLadeFehler] = useState<string | null>(null);
  const [merker, setMerker] = useState(false);

  const [suche, setSuche] = useState("");
  const [treffer, setTreffer] = useState<EinstellungsAnzeige[] | null>(null);
  const [trefferOrte, setTrefferOrte] = useState<Record<string, string>>({});
  const [sucheFehler, setSucheFehler] = useState<string | null>(null);
  const [sucht, setSucht] = useState(false);

  const [gewaehlt, setGewaehlt] = useState<string | null>(null);
  const [vorschau, setVorschau] = useState<EinstellungsVorschau | null>(null);
  const [vorschauLaedt, setVorschauLaedt] = useState(false);
  const [vorschauFehler, setVorschauFehler] = useState<string | null>(null);

  // Erst die Vorschlaege (ohne Suche); der Merker startet mit dem gespeicherten bzw. vorbelegten Wert.
  useEffect(() => {
    let aktiv = true;
    void ladenRef.current({}).then((e) => {
      if (!aktiv) return;
      if (e.ok) {
        setBasis(e.daten);
        setMerker(e.daten.weitereBeschaeftigung);
      } else {
        setLadeFehler(e.meldung);
      }
    });
    return () => {
      aktiv = false;
    };
  }, []);

  // Suche: nach einer kurzen Pause, nur ab 3 Zeichen; eine spaetere Antwort ersetzt keine neuere.
  const sucheNr = useRef(0);
  useEffect(() => {
    const nr = ++sucheNr.current;
    setSucheFehler(null);
    if (sucheStand(suche) !== "SUCHEN") {
      setTreffer(null);
      setSucht(false);
      return;
    }
    setSucht(true);
    const timer = setTimeout(() => {
      void ladenRef.current({ q: suche.trim() }).then((e) => {
        if (nr !== sucheNr.current) return;
        setSucht(false);
        if (e.ok) {
          setTreffer(e.daten.treffer);
          setTrefferOrte(e.daten.einrichtungen);
        } else {
          setTreffer([]);
          setSucheFehler(e.meldung);
        }
      });
    }, sucheVerzoegerung);
    return () => clearTimeout(timer);
  }, [suche, sucheVerzoegerung]);

  // Vorschau der gewaehlten Einstellung – mit dem Merker, wie er im Dialog steht.
  const vorschauNr = useRef(0);
  useEffect(() => {
    const nr = ++vorschauNr.current;
    setVorschauFehler(null);
    if (!gewaehlt) {
      setVorschau(null);
      setVorschauLaedt(false);
      return;
    }
    setVorschauLaedt(true);
    void ladenRef.current({ vorschau: gewaehlt, weitereBeschaeftigung: merker }).then((e) => {
      if (nr !== vorschauNr.current) return;
      setVorschauLaedt(false);
      if (e.ok && e.daten.vorschau) {
        setVorschau(e.daten.vorschau);
      } else {
        setVorschau(null);
        setVorschauFehler(e.ok ? ZUORDNEN_TEXTE.ladeFehler : e.meldung);
      }
    });
  }, [gewaehlt, merker]);

  // Verschwindet die gewaehlte Einstellung aus der Liste (Suche geaendert oder
  // geleert), gilt die Wahl nicht mehr – Vorschau und „Zuordnen“ fallen mit ihr.
  useEffect(() => {
    if (gewaehlt && basis && !wahlSichtbar(gewaehlt, basis.vorschlaege, treffer)) setGewaehlt(null);
  }, [gewaehlt, basis, treffer]);

  const vorschlaege = basis?.vorschlaege ?? [];
  const vorschlagsIds = new Set(vorschlaege.map((v) => v.onboardingId));
  const weitereTreffer = (treffer ?? []).filter((t) => !vorschlagsIds.has(t.onboardingId));
  // Nur eine Wahl, die noch auf dem Bildschirm steht, zaehlt (`wahlSichtbar`) –
  // schon im selben Rendern, bevor der Effekt unten sie zuruecksetzt.
  const auswahl = wahlSichtbar(gewaehlt, vorschlaege, treffer) ? gewaehlt : null;
  const einrichtungen = { ...(basis?.einrichtungen ?? {}), ...trefferOrte };
  const stand = sucheStand(suche);
  const zuordenbar = basis?.zuordenbar === true;
  const grund = !basis
    ? (ladeFehler ?? ZUORDNEN_TEXTE.laedt)
    : !zuordenbar
      ? basis.zugeordnet
        ? MELDUNGEN_AUSGABEN.BEREITS_ZUGEORDNET
        : MELDUNGEN_AUSGABEN.VORGANG_ABGESCHLOSSEN
      : zuordnenGrund({ gewaehlt: auswahl, vorschauLaedt, vorschauFehler, vorschau });

  return (
    <DialogRahmen
      name="einstellung-zuordnen"
      titel={ZUORDNEN_TEXTE.titel}
      untertitel={untertitel}
      sendet={sendet}
      fehler={fehler}
      fokusZiel={fokusZiel}
      onAbbrechen={onAbbrechen}
      bestaetigen={{
        text: ZUORDNEN_TEXTE.zuordnen,
        grund,
        farbe: "gruen",
        onClick: () => {
          if (auswahl && zuordenbar) onZuordnen(zuordnenBody(auswahl, merker));
        },
      }}
    >
      <p className="text-muted-foreground">{ZUORDNEN_TEXTE.erklaerung}</p>

      {!basis && !ladeFehler && (
        <p role="status" className="text-muted-foreground">
          {ZUORDNEN_TEXTE.laedt}
        </p>
      )}
      {ladeFehler && (
        <p role="alert" className="font-medium text-destructive">
          {ladeFehler}
        </p>
      )}

      {basis && zuordenbar && (
        <>
          <div>
            <label htmlFor={sucheId} className="mb-1 block text-sm font-medium text-foreground">
              {ZUORDNEN_TEXTE.sucheLabel}
            </label>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <input
                id={sucheId}
                type="search"
                autoComplete="off"
                value={suche}
                maxLength={AUSGABE_GRENZEN.sucheMaxZeichen}
                disabled={sendet}
                aria-describedby={`${sucheId}-stand`}
                onChange={(e) => setSuche(e.target.value)}
                className="w-full rounded-lg border border-input bg-background py-2 pl-8 pr-3 text-sm text-foreground outline-none focus:border-ring focus:ring-1 focus:ring-ring disabled:opacity-60"
              />
            </div>
            <p id={`${sucheId}-stand`} className="mt-1 text-xs text-muted-foreground" aria-live="polite" data-suche-stand>
              {stand === "ZU_KURZ"
                ? MELDUNGEN_AUSGABEN.SUCHE_ZU_KURZ
                : stand === "SUCHEN" && sucht
                  ? ZUORDNEN_TEXTE.sucheLaeuft
                  : stand === "SUCHEN" && sucheFehler
                    ? sucheFehler
                    : stand === "SUCHEN" && treffer !== null && treffer.length === 0
                      ? MELDUNGEN_AUSGABEN.KEIN_TREFFER
                      : ""}
            </p>
          </div>

          <fieldset className="space-y-2">
            <legend className="mb-1 text-sm font-medium text-foreground">{ZUORDNEN_TEXTE.waehlen}</legend>
            <p className="text-xs font-semibold text-muted-foreground">{ZUORDNEN_TEXTE.vorschlaege}</p>
            {vorschlaege.length === 0 ? (
              <p className="text-xs text-muted-foreground" data-leer="vorschlaege">
                {MELDUNGEN_AUSGABEN.KEIN_VORSCHLAG}
              </p>
            ) : (
              <ul className="space-y-1.5" data-liste="vorschlaege">
                {vorschlaege.map((v) => (
                  <Kandidat
                    key={v.onboardingId}
                    name={`${id}-einstellung`}
                    eintrag={v}
                    begruendung={begruendungText(v)}
                    einrichtungen={einrichtungen}
                    gewaehlt={gewaehlt === v.onboardingId}
                    sendet={sendet}
                    onWaehlen={() => setGewaehlt(v.onboardingId)}
                  />
                ))}
              </ul>
            )}
            {weitereTreffer.length > 0 && (
              <>
                <p className="pt-1 text-xs font-semibold text-muted-foreground">{ZUORDNEN_TEXTE.treffer}</p>
                <ul className="space-y-1.5" data-liste="treffer">
                  {weitereTreffer.map((t) => (
                    <Kandidat
                      key={t.onboardingId}
                      name={`${id}-einstellung`}
                      eintrag={t}
                      begruendung={null}
                      einrichtungen={einrichtungen}
                      gewaehlt={gewaehlt === t.onboardingId}
                      sendet={sendet}
                      onWaehlen={() => setGewaehlt(t.onboardingId)}
                    />
                  ))}
                </ul>
              </>
            )}
          </fieldset>

          <div>
            <label htmlFor={merkerId} className="flex items-start gap-2 text-sm text-foreground">
              <input
                id={merkerId}
                type="checkbox"
                checked={merker}
                disabled={sendet}
                aria-describedby={`${merkerId}-hilfe`}
                onChange={(e) => setMerker(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0"
              />
              <span>{ZUORDNEN_TEXTE.merker}</span>
            </label>
            <p id={`${merkerId}-hilfe`} className="mt-1 pl-6 text-xs text-muted-foreground">
              {ZUORDNEN_TEXTE.merkerHilfe}
            </p>
          </div>

          <div aria-live="polite">
            {auswahl && vorschauLaedt && <p className="text-xs text-muted-foreground">{ZUORDNEN_TEXTE.vorschauLaedt}</p>}
            {auswahl && !vorschauLaedt && vorschauFehler && (
              <p className="text-xs font-medium text-destructive">{vorschauFehler}</p>
            )}
            {auswahl && !vorschauLaedt && vorschau && <Vorschau vorschau={vorschau} />}
          </div>
        </>
      )}
    </DialogRahmen>
  );
}
