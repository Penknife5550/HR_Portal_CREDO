/**
 * CREDO HR-Portal – Ausstattung & Zugaenge, Stufe 2 (Paket A4): der EINZIGE
 * Schreiber der Tabelle `ausgaben` (Feinplan A4, G3)
 *
 * Jede Zeile von `ausgaben` entsteht, aendert und verschwindet hier – nirgends
 * sonst. Der Waechter src/__tests__/lib/ausgaben-schreiber.test.ts sucht in
 * `src/` jeden Schreibaufruf auf das Modell `ausgabe` (create, update, delete …)
 * ausserhalb dieser Datei. So vergisst kein Weg die Loeschfrist (E-A37) und
 * keiner setzt einen Zustand ohne Zeitstempel: Jeder Zustand – auch der erste
 * (AUSGEGEBEN) – kommt aus `ausgabeZustandDaten` (src/lib/ausgaben.ts), das
 * `zustand`, `zustandAm` und `loeschenAb` gemeinsam liefert. Dasselbe Muster
 * wie `zuweisungSenden` als einziger Schreiber der Link-Zeile.
 *
 * Alle Funktionen arbeiten in einer FREMDEN Transaktion (`tx`) und sperren nur,
 * was ihr Name sagt: Die Sperrreihenfolge (G24: Offboarding → Onboarding →
 * Links → Aufgaben → Ausgaben nach `id` → Rueckgaben) haelt der Aufrufer ein.
 * Bedingte Schreibaufrufe (`updateMany`/`deleteMany` mit dem erwarteten
 * Zustand im WHERE) melden `false`, wenn sich der Stand inzwischen bewegt hat;
 * der Aufrufer antwortet dann 409 und rollt zurueck.
 *
 * Stand S24: Sperren, Anlegen (Vermerk; setzt die Loeschmerker der Einstellung
 * und der Aufgabe zurueck, 1.11), Korrigieren, Zustandswechsel, Tausch und
 * Entfernen. Seit S27 die Frist bei der Absage (`ausgabenFristBeiAbsageIn`,
 * G10) – auch fuer Stuecke, die HR nach der Absage vermerkt oder eintauscht
 * (`vorgangEingestelltAm` an `ausgabenAnlegenIn`/`ausgabeTauschenIn`).
 * Seit S29 „Als ausgegeben übernehmen“ im Reiter „Rückgaben“
 * (`ausgabeOhneVermerkAnlegenIn`, nur `quelle` HR).
 * Seit S30 der Gleichlauf mit Aufgabe und Rueckgabe-Zeile im Austritt
 * (`ausgabeImAustrittSperrenIn`, `ausgabeGleichlaufIn`, G15 bis G17) – auf
 * allen drei Wegen (Link der Stelle, Portal-PATCH, Reiter „Rückgaben“).
 * Seit S31 die Frist der beim Abschluss des Austritts offen gebliebenen
 * Stuecke (`offeneAusgabenAbschliessenIn`, G18). Spaeter haengt hier das
 * Loeschen im Lauf an (`ausgabenLoeschenIn`, S35).
 */

import type { Prisma } from "@prisma/client";
import {
  AUSGABE_AKTIV,
  AUSGABEN_AUDIT,
  FOLGE_STELLE,
  OFFBOARDING_AUFGABEN_HERKUNFT,
  absageFrist,
  abschlussFrist,
  ausgabeZustandDaten,
  brauchtFolgeStelle,
  ersatzBasis,
  folgeAufgabeSchritt,
  gleichlaufGesperrt,
  gleichlaufPlan,
  rueckgabeDaten,
  rueckgabeOffen,
  rueckgabeZustand,
  tauschZustand,
  type AusgabeZustand,
  type FolgeSchritt,
  type GleichlaufSperre,
  type NeueAusgabe,
  type RueckgabeZustand,
  type TauschGrund,
} from "@/lib/ausgaben";
// Nur lesend (G28: Austrittsbezug NACH der Sperre); ausgaben-daten.ts
// importiert von hier nichts, es entsteht also kein Kreis.
import { ausgabenNachIdLaden, austrittsBezuegeLaden, type AusgabeDaten } from "@/lib/ausgaben-daten";
import { berlinerKalendertag, kalendertagAlsDatum, type Kalendertag } from "@/lib/kalendertag";
import type { SessionPayload } from "@/lib/permissions";

type Db = Prisma.TransactionClient;

/** Ein Stueck, fertig zum Schreiben (`vermerkStuecke`): Kennung oder `null`, Kalendertag der Uebergabe. */
export interface AusgabeStueck {
  kennung: string | null;
  uebergebenAm: Kalendertag;
}

/**
 * Sperrt Ausgaben bis zum Ende der Transaktion (UPDATE auf `updatedAt`), nach
 * `id` sortiert und einzeln – zwei Transaktionen sperren dieselben Zeilen so
 * immer in derselben Reihenfolge (G24). Unbekannte IDs sind kein Fehler; die
 * Antwort ist die Zahl der gesperrten Zeilen. Danach liest der Aufrufer den
 * Stand frisch (Zustand, Austrittsbezug – G28: nach der Sperre).
 */
