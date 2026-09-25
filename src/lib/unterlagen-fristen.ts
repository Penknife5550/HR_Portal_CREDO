/**
 * CREDO HR-Portal – Unterlagen nachfordern: der taegliche Lauf als reine Regeln (Paket 4)
 *
 * WAS der Lauf `POST /api/cron/unterlagen-fristen` je Nachforderung tut, wird
 * HIER entschieden — ohne Datenbank, ohne Node-Module und ohne Uhr (`heute`
 * und `jetzt` kommen herein). WIE er es tut (Sperren, Links, Mails, Loeschen),
 * steht in src/lib/unterlagen-lauf.ts. Ein Probelauf (`?dryRun=1`) nimmt
 * DIESELBE Planung (`laufPlanen`) und schreibt nichts — so zeigt er genau das,
 * was der scharfe Lauf taete (Feinplanung docs/module/onboarding/
 * paket4-feinplanung.md, Abschnitt 9).
 *
 * Die Schritte je Nachforderung, in dieser Reihenfolge:
 *
 *   Z2  Der Vorgang wird nicht mehr bearbeitet (Onboarding: EXPIRED) und die
 *       Nachforderung LAEUFT → zurueckziehen wie „Zurückziehen", keine Mail.
 *       Sonst liefe sie fuer immer, und ihre ungeprueften Dateien wuerden nie
 *       geloescht (Abschnitt 18).
 *   1.  „Vollständig eingegangen" an HR nachholen (`vollstaendigMeldungFaellig`)
 *       — ueber den bedingten Anspruch, ein laufendes `after()` wird nicht
 *       verdoppelt.
 *   2.  Eine gescheiterte Mail an die Person nachholen (`personenMailNachholen`).
 *   3.  Erinnerung an die Person (`erinnerungFaellig` aus unterlagen.ts — DIESELBE
 *       Funktion wie im Lauf-Waechter, hier nur weitergereicht; zwei Fassungen
 *       liefen auseinander, und der Waechter meldete Fehlalarm).
 *       Hoechstens EINE Mail an die Person je Nachforderung und Lauf: Das
 *       Nachholen geht vor, die Erinnerung wartet dann bis morgen.
 *   4.  „Frist verstrichen" an HR (`fristMeldungFaellig`), einmal je Fristwert.
 *   5.  Aufraeumen nach Tabelle 4.5 (`aufraeumKandidaten`) — bei JEDER
 *       Nachforderung, auch ERLEDIGT und ZURUECKGEZOGEN.
 *
 * Bei einem eingestellten Vorgang geht keine Mail hinaus (EP-3); aufgeraeumt
 * wird trotzdem.
 */

import {
  AUSSTEHEND_NACHHOLEN_MINUTEN,
  GUELTIG_NACH_FRIST_TAGE,
  LOESCHEN_NACH_TAGEN,
  NACHHOL_MAX_VERSUCHE,
  NACHHOLBARE_ANLAESSE,
  entwurfLoeschenAb,
  erinnerungFaellig,
  nachforderungLinkende,
  wartetAufPerson,
  type ErinnerungsStand,
  type Kalendertag,
  type LinkAnlass,
  type UnterlagenErinnerungsStufe,
} from "@/lib/unterlagen";
import { ablaufKalendertag, tageSpaeter } from "@/lib/kalendertag";

/**
 * DIE Faelligkeitsregel der Erinnerung — definiert in unterlagen.ts, weil der
 * Lauf-Waechter der Karte sie mit `gestern` rechnet. Hier nur weitergereicht,
 * damit der Lauf sie an seinem eigenen Ort findet.
 */
export { erinnerungFaellig };

const MS_PRO_MINUTE = 60_000;

// =============================================
// Eingabe: der frisch gelesene Stand einer Nachforderung
// =============================================

