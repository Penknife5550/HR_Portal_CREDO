/**
 * API: /api/onboarding
 *
 * POST – Neuen Onboarding-Vorgang anlegen (für das Dashboard, Dialog „Neuer Vorgang“)
 * GET  – Alle Vorgaenge auflisten (für Dashboard)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateToken, getTokenExpiryDate, getSession } from "@/lib/auth";
import { apiHandler } from "@/lib/api-handler";
import { triggerWebhooks } from "@/lib/webhooks";
import { abteilungAusZustaendigkeit, MELDUNGEN } from "@/lib/abteilungsaufgaben";
import { fuehrungskraftAdresseFreigegeben } from "@/lib/abteilungsaufgaben-dienst";
import { vorgangsjahrInBerlin } from "@/lib/vorgangsjahr";
import {
  canAccessProcess,
  canEditProcess,
  orgFilter,
  PORTAL_ROLES,
  PROCESS_CREATE_ROLES,
} from "@/lib/permissions";
import {
  ladeVorlagenKonfigurationen,
  fortschrittFuerVorgang,
} from "@/lib/fragebogen-fortschritt";
import {
  einladungMailFelder,
  fragebogenLinkZu,
  modalitaetenLinkZu,
  vorgesetztenLinkMailFelder,
  vorgesetztenLinkSetzen,
} from "@/lib/onboarding-einladung";
import {
  onboardingAnlegenSchema,
  type OnboardingAnlegenInput,
} from "@/lib/validations/onboarding";

/** So oft wird das Anlegen versucht, wenn die Vorgangsnummer gerade vergeben wurde. */
const VERSUCHE_VORGANGSNUMMER = 3;

/**
 * Prisma meldet mit P2002 eine verletzte Eindeutigkeit; `meta.target` nennt
 * das Feld (je nach Treiber als Liste der Felder oder als Name des Index).
 * Geprueft wird nur der Code statt `instanceof
 * Prisma.PrismaClientKnownRequestError` — wie beim Zuruecksetzen der
 * E-Mail-Vorlagen: haengt nicht an der Klassenidentitaet des generierten
 * Clients.
 */
function istVorgangsnummerVergeben(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const { code, meta } = error as { code?: unknown; meta?: { target?: unknown } };
  if (code !== "P2002") return false;
  const ziel = meta?.target;
  if (Array.isArray(ziel)) return ziel.includes("displayId");
  return typeof ziel === "string" && ziel.includes("displayId");
}

/**
 * Vorgangsnummer vorschlagen: {Jahr}-{Org-Kuerzel}-{laufende Nummer}.
 *
 * Pruefen-dann-Schreiben, also nur ein Vorschlag: Zwei gleichzeitige Aufrufe
 * koennen dieselbe Nummer bekommen. Der zweite scheitert dann am Unique-Index
 * (P2002), seine Transaktion rollt vollstaendig zurueck, und die Route fragt
 * hier erneut an.
 *
 * Jahr und Zaehlbereich in deutscher Zeit (`vorgangsjahrInBerlin`): Der
 * Container laeuft in UTC, und in der ersten Stunde des neuen Jahres bekaeme
 * ein Vorgang sonst noch die Jahreszahl des alten.
 */
async function vorgangsnummerVorschlagen(
  shortName: string,
): Promise<{ displayId: string; sequentialNumber: number }> {
  const {
    jahr: currentYear,
    von: yearStart,
    bis: yearEnd,
  } = vorgangsjahrInBerlin(new Date());

  let displayId = "";
  let sequentialNumber = 0;
  for (let attempt = 0; attempt < 5; attempt++) {
    const countThisYear = await prisma.onboardingProcess.count({
      where: { createdAt: { gte: yearStart, lt: yearEnd } },
    });
    sequentialNumber = countThisYear + 1 + attempt;
    displayId = `${currentYear}-${shortName}-${sequentialNumber
      .toString()
      .padStart(3, "0")}`;
    const exists = await prisma.onboardingProcess.findUnique({
      where: { displayId },
      select: { id: true },
    });
    if (!exists) break;
  }
  return { displayId, sequentialNumber };
}

