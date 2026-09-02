/**
 * Status bei Beginn der Beschaeftigung — Abschnitt 2 der Minijob-Checkliste.
 *
 * Das amtliche Muster listet 17 Auswahlmoeglichkeiten und erklaert vier davon in
 * Fussnoten. Fussnoten am Seitenende funktionieren auf Papier; in einem Formular
 * am Bildschirm liest sie niemand. Deshalb steht hier zu jeder Option:
 *
 * - `label`   — die Auswahl selbst, so kurz wie moeglich
 * - `kurz`    — eine Zeile darunter, wenn der Begriff missverstaendlich ist
 * - `hilfe`   — der ausfuehrliche Text hinter dem Fragezeichen, dort wo eine
 *               gesetzliche Definition dahintersteckt
 *
 * **Zur Sprache:** Die Beschriftungen stehen im generischen Maskulinum,
 * entsprechend der internen CREDO-Festlegung. Das amtliche Formular verwendet
 * bei den Statusoptionen Doppelformen („Schüler(in)"). Inhaltlich sind die
 * Optionen identisch, nur die Schreibweise weicht ab — bei einer internen
 * Arbeitshilfe ist das unkritisch.
 *
 * **Reihenfolge:** wie im Muster, damit ein Abgleich Zeile für Zeile möglich
 * bleibt.
 */

export type StatusWert =
  | "SCHUELER"
  | "STUDENT"
  | "SCHULENTLASSEN_BERUFSAUSBILDUNG"
  | "SCHULENTLASSEN_STUDIUM"
  | "SCHULENTLASSEN_FREIWILLIGENDIENST"
  | "BESCHAEFTIGUNGSLOS_SUCHEND"
  | "FREIWILLIGENDIENSTLEISTENDER"
  | "PRAKTIKANT"
  | "BEAMTER"
  | "SELBSTSTAENDIGER"
  | "ARBEITNEHMER_HAUPTBESCHAEFTIGUNG"
  | "ARBEITNEHMER_UNBEZAHLTER_URLAUB"
  | "ARBEITNEHMER_ELTERNZEIT"
  | "ALTERSVOLLRENTNER_VOR_REGELALTERSGRENZE"
  | "ALTERSVOLLRENTNER_NACH_REGELALTERSGRENZE"
  | "VERSORGUNGSEMPFAENGER"
  | "SONSTIGE";

export interface StatusOption {
  wert: StatusWert;
  label: string;
  /** Eine Zeile unter der Auswahl. Nur wo der Begriff missverstaendlich ist. */
  kurz?: string;
  /** Ausfuehrlich, hinter dem Fragezeichen. Nur wo eine Definition dahintersteht. */
  hilfe?: string;
  /** Loest die Rueckfrage zur Agentur fuer Arbeit aus. */
  fragtNachAgentur?: boolean;
  /** Loest ein Freitextfeld aus. */
  fragtNachFreitext?: boolean;
  /**
   * Nachweis, den wir bei dieser Auswahl brauchen. Wird im Abschluss-Schritt
   * angefordert; der Text erklaert dem Beschaeftigten, was gemeint ist.
   */
  nachweis?: string;
}

