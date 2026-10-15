-- =============================================================================
-- Ausstattung & Zugaenge (A1 bis A3) – Schema-Delta gegenueber main
-- (Stufe 2, Paket A4: eigener Abschnitt „A4“ am Ende dieser Datei.)
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
-- Danach fuellt AUSSTATTUNG_STANDARDKATALOG_V1 die (dann leere) Tabelle
-- ausstattungs_positionen mit dem Standardkatalog (20 Positionen, 13
-- eingeschaltet, ohne A4-Werte; Feinplan Abschnitt 8). Das Schema selbst
-- aendert sich dadurch nicht.
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

-- =============================================================================
-- A4 – Ausstattung & Zugaenge, Stufe 2 (Ausgaben je Stueck, Rueckgaben)
-- Schema-Delta gegenueber A3 (Branch-Stand vor Arbeitsschritt S21)
--
-- NUR ZUR UEBERGABE UND PRUEFUNG, wie oben: Der Entrypoint spielt den
-- Unterschied beim Containerstart selbst ein (pg_dump vorher). Werden A1 bis A4
-- zusammen deployt, kommen beide Abschnitte dieser Datei in EINEM Push.
--
-- Erzeugt (Arbeitsschritt S21 des Feinplans A4, 13.10.2026) mit:
--   git show HEAD:prisma/schema.prisma > <scratch>/schema-a3.prisma   (HEAD bc29b1c)
--   npx prisma migrate diff \
--     --from-schema-datamodel <scratch>/schema-a3.prisma \
--     --to-schema-datamodel prisma/schema.prisma --script
-- Gegenprobe von main aus (8c1ef05, A1 bis A4 zusammen):
--   git show main:prisma/schema.prisma > <scratch>/schema-main.prisma
--   npx prisma migrate diff \
--     --from-schema-datamodel <scratch>/schema-main.prisma \
--     --to-schema-datamodel prisma/schema.prisma --script
--   Befund: rein additiv – 7 x ALTER TABLE … ADD COLUMN (19 Spalten),
--   7 x CREATE TABLE, 21 x CREATE [UNIQUE] INDEX, 20 x ADD CONSTRAINT (nur
--   Fremdschluessel), 1 x ALTER TYPE … ADD VALUE; kein DROP, kein RENAME, kein
--   ALTER COLUMN.
-- Prisma 6.9.0.
--
-- Befund A4 (Delta unten): rein additiv.
--   1 x ALTER TYPE "DocumentType" ADD VALUE 'UEBERGABEPROTOKOLL'.
--   6 x ALTER TABLE … ADD COLUMN (10 Spalten, alle nullbar, ohne Standardwert):
--       onboarding_processes, supervisor_data, checklist_items,
--       offboarding_processes, offboarding_checklist_items, return_items.
--   1 x CREATE TABLE ("ausgaben").
--   12 x CREATE [UNIQUE] INDEX, 9 x ADD CONSTRAINT (nur Fremdschluessel, darunter
--       offboarding_processes_onboardingId_fkey auf die BESTEHENDE Spalte
--       "onboardingId" und offboarding_processes_arbeitsortId_fkey).
--   Kein DROP, kein RENAME, kein ALTER COLUMN. Die Benennung der bestehenden
--   Relation OffboardingProcess.organization ("OffboardingEinrichtung") aendert
--   nichts in der Datenbank: offboarding_processes_organizationId_fkey kommt im
--   Delta nicht vor.
--   Zusatz gegenueber Feinplan A4, Abschnitt 2: return_items_ausgabeId_idx (der
--   Unique-Index (offboardingId, ausgabeId) hilft bei der Suche je Ausgabe und
--   beim SET NULL nach dem Loeschen einer Ausgabe nicht).
--
-- `prisma db push` warnt bei den beiden neuen Unique-Indizes
-- (offboarding_checklist_items: offboardingId, ausgabeId, herkunft;
-- return_items: offboardingId, ausgabeId) vor moeglichem Datenverlust und
-- verlangt --accept-data-loss (das der Entrypoint ohnehin setzt). Die Spalten
-- sind neu und im Bestand NULL; NULL zaehlt im Unique-Index als verschieden –
-- es kann keine Dublette geben.
--
-- VOR DEM DEPLOY (Feinplan A4, Abschnitt 4, nur lesend): Der neue Fremdschluessel
-- auf offboarding_processes."onboardingId" scheitert an einem Wert, zu dem es
-- keine Einstellung gibt – dann startet der Container nicht (nach der
-- Sicherung). Die zweite Zahl muss 0 sein:
--   SELECT count(*) FROM offboarding_processes WHERE "onboardingId" IS NOT NULL;
--   SELECT count(*) FROM offboarding_processes o WHERE o."onboardingId" IS NOT NULL
--     AND NOT EXISTS (SELECT 1 FROM onboarding_processes n WHERE n.id = o."onboardingId");
-- In hr_portal_ausstattung (Worktree) beide 0; db push dort am 13.10.2026 ohne
-- Fehler. Rundlauf ueber die DATE-Spalte "uebergebenAm" (Feinplan A4,
-- Abschnitt 6, Frage 5): Prisma liest Mitternacht UTC zurueck
-- (2027-01-28T00:00:00.000Z), ein Wert mit Uhrzeit wird auf den UTC-Tag
-- gekappt – Werte deshalb immer ueber kalendertagAlsDatum schreiben.
-- =============================================================================

