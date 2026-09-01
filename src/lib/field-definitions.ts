/**
 * CREDO HR-Portal – Feld-Registry für Personalfragebogen
 *
 * Zentrale Definition aller Felder pro Schritt.
 * Wird verwendet für:
 * - Admin-Vorlagen: welche Felder ein-/ausblendbar sind
 * - Fragebogen: dynamische Sichtbarkeit und Pflichtfeld-Status
 * - Validierung: dynamische Zod-Schemas
 *
 * WICHTIG: Neue Felder hier registrieren, damit sie im Admin-Portal
 * und im Fragebogen sichtbar werden.
 *
 * Die Schritte selbst (Nummer, Titel, Reihenfolge, Maske) stehen in
 * `fragebogen-steps.ts` — hier stehen nur die Felder je Schritt.
 */

import { FRAGEBOGEN_STEPS } from "./fragebogen-steps";

// =============================================
// Typen
// =============================================
export interface FieldDefinition {
  name: string;           // DB-Feldname (z.B. "firstName")
  label: string;          // Anzeigename (z.B. "Vorname")
  defaultVisible: boolean;
  defaultRequired: boolean;
  alwaysVisible?: boolean;  // Kann nicht ausgeblendet werden (z.B. Vorname)
  alwaysRequired?: boolean; // Kann nicht optional gemacht werden
  group?: string;           // Optionale Gruppierung innerhalb des Schritts
}

export interface FieldConfig {
  name: string;
  visible: boolean;
  required: boolean;
  label: string;
}

export interface StepFieldConfig {
  step: number;
  title: string;
  enabled: boolean;
  fields?: FieldConfig[];
}

