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
 *   POST /api/modalitaeten/[token] (nach Commit) → onboardingAusstattungNachholenIn
 *   POST /api/cron/reminders (Abschnitt 3a)      → onboardingAusstattungNachholen
 *                                                  (ueber src/lib/ausstattung-lauf.ts)
 *   POST /api/cron/reminders (Abschnitt 3)       → onboardingErinnerungenSenden
 *   POST /api/onboarding/[id]/ausstattung        → vorgangSperrenIn, onboardingAusstattungNachholenIn
 *                                                  (ueber src/lib/ausstattung-dienst.ts, S15)
 *
 * AUSSTATTUNG & ZUGAENGE (Paket A3, S12): Aus der Wahl der Fuehrungskraft
 * und den Ergaenzungen von HR (Karte, S15) werden Checklisten-Aufgaben der
 * zustaendigen Stelle, je Option eine (E-A12). Angelegt wird nie „nebenbei“,
 * sondern immer ueber `onboardingAusstattungNachholenIn` in der
 * Sperrreihenfolge Vorgang → Links → Aufgaben (F5): nach der Abgabe der
 * Modalitaeten, vor jeder Aktion der Karte und im taeglichen Lauf — was einmal
 * scheitert, holt der naechste Aufruf nach (Regel 6). Faelligkeit nie vor
 * heute, sonst „Eilt“ (Regel 14); vor einer Zuweisungsmail wird noch einmal
 * angehoben (F22). Versendet wird dabei nichts.
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
 *     DepartmentConfig (Eintrag des ARBEITSORTS vor zentral, E-A10:
 *     `onboardingEmpfaengerEinrichtung` = arbeitsortId ?? organizationId).
 *     Das gilt fuer Vorlagen- und Ausstattungsaufgaben gleich — sonst gaebe es
 *     zwei FACILITY-Stellen, aber nur einen Link. HR/MITARBEITER nie.
 *   - Mandant bleibt `organizationId`: Jedes canAccessProcess hier und in
 *     abteilungsaufgaben-uebergaenge.ts prueft den Arbeitgeber, nie den
 *     Arbeitsort. Der Arbeitsort steckt nur in `VersandModul.organizationId`
 *     und in der Uebersicht (abteilungsZeilenBauen) — beide loesen damit
 *     ausschliesslich Empfaenger auf.
 *   - COMPLETED: Link nur lesend, keine Erinnerung, kein Versand (409).
 *     EXPIRED: Link 410 „Dieser Vorgang ist nicht mehr aktiv …", kein Versand
 *     — einzige Ausnahme ist die Absage (E-A20): Per Knopf erfahren die schon
 *     informierten Stellen davon, einmal je Stelle, an die informierte Adresse,
 *     ohne Link, mit ihren erledigten Aufgaben und (A4, G10) den Stuecken, die
 *     sie laut Portal noch ausgegeben haben (Aktion `absage`, nur bei
 *     EXPIRED, sonst 409 `NICHT_ABGESAGT`; nie automatisch).
 *     Offene Abteilungsaufgaben blockieren den Abschluss nicht – Ausnahme
 *     (E-A19): offene Ausstattungs- und Hinweis-Aufgaben verlangen eine
 *     Bestätigung (PATCH /api/onboarding/[id], 409 `AUSSTATTUNG_OFFEN`).
 *   - Datensparsamkeit: Die Mails bekommen nur onboardingAbteilungsMailFelder
 *     und die Zusatzfelder, die ONBOARDING_ZUSATZFELDER dem Schluessel erlaubt.
 *     Der Vorgang wird mit eigenem select geladen — nie ueber die Detailroute,
 *     die IBAN, SV-Nummer und Steuer-ID entschluesselt.
 */

