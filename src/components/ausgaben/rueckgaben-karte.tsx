"use client";

/**
 * Reiter „Rückgaben“ im Offboarding (Ausstattung & Zugaenge Stufe 2 –
 * Feinplan A4, S32, G11 bis G19, E-A31 bis E-A36, Mockup 6.8)
 *
 *   RueckgabenKarte  die Karte des Reiters fuer HR (Feld `rueckgaben` der
 *                    Detailroute, nur HR_EDIT_ROLES):
 *                    - Kopfzeile nach `lage` (sechs Lagen, E-A36: „keine
 *                      Einstellung“, „vor der Einführung“, „nichts
 *                      ausgegeben“ sind drei unterscheidbare Leeranzeigen
 *                      „laut Portal“), darunter immer der Satz „Das Portal ist
 *                      eine Gedächtnisstütze …“;
 *                    - die zugeordnete Einstellung mit „Einstellung zuordnen …“
 *                      bzw. „Lösen …“ (Rueckfrage `LOESEN_RUECKFRAGE`) und
 *                      „Rückgaben aktualisieren“, dazu der Merker „Person
 *                      bleibt in einer anderen Beschäftigung“ zum Aendern –
 *                      mit Rueckfrage, die nennt, was dabei uebernommen wird
 *                      (`merkerWechsel` des Servers, Review A4c);
 *                    - was laut Einstellung noch nicht uebernommen ist, die
 *                      Hinweise (zentral, andere Einrichtung, ohne
 *                      Uebergabevermerk) mit „Übernehmen“ bzw. „Als ausgegeben
 *                      übernehmen“, Stuecke in einem anderen Austritt
 *                      (`SCHON_IM_AUSTRITT`, ohne Kennung);
 *                    - die Tabelle mit Stelle und Uebergabe, Zustand waehlen,
 *                      Kennung korrigieren, Loeschen nur von HR erfasster
 *                      Zeilen (eine vorgeschlagene Zeile „entfällt“ statt
 *                      geloescht zu werden, G15);
 *                    - die Zeilen „Sperraufgaben …“, „Rückgabeprotokoll: fehlt
 *                      / hochgeladen am …“ (G19).
 *   RueckgabenListe  die bisherige Liste nur lesend – ohne `rueckgaben`
 *                    (Rollen ausserhalb von HR_EDIT_ROLES).
 *   AusgabeAufgabeZusatz  im Reiter Checkliste an einer Ruecknahmeaufgabe:
 *                    der Zustand als Text und der Verweis auf diesen Reiter.
 *
 * Die Karte rechnet NICHTS selbst: Lage, Texte, Zeilen, erlaubte Aktionen,
 * Sperrgruende und Rueckfragen kommen fertig vom Server
 * (`rueckgabenUebersichtLaden`, src/lib/offboarding-ausgaben.ts; die Regeln in
 * src/lib/ausgaben.ts). Die Dialoge rufen keine Schnittstelle: Sie bauen den
 * Body (`…Body`, rein und exportiert – dieselbe Form wie die Schemas der
 * Routen) und melden ihn der Karte, die ueber `onAufruf` sendet (die Seite
 * laedt danach neu) und einen Fehler des Servers im Dialog zeigt. Den Dialog
 * „Einstellung zuordnen …“ haelt die Seite (er oeffnet auch aus Uebersicht
 * und Abteilungskarte): Die Karte ruft nur `onZuordnen`.
 *
 * Rueckfragen ueber `DialogRahmen` (src/components/unterlagen/dialog-rahmen.tsx),
 * Portal-Texte ohne Anrede. Nur Farb-Tokens und lucide-react (neue Datei,
 * Stand 0 in der Sperrklinke).
 */

import { useId, useRef, useState, type ComponentType, type ReactNode } from "react";
import { Archive, History, Link2Off, PackageCheck, PackageX, Plus, RefreshCw, TriangleAlert, X } from "lucide-react";
import { DialogRahmen } from "@/components/unterlagen/dialog-rahmen";
import { ProtokollZeile } from "@/components/ausgaben/ausgaben-zeile";
import { kennungGrund } from "@/components/ausgaben/ausgaben-dialoge";
import {
  ZUORDNEN_TEXTE,
  einstellungTitel,
  einstellungZeile,
  stueckText,
  type EinstellungAktionBody,
} from "@/components/ausgaben/einstellung-zuordnen-dialog";
import {
  AUSGABE_GRENZEN,
  AUSGABE_ZUSTAND_LABELS,
  RUECKGABE_OFFEN_LABEL,
  rueckgabeZustand,
  type AusgabeKurz,
  type RueckgabeLage,
  type RueckgabeZeile,
  type RueckgabeZustand,
} from "@/lib/ausgaben";
import { RETURN_CATEGORY_LABELS, RUECKGABE_KATEGORIEN, type RueckgabeKategorie } from "@/lib/constants";
import { formatDatumDE } from "@/lib/format";
// Nur Typen: Der Dienst ist Server-Code (Prisma) – `import type` verschwindet beim Uebersetzen.
import type { RueckgabenUebersicht } from "@/lib/offboarding-ausgaben";

// =============================================
// Texte
// =============================================

