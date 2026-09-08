/**
 * Welche Felder der Fragebogen speichern darf.
 *
 * Der Auto-Save nimmt einen Datensatz vom Browser entgegen und schreibt ihn in
 * `PersonalData`. Ohne Freigabeliste koennte ein manipulierter Aufruf jedes
 * Feld des Modells setzen — auch solche, die der Fragebogen gar nicht abfragt
 * (Mass Assignment).
 *
 * Die Liste lag urspruenglich in der Route selbst. Das ging genau einmal gut:
 * Beim Ergaenzen des Status-Schritts wurde sie uebersehen, die Angaben kamen
 * fehlerfrei durch die Validierung und landeten trotzdem nicht in der
 * Datenbank. Hier steht sie neben einem Test, der sie gegen die
 * Schritt-Schemata haelt.
 */

/** Alle Felder, die der Fragebogen setzen darf. */
export const ERLAUBTE_FRAGEBOGEN_FELDER: ReadonlySet<string> = new Set([
  // Schritt 1 — Persoenliche Angaben
  "salutation",
  "title",
  "firstName",
  "lastName",
  "birthName",
  "birthDate",
  "birthPlace",
  "birthCountry",
  "nationality",
  // Selbstauskunft zum Aufenthaltstitel. Die beiden Datumsfelder des Modells
  // sind NICHT dasselbe: `aufenthaltstitelGueltigBis` sagt der Beschaeftigte
  // selbst zu, `arbeitserlaubnisGueltigBis` steht nur am hochgeladenen
  // Nachweis und wird nicht im Fragebogen erfragt — es fehlt hier deshalb
  // absichtlich.
  "aufenthaltstitelErforderlich",
  "aufenthaltstitelGueltigBis",
  "maritalStatus",
  "severelyDisabled",
  "disabilityDegree",

  // Schritt 2 — Adresse und Kontakt
  "street",
  "houseNumber",
  "zipCode",
  "city",
  "country",
  "phone",
  "mobile",
  "emailPrivate",

  // Schritt 3 — Bankverbindung
  "iban",
  "bic",
  "bankName",
  "accountHolder",

  // Schritt 4 — Sozialversicherung
  "socialSecurityNumber",
  "healthInsuranceName",
  "healthInsuranceType",
  "healthInsuranceMembership",
  "parentStatus",

  // Schritt 5 — Steuer
  "taxId",
  "taxClass",
  "taxAllowance",
  "childAllowance",
  "religion",

  // Schritt 6 — Weitere Beschaeftigungen und Status
  "beschaeftigungsStatus",
  "beschaeftigungsStatusSonstige",
  "alsArbeitsuchendGemeldet",
  "agenturFuerArbeit",
  "mitLeistungsbezug",
  "hasOtherEmployment",
  "summeUeberGeringfuegigkeitsgrenze",
  "vorbeschaeftigungenVorhanden",
  "auslandsbeschaeftigungVorhanden",
  "employerType",
  // Altfelder: werden nicht mehr abgefragt, bleiben aber schreibbar, solange
  // die HR-Nacherfassung sie kennt.
  "otherEmployerName",
  "otherWeeklyHours",
  "hasMinijob",
  "minijobRvBefreiung",

  // Schritt 11 — Rentenversicherung
  "rvEntscheidung",
  "rvMerkblattGelesen",
  "rvBindungBestaetigt",

  // Schritt 8 — Bildung und Beruf
  "highestSchoolDegree",
  "highestProfessionalDegree",

  // Schritt 9 — Masernschutz
  "bornAfter1971",
  "masernschutzProvided",

  // Beamte (nur in der Vorlage BEAMTE sichtbar)
  "isBeamter",
  "besoldungsgruppe",
  "laufbahngruppe",
  "dienstzeitBeginn",
  "amtsbezeichnung",
  "verfassungstreuePruefung",
]);

/**
 * Felder, die auf `null` zurueckgesetzt werden duerfen.
 *
 * Grundsatz beim Auto-Save: **niemals mit null ueberschreiben.** Gesendet wird
 * immer nur eine Teilmenge, und ein fehlendes Feld darf keine Angabe loeschen.
 *
 * Die Ausnahmen zerfallen in zwei Gruppen — beide mit demselben Grund: Ohne sie
 * bliebe eine ueberholte Angabe in der Personalakte stehen, und niemand kaeme
 * mehr an sie heran.
 *
 * **Antworten auf eine Bedingungsfrage.** Wird die Frage gegenstandslos — der
 * Status wechselt, die Meldung bei der Agentur wird zurueckgenommen —, muss die
 * alte Antwort verschwinden. Sonst stuende in der Akte eine Antwort auf eine
 * Frage, die gar nicht gestellt wurde. Beim Aufenthaltstitel waere das nicht
 * nur unsauber, sondern gefaehrlich: Ein zurueckgebliebenes
 * `aufenthaltstitelGueltigBis` neben einem "Nein" behauptet eine Befristung,
 * die es nicht gibt — und ist zugleich die Angabe, an der die Ablauf-Ampel
 * haengt.
 *
 * **Zahlenfelder, die man wieder leeren koennen muss.** Ein leeres
 * `<input type="number">` sendet null (siehe `zahlOderNull` in
 * formular-zahlen.ts). Stand das Feld nicht hier, kam die Person aus ihrer
 * eigenen Eingabe nicht mehr heraus: Der Auto-Save antwortete mit 200, das Feld
 * blieb im Formular leer — und beim naechsten Laden stand der alte Wert wieder
 * da. Betroffen sind genau die drei, bei denen sich der Sachverhalt aendern
 * kann: Das Finanzamt hebt einen Freibetrag auf (`taxAllowance`,
 * `childAllowance`), oder der Haken „schwerbehindert" faellt weg — dann darf
 * kein Behinderungsgrad (`disabilityDegree`) zurueckbleiben, sonst weist die
 * Akte eine Schwerbehinderung aus, die es nicht gibt.
 *
 * Gefahrlos ist das nur, weil jeder Schritt ausschliesslich SEINE eigenen
 * Felder sendet (`handleNext` in fragebogen-form.tsx). Ein Rundumschlag, der
 * den gesamten Formularzustand schickte, wuerde diese Felder bei jedem
 * Speichern mitleeren — wer das aendert, muss diese Liste erneut pruefen.
 * Sensible Felder (IBAN, SV-Nummer, Steuer-ID) bleiben aussen vor; ein Test
 * haelt das fest.
 */
export const LEERBARE_FRAGEBOGEN_FELDER: ReadonlySet<string> = new Set([
  "aufenthaltstitelGueltigBis",
  "beschaeftigungsStatusSonstige",
  "agenturFuerArbeit",
  "mitLeistungsbezug",
  "summeUeberGeringfuegigkeitsgrenze",
  "taxAllowance",
  "childAllowance",
  "disabilityDegree",
]);
