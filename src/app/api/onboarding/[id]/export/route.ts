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
import {
  aufteilungText,
  kostenstellenAnzeige,
  type KostenstellenZeile,
} from "@/lib/kostenstellen-anzeige";

/**
 * Zeilenumbrueche zu Leerzeichen — fuer jede Zelle, die aus einem
 * mehrzeiligen Eingabefeld stammt.
 *
 * `csvZelle` (src/lib/csv.ts) quotet einen Umbruch zwar regelkonform, schreibt
 * ihn aber mit. Ein Import, der die Datei zeilenweise liest, saehe ab dem
 * ersten Umbruch einen abgeschnittenen Datensatz und danach einen
 * Geisterdatensatz.
 *
 * Betroffen sind ALLE Zellen aus einem mehrzeiligen Eingabefeld, nicht nur die
 * zuletzt hinzugekommene: Neben der Kostenstellen-Bemerkung ist das die
 * Zweckbefristung („Wodurch endet der Vertrag?", ein `<textarea>` in
 * src/app/modalitaeten/[token]/page.tsx). Wer hier eine Spalte ergaenzt, deren
 * Wert aus einem `<textarea>` stammt, muss sie ebenfalls hier hindurchschicken.
 *
 * Der vollstaendige, mehrzeilige Text bleibt in der Vorgangsansicht und im
 * Personalakte-PDF stehen — dort gehoert er hin.
 */
function einzeilig(text: string): string {
  // Der Wagenruecklauf steht bewusst mit in der Zeichenklasse: Wer aus Word
  // oder Outlook einfuegt, bringt CRLF mit, und ein allein stehendes \r trennt
  // fuer manche Leser ebenso.
  return text.replace(/\s*[\r\n]+\s*/g, " ");
}

/**
 * Was in die Positionsspalte "Kostenstelle" darf.
 *
 * Diese Spalte ist EINE Zelle, LOGA liest sie nach Position. Eine Aufteilung
 * ueber mehrere Kostenstellen passt da nicht hinein: Stuende dort die erste
 * Bezeichnung, buchte LOGA bei 5000 = 60 % und 6000 = 40 % einfach 100 Prozent
 * auf 5000 — die 40 Prozent verschwaenden lautlos, und die Zelle saehe dabei
 * vollstaendig aus. Deshalb bleibt sie bei mehr als einer Zeile bewusst LEER:
 * Ein fehlender Wert laesst den Import scheitern und wird bemerkt, eine
 * falsche Vollbuchung nicht. Die vollstaendige Aufteilung steht in der
 * angehaengten Spalte "Kostenstellen-Aufteilung".
 *
 * Bei genau EINER Zeile — auch dem Rueckfall auf den Bestandswert — stimmt die
 * einzelne Zelle, dort bleibt die Bezeichnung stehen.
 */
function positionsspalteKostenstelle(zeilen: readonly KostenstellenZeile[]): string {
  return zeilen.length === 1 ? zeilen[0].bezeichnung : "";
}

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
        // Die Aufteilung MUSS mitkommen: Ohne dieses `include` liest der
        // Export nur die eingefrorene Alt-Spalte `kostenstelle` — bei einem
        // neuen Vorgang ist die leer, bei einem migrierten steht dort der alte
        // Wert. Beides geht ungeprueft in den LOGA-Import. Siehe
        // src/lib/kostenstellen-anzeige.ts.
        supervisorData: {
          include: { kostenstellen: { orderBy: { orderIndex: "asc" } } },
        },
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
      const kostenstellen = kostenstellenAnzeige(sd);

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
        // Bleibt an dieser Stelle stehen und behaelt ihren Namen: LOGA
        // erwartet die Spaltenposition. Gefuellt nur bei genau EINER
        // Kostenstelle — Begruendung bei `positionsspalteKostenstelle`.
        "Kostenstelle",
        // Neue Spalten bewusst am Ende: so verschiebt sich keine bestehende
        // Spaltenposition fuer den LOGA-Import.
        "Art der Befristung",
        "Zweckbefristung: Ende bei",
        "Vorauss. Ende",
        "Kostenstellen-Aufteilung",
        "Kostenstellen-Bemerkung",
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
        positionsspalteKostenstelle(kostenstellen.zeilen),
        // Reihenfolge muss zu den fuenf angehaengten Kopfzeilen passen
        sd?.befristet ? getBefristungsartLabel(sd.befristungsart) || "" : "",
        einzeilig(sd?.befristungZweck || ""),
        sd?.vertragsendeVoraussichtlich
          ? new Date(sd.vertragsendeVoraussichtlich).toLocaleDateString("de-DE")
          : "",
        aufteilungText(kostenstellen.zeilen),
        einzeilig(kostenstellen.bemerkung || ""),
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
      // Traegt dank des `include` oben die Zeilen der Kostenstellen-Aufteilung
      // mit. Die Alt-Spalten bleiben daneben stehen, damit ein bestehender
      // Abnehmer dieses JSON nichts verliert.
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
