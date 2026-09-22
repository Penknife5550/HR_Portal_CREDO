/**
 * CREDO HR-Portal – Onboarding-Status aus beiden Spuren neu berechnen
 *
 * Serverseitige Haelfte zu src/lib/onboarding-spuren.ts. Die Regel selbst
 * (`gesamtStatus`) ist rein und steht dort; hier wird sie INNERHALB einer
 * laufenden Transaktion auf den frisch gelesenen Vorgang angewandt.
 *
 * WARUM ERST SPERREN, DANN LESEN, DANN SCHREIBEN. Fragebogen und Modalitaeten
 * koennen in derselben Sekunde abgesendet werden. Jeder Schreiber beansprucht
 * deshalb zuerst seine eigene Spur mit einem bedingten `updateMany` auf die
 * Vorgangszeile (z. B. `where: { id, submittedAt: null, … }`). Das UPDATE
 * sperrt die Zeile bis zum Commit. Kommt die Gegenseite dazwischen, wartet ihr
 * `updateMany`, bis wir committen, und Postgres prueft ihre WHERE-Bedingung
 * danach gegen den neuen Stand (READ COMMITTED, die Standardstufe; db.ts setzt
 * keine andere). Erst DANACH liest `statusAbgleichen` den Vorgang — und sieht
 * damit den Zeitstempel der Gegenseite, falls sie zuerst fertig war. Es kann
 * also nie passieren, dass beide lesen, bevor eine Seite geschrieben hat: Wer
 * zuletzt committet, berechnet „Bereit zur Prüfung".
 *
 * Deshalb die Regel (auch in CLAUDE.md): Den Onboarding-Status NIE direkt
 * setzen, sondern nach der eigenen Beanspruchung `statusAbgleichen` aufrufen.
 * Einzige Ausnahmen: die HR-Status im PATCH (REVIEWED/COMPLETED/EXPIRED) und
 * der Wechsel INVITED -> IN_PROGRESS beim ersten Speichern (bedingt auf
 * `status: "INVITED", submittedAt: null`, also ohne veralteten Lesestand).
 *
 * Getestet ist die Aufrufreihenfolge mit Mocks, nicht das Sperrverhalten von
 * Postgres selbst — die Garantie oben beruht auf der dokumentierten Semantik
 * von READ COMMITTED und ist nicht gegen eine echte Datenbank belegt.
 */

import type { Prisma } from "@prisma/client";
import { gesamtStatus, type OnboardingStatusWert } from "@/lib/onboarding-spuren";

export interface StatusAbgleich {
  von: OnboardingStatusWert;
  nach: OnboardingStatusWert;
}

/**
 * Liest den Vorgang in der laufenden Transaktion neu und schreibt den Status,
 * der sich aus beiden Spuren ergibt. Schreibt nur, wenn er sich aendert.
 *
 * NUR aufrufen, nachdem dieselbe Transaktion die Vorgangszeile mit einem
 * bedingten `updateMany` beansprucht hat — sonst liest sie womoeglich einen
 * Stand, den die Gegenseite gleich darauf ueberholt.
 */
export async function statusAbgleichen(
  tx: Prisma.TransactionClient,
  id: string,
): Promise<StatusAbgleich> {
  const vorgang = await tx.onboardingProcess.findUniqueOrThrow({
    where: { id },
    select: {
      status: true,
      submittedAt: true,
      supervisorSubmittedAt: true,
      supervisorToken: true,
      personalData: { select: { currentStep: true, isComplete: true } },
      supervisorData: { select: { isComplete: true } },
    },
  });

  const von = vorgang.status as OnboardingStatusWert;
  const nach = gesamtStatus(vorgang);
  if (nach !== von) {
    await tx.onboardingProcess.update({
      where: { id },
      data: { status: nach },
    });
  }
  return { von, nach };
}
