/**
 * Die Fristen und Wirkungsdaten rund um die Befreiung von der
 * Rentenversicherungspflicht — Abschnitt 5 der Minijob-Checkliste, AP 12.
 *
 * ## Warum Zeichenketten und keine Date-Objekte
 *
 * Alle Regeln hier setzen auf dem **Kalendermonat** auf. Ein `Date` traegt eine
 * Uhrzeit und eine Zeitzone mit sich; ein Fragebogen, der am 01.09. um 00:30 Uhr
 * MESZ abgesendet wird, ist in UTC der 31.08. Bei einer Monatsregel verschiebt
 * das das Ergebnis um einen vollen Monat — und damit die Beitragspflicht.
 *
 * Deshalb rechnet dieses Modul ausschliesslich mit `YYYY-MM-DD`-Zeichenketten
 * und eigener Kalenderarithmetik. Der Zeitzonenfehler kann hier gar nicht
 * entstehen, statt nur vermieden zu werden.
 *
 * ## Warum Monate und keine Tage
 *
 * „Ein Monat spaeter" ist nicht „30 Tage spaeter": Der 31.01. plus 30 Tage ist
 * der 02.03., richtig ist der 01.02. Und die Monatsfrist nach § 188 Abs. 2 BGB
 * endet an dem Tag des Folgemonats, der dem Eingangstag entspricht — fehlt
 * dieser Tag (Eingang am 31.01.), endet sie am letzten Tag des Folgemonats.
 *
 * ## Was dieses Modul NICHT tut
 *
 * Es trifft keine Entscheidung. Alle Ergebnisse sind **Vorschlaege mit
 * Begruendung**, die HR bestaetigt oder ueberschreibt. Die Daten haben
 * unmittelbare Beitragsfolgen (3,6 % Arbeitnehmeranteil, Nacherhebung in der
 * Betriebspruefung nach § 28p SGB IV); eine Software, die sie still setzt,
 * nimmt eine Verantwortung auf sich, die sie nicht tragen kann.
 *
 * Wo der amtliche Text mehrdeutig ist, wird das ausgewiesen (`hinweise`), statt
 * eine Regel zu erfinden.
 */

/** Ein Kalendertag als `YYYY-MM-DD`. */
export type Kalendertag = string;

const TAG_MUSTER = /^(\d{4})-(\d{2})-(\d{2})$/;

export function istKalendertag(wert: unknown): wert is Kalendertag {
  if (typeof wert !== "string" || !TAG_MUSTER.test(wert)) return false;
  const [j, m, t] = zerlege(wert);
  return m >= 1 && m <= 12 && t >= 1 && t <= tageImMonat(j, m);
}

