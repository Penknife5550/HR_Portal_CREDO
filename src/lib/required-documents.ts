/**
 * Pflicht-Dokumente fuer den Personalfragebogen (Task P9).
 *
 * Welche Dokumente verpflichtend sind, ist pro Formular-Vorlage konfigurierbar
 * (FormTemplate.requiredDocuments). Dieser Helper liefert die Anzeige-Labels und
 * berechnet fehlende Pflicht-Dokumente — gemeinsam genutzt von Client (Hinweis +
 * Submit-Sperre) und Server (harte Durchsetzung beim Absenden).
 */
import type { DocumentType } from "@prisma/client";
import { masernschutzPflichtig } from "@/lib/masernschutz";

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
  AUFENTHALTSTITEL: "Aufenthaltstitel",
  ARBEITSERLAUBNIS: "Arbeitserlaubnis / Zusatzblatt",
  PKV_NACHWEIS: "Nachweis private Krankenversicherung",
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
  // Die drei Neuen sind auch REGELBASIERT (die Selbstauskunft zum
  // Aufenthaltstitel bzw. die Versicherungsart erzeugt sie). Sie stehen hier
  // trotzdem, weil sonst niemand sie im Vorlagen-Editor sehen kann — und weil
  // VALID_DOCUMENT_TYPES in der Vorlagen-Route aus DOCUMENT_TYPE_LABELS
  // gebildet wird, waeren sie ohnehin speicherbar, nur nicht anklickbar.
  "AUFENTHALTSTITEL",
  "ARBEITSERLAUBNIS",
  "PKV_NACHWEIS",
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
 * **Nachreichbar** ist die Ausnahme. Diese Unterlagen werden als Pflicht
 * angezeigt und angemahnt, halten das Absenden aber nicht auf. Den Anfang
 * machte der Masernschutz-Nachweis (Entscheidung 07.09.2026). Zwei Gruende:
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
 * Fuer **Aufenthaltstitel, Arbeitserlaubnis und den PKV-Nachweis** gilt dasselbe
 * (Entscheidung 08.09.2026), aus einem eigenen dritten Grund: Das Risiko
 * entsteht bei der BESCHAEFTIGUNG, nicht beim Ausfuellen des Fragebogens. Wer
 * ohne gueltigen Titel arbeitet, ist das Problem — nicht, wer seinen Scan zwei
 * Tage spaeter schickt. Dazu kommt ein Fall, den eine Sperre unloesbar machte:
 * Waehrend einer Verlaengerung liegt der Titel im ORIGINAL bei der
 * Auslaenderbehoerde. Die Person kann ihn dann gar nicht einscannen — und haenge
 * an einer Sperre fest, die sie durch nichts aufheben kann.
 *
 * Beim Befreiungsantrag ist es genau umgekehrt, deshalb sperrt der: Ohne die
 * unterschriebene Seite kommt die Befreiung rechtlich nicht zustande. Ihn
 * nachreichen zu lassen hiesse, eine Entscheidung zu protokollieren, die es
 * nicht gibt.
 *
 * Wer hier einen Typ eintraegt, nimmt ihm die Sperrwirkung — auch fuer den
 * Server. Das ist eine fachliche Entscheidung, keine Anzeigefrage.
 */
