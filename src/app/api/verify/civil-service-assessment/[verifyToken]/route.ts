/**
 * API: /api/verify/civil-service-assessment/:verifyToken
 *
 * GET — Public, kein Login. Liefert die Daten fuer die oeffentliche
 * Audit-Page (Phase 6). Wird sowohl von der Page direkt im SSR aufgerufen
 * als auch fuer programmatische Verifikation z. B. durch die Bezirks-
 * regierung verwendet.
 *
 * Sicherheit:
 * - Nur Lookup ueber `verifyToken` (UUID v4, schwer ratbar)
 * - Rate-Limit pro IP (30/min) gegen Token-Enumeration
 * - Audit-Log bei jedem erfolgreichen + jedem fehlgeschlagenen Aufruf
 * - Cache-Control: no-store
 * - Liefert KEINE sensiblen Felder (IBAN, SV-Nr, Steuer-ID etc.)
 */

import { NextRequest, NextResponse } from "next/server";
import { createRateLimiter, getClientIp } from "@/lib/rate-limit";
import { loadVerifyAssessment } from "@/lib/verify-assessment";

const verifyLimiter = createRateLimiter("verify-assessment", {
  maxRequests: 30,
  windowMs: 60_000,
});

// Niemals statisch cachen — Audit-Log muss bei jedem Aufruf laufen.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ verifyToken: string }> },
) {
  const { verifyToken } = await params;
  const ip = getClientIp(request);

  const rl = verifyLimiter.check(ip);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Zu viele Anfragen. Bitte warten." },
      {
        status: 429,
        headers: {
          "Cache-Control": "no-store",
          "Retry-After": Math.ceil((rl.retryAfterMs ?? 1000) / 1000).toString(),
        },
      },
    );
  }

  const data = await loadVerifyAssessment(verifyToken, ip);
  if (!data) {
    return NextResponse.json(
      { error: "Beurteilung nicht gefunden" },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json(
    { data },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex, nofollow",
      },
    },
  );
}
