"use client";

/**
 * Die Dialoge der Ausgaben in der Karte „Ausstattung & Zugänge“ (Reiter
 * Checkliste der Onboarding-Detailseite) — Ausstattung & Zugaenge Stufe 2,
 * Feinplan A4, S26, G7, 1.8. Alle ueber `DialogRahmen`
 * (src/components/unterlagen/dialog-rahmen.tsx):
 *
 *   vermerken        „Übergabe vermerken“ (Zugang: „Einrichtung vermerken“):
 *                    1 bis 10 Stueck, je Kennung (beschriftet mit
 *                    `kennungLabel`, freiwillig) und Datum (Vorgabe heute, nie
 *                    in der Zukunft); „Weiteres Stück“ bis zur Grenze je Vermerk
 *                    bzw. bis 20 aktive Stuecke an der Aufgabe
 *   korrigieren      Kennung und Datum eines Stuecks; nur Geaendertes geht hinaus
 *   tauschen         Pflichtwahl „Defekt“ / „Verloren“ und das neue Stueck; bei
 *                    einem Schluessel und „Verloren“ der Hinweis zur
 *                    Gebaeudewirtschaft (G7)
 *   zurueckgenommen  Ruecknahme ohne Austritt: „Zurückerhalten“, „Beschädigt
 *                    zurückerhalten“, „Fehlt“ (bei „Fehlt“ eines Schluessels
 *                    derselbe Hinweis); ein Zugang nur „gesperrt“
 *   entfernen        Rueckfrage — fuer einen irrtuemlichen Vermerk
 *
 * Wie im Hausmuster (ausstattung-dialoge.tsx) ruft KEIN Dialog eine
 * Schnittstelle: Er baut den Body (`…Body`, rein und exportiert — dieselbe Form
 * wie `ausgabenAktionSchema`, der Komponententest schickt jeden Body durch das
 * echte Schema) und meldet ihn an die Karte; die sendet und gibt einen Fehler
 * des Servers als `fehler` zurueck. Vor dem Senden prueft der Dialog mit
 * denselben Regeln wie der Server (`vermerkPruefen` fuer die Anzahl,
 * `kennungSchema` fuer die Kennung, Kalendertag nicht nach heute); deren
 * Meldung steht als Grund am gesperrten Knopf. Was nur der Server weiss (365
 * Tage vor dem Anlegen, Bindung an einen Austritt, gleichzeitige Aenderung),
 * meldet er selbst.
 *
 * Portal: Texte ohne Anrede. Nur Farb-Tokens und lucide-react (neue Datei,
 * Stand 0 in der Sperrklinke).
 */

import { useEffect, useId, useRef, useState } from "react";
import { Plus, TriangleAlert, X } from "lucide-react";
import { DialogRahmen } from "@/components/unterlagen/dialog-rahmen";
import {
  AUSGABE_GRENZEN,
  KENNUNG_LABEL_STANDARD,
  MELDUNGEN_AUSGABEN,
  RUECKGABE_ZUSTAENDE_STELLE,
  TAUSCH_GRUENDE,
  vermerkPruefen,
  type AusgabeBeiAustritt,
  type AusgabeStand,
  type RueckgabeZustandStelle,
  type TauschGrund,
} from "@/lib/ausgaben";
import type { AusstattungsAufgabeStand } from "@/lib/ausstattung";
import { heuteInBerlin, istKalendertag } from "@/lib/kalendertag";
import { kennungSchema } from "@/lib/validations/ausgaben";

// =============================================
// Body der Aktionen (POST /api/onboarding/[id]/ausgaben)
// =============================================

/** Ein Stueck: Kennung (`null` = ohne) und Datum (`YYYY-MM-DD`; fehlt = heute bzw. unveraendert). */
export interface StueckBody {
  kennung?: string | null;
  uebergebenAm?: string;
}

/** Die fuenf Aktionen der Karte — dieselbe Form wie `ausgabenAktionSchema` (src/lib/validations/ausgaben.ts). */
export type AusgabenAktionBody =
  | { aktion: "vermerken"; checklistItemId: string; stuecke: StueckBody[] }
  | { aktion: "korrigieren"; ausgabeId: string; kennung?: string | null; uebergebenAm?: string }
  | { aktion: "tauschen"; ausgabeId: string; grund: TauschGrund; neu: StueckBody }
  | { aktion: "zurueckgenommen"; ausgabeId: string; zustand: RueckgabeZustandStelle }
  | { aktion: "entfernen"; ausgabeId: string };

