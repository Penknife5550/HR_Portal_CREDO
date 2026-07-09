/**
 * CREDO HR-Portal – Zentrale Konstanten
 *
 * Einheitliche Definitionen für Status-Labels, Rollen,
 * Validierungsfunktionen und andere wiederverwendbare Werte.
 */

// =============================================
// Status-Labels (Dashboard + Detail-Seite)
// =============================================
export const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  INVITED: { label: "Eingeladen", color: "bg-[var(--color-status-invited)]/15 text-[var(--color-status-invited)]" },
  IN_PROGRESS: {
    label: "In Bearbeitung",
    color: "bg-[var(--color-status-in-progress)]/15 text-[var(--color-status-in-progress)]",
  },
  SUBMITTED: { label: "Eingereicht", color: "bg-[var(--color-status-submitted)]/15 text-[var(--color-status-submitted)]" },
  SUPERVISOR_PENDING: {
    label: "Vorgesetzter offen",
    color: "bg-[var(--color-status-supervisor-pending)]/15 text-[var(--color-status-supervisor-pending)]",
  },
  SUPERVISOR_SUBMITTED: {
    label: "Vorgesetzter fertig",
    color: "bg-[var(--color-status-supervisor-submitted)]/15 text-[var(--color-status-supervisor-submitted)]",
  },
  REVIEWED: { label: "Geprüft", color: "bg-[var(--color-status-reviewed)]/15 text-[var(--color-status-reviewed)]" },
  COMPLETED: { label: "Abgeschlossen", color: "bg-[var(--color-status-completed)]/15 text-[var(--color-status-completed)]" },
  EXPIRED: { label: "Abgelaufen", color: "bg-[var(--color-status-expired)]/15 text-[var(--color-status-expired)]" },
};

// =============================================
// Prozesstyp-Labels (zukunftssicher für weitere HR-Vorgaenge)
// =============================================
export const PROCESS_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  EINSTELLUNG: { label: "Einstellung", color: "bg-blue-100 text-blue-800" },
  VERBEAMTUNG: { label: "Verbeamtung", color: "bg-purple-100 text-purple-800" },
  VERTRAGSAENDERUNG: { label: "Vertragsänderung", color: "bg-orange-100 text-orange-800" },
  KUENDIGUNG: { label: "Kündigung", color: "bg-red-100 text-red-800" },
};

// =============================================
// Berechtigungsrollen
// =============================================
export const ADMIN_ROLES = ["SUPER_ADMIN", "HR_LEITUNG"] as const;
export const ALL_PORTAL_ROLES = ["SUPER_ADMIN", "HR_LEITUNG", "HR_SACHBEARBEITER", "EINRICHTUNGSLEITUNG", "VORGESETZTER"] as const;
export const HR_ROLES = ["SUPER_ADMIN", "HR_LEITUNG", "HR_SACHBEARBEITER"] as const;

// =============================================
// Rollen-Labels
// =============================================
export const USER_ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "Administrator",
  HR_LEITUNG: "HR-Leitung",
  HR_SACHBEARBEITER: "Sachbearbeiter",
  EINRICHTUNGSLEITUNG: "Einrichtungsleitung",
  VORGESETZTER: "Vorgesetzter",
};

// =============================================
// Vertragsarten
// =============================================
export const CONTRACT_TYPE_LABELS: Record<string, string> = {
  UNBEFRISTET: "Unbefristet",
  BEFRISTET: "Befristet",
  BEAMTER: "Beamtenverhältnis",
  MINIJOB: "Minijob",
  EHRENAMT: "Ehrenamt",
  PRAKTIKUM: "Praktikum",
};

// =============================================
// Validierungsfunktionen
// =============================================
export function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// =============================================
// Offboarding Status-Labels
// =============================================
export const OFFBOARDING_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  INITIATED: { label: "Erfasst", color: "bg-blue-100 text-blue-800" },
  NOTICE_PERIOD: { label: "Kündigungsfrist", color: "bg-yellow-100 text-yellow-800" },
  HANDOVER_PHASE: { label: "Übergabe", color: "bg-orange-100 text-orange-800" },
  FINAL_SETTLEMENT: { label: "Endabrechnung", color: "bg-purple-100 text-purple-800" },
  COMPLETED: { label: "Abgeschlossen", color: "bg-green-100 text-green-800" },
  CANCELLED: { label: "Abgebrochen", color: "bg-gray-100 text-gray-800" },
};

