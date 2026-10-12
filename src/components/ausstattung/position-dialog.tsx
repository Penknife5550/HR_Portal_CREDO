"use client";

/**
 * Einstellungen → Ausstattung & Zugänge: Dialog „Neue Position“ bzw.
 * „Position … bearbeiten“ (Feinplan S4, Mockup 6.7).
 *
 * Die Felder wechseln mit der Art:
 *   - Ja/Nein: „Im Formular vorausgewählt“, Aufgabe, Fälligkeit, Bemerkung;
 *   - Auswahl: Optionen eine je Zeile, vorausgewählte Optionen als Chips,
 *     Aufgabe (je Option eine), Fälligkeit, Bemerkung;
 *   - Angabe: nur aus der festen Liste (ANGABEN_KATALOG, E-A13), Bezeichnung =
 *     deren Label, „Sichtbar auch für“ — keine Aufgabe, keine Fälligkeit, keine
 *     Bemerkung.
 * Gilt für (zentral mit Einrichtungsarten oder eine Einrichtung),
 * Personengruppen als Chips, „entgeltrelevant“ (nur Stelle HR), Reihenfolge.
 * Die Stufe-2-Felder (Ausgabekennung, Rückgabekategorie, Verhalten beim
 * Austritt) zeigt der Dialog bewusst NICHT — sie schreibt bis A4 niemand.
 *
 * Gesendet wird immer das ganze Formular (`entwurfAusFormular`): Was zur Art
 * nicht passt, geht leer hinaus, getippte Werte bleiben aber im Formular, bis
 * es schliesst (Art hin und zurueck verliert nichts). Vor dem Senden prueft
 * `positionPruefen` — dieselbe Funktion wie der Server; ihre Meldung steht als
 * Grund am gesperrten Knopf. Was nur Zod prueft (spitze Klammern,
 * Steuerzeichen), meldet der Server; die Karte gibt seinen Text als `fehler`
 * zurueck.
 *
 * Der Dialog ruft KEINE Schnittstelle (Muster DialogRahmen): Er meldet den
 * Body an den Reiter (`onSpeichern`), der sendet.
 *
 * Barrierefreiheit wie im Hausmuster nachforderung-dialog.tsx: Pflichtfelder
 * tragen `required` und `aria-required` (das Sternchen ist nur Zierde,
 * `aria-hidden`), jeder Hilfetext unter einem Feld haengt per
 * `aria-describedby` daran — sonst hoerte niemand, dass „Fällig (Tage)“ relativ
 * zum Vertragsbeginn zaehlt und negativ „vorher“ heisst.
 */

import { useId, useState, type ReactNode } from "react";
import { DialogRahmen } from "@/components/unterlagen/dialog-rahmen";
import {
  ANGABE_SCHLUESSEL,
  ANGABEN_KATALOG,
  ART_NAMEN,
  AUSSTATTUNG_ARTEN,
  EINRICHTUNGSARTEN,
  GRENZEN,
  MELDUNGEN,
  PERSONENGRUPPEN,
  REIHENFOLGE_MAX,
  istAngabeSchluessel,
  istAusstattungsArt,
  positionPruefen,
  type AusstattungsArt,
  type KatalogEinrichtung,
  type KatalogPosition,
  type KatalogStelle,
  type PositionEntwurf,
} from "@/lib/ausstattung";

// =============================================
// Formular und Body (rein, im Test direkt geprueft)
// =============================================

/** Was der Dialog sendet: alle Felder der Positivliste ausser `isActive` (POST und PATCH). */
export type PositionBody = PositionEntwurf & { orderIndex: number };

/** Der Zustand der Eingabefelder — Texte, wie sie im Feld stehen. */
export interface PositionFormular {
  departmentKey: string;
  /** "" = zentral. */
  organizationId: string;
  einrichtungsarten: string[];
  art: AusstattungsArt;
  /** "" = keine Angabe gewaehlt. */
  angabeSchluessel: string;
  bezeichnung: string;
  hinweisFuehrungskraft: string;
  hinweisStelle: string;
  /** Optionen der Auswahl, eine je Zeile. */
  optionenText: string;
  vorausgewaehlt: boolean;
  vorausgewaehlteOptionen: string[];
  bemerkungAnbieten: boolean;
  bemerkungPlatzhalter: string;
  aufgabeTitel: string;
  /** Tage relativ zum Vertragsbeginn, "" = ohne Fälligkeit. */
  defaultDueDays: string;
  personengruppen: string[];
  sichtbarFuer: string[];
  entgeltrelevant: boolean;
  orderIndex: string;
}

