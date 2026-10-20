"use client";

/**
 * Prozessleiste (UX-Umbau „Klarer Weg", Pilot Vertragsende)
 *
 * Zeichnet einen `ProzessStand` (src/lib/prozess/prozess-stand.ts): oben die
 * Schritte als Punkte auf einer Linie, darunter der Kasten „Jetzt dran" — was
 * als Naechstes geschieht, bei wem es liegt, bis wann, und die EINE Handlung.
 *
 *   <Prozessleiste
 *     stand={vertragsendeProzessStand(vorgang, jetzt)}
 *     aktion={darfBearbeiten && <Button variante="primary" onClick={…}>Anfrage senden …</Button>}
 *     onReiter={setReiter}
 *   />
 *
 * Regeln:
 *   - Die Leiste kennt KEINE Fachbegriffe eines Moduls und ruft keine
 *     Schnittstelle. Sie zeichnet, was im Stand steht; den Stand rechnet der
 *     Adapter des Moduls, die Knoepfe gibt die Seite fertig mit — und nur mit
 *     Bearbeitungsrecht.
 *   - Die Schritte sind eine geordnete Liste (`ol`, benannt ueber `label`). Der
 *     Punkt mit Nummer bzw. Haken ist Zierde (`aria-hidden`): Die Stelle sagt
 *     die Liste, den Zustand ein Wort nur fuer Screenreader (`SCHRITT_WORT`).
 *   - Vier Zustaende, jeder auch OHNE Farbe erkennbar:
 *       erledigt       gefuellter Punkt mit Haken
 *       aktiv          dunkler Rand mit Hof, Titel fett, `aria-current="step"`
 *       kommend        heller Rand, Nummer, Titel zurueckgenommen
 *       uebersprungen  gestrichelter, dunklerer Rand, Titel durchgestrichen
 *     Ist der Ablauf zu Ende (`ende`), heisst ein kommender Schritt „nicht
 *     erreicht" — „kommt noch" waere dann falsch.
 *   - Die Linie ist gruen, soweit der Ablauf sie hinter sich hat — auch ueber
 *     uebersprungene Schritte hinweg; sie zeigt, wie weit er ist. Was auf dem
 *     Weg ausgelassen wurde, sagt der Punkt.
 *   - Ein Schritt mit `reiter` ist ein Knopf (der ganze Schritt), wenn die
 *     Seite `onReiter` mitgibt. Ohne Handler ist KEIN Schritt ein Knopf, ohne
 *     `reiter` nie.
 *   - „Jetzt dran": Satz, bei wem (`BEI_NAME`), Unterzeile, Frist. Eine
 *     dringende Frist traegt eine `Statuspille` mit Wort („Kritisch", „Frist
 *     naht") — nie nur Farbe. Ohne `jetztDran` steht dort das Ende
 *     („Abgeschlossen", „Abgebrochen"), ohne Ende gar nichts; Knoepfe gibt es
 *     nur MIT `jetztDran`, auch wenn die Seite welche mitgibt.
 *   - Reihenfolge der Knoepfe: der Hauptknopf steht ZUERST im Quelltext und
 *     damit links. Die Tab-Reihenfolge folgt dem Quelltext; wer mit der
 *     Tastatur aus den Schritten kommt, erreicht so zuerst die eine Handlung,
 *     und sie steht zuerst, wenn die Knoepfe auf schmalen Bildschirmen unter
 *     den Text rutschen. Eine gespiegelte Anzeige (`flex-row-reverse`) gibt es
 *     bewusst nicht: Gesehene und gelesene Reihenfolge blieben nicht gleich.
 *     Der Seitenkopf haelt es ebenso (Primaerknopf vor dem „…"-Menue).
 *   - Unter 640 px bleiben die Punkte in einer Zeile; Titel und Unterzeilen
 *     verschwinden nur optisch (`max-sm:sr-only`, nicht `hidden` — Screenreader
 *     lesen sie weiter), darunter steht die Kurzform „Schritt 4 von 5 ·
 *     Vertrag". Am Ende des Ablaufs entfaellt die Kurzform: Dann sagt es der
 *     Kasten.
 *   - Nichts wird abgeschnitten: Titel brechen zwischen den Woertern um, die
 *     Unterzeile von „Jetzt dran" (E-Mail-Adresse) notfalls an jeder Stelle.
 *   - Kein `sticky`, kein Kompaktmodus beim Scrollen (Entscheidung P-F6: erst
 *     mit dem Onboarding).
 *   - `PROZESS_FARBEN` ist die EINE Quelle der Farben; der Kontrasttest liest
 *     sie von hier. Die Leiste steht immer auf ihrer eigenen weissen Flaeche.
 *   - Windows-Kontrastmodus: Flaechen und Schatten entfallen dort, Raender
 *     bleiben. Der erledigte Punkt behaelt Rand und Haken, die Linie ist ein
 *     Rand, die Flaeche traegt einen durchsichtigen Rand — und der aktive
 *     Punkt, dessen Hof ein Schatten ist, bekommt die Auswahlfarbe des Systems.
 */
