/**
 * CREDO HR-Portal – Abteilungsaufgaben im Onboarding (Paket 5, nur Server)
 *
 * Der Onboarding-Adapter fuer den gemeinsamen Versandkern
 * (src/lib/abteilungsaufgaben-dienst.ts): Er laedt den Onboarding-Vorgang,
 * prueft die Voraussetzung, setzt die Faelligkeiten und baut das
 * `VersandModul` (Mailfelder, Fuehrungskraft, Zusatzfelder je Schluessel).
 * Versand, Erinnerungsstufen, Sperren und Versandbericht sind DERSELBE Code
 * wie im Offboarding. Abhaken ueber den Link und im Portal steht in
 * src/lib/abteilungsaufgaben-uebergaenge.ts.
 *
 * Wer ruft was:
 *   POST /api/onboarding/[id]/abteilungen        → onboardingAbteilungsAktionAusfuehren
 *   GET  /api/onboarding/[id]/abteilungen        → onboardingAbteilungenLaden
 *   GET  /api/onboarding/[id]                    → onboardingAbteilungsUebersichtLaden
 *   POST /api/modalitaeten/[token] (nach Commit) → faelligkeitenSetzen
 *   POST /api/cron/reminders (Abschnitt 3)       → onboardingErinnerungenSenden
 *
 * DIE REGELN DES ONBOARDINGS (Entscheidungen 22.09.2026):
 *   - Ausloeser ist NUR der Knopf von HR (HR_EDIT_ROLES). Nichts passiert
 *     automatisch — nicht beim Anlegen, nicht bei der Abgabe der Modalitaeten,
 *     nicht beim Statuswechsel.
 *   - Voraussetzung: die Einstellungsmodalitaeten sind EINGEREICHT
 *     (onboardingVersandSperre). Ein per Autosave zwischengespeicherter
 *     Vertragsbeginn zaehlt nicht. Ohne Modalitaeten bleibt der Versand
 *     gesperrt — ein Ersatzdatum gibt es nicht.
 *   - Faelligkeiten EINMAL: Vertragsbeginn + relativeDueDays (faelligkeitAus),
 *     nur fuer Aufgaben ohne Faelligkeit — von Hand gesetzte bleiben. Punkte
 *     ohne Tagesangabe bleiben ohne Faelligkeit und ohne Erinnerung. Nach der
 *     Abgabe aendert sich der Vertragsbeginn nicht mehr (auth.ts sperrt den
 *     Modalitaeten-Link), also muss nichts nachgerechnet werden.
 *   - Empfaenger: VORGESETZTER an OnboardingProcess.supervisorEmail (die
 *     Adresse, die den Modalitaeten-Link bekam), alle anderen an
 *     DepartmentConfig (Einrichtung vor zentral). HR/MITARBEITER nie.
 *   - COMPLETED: Link nur lesend, keine Erinnerung, kein Versand (409).
 *     EXPIRED: Link 410 „Dieser Vorgang ist nicht mehr aktiv …", kein Versand.
 *     Offene Abteilungsaufgaben blockieren den Abschluss NICHT.
 *   - Datensparsamkeit: Die Mails bekommen nur onboardingAbteilungsMailFelder
 *     und die Zusatzfelder, die ONBOARDING_ZUSATZFELDER dem Schluessel erlaubt.
 *     Der Vorgang wird mit eigenem select geladen — nie ueber die Detailroute,
 *     die IBAN, SV-Nummer und Steuer-ID entschluesselt.
 */

