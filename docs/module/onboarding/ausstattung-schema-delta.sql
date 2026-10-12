-- =============================================================================
-- Ausstattung & Zugaenge (A1 bis A3) – Schema-Delta gegenueber main
--
-- NUR ZUR UEBERGABE UND PRUEFUNG. Nicht von Hand ausfuehren: Der Entrypoint
-- vergleicht das Schema beim Containerstart selbst (`prisma migrate diff
-- --exit-code`), sichert per pg_dump nach /backups und spielt den Unterschied
-- mit `prisma db push --skip-generate --accept-data-loss` ein. Dieses Skript
-- zeigt, was dabei geschieht.
--
-- Erzeugt (Arbeitsschritt S1 des Feinplans, 12.10.2026) mit:
--   git show main:prisma/schema.prisma > node_modules/.cache/ausstattung/schema-main.prisma
--   npx prisma migrate diff \
--     --from-schema-datamodel node_modules/.cache/ausstattung/schema-main.prisma \
--     --to-schema-datamodel prisma/schema.prisma --script
-- Ausgang: main 8c1ef05. Prisma 6.9.0.
--
-- Befund: rein additiv.
--   4 x ALTER TABLE … ADD COLUMN (onboarding_processes, supervisor_data,
--       checklist_items, offboarding_department_links), 6 x CREATE TABLE,
--   9 x CREATE [UNIQUE] INDEX, 11 x ADD CONSTRAINT (nur Fremdschluessel neuer
--   Spalten bzw. neuer Tabellen).
--   Kein DROP, kein RENAME, kein ALTER COLUMN. Die Benennung der bestehenden
--   Relation OnboardingProcess.organization ("OnboardingEinrichtung", F14)
--   aendert nichts in der Datenbank: onboarding_processes_organizationId_fkey
--   kommt im Delta nicht vor (Feinplan Abschnitt 5, Frage 2, damit belegt).
--   checklist_items.eilt ist NOT NULL mit Konstante (DEFAULT false): Postgres
--   ergaenzt die Spalte ohne die Tabelle umzuschreiben.
--
-- Nach dem Push (nicht Teil dieses Skripts): Die einmalige Datenmigration
-- SUPERVISOR_MIT_AUSSTATTUNG_V1 in prisma/seed-check.js setzt
-- supervisor_data."mitAusstattung" im Bestand auf false (Arbeitsschritt S7).
-- =============================================================================

-- AlterTable
ALTER TABLE "onboarding_processes" ADD COLUMN     "arbeitsortId" TEXT,
ADD COLUMN     "ausstattungSammelmailAm" TIMESTAMP(3),
ADD COLUMN     "expiredAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "supervisor_data" ADD COLUMN     "ausstattungGespeichertAm" TIMESTAMP(3),
ADD COLUMN     "mitAusstattung" BOOLEAN;

-- AlterTable
ALTER TABLE "checklist_items" ADD COLUMN     "eilt" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "entfaelltAm" TIMESTAMP(3),
ADD COLUMN     "herkunft" TEXT;

-- AlterTable
ALTER TABLE "offboarding_department_links" ADD COLUMN     "abgesagtAm" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ausstattungs_positionen" (
    "id" TEXT NOT NULL,
    "departmentKey" TEXT NOT NULL,
    "organizationId" TEXT,
    "einrichtungsarten" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "art" TEXT NOT NULL,
    "angabeSchluessel" TEXT,
    "bezeichnung" TEXT NOT NULL,
    "hinweisFuehrungskraft" TEXT,
    "hinweisStelle" TEXT,
    "optionen" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "vorausgewaehlt" BOOLEAN NOT NULL DEFAULT false,
    "vorausgewaehlteOptionen" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "bemerkungAnbieten" BOOLEAN NOT NULL DEFAULT true,
    "bemerkungPlatzhalter" TEXT,
    "aufgabeTitel" TEXT,
    "defaultDueDays" INTEGER,
    "personengruppen" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sichtbarFuer" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "entgeltrelevant" BOOLEAN NOT NULL DEFAULT false,
    "ausgabeKennung" TEXT,
    "rueckgabeKategorie" TEXT,
    "beiAustritt" TEXT,
    "vorschlagSchluessel" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ausstattungs_positionen_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ausstattungs_ausblendungen" (
    "positionId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ausstattungs_ausblendungen_pkey" PRIMARY KEY ("positionId","organizationId")
);

