/**
 * BEM Mitarbeiter-Gesamtexport (DSGVO Art. 15 Auskunftsrecht).
 *
 * Erzeugt ein vollstaendiges, menschenlesbares PDF der kompletten BEM-Akte:
 * Stammdaten, Einwilligungen, Gespraeche (inkl. Notizen + Checkliste),
 * Massnahmen, Dokumentenliste, Versandnachweis und Zugriffs-/Aenderungs-
 * protokoll. Reine Funktion (PDFKit) — Entschluesselung + DB-Zugriff liegen
 * beim Aufrufer (zugriffsgeschuetzter Endpunkt), damit hier nichts leakt.
 */

import PDFDocument from "pdfkit";

const COLORS = {
  primary: "#575756",
  gruen: "#6BAA24",
  gelb: "#FBC900",
  rot: "#E2001A",
  blau: "#009AC6",
  gray: "#777777",
  black: "#1A1A1A",
};

export interface BemExportInput {
  displayId: string;
  status: string;
  statusLabel: string;
  eingangsweg: string;
  employee: { name: string; email?: string | null; personalNr?: string | null };
  schwerbehindert?: boolean;
  vertrauensperson?: string | null;
  organization?: { name: string; mandantNumber: string } | null;
  dates: {
    angelegtAm?: string | null;
    fehlzeitenAb?: string | null;
    einladungAm?: string | null;
    einwilligungAm?: string | null;
    erstgespraechAm?: string | null;
    beendetAm?: string | null;
    beendigungsgrund?: string | null;
    ergebnis?: string | null;
    aufbewahrungBis?: string | null;
  };
  einwilligungen: Array<{
    artLabel: string;
    statusLabel: string;
    signedAt?: string | null;
    signedName?: string | null;
    widerrufAm?: string | null;
  }>;
  gespraeche: Array<{
    typLabel: string;
    datum?: string | null;
    ort?: string | null;
    teilnehmer: string[];
    notizen?: string | null;
    checkliste: Array<{ titel: string; erledigt: boolean }>;
  }>;
  massnahmen: Array<{
    kategorieLabel: string;
    beschreibung: string;
    statusLabel: string;
    zustaendig?: string | null;
    frist?: string | null;
    evaluationAm?: string | null;
  }>;
  dokumente: Array<{
    typ: string;
    ablageLabel: string;
    quelle: string;
    dateiname: string;
    erstelltAm: string;
  }>;
  kommunikation: Array<{
    kanal: string;
    statusLabel: string;
    empfaenger: string;
    betreff?: string | null;
    gesendetAm: string;
    nachweis?: string | null;
  }>;
  protokoll: Array<{
    zeitpunkt: string;
    vorgang: string;
    person: string;
    ip?: string | null;
  }>;
  erstelltAm: string;
  erstelltVon: string;
}