// =============================================
// POST /api/onboarding – Neuen Vorgang anlegen
// =============================================
//
// Alles, was zum Vorgang gehoert — Vorgang, Vorbelegung der Personaldaten,
// Checkliste, Protokoll und (falls eingetragen) der Vorgesetzten-Link — steht
// in EINER Transaktion. Frueher waren es sechs einzelne Schreibvorgaenge; brach
// einer ab, blieb ein halber Vorgang ohne Personaldaten oder Checkliste zurueck.
//
// Die Mails gehen erst NACH dem Commit hinaus: Nach einem Rollback kaeme sonst
// ein toter Link an. Ein Fehlschlag beim Versand rollt nichts zurueck — die
// Antwort meldet ihn je Link (`mailVersand`), und die Oberflaeche bittet dann,
// den Link selbst weiterzugeben.
export const POST = apiHandler<OnboardingAnlegenInput>(
  {
    roles: PROCESS_CREATE_ROLES,
    bodySchema: onboardingAnlegenSchema,
    logLabel: "Onboarding anlegen",
  },
  async ({ body, session }) => {
    if (!session) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }

    const {
      email,
      organizationId,
      processType,
      questionnaireType,
      firstName,
      lastName,
      supervisorEmail,
    } = body;

    // Dieselbe Regel wie in /supervisor-link: Wer den Link spaeter nicht
    // erzeugen darf, kann es auch beim Anlegen nicht.
    if (supervisorEmail && !canEditProcess(session)) {
      return NextResponse.json(
        {
          error:
            "Den Link zu den Einstellungsmodalitäten können nur Administration, HR-Leitung und HR-Sachbearbeitung erzeugen.",
        },
        { status: 403 },
      );
    }

    // 404 auch bei fremdem Mandanten — gleicher Text, damit die Antwort nicht
    // verraet, dass es die Einrichtung gibt.
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
    });
    if (!org || !(await canAccessProcess(session, org.id))) {
      return NextResponse.json(
        { error: "Organisation nicht gefunden" },
        { status: 404 }
      );
    }

    // Fuehrungskraft: An die frei eingetippte Adresse geht gleich ein Link zu
    // den Verguetungsangaben. Dieselbe Freigabeliste und Funktion wie in
    // /supervisor-link und im Offboarding (Einstellungen → SMTP, leere Liste =
    // keine Einschraenkung). Bei der Anlage kennt das Portal noch keine Adresse
    // dieses Vorgangs, also gibt es keine „bekannten" Ausnahmen. Geprueft VOR
    // jedem Schreiben — nichts wird angelegt, keine Mail geht hinaus.
    if (supervisorEmail && !(await fuehrungskraftAdresseFreigegeben(supervisorEmail, []))) {
      return NextResponse.json(
        { error: MELDUNGEN.FUEHRUNGSKRAFT_NICHT_FREIGEGEBEN },
        { status: 409 },
      );
    }

    // Vorlagen VOR der Transaktion lesen: Fragebogen-Versionierung (Snapshot
    // zum Zeitpunkt der Erstellung) und die aktive Checkliste zum Typ.
    const [formTemplate, checklistTemplate] = await Promise.all([
      prisma.formTemplate.findUnique({
        where: { questionnaireType },
      }),
      prisma.checklistTemplate.findFirst({
        where: { questionnaireType, isActive: true },
        include: { items: { orderBy: { orderIndex: "asc" } } },
      }),
    ]);
    // Die Aufgaben dieses Vorgangs aus der Vorlage (Paket 5):
    //   assignee        Schluessel statt Freitext. `abteilungAusZustaendigkeit`
    //                   setzt bekannte Altwerte um ("Verwaltung" → VERWALTUNG);
    //                   Unbekanntes bleibt als Freitext stehen und erscheint
    //                   spaeter als „unbekannte Zuständigkeit". Das `|| null`
    //                   ist Absicht: Bei `defaultAssignee: "   "` ergaebe
    //                   `?? null` den LEEREN Text — weder Schluessel noch
    //                   Freitext, und die Uebersicht meldete ihn weder als
    //                   Zeile noch als unbekannte Zustaendigkeit.
    //   description     Hinweis fuer die zustaendige Stelle (Link-Seite, Mail).
    //   relativeDueDays Kopie der Tagesangabe; `templateItemId` zeigt nach
    //                   Vorlagen-Aenderungen oft ins Leere.
    //   dueDate         bleibt null — der Vertragsbeginn steht noch nicht fest.
    //                   faelligkeitenSetzen rechnet ihn einmalig aus, sobald
    //                   die Einstellungsmodalitaeten eingereicht sind.
    const checklistItems =
      checklistTemplate?.items.map((templateItem) => ({
        templateItemId: templateItem.id,
        title: templateItem.title,
        category: templateItem.category,
        orderIndex: templateItem.orderIndex,
        dueDate: null,
        assignee:
          abteilungAusZustaendigkeit(templateItem.defaultAssignee) ??
          (templateItem.defaultAssignee?.trim() || null),
        description: templateItem.description ?? null,
        relativeDueDays: templateItem.defaultDueDays ?? null,
      })) ?? [];

    const token = generateToken();
    const tokenExpiresAt = getTokenExpiryDate();

    // Vorbelegung: Name am Vorgang UND in den Personaldaten. Der Fragebogen
    // liest nur die Personaldaten (die Person sieht den Namen dort und kann
    // ihn korrigieren), Reporting, PDF und Word-Vorlagen lesen den Vorgang.
    // Nur gesetzt, was angegeben ist — das Schema macht aus Leerem `undefined`.
    // KEIN status/currentStep/isComplete: Der Vorgang bleibt INVITED, der
    // Fragebogen „noch nicht begonnen".
    const name = {
      ...(firstName ? { firstName } : {}),
      ...(lastName ? { lastName } : {}),
    };

    let angelegt = null;
    for (let versuch = 0; versuch < VERSUCHE_VORGANGSNUMMER && !angelegt; versuch++) {
      const { displayId, sequentialNumber } = await vorgangsnummerVorschlagen(
        org.shortName || org.mandantNumber,
      );
      try {
        angelegt = await prisma.$transaction(async (tx) => {
          const onboarding = await tx.onboardingProcess.create({
            data: {
              email,
              organizationId: org.id,
              processType,
              questionnaireType,
              token,
              tokenExpiresAt,
              invitedById: session.userId,
              displayId,
              sequentialNumber,
              ...name,
              personalData: { create: { ...name } },
              ...(formTemplate
                ? {
                    formTemplateVersion: formTemplate.version ?? 1,
                    formTemplateSnapshot: formTemplate.stepsConfig as object,
                  }
                : {}),
              ...(checklistTemplate && checklistItems.length > 0
                ? {
                    checklistTemplateId: checklistTemplate.id,
                    checklistItems: { createMany: { data: checklistItems } },
                  }
                : {}),
            },
          });

          await tx.auditLog.create({
            data: {
              onboardingId: onboarding.id,
              userId: session.userId,
              action: "ONBOARDING_CREATED",
              details: {
                email,
                organization: org.name,
                questionnaireType,
                // Der Name im Reiter „Persönliche Daten" sieht aus wie eine
                // Angabe der Person — hier steht, dass HR ihn vorbelegt hat.
                nameVorbelegt: !!(firstName || lastName),
                mitVorgesetztenLink: !!supervisorEmail,
              },
            },
          });

          // Frische Zeile, noch kein Link: Das bedingte UPDATE trifft immer,
          // `statusAbgleichen` ergibt INVITED -> INVITED und schreibt nichts.
          const link = supervisorEmail
            ? await vorgesetztenLinkSetzen(tx, {
                id: onboarding.id,
                supervisorEmail,
                bisherigerToken: null,
                bisherigeEmail: null,
                userId: session.userId,
                organizationName: org.name,
              })
            : null;

          return { onboarding, link };
        });
      } catch (error) {
        // Nur die vergebene Vorgangsnummer ist einen neuen Versuch wert.
        if (!istVorgangsnummerVergeben(error)) throw error;
      }
    }

    if (!angelegt) {
      return NextResponse.json(
        { error: "Die Vorgangsnummer wurde gerade vergeben. Bitte versuchen Sie es erneut." },
        { status: 409 },
      );
    }

    const { onboarding, link } = angelegt;
    const fragebogenLink = fragebogenLinkZu(token);

    // Beide Mails parallel: Webhooks mit Wiederholung koennen je Ereignis
    // Sekunden kosten. `triggerWebhooks` wirft nie.
    const [mail, fkMail] = await Promise.all([
      triggerWebhooks(
        "onboarding-created",
        einladungMailFelder({ ...onboarding, token, organization: org }),
      ),
      link && supervisorEmail
        ? triggerWebhooks(
            "supervisor-link-created",
            vorgesetztenLinkMailFelder({
              ...onboarding,
              supervisorEmail,
              supervisorToken: link.supervisorToken,
              supervisorTokenExpiresAt: link.supervisorTokenExpiresAt,
              organization: org,
            }),
          )
        : null,
    ]);

    return NextResponse.json(
      {
        id: onboarding.id,
        displayId: onboarding.displayId,
        email: onboarding.email,
        firstName: onboarding.firstName,
        lastName: onboarding.lastName,
        fragebogenLink,
        organization: {
          id: org.id,
          name: org.name,
          mandantNumber: org.mandantNumber,
        },
        status: link?.abgleich.nach ?? onboarding.status,
        tokenExpiresAt: onboarding.tokenExpiresAt,
        createdAt: onboarding.createdAt,
        mailVersand: mail?.status ?? null,
        vorgesetzter:
          link && supervisorEmail
            ? {
                supervisorEmail,
                modalitaetenLink: modalitaetenLinkZu(link.supervisorToken),
                supervisorTokenExpiresAt: link.supervisorTokenExpiresAt,
                mailVersand: fkMail?.status ?? null,
              }
            : null,
      },
      { status: 201 },
    );
  },
);