export async function ausgabenSperrenIn(tx: Db, ids: ReadonlyArray<string>, jetzt: Date = new Date()): Promise<number> {
  let gesperrt = 0;
  for (const id of [...new Set(ids)].sort()) {
    const r = await tx.ausgabe.updateMany({ where: { id }, data: { updatedAt: jetzt } });
    gesperrt += r.count;
  }
  return gesperrt;
}

/**
 * Legt je Stueck eine Ausgabe an (Zustand AUSGEGEBEN ueber
 * `ausgabeZustandDaten`, also ohne Loeschfrist) und setzt die Merker
 * `ausgabenGeloeschtAm` der Einstellung und der Aufgabe zurueck (1.11: „Jeder
 * neue Vermerk setzt die Merker zurueck“ – sonst nennte die Karte nach einer
 * frueheren Loeschung den neuen Vermerk „gelöscht“, und der Lauf raeumte die
 * Protokolle des Vorgangs ab). Der Aufrufer hat die Einstellung gesperrt und
 * `vermerkPruefen` angewandt. Antwort: die IDs der neuen Ausgaben in der
 * Reihenfolge der Stuecke.
 *
 * `vorgangEingestelltAm`: Ist die Einstellung schon abgesagt (EXPIRED), traegt
 * auch ein danach vermerktes Stueck die Frist der Absage (G10) – drei Jahre ab
 * Ende des Jahres der Absage, dieselbe Rechnung wie `ausgabenFristBeiAbsageIn`.
 * Der EXPIRED-Zweig des Status-PATCH laeuft nur einmal; ohne diesen Parameter
 * bliebe ein nachgetragenes oder eingetauschtes Stueck unbegrenzt mit Kennung
 * gespeichert, denn kein Austritt kann eine abgesagte Einstellung binden.
 */
export async function ausgabenAnlegenIn(
  tx: Db,
  basis: NeueAusgabe,
  stuecke: ReadonlyArray<AusgabeStueck>,
  jetzt: Date,
  opts: { vorgangEingestelltAm?: Date | null } = {},
): Promise<string[]> {
  const ids: string[] = [];
  for (const s of stuecke) {
    const neu = await tx.ausgabe.create({
      data: {
        ...basis,
        kennung: s.kennung,
        uebergebenAm: kalendertagAlsDatum(s.uebergebenAm),
        ...ausgabeZustandDaten("AUSGEGEBEN", jetzt, { vorgangEingestelltAm: opts.vorgangEingestelltAm }),
      },
      select: { id: true },
    });
    ids.push(neu.id);
  }
  if (ids.length > 0) await loeschmerkerZuruecksetzenIn(tx, basis);
  return ids;
}

/**
 * „Als ausgegeben übernehmen“ im Reiter „Rückgaben“ (G13, S29): Eine
 * erledigte Ausstattungsaufgabe ohne Uebergabevermerk bekommt EIN Stueck –
 * vermerkt von HR (`quelle` HR, `erfasstVonId` = HR-Konto), ohne Kennung,
 * Datum = Berliner Tag der Erledigung. Sonst wie `ausgabenAnlegenIn`
 * (Zustand AUSGEGEBEN ueber `ausgabeZustandDaten`, Loeschmerker zurueck, nach
 * einer Absage deren Frist). Der Aufrufer hat Austritt und Einstellung
 * gesperrt und `ohneVermerk` danach neu gerechnet. Antwort: die ID der neuen
 * Ausgabe.
 */
export async function ausgabeOhneVermerkAnlegenIn(
  tx: Db,
  basis: NeueAusgabe,
  uebergebenAm: Kalendertag,
  jetzt: Date,
  opts: { vorgangEingestelltAm?: Date | null } = {},
): Promise<string> {
  if (basis.quelle !== "HR" || !basis.erfasstVonId) {
    throw new Error("ausgabeOhneVermerkAnlegenIn: nur von HR (quelle HR mit erfasstVonId)");
  }
  const [id] = await ausgabenAnlegenIn(tx, basis, [{ kennung: null, uebergebenAm }], jetzt, opts);
  return id;
}

/** Ein neuer Vermerk hebt „Ausgaben nach Ablauf der Aufbewahrungsfrist gelöscht“ auf (G20, 1.11). */
async function loeschmerkerZuruecksetzenIn(
  tx: Db,
  basis: Pick<NeueAusgabe, "onboardingId" | "checklistItemId">,
): Promise<void> {
  if (basis.onboardingId) {
    await tx.onboardingProcess.updateMany({
      where: { id: basis.onboardingId, ausgabenGeloeschtAm: { not: null } },
      data: { ausgabenGeloeschtAm: null },
    });
  }
  if (basis.checklistItemId) {
    await tx.checklistItem.updateMany({
      where: { id: basis.checklistItemId, ausgabenGeloeschtAm: { not: null } },
      data: { ausgabenGeloeschtAm: null },
    });
  }
}

