"use client";

/**
 * Die Dialoge der Karte „Ausstattung & Zugänge“ im Reiter Checkliste
 * (Feinplan S16, Mockup 6.3) — alle ueber `DialogRahmen`
 * (src/components/unterlagen/dialog-rahmen.tsx):
 *
 *   HinzufuegenDialog       „Position hinzufügen…“: aus dem Katalog dieses
 *                           Vorgangs (`hinzufuegbar`) oder frei (Ja/Nein,
 *                           hoechstens 120 Zeichen); dieselbe Maske fuer
 *                           „Als Position übernehmen…“ eines Hinweises
 *   BearbeitenDialog        Auswahl, Angabe, Bemerkung, Stelle und Faelligkeit
 *                           je offener Aufgabe (Option)
 *   StreichenDialog         Rueckfrage „… entfällt für die Stelle“
 *   HinweisDialog           Hinweis an eine Stelle neu anlegen oder bearbeiten
 *                           (Text und Faelligkeit der Hinweis-Aufgabe, F20),
 *                           dazu „Hinweis entfernen…“
 *   HinweisEntfernenDialog  Rueckfrage zum Entfernen
 *
 * Wie im Hausmuster (position-dialog.tsx) ruft KEIN Dialog eine
 * Schnittstelle: Er baut den Body (`…Body`, rein und exportiert) und meldet
 * ihn an die Karte, die sendet und einen Fehler des Servers als `fehler`
 * zurueckgibt. Vor dem Senden prueft er mit denselben Regeln wie der Server
 * (`aenderungPruefen`, `hinweisAenderungPruefen` aus src/lib/ausstattung.ts,
 * dazu die Grenzen aus `GRENZEN`); deren Meldung steht als Grund am
 * gesperrten Knopf. Was nur der Server weiss (Katalog inzwischen geaendert,
 * gleichzeitige Aenderung), meldet er selbst.
 *
 * Portal: Texte ohne Anrede. Nur Farb-Tokens (neue Datei, Stand 0 in der
 * Sperrklinke). Unter jedem Bemerkungs- und Hinweisfeld steht
 * `BEMERKUNG_HINWEIS` (Plan, Abschnitt 10).
 */

import { useId, useState, type ReactNode } from "react";
import { DialogRahmen } from "@/components/unterlagen/dialog-rahmen";
import { ganzzahlAusText } from "@/components/ausstattung/position-dialog";
import { ablaufKalendertag, istKalendertag } from "@/lib/kalendertag";
import {
  ART_NAMEN,
  AUSSTATTUNG_KATEGORIE,
  BEMERKUNG_HINWEIS,
  GRENZEN,
  MELDUNGEN,
  aenderungPruefen,
  aenderungsGrundText,
  aufgabenStandText,
  hinweisAenderungPruefen,
  istAusstattungsArt,
  type AenderungsWunsch,
  type AusstattungsHinweis,
  type AusstattungsHinzufuegbar,
  type AusstattungsStelle,
  type AusstattungsZeile,
} from "@/lib/ausstattung";

// =============================================
// Body der Aktionen (POST /api/onboarding/[id]/ausstattung)
// =============================================

/** Eine freie Position von HR — immer Ja/Nein, ohne Hinweis fuer die Stelle (E-A13). */
export interface FreiePositionBody {
  departmentKey: string;
  bezeichnung: string;
  relativeDueDays?: number | null;
}

/** Was eine Hinzufuegen- bzw. Uebernehmen-Aktion an Wahl mitschickt (nur, was zur Art passt). */
interface WahlBody {
  positionId?: string;
  frei?: FreiePositionBody;
  auswahl?: string[];
  angabe?: string;
  bemerkung?: string;
}

/**
 * Die sechs Aktionen der Karte — dieselbe Form wie `ausstattungAktionSchema`
 * (src/lib/validations/ausstattung.ts); der Komponententest schickt jeden
 * gebauten Body durch das echte Schema.
 */
export type AusstattungAktionBody =
  | ({ aktion: "hinzufuegen" } & WahlBody)
  | ({ aktion: "hinweis-uebernehmen"; departmentKey: string } & WahlBody)
  | {
      aktion: "aendern";
      ausstattungId: string;
      auswahl?: string[];
      angabe?: string;
      bemerkung?: string;
      departmentKey?: string;
      faelligkeiten?: { option: string; dueDate: string | null }[];
    }
  | { aktion: "streichen"; ausstattungId: string }
  | { aktion: "hinweis-aendern"; departmentKey: string; hinweis?: string; dueDate?: string | null }
  | { aktion: "hinweis-gesehen"; departmentKey: string };

/** Texte nur der Dialoge (die uebrigen stehen in `MELDUNGEN`). */
export const DIALOG_TEXTE = {
  POSITION_WAEHLEN: "Bitte eine Position aus dem Katalog wählen.",
  KEINE_AENDERUNG: "Noch keine Änderung.",
  HINWEIS_FEHLT: "Bitte einen Hinweis eingeben.",
  HINWEIS_LEER: "Ein leerer Hinweis lässt sich nicht speichern. Zum Entfernen „Hinweis entfernen…“ wählen.",
  FAELLIG_TAGE_HILFE:
    "Tage relativ zum Vertragsbeginn, negativ = vorher (z. B. −7). Leer = ohne Fälligkeit. Liegt der Tag schon zurück, gilt heute.",
  FAELLIGKEIT_HILFE: "Leer = ohne Fälligkeit. Die Stelle erfährt eine neue Fälligkeit mit der nächsten E-Mail.",
} as const;