/** Texte der Karte und ihrer Dialoge (Fehler und Saetze des Servers stehen in `MELDUNGEN_AUSGABEN`). */
export const RUECKGABEN_KARTE_TEXTE = {
  titel: "Rückgaben",
  zaehler: (erledigt: number, gesamt: number): string =>
    gesamt === 0
      ? "Noch keine Rückgaben erfasst"
      : `${erledigt} von ${gesamt} ${gesamt === 1 ? "Rückgabe" : "Rückgaben"} erledigt`,
  zuordnen: ZUORDNEN_TEXTE.knopf,
  aktualisieren: "Rückgaben aktualisieren",
  hinzufuegen: "Gegenstand hinzufügen …",
  loesen: "Lösen …",
  einstellung: "Einstellung",
  arbeitsortAmAustritt: (name: string): string => `Arbeitsort am Austritt: ${name}`,
  merker: "Person bleibt in einer anderen Beschäftigung",
  merkerHilfe:
    "Zentral ausgegebene Stücke stehen dann nur als Hinweis da. Eine Änderung übernimmt wie „Rückgaben aktualisieren“, was laut Einstellung noch fehlt – vorher nennt eine Rückfrage, was das ist.",
  // Rueckfrage zum Merker (Review A4c): erst bestaetigen, dann speichern und uebernehmen.
  merkerTitel: (nach: boolean): string =>
    nach
      ? "„Person bleibt in einer anderen Beschäftigung“ setzen?"
      : "„Person bleibt in einer anderen Beschäftigung“ entfernen?",
  merkerSatz: (nach: boolean): string =>
    nach
      ? "Zentral ausgegebene Stücke stehen danach nur als Hinweis da. Schon angelegte Rücknahme- und Sperraufgaben bleiben bestehen."
      : "Zentral ausgegebene Stücke werden danach wie die übrigen zurückgefordert.",
  merkerUebernimmt: (n: number): string => `Dabei übernommen (${n})`,
  merkerUebernimmtHilfe: "Schon informierte Stellen sehen die neuen Aufgaben sofort auf ihrer Link-Seite.",
  merkerNichts: "Dabei wird nichts übernommen.",
  merkerSpeichern: "Speichern",
  merkerSpeichernUebernehmen: "Speichern und übernehmen",
  merkerWert: (ja: boolean): string => `Person bleibt in einer anderen Beschäftigung: ${ja ? "ja" : "nein"}`,
  nochNicht: (n: number): string => `Laut Einstellung, noch nicht übernommen (${n})`,
  nochNichtHilfe: "„Rückgaben aktualisieren“ legt die Rücknahme- bzw. Sperraufgaben der ausgebenden Stellen an.",
  hinweisZentral: ZUORDNEN_TEXTE.hinweisZentral,
  hinweisAndere: ZUORDNEN_TEXTE.hinweisAndere,
  ohneVermerk: (n: number): string => `Laut Portal bereitgestellt, ohne Übergabevermerk (${n})`,
  ohneVermerkHilfe:
    "„Als ausgegeben übernehmen“ legt eine Ausgabe ohne Kennung an (Datum: Tag der Erledigung) und schlägt sie hier als Rückgabe vor.",
  erledigtAm: (datum: string): string => `erledigt am ${datum}`,
  uebernehmen: "Übernehmen",
  alsAusgegeben: "Als ausgegeben übernehmen",
  leer: "Noch keine Rückgaben erfasst.",
  tabelle: "Rückgaben",
  spalteKategorie: "Kategorie",
  spalteGegenstand: "Gegenstand",
  spalteKennung: "Kennung",
  spalteZustand: "Zustand",
  spalteAktion: "Aktion",
  zustandsText: "Zustand",
  notiz: "Notiz",
  zustandKnopf: "Zustand…",
  kennungKnopf: "Kennung…",
  loeschenKnopf: "Löschen…",
  // Dialoge
  zustandTitel: "Zustand der Rückgabe",
  zustandLegende: "Zustand",
  zustandSpeichern: "Zustand speichern",
  keineAenderung: "Noch keine Änderung.",
  folgeHinweis: "Die Gebäudewirtschaft bekommt dazu die Aufgabe „Schließung prüfen“.",
  verbleibtHinweis:
    "Das Stück bleibt bei der Person; mit dem Abschluss des Austritts wird es für einen späteren Austritt freigegeben.",
  gleichlaufHinweis: "Die Rücknahmeaufgabe der Stelle und die Ausgabe der Einstellung bekommen denselben Stand.",
  kennungTitel: "Kennung korrigieren",
  kennungSpeichern: "Kennung speichern",
  kennungHilfe: (max: number): string => `Höchstens ${max} Zeichen. Leer = ohne Kennung.`,
  kennungZuLang: (max: number): string => `Die Kennung darf höchstens ${max} Zeichen lang sein.`,
  loeschenTitel: "Gegenstand löschen?",
  loeschenSatz: (name: string): string => `„${name}“ wird aus der Liste der Rückgaben gelöscht.`,
  loeschen: "Löschen",
  anlegenTitel: "Gegenstand hinzufügen",
  anlegen: "Hinzufügen",
  kategorie: "Kategorie",
  gegenstand: "Gegenstand",
  seriennummer: "Seriennummer",
  notizFeld: "Notiz",
  optional: "(optional)",
  gegenstandFehlt: "Bitte den Gegenstand angeben",
  loesenTitel: "Zuordnung lösen?",
  loesenBestaetigen: "Zuordnung lösen",
  loesenSatz: "Die Einstellung wird von diesem Austritt gelöst. Ihre Ausgaben bleiben unverändert und lassen sich später erneut zuordnen.",
  // Ergebnisse
  gespeichert: "Gespeichert.",
  geloescht: "Gegenstand gelöscht.",
  angelegt: "Gegenstand hinzugefügt.",
  verbindung: "Verbindungsfehler. Bitte erneut versuchen.",
  fehler: "Die Änderung konnte nicht gespeichert werden.",
  meldungSchliessen: "Meldung schließen",
  // Reiter Checkliste (AusgabeAufgabeZusatz)
  rueckgabeZustand: (wort: string): string => `Rückgabe: ${wort}`,
  zumReiter: "Zustand im Reiter „Rückgaben“ wählen",
} as const;

/** Id des Kartentitels (`tabIndex={-1}`) – Ersatzziel des Fokus nach Dialog und Direktaktion. */
export const RUECKGABEN_KARTE_TITEL_ID = "rueckgaben-karte-titel";

/** Die Wahl im Dialog „Zustand der Rückgabe“ – HR waehlt alle fuenf und „offen“ (1.2). */
export const ZUSTAND_WAHL: ReadonlyArray<{ wert: RueckgabeZustand | null; label: string }> = [
  { wert: null, label: "Offen" },
  { wert: "ZURUECK", label: "Zurückerhalten" },
  { wert: "BESCHAEDIGT", label: "Beschädigt zurückerhalten" },
  { wert: "FEHLT", label: "Fehlt" },
  { wert: "VERBLEIBT", label: "Verbleibt bei der Person" },
  { wert: "ENTFAELLT", label: "Entfällt" },
];

/** Hoechstlaenge der Seriennummer einer von HR erfassten Zeile (`rueckgabeAendernSchema`). */
export const SERIENNUMMER_MAX = 100;

// =============================================
// Bodys (dieselbe Form wie die Schemas der Routen)
// =============================================

/** PATCH /api/offboarding/[id]/return-items (`rueckgabeAendernSchema`). */
export interface RueckgabeAendernBody {
  itemId: string;
  zustand?: RueckgabeZustand | null;
  serialNumber?: string | null;
}

/** POST /api/offboarding/[id]/return-items (`rueckgabeAnlegenSchema`). */
export interface RueckgabeAnlegenBody {
  category: RueckgabeKategorie;
  itemName: string;
  serialNumber: string | null;
  notes: string | null;
}

/** Was die Karte ausfuehren laesst – die Seite sendet und laedt danach neu. */
export type RueckgabenAufruf =
  | { art: "einstellung"; body: EinstellungAktionBody }
  | { art: "aendern"; body: RueckgabeAendernBody }
  | { art: "loeschen"; itemId: string }
  | { art: "anlegen"; body: RueckgabeAnlegenBody };

/** Der Zustandswechsel einer Zeile; `null`, solange nichts geaendert ist. */
export function zustandBody(
  zeile: Pick<RueckgabeZeile, "id" | "zustand">,
  wahl: RueckgabeZustand | null,
): RueckgabeAendernBody | null {
  return wahl === zeile.zustand ? null : { itemId: zeile.id, zustand: wahl };
}

/** \r\n und \r werden \n, aussen getrimmt – wie der Server. */
function normalisiert(text: string): string {
  return text.replace(/\r\n?/g, "\n").trim();
}

/** Die korrigierte Kennung bzw. Seriennummer (leer = ohne); `null`, solange nichts geaendert ist. */
export function kennungBody(
  zeile: Pick<RueckgabeZeile, "id" | "serialNumber">,
  wert: string,
): RueckgabeAendernBody | null {
  const neu = normalisiert(wert) || null;
  return neu === (zeile.serialNumber ?? null) ? null : { itemId: zeile.id, serialNumber: neu };
}

/**
 * Warum die Kennung nicht hinausgeht: An einer Zeile aus der Einstellung gilt
 * das Kennungsschema des Vermerks (≤ 60, einzeilig, ohne spitze Klammern –
 * G15), an einer von HR erfassten Zeile die 100 Zeichen der Seriennummer;
 * dann „noch keine Änderung“.
 */
export function kennungGrundZeile(
  zeile: Pick<RueckgabeZeile, "id" | "serialNumber" | "vorgeschlagen">,
  wert: string,
): string | null {
  const grund = zeile.vorgeschlagen
    ? kennungGrund(wert)
    : normalisiert(wert).length > SERIENNUMMER_MAX
      ? RUECKGABEN_KARTE_TEXTE.kennungZuLang(SERIENNUMMER_MAX)
      : null;
  return grund ?? (kennungBody(zeile, wert) ? null : RUECKGABEN_KARTE_TEXTE.keineAenderung);
}

/** Formular „Gegenstand hinzufügen“. */
export interface AnlegenFormular {
  category: RueckgabeKategorie;
  itemName: string;
  serialNumber: string;
  notes: string;
}

