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
 * Pflicht heisst nicht ueberall dasselbe — und der Unterschied ist keine
 * Feinheit, sondern entscheidet, ob jemand seinen Fragebogen abgeben kann.
 *
 * **Sperrend** ist der Regelfall: Ohne die Datei nimmt der Server den
 * Fragebogen nicht an (400).
 *
 * **Nachreichbar** ist die Ausnahme, heute nur der Masernschutz-Nachweis. Er
 * wird als Pflicht angezeigt und angemahnt, haelt das Absenden aber nicht auf
 * (Entscheidung 07.09.2026). Zwei Gruende:
 *
 * 1. Das Infektionsschutzgesetz verlangt vom Arbeitgeber, einen fehlenden
 *    Nachweis dem **Gesundheitsamt zu melden** — nicht, die Personalakte nicht
 *    anzulegen. Eine Sperre erfuellt keine Pflicht, sie verhindert nur die
 *    Meldung, weil der Vorgang gar nicht erst entsteht.
 * 2. Sie hielte alles Uebrige mit auf. Im selben Formular stehen Bankverbindung
 *    und Steuer-ID, die die Lohnbuchhaltung zum Ersten braucht. Der Impfausweis
 *    liegt selten griffbereit — die Person haengt dann an einem Blatt Papier
 *    fest, das mit ihrer Bezahlung nichts zu tun hat.
 *
 * Beim Befreiungsantrag ist es genau umgekehrt, deshalb sperrt der: Ohne die
 * unterschriebene Seite kommt die Befreiung rechtlich nicht zustande. Ihn
 * nachreichen zu lassen hiesse, eine Entscheidung zu protokollieren, die es
 * nicht gibt.
 *
 * Wer hier einen Typ eintraegt, nimmt ihm die Sperrwirkung — auch fuer den
 * Server. Das ist eine fachliche Entscheidung, keine Anzeigefrage.
 */
export const NACHREICHBARE_PFLICHTEN: readonly string[] = ["MASERNSCHUTZ"];

/** Darf dieses Pflichtdokument nachgereicht werden, statt zu sperren? */
export function istNachreichbar(typ: string): boolean {
  return NACHREICHBARE_PFLICHTEN.includes(typ);
}

/** Die Angaben, aus denen sich die Pflichten dieses Vorgangs ergeben. */
export interface PflichtEingaben {
  /** Pflicht-Dokumenttypen aus der Vorlagen-Konfiguration. */
  required: readonly string[];
  hasChildren: boolean;
  /** Entscheidung aus Schritt 11 (Rentenversicherung). */
  rvEntscheidung?: string | null;
  /**
   * Ist der Masernschutz-Nachweis fuer DIESEN Vorgang vorgeschrieben?
   *
   * Die Regel dahinter (nach dem 31.12.1970 geboren UND Gemeinschafts-
   * einrichtung) steht in `src/lib/masernschutz.ts` und wird vom Aufrufer
   * ausgewertet — genau wie `rvEntscheidung` eine Tatsache ist, die hier nur
   * noch angewandt wird. Nicht hier nachbauen: Client und Server muessen
   * dieselbe Antwort bekommen.
   *
   * Fehlt der Wert, gilt **nicht pflichtig**. Ein fehlendes Geburtsdatum darf
   * nie zu einer Pflicht fuehren — sonst traegt jemand eine Forderung, zu der
   * er nie gefragt wurde.
   */
  masernschutzPflichtig?: boolean;
}

