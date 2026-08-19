/**
 * API: /api/onboarding/:id/pdf-export
 *
 * GET – PDF-Export eines Onboarding-Vorgangs mit Swiss QR Code
 *
 * Query-Parameter:
 *   type: "gesamtakte" | "fragebogen" | "modalitaeten" | "dokumente" | "checkliste"
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { decrypt } from "@/lib/encryption";
import { createRateLimiter } from "@/lib/rate-limit";
import {
  generateOnboardingPDF,
  type OnboardingExportContext,
  type OnboardingExportType,
} from "@/lib/pdf-export-onboarding";

const VALID_TYPES = ["gesamtakte", "fragebogen", "modalitaeten", "dokumente", "checkliste"];
const exportLimiter = createRateLimiter("onboarding-export", { maxRequests: 10, windowMs: 60_000 });

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }

    const allowedRoles = ["SUPER_ADMIN", "HR_LEITUNG", "HR_SACHBEARBEITER"];
    if (!allowedRoles.includes(session.role)) {
      return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    }

    const rl = exportLimiter.check(session.userId);
    if (!rl.allowed) {
      return NextResponse.json({ error: "Zu viele Exports. Bitte warten." }, { status: 429 });
    }

    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") || "gesamtakte";

    if (!VALID_TYPES.includes(type)) {
      return NextResponse.json(
        { error: `Ungueltiger Typ. Erlaubt: ${VALID_TYPES.join(", ")}` },
        { status: 400 }
      );
    }

    const process = await prisma.onboardingProcess.findUnique({
      where: { id },
      include: {
        organization: true,
        personalData: {
          include: { children: true },
        },
        supervisorData: true,
        documents: {
          orderBy: { createdAt: "desc" },
        },
        checklistItems: {
          orderBy: { orderIndex: "asc" },
          include: {
            completedBy: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });

    if (!process) {
      return NextResponse.json({ error: "Vorgang nicht gefunden" }, { status: 404 });
    }

    // Sensible Felder entschluesseln
    const pd = process.personalData;
    let decryptedIban: string | null = null;
    let decryptedSvNr: string | null = null;
    let decryptedTaxId: string | null = null;

    if (pd) {
      try {
        if (pd.iban) decryptedIban = decrypt(pd.iban);
      } catch { decryptedIban = "***verschluesselt***"; }
      try {
        if (pd.socialSecurityNumber) decryptedSvNr = decrypt(pd.socialSecurityNumber);
      } catch { decryptedSvNr = "***verschluesselt***"; }
      try {
        if (pd.taxId) decryptedTaxId = decrypt(pd.taxId);
      } catch { decryptedTaxId = "***verschluesselt***"; }
    }

    const ctx: OnboardingExportContext = {
      firstName: process.firstName,
      lastName: process.lastName,
      email: process.email,
      displayId: process.displayId,
      status: process.status,
      organizationName: process.organization.name,
      mandantNumber: process.organization.mandantNumber,
      questionnaireType: process.questionnaireType,
      invitedAt: process.invitedAt.toISOString(),
      submittedAt: process.submittedAt?.toISOString() || null,
      personalData: pd ? {
        salutation: pd.salutation,
        title: pd.title,
        firstName: pd.firstName,
        lastName: pd.lastName,
        birthName: pd.birthName,
        birthDate: pd.birthDate?.toISOString() || null,
        birthPlace: pd.birthPlace,
        birthCountry: pd.birthCountry,
        nationality: pd.nationality,
        maritalStatus: pd.maritalStatus,
        severelyDisabled: pd.severelyDisabled,
        disabilityDegree: pd.disabilityDegree,
        street: pd.street,
        houseNumber: pd.houseNumber,
        zipCode: pd.zipCode,
        city: pd.city,
        country: pd.country,
        phone: pd.phone,
        mobile: pd.mobile,
        emailPrivate: pd.emailPrivate,
        iban: decryptedIban,
        bic: pd.bic,
        bankName: pd.bankName,
        accountHolder: pd.accountHolder,
        socialSecurityNumber: decryptedSvNr,
        healthInsuranceName: pd.healthInsuranceName,
        healthInsuranceType: pd.healthInsuranceType,
        parentStatus: pd.parentStatus,
        taxId: decryptedTaxId,
        taxClass: pd.taxClass,
        taxAllowance: pd.taxAllowance ? Number(pd.taxAllowance) : null,
        childAllowance: pd.childAllowance ? Number(pd.childAllowance) : null,
        religion: pd.religion,
        highestSchoolDegree: pd.highestSchoolDegree,
        highestProfessionalDegree: pd.highestProfessionalDegree,
        hasOtherEmployment: pd.hasOtherEmployment,
        otherEmployerName: pd.otherEmployerName,
        otherWeeklyHours: pd.otherWeeklyHours ? Number(pd.otherWeeklyHours) : null,
        hasMinijob: pd.hasMinijob,
        minijobRvBefreiung: pd.minijobRvBefreiung,
        bornAfter1971: pd.bornAfter1971,
        masernschutzProvided: pd.masernschutzProvided,
        dsgvoAccepted: pd.dsgvoAccepted,
        dsgvoAcceptedAt: pd.dsgvoAcceptedAt?.toISOString() || null,
        children: pd.children.map((c) => ({
          firstName: c.firstName,
          lastName: c.lastName,
          birthDate: c.birthDate.toISOString(),
          taxAllowance: c.taxAllowance,
        })),
      } : null,
      supervisorData: process.supervisorData ? {
        betriebsstaette: process.supervisorData.betriebsstaette,
        stellenbeschreibung: process.supervisorData.stellenbeschreibung,
        vertragsbeginn: process.supervisorData.vertragsbeginn?.toISOString() || null,
        befristet: process.supervisorData.befristet,
        befristungsart: process.supervisorData.befristungsart,
        vertragsende: process.supervisorData.vertragsende?.toISOString() || null,
        befristungZweck: process.supervisorData.befristungZweck,
        vertragsendeVoraussichtlich:
          process.supervisorData.vertragsendeVoraussichtlich?.toISOString() || null,
        befristungSachgrund: process.supervisorData.befristungSachgrund,
        vollzeit: process.supervisorData.vollzeit,
        wochenstunden: process.supervisorData.wochenstunden ? Number(process.supervisorData.wochenstunden) : null,
        tageProWoche: process.supervisorData.tageProWoche,
        svPflichtig: process.supervisorData.svPflichtig,
        minijob: process.supervisorData.minijob,
        ehrenamt: process.supervisorData.ehrenamt,
        verguetungsmodell: process.supervisorData.verguetungsmodell,
        entgeltgruppe: process.supervisorData.entgeltgruppe,
        stufe: process.supervisorData.stufe,
        festgehalt: process.supervisorData.festgehalt ? Number(process.supervisorData.festgehalt) : null,
        stundenlohn: process.supervisorData.stundenlohn ? Number(process.supervisorData.stundenlohn) : null,
        jahressonderzahlung: process.supervisorData.jahressonderzahlung,
        sonderzahlungProzent: process.supervisorData.sonderzahlungProzent ? Number(process.supervisorData.sonderzahlungProzent) : null,
        urlaubstageProJahr: process.supervisorData.urlaubstageProJahr,
        probezeit: process.supervisorData.probezeit,
        probezeitMonate: process.supervisorData.probezeitMonate,
        zusatzvereinbarungen: process.supervisorData.zusatzvereinbarungen,
      } : null,
      documents: process.documents.map((d) => ({
        type: d.type,
        fileName: d.fileName,
        fileSize: d.fileSize,
        status: d.status,
        uploadedAt: d.createdAt.toISOString(),
      })),
      checklistItems: process.checklistItems.map((c) => ({
        title: c.title,
        category: c.category,
        isCompleted: c.isCompleted,
        completedAt: c.completedAt?.toISOString() || null,
        assignee: c.assignee,
        notes: c.notes,
        dueDate: c.dueDate?.toISOString() || null,
      })),
    };

    const pdfBuffer = await generateOnboardingPDF(ctx, type as OnboardingExportType);

    const dateStr = new Date().toISOString().slice(0, 10);
    const name = process.lastName || process.email.split("@")[0];
    const typeName = type === "gesamtakte" ? "Gesamtakte"
      : type === "fragebogen" ? "Fragebogen"
      : type === "modalitaeten" ? "Modalitaeten"
      : type === "dokumente" ? "Dokumente"
      : "Checkliste";
    const rawFileName = `${process.displayId || "Onboarding"}_${typeName}_${dateStr}.pdf`;
    const fileName = rawFileName.replace(/["\n\r]/g, "").replace(/[^\w\-.]/g, "_");

    await prisma.auditLog.create({
      data: {
        onboardingId: id,
        userId: session.userId,
        processType: "ONBOARDING",
        action: "DOCUMENT_EXPORTED",
        details: { type, fileName },
      },
    });

    return new NextResponse(pdfBuffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Content-Length": pdfBuffer.length.toString(),
      },
    });
  } catch (error) {
    console.error("Fehler beim Onboarding PDF-Export:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