// =============================================
// Vertragsende Status-Labels
// =============================================
export const CONTRACT_END_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  ANGELEGT: { label: "Angelegt", color: "bg-blue-100 text-blue-800" },
  ANFRAGE_VORGESETZTER: { label: "Anfrage beim Vorgesetzten", color: "bg-yellow-100 text-yellow-800" },
  RUECKMELDUNG_UEBERNAHME: { label: "Rückmeldung: Übernahme", color: "bg-green-100 text-green-800" },
  RUECKMELDUNG_KEINE_UEBERNAHME: { label: "Rückmeldung: keine Übernahme", color: "bg-orange-100 text-orange-800" },
  ENTSCHEIDUNG_UEBERNAHME: { label: "Übernahme – Anfrage offen", color: "bg-yellow-100 text-yellow-800" },
  VERTRAG_ERSTELLT: { label: "Vertrag erstellt", color: "bg-green-100 text-green-800" },
  VERTRAG_UNTERSCHRIEBEN: { label: "Vertrag unterschrieben", color: "bg-emerald-100 text-emerald-800" },
  ENTSCHEIDUNG_KEINE_UEBERNAHME: { label: "Keine Übernahme", color: "bg-red-100 text-red-800" },
  ABGESCHLOSSEN: { label: "Abgeschlossen", color: "bg-purple-100 text-purple-800" },
  STORNIERT: { label: "Storniert", color: "bg-gray-100 text-gray-800" },
};

export const CONTRACT_END_DECISION_LABELS: Record<string, string> = {
  OFFEN: "Offen",
  UEBERNAHME: "Übernahme",
  KEINE_UEBERNAHME: "Keine Übernahme",
};

// =============================================
// Austrittsart-Labels
// =============================================
export const EXIT_TYPE_LABELS: Record<string, string> = {
  KUENDIGUNG_ARBEITNEHMER: "Kündigung Arbeitnehmer",
  KUENDIGUNG_ARBEITGEBER: "Kündigung Arbeitgeber",
  AUFHEBUNGSVERTRAG: "Aufhebungsvertrag",
  BEFRISTUNGSENDE: "Befristungsende",
  RENTE_PENSION: "Rente / Pension",
  ERWERBSMINDERUNG: "Erwerbsminderung",
  ENTLASSUNG_BEAMTER: "Entlassung (Beamter)",
  VERSETZUNG: "Versetzung",
  TOD: "Todesfall",
  SONSTIGES: "Sonstiges",
};

// =============================================
// Rueckgabe-Kategorie-Labels
// =============================================
export const RETURN_CATEGORY_LABELS: Record<string, string> = {
  IT_HARDWARE: "IT-Hardware",
  SCHLUESSEL: "Schlüssel & Zugangskarten",
  FAHRZEUG: "Fahrzeug & Parkausweis",
  DOKUMENTE: "Dokumente & Unterlagen",
  KLEIDUNG: "Firmenkleidung",
  SPEICHERMEDIEN: "Speichermedien",
  SONSTIGES: "Sonstiges",
};

// =============================================
// Offboarding Dokument-Typ-Labels
// =============================================
export const OFFBOARDING_DOC_TYPE_LABELS: Record<string, string> = {
  KUENDIGUNGSSCHREIBEN: "Kündigungsschreiben",
  AUFHEBUNGSVERTRAG: "Aufhebungsvertrag",
  ZEUGNIS_EINFACH: "Einfaches Arbeitszeugnis",
  ZEUGNIS_QUALIFIZIERT: "Qualifiziertes Arbeitszeugnis",
  ARBEITSBESCHEINIGUNG: "Arbeitsbescheinigung",
  ABFINDUNGSVEREINBARUNG: "Abfindungsvereinbarung",
  WETTBEWERBSVERBOT: "Wettbewerbsverbot",
  RUECKGABEPROTOKOLL: "Rückgabeprotokoll",
  SV_ABMELDUNG: "SV-Abmeldung",
  SONSTIGES: "Sonstiges",
};

// =============================================
// Abteilungs-Schlüssel
// =============================================
export const DEPARTMENT_KEYS = {
  HR: "HR",
  IT: "IT",
  FACILITY: "FACILITY",
  BUCHHALTUNG: "BUCHHALTUNG",
  VORGESETZTER: "VORGESETZTER",
  MITARBEITER: "MITARBEITER",
  DSB: "DSB",
} as const;

export const DEPARTMENT_LABELS: Record<string, string> = {
  HR: "Personalabteilung",
  IT: "IT-Abteilung",
  FACILITY: "Facility Management",
  BUCHHALTUNG: "Buchhaltung",
  VORGESETZTER: "Vorgesetzter",
  MITARBEITER: "Mitarbeiter",
  DSB: "Datenschutzbeauftragter",
};

