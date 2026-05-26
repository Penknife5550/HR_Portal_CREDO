/**
 * Civil-Service Phasen-Helper
 *
 * Zentrale Logik für:
 * - Phasen-Status-Neuberechnung (PENDING / IN_PROGRESS / COMPLETED)
 * - Mapping von Beurteilungen → zugehoerige Checklisten-Items
 *
 * Wird verwendet von:
 * - Toggle-Endpoint (checklist/[itemId]/route.ts)
 * - Beurteilungs-Submit-Endpoint (civil-service-assessment/[token]/submit/route.ts)
 * - Beurteilungs-Acknowledgement-Endpoint (civil-service-acknowledgement/[token]/route.ts)
 */

import { prisma } from "@/lib/db";

// =============================================
// Phasen-Status-Neuberechnung
// =============================================

/**
 * Berechnet den korrekten Phasen-Status anhand aller Items in der Phase
 * und schreibt ihn nur dann, wenn er sich wirklich aendert.
 *
 * Logik:
 * - 0 Items erledigt → PENDING
 * - bei Phasen MIT Gatekeeper-Items: alle Gatekeeper fertig → COMPLETED
 * - bei Phasen OHNE Gatekeeper-Items: alle Items fertig → COMPLETED
 * - sonst → IN_PROGRESS
 */
export async function recalculatePhaseStatus(
  processId: string,
  phaseKey: string,
): Promise<{
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED";
  changed: boolean;
  totalItems: number;
  completedItems: number;
}> {
  const phaseItems = await prisma.civilServiceChecklistItem.findMany({
    where: { processId, phase: phaseKey },
    select: { id: true, isCompleted: true, isGatekeeper: true },
  });

  const totalItems = phaseItems.length;
  const completedItems = phaseItems.filter((i) => i.isCompleted).length;
  const gatekeeperItems = phaseItems.filter((i) => i.isGatekeeper);
  const hasGatekeepers = gatekeeperItems.length > 0;

  let targetStatus: "PENDING" | "IN_PROGRESS" | "COMPLETED";
  if (completedItems === 0) {
    targetStatus = "PENDING";
  } else {
    const phaseComplete = hasGatekeepers
      ? gatekeeperItems.every((g) => g.isCompleted)
      : completedItems === totalItems;
    targetStatus = phaseComplete ? "COMPLETED" : "IN_PROGRESS";
  }

  const currentPhase = await prisma.civilServicePhase.findFirst({
    where: { processId, phaseKey },
    select: { status: true },
  });

  let changed = false;
  if (currentPhase && currentPhase.status !== targetStatus) {
    await prisma.civilServicePhase.updateMany({
      where: { processId, phaseKey },
      data: {
        status: targetStatus,
        completedAt: targetStatus === "COMPLETED" ? new Date() : null,
      },
    });
    changed = true;
  }

  return { status: targetStatus, changed, totalItems, completedItems };
}

// =============================================
// Beurteilungen → Checklisten-Item-Mapping
// =============================================

/**
 * Liefert die Phase und die Item-Titel-Patterns, die zu einer Beurteilung
 * gehoeren. Wird nach jedem Submit oder Acknowledgement verwendet, um die
 * verlinkten Checklisten-Items automatisch abzuhaken.
 *
 * Quelle: src/lib/civil-service-checklist-template.ts
 */
export interface AssessmentChecklistMapping {
  phase: string;
  /** Item-Titel die EXAKT (case-insensitive substring) gematcht werden sollen */
  titles: string[];
}

export function getAssessmentChecklistMapping(
  assessmentNumber: number,
  assessmentType: "BEURTEILUNG" | "REFERENZ",
): AssessmentChecklistMapping | null {
  // 1. Unterrichtsbesuch (Phase I — Antrag & Beurteilung)
  if (assessmentNumber === 1 && assessmentType === "BEURTEILUNG") {
    return {
      phase: "I",
      titles: [
        "1. Unterrichtsbesuch durchgeführt",
        "Dienstliche Beurteilung ausgefüllt",
      ],
    };
  }
  if (assessmentNumber === 1 && assessmentType === "REFERENZ") {
    return {
      phase: "I",
      titles: [
        "Gespräch SL + Bewerber geführt",
        "Schriftliche Referenz SL erstellt",
        "Gemeinde-Referenz eingeholt",
      ],
    };
  }

  // 2. Unterrichtsbesuch (Phase III — Probezeit, nach 1 Jahr)
  if (assessmentNumber === 2 && assessmentType === "BEURTEILUNG") {
    return {
      phase: "III",
      titles: [
        "2. Unterrichtsbesuch durchgeführt (nach 1 Jahr)",
        "2. Dienstliche Beurteilung eingereicht",
      ],
    };
  }

  // 3. Unterrichtsbesuch (Phase III — Probezeit, Ende)
  if (assessmentNumber === 3 && assessmentType === "BEURTEILUNG") {
    return {
      phase: "III",
      titles: [
        "3. Unterrichtsbesuch durchgeführt (Ende Probezeit)",
        "3. Dienstliche Beurteilung eingereicht",
      ],
    };
  }
  if (assessmentNumber === 3 && assessmentType === "REFERENZ") {
    return {
      phase: "III",
      titles: [
        "2. Schriftliche Referenz SL erstellt",
        "Gemeinde-Referenz (2.) eingeholt",
      ],
    };
  }

  return null;
}

/**
 * Hakt die zu einer Beurteilung gehoerigen Checklisten-Items ab und
 * berechnet die betroffene Phase neu. Idempotent — bereits abgehakte
 * Items werden nicht erneut beruehrt.
 *
 * Returnt die Anzahl der neu abgehakten Items und den neuen Phasen-Status.
 */
export async function autoCheckAssessmentChecklistItems(params: {
  processId: string;
  assessmentNumber: number;
  assessmentType: "BEURTEILUNG" | "REFERENZ";
}): Promise<{
  checkedItems: number;
  phaseStatus: "PENDING" | "IN_PROGRESS" | "COMPLETED" | null;
  phaseKey: string | null;
}> {
  const mapping = getAssessmentChecklistMapping(
    params.assessmentNumber,
    params.assessmentType as "BEURTEILUNG" | "REFERENZ",
  );

  if (!mapping) {
    return { checkedItems: 0, phaseStatus: null, phaseKey: null };
  }

  // Items in der Phase laden, die per Title-Substring zu unseren Patterns passen
  const candidateItems = await prisma.civilServiceChecklistItem.findMany({
    where: {
      processId: params.processId,
      phase: mapping.phase,
      isCompleted: false,
    },
    select: { id: true, title: true },
  });

  const matched = candidateItems.filter((item) =>
    mapping.titles.some((pattern) =>
      item.title.toLowerCase().includes(pattern.toLowerCase()),
    ),
  );

  if (matched.length === 0) {
    // Trotzdem Phasen-Status pruefen — vielleicht aendert sich was anderes
    const status = await recalculatePhaseStatus(params.processId, mapping.phase);
    return {
      checkedItems: 0,
      phaseStatus: status.status,
      phaseKey: mapping.phase,
    };
  }

  const now = new Date();
  await prisma.civilServiceChecklistItem.updateMany({
    where: { id: { in: matched.map((m) => m.id) } },
    data: {
      isCompleted: true,
      completedAt: now,
      isOverdue: false,
    },
  });

  const status = await recalculatePhaseStatus(params.processId, mapping.phase);

  return {
    checkedItems: matched.length,
    phaseStatus: status.status,
    phaseKey: mapping.phase,
  };
}