import type { OffboardingDepartmentLink, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { canAccessProcess, HR_EDIT_ROLES, PORTAL_ROLES, type SessionPayload } from "@/lib/permissions";
import { onboardingAbteilungsMailFelder } from "@/lib/onboarding-abteilung-mail";
import {
  ABTEILUNGS_AUDIT,
  MELDUNGEN,
  ONBOARDING_ENDSTATUS,
  abteilungsZeilenBauen,
  erledigtVonBestimmen,
  faelligkeitAus,
  linkAnzeige,
  onboardingVersandSperre,
  zusatzWerte,
  type AbteilungsUebersichtDaten,
  type Anzeige,
  type DienstAntwort,
  type ErledigtVon,
  type Fuehrungskraft,
} from "@/lib/abteilungsaufgaben";
import { abteilungsAktionSchema } from "@/lib/validations/abteilungsaufgaben";
import {
  aktionMitKontextAusfuehren,
  aufgabenLaden,
  benutzerNamenLaden,
  erinnerungsLauf,
  konfigsLaden,
  modulLinkUrl,
  versandKontextLaden,
  versandSperreFreigeben,
  versandSperreNehmen,
  type CronErgebnis,
  type ErinnerungsLaufStand,
  type VersandKontext,
  type VersandModul,
} from "@/lib/abteilungsaufgaben-dienst";

// =============================================
// Vorgang
// =============================================

/** Ist der Onboarding-Vorgang beendet (COMPLETED oder EXPIRED)? */
export function onboardingVorgangBeendet(status: string): boolean {
  return (ONBOARDING_ENDSTATUS as readonly string[]).includes(status);
}

/**
 * Was Versand, Voraussetzung und Mails vom Onboarding-Vorgang brauchen —
 * und nicht mehr. Bewusst NICHT: `email` (private Adresse der Person),
 * `token`/`supervisorToken`, Fragebogen-Angaben ausser dem Namen, Verguetung,
 * Kostenstellen.
 */
export const ONBOARDING_VERSAND_AUSWAHL = {
  id: true,
  displayId: true,
  organizationId: true,
  status: true,
  firstName: true,
  lastName: true,
  supervisorEmail: true,
  supervisorSubmittedAt: true,
  personalData: { select: { firstName: true, lastName: true } },
  supervisorData: {
    select: { isComplete: true, vertragsbeginn: true, stellenbeschreibung: true, betriebsstaette: true },
  },
  organization: { select: { name: true, mandantNumber: true } },
} satisfies Prisma.OnboardingProcessSelect;

type OnboardingVorgangFuerVersand = Prisma.OnboardingProcessGetPayload<{
  select: typeof ONBOARDING_VERSAND_AUSWAHL;
}>;

/**
 * Die Fuehrungskraft im Onboarding: die Adresse, an die der Modalitaeten-Link
 * ging (OnboardingProcess.supervisorEmail). Einen Namen gibt es nicht.
 */
export function onboardingFuehrungskraft(v: { supervisorEmail?: string | null }): Fuehrungskraft {
  const email = v.supervisorEmail?.trim() || null;
  return { email, name: null, quelle: email ? "VORGANG" : null };
}

function onboardingVersandModul(v: OnboardingVorgangFuerVersand): VersandModul {
  return {
    modul: "ONBOARDING",
    vorgangId: v.id,
    displayId: v.displayId || v.id.substring(0, 8),
    organizationId: v.organizationId,
    fuehrungskraft: onboardingFuehrungskraft(v),
    mailFelder: onboardingAbteilungsMailFelder(v),
    zusatzFelder: (key) =>
      zusatzWerte(key, {
        stellenbezeichnung: v.supervisorData?.stellenbeschreibung,
        betriebsstaette: v.supervisorData?.betriebsstaette,
        fuehrungskraftEmail: v.supervisorEmail,
      }),
  };
}

// =============================================
// Faelligkeiten (einmal)
// =============================================

/**
 * Setzt die Faelligkeiten der Checkliste EINMAL: dueDate = Vertragsbeginn +
 * relativeDueDays (faelligkeitAus) fuer jede Aufgabe OHNE Faelligkeit, die
 * eine Tagesangabe hat. Von Hand gesetzte Faelligkeiten bleiben, Aufgaben ohne
 * Tagesangabe bleiben ohne Faelligkeit. Idempotent: Ein zweiter Aufruf findet
 * nichts mehr.
 *
 * Tut nichts (gesetzt 0), solange die Modalitaeten nicht eingereicht sind oder
 * keinen Vertragsbeginn tragen (onboardingVersandSperre) — ein Entwurfsdatum
 * darf keine Fristen erzeugen.
 *
 * Aufrufer: die Abgabe der Modalitaeten (NACH ihrem Commit, eigener
 * `prisma.$transaction`, Fehler nur loggen — die Abgabe darf daran nicht
 * scheitern) und jede HR-Aktion vor dem Versand (spaetestens beim ersten
 * Informieren). Sperren: nur Aufgabenzeilen; passt zur Reihenfolge
 * Vorgang → Links → Aufgaben.
 *
 * Protokoll: CHECKLIST_DUE_DATES_SET mit Anzahl und Vertragsbeginn, nur wenn
 * etwas gesetzt wurde (im selben Commit).
 */
export async function faelligkeitenSetzen(
  tx: Prisma.TransactionClient,
  onboardingId: string,
  opts: { userId?: string | null } = {},
): Promise<{ gesetzt: number; vertragsbeginn: Date | null }> {
  const v = await tx.onboardingProcess.findUnique({
    where: { id: onboardingId },
    select: {
      id: true,
      status: true,
      supervisorSubmittedAt: true,
      supervisorData: { select: { isComplete: true, vertragsbeginn: true } },
    },
  });
  if (!v || onboardingVersandSperre(v)) return { gesetzt: 0, vertragsbeginn: null };
  const beginn = v.supervisorData?.vertragsbeginn as Date;

  const offen = await tx.checklistItem.findMany({
    where: { onboardingId, dueDate: null, relativeDueDays: { not: null } },
    select: { id: true, relativeDueDays: true },
  });
  // Je Tagesangabe EIN Update (wenige verschiedene Werte je Vorlage).
  const nachTagen = new Map<number, string[]>();
  for (const a of offen) {
    if (a.relativeDueDays == null) continue;
    nachTagen.set(a.relativeDueDays, [...(nachTagen.get(a.relativeDueDays) ?? []), a.id]);
  }
  let gesetzt = 0;
  for (const [tage, ids] of nachTagen) {
    const faellig = faelligkeitAus(beginn, tage);
    if (!faellig) continue;
    const r = await tx.checklistItem.updateMany({
      // dueDate: null im WHERE: Hat HR in der Zwischenzeit von Hand eine
      // Faelligkeit gesetzt, bleibt sie. Eine von Hand ENTFERNTE Frist kommt
      // ebenfalls nicht zurueck — der Portal-PATCH setzt mit `dueDate: null`
      // auch `relativeDueDays` auf null, die Zeile faellt also aus dem
      // WHERE heraus (abteilungsaufgaben-uebergaenge.ts).
      where: { onboardingId, id: { in: ids }, dueDate: null },
      data: { dueDate: faellig },
    });
    gesetzt += r.count;
  }

  if (gesetzt > 0) {
    await tx.auditLog.create({
      data: {
        userId: opts.userId ?? null,
        onboardingId,
        processType: "ONBOARDING",
        action: ABTEILUNGS_AUDIT.FAELLIGKEITEN_GESETZT,
        details: { gesetzt, vertragsbeginn: beginn.toISOString() },
      },
    });
  }
  return { gesetzt, vertragsbeginn: beginn };
}

// =============================================
// Aktionen (POST /api/onboarding/[id]/abteilungen)
// =============================================

/**
 * POST /api/onboarding/[id]/abteilungen — dieselben Aktionen und dieselbe
 * Antwortform wie POST /api/offboarding/[id]/department-links.
 *
 * `rohBody`: das geparste JSON oder `undefined` bei leerem Body (= informieren).
 * Kaputtes JSON faengt die Route vorher ab (400 "Ungültige Eingabe").
 *
 * Antworten (in dieser Reihenfolge):
 *   403 { error: "Keine Berechtigung" }                        Rolle nicht HR_EDIT_ROLES
 *   400 { error }                                              Aktion/Schluessel ungueltig
 *   404 { error: "Vorgang nicht gefunden" }                    unbekannt ODER fremder Mandant
 *   409 { error, grund: "VORGANG_ABGESCHLOSSEN" }              COMPLETED („… abgeschlossen …") / EXPIRED („… abgelaufen …")
 *   409 { error, grund: "MODALITAETEN_FEHLEN" | "VERTRAGSBEGINN_FEHLT" }   Voraussetzung fehlt
 *   409 { error: "Der Versand läuft bereits." }                Sperre je Vorgang
 *   201 | 409 | 502 { data: VersandBericht, meldung, hinweis, error? }
 *
 * Vor jeder Aktion werden die Faelligkeiten gesetzt (einmal, idempotent).
 */
export async function onboardingAbteilungsAktionAusfuehren(opts: {
  onboardingId: string;
  rohBody: unknown;
  session: SessionPayload;
  jetzt?: Date;
}): Promise<DienstAntwort> {
  const jetzt = opts.jetzt ?? new Date();
  if (!HR_EDIT_ROLES.includes(opts.session.role)) {
    return { status: 403, body: { error: "Keine Berechtigung" } };
  }
  const parsed = abteilungsAktionSchema.safeParse(opts.rohBody);
  if (!parsed.success) {
    return { status: 400, body: { error: parsed.error.errors[0]?.message ?? MELDUNGEN.UNGUELTIGE_EINGABE } };
  }
  const aktion = parsed.data;

  const vorgang = await prisma.onboardingProcess.findUnique({
    where: { id: opts.onboardingId },
    select: ONBOARDING_VERSAND_AUSWAHL,
  });
  if (!vorgang || !(await canAccessProcess(opts.session, vorgang.organizationId))) {
    return { status: 404, body: { error: MELDUNGEN.ONBOARDING_VORGANG_NICHT_GEFUNDEN } };
  }
  if (onboardingVorgangBeendet(vorgang.status)) {
    return {
      status: 409,
      body: {
        error: vorgang.status === "EXPIRED" ? MELDUNGEN.HR_VORGANG_ABGELAUFEN : MELDUNGEN.HR_VORGANG_ABGESCHLOSSEN,
        grund: "VORGANG_ABGESCHLOSSEN",
      },
    };
  }
  const sperre = onboardingVersandSperre(vorgang);
  if (sperre) return { status: 409, body: { error: sperre.text, grund: sperre.grund } };

  const modul = onboardingVersandModul(vorgang);
  if (!versandSperreNehmen(modul)) {
    return { status: 409, body: { error: MELDUNGEN.VERSAND_LAEUFT } };
  }
  try {
    await prisma.$transaction((tx) => faelligkeitenSetzen(tx, vorgang.id, { userId: opts.session.userId }));
    const ctx = await versandKontextLaden(modul, jetzt);
    return await aktionMitKontextAusfuehren(ctx, aktion, opts.session.userId);
  } finally {
    // Genau eine Freigabestelle — kein Rueckgabepfad darf die Sperre stehen lassen.
    versandSperreFreigeben(modul);
  }
}

// =============================================
// Uebersicht (Karte, Stepper, Tab Checkliste)
// =============================================

/** Was die Uebersicht vom Vorgang braucht (GET /api/onboarding/[id] laedt mehr). */
export interface OnboardingUebersichtVorgang {
  id: string;
  organizationId: string;
  status: string;
  supervisorEmail?: string | null;
  supervisorSubmittedAt?: Date | null;
  supervisorData?: { isComplete?: boolean | null; vertragsbeginn?: Date | null } | null;
  checklistItems: ReadonlyArray<{
    id: string;
    title: string;
    description?: string | null;
    assignee: string | null;
    isCompleted: boolean;
    dueDate: Date | null;
    relativeDueDays?: number | null;
    completedById: string | null;
  }>;
  departmentLinks: ReadonlyArray<OffboardingDepartmentLink>;
}

export interface OnboardingAbteilungsUebersicht<I, L> {
  /** Links wie gespeichert, dazu `url` (Server, APP_URL) und `anzeige`. */
  departmentLinks: Array<L & { url: string; anzeige: Anzeige }>;
  /**
   * Aufgaben wie geladen, dazu `erledigtVon` und `faelligAm` (ISO): die
   * gespeicherte Faelligkeit, sonst — nur bei eingereichten Modalitaeten — die
   * aus Vertragsbeginn + Tagen berechnete (Vorschau vor dem ersten Informieren;
   * gespeichert wird sie erst dann).
   */
  checklistItems: Array<I & { erledigtVon: ErledigtVon; faelligAm: string | null }>;
  abteilungen: AbteilungsUebersichtDaten;
  fuehrungskraft: Fuehrungskraft;
}

/**
 * Reichert den Onboarding-Vorgang fuer die Detailseite an — Gegenstueck zu
 * abteilungsUebersichtLaden im Offboarding. Der Aufrufer spreizt das Ergebnis
 * ueber den Vorgang: `{ ...vorgang, ...(await onboardingAbteilungsUebersichtLaden(vorgang)) }`.
 * Liest nur Einstellungen → Abteilungen und Benutzernamen; schreibt nichts.
 */
export async function onboardingAbteilungsUebersichtLaden<
  I extends OnboardingUebersichtVorgang["checklistItems"][number],
  L extends OffboardingDepartmentLink,
>(
  vorgang: Omit<OnboardingUebersichtVorgang, "checklistItems" | "departmentLinks"> & {
    checklistItems: ReadonlyArray<I>;
    departmentLinks: ReadonlyArray<L>;
  },
  jetzt: Date = new Date(),
): Promise<OnboardingAbteilungsUebersicht<I, L>> {
  const [konfigs, benutzer] = await Promise.all([
    konfigsLaden(),
    benutzerNamenLaden(vorgang.checklistItems.map((i) => i.completedById)),
  ]);

  const gesperrt = onboardingVersandSperre(vorgang);
  const beginn = gesperrt ? null : (vorgang.supervisorData?.vertragsbeginn ?? null);
  const faelligAm = (i: I): Date | null => i.dueDate ?? faelligkeitAus(beginn, i.relativeDueDays);
  const abgeschlossen = onboardingVorgangBeendet(vorgang.status);
  const fuehrungskraft = onboardingFuehrungskraft(vorgang);
  const linkUrl = (token: string) => modulLinkUrl("ONBOARDING", token);

  const { zeilen, informierbar, niemandInformiert, unbekannteZustaendigkeiten } = abteilungsZeilenBauen({
    aufgaben: vorgang.checklistItems.map((i) => ({
      id: i.id,
      title: i.title,
      description: i.description ?? null,
      assigneeDepartment: i.assignee,
      isCompleted: i.isCompleted,
      dueDate: faelligAm(i),
    })),
    links: vorgang.departmentLinks,
    konfigs,
    organizationId: vorgang.organizationId,
    fuehrungskraft,
    vorgangAbgeschlossen: abgeschlossen,
    gesperrt: !!gesperrt,
    linkUrl,
    jetzt,
  });

  const abteilungsNamen = Object.fromEntries(zeilen.map((z) => [z.departmentKey, z.departmentName]));

  return {
    departmentLinks: vorgang.departmentLinks.map((l) => ({
      ...l,
      url: linkUrl(l.token),
      anzeige: linkAnzeige(l, jetzt),
    })),
    checklistItems: vorgang.checklistItems.map((i) => ({
      ...i,
      erledigtVon: erledigtVonBestimmen(
        { isCompleted: i.isCompleted, completedById: i.completedById, assigneeDepartment: i.assignee },
        { benutzer, abteilungen: abteilungsNamen },
      ),
      faelligAm: faelligAm(i)?.toISOString() ?? null,
    })),
    abteilungen: {
      modul: "ONBOARDING",
      zeilen,
      informierbar,
      niemandInformiert,
      vorgangAbgeschlossen: abgeschlossen,
      vorgangAbgebrochen: vorgang.status === "EXPIRED",
      bezugsdatum: beginn ? beginn.toISOString() : null,
      gesperrt,
      unbekannteZustaendigkeiten,
    },
    fuehrungskraft,
  };
}

/**
 * GET /api/onboarding/[id]/abteilungen — nur die Karte (z. B. frische Vorschau
 * fuer den Dialog), ohne die Detailroute mit ihren entschluesselten Feldern.
 *
 *   403 { error: "Keine Berechtigung" }        Rolle nicht PORTAL_ROLES
 *   404 { error: "Vorgang nicht gefunden" }    unbekannt ODER fremder Mandant
 *   200 { abteilungen: AbteilungsUebersichtDaten, fuehrungskraft }
 */
export async function onboardingAbteilungenLaden(opts: {
  onboardingId: string;
  session: SessionPayload;
  jetzt?: Date;
}): Promise<DienstAntwort> {
  if (!PORTAL_ROLES.includes(opts.session.role)) {
    return { status: 403, body: { error: "Keine Berechtigung" } };
  }
  const vorgang = await prisma.onboardingProcess.findUnique({
    where: { id: opts.onboardingId },
    select: {
      id: true,
      organizationId: true,
      status: true,
      supervisorEmail: true,
      supervisorSubmittedAt: true,
      supervisorData: { select: { isComplete: true, vertragsbeginn: true } },
      checklistItems: {
        select: {
          id: true,
          title: true,
          description: true,
          assignee: true,
          isCompleted: true,
          dueDate: true,
          relativeDueDays: true,
          completedById: true,
        },
        orderBy: [{ category: "asc" }, { orderIndex: "asc" }],
      },
      departmentLinks: true,
    },
  });
  if (!vorgang || !(await canAccessProcess(opts.session, vorgang.organizationId))) {
    return { status: 404, body: { error: MELDUNGEN.ONBOARDING_VORGANG_NICHT_GEFUNDEN } };
  }
  const u = await onboardingAbteilungsUebersichtLaden(vorgang, opts.jetzt ?? new Date());
  return { status: 200, body: { abteilungen: u.abteilungen, fuehrungskraft: u.fuehrungskraft } };
}

// =============================================
// Taeglicher Lauf (POST /api/cron/reminders, Abschnitt 3)
// =============================================

/**
 * Erinnert im Onboarding nach denselben Regeln wie im Offboarding
 * (erinnerungsStufe; nur informierte Links mit offenen Aufgaben; Abstand ab
 * dem letzten Versand; Ende 30 Tage nach der spaetesten offenen Faelligkeit;
 * Merker bei SENT/WEBHOOK/SKIPPED, nicht bei FAILED; Adressaenderung →
 * SKIPPED mit Grund, nie ein neuer Token). Nie bei COMPLETED/EXPIRED.
 * Aufgaben ohne Faelligkeit loesen keine Erinnerung aus.
 */
export async function onboardingErinnerungenSenden(jetzt: Date = new Date()): Promise<CronErgebnis> {
  const kandidaten = await prisma.onboardingProcess.findMany({
    where: {
      status: { notIn: [...ONBOARDING_ENDSTATUS] },
      departmentLinks: { some: { sentAt: { not: null }, allTasksComplete: false } },
    },
    select: { id: true, displayId: true },
  });
  return erinnerungsLauf("ONBOARDING", kandidaten, onboardingErinnerungsKontext, jetzt);
}

/** Frischer Kontext eines Onboarding-Vorgangs fuer den Lauf (unter der Sperre). */
async function onboardingErinnerungsKontext(
  onboardingId: string,
  lauf: ErinnerungsLaufStand,
): Promise<VersandKontext | null> {
  const [vorgang, departmentLinks, aufgaben] = await Promise.all([
    prisma.onboardingProcess.findUnique({ where: { id: onboardingId }, select: ONBOARDING_VERSAND_AUSWAHL }),
    prisma.offboardingDepartmentLink.findMany({
      where: { onboardingId, sentAt: { not: null }, allTasksComplete: false },
    }),
    aufgabenLaden("ONBOARDING", onboardingId, true),
  ]);
  if (!vorgang || onboardingVorgangBeendet(vorgang.status)) return null;
  return {
    modul: onboardingVersandModul(vorgang),
    aufgaben,
    links: new Map(departmentLinks.map((l) => [l.departmentKey, l])),
    konfigs: lauf.konfigs,
    webhook: { zugewiesen: false, erinnerung: lauf.erinnerungsWebhook },
    jetzt: lauf.jetzt,
    warnungen: [],
  };
}
