/**
 * Public Verify-/Audit-Page (Phase 6).
 *
 * SSR, kein Login, keine Indizierung. Wird über einen kryptografisch starken
 * `verifyToken` (UUID) erreicht und zeigt eine Read-Only-Sicht auf die
 * dienstliche Beurteilung — für Bezirksregierung und unabhaengige Auditoren.
 *
 * Liefert KEINE sensitiven Felder (IBAN, SV-Nr, Steuer-ID).
 */

import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { createRateLimiter } from "@/lib/rate-limit";
import { loadVerifyAssessment } from "@/lib/verify-assessment";
import { AuditView } from "./audit-view";

const verifyPageLimiter = createRateLimiter("verify-assessment-page", {
  maxRequests: 30,
  windowMs: 60_000,
});

// Audit-Log muss bei jedem Aufruf laufen — keine Static Generation.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Verifikation — CREDO HR-Portal",
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false },
  },
};

export default async function VerifyAssessmentPage({
  params,
}: {
  params: Promise<{ verifyToken: string }>;
}) {
  const { verifyToken } = await params;

  const headerList = await headers();
  const ip =
    headerList.get("x-forwarded-for")?.split(",")[0].trim() ||
    headerList.get("x-real-ip") ||
    "unknown";

  const rl = verifyPageLimiter.check(ip);
  if (!rl.allowed) {
    return (
      <div className="mx-auto max-w-md p-8 text-center text-sm text-gray-600">
        <h1 className="mb-2 text-lg font-bold text-gray-900">
          Zu viele Anfragen
        </h1>
        <p>
          Bitte versuchen Sie es in Kürze erneut. Diese Verifikations-Sicht ist
          gegen automatisierte Zugriffe geschützt.
        </p>
      </div>
    );
  }

  const data = await loadVerifyAssessment(verifyToken, ip);
  if (!data) {
    notFound();
  }

  return <AuditView data={data} />;
}