export async function buildBemGesamtExportPdf(
  input: BemExportInput,
): Promise<Buffer> {
  const doc = new PDFDocument({
    size: "A4",
    margin: 50,
    info: {
      Title: `BEM-Gesamtexport ${input.displayId}`,
      Author: "CREDO HR-Portal",
    },
  });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));

  const L = 50;
  const W = 495;

  function credoLinie(y: number) {
    const w = W / 4;
    doc.rect(L, y, w, 2).fill(COLORS.gelb);
    doc.rect(L + w, y, w, 2).fill(COLORS.gruen);
    doc.rect(L + w * 2, y, w, 2).fill(COLORS.rot);
    doc.rect(L + w * 3, y, w, 2).fill(COLORS.blau);
    doc.fillColor(COLORS.black);
  }

  function heading(text: string) {
    if (doc.y > 720) doc.addPage();
    doc.moveDown(0.8);
    doc
      .font("Helvetica-Bold")
      .fontSize(13)
      .fillColor(COLORS.primary)
      .text(text, L, doc.y);
    doc.moveTo(L, doc.y + 2).lineTo(L + W, doc.y + 2).strokeColor("#DADADA").stroke();
    doc.moveDown(0.4);
    doc.fillColor(COLORS.black);
  }

  function kv(label: string, value: string | null | undefined) {
    if (doc.y > 770) doc.addPage();
    const y = doc.y;
    doc.font("Helvetica").fontSize(9).fillColor(COLORS.gray).text(label, L, y, { width: 150 });
    doc
      .font("Helvetica")
      .fontSize(10)
      .fillColor(COLORS.black)
      .text(value && value.trim() !== "" ? value : "—", L + 155, y, { width: W - 155 });
    doc.moveDown(0.2);
  }

  function para(text: string) {
    if (doc.y > 760) doc.addPage();
    doc.font("Helvetica").fontSize(10).fillColor(COLORS.black).text(text, L, doc.y, { width: W });
    doc.moveDown(0.2);
  }

  function small(text: string) {
    if (doc.y > 770) doc.addPage();
    doc.font("Helvetica").fontSize(9).fillColor(COLORS.gray).text(text, L, doc.y, { width: W });
  }

  // === Kopf ===
  doc.rect(L, 40, W, 3).fill(COLORS.primary);
  doc.font("Helvetica-Bold").fontSize(20).fillColor(COLORS.primary).text("CREDO HR-Portal", L, 58);
  doc.font("Helvetica").fontSize(11).fillColor(COLORS.gray).text(
    "BEM-Gesamtexport (Auskunft nach DSGVO Art. 15)",
    L,
    84,
  );
  credoLinie(106);
  doc.moveDown(1.5);
  doc.fillColor(COLORS.black);

  // === Stammdaten ===
  heading(`BEM-Fall ${input.displayId}`);
  kv("Beschäftigte:r", input.employee.name);
  kv("E-Mail", input.employee.email);
  kv("Personalnummer", input.employee.personalNr);
  kv(
    "Mandant",
    input.organization
      ? `${input.organization.mandantNumber} — ${input.organization.name}`
      : "—",
  );
  kv("Status", input.statusLabel);
  kv("Eingangsweg", input.eingangsweg === "DIGITAL" ? "Digital" : "Papier");
  kv("Schwerbehindert / gleichgestellt", input.schwerbehindert ? "Ja" : "Nein");
  if (input.vertrauensperson) kv("Vertrauensperson gewünscht", input.vertrauensperson);
  kv("Angelegt am", input.dates.angelegtAm);
  kv("Fehlzeiten ab", input.dates.fehlzeitenAb);
  kv("Einladung am", input.dates.einladungAm);
  kv("Einwilligung am", input.dates.einwilligungAm);
  kv("Erstgespräch am", input.dates.erstgespraechAm);
  if (input.dates.beendetAm) kv("Beendet am", input.dates.beendetAm);
  if (input.dates.ergebnis) kv("Ergebnis", input.dates.ergebnis);
  if (input.dates.beendigungsgrund) kv("Beendigungsgrund", input.dates.beendigungsgrund);
  if (input.dates.aufbewahrungBis) kv("Aufbewahrung bis", input.dates.aufbewahrungBis);

  // === Einwilligungen ===
  heading("Einwilligungen");
  if (input.einwilligungen.length === 0) {
    small("Keine Einwilligungen erfasst.");
  } else {
    for (const e of input.einwilligungen) {
      para(
        `${e.artLabel}: ${e.statusLabel}` +
          (e.signedAt ? `, am ${e.signedAt}` : "") +
          (e.signedName ? ` durch ${e.signedName}` : "") +
          (e.widerrufAm ? ` (widerrufen am ${e.widerrufAm})` : ""),
      );
    }
  }

  // === Gespraeche ===
  heading("Gespräche");
  if (input.gespraeche.length === 0) {
    small("Keine Gespräche dokumentiert.");
  } else {
    for (const g of input.gespraeche) {
      doc.moveDown(0.3);
      doc
        .font("Helvetica-Bold")
        .fontSize(11)
        .fillColor(COLORS.black)
        .text(`${g.typLabel}${g.datum ? ` — ${g.datum}` : ""}${g.ort ? `, ${g.ort}` : ""}`, L, doc.y, { width: W });
      if (g.teilnehmer.length > 0) small(`Teilnehmende: ${g.teilnehmer.join(", ")}`);
      if (g.notizen) para(g.notizen);
      for (const c of g.checkliste) {
        para(`${c.erledigt ? "[x]" : "[ ]"} ${c.titel}`);
      }
    }
  }

  // === Massnahmen ===
  heading("Maßnahmen");
  if (input.massnahmen.length === 0) {
    small("Keine Maßnahmen erfasst.");
  } else {
    for (const m of input.massnahmen) {
      doc.moveDown(0.3);
      doc
        .font("Helvetica-Bold")
        .fontSize(11)
        .fillColor(COLORS.black)
        .text(`${m.kategorieLabel} — ${m.statusLabel}`, L, doc.y, { width: W });
      para(m.beschreibung);
      const meta = [
        m.zustaendig ? `Zuständig: ${m.zustaendig}` : null,
        m.frist ? `Frist: ${m.frist}` : null,
        m.evaluationAm ? `Evaluation: ${m.evaluationAm}` : null,
      ]
        .filter(Boolean)
        .join(" · ");
      if (meta) small(meta);
    }
  }

  // === Dokumente ===
  heading("Dokumente");
  if (input.dokumente.length === 0) {
    small("Keine Dokumente in der Akte.");
  } else {
    for (const d of input.dokumente) {
      para(`${d.dateiname} (${d.typ}, ${d.ablageLabel}, ${d.quelle}, ${d.erstelltAm})`);
    }
  }

  // === Versandnachweis ===
  heading("Versandnachweis (Mails & Briefe)");
  if (input.kommunikation.length === 0) {
    small("Keine Mails/Briefe versendet.");
  } else {
    for (const k of input.kommunikation) {
      para(
        `${k.gesendetAm} · ${k.kanal} · ${k.empfaenger} · ${k.statusLabel}` +
          (k.betreff ? ` · ${k.betreff}` : "") +
          (k.nachweis ? ` · ${k.nachweis}` : ""),
      );
    }
  }

  // === Protokoll ===
  heading("Zugriffs- & Änderungsprotokoll");
  if (input.protokoll.length === 0) {
    small("Keine Einträge.");
  } else {
    for (const p of input.protokoll) {
      para(`${p.zeitpunkt} · ${p.vorgang} · ${p.person}${p.ip ? ` · ${p.ip}` : ""}`);
    }
  }

  // === Fuss ===
  doc.moveDown(1);
  small(`Erstellt am ${input.erstelltAm} durch ${input.erstelltVon}. CREDO HR-Portal — BEM-Modul.`);

  doc.end();
  return new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}
