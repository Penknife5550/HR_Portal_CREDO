/**
 * Entscheidung zur Rentenversicherung — Abschnitt 5 der Minijob-Checkliste.
 *
 * Das ist die folgenreichste Frage im ganzen Fragebogen. Wer sich befreien
 * laesst, hat sofort etwa 3,6 % mehr auf dem Konto und spaeter weniger Rente —
 * und merkt den Unterschied erst in Jahrzehnten. Das amtliche Merkblatt
 * empfiehlt deshalb ausdruecklich eine individuelle Beratung.
 *
 * Daraus folgt fuer die Texte hier:
 *
 * - **Kein Schubs in eine Richtung.** Beide Wege stehen gleichwertig
 *   nebeneinander, mit ihren Vor- und Nachteilen in derselben Ausfuehrlichkeit.
 * - **Keine Beratung.** Wir erklaeren, was die Wahl bedeutet, und verweisen auf
 *   die Deutsche Rentenversicherung. Was fuer den Einzelnen richtig ist, kann
 *   ein Formular nicht wissen.
 * - **Zahlen statt Prozente allein.** "3,6 %" sagt wenig; "rund 22 € im Monat
 *   bei 603 € Verdienst" sagt etwas.
 *
 * Die Beitragssaetze stehen vorerst hier. Mit AP 4 (Rechengroessen) ziehen sie
 * in die gepflegte Werte-Tabelle um und werden am Vorgang eingefroren.
 */

export type RvEntscheidungWert =
  | "KEINE_BEFREIUNG"
  | "BEFREIUNG_BEANTRAGT"
  | "RENTENVERSICHERUNGSFREI"
  | "AUFHEBUNG_BEANTRAGT";

/**
 * Rechengroessen, Stand 2026.
 *
 * Vorlaeufig hier — bis AP 4 sie versioniert fuehrt. Die Werte fuer
 * Privathaushalte (5 % / 13,6 %) fehlen bewusst: Ein Schultraeger ist keiner.
 */
export const RV_SAETZE = {
  /** Geringfuegigkeitsgrenze in Euro pro Monat. */
  grenze: 603,
  /** Pauschalbeitrag des Arbeitgebers in Prozent. */
  arbeitgeber: 15,
  /** Eigenanteil des Arbeitnehmers in Prozent. */
  eigenanteil: 3.6,
  /** Voller Beitragssatz in Prozent. */
  voll: 18.6,
  /** Mindestbemessungsgrundlage in Euro. */
  mindestbemessung: 175,
} as const;

/**
 * Prozentwert in deutscher Schreibweise: 3.6 wird zu "3,6".
 *
 * Ohne diesen Helfer rutscht der englische Dezimalpunkt aus `String(3.6)` in
 * die Oberflaeche — in einem deutschen Formular liest sich "3.6 %" falsch.
 */
export function prozent(wert: number): string {
  return String(wert).replace(".", ",");
}

/** Euro-Betrag in deutscher Schreibweise, mit zwei Nachkommastellen. */
export function euro(wert: number): string {
  return wert.toFixed(2).replace(".", ",");
}

/** Der Eigenanteil in Euro bei einem gegebenen Monatsverdienst. */
export function eigenanteilInEuro(monatsverdienst: number): number {
  return Math.round(monatsverdienst * (RV_SAETZE.eigenanteil / 100) * 100) / 100;
}

export interface RvOption {
  wert: RvEntscheidungWert;
  /** Die Auswahl selbst, aus Sicht des Beschaeftigten formuliert. */
  label: string;
  /** Eine Zeile darunter: was das konkret heisst. */
  kurz: string;
  /** Was daraus folgt — bewusst als Liste, damit es vergleichbar bleibt. */
  folgen: string[];
  /** Erfordert das Merkblatt vorher gelesen zu haben. */
  brauchtMerkblatt?: boolean;
  /** Erfordert die Bestaetigung der Bindungswirkung. */
  brauchtBindung?: boolean;
  /** Schriftform: Antrag ausdrucken, unterschreiben, hochladen. */
  brauchtUnterschrift?: boolean;
  /** Nur waehlbar ab diesem Datum (ISO). */
  erstAb?: string;
}

