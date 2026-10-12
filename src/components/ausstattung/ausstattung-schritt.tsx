"use client";

/**
 * Einstellungsmodalitäten: der Schritt „Ausstattung & Zugänge“ (Paket A2,
 * Feinplan S9, Mockup 6.1).
 *
 * Die Führungskraft wählt, was zum Arbeitsbeginn bereitstehen soll — gruppiert
 * nach Stelle, damit klar ist, wer was liest („Diese Angaben erhält die Stelle
 * …“):
 *   - Ja/Nein als Häkchen, Auswahl als Chips (Knöpfe mit `aria-pressed` in
 *     einem `fieldset`), Angabe als Textfeld mit Hilfe;
 *   - das Bemerkungsfeld klappt erst nach einer Wahl auf und trägt den
 *     Platzhalter der Position; abgewählt bleibt der Text stehen, solange die
 *     Seite offen ist, wird aber nicht gesendet;
 *   - je Stelle „Weitere Hinweise an …“ (E-A8: eigene Positionen legt nur HR an);
 *   - unter jedem Bemerkungs- und Hinweisfeld der Datenschutzhinweis
 *     (`bemerkungHinweis`, BEMERKUNG_HINWEIS) — per `aria-describedby` am Feld,
 *     sonst hörte ihn niemand —, dazu ein Zeichenzähler aus GRENZEN.
 *
 * „Weiter“ ist nie gesperrt (R3, E-A5: alles freiwillig) und schickt immer
 * `{ ausstattung, hinweise }` (`formularEingabe`), auch leer — so leert ein
 * „alles abgewählt“ den gespeicherten Stand. Die Komponente rechnet nichts
 * selbst: Startzustand, Body und Kurzform stehen rein in src/lib/ausstattung.ts.
 * Sie ruft keine Schnittstelle; die Seite speichert über `onNext` und zeigt
 * Fehler des Servers in ihrem Banner.
 *
 * Fehlt die Sicht (`null` — kommt bei beschreibbarem Formular nicht vor),
 * sendet „Weiter“ nichts zur Ausstattung: Ein leeres Array löschte sonst eine
 * gespeicherte Wahl, die das Formular nur nicht anzeigen konnte.
 *
 * Neue Datei, deshalb Stand 0 in der Sperrklinke: nur Farb-Tokens, keine
 * Palettenklassen, kein Inline-SVG. Anrede „Sie“ (Link-Seite ohne Anmeldung).
 */

import { useId, useState, type FormEvent } from "react";
import {
  GRENZEN,
  formularEingabe,
  formularHinweis,
  formularPositionStand,
  formularStartStand,
  type FormularGruppe,
  type FormularPosition,
  type FormularPositionStand,
  type FormularStand,
  type FuehrungskraftEingabe,
  type FuehrungskraftSicht,
} from "@/lib/ausstattung";

// =============================================
// Texte
// =============================================

export const SCHRITT_TEXTE = {
  einleitung:
    "Jede Auswahl geht als Aufgabe an die zuständige Stelle, zusammen mit Ihrer Bemerkung. Alle Angaben sind freiwillig.",
  leer: "Für diese Einstellung ist zurzeit nichts zur Auswahl hinterlegt. Sie können ohne Angaben weitergehen.",
  nichtMehrImKatalog: "nicht mehr im Katalog",
  nichtMehrImKatalogHilfe: "Diese Position wird nicht mehr angeboten. Ihre Auswahl bleibt bestehen, bis Sie sie entfernen.",
  imKatalogGeaendert: "inzwischen geändert",
  imKatalogGeaendertHilfe:
    "Diese Position wurde nach Ihrer Auswahl geändert. Ihre Auswahl gilt in der gespeicherten Form, bis Sie sie entfernen. Die geänderte Position können Sie danach beim nächsten Öffnen des Formulars wählen.",
  bemerkung: "Bemerkung (optional)",
  hinweisPlatzhalter: "z. B. Wünsche, die oben nicht vorkommen",
} as const;

