/**
 * API: /api/onboarding/:id
 *
 * GET   – Einzelnen Vorgang mit allen Daten abrufen, dazu die
 *         Abteilungsuebersicht (Karte „Aufgaben für Abteilungen", Stepper,
 *         Urheber der Haekchen, Faelligkeiten) aus
 *         onboardingAbteilungsUebersichtLaden und die Nachforderungen von
 *         Unterlagen (`unterlagen`, Paket 4) aus unterlagenUebersichtLaden,
 *         dazu Ausstattung & Zugaenge (`ausstattung`, Paket A2) aus
 *         ausstattungUebersichtLaden — nur fuer HR_EDIT_ROLES, sonst `null`
 * PATCH – Status aendern. Seit Paket A3 (Ausstattung & Zugaenge):
 *         COMPLETED mit offenen Ausstattungs- oder Hinweis-Aufgaben nur mit
 *         `bestaetigt: true`, sonst 409 `{ error, grund: "AUSSTATTUNG_OFFEN",
 *         offen: [{ titel, stelle }] }` (E-A19); EXPIRED setzt `expiredAt`
 *         (F12, Grundlage der Loeschfrist E-A22)
 *
 * Mandant: Ein Vorgang eines fremden Mandanten bekommt in BEIDEN Methoden
 * dieselbe 404 mit demselben Text wie ein unbekannter.
 */

import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { decrypt } from "@/lib/encryption";
import { canAccessProcess, PORTAL_ROLES, HR_EDIT_ROLES } from "@/lib/permissions";
import { LINK_STATUS, pruefungNichtMoeglichGrund } from "@/lib/onboarding-spuren";
import { statusAenderungSchema } from "@/lib/validations/onboarding";
import { MELDUNGEN, onboardingEmpfaengerEinrichtung } from "@/lib/abteilungsaufgaben";
import { onboardingAbteilungsUebersichtLaden } from "@/lib/abteilungsaufgaben-onboarding";
import { konfigsLaden } from "@/lib/abteilungsaufgaben-dienst";
import {
  ABSCHLUSS_AUSSTATTUNG_OFFEN,
  abschlussOffeneAufgaben,
  abschlussOffenMeldung,
} from "@/lib/ausstattung";
import { pflichtDokumenteAusVorlage } from "@/lib/required-documents";
import { unterlagenUebersichtLaden } from "@/lib/unterlagen-dienst";
import { ausstattungUebersichtLaden } from "@/lib/ausstattung-dienst";
import {
  ladeVorlagenKonfigurationen,
  fortschrittFuerVorgang,
} from "@/lib/fragebogen-fortschritt";

