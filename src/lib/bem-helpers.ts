/**
 * CREDO HR-Portal — Helper-Funktionen BEM
 *
 * displayId-Generierung im Format `BEM-{year}-{shortName}-{nr3}`.
 * Beispiel: "BEM-2026-GYM-001". Retry-Logik (3 Versuche) gegen Race-Conditions.
 */

import { prisma } from "@/lib/db";
import { vorgangsjahrInBerlin } from "@/lib/vorgangsjahr";

export async function generateBemDisplayId(
  organizationId: string,
  shortName: string,
): Promise<{ displayId: string; sequentialNumber: number }> {
  // Jahr und Zaehlbereich in deutscher Zeit — der Container laeuft in UTC
  // (src/lib/vorgangsjahr.ts).
  const { jahr: currentYear, von: yearStart, bis: yearEnd } = vorgangsjahrInBerlin(new Date());

  let displayId = "";
  let sequentialNumber = 0;

  for (let attempt = 0; attempt < 3; attempt++) {
    const countThisYear = await prisma.bemFall.count({
      where: {
        organizationId,
        createdAt: { gte: yearStart, lt: yearEnd },
      },
    });
    sequentialNumber = countThisYear + 1 + attempt;
    displayId = `BEM-${currentYear}-${shortName}-${sequentialNumber
      .toString()
      .padStart(3, "0")}`;
    const exists = await prisma.bemFall.findUnique({
      where: { displayId },
      select: { id: true },
    });
    if (!exists) break;
  }

  return { displayId, sequentialNumber };
}
