/**
 * CREDO HR-Portal – Ausstattung & Zugaenge: der Katalog auf dem Server
 *
 * Einstellungen → Ausstattung & Zugänge (nur Admin-Rollen, adminHandler in den
 * Routen unter /api/settings/ausstattung):
 *
 *   katalogLaden           GET    /api/settings/ausstattung
 *   positionAnlegen        POST   /api/settings/ausstattung
 *   positionAendern        PATCH  /api/settings/ausstattung/[id]
 *   positionLoeschen       DELETE /api/settings/ausstattung/[id]
 *   ausblendungSetzen      PUT    /api/settings/ausstattung/[id]/ausblendung
 *   vorschlaegeUebernehmen POST   /api/settings/ausstattung/vorschlaege
 *   rueckgabeVorgabenUebernehmen POST /api/settings/ausstattung/rueckgabe-vorgaben (A4, G27)
 *
 * Dazu `katalogAusschnittLaden`: die Positionen, die EIN Vorgang anbietet
 * (Arbeitsort, Einrichtungsart, Personengruppe, Vorgangsart, Adresse der
 * Stelle) — fuer das Formular der Fuehrungskraft (S8), den Merker
 * `mitAusstattung` (S7, ueber `ausstattungAngebotenIn`) und „Hinzufügen“ in
 * der HR-Karte (S15).
 *
 * Die Regeln selbst stehen rein in src/lib/ausstattung.ts (positionPruefen,
 * positionenFuer, adressLuecken, aehnlicheVorlagenpunkte, freigabeWarnungen,
 * katalogAenderungen …); hier stehen nur Laden, Schreiben und Protokoll. Die
 * Routen sind duenn: Sitzung, Body, EINE Funktion von hier, Antwort 1:1.
 *
 * Regeln, die beim Aendern gelten muessen:
 *   1. Neue Positionen sind AUS — beim Anlegen und bei „Vorschläge übernehmen“
 *      (Regel 1). `isActive` kennt nur der PATCH.
 *   2. Geschrieben wird nur die Positivliste `KATALOG_FELDER` — seit S23 mit
 *      den A4-Feldern „Beim Austritt“ (G8). `vorschlagSchluessel` verwirft
 *      schon Zod; ihn setzt allein `vorschlaegeUebernehmen` (F11,
 *      `createMany` mit `skipDuplicates` — Doppelklick und zwei Tabs bleiben
 *      folgenlos), und zwar IMMER ohne A4-Werte (G27).
 *   8. A4 schaltet nur eine bewusste Handlung ein (G27): von Hand im
 *      Positionsdialog oder `rueckgabeVorgabenUebernehmen` — diese setzt die
 *      Vorgaben (RUECKGABE_VORGABEN in ausgaben.ts) NUR an Positionen mit
 *      `vorschlagSchluessel` und leerem `beiAustritt`, je Position bedingt
 *      (`beiAustritt: null` im WHERE), in EINER Transaktion samt Protokoll.
 *      Wiederholbar; von HR gesetzte Werte bleiben. Aktive Webhooks auf die
 *      Offboarding-Abteilungsereignisse meldet die Antwort als `hinweis`
 *      (G21), ohne zu sperren.
 *   3. Jede Aenderung wird protokolliert (Regel 18), im selben Commit,
 *      `processType: "SYSTEM"`: Anlegen mit `nachher`, Loeschen mit `vorher`,
 *      Aendern mit `aenderungen { feld: { von, nach } }` — nur Felder, die sich
 *      wirklich aendern. Ohne echte Aenderung: kein Schreiben, kein Protokoll.
 *      „Vorschläge übernehmen“ nennt je angelegter Position ID, Schluessel und
 *      Titel — so hat auch sie einen Anlage-Eintrag.
 *   4. Zwei Sperren im PATCH, beide 409 `grund: "INZWISCHEN_GEAENDERT"`:
 *      a) `stand` (Feld des Bodys) ist der `updatedAt`, den der Dialog beim
 *         Oeffnen geladen hat. Der Dialog schickt das GANZE Formular; weicht
 *         der Stand ab, hat ein anderer Tab inzwischen gespeichert, und dessen
 *         Aenderung wuerde sonst still mit dem alten Formular zurueckgedreht.
 *         Ohne `stand` (Ein-/Ausschalten in der Zeile, ein einzelnes Feld)
 *         entfaellt diese Sperre.
 *      b) `positionPruefen` laeuft auf dem ZUSAMMENGEFUEHRTEN Stand
 *         (gespeicherte Zeile + Aenderung), geschrieben wird bedingt auf den
 *         gelesenen `updatedAt`: Speichert jemand zwischen Lesen und Schreiben,
 *         gilt die Pruefung nicht mehr → 409 statt eines ungeprueften
 *         Mischstands.
 *   5. Loeschen nur, solange kein Vorgang die Position gewaehlt hat (409
 *      IN_VERWENDUNG, „bitte ausschalten“). Die Vorgaenge behalten ohnehin ihre
 *      Momentaufnahme (Regel 4); geloescht wuerde nur der Bezug.
 *   6. Ausblenden gibt es nur fuer zentrale Positionen. Wird eine zentrale
 *      Position per PATCH zu einer Position einer Einrichtung, fallen ihre
 *      Ausblendungen in derselben Transaktion weg.
 *   7. Unbekannte Stellen (weder fester Schluessel noch unter Einstellungen →
 *      Abteilungen angelegt) weist der Server ab — wie der Checklisten-PATCH.
 *      Eine Position fuer eine Stelle, die es nicht gibt, kaeme nie im
 *      Formular an.
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { DEPARTMENT_KEYS, abteilungLabel } from "@/lib/constants";
import { empfaengerFreigegeben, ladeErlaubteDomains } from "@/lib/empfaenger-allowlist";
import {
  abteilungsSchluesselBekannt,
  empfaengerAufloesen,
  istOffboardingVorlagenName,
  meldungUnbekannteZustaendigkeit,
  onboardingEmpfaengerEinrichtung,
  type AbteilungsKonfig,
  type DienstAntwort,
} from "@/lib/abteilungsaufgaben";
import {
  AUSSTATTUNG_AUDIT,
  MELDUNGEN,
  VORSCHLAEGE,
  adressLuecken,
  aehnlicheVorlagenpunkte,
  freigabeWarnungen,
  katalogAenderungen,
  katalogStellen,
  katalogWerte,
  nachStelleSortiert,
  positionPruefen,
  positionenFuer,
  vorschlaegeMeldung,
  type KatalogEinrichtung,
  type KatalogEintrag,
  type KatalogPosition,
  type KatalogUebersicht,
  type KatalogVorlagenpunkt,
  type KatalogWarnungen,
  type KatalogWerte,
} from "@/lib/ausstattung";
import {
  A4_WEBHOOK_EREIGNISSE,
  MELDUNGEN_AUSGABEN,
  rueckgabeVorgabenPlan,
  type VorgabenEintrag,
} from "@/lib/ausgaben";
import type {
  AusblendungInput,
  KatalogPositionAenderungInput,
  KatalogPositionInput,
} from "@/lib/validations/ausstattung";

type Db = Prisma.TransactionClient;

/** Wer schreibt (Protokoll). */
interface Schreiber {
  userId: string | null;
}

