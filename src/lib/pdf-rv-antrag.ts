/**
 * Die beiden Antragsanlagen als PDF — Seiten 8 und 9 der Minijob-Checkliste.
 *
 * Ein Formular, kein Fliesstext. Deshalb feste Positionen statt der Helfer aus
 * `pdf-export-onboarding.ts`: Deren `checkBreak()` legt bei Platzmangel eine
 * Seite nach — hier waere das genau falsch, denn eine Unterschrift, die auf
 * Seite 2 rutscht, gehoert nicht mehr zum Antrag. Am Ende steht deshalb eine
 * harte Pruefung auf genau eine Seite.
 *
 * **Was ausgefuellt wird und was nicht.** Vorbelegt werden die fuenf Werte, die
 * der Vordruck kennt und das Portal hat: Name, Vorname, Rentenversicherungs-
 * nummer, Arbeitgebername, Betriebsnummer. Alles andere bleibt leer, und zwar
 * mit Grund:
 *
 * - **Ort und Datum des Beschaeftigten** setzt erst die Unterschrift. Ein
 *   vorgedrucktes Datum waere eine Behauptung ueber einen Zeitpunkt, den das
 *   Portal nicht kennt.
 * - **„ist am ... bei mir eingegangen"** ist eine Feststellung des Arbeitgebers.
 *   Zum Zeitpunkt des Drucks hat der Antrag den Arbeitgeber noch gar nicht
 *   erreicht — das Blatt wird ja gerade erst zum Unterschreiben ausgegeben.
 * - **„wirkt ab ..."** haengt daran, ob der Arbeitgeber rechtzeitig an die
 *   Minijob-Zentrale meldet (naechste Entgeltabrechnung, spaetestens sechs
 *   Wochen). Diese Bedingung steht beim Druck noch nicht fest.
 * - **Beide Unterschriftszeilen** sind der einzige Grund, warum ueberhaupt
 *   gedruckt wird.
 *
 * Diese vier Felder erfasst AP 12 auf der HR-Seite; auf dem Vordruck bleiben sie
 * handschriftlich. Einzige Ausnahme: die zwei Kaestchen „0" und „1" in der
 * Wirkungszeile des Aufhebungsantrags — die sind Vordruck, nicht Vorbefuellung.
 *
 * **Kein CREDO-Branding auf dem Formularkoerper.** Weder Logo noch Farbbalken
 * noch DMS-QR-Code: Das Blatt geht in die Entgeltunterlagen und soll dort als
 * Vordruck erkennbar bleiben, nicht als CREDO-Dokument.
 */

import PDFDocument from "pdfkit";
import {
  ANTRAGS_WORTLAUT,
  type AntragsArt,
  FASSUNG_ANZEIGE,
  GEMEINSAM,
  HERKUNFT,
} from "@/lib/rv-antrag-wortlaut";

// =============================================
// Geometrie
// =============================================
const SEITE = { breite: 595.28, hoehe: 841.89 };
const X = 56;
const BREITE = 474;

/** Ein Kaestchen des Vordrucks. */
const KASTEN = { breite: 18, hoehe: 22 };

/**
 * Der Fuss ist fest verankert, nicht angehaengt.
 *
 * Der Aufhebungsantrag traegt einen Absatz mehr als der Befreiungsantrag. Liefe
 * der Hinweiskasten einfach hinter dem Inhalt her, schoebe er sich dort ueber
 * die Standzeile — genau das ist beim ersten Bau passiert. pdfkit legt in so
 * einem Fall keine neue Seite an, die Einseitigkeitspruefung greift also nicht:
 * Der Text ueberdruckt sich lautlos.
 */
const FUSS = {
  /** Unterkante des grauen Hinweiskastens. */
  hinweisUnten: 775,
  standY: 790,
  herkunftY: 802,
};

const SCHWARZ = "#000000";
const GRAU = "#555555";

