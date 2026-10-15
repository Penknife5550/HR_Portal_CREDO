/**
 * Erzeugt die beiden System-Word-Vorlagen der Ausstattung (A4, G19, E-A34):
 *
 *   public/system-dokumente/uebergabeprotokoll-ausstattung.docx  (ONBOARDING)
 *   public/system-dokumente/rueckgabeprotokoll-ausstattung.docx  (OFFBOARDING)
 *
 * Aufruf (nur zum Erzeugen; die Dateien werden eingecheckt):
 *
 *   node scripts/system-vorlagen/ausstattungsprotokolle.js
 *
 * Danach `npx jest system-vorlagen` – der Test haelt die eingecheckten Dateien
 * gegen dieses Skript, die Platzhalter gegen `SYSTEM_VORLAGEN` in
 * prisma/seed-check.js und rendert sie mit echten Listen. Aendert sich hier der
 * Text, aendert sich der Hash: Der Seed-Check aktualisiert die System-Vorlage
 * beim naechsten Start (nur Datei, Hash, Groesse, Platzhalter – Name,
 * Beschreibung, Aktiv-Schalter und Mandant pflegt HR).
 *
 * Aufbau je Vorlage (docxtemplater, `paragraphLoop`):
 *
 *   {#ausgaben_je_stelle}            Absatz allein → faellt beim Rendern weg
 *     Titel (Seitenumbruch davor)    eine Seite je Stelle
 *     Angaben zur Person und Stelle
 *     Tabelle: Kopfzeile + Zeile {#gegenstaende}…{/gegenstaende} (wiederholt)
 *     Unterschriftszeilen Stelle / Person
 *   {/ausgaben_je_stelle}
 *   {^ausgaben_je_stelle}            Leerblock: keine Ausgabe vermerkt
 *   {/ausgaben_je_stelle}
 *
 * Die Dateien liegen unter public/ und sind damit OEFFENTLICH abrufbar: Sie
 * enthalten nur feste Texte und Platzhalter, nie Daten (Test). Innere Namen
 * tragen ein Praefix (`ausgabe_…`, `rueckgabe_…`) – ein Name der Person
 * ({vorname}) im Inneren der Schleife faellt bewusst auf den Wert der Person
 * zurueck (Unterschriftszeile).
 *
 * Ohne Abhaengigkeit ausser PizZip (wie docxtemplater). Die Ausgabe ist
 * bytegleich je Lauf: festes Dateidatum im Zip, feste Reihenfolge.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const PizZip = require("pizzip");

// =============================================
// Vorlagen
// =============================================

/** Breite des Satzspiegels in Twips: A4 (11906) minus 2 × 2 cm Rand (1134). */
const SATZBREITE = 11906 - 2 * 1134;

/**
 * Die beiden Vorlagen. `liste` ist der Listen-Platzhalter des Resolvers
 * (placeholder-catalog.ts), `felder` die inneren Namen der Unterliste
 * `gegenstaende` in Tabellenreihenfolge.
 */
