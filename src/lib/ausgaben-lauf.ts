/**
 * CREDO HR-Portal – Ausstattung & Zugaenge, Stufe 2 (Paket A4): Loeschfristen
 * der Ausgaben im Lauf „Aufbewahrung erzeugter Dokumente“ (nur Server)
 *
 * E-A37, Feinplan A4 G20 und 1.11 (Schritt S35). Eine Ausgabe traegt ihre
 * Loeschfrist in `loeschenAb` – gesetzt mit jedem Zustandswechsel
 * (`ausgabeZustandDaten`, G3): sechs Monate nach der Rueckgabe, drei Jahre ab
 * Jahresende bei fehlender Rueckgabe bzw. offen beim Abschluss oder der
 * Absage, nie fuer AUSGEGEBEN ohne Anlass und VERBLEIBT. Dieser Block im Lauf
 * (src/lib/laeufe/dokumente-aufbewahrung.ts, eigener `try`) loescht, was
 * faellig ist – und mit der Zeile alles, was die Kennung sonst noch traegt:
 *
 *   - die Kopie in `ReturnItem` (`serialNumber`, `condition`, `notes`),
 *   - die Kommentare der Stellen an Ruecknahme-, Sperr- und Folgeaufgaben und an
 *     der Onboarding-Ausstattungsaufgabe, an der vermerkt wurde,
 *   - mit der LETZTEN Ausgabe eines Vorgangs die Protokolle: das hochgeladene
 *     (`UEBERGABEPROTOKOLL` bzw. `RUECKGABEPROTOKOLL`) und das vom Portal
 *     erzeugte (`GeneratedDocument` der beiden System-Vorlagen, `refId` =
 *     Vorgang), jeweils Datei vor Zeile.
 *
 * Vorgaenge werden nie geloescht; ohne diesen Block blieben Kennungen also
 * unbegrenzt gespeichert.
 *
 * **Sperrreihenfolge (G24).** Je Gruppe (Herkunft = Einstellung; Ausgaben ohne
 * Herkunft einzeln) EINE Transaktion: erst die beziehenden Austritte (nach
 * `id`, unabhaengig vom Status), dann die Einstellung (`vorgangSperrenIn` mit
 * beiden Endstatus), DANACH die Menge neu lesen und festlegen
 * (`loeschMengeFestlegen`) und erst dann schreiben (`ausgabenLoeschenIn`:
 * Aufgaben → Ausgaben → Rueckgaben → Merker). Jeder Offboarding-Weg sperrt
 * zuerst seinen Austritt, jeder Onboarding-Weg und jede neue Zuordnung zuerst
 * die Einstellung – ab der Sperre aendert also kein anderer Schreiber Zustand
 * oder Bezug dieser Ausgaben. Sperrte der Lauf andersherum, verklemmte er sich
 * mit Wiederoeffnen oder einem HR-Weg der Karte; leerte er vor dem Festlegen,
 * verloere eine weiterlebende Ausgabe ihre Kopien.
 *
 * **Protokolle (1.11, Schritt 4)** – idempotent, auch fuer Merker frueherer
 * Laeufe: je Vorgang mit Merker eine Transaktion, die den Vorgang bedingt auf
 * den Merker sperrt (ein neuer Vermerk setzt ihn zurueck) und prueft, dass er
 * keine Ausgabe bzw. keinen Ausgabebezug mehr hat. Datei zuerst
 * (`dateiLoeschen`, drei Ausgaenge), dann die Zeile; bleibt eine Datei wegen
 * eines Fehlers stehen, bleibt auch die Zeile, und der naechste Lauf versucht
 * es erneut.
 *
 * **Bericht ohne Personendaten.** Antwort und Protokoll (`AUSGABEN_GELOESCHT`
 * je Vorgang) tragen nur Anzahlen; in die Konsole geht von einem Fehler nur
 * `fehlerKennung`. Der Probelauf (`dryRun`) zaehlt nur und schreibt nichts.
 * Ohne eingeschalteten Lauf (Einstellungen → Automatische Läufe) wird nie
 * geloescht.
 */

