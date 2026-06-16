/**
 * Starterpaket an den neuen Mitarbeiter versenden (manuell, im Abschluss-Schritt).
 *
 * POST /api/onboarding/[id]/starterpaket
 *
 * Berechtigung: HR_EDIT_ROLES + Mandanten-Scope (canAccessProcess).
 * Resend ist erlaubt. Leere Konfiguration -> 409.
 */
import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api-handler";
import { prisma } from "@/lib/db";
import { HR_EDIT_ROLES, canAccessProcess } from "@/lib/permissions";
import { sendStarterpaket } from "@/lib/starterpaket";

function clientIp(headers: Headers): string | null {
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip") ||
    null
  );
}

export const POST = apiHandler(
  { roles: HR_EDIT_ROLES, logLabel: "Onboarding Starterpaket POST" },
  async ({ request, params, session }) => {
    if (!session) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }
    const { id } = params;

    const ob = await prisma.onboardingProcess.findUnique({
      where: { id },
      select: { id: true, organizationId: true },
    });
    if (!ob || !(await canAccessProcess(session, ob.organizationId))) {
      return NextResponse.json({ error: "Vorgang nicht gefunden" }, { status: 404 });
    }

    const result = await sendStarterpaket({
      onboardingId: id,
      userId: session.userId,
      ipAddress: clientIp(request.headers),
    });

    if (result.status === "NO_DOCS") {
      return NextResponse.json({ error: result.detail }, { status: 409 });
    }
    if (result.status !== "SENT") {
      return NextResponse.json(
        { error: result.detail || "Starterpaket konnte nicht versendet werden." },
        { status: 502 },
      );
    }

    return NextResponse.json({
      data: { sent: true, anzahl: result.dokumente?.length ?? 0, dokumente: result.dokumente },
    });
  },
);
