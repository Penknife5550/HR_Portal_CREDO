/**
 * API: /api/offboarding/:id
 *
 * GET   – Einzelnen Offboarding-Vorgang mit allen Details abrufen, dazu die
 *         Abteilungsuebersicht (Karte "Aufgaben für Abteilungen", Urheber der
 *         Haekchen, wirksame Fuehrungskraft) aus abteilungsUebersichtLaden und
 *         seit A4 (S28) das Feld `rueckgaben` (Reiter „Rückgaben“: zugeordnete
 *         Einstellung, Lage, Hinweis „Einstellung zuordnen …“; seit S29 auch
 *         Tabelle, Sperraufgaben, Vorschlag, Rueckfrage „Lösen …“, Stepper und
 *         Rueckgabeprotokoll) aus rueckgabenUebersichtLaden — nur fuer
 *         HR_EDIT_ROLES, sonst `null` ohne eine Abfrage (G23). Die hier schon
 *         geladenen Listen (Rueckgaben, Aufgaben, Links, Dokumente) nimmt der
 *         Dienst mit, statt sie erneut zu lesen.
 * PATCH – Vorgang aktualisieren (Status, Termine, Fuehrungskraft etc.).
 *         Seit A4 (S31, G18) der Abschluss mit Warnung: COMPLETED laeuft in
 *         EINER Transaktion – Sperre per bedingtem `updateMany` auf den
 *         gelesenen Status (0 Treffer → 409 INZWISCHEN_GEAENDERT), Zaehlung der
 *         offenen Rueckgaben (`offeneRueckgabenZaehlenIn`), ohne `bestaetigt`
 *         und mit offenen Stuecken 409 `{ error, grund: "RUECKGABEN_OFFEN",
 *         offen: [{ titel, stelle }] }` samt Rollback, erst DANACH der
 *         `exitData`-Upsert, das Update, ein neuer letzter Arbeitstag und die
 *         Loeschfrist der offen gebliebenen Ausgaben
 *         (`offeneAusgabenAbschliessenIn`); Protokoll `offeneRueckgaben`
 *
 * Mandant: Ein Vorgang eines fremden Mandanten bekommt in BEIDEN Methoden
 * dieselbe 404 mit demselben Text wie ein unbekannter.
 */

