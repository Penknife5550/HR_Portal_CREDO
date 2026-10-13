/**
 * CREDO HR-Portal – Ausstattung & Zugaenge, Stufe 2 (Paket A4): die reinen Regeln
 *
 * Worum es geht: Was eine Stelle beim Einstellen ausgibt (Dienst-iPad,
 * Schluessel, Transponder) bzw. einrichtet (Zugaenge), steht je Stueck in der
 * Tabelle `ausgaben` – vermerkt ueber „Übergabe vermerken“ an der
 * Ausstattungsaufgabe, getrennt vom Abhaken (E-A30). Ordnet HR einem Austritt
 * die Einstellung zu (E-A31), schlaegt das Portal daraus Rueckgaben sowie
 * Ruecknahme- und Sperraufgaben der ausgebenden Stelle vor (E-A32, E-A35);
 * Rueckgabezustaende, Abschluss mit Warnung und eine Folgeaufgabe fuer einen
 * fehlenden Schluessel kommen dazu (E-A33), geloescht wird nach festen Fristen
 * (E-A37). Plan: docs/module/onboarding/ausstattung-zugaenge-plan.html,
 * Feinplan: docs/module/onboarding/ausstattung-feinplan-a4.md (Abschnitt 1.3).
 *
 * Diese Datei enthaelt NUR Regeln: keine Datenbank, keinen Prisma-Import, keine
 * Uhr (Funktionen bekommen `jetzt` bzw. `heute`). Sie ist damit im Browser
 * nutzbar und ohne Datenbank testbar. Die Wertlisten stehen hier als
 * Zeichenketten (Zustaende sind keine Enums); src/__tests__/lib/ausstattung-
 * schema.test.ts haelt sie gegen die Kommentare in prisma/schema.prisma.
 *
 * Stand S22: Konstanten, Texte, Protokoll-Codes, Typen (S21) und alle
 * Funktionen aus Feinplan 1.3 – Fristen, Bindung an einen Austritt,
 * Vorschlaege, Lage, Aufgaben-Entwuerfe, Mailfelder, Anzeige und Protokoll-
 * Listen. Zod liegt in src/lib/validations/ausgaben.ts. Seit S23 die Rechnung
 * von „Rückgabe-Vorgaben übernehmen …“ (`rueckgabeVorgabenPlan`, Meldungen,
 * `A4_WEBHOOK_EREIGNISSE`; Server `rueckgabeVorgabenUebernehmen` in
 * src/lib/ausstattung-katalog.ts). Seit S24 das Ziel eines Vermerks
 * (`vermerkZielGrund`, `ausgabeBasis`, `vermerkStuecke`), der Tausch
 * (`tauschZustand`, `ersatzBasis`) und die Anzeige der Karte je Aufgabe
 * (`ausgabenAnzeigeBauen`, `protokollAnzeige`); Server:
 * src/lib/ausgaben-schreiben.ts (einziger Schreiber, G3),
 * src/lib/ausgaben-daten.ts (Lesen) und src/lib/ausgaben-dienst.ts (Karte).
 * Seit S25 das Feld `ausgabe` der Link-Seite (`linkAusgabeBauen`,
 * `linkStueckText`); Server: src/lib/abteilungsaufgaben-uebergaenge.ts
 * (`oeffentlicheAusgabeVermerken`, `oeffentlicheAusgabeEntfernen`).
 * Seit S27 die Frist bei der Absage der Einstellung (`absageFrist`, G10);
 * Server: `ausgabenFristBeiAbsageIn` (ausgaben-schreiben.ts) im EXPIRED-Zweig
 * von PATCH /api/onboarding/[id], die Liste der Absage-Mail
 * (`ausgabenListeMailFelder`) in src/lib/abteilungsaufgaben-dienst.ts.
 * Seit S28 die Zuordnung Austritt ↔ Einstellung: Anzeige und Suche
 * (`einstellungAnzeige`, `einstellungsTreffer`), der Hinweis vor dem
 * Informieren (`zuordnungEmpfohlen`), die Vorbelegung des Merkers
 * (`weitereBeschaeftigungVorbelegung`), der Arbeitsort am Austritt
 * (`arbeitsortBeiZuordnung`, `arbeitsortText`, `informierteStellen`, G12) und
 * die Kopfzeile des Reiters aus dem Bestand der Einstellung
 * (`rueckgabeLageAnzeige`); Server: src/lib/offboarding-ausgaben.ts.
 * Seit S30 der Gleichlauf von Ausgabe, Aufgabe und Rueckgabe-Zeile (G15 bis
 * G17): Zielzustand eines Hakens bzw. einer Wahl (`rueckgabeZiel`,
 * `rueckgabeZielAusEingabe`, `zustandFehler`), der Plan des Gleichlaufs
 * (`gleichlaufPlan`, `ausgabeNachZiel`), die Bindung aus Sicht des Austritts
 * (`gleichlaufGesperrt`) und das Feld `ausgabe` der Offboarding-Link-Seite
 * (`offboardingLinkAusgabeBauen`, `RUECKNAHME_AUSWAHL`); Server:
 * `ausgabeGleichlaufIn` (ausgaben-schreiben.ts) auf allen drei Wegen.
 * Seit S31 die Frist beim Abschluss des Austritts fuer offen gebliebene
 * Stuecke (`abschlussFrist`, G18); Server: `offeneAusgabenAbschliessenIn`
 * (ausgaben-schreiben.ts) und `offeneRueckgabenZaehlenIn`
 * (offboarding-ausgaben.ts) im COMPLETED-Zweig von PATCH /api/offboarding/[id].
 * Seit der Durchsicht von A4c: die Bindung eines abgeschlossenen Austritts am
 * Stand beim Austritt (`bezugBindet`, `abgeloesteAustritte` – der juengste
 * Bezug gilt), Wiederoeffnen nach „verbleibt“ = AUSGEGEBEN (`ausgabeNachZiel`
 * mit `warErledigt`), ein offen uebernommenes VERBLEIBT beim Abschluss
 * (`abschlussFrist` mit `hierOffen`) und der Fortschritt des Steppers
 * (`rueckgabenFortschritt`).
 *
 * Importrichtung (G1): Diese Datei darf Werte aus ausstattung.ts,
 * abteilungsaufgaben.ts, constants.ts, format.ts, kalendertag.ts,
 * vorgangsjahr.ts und minijob-fristen.ts lesen – dazu email-layout.ts, das
 * selbst nichts importiert (`escapeHtml` fuer die Mailfelder, Feinplan 1.3).
 * ausstattung.ts importiert von hier NUR Typen (`import type`) – sonst
 * entstuende ein Kreis, und eine Konstante, die beim Laden des Moduls gelesen
 * wird, waere `undefined`.
 *
 * Datum und Zeit (CLAUDE.md, Konventionen): Gerechnet wird in Berliner
 * Kalendertagen (`berlinerKalendertag`, `monateSpaeter`, `tageSpaeter`), ein
 * Fristbeginn ist der Beginn des Berliner Tages (`beginnDesBerlinerTages`),
 * das Jahr kommt aus `vorgangsjahrInBerlin` – der Container laeuft in UTC.
 */

import {
  AUSSTATTUNG_KATEGORIE,
  GRENZEN,
  MELDUNGEN as AUSSTATTUNG_MELDUNGEN,
  ORDER_BASIS,
  type BeiAustritt,
} from "@/lib/ausstattung";
import { abteilungsReihenfolge, empfaengerEinrichtung, istLinkAbteilung } from "@/lib/abteilungsaufgaben";
import {
  DEPARTMENT_KEYS,
  RETURN_CATEGORY_LABELS,
  RUECKGABE_KATEGORIEN,
  abteilungLabel,
  type RueckgabeKategorie,
} from "@/lib/constants";
import { escapeHtml } from "@/lib/email-layout";
import {
  berlinerKalendertag,
  formatKalendertag,
  istKalendertag,
  kalendertagAlsDatum,
  tageSpaeter,
  type Kalendertag,
} from "@/lib/kalendertag";
import { monateSpaeter, spaeter } from "@/lib/minijob-fristen";
import { beginnDesBerlinerTages, vorgangsjahrInBerlin } from "@/lib/vorgangsjahr";

// =============================================
// Wertlisten (Zustaende sind Zeichenketten, keine Enums)
// =============================================

/**
 * Zustand eines ausgegebenen Stuecks (Ausgabe.zustand, Feinplan 1.2).
 * AUSGEGEBEN und VERBLEIBT heissen „noch bei der Person“ (`AUSGABE_AKTIV`);
 * ERSETZT ist endgueltig (Tausch wegen Defekt).
 */
export const AUSGABE_ZUSTAENDE = [
  "AUSGEGEBEN",
  "ZURUECK",
  "BESCHAEDIGT",
  "FEHLT",
  "VERBLEIBT",
  "ENTFAELLT",
  "ERSETZT",
] as const;
export type AusgabeZustand = (typeof AUSGABE_ZUSTAENDE)[number];

/** Noch bei der Person: passt zu einer offenen Rueckgabe, sperrt Regel 9 der Karte (G5). */
export const AUSGABE_AKTIV = ["AUSGEGEBEN", "VERBLEIBT"] as const satisfies readonly AusgabeZustand[];
export type AktiverAusgabeZustand = (typeof AUSGABE_AKTIV)[number];

/**
 * Was beim Austritt mit dem Stueck geschieht (Ausgabe.beiAustritt). Teilmenge
 * von `BEI_AUSTRITT` ohne NICHTS: Eine Position mit NICHTS (oder ohne Wert)
 * bietet nie eine Uebergabe an (G4, G27).
 */
export const AUSGABE_BEI_AUSTRITT = ["RUECKGABE", "SPERREN"] as const satisfies readonly BeiAustritt[];
export type AusgabeBeiAustritt = (typeof AUSGABE_BEI_AUSTRITT)[number];

/**
 * Wer vermerkt hat (Ausgabe.quelle): die Stelle ueber ihren Link oder HR im
 * Portal. Ein „durch wen“ gibt es auf dem Link-Weg nicht (G2).
 */
export const AUSGABE_QUELLEN = ["LINK", "HR"] as const;
export type AusgabeQuelle = (typeof AUSGABE_QUELLEN)[number];

/**
 * Zustand einer Rueckgabe (ReturnItem.zustand). `null` heisst offen und steht
 * deshalb nicht in der Liste; `isReturned` folgt (wahr bei ZURUECK und
 * BESCHAEDIGT, G16).
 */
export const RUECKGABE_ZUSTAENDE = [
  "ZURUECK",
  "BESCHAEDIGT",
  "FEHLT",
  "VERBLEIBT",
  "ENTFAELLT",
] as const satisfies readonly AusgabeZustand[];
export type RueckgabeZustand = (typeof RUECKGABE_ZUSTAENDE)[number];

/** Was die Stelle ueber ihren Offboarding-Link waehlen darf; HR alle fuenf (1.2). */
export const RUECKGABE_ZUSTAENDE_STELLE = ["ZURUECK", "BESCHAEDIGT", "FEHLT"] as const satisfies readonly RueckgabeZustand[];
export type RueckgabeZustandStelle = (typeof RUECKGABE_ZUSTAENDE_STELLE)[number];

/**
 * Herkunft einer Offboarding-Aufgabe (OffboardingChecklistItem.herkunft):
 * Ruecknahme- bzw. Sperraufgabe zu einer Ausgabe (G14) und die Folgeaufgabe
 * „Schließung prüfen“ (G17). `null` = aus der Vorlage, nicht in der Liste.
 */
export const OFFBOARDING_AUFGABEN_HERKUNFT = ["AUSGABE", "AUSGABE_FEHLT"] as const;
export type OffboardingAufgabenHerkunft = (typeof OFFBOARDING_AUFGABEN_HERKUNFT)[number];

/**
 * Grund eines Tauschs (G7, Pflicht): DEFEKT macht die alte Ausgabe ERSETZT
 * (Frist 6 Monate), VERLOREN macht sie FEHLT (3 Jahre ab Jahresende).
 */
export const TAUSCH_GRUENDE = ["DEFEKT", "VERLOREN"] as const;
export type TauschGrund = (typeof TAUSCH_GRUENDE)[number];

/**
 * Lage des Reiters „Rückgaben“ (E-A36): Sie entscheidet die Kopfzeile. Die
 * Reihenfolge ist die Pruefreihenfolge von `rueckgabeLage` (S22).
 */
export const RUECKGABE_LAGEN = [
  "KEINE_EINSTELLUNG",
  "AUSGABEN",
  "GELOESCHT",
  "NICHTS_ERFASST",
  "NICHTS_AUSGEGEBEN",
  "VOR_EINFUEHRUNG",
] as const;
export type RueckgabeLage = (typeof RUECKGABE_LAGEN)[number];

/** Uebergabe- (Onboarding) bzw. Rueckgabeprotokoll (Offboarding), E-A34. */
export type ProtokollArt = "UEBERGABE" | "RUECKGABE";

/** Die Kategorie einer Rueckgabe (ReturnCategory); eine Quelle: constants.ts. */
export type { RueckgabeKategorie };

// =============================================
// Anzeige der Zustaende
// =============================================

/**
 * Ein Wort je Zustand – Karte, Reiter, Link-Seite und die Zeilen der
 * Brief-Liste `rueckgaben_liste` (1.9). Bei einer SPERREN-Ausgabe heisst
 * ZURUECK stattdessen `AUSGABE_GESPERRT_LABEL`.
 */
export const AUSGABE_ZUSTAND_LABELS: Readonly<Record<AusgabeZustand, string>> = {
  AUSGEGEBEN: "ausgegeben",
  ZURUECK: "zurück",
  BESCHAEDIGT: "beschädigt zurück",
  FEHLT: "fehlt",
  VERBLEIBT: "verbleibt",
  ENTFAELLT: "entfällt",
  ERSETZT: "ersetzt",
};

/** ZURUECK bei einer Ausgabe mit `beiAustritt` SPERREN: Der Zugang ist gesperrt. */
export const AUSGABE_GESPERRT_LABEL = "gesperrt";

// =============================================
// Vorgaben fuer den Katalog (G27)
// =============================================

/** Was „Rückgabe-Vorgaben übernehmen …“ an einer Vorschlagsposition setzt. */
export interface RueckgabeVorgabe {
  beiAustritt: BeiAustritt;
  /** Nur bei RUECKGABE, sonst `null`. */
  rueckgabeKategorie: RueckgabeKategorie | null;
  /** Beschriftung der Kennung (`ausgabeKennung`), nur bei RUECKGABE oder SPERREN; hier nur bei RUECKGABE. */
  ausgabeKennung: string | null;
}

/**
 * Die A4-Werte je `vorschlagSchluessel` (Tabelle in Feinplan 1.3). Bewusst NICHT
 * in `VORSCHLAEGE` (ausstattung.ts): Sonst schaltete „Vorschläge übernehmen“
 * A4 schon mit dem Pilot von A1 bis A3 ein – Uebergaben, Kennungen und
 * Ruecknahmen vor der Beteiligung der MAV und der Fristbestaetigung des DSB.
 * Die Werte kommen nur ueber die eigene Aktion an vorhandene Positionen mit
 * leerem `beiAustritt` (G27). Transponder/Chip ist ein Rueckgabe-Stueck
 * (Kategorie SCHLUESSEL), keine Sperraufgabe (G14, Abweichung vom Mockup 6.8).
 * Angaben (Art ANGABE) fehlen: Bei ihnen bleiben alle drei Felder leer (G8).
 */
export const RUECKGABE_VORGABEN: Readonly<Record<string, Readonly<RueckgabeVorgabe>>> = {
  IT_LAPTOP: { beiAustritt: "RUECKGABE", rueckgabeKategorie: "IT_HARDWARE", ausgabeKennung: "Inventarnummer" },
  IT_IPAD: { beiAustritt: "RUECKGABE", rueckgabeKategorie: "IT_HARDWARE", ausgabeKennung: "Inventarnummer" },
  IT_TELEFON: { beiAustritt: "RUECKGABE", rueckgabeKategorie: "IT_HARDWARE", ausgabeKennung: "Inventarnummer" },
  IT_BYOD: { beiAustritt: "SPERREN", rueckgabeKategorie: null, ausgabeKennung: null },
  IT_ZUGAENGE: { beiAustritt: "SPERREN", rueckgabeKategorie: null, ausgabeKennung: null },
  FACILITY_TRANSPONDER: { beiAustritt: "RUECKGABE", rueckgabeKategorie: "SCHLUESSEL", ausgabeKennung: "Chipnummer" },
  FACILITY_SCHLUESSEL: { beiAustritt: "RUECKGABE", rueckgabeKategorie: "SCHLUESSEL", ausgabeKennung: "Schlüsselnummer" },
  FACILITY_SPIND: { beiAustritt: "RUECKGABE", rueckgabeKategorie: "SCHLUESSEL", ausgabeKennung: "Schlüsselnummer" },
  VERWALTUNG_KOPIERKARTE: { beiAustritt: "RUECKGABE", rueckgabeKategorie: "SONSTIGES", ausgabeKennung: "Kartennummer" },
  VERWALTUNG_DIENSTAUSWEIS: { beiAustritt: "RUECKGABE", rueckgabeKategorie: "DOKUMENTE", ausgabeKennung: "Ausweisnummer" },
  FACILITY_PARKPLATZ: { beiAustritt: "NICHTS", rueckgabeKategorie: null, ausgabeKennung: null },
  VERWALTUNG_FACH: { beiAustritt: "NICHTS", rueckgabeKategorie: null, ausgabeKennung: null },
  VERWALTUNG_TUERSCHILD: { beiAustritt: "NICHTS", rueckgabeKategorie: null, ausgabeKennung: null },
};

/**
 * Offboarding-Ereignisse, deren Payload den Link der Stelle traegt bzw. ueber
 * ihre Aufgaben berichtet (G21). Ist darauf ein Webhook aktiv, meldet
 * „Rückgabe-Vorgaben übernehmen …“ das als `hinweis` — ohne zu sperren: Ab A4
 * stehen auf der Link-Seite Kennungen, und Rueckgabezustaende lassen sich
 * dort setzen. Ein Test haelt die Namen gegen den Ereigniskatalog (events.ts).
 */
export const A4_WEBHOOK_EREIGNISSE = [
  "offboarding-department-assigned",
  "offboarding-department-completed",
  "offboarding-reminder",
  "offboarding-task-completed",
] as const;

/** Eine Katalogposition, soweit `rueckgabeVorgabenPlan` sie liest. */
export interface VorgabenPosition {
  id: string;
  art: string;
  bezeichnung: string;
  departmentKey: string;
  vorschlagSchluessel?: string | null;
  beiAustritt?: string | null;
}

/** Eine Position, die die Vorgabe bekommt bzw. behaelt, was sie hat. */
export interface VorgabenEintrag {
  id: string;
  bezeichnung: string;
  departmentKey: string;
  vorschlagSchluessel: string;
  vorgabe: Readonly<RueckgabeVorgabe>;
}

/**
 * Warum eine Vorschlagsposition keine Vorgabe bekommt: `WERT` = sie hat schon
 * einen Wert fuer „Beim Austritt“ (von HR gesetzt oder schon uebernommen),
 * `ANGABE` = sie ist inzwischen eine Angabe (dort bleiben die Felder leer, G8).
 */
export type VorgabenUebersprungGrund = "WERT" | "ANGABE";

/** Eine Position, die bleibt, wie sie ist – mit Grund (Rueckfrage und Meldung nennen ihn). */
export interface VorgabenUebersprungen extends VorgabenEintrag {
  grund: VorgabenUebersprungGrund;
}

/**
 * Was „Rückgabe-Vorgaben übernehmen …“ tut (G27) — dieselbe Rechnung fuer die
 * Rueckfrage der Katalogseite und den Server (dort danach bedingt je Position,
 * `beiAustritt: null` und „keine Angabe“ im WHERE):
 *
 *   - `setzen`: Positionen mit einem `vorschlagSchluessel` aus
 *     RUECKGABE_VORGABEN, leerem `beiAustritt` und einer anderen Art als
 *     ANGABE — sie bekommen die Vorgabe.
 *   - `uebersprungen`: Positionen mit einem solchen Schluessel, die schon einen
 *     Wert fuer „Beim Austritt“ haben (`grund` WERT) oder inzwischen eine
 *     Angabe sind (`grund` ANGABE; dort bleiben die Felder leer, G8). Eine
 *     Angabe hat nie einen Wert (`positionPruefen`), ANGABE geht deshalb vor.
 *
 * Positionen ohne Vorschlagsschluessel (von HR angelegt) und mit einem
 * Schluessel ohne Vorgabe (die Angaben) kommen in keiner Liste vor —
 * „Vorschläge übernehmen“ legt nie A4-Werte an, nur diese Aktion (G27).
 */
export function rueckgabeVorgabenPlan(positionen: ReadonlyArray<VorgabenPosition>): {
  setzen: VorgabenEintrag[];
  uebersprungen: VorgabenUebersprungen[];
} {
  const setzen: VorgabenEintrag[] = [];
  const uebersprungen: VorgabenUebersprungen[] = [];
  for (const p of positionen) {
    const schluessel = p.vorschlagSchluessel ?? "";
    if (!Object.prototype.hasOwnProperty.call(RUECKGABE_VORGABEN, schluessel)) continue;
    const eintrag: VorgabenEintrag = {
      id: p.id,
      bezeichnung: p.bezeichnung,
      departmentKey: p.departmentKey,
      vorschlagSchluessel: schluessel,
      vorgabe: RUECKGABE_VORGABEN[schluessel],
    };
    const leer = p.beiAustritt === null || p.beiAustritt === undefined || p.beiAustritt.trim() === "";
    if (p.art === "ANGABE") uebersprungen.push({ ...eintrag, grund: "ANGABE" });
    else if (!leer) uebersprungen.push({ ...eintrag, grund: "WERT" });
    else setzen.push(eintrag);
  }
  return { setzen, uebersprungen };
}

// =============================================
// Grenzen und Fristen
// =============================================

/**
 * Laengen- und Mengengrenzen. Client (Zeichenzaehler) und Server (Zod) lesen
 * dieselben Zahlen.
 * - `kennung`, `kennungLabel`: Zeichen (Schema: Ausgabe.kennung, .kennungLabel);
 *   `kennungLabel` ist die Momentaufnahme von `ausgabeKennung` und liest
 *   deshalb dieselbe Zahl wie der Katalog (`GRENZEN.ausgabeKennung`)
 * - `bezeichnung`: Zeichen von Ausgabe.bezeichnung (Schema: „max. 200“).
 *   `ausgabeBezeichnung` kappt darauf: Katalog-Bezeichnung (120) + „: “ +
 *   Option (80) ergaebe bis zu 202 Zeichen.
 * - `stueckJeVermerk`: 1 bis 10 Stueck je „Übergabe vermerken“ (G4)
 * - `aktiveJeAufgabe`: hoechstens 20 aktive Ausgaben je Ausstattungsaufgabe
 * - `rueckwirkendTage`: Uebergabedatum hoechstens so viele Tage vor dem Anlegen des Vorgangs
 * - `kandidaten`: hoechstens so viele Zuordnungs-Vorschlaege (E-A31)
 * - `suche`, `sucheMinZeichen`, `sucheMaxZeichen`: Treffer der Suche im
 *   Zuordnen-Dialog, Mindest- und Hoechstlaenge der Eingabe
 */
export const AUSGABE_GRENZEN = {
  kennung: 60,
  kennungLabel: GRENZEN.ausgabeKennung,
  bezeichnung: 200,
  stueckJeVermerk: 10,
  aktiveJeAufgabe: 20,
  rueckwirkendTage: 365,
  kandidaten: 10,
  suche: 20,
  sucheMinZeichen: 3,
  sucheMaxZeichen: 60,
} as const;

/** ZURUECK, BESCHAEDIGT, ENTFAELLT, ERSETZT: geloescht sechs Monate nach dem Zustandswechsel (E-A37). */
export const AUSGABE_AUFBEWAHRUNG_MONATE = 6;

/** FEHLT und beim Abschluss bzw. der Absage offen Gebliebenes: drei Jahre ab Jahresende (E-A37). */
export const AUSGABE_VERJAEHRUNG_JAHRE = 3;

// =============================================
// Ruecknahme-, Sperr- und Folgeaufgaben (G14, G17)
// =============================================

/**
 * Titel und Beschreibungen der Aufgaben, die der Austritt anlegt. NIE mit
 * Kennung und nie mit Namen: Titel stehen im Betreff von
 * `offboarding-task-completed`, gehen an Webhooks (die Offboarding-Ereignisse
 * sind nicht webhookfrei) und bleiben ueber jede Loeschfrist hinaus stehen
 * (G14, G21). Die Kennung sieht die Stelle nur auf ihrer Aufgabenseite.
 * Beschreibungen gehen an die Stelle (Mail, Link-Seite) und siezen.
 */
export const RUECKNAHME_TEXTE = {
  titelRueckgabe: (bezeichnung: string): string => `${bezeichnung} zurücknehmen`,
  titelSperren: (bezeichnung: string): string => `${bezeichnung} sperren`,
  titelFolge: (bezeichnung: string): string => `Schließung prüfen: ${bezeichnung}`,
  beschreibungRueckgabe:
    "Bitte nehmen Sie den Gegenstand zurück und bestätigen Sie den Zustand auf Ihrer Aufgabenseite. Dort steht auch die Kennung.",
  beschreibungSperren: "Bitte sperren Sie den Zugang zum letzten Arbeitstag.",
  beschreibungFolge:
    "Ein Schlüssel bzw. Transponder wurde als fehlend gemeldet. Bitte prüfen, ob die Schließung geändert werden muss, bzw. den Transponder im Schließsystem sperren.",
} as const;

/**
 * Stelle der Folgeaufgabe „Schließung prüfen“, wenn ein Schluessel fehlt (G17):
 * Die Gebaeudewirtschaft entscheidet ueber den Zylindertausch, auch wenn eine
 * andere Stelle den Schluessel ausgab.
 */
export const FOLGE_STELLE = "FACILITY";

// =============================================
// Texte des Reiters „Rückgaben“ (E-A36)
// =============================================

/** Was die Kopfzeile je Lage einsetzt. */
export interface LageTextWerte {
  /** Vorgangsnummer der zugeordneten Einstellung. */
  nr: string;
  /** Aktive Ausgaben mit RUECKGABE. */
  gegenstaende: number;
  /** Aktive Ausgaben mit SPERREN. */
  zugaenge: number;
  /** Erledigte Ausstattungsaufgaben ohne Uebergabevermerk (`ohneVermerk`). */
  ohneVermerk: number;
}

