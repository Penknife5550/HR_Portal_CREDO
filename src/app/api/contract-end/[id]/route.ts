/**
 * API: /api/contract-end/:id
 *
 * GET   – Einzelnen Vertragsende-Vorgang mit Details abrufen
 * PATCH – Vorgang aktualisieren (Status-Korrekturen, Vorgesetzten-E-Mail,
 *         Vertragsende). Die eigentlichen Entscheidungen laufen ueber die
 *         dedizierten Routen /supervisor-link (Strang A) und
 *         /nicht-uebernehmen (Strang B).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { updateContractEndSchema } from "@/lib/validations/contract-end";
import { canAccessProcess, PORTAL_ROLES, HR_EDIT_ROLES } from "@/lib/permissions";

// Gueltige Status-Uebergaenge
const VALID_TRANSITIONS: Record<string, string[]> = {
  ANGELEGT: ["ANFRAGE_VORGESETZTER", "ENTSCHEIDUNG_KEINE_UEBERNAHME", "STORNIERT"],
  ANFRAGE_VORGESETZTER: [
    "RUECKMELDUNG_UEBERNAHME",
    "RUECKMELDUNG_KEINE_UEBERNAHME",
    "ENTSCHEIDUNG_KEINE_UEBERNAHME",
    "STORNIERT",
  ],
  RUECKMELDUNG_UEBERNAHME: ["VERTRAG_ERSTELLT", "VERTRAG_UNTERSCHRIEBEN", "ABGESCHLOSSEN", "STORNIERT"],
  RUECKMELDUNG_KEINE_UEBERNAHME: ["ENTSCHEIDUNG_KEINE_UEBERNAHME", "STORNIERT"],
  ENTSCHEIDUNG_UEBERNAHME: ["VERTRAG_ERSTELLT", "ENTSCHEIDUNG_KEINE_UEBERNAHME", "STORNIERT"],
  VERTRAG_ERSTELLT: ["VERTRAG_UNTERSCHRIEBEN", "ABGESCHLOSSEN", "STORNIERT"],
  VERTRAG_UNTERSCHRIEBEN: ["ABGESCHLOSSEN", "STORNIERT"],
  ENTSCHEIDUNG_KEINE_UEBERNAHME: ["ABGESCHLOSSEN", "STORNIERT"],
  ABGESCHLOSSEN: [],
  STORNIERT: [],
};

// =============================================
// GET /api/contract-end/:id
// =============================================
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }
    if (!PORTAL_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    }

    const { id } = await params;

    const contractEnd = await prisma.contractEndProcess.findUnique({
      where: { id },
      include: {
        organization: true,
        renewalData: true,
        offboarding: { select: { id: true, displayId: true, status: true } },
        auditLogs: { orderBy: { createdAt: "desc" }, take: 20 },
      },
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

    return NextResponse.json(contractEnd);
  } catch (error) {
    console.error("Fehler beim Laden des Vertragsende-Vorgangs:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}

// =============================================
// PATCH /api/contract-end/:id – Vorgang aktualisieren
// =============================================
export async function PATCH(
  request: NextRequest,
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
    const body = await request.json().catch(() => null);
    const parsed = updateContractEndSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
    }
    const { status, decision, supervisorEmail, contractEndDate, mavStatus } = parsed.data;

    const existing = await prisma.contractEndProcess.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Vorgang nicht gefunden" }, { status: 404 });
    }
    if (!(await canAccessProcess(session, existing.organizationId))) {
      return NextResponse.json(
        { error: "Keine Berechtigung für diesen Vorgang" },
        { status: 403 }
      );
    }

    // Status-Uebergang validieren. SUPER_ADMIN/HR_LEITUNG duerfen
    // ABGESCHLOSSEN/STORNIERT direkt setzen (Korrektur-Override).
    const ADMIN_OVERRIDE_ROLES = ["SUPER_ADMIN", "HR_LEITUNG"];
    const isAdminOverride =
      ADMIN_OVERRIDE_ROLES.includes(session.role) &&
      (status === "ABGESCHLOSSEN" || status === "STORNIERT");

    if (status && !isAdminOverride) {
      const allowed = VALID_TRANSITIONS[existing.status];
      if (!allowed || !allowed.includes(status)) {
        return NextResponse.json(
          {
            error: `Ungueltiger Status-Uebergang: "${existing.status}" -> "${status}". Erlaubt: ${
              allowed?.join(", ") || "keine"
            }`,
          },
          { status: 400 }
        );
      }
    }

    const updateData: Record<string, unknown> = {};
    if (status) updateData.status = status;
    if (decision) updateData.decision = decision;
    if (supervisorEmail !== undefined) updateData.supervisorEmail = supervisorEmail || null;
    if (contractEndDate) updateData.contractEndDate = new Date(contractEndDate);
    if (status === "ABGESCHLOSSEN") updateData.completedAt = new Date();
    // B1: unterschriebener Ruecklauf -> Zeitpunkt festhalten (Entfristungsschutz)
    if (status === "VERTRAG_UNTERSCHRIEBEN") updateData.contractSignedReturnedAt = new Date();
    // B3: MAV-Status setzen; Anhoerungszeitpunkt mitschreiben (ausser "ausstehend")
    if (mavStatus !== undefined) {
      updateData.mavStatus = mavStatus || null;
      updateData.mavConsultedAt = mavStatus && mavStatus !== "AUSSTEHEND" ? new Date() : null;
    }

    const updated = await prisma.contractEndProcess.update({
      where: { id },
      data: updateData,
      include: { organization: true, renewalData: true },
    });

    // Audit-Log
    const auditDetails: Record<string, unknown> = {};
    if (status) {
      auditDetails.statusFrom = existing.status;
      auditDetails.statusTo = status;
    }
    if (decision) auditDetails.decision = decision;
    if (contractEndDate) auditDetails.contractEndDate = contractEndDate;
    if (mavStatus !== undefined) auditDetails.mavStatus = mavStatus;

    // Adressaenderung MIT Vorher und Nachher — die Gegenprobe zur
    // Empfaenger-Freigabe.
    //
    // Die Freigaberegel (src/lib/empfaenger-freigabe.ts) laesst die im Vorgang
    // hinterlegte Adresse IMMER durch, auch wenn ihre Domain nicht auf der
    // Liste steht, und stuetzt sich ausdruecklich darauf, dass eine Aenderung
    // dieser Adresse "eine eigene, protokollpflichtige Handlung an anderer
    // Stelle" ist. Diese Stelle ist hier.
    //
    // Das VORHER gehoert zwingend dazu: Wer eine Adresse fuer einen Versand
    // umbiegt und danach zuruecksetzt, hinterliesse sonst zwei Eintraege, die
    // beide die richtige Adresse zeigen.
    //
    // Fuer dieses Modul ist supervisorEmail das einzige hier aenderbare
    // Adressfeld. Der Empfaenger des Dokumentenpakets ist employeeEmail —
    // die nimmt updateContractEndSchema nicht an, und keine andere Route
    // schreibt sie; kaeme das dazu, gehoert es nach demselben Muster hierher.
    // supervisorEmail ist trotzdem protokollpflichtig: An sie geht der
    // Magic-Link zum Vertragsformular (Strang A).
    //
    // Die Adresse selbst ist ein Personendatum. Sie steht trotzdem im
    // Protokoll, weil ein Eintrag ohne sie nichts belegen kann; das AuditLog
    // fuehrt an anderer Stelle bereits Adressen (u.a. die /supervisor-link-
    // Route dieses Moduls und die Cron-Erinnerungen).
    if (supervisorEmail !== undefined) {
      // Exakt so normalisiert wie oben in updateData: "" wird zu null. Sonst
      // meldete das Protokoll ein "" -> null als Aenderung, das keine ist.
      const neueVorgesetztenadresse = supervisorEmail || null;
      if (neueVorgesetztenadresse !== existing.supervisorEmail) {
        auditDetails.supervisorEmailFrom = existing.supervisorEmail;
        auditDetails.supervisorEmailTo = neueVorgesetztenadresse;
      }
    }

    await prisma.auditLog.create({
      data: {
        contractEndId: id,
        userId: session.userId,
        processType: "CONTRACT_END",
        action: status ? "STATUS_CHANGED" : "CONTRACT_END_UPDATED",
        details: auditDetails as Record<string, string>,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Fehler beim Aktualisieren des Vertragsende-Vorgangs:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