/**
 * Korrigiert Kennung und/oder Uebergabedatum eines noch aktiven Stuecks
 * (AUSGEGEBEN, VERBLEIBT). Fehlende Felder bleiben; `kennung: null` loescht
 * die Kennung. Der Zustand aendert sich nicht – also auch nicht die Frist.
 * `false`, wenn das Stueck nicht (mehr) aktiv ist.
 */
export async function ausgabeKorrigierenIn(
  tx: Db,
  ausgabeId: string,
  felder: { kennung?: string | null; uebergebenAm?: Kalendertag },
): Promise<boolean> {
  const data: Prisma.AusgabeUpdateManyMutationInput = {};
  if (felder.kennung !== undefined) data.kennung = felder.kennung;
  if (felder.uebergebenAm !== undefined) data.uebergebenAm = kalendertagAlsDatum(felder.uebergebenAm);
  if (Object.keys(data).length === 0) return true;
  const r = await tx.ausgabe.updateMany({
    where: { id: ausgabeId, zustand: { in: [...AUSGABE_AKTIV] } },
    data,
  });
  return r.count === 1;
}

/**
 * Ein Zustandswechsel (G3): `zustand`, `zustandAm` und `loeschenAb` kommen aus
 * `ausgabeZustandDaten` – mit `austrittAbgeschlossenAm` bzw.
 * `vorgangEingestelltAm` fuer die Sonderfristen (G18, G10). Bedingt auf einen
 * der erwarteten Ausgangszustaende `von`; `false`, wenn die Ausgabe dort nicht
 * (mehr) steht.
 */
export async function ausgabeZustandIn(
  tx: Db,
  ausgabeId: string,
  zustand: AusgabeZustand,
  jetzt: Date,
  opts: {
    von: ReadonlyArray<string>;
    austrittAbgeschlossenAm?: Date | null;
    vorgangEingestelltAm?: Date | null;
  },
): Promise<boolean> {
  const r = await tx.ausgabe.updateMany({
    where: { id: ausgabeId, zustand: { in: [...opts.von] } },
    data: ausgabeZustandDaten(zustand, jetzt, {
      austrittAbgeschlossenAm: opts.austrittAbgeschlossenAm,
      vorgangEingestelltAm: opts.vorgangEingestelltAm,
    }),
  });
  return r.count === 1;
}

/** Die alte Ausgabe eines Tauschs, wie sie der Aufrufer nach der Sperre gelesen hat. */
export interface TauschAlt {
  id: string;
  onboardingId: string | null;
  checklistItemId: string | null;
  organizationId: string;
  zentral: boolean;
  departmentKey: string;
  bezeichnung: string;
  kennungLabel: string | null;
  rueckgabeKategorie: string | null;
  beiAustritt: string;
}

/**
 * Tausch (G7) eines aktiven Stuecks (AUSGEGEBEN oder VERBLEIBT):
 *
 *   1. die alte Ausgabe bedingt auf ihren Zustand umstellen – DEFEKT → ERSETZT
 *      (Frist 6 Monate), VERLOREN → FEHLT (3 Jahre ab Jahresende), beides ueber
 *      `ausgabeZustandDaten`;
 *   2. die neue Ausgabe AUSGEGEBEN an derselben Aufgabe anlegen
 *      (`ersatzBasis`: dieselbe Stelle, Einrichtung, Bezeichnung …, vermerkt
 *      von HR) – nach einer Absage mit deren Frist (`vorgangEingestelltAm`,
 *      G10, wie `ausgabenAnlegenIn`);
 *   3. `ersetztDurchId` der alten zeigt auf die neue – in beiden Faellen.
 *
 * `null`, wenn die alte nicht mehr aktiv war (dann ist nichts geschrieben).
 * Ohne Grund wuerde ein verlorener Schluessel nach 6 statt nach 3 Jahren
 * geloescht, und der Umweg „zurückgenommen FEHLT + neu vermerken“ verloere
 * `ersetztDurchId`. Getauscht werden nur Gegenstaende (RUECKGABE) – das prueft
 * der Aufrufer (`ausgaben-dienst.ts`).
 */
export async function ausgabeTauschenIn(
  tx: Db,
  alt: TauschAlt,
  opts: {
    grund: TauschGrund;
    neu: AusgabeStueck;
    erfasstVonId: string | null;
    jetzt: Date;
    vorgangEingestelltAm?: Date | null;
  },
): Promise<{ neuId: string; zustandAlt: "ERSETZT" | "FEHLT" } | null> {
  const zustandAlt = tauschZustand(opts.grund);
  const umgestellt = await ausgabeZustandIn(tx, alt.id, zustandAlt, opts.jetzt, { von: AUSGABE_AKTIV });
  if (!umgestellt) return null;
  const [neuId] = await ausgabenAnlegenIn(
    tx,
    ersatzBasis(alt, { erfasstVonId: opts.erfasstVonId }),
    [opts.neu],
    opts.jetzt,
    { vorgangEingestelltAm: opts.vorgangEingestelltAm },
  );
  await tx.ausgabe.updateMany({ where: { id: alt.id }, data: { ersetztDurchId: neuId } });
  return { neuId, zustandAlt };
}

