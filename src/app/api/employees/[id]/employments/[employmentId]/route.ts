/**
 * API: Einzelne Anstellung
 *
 * PATCH  /api/employees/[id]/employments/[employmentId] - Anstellung aktualisieren
 * DELETE /api/employees/[id]/employments/[employmentId] - Anstellung entfernen
 *
 * Auth: nur die HR-Rollen (nicht der n8n-Schluessel). Bei einem Vertrag aus
 * DokuBit (Abrechnungskreis + MANR gesetzt) sperrt der Schreibschutz alles,
 * was der Abgleich schreibt, und das Loeschen; jede Aenderung kommt ins
 * AuditLog: src/lib/personalstamm/schreibschutz.ts
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { apiHandler } from "@/lib/api-handler";
import { HR_EDIT_ROLES } from "@/lib/permissions";
import { PERSONALSTAMM_ACTIONS, PERSONALSTAMM_PROCESS_TYPE } from "@/lib/constants";
import {
  SCHREIBSCHUTZ_MELDUNGEN,
  VERWALTETE_VERTRAGSFELDER,
  gesperrteFelder,
  vertragVerwaltet,
} from "@/lib/personalstamm/schreibschutz";

// =============================================
// Zod Schemas
// =============================================

const VALID_CONTRACT_TYPES = [
  "UNBEFRISTET",
  "BEFRISTET",
  "BEAMTER",
  "MINIJOB",
  "EHRENAMT",
  "PRAKTIKUM",
] as const;

const updateEmploymentSchema = z.object({
  organizationId: z.string().uuid("Ungültige Einrichtungs-ID").optional(),
  position: z.string().trim().optional().nullable(),
  department: z.string().trim().optional().nullable(),
  contractType: z
    .enum(VALID_CONTRACT_TYPES, {
      errorMap: () => ({
        message: `Ungültiger Vertragstyp. Erlaubt: ${VALID_CONTRACT_TYPES.join(", ")}`,
      }),
    })
    .optional()
    .nullable(),
  workingHoursWeek: z
    .number()
    .min(0, "Wochenstunden müssen >= 0 sein")
    .max(168, "Wochenstunden müssen <= 168 sein")
    .optional()
    .nullable(),
  startDate: z
    .string()
    .datetime({ message: "Ungültiges Datumsformat (ISO 8601 erwartet)" })
    .optional()
    .nullable(),
  endDate: z
    .string()
    .datetime({ message: "Ungültiges Datumsformat (ISO 8601 erwartet)" })
    .optional()
    .nullable(),
  mandantNumber: z.string().trim().optional().nullable(),
  isActive: z.boolean().optional(),
});

type UpdateEmploymentInput = z.infer<typeof updateEmploymentSchema>;

/**
 * Hilfsfunktion: Anstellung laden und pruefen ob sie zum Mitarbeiter gehoert
 */
async function findEmployment(employeeId: string, employmentId: string) {
  const employment = await prisma.employment.findUnique({
    where: { id: employmentId },
  });
  if (!employment) return null;
  if (employment.employeeId !== employeeId) return null;
  return employment;
}

// =============================================
// PATCH /api/employees/[id]/employments/[employmentId]
// =============================================
export const PATCH = apiHandler<UpdateEmploymentInput>(
  {
    roles: HR_EDIT_ROLES,
    bodySchema: updateEmploymentSchema,
    logLabel: "Employment PATCH",
  },
  async ({ params, body, session }) => {
    const { id, employmentId } = params;

    const existing = await findEmployment(id, employmentId);
    if (!existing) {
      return NextResponse.json(
        { error: "Anstellung nicht gefunden" },
        { status: 404 }
      );
    }

    // Ob ein Vertrag aus DokuBit stammt, aendert sich nie: Der Abgleich legt
    // eigene Zeilen an und setzt den Schluessel nie an einer Bestandszeile.
    if (vertragVerwaltet(existing)) {
      const felder = gesperrteFelder(body, VERWALTETE_VERTRAGSFELDER);
      if (felder.length > 0) {
        return NextResponse.json(
          { error: SCHREIBSCHUTZ_MELDUNGEN.vertragFelder(felder), felder },
          { status: 409 }
        );
      }
    }

    // Falls organizationId geaendert wird, pruefen ob neue Einrichtung existiert
    if (body.organizationId) {
      const organization = await prisma.organization.findUnique({
        where: { id: body.organizationId },
      });
      if (!organization) {
        return NextResponse.json(
          { error: "Einrichtung nicht gefunden" },
          { status: 404 }
        );
      }
    }

    // Update-Daten aufbauen
    const updateData: Record<string, unknown> = {};
    if (body.organizationId !== undefined) updateData.organizationId = body.organizationId;
    if (body.position !== undefined) updateData.position = body.position;
    if (body.department !== undefined) updateData.department = body.department;
    if (body.contractType !== undefined) updateData.contractType = body.contractType;
    if (body.workingHoursWeek !== undefined) updateData.workingHoursWeek = body.workingHoursWeek;
    if (body.startDate !== undefined) {
      updateData.startDate = body.startDate ? new Date(body.startDate) : null;
    }
    if (body.endDate !== undefined) {
      updateData.endDate = body.endDate ? new Date(body.endDate) : null;
    }
    if (body.mandantNumber !== undefined) updateData.mandantNumber = body.mandantNumber;
    if (body.isActive !== undefined) updateData.isActive = body.isActive;

    const felder = Object.keys(updateData);
    const employment = await prisma.$transaction(async (tx) => {
      const geaendert = await tx.employment.update({
        where: { id: employmentId },
        data: updateData,
        include: {
          organization: {
            select: { id: true, name: true, mandantNumber: true },
          },
        },
      });
      if (felder.length > 0) {
        await tx.auditLog.create({
          data: {
            userId: session?.userId ?? null,
            processType: PERSONALSTAMM_PROCESS_TYPE,
            action: PERSONALSTAMM_ACTIONS.ANSTELLUNG_GEAENDERT,
            // Nur Feldnamen, nie Werte
            details: { employeeId: id, employmentId, felder },
          },
        });
      }
      return geaendert;
    });

    return NextResponse.json({ data: employment });
  }
);

// =============================================
// DELETE /api/employees/[id]/employments/[employmentId]
// =============================================
export const DELETE = apiHandler(
  { roles: HR_EDIT_ROLES, logLabel: "Employment DELETE" },
  async ({ params, session }) => {
    const { id, employmentId } = params;

    const existing = await findEmployment(id, employmentId);
    if (!existing) {
      return NextResponse.json(
        { error: "Anstellung nicht gefunden" },
        { status: 404 }
      );
    }
    if (vertragVerwaltet(existing)) {
      return NextResponse.json(
        { error: SCHREIBSCHUTZ_MELDUNGEN.vertragLoeschen },
        { status: 409 }
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.employment.delete({
        where: { id: employmentId },
      });
      await tx.auditLog.create({
        data: {
          userId: session?.userId ?? null,
          processType: PERSONALSTAMM_PROCESS_TYPE,
          action: PERSONALSTAMM_ACTIONS.ANSTELLUNG_GELOESCHT,
          details: { employeeId: id, employmentId },
        },
      });
    });

    return NextResponse.json({ message: "Anstellung gelöscht" });
  }
);