/** Ausblendungen und Verwendung gehen mit jeder Position hinaus. */
const MIT_ANHANG = {
  ausblendungen: { select: { organizationId: true }, orderBy: { organizationId: "asc" } },
  _count: { select: { auswahlen: true } },
} as const satisfies Prisma.AusstattungsPositionInclude;

type PositionMitAnhang = Prisma.AusstattungsPositionGetPayload<{ include: typeof MIT_ANHANG }>;

const KONFIG_AUSWAHL = {
  departmentKey: true,
  departmentName: true,
  email: true,
  organizationId: true,
  isActive: true,
} as const satisfies Prisma.DepartmentConfigSelect;

// =============================================
// Kleine Helfer
// =============================================

function prismaCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

/**
 * Antwortform einer Position: Zeile ohne Zaehler, dazu `verwendung`;
 * `updatedAt` als ISO-Zeitstempel — der `stand` des Dialogs (Regel 4a).
 */
function positionDto(zeile: PositionMitAnhang): KatalogEintrag {
  const { _count, updatedAt, ...rest } = zeile;
  return { ...rest, updatedAt: updatedAt.toISOString(), verwendung: _count.auswahlen };
}

/** 409 der beiden Sperren aus Regel 4 — die Karte schliesst daraufhin den Dialog und laedt neu. */
const INZWISCHEN_GEAENDERT: DienstAntwort = {
  status: 409,
  body: { error: MELDUNGEN.POSITION_INZWISCHEN_GEAENDERT, grund: "INZWISCHEN_GEAENDERT" },
};

/** Schreibdaten aus den Werten der Positivliste (Listen kopiert, Prisma will veraenderbare Arrays). */
function schreibDaten(w: Partial<KatalogWerte>): Prisma.AusstattungsPositionUncheckedUpdateInput {
  const { einrichtungsarten, optionen, vorausgewaehlteOptionen, personengruppen, sichtbarFuer, ...rest } = w;
  return {
    ...rest,
    ...(einrichtungsarten && { einrichtungsarten: [...einrichtungsarten] }),
    ...(optionen && { optionen: [...optionen] }),
    ...(vorausgewaehlteOptionen && { vorausgewaehlteOptionen: [...vorausgewaehlteOptionen] }),
    ...(personengruppen && { personengruppen: [...personengruppen] }),
    ...(sichtbarFuer && { sichtbarFuer: [...sichtbarFuer] }),
  };
}