/**
 * Entfernt einen irrtuemlichen Vermerk – nur ein Stueck im Zustand AUSGEGEBEN,
 * auf dem Link-Weg zusaetzlich nur eigene Link-Vermerke (`nurQuelle` LINK,
 * G6). Ob ein Austritt das Stueck bindet (G28), prueft der Aufrufer nach der
 * Sperre. `false`, wenn die Bedingung nicht (mehr) passt.
 */
export async function ausgabeEntfernenIn(
  tx: Db,
  ausgabeId: string,
  opts: { nurQuelle?: string } = {},
): Promise<boolean> {
  const r = await tx.ausgabe.deleteMany({
    where: { id: ausgabeId, zustand: "AUSGEGEBEN", ...(opts.nurQuelle ? { quelle: opts.nurQuelle } : {}) },
  });
  return r.count === 1;
}

/**
 * Frist bei der Absage der Einstellung (G10, S27) – im EXPIRED-Zweig von
 * PATCH /api/onboarding/[id], in dessen Transaktion und NACH dem bedingten
 * Statuswechsel, der den Vorgang sperrt:
 *
 *   1. aktive Ausgaben (AUSGEGEBEN, VERBLEIBT) des Vorgangs zaehlen – ohne
 *      Stueck endet es hier (keine weitere Abfrage);
 *   2. sie sperren (`ausgabenSperrenIn`, nach `id`; G24: Vorgang → Ausgaben)
 *      und danach frisch lesen, samt Austrittsbezuegen (G28: nach der Sperre);
 *   3. je Stueck `absageFrist`: ein aktives, ungebundenes Stueck bekommt
 *      `loeschenAb` = drei Jahre ab Ende des Berliner Jahres von
 *      `vorgangEingestelltAm` (= `expiredAt`), ueber `ausgabeLoeschenAb` – der
 *      einzigen Fristrechnung. Der Zustand und `zustandAm` bleiben (1.2:
 *      „AUSGEGEBEN → AUSGEGEBEN mit Frist“); geschrieben wird bedingt auf den
 *      gelesenen Zustand.
 *
 * Endzustaende behalten ihre Frist, gebundene Stuecke fuehrt ihr Austritt,
 * VERBLEIBT bleibt ohne Frist (G20). Antwort: die Zahl der Stuecke mit neuer
 * Frist (Protokoll `ausgabenMitFrist`). Vermerkt HR danach die Ruecknahme,
 * gilt die kuerzere Frist des neuen Zustands.
 */
export async function ausgabenFristBeiAbsageIn(
  tx: Db,
  opts: { onboardingId: string; vorgangEingestelltAm: Date },
): Promise<number> {
  const aktiv = { onboardingId: opts.onboardingId, zustand: { in: [...AUSGABE_AKTIV] } };
  if ((await tx.ausgabe.count({ where: aktiv })) === 0) return 0;

  const ids = (await tx.ausgabe.findMany({ where: aktiv, select: { id: true } })).map((a) => a.id);
  await ausgabenSperrenIn(tx, ids, opts.vorgangEingestelltAm);
  const frisch = await tx.ausgabe.findMany({
    where: { id: { in: ids } },
    select: { id: true, zustand: true, zustandAm: true },
  });
  const bezuege = await austrittsBezuegeLaden(
    tx,
    frisch.map((a) => a.id),
  );

  // Je Zustand und Frist EIN Update (alle Stuecke einer Absage haben dieselbe Frist).
  const gruppen = new Map<string, { zustand: string; loeschenAb: Date; ids: string[] }>();
  for (const a of frisch) {
    const loeschenAb = absageFrist(a, bezuege.get(a.id) ?? [], opts.vorgangEingestelltAm);
    if (!loeschenAb) continue;
    const schluessel = `${a.zustand}|${loeschenAb.getTime()}`;
    const gruppe = gruppen.get(schluessel) ?? { zustand: a.zustand, loeschenAb, ids: [] };
    gruppe.ids.push(a.id);
    gruppen.set(schluessel, gruppe);
  }
  let gesetzt = 0;
  for (const g of gruppen.values()) {
    const r = await tx.ausgabe.updateMany({
      where: { id: { in: g.ids }, zustand: g.zustand },
      data: { loeschenAb: g.loeschenAb },
    });
    gesetzt += r.count;
  }
  return gesetzt;
}

