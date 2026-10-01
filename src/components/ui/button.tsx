"use client";

/**
 * Button (UX-Umbau „Klarer Weg", U0)
 *
 * Der EINE Knopf des Portals. Vier Varianten, zwei Groessen:
 *   primary    – die eine wichtigste Handlung einer Ansicht (CI-Grau, `action`)
 *   secondary  – alles daneben
 *   ghost      – unauffaellig, in Zeilen und Kopfzeilen
 *   critical   – loeschen, stornieren, zurueckziehen
 *
 * Regeln:
 *   - `type="button"` ist Vorgabe. Ein Knopf in einem Formular schickt es sonst
 *     ab, ohne dass es jemand wollte.
 *   - GESPERRT ist der Knopf bei `laedt`, bei `aria-disabled` und — als Verweis
 *     (`asChild`) — bei `disabled`. Gesperrt heisst: `aria-disabled="true"`,
 *     der Knopf bleibt fokussierbar, und KEIN Handler laeuft — weder der eigene
 *     `onClick` noch der eines Kindes (`asChild`), noch `onPointerDown` /
 *     `onKeyDown` (damit oeffnet Radix seine Menues), noch der einer
 *     klickbaren Zeile darum herum. Die Sperre sitzt deshalb in der
 *     Capture-Phase: Dort haelt sie das Ereignis an, bevor es irgendwen
 *     erreicht. Tab funktioniert weiter.
 *   - `laedt` zeigt ein Ladesymbol und laesst Text und Farben voll stehen —
 *     der Text ist in dem Moment die Statusmeldung („Wird gesendet …"). Nur
 *     ein ohne `laedt` gesperrter Knopf wird abgeblendet.
 *   - Ein echtes `disabled` gibt es weiterhin (nur am echten Knopf). Es nimmt
 *     dem Knopf NICHT die Zeigerereignisse: Mit `pointer-events: none` fiele
 *     der Klick auf das Element dahinter, etwa eine klickbare Zeile.
 *   - `asChild` reicht Aussehen und Sperre an das einzige Kind weiter — fuer
 *     `<Link>` aus next/link. Ein Verweis kennt weder `disabled` noch `type`:
 *     `disabled` wird zur Sperre, `type` nur durchgereicht, wenn es
 *     ausdruecklich gesetzt ist. Klassen gehoeren an den Button, nicht an das
 *     Kind — nur dort fuehrt `cn()` sie zusammen.
 *   - Farben nur aus den Tokens. `BUTTON_FARBEN` ist die EINE Quelle fuer die
 *     Paare; der Kontrasttest (ui-kontrast.test.ts) liest sie von hier.
 *   - Der durchsichtige Rand haelt den Knopf im Windows-Kontrastmodus sichtbar
 *     (dort entfallen Flaechen und Schatten, Raender bleiben).
 */
import {
  forwardRef,
  type ButtonHTMLAttributes,
  type KeyboardEvent,
  type SyntheticEvent,
} from "react";
import { Slot } from "@radix-ui/react-slot";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type ButtonVariante = "primary" | "secondary" | "ghost" | "critical";
export type ButtonGroesse = "md" | "sm";

/**
 * Farbklassen je Variante: `ruhe` immer, `hover` nur, solange der Knopf nicht
 * gesperrt ist. Ausgeschriebene Klassen (Tailwind findet nur solche).
 */
export const BUTTON_FARBEN: Record<ButtonVariante, { ruhe: string; hover: string }> = {
  primary: { ruhe: "bg-action text-action-foreground", hover: "hover:bg-ink" },
  secondary: { ruhe: "bg-card text-ink ring-1 ring-inset ring-hairline", hover: "hover:bg-neutral-soft" },
  ghost: { ruhe: "text-ink", hover: "hover:bg-neutral-soft" },
  critical: { ruhe: "bg-critical text-critical-foreground", hover: "hover:bg-critical-hover" },
};

const GROESSEN: Record<ButtonGroesse, string> = {
  md: "h-10 px-4 text-sm",
  sm: "h-8 px-3 text-xs",
};

const GRUND =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-transparent font-semibold " +
  "transition-colors select-none " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action " +
  "disabled:cursor-default disabled:opacity-50";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: ButtonVariante;
  groesse?: ButtonGroesse;
  /** Aktion laeuft: gesperrt, aber fokussierbar; Text und Farben bleiben. */
  laedt?: boolean;
  /** Aussehen und Sperre an das einzige Kind weiterreichen (z. B. `<Link>`). */
  asChild?: boolean;
}

function anhalten(e: SyntheticEvent) {
  e.stopPropagation();
}

function klickSperren(e: SyntheticEvent) {
  e.preventDefault();
  e.stopPropagation();
}

function tasteSperren(e: KeyboardEvent) {
  // Tab muss weiterlaufen, sonst waere der Knopf eine Fokusfalle.
  if (e.key !== "Tab") e.stopPropagation();
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variante = "secondary",
    groesse = "md",
    laedt = false,
    asChild = false,
    className,
    type,
    disabled,
    "aria-disabled": ariaDisabled,
    children,
    ...rest
  },
  ref,
) {
  const Element = asChild ? Slot : "button";
  const gesperrt =
    laedt || ariaDisabled === true || ariaDisabled === "true" || (asChild && Boolean(disabled));
  const farben = BUTTON_FARBEN[variante];

  return (
    <Element
      ref={ref}
      // Zuerst, was der Aufrufer mitgibt — der Zustand unten gewinnt immer.
      {...rest}
      {...(asChild ? (type ? { type } : {}) : { type: type ?? "button", disabled })}
      aria-disabled={gesperrt || undefined}
      aria-busy={laedt || undefined}
      {...(gesperrt
        ? {
            onClickCapture: klickSperren,
            onPointerDownCapture: anhalten,
            onMouseDownCapture: anhalten,
            onKeyDownCapture: tasteSperren,
          }
        : {})}
      className={cn(
        GRUND,
        GROESSEN[groesse],
        farben.ruhe,
        !gesperrt && !disabled && farben.hover,
        laedt && "cursor-progress",
        gesperrt && !laedt && "cursor-default opacity-60",
        className,
      )}
    >
      {asChild ? (
        children
      ) : (
        <>
          {laedt && <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />}
          {children}
        </>
      )}
    </Element>
  );
});
