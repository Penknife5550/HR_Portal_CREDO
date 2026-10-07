/**
 * Lauf „Vertragsende-Erinnerungen“ (vorher Inhalt der Route
 * /api/cron/contract-end-reminders).
 *
 * Erinnerungen an Vorgesetzte mit OFFENER Uebernahme-Anfrage.
 *
 * Gestartet vom Zeitplaner des Portals (src/lib/zeitplaner/, Einstellungen →
 * Automatische Läufe); Handaufruf ueber die duenne Route
 * POST /api/cron/contract-end-reminders (Bearer CRON_SECRET). Erinnert nur Vorgaenge im Status ANFRAGE_VORGESETZTER (bzw. der
 * Alt-Bestand ENTSCHEIDUNG_UEBERNAHME) mit gesetzter supervisorEmail.
 *
 * Das Intervall ist nach der Fristen-Ampel gestaffelt — je naeher das
 * Vertragsende, desto haeufiger wird erinnert:
 *   KRITISCH   (1-2 Mon)  -> alle 3 Tage
 *   WARNUNG    (3-6 Mon)  -> alle 7 Tage
 *   BEOBACHTEN (7-12 Mon) -> alle 14 Tage
 *   AUSSERHALB            -> keine Erinnerung
 * Vor der ersten Erinnerung muss die Anfrage mindestens das Intervall her sein
 * (Referenz: lastSupervisorReminderAt, sonst supervisorLinkSentAt).
 *
 * Gezaehlt wird nur eine Erinnerung, die hinausging (`sendSupervisorReminder`):
 * FAILED zaehlt nichts und laeuft morgen erneut (`erinnerungenNichtZugestellt`),
 * SKIPPED merkt sich nur den Tag (`erinnerungenUebersprungen`). Beides meldet
 * der Bericht des Zeitplaners als Problem.
 *
 * Zusaetzlich:
 *  - ESKALATION an HR (Event contract-end-eskalation), wenn zum
 *    Erinnerungszeitpunkt bereits >= 3 Erinnerungen ohne Antwort liefen —
 *    genau EINMAL je Anfrage (escalatedAt; Reset bei "Anfrage erneut senden").
 *    Nur im selben Lauf wie eine gezaehlte Erinnerung — sonst stuende in der
 *    Mail eine Erinnerung mehr, als hinausging.
 *  - MONTAGS-DIGEST an HR (Event contract-end-unbearbeitet): kritische/
 *    Warnung-Vorgaenge im Status ANGELEGT, fuer die noch keine Anfrage
 *    versendet wurde.
 */

import { vorgangPfad, vorgangslistePfad } from "@/lib/adressen";
import { prisma } from "@/lib/db";
import { triggerWebhooks } from "@/lib/webhooks";
import { getBaseUrl } from "@/lib/url";
import { escapeHtml } from "@/lib/email-layout";
import { sendSupervisorReminder } from "@/lib/contract-end-reminder";
import {
  getContractEndCategory,
  CONTRACT_END_CATEGORY_META,
  type ContractEndCategory,
} from "@/lib/contract-end-fristen";
import { laufAntwort, type LaufErgebnis, type LaufOptionen } from "@/lib/laeufe/lauf-ergebnis";

const MS_PER_DAY = 86400000;

// Erinnerungs-Intervall (Tage) je Ampel-Kategorie. null = keine Erinnerung.
const REMINDER_INTERVAL_DAYS: Record<ContractEndCategory, number | null> = {
  KRITISCH: 3,
  WARNUNG: 7,
  BEOBACHTEN: 14,
  AUSSERHALB: null,
};

// Ab so vielen erfolglosen Erinnerungen wird an HR eskaliert.
const ESKALATION_AB_ERINNERUNGEN = 3;

/**
 * Wochentag bewusst in Europe/Berlin bestimmen — der Docker-Container laeuft
 * in UTC, der fachliche "Montag" ist aber der deutsche.
 */
function istMontagInBerlin(d: Date): boolean {
  return (
    new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Berlin", weekday: "short" }).format(d) ===
    "Mon"
  );
}