// =============================================
// Feld-Registry: Alle Felder pro Schritt
// =============================================
export const FIELD_REGISTRY: Record<number, FieldDefinition[]> = {
  // Step 1: Persönliche Angaben
  1: [
    { name: "salutation",       label: "Anrede",                defaultVisible: true,  defaultRequired: true,  alwaysVisible: true, alwaysRequired: true },
    { name: "title",            label: "Titel (Dr., Prof.)",    defaultVisible: true,  defaultRequired: false },
    { name: "firstName",        label: "Vorname",               defaultVisible: true,  defaultRequired: true,  alwaysVisible: true, alwaysRequired: true },
    { name: "lastName",         label: "Nachname",              defaultVisible: true,  defaultRequired: true,  alwaysVisible: true, alwaysRequired: true },
    { name: "birthName",        label: "Geburtsname",           defaultVisible: true,  defaultRequired: false },
    { name: "birthDate",        label: "Geburtsdatum",          defaultVisible: true,  defaultRequired: true,  alwaysVisible: true, alwaysRequired: true },
    { name: "birthPlace",       label: "Geburtsort",            defaultVisible: true,  defaultRequired: true },
    { name: "birthCountry",     label: "Geburtsland",           defaultVisible: true,  defaultRequired: false },
    { name: "nationality",      label: "Staatsangehörigkeit",   defaultVisible: true,  defaultRequired: false },
    { name: "maritalStatus",    label: "Familienstand",         defaultVisible: true,  defaultRequired: true },
    { name: "severelyDisabled",  label: "Schwerbehinderung",    defaultVisible: true,  defaultRequired: false },
    { name: "disabilityDegree", label: "Behinderungsgrad (GdB)", defaultVisible: true, defaultRequired: false },
  ],

  // Step 2: Adresse & Kontakt
  2: [
    { name: "street",       label: "Straße",            defaultVisible: true,  defaultRequired: true,  alwaysVisible: true },
    { name: "houseNumber",  label: "Hausnummer",        defaultVisible: true,  defaultRequired: true,  alwaysVisible: true },
    { name: "zipCode",      label: "Postleitzahl",      defaultVisible: true,  defaultRequired: true,  alwaysVisible: true },
    { name: "city",         label: "Ort",               defaultVisible: true,  defaultRequired: true,  alwaysVisible: true },
    { name: "country",      label: "Land",              defaultVisible: true,  defaultRequired: false },
    { name: "phone",        label: "Telefon (Festnetz)", defaultVisible: true, defaultRequired: false },
    { name: "mobile",       label: "Mobilnummer",       defaultVisible: true,  defaultRequired: false },
    { name: "emailPrivate", label: "Private E-Mail",    defaultVisible: true,  defaultRequired: false },
  ],

  // Step 3: Bankverbindung
  3: [
    { name: "iban",          label: "IBAN",          defaultVisible: true, defaultRequired: true },
    { name: "bic",           label: "BIC",           defaultVisible: true, defaultRequired: false },
    { name: "bankName",      label: "Bank",          defaultVisible: true, defaultRequired: false },
    { name: "accountHolder", label: "Kontoinhaber",  defaultVisible: true, defaultRequired: false },
  ],

  // Step 4: Sozialversicherung
  4: [
    { name: "socialSecurityNumber", label: "SV-Nummer",              defaultVisible: true, defaultRequired: false },
    { name: "healthInsuranceName",  label: "Krankenkasse",           defaultVisible: true, defaultRequired: true },
    { name: "healthInsuranceType",  label: "Versicherungsart",       defaultVisible: true, defaultRequired: true },
    { name: "parentStatus",         label: "Haben Sie Kinder?", defaultVisible: true, defaultRequired: false },
    // Altfeld. Ein einzelner Haken bildete die Vier-Wege-Entscheidung des
    // Abschnitts 5 nie ab; seit AP 7 steht sie als eigener Schritt 11. Bleibt
    // in der Registry, damit Altvorgaenge lesbar sind — aber aus.
    { name: "minijobRvBefreiung",   label: "RV-Befreiung Minijob (Altfeld)",  defaultVisible: false, defaultRequired: false },
  ],

  // Step 5: Steuer
  5: [
    { name: "taxId",          label: "Steuer-ID",                defaultVisible: true, defaultRequired: true },
    { name: "taxClass",       label: "Steuerklasse",             defaultVisible: true, defaultRequired: true },
    { name: "taxAllowance",   label: "Jährlicher Freibetrag",    defaultVisible: true, defaultRequired: false },
    { name: "childAllowance", label: "Kinderfreibetrag",         defaultVisible: true, defaultRequired: false },
    { name: "religion",       label: "Religionszugehörigkeit",   defaultVisible: true, defaultRequired: true },
  ],

  // Step 6: Weitere Beschaeftigung
  //
  // Die fuenf Bloecke aus Abschnitt 4 der Minijob-Checkliste stehen bewusst auf
  // defaultVisible: false. Sie sind fachlich an den Minijob gebunden — die
  // Statusabfrage mit ihren siebzehn Optionen, die Meldung bei der Agentur fuer
  // Arbeit und die drei Tabellen haben in einem TV-L- oder Beamten-Fragebogen
  // nichts zu suchen. Fuer MINIJOB schaltet sie die Migration
  // MINIJOB_STEP6_FELDER_V1 in prisma/seed-check.js frei.
  6: [
    { name: "beschaeftigungsStatus",              label: "Status bei Beschäftigungsbeginn",        defaultVisible: false, defaultRequired: true },
    { name: "alsArbeitsuchendGemeldet",           label: "Bei der Agentur für Arbeit gemeldet?",   defaultVisible: false, defaultRequired: true },
    { name: "hasOtherEmployment",                 label: "Weitere Beschäftigung?",                 defaultVisible: true,  defaultRequired: false },
    { name: "summeUeberGeringfuegigkeitsgrenze",  label: "Summe über Geringfügigkeitsgrenze?",     defaultVisible: false, defaultRequired: false },
    { name: "vorbeschaeftigungenVorhanden",       label: "Vorbeschäftigungen im Kalenderjahr?",    defaultVisible: false, defaultRequired: true },
    { name: "auslandsbeschaeftigungVorhanden",    label: "Beschäftigung im Ausland?",              defaultVisible: false, defaultRequired: true },
    { name: "employerType",                       label: "Arbeitgeber-Typ",                        defaultVisible: true,  defaultRequired: true },
    // Altfelder: werden seit der Minijob-Fassung nicht mehr erhoben. Sie
    // bleiben in der Registry, damit gespeicherte Vorlagen-Konfigurationen
    // ihre Eintraege behalten und der Editor keinen Schalter ohne Bedeutung
    // anzeigt.
    { name: "otherEmployerName",  label: "Arbeitgeber-Name (Altfeld)",         defaultVisible: false, defaultRequired: false },
    { name: "otherWeeklyHours",   label: "Wochenstunden Nebenjob (Altfeld)",   defaultVisible: false, defaultRequired: false },
    { name: "hasMinijob",         label: "Minijob vorhanden? (Altfeld)",       defaultVisible: false, defaultRequired: false },
  ],

  // Step 7: Kinder (Sonderfall – dynamische Liste)
  7: [
    { name: "children", label: "Kinder (Angaben)", defaultVisible: true, defaultRequired: false },
  ],

  // Step 8: Bildung & Beruf
  8: [
    { name: "highestSchoolDegree",       label: "Höchster Schulabschluss",     defaultVisible: true, defaultRequired: true },
    { name: "highestProfessionalDegree", label: "Höchste Berufsausbildung",    defaultVisible: true, defaultRequired: true },
  ],

  // Step 9: Masernschutz
  9: [
    { name: "bornAfter1971",        label: "Nach 1971 geboren?",  defaultVisible: true, defaultRequired: false },
    { name: "masernschutzProvided", label: "Masernschutz-Nachweis", defaultVisible: true, defaultRequired: false },
  ],

  // Step 10: Zusammenfassung (keine konfigurierbaren Felder)
  10: [],

  // Step 11: Rentenversicherung (Minijob-Checkliste, Abschnitt 5)
  //
  // Hier ist NICHTS abschaltbar, und das ist Absicht: Die Entscheidung traegt
  // den ganzen Schritt, und die beiden Zusagen sind die Voraussetzung, unter der
  // eine Befreiung ueberhaupt beantragt werden darf — die Kenntnisnahme des
  // Merkblatts verlangt das amtliche Muster ausdruecklich, die Bindungswirkung
  // steht im Antragstext selbst.
  //
  // Sie stehen trotzdem in der Registry, damit der Vorlagen-Editor den Schritt
  // vollstaendig anzeigt. `alwaysVisible`/`alwaysRequired` sorgen dafuer, dass
  // er statt wirkungsloser Haken ein Pflichtfeld-Kennzeichen zeigt. Genau das
  // fehlte: Die Schalter liessen sich umlegen und aenderten nichts.
  11: [
    { name: "rvEntscheidung",      label: "Entscheidung zur Rentenversicherung", defaultVisible: true, defaultRequired: true, alwaysVisible: true, alwaysRequired: true },
    { name: "rvMerkblattGelesen",  label: "Merkblatt zur Kenntnis genommen",     defaultVisible: true, defaultRequired: true, alwaysVisible: true, alwaysRequired: true },
    { name: "rvBindungBestaetigt", label: "Bindungswirkung bestaetigt",          defaultVisible: true, defaultRequired: true, alwaysVisible: true, alwaysRequired: true },
  ],
};

