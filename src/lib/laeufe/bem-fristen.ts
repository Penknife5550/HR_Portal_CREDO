/**
 * Lauf „BEM-Fristen“ (vorher Inhalt der Route /api/cron/bem-fristen).
 *
 * Gestartet vom Zeitplaner des Portals (src/lib/zeitplaner/, Einstellungen →
 * Automatische Läufe); Handaufruf ueber die duenne Route POST /api/cron/bem-fristen (Bearer CRON_SECRET).
 *
 * Ablauf:
 * 1. Fristen aller nicht-geloeschten Faelle via syncBemFristen() aktualisieren.
 * 2. Offene Fristen bewerten (Severity). Bei Eskalation (Stufe gestiegen) eine
 *    interne Erinnerungs-Mail an die freigegebenen BEM-Beauftragten senden —
 *    gebuendelt pro Fall. letzteSeverity verhindert Mehrfach-Mails pro Stufe.
 *    Der Merker wird ERST NACH dem Versand gesetzt — wie bei den uebrigen
 *    Laeufen: bei SENT (mindestens ein Beauftragter) und bei SKIPPED (Vorlage
 *    aus; ein neuer Versuch am naechsten Tag aenderte nichts), nicht bei FAILED
 *    (der naechste Lauf versucht es erneut) und nicht, solange der Fall keine
 *    freigegebenen Beauftragten hat (die Erinnerung kommt, sobald jemand
 *    freigegeben ist).
 *
 * Mail: Vorlage `bem-frist-erinnerung` (Einstellungen → E-Mail-Vorlagen),
 * direkt ueber `sendEventEmail` mit `overrideTo` je Beauftragtem — NIE ueber
 * `triggerWebhooks` (dritte begruendete Ausnahme vom Dispatcher-Gebot, siehe
 * CLAUDE.md „E-Mail-Versand“ und EVENTS_OHNE_WEBHOOK): Empfaenger sind nur die
 * im Fall freigegebenen Beauftragten, ein Verteiler in der Vorlage greift nie,
 * und Fallnummer samt Fristart gehoeren an keine frei konfigurierbare
 * Webhook-URL.
 *
 * Datenschutz: Die Mail enthaelt nur Fall-Nummer + generische Frist-Bezeichnung
 * + Stichtag — KEINE Gesundheitsdaten. Empfaenger sind ausschliesslich die
 * freigegebenen internen Beauftragten.
 */

import { bemPfad } from "@/lib/adressen";
import { prisma } from "@/lib/db";
import { getBaseUrl } from "@/lib/url";
import { syncBemFristen, berechneSeverity } from "@/lib/bem-fristen";
import { sendEventEmail } from "@/lib/mailer";
import { escapeHtml } from "@/lib/email-layout";
import { formatDatumDE } from "@/lib/format";
import { logBemAudit, logBemKommunikation, BEM_AUDIT_ACTIONS } from "@/lib/bem-audit";
import type { BemFristSeverity } from "@prisma/client";
import { laufAntwort, type LaufErgebnis, type LaufOptionen } from "@/lib/laeufe/lauf-ergebnis";

const SEVERITY_RANK: Record<BemFristSeverity, number> = {
  INFO: 0,
  WARNING: 1,
  URGENT: 2,
  OVERDUE: 3,
};

const SEVERITY_LABEL: Record<BemFristSeverity, string> = {
  INFO: "Hinweis",
  WARNING: "Warnung",
  URGENT: "Dringend",
  OVERDUE: "Überfällig",
};

/** Event der Erinnerung — nur ueber diese Konstante, nie als zweites Literal. */
export const BEM_FRIST_EVENT = "bem-frist-erinnerung";

interface EskItem {
  fristId: string;
  bezeichnung: string;
  faelligAm: Date;
  severity: BemFristSeverity;
}