import type { OffboardingDepartmentLink, OnboardingStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { canAccessProcess, HR_EDIT_ROLES, PORTAL_ROLES, type SessionPayload } from "@/lib/permissions";
import { onboardingAbteilungsMailFelder } from "@/lib/onboarding-abteilung-mail";
import { fehlerKennung } from "@/lib/fehler-kennung";
import {
  ABTEILUNGS_AUDIT,
  MELDUNGEN,
  ONBOARDING_ENDSTATUS,
  absageStand,
  abteilungsZeilenBauen,
  erledigtVonBestimmen,
  faelligkeitAus,
  istLinkAbteilung,
  linkAnzeige,
  onboardingEmpfaengerEinrichtung,
  onboardingVersandSperre,
  zusatzWerte,
  type AbteilungsUebersichtDaten,
  type Anzeige,
  type AusstattungSicht,
  type DienstAntwort,
  type ErledigtVon,
  type Fuehrungskraft,
} from "@/lib/abteilungsaufgaben";
import { AUSSTATTUNG_AUDIT, anzuhebendeAufgaben, ausstattungsFaelligkeit, neuGemeldeteTitel } from "@/lib/ausstattung";
import { ausstattungsAufgabenAnlegenIn } from "@/lib/ausstattung-aufgaben";
import {
  angabenJeStelleLaden,
  ausstattungZuAufgabenLaden,
  offeneAenderungenLaden,
  type OffeneAenderungen,
} from "@/lib/ausstattung-daten";
import {
  auditBezug,
  linkStatusNeuBerechnenIn,
  type LinkBereich,
} from "@/lib/abteilungsaufgaben-uebergaenge";
import { aktiveAusgabenJeStelleLaden } from "@/lib/ausgaben-daten";
import {
  onboardingAbteilungsAktionSchema,
  type AbteilungsAktionInput,
} from "@/lib/validations/abteilungsaufgaben";
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
  // Arbeitsort (E-A10): Empfaenger am Arbeitsort, null = Einrichtung. Der
  // Name geht als Mailfeld `arbeitsort` hinaus, nur wenn er abweicht (F15).
  arbeitsortId: true,
  arbeitsort: { select: { name: true } },
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
    // Nur fuer die Empfaenger (empfaengerFuer im Versandkern): der Arbeitsort,
    // sonst die Einrichtung (E-A10). Der Mandant wurde vorher am Arbeitgeber
    // geprueft (canAccessProcess mit v.organizationId).
    organizationId: onboardingEmpfaengerEinrichtung(v),
    fuehrungskraft: onboardingFuehrungskraft(v),
    mailFelder: onboardingAbteilungsMailFelder(v),
    zusatzFelder: (key) =>
      zusatzWerte(key, {
        stellenbezeichnung: v.supervisorData?.stellenbeschreibung,
        betriebsstaette: v.supervisorData?.betriebsstaette,
        fuehrungskraftEmail: v.supervisorEmail,
      }),
    // Ausstattung & Zugaenge (Regel 7): Angaben und Hinweis je Stelle fuer den
    // Infokasten der Zuweisungsmail — nur die eigenen und die freigegebenen.
    angabenLaden: () => angabenJeStelleLaden(prisma, v.id),
    // Regel 10, F7: die offene Aenderungsliste je Stelle — Aktion „nachtrag“
    // und jede Zuweisungsmail nehmen sie mit.
    nachtraegeLaden: () => offeneAenderungenLaden(prisma, v.id),
    // A4 (G10): die noch ausgegebenen Stuecke je Stelle — nur die Absage
    // liest sie (jede Stelle ihre eigenen, samt Kennung).
    absageAusgabenLaden: () => aktiveAusgabenJeStelleLaden(prisma, v.id),
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
 * Ausstattungs- und Hinweis-Aufgaben (`herkunft` gesetzt, Regel 14): nie vor
 * dem heutigen Berliner Kalendertag (`ausstattungsFaelligkeit` mit `jetzt`);
 * laege die Frist schon zurueck, gilt heute und `eilt` wird gesetzt — einmal,
 * mit der Faelligkeit. Vorlagenaufgaben bleiben wie bisher (auch ueberfaellig,
 * ohne „Eilt“).
 *
 * Tut nichts (gesetzt 0), solange die Modalitaeten nicht eingereicht sind oder
 * keinen Vertragsbeginn tragen (onboardingVersandSperre) — ein Entwurfsdatum
 * darf keine Fristen erzeugen.
 *
 * Aufrufer: das Nachholen (`onboardingAusstattungNachholenIn`, Schritt 6) —
 * nach der Abgabe der Modalitaeten, vor jeder HR-Aktion und im taeglichen
 * Lauf — und dessen Rueckfall in der HR-Aktion. Sperren: nur Aufgabenzeilen;
 * passt zur Reihenfolge Vorgang → Links → Aufgaben.
 *
 * Protokoll: CHECKLIST_DUE_DATES_SET mit Anzahl und Vertragsbeginn (dazu
 * `eilt` mit der Zahl der angehobenen Ausstattungsaufgaben, wenn es welche
 * gibt), nur wenn etwas gesetzt wurde (im selben Commit).
 */
export async function faelligkeitenSetzen(
  tx: Prisma.TransactionClient,
  onboardingId: string,
  opts: { userId?: string | null; jetzt?: Date } = {},
): Promise<{ gesetzt: number; vertragsbeginn: Date | null }> {
  const jetzt = opts.jetzt ?? new Date();
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
    select: { id: true, relativeDueDays: true, herkunft: true },
  });
  // Je Ergebnis (Faelligkeit, Eilt) EIN Update — wenige verschiedene Werte je Vorlage.
  const gruppen = new Map<string, { dueDate: Date; eilt: boolean | null; ids: string[] }>();
  for (const a of offen) {
    if (a.relativeDueDays == null) continue;
    const ziel =
      a.herkunft != null
        ? ausstattungsFaelligkeit(beginn, a.relativeDueDays, jetzt)
        : (() => {
            const faellig = faelligkeitAus(beginn, a.relativeDueDays);
            return faellig ? { dueDate: faellig, eilt: null } : null;
          })();
    if (!ziel) continue;
    const schluessel = `${ziel.dueDate.getTime()}|${ziel.eilt}`;
    const gruppe = gruppen.get(schluessel) ?? { dueDate: ziel.dueDate, eilt: ziel.eilt, ids: [] };
    gruppe.ids.push(a.id);
    gruppen.set(schluessel, gruppe);
  }
  let gesetzt = 0;
  let eilt = 0;
  for (const g of gruppen.values()) {
    const r = await tx.checklistItem.updateMany({
      // dueDate: null im WHERE: Hat HR in der Zwischenzeit von Hand eine
      // Faelligkeit gesetzt, bleibt sie. Eine von Hand ENTFERNTE Frist kommt
      // ebenfalls nicht zurueck — der Portal-PATCH setzt mit `dueDate: null`
      // auch `relativeDueDays` auf null, die Zeile faellt also aus dem
      // WHERE heraus (abteilungsaufgaben-uebergaenge.ts).
      where: { onboardingId, id: { in: g.ids }, dueDate: null },
      // `eilt` nur bei Ausstattungsaufgaben (null = Vorlage: Feld unberuehrt).
      data: g.eilt === null ? { dueDate: g.dueDate } : { dueDate: g.dueDate, eilt: g.eilt },
    });
    gesetzt += r.count;
    if (g.eilt) eilt += r.count;
  }

  if (gesetzt > 0) {
    await tx.auditLog.create({
      data: {
        userId: opts.userId ?? null,
        onboardingId,
        processType: "ONBOARDING",
        action: ABTEILUNGS_AUDIT.FAELLIGKEITEN_GESETZT,
        details: { gesetzt, vertragsbeginn: beginn.toISOString(), ...(eilt > 0 ? { eilt } : {}) },
      },
    });
  }
  return { gesetzt, vertragsbeginn: beginn };
}