function anzahl(n: number, eins: string, viele: string): string {
  return `${n} ${n === 1 ? eins : viele}`;
}

/** „Einrichtung“ bei einem Zugang (SPERREN, G4), sonst „Übergabe“ – Meldungen und Hinweise der Karte. */
function vermerkWort(beiAustritt: string | null | undefined): string {
  return beiAustritt === "SPERREN" ? "Einrichtung" : "Übergabe";
}

/** „Einrichtungsvermerk“ bzw. „Übergabevermerk“ (wie die Titel der Dialoge). */
function vermerkNomen(beiAustritt: string | null | undefined): string {
  return beiAustritt === "SPERREN" ? "Einrichtungsvermerk" : "Übergabevermerk";
}

/**
 * Kopfzeile je Lage. Drei unterscheidbare Leeranzeigen (E-A36): „keine
 * Einstellung“, „vor der Einfuehrung“ und „nichts ausgegeben“ – dazu „nichts
 * erfasst“ (bereitgestellt, aber nicht vermerkt) und „geloescht“ (Frist
 * abgelaufen), damit die Karte nach der Loeschung nicht wieder einen Vermerk
 * verlangt.
 */
export const LAGE_TEXTE: Readonly<Record<RueckgabeLage, (w: LageTextWerte) => string>> = {
  KEINE_EINSTELLUNG: () =>
    "Keine Einstellung zugeordnet. Was ausgegeben wurde, kennt das Portal erst nach „Einstellung zuordnen …“.",
  VOR_EINFUEHRUNG: (w) =>
    `Für die Einstellung ${w.nr} hat das Portal keine Ausgaben erfasst: Sie stammt aus der Zeit vor der Erfassung oder hatte keinen Ausstattungsschritt mit Gegenständen, die zurückkommen. Bitte mit Geräteverwaltung und Schließplan abgleichen.`,
  NICHTS_AUSGEGEBEN: (w) =>
    `Laut Portal wurde bei der Einstellung ${w.nr} nichts ausgegeben, das zurückkommt oder gesperrt wird.`,
  NICHTS_ERFASST: (w) =>
    `Laut Portal bereitgestellt, aber keine Übergabe vermerkt: ${anzahl(w.ohneVermerk, "Aufgabe", "Aufgaben")}.`,
  GELOESCHT: (w) =>
    `Die Ausgaben der Einstellung ${w.nr} wurden nach Ablauf der Aufbewahrungsfrist gelöscht.`,
  AUSGABEN: (w) =>
    `Laut Portal ausgegeben (Einstellung ${w.nr}, von HR zugeordnet): ${anzahl(w.gegenstaende, "Gegenstand", "Gegenstände")}, ${anzahl(w.zugaenge, "Zugang", "Zugänge")}.`,
};

/** Zweite Zeile bei Lage AUSGABEN, wenn die Einstellung daneben geloeschte Ausgaben hat. */
export const LAGE_WEITERE_GELOESCHT = "Weitere Ausgaben wurden nach Ablauf der Aufbewahrungsfrist gelöscht.";

/** Steht unter jeder Kopfzeile (E-A36): Das Portal ersetzt keine Inventarliste. */
export const GEDAECHTNISSTUETZE =
  "Das Portal ist eine Gedächtnisstütze; maßgeblich bleiben Geräteverwaltung und Schließplan.";

// =============================================
// Meldungen (eine Quelle fuer Routen, Karten, Dialoge und Link-Seite)
// =============================================

/**
 * Texte der Routen, Karten und Dialoge. Portal-Texte ohne Anrede; was auch die
 * Link-Seite einer Stelle zeigt, bleibt neutral oder siezt. Nie mit Kennung,
 * Name oder Adresse. `VERSAND_LAEUFT` kommt aus `MELDUNGEN` von
 * abteilungsaufgaben.ts (dieselbe Sperre wie „Abteilungen informieren“, G26).
 */
export const MELDUNGEN_AUSGABEN = {
  // ---- Fehler: Vermerk, Karte, Link-Seite ----
  /**
   * 409 (G5): Regel 9 der Karte – abwählen, streichen, Stelle wechseln. Der
   * Text steht in `MELDUNGEN` von ausstattung.ts (`aenderungsGrundText` liest
   * ihn dort; ausstattung.ts darf von hier nur Typen importieren) – eine Quelle.
   */
  AUSGABE_VORHANDEN: AUSSTATTUNG_MELDUNGEN.AUSGABE_VORHANDEN,
  /** 404: unbekannte Ausgabe oder eine Ausgabe eines anderen Vorgangs (derselbe Text). */
  AUSGABE_NICHT_GEFUNDEN: "Ausgabe nicht gefunden",
  /** 400: Ein Zugang (SPERREN) kommt nur als „gesperrt“ (ZURUECK) zurueck – nie beschaedigt oder fehlend (1.2). */
  ZUGANG_NUR_GESPERRT: "Ein Zugang lässt sich nur als „gesperrt“ vermerken – „beschädigt“ und „fehlt“ gelten für Gegenstände.",
  /**
   * 400 (G7, 1.2): Getauscht werden nur Gegenstaende (RUECKGABE). Ein Tausch
   * „verloren“ setzte einen Zugang auf FEHLT – den Zustand, den „zurückgenommen“
   * fuer Zugaenge ausschliesst (`ZUGANG_NUR_GESPERRT`).
   */
  ZUGANG_KEIN_TAUSCH:
    "Ein Zugang lässt sich nicht tauschen – den bisherigen als „gesperrt“ vermerken und den neuen über „Einrichtung vermerken“ eintragen.",
  /**
   * 409 (G7, G28): Das Stueck ist an einen Austritt gebunden und aendert sich
   * nur dort. Die Vorgangsnummer nur, wenn HR den Austritt oeffnen darf.
   */
  AUSGABE_IM_AUSTRITT: (nr: string | null): string =>
    nr
      ? `Dieses Stück gehört zum Austritt ${nr} und lässt sich nur dort ändern (Reiter „Rückgaben“).`
      : "Dieses Stück gehört zu einem anderen Austritt und lässt sich nur dort ändern.",
  /** 409 KEINE_AUSGABE: Die Position kommt beim Austritt weder zurueck noch wird sie gesperrt (G4). */
  KEINE_AUSGABE: "Zu dieser Aufgabe lässt sich keine Übergabe vermerken.",
  /** 409 AUFGABE_ENTFAELLT. */
  AUFGABE_ENTFAELLT: "Die Aufgabe ist entfallen – es lässt sich nichts mehr vermerken.",
  /** 409 NICHT_AUSGEGEBEN: Korrigieren, Tauschen, Zuruecknehmen nur an einem aktiven Stueck. */
  NICHT_AUSGEGEBEN: "Das Stück ist nicht mehr ausgegeben – die Änderung passt nicht zu seinem Stand.",
  /** 409 (G6): Die Stelle entfernt nur eigene, noch ausgegebene Vermerke ohne Austritt. */
  ENTFERNEN_NICHT_MOEGLICH:
    "Dieser Vermerk lässt sich hier nicht entfernen. Bitte wenden Sie sich an die Personalabteilung.",
  // ---- Fehler: vermerkPruefen und Zod (400) ----
  KEIN_STUECK: "Bitte mindestens ein Stück angeben.",
  ZU_VIELE_STUECKE: `Je Vermerk lassen sich höchstens ${AUSGABE_GRENZEN.stueckJeVermerk} Stück erfassen.`,
  ZU_VIELE_AKTIVE: `An einer Aufgabe stehen höchstens ${AUSGABE_GRENZEN.aktiveJeAufgabe} ausgegebene Stücke.`,
  // Datum ohne „Übergabe“: Dieselbe Pruefung gilt fuer das Einrichtungsdatum eines Zugangs (G4).
  DATUM_IN_ZUKUNFT: "Das Datum liegt in der Zukunft.",
  DATUM_ZU_FRUEH: `Das Datum liegt mehr als ${AUSGABE_GRENZEN.rueckwirkendTage} Tage vor dem Anlegen des Vorgangs.`,
  DATUM_UNGUELTIG: "Datum im Format JJJJ-MM-TT erforderlich.",
  KENNUNG_ZU_LANG: `Die Kennung darf höchstens ${AUSGABE_GRENZEN.kennung} Zeichen lang sein.`,
  KENNUNG_UNGUELTIG: "Die Kennung darf keine spitzen Klammern (< >), keine Zeilenumbrüche und keine Steuerzeichen enthalten.",
  // ---- Fehler: Form der Anfrage (Zod, 400) ----
  AUSGABE_ID_UNGUELTIG: "Ungültige Ausgabe.",
  AUFGABE_ID_UNGUELTIG: "Ungültige Aufgabe.",
  EINSTELLUNG_ID_UNGUELTIG: "Ungültige Einstellung.",
  /** `korrigieren` ohne Kennung und ohne Datum. */
  KORREKTUR_LEER: "Bitte Kennung oder Datum angeben.",
  /** `tauschen` ohne bzw. mit unbekanntem Grund (G7: Pflicht). */
  TAUSCH_GRUND_FEHLT: "Bitte den Grund des Tauschs wählen: defekt oder verloren.",
  ZUSTAND_UNBEKANNT: "Unbekannter Zustand.",
  /** Link der Stelle (Offboarding): Ein Zustand heisst „erledigt“ (G15). */
  ZUSTAND_NUR_ERLEDIGT: "Ein Zustand lässt sich nur zusammen mit „erledigt“ angeben.",
  /** Reiter „Rückgaben“: `isReturned` (Altform) und `zustand` widersprechen sich womoeglich. */
  ZUSTAND_UND_RUECKGABE: "Bitte entweder „zurückgegeben“ oder einen Zustand angeben, nicht beides.",
  AUFGABEN_AUSWAHL: "Bitte 1 bis 50 Aufgaben wählen.",
  AUSGABEN_AUSWAHL: "Bitte höchstens 200 Ausgaben wählen.",
  SUCHE_ZU_LANG: `Höchstens ${AUSGABE_GRENZEN.sucheMaxZeichen} Zeichen`,
  // ---- Fehler: Zuordnung und Rueckgaben (Offboarding) ----
  /**
   * 404 (G11, G23): Einstellung unbekannt, aus einem fremden Mandanten oder
   * keine Einstellung (`processType` ≠ EINSTELLUNG) – derselbe Text, damit die
   * Antwort nichts verraet.
   */
  EINSTELLUNG_NICHT_GEFUNDEN: "Einstellung nicht gefunden",
  /** 409 KEINE_ZUORDNUNG: „Lösen …“ an einem Austritt ohne zugeordnete Einstellung. */
  KEINE_ZUORDNUNG: "Diesem Austritt ist keine Einstellung zugeordnet.",
  BEREITS_ZUGEORDNET: "Diesem Austritt ist schon eine Einstellung zugeordnet.",
  EINSTELLUNG_VERGEBEN: "Diese Einstellung ist schon einem laufenden Austritt zugeordnet.",
  EINSTELLUNG_ABGESAGT: "Diese Einstellung wurde abgesagt und lässt sich nicht zuordnen.",
  /** 409 VORGANG_ABGESCHLOSSEN: Austritt COMPLETED oder CANCELLED. */
  VORGANG_ABGESCHLOSSEN: "Der Austritt ist abgeschlossen oder abgebrochen – die Zuordnung lässt sich nicht mehr ändern.",
  /** 409 INZWISCHEN_GEAENDERT: bedingtes Update ohne Treffer. */
  INZWISCHEN_GEAENDERT: "Der Austritt wurde inzwischen geändert. Bitte die Seite neu laden.",
  LOESEN_GESPERRT:
    "Die Zuordnung lässt sich nicht mehr lösen: Eine Rücknahme- oder Sperraufgabe ist erledigt oder eine vorgeschlagene Rückgabe hat schon einen Zustand.",
  /** 409 RUECKGABEN_OFFEN (G18): Abschluss mit Warnung, nicht gesperrt. */
  RUECKGABEN_OFFEN: (n: number): string =>
    `${n === 1 ? "1 Rückgabe oder Sperre ist" : `${n} Rückgaben oder Sperren sind`} noch offen. Der Austritt lässt sich trotzdem abschließen – bitte bestätigen.`,
  VORGESCHLAGEN_NICHT_LOESCHEN: "Eine vorgeschlagene Rückgabe lässt sich nicht löschen – stattdessen „entfällt“ wählen.",
  // ---- Fehler: Zustaende und Gleichlauf (S30, G15 bis G17) ----
  /**
   * 400 (G15, 1.2): ein Rueckgabezustand an einer Aufgabe ohne Gegenstand –
   * Vorlagenaufgabe, Folgeaufgabe „Schließung prüfen“, ueber den Link auch an
   * einer Sperraufgabe (die hat ihren Haken). Neutral, die Link-Seite zeigt ihn auch.
   */
  ZUSTAND_NICHT_MOEGLICH: "Einen Rückgabezustand gibt es nur bei der Rücknahme eines Gegenstands.",
  /**
   * 409 (G28): Ein abgeschlossener Austritt hat ein Stueck mit „verbleibt“
   * freigegeben – es lebt in der Karte der Einstellung bzw. im naechsten
   * Austritt weiter, nicht mehr hier.
   */
  AUSGABE_FREIGEGEBEN:
    "Das Stück verbleibt bei der Person und wurde mit dem Abschluss dieses Austritts freigegeben – Änderungen daran gehen über die Karte „Ausstattung & Zugänge“ der Einstellung bzw. den nächsten Austritt.",
  /** 409: Das Stueck hat sich zwischen Lesen und Schreiben bewegt (bedingtes Update ohne Treffer). */
  STUECK_INZWISCHEN_GEAENDERT: "Das Stück wurde inzwischen geändert. Bitte die Seite neu laden.",
  /** 404 (Reiter „Rückgaben“): unbekannt oder aus einem anderen Vorgang – derselbe Text. */
  GEGENSTAND_NICHT_GEFUNDEN: "Rückgabe-Gegenstand nicht gefunden",
  /** 409 (Reiter „Rückgaben“): Zustand inzwischen geaendert bzw. Zeile geloescht (bedingtes Update). */
  RUECKGABE_INZWISCHEN_GEAENDERT: "Der Gegenstand wurde inzwischen geändert oder gelöscht. Bitte die Seite neu laden.",
  /** 409 (Reiter „Rückgaben“): Austritt abgebrochen (CANCELLED). */
  RUECKGABEN_ABGEBROCHEN: "Der Vorgang wurde abgebrochen. Die Rückgaben lassen sich nicht mehr ändern.",
  // ---- Erfolg (`meldung` der Karte, POST /api/onboarding/[id]/ausgaben) ----
  // `art` = `beiAustritt` des Stuecks: Ein Zugang (SPERREN) wird eingerichtet
  // und gesperrt, nicht uebergeben und zurueckgenommen (G4) – dieselben Woerter
  // wie Knopf und Dialog („Einrichtung vermerken…“, „Sperrung vermerken“).
  VERMERKT: (n: number, art?: string | null): string =>
    n === 1 ? `${vermerkWort(art)} vermerkt.` : `${vermerkWort(art)} vermerkt (${n} Stück).`,
  KORRIGIERT: (art?: string | null): string => `${vermerkNomen(art)} korrigiert.`,
  KEINE_AENDERUNG: "Keine Änderung.",
  GETAUSCHT: (grund: TauschGrund): string =>
    grund === "VERLOREN"
      ? "Getauscht – das alte Stück ist als fehlend vermerkt."
      : "Getauscht – das alte Stück ist als ersetzt vermerkt.",
  /** `zustand` schon als Wort („zurück“, „beschädigt zurück“, „fehlt“); ein Zugang heisst „Sperrung vermerkt.“ */
  ZURUECKGENOMMEN: (zustand: string, art?: string | null): string =>
    art === "SPERREN" ? "Sperrung vermerkt." : `Rücknahme vermerkt: ${zustand}.`,
  ENTFERNT: (art?: string | null): string => `${vermerkNomen(art)} entfernt.`,
  // ---- Erfolg: Zuordnung am Austritt (`meldung`, POST /api/offboarding/[id]/einstellung) ----
  /** `nr` = Vorgangsnummer der Einstellung; `arbeitsort` = Name des uebernommenen Arbeitsorts (G12), sonst null. */
  ZUGEORDNET: (nr: string, arbeitsort: string | null): string =>
    `Einstellung ${nr} zugeordnet.${arbeitsort ? ` Arbeitsort ${arbeitsort} übernommen.` : ""}`,
  /**
   * `arbeitsort`: ZURUECKGESETZT = der uebernommene Arbeitsort ist wieder leer;
   * BLEIBT = er bleibt, weil schon eine Stelle informiert ist (G12); null = es
   * gab keinen.
   */
  GELOEST: (nr: string, arbeitsort: "ZURUECKGESETZT" | "BLEIBT" | null): string =>
    `Zuordnung der Einstellung ${nr} gelöst.` +
    (arbeitsort === "ZURUECKGESETZT"
      ? " Der Arbeitsort am Austritt ist wieder leer."
      : arbeitsort === "BLEIBT"
        ? " Der Arbeitsort am Austritt bleibt, weil schon eine Stelle informiert ist."
        : ""),
  // ---- Erfolg: Rueckgaben aus der Einstellung (S29, G13, G14; `meldung`) ----
  /**
   * Was eine Uebernahme neu angelegt hat: „2 Rückgaben und 1 Sperraufgabe
   * übernommen.“ – ohne neue Zeile "" (der Aufrufer nennt dann `NICHTS_NEU`
   * bzw. nur die Zuordnung).
   */
  UEBERNOMMEN: (rueckgaben: number, sperraufgaben: number): string => {
    const teile = [
      rueckgaben > 0 ? anzahl(rueckgaben, "Rückgabe", "Rückgaben") : "",
      sperraufgaben > 0 ? anzahl(sperraufgaben, "Sperraufgabe", "Sperraufgaben") : "",
    ].filter((t) => t !== "");
    return teile.length > 0 ? `${teile.join(" und ")} übernommen.` : "";
  },
  /** „Rückgaben aktualisieren“ ohne neue Zeile. */
  NICHTS_NEU: "Keine neuen Rückgaben oder Sperraufgaben – alles war schon übernommen.",
  /**
   * Zwischen Vorschlag und Sperre geaendert (zurueckgenommen, getauscht, in
   * einem anderen Austritt): faellt still heraus und wird nur gezaehlt
   * (Feinplan 1.7, Schritt 3.6).
   */
  HERAUSGEFALLEN: (n: number): string =>
    n === 1
      ? "1 Stück hat sich inzwischen geändert und wurde nicht übernommen."
      : `${n} Stücke haben sich inzwischen geändert und wurden nicht übernommen.`,
  /** „Als ausgegeben übernehmen“ (G13): so viele Aufgaben bekamen eine Ausgabe (`quelle` HR). */
  ALS_AUSGEGEBEN_UEBERNOMMEN: (n: number): string => `${anzahl(n, "Aufgabe", "Aufgaben")} als ausgegeben übernommen.`,
  /** … und so viele haben inzwischen einen Vermerk, sind entfallen oder gehoeren nicht (mehr) dazu. */
  OHNE_VERMERK_UEBERSPRUNGEN: (n: number): string =>
    n === 1
      ? "1 Aufgabe hat inzwischen einen Vermerk oder ist entfallen und wurde übersprungen."
      : `${n} Aufgaben haben inzwischen einen Vermerk oder sind entfallen und wurden übersprungen.`,
  /** Merker „Person bleibt in einer anderen Beschäftigung“ geaendert (`aktualisieren`, G13). */
  MERKER_GESPEICHERT: (wert: boolean): string =>
    wert
      ? "Gespeichert: Die Person bleibt in einer anderen Beschäftigung."
      : "Gespeichert: Die Person bleibt in keiner anderen Beschäftigung.",
  // ---- Fehler: Ruecknahme- und Sperraufgaben im Portal (G14) ----
  /** 403: Aufgaben mit `herkunft` (Ausgabe, Folgeaufgabe) haken im Portal nur HR_EDIT_ROLES ab – nie SERVICE. */
  PORTAL_NUR_HR: "Rücknahme- und Sperraufgaben bearbeitet nur die Personalabteilung.",
  /** 409: `assigneeDepartment` im Body einer solchen Aufgabe – die Stelle ist die ausgebende. */
  STELLE_FEST: "Die Stelle einer Rücknahme- oder Sperraufgabe ist die ausgebende Stelle und lässt sich nicht ändern.",
  // ---- Reiter „Rückgaben“ (Mockup 6.8) ----
  /**
   * Zeile „Sperraufgaben …“ je Stelle – ohne Artikel vor dem frei gepflegten
   * Namen der Stelle; `liste` schon aufgezaehlt, nie mit Kennung.
   */
  SPERRAUFGABEN: (stelle: string, liste: string, perLink: boolean): string =>
    `Sperraufgaben zum letzten Arbeitstag – ${stelle}, ${perLink ? "über den Offboarding-Link" : "im Portal"}: ${liste}`,
  // ---- Hinweise ----
  /** G7: verlorener Schluessel ohne Austritt – keine Aufgabe, nur dieser Satz in Dialog und `meldung`. */
  GEBAEUDEWIRTSCHAFT_INFORMIEREN: "Bitte die Gebäudewirtschaft wegen der Schließung informieren.",
  /** G20: an einer Aufgabe nach Ablauf der Frist (grau, keine Aufforderung). */
  AUSGABEN_GELOESCHT: "Ausgaben nach Ablauf der Aufbewahrungsfrist gelöscht",
  /** Karte (gelb): erledigte Ausstattungsaufgabe ohne jede Ausgabe und ohne Loeschmerker. */
  UEBERGABE_NICHT_VERMERKT: "Übergabe nicht vermerkt",
  /** Dasselbe an einem Zugang (SPERREN, G4: „eingerichtet am“). */
  EINRICHTUNG_NICHT_VERMERKT: "Einrichtung nicht vermerkt",
  /** Link-Seite der Stelle (1.8): nach dem Abhaken ohne Vermerk. */
  UEBERGABE_NOCH_NICHT_VERMERKT: "Übergabe noch nicht vermerkt",
  /** Dasselbe an einem Zugang. */
  EINRICHTUNG_NOCH_NICHT_VERMERKT: "Einrichtung noch nicht vermerkt",
  /** G12: Abteilungskarte und Stepper, solange keine Einstellung zugeordnet ist. */
  ZUORDNUNG_EMPFOHLEN: "Einstellung zuordnen, bevor Sie die Abteilungen informieren",
  /** Stuecke, die gerade ein anderer Austritt bindet (G28) – ohne Kennung, Nummer nur bei Zugriff. */
  SCHON_IM_AUSTRITT: (n: number, nr: string | null): string =>
    `${n === 1 ? "1 Stück läuft" : `${n} Stücke laufen`} ${nr ? `im Austritt ${nr}` : "in einem anderen Austritt"}.`,
  /** Rueckfrage vor „Lösen …“ (1.7): n geloeschte Aufgaben, m schon informierte Stellen. */
  LOESEN_RUECKFRAGE: (n: number, m: number): string =>
    `${anzahl(n, "Rücknahme- bzw. Sperraufgabe wird", "Rücknahme- und Sperraufgaben werden")} gelöscht.` +
    (m > 0
      ? ` ${m === 1 ? "1 Stelle wurde" : `${m} Stellen wurden`} schon informiert und ${m === 1 ? "sieht" : "sehen"} sie danach nicht mehr – bitte ggf. Bescheid geben.`
      : ""),
  // ---- Leerzustaende des Zuordnen-Dialogs ----
  KEIN_VORSCHLAG: "Kein Vorschlag – über Vorgangsnummer oder Nachname suchen",
  SUCHE_ZU_KURZ: `Mindestens ${AUSGABE_GRENZEN.sucheMinZeichen} Zeichen`,
  KEIN_TREFFER: "Kein Treffer",
  // ---- „Rückgabe-Vorgaben übernehmen …“ (G27, G21; Einstellungen, Portal) ----
  /**
   * Grund am gesperrten Knopf der Rueckfrage: `rueckgabeVorgabenPlan` setzt
   * nichts. Neutral formuliert – die Positionen haben schon einen Wert ODER
   * sind Angaben (deren „Beim Austritt“ bleibt leer).
   */
  RUECKGABE_VORGABEN_NICHTS_ZU_TUN:
    "Keine Position aus den Vorschlägen wartet noch auf eine Vorgabe für „Beim Austritt“ – es gibt nichts zu übernehmen.",
  /** Zeile der Rueckfrage je uebersprungener Position, nach ihrem Grund (`rueckgabeVorgabenPlan`). */
  RUECKGABE_VORGABEN_UEBERSPRUNGEN: {
    WERT: "hat schon einen Wert, bleibt",
    ANGABE: "ist eine Angabe, bekommt keine Vorgabe",
  } satisfies Readonly<Record<VorgabenUebersprungGrund, string>>,
  /**
   * Antwort `meldung`: was gesetzt wurde und was blieb – getrennt nach Grund
   * (`mitWert` = hatte schon einen Wert, `angaben` = ist eine Angabe).
   */
  RUECKGABE_VORGABEN_ERGEBNIS: (gesetzt: number, mitWert: number, angaben = 0): string => {
    const rest: string[] = [];
    if (mitWert > 0) {
      rest.push(
        `${mitWert === 1 ? "1 Position hatte schon einen Wert und bleibt" : `${mitWert} Positionen hatten schon einen Wert und bleiben`} unverändert.`,
      );
    }
    if (angaben > 0) {
      rest.push(
        `${angaben === 1 ? "1 Position ist eine Angabe und bekommt" : `${angaben} Positionen sind Angaben und bekommen`} keine Vorgabe.`,
      );
    }
    if (gesetzt <= 0) {
      if (rest.length === 0) {
        return "Im Katalog steht keine Position aus „Vorschläge übernehmen“, zu der es eine Vorgabe gibt – es wurde nichts geändert.";
      }
      if (angaben <= 0) {
        return "Alle Positionen aus den Vorschlägen haben schon einen Wert für „Beim Austritt“ – es wurde nichts geändert.";
      }
      return ["Es wurde nichts geändert.", ...rest].join(" ");
    }
    const satz = `Rückgabe-Vorgaben an ${anzahl(gesetzt, "Position", "Positionen")} übernommen. Link-Seite und Karte bieten dort ab jetzt Übergaben an.`;
    return [satz, ...rest].join(" ");
  },
  /** Antwort `hinweis` (G21): aktive Webhooks auf die Offboarding-Abteilungsereignisse, ohne zu sperren. */
  RUECKGABE_VORGABEN_WEBHOOKS: (n: number): string =>
    `Auf die Offboarding-Ereignisse der Abteilungen ${n === 1 ? "ist 1 Webhook" : `sind ${n} Webhooks`} aktiv. Diese erhalten den Link der Stellen und könnten damit ab jetzt Kennungen lesen und Rückgabezustände setzen – bitte unter Einstellungen → Webhooks prüfen und nicht benötigte löschen.`,
  // ---- Protokoll (G19) ----
  PROTOKOLL_FEHLT: (art: ProtokollArt): string => `Unterschriebenes ${protokollName(art)}: fehlt`,
  /** `datum` schon als TT.MM.JJJJ (formatDatumDE beim Aufrufer). */
  PROTOKOLL_HOCHGELADEN: (art: ProtokollArt, datum: string): string =>
    `Unterschriebenes ${protokollName(art)}: hochgeladen am ${datum}`,
} as const;