// =============================================
// GET /api/onboarding/:id
// =============================================
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params;

    const onboarding = await prisma.onboardingProcess.findUnique({
      where: { id },
      include: {
        organization: true,
        // Arbeitsort (E-A10): Kopfzeile und Karte „Person“ der Detailseite.
        // `null` = wie Einrichtung. Zugriff prueft weiter organizationId.
        arbeitsort: { select: { id: true, name: true, type: true } },
        personalData: { include: { children: true } },
        // Ohne dieses `include` zeigt die Vorgangsansicht bei einem neuen
        // Vorgang gar keine Kostenstelle und bei einem migrierten den
        // eingefrorenen Altwert — die gepflegte Aufteilung erreicht HR nie.
        // Siehe src/lib/kostenstellen-anzeige.ts.
        supervisorData: {
          include: { kostenstellen: { orderBy: { orderIndex: "asc" } } },
        },
        documents: true,
        checklistItems: {
          include: {
            completedBy: {
              select: { firstName: true, lastName: true },
            },
          },
          orderBy: [{ orderIndex: "asc" }, { category: "asc" }],
        },
        notes: {
          include: {
            createdBy: {
              select: { firstName: true, lastName: true },
            },
          },
          orderBy: { createdAt: "desc" },
        },
        // Quelle der Karte „Aufgaben für Abteilungen" (Paket 5). Ohne sie
        // kaeme `abteilungen` ohne Versandstand zurueck — jede informierte
        // Abteilung stuende wieder auf „Noch nicht informiert".
        departmentLinks: true,
        invitedBy: {
          select: { firstName: true, lastName: true, email: true },
        },
        reviewedBy: {
          select: { firstName: true, lastName: true, email: true },
        },
        _count: {
          select: { notes: true },
        },
      },
    });

    // Fremder Mandant = unbekannter Vorgang (frueher 403 mit eigenem Text —
    // der verriet, dass es den Vorgang gibt).
    if (!onboarding || !(await canAccessProcess(session, onboarding.organizationId))) {
      return NextResponse.json(
        { error: MELDUNGEN.ONBOARDING_VORGANG_NICHT_GEFUNDEN },
        { status: 404 }
      );
    }

    // Tokens BLEIBEN enthalten: Diese Detail-Ansicht ist auth- + org-geschuetzt
    // (canAccessProcess) und HR benoetigt die Tokens, um die teilbaren Magic-Links
    // (Fragebogen-/Modalitaeten-Link) anzuzeigen und zu versenden. Ohne sie wuerde
    // die UI ".../fragebogen/undefined" bauen.
    const safeOnboarding = { ...onboarding };

    // Sensible Felder entschluesseln (IBAN, SV-Nummer, Steuer-ID)
    if (safeOnboarding.personalData) {
      const pd = safeOnboarding.personalData;
      safeOnboarding.personalData = {
        ...pd,
        iban: pd.iban ? decrypt(pd.iban) : pd.iban,
        socialSecurityNumber: pd.socialSecurityNumber ? decrypt(pd.socialSecurityNumber) : pd.socialSecurityNumber,
        taxId: pd.taxId ? decrypt(pd.taxId) : pd.taxId,
      };
    }

    const vorlagen = await ladeVorlagenKonfigurationen();

    /**
     * Die konfigurierten Pflicht-Dokumenttypen dieses Fragebogentyps.
     *
     * Ohne sie kann die Vorgangsansicht den Kasten „Offene Nachweise" nicht
     * live rechnen — alles Uebrige dafuer (Geburtsdatum, Einrichtungstyp,
     * `aufenthaltstitelErforderlich`, `healthInsuranceType`, `rvEntscheidung`,
     * Kinder, hochgeladene Dokumente) liegt in den `include`s oben bereits
     * vor. Kein sensibles Feld kommt hinzu.
     *
     * Bewusst die AKTUELLE Vorlage und nicht der `formTemplateSnapshot` — samt
     * desselben Rueckfalls wie beim Absenden
     * (src/app/api/fragebogen/[token]/route.ts). Beide Stellen muessen
     * dieselbe Pflichtliste sehen, sonst zeigt die Ansicht eine andere Luecke
     * an, als der Server beim Absenden vermerkt hat.
     */
    const formTemplate = await prisma.formTemplate.findUnique({
      where: { questionnaireType: onboarding.questionnaireType },
      select: { requiredDocuments: true },
    });
    const requiredDocuments = pflichtDokumenteAusVorlage(formTemplate);

    // Abteilungsuebersicht darueber legen (Paket 5): departmentLinks bekommen
    // `url` (vom Server, APP_URL) und `anzeige`, checklistItems bekommen
    // `erledigtVon` und `faelligAm`, dazu `abteilungen` (Quelle der Karte und
    // des Steppers, auch nicht informierte und uebersprungene Abteilungen) und
    // `fuehrungskraft`. Daneben `unterlagen` (Paket 4): Karte, Kasten „Offene
    // Nachweise", Warnbalken und Reiter lesen daraus — Datei-URLs, Dateinamen,
    // Aktionen und Dialogdaten nur mit HR_EDIT_ROLES, Entwuerfe nie. Aus
    // dieser Zeile und derselben Pflichtliste, ohne zweites Laden.
    return NextResponse.json({
      ...safeOnboarding,
      requiredDocuments,
      // Fortschritt gegen die Strecke *dieses* Vorgangs, nicht gegen alle
      // moeglichen Schritte — siehe fragebogen-fortschritt.ts.
      fragebogenFortschritt: fortschrittFuerVorgang(onboarding, vorlagen),
      ...(await onboardingAbteilungsUebersichtLaden(onboarding)),
      ...(await unterlagenUebersichtLaden(onboarding, session, { requiredDocuments })),
      // Ausstattung & Zugaenge (Paket A2): Bemerkungen, Angaben und Hinweise
      // der Fuehrungskraft sieht nur HR (Regel 16) — fuer alle anderen
      // PORTAL_ROLES `null`, ohne Abfrage. Die Tabellen stehen deshalb NICHT
      // im `include` oben (`...safeOnboarding` gaebe sie an alle weiter).
      ausstattung: await ausstattungUebersichtLaden(onboarding, session),
    });
  } catch (error) {
    console.error("Fehler beim Laden des Vorgangs:", error);
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}

