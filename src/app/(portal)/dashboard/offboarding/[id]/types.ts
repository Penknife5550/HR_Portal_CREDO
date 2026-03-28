// =============================================
// Types
// =============================================

export interface User {
  userId: string;
  email: string;
  role: string;
  firstName: string;
  lastName: string;
}

export interface ExitData {
  id: string;
  employmentType: string | null;
  tarifvertrag: string | null;
  entgeltgruppe: string | null;
  isBefristet: boolean;
  remainingVacationDays: number | null;
  vacationPayout: number | null;
  overtimeHours: number | null;
  overtimePayout: number | null;
  severancePay: string | null;
  certificateType: string | null;
  certificateStatus: string;
  svDeregistrationDone: boolean;
  svDeregistrationDate: string | null;
  employmentCertDone: boolean;
  employmentCertDate: string | null;
  nonCompeteClause: boolean;
  knowledgeTransferPlan: boolean;
  successorName: string | null;
  handoverDocComplete: boolean;
}

export interface ChecklistItemData {
  id: string;
  title: string;
  category: string;
  orderIndex: number;
  description: string | null;
  assigneeDepartment: string | null;
  isCompleted: boolean;
  completedAt: string | null;
  completedById: string | null;
  dueDate: string | null;
  notes: string | null;
}

export interface ReturnItemData {
  id: string;
  category: string;
  itemName: string;
  serialNumber: string | null;
  isReturned: boolean;
  returnedAt: string | null;
  condition: string | null;
  notes: string | null;
}

export interface DocumentData {
  id: string;
  type: string;
  fileName: string;
  fileSize: number;
  mimeType: string | null;
  status: string;
  uploadedAt: string;
}

export interface NoteData {
  id: string;
  content: string;
  createdAt: string;
  createdById: string;
  createdBy: { firstName: string; lastName: string };
}

export interface ExitInterviewResponseData {
  id: string;
  snapshotQuestionId: string;
  ratingValue: number | null;
  textValue: string | null;
  choiceValues: string[] | null;
  singleChoiceValue: string | null;
}

export interface ExitInterviewData {
  id: string;
  token: string;
  status: string;
  recipientEmail: string;
  sendAfterDate: string;
  sentAt: string | null;
  submittedAt: string | null;
  openCount: number;
  reminderCount: number;
  templateSnapshot?: {
    categories: Array<{
      id: string;
      name: string;
      questions: Array<{
        id: string;
        questionText: string;
        questionType: string;
      }>;
    }>;
  };
  responses?: ExitInterviewResponseData[];
  _count?: { responses: number };
}

export interface ZeugnisBewertungData {
  id: string;
  token: string;
  status: string;
  supervisorEmail: string;
  supervisorName: string | null;
  jobGroup: string;
  overallGrade: number | null;
  overallGradeRounded: number | null;
  supervisorSubmittedAt: string | null;
  finalizedAt: string | null;
  openCount: number;
  reminderCount: number;
  templateSnapshot?: {
    categories: Array<{
      id: string;
      name: string;
      weight: number;
      criteria: Array<{
        id: string;
        name: string;
        weight: number;
      }>;
    }>;
  };
  ratings?: Array<{
    snapshotCriterionId: string;
    snapshotCategoryId: string;
    grade: number;
    comment: string | null;
    hrOverrideGrade: number | null;
  }>;
}

export interface DepartmentLinkData {
  id: string;
  departmentKey: string;
  departmentName: string;
  email: string;
  token: string;
  sentAt: string | null;
  firstOpenedAt: string | null;
  lastOpenedAt: string | null;
  openCount: number;
  allTasksComplete: boolean;
  completedAt: string | null;
  lastReminderAt: string | null;
  reminderCount: number;
}

export interface OffboardingData {
  id: string;
  displayId: string;
  employeeEmail: string;
  employeeFirstName: string;
  employeeLastName: string;
  employeePersonalNr: string | null;
  employeePrivateEmail: string | null;
  exitType: string;
  exitReason: string | null;
  noticeDate: string | null;
  lastWorkingDay: string;
  contractEndDate: string | null;
  noticePeriodEnd: string | null;
  status: string;
  initiatedAt: string;
  completedAt: string | null;
  dataRetentionDate: string | null;
  organization: { name: string; mandantNumber: string };
  exitData: ExitData | null;
  returnItems: ReturnItemData[];
  documents: DocumentData[];
  checklistItems: ChecklistItemData[];
  notes: NoteData[];
  departmentLinks: DepartmentLinkData[];
}

// =============================================
// Constants
// =============================================

export const TABS = [
  { id: "overview", label: "Übersicht" },
  { id: "checklist", label: "Checkliste" },
  { id: "returns", label: "Rückgaben" },
  { id: "documents", label: "Dokumente" },
  { id: "notes", label: "Notizen" },
  { id: "exit-interview", label: "Exit-Interview" },
  { id: "zeugnis", label: "Zeugnis" },
] as const;

export type TabId = (typeof TABS)[number]["id"];