// =============================================
// GET /api/onboarding – Alle Vorgaenge auflisten
// =============================================
export async function GET(request: NextRequest) {
  try {
    // Auth + Rollen-Check
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "Nicht authentifiziert" },
        { status: 401 }
      );
    }
    if (!PORTAL_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const organizationId = searchParams.get("organizationId");
    const search = searchParams.get("search")?.trim();
    const sortBy = searchParams.get("sortBy") || "createdAt";
    const sortOrder = searchParams.get("sortOrder") === "asc" ? "asc" : "desc";
    const rawLimit = parseInt(searchParams.get("limit") || "50");
    const rawOffset = parseInt(searchParams.get("offset") || "0");
    // Validierung: NaN/negative Werte abfangen, Maximum begrenzen
    const limit = Math.min(Math.max(isNaN(rawLimit) ? 50 : rawLimit, 1), 200);
    const offset = Math.max(isNaN(rawOffset) ? 0 : rawOffset, 0);

    // Filter zusammenbauen (inkl. Org-Einschraenkung)
    const where: Record<string, unknown> = {
      ...(await orgFilter(session)),
    };
    // "OPEN" ist kein echter Status, sondern die Gruppe der offenen Vorgaenge.
    if (status === "OPEN") {
      where.status = {
        in: ["INVITED", "IN_PROGRESS", "SUBMITTED", "SUPERVISOR_PENDING", "SUPERVISOR_SUBMITTED"],
      };
    } else if (status) {
      where.status = status;
    } else if (searchParams.get("archiv") === "aus") {
      // Die Voreinstellung der Liste: alles ausser dem Archiv.
      //
      // Bewusst NICHT ueber status=OPEN geloest — diese Gruppe laesst auch
      // REVIEWED weg, das Archiv umfasst aber nur COMPLETED und EXPIRED.
      // Geprüfte Vorgaenge wuerden sonst lautlos aus der Liste verschwinden.
      //
      // Und bewusst auf dem Server statt im Browser: Wer erst eine Seite holt
      // und dann daraus wegfiltert, kennt die Gesamtzahl nicht mehr. Genau
      // daran haing die Blaetternavigation.
      where.status = { notIn: ["COMPLETED", "EXPIRED"] };
    }
    if (organizationId) where.organizationId = organizationId;
    if (search) {
      where.OR = [
        { displayId: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { personalData: { firstName: { contains: search, mode: "insensitive" } } },
        { personalData: { lastName: { contains: search, mode: "insensitive" } } },
      ];
    }

    // Sortierung validieren
    const VALID_SORT_FIELDS: Record<string, string> = {
      createdAt: "createdAt",
      displayId: "displayId",
      email: "email",
      status: "status",
      invitedAt: "invitedAt",
    };
    const resolvedSort = VALID_SORT_FIELDS[sortBy] || "createdAt";

    const [onboardings, total, vorlagen] = await Promise.all([
      prisma.onboardingProcess.findMany({
        where,
        include: {
          organization: {
            select: { name: true, mandantNumber: true, type: true },
          },
          personalData: {
            select: {
              firstName: true,
              lastName: true,
              isComplete: true,
              currentStep: true,
            },
          },
          supervisorData: {
            select: { isComplete: true, currentStep: true },
          },
          _count: {
            select: { notes: true },
          },
        },
        orderBy: { [resolvedSort]: sortOrder },
        take: limit,
        skip: offset,
      }),
      prisma.onboardingProcess.count({ where }),
      ladeVorlagenKonfigurationen(),
    ]);

    // Der Fortschritt wird hier berechnet, nicht im Browser: Wie viele Schritte
    // ein Vorgang hat, haengt an seiner Vorlage, und die kennt die Liste nicht.
    const data = onboardings.map((ob) => ({
      ...ob,
      fragebogenFortschritt: fortschrittFuerVorgang(ob, vorlagen),
    }));

    return NextResponse.json({
      data,
      total,
      limit,
      offset,
    });
  } catch (error) {
    console.error("Fehler beim Laden der Onboarding-Vorgaenge:", error);
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}