/** Eine Mail an die Person (Link-Zeile) — die Felder heissen wie die Spalten. */
export interface LaufLink {
  id: string;
  anlass: string;
  mailStatus: string;
  gesendetAm: Date | string | null;
  createdAt: Date | string;
  nachholVersuche: number;
  /** Bei ZURUECKWEISUNG: die zurueckgewiesene Position. */
  positionId: string | null;
  entwertetAm: Date | string | null;
  entwertetGrund: string | null;
  /** „frühere Links sperren" (erneut senden) — gilt auch fuer die nachgeholte Mail. */
  fruehereSperren?: boolean;
}

/** Eine Datei der Nachforderung, soweit Aufraeumen und Erinnerung sie brauchen. */
export interface LaufDatei {
  id: string;
  positionId: string;
  status: string;
  loeschenAb: Date | string | null;
  dateiGeloeschtAm: Date | string | null;
  hochgeladenAm: Date | string;
}

/**
 * Was die Planung von einer Nachforderung liest. Die Prisma-Zeile des Laufs
 * erfuellt die Schnittstelle direkt (Muster `ErinnerungsStand`).
 */
export interface LaufStand extends ErinnerungsStand {
  id: string;
  fristGemeldetFuer: Date | string | null;
  vollstaendigSeit: Date | string | null;
  vollstaendigGemeldetAm: Date | string | null;
  positionen: ReadonlyArray<{ id: string; status: string; angefordertAm?: Date | string | null }>;
  dateien: ReadonlyArray<LaufDatei>;
  links: ReadonlyArray<LaufLink>;
}

function alsDatum(wert: Date | string | null | undefined): Date | null {
  if (wert == null) return null;
  const d = wert instanceof Date ? wert : new Date(wert);
  return Number.isNaN(d.getTime()) ? null : d;
}

function zeit(wert: Date | string | null | undefined): number {
  return alsDatum(wert)?.getTime() ?? Number.NEGATIVE_INFINITY;
}

// =============================================
// Schritt 1 und 4: die HR-Meldungen
// =============================================

/**
 * „Vollständig eingegangen" an HR nachholen: Die Nachforderung laeuft, der
 * Merker `vollstaendigSeit` steht, gemeldet ist noch nichts (die Mail nach
 * dem Uebermitteln scheiterte oder kam nie dazu). Wer die Mail wirklich
 * schickt, entscheidet der bedingte Anspruch (Abschnitt 7).
 */
export function vollstaendigMeldungFaellig(
  stand: Pick<LaufStand, "status" | "vollstaendigSeit" | "vollstaendigGemeldetAm">,
): boolean {
  return stand.status === "LAUFEND" && !!alsDatum(stand.vollstaendigSeit) && !alsDatum(stand.vollstaendigGemeldetAm);
}

/**
 * „Frist verstrichen" an HR (Abschnitt 9, Schritt 4): heute > Frist, noch
 * wartet etwas auf die Person, und fuer DIESEN Fristwert ging noch keine
 * Meldung hinaus — eine verlaengerte Frist meldet also erneut. Ist nur noch
 * die Pruefung durch HR offen, ist die Person nicht saeumig: keine Mail. Nie
 * zugestellt ist kein Hindernis — dann traegt die Mail `nie_zugestellt`.
 */
export function fristMeldungFaellig(
  stand: Pick<LaufStand, "status" | "frist" | "fristGemeldetFuer" | "positionen">,
  heute: Kalendertag,
): boolean {
  if (stand.status !== "LAUFEND") return false;
  const frist = ablaufKalendertag(stand.frist);
  if (!frist || heute <= frist) return false;
  if (!stand.positionen.some((p) => wartetAufPerson(p.status))) return false;
  return ablaufKalendertag(stand.fristGemeldetFuer) !== frist;
}

// =============================================
// Schritt 2: eine Mail an die Person nachholen
// =============================================

/** Anlaesse, die der Lauf nachholt — Erinnerungen holt der nicht gesetzte Merker nach. */
export type NachholAnlass = "ANFORDERUNG" | "ERGAENZUNG" | "ERNEUT" | "FRISTAENDERUNG" | "ZURUECKWEISUNG";

function istNachholAnlass(anlass: string): anlass is NachholAnlass {
  return (NACHHOLBARE_ANLAESSE as readonly string[]).includes(anlass);
}