function anlageDaten(w: KatalogWerte): Prisma.AusstattungsPositionCreateManyInput {
  return {
    ...w,
    einrichtungsarten: [...w.einrichtungsarten],
    optionen: [...w.optionen],
    vorausgewaehlteOptionen: [...w.vorausgewaehlteOptionen],
    personengruppen: [...w.personengruppen],
    sichtbarFuer: [...w.sichtbarFuer],
  };
}

/** Gibt es die Einrichtung? (Zod prueft nur die Form, eine unbekannte ist ein 400.) */
async function einrichtungVorhanden(organizationId: string): Promise<boolean> {
  const ort = await prisma.organization.findUnique({ where: { id: organizationId }, select: { id: true } });
  return !!ort;
}

/**
 * Erste unbekannte Stelle als Meldung, sonst null. Feste Schluessel kennt der
 * Code, eigene nur Einstellungen → Abteilungen (auch deaktivierte) — die
 * Datenbank wird nur gefragt, wenn ein eigener Schluessel dabei ist.
 */
async function unbekannteStelle(schluessel: ReadonlyArray<string>): Promise<string | null> {
  const fest = Object.values(DEPARTMENT_KEYS) as string[];
  const eigene = [...new Set(schluessel)].filter((k) => !fest.includes(k));
  if (eigene.length === 0) return null;
  const konfigs = await prisma.departmentConfig.findMany({ select: { departmentKey: true } });
  const bekannte = konfigs.map((k) => k.departmentKey);
  const unbekannt = eigene.find((k) => !abteilungsSchluesselBekannt(k, bekannte));
  return unbekannt ? meldungUnbekannteZustaendigkeit(unbekannt) : null;
}

async function protokoll(
  tx: Db,
  wer: Schreiber,
  action: string,
  details: Prisma.InputJsonObject,
): Promise<void> {
  await tx.auditLog.create({
    data: { userId: wer.userId ?? null, processType: "SYSTEM", action, details },
  });
}

/** Kennung einer Position im Protokoll (ohne Freitext). */
function kennung(p: { id: string; departmentKey: string; organizationId: string | null; bezeichnung: string }) {
  return {
    positionId: p.id,
    departmentKey: p.departmentKey,
    organizationId: p.organizationId,
    bezeichnung: p.bezeichnung,
  };
}

class InVerwendung extends Error {
  constructor(readonly anzahl: number) {
    super("Position in Verwendung");
  }
}

// =============================================
// GET: Katalog samt Warnungen
// =============================================

/**
 * Die Warnungen der Katalogseite, auf dem Server gerechnet:
 *   - Adresslücken: aktive Position × aktive Einrichtung ohne Adresse der Stelle
 *     (Regel 11; dort fehlt die Position im Formular).
 *   - Aehnliche Vorlagenpunkte: Punkte AKTIVER ONBOARDING-Checklisten
 *     (`questionnaireType` gesetzt, kein „Offboarding:“-Name — so waehlt
 *     POST /api/onboarding seine Vorlage) derselben Stelle, die nach einer
 *     Position klingen (doppelte Aufgabe droht). Alle Positionen, auch
 *     ausgeschaltete: Die Warnung soll VOR dem Einschalten stehen.
 *   - Ausserhalb der Freigabeliste (E-A27): Adressen der Stellen des Katalogs,
 *     deren Domain nicht auf der Liste steht. Nur warnen.
 */
export async function warnungenBerechnen(opts: {
  positionen: ReadonlyArray<KatalogEintrag>;
  einrichtungen: ReadonlyArray<KatalogEinrichtung>;
  konfigs: ReadonlyArray<AbteilungsKonfig>;
}): Promise<KatalogWarnungen> {
  const [punkte, domains] = await Promise.all([
    prisma.checklistTemplateItem.findMany({
      where: { template: { isActive: true, questionnaireType: { not: null } } },
      select: {
        id: true,
        templateId: true,
        title: true,
        defaultAssignee: true,
        template: { select: { name: true } },
      },
      orderBy: [{ template: { name: "asc" } }, { orderIndex: "asc" }],
    }),
    ladeErlaubteDomains(),
  ]);
  const vorlagenpunkte: KatalogVorlagenpunkt[] = punkte
    .filter((p) => !istOffboardingVorlagenName(p.template.name))
    .map((p) => ({
      id: p.id,
      templateId: p.templateId,
      templateName: p.template.name,
      defaultAssignee: p.defaultAssignee,
      title: p.title,
    }));
  return {
    adressLuecken: adressLuecken(opts.positionen, opts.einrichtungen, opts.konfigs),
    aehnlicheVorlagenpunkte: aehnlicheVorlagenpunkte(opts.positionen, vorlagenpunkte),
    ausserhalbFreigabe: freigabeWarnungen(opts.positionen, opts.konfigs, opts.einrichtungen, (email) =>
      empfaengerFreigegeben({ empfaenger: email, empfaengerVorgang: "", domains }),
    ),
  };
}