// =============================================
// Texte
// =============================================

/** Woerter je Art: Ein Gegenstand wird uebergeben, ein Zugang eingerichtet und zurueck nur gesperrt (G4, 1.2). */
export const AUSGABE_ART_TEXTE: Readonly<
  Record<
    AusgabeBeiAustritt,
    {
      /** Knopf (mit „…“) und Titel des Dialogs. */
      vermerken: string;
      datum: string;
      speichern: string;
      korrigieren: string;
      entfernen: string;
      /** Knopf (mit „…“) der Ruecknahme ohne Austritt. */
      zuruecknehmen: string;
      zuruecknehmenTitel: string;
    }
  >
> = {
  RUECKGABE: {
    vermerken: "Übergabe vermerken",
    datum: "Übergeben am",
    speichern: "Übergabe speichern",
    korrigieren: "Übergabevermerk korrigieren",
    entfernen: "Übergabevermerk entfernen?",
    zuruecknehmen: "Zurückgenommen",
    zuruecknehmenTitel: "Rücknahme vermerken",
  },
  SPERREN: {
    vermerken: "Einrichtung vermerken",
    datum: "Eingerichtet am",
    speichern: "Einrichtung speichern",
    korrigieren: "Einrichtungsvermerk korrigieren",
    entfernen: "Einrichtungsvermerk entfernen?",
    zuruecknehmen: "Gesperrt",
    zuruecknehmenTitel: "Sperrung vermerken",
  },
};

/** Die Texte der Art; ohne Angabe (Altbestand der Uebersicht) die eines Gegenstands. */
export function artTexte(art: string | null | undefined): (typeof AUSGABE_ART_TEXTE)[AusgabeBeiAustritt] {
  return art === "SPERREN" ? AUSGABE_ART_TEXTE.SPERREN : AUSGABE_ART_TEXTE.RUECKGABE;
}

/** Wahl beim Zuruecknehmen (dieselben Woerter wie auf der Link-Seite des Austritts, 1.8). */
export const RUECKNAHME_WAHL: Readonly<Record<RueckgabeZustandStelle, string>> = {
  ZURUECK: "Zurückerhalten",
  BESCHAEDIGT: "Beschädigt zurückerhalten",
  FEHLT: "Fehlt",
};

/** Wahl des Tauschgrunds (G7: Pflicht) und was danach mit dem alten Stueck geschieht. */
export const TAUSCH_WAHL: Readonly<Record<TauschGrund, { label: string; folge: string }>> = {
  DEFEKT: { label: "Defekt", folge: "Das alte Stück gilt danach als „ersetzt“." },
  VERLOREN: { label: "Verloren", folge: "Das alte Stück gilt danach als „fehlt“." },
};

/** Texte nur der Dialoge (die Fehlertexte stehen in `MELDUNGEN_AUSGABEN`). */
export const AUSGABEN_DIALOG_TEXTE = {
  KEINE_AENDERUNG: "Noch keine Änderung.",
  OPTIONAL: "(optional)",
  WEITERES_STUECK: "Weiteres Stück",
  STUECK_WEGLASSEN: (n: number): string => `Stück ${n} weglassen`,
  STUECK_NR: (n: number): string => ` – Stück ${n}`,
  VERMERK_ERKLAERUNG: "Der Vermerk hakt die Aufgabe nicht ab – Abhaken und Vermerken sind getrennt.",
  KENNUNG_HILFE: `Höchstens ${AUSGABE_GRENZEN.kennung} Zeichen, ohne spitze Klammern. Leer = ohne Kennung.`,
  KORREKTUR_ERKLAERUNG: "Kennung oder Datum des Vermerks berichtigen. Ein anderes Stück bitte mit „Tauschen…“ vermerken.",
  TAUSCH_LEGENDE: "Grund des Tauschs",
  TAUSCH_NEU: "Neues Stück",
  TAUSCH_ERKLAERUNG: "Das neue Stück steht danach als ausgegeben an derselben Aufgabe.",
  RUECKNAHME_LEGENDE: "Zustand",
  ZUSTAND_FEHLT: "Bitte den Zustand wählen.",
  RUECKNAHME_ERKLAERUNG:
    "Für eine Rücknahme ohne Austritt – etwa nach einer Absage oder bei einem Defekt ohne Ersatz. Im Austritt vermerkt der Reiter „Rückgaben“ die Rückgabe.",
  SPERRUNG_SATZ: "Der Zugang wird als „gesperrt“ vermerkt.",
  ENTFERNEN_SATZ: (text: string): string => `Der Vermerk „${text}“ wird gelöscht.`,
  ENTFERNEN_ERKLAERUNG: (art: string | null | undefined): string =>
    `Gedacht für einen irrtümlichen Vermerk. ${
      art === "SPERREN"
        ? "Eine Sperrung bitte mit „Gesperrt…“ vermerken."
        : "Eine Rücknahme bitte mit „Zurückgenommen…“ vermerken."
    }`,
  ENTFERNEN: "Entfernen",
  TAUSCHEN: "Tauschen",
  KORRIGIEREN: "Korrektur speichern",
} as const;