// =============================================
// Ausstattung & Zugaenge: Aufgaben nachholen (S12; Regel 6, Regel 14, F4, F5, F22)
// =============================================

/**
 * Sperrt den Onboarding-Vorgang bis zum Ende der Transaktion (UPDATE auf
 * `updatedAt`), solange er laeuft — `false`, wenn er beendet (COMPLETED,
 * EXPIRED) oder unbekannt ist. Erster Schritt jedes Anlegers von
 * Ausstattungsaufgaben (F4): Zwei Anleger laufen damit nacheinander, und der
 * zweite liest den Stand erst nach dem Commit des ersten. `auch` laesst
 * einzelne Endstatus zu. Die Absage nach EXPIRED braucht keine Sperre (EXPIRED
 * ist endgueltig, ihr Merker `abgesagtAm` haengt am Link). Seit A4 (S24)
 * nutzt `auch` die Karte der Ausgaben (src/lib/ausgaben-dienst.ts,
 * `auch: ["COMPLETED", "EXPIRED"]`): HR traegt Uebergaben nach und tauscht
 * auch nach Abschluss und Absage (G7) – die Sperre ordnet sie trotzdem hinter
 * jeden anderen Anleger einer Ausgabe derselben Einstellung (G24). `false`
 * heisst dann nur noch „unbekannt“. Spaeter (S28) sperrt die Zuordnung eines
 * Austritts die Einstellung mit `auch: ["COMPLETED"]`.
 */
