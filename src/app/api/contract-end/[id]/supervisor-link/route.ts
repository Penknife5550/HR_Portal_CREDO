/**
 * API: POST /api/contract-end/:id/supervisor-link
 *
 * Strang A des Vertragsende-Prozesses: HR loest MANUELL (wie im Onboarding) eine
 * Anfrage per Magic-Link an die Vorgesetzte:n aus. Ueber den Link ENTSCHEIDET die
 * Fuehrungskraft selbst ueber die Uebernahme und fuellt bei Ja die neuen
 * Vertragsdaten aus (oeffentliches Formular /vertrag-formular/[token]).
 *
 * Zwei Regeln (seit 10/2026):
 *  - **Nach der Antwort der Fuehrungskraft keine neue Anfrage.** Eine neue
 *    Anfrage setzt Entscheidung, Begruendung und Vorstand-Abstimmung zurueck;
 *    nach „Ja" bliebe das Formular trotzdem gesperrt (`renewalData.isComplete`),
 *    und der Vertrag kann schon erzeugt sein. Deshalb stehen beide
 *    RUECKMELDUNG-Status in der Sperrliste, und der Wechsel ist an den Status
 *    gebunden (`updateMany`): Antwortet die Fuehrungskraft zwischen Pruefen und
 *    Speichern, gewinnt ihre Antwort (409). Ausloesbar war das ohnehin nur aus
 *    einem veralteten Browserfenster — beide Ansichten bieten den Knopf nach
 *    einer Antwort nicht an.
 *  - **Gesendet ist nur, was hinausging** (`versandBewerten`). Geht die Mail
 *    nicht hinaus, gilt die Anfrage als nicht gesendet (`supervisorLinkSentAt`
 *    zurueck auf null — keine Erinnerungen zu einem Link, den niemand hat; war
 *    es die erste Anfrage, auch der Status zurueck auf ANGELEGT, damit Liste
 *    und Montags-Hinweis „unbearbeitet" stimmen) und die Route antwortet 502
 *    bzw. 409 mit fertiger Meldung statt 201.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { generateToken, getTokenExpiryDate, getSession } from "@/lib/auth";
import { triggerWebhooks } from "@/lib/webhooks";
import { canAccessProcess, HR_EDIT_ROLES } from "@/lib/permissions";
import { CONTRACT_END_ANFRAGE_GESPERRT } from "@/lib/contract-end-status";
import {
  anfrageNichtZugestelltMeldung,
  statusNichtZugestellt,
  versandBewerten,
} from "@/lib/contract-end-versand";
import type { ContractEndStatus } from "@prisma/client";

/** Die Fuehrungskraft hat schon geantwortet — eigene Meldung (Teilmenge der Sperrliste). */
const SCHON_GEANTWORTET: readonly ContractEndStatus[] = [
  "RUECKMELDUNG_UEBERNAHME",
  "RUECKMELDUNG_KEINE_UEBERNAHME",
];

const MELDUNG_GEANTWORTET =
  "Die Führungskraft hat bereits geantwortet – eine neue Anfrage ist nicht mehr möglich. Bitte laden Sie die Seite neu.";
const MELDUNG_GESPERRT =
  "In diesem Stand des Vorgangs ist keine Anfrage an die Führungskraft mehr möglich. Bitte laden Sie die Seite neu.";
const MELDUNG_GEAENDERT =
  "Der Vorgang wurde gerade geändert – zum Beispiel hat die Führungskraft geantwortet. Bitte laden Sie die Seite neu.";