/**
 * Wer die Angaben einer Gruppe bekommt. Der Name ist frei gepflegt
 * („Verwaltung / Sekretariat“, „Datenschutzbeauftragte/r“) — ein Satz mit
 * eigenem Artikel davor zerbräche daran, deshalb „die Stelle „…““.
 */
export function stelleErhaelt(stelleName: string): string {
  return `Diese Angaben erhält die Stelle „${stelleName}“.`;
}

/** Beschriftung des freien Hinweisfelds einer Stelle. */
export function hinweisBeschriftung(stelleName: string): string {
  return `Weitere Hinweise an die Stelle „${stelleName}“`;
}

/** „Außerdem sichtbar für: IT-Abteilung.“ unter einer Angabe mit `sichtbarFuer`. */
export function sichtbarFuerText(stellen: ReadonlyArray<{ stelleName: string }>): string | null {
  if (stellen.length === 0) return null;
  return `Außerdem sichtbar für: ${stellen.map((s) => s.stelleName).join(", ")}.`;
}

// =============================================
// Klassen (nur Tokens)
// =============================================

const EINGABE =
  "w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring";
const HILFE = "text-xs text-muted-foreground";
const KASTEN = "rounded-lg border border-border bg-muted/50 p-4";
const MARKE = "rounded-full border border-border bg-card px-2 py-0.5 text-[10px] font-medium text-muted-foreground";

// =============================================
// Kleine Bausteine
// =============================================

/** Zeichenzähler unter einem Freitext (Muster der Modalitäten-Seite): ab neun Zehnteln hervorgehoben. */
function Zaehler({ wert, max }: { wert: string; max: number }) {
  const laenge = wert.length;
  const knapp = laenge >= max * 0.9;
  return (
    <p className={`text-right text-[10px] ${knapp ? "font-medium text-destructive" : "text-muted-foreground"}`}>
      {laenge.toLocaleString("de-DE")} / {max.toLocaleString("de-DE")} Zeichen
    </p>
  );
}

/** Marke einer Position aus der gespeicherten Wahl: nicht mehr angeboten oder inzwischen geändert. */
function NichtMehrMarke({ position: p }: { position: FormularPosition }) {
  return (
    <span className={MARKE}>
      {p.imKatalogGeaendert ? SCHRITT_TEXTE.imKatalogGeaendert : SCHRITT_TEXTE.nichtMehrImKatalog}
    </span>
  );
}

/** Erklärung unter einer solchen Position. */
function nichtMehrHilfe(p: FormularPosition): string {
  return p.imKatalogGeaendert ? SCHRITT_TEXTE.imKatalogGeaendertHilfe : SCHRITT_TEXTE.nichtMehrImKatalogHilfe;
}

/** Ids der Beschreibungen, die es wirklich gibt (sonst verwiese `aria-describedby` ins Leere). */
function beschriebenVon(...ids: (string | false | null | undefined)[]): string | undefined {
  const da = ids.filter((id): id is string => typeof id === "string" && id !== "");
  return da.length > 0 ? da.join(" ") : undefined;
}

function BemerkungFeld({
  id,
  position,
  wert,
  datenschutz,
  onAendern,
}: {
  id: string;
  position: FormularPosition;
  wert: string;
  datenschutz: string;
  onAendern: (text: string) => void;
}) {
  const hilfeId = `${id}-datenschutz`;
  return (
    <div className="mt-3 space-y-1" data-bemerkung={position.id}>
      <label htmlFor={id} className="block text-xs font-medium text-foreground">
        {SCHRITT_TEXTE.bemerkung}
        <span className="sr-only">{` zu „${position.bezeichnung}“`}</span>
      </label>
      <textarea
        id={id}
        rows={2}
        value={wert}
        maxLength={GRENZEN.bemerkung}
        placeholder={position.bemerkungPlatzhalter ?? undefined}
        aria-describedby={hilfeId}
        onChange={(e) => onAendern(e.target.value)}
        className={EINGABE}
      />
      <p id={hilfeId} className={HILFE}>
        {datenschutz}
      </p>
      <Zaehler wert={wert} max={GRENZEN.bemerkung} />
    </div>
  );
}