function protokollName(art: ProtokollArt): string {
  return art === "UEBERGABE" ? "Übergabeprotokoll" : "Rückgabeprotokoll";
}

// =============================================
// Protokoll (Feinplan 1.10)
// =============================================

/**
 * AuditLog-Codes. `details` nur mit IDs, Zustaenden, Stellen-Schluesseln,
 * Katalog- bzw. Aufgabentiteln und Anzahlen; die Kennung nur als
 * `mitKennung: true` bzw. als Anzahl, bei der Zuordnung Begruendungs-
 * schluessel – nie Namen, nie Adressen (G22).
 */
export const AUSGABEN_AUDIT = {
  // Onboarding
  AUSGABE_VERMERKT: "AUSGABE_VERMERKT",
  AUSGABE_KORRIGIERT: "AUSGABE_KORRIGIERT",
  AUSGABE_GETAUSCHT: "AUSGABE_GETAUSCHT",
  AUSGABE_ZURUECKGENOMMEN: "AUSGABE_ZURUECKGENOMMEN",
  AUSGABE_ENTFERNT: "AUSGABE_ENTFERNT",
  // Beide Module
  AUSGABE_UEBERNOMMEN: "AUSGABE_UEBERNOMMEN",
  EINSTELLUNG_ZUGEORDNET: "EINSTELLUNG_ZUGEORDNET",
  EINSTELLUNG_GELOEST: "EINSTELLUNG_GELOEST",
  // Offboarding
  RUECKGABEN_AKTUALISIERT: "RUECKGABEN_AKTUALISIERT",
  RUECKGABEN_VORGESCHLAGEN: "RUECKGABEN_VORGESCHLAGEN",
  AUSGABE_ZUSTAND_GEAENDERT: "AUSGABE_ZUSTAND_GEAENDERT",
  // Lauf „Aufbewahrung erzeugter Dokumente“ (am Herkunfts-Vorgang)
  AUSGABEN_GELOESCHT: "AUSGABEN_GELOESCHT",
} as const;
export type AusgabenAuditCode = (typeof AUSGABEN_AUDIT)[keyof typeof AUSGABEN_AUDIT];

/** Anzeige im Protokoll (audit-log-content.tsx haengt die Tabelle per Spread an). */
export const AUSGABEN_AUDIT_LABELS: Readonly<Record<AusgabenAuditCode, string>> = {
  [AUSGABEN_AUDIT.AUSGABE_VERMERKT]: "Übergabe vermerkt",
  [AUSGABEN_AUDIT.AUSGABE_KORRIGIERT]: "Übergabevermerk korrigiert",
  [AUSGABEN_AUDIT.AUSGABE_GETAUSCHT]: "Ausgabe getauscht",
  [AUSGABEN_AUDIT.AUSGABE_ZURUECKGENOMMEN]: "Ausgabe ohne Austritt zurückgenommen",
  [AUSGABEN_AUDIT.AUSGABE_ENTFERNT]: "Übergabevermerk entfernt",
  [AUSGABEN_AUDIT.AUSGABE_UEBERNOMMEN]: "Als ausgegeben übernommen",
  [AUSGABEN_AUDIT.EINSTELLUNG_ZUGEORDNET]: "Einstellung zugeordnet",
  [AUSGABEN_AUDIT.EINSTELLUNG_GELOEST]: "Zuordnung der Einstellung gelöst",
  [AUSGABEN_AUDIT.RUECKGABEN_AKTUALISIERT]: "Rückgaben aus der Einstellung aktualisiert",
  [AUSGABEN_AUDIT.RUECKGABEN_VORGESCHLAGEN]: "Rückgaben aus der Einstellung vorgeschlagen",
  [AUSGABEN_AUDIT.AUSGABE_ZUSTAND_GEAENDERT]: "Rückgabezustand geändert",
  [AUSGABEN_AUDIT.AUSGABEN_GELOESCHT]: "Ausgaben gelöscht (Aufbewahrung)",
};

// =============================================
// Hilfen (intern)
// =============================================

function enthalten<T extends string>(liste: readonly T[], wert: unknown): wert is T {
  return typeof wert === "string" && (liste as readonly string[]).includes(wert);
}

/**
 * Der Berliner Kalendertag eines Werts: `YYYY-MM-DD` bleibt, wie er ist; ein
 * Zeitpunkt (`Date`, ISO-Text) geht ueber `berlinerKalendertag`. Das passt fuer
 * beide Spaltenarten: Eine `@db.Date`-Spalte (`uebergebenAm`) kommt als
 * Mitternacht UTC an – in Berlin 01:00 bzw. 02:00 Uhr desselben Tages –, ein
 * Zeitstempel (`completedAt`, `returnedAt`) ist ein echter Zeitpunkt.
 * Unlesbares ergibt `null`.
 */
function kalendertagVon(wert: Date | string | null | undefined): Kalendertag | null {
  if (wert === null || wert === undefined) return null;
  if (typeof wert === "string") {
    const text = wert.trim();
    if (istKalendertag(text)) return text;
    if (text === "") return null;
    const d = new Date(text);
    return Number.isNaN(d.getTime()) ? null : berlinerKalendertag(d);
  }
  return Number.isNaN(wert.getTime()) ? null : berlinerKalendertag(wert);
}

/**
 * Der Kalendertag einer Ausgabe-Spalte (`uebergebenAm` als `@db.Date`) bzw.
 * eines Zeitpunkts – dieselbe Lesart wie Karte, Mail und Protokoll-Listen
 * (`kalendertagVon`). Der Dienst vergleicht damit z. B. ein korrigiertes
 * Uebergabedatum mit dem gespeicherten.
 */
export function ausgabeKalendertag(wert: Date | string | null | undefined): Kalendertag | null {
  return kalendertagVon(wert);
}

/** „TT.MM.JJJJ“; ohne Wert "" (Listen- und Mailfelder sind nie „—“). */
function tagText(wert: Date | string | null | undefined): string {
  const tag = kalendertagVon(wert);
  return tag ? formatKalendertag(tag) : "";
}

/** Hoechstens `max` Zeichen (Unicode-Codepunkte); Laengeres endet mit „…“. */
function gekappt(text: string, max: number): string {
  const zeichen = Array.from(text);
  return zeichen.length <= max ? text : `${zeichen.slice(0, max - 1).join("").trimEnd()}…`;
}

/** Anzeigename einer Stelle: gepflegter Name, sonst das Label des Schluessels. */
function stelleName(key: string, stellenNamen: Readonly<Record<string, string>>): string {
  const gepflegt = Object.prototype.hasOwnProperty.call(stellenNamen, key) ? stellenNamen[key]?.trim() : "";
  return gepflegt || abteilungLabel(key);
}

/**
 * Stellen in der Reihenfolge der Abteilungskarte (`abteilungsReihenfolge`),
 * dahinter alles, was keinen Link bekommt (alphabetisch), die
 * Personalabteilung ganz hinten.
 */
function stellenReihenfolge(keys: Iterable<string>): string[] {
  const alle = [...new Set(keys)];
  const link = abteilungsReihenfolge(alle);
  const rest = alle
    .filter((k) => !istLinkAbteilung(k) && k !== DEPARTMENT_KEYS.HR)
    .sort((a, b) => a.localeCompare(b, "de"));
  return [...link, ...rest, ...(alle.includes(DEPARTMENT_KEYS.HR) ? [DEPARTMENT_KEYS.HR] : [])];
}

/** Nur Stuecke „noch bei der Person“; ohne `zustand` (der Aufrufer hat schon gefiltert) zaehlt jedes. */
function nurAktive<T extends { zustand?: string | null }>(stuecke: ReadonlyArray<T>): T[] {
  return stuecke.filter((s) => s.zustand === undefined || s.zustand === null || enthalten(AUSGABE_AKTIV, s.zustand));
}

/** „eingerichtet“ bei einem Zugang (SPERREN, G4), sonst „übergeben“. */
function uebergabeWort(beiAustritt: string | null | undefined): string {
  return beiAustritt === "SPERREN" ? "eingerichtet" : "übergeben";
}

// =============================================
// Wann eine Uebergabe angeboten wird (G4, G27, E-A36)
// =============================================

/**
 * Bietet eine Zeile der Ausstattung „Übergabe vermerken“ an (G4)? Nur mit
 * `beiAustritt` RUECKGABE oder SPERREN – NICHTS und `null` nie, eine Angabe
 * nie (sie wird keine Aufgabe), eine gestrichene Zeile nie. Ohne `beiAustritt`
 * im Katalog ist A4 damit aus (G27).
 */
export function ausgabeMoeglich(zeile: {
  art: string;
  beiAustritt: string | null | undefined;
  gestrichenAm?: Date | string | null;
}): boolean {
  return zeile.art !== "ANGABE" && enthalten(AUSGABE_BEI_AUSTRITT, zeile.beiAustritt) && !zeile.gestrichenAm;
}

/**
 * Merker `SupervisorData.ausgabenAngeboten` (E-A36): Der Katalogausschnitt des
 * Vorgangs enthielt mindestens eine Position mit RUECKGABE oder SPERREN (eine
 * Angabe zaehlt nie). Er trennt im Reiter „Rückgaben“ „nichts ausgegeben“
 * (es gab etwas, gewaehlt wurde es nicht) von „vor der Einführung“.
 */
export function ausgabenAngeboten(
  ausschnitt: ReadonlyArray<{ art: string; beiAustritt?: string | null }>,
): boolean {
  return ausschnitt.some((p) => p.art !== "ANGABE" && enthalten(AUSGABE_BEI_AUSTRITT, p.beiAustritt));
}

/**
 * Bezeichnung eines Stuecks (`Ausgabe.bezeichnung`, G2): „Dienst-iPad
 * (Lernmittel)“ fuer die ganze Position, „Schlüssel: Haupteingang“ mit Option
 * (`option` "" = ganze Position). Nur aus der Momentaufnahme des Katalogs bzw.
 * der freien Position von HR – nie aus Bemerkung oder Kennung: Die
 * Bezeichnung steht in Aufgabentiteln des Austritts, die an Webhooks und in
 * Betreffzeilen gehen (G14, G21). Gekappt auf `AUSGABE_GRENZEN.bezeichnung`.
 */
export function ausgabeBezeichnung(zeile: { bezeichnung: string }, option: string): string {
  const basis = zeile.bezeichnung.trim();
  const opt = (option ?? "").trim();
  return gekappt(opt ? `${basis}: ${opt}` : basis, AUSGABE_GRENZEN.bezeichnung);
}

// =============================================
// Vermerk pruefen (G4)
// =============================================

/** Ein Stueck, wie Zod es liefert: Kennung und Datum optional (ohne Datum = heute). */
export interface VermerkStueck {
  kennung?: string | null;
  uebergebenAm?: Kalendertag | null;
}

/** Grund, aus dem `vermerkPruefen` ablehnt (400); der Text steht unter demselben Schluessel in MELDUNGEN_AUSGABEN. */
export type VermerkGrund =
  | "KEIN_STUECK"
  | "ZU_VIELE_STUECKE"
  | "ZU_VIELE_AKTIVE"
  | "DATUM_UNGUELTIG"
  | "DATUM_IN_ZUKUNFT"
  | "DATUM_ZU_FRUEH";

/**
 * Prueft einen Vermerk gegen die Grenzen aus G4 – auf dem Server nach der
 * Sperre (Link und HR-Karte), dieselbe Regel im Dialog:
 *
 *   - 1 bis `stueckJeVermerk` Stueck,
 *   - zusammen mit den schon aktiven (`aktiv`) hoechstens `aktiveJeAufgabe`,
 *   - ein Datum ist ein echter Kalendertag, nicht nach `heute` und nicht vor
 *     dem Berliner Tag des Anlegens minus `rueckwirkendTage`.
 *
 * `null` = in Ordnung.
 */
export function vermerkPruefen(
  eingabe: { stuecke: ReadonlyArray<VermerkStueck> },
  ctx: { heute: Kalendertag; vorgangAngelegt: Date | string; aktiv: number },
): VermerkGrund | null {
  const anzahlStuecke = eingabe.stuecke.length;
  if (anzahlStuecke === 0) return "KEIN_STUECK";
  if (anzahlStuecke > AUSGABE_GRENZEN.stueckJeVermerk) return "ZU_VIELE_STUECKE";
  if (ctx.aktiv + anzahlStuecke > AUSGABE_GRENZEN.aktiveJeAufgabe) return "ZU_VIELE_AKTIVE";
  const angelegt = kalendertagVon(ctx.vorgangAngelegt) ?? ctx.heute;
  const fruehestens = tageSpaeter(angelegt, -AUSGABE_GRENZEN.rueckwirkendTage);
  for (const s of eingabe.stuecke) {
    if (s.uebergebenAm === undefined || s.uebergebenAm === null) continue;
    if (!istKalendertag(s.uebergebenAm)) return "DATUM_UNGUELTIG";
    if (s.uebergebenAm > ctx.heute) return "DATUM_IN_ZUKUNFT";
    if (s.uebergebenAm < fruehestens) return "DATUM_ZU_FRUEH";
  }
  return null;
}

/**
 * Die Stuecke eines Vermerks, fertig zum Schreiben: Kennung `null` statt
 * fehlend, ohne Datum der heutige Berliner Tag (G4: „Vorgabe heute“).
 */
export function vermerkStuecke(
  stuecke: ReadonlyArray<VermerkStueck>,
  heute: Kalendertag,
): { kennung: string | null; uebergebenAm: Kalendertag }[] {
  return stuecke.map((s) => ({
    kennung: s.kennung?.trim() || null,
    uebergebenAm: s.uebergebenAm ?? heute,
  }));
}

// =============================================
// Ziel eines Vermerks und die neue Ausgabe (G2, G4; seit S24)
// =============================================

/**
 * Was ein Vermerk ueber seine Aufgabe weiss – gelesen NACH der Sperre des
 * Vorgangs (`vermerkZielLadenIn`, src/lib/ausgaben-daten.ts), fuer die
 * Karte (S24) und den Link der Stelle (S25) dieselbe Form.
 *
 *   - `zeile`: die Zeile der Ausstattung hinter der Aufgabe (ueber
 *     `OnboardingAusstattungAufgabe`); `null` bei einer Aufgabe ohne
 *     Verknuepfung (Vorlagenpunkt, Hinweis-Aufgabe).
 *   - `option`: "" = ganze Position, sonst die Option der Aufgabe.
 *   - `position`: die Katalogposition der Zeile; `null` bei einer freien
 *     Position von HR oder einer inzwischen geloeschten.
 */
export interface VermerkZiel {
  aufgabe: {
    id: string;
    assignee: string | null;
    herkunft: string | null;
    entfaelltAm: Date | string | null;
  };
  zeile: {
    id: string;
    positionId: string | null;
    departmentKey: string;
    art: string;
    bezeichnung: string;
    ausgabeKennung: string | null;
    rueckgabeKategorie: string | null;
    beiAustritt: string | null;
    gestrichenAm: Date | string | null;
  } | null;
  option: string;
  position: { organizationId: string | null } | null;
}

/** Warum an dieser Aufgabe kein Vermerk geht (409, der Text steht unter demselben Schluessel in MELDUNGEN_AUSGABEN). */
export type VermerkZielGrund = "KEINE_AUSGABE" | "AUFGABE_ENTFAELLT";

/**
 * Darf an dieser Aufgabe eine Uebergabe vermerkt werden (G4)? `null` = ja.
 *
 *   - KEINE_AUSGABE: keine Ausstattungsaufgabe (`herkunft` AUSSTATTUNG mit
 *     Zeile) oder die Zeile kommt beim Austritt weder zurueck noch wird sie
 *     gesperrt (`beiAustritt` NICHTS bzw. leer, Angabe).
 *   - AUFGABE_ENTFAELLT: die Aufgabe ist entfallen bzw. die Position
 *     gestrichen. Eine offene Aufgabe geht (getrennt vom Abhaken, E-A30).
 *
 * Erst KEINE_AUSGABE: Einer Position ohne Rueckgabe hilft auch keine
 * Wiederaufnahme.
 */
export function vermerkZielGrund(ziel: Pick<VermerkZiel, "aufgabe" | "zeile">): VermerkZielGrund | null {
  const z = ziel.zeile;
  if (
    !z ||
    ziel.aufgabe.herkunft !== "AUSSTATTUNG" ||
    !ausgabeMoeglich({ art: z.art, beiAustritt: z.beiAustritt, gestrichenAm: null })
  ) {
    return "KEINE_AUSGABE";
  }
  if (ziel.aufgabe.entfaelltAm || z.gestrichenAm) return "AUFGABE_ENTFAELLT";
  return null;
}

/**
 * Die festen Felder einer neuen Ausgabe (Schema `Ausgabe`, G2) – alles ausser
 * Kennung, Datum und Zustand, die je Stueck bzw. vom Schreiber kommen.
 */
export interface NeueAusgabe {
  /** Herkunft (Einstellung); `null` nur, wenn sie geloescht wurde. */
  onboardingId: string | null;
  /** Ausstattungsaufgabe, an der vermerkt wurde. */
  checklistItemId: string | null;
  /** Einrichtung, der das Stueck gehoert: die Empfaenger-Einrichtung der Einstellung (Arbeitsort, sonst Einrichtung). */
  organizationId: string;
  /** Die Position galt beim Vermerk zentral (E-A35). */
  zentral: boolean;
  /** Ausgebende Stelle. */
  departmentKey: string;
  /** „Schlüssel: Haupteingang“ – nie Freitext (`ausgabeBezeichnung`). */
  bezeichnung: string;
  /** Momentaufnahme `ausgabeKennung` („Inventarnummer“); `null` = „Kennung“. */
  kennungLabel: string | null;
  /** Nur bei RUECKGABE. */
  rueckgabeKategorie: string | null;
  beiAustritt: AusgabeBeiAustritt;
  quelle: AusgabeQuelle;
  /** HR-Konto bei `quelle` HR, sonst `null` (auf dem Link-Weg gibt es keine Person, G2). */
  erfasstVonId: string | null;
}

/**
 * Die neue Ausgabe zu einem Vermerk (G2), nachdem `vermerkZielGrund` `null`
 * ergab (sonst wirft die Funktion – ein Programmfehler, kein Fall fuer die
 * Antwort):
 *
 *   - `organizationId` = `empfaengerEinrichtung(vorgang)` – dieselbe Regel wie
 *     die Empfaenger der Abteilungsaufgaben (Arbeitsort, sonst Einrichtung);
 *   - `zentral` = die Katalogposition hat keine Einrichtung (eine freie
 *     Position von HR bzw. eine geloeschte Katalogposition: nicht zentral);
 *   - `departmentKey` = die Stelle der Aufgabe (sonst die der Zeile);
 *   - `bezeichnung` aus Zeile und Option (`ausgabeBezeichnung`);
 *   - `rueckgabeKategorie` nur bei RUECKGABE, `erfasstVonId` nur bei HR.
 */
export function ausgabeBasis(
  ziel: VermerkZiel,
  ctx: {
    vorgang: { id: string; organizationId: string; arbeitsortId?: string | null };
    quelle: AusgabeQuelle;
    erfasstVonId: string | null;
  },
): NeueAusgabe {
  const z = ziel.zeile;
  if (!z || !enthalten(AUSGABE_BEI_AUSTRITT, z.beiAustritt)) {
    throw new Error("ausgabeBasis: Die Aufgabe erlaubt keinen Vermerk (vorher vermerkZielGrund pruefen).");
  }
  return {
    onboardingId: ctx.vorgang.id,
    checklistItemId: ziel.aufgabe.id,
    organizationId: empfaengerEinrichtung(ctx.vorgang),
    zentral: ziel.position !== null && ziel.position.organizationId === null,
    departmentKey: ziel.aufgabe.assignee?.trim() || z.departmentKey,
    bezeichnung: ausgabeBezeichnung(z, ziel.option),
    kennungLabel: z.ausgabeKennung?.trim() || null,
    rueckgabeKategorie: z.beiAustritt === "RUECKGABE" ? z.rueckgabeKategorie?.trim() || null : null,
    beiAustritt: z.beiAustritt,
    quelle: ctx.quelle,
    erfasstVonId: ctx.quelle === "HR" ? ctx.erfasstVonId : null,
  };
}

/** Der Zustand der alten Ausgabe nach einem Tausch (G7): DEFEKT → ERSETZT (6 Monate), VERLOREN → FEHLT (3 Jahre ab Jahresende). */
export function tauschZustand(grund: TauschGrund): "ERSETZT" | "FEHLT" {
  return grund === "VERLOREN" ? "FEHLT" : "ERSETZT";
}

/**
 * Die feste Seite der Ersatz-Ausgabe eines Tauschs (G7): dieselbe Aufgabe,
 * Einrichtung, Stelle, Bezeichnung, Beschriftung, Kategorie und Art wie die
 * alte – vermerkt von HR. Kennung und Datum bringt der Dialog.
 */
export function ersatzBasis(
  alt: {
    onboardingId: string | null;
    checklistItemId: string | null;
    organizationId: string;
    zentral: boolean;
    departmentKey: string;
    bezeichnung: string;
    kennungLabel: string | null;
    rueckgabeKategorie: string | null;
    beiAustritt: string;
  },
  ctx: { erfasstVonId: string | null },
): NeueAusgabe {
  if (!enthalten(AUSGABE_BEI_AUSTRITT, alt.beiAustritt)) {
    throw new Error(`ersatzBasis: unbekanntes beiAustritt "${alt.beiAustritt}"`);
  }
  return {
    onboardingId: alt.onboardingId,
    checklistItemId: alt.checklistItemId,
    organizationId: alt.organizationId,
    zentral: alt.zentral,
    departmentKey: alt.departmentKey,
    bezeichnung: alt.bezeichnung,
    kennungLabel: alt.kennungLabel,
    rueckgabeKategorie: alt.rueckgabeKategorie,
    beiAustritt: alt.beiAustritt,
    quelle: "HR",
    erfasstVonId: ctx.erfasstVonId,
  };
}

// =============================================
// Zustandswechsel und Loeschfrist (G3, G20, E-A37)
// =============================================

/** Beginn des Berliner 1. Januar des Jahres `jahr`. */
function neujahr(jahr: number): Date {
  return beginnDesBerlinerTages(`${String(jahr).padStart(4, "0")}-01-01`);
}

/**
 * „Drei Jahre ab Jahresende“: der 1. Januar des vierten Folgejahres nach dem
 * BERLINER Jahr des Ankers (2027 → 1.1.2031), als Beginn des Berliner Tages.
 * Das Jahr kommt aus `vorgangsjahrInBerlin` – am 1. Januar um 00:30 Uhr ist in
 * UTC noch das alte Jahr.
 */
function dreiJahreAbJahresende(anker: Date): Date {
  return neujahr(vorgangsjahrInBerlin(anker).jahr + AUSGABE_VERJAEHRUNG_JAHRE + 1);
}

/**
 * Wann eine Ausgabe geloescht wird (E-A37, G20); `null` = nie von selbst.
 *
 *   - ZURUECK, BESCHAEDIGT, ENTFAELLT, ERSETZT: Beginn des Berliner Tages
 *     `AUSGABE_AUFBEWAHRUNG_MONATE` nach `zustandAm`, am Monatsende gekappt
 *     (31.08. → 28. bzw. 29.02.).
 *   - FEHLT: drei Jahre ab Ende des Berliner Jahres von `zustandAm`.
 *   - AUSGEGEBEN: `null` – ausser das Stueck blieb beim Abschluss eines
 *     Austritts offen (`austrittAbgeschlossenAm`, G18) oder die Einstellung
 *     wurde abgesagt (`vorgangEingestelltAm`, G10): dann dieselbe Rechnung wie
 *     bei FEHLT ab diesem Zeitpunkt. Sind beide gesetzt (im Ablauf nicht
 *     vorgesehen), zaehlt der spaetere – geloescht wird nie frueher, als eine
 *     der beiden Regeln verlangt.
 *   - VERBLEIBT: `null` (bleibt Bestand der Person, G28).
 *
 * Der Anker der Frist steckt nur hier (Feinplan Abschnitt 6, Frage 1).
 */
export function ausgabeLoeschenAb(opts: {
  zustand: AusgabeZustand;
  zustandAm: Date;
  austrittAbgeschlossenAm?: Date | null;
  vorgangEingestelltAm?: Date | null;
}): Date | null {
  switch (opts.zustand) {
    case "ZURUECK":
    case "BESCHAEDIGT":
    case "ENTFAELLT":
    case "ERSETZT":
      return beginnDesBerlinerTages(
        monateSpaeter(berlinerKalendertag(opts.zustandAm), AUSGABE_AUFBEWAHRUNG_MONATE),
      );
    case "FEHLT":
      return dreiJahreAbJahresende(opts.zustandAm);
    case "AUSGEGEBEN": {
      const anker = [opts.austrittAbgeschlossenAm, opts.vorgangEingestelltAm]
        .map(gueltigerZeitpunkt)
        .filter((d): d is Date => d !== null)
        .sort((a, b) => b.getTime() - a.getTime())[0];
      return anker ? dreiJahreAbJahresende(anker) : null;
    }
    default:
      // VERBLEIBT – und alles, was kein bekannter Zustand ist: nie von selbst loeschen.
      return null;
  }
}

