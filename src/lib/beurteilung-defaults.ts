/**
 * Beurteilungs-Default-Vorlagen
 *
 * Zentrale Quelle für die mitgelieferten Beurteilungs-Templates.
 * Wird sowohl vom Seed (`prisma/seed.ts`) als auch vom API-Fallback
 * (`src/app/api/civil-service/[id]/assessments/route.ts`) verwendet,
 * falls keine DB-Vorlage gefunden wird.
 *
 * Rechtsgrundlage:
 * - Art. 33 Abs. 2 GG
 * - § 9 BeamtStG (Bestenauslese)
 * - § 92 LBG NRW (Pflicht zur dienstlichen Beurteilung)
 * - BASS 21-02 Nr. 2 (Richtlinien für die dienstliche Beurteilung — BRL)
 *
 * BRL Nr. 6.1 schreibt die sechs Pflicht-Beurteilungsmerkmale vor.
 * BRL Nr. 7.3 schreibt die 5-Punkte-Skala vor (5 = best, keine Zwischenwerte).
 * BRL Nr. 7.5 verbietet das arithmetische Mittel als Gesamturteil.
 */

export type BeurteilungScaleType = "BRL_1_5" | "SCHULNOTEN_1_6";

export interface BeurteilungCriterionDefault {
  name: string;
  description?: string;
  weight?: number;
  orderIndex: number;
}

export interface BeurteilungCategoryDefault {
  name: string;
  description?: string;
  weight?: number;
  orderIndex: number;
  isMandatory?: boolean;
  legalReference?: string;
  criteria: BeurteilungCriterionDefault[];
}

export interface BeurteilungTemplateDefault {
  name: string;
  description?: string;
  scaleType: BeurteilungScaleType;
  scaleLabels: Record<string, string>;
  isDefault: boolean;
  categories: BeurteilungCategoryDefault[];
}

// =============================================
// Skala 1: BRL-konform (BASS 21-02 Nr. 2 — Nr. 7.3)
// 5 Punkte, KEINE Zwischenwerte zulässig
// =============================================
export const BRL_SCALE_LABELS: Record<string, string> = {
  "5": "Übertrifft die Anforderungen in besonderem Maße",
  "4": "Übertrifft die Anforderungen",
  "3": "Entspricht den Anforderungen",
  "2": "Entspricht im Allgemeinen noch den Anforderungen",
  "1": "Entspricht nicht den Anforderungen",
};

// =============================================
// Skala 2: Klassische Schulnoten (CREDO Legacy)
// =============================================
export const SCHULNOTEN_SCALE_LABELS: Record<string, string> = {
  "1": "Sehr gut",
  "2": "Gut",
  "3": "Befriedigend",
  "4": "Ausreichend",
  "5": "Mangelhaft",
  "6": "Ungenügend",
};

