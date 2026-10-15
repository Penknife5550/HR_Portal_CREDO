/**
 * CREDO HR-Portal – Ausstattung & Zugaenge: Aufgaben anlegen (nur Server)
 *
 * Schreibt in einer FREMDEN Transaktion (`tx` des Aufrufers). Aufrufer ist
 * das Nachholen im Onboarding-Adapter (`onboardingAusstattungNachholenIn`,
 * src/lib/abteilungsaufgaben-onboarding.ts) — nach der Abgabe der
 * Modalitaeten, vor jeder Aktion „Abteilungen informieren …“ und im
 * taeglichen Lauf. Die Regeln (welche Aufgabe, welcher Titel, welche
 * Reihenfolge) stehen rein in src/lib/ausstattung.ts.
 *
 * Feinplan 1.7, Schritte 2 bis 5 — in dieser Reihenfolge:
 *   2. Stand lesen (`ausstattungsStandLaden`) und die fehlenden Aufgaben
 *      bestimmen (`fehlendeAusstattungsAufgaben`: je Zeile `sollAufgaben`
 *      gegen die vorhandenen Verknuepfungen, dazu Hinweise ohne Aufgabe).
 *   3. Die Links der betroffenen Stellen sperren (`linksSperrenIn`) — dazu
 *      die Stellen, an die der Aufrufer gleich eine Mail schickt (F22). Die
 *      Sperrreihenfolge ist ueberall Vorgang → Links → Aufgaben (F5); der
 *      oeffentliche PATCH sperrt ebenso erst den Link, dann die Aufgabe.
 *   4. Je fehlender Aufgabe ein `ChecklistItem` und die Verknuepfung
 *      (`OnboardingAusstattungAufgabe`) bzw. beim Hinweis das bedingte
 *      `updateMany … checklistItemId: null`.
 *   5. Ist die Stelle schon informiert (Link mit `sentAt ?? lastSentAt`,
 *      gelesen NACH der Linksperre), je neuer Aufgabe ein Eintrag NEU in der
 *      Aenderungsliste (Regel 10).
 *
 * VORAUSSETZUNG: Der Aufrufer hat den Vorgang in dieser Transaktion schon
 * gesperrt (`vorgangSperrenIn`, Schritt 1). Nur so laufen zwei Anleger
 * nacheinander und der zweite findet die Zeilen des ersten (F4). Legen sie
 * trotzdem doppelt an, faengt der Primaerschluessel `(ausstattungId, option)`
 * das ab (P2002, Rollback; der Aufrufer loggt, nachgeholt wird spaeter); beim
 * Hinweis bricht das bedingte `updateMany` mit `HinweisSchonVerknuepft` ab.
 *
 * Neue Aufgaben bekommen `dueDate: null`; die Faelligkeit setzt danach
 * `faelligkeitenSetzen` (Schritt 6) — fuer Ausstattungsaufgaben mit
 * „Eilt“ (Regel 14).
 *
 * Seit S15 dazu die Bausteine der HR-Karte (src/lib/ausstattung-dienst.ts),
 * ebenfalls in fremder Transaktion und unter den Sperren des Aufrufers:
 *   aufgabeEntfallenIn         F2: offene Aufgaben „entfallen“ (bedingt)
 *   aufgabeWiederAufnehmenIn   F23: entfallene Aufgaben wieder oeffnen
 *   aenderungenSchreibenIn     Regel 10: Eintraege der Aenderungsliste, ohne
 *                              Doppel gegen den noch nicht gesendeten Stand
 */

import type { Prisma } from "@prisma/client";
import { linksSperrenIn, type LinkBereich } from "@/lib/abteilungsaufgaben-uebergaenge";
import { ausstattungsStandLaden } from "@/lib/ausstattung-daten";
import {
  AUSSTATTUNG_KATEGORIE,
  fehlendeAusstattungsAufgaben,
  type AenderungsEintrag,
  type FehlendeAufgabe,
} from "@/lib/ausstattung";

type Db = Prisma.TransactionClient;

/**
 * Der Hinweis hat inzwischen eine Aufgabe (bedingtes `updateMany` traf
 * nichts). Eigene Klasse, weil nur eine Ausnahme die Transaktion
 * zuruecknimmt — sonst bliebe eine Aufgabe ohne Verknuepfung stehen.
 */
export class HinweisSchonVerknuepft extends Error {
  constructor(readonly departmentKey: string) {
    super(`Hinweis an ${departmentKey} hat schon eine Aufgabe`);
    this.name = "HinweisSchonVerknuepft";
  }
}