/**
 * Ein gueltiger Zeitpunkt als Date dieses Realms, sonst `null`. Bewusst ohne
 * `instanceof Date`: Ein Date aus einem anderen Realm (etwa nach
 * `structuredClone`) fiele dort still durch, und der Anker der Frist ginge
 * verloren – ein Stueck bliebe ohne Fehler unbegrenzt gespeichert.
 */
function gueltigerZeitpunkt(d: Date | null | undefined): Date | null {
  if (d === null || d === undefined || Object.prototype.toString.call(d) !== "[object Date]") return null;
  const ms = d.getTime();
  return Number.isNaN(ms) ? null : new Date(ms);
}

/** Was jeder Zustandswechsel an einer Ausgabe schreibt (G3). */
export interface AusgabeZustandDaten {
  zustand: AusgabeZustand;
  zustandAm: Date;
  loeschenAb: Date | null;
}

/**
 * Der EINZIGE Bauplan eines Zustandswechsels (G3): Zustand, Zeitpunkt und
 * Loeschfrist kommen immer gemeinsam. `ausgaben-schreiben.ts` schreibt nur,
 * was diese Funktion liefert – so vergisst kein Weg die Frist.
 */
export function ausgabeZustandDaten(
  zustand: AusgabeZustand,
  jetzt: Date,
  opts: { austrittAbgeschlossenAm?: Date | null; vorgangEingestelltAm?: Date | null } = {},
): AusgabeZustandDaten {
  return { zustand, zustandAm: jetzt, loeschenAb: ausgabeLoeschenAb({ zustand, zustandAm: jetzt, ...opts }) };
}

// =============================================
// Bindung an einen Austritt (G28)
// =============================================

/**
 * Ein Austritt, der eine Ausgabe BEZIEHT: Er hat eine Aufgabe (`herkunft`
 * AUSGABE oder AUSGABE_FEHLT) oder eine `ReturnItem` mit ihrer `ausgabeId`.
 */
export interface AustrittsBezug {
  offboardingId: string;
  /** OffboardingStatus des Austritts. */
  status: string;
  /** Vorgangsnummer – NUR, wenn die Sitzung den Austritt oeffnen darf (canAccessProcess), sonst null. */
  displayId?: string | null;
  /**
   * Der Stand DIESES Austritts: der Zustand seiner eigenen Rueckgabe-Zeile zu
   * der Ausgabe (`rueckgabeZustand`). Fehlt bei offener Zeile und an einem
   * Zugang (SPERREN hat keine Zeile) – dann zaehlt der Zustand der Ausgabe
   * (`bezugBindet`).
   */
  eigenerStand?: RueckgabeZustand;
  /**
   * Ein SPAETERER Austritt bezieht die Ausgabe ebenfalls (seine erste Zeile zu
   * ihr ist juenger): Der juengste Bezug gilt (`bezugBindet`). Fehlt = nein
   * bzw. nicht bekannt.
   */
  abgeloest?: boolean;
}

/** Ein Bezug samt der Ausgabe, auf die er sich bezieht (Listenform fuer mehrere Ausgaben). */
export interface AusgabeBezug extends AustrittsBezug {
  ausgabeId: string;
}

/**
 * Bindet ein Austritt, der die Ausgabe bezieht, sie (G28)?
 *
 *   - laufend (nicht COMPLETED, nicht CANCELLED): immer;
 *   - COMPLETED: alles ausser VERBLEIBT – auch ein beim Abschluss offen
 *     gebliebenes AUSGEGEBEN (die spaete Rueckgabe gehoert in dessen Reiter);
 *   - CANCELLED: nie.
 *
 * Gebunden heisst: Karte (G7) und jeder andere Austritt antworten 409
 * `AUSGABE_IM_AUSTRITT`, die Ausgabe ist kein Kandidat eines anderen
 * Austritts (G13).
 */
export function bindetAusgabe(austrittStatus: string, ausgabeZustand: string): boolean {
  if (austrittStatus === "CANCELLED") return false;
  if (austrittStatus === "COMPLETED") return ausgabeZustand !== "VERBLEIBT";
  return true;
}

/**
 * Bindet DIESER Bezug die Ausgabe (G28)? `bindetAusgabe`, aber ein
 * abgeschlossener Austritt wird am eigenen Stand beim Austritt gemessen, nicht
 * am Zustand, den die Ausgabe heute hat:
 *
 *   - ein spaeterer Austritt bezieht das Stueck ebenfalls (`abgeloest`): nie.
 *     Uebernehmen konnte er es nur, nachdem dieser es freigegeben hatte
 *     (VERBLEIBT) – der juengste Bezug gilt. So bindet ein frueherer Austritt
 *     das Stueck nicht wieder, sobald der spaetere es zum ersten Mal umschaltet
 *     (ZURUECK, FEHLT …); sonst endete dort jede weitere Aenderung in 409
 *     AUSGABE_IM_AUSTRITT mit der Nummer des frueheren;
 *   - sonst der Zustand der eigenen Rueckgabe-Zeile (`eigenerStand`), bei
 *     offener Zeile bzw. an einem Zugang der Zustand der Ausgabe.
 *
 * Laufend und abgebrochen wie `bindetAusgabe`.
 */
export function bezugBindet(bezug: AustrittsBezug, ausgabeZustand: string): boolean {
  if (bezug.status !== "COMPLETED") return bindetAusgabe(bezug.status, ausgabeZustand);
  if (bezug.abgeloest === true) return false;
  return bindetAusgabe(bezug.status, bezug.eigenerStand ?? ausgabeZustand);
}

/**
 * Der Austritt, an den die Ausgabe gebunden ist (`bezugBindet`) – ausser
 * `ausser` (der eigene Austritt im Reiter „Rückgaben“). `null` = frei. Die
 * Bezuege liest der Aufrufer NACH der Sperre der Ausgabe (G24).
 */
export function bindenderAustritt<B extends AustrittsBezug>(
  ausgabe: { zustand: string },
  bezuege: ReadonlyArray<B>,
  ausser?: string | null,
): B | null {
  return bezuege.find((b) => b.offboardingId !== ausser && bezugBindet(b, ausgabe.zustand)) ?? null;
}

/**
 * Wer bezieht die Ausgabe zuletzt (G28, `abgeloest`)? Je Austritt der
 * Zeitpunkt seiner ERSTEN Zeile zu ihr (Aufgabe oder Rueckgabe – der Moment
 * der Uebernahme); abgeloest ist jeder Austritt, nach dem ein anderer sie
 * bezogen hat. Ohne Zeitpunkt (`null`) laesst sich nichts vergleichen: dann
 * abgeloest = nein. Antwort: die abgeloesten Austritte.
 */
export function abgeloesteAustritte(seit: ReadonlyMap<string, number | null>): Set<string> {
  const bekannt = [...seit].filter((e): e is [string, number] => e[1] !== null);
  const abgeloest = new Set<string>();
  for (const [id, zeit] of bekannt) {
    if (bekannt.some(([anderer, z]) => anderer !== id && z > zeit)) abgeloest.add(id);
  }
  return abgeloest;
}

/**
 * Darf die Stelle diesen Vermerk ueber ihren Link entfernen (G6)? Nur einen
 * eigenen Link-Vermerk (`quelle` LINK), solange das Stueck AUSGEGEBEN und an
 * keinen Austritt gebunden ist. Dass die Aufgabe zur Stelle gehoert, prueft
 * der Dienst.
 */
export function perLinkEntfernbar(ausgabe: { quelle: string; zustand: string }, gebunden: boolean): boolean {
  return ausgabe.quelle === "LINK" && ausgabe.zustand === "AUSGEGEBEN" && !gebunden;
}

/**
 * Die Loeschfrist, die die Absage der Einstellung einem Stueck gibt (G10,
 * `ausgabenFristBeiAbsageIn`): fuer ein aktives Stueck, das kein Austritt
 * bindet (G28), `ausgabeLoeschenAb` mit `vorgangEingestelltAm` – drei Jahre ab
 * Ende des Berliner Jahres der Absage (`expiredAt`). `null` heisst: nichts
 * schreiben –
 *
 *   - nicht mehr aktiv: Ein Endzustand (ZURUECK, FEHLT, ERSETZT …) behaelt
 *     seine Frist;
 *   - gebunden: Das Stueck fuehrt sein Austritt (dessen Abschluss setzt die
 *     Frist, G18);
 *   - ohne Frist nach G20: VERBLEIBT bleibt Bestand der Person.
 *
 * Der Zustand aendert sich nicht (1.2: „AUSGEGEBEN → AUSGEGEBEN mit Frist“).
 * Vermerkt HR danach die Ruecknahme, gilt die kuerzere Frist des neuen
 * Zustands (`ausgabeZustandDaten`).
 */
export function absageFrist(
  ausgabe: { zustand: string; zustandAm: Date },
  bezuege: ReadonlyArray<AustrittsBezug>,
  vorgangEingestelltAm: Date,
): Date | null {
  if (!enthalten(AUSGABE_AKTIV, ausgabe.zustand)) return null;
  if (bindenderAustritt(ausgabe, bezuege)) return null;
  return ausgabeLoeschenAb({ zustand: ausgabe.zustand, zustandAm: ausgabe.zustandAm, vorgangEingestelltAm });
}

/**
 * Die Loeschfrist, die der Abschluss eines Austritts einem dort OFFEN
 * gebliebenen Stueck gibt (G18, S31, `offeneAusgabenAbschliessenIn`):
 * `ausgabeLoeschenAb` fuer AUSGEGEBEN mit `austrittAbgeschlossenAm` – drei
 * Jahre ab Ende des Berliner Jahres des Abschlusses (G20). Offen heisst:
 *
 *   - AUSGEGEBEN: Der Zustand bleibt (1.2: „AUSGEGEBEN → AUSGEGEBEN mit
 *     Frist“);
 *   - VERBLEIBT mit offener Zeile bzw. Aufgabe IN DIESEM Austritt
 *     (`hierOffen`): ein Stueck, das ein frueherer Austritt mit „verbleibt“
 *     freigab und das dieser unveraendert uebernommen hat. Der Aufrufer setzt
 *     es mit dieser Frist auf AUSGEGEBEN (1.2: „VERBLEIBT → AUSGEGEBEN mit
 *     Frist“) – sonst gaebe der Abschluss es frei, die Zeile stuende fuer immer
 *     auf „offen“, kein Austritt nahme die spaete Rueckgabe auf, und die
 *     Kennung bliebe unbegrenzt gespeichert (gegen G18, G20).
 *
 * Das Stueck bleibt danach an den abgeschlossenen Austritt gebunden (G28),
 * dessen Reiter die spaete Rueckgabe aufnimmt. `null` heisst: nichts
 * schreiben –
 *
 *   - nicht offen: Ein Endzustand (ZURUECK, FEHLT, ENTFAELLT …) behaelt seine
 *     Frist, ein hier gesetztes VERBLEIBT bleibt ohne (Bestand der Person, mit
 *     dem Abschluss freigegeben);
 *   - ein ANDERER, laufender Austritt bezieht das Stueck: Den fuehrt dieser
 *     (nur nach einem Admin-Abschluss eines schon abgeschlossenen oder
 *     abgebrochenen Austritts denkbar) – sein eigener Abschluss setzt die
 *     Frist. Ein anderer abgeschlossener Austritt haelt nicht ab: Er hat das
 *     Stueck mit VERBLEIBT freigegeben, bevor dieser es uebernahm (`abgeloest`,
 *     `bezugBindet`);
 *   - die vorhandene Frist liegt nicht frueher (etwa aus dem Abschluss eines
 *     spaeteren Austritts): geloescht wird nie frueher, als eine der Regeln
 *     verlangt.
 */
export function abschlussFrist(
  ausgabe: { zustand: string; zustandAm: Date; loeschenAb?: Date | null; hierOffen?: boolean },
  bezuege: ReadonlyArray<AustrittsBezug>,
  austritt: { id: string; abgeschlossenAm: Date },
): Date | null {
  const offenVerbleibt = ausgabe.zustand === "VERBLEIBT" && ausgabe.hierOffen === true;
  if (ausgabe.zustand !== "AUSGEGEBEN" && !offenVerbleibt) return null;
  if (bezuege.some((b) => b.offboardingId !== austritt.id && austrittLaeuft(b.status))) return null;
  const frist = ausgabeLoeschenAb({
    zustand: "AUSGEGEBEN",
    zustandAm: ausgabe.zustandAm,
    austrittAbgeschlossenAm: austritt.abgeschlossenAm,
  });
  if (!frist) return null;
  const vorhanden = gueltigerZeitpunkt(ausgabe.loeschenAb);
  return vorhanden && vorhanden.getTime() >= frist.getTime() ? null : frist;
}

// =============================================
// Unterschriebenes Protokoll (G19, E-A34)
// =============================================

export interface ProtokollStand {
  /** Es gibt aktive Ausgaben mit RUECKGABE bzw. Rueckgaben mit `ausgabeId` – erst dann zeigt die Karte die Zeile. */
  noetig: boolean;
  /** Hochladezeitpunkt des juengsten Dokuments dieses Typs, sonst null. */
  hochgeladenAm: Date | null;
}

/**
 * Stand des unterschriebenen Uebergabe- bzw. Rueckgabeprotokolls (G19),
 * berechnet nur aus dem Dokumenttyp: noetig, sobald es Stuecke mit Rueckgabe
 * gibt; das juengste hochgeladene Dokument zaehlt.
 */
export function protokollStand(opts: {
  ausgabenMitRueckgabe: number;
  dokumente: ReadonlyArray<{ uploadedAt: Date | string }>;
}): ProtokollStand {
  let juengstes: Date | null = null;
  for (const dok of opts.dokumente) {
    const zeit = dok.uploadedAt instanceof Date ? dok.uploadedAt : new Date(dok.uploadedAt);
    if (Number.isNaN(zeit.getTime())) continue;
    if (!juengstes || zeit.getTime() > juengstes.getTime()) juengstes = zeit;
  }
  return { noetig: opts.ausgabenMitRueckgabe > 0, hochgeladenAm: juengstes };
}

/**
 * Die Zeile der Karte bzw. des Reiters: „Unterschriebenes Übergabeprotokoll:
 * fehlt“ bzw. „… hochgeladen am TT.MM.JJJJ“; `null`, solange sie nicht noetig ist.
 */
export function protokollText(art: ProtokollArt, stand: ProtokollStand): string | null {
  if (!stand.noetig) return null;
  return stand.hochgeladenAm
    ? MELDUNGEN_AUSGABEN.PROTOKOLL_HOCHGELADEN(art, tagText(stand.hochgeladenAm))
    : MELDUNGEN_AUSGABEN.PROTOKOLL_FEHLT(art);
}

/** Die Zeile der Karte bzw. des Reiters als JSON (G19) – die Oberflaeche rechnet nichts. */
export interface ProtokollAnzeige {
  art: ProtokollArt;
  /** Es gibt aktive Ausgaben mit RUECKGABE (Karte) bzw. Rueckgaben mit `ausgabeId` (Reiter). */
  noetig: boolean;
  /** Hochladezeitpunkt des juengsten Dokuments als ISO-Zeitpunkt, sonst `null`. */
  hochgeladenAm: string | null;
  /** „Unterschriebenes Übergabeprotokoll: fehlt“ bzw. „… hochgeladen am TT.MM.JJJJ“; `null`, solange nicht noetig. */
  text: string | null;
}

/** `protokollStand` samt Text fuer Karte und Reiter (G19). */
export function protokollAnzeige(art: ProtokollArt, stand: ProtokollStand): ProtokollAnzeige {
  return {
    art,
    noetig: stand.noetig,
    hochgeladenAm: stand.hochgeladenAm ? stand.hochgeladenAm.toISOString() : null,
    text: protokollText(art, stand),
  };
}

/**
 * Aktive Ausgaben mit RUECKGABE (Gegenstaende, die zurueckkommen) – ab einer
 * zeigt die Karte die Zeile zum unterschriebenen Uebergabeprotokoll (G19).
 * Zugaenge (SPERREN) und Zurueckgenommenes zaehlen nicht.
 */
export function ausgabenMitRueckgabe(ausgaben: ReadonlyArray<{ zustand: string; beiAustritt: string }>): number {
  return ausgaben.filter((a) => a.beiAustritt === "RUECKGABE" && enthalten(AUSGABE_AKTIV, a.zustand)).length;
}

// =============================================
// Rueckgabe-Zeilen (ReturnItem, G16, 1.9)
// =============================================

/** Was die Regeln an einer Rueckgabe-Zeile lesen. */
export interface RueckgabeStand {
  zustand?: string | null;
  isReturned: boolean;
}

/**
 * Zustand einer Rueckgabe (G16). Altbestand ohne Zustand mit `isReturned`
 * gilt als ZURUECK – ohne Datenmigration. `null` = offen.
 */
export function rueckgabeZustand(item: RueckgabeStand): RueckgabeZustand | null {
  if (enthalten(RUECKGABE_ZUSTAENDE, item.zustand)) return item.zustand;
  return item.isReturned ? "ZURUECK" : null;
}

/**
 * Offen heisst: ohne Zustand und nicht zurueckgegeben. Alle Leser von „offen“
 * (Fortschritt, Export, Brief-Platzhalter, Abschluss) nehmen diese Funktion –
 * „fehlt“, „verbleibt“ und „entfällt“ sind erledigt, nur nicht zurueck.
 */
export function rueckgabeOffen(item: RueckgabeStand): boolean {
  return rueckgabeZustand(item) === null;
}

/** Was ein Zustandswechsel an einer Rueckgabe-Zeile schreibt (G16). */
export interface RueckgabeDaten {
  zustand: RueckgabeZustand | null;
  isReturned: boolean;
  returnedAt: Date | null;
  returnedToId: string | null;
}

/**
 * Die Felder einer Rueckgabe-Zeile zu einem Zustand: `isReturned` (samt
 * Zeitpunkt und Person) nur bei ZURUECK und BESCHAEDIGT; `null` = wieder offen.
 */
export function rueckgabeDaten(zustand: RueckgabeZustand | null, jetzt: Date, userId: string | null): RueckgabeDaten {
  const zurueck = zustand === "ZURUECK" || zustand === "BESCHAEDIGT";
  return {
    zustand,
    isReturned: zurueck,
    returnedAt: zurueck ? jetzt : null,
    returnedToId: zurueck ? userId : null,
  };
}

/**
 * Eine Zeile fuer den Brief-Platzhalter `rueckgaben_liste` (1.9):
 *
 *   „Laptop (FES-0412) — zurueck am 31.07.2027“ (ZURUECK und Altbestand, Wortlaut unveraendert)
 *   „Laptop — beschädigt zurück am 31.07.2027“
 *   „Schlüssel: Haupteingang (GS-114) — fehlt“ / „— verbleibt“ / „— entfällt“
 *
 * Offen: nur Name und Kennung (Zeile fuer `rueckgaben_offen_liste`). Ohne
 * Rueckgabedatum faellt „am …“ weg (ZURUECK dann wie bisher ganz ohne Zusatz).
 */
export function rueckgabeZeileText(
  item: RueckgabeStand & { itemName: string; serialNumber?: string | null; returnedAt?: Date | string | null },
): string {
  const name = item.serialNumber ? `${item.itemName} (${item.serialNumber})` : item.itemName;
  const zustand = rueckgabeZustand(item);
  if (zustand === null) return name;
  const am = tagText(item.returnedAt);
  if (zustand === "ZURUECK") return am ? `${name} — zurueck am ${am}` : name;
  const wort = AUSGABE_ZUSTAND_LABELS[zustand];
  if (zustand === "BESCHAEDIGT" && am) return `${name} — ${wort} am ${am}`;
  return `${name} — ${wort}`;
}

// =============================================
// Ruecknahme-, Sperr- und Folgeaufgaben im Austritt (G14, G17)
// =============================================

/** Eine neue `OffboardingChecklistItem` zu einer Ausgabe – fertig fuer `createMany`. */
export interface AufgabenEntwurf {
  title: string;
  description: string;
  category: string;
  orderIndex: number;
  /** Mitternacht UTC des Berliner Kalendertags (wie die uebrigen Faelligkeiten des Austritts). */
  dueDate: Date;
  assigneeDepartment: string;
  herkunft: OffboardingAufgabenHerkunft;
  ausgabeId: string;
}

/** Was die Entwuerfe von einer Ausgabe lesen. */
export interface AusgabeFuerAufgabe {
  id: string;
  bezeichnung: string;
  beiAustritt: string;
  departmentKey: string;
}

/**
 * Ruecknahme- (RUECKGABE) bzw. Sperraufgabe (SPERREN) der ausgebenden Stelle
 * (G14): Titel aus der Bezeichnung, NIE mit Kennung; feste Beschreibung;
 * Kategorie „Ausstattung & Zugänge“ im Bereich ab `ORDER_BASIS` (vor allen
 * Vorlagenpunkten, die ab 0 zaehlen; `index` = Position im Vorschlag);
 * faellig am spaeteren von letztem Arbeitstag und heute. Die Stelle ist die
 * ausgebende – HR heisst Portal-Aufgabe ohne Link.
 */
export function ruecknahmeAufgabe(
  ausgabe: AusgabeFuerAufgabe,
  ctx: { letzterArbeitstag: Date | string | null | undefined; heute: Kalendertag; index: number },
): AufgabenEntwurf {
  const sperren = ausgabe.beiAustritt === "SPERREN";
  const letzter = kalendertagVon(ctx.letzterArbeitstag);
  return {
    title: sperren
      ? RUECKNAHME_TEXTE.titelSperren(ausgabe.bezeichnung)
      : RUECKNAHME_TEXTE.titelRueckgabe(ausgabe.bezeichnung),
    description: sperren ? RUECKNAHME_TEXTE.beschreibungSperren : RUECKNAHME_TEXTE.beschreibungRueckgabe,
    category: AUSSTATTUNG_KATEGORIE,
    orderIndex: ORDER_BASIS + Math.max(0, Math.trunc(ctx.index)),
    dueDate: kalendertagAlsDatum(letzter ? spaeter(letzter, ctx.heute) : ctx.heute),
    assigneeDepartment: ausgabe.departmentKey,
    herkunft: "AUSGABE",
    ausgabeId: ausgabe.id,
  };
}

/** Folgeaufgabe vor allen Ruecknahmeaufgaben: faellig heute. */
export const FOLGE_ORDER_INDEX = ORDER_BASIS - 1;

/**
 * Folgeaufgabe „Schließung prüfen“ an die Gebaeudewirtschaft, wenn ein
 * Schluessel fehlt (G17): faellig heute, ohne Kennung im Titel. Ob sie noetig
 * ist, sagt `folgeAufgabeNoetig`.
 */
export function folgeAufgabe(ausgabe: { id: string; bezeichnung: string }, heute: Kalendertag): AufgabenEntwurf {
  return {
    title: RUECKNAHME_TEXTE.titelFolge(ausgabe.bezeichnung),
    description: RUECKNAHME_TEXTE.beschreibungFolge,
    category: AUSSTATTUNG_KATEGORIE,
    orderIndex: FOLGE_ORDER_INDEX,
    dueDate: kalendertagAlsDatum(heute),
    assigneeDepartment: FOLGE_STELLE,
    herkunft: "AUSGABE_FEHLT",
    ausgabeId: ausgabe.id,
  };
}

/** Braucht der neue Zustand eine Folgeaufgabe (G17)? Nur FEHLT bei der Kategorie SCHLUESSEL. */
export function folgeAufgabeNoetig(ausgabe: { rueckgabeKategorie?: string | null }, zustand: string | null): boolean {
  return ausgabe.rueckgabeKategorie === "SCHLUESSEL" && zustand === "FEHLT";
}

/**
 * Muss der Wechsel den Link der Gebaeudewirtschaft vorab mitsperren (G17,
 * G24: Links vor Aufgaben)? Ja, sobald bei einem SCHLUESSEL FEHLT gesetzt
 * (Folgeaufgabe entsteht) oder verlassen wird (eine offene Folgeaufgabe wird
 * geloescht).
 */
export function brauchtFolgeStelle(
  ausgabe: { rueckgabeKategorie?: string | null },
  alt: string | null,
  neu: string | null,
): boolean {
  if (ausgabe.rueckgabeKategorie !== "SCHLUESSEL" || alt === neu) return false;
  return alt === "FEHLT" || neu === "FEHLT";
}

/**
 * Was eine wieder geoeffnete Folgeaufgabe schreibt (G17): offen, faellig
 * heute, ohne die Erledigung und ohne den Kommentar der Stelle aus der
 * frueheren Pruefung — der erneute Verlust ist ein neuer Anlass.
 */
export interface FolgeWiederoeffnen {
  isCompleted: false;
  completedAt: null;
  completedById: null;
  dueDate: Date;
  abteilungKommentar: null;
  abteilungKommentarAm: null;
}

/** Was der Gleichlauf mit der Folgeaufgabe „Schließung prüfen“ tut (G17). */
export type FolgeSchritt =
  | { art: "ANLEGEN"; aufgabe: AufgabenEntwurf }
  | { art: "WIEDEROEFFNEN"; id: string; daten: FolgeWiederoeffnen }
  | { art: "LOESCHEN"; id: string };

/**
 * Was ein Zustandswechsel eines Schluessels mit seiner Folgeaufgabe tut (G17)
 * — eine Rechnung fuer alle drei Wege (`ausgabeGleichlaufIn`, S30). Je
 * Austritt und Ausgabe gibt es hoechstens EINE Folgeaufgabe
 * (`@@unique([offboardingId, ausgabeId, herkunft])`); `vorhanden` ist sie,
 * gelesen nach der Sperre des FACILITY-Links (`brauchtFolgeStelle`, G24).
 *
 *   - FEHLT gesetzt, keine vorhanden: ANLEGEN (`folgeAufgabe`).
 *   - FEHLT gesetzt, eine ERLEDIGTE vorhanden (das Stueck fehlte schon einmal,
 *     die Gebaeudewirtschaft hat geprueft, danach ZURUECK bzw. Wiederoeffnen
 *     und jetzt wieder FEHLT): WIEDEROEFFNEN (`FolgeWiederoeffnen`). Ein
 *     zweites Anlegen scheiterte am Unique-Index (P2002, die Stelle koennte
 *     „Fehlt“ nicht mehr setzen), ein `skipDuplicates` verschluckte den
 *     erneuten Verlust still.
 *   - FEHLT gesetzt, eine OFFENE vorhanden: nichts.
 *   - FEHLT verlassen: eine OFFENE wird geloescht (LOESCHEN), eine erledigte
 *     bleibt als Nachweis der Pruefung.
 *   - kein Schluessel oder kein Wechsel: nichts (`null`).
 *
 * Wo etwas geschieht, hat `brauchtFolgeStelle` den FACILITY-Link vorab
 * mitgesperrt – beide Funktionen lesen dieselbe Bedingung.
 */