/**
 * Frist beim Abschluss des Austritts (G18, S31) – im COMPLETED-Zweig von
 * PATCH /api/offboarding/[id], in dessen Transaktion NACH der Sperre des
 * Austritts, der Zaehlung der offenen Rueckgaben und dem Update (G24:
 * Austritt → Links → Aufgaben → Ausgaben):
 *
 *   1. die Ausgaben, die der Austritt bezieht (Rueckgabe-Zeile bzw.
 *      Ruecknahme-, Sperr- oder Folgeaufgabe mit `ausgabeId`) – ohne Bezug
 *      endet es hier;
 *   2. davon die offen gebliebenen: AUSGEGEBEN (Rueckgabe ohne Zustand,
 *      Aufgabe offen – der Gleichlauf haelt die drei Zeilen gleich, die
 *      Ausgabe fuehrt, G15) und VERBLEIBT mit offener Rueckgabe-Zeile bzw.
 *      (Zugang) offener Sperraufgabe IN DIESEM Austritt – ein Stueck, das ein
 *      frueherer Austritt mit „verbleibt“ freigab und das dieser unveraendert
 *      uebernommen hat (Review A4c). Ohne eines endet es hier;
 *   3. sie sperren (`ausgabenSperrenIn`, nach `id`) und danach frisch lesen,
 *      samt Austrittsbezuegen (G28: nach der Sperre);
 *   4. je Stueck `abschlussFrist`: `loeschenAb` = drei Jahre ab Ende des
 *      Berliner Jahres von `abgeschlossenAm` (= `completedAt`), ueber
 *      `ausgabeLoeschenAb` – der einzigen Fristrechnung.
 *        - AUSGEGEBEN: Zustand und `zustandAm` bleiben (1.2: „AUSGEGEBEN →
 *          AUSGEGEBEN mit Frist“); geschrieben wird bedingt auf AUSGEGEBEN.
 *        - offenes VERBLEIBT: wird AUSGEGEBEN mit dieser Frist
 *          (`ausgabeZustandIn`, bedingt auf VERBLEIBT; 1.2: „VERBLEIBT →
 *          AUSGEGEBEN mit Frist“) und bleibt so an diesen Austritt gebunden,
 *          dessen Reiter die spaete Rueckgabe aufnimmt. Sonst gaebe der
 *          Abschluss es frei: Die Zeile stuende fuer immer auf „offen“, und die
 *          Kennung bliebe unbegrenzt gespeichert (G18, G20). Protokoll
 *          `AUSGABE_ZUSTAND_GEAENDERT` (`ueber` ABSCHLUSS).
 *
 * Endzustaende behalten ihre Frist, ein hier gesetztes VERBLEIBT bleibt ohne
 * (G20) und ist mit dem Abschluss frei (G28). Antwort: die Zahl der Stuecke
 * mit neuer Frist. Vermerkt HR danach eine spaete Rueckgabe im Reiter, gilt
 * die Frist des neuen Zustands; ein Wiederoeffnen setzt wieder diese
 * (`ausgabeGleichlaufIn`).
 */
export async function offeneAusgabenAbschliessenIn(
  tx: Db,
  opts: { offboardingId: string; abgeschlossenAm: Date; userId?: string | null },
): Promise<number> {
  const mitAusgabe = { offboardingId: opts.offboardingId, ausgabeId: { not: null } };
  const rueckgaben = await tx.returnItem.findMany({
    where: mitAusgabe,
    select: { ausgabeId: true, zustand: true, isReturned: true },
  });
  const aufgaben = await tx.offboardingChecklistItem.findMany({
    where: { ...mitAusgabe, herkunft: { in: [...OFFBOARDING_AUFGABEN_HERKUNFT] } },
    select: { ausgabeId: true, herkunft: true, isCompleted: true },
  });
  const bezogen = [
    ...new Set([...rueckgaben, ...aufgaben].map((z) => z.ausgabeId).filter((id): id is string => !!id)),
  ];
  if (bezogen.length === 0) return 0;

  // Offen IN DIESEM Austritt: die Rueckgabe-Zeile ohne Zustand, bei einem Zugang die Sperraufgabe.
  const zeileJeAusgabe = new Map(rueckgaben.map((r) => [r.ausgabeId, r]));
  const hierOffen = (ausgabeId: string): boolean => {
    const zeile = zeileJeAusgabe.get(ausgabeId);
    if (zeile) return rueckgabeOffen(zeile);
    return aufgaben.some((a) => a.ausgabeId === ausgabeId && a.herkunft === "AUSGABE" && !a.isCompleted);
  };

  const kandidaten = await tx.ausgabe.findMany({
    where: { id: { in: bezogen }, zustand: { in: [...AUSGABE_AKTIV] } },
    select: { id: true, zustand: true },
  });
  const offen = kandidaten.filter((a) => a.zustand === "AUSGEGEBEN" || hierOffen(a.id)).map((a) => a.id);
  if (offen.length === 0) return 0;

  await ausgabenSperrenIn(tx, offen, opts.abgeschlossenAm);
  const frisch = await tx.ausgabe.findMany({
    where: { id: { in: offen } },
    select: { id: true, zustand: true, zustandAm: true, loeschenAb: true },
  });
  const bezuege = await austrittsBezuegeLaden(
    tx,
    frisch.map((a) => a.id),
  );
  const austritt = { id: opts.offboardingId, abgeschlossenAm: opts.abgeschlossenAm };

  // Je Frist EIN Update (alle Stuecke eines Abschlusses haben dieselbe Frist).
  const gruppen = new Map<number, { loeschenAb: Date; ids: string[] }>();
  let gesetzt = 0;
  for (const a of frisch) {
    const loeschenAb = abschlussFrist({ ...a, hierOffen: hierOffen(a.id) }, bezuege.get(a.id) ?? [], austritt);
    if (!loeschenAb) continue;
    if (a.zustand === "VERBLEIBT") {
      // Offen uebernommenes VERBLEIBT: ein Zustandswechsel – Frist aus ausgabeZustandDaten (G3).
      const ok = await ausgabeZustandIn(tx, a.id, "AUSGEGEBEN", opts.abgeschlossenAm, {
        von: ["VERBLEIBT"],
        austrittAbgeschlossenAm: opts.abgeschlossenAm,
      });
      if (!ok) continue;
      gesetzt += 1;
      await tx.auditLog.create({
        data: {
          userId: opts.userId ?? null,
          offboardingId: opts.offboardingId,
          processType: "OFFBOARDING",
          action: AUSGABEN_AUDIT.AUSGABE_ZUSTAND_GEAENDERT,
          details: {
            ausgabeId: a.id,
            von: "VERBLEIBT",
            nach: "AUSGEGEBEN",
            ueber: "ABSCHLUSS",
            folgeaufgabe: null,
          },
        },
      });
      continue;
    }
    const gruppe = gruppen.get(loeschenAb.getTime()) ?? { loeschenAb, ids: [] };
    gruppe.ids.push(a.id);
    gruppen.set(loeschenAb.getTime(), gruppe);
  }
  for (const g of gruppen.values()) {
    const r = await tx.ausgabe.updateMany({
      where: { id: { in: g.ids }, zustand: "AUSGEGEBEN" },
      data: { loeschenAb: g.loeschenAb },
    });
    gesetzt += r.count;
  }
  return gesetzt;
}

