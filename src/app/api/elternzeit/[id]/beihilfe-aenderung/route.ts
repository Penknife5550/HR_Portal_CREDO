/**
 * API: /api/elternzeit/[id]/beihilfe-aenderung
 *
 * GET – Beihilfe-Aenderungsformular als PDF generieren + ausliefern.
 *       Nur fuer BEAMTER / PLANSTELLENINHABER zulaessig.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { EXPORT_ROLES, canAccessProcess } from "@/lib/permissions";
import { generateBeihilfeAenderungsformular } from "@/lib/elternzeit-pdf";

export async function GET(
  _request: NextRequest,
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
        abschnitte: { orderBy: { abschnittNr: "asc" } },
      },
    });

    if (!ez) {
      return NextResponse.json({ error: "Vorgang nicht gefunden" }, { status: 404 });
    }
    if (!(await canAccessProcess(session, ez.organizationId))) {
      return NextResponse.json({ error: "Vorgang nicht gefunden" }, { status: 404 });
    }
    if (
      ez.personalgruppe !== "BEAMTER" &&
      ez.personalgruppe !== "PLANSTELLENINHABER"
    ) {
      return NextResponse.json(
        { error: "Beihilfe-Brief nur fuer Beamte / PSI zulaessig" },
        { status: 409 },
      );
    }
    if (ez.abschnitte.length === 0) {
      return NextResponse.json(
        { error: "Keine Elternzeit-Abschnitte vorhanden" },
        { status: 409 },
      );
    }

    const pdfBuffer = await generateBeihilfeAenderungsformular({
      firstName: ez.employeeFirstName,
      lastName: ez.employeeLastName,
      personalNr: ez.employeePersonalNr,
      adresseStrasse: ez.adresseStrasse,
      adressePlz: ez.adressePlz,
      adresseOrt: ez.adresseOrt,
      organizationName: ez.organization.name,
      mandantNumber: ez.organization.mandantNumber,
      displayId: ez.displayId,
      abschnitte: ez.abschnitte.map((a) => ({
        abschnittNr: a.abschnittNr,
        von: a.von,
        bis: a.bis,
      })),
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
        action: "BEIHILFE_AENDERUNG_GENERATED",
        details: { displayId: ez.displayId },
      },
    });

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${ez.displayId}_Beihilfe_Aenderung.pdf"`,
      },
    });
  } catch (error) {
    console.error("[API] beihilfe-aenderung GET fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