import path from "path";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { dateiLoeschen, deleteUploadedDirIfEmpty, type LoeschErgebnis } from "@/lib/file-upload";
import { fehlerKennung } from "@/lib/fehler-kennung";
import { vorgangSperrenIn } from "@/lib/abteilungsaufgaben-onboarding";
import { austrittsBezuegeLaden } from "@/lib/ausgaben-daten";
import { ausgabenLoeschenIn } from "@/lib/ausgaben-schreiben";
import {
  AUSGABE_AKTIV,
  AUSGABE_AUFBEWAHRUNG_MONATE,
  AUSGABE_VERJAEHRUNG_JAHRE,
  AUSGABEN_AUDIT,
  AUSGABEN_LOESCH_SEITE,
  OFFBOARDING_AUFGABEN_HERKUNFT,
  PROTOKOLL_SYSTEM_VORLAGEN,
  PROTOKOLL_UPLOAD_TYP,
  ausgabenGeloeschtDetails,
  loeschMengeFestlegen,
  ohneFristGrenze,
  type AusgabenGeloeschtDetails,
  type ProtokollArt,
} from "@/lib/ausgaben";

/** Der hochgeladene Rueckgabe-Nachweis im Offboarding (`OffboardingDocType`). */
const RUECKGABE_DOKUMENT_TYP = "RUECKGABEPROTOKOLL" as const;

/** Unterverzeichnis erzeugter Dokumente (Brief-Vorlagen und Dokumentenpaket) unter `uploads/`. */
const ERZEUGT_UNTERORDNER = "brief-vorlagen-generiert";

/** Antwortfeld `ausgaben` des Laufs (scharf) – `AUSWERTER` in zeitplaner/bericht.ts liest es. */
export interface AusgabenLaufErgebnis {
  /** Frist nach der Rueckgabe in Monaten (Kopf, wie `ausstattung.aufbewahrungMonate`). */
  aufbewahrungMonate: number;
  /** Frist bei fehlender Rueckgabe in Jahren ab Jahresende. */
  verjaehrungJahre: number;
  /** Geloeschte Ausgaben. */
  geloescht: number;
  /** Rueckgabe-Zeilen, deren Kopie (Kennung, Zustand, Notiz) geleert wurde. */
  rueckgabenGeleert: number;
  /** Geloeschte hochgeladene Protokolle (Uebergabe und Rueckgabe). */
  protokolleGeloescht: number;
  /** Geloeschte, vom Portal erzeugte Protokolle (`GeneratedDocument`). */
  erzeugteProtokolleGeloescht: number;
  /** Aktive Ausgaben ohne Frist, aelter als drei Jahre – nur eine Zahl, kein Befund. */
  ohneFristAelterDreiJahre: number;
  /** Gruppen, Vorgaenge oder Dateien, die scheiterten – der naechste Lauf versucht es erneut. */
  fehler: number;
}

/** Antwortfeld `ausgaben` im Probelauf – nur Zaehler. */
export interface AusgabenProbelauf {
  aufbewahrungMonate: number;
  verjaehrungJahre: number;
  /** Faellige Ausgaben (`loeschenAb <= jetzt`). */
  wuerdeLoeschen: number;
  ohneFristAelterDreiJahre: number;
}

/** Ein leeres Ergebnis (auch fuer den Rueckfall des Aufrufers bei einer Ausnahme). */
export function leeresAusgabenErgebnis(): AusgabenLaufErgebnis {
  return {
    aufbewahrungMonate: AUSGABE_AUFBEWAHRUNG_MONATE,
    verjaehrungJahre: AUSGABE_VERJAEHRUNG_JAHRE,
    geloescht: 0,
    rueckgabenGeleert: 0,
    protokolleGeloescht: 0,
    erzeugteProtokolleGeloescht: 0,
    ohneFristAelterDreiJahre: 0,
    fehler: 0,
  };
}

/**
 * Loeschfristen der Ausgaben (G20, 1.11). Im Probelauf nur zaehlen; scharf
 * je Gruppe in der Sperrreihenfolge G24 loeschen, danach die Protokolle der
 * Vorgaenge mit Merker und zuletzt der Zaehler ohne Frist. Ein Fehler zaehlt
 * `fehler` und laesst die uebrigen Gruppen und Vorgaenge weiterlaufen.
 */