// =============================================
// Exit-Interview Status-Labels
// =============================================
export const EXIT_INTERVIEW_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  SCHEDULED: { label: "Geplant", color: "bg-gray-100 text-gray-800" },
  INVITED: { label: "Eingeladen", color: "bg-blue-100 text-blue-800" },
  IN_PROGRESS: { label: "In Bearbeitung", color: "bg-yellow-100 text-yellow-800" },
  SUBMITTED: { label: "Abgeschlossen", color: "bg-green-100 text-green-800" },
  EXPIRED: { label: "Abgelaufen", color: "bg-red-100 text-red-800" },
};

// =============================================
// Zeugnis-Bewertung Status-Labels
// =============================================
export const ZEUGNIS_BEWERTUNG_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  INVITED: { label: "Eingeladen", color: "bg-blue-100 text-blue-800" },
  IN_PROGRESS: { label: "In Bearbeitung", color: "bg-yellow-100 text-yellow-800" },
  SUBMITTED: { label: "Eingereicht", color: "bg-purple-100 text-purple-800" },
  HR_REVIEW: { label: "HR-Prüfung", color: "bg-orange-100 text-orange-800" },
  FINALIZED: { label: "Finalisiert", color: "bg-green-100 text-green-800" },
  EXPIRED: { label: "Abgelaufen", color: "bg-red-100 text-red-800" },
};

// =============================================
// Zeugnis Berufsgruppen-Labels
// =============================================
export const ZEUGNIS_JOB_GROUP_LABELS: Record<string, string> = {
  LEHRKRAFT: "Lehrkraft",
  ERZIEHER: "Erzieher/in",
  VERWALTUNG: "Verwaltung",
  SCHULLEITUNG: "Schulleitung",
  SONSTIGES: "Sonstiges Personal",
};

// =============================================
// Schulnoten-Labels
// =============================================
export const SCHOOL_GRADE_LABELS: Record<number, { label: string; description: string }> = {
  1: { label: "Sehr gut", description: "Herausragende Leistung" },
  2: { label: "Gut", description: "Überdurchschnittliche Leistung" },
  3: { label: "Befriedigend", description: "Durchschnittliche Leistung" },
  4: { label: "Ausreichend", description: "Unterdurchschnittliche Leistung" },
  5: { label: "Mangelhaft", description: "Erhebliche Mängel" },
  6: { label: "Ungenügend", description: "Nicht verwertbare Leistung" },
};

// =============================================
// Exit-Interview Fragetyp-Labels
// =============================================
export const EXIT_INTERVIEW_QUESTION_TYPE_LABELS: Record<string, string> = {
  RATING_5_STAR: "5-Sterne-Bewertung",
  FREE_TEXT: "Freitext",
  MULTIPLE_CHOICE: "Mehrfachauswahl",
  SINGLE_CHOICE: "Einfachauswahl",
  ENPS: "eNPS (0-10)",
};

// =============================================
// Gesamtnoten-Formulierungen (Arbeitszeugnis)
// =============================================
export const OVERALL_GRADE_FORMULATIONS: Record<number, string> = {
  1: "stets zu unserer vollsten Zufriedenheit",
  2: "stets zu unserer vollen Zufriedenheit",
  3: "zu unserer vollen Zufriedenheit",
  4: "zu unserer Zufriedenheit",
  5: "im Großen und Ganzen zu unserer Zufriedenheit",
  6: "hat sich bemüht, den Anforderungen gerecht zu werden",
};

// =============================================
// Verbeamtung (PSI) Status-Labels
// =============================================
export const CIVIL_SERVICE_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  DRAFT: { label: "Entwurf", color: "bg-gray-100 text-gray-800" },
  PREREQUISITES_CHECK: { label: "Voraussetzungsprüfung", color: "bg-credo-blau/10 text-credo-blau" },
  ASSESSMENT_PENDING: { label: "Beurteilung ausstehend", color: "bg-credo-gelb/10 text-credo-gelb" },
  REFERENCE_PENDING: { label: "Referenz ausstehend", color: "bg-credo-gelb/10 text-credo-gelb" },
  BOARD_PENDING: { label: "Beirat ausstehend", color: "bg-purple-100 text-purple-800" },
  BOARD_POSTPONED: { label: "Beirat: Aufgeschoben", color: "bg-orange-100 text-orange-800" },
  ADMINISTRATION: { label: "Verwaltung", color: "bg-credo-blau/10 text-credo-blau" },
  PROBATION: { label: "Probezeit", color: "bg-credo-gruen/10 text-credo-gruen" },
  LIFETIME_PENDING: { label: "Übernahme Lebenszeit", color: "bg-purple-100 text-purple-800" },
  COMPLETED: { label: "Abgeschlossen", color: "bg-credo-gruen/10 text-credo-gruen" },
  REJECTED: { label: "Abgelehnt", color: "bg-credo-rot/10 text-credo-rot" },
  CANCELLED: { label: "Abgebrochen", color: "bg-gray-100 text-gray-800" },
};

