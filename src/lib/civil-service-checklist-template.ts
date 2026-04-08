/**
 * CREDO HR-Portal – Verbeamtung (PSI) Checklisten-Template
 *
 * 62 Checklistenpunkte fuer den kompletten PSI-Prozess.
 * Wird beim Start eines neuen CivilServiceProcess als Vorlage
 * genutzt, um die individuellen Checklist-Items zu erzeugen.
 *
 * Basiert auf: PROZESS_VERBEAMTUNG_PSI.md
 */

export interface CivilServiceChecklistTemplate {
  step: string;
  phase: string;
  category: string;
  title: string;
  description?: string;
  assignee: "HR" | "SL" | "LK" | "EXTERN" | "BEIRAT";
  isGatekeeper: boolean;
  linkedDocumentType?: string;
  dueDaysFromStart?: number; // Tage nach Prozessbeginn
}

export const CIVIL_SERVICE_CHECKLIST_TEMPLATE: CivilServiceChecklistTemplate[] = [
  // Phase I: Antrag & Beurteilung
  { step: "1", phase: "I", category: "Antrag", title: "Formloser Antrag eingegangen", assignee: "LK", isGatekeeper: true, linkedDocumentType: "ANTRAG" },
  { step: "1", phase: "I", category: "Antrag", title: "Voraussetzungen geprüft (12 Kriterien)", assignee: "HR", isGatekeeper: true },
  { step: "1", phase: "I", category: "Antrag", title: "Eingangsbestätigung versendet", assignee: "HR", isGatekeeper: false, linkedDocumentType: "EINGANGSBESTAETIGUNG" },
  { step: "2", phase: "I", category: "Beirat", title: "Beirat über Antrag informiert", assignee: "SL", isGatekeeper: false },
  { step: "3", phase: "I", category: "Beurteilung", title: "1. Unterrichtsbesuch durchgeführt", assignee: "SL", isGatekeeper: true },
  { step: "3", phase: "I", category: "Beurteilung", title: "Dienstliche Beurteilung ausgefüllt (< 3,0)", assignee: "SL", isGatekeeper: true, linkedDocumentType: "BEURTEILUNG_1" },
  { step: "3", phase: "I", category: "Beurteilung", title: "Stellungnahme SL an Träger", assignee: "SL", isGatekeeper: false },
  { step: "4", phase: "I", category: "Referenz", title: "Gespräch SL + Bewerber geführt", assignee: "SL", isGatekeeper: true },
  { step: "4", phase: "I", category: "Referenz", title: "Schriftliche Referenz SL erstellt", assignee: "SL", isGatekeeper: true, linkedDocumentType: "REFERENZ_1" },
  { step: "4", phase: "I", category: "Referenz", title: "Gemeinde-Referenz eingeholt", assignee: "SL", isGatekeeper: true, linkedDocumentType: "GEMEINDE_REFERENZ" },
  { step: "5", phase: "I", category: "Beirat", title: "Beiratsentscheidung dokumentiert", assignee: "BEIRAT", isGatekeeper: true, linkedDocumentType: "BEIRAT_PROTOKOLL_PROBE" },

  // Phase II_A: Amtsarzt
  { step: "6.A.1", phase: "II_A", category: "Amtsarzt", title: "Anforderung Amtsarzt an LK versendet", assignee: "HR", isGatekeeper: false },
  { step: "6.A.2", phase: "II_A", category: "Amtsarzt", title: "Amtsärztliches Zeugnis eingegangen", assignee: "LK", isGatekeeper: true, linkedDocumentType: "AMTSARZT_PROBE" },
  { step: "6.A.3", phase: "II_A", category: "Amtsarzt", title: "Amtsarzt positiv bestätigt", assignee: "HR", isGatekeeper: true },

  // Phase II_B: Besoldung
  { step: "6.B.1", phase: "II_B", category: "Besoldung", title: "Vordienstzeiten berechnet", assignee: "HR", isGatekeeper: false, linkedDocumentType: "VORDIENSZEITENBERECHNUNG" },
  { step: "6.B.2", phase: "II_B", category: "Besoldung", title: "Erfahrungsstufe festgesetzt", assignee: "HR", isGatekeeper: false, linkedDocumentType: "STUFENBERECHNUNG" },
  { step: "6.B.3", phase: "II_B", category: "Besoldung", title: "Bescheid an LK versendet", assignee: "HR", isGatekeeper: true },

  // Phase II_C: Vertrag & BR
  { step: "6.C.1", phase: "II_C", category: "Vertrag", title: "PSI-Vertrag auf Probe erstellt", assignee: "HR", isGatekeeper: false, linkedDocumentType: "VERTRAG_PROBE" },
  { step: "6.C.2", phase: "II_C", category: "Vertrag", title: "Vertrag an LK zur Unterschrift", assignee: "HR", isGatekeeper: false },
  { step: "6.C.3", phase: "II_C", category: "Vertrag", title: "Unterschriebener Vertrag zurück", assignee: "LK", isGatekeeper: true, linkedDocumentType: "VERTRAG_UNTERSCHRIEBEN" },
  { step: "6.C.4", phase: "II_C", category: "Vertrag", title: "Antrag an BR Dez. 48 gestellt", assignee: "HR", isGatekeeper: false, linkedDocumentType: "BR_ANTRAG_PROBE" },
  { step: "6.C.5", phase: "II_C", category: "Vertrag", title: "BR Dez. 48 hat genehmigt", assignee: "EXTERN", isGatekeeper: true, linkedDocumentType: "BR_GENEHMIGUNG_PROBE" },

  // Phase II_D: Krankenversicherung
  { step: "6.D.1", phase: "II_D", category: "Versicherung", title: "Info PKV-Pflicht an LK versendet", assignee: "HR", isGatekeeper: false },
  { step: "6.D.2", phase: "II_D", category: "Versicherung", title: "KK-Bescheinigung erstellt", assignee: "HR", isGatekeeper: false, linkedDocumentType: "KK_BESCHEINIGUNG" },
  { step: "6.D.3", phase: "II_D", category: "Versicherung", title: "LK hat PKV abgeschlossen", assignee: "LK", isGatekeeper: true },

  // Phase II_E: Beihilfe
  { step: "6.E.1", phase: "II_E", category: "Beihilfe", title: "Info-Brief Beihilfe an LK", assignee: "HR", isGatekeeper: false },
  { step: "6.E.2", phase: "II_E", category: "Beihilfe", title: "Beihilfe-Erstantrag mitgegeben", assignee: "HR", isGatekeeper: false, linkedDocumentType: "BEIHILFE_ERSTANTRAG" },
  { step: "6.E.3", phase: "II_E", category: "Beihilfe", title: "Datenschutz-Einwilligung Beihilfe", assignee: "LK", isGatekeeper: false, linkedDocumentType: "BEIHILFE_DATENSCHUTZ" },
  { step: "6.E.4", phase: "II_E", category: "Beihilfe", title: "Stammblatt Beihilfeakte erstellt", assignee: "HR", isGatekeeper: false, linkedDocumentType: "BEIHILFE_STAMMBLATT" },
  { step: "6.E.5", phase: "II_E", category: "Beihilfe", title: "Mitteilung an BR Dez. 23 (Beihilfestelle)", assignee: "HR", isGatekeeper: true, linkedDocumentType: "BEIHILFE_MITTEILUNG" },

  // Phase II_F: RV-Befreiung
  { step: "6.F.1", phase: "II_F", category: "RV-Befreiung", title: "RV-Befreiungsantrag vorbereitet", assignee: "HR", isGatekeeper: false },
  { step: "6.F.2", phase: "II_F", category: "RV-Befreiung", title: "Arbeitgeber-Erklärung ausgefüllt", assignee: "HR", isGatekeeper: false },
  { step: "6.F.3", phase: "II_F", category: "RV-Befreiung", title: "LK hat Antrag unterschrieben", assignee: "LK", isGatekeeper: true, linkedDocumentType: "RV_BEFREIUNGSANTRAG" },
  { step: "6.F.4", phase: "II_F", category: "RV-Befreiung", title: "Antrag an DRV Bund gesendet", assignee: "HR", isGatekeeper: true },

  // Phase II_G: Kündigung & LOGA
  { step: "6.G.1", phase: "II_G", category: "LOGA", title: "Kündigungsbestätigung Angestelltenverhältnis", assignee: "HR", isGatekeeper: false, linkedDocumentType: "KUENDIGUNG_ANGESTELLT" },
  { step: "6.G.2", phase: "II_G", category: "LOGA", title: "LOGA-Überführung (Angestellter → Beamter)", assignee: "HR", isGatekeeper: true },
  { step: "6.G.3", phase: "II_G", category: "LOGA", title: "Erklärung Familienzuschläge von LK", assignee: "LK", isGatekeeper: false, linkedDocumentType: "FAMILIENZUSCHLAEGE" },

  // Phase II_H: Riester, Förderverein, Info
  { step: "6.H.1", phase: "II_H", category: "Sonstiges", title: "Anschreiben Riester-Rente an LK", assignee: "HR", isGatekeeper: false },
  { step: "6.H.2", phase: "II_H", category: "Sonstiges", title: "Einverständnis Riester (ZfA)", assignee: "LK", isGatekeeper: false, linkedDocumentType: "RIESTER_EINVERSTAENDNIS" },
  { step: "6.H.3", phase: "II_H", category: "Sonstiges", title: "Förderverein-Mitgliedschaft aktiv", assignee: "LK", isGatekeeper: true, linkedDocumentType: "FOERDERVEREIN_ANTRAG" },
  { step: "6.H.4", phase: "II_H", category: "Sonstiges", title: "Info an Sekretariat und SL versendet", assignee: "HR", isGatekeeper: false },

  // Phase III: Probezeit — Tag 1 Checkliste (Schritt 7)
  { step: "7.1", phase: "III", category: "Tag 1", title: "Amtsärztliches Zeugnis liegt vor und ist positiv", assignee: "HR", isGatekeeper: true },
  { step: "7.2", phase: "III", category: "Tag 1", title: "BR Dez. 48 hat PSI-Vertrag genehmigt", assignee: "HR", isGatekeeper: true },
  { step: "7.3", phase: "III", category: "Tag 1", title: "PSI-Vertrag von beiden Seiten unterschrieben", assignee: "HR", isGatekeeper: true },
  { step: "7.4", phase: "III", category: "Tag 1", title: "LK hat PKV abgeschlossen", assignee: "HR", isGatekeeper: true },
  { step: "7.5", phase: "III", category: "Tag 1", title: "RV-Befreiungsantrag eingereicht", assignee: "HR", isGatekeeper: true },
  { step: "7.6", phase: "III", category: "Tag 1", title: "Beihilfe-Meldung an BR Dez. 23 erfolgt", assignee: "HR", isGatekeeper: true },
  { step: "7.7", phase: "III", category: "Tag 1", title: "LOGA-Umstellung durchgeführt", assignee: "HR", isGatekeeper: true },
  { step: "7.8", phase: "III", category: "Tag 1", title: "Erfahrungsstufe festgesetzt und beschieden", assignee: "HR", isGatekeeper: true },
  { step: "7.9", phase: "III", category: "Tag 1", title: "Förderverein-Mitgliedschaft aktiv", assignee: "HR", isGatekeeper: true },

  // Phase III: Probezeit — Beurteilungen (Schritt 8 + 9)
  { step: "8", phase: "III", category: "Probezeit", title: "2. Unterrichtsbesuch durchgeführt (nach 1 Jahr)", assignee: "SL", isGatekeeper: true, linkedDocumentType: "BEURTEILUNG_2" },
  { step: "8", phase: "III", category: "Probezeit", title: "2. Dienstliche Beurteilung eingereicht", assignee: "SL", isGatekeeper: true },
  { step: "8", phase: "III", category: "Probezeit", title: "Beirat über Entwicklung informiert", assignee: "SL", isGatekeeper: false },
  { step: "9", phase: "III", category: "Probezeit", title: "3. Unterrichtsbesuch durchgeführt (Ende Probezeit)", assignee: "SL", isGatekeeper: true, linkedDocumentType: "BEURTEILUNG_3" },
  { step: "9", phase: "III", category: "Probezeit", title: "3. Dienstliche Beurteilung eingereicht", assignee: "SL", isGatekeeper: true },
  { step: "9", phase: "III", category: "Probezeit", title: "2. Schriftliche Referenz SL erstellt", assignee: "SL", isGatekeeper: true, linkedDocumentType: "REFERENZ_2" },
  { step: "9", phase: "III", category: "Probezeit", title: "Gemeinde-Referenz (2.) eingeholt", assignee: "SL", isGatekeeper: true },

  // Phase IV: Übernahme Lebenszeit
  { step: "10.1", phase: "IV", category: "Lebenszeit", title: "Neues amtsärztliches Zeugnis angefordert", assignee: "HR", isGatekeeper: false },
  { step: "10.2", phase: "IV", category: "Lebenszeit", title: "Neues amtsärztliches Zeugnis eingegangen + positiv", assignee: "LK", isGatekeeper: true, linkedDocumentType: "AMTSARZT_LEBENSZEIT" },
  { step: "11", phase: "IV", category: "Lebenszeit", title: "Beiratsentscheidung Lebenszeit dokumentiert", assignee: "BEIRAT", isGatekeeper: true, linkedDocumentType: "BEIRAT_PROTOKOLL_LEBENSZEIT" },
  { step: "11", phase: "IV", category: "Lebenszeit", title: "PSI-Vertrag auf Lebenszeit erstellt", assignee: "HR", isGatekeeper: false, linkedDocumentType: "VERTRAG_LEBENSZEIT" },
  { step: "11", phase: "IV", category: "Lebenszeit", title: "Antrag an BR Dez. 48 (Lebenszeit)", assignee: "HR", isGatekeeper: false, linkedDocumentType: "BR_ANTRAG_LEBENSZEIT" },
  { step: "11", phase: "IV", category: "Lebenszeit", title: "BR Dez. 48 hat Lebenszeit genehmigt", assignee: "EXTERN", isGatekeeper: true, linkedDocumentType: "BR_GENEHMIGUNG_LEBENSZEIT" },
  { step: "11", phase: "IV", category: "Lebenszeit", title: "Vertrag auf Lebenszeit unterschrieben", assignee: "LK", isGatekeeper: true },
  { step: "11", phase: "IV", category: "Lebenszeit", title: "Änderungsmitteilung an Beihilfestelle", assignee: "HR", isGatekeeper: false },
  { step: "11", phase: "IV", category: "Lebenszeit", title: "LOGA-Update: Probe → Lebenszeit", assignee: "HR", isGatekeeper: true },
  { step: "11", phase: "IV", category: "Lebenszeit", title: "Info an Sekretariat und SL", assignee: "HR", isGatekeeper: false },
];

/**
 * Phasen-Definitionen fuer die automatische Erstellung
 */
export const CIVIL_SERVICE_PHASES = [
  { phaseKey: "I", phaseName: "Antrag & Beurteilung", orderIndex: 1 },
  { phaseKey: "II_A", phaseName: "Amtsarzt", orderIndex: 2 },
  { phaseKey: "II_B", phaseName: "Besoldung", orderIndex: 3 },
  { phaseKey: "II_C", phaseName: "Vertrag & BR", orderIndex: 4 },
  { phaseKey: "II_D", phaseName: "Krankenversicherung", orderIndex: 5 },
  { phaseKey: "II_E", phaseName: "Beihilfe", orderIndex: 6 },
  { phaseKey: "II_F", phaseName: "RV-Befreiung", orderIndex: 7 },
  { phaseKey: "II_G", phaseName: "Kuendigung & LOGA", orderIndex: 8 },
  { phaseKey: "II_H", phaseName: "Riester, Foerderverein, Info", orderIndex: 9 },
  { phaseKey: "III", phaseName: "Probezeit", orderIndex: 10 },
  { phaseKey: "IV", phaseName: "Uebernahme auf Lebenszeit", orderIndex: 11 },
] as const;