export interface RvAntragDaten {
  /** Nachname des Beschaeftigten. */
  nachname: string;
  /** Vorname des Beschaeftigten. */
  vorname: string;
  /**
   * Rentenversicherungsnummer im Klartext.
   *
   * Kommt aus dem verschluesselten Feld `PersonalData.socialSecurityNumber` und
   * wird nur fuer diesen einen Druck entschluesselt — der Zugriff gehoert ins
   * AuditLog (`sensitiveFields`).
   */
  rentenversicherungsnummer: string;
  /** Name des Mandanten, wie er im Arbeitgeberteil erscheint. */
  arbeitgeberName: string;
  /** Achtstellige Betriebsnummer der Bundesagentur fuer Arbeit. */
  betriebsnummer: string;
}

// =============================================
// Zeichen-Helfer
// =============================================

/**
 * Eine Reihe von Kaestchen, von links gefuellt.
 *
 * Kaestchen werden gezeichnet, nie als Zeichen gesetzt: Die Glyphen ☐ und ✓
 * liegen ausserhalb von WinAnsi und fallen mit den Standard-Helvetica-Fonts
 * lautlos aus — pdfkit schreibt dann den rohen Codepoint, im Viewer steht
 * Kraut. Genau dieser Fehler steckt seit Langem im Checklisten-PDF.
 *
 * Liefert das x hinter dem letzten Kaestchen zurueck, damit die Zeile
 * „... ist am [Kaestchen] bei mir eingegangen." weiterlaufen kann.
 */
function kaestchenReihe(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  anzahl: number,
  wert: string,
  opt: { trennerNach?: number[]; fettBis?: number } = {}
): number {
  const zeichen = [...wert];
  const trenner = new Set(opt.trennerNach ?? []);

  for (let i = 0; i < anzahl; i++) {
    const kx = x + i * KASTEN.breite;
    doc
      .rect(kx, y, KASTEN.breite, KASTEN.hoehe)
      .lineWidth(trenner.has(i) || trenner.has(i - 1) ? 1.2 : 0.7)
      .strokeColor(SCHWARZ)
      .stroke();

    const z = zeichen[i];
    if (z !== undefined) {
      const fett = opt.fettBis !== undefined && i < opt.fettBis;
      doc
        .font(fett ? "Helvetica-Bold" : "Helvetica")
        .fontSize(11)
        .fillColor(SCHWARZ)
        .text(z, kx, y + 6, { width: KASTEN.breite, align: "center" });
    }
  }
  return x + anzahl * KASTEN.breite;
}

/** Die Beschriftung T T M M J J J J unter einem Datumsfeld. */
function datumsBeschriftung(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number
): void {
  doc.font("Helvetica").fontSize(7.5).fillColor(SCHWARZ);
  GEMEINSAM.datumsBeschriftung.forEach((b, i) => {
    doc.text(b, x + i * KASTEN.breite, y, {
      width: KASTEN.breite,
      align: "center",
    });
  });
}

/** Beschriftung links, Schreiblinie rechts — fuer Name und Vorname. */
function schreiblinie(
  doc: PDFKit.PDFDocument,
  y: number,
  label: string,
  wert: string,
  linieVon: number,
  linieBis: number
): void {
  doc.font("Helvetica").fontSize(10.5).fillColor(SCHWARZ).text(label, X, y);
  if (wert) {
    doc
      .font("Helvetica")
      .fontSize(10.5)
      .fillColor(SCHWARZ)
      // Kein Umbruch: Ein langer Name darf das Formular nicht auseinanderschieben.
      .text(wert, linieVon + 4, y, {
        width: linieBis - linieVon - 8,
        lineBreak: false,
        ellipsis: true,
      });
  }
  doc
    .moveTo(linieVon, y + 15)
    .lineTo(linieBis, y + 15)
    .lineWidth(0.7)
    .strokeColor(SCHWARZ)
    .stroke();
}

/** Zwei leere Linien nebeneinander: links Ort/Datum, rechts die Unterschrift. */
function unterschriftsblock(
  doc: PDFKit.PDFDocument,
  y: number,
  legende: string
): number {
  doc.lineWidth(0.7).strokeColor(SCHWARZ);
  doc.moveTo(X, y).lineTo(X + 175, y).stroke();
  doc.moveTo(X + 200, y).lineTo(X + BREITE, y).stroke();

  doc
    .font("Helvetica")
    .fontSize(10)
    .fillColor(SCHWARZ)
    .text(GEMEINSAM.ortDatum, X + 20, y + 5);

  doc.font("Helvetica").fontSize(7.5).fillColor(SCHWARZ);
  const legendeHoehe = doc.heightOfString(legende, { width: BREITE - 200 });
  doc.text(legende, X + 200, y + 5, { width: BREITE - 200 });

  return y + 5 + Math.max(legendeHoehe, 14);
}