export async function vorgangSperrenIn(
  tx: Prisma.TransactionClient,
  onboardingId: string,
  opts: { jetzt?: Date; auch?: ReadonlyArray<OnboardingStatus> } = {},
): Promise<boolean> {
  const auch = opts.auch ?? [];
  const r = await tx.onboardingProcess.updateMany({
    where: { id: onboardingId, status: { notIn: ONBOARDING_ENDSTATUS.filter((s) => !auch.includes(s)) } },
    data: { updatedAt: opts.jetzt ?? new Date() },
  });
  return r.count > 0;
}

export interface AusstattungNachgeholt {
  /** `false`: Vorgang beendet oder unbekannt — es ist nichts geschehen. */
  gesperrt: boolean;
  /** Zahl der angelegten Aufgaben (Ausstattung und Hinweise). */
  angelegt: number;
  /** Stellen mit neuen Aufgaben. */
  stellen: string[];
  /** Zahl der beim Versand auf heute angehobenen Aufgaben (F22). */
  angehoben: number;
}

/**
 * Holt die Ausstattungs- und Hinweis-Aufgaben eines Vorgangs nach — in der
 * Transaktion des Aufrufers und in der verbindlichen Reihenfolge
 * (Feinplan 1.7, F5):
 *
 *   1. Vorgang sperren (`vorgangSperrenIn`); beendet → nichts.
 *   2.–5. fehlende Aufgaben bestimmen, Links der betroffenen Stellen (und der
 *      Stellen aus `versandAn`) sperren, anlegen, verknuepfen, Eintraege NEU
 *      fuer schon informierte Stellen (`ausstattungsAufgabenAnlegenIn`).
 *   6. `faelligkeitenSetzen` (Ausstattungsaufgaben mit „Eilt“).
 *   7. Nur mit `versandAn` (gleich geht eine Zuweisungsmail an diese Stellen,
 *      F22): ihre Ausstattungs- und Hinweis-Aufgaben, die sie noch mit keiner
 *      Mail bekommen hat (angelegt nach dem letzten Versand oder mit offenem
 *      Eintrag NEU: Stellenwechsel, Wiederaufnahme) und deren Frist
 *      verstrichen ist, auf heute anheben und `eilt` setzen
 *      (`anzuhebendeAufgaben`); Protokoll nur mit Anzahl und Stellen.
 *   8. Abteilungsstatus der Stellen mit neuen Aufgaben neu berechnen
 *      (`linkStatusNeuBerechnenIn`) — eine fertige Stelle ist wieder offen
 *      (Protokoll DEPARTMENT_TASKS_REOPENED). Der Link wird dabei NICHT
 *      verlaengert; das tun erst Nachtrag und Erinnerung.
 *   9. Protokoll AUSSTATTUNG_AUFGABEN_ANGELEGT mit Anzahl, Stellen und
 *      Herkunft — ohne Titel.
 *
 * Wirft bei einer verletzten Eindeutigkeit (P2002, zwei Anleger trotz
 * Sperre) oder `HinweisSchonVerknuepft`; dann rollt die Transaktion zurueck,
 * der Aufrufer loggt, und der naechste Aufruf holt nach.
 */
export async function onboardingAusstattungNachholenIn(
  tx: Prisma.TransactionClient,
  onboardingId: string,
  opts: { userId?: string | null; jetzt?: Date; versandAn?: ReadonlyArray<string> } = {},
): Promise<AusstattungNachgeholt> {
  const jetzt = opts.jetzt ?? new Date();
  const userId = opts.userId ?? null;
  const versandAn = [...new Set(opts.versandAn ?? [])];
  const bereich: LinkBereich = { modul: "ONBOARDING", vorgangId: onboardingId };

  // 1. Vorgang sperren.
  if (!(await vorgangSperrenIn(tx, onboardingId, { jetzt }))) {
    return { gesperrt: false, angelegt: 0, stellen: [], angehoben: 0 };
  }

  // 2.–5. Anlegen (sperrt die Links selbst, vor der ersten Aufgabe).
  const anlage = await ausstattungsAufgabenAnlegenIn(tx, onboardingId, { jetzt, weitereStellen: versandAn });

  // 6. Faelligkeiten (einmal; Ausstattung mit „Eilt“).
  await faelligkeitenSetzen(tx, onboardingId, { userId, jetzt });

  // 7. F22: beim Versand anheben.
  const angehoben =
    versandAn.length > 0 ? await faelligkeitBeimVersandAnheben(tx, bereich, versandAn, { userId, jetzt }) : 0;

  if (anlage.angelegt.length > 0) {
    // 8. Abteilungsstatus der Stellen mit neuen Aufgaben.
    const uebergaenge = await linkStatusNeuBerechnenIn(tx, bereich, anlage.stellen, jetzt);
    for (const u of uebergaenge) {
      if (!u.uebergang) continue;
      await tx.auditLog.create({
        data: {
          userId,
          ...auditBezug(bereich),
          action: u.uebergang === "FERTIG" ? ABTEILUNGS_AUDIT.ABTEILUNG_FERTIG : ABTEILUNGS_AUDIT.ABTEILUNG_WIEDER_OFFEN,
          details: { departmentKey: u.departmentKey, linkId: u.linkId, ueber: "AUSSTATTUNG" },
        },
      });
    }

    // 9. Protokoll — Anzahlen und Schluessel, nie Titel.
    const herkunft = { AUSSTATTUNG: 0, HINWEIS: 0 };
    for (const a of anlage.angelegt) herkunft[a.herkunft]++;
    await tx.auditLog.create({
      data: {
        userId,
        ...auditBezug(bereich),
        action: AUSSTATTUNG_AUDIT.AUFGABEN_ANGELEGT,
        details: { anzahl: anlage.angelegt.length, stellen: anlage.stellen, herkunft },
      },
    });
  }

  return { gesperrt: true, angelegt: anlage.angelegt.length, stellen: anlage.stellen, angehoben };
}