// =============================================
// Reine Regeln (dieselben wie der Server)
// =============================================

/** Kennung und Datum eines Stuecks im Formular (Datum `YYYY-MM-DD` oder ""). */
export interface StueckFormular {
  kennung: string;
  datum: string;
}

/** \r\n und \r werden \n, aussen getrimmt — wie der Server (`freitextNormalisieren`). */
function normalisiert(text: string): string {
  return text.replace(/\r\n?/g, "\n").trim();
}

/** Die Kennung nach `kennungSchema` (Laenge, spitze Klammern, Steuerzeichen) — Meldung des Servers, sonst `null`. */
export function kennungGrund(kennung: string): string | null {
  const r = kennungSchema.safeParse(kennung);
  return r.success ? null : (r.error.errors[0]?.message ?? MELDUNGEN_AUSGABEN.KENNUNG_UNGUELTIG);
}

/**
 * Ein Datum: ein echter Kalendertag, nicht nach `heute`. Leer ist nur ohne
 * `pflicht` erlaubt (beim Vermerk gilt dann heute). Die Untergrenze (365 Tage
 * vor dem Anlegen des Vorgangs) kennt nur der Server.
 */
export function datumGrund(datum: string, heute: string, pflicht: boolean): string | null {
  const tag = datum.trim();
  if (tag === "") return pflicht ? MELDUNGEN_AUSGABEN.DATUM_UNGUELTIG : null;
  if (!istKalendertag(tag)) return MELDUNGEN_AUSGABEN.DATUM_UNGUELTIG;
  if (tag > heute) return MELDUNGEN_AUSGABEN.DATUM_IN_ZUKUNFT;
  return null;
}

/** Ein Stueck fuer den Body: Kennung `null` statt leer, Datum nur, wenn angegeben. */
export function stueckBody(f: StueckFormular): StueckBody {
  const kennung = normalisiert(f.kennung);
  const datum = f.datum.trim();
  return { kennung: kennung === "" ? null : kennung, ...(datum ? { uebergebenAm: datum } : {}) };
}

/** Wie viele aktive Stuecke an der Aufgabe stehen (AUSGEGEBEN, VERBLEIBT). */
export function aktiveStuecke(aufgabe: Pick<AusstattungsAufgabeStand, "ausgaben">): number {
  return (aufgabe.ausgaben ?? []).filter((s) => s.aktiv).length;
}

/** Hoechstens so viele Zeilen bietet „Weiteres Stück“ an: 10 je Vermerk, zusammen hoechstens 20 aktive (G4). */
export function vermerkenMaxStuecke(aktiv: number): number {
  return Math.max(1, Math.min(AUSGABE_GRENZEN.stueckJeVermerk, AUSGABE_GRENZEN.aktiveJeAufgabe - aktiv));
}

export function vermerkenStart(heute: string): StueckFormular[] {
  return [{ kennung: "", datum: heute }];
}

/**
 * Grund, aus dem der Vermerk nicht hinausgeht: Anzahl (`vermerkPruefen`, ohne
 * Daten — die prueft der Dialog selbst), dann je Stueck Kennung und Datum.
 */
export function vermerkenGrund(zeilen: ReadonlyArray<StueckFormular>, ctx: { heute: string; aktiv: number }): string | null {
  const anzahl = vermerkPruefen(
    { stuecke: zeilen.map(() => ({})) },
    { heute: ctx.heute, vorgangAngelegt: ctx.heute, aktiv: ctx.aktiv },
  );
  if (anzahl) return MELDUNGEN_AUSGABEN[anzahl];
  for (const z of zeilen) {
    const grund = kennungGrund(z.kennung) ?? datumGrund(z.datum, ctx.heute, false);
    if (grund) return grund;
  }
  return null;
}

export function vermerkenBody(checklistItemId: string, zeilen: ReadonlyArray<StueckFormular>): AusgabenAktionBody {
  return { aktion: "vermerken", checklistItemId, stuecke: zeilen.map(stueckBody) };
}