/** Der graue Hinweiskasten am Fuss des Blattes. */
function hinweisKasten(
  doc: PDFKit.PDFDocument,
  y: number,
  hinweis: string
): number {
  doc.font("Helvetica").fontSize(8.5);
  const textHoehe = doc.heightOfString(hinweis, { width: BREITE - 16 });
  const hoehe = textHoehe + 26;

  doc.rect(X, y, BREITE, hoehe).fillColor("#F0F0F0").fill();

  // Nach .fill() gilt die Fuellfarbe auch fuer den folgenden Text — deshalb
  // Font, Groesse und Farbe vor jedem .text() neu setzen.
  doc
    .font("Helvetica-Bold")
    .fontSize(8.5)
    .fillColor(SCHWARZ)
    .text(GEMEINSAM.hinweisUeberschrift, X + 8, y + 7);
  doc
    .font("Helvetica")
    .fontSize(8.5)
    .fillColor(SCHWARZ)
    .text(hinweis, X + 8, y + 19, { width: BREITE - 16 });

  return y + hoehe;
}

// =============================================
// Das Blatt
// =============================================

/**
 * Erzeugt einen der beiden Antraege als einseitiges PDF.
 *
 * Wirft, wenn das Layout auf zwei Seiten laeuft — pdfkit legt sonst still eine
 * Seite nach, und niemand merkt, dass die Unterschriftszeile vom Formular
 * getrennt wurde.
 */