export const NACHREICHBARE_PFLICHTEN: readonly string[] = [
  "MASERNSCHUTZ",
  "AUFENTHALTSTITEL",
  "ARBEITSERLAUBNIS",
  "PKV_NACHWEIS",
];

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
  /**
   * Selbstauskunft aus Schritt 1: Braucht diese Person fuer die Beschaeftigung
   * in Deutschland einen Aufenthaltstitel?
   *
   * Bewusst die ANTWORT und nicht `nationality`. Das Feld ist Freitext, es gibt
   * im Projekt keine Laenderliste, und bei Doppelstaatlern steht dort
   * "deutsch/tuerkisch" — eine Regel darauf spraeche einer Deutschen die
   * Arbeitserlaubnis ab.
   *
   * `null`/`undefined` heisst "noch nicht beantwortet" und erzeugt KEINE
   * Pflicht. Das ist die unangenehmere der beiden Richtungen (siehe Risiko 2 im
   * Plan: ein Falsch-Negativ ist teurer als ein Falsch-Positiv), aber die
   * einzig vertretbare: Wer nie gefragt wurde, kann nicht an einer Forderung
   * haengenbleiben. Die Frage ist deshalb in Schritt 1 ein Pflichtfeld ohne
   * Vorbelegung.
   */
  aufenthaltstitelErforderlich?: boolean | null;
  /**
   * `"gesetzlich"` oder `"privat"` aus Schritt 4 — der Wert von
   * `PersonalData.healthInsuranceType`.
   *
   * Nur `"privat"` erzeugt die Pflicht. Jede andere Belegung (auch ein leeres
   * Feld oder ein spaeter hinzugekommener dritter Wert) laesst sie weg: Der
   * PKV-Nachweis ist das Gegenstueck zur Mitgliedsbescheinigung der
   * gesetzlichen Kasse, und wer gesetzlich versichert ist, hat keinen.
   */
  healthInsuranceType?: string | null;
}

/**
 * Typen, ueber die AUSSCHLIESSLICH die Regel unten entscheidet.
 *
 * Sie fallen aus der Vorlagen-Konfiguration ausnahmslos heraus und kommen
 * gleich danach gezielt zurueck. Das hat zwei Gruende, die beide zaehlen:
 *
 * - **Ohne das Entfernen** traefe eine im Vorlagen-Editor angehakte Pflicht
 *   jeden — auch die Verwaltungskraft ohne Kinderkontakt (Masernschutz) und die
 *   deutsche Bewerberin, die nie einen Aufenthaltstitel brauchen wird.
 * - **Ohne das Wiederaufnehmen** entstuende die Pflicht nie, denn keine Vorlage
 *   fuehrt diese Typen in `requiredDocuments`.
 *
 * Wer hier einen Typ eintraegt, muss ihn unten auch wieder hinzufuegen — sonst
 * ist er stillschweigend abgeschaltet.
 */
const REGELBASIERTE_TYPEN: ReadonlySet<string> = new Set([
  "RV_BEFREIUNG",
  "MASERNSCHUTZ",
  "AUFENTHALTSTITEL",
  "ARBEITSERLAUBNIS",
  "PKV_NACHWEIS",
]);

/**
 * Welche Dokumente dieser Vorgang tatsaechlich verlangt.
 *
 * Die Vorlagen-Konfiguration ist nur der Ausgangspunkt. Fuenf Pflichten haengen
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
 * - **Aufenthaltstitel UND Arbeitserlaubnis** nur, wenn die Person in Schritt 1
 *   angegeben hat, einen Titel zu brauchen. Beide, weil die Erlaubnis zur
 *   Beschaeftigung entweder auf dem Titel selbst steht oder auf einem eigenen
 *   Zusatzblatt — welcher Fall vorliegt, weiss nur die Person mit dem Papier in
 *   der Hand. Ein Portal, das die Frage stellt, braucht dafuer eine dritte
 *   Angabe; verlangt es schlicht beides, geht nichts verloren, weil beide
 *   nachreichbar sind und niemanden aufhalten. Auch der Aufenthaltsstatus ist
 *   ein Datum, aus dem sich die ethnische Herkunft ableiten laesst — es bei
 *   Deutschen ohne Anlass abzufragen, waere die gleiche Grenzverletzung wie
 *   beim Masernschutz, deshalb auch hier das aktive Entfernen.
 * - **Nachweis der privaten Krankenversicherung** nur bei
 *   `healthInsuranceType === "privat"`. Er ist das Gegenstueck zur
 *   Mitgliedsbescheinigung der gesetzlichen Kasse (KK_BESCHEINIGUNG), die es
 *   hier laengst gibt.
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
    // Alles Regelbasierte faellt heraus und kommt gleich gezielt zurueck.
    if (REGELBASIERTE_TYPEN.has(t)) return false;
    return true;
  });

  if (opts.rvEntscheidung === "BEFREIUNG_BEANTRAGT") {
    pflicht.push("RV_BEFREIUNG");
  }

  if (opts.masernschutzPflichtig === true) {
    pflicht.push("MASERNSCHUTZ");
  }

  // Streng auf `=== true`: `null` ist "noch nicht beantwortet", nicht "ja".
  if (opts.aufenthaltstitelErforderlich === true) {
    pflicht.push("AUFENTHALTSTITEL", "ARBEITSERLAUBNIS");
  }

  if (opts.healthInsuranceType === "privat") {
    pflicht.push("PKV_NACHWEIS");
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
 * Die nachreichbaren Pflichten dieses Vorgangs — ohne Blick auf das schon
 * Hochgeladene.
 *
 * Gedacht fuer die Stellen, die den Bestand gar nicht kennen und nur ankuendigen
 * wollen, WAS nachgereicht werden darf.
 *
 * Die Zusammenfassung in Schritt 10 war einmal dieser Verwender, ist es aber
 * nicht mehr: Sie bekommt die Liste inzwischen ueber einen Rueckkanal aus der
 * Upload-Komponente, die den Bestand ohnehin fuehrt (siehe die Begruendung im
 * Docblock von `step10-summary.tsx` — zwei Rechnungen nebeneinander liefen
 * auseinander, weil `effektivePflichtDokumente` die regelbasierten Typen zuvor
 * ausnahmslos aus der Vorlagenliste entfernt). Wer hier einen Aufrufer sucht,
 * findet also unter Umstaenden gerade keinen; die Funktion bleibt trotzdem der
 * richtige Weg fuer die naechste bestandslose Stelle.
 *
 * Nicht zu verwechseln mit `fehlendeNachreichbareDokumente`: Was hier
 * herauskommt, ist die Pflicht — nicht die Luecke. Wer wissen will, was HEUTE
 * noch fehlt (Kasten „Offene Nachweise" der Vorgangsansicht, Vermerk beim
 * Absenden), nimmt jene Funktion.
 */