/**
 * Alles fuer die Katalogseite: Positionen (sortiert nach Stelle, Reihenfolge,
 * Bezeichnung; mit Ausblendungen und Verwendung), Einrichtungen (auch
 * inaktive, gekennzeichnet), Stellen zur Auswahl und die Warnungen.
 */
export async function katalogLaden(): Promise<KatalogUebersicht> {
  const [zeilen, einrichtungen, konfigs] = await Promise.all([
    prisma.ausstattungsPosition.findMany({ include: MIT_ANHANG }),
    prisma.organization.findMany({
      select: { id: true, name: true, type: true, isActive: true },
      orderBy: { name: "asc" },
    }),
    prisma.departmentConfig.findMany({ select: KONFIG_AUSWAHL }),
  ]);
  const positionen = nachStelleSortiert(zeilen.map(positionDto));
  return {
    positionen,
    einrichtungen,
    stellen: katalogStellen(konfigs, positionen),
    warnungen: await warnungenBerechnen({ positionen, einrichtungen, konfigs }),
  };
}

// =============================================
// POST: Position anlegen
// =============================================

/**
 * Neue Position, immer ausgeschaltet. 400 bei `positionPruefen`, unbekannter
 * Stelle oder unbekannter Einrichtung; 409 bei verletzter Eindeutigkeit.
 */
export async function positionAnlegen(opts: { body: KatalogPositionInput } & Schreiber): Promise<DienstAntwort> {
  const werte = katalogWerte({ ...opts.body, isActive: false });

  const fehler = positionPruefen(werte) ?? (await unbekannteStelle([werte.departmentKey, ...werte.sichtbarFuer]));
  if (fehler) return { status: 400, body: { error: fehler } };
  if (werte.organizationId && !(await einrichtungVorhanden(werte.organizationId))) {
    return { status: 400, body: { error: MELDUNGEN.EINRICHTUNG_UNBEKANNT } };
  }

  try {
    const neu = await prisma.$transaction(async (tx) => {
      const zeile = await tx.ausstattungsPosition.create({ data: anlageDaten(werte), include: MIT_ANHANG });
      await protokoll(tx, opts, AUSSTATTUNG_AUDIT.POSITION_ANGELEGT, {
        ...kennung(zeile),
        nachher: katalogWerte(zeile),
      });
      return zeile;
    });
    return { status: 201, body: { data: positionDto(neu) } };
  } catch (error) {
    if (prismaCode(error) === "P2002") return { status: 409, body: { error: MELDUNGEN.POSITION_VORHANDEN } };
    // Die Einrichtung verschwand zwischen Pruefung und Anlage.
    if (prismaCode(error) === "P2003") return { status: 400, body: { error: MELDUNGEN.EINRICHTUNG_UNBEKANNT } };
    throw error;
  }
}

// =============================================
// PATCH: Position aendern (auch ein-/ausschalten)
// =============================================

/**
 * Aendert nur, was sich wirklich aendert (Regel 3). Mit `stand` zuerst der
 * Vergleich mit dem gespeicherten `updatedAt` (Regel 4a); `positionPruefen`
 * laeuft auf gespeicherter Zeile plus Aenderung; geschrieben wird bedingt auf
 * den gelesenen `updatedAt` (Regel 4b). 404 unbekannt, 400 Pruefung, 409 wenn
 * inzwischen jemand anderes gespeichert hat.
 */