-- AlterEnum
ALTER TYPE "DocumentType" ADD VALUE 'UEBERGABEPROTOKOLL';

-- AlterTable
ALTER TABLE "onboarding_processes" ADD COLUMN     "ausgabenGeloeschtAm" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "supervisor_data" ADD COLUMN     "ausgabenAngeboten" BOOLEAN;

-- AlterTable
ALTER TABLE "checklist_items" ADD COLUMN     "ausgabenGeloeschtAm" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "offboarding_processes" ADD COLUMN     "arbeitsortId" TEXT,
ADD COLUMN     "ausgabenGeloeschtAm" TIMESTAMP(3),
ADD COLUMN     "weitereBeschaeftigung" BOOLEAN;

-- AlterTable
ALTER TABLE "offboarding_checklist_items" ADD COLUMN     "ausgabeId" TEXT,
ADD COLUMN     "herkunft" TEXT;

-- AlterTable
ALTER TABLE "return_items" ADD COLUMN     "ausgabeId" TEXT,
ADD COLUMN     "zustand" TEXT;

-- CreateTable
CREATE TABLE "ausgaben" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT,
    "onboardingId" TEXT,
    "checklistItemId" TEXT,
    "organizationId" TEXT NOT NULL,
    "zentral" BOOLEAN NOT NULL DEFAULT false,
    "departmentKey" TEXT NOT NULL,
    "bezeichnung" TEXT NOT NULL,
    "kennungLabel" TEXT,
    "kennung" TEXT,
    "rueckgabeKategorie" TEXT,
    "beiAustritt" TEXT NOT NULL,
    "quelle" TEXT NOT NULL,
    "erfasstVonId" TEXT,
    "uebergebenAm" DATE NOT NULL,
    "zustand" TEXT NOT NULL DEFAULT 'AUSGEGEBEN',
    "zustandAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ersetztDurchId" TEXT,
    "loeschenAb" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ausgaben_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ausgaben_ersetztDurchId_key" ON "ausgaben"("ersetztDurchId");

-- CreateIndex
CREATE INDEX "ausgaben_onboardingId_idx" ON "ausgaben"("onboardingId");

-- CreateIndex
CREATE INDEX "ausgaben_employeeId_idx" ON "ausgaben"("employeeId");

-- CreateIndex
CREATE INDEX "ausgaben_checklistItemId_idx" ON "ausgaben"("checklistItemId");

-- CreateIndex
CREATE INDEX "ausgaben_organizationId_idx" ON "ausgaben"("organizationId");

-- CreateIndex
CREATE INDEX "ausgaben_loeschenAb_idx" ON "ausgaben"("loeschenAb");

-- CreateIndex
CREATE INDEX "offboarding_processes_onboardingId_idx" ON "offboarding_processes"("onboardingId");

-- CreateIndex
CREATE INDEX "offboarding_processes_arbeitsortId_idx" ON "offboarding_processes"("arbeitsortId");

-- CreateIndex
CREATE INDEX "offboarding_checklist_items_ausgabeId_idx" ON "offboarding_checklist_items"("ausgabeId");

-- CreateIndex
CREATE UNIQUE INDEX "offboarding_checklist_items_offboardingId_ausgabeId_herkunf_key" ON "offboarding_checklist_items"("offboardingId", "ausgabeId", "herkunft");

-- CreateIndex
CREATE INDEX "return_items_ausgabeId_idx" ON "return_items"("ausgabeId");

-- CreateIndex
CREATE UNIQUE INDEX "return_items_offboardingId_ausgabeId_key" ON "return_items"("offboardingId", "ausgabeId");

-- AddForeignKey
ALTER TABLE "ausgaben" ADD CONSTRAINT "ausgaben_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ausgaben" ADD CONSTRAINT "ausgaben_onboardingId_fkey" FOREIGN KEY ("onboardingId") REFERENCES "onboarding_processes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ausgaben" ADD CONSTRAINT "ausgaben_checklistItemId_fkey" FOREIGN KEY ("checklistItemId") REFERENCES "checklist_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ausgaben" ADD CONSTRAINT "ausgaben_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ausgaben" ADD CONSTRAINT "ausgaben_ersetztDurchId_fkey" FOREIGN KEY ("ersetztDurchId") REFERENCES "ausgaben"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offboarding_processes" ADD CONSTRAINT "offboarding_processes_arbeitsortId_fkey" FOREIGN KEY ("arbeitsortId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offboarding_processes" ADD CONSTRAINT "offboarding_processes_onboardingId_fkey" FOREIGN KEY ("onboardingId") REFERENCES "onboarding_processes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offboarding_checklist_items" ADD CONSTRAINT "offboarding_checklist_items_ausgabeId_fkey" FOREIGN KEY ("ausgabeId") REFERENCES "ausgaben"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_items" ADD CONSTRAINT "return_items_ausgabeId_fkey" FOREIGN KEY ("ausgabeId") REFERENCES "ausgaben"("id") ON DELETE SET NULL ON UPDATE CASCADE;