export function korrigierenStart(stueck: Pick<AusgabeStand, "kennung" | "uebergebenAm">): StueckFormular {
  return { kennung: stueck.kennung ?? "", datum: stueck.uebergebenAm ?? "" };
}

/**
 * Body der Korrektur: nur geaenderte Felder (`kennung: null` loescht die
 * Kennung); `null` = nichts geaendert.
 */
export function korrigierenBody(
  stueck: Pick<AusgabeStand, "id" | "kennung" | "uebergebenAm">,
  f: StueckFormular,
): AusgabenAktionBody | null {
  const kennung = normalisiert(f.kennung) || null;
  const datum = f.datum.trim();
  const body: { aktion: "korrigieren"; ausgabeId: string; kennung?: string | null; uebergebenAm?: string } = {
    aktion: "korrigieren",
    ausgabeId: stueck.id,
  };
  if (kennung !== (stueck.kennung ?? null)) body.kennung = kennung;
  if (datum !== "" && datum !== (stueck.uebergebenAm ?? "")) body.uebergebenAm = datum;
  return body.kennung === undefined && body.uebergebenAm === undefined ? null : body;
}

export function korrigierenGrund(
  stueck: Pick<AusgabeStand, "id" | "kennung" | "uebergebenAm">,
  f: StueckFormular,
  heute: string,
): string | null {
  return (
    kennungGrund(f.kennung) ??
    datumGrund(f.datum, heute, true) ??
    (korrigierenBody(stueck, f) ? null : AUSGABEN_DIALOG_TEXTE.KEINE_AENDERUNG)
  );
}

/** Formular des Tauschs: Grund (Pflicht, ohne Vorgabe) und das neue Stueck. */
export interface TauschFormular extends StueckFormular {
  grund: TauschGrund | "";
}

export function tauschenStart(heute: string): TauschFormular {
  return { grund: "", kennung: "", datum: heute };
}

export function tauschenGrund(f: TauschFormular, heute: string): string | null {
  if (!f.grund) return MELDUNGEN_AUSGABEN.TAUSCH_GRUND_FEHLT;
  return kennungGrund(f.kennung) ?? datumGrund(f.datum, heute, false);
}

/** `null`, solange kein Grund gewaehlt ist (G7: Pflicht). */
export function tauschenBody(stueck: Pick<AusgabeStand, "id">, f: TauschFormular): AusgabenAktionBody | null {
  if (!f.grund) return null;
  return { aktion: "tauschen", ausgabeId: stueck.id, grund: f.grund, neu: stueckBody(f) };
}

export function zuruecknehmenBody(stueck: Pick<AusgabeStand, "id">, zustand: RueckgabeZustandStelle): AusgabenAktionBody {
  return { aktion: "zurueckgenommen", ausgabeId: stueck.id, zustand };
}

export function entfernenBody(stueck: Pick<AusgabeStand, "id">): AusgabenAktionBody {
  return { aktion: "entfernen", ausgabeId: stueck.id };
}

/**
 * Der Hinweis „Bitte die Gebäudewirtschaft wegen der Schließung informieren.“
 * (G7): bei einem Schluessel bzw. Transponder, der verloren ist (Tausch) oder
 * fehlt (Ruecknahme) — dieselbe Regel, nach der der Server ihn als `meldung`
 * schickt. Eine Aufgabe an die Gebaeudewirtschaft entsteht dabei nicht.
 */
export function gebaeudewirtschaftNoetig(opts: {
  schluessel: boolean | undefined;
  tauschGrund?: string;
  zustand?: string;
}): boolean {
  return opts.schluessel === true && (opts.tauschGrund === "VERLOREN" || opts.zustand === "FEHLT");
}

// =============================================
// Welcher Dialog (von der Karte geoeffnet)
// =============================================

/**
 * Was die Karte beim Oeffnen mitgibt — der Stand beim Oeffnen (der Dialog bleibt
 * stabil, waehrend die Seite neu laedt). `bezug` ist die Bezeichnung des
 * Stuecks („Schlüssel: Haupteingang“), `stelleName` die ausgebende Stelle.
 */
export type AusgabenDialogAnfrage =
  | { art: "vermerken"; aufgabe: AusstattungsAufgabeStand; bezug: string; stelleName: string }
  | {
      [A in StueckDialogArt]: {
        art: A;
        aufgabe: AusstattungsAufgabeStand;
        stueck: AusgabeStand;
        bezug: string;
        stelleName: string;
      };
    }[StueckDialogArt];

