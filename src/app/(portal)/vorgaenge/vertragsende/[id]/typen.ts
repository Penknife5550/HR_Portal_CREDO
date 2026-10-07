/**
 * Neue Detailseite Vertragsende (UX-Umbau, Pilot): Daten, Anzeigename, Reiter,
 * Texte der Handlungen — rein und client-sicher, von Seite, Dialogen und Tests
 * gelesen.
 *
 * Feinplan: docs/module/ux-ui/pilot-feinplan.md, Abschnitte 3.3–3.7.
 */
import type { ReiterEintrag } from "@/components/ui/reiter";
import { MAV_PILLE, type VertragsendeAktion } from "@/lib/prozess/vertragsende";
import type { HinweisStand } from "@/lib/prozess/vertragsende-hinweise";

// =============================================
// Daten
// =============================================

/** Vertragsdaten der Verlängerung, wie die Führungskraft sie im Formular erfasst. */
export interface Vertragsdaten {
  vertragsbeginn: string | null;
  befristet: boolean | null;
  vertragsende: string | null;
  befristungSachgrund: string | null;
  wochenstunden: number | null;
  entgeltgruppe: string | null;
  stufe: string | null;
  stellenbeschreibung: string | null;
  /** Freitext — nur Altbestand; das Formular speichert die Auswahl als Organisation. */
  betriebsstaette: string | null;
  /**
   * Name der im Formular gewaehlten Betriebsstaette (`betriebsstaetteOrgId`),
   * von `GET /api/contract-end/[id]` dazugeladen; ohne Auswahl `null`.
   * Optional, damit eine Antwort ohne das Feld (aelterer Server) gueltig bleibt.
   */
  betriebsstaetteName?: string | null;
  urlaubstageProJahr: number | null;
  zusatzvereinbarungen: string | null;
  isComplete: boolean;
}

/**
 * Was die neue Ansicht von `GET /api/contract-end/[id]` liest. Die Antwort
 * trägt mehr (u. a. `auditLogs`); gelesen wird nur das hier. Erfüllt
 * `VertragsendeStand` (Prozessleiste, Pille, Menü) und `HinweisStand`.
 */
export interface VertragsendeDetail extends HinweisStand {
  id: string;
  displayId: string;
  employeeFirstName: string;
  employeeLastName: string;
  employeeEmail: string;
  employeePersonalNr: string | null;
  contractStartDate: string | null;
  supervisorDeclineReason: string | null;
  vorstandAbstimmungVermerk: string | null;
  mavConsultedAt: string | null;
  organization: { id: string; name: string; mandantNumber: string };
  renewalData: Vertragsdaten | null;
  offboarding: { id: string; displayId: string; status: string } | null;
}

/**
 * Wie die Seite die Person nennt — Titel, Pfad und Texte der Dialoge:
 * „Vorname Nachname" (jeder Teil ohne Leerraum am Rand, ein fehlender Teil
 * faellt weg), ohne beides die Vorgangsnummer (ein Titel ist nie leer).
 * Die Zeile „Name" der Übersicht zeigt dagegen die Rohdaten (leer → „—").
 */
export function anzeigeName(
  vorgang: Pick<VertragsendeDetail, "employeeFirstName" | "employeeLastName" | "displayId">,
): string {
  const teile = [vorgang.employeeFirstName, vorgang.employeeLastName].map((teil) => teil.trim()).filter(Boolean);
  return teile.join(" ") || vorgang.displayId;
}

// =============================================
// Reiter
// =============================================

export type ReiterWert = "uebersicht" | "vertragsdaten" | "dokumente" | "e-mails";

/**
 * Die Reiter der Seite. „E-Mails" nur mit Bearbeitungsrecht — wie die Route
 * des Mailprotokolls (`HR_EDIT_ROLES`) und die alte Ansicht.
 */
export function vertragsendeReiter(darfBearbeiten: boolean): ReiterEintrag<ReiterWert>[] {
  const reiter: ReiterEintrag<ReiterWert>[] = [
    { wert: "uebersicht", text: "Übersicht" },
    { wert: "vertragsdaten", text: "Vertragsdaten" },
    { wert: "dokumente", text: "Dokumente" },
  ];
  if (darfBearbeiten) reiter.push({ wert: "e-mails", text: "E-Mails" });
  return reiter;
}

