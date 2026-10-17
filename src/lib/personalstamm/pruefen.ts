/**
 * Personalstamm aus DokuBit (Self-Service, Paket S0): der Block „Zu prüfen"
 * der Leseansicht „Personen" (GET /api/personalstamm/pruefen).
 *
 * Drei Gruppen (Plan 5.1), beim Oeffnen der Seite gerechnet — also auch dann
 * sichtbar, wenn der Abgleich gar nicht mehr startet:
 *
 *   nichtGeliefert          aktive DokuBit-Personen ohne Lieferung seit mehr
 *                           als WAECHTER_STUNDEN (26 h, wie der Waechter im
 *                           Zeitplaner). Zugleich die Vollstaendigkeitspruefung:
 *                           Ein halber Lauf faellt hier auf, ohne dass er
 *                           jemanden stilllegt.
 *   meldungen               Fehler und Zweifelsfaelle aus den Lauf-Eintraegen
 *                           (PERSONALSTAMM_LAUF) der letzten Stunden, je Vertrag
 *                           und Grundcode einmal.
 *   abgewieseneAnmeldungen  ANMELDUNG_ABGEWIESEN der letzten Tage, je Adresse
 *                           zusammengefasst. Bis S1/S2 leer.
 *
 * Behoben wird an der Quelle (DokuBit); der naechste Lauf raeumt den Eintrag
 * von selbst ab. Eine Zuordnung von Hand gibt es nicht.
 *
 * Namen stehen nur in `nichtGeliefert` — die Route ist auf die HR-Rollen
 * beschraenkt. Die Lauf-Eintraege selbst enthalten weder Namen noch Adressen.
 */

import { prisma } from "@/lib/db";
import {
  ANMELDUNG_ABGEWIESEN_ACTION,
  PERSONALSTAMM_ABGEWIESEN_TAGE,
  PERSONALSTAMM_ACTIONS,
  PERSONALSTAMM_GRUNDCODE_LABELS,
  PERSONALSTAMM_MELDUNGEN_STUNDEN,
  PERSONALSTAMM_NICHT_GELIEFERT_LISTE,
  PERSONALSTAMM_QUELLE,
  type PersonalstammGrundcode,
} from "@/lib/constants";
import { WAECHTER_STUNDEN } from "@/lib/zeitplaner/katalog";

const STUNDE_MS = 60 * 60 * 1000;

/** Obergrenze je Protokoll-Abfrage — gegen ein geflutetes Protokoll, nicht fuer den Alltag. */
const PROTOKOLL_LESEGRENZE = 1000;

export interface NichtGeliefertePerson {
  id: string;
  name: string;
  /** ISO-Zeitpunkt der letzten Lieferung; null = nie geliefert. */
  lastSyncAt: string | null;
}

export interface PersonalstammMeldung {
  /**
   * "742|AK|MANR", bei einem Formatfehler ohne lesbaren Schluessel
   * "zeile:<index>" (Index im Stapel ab 0; nur mit `zuletzt` zu verorten).
   */
  schluessel: string;
  code: string;
  label: string;
  /** In wie vielen Laeufen des Zeitfensters gemeldet. */
  anzahl: number;
  /** ISO-Zeitpunkt des juengsten Laufs mit dieser Meldung. */
  zuletzt: string;
}

export interface AbgewieseneAnmeldung {
  /** Die abgewiesene Adresse; null, wenn der Eintrag keine traegt. */
  email: string | null;
  anzahl: number;
  zuletzt: string;
}

export type PersonalstammHinweis = "rot" | "gelb" | null;

export interface PersonalstammPruefung {
  nichtGeliefert: { anzahl: number; personen: NichtGeliefertePerson[] };
  meldungen: PersonalstammMeldung[];
  abgewieseneAnmeldungen: AbgewieseneAnmeldung[];
  /** ISO-Zeitpunkt des juengsten Lauf-Eintrags; null = noch kein Abgleich. */
  letzterLauf: string | null;
  hinweis: PersonalstammHinweis;
}

interface ProtokollZeile {
  createdAt: Date;
  details: unknown;
}

// =============================================
// Reine Rechnung (ohne Datenbank, einzeln pruefbar)
// =============================================

