/**
 * API: GET /api/onboarding/:id/fuehrungszeugnis-antrag
 *
 * Erzeugt die "Aufforderung zur Vorlage eines erweiterten Fuehrungszeugnisses"
 * als Word-Dokument (.docx) und liefert sie als Download.
 *
 * Auth: HR_EDIT_ROLES; Multi-Tenant: canAccessProcess (404 statt 403).
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canAccessProcess, HR_EDIT_ROLES } from "@/lib/permissions";
import { resolveVerantwortlicheStelle } from "@/lib/dsgvo";
import { generateFuehrungszeugnisAntragDocx } from "@/lib/docx-fuehrungszeugnis";

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
      include: { organization: true, personalData: true },
    });

    if (!process || !(await canAccessProcess(session, process.organizationId))) {
      return NextResponse.json({ error: "Vorgang nicht gefunden" }, { status: 404 });
    }

    const pd = process.personalData;
    const vs = resolveVerantwortlicheStelle(process.organization);

    const salutation = pd?.salutation ?? "";
    const titlePart = pd?.title ? `${pd.title} ` : "";
    const firstName = pd?.firstName ?? process.firstName ?? "";
    const lastName = pd?.lastName ?? process.lastName ?? "";
    const anredeName = `${salutation ? salutation + " " : ""}${titlePart}${firstName} ${lastName}`.trim();

    const strasse = [pd?.street, pd?.houseNumber].filter(Boolean).join(" ");
    const ort = [pd?.zipCode, pd?.city].filter(Boolean).join(" ");

    const unterzeichner =
      process.organization.ezGfFirstName && process.organization.ezGfLastName
        ? `${process.organization.ezGfTitle ? process.organization.ezGfTitle + " " : ""}${process.organization.ezGfFirstName} ${process.organization.ezGfLastName}`
        : "i. A. Personalabteilung";

    const datum = new Date().toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });

    const buffer = await generateFuehrungszeugnisAntragDocx({
      anredeName: anredeName || "Sehr geehrte Damen und Herren",
      empfaengerStrasse: strasse || "—",
      empfaengerOrt: ort || "—",
      absenderName: vs.name,
      absenderStrasse: vs.strasse,
      absenderOrt: `${vs.plz} ${vs.ort}`,
      unterzeichner,
      ortDatum: `${vs.ort}, den ${datum}`,
    });

    const safeName = (lastName || "Mitarbeiter").replace(/[^a-zA-Z0-9._-]/g, "_");

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="Fuehrungszeugnis-Antrag_${safeName}.docx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[API] fuehrungszeugnis-antrag fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