export const STATUS_OPTIONEN: readonly StatusOption[] = [
  {
    wert: "SCHUELER",
    label: "Schüler",
    kurz: "Ich gehe noch zur Schule.",
    hilfe:
      "Gemeint ist der Besuch einer allgemeinbildenden Schule — Hauptschule, " +
      "Realschule, Gymnasium, Gesamtschule, Waldorfschule, Förderschule oder " +
      "eine Schulart mit mehreren Bildungsgängen. Eine Berufsschule im Rahmen " +
      "einer Ausbildung zählt hier nicht dazu.",
    nachweis: "eine aktuelle Schulbescheinigung",
  },
  {
    wert: "STUDENT",
    label: "Student",
    kurz: "Ich bin an einer Hochschule oder Fachschule eingeschrieben.",
    hilfe:
      "Dazu zählen neben Universitäten und Fachhochschulen auch Fachschulen " +
      "und Berufsfachschulen. Entscheidend ist, dass Sie dort ordentlich " +
      "eingeschrieben sind.",
    nachweis: "eine aktuelle Immatrikulationsbescheinigung",
  },
  {
    wert: "SCHULENTLASSEN_BERUFSAUSBILDUNG",
    label: "Schulentlassener mit Berufsausbildungsabsicht",
    kurz: "Ich habe die Schule beendet und beginne demnächst eine Ausbildung.",
  },
  {
    wert: "SCHULENTLASSEN_STUDIUM",
    label: "Schulentlassener mit Studienabsicht",
    kurz: "Ich habe die Schule beendet und beginne demnächst ein Studium.",
    hilfe:
      "Gemeint ist der nächstmögliche Zeitpunkt — also nicht erst in einigen " +
      "Jahren. Als Studium zählen auch Fachschule und Berufsfachschule.",
  },
  {
    wert: "SCHULENTLASSEN_FREIWILLIGENDIENST",
    label: "Schulentlassener mit Freiwilligendienstabsicht",
    kurz: "Ich habe die Schule beendet und beginne demnächst einen Freiwilligendienst.",
    hilfe:
      "Freiwilligendienste sind zum Beispiel der Bundesfreiwilligendienst, " +
      "der freiwillige Wehrdienst, das freiwillige soziale Jahr (FSJ) und das " +
      "freiwillige ökologische Jahr (FÖJ).",
  },
  {
    wert: "BESCHAEFTIGUNGSLOS_SUCHEND",
    label: "Beschäftigungsloser Arbeit- oder Ausbildungsuchender",
    kurz: "Ich habe derzeit keine Anstellung und suche Arbeit oder eine Ausbildung.",
    fragtNachAgentur: true,
  },
  {
    wert: "FREIWILLIGENDIENSTLEISTENDER",
    label: "Freiwilligendienstleistender",
    kurz: "Ich leiste gerade einen Freiwilligendienst.",
    hilfe:
      "Also Bundesfreiwilligendienst, freiwilliger Wehrdienst, FSJ oder FÖJ — " +
      "und zwar aktuell, nicht erst geplant.",
  },
  {
    wert: "PRAKTIKANT",
    label: "Praktikant",
    kurz: "Ich absolviere derzeit ein Praktikum.",
  },
  {
    wert: "BEAMTER",
    label: "Beamter",
  },
  {
    wert: "SELBSTSTAENDIGER",
    label: "Selbstständiger",
    kurz: "Ich bin hauptsächlich selbstständig tätig.",
  },
  {
    wert: "ARBEITNEHMER_HAUPTBESCHAEFTIGUNG",
    label: "Arbeitnehmer mit sozialversicherungspflichtiger Hauptbeschäftigung",
    kurz: "Ich habe daneben eine feste Anstellung, von der Sozialabgaben gezahlt werden.",
    hilfe:
      "Das ist die häufigste Angabe bei einem Minijob neben dem eigentlichen " +
      "Beruf. Wichtig für uns: Ihr erster Minijob wird dann nicht mit Ihrer " +
      "Hauptbeschäftigung zusammengerechnet — jeder weitere schon.",
  },
  {
    wert: "ARBEITNEHMER_UNBEZAHLTER_URLAUB",
    label: "Arbeitnehmer im unbezahlten Urlaub",
    kurz: "Meine Hauptbeschäftigung ruht gerade ohne Bezahlung.",
  },
  {
    wert: "ARBEITNEHMER_ELTERNZEIT",
    label: "Arbeitnehmer in Elternzeit",
    kurz: "Ich bin in Elternzeit aus meiner Hauptbeschäftigung.",
  },
  {
    wert: "ALTERSVOLLRENTNER_VOR_REGELALTERSGRENZE",
    label: "Altersvollrentner vor der Regelaltersgrenze",
    kurz: "Ich beziehe bereits volle Altersrente, habe die Regelaltersgrenze aber noch nicht erreicht.",
    hilfe:
      "Die Regelaltersgrenze ist das Alter, ab dem Sie ohne Abschläge in Rente " +
      "gehen können — je nach Geburtsjahr zwischen 65 und 67 Jahren. Wer " +
      "vorher in Altersvollrente geht, bleibt in der Rentenversicherung " +
      "versicherungspflichtig.",
  },
  {
    wert: "ALTERSVOLLRENTNER_NACH_REGELALTERSGRENZE",
    label: "Altersvollrentner nach der Regelaltersgrenze",
    kurz: "Ich beziehe volle Altersrente und habe die Regelaltersgrenze erreicht.",
    hilfe:
      "Dann sind Sie in der Rentenversicherung von Gesetzes wegen frei. Eine " +
      "Befreiung müssen Sie deshalb gar nicht erst beantragen.",
  },
  {
    wert: "VERSORGUNGSEMPFAENGER",
    label: "Versorgungsempfänger nach Erreichen einer Altersgrenze",
    kurz: "Ich beziehe eine Versorgung, zum Beispiel als Ruhestandsbeamter.",
  },
  {
    wert: "SONSTIGE",
    label: "Sonstige",
    kurz: "Nichts davon trifft zu.",
    fragtNachFreitext: true,
  },
];

/** Nachschlagen einer Option. */
export function getStatusOption(
  wert: string | null | undefined
): StatusOption | undefined {
  if (!wert) return undefined;
  return STATUS_OPTIONEN.find((o) => o.wert === wert);
}

/** Beschriftung fuer Zusammenfassung, HR-Ansicht und PDF. */
export function statusLabel(wert: string | null | undefined): string {
  return getStatusOption(wert)?.label ?? "—";
}

/**
 * Loest dieser Status die Rueckfrage zur Agentur fuer Arbeit aus?
 *
 * Im Muster haengt sie an der Fussnote zu "Beschäftigungsloser Arbeit-/
 * Ausbildungsuchender". Wir stellen sie zusaetzlich immer als eigene Frage —
 * jemand kann arbeitsuchend gemeldet sein, ohne sich so einzuordnen.
 */
export function fragtNachAgentur(wert: string | null | undefined): boolean {
  return getStatusOption(wert)?.fragtNachAgentur === true;
}

/** Braucht dieser Status einen Nachweis? Gibt den erklaerenden Text zurueck. */
export function nachweisFuerStatus(
  wert: string | null | undefined
): string | undefined {
  return getStatusOption(wert)?.nachweis;
}
