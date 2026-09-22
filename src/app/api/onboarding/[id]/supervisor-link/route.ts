/**
 * API: /api/onboarding/:id/supervisor-link
 *
 * POST – Vorgesetzten-Link erzeugen (Einstellungsmodalitaeten) und per SMTP
 *        an die Fuehrungskraft versenden (Ereignis `supervisor-link-created`).
 *
 * Aufrufer ist die HR-Detailansicht (Knopf „Generieren" bzw. „Vorgesetzten-
 * Link erstellen"). Ein n8n-Workflow ruft die Route NICHT auf (Entscheidung
 * 21.09.2026): Das Portal erzeugt die Links selbst. Deshalb nur noch
 * HR_EDIT_ROLES — die Rolle SERVICE (X-API-Key) ist bewusst ausgeschlossen.
 *
 * Seit Fragebogen und Modalitaeten parallel laufen, gilt:
 *
 *   - JEDERZEIT MOEGLICH, nicht erst nach dem Fragebogen. Der Status wird
 *     danach per `statusAbgleichen` aus beiden Spuren abgeleitet — ist der
 *     Fragebogen schon da, wird er SUPERVISOR_PENDING, sonst bleibt er, wie er
 *     ist. Frueher schrieb die Route den VORHER gelesenen Status zurueck
 *     (`: onboarding.status`); sendete die Person dazwischen ab, ging ihre
 *     Abgabe im Status verloren.
 *   - WIEDERHOLUNGSSICHER. Frueher erzeugte jeder Aufruf einen neuen Token und
 *     machte den laufenden ungueltig — schon ein Doppelklick raubte der
 *     Fuehrungskraft den Link, mit dem sie gerade arbeitete. Jetzt: Gilt der
 *     bestehende Link noch und geht er an dieselbe Adresse, wird er
 *     wiederverwendet (200, keine zweite Mail). Eine ANDERE Adresse heisst
 *     „falscher Empfaenger": neuer Token, der alte ist damit sofort tot.
 *   - NICHT MEHR NACH DER ABGABE. Sind die Modalitaeten eingereicht, antwortet
 *     die Route 409. Ein neuer Link zeigte der neuen Person die kompletten
 *     Verguetungsangaben, die jemand anderes eingetragen hat. Ebenso 409 bei
 *     geprueften, abgeschlossenen oder abgelaufenen Vorgaengen: Dort waere der
 *     Link ohnehin schreibgesperrt.
 */

import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api-handler";
import { prisma } from "@/lib/db";
import { generateToken, getTokenExpiryDate } from "@/lib/auth";
import { canAccessProcess, HR_EDIT_ROLES } from "@/lib/permissions";
import { triggerN8nWebhook } from "@/lib/n8n";
import {
  HR_STATUS,
  istHrStatus,
  mitarbeiterName,
  vorgesetzteAbgesendet,
  vorgesetztenLinkWiederverwendbar,
} from "@/lib/onboarding-spuren";
import { statusAbgleichen } from "@/lib/onboarding-status-abgleich";
import {
  supervisorLinkSchema,
  type SupervisorLinkInput,
} from "@/lib/validations/onboarding";

/**
 * Zwischen Lesen und Schreiben hat sich der Link geaendert (Doppelklick,
 * zweiter Tab). Eigene Klasse, weil nur eine Ausnahme die Transaktion
 * zurueckrollt.
 */
class LinkGeaendert extends Error {}

/** Was die Route vom Vorgang liest — einmal vor und ggf. einmal nach dem Schreiben. */
const VORGANG_INCLUDE = {
  organization: true,
  personalData: { select: { firstName: true, lastName: true } },
  supervisorData: { select: { isComplete: true } },
} as const;

function linkZu(token: string): string {
  const appUrl = process.env.APP_URL || "http://localhost:3000";
  return `${appUrl}/modalitaeten/${token}`;
}