export async function positionAendern(
  opts: { id: string; body: KatalogPositionAenderungInput } & Schreiber,
): Promise<DienstAntwort> {
  const bisher = await prisma.ausstattungsPosition.findUnique({ where: { id: opts.id }, include: MIT_ANHANG });
  if (!bisher) return { status: 404, body: { error: MELDUNGEN.POSITION_NICHT_GEFUNDEN } };
  // Regel 4a: Das Formular stammt von einem aelteren Stand — auch wenn es dem
  // heutigen zufaellig gleicht, nicht schreiben (sonst kaeme ein 200 auf einen
  // Stand, den der Absender nie gesehen hat).
  if (opts.body.stand !== undefined && new Date(opts.body.stand).getTime() !== bisher.updatedAt.getTime()) {
    return INZWISCHEN_GEAENDERT;
  }

  const { daten, aenderungen } = katalogAenderungen(bisher, opts.body);
  if (Object.keys(daten).length === 0) return { status: 200, body: { data: positionDto(bisher) } };

  const stand: KatalogWerte = { ...katalogWerte(bisher), ...daten };
  const neueStellen = [
    ...(daten.departmentKey !== undefined ? [daten.departmentKey] : []),
    ...(daten.sichtbarFuer ?? []).filter((k) => !bisher.sichtbarFuer.includes(k)),
  ];
  const fehler = positionPruefen(stand) ?? (await unbekannteStelle(neueStellen));
  if (fehler) return { status: 400, body: { error: fehler } };
  if (daten.organizationId && !(await einrichtungVorhanden(daten.organizationId))) {
    return { status: 400, body: { error: MELDUNGEN.EINRICHTUNG_UNBEKANNT } };
  }
  // Regel 6: Eine Position einer Einrichtung kennt keine Ausblendungen.
  const ausblendungenWeg = !!stand.organizationId && bisher.ausblendungen.length > 0;

  try {
    const neu = await prisma.$transaction(async (tx) => {
      let entfernt = 0;
      if (ausblendungenWeg) {
        entfernt = (await tx.ausstattungsAusblendung.deleteMany({ where: { positionId: bisher.id } })).count;
      }
      const zeile = await tx.ausstattungsPosition.update({
        where: { id: bisher.id, updatedAt: bisher.updatedAt },
        data: schreibDaten(daten),
        include: MIT_ANHANG,
      });
      await protokoll(tx, opts, AUSSTATTUNG_AUDIT.POSITION_GEAENDERT, {
        ...kennung(bisher),
        aenderungen,
        ...(entfernt > 0 && { ausblendungenEntfernt: entfernt }),
      });
      return zeile;
    });
    return { status: 200, body: { data: positionDto(neu) } };
  } catch (error) {
    const code = prismaCode(error);
    if (code === "P2025") {
      // Bedingung auf updatedAt verfehlt: geloescht (404) oder inzwischen geaendert (409).
      const noch = await prisma.ausstattungsPosition.findUnique({ where: { id: opts.id }, select: { id: true } });
      return noch ? INZWISCHEN_GEAENDERT : { status: 404, body: { error: MELDUNGEN.POSITION_NICHT_GEFUNDEN } };
    }
    if (code === "P2003") return { status: 400, body: { error: MELDUNGEN.EINRICHTUNG_UNBEKANNT } };
    throw error;
  }
}

// =============================================
// DELETE: Position loeschen
// =============================================

/**
 * Loescht eine Position, die kein Vorgang gewaehlt hat (Regel 5; sonst 409
 * IN_VERWENDUNG — „bitte ausschalten statt löschen“). Geprueft wird in der
 * Transaktion, die loescht. Ausblendungen gehen per Kaskade mit. Eine
 * geloeschte Vorschlags-Position legt „Vorschläge übernehmen“ wieder an.
 */
export async function positionLoeschen(opts: { id: string } & Schreiber): Promise<DienstAntwort> {
  const bisher = await prisma.ausstattungsPosition.findUnique({ where: { id: opts.id } });
  if (!bisher) return { status: 404, body: { error: MELDUNGEN.POSITION_NICHT_GEFUNDEN } };

  try {
    await prisma.$transaction(async (tx) => {
      const verwendung = await tx.onboardingAusstattung.count({ where: { positionId: bisher.id } });
      if (verwendung > 0) throw new InVerwendung(verwendung);
      await tx.ausstattungsPosition.delete({ where: { id: bisher.id } });
      await protokoll(tx, opts, AUSSTATTUNG_AUDIT.POSITION_GELOESCHT, {
        ...kennung(bisher),
        vorschlagSchluessel: bisher.vorschlagSchluessel,
        vorher: katalogWerte(bisher),
      });
    });
  } catch (error) {
    if (error instanceof InVerwendung) {
      return {
        status: 409,
        body: { error: MELDUNGEN.IN_VERWENDUNG, grund: "IN_VERWENDUNG", verwendung: error.anzahl },
      };
    }
    if (prismaCode(error) === "P2025") return { status: 404, body: { error: MELDUNGEN.POSITION_NICHT_GEFUNDEN } };
    throw error;
  }
  return { status: 200, body: { success: true } };
}

// =============================================
// PUT: zentrale Position fuer eine Einrichtung aus-/einblenden
// =============================================

/**
 * `ausgeblendet: true` legt die Ausblendung an, `false` nimmt sie weg —
 * idempotent; protokolliert wird nur ein echter Wechsel. Nur zentrale
 * Positionen (400 AUSBLENDEN_NUR_ZENTRAL), nur bekannte Einrichtungen (400).
 */