// =============================================
// Kleine Helfer
// =============================================

/** \r\n und \r werden \n, aussen getrimmt — wie der Server vor jeder Laengenpruefung. */
function normalisiert(text: string): string {
  return text.replace(/\r\n?/g, "\n").trim();
}

/** Eine Faelligkeit (ISO) als Wert eines Datumsfelds (`YYYY-MM-DD`), sonst "". */
export function datumFeldWert(iso: string | null | undefined): string {
  return ablaufKalendertag(iso) ?? "";
}

const EINGABE =
  "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ring focus:ring-1 focus:ring-ring disabled:opacity-60";
const LABEL = "mb-1 block text-sm font-medium text-foreground";
const HILFE = "mt-1 text-xs text-muted-foreground";
const KNOPF_KRITISCH =
  "rounded-md border border-credo-rot/40 px-2.5 py-1 text-xs text-credo-rot hover:bg-credo-rot/10 disabled:opacity-50";

function Pflicht() {
  return (
    <span className="text-credo-rot" aria-hidden="true">
      {" "}
      *
    </span>
  );
}

/** Kasten mit Text, der nur gelesen wird (Hinweis der Fuehrungskraft beim Uebernehmen). */
function LeseKasten({ titel, children }: { titel: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-muted px-3 py-2">
      <p className="text-xs font-medium text-muted-foreground">{titel}</p>
      <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-foreground">{children}</p>
    </div>
  );
}

/** Mehrzeiliges Freitextfeld (Bemerkung, Hinweis) mit `BEMERKUNG_HINWEIS` darunter. */
function FreitextFeld({
  id,
  label,
  wert,
  max,
  sendet,
  pflicht = false,
  onAendern,
}: {
  id: string;
  label: string;
  wert: string;
  max: number;
  sendet: boolean;
  pflicht?: boolean;
  onAendern: (wert: string) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className={LABEL}>
        {label}
        {pflicht && <Pflicht />}
      </label>
      <textarea
        id={id}
        rows={3}
        value={wert}
        disabled={sendet}
        required={pflicht}
        aria-required={pflicht ? "true" : undefined}
        aria-describedby={`${id}-hilfe`}
        onChange={(e) => onAendern(e.target.value)}
        className={EINGABE}
      />
      <p id={`${id}-hilfe`} className={HILFE}>
        {`${BEMERKUNG_HINWEIS} Höchstens ${max} Zeichen.`}
      </p>
    </div>
  );
}

