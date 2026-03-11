-- CreateEnum
CREATE TYPE "OrganizationType" AS ENUM ('GYMNASIUM', 'GESAMTSCHULE', 'GRUNDSCHULE', 'BERUFSKOLLEG', 'KITA', 'VERWALTUNG', 'GMBH', 'VEREIN');

-- CreateEnum
CREATE TYPE "OnboardingStatus" AS ENUM ('INVITED', 'IN_PROGRESS', 'SUBMITTED', 'SUPERVISOR_PENDING', 'SUPERVISOR_SUBMITTED', 'REVIEWED', 'COMPLETED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "QuestionnaireType" AS ENUM ('STANDARD', 'BEAMTE', 'ERZIEHER', 'MINIJOB', 'EHRENAMT');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('ARBEITSVERTRAG', 'FUEHRUNGSZEUGNIS', 'KK_BESCHEINIGUNG', 'GEBURTSURKUNDE_KIND', 'SV_AUSWEIS', 'ZEUGNIS', 'ABSCHLUSSZEUGNIS', 'MASERNSCHUTZ', 'INFEKTIONSSCHUTZ', 'RV_BEFREIUNG', 'SB_AUSWEIS', 'VL_VERTRAG', 'BAV_VERTRAG', 'SONSTIGES');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('UPLOADED', 'REVIEWED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'HR_LEITUNG', 'HR_SACHBEARBEITER');

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "mandantNumber" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shortName" TEXT,
    "type" "OrganizationType" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "onboarding_processes" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "token" TEXT NOT NULL,
    "tokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "supervisorEmail" TEXT,
    "supervisorToken" TEXT,
    "supervisorTokenExpiresAt" TIMESTAMP(3),
    "status" "OnboardingStatus" NOT NULL DEFAULT 'INVITED',
    "questionnaireType" "QuestionnaireType" NOT NULL DEFAULT 'STANDARD',
    "invitedById" TEXT,
    "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),
    "supervisorSubmittedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "onboarding_processes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "personal_data" (
    "id" TEXT NOT NULL,
    "onboardingId" TEXT NOT NULL,
    "salutation" TEXT,
    "title" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "birthName" TEXT,
    "birthDate" TIMESTAMP(3),
    "birthPlace" TEXT,
    "birthCountry" TEXT DEFAULT 'Deutschland',
    "nationality" TEXT DEFAULT 'deutsch',
    "maritalStatus" TEXT,
    "severelyDisabled" BOOLEAN DEFAULT false,
    "disabilityDegree" INTEGER,
    "street" TEXT,
    "houseNumber" TEXT,
    "zipCode" TEXT,
    "city" TEXT,
    "country" TEXT DEFAULT 'Deutschland',
    "phone" TEXT,
    "mobile" TEXT,
    "emailPrivate" TEXT,
    "iban" TEXT,
    "bic" TEXT,
    "bankName" TEXT,
    "accountHolder" TEXT,
    "socialSecurityNumber" TEXT,
    "healthInsuranceName" TEXT,
    "healthInsuranceType" TEXT,
    "parentStatus" BOOLEAN,
    "taxId" TEXT,
    "taxClass" TEXT,
    "taxAllowance" DOUBLE PRECISION,
    "childAllowance" DOUBLE PRECISION,
    "religion" TEXT,
    "isBeamter" BOOLEAN NOT NULL DEFAULT false,
    "besoldungsgruppe" TEXT,
    "laufbahngruppe" TEXT,
    "dienstzeitBeginn" TIMESTAMP(3),
    "amtsbezeichnung" TEXT,
    "verfassungstreuePruefung" BOOLEAN,
    "hasOtherEmployment" BOOLEAN DEFAULT false,
    "otherEmployerName" TEXT,
    "otherWeeklyHours" DOUBLE PRECISION,
    "bornAfter1971" BOOLEAN,
    "masernschutzProvided" BOOLEAN,
    "currentStep" INTEGER NOT NULL DEFAULT 0,
    "isComplete" BOOLEAN NOT NULL DEFAULT false,
    "dsgvoAccepted" BOOLEAN NOT NULL DEFAULT false,
    "dsgvoAcceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "personal_data_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "children" (
    "id" TEXT NOT NULL,
    "personalDataId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT,
    "birthDate" TIMESTAMP(3) NOT NULL,
    "taxAllowance" BOOLEAN NOT NULL DEFAULT false,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "children_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supervisor_data" (
    "id" TEXT NOT NULL,
    "onboardingId" TEXT NOT NULL,
    "betriebsstaette" TEXT,
    "stellenbeschreibung" TEXT,
    "vertragsbeginn" TIMESTAMP(3),
    "befristet" BOOLEAN,
    "vertragsende" TIMESTAMP(3),
    "befristungSachgrund" TEXT,
    "vollzeit" BOOLEAN DEFAULT true,
    "wochenstunden" DOUBLE PRECISION,
    "tageProWoche" INTEGER,
    "hauptarbeitgeberId" TEXT,
    "hauptarbeitgeberStunden" DOUBLE PRECISION,
    "nebenarbeitgeberId" TEXT,
    "nebenarbeitgeberStunden" DOUBLE PRECISION,
    "svPflichtig" BOOLEAN DEFAULT true,
    "minijob" BOOLEAN DEFAULT false,
    "ehrenamt" BOOLEAN DEFAULT false,
    "kostenstelle" TEXT,
    "kostenstelleAnteil" DOUBLE PRECISION,
    "probezeit" BOOLEAN DEFAULT true,
    "probezeitMonate" INTEGER DEFAULT 6,
    "verguetungsmodell" TEXT,
    "entgeltgruppe" TEXT,
    "stufe" TEXT,
    "festgehalt" DOUBLE PRECISION,
    "stundenlohn" DOUBLE PRECISION,
    "bemerkungVerguetung" TEXT,
    "jahressonderzahlung" BOOLEAN DEFAULT true,
    "sonderzahlungProzent" DOUBLE PRECISION,
    "sachbezuege" BOOLEAN DEFAULT false,
    "sachbezuegeBetrag" DOUBLE PRECISION,
    "zulage" BOOLEAN DEFAULT false,
    "zulageBetrag" DOUBLE PRECISION,
    "urlaubstageProJahr" INTEGER DEFAULT 30,
    "masernschutzErforderlich" BOOLEAN DEFAULT false,
    "masernschutzVorArbeitsbeginn" BOOLEAN,
    "zeiterfassung" BOOLEAN DEFAULT true,
    "zusatzvereinbarungen" TEXT,
    "currentStep" INTEGER NOT NULL DEFAULT 0,
    "isComplete" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supervisor_data_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "onboardingId" TEXT NOT NULL,
    "type" "DocumentType" NOT NULL,
    "fileName" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'UPLOADED',
    "rejectionReason" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'HR_SACHBEARBEITER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "onboardingId" TEXT,
    "action" TEXT NOT NULL,
    "details" JSONB,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_mandantNumber_key" ON "organizations"("mandantNumber");

-- CreateIndex
CREATE UNIQUE INDEX "onboarding_processes_token_key" ON "onboarding_processes"("token");

-- CreateIndex
CREATE UNIQUE INDEX "onboarding_processes_supervisorToken_key" ON "onboarding_processes"("supervisorToken");

-- CreateIndex
CREATE INDEX "onboarding_processes_status_idx" ON "onboarding_processes"("status");

-- CreateIndex
CREATE INDEX "onboarding_processes_organizationId_idx" ON "onboarding_processes"("organizationId");

-- CreateIndex
CREATE INDEX "onboarding_processes_email_idx" ON "onboarding_processes"("email");

-- CreateIndex
CREATE UNIQUE INDEX "personal_data_onboardingId_key" ON "personal_data"("onboardingId");

-- CreateIndex
CREATE UNIQUE INDEX "supervisor_data_onboardingId_key" ON "supervisor_data"("onboardingId");

-- CreateIndex
CREATE INDEX "documents_onboardingId_idx" ON "documents"("onboardingId");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "audit_logs_onboardingId_idx" ON "audit_logs"("onboardingId");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- AddForeignKey
ALTER TABLE "onboarding_processes" ADD CONSTRAINT "onboarding_processes_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_processes" ADD CONSTRAINT "onboarding_processes_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_processes" ADD CONSTRAINT "onboarding_processes_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personal_data" ADD CONSTRAINT "personal_data_onboardingId_fkey" FOREIGN KEY ("onboardingId") REFERENCES "onboarding_processes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "children" ADD CONSTRAINT "children_personalDataId_fkey" FOREIGN KEY ("personalDataId") REFERENCES "personal_data"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supervisor_data" ADD CONSTRAINT "supervisor_data_onboardingId_fkey" FOREIGN KEY ("onboardingId") REFERENCES "onboarding_processes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_onboardingId_fkey" FOREIGN KEY ("onboardingId") REFERENCES "onboarding_processes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_onboardingId_fkey" FOREIGN KEY ("onboardingId") REFERENCES "onboarding_processes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