// =============================================
// Default-Vorlage 1: BRL NRW (rechtskonform für Verbeamtung)
//
// Sechs Pflichtmerkmale nach BRL Nr. 6.1, Skala 1–5 nach BRL Nr. 7.3.
// Bei Probezeit-Beurteilung haben Merkmal 1, 2 und 3 besondere Bedeutung
// für das Gesamturteil (BRL Nr. 11.3).
// =============================================
export const BRL_DEFAULT_TEMPLATE: BeurteilungTemplateDefault = {
  name: "BRL NRW — Dienstliche Beurteilung (Standard)",
  description:
    "Rechtskonforme Vorlage nach BASS 21-02 Nr. 2 (BRL) für die dienstliche Beurteilung im Rahmen der Verbeamtung an Ersatzschulen NRW. Sechs Pflichtmerkmale, 5-Punkte-Skala, manuelles Gesamturteil.",
  scaleType: "BRL_1_5",
  scaleLabels: BRL_SCALE_LABELS,
  isDefault: true,
  categories: [
    {
      name: "Unterricht oder Ausbildung",
      orderIndex: 0,
      weight: 1.0,
      isMandatory: true,
      legalReference: "BRL Nr. 6.1 Merkmal 1",
      description:
        "Unterrichtsvorbereitung und -gestaltung, Fachkenntnisse, didaktisch-methodisches Vorgehen, schülergerechte Förderung, Sicherung der Lernergebnisse, Medienkompetenz, Classroom-Management.",
      criteria: [
        {
          name: "Unterrichtsvorbereitung und -gestaltung",
          description:
            "Auf Grundlage der Richtlinien, Lehrpläne und schul-/seminarinterner Absprachen.",
          orderIndex: 0,
        },
        {
          name: "Fachkenntnisse",
          description: "Fundierte Kenntnisse im Fachgebiet.",
          orderIndex: 1,
        },
        {
          name: "Didaktisch-methodisches Vorgehen",
          description: "Auswahl und Begründung der inhaltlichen Schwerpunkte.",
          orderIndex: 2,
        },
        {
          name: "Schülergerechte, differenzierte Förderung",
          description: "Individualisierung und Förderung des Kompetenzerwerbs.",
          orderIndex: 3,
        },
        {
          name: "Sicherung der Lernergebnisse",
          description: "Lernkontrolle, Reflexion von Lehr- und Lernprozessen.",
          orderIndex: 4,
        },
        {
          name: "Medienkompetenz",
          description: "Sinnvoller Einsatz digitaler und analoger Medien.",
          orderIndex: 5,
        },
        {
          name: "Unterrichtsatmosphäre und Classroom-Management",
          description: "Klassenführung, Strukturiertheit, Lernumgebung.",
          orderIndex: 6,
        },
      ],
    },
    {
      name: "Diagnostik und Beurteilung",
      orderIndex: 1,
      weight: 1.0,
      isMandatory: true,
      legalReference: "BRL Nr. 6.1 Merkmal 2",
      description:
        "Fachgerechte Anwendung von Beurteilungsmaßstäben, Erkennen von Lernfortschritten, Begründung von Bewertungen.",
      criteria: [
        {
          name: "Anwendung von Beurteilungsmaßstäben",
          description: "Fachgerechte Nutzung von Bewertungsmodellen.",
          orderIndex: 0,
        },
        {
          name: "Erkennen von Lernständen und -hindernissen",
          description: "Diagnostische Kompetenz.",
          orderIndex: 1,
        },
        {
          name: "Begründung von Bewertungen",
          description: "Aufzeigen von Perspektiven für das weitere Lernen.",
          orderIndex: 2,
        },
      ],
    },
    {
      name: "Erziehung und Beratung",
      orderIndex: 2,
      weight: 1.0,
      isMandatory: true,
      legalReference: "BRL Nr. 6.1 Merkmal 3",
      description:
        "Wirken im Sinne der Erziehungsziele, Diversity-Sensibilität, Konfliktlösung, Förderung eigenverantwortlichen Engagements, Beratung in Leistungs-/Laufbahnfragen.",
      criteria: [
        {
          name: "Erziehungsziele des Schulgesetzes",
          description: "Wirken im Sinne der gesetzlichen Erziehungsziele.",
          orderIndex: 0,
        },
        {
          name: "Soziale und kulturelle Diversität",
          description:
            "Beachtung der Vielfalt in der jeweiligen Lerngruppe.",
          orderIndex: 1,
        },
        {
          name: "Erkennen und Bewältigen schwieriger Situationen",
          description: "Konfliktmanagement.",
          orderIndex: 2,
        },
        {
          name: "Förderung eigenverantwortlichen Engagements",
          description: "Anregung zur Eigeninitiative der Schüler.",
          orderIndex: 3,
        },
        {
          name: "Beratung in Leistungs-, Laufbahn- und Entwicklungsfragen",
          orderIndex: 4,
        },
      ],
    },
    {
      name: "Mitwirkung an der Schul- oder Seminarentwicklung",
      orderIndex: 3,
      weight: 1.0,
      isMandatory: true,
      legalReference: "BRL Nr. 6.1 Merkmal 4",
      description:
        "Beteiligung an Qualitätsentwicklung, Engagement in Gremien und Arbeitsgruppen, Wahrnehmung besonderer Aufgaben.",
      criteria: [
        {
          name: "Qualitätsentwicklung und -sicherung",
          description: "Beteiligung an Maßnahmen.",
          orderIndex: 0,
        },
        {
          name: "Engagement in schulischen Gremien",
          description: "Mitarbeit in Arbeitsgruppen und Konferenzen.",
          orderIndex: 1,
        },
        {
          name: "Wahrnehmung besonderer schulischer Aufgaben",
          orderIndex: 2,
        },
      ],
    },
    {
      name: "Zusammenarbeit",
      orderIndex: 4,
      weight: 1.0,
      isMandatory: true,
      legalReference: "BRL Nr. 6.1 Merkmal 5",
      description:
        "Zusammenarbeit mit Kollegen, Eltern, Vorgesetzten und Kooperationspartnern; Teamfähigkeit; Kritikfähigkeit.",
      criteria: [
        {
          name: "Zusammenarbeit mit Kolleginnen und Kollegen",
          orderIndex: 0,
        },
        {
          name: "Zusammenarbeit mit Eltern",
          orderIndex: 1,
        },
        {
          name: "Zusammenarbeit mit Vorgesetzten und Kooperationspartnern",
          orderIndex: 2,
        },
        {
          name: "Teamfähigkeit",
          orderIndex: 3,
        },
        {
          name: "Aktive und passive Kritikfähigkeit",
          orderIndex: 4,
        },
      ],
    },
    {
      name: "Soziale Kompetenz",
      orderIndex: 5,
      weight: 1.0,
      isMandatory: true,
      legalReference: "BRL Nr. 6.1 Merkmal 6",
      description:
        "Verantwortungsbewusstsein, Zuverlässigkeit, Loyalität, lösungsorientiertes Handeln, Innovationsbereitschaft, Kommunikationsfähigkeit, Bereitschaft zur Fortbildung.",
      criteria: [
        {
          name: "Verantwortungsbewusstsein und Zuverlässigkeit",
          orderIndex: 0,
        },
        {
          name: "Loyalität",
          orderIndex: 1,
        },
        {
          name: "Lösungsorientiertes Handeln",
          orderIndex: 2,
        },
        {
          name: "Innovationsbereitschaft",
          orderIndex: 3,
        },
        {
          name: "Kommunikationsfähigkeit",
          orderIndex: 4,
        },
        {
          name: "Bereitschaft zur Fort- und Weiterbildung",
          orderIndex: 5,
        },
      ],
    },
  ],
};