-- CreateTable
CREATE TABLE "onboarding_ausstattung" (
    "id" TEXT NOT NULL,
    "onboardingId" TEXT NOT NULL,
    "positionId" TEXT,
    "departmentKey" TEXT NOT NULL,
    "art" TEXT NOT NULL,
    "angabeSchluessel" TEXT,
    "bezeichnung" TEXT NOT NULL,
    "aufgabeTitel" TEXT NOT NULL,
    "hinweisStelle" TEXT,
    "relativeDueDays" INTEGER,
    "sichtbarFuer" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ausgabeKennung" TEXT,
    "rueckgabeKategorie" TEXT,
    "beiAustritt" TEXT,
    "reihenfolge" INTEGER NOT NULL DEFAULT 0,
    "auswahl" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "angabe" TEXT,
    "bemerkung" TEXT,
    "bemerkungQuelle" TEXT,
    "quelle" TEXT NOT NULL,
    "erfasstVonId" TEXT,
    "gestrichenAm" TIMESTAMP(3),
    "inhaltGeleertAm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "onboarding_ausstattung_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "onboarding_ausstattung_aufgaben" (
    "ausstattungId" TEXT NOT NULL,
    "option" TEXT NOT NULL DEFAULT '',
    "checklistItemId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "onboarding_ausstattung_aufgaben_pkey" PRIMARY KEY ("ausstattungId","option")
);

-- CreateTable
CREATE TABLE "onboarding_stellen_hinweise" (
    "onboardingId" TEXT NOT NULL,
    "departmentKey" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "quelle" TEXT NOT NULL,
    "checklistItemId" TEXT,
    "gesehenAm" TIMESTAMP(3),
    "inhaltGeleertAm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "onboarding_stellen_hinweise_pkey" PRIMARY KEY ("onboardingId","departmentKey")
);

-- CreateTable
CREATE TABLE "onboarding_ausstattung_aenderungen" (
    "id" TEXT NOT NULL,
    "onboardingId" TEXT NOT NULL,
    "departmentKey" TEXT NOT NULL,
    "art" TEXT NOT NULL,
    "titel" TEXT NOT NULL,
    "erfasstAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "gesendetAm" TIMESTAMP(3),

    CONSTRAINT "onboarding_ausstattung_aenderungen_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ausstattungs_positionen_vorschlagSchluessel_key" ON "ausstattungs_positionen"("vorschlagSchluessel");

-- CreateIndex
CREATE INDEX "ausstattungs_positionen_organizationId_idx" ON "ausstattungs_positionen"("organizationId");

-- CreateIndex
CREATE INDEX "ausstattungs_positionen_departmentKey_idx" ON "ausstattungs_positionen"("departmentKey");

-- CreateIndex
CREATE INDEX "onboarding_ausstattung_onboardingId_idx" ON "onboarding_ausstattung"("onboardingId");

-- CreateIndex
CREATE UNIQUE INDEX "onboarding_ausstattung_onboardingId_positionId_key" ON "onboarding_ausstattung"("onboardingId", "positionId");

-- CreateIndex
CREATE UNIQUE INDEX "onboarding_ausstattung_aufgaben_checklistItemId_key" ON "onboarding_ausstattung_aufgaben"("checklistItemId");

-- CreateIndex
CREATE UNIQUE INDEX "onboarding_stellen_hinweise_checklistItemId_key" ON "onboarding_stellen_hinweise"("checklistItemId");

-- CreateIndex
CREATE INDEX "onboarding_ausstattung_aenderungen_onboardingId_departmentK_idx" ON "onboarding_ausstattung_aenderungen"("onboardingId", "departmentKey", "gesendetAm");

-- CreateIndex
CREATE INDEX "onboarding_processes_arbeitsortId_idx" ON "onboarding_processes"("arbeitsortId");

-- AddForeignKey
ALTER TABLE "onboarding_processes" ADD CONSTRAINT "onboarding_processes_arbeitsortId_fkey" FOREIGN KEY ("arbeitsortId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ausstattungs_positionen" ADD CONSTRAINT "ausstattungs_positionen_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ausstattungs_ausblendungen" ADD CONSTRAINT "ausstattungs_ausblendungen_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "ausstattungs_positionen"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ausstattungs_ausblendungen" ADD CONSTRAINT "ausstattungs_ausblendungen_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_ausstattung" ADD CONSTRAINT "onboarding_ausstattung_onboardingId_fkey" FOREIGN KEY ("onboardingId") REFERENCES "onboarding_processes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_ausstattung" ADD CONSTRAINT "onboarding_ausstattung_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "ausstattungs_positionen"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_ausstattung_aufgaben" ADD CONSTRAINT "onboarding_ausstattung_aufgaben_ausstattungId_fkey" FOREIGN KEY ("ausstattungId") REFERENCES "onboarding_ausstattung"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_ausstattung_aufgaben" ADD CONSTRAINT "onboarding_ausstattung_aufgaben_checklistItemId_fkey" FOREIGN KEY ("checklistItemId") REFERENCES "checklist_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_stellen_hinweise" ADD CONSTRAINT "onboarding_stellen_hinweise_onboardingId_fkey" FOREIGN KEY ("onboardingId") REFERENCES "onboarding_processes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_stellen_hinweise" ADD CONSTRAINT "onboarding_stellen_hinweise_checklistItemId_fkey" FOREIGN KEY ("checklistItemId") REFERENCES "checklist_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_ausstattung_aenderungen" ADD CONSTRAINT "onboarding_ausstattung_aenderungen_onboardingId_fkey" FOREIGN KEY ("onboardingId") REFERENCES "onboarding_processes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