// =============================================
// Eine Position je Art
// =============================================

/**
 * Aenderung am Stand einer Position: ein Teil oder eine Funktion des
 * aktuellen Stands. Die Funktion braucht das Umschalten einer Option — zwei
 * schnelle Klicks rechneten sonst beide vom selben, alten Stand aus.
 */
type PositionAenderung =
  | Partial<FormularPositionStand>
  | ((alt: FormularPositionStand) => Partial<FormularPositionStand>);

interface PositionProps {
  idBasis: string;
  position: FormularPosition;
  stand: FormularPositionStand;
  datenschutz: string;
  onAendern: (aenderung: PositionAenderung) => void;
}

function JaNeinPosition({ idBasis, position: p, stand: s, datenschutz, onAendern }: PositionProps) {
  const feldId = `${idBasis}-feld`;
  const hinweisId = `${idBasis}-hinweis`;
  const altId = `${idBasis}-alt`;
  return (
    <div className={KASTEN} data-position={p.id}>
      <div className="flex items-start gap-3">
        <input
          id={feldId}
          type="checkbox"
          checked={s.gewaehlt}
          onChange={(e) => onAendern({ gewaehlt: e.target.checked })}
          aria-describedby={beschriebenVon(p.hinweisFuehrungskraft && hinweisId, p.nichtMehrImKatalog && altId)}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-border text-primary focus:ring-primary"
        />
        <div className="min-w-0 space-y-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor={feldId} className="text-sm font-medium text-foreground">
              {p.bezeichnung}
            </label>
            {p.nichtMehrImKatalog && <NichtMehrMarke position={p} />}
          </div>
          {p.hinweisFuehrungskraft && (
            <p id={hinweisId} className={HILFE}>
              {p.hinweisFuehrungskraft}
            </p>
          )}
          {p.nichtMehrImKatalog && (
            <p id={altId} className={HILFE}>
              {nichtMehrHilfe(p)}
            </p>
          )}
        </div>
      </div>
      {s.gewaehlt && p.bemerkungAnbieten && (
        <BemerkungFeld
          id={`${idBasis}-bemerkung`}
          position={p}
          wert={s.bemerkung}
          datenschutz={datenschutz}
          onAendern={(bemerkung) => onAendern({ bemerkung })}
        />
      )}
    </div>
  );
}

