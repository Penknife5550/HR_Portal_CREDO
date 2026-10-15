/**
 * CREDO HR-Portal – Ausstattung & Zugaenge: taegliche Laeufe (nur Server)
 *
 * Zwei Teile laufen im Lauf „Onboarding-Erinnerungen“
 * (src/lib/laeufe/onboarding-erinnerungen.ts, POST /api/cron/reminders):
 *
 *   - Abschnitt 3a, VOR den Abteilungs-Erinnerungen: `ausstattungNachholenLauf`
 *     (S12) — fehlende Aufgaben anlegen.
 *   - Abschnitt 4, danach: `ausstattungSammelmailLauf` (S18, E-A18) — am
 *     Werktag vor Dienstbeginn eine Sammelmail an das HR-Postfach mit allen
 *     noch offenen Ausstattungs- und Hinweis-Aufgaben.
 *
 * Der dritte im Lauf „Aufbewahrung erzeugter Dokumente“
 * (src/lib/laeufe/dokumente-aufbewahrung.ts, eigener Block):
 *
 *   - `ausstattungFreitexteLeeren` (S20, E-A22) — Bemerkungen, Angaben und
 *     Hinweise sechs Monate nach Abschluss oder Abbruch leeren; die Zeilen
 *     bleiben als Nachweis.
 *
 * Regel 6 (Nachholen): Ist das Anlegen der Aufgaben nach der Abgabe der
 * Modalitaeten gescheitert (es laeuft nach deren Commit und darf sie nicht
 * umwerfen), holt es die naechste Aktion der Karte nach — und, falls HR nichts
 * tut, der taegliche Lauf. Er sendet nichts; er legt nur an, was fehlt.
 *
 * Kandidaten (Feinplan 5.4): laufende Vorgaenge mit eingereichten
 * Modalitaeten und mindestens einer nicht gestrichenen Ausstattungszeile oder
 * einem Hinweis ohne Aufgabe. Je Kandidat unter der Versandsperre des
 * Vorgangs (dieselbe wie die HR-Aktionen und die Erinnerungen; belegt →
 * heute aus, morgen erneut) erst lesend pruefen, ob ueberhaupt etwas fehlt —
 * nur dann die Transaktion mit der Vorgangssperre. Sonst schriebe der Lauf
 * jeden Tag `updatedAt` jedes Kandidaten neu.
 *
 * Alle Antworten tragen nur Zaehler, nie Namen, Vorgangsnummern oder Titel
 * (Bericht des Zeitplaners, Regel 6 der Automatischen Laeufe).
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { fehlerKennung } from "@/lib/fehler-kennung";
import { getBaseUrl } from "@/lib/url";
import { vorgangPfad } from "@/lib/adressen";
import { triggerWebhooks } from "@/lib/webhooks";
import { ONBOARDING_ENDSTATUS, faelligkeitAus, onboardingEmpfaengerEinrichtung } from "@/lib/abteilungsaufgaben";
import {
  AUSSTATTUNG_AUDIT,
  FREITEXT_AUFBEWAHRUNG_MONATE,
  SAMMELMAIL_EVENT,
  fehlendeAusstattungsAufgaben,
  sammelmailFaellig,
  sammelmailListenFelder,
} from "@/lib/ausstattung";
import { ausstattungsStandLaden } from "@/lib/ausstattung-daten";
import { konfigsLaden, versandSperreFreigeben, versandSperreNehmen } from "@/lib/abteilungsaufgaben-dienst";
import { onboardingAusstattungNachholen } from "@/lib/abteilungsaufgaben-onboarding";
import type { LinkBereich } from "@/lib/abteilungsaufgaben-uebergaenge";
import { onboardingAbteilungsMailFelder } from "@/lib/onboarding-abteilung-mail";

/** Antwortteil des Nachholens (Abschnitt 3a; Auswertung: zeitplaner/bericht.ts). */
export interface AusstattungNachholLauf {
  /** Vorgaenge mit mindestens einer angelegten Aufgabe und die Zahl der Aufgaben. */
  nachgeholt: { vorgaenge: number; aufgaben: number };
  /** Ausnahmen je Vorgang (der Lauf macht weiter). */
  errors: number;
}