const VORLAGEN = {
  UEBERGABE: {
    datei: "uebergabeprotokoll-ausstattung.docx",
    titel: "Übergabeprotokoll Ausstattung",
    liste: "ausgaben_je_stelle",
    stelle: "ausgabe_stelle",
    angaben: [
      ["Einrichtung", "{mandant}"],
      ["Name", "{vorname} {nachname}"],
      ["Vorgangsnummer", "{vorgangsnummer}"],
      ["Dienstbeginn", "{eintrittsdatum}"],
    ],
    stelleLabel: "Ausgebende Stelle",
    einleitung: "Folgende Gegenstände wurden übergeben bzw. folgende Zugänge eingerichtet:",
    spalten: [
      { kopf: "Gegenstand bzw. Zugang", feld: "ausgabe_gegenstand", breite: 4638 },
      { kopf: "Kennung", feld: "ausgabe_kennung", breite: 2700 },
      { kopf: "Übergeben bzw. eingerichtet am", feld: "ausgabe_uebergeben_am", breite: 2300 },
    ],
    hinweis:
      "Mit der Unterschrift bestätigen beide Seiten die Übergabe. Beim Ausscheiden werden die Gegenstände zurückgegeben und die Zugänge gesperrt.",
    unterschriftStelle: "Übergeben ({ausgabe_stelle})",
    unterschriftPerson: "Erhalten ({vorname} {nachname})",
    leersatz:
      "Für diesen Vorgang ist im Portal keine Übergabe vermerkt. Bitte zuerst die Übergaben in der Karte „Ausstattung & Zugänge“ vermerken und das Protokoll danach erneut erzeugen.",
  },
  RUECKGABE: {
    datei: "rueckgabeprotokoll-ausstattung.docx",
    titel: "Rückgabeprotokoll Ausstattung",
    liste: "rueckgaben_je_stelle",
    stelle: "rueckgabe_stelle",
    angaben: [
      ["Einrichtung", "{mandant}"],
      ["Name", "{vorname} {nachname}"],
      ["Vorgangsnummer", "{vorgangsnummer}"],
      ["Letzter Arbeitstag", "{letzter_arbeitstag}"],
    ],
    stelleLabel: "Zuständige Stelle",
    einleitung: "Rückgabe der folgenden Gegenstände:",
    spalten: [
      { kopf: "Gegenstand", feld: "rueckgabe_gegenstand", breite: 3838 },
      { kopf: "Kennung", feld: "rueckgabe_kennung", breite: 2200 },
      { kopf: "Zustand", feld: "rueckgabe_zustand", breite: 2000 },
      { kopf: "Zurück am", feld: "rueckgabe_am", breite: 1600 },
    ],
    hinweis:
      "Ein leerer Zustand heißt: noch offen. Bitte bei der Rückgabe von Hand eintragen: zurück, beschädigt zurück oder fehlt.",
    unterschriftStelle: "Zurückgenommen ({rueckgabe_stelle})",
    unterschriftPerson: "Zurückgegeben ({vorname} {nachname})",
    leersatz:
      "Für diesen Austritt sind im Portal keine Rückgaben erfasst. Bitte zuerst im Reiter „Rückgaben“ die Einstellung zuordnen bzw. die Rückgaben erfassen und das Protokoll danach erneut erzeugen.",
  },
};

// =============================================
// WordprocessingML-Bausteine
// =============================================

const NS_W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const NS_R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const XML_KOPF = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