import type { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { decrypt, encrypt } from "@/lib/encryption";
import { triggerWebhooks } from "@/lib/webhooks";
import { offboardingMailFelder } from "@/lib/offboarding-mail";
import { updateOffboardingSchema } from "@/lib/validations/offboarding";
import { canAccessProcess, PORTAL_ROLES, HR_EDIT_ROLES, FINANCIAL_ROLES } from "@/lib/permissions";
import { MELDUNGEN, adresseGleich, ohneLinkSchluessel } from "@/lib/abteilungsaufgaben";
import {
  abteilungsUebersichtLaden,
  faelligkeitenVerschieben,
  fuehrungskraftAdresseFreigegeben,
  letztenArbeitstagSperren,
} from "@/lib/abteilungsaufgaben-dienst";
import { offeneRueckgabenZaehlenIn, rueckgabenUebersichtLaden } from "@/lib/offboarding-ausgaben";
import { offeneAusgabenAbschliessenIn } from "@/lib/ausgaben-schreiben";
import { MELDUNGEN_AUSGABEN, type OffeneRueckgabe } from "@/lib/ausgaben";

/** Gleicher Text fuer "gibt es nicht" und "fremder Mandant". */
const NICHT_GEFUNDEN = "Vorgang nicht gefunden";

// Gueltige Status-Uebergaenge
const VALID_TRANSITIONS: Record<string, string[]> = {
  INITIATED: ["NOTICE_PERIOD", "CANCELLED"],
  NOTICE_PERIOD: ["HANDOVER_PHASE", "CANCELLED"],
  HANDOVER_PHASE: ["FINAL_SETTLEMENT", "CANCELLED"],
  FINAL_SETTLEMENT: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

// =============================================
// GET /api/offboarding/:id
// =============================================
export async function GET(
  _request: NextRequest,
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
    if (!PORTAL_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    }

    const { id } = await params;

    // Datenzuschnitt je Rolle. GET bleibt bei PORTAL_ROLES — die Ansicht ist
    // ausdruecklich auch zum Lesen gebaut (`canEdit`, `NUR_HR_TABS`), eine
    // Beschraenkung auf HR_EDIT_ROLES wuerde diesen Zugang zerstoeren. Was
    // einzelne Rollen nicht sehen sollen, faellt deshalb FELDWEISE weg.
    //
    // Befund vom 16.10.2026 (adversarische Durchsicht des Verbeamtungs-Fixes):
    // Die Antwort ging bis dahin ungeschnitten an alle PORTAL_ROLES.
    const darfHrSehen = HR_EDIT_ROLES.includes(session.role);
    const darfGeldSehen = FINANCIAL_ROLES.includes(session.role);

    const offboarding = await prisma.offboardingProcess.findUnique({
      where: { id },
      include: {
        organization: true,
        exitData: true,
        checklistItems: {
          orderBy: [{ orderIndex: "asc" }, { category: "asc" }],
        },
        returnItems: true,
        documents: true,
        // Die internen Notizen bleiben fuer alle sichtbar, die den Vorgang
        // oeffnen duerfen — samt Urheber. Entscheidung des
        // Projektverantwortlichen vom 16.10.2026 („die Fuehrungskraft darf
        // mitlesen"), nachdem die Durchsicht sie als moegliches Versehen
        // gemeldet hatte: Der Reiter „Notizen" steht bewusst NICHT in
        // `NUR_HR_TABS`. Geprueft und so gewollt — bitte nicht beim naechsten
        // Review erneut als Befund melden.
        notes: {
          include: {
            createdBy: {
              select: { firstName: true, lastName: true },
            },
          },
          orderBy: { createdAt: "desc" },
        },
        departmentLinks: true,
        // Protokoll nur fuer HR_EDIT_ROLES, wie in /api/civil-service/[id] und
        // /api/contract-end/[id]. Die Offboarding-Ansicht hat gar keinen
        // Protokoll-Reiter — es war reine Fracht in der Antwort. Die Schranke
        // sitzt in der ABFRAGE: Die Zeilen verlassen die Datenbank nicht.
        ...(darfHrSehen
          ? {
              auditLogs: {
                orderBy: { createdAt: "desc" as const },
                take: 20,
              },
            }
          : {}),
        // Rueckfall-Quellen der Fuehrungskraft (fuehrungskraftErmitteln):
        // nur die Adress-Felder, nicht die ganze Bewertung.
        zeugnisBewertung: { select: { supervisorEmail: true, supervisorName: true } },
        contractEnd: { select: { supervisorEmail: true } },
      },
    });

    // Fremder Mandant = unbekannter Vorgang (frueher 403 mit eigenem Text —
    // der verriet, dass es den Vorgang gibt).
    if (!offboarding || !(await canAccessProcess(session, offboarding.organizationId))) {
      return NextResponse.json(
        { error: NICHT_GEFUNDEN },
        { status: 404 }
      );
    }

    // Sensible Felder entschluesseln — die Abfindung nur fuer FINANCIAL_ROLES.
    //
    // Sie ist mit AES-256-GCM verschluesselt wie IBAN, SV-Nummer und
    // Steuer-ID, und das Portal entschluesselt solche Felder sonst nur mit
    // ausdruecklichem Anlass. Bis zum 16.10.2026 wurde sie hier fuer JEDE
    // Portal-Rolle entschluesselt — auch fuer VORGESETZTER, der in
    // `FINANCIAL_ROLES` bewusst nicht steht. Entscheidung des
    // Projektverantwortlichen vom 16.10.2026: die Liste anwenden. Das ist ihre
    // ERSTE Verwendung im Code; sie war bis dahin nur eine Absicht.
    //
    // Ohne das Recht faellt das Feld GANZ weg (nicht als leerer Text): Ein
    // leerer Wert liesse sich nicht von „keine Abfindung vereinbart"
    // unterscheiden, und die Oberflaeche zeigt dann „—".
    if (offboarding.exitData?.severancePay) {
      if (darfGeldSehen) {
        offboarding.exitData.severancePay = decrypt(
          offboarding.exitData.severancePay
        );
      } else {
        offboarding.exitData.severancePay = null;
      }
    }

    // Abteilungsuebersicht darueber legen: departmentLinks bekommen `url`
    // (vom Server, APP_URL — der Kopier-Knopf baut sie nicht mehr selbst) und
    // `anzeige`, checklistItems bekommen `erledigtVon`, dazu `abteilungen`
    // (Quelle der Karte, auch nicht informierte und uebersprungene
    // Abteilungen) und `fuehrungskraft` (wirksame Adresse samt Quelle).
    //
    // `rueckgaben` (A4, G23): Einstellung, Lage und Vorschlaege nur fuer
    // HR_EDIT_ROLES — Einrichtungsleitung und Fuehrungskraft bekommen `null`,
    // und es wird dafuer nichts abgefragt.
    //
    // Die Aufgaben-Links der Abteilungen sind Zugaenge OHNE Anmeldung. Ohne
    // HR_EDIT_ROLES nimmt `ohneLinkSchluessel` sie aus der Uebersicht — an
    // allen drei Stellen, an denen der Schluessel steckt (Spalte `token`,
    // `departmentLinks[].url`, `abteilungen.zeilen[].link.url`). Der STAND
    // bleibt sichtbar: informiert, geoeffnet, Faelligkeiten, Zaehler.
    const uebersicht = await abteilungsUebersichtLaden(offboarding);
    return NextResponse.json({
      ...offboarding,
      ...(darfHrSehen ? uebersicht : ohneLinkSchluessel(uebersicht)),
      rueckgaben: await rueckgabenUebersichtLaden(offboarding, session),
    });
  } catch (error) {
    console.error("Fehler beim Laden des Offboarding-Vorgangs:", error);
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}

// =============================================
// PATCH /api/offboarding/:id – Vorgang aktualisieren
// =============================================

/**
 * Abschluss (G18): Zwischen dem Lesen und der Sperre hat sich der Status
 * bewegt. Eigene Klasse, weil nur eine Ausnahme die Transaktion zurueckrollt.
 */
class AustrittGeaendert extends Error {}

/**
 * Abschluss ohne Bestaetigung, obwohl Rueckgaben, Sperr- oder Folgeaufgaben
 * offen sind (G18, E-A33: Abschluss mit Warnung, nicht gesperrt). Die
 * Ausnahme rollt die Sperre zurueck und traegt die gezaehlte Liste hinaus.
 */
class RueckgabenOffen extends Error {
  constructor(readonly offen: OffeneRueckgabe[]) {
    super("RUECKGABEN_OFFEN");
  }
}

/** Erlaubte Felder der Austrittsdaten (`exitData`) und ihre Art. */
const EXIT_FELDER: Record<string, "float" | "string" | "boolean" | "date"> = {
  remainingVacationDays: "float",
  vacationPayout: "float",
  overtimeHours: "float",
  overtimePayout: "float",
  severancePay: "string",
  certificateType: "string",
  certificateStatus: "string",
  svDeregistrationDone: "boolean",
  svDeregistrationDate: "date",
  employmentCertDone: "boolean",
  employmentCertDate: "date",
  nonCompeteClause: "boolean",
  knowledgeTransferPlan: "boolean",
  successorName: "string",
  handoverDocComplete: "boolean",
  employmentType: "string",
  tarifvertrag: "string",
  entgeltgruppe: "string",
  isBefristet: "boolean",
};

/**
 * Die Austrittsdaten aus dem Body, fertig fuer den Upsert (Abfindung
 * verschluesselt); `null`, wenn nichts zu schreiben ist. Schreibt selbst
 * nichts – geschrieben wird je nach Zweig vor jeder Transaktion bzw. beim
 * Abschluss erst nach Sperre und Zaehlung (G18).
 */
function exitDatenFelder(bodyExitData: Record<string, unknown> | undefined): Record<string, unknown> | null {
  if (!bodyExitData || typeof bodyExitData !== "object") return null;
  const exitFields: Record<string, unknown> = {};
  for (const [key, type] of Object.entries(EXIT_FELDER)) {
    const value = bodyExitData[key];
    if (value === undefined) continue;

    switch (type) {
      case "float":
        if (value !== null && typeof value === "number") {
          exitFields[key] = value;
        } else if (value === null) {
          exitFields[key] = null;
        }
        break;
      case "boolean":
        if (typeof value === "boolean") {
          exitFields[key] = value;
        }
        break;
      case "date":
        if (value !== null && value !== "") {
          exitFields[key] = new Date(value as string | number);
        } else if (value === null) {
          exitFields[key] = null;
        }
        break;
      case "string":
        if (value !== null) {
          exitFields[key] = String(value);
        } else {
          exitFields[key] = null;
        }
        break;
    }
  }

  // Abfindungsbetrag verschluesseln
  if (exitFields.severancePay && typeof exitFields.severancePay === "string") {
    exitFields.severancePay = encrypt(exitFields.severancePay as string);
  }
  return Object.keys(exitFields).length > 0 ? exitFields : null;
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
    const body = await request.json().catch(() => null);
    const parsed = updateOffboardingSchema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.errors[0];
      return NextResponse.json({ error: firstError.message }, { status: 400 });
    }

    const {
      status,
      exitType,
      lastWorkingDay,
      exitReason,
      contractEndDate,
      noticePeriodEnd,
      noticeDate,
      employeeFirstName,
      employeeLastName,
      employeePrivateEmail,
      employeePersonalNr,
      exitData: exitDataFromBody,
      supervisorEmail,
      supervisorName,
      bestaetigt,
    } = parsed.data;
    const jetzt = new Date();

    // Vorgang pruefen — mit den Adressen der Fuehrungskraft, die das Portal
    // schon kennt (Zeugnis-Bewertung, Vertragsende): Sie sind fuer die
    // Freigabepruefung unten immer erlaubt.
    const existing = await prisma.offboardingProcess.findUnique({
      where: { id },
      include: {
        zeugnisBewertung: { select: { supervisorEmail: true } },
        contractEnd: { select: { supervisorEmail: true } },
      },
    });
    if (!existing || !(await canAccessProcess(session, existing.organizationId))) {
      return NextResponse.json(
        { error: NICHT_GEFUNDEN },
        { status: 404 }
      );
    }

    // Status-Uebergang validieren
    // SUPER_ADMIN + HR_LEITUNG duerfen COMPLETED/CANCELLED direkt setzen
    const ADMIN_OVERRIDE_ROLES = ["SUPER_ADMIN", "HR_LEITUNG"];
    const isAdminOverride = ADMIN_OVERRIDE_ROLES.includes(session.role) &&
      (status === "COMPLETED" || status === "CANCELLED");

    if (status && !isAdminOverride) {
      const allowedTransitions = VALID_TRANSITIONS[existing.status];
      if (!allowedTransitions) {
        return NextResponse.json(
          {
            error: `Status "${existing.status}" kann nicht geaendert werden`,
          },
          { status: 400 }
        );
      }
      if (!allowedTransitions.includes(status)) {
        return NextResponse.json(
          {
            error: `Ungueltiger Status-Uebergang: "${existing.status}" -> "${status}". Erlaubt: ${allowedTransitions.join(", ") || "keine"}`,
          },
          { status: 400 }
        );
      }
    }

    // Fuehrungskraft: Eine NEUE, frei eingetippte Adresse muss in einer
    // freigegebenen Domain liegen (Einstellungen → SMTP, leere Liste = keine
    // Einschraenkung) — an sie geht ein Link mit Namen und Aufgaben. Bekannte
    // Adressen (bisheriger Wert, Zeugnis-Bewertung, Vertragsende) sind immer
    // erlaubt. Geprueft VOR jedem Schreiben (auch vor exitData).
    if (typeof supervisorEmail === "string" && !adresseGleich(supervisorEmail, existing.supervisorEmail)) {
      const freigegeben = await fuehrungskraftAdresseFreigegeben(supervisorEmail, [
        existing.supervisorEmail,
        existing.zeugnisBewertung?.supervisorEmail,
        existing.contractEnd?.supervisorEmail,
      ]);
      if (!freigegeben) {
        return NextResponse.json(
          { error: MELDUNGEN.FUEHRUNGSKRAFT_NICHT_FREIGEGEBEN },
          { status: 409 }
        );
      }
    }

    // Neuer letzter Arbeitstag? Das Schema laesst nur echte Kalenderdaten im
    // Format "YYYY-MM-DD" durch (→ UTC-Mitternacht wie bei der Anlage), die
    // Differenz ist also eine ganze Zahl von Tagen.
    const neuerLetzterTag = lastWorkingDay ? new Date(lastWorkingDay) : null;

    // Update-Daten zusammenbauen
    const updateData: Record<string, unknown> = {};
    if (status) updateData.status = status;
    if (exitType) updateData.exitType = exitType;
    if (neuerLetzterTag) updateData.lastWorkingDay = neuerLetzterTag;
    // null loescht (Schema: "" oder null → null), undefined = unveraendert.
    if (supervisorEmail !== undefined) updateData.supervisorEmail = supervisorEmail;
    if (supervisorName !== undefined) updateData.supervisorName = supervisorName;
    if (exitReason !== undefined) updateData.exitReason = exitReason;
    if (employeeFirstName !== undefined) updateData.employeeFirstName = employeeFirstName;
    if (employeeLastName !== undefined) updateData.employeeLastName = employeeLastName;
    if (employeePrivateEmail !== undefined) updateData.employeePrivateEmail = employeePrivateEmail || null;
    if (employeePersonalNr !== undefined) updateData.employeePersonalNr = employeePersonalNr || null;
    if (contractEndDate)
      updateData.contractEndDate = new Date(contractEndDate);
    if (noticePeriodEnd)
      updateData.noticePeriodEnd = new Date(noticePeriodEnd);
    if (noticeDate) updateData.noticeDate = new Date(noticeDate);

    // Bei COMPLETED: completedAt setzen – zugleich der Anker der Loeschfrist
    // offen gebliebener Ausgaben (G18).
    if (status === "COMPLETED") {
      updateData.completedAt = jetzt;
    }

    const exitFields = exitDatenFelder(exitDataFromBody);
    const exitDataSchreiben = (db: Prisma.TransactionClient, felder: Record<string, unknown>) =>
      db.offboardingExitData.upsert({
        where: { offboardingId: id },
        create: {
          offboardingId: id,
          ...felder,
        },
        update: felder,
      });
    const aktualisieren = (db: Prisma.TransactionClient) =>
      db.offboardingProcess.update({
        where: { id },
        data: updateData,
        include: { organization: true },
      });
    type Ergebnis = {
      updated: Awaited<ReturnType<typeof aktualisieren>>;
      verschiebung: Awaited<ReturnType<typeof faelligkeitenVerschieben>> | null;
      alterTag: Date | null;
      offeneRueckgaben: number;
    };

    // Letzter Arbeitstag im Body: Die offenen Faelligkeiten ruecken um dieselbe
    // Spanne mit, Links, die vor dem neuen "gültig bis" abliefen, werden
    // verlaengert (gleicher Token) — in DERSELBEN Transaktion wie das neue
    // Datum, sonst stuenden Tag und Fristen kurz auseinander.
    //
    // Der bisherige Tag wird UNTER der Zeilensperre gelesen, nicht aus
    // `existing` von oben: Zwei gleichzeitige PATCHes mit demselben Datum
    // (Doppel-Enter, zwei HR-Konten) laesen dort beide noch den alten Tag, und
    // der zweite verschoebe die Faelligkeiten ein zweites Mal. Deshalb auch
    // bei scheinbar gleichem Tag durch die Transaktion — der Stand von oben
    // kann schon veraltet sein. Ohne lastWorkingDay und ohne Abschluss bleibt
    // es beim einfachen update wie bisher.
    //
    // Abschluss (A4, G18): COMPLETED laeuft IMMER in einer Transaktion, in
    // dieser Reihenfolge –
    //   1. ein neuer letzter Arbeitstag: `letztenArbeitstagSperren` zuerst;
    //   2. Sperre per bedingtem `updateMany` auf den GELESENEN Status – 0
    //      Treffer → 409 (ein zweiter Abschluss oder ein Abbruch kam
    //      dazwischen);
    //   3. offene Rueckgaben zaehlen, Stueck fuer Stueck. Jeder Weg, der eine
    //      Rueckgabe-Zeile oder Ausgabe-Aufgabe umschaltet (Link, Portal,
    //      Reiter), sperrt den Austritt zuerst – ohne diese Sperre rutschte
    //      ein „wieder öffnen“ zwischen Zaehlen und Commit durch;
    //   4. ohne `bestaetigt` und mit offenen Stuecken: Ausnahme, Rollback, 409
    //      (Abschluss mit Warnung, nicht gesperrt);
    //   5. erst JETZT `exitData` – nach einer Rueckfrage ist nichts geschrieben
    //      (bei allen anderen PATCHes steht der Upsert wie bisher davor);
    //   6. das Update, die Faelligkeiten, dann die Loeschfrist der offen
    //      gebliebenen Ausgaben (G24: Austritt → Links → Aufgaben → Ausgaben).
    if (exitFields && status !== "COMPLETED") {
      await exitDataSchreiben(prisma, exitFields);
    }

    let ergebnis: Ergebnis;
    if (status === "COMPLETED") {
      try {
        ergebnis = await prisma.$transaction(async (tx): Promise<Ergebnis> => {
          const alt = neuerLetzterTag
            ? ((await letztenArbeitstagSperren(tx, id)) ?? existing.lastWorkingDay)
            : null;
          const gesperrt = await tx.offboardingProcess.updateMany({
            where: { id, status: existing.status },
            data: { updatedAt: jetzt },
          });
          if (gesperrt.count === 0) throw new AustrittGeaendert();

          const offen = await offeneRueckgabenZaehlenIn(tx, id);
          if (offen.length > 0 && bestaetigt !== true) throw new RueckgabenOffen(offen);

          if (exitFields) await exitDataSchreiben(tx, exitFields);
          const u = await aktualisieren(tx);
          const f =
            alt && neuerLetzterTag && alt.getTime() !== neuerLetzterTag.getTime()
              ? await faelligkeitenVerschieben(tx, id, alt, neuerLetzterTag)
              : null;
          await offeneAusgabenAbschliessenIn(tx, { offboardingId: id, abgeschlossenAm: jetzt, userId: session.userId });
          return { updated: u, verschiebung: f, alterTag: alt, offeneRueckgaben: offen.length };
        });
      } catch (error) {
        if (error instanceof RueckgabenOffen) {
          // Titel und Stelle wie im Reiter – nie Kennung, Notiz oder Zustandstext.
          return NextResponse.json(
            {
              error: MELDUNGEN_AUSGABEN.RUECKGABEN_OFFEN(error.offen.length),
              grund: "RUECKGABEN_OFFEN",
              offen: error.offen,
            },
            { status: 409 },
          );
        }
        if (error instanceof AustrittGeaendert) {
          return NextResponse.json(
            { error: MELDUNGEN_AUSGABEN.INZWISCHEN_GEAENDERT, grund: "INZWISCHEN_GEAENDERT" },
            { status: 409 },
          );
        }
        throw error;
      }
    } else if (neuerLetzterTag) {
      ergebnis = await prisma.$transaction(async (tx): Promise<Ergebnis> => {
        const alt = (await letztenArbeitstagSperren(tx, id)) ?? existing.lastWorkingDay;
        const u = await aktualisieren(tx);
        const f =
          alt.getTime() !== neuerLetzterTag.getTime()
            ? await faelligkeitenVerschieben(tx, id, alt, neuerLetzterTag)
            : null;
        return { updated: u, verschiebung: f, alterTag: alt, offeneRueckgaben: 0 };
      });
    } else {
      ergebnis = { updated: await aktualisieren(prisma), verschiebung: null, alterTag: null, offeneRueckgaben: 0 };
    }
    const { updated, verschiebung, alterTag, offeneRueckgaben } = ergebnis;

    // Audit-Log
    const auditDetails: Record<string, unknown> = {};
    if (status) {
      auditDetails.statusFrom = existing.status;
      auditDetails.statusTo = status;
    }
    if (exitType) auditDetails.exitType = exitType;
    if (lastWorkingDay) auditDetails.lastWorkingDay = lastWorkingDay;
    if (exitReason !== undefined) auditDetails.exitReason = exitReason;
    if (contractEndDate) auditDetails.contractEndDate = contractEndDate;
    if (noticePeriodEnd) auditDetails.noticePeriodEnd = noticePeriodEnd;
    if (noticeDate) auditDetails.noticeDate = noticeDate;

    // Adressaenderung MIT Vorher und Nachher — die Gegenprobe zur
    // Empfaenger-Freigabe.
    //
    // Die Freigaberegel (src/lib/empfaenger-freigabe.ts) laesst die im Vorgang
    // hinterlegte Adresse IMMER durch, auch wenn ihre Domain nicht auf der
    // Liste steht. Das ist Absicht — der Regelfall beim Ausscheiden ist eine
    // private Freemail-Adresse — und stuetzt sich ausdruecklich darauf, dass
    // eine Aenderung dieser Adresse "eine eigene, protokollpflichtige Handlung
    // an anderer Stelle" ist. Diese Stelle ist hier.
    //
    // Ohne den Eintrag waere die Liste mit zwei Aufrufen zu umgehen: private
    // Adresse auf die eigene setzen -> Dokumentenpaket versenden (die Freigabe
    // greift nicht, weil Ziel == Vorgangsadresse) -> Adresse zuruecksetzen.
    // Der Versandnachweis vermerkt dabei sogar "empfaengerAbweichend: false".
    //
    // Das VORHER gehoert zwingend dazu: Wer die Adresse zuruecksetzt,
    // hinterliesse sonst zwei Eintraege, die beide die richtige Adresse
    // zeigen — und damit einen Nachweis, der genau das Gegenteil belegt.
    //
    // Die Adresse selbst ist ein Personendatum. Sie steht trotzdem im
    // Protokoll, weil ein Eintrag ohne sie nichts belegen kann; das AuditLog
    // fuehrt an anderer Stelle bereits Adressen (Cron-Erinnerungen,
    // Vorgesetzten-Links). Es gilt dieselbe Aufbewahrung wie fuer den
    // uebrigen Log-Bestand.
    //
    // Nur employeePrivateEmail ist hier aenderbar; employeeEmail nimmt
    // updateOffboardingSchema gar nicht erst an (und keine andere Route
    // schreibt es). Kaeme es dazu, gehoert es nach demselben Muster hierher.
    if (employeePrivateEmail !== undefined) {
      // Exakt so normalisiert wie oben in updateData: "" wird zu null. Sonst
      // meldete das Protokoll ein "" -> null als Aenderung, das keine ist.
      const neuePrivatadresse = employeePrivateEmail || null;
      if (neuePrivatadresse !== existing.employeePrivateEmail) {
        auditDetails.employeePrivateEmailFrom = existing.employeePrivateEmail;
        auditDetails.employeePrivateEmailTo = neuePrivatadresse;
      }
    }

    // Fuehrungskraft: Vorher und Nachher, nur bei echter Aenderung — aus
    // demselben Grund wie bei der Privatadresse: An diese Adresse gehen Links
    // mit Namen und Aufgaben, der Wechsel muss nachvollziehbar sein.
    if (supervisorEmail !== undefined && supervisorEmail !== existing.supervisorEmail) {
      auditDetails.supervisorEmailFrom = existing.supervisorEmail;
      auditDetails.supervisorEmailTo = supervisorEmail;
    }
    if (supervisorName !== undefined && supervisorName !== existing.supervisorName) {
      auditDetails.supervisorNameFrom = existing.supervisorName;
      auditDetails.supervisorNameTo = supervisorName;
    }
    if (verschiebung && alterTag) {
      // Der Tag VOR der Aenderung (unter der Sperre gelesen) — ohne ihn liesse
      // sich die Verschiebung im Protokoll nicht nachrechnen.
      auditDetails.lastWorkingDayFrom = alterTag.toISOString().slice(0, 10);
      auditDetails.faelligkeitenVerschoben = verschiebung.verschoben;
      auditDetails.linksVerlaengert = verschiebung.verlaengert;
    }
    // Abschluss mit Bestaetigung (G18): wie viele Rueckgaben, Sperr- und
    // Folgeaufgaben offen blieben – nur die Zahl, nie Titel oder Kennung.
    if (offeneRueckgaben > 0) {
      auditDetails.offeneRueckgaben = offeneRueckgaben;
    }

    await prisma.auditLog.create({
      data: {
        offboardingId: id,
        userId: session.userId,
        processType: "OFFBOARDING",
        action: status ? "STATUS_CHANGED" : "OFFBOARDING_UPDATED",
        details: auditDetails as Prisma.InputJsonObject,
      },
    });

    // Webhook bei COMPLETED.
    //
    // Die Vorlage nennt Name, Austrittsdatum und Einrichtung. Das
    // Austrittsdatum fehlte hier bisher ganz, und {{vorname}} / {{nachname}}
    // gab es unter keinem Namen — die Abschlussmeldung an HR lautete
    // "Offboarding abgeschlossen:  ". Die gemeinsamen Felder kommen jetzt aus
    // offboardingMailFelder, wie bei allen Offboarding-Mails.
    //
    // Offene Aufgaben beim Abschluss: SUPER_ADMIN/HR_LEITUNG duerfen auch mit
    // offener Checkliste abschliessen. Die Vorlage behauptete frueher pauschal
    // "Alle Aufgaben sind erledigt" — jetzt nennt sie die Zahl nur, wenn
    // wirklich etwas offen ist (Bedingungsblock, leerer Wert = kein Hinweis).
    // Ein Fehler beim Zaehlen darf den Abschluss nicht aufhalten.
    if (status === "COMPLETED") {
      let offeneAufgaben: number | undefined = 0;
      try {
        offeneAufgaben = await prisma.offboardingChecklistItem.count({
          where: { offboardingId: id, isCompleted: false },
        });
      } catch {
        offeneAufgaben = 0;
      }
      await triggerWebhooks("offboarding-completed", {
        ...offboardingMailFelder(updated),
        employeeEmail: updated.employeeEmail,
        completedAt: updated.completedAt?.toISOString(),
        offene_aufgaben_beim_abschluss:
          typeof offeneAufgaben === "number" && offeneAufgaben > 0
            ? String(offeneAufgaben)
            : "",
      });
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Fehler beim Aktualisieren des Offboarding-Vorgangs:", error);
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}