/** Leeres Formular („+ Position“); die Stelle kommt aus dem Filter, sonst leer. */
export function leeresFormular(vorgaben: { departmentKey?: string } = {}): PositionFormular {
  return {
    departmentKey: vorgaben.departmentKey ?? "",
    organizationId: "",
    einrichtungsarten: [],
    art: "JA_NEIN",
    angabeSchluessel: "",
    bezeichnung: "",
    hinweisFuehrungskraft: "",
    hinweisStelle: "",
    optionenText: "",
    vorausgewaehlt: false,
    vorausgewaehlteOptionen: [],
    bemerkungAnbieten: true,
    bemerkungPlatzhalter: "",
    aufgabeTitel: "",
    defaultDueDays: "",
    personengruppen: [],
    sichtbarFuer: [],
    entgeltrelevant: false,
    orderIndex: "0",
  };
}

/** Formular aus einer gespeicherten Position („Bearbeiten“). */
export function formularAusPosition(p: KatalogPosition): PositionFormular {
  return {
    departmentKey: p.departmentKey,
    organizationId: p.organizationId ?? "",
    einrichtungsarten: [...p.einrichtungsarten],
    art: istAusstattungsArt(p.art) ? p.art : "JA_NEIN",
    angabeSchluessel: p.angabeSchluessel ?? "",
    bezeichnung: p.bezeichnung,
    hinweisFuehrungskraft: p.hinweisFuehrungskraft ?? "",
    hinweisStelle: p.hinweisStelle ?? "",
    optionenText: p.optionen.join("\n"),
    vorausgewaehlt: p.vorausgewaehlt,
    vorausgewaehlteOptionen: [...p.vorausgewaehlteOptionen],
    bemerkungAnbieten: p.bemerkungAnbieten,
    bemerkungPlatzhalter: p.bemerkungPlatzhalter ?? "",
    aufgabeTitel: p.aufgabeTitel ?? "",
    defaultDueDays: p.defaultDueDays === null ? "" : String(p.defaultDueDays),
    personengruppen: [...p.personengruppen],
    sichtbarFuer: [...p.sichtbarFuer],
    entgeltrelevant: p.entgeltrelevant,
    orderIndex: String(p.orderIndex),
  };
}

/** Optionen aus dem Textfeld: eine je Zeile, getrimmt, Leerzeilen fallen weg. */
export function optionenAusText(text: string): string[] {
  return text
    .split(/\r?\n|\r/)
    .map((zeile) => zeile.trim())
    .filter((zeile) => zeile !== "");
}

/**
 * Ganze Zahl aus einem Eingabefeld: "" = `null`, „−5“ (auch mit
 * Gedankenstrich) = −5, alles andere als eine ganze Zahl = NaN (dann meldet
 * die Pruefung den Fehler, statt still zu runden).
 */
export function ganzzahlAusText(text: string): number | null {
  const t = text.trim().replace(/[−–]/g, "-");
  if (t === "") return null;
  return /^[+-]?\d+$/.test(t) ? Number(t) : Number.NaN;
}

function textOderNull(text: string): string | null {
  const t = text.replace(/\r\n?/g, "\n").trim();
  return t === "" ? null : t;
}

/**
 * Der Body aus dem Formular: Felder, die zur Art nicht passen, gehen leer
 * hinaus (Optionen nur bei Auswahl, „vorausgewählt“ nur bei Ja/Nein, Angabe
 * mit dem Label der festen Liste und ohne Aufgabe, Fälligkeit, Bemerkung und
 * Hinweis für die Stelle). Einrichtungsarten nur bei zentralen Positionen,
 * „Sichtbar auch für“ ohne die eigene Stelle.
 */
