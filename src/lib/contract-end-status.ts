/**
 * Vertragsende: gueltige Status-Uebergaenge des HR-PATCH.
 *
 * Rein und client-sicher. Die Tabelle stand bis zum Pilot des UX-Umbaus in
 * `src/app/api/contract-end/[id]/route.ts`; sie liegt jetzt hier, damit die
 * Route und der Test des Prozess-Adapters (`src/lib/prozess/vertragsende.ts`)
 * DIESELBE Tabelle lesen — eine Kopie im Test liefe auseinander. Inhalt
 * unveraendert (Entscheidung P-F7, docs/module/ux-ui/pilot-feinplan.md).
 *
 * Die Entscheidungen selbst laufen ueber eigene Routen mit eigenen Regeln:
 * `/supervisor-link` (Strang A) und `/nicht-uebernehmen` (Strang B).
 */
export const CONTRACT_END_UEBERGAENGE: Record<string, string[]> = {
  ANGELEGT: ["ANFRAGE_VORGESETZTER", "ENTSCHEIDUNG_KEINE_UEBERNAHME", "STORNIERT"],
  ANFRAGE_VORGESETZTER: [
    "RUECKMELDUNG_UEBERNAHME",
    "RUECKMELDUNG_KEINE_UEBERNAHME",
    "ENTSCHEIDUNG_KEINE_UEBERNAHME",
    "STORNIERT",
  ],
  RUECKMELDUNG_UEBERNAHME: ["VERTRAG_ERSTELLT", "VERTRAG_UNTERSCHRIEBEN", "ABGESCHLOSSEN", "STORNIERT"],
  RUECKMELDUNG_KEINE_UEBERNAHME: ["ENTSCHEIDUNG_KEINE_UEBERNAHME", "STORNIERT"],
  ENTSCHEIDUNG_UEBERNAHME: ["VERTRAG_ERSTELLT", "ENTSCHEIDUNG_KEINE_UEBERNAHME", "STORNIERT"],
  VERTRAG_ERSTELLT: ["VERTRAG_UNTERSCHRIEBEN", "ABGESCHLOSSEN", "STORNIERT"],
  VERTRAG_UNTERSCHRIEBEN: ["ABGESCHLOSSEN", "STORNIERT"],
  ENTSCHEIDUNG_KEINE_UEBERNAHME: ["ABGESCHLOSSEN", "STORNIERT"],
  ABGESCHLOSSEN: [],
  STORNIERT: [],
};
