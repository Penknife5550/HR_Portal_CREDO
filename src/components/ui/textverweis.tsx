/**
 * Textverweis (UX-Umbau „Klarer Weg", Pilot Vertragsende)
 *
 * Ein Verweis im laufenden Text — in einem Satz, einem Dialog, einer
 * schmalen Zeile:
 *
 *   <p>
 *     Das Offboarding steht unter{" "}
 *     <Textverweis href={vorgangPfad("offboarding", id)}>OFF-2026-BK-001</Textverweis>.
 *   </p>
 *
 * Regeln:
 *   - Ein Verweis FUEHRT woandershin, ein Knopf HANDELT. Was etwas speichert,
 *     sendet oder einen Dialog oeffnet, ist ein `Button`; was eine andere
 *     Seite oder ein Mailprogramm oeffnet, ist ein Verweis. Ein Verweis, der
 *     wie ein Knopf aussehen soll, ist `<Button asChild><Link …/></Button>`.
 *   - Intern (`href` beginnt mit genau einem „/") geht er ueber `next/link`,
 *     sonst — `mailto:`, `https:`, `//host` — ist er ein einfaches `<a>`:
 *     Ein externes Ziel gehoert nicht in den Router.
 *   - Unterstrichen in `ink`, nie nur durch Farbe vom Text unterschieden;
 *     beim Ueberfahren verschwindet die Linie. Der Fokusring ist der der
 *     Bausteine (`action`). Der Kontrast von `ink` auf `card` und `surface`
 *     ist schon gerechnet — deshalb gibt es hier keine eigene Farbtabelle.
 *   - `className` kommt dazu (`cn()`), alles andere (`aria-*`, `target`,
 *     `rel` …) geht an das Element.
 */
import type { AnchorHTMLAttributes, ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

const KLASSEN =
  "rounded-sm font-medium text-ink underline underline-offset-2 hover:no-underline " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action";

export interface TextverweisProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "children"> {
  /** Interne Adresse (`/…`) oder ein externes Ziel (`mailto:`, `https:`). */
  href: string;
  children: ReactNode;
}

/** Interne Adresse des Portals: genau ein „/" am Anfang (`//host` ist extern). */
function istIntern(href: string): boolean {
  return href.startsWith("/") && !href.startsWith("//");
}

export function Textverweis({ href, children, className, ...rest }: TextverweisProps) {
  const klassen = cn(KLASSEN, className);
  if (istIntern(href)) {
    return (
      <Link {...rest} href={href} className={klassen}>
        {children}
      </Link>
    );
  }
  return (
    <a {...rest} href={href} className={klassen}>
      {children}
    </a>
  );
}