export function folgeAufgabeSchritt(opts: {
  ausgabe: { id: string; bezeichnung: string; rueckgabeKategorie?: string | null };
  alt: string | null;
  neu: string | null;
  vorhanden: { id: string; isCompleted: boolean } | null;
  heute: Kalendertag;
}): FolgeSchritt | null {
  const { ausgabe, alt, neu, vorhanden, heute } = opts;
  if (!brauchtFolgeStelle(ausgabe, alt, neu)) return null;
  if (folgeAufgabeNoetig(ausgabe, neu)) {
    if (!vorhanden) return { art: "ANLEGEN", aufgabe: folgeAufgabe(ausgabe, heute) };
    if (!vorhanden.isCompleted) return null;
    return {
      art: "WIEDEROEFFNEN",
      id: vorhanden.id,
      daten: {
        isCompleted: false,
        completedAt: null,
        completedById: null,
        dueDate: kalendertagAlsDatum(heute),
        abteilungKommentar: null,
        abteilungKommentarAm: null,
      },
    };
  }
  return vorhanden && !vorhanden.isCompleted ? { art: "LOESCHEN", id: vorhanden.id } : null;
}

// =============================================
// Gleichlauf: ein Stueck, drei Zeilen, ein Stand (G15, G16; seit S30)
// =============================================

/**
 * Welchen Rueckgabezustand eine Aenderung an einer Ruecknahme- oder
 * Sperraufgabe meint (G15) – fuer den Link der Stelle und den Portal-PATCH
 * dieselbe Regel:
 *
 *   - ein Zustand im Body gilt immer (er heisst „erledigt“ – auch als reiner
 *     Wechsel an einer schon erledigten Aufgabe, etwa ZURUECK → FEHLT);
 *   - abhaken OHNE Zustand (`isCompleted: true` an einer offenen Aufgabe)
 *     heisst ZURUECK, bei einem Zugang „gesperrt“ – so bleibt der Haken im
 *     Reiter Checkliste gueltig (`toggleChecklistItem` schickt nur
 *     `{ isCompleted }`);
 *   - wieder oeffnen (`isCompleted: false` an einer erledigten) heisst offen
 *     (`null`);
 *   - sonst – ein zweites „erledigt“, „offen“ an einer offenen Aufgabe, nur
 *     Kommentar oder Notiz – `undefined`: nichts zu tun.
 *
 * `warErledigt` ist der Stand der Aufgabe NACH der Sperre des Austritts.
 */
export function rueckgabeZiel(opts: {
  warErledigt: boolean;
  isCompleted?: boolean;
  zustand?: RueckgabeZustand;
}): RueckgabeZustand | null | undefined {
  if (opts.zustand !== undefined) return opts.zustand;
  if (opts.isCompleted === true && !opts.warErledigt) return "ZURUECK";
  if (opts.isCompleted === false && opts.warErledigt) return null;
  return undefined;
}

/**
 * Der Zielzustand aus dem Body des Reiters „Rückgaben“ (G16): `zustand`
 * (`null` = wieder offen) oder die Altform `isReturned` (`true` = ZURUECK,
 * `false` = offen; beides zugleich weist das Schema ab). `undefined` = der
 * Body sagt nichts zum Zustand.
 */
export function rueckgabeZielAusEingabe(eingabe: {
  zustand?: RueckgabeZustand | null;
  isReturned?: boolean;
}): RueckgabeZustand | null | undefined {
  if (eingabe.zustand !== undefined) return eingabe.zustand;
  if (eingabe.isReturned !== undefined) return eingabe.isReturned ? "ZURUECK" : null;
  return undefined;
}

/** Warum ein Rueckgabezustand an dieser Aufgabe nicht geht (400). */
export type ZustandFehler = "ZUSTAND_NICHT_MOEGLICH" | "ZUGANG_NUR_GESPERRT";

/**
 * Passt ein Rueckgabezustand zu dieser Aufgabe (G15, 1.2)? `art` ist
 * `beiAustritt` der Ausgabe hinter einer Ruecknahme- bzw. Sperraufgabe,
 * `null` heisst: keine Ausgabe (Vorlagenaufgabe, Folgeaufgabe „Schließung
 * prüfen“, Ausgabe nach Ablauf der Frist geloescht).
 *
 *   - ohne Ausgabe nie (`ZUSTAND_NICHT_MOEGLICH`) – die Folgeaufgabe hat den
 *     normalen Haken (G17);
 *   - die Stelle ueber ihren Link nur an einem Gegenstand (RUECKGABE; welche
 *     drei Zustaende, sagt das Schema) – ein Zugang hat seinen Haken
 *     („gesperrt“);
 *   - HR im Portal am Gegenstand alle fuenf, an einem Zugang ZURUECK
 *     („gesperrt“), VERBLEIBT und ENTFAELLT; „beschädigt“ und „fehlt“ gelten
 *     nur fuer Gegenstaende (`ZUGANG_NUR_GESPERRT`, dieselbe Regel wie
 *     `zurueckgenommen` in der Karte).
 *
 * Ohne Zustand im Body nie ein Fehler.
 */
export function zustandFehler(opts: {
  art: string | null | undefined;
  zustand: string | null | undefined;
  weg: "LINK" | "HR";
}): ZustandFehler | null {
  if (opts.zustand === undefined || opts.zustand === null) return null;
  if (opts.art === "RUECKGABE") return null;
  if (opts.art === "SPERREN" && opts.weg === "HR") {
    return opts.zustand === "BESCHAEDIGT" || opts.zustand === "FEHLT" ? "ZUGANG_NUR_GESPERRT" : null;
  }
  return "ZUSTAND_NICHT_MOEGLICH";
}

/**
 * Der Zustand der Ausgabe zu einem Rueckgabezustand (G15): ein gesetzter
 * Zustand gilt 1:1. „Offen“ (`null`) heisst aktiv:
 *
 *   - war das Stueck in DIESEM Austritt erledigt (`warErledigt`: Aufgabe
 *     erledigt bzw. Rueckgabe-Zeile mit Zustand – der Zustand wurde also hier
 *     gesetzt), wird es AUSGEGEBEN: Wiederoeffnen setzt AUSGEGEBEN, auch nach
 *     „verbleibt“ (1.2). Sonst bliebe ein hier gesetztes VERBLEIBT neben einer
 *     offenen Zeile stehen, und der Abschluss gaebe es ohne Frist frei;
 *   - sonst bleibt ein schon aktives Stueck, wie es ist – ein VERBLEIBT, das
 *     dieser Austritt unveraendert aus einem frueheren uebernommen hat (G28);
 *     alles andere wird AUSGEGEBEN.
 */
export function ausgabeNachZiel(ziel: RueckgabeZustand | null, alt: string, warErledigt = false): string {
  if (ziel !== null) return ziel;
  return !warErledigt && enthalten(AUSGABE_AKTIV, alt) ? alt : "AUSGEGEBEN";
}

/** Was der Gleichlauf an Ausgabe, Aufgabe und Rueckgabe-Zeile schreibt (`gleichlaufPlan`). */
export interface GleichlaufPlan {
  /** Geht der Wechsel? Ein ERSETZT-Stueck ist endgueltig (1.2). */
  moeglich: boolean;
  /** Neuer Zustand der Ausgabe; `null` = bleibt. */
  ausgabe: AusgabeZustand | null;
  /** Neuer Zustand der Rueckgabe-Zeile (`null` = offen); `undefined` = bleibt bzw. es gibt keine. */
  rueckgabe: RueckgabeZustand | null | undefined;
  /** Aufgabe erledigt (`true`) bzw. offen (`false`); `undefined` = bleibt bzw. der Aufrufer schaltet sie. */
  aufgabeErledigt: boolean | undefined;
  /** Zustand der Ausgabe danach – fuer die Folgeaufgabe (`folgeAufgabeSchritt`). */
  nach: string;
}

/**
 * Ein Stueck, drei Zeilen, ein Stand (G15): Was zu einem Zielzustand an der
 * Ausgabe, an der Ruecknahme- bzw. Sperraufgabe und an der Rueckgabe-Zeile
 * zu schreiben ist – nur, was sich wirklich aendert. „Offen“ heisst auf allen
 * drei Zeilen dasselbe: Rueckgabe ohne Zustand, Aufgabe offen, Ausgabe aktiv.
 * Ein Zustand heisst: Aufgabe erledigt, Rueckgabe und Ausgabe mit diesem
 * Zustand (`isReturned` folgt, `rueckgabeDaten`). `aufgabe: null` = der
 * Aufrufer schaltet sie selbst (Link-Weg) bzw. es gibt keine; `rueckgabe:
 * null` = keine Zeile (Zugang). `warErledigt`: Stand DIESES Austritts vor
 * dem Wechsel (`ausgabeNachZiel`); ohne Angabe aus Aufgabe und Zeile
 * abgeleitet – der Link-Weg, der die Aufgabe schon geschaltet hat, gibt ihn
 * ausdruecklich mit.
 */
export function gleichlaufPlan(opts: {
  ziel: RueckgabeZustand | null;
  ausgabe: { zustand: string };
  aufgabe: { isCompleted: boolean } | null;
  rueckgabe: RueckgabeStand | null;
  warErledigt?: boolean;
}): GleichlaufPlan {
  const alt = opts.ausgabe.zustand;
  const warErledigt =
    opts.warErledigt ??
    ((!!opts.rueckgabe && rueckgabeZustand(opts.rueckgabe) !== null) || opts.aufgabe?.isCompleted === true);
  const nach = ausgabeNachZiel(opts.ziel, alt, warErledigt);
  const ausgabe = nach === alt ? null : (nach as AusgabeZustand);
  const rueckgabe = opts.rueckgabe && rueckgabeZustand(opts.rueckgabe) !== opts.ziel ? opts.ziel : undefined;
  const erledigt = opts.ziel !== null;
  const aufgabeErledigt = opts.aufgabe && opts.aufgabe.isCompleted !== erledigt ? erledigt : undefined;
  return { moeglich: ausgabe === null || alt !== "ERSETZT", ausgabe, rueckgabe, aufgabeErledigt, nach };
}

/** Warum DIESER Austritt das Stueck nicht aendern darf (409, G28). */
export type GleichlaufSperre =
  | { grund: "AUSGABE_IM_AUSTRITT"; displayId: string | null }
  | { grund: "AUSGABE_FREIGEGEBEN" };

/**
 * Darf der Austritt `austritt` die Ausgabe aendern (G15, G28)? Gelesen NACH
 * der Sperre der Ausgabe:
 *
 *   - ein ANDERER Austritt bindet sie (`bezugBindet`): nein –
 *     `AUSGABE_IM_AUSTRITT` (die Vorgangsnummer nur, wenn der Bezug sie
 *     traegt, also mit Zugriff);
 *   - dieser Austritt bindet sie selbst nicht mehr (abgeschlossen mit
 *     „verbleibt“ – mit dem Abschluss freigegeben – bzw. ein spaeterer
 *     Austritt fuehrt das Stueck weiter): nein – `AUSGABE_FREIGEGEBEN`;
 *   - sonst ja (`null`): ein laufender Austritt immer, ein abgeschlossener
 *     fuer alles ausser VERBLEIBT – so nimmt sein Reiter die spaete Rueckgabe
 *     eines offen gebliebenen Stuecks auf.
 *
 * Gemessen wird dieser Austritt an seinem eigenen Stand (der Bezug mit seiner
 * `offboardingId`, `bezugBindet`); ohne eigenen Bezug am Zustand der Ausgabe.
 */
export function gleichlaufGesperrt(
  ausgabe: { zustand: string },
  bezuege: ReadonlyArray<AustrittsBezug>,
  austritt: { id: string; status: string },
): GleichlaufSperre | null {
  const bindend = bindenderAustritt(ausgabe, bezuege, austritt.id);
  if (bindend) return { grund: "AUSGABE_IM_AUSTRITT", displayId: bindend.displayId ?? null };
  const eigen = bezuege.find((b) => b.offboardingId === austritt.id);
  if (!bezugBindet({ ...eigen, offboardingId: austritt.id, status: austritt.status }, ausgabe.zustand)) {
    return { grund: "AUSGABE_FREIGEGEBEN" };
  }
  return null;
}

/** Der Text einer `GleichlaufSperre` (409). */
export function gleichlaufSperreText(sperre: GleichlaufSperre): string {
  return sperre.grund === "AUSGABE_IM_AUSTRITT"
    ? MELDUNGEN_AUSGABEN.AUSGABE_IM_AUSTRITT(sperre.displayId)
    : MELDUNGEN_AUSGABEN.AUSGABE_FREIGEGEBEN;
}

// =============================================
// Zuordnung Austritt ↔ Einstellung (E-A31, G11)
// =============================================

/**
 * Schluessel fuer den Namensvergleich: NFC (ein „ü“ aus zwei Codepunkten ist
 * dasselbe wie eins), klein (deutsch), Leerraum zusammengefasst und getrimmt.
 * Bewusst KEINE Unschaerfe: „Mueller“ ist nicht „Müller“ – solche Faelle findet
 * die Suche (Feinplan Abschnitt 6, Frage 3).
 */
export function namensSchluessel(s: string | null | undefined): string {
  return (s ?? "").normalize("NFC").toLocaleLowerCase("de").replace(/\s+/g, " ").trim();
}

