/**
 * API: /api/elternzeit/[id]/ag-bescheinigung
 *
 * POST – Arbeitgeberbescheinigung Elterngeld als PDF generieren.
 *        Daten kommen aus LOGA → werden manuell im UI-Dialog erfasst
 *        und im Body uebergeben.
 *
 * Body:
 *  - brutto12Monate: string (z.B. "27.500,00 EUR")
 *  - arbeitszeitWochenstunden: number | null
 *  - beschaeftigtSeit: string (YYYY-MM-DD) | null
 *  - geburtsdatum: string (YYYY-MM-DD) | null  (Mitarbeiter)
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { EXPORT_ROLES, canAccessProcess } from "@/lib/permissions";
import { generateAGBescheinigungElterngeld } from "@/lib/elternzeit-pdf";
import { triggerWebhooks } from "@/lib/webhooks";

const bodySchema = z.object({
  brutto12Monate: z.string().min(1).max(100),
  arbeitszeitWochenstunden: z.number().min(0).max(80).nullable().optional(),
  beschaeftigtSeit: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}/)
    .nullable()
    .optional(),
  geburtsdatum: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}/)
    .nullable()
    .optional(),
});

export async function POST(
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
    const body = await request.json().catch(() => null);
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0].message },
        { status: 400 },
      );
    }
    const data = parsed.data;

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
    if (ez.abschnitte.length === 0) {
      return NextResponse.json(
        { error: "Keine Elternzeit-Abschnitte vorhanden" },
        { status: 409 },
      );
    }

    const pdfBuffer = await generateAGBescheinigungElterngeld({
      firstName: ez.employeeFirstName,
      lastName: ez.employeeLastName,
      personalNr: ez.employeePersonalNr,
      geburtsdatum: data.geburtsdatum ? new Date(data.geburtsdatum) : null,
      adresseStrasse: ez.adresseStrasse,
      adressePlz: ez.adressePlz,
      adresseOrt: ez.adresseOrt,
      organizationName: ez.organization.name,
      mandantNumber: ez.organization.mandantNumber,
      displayId: ez.displayId,
      brutto12Monate: data.brutto12Monate,
      arbeitszeitWochenstunden: data.arbeitszeitWochenstunden ?? null,
      beschaeftigtSeit: data.beschaeftigtSeit ? new Date(data.beschaeftigtSeit) : null,
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
        action: "AG_BESCHEINIGUNG_GENERATED",
        details: { displayId: ez.displayId, brutto12Monate: data.brutto12Monate },
      },
    });

    triggerWebhooks("elternzeit-ag-bescheinigung-generiert", {
      elternzeitId: id,
      displayId: ez.displayId,
    }).catch(() => undefined);

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${ez.displayId}_AG_Bescheinigung.pdf"`,
      },
    });
  } catch (error) {
    console.error("[API] ag-bescheinigung POST fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