export function entwurfAusFormular(f: PositionFormular): PositionBody {
  const angabe = f.art === "ANGABE";
  const auswahl = f.art === "AUSWAHL";
  const optionen = auswahl ? optionenAusText(f.optionenText) : [];
  const departmentKey = f.departmentKey.trim();
  const organizationId = f.organizationId || null;
  const angabeSchluessel = angabe && f.angabeSchluessel ? f.angabeSchluessel : null;
  const bemerkungAnbieten = !angabe && f.bemerkungAnbieten;
  return {
    departmentKey,
    organizationId,
    einrichtungsarten: organizationId ? [] : [...f.einrichtungsarten],
    art: f.art,
    angabeSchluessel,
    bezeichnung: angabe
      ? istAngabeSchluessel(angabeSchluessel)
        ? ANGABEN_KATALOG[angabeSchluessel].label
        : ""
      : f.bezeichnung.trim(),
    hinweisFuehrungskraft: textOderNull(f.hinweisFuehrungskraft),
    hinweisStelle: angabe ? null : textOderNull(f.hinweisStelle),
    optionen,
    vorausgewaehlt: f.art === "JA_NEIN" && f.vorausgewaehlt,
    vorausgewaehlteOptionen: optionen.filter((o) => f.vorausgewaehlteOptionen.includes(o)),
    bemerkungAnbieten,
    bemerkungPlatzhalter: bemerkungAnbieten ? textOderNull(f.bemerkungPlatzhalter) : null,
    aufgabeTitel: angabe ? null : textOderNull(f.aufgabeTitel),
    defaultDueDays: angabe ? null : ganzzahlAusText(f.defaultDueDays),
    personengruppen: [...f.personengruppen],
    sichtbarFuer: angabe ? f.sichtbarFuer.filter((k) => k !== departmentKey) : [],
    entgeltrelevant: f.entgeltrelevant,
    orderIndex: ganzzahlAusText(f.orderIndex) ?? 0,
  };
}

/**
 * Grund, warum der Dialog noch nicht senden kann — dieselbe Pruefung wie auf
 * dem Server. Bei einer Angabe ohne Wahl hiesse sie „Bitte eine Bezeichnung
 * angeben.“; ein solches Feld gibt es dort nicht, die Bezeichnung kommt aus
 * der Liste.
 */
export function formularPruefen(f: PositionFormular): string | null {
  const body = entwurfAusFormular(f);
  const fehler = positionPruefen(body);
  if (fehler === MELDUNGEN.BEZEICHNUNG_FEHLT && f.art === "ANGABE") return MELDUNGEN.ANGABE_WAEHLEN;
  if (fehler) return fehler;
  const reihenfolgeOk = Number.isInteger(body.orderIndex) && body.orderIndex >= 0 && body.orderIndex <= REIHENFOLGE_MAX;
  return reihenfolgeOk ? null : MELDUNGEN.REIHENFOLGE_UNGUELTIG;
}

// =============================================
// Darstellung
// =============================================

const EINGABE =
  "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ring focus:ring-1 focus:ring-ring disabled:opacity-60";
const LABEL = "mb-1 block text-sm font-medium text-foreground";
const HILFE = "mt-1 text-xs text-muted-foreground";

const ART_HILFE: Readonly<Record<AusstattungsArt, string>> = {
  JA_NEIN: "Die Führungskraft hakt an; daraus wird eine Aufgabe der Stelle.",
  AUSWAHL:
    "Die Führungskraft wählt eine oder mehrere Optionen; je Option eine Aufgabe (z. B. „Schlüssel ausgeben: Haupteingang“).",
  ANGABE:
    "Die Führungskraft trägt einen kurzen Text ein – nur aus einer festen Liste. Daraus wird keine Aufgabe; die Stelle sieht die Angabe bei ihren Aufgaben.",
};

function Pflicht() {
  return (
    <span className="text-credo-rot" aria-hidden="true">
      {" "}
      *
    </span>
  );
}

