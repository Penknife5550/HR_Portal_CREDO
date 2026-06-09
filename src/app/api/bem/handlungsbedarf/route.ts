/**
 * API: GET /api/bem/handlungsbedarf
 *
 * Fallübergreifende Sicht: offene, bald fällige oder überfällige BEM-Fristen
 * über ALLE Fälle, für die der/die Nutzer:in freigegeben ist (bemFilter — kein
 * globaler Bypass). Liefert die Liste + Zähler für das Nav-Badge.
 *
 * "Handlungsbedarf" = Severity WARNING/URGENT/OVERDUE (INFO/„im Plan" wird
 * ausgeblendet, um die Liste auf das Wesentliche zu reduzieren).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { BEM_PORTAL_ROLES, bemFilter } from "@/lib/permissions";
import { berechneSeverity } from "@/lib/bem-fristen";
import type { BemFristSeverity } from "@prisma/client";

const RANK: Record<BemFristSeverity, number> = {
  OVERDUE: 0,
  URGENT: 1,
  WARNING: 2,
  INFO: 3,
};

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }
    if (!BEM_PORTAL_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    }

    const filter = await bemFilter(session);
    const ids = filter.id.in;
    const countOnly = new URL(request.url).searchParams.get("countOnly") === "1";

    if (ids.length === 0) {
      return NextResponse.json({
        data: { items: [], counts: { overdue: 0, urgent: 0, warning: 0, total: 0 } },
      });
    }

    const fristen = await prisma.bemFrist.findMany({
      where: { erledigtAm: null, bemFallId: { in: ids } },
      include: {
        bemFall: {
          select: {
            id: true,
            displayId: true,
            employeeFirstName: true,
            employeeLastName: true,
            status: true,
          },
        },
      },
    });

    const now = new Date();
    const counts = { overdue: 0, urgent: 0, warning: 0, total: 0 };
    const items = [];
    for (const f of fristen) {
      const severity = berechneSeverity(f.faelligAm, now);
      if (severity === "INFO") continue; // nur Handlungsbedarf
      counts.total++;
      if (severity === "OVERDUE") counts.overdue++;
      else if (severity === "URGENT") counts.urgent++;
      else if (severity === "WARNING") counts.warning++;
      items.push({
        fallId: f.bemFall.id,
        displayId: f.bemFall.displayId,
        employeeName:
          `${f.bemFall.employeeFirstName} ${f.bemFall.employeeLastName}`.trim(),
        bezeichnung: f.bezeichnung,
        faelligAm: f.faelligAm,
        severity,
      });
    }

    if (countOnly) {
      return NextResponse.json({ data: { counts } });
    }

    items.sort((a, b) => {
      const r = RANK[a.severity] - RANK[b.severity];
      return r !== 0 ? r : a.faelligAm.getTime() - b.faelligAm.getTime();
    });

    return NextResponse.json({ data: { items: items.slice(0, 100), counts } });
  } catch (error) {
    console.error("[API] BEM Handlungsbedarf GET fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