export async function ausgabenLoeschen(opts: { jetzt: Date; dryRun: true }): Promise<AusgabenProbelauf>;
export async function ausgabenLoeschen(opts: { jetzt: Date; dryRun?: false }): Promise<AusgabenLaufErgebnis>;
export async function ausgabenLoeschen(opts: {
  jetzt: Date;
  dryRun?: boolean;
}): Promise<AusgabenProbelauf | AusgabenLaufErgebnis> {
  const { jetzt } = opts;
  if (opts.dryRun) {
    return {
      aufbewahrungMonate: AUSGABE_AUFBEWAHRUNG_MONATE,
      verjaehrungJahre: AUSGABE_VERJAEHRUNG_JAHRE,
      wuerdeLoeschen: await prisma.ausgabe.count({ where: { loeschenAb: { not: null, lte: jetzt } } }),
      ohneFristAelterDreiJahre: await ohneFristZaehlen(jetzt),
    };
  }

  const ergebnis = leeresAusgabenErgebnis();

  // 1. Kandidaten: die aeltesten faelligen, gruppiert nach Herkunft.
  const kandidaten = await prisma.ausgabe.findMany({
    where: { loeschenAb: { not: null, lte: jetzt } },
    orderBy: { loeschenAb: "asc" },
    take: AUSGABEN_LOESCH_SEITE,
    select: { id: true, onboardingId: true },
  });
  for (const gruppe of gruppieren(kandidaten)) {
    try {
      const r = await gruppeLoeschen(gruppe, jetzt);
      ergebnis.geloescht += r.geloescht;
      ergebnis.rueckgabenGeleert += r.rueckgabenGeleert;
    } catch (err) {
      console.error(
        `[Ausgaben] Loeschen fehlgeschlagen (${gruppe.onboardingId ?? `ohne Herkunft, ${gruppe.ids[0]}`}):`,
        fehlerKennung(err),
      );
      ergebnis.fehler++;
    }
  }

  // 4. Protokolle der Vorgaenge mit Merker (auch aus frueheren Laeufen).
  try {
    const p = await protokolleLoeschen(jetzt);
    ergebnis.protokolleGeloescht += p.protokolle;
    ergebnis.erzeugteProtokolleGeloescht += p.erzeugteProtokolle;
    ergebnis.fehler += p.fehler;
  } catch (err) {
    console.error("[Ausgaben] Protokolle nicht geloescht:", fehlerKennung(err));
    ergebnis.fehler++;
  }

  // 6. Nur eine Zahl: aktive Ausgaben ohne Frist, aelter als drei Jahre.
  try {
    ergebnis.ohneFristAelterDreiJahre = await ohneFristZaehlen(jetzt);
  } catch (err) {
    console.error("[Ausgaben] Zaehler ohne Frist fehlgeschlagen:", fehlerKennung(err));
    ergebnis.fehler++;
  }
  return ergebnis;
}

/** Aktive Ausgaben ohne Frist mit `uebergebenAm` vor `ohneFristGrenze` (1.11, Schritt 6). */
function ohneFristZaehlen(jetzt: Date): Promise<number> {
  return prisma.ausgabe.count({
    where: { loeschenAb: null, zustand: { in: [...AUSGABE_AKTIV] }, uebergebenAm: { lt: ohneFristGrenze(jetzt) } },
  });
}

// =============================================
// Schritte 1 bis 3: Ausgaben je Gruppe
// =============================================

interface Gruppe {
  /** Herkunft; `null` = ohne Herkunft (dann genau eine Ausgabe). */
  onboardingId: string | null;
  ids: string[];
}

/** Nach Herkunft gruppiert, in der Reihenfolge der Kandidaten; ohne Herkunft einzeln. */
function gruppieren(kandidaten: ReadonlyArray<{ id: string; onboardingId: string | null }>): Gruppe[] {
  const gruppen = new Map<string, Gruppe>();
  for (const k of kandidaten) {
    const schluessel = k.onboardingId ?? `ohne:${k.id}`;
    const g = gruppen.get(schluessel) ?? { onboardingId: k.onboardingId, ids: [] };
    g.ids.push(k.id);
    gruppen.set(schluessel, g);
  }
  return [...gruppen.values()];
}

/**
 * Eine Gruppe in EINER Transaktion (1.11, Schritt 3): Austritte sperren (nach
 * `id`), Einstellung sperren, Menge neu lesen und festlegen, loeschen
 * (`ausgabenLoeschenIn`), Protokoll je Vorgang.
 */