// =============================================
// Standard-Feld-Config generieren (Fallback)
// =============================================
export function getDefaultFieldConfig(stepNumber: number): FieldConfig[] {
  const definitions = FIELD_REGISTRY[stepNumber] ?? [];
  return definitions.map((def) => ({
    name: def.name,
    visible: def.defaultVisible,
    required: def.defaultRequired,
    label: def.label,
  }));
}

// =============================================
// Feld-Config-Helper: Sichtbarkeit und Pflicht pruefen
// =============================================
export class FieldConfigHelper {
  private configMap: Map<string, FieldConfig>;
  private definitionMap: Map<string, FieldDefinition>;

  constructor(stepNumber: number, fieldsConfig?: FieldConfig[]) {
    // Falls keine Config vorhanden, Defaults verwenden
    const config = fieldsConfig ?? getDefaultFieldConfig(stepNumber);
    const definitions = FIELD_REGISTRY[stepNumber] ?? [];

    this.configMap = new Map(config.map((f) => [f.name, f]));
    this.definitionMap = new Map(definitions.map((d) => [d.name, d]));
  }

  isVisible(fieldName: string): boolean {
    const def = this.definitionMap.get(fieldName);
    if (def?.alwaysVisible) return true;
    const config = this.configMap.get(fieldName);
    // Faellt auf den Registry-Default zurueck, nicht auf `true` — genau wie
    // isRequired es schon immer tat. Der Unterschied zaehlt fuer Felder, die
    // NACH dem letzten Speichern einer Vorlage hinzugekommen sind: Sie fehlen
    // in deren gespeicherter Konfiguration. Mit `?? true` waere jedes neue
    // Feld sofort in JEDER Vorlage sichtbar — so bekamen TV-L-, Beamten- und
    // Erzieher-Fragebogen die Minijob-Pflichtfragen aus Schritt 6 vorgesetzt.
    return config?.visible ?? def?.defaultVisible ?? true;
  }