export const POST = apiHandler<SupervisorLinkInput>(
  {
    roles: HR_EDIT_ROLES,
    bodySchema: supervisorLinkSchema,
    logLabel: "Vorgesetzten-Link",
  },
  async ({ params, body, session }) => {
    if (!session) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }

    const { id } = params;
    const supervisorEmail = body.supervisorEmail;

    const onboarding = await prisma.onboardingProcess.findUnique({
      where: { id },
      include: VORGANG_INCLUDE,
    });

    // 404 auch bei fremdem Mandanten — gleicher Text, damit die Antwort nicht
    // verraet, dass es den Vorgang gibt. (Heute sind alle HR_EDIT_ROLES
    // global; die Pruefung haelt, falls sich das aendert.)
    if (!onboarding || !(await canAccessProcess(session, onboarding.organizationId))) {
      return NextResponse.json({ error: "Vorgang nicht gefunden" }, { status: 404 });
    }

    if (istHrStatus(onboarding.status)) {
      return NextResponse.json(
        {
          error:
            "Der Vorgang ist bereits geprüft, abgeschlossen oder abgelaufen. " +
            "Ein Vorgesetzten-Link ist nicht mehr möglich.",
        },
        { status: 409 },
      );
    }

    if (vorgesetzteAbgesendet(onboarding)) {
      return NextResponse.json(
        {
          error:
            "Die Einstellungsmodalitäten wurden bereits eingereicht. " +
            "Ein neuer Link würde die Angaben einer weiteren Person zeigen.",
        },
        { status: 409 },
      );
    }

    const employeeName = mitarbeiterName(onboarding);

    /** Antwort, wenn der bestehende Link weiter gilt — ohne neue Mail. */
    const wiederverwendet = (v: {
      id: string;
      supervisorToken: string | null;
      supervisorTokenExpiresAt: Date | null;
    }) =>
      NextResponse.json({
        id: v.id,
        supervisorEmail,
        modalitaetenLink: linkZu(v.supervisorToken!),
        organization: {
          id: onboarding.organization.id,
          name: onboarding.organization.name,
          mandantNumber: onboarding.organization.mandantNumber,
        },
        employeeName,
        supervisorTokenExpiresAt: v.supervisorTokenExpiresAt,
        wiederverwendet: true,
        mailVersand: null,
      });

    if (vorgesetztenLinkWiederverwendbar(onboarding, supervisorEmail)) {
      return wiederverwendet(onboarding);
    }

    const supervisorToken = generateToken();
    const supervisorTokenExpiresAt = getTokenExpiryDate();
    const jetzt = new Date();

    try {
      await prisma.$transaction(async (tx) => {
        // Optimistische Sperre: Geschrieben wird nur, wenn der Link noch der
        // ist, den wir oben gelesen haben (bzw. es noch keinen gibt), die
        // Modalitaeten weiter offen sind und HR den Vorgang nicht inzwischen
        // abgeschlossen hat. Ein zweiter, gleichzeitiger Aufruf (Doppelklick)
        // wartet auf unsere Zeilensperre, findet danach einen anderen Token
        // vor und bekommt count 0 — statt unseren frischen Link zu ersetzen.
        const gesetzt = await tx.onboardingProcess.updateMany({
          where: {
            id,
            supervisorToken: onboarding.supervisorToken,
            supervisorSubmittedAt: null,
            status: { notIn: [...HR_STATUS] },
          },
          data: {
            supervisorEmail,
            supervisorToken,
            supervisorTokenExpiresAt,
            supervisorLinkSentAt: jetzt,
            // Erinnerungen zaehlen ab DIESEM Link. Eine Erinnerung zum alten
            // (ersetzten) Link darf die erste zum neuen nicht verschieben.
            lastSupervisorReminderAt: null,
          },
        });
        if (gesetzt.count === 0) throw new LinkGeaendert();

        // Leerer Datensatz fuer das Formular. Beim Ersetzen bleibt alles
        // stehen, was schon eingetragen wurde — die richtige Person soll dort
        // weitermachen koennen.
        await tx.supervisorData.upsert({
          where: { onboardingId: id },
          update: {},
          create: { onboardingId: id },
        });

        const abgleich = await statusAbgleichen(tx, id);

        await tx.auditLog.create({
          data: {
            onboardingId: id,
            userId: session.userId,
            action: "SUPERVISOR_LINK_CREATED",
            details: {
              supervisorEmail,
              organization: onboarding.organization.name,
              // War schon ein Link da, ist er jetzt ungueltig — das gehoert
              // ins Protokoll (falscher Empfaenger, abgelaufener Link).
              ersetztLinkAn: onboarding.supervisorToken ? onboarding.supervisorEmail : null,
              status: { von: abgleich.von, nach: abgleich.nach },
            },
          },
        });
      });
    } catch (error) {
      if (!(error instanceof LinkGeaendert)) throw error;

      // Meist ein Doppelklick: Der erste Aufruf hat den Link gerade angelegt.
      // Gilt er fuer dieselbe Adresse, ist das genau das gewuenschte Ergebnis.
      const aktuell = await prisma.onboardingProcess.findUnique({
        where: { id },
        include: VORGANG_INCLUDE,
      });
      if (
        aktuell &&
        !vorgesetzteAbgesendet(aktuell) &&
        !istHrStatus(aktuell.status) &&
        vorgesetztenLinkWiederverwendbar(aktuell, supervisorEmail)
      ) {
        return wiederverwendet(aktuell);
      }
      return NextResponse.json(
        {
          error:
            "Der Vorgang wurde gerade geändert. Bitte laden Sie die Seite neu und versuchen Sie es erneut.",
        },
        { status: 409 },
      );
    }

    const modalitaetenLink = linkZu(supervisorToken);

    // E-Mail an die Fuehrungskraft (SMTP primaer, Webhooks nur zusaetzlich).
    // Wirft nicht; das Ergebnis steht im EmailLog und geht an die Oberflaeche,
    // damit HR weiss, ob der Link selbst weitergegeben werden muss.
    //
    // Der Namensrueckfall auf die E-Mail-Adresse der Person bleibt hier
    // vorerst stehen: Die Vorlage setzt {{mitarbeiter_name}} in Saetze wie
    // „Für die Einstellung von …", in die eine neutrale Bezeichnung
    // grammatisch nicht passt. Das loest die Vorlagenaenderung aus Paket 2.
    const mail = await triggerN8nWebhook("supervisor-link-created", {
      onboardingId: id,
      supervisorEmail,
      modalitaetenLink,
      employeeName: employeeName ?? onboarding.email,
      organization: onboarding.organization.name,
      mandantNumber: onboarding.organization.mandantNumber,
      supervisorTokenExpiresAt: supervisorTokenExpiresAt.toISOString(),
    });

    return NextResponse.json(
      {
        id,
        supervisorEmail,
        modalitaetenLink,
        organization: {
          id: onboarding.organization.id,
          name: onboarding.organization.name,
          mandantNumber: onboarding.organization.mandantNumber,
        },
        employeeName,
        supervisorTokenExpiresAt,
        wiederverwendet: false,
        mailVersand: mail?.status ?? null,
      },
      { status: 201 },
    );
  },
);