function zerlege(tag: Kalendertag): [number, number, number] {
  const m = TAG_MUSTER.exec(tag);
  if (!m) throw new Error(`Kein gültiges Datum: ${tag}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function baue(jahr: number, monat: number, tag: number): Kalendertag {
  // Ueberall sonst kommen die Werte aus `zerlege()` und sind damit ganzzahlig.
  // Der Abrechnungstag kommt dagegen von aussen — ein krummer Wert erzeugte
  // hier frueher eine Zeichenkette wie "2026-08-15.5", die kein Kalendertag
  // mehr ist und beim naechsten `zerlege()` wirft. Als Flaschenhals aller
  // Datumserzeugung prueft diese Funktion das jetzt selbst.
  if (!Number.isInteger(jahr) || !Number.isInteger(monat) || !Number.isInteger(tag)) {
    throw new Error(`Kein gültiges Datum: ${jahr}-${monat}-${tag}`);
  }
  const jj = String(jahr).padStart(4, "0");
  const mm = String(monat).padStart(2, "0");
  const tt = String(tag).padStart(2, "0");
  return `${jj}-${mm}-${tt}`;
}

function istSchaltjahr(jahr: number): boolean {
  return (jahr % 4 === 0 && jahr % 100 !== 0) || jahr % 400 === 0;
}

export function tageImMonat(jahr: number, monat: number): number {
  const laengen = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (monat === 2 && istSchaltjahr(jahr)) return 29;
  return laengen[monat - 1];
}

/** Der erste Tag des Monats, in dem dieser Tag liegt. */
export function ersterTagDesMonats(tag: Kalendertag): Kalendertag {
  const [j, m] = zerlege(tag);
  return baue(j, m, 1);
}

/**
 * Verschiebt um ganze Monate.
 *
 * Der Tag bleibt erhalten, soweit es ihn im Zielmonat gibt — sonst wird auf den
 * letzten Tag gekappt (31.01. plus 1 Monat = 28. bzw. 29.02.).
 */
export function monateSpaeter(tag: Kalendertag, anzahl: number): Kalendertag {
  const [j, m, t] = zerlege(tag);
  const gesamt = (j * 12 + (m - 1)) + anzahl;
  const zielJahr = Math.floor(gesamt / 12);
  const zielMonat = (gesamt % 12) + 1;
  return baue(zielJahr, zielMonat, Math.min(t, tageImMonat(zielJahr, zielMonat)));
}

/** Verschiebt um ganze Tage. */
export function tageSpaeter(tag: Kalendertag, anzahl: number): Kalendertag {
  let [j, m, t] = zerlege(tag);
  t += anzahl;
  while (t > tageImMonat(j, m)) {
    t -= tageImMonat(j, m);
    m += 1;
    if (m > 12) { m = 1; j += 1; }
  }
  while (t < 1) {
    m -= 1;
    if (m < 1) { m = 12; j -= 1; }
    t += tageImMonat(j, m);
  }
  return baue(j, m, t);
}

/** Vergleicht zwei Kalendertage: negativ, wenn a vor b liegt. */
export function vergleiche(a: Kalendertag, b: Kalendertag): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function frueher(a: Kalendertag, b: Kalendertag): Kalendertag {
  return a <= b ? a : b;
}

export function spaeter(a: Kalendertag, b: Kalendertag): Kalendertag {
  return a >= b ? a : b;
}

/** Anzeigeform `TT.MM.JJJJ`. */
export function formatiere(tag: Kalendertag | null | undefined): string {
  if (!tag || !istKalendertag(tag)) return "—";
  const [j, m, t] = zerlege(tag);
  return `${String(t).padStart(2, "0")}.${String(m).padStart(2, "0")}.${j}`;
}

/**
 * Der Berliner Kalendertag zu einem Zeitstempel.
 *
 * Bewusst ueber `Intl`, nicht ueber `toISOString()`: Letzteres liefert UTC und
 * waere zwischen Mitternacht und 1 bzw. 2 Uhr morgens der Vortag.
 *
 * **Diese Funktion ist die Systemgrenze.** Zeitstempel aus der Datenbank
 * (`DateTime` ohne `@db.Date`) muessen hier hindurch, bevor sie in eine der
 * Regeln unten gehen. Wer stattdessen `toISOString().slice(0, 10)` nimmt, holt
 * sich genau den Zeitzonenfehler zurueck, zu dessen Vermeidung dieses Modul mit
 * Zeichenketten rechnet — und weil alle Regeln auf dem Kalendermonat aufsetzen,
 * kostet das einen ganzen Monat, nicht einen Tag.
 *
 * Fuer echte `date`-Spalten ist der direkte Weg dagegen richtig: Sie kommen als
 * UTC-Mitternacht an und tragen gar keine Ortszeit.
 */
export function berlinerKalendertag(zeitpunkt: Date): Kalendertag {
  // en-CA liefert bereits YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(zeitpunkt);
}

/** Der heutige Kalendertag in Europe/Berlin. */
export function heuteInBerlin(jetzt: Date = new Date()): Kalendertag {
  return berlinerKalendertag(jetzt);
}

/**
 * Faellt ein Fristende auf einen Sonnabend oder Sonntag, endet die Frist erst
 * mit Ablauf des naechsten Werktages (§ 26 Abs. 3 SGB X).
 *
 * **Feiertage bleiben aussen vor.** Sie sind laenderspezifisch und haengen am
 * Ort der Einzugsstelle, den das Portal nicht kennt. Das angezeigte Ende kann
 * also noch etwas spaeter liegen — in die ungefaehrliche Richtung, denn ein zu
 * frueh angezeigtes Fristende bei der Widerspruchsfrist hiesse, eine
 * Genehmigungsfiktion anzunehmen, die noch gar nicht eingetreten ist.
 */
export function naechsterWerktag(tag: Kalendertag): Kalendertag {
  const wochentag = wochentagVon(tag);
  if (wochentag === 6) return tageSpaeter(tag, 2); // Sonnabend -> Montag
  if (wochentag === 0) return tageSpaeter(tag, 1); // Sonntag -> Montag
  return tag;
}

/** 0 = Sonntag, 1 = Montag, ... 6 = Sonnabend. Ohne Date, ohne Zeitzone. */
export function wochentagVon(tag: Kalendertag): number {
  // Der 01.01.0001 des proleptisch-gregorianischen Kalenders war ein Montag;
  // `tageZwischen` zaehlt ab dem Nullpunkt derselben Rechnung.
  const bezug = "2026-08-31"; // ein Montag, nachgerechnet
  const abstand = tageZwischen(bezug, tag);
  return ((((abstand + 1) % 7) + 7) % 7);
}

// =============================================
// Wirkungsdatum
// =============================================

export interface Berechnung {
  /** Der Vorschlag — null, wenn eine Eingangsgroesse fehlt. */
  datum: Kalendertag | null;
  /** Woraus er sich ergibt, in einem Satz fuer die Oberflaeche. */
  begruendung: string;
  /** Wo der amtliche Text schweigt oder mehrdeutig ist. */
  hinweise: string[];
}

/**
 * Wann die Befreiung wirkt — Regelfall.
 *
 * „Die Befreiung wirkt grundsätzlich ab Beginn des Kalendermonats des Eingangs
 * bei der Arbeitgeberin/dem Arbeitgeber, frühestens ab Beschäftigungsbeginn."
 * (Merkblatt, Seite 7)
 *
 * Das „grundsätzlich" ist kein Fuellwort: Der Satz gilt nur, wenn der
 * Arbeitgeber fristgerecht meldet. Sonst greift `wirkungBefreiungVerspaetet`.
 */
export function wirkungBefreiung(
  eingangBeimArbeitgeber: Kalendertag | null,
  beschaeftigungsbeginn: Kalendertag | null
): Berechnung {
  const hinweise: string[] = [];

  if (!eingangBeimArbeitgeber) {
    return {
      datum: null,
      begruendung:
        "Das Eingangsdatum des unterschriebenen Antrags fehlt — ohne es lässt " +
        "sich das Wirkungsdatum nicht bestimmen.",
      hinweise,
    };
  }
  if (!beschaeftigungsbeginn) {
    return {
      datum: null,
      begruendung:
        "Der Beschäftigungsbeginn fehlt. Er ist die Untergrenze: Die Befreiung " +
        "wirkt frühestens ab diesem Tag.",
      hinweise,
    };
  }

  const monatsErster = ersterTagDesMonats(eingangBeimArbeitgeber);
  const datum = spaeter(monatsErster, beschaeftigungsbeginn);

  const begruendung =
    datum === monatsErster
      ? `Erster Tag des Monats, in dem der Antrag eingegangen ist (${formatiere(eingangBeimArbeitgeber)}).`
      : `Beschäftigungsbeginn (${formatiere(beschaeftigungsbeginn)}) — er liegt nach dem Monatsersten und bildet die Untergrenze.`;

  hinweise.push(
    "Gilt nur, wenn die Meldung an die Minijob-Zentrale fristgerecht erfolgt. " +
      "Andernfalls verschiebt sich die Wirkung."
  );
  hinweise.push(
    "Die Befreiung wirkt außerdem nur, sofern die Minijob-Zentrale nicht " +
      "innerhalb eines Monats widerspricht."
  );

  return { datum, begruendung, hinweise };
}

/**
 * Wann die Befreiung wirkt, wenn die Meldefrist versaeumt wurde.
 *
 * „Anderenfalls beginnt die Befreiung erst nach Ablauf des Kalendermonats, der
 * dem Kalendermonat des Eingangs der Meldung bei der Minijob-Zentrale folgt."
 * (Merkblatt, Seite 7)
 *
 * Eingangsmonat M -> der folgende Monat M+1 -> Wirkung nach dessen Ablauf,
 * also am Ersten von M+2.
 */
export function wirkungBefreiungVerspaetet(
  meldungBeiMinijobzentrale: Kalendertag | null,
  beschaeftigungsbeginn?: Kalendertag | null
): Berechnung {
  if (!meldungBeiMinijobzentrale) {
    return {
      datum: null,
      begruendung:
        "Das Datum der Meldung an die Minijob-Zentrale fehlt — ohne es lässt " +
        "sich die verschobene Wirkung nicht bestimmen.",
      hinweise: [],
    };
  }
  const verschoben = monateSpaeter(
    ersterTagDesMonats(meldungBeiMinijobzentrale),
    2
  );

  // Das „frühestens ab Beschäftigungsbeginn" steht im selben Absatz und wird
  // durch das „Anderenfalls … erst" nicht aufgehoben: „erst" schiebt den Beginn
  // nach hinten, es setzt ihn nicht neu. Ohne diese Untergrenze koennte im
  // Onboarding — wo der Antrag regelmaessig lange vor dem ersten Arbeitstag
  // eingeht — ein Wirkungsdatum VOR Beschaeftigungsbeginn gedruckt werden.
  const datum = beschaeftigungsbeginn
    ? spaeter(verschoben, beschaeftigungsbeginn)
    : verschoben;

  const hinweise = [
    "Für die Monate zwischen dem gewollten und dem tatsächlichen Beginn " +
      "besteht volle Rentenversicherungspflicht; der Arbeitnehmeranteil ist " +
      "abzuführen.",
  ];
  if (!beschaeftigungsbeginn) {
    hinweise.push(
      "Der Beschäftigungsbeginn ist nicht bekannt. Er ist auch hier die " +
        "Untergrenze — bitte prüfen, ob das Datum davor liegt."
    );
  }

  return {
    datum,
    begruendung:
      datum === verschoben
        ? `Die Meldung ging am ${formatiere(meldungBeiMinijobzentrale)} ein. Die ` +
          `Befreiung beginnt nach Ablauf des Folgemonats, also am Ersten des ` +
          `übernächsten Monats.`
        : `Beschäftigungsbeginn (${formatiere(beschaeftigungsbeginn)}) — er liegt ` +
          `nach dem verschobenen Beginn (${formatiere(verschoben)}) und bildet ` +
          `die Untergrenze.`,
    hinweise,
  };
}

/**
 * Wann die Aufhebung der Befreiung wirkt.
 *
 * „... erst ab Beginn des Kalendermonats, der auf den Monat meiner
 * Antragstellung folgt" (Antragstext, Seite 9). Deshalb sind im Vordruck die
 * beiden Tagesstellen fest mit „0" und „1" bedruckt: Es ist immer der
 * Monatserste.
 *
 * **Keine Analogie zur Befreiung.** Der amtliche Text nennt fuer die Aufhebung
 * weder ein „fruehestens ab Beschaeftigungsbeginn" noch eine Meldefrist noch
 * eine Wirkungsverschiebung. Diese drei gelten nur fuer die Befreiung; sie hier
 * anzuwenden waere hinzuerfundenes Recht.
 */
export function wirkungAufhebung(
  antragstellung: Kalendertag | null,
  beschaeftigungsbeginn?: Kalendertag | null
): Berechnung {
  if (!antragstellung) {
    return {
      datum: null,
      begruendung:
        "Das Datum der Antragstellung fehlt — ohne es lässt sich die Wirkung " +
        "nicht bestimmen.",
      hinweise: [],
    };
  }

  const datum = monateSpaeter(ersterTagDesMonats(antragstellung), 1);
  const hinweise: string[] = [];

  // Der Text loest diesen Fall nicht auf; er unterstellt eine bereits laufende
  // Beschaeftigung. Nicht stillschweigend korrigieren, sondern vorlegen.
  if (beschaeftigungsbeginn && datum < beschaeftigungsbeginn) {
    hinweise.push(
      `Das berechnete Wirkungsdatum liegt vor dem Beschäftigungsbeginn ` +
        `(${formatiere(beschaeftigungsbeginn)}). Der amtliche Text sieht für die ` +
        `Aufhebung keine Untergrenze vor — bitte prüfen.`
    );
  }

  hinweise.push(
    "Der amtliche Text knüpft an die „Antragstellung“ an, der Vordruck erfasst " +
      "aber den Eingang beim Arbeitgeber. Solange beide im selben Monat liegen, " +
      "ist das folgenlos — sonst bitte prüfen, welcher Monat gilt."
  );
  hinweise.push(
    "Die Aufhebung gilt als wirksam, wenn die Einzugsstelle nicht innerhalb " +
      "eines Monats nach Eingang der Arbeitgeber-Meldung widerspricht."
  );

  return {
    datum,
    begruendung:
      `Erster Tag des Monats, der auf den Monat der Antragstellung ` +
      `(${formatiere(antragstellung)}) folgt. Die Aufhebung wirkt nie ` +
      `rückwirkend und immer zum Monatsersten.`,
    hinweise,
  };
}

/**
 * Die eine Wirkungsregel der Befreiung — mit der Fallentscheidung.
 *
 * Der amtliche Text ist EIN Satzgefuege: „Die Befreiung wirkt grundsätzlich …
 * Voraussetzung ist, dass … meldet. Anderenfalls beginnt die Befreiung erst …"
 * Im Code zerfaellt das in zwei Funktionen mit verschiedenen Eingangsgroessen —
 * und damit in die Frage, welche der Aufrufer nehmen muss. Diese Frage soll er
 * gar nicht erst beantworten muessen: Hier steht die Entscheidung.
 *
 * Solange die Meldung nicht erfasst ist, gilt der Regelfall — mit dem Hinweis,
 * dass er unter Vorbehalt steht.
 */
export function wirkungDerBefreiung(opts: {
  eingangBeimArbeitgeber: Kalendertag | null;
  beschaeftigungsbeginn: Kalendertag | null;
  meldungBeiMinijobzentrale: Kalendertag | null;
  meldefrist: Kalendertag | null;
}): Berechnung & { verspaetet: boolean } {
  const verspaetet = Boolean(
    opts.meldungBeiMinijobzentrale &&
      opts.meldefrist &&
      opts.meldungBeiMinijobzentrale > opts.meldefrist
  );

  if (verspaetet) {
    return {
      ...wirkungBefreiungVerspaetet(
        opts.meldungBeiMinijobzentrale,
        opts.beschaeftigungsbeginn
      ),
      verspaetet: true,
    };
  }

  return {
    ...wirkungBefreiung(opts.eingangBeimArbeitgeber, opts.beschaeftigungsbeginn),
    verspaetet: false,
  };
}

// =============================================
// Meldefrist des Arbeitgebers
// =============================================

export type Fristquelle = "ENTGELTABRECHNUNG" | "SECHS_WOCHEN";

export interface Meldefrist extends Berechnung {
  /** Welcher der beiden Termine bindet. */
  quelle: Fristquelle | null;
  /**
   * Der Abrechnungstermin ist nicht hinterlegt — die Frist kann in Wirklichkeit
   * frueher enden als angezeigt.
   */
  unvollstaendig: boolean;
}

/**
 * Bis wann der Arbeitgeber die Befreiung der Minijob-Zentrale melden muss.
 *
 * „... bis zur nächsten Entgeltabrechnung, spätestens innerhalb von 6 Wochen
 * nach Eingang des Befreiungsantrages bei ihm ..." (Merkblatt, Seite 7)
 *
 * Es gelten **zwei** Termine, und der **fruehere** bindet. „Spaetestens" macht
 * die sechs Wochen zur Obergrenze, nicht zur Frist. Eine Ampel, die nur sechs
 * Wochen zaehlt, steht bei einem Eingang zu Monatsbeginn noch auf Gruen,
 * waehrend die Frist ueber die Entgeltabrechnung laengst abgelaufen ist.
 *
 * Fehlt der Abrechnungstermin des Mandanten, wird nur die Sechs-Wochen-Grenze
 * ausgewiesen — sichtbar als `unvollstaendig`.
 */
export function meldefristEnde(
  eingangBeimArbeitgeber: Kalendertag | null,
  abrechnungstag: number | null | undefined,
  beschaeftigungsbeginn?: Kalendertag | null
): Meldefrist {
  // Genau EINE Pruefung, aus der sowohl die Rechnung als auch die
  // Verlaesslichkeitsangabe folgt. Vorher standen beide getrennt da und liefen
  // bei einem Wert ausserhalb 1..31 auseinander: Die Funktion warnte im
  // `hinweise`-Feld, meldete aber `unvollstaendig: false` — eine Maske, die das
  // Badge an das Flag haengt, haette die Warnung unterdrueckt. Ein nicht
  // ganzzahliger Wert kam sogar durch und erzeugte ein kaputtes Datum
  // ("2026-08-5.7"). Das Feld hat kein DB-Constraint.
  const brauchbar =
    typeof abrechnungstag === "number" &&
    Number.isInteger(abrechnungstag) &&
    abrechnungstag >= 1 &&
    abrechnungstag <= 31;

  if (!eingangBeimArbeitgeber) {
    return {
      datum: null,
      quelle: null,
      unvollstaendig: !brauchbar,
      begruendung:
        "Das Eingangsdatum des Antrags fehlt — ohne es läuft keine Frist.",
      hinweise: [],
    };
  }

  const hinweise: string[] = [];

  // § 187 Abs. 1 BGB: Der Eingangstag zaehlt nicht mit. Diese Rechnung stammt
  // aus dem BGB, nicht aus dem Merkblatt — der amtliche Text regelt die
  // Fristberechnung selbst nicht.
  const sechsWochen = tageSpaeter(eingangBeimArbeitgeber, 42);

  let datum = sechsWochen;
  let quelle: Fristquelle = "SECHS_WOCHEN";

  if (brauchbar) {
    const naechsteAbrechnung = naechsterAbrechnungstermin(
      eingangBeimArbeitgeber,
      abrechnungstag as number
    );
    if (naechsteAbrechnung < datum) {
      datum = naechsteAbrechnung;
      quelle = "ENTGELTABRECHNUNG";
    }
  } else {
    hinweise.push(
      "Für diesen Mandanten ist kein brauchbarer Termin der Entgeltabrechnung " +
        "hinterlegt. Angezeigt ist nur die äußere Sechs-Wochen-Grenze — die " +
        "tatsächliche Frist kann früher enden."
    );
  }

  if (beschaeftigungsbeginn && beschaeftigungsbeginn > eingangBeimArbeitgeber) {
    // Kommt im Onboarding regelmaessig vor: Der Fragebogen wird vor dem ersten
    // Arbeitstag ausgefuellt. Der amtliche Text knuepft die Frist woertlich an
    // den Eingang, nicht an den Beschaeftigungsbeginn — hier keine Regel
    // erfinden, sondern HR entscheiden lassen.
    hinweise.push(
      `Der Antrag ging vor dem Beschäftigungsbeginn ein ` +
        `(${formatiere(beschaeftigungsbeginn)}). Die Frist läuft nach dem Wortlaut ` +
        `ab Eingang — bitte mit der Lohnbuchhaltung abstimmen, ob vor dem ersten ` +
        `Arbeitstag gemeldet werden kann.`
    );
  }

  return {
    datum,
    quelle,
    unvollstaendig: !brauchbar,
    begruendung:
      quelle === "ENTGELTABRECHNUNG"
        ? `Nächste Entgeltabrechnung nach dem Antragseingang — sie liegt vor der Sechs-Wochen-Grenze (${formatiere(sechsWochen)}).`
        : `Sechs Wochen nach Eingang des Antrags (${formatiere(eingangBeimArbeitgeber)}).`,
    hinweise,
  };
}

/** Der naechste Abrechnungstermin nach einem Stichtag. */
export function naechsterAbrechnungstermin(
  nach: Kalendertag,
  abrechnungstag: number
): Kalendertag {
  const [j, m] = zerlege(nach);
  const inDiesemMonat = baue(j, m, Math.min(abrechnungstag, tageImMonat(j, m)));
  if (inDiesemMonat > nach) return inDiesemMonat;

  const folge = monateSpaeter(baue(j, m, 1), 1);
  const [fj, fm] = zerlege(folge);
  return baue(fj, fm, Math.min(abrechnungstag, tageImMonat(fj, fm)));
}

/**
 * Ende der Widerspruchsfrist der Einzugsstelle.
 *
 * Ein Monat nach Eingang der Arbeitgeber-Meldung (§ 28i Satz 5, § 28a SGB IV;
 * Monatsfrist nach § 26 Abs. 1 SGB X i.V.m. § 188 Abs. 2 BGB).
 *
 * **Anknuepfungspunkt ist der Eingang der Meldung bei der Einzugsstelle**, nicht
 * der Eingang des Antrags beim Arbeitgeber. Dieses Datum entsteht ausserhalb des
 * Portals (DEUEV-Verfahren) und muss erfasst werden — es darf nicht aus dem
 * Antragseingang geschaetzt werden.
 */
export function widerspruchsfristEnde(
  meldungBeiEinzugsstelle: Kalendertag | null
): Berechnung {
  if (!meldungBeiEinzugsstelle) {
    return {
      datum: null,
      begruendung:
        "Solange die Meldung an die Minijob-Zentrale nicht erfasst ist, läuft " +
        "keine Widerspruchsfrist. Dieses Datum entsteht in der Lohnbuchhaltung.",
      hinweise: [],
    };
  }
  const monatsende = monateSpaeter(meldungBeiEinzugsstelle, 1);
  const datum = naechsterWerktag(monatsende);

  const hinweise = [
    "Gesetzliche Feiertage sind nicht berücksichtigt — das Ende kann noch " +
      "etwas später liegen.",
  ];
  if (datum !== monatsende) {
    hinweise.unshift(
      `Der ${formatiere(monatsende)} fällt auf ein Wochenende; die Frist endet ` +
        `deshalb erst mit Ablauf des nächsten Werktages (§ 26 Abs. 3 SGB X).`
    );
  }

  return {
    datum,
    begruendung:
      `Ein Monat nach Eingang der Meldung (${formatiere(meldungBeiEinzugsstelle)}). ` +
      `Widerspricht die Minijob-Zentrale bis dahin nicht, gilt die Entscheidung.`,
    hinweise,
  };
}

// =============================================
// Ampel
// =============================================

export type Ampel = "OFFEN" | "LAEUFT" | "BALD" | "UEBERFAELLIG" | "ERLEDIGT";

export interface Fristampel {
  ampel: Ampel;
  /** Verbleibende Tage; negativ, wenn die Frist abgelaufen ist. */
  tage: number | null;
  text: string;
}

/** Abstand in Tagen zwischen zwei Kalendertagen (b minus a). */
export function tageZwischen(a: Kalendertag, b: Kalendertag): number {
  const alsZahl = (t: Kalendertag) => {
    const [j, m, d] = zerlege(t);
    // Tage seit einem festen Bezugspunkt, ohne Date und ohne Zeitzone.
    const monateGesamt = j * 12 + (m - 1);
    let tage = d;
    for (let i = 0; i < monateGesamt; i++) {
      const jj = Math.floor(i / 12);
      const mm = (i % 12) + 1;
      tage += tageImMonat(jj, mm);
    }
    return tage;
  };
  return alsZahl(b) - alsZahl(a);
}

/**
 * Wie es um eine Frist steht.
 *
 * `BALD` bewusst schon bei zehn Tagen: Die Meldung laeuft ueber die
 * Lohnbuchhaltung und den naechsten Abrechnungslauf, nicht ueber einen Klick.
 * Und ist der Abrechnungstermin nicht hinterlegt, kann die echte Frist frueher
 * enden als die angezeigte — dann ist Vorlauf umso wichtiger.
 */
export function fristampel(
  frist: Kalendertag | null,
  erledigtAm: Kalendertag | null,
  heute: Kalendertag
): Fristampel {
  if (erledigtAm) {
    return {
      ampel: "ERLEDIGT",
      tage: null,
      text: `Erledigt am ${formatiere(erledigtAm)}`,
    };
  }
  if (!frist) {
    return { ampel: "OFFEN", tage: null, text: "Noch keine Frist berechenbar" };
  }

  const tage = tageZwischen(heute, frist);
  if (tage < 0) {
    return {
      ampel: "UEBERFAELLIG",
      tage,
      text: `Seit ${Math.abs(tage)} Tagen überfällig (${formatiere(frist)})`,
    };
  }
  if (tage <= 10) {
    return {
      ampel: "BALD",
      tage,
      text:
        tage === 0
          ? `Läuft heute ab (${formatiere(frist)})`
          : `Noch ${tage} Tage (${formatiere(frist)})`,
    };
  }
  return {
    ampel: "LAEUFT",
    tage,
    text: `Noch ${tage} Tage (${formatiere(frist)})`,
  };
}