/** Auswahl mehrerer Optionen als Kontrollkaestchen. `gesperrt` haelt eine Option fest (mit Grund daneben). */
function OptionenFeld({
  legende,
  optionen,
  gewaehlt,
  gesperrt = {},
  sendet,
  onAendern,
}: {
  legende: string;
  optionen: ReadonlyArray<string>;
  gewaehlt: ReadonlyArray<string>;
  /** Option → kurzer Grund, warum sie sich nicht abwaehlen laesst. */
  gesperrt?: Readonly<Record<string, string>>;
  sendet: boolean;
  onAendern: (neu: string[]) => void;
}) {
  return (
    <fieldset data-feld="optionen">
      <legend className={LABEL}>
        {legende}
        <Pflicht />
      </legend>
      <div className="space-y-1.5">
        {optionen.map((option) => {
          const an = gewaehlt.includes(option);
          const fest = gesperrt[option];
          return (
            <label key={option} className="flex items-start gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 shrink-0"
                checked={an}
                disabled={sendet || (an && !!fest)}
                onChange={(e) =>
                  onAendern(optionen.filter((o) => (o === option ? e.target.checked : gewaehlt.includes(o))))
                }
              />
              <span>
                {option}
                {an && fest && <span className="block text-xs text-muted-foreground">{fest}</span>}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Auswahl einer Stelle (freie Position, Stellenwechsel, neuer Hinweis). */
function StellenFeld({
  id,
  label,
  wert,
  stellen,
  sendet,
  hilfe,
  onAendern,
}: {
  id: string;
  label: string;
  wert: string;
  stellen: ReadonlyArray<AusstattungsStelle>;
  sendet: boolean;
  hilfe?: string;
  onAendern: (wert: string) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className={LABEL}>
        {label}
        <Pflicht />
      </label>
      <select
        id={id}
        value={wert}
        disabled={sendet}
        required
        aria-required="true"
        aria-describedby={hilfe ? `${id}-hilfe` : undefined}
        onChange={(e) => onAendern(e.target.value)}
        className={EINGABE}
      >
        <option value="">Bitte wählen…</option>
        {stellen.map((s) => (
          <option key={s.departmentKey} value={s.departmentKey}>
            {s.adresseFehlt ? `${s.name} (ohne Adresse am Arbeitsort)` : s.name}
          </option>
        ))}
      </select>
      {hilfe && (
        <p id={`${id}-hilfe`} className={HILFE}>
          {hilfe}
        </p>
      )}
    </div>
  );
}

/** Die waehlbaren Stellen samt der aktuellen, falls sie (z. B. als alter Schluessel) nicht mehr dabei ist. */
function stellenMit(stellen: ReadonlyArray<AusstattungsStelle>, key: string, name: string): AusstattungsStelle[] {
  return stellen.some((s) => s.departmentKey === key) || !key
    ? [...stellen]
    : [...stellen, { departmentKey: key, name, adresseFehlt: false }];
}

// =============================================
// Hinzufuegen (Katalog oder frei) und „Als Position übernehmen…“
// =============================================

/** Die Eingaben des Dialogs „Position hinzufügen…“ — Texte, wie sie im Feld stehen. */
export interface HinzufuegenFormular {
  quelle: "katalog" | "frei";
  positionId: string;
  auswahl: string[];
  angabe: string;
  bemerkung: string;
  freiStelle: string;
  freiBezeichnung: string;
  /** Tage relativ zum Vertragsbeginn, "" = ohne Faelligkeit. */
  freiTage: string;
}

/** Startwerte: aus dem Katalog, solange er etwas anbietet; die Stelle einer freien Position vorbelegt (Hinweis). */
export function hinzufuegenStart(
  hinzufuegbar: ReadonlyArray<AusstattungsHinzufuegbar>,
  vorgabeStelle = "",
): HinzufuegenFormular {
  return {
    quelle: hinzufuegbar.length > 0 ? "katalog" : "frei",
    positionId: "",
    auswahl: [],
    angabe: "",
    bemerkung: "",
    freiStelle: vorgabeStelle,
    freiBezeichnung: "",
    freiTage: "",
  };
}

function katalogPosition(
  f: HinzufuegenFormular,
  hinzufuegbar: ReadonlyArray<AusstattungsHinzufuegbar>,
): AusstattungsHinzufuegbar | null {
  return f.quelle === "katalog" ? (hinzufuegbar.find((p) => p.positionId === f.positionId) ?? null) : null;
}

/** Warum der Dialog noch nicht senden kann — `null` = er kann. */
export function hinzufuegenGrund(
  f: HinzufuegenFormular,
  hinzufuegbar: ReadonlyArray<AusstattungsHinzufuegbar>,
): string | null {
  const bemerkung = normalisiert(f.bemerkung);
  if (f.quelle === "katalog") {
    const p = katalogPosition(f, hinzufuegbar);
    if (!p) return DIALOG_TEXTE.POSITION_WAEHLEN;
    if (p.art === "AUSWAHL" && !p.optionen.some((o) => f.auswahl.includes(o))) return MELDUNGEN.KARTE_AUSWAHL_LEER;
    if (p.art === "ANGABE") {
      const angabe = normalisiert(f.angabe);
      if (!angabe) return MELDUNGEN.KARTE_ANGABE_LEER;
      if (angabe.length > GRENZEN.angabe) return MELDUNGEN.ANGABE_ZU_LANG;
      return null;
    }
  } else {
    if (!f.freiStelle) return MELDUNGEN.STELLE_FEHLT;
    const bezeichnung = f.freiBezeichnung.trim();
    if (!bezeichnung) return MELDUNGEN.BEZEICHNUNG_FEHLT;
    if (bezeichnung.length > GRENZEN.freieBezeichnung) return MELDUNGEN.KARTE_FREI_ZU_LANG;
    const tage = ganzzahlAusText(f.freiTage);
    if (tage !== null && (!Number.isInteger(tage) || Math.abs(tage) > GRENZEN.faelligTage)) {
      return MELDUNGEN.FAELLIG_UNGUELTIG;
    }
  }
  if (bemerkung.length > GRENZEN.bemerkung) return MELDUNGEN.BEMERKUNG_ZU_LANG;
  return null;
}

/**
 * Der Body: aus dem Katalog nur, was zur Art passt (Optionen in der Reihenfolge
 * des Katalogs, Angabe getrimmt, Bemerkung nur, wenn eine da ist); frei immer
 * Ja/Nein. Mit `hinweisVon` wird daraus „hinweis-uebernehmen“.
 */
export function hinzufuegenBody(
  f: HinzufuegenFormular,
  hinzufuegbar: ReadonlyArray<AusstattungsHinzufuegbar>,
  hinweisVon?: string,
): AusstattungAktionBody {
  const bemerkung = normalisiert(f.bemerkung);
  const wahl: WahlBody = {};
  const p = katalogPosition(f, hinzufuegbar);
  if (p) {
    wahl.positionId = p.positionId;
    if (p.art === "AUSWAHL") wahl.auswahl = p.optionen.filter((o) => f.auswahl.includes(o));
    if (p.art === "ANGABE") wahl.angabe = normalisiert(f.angabe);
    else if (bemerkung) wahl.bemerkung = bemerkung;
  } else {
    const tage = ganzzahlAusText(f.freiTage);
    wahl.frei = {
      departmentKey: f.freiStelle,
      bezeichnung: f.freiBezeichnung.trim(),
      ...(tage !== null ? { relativeDueDays: tage } : {}),
    };
    if (bemerkung) wahl.bemerkung = bemerkung;
  }
  return hinweisVon
    ? { aktion: "hinweis-uebernehmen", departmentKey: hinweisVon, ...wahl }
    : { aktion: "hinzufuegen", ...wahl };
}

export interface HinzufuegenDialogProps {
  hinzufuegbar: ReadonlyArray<AusstattungsHinzufuegbar>;
  stellen: ReadonlyArray<AusstattungsStelle>;
  /** Nur bei „Als Position übernehmen…“: der Hinweis, aus dem die Position wird. */
  hinweis?: { departmentKey: string; stelleName: string; text: string; quelleLabel: string } | null;
  sendet: boolean;
  fehler: string | null;
  fokusZiel?: string;
  onAbbrechen: () => void;
  onSenden: (body: AusstattungAktionBody) => void;
}

export function HinzufuegenDialog({
  hinzufuegbar,
  stellen,
  hinweis,
  sendet,
  fehler,
  fokusZiel,
  onAbbrechen,
  onSenden,
}: HinzufuegenDialogProps) {
  const id = useId();
  const [f, setF] = useState<HinzufuegenFormular>(() => hinzufuegenStart(hinzufuegbar, hinweis?.departmentKey));
  const setze = (teil: Partial<HinzufuegenFormular>) => setF((alt) => ({ ...alt, ...teil }));
  const grund = hinzufuegenGrund(f, hinzufuegbar);
  const p = katalogPosition(f, hinzufuegbar);
  const stelleName = (key: string) => stellen.find((s) => s.departmentKey === key)?.name ?? key;
  // Katalogpositionen je Stelle, in der Reihenfolge der Uebersicht.
  const gruppen = [...new Set(hinzufuegbar.map((x) => x.departmentKey))].map((key) => ({
    key,
    positionen: hinzufuegbar.filter((x) => x.departmentKey === key),
  }));

  return (
    <DialogRahmen
      titel={hinweis ? "Hinweis als Position übernehmen" : "Position hinzufügen"}
      untertitel={
        hinweis
          ? `${hinweis.stelleName} · der Hinweis bleibt bestehen und steht weiter auf der Aufgabenseite der Stelle.`
          : `Die Position wird eine Aufgabe in „${AUSSTATTUNG_KATEGORIE}“, bei einer Auswahl je Option eine.`
      }
      name="ausstattung-hinzufuegen"
      sendet={sendet}
      fehler={fehler}
      fokusZiel={fokusZiel}
      onAbbrechen={onAbbrechen}
      mitPflichtfeldern
      bestaetigen={{
        text: hinweis ? "Übernehmen" : "Hinzufügen",
        onClick: () => onSenden(hinzufuegenBody(f, hinzufuegbar, hinweis?.departmentKey)),
        grund,
        farbe: "blau",
      }}
    >
      {hinweis && <LeseKasten titel={hinweis.quelleLabel}>{hinweis.text}</LeseKasten>}

      {hinzufuegbar.length > 0 && (
        <fieldset>
          <legend className={LABEL}>Woher</legend>
          <div className="flex flex-wrap gap-4 text-sm text-foreground">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name={`${id}-quelle`}
                checked={f.quelle === "katalog"}
                disabled={sendet}
                onChange={() => setze({ quelle: "katalog" })}
              />
              Aus dem Katalog
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name={`${id}-quelle`}
                checked={f.quelle === "frei"}
                disabled={sendet}
                onChange={() => setze({ quelle: "frei" })}
              />
              Freie Position
            </label>
          </div>
        </fieldset>
      )}

      {f.quelle === "katalog" ? (
        <>
          <div>
            <label htmlFor={`${id}-position`} className={LABEL}>
              Position
              <Pflicht />
            </label>
            <select
              id={`${id}-position`}
              value={f.positionId}
              disabled={sendet}
              required
              aria-required="true"
              onChange={(e) => setze({ positionId: e.target.value, auswahl: [], angabe: "" })}
              className={EINGABE}
            >
              <option value="">Bitte wählen…</option>
              {gruppen.map((g) => (
                <optgroup key={g.key} label={stelleName(g.key)}>
                  {g.positionen.map((x) => (
                    <option key={x.positionId} value={x.positionId}>
                      {x.art === "ANGABE" ? `Angabe: ${x.bezeichnung}` : x.bezeichnung}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          {p?.art === "AUSWAHL" && (
            <OptionenFeld
              legende="Optionen (je Option eine Aufgabe)"
              optionen={p.optionen}
              gewaehlt={f.auswahl}
              sendet={sendet}
              onAendern={(auswahl) => setze({ auswahl })}
            />
          )}
          {p?.art === "ANGABE" && (
            <div>
              <label htmlFor={`${id}-angabe`} className={LABEL}>
                {p.bezeichnung}
                <Pflicht />
              </label>
              <input
                id={`${id}-angabe`}
                type="text"
                value={f.angabe}
                maxLength={GRENZEN.angabe}
                disabled={sendet}
                required
                aria-required="true"
                aria-describedby={`${id}-angabe-hilfe`}
                onChange={(e) => setze({ angabe: e.target.value })}
                className={EINGABE}
              />
              <p id={`${id}-angabe-hilfe`} className={HILFE}>
                Eine Angabe wird keine Aufgabe; die Stelle sieht sie bei ihren Aufgaben.
              </p>
            </div>
          )}
        </>
      ) : (
        <>
          <StellenFeld
            id={`${id}-stelle`}
            label="Stelle"
            wert={f.freiStelle}
            stellen={stellen}
            sendet={sendet}
            hilfe="Für die Personalabteilung (HR) wird die Aufgabe im Portal erledigt, ohne Link."
            onAendern={(freiStelle) => setze({ freiStelle })}
          />
          <div>
            <label htmlFor={`${id}-bezeichnung`} className={LABEL}>
              Bezeichnung
              <Pflicht />
            </label>
            <input
              id={`${id}-bezeichnung`}
              type="text"
              value={f.freiBezeichnung}
              maxLength={GRENZEN.freieBezeichnung}
              disabled={sendet}
              required
              aria-required="true"
              aria-describedby={`${id}-bezeichnung-hilfe`}
              onChange={(e) => setze({ freiBezeichnung: e.target.value })}
              placeholder="z. B. Dienst-Laptop / PC"
              className={EINGABE}
            />
            <p id={`${id}-bezeichnung-hilfe`} className={HILFE}>
              {`Wird zum Aufgabentitel „… bereitstellen“ (höchstens ${GRENZEN.freieBezeichnung} Zeichen, kein Freitext über die Person – der Titel steht auch in E-Mails).`}
            </p>
          </div>
          <div>
            <label htmlFor={`${id}-tage`} className={LABEL}>
              Fällig (Tage)
            </label>
            <input
              id={`${id}-tage`}
              type="text"
              inputMode="numeric"
              value={f.freiTage}
              disabled={sendet}
              aria-describedby={`${id}-tage-hilfe`}
              onChange={(e) => setze({ freiTage: e.target.value })}
              placeholder="z. B. -7"
              className={EINGABE}
            />
            <p id={`${id}-tage-hilfe`} className={HILFE}>
              {DIALOG_TEXTE.FAELLIG_TAGE_HILFE}
            </p>
          </div>
        </>
      )}

      {p?.art !== "ANGABE" && (
        <FreitextFeld
          id={`${id}-bemerkung`}
          label="Bemerkung der Personalabteilung"
          wert={f.bemerkung}
          max={GRENZEN.bemerkung}
          sendet={sendet}
          onAendern={(bemerkung) => setze({ bemerkung })}
        />
      )}
    </DialogRahmen>
  );
}

// =============================================
// Bearbeiten
// =============================================

/** Die Eingaben des Dialogs „Bearbeiten…“. */
export interface BearbeitenFormular {
  auswahl: string[];
  angabe: string;
  bemerkung: string;
  stelle: string;
  /** Option ("" = ganze Position) → `YYYY-MM-DD` bzw. "" (ohne Faelligkeit); nur offene Aufgaben. */
  faelligkeiten: Record<string, string>;
}

/** Startwerte aus der Zeile der Uebersicht. */
export function bearbeitenStart(zeile: AusstattungsZeile, departmentKey: string): BearbeitenFormular {
  const faelligkeiten: Record<string, string> = {};
  for (const a of zeile.aufgaben) if (a.status === "offen") faelligkeiten[a.option] = datumFeldWert(a.faelligAm);
  return {
    auswahl: [...zeile.auswahl],
    angabe: zeile.angabe?.wert ?? "",
    bemerkung: zeile.bemerkung?.text ?? "",
    stelle: departmentKey,
    faelligkeiten,
  };
}

/**
 * Was sich gegenueber der Zeile geaendert hat — als Body (nur geaenderte
 * Felder) und als Wunsch fuer `aenderungPruefen` (dieselbe Pruefung wie der
 * Server). Eine geleerte Bemerkung geht als "" hinaus (entfernt sie).
 */
export function bearbeitenAenderung(
  zeile: AusstattungsZeile,
  departmentKey: string,
  f: BearbeitenFormular,
): { body: Extract<AusstattungAktionBody, { aktion: "aendern" }>; wunsch: AenderungsWunsch; geaendert: boolean } {
  const body: Extract<AusstattungAktionBody, { aktion: "aendern" }> = { aktion: "aendern", ausstattungId: zeile.id };
  const wunsch: AenderungsWunsch = {};
  let geaendert = false;

  if (zeile.art === "AUSWAHL") {
    const neu = zeile.optionen.filter((o) => f.auswahl.includes(o));
    const abwaehlen = zeile.auswahl.filter((o) => !neu.includes(o));
    const hinzu = neu.filter((o) => !zeile.auswahl.includes(o));
    if (abwaehlen.length > 0 || hinzu.length > 0) {
      body.auswahl = neu;
      wunsch.abwaehlen = abwaehlen;
      wunsch.hinzu = hinzu;
      geaendert = true;
    }
  }
  if (zeile.art === "ANGABE") {
    const angabe = normalisiert(f.angabe);
    if (angabe !== (zeile.angabe?.wert ?? "")) {
      body.angabe = angabe;
      wunsch.angabe = true;
      geaendert = true;
    }
  } else {
    const bemerkung = normalisiert(f.bemerkung);
    if (bemerkung !== (zeile.bemerkung?.text ?? "")) {
      body.bemerkung = bemerkung;
      wunsch.bemerkung = true;
      geaendert = true;
    }
  }
  if (f.stelle && f.stelle !== departmentKey) {
    body.departmentKey = f.stelle;
    wunsch.stelle = true;
    geaendert = true;
  }
  // Eine abgewaehlte Option bekommt keine neue Faelligkeit mehr — ihre Aufgabe
  // verschwindet bzw. entfaellt in derselben Aktion.
  const faelligkeiten = zeile.aufgaben
    .filter((a) => a.status === "offen" && a.option in f.faelligkeiten && !(wunsch.abwaehlen ?? []).includes(a.option))
    .filter((a) => (f.faelligkeiten[a.option] ?? "") !== datumFeldWert(a.faelligAm))
    .map((a) => ({ option: a.option, dueDate: f.faelligkeiten[a.option] || null }));
  if (faelligkeiten.length > 0) {
    body.faelligkeiten = faelligkeiten;
    wunsch.faelligkeiten = faelligkeiten.map((x) => x.option);
    geaendert = true;
  }
  return { body, wunsch, geaendert };
}

/** Warum „Speichern“ gesperrt ist — `null` = es geht. */
export function bearbeitenGrund(zeile: AusstattungsZeile, departmentKey: string, f: BearbeitenFormular): string | null {
  if (zeile.art === "AUSWAHL" && !zeile.optionen.some((o) => f.auswahl.includes(o))) return MELDUNGEN.KARTE_AUSWAHL_LEER;
  if (zeile.art === "ANGABE") {
    const angabe = normalisiert(f.angabe);
    if (!angabe) return MELDUNGEN.KARTE_ANGABE_LEER;
    if (angabe.length > GRENZEN.angabe) return MELDUNGEN.ANGABE_ZU_LANG;
  } else if (normalisiert(f.bemerkung).length > GRENZEN.bemerkung) {
    return MELDUNGEN.BEMERKUNG_ZU_LANG;
  }
  if (!f.stelle) return MELDUNGEN.STELLE_FEHLT;
  if (Object.values(f.faelligkeiten).some((tag) => tag !== "" && !istKalendertag(tag))) {
    return MELDUNGEN.KARTE_DATUM_UNGUELTIG;
  }
  const { wunsch, geaendert } = bearbeitenAenderung(zeile, departmentKey, f);
  const regel = aenderungPruefen({ art: zeile.art }, zeile.aufgaben, wunsch);
  if (regel) return aenderungsGrundText(regel);
  return geaendert ? null : DIALOG_TEXTE.KEINE_AENDERUNG;
}

export interface BearbeitenDialogProps {
  zeile: AusstattungsZeile;
  departmentKey: string;
  stelleName: string;
  stellen: ReadonlyArray<AusstattungsStelle>;
  sendet: boolean;
  fehler: string | null;
  fokusZiel?: string;
  onAbbrechen: () => void;
  onSenden: (body: AusstattungAktionBody) => void;
}

export function BearbeitenDialog({
  zeile,
  departmentKey,
  stelleName,
  stellen,
  sendet,
  fehler,
  fokusZiel,
  onAbbrechen,
  onSenden,
}: BearbeitenDialogProps) {
  const id = useId();
  const [f, setF] = useState<BearbeitenFormular>(() => bearbeitenStart(zeile, departmentKey));
  const setze = (teil: Partial<BearbeitenFormular>) => setF((alt) => ({ ...alt, ...teil }));
  const grund = bearbeitenGrund(zeile, departmentKey, f);
  const offene = zeile.aufgaben.filter((a) => a.status === "offen");
  // Eine Option mit erledigter Aufgabe laesst sich nicht abwaehlen (Regel 9) — das Kaestchen bleibt fest.
  const fest: Record<string, string> = {};
  for (const a of zeile.aufgaben) if (a.status === "erledigt") fest[a.option] = aufgabenStandText(a);
  const art = istAusstattungsArt(zeile.art) ? ART_NAMEN[zeile.art] : zeile.art;

  return (
    <DialogRahmen
      titel={`„${zeile.angabe?.label ?? zeile.bezeichnung}“ bearbeiten`}
      untertitel={`${stelleName} · ${art}`}
      name="ausstattung-bearbeiten"
      sendet={sendet}
      fehler={fehler}
      fokusZiel={fokusZiel}
      onAbbrechen={onAbbrechen}
      mitPflichtfeldern
      bestaetigen={{ text: "Speichern", onClick: () => onSenden(bearbeitenAenderung(zeile, departmentKey, f).body), grund, farbe: "blau" }}
    >
      {zeile.art === "AUSWAHL" && (
        <OptionenFeld
          legende="Optionen (je Option eine Aufgabe)"
          optionen={zeile.optionen}
          gewaehlt={f.auswahl}
          gesperrt={fest}
          sendet={sendet}
          onAendern={(auswahl) => setze({ auswahl })}
        />
      )}

      {zeile.art === "ANGABE" ? (
        <div>
          <label htmlFor={`${id}-angabe`} className={LABEL}>
            {zeile.angabe?.label ?? zeile.bezeichnung}
            <Pflicht />
          </label>
          <input
            id={`${id}-angabe`}
            type="text"
            value={f.angabe}
            maxLength={GRENZEN.angabe}
            disabled={sendet}
            required
            aria-required="true"
            onChange={(e) => setze({ angabe: e.target.value })}
            className={EINGABE}
          />
        </div>
      ) : (
        <FreitextFeld
          id={`${id}-bemerkung`}
          label={zeile.bemerkung?.label ?? "Bemerkung"}
          wert={f.bemerkung}
          max={GRENZEN.bemerkung}
          sendet={sendet}
          onAendern={(bemerkung) => setze({ bemerkung })}
        />
      )}

      <StellenFeld
        id={`${id}-stelle`}
        label="Zuständige Stelle"
        wert={f.stelle}
        stellen={stellenMit(stellen, departmentKey, stelleName)}
        sendet={sendet}
        hilfe="Offene Aufgaben ziehen mit. Eine schon informierte Stelle erfährt davon mit „Nachtrag senden“."
        onAendern={(stelle) => setze({ stelle })}
      />

      {offene.length > 0 && (
        <fieldset data-feld="faelligkeiten">
          <legend className={LABEL}>Fälligkeit</legend>
          <div className="space-y-2">
            {offene.map((a) => {
              const feld = `${id}-faellig-${zeile.aufgaben.indexOf(a)}`;
              return (
                <div key={a.option || "ganz"} className="grid grid-cols-1 items-center gap-1 sm:grid-cols-2 sm:gap-3">
                  <label htmlFor={feld} className="text-sm text-foreground">
                    {/* Eindeutiger Name: Die Option heisst oben schon das Kaestchen der Auswahl. */}
                    <span className="sr-only">Fälligkeit </span>
                    {a.option || a.titel}
                  </label>
                  <input
                    id={feld}
                    type="date"
                    value={f.faelligkeiten[a.option] ?? ""}
                    disabled={sendet}
                    aria-describedby={`${id}-faellig-hilfe`}
                    onChange={(e) => setze({ faelligkeiten: { ...f.faelligkeiten, [a.option]: e.target.value } })}
                    className={EINGABE}
                  />
                </div>
              );
            })}
          </div>
          <p id={`${id}-faellig-hilfe`} className={HILFE}>
            {DIALOG_TEXTE.FAELLIGKEIT_HILFE}
          </p>
        </fieldset>
      )}
    </DialogRahmen>
  );
}

// =============================================
// Streichen (Rueckfrage)
// =============================================

export function streichenBody(zeile: Pick<AusstattungsZeile, "id">): AusstattungAktionBody {
  return { aktion: "streichen", ausstattungId: zeile.id };
}

export function StreichenDialog({
  zeile,
  stelleName,
  sendet,
  fehler,
  fokusZiel,
  onAbbrechen,
  onSenden,
}: {
  zeile: AusstattungsZeile;
  stelleName: string;
  sendet: boolean;
  fehler: string | null;
  fokusZiel?: string;
  onAbbrechen: () => void;
  onSenden: (body: AusstattungAktionBody) => void;
}) {
  return (
    <DialogRahmen
      titel={`„${zeile.angabe?.label ?? zeile.bezeichnung}“ streichen?`}
      untertitel={stelleName}
      name="ausstattung-streichen"
      sendet={sendet}
      fehler={fehler}
      fokusZiel={fokusZiel}
      onAbbrechen={onAbbrechen}
      bestaetigen={{ text: "Streichen", onClick: () => onSenden(streichenBody(zeile)), farbe: "rot" }}
    >
      <p className="text-foreground">{`Die Position entfällt für die Stelle ${stelleName}.`}</p>
      <p className="text-muted-foreground">
        Hat die Stelle sie noch nicht per E-Mail erhalten, verschwindet sie ganz. Sonst bleibt sie auf ihrer
        Aufgabenseite mit „entfällt“ stehen; davon erfährt sie mit „Nachtrag senden“.
      </p>
    </DialogRahmen>
  );
}

// =============================================
// Hinweis an eine Stelle: neu anlegen, bearbeiten, entfernen
// =============================================

/** Die Eingaben des Hinweis-Dialogs. */
export interface HinweisFormular {
  stelle: string;
  text: string;
  /** `YYYY-MM-DD` bzw. "" — nur bei offener Hinweis-Aufgabe. */
  faellig: string;
}

export function hinweisStart(departmentKey: string, hinweis: AusstattungsHinweis | null): HinweisFormular {
  return {
    stelle: departmentKey,
    text: hinweis?.text ?? "",
    faellig: hinweis?.status === "offen" ? datumFeldWert(hinweis.faelligAm) : "",
  };
}

/** Body des Hinweis-Dialogs: nur geaenderte Felder (`hinweis`, `dueDate`). `null` = nichts geaendert. */
export function hinweisBody(hinweis: AusstattungsHinweis | null, f: HinweisFormular): AusstattungAktionBody | null {
  const text = normalisiert(f.text);
  const textGeaendert = text !== (hinweis?.text ?? "");
  const faelligGeaendert = hinweis?.status === "offen" && f.faellig !== datumFeldWert(hinweis.faelligAm);
  if (!textGeaendert && !faelligGeaendert) return null;
  return {
    aktion: "hinweis-aendern",
    departmentKey: f.stelle,
    ...(textGeaendert ? { hinweis: text } : {}),
    ...(faelligGeaendert ? { dueDate: f.faellig || null } : {}),
  };
}

/** Warum „Speichern“ gesperrt ist — `null` = es geht. */
export function hinweisGrund(hinweis: AusstattungsHinweis | null, f: HinweisFormular): string | null {
  if (!f.stelle) return MELDUNGEN.STELLE_FEHLT;
  const text = normalisiert(f.text);
  if (!text) return hinweis ? DIALOG_TEXTE.HINWEIS_LEER : DIALOG_TEXTE.HINWEIS_FEHLT;
  if (text.length > GRENZEN.hinweis) return MELDUNGEN.HINWEIS_ZU_LANG;
  if (f.faellig !== "" && !istKalendertag(f.faellig)) return MELDUNGEN.KARTE_DATUM_UNGUELTIG;
  const body = hinweisBody(hinweis, f);
  if (!body) return DIALOG_TEXTE.KEINE_AENDERUNG;
  const regel =
    body.aktion === "hinweis-aendern"
      ? hinweisAenderungPruefen(
          hinweis ? { text: hinweis.text } : null,
          hinweis?.status ? { status: hinweis.status } : null,
          { text: body.hinweis !== undefined, dueDate: body.dueDate !== undefined },
        )
      : null;
  return regel ? aenderungsGrundText(regel) : null;
}

export interface HinweisDialogProps {
  /** Bearbeiten: Stelle und Hinweis; neu: `null` (Stelle waehlbar). */
  bestand: { departmentKey: string; stelleName: string; hinweis: AusstattungsHinweis } | null;
  /** Neu: Stellen, die noch keinen Hinweis haben. */
  stellen: ReadonlyArray<AusstattungsStelle>;
  sendet: boolean;
  fehler: string | null;
  fokusZiel?: string;
  onAbbrechen: () => void;
  onSenden: (body: AusstattungAktionBody) => void;
  /** „Hinweis entfernen…“ — die Karte oeffnet die Rueckfrage. */
  onEntfernen?: () => void;
}

export function HinweisDialog({
  bestand,
  stellen,
  sendet,
  fehler,
  fokusZiel,
  onAbbrechen,
  onSenden,
  onEntfernen,
}: HinweisDialogProps) {
  const id = useId();
  const hinweis = bestand?.hinweis ?? null;
  const [f, setF] = useState<HinweisFormular>(() => hinweisStart(bestand?.departmentKey ?? "", hinweis));
  const setze = (teil: Partial<HinweisFormular>) => setF((alt) => ({ ...alt, ...teil }));
  const grund = hinweisGrund(hinweis, f);
  const body = hinweisBody(hinweis, f);

  return (
    <DialogRahmen
      titel={bestand ? `Hinweis an ${bestand.stelleName} bearbeiten` : "Hinweis an eine Stelle"}
      untertitel={
        bestand
          ? hinweis?.quelleLabel
          : "Die Stelle bekommt dazu die Aufgabe „Hinweis der Führungskraft beachten“ und liest den Hinweis auf ihrer Aufgabenseite."
      }
      name="ausstattung-hinweis"
      sendet={sendet}
      fehler={fehler}
      fokusZiel={fokusZiel}
      onAbbrechen={onAbbrechen}
      mitPflichtfeldern
      bestaetigen={{ text: "Speichern", onClick: () => body && onSenden(body), grund, farbe: "blau" }}
    >
      {!bestand && (
        <StellenFeld
          id={`${id}-stelle`}
          label="Stelle"
          wert={f.stelle}
          stellen={stellen}
          sendet={sendet}
          onAendern={(stelle) => setze({ stelle })}
        />
      )}
      <FreitextFeld
        id={`${id}-text`}
        label="Hinweis an die Stelle"
        wert={f.text}
        max={GRENZEN.hinweis}
        sendet={sendet}
        pflicht
        onAendern={(text) => setze({ text })}
      />
      {hinweis?.status === "offen" && (
        <div>
          <label htmlFor={`${id}-faellig`} className={LABEL}>
            Fälligkeit der Aufgabe „Hinweis der Führungskraft beachten“
          </label>
          <input
            id={`${id}-faellig`}
            type="date"
            value={f.faellig}
            disabled={sendet}
            aria-describedby={`${id}-faellig-hilfe`}
            onChange={(e) => setze({ faellig: e.target.value })}
            className={EINGABE}
          />
          <p id={`${id}-faellig-hilfe`} className={HILFE}>
            {DIALOG_TEXTE.FAELLIGKEIT_HILFE}
          </p>
        </div>
      )}
      {bestand && onEntfernen && (
        <div>
          <button type="button" className={KNOPF_KRITISCH} disabled={sendet} onClick={onEntfernen}>
            Hinweis entfernen…
          </button>
        </div>
      )}
    </DialogRahmen>
  );
}

export function hinweisEntfernenBody(departmentKey: string): AusstattungAktionBody {
  return { aktion: "hinweis-aendern", departmentKey, hinweis: "" };
}

export function HinweisEntfernenDialog({
  departmentKey,
  stelleName,
  sendet,
  fehler,
  fokusZiel,
  onAbbrechen,
  onSenden,
}: {
  departmentKey: string;
  stelleName: string;
  sendet: boolean;
  fehler: string | null;
  fokusZiel?: string;
  onAbbrechen: () => void;
  onSenden: (body: AusstattungAktionBody) => void;
}) {
  return (
    <DialogRahmen
      titel={`Hinweis an ${stelleName} entfernen?`}
      name="ausstattung-hinweis-entfernen"
      sendet={sendet}
      fehler={fehler}
      fokusZiel={fokusZiel}
      onAbbrechen={onAbbrechen}
      bestaetigen={{ text: "Entfernen", onClick: () => onSenden(hinweisEntfernenBody(departmentKey)), farbe: "rot" }}
    >
      <p className="text-foreground">
        Hat die Stelle den Hinweis schon per E-Mail erhalten, entfällt für sie die Aufgabe „Hinweis der
        Führungskraft beachten“; davon erfährt sie mit „Nachtrag senden“. Sonst verschwindet die Aufgabe ganz.
      </p>
    </DialogRahmen>
  );
}
