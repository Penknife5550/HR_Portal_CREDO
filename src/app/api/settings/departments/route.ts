/**
 * API: /api/settings/departments  (Einstellungen → Abteilungen)
 *
 * GET  - Alle Abteilungen, dazu die Verwendung je Schluessel in den
 *        Checklisten-Vorlagen und die Vorlagen, deren Link-Abteilung keine
 *        aktive Adresse hat
 * POST - Neue Abteilung anlegen (zentral oder fuer eine Einrichtung)
 *
 * Berechtigung: SUPER_ADMIN, HR_LEITUNG (adminHandler)
 *
 * Hier stehen die Adressen, an die Abteilungsaufgaben per Link gehen
 * (src/lib/abteilungsaufgaben.ts, `empfaengerAufloesen`: der Eintrag der
 * Einrichtung vor dem zentralen). Aenderungen wirken auf kuenftige Mails und
 * Erinnerungen; schon verschickte Links behalten ihre Adresse.
 *
 * Paket 1b (M8) — vorher scheiterte hier jedes Anlegen:
 *   - Seite und Server benutzten verschiedene Feldnamen (name/key gegen
 *     departmentName/departmentKey) → immer 400.
 *   - Zentral (organizationId null) lief ueber `findUnique` auf den
 *     zusammengesetzten Schluessel — Prisma verlangt dort einen String → 500.
 *     Der Unique-Index haelt doppelte ZENTRALE Eintraege ohnehin nicht auf
 *     (PostgreSQL zaehlt NULL-Werte als verschieden), deshalb `findFirst`.
 *   - Kein zod, kein Protokoll, `organization` als ganzes Objekt.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { adminHandler } from "@/lib/api-handler";
import {
  ABTEILUNGS_AUDIT,
  abteilungKonfigDto,
  fehlendeAdressen,
  verwendungZaehlen,
  type VorlagenPunkt,
} from "@/lib/abteilungsaufgaben";
import {
  abteilungConfigSchema,
  type AbteilungConfigInput,
} from "@/lib/validations/abteilungsaufgaben";

const LOG_LABEL = "Einstellungen/Abteilungen";

/**
 * Nur Kennung und Name der Einrichtung — frueher ging das ganze
 * Organization-Objekt hinaus (Betriebsnummer, Abrechnungstermin …).
 * Zwilling in [id]/route.ts: Eine Route-Datei darf ausser den HTTP-Methoden
 * nichts exportieren. Die Antwortform selbst (Datensatz + Anzeigename +
 * Kennzeichen Altbestand) baut `abteilungKonfigDto` fuer beide Dateien.
 */
const MIT_EINRICHTUNG = { organization: { select: { id: true, name: true } } } as const;

/** P2002 = verletzte Eindeutigkeit (nur per Code, wie in api/onboarding/route.ts). */
function istDuplikat(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2002";
}

function meldungDuplikat(departmentKey: string, zentral: boolean): string {
  return zentral
    ? `Eine zentrale Abteilung „${departmentKey}“ gibt es schon.`
    : `Für diese Einrichtung gibt es die Abteilung „${departmentKey}“ schon.`;
}

// =============================================
// GET /api/settings/departments
// =============================================
export const GET = adminHandler(async () => {
  const [abteilungen, vorlagenPunkte] = await Promise.all([
    prisma.departmentConfig.findMany({
      include: MIT_EINRICHTUNG,
      orderBy: [
        { departmentKey: "asc" },
        { organizationId: { sort: "asc", nulls: "first" } },
      ],
    }),
    prisma.checklistTemplateItem.findMany({
      where: { template: { isActive: true } },
      select: { templateId: true, defaultAssignee: true, template: { select: { name: true } } },
    }),
  ]);

  // Freitext der Onboarding-Vorlagen ("Verwaltung", "Vorgesetzter" — bis
  // Paket 5) ist keiner Abteilung zuzuordnen; verwendungZaehlen und
  // fehlendeAdressen uebergehen ihn selbst (nur gueltige Schluessel zaehlen).
  const punkte: VorlagenPunkt[] = vorlagenPunkte.map((p) => ({
    templateId: p.templateId,
    templateName: p.template.name,
    defaultAssignee: p.defaultAssignee,
  }));

  return NextResponse.json({
    data: abteilungen.map(abteilungKonfigDto),
    verwendung: verwendungZaehlen(punkte),
    fehlendeAdressen: fehlendeAdressen(punkte, abteilungen),
  });
}, { logLabel: LOG_LABEL });

// =============================================
// POST /api/settings/departments - Abteilung anlegen
// =============================================
export const POST = adminHandler<AbteilungConfigInput>(async ({ body, session }) => {
  const { departmentKey, departmentName, email } = body;
  const organizationId = body.organizationId ?? null;

  if (organizationId) {
    const einrichtung = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true },
    });
    if (!einrichtung) {
      return NextResponse.json({ error: "Einrichtung nicht gefunden." }, { status: 400 });
    }
  }

  // findFirst statt findUnique: traegt auch organizationId null (zentral).
  const vorhanden = await prisma.departmentConfig.findFirst({
    where: { departmentKey, organizationId },
    select: { id: true },
  });
  if (vorhanden) {
    return NextResponse.json({ error: meldungDuplikat(departmentKey, !organizationId) }, { status: 409 });
  }

  try {
    // Datensatz und Protokoll in EINER Transaktion: entweder beides oder nichts.
    const angelegt = await prisma.$transaction(async (tx) => {
      const neu = await tx.departmentConfig.create({
        data: { departmentKey, departmentName, email, organizationId },
        include: MIT_EINRICHTUNG,
      });
      await tx.auditLog.create({
        data: {
          userId: session?.userId ?? null,
          processType: "SYSTEM",
          action: ABTEILUNGS_AUDIT.KONFIG_ANGELEGT,
          details: { departmentConfigId: neu.id, departmentKey, departmentName, email, organizationId },
        },
      });
      return neu;
    });
    return NextResponse.json({ data: abteilungKonfigDto(angelegt) }, { status: 201 });
  } catch (error) {
    // Zwei gleichzeitige Anlagen fuer dieselbe Einrichtung: die zweite scheitert
    // am Unique-Index — dieselbe Antwort wie oben statt 500.
    if (istDuplikat(error)) {
      return NextResponse.json({ error: meldungDuplikat(departmentKey, !organizationId) }, { status: 409 });
    }
    throw error;
  }
}, { bodySchema: abteilungConfigSchema, logLabel: LOG_LABEL });