/**
 * Schritt 7 des Nachholens (F22): Fuer jede Stelle, an die gleich eine
 * Zuweisungsmail geht, den Link und ihre offene Aenderungsliste lesen (nach
 * der Linksperre) und ihre Ausstattungs- und Hinweis-Aufgaben anheben, die sie
 * noch nicht bekommen hat — angelegt nach dem letzten Versand oder mit einem
 * offenen Eintrag NEU (Stellenwechsel zu ihr, Wiederaufnahme nach F23;
 * `neuGemeldeteTitel`) — und deren Frist vor heute liegt. Geschrieben wird
 * ueber die IDs — unter Vorgangs- und Linksperre, deshalb ohne
 * Datumsbedingung im WHERE.
 */
async function faelligkeitBeimVersandAnheben(
  tx: Prisma.TransactionClient,
  bereich: LinkBereich,
  versandAn: ReadonlyArray<string>,
  opts: { userId: string | null; jetzt: Date },
): Promise<number> {
  const heute = faelligkeitAus(opts.jetzt, 0);
  if (!heute) return 0;
  const [links, aufgaben, offeneEintraege] = await Promise.all([
    tx.offboardingDepartmentLink.findMany({
      where: { onboardingId: bereich.vorgangId, departmentKey: { in: [...versandAn] } },
      select: { departmentKey: true, sentAt: true, lastSentAt: true },
    }),
    tx.checklistItem.findMany({
      where: { onboardingId: bereich.vorgangId, assignee: { in: [...versandAn] }, herkunft: { not: null } },
      select: { id: true, title: true, assignee: true, dueDate: true, createdAt: true, isCompleted: true, entfaelltAm: true },
    }),
    tx.onboardingAusstattungAenderung.findMany({
      where: { onboardingId: bereich.vorgangId, departmentKey: { in: [...versandAn] }, gesendetAm: null },
      select: { departmentKey: true, art: true, titel: true, erfasstAm: true },
    }),
  ]);

  const ids: string[] = [];
  const stellen: string[] = [];
  for (const key of versandAn) {
    const link = links.find((l) => l.departmentKey === key);
    const treffer = anzuhebendeAufgaben(
      aufgaben.filter((a) => a.assignee === key),
      link?.lastSentAt ?? link?.sentAt ?? null,
      opts.jetzt,
      neuGemeldeteTitel(offeneEintraege.filter((e) => e.departmentKey === key)),
    );
    if (treffer.length === 0) continue;
    ids.push(...treffer);
    stellen.push(key);
  }
  if (ids.length === 0) return 0;

  const r = await tx.checklistItem.updateMany({
    where: { id: { in: ids }, isCompleted: false, entfaelltAm: null },
    data: { dueDate: heute, eilt: true },
  });
  if (r.count > 0) {
    await tx.auditLog.create({
      data: {
        userId: opts.userId,
        ...auditBezug(bereich),
        action: AUSSTATTUNG_AUDIT.FAELLIGKEIT_ANGEHOBEN,
        details: { anzahl: r.count, stellen },
      },
    });
  }
  return r.count;
}

/**
 * Das Nachholen in einer eigenen Transaktion (taeglicher Lauf,
 * src/lib/ausstattung-lauf.ts). Fehler wirft es weiter — der Aufrufer loggt.
 */