// =============================================
// Default-Vorlage 2: CREDO Schulnoten (Legacy 1–6)
//
// Spiegelt die alte hardcoded Vorlage wider, damit existierende
// CivilServiceAssessments mit altem templateSnapshot eine Quelle haben.
// Nicht als isDefault gesetzt — nur auf Wunsch wählbar.
// =============================================
export const CREDO_LEGACY_TEMPLATE: BeurteilungTemplateDefault = {
  name: "CREDO Schulnoten 1–6 (Legacy)",
  description:
    "Klassische Schulnoten 1–6, fünf Kategorien, inkl. Christliches Profil. Nicht BRL-konform, dient nur der Abwärtskompatibilität für Bestandsdaten.",
  scaleType: "SCHULNOTEN_1_6",
  scaleLabels: SCHULNOTEN_SCALE_LABELS,
  isDefault: false,
  categories: [
    {
      name: "Fachliche Kompetenz",
      orderIndex: 0,
      weight: 1.0,
      criteria: [
        { name: "Fachwissen", description: "Fundierte Kenntnisse im Fachgebiet", orderIndex: 0 },
        { name: "Didaktik", description: "Methodisch-didaktische Kompetenz im Unterricht", orderIndex: 1 },
        { name: "Fortbildung", description: "Bereitschaft zur fachlichen Weiterentwicklung", orderIndex: 2 },
      ],
    },
    {
      name: "Pädagogische Kompetenz",
      orderIndex: 1,
      weight: 1.0,
      criteria: [
        { name: "Unterricht", description: "Qualität der Unterrichtsgestaltung", orderIndex: 0 },
        { name: "Differenzierung", description: "Individualisierung und Differenzierung", orderIndex: 1 },
        { name: "Classroom Management", description: "Klassenführung und Unterrichtsorganisation", orderIndex: 2 },
      ],
    },
    {
      name: "Arbeitsverhalten",
      orderIndex: 2,
      weight: 1.0,
      criteria: [
        { name: "Motivation", description: "Engagement und Einsatzbereitschaft", orderIndex: 0 },
        { name: "Zuverlässigkeit", description: "Termingerechte und gewissenhafte Erledigung", orderIndex: 1 },
        { name: "Belastbarkeit", description: "Umgang mit Arbeitsbelastung", orderIndex: 2 },
      ],
    },
    {
      name: "Sozialverhalten",
      orderIndex: 3,
      weight: 1.0,
      criteria: [
        { name: "Vorgesetzte", description: "Zusammenarbeit mit Vorgesetzten", orderIndex: 0 },
        { name: "Kollegen", description: "Zusammenarbeit im Kollegium", orderIndex: 1 },
        { name: "Schüler", description: "Umgang mit Schülern", orderIndex: 2 },
        { name: "Eltern", description: "Elternkommunikation und -zusammenarbeit", orderIndex: 3 },
      ],
    },
    {
      name: "Christliches Profil",
      orderIndex: 4,
      weight: 1.0,
      criteria: [
        { name: "Andachten", description: "Vorbereitung und Durchführung von Andachten", orderIndex: 0 },
        { name: "Biblische Integration", description: "Integration biblischer Inhalte in den Unterricht", orderIndex: 1 },
        { name: "Gemeindeleben", description: "Aktive Teilnahme am Gemeindeleben", orderIndex: 2 },
        { name: "FES-Grundsätze", description: "Identifikation mit den FES-Grundsätzen", orderIndex: 3 },
      ],
    },
  ],
};

export const ALL_DEFAULT_BEURTEILUNG_TEMPLATES: BeurteilungTemplateDefault[] = [
  BRL_DEFAULT_TEMPLATE,
  CREDO_LEGACY_TEMPLATE,
];
