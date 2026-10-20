/**
 * Zugriff auf Vorgaenge fuer die Mail-Routen (Reiter „E-Mails“ und dessen
 * Textansicht). Eine Stelle, damit Liste und Text dieselbe Mandantenpruefung
 * nehmen.
 */

import { prisma } from "@/lib/db";
import type { VorgangTyp } from "@/lib/vorgangs-mails";

/** Mandant des Vorgangs — `null`, wenn es ihn nicht gibt. */
export async function mandantDesVorgangs(typ: VorgangTyp, id: string): Promise<string | null> {
  const where = { where: { id }, select: { organizationId: true } } as const;
  const vorgang =
    typ === "ONBOARDING"
      ? await prisma.onboardingProcess.findUnique(where)
      : typ === "OFFBOARDING"
        ? await prisma.offboardingProcess.findUnique(where)
        : typ === "CIVIL_SERVICE"
          ? await prisma.civilServiceProcess.findUnique(where)
          : typ === "CONTRACT_END"
            ? await prisma.contractEndProcess.findUnique(where)
            : typ === "ELTERNZEIT"
              ? await prisma.elternzeitProzess.findUnique(where)
              : await prisma.mutterschutzProzess.findUnique(where);
  return vorgang?.organizationId ?? null;
}
