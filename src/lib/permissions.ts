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

/**
 * Rollen, die die BEM-Liste/Handlungsbedarf-Endpunkte aufrufen duerfen.
 * Das ist NUR ein grober "Portal-Nutzer"-Gate — die eigentliche Sichtbarkeit
 * je Fall regelt weiterhin bemFilter (Allowlist). Enthaelt zusaetzlich die
 * externe Rolle BEM_BEAUFTRAGTER (E7), die ausschliesslich BEM nutzen darf.
 * BEM_BEAUFTRAGTER darf bewusst NICHT in PORTAL_ROLES stehen, sonst wuerde sie
 * die Onboarding-/Offboarding-/Mutterschutz-Endpunkte passieren.
 */
export const BEM_PORTAL_ROLES = [...PORTAL_ROLES, "BEM_BEAUFTRAGTER"];

/** Rollen die nur ihre zugewiesenen Organisationen sehen */
export const ORG_RESTRICTED_ROLES = ["EINRICHTUNGSLEITUNG", "VORGESETZTER"];

// =============================================
// Org-Zugriff
// =============================================

/**
 * Gibt die Org-IDs zurück die dieser User sehen darf.
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
// Rollen-Check Helper für API-Routes
// =============================================

/**
 * Prueft ob die Session-Rolle in der erlaubten Liste ist.
 * Gibt ein NextResponse-Objekt zurück wenn nicht erlaubt, sonst null.
 */
export function checkRole(session: SessionPayload, allowedRoles: string[]): boolean {
  return allowedRoles.includes(session.role);
}

/**
 * Prueft Org-Zugriff für einen spezifischen Vorgang.
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

// =============================================
// BEM — "versiegelte Akte" (invertiertes Zugriffsmodell, § 167 SGB IX)
// =============================================
// WICHTIG: Anders als beim restlichen Portal gibt es hier KEINEN globalen
// Bypass. Auch SUPER_ADMIN/HR_LEITUNG sehen BEM-INHALTE nur mit einer aktiven
// BemZugriff-Freigabe. Sie duerfen Freigaben *verwalten* (canManageBemAccess),
// aber nicht automatisch lesen. Inhalts-Routen MUESSEN canAccessBemContent
// pruefen; Listen MUESSEN bemFilter verwenden.

/**
 * Prisma-WHERE-Filter fuer BEM-Faelle: nur Faelle, fuer die der User eine
 * aktive (nicht widerrufene) BemZugriff-Freigabe hat. Kein Eintrag = kein
 * Zugriff (auch fuer globale Rollen).
 */
export async function bemFilter(
  session: SessionPayload
): Promise<{ id: { in: string[] } }> {
  const zugriffe = await prisma.bemZugriff.findMany({
    where: { userId: session.userId, revokedAt: null },
    select: { bemFallId: true },
  });
  return { id: { in: zugriffe.map((z) => z.bemFallId) } };
}

/**
 * Prueft, ob der User die INHALTE eines konkreten BEM-Falls sehen darf.
 * Nur true bei aktiver BemZugriff-Freigabe — ohne globalen Rollen-Bypass.
 */
export async function canAccessBemContent(
  session: SessionPayload,
  bemFallId: string
): Promise<boolean> {
  const zugriff = await prisma.bemZugriff.findFirst({
    where: { bemFallId, userId: session.userId, revokedAt: null },
    select: { id: true },
  });
  return !!zugriff;
}

/**
 * Prueft, ob der User Freigaben (BemZugriff) verwalten darf.
 * Das berechtigt NICHT zum Lesen der Inhalte (siehe canAccessBemContent).
 */
export function canManageBemAccess(session: SessionPayload): boolean {
  return ADMIN_ROLES.includes(session.role);
}

/**
 * Prueft, ob der User INHALTE eines Falls VERAENDERN darf (Gespraeche/Massnahmen/
 * Dokumente erfassen, Status/Stammfelder aendern, Einwilligung widerrufen).
 *
 * Anders als canAccessBemContent (rollenblind, jede aktive Freigabe darf lesen)
 * sind beteiligte BR/SBV bewusst NUR lesend: schreibend duerfen nur die
 * verfahrensfuehrenden Rollen BEAUFTRAGTE/VERTRETUNG. Verhindert u.a., dass
 * BR/SBV den Diagnose-Schutz abschalten oder Inhalte erfassen (E9).
 */
export async function canMutateBemContent(
  session: SessionPayload,
  bemFallId: string
): Promise<boolean> {
  const zugriff = await prisma.bemZugriff.findFirst({
    where: {
      bemFallId,
      userId: session.userId,
      revokedAt: null,
      rolle: { in: ["BEAUFTRAGTE", "VERTRETUNG"] },
    },
    select: { id: true },
  });
  return !!zugriff;
}

/**
 * Soll fuer diese:n Betrachter:in der sensible Freitext ausgeblendet werden?
 * true, wenn der Diagnose-Schutz aktiv ist UND die Person ausschliesslich als
 * BR/SBV (ohne BEAUFTRAGTE/VERTRETUNG) freigegeben ist (least privilege).
 * Erwartet die aktiven Zugriffe als {userId, rolle}[] (revokedAt:null vorgefiltert).
 */
export function bemFreitextAusblenden(
  diagnoseSchutz: boolean,
  zugriffe: { userId: string; rolle: string }[],
  userId: string
): boolean {
  if (!diagnoseSchutz) return false;
  const rollen = zugriffe.filter((z) => z.userId === userId).map((z) => z.rolle);
  if (rollen.length === 0) return false;
  const fuehrend = rollen.includes("BEAUFTRAGTE") || rollen.includes("VERTRETUNG");
  return !fuehrend && rollen.some((r) => r === "BR" || r === "SBV");
}

/**
 * Prueft, ob der User einen BEM-Fall anlegen darf:
 * SUPER_ADMIN oder intern als BEM-Beauftragte:r gekennzeichnete Nutzer (Flag).
 *
 * HINWEIS (E7): Die EXTERNE Rolle BEM_BEAUFTRAGTER darf bewusst KEINE Faelle
 * anlegen — externe Beauftragte bearbeiten ausschliesslich ihnen freigegebene
 * Faelle (Datensparsamkeit / versiegelte Akte). Eine interne Stelle legt den
 * Fall an und gibt sie frei.
 */
export async function canCreateBemFall(
  session: SessionPayload
): Promise<boolean> {
  if (session.role === "SUPER_ADMIN") return true;
  if (session.role === "BEM_BEAUFTRAGTER") return false;
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { isBemBeauftragte: true },
  });
  return !!user?.isBemBeauftragte;
}

/**
 * Externe:r BEM-Beauftragte:r (E7): darf ausschliesslich das BEM-Modul sehen.
 * Wird fuer Navigation/Redirects verwendet (Middleware/Header).
 */
export function isExternalBemUser(session: SessionPayload): boolean {
  return session.role === "BEM_BEAUFTRAGTER";
}
