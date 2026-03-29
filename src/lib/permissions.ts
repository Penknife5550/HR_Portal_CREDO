/**
 * Berechtigungssystem — Org-scoped Zugriffskontrolle
 *
 * SUPER_ADMIN + HR_LEITUNG: Sehen alles, volle Kontrolle
 * HR_SACHBEARBEITER: Sieht alles, kann bearbeiten aber keine Admin-Funktionen
 * EINRICHTUNGSLEITUNG: Sieht nur zugewiesene Mandanten, kann anlegen + Checkliste + Export
 * VORGESETZTER: Sieht nur zugewiesene Mandanten, nur Lesen + eigene Checkliste + Notizen
 * SERVICE: n8n API-Zugriff
 */

import { prisma } from "@/lib/db";

export interface SessionPayload {
  userId: string;
  email: string;
  role: string;
  firstName: string;
  lastName: string;
}

// =============================================
// Rollen-Gruppen
// =============================================

/** Rollen die alle Mandanten sehen duerfen */
export const GLOBAL_ROLES = ["SUPER_ADMIN", "HR_LEITUNG", "HR_SACHBEARBEITER"];

/** Rollen die Admin-Funktionen nutzen duerfen (Vorlagen, Benutzer, Mandanten, Einstellungen) */
export const ADMIN_ROLES = ["SUPER_ADMIN", "HR_LEITUNG"];

/** HR-Rollen die Vorgaenge bearbeiten duerfen (Status aendern, Felder editieren) */
export const HR_EDIT_ROLES = ["SUPER_ADMIN", "HR_LEITUNG", "HR_SACHBEARBEITER"];

/** Rollen die Vorgaenge anlegen duerfen */
export const PROCESS_CREATE_ROLES = ["SUPER_ADMIN", "HR_LEITUNG", "HR_SACHBEARBEITER", "EINRICHTUNGSLEITUNG"];

/** Rollen die PDF-Exports ausfuehren duerfen */
export const EXPORT_ROLES = ["SUPER_ADMIN", "HR_LEITUNG", "HR_SACHBEARBEITER", "EINRICHTUNGSLEITUNG"];

/** Rollen die Checklisten abhaken duerfen */
export const CHECKLIST_ROLES = ["SUPER_ADMIN", "HR_LEITUNG", "HR_SACHBEARBEITER", "EINRICHTUNGSLEITUNG", "VORGESETZTER", "SERVICE"];

/** Rollen die finanzielle/sensible Daten sehen duerfen (Gehalt, IBAN, SV-Nr) */
export const FINANCIAL_ROLES = ["SUPER_ADMIN", "HR_LEITUNG", "HR_SACHBEARBEITER", "EINRICHTUNGSLEITUNG"];

/** Alle Portal-Rollen (duerfen sich einloggen und Dashboard sehen) */
export const PORTAL_ROLES = ["SUPER_ADMIN", "HR_LEITUNG", "HR_SACHBEARBEITER", "EINRICHTUNGSLEITUNG", "VORGESETZTER"];

/** Rollen die nur ihre zugewiesenen Organisationen sehen */
export const ORG_RESTRICTED_ROLES = ["EINRICHTUNGSLEITUNG", "VORGESETZTER"];

// =============================================
// Org-Zugriff
// =============================================

/**
 * Gibt die Org-IDs zurueck die dieser User sehen darf.
 * Fuer globale Rollen: null (= alle).
 * Fuer eingeschraenkte Rollen: Array der zugewiesenen Org-IDs.
 */
export async function getAllowedOrgIds(
  session: SessionPayload
): Promise<string[] | null> {
  if (GLOBAL_ROLES.includes(session.role)) {
    return null; // null = keine Einschraenkung
  }

  const assignments = await prisma.userOrgAssignment.findMany({
    where: { userId: session.userId },
    select: { organizationId: true },
  });

  return assignments.map((a) => a.organizationId);
}

/**
 * Prueft ob der User auf eine bestimmte Organisation zugreifen darf.
 */
export async function canAccessOrg(
  session: SessionPayload,
  organizationId: string
): Promise<boolean> {
  if (GLOBAL_ROLES.includes(session.role)) return true;

  const assignment = await prisma.userOrgAssignment.findUnique({
    where: {
      userId_organizationId: {
        userId: session.userId,
        organizationId,
      },
    },
  });

  return !!assignment;
}

/**
 * Erstellt einen Prisma WHERE-Filter der die Org-Einschraenkung beruecksichtigt.
 * Kann direkt in findMany-Queries verwendet werden.
 */
export async function orgFilter(
  session: SessionPayload,
  fieldName: string = "organizationId"
): Promise<Record<string, unknown>> {
  const allowedIds = await getAllowedOrgIds(session);
  if (allowedIds === null) return {}; // Keine Einschraenkung
  if (allowedIds.length === 0) return { [fieldName]: { in: [] } }; // Kein Zugriff
  return { [fieldName]: { in: allowedIds } };
}

// =============================================
// Berechtigungsprüfungen
// =============================================

/** Prueft ob der User Admin-Rechte hat */
export function isAdmin(session: SessionPayload): boolean {
  return ADMIN_ROLES.includes(session.role);
}

/** Prueft ob der User HR-Rechte hat (globale Sicht) */
export function isHR(session: SessionPayload): boolean {
  return GLOBAL_ROLES.includes(session.role);
}

/** Prueft ob der User Vorgaenge starten darf */
export function canStartProcess(session: SessionPayload): boolean {
  return PROCESS_CREATE_ROLES.includes(session.role);
}

/** Prueft ob der User Vorgaenge bearbeiten darf (Status, Felder) */
export function canEditProcess(session: SessionPayload): boolean {
  return HR_EDIT_ROLES.includes(session.role);
}

/** Prueft ob der User PDF-Exports ausfuehren darf */
export function canExport(session: SessionPayload): boolean {
  return EXPORT_ROLES.includes(session.role);
}

/** Prueft ob der User Checklisten-Items abhaken darf */
export function canToggleChecklist(session: SessionPayload): boolean {
  return CHECKLIST_ROLES.includes(session.role);
}

/** Prueft ob der User finanzielle/sensible Daten sehen darf */
export function canSeeFinancials(session: SessionPayload): boolean {
  return FINANCIAL_ROLES.includes(session.role);
}

/** Prueft ob die Rolle org-eingeschraenkt ist */
export function isOrgRestricted(session: SessionPayload): boolean {
  return ORG_RESTRICTED_ROLES.includes(session.role);
}

// =============================================
// Rollen-Check Helper fuer API-Routes
// =============================================

/**
 * Prueft ob die Session-Rolle in der erlaubten Liste ist.
 * Gibt ein NextResponse-Objekt zurueck wenn nicht erlaubt, sonst null.
 */
export function checkRole(session: SessionPayload, allowedRoles: string[]): boolean {
  return allowedRoles.includes(session.role);
}

/**
 * Prueft Org-Zugriff fuer einen spezifischen Vorgang.
 * Fuer globale Rollen: immer true.
 * Fuer eingeschraenkte Rollen: prueft ob die Org zugewiesen ist.
 */
export async function canAccessProcess(
  session: SessionPayload,
  processOrgId: string
): Promise<boolean> {
  if (GLOBAL_ROLES.includes(session.role)) return true;
  return canAccessOrg(session, processOrgId);
}
