/**
 * API: /api/elternzeit-antrag/[token]
 *
 * GET  – Public: Token validieren + initiale Daten zurueckliefern
 * POST – Public: Antrag einreichen (5-Schritt-Formular, Single-Use)
 *
 * KEINE Authentifizierung — Magic-Link-basiert.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { publicAntragVorlSchema } from "@/lib/validations/elternzeit";
import {
  pruefeFeriensperrfrist,
  ferienBegruendungPflicht,
} from "@/lib/elternzeit-helpers";
import { triggerWebhooks } from "@/lib/webhooks";
import { syncElternzeitFristen } from "@/lib/elternzeit-fristen";
import { hashToken } from "@/lib/token-hash";

// =============================================
// GET – Token validieren + Daten laden
// =============================================
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    const tokenHash = hashToken(token);

    const ez = await prisma.elternzeitProzess.findUnique({
      where: { antragTokenVorl: tokenHash },
      include: {
        organization: { select: { name: true, mandantNumber: true } },
      },
    });

    if (!ez) {
      return NextResponse.json(
        { error: "Token ungueltig oder abgelaufen" },
        { status: 404 },
      );
    }

    if (
      ez.antragTokenVorlExpiry &&
      new Date() > ez.antragTokenVorlExpiry
    ) {
      return NextResponse.json({ error: "Token ist abgelaufen" }, { status: 403 });
    }

    if (ez.antragTokenVorlUsedAt) {
      return NextResponse.json(
        { error: "Dieser Antrag wurde bereits eingereicht" },
        { status: 410 },
      );
    }

    // Aktive Schulferien fuer Anzeige im Formular
    const ferien = await prisma.schulferienNRW.findMany({
      where: { aktiv: true, bis: { gte: new Date() } },
      orderBy: { von: "asc" },
    });

    return NextResponse.json({
      data: {
        elternzeitId: ez.id,
        displayId: ez.displayId,
        employeeName: `${ez.employeeFirstName} ${ez.employeeLastName}`,
        employeeFirstName: ez.employeeFirstName,
        employeeLastName: ez.employeeLastName,
        employeePersonalNr: ez.employeePersonalNr,
        organizationName: ez.organization.name,
        mandantNumber: ez.organization.mandantNumber,
        personalgruppe: ez.personalgruppe,
        geschlecht: ez.geschlecht,
        kindNummer: ez.kindNummer,
        ferienBegruendungPflicht: ferienBegruendungPflicht(ez.personalgruppe),
        schulferien: ferien.map((f) => ({
          bezeichnung: f.bezeichnung,
          von: f.von.toISOString().slice(0, 10),
          bis: f.bis.toISOString().slice(0, 10),
          ferienTyp: f.ferienTyp,
        })),
      },
    });
  } catch (error) {
    console.error("[API] elternzeit-antrag GET fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}

// =============================================
// POST – Antrag einreichen
// =============================================
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    const tokenHash = hashToken(token);

    const ez = await prisma.elternzeitProzess.findUnique({
      where: { antragTokenVorl: tokenHash },
    });
    if (!ez) {
      return NextResponse.json(
        { error: "Token ungueltig" },
        { status: 404 },
      );
    }
    if (
      ez.antragTokenVorlExpiry &&
      new Date() > ez.antragTokenVorlExpiry
    ) {
      return NextResponse.json({ error: "Token abgelaufen" }, { status: 403 });
    }
    if (ez.antragTokenVorlUsedAt) {
      return NextResponse.json(
        { error: "Antrag wurde bereits eingereicht" },
        { status: 410 },
      );
    }

    const body = await request.json().catch(() => null);
    const parsed = publicAntragVorlSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0].message },
        { status: 400 },
      );
    }
    const data = parsed.data;

    // Feriensperrfrist-Check (Hinweis fuer alle, Pflichtbegruendung nur Beamte/PSI)
    const ferien = await prisma.schulferienNRW.findMany({
      where: { aktiv: true },
    });
    const abschnitteForCheck = data.abschnitte.map((a) => ({
      abschnittNr: a.abschnittNr,
      von: new Date(a.von),
      bis: new Date(a.bis),
    }));
    const warnungen = pruefeFeriensperrfrist(abschnitteForCheck, ferien);

    // Bei Beamten/PSI mit Warnung: Begruendung Pflicht
    if (
      ferienBegruendungPflicht(ez.personalgruppe) &&
      warnungen.length > 0
    ) {
      const fehltBegruendung = data.abschnitte.some((a) => {
        const hatWarnung = warnungen.some((w) => w.abschnittNr === a.abschnittNr);
        return hatWarnung && (!a.ferienBegruendung || a.ferienBegruendung.trim().length < 10);
      });
      if (fehltBegruendung) {
        return NextResponse.json(
          {
            error:
              "Bitte geben Sie eine sachgerechte Begruendung an (§ 11 FrUrlV NRW)",
            warnungen,
          },
          { status: 400 },
        );
      }
    }

    // Daten in Transaktion speichern — atomarer Single-Use-Schutz via updateMany
    const ipAddress =
      request.headers.get("x-forwarded-for") ||
      request.headers.get("x-real-ip") ||
      null;

    const txResult = await prisma.$transaction(async (tx) => {
      // Atomarer Single-Use-Check: nur wenn antragTokenVorlUsedAt noch null ist
      const result = await tx.elternzeitProzess.updateMany({
        where: {
          id: ez.id,
          antragTokenVorl: tokenHash,
          antragTokenVorlUsedAt: null,
          // Defense in depth: Expiry auch im atomaren Update pruefen,
          // damit ein zwischenzeitlich abgelaufener Token nicht durchrutscht.
          antragTokenVorlExpiry: { gt: new Date() },
        },
        data: {
          adresseStrasse: data.adresseStrasse,
          adressePlz: data.adressePlz,
          adresseOrt: data.adresseOrt,
          dienstbezeichnung: data.dienstbezeichnung,
          schulnummer: data.schulnummer || null,
          betreuungsabsicht: data.betreuungsabsicht,
          gleichzeitigeEZ: data.gleichzeitigeEZ,
          antragVorlAm: new Date(),
          antragTokenVorlUsedAt: new Date(),
          status: "ANTRAG_VORL_EINGEREICHT",
        },
      });

      if (result.count === 0) {
        return { status: "ALREADY_USED" as const };
      }

      // Bestehende Abschnitte loeschen + neue anlegen
      await tx.elternzeitAbschnitt.deleteMany({
        where: { elternzeitId: ez.id },
      });
      for (const a of data.abschnitte) {
        const hatWarnung = warnungen.some((w) => w.abschnittNr === a.abschnittNr);
        await tx.elternzeitAbschnitt.create({
          data: {
            elternzeitId: ez.id,
            abschnittNr: a.abschnittNr,
            von: new Date(a.von),
            bis: new Date(a.bis),
            uebertragung3bis8: a.uebertragung3bis8,
            teilzeit: a.teilzeit,
            teilzeitStunden: a.teilzeitStunden ?? null,
            ferienSperrfristWarnung: hatWarnung,
            ferienBegruendung: a.ferienBegruendung || null,
          },
        });
      }

      await tx.auditLog.create({
        data: {
          elternzeitId: ez.id,
          processType: "ELTERNZEIT",
          // Public-Magic-Link-Submission — kein userId vorhanden,
          // Forensik via ipAddress + tokenHash + Action-Suffix moeglich.
          action: "ANTRAG_VORL_SUBMITTED_VIA_MAGIC_LINK",
          details: {
            abschnitte: data.abschnitte.length,
            ferienWarnungen: warnungen.length,
            tokenHash,
          },
          ipAddress,
        },
      });

      return { status: "OK" as const };
    });

    if (txResult.status === "ALREADY_USED") {
      return NextResponse.json(
        { error: "Antrag wurde bereits eingereicht" },
        { status: 410 },
      );
    }

    await syncElternzeitFristen(ez.id).catch((err) =>
      console.error(
        "[syncElternzeitFristen] Fehler nach vorl. Antrag:",
        err instanceof Error ? err.message : err,
      ),
    );

    triggerWebhooks("elternzeit-antrag-eingereicht", {
      elternzeitId: ez.id,
      displayId: ez.displayId,
      antragTyp: "vorlaeufig",
      submittedAt: new Date().toISOString(),
      employeeName: `${ez.employeeFirstName} ${ez.employeeLastName}`,
      employeeEmail: ez.employeeEmail,
    }).catch((err) =>
      console.error(
        "[elternzeit-antrag-eingereicht] Webhook-Fehler:",
        err instanceof Error ? err.message : err,
      ),
    );

    return NextResponse.json({
      data: {
        ok: true,
        warnungen,
      },
    });
  } catch (error) {
    console.error("[API] elternzeit-antrag POST fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
