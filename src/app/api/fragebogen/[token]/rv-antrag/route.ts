/**
 * API: Der vorausgefuellte Antrag zur Rentenversicherung — fuer den Beschaeftigten.
 *
 * GET /api/fragebogen/:token/rv-antrag?art=BEFREIUNG|AUFHEBUNG
 *
 * Schritt 11 verspricht: „Wir fuellen den Antrag fuer Sie aus. Sie drucken ihn,
 * unterschreiben und laden ihn im letzten Schritt wieder hoch." Diese Route
 * loest das ein — noch waehrend der Fragebogen laeuft, denn ohne den
 * unterschriebenen Antrag laesst er sich nicht absenden.
 *
 * Bewusst **ohne** den Weg ueber die Brief-Vorlagen: Der laeuft fuer die
 * PDF-Ausgabe ueber Gotenberg. Ein Ausfall dieses Dienstes wuerde hier den
 * gesamten Fragebogen blockieren, nicht nur ein Komfort-Feature. Das Blatt wird
 * deshalb im Code aufgebaut (`pdf-rv-antrag.ts`).
 *
 * Ebenfalls bewusst: **kein Deckblatt.** Was der Beschaeftigte herunterlaedt,
 * ist genau eine Seite, sofort druckbar. Mit vorgeschaltetem DMS-Deckblatt
 * unterschriebe er sonst das falsche Blatt.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { validateMagicToken } from "@/lib/auth";
import { decrypt } from "@/lib/encryption";
import { tokenRateLimiter, getClientIp } from "@/lib/rate-limit";
import { pruefeAntragMoeglich } from "@/lib/minijob-antrag";
import { generateRvAntragPdf } from "@/lib/pdf-rv-antrag";
import { type AntragsArt, dateiname } from "@/lib/rv-antrag-wortlaut";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const ip = getClientIp(request);

  if (!tokenRateLimiter.check(ip)) {
    return NextResponse.json(
      { error: "Zu viele Anfragen. Bitte versuchen Sie es später erneut." },
      { status: 429 }
    );
  }

  // allowSubmitted: Nach dem Absenden darf das Blatt noch einmal geholt werden —
  // etwa wenn der Ausdruck verloren geht.
  const result = await validateMagicToken(token, { allowSubmitted: true });
  if (!result.valid || !result.onboarding) {
    return NextResponse.json(
      { error: result.reason || "Ungültiger Zugang" },
      { status: 403 }
    );
  }

  const onboarding = result.onboarding;
  const pd = onboarding.personalData;

  // Die Antragsart kommt aus der URL, wird aber gegen die gespeicherte
  // Entscheidung geprueft — sonst liesse sich ueber den Parameter ein Formular
  // erzeugen, das zur Akte nicht passt.
  const artParam = request.nextUrl.searchParams.get("art");
  const gewuenscht: AntragsArt | undefined =
    artParam === "BEFREIUNG" || artParam === "AUFHEBUNG" ? artParam : undefined;

  const pruefung = pruefeAntragMoeglich(
    {
      rvEntscheidung: pd?.rvEntscheidung ?? null,
      mandantName: onboarding.organization?.name,
      betriebsnummer: onboarding.organization?.betriebsnummer,
    },
    gewuenscht
  );

  if (!pruefung.erlaubt) {
    // 409: Die Anfrage ist richtig, die Stammdaten sind es nicht.
    return NextResponse.json({ error: pruefung.grund }, { status: 409 });
  }

  // Die Rentenversicherungsnummer liegt AES-256-GCM-verschluesselt. Sie wird
  // ausschliesslich hier und nur fuer diesen einen Druck entschluesselt.
  let rvNummer = "";
  if (pd?.socialSecurityNumber) {
    try {
      rvNummer = decrypt(pd.socialSecurityNumber);
    } catch {
      // Ein nicht entschluesselbarer Wert darf den Ausdruck nicht verhindern —
      // die Kaestchen bleiben dann leer und werden von Hand ausgefuellt.
      rvNummer = "";
    }
  }

  const nachname = pd?.lastName || onboarding.lastName || "";
  const vorname = pd?.firstName || onboarding.firstName || "";

  let pdf: Buffer;
  try {
    pdf = await generateRvAntragPdf(pruefung.art, {
      nachname,
      vorname,
      rentenversicherungsnummer: rvNummer,
      arbeitgeberName: onboarding.organization?.name ?? "",
      betriebsnummer: onboarding.organization?.betriebsnummer ?? "",
    });
  } catch (error) {
    console.error("RV-Antrag konnte nicht erzeugt werden:", error);
    return NextResponse.json(
      {
        error:
          "Der Antrag konnte nicht erstellt werden. Bitte wenden Sie sich an " +
          "die Personalabteilung.",
      },
      { status: 500 }
    );
  }

  // Der Zugriff auf die Versicherungsnummer wird protokolliert — dieselbe Regel
  // wie beim Vorlagen-Resolver fuer IBAN und Steuer-ID.
  await prisma.auditLog
    .create({
      data: {
        processType: "ONBOARDING",
        onboardingId: onboarding.id,
        action: "RV_ANTRAG_GENERATED",
        details: {
          art: pruefung.art,
          quelle: "FRAGEBOGEN",
          sensitiveFields: rvNummer ? ["socialSecurityNumber"] : [],
        },
        ipAddress: ip,
      },
    })
    .catch(() => {
      // Ein fehlendes Protokoll darf den Ausdruck nicht verhindern.
    });

  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${dateiname(pruefung.art, nachname)}"`,
      // Das Blatt traegt die Versicherungsnummer im Klartext — es gehoert in
      // keinen Zwischenspeicher.
      "Cache-Control": "no-store, must-revalidate",
    },
  });
}