/** Die Meldungen eines Lauf-Eintrags; Unlesbares wird uebergangen. */
function meldungenAus(details: unknown): { schluessel: string; code: string }[] {
  if (!details || typeof details !== "object") return [];
  const roh = (details as Record<string, unknown>).meldungen;
  if (!Array.isArray(roh)) return [];
  const meldungen: { schluessel: string; code: string }[] = [];
  for (const m of roh) {
    if (!m || typeof m !== "object") continue;
    const { schluessel, code } = m as Record<string, unknown>;
    if (typeof schluessel === "string" && typeof code === "string") meldungen.push({ schluessel, code });
  }
  return meldungen;
}

/**
 * Fasst die Meldungen der Lauf-Eintraege je Vertrag und Grundcode zusammen.
 *
 * Abraeumen: Massgeblich fuer einen Vertrag ist der JUENGSTE Lauf, der ihn
 * gemeldet hat. Ein Code, den dieser Lauf fuer den Vertrag nicht mehr nennt,
 * entfaellt — der Vertrag lief dort mit einem anderen Grund durch. Ein Vertrag,
 * der spaeter ganz ohne Meldung durchlief, ist im Protokoll nicht zu sehen
 * (es nennt nur Zeilen mit Grundcode); seine Meldung bleibt stehen, bis sie aus
 * dem Zeitfenster faellt. Bei einem taeglichen Lauf ist das der naechste Lauf.
 *
 * Eine Zeile ohne lesbaren Schluessel („zeile:<index>") ist nur innerhalb
 * ihres Laufs eindeutig — Index 5 im einen Stapel ist eine andere Zeile als
 * Index 5 im naechsten. Sie wird deshalb je Lauf gefuehrt, nie zusammengezaehlt.
 */
export function meldungenZusammenfassen(laeufe: ProtokollZeile[]): PersonalstammMeldung[] {
  const neuesteZuerst = [...laeufe].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  // Schluessel → Codes im juengsten Lauf, der den Schluessel gemeldet hat
  const geltendeCodes = new Map<string, Set<string>>();
  const gruppen = new Map<string, { schluessel: string; code: string; anzahl: number; zuletzt: Date }>();

  for (const lauf of neuesteZuerst) {
    const meldungen = meldungenAus(lauf.details);

    const imLauf = new Map<string, Set<string>>();
    for (const m of meldungen) {
      if (!imLauf.has(m.schluessel)) imLauf.set(m.schluessel, new Set());
      imLauf.get(m.schluessel)!.add(m.code);
    }
    for (const [schluessel, codes] of imLauf) {
      if (!geltendeCodes.has(schluessel)) geltendeCodes.set(schluessel, codes);
    }

    for (const m of meldungen) {
      if (!geltendeCodes.get(m.schluessel)!.has(m.code)) continue;
      const k = m.schluessel.startsWith("zeile:")
        ? `${m.schluessel}\u0000${m.code}\u0000${lauf.createdAt.getTime()}`
        : `${m.schluessel}\u0000${m.code}`;
      const vorhanden = gruppen.get(k);
      if (vorhanden) vorhanden.anzahl += 1;
      else gruppen.set(k, { ...m, anzahl: 1, zuletzt: lauf.createdAt });
    }
  }

  return [...gruppen.values()]
    .sort((a, b) => b.zuletzt.getTime() - a.zuletzt.getTime() || a.schluessel.localeCompare(b.schluessel))
    .map((g) => ({
      schluessel: g.schluessel,
      code: g.code,
      label: PERSONALSTAMM_GRUNDCODE_LABELS[g.code as PersonalstammGrundcode] ?? g.code,
      anzahl: g.anzahl,
      zuletzt: g.zuletzt.toISOString(),
    }));
}