function esc(text) {
  return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Ein Textlauf; `fett` fuer Beschriftungen. */
function lauf(text, opts = {}) {
  const rPr = opts.fett ? "<w:rPr><w:b/><w:bCs/></w:rPr>" : "";
  return `<w:r>${rPr}<w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;
}

/**
 * Ein Absatz aus Laeufen. `stil` = Formatvorlage, `seitenumbruch` = neue Seite
 * davor (am ersten Absatz des Dokuments ohne Wirkung), `rahmenOben` = Linie fuer
 * die Unterschrift, `zusammen` = mit dem naechsten Absatz auf einer Seite,
 * `abstandVor` = Abstand davor in Twips (z.B. unter einer Tabelle).
 */
function absatz(laeufe, opts = {}) {
  const pPr = [
    opts.stil ? `<w:pStyle w:val="${opts.stil}"/>` : "",
    opts.zusammen ? "<w:keepNext/>" : "",
    opts.seitenumbruch ? "<w:pageBreakBefore/>" : "",
    opts.rahmenOben ? '<w:pBdr><w:top w:val="single" w:sz="6" w:space="1" w:color="auto"/></w:pBdr>' : "",
    opts.abstandVor ? `<w:spacing w:before="${opts.abstandVor}"/>` : "",
  ].join("");
  return `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ""}${laeufe.join("")}</w:p>`;
}

/** Ein Absatz, der nur einen Schleifen-Tag traegt – faellt mit `paragraphLoop` weg. */
function tagAbsatz(tag) {
  return absatz([lauf(tag)]);
}

/** Eine Tabellenzelle mit fester Breite. */
function zelle(breite, inhalt, opts = {}) {
  const shd = opts.kopf ? '<w:shd w:val="clear" w:color="auto" w:fill="E7E6E6"/>' : "";
  return `<w:tc><w:tcPr><w:tcW w:w="${breite}" w:type="dxa"/>${shd}</w:tcPr>${inhalt}</w:tc>`;
}

/** Eine Tabelle mit festen Spaltenbreiten; `rahmen` = Gitterlinien. */
function tabelle(breiten, zeilen, opts = {}) {
  const linie = (seite) => `<w:${seite} w:val="single" w:sz="4" w:space="0" w:color="auto"/>`;
  const rahmen = opts.rahmen
    ? `<w:tblBorders>${["top", "left", "bottom", "right", "insideH", "insideV"].map(linie).join("")}</w:tblBorders>`
    : "";
  const summe = breiten.reduce((a, b) => a + b, 0);
  return (
    "<w:tbl>" +
    `<w:tblPr><w:tblW w:w="${summe}" w:type="dxa"/>${rahmen}<w:tblLayout w:type="fixed"/>` +
    '<w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="1" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/></w:tblPr>' +
    `<w:tblGrid>${breiten.map((b) => `<w:gridCol w:w="${b}"/>`).join("")}</w:tblGrid>` +
    zeilen.join("") +
    "</w:tbl>"
  );
}

/** Kopfzeile und die eine Zeile, die je Gegenstand wiederholt wird. */
function gegenstandsTabelle(spalten) {
  const breiten = spalten.map((s) => s.breite);
  const kopf =
    "<w:tr><w:trPr><w:tblHeader/></w:trPr>" +
    spalten.map((s) => zelle(s.breite, absatz([lauf(s.kopf, { fett: true })]), { kopf: true })).join("") +
    "</w:tr>";
  const letzte = spalten.length - 1;
  const zeile =
    "<w:tr><w:trPr><w:cantSplit/></w:trPr>" +
    spalten
      .map((s, i) => {
        const text = `${i === 0 ? "{#gegenstaende}" : ""}{${s.feld}}${i === letzte ? "{/gegenstaende}" : ""}`;
        return zelle(s.breite, absatz([lauf(text)]));
      })
      .join("") +
    "</w:tr>";
  return tabelle(breiten, [kopf, zeile], { rahmen: true });
}

/** Zwei Unterschriftsfelder nebeneinander, dazwischen ein Abstand. */
function unterschriften(stelle, person) {
  const breite = Math.floor((SATZBREITE - 638) / 2);
  const feld = (label) =>
    zelle(
      breite,
      absatz([]) +
        absatz([]) +
        absatz([lauf("Datum, Unterschrift")], { rahmenOben: true, stil: "Hinweis" }) +
        absatz([lauf(label)]),
    );
  const zeile = `<w:tr><w:trPr><w:cantSplit/></w:trPr>${feld(stelle)}${zelle(638, absatz([]))}${feld(person)}</w:tr>`;
  return tabelle([breite, 638, breite], [zeile]);
}

/** „Beschriftung: Wert“ – die Beschriftung fett. */
function angabe(label, wert) {
  return absatz([lauf(`${label}: `, { fett: true }), lauf(wert)]);
}

// =============================================
// Dokument
// =============================================

/** Der Inhalt von word/document.xml einer Vorlage (`art`: "UEBERGABE" | "RUECKGABE"). */
function dokumentXml(art) {
  const v = VORLAGEN[art];
  if (!v) throw new Error(`Unbekannte Vorlage: ${art}`);

  const kopf = (seitenumbruch) => [
    absatz([lauf(v.titel)], { stil: "Protokolltitel", seitenumbruch }),
    ...v.angaben.map(([label, wert]) => angabe(label, wert)),
  ];

  const jeStelle = [
    tagAbsatz(`{#${v.liste}}`),
    // Neue Seite je Stelle: am ersten Absatz des Dokuments ohne Wirkung,
    // danach beginnt jede weitere Stelle oben auf einer eigenen Seite.
    ...kopf(true),
    angabe(v.stelleLabel, `{${v.stelle}}`),
    absatz([]),
    absatz([lauf(v.einleitung)], { zusammen: true }),
    gegenstandsTabelle(v.spalten),
    absatz([lauf(v.hinweis)], { stil: "Hinweis", abstandVor: 120 }),
    absatz([]),
    unterschriften(v.unterschriftStelle, v.unterschriftPerson),
    tagAbsatz(`{/${v.liste}}`),
  ];

  const leer = [
    tagAbsatz(`{^${v.liste}}`),
    ...kopf(false),
    absatz([]),
    absatz([lauf(v.leersatz)]),
    tagAbsatz(`{/${v.liste}}`),
  ];

  const abschnitt =
    '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>' +
    '<w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="709" w:footer="709" w:gutter="0"/>' +
    "</w:sectPr>";

  return (
    XML_KOPF +
    `<w:document xmlns:w="${NS_W}" xmlns:r="${NS_R}"><w:body>` +
    [...jeStelle, ...leer].join("") +
    // Der Koerper endet mit einem Absatz – auch wenn der Leerblock wegfaellt
    // und sonst die Unterschriften-Tabelle das letzte Element waere.
    absatz([]) +
    abschnitt +
    "</w:body></w:document>"
  );
}

