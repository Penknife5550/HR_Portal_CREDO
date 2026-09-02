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

export interface AssessmentSnapshotCriterion {
  id: string;
  name: string;
  description?: string | null;
  weight?: number;
  orderIndex?: number;
}

export interface AssessmentSnapshotCategory {
  id: string;
  name: string;
  description?: string | null;
  weight?: number;
  orderIndex?: number;
  isMandatory?: boolean;
  legalReference?: string | null;
  criteria: AssessmentSnapshotCriterion[];
}

export interface AssessmentTemplateSnapshot {
  templateId?: string | null;
  name?: string;
  version?: number;
  scaleType?: "BRL_1_5" | "SCHULNOTEN_1_6";
  scaleLabels?: Record<string, string>;
  categories: AssessmentSnapshotCategory[];
}

export interface AssessmentData {
  id: string;
  assessmentNumber: number;
  assessmentType: string; // "BEURTEILUNG" | "REFERENZ"
  status?: string;
  // Reale Prisma-Felder:
  recipientEmail: string;
  recipientName: string | null;
  overallGrade: number | null;
  overallReasoning: string | null;
  meetsRequirements: boolean | null;
  meetsRequirementsManual: boolean | null;
  scaleType: string | null;
  templateSnapshot: AssessmentTemplateSnapshot | null;
  ratingsData: Record<string, number> | null;
  referenceData: Record<string, string> | null;
  gemeindeReferenz: string | null;

  // Workflow Phase 3
  scheduledDate: string | null;
  announcedAt: string | null;
  fach: string | null;
  klasse: string | null;
  vertrauenslehrkraft: string | null;
  unbiasedConfirmed: boolean | null;
  unbiasedConfirmedAt: string | null;
  postReviewAt: string | null;
  postReviewNotes: string | null;
  beurteilungsgespraechAt: string | null;
  beurteilungsgespraechNotes: string | null;

  // Bekanntgabe Phase 5
  employeeAckToken: string | null;
  employeeAckExpiresAt: string | null;
  releasedToEmployeeAt: string | null;
  acknowledgedByEmployeeAt: string | null;
  rebuttalText: string | null;
  rebuttalAt: string | null;

  // Archivierung — Schritt 9 (COMPLETED)
  archivedAt: string | null;
  archivedById: string | null;

  // Verify Phase 6
  verifyToken: string | null;

  token: string | null;
  tokenExpiresAt: string | null;
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
  // Prisma liefert hier ein JSON-Objekt; kann historisch auch String oder null sein.
  details: Record<string, unknown> | string | null;
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

export interface StakeholderContact {
  name?: string;
  email: string;
}

export interface Stakeholders {
  schulleitung?: StakeholderContact;
  amtsarzt?: { email: string };
  beirat?: { email: string };
}

export interface CivilServiceData {
  id: string;
  displayId: string;
  status: string;
  currentStep: number;
  employeeFirstName: string;
  employeeLastName: string;
  employeeEmail: string;
  // Die Schnittstelle gibt die rohe Prisma-Zeile zurueck, organizationId liegt
  // also vor. Sie wird fuer die Vorlagen-Sektion gebraucht, damit nur die
  // Vorlagen dieses Traegers geladen werden.
  organizationId: string;
  // Die Schnittstelle gibt die rohe Prisma-Zeile mit include organization
  // zurueck. Hier standen frueher drei Felder, die sie nie geliefert hat:
  // organizationName (heisst organization.name), startDate (heisst
  // targetStartDate) und lifetimeDate (gibt es im Datenmodell gar nicht).
  // TypeScript hat das nicht gemerkt, die Anzeige blieb leer.
  organization: { name: string };
  targetStartDate: string | null;
  probationStartDate: string | null;
  probationEndDate: string | null;
  phases: PhaseData[];
  checklistItems: ChecklistItem[];
  assessments: AssessmentData[];
  documents: DocumentData[];
  auditLog: AuditLogEntry[];
  auditLogs: AuditLogEntry[];
  boardDecisions: BoardDecision[];
  prerequisites: PrerequisiteData[];
  applicationToken: string | null;
  applicationSubmittedAt: string | null;
  stakeholders: Stakeholders | null;
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
