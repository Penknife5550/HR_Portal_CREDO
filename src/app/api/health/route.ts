/**
 * API: /api/health
 * Health-Check Endpoint für Docker Healthcheck und Monitoring
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { zeitplanerZustand } from "@/lib/zeitplaner/uhr";

export async function GET() {
  try {
    // DB-Verbindung pruefen
    await prisma.$queryRaw`SELECT 1`;
    // Zeitplaner: laeuft die Uhr, wann kam der letzte Takt? (keine Details, keine Laeufe)
    const { uhrAktiv, letzterTakt } = zeitplanerZustand();
    return NextResponse.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      zeitplaner: { uhrAktiv, letzterTakt },
    });
  } catch {
    return NextResponse.json({ status: "error", message: "Database unavailable" }, { status: 503 });
  }
}
