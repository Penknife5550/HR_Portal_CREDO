/**
 * API: /api/elternzeit/[id]/genehmigung-vorl
 *
 * GET – PDF "Vorläufige Genehmigung Elternzeit" generieren + ausliefern.
 *       Mutter- oder Vater-Version automatisch nach Geschlecht.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { EXPORT_ROLES, canAccessProcess } from "@/lib/permissions";
import { generateVorlaeufigeGenehmigungPdf } from "@/lib/elternzeit-pdf";

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
        organization: { select: { name: true, mandantNumber: true } },
        abschnitte: { orderBy: { abschnittNr: "asc" } },
      },
    });

    if (!ez) {
      return NextResponse.json({ error: "Vorgang nicht gefunden" }, { status: 404 });
    }
    // IDOR-Schutz: Mandant-Scope pruefen
    if (!(await canAccessProcess(session, ez.organizationId))) {
      return NextResponse.json({ error: "Vorgang nicht gefunden" }, { status: 404 });
    }
    if (!ez.genehmigungAm) {
      return NextResponse.json(
        { error: "Genehmigung wurde noch nicht erteilt" },
        { status: 409 },
      );
    }
    if (ez.abschnitte.length === 0) {
      return NextResponse.json(
        { error: "Keine Elternzeit-Abschnitte vorhanden" },
        { status: 409 },
      );
    }

    const ipAddress =
      request.headers.get("x-forwarded-for") ||
      request.headers.get("x-real-ip") ||
      null;

    const pdfBuffer = await generateVorlaeufigeGenehmigungPdf({
      firstName: ez.employeeFirstName,
      lastName: ez.employeeLastName,
      email: ez.employeeEmail,
      personalNr: ez.employeePersonalNr,
      adresseStrasse: ez.adresseStrasse,
      adressePlz: ez.adressePlz,
      adresseOrt: ez.adresseOrt,
      dienstbezeichnung: ez.dienstbezeichnung,
      schulnummer: ez.schulnummer,
      organizationName: ez.organization.name,
      mandantNumber: ez.organization.mandantNumber,
      displayId: ez.displayId,
      geschlecht: ez.geschlecht,
      personalgruppe: ez.personalgruppe,
      kindNummer: ez.kindNummer,
      betreuungsabsicht: ez.betreuungsabsicht,
      gleichzeitigeEZ: ez.gleichzeitigeEZ,
      abschnitte: ez.abschnitte.map((a) => ({
        abschnittNr: a.abschnittNr,
        von: a.von,
        bis: a.bis,
        uebertragung3bis8: a.uebertragung3bis8,
        teilzeit: a.teilzeit,
        teilzeitStunden: a.teilzeitStunden ? Number(a.teilzeitStunden) : null,
      })),
      genehmigungAm: ez.genehmigungAm,
      genehmigungVon: ez.genehmigungVon || "Personalabteilung",
    });

    await prisma.auditLog.create({
      data: {
        elternzeitId: id,
        userId: session.userId,
        processType: "ELTERNZEIT",
        action: "GENEHMIGUNG_VORL_GENERATED",
        details: { displayId: ez.displayId },
        ipAddress,
      },
    });

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${ez.displayId}_Genehmigung_vorlaeufig.pdf"`,
      },
    });
  } catch (error) {
    console.error("[API] genehmigung-vorl GET fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
