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
 *   - NICHT AN DIE PERSON SELBST. Ist die Adresse die der neuen Person, antwortet
 *     die Route 400 — dieselbe Regel wie beim Anlegen.
 */

import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api-handler";
import { prisma } from "@/lib/db";
import { canAccessProcess, HR_EDIT_ROLES } from "@/lib/permissions";
import { triggerWebhooks } from "@/lib/webhooks";
import {
  istHrStatus,
  mitarbeiterName,
  vorgesetzteAbgesendet,
  vorgesetztenLinkWiederverwendbar,
} from "@/lib/onboarding-spuren";
import {
  LinkGeaendert,
  modalitaetenLinkZu,
  vorgesetztenLinkMailFelder,
  vorgesetztenLinkSetzen,
} from "@/lib/onboarding-einladung";
import {
  gleicheAdresse,
  MELDUNG_EIGENE_ADRESSE,
  supervisorLinkSchema,
  type SupervisorLinkInput,
} from "@/lib/validations/onboarding";

/** Was die Route vom Vorgang liest — einmal vor und ggf. einmal nach dem Schreiben. */
const VORGANG_INCLUDE = {
  organization: true,
  personalData: { select: { firstName: true, lastName: true } },
  supervisorData: { select: { isComplete: true } },
} as const;

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

    // Dieselbe Regel wie beim Anlegen (onboardingAnlegenSchema) — hier erst
    // pruefbar, weil das Schema die Adresse der Person nicht kennt. Vor dem
    // Wiederverwenden: Auch ein alter Link an die Person selbst gilt nicht weiter.
    if (gleicheAdresse(supervisorEmail, onboarding.email)) {
      return NextResponse.json({ error: MELDUNG_EIGENE_ADRESSE }, { status: 400 });
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
        modalitaetenLink: modalitaetenLinkZu(v.supervisorToken!),
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

    // Schreiben, Status abgleichen und Protokoll in EINER Transaktion —
    // dieselbe Funktion wie beim Anlegen mit Fuehrungskraft.
    let link: Awaited<ReturnType<typeof vorgesetztenLinkSetzen>>;
    try {
      link = await prisma.$transaction((tx) =>
        vorgesetztenLinkSetzen(tx, {
          id,
          supervisorEmail,
          bisherigerToken: onboarding.supervisorToken,
          bisherigeEmail: onboarding.supervisorEmail,
          userId: session.userId,
          organizationName: onboarding.organization.name,
        }),
      );
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

    const { supervisorToken, supervisorTokenExpiresAt } = link;
    const modalitaetenLink = modalitaetenLinkZu(supervisorToken);

    // E-Mail an die Fuehrungskraft (SMTP primaer, Webhooks nur zusaetzlich).
    // Wirft nicht; das Ergebnis steht im EmailLog und geht an die Oberflaeche,
    // damit HR weiss, ob der Link selbst weitergegeben werden muss. Ohne Namen
    // heisst die Person dort MITARBEITER_NEUTRAL, nie ihre E-Mail-Adresse
    // (Payload-Baustein in src/lib/onboarding-einladung.ts).
    const mail = await triggerWebhooks(
      "supervisor-link-created",
      vorgesetztenLinkMailFelder({
        ...onboarding,
        supervisorEmail,
        supervisorToken,
        supervisorTokenExpiresAt,
      }),
    );

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