/** Eine angelegte Aufgabe samt ihrer Checklisten-ID. */
export type AngelegteAufgabe = FehlendeAufgabe & { checklistItemId: string };

export interface AufgabenAnlage {
  angelegt: AngelegteAufgabe[];
  /** Stellen mit neuen Aufgaben (ohne Doppelte, in der Reihenfolge der Anlage). */
  stellen: string[];
  /** Davon die schon informierten — sie haben je neuer Aufgabe einen Eintrag NEU bekommen. */
  informiert: string[];
}

/**
 * Legt die fehlenden Ausstattungs- und Hinweis-Aufgaben eines Vorgangs an
 * (Feinplan 1.7, Schritte 2–5). `weitereStellen`: Stellen, deren Links
 * zusaetzlich gesperrt werden, weil der Aufrufer gleich an sie schreibt
 * (F22) — auch dann, wenn nichts fehlt.
 */
export async function ausstattungsAufgabenAnlegenIn(
  tx: Db,
  onboardingId: string,
  opts: { jetzt: Date; weitereStellen?: ReadonlyArray<string> },
): Promise<AufgabenAnlage> {
  const bereich: LinkBereich = { modul: "ONBOARDING", vorgangId: onboardingId };

  // 2. Was fehlt?
  const fehlend = fehlendeAusstattungsAufgaben(await ausstattungsStandLaden(tx, onboardingId));
  const stellen = [...new Set(fehlend.map((f) => f.departmentKey))];

  // 3. Links sperren (vor jeder Aufgabe, F5).
  await linksSperrenIn(tx, bereich, [...stellen, ...(opts.weitereStellen ?? [])]);
  if (fehlend.length === 0) return { angelegt: [], stellen: [], informiert: [] };

  // 4. Anlegen und verknuepfen.
  const angelegt: AngelegteAufgabe[] = [];
  for (const f of fehlend) {
    const item = await tx.checklistItem.create({
      data: {
        onboardingId,
        title: f.titel,
        category: AUSSTATTUNG_KATEGORIE,
        orderIndex: f.orderIndex,
        assignee: f.departmentKey,
        description: f.description,
        relativeDueDays: f.relativeDueDays,
        dueDate: null,
        templateItemId: null,
        herkunft: f.herkunft,
      },
      select: { id: true },
    });
    if (f.herkunft === "AUSSTATTUNG") {
      await tx.onboardingAusstattungAufgabe.create({
        data: { ausstattungId: f.ausstattungId, option: f.option, checklistItemId: item.id },
      });
    } else {
      const r = await tx.onboardingStellenHinweis.updateMany({
        where: { onboardingId, departmentKey: f.departmentKey, checklistItemId: null },
        data: { checklistItemId: item.id },
      });
      if (r.count !== 1) throw new HinweisSchonVerknuepft(f.departmentKey);
    }
    angelegt.push({ ...f, checklistItemId: item.id });
  }

  // 5. Aenderungsliste fuer schon informierte Stellen (gelesen nach der Linksperre).
  const links = await tx.offboardingDepartmentLink.findMany({
    where: { onboardingId, departmentKey: { in: stellen } },
    select: { departmentKey: true, sentAt: true, lastSentAt: true },
  });
  const informiert = stellen.filter((key) =>
    links.some((l) => l.departmentKey === key && (l.sentAt ?? l.lastSentAt) != null),
  );
  await aenderungenSchreibenIn(
    tx,
    onboardingId,
    angelegt
      .filter((a) => informiert.includes(a.departmentKey))
      .map((a) => ({ departmentKey: a.departmentKey, art: "NEU" as const, titel: a.titel })),
    { jetzt: opts.jetzt },
  );

  return { angelegt, stellen, informiert };
}

// =============================================
// HR-Karte (S15): entfallen, wieder aufnehmen, Aenderungsliste
// =============================================

/**
 * F2: Offene Aufgaben „entfallen“ — `entfaelltAm`, dazu `isCompleted`,
 * `completedAt` und `completedById` (die HR-Kraft), damit jede Zaehlung, die
 * „entfällt“ nicht kennt (Linkstatus, Erinnerung, Lauf), sie als nicht offen
 * sieht. BEDINGT auf offen und nicht entfallen: Hat die Stelle eine Aufgabe
 * gerade erst abgehakt, zaehlt sie nicht mit — der Aufrufer vergleicht die
 * Anzahl und rollt bei Abweichung zurueck (Regel 9: Erledigtes nie streichen).
 */
