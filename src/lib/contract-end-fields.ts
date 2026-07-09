/**
 * CREDO HR-Portal — Feld-Registry fuer das Vertragsdaten-Formular (Vertragsende, Strang A).
 *
 * Analog zu `field-definitions.ts` (Onboarding), aber PRO MANDANT konfigurierbar:
 * jeder Mandant kann Felder ein-/ausblenden, als Pflicht markieren und das Label
 * ueberschreiben. Die Konfiguration liegt als JSON in `Organization.contractEndFieldConfig`.
 *
 * WICHTIG: Neue Vertragsdaten-Felder hier registrieren, damit sie in der
 * Mandanten-Konfig UND im oeffentlichen Formular erscheinen.
 */

export interface ContractEndFieldDefinition {
  name: string; // Feldname (= Key in ContractRenewalData / Formular-State)
  label: string; // Standard-Anzeigename
  defaultVisible: boolean;
  defaultRequired: boolean;
  alwaysVisible?: boolean; // kann nicht ausgeblendet werden
  hint?: string; // optionaler Hinweis im Formular (z.B. rechtlicher Hinweis)
}

export interface ContractEndFieldConfig {
  name: string;
  visible: boolean;
  required: boolean;
  label: string;
}

/**
 * Alle konfigurierbaren Felder des Vertragsdaten-Formulars (Reihenfolge = Anzeige).
 * `betriebsstaette` wird im Formular als Auswahl aus den angelegten Mandanten
 * (Organizations) gerendert, nicht als Freitext.
 */
export const CONTRACT_END_FIELD_REGISTRY: ContractEndFieldDefinition[] = [
  { name: "vertragsbeginn", label: "Neuer Vertragsbeginn", defaultVisible: true, defaultRequired: true, alwaysVisible: true },
  { name: "befristet", label: "Befristeter Vertrag", defaultVisible: true, defaultRequired: false },
  { name: "vertragsende", label: "Neues Vertragsende", defaultVisible: true, defaultRequired: false },
  { name: "befristungSachgrund", label: "Sachgrund der Befristung", defaultVisible: true, defaultRequired: false },
  { name: "vollzeit", label: "Vollzeit", defaultVisible: true, defaultRequired: false },
  { name: "wochenstunden", label: "Wochenstunden", defaultVisible: true, defaultRequired: true },
  { name: "tageProWoche", label: "Tage pro Woche", defaultVisible: false, defaultRequired: false },
  { name: "verguetungsmodell", label: "Vergütungsmodell", defaultVisible: false, defaultRequired: false },
  { name: "entgeltgruppe", label: "Entgeltgruppe", defaultVisible: true, defaultRequired: false },
  { name: "stufe", label: "Stufe", defaultVisible: true, defaultRequired: false },
  { name: "urlaubstageProJahr", label: "Urlaubstage / Jahr", defaultVisible: true, defaultRequired: false },
  { name: "betriebsstaette", label: "Betriebsstätte", defaultVisible: true, defaultRequired: false },
  { name: "stellenbeschreibung", label: "Stellenbeschreibung", defaultVisible: true, defaultRequired: false },
  {
    name: "probezeit",
    label: "Probezeit",
    defaultVisible: false,
    defaultRequired: false,
    hint: "Bei Verlängerung desselben Arbeitsverhältnisses ist eine erneute Probezeit i.d.R. unzulässig.",
  },
  { name: "probezeitMonate", label: "Probezeit (Monate)", defaultVisible: false, defaultRequired: false },
  { name: "zusatzvereinbarungen", label: "Zusätzliche Vereinbarungen", defaultVisible: true, defaultRequired: false },
  {
    name: "vorstandAbstimmung",
    label: "Abstimmung mit Vorstand/Geschäftsführung",
    defaultVisible: true,
    defaultRequired: true,
    hint: "Die Führungskraft bestätigt bei Übernahme, ob die Entscheidung mit Vorstand/Geschäftsführung abgestimmt wurde.",
  },
];

const REGISTRY_BY_NAME = new Map(CONTRACT_END_FIELD_REGISTRY.map((d) => [d.name, d]));

/** Standard-Konfiguration (alle Felder mit ihren Defaults). */
export function getDefaultContractEndFieldConfig(): ContractEndFieldConfig[] {
  return CONTRACT_END_FIELD_REGISTRY.map((def) => ({
    name: def.name,
    visible: def.defaultVisible,
    required: def.defaultRequired,
    label: def.label,
  }));
}

/**
 * Gespeicherte (Teil-)Konfiguration mit der Registry zusammenfuehren: bekannte
 * Felder uebernehmen den gespeicherten Wert, neue Felder erscheinen mit Defaults,
 * unbekannte (entfernte) Felder werden verworfen. So bleibt die Config robust,
 * wenn die Registry erweitert wird.
 */
export function resolveContractEndFieldConfig(stored: unknown): ContractEndFieldConfig[] {
  const storedMap = new Map<string, Partial<ContractEndFieldConfig>>();
  if (Array.isArray(stored)) {
    for (const entry of stored) {
      if (entry && typeof entry === "object" && typeof (entry as { name?: unknown }).name === "string") {
        storedMap.set((entry as { name: string }).name, entry as Partial<ContractEndFieldConfig>);
      }
    }
  }
  return CONTRACT_END_FIELD_REGISTRY.map((def) => {
    const s = storedMap.get(def.name);
    const alwaysVisible = def.alwaysVisible === true;
    return {
      name: def.name,
      visible: alwaysVisible ? true : typeof s?.visible === "boolean" ? s.visible : def.defaultVisible,
      required: typeof s?.required === "boolean" ? s.required : def.defaultRequired,
      label: typeof s?.label === "string" && s.label.trim() ? s.label : def.label,
    };
  });
}

/** Sichtbarkeit / Pflicht / Label fuer das Rendering und die Validierung. */
export class ContractEndFieldHelper {
  private configMap: Map<string, ContractEndFieldConfig>;

  constructor(config?: ContractEndFieldConfig[] | null) {
    const resolved = config ?? getDefaultContractEndFieldConfig();
    this.configMap = new Map(resolved.map((f) => [f.name, f]));
  }

  isVisible(name: string): boolean {
    if (REGISTRY_BY_NAME.get(name)?.alwaysVisible) return true;
    return this.configMap.get(name)?.visible ?? true;
  }

  isRequired(name: string): boolean {
    if (!this.isVisible(name)) return false;
    return this.configMap.get(name)?.required ?? false;
  }

  getLabel(name: string): string {
    return this.configMap.get(name)?.label ?? REGISTRY_BY_NAME.get(name)?.label ?? name;
  }
}