export interface NachholPlan {
  art: "NACHHOLEN";
  /** Die juengste Mail an die Person, die nicht ankam. */
  linkId: string;
  /** Derselbe Anlass fuer den neuen Link und die Mail. */
  anlass: NachholAnlass;
  /** Nur bei ZURUECKWEISUNG: die zurueckgewiesene Position. */
  positionId: string | null;
  /** Der wievielte Nachholversuch das ist (1 bis 3) — steht am NEUEN Link. */
  versuch: number;
  /**
   * Stand die alte Mail seit ueber einer Stunde auf AUSSTEHEND (Absturz
   * zwischen Link und Versand)? Dann traegt ihr Link „kein Ergebnis" (FAILED),
   * damit der Mailverlauf nicht fuer immer „wird gesendet" zeigt.
   */
  abgebrochen: boolean;
  /** Beim Ergaenzen: die Positionen dieser Ergaenzung — sie tragen in der Mail „(neu)". */
  neuePositionen: string[];
  /**
   * HR wollte mit dieser Mail die frueheren Links sperren (erneut senden, 5.1):
   * Der neue Link traegt den Wunsch weiter, und nach SENT sperrt der Lauf —
   * sonst blieben Links gueltig, die HR ausdruecklich sperren wollte.
   */
  fruehereSperren: boolean;
}

/**
 * Soll der Lauf eine Mail an die Person nachholen (Abschnitt 9, Schritt 2)?
 *
 *   - Die JUENGSTE Mail an die Person ist FAILED oder steht seit ueber einer
 *     Stunde auf AUSSTEHEND. SKIPPED wird nie nachgeholt (Vorlage aus, kein
 *     Empfaenger — morgen aendert sich daran nichts). Kam nach der
 *     gescheiterten eine andere an, ist nichts nachzuholen.
 *   - Ihr Anlass ist Aufforderung, Ergaenzung, erneut senden, Friständerung
 *     oder Zurueckweisung — Erinnerungen holt der Merker nach.
 *   - Hoechstens drei Versuche (`nachholVersuche` der juengsten Mail < 3);
 *     danach zeigt die Karte „nicht zustellbar – Adresse prüfen".
 *   - Die Person hat noch etwas zu tun — bei der Zurueckweisung: GENAU diese
 *     Position steht noch auf ZURUECKGEWIESEN.
 *   - heute ≤ Frist + 14: Nach dem Linkende enthielte die Mail einen toten Link.
 */
export function personenMailNachholen(
  stand: Pick<LaufStand, "status" | "frist" | "positionen" | "links">,
  heute: Kalendertag,
  jetzt: Date,
): NachholPlan | null {
  if (stand.status !== "LAUFEND") return null;
  // Bei gleicher Zeit gilt die spaeter gelesene (die Abfrage sortiert nach createdAt).
  const juengste = stand.links.reduce<LaufLink | null>(
    (bisher, l) => (!bisher || zeit(l.createdAt) >= zeit(bisher.createdAt) ? l : bisher),
    null,
  );
  if (!juengste || !istNachholAnlass(juengste.anlass)) return null;

  const abgebrochen =
    juengste.mailStatus === "AUSSTEHEND" &&
    jetzt.getTime() - zeit(juengste.createdAt) > AUSSTEHEND_NACHHOLEN_MINUTEN * MS_PRO_MINUTE;
  if (juengste.mailStatus !== "FAILED" && !abgebrochen) return null;
  if (juengste.nachholVersuche >= NACHHOL_MAX_VERSUCHE) return null;

  const ende = nachforderungLinkende(stand.frist);
  if (!ende || heute > ende) return null;

  if (juengste.anlass === "ZURUECKWEISUNG") {
    const position = stand.positionen.find((p) => p.id === juengste.positionId);
    if (!position || position.status !== "ZURUECKGEWIESEN") return null;
  } else if (!stand.positionen.some((p) => wartetAufPerson(p.status))) {
    return null;
  }

  // Die Ergaenzung legt ihre Positionen im selben Augenblick an wie ihren Link
  // (unterlagen-dienst.ts: beide mit `jetzt`) — seither angeforderte, die noch
  // warten, sind „(neu)".
  const seit = zeit(juengste.createdAt);
  const neuePositionen =
    juengste.anlass === "ERGAENZUNG"
      ? stand.positionen.filter((p) => wartetAufPerson(p.status) && zeit(p.angefordertAm) >= seit).map((p) => p.id)
      : [];

  return {
    art: "NACHHOLEN",
    linkId: juengste.id,
    anlass: juengste.anlass,
    positionId: juengste.anlass === "ZURUECKWEISUNG" ? juengste.positionId : null,
    versuch: juengste.nachholVersuche + 1,
    abgebrochen,
    neuePositionen,
    fruehereSperren: juengste.fruehereSperren === true,
  };
}

