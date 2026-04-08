/**
 * CREDO HR-Portal — Checklisten-Vorlagen Mutterschutz & Elternzeit
 *
 * Personalgruppen-spezifische Items mit ausfuehrlichen LOGA-Hinweisen.
 * Werden bei Anlage eines Vorgangs in die DB geschrieben.
 *
 * Rechtsgrundlagen: BEEG, MuSchG, FrUrlV NRW, TV-L
 */

import type { Personalgruppe, ElternzeitPhase } from "@prisma/client";

// =============================================
// Mutterschutz-Checkliste
// =============================================

export interface MutterschutzChecklistTemplate {
  titel: string;
  beschreibung?: string;
  logaHinweis?: string;
  personalgruppe: Personalgruppe | null; // null = alle
  orderIndex: number;
  /** Nur einfuegen wenn BAD-pflichtig (Kita) */
  nurBeiBad?: boolean;
}

export const MUTTERSCHUTZ_CHECKLISTE: MutterschutzChecklistTemplate[] = [
  {
    titel: "Schwangerschaftsmeldung erfassen",
    beschreibung: "Voraussichtlichen Geburtstermin und KV-Status dokumentieren",
    personalgruppe: null,
    orderIndex: 10,
  },
  {
    titel: "BAD-Aufforderungsbrief versenden",
    beschreibung: "BAD Bielefeld informieren, Termin vereinbaren lassen",
    logaHinweis:
      "BAD Bielefeld: Gesundheitszentrum Bielefeld, Am Lenkwerk 9, 33609 Bielefeld | Tel 0521-557894-0 | Debitor: Christlicher Schulverein Minden e.V., Kundennummer 11860244",
    personalgruppe: null,
    orderIndex: 20,
    nurBeiBad: true,
  },
  {
    titel: "BAD-Untersuchung abgeschlossen",
    beschreibung:
      "Bescheinigung vorhanden, Gefaehrdungsbeurteilung dokumentiert, ggf. alternative Taetigkeit festgelegt",
    personalgruppe: null,
    orderIndex: 30,
    nurBeiBad: true,
  },
  {
    titel: "Lohnbescheinigung fuer Krankenkasse erstellen",
    beschreibung:
      "1 Woche vor Mutterschutz-Beginn an die zustaendige Krankenkasse senden (taegl. KK-Zuschuss 13,00 EUR)",
    logaHinweis:
      "LOGA → Auswertungen → Bescheinigungen → Lohnbescheinigung Krankenkasse → Mitarbeiterin auswaehlen → Zeitraum: letzte 13 Wochen vor Mutterschutz → PDF erstellen → an KK senden",
    personalgruppe: "TARIF_TV_L",
    orderIndex: 40,
  },
  {
    titel: "LOGA Fehlzeiten: Mutterschutz eintragen",
    beschreibung:
      "Mutterschutzbeginn = voraussichtlicher Geburtstermin minus 6 Wochen",
    logaHinweis:
      "LOGA → Fehlzeiten → Neue Fehlzeit → Art: 'Mutterschutz' → Von/Bis eintragen → Speichern",
    personalgruppe: "TARIF_TV_L",
    orderIndex: 50,
  },
  {
    titel: "LOGA Steuer: Sonder-Steuerklasse Mutterschutz aktivieren",
    logaHinweis:
      "LOGA → Steuer → Sonderfaelle → Mutterschutz → Aktivieren → Datum eintragen → Speichern",
    personalgruppe: "TARIF_TV_L",
    orderIndex: 60,
  },
  {
    titel: "Aerztliches Zeugnis einholen",
    beschreibung:
      "Vom behandelnden Frauenarzt zum voraussichtlichen Geburtstermin",
    personalgruppe: null,
    orderIndex: 70,
  },
  {
    titel: "Geburtsmeldung erfassen",
    beschreibung:
      "Tatsaechlichen Geburtstermin nach Geburt eintragen, ggf. Fruehgeburt/Mehrlinge markieren",
    personalgruppe: null,
    orderIndex: 80,
  },
  {
    titel: "LOGA Familie: Kind anlegen",
    logaHinweis:
      "LOGA → Familie → Neues Kind → Name + Geburtsdatum + Geschlecht eintragen → Speichern",
    personalgruppe: "TARIF_TV_L",
    orderIndex: 90,
  },
  {
    titel: "LOGA SV: Kinderlosenzuschlag entfernen",
    logaHinweis:
      "LOGA → SV → Kinderlosenzuschlag → Auf 'NEIN' setzen → ab Geburtsdatum → Speichern",
    personalgruppe: "TARIF_TV_L",
    orderIndex: 100,
  },
];