export async function onboardingAusstattungNachholen(
  onboardingId: string,
  opts: { userId?: string | null; jetzt?: Date } = {},
): Promise<AusstattungNachgeholt> {
  return prisma.$transaction((tx) => onboardingAusstattungNachholenIn(tx, onboardingId, opts));
}

/**
 * Die Stellen, an die eine Aktion gleich eine Zuweisungsmail schickt (F22,
 * Feinplan 1.7 „Aufrufer“) — gelesen in der Transaktion des Nachholens:
 *   informieren                 Link-Stellen der Aufgaben, deren Link fehlt
 *                               oder kein `sentAt` hat (nie HR). Eine Stelle,
 *                               die der Versand danach ueberspringt, bekommt
 *                               die Anhebung trotzdem — harmlos, der naechste
 *                               Versand hebt erneut an.
 *   erneut-senden, link-erneuern,
 *   nachtrag                    die eine Stelle
 *   erinnern                    keine (eine Erinnerung ist keine Zuweisung)
 *   absage                      keine (laeuft nie hierher: Der Adapter zweigt
 *                               sie vor dem Nachholen ab, bei EXPIRED gibt es
 *                               nichts nachzuholen)
 * Aufgaben, die DIESES Nachholen erst anlegt, sind ohnehin fruehestens heute
 * faellig (`ausstattungsFaelligkeit`) und brauchen keine Anhebung.
 */
async function versandAnLesen(
  tx: Prisma.TransactionClient,
  onboardingId: string,
  aktion: AbteilungsAktionInput,
): Promise<string[]> {
  switch (aktion.aktion) {
    case "erneut-senden":
    case "link-erneuern":
    case "nachtrag":
      return [aktion.departmentKey];
    case "erinnern":
    case "absage":
      return [];
    case "informieren": {
      const [aufgaben, links] = await Promise.all([
        tx.checklistItem.findMany({ where: { onboardingId }, select: { assignee: true } }),
        tx.offboardingDepartmentLink.findMany({
          where: { onboardingId },
          select: { departmentKey: true, sentAt: true },
        }),
      ]);
      const informiert = new Set(links.filter((l) => l.sentAt != null).map((l) => l.departmentKey));
      return [
        ...new Set(
          aufgaben
            .map((a) => a.assignee)
            .filter((k): k is string => typeof k === "string" && istLinkAbteilung(k) && !informiert.has(k)),
        ),
      ];
    }
    default: {
      const unbekannt: never = aktion;
      throw new Error(`Unbekannte Aktion: ${JSON.stringify(unbekannt)}`);
    }
  }
}

/**
 * Vor jeder Aktion der Karte: Ausstattung nachholen samt Faelligkeiten und
 * Anhebung (F22). Scheitert das (Fehler wird geloggt, nur Kennung), setzt der
 * Rueckfall wenigstens die Faelligkeiten wie vor A3 — der Versand der
 * Vorlagenaufgaben haengt nicht an der Ausstattung; was fehlt, holt die
 * naechste Aktion oder der taegliche Lauf nach. Scheitert auch der Rueckfall,
 * wirft er (500 wie bisher).
 */