/** Die Dialoge an einem vorhandenen Stueck. */
export type StueckDialogArt = "korrigieren" | "tauschen" | "zurueckgenommen" | "entfernen";

interface DialogBasis {
  sendet: boolean;
  fehler: string | null;
  fokusZiel?: string;
  onAbbrechen: () => void;
  onSenden: (body: AusgabenAktionBody) => void;
  /** Der heutige Berliner Tag (`YYYY-MM-DD`); fehlt = aus der Uhr des Browsers. Fuer Tests. */
  heute?: string;
}

// =============================================
// Bausteine
// =============================================

const EINGABE =
  "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ring focus:ring-1 focus:ring-ring disabled:opacity-60";
const DATUM =
  "rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ring focus:ring-1 focus:ring-ring disabled:opacity-60";
const LABEL = "mb-1 block text-sm font-medium text-foreground";
const HILFE = "mt-1 text-xs text-muted-foreground";
const KNOPF_LEISE =
  "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50";

function Pflicht() {
  return (
    <span className="text-credo-rot" aria-hidden="true">
      {" "}
      *
    </span>
  );
}

/** Der Hinweis zur Gebaeudewirtschaft — in einem stets vorhandenen `aria-live`-Bereich, damit er angesagt wird. */
function GebaeudewirtschaftHinweis({ zeigen }: { zeigen: boolean }) {
  return (
    <div aria-live="polite">
      {zeigen && (
        <p
          className="flex items-start gap-2 rounded-lg border border-credo-gelb/50 bg-credo-gelb/10 px-3 py-2 text-sm text-foreground"
          data-hinweis="gebaeudewirtschaft"
        >
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{MELDUNGEN_AUSGABEN.GEBAEUDEWIRTSCHAFT_INFORMIEREN}</span>
        </p>
      )}
    </div>
  );
}

/** Kennung (freiwillig, beschriftet mit `kennungLabel`) und Datum eines Stuecks. */
function StueckFelder({
  idBasis,
  kennungLabel,
  datumLabel,
  wert,
  heute,
  sendet,
  zusatz = "",
  datumPflicht = false,
  autoFokus = false,
  onAendern,
}: {
  idBasis: string;
  kennungLabel: string;
  datumLabel: string;
  wert: StueckFormular;
  heute: string;
  sendet: boolean;
  /** „ – Stück 2“ bei mehreren Zeilen. */
  zusatz?: string;
  datumPflicht?: boolean;
  autoFokus?: boolean;
  onAendern: (teil: Partial<StueckFormular>) => void;
}) {
  const kennungId = `${idBasis}-kennung`;
  const datumId = `${idBasis}-datum`;
  return (
    <div className="flex flex-wrap items-start gap-3">
      <div className="min-w-0 flex-1 basis-48">
        <label htmlFor={kennungId} className={LABEL}>
          {`${kennungLabel}${zusatz} `}
          <span className="font-normal text-muted-foreground">{AUSGABEN_DIALOG_TEXTE.OPTIONAL}</span>
        </label>
        <input
          id={kennungId}
          type="text"
          value={wert.kennung}
          maxLength={AUSGABE_GRENZEN.kennung}
          disabled={sendet}
          autoFocus={autoFokus}
          aria-describedby={`${kennungId}-hilfe`}
          onChange={(e) => onAendern({ kennung: e.target.value })}
          className={EINGABE}
        />
        <p id={`${kennungId}-hilfe`} className={HILFE}>
          {AUSGABEN_DIALOG_TEXTE.KENNUNG_HILFE}
        </p>
      </div>
      <div>
        <label htmlFor={datumId} className={LABEL}>
          {`${datumLabel}${zusatz}`}
          {datumPflicht && <Pflicht />}
        </label>
        <input
          id={datumId}
          type="date"
          value={wert.datum}
          max={heute}
          disabled={sendet}
          required={datumPflicht}
          aria-required={datumPflicht ? "true" : undefined}
          onChange={(e) => onAendern({ datum: e.target.value })}
          className={DATUM}
        />
      </div>
    </div>
  );
}