// =============================================
// Gleichlauf im Austritt (G15 bis G17, S30)
// =============================================

/** Grund einer Abweisung im Gleichlauf (409) – Schluessel in MELDUNGEN_AUSGABEN. */
export type AusgabeKonfliktGrund = "NICHT_AUSGEGEBEN" | "STUECK_INZWISCHEN_GEAENDERT";

/**
 * Der Gleichlauf traf einen Stand, zu dem der Wechsel nicht passt (ERSETZT ist
 * endgueltig), bzw. ein bedingtes Update ohne Treffer. Wirft – die Transaktion
 * des Aufrufers rollt zurueck, der Aufrufer antwortet 409 mit
 * `MELDUNGEN_AUSGABEN[grund]`.
 */
export class AusgabeKonflikt extends Error {
  constructor(readonly grund: AusgabeKonfliktGrund) {
    super(grund);
    this.name = "AusgabeKonflikt";
  }
}

/**
 * Schritt „Ausgabe sperren, Bindung prüfen“ der drei Wege (Feinplan 1.7, G24,
 * G28): Der Aufrufer hat den Austritt, die Links (eigene Stelle und, wenn
 * `brauchtFolgeStelle` gilt, die Gebaeudewirtschaft) und die Aufgabe schon
 * hinter sich. Hier: die Ausgabe sperren (`ausgabenSperrenIn`), danach frisch
 * lesen samt Austrittsbezuegen und dem Status DIESES Austritts – und mit
 * `gleichlaufGesperrt` entscheiden, ob er sie aendern darf. Die Vorgangsnummer
 * eines bindenden anderen Austritts nur mit Sitzung und Zugriff (`session`;
 * der Link-Weg hat keine). `ausgabe: null` = es gibt sie nicht (mehr).
 */
export async function ausgabeImAustrittSperrenIn(
  tx: Db,
  opts: { offboardingId: string; ausgabeId: string; jetzt: Date; session?: SessionPayload | null },
): Promise<{ ausgabe: AusgabeDaten | null; sperre: GleichlaufSperre | null }> {
  await ausgabenSperrenIn(tx, [opts.ausgabeId], opts.jetzt);
  const [ausgabe] = await ausgabenNachIdLaden(tx, [opts.ausgabeId]);
  if (!ausgabe) return { ausgabe: null, sperre: null };
  const austritt = await tx.offboardingProcess.findUnique({
    where: { id: opts.offboardingId },
    select: { status: true },
  });
  const bezuege = await austrittsBezuegeLaden(tx, [ausgabe.id], { session: opts.session ?? null });
  return {
    ausgabe,
    sperre: gleichlaufGesperrt(ausgabe, bezuege.get(ausgabe.id) ?? [], {
      id: opts.offboardingId,
      status: austritt?.status ?? "CANCELLED",
    }),
  };
}

/** Was der Gleichlauf getan hat – fuer Linkstatus, Mails und Antwort des Aufrufers. */
export interface GleichlaufErgebnis {
  /** Zustand der Ausgabe vorher und nachher. */
  von: string;
  nach: string;
  ausgabeGeaendert: boolean;
  rueckgabeGeaendert: boolean;
  /** Die Ruecknahme- bzw. Sperraufgabe hat DIESER Aufruf umgeschaltet (nur ohne `aufgabeSchonGeschaltet`). */
  aufgabeUmgeschaltet: boolean;
  /** Was mit der Folgeaufgabe „Schließung prüfen“ geschah (G17), sonst null. */
  folgeaufgabe: FolgeSchritt["art"] | null;
  /** Stellen, deren Abteilungsstatus der Aufrufer neu berechnet (`linkStatusNeuBerechnenIn`). */
  stellen: string[];
}

