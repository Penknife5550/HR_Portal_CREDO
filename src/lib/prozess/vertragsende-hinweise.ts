/**
 * Vertragsende: die Hinweise über der Arbeit (UX-Umbau, Pilot)
 *
 * Rein und client-sicher, ohne Uhr im Innern (`jetzt` kommt herein). Die
 * neue Detailseite zeigt sie über ALLEN Reitern, in dieser Reihenfolge — die
 * alte Seite hatte sie nur im Reiter Übersicht, die Vorstand-Warnung dazu
 * doppelt (Übersicht und Dokumente).
 *
 * Die Regeln, OB ein Hinweis greift, sind die der alten Seite
 * (`getSignatureWarning`, `getKettenbefristungWarning`, die Felder des
 * Vorgangs). Neu sind die Texte: ohne Anrede, ohne Großschreibung als
 * Betonung, ohne Emojis (Feinplan 3.6). Zwei Ausnahmen mit Grund stehen an
 * ihrem Hinweis: die Vorstand-Warnung (nur bei entschiedener Übernahme und
 * laufendem Vorgang) und die Kettenbefristung (nur bei laufendem Vorgang).
 *
 * Feinplan: docs/module/ux-ui/pilot-feinplan.md, Abschnitt 3.4.
 */
import { formatDatumDE } from "@/lib/format";
import { getKettenbefristungWarning } from "@/lib/contract-end-warnings";
import { entfristungsWarnung, tageBisVertragsende, tageText, type VertragsendeStand } from "@/lib/prozess/vertragsende";

/** Was die Hinweise über den Vorgang wissen müssen — eng, wie `VertragsendeStand`. */
export interface HinweisStand extends VertragsendeStand {
  vorstandAbgestimmt: boolean | null;
  befristungsart: string | null;
  bisherigeBefristungMonate: number | null;
  bisherigeVerlaengerungen: number | null;
  contractEndDateGeaendertAm: string | null;
  weitereMandanten: string[];
}

export type HinweisSchluessel = "entfristung" | "vorstand" | "kettenbefristung" | "dokubit" | "weitere-mandanten";

export interface HinweisAngabe {
  /** Stabil, für `key` und Tests; die Seite wählt daran auch ein eigenes Symbol. */
  schluessel: HinweisSchluessel;
  ton: "critical" | "wait" | "info";
  titel: string;
  text: string;
}

const ENDSTATUS = ["ABGESCHLOSSEN", "STORNIERT"];

/**
 * Die zutreffenden Hinweise eines Vorgangs, in der Reihenfolge der Anzeige:
 * erst die kritischen, dann die zur Vorsicht, dann die zur Kenntnis.
 */
export function vertragsendeHinweise(stand: HinweisStand, jetzt: Date): HinweisAngabe[] {
  const hinweise: HinweisAngabe[] = [];
  const offen = !ENDSTATUS.includes(stand.status);
  const ende = formatDatumDE(stand.contractEndDate);

  // § 15 Abs. 5 TzBfG — dieselbe Regel wie Pille und „Jetzt dran".
  if (entfristungsWarnung(stand, jetzt)) {
    const tage = tageBisVertragsende(stand.contractEndDate, jetzt);
    hinweise.push({
      schluessel: "entfristung",
      ton: "critical",
      titel: "Entfristungsrisiko (§ 15 Abs. 5 TzBfG)",
      text:
        tage !== null && tage < 0
          ? `Das Vertragsende (${ende}) ist überschritten, und es liegt kein unterschriebener Vertrag vor. Arbeitet die Person weiter, gilt das Arbeitsverhältnis als unbefristet – bitte sofort klären.`
          : `Bis zum Vertragsende (${ende}${tage === null ? "" : `, ${tageText(tage)}`}) muss der unterschriebene Verlängerungsvertrag vorliegen – sonst droht durch Weiterarbeit ein unbefristetes Arbeitsverhältnis.`,
    });
  }

  // Die alte Seite zeigte die Warnung auch nach dem Abschluss weiter (Reiter
  // Dokumente). „Vor der Vertragserstellung klären" ist dann keine Aufgabe
  // mehr — bei abgeschlossenen und stornierten Vorgängen entfällt sie. Und nur
  // bei entschiedener Übernahme: Das Formular speichert den Vermerk schon beim
  // Zwischenspeichern; lehnt die Führungskraft danach ab (oder steht noch
  // nichts fest), bliebe ein `false` stehen, das keine Übernahme betrifft.
  if (stand.vorstandAbgestimmt === false && stand.decision === "UEBERNAHME" && offen) {
    hinweise.push({
      schluessel: "vorstand",
      ton: "critical",
      titel: "Nicht mit Vorstand oder Geschäftsführung abgestimmt",
      text: "Die Führungskraft hat angegeben, dass die Übernahme nicht mit Vorstand oder Geschäftsführung abgestimmt ist. Vor der Vertragserstellung klären.",
    });
  }

  const kette = getKettenbefristungWarning({
    befristungsart: stand.befristungsart,
    bisherigeBefristungMonate: stand.bisherigeBefristungMonate,
    bisherigeVerlaengerungen: stand.bisherigeVerlaengerungen,
  });
  // Wie die Vorstand-Warnung nur bei offenem Vorgang: Die Grenze betrifft die
  // NAECHSTE Befristung; nach Abschluss oder Storno ist hier nichts mehr zu tun.
  if (kette && offen) {
    hinweise.push({
      schluessel: "kettenbefristung",
      ton: "wait",
      titel: "Hinweis zur Befristung (§ 14 TzBfG)",
      text: kette.reason,
    });
  }

  if (stand.contractEndDateGeaendertAm && offen) {
    const am = formatDatumDE(stand.contractEndDateGeaendertAm);
    hinweise.push({
      schluessel: "dokubit",
      ton: "wait",
      titel: am ? `Vertragsende von DokuBit geändert (${am})` : "Vertragsende von DokuBit geändert",
      text: "Das gemeldete Vertragsende hat sich geändert, obwohl der Vorgang schon weit fortgeschritten war – vermutlich ist die Verlängerung bereits vollzogen. Bitte prüfen und den Vorgang gegebenenfalls abschließen.",
    });
  }

  const weitere = stand.weitereMandanten.map((m) => m.trim()).filter(Boolean);
  if (weitere.length > 0) {
    hinweise.push({
      schluessel: "weitere-mandanten",
      ton: "info",
      titel: "Person hat weitere Einstellungen",
      text: `Laut DokuBit zusätzlich beschäftigt bei: ${weitere.join(", ")}. Bei der Vertragsgestaltung die Gesamtarbeitszeit beachten.`,
    });
  }

  return hinweise;
}
