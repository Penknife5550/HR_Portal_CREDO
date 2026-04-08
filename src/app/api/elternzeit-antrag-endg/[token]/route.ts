/**
 * API: /api/elternzeit-antrag-endg/[token]
 *
 * GET  – Public: Token 2 validieren + Daten zurueckliefern
 * POST – Public: Endgueltigen Antrag einreichen (3-Schritt-Form, Single-Use)
 *
 * KEINE Authentifizierung — Magic-Link-basiert. Geburtsurkunde wird
 * separat per /api/elternzeit-antrag-endg/[token]/upload hochgeladen
 * und bei POST auf "vorhanden" geprueft.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { publicAntragEndgSchema } from "@/lib/validations/elternzeit";
import { triggerWebhooks } from "@/lib/webhooks";
import { syncElternzeitFristen } from "@/lib/elternzeit-fristen";

// =============================================
// GET – Token validieren + Daten laden
// =============================================
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;

    const ez = await prisma.elternzeitProzess.findUnique({
      where: { antragTokenEndg: token },
      include: {
        organization: { select: { name: true, mandantNumber: true } },
        abschnitte: {
          orderBy: { abschnittNr: "asc" },
        },
      },
    });

    if (!ez) {
      return NextResponse.json(
        { error: "Token ungueltig oder abgelaufen" },
        { status: 404 },
      );
    }
    if (ez.antragTokenEndgExpiry && new Date() > ez.antragTokenEndgExpiry) {
      return NextResponse.json({ error: "Token ist abgelaufen" }, { status: 403 });
    }
    if (ez.antragTokenEndgUsedAt) {
      return NextResponse.json(
        { error: "Dieser Antrag wurde bereits eingereicht" },
        { status: 410 },
      );
    }

    return NextResponse.json({
      data: {
        elternzeitId: ez.id,
        displayId: ez.displayId,
        employeeName: `${ez.employeeFirstName} ${ez.employeeLastName}`,
        employeeFirstName: ez.employeeFirstName,
        employeeLastName: ez.employeeLastName,
        organizationName: ez.organization.name,
        mandantNumber: ez.organization.mandantNumber,
        personalgruppe: ez.personalgruppe,
        geschlecht: ez.geschlecht,
        kindNummer: ez.kindNummer,
        // Bereits bekannte Daten als Vorbelegung (vom HR im Portal eingetragen)
        kindName: ez.kindName,
        kindGeburtsdatum: ez.kindGeburtsdatum
          ? ez.kindGeburtsdatum.toISOString().slice(0, 10)
          : null,
        kindGeschlecht: ez.kindGeschlecht,
        fruehgeburt: ez.fruehgeburt,
        mehrlinge: ez.mehrlinge,
        geburtsurkundeBereitsHochgeladen: ez.geburtsurkunde,
        abschnitte: ez.abschnitte.map((a) => ({
          abschnittNr: a.abschnittNr,
          von: a.von.toISOString().slice(0, 10),
          bis: a.bis.toISOString().slice(0, 10),
        })),
      },
    });
  } catch (error) {
    console.error("[API] elternzeit-antrag-endg GET fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}

// =============================================
// POST – Endgueltigen Antrag absenden
// =============================================
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;

    const body = await request.json().catch(() => null);
    const parsed = publicAntragEndgSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0].message },
        { status: 400 },
      );
    }
    const data = parsed.data;

    // Vorgang laden — fuer ID, Geburtsurkunden-Check und spaetere Webhook-Daten
    const ez = await prisma.elternzeitProzess.findUnique({
      where: { antragTokenEndg: token },
      select: {
        id: true,
        displayId: true,
        antragTokenEndgExpiry: true,
        antragTokenEndgUsedAt: true,
        employeeFirstName: true,
        employeeLastName: true,
        employeeEmail: true,
      },
    });
    if (!ez) {
      return NextResponse.json({ error: "Token ungueltig" }, { status: 404 });
    }
    if (ez.antragTokenEndgExpiry && new Date() > ez.antragTokenEndgExpiry) {
      return NextResponse.json({ error: "Token abgelaufen" }, { status: 403 });
    }
    if (ez.antragTokenEndgUsedAt) {
      return NextResponse.json(
        { error: "Antrag wurde bereits eingereicht" },
        { status: 410 },
      );
    }

    // Atomarer Single-Use-Schutz + Geburtsurkunden-Check in einer Transaktion.
    // updateMany mit count===1 verhindert Race-Condition: zwei parallele POSTs
    // koennen nicht beide passieren.
    const ipAddress =
      request.headers.get("x-forwarded-for") ||
      request.headers.get("x-real-ip") ||
      null;

    const txResult = await prisma.$transaction(async (tx) => {
      const docCount = await tx.elternzeitDokument.count({
        where: { elternzeitId: ez.id, dokumentTyp: "GEBURTSURKUNDE" },
      });
      if (docCount === 0) {
        return { status: "NO_GEBURTSURKUNDE" as const };
      }

      const result = await tx.elternzeitProzess.updateMany({
        where: {
          id: ez.id,
          antragTokenEndg: token,
          antragTokenEndgUsedAt: null,
        },
        data: {
          kindName: data.kindName,
          kindGeburtsdatum: new Date(data.kindGeburtsdatum),
          kindGeschlecht: data.kindGeschlecht,
          fruehgeburt: data.fruehgeburt,
          mehrlinge: data.mehrlinge,
          geburtsurkunde: true,
          antragEndgAm: new Date(),
          antragTokenEndgUsedAt: new Date(),
          status: "ANTRAG_ENDG_EINGEREICHT",
        },
      });

      if (result.count === 0) {
        return { status: "ALREADY_USED" as const };
      }

      await tx.auditLog.create({
        data: {
          elternzeitId: ez.id,
          processType: "ELTERNZEIT",
          action: "ANTRAG_ENDG_SUBMITTED",
          details: {
            kindName: data.kindName,
            kindGeburtsdatum: data.kindGeburtsdatum,
          },
          ipAddress,
        },
      });

      return { status: "OK" as const };
    });

    if (txResult.status === "NO_GEBURTSURKUNDE") {
      return NextResponse.json(
        {
          error:
            "Geburtsurkunde wurde nicht hochgeladen. Bitte zuerst Datei hochladen, dann Antrag absenden.",
        },
        { status: 400 },
      );
    }
    if (txResult.status === "ALREADY_USED") {
      return NextResponse.json(
        { error: "Antrag wurde bereits eingereicht" },
        { status: 410 },
      );
    }

    await syncElternzeitFristen(ez.id).catch((err) =>
      console.error(
        "[syncElternzeitFristen] Fehler nach endg. Antrag:",
        err instanceof Error ? err.message : err,
      ),
    );

    triggerWebhooks("elternzeit-antrag-eingereicht", {
      elternzeitId: ez.id,
      displayId: ez.displayId,
      antragTyp: "endgueltig",
      submittedAt: new Date().toISOString(),
      employeeName: `${ez.employeeFirstName} ${ez.employeeLastName}`,
      employeeEmail: ez.employeeEmail,
      kindName: data.kindName,
      kindGeburtsdatum: data.kindGeburtsdatum,
    }).catch((err) =>
      console.error(
        "[elternzeit-antrag-endg] Webhook-Fehler:",
        err instanceof Error ? err.message : err,
      ),
    );

    return NextResponse.json({ data: { ok: true } });
  } catch (error) {
    console.error("[API] elternzeit-antrag-endg POST fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
