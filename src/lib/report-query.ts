/**
 * Gemeinsame Helfer fuer die Reporting-Endpunkte (/api/reports/*)
 *
 * - Rate-Limit gegen API-Key-Probing/DoS (in-memory Token-Bucket)
 * - Datums-Parsing mit explizitem Fehler statt Invalid-Date → Prisma-500
 */

import { NextResponse, type NextRequest } from "next/server";
import { createRateLimiter, getClientIp } from "@/lib/rate-limit";

const limiter = createRateLimiter("reports-api", {
  maxRequests: 60,
  windowMs: 60_000,
});

/** Liefert eine 429-Response wenn das Limit ueberschritten ist, sonst null */
export function reportRateLimit(request: NextRequest): NextResponse | null {
  const result = limiter.check(getClientIp(request));
  if (result.allowed) return null;
  return NextResponse.json(
    { error: "Zu viele Anfragen — bitte spaeter erneut versuchen" },
    {
      status: 429,
      headers: {
        "Retry-After": String(Math.ceil((result.retryAfterMs ?? 60_000) / 1000)),
      },
    }
  );
}

/**
 * Parst einen Datums-Query-Parameter.
 * null/leer → undefined (kein Filter); unparsebar → "invalid" (→ 400).
 */
export function parseReportDate(value: string | null): Date | undefined | "invalid" {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "invalid" : date;
}