/** Ein leeres Ergebnis (auch fuer den Rueckfall des Aufrufers bei einer Ausnahme). */
export function leeresNachholErgebnis(): AusstattungNachholLauf {
  return { nachgeholt: { vorgaenge: 0, aufgaben: 0 }, errors: 0 };
}

/**
 * Holt fuer alle Kandidaten fehlende Ausstattungs- und Hinweis-Aufgaben nach
 * (`onboardingAusstattungNachholen`, ohne `versandAn` — der Lauf schickt
 * keine Mail). Faelligkeiten setzt das Nachholen mit (`faelligkeitenSetzen`,
 * „Eilt“ ab heute).
 */
export async function ausstattungNachholenLauf(jetzt: Date = new Date()): Promise<AusstattungNachholLauf> {
  const ergebnis = leeresNachholErgebnis();
  const kandidaten = await prisma.onboardingProcess.findMany({
    where: {
      status: { notIn: [...ONBOARDING_ENDSTATUS] },
      supervisorSubmittedAt: { not: null },
      OR: [
        { ausstattung: { some: { gestrichenAm: null } } },
        { stellenHinweise: { some: { checklistItemId: null } } },
      ],
    },
    select: { id: true },
  });

  for (const kandidat of kandidaten) {
    const bereich: LinkBereich = { modul: "ONBOARDING", vorgangId: kandidat.id };
    if (!versandSperreNehmen(bereich)) continue; // eine HR-Aktion laeuft — sie holt selbst nach
    try {
      // Lesend vorpruefen: nur wenn etwas fehlt, die Transaktion mit Vorgangssperre.
      const stand = await ausstattungsStandLaden(prisma, kandidat.id);
      if (fehlendeAusstattungsAufgaben(stand).length === 0) continue;
      const r = await onboardingAusstattungNachholen(kandidat.id, { jetzt });
      if (r.angelegt > 0) {
        ergebnis.nachgeholt.vorgaenge++;
        ergebnis.nachgeholt.aufgaben += r.angelegt;
      }
    } catch (err) {
      console.error(`[Ausstattung] Nachholen fehlgeschlagen (${kandidat.id}):`, fehlerKennung(err));
      ergebnis.errors++;
    } finally {
      versandSperreFreigeben(bereich);
    }
  }
  return ergebnis;
}

// =============================================
// Sammelmail an HR am Werktag vor Dienstbeginn (S18, E-A18)
// =============================================

/**
 * Link der Sammelmail auf den Vorgang im Portal, gleich im Reiter Checkliste
 * (dort steht die Karte „Ausstattung & Zugänge“). Seit dem Merge von `main`
 * nach `ux-umbau` (15.10.2026) ueber `vorgangPfad` — so war es im Feinplan 1.10
 * vorgesehen, und `adressen.test.ts` laesst die alten Adressen ausserhalb von
 * `src/lib/adressen.ts` nicht mehr zu (auch nicht im Kommentar). Die neue
 * Adresse heisst `/vorgaenge/onboarding/<id>?tab=checkliste`; die Detailseite
 * versteht den deutschen Alias (`detail-content.tsx`, `alias: "checkliste"`).
 */
export function ausstattungPortalLink(onboardingId: string): string {
  return `${getBaseUrl()}${vorgangPfad("onboarding", onboardingId, "checkliste")}`;
}

/** Antwortfeld `ausstattung.sammelmail` des Laufs „Onboarding-Erinnerungen“. */
export interface AusstattungSammelmailZaehler {
  /** SENT: an das HR-Postfach hinausgegangen (Merker bleibt). */
  versendet: number;
  /** FAILED oder kein Ergebnis: Merker zurueck auf null — der naechste Lauf versucht es erneut. */
  nichtZugestellt: number;
  /** SKIPPED (Vorlage aus, kein Empfaenger — etwa ohne HR-Postfach): Merker bleibt, kein neuer Versuch. */
  uebersprungen: number;
}

