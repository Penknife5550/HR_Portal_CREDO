/**
 * Zeitplaner — Takt, Uebersicht und Einstellungen (Server).
 *
 * Der Takt kommt jede Minute von der Uhr im selben Prozess (uhr.ts →
 * POST /api/zeitplaner/takt) und startet jeden faelligen Lauf im Hintergrund.
 * Die Einstellungsseite liest `uebersichtLaden` und schreibt ueber
 * `einstellungAendern` / `handStarten` — Texte, Ampeln und erlaubte Aktionen
 * kommen fertig von hier, die Seite rechnet nichts selbst.
 */

import { prisma } from "@/lib/db";
import { fehlerKennung } from "@/lib/fehler-kennung";
import { formatKalendertag, tageSpaeter } from "@/lib/kalendertag";
import {
  AUSLOESER_TEXTE,
  ERGEBNIS_TEXTE,
  LAEUFE,
  SPERRE_VERWAIST_MS,
  laufDefinition,
  type LaufAusloeser,
  type LaufDefinition,
  type LaufErgebnisArt,
  type LaufSchluessel,
} from "./katalog";
import { berlinerZeit, laufAusgeblieben, laufFaellig, naechsterLauf, tagErledigtNachAenderung } from "./faelligkeit";
import { ABGEBROCHEN, ZEITPLANER_MELDUNGEN, einstellungenLaden, laufImHintergrundStarten } from "./ausfuehren";
import { zeitplanerZustand } from "./uhr";
import type { ZaehlerZeile } from "./bericht";

// ---------------------------------------------
// Takt
// ---------------------------------------------

/** Startet alle jetzt faelligen Laeufe im Hintergrund. Liefert ihre Schluessel. */
export async function taktAusfuehren(jetzt: Date = new Date()): Promise<LaufSchluessel[]> {
  const einstellungen = await einstellungenLaden();
  const gestartet: LaufSchluessel[] = [];
  for (const e of einstellungen) {
    const def = laufDefinition(e.schluessel);
    if (!def || !laufFaellig(e, jetzt)) continue;
    try {
      const anspruch = await laufImHintergrundStarten(def.schluessel, { ausloeser: "ZEITPLAN", jetzt });
      if (anspruch) gestartet.push(def.schluessel);
    } catch (fehler) {
      console.error(`[Zeitplaner] Start ${def.schluessel} fehlgeschlagen:`, fehlerKennung(fehler));
    }
  }
  return gestartet;
}

// ---------------------------------------------
// Uebersicht fuer Einstellungen → Automatische Läufe
// ---------------------------------------------

export interface ProtokollZeile {
  id: string;
  gestartetAm: string;
  beendetAm: string | null;
  ausloeser: string;
  probelauf: boolean;
  ergebnis: LaufErgebnisArt;
  ergebnisText: string;
  zaehler: ZaehlerZeile[];
  schritte: string[];
  fehler: string | null;
  berichtMail: string | null;
}

export interface LaufZeile {
  definition: LaufDefinition;
  aktiv: boolean;
  uhrzeit: string;
  nurWerktags: boolean;
  probelauf: boolean;
  berichtBeiErfolg: boolean;
  laeuft: boolean;
  /** „heute 08:00“, „morgen 08:00“, „Mo., 05.10.2026 08:00“ — oder null (aus). */
  naechsterLaufText: string | null;
  /** Rote Zeile: aktiv, aber der letzte Termin wurde nicht erledigt. */
  ausgeblieben: boolean;
  /**
   * Loeschlauf ohne erfolgreichen Probelauf: Scharf (einschalten, „als
   * Probelauf“ abwaehlen, „Jetzt ausführen“) geht erst nach einem Probelauf.
   */
  probelaufFehlt: boolean;
  protokolle: ProtokollZeile[];
}

