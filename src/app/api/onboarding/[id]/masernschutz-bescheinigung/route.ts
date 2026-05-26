/**
 * API: GET /api/onboarding/:id/masernschutz-bescheinigung
 *
 * Erzeugt das amtliche Masernschutz-Formular "Nachweis-Bescheinigung" als
 * Word-Dokument (.docx) mit vorbefuellten Personendaten und liefert es als Download.
 *
 * Auth: HR_EDIT_ROLES; Multi-Tenant: canAccessProcess (404 statt 403).
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canAccessProcess, HR_EDIT_ROLES } from "@/lib/permissions";
import { generateMasernschutzBescheinigungDocx } from "@/lib/docx-masernschutz";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }
    if (!HR_EDIT_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    }

    const { id } = await params;
    const process = await prisma.onboardingProcess.findUnique({
      where: { id },
      include: { organization: { select: { id: true } }, personalData: true },
    });

    if (!process || !(await canAccessProcess(session, process.organizationId))) {
      return NextResponse.json({ error: "Vorgang nicht gefunden" }, { status: 404 });
    }

    const pd = process.personalData;
    const firstName = pd?.firstName ?? process.firstName ?? "";
    const lastName = pd?.lastName ?? process.lastName ?? "";
    const nameVorname = [lastName, firstName].filter(Boolean).join(", ");

    const geburtstag = pd?.birthDate
      ? new Date(pd.birthDate).toLocaleDateString("de-DE", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        })
      : "";

    const strasse = [pd?.street, pd?.houseNumber].filter(Boolean).join(" ");
    const ort = [pd?.zipCode, pd?.city].filter(Boolean).join(" ");
    const wohnanschrift = [strasse, ort].filter(Boolean).join(", ");

    const buffer = await generateMasernschutzBescheinigungDocx({
      nameVorname,
      geburtstag,
      wohnanschrift,
    });

    const safeName = (lastName || "Mitarbeiter").replace(/[^a-zA-Z0-9._-]/g, "_");

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="Masernschutz-Bescheinigung_${safeName}.docx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[API] masernschutz-bescheinigung fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