/** Ergebnis von `ausstattungSammelmailLauf`. */
export interface AusstattungSammelmailLauf {
  sammelmail: AusstattungSammelmailZaehler;
  /** Ausnahmen je Vorgang (der Lauf macht weiter). */
  errors: number;
}

/** Ein leeres Ergebnis (auch fuer den Rueckfall des Aufrufers bei einer Ausnahme). */
export function leeresSammelmailErgebnis(): AusstattungSammelmailLauf {
  return { sammelmail: { versendet: 0, nichtZugestellt: 0, uebersprungen: 0 }, errors: 0 };
}

const TAG_MS = 24 * 60 * 60 * 1000;

/** Was die Sammelmail vom Vorgang liest — nie die private Adresse der Person. */
const SAMMELMAIL_VORGANG = {
  id: true,
  displayId: true,
  organizationId: true,
  arbeitsortId: true,
  firstName: true,
  lastName: true,
  personalData: { select: { firstName: true, lastName: true } },
  organization: { select: { name: true, mandantNumber: true } },
  arbeitsort: { select: { name: true } },
  supervisorData: { select: { vertragsbeginn: true } },
} as const satisfies Prisma.OnboardingProcessSelect;

/** Offen fuer die Sammelmail: Ausstattungs- und Hinweis-Aufgabe, nicht erledigt, nicht entfallen. */
function offeneAusstattung(onboardingId?: string): Prisma.ChecklistItemWhereInput {
  return {
    ...(onboardingId ? { onboardingId } : {}),
    herkunft: { not: null },
    isCompleted: false,
    // Entfallene sind ohnehin `isCompleted` (F2) — der Filter sagt es ausdruecklich.
    entfaelltAm: null,
  };
}

/** Merker zurueck (bedingt auf den eigenen Zeitstempel) — der naechste Lauf versucht es erneut. */
async function merkerZuruecksetzen(onboardingId: string, jetzt: Date): Promise<void> {
  try {
    await prisma.onboardingProcess.updateMany({
      where: { id: onboardingId, ausstattungSammelmailAm: jetzt },
      data: { ausstattungSammelmailAm: null },
    });
  } catch (err) {
    console.error(`[Ausstattung] Merker der Sammelmail nicht zurueckgesetzt (${onboardingId}):`, fehlerKennung(err));
  }
}

/**
 * Sammelmail „Ausstattung noch offen“ an das HR-Postfach (E-A18), Abschnitt 4
 * des Laufs „Onboarding-Erinnerungen“. Je Vorgang hoechstens EINE Mail
 * (Merker `ausstattungSammelmailAm`, F12).
 *
 * Kandidaten: Status nicht final, Modalitaeten eingereicht, Merker leer,
 * Vertragsbeginn in einem Vorfilter von gestern bis heute + 5 Tage (ein als
 * Berliner Mitternacht gespeicherter Beginn liegt in UTC am Vortag) und
 * mindestens eine offene Ausstattungs- oder Hinweis-Aufgabe. Die genaue Regel
 * macht danach `sammelmailFaellig` (letzter Werktag vor Dienstbeginn bis
 * einschliesslich Dienstbeginn, Mo–Fr in Berliner Kalendertagen).
 *
 * Je Vorgang:
 *   1. offene Aufgaben lesen (Titel und Stelle — nie Bemerkung oder Hinweis);
 *      keine mehr offen → nichts zu tun
 *   2. Anspruch per bedingtem `updateMany` (Merker null → jetzt; Status nicht
 *      final). 0 Treffer: ein anderer Lauf (Knopf „Jetzt ausführen“, Route) war
 *      schneller — kein zweiter Versand.
 *   3. Senden ueber `triggerWebhooks` (das Ereignis steht in
 *      EVENTS_OHNE_WEBHOOK — die Liste geht an keine Webhook-URL).
 *   4. SENT → Protokoll `AUSSTATTUNG_SAMMELMAIL_GESENDET` (nur Anzahl und
 *      Stellen-Schluessel); SKIPPED → Merker bleibt (ein neuer Versuch aendert
 *      nichts, sonst stuende jeden Tag ein SKIPPED im Versandprotokoll);
 *      FAILED oder kein Ergebnis → Merker zurueck, der naechste Lauf versucht
 *      es erneut, solange das Fenster offen ist.
 *
 * Die Antwort traegt nur Zaehler.
 */
