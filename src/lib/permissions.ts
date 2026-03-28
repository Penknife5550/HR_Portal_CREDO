/**
 * Berechtigungssystem — Org-scoped Zugriffskontrolle
 *
 * SUPER_ADMIN + HR_LEITUNG: Sehen alles
 * HR_SACHBEARBEITER: Sieht alles (kann aber weniger bearbeiten)
 * EINRICHTUNGSLEITUNG: Sieht nur zugewiesene Mandanten
 * VORGESETZTER: Sieht nur eigene Mitarbeiter (zugewiesene Mandanten)
 */

import { prisma } from "@/lib/db";

interface SessionPayload {
  userId: string;
  email: string;
  role: string;
  firstName: string;
  lastName: string;
}

/** Rollen die alle Mandanten sehen dürfen */
const GLOBAL_ROLES = ["SUPER_ADMIN", "HR_LEITUNG", "HR_SACHBEARBEITER"];

/** Rollen die Admin-Funktionen nutzen dürfen */
const ADMIN_ROLES = ["SUPER_ADMIN", "HR_LEITUNG"];

/**
 * Gibt die Org-IDs zurück die dieser User sehen darf.
 * Für globale Rollen: null (= alle).
 * Für eingeschränkte Rollen: Array der zugewiesenen Org-IDs.
 */
export async function getAllowedOrgIds(
  session: SessionPayload
): Promise<string[] | null> {
  if (GLOBAL_ROLES.includes(session.role)) {
    return null; // null = keine Einschränkung
  }

  const assignments = await prisma.userOrgAssignment.findMany({
    where: { userId: session.userId },
    select: { organizationId: true },
  });

  return assignments.map((a) => a.organizationId);
}

/**
 * Prüft ob der User auf eine bestimmte Organisation zugreifen darf.
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
 * Prüft ob der User Admin-Rechte hat (Vorlagen bearbeiten, Benutzer verwalten etc.)
 */
export function isAdmin(session: SessionPayload): boolean {
  return ADMIN_ROLES.includes(session.role);
}

/**
 * Prüft ob der User HR-Rechte hat (Vorgänge bearbeiten, Status ändern etc.)
 */
export function isHR(session: SessionPayload): boolean {
  return GLOBAL_ROLES.includes(session.role);
}

/**
 * Prüft ob der User Vorgänge starten darf
 * (HR + Einrichtungsleitung wenn in Einstellungen erlaubt)
 */
export function canStartProcess(session: SessionPayload): boolean {
  return [...GLOBAL_ROLES, "EINRICHTUNGSLEITUNG"].includes(session.role);
}

/**
 * Erstellt einen Prisma WHERE-Filter der die Org-Einschränkung berücksichtigt.
 * Kann direkt in findMany-Queries verwendet werden.
 */
export async function orgFilter(
  session: SessionPayload,
  fieldName: string = "organizationId"
): Promise<Record<string, unknown>> {
  const allowedIds = await getAllowedOrgIds(session);
  if (allowedIds === null) return {}; // Keine Einschränkung
  return { [fieldName]: { in: allowedIds } };
}