// =============================================
// Schritt 3: die Erinnerung
// =============================================

export interface ErinnerungsPlan {
  art: "ERINNERUNG";
  stufe: UnterlagenErinnerungsStufe;
  /** Merker `entwurf_vorhanden` der Mail (`entwurfVorhanden`). */
  entwurfVorhanden: boolean;
}

/** Der Link-Anlass einer Erinnerung. */
export function erinnerungsAnlass(stufe: UnterlagenErinnerungsStufe): LinkAnlass {
  return stufe === "VORAB" ? "ERINNERUNG_VORAB" : "ERINNERUNG_FRISTTAG";
}

/**
 * Hat die Person Dateien hochgeladen, aber noch nicht uebermittelt? Nur
 * Entwuerfe zu Positionen, die noch auf sie warten, und nur ihre EIGENEN:
 * nach dem letzten Adresswechsel hochgeladen (dieselbe Grenze wie die
 * Upload-Seite, unterlagen-upload.ts). Was ueber einen Link an die alte
 * Adresse kam, gehoert womoeglich jemand anderem — die Erinnerung an die neue
 * Adresse sagt dazu nichts.
 */
export function entwurfVorhanden(stand: Pick<LaufStand, "positionen" | "dateien" | "links">): boolean {
  let ab = Number.NEGATIVE_INFINITY;
  for (const l of stand.links) {
    if (l.entwertetGrund === "ADRESSE" && alsDatum(l.entwertetAm)) ab = Math.max(ab, zeit(l.entwertetAm));
  }
  const wartend = new Set(stand.positionen.filter((p) => wartetAufPerson(p.status)).map((p) => p.id));
  return stand.dateien.some((d) => d.status === "ENTWURF" && wartend.has(d.positionId) && zeit(d.hochgeladenAm) > ab);
}

// =============================================
// Schritt 5: Aufraeumen (Tabelle 4.5)
// =============================================

export interface AufraeumKandidaten {
  /**
   * Zurueckgewiesene und verworfene Dateien, deren `loeschenAb` erreicht ist
   * und die noch nicht geloescht sind — nach Faelligkeit. Die Zeile bleibt
   * als Nachweis, sie bekommt nur `dateiGeloeschtAm`.
   */
  dateien: string[];
  /**
   * Entwuerfe, die nie uebermittelt wurden, ab Linkende + 30 Tagen — aus der
   * AKTUELLEN Frist gerechnet (eine verlaengerte Frist rettet sie). Zeile UND
   * Datei gehen; die Zeile zuerst und bedingt, sonst verloere ein
   * gleichzeitiges Uebermitteln seine Datei.
   */
  entwuerfe: string[];
}

/**
 * Die spaeteste Frist, deren Entwuerfe heute faellig sind (heute − 14 − 30).
 * Die Grenze der Abfrage im Lauf (N3: Faelligkeit IN der Abfrage) — dieselbe
 * Rechnung wie `entwurfLoeschenAb`: Fuer diese Frist ergibt sie genau heute.
 */
export function entwurfFaelligBisFrist(heute: Kalendertag): Kalendertag {
  return tageSpaeter(heute, -(GUELTIG_NACH_FRIST_TAGE + LOESCHEN_NACH_TAGEN));
}