/**
 * Ein Stueck, drei Zeilen, ein Stand (G15): Die Ausgabe fuehrt, die
 * Ruecknahme- bzw. Sperraufgabe (`herkunft` AUSGABE) und die Rueckgabe-Zeile
 * folgen – in der Transaktion des Aufrufers, gleich ueber welchen Weg (Link
 * der Stelle, Portal-PATCH, Reiter „Rückgaben“). `zustand` ist der
 * Rueckgabezustand, `null` heisst wieder offen (Ausgabe aktiv, Aufgabe offen,
 * Rueckgabe ohne Zustand). Wieder offen nach einem HIER gesetzten Zustand ist
 * AUSGEGEBEN – auch nach „verbleibt“ (G15, `ausgabeNachZiel`); nur ein
 * unveraendert aus einem frueheren Austritt uebernommenes VERBLEIBT bleibt.
 *
 * Voraussetzung: Der Aufrufer hat in der Reihenfolge G24 gesperrt – Austritt,
 * Links (eigene Stelle, FACILITY wenn `brauchtFolgeStelle`), Aufgabe – und
 * mit `ausgabeImAustrittSperrenIn` die Ausgabe gesperrt und die Bindung
 * geprueft. Hier, nach `gleichlaufPlan` (nur, was sich wirklich aendert):
 *
 *   1. Aufgabe umschalten (ausser `aufgabeSchonGeschaltet`: der Link-Weg hat
 *      sie mit `aufgabeUmschaltenPerLink` selbst geschaltet) – erledigt mit
 *      `completedById` = `userId` (HR) bzw. `null` (Link);
 *   2. Ausgabe bedingt auf den gelesenen Zustand (`ausgabeZustandIn`, also mit
 *      Frist aus `ausgabeZustandDaten`); wird sie in einem abgeschlossenen
 *      Austritt wieder AUSGEGEBEN, mit der Frist des Abschlusses (G18, G20);
 *   3. Rueckgabe-Zeile bedingt auf ihren gelesenen Stand (`rueckgabeDaten`:
 *      `isReturned` nur bei ZURUECK/BESCHAEDIGT);
 *   4. Folgeaufgabe NUR ueber `folgeAufgabeSchritt` (G17): die vorhandene
 *      wird nach der Sperre des FACILITY-Links gelesen; ANLEGEN per `create`,
 *      WIEDEROEFFNEN per `update` derselben Zeile, LOESCHEN bedingt auf
 *      `isCompleted: false`. Nie ein zweites `create` und nie `skipDuplicates`
 *      – der Unique-Index `[offboardingId, ausgabeId, herkunft]` liesse das
 *      erneute „fehlt“ sonst scheitern (P2002) bzw. still verschwinden;
 *   5. Protokoll `AUSGABE_ZUSTAND_GEAENDERT` (IDs und Zustaende, nie die Kennung).
 *
 * Ein ERSETZT-Stueck ist endgueltig, ein bedingtes Update ohne Treffer heisst
 * „inzwischen geaendert“: beides `AusgabeKonflikt` (Rollback, 409).
 */
