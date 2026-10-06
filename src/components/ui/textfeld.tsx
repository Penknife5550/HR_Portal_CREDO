/**
 * Textfeld (UX-Umbau „Klarer Weg", Pilot Vertragsende)
 *
 * Eine Eingabezeile mit sichtbarer Beschriftung, optionalem Hilfetext und
 * Fehlertext:
 *
 *   <Textfeld
 *     label="E-Mail der Führungskraft"
 *     type="email"
 *     hilfe="An diese Adresse geht der Link zum Formular."
 *     fehler={fehler}
 *     value={adresse}
 *     onChange={(e) => setAdresse(e.target.value)}
 *   />
 *
 * Regeln:
 *   - Die Beschriftung ist Pflicht und steht SICHTBAR ueber dem Feld — nie nur
 *     als Platzhalter (der verschwindet beim Tippen, und wer zurueckkommt,
 *     weiss nicht mehr, was in das Feld gehoert).
 *   - Hilfe- und Fehlertext sind ueber `aria-describedby` mit dem Feld
 *     verknuepft (erst die Hilfe, dann der Fehler; eine eigene
 *     `aria-describedby` des Aufrufers kommt dazu). Ein Fehler setzt
 *     `aria-invalid`, faerbt den Rand und steht als Text unter dem Feld — nie
 *     nur als Farbe. Ein leerer Fehler (`""`, nur Leerraum) ist keiner.
 *   - Den Fokus auf einen neuen Fehler legt der Dialog (`fehler` am Dialog);
 *     das Feld selbst springt nicht.
 *   - Nur Text-artige Felder (`text`, `email`, `tel`, `url`). Datum und Auswahl
 *     sind eigene Bausteine und kommen mit ihrem ersten Aufrufer.
 *   - Platzhalter in `ink-2`, nie `ink-3` (ein Platzhalter ist nach WCAG Text).
 *     Der Rand in `ink-2` haelt die 3:1 fuer Bedienelemente; `hairline` waere
 *     als Grenze des Felds kaum zu sehen.
 *   - `className` gehoert an die Huelle (Breite, Abstand), alles andere —
 *     `id`, `name`, `value`, `required`, `data-autofokus` … — an das Feld.
 *   - Farben: `TEXTFELD_FARBEN` ist die EINE Quelle (der Kontrasttest liest sie).
 */
import { useId, type ComponentProps, type ReactNode } from "react";
import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

/** Farbklassen je Teil. Ausgeschrieben, damit Tailwind sie findet. */
export const TEXTFELD_FARBEN = {
  beschriftung: "text-ink",
  feld: "border-ink-2 bg-card text-ink placeholder:text-ink-2",
  fehlerRand: "border-critical",
  gesperrt: "disabled:bg-surface disabled:text-ink-2",
  hilfe: "text-ink-2",
  fehler: "text-critical",
} as const;

export type TextfeldTyp = "text" | "email" | "tel" | "url";

export interface TextfeldProps extends Omit<ComponentProps<"input">, "type" | "children"> {
  /** Sichtbare Beschriftung — Pflicht. */
  label: string;
  type?: TextfeldTyp;
  /** Ein Satz, was in das Feld gehoert. */
  hilfe?: ReactNode;
  /** Was an der Eingabe falsch ist; leer = kein Fehler. */
  fehler?: string;
}

export function Textfeld({
  label,
  type = "text",
  hilfe,
  fehler,
  id,
  className,
  "aria-describedby": beschriebenDurch,
  "aria-invalid": ungueltig,
  ...rest
}: TextfeldProps) {
  const eigeneId = useId();
  const feldId = id ?? eigeneId;
  const hilfeId = `${feldId}-hilfe`;
  const fehlerId = `${feldId}-fehler`;
  const hatFehler = fehler !== undefined && fehler.trim() !== "";
  const beschreibung = [hilfe ? hilfeId : null, hatFehler ? fehlerId : null, beschriebenDurch ?? null]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={feldId} className={cn("block text-sm font-semibold wrap-break-word", TEXTFELD_FARBEN.beschriftung)}>
        {label}
      </label>
      {hilfe && (
        <p id={hilfeId} className={cn("text-xs wrap-break-word", TEXTFELD_FARBEN.hilfe)}>
          {hilfe}
        </p>
      )}
      <input
        {...rest}
        id={feldId}
        type={type}
        aria-describedby={beschreibung || undefined}
        aria-invalid={hatFehler ? true : ungueltig}
        className={cn(
          "h-10 w-full min-w-0 rounded-lg border px-3 text-sm",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action",
          "disabled:cursor-not-allowed",
          TEXTFELD_FARBEN.feld,
          TEXTFELD_FARBEN.gesperrt,
          hatFehler && TEXTFELD_FARBEN.fehlerRand,
        )}
      />
      {hatFehler && (
        <p id={fehlerId} className={cn("flex items-start gap-1.5 text-xs font-medium", TEXTFELD_FARBEN.fehler)}>
          <AlertCircle aria-hidden="true" className="mt-px h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 wrap-break-word">{fehler}</span>
        </p>
      )}
    </div>
  );
}