/**
 * Welche Dokumente dieser Vorgang tatsaechlich verlangt.
 *
 * Die Vorlagen-Konfiguration ist nur der Ausgangspunkt. Drei Pflichten haengen
 * an den Angaben des Beschaeftigten und koennen deshalb erst hier entstehen
 * oder wegfallen:
 *
 * - **Geburtsurkunde der Kinder** nur, wenn er Kinder eingetragen hat.
 * - **Befreiungsantrag** nur, wenn er sich in Schritt 11 fuer die Befreiung
 *   entschieden hat. Fuer die Befreiung schreibt § 6 Abs. 1b SGB VI die
 *   Schriftform vor — ein Haken im Formular genuegt nicht, es braucht die
 *   Unterschrift auf Papier.
 * - **Masernschutz-Nachweis** nur, wenn `masernschutzPflichtig` gesetzt ist.
 *   Er wird ebenso aktiv **entfernt**, wenn nicht: Der Typ ist im
 *   Vorlagen-Editor anhakbar, und ein Attest von einer Verwaltungskraft zu
 *   verlangen, fuer die das Infektionsschutzgesetz nicht gilt, waere ein
 *   Gesundheitsdatum ohne Rechtsgrundlage (Art. 9 DSGVO). Die Liste ist hier
 *   die letzte Stelle, an der das noch auffaellt.
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
export function effektivePflichtDokumente(opts: PflichtEingaben): string[] {
  const pflicht = opts.required.filter((t) => {
    if (t === "GEBURTSURKUNDE_KIND" && !opts.hasChildren) return false;
    if (t === "RV_BEFREIUNG") return false; // gleich gezielt wieder aufnehmen
    if (t === "MASERNSCHUTZ") return false; // dito
    return true;
  });

  if (opts.rvEntscheidung === "BEFREIUNG_BEANTRAGT") {
    pflicht.push("RV_BEFREIUNG");
  }

  if (opts.masernschutzPflichtig === true) {
    pflicht.push("MASERNSCHUTZ");
  }

  return pflicht;
}

/**
 * Die Pflichten, die das Absenden tatsaechlich **sperren**.
 *
 * Das ist die Liste, gegen die der Server 400 antwortet und an der der
 * Absende-Knopf haengt. Die nachreichbaren Pflichten fallen hier heraus — sie
 * werden angezeigt und angemahnt (siehe `fehlendeNachreichbareDokumente`),
 * halten den Vorgang aber nicht auf.
 */
export function sperrendePflichtDokumente(opts: PflichtEingaben): string[] {
  return effektivePflichtDokumente(opts).filter((t) => !istNachreichbar(t));
}

/**
 * Ermittelt die fehlenden **sperrenden** Pflicht-Dokumente.
 *
 * Client und Server rufen dieselbe Funktion auf — sonst zeigt der Fragebogen
 * einen Hinweis, den der Server nicht kennt, oder umgekehrt.
 *
 * Der Name sagt „missing required", gemeint ist „missing blocking": Was hier
 * herauskommt, sperrt. Wer wissen will, welche Pflichtunterlage noch fehlt,
 * ohne dass sie sperrt — fuer die Mahnung im Formular, fuer die Kennzeichnung
 * des Vorgangs und die Meldung an HR —, nimmt `fehlendeNachreichbareDokumente`.
 */
export function computeMissingRequiredDocuments(
  opts: PflichtEingaben & { uploadedTypes: readonly string[] },
): string[] {
  const uploaded = new Set(opts.uploadedTypes);
  return sperrendePflichtDokumente(opts).filter((t) => !uploaded.has(t));
}

/**
 * Die fehlenden Pflichtunterlagen, die **nicht** sperren.
 *
 * Zwei Verwender: das Formular (Mahnung an der Stelle, an der die Person die
 * Datei gerade in der Hand haelt) und der Server nach dem Absenden (Vorgang
 * sichtbar kennzeichnen, HR benachrichtigen). Ohne den zweiten waere die
 * Nachreichbarkeit ein stilles Fallenlassen der Pflicht.
 */
export function fehlendeNachreichbareDokumente(
  opts: PflichtEingaben & { uploadedTypes: readonly string[] },
): string[] {
  const uploaded = new Set(opts.uploadedTypes);
  return effektivePflichtDokumente(opts).filter(
    (t) => istNachreichbar(t) && !uploaded.has(t),
  );
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

/**
 * Derselbe Gedanke fuer den Masernschutz — mit einem Satz mehr.
 *
 * Er muss zwei Dinge gleichzeitig sagen: dass die Unterlage verlangt wird
 * (sonst wirkt sie freiwillig und wird nie nachgereicht) und dass sie das
 * Absenden nicht aufhaelt (sonst sucht jemand vergeblich nach dem Grund, warum
 * es nicht weitergeht, oder bricht ab). Der Hinweis auf das Gesundheitsamt ist
 * keine Drohung, sondern die ehrliche Auskunft, was ohne Nachweis folgt — er
 * beantwortet die Frage „und wenn ich es einfach lasse?" vorab.
 */
export const MASERNSCHUTZ_HINWEIS =
  "Für die Arbeit in Schulen und Kitas ist ein Masernschutz-Nachweis " +
  "vorgeschrieben, wenn Sie nach dem 31.12.1970 geboren sind — als " +
  "Impfnachweis, Immunitätsnachweis oder ärztliche Bescheinigung über eine " +
  "Kontraindikation. Sie können den Fragebogen auch ohne ihn absenden und die " +
  "Unterlage nachreichen. Liegt sie dauerhaft nicht vor, muss die " +
  "Personalabteilung das dem Gesundheitsamt melden.";