/** Eine Auswahlgruppe als Optionsfelder (Pflichtwahl, ohne Vorgabe). */
function WahlFeld<T extends string>({
  name,
  legende,
  werte,
  labels,
  wert,
  sendet,
  onAendern,
}: {
  name: string;
  legende: string;
  werte: ReadonlyArray<T>;
  labels: Readonly<Record<T, string>>;
  wert: T | "";
  sendet: boolean;
  onAendern: (wert: T) => void;
}) {
  return (
    <fieldset data-feld={name}>
      <legend className={LABEL}>
        {legende}
        <Pflicht />
      </legend>
      <div className="space-y-1.5">
        {werte.map((w) => (
          <label key={w} className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="radio"
              name={name}
              value={w}
              className="h-4 w-4 shrink-0"
              checked={wert === w}
              disabled={sendet}
              onChange={() => onAendern(w)}
            />
            <span>{labels[w]}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** „Schlüssel: Haupteingang · Facility Management“ bzw. mit dem Stueck dahinter. */
function untertitel(...teile: ReadonlyArray<string | null | undefined>): string {
  return teile.filter((t) => t && t.trim()).join(" · ");
}

// =============================================
// Dialoge
// =============================================

function VermerkenDialog({
  anfrage,
  sendet,
  fehler,
  fokusZiel,
  onAbbrechen,
  onSenden,
  heute,
}: { anfrage: Extract<AusgabenDialogAnfrage, { art: "vermerken" }> } & DialogBasis & { heute: string }) {
  const basis = useId();
  const texte = artTexte(anfrage.aufgabe.ausgabeArt);
  const kennungLabel = anfrage.aufgabe.kennungLabel?.trim() || KENNUNG_LABEL_STANDARD;
  const aktiv = aktiveStuecke(anfrage.aufgabe);
  const max = vermerkenMaxStuecke(aktiv);
  // Stabile Schluessel: Weglassen einer Zeile baut die uebrigen nicht neu auf.
  const naechsteNr = useRef(1);
  const [zeilen, setZeilen] = useState<(StueckFormular & { nr: number })[]>(() =>
    vermerkenStart(heute).map((z) => ({ ...z, nr: 0 })),
  );
  const weiterRef = useRef<HTMLButtonElement>(null);
  const [fokusAufWeiter, setFokusAufWeiter] = useState(false);
  useEffect(() => {
    if (!fokusAufWeiter) return;
    weiterRef.current?.focus();
    setFokusAufWeiter(false);
  }, [fokusAufWeiter]);

  const grund = vermerkenGrund(zeilen, { heute, aktiv });
  const mehrere = zeilen.length > 1;

  return (
    <DialogRahmen
      titel={texte.vermerken}
      untertitel={untertitel(anfrage.bezug, anfrage.stelleName)}
      name="ausgabe-vermerken"
      sendet={sendet}
      fehler={fehler}
      fokusZiel={fokusZiel}
      onAbbrechen={onAbbrechen}
      bestaetigen={{
        text: texte.speichern,
        grund,
        farbe: "gruen",
        onClick: () => onSenden(vermerkenBody(anfrage.aufgabe.checklistItemId, zeilen)),
      }}
    >
      <p className="text-muted-foreground">{AUSGABEN_DIALOG_TEXTE.VERMERK_ERKLAERUNG}</p>
      {zeilen.map((z, i) => (
        <div key={z.nr} className="flex items-start gap-2" data-vermerk-zeile={i}>
          <div className="min-w-0 flex-1">
            <StueckFelder
              idBasis={`${basis}-${z.nr}`}
              kennungLabel={kennungLabel}
              datumLabel={texte.datum}
              wert={z}
              heute={heute}
              sendet={sendet}
              zusatz={mehrere ? AUSGABEN_DIALOG_TEXTE.STUECK_NR(i + 1) : ""}
              autoFokus={z.nr > 0}
              onAendern={(teil) => setZeilen((prev) => prev.map((alt) => (alt.nr === z.nr ? { ...alt, ...teil } : alt)))}
            />
          </div>
          {mehrere && (
            <button
              type="button"
              disabled={sendet}
              aria-label={AUSGABEN_DIALOG_TEXTE.STUECK_WEGLASSEN(i + 1)}
              onClick={() => {
                setZeilen((prev) => prev.filter((alt) => alt.nr !== z.nr));
                setFokusAufWeiter(true);
              }}
              className="mt-7 shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
      ))}
      {zeilen.length < max && (
        <button
          ref={weiterRef}
          type="button"
          disabled={sendet}
          className={KNOPF_LEISE}
          onClick={() => {
            const nr = naechsteNr.current++;
            setZeilen((prev) => [...prev, { kennung: "", datum: heute, nr }]);
          }}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          {AUSGABEN_DIALOG_TEXTE.WEITERES_STUECK}
        </button>
      )}
    </DialogRahmen>
  );
}

function KorrigierenDialog({
  anfrage,
  sendet,
  fehler,
  fokusZiel,
  onAbbrechen,
  onSenden,
  heute,
}: { anfrage: Extract<AusgabenDialogAnfrage, { art: "korrigieren" }> } & DialogBasis & { heute: string }) {
  const basis = useId();
  const texte = artTexte(anfrage.aufgabe.ausgabeArt);
  const [form, setForm] = useState<StueckFormular>(() => korrigierenStart(anfrage.stueck));
  const grund = korrigierenGrund(anfrage.stueck, form, heute);
  return (
    <DialogRahmen
      titel={texte.korrigieren}
      untertitel={untertitel(anfrage.bezug, anfrage.stueck.text)}
      name="ausgabe-korrigieren"
      sendet={sendet}
      fehler={fehler}
      fokusZiel={fokusZiel}
      onAbbrechen={onAbbrechen}
      mitPflichtfeldern
      bestaetigen={{
        text: AUSGABEN_DIALOG_TEXTE.KORRIGIEREN,
        grund,
        onClick: () => {
          const body = korrigierenBody(anfrage.stueck, form);
          if (body) onSenden(body);
        },
      }}
    >
      <p className="text-muted-foreground">{AUSGABEN_DIALOG_TEXTE.KORREKTUR_ERKLAERUNG}</p>
      <StueckFelder
        idBasis={basis}
        kennungLabel={anfrage.stueck.kennungLabel}
        datumLabel={texte.datum}
        wert={form}
        heute={heute}
        sendet={sendet}
        datumPflicht
        onAendern={(teil) => setForm((f) => ({ ...f, ...teil }))}
      />
    </DialogRahmen>
  );
}

function TauschenDialog({
  anfrage,
  sendet,
  fehler,
  fokusZiel,
  onAbbrechen,
  onSenden,
  heute,
}: { anfrage: Extract<AusgabenDialogAnfrage, { art: "tauschen" }> } & DialogBasis & { heute: string }) {
  const basis = useId();
  const texte = artTexte(anfrage.aufgabe.ausgabeArt);
  const [form, setForm] = useState<TauschFormular>(() => tauschenStart(heute));
  const grund = tauschenGrund(form, heute);
  const labels = Object.fromEntries(
    TAUSCH_GRUENDE.map((g) => [g, `${TAUSCH_WAHL[g].label} – ${TAUSCH_WAHL[g].folge}`]),
  ) as Record<TauschGrund, string>;
  return (
    <DialogRahmen
      titel="Stück tauschen"
      untertitel={untertitel(anfrage.bezug, anfrage.stueck.text)}
      name="ausgabe-tauschen"
      sendet={sendet}
      fehler={fehler}
      fokusZiel={fokusZiel}
      onAbbrechen={onAbbrechen}
      mitPflichtfeldern
      bestaetigen={{
        text: AUSGABEN_DIALOG_TEXTE.TAUSCHEN,
        grund,
        onClick: () => {
          const body = tauschenBody(anfrage.stueck, form);
          if (body) onSenden(body);
        },
      }}
    >
      <WahlFeld
        name={`${basis}-grund`}
        legende={AUSGABEN_DIALOG_TEXTE.TAUSCH_LEGENDE}
        werte={TAUSCH_GRUENDE}
        labels={labels}
        wert={form.grund}
        sendet={sendet}
        onAendern={(g) => setForm((f) => ({ ...f, grund: g }))}
      />
      <GebaeudewirtschaftHinweis
        zeigen={gebaeudewirtschaftNoetig({ schluessel: anfrage.aufgabe.schluessel, tauschGrund: form.grund })}
      />
      <div className="space-y-2">
        <p className="text-sm font-semibold text-foreground">{AUSGABEN_DIALOG_TEXTE.TAUSCH_NEU}</p>
        <StueckFelder
          idBasis={basis}
          kennungLabel={anfrage.stueck.kennungLabel}
          datumLabel={texte.datum}
          wert={form}
          heute={heute}
          sendet={sendet}
          onAendern={(teil) => setForm((f) => ({ ...f, ...teil }))}
        />
        <p className={HILFE}>{AUSGABEN_DIALOG_TEXTE.TAUSCH_ERKLAERUNG}</p>
      </div>
    </DialogRahmen>
  );
}

function ZuruecknehmenDialog({
  anfrage,
  sendet,
  fehler,
  fokusZiel,
  onAbbrechen,
  onSenden,
}: { anfrage: Extract<AusgabenDialogAnfrage, { art: "zurueckgenommen" }> } & DialogBasis) {
  const basis = useId();
  const zugang = anfrage.aufgabe.ausgabeArt === "SPERREN";
  const texte = artTexte(anfrage.aufgabe.ausgabeArt);
  // Ein Zugang kommt nur als „gesperrt“ zurueck (ZURUECK); ein Gegenstand braucht eine Wahl.
  const [zustand, setZustand] = useState<RueckgabeZustandStelle | "">(zugang ? "ZURUECK" : "");
  return (
    <DialogRahmen
      titel={texte.zuruecknehmenTitel}
      untertitel={untertitel(anfrage.bezug, anfrage.stueck.text)}
      name="ausgabe-zurueckgenommen"
      sendet={sendet}
      fehler={fehler}
      fokusZiel={fokusZiel}
      onAbbrechen={onAbbrechen}
      mitPflichtfeldern={!zugang}
      bestaetigen={{
        text: texte.zuruecknehmenTitel,
        grund: zustand ? null : AUSGABEN_DIALOG_TEXTE.ZUSTAND_FEHLT,
        onClick: () => {
          if (zustand) onSenden(zuruecknehmenBody(anfrage.stueck, zustand));
        },
      }}
    >
      <p className="text-muted-foreground">{AUSGABEN_DIALOG_TEXTE.RUECKNAHME_ERKLAERUNG}</p>
      {zugang ? (
        <p className="text-foreground">{AUSGABEN_DIALOG_TEXTE.SPERRUNG_SATZ}</p>
      ) : (
        <>
          <WahlFeld
            name={`${basis}-zustand`}
            legende={AUSGABEN_DIALOG_TEXTE.RUECKNAHME_LEGENDE}
            werte={RUECKGABE_ZUSTAENDE_STELLE}
            labels={RUECKNAHME_WAHL}
            wert={zustand}
            sendet={sendet}
            onAendern={setZustand}
          />
          <GebaeudewirtschaftHinweis zeigen={gebaeudewirtschaftNoetig({ schluessel: anfrage.aufgabe.schluessel, zustand })} />
        </>
      )}
    </DialogRahmen>
  );
}

function EntfernenDialog({
  anfrage,
  sendet,
  fehler,
  fokusZiel,
  onAbbrechen,
  onSenden,
}: { anfrage: Extract<AusgabenDialogAnfrage, { art: "entfernen" }> } & DialogBasis) {
  const texte = artTexte(anfrage.aufgabe.ausgabeArt);
  return (
    <DialogRahmen
      titel={texte.entfernen}
      untertitel={untertitel(anfrage.bezug, anfrage.stelleName)}
      name="ausgabe-entfernen"
      sendet={sendet}
      fehler={fehler}
      fokusZiel={fokusZiel}
      onAbbrechen={onAbbrechen}
      bestaetigen={{ text: AUSGABEN_DIALOG_TEXTE.ENTFERNEN, farbe: "rot", onClick: () => onSenden(entfernenBody(anfrage.stueck)) }}
    >
      <p className="text-foreground">{AUSGABEN_DIALOG_TEXTE.ENTFERNEN_SATZ(anfrage.stueck.text)}</p>
      <p className="text-muted-foreground">{AUSGABEN_DIALOG_TEXTE.ENTFERNEN_ERKLAERUNG(anfrage.aufgabe.ausgabeArt)}</p>
    </DialogRahmen>
  );
}

/** Der offene Dialog einer Ausgaben-Aktion — die Karte haelt nur die Anfrage. */
export function AusgabenDialog({ anfrage, heute, ...basis }: { anfrage: AusgabenDialogAnfrage } & DialogBasis) {
  // Der Tag beim Oeffnen genuegt: Ein Dialog ueber Mitternacht behaelt seine Vorgabe.
  const [tag] = useState(() => heute ?? heuteInBerlin());
  switch (anfrage.art) {
    case "vermerken":
      return <VermerkenDialog anfrage={anfrage} heute={tag} {...basis} />;
    case "korrigieren":
      return <KorrigierenDialog anfrage={anfrage} heute={tag} {...basis} />;
    case "tauschen":
      return <TauschenDialog anfrage={anfrage} heute={tag} {...basis} />;
    case "zurueckgenommen":
      return <ZuruecknehmenDialog anfrage={anfrage} {...basis} />;
    case "entfernen":
      return <EntfernenDialog anfrage={anfrage} {...basis} />;
    default: {
      const unbekannt: never = anfrage;
      void unbekannt;
      return null;
    }
  }
}
