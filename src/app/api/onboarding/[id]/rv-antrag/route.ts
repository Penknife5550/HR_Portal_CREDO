/**
 * API: /api/onboarding/:id/rv-antrag — der Antrag zur Rentenversicherung fuer HR.
 *
 * GET ?art=BEFREIUNG|AUFHEBUNG
 *
 * Dasselbe Blatt, das der Beschaeftigte im Fragebogen herunterlaedt, nur aus der
 * Vorgangsakte heraus. Zwei Gruende, warum HR es auch braucht:
 *
 * - Beim **Aufhebungsantrag** wird kein Upload verlangt (§ 6 Abs. 6 SGB VI
 *   laesst die elektronische Erklaerung zu). Das Papier fuer die
 *   Entgeltunterlagen muss trotzdem entstehen — nach § 8 Abs. 2 Nr. 4a BVV.
 * - Geht der Ausdruck des Beschaeftigten verloren, braucht HR einen Ersatz,
 *   ohne den Magic Link erneut zu versenden.
 *
 * Die Vorbedingungen prueft dieselbe Funktion wie im Fragebogen — sonst haetten
 * die beiden Kanaele unterschiedliche Meldungen fuer dieselbe Lage.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { HR_EDIT_ROLES, canAccessProcess } from "@/lib/permissions";
import { decrypt } from "@/lib/encryption";
import { createRateLimiter } from "@/lib/rate-limit";
import { pruefeAntragMoeglich } from "@/lib/minijob-antrag";
import { generateRvAntragPdf } from "@/lib/pdf-rv-antrag";
import { type AntragsArt, dateiname } from "@/lib/rv-antrag-wortlaut";

const antragLimiter = createRateLimiter("rv-antrag", {
  maxRequests: 20,
  windowMs: 60_000,
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }

    // Die gemeinsame Konstante statt einer eigenen Liste: Eine handgeschriebene
    // Kopie waere die Stelle, an der spaeter eine mandantenbeschraenkte Rolle
    // ergaenzt wird, ohne dass jemand an die Mandantenpruefung denkt.
    if (!HR_EDIT_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    }

    const rl = antragLimiter.check(session.userId);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Zu viele Anfragen. Bitte warten." },
        { status: 429 }
      );
    }

    const { id } = await params;
    const artParam = request.nextUrl.searchParams.get("art");
    const gewuenscht: AntragsArt | undefined =
      artParam === "BEFREIUNG" || artParam === "AUFHEBUNG" ? artParam : undefined;

    const vorgang = await prisma.onboardingProcess.findUnique({
      where: { id },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        organization: { select: { id: true, name: true, betriebsnummer: true } },
        personalData: {
          select: {
            firstName: true,
            lastName: true,
            socialSecurityNumber: true,
            rvEntscheidung: true,
          },
        },
      },
    });

    if (!vorgang) {
      return NextResponse.json({ error: "Vorgang nicht gefunden" }, { status: 404 });
    }
    // Zweite Schranke neben der Rollenliste: Der Antrag traegt die
    // Sozialversicherungsnummer im Klartext (unten entschluesselt). Ein Vorgang
    // ohne Mandanten waere ein Datenfehler — dann lieber sperren.
    if (
      !vorgang.organization ||
      !(await canAccessProcess(session, vorgang.organization.id))
    ) {
      return NextResponse.json(
        { error: "Keine Berechtigung für diesen Vorgang" },
        { status: 403 }
      );
    }

    const pruefung = pruefeAntragMoeglich(
      {
        rvEntscheidung: vorgang.personalData?.rvEntscheidung ?? null,
        mandantName: vorgang.organization?.name,
        betriebsnummer: vorgang.organization?.betriebsnummer,
      },
      gewuenscht
    );

    if (!pruefung.erlaubt) {
      return NextResponse.json({ error: pruefung.grund }, { status: 409 });
    }

    let rvNummer = "";
    if (vorgang.personalData?.socialSecurityNumber) {
      try {
        rvNummer = decrypt(vorgang.personalData.socialSecurityNumber);
      } catch {
        rvNummer = "";
      }
    }

    const nachname = vorgang.personalData?.lastName || vorgang.lastName || "";
    const vorname = vorgang.personalData?.firstName || vorgang.firstName || "";

    const pdf = await generateRvAntragPdf(pruefung.art, {
      nachname,
      vorname,
      rentenversicherungsnummer: rvNummer,
      arbeitgeberName: vorgang.organization?.name ?? "",
      betriebsnummer: vorgang.organization?.betriebsnummer ?? "",
    });

    await prisma.auditLog
      .create({
        data: {
          userId: session.userId,
          processType: "ONBOARDING",
          onboardingId: vorgang.id,
          action: "RV_ANTRAG_GENERATED",
          details: {
            art: pruefung.art,
            quelle: "HR",
            sensitiveFields: rvNummer ? ["socialSecurityNumber"] : [],
          },
        },
      })
      .catch(() => {
        // Protokollfehler duerfen die Ausgabe nicht verhindern.
      });

    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${dateiname(pruefung.art, nachname)}"`,
        "Cache-Control": "no-store, must-revalidate",
      },
    });
  } catch (error) {
    console.error("Fehler beim Erzeugen des RV-Antrags:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
