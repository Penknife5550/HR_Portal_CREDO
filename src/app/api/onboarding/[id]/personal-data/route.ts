/**
 * API: Personaldaten eines Onboarding-Vorgangs durch HR nachtraeglich bearbeiten.
 *
 * PATCH /api/onboarding/:id/personal-data
 *   - Auth: HR_EDIT_ROLES (SUPER_ADMIN, HR_LEITUNG, HR_SACHBEARBEITER)
 *   - Multi-Tenant: canAccessProcess (Org-Scope), 404 statt 403 (kein Existenz-Leak)
 *   - Verschluesselt sensible Felder (IBAN, SV-Nr, Steuer-ID) erneut
 *   - Schreibt einen Audit-Log-Eintrag mit Vorher/Nachher (sensible Werte maskiert)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canAccessProcess } from "@/lib/permissions";
import { HR_EDIT_ROLES } from "@/lib/permissions";
import { encrypt, isEncryptionConfigured } from "@/lib/encryption";
import { z } from "zod";

// Editierbare Felder (Whitelist) — gleiche Menge wie der oeffentliche Fragebogen.
const personalDataSchema = z
  .object({
    salutation: z.enum(["Herr", "Frau"]).nullable().optional(),
    title: z.string().max(100).nullable().optional(),
    firstName: z.string().min(1).max(100).optional(),
    lastName: z.string().min(1).max(100).optional(),
    birthName: z.string().max(100).nullable().optional(),
    birthDate: z.string().nullable().optional(),
    birthPlace: z.string().max(200).nullable().optional(),
    birthCountry: z.string().max(100).nullable().optional(),
    nationality: z.string().max(100).nullable().optional(),
    maritalStatus: z
      .enum([
        "ledig",
        "verheiratet",
        "geschieden",
        "verwitwet",
        "getrennt_lebend",
        "eingetragene_partnerschaft",
      ])
      .nullable()
      .optional(),
    severelyDisabled: z.boolean().optional(),
    disabilityDegree: z.number().min(0).max(100).nullable().optional(),
    street: z.string().max(200).nullable().optional(),
    houseNumber: z.string().max(20).nullable().optional(),
    zipCode: z.string().max(10).nullable().optional(),
    city: z.string().max(200).nullable().optional(),
    country: z.string().max(100).nullable().optional(),
    phone: z.string().max(50).nullable().optional(),
    mobile: z.string().max(50).nullable().optional(),
    emailPrivate: z.string().max(200).nullable().optional(),
    iban: z.string().max(34).nullable().optional(),
    bic: z.string().max(11).nullable().optional(),
    bankName: z.string().max(200).nullable().optional(),
    accountHolder: z.string().max(200).nullable().optional(),
    socialSecurityNumber: z.string().max(20).nullable().optional(),
    healthInsuranceName: z.string().max(200).nullable().optional(),
    healthInsuranceType: z.enum(["gesetzlich", "privat"]).nullable().optional(),
    taxId: z.string().max(20).nullable().optional(),
    taxClass: z.enum(["I", "II", "III", "IV", "V", "VI"]).nullable().optional(),
    taxAllowance: z.number().min(0).nullable().optional(),
    childAllowance: z.number().min(0).nullable().optional(),
    religion: z
      .enum(["ev", "rk", "ak", "lt", "rf", "fr", "fg", "keine", "sonstige"])
      .nullable()
      .optional(),
    highestSchoolDegree: z
      .enum([
        "ohne_schulabschluss",
        "hauptschulabschluss",
        "mittlere_reife",
        "abitur_fachabitur",
        "sonstiges",
      ])
      .nullable()
      .optional(),
    highestProfessionalDegree: z
      .enum([
        "ohne_berufsausbildung",
        "anerkannte_berufsausbildung",
        "meister_techniker_fachschule",
        "bachelor",
        "diplom_magister_master_staatsexamen",
        "promotion",
      ])
      .nullable()
      .optional(),
  })
  .strip();

// Felder, die verschluesselt gespeichert werden (DSGVO Art. 32)
const ENCRYPTED_FIELDS = new Set(["iban", "socialSecurityNumber", "taxId"]);
// Felder, deren Werte NICHT im Klartext ins Audit-Log gehoeren
const SENSITIVE_FIELDS = ENCRYPTED_FIELDS;

type JsonSafe = string | number | boolean | null;

function maskValue(field: string, value: unknown): JsonSafe {
  if (value === null || value === undefined || value === "") return null;
  if (SENSITIVE_FIELDS.has(field)) return "***";
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  return String(value);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }
    if (!HR_EDIT_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    }

    const { id } = await params;

    const onboarding = await prisma.onboardingProcess.findUnique({
      where: { id },
      select: { id: true, organizationId: true },
    });
    // 404 statt 403 verhindert Existenz-Leak ueber Mandanten-Grenzen
    if (!onboarding || !(await canAccessProcess(session, onboarding.organizationId))) {
      return NextResponse.json({ error: "Vorgang nicht gefunden" }, { status: 404 });
    }

    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Ungueltiger Request-Body" }, { status: 400 });
    }

    const parsed = personalDataSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validierungsfehler", details: parsed.error.issues },
        { status: 400 },
      );
    }
    const data = parsed.data;

    const existing = await prisma.personalData.findUnique({
      where: { onboardingId: id },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "Zu diesem Vorgang liegen noch keine Personaldaten vor." },
        { status: 404 },
      );
    }

    // Update-Daten aufbereiten + Audit-Diff sammeln
    const updateData: Record<string, unknown> = {};
    const changes: Record<string, { from: JsonSafe; to: JsonSafe }> = {};

    for (const [key, rawValue] of Object.entries(data)) {
      if (rawValue === undefined) continue;

      let newValue: unknown = rawValue;
      if (key === "birthDate") {
        newValue = rawValue ? new Date(rawValue as string) : null;
      }

      // Vergleichswert (entschluesselte/rohe Sicht) fuer das Audit-Log.
      // Bei verschluesselten Feldern vergleichen wir nur "gesetzt/leer",
      // ohne Klartext zu protokollieren.
      const oldRaw = (existing as Record<string, unknown>)[key];
      const oldComparable =
        oldRaw instanceof Date ? oldRaw.toISOString().split("T")[0] : oldRaw;
      const newComparable =
        newValue instanceof Date ? newValue.toISOString().split("T")[0] : newValue;

      const changedEncrypted =
        ENCRYPTED_FIELDS.has(key) &&
        Boolean(oldRaw) !== Boolean(newValue ? String(newValue) : "");
      const changedPlain =
        !ENCRYPTED_FIELDS.has(key) && oldComparable !== newComparable;

      if (changedEncrypted || changedPlain) {
        changes[key] = {
          from: maskValue(key, oldComparable),
          to: maskValue(key, newComparable),
        };
      }

      // Verschluesselung sensibler Felder
      if (
        ENCRYPTED_FIELDS.has(key) &&
        isEncryptionConfigured() &&
        typeof newValue === "string" &&
        newValue
      ) {
        newValue = encrypt(newValue);
      }
      updateData[key] = newValue;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ success: true, changed: [] });
    }

    await prisma.personalData.update({
      where: { onboardingId: id },
      data: updateData,
    });

    // Namen im Vorgang spiegeln (fuer Listen/Anzeige)
    if (typeof data.firstName === "string" || typeof data.lastName === "string") {
      await prisma.onboardingProcess.update({
        where: { id },
        data: {
          ...(data.firstName ? { firstName: data.firstName } : {}),
          ...(data.lastName ? { lastName: data.lastName } : {}),
        },
      });
    }

    const ipAddress =
      request.headers.get("x-forwarded-for") ||
      request.headers.get("x-real-ip") ||
      null;

    await prisma.auditLog
      .create({
        data: {
          onboardingId: id,
          userId: session.userId,
          action: "PERSONAL_DATA_UPDATED",
          details: {
            changedFields: Object.keys(changes),
            changes,
            editedBy: session.email,
          },
          ipAddress,
        },
      })
      .catch((err) => {
        console.error("[personal-data PATCH] Audit-Log fehlgeschlagen:", err);
      });

    return NextResponse.json({ success: true, changed: Object.keys(changes) });
  } catch (error) {
    console.error("[API] personal-data PATCH fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