export function generateRvAntragPdf(
  art: AntragsArt,
  daten: RvAntragDaten
): Promise<Buffer> {
  const w = ANTRAGS_WORTLAUT[art];

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: [SEITE.breite, SEITE.hoehe],
      margin: 0,
      bufferPages: true,
      info: {
        Title:
          art === "BEFREIUNG"
            ? "Antrag auf Befreiung von der Rentenversicherungspflicht"
            : "Antrag auf Aufhebung der Befreiung von der Rentenversicherungspflicht",
        Author: "CREDO HR-Portal",
      },
    });

    const teile: Buffer[] = [];
    doc.on("data", (d: Buffer) => teile.push(d));
    doc.on("error", reject);
    doc.on("end", () => {
      try {
        resolve(Buffer.concat(teile));
      } catch (e) {
        reject(e);
      }
    });

    let y = 60;

    // --- Kopf ---
    doc.font("Helvetica-Bold").fontSize(11).fillColor(SCHWARZ)
      .text(GEMEINSAM.anlage, X, y);
    y += 34;

    doc.font("Helvetica-Bold").fontSize(11.5).fillColor(SCHWARZ)
      .text(w.titel, X, y, { width: BREITE });
    y = doc.y + 18;

    // --- Arbeitnehmerteil ---
    doc.font("Helvetica").fontSize(10.5).fillColor(SCHWARZ)
      .text(GEMEINSAM.rubrikArbeitnehmer, X, y, { underline: true });
    y += 20;

    schreiblinie(doc, y, GEMEINSAM.name, daten.nachname, X + 58, X + 240);
    y += 28;
    schreiblinie(doc, y, GEMEINSAM.vorname, daten.vorname, X + 58, X + 240);
    y += 30;

    doc.font("Helvetica").fontSize(10.5).fillColor(SCHWARZ)
      .text(GEMEINSAM.rentenversicherungsnummer, X + 4, y + 6);
    kaestchenReihe(
      doc,
      X + 172,
      y,
      12,
      // Die Nummer kommt aus einem Freitextfeld und traegt in der Praxis
      // Leerzeichen; ins Kaestchenraster passt nur die reine Folge.
      daten.rentenversicherungsnummer.replace(/\s/g, "").toUpperCase(),
      // Aufbau der Versicherungsnummer: 2 Bereich | 6 Geburtsdatum | 1 Buchstabe
      // | 2 Serie | 1 Pruefziffer.
      { trennerNach: [1, 7, 8, 10] }
    );
    y += KASTEN.hoehe + 18;

    // --- Erklaerung des Beschaeftigten ---
    for (const absatz of w.absaetze) {
      doc.font("Helvetica").fontSize(10).fillColor(SCHWARZ)
        .text(absatz, X, y, { width: BREITE, align: "justify" });
      y = doc.y + 10;
    }
    y += 16;

    y = unterschriftsblock(doc, y, GEMEINSAM.legendeArbeitnehmer);
    y += 18;

    // --- Arbeitgeberteil ---
    doc.font("Helvetica").fontSize(10.5).fillColor(SCHWARZ)
      .text(GEMEINSAM.rubrikArbeitgeber, X, y, { underline: true });
    y += 20;

    schreiblinie(doc, y, GEMEINSAM.name, daten.arbeitgeberName, X + 58, X + 330);
    y += 28;

    doc.font("Helvetica").fontSize(10.5).fillColor(SCHWARZ)
      .text(GEMEINSAM.betriebsnummer, X, y + 6);
    kaestchenReihe(doc, X + 100, y, 8, daten.betriebsnummer);
    y += KASTEN.hoehe + 22;

    // --- Eingangsdatum: bleibt leer, siehe Kopfkommentar ---
    doc.font("Helvetica").fontSize(10.5).fillColor(SCHWARZ)
      .text(w.eingangZeile.vor, X, y + 6);
    const nachEingang = kaestchenReihe(doc, X + 168, y, 8, "");
    datumsBeschriftung(doc, X + 168, y + KASTEN.hoehe + 2);
    doc.font("Helvetica").fontSize(10.5).fillColor(SCHWARZ)
      .text(w.eingangZeile.nach, nachEingang + 8, y + 6);
    y += KASTEN.hoehe + 22;

    // --- Wirkungsdatum: leer, bis auf den vorgedruckten Monatsersten ---
    doc.font("Helvetica").fontSize(10.5).fillColor(SCHWARZ)
      .text(w.wirkungZeile, X, y + 6);
    const wirkungX = X + (art === "AUFHEBUNG" ? 200 : 130);
    const nachWirkung = kaestchenReihe(
      doc,
      wirkungX,
      y,
      8,
      w.wirkungVorgedruckt,
      { fettBis: w.wirkungVorgedruckt.length }
    );
    datumsBeschriftung(doc, wirkungX, y + KASTEN.hoehe + 2);
    doc.font("Helvetica").fontSize(10.5).fillColor(SCHWARZ)
      .text(".", nachWirkung + 6, y + 6);
    y += KASTEN.hoehe + 30;

    y = unterschriftsblock(doc, y, GEMEINSAM.legendeArbeitgeber);

    // --- Hinweiskasten, von unten her gesetzt ---
    doc.font("Helvetica").fontSize(8.5);
    const hinweisHoehe =
      doc.heightOfString(w.hinweis, { width: BREITE - 16 }) + 26;
    const hinweisOben = FUSS.hinweisUnten - hinweisHoehe;

    if (y + 12 > hinweisOben) {
      reject(
        new Error(
          `Das Antragslayout passt nicht auf eine Seite: Der Inhalt endet bei ` +
            `${Math.round(y)} pt, der Hinweiskasten beginnt bei ` +
            `${Math.round(hinweisOben)} pt. Beides wuerde sich ueberdrucken.`
        )
      );
      return;
    }

    hinweisKasten(doc, hinweisOben, w.hinweis);

    // --- Fuss: Stand und Herkunft ---
    doc.font("Helvetica").fontSize(7.5).fillColor(SCHWARZ)
      .text(FASSUNG_ANZEIGE, X, FUSS.standY);
    doc.font("Helvetica").fontSize(6.5).fillColor(GRAU)
      .text(HERKUNFT, X, FUSS.herkunftY, { width: BREITE });

    const seiten = doc.bufferedPageRange().count;
    if (seiten !== 1) {
      reject(
        new Error(
          `Das Antragslayout ist auf ${seiten} Seiten gelaufen. Die ` +
            `Unterschriftszeile waere vom Formular getrennt — Abbruch.`
        )
      );
      return;
    }

    doc.end();
  });
}
