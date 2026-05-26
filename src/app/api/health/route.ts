/**
 * API: /api/health
 * Health-Check Endpoint für Docker Healthcheck und Monitoring
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    // DB-Verbindung pruefen
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok", timestamp: new Date().toISOString() });
  } catch {
    return NextResponse.json({ status: "error", message: "Database unavailable" }, { status: 503 });
  }
}