async function gruppeLoeschen(gruppe: Gruppe, jetzt: Date): Promise<{ geloescht: number; rueckgabenGeleert: number }> {
  // Die beziehenden Austritte VOR den Sperren – welche zu sperren sind. Wer
  // danach dazukommt, laesst seine Ausgabe fuer diesen Lauf herausfallen.
  const bezuegeVorher = await austrittsBezuegeLaden(prisma, gruppe.ids);
  const austritte = [...new Set([...bezuegeVorher.values()].flat().map((b) => b.offboardingId))].sort();

  return prisma.$transaction(async (tx) => {
    // 3.1 Austritte sperren – nach id, unabhaengig vom Status.
    for (const id of austritte) {
      await tx.offboardingProcess.updateMany({ where: { id }, data: { updatedAt: jetzt } });
    }
    // 3.2 Einstellung sperren (beide Endstatus zugelassen). `false` = es gibt
    // sie nicht mehr; der naechste Lauf liest die Ausgaben ohne Herkunft.
    if (
      gruppe.onboardingId &&
      !(await vorgangSperrenIn(tx, gruppe.onboardingId, { jetzt, auch: ["COMPLETED", "EXPIRED"] }))
    ) {
      return { geloescht: 0, rueckgabenGeleert: 0 };
    }

    // 3.3 Menge festlegen – NACH den Sperren gelesen.
    const ausgaben = await tx.ausgabe.findMany({
      where: { id: { in: gruppe.ids } },
      select: { id: true, checklistItemId: true, loeschenAb: true },
    });
    const rueckgaben = await tx.returnItem.findMany({
      where: { ausgabeId: { in: gruppe.ids } },
      select: { id: true, offboardingId: true, ausgabeId: true },
    });
    const aufgaben = await tx.offboardingChecklistItem.findMany({
      where: { ausgabeId: { in: gruppe.ids }, herkunft: { in: [...OFFBOARDING_AUFGABEN_HERKUNFT] } },
      select: { offboardingId: true, ausgabeId: true },
    });
    const menge = loeschMengeFestlegen({
      ausgaben,
      bezuege: [...rueckgaben, ...aufgaben],
      gesperrteAustritte: austritte,
      jetzt,
    });
    if (menge.ids.length === 0) return { geloescht: 0, rueckgabenGeleert: 0 };

    const inMenge = new Set(menge.ids);
    const meineRueckgaben = rueckgaben.filter((r) => r.ausgabeId && inMenge.has(r.ausgabeId));
    const meineBezuege = [...meineRueckgaben, ...aufgaben.filter((a) => a.ausgabeId && inMenge.has(a.ausgabeId))];
    const betroffeneAustritte = [...new Set(meineBezuege.map((b) => b.offboardingId))].sort();

    // 3.4 bis 3.7 Aufgaben → Ausgaben → Rueckgaben → Merker.
    const r = await ausgabenLoeschenIn(tx, {
      ausgaben: ausgaben.filter((a) => inMenge.has(a.id)),
      rueckgabeIds: meineRueckgaben.map((x) => x.id),
      onboardingId: gruppe.onboardingId,
      austrittIds: betroffeneAustritte,
      jetzt,
    });

    // 3.8 Protokoll je Vorgang – nur Anzahlen.
    if (gruppe.onboardingId) {
      const kommentare =
        r.kommentareEinstellung + Object.values(r.kommentareJeAustritt).reduce((s, n) => s + n, 0);
      await protokollieren(tx, "ONBOARDING", gruppe.onboardingId, {
        anzahl: r.geloescht,
        rueckgabenGeleert: r.rueckgabenGeleert,
        kommentareGeleert: kommentare,
      });
    }
    for (const offboardingId of betroffeneAustritte) {
      await protokollieren(tx, "OFFBOARDING", offboardingId, {
        anzahl: new Set(meineBezuege.filter((b) => b.offboardingId === offboardingId).map((b) => b.ausgabeId)).size,
        rueckgabenGeleert: meineRueckgaben.filter((x) => x.offboardingId === offboardingId).length,
        kommentareGeleert: r.kommentareJeAustritt[offboardingId] ?? 0,
      });
    }
    return { geloescht: r.geloescht, rueckgabenGeleert: r.rueckgabenGeleert };
  });
}

type Tx = Prisma.TransactionClient;

/** `AUSGABEN_GELOESCHT` am Vorgang – nur Anzahlen (`ausgabenGeloeschtDetails`), ohne Konto. */
async function protokollieren(
  tx: Tx,
  modul: "ONBOARDING" | "OFFBOARDING",
  vorgangId: string,
  teil: Partial<AusgabenGeloeschtDetails>,
): Promise<void> {
  await tx.auditLog.create({
    data: {
      userId: null,
      ...(modul === "ONBOARDING" ? { onboardingId: vorgangId } : { offboardingId: vorgangId }),
      processType: modul,
      action: AUSGABEN_AUDIT.AUSGABEN_GELOESCHT,
      details: { ...ausgabenGeloeschtDetails(teil) },
    },
  });
}

// =============================================
// Schritt 4: Protokolle der Vorgaenge mit Merker
// =============================================

