// =============================================
// Types for Civil Service (PSI) Detail Page
// =============================================

export interface User {
  userId: string;
  email: string;
  role: string;
  firstName: string;
  lastName: string;
}

export interface ChecklistItem {
  id: string;
  step: string;
  phase: string;
  category: string;
  title: string;
  description: string | null;
  assignee: string;
  isGatekeeper: boolean;
  isCompleted: boolean;
  completedAt: string | null;
  completedById: string | null;
  dueDate: string | null;
  linkedDocumentType: string | null;
  notes: string | null;
}

export interface PhaseData {
  id: string;
  phaseKey: string;
  phaseName: string;
  status: string; // NOT_STARTED | IN_PROGRESS | COMPLETED | BLOCKED
  orderIndex: number;
}

export interface AssessmentData {
  id: string;
  assessmentNumber: number;
  assessmentType: string; // "BEURTEILUNG" | "REFERENZ"
  status: string;
  supervisorEmail: string;
  recipientEmail: string;
  supervisorName: string | null;
  recipientName: string | null;
  grade: number | null;
  token: string | null;
  sentAt: string | null;
  firstOpenedAt: string | null;
  lastOpenedAt: string | null;
  openCount: number;
  submittedAt: string | null;
}

export interface DocumentData {
  id: string;
  type: string;
  fileName: string;
  fileSize: number;
  mimeType: string | null;
  status: string;
  uploadedAt: string;
  expiresAt: string | null;
}

export interface AuditLogEntry {
  id: string;
  action: string;
  details: string | null;
  createdAt: string;
  createdBy: { firstName: string; lastName: string } | null;
}

export interface BoardDecision {
  id: string;
  decisionType: string;
  result: string;
  date: string;
  notes: string | null;
}

export interface PrerequisiteData {
  key: string;
  label: string;
  met: boolean;
}

export interface CivilServiceData {
  id: string;
  displayId: string;
  status: string;
  currentStep: number;
  employeeFirstName: string;
  employeeLastName: string;
  employeeEmail: string;
  organizationName: string;
  startDate: string | null;
  probationStartDate: string | null;
  probationEndDate: string | null;
  lifetimeDate: string | null;
  phases: PhaseData[];
  checklistItems: ChecklistItem[];
  assessments: AssessmentData[];
  documents: DocumentData[];
  auditLog: AuditLogEntry[];
  boardDecisions: BoardDecision[];
  prerequisites: PrerequisiteData[];
  applicationToken: string | null;
  applicationSubmittedAt: string | null;
}

// =============================================
// Constants
// =============================================

export const TABS = [
  { id: "overview", label: "Übersicht" },
  { id: "checklist", label: "Checkliste" },
  { id: "assessments", label: "Beurteilungen" },
  { id: "documents", label: "Dokumente" },
  { id: "protocol", label: "Protokoll" },
] as const;

export type TabId = (typeof TABS)[number]["id"];

export const PHASE_ORDER = ["I", "II_A", "II_B", "II_C", "II_D", "II_E", "II_F", "II_G", "II_H", "III", "IV"];

export const MAIN_PHASES = [
  { key: "I", label: "Phase I: Antrag", icon: "I" },
  { key: "II", label: "Phase II: Verwaltung", icon: "II" },
  { key: "III", label: "Phase III: Probezeit", icon: "III" },
  { key: "IV", label: "Phase IV: Lebenszeit", icon: "IV" },
] as const;

export const SUB_PHASES_II = ["II_A", "II_B", "II_C", "II_D", "II_E", "II_F", "II_G", "II_H"] as const;

export const ASSIGNEE_COLORS: Record<string, string> = {
  HR: "bg-credo-blau/10 text-credo-blau",
  SL: "bg-purple-100 text-purple-800",
  LK: "bg-credo-gruen/10 text-credo-gruen",
  EXTERN: "bg-orange-100 text-orange-800",
  BEIRAT: "bg-credo-gelb/10 text-credo-gelb",
};
