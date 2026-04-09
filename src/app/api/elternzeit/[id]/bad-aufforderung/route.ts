/**
 * API: /api/elternzeit/[id]/bad-aufforderung
 *
 * GET – BAD-Aufforderungsbrief als PDF generieren + ausliefern.
 *       Sinnvoll fuer Mutterschutz-Bezug bei Kita-Mitarbeiterinnen.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { EXPORT_ROLES, canAccessProcess } from "@/lib/permissions";
import { generateBADAufforderungsbrief } from "@/lib/elternzeit-pdf";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }
    if (!EXPORT_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    }

    const { id } = await params;
    const ez = await prisma.elternzeitProzess.findUnique({
      where: { id },
      include: {
        organization: {
          select: {
            name: true,
            mandantNumber: true,
            ezGfFirstName: true,
            ezGfLastName: true,
            ezGfTitle: true,
          },
        },
        mutterschutz: { select: { voraussGeburt: true } },
      },
    });
    if (!ez) {
      return NextResponse.json({ error: "Vorgang nicht gefunden" }, { status: 404 });
    }
    if (!(await canAccessProcess(session, ez.organizationId))) {
      return NextResponse.json({ error: "Vorgang nicht gefunden" }, { status: 404 });
    }

    const ipAddress =
      request.headers.get("x-forwarded-for") ||
      request.headers.get("x-real-ip") ||
      null;

    const pdfBuffer = await generateBADAufforderungsbrief({
      firstName: ez.employeeFirstName,
      lastName: ez.employeeLastName,
      personalNr: ez.employeePersonalNr,
      dienstbezeichnung: ez.dienstbezeichnung,
      organizationName: ez.organization.name,
      mandantNumber: ez.organization.mandantNumber,
      displayId: ez.displayId,
      voraussGeburt: ez.mutterschutz?.voraussGeburt ?? null,
      ezGfFirstName: ez.organization.ezGfFirstName,
      ezGfLastName: ez.organization.ezGfLastName,
      ezGfTitle: ez.organization.ezGfTitle,
      generiertAm: new Date(),
    });

    await prisma.auditLog.create({
      data: {
        elternzeitId: id,
        userId: session.userId,
        processType: "ELTERNZEIT",
        action: "BAD_AUFFORDERUNG_GENERATED",
        details: { displayId: ez.displayId },
        ipAddress,
      },
    });

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${ez.displayId}_BAD_Aufforderung.pdf"`,
      },
    });
  } catch (error) {
    console.error("[API] bad-aufforderung GET fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