export async function ausgabeGleichlaufIn(
  tx: Db,
  opts: {
    offboardingId: string;
    ausgabeId: string;
    zustand: RueckgabeZustand | null;
    jetzt: Date;
    userId: string | null;
    aufgabeSchonGeschaltet: boolean;
    /**
     * Nur mit `aufgabeSchonGeschaltet`: War die Aufgabe VOR dem Umschalten
     * erledigt? Der Link-Weg hat sie schon geschaltet, hier liest sie sich also
     * schon offen – Wiederoeffnen setzt dann AUSGEGEBEN (`ausgabeNachZiel`).
     */
    aufgabeWarErledigt?: boolean;
    /** Weg fuer das Protokoll. */
    ueber: "LINK" | "PORTAL" | "RUECKGABEN";
  },
): Promise<GleichlaufErgebnis> {
  const { offboardingId, jetzt } = opts;
  const [ausgabe] = await ausgabenNachIdLaden(tx, [opts.ausgabeId]);
  if (!ausgabe) throw new AusgabeKonflikt("STUECK_INZWISCHEN_GEAENDERT");
  const austritt = await tx.offboardingProcess.findUnique({
    where: { id: offboardingId },
    select: { status: true, completedAt: true },
  });
  const aufgabe = await tx.offboardingChecklistItem.findFirst({
    where: { offboardingId, ausgabeId: ausgabe.id, herkunft: "AUSGABE" },
    select: { id: true, isCompleted: true, assigneeDepartment: true },
  });
  const rueckgabe = await tx.returnItem.findFirst({
    where: { offboardingId, ausgabeId: ausgabe.id },
    select: { id: true, zustand: true, isReturned: true },
  });

  // Stand DIESES Austritts vor dem Wechsel: Zeile mit Zustand bzw. Aufgabe erledigt (G15).
  const warErledigt =
    (!!rueckgabe && rueckgabeZustand(rueckgabe) !== null) ||
    (opts.aufgabeSchonGeschaltet ? opts.aufgabeWarErledigt === true : aufgabe?.isCompleted === true);
  const plan = gleichlaufPlan({
    ziel: opts.zustand,
    ausgabe,
    aufgabe: opts.aufgabeSchonGeschaltet ? null : aufgabe,
    rueckgabe,
    warErledigt,
  });
  if (!plan.moeglich) throw new AusgabeKonflikt("NICHT_AUSGEGEBEN");
  const stellen = new Set<string>();

  // 1. Aufgabe
  let aufgabeUmgeschaltet = false;
  if (aufgabe && plan.aufgabeErledigt !== undefined) {
    const r = await tx.offboardingChecklistItem.updateMany({
      where: { id: aufgabe.id, isCompleted: !plan.aufgabeErledigt },
      data: plan.aufgabeErledigt
        ? { isCompleted: true, completedAt: jetzt, completedById: opts.userId }
        : { isCompleted: false, completedAt: null, completedById: null },
    });
    aufgabeUmgeschaltet = r.count === 1;
    if (aufgabeUmgeschaltet && aufgabe.assigneeDepartment) stellen.add(aufgabe.assigneeDepartment);
  }

  // 2. Ausgabe (fuehrt) – bedingt auf den gelesenen Zustand.
  if (plan.ausgabe) {
    const abgeschlossenAm =
      austritt?.status === "COMPLETED" && plan.ausgabe === "AUSGEGEBEN" ? (austritt.completedAt ?? jetzt) : null;
    const ok = await ausgabeZustandIn(tx, ausgabe.id, plan.ausgabe, jetzt, {
      von: [ausgabe.zustand],
      austrittAbgeschlossenAm: abgeschlossenAm,
    });
    if (!ok) throw new AusgabeKonflikt("STUECK_INZWISCHEN_GEAENDERT");
  }

  // 3. Rueckgabe-Zeile – bedingt auf ihren gelesenen Stand.
  if (rueckgabe && plan.rueckgabe !== undefined) {
    const r = await tx.returnItem.updateMany({
      where: { id: rueckgabe.id, zustand: rueckgabe.zustand, isReturned: rueckgabe.isReturned },
      data: rueckgabeDaten(plan.rueckgabe, jetzt, opts.userId),
    });
    if (r.count !== 1) throw new AusgabeKonflikt("STUECK_INZWISCHEN_GEAENDERT");
  }

  // 4. Folgeaufgabe „Schließung prüfen“ – nur ueber folgeAufgabeSchritt (G17).
  let folgeaufgabe: FolgeSchritt["art"] | null = null;
  if (brauchtFolgeStelle(ausgabe, ausgabe.zustand, plan.nach)) {
    const vorhanden = await tx.offboardingChecklistItem.findFirst({
      where: { offboardingId, ausgabeId: ausgabe.id, herkunft: "AUSGABE_FEHLT" },
      select: { id: true, isCompleted: true },
    });
    const schritt = folgeAufgabeSchritt({
      ausgabe,
      alt: ausgabe.zustand,
      neu: plan.nach,
      vorhanden,
      heute: berlinerKalendertag(jetzt),
    });
    if (schritt?.art === "ANLEGEN") {
      await tx.offboardingChecklistItem.create({ data: { ...schritt.aufgabe, offboardingId } });
    } else if (schritt?.art === "WIEDEROEFFNEN") {
      await tx.offboardingChecklistItem.update({ where: { id: schritt.id }, data: schritt.daten });
    } else if (schritt?.art === "LOESCHEN") {
      await tx.offboardingChecklistItem.deleteMany({ where: { id: schritt.id, isCompleted: false } });
    }
    if (schritt) {
      folgeaufgabe = schritt.art;
      stellen.add(FOLGE_STELLE);
    }
  }

  // 5. Protokoll – IDs und Zustaende, nie die Kennung (G22).
  if (plan.ausgabe || folgeaufgabe) {
    await tx.auditLog.create({
      data: {
        userId: opts.userId,
        offboardingId,
        processType: "OFFBOARDING",
        action: AUSGABEN_AUDIT.AUSGABE_ZUSTAND_GEAENDERT,
        details: {
          ausgabeId: ausgabe.id,
          von: ausgabe.zustand,
          nach: plan.nach,
          ueber: opts.ueber,
          folgeaufgabe,
        },
      },
    });
  }

  return {
    von: ausgabe.zustand,
    nach: plan.nach,
    ausgabeGeaendert: plan.ausgabe !== null,
    rueckgabeGeaendert: !!rueckgabe && plan.rueckgabe !== undefined,
    aufgabeUmgeschaltet,
    folgeaufgabe,
    stellen: [...stellen],
  };
}