interface ProtokollZaehler {
  protokolle: number;
  erzeugteProtokolle: number;
  fehler: number;
}

/** Wurzel der Dateien eines Vorgangs unter `uploads/` (`dateiLoeschen` loescht nur darunter). */
function uploadsPfad(...teile: string[]): string {
  return path.join(process.cwd(), "uploads", ...teile);
}

/** Ein gespeicherter Pfad (relativ zum Arbeitsverzeichnis oder absolut) als absoluter Pfad. */
function absolut(pfad: string): string {
  return path.resolve(process.cwd(), pfad);
}

/**
 * Die Protokolle aller Vorgaenge mit Merker `ausgabenGeloeschtAm`, die keine
 * Ausgabe (Einstellung) bzw. keinen Ausgabebezug (Austritt) mehr haben –
 * Kandidaten sind nur Vorgaenge, an denen noch ein Protokoll haengt
 * (hochgeladen oder erzeugt). Je Vorgang eine Transaktion (`vorgangProtokolleLoeschen`).
 */
async function protokolleLoeschen(jetzt: Date): Promise<ProtokollZaehler> {
  const summe: ProtokollZaehler = { protokolle: 0, erzeugteProtokolle: 0, fehler: 0 };
  const vorlagen = await prisma.documentTemplate.findMany({
    where: {
      isSystem: true,
      OR: Object.values(PROTOKOLL_SYSTEM_VORLAGEN).map((s) => ({ modul: s.modul, originalName: s.originalName })),
    },
    select: { id: true, modul: true, originalName: true },
  });
  const vorlagenIds = (art: ProtokollArt) =>
    vorlagen
      .filter(
        (v) =>
          v.modul === PROTOKOLL_SYSTEM_VORLAGEN[art].modul && v.originalName === PROTOKOLL_SYSTEM_VORLAGEN[art].originalName,
      )
      .map((v) => v.id);

  for (const art of ["UEBERGABE", "RUECKGABE"] as const) {
    const templateIds = vorlagenIds(art);
    for (const vorgangId of await protokollKandidaten(art, templateIds)) {
      try {
        const z = await vorgangProtokolleLoeschen(art, vorgangId, templateIds, jetzt);
        summe.protokolle += z.protokolle;
        summe.erzeugteProtokolle += z.erzeugteProtokolle;
        summe.fehler += z.fehler;
      } catch (err) {
        console.error(`[Ausgaben] Protokolle nicht geloescht (${vorgangId}):`, fehlerKennung(err));
        summe.fehler++;
      }
    }
  }
  return summe;
}

/** Vorgaenge mit Merker, an denen noch ein Protokoll haengt (hochgeladen oder erzeugt) – nach `id` sortiert. */
async function protokollKandidaten(art: ProtokollArt, templateIds: ReadonlyArray<string>): Promise<string[]> {
  const modul = PROTOKOLL_SYSTEM_VORLAGEN[art].modul;
  const erzeugtFuer = templateIds.length
    ? (
        await prisma.generatedDocument.findMany({
          where: { templateId: { in: [...templateIds] }, modul, refId: { not: null } },
          select: { refId: true },
        })
      )
        .map((g) => g.refId)
        .filter((id): id is string => !!id)
    : [];
  const ids = new Set<string>();
  if (art === "UEBERGABE") {
    const vorgaenge = await prisma.onboardingProcess.findMany({
      where: {
        ausgabenGeloeschtAm: { not: null },
        OR: [{ documents: { some: { type: PROTOKOLL_UPLOAD_TYP } } }, { id: { in: [...new Set(erzeugtFuer)] } }],
      },
      select: { id: true },
    });
    for (const v of vorgaenge) ids.add(v.id);
  } else {
    const vorgaenge = await prisma.offboardingProcess.findMany({
      where: {
        ausgabenGeloeschtAm: { not: null },
        OR: [{ documents: { some: { type: RUECKGABE_DOKUMENT_TYP } } }, { id: { in: [...new Set(erzeugtFuer)] } }],
      },
      select: { id: true },
    });
    for (const v of vorgaenge) ids.add(v.id);
  }
  return [...ids].sort();
}

/**
 * Die Protokolle EINES Vorgangs in einer Transaktion: den Vorgang bedingt auf
 * seinen Merker sperren (ein neuer Vermerk hat ihn womoeglich zurueckgesetzt),
 * pruefen, dass keine Ausgabe bzw. kein Ausgabebezug mehr besteht, dann je
 * Dokument Datei zuerst, dann die Zeile. Eine Datei, die nicht geloescht
 * werden konnte (`fehler`), laesst ihre Zeile stehen – der naechste Lauf
 * versucht es erneut. Protokoll `AUSGABEN_GELOESCHT` nur mit Anzahlen.
 */