export async function aufgabeEntfallenIn(
  tx: Db,
  opts: { onboardingId: string; ids: ReadonlyArray<string>; jetzt: Date; userId: string | null },
): Promise<number> {
  if (opts.ids.length === 0) return 0;
  const r = await tx.checklistItem.updateMany({
    where: { onboardingId: opts.onboardingId, id: { in: [...opts.ids] }, isCompleted: false, entfaelltAm: null },
    data: { entfaelltAm: opts.jetzt, isCompleted: true, completedAt: opts.jetzt, completedById: opts.userId },
  });
  return r.count;
}

/**
 * F23: Entfallene Aufgaben wieder oeffnen, statt eine zweite anzulegen — die
 * Verknuepfung (Zeile/Option bzw. Hinweis) zeigt weiter auf sie, das Nachholen
 * faende sonst nichts zu tun, und die Stelle bekaeme die wieder gewaehlte
 * Position nie. Zuruecksetzen: `entfaelltAm`, `isCompleted`, `completedAt`,
 * `completedById`; die Stelle (`assignee`) folgt der Zeile (ein Stellenwechsel
 * kann dazwischen liegen). Eine Aufgabe mit Tagesangabe bekommt ihre
 * Faelligkeit neu (`dueDate: null`, `eilt: false` — `faelligkeitenSetzen`
 * rechnet im selben Nachholen nach Regel 14: nie vor heute, sonst „Eilt“);
 * ohne Tagesangabe bleibt die gespeicherte. Der Kommentar der Stelle bleibt
 * (E-A21). Liefert die Zahl der wieder geoeffneten Aufgaben.
 */
export async function aufgabeWiederAufnehmenIn(
  tx: Db,
  opts: { onboardingId: string; ids: ReadonlyArray<string>; departmentKey: string },
): Promise<number> {
  if (opts.ids.length === 0) return 0;
  const basis = { onboardingId: opts.onboardingId, id: { in: [...opts.ids] }, entfaelltAm: { not: null } };
  const offen = {
    entfaelltAm: null,
    isCompleted: false,
    completedAt: null,
    completedById: null,
    assignee: opts.departmentKey,
  };
  const mitTagen = await tx.checklistItem.updateMany({
    where: { ...basis, relativeDueDays: { not: null } },
    data: { ...offen, dueDate: null, eilt: false },
  });
  const ohneTage = await tx.checklistItem.updateMany({ where: basis, data: offen });
  return mitTagen.count + ohneTage.count;
}

/**
 * Regel 10: Eintraege in die Aenderungsliste schreiben (`erfasstAm = jetzt`).
 * Ein Eintrag, der dem LETZTEN noch nicht gesendeten Eintrag derselben Stelle
 * zum selben Titel gleicht, faellt weg — so schreiben Karte und Nachholen
 * (beide melden eine neue Aufgabe als NEU) nur einen, und ein zweites
 * „Bemerkung geändert“ vor dem Nachtrag bleibt einer. Folgen verschiedene Arten
 * aufeinander (NEU, dann ENTFAELLT), bleiben beide; zusammengefasst wird erst
 * beim Senden (S17, `nachtragListe`). Liefert die Zahl der geschriebenen.
 */
export async function aenderungenSchreibenIn(
  tx: Db,
  onboardingId: string,
  eintraege: ReadonlyArray<AenderungsEintrag>,
  opts: { jetzt: Date },
): Promise<number> {
  if (eintraege.length === 0) return 0;
  const offene = await tx.onboardingAusstattungAenderung.findMany({
    where: { onboardingId, departmentKey: { in: [...new Set(eintraege.map((e) => e.departmentKey))] }, gesendetAm: null },
    select: { departmentKey: true, art: true, titel: true },
    orderBy: { erfasstAm: "asc" },
  });
  const schluessel = (e: { departmentKey: string; titel: string }) => `${e.departmentKey}\u0000${e.titel}`;
  const letzte = new Map(offene.map((o) => [schluessel(o), o.art]));
  const neu: AenderungsEintrag[] = [];
  for (const e of eintraege) {
    if (letzte.get(schluessel(e)) === e.art) continue;
    letzte.set(schluessel(e), e.art);
    neu.push(e);
  }
  if (neu.length > 0) {
    await tx.onboardingAusstattungAenderung.createMany({
      data: neu.map((e) => ({ onboardingId, departmentKey: e.departmentKey, art: e.art, titel: e.titel, erfasstAm: opts.jetzt })),
    });
  }
  return neu.length;
}
