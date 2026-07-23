/**
 * Vorgangs-Aufloesung fuer erzeugte Dokumente (Server).
 *
 * `GeneratedDocument` traegt nur `modul` + `refId`, keine echte Relation zum
 * Vorgang. Wer die Dokumente eines Vorgangs lesen will, muss den Vorgang daher
 * selbst aufloesen — nur so kommt man an den Mandanten und kann die
 * Berechtigung pruefen.
 *
 * Die client-sicheren Regeln (Frist, unterstuetzte Module) liegen in
 * erzeugte-dokumente.ts und werden hier re-exportiert.
 */

import { prisma } from "@/lib/db";

export {
  AUFBEWAHRUNG_MONATE,
  UNTERSTUETZTE_MODULE,
  istModulUnterstuetzt,
  aufbewahrungsGrenze,
} from "@/lib/erzeugte-dokumente";

/** Je Modul die Abfrage, die den Mandanten des Vorgangs liefert. */
const VORGANG_MANDANT: Record<string, (refId: string) => Promise<string | null>> = {
  ONBOARDING: async (refId) =>
    (
      await prisma.onboardingProcess.findUnique({
        where: { id: refId },
        select: { organizationId: true },
      })
    )?.organizationId ?? null,

  VERTRAGSVERLAENGERUNG: async (refId) =>
    (
      await prisma.contractEndProcess.findUnique({
        where: { id: refId },
        select: { organizationId: true },
      })
    )?.organizationId ?? null,
};

/**
 * Liefert den Mandanten des Vorgangs — oder null, wenn es den Vorgang nicht
 * gibt bzw. das Modul nicht unterstuetzt wird. Der Aufrufer prueft anschliessend
 * mit canAccessOrg, ob er den Vorgang sehen darf.
 */
export async function ladeVorgangsMandant(
  modul: string,
  refId: string,
): Promise<string | null> {
  const lookup = VORGANG_MANDANT[modul];
  if (!lookup) return null;
  return lookup(refId);
}
