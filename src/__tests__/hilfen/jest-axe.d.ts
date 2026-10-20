/**
 * Typen fuer den einen Aufruf, den die Tests aus `jest-axe` nutzen.
 * Bewusst ohne `@types/jest-axe` — Begruendung in `axe.ts` daneben.
 */
declare module "jest-axe" {
  export interface AxeKnoten {
    target: string[];
    html: string;
  }
  export interface AxeVerstoss {
    id: string;
    help: string;
    impact?: string | null;
    nodes: AxeKnoten[];
  }
  export function axe(
    html: Element | string,
    optionen?: Record<string, unknown>,
  ): Promise<{ violations: AxeVerstoss[] }>;
}
