/**
 * API: POST /api/contract-end/:id/nicht-uebernehmen
 *
 * Strang B des Vertragsende-Prozesses: HR entscheidet, den Mitarbeiter NICHT
 * zu uebernehmen. Per Klick wird halbautomatisch ein Offboarding-Vorgang
 * (ExitType BEFRISTUNGSENDE) angelegt, mit dem Vertragsende-Vorgang verknuepft
 * und der letzte Arbeitstag auf das Vertragsende gesetzt.
 *
 * Idempotent: ein bereits "entschiedener" Vorgang wird per atomarem
 * Conditional-Update geschuetzt (Schutz gegen Doppelklick / parallele Requests).
 */

import { NextRequest, NextResponse } from "next/server";
import { ExitType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canAccessProcess, HR_EDIT_ROLES } from "@/lib/permissions";
import { createOffboardingProcess } from "@/lib/offboarding";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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

    const contractEnd = await prisma.contractEndProcess.findUnique({
      where: { id },
      include: { organization: true },
    });
    if (!contractEnd) {
      return NextResponse.json({ error: "Vorgang nicht gefunden" }, { status: 404 });
    }
    if (!(await canAccessProcess(session, contractEnd.organizationId))) {
      return NextResponse.json(
        { error: "Keine Berechtigung für diesen Vorgang" },
        { status: 403 }
      );
    }
    if (contractEnd.offboardingId) {
      return NextResponse.json(
        {
          error: "Für diesen Vorgang wurde bereits ein Offboarding angelegt.",
          offboardingId: contractEnd.offboardingId,
        },
        { status: 409 }
      );
    }

    // Atomar "claimen": nur fortfahren, wenn noch kein Offboarding verknuepft ist
    // und der Status den Strang B zulaesst. Der Status-Wechsel im selben Update
    // schuetzt gegen Doppelklick / parallele Requests. Erlaubt: HR loest direkt
    // aus (ANGELEGT/ANFRAGE_VORGESETZTER) ODER bestaetigt die Ablehnung der
    // Fuehrungskraft (RUECKMELDUNG_KEINE_UEBERNAHME). ENTSCHEIDUNG_UEBERNAHME =
    // Alt-Bestandsdaten.
    const claim = await prisma.contractEndProcess.updateMany({
      where: {
        id,
        offboardingId: null,
        status: {
          in: [
            "ANGELEGT",
            "ANFRAGE_VORGESETZTER",
            "ENTSCHEIDUNG_UEBERNAHME",
            "RUECKMELDUNG_KEINE_UEBERNAHME",
          ],
        },
      },
      data: {
        decision: "KEINE_UEBERNAHME",
        status: "ENTSCHEIDUNG_KEINE_UEBERNAHME",
        decidedAt: new Date(),
      },
    });
    if (claim.count === 0) {
      return NextResponse.json(
        { error: "Für diesen Vorgang wurde die Entscheidung bereits getroffen." },
        { status: 409 }
      );
    }

    // Offboarding anlegen (Strang B). Bei Fehler den Claim zuruecksetzen,
    // damit der Vorgang nicht in einem halben Zustand stecken bleibt.
    let offboarding;
    try {
      offboarding = await createOffboardingProcess({
        organization: contractEnd.organization,
        employeeEmail: contractEnd.employeeEmail,
        employeeFirstName: contractEnd.employeeFirstName,
        employeeLastName: contractEnd.employeeLastName,
        employeePersonalNr: contractEnd.employeePersonalNr,
        employeeId: contractEnd.employeeId,
        exitType: ExitType.BEFRISTUNGSENDE,
        lastWorkingDay: contractEnd.contractEndDate,
        initiatedById: session.userId,
        auditDetails: {
          herkunft: "VERTRAGSENDE",
          contractEndId: contractEnd.id,
          contractEndDisplayId: contractEnd.displayId,
        },
      });
    } catch (err) {
      // Claim auf den Zustand vor dem Klick zuruecksetzen
      await prisma.contractEndProcess.update({
        where: { id },
        data: {
          decision: contractEnd.decision,
          status: contractEnd.status,
          decidedAt: contractEnd.decidedAt,
        },
      });
      throw err;
    }

    // Verknuepfung + Status setzen
    const updated = await prisma.contractEndProcess.update({
      where: { id },
      data: {
        offboardingId: offboarding.id,
        status: "ENTSCHEIDUNG_KEINE_UEBERNAHME",
      },
      include: {
        organization: true,
        offboarding: { select: { id: true, displayId: true, status: true } },
      },
    });

    await prisma.auditLog.create({
      data: {
        contractEndId: id,
        userId: session.userId,
        processType: "CONTRACT_END",
        action: "CONTRACT_END_NO_RENEWAL",
        details: {
          decision: "KEINE_UEBERNAHME",
          offboardingId: offboarding.id,
          offboardingDisplayId: offboarding.displayId,
        },
      },
    });

    return NextResponse.json(
      {
        contractEnd: updated,
        offboarding: { id: offboarding.id, displayId: offboarding.displayId },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Fehler bei 'nicht uebernehmen' (Strang B):", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