export async function ausblendungSetzen(
  opts: { id: string; body: AusblendungInput } & Schreiber,
): Promise<DienstAntwort> {
  const { organizationId, ausgeblendet } = opts.body;
  const position = await prisma.ausstattungsPosition.findUnique({
    where: { id: opts.id },
    select: { id: true, departmentKey: true, organizationId: true, bezeichnung: true },
  });
  if (!position) return { status: 404, body: { error: MELDUNGEN.POSITION_NICHT_GEFUNDEN } };
  if (position.organizationId) return { status: 400, body: { error: MELDUNGEN.AUSBLENDEN_NUR_ZENTRAL } };
  if (!(await einrichtungVorhanden(organizationId))) {
    return { status: 400, body: { error: MELDUNGEN.EINRICHTUNG_UNBEKANNT } };
  }

  try {
    const geaendert = await prisma.$transaction(async (tx) => {
      const { count } = ausgeblendet
        ? await tx.ausstattungsAusblendung.createMany({
            data: [{ positionId: position.id, organizationId }],
            skipDuplicates: true,
          })
        : await tx.ausstattungsAusblendung.deleteMany({ where: { positionId: position.id, organizationId } });
      if (count > 0) {
        await protokoll(tx, opts, AUSSTATTUNG_AUDIT.AUSBLENDUNG_GEAENDERT, {
          ...kennung(position),
          einrichtungId: organizationId,
          ausgeblendet,
        });
      }
      return count > 0;
    });
    return { status: 200, body: { data: { positionId: position.id, organizationId, ausgeblendet, geaendert } } };
  } catch (error) {
    // Position oder Einrichtung verschwand zwischen Lesen und Schreiben.
    if (prismaCode(error) === "P2003") return { status: 404, body: { error: MELDUNGEN.POSITION_NICHT_GEFUNDEN } };
    throw error;
  }
}

// =============================================
// POST: Vorschlaege uebernehmen
// =============================================

/**
 * Legt die Vorschlaege (VORSCHLAEGE in ausstattung.ts) an, die noch fehlen —
 * ausgeschaltet, zentral, ohne Faelligkeit und ohne A4-Werte (G27: „Beim
 * Austritt“ bleibt leer, bis `rueckgabeVorgabenUebernehmen` laeuft). `vorschlagSchluessel @unique` +
 * `skipDuplicates` machen den Aufruf wiederholbar (F11): Der zweite legt
 * nichts an. Protokolliert wird nur, wenn etwas angelegt wurde — mit ID,
 * Schluessel, Stelle und Titel JEDER angelegten Position (Regel 18): Nach
 * Loeschen und erneutem Uebernehmen ist sonst nicht nachvollziehbar, welche
 * Position wann und von wem wieder angelegt wurde. `createManyAndReturn`
 * liefert mit `skipDuplicates` nur die wirklich angelegten Zeilen.
 */
export async function vorschlaegeUebernehmen(opts: Schreiber): Promise<DienstAntwort> {
  const daten = VORSCHLAEGE.map((v) => ({
    ...anlageDaten(katalogWerte({ ...v, isActive: false })),
    vorschlagSchluessel: v.vorschlagSchluessel,
  }));
  const reihenfolge = new Map(daten.map((d, i) => [d.vorschlagSchluessel, i]));
  const angelegt = await prisma.$transaction(async (tx) => {
    const neu = await tx.ausstattungsPosition.createManyAndReturn({
      data: daten,
      skipDuplicates: true,
      select: { id: true, vorschlagSchluessel: true, departmentKey: true, organizationId: true, bezeichnung: true },
    });
    if (neu.length > 0) {
      const positionen = [...neu]
        .sort(
          (a, b) =>
            (reihenfolge.get(a.vorschlagSchluessel ?? "") ?? 0) - (reihenfolge.get(b.vorschlagSchluessel ?? "") ?? 0),
        )
        .map((p) => ({ ...kennung(p), vorschlagSchluessel: p.vorschlagSchluessel }));
      await protokoll(tx, opts, AUSSTATTUNG_AUDIT.VORSCHLAEGE_UEBERNOMMEN, {
        angelegt: neu.length,
        vorhanden: daten.length - neu.length,
        positionen,
      });
    }
    return neu.length;
  });
  const vorhanden = daten.length - angelegt;
  return { status: 200, body: { angelegt, vorhanden, meldung: vorschlaegeMeldung(angelegt, vorhanden) } };
}

// =============================================
// POST: Rueckgabe-Vorgaben uebernehmen (A4, G27)
// =============================================

/**
 * Zaehlt aktive Webhooks auf die Offboarding-Abteilungsereignisse (G21). Eine
 * gescheiterte Abfrage zaehlt 0 — der Hinweis ist eine Hilfe, keine Sperre,
 * und die Aenderung ist dann schon geschrieben.
 */
async function offboardingWebhooksAktiv(): Promise<number> {
  try {
    return await prisma.webhookConfig.count({
      where: { event: { in: [...A4_WEBHOOK_EREIGNISSE] }, isActive: true },
    });
  } catch {
    return 0;
  }
}

