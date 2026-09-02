/**
 * API: /api/onboarding/:id/export
 *
 * GET – Daten eines Vorgangs als JSON oder CSV exportieren
 *
 * Query-Parameter:
 *   format=json (Standard) oder format=csv
 *
 * Fuer LOGA-Import: CSV mit den relevanten Personalstammdaten
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { csvZeile } from "@/lib/csv";
import { getSession } from "@/lib/auth";
import { decrypt } from "@/lib/encryption";
import { EXPORT_ROLES } from "@/lib/permissions";
import { getBefristungsartLabel } from "@/lib/constants";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Auth + Rollen-Check: Export enthaelt sensible Personaldaten
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "Nicht authentifiziert" },
        { status: 401 }
      );
    }
    if (!EXPORT_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Keine Berechtigung für Export" }, { status: 403 });
    }

    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const format = searchParams.get("format") || "json";

    const onboarding = await prisma.onboardingProcess.findUnique({
      where: { id },
      include: {
        organization: true,
        personalData: { include: { children: true } },
        supervisorData: true,
      },
    });

    if (!onboarding) {
      return NextResponse.json(
        { error: "Vorgang nicht gefunden" },
        { status: 404 }
      );
    }

    if (format === "csv") {
      const pd = onboarding.personalData;
      const sd = onboarding.supervisorData;

      // CSV-Header und -Zeile für LOGA-Import
      const headers = [
        "Mandantennummer",
        "Einrichtung",
        "Anrede",
        "Titel",
        "Vorname",
        "Nachname",
        "Geburtsname",
        "Geburtsdatum",
        "Geburtsort",
        "Geburtsland",
        "Staatsangehörigkeit",
        "Familienstand",
        "Konfession",
        "Strasse",
        "Hausnummer",
        "PLZ",
        "Ort",
        "Land",
        "Telefon",
        "Mobil",
        "E-Mail",
        "IBAN",
        "BIC",
        "Kontoinhaber",
        "SV-Nummer",
        "Krankenkasse",
        "KK-Art",
        "Steuer-ID",
        "Steuerklasse",
        "Kinderfreibetraege",
        "Elterneigenschaft",
        "Schwerbehindert",
        "GdB",
        "Vertragsbeginn",
        "Befristet",
        "Vertragsende",
        "Vollzeit",
        "Wochenstunden",
        "Vergütungsmodell",
        "Entgeltgruppe",
        "Stufe",
        "Hauptarbeitgeber",
        "Nebenarbeitgeber",
        "Kostenstelle",
        // Neue Spalten bewusst am Ende: so verschiebt sich keine bestehende
        // Spaltenposition fuer den LOGA-Import.
        "Art der Befristung",
        "Zweckbefristung: Ende bei",
        "Vorauss. Ende",
      ];

      const values = [
        onboarding.organization.mandantNumber,
        onboarding.organization.name,
        pd?.salutation || "",
        pd?.title || "",
        pd?.firstName || "",
        pd?.lastName || "",
        pd?.birthName || "",
        pd?.birthDate ? new Date(pd.birthDate).toLocaleDateString("de-DE") : "",
        pd?.birthPlace || "",
        pd?.birthCountry || "",
        pd?.nationality || "",
        pd?.maritalStatus || "",
        pd?.religion || "",
        pd?.street || "",
        pd?.houseNumber || "",
        pd?.zipCode || "",
        pd?.city || "",
        pd?.country || "",
        pd?.phone || "",
        pd?.mobile || "",
        onboarding.email,
        pd?.iban ? decrypt(pd.iban) : "",
        pd?.bic || "",
        pd?.accountHolder || "",
        pd?.socialSecurityNumber ? decrypt(pd.socialSecurityNumber) : "",
        pd?.healthInsuranceName || "",
        pd?.healthInsuranceType || "",
        pd?.taxId ? decrypt(pd.taxId) : "",
        pd?.taxClass || "",
        pd?.childAllowance?.toString() || "",
        pd?.parentStatus ? "Ja" : "Nein",
        pd?.severelyDisabled ? "Ja" : "Nein",
        pd?.disabilityDegree?.toString() || "",
        sd?.vertragsbeginn
          ? new Date(sd.vertragsbeginn).toLocaleDateString("de-DE")
          : "",
        sd?.befristet ? "Ja" : "Nein",
        sd?.vertragsende
          ? new Date(sd.vertragsende).toLocaleDateString("de-DE")
          : "",
        sd?.vollzeit ? "Ja" : "Nein",
        sd?.wochenstunden?.toString() || "",
        sd?.verguetungsmodell || "",
        sd?.entgeltgruppe || "",
        sd?.stufe || "",
        sd?.hauptarbeitgeberId || "",
        sd?.nebenarbeitgeberId || "",
        sd?.kostenstelle || "",
        // Reihenfolge muss zu den drei angehaengten Kopfzeilen passen
        sd?.befristet ? getBefristungsartLabel(sd.befristungsart) || "" : "",
        sd?.befristungZweck || "",
        sd?.vertragsendeVoraussichtlich
          ? new Date(sd.vertragsendeVoraussichtlich).toLocaleDateString("de-DE")
          : "",
      ];

      // CSV-String bauen (mit Semikolon als Trennzeichen für deutsche Excel-Versionen)
      const csvContent = [csvZeile(headers), csvZeile(values)].join("\n");

      // Dateiname sanitisieren (nur sichere Zeichen erlauben, Header-Injection verhindern)
      const safeMandant = (onboarding.organization.mandantNumber || "export").replace(/[^a-zA-Z0-9_-]/g, "_");
      const safeLastName = (pd?.lastName || "export").replace(/[^a-zA-Z0-9_\u00C0-\u024F-]/g, "_");
      const safeFilename = `onboarding_${safeMandant}_${safeLastName}.csv`;

      return new NextResponse(csvContent, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${safeFilename}"`,
        },
      });
    }

    // JSON-Export (Standard) – sensible Felder entschluesseln
    const decryptedPersonalData = onboarding.personalData
      ? {
          ...onboarding.personalData,
          iban: onboarding.personalData.iban ? decrypt(onboarding.personalData.iban) : null,
          socialSecurityNumber: onboarding.personalData.socialSecurityNumber ? decrypt(onboarding.personalData.socialSecurityNumber) : null,
          taxId: onboarding.personalData.taxId ? decrypt(onboarding.personalData.taxId) : null,
        }
      : null;

    return NextResponse.json({
      onboarding: {
        id: onboarding.id,
        status: onboarding.status,
        email: onboarding.email,
        organization: onboarding.organization,
        createdAt: onboarding.createdAt,
      },
      personalData: decryptedPersonalData,
      supervisorData: onboarding.supervisorData,
    });
  } catch (error) {
    console.error("Fehler beim Exportieren:", error);
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}