export function nachreichbarePflichtDokumente(opts: PflichtEingaben): string[] {
  return effektivePflichtDokumente(opts).filter((t) => istNachreichbar(t));
}

/**
 * Die fehlenden Pflichtunterlagen, die **nicht** sperren.
 *
 * Der Verwender ist der Server nach dem Absenden: Er haelt die offenen
 * Nachweise am Vorgang fest (Protokolleintrag `DOKUMENTE_NACHZUREICHEN` in
 * derselben Transaktion wie die Abgabe) und macht sie damit abfragbar. Ohne ihn
 * waere die Nachreichbarkeit ein stilles Fallenlassen der Pflicht: Der Vorgang
 * ginge als vollstaendig durch, und die Meldung ans Gesundheitsamt, mit der der
 * Verzicht auf die Sperre begruendet ist, haette keine Datengrundlage.
 *
 * Das Formular mahnt an einer anderen Stelle und mit anderen Mitteln — je
 * Eintrag in der Karte „Pflichtdokumente" (dort liegt der Bestand vor) plus dem
 * Ausblick aus `NACHREICHEN_FOLGEN_HINWEIS` in der Zusammenfassung. Diese
 * Funktion braucht es dafuer nicht.
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
 * Woraus ein Vorgang seine Pflichten bezieht — die Rohdaten, wie Server und
 * Vorgangsansicht sie ohnehin in der Hand haben.
 *
 * Locker typisiert wie `SpurenStand` in onboarding-spuren.ts: Der Server reicht
 * einen Prisma-Datensatz herein (Geburtsdatum als `Date`, Enums), die
 * Vorgangsansicht die JSON-Antwort der Detailroute (Geburtsdatum als
 * Zeichenkette).
 */
export interface PflichtQuelle {
  /**
   * Die Pflicht-Dokumenttypen der Vorlage, so wie der Aufrufer sie hat.
   *
   * Der Rueckfall auf die Geburtsurkunden fuer einen Fragebogentyp OHNE
   * Vorlage passiert beim Laden der Vorlage, nicht hier: Absendezweig und
   * `GET /api/onboarding/[id]` schreiben `vorlage?.requiredDocuments ?? [...]`.
   * Das ist `??` und nicht `||` — eine Vorlage mit leerer Liste bleibt leer.
   *
   * `null`/`undefined` heisst „keine Liste bekommen" und gilt als leere Liste.
   * So hielt es die Vorgangsansicht (`data.requiredDocuments ?? []`); der
   * Server liefert immer eine Liste und merkt davon nichts.
   */
  required: readonly string[] | null | undefined;
  /** Eingetragene Kinder — Server `child.count`, Vorgangsansicht `children.length`. */
  anzahlKinder: number;
  /** `Organization.type`, entscheidet ueber den Masernschutz. */
  organisationstyp: string | null | undefined;
  personalData?: {
    birthDate?: unknown;
    rvEntscheidung?: string | null;
    aufenthaltstitelErforderlich?: boolean | null;
    healthInsuranceType?: string | null;
  } | null;
}

