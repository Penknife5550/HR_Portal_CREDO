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
 *   - `laedt` sperrt mit `aria-disabled` + `aria-busy`, NICHT mit `disabled`:
 *     Der Knopf behaelt den Tastaturfokus, waehrend die Aktion laeuft, und der
 *     Text bleibt stehen (kein Springen der Breite). Klicks tun in der Zeit
 *     nichts. Ein echtes `disabled` gibt es weiterhin als Eigenschaft.
 *   - `asChild` reicht Aussehen und Verhalten an das Kind weiter — fuer
 *     `<Link>` aus next/link, damit ein Verweis wie ein Knopf aussieht, aber
 *     ein Verweis bleibt.
 *   - Farben nur aus den Tokens (globals.css); die Paare stehen im
 *     Kontrasttest (ui-kontrast.test.ts).
 */
import { forwardRef, type ButtonHTMLAttributes, type MouseEvent } from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonKlassen = cva(
  [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-semibold",
    "transition-colors select-none",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action",
    "disabled:pointer-events-none disabled:opacity-50",
    "aria-disabled:cursor-default aria-disabled:opacity-60",
  ],
  {
    variants: {
      variante: {
        primary: "bg-action text-action-foreground hover:bg-ink",
        secondary: "bg-card text-ink ring-1 ring-inset ring-hairline hover:bg-neutral-soft",
        ghost: "text-ink hover:bg-neutral-soft",
        // Dunkler beim Ueberfahren (nicht heller): Der Kontrast zum weissen
        // Text darf dabei nur steigen.
        critical: "bg-critical text-critical-foreground hover:brightness-90",
      },
      groesse: {
        md: "h-10 px-4 text-sm",
        sm: "h-8 px-3 text-xs",
      },
    },
    defaultVariants: { variante: "secondary", groesse: "md" },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonKlassen> {
  /** Aktion laeuft: gesperrt, aber fokussierbar; der Text bleibt stehen. */
  laedt?: boolean;
  /** Aussehen an das einzige Kind weiterreichen (z. B. `<Link>`). */
  asChild?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variante, groesse, laedt = false, asChild = false, className, onClick, type, children, ...rest },
  ref,
) {
  const Element = asChild ? Slot : "button";

  function beiKlick(e: MouseEvent<HTMLButtonElement>) {
    if (laedt) {
      e.preventDefault();
      return;
    }
    onClick?.(e);
  }

  return (
    <Element
      ref={ref}
      // Ein Verweis kennt kein `type`; nur der echte Knopf bekommt die Vorgabe.
      {...(asChild ? {} : { type: type ?? "button" })}
      aria-disabled={laedt || undefined}
      aria-busy={laedt || undefined}
      className={cn(buttonKlassen({ variante, groesse }), className)}
      onClick={beiKlick}
      {...rest}
    >
      {children}
    </Element>
  );
});