function AuswahlPosition({ idBasis, position: p, stand: s, datenschutz, onAendern }: PositionProps) {
  const hinweisId = `${idBasis}-hinweis`;
  const altId = `${idBasis}-alt`;
  // Bei einer Position, die ganz aus dem Katalog gefallen ist, sagt es die
  // Marke an der Position; die einzelnen Chips tragen den Zusatz nur, wenn die
  // Position selbst noch angeboten wird.
  const alteOptionen = p.nichtMehrImKatalog ? [] : (p.optionenNichtMehrImKatalog ?? []);
  const umschalten = (option: string) =>
    onAendern((alt) => ({
      auswahl: alt.auswahl.includes(option) ? alt.auswahl.filter((o) => o !== option) : [...alt.auswahl, option],
    }));
  const gewaehlt = p.optionen.some((o) => s.auswahl.includes(o));
  return (
    <div className={KASTEN} data-position={p.id}>
      <fieldset aria-describedby={beschriebenVon(p.hinweisFuehrungskraft && hinweisId, p.nichtMehrImKatalog && altId)}>
        <legend className="text-sm font-medium text-foreground">{p.bezeichnung}</legend>
        {p.nichtMehrImKatalog && (
          <div className="mt-1">
            <NichtMehrMarke position={p} />
          </div>
        )}
        {p.hinweisFuehrungskraft && (
          <p id={hinweisId} className={`mt-0.5 ${HILFE}`}>
            {p.hinweisFuehrungskraft}
          </p>
        )}
        {p.nichtMehrImKatalog && (
          <p id={altId} className={`mt-0.5 ${HILFE}`}>
            {nichtMehrHilfe(p)}
          </p>
        )}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {p.optionen.map((option) => {
            const an = s.auswahl.includes(option);
            return (
              <button
                key={option}
                type="button"
                aria-pressed={an}
                onClick={() => umschalten(option)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  an
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-foreground hover:bg-accent"
                }`}
              >
                {option}
                {alteOptionen.includes(option) && ` (${SCHRITT_TEXTE.nichtMehrImKatalog})`}
              </button>
            );
          })}
        </div>
        {gewaehlt && p.bemerkungAnbieten && (
          <BemerkungFeld
            id={`${idBasis}-bemerkung`}
            position={p}
            wert={s.bemerkung}
            datenschutz={datenschutz}
            onAendern={(bemerkung) => onAendern({ bemerkung })}
          />
        )}
      </fieldset>
    </div>
  );
}

function AngabePosition({ idBasis, position: p, stand: s, onAendern }: PositionProps) {
  const feldId = `${idBasis}-feld`;
  const hilfeId = `${idBasis}-hilfe`;
  const max = p.angabe?.max ?? GRENZEN.angabe;
  const hilfe = [
    p.hinweisFuehrungskraft,
    p.angabe?.hilfe,
    sichtbarFuerText(p.angabe?.sichtbarFuer ?? []),
    p.nichtMehrImKatalog ? nichtMehrHilfe(p) : null,
  ].filter((t): t is string => !!t);
  return (
    <div className="space-y-1" data-position={p.id}>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={feldId} className="text-sm font-medium text-foreground">
          {p.bezeichnung}
        </label>
        {p.nichtMehrImKatalog && <NichtMehrMarke position={p} />}
      </div>
      <input
        id={feldId}
        type="text"
        value={s.angabe}
        maxLength={max}
        placeholder={p.angabe?.platzhalter}
        aria-describedby={hilfe.length > 0 ? hilfeId : undefined}
        onChange={(e) => onAendern({ angabe: e.target.value })}
        className={EINGABE}
      />
      {hilfe.length > 0 && (
        <p id={hilfeId} className={HILFE}>
          {hilfe.join(" ")}
        </p>
      )}
      <Zaehler wert={s.angabe} max={max} />
    </div>
  );
}

// =============================================
// Eine Stelle
// =============================================

function StellenGruppe({
  idBasis,
  gruppe,
  stand,
  datenschutz,
  onPosition,
  onHinweis,
}: {
  idBasis: string;
  gruppe: FormularGruppe;
  stand: FormularStand;
  datenschutz: string;
  onPosition: (positionId: string, aenderung: PositionAenderung) => void;
  onHinweis: (text: string) => void;
}) {
  const kopfId = `${idBasis}-kopf`;
  const satzId = `${idBasis}-satz`;
  const hinweisId = `${idBasis}-hinweis`;
  const hinweis = formularHinweis(stand, gruppe.departmentKey);
  return (
    <section aria-labelledby={kopfId} aria-describedby={satzId} className="space-y-3" data-stelle={gruppe.departmentKey}>
      <div className="border-b border-border pb-2">
        <h3 id={kopfId} className="text-sm font-semibold text-foreground">
          {gruppe.stelleName}
        </h3>
        <p id={satzId} className={HILFE}>
          {stelleErhaelt(gruppe.stelleName)}
        </p>
      </div>

      {gruppe.positionen.map((p, i) => {
        const props: PositionProps = {
          idBasis: `${idBasis}-p${i}`,
          position: p,
          stand: formularPositionStand(stand, p.id),
          datenschutz,
          onAendern: (aenderung) => onPosition(p.id, aenderung),
        };
        if (p.art === "JA_NEIN") return <JaNeinPosition key={p.id} {...props} />;
        if (p.art === "AUSWAHL") return <AuswahlPosition key={p.id} {...props} />;
        if (p.art === "ANGABE") return <AngabePosition key={p.id} {...props} />;
        return null;
      })}

      <div className="space-y-1">
        <label htmlFor={hinweisId} className="block text-sm font-medium text-foreground">
          {hinweisBeschriftung(gruppe.stelleName)} <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        <textarea
          id={hinweisId}
          rows={2}
          value={hinweis}
          maxLength={GRENZEN.hinweis}
          placeholder={SCHRITT_TEXTE.hinweisPlatzhalter}
          aria-describedby={`${hinweisId}-datenschutz`}
          onChange={(e) => onHinweis(e.target.value)}
          className={EINGABE}
        />
        <p id={`${hinweisId}-datenschutz`} className={HILFE}>
          {datenschutz}
        </p>
        <Zaehler wert={hinweis} max={GRENZEN.hinweis} />
      </div>
    </section>
  );
}

// =============================================
// Der Schritt
// =============================================

export interface AusstattungSchrittProps {
  /** `ausstattung` aus GET /api/modalitaeten/[token] (fortgeschrieben nach jedem „Weiter“). */
  sicht: FuehrungskraftSicht | null;
  saving: boolean;
  onBack: () => void;
  /** Speichert den Schritt (PUT mit `currentStep`); bei `sicht === null` ohne Ausstattung. */
  onNext: (eingabe: FuehrungskraftEingabe) => void;
}

export function AusstattungSchritt({ sicht, saving, onBack, onNext }: AusstattungSchrittProps) {
  const idBasis = useId();
  const [stand, setStand] = useState<FormularStand>(() =>
    sicht ? formularStartStand(sicht) : { positionen: {}, hinweise: {} },
  );

  const positionAendern = (positionId: string, aenderung: PositionAenderung) =>
    setStand((alt) => {
      const vorher = formularPositionStand(alt, positionId);
      const teil = typeof aenderung === "function" ? aenderung(vorher) : aenderung;
      return { ...alt, positionen: { ...alt.positionen, [positionId]: { ...vorher, ...teil } } };
    });
  const hinweisAendern = (departmentKey: string, text: string) =>
    setStand((alt) => ({ ...alt, hinweise: { ...alt.hinweise, [departmentKey]: text } }));

  const absenden = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    onNext(sicht ? formularEingabe(sicht, stand) : {});
  };

  const gruppen = sicht?.gruppen ?? [];

  return (
    <form onSubmit={absenden} className="space-y-6" data-schritt="ausstattung">
      {gruppen.length > 0 ? (
        <div className="space-y-1">
          <p className="text-sm text-foreground">{SCHRITT_TEXTE.einleitung}</p>
          {sicht && <p className={HILFE}>{sicht.aenderungenHinweis}</p>}
        </div>
      ) : (
        <div className={`${KASTEN} space-y-1 text-sm text-foreground`} data-leer="ausstattung">
          <p>{SCHRITT_TEXTE.leer}</p>
          {sicht && <p className={HILFE}>{sicht.aenderungenHinweis}</p>}
        </div>
      )}

      {sicht &&
        gruppen.map((gruppe, i) => (
          <StellenGruppe
            key={gruppe.departmentKey}
            idBasis={`${idBasis}-g${i}`}
            gruppe={gruppe}
            stand={stand}
            datenschutz={sicht.bemerkungHinweis}
            onPosition={positionAendern}
            onHinweis={(text) => hinweisAendern(gruppe.departmentKey, text)}
          />
        ))}

      <div className="flex flex-wrap items-center justify-between gap-3 pt-4">
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg border border-border px-6 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent"
        >
          Zurück
        </button>
        {/* Nie aus inhaltlichen Gruenden gesperrt (R3) — nur waehrend des Speicherns, wie in jedem Schritt. */}
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? "Speichern..." : "Weiter"}
        </button>
      </div>
    </form>
  );
}