/**
 * `?tab=…` → Reiter. Deutsche Namen (so baut sie `vorgangPfad`) und die
 * Schlüssel der alten Ansicht (`overview`, `renewal`, `documents`, `mails`),
 * Groß-/Kleinschreibung egal. Unbekannt, leer oder „E-Mails" ohne
 * Bearbeitungsrecht → „Übersicht"; nie ein Fehler.
 */
const REITER_ALIASSE: Record<string, ReiterWert> = {
  uebersicht: "uebersicht",
  übersicht: "uebersicht",
  overview: "uebersicht",
  vertragsdaten: "vertragsdaten",
  renewal: "vertragsdaten",
  dokumente: "dokumente",
  documents: "dokumente",
  "e-mails": "e-mails",
  emails: "e-mails",
  mails: "e-mails",
};

export function reiterAusSuche(wert: string | null | undefined, darfBearbeiten: boolean): ReiterWert {
  // Nur EIGENE Schluessel: `?tab=constructor` traefe sonst Object.prototype.
  const schluessel = wert?.trim().toLowerCase();
  const reiter = schluessel && Object.hasOwn(REITER_ALIASSE, schluessel) ? REITER_ALIASSE[schluessel] : undefined;
  if (!reiter) return "uebersicht";
  if (reiter === "e-mails" && !darfBearbeiten) return "uebersicht";
  return reiter;
}

// =============================================
// Handlungen
// =============================================

/**
 * Text des Knopfs je Handlung. Endet auf „…", wenn ein Dialog folgt
 * (Rückfrage oder Eingabe); „Erinnerung senden" läuft ohne Rückfrage — sie
 * nutzt den bestehenden Link, nichts geht verloren. Bei „zum-offboarding"
 * hängt die Seite die Vorgangsnummer an.
 */
export const AKTION_TEXT: Record<VertragsendeAktion, string> = {
  "anfrage-senden": "Anfrage senden …",
  erinnern: "Erinnerung senden",
  "anfrage-neu-senden": "Anfrage neu senden …",
  "offboarding-anlegen": "Offboarding anlegen …",
  "vertrag-erfassen": "Unterschriebenen Vertrag erfassen …",
  dokumente: "Zu den Dokumenten",
  "zum-offboarding": "Zum Offboarding",
  abschliessen: "Abschließen …",
  stornieren: "Vorgang stornieren …",
};

/** Text eines Knopfs, mit der Vorgangsnummer des Offboardings, wo es eines gibt. */
export function aktionText(aktion: VertragsendeAktion, vorgang: Pick<VertragsendeDetail, "offboarding">): string {
  if (aktion === "zum-offboarding" && vorgang.offboarding) {
    return `${AKTION_TEXT["zum-offboarding"]} ${vorgang.offboarding.displayId}`;
  }
  return AKTION_TEXT[aktion];
}

/**
 * Text eines Menüpunkts. Im Menü steht „Offboarding anlegen" neben dem
 * eigentlichen nächsten Schritt; der Zusatz sagt, was dabei übersprungen wird.
 */
export function menueText(aktion: VertragsendeAktion, vorgang: Pick<VertragsendeDetail, "offboarding" | "supervisorLinkSentAt">): string {
  if (aktion === "offboarding-anlegen") {
    return vorgang.supervisorLinkSentAt ? "Ohne Rückmeldung: Offboarding anlegen …" : "Ohne Anfrage: Offboarding anlegen …";
  }
  return aktionText(aktion, vorgang);
}

/**
 * Auswahl im Dialog „Stand der Mitarbeitervertretung" — dieselben vier Werte
 * wie die Knöpfe der alten Ansicht („Ausstehend" setzt dort niemand von Hand).
 * Texte aus `MAV_PILLE`, damit Pille und Auswahl dasselbe sagen.
 */
export const MAV_AUSWAHL = ["NICHT_ERFORDERLICH", "ANGEHOERT", "ZUGESTIMMT", "WIDERSPRUCH"].map((wert) => ({
  wert,
  text: MAV_PILLE[wert].text,
}));