/**
 * Die `PflichtEingaben` eines Vorgangs — EINE Stelle fuer alle, die sie bauen.
 *
 * Bis Paket 4 stand dieser Block zweimal: im Absendezweig des Fragebogens
 * (`/api/fragebogen/[token]`, POST) und im Kasten „Offene Nachweise" der
 * Vorgangsansicht. Mit der Nachforderung kommt ein dritter Leser dazu (der
 * Server prueft sensible Arten gegen die Pflicht, Feinplanung Abschnitt 11) —
 * und bisher stand die Rechnung fuer den Kasten nur im Client. Drei Nachbauten
 * laufen auseinander; dann mahnt HR etwas an, das der Server nicht verlangt.
 *
 * Die Regeln selbst werden NICHT nachgebaut, sondern aufgerufen:
 * `masernschutzPflichtig` fuer den Masernschutz, alles Uebrige wertet
 * `effektivePflichtDokumente` aus. Hier werden nur die Felder zugeordnet, und
 * zwar mit genau den Rueckfaellen, die beide Aufrufer bisher hatten
 * (`?? null` bei den Selbstauskuenften, fehlendes Geburtsdatum = nicht
 * pflichtig).
 */
export function pflichtEingabenAusVorgang(q: PflichtQuelle): PflichtEingaben {
  const pd = q.personalData;
  return {
    required: q.required ?? [],
    hasChildren: q.anzahlKinder > 0,
    rvEntscheidung: pd?.rvEntscheidung ?? null,
    masernschutzPflichtig: masernschutzPflichtig({
      geburtsdatum: pd?.birthDate,
      organisationstyp: q.organisationstyp,
    }),
    aufenthaltstitelErforderlich: pd?.aufenthaltstitelErforderlich ?? null,
    healthInsuranceType: pd?.healthInsuranceType ?? null,
  };
}

/**
 * Die offenen Nachweise eines Vorgangs: nachreichbare Pflichten, zu denen
 * noch kein Dokument vorliegt.
 *
 * Dieselbe Rechnung wie `fehlendeNachreichbareDokumente` — bewusst, denn der
 * Absendezweig haelt mit jener Funktion fest, was bei der Abgabe offen war.
 * Der eigene Name steht fuer den Arbeitsvorrat danach: Kasten „Offene
 * Nachweise" und die Vorauswahl der Nachforderung (Paket 4) lesen hier.
 *
 * `vorhandeneTypen` sind die Typen ALLER Dokumente des Vorgangs, gleich in
 * welchem Status — so rechnet der Kasten seit jeher.
 *
 * Ob eine Luecke schon eine Luecke ist, entscheidet diese Funktion nicht:
 * Solange die Person ihren Fragebogen noch ausfuellt, laedt sie selbst hoch.
 * Das Tor dafuer ist `nachweiseAbgegeben` in onboarding-spuren.ts.
 */