export const CIVIL_SERVICE_STEP_LABELS: Record<number, string> = {
  1: "Formloser Antrag",
  2: "Erste Information Beirat",
  3: "1. Unterrichtsbesuch + Beurteilung",
  4: "Gespräch + Referenz",
  5: "Entscheidung Beirat",
  6: "Verwaltungsvorgang",
  7: "Übernahme PSI auf Probe",
  8: "2. Unterrichtsbesuch",
  9: "3. Unterrichtsbesuch + Referenz",
  10: "Amtsarzt Lebenszeit",
  11: "Übernahme Lebenszeit",
};

export const CIVIL_SERVICE_PHASE_LABELS: Record<string, string> = {
  I: "Antrag & Beurteilung",
  II_A: "Amtsarzt",
  II_B: "Besoldung",
  II_C: "Vertrag & BR",
  II_D: "Krankenversicherung",
  II_E: "Beihilfe",
  II_F: "RV-Befreiung",
  II_G: "Kündigung & LOGA",
  II_H: "Riester, Förderverein, Info",
  III: "Probezeit",
  IV: "Übernahme Lebenszeit",
};

export const CIVIL_SERVICE_ASSIGNEE_LABELS: Record<string, string> = {
  HR: "Personalverwaltung",
  SL: "Schulleitung",
  LK: "Lehrkraft",
  EXTERN: "Extern",
  BEIRAT: "Beirat",
};

export const CIVIL_SERVICE_DOC_TYPES: Record<string, string> = {
  ANTRAG: "Formloser Antrag",
  EINGANGSBESTAETIGUNG: "Eingangsbestätigung",
  AMTSARZT_PROBE: "Amtsärztliches Zeugnis (Probe)",
  AMTSARZT_LEBENSZEIT: "Amtsärztliches Zeugnis (Lebenszeit)",
  BEURTEILUNG_1: "1. Dienstliche Beurteilung",
  BEURTEILUNG_2: "2. Dienstliche Beurteilung",
  BEURTEILUNG_3: "3. Dienstliche Beurteilung",
  REFERENZ_1: "1. Schriftliche Referenz SL",
  REFERENZ_2: "2. Schriftliche Referenz SL",
  GEMEINDE_REFERENZ: "Gemeinde-Referenz",
  VEBS_NACHWEIS: "VEBS-Seminar-Nachweis",
  STUFENBERECHNUNG: "Erfahrungsstufen-Berechnung",
  VORDIENSZEITENBERECHNUNG: "Vordienstzeiten-Berechnung",
  VERTRAG_PROBE: "PSI-Vertrag auf Probe",
  VERTRAG_LEBENSZEIT: "PSI-Vertrag auf Lebenszeit",
  VERTRAG_UNTERSCHRIEBEN: "Unterschriebener Vertrag",
  BR_ANTRAG_PROBE: "Antrag an BR Dez. 48 (Probe)",
  BR_GENEHMIGUNG_PROBE: "BR-Genehmigung (Probe)",
  BR_ANTRAG_LEBENSZEIT: "Antrag an BR Dez. 48 (Lebenszeit)",
  BR_GENEHMIGUNG_LEBENSZEIT: "BR-Genehmigung (Lebenszeit)",
  KK_BESCHEINIGUNG: "KK-Bescheinigung PKV",
  BEIHILFE_ERSTANTRAG: "Beihilfe-Erstantrag",
  BEIHILFE_DATENSCHUTZ: "Datenschutz-Einwilligung Beihilfe",
  BEIHILFE_STAMMBLATT: "Stammblatt Beihilfeakte",
  BEIHILFE_MITTEILUNG: "Mitteilung an Beihilfestelle",
  RV_BEFREIUNGSANTRAG: "RV-Befreiungsantrag",
  KUENDIGUNG_ANGESTELLT: "Kündigungsbestätigung Angestelltenverhältnis",
  FAMILIENZUSCHLAEGE: "Erklärung Familienzuschläge",
  RIESTER_EINVERSTAENDNIS: "Einverständnis Riester-Rente",
  FOERDERVEREIN_ANTRAG: "Mitgliedsantrag Förderverein",
  BEIRAT_PROTOKOLL_PROBE: "Beiratsprotokoll (Probe)",
  BEIRAT_PROTOKOLL_LEBENSZEIT: "Beiratsprotokoll (Lebenszeit)",
};
