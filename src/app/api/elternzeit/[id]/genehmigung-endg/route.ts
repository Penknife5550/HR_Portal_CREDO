/**
 * API: /api/elternzeit/[id]/genehmigung-endg
 *
 * GET – PDF "Endgueltige Genehmigung Elternzeit" generieren + ausliefern.
 *       Voraussetzung: Vorgang ist GENEHMIGT (= endgueltig genehmigt durch HR).
 *       Unterzeichner = Geschaeftsfuehrung aus Mandanten-Konfiguration.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { EXPORT_ROLES, canAccessProcess } from "@/lib/permissions";
import { generateEndgueltigeGenehmigungPdf } from "@/lib/elternzeit-pdf";

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
    if (ez.status !== "GENEHMIGT" && ez.status !== "AKTIV" && ez.status !== "BEENDET") {
      return NextResponse.json(
        {
          error:
            "Endgueltige Genehmigung kann erst nach abgeschlossener HR-Pruefung erstellt werden",
        },
        { status: 409 },
      );
    }
    if (!ez.kindName || !ez.kindGeburtsdatum || !ez.kindGeschlecht) {
      return NextResponse.json(
        {
          error:
            "Kind-Daten unvollstaendig (Name, Geburtsdatum und Geschlecht erforderlich)",
        },
        { status: 409 },
      );
    }
    if (ez.abschnitte.length === 0) {
      return NextResponse.json(
        { error: "Keine Elternzeit-Abschnitte vorhanden" },
        { status: 409 },
      );
    }

    const pdfBuffer = await generateEndgueltigeGenehmigungPdf({
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
      kindName: ez.kindName,
      kindGeburtsdatum: ez.kindGeburtsdatum,
      kindGeschlecht: ez.kindGeschlecht,
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
      genehmigungAm: ez.genehmigungAm ?? new Date(),
      genehmigungVon: ez.genehmigungVon || "Personalabteilung",
      ezGfFirstName: ez.organization.ezGfFirstName,
      ezGfLastName: ez.organization.ezGfLastName,
      ezGfTitle: ez.organization.ezGfTitle,
    });

    await prisma.auditLog.create({
      data: {
        elternzeitId: id,
        userId: session.userId,
        processType: "ELTERNZEIT",
        action: "GENEHMIGUNG_ENDG_GENERATED",
        details: { displayId: ez.displayId },
      },
    });

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${ez.displayId}_Genehmigung_endgueltig.pdf"`,
      },
    });
  } catch (error) {
    console.error("[API] genehmigung-endg GET fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