// =============================================
// PATCH /api/onboarding/:id – Status aendern
// =============================================
/**
 * Zwischen Lesen und Schreiben hat sich der Vorgang bewegt. Eigene Klasse,
 * weil nur eine Ausnahme die Transaktion zurueckrollt.
 */
class VorgangGeaendert extends Error {}

/**
 * Abschluss ohne Bestaetigung, obwohl Ausstattungs- oder Hinweis-Aufgaben
 * offen sind (E-A19). Eigene Klasse: Die Ausnahme rollt den schon
 * geschriebenen Statuswechsel zurueck und traegt die gelesene Liste hinaus.
 */
class AusstattungOffen extends Error {
  constructor(readonly offen: { title: string; assignee: string | null }[]) {
    super(ABSCHLUSS_AUSSTATTUNG_OFFEN);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "Nicht authentifiziert" },
        { status: 401 }
      );
    }
    if (!HR_EDIT_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    }

    const { id } = await params;
    const parsed = statusAenderungSchema.safeParse(
      await request.json().catch(() => null)
    );
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Ungültiger Status-Wert" },
        { status: 400 }
      );
    }
    const { status, bestaetigt } = parsed.data;

    // Die Link-Status (INVITED bis SUPERVISOR_SUBMITTED) ergeben sich aus den
    // beiden Spuren und werden per `statusAbgleichen` abgeleitet. Von Hand
    // gesetzt, waeren sie beim naechsten Abgleich wieder falsch — und genau
    // eine solche Handkorrektur (SUBMITTED ohne `submittedAt`) war eine der
    // Quellen festhaengender Vorgaenge. Die Oberflaeche hat sie nie genutzt.
    if ((LINK_STATUS as readonly string[]).includes(status)) {
      return NextResponse.json(
        {
          error:
            "Dieser Status ergibt sich aus Fragebogen und Einstellungsmodalitäten " +
            "und kann nicht von Hand gesetzt werden.",
        },
        { status: 400 }
      );
    }

    // Vorgang pruefen — mit den beiden Merkern, die `bereitZurPruefung` fuer
    // Altfaelle ohne Zeitstempel braucht.
    const existing = await prisma.onboardingProcess.findUnique({
      where: { id },
      include: {
        personalData: { select: { currentStep: true, isComplete: true } },
        supervisorData: { select: { isComplete: true } },
      },
    });
    // 404 auch bei fremdem Mandanten (gleicher Text) — heute sind alle
    // HR_EDIT_ROLES global, die Pruefung haelt, falls sich das aendert.
    if (!existing || !(await canAccessProcess(session, existing.organizationId))) {
      return NextResponse.json(
        { error: "Vorgang nicht gefunden" },
        { status: 404 }
      );
    }

    // Uebergaenge (Entscheidung 21.09.2026):
    //   REVIEWED  nur, wenn der Vorgang bereit zur Pruefung ist — Fragebogen
    //             eingereicht und, falls ein Vorgesetzten-Link besteht, auch
    //             die Modalitaeten. Frueher liess der Server jeden Uebergang
    //             zu; nur die Oberflaeche schraenkte den Knopf ein, und im
    //             festhaengenden Fall zeigte sie ihn trotz fehlendem Fragebogen.
    //   COMPLETED nur aus REVIEWED — und bei offenen Ausstattungs- oder
    //             Hinweis-Aufgaben nur mit `bestaetigt` (E-A19, unten in der
    //             Transaktion).
    //   EXPIRED   jederzeit (HR zieht einen Vorgang zurueck); setzt
    //             `expiredAt` (F12: die Loeschfrist der Freitexte zaehlt ab
    //             dort — `updatedAt` bewegt sich, das AuditLog wird aufgeraeumt).
    const jetzt = new Date();
    let data: Prisma.OnboardingProcessUncheckedUpdateManyInput;
    if (status === "REVIEWED") {
      const grund = pruefungNichtMoeglichGrund(existing);
      if (grund) {
        return NextResponse.json({ error: grund }, { status: 409 });
      }
      data = { status, reviewedAt: jetzt, reviewedById: session.userId };
    } else if (status === "COMPLETED") {
      if (existing.status !== "REVIEWED") {
        return NextResponse.json(
          {
            error:
              "Ein Vorgang kann erst abgeschlossen werden, wenn er als geprüft markiert ist.",
          },
          { status: 409 }
        );
      }
      data = { status, completedAt: jetzt };
    } else {
      if (existing.status === "EXPIRED") {
        return NextResponse.json(
          { error: "Der Vorgang ist bereits als abgelaufen markiert." },
          { status: 409 }
        );
      }
      data = { status, expiredAt: jetzt };
    }

    // Bedingt schreiben statt `update`: Zwischen dem Lesen oben und hier kann
    // die Fuehrungskraft absenden, HR einen Vorgesetzten-Link erzeugen oder ein
    // zweiter Tab den Status aendern. Das WHERE haelt genau die Felder fest,
    // auf denen die Pruefung oben beruht — hat sich eines davon bewegt, wird
    // nichts geschrieben (409), statt eine veraltete Entscheidung
    // festzuschreiben. Status und Protokoll gehoeren in denselben Commit.
    try {
      await prisma.$transaction(async (tx) => {
        const geschrieben = await tx.onboardingProcess.updateMany({
          where: {
            id,
            status: existing.status,
            submittedAt: existing.submittedAt,
            supervisorSubmittedAt: existing.supervisorSubmittedAt,
            supervisorToken: existing.supervisorToken,
          },
          data,
        });
        if (geschrieben.count === 0) throw new VorgangGeaendert();

        // E-A19: Offene Ausstattungs- und Hinweis-Aufgaben frieren mit dem
        // Abschluss ein (der Link ist danach nur lesbar). Gezaehlt wird NACH
        // dem bedingten Update: Es sperrt den Vorgang, und jeder Anleger von
        // Ausstattungsaufgaben (F4) wie der Link-PATCH der Stelle (Abhaken,
        // Wiederoeffnen; `oeffentlichAendern`) sperrt ihn zuerst, bedingt auf
        // „laufend“ — zwischen Zaehlen und Commit kommt also keine neue und
        // keine wieder geoeffnete hinzu, und danach scheitern beide am
        // Endstatus. Entfallene sind `isCompleted` (F2) und zaehlen nicht.
        // Ohne Bestaetigung rollt die Ausnahme den Statuswechsel zurueck.
        let offeneAusstattung = 0;
        if (status === "COMPLETED") {
          const offen = await tx.checklistItem.findMany({
            where: { onboardingId: id, herkunft: { not: null }, isCompleted: false },
            select: { title: true, assignee: true },
            orderBy: [{ orderIndex: "asc" }, { category: "asc" }],
          });
          if (offen.length > 0 && bestaetigt !== true) throw new AusstattungOffen(offen);
          offeneAusstattung = offen.length;
        }

        await tx.auditLog.create({
          data: {
            onboardingId: id,
            userId: session.userId || null,
            action: "STATUS_CHANGED",
            details: {
              from: existing.status,
              to: status,
              // Mit Bestaetigung abgeschlossen: wie viele Ausstattungsaufgaben offen blieben.
              ...(offeneAusstattung > 0 ? { offeneAusstattung } : {}),
            },
          },
        });
      });
    } catch (error) {
      if (error instanceof AusstattungOffen) {
        // Titel und Stelle wie in der Karte (Stelle am Arbeitsort) — nie
        // Bemerkung, Angabe oder Hinweistext.
        const offen = abschlussOffeneAufgaben({
          aufgaben: error.offen,
          arbeitsortId: onboardingEmpfaengerEinrichtung(existing),
          konfigs: await konfigsLaden(),
        });
        return NextResponse.json(
          { error: abschlussOffenMeldung(offen.length), grund: ABSCHLUSS_AUSSTATTUNG_OFFEN, offen },
          { status: 409 },
        );
      }
      if (!(error instanceof VorgangGeaendert)) throw error;
      return NextResponse.json(
        {
          error:
            "Der Vorgang wurde gerade geändert. Bitte laden Sie die Seite neu und versuchen Sie es erneut.",
        },
        { status: 409 }
      );
    }

    const updated = await prisma.onboardingProcess.findUnique({
      where: { id },
      include: { organization: true },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Fehler beim Aktualisieren des Vorgangs:", error);
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}