import type { ReactNode } from "react";
import { Ban, Check, CircleCheck, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDatumDE } from "@/lib/format";
import {
  BEI_NAME,
  ENDE_NAME,
  schrittKurzform,
  type JetztDran,
  type ProzessSchritt,
  type ProzessStand,
  type SchrittStatus,
} from "@/lib/prozess/prozess-stand";
import { Statuspille, type StatusTon } from "@/components/ui/statuspille";

interface SchrittFarben {
  /** Rand, Flaeche und Schrift des Punkts — ein Text-auf-Grund-Paar. */
  punkt: string;
  titel: string;
  unterzeile: string;
}

/**
 * Farbklassen der Leiste. Ausgeschrieben, damit Tailwind sie findet; je
 * Eintrag hoechstens eine `bg-…`- und eine `text-…`-Klasse, damit der
 * Kontrasttest die Paare lesen kann. Titel, Unterzeilen und der Kasten stehen
 * ohne eigenen Grund auf der Flaeche der Leiste (`card`).
 */
export const PROZESS_FARBEN = {
  schritt: {
    erledigt: { punkt: "border-ok bg-ok text-card", titel: "text-ink", unterzeile: "text-ink-2" },
    aktiv: { punkt: "border-ink bg-card text-ink", titel: "text-ink", unterzeile: "text-ink-2" },
    // Der Rand in ink-3 ist Zierde; die Nummer darin ist Text und nimmt ink-2.
    kommend: { punkt: "border-ink-3 bg-card text-ink-2", titel: "text-ink-2", unterzeile: "text-ink-2" },
    // Hier TRAEGT der Rand: Unter 640 px ist der durchgestrichene Titel nicht
    // zu sehen, „uebersprungen" zeigt dann allein die Strichelung — sie braucht
    // 3:1 (ink-3 haette 2,8:1).
    uebersprungen: { punkt: "border-ink-2 bg-card text-ink-2", titel: "text-ink-2", unterzeile: "text-ink-2" },
  } satisfies Record<SchrittStatus, SchrittFarben>,
  /** Strecke zwischen zwei Punkten: zurueckgelegt oder noch offen (Zierde). */
  linie: { erledigt: "border-ok", offen: "border-hairline" },
  /** Hof um den aktiven Punkt (Zierde). */
  hof: "ring-action-soft",
  /** Der nicht gewaehlte Weg einer Verzweigung. */
  sonst: "border-ink-3 text-ink-2",
  kurzform: "text-ink",
  jetztDran: { label: "text-ink-2", satz: "text-ink", unterzeile: "text-ink-2", frist: "text-ink" },
  /** Symbol vor dem Wort am Ende des Ablaufs; das Wort selbst ist `jetztDran.satz`. */
  ende: { abgeschlossen: "text-ok", abgebrochen: "text-ink-2" },
} as const;

/** Der Zustand eines Schritts als Wort — nur fuer Screenreader. */
export const SCHRITT_WORT: Record<SchrittStatus, string> = {
  erledigt: "erledigt",
  aktiv: "aktuell",
  kommend: "kommt noch",
  uebersprungen: "übersprungen",
};

/** Ein kommender Schritt in einem beendeten Ablauf. */
export const SCHRITT_WORT_NICHT_ERREICHT = "nicht erreicht";

const DRINGLICHKEIT: Record<NonNullable<JetztDran["dringlichkeit"]>, { ton: StatusTon; text: string }> = {
  critical: { ton: "critical", text: "Kritisch" },
  wait: { ton: "wait", text: "Frist naht" },
};

const ENDE_SYMBOL: Record<NonNullable<ProzessStand["ende"]>, LucideIcon> = {
  abgeschlossen: CircleCheck,
  abgebrochen: Ban,
};

/**
 * Die Linie liegt auf der Mitte des Punkts — 6 px Abstand oben (`pt-1.5` des
 * Schritts), 28 px Punkt, 2 px Linie — und endet 18 px vor seiner Mitte:
 * 14 px Halbmesser plus 4 px Hof.
 */
const LINIE = "absolute top-[19px] border-t-2";

const FOKUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action";