const bodySchema = z.object({
  supervisorEmail: z.string().email("Ungültige E-Mail-Adresse"),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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
    const body = await request.json().catch(() => null);
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
    }
    const { supervisorEmail } = parsed.data;

    const contractEnd = await prisma.contractEndProcess.findUnique({
      where: { id },
      include: { organization: true },
    });
    if (!contractEnd) {
      return NextResponse.json({ error: "Vorgang nicht gefunden" }, { status: 404 });
    }
    if (!(await canAccessProcess(session, contractEnd.organizationId))) {
      return NextResponse.json(
        { error: "Keine Berechtigung für diesen Vorgang" },
        { status: 403 }
      );
    }
    // Liste in src/lib/contract-end-status.ts (dieselbe liest der Test des
    // Prozess-Adapters).
    if (CONTRACT_END_ANFRAGE_GESPERRT.includes(contractEnd.status)) {
      return NextResponse.json(
        {
          error: SCHON_GEANTWORTET.includes(contractEnd.status)
            ? MELDUNG_GEANTWORTET
            : MELDUNG_GESPERRT,
        },
        { status: 400 }
      );
    }

    const supervisorToken = generateToken();
    const supervisorTokenExpiresAt = getTokenExpiryDate();

    // Statuswechsel, leerer Vertragsdaten-Datensatz und Protokoll in EINER
    // Transaktion; der Wechsel nur, solange der Status nicht gesperrt ist.
    const angelegt = await prisma.$transaction(async (tx) => {
      const wechsel = await tx.contractEndProcess.updateMany({
        where: { id, status: { notIn: [...CONTRACT_END_ANFRAGE_GESPERRT] } },
        data: {
          supervisorEmail,
          supervisorToken,
          supervisorTokenExpiresAt,
          supervisorLinkSentAt: new Date(),
          // Neuer Prozess: die Fuehrungskraft entscheidet -> Anfrage ist offen.
          // Rueckmeldung/Entscheidung zuruecksetzen (auch bei erneuter Anfrage).
          status: "ANFRAGE_VORGESETZTER",
          decision: "OFFEN",
          supervisorRespondedAt: null,
          supervisorDeclineReason: null,
          // Neue Anfrage = neuer Erinnerungs-/Eskalationszyklus
          lastSupervisorReminderAt: null,
          supervisorReminderCount: 0,
          escalatedAt: null,
          // Auch die Vorstand-/GF-Abstimmung gehoert zur ALTEN Antwort —
          // sonst klebt ein veralteter Nachweis an der neuen Entscheidung.
          vorstandAbgestimmt: null,
          vorstandAbstimmungVermerk: null,
        },
      });
      if (wechsel.count === 0) return false;

      // Leeren Vertragsdaten-Datensatz anlegen (wird vom Vorgesetzten gefuellt)
      await tx.contractRenewalData.upsert({
        where: { contractEndId: id },
        update: {},
        create: { contractEndId: id },
      });

      await tx.auditLog.create({
        data: {
          contractEndId: id,
          userId: session.userId,
          processType: "CONTRACT_END",
          action: "SUPERVISOR_LINK_CREATED",
          details: {
            supervisorEmail,
            organization: contractEnd.organization.name,
          },
        },
      });
      return true;
    });
    if (!angelegt) {
      return NextResponse.json({ error: MELDUNG_GEAENDERT }, { status: 409 });
    }

    const appUrl = process.env.APP_URL || "http://localhost:3000";
    const formularLink = `${appUrl}/vertrag-formular/${supervisorToken}`;
    const employeeName = `${contractEnd.employeeFirstName} ${contractEnd.employeeLastName}`;

    // SMTP primaer (Event), Webhooks zusaetzlich — wirft nie
    const ergebnis = await triggerWebhooks("contract-end-supervisor-link", {
      contractEndId: id,
      displayId: contractEnd.displayId,
      supervisorEmail,
      formularLink,
      employeeName,
      organization: contractEnd.organization.name,
      mandantNummer: contractEnd.organization.mandantNumber,
      contractEndDate: contractEnd.contractEndDate.toISOString(),
      tokenExpiresAt: supervisorTokenExpiresAt.toISOString(),
    });

    const versand = await versandBewerten("contract-end-supervisor-link", ergebnis);
    if (!versand.erfolgreich) {
      // Nicht zugestellt: Die Anfrage gilt als nicht gesendet. Nur fuer DIESEN
      // Link — hat ein zweiter Klick inzwischen einen neuen erzeugt, bleibt
      // dessen Stand unberuehrt.
      await prisma.contractEndProcess.updateMany({
        where: { id, supervisorToken },
        data: {
          supervisorLinkSentAt: null,
          // Erste Anfrage: Es gab vorher nichts zurueckzusetzen — der Vorgang
          // steht wieder dort, wo er war.
          ...(contractEnd.status === "ANGELEGT" ? { status: "ANGELEGT" as const } : {}),
        },
      });
      return NextResponse.json(
        {
          error: anfrageNichtZugestelltMeldung(versand, Boolean(contractEnd.supervisorLinkSentAt)),
          mailStatus: versand.status,
        },
        { status: statusNichtZugestellt(versand) }
      );
    }

    // Der Link (und damit der Token) geht NUR per Mail an die Fuehrungskraft,
    // nicht in die Antwort an HR — wer ihn kennt, entscheidet in ihrem Namen
    // (src/lib/contract-end-antwort.ts). Die Oberflaeche liest ihn nicht.
    return NextResponse.json(
      {
        id,
        supervisorEmail,
        employeeName,
        supervisorTokenExpiresAt,
        mailStatus: versand.status,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Fehler beim Erstellen des Vorgesetzten-Links (Vertragsende):", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