const STYLES_XML =
  XML_KOPF +
  `<w:styles xmlns:w="${NS_W}">` +
  "<w:docDefaults>" +
  '<w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Arial" w:cs="Arial"/>' +
  '<w:sz w:val="21"/><w:szCs w:val="21"/><w:lang w:val="de-DE" w:eastAsia="de-DE" w:bidi="ar-SA"/></w:rPr></w:rPrDefault>' +
  '<w:pPrDefault><w:pPr><w:spacing w:after="80" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault>' +
  "</w:docDefaults>" +
  '<w:style w:type="paragraph" w:default="1" w:styleId="Standard"><w:name w:val="Normal"/><w:qFormat/></w:style>' +
  '<w:style w:type="paragraph" w:styleId="Protokolltitel"><w:name w:val="Protokolltitel"/><w:basedOn w:val="Standard"/>' +
  '<w:next w:val="Standard"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:after="240"/></w:pPr>' +
  '<w:rPr><w:b/><w:bCs/><w:sz w:val="32"/><w:szCs w:val="32"/></w:rPr></w:style>' +
  '<w:style w:type="paragraph" w:styleId="Hinweis"><w:name w:val="Hinweis"/><w:basedOn w:val="Standard"/>' +
  '<w:rPr><w:color w:val="595959"/><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr></w:style>' +
  '<w:style w:type="table" w:default="1" w:styleId="NormaleTabelle"><w:name w:val="Normal Table"/>' +
  '<w:uiPriority w:val="99"/><w:semiHidden/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar>' +
  '<w:top w:w="0" w:type="dxa"/><w:left w:w="85" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/>' +
  '<w:right w:w="85" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>' +
  "</w:styles>";

const SETTINGS_XML =
  XML_KOPF +
  `<w:settings xmlns:w="${NS_W}"><w:defaultTabStop w:val="709"/>` +
  '<w:characterSpacingControl w:val="doNotCompress"/><w:compat>' +
  '<w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/>' +
  "</w:compat></w:settings>";

const CONTENT_TYPES_XML =
  XML_KOPF +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
  '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
  '<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>' +
  "</Types>";

const RELS_XML =
  XML_KOPF +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
  "</Relationships>";

const DOCUMENT_RELS_XML =
  XML_KOPF +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
  '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>' +
  "</Relationships>";

/**
 * Festes Dateidatum im Zip, in ORTSZEIT gebaut: PizZip speichert das DOS-Datum
 * aus den lokalen Feldern – so ist die Datei auf jedem Rechner bytegleich.
 */
const ZIP_DATUM = new Date(2026, 9, 13, 12, 0, 0);

/** Die fertige .docx einer Vorlage als Buffer. */
function baueDocx(art) {
  const zip = new PizZip();
  const teile = [
    ["[Content_Types].xml", CONTENT_TYPES_XML],
    ["_rels/.rels", RELS_XML],
    ["word/document.xml", dokumentXml(art)],
    ["word/_rels/document.xml.rels", DOCUMENT_RELS_XML],
    ["word/styles.xml", STYLES_XML],
    ["word/settings.xml", SETTINGS_XML],
  ];
  for (const [name, inhalt] of teile) zip.file(name, inhalt, { date: ZIP_DATUM, createFolders: false });
  return zip.generate({ type: "nodebuffer", compression: "DEFLATE" });
}

/** Schreibt beide Vorlagen nach public/system-dokumente/. */
function main() {
  const ziel = path.join(__dirname, "..", "..", "public", "system-dokumente");
  for (const art of Object.keys(VORLAGEN)) {
    const datei = path.join(ziel, VORLAGEN[art].datei);
    fs.writeFileSync(datei, baueDocx(art));
    console.log(`geschrieben: ${path.relative(process.cwd(), datei)}`);
  }
}

if (require.main === module) {
  main();
}

module.exports = { VORLAGEN, dokumentXml, baueDocx };