  isRequired(fieldName: string): boolean {
    const def = this.definitionMap.get(fieldName);
    if (def?.alwaysRequired) return true;
    if (!this.isVisible(fieldName)) return false;
    const config = this.configMap.get(fieldName);
    return config?.required ?? def?.defaultRequired ?? false;
  }

  getLabel(fieldName: string): string {
    const config = this.configMap.get(fieldName);
    if (config?.label) return config.label;
    const def = this.definitionMap.get(fieldName);
    return def?.label ?? fieldName;
  }
}

// =============================================
// Vollstaendige stepsConfig mit Feld-Defaults generieren
// Wird für den Seed und für neue Templates verwendet
// =============================================
export function generateFullStepsConfig(): StepFieldConfig[] {
  return FRAGEBOGEN_STEPS.map((s) => ({
    step: s.step,
    title: s.title,
    enabled: true,
    fields: getDefaultFieldConfig(s.step),
  }));
}

// =============================================
// Gespeicherte Konfiguration auf die zentrale Definition legen
// =============================================
/**
 * Fuehrt eine gespeicherte `stepsConfig` mit der zentralen Schritt-Definition
 * zusammen.
 *
 * Die gespeicherte Konfiguration ist ein **Overlay, keine vollstaendige
 * Liste**: Sie stammt aus dem Moment, in dem die Vorlage zuletzt gespeichert
 * wurde, und kennt spaeter hinzugekommene Schritte nicht. Wer sie unbesehen
 * rendert — so wie der Vorlagen-Editor es bisher tat — zeigt einen neu
 * definierten Schritt gar nicht erst an, und HR kann ihn weder ein- noch
 * ausschalten.
 *
 * Reihenfolge und Titel kommen deshalb immer aus der zentralen Definition,
 * `enabled` und `fields` aus der gespeicherten Konfiguration, sofern
 * vorhanden. Ein dort fehlender Schritt gilt als abgeschaltet — ausser er ist
 * Pflichtschritt. Das deckt sich mit `getActiveSteps`.
 *
 * Ohne gespeicherte Konfiguration gilt die Vollausstattung.
 */
export function mergeStepsConfig(
  stored?: StepFieldConfig[] | null
): StepFieldConfig[] {
  if (!stored || stored.length === 0) return generateFullStepsConfig();

  const byStep = new Map(stored.map((s) => [s.step, s]));

  return FRAGEBOGEN_STEPS.map((def) => {
    const gespeichert = byStep.get(def.step);
    return {
      step: def.step,
      title: def.title,
      enabled: gespeichert?.enabled ?? def.mandatory ?? false,
      fields: gespeichert?.fields ?? getDefaultFieldConfig(def.step),
    };
  });
}