export function offeneNachweise(
  eingaben: PflichtEingaben,
  vorhandeneTypen: readonly string[],
): string[] {
  return fehlendeNachreichbareDokumente({ ...eingaben, uploadedTypes: vorhandeneTypen });
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

/**
 * Aufenthaltstitel — hier kommt eine dritte Aufgabe dazu: das ABLAUFDATUM.
 *
 * Ohne es kann die Fristenüberwachung nichts sagen (siehe
 * `src/lib/dokument-fristen.ts`, das ohne Datum bewusst KEINE Stufe liefert).
 * Der Satz muss also erklaeren, warum ein zweites Feld neben der Datei steht —
 * sonst wirkt es wie eine Schikane und bleibt leer.
 */
export const AUFENTHALTSTITEL_HINWEIS =
  "Bitte laden Sie Ihren Aufenthaltstitel hoch (Vorder- und Rückseite bzw. " +
  "die Karte im Ganzen) und tragen Sie das Ablaufdatum ein. Das Datum brauchen " +
  "wir, damit wir Sie rechtzeitig vor Ablauf an die Verlängerung erinnern " +
  "können — eine Verlängerung dauert bei der Ausländerbehörde oft mehrere " +
  "Wochen. Sie können den Fragebogen auch ohne den Nachweis absenden und ihn " +
  "nachreichen, etwa wenn Ihr Titel gerade bei der Behörde liegt.";

/**
 * Arbeitserlaubnis — der Satz muss den haeufigsten Fall zuerst nennen.
 *
 * In aller Regel steht die Erlaubnis zur Beschaeftigung auf dem Titel selbst
 * ("Erwerbstaetigkeit gestattet"); ein eigenes Zusatzblatt gibt es nur in
 * bestimmten Konstellationen. Wer das nicht liest, sucht ein Papier, das er nie
 * bekommen hat.
 */
export const ARBEITSERLAUBNIS_HINWEIS =
  "Die Erlaubnis zu arbeiten steht meist auf dem Aufenthaltstitel selbst " +
  "(„Erwerbstätigkeit gestattet“). Ein eigenes Blatt gibt es nur in manchen " +
  "Fällen — etwa als Zusatzblatt oder als Beschäftigungserlaubnis zur Duldung. " +
  "Haben Sie kein eigenes Blatt, laden Sie hier bitte die Seite Ihres Titels " +
  "hoch, auf der die Erlaubnis vermerkt ist. Auch das können Sie nachreichen.";

/**
 * PKV-Nachweis — bewusst ohne Nennung von Beitrag oder Tarif.
 *
 * Verlangt wird der Nachweis, DASS eine Versicherung besteht (und dass sie den
 * Arbeitgeberzuschuss nach § 257 SGB V traegt). Was sie kostet, geht den
 * Arbeitgeber nichts an — der Satz darf also nicht zum Hochladen der ganzen
 * Police einladen.
 */
export const PKV_NACHWEIS_HINWEIS =
  "Als privat versicherte Person legen Sie bitte eine Bescheinigung Ihrer " +
  "Krankenversicherung über den bestehenden Versicherungsschutz vor. Eine " +
  "Beitragsübersicht oder der vollständige Vertrag ist nicht nötig. Sie können " +
  "den Fragebogen auch ohne den Nachweis absenden und ihn nachreichen.";

/**
 * Der Hinweis je Dokumenttyp, an EINER Stelle.
 *
 * Die Oberflaeche schlaegt hier nach, statt fuenf Sonderfaelle zu verzweigen —
 * sonst bekommt der sechste Typ seinen Satz nie, weil niemand das `if`
 * nachtraegt. Typen ohne Eintrag brauchen keine Erklaerung; das ist der
 * Regelfall, `undefined` also kein Fehler.
 */
export const PFLICHT_HINWEISE: Record<string, string> = {
  RV_BEFREIUNG: RV_BEFREIUNG_HINWEIS,
  MASERNSCHUTZ: MASERNSCHUTZ_HINWEIS,
  AUFENTHALTSTITEL: AUFENTHALTSTITEL_HINWEIS,
  ARBEITSERLAUBNIS: ARBEITSERLAUBNIS_HINWEIS,
  PKV_NACHWEIS: PKV_NACHWEIS_HINWEIS,
};

/**
 * Der Satz in der Zusammenfassung, unmittelbar vor dem Absende-Knopf.
 *
 * Die Hinweise oben stehen je Unterlage in der Upload-Karte und erklaeren, WAS
 * verlangt wird. Hier steht das, was die Person unmittelbar vor der
 * verbindlichen Abgabe wissen muss, und es sind drei Dinge:
 *
 * 1. **Das Absenden ist frei.** Ohne diese Zusage sucht jemand, der seinen Scan
 *    gerade nicht hat, den gesperrten Knopf — und bricht ab. Der Knopf ist gar
 *    nicht gesperrt.
 * 2. **Der Vorgang wird trotzdem als offen gefuehrt.** Sonst liest sich die
 *    Nachreichbarkeit wie ein Erlass. Die Pflicht bleibt, nur der Zeitpunkt
 *    verschiebt sich.
 * 3. **Der Link traegt danach nicht mehr.** Nach dem Absenden weist die
 *    Upload-Route den Magic Link ab (validateMagicToken ohne allowSubmitted).
 *    Wer das nicht weiss, legt die Unterlage beiseite mit dem Vorsatz, sie
 *    „nachher ueber den Link" zu schicken — und der Nachweis kommt nie.
 */
export const NACHREICHEN_FOLGEN_HINWEIS =
  "Sie können den Fragebogen absenden, auch wenn eine dieser Unterlagen noch " +
  "fehlt. Ihr Vorgang wird dann mit dem Vermerk „Nachweis offen“ an die " +
  "Personalabteilung übergeben; sie kommt auf Sie zu und nimmt die Unterlage " +
  "entgegen. Über diesen Link können Sie nach dem Absenden nichts mehr " +
  "hochladen — was Sie jetzt schon zur Hand haben, laden Sie deshalb besser " +
  "oben gleich hoch.";

// =============================================
// Paket 4 „Unterlagen nachfordern"
// (Feinplanung docs/module/onboarding/paket4-feinplanung.md, Abschnitte 10.1, 11, 18 N4)
// =============================================

/**
 * Dokumentarten, die als vertraulich gelten (Entscheidung E-1, 25.09.2026):
 *
 * - `MASERNSCHUTZ` und `SB_AUSWEIS`: Gesundheitsdaten (Art. 9 DSGVO),
 * - `FUEHRUNGSZEUGNIS`: Daten ueber Straftaten (Art. 10 DSGVO),
 * - `AUFENTHALTSTITEL` und `ARBEITSERLAUBNIS`: Der Aufenthaltsstatus verraet
 *   die Herkunft (siehe `effektivePflichtDokumente`, derselbe Grund fuer das
 *   aktive Entfernen).
 *
 * Folgen: Sie lassen sich nur anfordern, wenn `sensibelAnforderbar` es
 * zulaesst, eine Mail nennt sie nur neutral (E-2), und das Oeffnen eines
 * solchen Dokuments wird protokolliert.
 */
export const SENSIBLE_DOKUMENTTYPEN: readonly string[] = [
  "MASERNSCHUTZ",
  "SB_AUSWEIS",
  "FUEHRUNGSZEUGNIS",
  "AUFENTHALTSTITEL",
  "ARBEITSERLAUBNIS",
];

/**
 * Dokumentarten, fuer die ein Scan nicht genuegt: Das unterschriebene
 * Original gehoert zusaetzlich in die Personalakte (Entscheidung E-4). Fuer
 * den Befreiungsantrag verlangt § 6 Abs. 1b SGB VI die Schriftform (siehe
 * `RV_BEFREIUNG_HINWEIS`), bei den drei Vertraegen ist es die Unterschrift
 * beider Seiten.
 *
 * Diese Arten tragen bei einer Nachforderung fest den Hinweis auf das
 * Original. Ein angenommener Scan setzt KEINEN Merker „Original liegt vor" —
 * das Papier sieht das Portal nie.
 */
export const SCHRIFTFORM_DOKUMENTTYPEN: readonly string[] = [
  "ARBEITSVERTRAG",
  "RV_BEFREIUNG",
  "VL_VERTRAG",
  "BAV_VERTRAG",
];

/** Warum eine vertrauliche Unterlage (noch) nicht angefordert werden darf. */
export type SensibelSperrgrund =
  | "FUEHRUNGSZEUGNIS_KITA"
  | "SB_AUSWEIS_OHNE_ANGABE"
  | "NICHT_PFLICHT";

/** Die Gruende im Klartext — fuer den Dialog (ausgegraut mit Grund) und die 409. */
export const SENSIBEL_SPERRGRUND_TEXTE: Readonly<Record<SensibelSperrgrund, string>> = {
  FUEHRUNGSZEUGNIS_KITA:
    "Bei Kitas vorerst gesperrt: Freie Träger der Jugendhilfe dürfen nach " +
    "§ 72a Abs. 5 SGB VIII nur die Einsichtnahme, das Datum und das Ergebnis " +
    "festhalten, keine Kopie. Die Klärung mit dem Datenschutzbeauftragten " +
    "steht noch aus.",
  SB_AUSWEIS_OHNE_ANGABE:
    "Nur anforderbar, wenn die Person im Fragebogen eine Schwerbehinderung " +
    "angegeben hat oder der Ausweis schon vorliegt.",
  NICHT_PFLICHT:
    "Vertrauliche Unterlage: nur anforderbar, wenn sie für diesen Vorgang " +
    "Pflicht ist oder schon vorliegt.",
};

export type SensibelPruefung =
  | { ok: true }
  | { ok: false; grund: SensibelSperrgrund; text: string };

function gesperrt(grund: SensibelSperrgrund): SensibelPruefung {
  return { ok: false, grund, text: SENSIBEL_SPERRGRUND_TEXTE[grund] };
}

/**
 * Darf HR diese Dokumentart bei der Person anfordern (bzw. eine angenommene
 * Datei als diese Art ablegen)? Nicht sensible Arten immer; fuer sensible
 * gelten die Regeln aus Entscheidung E-1:
 *
 * - **Fuehrungszeugnis bei Kitas: gesperrt**, auch wenn es Pflicht ist oder
 *   schon vorliegt, bis der Datenschutzbeauftragte entschieden hat. Freie
 *   Traeger der Jugendhilfe duerfen nach § 72a Abs. 5 SGB VIII nur
 *   Einsichtnahme, Datum und Ergebnis erheben — keine Kopie.
 * - **Schwerbehindertenausweis** nur, wenn er schon vorliegt oder die Person
 *   im Fragebogen „schwerbehindert" angegeben hat (`severelyDisabled`). Die
 *   Pflicht allein genuegt NICHT: Der Typ ist in jeder Vorlage frei anhakbar,
 *   und `effektivePflichtDokumente` kennt fuer ihn keine Regel — sonst holte
 *   eine angehakte Vorlage Gesundheitsdaten von allen ein.
 * - **Alle uebrigen sensiblen Arten** nur, wenn sie fuer den Vorgang Pflicht
 *   sind (`effektivePflichtDokumente`) oder schon als Dokument vorliegen (der
 *   verlaengerte Nachweis).
 *
 * Der Server prueft das beim Anfordern, Ergaenzen und bei der Wahl der Art
 * beim Annehmen (409); der Dialog zeigt dieselbe Antwort vorab. Freie Zeilen
 * lassen sich nicht pruefen — dagegen hilft nur der Hinweis im Dialog.
 *
 * @param stand.pflicht die effektiven Pflichten des Vorgangs
 *   (`effektivePflichtDokumente(pflichtEingabenAusVorgang(...))`)
 * @param stand.vorhanden die Typen der Dokumente, die der Vorgang schon hat
 * @param stand.severelyDisabled `PersonalData.severelyDisabled`
 * @param stand.organisationstyp `Organization.type` des Vorgangs
 *
 * Alle vier Schluessel sind Pflicht, auch die beiden, die `undefined` tragen
 * duerfen (wie `organisationstyp` in `PflichtQuelle`): Ein Aufrufer, der den
 * Organisationstyp vergaesse, bekaeme fuer das Fuehrungszeugnis einer Kita
 * still `ok` — so meldet schon tsc die Luecke.
 */
export function sensibelAnforderbar(
  typ: string,
  stand: {
    pflicht: readonly string[];
    vorhanden: readonly string[];
    severelyDisabled: boolean | null | undefined;
    organisationstyp: string | null | undefined;
  },
): SensibelPruefung {
  if (!SENSIBLE_DOKUMENTTYPEN.includes(typ)) return { ok: true };

  if (typ === "FUEHRUNGSZEUGNIS" && stand.organisationstyp === "KITA") {
    return gesperrt("FUEHRUNGSZEUGNIS_KITA");
  }

  const vorhanden = stand.vorhanden.includes(typ);
  if (typ === "SB_AUSWEIS") {
    // Streng auf `=== true`, wie bei den Selbstauskuenften oben: `null` ist
    // „nicht beantwortet", nicht „ja".
    return vorhanden || stand.severelyDisabled === true
      ? { ok: true }
      : gesperrt("SB_AUSWEIS_OHNE_ANGABE");
  }

  return vorhanden || stand.pflicht.includes(typ) ? { ok: true } : gesperrt("NICHT_PFLICHT");
}

/**
 * Die Hinweise je Dokumentart, wenn HR eine Unterlage NACHFORDERT — der Dialog
 * setzt sie als Vorschlag ein, die Upload-Seite zeigt sie der Person immer.
 *
 * **In der Mail nur bei nicht sensiblen Arten.** Bei `SENSIBLE_DOKUMENTTYPEN`
 * steht die Position dort nur neutral („Eine vertrauliche Unterlage …") und
 * OHNE Hinweis (E-2, Feinplanung 8.2) — gleich, ob der Text von hier stammt
 * oder HR ihn geaendert hat. Drei der Texte unten (Masernschutz,
 * Aufenthaltstitel, Arbeitserlaubnis) verrieten sonst genau, was E-2 verbirgt.
 *
 * Eigene Texte und nicht `PFLICHT_HINWEISE`: Jene sprechen vom Absenden des
 * Fragebogens („Sie können den Fragebogen auch ohne ihn absenden und die
 * Unterlage nachreichen") und vom Gesundheitsamt. Beides ist nach der Abgabe
 * falsch bzw. fehl am Platz — die Person wird hier ja gerade um die Unterlage
 * gebeten. Ein Test haelt fest, dass kein Text „Fragebogen" oder „nachreich"
 * enthaelt.
 *
 * **Arbeitserlaubnis (Regel N4):** Der Text darf nicht behaupten, der
 * Aufenthaltstitel genuege. Die Pflichtregel verlangt beide Arten
 * (`effektivePflichtDokumente`); steht die Erlaubnis auf dem Titel, laedt die
 * Person dieselbe Karte zu beiden Positionen hoch — oder HR quittiert die
 * Position mit „Entfällt…". Sonst bliebe sie offen, und Erinnerung und
 * „Frist verstrichen" liefen weiter.
 *
 * Den Zusatz zum Original haengen Mail und Upload-Seite bei
 * `SCHRIFTFORM_DOKUMENTTYPEN` selbst an; er steht hier deshalb nicht noch
 * einmal.
 */
export const NACHFORDERUNG_HINWEISE: Readonly<Record<string, string>> = {
  RV_BEFREIUNG:
    "Für die Befreiung von der Rentenversicherungspflicht ist die Schriftform " +
    "vorgeschrieben. Bitte laden Sie den ausgedruckten und unterschriebenen " +
    "Antrag hoch.",
  MASERNSCHUTZ:
    "Bitte laden Sie nur die Seite Ihres Impfpasses mit den Masern-Impfungen " +
    "hoch, ein ärztliches Zeugnis über Ihre Immunität oder eine ärztliche " +
    "Bescheinigung, dass Sie nicht geimpft werden können.",
  AUFENTHALTSTITEL:
    "Bitte laden Sie Vorder- und Rückseite hoch und tragen Sie das " +
    "Ablaufdatum ein. Damit erinnern wir Sie rechtzeitig vor Ablauf an die " +
    "Verlängerung.",
  ARBEITSERLAUBNIS:
    "Die Erlaubnis zu arbeiten steht meist auf dem Aufenthaltstitel selbst " +
    "(„Erwerbstätigkeit gestattet“). Haben Sie kein eigenes Blatt, laden Sie " +
    "hier bitte die Seite Ihres Titels hoch, auf der die Erlaubnis vermerkt " +
    "ist, auch wenn Sie dieselbe Karte schon beim Aufenthaltstitel hochladen. " +
    "Bitte tragen Sie auch hier das Ablaufdatum ein.",
  PKV_NACHWEIS:
    "Bitte nur die Bescheinigung über den bestehenden Versicherungsschutz, " +
    "keine Beitragsübersicht und nicht den Vertrag.",
};
