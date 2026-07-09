/**
 * Service: Vertragsende-Vorgang anlegen.
 *
 * Gemeinsame Anlage-Logik fuer beide Wege:
 *   - manuell ueber POST /api/contract-end (HR-UI)
 *   - automatisch ueber den n8n-Webhook (Phase 2, aus DokuBit gemeldet)
 *
 * Kapselt displayId-Generierung ("VE-{Jahr}-{Kuerzel}-{lfd}"), die Transaktion
 * (Vorgang + AuditLog) und den Event-Versand "contract-end-created". Die
 * Org-Existenz stellt der Aufrufer sicher und uebergibt die geladene
 * Organisation.
 */

import { prisma } from "@/lib/db";
import { triggerWebhooks } from "@/lib/webhooks";

export interface CreateContractEndInput {
  /** Bereits geladene Organisation (Aufrufer prueft Existenz). */
  organization: {
    id: string;
    name: string;
    shortName: string | null;
    mandantNumber: string;
  };
  employeeEmail: string;
  employeeFirstName: string;
  employeeLastName: string;
  employeePersonalNr?: string | null;
  /** Optionale Verknuepfung zur zentralen Personalakte. */
  employeeId?: string | null;
  contractEndDate: Date;
  contractStartDate?: Date | null;
  /** "MANUAL" (HR-UI) oder "N8N" (Webhook). */
  source?: string;
  initiatedById?: string | null;
  /** Aktueller (auslaufender) Vertrag — von n8n gemeldet, Vorausfuellen (#5). */
  currentPosition?: string | null;
  currentEntgeltgruppe?: string | null;
  currentStufe?: string | null;
  currentWochenstunden?: number | null;
  /** Befristungshistorie — von n8n gemeldet, Basis der §14-Warnung (B2). */
  befristungsart?: string | null;
  bisherigeBefristungMonate?: number | null;
  bisherigeVerlaengerungen?: number | null;
  /** DokuBit-Stammdaten (Whitelist) — Platzhalter + Vorbefuellung. */
  dokubitDaten?: Record<string, string> | null;
  /** Weitere Mandanten-Nummern der Person (ohne den eigenen). */
  weitereMandanten?: string[];
}

/**
 * Legt einen Vertragsende-Vorgang an (Vorgang + AuditLog) und triggert das
 * Event "contract-end-created". Gibt den erstellten Vorgang (inkl. organization)
 * zurueck. Wirft bei DB-Fehlern.
 */
export async function createContractEndProcess(input: CreateContractEndInput) {
  const { organization: org } = input;

  // displayId generieren: "VE-{year}-{orgShortName}-{sequential}"
  const currentYear = new Date().getFullYear();
  const yearStart = new Date(currentYear, 0, 1);
  const yearEnd = new Date(currentYear + 1, 0, 1);
  const shortName = org.shortName || org.mandantNumber;

  let displayId = "";
  let sequentialNumber = 0;

  for (let attempt = 0; attempt < 3; attempt++) {
    const countThisYear = await prisma.contractEndProcess.count({
      where: {
        organizationId: org.id,
        createdAt: { gte: yearStart, lt: yearEnd },
      },
    });
    sequentialNumber = countThisYear + 1 + attempt;
    displayId = `VE-${currentYear}-${shortName}-${sequentialNumber
      .toString()
      .padStart(3, "0")}`;
    const exists = await prisma.contractEndProcess.findUnique({
      where: { displayId },
      select: { id: true },
    });
    if (!exists) break;
  }

  const contractEnd = await prisma.$transaction(async (tx) => {
    const created = await tx.contractEndProcess.create({
      data: {
        displayId,
        sequentialNumber,
        organizationId: org.id,
        employeeEmail: input.employeeEmail,
        employeeFirstName: input.employeeFirstName,
        employeeLastName: input.employeeLastName,
        employeePersonalNr: input.employeePersonalNr || null,
        employeeId: input.employeeId || null,
        contractEndDate: input.contractEndDate,
        contractStartDate: input.contractStartDate || null,
        source: input.source || "MANUAL",
        initiatedById: input.initiatedById || null,
        currentPosition: input.currentPosition || null,
        currentEntgeltgruppe: input.currentEntgeltgruppe || null,
        currentStufe: input.currentStufe || null,
        currentWochenstunden: input.currentWochenstunden ?? null,
        befristungsart: input.befristungsart || null,
        bisherigeBefristungMonate: input.bisherigeBefristungMonate ?? null,
        bisherigeVerlaengerungen: input.bisherigeVerlaengerungen ?? null,
        dokubitDaten: input.dokubitDaten ?? undefined,
        weitereMandanten: input.weitereMandanten ?? [],
      },
      include: { organization: true },
    });

    await tx.auditLog.create({
      data: {
        contractEndId: created.id,
        userId: input.initiatedById || null,
        processType: "CONTRACT_END",
        action: "CONTRACT_END_CREATED",
        details: {
          employeeName: `${input.employeeFirstName} ${input.employeeLastName}`,
          organization: org.name,
          contractEndDate: input.contractEndDate.toISOString(),
          source: input.source || "MANUAL",
        },
      },
    });

    return created;
  });

  // Event ausserhalb der Transaktion (wirft nie)
  await triggerWebhooks("contract-end-created", {
    contractEndId: contractEnd.id,
    displayId: contractEnd.displayId,
    employeeName: `${contractEnd.employeeFirstName} ${contractEnd.employeeLastName}`,
    employeeEmail: contractEnd.employeeEmail,
    organization: org.name,
    mandantNummer: org.mandantNumber,
    contractEndDate: contractEnd.contractEndDate.toISOString(),
  });

  return contractEnd;
}