async function ausstattungVorDemVersand(
  onboardingId: string,
  aktion: AbteilungsAktionInput,
  opts: { userId: string; jetzt: Date },
): Promise<void> {
  try {
    await prisma.$transaction(async (tx) => {
      const versandAn = await versandAnLesen(tx, onboardingId, aktion);
      await onboardingAusstattungNachholenIn(tx, onboardingId, { ...opts, versandAn });
    });
  } catch (err) {
    console.error(`[Onboarding-Abteilungen] Ausstattung nicht nachgeholt (${onboardingId}):`, fehlerKennung(err));
    await prisma.$transaction((tx) => faelligkeitenSetzen(tx, onboardingId, opts));
  }
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
 * Vor jeder Aktion holt sie die Ausstattungsaufgaben nach und setzt die
 * Faelligkeiten (einmal, idempotent); bei Informieren, Erneut senden, Link
 * erneuern und Nachtrag hebt sie dazu die Frist noch nicht zugestellter,
 * verstrichener Ausstattungsaufgaben auf heute an (F22, `ausstattungVorDemVersand`).
 *
 * Nur hier gibt es `{ aktion: "nachtrag", departmentKey }` (Ausstattung &
 * Zugaenge, Regel 10; onboardingAbteilungsAktionSchema) — die Aenderungen nach
 * der Information mit gleichem Link an die Stelle, auch wenn nur „Entfällt“ zu
 * melden ist. 409 mit `KEIN_NACHTRAG`, `NICHT_INFORMIERT` oder `SPERRZEIT` im
 * Bericht, wenn es nichts zu senden gibt.
 *
 * Ebenso nur hier: `{ aktion: "absage" }` (E-A20). Sie zweigt VOR dem
 * Abbruch bei Endstatus ab (`absageAusfuehren`): erlaubt NUR bei EXPIRED
 * (sonst 409 `{ error, grund: "NICHT_ABGESAGT" }`), ohne Modalitaeten-Sperre
 * und ohne Nachholen. Danach dieselbe Antwortform (Bericht 201/409/502); ein
 * zweiter Klick ergibt 409 mit `BEREITS_ABGESAGT` je Stelle.
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
  const parsed = onboardingAbteilungsAktionSchema.safeParse(opts.rohBody);
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
  // Absage (E-A20): VOR dem Abbruch bei Endstatus — sie gibt es nur bei EXPIRED.
  if (aktion.aktion === "absage") return absageAusfuehren(vorgang, opts.session.userId, jetzt);
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
    // Ausstattung nachholen, Faelligkeiten setzen, beim Versand anheben (F22)
    // — unter der Versandsperre und VOR dem Laden des Kontexts, damit die
    // Mail die neuen Aufgaben samt Frist schon enthaelt.
    await ausstattungVorDemVersand(vorgang.id, aktion, { userId: opts.session.userId, jetzt });
    const ctx = await versandKontextLaden(modul, jetzt);
    return await aktionMitKontextAusfuehren(ctx, aktion, opts.session.userId);
  } finally {
    // Genau eine Freigabestelle — kein Rueckgabepfad darf die Sperre stehen lassen.
    versandSperreFreigeben(modul);
  }
}

/**
 * Absage an die informierten Stellen (E-A20) — Rolle und Mandant hat der
 * Aufrufer geprueft. Nur bei EXPIRED: Bei laufendem Vorgang waere sie falsch,
 * bei COMPLETED ist der Dienst angetreten. Unter derselben Versandsperre wie
 * jede andere Aktion (ein Doppelklick schickt nicht zweimal, bevor
 * `abgesagtAm` steht). Kein Nachholen, keine Faelligkeiten: Bei EXPIRED
 * entsteht nichts Neues. Der Kontext laedt weder Angaben noch Aenderungsliste
 * — die Absage traegt keines von beiden. Die noch ausgegebenen Stuecke je
 * Stelle (A4, G10) liest die Aktion selbst ueber `absageAusgabenLaden`.
 */