export interface ProzessleisteProps {
  stand: ProzessStand;
  /** Name der Leiste fuer Screenreader; Vorgabe „Ablauf". */
  label?: string;
  /** Die eine Handlung zu „Jetzt dran" – ein fertiges Element (ein `Button`). Die Seite gibt es nur mit Bearbeitungsrecht mit. */
  aktion?: ReactNode;
  /** Hoechstens eine zweite, nachrangige Handlung. */
  nebenAktion?: ReactNode;
  /** Ein Schritt mit `reiter` wird zum Knopf und ruft dies. Ohne Handler ist KEIN Schritt ein Knopf. */
  onReiter?: (reiter: string) => void;
  className?: string;
}

/**
 * Die Strecke VOR dem Schritt `index` ist zurueckgelegt, wenn der Ablauf den
 * Schritt davor hinter sich hat (erledigt oder uebersprungen) und diesen
 * erreicht hat (alles ausser „kommend").
 */
function streckeZurueckgelegt(schritte: readonly ProzessSchritt[], index: number): boolean {
  const davor = schritte[index - 1].status;
  return (davor === "erledigt" || davor === "uebersprungen") && schritte[index].status !== "kommend";
}

const linienFarbe = (zurueckgelegt: boolean) =>
  zurueckgelegt ? PROZESS_FARBEN.linie.erledigt : PROZESS_FARBEN.linie.offen;

interface SchrittProps {
  schritte: readonly ProzessSchritt[];
  index: number;
  beendet: boolean;
  onReiter?: (reiter: string) => void;
}

function Schritt({ schritte, index, beendet, onReiter }: SchrittProps) {
  const schritt = schritte[index];
  const { status, reiter } = schritt;
  const farben = PROZESS_FARBEN.schritt[status];
  const unterzeile = [schritt.zustaendig, schritt.notiz, formatDatumDE(schritt.datum)].filter(Boolean).join(" · ");
  const wort = status === "kommend" && beendet ? SCHRITT_WORT_NICHT_ERREICHT : SCHRITT_WORT[status];
  const oeffnen = reiter && onReiter ? () => onReiter(reiter) : null;

  const inhalt = (
    <>
      <span
        aria-hidden="true"
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold tabular-nums",
          farben.punkt,
          status === "uebersprungen" && "border-dashed",
          status === "aktiv" &&
            cn(
              "ring-4",
              PROZESS_FARBEN.hof,
              // Windows-Kontrastmodus: Der Hof ist ein Schatten und entfaellt
              // dort — der aktive Punkt saehe aus wie ein kommender.
              "forced-colors:forced-color-adjust-none forced-colors:border-[color:Highlight] forced-colors:bg-[Highlight] forced-colors:text-[color:HighlightText]",
            ),
        )}
      >
        {status === "erledigt" ? <Check className="h-4 w-4" strokeWidth={3} /> : index + 1}
      </span>
      <span
        className={cn(
          "mt-1.5 block max-w-full text-sm wrap-break-word max-sm:sr-only",
          status === "aktiv" ? "font-semibold" : "font-medium",
          farben.titel,
          status === "uebersprungen" && "line-through",
          // Durchgestrichen bleibt durchgestrichen: Unterstreichen und
          // Durchstreichen sind dieselbe CSS-Eigenschaft.
          oeffnen && status !== "uebersprungen" && "underline-offset-2 group-hover:underline",
        )}
      >
        {schritt.titel}
      </span>
      {" "}
      <span className="sr-only">({wort})</span>
      {unterzeile && (
        <>
          {" "}
          <span className={cn("mt-0.5 block max-w-full text-xs wrap-break-word max-sm:sr-only", farben.unterzeile)}>
            {unterzeile}
          </span>
        </>
      )}
      {schritt.sonst && (
        <>
          {" "}
          <span
            className={cn(
              "mt-1 inline-block max-w-full rounded-md border border-dashed px-1.5 py-px text-xs wrap-break-word max-sm:sr-only",
              PROZESS_FARBEN.sonst,
            )}
          >
            {schritt.sonst}
          </span>
        </>
      )}
    </>
  );

  // `relative`: Der Inhalt liegt ueber den Linien, nicht darunter. Der Abstand
  // oben haelt den Hof des aktiven Punkts innerhalb des Fokusrings. `max-w-full`
  // an den Texten: Ein Wort, das breiter ist als die Spalte, bricht dann um,
  // statt in die Nachbarspalte zu ragen.
  const rahmen = "relative flex w-full flex-col items-center px-1 pt-1.5 pb-1 text-center";

  return (
    <li data-status={status} aria-current={status === "aktiv" ? "step" : undefined} className="relative min-w-0 flex-1">
      {index > 0 && (
        <span
          aria-hidden="true"
          className={cn(LINIE, "left-0 right-[calc(50%+18px)]", linienFarbe(streckeZurueckgelegt(schritte, index)))}
        />
      )}
      {index < schritte.length - 1 && (
        <span
          aria-hidden="true"
          className={cn(LINIE, "left-[calc(50%+18px)] right-0", linienFarbe(streckeZurueckgelegt(schritte, index + 1)))}
        />
      )}
      {oeffnen ? (
        <button type="button" onClick={oeffnen} className={cn(rahmen, "group cursor-pointer rounded-lg", FOKUS)}>
          {inhalt}
        </button>
      ) : (
        <div className={rahmen}>{inhalt}</div>
      )}
    </li>
  );
}