// =============================================
// Elternzeit-Checkliste
// =============================================

export interface ElternzeitChecklistTemplate {
  titel: string;
  beschreibung?: string;
  logaHinweis?: string;
  personalgruppe: Personalgruppe | null; // null = alle
  phase: ElternzeitPhase;
  orderIndex: number;
}

export const ELTERNZEIT_CHECKLISTE: ElternzeitChecklistTemplate[] = [
  // ─── Phase ANTRAG ───
  {
    titel: "Vorlaeufiger Antrag via Magic Link versendet",
    beschreibung: "Magic Link an Mitarbeiter/in per E-Mail",
    personalgruppe: null,
    phase: "ANTRAG",
    orderIndex: 10,
  },
  {
    titel: "Vorlaeufige Genehmigung durch Einrichtungsleitung",
    beschreibung: "Einrichtungsleiter/in bestaetigt Antrag (Phase 2: per Magic Link, Phase 1: HR im Portal)",
    personalgruppe: null,
    phase: "ANTRAG",
    orderIndex: 20,
  },
  {
    titel: "Vorlaeufige Genehmigung als PDF generiert + versendet",
    beschreibung: "Mutter- oder Vater-Version automatisch gewaehlt",
    personalgruppe: null,
    phase: "ANTRAG",
    orderIndex: 30,
  },

  // ─── Phase GENEHMIGUNG (nach Geburt) ───
  {
    titel: "Endgueltiger Antrag via Magic Link versendet",
    beschreibung: "Nach Geburt: 2. Magic Link mit Geburtsurkunden-Upload (Phase 2)",
    personalgruppe: null,
    phase: "GENEHMIGUNG",
    orderIndex: 10,
  },
  {
    titel: "Geburtsurkunde erhalten + abgelegt",
    personalgruppe: null,
    phase: "GENEHMIGUNG",
    orderIndex: 20,
  },
  {
    titel: "Endgueltige Genehmigung versandt",
    personalgruppe: null,
    phase: "GENEHMIGUNG",
    orderIndex: 30,
  },
  {
    titel: "BR Detmold (Dez. 41) Schreiben erstellt + per Post versandt",
    beschreibung:
      "Schreiben enthaelt alle § 16 BEEG-Pflichtfelder. Adresse: Bezirksregierung Detmold, Dezernat 41, Leopoldstr. 15, 32756 Detmold",
    personalgruppe: null,
    phase: "GENEHMIGUNG",
    orderIndex: 40,
  },
  {
    titel: "VBL-Informationsbrief versandt",
    personalgruppe: "TARIF_TV_L",
    phase: "GENEHMIGUNG",
    orderIndex: 50,
  },
  {
    titel: "AG-Bescheinigung fuer Elterngeld ausgestellt",
    beschreibung: "Bruttogehalt der letzten 12 Monate vor Mutterschutzbeginn aus LOGA ziehen",
    logaHinweis:
      "LOGA → Auswertungen → Bescheinigungen → Arbeitgeberbescheinigung Elterngeld → Mitarbeiter/in waehlen → Zeitraum: 12 Monate vor Mutterschutz/EZ-Beginn → PDF erstellen",
    personalgruppe: null,
    phase: "GENEHMIGUNG",
    orderIndex: 60,
  },
  {
    titel: "KV-Zuschuss-Antrag an LBV NRW gestellt",
    beschreibung: "Sofort bei Genehmigung — 31 EUR/Monat fuer Beamte/PSI",
    personalgruppe: "BEAMTER",
    phase: "GENEHMIGUNG",
    orderIndex: 70,
  },
  {
    titel: "KV-Zuschuss-Antrag an LBV NRW gestellt",
    personalgruppe: "PLANSTELLENINHABER",
    phase: "GENEHMIGUNG",
    orderIndex: 71,
  },
  {
    titel: "Beihilfe-Aenderungsformular ausgefuellt + versandt",
    personalgruppe: "BEAMTER",
    phase: "GENEHMIGUNG",
    orderIndex: 80,
  },
  {
    titel: "Beihilfe-Aenderungsformular ausgefuellt + versandt",
    personalgruppe: "PLANSTELLENINHABER",
    phase: "GENEHMIGUNG",
    orderIndex: 81,
  },

  // ─── Phase EZ_AKTIV ───
  {
    titel: "DEUEV-Unterbrechungsmeldung Meldegrund 51 erstellt",
    beschreibung: "Bei Beginn der Elternzeit (TV-L, GKV-Pflicht)",
    logaHinweis:
      "LOGA → SV → Meldungen → Neue DEUEV-Meldung → Grund 51 'Beginn Elternzeit' → Datum eintragen → Pruefen → Senden",
    personalgruppe: "TARIF_TV_L",
    phase: "EZ_AKTIV",
    orderIndex: 10,
  },
  {
    titel: "LOGA Fehlzeiten: Elternzeit eintragen",
    logaHinweis:
      "LOGA → Fehlzeiten → Neue Fehlzeit → Art: 'Elternzeit' → Von/Bis aller Abschnitte eintragen → Speichern",
    personalgruppe: "TARIF_TV_L",
    phase: "EZ_AKTIV",
    orderIndex: 20,
  },
  {
    titel: "Planstelle als 'voruebergehend unbesetzt' melden",
    personalgruppe: "BEAMTER",
    phase: "EZ_AKTIV",
    orderIndex: 30,
  },
  {
    titel: "Planstelle als 'voruebergehend unbesetzt' melden",
    personalgruppe: "PLANSTELLENINHABER",
    phase: "EZ_AKTIV",
    orderIndex: 31,
  },
  {
    titel: "Probezeit-Verlaengerung dokumentieren (§ 16 LBG NRW)",
    personalgruppe: "BEAMTER",
    phase: "EZ_AKTIV",
    orderIndex: 40,
  },
  {
    titel: "Stufenfestsetzungs-Notiz erstellen",
    beschreibung: "EZ bis 3 Jahre/Kind anrechenbar (§ 30 LBesG NRW)",
    personalgruppe: "BEAMTER",
    phase: "EZ_AKTIV",
    orderIndex: 50,
  },

  // ─── Phase RUECKKEHR ───
  {
    titel: "Rueckkehrdatum + Stundenumfang mit MA abstimmen",
    beschreibung: "6 Wochen vor EZ-Ende",
    personalgruppe: null,
    phase: "RUECKKEHR",
    orderIndex: 10,
  },
  {
    titel: "LOGA Beschaeftigung reaktiviert",
    logaHinweis:
      "LOGA → Beschaeftigung → Wiederaufnahme → Datum eintragen → Stunden/Woche ggf. anpassen → Speichern",
    personalgruppe: "TARIF_TV_L",
    phase: "RUECKKEHR",
    orderIndex: 20,
  },
  {
    titel: "DEUEV Wiederaufnahme-Meldung erstellt",
    logaHinweis:
      "LOGA → SV → Meldungen → DEUEV → Grund 'Ende Elternzeit / Wiederaufnahme' → Datum eintragen → Senden",
    personalgruppe: "TARIF_TV_L",
    phase: "RUECKKEHR",
    orderIndex: 30,
  },
  {
    titel: "KV-Zuschuss bei Rueckkehr beendet",
    personalgruppe: "BEAMTER",
    phase: "RUECKKEHR",
    orderIndex: 40,
  },
  {
    titel: "KV-Zuschuss bei Rueckkehr beendet",
    personalgruppe: "PLANSTELLENINHABER",
    phase: "RUECKKEHR",
    orderIndex: 41,
  },
  {
    titel: "IT-Zugang reaktiviert",
    personalgruppe: null,
    phase: "RUECKKEHR",
    orderIndex: 50,
  },
  {
    titel: "Stundenplan / Einsatz koordiniert",
    personalgruppe: null,
    phase: "RUECKKEHR",
    orderIndex: 60,
  },
];

/**
 * Filtert Mutterschutz-Items nach BAD-Pflicht.
 */
export function getMutterschutzCheckliste(
  badErforderlich: boolean,
  personalgruppe: Personalgruppe,
): MutterschutzChecklistTemplate[] {
  return MUTTERSCHUTZ_CHECKLISTE.filter((item) => {
    if (item.nurBeiBad && !badErforderlich) return false;
    if (item.personalgruppe !== null && item.personalgruppe !== personalgruppe)
      return false;
    return true;
  });
}

/**
 * Filtert Elternzeit-Items nach Personalgruppe.
 */
export function getElternzeitCheckliste(
  personalgruppe: Personalgruppe,
): ElternzeitChecklistTemplate[] {
  return ELTERNZEIT_CHECKLISTE.filter(
    (item) => item.personalgruppe === null || item.personalgruppe === personalgruppe,
  );
}