/**
 * Was heute zu loeschen ist (4.5). `ANGENOMMEN` ist umgezogen, dort gelten die
 * Regeln des Moduls; `EINGEREICHT` wartet auf HR und bleibt. Die Waisen auf
 * der Platte sucht der Lauf selbst — sie haben keine Zeile.
 */
export function aufraeumKandidaten(
  stand: Pick<LaufStand, "frist" | "dateien">,
  heute: Kalendertag,
  jetzt: Date,
): AufraeumKandidaten {
  const faellig = stand.dateien
    .filter(
      (d) =>
        (d.status === "ZURUECKGEWIESEN" || d.status === "VERWORFEN") &&
        !alsDatum(d.dateiGeloeschtAm) &&
        !!alsDatum(d.loeschenAb) &&
        zeit(d.loeschenAb) <= jetzt.getTime(),
    )
    .sort((a, b) => zeit(a.loeschenAb) - zeit(b.loeschenAb) || a.id.localeCompare(b.id));

  const ab = entwurfLoeschenAb(stand.frist);
  const entwuerfe =
    ab && heute >= ab
      ? stand.dateien
          .filter((d) => d.status === "ENTWURF")
          .sort((a, b) => zeit(a.hochgeladenAm) - zeit(b.hochgeladenAm) || a.id.localeCompare(b.id))
      : [];

  return { dateien: faellig.map((d) => d.id), entwuerfe: entwuerfe.map((d) => d.id) };
}

// =============================================
// Die Planung
// =============================================

export interface LaufPlan {
  /** Z2: LAUFEND bei eingestelltem Vorgang → zurueckziehen, keine Mail. */
  zurueckziehen: boolean;
  /** Schritt 1 */
  vollstaendigMelden: boolean;
  /** Schritt 2 oder 3 — hoechstens EINE Mail an die Person, das Nachholen zuerst. */
  personenMail: NachholPlan | ErinnerungsPlan | null;
  /** Schritt 4 */
  fristMelden: boolean;
  /** Schritt 5 */
  aufraeumen: AufraeumKandidaten;
}

/**
 * Plant den Lauf fuer EINE Nachforderung — der scharfe Lauf und der
 * Probelauf rufen dieselbe Funktion.
 *
 * `vorgangEingestellt` (Onboarding: EXPIRED): keine Mails (EP-3); eine
 * laufende Nachforderung wird zurueckgezogen (Z2). Ihre Entwuerfe loescht das
 * Zurueckziehen selbst — sie stehen deshalb nicht noch einmal im Aufraeumen.
 * Ohne `LAUFEND` (erledigt, zurueckgezogen) gibt es nur das Aufraeumen.
 */
export function laufPlanen(
  stand: LaufStand,
  kontext: { heute: Kalendertag; jetzt: Date; vorgangEingestellt: boolean },
): LaufPlan {
  const { heute, jetzt } = kontext;
  const laufend = stand.status === "LAUFEND";
  const aufraeumen = aufraeumKandidaten(stand, heute, jetzt);

  if (!laufend || kontext.vorgangEingestellt) {
    const zurueckziehen = laufend && kontext.vorgangEingestellt;
    return {
      zurueckziehen,
      vollstaendigMelden: false,
      personenMail: null,
      fristMelden: false,
      aufraeumen: zurueckziehen ? { dateien: aufraeumen.dateien, entwuerfe: [] } : aufraeumen,
    };
  }

  const nachholen = personenMailNachholen(stand, heute, jetzt);
  const stufe = nachholen ? null : erinnerungFaellig(stand, heute);
  return {
    zurueckziehen: false,
    vollstaendigMelden: vollstaendigMeldungFaellig(stand),
    personenMail:
      nachholen ?? (stufe ? { art: "ERINNERUNG", stufe, entwurfVorhanden: entwurfVorhanden(stand) } : null),
    fristMelden: fristMeldungFaellig(stand, heute),
    aufraeumen,
  };
}