export async function vertragsendeErinnerungenLauf(opts: LaufOptionen = {}): Promise<LaufErgebnis> {
  const now = opts.jetzt ?? new Date();
  const results = {
    reminders: 0,
    erinnerungenNichtZugestellt: 0,
    erinnerungenUebersprungen: 0,
    eskalationen: 0,
    unbearbeitetHinweis: 0,
    skipped: 0,
    errors: 0,
  };

  try {
    // Offene Vorgesetzten-Anfragen (neuer Prozess: ANFRAGE_VORGESETZTER;
    // ENTSCHEIDUNG_UEBERNAHME = Alt-Bestandsdaten).
    const offen = await prisma.contractEndProcess.findMany({
      where: {
        status: { in: ["ANFRAGE_VORGESETZTER", "ENTSCHEIDUNG_UEBERNAHME"] },
        supervisorEmail: { not: null },
        supervisorLinkSentAt: { not: null },
      },
      include: { organization: { select: { name: true } } },
    });

    for (const ce of offen) {
      try {
        // Abgelaufener Magic-Link: Erinnerung waere ein toter Link (410) und
        // eine Eskalation darauf unfair — HR muss "Anfrage erneut senden".
        if (!ce.supervisorTokenExpiresAt || new Date(ce.supervisorTokenExpiresAt) < now) {
          results.skipped++;
          continue;
        }

        const kategorie = getContractEndCategory(new Date(ce.contractEndDate), now);
        const intervall = REMINDER_INTERVAL_DAYS[kategorie];
        if (intervall == null) {
          results.skipped++;
          continue;
        }

        // Referenz fuer das Intervall: letzte Erinnerung, sonst der Anfrage-Versand.
        const referenz = ce.lastSupervisorReminderAt ?? ce.supervisorLinkSentAt!;
        const tageSeitReferenz = (now.getTime() - new Date(referenz).getTime()) / MS_PER_DAY;
        if (tageSeitReferenz < intervall) {
          results.skipped++;
          continue;
        }

        // Versand + Zaehler + Audit im gemeinsamen Helfer (auch vom manuellen
        // "Erinnerung senden"-Button genutzt)
        const { versand, gezaehlt } = await sendSupervisorReminder(ce, now);
        if (!gezaehlt) {
          if (versand.status === "FAILED") results.erinnerungenNichtZugestellt++;
          else results.erinnerungenUebersprungen++;
          continue;
        }

        results.reminders++;

        // ESKALATION an HR: liefen zum Erinnerungszeitpunkt bereits >= 3
        // Erinnerungen ohne Antwort, wird genau EINMAL je Anfrage eskaliert.
        if (ce.supervisorReminderCount >= ESKALATION_AB_ERINNERUNGEN && !ce.escalatedAt) {
          const tageOffen = Math.floor(
            (now.getTime() - new Date(ce.supervisorLinkSentAt!).getTime()) / MS_PER_DAY,
          );
          // sendSupervisorReminder hat den DB-Zaehler soeben erhoeht — das
          // in-memory ce ist stale, daher +1 fuer Mail und Audit.
          const anzahlErinnerungen = ce.supervisorReminderCount + 1;
          const mailResult = await triggerWebhooks("contract-end-eskalation", {
            contractEndId: ce.id,
            displayId: ce.displayId,
            mitarbeiter_name: `${ce.employeeFirstName} ${ce.employeeLastName}`,
            supervisorEmail: ce.supervisorEmail,
            einrichtung: ce.organization.name,
            organization: ce.organization.name,
            vertragsende: new Date(ce.contractEndDate).toLocaleDateString("de-DE"),
            contractEndDate: new Date(ce.contractEndDate).toISOString(),
            anzahl_erinnerungen: anzahlErinnerungen,
            tage_offen: tageOffen,
            dringlichkeit: CONTRACT_END_CATEGORY_META[kategorie].label,
            portalLink: `${getBaseUrl()}${vorgangPfad("vertragsende", ce.id)}`,
          });

          // Einmal-Marker NUR setzen, wenn die Mail wirklich raus ist —
          // SKIPPED (kein Empfaenger konfiguriert) oder FAILED darf die
          // einmalige Eskalation nicht verbrennen (naechster Lauf versucht
          // es erneut, bis der Empfaenger konfiguriert ist).
          if (mailResult?.status === "SENT") {
            await prisma.$transaction([
              prisma.contractEndProcess.update({
                where: { id: ce.id },
                data: { escalatedAt: now },
              }),
              prisma.auditLog.create({
                data: {
                  contractEndId: ce.id,
                  processType: "CONTRACT_END",
                  action: "ESKALATION_GESENDET",
                  details: {
                    anzahlErinnerungen,
                    tageOffen,
                    kategorie,
                    supervisorEmail: ce.supervisorEmail || "",
                  },
                },
              }),
            ]);
            results.eskalationen++;
          } else {
            console.warn(
              `[ContractEndReminders] Eskalation fuer ${ce.displayId} nicht zugestellt (${mailResult?.status ?? "unbekannt"}) — wird beim naechsten Lauf erneut versucht. Empfaenger in Einstellungen -> E-Mail-Versand konfigurieren.`,
            );
          }
        }
      } catch (err) {
        console.error(`[ContractEndReminders] Fehler bei ${ce.id}:`, err);
        results.errors++;
      }
    }

    // MONTAGS-DIGEST: kritische/Warnung-Vorgaenge, fuer die noch gar keine
    // Anfrage versendet wurde (Status ANGELEGT). Cron laeuft taeglich —
    // der Digest geht nur montags (Europe/Berlin) raus, hoechstens einmal
    // je Tag (EmailLog-Check gegen n8n-Retries), und nur bei nicht-leerer Liste.
    if (istMontagInBerlin(now)) {
      try {
        const tagesStart = new Date(now);
        tagesStart.setHours(0, 0, 0, 0);
        const heuteSchonGesendet = await prisma.emailLog.findFirst({
          where: {
            event: "contract-end-unbearbeitet",
            status: "SENT",
            isTest: false,
            createdAt: { gte: tagesStart },
          },
          select: { id: true },
        });

        if (!heuteSchonGesendet) {
          const unbearbeitet = await prisma.contractEndProcess.findMany({
            where: { status: "ANGELEGT" },
            include: { organization: { select: { name: true } } },
            orderBy: { contractEndDate: "asc" },
          });
          const kritische = unbearbeitet
            .map((ce) => ({
              ce,
              kategorie: getContractEndCategory(new Date(ce.contractEndDate), now),
            }))
            .filter(({ kategorie }) => kategorie === "KRITISCH" || kategorie === "WARNUNG");

          if (kritische.length > 0) {
            const zeile = ({ ce, kategorie }: (typeof kritische)[number]) =>
              `${ce.displayId} · ${ce.employeeFirstName} ${ce.employeeLastName} · ${ce.organization.name} · Vertragsende ${new Date(ce.contractEndDate).toLocaleDateString("de-DE")} (${CONTRACT_END_CATEGORY_META[kategorie].label})`;
            await triggerWebhooks("contract-end-unbearbeitet", {
              anzahl: kritische.length,
              liste_text: kritische.map(zeile).join("\n"),
              // Namen/Traeger stammen aus DokuBit — fuer den HTML-Teil escapen
              liste_html: kritische.map((k) => `<li>${escapeHtml(zeile(k))}</li>`).join(""),
              portalLink: `${getBaseUrl()}${vorgangslistePfad("vertragsende")}`,
            });
            results.unbearbeitetHinweis = kritische.length;
          }
        }
      } catch (err) {
        console.error("[ContractEndReminders] Fehler beim Unbearbeitet-Digest:", err);
        results.errors++;
      }
    }

    return laufAntwort({
      success: true,
      timestamp: now.toISOString(),
      ...results,
    });
  } catch (error) {
    console.error("[ContractEndReminders] Schwerer Fehler:", error);
    return laufAntwort({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