function adressSchluessel(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

/** Stufen eines Vorschlags, staerkste zuerst. */
export const VORSCHLAG_STUFEN = ["STARK", "MITTEL", "SCHWACH"] as const;
export type VorschlagStufe = (typeof VORSCHLAG_STUFEN)[number];

export const VORSCHLAG_STUFE_LABELS: Readonly<Record<VorschlagStufe, string>> = {
  STARK: "Starker Vorschlag",
  MITTEL: "Mittlerer Vorschlag",
  SCHWACH: "Schwacher Vorschlag",
};

/**
 * Begruendungen (Schluessel ins Protokoll, Text in den Dialog). Nie mit
 * Adresse oder Name – nur, WAS uebereinstimmt.
 */
export const VORSCHLAG_GRUENDE = {
  EMAIL: "Gleiche E-Mail-Adresse",
  NAME: "Gleicher Vor- und Nachname",
  NAME_GEBURTSNAME: "Gleicher Vorname, Nachname wie der Geburtsname",
  NACHNAME: "Gleicher Nachname",
  NACHNAME_GEBURTSNAME: "Nachname wie der Geburtsname",
  EINRICHTUNG: "Gleiche Einrichtung",
  ARBEITSORT: "Gleicher Arbeitsort",
} as const;
export type VorschlagGrund = keyof typeof VORSCHLAG_GRUENDE;

/** Was die Vorschlaege vom Austritt lesen. */
export interface AustrittFuerVorschlag {
  employeeFirstName: string | null;
  employeeLastName: string | null;
  employeeEmail?: string | null;
  employeePrivateEmail?: string | null;
  organizationId: string;
  arbeitsortId?: string | null;
}

/** Eine Einstellung aus der Kandidatenabfrage (schon nach Mandant, Typ und Status gefiltert). */
export interface EinstellungsKandidat {
  id: string;
  displayId?: string | null;
  organizationId: string;
  arbeitsortId?: string | null;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  personalData?: {
    emailPrivate?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    birthName?: string | null;
  } | null;
  supervisorData?: { vertragsbeginn?: Date | string | null } | null;
}

/**
 * Eine Einstellung, wie Dialog und Reiter „Rückgaben“ sie zeigen – ohne
 * Adressen (die Kandidatenabfrage liest sie nur fuer die Bewertung).
 */
export interface EinstellungsAnzeige {
  onboardingId: string;
  displayId: string | null;
  /** „Vorname Nachname“ der Einstellung (Vorgang, sonst Personalfragebogen). */
  name: string;
  organizationId: string;
  arbeitsortId: string | null;
  vertragsbeginn: Kalendertag | null;
}

/** Ein Vorschlag fuer den Dialog „Einstellung zuordnen …“ – ohne Adressen. */
export interface ZuordnungsVorschlag extends EinstellungsAnzeige {
  stufe: VorschlagStufe;
  gruende: { schluessel: VorschlagGrund; text: string }[];
}

/**
 * Die Anzeige einer Einstellung (S28): Name vom Vorgang, sonst aus dem
 * Personalfragebogen; Vertragsbeginn als Berliner Kalendertag. Nie eine
 * Adresse – `email` und `personalData.emailPrivate` bleiben in der Bewertung.
 */
export function einstellungAnzeige(k: EinstellungsKandidat): EinstellungsAnzeige {
  const pd = k.personalData ?? null;
  const vor = (k.firstName ?? "").trim() || (pd?.firstName ?? "").trim();
  const nach = (k.lastName ?? "").trim() || (pd?.lastName ?? "").trim();
  return {
    onboardingId: k.id,
    displayId: k.displayId ?? null,
    name: [vor, nach].filter((t) => t !== "").join(" "),
    organizationId: k.organizationId,
    arbeitsortId: k.arbeitsortId ?? null,
    vertragsbeginn: kalendertagVon(k.supervisorData?.vertragsbeginn),
  };
}

/** Neuester Vertragsbeginn zuerst, ohne Datum zuletzt, bei Gleichstand nach ID (stabil). */
function nachVertragsbeginn(a: EinstellungsAnzeige, b: EinstellungsAnzeige): number {
  return (b.vertragsbeginn ?? "").localeCompare(a.vertragsbeginn ?? "") || a.onboardingId.localeCompare(b.onboardingId);
}

/**
 * Treffer der Suche im Dialog „Einstellung zuordnen …“ (G11: Vorgangsnummer
 * oder Nachname, ab `sucheMinZeichen` Zeichen) – ohne Stufe und ohne
 * Begruendung, nur angezeigt. Die Abfrage hat Mandant, Typ, Status und
 * Bindung schon gefiltert. Neuester Vertragsbeginn zuerst, hoechstens
 * `AUSGABE_GRENZEN.suche`.
 */
export function einstellungsTreffer(kandidaten: ReadonlyArray<EinstellungsKandidat>): EinstellungsAnzeige[] {
  return kandidaten.map(einstellungAnzeige).sort(nachVertragsbeginn).slice(0, AUSGABE_GRENZEN.suche);
}

/**
 * Vorschlaege fuer „Einstellung zuordnen …“ (E-A31) – nur HR bestaetigt, nie
 * ein stiller Abgleich:
 *
 *   - STARK: gleiche E-Mail (klein, getrimmt) – Austritt `employeeEmail` bzw.
 *     `employeePrivateEmail` gegen Einstellung `email` bzw.
 *     `personalData.emailPrivate`.
 *   - MITTEL: Vor- und Nachname gleich (der Nachname auch gegen den
 *     Geburtsnamen) UND Einrichtung oder Arbeitsort gleich.
 *   - SCHWACH: nur der Nachname (bzw. Geburtsname) UND Einrichtung oder
 *     Arbeitsort gleich.
 *
 * Ohne Begruendung kein Vorschlag – ein Name ohne gemeinsame Einrichtung ist
 * keiner. Sortiert nach Stufe, dann Vertragsbeginn (neuester zuerst, ohne
 * Datum zuletzt), hoechstens `AUSGABE_GRENZEN.kandidaten`.
 */
export function zuordnungsVorschlaege(
  austritt: AustrittFuerVorschlag,
  kandidaten: ReadonlyArray<EinstellungsKandidat>,
): ZuordnungsVorschlag[] {
  const austrittsAdressen = new Set(
    [austritt.employeeEmail, austritt.employeePrivateEmail].map(adressSchluessel).filter((a) => a !== ""),
  );
  const vorname = namensSchluessel(austritt.employeeFirstName);
  const nachname = namensSchluessel(austritt.employeeLastName);
  const austrittsOrte = [austritt.organizationId, austritt.arbeitsortId].filter((o): o is string => !!o);

  const vorschlaege: ZuordnungsVorschlag[] = [];
  for (const k of kandidaten) {
    const pd = k.personalData ?? null;
    const email = [k.email, pd?.emailPrivate].map(adressSchluessel).some((a) => a !== "" && austrittsAdressen.has(a));
    const vornamen = new Set([k.firstName, pd?.firstName].map(namensSchluessel).filter((n) => n !== ""));
    const nachnamen = new Set([k.lastName, pd?.lastName].map(namensSchluessel).filter((n) => n !== ""));
    const nachnameGleich = nachname !== "" && nachnamen.has(nachname);
    const geburtsnameGleich = nachname !== "" && !nachnameGleich && namensSchluessel(pd?.birthName) === nachname;
    const vornameGleich = vorname !== "" && vornamen.has(vorname);
    const einrichtung = k.organizationId === austritt.organizationId;
    const kandidatenOrte = [k.organizationId, k.arbeitsortId].filter((o): o is string => !!o);
    const arbeitsort = !einrichtung && austrittsOrte.some((o) => kandidatenOrte.includes(o));

    let namensGrund: VorschlagGrund | null = null;
    if (nachnameGleich) namensGrund = vornameGleich ? "NAME" : "NACHNAME";
    else if (geburtsnameGleich) namensGrund = vornameGleich ? "NAME_GEBURTSNAME" : "NACHNAME_GEBURTSNAME";
    const vollerName = namensGrund === "NAME" || namensGrund === "NAME_GEBURTSNAME";

    let stufe: VorschlagStufe | null = null;
    if (email) stufe = "STARK";
    else if (namensGrund && (einrichtung || arbeitsort)) stufe = vollerName ? "MITTEL" : "SCHWACH";
    if (!stufe) continue;

    const gruende: VorschlagGrund[] = [];
    if (email) gruende.push("EMAIL");
    if (namensGrund) gruende.push(namensGrund);
    if (einrichtung) gruende.push("EINRICHTUNG");
    if (arbeitsort) gruende.push("ARBEITSORT");

    vorschlaege.push({
      ...einstellungAnzeige(k),
      stufe,
      gruende: gruende.map((g) => ({ schluessel: g, text: VORSCHLAG_GRUENDE[g] })),
    });
  }

  return vorschlaege
    .sort((a, b) => VORSCHLAG_STUFEN.indexOf(a.stufe) - VORSCHLAG_STUFEN.indexOf(b.stufe) || nachVertragsbeginn(a, b))
    .slice(0, AUSGABE_GRENZEN.kandidaten);
}

/** Laeuft der Austritt (weder COMPLETED noch CANCELLED)? Nur dann laesst sich die Zuordnung aendern (G11). */
export function austrittLaeuft(status: string): boolean {
  return status !== "COMPLETED" && status !== "CANCELLED";
}

/**
 * Hinweis „Einstellung zuordnen, bevor Sie die Abteilungen informieren“ (G12):
 * nur ohne Zuordnung, bei laufendem Austritt und mit mindestens einem STARKEN
 * oder MITTLEREN Vorschlag – ein nur schwacher (Nachname) ist kein Grund, HR
 * vor dem Informieren aufzuhalten.
 */
export function zuordnungEmpfohlen(opts: {
  zugeordnet: boolean;
  austrittStatus: string;
  vorschlaege: ReadonlyArray<{ stufe: VorschlagStufe }>;
}): boolean {
  if (opts.zugeordnet || !austrittLaeuft(opts.austrittStatus)) return false;
  return opts.vorschlaege.some((v) => v.stufe === "STARK" || v.stufe === "MITTEL");
}

/**
 * Vorbelegung des Merkers „Person bleibt in einer anderen Beschäftigung“
 * (G13): bei einer Versetzung ja, sonst nein. HR aendert ihn im Dialog.
 */
export function weitereBeschaeftigungVorbelegung(exitType: string | null | undefined): boolean {
  return exitType === "VERSETZUNG";
}

/**
 * Wie viele Stellen eines Vorgangs sind informiert? Eine Stelle gilt als
 * informiert, sobald sie eine Aufgaben-Mail bekommen hat (`sentAt ??
 * lastSentAt` – nach einem gescheiterten „Link erneuern“ steht `sentAt` wieder
 * auf null, die Stelle hat aber eine aeltere Mail). Grundlage fuer den
 * Arbeitsort am Austritt (G12) und die Rueckfrage vor „Lösen …“.
 */
export function informierteStellen(
  links: ReadonlyArray<{ sentAt?: Date | string | null; lastSentAt?: Date | string | null }>,
): number {
  return links.filter((l) => {
    const t = l.sentAt ?? l.lastSentAt ?? null;
    return t !== null && !Number.isNaN(new Date(t).getTime());
  }).length;
}

/** Warum der Arbeitsort der Einstellung (nicht) an den Austritt geht (G12). */
export type ArbeitsortGrund = "UEBERNOMMEN" | "OHNE_ARBEITSORT" | "ANDERE_EINRICHTUNG" | "STELLE_INFORMIERT";

export interface ArbeitsortEntscheidung {
  /** Der Wert fuer `OffboardingProcess.arbeitsortId` – nur bei UEBERNOMMEN gesetzt, sonst bleibt die Spalte, wie sie ist. */
  arbeitsortId: string | null;
  grund: ArbeitsortGrund;
}

/**
 * Uebernimmt die Zuordnung den Arbeitsort der Einstellung (G12)? Nur, wenn
 *
 *   - die Einstellung einen Arbeitsort hat (sonst bleibt alles wie bisher),
 *   - ihre Einrichtung die des Austritts ist – ein Austritt an Einrichtung Y
 *     bekommt nie den Arbeitsort einer Einstellung an X (Zweitbeschaeftigung
 *     ist nicht die OGS-Kraft des Foerdervereins mit Arbeitsort Grundschule),
 *   - noch keine Stelle des Austritts informiert ist (`informierteStellen`;
 *     der Server prueft das unter der Versandsperre des Austritts, G26) – sonst
 *     gingen die uebrigen Aufgaben an andere Stellen als die schon versandten.
 *
 * Die Pruefreihenfolge bestimmt den Grund, den der Dialog nennt. Der Mandant
 * (`organizationId`) aendert sich nie.
 */
export function arbeitsortBeiZuordnung(opts: {
  austritt: { organizationId: string };
  einstellung: { organizationId: string; arbeitsortId?: string | null };
  links: ReadonlyArray<{ sentAt?: Date | string | null; lastSentAt?: Date | string | null }>;
}): ArbeitsortEntscheidung {
  const ort = opts.einstellung.arbeitsortId?.trim() || null;
  if (!ort || ort === opts.austritt.organizationId) return { arbeitsortId: null, grund: "OHNE_ARBEITSORT" };
  if (opts.einstellung.organizationId !== opts.austritt.organizationId) {
    return { arbeitsortId: null, grund: "ANDERE_EINRICHTUNG" };
  }
  if (informierteStellen(opts.links) > 0) return { arbeitsortId: null, grund: "STELLE_INFORMIERT" };
  return { arbeitsortId: ort, grund: "UEBERNOMMEN" };
}

/**
 * Satz des Dialogs zum Arbeitsort (G12: „Sonst bleibt er leer, und der Dialog
 * sagt das.“). `name` = Name des Arbeitsorts der Einstellung. Ohne Arbeitsort
 * kein Satz.
 */
export function arbeitsortText(grund: ArbeitsortGrund, name: string | null): string | null {
  const ort = name?.trim() || "der Einstellung";
  switch (grund) {
    case "UEBERNOMMEN":
      return `Arbeitsort ${ort} wird übernommen: Die Aufgaben dieses Austritts gehen an die Stellen dort.`;
    case "ANDERE_EINRICHTUNG":
      return "Der Arbeitsort der Einstellung wird nicht übernommen: Sie gehört zu einer anderen Einrichtung als der Austritt.";
    case "STELLE_INFORMIERT":
      return `Der Arbeitsort ${ort} wird nicht übernommen, weil schon eine Stelle informiert ist – die Aufgaben gehen weiter an die Stellen der Einrichtung des Austritts.`;
    case "OHNE_ARBEITSORT":
      return null;
  }
}

// =============================================
// Rueckgabe-Vorschlag (E-A35, G13)
// =============================================

/** Was der Vorschlag von einer Ausgabe der Einstellung liest. */
export interface VorschlagAusgabe {
  id: string;
  zustand: string;
  beiAustritt: string;
  organizationId: string;
  zentral: boolean;
}

export interface RueckgabeVorschlagErgebnis<T> {
  /** Wird uebernommen (Aufgabe, bei RUECKGABE auch Rueckgabe-Zeile). */
  vorschlag: T[];
  /** Zentral, aber die Person bleibt in einer anderen Beschaeftigung: nur Hinweis. */
  hinweisZentral: T[];
  /** Ausgabe einer anderen Einrichtung: nur Hinweis. */
  hinweisAndereEinrichtung: T[];
  /** Stuecke, die gerade ein anderer Austritt bindet (G28) – je Austritt die Anzahl, ohne Kennung. */
  schonImAustritt: { offboardingId: string; displayId: string | null; anzahl: number }[];
}

/**
 * Rueckgabe-Vorschlag aus der zugeordneten Einstellung (E-A35, G13).
 *
 * Kandidaten: aktive Ausgaben (AUSGEGEBEN, VERBLEIBT) mit `beiAustritt`
 * RUECKGABE oder SPERREN, die kein ANDERER Austritt bindet (G28 – CANCELLED
 * und ein abgeschlossener mit VERBLEIBT geben frei; gebundene stehen in
 * `schonImAustritt`). Davon:
 *
 *   - nicht zentrale: vorgeschlagen, wenn `organizationId` in {Einrichtung
 *     des Austritts, Arbeitsort des Austritts} liegt – den Arbeitsort der
 *     Einstellung nur, wenn deren Einrichtung die des Austritts ist (OGS-Kraft
 *     des Foerdervereins mit Arbeitsort Grundschule); sonst Hinweis. Ohne
 *     diese Bedingung schluege die Menge jede Ausgabe vor, sobald die
 *     Einstellung einen Arbeitsort hat (`Ausgabe.organizationId` IST dieser
 *     Arbeitsort, G2).
 *   - zentrale: ohne Einrichtungsfilter; vorgeschlagen ohne Merker
 *     `weitereBeschaeftigung`, mit Merker nur Hinweis.
 *
 * Der Zustand der Ausgabe aendert sich durch die Uebernahme nicht.
 */
export function rueckgabeVorschlag<T extends VorschlagAusgabe>(opts: {
  austritt: { id: string; organizationId: string; arbeitsortId?: string | null };
  einstellung: { organizationId: string; arbeitsortId?: string | null };
  ausgaben: ReadonlyArray<T>;
  weitereBeschaeftigung: boolean | null | undefined;
  bezuege: ReadonlyArray<AusgabeBezug>;
}): RueckgabeVorschlagErgebnis<T> {
  const einrichtungen = new Set<string>([opts.austritt.organizationId]);
  if (opts.austritt.arbeitsortId) einrichtungen.add(opts.austritt.arbeitsortId);
  if (opts.einstellung.arbeitsortId && opts.einstellung.organizationId === opts.austritt.organizationId) {
    einrichtungen.add(opts.einstellung.arbeitsortId);
  }
  const bezuegeJeAusgabe = new Map<string, AusgabeBezug[]>();
  for (const b of opts.bezuege) {
    const liste = bezuegeJeAusgabe.get(b.ausgabeId) ?? [];
    liste.push(b);
    bezuegeJeAusgabe.set(b.ausgabeId, liste);
  }

  const ergebnis: RueckgabeVorschlagErgebnis<T> = {
    vorschlag: [],
    hinweisZentral: [],
    hinweisAndereEinrichtung: [],
    schonImAustritt: [],
  };
  const schon = new Map<string, { offboardingId: string; displayId: string | null; anzahl: number }>();
  for (const a of opts.ausgaben) {
    if (!enthalten(AUSGABE_AKTIV, a.zustand) || !enthalten(AUSGABE_BEI_AUSTRITT, a.beiAustritt)) continue;
    const bindend = bindenderAustritt(a, bezuegeJeAusgabe.get(a.id) ?? [], opts.austritt.id);
    if (bindend) {
      const eintrag = schon.get(bindend.offboardingId) ?? {
        offboardingId: bindend.offboardingId,
        displayId: bindend.displayId ?? null,
        anzahl: 0,
      };
      eintrag.anzahl += 1;
      schon.set(bindend.offboardingId, eintrag);
      continue;
    }
    if (a.zentral) {
      (opts.weitereBeschaeftigung === true ? ergebnis.hinweisZentral : ergebnis.vorschlag).push(a);
    } else {
      (einrichtungen.has(a.organizationId) ? ergebnis.vorschlag : ergebnis.hinweisAndereEinrichtung).push(a);
    }
  }
  ergebnis.schonImAustritt = [...schon.values()];
  return ergebnis;
}

// =============================================
// Bestand der Einstellung: ohne Vermerk, Lage (G13, E-A36)
// =============================================

/** Eine Ausstattungsaufgabe der Einstellung (`ChecklistItem` mit `herkunft` AUSSTATTUNG). */
export interface BestandAufgabe {
  id: string;
  title: string;
  isCompleted: boolean;
  completedAt?: Date | string | null;
  entfaelltAm?: Date | string | null;
  ausgabenGeloeschtAm?: Date | string | null;
  /** Zeile der Ausstattung ueber `OnboardingAusstattungAufgabe`; ohne Verknuepfung null. */
  ausstattungId: string | null;
}

/** Eine Zeile von `OnboardingAusstattung` (Momentaufnahme mit `beiAustritt`). */
export interface BestandZeile {
  id: string;
  art: string;
  beiAustritt?: string | null;
}

export interface OhneVermerkEintrag {
  checklistItemId: string;
  titel: string;
  /** Berliner Tag von `completedAt` – das Datum, mit dem „Als ausgegeben übernehmen“ anlegt. */
  erledigtAm: Kalendertag | null;
}

/**
 * Erledigte Ausstattungsaufgaben ohne Uebergabevermerk (G13): nicht entfallen,
 * Zeile mit `beiAustritt` RUECKGABE oder SPERREN (keine Angabe), ohne jede
 * Ausgabe und OHNE `ausgabenGeloeschtAm` – nach Ablauf der Frist geloeschte
 * Ausgaben verlangen nie wieder einen Vermerk (G20).
 */
export function ohneVermerk(
  aufgaben: ReadonlyArray<BestandAufgabe>,
  zeilen: ReadonlyArray<BestandZeile>,
  ausgaben: ReadonlyArray<{ checklistItemId: string | null }>,
): OhneVermerkEintrag[] {
  const zeileNachId = new Map(zeilen.map((z) => [z.id, z]));
  const mitAusgabe = new Set(ausgaben.map((a) => a.checklistItemId).filter((id): id is string => !!id));
  return aufgaben
    .filter((a) => {
      if (!a.isCompleted || a.entfaelltAm || a.ausgabenGeloeschtAm || mitAusgabe.has(a.id)) return false;
      const zeile = a.ausstattungId ? zeileNachId.get(a.ausstattungId) : undefined;
      return !!zeile && zeile.art !== "ANGABE" && enthalten(AUSGABE_BEI_AUSTRITT, zeile.beiAustritt);
    })
    .map((a) => ({ checklistItemId: a.id, titel: a.title, erledigtAm: kalendertagVon(a.completedAt) }));
}

/**
 * Lage des Reiters „Rückgaben“ (E-A36), in dieser Reihenfolge geprueft
 * (`RUECKGABE_LAGEN`):
 *
 *   1. KEINE_EINSTELLUNG – nichts zugeordnet;
 *   2. AUSGABEN – mindestens eine Ausgabe der Einstellung (jeder Zustand);
 *   3. GELOESCHT – keine Ausgabe, aber eine Ausstattungsaufgabe mit
 *      `ausgabenGeloeschtAm` (nicht „nichts erfasst“, G20);
 *   4. NICHTS_ERFASST – erledigte Aufgaben ohne Vermerk (`ohneVermerk`);
 *   5. NICHTS_AUSGEGEBEN – eine Zeile mit RUECKGABE/SPERREN ODER der Merker
 *      `ausgabenAngeboten` ist `true` (das Formular bot es an, gewaehlt wurde
 *      nichts);
 *   6. VOR_EINFUEHRUNG – sonst, auch mit Merker `false` oder `null` (Altfall,
 *      kein Ausstattungsschritt, Katalog ohne Rueckgabe-Positionen).
 */
export function rueckgabeLage(opts: {
  einstellung: object | null | undefined;
  zeilen: ReadonlyArray<{ art: string; beiAustritt?: string | null }>;
  ausgaben: ReadonlyArray<unknown>;
  ohneVermerk: ReadonlyArray<unknown>;
  ausgabenAngeboten: boolean | null | undefined;
  geloeschteAufgaben: number;
}): RueckgabeLage {
  if (!opts.einstellung) return "KEINE_EINSTELLUNG";
  if (opts.ausgaben.length > 0) return "AUSGABEN";
  if (opts.geloeschteAufgaben > 0) return "GELOESCHT";
  if (opts.ohneVermerk.length > 0) return "NICHTS_ERFASST";
  if (opts.ausgabenAngeboten === true || ausgabenAngeboten(opts.zeilen)) return "NICHTS_AUSGEGEBEN";
  return "VOR_EINFUEHRUNG";
}

/** Lage samt den Werten ihres Textes. */
export interface LageStand extends LageTextWerte {
  lage: RueckgabeLage;
}

/** Kopfzeile des Reiters zur Lage (`LAGE_TEXTE`). */
export function lageText(stand: LageStand): string {
  return LAGE_TEXTE[stand.lage](stand);
}

/** Platzhalter fuer `{nr}`, wenn die Einstellung keine Vorgangsnummer hat (Altbestand). */
export const EINSTELLUNG_OHNE_NUMMER = "ohne Vorgangsnummer";

/**
 * Was die Lage von der zugeordneten Einstellung liest – geladen von
 * `bestandDerEinstellungLaden` (ausgaben-daten.ts): Zeilen der Ausstattung,
 * Ausstattungsaufgaben samt Loeschmerker, ALLE Ausgaben (jeder Zustand) und
 * der Merker `SupervisorData.ausgabenAngeboten`.
 */
export interface EinstellungsBestand {
  displayId: string | null;
  ausgabenAngeboten: boolean | null;
  zeilen: ReadonlyArray<BestandZeile>;
  aufgaben: ReadonlyArray<BestandAufgabe>;
  ausgaben: ReadonlyArray<{ checklistItemId: string | null; zustand: string; beiAustritt: string }>;
}

/** Kopfzeile des Reiters „Rückgaben“ – fertig, die Oberflaeche rechnet nichts. */
export interface LageAnzeige {
  stand: LageStand;
  /** `LAGE_TEXTE` zur Lage. */
  text: string;
  /** `LAGE_WEITERE_GELOESCHT` bei Lage AUSGABEN, wenn daneben Ausgaben nach Ablauf der Frist geloescht wurden; sonst null. */
  zusatz: string | null;
  /** Erledigte Ausstattungsaufgaben ohne Uebergabevermerk (`ohneVermerk`). */
  ohneVermerk: OhneVermerkEintrag[];
}

/**
 * Lage und Kopfzeile aus dem Bestand der zugeordneten Einstellung (E-A36;
 * ohne Einstellung `null` → KEINE_EINSTELLUNG). Gegenstaende und Zugaenge
 * zaehlen nur, was noch bei der Person ist (`AUSGABE_AKTIV`); die Lage
 * AUSGABEN gilt schon mit einer Ausgabe in jedem Zustand (`rueckgabeLage`).
 */
export function rueckgabeLageAnzeige(bestand: EinstellungsBestand | null): LageAnzeige {
  const ohne = bestand ? ohneVermerk(bestand.aufgaben, bestand.zeilen, bestand.ausgaben) : [];
  const geloeschteAufgaben = bestand ? bestand.aufgaben.filter((a) => !!a.ausgabenGeloeschtAm).length : 0;
  const lage = rueckgabeLage({
    einstellung: bestand,
    zeilen: bestand?.zeilen ?? [],
    ausgaben: bestand?.ausgaben ?? [],
    ohneVermerk: ohne,
    ausgabenAngeboten: bestand?.ausgabenAngeboten ?? null,
    geloeschteAufgaben,
  });
  const aktiv = (bestand?.ausgaben ?? []).filter((a) => enthalten(AUSGABE_AKTIV, a.zustand));
  const stand: LageStand = {
    lage,
    nr: bestand ? bestand.displayId?.trim() || EINSTELLUNG_OHNE_NUMMER : "",
    gegenstaende: aktiv.filter((a) => a.beiAustritt === "RUECKGABE").length,
    zugaenge: aktiv.filter((a) => a.beiAustritt === "SPERREN").length,
    ohneVermerk: ohne.length,
  };
  return {
    stand,
    text: lageText(stand),
    zusatz: lage === "AUSGABEN" && geloeschteAufgaben > 0 ? LAGE_WEITERE_GELOESCHT : null,
    ohneVermerk: ohne,
  };
}

/**
 * Schritt „Rückgaben einsammeln“ im Stepper (E-A36): erledigt, wenn nichts
 * offen ist (`offeneRueckgaben` bzw. ihre Anzahl); der Text kommt aus
 * `LAGE_TEXTE`.
 */
export function rueckgabenSchritt(
  stand: LageStand,
  offen: number | ReadonlyArray<unknown>,
): { erledigt: boolean; text: string } {
  const anzahlOffen = typeof offen === "number" ? offen : offen.length;
  return { erledigt: anzahlOffen === 0, text: lageText(stand) };
}

// =============================================
// Offene Rueckgaben beim Abschluss (G18, E-A33)
// =============================================

export interface OffeneRueckgabe {
  titel: string;
  /** Anzeigename der Stelle; von HR erfasste Zeilen gehoeren der Personalabteilung. */
  stelle: string;
}

/**
 * Was beim Abschluss noch offen ist – Stueck fuer Stueck (E-A33, G18):
 * offene Rueckgabe-Zeilen (`rueckgabeOffen`), offene Sperraufgaben (Herkunft
 * AUSGABE ohne Rueckgabe-Zeile) und offene Folgeaufgaben (AUSGABE_FEHLT), je
 * Ausgabe nur einmal. Eine Rueckgabe-Zeile nennt die Stelle ihrer
 * Ruecknahmeaufgabe, eine von HR erfasste Zeile die Personalabteilung.
 */
export function offeneRueckgaben(opts: {
  rueckgaben: ReadonlyArray<RueckgabeStand & { id: string; itemName: string; ausgabeId?: string | null }>;
  aufgaben: ReadonlyArray<{
    id: string;
    title: string;
    isCompleted: boolean;
    herkunft?: string | null;
    ausgabeId?: string | null;
    assigneeDepartment?: string | null;
  }>;
  stellenNamen: Readonly<Record<string, string>>;
}): OffeneRueckgabe[] {
  const stelle = (key: string | null | undefined) =>
    stelleName(key?.trim() || DEPARTMENT_KEYS.HR, opts.stellenNamen);
  const ruecknahme = new Map<string, string | null | undefined>();
  for (const a of opts.aufgaben) {
    if (a.herkunft === "AUSGABE" && a.ausgabeId && !ruecknahme.has(a.ausgabeId)) {
      ruecknahme.set(a.ausgabeId, a.assigneeDepartment);
    }
  }
  const mitRueckgabe = new Set(opts.rueckgaben.map((r) => r.ausgabeId).filter((id): id is string => !!id));
  const gezaehlt = new Set<string>();
  const offen: OffeneRueckgabe[] = [];

  for (const r of opts.rueckgaben) {
    if (!rueckgabeOffen(r)) continue;
    if (r.ausgabeId) {
      if (gezaehlt.has(r.ausgabeId)) continue;
      gezaehlt.add(r.ausgabeId);
    }
    offen.push({ titel: r.itemName, stelle: stelle(r.ausgabeId ? ruecknahme.get(r.ausgabeId) : null) });
  }
  for (const a of opts.aufgaben) {
    if (a.isCompleted) continue;
    const sperren = a.herkunft === "AUSGABE" && !(a.ausgabeId && mitRueckgabe.has(a.ausgabeId));
    if (!sperren && a.herkunft !== "AUSGABE_FEHLT") continue;
    if (a.ausgabeId) {
      if (gezaehlt.has(a.ausgabeId)) continue;
      gezaehlt.add(a.ausgabeId);
    }
    offen.push({ titel: a.title, stelle: stelle(a.assigneeDepartment) });
  }
  return offen;
}

/** Fortschritt „Rückgaben einsammeln“ – in denselben Stuecken wie `offeneRueckgaben`. */
export interface RueckgabenFortschritt {
  erledigt: number;
  gesamt: number;
}

/**
 * Der Fortschritt des Stepper-Schritts „Rückgaben einsammeln“ aus DERSELBEN
 * Quelle wie Liste und Stand (`offeneRueckgaben`, `rueckgabenSchritt`): je
 * Stueck eine Einheit – eine Rueckgabe-Zeile, eine Sperraufgabe (Herkunft
 * AUSGABE ohne Rueckgabe-Zeile) bzw. eine Folgeaufgabe, je Ausgabe nur
 * einmal; offen ist ein Stueck, solange irgendeine seiner Zeilen offen ist.
 * So steht nie „4/4“ neben einer offenen Sperraufgabe: `gesamt − erledigt`
 * ist genau die Zahl der offenen Stuecke.
 */
export function rueckgabenFortschritt(opts: {
  rueckgaben: ReadonlyArray<RueckgabeStand & { id: string; ausgabeId?: string | null }>;
  aufgaben: ReadonlyArray<{ id: string; isCompleted: boolean; herkunft?: string | null; ausgabeId?: string | null }>;
}): RueckgabenFortschritt {
  const mitRueckgabe = new Set(opts.rueckgaben.map((r) => r.ausgabeId).filter((id): id is string => !!id));
  const offen = new Map<string, boolean>();
  const merken = (schluessel: string, istOffen: boolean) => {
    offen.set(schluessel, (offen.get(schluessel) ?? false) || istOffen);
  };
  for (const r of opts.rueckgaben) merken(r.ausgabeId ? `a:${r.ausgabeId}` : `r:${r.id}`, rueckgabeOffen(r));
  for (const a of opts.aufgaben) {
    const sperren = a.herkunft === "AUSGABE" && !(a.ausgabeId && mitRueckgabe.has(a.ausgabeId));
    if (!sperren && a.herkunft !== "AUSGABE_FEHLT") continue;
    merken(a.ausgabeId ? `a:${a.ausgabeId}` : `t:${a.id}`, !a.isCompleted);
  }
  const gesamt = offen.size;
  return { erledigt: gesamt - [...offen.values()].filter(Boolean).length, gesamt };
}

// =============================================
// Uebernahme in den Austritt und Reiter „Rückgaben“ (G13, G14; seit S29)
// =============================================

/** „A“, „A und B“, „A, B und C“. */
function aufzaehlen(teile: ReadonlyArray<string>): string {
  if (teile.length <= 1) return teile[0] ?? "";
  return `${teile.slice(0, -1).join(", ")} und ${teile[teile.length - 1]}`;
}

/** Eine neue `ReturnItem` zu einer Ausgabe (G14) – fertig fuer `createMany` (die Spalte `offboardingId` setzt der Dienst). */
export interface RueckgabeEntwurf {
  category: RueckgabeKategorie;
  itemName: string;
  serialNumber: string | null;
  ausgabeId: string;
}

/**
 * Die Rueckgabe-Zeile zu einer Ausgabe (G14) – nur bei RUECKGABE; ein Zugang
 * (SPERREN) bekommt allein seine Sperraufgabe (`null`). `category` aus
 * `rueckgabeKategorie`, sonst SONSTIGES; `itemName` = Bezeichnung (nie
 * Freitext); `serialNumber` = Kennung – sie steht im Reiter, auf der
 * Link-Seite der ausgebenden Stelle und im Protokoll, nie im Titel einer
 * Aufgabe (G21). Die Zeile ist offen (ohne Zustand): Die Uebernahme aendert
 * den Zustand der Ausgabe nicht, AUSGEGEBEN und VERBLEIBT passen beide zu
 * einer offenen Rueckgabe (G13).
 */
export function rueckgabeEntwurf(ausgabe: {
  id: string;
  bezeichnung: string;
  beiAustritt: string;
  kennung?: string | null;
  rueckgabeKategorie?: string | null;
}): RueckgabeEntwurf | null {
  if (ausgabe.beiAustritt !== "RUECKGABE") return null;
  return {
    category: enthalten(RUECKGABE_KATEGORIEN, ausgabe.rueckgabeKategorie) ? ausgabe.rueckgabeKategorie : "SONSTIGES",
    itemName: ausgabe.bezeichnung,
    serialNumber: ausgabe.kennung?.trim() || null,
    ausgabeId: ausgabe.id,
  };
}

/** Was die Uebernahme anlegt (`uebernahmePlan`). */
export interface UebernahmePlan {
  /** Ruecknahme- (RUECKGABE) bzw. Sperraufgaben (SPERREN), je Ausgabe hoechstens eine. */
  aufgaben: AufgabenEntwurf[];
  /** Rueckgabe-Zeilen, nur fuer Gegenstaende. */
  rueckgaben: RueckgabeEntwurf[];
  /** Stellen mit neuen Aufgaben – deren Links verlaengert und neu berechnet werden. */
  stellen: string[];
  /** Neue Rueckgabe-Zeilen (Protokoll, Meldung). */
  rueckgabenNeu: number;
  /** Neue Sperraufgaben (Zugaenge). */
  sperraufgabenNeu: number;
}

/**
 * Was die Uebernahme dieser Ausgaben in den Austritt anlegt (G14, Feinplan
 * 1.7, Schritt 3.7): je Ausgabe die Ruecknahme- bzw. Sperraufgabe
 * (`ruecknahmeAufgabe`) und bei RUECKGABE die Rueckgabe-Zeile
 * (`rueckgabeEntwurf`) – nur, was dem Austritt noch fehlt (`vorhanden`: IDs
 * der Ausgaben mit Aufgabe bzw. Rueckgabe-Zeile). „Rückgaben aktualisieren“
 * legt damit nie etwas doppelt an; der Unique-Index bleibt das Netz
 * (`skipDuplicates`). `startIndex` = Zahl der schon vorhandenen
 * Ausgabe-Aufgaben – neue stehen dahinter, alle vor den Vorlagenpunkten.
 * Ausgaben ohne RUECKGABE/SPERREN fallen weg.
 */
export function uebernahmePlan(opts: {
  ausgaben: ReadonlyArray<AusgabeFuerAufgabe & { kennung?: string | null; rueckgabeKategorie?: string | null }>;
  vorhanden: { aufgaben: ReadonlyArray<string>; rueckgaben: ReadonlyArray<string> };
  letzterArbeitstag: Date | string | null | undefined;
  heute: Kalendertag;
  startIndex: number;
}): UebernahmePlan {
  const mitAufgabe = new Set(opts.vorhanden.aufgaben);
  const mitRueckgabe = new Set(opts.vorhanden.rueckgaben);
  const plan: UebernahmePlan = { aufgaben: [], rueckgaben: [], stellen: [], rueckgabenNeu: 0, sperraufgabenNeu: 0 };
  const gesehen = new Set<string>();
  let index = Math.max(0, Math.trunc(opts.startIndex));
  for (const a of opts.ausgaben) {
    if (gesehen.has(a.id) || !enthalten(AUSGABE_BEI_AUSTRITT, a.beiAustritt)) continue;
    gesehen.add(a.id);
    if (!mitAufgabe.has(a.id)) {
      plan.aufgaben.push(ruecknahmeAufgabe(a, { letzterArbeitstag: opts.letzterArbeitstag, heute: opts.heute, index }));
      index += 1;
      if (!plan.stellen.includes(a.departmentKey)) plan.stellen.push(a.departmentKey);
      if (a.beiAustritt === "SPERREN") plan.sperraufgabenNeu += 1;
    }
    const zeile = mitRueckgabe.has(a.id) ? null : rueckgabeEntwurf(a);
    if (zeile) {
      plan.rueckgaben.push(zeile);
      plan.rueckgabenNeu += 1;
    }
  }
  return plan;
}

/** Ein Stueck kurz – fuer die Vorschau im Dialog und die Hinweise im Reiter (HR; ohne Aktionen). */
export interface AusgabeKurz {
  ausgabeId: string;
  bezeichnung: string;
  /** RUECKGABE (Gegenstand) oder SPERREN (Zugang). */
  art: string;
  kennung: string | null;
  kennungLabel: string;
  departmentKey: string;
  /** Name der ausgebenden Stelle (gepflegt, sonst Label). */
  stelle: string;
  zentral: boolean;
  /** Name der Einrichtung, der das Stueck gehoert; `null`, wenn unbekannt. */
  einrichtung: string | null;
  /** „übergeben 28.01.2027 · IT-Abteilung“ bzw. „eingerichtet …“. */
  text: string;
}

/** Was `ausgabeKurz` von einer Ausgabe liest. */
export interface AusgabeKurzDaten {
  id: string;
  bezeichnung: string;
  beiAustritt: string;
  kennung?: string | null;
  kennungLabel?: string | null;
  departmentKey: string;
  organizationId: string;
  zentral: boolean;
  uebergebenAm: Date | string | null;
}

/** „übergeben 28.01.2027 · IT-Abteilung“ (ohne Datum nur die Stelle). */
function uebergabeText(a: { beiAustritt: string; uebergebenAm: Date | string | null }, stelle: string): string {
  const tag = tagText(a.uebergebenAm);
  return [tag ? `${uebergabeWort(a.beiAustritt)} ${tag}` : "", stelle].filter((t) => t !== "").join(" · ");
}

/** Ein Stueck kurz (Vorschau, Hinweise): Bezeichnung, Kennung, Stelle, Einrichtung, Uebergabe. */
export function ausgabeKurz(
  a: AusgabeKurzDaten,
  ctx: { stellenNamen: Readonly<Record<string, string>>; einrichtungen: Readonly<Record<string, string>> },
): AusgabeKurz {
  const stelle = stelleName(a.departmentKey, ctx.stellenNamen);
  const einrichtung = Object.prototype.hasOwnProperty.call(ctx.einrichtungen, a.organizationId)
    ? ctx.einrichtungen[a.organizationId]?.trim() || null
    : null;
  return {
    ausgabeId: a.id,
    bezeichnung: a.bezeichnung,
    art: a.beiAustritt,
    kennung: a.kennung?.trim() || null,
    kennungLabel: a.kennungLabel?.trim() || KENNUNG_LABEL_STANDARD,
    departmentKey: a.departmentKey,
    stelle,
    zentral: a.zentral,
    einrichtung,
    text: uebergabeText(a, stelle),
  };
}

/** Der Rueckgabe-Vorschlag fuer Dialog und Reiter – fertig, die Oberflaeche rechnet nichts. */
export interface RueckgabeVorschlagAnzeige {
  /** Werden uebernommen: Gegenstaende (Rueckgabe-Zeile und Ruecknahmeaufgabe). */
  rueckgaben: AusgabeKurz[];
  /** Werden uebernommen: Zugaenge (nur Sperraufgabe). */
  sperraufgaben: AusgabeKurz[];
  /** Nur Hinweis: zentral, die Person bleibt in einer anderen Beschaeftigung – einzeln uebernehmbar. */
  hinweisZentral: AusgabeKurz[];
  /** Nur Hinweis: Stueck einer anderen Einrichtung – einzeln uebernehmbar. */
  hinweisAndereEinrichtung: AusgabeKurz[];
  /** Stuecke, die gerade ein anderer Austritt bindet – ohne Kennung, Nummer nur mit Zugriff. */
  schonImAustritt: { offboardingId: string; displayId: string | null; anzahl: number; text: string }[];
}

/**
 * `rueckgabeVorschlag` fuer Dialog und Reiter (E-A35): die vorgeschlagenen
 * Stuecke getrennt nach Gegenstand und Zugang, die Hinweise und die Zeile
 * `SCHON_IM_AUSTRITT` je Austritt. `uebernommen` (Reiter): IDs der Ausgaben,
 * die DIESER Austritt schon hat – sie fehlen in allen Listen; was dann noch
 * unter `rueckgaben`/`sperraufgaben` steht, holt „Rückgaben aktualisieren“.
 */
export function rueckgabeVorschlagAnzeige<T extends AusgabeKurzDaten & VorschlagAusgabe>(
  ergebnis: RueckgabeVorschlagErgebnis<T>,
  ctx: {
    stellenNamen: Readonly<Record<string, string>>;
    einrichtungen: Readonly<Record<string, string>>;
    uebernommen?: ReadonlyArray<string>;
  },
): RueckgabeVorschlagAnzeige {
  const schon = new Set(ctx.uebernommen ?? []);
  const kurz = (liste: ReadonlyArray<T>) => liste.filter((a) => !schon.has(a.id)).map((a) => ausgabeKurz(a, ctx));
  const vorschlag = kurz(ergebnis.vorschlag);
  return {
    rueckgaben: vorschlag.filter((a) => a.art === "RUECKGABE"),
    sperraufgaben: vorschlag.filter((a) => a.art === "SPERREN"),
    hinweisZentral: kurz(ergebnis.hinweisZentral),
    hinweisAndereEinrichtung: kurz(ergebnis.hinweisAndereEinrichtung),
    schonImAustritt: ergebnis.schonImAustritt.map((s) => ({
      ...s,
      text: MELDUNGEN_AUSGABEN.SCHON_IM_AUSTRITT(s.anzahl, s.displayId),
    })),
  };
}

/** Eine Zeile „Sperraufgaben …“ je Stelle (Reiter, Mockup 6.8). */
export interface SperraufgabenZeile {
  departmentKey: string;
  stelle: string;
  /** Die Zugaenge (Bezeichnung, nie Kennung) und ob gesperrt. */
  zugaenge: { titel: string; erledigt: boolean }[];
  offen: number;
  text: string;
}

/**
 * Die Sperraufgaben des Austritts je Stelle (Mockup 6.8): Aufgaben mit
 * `herkunft` AUSGABE OHNE Rueckgabe-Zeile (dieselbe Abgrenzung wie
 * `offeneRueckgaben`). Name des Zugangs aus der Ausgabe, sonst der
 * Aufgabentitel; HR (ohne Link) „im Portal“, sonst „über den
 * Offboarding-Link“. Erledigte stehen mit „(gesperrt)“ da. Stellen in der
 * Reihenfolge der Abteilungskarte, die Personalabteilung zuletzt.
 */
export function sperraufgabenZeilen(opts: {
  aufgaben: ReadonlyArray<{
    title: string;
    isCompleted: boolean;
    herkunft?: string | null;
    ausgabeId?: string | null;
    assigneeDepartment?: string | null;
  }>;
  rueckgaben: ReadonlyArray<{ ausgabeId?: string | null }>;
  ausgaben: ReadonlyArray<{ id: string; bezeichnung: string }>;
  stellenNamen: Readonly<Record<string, string>>;
}): SperraufgabenZeile[] {
  const mitRueckgabe = new Set(opts.rueckgaben.map((r) => r.ausgabeId).filter((id): id is string => !!id));
  const bezeichnung = new Map(opts.ausgaben.map((a) => [a.id, a.bezeichnung]));
  const jeStelle = new Map<string, { titel: string; erledigt: boolean }[]>();
  for (const a of opts.aufgaben) {
    if (a.herkunft !== "AUSGABE" || (a.ausgabeId && mitRueckgabe.has(a.ausgabeId))) continue;
    const key = a.assigneeDepartment?.trim() || DEPARTMENT_KEYS.HR;
    const liste = jeStelle.get(key) ?? [];
    liste.push({ titel: (a.ausgabeId && bezeichnung.get(a.ausgabeId)) || a.title, erledigt: a.isCompleted });
    jeStelle.set(key, liste);
  }
  return stellenReihenfolge(jeStelle.keys()).map((key) => {
    const zugaenge = jeStelle.get(key) ?? [];
    const stelle = stelleName(key, opts.stellenNamen);
    const liste = aufzaehlen(zugaenge.map((z) => (z.erledigt ? `${z.titel} (${AUSGABE_GESPERRT_LABEL})` : z.titel)));
    return {
      departmentKey: key,
      stelle,
      zugaenge,
      offen: zugaenge.filter((z) => !z.erledigt).length,
      text: MELDUNGEN_AUSGABEN.SPERRAUFGABEN(stelle, liste, istLinkAbteilung(key)),
    };
  });
}

/** Anzeige einer offenen Rueckgabe-Zeile (Zustand leer). */
export const RUECKGABE_OFFEN_LABEL = "offen";

/** Eine Zeile der Tabelle im Reiter „Rückgaben“ – fertig, die Oberflaeche rechnet nichts. */
export interface RueckgabeZeile {
  id: string;
  category: string;
  kategorieLabel: string;
  itemName: string;
  serialNumber: string | null;
  /** Beschriftung der Kennung: Momentaufnahme der Ausgabe, sonst „Kennung“. */
  kennungLabel: string;
  /** `rueckgabeZustand` (Altbestand mit `isReturned` = ZURUECK); `null` = offen. */
  zustand: RueckgabeZustand | null;
  zustandLabel: string;
  offen: boolean;
  returnedAt: string | null;
  condition: string | null;
  notes: string | null;
  /** Aus der Einstellung vorgeschlagen (`ausgabeId`): nicht loeschbar, stattdessen „entfällt“ (G15). */
  vorgeschlagen: boolean;
  ausgabeId: string | null;
  departmentKey: string;
  /** Ausgebende Stelle; von HR erfasste Zeilen gehoeren der Personalabteilung. */
  stelle: string;
  /** „übergeben 28.01.2027 · IT-Abteilung“ – nur an vorgeschlagenen Zeilen mit Ausgabe. */
  uebergabe: string | null;
  /** Warum die Kennung hier nicht korrigierbar ist (ein anderer Austritt bindet das Stueck), sonst null. */
  sperrGrund: string | null;
  aktionen: { korrigieren: boolean; loeschen: boolean };
  /**
   * Den Zustand im Reiter waehlen (S32): mit Bearbeitungsrecht (nicht
   * CANCELLED) – an einer Zeile aus der Einstellung nur, solange DIESER
   * Austritt das Stueck aendern darf (`gleichlaufGesperrt`, G28). Sonst
   * antwortete der Server 409 (AUSGABE_IM_AUSTRITT bzw. AUSGABE_FREIGEGEBEN).
   */
  zustandWaehlbar: boolean;
  /** Warum der Zustand hier nicht waehlbar ist, obwohl HR bearbeiten darf; sonst null. */
  zustandSperrGrund: string | null;
  /** „fehlt“ legt die Folgeaufgabe „Schließung prüfen“ an (G17): Zeile aus der Einstellung, Kategorie SCHLUESSEL. */
  folgeBeiFehlt: boolean;
}

function iso(wert: Date | string | null | undefined): string | null {
  if (wert === null || wert === undefined) return null;
  const d = typeof wert === "string" ? new Date(wert) : wert;
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Die Zeilen der Tabelle im Reiter „Rückgaben“ (Mockup 6.8): Kategorie,
 * Gegenstand, Kennung, Zustand, Stelle und Uebergabe. Eine vorgeschlagene
 * Zeile (`ausgabeId`) nennt die ausgebende Stelle (Ruecknahmeaufgabe, sonst
 * Ausgabe) und „übergeben … · Stelle“; korrigieren laesst sich die Kennung
 * nach `ausgabenZeile` mit `austrittId` (nur Gegenstaende, nicht gebunden an
 * einen anderen Austritt), loeschen nie (G15). Von HR erfasste Zeilen:
 * Personalabteilung, korrigieren und loeschen mit Bearbeitungsrecht.
 *
 * Seit S32 (Oberflaeche) zusaetzlich, ob der Reiter den Zustand waehlen laesst
 * (`zustandWaehlbar`): mit Bearbeitungsrecht, an einer Zeile aus der
 * Einstellung nur ohne `gleichlaufGesperrt` – ein anderer Austritt bindet das
 * Stueck, oder ein abgeschlossener Austritt (`austrittStatus` COMPLETED) hat
 * es mit „verbleibt“ freigegeben (G28). Die Kennung bleibt dort nach
 * `ausgabenZeile` korrigierbar. Ohne `austrittStatus` gilt der Austritt als
 * laufend.
 */
export function rueckgabeZeilenBauen(opts: {
  rueckgaben: ReadonlyArray<{
    id: string;
    category: string;
    itemName: string;
    serialNumber?: string | null;
    zustand?: string | null;
    isReturned: boolean;
    returnedAt?: Date | string | null;
    condition?: string | null;
    notes?: string | null;
    ausgabeId?: string | null;
  }>;
  aufgaben: ReadonlyArray<{ herkunft?: string | null; ausgabeId?: string | null; assigneeDepartment?: string | null }>;
  ausgaben: ReadonlyArray<AusgabeZeilenDaten & { departmentKey: string }>;
  stellenNamen: Readonly<Record<string, string>>;
  austrittId: string;
  darfBearbeiten: boolean;
  /** OffboardingStatus des Austritts (fuer „mit dem Abschluss freigegeben“, G28); fehlt = laufend. */
  austrittStatus?: string | null;
}): RueckgabeZeile[] {
  const ausgabeNachId = new Map(opts.ausgaben.map((a) => [a.id, a]));
  const austritt = { id: opts.austrittId, status: opts.austrittStatus?.trim() || "INITIATED" };
  const stelleDerAufgabe = new Map<string, string>();
  for (const a of opts.aufgaben) {
    if (a.herkunft === "AUSGABE" && a.ausgabeId && a.assigneeDepartment && !stelleDerAufgabe.has(a.ausgabeId)) {
      stelleDerAufgabe.set(a.ausgabeId, a.assigneeDepartment);
    }
  }
  return opts.rueckgaben.map((r) => {
    const ausgabe = r.ausgabeId ? (ausgabeNachId.get(r.ausgabeId) ?? null) : null;
    const key =
      (r.ausgabeId ? stelleDerAufgabe.get(r.ausgabeId) : undefined) || ausgabe?.departmentKey || DEPARTMENT_KEYS.HR;
    const stelle = stelleName(key, opts.stellenNamen);
    const zustand = rueckgabeZustand(r);
    let korrigieren = opts.darfBearbeiten && !r.ausgabeId;
    let sperrGrund: string | null = null;
    let zustandSperrGrund: string | null = null;
    if (ausgabe) {
      const stand = ausgabenZeile(ausgabe, { darfBearbeiten: opts.darfBearbeiten, austrittId: opts.austrittId });
      korrigieren = stand.aktionen.korrigieren;
      sperrGrund = stand.sperrGrund;
      const sperre = opts.darfBearbeiten ? gleichlaufGesperrt(ausgabe, ausgabe.bezuege ?? [], austritt) : null;
      zustandSperrGrund = sperre ? gleichlaufSperreText(sperre) : null;
    }
    return {
      id: r.id,
      category: r.category,
      kategorieLabel: RETURN_CATEGORY_LABELS[r.category] ?? r.category,
      itemName: r.itemName,
      serialNumber: r.serialNumber?.trim() || null,
      kennungLabel: ausgabe?.kennungLabel?.trim() || KENNUNG_LABEL_STANDARD,
      zustand,
      zustandLabel: zustand ? AUSGABE_ZUSTAND_LABELS[zustand] : RUECKGABE_OFFEN_LABEL,
      offen: zustand === null,
      returnedAt: iso(r.returnedAt),
      condition: r.condition?.trim() || null,
      notes: r.notes?.trim() || null,
      vorgeschlagen: !!r.ausgabeId,
      ausgabeId: r.ausgabeId ?? null,
      departmentKey: key,
      stelle,
      uebergabe: ausgabe ? uebergabeText(ausgabe, stelle) : null,
      sperrGrund,
      aktionen: { korrigieren, loeschen: opts.darfBearbeiten && !r.ausgabeId },
      zustandWaehlbar: opts.darfBearbeiten && zustandSperrGrund === null,
      zustandSperrGrund,
      folgeBeiFehlt: !!r.ausgabeId && r.category === "SCHLUESSEL",
    };
  });
}

/**
 * „Lösen …“ ist gesperrt (G11, Feinplan 1.7), sobald eine Ruecknahme-,
 * Sperr- oder Folgeaufgabe erledigt ist oder eine vorgeschlagene Rueckgabe
 * (`ausgabeId`) einen Zustand hat (auch Altbestand mit `isReturned`) – sonst
 * verloere der Austritt einen bestaetigten Stand. Dieselbe Regel prueft der
 * Server nach der Sperre des Austritts.
 */
export function loesenGesperrt(opts: {
  aufgaben: ReadonlyArray<{ herkunft?: string | null; isCompleted: boolean }>;
  rueckgaben: ReadonlyArray<RueckgabeStand & { ausgabeId?: string | null }>;
}): boolean {
  return (
    opts.aufgaben.some((a) => enthalten(OFFBOARDING_AUFGABEN_HERKUNFT, a.herkunft) && a.isCompleted) ||
    opts.rueckgaben.some((r) => !!r.ausgabeId && !rueckgabeOffen(r))
  );
}

/** Was die Rueckfrage vor „Lösen …“ nennt (G11, `LOESEN_RUECKFRAGE`). */
export interface LoesenStand {
  /** Ruecknahme-, Sperr- und Folgeaufgaben, die geloescht wuerden. */
  aufgaben: number;
  /** Davon betroffene Stellen, die schon informiert sind – ihre Link-Seite verliert die Aufgaben. */
  informierteStellen: number;
  rueckfrage: string;
  /** `LOESEN_GESPERRT`, wenn „Lösen …“ nicht mehr geht; sonst null. */
  sperrGrund: string | null;
}

/**
 * Stand fuer die Rueckfrage vor „Lösen …“: Zahl der Aufgaben mit `herkunft`
 * und wie viele ihrer Stellen schon informiert sind (`informierteStellen` je
 * Link); `sperrGrund` nach `loesenGesperrt`.
 */
export function loesenStand(opts: {
  aufgaben: ReadonlyArray<{ herkunft?: string | null; isCompleted: boolean; assigneeDepartment?: string | null }>;
  rueckgaben: ReadonlyArray<RueckgabeStand & { ausgabeId?: string | null }>;
  links: ReadonlyArray<{ departmentKey: string; sentAt?: Date | string | null; lastSentAt?: Date | string | null }>;
}): LoesenStand {
  const ausgabeAufgaben = opts.aufgaben.filter((a) => enthalten(OFFBOARDING_AUFGABEN_HERKUNFT, a.herkunft));
  const stellen = new Set(ausgabeAufgaben.map((a) => a.assigneeDepartment).filter((k): k is string => !!k));
  const informiert = informierteStellen(opts.links.filter((l) => stellen.has(l.departmentKey)));
  return {
    aufgaben: ausgabeAufgaben.length,
    informierteStellen: informiert,
    rueckfrage: MELDUNGEN_AUSGABEN.LOESEN_RUECKFRAGE(ausgabeAufgaben.length, informiert),
    sperrGrund: loesenGesperrt(opts) ? MELDUNGEN_AUSGABEN.LOESEN_GESPERRT : null,
  };
}

// =============================================
// Mailfelder (G9, G10)
// =============================================

/** Ein Stueck fuer die Mailfelder; ohne `zustand` zaehlt es als aktiv. */
export interface MailStueck {
  kennung?: string | null;
  uebergebenAm: Date | string | null;
  zustand?: string | null;
  beiAustritt?: string | null;
}

/** Zeilen roh (mit \n) und maskiert (mit <br>); leere Zeilen fallen weg. */
function mailListe(zeilen: ReadonlyArray<string>): { roh: string; html: string } {
  const gefuellt = zeilen.filter((z) => z !== "");
  return { roh: gefuellt.join("\n"), html: gefuellt.map((z) => escapeHtml(z)).join("<br>") };
}

/** „FES-IPAD-0412 · übergeben 28.01.2027“ (Teile ohne Wert fallen weg). */
function stueckZeile(teile: ReadonlyArray<string>, s: MailStueck): string {
  const datum = tagText(s.uebergebenAm);
  return [...teile, (s.kennung ?? "").trim(), datum ? `${uebergabeWort(s.beiAustritt)} ${datum}` : ""]
    .map((t) => t.trim())
    .filter((t) => t !== "")
    .join(" · ");
}

/**
 * `ausgabe_vermerk` fuer `onboarding-task-completed` (G9): je aktivem Stueck
 * eine Zeile „FES-IPAD-0412 · übergeben 28.01.2027“ (ohne Kennung nur
 * „übergeben …“, bei einem Zugang „eingerichtet …“). Der Rohtext gehoert nur
 * in den Textteil, `_html` ist maskiert und mit `<br>` umbrochen. Ohne Stueck
 * beide "" – der Block `{{#ausgabe_vermerk}}` faellt weg. Flach: nur
 * Zeichenketten.
 */
export function ausgabeVermerkMailFelder(stuecke: ReadonlyArray<MailStueck>): {
  ausgabe_vermerk: string;
  ausgabe_vermerk_html: string;
} {
  const { roh, html } = mailListe(nurAktive(stuecke).map((s) => stueckZeile([], s)));
  return { ausgabe_vermerk: roh, ausgabe_vermerk_html: html };
}

/**
 * `ausgaben_liste` fuer die Absage an eine Stelle (G10): je aktivem Stueck
 * dieser Stelle „Dienst-iPad (Lernmittel) · FES-IPAD-0412 · übergeben
 * 28.01.2027“. Merker `hat_ausgaben` als Zeichenkette ("ja"/""), weil
 * `renderTemplate` nur „nicht leer“ kennt.
 */
export function ausgabenListeMailFelder(stuecke: ReadonlyArray<MailStueck & { bezeichnung: string }>): {
  ausgaben_liste: string;
  ausgaben_liste_html: string;
  hat_ausgaben: string;
} {
  const { roh, html } = mailListe(nurAktive(stuecke).map((s) => stueckZeile([s.bezeichnung], s)));
  return { ausgaben_liste: roh, ausgaben_liste_html: html, hat_ausgaben: roh ? "ja" : "" };
}

// =============================================
// Anzeige in Karte und Reiter (G7, G20)
// =============================================

/** Woher ein Vermerk stammt, als Teil der Zeile. */
export const AUSGABE_QUELLE_TEXTE: Readonly<Record<AusgabeQuelle, string>> = {
  LINK: "über den Link",
  HR: "von HR vermerkt",
};

/** Beschriftung der Kennung ohne Momentaufnahme `ausgabeKennung` (G4). */
export const KENNUNG_LABEL_STANDARD = "Kennung";

/** Wort zum Zustand; ZURUECK heisst bei einem Zugang (SPERREN) „gesperrt“. */
export function ausgabeZustandLabel(zustand: string, beiAustritt?: string | null): string {
  if (zustand === "ZURUECK" && beiAustritt === "SPERREN") return AUSGABE_GESPERRT_LABEL;
  return enthalten(AUSGABE_ZUSTAENDE, zustand) ? AUSGABE_ZUSTAND_LABELS[zustand] : zustand;
}

/** Was HR an einem Stueck in der Karte tun darf (G7). */
export interface AusgabeAktionen {
  korrigieren: boolean;
  tauschen: boolean;
  zurueckgenommen: boolean;
  entfernen: boolean;
}

/** Eine Ausgabe, wie Karte und Reiter sie lesen. */
export interface AusgabeZeilenDaten {
  id: string;
  zustand: string;
  beiAustritt: string;
  kennung: string | null;
  kennungLabel?: string | null;
  uebergebenAm: Date | string | null;
  quelle: string;
  /** Austrittsbezuege, nach der Sperre gelesen (G28); fehlt = keine. */
  bezuege?: ReadonlyArray<AustrittsBezug>;
}

/** Ein Stueck in Karte und Reiter – fertig, die Oberflaeche rechnet nichts. */
export interface AusgabeStand {
  id: string;
  zustand: string;
  zustandLabel: string;
  /** AUSGEGEBEN oder VERBLEIBT (noch bei der Person). */
  aktiv: boolean;
  kennung: string | null;
  kennungLabel: string;
  uebergebenAm: Kalendertag | null;
  quelle: string;
  /** „übergeben 28.01.2027 · FES-IPAD-0412 · über den Link“. */
  text: string;
  /** An einen (anderen) Austritt gebunden (G28). */
  gebunden: boolean;
  aktionen: AusgabeAktionen;
  /** Warum nichts geht, obwohl HR bearbeiten darf (gebunden); sonst null. */
  sperrGrund: string | null;
}

const KEINE_AKTIONEN: Readonly<AusgabeAktionen> = Object.freeze({
  korrigieren: false,
  tauschen: false,
  zurueckgenommen: false,
  entfernen: false,
});

/**
 * Ein Stueck fuer die Karte „Ausstattung & Zugänge“ und den Reiter
 * „Rückgaben“ (G7):
 *
 *   - Text „übergeben 28.01.2027 · FES-IPAD-0412 · über den Link“ (Zugang:
 *     „eingerichtet …“, HR: „von HR vermerkt“), ausserhalb von AUSGEGEBEN mit
 *     dem Zustand dahinter („· ersetzt“).
 *   - Aktionen nur mit Bearbeitungsrecht (`darfBearbeiten` = HR_EDIT_ROLES, auch
 *     bei COMPLETED/EXPIRED) und nur an aktiven Stuecken: AUSGEGEBEN alle vier,
 *     VERBLEIBT ohne „entfernen“; „tauschen“ nur an einem Gegenstand
 *     (RUECKGABE) – ein Zugang wird gesperrt und neu eingerichtet, nie als
 *     „verloren“ getauscht (der Dienst antwortet sonst 400
 *     `ZUGANG_KEIN_TAUSCH`). Gebunden an einen Austritt (G28, ausser
 *     `austrittId`): keine, dafuer `sperrGrund` – mit Vorgangsnummer nur, wenn
 *     der Bezug sie traegt (Zugriff auf den Austritt). Ohne Recht keine Aktion
 *     und kein Sperrgrund; die Anzeige bleibt.
 *   - Im Reiter „Rückgaben“ (`austrittId`) an einem Stueck, das DIESER
 *     Austritt bezieht: hoechstens `korrigieren` (Kennung, G15 – ueber die
 *     Rueckgabe-Zeile, die es nur bei RUECKGABE gibt). Tauschen, Zuruecknehmen
 *     und Entfernen sind Wege der Karte „ohne Austrittsbezug“ (1.2, G7); die
 *     Onboarding-Route antwortete dort 409 `AUSGABE_IM_AUSTRITT`, weil eben
 *     dieser Austritt das Stueck bindet. Den Zustand waehlt der Reiter selbst.
 */
export function ausgabenZeile(
  stand: AusgabeZeilenDaten,
  ctx: { darfBearbeiten: boolean; austrittId?: string | null },
): AusgabeStand {
  const aktiv = enthalten(AUSGABE_AKTIV, stand.zustand);
  const bezuege = stand.bezuege ?? [];
  const bindend = bindenderAustritt(stand, bezuege, ctx.austrittId);
  const imEigenenAustritt = !!ctx.austrittId && bezuege.some((b) => b.offboardingId === ctx.austrittId);
  let aktionen: AusgabeAktionen = { ...KEINE_AKTIONEN };
  let sperrGrund: string | null = null;
  if (ctx.darfBearbeiten && aktiv) {
    if (bindend) {
      sperrGrund = MELDUNGEN_AUSGABEN.AUSGABE_IM_AUSTRITT(bindend.displayId ?? null);
    } else if (imEigenenAustritt) {
      aktionen = { ...KEINE_AKTIONEN, korrigieren: stand.beiAustritt === "RUECKGABE" };
    } else {
      aktionen = {
        korrigieren: true,
        tauschen: stand.beiAustritt === "RUECKGABE",
        zurueckgenommen: true,
        entfernen: stand.zustand === "AUSGEGEBEN",
      };
    }
  }

  const uebergebenAm = kalendertagVon(stand.uebergebenAm);
  const kennung = stand.kennung?.trim() || null;
  const zustandLabel = ausgabeZustandLabel(stand.zustand, stand.beiAustritt);
  const quelleText = enthalten(AUSGABE_QUELLEN, stand.quelle) ? AUSGABE_QUELLE_TEXTE[stand.quelle] : "";
  const text = [
    uebergebenAm ? `${uebergabeWort(stand.beiAustritt)} ${formatKalendertag(uebergebenAm)}` : "",
    kennung ?? "",
    quelleText,
    stand.zustand === "AUSGEGEBEN" ? "" : zustandLabel,
  ]
    .filter((t) => t !== "")
    .join(" · ");

  return {
    id: stand.id,
    zustand: stand.zustand,
    zustandLabel,
    aktiv,
    kennung,
    kennungLabel: stand.kennungLabel?.trim() || KENNUNG_LABEL_STANDARD,
    uebergebenAm,
    quelle: stand.quelle,
    text,
    gebunden: bindend !== null,
    aktionen,
    sperrGrund,
  };
}

/** Was die Karte je Ausstattungsaufgabe unter den Stuecken zeigt. */
export interface AusgabenJeAufgabe {
  /** Gelb: „Übergabe nicht vermerkt“ (Zugang: „Einrichtung …“); grau: „Ausgaben nach Ablauf der Aufbewahrungsfrist gelöscht“. */
  hinweis: { text: string; ton: "gelb" | "grau" } | null;
  /** „Übergabe vermerken …“ anbieten. */
  vermerken: boolean;
}

/**
 * Hinweis und „Vermerken“ je Ausstattungsaufgabe (G7, G20), nur fuer Zeilen
 * mit `ausgabeMoeglich`. Ohne aktives Stueck:
 *
 *   - mit `ausgabenGeloeschtAm`: grauer Satz „Ausgaben nach Ablauf der
 *     Aufbewahrungsfrist gelöscht“, KEINE Aufforderung;
 *   - sonst, wenn die Aufgabe erledigt (nicht entfallen) ist und gar keine
 *     Ausgabe hat: gelb „Übergabe nicht vermerkt“ – bei einem Zugang
 *     (`art` SPERREN) „Einrichtung nicht vermerkt“, wie Knopf und Link-Seite.
 *
 * „Vermerken“ ist eine gewoehnliche Aktion: mit Recht, nicht entfallen und
 * weniger als `aktiveJeAufgabe` aktive Stuecke – auch nach der Loeschung.
 */
export function ausgabenJeAufgabe(
  aufgabe: { isCompleted: boolean; entfaelltAm?: Date | string | null; ausgabenGeloeschtAm?: Date | string | null },
  ausgaben: ReadonlyArray<{ zustand: string }>,
  ctx: { ausgabeMoeglich: boolean; darfBearbeiten: boolean; art?: string | null },
): AusgabenJeAufgabe {
  if (!ctx.ausgabeMoeglich) return { hinweis: null, vermerken: false };
  const entfaellt = !!aufgabe.entfaelltAm;
  const aktive = ausgaben.filter((a) => enthalten(AUSGABE_AKTIV, a.zustand)).length;
  let hinweis: AusgabenJeAufgabe["hinweis"] = null;
  if (aktive === 0) {
    if (aufgabe.ausgabenGeloeschtAm) {
      hinweis = { text: MELDUNGEN_AUSGABEN.AUSGABEN_GELOESCHT, ton: "grau" };
    } else if (ausgaben.length === 0 && aufgabe.isCompleted && !entfaellt) {
      const text =
        ctx.art === "SPERREN" ? MELDUNGEN_AUSGABEN.EINRICHTUNG_NICHT_VERMERKT : MELDUNGEN_AUSGABEN.UEBERGABE_NICHT_VERMERKT;
      hinweis = { text, ton: "gelb" };
    }
  }
  return {
    hinweis,
    vermerken: ctx.darfBearbeiten && !entfaellt && aktive < AUSGABE_GRENZEN.aktiveJeAufgabe,
  };
}

/**
 * Was die Karte „Ausstattung & Zugänge“ je Ausstattungsaufgabe zu Ausgaben
 * zeigt (seit S24) – fertig, die Oberflaeche rechnet nichts. Haengt in
 * `AusstattungsAufgabeStand` (ausstattung.ts liest den Typ nur).
 */
export interface AusgabenAufgabeAnzeige {
  /** „Übergabe vermerken“ grundsaetzlich moeglich (`ausgabeMoeglich`, G4): nicht gestrichen. */
  ausgabeMoeglich: boolean;
  /** RUECKGABE (Gegenstand) oder SPERREN (Zugang: „eingerichtet“, zurueck nur als „gesperrt“). */
  ausgabeArt: AusgabeBeiAustritt;
  /** Beschriftung der Kennung im Dialog: Momentaufnahme `ausgabeKennung`, sonst „Kennung“. */
  kennungLabel: string;
  /** Schluessel bzw. Transponder (Kategorie SCHLUESSEL): „verloren“ und „fehlt“ zeigen den Hinweis zur Gebaeudewirtschaft (G7). */
  schluessel: boolean;
  /** Die Stuecke dieser Aufgabe (`ausgabenZeile`), aktive und fruehere, in der Reihenfolge der Abfrage. */
  ausgaben: AusgabeStand[];
  /** `ausgabenJeAufgabe`: gelb „Übergabe nicht vermerkt“ bzw. grau „Ausgaben … gelöscht“. */
  ausgabenHinweis: AusgabenJeAufgabe["hinweis"];
  /** „Übergabe vermerken …“ anbieten (`ausgabenJeAufgabe`). */
  vermerken: boolean;
}

/**
 * Die Ausgaben der Karte je Ausstattungsaufgabe (G7, G20, G28), Schluessel =
 * `checklistItemId`. Eine Aufgabe steht nur darin, wenn ihre Zeile beim
 * Austritt zurueckkommt oder gesperrt wird (`beiAustritt` RUECKGABE/SPERREN,
 * keine Angabe) – auch gestrichen, damit fruehere Stuecke sichtbar bleiben.
 * Ohne `beiAustritt` (A4 nicht eingeschaltet, G27) ist das Ergebnis leer und
 * die Karte unveraendert.
 *
 * `ausgaben` tragen ihre Austrittsbezuege (`bezuege`, nach `austrittsBezuegeLaden`)
 * – daraus Bindung und Sperrgrund (`ausgabenZeile`). `darfBearbeiten` =
 * HR_EDIT_ROLES, unabhaengig vom Endstatus des Vorgangs (G7).
 */
export function ausgabenAnzeigeBauen(opts: {
  zeilen: ReadonlyArray<{
    id: string;
    art: string;
    beiAustritt?: string | null;
    gestrichenAm?: Date | string | null;
    ausgabeKennung?: string | null;
    rueckgabeKategorie?: string | null;
  }>;
  verknuepfungen: ReadonlyArray<{ ausstattungId: string; checklistItemId: string }>;
  aufgaben: ReadonlyArray<{
    id: string;
    isCompleted: boolean;
    entfaelltAm?: Date | string | null;
    ausgabenGeloeschtAm?: Date | string | null;
  }>;
  ausgaben: ReadonlyArray<AusgabeZeilenDaten & { checklistItemId: string | null }>;
  darfBearbeiten: boolean;
}): Record<string, AusgabenAufgabeAnzeige> {
  const zeileNachId = new Map(opts.zeilen.map((z) => [z.id, z]));
  const aufgabeNachId = new Map(opts.aufgaben.map((a) => [a.id, a]));
  const ergebnis: Record<string, AusgabenAufgabeAnzeige> = {};
  for (const v of opts.verknuepfungen) {
    const zeile = zeileNachId.get(v.ausstattungId);
    const aufgabe = aufgabeNachId.get(v.checklistItemId);
    if (!zeile || !aufgabe || zeile.art === "ANGABE" || !enthalten(AUSGABE_BEI_AUSTRITT, zeile.beiAustritt)) continue;
    const moeglich = ausgabeMoeglich({ art: zeile.art, beiAustritt: zeile.beiAustritt, gestrichenAm: zeile.gestrichenAm });
    const eigene = opts.ausgaben.filter((a) => a.checklistItemId === aufgabe.id);
    const jeAufgabe = ausgabenJeAufgabe(aufgabe, eigene, {
      ausgabeMoeglich: moeglich,
      darfBearbeiten: opts.darfBearbeiten,
      art: zeile.beiAustritt,
    });
    ergebnis[aufgabe.id] = {
      ausgabeMoeglich: moeglich,
      ausgabeArt: zeile.beiAustritt,
      kennungLabel: zeile.ausgabeKennung?.trim() || KENNUNG_LABEL_STANDARD,
      schluessel: zeile.beiAustritt === "RUECKGABE" && zeile.rueckgabeKategorie === "SCHLUESSEL",
      ausgaben: eigene.map((a) => ausgabenZeile(a, { darfBearbeiten: opts.darfBearbeiten })),
      ausgabenHinweis: jeAufgabe.hinweis,
      vermerken: jeAufgabe.vermerken,
    };
  }
  return ergebnis;
}

// =============================================
// Link-Seite der ausgebenden Stelle (G6, Feinplan 1.6; seit S25)
// =============================================

/** Ein Stueck auf der Link-Seite der Stelle (Onboarding, Feinplan 1.6). */
export interface LinkAusgabeStueck {
  id: string;
  kennung: string | null;
  /** Kalendertag der Uebergabe bzw. Einrichtung (`YYYY-MM-DD`). */
  uebergebenAm: Kalendertag | null;
  /** Eigener Link-Vermerk, noch AUSGEGEBEN und an keinen Austritt gebunden (`perLinkEntfernbar`, G6). */
  entfernbar: boolean;
}

/**
 * Feld `ausgabe` einer Aufgabe auf der Link-Seite (Onboarding, Feinplan 1.6) –
 * fertig, die Seite rechnet nichts:
 *
 *   moeglich      „Übergabe vermerken“ geht jetzt: Aufgabe nicht entfallen und
 *                 weniger als `aktiveJeAufgabe` noch ausgegebene Stuecke
 *                 (dieselben Regeln, mit denen der Server antwortet)
 *   kennungLabel  Beschriftung der Kennung (Momentaufnahme `ausgabeKennung`,
 *                 sonst „Kennung“)
 *   art           RUECKGABE (Gegenstand: „übergeben“) oder SPERREN (Zugang:
 *                 „eingerichtet“)
 *   stuecke       die noch ausgegebenen Stuecke DIESER Stelle (AUSGEGEBEN,
 *                 VERBLEIBT) – auch von HR vermerkte, die aber nie entfernbar sind
 */
export interface LinkAusgabe {
  moeglich: boolean;
  kennungLabel: string;
  art: AusgabeBeiAustritt;
  stuecke: LinkAusgabeStueck[];
}

/**
 * Das Feld `ausgabe` einer Aufgabe auf der Link-Seite der Stelle (G6, G21) –
 * `null` heisst: Der Schluessel fehlt an der Aufgabe GANZ. Nur an einer
 * Ausstattungsaufgabe (`herkunft` AUSSTATTUNG) DIESER Stelle, deren Zeile
 * ebenfalls dieser Stelle gehoert (Muster `bemerkungFuerStelle`: nach einem
 * Stellenwechsel bleibt die entfallene Aufgabe bei der alten Stelle, die Zeile
 * gilt der neuen) und beim Austritt zurueckkommt bzw. gesperrt wird
 * (`ausgabeMoeglich`: RUECKGABE/SPERREN, keine Angabe, nicht gestrichen). Ohne
 * `beiAustritt` im Katalog (A4 aus, G27) ist es also nie gesetzt.
 *
 * Die Kennung sieht nur die ausgebende Stelle: Stuecke mit anderem
 * `departmentKey` fallen weg. `entfernbar` nach `perLinkEntfernbar` mit der
 * Bindung aus `bezuege` (G28; der Aufrufer liest sie fuer eigene
 * Link-Vermerke im Zustand AUSGEGEBEN).
 */
export function linkAusgabeBauen(opts: {
  departmentKey: string;
  aufgabe: { assignee: string | null; herkunft: string | null; entfaelltAm?: Date | string | null };
  zeile:
    | {
        departmentKey: string;
        art: string;
        beiAustritt?: string | null;
        ausgabeKennung?: string | null;
        gestrichenAm?: Date | string | null;
      }
    | null
    | undefined;
  /** Alle Ausgaben dieser Aufgabe (jeder Zustand, jede Stelle). */
  ausgaben: ReadonlyArray<{
    id: string;
    departmentKey: string;
    zustand: string;
    quelle: string;
    kennung: string | null;
    uebergebenAm: Date | string | null;
    bezuege?: ReadonlyArray<AustrittsBezug>;
  }>;
}): LinkAusgabe | null {
  const key = opts.departmentKey;
  const z = opts.zeile;
  if (!z || opts.aufgabe.herkunft !== "AUSSTATTUNG" || opts.aufgabe.assignee !== key || z.departmentKey !== key) {
    return null;
  }
  if (!enthalten(AUSGABE_BEI_AUSTRITT, z.beiAustritt)) return null;
  if (!ausgabeMoeglich({ art: z.art, beiAustritt: z.beiAustritt, gestrichenAm: z.gestrichenAm })) return null;

  const aktive = opts.ausgaben.filter((a) => enthalten(AUSGABE_AKTIV, a.zustand));
  return {
    moeglich: !opts.aufgabe.entfaelltAm && aktive.length < AUSGABE_GRENZEN.aktiveJeAufgabe,
    kennungLabel: z.ausgabeKennung?.trim() || KENNUNG_LABEL_STANDARD,
    art: z.beiAustritt,
    stuecke: aktive
      .filter((a) => a.departmentKey === key)
      .map((a) => ({
        id: a.id,
        kennung: a.kennung?.trim() || null,
        uebergebenAm: kalendertagVon(a.uebergebenAm),
        entfernbar: perLinkEntfernbar(a, bindenderAustritt(a, a.bezuege ?? []) !== null),
      })),
  };
}

/**
 * Eine Zeile eines Stuecks auf der Link-Seite: „FES-IPAD-0412 · übergeben
 * 28.01.2027“, ohne Kennung nur „übergeben …“, bei einem Zugang
 * „eingerichtet …“ – dieselbe Form wie die Zeile in der Mail an HR (G9).
 */
export function linkStueckText(stueck: Pick<LinkAusgabeStueck, "kennung" | "uebergebenAm">, art: string): string {
  return stueckZeile([], { kennung: stueck.kennung, uebergebenAm: stueck.uebergebenAm, beiAustritt: art });
}

// =============================================
// Link-Seite der Stelle im Offboarding (G15, G17, Feinplan 1.6; seit S30)
// =============================================

/**
 * Die drei Knoepfe einer Ruecknahmeaufgabe auf der Link-Seite (1.8,
 * `ruecknahme-auswahl.tsx`) – statt des Hakens. Mehr waehlt die Stelle nicht
 * (`RUECKGABE_ZUSTAENDE_STELLE`); „verbleibt“ und „entfällt“ setzt nur HR.
 */
export const RUECKNAHME_AUSWAHL: ReadonlyArray<{ zustand: RueckgabeZustandStelle; label: string }> = [
  { zustand: "ZURUECK", label: "Zurückerhalten" },
  { zustand: "BESCHAEDIGT", label: "Beschädigt zurückerhalten" },
  { zustand: "FEHLT", label: "Fehlt" },
];

/**
 * Feld `ausgabe` an einer Ruecknahme- (RUECKGABE) bzw. Sperraufgabe (SPERREN)
 * der ausgebenden Stelle auf ihrer Offboarding-Link-Seite (Feinplan 1.6):
 *
 *   art           RUECKGABE (Gegenstand) oder SPERREN (Zugang)
 *   kennungLabel  Beschriftung der Kennung (Momentaufnahme, sonst „Kennung“)
 *   kennung       die Kennung – damit die Stelle das Stueck findet (G21)
 *   uebergebenAm  Kalendertag der Uebergabe bzw. Einrichtung
 *   zustand       Rueckgabezustand in DIESEM Austritt (`null` = offen)
 *   zustandLabel  „offen“, „zurück“, „gesperrt“, „fehlt“ …
 *   auswahl       die drei Knoepfe (`RUECKNAHME_AUSWAHL`); an einem Zugang
 *                 leer – er hat den Haken („Gesperrt“)
 */
export interface OffboardingLinkAusgabe {
  art: AusgabeBeiAustritt;
  kennungLabel: string;
  kennung: string | null;
  uebergebenAm: Kalendertag | null;
  zustand: RueckgabeZustand | null;
  zustandLabel: string;
  auswahl: ReadonlyArray<{ zustand: RueckgabeZustandStelle; label: string }>;
}

/**
 * Feld `ausgabe` an der Folgeaufgabe „Schließung prüfen“ der
 * Gebaeudewirtschaft (G17) – NUR lesend, ohne `auswahl`: Die Folgeaufgabe hat
 * den normalen Haken. Die Kennung braucht die Gebaeudewirtschaft fuer den
 * Zylindertausch bzw. die Sperre im Schliesssystem; sie steht nie im Titel.
 */
export interface OffboardingFolgeAusgabe {
  art: AusgabeBeiAustritt;
  kennungLabel: string;
  kennung: string | null;
  zustandLabel: string;
}

/**
 * Das Feld `ausgabe` einer Aufgabe auf der Offboarding-Link-Seite einer Stelle
 * (G15, G17, G21; Feinplan 1.6) – `null` heisst: Der Schluessel fehlt an der
 * Aufgabe GANZ (die gepinnten Schluessellisten der Link-Seite bleiben gueltig).
 *
 *   - Ruecknahme- bzw. Sperraufgabe (`herkunft` AUSGABE): nur, wenn Aufgabe UND
 *     Ausgabe dieser Stelle gehoeren – die ausgebende Stelle sieht die Kennung
 *     nur an ihrer eigenen Aufgabe. Der Zustand kommt bei einem Gegenstand aus
 *     der Rueckgabe-Zeile DIESES Austritts (`rueckgabeZustand`: Stand beim
 *     Austritt, auch nachdem ein spaeterer Austritt das Stueck weiterfuehrt),
 *     sonst aus der erledigten Aufgabe und der Ausgabe (abgehakt = ZURUECK).
 *   - Folgeaufgabe (`herkunft` AUSGABE_FEHLT): nur fuer die Gebaeudewirtschaft
 *     (`FOLGE_STELLE`), nur lesend (`OffboardingFolgeAusgabe`, „fehlt“).
 *   - alles andere: `null`.
 */
export function offboardingLinkAusgabeBauen(opts: {
  departmentKey: string;
  aufgabe: { herkunft?: string | null; assigneeDepartment?: string | null; isCompleted: boolean };
  ausgabe:
    | {
        departmentKey: string;
        beiAustritt: string;
        kennung: string | null;
        kennungLabel?: string | null;
        uebergebenAm: Date | string | null;
        zustand: string;
      }
    | null
    | undefined;
  rueckgabe?: RueckgabeStand | null;
}): OffboardingLinkAusgabe | OffboardingFolgeAusgabe | null {
  const { departmentKey: key, aufgabe, ausgabe } = opts;
  if (!ausgabe || aufgabe.assigneeDepartment !== key || !enthalten(AUSGABE_BEI_AUSTRITT, ausgabe.beiAustritt)) return null;
  const art = ausgabe.beiAustritt;
  const kennungLabel = ausgabe.kennungLabel?.trim() || KENNUNG_LABEL_STANDARD;
  const kennung = ausgabe.kennung?.trim() || null;

  if (aufgabe.herkunft === "AUSGABE_FEHLT") {
    if (key !== FOLGE_STELLE) return null;
    return { art, kennungLabel, kennung, zustandLabel: AUSGABE_ZUSTAND_LABELS.FEHLT };
  }
  if (aufgabe.herkunft !== "AUSGABE" || ausgabe.departmentKey !== key) return null;

  let zustand: RueckgabeZustand | null;
  if (art === "RUECKGABE" && opts.rueckgabe) {
    zustand = rueckgabeZustand(opts.rueckgabe);
  } else if (!aufgabe.isCompleted) {
    zustand = null;
  } else {
    zustand = enthalten(RUECKGABE_ZUSTAENDE, ausgabe.zustand) ? ausgabe.zustand : "ZURUECK";
  }
  return {
    art,
    kennungLabel,
    kennung,
    uebergebenAm: kalendertagVon(ausgabe.uebergebenAm),
    zustand,
    zustandLabel: zustand ? ausgabeZustandLabel(zustand, art) : RUECKGABE_OFFEN_LABEL,
    auswahl: art === "RUECKGABE" ? RUECKNAHME_AUSWAHL : [],
  };
}

// =============================================
// Listen fuer Uebergabe- und Rueckgabeprotokoll (G19, 1.9)
// =============================================

/**
 * Ein Stueck fuer die Word-Listen. UEBERGABE: eine Ausgabe (`am` =
 * `uebergebenAm`; nur aktive kommen in die Liste). RUECKGABE: eine
 * Rueckgabe-Zeile (`am` = `returnedAt`, `zustand`/`isReturned` wie bei
 * `rueckgabeZustand`; `departmentKey` null = von HR erfasst).
 */
export interface ProtokollStueck {
  departmentKey: string | null;
  bezeichnung: string;
  kennung?: string | null;
  am?: Date | string | null;
  zustand?: string | null;
  isReturned?: boolean;
}

export interface UebergabeGegenstand {
  ausgabe_gegenstand: string;
  ausgabe_kennung: string;
  ausgabe_uebergeben_am: string;
}
export interface UebergabeStelle {
  ausgabe_stelle: string;
  gegenstaende: UebergabeGegenstand[];
}
export interface RueckgabeGegenstand {
  rueckgabe_gegenstand: string;
  rueckgabe_kennung: string;
  rueckgabe_zustand: string;
  rueckgabe_am: string;
}
export interface RueckgabeStelle {
  rueckgabe_stelle: string;
  gegenstaende: RueckgabeGegenstand[];
}

/**
 * Gruppen je Stelle fuer die Listen-Platzhalter `ausgaben_je_stelle` bzw.
 * `rueckgaben_je_stelle` (1.9) – eine Seite je Stelle im Protokoll (E-A34).
 * Stellen in der Reihenfolge der Abteilungskarte, die Personalabteilung
 * zuletzt; Stuecke nach Bezeichnung, dann Kennung. Jedes innere Feld ist
 * IMMER gesetzt ("" statt fehlend) – sonst griffe der Ausdrucks-Parser auf
 * gleichnamige Werte der Person zurueck oder setzte `___`. Eine offene
 * Rueckgabe hat einen leeren Zustand (zum Ausfuellen von Hand), ein Datum nur
 * eine zurueckgegebene.
 */
export function protokollStellen(
  stuecke: ReadonlyArray<ProtokollStueck>,
  stellenNamen: Readonly<Record<string, string>>,
  art: "UEBERGABE",
): UebergabeStelle[];
export function protokollStellen(
  stuecke: ReadonlyArray<ProtokollStueck>,
  stellenNamen: Readonly<Record<string, string>>,
  art: "RUECKGABE",
): RueckgabeStelle[];
export function protokollStellen(
  stuecke: ReadonlyArray<ProtokollStueck>,
  stellenNamen: Readonly<Record<string, string>>,
  art: ProtokollArt,
): UebergabeStelle[] | RueckgabeStelle[] {
  const liste = art === "UEBERGABE" ? nurAktive(stuecke) : [...stuecke];
  const gruppen = new Map<string, ProtokollStueck[]>();
  for (const s of liste) {
    const key = s.departmentKey?.trim() || DEPARTMENT_KEYS.HR;
    const gruppe = gruppen.get(key) ?? [];
    gruppe.push(s);
    gruppen.set(key, gruppe);
  }
  const sortiert = (key: string) =>
    [...(gruppen.get(key) ?? [])].sort(
      (a, b) =>
        a.bezeichnung.localeCompare(b.bezeichnung, "de") || (a.kennung ?? "").localeCompare(b.kennung ?? "", "de"),
    );
  const reihenfolge = stellenReihenfolge(gruppen.keys());

  if (art === "UEBERGABE") {
    return reihenfolge.map((key) => ({
      ausgabe_stelle: stelleName(key, stellenNamen),
      gegenstaende: sortiert(key).map((s) => ({
        ausgabe_gegenstand: s.bezeichnung,
        ausgabe_kennung: s.kennung?.trim() ?? "",
        ausgabe_uebergeben_am: tagText(s.am),
      })),
    }));
  }
  return reihenfolge.map((key) => ({
    rueckgabe_stelle: stelleName(key, stellenNamen),
    gegenstaende: sortiert(key).map((s) => {
      const zustand = rueckgabeZustand({ zustand: s.zustand, isReturned: s.isReturned ?? false });
      const zurueck = zustand === "ZURUECK" || zustand === "BESCHAEDIGT";
      return {
        rueckgabe_gegenstand: s.bezeichnung,
        rueckgabe_kennung: s.kennung?.trim() ?? "",
        rueckgabe_zustand: zustand ? ausgabeZustandLabel(zustand) : "",
        rueckgabe_am: zurueck ? tagText(s.am) : "",
      };
    }),
  }));
}