export function Prozessleiste({ stand, label = "Ablauf", aktion, nebenAktion, onReiter, className }: ProzessleisteProps) {
  const { schritte, jetztDran, ende } = stand;
  // Ohne aktiven Schritt waere die Kurzform das Wort fuer das Ende — das steht
  // schon im Kasten darunter.
  const kurzform = schritte.some((s) => s.status === "aktiv") ? schrittKurzform(stand) : "";
  const dringlichkeit = jetztDran?.dringlichkeit ? DRINGLICHKEIT[jetztDran.dringlichkeit] : null;
  const EndeSymbol = ende ? ENDE_SYMBOL[ende] : null;

  if (schritte.length === 0 && !jetztDran && !ende) return null;

  return (
    <div
      data-prozessleiste=""
      className={cn(
        // Flaeche wie `Gruppe`; der durchsichtige Rand haelt sie im
        // Windows-Kontrastmodus sichtbar (der Ring ist ein Schatten).
        "divide-y divide-hairline rounded-xl border border-transparent bg-card ring-1 ring-hairline",
        className,
      )}
    >
      {schritte.length > 0 && (
        <div className="px-2 pt-2.5 pb-2 sm:px-4">
          {/* `role="list"` ausdruecklich: Tailwind nimmt der Liste die Zeichen
              (`list-style: none`), und Safari mit VoiceOver sagt eine Liste ohne
              Zeichen ausserhalb von `nav` nicht mehr als Liste an — „3 von 5"
              entfiele, und die Nummer im Punkt ist Zierde. */}
          <ol role="list" aria-label={label} className="flex items-start">
            {schritte.map((schritt, index) => (
              <Schritt key={schritt.key} schritte={schritte} index={index} beendet={Boolean(ende)} onReiter={onReiter} />
            ))}
          </ol>
          {kurzform && (
            <p className={cn("mt-2 text-center text-xs font-medium wrap-break-word sm:hidden", PROZESS_FARBEN.kurzform)}>
              {kurzform}
            </p>
          )}
        </div>
      )}

      {jetztDran ? (
        <div data-jetzt-dran="" className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-3">
          <div className="min-w-0 grow basis-72">
            <p
              className={cn(
                "font-heading text-2xs font-semibold uppercase tracking-label",
                PROZESS_FARBEN.jetztDran.label,
              )}
            >
              Jetzt dran · {BEI_NAME[jetztDran.bei]}
            </p>
            <p className={cn("mt-0.5 text-sm font-semibold wrap-break-word", PROZESS_FARBEN.jetztDran.satz)}>
              {jetztDran.satz}
            </p>
            {jetztDran.unterzeile && (
              <p className={cn("mt-0.5 text-xs wrap-anywhere", PROZESS_FARBEN.jetztDran.unterzeile)}>
                {jetztDran.unterzeile}
              </p>
            )}
            {(jetztDran.frist || dringlichkeit) && (
              <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                {jetztDran.frist && (
                  <span className={cn("min-w-0 text-xs font-medium wrap-break-word", PROZESS_FARBEN.jetztDran.frist)}>
                    {jetztDran.frist}
                  </span>
                )}
                {dringlichkeit && <Statuspille ton={dringlichkeit.ton}>{dringlichkeit.text}</Statuspille>}
              </p>
            )}
          </div>
          {/* Hauptknopf zuerst: Tab-Reihenfolge = Quelltext = Anzeige (siehe Kopf). */}
          {(aktion || nebenAktion) && (
            <div className="flex flex-wrap items-center gap-2">
              {aktion}
              {nebenAktion}
            </div>
          )}
        </div>
      ) : ende && EndeSymbol ? (
        <div data-ende={ende} className="flex items-center gap-2 px-4 py-3">
          <EndeSymbol aria-hidden="true" className={cn("h-4 w-4 shrink-0", PROZESS_FARBEN.ende[ende])} />
          <p className={cn("text-sm font-semibold", PROZESS_FARBEN.jetztDran.satz)}>{ENDE_NAME[ende]}</p>
        </div>
      ) : null}
    </div>
  );
}
