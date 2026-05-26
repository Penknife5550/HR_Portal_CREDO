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
 */

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
    { name: "minijobRvBefreiung",   label: "RV-Befreiung Minijob",  defaultVisible: true, defaultRequired: false },
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
  6: [
    { name: "hasOtherEmployment", label: "Weitere Beschäftigung?",  defaultVisible: true, defaultRequired: false },
    { name: "otherEmployerName",  label: "Arbeitgeber-Name",        defaultVisible: true, defaultRequired: false },
    { name: "otherWeeklyHours",   label: "Wochenstunden (Nebenjob)", defaultVisible: true, defaultRequired: false },
    { name: "employerType",       label: "Arbeitgeber-Typ",         defaultVisible: true, defaultRequired: true },
    { name: "hasMinijob",         label: "Minijob vorhanden?",      defaultVisible: true, defaultRequired: false },
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
    return config?.visible ?? true;
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
  return Array.from({ length: 10 }, (_, i) => {
    const step = i + 1;
    return {
      step,
      title: getStepTitle(step),
      enabled: true,
      fields: getDefaultFieldConfig(step),
    };
  });
}

function getStepTitle(step: number): string {
  const titles: Record<number, string> = {
    1: "Persönliche Angaben",
    2: "Adresse & Kontakt",
    3: "Bankverbindung",
    4: "Sozialversicherung",
    5: "Steuer",
    6: "Weitere Beschäftigung",
    7: "Kinder",
    8: "Bildung & Beruf",
    9: "Masernschutz",
    10: "Zusammenfassung",
  };
  return titles[step] ?? `Schritt ${step}`;
}
