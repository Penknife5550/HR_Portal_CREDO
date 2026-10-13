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
 * Spaetere Schritte haengen hier an: der Gleichlauf mit Aufgabe und
 * Rueckgabe (`ausgabeGleichlaufIn`, S30), offene Stuecke beim Abschluss des
 * Austritts (`offeneAusgabenAbschliessenIn`, S31) und das Loeschen im Lauf
 * (`ausgabenLoeschenIn`, S35).
 */

import type { Prisma } from "@prisma/client";
import {
  AUSGABE_AKTIV,
  absageFrist,
  ausgabeZustandDaten,
  ersatzBasis,
  tauschZustand,
  type AusgabeZustand,
  type NeueAusgabe,
  type TauschGrund,
} from "@/lib/ausgaben";
// Nur lesend (G28: Austrittsbezug NACH der Sperre); ausgaben-daten.ts
// importiert von hier nichts, es entsteht also kein Kreis.
import { austrittsBezuegeLaden } from "@/lib/ausgaben-daten";
import { kalendertagAlsDatum, type Kalendertag } from "@/lib/kalendertag";

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
