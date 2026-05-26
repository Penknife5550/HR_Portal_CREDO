/**
 * API: /api/elternzeit/[id]/br-detmold
 *
 * GET – BR Detmold-Schreiben als PDF generieren + ausliefern.
 *       Setzt brSchreibenGeneriertAm im Vorgang.
 *       Nur für BEAMTER / PLANSTELLENINHABER zulaessig.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { EXPORT_ROLES, canAccessProcess } from "@/lib/permissions";
import { generateBRDetmoldSchreiben } from "@/lib/elternzeit-pdf";
import { triggerWebhooks } from "@/lib/webhooks";
import { syncElternzeitFristen } from "@/lib/elternzeit-fristen";

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
            ezBrDetmoldName: true,
            ezBrDetmoldAktenPrefix: true,
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
        { error: "BR Detmold-Schreiben nur für Beamte / PSI zulaessig" },
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

    const generiertAm = new Date();
    const pdfBuffer = await generateBRDetmoldSchreiben({
      firstName: ez.employeeFirstName,
      lastName: ez.employeeLastName,
      personalNr: ez.employeePersonalNr,
      dienstbezeichnung: ez.dienstbezeichnung,
      schulnummer: ez.schulnummer,
      organizationName: ez.organization.name,
      mandantNumber: ez.organization.mandantNumber,
      displayId: ez.displayId,
      kindName: ez.kindName,
      kindGeburtsdatum: ez.kindGeburtsdatum,
      abschnitte: ez.abschnitte.map((a) => ({
        abschnittNr: a.abschnittNr,
        von: a.von,
        bis: a.bis,
      })),
      brName: ez.organization.ezBrDetmoldName,
      brAktenPrefix: ez.organization.ezBrDetmoldAktenPrefix,
      ezGfFirstName: ez.organization.ezGfFirstName,
      ezGfLastName: ez.organization.ezGfLastName,
      ezGfTitle: ez.organization.ezGfTitle,
      generiertAm,
    });

    await prisma.elternzeitProzess.update({
      where: { id },
      data: { brSchreibenGeneriertAm: generiertAm },
    });

    await prisma.auditLog.create({
      data: {
        elternzeitId: id,
        userId: session.userId,
        processType: "ELTERNZEIT",
        action: "BR_DETMOLD_GENERATED",
        details: { displayId: ez.displayId },
        ipAddress,
      },
    });

    await syncElternzeitFristen(id).catch((err) =>
      console.error(
        `[syncElternzeitFristen] Fehler nach br-detmold ${id}:`,
        err instanceof Error ? err.message : err,
      ),
    );

    triggerWebhooks("elternzeit-br-detmold-generiert", {
      elternzeitId: id,
      displayId: ez.displayId,
      generiertAm: generiertAm.toISOString(),
    }).catch((err) =>
      console.error(
        "[elternzeit-br-detmold-generiert] Webhook-Fehler:",
        err instanceof Error ? err.message : err,
      ),
    );

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${ez.displayId}_BR_Detmold.pdf"`,
      },
    });
  } catch (error) {
    console.error("[API] br-detmold GET fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