export async function ausstattungSammelmailLauf(jetzt: Date = new Date()): Promise<AusstattungSammelmailLauf> {
  const ergebnis = leeresSammelmailErgebnis();
  const heute = faelligkeitAus(jetzt, 0);
  if (!heute) return ergebnis;

  const kandidaten = await prisma.onboardingProcess.findMany({
    where: {
      status: { notIn: [...ONBOARDING_ENDSTATUS] },
      supervisorSubmittedAt: { not: null },
      ausstattungSammelmailAm: null,
      supervisorData: {
        is: { vertragsbeginn: { gte: new Date(heute.getTime() - TAG_MS), lt: new Date(heute.getTime() + 5 * TAG_MS) } },
      },
      checklistItems: { some: offeneAusstattung() },
    },
    select: SAMMELMAIL_VORGANG,
  });

  // Einmal je Lauf und nur bei Bedarf: Stellen-Namen und HR-Postfach.
  let konfigs: Awaited<ReturnType<typeof konfigsLaden>> | null = null;
  let hrPostfach: string | null = null;

  for (const v of kandidaten) {
    if (!sammelmailFaellig(v.supervisorData?.vertragsbeginn ?? null, jetzt)) continue;
    let beansprucht = false;
    try {
      const offen = await prisma.checklistItem.findMany({
        where: offeneAusstattung(v.id),
        select: { title: true, assignee: true },
        orderBy: [{ orderIndex: "asc" }, { category: "asc" }],
      });
      if (offen.length === 0) continue; // inzwischen erledigt

      konfigs ??= await konfigsLaden();
      if (hrPostfach === null) {
        const smtp = await prisma.smtpConfig.findUnique({ where: { id: "default" }, select: { replyToEmail: true } });
        hrPostfach = smtp?.replyToEmail?.trim() ?? "";
      }

      const anspruch = await prisma.onboardingProcess.updateMany({
        where: { id: v.id, ausstattungSammelmailAm: null, status: { notIn: [...ONBOARDING_ENDSTATUS] } },
        data: { ausstattungSammelmailAm: jetzt },
      });
      if (anspruch.count !== 1) continue;
      beansprucht = true;

      const liste = sammelmailListenFelder({
        aufgaben: offen,
        arbeitsortId: onboardingEmpfaengerEinrichtung(v),
        konfigs,
      });
      const mail = await triggerWebhooks(SAMMELMAIL_EVENT, {
        // Name nie leer und nie eine Adresse (MITARBEITER_NEUTRAL), Vertragsbeginn TT.MM.JJJJ.
        ...onboardingAbteilungsMailFelder(v),
        hr_postfach: hrPostfach,
        ...liste,
        portalLink: ausstattungPortalLink(v.id),
      });
      // Ab hier ist entschieden, was mit dem Merker geschieht — eine Ausnahme
      // beim Protokoll setzt ihn nicht mehr zurueck (sonst kaeme die Mail doppelt).
      beansprucht = false;

      if (mail?.status === "SENT") {
        ergebnis.sammelmail.versendet++;
        try {
          await prisma.auditLog.create({
            data: {
              userId: null,
              onboardingId: v.id,
              processType: "ONBOARDING",
              action: AUSSTATTUNG_AUDIT.SAMMELMAIL_GESENDET,
              details: {
                anzahlOffen: liste.anzahl_offen,
                stellen: [...new Set(offen.map((a) => a.assignee).filter((k): k is string => !!k))].sort(),
              },
            },
          });
        } catch (err) {
          console.error(`[Ausstattung] Protokoll der Sammelmail fehlgeschlagen (${v.id}):`, fehlerKennung(err));
          ergebnis.errors++;
        }
      } else if (mail?.status === "SKIPPED") {
        ergebnis.sammelmail.uebersprungen++;
      } else {
        ergebnis.sammelmail.nichtZugestellt++;
        await merkerZuruecksetzen(v.id, jetzt);
      }
    } catch (err) {
      console.error(`[Ausstattung] Sammelmail fehlgeschlagen (${v.id}):`, fehlerKennung(err));
      ergebnis.errors++;
      if (beansprucht) await merkerZuruecksetzen(v.id, jetzt);
    }
  }
  return ergebnis;
}