/**
 * „Rückgabe-Vorgaben übernehmen …“ (Einstellungen → Ausstattung & Zugänge,
 * nur ADMIN_ROLES über `adminHandler`): setzt `beiAustritt`,
 * `rueckgabeKategorie` und `ausgabeKennung` aus RUECKGABE_VORGABEN an den
 * vorhandenen Positionen aus „Vorschläge übernehmen“, die noch keinen Wert
 * für „Beim Austritt“ haben und keine Angabe sind (`rueckgabeVorgabenPlan`).
 * Je Position ein bedingtes `updateMany` (`beiAustritt: null` UND „keine
 * Angabe“ im WHERE — bei READ COMMITTED prueft das UPDATE die neueste
 * Zeilenfassung): Hat jemand die Position zwischen Lesen und Schreiben selbst
 * gesetzt oder zur Angabe gemacht, bleibt sie, wie sie ist (G8: eine Angabe
 * traegt nie RUECKGABE/SPERREN). Solche Positionen liest die Aktion danach
 * neu und ordnet sie mit derselben Regel ein, damit die Meldung den
 * richtigen Grund nennt; eine inzwischen geloeschte zaehlt nicht. Protokoll
 * `AUSSTATTUNG_RUECKGABE_VORGABEN_UEBERNOMMEN` mit IDs, Schluesseln und
 * Anzahl im selben Commit — nur, wenn etwas gesetzt wurde. Antwort 200
 * `{ gesetzt, uebersprungen, meldung, hinweis? }`; `hinweis` bei aktiven
 * Offboarding-Webhooks (G21), ohne zu sperren.
 */
export async function rueckgabeVorgabenUebernehmen(opts: Schreiber): Promise<DienstAntwort> {
  const auswahl = {
    id: true,
    art: true,
    bezeichnung: true,
    departmentKey: true,
    vorschlagSchluessel: true,
    beiAustritt: true,
  } as const;
  const ergebnis = await prisma.$transaction(async (tx) => {
    const positionen = await tx.ausstattungsPosition.findMany({
      where: { vorschlagSchluessel: { not: null } },
      select: auswahl,
      orderBy: { vorschlagSchluessel: "asc" },
    });
    const plan = rueckgabeVorgabenPlan(positionen);
    const gesetzt: VorgabenEintrag[] = [];
    const verfehlt: string[] = [];
    for (const e of plan.setzen) {
      const { count } = await tx.ausstattungsPosition.updateMany({
        where: { id: e.id, beiAustritt: null, art: { not: "ANGABE" } },
        data: {
          beiAustritt: e.vorgabe.beiAustritt,
          rueckgabeKategorie: e.vorgabe.rueckgabeKategorie,
          ausgabeKennung: e.vorgabe.ausgabeKennung,
        },
      });
      if (count > 0) gesetzt.push(e);
      else verfehlt.push(e.id);
    }
    let uebersprungen = plan.uebersprungen;
    if (verfehlt.length > 0) {
      const geaendert = await tx.ausstattungsPosition.findMany({ where: { id: { in: verfehlt } }, select: auswahl });
      uebersprungen = [...uebersprungen, ...rueckgabeVorgabenPlan(geaendert).uebersprungen];
    }
    const angaben = uebersprungen.filter((e) => e.grund === "ANGABE").length;
    if (gesetzt.length > 0) {
      await protokoll(tx, opts, AUSSTATTUNG_AUDIT.RUECKGABE_VORGABEN_UEBERNOMMEN, {
        anzahl: gesetzt.length,
        uebersprungen: uebersprungen.length,
        // Die Werte selbst folgen aus dem Schluessel (RUECKGABE_VORGABEN).
        positionen: gesetzt.map((e) => ({ positionId: e.id, vorschlagSchluessel: e.vorschlagSchluessel })),
      });
    }
    return { gesetzt: gesetzt.length, mitWert: uebersprungen.length - angaben, angaben };
  });
  const webhooks = await offboardingWebhooksAktiv();
  return {
    status: 200,
    body: {
      gesetzt: ergebnis.gesetzt,
      uebersprungen: ergebnis.mitWert + ergebnis.angaben,
      meldung: MELDUNGEN_AUSGABEN.RUECKGABE_VORGABEN_ERGEBNIS(ergebnis.gesetzt, ergebnis.mitWert, ergebnis.angaben),
      ...(webhooks > 0 && { hinweis: MELDUNGEN_AUSGABEN.RUECKGABE_VORGABEN_WEBHOOKS(webhooks) }),
    },
  };
}

// =============================================
// Ausschnitt je Vorgang (S7, S8, S15)
// =============================================

