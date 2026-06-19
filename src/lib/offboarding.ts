/**
 * Service: Offboarding-Vorgang anlegen.
 *
 * Gemeinsame Anlage-Logik fuer beide Wege:
 *   - manuell ueber POST /api/offboarding (HR legt einen Austritt an)
 *   - automatisch aus dem Vertragsende-Prozess (Strang B "nicht uebernehmen")
 *
 * Kapselt displayId-Generierung, Checklisten-Template-Auswahl, die Transaktion
 * (Vorgang + leere ExitData + Checkliste + AuditLog) und den Event-Versand
 * "offboarding-created". Die Org-Existenz stellt der Aufrufer sicher und
 * uebergibt die geladene Organisation (damit die Route weiterhin 404 liefern
 * kann, bevor der Service laeuft).
 */

import type { ExitType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { triggerWebhooks } from "@/lib/webhooks";

/** Checklisten-Template-Name anhand OrganizationType. */
export function getTemplateNameForOrgType(orgType: string): string {
  switch (orgType) {
    case "KITA":
    case "GYMNASIUM":
    case "GRUNDSCHULE":
    case "GESAMTSCHULE":
    case "BERUFSKOLLEG":
      return "Offboarding: Bildungseinrichtung";
    case "VERWALTUNG":
    case "GMBH":
    case "VEREIN":
      return "Offboarding: Standard-Offboarding";
    default:
      return "Offboarding: Standard-Offboarding";
  }
}

export interface CreateOffboardingInput {
  /** Bereits geladene Organisation (Aufrufer prueft Existenz). */
  organization: {
    id: string;
    name: string;
    type: string;
    shortName: string | null;
    mandantNumber: string;
  };
  employeeEmail: string;
  employeeFirstName: string;
  employeeLastName: string;
  employeePersonalNr?: string | null;
  employeePrivateEmail?: string | null;
  exitType: ExitType;
  lastWorkingDay: Date;
  initiatedById: string;
  /** Optionale Verknuepfung zur zentralen Personalakte. */
  employeeId?: string | null;
  /** Zusaetzliche Audit-Details (z.B. Herkunft aus einem Vertragsende-Vorgang). */
  auditDetails?: Record<string, unknown>;
}

/**
 * Legt einen Offboarding-Vorgang an und triggert das Event "offboarding-created".
 * Gibt den erstellten Vorgang (inkl. organization) zurueck. Wirft bei DB-Fehlern.
 */
export async function createOffboardingProcess(input: CreateOffboardingInput) {
  const { organization: org } = input;

  // displayId generieren: "OFF-{year}-{orgShortName}-{sequential}"
  const currentYear = new Date().getFullYear();
  const yearStart = new Date(currentYear, 0, 1);
  const yearEnd = new Date(currentYear + 1, 0, 1);
  const shortName = org.shortName || org.mandantNumber;

  let displayId = "";
  let sequentialNumber = 0;

  for (let attempt = 0; attempt < 3; attempt++) {
    const countThisYear = await prisma.offboardingProcess.count({
      where: {
        organizationId: org.id,
        createdAt: { gte: yearStart, lt: yearEnd },
      },
    });
    sequentialNumber = countThisYear + 1 + attempt;
    displayId = `OFF-${currentYear}-${shortName}-${sequentialNumber
      .toString()
      .padStart(3, "0")}`;
    const exists = await prisma.offboardingProcess.findUnique({
      where: { displayId },
      select: { id: true },
    });
    if (!exists) break;
  }

  // Passendes Checklisten-Template finden
  const templateName = getTemplateNameForOrgType(org.type);
  const checklistTemplate = await prisma.checklistTemplate.findFirst({
    where: { name: templateName, isActive: true },
    include: { items: { orderBy: { orderIndex: "asc" } } },
  });

  // Gesamte Erstellung in einer Transaktion
  const offboarding = await prisma.$transaction(async (tx) => {
    const created = await tx.offboardingProcess.create({
      data: {
        displayId,
        sequentialNumber,
        organizationId: org.id,
        employeeEmail: input.employeeEmail,
        employeeFirstName: input.employeeFirstName,
        employeeLastName: input.employeeLastName,
        employeePersonalNr: input.employeePersonalNr || null,
        employeePrivateEmail: input.employeePrivateEmail || null,
        employeeId: input.employeeId || null,
        exitType: input.exitType,
        lastWorkingDay: input.lastWorkingDay,
        status: "INITIATED",
        initiatedById: input.initiatedById,
      },
      include: { organization: true },
    });

    // OffboardingExitData anlegen (leer)
    await tx.offboardingExitData.create({ data: { offboardingId: created.id } });

    // Checklisten-Items aus Template erstellen
    if (checklistTemplate && checklistTemplate.items.length > 0) {
      await tx.offboardingChecklistItem.createMany({
        data: checklistTemplate.items.map((templateItem) => ({
          offboardingId: created.id,
          title: templateItem.title,
          category: templateItem.category,
          orderIndex: templateItem.orderIndex,
          assigneeDepartment: templateItem.defaultAssignee || null,
          dueDate:
            templateItem.defaultDueDays != null
              ? new Date(
                  input.lastWorkingDay.getTime() +
                    templateItem.defaultDueDays * 24 * 60 * 60 * 1000
                )
              : null,
        })),
      });
    }

    // Audit-Log
    await tx.auditLog.create({
      data: {
        offboardingId: created.id,
        userId: input.initiatedById,
        processType: "OFFBOARDING",
        action: "OFFBOARDING_CREATED",
        details: {
          employeeEmail: input.employeeEmail,
          employeeName: `${input.employeeFirstName} ${input.employeeLastName}`,
          organization: org.name,
          exitType: input.exitType,
          lastWorkingDay: input.lastWorkingDay.toISOString(),
          ...(input.auditDetails || {}),
        },
      },
    });

    return created;
  });

  // Webhook ausserhalb der Transaktion triggern (wirft nie)
  await triggerWebhooks("offboarding-created", {
    offboardingId: offboarding.id,
    displayId: offboarding.displayId,
    employeeEmail: offboarding.employeeEmail,
    employeeName: `${offboarding.employeeFirstName} ${offboarding.employeeLastName}`,
    organization: org.name,
    mandantNumber: org.mandantNumber,
    exitType: offboarding.exitType,
    lastWorkingDay: offboarding.lastWorkingDay.toISOString(),
  });

  return offboarding;
}