export const RV_OPTIONEN: readonly RvOption[] = [
  {
    wert: "KEINE_BEFREIUNG",
    label: "Ich möchte in der Rentenversicherung versichert bleiben.",
    kurz: `Von Ihrem Verdienst werden ${prozent(RV_SAETZE.eigenanteil)} % einbehalten — bei ${RV_SAETZE.grenze} € im Monat sind das rund ${euro(eigenanteilInEuro(RV_SAETZE.grenze))} €.`,
    folgen: [
      "Die Zeit zählt in vollem Umfang für Ihre Rente.",
      "Ihr Verdienst wird bei der Rentenberechnung voll berücksichtigt, nicht nur anteilig.",
      "Sie erwerben Ansprüche auf Reha-Leistungen und auf eine Rente wegen Erwerbsminderung.",
      "Sie können staatlich geförderte Altersvorsorge nutzen, etwa die Riester-Rente.",
      "Ein früherer Rentenbeginn rückt näher, weil die Wartezeiten voll zählen.",
    ],
  },
  {
    wert: "BEFREIUNG_BEANTRAGT",
    label: "Ich möchte mich von der Rentenversicherungspflicht befreien lassen.",
    kurz: `Sie bekommen die ${prozent(RV_SAETZE.eigenanteil)} % ausgezahlt statt sie einzuzahlen — und erwerben dafür nur anteilig Rentenansprüche.`,
    folgen: [
      `Nur Ihr Arbeitgeber zahlt noch, mit ${prozent(RV_SAETZE.arbeitgeber)} % Pauschalbeitrag.`,
      "Die Zeit zählt nur anteilig für die Wartezeiten Ihrer Rente.",
      "Ihr Verdienst wird bei der Rentenberechnung nur anteilig berücksichtigt.",
      "Sie erwerben keine vollen Ansprüche auf Reha und Erwerbsminderungsrente.",
      "Die Entscheidung gilt für alle Ihre Minijobs gleichzeitig.",
      "Seit dem 1. Juli 2026 können Sie sie einmalig wieder aufheben lassen — für die Zukunft, nicht rückwirkend.",
    ],
    brauchtMerkblatt: true,
    brauchtBindung: true,
    brauchtUnterschrift: true,
  },
  {
    wert: "RENTENVERSICHERUNGSFREI",
    label:
      "Ich bin bereits von Gesetzes wegen frei — als Altersvollrentner nach der Regelaltersgrenze oder als Versorgungsempfänger.",
    kurz: "Dann brauchen Sie gar keine Befreiung zu beantragen.",
    folgen: [
      "Es wird kein Eigenanteil von Ihrem Verdienst einbehalten.",
      "Ein Antrag ist nicht erforderlich.",
    ],
  },
  {
    wert: "AUFHEBUNG_BEANTRAGT",
    label:
      "Ich habe mich früher befreien lassen und möchte das rückgängig machen.",
    kurz: `Sie werden wieder versichert; von Ihrem Verdienst werden dann ${prozent(RV_SAETZE.eigenanteil)} % einbehalten.`,
    folgen: [
      "Die Aufhebung wirkt ab dem 1. des nächsten Monats — nicht rückwirkend.",
      "Sie gilt für alle Ihre Minijobs gleichzeitig.",
      "Sie ist für die Dauer der Beschäftigung bindend und kann nicht widerrufen werden.",
      "Diese Erklärung können Sie direkt hier abgeben — ohne Ausdruck.",
    ],
    brauchtBindung: true,
    // Neu eingefuehrt durch § 6 Abs. 6 SGB VI.
    erstAb: "2026-07-01",
  },
];

/** Ist diese Option zum gegebenen Zeitpunkt schon waehlbar? */
export function istWaehlbar(option: RvOption, stichtag: Date): boolean {
  if (!option.erstAb) return true;
  return stichtag >= new Date(option.erstAb);
}

export function getRvOption(
  wert: string | null | undefined
): RvOption | undefined {
  if (!wert) return undefined;
  return RV_OPTIONEN.find((o) => o.wert === wert);
}