// =============================================
// Loeschfrist der Freitexte (S20, E-A22)
// =============================================

/**
 * Ergebnis von `ausstattungFreitexteLeeren` — im Probelauf, was geleert
 * wuerde (`fehler` dann immer 0). Nur Zaehler.
 */
export interface FreitexteLeerenErgebnis {
  /** Vorgaenge mit mindestens einem (zu) leerenden Freitext. */
  vorgaenge: number;
  /** Ausstattungszeilen, deren Bemerkung bzw. Angabe geleert wurde. */
  geleert: number;
  /** Hinweise an Stellen, deren Text geleert wurde. */
  hinweiseGeleert: number;
  /** Vorgaenge, bei denen das Leeren scheiterte — der naechste Lauf versucht es erneut. */
  fehler: number;
}

/** Ein leeres Ergebnis (auch fuer den Rueckfall des Aufrufers bei einer Ausnahme). */
export function leeresFreitexteErgebnis(): FreitexteLeerenErgebnis {
  return { vorgaenge: 0, geleert: 0, hinweiseGeleert: 0, fehler: 0 };
}

/**
 * Ausstattungszeile mit Freitext (Bemerkung oder Angabe), noch nicht geleert.
 * Zeilen ohne Freitext bleiben unberuehrt — es gibt an ihnen nichts zu leeren,
 * und der Lauf faende sie sonst jeden Tag wieder.
 */
const ZEILE_MIT_FREITEXT: Prisma.OnboardingAusstattungWhereInput = {
  inhaltGeleertAm: null,
  OR: [{ bemerkung: { not: null } }, { angabe: { not: null } }],
};

/** Hinweis an eine Stelle mit Text, noch nicht geleert ("" = entfernt bzw. schon geleert). */
const HINWEIS_MIT_TEXT: Prisma.OnboardingStellenHinweisWhereInput = {
  inhaltGeleertAm: null,
  text: { not: "" },
};

/**
 * Vorgaenge, deren Freitexte faellig sind: abgeschlossen (`completedAt`) bzw.
 * abgebrochen (`expiredAt`, F12) vor der Grenze. Fehlt der Zeitstempel (vor
 * F12 abgebrochen), gilt `updatedAt` — konservativ: Er liegt nie vor dem
 * Statuswechsel, das Leeren kommt also hoechstens spaeter, nie frueher. Nur
 * Vorgaenge, an denen noch etwas zu leeren ist.
 */
function freitexteFaelligWhere(grenze: Date): Prisma.OnboardingProcessWhereInput {
  return {
    AND: [
      {
        OR: [
          { status: "COMPLETED", completedAt: { lt: grenze } },
          { status: "COMPLETED", completedAt: null, updatedAt: { lt: grenze } },
          { status: "EXPIRED", expiredAt: { lt: grenze } },
          { status: "EXPIRED", expiredAt: null, updatedAt: { lt: grenze } },
        ],
      },
      { OR: [{ ausstattung: { some: ZEILE_MIT_FREITEXT } }, { stellenHinweise: { some: HINWEIS_MIT_TEXT } }] },
    ],
  };
}