/** Was `katalogAusschnittLaden` ueber den Vorgang wissen muss. */
export interface AusschnittVorgang {
  /** Einrichtung des Vorgangs (Mandant). */
  organizationId: string;
  /** Abweichender Arbeitsort (E-A10); leer = Einrichtung des Vorgangs. */
  arbeitsortId?: string | null;
  questionnaireType: string;
  processType: string;
}

export interface KatalogAusschnitt {
  /** Wirksamer Arbeitsort (`onboardingEmpfaengerEinrichtung`). */
  arbeitsortId: string;
  /** `positionenFuer` dieses Vorgangs, sortiert; leer = kein Schritt im Formular. */
  positionen: KatalogPosition[];
  /** Anzeigename je Stelle der Positionen und ihrer „Sichtbar für“-Stellen, am Arbeitsort aufgeloest. */
  stellenNamen: Record<string, string>;
}

/**
 * Die Positionen, die EIN Vorgang anbietet (Regel 1, E-A10): aktiv, am
 * wirksamen Arbeitsort gueltig (eigene Positionen des Arbeitsorts, zentrale mit
 * passender Einrichtungsart DES ARBEITSORTS, die er nicht ausgeblendet hat),
 * nur bei EINSTELLUNG, Personengruppe passt, und die Stelle hat AM ARBEITSORT
 * eine aktive Adresse (HR braucht keine). Laeuft in einer fremden Transaktion
 * (`db`) oder mit dem globalen Client; die Abfragen laufen nacheinander.
 *
 * Ohne aktive Position und ausserhalb von EINSTELLUNG fragt sie nur einmal
 * bzw. gar nicht — der Regelfall nach dem Deploy (leerer Katalog) kostet eine
 * Abfrage.
 */
export async function katalogAusschnittLaden(db: Db, vorgang: AusschnittVorgang): Promise<KatalogAusschnitt> {
  const arbeitsortId = onboardingEmpfaengerEinrichtung(vorgang);
  const leer: KatalogAusschnitt = { arbeitsortId, positionen: [], stellenNamen: {} };
  if (vorgang.processType !== "EINSTELLUNG") return leer;

  const katalog = await db.ausstattungsPosition.findMany({ where: { isActive: true } });
  if (katalog.length === 0) return leer;

  const ort = await db.organization.findUnique({ where: { id: arbeitsortId }, select: { type: true } });
  const ausblendungen = await db.ausstattungsAusblendung.findMany({
    where: { organizationId: arbeitsortId },
    select: { positionId: true, organizationId: true },
  });
  const konfigs = await db.departmentConfig.findMany({ select: KONFIG_AUSWAHL });

  const empfaenger = (departmentKey: string) =>
    empfaengerAufloesen({ departmentKey, organizationId: arbeitsortId, konfigs, fuehrungskraft: null });
  const positionen = positionenFuer(katalog, {
    arbeitsortId,
    einrichtungsart: ort?.type ?? null,
    questionnaireType: vorgang.questionnaireType,
    processType: vorgang.processType,
    ausblendungen,
    adresseVorhanden: (departmentKey) => empfaenger(departmentKey).ok,
  });

  const stellen = new Set(positionen.flatMap((p) => [p.departmentKey, ...p.sichtbarFuer]));
  const stellenNamen = Object.fromEntries(
    [...stellen].map((key) => [
      key,
      key === DEPARTMENT_KEYS.HR ? abteilungLabel(key) : empfaenger(key).departmentName,
    ]),
  );
  return { arbeitsortId, positionen, stellenNamen };
}

/**
 * Bietet das Formular der Fuehrungskraft den Schritt „Ausstattung & Zugänge“
 * an? (Regel 1 + 2, S7) — genau dann, wenn `katalogAusschnittLaden` fuer
 * diesen Vorgang mindestens eine Position liefert.
 *
 * Aufrufer sind die beiden Stellen, die den Modalitaeten-Link erzeugen
 * (POST /api/onboarding und /supervisor-link); sie rechnen es IN DERSELBEN
 * Transaktion wie `vorgesetztenLinkSetzen`, das daraus den Merker
 * `SupervisorData.mitAusstattung` setzt. Den Katalog liest danach niemand mehr
 * fuer die Schrittliste — Formular, Fortschritt und HR-Ansicht lesen nur den
 * Merker, sonst spraenge ein halb ausgefuelltes Formular.
 *
 * Die Einrichtungsart des Arbeitsorts laedt der Ausschnitt selbst (eine
 * Abfrage, nur wenn der Katalog aktive Positionen hat); der Aufrufer reicht nur
 * die Skalare des Vorgangs durch.
 */
export async function ausstattungAngebotenIn(db: Db, vorgang: AusschnittVorgang): Promise<boolean> {
  const { positionen } = await katalogAusschnittLaden(db, vorgang);
  return positionen.length > 0;
}