export interface Uebersicht {
  zeitplaner: {
    /** Laeuft die interne Uhr in diesem Prozess? */
    uhrAktiv: boolean;
    letzterTakt: string | null;
    hinweis: string | null;
  };
  laeufe: LaufZeile[];
}

const PROTOKOLLE_JE_LAUF = 15;

function naechsterText(tag: string, uhrzeit: string, heute: string): string {
  if (tag === heute) return `heute ${uhrzeit}`;
  if (tag === tageSpaeter(heute, 1)) return `morgen ${uhrzeit}`;
  return `${formatKalendertag(tag)} ${uhrzeit}`;
}

function alsZaehler(wert: unknown): ZaehlerZeile[] {
  return Array.isArray(wert) ? (wert as ZaehlerZeile[]) : [];
}

function alsSchritte(wert: unknown): string[] {
  return Array.isArray(wert) ? wert.filter((s): s is string => typeof s === "string") : [];
}

const PROBELAUF_ERFOLG = { probelauf: true, ergebnis: { in: ["OK", "PROBLEME"] } };

/** Gab es fuer diesen Lauf schon einen Probelauf, der nicht scheiterte? */
async function probelaufVorhanden(schluessel: LaufSchluessel): Promise<boolean> {
  const n = await prisma.automatischerLaufProtokoll.count({ where: { schluessel, ...PROBELAUF_ERFOLG } });
  return n > 0;
}

/**
 * Darf dieser Lauf jetzt scharf laufen? Loeschlaeufe erst nach einem
 * erfolgreichen Probelauf — geprueft beim Einschalten, beim Abwaehlen von
 * „als Probelauf“ und bei „Jetzt ausführen“ (die Oberflaeche sperrt nur mit).
 */
async function scharfGesperrt(def: LaufDefinition): Promise<boolean> {
  return def.loescht && def.kannProbelauf && !(await probelaufVorhanden(def.schluessel));
}

function probelaufFehltAntwort(def: LaufDefinition): DienstAntwort {
  return {
    status: 409,
    body: {
      error: `„${def.name}“ löscht endgültig. Bitte zuerst „Probelauf jetzt“ ausführen und das Ergebnis prüfen – oder den Lauf als Probelauf einschalten.`,
      grund: "PROBELAUF_FEHLT",
    },
  };
}

/** Sperre, die ein laufender Lauf haelt — eine verwaiste (aelter als 2 h) zaehlt nicht. */
function sperreAktiv(laeuftSeit: Date | null, jetzt: Date): boolean {
  return laeuftSeit !== null && laeuftSeit.getTime() > jetzt.getTime() - SPERRE_VERWAIST_MS;
}