/** Kurzbeschriftung fuer Zusammenfassung, HR-Ansicht und PDF. */
export function rvEntscheidungLabel(wert: string | null | undefined): string {
  const kurzformen: Record<RvEntscheidungWert, string> = {
    KEINE_BEFREIUNG: "Bleibt versicherungspflichtig",
    BEFREIUNG_BEANTRAGT: "Befreiung beantragt",
    RENTENVERSICHERUNGSFREI: "Rentenversicherungsfrei (keine Befreiung nötig)",
    AUFHEBUNG_BEANTRAGT: "Aufhebung einer früheren Befreiung beantragt",
  };
  if (!wert || !(wert in kurzformen)) return "—";
  return kurzformen[wert as RvEntscheidungWert];
}

/**
 * Die Kernaussagen des amtlichen Merkblatts, in eigenen Worten.
 *
 * Das Merkblatt selbst wird in AP 8 als Original beigelegt. Diese Fassung steht
 * im Formular, damit die Entscheidung nicht von einem PDF-Download abhaengt,
 * das niemand oeffnet.
 */
export const MERKBLATT_KERN = {
  titel: "Was die Befreiung für Ihre Rente bedeutet",
  einleitung:
    `Als Minijobber sind Sie grundsätzlich rentenversichert. Ihr Arbeitgeber zahlt ` +
    `${prozent(RV_SAETZE.arbeitgeber)} % Ihres Verdienstes, Sie selbst ` +
    `${prozent(RV_SAETZE.eigenanteil)} % — zusammen ergibt das ` +
    `den vollen Beitrag von ${prozent(RV_SAETZE.voll)} %. Berechnet wird mindestens auf ` +
    `${RV_SAETZE.mindestbemessung} € Verdienst, auch wenn Sie weniger verdienen.`,
  vorteile: [
    "Die Beschäftigungszeit zählt voll für die Mindestversicherungszeiten Ihrer Rente.",
    "Sie können früher in Rente gehen, weil die Wartezeit schneller erfüllt ist.",
    "Sie haben Anspruch auf Leistungen zur Reha — medizinisch und im Arbeitsleben.",
    "Sie erhalten Übergangsgeld während einer Reha-Maßnahme.",
    "Sie begründen oder erhalten den Anspruch auf eine Erwerbsminderungsrente.",
    "Sie haben einen Rechtsanspruch auf Entgeltumwandlung für eine Betriebsrente.",
    "Sie erfüllen die Voraussetzungen für die Riester-Förderung — gegebenenfalls sogar für Ihren Ehepartner.",
  ],
  verzicht:
    "Wer sich befreien lässt, verzichtet freiwillig auf diese Vorteile. Es zahlt " +
    "dann nur noch der Arbeitgeber, und Sie erwerben nur anteilig Wartezeiten. " +
    "Auch Ihr Verdienst zählt bei der Rentenberechnung nur anteilig.",
  beratung:
    "Bevor Sie sich entscheiden, empfiehlt die Deutsche Rentenversicherung ein " +
    "persönliches Beratungsgespräch. Das Servicetelefon ist kostenlos unter " +
    "0800 10004800 erreichbar — halten Sie dafür möglichst Ihre " +
    "Rentenversicherungsnummer bereit.",
} as const;

/**
 * Die Bindungswirkung, die der Beschaeftigte bestaetigen muss.
 *
 * Steht so sinngemaess in beiden Antragsanlagen: Die Entscheidung gilt fuer alle
 * gleichzeitig ausgeuebten Minijobs, und der Beschaeftigte verpflichtet sich,
 * seine uebrigen Arbeitgeber zu informieren. Ohne diese Zusage kann kein
 * Arbeitgeber wissen, ob er richtig abrechnet.
 */
export const BINDUNG_TEXT =
  "Mir ist bekannt, dass diese Entscheidung für alle meine Minijobs gleichzeitig " +
  "gilt und für die Dauer der Beschäftigungen bindend ist. Ich verpflichte mich, " +
  "alle weiteren Arbeitgeber, bei denen ich einen Minijob ausübe, darüber zu " +
  "informieren.";
