/**
 * Die Vorbedingungen der Antragserzeugung — an einer Stelle, fuer alle Kanaele.
 *
 * Zwei Wege fuehren zu denselben beiden Formularen: der Beschaeftigte laedt sie
 * im Fragebogen herunter, HR erzeugt sie im Dokumente-Hub. Stuende die Pruefung
 * in beiden Routen, liefen die Meldungen auseinander — und schlimmer: Die
 * Oberflaeche wuerde einen Knopf anbieten, den die Route dann ablehnt.
 *
 * **Warum ueberhaupt sperren.** `docxtemplater` und aehnliche Wege ersetzen
 * fehlende Werte still durch „___". Bei einem amtlichen Antrag, der nach
 * § 8 Abs. 2 Nr. 4a BVV in die Entgeltunterlagen wandert und dort in der
 * Betriebspruefung landet, ist ein leeres Pflichtfeld schlimmer als gar kein
 * Formular: Es sieht vollstaendig aus und ist es nicht.
 *
 * **Warum nicht alles sperrt.** Die Pruefung unterscheidet danach, wer die
 * Angabe ueberhaupt beitragen kann:
 *
 * - **Betriebsnummer und Arbeitgebername** kennt nur das Portal. Fehlen sie,
 *   kann der Beschaeftigte nichts tun — dann darf auch kein Blatt entstehen.
 * - **Name und Rentenversicherungsnummer** sind seine eigenen Angaben. Fehlt
 *   die Nummer, bleiben die Kaestchen leer, so wie im amtlichen Blankoformular
 *   auch; er haelt beim Unterschreiben ohnehin einen Stift in der Hand. Ihn
 *   deshalb am Ausdruck zu hindern, waere Bevormundung — und das Absenden des
 *   Fragebogens prueft die Nummer ohnehin ein zweites Mal.
 */

import { betriebsnummerFehltText } from "@/lib/betriebsnummer";
import {
  type AntragsArt,
  antragsArtFuerEntscheidung,
} from "@/lib/rv-antrag-wortlaut";

export interface AntragVoraussetzungen {
  /** Die in Schritt 11 getroffene Entscheidung. */
  rvEntscheidung: string | null | undefined;
  /** Name des Mandanten. */
  mandantName: string | null | undefined;
  /** Betriebsnummer des Mandanten (achtstellig) oder null. */
  betriebsnummer: string | null | undefined;
}

export type AntragPruefung =
  | { erlaubt: true; art: AntragsArt }
  | { erlaubt: false; grund: string };

/**
 * Darf dieser Antrag jetzt erzeugt werden?
 *
 * `art` ist optional: Ohne Angabe ergibt sie sich aus der Entscheidung. Wird sie
 * uebergeben, muss sie dazu passen — sonst koennte ein manipulierter Aufruf den
 * Aufhebungsantrag fuer jemanden erzeugen, der sich gerade erst befreien laesst.
 */
export function pruefeAntragMoeglich(
  v: AntragVoraussetzungen,
  gewuenschteArt?: AntragsArt
): AntragPruefung {
  const art = antragsArtFuerEntscheidung(v.rvEntscheidung);

  if (!art) {
    return {
      erlaubt: false,
      grund:
        "Für diesen Vorgang ist kein Antrag zur Rentenversicherung vorgesehen. " +
        "Ein Antrag entsteht nur, wenn im Schritt „Rentenversicherung“ die " +
        "Befreiung oder deren Aufhebung gewählt wurde.",
    };
  }

  if (gewuenschteArt && gewuenschteArt !== art) {
    return {
      erlaubt: false,
      grund:
        "Der angeforderte Antrag passt nicht zur getroffenen Entscheidung. " +
        "Bitte laden Sie die Seite neu.",
    };
  }

  const mandant = (v.mandantName ?? "").trim();
  if (!mandant) {
    return {
      erlaubt: false,
      grund:
        "Dem Vorgang ist kein Mandant zugeordnet. Der Antrag verlangt den Namen " +
        "des Arbeitgebers. Bitte wenden Sie sich an die Personalabteilung.",
    };
  }

  const bn = (v.betriebsnummer ?? "").trim();
  if (!bn) {
    return { erlaubt: false, grund: betriebsnummerFehltText(mandant) };
  }

  return { erlaubt: true, art };
}

/**
 * Kurzfassung fuer die Oberflaeche: Kann der Knopf angeboten werden?
 *
 * Bewusst dieselbe Funktion wie in der Route — ein Knopf, der klickbar ist und
 * dann eine Fehlermeldung liefert, ist schlimmer als kein Knopf.
 */
export function antragVerfuegbar(v: AntragVoraussetzungen): boolean {
  return pruefeAntragMoeglich(v).erlaubt;
}
