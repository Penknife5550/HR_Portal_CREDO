/**
 * CREDO HR-Portal — Helper-Funktionen BEM
 *
 * displayId-Generierung im Format `BEM-{year}-{shortName}-{nr3}`.
 * Beispiel: "BEM-2026-GYM-001". Retry-Logik (3 Versuche) gegen Race-Conditions.
 */

import { prisma } from "@/lib/db";

export async function generateBemDisplayId(
  organizationId: string,
  shortName: string,
): Promise<{ displayId: string; sequentialNumber: number }> {
  const currentYear = new Date().getFullYear();
  const yearStart = new Date(currentYear, 0, 1);
  const yearEnd = new Date(currentYear + 1, 0, 1);

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
