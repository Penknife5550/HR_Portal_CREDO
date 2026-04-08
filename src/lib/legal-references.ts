/**
 * Rechtsgrundlagen-Bibliothek für die dienstliche Beurteilung
 * im Rahmen der Verbeamtung an Ersatzschulen NRW.
 *
 * Single source of truth, verwendet von:
 * - Beurteilungs-Vorlagen-Editor (Auto-Vervollständigung)
 * - Multi-Step-Form der SL (Rechtsgrundlage-Box pro Step)
 * - Lehrkraft-Bekanntgabe-Page
 * - Public Verify-/Audit-Page
 * - PDF-Export
 *
 * Quelle: HR_Portal_CREDO/docs/Digitale Dokumentation von
 * Unterrichtsbesuchen – NRW Ersatzschulen (Verbeamtung).md
 */

export interface LegalReference {
  /** Stabiler Schlüssel — wird in Code referenziert, nicht ändern */
  key: string;
  /** Kurzes Label für UI-Badges */
  shortLabel: string;
  /** Vollständige Bezeichnung der Norm */
  title: string;
  /** Erklärungstext für Tooltips / Info-Boxen */
  summary: string;
  /** Optionale URL zur amtlichen Fundstelle */
  source?: string;
}

export const LEGAL_REFERENCES: Record<string, LegalReference> = {
  // =============================================
  // Verfassung & Gesetz (Bund + Land)
  // =============================================
  Art_33_2_GG: {
    key: "Art_33_2_GG",
    shortLabel: "Art. 33 Abs. 2 GG",
    title: "Art. 33 Abs. 2 Grundgesetz — Bestenauslese",
    summary:
      "Jeder Deutsche hat nach seiner Eignung, Befähigung und fachlichen Leistung gleichen Zugang zu jedem öffentlichen Amt. Diese drei Kriterien bilden den verfassungsrechtlichen Maßstab jeder dienstlichen Beurteilung.",
  },
  BeamtStG_9: {
    key: "BeamtStG_9",
    shortLabel: "§ 9 BeamtStG",
    title: "§ 9 Beamtenstatusgesetz — Bestenauslese",
    summary:
      "Ernennungen sind nach Eignung, Befähigung und fachlicher Leistung ohne Rücksicht auf Geschlecht, Abstammung, Rasse oder ethnische Herkunft, Behinderung, Religion oder Weltanschauung, politische Anschauungen, Herkunft, Beziehungen oder sexuelle Identität vorzunehmen.",
  },
  LBG_92_1: {
    key: "LBG_92_1",
    shortLabel: "§ 92 Abs. 1 LBG NRW",
    title: "§ 92 Abs. 1 Landesbeamtengesetz NRW — Pflicht zur Beurteilung",
    summary:
      "Eignung, Befähigung und fachliche Leistung der Beamtinnen und Beamten sind regelmäßig sowie aus besonderem Anlass dienstlich zu beurteilen. Die Beurteilung wird der beurteilten Person bekanntgegeben.",
    source: "https://recht.nrw.de — SGV. NRW. 2030",
  },
  LBG_92_1_S6: {
    key: "LBG_92_1_S6",
    shortLabel: "§ 92 Abs. 1 S. 6 LBG NRW",
    title: "§ 92 Abs. 1 Satz 6 LBG NRW — Gegenäußerungsrecht",
    summary:
      "Vor Aufnahme der Beurteilung in die Personalakte hat die beurteilte Person das Recht, eine Gegenäußerung zur dienstlichen Beurteilung abzugeben. Diese wird der Beurteilung beigefügt.",
  },
  SchulG_102: {
    key: "SchulG_102",
    shortLabel: "§ 102 SchulG NRW",
    title: "§ 102 Schulgesetz NRW — Lehrtätigkeit an Ersatzschulen",
    summary:
      "Voraussetzungen für die Lehrtätigkeit an Ersatzschulen, insbesondere das Gleichwertigkeitsgebot. Maßstab für die Verbeamtung an Ersatzschulen in freier Trägerschaft.",
  },

  // =============================================
  // BRL — Richtlinien für die dienstliche Beurteilung
  // BASS 21-02 Nr. 2, RdErl. MSB v. 19.07.2017
  // =============================================
  BRL_4_10: {
    key: "BRL_4_10",
    shortLabel: "BRL Nr. 4.10",
    title: "BRL Nr. 4.10 — Befangenheit",
    summary:
      "Beurteilerinnen und Beurteiler dürfen nicht befangen sein. Die Befangenheitsfreiheit ist vor jeder Beurteilung zu prüfen und zu dokumentieren.",
  },
  BRL_6_1: {
    key: "BRL_6_1",
    shortLabel: "BRL Nr. 6.1",
    title: "BRL Nr. 6.1 — Sechs Beurteilungsmerkmale",
    summary:
      "Die dienstliche Beurteilung bewertet Leistung und Befähigung anhand von sechs Merkmalen: (1) Unterricht/Ausbildung, (2) Diagnostik und Beurteilung, (3) Erziehung und Beratung, (4) Mitwirkung an der Schulentwicklung, (5) Zusammenarbeit, (6) Soziale Kompetenz.",
  },
  BRL_6_1_M1: {
    key: "BRL_6_1_M1",
    shortLabel: "BRL 6.1 M1",
    title: "BRL Nr. 6.1 Merkmal 1 — Unterricht/Ausbildung",
    summary:
      "Unterrichtsvorbereitung und -gestaltung, Fachkenntnisse, didaktisch-methodisches Vorgehen, schülergerechte Förderung, Sicherung der Lernergebnisse, Medienkompetenz, Classroom-Management.",
  },
  BRL_6_1_M2: {
    key: "BRL_6_1_M2",
    shortLabel: "BRL 6.1 M2",
    title: "BRL Nr. 6.1 Merkmal 2 — Diagnostik und Beurteilung",
    summary:
      "Fachgerechte Anwendung von Beurteilungsmaßstäben und Bewertungsmodellen, Erkennen von Lernfortschritten und -hindernissen, Begründung von Bewertungen.",
  },
  BRL_6_1_M3: {
    key: "BRL_6_1_M3",
    shortLabel: "BRL 6.1 M3",
    title: "BRL Nr. 6.1 Merkmal 3 — Erziehung und Beratung",
    summary:
      "Wirken im Sinne der Erziehungsziele, Diversity-Sensibilität, Konfliktmanagement, Förderung eigenverantwortlichen Engagements, Beratung in Leistungs- und Laufbahnfragen.",
  },
  BRL_6_1_M4: {
    key: "BRL_6_1_M4",
    shortLabel: "BRL 6.1 M4",
    title: "BRL Nr. 6.1 Merkmal 4 — Mitwirkung an der Schulentwicklung",
    summary:
      "Beteiligung an Qualitätsentwicklung, Engagement in Gremien, Wahrnehmung besonderer schulischer Aufgaben.",
  },
  BRL_6_1_M5: {
    key: "BRL_6_1_M5",
    shortLabel: "BRL 6.1 M5",
    title: "BRL Nr. 6.1 Merkmal 5 — Zusammenarbeit",
    summary:
      "Zusammenarbeit mit Kolleginnen und Kollegen, Eltern, Vorgesetzten und Kooperationspartnern; Teamfähigkeit; aktive und passive Kritikfähigkeit.",
  },
  BRL_6_1_M6: {
    key: "BRL_6_1_M6",
    shortLabel: "BRL 6.1 M6",
    title: "BRL Nr. 6.1 Merkmal 6 — Soziale Kompetenz",
    summary:
      "Verantwortungsbewusstsein, Zuverlässigkeit, Loyalität, lösungsorientiertes Handeln, Innovationsbereitschaft, Kommunikationsfähigkeit, Bereitschaft zur Fort- und Weiterbildung.",
  },
  BRL_7_3: {
    key: "BRL_7_3",
    shortLabel: "BRL Nr. 7.3",
    title: "BRL Nr. 7.3 — 5-Punkte-Skala",
    summary:
      "Jedes Merkmal wird auf einer 5-Punkte-Skala bewertet (5 = übertrifft die Anforderungen in besonderem Maße, 1 = entspricht nicht den Anforderungen). Zwischenbewertungen wie 3,5 sind nicht zulässig.",
  },
  BRL_7_5: {
    key: "BRL_7_5",
    shortLabel: "BRL Nr. 7.5",
    title: "BRL Nr. 7.5 — Gesamturteil ist KEIN arithmetisches Mittel",
    summary:
      "Das Gesamturteil ist keine arithmetische Mittelung der Einzelmerkmale. Es ist eine eigenständige Wertung, die unter Berücksichtigung aller Merkmale, ihrer Gewichtung und der Gesamtpersönlichkeit der beurteilten Person zu treffen und schriftlich zu begründen ist.",
  },
  BRL_8_3: {
    key: "BRL_8_3",
    shortLabel: "BRL Nr. 8.3",
    title: "BRL Nr. 8.3 — Ankündigungsfrist Unterrichtsbesuch",
    summary:
      "Unterrichtsbesuche im Beurteilungsverfahren sind mindestens zwei Wochen vorher anzukündigen. Anzugeben sind Tag, Fach, Klasse oder Lerngruppe sowie gewünschte Unterlagen. Auf Wunsch der zu beurteilenden Person darf eine Lehrkraft des Vertrauens teilnehmen.",
  },
  BRL_9_1: {
    key: "BRL_9_1",
    shortLabel: "BRL Nr. 9.1",
    title: "BRL Nr. 9.1 — Probezeit-Beurteilung",
    summary:
      "Bei Beurteilungen in der laufbahnrechtlichen Probezeit sind mindestens zwei Unterrichtsbesuche durchzuführen, die zeitnah nachzubesprechen sind. Die Merkmale Unterricht, Diagnostik/Beurteilung und Erziehung/Beratung haben besondere Bedeutung für das Gesamturteil.",
  },
  BRL_10_1: {
    key: "BRL_10_1",
    shortLabel: "BRL Nr. 10.1",
    title: "BRL Nr. 10.1 — Beurteilungsgespräch zwingend",
    summary:
      "Vor Abfassung der dienstlichen Beurteilung ist mit der zu beurteilenden Person ein Beurteilungsgespräch zu führen. Dabei werden das Leistungsbild der Beurteilerin/des Beurteilers und die Selbsteinschätzung verglichen. Auf Wunsch kann eine Vertrauenslehrkraft teilnehmen.",
  },
  BRL_11_3: {
    key: "BRL_11_3",
    shortLabel: "BRL Nr. 11.3",
    title: "BRL Nr. 11.3 — Gewichtung in der Probezeit",
    summary:
      "In der laufbahnrechtlichen Probezeit haben die Merkmale Unterricht, Diagnostik/Beurteilung sowie Erziehung/Beratung besondere Bedeutung bei der Bildung des Gesamturteils.",
  },
  BRL_13: {
    key: "BRL_13",
    shortLabel: "BRL Nr. 13",
    title: "BRL Nr. 13 — Schwerbehinderte Lehrkräfte",
    summary:
      "Bei der Beurteilung schwerbehinderter Lehrkräfte gelten Sonderregelungen, u. a. die zwingende Einbeziehung der Schwerbehindertenvertretung.",
  },
  BRL_14: {
    key: "BRL_14",
    shortLabel: "BRL Nr. 14",
    title: "BRL Nr. 14 — Vertraulichkeit",
    summary:
      "Dienstliche Beurteilungen sind mit besonderer Vertraulichkeit zu behandeln. Zugriff nur für berechtigte Personen, Aufnahme in die Personalakte nach Bekanntgabe.",
  },
};

/** Hilfsfunktion: Mehrere Referenzen anhand ihrer Schlüssel auflösen. */
export function getLegalReferences(...keys: string[]): LegalReference[] {
  return keys
    .map((k) => LEGAL_REFERENCES[k])
    .filter((r): r is LegalReference => Boolean(r));
}

/** Alle Referenzen als Array — für Dropdowns / Auto-Vervollständigung. */
export const ALL_LEGAL_REFERENCES: LegalReference[] = Object.values(LEGAL_REFERENCES);