export async function bemFristenLauf(opts: LaufOptionen = {}): Promise<LaufErgebnis> {
  const now = opts.jetzt ?? new Date();
  try {
    // 1. Fristen synchronisieren
    const faelle = await prisma.bemFall.findMany({
      where: { status: { not: "GELOESCHT" } },
      select: { id: true },
    });
    for (const f of faelle) {
      await syncBemFristen(f.id); // wirft nicht
    }

    // 2. Offene Fristen bewerten + Eskalationen sammeln (pro Fall gebuendelt)
    const offene = await prisma.bemFrist.findMany({
      where: { erledigtAm: null },
      include: { bemFall: { select: { id: true, displayId: true } } },
    });

    const eskByFall = new Map<
      string,
      { displayId: string; items: EskItem[] }
    >();

    for (const frist of offene) {
      const severity = berechneSeverity(frist.faelligAm);
      const prevRank = frist.letzteSeverity ? SEVERITY_RANK[frist.letzteSeverity] : -1;
      if (SEVERITY_RANK[severity] <= prevRank) continue; // keine Eskalation

      const entry = eskByFall.get(frist.bemFall.id) ?? {
        displayId: frist.bemFall.displayId,
        items: [],
      };
      entry.items.push({
        fristId: frist.id,
        bezeichnung: frist.bezeichnung,
        faelligAm: frist.faelligAm,
        severity,
      });
      eskByFall.set(frist.bemFall.id, entry);
    }

    // 3. Eine Erinnerungs-Mail pro Fall an die freigegebenen Beauftragten
    const baseUrl = getBaseUrl();
    let mailsGesendet = 0;
    let mailsFehler = 0;
    let mailsUebersprungen = 0;
    let ohneEmpfaenger = 0;

    for (const [fallId, info] of eskByFall) {
      const zugriffe = await prisma.bemZugriff.findMany({
        where: { bemFallId: fallId, revokedAt: null },
        include: { user: { select: { email: true, isActive: true } } },
      });
      const empfaenger = zugriffe
        .map((z) => z.user)
        .filter((u) => u.isActive && u.email)
        .map((u) => u.email);
      if (empfaenger.length === 0) {
        ohneEmpfaenger++;
        continue;
      }

      // Datum in deutscher Zeit (der Container laeuft in UTC).
      const zeilen = info.items.map(
        (i) => `${i.bezeichnung}: fällig am ${formatDatumDE(i.faelligAm)} (${SEVERITY_LABEL[i.severity]})`,
      );
      const payloadBasis = {
        bemFallId: fallId,
        vorgangsnummer: info.displayId,
        displayId: info.displayId,
        anzahl_fristen: zeilen.length,
        fristen_liste: zeilen.map((z) => `- ${z}`).join("\n"),
        fristen_liste_html: `<ul>${zeilen.map((z) => `<li>${escapeHtml(z)}</li>`).join("")}</ul>`,
        portalLink: `${baseUrl}${bemPfad(fallId)}`,
      };

      // Eine eigene Mail PRO Empfaenger — so sieht niemand die Adressen der
      // anderen Beauftragten (kein To:-Verteiler) und der Versandnachweis ist
      // pro Person granular.
      let fallErfolg = false;
      let fallUebersprungen = false;
      for (const adr of empfaenger) {
        const sent = await sendEventEmail(BEM_FRIST_EVENT, { ...payloadBasis, email: adr }, { overrideTo: adr });
        const ok = sent.status === "SENT";
        await logBemKommunikation({
          bemFallId: fallId,
          kanal: "EMAIL",
          status: ok ? "GESENDET" : "FEHLGESCHLAGEN",
          empfaenger: adr,
          betreff: sent.subject ?? "BEM: Frist(en) fällig",
          messageId: ok ? (sent.messageId ?? null) : null,
          fehlertext: ok
            ? null
            : `${sent.status === "SKIPPED" ? "Übersprungen" : "Fehlgeschlagen"}: ${sent.detail ?? ""}`.slice(0, 500),
          gesendetById: null,
        });
        if (ok) {
          mailsGesendet++;
          fallErfolg = true;
        } else if (sent.status === "SKIPPED") {
          mailsUebersprungen++;
          fallUebersprungen = true;
        } else {
          mailsFehler++;
        }
      }
      // Merker nach dem Versand (Kopfkommentar): SENT oder SKIPPED ja, nur FAILED nein.
      if (fallErfolg || fallUebersprungen) {
        for (const item of info.items) {
          await prisma.bemFrist.update({
            where: { id: item.fristId },
            data: { letzteSeverity: item.severity, letzteWarnungAm: now },
          });
        }
      }
      await logBemAudit({
        bemFallId: fallId,
        userId: null,
        action: BEM_AUDIT_ACTIONS.FRIST_ERINNERUNG,
        details: {
          fristen: info.items.map((i) => i.bezeichnung),
          empfaengerAnzahl: empfaenger.length,
          erfolg: fallErfolg,
        },
      });
    }

    return laufAntwort({
      data: {
        faelleGeprueft: faelle.length,
        offeneFristen: offene.length,
        eskalierteFaelle: eskByFall.size,
        mailsGesendet,
        mailsFehler,
        mailsUebersprungen,
        ohneEmpfaenger,
      },
    });
  } catch (error) {
    console.error(
      "[cron/bem-fristen] POST fehlgeschlagen:",
      error instanceof Error ? error.message : error,
    );
    return laufAntwort({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
