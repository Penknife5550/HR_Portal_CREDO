-- AlterTable
ALTER TABLE "personal_data" ADD COLUMN     "employerType" TEXT,
ADD COLUMN     "hasMinijob" BOOLEAN DEFAULT false,
ADD COLUMN     "highestProfessionalDegree" TEXT,
ADD COLUMN     "highestSchoolDegree" TEXT,
ADD COLUMN     "minijobRvBefreiung" BOOLEAN DEFAULT false;

-- CreateTable
CREATE TABLE "form_templates" (
    "id" TEXT NOT NULL,
    "questionnaireType" "QuestionnaireType" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "stepsConfig" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "form_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "form_templates_questionnaireType_key" ON "form_templates"("questionnaireType");