async function vorgangProtokolleLoeschen(
  art: ProtokollArt,
  vorgangId: string,
  templateIds: ReadonlyArray<string>,
  jetzt: Date,
): Promise<ProtokollZaehler> {
  return prisma.$transaction(async (tx) => {
    const z: ProtokollZaehler = { protokolle: 0, erzeugteProtokolle: 0, fehler: 0 };
    const mitMerker = { id: vorgangId, ausgabenGeloeschtAm: { not: null } };
    let dokumente: { id: string; filePath: string }[];
    let wurzel: string;
    if (art === "UEBERGABE") {
      const gesperrt = await tx.onboardingProcess.updateMany({ where: mitMerker, data: { updatedAt: jetzt } });
      if (gesperrt.count === 0) return z;
      if ((await tx.ausgabe.count({ where: { onboardingId: vorgangId } })) > 0) return z;
      dokumente = await tx.document.findMany({
        where: { onboardingId: vorgangId, type: PROTOKOLL_UPLOAD_TYP },
        select: { id: true, filePath: true },
      });
      wurzel = uploadsPfad(vorgangId);
    } else {
      const gesperrt = await tx.offboardingProcess.updateMany({ where: mitMerker, data: { updatedAt: jetzt } });
      if (gesperrt.count === 0) return z;
      const mitBezug = { offboardingId: vorgangId, ausgabeId: { not: null } };
      const rest =
        (await tx.returnItem.count({ where: mitBezug })) +
        (await tx.offboardingChecklistItem.count({ where: mitBezug }));
      if (rest > 0) return z;
      dokumente = await tx.offboardingDocument.findMany({
        where: { offboardingId: vorgangId, type: RUECKGABE_DOKUMENT_TYP },
        select: { id: true, filePath: true },
      });
      wurzel = uploadsPfad("offboarding", vorgangId);
    }

    // Hochgeladene Protokolle: Datei zuerst, dann die Zeile.
    for (const d of dokumente) {
      if (!loeschbar(await dateiLoeschen(absolut(d.filePath), [wurzel]))) {
        z.fehler++;
        continue;
      }
      const r =
        art === "UEBERGABE"
          ? await tx.document.deleteMany({ where: { id: d.id } })
          : await tx.offboardingDocument.deleteMany({ where: { id: d.id } });
      z.protokolle += r.count;
    }

    // Vom Portal erzeugte Protokolle (System-Vorlage, refId = Vorgang): beide Dateien, dann die Zeile.
    const erzeugt = templateIds.length
      ? await tx.generatedDocument.findMany({
          where: { templateId: { in: [...templateIds] }, modul: PROTOKOLL_SYSTEM_VORLAGEN[art].modul, refId: vorgangId },
          select: { id: true, pfadDocx: true, pfadPdf: true },
        })
      : [];
    const erzeugtWurzel = uploadsPfad(ERZEUGT_UNTERORDNER);
    for (const g of erzeugt) {
      let ok = true;
      for (const pfad of [g.pfadDocx, g.pfadPdf]) {
        if (pfad && !loeschbar(await dateiLoeschen(absolut(pfad), [erzeugtWurzel]))) ok = false;
      }
      if (!ok) {
        z.fehler++;
        continue;
      }
      // Jede Erzeugung liegt in einem eigenen Unterverzeichnis – das jetzt leere mit entfernen.
      const ordner = g.pfadDocx || g.pfadPdf;
      if (ordner) await deleteUploadedDirIfEmpty(path.dirname(absolut(ordner)));
      const r = await tx.generatedDocument.deleteMany({ where: { id: g.id } });
      z.erzeugteProtokolle += r.count;
    }

    if (z.protokolle + z.erzeugteProtokolle > 0) {
      await protokollieren(tx, art === "UEBERGABE" ? "ONBOARDING" : "OFFBOARDING", vorgangId, {
        protokolle: z.protokolle,
        erzeugteProtokolle: z.erzeugteProtokolle,
      });
    }
    return z;
  });
}

/** „geloescht“ und „fehlte“ erlauben das Loeschen der Zeile, „fehler“ nicht (die Datei liegt womoeglich noch da). */
function loeschbar(ergebnis: LoeschErgebnis): boolean {
  return ergebnis !== "fehler";
}