export async function uebersichtLaden(jetzt: Date = new Date()): Promise<Uebersicht> {
  // Je Lauf eigene Abfrage (parallel): Eine gemeinsame Obergrenze liesse einen
  // oft gestarteten Lauf die Protokolle der anderen verdraengen.
  const [einstellungen, protokollListen, probelaeufe] = await Promise.all([
    einstellungenLaden(),
    Promise.all(
      LAEUFE.map((l) =>
        prisma.automatischerLaufProtokoll.findMany({
          where: { schluessel: l.schluessel },
          orderBy: { gestartetAm: "desc" },
          take: PROTOKOLLE_JE_LAUF,
        }),
      ),
    ),
    prisma.automatischerLaufProtokoll.groupBy({ by: ["schluessel"], where: PROBELAUF_ERFOLG, _count: { _all: true } }),
  ]);
  const heute = berlinerZeit(jetzt).tag;
  const nachSchluessel = new Map(einstellungen.map((e) => [e.schluessel, e]));
  const mitProbelauf = new Set(probelaeufe.map((p) => p.schluessel));

  const laeufe: LaufZeile[] = [];
  LAEUFE.forEach((def, i) => {
    const e = nachSchluessel.get(def.schluessel);
    if (!e) return;
    const naechster = naechsterLauf(e, jetzt);
    laeufe.push({
      definition: def,
      aktiv: e.aktiv,
      uhrzeit: e.uhrzeit,
      nurWerktags: e.nurWerktags,
      probelauf: e.probelauf,
      berichtBeiErfolg: e.berichtBeiErfolg,
      laeuft: sperreAktiv(e.laeuftSeit, jetzt),
      naechsterLaufText: naechster ? naechsterText(naechster.tag, naechster.uhrzeit, heute) : null,
      ausgeblieben: laufAusgeblieben(e, jetzt),
      probelaufFehlt: def.loescht && def.kannProbelauf && !mitProbelauf.has(def.schluessel),
      protokolle: protokollListen[i].map((p) => {
        // Ein Lauf, der seit ueber 2 h „läuft“, ist abgebrochen (Neustart) —
        // der naechste Anspruch schliesst die Zeile, bis dahin zeigt sie es.
        const verwaist = p.ergebnis === "LAEUFT" && p.gestartetAm.getTime() <= jetzt.getTime() - SPERRE_VERWAIST_MS;
        const ergebnis = (verwaist ? "FEHLER" : p.ergebnis) as LaufErgebnisArt;
        return {
          id: p.id,
          gestartetAm: p.gestartetAm.toISOString(),
          beendetAm: p.beendetAm?.toISOString() ?? null,
          ausloeser: AUSLOESER_TEXTE[p.ausloeser as LaufAusloeser] ?? p.ausloeser,
          probelauf: p.probelauf,
          ergebnis,
          ergebnisText: verwaist || p.fehler === ABGEBROCHEN ? "abgebrochen" : (ERGEBNIS_TEXTE[ergebnis] ?? p.ergebnis),
          zaehler: alsZaehler(p.zaehler),
          schritte: alsSchritte(p.schritte),
          fehler: verwaist ? ABGEBROCHEN : p.fehler,
          berichtMail: p.berichtMail,
        };
      }),
    });
  });

  const zustand = zeitplanerZustand();
  const irgendeinerAktiv = laeufe.some((l) => l.aktiv);
  return {
    zeitplaner: {
      uhrAktiv: zustand.uhrAktiv,
      letzterTakt: zustand.letzterTakt,
      hinweis: !zustand.uhrAktiv
        ? irgendeinerAktiv
          ? "Die Uhr des Zeitplaners läuft in diesem Portal nicht (ZEITPLANER_AKTIV). Eingeschaltete Läufe starten deshalb nicht von selbst."
          : "Die Uhr des Zeitplaners läuft in diesem Portal nicht (ZEITPLANER_AKTIV). „Jetzt ausführen“ funktioniert trotzdem."
        : null,
    },
    laeufe,
  };
}

// ---------------------------------------------
// Einstellungen aendern und von Hand starten
// ---------------------------------------------

export interface EinstellungAenderung {
  aktiv?: boolean;
  uhrzeit?: string;
  nurWerktags?: boolean;
  probelauf?: boolean;
  berichtBeiErfolg?: boolean;
}

export type DienstAntwort = { status: number; body: Record<string, unknown> };