/** Mehrfachauswahl als Knoepfe mit `aria-pressed` (Personengruppen, Einrichtungsarten, Optionen, Stellen). */
function Chips({
  legende,
  werte,
  gewaehlt,
  onAendern,
  hilfe,
  sendet,
  name,
  idBasis,
}: {
  legende: string;
  werte: ReadonlyArray<{ wert: string; name: string }>;
  gewaehlt: ReadonlyArray<string>;
  onAendern: (neu: string[]) => void;
  hilfe?: ReactNode;
  sendet: boolean;
  name: string;
  /** Praefix fuer die ID des Hilfetexts (useId des Dialogs). */
  idBasis: string;
}) {
  const hilfeId = `${idBasis}-${name}-hilfe`;
  return (
    <fieldset data-chips={name} aria-describedby={hilfe ? hilfeId : undefined}>
      <legend className={LABEL}>{legende}</legend>
      <div className="flex flex-wrap gap-1.5">
        {werte.map(({ wert, name: anzeige }) => {
          const an = gewaehlt.includes(wert);
          return (
            <button
              key={wert}
              type="button"
              aria-pressed={an}
              disabled={sendet}
              onClick={() =>
                onAendern(werte.map((w) => w.wert).filter((w) => (w === wert ? !an : gewaehlt.includes(w))))
              }
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:opacity-60 ${
                an
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-foreground hover:bg-accent"
              }`}
            >
              {anzeige}
            </button>
          );
        })}
      </div>
      {hilfe && (
        <p id={hilfeId} className={HILFE}>
          {hilfe}
        </p>
      )}
    </fieldset>
  );
}

// =============================================
// Der Dialog
// =============================================

export interface PositionDialogProps {
  /** null = neue Position. */
  position: (KatalogPosition & { ausblendungen?: ReadonlyArray<{ organizationId: string }> }) | null;
  stellen: ReadonlyArray<KatalogStelle>;
  einrichtungen: ReadonlyArray<KatalogEinrichtung>;
  /** Vorbelegung der Stelle beim Anlegen (Filter der Liste). */
  vorgabeStelle?: string;
  sendet: boolean;
  fehler: string | null;
  fokusZiel?: string;
  onAbbrechen: () => void;
  onSpeichern: (body: PositionBody) => void;
}

export function PositionDialog({
  position,
  stellen,
  einrichtungen,
  vorgabeStelle,
  sendet,
  fehler,
  fokusZiel,
  onAbbrechen,
  onSpeichern,
}: PositionDialogProps) {
  const id = useId();
  const [f, setF] = useState<PositionFormular>(() =>
    position ? formularAusPosition(position) : leeresFormular({ departmentKey: vorgabeStelle }),
  );
  const setze = (teil: Partial<PositionFormular>) => setF((alt) => ({ ...alt, ...teil }));

  const grund = formularPruefen(f);
  const angabe = f.art === "ANGABE";
  const optionen = f.art === "AUSWAHL" ? optionenAusText(f.optionenText) : [];
  const stellenWahl = stellen.some((s) => s.key === f.departmentKey)
    ? stellen
    : f.departmentKey
      ? [...stellen, { key: f.departmentKey, name: f.departmentKey }]
      : stellen;
  const linkStellen = stellen.filter((s) => s.key !== "HR" && s.key !== f.departmentKey);
  const ortBekannt = !f.organizationId || einrichtungen.some((e) => e.id === f.organizationId);
  const titelPlatzhalter = `${f.bezeichnung.trim() || "Bezeichnung"} bereitstellen`;
  const angabeDef = istAngabeSchluessel(f.angabeSchluessel) ? ANGABEN_KATALOG[f.angabeSchluessel] : null;
  // Wird eine zentrale Position zu einer Position einer Einrichtung, entfernt der Server ihre Ausblendungen.
  const ausblendungenWeg =
    !!position && !position.organizationId && !!f.organizationId ? (position.ausblendungen?.length ?? 0) : 0;

  return (
    <DialogRahmen
      titel={position ? `Position „${position.bezeichnung}“ bearbeiten` : "Neue Position"}
      untertitel={
        position
          ? "Was Führungskräfte in laufenden Vorgängen schon gewählt haben, bleibt, wie es ist (Momentaufnahme)."
          : "Neue Positionen sind ausgeschaltet. Einschalten in der Liste, wenn alles passt."
      }
      name="ausstattung-position"
      sendet={sendet}
      fehler={fehler}
      fokusZiel={fokusZiel}
      onAbbrechen={onAbbrechen}
      mitPflichtfeldern
      bestaetigen={{
        text: position ? "Speichern" : "Anlegen",
        onClick: () => onSpeichern(entwurfAusFormular(f)),
        grund,
        farbe: "blau",
      }}
    >
      {/* ===== Stelle und Art ===== */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={`${id}-stelle`} className={LABEL}>
            Stelle
            <Pflicht />
          </label>
          <select
            id={`${id}-stelle`}
            value={f.departmentKey}
            disabled={sendet}
            required
            aria-required="true"
            aria-describedby={`${id}-stelle-hilfe`}
            onChange={(e) => setze({ departmentKey: e.target.value })}
            className={EINGABE}
          >
            <option value="">Bitte wählen…</option>
            {stellenWahl.map((s) => (
              <option key={s.key} value={s.key}>
                {s.name} ({s.key})
              </option>
            ))}
          </select>
          <p id={`${id}-stelle-hilfe`} className={HILFE}>
            Für die Personalabteilung (HR) wird die Aufgabe im Portal erledigt, ohne Link.
          </p>
        </div>
        <div>
          <label htmlFor={`${id}-art`} className={LABEL}>
            Art
          </label>
          <select
            id={`${id}-art`}
            value={f.art}
            disabled={sendet}
            aria-describedby={`${id}-art-hilfe`}
            onChange={(e) => {
              const art = e.target.value;
              if (istAusstattungsArt(art)) setze({ art });
            }}
            className={EINGABE}
          >
            {AUSSTATTUNG_ARTEN.map((art) => (
              <option key={art} value={art}>
                {art === "AUSWAHL" ? "Auswahl (mehrere)" : ART_NAMEN[art]}
              </option>
            ))}
          </select>
          <p id={`${id}-art-hilfe`} className={HILFE}>
            {ART_HILFE[f.art]}
          </p>
        </div>
      </div>

      {/* ===== Bezeichnung bzw. Angabe ===== */}
      {angabe ? (
        <div>
          <label htmlFor={`${id}-angabe`} className={LABEL}>
            Angabe
            <Pflicht />
          </label>
          <select
            id={`${id}-angabe`}
            value={f.angabeSchluessel}
            disabled={sendet}
            required
            aria-required="true"
            aria-describedby={`${id}-angabe-hilfe`}
            onChange={(e) => setze({ angabeSchluessel: e.target.value })}
            className={EINGABE}
          >
            <option value="">Bitte wählen…</option>
            {ANGABE_SCHLUESSEL.map((s) => (
              <option key={s} value={s}>
                {ANGABEN_KATALOG[s].label}
              </option>
            ))}
          </select>
          <p id={`${id}-angabe-hilfe`} className={HILFE}>
            {angabeDef
              ? `Im Formular: „${angabeDef.label}“, Beispiel „${angabeDef.platzhalter}“, höchstens ${angabeDef.max} Zeichen.`
              : "Weitere Angaben gibt es nur nach Rücksprache mit dem Datenschutz (Änderung im Code)."}
          </p>
        </div>
      ) : (
        <div>
          <label htmlFor={`${id}-bezeichnung`} className={LABEL}>
            Bezeichnung
            <Pflicht />
          </label>
          <input
            id={`${id}-bezeichnung`}
            type="text"
            value={f.bezeichnung}
            maxLength={GRENZEN.bezeichnung}
            disabled={sendet}
            required
            aria-required="true"
            onChange={(e) => setze({ bezeichnung: e.target.value })}
            placeholder="z. B. Dienst-iPad (Lernmittel)"
            className={EINGABE}
          />
        </div>
      )}

      {/* ===== Je Art ===== */}
      {f.art === "AUSWAHL" && (
        <>
          <div>
            <label htmlFor={`${id}-optionen`} className={LABEL}>
              Optionen (eine je Zeile)
              <Pflicht />
            </label>
            <textarea
              id={`${id}-optionen`}
              rows={5}
              value={f.optionenText}
              disabled={sendet}
              required
              aria-required="true"
              aria-describedby={`${id}-optionen-hilfe`}
              onChange={(e) => setze({ optionenText: e.target.value })}
              placeholder={"Haupteingang\nLehrerzimmer"}
              className={EINGABE}
            />
            <p id={`${id}-optionen-hilfe`} className={HILFE}>
              {`Höchstens ${GRENZEN.optionen} Optionen zu je ${GRENZEN.option} Zeichen. Je gewählter Option entsteht eine Aufgabe.`}
            </p>
          </div>
          {optionen.length > 0 && (
            <Chips
              name="vorauswahl"
              legende="Vorausgewählte Optionen"
              werte={optionen.map((o) => ({ wert: o, name: o }))}
              gewaehlt={f.vorausgewaehlteOptionen}
              onAendern={(neu) => setze({ vorausgewaehlteOptionen: neu })}
              hilfe="Im Formular schon angehakt; die Führungskraft kann sie abwählen."
              sendet={sendet}
              idBasis={id}
            />
          )}
        </>
      )}

      {f.art === "JA_NEIN" && (
        <label className="flex items-start gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 shrink-0"
            checked={f.vorausgewaehlt}
            disabled={sendet}
            onChange={(e) => setze({ vorausgewaehlt: e.target.checked })}
          />
          <span>
            Im Formular vorausgewählt
            <span className="block text-xs text-muted-foreground">Die Führungskraft kann den Haken entfernen.</span>
          </span>
        </label>
      )}

      {angabe && (
        <Chips
          name="sichtbar"
          legende="Sichtbar auch für"
          werte={linkStellen.map((s) => ({ wert: s.key, name: s.name }))}
          gewaehlt={f.sichtbarFuer}
          onAendern={(neu) => setze({ sichtbarFuer: neu })}
          hilfe="Weitere Stellen, die die Angabe bei ihren Aufgaben sehen. Die eigene Stelle sieht sie immer."
          sendet={sendet}
          idBasis={id}
        />
      )}

      {/* ===== Aufgabe, Faelligkeit, Bemerkung (nicht bei einer Angabe) ===== */}
      {!angabe && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor={`${id}-aufgabe`} className={LABEL}>
                Aufgabe für die Stelle
              </label>
              <input
                id={`${id}-aufgabe`}
                type="text"
                value={f.aufgabeTitel}
                maxLength={GRENZEN.aufgabeTitel}
                disabled={sendet}
                aria-describedby={`${id}-aufgabe-hilfe`}
                onChange={(e) => setze({ aufgabeTitel: e.target.value })}
                placeholder={titelPlatzhalter}
                className={EINGABE}
              />
              <p id={`${id}-aufgabe-hilfe`} className={HILFE}>
                {f.art === "AUSWAHL"
                  ? "Titel der Aufgabe; dahinter steht die Option. Leer = „<Bezeichnung> bereitstellen“."
                  : "Titel der Aufgabe. Leer = „<Bezeichnung> bereitstellen“."}
              </p>
            </div>
            <div>
              <label htmlFor={`${id}-faellig`} className={LABEL}>
                Fällig (Tage)
              </label>
              <input
                id={`${id}-faellig`}
                type="text"
                value={f.defaultDueDays}
                disabled={sendet}
                aria-describedby={`${id}-faellig-hilfe`}
                onChange={(e) => setze({ defaultDueDays: e.target.value })}
                placeholder="z. B. −5"
                className={EINGABE}
              />
              <p id={`${id}-faellig-hilfe`} className={HILFE}>
                Relativ zum Vertragsbeginn, negativ = vorher. Leer = ohne Fälligkeit, dann gibt es keine Erinnerung.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <label className="flex items-start gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 shrink-0"
                checked={f.bemerkungAnbieten}
                disabled={sendet}
                onChange={(e) => setze({ bemerkungAnbieten: e.target.checked })}
              />
              <span>
                Bemerkung anbieten
                <span className="block text-xs text-muted-foreground">
                  Ein Freitextfeld neben der Position im Formular der Führungskraft.
                </span>
              </span>
            </label>
            {f.bemerkungAnbieten && (
              <div>
                <label htmlFor={`${id}-platzhalter`} className={LABEL}>
                  Platzhalter der Bemerkung
                </label>
                <input
                  id={`${id}-platzhalter`}
                  type="text"
                  value={f.bemerkungPlatzhalter}
                  maxLength={GRENZEN.bemerkungPlatzhalter}
                  disabled={sendet}
                  onChange={(e) => setze({ bemerkungPlatzhalter: e.target.value })}
                  placeholder="z. B. Einschränkungen, Ausgabe erst nach Unterweisung"
                  className={EINGABE}
                />
              </div>
            )}
          </div>
        </>
      )}

      {/* ===== Hinweise ===== */}
      <div>
        <label htmlFor={`${id}-hinweis-fk`} className={LABEL}>
          Hinweis für die Führungskraft
        </label>
        <textarea
          id={`${id}-hinweis-fk`}
          rows={2}
          value={f.hinweisFuehrungskraft}
          maxLength={GRENZEN.hinweisFuehrungskraft}
          disabled={sendet}
          aria-describedby={`${id}-hinweis-fk-hilfe`}
          onChange={(e) => setze({ hinweisFuehrungskraft: e.target.value })}
          className={EINGABE}
        />
        <p id={`${id}-hinweis-fk-hilfe`} className={HILFE}>
          Steht im Formular unter der Position.
        </p>
      </div>
      {!angabe && (
        <div>
          <label htmlFor={`${id}-hinweis-stelle`} className={LABEL}>
            Hinweis für die Stelle
          </label>
          <textarea
            id={`${id}-hinweis-stelle`}
            rows={2}
            value={f.hinweisStelle}
            maxLength={GRENZEN.hinweisStelle}
            disabled={sendet}
            aria-describedby={`${id}-hinweis-stelle-hilfe`}
            onChange={(e) => setze({ hinweisStelle: e.target.value })}
            className={EINGABE}
          />
          <p id={`${id}-hinweis-stelle-hilfe`} className={HILFE}>
            Steht bei der Aufgabe der Stelle (Mail, Aufgabenseite, Checkliste).
          </p>
        </div>
      )}

      {/* ===== Gilt fuer ===== */}
      <div>
        <label htmlFor={`${id}-ort`} className={LABEL}>
          Gilt für
        </label>
        <select
          id={`${id}-ort`}
          value={f.organizationId}
          disabled={sendet}
          aria-describedby={ausblendungenWeg > 0 ? `${id}-ort-hilfe ${id}-ort-folge` : `${id}-ort-hilfe`}
          onChange={(e) => setze({ organizationId: e.target.value })}
          className={EINGABE}
        >
          <option value="">Alle Einrichtungen (zentral)</option>
          {!ortBekannt && <option value={f.organizationId}>Unbekannte Einrichtung</option>}
          {einrichtungen.map((e) => (
            <option key={e.id} value={e.id}>
              {e.isActive === false ? `${e.name} (inaktiv)` : e.name}
            </option>
          ))}
        </select>
        <p id={`${id}-ort-hilfe`} className={HILFE}>
          Eine zentrale Position kann jede Einrichtung für sich ausblenden. Eine Position einer Einrichtung gilt nur
          dort (z. B. Räume, Schlüssel).
        </p>
        {ausblendungenWeg > 0 && (
          <p id={`${id}-ort-folge`} className="mt-1 text-xs text-credo-rot" data-hinweis="ausblendungen-weg">
            {ausblendungenWeg === 1
              ? "Die Ausblendung für 1 Einrichtung entfällt damit."
              : `Die Ausblendungen für ${ausblendungenWeg} Einrichtungen entfallen damit.`}
          </p>
        )}
      </div>

      {!f.organizationId && (
        <Chips
          name="einrichtungsarten"
          legende="Einrichtungsarten"
          werte={Object.entries(EINRICHTUNGSARTEN).map(([wert, name]) => ({ wert, name }))}
          gewaehlt={f.einrichtungsarten}
          onAendern={(neu) => setze({ einrichtungsarten: neu })}
          hilfe="Keine Auswahl = alle Arten. Maßgeblich ist die Art des Arbeitsorts."
          sendet={sendet}
          idBasis={id}
        />
      )}

      <Chips
        name="personengruppen"
        legende="Gilt für Personengruppen"
        werte={Object.entries(PERSONENGRUPPEN).map(([wert, name]) => ({ wert, name }))}
        gewaehlt={f.personengruppen}
        onAendern={(neu) => setze({ personengruppen: neu })}
        hilfe="Keine Auswahl = alle Personengruppen."
        sendet={sendet}
        idBasis={id}
      />

      {/* ===== Entgelt und Reihenfolge ===== */}
      <label className="flex items-start gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 shrink-0"
          checked={f.entgeltrelevant}
          disabled={sendet}
          onChange={(e) => setze({ entgeltrelevant: e.target.checked })}
        />
        <span>
          Bedeutung für Entgelt oder Vertrag
          <span className="block text-xs text-muted-foreground">
            z. B. Dienstwagen, Jobticket, Diensthandy mit Privatnutzung – nur mit der Stelle Personalabteilung (HR).
          </span>
        </span>
      </label>

      <div className="sm:w-1/2">
        <label htmlFor={`${id}-reihenfolge`} className={LABEL}>
          Reihenfolge
        </label>
        <input
          id={`${id}-reihenfolge`}
          type="number"
          min={0}
          max={REIHENFOLGE_MAX}
          step={1}
          value={f.orderIndex}
          disabled={sendet}
          aria-describedby={`${id}-reihenfolge-hilfe`}
          onChange={(e) => setze({ orderIndex: e.target.value })}
          className={EINGABE}
        />
        <p id={`${id}-reihenfolge-hilfe`} className={HILFE}>{`Innerhalb der Stelle: kleinere Zahlen stehen weiter oben (0 bis ${REIHENFOLGE_MAX}).`}</p>
      </div>
    </DialogRahmen>
  );
}