/**
 * Leert Bemerkungen, Angaben und Hinweise abgeschlossener bzw. abgebrochener
 * Vorgaenge (E-A22), eigener Block im Lauf „Aufbewahrung erzeugter
 * Dokumente“. `grenze` kommt aus `freitextGrenze(jetzt)` (sechs Monate,
 * Berliner Kalendertag).
 *
 *   - `OnboardingAusstattung`: `bemerkung` und `angabe` → `null`
 *   - `OnboardingStellenHinweis`: `text` → `""`
 *   - in beiden `inhaltGeleertAm = jetzt` (steht im WHERE: nie zweimal)
 *
 * Die Zeilen bleiben stehen (Nachweis, was gewaehlt war; die Aufgaben der
 * Checkliste sind ohnehin nie Freitext). Je Vorgang EINE Transaktion samt
 * Protokoll `AUSSTATTUNG_FREITEXTE_GELEERT` (nur Anzahlen); scheitert sie,
 * zaehlt `fehler`, und der naechste Lauf versucht es erneut — die uebrigen
 * Vorgaenge laufen weiter. Der Vorgang braucht keine Sperre: COMPLETED und
 * EXPIRED sind endgueltig, die Karte ist dann nur lesbar und der Link
 * nimmt nichts mehr an.
 *
 * Probelauf (`dryRun`): zaehlt nur, schreibt nichts.
 */
export async function ausstattungFreitexteLeeren(opts: {
  grenze: Date;
  dryRun: boolean;
  jetzt?: Date;
}): Promise<FreitexteLeerenErgebnis> {
  const ergebnis = leeresFreitexteErgebnis();
  const faellig = await prisma.onboardingProcess.findMany({
    where: freitexteFaelligWhere(opts.grenze),
    select: { id: true },
  });
  if (faellig.length === 0) return ergebnis;
  const ids = faellig.map((v) => v.id);

  if (opts.dryRun) {
    ergebnis.vorgaenge = ids.length;
    ergebnis.geleert = await prisma.onboardingAusstattung.count({
      where: { onboardingId: { in: ids }, ...ZEILE_MIT_FREITEXT },
    });
    ergebnis.hinweiseGeleert = await prisma.onboardingStellenHinweis.count({
      where: { onboardingId: { in: ids }, ...HINWEIS_MIT_TEXT },
    });
    return ergebnis;
  }

  const jetzt = opts.jetzt ?? new Date();
  for (const onboardingId of ids) {
    try {
      const r = await prisma.$transaction(async (tx) => {
        const zeilen = await tx.onboardingAusstattung.updateMany({
          where: { onboardingId, ...ZEILE_MIT_FREITEXT },
          data: { bemerkung: null, angabe: null, inhaltGeleertAm: jetzt },
        });
        const hinweise = await tx.onboardingStellenHinweis.updateMany({
          where: { onboardingId, ...HINWEIS_MIT_TEXT },
          data: { text: "", inhaltGeleertAm: jetzt },
        });
        if (zeilen.count + hinweise.count > 0) {
          await tx.auditLog.create({
            data: {
              userId: null,
              onboardingId,
              processType: "ONBOARDING",
              action: AUSSTATTUNG_AUDIT.FREITEXTE_GELEERT,
              details: {
                zeilen: zeilen.count,
                hinweise: hinweise.count,
                aufbewahrungMonate: FREITEXT_AUFBEWAHRUNG_MONATE,
              },
            },
          });
        }
        return { zeilen: zeilen.count, hinweise: hinweise.count };
      });
      if (r.zeilen + r.hinweise > 0) ergebnis.vorgaenge++;
      ergebnis.geleert += r.zeilen;
      ergebnis.hinweiseGeleert += r.hinweise;
    } catch (err) {
      console.error(`[Ausstattung] Freitexte nicht geleert (${onboardingId}):`, fehlerKennung(err));
      ergebnis.fehler++;
    }
  }
  return ergebnis;
}