export function anlegenStart(): AnlegenFormular {
  return { category: "IT_HARDWARE", itemName: "", serialNumber: "", notes: "" };
}

export function anlegenGrund(f: AnlegenFormular): string | null {
  return f.itemName.trim() ? null : RUECKGABEN_KARTE_TEXTE.gegenstandFehlt;
}

export function anlegenBody(f: AnlegenFormular): RueckgabeAnlegenBody {
  return {
    category: f.category,
    itemName: f.itemName.trim(),
    serialNumber: f.serialNumber.trim() || null,
    notes: f.notes.trim() || null,
  };
}

// =============================================
// Aufrufe
// =============================================

/** Ausgang eines Aufrufs: `meldung` ist der Text des Servers (Erfolg oder Fehler). */
export interface RueckgabenAusgang {
  ok: boolean;
  /** HTTP-Status; `null` = keine Verbindung (dann nicht neu laden). */
  status: number | null;
  meldung: string;
}

async function senden(url: string, init: RequestInit, erfolg: string): Promise<RueckgabenAusgang> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    return { ok: false, status: null, meldung: RUECKGABEN_KARTE_TEXTE.verbindung };
  }
  const daten = (await res.json().catch(() => null)) as { meldung?: unknown; error?: unknown } | null;
  const text = (wert: unknown) => (typeof wert === "string" && wert.trim() ? wert : null);
  if (res.ok) return { ok: true, status: res.status, meldung: text(daten?.meldung) ?? erfolg };
  return { ok: false, status: res.status, meldung: text(daten?.error) ?? RUECKGABEN_KARTE_TEXTE.fehler };
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

/** POST /api/offboarding/[id]/einstellung – zuordnen, lösen, aktualisieren, ohne Vermerk. */
export function einstellungAktionSenden(offboardingId: string, body: EinstellungAktionBody): Promise<RueckgabenAusgang> {
  return senden(
    `/api/offboarding/${encodeURIComponent(offboardingId)}/einstellung`,
    json("POST", body),
    RUECKGABEN_KARTE_TEXTE.gespeichert,
  );
}

/** Ein Aufruf der Karte an die passende Route. */
export function rueckgabenAufrufSenden(offboardingId: string, aufruf: RueckgabenAufruf): Promise<RueckgabenAusgang> {
  const basis = `/api/offboarding/${encodeURIComponent(offboardingId)}/return-items`;
  switch (aufruf.art) {
    case "einstellung":
      return einstellungAktionSenden(offboardingId, aufruf.body);
    case "aendern":
      return senden(basis, json("PATCH", aufruf.body), RUECKGABEN_KARTE_TEXTE.gespeichert);
    case "loeschen":
      return senden(`${basis}?itemId=${encodeURIComponent(aufruf.itemId)}`, { method: "DELETE" }, RUECKGABEN_KARTE_TEXTE.geloescht);
    case "anlegen":
      return senden(basis, json("POST", aufruf.body), RUECKGABEN_KARTE_TEXTE.angelegt);
    default: {
      const unbekannt: never = aufruf;
      void unbekannt;
      return Promise.resolve({ ok: false, status: null, meldung: RUECKGABEN_KARTE_TEXTE.fehler });
    }
  }
}

// =============================================
// Kleine Bausteine
// =============================================

const KNOPF =
  "inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium text-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50";
const KNOPF_HAUPT =
  "inline-flex items-center gap-1.5 rounded-lg bg-credo-gruen px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-credo-gruen/90 disabled:cursor-not-allowed disabled:opacity-50";
const KNOPF_KRITISCH =
  "rounded-md border border-credo-rot/40 bg-card px-2 py-0.5 text-xs text-credo-rot hover:bg-credo-rot/10 disabled:cursor-not-allowed disabled:opacity-50";
const KNOPF_ZEILE =
  "rounded-md border border-border bg-card px-2 py-0.5 text-xs text-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50";
const EINGABE =
  "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ring focus:ring-1 focus:ring-ring disabled:opacity-60";
const LABEL = "mb-1 block text-sm font-medium text-foreground";

/** Sichtbarer Text eines Knopfs, dahinter der Bezug nur fuer Screenreader („Zustand… Dienst-iPad“). */
function MitBezug({ text, bezug }: { text: string; bezug: string }) {
  return (
    <>
      {text}
      <span className="sr-only">{` ${bezug}`}</span>
    </>
  );
}

/** Symbol und Rahmen je Lage – drei Leeranzeigen „laut Portal“ unterscheidbar, nie nur an der Farbe (E-A36). */
const LAGE_ANZEIGE: Readonly<Record<RueckgabeLage, { Symbol: ComponentType<{ className?: string }>; rahmen: string }>> = {
  KEINE_EINSTELLUNG: { Symbol: Link2Off, rahmen: "border-border bg-muted" },
  AUSGABEN: { Symbol: PackageCheck, rahmen: "border-credo-blau/30 bg-credo-blau/5" },
  GELOESCHT: { Symbol: Archive, rahmen: "border-border bg-muted" },
  NICHTS_ERFASST: { Symbol: TriangleAlert, rahmen: "border-credo-gelb/50 bg-credo-gelb/10" },
  NICHTS_AUSGEGEBEN: { Symbol: PackageX, rahmen: "border-border bg-muted" },
  VOR_EINFUEHRUNG: { Symbol: History, rahmen: "border-credo-gelb/50 bg-credo-gelb/10" },
};

/** Farbe der Zustandspille; Text immer in Vordergrundfarbe (Kontrast), der Zustand steht als Wort da. */
function pillenKlasse(zustand: RueckgabeZustand | null): string {
  switch (zustand) {
    case null:
      return "border-credo-gelb/60 bg-credo-gelb/10";
    case "ZURUECK":
    case "BESCHAEDIGT":
      return "border-credo-gruen/50 bg-credo-gruen/10";
    case "FEHLT":
      return "border-credo-rot/40 bg-credo-rot/10";
    default:
      return "border-border bg-muted";
  }
}

