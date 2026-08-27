/**
 * Pflicht-Dokumente fuer den Personalfragebogen (Task P9).
 *
 * Welche Dokumente verpflichtend sind, ist pro Formular-Vorlage konfigurierbar
 * (FormTemplate.requiredDocuments). Dieser Helper liefert die Anzeige-Labels und
 * berechnet fehlende Pflicht-Dokumente — gemeinsam genutzt von Client (Hinweis +
 * Submit-Sperre) und Server (harte Durchsetzung beim Absenden).
 */
import type { DocumentType } from "@prisma/client";

export const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  ARBEITSVERTRAG: "Arbeitsvertrag",
  FUEHRUNGSZEUGNIS: "Führungszeugnis",
  KK_BESCHEINIGUNG: "Mitgliedsbescheinigung Krankenkasse",
  GEBURTSURKUNDE_EIGEN: "Kopie Ihrer Geburtsurkunde",
  GEBURTSURKUNDE_KIND: "Geburtsurkunde(n) der Kinder",
  SV_AUSWEIS: "Sozialversicherungsausweis",
  ZEUGNIS: "Zeugnis / Qualifikationsnachweis",
  ABSCHLUSSZEUGNIS: "Abschlusszeugnis",
  MASERNSCHUTZ: "Masernschutz-Nachweis",
  INFEKTIONSSCHUTZ: "Infektionsschutz-Belehrung",
  RV_BEFREIUNG: "Unterschriebener Antrag auf Befreiung von der Rentenversicherungspflicht",
  SB_AUSWEIS: "Schwerbehindertenausweis",
  VL_VERTRAG: "VL-Vertrag (Vermögenswirksame Leistungen)",
  BAV_VERTRAG: "bAV-Vertrag (Altersvorsorge)",
  SONSTIGES: "Sonstiges Dokument",
};

/** Alle waehlbaren Dokumenttypen fuer die Vorlagen-Konfiguration. */
export const SELECTABLE_DOCUMENT_TYPES: DocumentType[] = [
  "GEBURTSURKUNDE_EIGEN",
  "GEBURTSURKUNDE_KIND",
  "MASERNSCHUTZ",
  "SV_AUSWEIS",
  "KK_BESCHEINIGUNG",
  "FUEHRUNGSZEUGNIS",
  "INFEKTIONSSCHUTZ",
  "ABSCHLUSSZEUGNIS",
  "ZEUGNIS",
  "SB_AUSWEIS",
  "RV_BEFREIUNG",
  "VL_VERTRAG",
  "BAV_VERTRAG",
  "ARBEITSVERTRAG",
  "SONSTIGES",
] as DocumentType[];

export function documentTypeLabel(t: string): string {
  return DOCUMENT_TYPE_LABELS[t] ?? t;
}

/**
 * Welche Dokumente dieser Vorgang tatsaechlich verlangt.
 *
 * Die Vorlagen-Konfiguration ist nur der Ausgangspunkt. Zwei Pflichten haengen
 * an den Angaben des Beschaeftigten und koennen deshalb erst hier entstehen
 * oder wegfallen:
 *
 * - **Geburtsurkunde der Kinder** nur, wenn er Kinder eingetragen hat.
 * - **Befreiungsantrag** nur, wenn er sich in Schritt 11 fuer die Befreiung
 *   entschieden hat. Fuer die Befreiung schreibt § 6 Abs. 1b SGB VI die
 *   Schriftform vor — ein Haken im Formular genuegt nicht, es braucht die
 *   Unterschrift auf Papier.
 *
 * **Die Aufhebung ist ausdruecklich ausgenommen.** § 6 Abs. 6 SGB VI laesst die
 * elektronische Erklaerung zu; wer sie aufhebt, hat mit dem Absenden des
 * Fragebogens alles getan. Einen Ausdruck zu verlangen, waere hinzuerfundene
 * Foermlichkeit. Direkt daneben in der Route steht eine Pruefung, die bewusst
 * BEIDE Antragsarten umfasst (die Versicherungsnummer) — sie ist die
 * naheliegendste Vorlage zum Abschreiben und waere hier falsch.
 *
 * Die Pflicht wird **hinzugefuegt**, nicht nur gefiltert: RV_BEFREIUNG steht in
 * der MINIJOB-Vorlage nicht in `requiredDocuments`. Eine Regel, die die Liste
 * nur durchsiebt, wuerde die Pflicht nie erzeugen. Umgekehrt wird der Typ bei
 * jeder anderen Entscheidung aktiv entfernt — HR kann ihn im Vorlagen-Editor
 * unbedingt anhaken, und dann duerfte er trotzdem nicht jeden treffen.
 */
export function effektivePflichtDokumente(opts: {
  required: readonly string[];
  hasChildren: boolean;
  rvEntscheidung?: string | null;
}): string[] {
  const pflicht = opts.required.filter((t) => {
    if (t === "GEBURTSURKUNDE_KIND" && !opts.hasChildren) return false;
    if (t === "RV_BEFREIUNG") return false; // gleich gezielt wieder aufnehmen
    return true;
  });

  if (opts.rvEntscheidung === "BEFREIUNG_BEANTRAGT") {
    pflicht.push("RV_BEFREIUNG");
  }

  return pflicht;
}

/**
 * Ermittelt die fehlenden Pflicht-Dokumente.
 *
 * Client und Server rufen dieselbe Funktion auf — sonst zeigt der Fragebogen
 * einen Hinweis, den der Server nicht kennt, oder umgekehrt.
 */
export function computeMissingRequiredDocuments(opts: {
  required: readonly string[];
  uploadedTypes: readonly string[];
  hasChildren: boolean;
  rvEntscheidung?: string | null;
}): string[] {
  const uploaded = new Set(opts.uploadedTypes);
  return effektivePflichtDokumente(opts).filter((t) => !uploaded.has(t));
}

/**
 * Der Satz, der erklaert, warum ausgerechnet dieses Dokument nicht per Haken
 * erledigt werden kann.
 *
 * Die Sammelmeldung „Bitte laden Sie folgende Pflichtdokumente hoch" laesst
 * offen, warum hier ein Ausdruck noetig ist. Wer das nicht versteht, sucht den
 * Fehler bei sich.
 */
export const RV_BEFREIUNG_HINWEIS =
  "Für die Befreiung von der Rentenversicherungspflicht ist die Schriftform " +
  "vorgeschrieben — ein Häkchen genügt hier nicht. Bitte laden Sie den " +
  "ausgedruckten und unterschriebenen Antrag hoch.";
