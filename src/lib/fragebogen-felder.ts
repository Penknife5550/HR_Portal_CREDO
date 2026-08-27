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
 * Diese hier haengen an einer Bedingungsfrage. Wird die gegenstandslos — der
 * Status wechselt, die Meldung bei der Agentur wird zurueckgenommen —, muss die
 * alte Antwort verschwinden. Sonst stuende in der Akte eine Antwort auf eine
 * Frage, die gar nicht gestellt wurde.
 */
export const LEERBARE_FRAGEBOGEN_FELDER: ReadonlySet<string> = new Set([
  "beschaeftigungsStatusSonstige",
  "agenturFuerArbeit",
  "mitLeistungsbezug",
  "summeUeberGeringfuegigkeitsgrenze",
]);