/** Fasst abgewiesene Anmeldungen je Adresse (klein, getrimmt) zusammen, juengste zuerst. */
export function abgewieseneZusammenfassen(eintraege: ProtokollZeile[]): AbgewieseneAnmeldung[] {
  const gruppen = new Map<string | null, { anzahl: number; zuletzt: Date }>();
  for (const e of eintraege) {
    const roh =
      e.details && typeof e.details === "object" ? (e.details as Record<string, unknown>).email : undefined;
    const email = typeof roh === "string" && roh.trim() !== "" ? roh.trim().toLowerCase() : null;
    const vorhanden = gruppen.get(email);
    if (!vorhanden) gruppen.set(email, { anzahl: 1, zuletzt: e.createdAt });
    else {
      vorhanden.anzahl += 1;
      if (e.createdAt > vorhanden.zuletzt) vorhanden.zuletzt = e.createdAt;
    }
  }
  return [...gruppen.entries()]
    .sort(([, a], [, b]) => b.zuletzt.getTime() - a.zuletzt.getTime())
    .map(([email, g]) => ({ email, anzahl: g.anzahl, zuletzt: g.zuletzt.toISOString() }));
}

/** Rot, solange jemand nicht geliefert wurde; sonst gelb, solange etwas zu pruefen ist. */
export function hinweisBerechnen(nichtGeliefert: number, uebrige: number): PersonalstammHinweis {
  if (nichtGeliefert > 0) return "rot";
  if (uebrige > 0) return "gelb";
  return null;
}

// =============================================
// Lesen
// =============================================

export async function personalstammPruefen(opts: { jetzt?: Date } = {}): Promise<PersonalstammPruefung> {
  const jetzt = opts.jetzt ?? new Date();
  const lieferGrenze = new Date(jetzt.getTime() - WAECHTER_STUNDEN * STUNDE_MS);
  const meldungenAb = new Date(jetzt.getTime() - PERSONALSTAMM_MELDUNGEN_STUNDEN * STUNDE_MS);
  const abgewiesenAb = new Date(jetzt.getTime() - PERSONALSTAMM_ABGEWIESEN_TAGE * 24 * STUNDE_MS);

  // null zaehlt mit: Eine Person mit Quelle DOKUBIT, aber ohne Lieferung
  // (etwa ueber POST /api/employees angelegt), wurde nie geliefert.
  const nichtGeliefertWhere = {
    isActive: true,
    importSource: PERSONALSTAMM_QUELLE,
    OR: [{ lastSyncAt: { lt: lieferGrenze } }, { lastSyncAt: null }],
  };

  const [anzahl, personen, laeufe, abgewiesene, juengsterLauf] = await Promise.all([
    prisma.employee.count({ where: nichtGeliefertWhere }),
    prisma.employee.findMany({
      where: nichtGeliefertWhere,
      select: { id: true, firstName: true, lastName: true, lastSyncAt: true },
      orderBy: [{ lastSyncAt: "asc" }, { lastName: "asc" }, { firstName: "asc" }],
      take: PERSONALSTAMM_NICHT_GELIEFERT_LISTE,
    }),
    prisma.auditLog.findMany({
      where: { action: PERSONALSTAMM_ACTIONS.LAUF, createdAt: { gte: meldungenAb } },
      select: { createdAt: true, details: true },
      orderBy: { createdAt: "desc" },
      take: PROTOKOLL_LESEGRENZE,
    }),
    prisma.auditLog.findMany({
      where: { action: ANMELDUNG_ABGEWIESEN_ACTION, createdAt: { gte: abgewiesenAb } },
      select: { createdAt: true, details: true },
      orderBy: { createdAt: "desc" },
      take: PROTOKOLL_LESEGRENZE,
    }),
    prisma.auditLog.findFirst({
      where: { action: PERSONALSTAMM_ACTIONS.LAUF },
      select: { createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const meldungen = meldungenZusammenfassen(laeufe);
  const abgewieseneAnmeldungen = abgewieseneZusammenfassen(abgewiesene);

  return {
    nichtGeliefert: {
      anzahl,
      personen: personen.map((p) => ({
        id: p.id,
        name: `${p.firstName} ${p.lastName}`.trim(),
        lastSyncAt: p.lastSyncAt ? p.lastSyncAt.toISOString() : null,
      })),
    },
    meldungen,
    abgewieseneAnmeldungen,
    letzterLauf: juengsterLauf ? juengsterLauf.createdAt.toISOString() : null,
    hinweis: hinweisBerechnen(anzahl, meldungen.length + abgewieseneAnmeldungen.length),
  };
}