async function absageAusfuehren(
  vorgang: OnboardingVorgangFuerVersand,
  userId: string,
  jetzt: Date,
): Promise<DienstAntwort> {
  if (vorgang.status !== "EXPIRED") {
    return { status: 409, body: { error: MELDUNGEN.ABSAGE_NUR_ABGELAUFEN, grund: "NICHT_ABGESAGT" } };
  }
  const modul: VersandModul = { ...onboardingVersandModul(vorgang), angabenLaden: undefined, nachtraegeLaden: undefined };
  if (!versandSperreNehmen(modul)) {
    return { status: 409, body: { error: MELDUNGEN.VERSAND_LAEUFT } };
  }
  try {
    const ctx = await versandKontextLaden(modul, jetzt);
    return await aktionMitKontextAusfuehren(ctx, { aktion: "absage" }, userId);
  } finally {
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
  /** Arbeitsort (E-A10); fehlt oder null = Einrichtung. Nur fuer die Empfaenger. */
  arbeitsortId?: string | null;
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
    /** Ausstattung & Zugaenge (F3): "AUSSTATTUNG" | "HINWEIS", null = Vorlage. */
    herkunft?: string | null;
    /** F2: von HR gestrichen — zaehlt nicht mehr mit. */
    entfaelltAm?: Date | null;
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
 *
 * Ausstattung & Zugaenge (Feinplan S14, Mockup 6.4): Je Aufgabe gehen
 * Herkunft, „mit Bemerkung“ und „entfällt“ an `abteilungsZeilenBauen` (die
 * Vorschau zaehlt daraus „davon N aus …, M mit Bemerkung“, `gesamt` laesst
 * Entfallene weg). Fuer den Satz unter „Was die Empfänger sehen“ kommt
 * `ausstattungSicht` dazu: je Stelle die Labels der Angaben und ob ein Hinweis
 * an sie geht — nie Werte oder Texte, die Uebersicht geht an PORTAL_ROLES
 * (Feinplan 1.11). Bemerkungen werden nur bei Aufgaben mit Herkunft gelesen,
 * die Angaben nur, solange jemand informierbar ist.
 *
 * Seit S17 (Regeln 10 und 15): die offene Aenderungsliste je Stelle
 * (`nachtraege`, daraus „Nachtrag senden“ und die Zeile „Nach der Information
 * geändert: …“ — nur Titel, die die Stelle ohnehin bekommt) und der Waechter
 * (`waechter: true`). Gilt fuer ALLE Abteilungsaufgaben des Vorgangs, auch die
 * aus der Vorlage. Die Liste wird nur gelesen, wenn eine Stelle schon einmal
 * informiert war — vorher gibt es keine Eintraege (Regel 10).
 *
 * Seit S19 (E-A20): `absage` aus den Links (`absageStand`, ohne Abfrage) —
 * nur bei EXPIRED und mindestens einer informierten Stelle, sonst fehlt der
 * Schluessel ganz. Daraus zeigt die Karte „Stellen über die Absage informieren…“.
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
  const schonInformiert = vorgang.departmentLinks.some((l) => (l.sentAt ?? l.lastSentAt) != null);
  const [konfigs, benutzer, zuAusstattung, offeneAenderungen] = await Promise.all([
    konfigsLaden(),
    benutzerNamenLaden(vorgang.checklistItems.map((i) => i.completedById)),
    // Ohne Ausstattungsaufgabe keine Abfrage (leere ID-Liste).
    ausstattungZuAufgabenLaden(
      prisma,
      vorgang.checklistItems.filter((i) => i.herkunft != null).map((i) => i.id),
    ),
    schonInformiert
      ? offeneAenderungenLaden(prisma, vorgang.id)
      : Promise.resolve(new Map<string, OffeneAenderungen>()),
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
      herkunft: i.herkunft ?? null,
      mitBemerkung: !!zuAusstattung.get(i.id)?.bemerkung,
      entfaellt: i.entfaelltAm != null,
    })),
    links: vorgang.departmentLinks,
    konfigs,
    // Empfaenger am Arbeitsort (E-A10) — dieselbe Einrichtung wie im Versand.
    organizationId: onboardingEmpfaengerEinrichtung(vorgang),
    fuehrungskraft,
    vorgangAbgeschlossen: abgeschlossen,
    gesperrt: !!gesperrt,
    linkUrl,
    jetzt,
    // Regel 15: Stelle nicht informiert oder Nachtrag offen, Frist naht → rot.
    waechter: true,
    // Regel 10: zusammengefasst je Stelle (nachtragListe); leer = nichts offen.
    nachtraege: Object.fromEntries([...offeneAenderungen].map(([key, a]) => [key, a.liste])),
  });

  const abteilungsNamen = Object.fromEntries(zeilen.map((z) => [z.departmentKey, z.departmentName]));
  // Satz im Dialog (Mockup 6.4) — nur gebraucht, solange jemand informierbar ist.
  const ausstattungSicht = informierbar > 0 ? await ausstattungSichtLaden(vorgang.id) : null;
  // Absage nach EXPIRED (E-A20) — rein aus den Links.
  const absage = absageStand({ status: vorgang.status, links: vorgang.departmentLinks });

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
      ausstattungSicht,
      ...(absage ? { absage } : {}),
    },
    fuehrungskraft,
  };
}

/**
 * Je Stelle die Labels ihrer Angaben (eigene und freigegebene) und ob ein
 * Hinweis an sie geht — dieselbe Regel (`angabenFuer`), nach der Mail und
 * Link-Seite zuschneiden. Ohne jede Angabe und jeden Hinweis `null`.
 */
async function ausstattungSichtLaden(onboardingId: string): Promise<AusstattungSicht | null> {
  const jeStelle = await angabenJeStelleLaden(prisma, onboardingId);
  const stellen: AusstattungSicht["stellen"] = {};
  for (const [key, a] of jeStelle) {
    if (a.angaben.length === 0 && !a.hinweis) continue;
    stellen[key] = { angaben: a.angaben.map((x) => x.label), hinweis: !!a.hinweis };
  }
  return Object.keys(stellen).length > 0 ? { stellen } : null;
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
      arbeitsortId: true,
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
          herkunft: true,
          entfaelltAm: true,
        },
        orderBy: [{ orderIndex: "asc" }, { category: "asc" }],
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
