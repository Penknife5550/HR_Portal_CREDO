-- CreateTable: Checklisten-Vorlagen
CREATE TABLE "checklist_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "questionnaireType" "QuestionnaireType",
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "checklist_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Checklisten-Vorlagen-Punkte
CREATE TABLE "checklist_template_items" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "defaultDueDays" INTEGER,
    "defaultAssignee" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "checklist_template_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Checklisten-Eintraege (pro Onboarding)
CREATE TABLE "checklist_items" (
    "id" TEXT NOT NULL,
    "onboardingId" TEXT NOT NULL,
    "templateItemId" TEXT,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "completedById" TEXT,
    "dueDate" TIMESTAMP(3),
    "assignee" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "checklist_items_pkey" PRIMARY KEY ("id")
);

-- AlterTable: FK-Spalte fuer Checklisten-Vorlage an Onboarding-Prozess
ALTER TABLE "onboarding_processes" ADD COLUMN "checklistTemplateId" TEXT;

-- CreateIndex
CREATE INDEX "checklist_template_items_templateId_idx" ON "checklist_template_items"("templateId");
CREATE INDEX "checklist_items_onboardingId_idx" ON "checklist_items"("onboardingId");

-- AddForeignKey
ALTER TABLE "onboarding_processes" ADD CONSTRAINT "onboarding_processes_checklistTemplateId_fkey" FOREIGN KEY ("checklistTemplateId") REFERENCES "checklist_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "checklist_template_items" ADD CONSTRAINT "checklist_template_items_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "checklist_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "checklist_items" ADD CONSTRAINT "checklist_items_onboardingId_fkey" FOREIGN KEY ("onboardingId") REFERENCES "onboarding_processes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "checklist_items" ADD CONSTRAINT "checklist_items_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