export async function einstellungAendern(
  schluessel: string,
  aenderung: EinstellungAenderung,
  benutzerId: string,
  jetzt: Date = new Date(),
): Promise<DienstAntwort> {
  const def = laufDefinition(schluessel);
  if (!def) return { status: 404, body: { error: ZEITPLANER_MELDUNGEN.UNBEKANNT } };
  if (aenderung.probelauf === true && !def.kannProbelauf) {
    return { status: 400, body: { error: ZEITPLANER_MELDUNGEN.KEIN_PROBELAUF } };
  }
  const alt = (await einstellungenLaden()).find((e) => e.schluessel === def.schluessel);
  if (!alt) return { status: 404, body: { error: ZEITPLANER_MELDUNGEN.UNBEKANNT } };

  const neu = {
    aktiv: aenderung.aktiv ?? alt.aktiv,
    uhrzeit: aenderung.uhrzeit ?? alt.uhrzeit,
    nurWerktags: aenderung.nurWerktags ?? alt.nurWerktags,
    probelauf: aenderung.probelauf ?? alt.probelauf,
    berichtBeiErfolg: aenderung.berichtBeiErfolg ?? alt.berichtBeiErfolg,
  };
  const einschalten = neu.aktiv && !alt.aktiv;

  // Ein Loeschlauf wird erst scharf, wenn ein Probelauf gezeigt hat, was er
  // loeschen wuerde — beim Einschalten ebenso wie beim Abwaehlen von „als
  // Probelauf“ an einem schon eingeschalteten Lauf. Als Probelauf geht immer.
  const wirdScharf = neu.aktiv && !neu.probelauf && (einschalten || alt.probelauf);
  if (wirdScharf && (await scharfGesperrt(def))) return probelaufFehltAntwort(def);

  // Einschalten oder Uhrzeit verschieben: Liegt die Uhrzeit heute schon
  // zurueck, kommt der erste Lauf morgen (faelligkeit.ts).
  const zeitGeaendert = einschalten || neu.uhrzeit !== alt.uhrzeit || neu.nurWerktags !== alt.nurWerktags;
  const tagErledigt = zeitGeaendert ? tagErledigtNachAenderung({ uhrzeit: neu.uhrzeit, tagErledigt: alt.tagErledigt }, jetzt) : alt.tagErledigt;

  await prisma.$transaction([
    prisma.automatischerLauf.update({
      where: { schluessel: def.schluessel },
      data: { ...neu, tagErledigt, geaendertVonId: benutzerId },
    }),
    prisma.auditLog.create({
      data: {
        userId: benutzerId,
        action: "ZEITPLANER_GEAENDERT",
        details: {
          lauf: def.schluessel,
          vorher: {
            aktiv: alt.aktiv,
            uhrzeit: alt.uhrzeit,
            nurWerktags: alt.nurWerktags,
            probelauf: alt.probelauf,
            berichtBeiErfolg: alt.berichtBeiErfolg,
          },
          nachher: neu,
        },
      },
    }),
  ]);
  const naechster = naechsterLauf({ ...neu, tagErledigt }, jetzt);
  const heute = berlinerZeit(jetzt).tag;
  return {
    status: 200,
    body: {
      ok: true,
      naechsterLaufText: naechster ? naechsterText(naechster.tag, naechster.uhrzeit, heute) : null,
    },
  };
}

export async function handStarten(
  schluessel: string,
  probelauf: boolean,
  benutzerId: string,
): Promise<DienstAntwort> {
  const def = laufDefinition(schluessel);
  if (!def) return { status: 404, body: { error: ZEITPLANER_MELDUNGEN.UNBEKANNT } };
  if (probelauf && !def.kannProbelauf) return { status: 400, body: { error: ZEITPLANER_MELDUNGEN.KEIN_PROBELAUF } };
  if (!probelauf && (await scharfGesperrt(def))) return probelaufFehltAntwort(def);

  const anspruch = await laufImHintergrundStarten(def.schluessel, { ausloeser: "HAND", probelauf, benutzerId });
  if (!anspruch) return { status: 409, body: { error: ZEITPLANER_MELDUNGEN.LAEUFT_BEREITS } };

  await prisma.auditLog.create({
    data: {
      userId: benutzerId,
      action: "ZEITPLANER_HAND_AUSGEFUEHRT",
      details: { lauf: def.schluessel, probelauf: anspruch.probelauf, protokollId: anspruch.protokollId },
    },
  });
  return {
    status: 202,
    body: {
      ok: true,
      protokollId: anspruch.protokollId,
      meldung: anspruch.probelauf
        ? `Probelauf „${def.name}“ gestartet. Das Ergebnis erscheint gleich im Protokoll.`
        : `„${def.name}“ gestartet. Das Ergebnis erscheint gleich im Protokoll.`,
    },
  };
}