/** Die Zustandspille einer Zeile („offen“, „zurück · 29.07.2027“, „fehlt“ …). */
function ZustandPille({ zustand, label, am }: { zustand: RueckgabeZustand | null; label: string; am: string | null }) {
  const datum = am && (zustand === "ZURUECK" || zustand === "BESCHAEDIGT") ? formatDatumDE(am) : "";
  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium text-foreground ${pillenKlasse(zustand)}`}
      data-zustand={zustand ?? "OFFEN"}
    >
      {datum ? `${label} · ${datum}` : label}
    </span>
  );
}

/** Ein Block mit Ueberschrift (Hinweise, noch nicht Uebernommenes). */
function Block({ titel, name, kinder, hilfe }: { titel: string; name: string; kinder: ReactNode; hilfe?: string | null }) {
  return (
    <div className="mt-3 rounded-lg border border-border px-3 py-2" data-block={name}>
      <p className="text-xs font-semibold text-foreground">{titel}</p>
      {kinder}
      {hilfe && <p className="mt-1 text-xs text-muted-foreground">{hilfe}</p>}
    </div>
  );
}

// =============================================
// Dialoge
// =============================================

interface DialogBasis {
  sendet: boolean;
  fehler: string | null;
  onAbbrechen: () => void;
  onSenden: (aufruf: RueckgabenAufruf) => void;
}

function untertitelZeile(zeile: RueckgabeZeile): string {
  return [zeile.itemName, zeile.serialNumber ?? "", zeile.stelle].filter((t) => t.trim() !== "").join(" · ");
}

function ZustandDialog({ zeile, sendet, fehler, onAbbrechen, onSenden }: { zeile: RueckgabeZeile } & DialogBasis) {
  const name = useId();
  const [wahl, setWahl] = useState<RueckgabeZustand | null>(zeile.zustand);
  const body = zustandBody(zeile, wahl);
  return (
    <DialogRahmen
      name="rueckgabe-zustand"
      titel={RUECKGABEN_KARTE_TEXTE.zustandTitel}
      untertitel={untertitelZeile(zeile)}
      sendet={sendet}
      fehler={fehler}
      fokusZiel={RUECKGABEN_KARTE_TITEL_ID}
      onAbbrechen={onAbbrechen}
      bestaetigen={{
        text: RUECKGABEN_KARTE_TEXTE.zustandSpeichern,
        grund: body ? null : RUECKGABEN_KARTE_TEXTE.keineAenderung,
        onClick: () => {
          if (body) onSenden({ art: "aendern", body });
        },
      }}
    >
      <fieldset>
        <legend className={LABEL}>{RUECKGABEN_KARTE_TEXTE.zustandLegende}</legend>
        <div className="space-y-1.5">
          {ZUSTAND_WAHL.map((w) => (
            <label key={w.wert ?? "OFFEN"} className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="radio"
                name={name}
                value={w.wert ?? "OFFEN"}
                checked={wahl === w.wert}
                disabled={sendet}
                onChange={() => setWahl(w.wert)}
                className="h-4 w-4 shrink-0"
              />
              <span>{w.label}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div aria-live="polite">
        {wahl === "FEHLT" && zeile.folgeBeiFehlt && (
          <p
            className="flex items-start gap-2 rounded-lg border border-credo-gelb/50 bg-credo-gelb/10 px-3 py-2 text-foreground"
            data-hinweis="folgeaufgabe"
          >
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{RUECKGABEN_KARTE_TEXTE.folgeHinweis}</span>
          </p>
        )}
        {wahl === "VERBLEIBT" && zeile.vorgeschlagen && (
          <p className="text-muted-foreground" data-hinweis="verbleibt">
            {RUECKGABEN_KARTE_TEXTE.verbleibtHinweis}
          </p>
        )}
      </div>
      {zeile.vorgeschlagen && <p className="text-xs text-muted-foreground">{RUECKGABEN_KARTE_TEXTE.gleichlaufHinweis}</p>}
    </DialogRahmen>
  );
}

function KennungDialog({ zeile, sendet, fehler, onAbbrechen, onSenden }: { zeile: RueckgabeZeile } & DialogBasis) {
  const feldId = useId();
  const [wert, setWert] = useState(zeile.serialNumber ?? "");
  const max = zeile.vorgeschlagen ? AUSGABE_GRENZEN.kennung : SERIENNUMMER_MAX;
  const grund = kennungGrundZeile(zeile, wert);
  const label = zeile.vorgeschlagen ? zeile.kennungLabel : RUECKGABEN_KARTE_TEXTE.seriennummer;
  return (
    <DialogRahmen
      name="rueckgabe-kennung"
      titel={RUECKGABEN_KARTE_TEXTE.kennungTitel}
      untertitel={untertitelZeile(zeile)}
      sendet={sendet}
      fehler={fehler}
      fokusZiel={RUECKGABEN_KARTE_TITEL_ID}
      onAbbrechen={onAbbrechen}
      bestaetigen={{
        text: RUECKGABEN_KARTE_TEXTE.kennungSpeichern,
        grund,
        onClick: () => {
          const body = kennungBody(zeile, wert);
          if (body && !grund) onSenden({ art: "aendern", body });
        },
      }}
    >
      <div>
        <label htmlFor={feldId} className={LABEL}>
          {`${label} `}
          <span className="font-normal text-muted-foreground">{RUECKGABEN_KARTE_TEXTE.optional}</span>
        </label>
        <input
          id={feldId}
          type="text"
          value={wert}
          maxLength={max}
          disabled={sendet}
          aria-describedby={`${feldId}-hilfe`}
          onChange={(e) => setWert(e.target.value)}
          className={EINGABE}
        />
        <p id={`${feldId}-hilfe`} className="mt-1 text-xs text-muted-foreground">
          {RUECKGABEN_KARTE_TEXTE.kennungHilfe(max)}
        </p>
      </div>
      {zeile.vorgeschlagen && <p className="text-xs text-muted-foreground">{RUECKGABEN_KARTE_TEXTE.gleichlaufHinweis}</p>}
    </DialogRahmen>
  );
}

function LoeschenDialog({ zeile, sendet, fehler, onAbbrechen, onSenden }: { zeile: RueckgabeZeile } & DialogBasis) {
  return (
    <DialogRahmen
      name="rueckgabe-loeschen"
      titel={RUECKGABEN_KARTE_TEXTE.loeschenTitel}
      untertitel={untertitelZeile(zeile)}
      sendet={sendet}
      fehler={fehler}
      fokusZiel={RUECKGABEN_KARTE_TITEL_ID}
      onAbbrechen={onAbbrechen}
      bestaetigen={{
        text: RUECKGABEN_KARTE_TEXTE.loeschen,
        farbe: "rot",
        onClick: () => onSenden({ art: "loeschen", itemId: zeile.id }),
      }}
    >
      <p className="text-foreground">{RUECKGABEN_KARTE_TEXTE.loeschenSatz(zeile.itemName)}</p>
    </DialogRahmen>
  );
}

function AnlegenDialog({ sendet, fehler, onAbbrechen, onSenden }: DialogBasis) {
  const id = useId();
  const [form, setForm] = useState<AnlegenFormular>(anlegenStart);
  const setzen = (teil: Partial<AnlegenFormular>) => setForm((f) => ({ ...f, ...teil }));
  return (
    <DialogRahmen
      name="rueckgabe-anlegen"
      titel={RUECKGABEN_KARTE_TEXTE.anlegenTitel}
      sendet={sendet}
      fehler={fehler}
      fokusZiel={RUECKGABEN_KARTE_TITEL_ID}
      onAbbrechen={onAbbrechen}
      mitPflichtfeldern
      bestaetigen={{
        text: RUECKGABEN_KARTE_TEXTE.anlegen,
        farbe: "gruen",
        grund: anlegenGrund(form),
        onClick: () => {
          if (!anlegenGrund(form)) onSenden({ art: "anlegen", body: anlegenBody(form) });
        },
      }}
    >
      <div>
        <label htmlFor={`${id}-kategorie`} className={LABEL}>
          {RUECKGABEN_KARTE_TEXTE.kategorie}
        </label>
        <select
          id={`${id}-kategorie`}
          value={form.category}
          disabled={sendet}
          onChange={(e) => setzen({ category: e.target.value as RueckgabeKategorie })}
          className={EINGABE}
        >
          {RUECKGABE_KATEGORIEN.map((k) => (
            <option key={k} value={k}>
              {RETURN_CATEGORY_LABELS[k] ?? k}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor={`${id}-gegenstand`} className={LABEL}>
          {RUECKGABEN_KARTE_TEXTE.gegenstand}
          <span className="text-credo-rot" aria-hidden="true">
            {" "}
            *
          </span>
        </label>
        <input
          id={`${id}-gegenstand`}
          type="text"
          value={form.itemName}
          maxLength={200}
          required
          aria-required="true"
          disabled={sendet}
          onChange={(e) => setzen({ itemName: e.target.value })}
          className={EINGABE}
        />
      </div>
      <div>
        <label htmlFor={`${id}-seriennummer`} className={LABEL}>
          {`${RUECKGABEN_KARTE_TEXTE.seriennummer} `}
          <span className="font-normal text-muted-foreground">{RUECKGABEN_KARTE_TEXTE.optional}</span>
        </label>
        <input
          id={`${id}-seriennummer`}
          type="text"
          value={form.serialNumber}
          maxLength={SERIENNUMMER_MAX}
          disabled={sendet}
          onChange={(e) => setzen({ serialNumber: e.target.value })}
          className={EINGABE}
        />
      </div>
      <div>
        <label htmlFor={`${id}-notiz`} className={LABEL}>
          {`${RUECKGABEN_KARTE_TEXTE.notizFeld} `}
          <span className="font-normal text-muted-foreground">{RUECKGABEN_KARTE_TEXTE.optional}</span>
        </label>
        <input
          id={`${id}-notiz`}
          type="text"
          value={form.notes}
          maxLength={1000}
          disabled={sendet}
          onChange={(e) => setzen({ notes: e.target.value })}
          className={EINGABE}
        />
      </div>
    </DialogRahmen>
  );
}

function LoesenDialog({
  rueckfrage,
  sperrGrund,
  untertitel,
  sendet,
  fehler,
  onAbbrechen,
  onSenden,
}: { rueckfrage: string; sperrGrund: string | null; untertitel: string } & DialogBasis) {
  return (
    <DialogRahmen
      name="einstellung-loesen"
      titel={RUECKGABEN_KARTE_TEXTE.loesenTitel}
      untertitel={untertitel}
      sendet={sendet}
      fehler={fehler}
      fokusZiel={RUECKGABEN_KARTE_TITEL_ID}
      onAbbrechen={onAbbrechen}
      bestaetigen={{
        text: RUECKGABEN_KARTE_TEXTE.loesenBestaetigen,
        farbe: "rot",
        grund: sperrGrund,
        onClick: () => onSenden({ art: "einstellung", body: { aktion: "loesen" } }),
      }}
    >
      <p className="text-foreground" data-rueckfrage="loesen">
        {rueckfrage}
      </p>
      <p className="text-muted-foreground">{RUECKGABEN_KARTE_TEXTE.loesenSatz}</p>
    </DialogRahmen>
  );
}

/**
 * Rueckfrage zum Merker „Person bleibt in einer anderen Beschäftigung“ (G13,
 * Review A4c): Die Aenderung uebernimmt wie „Rückgaben aktualisieren“, was
 * mit dem neuen Wert vorgeschlagen ist – Aufgaben, die schon informierte
 * Stellen sofort sehen und die ein erneutes Umschalten nicht mehr entfernt.
 * Deshalb nie als Nebenwirkung eines Hakens: erst die Liste, dann speichern.
 * Was uebernommen wuerde, rechnet der Server (`merkerWechsel`).
 */
function MerkerDialog({
  nach,
  uebernimmt,
  untertitel,
  sendet,
  fehler,
  onAbbrechen,
  onSenden,
}: { nach: boolean; uebernimmt: ReadonlyArray<AusgabeKurz> | null; untertitel: string } & DialogBasis) {
  // `null`: Der Server hat nichts gerechnet (veralteter Stand) – dann keine Aussage statt einer falschen.
  const liste = uebernimmt ?? [];
  return (
    <DialogRahmen
      name="weitere-beschaeftigung"
      titel={RUECKGABEN_KARTE_TEXTE.merkerTitel(nach)}
      untertitel={untertitel}
      sendet={sendet}
      fehler={fehler}
      fokusZiel={RUECKGABEN_KARTE_TITEL_ID}
      onAbbrechen={onAbbrechen}
      bestaetigen={{
        text:
          liste.length > 0
            ? RUECKGABEN_KARTE_TEXTE.merkerSpeichernUebernehmen
            : RUECKGABEN_KARTE_TEXTE.merkerSpeichern,
        onClick: () => onSenden({ art: "einstellung", body: { aktion: "aktualisieren", weitereBeschaeftigung: nach } }),
      }}
    >
      <p className="text-foreground">{RUECKGABEN_KARTE_TEXTE.merkerSatz(nach)}</p>
      {liste.length > 0 ? (
        <div data-liste="merker-uebernimmt">
          <p className="text-xs font-semibold text-muted-foreground">
            {RUECKGABEN_KARTE_TEXTE.merkerUebernimmt(liste.length)}
          </p>
          <ul className="mt-0.5 list-disc space-y-0.5 pl-5 text-xs text-foreground">
            {liste.map((s) => (
              <li key={s.ausgabeId} className="break-words">
                {stueckText(s)}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-muted-foreground">{RUECKGABEN_KARTE_TEXTE.merkerUebernimmtHilfe}</p>
        </div>
      ) : (
        uebernimmt && (
          <p className="text-muted-foreground" data-merker-nichts>
            {RUECKGABEN_KARTE_TEXTE.merkerNichts}
          </p>
        )
      )}
    </DialogRahmen>
  );
}

// =============================================
// Karte
// =============================================

/** Meldung ueber der Karte (gruen bzw. rot). */
export interface KartenMeldung {
  art: "ok" | "fehler";
  text: string;
}

type OffenerDialog =
  | { art: "zustand"; zeile: RueckgabeZeile }
  | { art: "kennung"; zeile: RueckgabeZeile }
  | { art: "loeschen"; zeile: RueckgabeZeile }
  | { art: "anlegen" }
  | { art: "loesen" }
  | { art: "merker"; nach: boolean };

export interface RueckgabenKarteProps {
  /** Feld `rueckgaben` aus GET /api/offboarding/[id] (nur HR_EDIT_ROLES). */
  rueckgaben: RueckgabenUebersicht;
  /** Rolle in HR_EDIT_ROLES. Ohne Recht nur lesen. */
  darfBearbeiten?: boolean;
  /** Austritt abgebrochen (CANCELLED): nichts mehr erfassen. */
  abgebrochen?: boolean;
  /** Fuehrt einen Aufruf aus (senden, dann neu laden). Ohne ihn bleibt die Karte lesend. */
  onAufruf?: (aufruf: RueckgabenAufruf) => Promise<RueckgabenAusgang>;
  /** Oeffnet den Dialog „Einstellung zuordnen …“ (die Seite haelt ihn). */
  onZuordnen?: () => void;
  /** Meldung von aussen (etwa nach dem Zuordnen); ohne `onMeldung` haelt die Karte ihre Meldung selbst. */
  meldung?: KartenMeldung | null;
  onMeldung?: (meldung: KartenMeldung | null) => void;
}

export function RueckgabenKarte({
  rueckgaben: r,
  darfBearbeiten = false,
  abgebrochen = false,
  onAufruf,
  onZuordnen,
  meldung,
  onMeldung,
}: RueckgabenKarteProps) {
  const merkerId = useId();
  const [dialog, setDialog] = useState<OffenerDialog | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [sendet, setSendet] = useState(false);
  // Ref zusaetzlich zum Zustand: Zwei Klicks vor dem naechsten Rendern saehen beide noch `sendet === false`.
  const laeuftRef = useRef(false);
  const [eigeneMeldung, setEigeneMeldung] = useState<KartenMeldung | null>(null);
  const meldungAnzeige = onMeldung ? (meldung ?? null) : eigeneMeldung;
  const meldungSetzen = onMeldung ?? setEigeneMeldung;

  const bearbeitbar = darfBearbeiten && !!onAufruf;
  const a = r.aktionen;
  const v = r.vorschlag;

  const oeffnen = (d: OffenerDialog) => {
    setFehler(null);
    meldungSetzen(null);
    setDialog(d);
  };
  const schliessen = () => {
    if (sendet) return;
    setFehler(null);
    setDialog(null);
  };

  const ausfuehren = async (aufruf: RueckgabenAufruf, imDialog: boolean) => {
    if (!onAufruf || laeuftRef.current) return;
    laeuftRef.current = true;
    setSendet(true);
    setFehler(null);
    if (!imDialog) meldungSetzen(null);
    try {
      const ausgang = await onAufruf(aufruf);
      if (ausgang.ok) {
        setDialog(null);
        meldungSetzen({ art: "ok", text: ausgang.meldung });
      } else if (imDialog) {
        setFehler(ausgang.meldung);
      } else {
        meldungSetzen({ art: "fehler", text: ausgang.meldung });
      }
      // Direktaktion ohne Dialog: Ihr Knopf war gesperrt und verschwindet oft
      // nach dem Neuladen (etwa „Übernehmen“) – der Fokus laege auf `body`.
      if (!imDialog) document.getElementById(RUECKGABEN_KARTE_TITEL_ID)?.focus();
    } finally {
      laeuftRef.current = false;
      setSendet(false);
    }
  };
  const ausDialog = (aufruf: RueckgabenAufruf) => void ausfuehren(aufruf, true);
  const einstellung = (body: EinstellungAktionBody) => void ausfuehren({ art: "einstellung", body }, false);
  const dialogProps = { sendet, fehler, onAbbrechen: schliessen, onSenden: ausDialog };

  const erledigt = r.zeilen.filter((z) => !z.offen).length;
  const lage = LAGE_ANZEIGE[r.lage] ?? LAGE_ANZEIGE.KEINE_EINSTELLUNG;
  const LageSymbol = lage.Symbol;
  const nochNicht = [...v.rueckgaben, ...v.sperraufgaben];
  // Die Spalte steht, sobald eine Zeile eine Aktion ODER einen Sperrgrund hat –
  // sonst fehlte der Grund gerade dann, wenn ein anderer Austritt alle Stuecke bindet.
  const mitAktionsSpalte =
    bearbeitbar &&
    r.zeilen.some(
      (z) => z.zustandWaehlbar || z.aktionen.korrigieren || z.aktionen.loeschen || !!z.zustandSperrGrund || !!z.sperrGrund,
    );
  const einstellungsTitel = r.einstellung ? einstellungTitel(r.einstellung) : "";
  const einstellungsZeile = r.einstellung ? einstellungZeile(r.einstellung, r.einrichtungen) : "";

  const hinweisListe = (stuecke: ReadonlyArray<AusgabeKurz>, mitEinrichtung: boolean) => (
    <ul className="mt-1 space-y-1">
      {stuecke.map((s) => (
        <li key={s.ausgabeId} className="flex flex-wrap items-center justify-between gap-2 text-xs text-foreground" data-hinweis-stueck={s.ausgabeId}>
          <span className="min-w-0 break-words">{stueckText(s, mitEinrichtung)}</span>
          {bearbeitbar && a.aktualisieren && (
            <button
              type="button"
              className={KNOPF_ZEILE}
              disabled={sendet}
              onClick={() => einstellung({ aktion: "aktualisieren", ausgabeIds: [s.ausgabeId] })}
            >
              <MitBezug text={RUECKGABEN_KARTE_TEXTE.uebernehmen} bezug={s.bezeichnung} />
            </button>
          )}
        </li>
      ))}
    </ul>
  );

  return (
    <section
      className="rounded-xl border border-border bg-card p-5"
      aria-labelledby={RUECKGABEN_KARTE_TITEL_ID}
      data-karte="rueckgaben"
      data-lage={r.lage}
    >
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3
            id={RUECKGABEN_KARTE_TITEL_ID}
            tabIndex={-1}
            className="flex items-center gap-2 text-sm font-bold text-foreground outline-none"
          >
            <span className="h-1 w-1 rounded-full bg-credo-gruen" aria-hidden="true" />
            {RUECKGABEN_KARTE_TEXTE.titel}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground" data-zaehler>
            {RUECKGABEN_KARTE_TEXTE.zaehler(erledigt, r.zeilen.length)}
          </p>
        </div>
        {bearbeitbar && (
          <div className="flex flex-wrap gap-2">
            {a.zuordnen && onZuordnen && (
              <button type="button" className={KNOPF_HAUPT} disabled={sendet} onClick={onZuordnen}>
                {RUECKGABEN_KARTE_TEXTE.zuordnen}
              </button>
            )}
            {a.aktualisieren && (
              <button
                type="button"
                className={KNOPF}
                disabled={sendet}
                onClick={() => einstellung({ aktion: "aktualisieren" })}
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                {RUECKGABEN_KARTE_TEXTE.aktualisieren}
              </button>
            )}
            {!abgebrochen && (
              <button type="button" className={KNOPF} disabled={sendet} onClick={() => oeffnen({ art: "anlegen" })}>
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                {RUECKGABEN_KARTE_TEXTE.hinzufuegen}
              </button>
            )}
          </div>
        )}
      </div>

      {meldungAnzeige && (
        <div
          role={meldungAnzeige.art === "ok" ? "status" : "alert"}
          data-meldung={meldungAnzeige.art}
          className={`mb-3 flex items-start gap-2 rounded-lg border px-3 py-2 text-sm text-foreground ${
            meldungAnzeige.art === "ok" ? "border-credo-gruen/40 bg-credo-gruen/10" : "border-credo-rot/30 bg-credo-rot/10"
          }`}
        >
          <span className="min-w-0 flex-1 break-words">{meldungAnzeige.text}</span>
          <button
            type="button"
            onClick={() => meldungSetzen(null)}
            aria-label={RUECKGABEN_KARTE_TEXTE.meldungSchliessen}
            className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Kopfzeile nach Lage (E-A36) – Symbol und Text, nie nur Farbe. */}
      <div className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm text-foreground ${lage.rahmen}`} data-lage-text={r.lage}>
        <LageSymbol className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <div className="min-w-0 space-y-1">
          <p className="break-words">{r.text}</p>
          {r.zusatz && <p className="break-words">{r.zusatz}</p>}
          <p className="text-xs text-muted-foreground" data-gedaechtnisstuetze>
            {r.gedaechtnisstuetze}
          </p>
        </div>
      </div>

      {/* Die zugeordnete Einstellung, Arbeitsort, Merker. */}
      {r.einstellung && (
        <div className="mt-3 rounded-lg border border-border px-3 py-2" data-einstellung={r.einstellung.onboardingId}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="min-w-0 break-words text-sm text-foreground">
              <span className="text-xs text-muted-foreground">{RUECKGABEN_KARTE_TEXTE.einstellung}: </span>
              <span className="font-medium">{einstellungsTitel}</span>
            </p>
            {bearbeitbar && a.loesen && r.loesen && (
              <button type="button" className={KNOPF_KRITISCH} disabled={sendet} onClick={() => oeffnen({ art: "loesen" })}>
                {RUECKGABEN_KARTE_TEXTE.loesen}
              </button>
            )}
          </div>
          {einstellungsZeile && <p className="text-xs text-muted-foreground">{einstellungsZeile}</p>}
          {r.arbeitsort?.name && (
            <p className="text-xs text-foreground" data-arbeitsort>
              {RUECKGABEN_KARTE_TEXTE.arbeitsortAmAustritt(r.arbeitsort.name)}
            </p>
          )}
          {bearbeitbar && r.loesen?.sperrGrund && (
            <p className="mt-1 text-xs text-muted-foreground" data-loesen-gesperrt>
              {r.loesen.sperrGrund}
            </p>
          )}
          {bearbeitbar && a.aktualisieren ? (
            <div className="mt-2">
              <label htmlFor={merkerId} className="flex items-start gap-2 text-sm text-foreground">
                <input
                  id={merkerId}
                  type="checkbox"
                  checked={r.weitereBeschaeftigung === true}
                  disabled={sendet}
                  aria-describedby={`${merkerId}-hilfe`}
                  // Wie „Rückgaben aktualisieren“ mit dem neuen Merker (G13, S29) – aber
                  // erst nach der Rueckfrage, die nennt, was dabei uebernommen wird
                  // (Review A4c): Das Kaestchen selbst sendet nie (WCAG 3.2.2). Es
                  // zeigt weiter den gespeicherten Wert; nach dem Dialog geht der
                  // Fokus hierher zurueck (`DialogRahmen`).
                  onChange={(e) => oeffnen({ art: "merker", nach: e.target.checked })}
                  className="mt-0.5 h-4 w-4 shrink-0"
                />
                <span>{RUECKGABEN_KARTE_TEXTE.merker}</span>
              </label>
              <p id={`${merkerId}-hilfe`} className="mt-1 pl-6 text-xs text-muted-foreground">
                {RUECKGABEN_KARTE_TEXTE.merkerHilfe}
              </p>
            </div>
          ) : (
            r.weitereBeschaeftigung !== null && (
              <p className="mt-1 text-xs text-muted-foreground" data-merker>
                {RUECKGABEN_KARTE_TEXTE.merkerWert(r.weitereBeschaeftigung)}
              </p>
            )
          )}
        </div>
      )}

      {/* Laut Einstellung, noch nicht uebernommen – „Rückgaben aktualisieren“ holt es. */}
      {nochNicht.length > 0 && (
        <Block
          name="noch-nicht-uebernommen"
          titel={RUECKGABEN_KARTE_TEXTE.nochNicht(nochNicht.length)}
          hilfe={bearbeitbar && a.aktualisieren ? RUECKGABEN_KARTE_TEXTE.nochNichtHilfe : null}
          kinder={
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-foreground">
              {nochNicht.map((s) => (
                <li key={s.ausgabeId} className="break-words">
                  {stueckText(s)}
                </li>
              ))}
            </ul>
          }
        />
      )}

      {/* Hinweise (G13): einzeln uebernehmbar. */}
      {v.hinweisZentral.length > 0 && (
        <Block
          name="hinweis-zentral"
          titel={RUECKGABEN_KARTE_TEXTE.hinweisZentral(v.hinweisZentral.length)}
          kinder={hinweisListe(v.hinweisZentral, false)}
        />
      )}
      {v.hinweisAndereEinrichtung.length > 0 && (
        <Block
          name="hinweis-andere-einrichtung"
          titel={RUECKGABEN_KARTE_TEXTE.hinweisAndere(v.hinweisAndereEinrichtung.length)}
          kinder={hinweisListe(v.hinweisAndereEinrichtung, true)}
        />
      )}
      {r.ohneVermerk.length > 0 && (
        <Block
          name="ohne-vermerk"
          titel={RUECKGABEN_KARTE_TEXTE.ohneVermerk(r.ohneVermerk.length)}
          hilfe={bearbeitbar && a.ohneVermerk ? RUECKGABEN_KARTE_TEXTE.ohneVermerkHilfe : null}
          kinder={
            <ul className="mt-1 space-y-1">
              {r.ohneVermerk.map((o) => (
                <li
                  key={o.checklistItemId}
                  className="flex flex-wrap items-center justify-between gap-2 text-xs text-foreground"
                  data-ohne-vermerk={o.checklistItemId}
                >
                  <span className="min-w-0 break-words">
                    {o.titel}
                    {o.erledigtAm ? (
                      <span className="text-muted-foreground">
                        {` · ${RUECKGABEN_KARTE_TEXTE.erledigtAm(formatDatumDE(o.erledigtAm))}`}
                      </span>
                    ) : null}
                  </span>
                  {bearbeitbar && a.ohneVermerk && (
                    <button
                      type="button"
                      className={KNOPF_ZEILE}
                      disabled={sendet}
                      onClick={() => einstellung({ aktion: "ohne-vermerk", checklistItemIds: [o.checklistItemId] })}
                    >
                      <MitBezug text={RUECKGABEN_KARTE_TEXTE.alsAusgegeben} bezug={o.titel} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          }
        />
      )}
      {v.schonImAustritt.map((s) => (
        <p key={s.offboardingId} className="mt-3 text-xs text-foreground" data-schon-im-austritt>
          {s.text}
        </p>
      ))}

      {/* Tabelle (Mockup 6.8): eine Zeile je Stueck. */}
      {r.zeilen.length > 0 ? (
        <div className="mt-4 overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <caption className="sr-only">{RUECKGABEN_KARTE_TEXTE.tabelle}</caption>
            <thead>
              <tr className="border-b border-border bg-muted text-left text-xs font-semibold text-muted-foreground">
                <th scope="col" className="px-3 py-2">
                  {RUECKGABEN_KARTE_TEXTE.spalteKategorie}
                </th>
                <th scope="col" className="px-3 py-2">
                  {RUECKGABEN_KARTE_TEXTE.spalteGegenstand}
                </th>
                <th scope="col" className="px-3 py-2">
                  {RUECKGABEN_KARTE_TEXTE.spalteKennung}
                </th>
                <th scope="col" className="px-3 py-2">
                  {RUECKGABEN_KARTE_TEXTE.spalteZustand}
                </th>
                {mitAktionsSpalte && (
                  <th scope="col" className="px-3 py-2">
                    {RUECKGABEN_KARTE_TEXTE.spalteAktion}
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {r.zeilen.map((z) => {
                const sperre = bearbeitbar ? (z.zustandSperrGrund ?? z.sperrGrund) : null;
                return (
                  <tr key={z.id} className="border-b border-border align-top last:border-b-0" data-rueckgabe={z.id}>
                    <td className="px-3 py-2 text-xs text-foreground">{z.kategorieLabel}</td>
                    <td className="px-3 py-2">
                      <span className="block break-words font-medium text-foreground">{z.itemName}</span>
                      <span className="block break-words text-xs text-muted-foreground" data-uebergabe>
                        {z.uebergabe ?? z.stelle}
                      </span>
                      {z.condition && (
                        <span className="block break-words text-xs text-muted-foreground">
                          {`${RUECKGABEN_KARTE_TEXTE.zustandsText}: ${z.condition}`}
                        </span>
                      )}
                      {z.notes && (
                        <span className="block break-words text-xs text-muted-foreground">
                          {`${RUECKGABEN_KARTE_TEXTE.notiz}: ${z.notes}`}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-foreground">
                      {z.serialNumber ? (
                        <span className="break-all font-mono">{z.serialNumber}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <ZustandPille zustand={z.zustand} label={z.zustandLabel} am={z.returnedAt} />
                    </td>
                    {mitAktionsSpalte && (
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1.5">
                          {z.zustandWaehlbar && (
                            <button
                              type="button"
                              className={KNOPF_ZEILE}
                              disabled={sendet}
                              onClick={() => oeffnen({ art: "zustand", zeile: z })}
                            >
                              <MitBezug text={RUECKGABEN_KARTE_TEXTE.zustandKnopf} bezug={z.itemName} />
                            </button>
                          )}
                          {z.aktionen.korrigieren && (
                            <button
                              type="button"
                              className={KNOPF_ZEILE}
                              disabled={sendet}
                              onClick={() => oeffnen({ art: "kennung", zeile: z })}
                            >
                              <MitBezug text={RUECKGABEN_KARTE_TEXTE.kennungKnopf} bezug={z.itemName} />
                            </button>
                          )}
                          {z.aktionen.loeschen && (
                            <button
                              type="button"
                              className={KNOPF_KRITISCH}
                              disabled={sendet}
                              onClick={() => oeffnen({ art: "loeschen", zeile: z })}
                            >
                              <MitBezug text={RUECKGABEN_KARTE_TEXTE.loeschenKnopf} bezug={z.itemName} />
                            </button>
                          )}
                        </div>
                        {sperre && (
                          <p className="mt-1 max-w-xs text-xs text-muted-foreground" data-zeile-sperrgrund>
                            {sperre}
                          </p>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground" data-leer="rueckgaben">
          {RUECKGABEN_KARTE_TEXTE.leer}
        </p>
      )}

      {/* Sperraufgaben je Stelle (Mockup 6.8). */}
      {r.sperraufgaben.map((s) => (
        <p key={s.departmentKey} className="mt-3 text-xs text-foreground" data-sperraufgaben={s.departmentKey}>
          {s.text}
        </p>
      ))}

      <ProtokollZeile protokoll={r.protokoll} />

      {dialog?.art === "zustand" && <ZustandDialog zeile={dialog.zeile} {...dialogProps} />}
      {dialog?.art === "kennung" && <KennungDialog zeile={dialog.zeile} {...dialogProps} />}
      {dialog?.art === "loeschen" && <LoeschenDialog zeile={dialog.zeile} {...dialogProps} />}
      {dialog?.art === "anlegen" && <AnlegenDialog {...dialogProps} />}
      {dialog?.art === "loesen" && r.loesen && (
        <LoesenDialog
          rueckfrage={r.loesen.rueckfrage}
          sperrGrund={r.loesen.sperrGrund}
          untertitel={einstellungsTitel}
          {...dialogProps}
        />
      )}
      {dialog?.art === "merker" && (
        <MerkerDialog
          nach={dialog.nach}
          uebernimmt={r.merkerWechsel?.nach === dialog.nach ? r.merkerWechsel.uebernimmt : null}
          untertitel={einstellungsTitel}
          {...dialogProps}
        />
      )}
    </section>
  );
}

// =============================================
// Ohne `rueckgaben`: die bisherige Liste nur lesend
// =============================================

/** Eine Rueckgabe-Zeile, wie GET /api/offboarding/[id] sie in `returnItems` liefert. */
export interface RueckgabeListenZeile {
  id: string;
  category: string;
  itemName: string;
  serialNumber: string | null;
  zustand?: string | null;
  isReturned: boolean;
  returnedAt: string | null;
  condition: string | null;
  notes: string | null;
}

/** Wort zum Zustand einer Zeile (Altbestand `isReturned` = „zurück“, sonst „offen“). */
export function listenZustand(item: Pick<RueckgabeListenZeile, "zustand" | "isReturned">): {
  zustand: RueckgabeZustand | null;
  label: string;
} {
  const zustand = rueckgabeZustand(item);
  return { zustand, label: zustand ? AUSGABE_ZUSTAND_LABELS[zustand] : RUECKGABE_OFFEN_LABEL };
}

/**
 * Die Rueckgaben nur lesend – fuer Rollen ohne das Feld `rueckgaben`
 * (Einrichtungsleitung, Fuehrungskraft). Ohne Aktionen, ohne Kennung der
 * Einstellung ueber das hinaus, was die Zeile ohnehin traegt.
 */
export function RueckgabenListe({ returnItems }: { returnItems: ReadonlyArray<RueckgabeListenZeile> }) {
  if (returnItems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-card py-16" data-leer="rueckgaben">
        <PackageX className="mb-4 h-16 w-16 text-muted-foreground" aria-hidden="true" />
        <p className="mb-1 text-base font-medium text-foreground">Keine Rückgaben</p>
        <p className="text-sm text-muted-foreground">Es wurden noch keine Gegenstände zur Rückgabe erfasst.</p>
      </div>
    );
  }
  const erledigt = returnItems.filter((i) => listenZustand(i).zustand !== null).length;
  return (
    <div className="space-y-4" data-liste="rueckgaben-lesend">
      <p className="text-sm text-muted-foreground">{RUECKGABEN_KARTE_TEXTE.zaehler(erledigt, returnItems.length)}</p>
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <caption className="sr-only">{RUECKGABEN_KARTE_TEXTE.tabelle}</caption>
          <thead>
            <tr className="border-b border-border bg-muted text-left text-xs font-semibold text-muted-foreground">
              <th scope="col" className="px-4 py-3">{RUECKGABEN_KARTE_TEXTE.spalteKategorie}</th>
              <th scope="col" className="px-4 py-3">{RUECKGABEN_KARTE_TEXTE.spalteGegenstand}</th>
              <th scope="col" className="px-4 py-3">{RUECKGABEN_KARTE_TEXTE.spalteKennung}</th>
              <th scope="col" className="px-4 py-3">{RUECKGABEN_KARTE_TEXTE.spalteZustand}</th>
            </tr>
          </thead>
          <tbody>
            {returnItems.map((item) => {
              const z = listenZustand(item);
              return (
                <tr key={item.id} className="border-b border-border align-top last:border-b-0" data-rueckgabe={item.id}>
                  <td className="px-4 py-3 text-xs text-foreground">{RETURN_CATEGORY_LABELS[item.category] ?? item.category}</td>
                  <td className="px-4 py-3">
                    <span className="block break-words font-medium text-foreground">{item.itemName}</span>
                    {item.condition && (
                      <span className="block break-words text-xs text-muted-foreground">
                        {`${RUECKGABEN_KARTE_TEXTE.zustandsText}: ${item.condition}`}
                      </span>
                    )}
                    {item.notes && (
                      <span className="block break-words text-xs text-muted-foreground">
                        {`${RUECKGABEN_KARTE_TEXTE.notiz}: ${item.notes}`}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-foreground">
                    {item.serialNumber ? (
                      <span className="break-all font-mono">{item.serialNumber}</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <ZustandPille zustand={z.zustand} label={z.label} am={item.returnedAt} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// =============================================
// Reiter Checkliste: Ruecknahmeaufgabe (S32, 1.8)
// =============================================

/**
 * Die Rueckgabe-Zeile zu einer Ruecknahmeaufgabe (`herkunft` AUSGABE mit einer
 * Zeile derselben `ausgabeId`); `null` bei Sperr- und Folgeaufgaben, Vorlagen.
 */
export function rueckgabeZurAufgabe<R extends { ausgabeId?: string | null }>(
  aufgabe: { herkunft?: string | null; ausgabeId?: string | null },
  returnItems: ReadonlyArray<R>,
): R | null {
  if (aufgabe.herkunft !== "AUSGABE" || !aufgabe.ausgabeId) return null;
  return returnItems.find((r) => r.ausgabeId === aufgabe.ausgabeId) ?? null;
}

/**
 * An einer Ruecknahmeaufgabe im Reiter Checkliste: der Zustand als Text
 * („Rückgabe: fehlt“) und der Verweis „Zustand im Reiter „Rückgaben“ wählen“
 * – der Haken dort heisst nur „zurück“ (G15), „beschädigt“, „fehlt“,
 * „verbleibt“ und „entfällt“ waehlt der Reiter. Sperr- und Folgeaufgaben
 * zeigen nichts.
 */
export function AusgabeAufgabeZusatz({
  aufgabe,
  returnItems,
  onZumReiter,
}: {
  aufgabe: { herkunft?: string | null; ausgabeId?: string | null };
  returnItems: ReadonlyArray<{ ausgabeId?: string | null; zustand?: string | null; isReturned: boolean }>;
  onZumReiter?: () => void;
}) {
  const zeile = rueckgabeZurAufgabe(aufgabe, returnItems);
  if (!zeile) return null;
  const { label } = listenZustand(zeile);
  return (
    <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-foreground" data-ruecknahme-zustand>
      <span>{RUECKGABEN_KARTE_TEXTE.rueckgabeZustand(label)}</span>
      {onZumReiter && (
        <button type="button" onClick={onZumReiter} className="text-primary underline-offset-2 hover:underline">
          {RUECKGABEN_KARTE_TEXTE.zumReiter}
        </button>
      )}
    </p>
  );
}
